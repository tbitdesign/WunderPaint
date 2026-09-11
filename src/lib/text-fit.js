/**
 * Fluid Text (v1.429): the box sets the type. A text layer with
 * `textFit: 'fluid'` stores only its words, typography and box. Line
 * breaks, per-line sizes and leading are DERIVED here at paint time, so
 * nothing in the document can go stale: every line is sized to fill the
 * box width, the words are spread over lines so the stack fills the box
 * height as closely as possible, and what is left goes into the gaps.
 * Spec: docs/superpowers/specs/2026-09-04-fluid-text-design.md
 *
 * Text Looks (v1.430): with `textLook` on the layer, the text is split
 * into segments (paragraphs, then sentences), every segment gets a role
 * from the look, and the role brings its face, weight, casing, tracking,
 * colour, width share and the air after it. The look is derived too,
 * never baked. Spec: docs/superpowers/specs/2026-09-04-text-looks-design.md
 *
 * Pure: no editor imports. Measures through raster/env's canvas factory,
 * NOT through text-metrics (which applies this view and would form a
 * cycle).
 */

import { createCanvas } from './raster/env';
import {
	normalizeSpans,
	resolveStyle,
	spansText,
	textRuns,
	withTextTransform,
	applyCase,
	caseOf,
} from './rich-text';
import {
	accentFor,
	assignRoles,
	emphTarget,
	endsSentence,
	roleStyle,
	splitSegments,
} from './text-look';

const R = 100; // reference size for measuring
const SIZE_MIN = 2;
const SIZE_MAX = 4096;
const DP_WORDS = 150; // above: greedy
const BUCKETS = 400;
const GAP_CAP = 0.6; // extra leading per gap, in the smaller neighbour's size
const EPS = 0.01;
// Role hierarchy of a look: the hero's base size is its segment set on ONE
// line; the other roles may not grow past their ratio of it and wrap
// greedily at that size instead of chasing the box height.
const ROLE_CAP = { eyebrow: 0.5, sub: 0.8, detail: 0.55 };

let measureCtx = null;
const ctxOf = () => {
	if ( ! measureCtx ) {
		measureCtx = createCanvas( 1, 1 ).getContext( '2d' );
	}
	return measureCtx;
};

/** A text layer in fluid mode (path, shape and curved text stay out). */
export const isFluidText = ( layer ) =>
	!! layer &&
	'text' === layer.type &&
	'fluid' === layer.textFit &&
	! layer.textPath &&
	! layer.shapeBox &&
	! layer.curve;

/* ------------------------------ styles ------------------------------- */

// Span keys the box (and the look) own while the mode is on.
const FIT_KEYS = [ 'size', 'lh', 'ls', 'upper' ];

function keepStyle( s ) {
	if ( ! s ) {
		return null;
	}
	const out = {};
	for ( const k of Object.keys( s ) ) {
		if ( ! FIT_KEYS.includes( k ) ) {
			out[ k ] = s[ k ];
		}
	}
	return Object.keys( out ).length ? out : null;
}

/**
 * Spans as they come back from the edit overlay, minus the derived sizes:
 * colour, face, weight and the like stay; a run left without overrides
 * becomes plain. Null when nothing styled remains.
 *
 * @param {?Array} spans Runs.
 * @return {?Array} Cleaned runs or null.
 */
export function stripFitStyles( spans ) {
	if ( ! Array.isArray( spans ) ) {
		return null;
	}
	const out = normalizeSpans(
		spans.map( ( r ) => ( { text: r.text, s: keepStyle( r.s ) } ) )
	);
	return out.some( ( r ) => r.s ) ? out : null;
}

/* ------------------------------- looks -------------------------------- */

/**
 * Everything the fit needs to know about the layer's look: the segments
 * of the stored text, their roles, the emphasis target and the resolved
 * accent colour. Null without a look.
 *
 * @param {Object} layer Text layer.
 * @param {Object} ctx   Optional { accent, brand }.
 * @return {?Object} { look, segments, roles, emph, accent }.
 */
function lookContext( layer, ctx ) {
	const look = layer.textLook;
	if ( ! look || ! look.roles ) {
		return null;
	}
	const segments = splitSegments( layer.text );
	const roles = assignRoles( segments, look );
	const emph = emphTarget( segments, look, roles );
	let brand = ctx?.brand;
	if ( ! brand && 'undefined' !== typeof window ) {
		brand = window.WPIE?.brand?.colors;
	}
	const accent = ctx?.accent || accentFor( layer.color, look, brand || [] );
	return { look, segments, roles, emph, accent };
}

/* ----------------------------- measuring ----------------------------- */

// Mirror of rich-text's runWidth at the reference size.
function widthAt( c, text, st ) {
	if ( ! text ) {
		return 0;
	}
	c.font = st.font;
	if ( ! st.ls ) {
		return c.measureText( text ).width;
	}
	let w = -st.ls;
	for ( const ch of text ) {
		w += c.measureText( ch ).width + st.ls;
	}
	return Math.max( 0, w );
}

function metricAt( c, text, st ) {
	c.font = st.font;
	const m = c.measureText( text || 'Mg' );
	// The same fallback as rich-text's fragMetric, at the same size: the
	// exact pass below measures at the final line size, and the two sides
	// must do the same arithmetic there.
	return {
		a: m.actualBoundingBoxAscent || st.size * 0.8,
		d: m.actualBoundingBoxDescent || st.size * 0.2,
	};
}

/**
 * The layer's words in order, each a list of styled fragments; `para`
 * counts hard breaks, `seg` the look's segments (a sentence end closes a
 * segment when a look is on), `k` is the word's index in its segment.
 * Whitespace runs collapse to one gap, empty paragraphs vanish.
 *
 * @param {Object}  layer Text layer.
 * @param {boolean} sentences Split segments at sentence ends too.
 * @return {Array} Words [ { frags: [ { text, s } ], para, seg, k, segEnd } ].
 */
function wordsOf( layer, sentences ) {
	const words = [];
	let para = 0;
	let seg = -1;
	let k = 0;
	let newSeg = true;
	let cur = null;
	const endWord = () => {
		if ( ! cur ) {
			return;
		}
		if (
			sentences &&
			endsSentence( cur.frags.map( ( f ) => f.text ).join( '' ) )
		) {
			cur.segEnd = true;
			newSeg = true;
		}
		words.push( cur );
		cur = null;
	};
	for ( const run of textRuns( layer ) ) {
		const s = keepStyle( run.s );
		const parts = String( run.text ).split( '\n' );
		parts.forEach( ( part, pi ) => {
			if ( pi ) {
				endWord();
				para++;
				newSeg = true;
			}
			for ( const tok of part.match( /\s+|\S+/g ) || [] ) {
				if ( /^\s+$/.test( tok ) ) {
					endWord();
					continue;
				}
				if ( ! cur ) {
					if ( newSeg ) {
						seg++;
						k = 0;
						newSeg = false;
					}
					cur = { frags: [], para, seg, k: k++ };
				}
				cur.frags.push( { text: tok, s } );
			}
		} );
	}
	endWord();
	let last = -1;
	let n = -1;
	for ( const w of words ) {
		if ( w.para !== last ) {
			last = w.para;
			n++;
		}
		w.para = n;
	}
	return words;
}

/**
 * Measure every word at the reference size: natural width, ascent,
 * descent and the gap that follows it. Uppercase, list markers and the
 * look's role styles are applied to the MEASURED text so the fit matches
 * what gets painted; the derived style lands on the word as `d`.
 *
 * @param {Object}  layer Text layer.
 * @param {Array}   words Words from wordsOf (mutated).
 * @param {?Object} lc    Look context.
 * @return {Object} { lsEm } the layer's letter-spacing in em.
 */
function measureWords( layer, words, lc ) {
	const c = ctxOf();
	const lsEm = ( layer.letterSpacing || 0 ) / ( layer.fontSize || 16 );
	const layerCase = caseOf( layer.textTransform );
	const list = 'bullet' === layer.listStyle || 'number' === layer.listStyle;
	const styles = new Map();
	const styleOf = ( s ) => {
		const key = JSON.stringify( s || null );
		if ( ! styles.has( key ) ) {
			styles.set( key, resolveStyle( layer, s || {} ) );
		}
		return styles.get( key );
	};
	const colorOf = ( col ) => ( 'accent' === col ? lc.accent : col );
	let lastPara = -1;
	let counter = 0;
	for ( const w of words ) {
		let nw = 0;
		let asc = 0;
		let desc = 0;
		const rs = lc ? roleStyle( lc.look, lc.roles[ w.seg ] ) : null;
		const d = {};
		let rel = 1;
		if ( rs ) {
			d.family = rs.family;
			d.weight = rs.weight;
			d.italic = !! rs.italic;
			if ( rs.color ) {
				d.color = colorOf( rs.color );
			}
		}
		if ( lc && lc.emph && lc.emph.seg === w.seg && lc.emph.word === w.k ) {
			const es = lc.look.emph.style;
			if ( es.family ) {
				d.family = es.family;
			}
			if ( es.weight ) {
				d.weight = es.weight;
			}
			if ( undefined !== es.italic ) {
				d.italic = es.italic;
			}
			if ( es.underline ) {
				d.underline = true;
			}
			if ( es.color ) {
				d.color = colorOf( es.color );
			}
			if ( es.relSize ) {
				rel = es.relSize;
			}
		}
		const roleUpper = !! ( rs && rs.upper );
		if ( roleUpper ) {
			d.upper = true;
		}
		w.d = d;
		w.rel = rel;
		// Role capitals win over the layer's case option.
		w.tt = roleUpper ? 'uppercase' : layerCase;
		w.lsEm = rs ? rs.ls : lsEm;
		w.marker = '';
		if ( list && w.para !== lastPara ) {
			w.marker =
				'bullet' === layer.listStyle ? '•  ' : `${ ++counter }.  `;
		}
		lastPara = w.para;
		const lsR = w.lsEm * R * rel;
		// What was measured, kept for the exact pass: the painted text of
		// each fragment and its style short of size and tracking.
		w.m = [];
		w.frags.forEach( ( f, i ) => {
			const spec = { ...d, ...( f.s || {} ) };
			const st = styleOf( { ...spec, size: R * rel, ls: lsR } );
			let text = 0 === i ? w.marker + f.text : f.text;
			if ( lc && w.segEnd && i === w.frags.length - 1 ) {
				text = text.replace( /\.$/, '' );
			}
			if ( w.tt ) {
				text = applyCase( text, w.tt, 0 === i );
			}
			w.m.push( { text, spec } );
			nw += widthAt( c, text, st );
			const m = metricAt( c, text, st );
			asc = Math.max( asc, m.a );
			desc = Math.max( desc, m.d );
		} );
		const st = styleOf( {
			...d,
			...( w.frags[ w.frags.length - 1 ].s || {} ),
			size: R * rel,
			ls: lsR,
		} );
		w.nw = Math.max( 1e-3, nw );
		w.asc = asc;
		w.desc = desc;
		// The gap after the word: a space in its style plus the two
		// letter-spacing boundaries around it.
		w.gap = widthAt( c, ' ', st ) + 2 * st.ls;
	}
	// Ascent and descent of a run of words at a REAL size, measured the way
	// the renderer measures its lines.
	const metricsAt = ( ws, s ) => {
		let asc = 0;
		let desc = 0;
		for ( const w of ws ) {
			const rel = w.rel || 1;
			for ( const { text, spec } of w.m ) {
				const st = styleOf( {
					...spec,
					size: s * rel,
					ls: w.lsEm * s * rel,
				} );
				const m = metricAt( c, text, st );
				asc = Math.max( asc, m.a );
				desc = Math.max( desc, m.d );
			}
		}
		return { asc, desc };
	};
	return { lsEm, metricsAt };
}

/* --------------------------- line breaking --------------------------- */

const clampSize = ( s ) => Math.min( SIZE_MAX, Math.max( SIZE_MIN, s ) );

// Best segmentation by dynamic programming over the word index with
// bucketed block heights: per bucket the tallest block wins, ties go to
// the segmentation with the largest smallest line (the readable one).
function breakDP( words, N, H, segStart, lineAt, costOf, fixedStart ) {
	const bw = Math.max( 0.5, H / BUCKETS );
	const dp = new Array( N + 1 );
	dp[ 0 ] = new Map( [
		[ 0, { h: 0, minS: Infinity, line: null, from: null } ],
	] );
	for ( let j = 0; j < N; j++ ) {
		const cur = new Map();
		dp[ j + 1 ] = cur;
		// A capped segment (look roles below the hero) wraps greedily: its
		// lines are fixed, only their ends are valid states.
		const fixed = fixedStart ? fixedStart[ j ] : -2;
		if ( -1 === fixed ) {
			continue;
		}
		const iMin = fixed >= 0 ? fixed : segStart[ j ];
		let asc = 0;
		let desc = 0;
		for ( let k = j; k >= iMin; k-- ) {
			asc = Math.max( asc, words[ k ].asc );
			desc = Math.max( desc, words[ k ].desc );
			if ( fixed >= 0 && k > fixed ) {
				continue;
			}
			const i = k;
			const from = dp[ i ];
			if ( ! from || ! from.size ) {
				continue;
			}
			const ln = lineAt( i, j, asc, desc );
			for ( const e of from.values() ) {
				const h = e.h + costOf( ln, e.line );
				if ( h > H + EPS ) {
					continue;
				}
				const minS = Math.min( e.minS, ln.s );
				const b = Math.floor( h / bw );
				const prev = cur.get( b );
				if (
					! prev ||
					h > prev.h + EPS ||
					( Math.abs( h - prev.h ) <= EPS && minS > prev.minS )
				) {
					cur.set( b, { h, minS, line: ln, from: e } );
				}
			}
		}
	}
	let best = null;
	for ( const e of dp[ N ].values() ) {
		if (
			! best ||
			e.h > best.h + EPS ||
			( Math.abs( e.h - best.h ) <= EPS && e.minS > best.minS )
		) {
			best = e;
		}
	}
	if ( ! best ) {
		return null;
	}
	const lines = [];
	for ( let e = best; e && e.line; e = e.from ) {
		lines.unshift( e.line );
	}
	return lines;
}

// Long texts: wrap greedily at a trial size, size each line to the
// width, and binary-search the largest trial size whose stack fits.
function breakGreedy( words, N, H, segStart, lineAt, costOf, W ) {
	const wrapAt = ( s ) => {
		const lines = [];
		let i = 0;
		while ( i < N ) {
			let j = i;
			let nw = words[ i ].nw;
			while (
				j + 1 < N &&
				segStart[ j + 1 ] === segStart[ i ] &&
				( ( nw + words[ j ].gap + words[ j + 1 ].nw ) * s ) / R <= W
			) {
				nw += words[ j ].gap + words[ j + 1 ].nw;
				j++;
			}
			let asc = 0;
			let desc = 0;
			for ( let k = i; k <= j; k++ ) {
				asc = Math.max( asc, words[ k ].asc );
				desc = Math.max( desc, words[ k ].desc );
			}
			lines.push( lineAt( i, j, asc, desc ) );
			i = j + 1;
		}
		return lines;
	};
	const heightOf = ( lines ) =>
		lines.reduce(
			( acc, ln, k ) => acc + costOf( ln, k ? lines[ k - 1 ] : null ),
			0
		);
	let lo = SIZE_MIN;
	let hi = SIZE_MAX;
	let best = null;
	for ( let it = 0; it < 24; it++ ) {
		const mid = ( lo + hi ) / 2;
		const lines = wrapAt( mid );
		if ( heightOf( lines ) <= H + EPS ) {
			best = lines;
			lo = mid;
		} else {
			hi = mid;
		}
	}
	return best;
}

/**
 * Fit the layer's words into its box.
 *
 * @param {Object} layer Text layer (raw, as stored).
 * @param {Object} ctx   Optional { accent, brand, lc }.
 * @return {Object} { lines: [ { i, j, s, adv, asc, desc, extra, hard,
 *   words, seg, role, share } ], scaled, block, residual, soft, lsEm, look }.
 */
export function fitTextLayout( layer, ctx = null ) {
	const W = Math.max( 1, layer.w || 1 );
	const H = Math.max( 1, layer.h || 1 );
	const lh = layer.lineHeight || 1.05;
	const lc = ctx?.lc || lookContext( layer, ctx );
	const words = wordsOf( layer, !! lc );
	const { lsEm, metricsAt } = measureWords( layer, words, lc );
	const N = words.length;
	const look = lc ? { roles: lc.roles, accent: lc.accent } : null;
	if ( ! N ) {
		return {
			lines: [],
			scaled: false,
			block: 0,
			residual: H,
			soft: [],
			lsEm,
			look,
		};
	}
	const pre = new Float64Array( N + 1 );
	for ( let k = 0; k < N; k++ ) {
		pre[ k + 1 ] = pre[ k ] + words[ k ].nw + words[ k ].gap;
	}
	const segStart = new Int32Array( N );
	for ( let k = 0; k < N; k++ ) {
		segStart[ k ] =
			k > 0 && words[ k ].seg === words[ k - 1 ].seg
				? segStart[ k - 1 ]
				: k;
	}
	const styleAt = ( i ) =>
		lc ? roleStyle( lc.look, lc.roles[ words[ i ].seg ] ) : null;
	const shareOf = ( i ) => ( lc ? styleAt( i )?.share || 1 : 1 );
	const gapAfterOf = ( i ) => ( lc ? styleAt( i )?.gapAfter || 0 : 0 );
	const roleOf = ( i ) => ( lc ? lc.roles[ words[ i ].seg ] : null );
	// The hero's base size: every hero segment on one line, the smallest
	// wins. Capped roles measure against it.
	let heroBase = Infinity;
	if ( lc ) {
		for ( let i = 0; i < N; i++ ) {
			if ( 'hero' !== roleOf( i ) || segStart[ i ] !== i ) {
				continue;
			}
			let j = i;
			while ( j + 1 < N && segStart[ j + 1 ] === i ) {
				j++;
			}
			const nw = pre[ j + 1 ] - pre[ i ] - words[ j ].gap;
			heroBase = Math.min( heroBase, ( shareOf( i ) * W * R ) / nw );
		}
	}
	const capOf = ( i ) => {
		const ratio = lc ? ROLE_CAP[ roleOf( i ) ] : null;
		return ratio && Number.isFinite( heroBase )
			? ratio * heroBase
			: Infinity;
	};
	// Fixed lines of capped segments: greedy wrap at the cap size inside
	// the role's share. -2 = free (hero), -1 = no line ends here, >= 0 =
	// the start of the line ending here.
	let fixedStart = null;
	if ( lc && Number.isFinite( heroBase ) ) {
		fixedStart = new Int32Array( N ).fill( -2 );
		for ( let i = 0; i < N;  ) {
			const cap = capOf( i );
			if ( ! Number.isFinite( cap ) ) {
				i++;
				continue;
			}
			const limit = shareOf( i ) * W;
			let j = i;
			let nw = words[ i ].nw;
			while (
				j + 1 < N &&
				segStart[ j + 1 ] === segStart[ i ] &&
				( ( nw + words[ j ].gap + words[ j + 1 ].nw ) * cap ) / R <=
					limit
			) {
				nw += words[ j ].gap + words[ j + 1 ].nw;
				j++;
			}
			for ( let k = i; k < j; k++ ) {
				fixedStart[ k ] = -1;
			}
			fixedStart[ j ] = i;
			i = j + 1;
		}
	}
	// Lines stack on their REAL glyph metrics, not on the font's em box:
	// each line adds its ascent and descent, and between two lines sits a
	// gap measured in the SMALLER neighbour's size, so a huge word after a
	// small line gets no extra air above it. The layer's lineHeight is the
	// base tightness (1.05 = a hair of air). A look adds its role's air
	// after a segment.
	const g = Math.max( 0.02, Math.min( 3, lh - 0.9 ) );
	const lineAt = ( i, j, asc, desc ) => {
		const nw = pre[ j + 1 ] - pre[ i ] - words[ j ].gap;
		const share = shareOf( i );
		const s = clampSize( Math.min( ( share * W * R ) / nw, capOf( i ) ) );
		return {
			i,
			j,
			s,
			asc: ( asc * s ) / R,
			desc: ( desc * s ) / R,
			seg: words[ i ].seg,
			role: lc ? lc.roles[ words[ i ].seg ] : null,
			share,
		};
	};
	// Paragraph spacing (v1.429) is fixed air between paragraphs, on top
	// of the metric gap.
	const ps = Number( layer.paragraphSpacing ) || 0;
	const airOf = ( prev, ln ) =>
		prev
			? g * Math.min( prev.s, ln.s ) +
			  ( prev.seg !== ln.seg ? gapAfterOf( prev.i ) * prev.s : 0 ) +
			  ( words[ prev.j ].para !== words[ ln.i ].para ? ps : 0 )
			: 0;
	const costOf = ( ln, prev ) => ln.asc + ln.desc + airOf( prev, ln );

	let lines =
		N <= DP_WORDS
			? breakDP( words, N, H, segStart, lineAt, costOf, fixedStart )
			: breakGreedy( words, N, H, segStart, lineAt, costOf, W );
	let scaled = false;
	if ( ! lines ) {
		// Even one line per segment is too tall: keep that and scale the
		// whole block down to the height (the lines end up narrower).
		lines = [];
		for ( let i = 0; i < N;  ) {
			let j = i;
			let asc = words[ i ].asc;
			let desc = words[ i ].desc;
			while ( j + 1 < N && segStart[ j + 1 ] === segStart[ i ] ) {
				j++;
				asc = Math.max( asc, words[ j ].asc );
				desc = Math.max( desc, words[ j ].desc );
			}
			lines.push( lineAt( i, j, asc, desc ) );
			i = j + 1;
		}
		const block = lines.reduce(
			( acc, ln, k ) => acc + costOf( ln, k ? lines[ k - 1 ] : null ),
			0
		);
		const f = Math.min( 1, H / Math.max( 1e-6, block ) );
		lines.forEach( ( ln ) => {
			ln.s *= f;
			ln.asc *= f;
			ln.desc *= f;
		} );
		scaled = true;
	}
	const stackOf = () =>
		lines.reduce(
			( acc, ln, k ) => acc + costOf( ln, k ? lines[ k - 1 ] : null ),
			0
		);
	// The plan: the stack as the search sized it, on metrics measured once
	// at the reference size and scaled. `block` and `residual` report THIS
	// stack - measure.js sizes boxes by it and the verifier holds it
	// against the box - and it never exceeds the box.
	const block = stackOf();
	const residual = Math.max( 0, H - block );
	// The paint: the renderer measures every line at its OWN size, and the
	// two do not agree to the pixel - some backends round ink extents, a
	// descent of exactly zero falls back to a fifth of the size, hinting
	// moves the rest. Each line was off by a fraction, the stack added the
	// fractions up, and the painted block left the box the plan had sized
	// it for (408.58 in a box of 400 with the shipped faces). So the chosen
	// lines are measured once more at their final size with the renderer's
	// arithmetic, and the leading is set from THAT stack: what is left goes
	// into the gaps, what is missing comes out of them, each gap giving in
	// proportion to its air. The sizes, and with them the width every line
	// fills, never move - that is the promise of the mode, the height is
	// the soft one. Only where the air does not cover the rounding does the
	// paint stay past the box, by that rounding.
	for ( const ln of lines ) {
		const m = metricsAt( words.slice( ln.i, ln.j + 1 ), ln.s );
		ln.asc = m.asc;
		ln.desc = m.desc;
	}
	const left = H - stackOf();
	const air = lines.map( ( ln, k ) =>
		k ? airOf( lines[ k - 1 ], ln ) : 0
	);
	const airSum = air.reduce( ( acc, v ) => acc + v, 0 );
	const give = left < 0 ? Math.max( left, -airSum ) : 0;
	const gaps = lines.length - 1;
	const soft = [];
	lines.forEach( ( ln, k ) => {
		ln.words = words.slice( ln.i, ln.j + 1 );
		ln.hard =
			0 === k || words[ ln.i ].para !== words[ lines[ k - 1 ].j ].para;
		if ( 0 === k ) {
			ln.extra = 0;
		} else if ( give < 0 ) {
			ln.extra = ( give * air[ k ] ) / airSum;
		} else if ( scaled ) {
			ln.extra = 0;
		} else {
			ln.extra = Math.min(
				left / gaps,
				GAP_CAP * Math.min( lines[ k - 1 ].s, ln.s )
			);
		}
		// The advance the renderer must reproduce for this line (k > 0):
		// previous descent + air + extra leading + own ascent.
		ln.adv = k
			? lines[ k - 1 ].desc +
			  airOf( lines[ k - 1 ], ln ) +
			  ln.extra +
			  ln.asc
			: 0;
		if ( k > 0 && ! ln.hard ) {
			soft.push( k - 1 );
		}
	} );
	return { lines, scaled, block, residual, soft, lsEm, look };
}

/* ------------------------------- views -------------------------------- */

const sameJson = ( a, b ) => JSON.stringify( a ) === JSON.stringify( b );

// Merge adjacent runs that agree in style, derived keys and user keys.
function mergeRuns( runs ) {
	const out = [];
	for ( const r of runs ) {
		if ( ! r.text ) {
			continue;
		}
		const prev = out[ out.length - 1 ];
		if (
			prev &&
			sameJson( prev.s, r.s ) &&
			sameJson( prev.d, r.d ) &&
			sameJson( prev.u, r.u )
		) {
			prev.text += r.text;
		} else {
			out.push( { ...r } );
		}
	}
	return out;
}

// Runs for the fitted lines: one size, leading and tracking per line on
// top of the look's derived style (`d` lists the derived keys) and each
// fragment's own character overrides (`u`). `transform` bakes uppercase,
// list markers and dropped full stops into the text (paint view); the
// edit view keeps the stored characters so the overlay commits them back
// unchanged and shows casing through CSS.
function fitSpans( layer, fit, transform, lc ) {
	const lh = layer.lineHeight || 1.05;
	const spans = [];
	fit.lines.forEach( ( ln, k ) => {
		const size = ln.s;
		// The renderer advances a line by max(lh × size) of its runs, so
		// the stacked advance is expressed as a per-run line height.
		const lhRun = k > 0 ? ln.adv / size : lh;
		const stripe = lc && lc.look.stripe && k % 2 === 1 ? lc.accent : null;
		ln.words.forEach( ( w, wi ) => {
			w.frags.forEach( ( f, fi ) => {
				const derived = { ...( w.d || {} ) };
				if ( stripe ) {
					derived.color = stripe;
				}
				const u = f.s ? { ...f.s } : null;
				const rel = w.rel || 1;
				// The renderer advances by max(lh × size) over the runs of a
				// line, so an enlarged emphasis run gets its lh scaled down.
				const s = {
					...derived,
					...( u || {} ),
					size: size * rel,
					lh: Math.round( ( lhRun / rel ) * 1000 ) / 1000,
					ls: ( w.lsEm || 0 ) * size * rel,
				};
				const d = [ 'size', 'lh', 'ls', ...Object.keys( derived ) ];
				let text = f.text;
				if ( transform ) {
					if ( 0 === fi && w.marker ) {
						text = w.marker + text;
					}
					if ( lc && w.segEnd && fi === w.frags.length - 1 ) {
						text = text.replace( /\.$/, '' );
					}
					if ( w.tt ) {
						text = applyCase( text, w.tt, 0 === fi );
					}
					delete s.upper;
				}
				spans.push( {
					text: ( wi && 0 === fi ? ' ' : '' ) + text,
					s,
					d: transform ? d.filter( ( key ) => 'upper' !== key ) : d,
					u,
				} );
			} );
		} );
		if ( spans.length && k < fit.lines.length - 1 ) {
			spans[ spans.length - 1 ].text += '\n';
		}
	} );
	return mergeRuns( spans );
}

// Only memoize once every face the layer (and its look) uses is resident,
// so a fit measured against a fallback font is redone after the real one
// loads.
function fontsReady( layer, lc ) {
	if ( 'undefined' === typeof document || ! document.fonts?.check ) {
		return true;
	}
	try {
		for ( const run of textRuns( layer ) ) {
			const st = resolveStyle( layer, { ...( run.s || {} ), size: 16 } );
			if ( ! document.fonts.check( st.font ) ) {
				return false;
			}
		}
		if ( lc ) {
			const faces = Object.values( lc.look.roles ).map(
				( r ) => `${ r.weight } 16px "${ r.family }"`
			);
			if ( lc.look.emph?.style?.family ) {
				faces.push(
					`${ lc.look.emph.style.weight || 400 } 16px "${
						lc.look.emph.style.family
					}"`
				);
			}
			for ( const face of faces ) {
				if ( ! document.fonts.check( face ) ) {
					return false;
				}
			}
		}
	} catch ( e ) {
		return true;
	}
	return true;
}

const KEY_FIELDS = [
	'text',
	'spans',
	'w',
	'h',
	'fontFamily',
	'weight',
	'italic',
	'letterSpacing',
	'lineHeight',
	'paragraphSpacing',
	'fontSize',
	'textTransform',
	'listStyle',
	'textFit',
	'textLook',
	'color',
	'align',
];
const keyOf = ( layer, lc ) =>
	JSON.stringify( KEY_FIELDS.map( ( k ) => layer[ k ] ?? null ) ) +
	( lc ? '|' + lc.accent : '' );

const viewCache = new WeakMap();

function views( layer ) {
	const lc = lookContext( layer, null );
	const hit = viewCache.get( layer );
	const key = keyOf( layer, lc );
	if ( hit && hit.key === key ) {
		return hit;
	}
	const fit = fitTextLayout( layer, { lc } );
	const common = {
		...layer,
		fixedWidth: false,
		lineStyles: null,
		fontSize: fit.lines[ 0 ]?.s || layer.fontSize,
		textFitSoft: fit.soft,
		textFitScaled: fit.scaled,
		textFitView: true,
	};
	const paintSpans = fitSpans( layer, fit, true, lc );
	const editSpans = fitSpans( layer, fit, false, lc );
	const out = {
		key,
		fit,
		paint: {
			...common,
			spans: paintSpans,
			text: spansText( paintSpans ),
			listStyle: null,
		},
		edit: { ...common, spans: editSpans, text: spansText( editSpans ) },
	};
	if ( fontsReady( layer, lc ) ) {
		viewCache.set( layer, out );
	}
	return out;
}

/**
 * The layer as the painter and the measurers see it. Non-fluid layers get
 * exactly the old non-destructive transform; fluid layers get the fitted
 * spans. Idempotent: a view passes through untouched.
 *
 * @param {Object} layer Text layer.
 * @return {Object} Layer or paint view.
 */
export function withTextFit( layer ) {
	if ( ! layer || layer.textFitView ) {
		return layer;
	}
	if ( ! isFluidText( layer ) ) {
		return withTextTransform( layer );
	}
	return views( layer ).paint;
}

/**
 * The layer as the edit overlay shows it: fitted lines and sizes, but the
 * stored characters (no baked uppercase, no list markers).
 *
 * @param {Object} layer Text layer.
 * @return {Object} Layer or edit view.
 */
export function withTextFitForEdit( layer ) {
	if ( ! layer || layer.textFitView || ! isFluidText( layer ) ) {
		return layer;
	}
	return views( layer ).edit;
}

/**
 * Freeze the current look into the layer (mode off): soft breaks become
 * hard, sizes, leading and the look's styles become spans, role casing
 * goes into the text, the box stays.
 *
 * @param {Object} layer Fluid text layer.
 * @return {Object} UPDATE_LAYER patch.
 */
export function bakeTextFit( layer ) {
	const { edit, fit } = views( layer );
	const spans = normalizeSpans(
		edit.spans.map( ( r ) => {
			const s = { ...r.s };
			let text = r.text;
			if ( s.upper ) {
				text = text.toLocaleUpperCase();
			}
			delete s.upper;
			return { text, s };
		} )
	);
	return {
		textFit: null,
		textLook: null,
		text: spansText( spans ),
		spans: spans.length ? spans : null,
		lineStyles: null,
		fixedWidth: false,
		textLayout: null,
		fontSize: Math.round( fit.lines[ 0 ]?.s || layer.fontSize || 16 ),
	};
}
