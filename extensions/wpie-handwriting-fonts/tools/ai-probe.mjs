/**
 * Probe for the generated route, outside any browser.
 *
 *   node tools/ai-probe.mjs render <dir>
 *       Writes the blank pages exactly as the studio sends them
 *       (page-1.png, page-2.png) and the prompts for both sources.
 *
 *   node tools/ai-probe.mjs read <dir> <filled.png> <page>
 *       Reads a sheet a model filled in against the page that was sent
 *       (page-<n>.png in <dir>), and writes <filled>-glyphs.png: every box
 *       as the reader lifted it out (left) next to what the tracer made of
 *       it (right). Prints how many rows and boxes came back.
 *
 * Uses node-canvas from the plugin root, like the other probes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { drawSheet } from '../src/core/sheet.js';
import {
	aiPages,
	aiLabel,
	aiPageSize,
	aiPrompt,
	aiRows,
	aiMetrics,
	readFilledPage,
	AI_DRAW,
	AI_READ,
} from '../src/core/ai-sheet.js';
import { newProject } from '../src/core/build.js';
import { contourBounds } from '../src/core/outline.js';

const here = path.dirname( fileURLToPath( import.meta.url ) );
const require = createRequire(
	path.resolve( here, '../../../package.json' )
);
const { createCanvas, loadImage } = require( 'canvas' );

const [ , , cmd, dir, file, pageArg ] = process.argv;
if ( ! cmd || ! dir ) {
	console.log( 'usage: render <dir> | read <dir> <filled.png> <page>' );
	process.exit( 1 );
}
fs.mkdirSync( dir, { recursive: true } );
const project = newProject( 'Probe' );
const pages = aiPages( {}, false );
const DPI = 300;

if ( 'render' === cmd ) {
	const size = aiPageSize( DPI );
	pages.forEach( ( page, i ) => {
		const canvas = createCanvas( size.w, size.h );
		drawSheet( canvas.getContext( '2d' ), page, {
			...AI_DRAW,
			dpi: DPI,
			metrics: aiMetrics( project.metrics ),
			title: 'Handwriting font, sheet ' + ( i + 1 ) + ' of ' + pages.length,
		} );
		fs.writeFileSync(
			path.join( dir, 'page-' + ( i + 1 ) + '.png' ),
			canvas.toBuffer( 'image/png' )
		);
	} );
	const prompts = {
		size: size.w + 'x' + size.h,
		describe1: aiPrompt( {
			source: 'describe',
			description:
				'a relaxed, slightly right-slanted ballpoint pen handwriting with round letters',
			page: 1,
			pages: pages.length,
			rows: aiRows( pages[ 0 ] ),
		} ),
		describe2: aiPrompt( {
			source: 'describe',
			description:
				'a relaxed, slightly right-slanted ballpoint pen handwriting with round letters',
			page: 2,
			pages: pages.length,
			continued: true,
			rows: aiRows( pages[ 1 ] ),
		} ),
		note1: aiPrompt( {
			source: 'note',
			page: 1,
			pages: pages.length,
			rows: aiRows( pages[ 0 ] ),
		} ),
		note2: aiPrompt( {
			source: 'note',
			page: 2,
			pages: pages.length,
			continued: true,
			rows: aiRows( pages[ 1 ] ),
		} ),
	};
	fs.writeFileSync(
		path.join( dir, 'prompts.json' ),
		JSON.stringify( prompts, null, 2 )
	);
	console.log(
		pages.length + ' pages, ' + prompts.size + ', ' +
			pages.map( ( p ) => p.cells.length ).join( '+' ) + ' boxes'
	);
	process.exit( 0 );
}

if ( 'read' === cmd ) {
	const page = pages[ Number( pageArg || 1 ) - 1 ];
	const img = await loadImage( fs.readFileSync( file ) );
	// The studio works a photo at 3000 px on its long side; the same here.
	const f = Math.min( 1, 3000 / Math.max( img.width, img.height ) );
	const w = Math.round( img.width * f );
	const h = Math.round( img.height * f );
	const c = createCanvas( w, h );
	const g = c.getContext( '2d' );
	g.fillStyle = '#fff';
	g.fillRect( 0, 0, w, h );
	g.drawImage( img, 0, 0, w, h );
	const data = g.getImageData( 0, 0, w, h );
	// The page as it was sent, which the reader pairs the rows against.
	const sent = await loadImage(
		fs.readFileSync( path.join( dir, 'page-' + Number( pageArg || 1 ) + '.png' ) )
	);
	const tc = createCanvas( sent.width, sent.height );
	tc.getContext( '2d' ).drawImage( sent, 0, 0 );
	const template = tc
		.getContext( '2d' )
		.getImageData( 0, 0, sent.width, sent.height );
	const t0 = Date.now();
	const res = readFilledPage(
		{ width: w, height: h, data: data.data },
		page,
		aiMetrics( project.metrics ),
		{ template, bitmaps: true }
	);
	const ms = Date.now() - t0;
	if ( res.error ) {
		console.log( 'FAILED: ' + res.error );
		process.exit( 2 );
	}
	const found = new Map( res.glyphs.map( ( gl ) => [ gl.key, gl ] ) );
	const cols = 9;
	const tile = 150;
	const rows = Math.ceil( page.cells.length / cols );
	const sheet = createCanvas( cols * tile * 2, rows * ( tile + 22 ) );
	const s = sheet.getContext( '2d' );
	s.fillStyle = '#fff';
	s.fillRect( 0, 0, sheet.width, sheet.height );
	s.font = '16px sans-serif';
	page.cells.forEach( ( cell, i ) => {
		const x0 = ( i % cols ) * tile * 2;
		const y0 = Math.floor( i / cols ) * ( tile + 22 );
		// What the reader lifted out of this box (left) ...
		const gl = found.get( cell.key );
		if ( gl && gl.bmp ) {
			// The window is taller than wide: fit it, same scale both ways.
			const k = tile / Math.max( gl.bmp.w, gl.bmp.h );
			const tw = Math.round( gl.bmp.w * k );
			const th = Math.round( gl.bmp.h * k );
			const id = s.createImageData( tw, th );
			for ( let py = 0; py < th; py++ ) {
				for ( let px = 0; px < tw; px++ ) {
					const q =
						Math.min( gl.bmp.h - 1, Math.floor( py / k ) ) * gl.bmp.w +
						Math.min( gl.bmp.w - 1, Math.floor( px / k ) );
					const v = gl.bmp.data[ q ] ? 20 : 255;
					const o = ( py * tw + px ) * 4;
					id.data[ o ] = id.data[ o + 1 ] = id.data[ o + 2 ] = v;
					id.data[ o + 3 ] = 255;
				}
			}
			s.putImageData( id, x0 + Math.round( ( tile - tw ) / 2 ), y0 );
		}
		// ... and what the tracer made of it (right).
		if ( gl ) {
			// The whole reading window, as the bitmap on the left shows it.
			const m = aiMetrics( project.metrics );
			const perMm = ( m.ascender - m.descender ) / page.grid.cellH;
			const topU = m.ascender + AI_READ.above * perMm;
			const span =
				m.ascender - m.descender + ( AI_READ.above + AI_READ.below ) * perMm;
			const k = tile / span;
			const box = contourBounds( gl.contours );
			s.save();
			s.translate( x0 + tile + tile / 2, y0 + topU * k );
			s.scale( k, -k );
			s.translate( -( box.x0 + box.x1 ) / 2, 0 );
			s.beginPath();
			for ( const ring of gl.contours ) {
				const at = ( j ) => ring[ ( j + ring.length ) % ring.length ];
				const start = Math.max( 0, ring.findIndex( ( p ) => p.on ) );
				s.moveTo( at( start ).x, at( start ).y );
				let j = start + 1;
				while ( j <= start + ring.length ) {
					const p = at( j );
					if ( p.on ) {
						s.lineTo( p.x, p.y );
						j++;
						continue;
					}
					const n = at( j + 1 );
					if ( n.on ) {
						s.quadraticCurveTo( p.x, p.y, n.x, n.y );
						j += 2;
					} else {
						s.quadraticCurveTo( p.x, p.y, ( p.x + n.x ) / 2, ( p.y + n.y ) / 2 );
						j++;
					}
				}
				s.closePath();
			}
			s.fillStyle = '#111';
			s.fill( 'nonzero' );
			s.restore();
		}
		s.fillStyle = gl ? '#2a6' : '#c33';
		s.fillText( aiLabel( cell.key ) + ( gl ? '' : '  (empty)' ), x0 + 4, y0 + tile + 17 );
	} );
	const out = file.replace( /\.[a-z]+$/i, '' ) + '-glyphs.png';
	fs.writeFileSync( out, sheet.toBuffer( 'image/png' ) );
	// Letters that still touch the edge of what was read: cut there.
	const cut = { top: [], bottom: [], side: [] };
	for ( const gl of res.glyphs ) {
		const { w: bw, h: bh, data: bd } = gl.bmp;
		const rowInk = ( y ) => bd.subarray( y * bw, ( y + 1 ) * bw ).some( Boolean );
		let side = false;
		for ( let y = 0; y < bh && ! side; y++ ) {
			side = !! ( bd[ y * bw ] || bd[ y * bw + bw - 1 ] );
		}
		const name = aiLabel( gl.key );
		if ( rowInk( 0 ) ) {
			cut.top.push( name );
		}
		if ( rowInk( bh - 1 ) ) {
			cut.bottom.push( name );
		}
		if ( side ) {
			cut.side.push( name );
		}
	}
	console.log(
		'cut at the top: ' + ( cut.top.join( ' ' ) || '-' ) +
			' | bottom: ' + ( cut.bottom.join( ' ' ) || '-' ) +
			' | sides: ' + ( cut.side.join( ' ' ) || '-' )
	);
	console.log(
		'rows sent ' + res.rows.sent + ', found ' + res.rows.found + ', read ' + res.rows.read + ' by ' + res.rows.by +
			' (' + ms + ' ms)\n' +
		'read ' + res.glyphs.length + '/' + page.cells.length +
			' boxes; missing: ' +
			page.cells.filter( ( c2 ) => ! found.has( c2.key ) ).map( ( c2 ) => aiLabel( c2.key ) ).join( ' ' ) +
			'\n' + out
	);
}
