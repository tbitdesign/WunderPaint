/**
 * A complete synthetic hand, for QA and for the specimen sheet.
 *
 * Every required character gets strokes, so the build path can be
 * exercised end to end without anyone drawing eighty letters by hand.
 * The shapes are deliberately crude: what is being tested is the
 * machinery, and a crude shape exercises it exactly as well as a
 * beautiful one while being reproducible.
 */

import { newProject } from '../src/core/build.js';
import { REQUIRED_KEYS, MARKS } from '../src/core/charset.js';

const PEN = 62;
const line = ( pts ) => ( {
	w: PEN,
	pts: pts.map( ( [ x, y ] ) => ( { x, y, p: 0.5 } ) ),
} );

function arc( cx, cy, r, from, to, steps = 24 ) {
	const pts = [];
	for ( let i = 0; i <= steps; i++ ) {
		const a = from + ( ( to - from ) * i ) / steps;
		pts.push( [ cx + Math.cos( a ) * r, cy + Math.sin( a ) * r ] );
	}
	return line( pts );
}

/** A deterministic pseudo-letter built from the character's own code. */
function shapeFor( key, code ) {
	const cap = /[A-Z0-9]/.test( key );
	const top = cap ? 700 : 460;
	const wide = 300 + ( code % 5 ) * 30;
	const kind = code % 6;
	if ( 0 === kind ) {
		return [ arc( wide / 2, top / 2, Math.min( wide, top ) / 2, 0, Math.PI * 2 ) ];
	}
	if ( 1 === kind ) {
		return [ line( [ [ 40, 0 ], [ 40, top ] ] ), arc( wide / 2, top / 2, wide / 2, -1.4, 1.4 ) ];
	}
	if ( 2 === kind ) {
		return [ line( [ [ 30, 0 ], [ wide / 2, top ] ] ), line( [ [ wide / 2, top ], [ wide, 0 ] ] ) ];
	}
	if ( 3 === kind ) {
		return [ line( [ [ 40, 0 ], [ 40, top ] ] ), line( [ [ 40, top ], [ wide, top ] ] ), line( [ [ 40, top / 2 ], [ wide * 0.8, top / 2 ] ] ) ];
	}
	if ( 4 === kind ) {
		return [ arc( wide / 2, top * 0.5, wide / 2, 0.6, 5.7 ) ];
	}
	return [ line( [ [ 40, 0 ], [ 40, top ] ] ), arc( wide * 0.6, top * 0.7, wide * 0.35, Math.PI, 0 ), line( [ [ wide, top * 0.7 ], [ wide, 0 ] ] ) ];
}

/** Punctuation is small and sits low, which the layout rules care about. */
function punctuationFor( key ) {
	if ( '.' === key || ',' === key ) {
		return [ line( [ [ 60, 0 ], [ 60, 12 ] ] ) ];
	}
	if ( "'" === key || '"' === key ) {
		return [ line( [ [ 60, 380 ], [ 60, 460 ] ] ) ];
	}
	if ( '-' === key ) {
		return [ line( [ [ 30, 240 ], [ 230, 240 ] ] ) ];
	}
	if ( '(' === key || ')' === key ) {
		return [ arc( 120, 300, 190, 2.1, 4.2 ) ];
	}
	if ( '/' === key ) {
		return [ line( [ [ 20, -60 ], [ 240, 640 ] ] ) ];
	}
	return [ line( [ [ 70, 0 ], [ 70, 60 ] ] ), line( [ [ 70, 150 ], [ 70, 440 ] ] ) ];
}

/**
 * Build a project with every required character drawn.
 *
 * @param {string} family Family name.
 * @return {Object} Project.
 */
export function sampleProject( family = 'QA Hand' ) {
	const p = newProject( family );
	p.id = 'qa-sample';
	for ( const key of REQUIRED_KEYS ) {
		const code = key.codePointAt( 0 );
		const strokes = /[A-Za-z0-9]/.test( key ) ? shapeFor( key, code ) : punctuationFor( key );
		p.glyphs[ key ] = { src: 'draw', strokes, rev: 1 };
	}
	p.glyphs[ MARKS[ 0 ] ] = { src: 'draw', strokes: [ line( [ [ 40, 560 ], [ 160, 660 ] ] ) ], rev: 1 };
	p.glyphs[ MARKS[ 4 ] ] = {
		src: 'draw',
		strokes: [ line( [ [ 40, 590 ], [ 40, 620 ] ] ), line( [ [ 170, 590 ], [ 170, 620 ] ] ) ],
		rev: 1,
	};
	return p;
}
