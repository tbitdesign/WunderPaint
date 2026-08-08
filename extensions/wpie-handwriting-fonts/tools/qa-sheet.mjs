/**
 * Render the printable sheet and look at it.
 *
 * The sheet is the one artefact nobody sees until it comes out of a
 * printer, so it gets rendered here and checked twice: once by eye
 * through the screenshot, and once by measurement, because a mark that
 * has drifted off the grid corner would quietly ruin every photograph
 * taken of it.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { EDITOR } from '../../shared/qa-kit/stage.mjs';

const root = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..' );
const out = path.join( root, 'dist', 'sheet-stage' );
fs.rmSync( out, { recursive: true, force: true } );
fs.mkdirSync( out, { recursive: true } );

const esbuild = (
	await import(
		path.join( EDITOR, 'tools', 'template-generator', 'node_modules', 'esbuild', 'lib', 'main.js' )
	)
).default;

fs.writeFileSync(
	path.join( out, 'entry.js' ),
	`import { sheetLayout, drawSheet, SHEET } from '${ path.join( root, 'src/core/sheet.js' ) }';
import { ALL_KEYS, isMark, MARK_LABELS } from '${ path.join( root, 'src/core/charset.js' ) }';
import { DEFAULT_METRICS } from '${ path.join( root, 'src/core/metrics.js' ) }';
window.__sheet = { sheetLayout, drawSheet, SHEET, ALL_KEYS, isMark, MARK_LABELS, DEFAULT_METRICS };`
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
	'<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#666}canvas{display:block}</style></head><body><canvas id="c"></canvas><script src="bundle.js"></script></body></html>'
);

const req = createRequire( path.join( EDITOR, 'node_modules', 'x.js' ) );
const { chromium } = req( 'playwright' );
const browser = await chromium.launch( { args: [ '--no-sandbox' ] } );
const page = await browser.newPage( { viewport: { width: 1000, height: 1400 } } );
let failures = 0;
page.on( 'pageerror', ( e ) => {
	process.stderr.write( 'PAGEERROR: ' + e.message + '\n' );
	failures++;
} );
await page.goto( 'file://' + path.join( out, 'index.html' ) );

const info = await page.evaluate( () => {
	const { sheetLayout, drawSheet, SHEET, ALL_KEYS, isMark, MARK_LABELS, DEFAULT_METRICS } =
		window.__sheet;
	const pages = sheetLayout( ALL_KEYS );
	const dpi = 150;
	const canvas = document.getElementById( 'c' );
	canvas.width = Math.round( ( SHEET.pageW * dpi ) / 25.4 );
	canvas.height = Math.round( ( SHEET.pageH * dpi ) / 25.4 );
	drawSheet( canvas.getContext( '2d' ), pages[ 0 ], {
		dpi,
		metrics: DEFAULT_METRICS,
		labelFor: ( k ) => ( isMark( k ) ? MARK_LABELS[ k ] : k ),
		title: 'My Handwriting - write one character per box',
	} );
	return {
		pages: pages.length,
		cells: pages[ 0 ].cells.length,
		cols: pages[ 0 ].cols,
		rows: pages[ 0 ].rows,
		marks: pages[ 0 ].marks,
		frame: pages[ 0 ].frame,
		bounds: pages[ 0 ].bounds,
		total: ALL_KEYS.length,
	};
} );

const check = ( cond, msg ) => {
	process.stdout.write( ( cond ? 'ok   ' : 'FAIL ' ) + msg + '\n' );
	if ( ! cond ) {
		failures++;
	}
};

check( info.pages >= 1 && info.pages <= 3, `${ info.total } characters fit on ${ info.pages } page(s)` );
check( info.cells > 40, `${ info.cells } boxes on the first page (${ info.cols }x${ info.rows })` );
const f = info.frame;
const corners = [
	[ f.x, f.y ],
	[ f.x + f.w, f.y ],
	[ f.x + f.w, f.y + f.h ],
	[ f.x, f.y + f.h ],
];
check(
	info.marks.every(
		( m, i ) => Math.abs( m.x - corners[ i ][ 0 ] ) < 1e-9 && Math.abs( m.y - corners[ i ][ 1 ] ) < 1e-9
	),
	'the marks sit exactly on the frame corners'
);
check(
	info.bounds.x > f.x && info.bounds.x + info.bounds.w < f.x + f.w,
	'and the writing grid sits inside that frame'
);

await page.locator( '#c' ).screenshot( { path: path.join( root, 'dist', 'qa-sheet.png' ) } );
await browser.close();
process.exit( failures ? 1 : 0 );
