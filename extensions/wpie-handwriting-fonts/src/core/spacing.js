/**
 * Spacing corrections made by hand.
 *
 * Automatic spacing is right about nine times in ten, and the tenth is
 * the one everybody notices: a capital A next to a capital V, a T with
 * an o tucked under its arm. Those need a person to look and decide, and
 * the decision has to survive, so it is kept with the project and wins
 * over whatever the automatic pass would have said.
 *
 * Two kinds of correction live here. A kern belongs to a pair of
 * characters and moves them relative to each other. A nudge belongs to
 * one character and changes the air on its left or its right, which is
 * the right tool when a letter is wrong against everything rather than
 * against one neighbour.
 */

/** The key a pair correction is stored under. */
export const pairKey = ( a, b ) => `${ a }${ b }`;

/**
 * The hand-made correction for a pair, if there is one.
 *
 * @param {Object} project Project.
 * @param {string} a       Left character.
 * @param {string} b       Right character.
 * @return {number|null} Correction in font units, or null.
 */
export function manualKern( project, a, b ) {
	const k = project && project.kerns;
	if ( ! k || ! a || ! b ) {
		return null;
	}
	const v = k[ pairKey( a, b ) ];
	return 'number' === typeof v ? v : null;
}

/**
 * Record a correction for a pair, or drop it when it comes back to zero.
 *
 * @param {Object} project Project.
 * @param {string} a       Left character.
 * @param {string} b       Right character.
 * @param {number} value   Correction in font units.
 */
export function setManualKern( project, a, b, value ) {
	if ( ! project.kerns ) {
		project.kerns = {};
	}
	const key = pairKey( a, b );
	if ( ! value ) {
		delete project.kerns[ key ];
	} else {
		project.kerns[ key ] = Math.round( value );
	}
}

/**
 * Move the air around one character.
 *
 * @param {Object} project Project.
 * @param {string} key     Drawable key.
 * @param {number} left    Change to the left bearing.
 * @param {number} right   Change to the right bearing.
 */
export function nudgeGlyph( project, key, left, right ) {
	const g = project.glyphs && project.glyphs[ key ];
	if ( ! g ) {
		return;
	}
	g.nudgeL = Math.round( ( g.nudgeL || 0 ) + left );
	g.nudgeR = Math.round( ( g.nudgeR || 0 ) + right );
	if ( ! g.nudgeL ) {
		delete g.nudgeL;
	}
	if ( ! g.nudgeR ) {
		delete g.nudgeR;
	}
}

/** Every hand-made correction, gone. */
export function clearSpacing( project ) {
	project.kerns = {};
	for ( const key of Object.keys( project.glyphs || {} ) ) {
		delete project.glyphs[ key ].nudgeL;
		delete project.glyphs[ key ].nudgeR;
	}
}

/** How many corrections are on record, for the panel to report. */
export function spacingCount( project ) {
	const pairs = Object.keys( project.kerns || {} ).length;
	let nudged = 0;
	for ( const key of Object.keys( project.glyphs || {} ) ) {
		const g = project.glyphs[ key ];
		if ( g.nudgeL || g.nudgeR ) {
			nudged++;
		}
	}
	return { pairs, nudged };
}

/**
 * Fold the hand-made pair corrections into an automatic kerning table.
 *
 * The automatic pass works in glyph ids because that is what the font
 * file stores; the corrections are made against characters because that
 * is what a person sees. This is where the two meet, and a correction
 * replaces the automatic value for its pair rather than adding to it,
 * so what was set is what comes out.
 *
 * @param {Array}  auto    `[ leftGid, rightGid, value ]` triples.
 * @param {Object} kerns   Hand-made corrections keyed by character pair.
 * @param {Map}    gidOf   Character to glyph id.
 * @return {Array} Merged triples.
 */
export function mergeKerning( auto, kerns, gidOf ) {
	const out = [];
	const manual = new Map();
	for ( const key of Object.keys( kerns || {} ) ) {
		const chars = Array.from( key );
		if ( 2 !== chars.length ) {
			continue;
		}
		const l = gidOf.get( chars[ 0 ] );
		const r = gidOf.get( chars[ 1 ] );
		if ( undefined === l || undefined === r ) {
			continue;
		}
		manual.set( `${ l }:${ r }`, [ l, r, Math.round( kerns[ key ] ) ] );
	}
	for ( const [ l, r, v ] of auto || [] ) {
		if ( ! manual.has( `${ l }:${ r }` ) ) {
			out.push( [ l, r, v ] );
		}
	}
	for ( const triple of manual.values() ) {
		if ( triple[ 2 ] ) {
			out.push( triple );
		}
	}
	return out;
}
