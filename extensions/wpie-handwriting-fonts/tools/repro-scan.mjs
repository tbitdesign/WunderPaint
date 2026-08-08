/**
 * The paper route under conditions it will actually meet.
 *
 * The first harness wrote one fat, perfectly smooth letter and was far
 * too kind. Real writing is thin, real pens wobble, real photographs are
 * soft and unevenly lit, and the sheet in somebody's hands was printed
 * before the guide colour changed. All of that is here now, and the
 * result is shown large enough to judge rather than summarised.
 *
 * Usage: node tools/repro-scan.mjs [--old-guides] [--pen 0.7] [--max 2000]
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { EDITOR } from '../../shared/qa-kit/stage.mjs';

const args = process.argv.slice( 2 );
const flag = ( name, dflt ) => {
	const i = args.indexOf( '--' + name );
	return i >= 0 ? Number( args[ i + 1 ] ) : dflt;
};
const OLD_GUIDES = args.includes( '--old-guides' );
const LEGACY = args.includes( '--legacy' );
const PEN_MM = flag( 'pen', 0.8 );
const MAX_PHOTO = flag( 'max', 2000 );

const root = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..' );
const out = path.join( root, 'dist', 'repro-scan' );
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
import { contourBounds } from '${ path.join( root, 'src/core/outline.js' ) }';
import { DEFAULT_METRICS } from '${ path.join( root, 'src/core/metrics.js' ) }';
import { contoursToPath } from '${ path.join( root, 'src/ui/paint.js' ) }';
window.__m = { sheet, trace, contourBounds, DEFAULT_METRICS, contoursToPath };`
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
	'<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#fff}</style></head><body><canvas id="c" width="1240" height="560"></canvas><script src="bundle.js"></script></body></html>'
);

const req = createRequire( path.join( EDITOR, 'node_modules', 'x.js' ) );
const { chromium } = req( 'playwright' );
const browser = await chromium.launch( { args: [ '--no-sandbox' ] } );
const page = await browser.newPage( { viewport: { width: 1260, height: 600 } } );
page.on( 'pageerror', ( e ) => process.stderr.write( 'PAGEERROR: ' + e.message + '\n' ) );
await page.goto( 'file://' + path.join( out, 'index.html' ) );

const report = await page.evaluate(
	async ( { OLD, PEN, MAX, LEGACY } ) => {
		const { sheet, trace, contourBounds, DEFAULT_METRICS, contoursToPath } = window.__m;
		const M = DEFAULT_METRICS;
		const log = [];

		/* ---- five letters, written the way a hand writes them ---------- */

		const LETTERS = {
			a: ( g, w, h ) => {
				g.moveTo( 0.72 * w, 0.34 * h );
				g.bezierCurveTo( 0.6 * w, 0.22 * h, 0.26 * w, 0.24 * h, 0.26 * w, 0.5 * h );
				g.bezierCurveTo( 0.26 * w, 0.76 * h, 0.62 * w, 0.78 * h, 0.72 * w, 0.62 * h );
				g.moveTo( 0.72 * w, 0.3 * h );
				g.bezierCurveTo( 0.72 * w, 0.5 * h, 0.7 * w, 0.68 * h, 0.78 * w, 0.78 * h );
			},
			e: ( g, w, h ) => {
				g.moveTo( 0.24 * w, 0.56 * h );
				g.bezierCurveTo( 0.5 * w, 0.5 * h, 0.72 * w, 0.5 * h, 0.72 * w, 0.42 * h );
				g.bezierCurveTo( 0.72 * w, 0.28 * h, 0.4 * w, 0.24 * h, 0.28 * w, 0.44 * h );
				g.bezierCurveTo( 0.16 * w, 0.66 * h, 0.44 * w, 0.84 * h, 0.74 * w, 0.7 * h );
			},
			S: ( g, w, h ) => {
				g.moveTo( 0.74 * w, 0.2 * h );
				g.bezierCurveTo( 0.5 * w, 0.06 * h, 0.24 * w, 0.16 * h, 0.34 * w, 0.36 * h );
				g.bezierCurveTo( 0.44 * w, 0.54 * h, 0.76 * w, 0.5 * h, 0.7 * w, 0.68 * h );
				g.bezierCurveTo( 0.64 * w, 0.84 * h, 0.34 * w, 0.84 * h, 0.26 * w, 0.7 * h );
			},
			t: ( g, w, h ) => {
				g.moveTo( 0.46 * w, 0.1 * h );
				g.bezierCurveTo( 0.44 * w, 0.4 * h, 0.42 * w, 0.62 * h, 0.5 * w, 0.74 * h );
				g.bezierCurveTo( 0.56 * w, 0.82 * h, 0.66 * w, 0.78 * h, 0.72 * w, 0.7 * h );
				g.moveTo( 0.28 * w, 0.34 * h );
				g.lineTo( 0.68 * w, 0.32 * h );
			},
			g: ( g, w, h ) => {
				g.moveTo( 0.7 * w, 0.4 * h );
				g.bezierCurveTo( 0.56 * w, 0.28 * h, 0.28 * w, 0.32 * h, 0.3 * w, 0.5 * h );
				g.bezierCurveTo( 0.32 * w, 0.68 * h, 0.6 * w, 0.7 * h, 0.7 * w, 0.56 * h );
				g.moveTo( 0.7 * w, 0.36 * h );
				g.bezierCurveTo( 0.72 * w, 0.6 * h, 0.74 * w, 0.86 * h, 0.6 * w, 0.94 * h );
				g.bezierCurveTo( 0.46 * w, 1.02 * h, 0.32 * w, 0.94 * h, 0.34 * w, 0.86 * h );
			},
		};
		const keys = Object.keys( LETTERS );

		/* ---- print the sheet, in the current or the old colours -------- */

		const dpi = 220;
		const s = dpi / 25.4;
		const allKeys = keys.concat( Array.from( 'BCDFHJK' ) );
		// Print the sheet the way the chosen version printed it.
		const pg = ( LEGACY ? sheet.legacySheetLayout( allKeys ) : sheet.sheetLayout( allKeys ) )[ 0 ];
		const paper = document.createElement( 'canvas' );
		paper.width = Math.round( sheet.SHEET.pageW * s );
		paper.height = Math.round( sheet.SHEET.pageH * s );
		const p = paper.getContext( '2d' );
		sheet.drawSheet( p, pg, { dpi, metrics: M, labelFor: ( k ) => k, title: 'repro' } );
		if ( OLD ) {
			// Repaint the rules in the colour older sheets were printed in.
			const guides = sheet.cellGuides( M );
			for ( const cell of pg.cells ) {
				const x = cell.x * s;
				const y = cell.y * s;
				const w = cell.w * s;
				const h = cell.h * s;
				p.strokeStyle = '#c7ecf9';
				p.lineWidth = 0.25 * s;
				p.strokeRect( x, y, w, h );
				for ( const [ name, frac ] of Object.entries( guides ) ) {
					const solid = 'baseline' === name;
					p.strokeStyle = solid ? '#8fd8f2' : '#c7ecf9';
					p.lineWidth = ( solid ? 0.5 : 0.25 ) * s;
					p.beginPath();
					p.moveTo( x, y + h * frac );
					p.lineTo( x + w, y + h * frac );
					p.stroke();
				}
			}
		}

		// Write the letters with a real pen: thin, slightly uneven ink.
		p.strokeStyle = '#1b2430';
		p.lineCap = 'round';
		p.lineJoin = 'round';
		keys.forEach( ( key, i ) => {
			const cell = pg.cells[ i ];
			const x = cell.x * s;
			const y = cell.y * s;
			const w = cell.w * s;
			const h = cell.h * s;
			p.save();
			p.translate( x, y );
			p.lineWidth = PEN * s;
			p.beginPath();
			LETTERS[ key ]( p, w, h );
			p.stroke();
			p.restore();
		} );

		/* ---- photograph it, badly -------------------------------------- */

		const PH = { w: 2600, h: 3500 };
		const quad = [
			{ x: 170, y: 140 },
			{ x: 2440, y: 250 },
			{ x: 2380, y: 3370 },
			{ x: 205, y: 3270 },
		];
		const toSheetPx = sheet.homography( quad, [
			{ x: 0, y: 0 },
			{ x: paper.width, y: 0 },
			{ x: paper.width, y: paper.height },
			{ x: 0, y: paper.height },
		] );
		const src = p.getImageData( 0, 0, paper.width, paper.height );
		const shot = new ImageData( PH.w, PH.h );
		for ( let y = 0; y < PH.h; y++ ) {
			for ( let x = 0; x < PH.w; x++ ) {
				const q = sheet.applyH( toSheetPx, x + 0.5, y + 0.5 );
				const i = ( y * PH.w + x ) * 4;
				let r = 250;
				let g = 250;
				let b = 250;
				if ( q.x >= 0 && q.y >= 0 && q.x < paper.width - 1 && q.y < paper.height - 1 ) {
					const xi = Math.floor( q.x );
					const yi = Math.floor( q.y );
					const fx = q.x - xi;
					const fy = q.y - yi;
					const at = ( ax, ay, c ) => src.data[ ( ay * paper.width + ax ) * 4 + c ];
					const mix = ( c ) =>
						( at( xi, yi, c ) * ( 1 - fx ) + at( xi + 1, yi, c ) * fx ) * ( 1 - fy ) +
						( at( xi, yi + 1, c ) * ( 1 - fx ) + at( xi + 1, yi + 1, c ) * fx ) * fy;
					r = mix( 0 );
					g = mix( 1 );
					b = mix( 2 );
				}
				// Warm, uneven light and a lot of sensor noise.
				const shade = 0.78 + 0.2 * ( 1 - y / PH.h ) + 0.06 * ( x / PH.w );
				const n = ( ( ( x * 1103515245 + y * 12345 ) >> 7 ) % 19 ) - 9;
				shot.data[ i ] = Math.max( 0, Math.min( 255, r * shade + n ) );
				shot.data[ i + 1 ] = Math.max( 0, Math.min( 255, g * shade * 0.98 + n ) );
				shot.data[ i + 2 ] = Math.max( 0, Math.min( 255, b * shade * 0.94 + n ) );
				shot.data[ i + 3 ] = 255;
			}
		}
		const full = document.createElement( 'canvas' );
		full.width = PH.w;
		full.height = PH.h;
		full.getContext( '2d' ).putImageData( shot, 0, 0 );

		// Lens softness, then the downscale the extension performs.
		const soft = document.createElement( 'canvas' );
		soft.width = PH.w;
		soft.height = PH.h;
		const sg = soft.getContext( '2d' );
		sg.filter = 'blur(1.6px)';
		sg.drawImage( full, 0, 0 );

		const f = Math.min( 1, MAX / Math.max( PH.w, PH.h ) );
		const small = document.createElement( 'canvas' );
		small.width = Math.round( PH.w * f );
		small.height = Math.round( PH.h * f );
		const cg = small.getContext( '2d', { willReadFrequently: true } );
		cg.imageSmoothingQuality = 'high';
		cg.drawImage( soft, 0, 0, small.width, small.height );
		const photo = cg.getImageData( 0, 0, small.width, small.height );

		const cellPx = ( pg.cells[ 0 ].w / sheet.SHEET.pageW ) * photo.width;
		log.push(
			`pen ${ PEN }mm, guides ${ OLD ? 'OLD cyan' : 'current' }, photo ${ photo.width }x${ photo.height }`
		);
		log.push(
			`one box is ${ Math.round( cellPx ) } px wide, so the pen stroke is about ${ (
				( PEN / pg.cells[ 0 ].w ) *
				cellPx
			).toFixed( 1 ) } px`
		);

		/* ---- read it back ---------------------------------------------- */

		const marks = sheet.findRegistrationMarks( photo );
		log.push( marks ? 'marks found' : 'MARKS NOT FOUND' );

		// The reader is told nothing about which sheet this is.
		const pick = sheet.chooseLayout( photo, marks || [], allKeys );
		log.push(
			`printed as ${ pg.id }, detected ${ pick.id } ` +
				`(ink inside boxes: ${ ( pick.score * 100 ).toFixed( 1 ) }% vs ` +
				`${ ( pick.runnerUp.score * 100 ).toFixed( 1 ) }% for ${ pick.runnerUp.id })` +
				( pick.id === pg.id ? '  CORRECT' : '  WRONG' )
		);
		const readPg = pick.pages[ 0 ];
		const H = sheet.homography( readPg.marks, marks || [] );

		const results = keys.map( ( key, i ) => {
			const cell = readPg.cells[ i ];
			const raw = sheet.extractCell( photo, H, cell, { size: 300 } );
			const ruled = raw.empty ? raw : sheet.removeRules( raw, M, { cellMm: cell.w } );
			const bmp = ruled.empty ? ruled : sheet.despeckle( ruled, 30 );
			const contours = bmp.empty ? [] : sheet.cellToContours( bmp, M, { cellMm: cell.w } );
			const on = contours.reduce( ( n, c ) => n + c.filter( ( q ) => q.on ).length, 0 );
			return { key, cell, bmp, contours, on };
		} );
		for ( const r of results ) {
			log.push(
				`${ r.key }: ${ r.contours.length } contour(s), ${ r.on } on-curve points` +
					( r.bmp.empty ? ' EMPTY' : '' )
			);
		}

		/* ---- show it big ------------------------------------------------ */

		const cv = document.getElementById( 'c' );
		const g2 = cv.getContext( '2d' );
		g2.fillStyle = '#fff';
		g2.fillRect( 0, 0, cv.width, cv.height );
		g2.fillStyle = '#111';
		g2.font = '13px sans-serif';
		g2.fillText(
			`written  (pen ${ PEN }mm, ${ OLD ? 'old cyan guides' : 'current guides' }, sheet ${ pg.id }, read as ${ pick.id })`,
			10,
			18
		);
		g2.fillText( 'extracted', 10, 208 );
		g2.fillText( 'traced outline', 10, 398 );

		results.forEach( ( r, i ) => {
			const ox = 150 + i * 210;
			const cell = r.cell;
			const printed = pg.cells[ i ];
			g2.drawImage(
				paper,
				printed.x * s,
				printed.y * s,
				printed.w * s,
				printed.h * s,
				ox,
				26,
				170,
				170
			);
			const bc = document.createElement( 'canvas' );
			bc.width = r.bmp.w;
			bc.height = r.bmp.h;
			const bx = bc.getContext( '2d' );
			const bi = bx.createImageData( r.bmp.w, r.bmp.h );
			for ( let k = 0; k < r.bmp.data.length; k++ ) {
				const v = r.bmp.data[ k ] ? 0 : 255;
				bi.data[ k * 4 ] = v;
				bi.data[ k * 4 + 1 ] = v;
				bi.data[ k * 4 + 2 ] = v;
				bi.data[ k * 4 + 3 ] = 255;
			}
			bx.putImageData( bi, 0, 0 );
			g2.drawImage( bc, ox, 216, 170, 170 );

			g2.save();
			g2.beginPath();
			g2.rect( ox, 406, 170, 170 );
			g2.clip();
			const sc = 170 / ( M.ascender - M.descender );
			g2.translate( ox, 406 + M.ascender * sc );
			g2.scale( sc, -sc );
			g2.fillStyle = '#111';
			g2.fill( contoursToPath( r.contours ), 'nonzero' );
			g2.restore();
			g2.fillStyle = '#666';
			g2.font = '11px sans-serif';
			g2.fillText( `${ r.key }: ${ r.contours.length }c / ${ r.on }p`, ox, 590 );
			g2.font = '13px sans-serif';
			g2.fillStyle = '#111';
		} );

		return log;
	},
	{ OLD: OLD_GUIDES, PEN: PEN_MM, MAX: MAX_PHOTO, LEGACY }
);

report.forEach( ( l ) => process.stdout.write( l + '\n' ) );
const name = `repro-scan${ LEGACY ? '-legacy' : '' }${ OLD_GUIDES ? '-old' : '' }-pen${ PEN_MM }-max${ MAX_PHOTO }.png`;
await page.locator( '#c' ).screenshot( { path: path.join( root, 'dist', name ) } );
process.stdout.write( `wrote dist/${ name }\n` );
await browser.close();
