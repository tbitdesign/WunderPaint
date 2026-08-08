/**
 * From a project to a family of font files.
 *
 * The order of work matters more than any single step. Outlines are
 * traced once per weight and then shared, so a composed character costs
 * an accent placement rather than a second trace. Spacing is decided
 * after composition, because an accent can widen a letter. Kerning is
 * decided after spacing, because it is a correction to it.
 *
 * The whole run is a generator. A full alphabet across three weights is
 * a few seconds of arithmetic, and a few seconds without a progress
 * bar is indistinguishable from a hung tab.
 */

import { ALL_KEYS, COMPOSED, UNITS_PER_EM, isMark, codepointOf } from './charset.js';
import { buildOutline, contourBounds, quantize } from './outline.js';
import { composeGlyph } from './compose.js';
import {
	DEFAULT_METRICS,
	DEFAULT_PEN,
	WEIGHTS,
	placeGlyph,
	spaceAdvance,
	edgeProfile,
	computeKerning,
	sanitizeMetrics,
} from './metrics.js';
import { stripTittle, resample } from './strokes.js';
import { buildFont } from './fontbuild.js';
import { mergeKerning } from './spacing.js';

/** A fresh, empty project. */
export function newProject( family = 'My Handwriting' ) {
	return {
		v: 1,
		family,
		metrics: { ...DEFAULT_METRICS },
		options: {
			pen: DEFAULT_PEN,
			smoothing: 40,
			influence: 0.5,
			tracking: 0,
			cursive: false,
			overlap: 24,
			slant: 0,
			nib: { angle: 30, ratio: 1 },
			weights: [ 'regular' ],
			kerning: true,
		},
		glyphs: {},
	};
}

const clampSlant = ( v ) => Math.max( -30, Math.min( 30, Number( v ) || 0 ) );

/**
 * The style name of one cut.
 *
 * The upright regular is the family's anchor, so its italic is called
 * Italic and not Regular Italic; every other cut carries its weight.
 * The font file and the file name have to agree on this, so both ask
 * here rather than each spelling out the rule.
 *
 * @param {Object}  weight One entry of WEIGHTS.
 * @param {boolean} italic Whether this is the leaning cut.
 * @return {string} Style name.
 */
export function styleNameFor( weight, italic ) {
	if ( ! italic ) {
		return weight.style;
	}
	return 'regular' === weight.id ? 'Italic' : `${ weight.style }Italic`;
}

/** Base side bearing for a weight, from the em and the pen it uses. */
export function sideFor( metrics, pen, widthFactor ) {
	return Math.round( metrics.unitsPerEm * 0.04 + pen * widthFactor * 0.35 );
}

/**
 * Densify a stored stroke before it is drawn.
 *
 * Strokes are stored thinned out, because that is what keeps a project
 * small enough to ride inside the font file. The rasteriser wants them
 * dense again, and putting the points back here means the storage
 * format and the drawing quality stop fighting each other.
 *
 * @param {Object} glyph Stored glyph.
 * @return {Object} Glyph with dense strokes.
 */
export function densify( glyph ) {
	if ( ! glyph || 'scan' === glyph.src || ! glyph.strokes ) {
		return glyph;
	}
	return {
		...glyph,
		strokes: glyph.strokes.map( ( st ) => ( {
			w: st.w,
			pts: st.pts.length > 1 ? resample( st.pts, 9 ) : st.pts,
		} ) ),
	};
}

/**
 * Run one weight of the family.
 *
 * @param {Object} project Project.
 * @param {Object} weight  One entry of WEIGHTS.
 * @param {Object} opts    `{ italic, onStep }`.
 * @return {Generator} Yields progress, returns the font bytes.
 */
export function* buildWeightSteps( project, weight, opts = {} ) {
	const metrics = sanitizeMetrics( project.metrics || DEFAULT_METRICS );
	const o = project.options || {};
	const pen = o.pen || DEFAULT_PEN;
	const italic = !! opts.italic;
	const slant = clampSlant( ( o.slant || 0 ) + ( italic ? 11 : 0 ) );
	const cursive = !! o.cursive;

	const drawn = ALL_KEYS.filter( ( k ) => project.glyphs && project.glyphs[ k ] );
	const outlines = new Map();
	let step = 0;
	const total = drawn.length + Object.keys( COMPOSED ).length;

	for ( const key of drawn ) {
		const glyph = densify( project.glyphs[ key ] );
		outlines.set(
			key,
			buildOutline( glyph, {
				widthFactor: weight.widthFactor,
				inkDelta: weight.inkDelta,
				slant,
				influence: o.influence ?? 0.5,
				nib: o.nib || null,
				unitsPerEm: metrics.unitsPerEm,
			} )
		);
		yield { phase: 'trace', done: ++step, total, key };
	}

	// The dotless forms exist only to carry an accent.
	for ( const [ base, key ] of [
		[ 'i', 'dotless:i' ],
		[ 'j', 'dotless:j' ],
	] ) {
		const src = project.glyphs && project.glyphs[ base ];
		if ( ! src || 'scan' === src.src ) {
			continue;
		}
		const bare = { ...densify( src ), strokes: stripTittle( densify( src ).strokes, metrics.xHeight ) };
		outlines.set(
			key,
			buildOutline( bare, {
				widthFactor: weight.widthFactor,
				inkDelta: weight.inkDelta,
				slant,
				influence: o.influence ?? 0.5,
				nib: o.nib || null,
				unitsPerEm: metrics.unitsPerEm,
			} )
		);
	}

	const composed = new Map();
	for ( const ch of Object.keys( COMPOSED ) ) {
		const rec = COMPOSED[ ch ];
		const baseKey = rec.dotless && outlines.has( `dotless:${ rec.base }` )
			? `dotless:${ rec.base }`
			: rec.base;
		const base = outlines.get( baseKey );
		const mark = outlines.get( rec.mark );
		if ( base && base.length && mark && mark.length ) {
			composed.set( ch, composeGlyph( base, mark, rec.pos, metrics ) );
		}
		yield { phase: 'compose', done: ++step, total, key: ch };
	}

	const side = sideFor( metrics, pen, weight.widthFactor );
	const entries = [];
	const add = ( key, contours ) => {
		if ( isMark( key ) || ! contours || ! contours.length ) {
			return;
		}
		const placed = placeGlyph( contours, {
			side,
			tracking: o.tracking || 0,
			cursive,
			overlap: Math.round( pen * weight.widthFactor * ( o.overlap ?? 24 ) / 62 ),
			nudgeL: project.glyphs?.[ key ]?.nudgeL || 0,
			nudgeR: project.glyphs?.[ key ]?.nudgeR || 0,
		} );
		if ( ! placed.contours.length ) {
			return;
		}
		entries.push( {
			key,
			codepoint: codepointOf( key ),
			contours: quantize( placed.contours ),
			advance: placed.advance,
			lsb: placed.lsb,
		} );
	};

	for ( const key of drawn ) {
		add( key, outlines.get( key ) );
	}
	for ( const [ ch, contours ] of composed ) {
		add( ch, contours );
	}

	const lower = entries.filter( ( e ) => e.codepoint >= 97 && e.codepoint <= 122 );
	const avg = lower.length
		? lower.reduce( ( s, e ) => s + e.advance, 0 ) / lower.length
		: metrics.unitsPerEm * 0.5;
	entries.push( {
		key: ' ',
		codepoint: 32,
		contours: [],
		advance: spaceAdvance( avg, { tracking: o.tracking || 0, cursive } ),
		lsb: 0,
	} );

	entries.sort( ( a, b ) => a.codepoint - b.codepoint );

	let kerning = [];
	const gidOf = new Map();
	entries.forEach( ( e, i ) => {
		if ( e.key && ! isMark( e.key ) ) {
			gidOf.set( e.key, i + 1 );
		}
	} );
	if ( o.kerning !== false && ! cursive ) {
		const withProfiles = entries.map( ( e, i ) => ( {
			key: i + 1,
			advance: e.advance,
			profile: e.contours.length ? edgeProfile( e.contours, metrics ) : null,
		} ) );
		kerning = computeKerning( withProfiles, {
			target: Math.round( side * 1.55 ),
			limit: Math.round( metrics.unitsPerEm * 0.12 ),
			minAbs: Math.max( 8, Math.round( metrics.unitsPerEm * 0.012 ) ),
		} );
		yield { phase: 'kern', done: total, total, key: '' };
	}
	// Corrections made by hand apply whatever the automatic pass did, and
	// whether or not it ran at all.
	kerning = mergeKerning( kerning, project.kerns, gidOf );

	const family = ( project.family || 'My Handwriting' ).trim() || 'My Handwriting';
	const styleName = styleNameFor( weight, italic );
	const psFamily = family.replace( /[^\x20-\x7E]/g, '' ).replace( /\s+/g, '' ) || 'Handwriting';

	return buildFont( {
		metrics,
		weight: weight.weight,
		italicAngle: italic || slant ? -Math.abs( slant || 11 ) : 0,
		names: {
			1: family,
			2: styleName,
			3: `${ family } ${ styleName } (WunderPaint)`,
			4: `${ family } ${ styleName }`,
			5: 'Version 1.000',
			6: `${ psFamily }-${ styleName.replace( /\s+/g, '' ) }`,
			8: 'Made with WunderPaint',
		},
		glyphs: entries,
		kerning,
		project: opts.project || null,
	} );
}

/** Run a generator to the end and hand back its return value. */
export function drain( gen, onStep ) {
	let res = gen.next();
	while ( ! res.done ) {
		if ( onStep ) {
			onStep( res.value );
		}
		res = gen.next();
	}
	return res.value;
}

/**
 * Which cuts a project will produce, before any of them are built.
 *
 * Both the synchronous build here and the sliced build the dialog runs
 * work from this list, so the file names, style names and order cannot
 * drift apart between them.
 *
 * @param {Object} project Project.
 * @return {Array} `{ id, weight, italic, style, filename }` records.
 */
export function familyPlan( project ) {
	const wanted = new Set( project.options?.weights || [ 'regular' ] );
	const cuts = WEIGHTS.filter( ( w ) => wanted.has( w.id ) );
	const list = cuts.length ? cuts : [ WEIGHTS[ 1 ] ];
	const italic = !! project.options?.italic;
	const out = [];
	for ( const w of list ) {
		for ( const it of italic ? [ false, true ] : [ false ] ) {
			const style = styleNameFor( w, it );
			out.push( {
				id: it ? `${ w.id }-italic` : w.id,
				cut: w,
				weight: w.weight,
				italic: it,
				style,
				filename: `${ slugify( project.family ) }-${ style.toLowerCase() }.ttf`,
			} );
		}
	}
	return out;
}

/**
 * Build every weight the project asks for, in one go.
 *
 * @param {Object} project Project.
 * @param {Object} opts    `{ project: Uint8Array, onStep }`.
 * @return {Array} Plan records with their `bytes` filled in.
 */
export function buildFamily( project, opts = {} ) {
	return familyPlan( project ).map( ( entry ) => ( {
		...entry,
		bytes: drain(
			buildWeightSteps( project, entry.cut, { italic: entry.italic, project: opts.project } ),
			opts.onStep
		),
	} ) );
}

/** How many files a project will produce, for the UI to say so upfront. */
export const plannedCuts = ( project ) => familyPlan( project ).length;

export function slugify( name ) {
	return (
		String( name || 'handwriting' )
			.toLowerCase()
			.normalize( 'NFD' )
			.replace( /[̀-ͯ]/g, '' )
			.replace( /[^a-z0-9]+/g, '-' )
			.replace( /^-+|-+$/g, '' ) || 'handwriting'
	);
}

export { UNITS_PER_EM, contourBounds };
