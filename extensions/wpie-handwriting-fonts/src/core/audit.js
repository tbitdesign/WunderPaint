/**
 * Looking over the alphabet the way a second pair of eyes would.
 *
 * After a sheet comes back there can be eighty letters to check, and the
 * mistakes that matter are exactly the ones that are invisible one
 * letter at a time: a letter that floats above the line, one that came
 * out half a size too big, one that is much wider than its neighbours.
 * Each looks fine on its own and shows up instantly in a word.
 *
 * Everything here compares a letter with the other letters of its own
 * kind, never with a fixed ideal, because a hand is allowed to be a
 * hand. What it is not allowed to be is inconsistent with itself.
 */

import { strokeBounds } from './strokes.js';
import { contourBounds } from './outline.js';
import { isMark } from './charset.js';

/** Letters that are supposed to hang below the line. */
const DESCENDS = new Set( Array.from( 'gjpqyf,;()[]{}/QÇç@' ) );

/**
 * Which letters are supposed to reach the same height.
 *
 * Comparing every lowercase letter's total height against every other
 * would flag the whole alphabet: a b is taller than an a because it has
 * an ascender, and a g reaches lower because it has a descender, and
 * neither is a mistake. Letters are only ever compared with the ones
 * that should end up level with them.
 */
const TOP_TALL = new Set( Array.from( 'bdfhklt' ) );

/** Letters whose ink legitimately stops short of the line. */
const FLOATS = new Set( Array.from( '\'"^~`´¨°*-—–' ) );

/** The set of letters a letter's height should agree with. */
export function topGroup( key ) {
	const cls = classOf( key );
	if ( 'upper' === cls || 'digit' === cls ) {
		return cls;
	}
	if ( 'lower' === cls ) {
		return TOP_TALL.has( key ) ? 'ascender' : 'xheight';
	}
	return 'other';
}

/** The class a character belongs to, for comparing like with like. */
export function classOf( key ) {
	if ( isMark( key ) ) {
		return 'mark';
	}
	if ( /[A-ZÀ-ÞŒ]/.test( key ) ) {
		return 'upper';
	}
	if ( /[a-zß-öø-ÿœ]/.test( key ) ) {
		return 'lower';
	}
	if ( /[0-9]/.test( key ) ) {
		return 'digit';
	}
	return 'other';
}

/** The ink box of a stored glyph, without tracing it. */
export function inkBox( glyph ) {
	if ( ! glyph ) {
		return null;
	}
	if ( 'scan' === glyph.src ) {
		return contourBounds( glyph.contours );
	}
	return strokeBounds( glyph.strokes );
}

const median = ( xs ) => {
	if ( ! xs.length ) {
		return 0;
	}
	const s = xs.slice().sort( ( a, b ) => a - b );
	return s[ s.length >> 1 ];
};

/**
 * Everything worth a second look.
 *
 * @param {Object} project Project.
 * @return {Array} `{ key, issues, offset }` records, worst first.
 */
export function auditGlyphs( project ) {
	const metrics = project.metrics || {};
	const em = metrics.unitsPerEm || 1000;
	const boxes = new Map();
	for ( const key of Object.keys( project.glyphs || {} ) ) {
		const box = inkBox( project.glyphs[ key ] );
		if ( box ) {
			boxes.set( key, box );
		}
	}
	const byClass = new Map();
	const byTop = new Map();
	for ( const [ key, box ] of boxes ) {
		const cls = classOf( key );
		if ( ! byClass.has( cls ) ) {
			byClass.set( cls, [] );
		}
		byClass.get( cls ).push( box );
		const top = topGroup( key );
		if ( 'other' !== top ) {
			if ( ! byTop.has( top ) ) {
				byTop.set( top, [] );
			}
			byTop.get( top ).push( box.y1 );
		}
	}
	const widthOf = new Map();
	for ( const [ cls, list ] of byClass ) {
		widthOf.set( cls, median( list.map( ( e ) => e.x1 - e.x0 ) ) );
	}
	const topOf = new Map();
	for ( const [ group, list ] of byTop ) {
		topOf.set( group, median( list ) );
	}

	const out = [];
	for ( const [ key, box ] of boxes ) {
		const cls = classOf( key );
		if ( 'mark' === cls ) {
			continue;
		}
		const issues = [];
		let offset = 0;

		if ( ! DESCENDS.has( key ) && ! FLOATS.has( key ) ) {
			// A letter should stand on the line, not hover over it or
			// sink through it. A twentieth of an em is already visible.
			if ( Math.abs( box.y0 ) > em * 0.05 ) {
				issues.push( box.y0 > 0 ? 'floats' : 'sinks' );
				offset = -box.y0;
			}
		}

		const group = topGroup( key );
		const wantTop = topOf.get( group );
		if ( wantTop > 0 && 'other' !== group ) {
			if ( box.y1 > wantTop * 1.22 ) {
				issues.push( 'tall' );
			} else if ( box.y1 < wantTop * 0.78 ) {
				issues.push( 'short' );
			}
		}

		const wantWidth = widthOf.get( cls ) || 0;
		if ( wantWidth > 0 && box.x1 - box.x0 > wantWidth * 2.1 ) {
			issues.push( 'wide' );
		}
		if ( issues.length ) {
			out.push( { key, issues, offset: Math.round( offset ) } );
		}
	}
	return out.sort( ( a, b ) => b.issues.length - a.issues.length || Math.abs( b.offset ) - Math.abs( a.offset ) );
}

/**
 * Stand a glyph on the baseline.
 *
 * @param {Object} project Project.
 * @param {string} key     Drawable key.
 * @return {boolean} Whether anything moved.
 */
export function snapToBaseline( project, key ) {
	const glyph = project.glyphs && project.glyphs[ key ];
	const box = inkBox( glyph );
	if ( ! box || ! Math.round( box.y0 ) ) {
		return false;
	}
	const dy = -box.y0;
	if ( 'scan' === glyph.src ) {
		glyph.contours = glyph.contours.map( ( ring ) =>
			ring.map( ( p ) => ( { ...p, y: p.y + dy } ) )
		);
	} else {
		glyph.strokes = glyph.strokes.map( ( st ) => ( {
			w: st.w,
			pts: st.pts.map( ( p ) => ( { ...p, y: p.y + dy } ) ),
		} ) );
	}
	glyph.rev = ( glyph.rev || 0 ) + 1;
	return true;
}
