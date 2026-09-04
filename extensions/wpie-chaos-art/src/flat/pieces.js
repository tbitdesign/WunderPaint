/**
 * Pieces: the motif cut up and made into material.
 *
 * Reading a picture gives the painters a plan; cutting it gives them
 * things to hold. A piece is a small canvas with its own pixels and an
 * alpha edge - a plane of the picture torn out along its region, a
 * strip, a tile, a letter cut from a text - that a painter places like
 * any other mark: turned, scaled, torn or cut, with a paper shadow, and
 * treated first with one of the editor's effects (posterize, threshold,
 * halftone, duotone, edges, pixelate, glitch) so it stays material and
 * never becomes the photo again.
 *
 * Geometry here is pure and tested; the canvas work takes a factory.
 */

import { toHex } from './palette2d.js';

const clamp01 = ( v ) => Math.max( 0, Math.min( 1, v ) );

/** The picture covers the frame: the source rectangle that is shown. */
export function coverRect( iw, ih, aspect ) {
	const sa = iw / ih;
	if ( sa > aspect ) {
		const sw = ih * aspect;
		return { x: ( iw - sw ) / 2, y: 0, w: sw, h: ih };
	}
	const sh = iw / aspect;
	return { x: 0, y: ( ih - sh ) / 2, w: iw, h: sh };
}

/** Bounding box of a component's cells in frame units (x in 0..aspect). */
export function cellsBox( cells, cols, rows, aspect, pad = 0.5 ) {
	let x0 = Infinity;
	let y0 = Infinity;
	let x1 = -Infinity;
	let y1 = -Infinity;
	for ( const i of cells ) {
		const cx = i % cols;
		const cy = Math.floor( i / cols );
		x0 = Math.min( x0, cx );
		y0 = Math.min( y0, cy );
		x1 = Math.max( x1, cx + 1 );
		y1 = Math.max( y1, cy + 1 );
	}
	return {
		x: ( Math.max( 0, x0 - pad ) / cols ) * aspect,
		y: Math.max( 0, y0 - pad ) / rows,
		w:
			( ( Math.min( cols, x1 + pad ) - Math.max( 0, x0 - pad ) ) /
				cols ) *
			aspect,
		h: ( Math.min( rows, y1 + pad ) - Math.max( 0, y0 - pad ) ) / rows,
	};
}

/** The rectangles strips and tiles cut, in frame units. */
export function stripRects( aspect, n, vertical, rng ) {
	const out = [];
	for ( let i = 0; i < n; i++ ) {
		const t0 = i / n;
		const t1 = ( i + 1 ) / n;
		const j = ( ( rng() - 0.5 ) * 0.2 ) / n;
		if ( vertical ) {
			out.push( {
				x: ( t0 + j ) * aspect,
				y: 0,
				w: ( t1 - t0 - Math.abs( j ) ) * aspect,
				h: 1,
			} );
		} else {
			out.push( {
				x: 0,
				y: t0 + j,
				w: aspect,
				h: t1 - t0 - Math.abs( j ),
			} );
		}
	}
	return out;
}

export function tileRects( aspect, k, rng ) {
	const out = [];
	for ( let y = 0; y < k; y++ ) {
		for ( let x = 0; x < k; x++ ) {
			const jx = ( ( rng() - 0.5 ) * 0.15 ) / k;
			const jy = ( ( rng() - 0.5 ) * 0.15 ) / k;
			// Jitter stays inside the frame: edge tiles only move inward.
			const x0 = Math.max( 0, ( x + jx ) / k );
			const y0 = Math.max( 0, ( y + jy ) / k );
			const x1 = Math.min(
				1,
				( x + 1 + jx - Math.abs( jx ) ) / k + Math.abs( jx ) / k
			);
			const y1 = Math.min(
				1,
				( y + 1 + jy - Math.abs( jy ) ) / k + Math.abs( jy ) / k
			);
			out.push( {
				x: x0 * aspect,
				y: y0,
				w: Math.max( 0.02, x1 - x0 ) * aspect,
				h: Math.max( 0.02, y1 - y0 ),
			} );
		}
	}
	return out;
}

/**
 * Cut a picture into pieces.
 *
 * @param {Function} createCanvas (w, h) -> canvas.
 * @param {*}        image        The picture (drawImage accepts it), covering the frame.
 * @param {Object}   maps         The motif maps (comps, cols, rows, aspect, inside).
 * @param {Object}   o            { rng, kind: 'image'|'text', color: rgb for letters, edgePx }.
 * @return {Array} Pieces: { canvas, x, y, w, h, kind, plane, area } with the
 *                 source place and size in frame units.
 */
export function cutPieces( createCanvas, image, maps, o = {} ) {
	const rng = o.rng || Math.random;
	const aspect = maps.aspect;
	const iw = image.naturalWidth || image.width;
	const ih = image.naturalHeight || image.height;
	// Work at most at 1024 px on the long side of the shown part.
	const cover = coverRect( iw, ih, aspect );
	const S =
		Math.min( 1024 / Math.max( cover.w, cover.h ), 1 ) *
		Math.max( cover.w, cover.h );
	const px = ( v ) => ( v / Math.max( aspect, 1 ) ) * S; // frame unit -> px
	const pieces = [];
	const cutRect = ( r, kind, mask ) => {
		const w = Math.max( 4, Math.round( px( r.w ) ) );
		const h = Math.max( 4, Math.round( px( r.h ) ) );
		const c = createCanvas( w, h );
		const g = c.getContext( '2d' );
		// Source rect of this frame rect in picture pixels.
		const sx = cover.x + ( r.x / aspect ) * cover.w;
		const sy = cover.y + r.y * cover.h;
		const sw = ( r.w / aspect ) * cover.w;
		const sh = r.h * cover.h;
		if ( 'text' === o.kind ) {
			g.fillStyle = toHex( o.color || [ 0.9, 0.2, 0.2 ] );
			g.fillRect( 0, 0, w, h );
		} else {
			g.drawImage( image, sx, sy, sw, sh, 0, 0, w, h );
		}
		if ( mask ) {
			// The region's own cells as a soft alpha: a torn plane, not a box.
			const mc = createCanvas( mask.w, mask.h );
			const mg = mc.getContext( '2d' );
			const img = mg.createImageData( mask.w, mask.h );
			for ( let i = 0; i < mask.w * mask.h; i++ ) {
				img.data[ i * 4 + 3 ] = mask.data[ i ] ? 255 : 0;
			}
			mg.putImageData( img, 0, 0 );
			g.globalCompositeOperation = 'destination-in';
			g.imageSmoothingEnabled = true;
			g.drawImage( mc, 0, 0, w, h );
			g.globalCompositeOperation = 'source-over';
		}
		pieces.push( {
			canvas: c,
			x: r.x + r.w / 2,
			y: r.y + r.h / 2,
			w: r.w,
			h: r.h,
			kind,
			area: r.w * r.h,
		} );
	};
	const { cols, rows } = maps;
	if ( 'text' === o.kind ) {
		// Letters: every region of the mask that is inside.
		for ( const comp of maps.comps
			.filter( ( c ) => c.inside > 0.5 )
			.slice( 0, 24 ) ) {
			const box = cellsBox( comp.cells, cols, rows, aspect, 0.5 );
			const mask = maskOf( comp.cells, cols, rows, box, aspect );
			cutRect( box, 'letter', mask );
		}
		return pieces;
	}
	// Planes: the regions, torn out; the background last and only once.
	const comps = maps.comps.slice( 0, 12 );
	for ( const comp of comps ) {
		if ( comp.border > 0.5 && comp.share > 0.4 ) {
			continue; // a wall of a sky is no piece
		}
		const box = cellsBox( comp.cells, cols, rows, aspect, 0.5 );
		if ( box.w < 0.06 || box.h < 0.06 ) {
			continue;
		}
		cutRect( box, 'plane', maskOf( comp.cells, cols, rows, box, aspect ) );
	}
	// Strips and tiles: the picture as printed matter.
	const vertical = rng() < 0.5;
	for ( const r of stripRects(
		aspect,
		4 + Math.floor( rng() * 4 ),
		vertical,
		rng
	) ) {
		cutRect( r, 'strip', null );
	}
	for ( const r of tileRects( aspect, 3, rng ) ) {
		if ( rng() < 0.7 ) {
			cutRect( r, 'tile', null );
		}
	}
	return pieces;
}

/** A cell mask (1 inside the component) for a box, at cell resolution. */
function maskOf( cells, cols, rows, box, aspect ) {
	const cx0 = Math.floor( ( box.x / aspect ) * cols );
	const cy0 = Math.floor( box.y * rows );
	const w = Math.max( 1, Math.round( ( box.w / aspect ) * cols ) );
	const h = Math.max( 1, Math.round( box.h * rows ) );
	const data = new Uint8Array( w * h );
	for ( const i of cells ) {
		const x = ( i % cols ) - cx0;
		const y = Math.floor( i / cols ) - cy0;
		if ( x >= 0 && y >= 0 && x < w && y < h ) {
			data[ y * w + x ] = 1;
		}
	}
	return { data, w, h };
}

/* ------------------------------ treatment ------------------------------ */

export const TREATMENTS = [
	'none',
	'posterize',
	'threshold',
	'halftone',
	'duotone',
	'edges',
	'pixelate',
	'glitch',
];

/**
 * A treated copy of a piece: the effect run on its pixels, the alpha
 * kept. With no effects kit the copy is untouched.
 *
 * @param {Function} createCanvas Factory.
 * @param {Object}   piece        The piece.
 * @param {string}   treatment    One of TREATMENTS.
 * @param {Object}   fx           bridge.raster.effects or null.
 * @param {Object}   pal          Palette roles (dark, light, accent) for duotone.
 * @return {*} A canvas.
 */
export function treatPiece( createCanvas, piece, treatment, fx, pal ) {
	const src = piece.canvas;
	const c = createCanvas( src.width, src.height );
	const g = c.getContext( '2d' );
	g.drawImage( src, 0, 0 );
	if ( ! fx || 'none' === treatment ) {
		return c;
	}
	const img = g.getImageData( 0, 0, c.width, c.height );
	const alpha = new Uint8ClampedArray( img.data.length / 4 );
	for ( let i = 0; i < alpha.length; i++ ) {
		alpha[ i ] = img.data[ i * 4 + 3 ];
	}
	const cell = Math.max( 3, Math.round( c.width / 40 ) );
	const steps = {
		posterize: [ [ 'posterize', { levels: 4 } ] ],
		threshold: [ [ 'threshold', { level: 128 } ] ],
		halftone: [ [ 'halftone', { cell, angle: 30 } ] ],
		duotone: [
			[
				'duotone',
				{ shadow: toHex( pal.dark ), highlight: toHex( pal.light ) },
			],
		],
		edges: [ [ 'edgeDetect', { strength: 100 } ], [ 'invert' ] ],
		pixelate: [ [ 'pixelate', { cell: cell * 2 } ] ],
		glitch: [ [ 'glitch', { shift: 8, scanlines: 30, blocks: 20 } ] ],
	}[ treatment ];
	if ( steps && fx.run ) {
		try {
			fx.run( img, steps );
		} catch ( e ) {
			return c;
		}
	}
	for ( let i = 0; i < alpha.length; i++ ) {
		img.data[ i * 4 + 3 ] = alpha[ i ];
	}
	g.putImageData( img, 0, 0 );
	return c;
}

export const pieceShare = ( pieces ) =>
	pieces.reduce( ( a, p ) => a + clamp01( p.area ), 0 );
