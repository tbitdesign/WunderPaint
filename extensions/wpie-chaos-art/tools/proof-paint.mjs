// A proof sheet of the CORE paint engine driven the way Chaos Art will
// drive it: gestures from the hand module, media brushes from the kit,
// the style pass laid over what is already there. node-canvas, no GPU.
// Usage: node tools/proof-paint.mjs <out.png>
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = path.dirname( fileURLToPath( import.meta.url ) );
const ext = path.resolve( here, '..' );
const plugin = path.resolve( ext, '..', '..' );
const out = process.argv[ 2 ] || path.join( ext, 'dist', 'proof-paint.png' );
const req = createRequire( path.join( plugin, 'node_modules', 'x.js' ) );
const { createCanvas } = req( 'canvas' );

// The core modules use extensionless imports and a CJS i18n package:
// bundle a small node entry with esbuild rather than teaching node the
// editor's module conventions.
const entry = path.join( ext, 'dist', 'proof-paint-entry.mjs' );
fs.mkdirSync( path.dirname( entry ), { recursive: true } );
fs.writeFileSync(
	entry,
	`import { paintKit } from '${ path.join( plugin, 'src/lib/paint-kit.js' ) }';
import { setCanvasFactory } from '${ path.join( plugin, 'src/lib/raster/env.js' ) }';
import { handPath } from '${ path.join( ext, 'src/flat/hand.js' ) }';
import { drawMotif } from '${ path.join( ext, 'src/core/gestures.js' ) }';
import { makeRng } from '${ path.join( ext, 'src/core/rng.js' ) }';
export { paintKit, setCanvasFactory, handPath, drawMotif, makeRng };`
);
const bundle = path.join( ext, 'dist', 'proof-paint-bundle.cjs' );
await build( { entryPoints: [ entry ], bundle: true, platform: 'node', format: 'cjs', outfile: bundle, external: [ 'canvas' ], logLevel: 'error', define: { 'process.env.NODE_ENV': '"production"' } } );
const { paintKit: kit, setCanvasFactory, handPath, drawMotif, makeRng } = req( bundle );
setCanvasFactory( ( w, h ) => createCanvas( w, h ) );

const W = 640;
const H = 430;
const rng = makeRng( [ 11, 22, 33 ] );

/** One stroke through the seam the brush tool uses: render, then the media pass. */
function paint( target, style, path ) {
	const tips = kit.tips;
	const reach = tips.stampMaxReach( path.tip, path.size, path ) + 4;
	let x0 = Infinity;
	let y0 = Infinity;
	let x1 = -Infinity;
	let y1 = -Infinity;
	for ( const p of path.pts ) {
		x0 = Math.min( x0, p.x );
		y0 = Math.min( y0, p.y );
		x1 = Math.max( x1, p.x );
		y1 = Math.max( y1, p.y );
	}
	const bx = Math.max( 0, Math.floor( x0 - reach ) );
	const by = Math.max( 0, Math.floor( y0 - reach ) );
	const bw = Math.min( W - bx, Math.ceil( x1 + reach ) - bx );
	const bh = Math.min( H - by, Math.ceil( y1 + reach ) - by );
	if ( bw < 2 || bh < 2 ) {
		return;
	}
	const scratch = createCanvas( bw, bh );
	const sctx = scratch.getContext( '2d' );
	sctx.translate( -bx, -by );
	kit.drawStroke( sctx, path, path.hardness ?? 85 );
	const dctx = target.getContext( '2d' );
	if ( kit.styles.styleIsPlain( style ) ) {
		dctx.drawImage( scratch, bx, by );
		return;
	}
	const dst = dctx.getImageData( bx, by, bw, bh );
	kit.styles.applyPaintStyle( dst, sctx.getImageData( 0, 0, bw, bh ), {
		style,
		colour: path.color,
		size: path.size,
		originX: bx,
		originY: by,
		from: { x: path.pts[ 0 ].x - bx, y: path.pts[ 0 ].y - by },
		to: { x: path.pts[ path.pts.length - 1 ].x - bx, y: path.pts[ path.pts.length - 1 ].y - by },
		points: path.pts.map( ( p ) => ( { x: p.x - bx, y: p.y - by } ) ),
	} );
	dctx.putImageData( dst, bx, by );
}

/** A gesture in pixels: the hand module's path, scaled from frame units. */
function gesture( kind, at, angle, scale, width ) {
	const m = drawMotif( rng, [ kind ] );
	const pts = handPath( m, { at: [ at[ 0 ] / H, at[ 1 ] / H ], angle, scale: scale / H, width: width / H, rng, tremor: 0.35, haste: 0.5, overshoot: 0.3, hesitate: 0.2 } );
	return { pts: pts.map( ( p ) => ( { x: p.x * H, y: p.y * H } ) ), widths: pts.map( ( p ) => p.w * H ) };
}

const MEDIA = [
	{ style: 'watercolour', ground: '#f3eee2', colors: [ '#2a4d9c', '#e3b23c', '#b83b2e', '#3f7d5a' ], size: 34, opacity: 0.55 },
	{ style: 'ink', ground: '#f4efe4', colors: [ '#16161c', '#16161c', '#8a2a1e', '#16161c' ], size: 22, opacity: 0.9 },
	{ style: 'gouache', ground: '#e9e2d2', colors: [ '#d94f3a', '#f2d24e', '#2e5d9e', '#f2ede0' ], size: 36, opacity: 0.95 },
	{ style: 'acrylic', ground: '#d8d3c7', colors: [ '#1f3f8f', '#f0b429', '#ffffff', '#c3262d' ], size: 40, opacity: 1 },
	{ style: 'oil', ground: '#5b5347', colors: [ '#d8c27a', '#7a3a2b', '#2f4a7a', '#efe6cf' ], size: 44, opacity: 1 },
	{ style: 'charcoal', ground: '#efe9dc', colors: [ '#1a1a1a', '#1a1a1a', '#3a3a3a', '#1a1a1a' ], size: 30, opacity: 0.85 },
	{ style: 'pastel', ground: '#5e6470', colors: [ '#f2c27b', '#8ec7d2', '#e88aa3', '#f7f3e8' ], size: 34, opacity: 0.9 },
	{ style: 'smudge', ground: '#efe9dc', colors: [ '#2a4d9c', '#e3b23c', '#b83b2e', '#3f7d5a' ], size: 36, opacity: 1 },
];

const tiles = [];
for ( const m of MEDIA ) {
	const c = createCanvas( W, H );
	const g = c.getContext( '2d' );
	g.fillStyle = m.ground;
	g.fillRect( 0, 0, W, H );
	const heads = kit.tips.STYLE_BRUSHES[ 'smudge' === m.style ? 'oil' : m.style ] || [ 'round' ];
	const kinds = [ 'arc', 'scurve', 'slash', 'hook', 'zigzag', 'arc', 'loop', 'slash', 'blob', 'scurve' ];
	// Smudge needs something to drag: lay oil first, then smear.
	const strokes = 'smudge' === m.style ? 6 : 10;
	for ( let i = 0; i < strokes; i++ ) {
		const at = [ 80 + rng() * ( W - 160 ), 70 + rng() * ( H - 140 ) ];
		const gst = gesture( kinds[ i % kinds.length ], at, ( rng() - 0.5 ) * 1.4, 70 + rng() * 120, m.size );
		const style = 'smudge' === m.style ? 'oil' : m.style;
		paint( c, style, {
			pts: gst.pts,
			d: 'M ' + gst.pts.map( ( p ) => p.x + ' ' + p.y ).join( ' L ' ),
			color: m.colors[ i % m.colors.length ],
			size: m.size * ( 0.7 + rng() * 0.7 ),
			opacity: m.opacity,
			flow: 1,
			tip: heads[ i % heads.length ],
			hardness: 85,
		} );
	}
	if ( 'smudge' === m.style ) {
		for ( let i = 0; i < 6; i++ ) {
			const at = [ 80 + rng() * ( W - 160 ), 70 + rng() * ( H - 140 ) ];
			const gst = gesture( 'scurve', at, ( rng() - 0.5 ) * 2, 90 + rng() * 90, 40 );
			paint( c, 'smudge', { pts: gst.pts, d: '', color: '#888888', size: 40, opacity: 1, flow: 1, tip: kit.tips.STYLE_BRUSHES.smudge[ i % 3 ], hardness: 60 } );
		}
	}
	g.fillStyle = 'rgba(0,0,0,0.55)';
	g.fillRect( 0, H - 26, 190, 26 );
	g.fillStyle = '#fff';
	g.font = '15px sans-serif';
	g.fillText( m.style + '  ·  ' + heads.join( ' / ' ), 8, H - 8 );
	tiles.push( c );
}
const COLS = 2;
const rows = Math.ceil( tiles.length / COLS );
const sheet = createCanvas( COLS * ( W + 8 ), rows * ( H + 8 ) );
const sg = sheet.getContext( '2d' );
sg.fillStyle = '#222';
sg.fillRect( 0, 0, sheet.width, sheet.height );
tiles.forEach( ( t, i ) => sg.drawImage( t, ( i % COLS ) * ( W + 8 ), Math.floor( i / COLS ) * ( H + 8 ) ) );
fs.writeFileSync( out, sheet.toBuffer( 'image/png' ) );
console.log( 'wrote', out );
