// A proof sheet of the CORE wet islands (liquid, paste, dry) driven the way
// Chaos Art will drive them: strokes stamped segment by segment into the
// grid, the physics stepped, everything dried, rendered over paper.
// Headless chromium with SwiftShader - WebGL2 float on the CPU, slow but
// honest. Usage: node tools/proof-wet.mjs <out-dir>
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = path.dirname( fileURLToPath( import.meta.url ) );
const ext = path.resolve( here, '..' );
const plugin = path.resolve( ext, '..', '..' );
const outDir = process.argv[ 2 ] || path.join( ext, 'dist', 'proof-wet' );
fs.mkdirSync( outDir, { recursive: true } );
const req = createRequire( path.join( plugin, 'node_modules', 'x.js' ) );

const entry = path.join( outDir, 'entry.mjs' );
fs.writeFileSync(
	entry,
	`import { paintKit } from '${ path.join( plugin, 'src/lib/paint-kit.js' ) }';
import { handPath } from '${ path.join( ext, 'src/flat/hand.js' ) }';
import { drawMotif } from '${ path.join( ext, 'src/core/gestures.js' ) }';
import { makeRng } from '${ path.join( ext, 'src/core/rng.js' ) }';
window.__kit = paintKit;
window.__hand = { handPath, drawMotif, makeRng };`
);
const bundle = path.join( outDir, 'bundle.js' );
await build( { entryPoints: [ entry ], bundle: true, platform: 'browser', format: 'iife', outfile: bundle, logLevel: 'error', define: { 'process.env.NODE_ENV': '"production"' } } );

const html = path.join( outDir, 'proof.html' );
fs.writeFileSync( html, `<!doctype html><html><head><meta charset="utf-8"><title>wet proof</title></head><body style="margin:0;background:#333">
<canvas id="out" width="640" height="430"></canvas>
<script src="file://${ bundle }"></script>
<script>
window.__proof = function ( styleId, seedWords ) {
	const kit = window.__kit;
	const { handPath, drawMotif, makeRng } = window.__hand;
	const W = 640, H = 430, SC = kit.wet.SC;
	const rng = makeRng( seedWords );
	const family = kit.wet.FAMILY_OF[ styleId ];
	const island = 'liquid' === family ? kit.wet.createLiquid() : 'paste' === family ? kit.wet.createPaste() : kit.wet.createDry();
	if ( island.setPaper ) island.setPaper( kit.wet.PAPERS[ 'paste' === family ? 'canvas' : 'cold-press' ] );
	island.setGround && island.setGround( null );
	island.ensure( { x: 0, y: 0, w: W, h: H } );
	const preset = kit.wet.WET_STYLES[ styleId ];
	const tune = kit.wet.tuned( styleId, {} );
	const heads = kit.tips.STYLE_BRUSHES[ styleId ] || [ 'round' ];
	const palette = {
		watercolour: [ '#2a4d9c', '#e3b23c', '#b83b2e', '#3f7d5a' ], water: [ '#2a4d9c' ], ink: [ '#16161c', '#16161c', '#8a2a1e' ],
		gouache: [ '#d94f3a', '#f2d24e', '#2e5d9e', '#f2ede0' ], acrylic: [ '#1f3f8f', '#f0b429', '#ffffff', '#c3262d' ],
		oil: [ '#d8c27a', '#7a3a2b', '#2f4a7a', '#efe6cf' ], smudge: [ '#2a4d9c', '#e3b23c' ], charcoal: [ '#1a1a1a' ], pastel: [ '#f2c27b', '#8ec7d2', '#e88aa3', '#f7f3e8' ],
	}[ styleId ];
	const ground = { watercolour: '#f3eee2', water: '#f3eee2', ink: '#f4efe4', gouache: '#e9e2d2', acrylic: '#d8d3c7', oil: '#5b5347', smudge: '#efe9dc', charcoal: '#efe9dc', pastel: '#5e6470' }[ styleId ];
	const scratch = document.createElement( 'canvas' );
	const stampSeg = ( a, b, stroke ) => {
		const reach = kit.tips.stampMaxReach( stroke.tip, stroke.size, stroke ) + 2;
		const x0 = Math.min( a.x, b.x ) - reach, y0 = Math.min( a.y, b.y ) - reach;
		const x1 = Math.max( a.x, b.x ) + reach, y1 = Math.max( a.y, b.y ) + reach;
		const gx = Math.floor( x0 / SC ), gy = Math.floor( y0 / SC );
		const gw = Math.ceil( ( x1 - x0 ) / SC ) + 1, gh = Math.ceil( ( y1 - y0 ) / SC ) + 1;
		if ( scratch.width < gw || scratch.height < gh ) { scratch.width = Math.max( scratch.width, gw ); scratch.height = Math.max( scratch.height, gh ); }
		const ctx = scratch.getContext( '2d', { willReadFrequently: true } );
		ctx.setTransform( 1, 0, 0, 1, 0, 0 ); ctx.clearRect( 0, 0, gw, gh );
		ctx.setTransform( 1 / SC, 0, 0, 1 / SC, -gx, -gy );
		if ( 'paste' === family ) { const dl = Math.hypot( b.x - a.x, b.y - a.y ); island.setParams( dl > 0.5 ? { advX: ( b.x - a.x ) / dl, advY: ( b.y - a.y ) / dl } : { advX: 0, advY: 0 } ); }
		kit.drawStroke( ctx, { d: 'M ' + a.x + ' ' + a.y + ' L ' + b.x + ' ' + b.y, pts: [ a, b ], color: '#000000', size: stroke.size, opacity: 1, flow: 1, tip: stroke.tip }, stroke.hardness );
		const img = ctx.getImageData( 0, 0, gw, gh );
		const alpha = new Float32Array( gw * gh );
		for ( let i = 0; i < gw * gh; i++ ) alpha[ i ] = img.data[ i * 4 + 3 ] / 255;
		island.stamp( { data: alpha, w: gw, h: gh, gx, gy }, stroke );
	};
	const strokes = 'water' === styleId ? 4 : 9;
	const kinds = [ 'arc', 'scurve', 'slash', 'hook', 'zigzag', 'arc', 'loop', 'slash', 'blob' ];
	for ( let i = 0; i < strokes; i++ ) {
		const hex = palette[ i % palette.length ];
		const size = ( { watercolour: 34, water: 40, ink: 22, gouache: 36, acrylic: 40, oil: 44, smudge: 40, charcoal: 30, pastel: 34 } )[ styleId ] * ( 0.7 + rng() * 0.7 );
		const stroke = { family, press: 1, tilt: 0, tip: heads[ i % heads.length ], size, hardness: 85, docW: W, docH: H, gran: tune.gran };
		const flow = 0.6 + rng() * 0.4, opac = 0.7 + rng() * 0.3;
		if ( 'liquid' === family ) {
			stroke.water = ( preset.water[ 0 ] + preset.water[ 1 ] * flow ) * tune.waterMul;
			stroke.pigment = preset.pigment * opac * tune.pigMul;
			Object.assign( stroke, kit.wet.pigmentOf( hex, tune.sBase, preset.kMul ) );
			island.setParams( { evapK: tune.evapK, sogK: tune.sogK, korn: tune.korn, depK: tune.depK, liftK: tune.liftK, viscK: tune.visc, seedK: tune.seedK ?? 0 } );
		} else if ( 'paste' === family ) {
			stroke.water = ( preset.thick[ 0 ] + preset.thick[ 1 ] * flow ) * tune.waterMul;
			stroke.pigment = preset.pigRate * opac;
			Object.assign( stroke, kit.wet.pigmentOf( hex, tune.sBase, preset.kMul ) );
			island.setParams( { openK: tune.openK, blendK: tune.blendK, body: preset.body, gloss: preset.gloss, korn: tune.korn, pickK: tune.pickK ?? 0, advK: tune.advK ?? 0 } );
		} else {
			stroke.water = 0;
			stroke.pigment = preset.amt * opac * tune.pigMul;
			Object.assign( stroke, kit.wet.pigmentOf( hex, 0, preset.kMul ) );
			island.setParams( { tooth: tune.tooth } );
		}
		island.strokeBegin && island.strokeBegin();
		const m = drawMotif( rng, [ kinds[ i % kinds.length ] ] );
		const at = [ 80 + rng() * ( W - 160 ), 70 + rng() * ( H - 140 ) ];
		const pts = handPath( m, { at: [ at[ 0 ] / H, at[ 1 ] / H ], angle: ( rng() - 0.5 ) * 1.4, scale: ( 70 + rng() * 120 ) / H, width: size / H, rng, tremor: 0.3, haste: 0.5, steps: 40 } ).map( ( p ) => ( { x: p.x * H, y: p.y * H } ) );
		for ( let k = 1; k < pts.length; k++ ) stampSeg( pts[ k - 1 ], pts[ k ], stroke );
		island.strokeEnd && island.strokeEnd();
		// Time passes between strokes: the wash moves and part-dries.
		for ( let s = 0; s < 6; s++ ) island.steps( 40 );
	}
	for ( let s = 0; s < 30; s++ ) island.steps( 60 );
	island.dryAll(); island.render();
	const out = document.getElementById( 'out' );
	const g = out.getContext( '2d' );
	g.fillStyle = ground; g.fillRect( 0, 0, W, H );
	g.drawImage( island.canvas, island.rx * SC, island.ry * SC );
	g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect( 0, H - 26, 220, 26 ); g.fillStyle = '#fff'; g.font = '15px sans-serif';
	g.fillText( styleId + ' (' + family + ')  ·  ' + heads.join( ' / ' ), 8, H - 8 );
	const url = out.toDataURL( 'image/png' );
	island.reset && island.reset();
	return url;
};
</script></body></html>` );

const { chromium } = req( 'playwright-core' );
const EXE = process.env.HOME + '/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome';
const browser = await chromium.launch( { executablePath: EXE, args: [ '--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl' ] } );
const page = await browser.newPage( { viewport: { width: 700, height: 500 } } );
const errors = [];
page.on( 'pageerror', ( e ) => errors.push( e.message ) );
page.on( 'console', ( m ) => { if ( 'error' === m.type() ) errors.push( m.text().slice( 0, 200 ) ); } );
await page.goto( 'file://' + html );
const avail = await page.evaluate( () => window.__kit.wet.available() );
console.log( 'wet GL available:', avail );
const files = [];
if ( avail ) {
	const media = [ 'watercolour', 'ink', 'gouache', 'acrylic', 'oil', 'charcoal', 'pastel', 'water' ];
	for ( const [ i, m ] of media.entries() ) {
		const t0 = Date.now();
		const url = await page.evaluate( ( [ id, s ] ) => window.__proof( id, [ 5 + s, 9, 13 ] ), [ m, i ] ).catch( ( e ) => { errors.push( m + ': ' + e.message ); return null; } );
		if ( url ) {
			const f = path.join( outDir, m + '.png' );
			fs.writeFileSync( f, Buffer.from( url.split( ',' )[ 1 ], 'base64' ) );
			files.push( f );
		}
		console.log( m, Date.now() - t0, 'ms' );
	}
}
await browser.close();
if ( files.length ) {
	const sharp = req( 'sharp' );
	const W = 640, H = 430, COLS = 2;
	const rows = Math.ceil( files.length / COLS );
	const tiles = [];
	for ( const [ i, f ] of files.entries() ) {
		tiles.push( { input: f, left: ( i % COLS ) * ( W + 8 ), top: Math.floor( i / COLS ) * ( H + 8 ) } );
	}
	await sharp( { create: { width: COLS * ( W + 8 ), height: rows * ( H + 8 ), channels: 3, background: '#222' } } ).composite( tiles ).png().toFile( path.join( outDir, 'sheet.png' ) );
	console.log( 'sheet', path.join( outDir, 'sheet.png' ) );
}
console.log( 'errors', errors.slice( 0, 6 ) );
