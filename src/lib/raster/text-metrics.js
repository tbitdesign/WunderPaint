import { LOCAL_FONTS, nearestWeight } from '../font-manager';
import {
	hasSpans,
	layoutRichText,
	maxSpanSize,
	textTopPad,
	withTextTransform,
} from '../rich-text';
import { createCanvas } from './env';
import {
	gradientFillFor,
	patternTile,
	registerUserTile,
	scaledTile,
	userTile,
} from './patterns';

/** Curve strength → arc angle: |curve| = 100 spans a half circle. */
export const CURVE_K = 1.8;

/**
 * Lay glyphs on a circular arc (text-on-path, v0.3). Pure given measured
 * widths so the math is unit-testable without a canvas.
 *
 * curve > 0 arches the middle up, curve < 0 down; the apex sits at the
 * middle of the run on the straight baseline, so curve → 0 converges to
 * the straight layout. Returned x/y are glyph centers, angle in radians
 * (rotate, then fillText with textAlign 'center').
 *
 * @param {Object}   a               Layout args.
 * @param {string[]} a.chars         Glyphs of one line.
 * @param {number[]} a.widths        Measured advance per glyph.
 * @param {number}   a.curve         −100…100.
 * @param {number}   a.width         Layer width (places the run like straight text).
 * @param {string}   a.align         left|center|right.
 * @param {number}   a.baseline      Straight-text baseline y.
 * @param {number}   a.letterSpacing Extra advance between glyphs.
 * @return {Array<{char: string, x: number, y: number, angle: number}>} Glyph placements.
 */
export function curvedGlyphLayout( {
	chars,
	widths,
	curve,
	width,
	align = 'left',
	baseline = 0,
	letterSpacing = 0,
} ) {
	const total =
		widths.reduce( ( acc, w ) => acc + w, 0 ) +
		letterSpacing * Math.max( 0, chars.length - 1 );
	let alignX = 0;
	if ( 'center' === align ) {
		alignX = ( width - total ) / 2;
	} else if ( 'right' === align ) {
		alignX = width - total;
	}
	const cx = alignX + total / 2;
	const out = [];
	if ( ! curve || total <= 0 ) {
		let s = -total / 2;
		for ( let i = 0; i < chars.length; i++ ) {
			out.push( {
				char: chars[ i ],
				x: cx + s + widths[ i ] / 2,
				y: baseline,
				angle: 0,
			} );
			s += widths[ i ] + letterSpacing;
		}
		return out;
	}
	const sign = curve > 0 ? 1 : -1;
	const radius = ( total * 180 ) / ( Math.PI * Math.abs( curve ) * CURVE_K );
	let s = -total / 2;
	for ( let i = 0; i < chars.length; i++ ) {
		const phi = ( s + widths[ i ] / 2 ) / radius;
		out.push( {
			char: chars[ i ],
			x: cx + radius * Math.sin( phi ),
			y: baseline + sign * radius * ( 1 - Math.cos( phi ) ),
			angle: sign * phi,
		} );
		s += widths[ i ] + letterSpacing;
	}
	return out;
}

/**
 * Fill style for a text layer (v1.1): solid color, linear gradient across
 * the text box, or a pattern (builtin/user tile).
 *
 * @param {CanvasRenderingContext2D} ctx   Context.
 * @param {Object}                   layer Text layer.
 * @return {string|CanvasGradient|CanvasPattern} Fill style.
 */
export function textFillStyle( ctx, layer ) {
	if ( 'gradient' === layer.fillType && layer.gradientStops?.length ) {
		return gradientFillFor(
			ctx,
			layer.w,
			layer.h,
			layer.gradientStops,
			layer.gradientAngle,
			layer.gradientKind
		);
	}
	if (
		'pattern' === layer.fillType &&
		layer.pattern &&
		'none' !== layer.pattern
	) {
		if ( 'custom' === layer.pattern ) {
			const tile = userTile( layer.patternData );
			if ( tile ) {
				return ctx.createPattern(
					scaledTile( tile, layer.patternScale ),
					'repeat'
				);
			}
			registerUserTile( layer.patternData );
			return layer.color || '#000';
		}
		return ctx.createPattern(
			scaledTile(
				patternTile( layer.pattern, layer.color || '#000' ),
				layer.patternScale
			),
			'repeat'
		);
	}
	return layer.color || '#000';
}

// A shared scratch context for measuring text off-screen (font-only work,
// so a 1×1 canvas is plenty).
let measureCtx = null;

export const getMeasureCtx = () => {
	if ( ! measureCtx ) {
		measureCtx = createCanvas( 1, 1 ).getContext( '2d' );
	}
	return measureCtx;
};

/**
 * Text height in two parts: `blockH` is the REAL laid-out block height the
 * canvas uses to anchor the text (ascent + line advances + descent, no
 * minimum); `floor` is the minimum box height a single line should occupy.
 * The box is sized to max(blockH, floor); the edit overlay anchors to
 * `blockH` alone so it matches the canvas render pixel-for-pixel (v1.221.0 -
 * the floor made the overlay centre the text ~0.15x font size too high).
 *
 * @param {Object} layer Text layer.
 * @return {{ blockH: number, floor: number }} Heights.
 */
export function textLayoutBlockH( layer ) {
	layer = withTextTransform( layer );
	if ( hasSpans( layer ) ) {
		const { blockH } = layoutRichText( getMeasureCtx(), layer );
		return { blockH, floor: ( layer.fontSize || 16 ) * 1.3 };
	}
	const perLine =
		Array.isArray( layer.lineStyles ) && layer.lineStyles.some( Boolean );
	const base = textLineStyle( layer, -1 );
	const ctx = getMeasureCtx();
	ctx.font = base.font;
	const rawLines = String( layer.text || '' ).split( '\n' );
	const lines =
		layer.fixedWidth && ! perLine
			? rawLines.flatMap( ( line ) =>
					wrapLine( ctx, line, layer.w, layer.letterSpacing || 0 )
			  )
			: rawLines;
	const sty = lines.map( ( _, i ) =>
		perLine ? textLineStyle( layer, i ) : base
	);
	const metric = ( s, st ) => {
		ctx.font = st.font;
		const m = ctx.measureText( s || 'Mg' );
		return {
			a: m.actualBoundingBoxAscent || st.size * 0.8,
			d: m.actualBoundingBoxDescent || st.size * 0.2,
		};
	};
	const first = metric( lines[ 0 ], sty[ 0 ] );
	const last = metric( lines[ lines.length - 1 ], sty[ lines.length - 1 ] );
	let advances = 0;
	for ( let i = 1; i < lines.length; i++ ) {
		advances += sty[ i ].lineHeight;
	}
	return {
		blockH: first.a + advances + last.d,
		floor: advances + sty[ 0 ].size * 1.3,
	};
}

/**
 * The natural box height (doc px) a text layer needs so its glyphs fit, used
 * to auto-grow the text box while editing so text never spills and vertical
 * centring is exact (v1.24.11). Mirrors drawText's wrapping + metrics: keeps
 * the familiar one-line box (fontSize·1.3) as the comfortable minimum, adds a
 * line-height per extra line, and never drops below the real glyph block
 * (so tall emoji lines still fit).
 *
 * @param {Object} layer Text layer.
 * @return {number} Fitting box height in doc px.
 */
export function measureTextHeight( layer ) {
	const { blockH, floor } = textLayoutBlockH( layer );
	return Math.ceil( Math.max( blockH, floor ) );
}

/**
 * Canvas-accurate laid-out block height (no min-box floor), so the edit
 * overlay can vertically anchor text exactly like the renderer.
 *
 * @param {Object} layer Text layer.
 * @return {number} Block height in px.
 */
export function textBlockHeight( layer ) {
	return textLayoutBlockH( layer ).blockH;
}

/**
 * The height a text layer should take after an edit commit:
 *  - path / shape text keep their box (it frames the outline, not the metrics),
 *  - point text hugs its content,
 *  - a drawn area-text box (fixedWidth) keeps the height the user gave it and
 *    only grows when the text overflows, so vertical alignment (valign) has room
 *    to work instead of the box collapsing onto the first line.
 *
 * @param {Object} layer Text layer (already carrying its new text/spans).
 * @return {number} Height in px.
 */
export function textCommitHeight( layer ) {
	if ( layer.textPath || layer.shapeBox ) {
		return layer.h;
	}
	const contentH = measureTextHeight( layer );
	return layer.fixedWidth ? Math.max( layer.h || 0, contentH ) : contentH;
}

/**
 * Vertical offset (doc px) to add to the edit overlay's box top so its text
 * sits EXACTLY where the canvas renders it (v1.222.0). The canvas anchors the
 * first baseline at topPad + actualAscent; a contentEditable anchors its first
 * baseline at (lineHeightPx + fontAscent - fontDescent) / 2 from its content
 * top (CSS half-leading, which goes negative for tight line-heights). The
 * difference is applied to the box position rather than paddingTop because it
 * can be negative. Verified in Chromium across sizes and line-heights.
 *
 * @param {Object} layer Text layer.
 * @return {number} Offset in doc px (can be negative).
 */
export function textEditOffset( layer ) {
	const perLine =
		Array.isArray( layer.lineStyles ) && layer.lineStyles.some( Boolean );
	const st = textLineStyle( layer, perLine ? 0 : -1 );
	const ctx = getMeasureCtx();
	ctx.font = st.font;
	const sample = String( layer.text || '' ).split( '\n' )[ 0 ] || 'Mg';
	const m = ctx.measureText( sample || 'Mg' );
	const actualAscent = m.actualBoundingBoxAscent || st.size * 0.72;
	const fontAscent =
		undefined !== m.fontBoundingBoxAscent
			? m.fontBoundingBoxAscent
			: st.size * 0.92;
	const fontDescent =
		undefined !== m.fontBoundingBoxDescent
			? m.fontBoundingBoxDescent
			: st.size * 0.25;
	const browserBaseline = ( st.lineHeight + fontAscent - fontDescent ) / 2;
	const topPad = textTopPad( layer, textBlockHeight( layer ) );
	return topPad + actualAscent - browserBaseline;
}

/**
 * The natural (unwrapped) width of a text layer's widest line in doc px,
 * mirroring drawText's font setup and letter-spacing advance. Used by the
 * text-layout builder (v1.44) to fit lines to a block width.
 *
 * @param {Object} layer Text layer (fontSize/fontFamily/weight/italic/text).
 * @return {number} Widest line width in doc px.
 */
export function measureTextWidth( layer ) {
	layer = withTextTransform( layer );
	if ( hasSpans( layer ) ) {
		const { lines } = layoutRichText( getMeasureCtx(), {
			...layer,
			fixedWidth: false,
		} );
		return Math.ceil( Math.max( 0, ...lines.map( ( l ) => l.width ) ) );
	}
	const perLine =
		Array.isArray( layer.lineStyles ) && layer.lineStyles.some( Boolean );
	const ctx = getMeasureCtx();
	const lines = String( layer.text || '' ).split( '\n' );
	let w = 0;
	lines.forEach( ( line, i ) => {
		const st = textLineStyle( layer, perLine ? i : -1 );
		ctx.font = st.font;
		w = Math.max( w, measureWithSpacing( ctx, line, st.ls ) );
	} );
	return Math.ceil( w );
}

/**
 * Effective style of raw line `i` of a text layer: layer defaults merged with
 * the optional per-line override `layer.lineStyles[i]` (v1.45 — different
 * sizes/fonts/colours WITHIN one text box; the layout button builds these).
 * Pass i = -1 for the plain layer default.
 *
 * @param {Object} layer Text layer.
 * @param {number} i     Raw line index (split on newline), -1 = defaults.
 * @return {Object} { size, family, weight, italic, color, ls, lh, lineHeight, font }.
 */
export function textLineStyle( layer, i ) {
	const o =
		( i >= 0 &&
			Array.isArray( layer.lineStyles ) &&
			layer.lineStyles[ i ] ) ||
		{};
	const size = o.size || layer.fontSize || 16;
	const family = o.family || layer.fontFamily || 'Inter';
	const rawWeight = o.weight || layer.weight || 400;
	const weight = LOCAL_FONTS[ family ]
		? nearestWeight( family, rawWeight )
		: rawWeight;
	const italic = undefined !== o.italic ? !! o.italic : !! layer.italic;
	const lh = o.lh || layer.lineHeight || 1.05;
	return {
		size,
		family,
		weight,
		italic,
		color: o.color || null,
		ls: undefined !== o.ls ? o.ls : layer.letterSpacing || 0,
		lineHeight: lh * size,
		font: `${
			italic ? 'italic ' : ''
		}${ weight } ${ size }px "${ family }", sans-serif`,
	};
}

/** Whether a text layer carries per-line style overrides. */
export const hasLineStyles = ( layer ) =>
	Array.isArray( layer.lineStyles ) && layer.lineStyles.some( Boolean );

/** The largest font size a text layer renders with (for buffer padding). */
export function maxTextSize( layer ) {
	let m = maxSpanSize( layer );
	if ( Array.isArray( layer.lineStyles ) ) {
		for ( const s of layer.lineStyles ) {
			if ( s?.size > m ) {
				m = s.size;
			}
		}
	}
	return m;
}

export const measureWithSpacing = ( ctx, line, spacing ) =>
	spacing
		? Array.from( line ).reduce(
				( acc, ch ) => acc + ctx.measureText( ch ).width + spacing,
				-spacing
		  )
		: ctx.measureText( line ).width;

export function wrapLine( ctx, line, maxW, spacing ) {
	const words = line.split( ' ' );
	const out = [];
	let current = '';
	for ( const word of words ) {
		const candidate = current ? current + ' ' + word : word;
		if ( measureWithSpacing( ctx, candidate, spacing ) > maxW && current ) {
			out.push( current );
			current = word;
		} else {
			current = candidate;
		}
	}
	out.push( current );
	return out;
}
