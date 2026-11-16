/** Focused dialog QA. Uses the real UI kit and a mocked editor boundary. */
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createCanvas } from 'canvas';
import { launchQA } from '../../shared/qa-kit/stage.mjs';
import { build } from 'esbuild';
const root = path.resolve(
	path.dirname( fileURLToPath( import.meta.url ) ),
	'..'
);
const processes = execFileSync( 'ps', [ '-eo', 'args=' ], {
	encoding: 'utf8',
} );
if (
	processes
		.split( '\n' )
		.some( ( p ) =>
			/^\S*(?:chrome-headless-shell|headless_shell|chromium)(?:\s|$)/.test(
				p.trim()
			)
		)
) {
	console.log(
		'SKIP: another headless browser is active; no second browser started.'
	);
	process.exit( 2 );
}
// A tonal fixture with highlights, deep shadows, smooth shading and a word.
// A supplied photo may replace it for the visual contact sheet.
const fixture = createCanvas( 700, 700 );
const g = fixture.getContext( '2d' );
g.fillStyle = '#fff';
g.fillRect( 0, 0, 700, 700 );
const gradient = g.createRadialGradient( 270, 245, 30, 330, 290, 220 );
gradient.addColorStop( 0, '#ddd' );
gradient.addColorStop( 0.5, '#888' );
gradient.addColorStop( 1, '#111' );
g.fillStyle = gradient;
g.beginPath();
g.ellipse( 350, 300, 180, 230, -0.2, 0, Math.PI * 2 );
g.fill();
g.fillStyle = '#111';
g.font = 'bold 108px sans-serif';
g.textAlign = 'center';
g.fillText( 'LINE ART', 350, 655 );
g.strokeStyle = '#fff';
g.lineWidth = 15;
g.beginPath();
g.moveTo( 265, 260 );
g.lineTo( 320, 253 );
g.moveTo( 375, 246 );
g.lineTo( 430, 240 );
g.stroke();
g.beginPath();
g.arc( 350, 340, 55, 0.2, Math.PI - 0.2 );
g.stroke();
const photoPath = process.env.WPIE_LINE_PHOTO;
const dataURL = photoPath
	? 'data:image/jpeg;base64,' +
	  fs.readFileSync( photoPath ).toString( 'base64' )
	: fixture.toDataURL();
// The shared stage's no-op WordPress element stub lacks the current hooks.
// Use the same bridge mock with the real local React dependencies instead.
const repo = path.resolve( root, '../..' );
const stage = path.join( root, 'dist/qa-continuous-stage' );
fs.mkdirSync( stage, { recursive: true } );
await build( {
	entryPoints: [
		path.join( repo, 'extensions/shared/qa-kit/mock-entry.js' ),
	],
	outfile: path.join( stage, 'mock.js' ),
	bundle: true,
	format: 'iife',
	jsx: 'automatic',
	nodePaths: [ path.join( repo, 'node_modules' ) ],
	alias: { '@ed': path.join( repo, 'src' ) },
	define: { 'process.env.NODE_ENV': '"production"' },
	loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'file' },
} );
for ( const name of [ 'extension.js', 'style.css' ] )
	fs.copyFileSync( path.join( root, name ), path.join( stage, name ) );
fs.copyFileSync(
	path.join( root, 'tools/preview/setup.js' ),
	path.join( stage, 'setup.js' )
);
fs.copyFileSync(
	path.join( repo, 'build/index.css' ),
	path.join( stage, 'editor.css' )
);
fs.writeFileSync(
	path.join( stage, 'index.html' ),
	'<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><link rel="stylesheet" href="editor.css"><link rel="stylesheet" href="style.css"><style>html,body{height:100%;margin:0}#wpie-root{position:fixed;inset:0}</style></head><body><div id="wpie-root" data-theme="dark"></div><script src="mock.js"></script><script src="setup.js"></script><script src="extension.js"></script></body></html>'
);
const qa = await launchQA( {
	stage,
	locale: 'en_US',
	shotDir: path.join( root, 'dist' ),
} );
const { page, check } = qa;
page.setDefaultTimeout( 12000 );
const settle = async () => {
	await page.waitForTimeout( 700 );
	await page.waitForFunction(
		() => ! document.querySelector( '.wpieta-status.on' ),
		null,
		{ timeout: 25000 }
	);
};
const snapshot = () =>
	page.evaluate( () => {
		const c = window.__ta.canvas;
		const d = c
			.getContext( '2d' )
			.getImageData( 0, 0, c.width, c.height ).data;
		let ink = 0;
		for ( let i = 0; i < d.length; i += 4 ) if ( d[ i ] < 150 ) ink++;
		return { data: c.toDataURL(), ink: ink / ( c.width * c.height ) };
	} );
let exitCode = 1;
try {
	await page.evaluate( async ( url ) => {
		Object.assign( window.__ta.params, {
			background: 'light',
			image: { url, title: 'Line-art QA source' },
		} );
		await window.__ta.source( 'media' );
		window.__ta.pick( 'oneline' );
	}, dataURL );
	await settle();
	check(
		( await page.locator( '[data-line-style]' ).count() ) === 6,
		'six preview cards'
	);
	const signatures = new Set();
	for ( const style of [
		'spiral',
		'spiral-wave',
		'sweep',
		'wave',
		'maze',
		'tour',
	] ) {
		await page.locator( '[data-line-style="' + style + '"]' ).click();
		await settle();
		const shot = await snapshot();
		signatures.add( shot.data );
		check(
			shot.ink > 0.02 && shot.ink < 0.95,
			style +
				' renders recognizable tonal coverage (' +
				Math.round( shot.ink * 100 ) +
				'%)'
		);
		fs.writeFileSync(
			path.join( root, 'dist', 'line-' + style + '.png' ),
			Buffer.from( shot.data.split( ',' )[ 1 ], 'base64' )
		);
		check(
			( await page
				.locator( '[data-line-style="' + style + '"]' )
				.getAttribute( 'aria-pressed' ) ) === 'true',
			style + ' has the selected outline'
		);
	}
	check( signatures.size === 6, 'six distinct rendered variants' );
	await page.locator( '[data-line-style="spiral-wave"]' ).click();
	await settle();
	const before = ( await snapshot() ).data;
	await page.locator( '[data-line-control="oneWave"] input' ).fill( '0' );
	await settle();
	check(
		( await snapshot() ).data !== before,
		'wave-height slider updates the preview'
	);
	for ( const theme of [ 'dark', 'light' ] ) {
		await page.evaluate( ( theme ) => {
			document.documentElement.dataset.theme = theme;
			document.getElementById( 'wpie-root' ).dataset.theme = theme;
		}, theme );
		await page.waitForTimeout( 300 );
		const state = await page.evaluate( () => {
			const side = document.querySelector( '.wpieta-side' );
			const card = document.querySelector(
				'.wpieta-line-styles [aria-pressed="true"]'
			);
			const css = getComputedStyle( card );
			return {
				overflow: side.scrollWidth > side.clientWidth + 1,
				border: css.borderTopWidth,
				background: css.backgroundColor,
				color: css.color,
			};
		} );
		check(
			! state.overflow &&
				state.border === '1px' &&
				state.background === 'rgba(0, 0, 0, 0)',
			theme +
				': no horizontal overflow; selected card has only a 1px outline (' +
				state.color +
				')'
		);
		check( state.color === ( theme === 'dark' ? 'rgb(243, 245, 247)' : 'rgb(26, 29, 33)' ), theme + ': selected label follows the theme text color' );
		await qa.shot( 'qa-continuous-' + theme + '.png' );
	}
	await page.setViewportSize( { width: 1050, height: 800 } );
	await settle();
	check(
		await page.evaluate( () => {
			const side = document.querySelector( '.wpieta-side' );
			return side.scrollWidth <= side.clientWidth + 1;
		} ),
		'1050px window: settings stay inside the panel'
	);
	await page.setViewportSize( { width: 1500, height: 1000 } );
	await page.locator( '[data-line-style="maze"]' ).click();
	await settle();
	await page.evaluate( () => {
		window.__dispatched.length = 0;
	} );
	await page.locator( '.dsm-actions .ai-btn.primary' ).click();
	const result = await page.evaluate( () => {
		const added = window.__dispatched.find(
			( a ) => a.type === 'ADD_LAYER'
		)?.layer;
		window.__lineAdded = added;
		return (
			added && {
				type: added.type,
				mode: added.generator.params.oneLine,
				d: added.pathD,
				w: added.w,
				h: added.h,
			}
		);
	} );
	check(
		result?.type === 'shape' &&
			result.mode === 'maze' &&
			result.d.length > 10000,
		'Insert creates an editable vector layer with its line recipe'
	);
	await page.evaluate( () =>
		window.__gen.edit( {
			editor: window.__editor,
			extras: {},
			layer: window.__lineAdded,
		} )
	);
	await settle();
	check(
		( await page
			.locator( '[data-line-style="maze"]' )
			.getAttribute( 'aria-pressed' ) ) === 'true',
		'reopening restores the labyrinth card'
	);
	await page.locator( '.dsm-x' ).click();
	await page.evaluate( () => {
		const old = structuredClone( window.__lineAdded );
		for ( const key of Object.keys( old.generator.params ) )
			if ( key.startsWith( 'one' ) ) delete old.generator.params[ key ];
		window.__gen.edit( {
			editor: window.__editor,
			extras: {},
			layer: old,
		} );
	} );
	await settle();
	check(
		( await page
			.locator( '[data-line-style="tour"]' )
			.getAttribute( 'aria-pressed' ) ) === 'true',
		'old recipe reopens as the existing free line'
	);
	exitCode = qa.failures() ? 1 : 0;
} finally {
	await qa.finish();
}
process.exitCode = exitCode;
