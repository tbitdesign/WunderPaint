/**
 * From stored glyph data to the outline that goes into the file.
 *
 * This is the single place where the two kinds of glyph meet. A drawn
 * glyph still has its centre lines, so a different weight simply means
 * drawing it again with a wider pen. A scanned glyph has only its
 * outline, so a different weight means filling that outline back in and
 * growing or shrinking the ink. Both then leave through the same
 * tracer, and callers downstream never learn which was which.
 */

import { strokesToBitmap, fillContours, viewFor, morph, toUx, toUy } from './raster.js';
import { traceToContours, normalizeWinding } from './trace.js';
import { slant as slantStrokes, reweight, strokeBounds } from './strokes.js';

/** Resolution the glyph is rendered at before tracing, in pixels per em. */
export const TRACE_PX_PER_EM = 768;

/**
 * Exact bounding box of quadratic contours.
 *
 * Control points alone would overstate the box, and an overstated box
 * shows up directly as side bearings that are too wide, so the curve
 * extrema are solved for rather than approximated.
 *
 * @param {Array} contours Contours of `{ x, y, on }`.
 * @return {Object|null} `{ x0, y0, x1, y1 }` or null when there is no ink.
 */
export function contourBounds( contours ) {
	let x0 = Infinity;
	let y0 = Infinity;
	let x1 = -Infinity;
	let y1 = -Infinity;
	const eat = ( x, y ) => {
		x0 = Math.min( x0, x );
		y0 = Math.min( y0, y );
		x1 = Math.max( x1, x );
		y1 = Math.max( y1, y );
	};
	for ( const c of contours || [] ) {
		const on = c.filter( ( p ) => p.on );
		if ( ! on.length ) {
			continue;
		}
		for ( const p of on ) {
			eat( p.x, p.y );
		}
		// Every off-curve point sits between two on-curve points; the
		// curve only leaves their box at an extremum, so solve for it.
		for ( let i = 0; i < c.length; i++ ) {
			if ( c[ i ].on ) {
				continue;
			}
			const prev = prevOn( c, i );
			const next = nextOn( c, i );
			const ctrl = c[ i ];
			eat( ...extremum( prev.x, ctrl.x, next.x, prev.y, ctrl.y, next.y ) );
		}
	}
	return Number.isFinite( x0 ) ? { x0, y0, x1, y1 } : null;
}

function prevOn( c, i ) {
	for ( let k = 1; k <= c.length; k++ ) {
		const p = c[ ( i - k + c.length * 2 ) % c.length ];
		if ( p.on ) {
			return p;
		}
	}
	return c[ i ];
}

function nextOn( c, i ) {
	for ( let k = 1; k <= c.length; k++ ) {
		const p = c[ ( i + k ) % c.length ];
		if ( p.on ) {
			return p;
		}
	}
	return c[ i ];
}

function extremum( ax, cx, bx, ay, cy, by ) {
	const at = ( a, c, b ) => {
		const den = a - 2 * c + b;
		if ( Math.abs( den ) < 1e-9 ) {
			return null;
		}
		const t = ( a - c ) / den;
		return t > 0 && t < 1 ? ( 1 - t ) * ( 1 - t ) * a + 2 * ( 1 - t ) * t * c + t * t * b : null;
	};
	const ex = at( ax, cx, bx );
	const ey = at( ay, cy, by );
	return [ null === ex ? cx : ex, null === ey ? cy : ey ];
}

/** Apply an affine map to contours. */
export function transformContours( contours, m ) {
	const { a = 1, b = 0, c = 0, d = 1, e = 0, f = 0 } = m || {};
	return ( contours || [] ).map( ( ring ) =>
		ring.map( ( p ) => ( {
			x: a * p.x + c * p.y + e,
			y: b * p.x + d * p.y + f,
			on: p.on,
		} ) )
	);
}

/** Shift contours, which is how a glyph is placed on its side bearing. */
export const translateContours = ( contours, dx, dy = 0 ) =>
	transformContours( contours, { e: dx, f: dy } );

/**
 * Build the outline of one glyph at one weight and slant.
 *
 * @param {Object} glyph Stored glyph.
 * @param {Object} opts  Options.
 * @param {number} opts.widthFactor Pen width multiplier (the weight).
 * @param {number} opts.inkDelta    Ink growth for scanned glyphs, in units.
 * @param {number} opts.slant       Slant angle in degrees.
 * @param {number} opts.influence   Pressure influence 0..1.
 * @param {number} opts.pxPerEm     Trace resolution.
 * @param {number} opts.unitsPerEm  Em size.
 * @return {Array} Contours of `{ x, y, on }`, wound for non-zero fill.
 */
export function buildOutline( glyph, opts = {} ) {
	const {
		widthFactor = 1,
		inkDelta = 0,
		slant: slantDeg = 0,
		influence = 0.5,
		nib = null,
		pxPerEm = TRACE_PX_PER_EM,
		unitsPerEm = 1000,
	} = opts;
	if ( ! glyph ) {
		return [];
	}

	if ( 'scan' === glyph.src ) {
		let contours = ( glyph.contours || [] ).map( ( ring ) =>
			ring.map( ( p ) => ( { x: p.x, y: p.y, on: false !== p.on } ) )
		);
		if ( ! contours.length ) {
			return [];
		}
		if ( inkDelta ) {
			contours = regrow( contours, inkDelta, { pxPerEm, unitsPerEm } );
		}
		if ( slantDeg ) {
			contours = transformContours( contours, {
				c: Math.tan( ( slantDeg * Math.PI ) / 180 ),
			} );
		}
		return normalizeWinding( contours );
	}

	let strokes = glyph.strokes || [];
	if ( ! strokes.length ) {
		return [];
	}
	if ( 1 !== widthFactor ) {
		strokes = reweight( strokes, widthFactor );
	}
	if ( slantDeg ) {
		strokes = slantStrokes( strokes, slantDeg );
	}
	const box = strokeBounds( strokes, influence );
	if ( ! box ) {
		return [];
	}
	const view = viewFor( box, { pxPerEm, pad: 6, unitsPerEm } );
	const bmp = strokesToBitmap( strokes, view, { influence, nib } );
	return normalizeWinding(
		traceToContours( bmp, {
			toUnits: ( p ) => ( { x: toUx( view, p.x ), y: toUy( view, p.y ) } ),
		} )
	);
}

/**
 * Grow or shrink the ink of an already-outlined glyph.
 *
 * Scanned letters have no centre line to redraw, so the only honest way
 * to a bolder cut is to thicken the ink itself and read the shape back.
 *
 * @param {Array}  contours Contours.
 * @param {number} delta    Units of ink to add, negative to remove.
 * @param {Object} opts     `{ pxPerEm, unitsPerEm }`.
 * @return {Array} New contours.
 */
export function regrow( contours, delta, { pxPerEm = TRACE_PX_PER_EM, unitsPerEm = 1000 } = {} ) {
	const box = contourBounds( contours );
	if ( ! box ) {
		return contours;
	}
	const pad = Math.abs( delta ) + 20;
	const view = viewFor(
		{ x0: box.x0 - pad, y0: box.y0 - pad, x1: box.x1 + pad, y1: box.y1 + pad },
		{ pxPerEm, pad: 4, unitsPerEm }
	);
	const filled = fillContours(
		contours.map( ( ring ) => ring.filter( ( p ) => p.on ) ),
		view
	);
	const grown = morph( filled, delta * view.scale );
	return traceToContours( grown, {
		toUnits: ( p ) => ( { x: toUx( view, p.x ), y: toUy( view, p.y ) } ),
	} );
}

/**
 * Quantise to whole units and drop contours that carry no area.
 *
 * Font files store integers, and rounding late rather than early keeps
 * the compounding error out of the composed glyphs.
 *
 * @param {Array} contours Contours.
 * @return {Array} Integer contours.
 */
export function quantize( contours ) {
	return ( contours || [] )
		.map( ( ring ) =>
			ring.map( ( p ) => ( { x: Math.round( p.x ), y: Math.round( p.y ), on: p.on } ) )
		)
		.map( dropRepeats )
		.filter( ( ring ) => ring.length >= 3 );
}

function dropRepeats( ring ) {
	const out = [];
	for ( const p of ring ) {
		const last = out[ out.length - 1 ];
		if ( ! last || last.x !== p.x || last.y !== p.y || last.on !== p.on ) {
			out.push( p );
		}
	}
	while (
		out.length > 1 &&
		out[ 0 ].x === out[ out.length - 1 ].x &&
		out[ 0 ].y === out[ out.length - 1 ].y &&
		out[ 0 ].on === out[ out.length - 1 ].on
	) {
		out.pop();
	}
	return out;
}
