/**
 * Rich text engine (v1.46): Photoshop-style character styling inside ONE
 * text layer. `layer.spans` is a list of styled runs whose concatenated
 * text always equals `layer.text`:
 *
 *   spans: [ { text: 'Hallo ', s: null },
 *            { text: 'Welt',   s: { size: 90, color: '#e5484d' } }, ... ]
 *
 * A run style `s` overrides a subset of the layer's base typography:
 *   size, family, weight, italic, underline, color, ls (letter-spacing px),
 *   lh (line-height factor). Everything else inherits from the layer, so
 *   plain layers (no spans) behave exactly as before.
 *
 * This module is pure (no raster.js import): the shared line-breaking +
 * metrics live here and are consumed by drawText, the measurers and the
 * WYSIWYG edit overlay (spans ⇄ HTML bridge at the bottom).
 */

import { LOCAL_FONTS, nearestWeight } from './font-manager';

/** True when the layer carries styled runs. */
export const hasSpans = ( layer ) =>
	Array.isArray( layer.spans ) && layer.spans.length > 0;

/** The concatenated plain text of a span list. */
export const spansText = ( spans ) =>
	( spans || [] ).map( ( s ) => s.text ).join( '' );

/** Drop empty runs, merge adjacent runs with equal style. */
export function normalizeSpans( spans ) {
	const out = [];
	for ( const run of spans || [] ) {
		if ( ! run || ! run.text ) {
			continue;
		}
		const s = run.s && Object.keys( run.s ).length ? run.s : null;
		const prev = out[ out.length - 1 ];
		if ( prev && sameStyle( prev.s, s ) ) {
			prev.text += run.text;
		} else {
			out.push( { text: run.text, s: s ? { ...s } : null } );
		}
	}
	return out;
}

function sameStyle( a, b ) {
	const ka = a ? Object.keys( a ) : [];
	const kb = b ? Object.keys( b ) : [];
	if ( ka.length !== kb.length ) {
		return false;
	}
	return ka.every( ( k ) => a[ k ] === b[ k ] );
}

/**
 * The layer's styled runs: explicit spans, a conversion of the short-lived
 * v1.45 per-line styles, or one plain run of the whole text.
 *
 * @param {Object} layer Text layer.
 * @return {Array} Runs [ { text, s } ].
 */
export function textRuns( layer ) {
	if ( hasSpans( layer ) ) {
		return layer.spans.filter( ( r ) => r && r.text );
	}
	if (
		Array.isArray( layer.lineStyles ) &&
		layer.lineStyles.some( Boolean )
	) {
		const lines = String( layer.text || '' ).split( '\n' );
		return lines.map( ( line, i ) => ( {
			text: i < lines.length - 1 ? line + '\n' : line,
			s: layer.lineStyles[ i ] || null,
		} ) );
	}
	return [ { text: String( layer.text || '' ), s: null } ];
}

/**
 * Resolve a run style against the layer's base typography.
 *
 * @param {Object}  layer Text layer.
 * @param {?Object} s     Run style override (or null).
 * @return {Object} { size, family, weight, italic, underline, color, ls,
 *                    lineHeight, font }.
 */
export function resolveStyle( layer, s ) {
	const o = s || {};
	const size = o.size || layer.fontSize || 16;
	const family = o.family || layer.fontFamily || 'Inter';
	const rawWeight = o.weight || layer.weight || 400;
	const weight = LOCAL_FONTS[ family ]
		? nearestWeight( family, rawWeight )
		: rawWeight;
	const italic = undefined !== o.italic ? !! o.italic : !! layer.italic;
	const underline =
		undefined !== o.underline ? !! o.underline : !! layer.underline;
	return {
		size,
		family,
		weight,
		italic,
		underline,
		color: o.color || null,
		// Word-level marker highlight (v1.141.1): set on the selection via
		// the Character section, rendered behind the marked fragments.
		mark: o.mark || null,
		ls: undefined !== o.ls ? o.ls : layer.letterSpacing || 0,
		lineHeight: ( o.lh || layer.lineHeight || 1.05 ) * size,
		font: `${
			italic ? 'italic ' : ''
		}${ weight } ${ size }px "${ family }", sans-serif`,
	};
}

/** The largest font size any run of the layer uses (buffer padding). */
export function maxSpanSize( layer ) {
	let m = layer.fontSize || 16;
	if ( hasSpans( layer ) ) {
		for ( const run of layer.spans ) {
			if ( run?.s?.size > m ) {
				m = run.s.size;
			}
		}
	}
	return m;
}

/** A copy of the spans with every colour override removed (silhouettes). */
export function stripSpanColors( spans ) {
	return ( spans || [] ).map( ( run ) => {
		if ( ! run?.s?.color && ! run?.s?.mark ) {
			return run;
		}
		// Marks are stripped too: silhouettes (shadows, outlines) must
		// follow the glyphs, never the highlight swipe behind them.
		const s = { ...run.s };
		delete s.color;
		delete s.mark;
		return { text: run.text, s: Object.keys( s ).length ? s : null };
	} );
}

const isSpace = ( t ) => /^\s+$/.test( t );

function runWidth( ctx, text, st ) {
	if ( ! text ) {
		return 0;
	}
	ctx.font = st.font;
	if ( ! st.ls ) {
		return ctx.measureText( text ).width;
	}
	let w = -st.ls;
	for ( const ch of text ) {
		w += ctx.measureText( ch ).width + st.ls;
	}
	return Math.max( 0, w );
}

function fragMetric( ctx, text, st ) {
	ctx.font = st.font;
	const m = ctx.measureText( text || 'Mg' );
	return {
		a: m.actualBoundingBoxAscent || st.size * 0.8,
		d: m.actualBoundingBoxDescent || st.size * 0.2,
	};
}

/**
 * Vertical anchor of a text block inside its box (v1.92.0, v1.107.7 for
 * every text layer): layer.valign is 'top' | 'middle' | 'bottom'. The
 * default differs by kind - area text (fixedWidth) starts at 'top'
 * (Photoshop's area type), point text at 'middle' (its box hugged the
 * content historically, so centering preserves old documents). The edit
 * overlay applies the same offset so committing never makes text jump.
 *
 * @param {Object} layer  Text layer.
 * @param {number} blockH Measured height of the laid-out text block.
 * @return {number} Top padding in px.
 */
export function textTopPad( layer, blockH ) {
	const space = Math.max( 0, ( layer.h || 0 ) - blockH );
	const valign = layer.valign || ( layer.fixedWidth ? 'top' : 'middle' );
	if ( 'middle' === valign ) {
		return space / 2;
	}
	if ( 'bottom' === valign ) {
		return space;
	}
	return 0;
}

/**
 * Shallow layer clone with the non-destructive text transform applied
 * (v1.300). The paint/measure entry points shadow the layer through
 * this, so every path — plain, spans, per-line styles, curve, path
 * text, text-in-shape — sees the transformed characters while the
 * stored document keeps its case. Idempotent (uppercase twice = once).
 *
 * @param {Object} layer Text layer.
 * @return {Object} The same layer, or a transformed shallow copy.
 */
export function withTextTransform( layer ) {
	const upper = layer && 'uppercase' === layer.textTransform;
	const list =
		layer &&
		( 'bullet' === layer.listStyle || 'number' === layer.listStyle );
	if ( ! layer || ( ! upper && ! list ) ) {
		return layer;
	}
	const up = ( s ) =>
		upper ? String( s ).toLocaleUpperCase() : String( s );
	// List markers (v1.301): every non-empty paragraph gets a bullet or
	// its running number; empty lines neither mark nor count.
	let counter = 0;
	const mark = () =>
		'bullet' === layer.listStyle ? '•  ' : `${ ++counter }.  `;
	const markLines = ( text ) =>
		String( text )
			.split( '\n' )
			.map( ( line ) => ( line.trim() ? mark() + line : line ) )
			.join( '\n' );
	const out = { ...layer };
	if ( hasSpans( layer ) ) {
		// Runs flow across paragraphs: inject a marker wherever a run
		// segment starts a new non-empty line, numbering continuously.
		let atLineStart = true;
		out.spans = layer.spans.map( ( r ) => {
			if ( ! r || ! r.text ) {
				return r;
			}
			const parts = String( r.text ).split( '\n' );
			const rebuilt = parts
				.map( ( seg, i ) => {
					const startsLine = i > 0 || atLineStart;
					return list && startsLine && seg.trim()
						? mark() + seg
						: seg;
				} )
				.join( '\n' );
			atLineStart = /\n$/.test( r.text );
			return { ...r, text: up( rebuilt ) };
		} );
		out.text = up( layer.text || '' );
		return out;
	}
	out.text = up( list ? markLines( layer.text || '' ) : layer.text || '' );
	return out;
}

/**
 * Break a text layer into positioned, styled line fragments — the single
 * source of truth for rendering AND measuring rich text. Area text
 * (`fixedWidth`) word-wraps inside the layer width, per fragment style.
 *
 * @param {CanvasRenderingContext2D} ctx   Measure context.
 * @param {Object}                   layer Text layer.
 * @return {Object} { lines: [ { frags: [ { text, st, x, w } ], width, x,
 *   baseline, ascent, descent, advance } ], blockH }.
 */
export function layoutRichText( ctx, layer ) {
	let runs = textRuns( layer );
	// Non-destructive all-caps (v1.300): the stored text keeps its case,
	// layout + paint see the transformed runs. Per-run transform keeps
	// span boundaries intact (ß→SS may lengthen a run, never shift its
	// neighbours).
	if ( 'uppercase' === layer.textTransform ) {
		runs = runs.map( ( r ) => ( {
			...r,
			text: String( r.text ).toLocaleUpperCase(),
		} ) );
	}
	const wrap = !! layer.fixedWidth;
	const maxW = Math.max( 1, layer.w || 1 );

	// Split runs into paragraphs at explicit newlines. Each paragraph
	// remembers a fallback style so empty lines keep their height.
	const paras = [ { frags: [], st: resolveStyle( layer, runs[ 0 ]?.s ) } ];
	for ( const run of runs ) {
		const st = resolveStyle( layer, run.s );
		const parts = String( run.text ).split( '\n' );
		parts.forEach( ( part, pi ) => {
			if ( pi ) {
				paras.push( { frags: [], st } );
			}
			if ( part ) {
				paras[ paras.length - 1 ].frags.push( { text: part, st } );
			}
		} );
	}

	// Greedy word-wrap (area text) or one line per paragraph (point text).
	const lines = [];
	for ( const para of paras ) {
		if ( ! para.frags.length ) {
			lines.push( { frags: [], st: para.st } );
			continue;
		}
		if ( ! wrap ) {
			lines.push( {
				frags: para.frags.map( ( f ) => ( {
					...f,
					w: runWidth( ctx, f.text, f.st ),
				} ) ),
			} );
			continue;
		}
		let cur = [];
		let curW = 0;
		const flush = () => {
			lines.push( { frags: cur, st: para.st } );
			cur = [];
			curW = 0;
		};
		for ( const frag of para.frags ) {
			const tokens = frag.text.match( /\s+|\S+/g ) || [];
			for ( const tok of tokens ) {
				const tw = runWidth( ctx, tok, frag.st );
				if ( cur.length && ! isSpace( tok ) && curW + tw > maxW ) {
					flush();
				}
				const last = cur[ cur.length - 1 ];
				if ( last && last.st === frag.st ) {
					last.text += tok;
					last.w += tw;
				} else {
					cur.push( { text: tok, st: frag.st, w: tw } );
				}
				curW += tw;
			}
		}
		flush();
	}

	// Per-line metrics: tallest fragment wins; baselines accumulate.
	for ( const line of lines ) {
		let ascent = 0;
		let descent = 0;
		let advance = 0;
		let width = 0;
		if ( ! line.frags.length ) {
			const st = line.st || resolveStyle( layer, null );
			const m = fragMetric( ctx, '', st );
			ascent = m.a;
			descent = m.d;
			advance = st.lineHeight;
		} else {
			for ( const f of line.frags ) {
				const m = fragMetric( ctx, f.text, f.st );
				ascent = Math.max( ascent, m.a );
				descent = Math.max( descent, m.d );
				advance = Math.max( advance, f.st.lineHeight );
				width += f.w;
			}
		}
		// Trailing spaces don't count toward alignment width.
		let trimmed = width;
		for ( let i = line.frags.length - 1; i >= 0; i-- ) {
			if ( isSpace( line.frags[ i ].text ) ) {
				trimmed -= line.frags[ i ].w;
			} else {
				break;
			}
		}
		line.ascent = ascent;
		line.descent = descent;
		line.advance = advance;
		line.width = trimmed;
	}

	let blockH = 0;
	if ( lines.length ) {
		blockH = lines[ 0 ].ascent + lines[ lines.length - 1 ].descent;
		for ( let i = 1; i < lines.length; i++ ) {
			blockH += lines[ i ].advance;
		}
	}
	const topPad = textTopPad( layer, blockH );
	let base = topPad + ( lines[ 0 ]?.ascent || 0 );
	lines.forEach( ( line, i ) => {
		if ( i ) {
			base += line.advance;
		}
		line.baseline = base;
		line.x =
			'center' === layer.align
				? ( ( layer.w || 0 ) - line.width ) / 2
				: 'right' === layer.align
				? ( layer.w || 0 ) - line.width
				: 0;
		let fx = line.x;
		for ( const f of line.frags ) {
			f.x = fx;
			fx += f.w;
		}
	} );
	return { lines, blockH };
}

/* ------------------------- spans ⇄ HTML bridge -------------------------- */
/* Used by the WYSIWYG edit overlay. DOM-only — never called during render. */

const escapeHtml = ( s ) =>
	s.replace( /&/g, '&amp;' ).replace( /</g, '&lt;' ).replace( />/g, '&gt;' );

/* ------------------- safe CSS value guards (security) -------------------- */
/* styleToCss() output is concatenated into a `style="..."` attribute that
 * the edit overlay hands to innerHTML. Span styles can arrive verbatim from
 * an opened project/template (fully attacker-controlled), so every value is
 * validated here: nothing that could carry `"`, `<` or `>` survives, which
 * closes the DOM-XSS the raw concatenation used to allow. */

// A CSS colour literal (hex / rgb(a) / hsl(a) / named), else ''. None of the
// accepted shapes can contain an attribute- or tag-breaking character.
const CSS_COLOR =
	/^(#[0-9a-f]{3,8}|rgba?\([0-9.,%\s/]+\)|hsla?\([0-9.,%\s/deg]+\)|[a-z]+)$/i;
const safeColor = ( v ) => {
	const s = String( v ?? '' ).trim();
	return CSS_COLOR.test( s ) ? s : '';
};

// A font-family name with quotes and brackets stripped. The result lands
// inside single quotes, so removing `'"<>();\{}` makes an attribute or tag
// breakout impossible while keeping real names (spaces, accents) intact.
const safeFamily = ( v ) =>
	String( v ?? '' )
		.replace( /['"<>();\\{}]/g, '' )
		.trim();

// A finite number, or null.
const safeNum = ( v ) => {
	const n = Number( v );
	return Number.isFinite( n ) ? n : null;
};

// A CSS font-weight: the two keywords or a plausible numeric weight, else ''.
const safeWeight = ( v ) => {
	const s = String( v ?? '' )
		.trim()
		.toLowerCase();
	if ( 'normal' === s || 'bold' === s ) {
		return s;
	}
	const n = safeNum( s );
	return n && n >= 1 && n <= 1000 ? String( n ) : '';
};

/**
 * Defence-in-depth: clean a run/line style loaded from a project so its
 * string fields can never carry markup, independent of the styleToCss guard
 * above. Unsafe colour, mark or family values are dropped/neutralised; numbers
 * and flags pass through (they only ever reach the DOM through arithmetic).
 *
 * @param {?Object} s Raw style.
 * @return {?Object} Cleaned style (null/empty passed through unchanged).
 */
export function sanitizeSpanStyle( s ) {
	if ( ! s || 'object' !== typeof s ) {
		return s;
	}
	const out = { ...s };
	if ( 'color' in out ) {
		const c = safeColor( out.color );
		if ( c ) {
			out.color = c;
		} else {
			delete out.color;
		}
	}
	if ( 'mark' in out && null !== out.mark ) {
		out.mark = safeColor( out.mark ) || null;
	}
	if ( 'family' in out ) {
		const f = safeFamily( out.family );
		if ( f ) {
			out.family = f;
		} else {
			delete out.family;
		}
	}
	if ( 'weight' in out ) {
		const w = safeWeight( out.weight );
		if ( w ) {
			out.weight = /^\d+$/.test( w ) ? Number( w ) : w;
		} else {
			delete out.weight;
		}
	}
	return out;
}

/** Inline CSS for a run style, scaled to the current zoom. */
export function styleToCss( s, zoom ) {
	const parts = [];
	const size = safeNum( s.size );
	if ( size ) {
		parts.push( `font-size:${ size * zoom }px` );
	}
	const family = safeFamily( s.family );
	if ( family ) {
		// Single quotes: this CSS lands inside a double-quoted style="..."
		// attribute, so double quotes here would close the attribute early
		// and drop the whole span style - font, size AND colour (v1.221.0).
		parts.push( `font-family:'${ family }',sans-serif` );
	}
	const weight = safeWeight( s.weight );
	if ( weight ) {
		parts.push( `font-weight:${ weight }` );
	}
	if ( undefined !== s.italic ) {
		parts.push( `font-style:${ s.italic ? 'italic' : 'normal' }` );
	}
	if ( undefined !== s.underline ) {
		parts.push( `text-decoration:${ s.underline ? 'underline' : 'none' }` );
	}
	const color = safeColor( s.color );
	if ( color ) {
		parts.push( `color:${ color }` );
	}
	if ( undefined !== s.mark ) {
		// Word marker (v1.141.1): background in the edit overlay, the
		// hand-drawn swipe on the canvas. `null` clears an outer mark.
		parts.push(
			`background-color:${ safeColor( s.mark ) || 'transparent' }`
		);
	}
	if ( undefined !== s.ls ) {
		parts.push( `letter-spacing:${ ( safeNum( s.ls ) || 0 ) * zoom }px` );
	}
	return parts.join( ';' );
}

/** The overlay's HTML for a layer (plain text stays a bare text node). */
export function spansToHtml( layer, zoom ) {
	const runs = textRuns( layer );
	return runs
		.map( ( run ) => {
			const inner = escapeHtml( run.text );
			if ( ! run.s ) {
				return inner;
			}
			return `<span style="${ styleToCss(
				run.s,
				zoom
			) }">${ inner }</span>`;
		} )
		.join( '' );
}

// First font family of a CSS font-family list, unquoted.
const firstFamily = ( v ) =>
	String( v || '' )
		.split( ',' )[ 0 ]
		.trim()
		.replace( /^["']|["']$/g, '' );

const WEIGHT_WORDS = { bold: 700, normal: 400 };

/**
 * Effective run style of a DOM node inside the edit overlay: the closest
 * ancestor's inline styles win, expressed in DOC units (divided by zoom)
 * and reduced to the diff against the layer base.
 *
 * @param {Node}   node  Text node (or element).
 * @param {Node}   root  Overlay root.
 * @param {Object} layer Text layer (base typography).
 * @param {number} zoom  Current zoom.
 * @return {?Object} Style override or null when identical to the base.
 */
export function effectiveNodeStyle( node, root, layer, zoom ) {
	const got = {};
	let el = node.nodeType === 3 ? node.parentElement : node;
	while ( el && el !== root ) {
		const st = el.style;
		if ( st ) {
			if ( undefined === got.family && st.fontFamily ) {
				got.family = firstFamily( st.fontFamily );
			}
			if ( undefined === got.size && st.fontSize ) {
				got.size = Math.round( parseFloat( st.fontSize ) / zoom );
			}
			if ( undefined === got.weight && st.fontWeight ) {
				got.weight =
					WEIGHT_WORDS[ st.fontWeight ] ||
					parseInt( st.fontWeight, 10 );
			}
			if ( undefined === got.italic && st.fontStyle ) {
				got.italic = 'italic' === st.fontStyle;
			}
			const deco = st.textDecorationLine || st.textDecoration;
			if ( undefined === got.underline && deco ) {
				got.underline = deco.includes( 'underline' );
			}
			if ( undefined === got.color && st.color ) {
				got.color = st.color;
			}
			if ( undefined === got.mark && st.backgroundColor ) {
				const bg = st.backgroundColor;
				// A transparent inner span CLEARS an outer mark: record
				// null so the cascade stops here.
				got.mark =
					'transparent' === bg || 'rgba(0, 0, 0, 0)' === bg
						? null
						: bg;
			}
			if ( undefined === got.ls && st.letterSpacing ) {
				got.ls = Math.round( parseFloat( st.letterSpacing ) / zoom );
			}
		}
		el = el.parentElement;
	}
	// Reduce to a diff against the layer base.
	const out = {};
	if ( got.size && got.size !== ( layer.fontSize || 16 ) ) {
		out.size = got.size;
	}
	if ( got.family && got.family !== ( layer.fontFamily || 'Inter' ) ) {
		out.family = got.family;
	}
	if ( got.weight && got.weight !== ( layer.weight || 400 ) ) {
		out.weight = got.weight;
	}
	if ( undefined !== got.italic && got.italic !== !! layer.italic ) {
		out.italic = got.italic;
	}
	if ( undefined !== got.underline && got.underline !== !! layer.underline ) {
		out.underline = got.underline;
	}
	if ( got.color && got.color !== layer.color ) {
		out.color = got.color;
	}
	if ( got.mark ) {
		out.mark = got.mark;
	}
	if (
		undefined !== got.ls &&
		! Number.isNaN( got.ls ) &&
		got.ls !== ( layer.letterSpacing || 0 )
	) {
		out.ls = got.ls;
	}
	return Object.keys( out ).length ? out : null;
}

const BLOCKS = [ 'DIV', 'P', 'LI', 'BR' ];

/**
 * Serialize the overlay DOM back into { text, spans }. Handles literal
 * newlines (pre-wrap), <br> and block wrappers some browsers insert.
 *
 * @param {Element} root  Overlay root.
 * @param {Object}  layer Text layer.
 * @param {number}  zoom  Current zoom.
 * @return {{text: string, spans: Array}} Plain text + normalized spans.
 */
export function domToSpans( root, layer, zoom ) {
	const spans = [];
	const push = ( text, s ) => {
		if ( text ) {
			spans.push( { text, s } );
		}
	};
	const lastChar = () =>
		spans.length ? spans[ spans.length - 1 ].text.slice( -1 ) : '\n';
	const walk = ( node ) => {
		for ( const child of Array.from( node.childNodes ) ) {
			if ( 3 === child.nodeType ) {
				push(
					child.nodeValue,
					effectiveNodeStyle( child, root, layer, zoom )
				);
			} else if ( 'BR' === child.nodeName ) {
				push( '\n', null );
			} else if ( 1 === child.nodeType ) {
				// A block wrapper starts on a fresh line.
				if (
					BLOCKS.includes( child.nodeName ) &&
					spans.length &&
					'\n' !== lastChar()
				) {
					push( '\n', null );
				}
				walk( child );
			}
		}
	};
	walk( root );
	const normalized = normalizeSpans( spans );
	const text = spansText( normalized );
	// A trailing newline from a final <br>/<div> is an artifact.
	if ( text.endsWith( '\n' ) ) {
		const last = normalized[ normalized.length - 1 ];
		last.text = last.text.slice( 0, -1 );
		if ( ! last.text ) {
			normalized.pop();
		}
	}
	return { text: spansText( normalized ), spans: normalized };
}

/**
 * Wrap the current selection (inside `root`) in a span carrying `patch`.
 * A collapsed selection styles the whole content. Returns false when the
 * selection lives outside the root.
 *
 * @param {Element} root  Overlay root.
 * @param {Object}  patch Run style patch (doc units).
 * @param {number}  zoom  Current zoom.
 * @return {boolean} Applied?
 */
export function applySelectionStyle( root, patch, zoom ) {
	const sel = root.ownerDocument.defaultView.getSelection();
	if ( ! sel || ! sel.rangeCount ) {
		return false;
	}
	let range = sel.getRangeAt( 0 );
	if ( ! root.contains( range.commonAncestorContainer ) ) {
		return false;
	}
	if ( range.collapsed ) {
		range = document.createRange();
		range.selectNodeContents( root );
	}
	const span = document.createElement( 'span' );
	span.setAttribute( 'style', styleToCss( patch, zoom ) );
	span.appendChild( range.extractContents() );
	range.insertNode( span );
	sel.removeAllRanges();
	const r = document.createRange();
	r.selectNodeContents( span );
	sel.addRange( r );
	return true;
}

/**
 * The fully resolved style (layer base + overrides) at a given DOM node.
 *
 * @param {Node}    node  Node inside the overlay.
 * @param {Element} root  Overlay root.
 * @param {Object}  layer Text layer.
 * @param {number}  zoom  Current zoom.
 * @return {Object} Resolved style.
 */
export function nodeStyle( node, root, layer, zoom ) {
	const o = effectiveNodeStyle( node, root, layer, zoom ) || {};
	return {
		size: o.size || layer.fontSize || 16,
		family: o.family || layer.fontFamily || 'Inter',
		weight: o.weight || layer.weight || 400,
		italic: undefined !== o.italic ? o.italic : !! layer.italic,
		underline: undefined !== o.underline ? o.underline : !! layer.underline,
		color: o.color || layer.color,
		mark: o.mark || null,
		ls: undefined !== o.ls ? o.ls : layer.letterSpacing || 0,
	};
}

/**
 * The effective style at the selection anchor (for toolbar toggles).
 *
 * @param {Element} root  Overlay root.
 * @param {Object}  layer Text layer.
 * @param {number}  zoom  Current zoom.
 * @return {Object} Fully resolved style (layer base + overrides).
 */
export function selectionStyle( root, layer, zoom ) {
	const sel = root.ownerDocument.defaultView.getSelection();
	const node =
		sel && sel.anchorNode && root.contains( sel.anchorNode )
			? sel.anchorNode
			: root;
	return nodeStyle( node, root, layer, zoom );
}
