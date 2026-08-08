/**
 * Reproduction harness for the two quality complaints.
 *
 * A real sheet page is rendered, a smooth letter is written into one of
 * its boxes, the page is photographed (projective distortion, camera
 * blur, sensor noise, downscale) and then pushed through the actual
 * extraction pipeline. Nothing is mocked, so whatever comes out is what
 * a user gets.
 *
 * The second half does the same for the drawing path: a smooth stroke
 * with realistic pointer jitter, run through finishStroke at a range of
 * smoothing settings, measured against the curve it was meant to be.
 *
 * Output: numbers on stdout, a contact sheet in dist/repro.png.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { EDITOR } from '../../shared/qa-kit/stage.mjs';

const root = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..' );
const out = path.join( root, 'dist', 'repro' );
fs.rmSync( out, { recursive: true, force: true } );
fs.mkdirSync( out, { recursive: true } );

const esbuild = (
	await import(
		path.join( EDITOR, 'tools', 'template-generator', 'node_modules', 'esbuild', 'lib', 'main.js' )
	)
).default;

fs.writeFileSync(
	path.join( out, 'entry.js' ),
	`import * as sheet from '${ path.join( root, 'src/core/sheet.js' ) }';
import * as trace from '${ path.join( root, 'src/core/trace.js' ) }';
import * as outline from '${ path.join( root, 'src/core/outline.js' ) }';
import * as strokes from '${ path.join( root, 'src/core/strokes.js' ) }';
import * as raster from '${ path.join( root, 'src/core/raster.js' ) }';
import { DEFAULT_METRICS } from '${ path.join( root, 'src/core/metrics.js' ) }';
import { contoursToPath } from '${ path.join( root, 'src/ui/paint.js' ) }';
window.__m = { sheet, trace, outline, strokes, raster, DEFAULT_METRICS, contoursToPath };`
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
	'<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#fff}</style></head><body><canvas id="c" width="1180" height="760"></canvas><script src="bundle.js"></script></body></html>'
);

const req = createRequire( path.join( EDITOR, 'node_modules', 'x.js' ) );
const { chromium } = req( 'playwright' );
const browser = await chromium.launch( { args: [ '--no-sandbox' ] } );
const page = await browser.newPage( { viewport: { width: 1200, height: 800 } } );
page.on( 'pageerror', ( e ) => process.stderr.write( 'PAGEERROR: ' + e.message + '\n' ) );
await page.goto( 'file://' + path.join( out, 'index.html' ) );

const report = await page.evaluate( async () => {
	const { sheet, trace, outline, strokes, raster, DEFAULT_METRICS, contoursToPath } = window.__m;
	const M = DEFAULT_METRICS;
	const log = [];

	/* ------------------------- 1. print a real sheet ---------------------- */

	const dpi = 200;
	const s = dpi / 25.4;
	const pages = sheet.sheetLayout( Array.from( 'ABCDEFGHIJKLMNOPQRSTUVWX' ) );
	const pg = pages[ 0 ];
	const paper = document.createElement( 'canvas' );
	paper.width = Math.round( sheet.SHEET.pageW * s );
	paper.height = Math.round( sheet.SHEET.pageH * s );
	const pctx = paper.getContext( '2d' );
	sheet.drawSheet( pctx, pg, { dpi, metrics: M, labelFor: ( k ) => k, title: 'repro' } );

	// What the red channel actually sees of the printed guides.
	const cell0 = pg.cells[ 0 ];
	const probe = pctx.getImageData(
		Math.round( ( cell0.x + cell0.w / 2 ) * s ),
		Math.round( ( cell0.y + cell0.h * sheet.cellGuides( M ).baseline ) * s ),
		1,
		1
	).data;
	log.push( `printed baseline pixel rgb(${ probe[ 0 ] },${ probe[ 1 ] },${ probe[ 2 ] }) -> red channel ${ probe[ 0 ] }` );

	/* ------------------------ 2. write a smooth letter -------------------- */

	// A clean, deliberately graceful "S": exactly the case the user says
	// comes out crackly.
	const cell = pg.cells[ 6 ];
	const cx = cell.x * s;
	const cy = cell.y * s;
	const cw = cell.w * s;
	const ch = cell.h * s;
	pctx.strokeStyle = '#101418';
	pctx.lineWidth = 1.6 * s;
	pctx.lineCap = 'round';
	pctx.lineJoin = 'round';
	pctx.beginPath();
	pctx.moveTo( cx + cw * 0.72, cy + ch * 0.3 );
	pctx.bezierCurveTo(
		cx + cw * 0.5, cy + ch * 0.12,
		cx + cw * 0.24, cy + ch * 0.26,
		cx + cw * 0.36, cy + ch * 0.46
	);
	pctx.bezierCurveTo(
		cx + cw * 0.48, cy + ch * 0.62,
		cx + cw * 0.76, cy + ch * 0.6,
		cx + cw * 0.68, cy + ch * 0.74
	);
	pctx.bezierCurveTo(
		cx + cw * 0.6, cy + ch * 0.86,
		cx + cw * 0.36, cy + ch * 0.84,
		cx + cw * 0.28, cy + ch * 0.72
	);
	pctx.stroke();

	/* --------------------------- 3. photograph it ------------------------- */

	const PH = { w: 2400, h: 3200 };
	const quad = [
		{ x: 150, y: 120 },
		{ x: 2255, y: 210 },
		{ x: 2200, y: 3090 },
		{ x: 190, y: 3010 },
	];
	const toSheetPx = sheet.homography( quad, [
		{ x: 0, y: 0 },
		{ x: paper.width, y: 0 },
		{ x: paper.width, y: paper.height },
		{ x: 0, y: paper.height },
	] );
	const src = pctx.getImageData( 0, 0, paper.width, paper.height );
	const shot = new ImageData( PH.w, PH.h );
	for ( let y = 0; y < PH.h; y++ ) {
		for ( let x = 0; x < PH.w; x++ ) {
			const p = sheet.applyH( toSheetPx, x + 0.5, y + 0.5 );
			const i = ( y * PH.w + x ) * 4;
			let r = 250;
			let g = 250;
			let b = 250;
			if ( p.x >= 0 && p.y >= 0 && p.x < paper.width - 1 && p.y < paper.height - 1 ) {
				// Bilinear, which is what a lens plus a sensor gives you.
				const xi = Math.floor( p.x );
				const yi = Math.floor( p.y );
				const fx = p.x - xi;
				const fy = p.y - yi;
				const at = ( ax, ay, ch2 ) => src.data[ ( ay * paper.width + ax ) * 4 + ch2 ];
				const mix = ( ch2 ) =>
					( at( xi, yi, ch2 ) * ( 1 - fx ) + at( xi + 1, yi, ch2 ) * fx ) * ( 1 - fy ) +
					( at( xi, yi + 1, ch2 ) * ( 1 - fx ) + at( xi + 1, yi + 1, ch2 ) * fx ) * fy;
				r = mix( 0 );
				g = mix( 1 );
				b = mix( 2 );
			}
			// Uneven lighting plus sensor noise.
			const shade = 0.86 + 0.14 * ( 1 - y / PH.h ) + 0.04 * ( x / PH.w );
			const noise = ( ( ( x * 1103515245 + y * 12345 ) >> 8 ) % 13 ) - 6;
			shot.data[ i ] = Math.max( 0, Math.min( 255, r * shade + noise ) );
			shot.data[ i + 1 ] = Math.max( 0, Math.min( 255, g * shade + noise ) );
			shot.data[ i + 2 ] = Math.max( 0, Math.min( 255, b * shade + noise ) );
			shot.data[ i + 3 ] = 255;
		}
	}

	// The extension downscales before it works, so do that too.
	const MAX = 2000;
	const f = Math.min( 1, MAX / Math.max( PH.w, PH.h ) );
	const tmp = document.createElement( 'canvas' );
	tmp.width = PH.w;
	tmp.height = PH.h;
	tmp.getContext( '2d' ).putImageData( shot, 0, 0 );
	const small = document.createElement( 'canvas' );
	small.width = Math.round( PH.w * f );
	small.height = Math.round( PH.h * f );
	const sctx = small.getContext( '2d', { willReadFrequently: true } );
	sctx.imageSmoothingQuality = 'high';
	sctx.drawImage( tmp, 0, 0, small.width, small.height );
	const photo = sctx.getImageData( 0, 0, small.width, small.height );
	log.push( `photo ${ photo.width }x${ photo.height }, cell is about ${ Math.round( ( cell.w / sheet.SHEET.pageW ) * photo.width ) } px wide` );

	/* --------------------------- 4. read it back -------------------------- */

	const marks = sheet.findRegistrationMarks( photo );
	log.push( marks ? 'marks found' : 'MARKS NOT FOUND' );
	const H = sheet.homography( pg.marks, marks || [] );
	const rawCell = sheet.extractCell( photo, H, cell, { size: 300 } );
	const clean = rawCell.empty ? rawCell : sheet.despeckle( rawCell, 40 );
	const contours = sheet.cellToContours( clean, M, { cellMm: cell.w } );

	const gray = sheet.redChannel( photo );
	log.push( `otsu over the whole photo: ${ sheet.otsu( gray ) }` );

	// How many separate shapes came back, and how big are they? A letter
	// is one shape; a letter plus a printed rule is several.
	const areas = contours
		.map( ( c ) => Math.abs( trace.signedArea( c.filter( ( p ) => p.on ) ) ) )
		.sort( ( a, b ) => b - a );
	log.push( `contours: ${ contours.length } (areas ${ areas.map( ( a ) => Math.round( a ) ).join( ', ' ) })` );

	// Jaggedness: how often the outline reverses direction. A smooth
	// letter turns steadily; a crackly one wobbles.
	const wobble = ( c ) => {
		const on = c.filter( ( p ) => p.on );
		let flips = 0;
		for ( let i = 2; i < on.length; i++ ) {
			const a = on[ i - 2 ];
			const b = on[ i - 1 ];
			const d = on[ i ];
			const c1 = ( b.x - a.x ) * ( d.y - b.y ) - ( b.y - a.y ) * ( d.x - b.x );
			const prev = i > 2 ? window.__prevCross : 0;
			if ( prev && Math.sign( c1 ) !== Math.sign( prev ) ) {
				flips++;
			}
			window.__prevCross = c1;
		}
		return on.length ? flips / on.length : 0;
	};
	log.push(
		`outline points: ${ contours.reduce( ( n, c ) => n + c.filter( ( p ) => p.on ).length, 0 ) }, wobble ${ contours
			.map( ( c ) => wobble( c ).toFixed( 2 ) )
			.join( '/' ) }`
	);

	/* ----------------------- 5. the drawing path -------------------------- */

	// An ideal graceful curve, sampled the way a pointer samples it, with
	// the small tremor a real hand has.
	const ideal = [];
	for ( let i = 0; i <= 600; i++ ) {
		const t = i / 600;
		const x = 60 + 380 * t;
		const y = 250 + 190 * Math.sin( t * Math.PI * 1.15 );
		ideal.push( { x, y } );
	}
	const jitter = ideal.map( ( p, i ) => ( {
		x: p.x + Math.sin( i * 1.7 ) * 2.2 + Math.sin( i * 0.37 ) * 1.1,
		y: p.y + Math.cos( i * 1.9 ) * 2.2 + Math.cos( i * 0.41 ) * 1.3,
		p: 0.5,
	} ) );

	const distTo = ( pt, poly ) => {
		let best = Infinity;
		for ( let i = 1; i < poly.length; i++ ) {
			const a = poly[ i - 1 ];
			const b = poly[ i ];
			const vx = b.x - a.x;
			const vy = b.y - a.y;
			const l2 = vx * vx + vy * vy;
			let t = l2 ? ( ( pt.x - a.x ) * vx + ( pt.y - a.y ) * vy ) / l2 : 0;
			t = t < 0 ? 0 : t > 1 ? 1 : t;
			best = Math.min( best, Math.hypot( pt.x - ( a.x + vx * t ), pt.y - ( a.y + vy * t ) ) );
		}
		return best;
	};

	const smoothingRuns = [];
	for ( const sm of [ 0, 20, 40, 70, 100 ] ) {
		const st = strokes.finishStroke( jitter, { smoothing: sm, width: 62 } );
		let maxDev = 0;
		let sumDev = 0;
		for ( const p of st.pts ) {
			const d = distTo( p, ideal );
			maxDev = Math.max( maxDev, d );
			sumDev += d;
		}
		// Spacing evenness: a resampled stroke should have equal steps.
		const steps = [];
		for ( let i = 1; i < st.pts.length; i++ ) {
			steps.push( Math.hypot( st.pts[ i ].x - st.pts[ i - 1 ].x, st.pts[ i ].y - st.pts[ i - 1 ].y ) );
		}
		const mean = steps.reduce( ( a, b ) => a + b, 0 ) / steps.length;
		const sd = Math.sqrt( steps.reduce( ( a, b ) => a + ( b - mean ) ** 2, 0 ) / steps.length );
		smoothingRuns.push( { sm, n: st.pts.length, maxDev, avgDev: sumDev / st.pts.length, mean, sd, st } );
		log.push(
			`smoothing ${ sm }: ${ st.pts.length } pts, deviation avg ${ ( sumDev / st.pts.length ).toFixed(
				1
			) } max ${ maxDev.toFixed( 1 ) }, step ${ mean.toFixed( 1 ) } +/- ${ sd.toFixed( 1 ) }`
		);
	}

	/* --------------------------- 6. contact sheet ------------------------- */

	const cv = document.getElementById( 'c' );
	const g2 = cv.getContext( '2d' );
	g2.fillStyle = '#fff';
	g2.fillRect( 0, 0, cv.width, cv.height );
	g2.fillStyle = '#111';
	g2.font = '13px sans-serif';
	g2.fillText( 'written on the sheet', 10, 18 );
	g2.drawImage( paper, cx - cw * 0.15, cy - ch * 0.15, cw * 1.3, ch * 1.3, 10, 28, 240, 240 );

	g2.fillText( 'extracted bitmap', 270, 18 );
	const bmpCv = document.createElement( 'canvas' );
	bmpCv.width = clean.w;
	bmpCv.height = clean.h;
	const bctx = bmpCv.getContext( '2d' );
	const bimg = bctx.createImageData( clean.w, clean.h );
	for ( let i = 0; i < clean.data.length; i++ ) {
		const v = clean.data[ i ] ? 0 : 255;
		bimg.data[ i * 4 ] = v;
		bimg.data[ i * 4 + 1 ] = v;
		bimg.data[ i * 4 + 2 ] = v;
		bimg.data[ i * 4 + 3 ] = 255;
	}
	bctx.putImageData( bimg, 0, 0 );
	g2.drawImage( bmpCv, 270, 28, 240, 240 );

	g2.fillText( 'traced outline', 530, 18 );
	g2.save();
	g2.translate( 530, 28 );
	const sc = 240 / ( M.ascender - M.descender );
	g2.translate( 0, M.ascender * sc );
	g2.scale( sc, -sc );
	g2.fillStyle = '#111';
	g2.fill( contoursToPath( contours ), 'nonzero' );
	g2.restore();

	g2.fillStyle = '#111';
	g2.fillText( 'drawn stroke at smoothing 0 / 20 / 40 / 70 / 100', 10, 300 );
	smoothingRuns.forEach( ( run, i ) => {
		const ox = 10 + i * 232;
		const oy = 316;
		g2.strokeStyle = '#bbb';
		g2.strokeRect( ox, oy, 224, 220 );
		const cont = outline.buildOutline( { src: 'draw', strokes: [ run.st ] }, {} );
		g2.save();
		g2.beginPath();
		g2.rect( ox, oy, 224, 220 );
		g2.clip();
		g2.translate( ox + 6, oy + 200 );
		g2.scale( 0.44, -0.44 );
		g2.fillStyle = '#111';
		g2.fill( contoursToPath( cont ), 'nonzero' );
		g2.restore();
		g2.fillStyle = '#444';
		g2.fillText( `${ run.sm }: dev ${ run.avgDev.toFixed( 1 ) }`, ox + 6, oy + 214 );
	} );

	g2.fillStyle = '#111';
	g2.fillText( 'stroke centre lines, ideal in grey', 10, 560 );
	smoothingRuns.forEach( ( run, i ) => {
		const ox = 10 + i * 232;
		const oy = 574;
		g2.strokeStyle = '#ccc';
		g2.strokeRect( ox, oy, 224, 170 );
		g2.save();
		g2.beginPath();
		g2.rect( ox, oy, 224, 170 );
		g2.clip();
		g2.translate( ox + 4, oy + 150 );
		g2.scale( 0.44, -0.44 );
		g2.lineWidth = 6;
		g2.strokeStyle = '#c8c8c8';
		g2.beginPath();
		ideal.forEach( ( p, k ) => ( k ? g2.lineTo( p.x, p.y ) : g2.moveTo( p.x, p.y ) ) );
		g2.stroke();
		g2.lineWidth = 4;
		g2.strokeStyle = '#c0392b';
		g2.beginPath();
		run.st.pts.forEach( ( p, k ) => ( k ? g2.lineTo( p.x, p.y ) : g2.moveTo( p.x, p.y ) ) );
		g2.stroke();
		g2.restore();
	} );

	return log;
} );

report.forEach( ( l ) => process.stdout.write( l + '\n' ) );
await page.locator( '#c' ).screenshot( { path: path.join( root, 'dist', 'repro.png' ) } );
await browser.close();
