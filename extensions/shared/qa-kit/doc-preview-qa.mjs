/**
 * QA for the shared "Show document" (shared/doc-preview.js), per studio:
 *
 *   node extensions/shared/qa-kit/doc-preview-qa.mjs mockup
 *   node extensions/shared/qa-kit/doc-preview-qa.mjs solar
 *   node extensions/shared/qa-kit/doc-preview-qa.mjs earth   (any GENERIC key)
 *   node extensions/shared/qa-kit/doc-preview-qa.mjs earth new
 *
 * `new` opens the studio for a NEW layer with the background selected: the
 * editor inserts it right above the background, so the yellow box must
 * still be in front.
 *
 * One studio per run, never several at once: each run is a browser.
 * Studios that paint the document into their own canvas (Mystic,
 * Generative, Growth & Decay, Showcase) are not covered here.
 *
 * A document with a background, the studio's own layer (turned 10°) and a
 * yellow box above it. The layer is opened for editing, "Show document"
 * switched on, and the run checks that the yellow box lies in FRONT of
 * the preview (not behind it), and - for the mockup - that the scene
 * canvas sits where the layer sits in the document.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStage, launchQA } from './stage.mjs';

const here = path.dirname( fileURLToPath( import.meta.url ) );
const which = process.argv[ 2 ] || 'mockup';
const fresh = 'new' === process.argv[ 3 ];
const STUDIOS = {
	mockup: {
		root: path.resolve( here, '../../wpie-3d-mockup-studio' ),
		prefix: 'wpie3d',
		gen: 'wpie-3d-mockups/studio',
		params: {
			bakeFrame: { size: [ 2048, 2048 ], x: 624, y: 724, w: 800, h: 600 },
			// A saved artwork, as every inserted mockup carries one.
			source:
				'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
		},
		docBtn: '.wpie3d-docbtn',
		above: '.wpie3d-docpart.is-above',
		below: '.wpie3d-docpart:not(.is-above)',
	},
	solar: {
		root: path.resolve( here, '../../wpie-solar-system-studio' ),
		prefix: 'wpie-orr',
		gen: 'wpie-solar-system-studio/orrery',
		params: {},
		docBtn: '.wpie-orr-docbtn',
		above: '.wpie-orr-docabove',
		below: '.wpie-orr-frame',
	},
};
// Studios on the shared parts (docParts/placeAt): the button by its
// label, the parts by their shared classes. Extra launch args where the
// stage loads assets from file://.
const FILES = [ '--allow-file-access-from-files' ];
// Where a baked layer was cut from its render: studios that keep a trimmed
// bake in place only place layers that carry one.
const BAKED = { bakeFrame: { size: [ 2048, 2048 ], x: 624, y: 724, w: 800, h: 600 } };
const GENERIC = {
	earth: { dir: 'wpie-3d-earth-studio', prefix: 'wpiees', gen: 'wpie-3d-earth-studio/earth', args: FILES },
	// Show document is an overlay feature in Cinematic Effects. An edited
	// layer brings the mode along; a new effect starts as a background, so
	// the `new` run switches to Overlay first (`freshClick`).
	effects: { dir: 'wpie-3d-effects-studio', prefix: 'wpiefx3', gen: 'wpie-3d-effects-studio/effects', args: FILES, params: { mode: 'overlay' }, freshClick: 'Overlay' },
	gallery: { dir: 'wpie-3d-gallery-studio', prefix: 'wpiegal', gen: 'wpie-3d-gallery-studio/gallery', args: FILES, params: { ...BAKED, bakeZoom: 1 } },
	objects: { dir: 'wpie-3d-objects-studio', prefix: 'wpie3do', gen: 'wpie-3d-objects-studio/object', args: FILES, params: BAKED },
	pose: { dir: 'wpie-3d-pose-studio', prefix: 'wpiepose', gen: 'wpie-3d-pose-studio/pose', args: FILES },
	text: { dir: 'wpie-3d-text-studio', prefix: 'wpie3dt', gen: 'wpie-3d-text-studio/text', args: FILES, params: BAKED },
	city: { dir: 'wpie-city-diorama', prefix: 'wpiecd', gen: 'wpie-city-diorama/scene', args: FILES },
	molecule: { dir: 'wpie-molecule-studio', prefix: 'wpie-mol', gen: 'wpie-molecule-studio/molecule', args: FILES, params: BAKED },
	marbling: { dir: 'wpie-marbling-studio', prefix: 'wpiemb', gen: 'wpie-marbling-studio/marbling' },
	dayring: { dir: 'wpie-day-ring', prefix: 'wpie-dr', gen: 'wpie-day-ring/ring' },
	synth: { dir: 'wpie-image-synth', prefix: 'wpiesyn', gen: 'wpie-image-synth/chain' },
	particles: { dir: 'wpie-particle-studio', prefix: 'wpieps', gen: 'wpie-particle-studio/particles', args: FILES },
	strokes: { dir: 'wpie-particle-strokes', prefix: 'wpiepst', gen: 'wpie-particle-strokes/strokes' },
	typeflow: { dir: 'wpie-type-flow-studio', prefix: 'wpietf', gen: 'wpie-type-flow-studio/flow', args: FILES },
	math: { dir: 'wpie-math-figures', prefix: 'wpiemf', gen: 'wpie-math-figures/figure' },
	sheet: { dir: 'wpie-sheet-music', prefix: 'wpiesm', gen: 'wpie-sheet-music/sheet' },
	party: { dir: 'wpie-party-printables', prefix: 'wpiepty', gen: 'wpie-party-printables/sheet' },
};
for ( const [ key, g ] of Object.entries( GENERIC ) ) {
	STUDIOS[ key ] = {
		root: path.resolve( here, '../..', g.dir ),
		prefix: g.prefix,
		gen: g.gen,
		params: g.params || {},
		args: g.args || [],
		freshClick: g.freshClick || null,
		generic: true,
		above: '.wpie-docpart.is-above',
		below: '.wpie-docpart:not(.is-above)',
	};
}
const S = STUDIOS[ which ];
const LAYER = { x: 500, y: 300, w: 400, h: 300, rot: 10 };
const setup = path.join( fs.mkdtempSync( path.join( os.tmpdir(), 'wpie-docqa-' ) ), 'setup.js' );
fs.writeFileSync(
	setup,
	`window.__wpieQA = true;
const px = document.createElement( 'canvas' );
px.width = 8; px.height = 6;
const pg = px.getContext( '2d' ); pg.fillStyle = '#8899aa'; pg.fillRect( 0, 0, 8, 6 );
window.__installWpieMock( {
	iconClassPrefix: ${ JSON.stringify( S.prefix ) },
	doc: { w: 1600, h: 1000 },
	autoRun: false,
	patch: ( WPIE, editor ) => {
		const base = { visible: true, opacity: 1, blend: 'normal', rot: 0 };
		editor.state.layers = [
			{ ...base, id: 'l-bg', type: 'shape', name: 'Back', shape: 'rect', fill: '#2a4d3a', x: 0, y: 0, w: 1600, h: 1000 },
			{ ...base, id: 'l-gen', type: 'image', name: 'Own', src: px.toDataURL(), naturalW: 800, naturalH: 600,
				x: ${ LAYER.x }, y: ${ LAYER.y }, w: ${ LAYER.w }, h: ${ LAYER.h }, rot: ${ LAYER.rot },
				generator: { id: ${ JSON.stringify( S.gen ) }, params: ${ JSON.stringify( S.params ) } } },
			{ ...base, id: 'l-top', type: 'shape', name: 'Box', shape: 'rect', fill: '#ffd400', x: 600, y: 400, w: 200, h: 100 },
		];
		editor.state.activeId = ${ JSON.stringify( fresh ? 'l-bg' : 'l-gen' ) };
		editor.state.selectedIds = [ editor.state.activeId ];
	},
} );
window.addEventListener( 'load', () => { window.__dialogReady = true; } );
`
);
const stage = await buildStage( { root: S.root, setup, out: path.join( S.root, 'dist', 'qa-docpreview' ) } );
const qa = await launchQA( {
	stage,
	locale: 'en_US',
	viewport: { width: 1500, height: 1000 },
	args: S.args || [],
} );
const { page, check, note } = qa;

await page.evaluate( ( fresh ) => {
	const layer = window.__editor.state.layers.find( ( l ) => 'l-gen' === l.id );
	window.__toasts = [];
	const say = ( m ) => window.__toasts.push( String( m ) );
	window.__genKeys = Object.keys( window.__gen || {} );
	const extras = { toasts: { error: say, success: say, toast: say } };
	Promise.resolve(
		fresh
			? window.__gen.run( { editor: window.__editor, extras } )
			: window.__gen.edit( { editor: window.__editor, layer, extras } )
	).catch( ( e ) => say( 'threw: ' + ( e && e.stack ? e.stack.slice( 0, 300 ) : e ) ) );
}, fresh );
await page.waitForTimeout( 4000 );
note(
	'state ' +
		JSON.stringify(
			await page.evaluate( ( sel ) => {
				const b = sel
					? document.querySelector( sel )
					: [ ...document.querySelectorAll( 'button' ) ].find( ( x ) => /Show document/.test( x.textContent ) );
				return {
					btn: !! b,
					display: b && b.style.display,
					dialog: ( document.querySelector( '.dsm' )?.innerText || '' ).slice( 0, 200 ),
					toasts: window.__toasts,
					keys: window.__genKeys,
				};
			}, S.docBtn || null )
		)
);
if ( fresh && S.freshClick ) {
	// A new layer starts on the studio's defaults (or the mode the studio
	// remembered); some studios offer Show document only in one mode, so
	// the run makes sure that mode is on. An already active mode button is
	// left alone - clicking it again is not a no-op everywhere.
	const picked = await page.evaluate( ( label ) => {
		const b = [ ...document.querySelectorAll( 'button' ) ].find(
			( x ) => x.offsetParent && label === x.textContent.trim()
		);
		if ( ! b ) {
			return 'missing';
		}
		if ( b.classList.contains( 'active' ) ) {
			return 'already';
		}
		b.click();
		return 'clicked';
	}, S.freshClick );
	note( 'mode ' + S.freshClick + ': ' + picked );
	await page.waitForTimeout( 800 );
}
const docBtn = S.docBtn
	? page.locator( S.docBtn )
	: page.locator( 'button', { hasText: 'Show document' } ).first();
await docBtn.waitFor( { timeout: 30000 } );
await page.waitForTimeout( 1500 );
if ( 'true' !== ( await docBtn.getAttribute( 'aria-pressed' ) ) ) {
	await docBtn.click();
}
await page.waitForFunction(
	( sel ) => {
		const el = document.querySelector( sel );
		return el && ! el.hidden && 'none' !== el.style.display && /url\(/.test( el.style.backgroundImage );
	},
	S.above,
	{ timeout: 30000 }
);
await page.waitForTimeout( 800 );

const r = await page.evaluate( async ( { S, LAYER, which, fresh } ) => {
	const bgUrl = ( el ) => ( /url\("?(.*?)"?\)$/.exec( el.style.backgroundImage ) || [] )[ 1 ];
	const load = ( src ) =>
		new Promise( ( res ) => {
			const im = new Image();
			im.onload = () => {
				const c = document.createElement( 'canvas' );
				c.width = im.width;
				c.height = im.height;
				const g = c.getContext( '2d' );
				g.drawImage( im, 0, 0 );
				res( g.getImageData( 0, 0, c.width, c.height ) );
			};
			im.src = src;
		} );
	const yellow = ( img ) => {
		let n = 0;
		for ( let i = 0; i < img.data.length; i += 4 ) {
			const [ rr, gg, bb, aa ] = [ img.data[ i ], img.data[ i + 1 ], img.data[ i + 2 ], img.data[ i + 3 ] ];
			if ( aa > 200 && rr > 220 && gg > 180 && bb < 80 ) n++;
		}
		return n / ( img.width * img.height );
	};
	const above = await load( bgUrl( document.querySelector( S.above ) ) );
	const below = await load( bgUrl( document.querySelector( S.below ) ) );
	const out = { yellowAbove: yellow( above ), yellowBelow: yellow( below ) };
	const placed = document.querySelector( '[data-wpie-placed]' );
	if ( placed && S.generic && ! fresh ) {
		const host = placed.parentElement;
		const k = Math.min( ( host.clientWidth - 16 ) / 1600, ( host.clientHeight - 16 ) / 1000 );
		const ox = ( host.clientWidth - 1600 * k ) / 2,
			oy = ( host.clientHeight - 1000 * k ) / 2;
		const f = S.params.bakeFrame || { size: [ LAYER.w, LAYER.h ], x: 0, y: 0, w: LAYER.w, h: LAYER.h };
		const sx = LAYER.w / f.w,
			sy = LAYER.h / f.h;
		const want = {
			left: ox + ( LAYER.x - f.x * sx ) * k,
			top: oy + ( LAYER.y - f.y * sy ) * k,
			width: f.size[ 0 ] * sx * k,
			height: f.size[ 1 ] * sy * k,
		};
		const got = {
			left: parseFloat( placed.style.left ),
			top: parseFloat( placed.style.top ),
			width: parseFloat( placed.style.width ),
			height: parseFloat( placed.style.height ),
		};
		out.place = { want, got, transform: placed.style.transform, position: placed.style.position };
		out.placeErr = Math.max( ...Object.keys( want ).map( ( key ) => Math.abs( want[ key ] - got[ key ] ) ) );
	}
	if ( 'mockup' === which && ! fresh ) {
		const view = document.querySelector( '.wpie3d-view' );
		const canvas = view.querySelector( 'canvas' );
		const vw = view.clientWidth,
			vh = view.clientHeight;
		const k = Math.min( ( vw - 16 ) / 1600, ( vh - 16 ) / 1000 );
		const ox = ( vw - 1600 * k ) / 2,
			oy = ( vh - 1000 * k ) / 2;
		const f = S.params.bakeFrame;
		const sx = LAYER.w / f.w,
			sy = LAYER.h / f.h;
		const want = {
			left: ox + ( LAYER.x - f.x * sx ) * k,
			top: oy + ( LAYER.y - f.y * sy ) * k,
			width: f.size[ 0 ] * sx * k,
			height: f.size[ 1 ] * sy * k,
		};
		const got = {
			left: parseFloat( canvas.style.left ),
			top: parseFloat( canvas.style.top ),
			width: parseFloat( canvas.style.width ),
			height: parseFloat( canvas.style.height ),
		};
		out.place = { want, got, transform: canvas.style.transform, position: canvas.style.position };
		out.placeErr = Math.max( ...Object.keys( want ).map( ( key ) => Math.abs( want[ key ] - got[ key ] ) ) );
	}
	return out;
}, { S, LAYER, which, fresh } );

note( which + ' ' + JSON.stringify( r ) );
check( r.yellowAbove > 0.001, 'the box above the layer is in the front image' );
check( r.yellowBelow < 0.0001, 'and not in the image behind the preview' );
if ( r.place ) {
	check( 'absolute' === r.place.position, 'the preview is placed in the document' );
	check( r.placeErr < 1.5, 'at the layer’s place and size (off by ' + r.placeErr.toFixed( 2 ) + ' px)' );
	check( /rotate\(10deg\)/.test( r.place.transform ), 'turned like the layer' );
}
await qa.shot( 'qa-docpreview-' + which + ( fresh ? '-new' : '' ) + '.png' );
const code = await qa.finish();
// The setup file's folder is this run's own; doc-preview-all.mjs runs this
// script 38 times in a row, and the folders used to stay behind in /tmp.
fs.rmSync( path.dirname( setup ), { recursive: true, force: true } );
process.exit( code );
