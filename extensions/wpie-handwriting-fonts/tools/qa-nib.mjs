/**
 * What the nib actually does to a word.
 *
 * The unit tests prove the ink is the shape it was asked for. Whether
 * that reads as calligraphy is a question only eyes answer, so the same
 * letters are rendered with a round pen and with a chisel at several
 * angles, side by side.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { EDITOR } from '../../shared/qa-kit/stage.mjs';

const root = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..' );
const out = path.join( root, 'dist', 'nib' );
fs.rmSync( out, { recursive: true, force: true } );
fs.mkdirSync( out, { recursive: true } );

const esbuild = (
	await import(
		path.join( EDITOR, 'tools', 'template-generator', 'node_modules', 'esbuild', 'lib', 'main.js' )
	)
).default;
fs.writeFileSync(
	path.join( out, 'entry.js' ),
	`import { sampleProject } from '${ path.join( root, 'tools/sample-project.mjs' ) }';
import { OutlineCache, paintText } from '${ path.join( root, 'src/ui/paint.js' ) }';
window.__m = { sampleProject, OutlineCache, paintText };`
);
await esbuild.build( {
	entryPoints: [ path.join( out, 'entry.js' ) ],
	bundle: true,
	format: 'iife',
	outfile: path.join( out, 'bundle.js' ),
	logLevel: 'warning',
} );
fs.writeFileSync(
	path.join( out, 'index.html' ),
	'<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#fff}</style></head><body><canvas id="c" width="1160" height="560"></canvas><script src="bundle.js"></script></body></html>'
);

const req = createRequire( path.join( EDITOR, 'node_modules', 'x.js' ) );
const { chromium } = req( 'playwright' );
const browser = await chromium.launch( { args: [ '--no-sandbox' ] } );
const page = await browser.newPage( { viewport: { width: 1180, height: 600 } } );
page.on( 'pageerror', ( e ) => process.stderr.write( 'PAGEERROR: ' + e.message + '\n' ) );
await page.goto( 'file://' + path.join( out, 'index.html' ) );

const timings = await page.evaluate( () => {
	const { sampleProject, OutlineCache, paintText } = window.__m;
	const g = document.getElementById( 'c' ).getContext( '2d' );
	g.fillStyle = '#fff';
	g.fillRect( 0, 0, 1160, 560 );
	g.fillStyle = '#111';
	g.font = '13px sans-serif';

	const rows = [
		[ 'round pen', { angle: 0, ratio: 1 } ],
		[ 'chisel, 30 degrees', { angle: 30, ratio: 0.28 } ],
		[ 'chisel, 45 degrees', { angle: 45, ratio: 0.22 } ],
		[ 'chisel, 0 degrees (flat)', { angle: 0, ratio: 0.3 } ],
		[ 'chisel, 75 degrees (upright)', { angle: 75, ratio: 0.3 } ],
	];
	const out = [];
	rows.forEach( ( [ label, nib ], i ) => {
		const project = sampleProject( 'Nib' );
		project.options.nib = nib;
		project.options.pen = 78;
		const cache = new OutlineCache();
		const y = 96 + i * 104;
		g.fillStyle = '#666';
		g.fillText( label, 12, y - 54 );
		const t0 = performance.now();
		paintText( g, project, 'Hamburgefonstiv', {
			cache,
			size: 74,
			x: 14,
			y,
			color: '#111',
			maxWidth: 1130,
		} );
		out.push( `${ label }: ${ ( performance.now() - t0 ).toFixed( 0 ) } ms` );
	} );
	return out;
} );

timings.forEach( ( l ) => process.stdout.write( l + '\n' ) );
await page.locator( '#c' ).screenshot( { path: path.join( root, 'dist', 'qa-nib.png' ) } );
await browser.close();
