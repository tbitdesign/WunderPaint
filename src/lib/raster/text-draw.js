import { pathGlyphLayout, sampledPathFor } from '../text-path';
import { layoutTextInShape, maskSpanFn } from '../text-shape';
import {
	hasSpans,
	layoutRichText,
	textTopPad,
	withTextTransform,
} from '../rich-text';
import { createCanvas } from './env';
import { dashPattern, tracePathD } from './shapes';
import {
	curvedGlyphLayout,
	hasLineStyles,
	measureWithSpacing,
	textFillStyle,
	textLineStyle,
	wrapLine,
} from './text-metrics';
import { charFxFor, drawLineHighlights, paintGlyphFx } from './text-paint';

/** Dash pattern for a text layer's outline, or null for solid. */
const outlineDashFor = ( layer, width = layer.outlineW ) =>
	dashPattern(
		layer.outlineDash,
		width,
		layer.outlineDashLen,
		layer.outlineDashGap
	);

/**
 * Apply a dashed/dotted outline to the context. Solid outlines never touch
 * setLineDash: the text-FX painters (dashed outline FX) pre-set their own
 * dash on offscreen contexts before calling drawText, and resetting here
 * would wipe it.
 */
const applyOutlineDash = ( ctx, layer ) => {
	const dash = outlineDashFor( layer );
	if ( dash ) {
		ctx.setLineDash( dash );
		if ( 'dotted' === layer.outlineDash ) {
			ctx.lineCap = 'round';
		}
	}
};

/**
 * Rich-span text rendering (v1.46): character-range styles via the shared
 * layoutRichText engine — mixed sizes/fonts/colours within one layer, with
 * word-wrap inside the box for area text.
 */
export function drawRichText( ctx, layer ) {
	ctx.textBaseline = 'alphabetic';
	const baseFill = textFillStyle( ctx, layer );
	const { lines } = layoutRichText( ctx, layer );

	// Hand-drawn highlights per line (straight text only, v1.141.0).
	if (
		! layer.curve &&
		! layer.textPath?.d &&
		( layer.textFX?.marker ||
			layer.textFX?.circleMark ||
			layer.textFX?.scribbleUnder ||
			layer.textFX?.strikeFx )
	) {
		drawLineHighlights(
			ctx,
			layer.textFX,
			lines
				.filter( ( line ) => line.frags.length )
				.map( ( line ) => ( {
					x: line.x,
					baseline: line.baseline,
					width: line.width,
					size: Math.max( ...line.frags.map( ( f ) => f.st.size ) ),
				} ) )
		);
	}

	// Word-level marker highlights (v1.141.1): fragments whose span style
	// carries `mark` get a hand-drawn swipe, adjacent same-color fragments
	// merged so one word gets ONE stroke. Straight text only.
	if (
		! layer.curve &&
		! layer.textPath?.d &&
		layer.spans?.some( ( r ) => r?.s?.mark )
	) {
		const rects = [];
		for ( const line of lines ) {
			let open = null;
			for ( const f of line.frags ) {
				if ( ! f.st.mark || ! f.text.trim() ) {
					continue;
				}
				if (
					open &&
					open.color === f.st.mark &&
					f.x - ( open.x + open.width ) < f.st.size * 0.6
				) {
					open.width = f.x + f.w - open.x;
					open.size = Math.max( open.size, f.st.size );
				} else {
					open = {
						x: f.x,
						baseline: line.baseline,
						width: f.w,
						size: f.st.size,
						color: f.st.mark,
					};
					rects.push( open );
				}
			}
		}
		const groups = new Map();
		for ( const rect of rects ) {
			if ( ! groups.has( rect.color ) ) {
				groups.set( rect.color, [] );
			}
			groups.get( rect.color ).push( rect );
		}
		for ( const [ color, group ] of groups ) {
			drawLineHighlights(
				ctx,
				{ marker: { color, rough: 4, seed: 1 } },
				group
			);
		}
	}

	// Pill background per line (straight text only).
	if ( layer.bgColor && ! layer.curve && ! layer.textPath?.d ) {
		ctx.fillStyle = layer.bgColor;
		for ( const line of lines ) {
			if ( ! line.frags.length ) {
				continue;
			}
			const size = Math.max( ...line.frags.map( ( f ) => f.st.size ) );
			const padX = size * 0.28;
			const padY = size * 0.16;
			const rx = line.x - padX;
			const ry = line.baseline - size * 0.78 - padY;
			const rw = line.width + padX * 2;
			const rh = size + padY * 2;
			const rr = Math.min( layer.bgRadius ?? 8, rh / 2 );
			ctx.beginPath();
			ctx.moveTo( rx + rr, ry );
			ctx.arcTo( rx + rw, ry, rx + rw, ry + rh, rr );
			ctx.arcTo( rx + rw, ry + rh, rx, ry + rh, rr );
			ctx.arcTo( rx, ry + rh, rx, ry, rr );
			ctx.arcTo( rx, ry, rx + rw, ry, rr );
			ctx.closePath();
			ctx.fill();
		}
	}

	const useShadow = !! layer.shadowOn;
	const applyShadow = ( st ) => {
		if ( useShadow ) {
			ctx.shadowColor = layer.shadowColor || '#000';
			ctx.shadowOffsetX = st.size * 0.06;
			ctx.shadowOffsetY = st.size * 0.06;
			ctx.shadowBlur = st.size * 0.08;
		}
	};
	const clearShadow = () => {
		ctx.shadowColor = 'transparent';
		ctx.shadowOffsetX = 0;
		ctx.shadowOffsetY = 0;
		ctx.shadowBlur = 0;
	};
	const hasOutline = layer.outlineColor && layer.outlineW > 0;
	if ( hasOutline ) {
		ctx.strokeStyle = layer.outlineColor;
		ctx.lineWidth = layer.outlineW;
		ctx.lineJoin = 'round';
		applyOutlineDash( ctx, layer );
	}
	const paintGlyph = ( text, gx, gy, st ) => {
		applyShadow( st );
		if ( hasOutline ) {
			ctx.strokeText( text, gx, gy );
			clearShadow();
		}
		ctx.fillText( text, gx, gy );
		clearShadow();
	};
	const charFx = charFxFor( layer );

	if ( layer.curve || layer.textPath?.d ) {
		// Curved / path rich text: per-character placement with per-char
		// styles. A stored text path wins over the arc curve.
		const onPath = !! layer.textPath?.d;
		const sampled = onPath ? sampledPathFor( layer.textPath ) : null;
		const base0 = lines[ 0 ]?.baseline || 0;
		const prevAlign = ctx.textAlign;
		ctx.textAlign = 'center';
		for ( const line of lines ) {
			const chars = [];
			const widths = [];
			const stys = [];
			for ( const f of line.frags ) {
				ctx.font = f.st.font;
				for ( const ch of f.text ) {
					chars.push( ch );
					widths.push( ctx.measureText( ch ).width );
					stys.push( f.st );
				}
			}
			const glyphs = onPath
				? pathGlyphLayout( {
						chars,
						widths,
						path: sampled,
						start: layer.textPath.start || 0,
						align: layer.align,
						letterSpacing: layer.letterSpacing || 0,
						baselineOffset: line.baseline - base0,
				  } )
				: curvedGlyphLayout( {
						chars,
						widths,
						curve: layer.curve,
						width: layer.w,
						align: layer.align,
						baseline: line.baseline,
						letterSpacing: layer.letterSpacing || 0,
				  } );
			glyphs.forEach( ( g, gi ) => {
				const st = stys[ gi ];
				ctx.font = st.font;
				ctx.fillStyle = st.color || baseFill;
				const m = charFx ? charFx.next( g.char, st.size ) : null;
				if ( m?.color ) {
					ctx.fillStyle = m.color;
				}
				ctx.save();
				ctx.translate( g.x + ( m?.dx || 0 ), g.y + ( m?.dy || 0 ) );
				ctx.rotate( g.angle + ( m?.rot || 0 ) );
				paintGlyph( g.char, 0, 0, st );
				ctx.restore();
			} );
		}
		ctx.textAlign = prevAlign;
		return;
	}

	for ( const line of lines ) {
		for ( const f of line.frags ) {
			const st = f.st;
			ctx.font = st.font;
			ctx.fillStyle = st.color || baseFill;
			if ( st.ls || charFx ) {
				let cx = f.x;
				for ( const ch of f.text ) {
					const chW = ctx.measureText( ch ).width;
					paintGlyphFx(
						ctx,
						charFx,
						ch,
						cx,
						line.baseline,
						st,
						chW,
						( gx, gy ) => paintGlyph( ch, gx, gy, st )
					);
					cx += chW + ( st.ls || 0 );
				}
			} else {
				paintGlyph( f.text, f.x, line.baseline, st );
			}
			if ( st.underline ) {
				ctx.fillStyle = st.color || baseFill;
				ctx.fillRect(
					f.x,
					line.baseline + st.size * 0.08,
					f.w,
					Math.max( 1, st.size / 16 )
				);
			}
		}
	}
}

/**
 * Area text flowed inside a shape outline (v1.210.0). The shape's layer-local
 * path (layer.shapeBox.d) is rasterized to an alpha mask; each text row is
 * wrapped to the shape's inside width at that height and auto-shrunk to fit,
 * so the paragraph takes the shape's silhouette (round in a circle, tapered
 * in a triangle). Plain text only - rich spans fall through to drawText.
 *
 * @param {CanvasRenderingContext2D} ctx   Target context (already in layer space).
 * @param {Object}                   layer Text layer with a shapeBox.
 */
export function drawTextInShape( ctx, layer ) {
	const w = Math.max( 1, Math.round( layer.w || 0 ) );
	const h = Math.max( 1, Math.round( layer.h || 0 ) );
	// Cap the mask so a huge layer stays cheap; spans map back via sx/sy.
	const cap = 900;
	const mScale = Math.min( 1, cap / Math.max( w, h ) );
	const mw = Math.max( 1, Math.round( w * mScale ) );
	const mh = Math.max( 1, Math.round( h * mScale ) );
	const mc = createCanvas( mw, mh );
	const mctx = mc.getContext( '2d' );
	mctx.setTransform( mw / layer.w, 0, 0, mh / layer.h, 0, 0 );
	mctx.beginPath();
	tracePathD( mctx, layer.shapeBox.d );
	mctx.fillStyle = '#000';
	mctx.fill();
	const rgba = mctx.getImageData( 0, 0, mw, mh ).data;
	const alpha = new Uint8ClampedArray( mw * mh );
	for ( let i = 0; i < mw * mh; i++ ) {
		alpha[ i ] = rgba[ i * 4 + 3 ];
	}
	const spanAt = maskSpanFn( alpha, mw, mh, layer.w / mw, layer.h / mh );
	// The shape's real filled vertical range (layer coords), so tapered or
	// bottom-heavy shapes flow and centre within the ink, not the bbox.
	let fillTop = 0;
	let fillBot = layer.h;
	for ( let row = 0; row < mh; row++ ) {
		let hit = false;
		for ( let x = 0; x < mw; x++ ) {
			if ( alpha[ row * mw + x ] > 8 ) {
				hit = true;
				break;
			}
		}
		if ( hit ) {
			fillTop = ( row * layer.h ) / mh;
			break;
		}
	}
	for ( let row = mh - 1; row >= 0; row-- ) {
		let hit = false;
		for ( let x = 0; x < mw; x++ ) {
			if ( alpha[ row * mw + x ] > 8 ) {
				hit = true;
				break;
			}
		}
		if ( hit ) {
			fillBot = ( ( row + 1 ) * layer.h ) / mh;
			break;
		}
	}

	const base = textLineStyle( layer, -1 );
	const fontOf = ( fs ) =>
		`${ base.italic ? 'italic ' : '' }${ base.weight } ${
			Math.round( fs * 100 ) / 100
		}px "${ base.family }", sans-serif`;
	const measure = ( s, fs ) => {
		ctx.font = fontOf( fs );
		return ctx.measureText( s ).width;
	};
	const fs0 = layer.fontSize || 24;
	const pad =
		undefined !== layer.shapeBox.pad && null !== layer.shapeBox.pad
			? layer.shapeBox.pad
			: Math.max( 8, fs0 * 0.35 );
	const lay = layoutTextInShape( {
		text: layer.text || '',
		fontSize: fs0,
		lineHeight: layer.lineHeight || 1.15,
		letterSpacing: layer.letterSpacing || 0,
		pad,
		top: fillTop,
		bottom: fillBot,
		spanAt,
		measure,
		minScale: 0.32,
	} );
	if ( ! lay.lines.length ) {
		return;
	}

	ctx.save();
	ctx.textBaseline = 'alphabetic';
	ctx.textAlign = 'center';
	const fill = textFillStyle( ctx, layer );
	const hasOutline = layer.outlineColor && layer.outlineW > 0;
	// Shape-fit lines scale the outline width per line; the dash pattern
	// scales with the same factor so the stitch density stays constant.
	const oDash = hasOutline ? outlineDashFor( layer ) : null;
	if ( hasOutline ) {
		ctx.strokeStyle = layer.outlineColor;
		ctx.lineJoin = 'round';
		if ( oDash && 'dotted' === layer.outlineDash ) {
			ctx.lineCap = 'round';
		}
	}
	for ( const ln of lay.lines ) {
		ctx.font = fontOf( ln.fs );
		ctx.fillStyle = fill;
		if ( layer.shadowOn ) {
			ctx.shadowColor = layer.shadowColor || '#000';
			ctx.shadowOffsetX = ln.fs * 0.06;
			ctx.shadowOffsetY = ln.fs * 0.06;
			ctx.shadowBlur = ln.fs * 0.08;
		}
		if ( ln.ls ) {
			// Manual advance so letter spacing is honoured, centred on cx.
			const chars = Array.from( ln.text );
			let x = ln.cx - ln.width / 2;
			ctx.textAlign = 'left';
			for ( const ch of chars ) {
				const cw = ctx.measureText( ch ).width;
				if ( hasOutline ) {
					ctx.lineWidth = layer.outlineW * ( ln.fs / fs0 );
					if ( oDash ) {
						ctx.setLineDash(
							oDash.map( ( v ) => ( v * ln.fs ) / fs0 )
						);
					}
					ctx.strokeText( ch, x, ln.baseline );
				}
				ctx.fillText( ch, x, ln.baseline );
				x += cw + ln.ls;
			}
			ctx.textAlign = 'center';
		} else {
			if ( hasOutline ) {
				ctx.lineWidth = layer.outlineW * ( ln.fs / fs0 );
				if ( oDash ) {
					ctx.setLineDash(
						oDash.map( ( v ) => ( v * ln.fs ) / fs0 )
					);
				}
				ctx.strokeText( ln.text, ln.cx, ln.baseline );
			}
			ctx.fillText( ln.text, ln.cx, ln.baseline );
		}
		ctx.shadowColor = 'transparent';
		ctx.shadowBlur = 0;
		ctx.shadowOffsetX = 0;
		ctx.shadowOffsetY = 0;
	}
	ctx.restore();
}

export function drawText( ctx, layer ) {
	// Non-destructive all-caps (v1.300): shadow the layer once here so
	// every paint path below sees the transformed characters.
	layer = withTextTransform( layer );
	if ( layer.shapeBox?.d ) {
		drawTextInShape( ctx, layer );
		return;
	}
	if ( hasSpans( layer ) ) {
		drawRichText( ctx, layer );
		return;
	}
	const perLine = hasLineStyles( layer );
	const base = textLineStyle( layer, -1 );
	ctx.font = base.font;
	const baseFill = textFillStyle( ctx, layer );
	ctx.fillStyle = baseFill;
	ctx.textBaseline = 'alphabetic';

	const rawLines = String( layer.text || '' ).split( '\n' );
	// Wrapping would shift the per-line style indexes, so styled text renders
	// its authored lines verbatim (the layout op breaks lines itself).
	// Justify (v1.179.0) also needs to know which flattened lines are SOFT
	// wraps (they stretch to fill the box) versus a paragraph's last line
	// (never justified, like CSS), so both arrays are built together.
	const isJustify = 'justify' === layer.align;
	let lines;
	let softWrap;
	if ( layer.fixedWidth && ! perLine ) {
		lines = [];
		softWrap = [];
		for ( const raw of rawLines ) {
			const wrapped = wrapLine(
				ctx,
				raw,
				layer.w,
				layer.letterSpacing || 0
			);
			wrapped.forEach( ( wl, k ) => {
				lines.push( wl );
				softWrap.push( k < wrapped.length - 1 );
			} );
		}
	} else {
		lines = rawLines;
		softWrap = rawLines.map( () => false );
	}
	const sty = lines.map( ( _, i ) =>
		perLine ? textLineStyle( layer, i ) : base
	);

	// Vertically place the text with REAL glyph metrics. Emoji ascend well
	// past the em box, so the old fixed 0.8·size baseline let them (and text
	// in general) sit too high and spill over the top of the bounds. Measure
	// the true ascent/descent, then centre the block in the box when it fits
	// and top-anchor at the real ascent when it doesn't, so tall multi-line
	// text still grows downward instead of overflowing both edges (v1.24.10).
	// Baselines accumulate per line so mixed sizes stack correctly (v1.45).
	const glyphMetrics = ( s, st ) => {
		ctx.font = st.font;
		const m = ctx.measureText( s || 'Mg' );
		return {
			a: m.actualBoundingBoxAscent || st.size * 0.8,
			d: m.actualBoundingBoxDescent || st.size * 0.2,
		};
	};
	const firstM = glyphMetrics( lines[ 0 ], sty[ 0 ] );
	const lastM = glyphMetrics(
		lines[ lines.length - 1 ],
		sty[ lines.length - 1 ]
	);
	let blockH = firstM.a + lastM.d;
	for ( let i = 1; i < lines.length; i++ ) {
		blockH += sty[ i ].lineHeight;
	}
	// Vertical anchor honours layer.valign for area text (v1.92.0); the
	// edit overlay applies the same offset so commits never jump.
	const topPad = textTopPad( layer, blockH );
	const bases = [];
	let acc = topPad + firstM.a;
	for ( let i = 0; i < lines.length; i++ ) {
		if ( i ) {
			acc += sty[ i ].lineHeight;
		}
		bases.push( acc );
	}
	const baseAt = ( i ) => bases[ i ];

	// Hand-drawn highlights per line (straight text only, v1.141.0).
	if (
		! layer.curve &&
		! layer.textPath?.d &&
		( layer.textFX?.marker ||
			layer.textFX?.circleMark ||
			layer.textFX?.scribbleUnder ||
			layer.textFX?.strikeFx )
	) {
		const rects = lines.map( ( line, i ) => {
			const st = sty[ i ];
			ctx.font = st.font;
			const width = measureWithSpacing( ctx, line, st.ls );
			let x = 0;
			if ( 'center' === layer.align ) {
				x = ( layer.w - width ) / 2;
			} else if ( 'right' === layer.align ) {
				x = layer.w - width;
			}
			return {
				x,
				baseline: baseAt( i ),
				width: line ? width : 0,
				size: st.size,
			};
		} );
		drawLineHighlights( ctx, layer.textFX, rects );
		ctx.fillStyle = baseFill;
	}

	// Clean highlight box per line: a rounded block that hugs the text.
	if ( layer.textFX?.highlight && ! layer.curve && ! layer.textPath?.d ) {
		const hl = layer.textFX.highlight;
		const padP = Math.max( 0, Math.min( 40, hl.pad ?? 14 ) );
		ctx.save();
		ctx.globalAlpha =
			Math.max( 10, Math.min( 100, hl.opacity ?? 100 ) ) / 100;
		ctx.fillStyle = hl.color || '#ffe066';
		lines.forEach( ( line, i ) => {
			if ( ! line ) {
				return;
			}
			const st = sty[ i ];
			ctx.font = st.font;
			const width = measureWithSpacing( ctx, line, st.ls );
			let x = 0;
			if ( 'center' === layer.align ) {
				x = ( layer.w - width ) / 2;
			} else if ( 'right' === layer.align ) {
				x = layer.w - width;
			}
			const padX = st.size * 0.12 + padP * 0.4;
			const padY = st.size * 0.14 + padP * 0.25;
			const y = baseAt( i );
			const rx = x - padX;
			const ry = y - st.size * 0.78 - padY;
			const rw = width + padX * 2;
			const rh = st.size + padY * 2;
			const rr = Math.min(
				Math.max( 0, Math.min( 60, hl.radius ?? 8 ) ),
				rh / 2
			);
			ctx.beginPath();
			ctx.moveTo( rx + rr, ry );
			ctx.arcTo( rx + rw, ry, rx + rw, ry + rh, rr );
			ctx.arcTo( rx + rw, ry + rh, rx, ry + rh, rr );
			ctx.arcTo( rx, ry + rh, rx, ry, rr );
			ctx.arcTo( rx, ry, rx + rw, ry, rr );
			ctx.closePath();
			ctx.fill();
		} );
		ctx.restore();
		ctx.fillStyle = baseFill;
	}

	// Decorative underline per line (solid / double / wavy / zigzag).
	if ( layer.textFX?.underlineFx && ! layer.curve && ! layer.textPath?.d ) {
		const u = layer.textFX.underlineFx;
		const style = Math.round( Math.max( 0, Math.min( 3, u.style ?? 0 ) ) );
		ctx.save();
		ctx.strokeStyle = u.color || '#e5484d';
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		lines.forEach( ( line, i ) => {
			if ( ! line ) {
				return;
			}
			const st = sty[ i ];
			ctx.font = st.font;
			const width = measureWithSpacing( ctx, line, st.ls );
			let x = 0;
			if ( 'center' === layer.align ) {
				x = ( layer.w - width ) / 2;
			} else if ( 'right' === layer.align ) {
				x = layer.w - width;
			}
			const th = Math.max( 1, ( ( u.thickness ?? 8 ) / 100 ) * st.size );
			const yb =
				baseAt( i ) +
				st.size * 0.16 +
				( ( u.offset ?? 8 ) / 100 ) * st.size;
			ctx.lineWidth = th;
			if ( 2 === style || 3 === style ) {
				const amp = th * 1.3;
				const period = Math.max( 8, st.size * 0.55 );
				ctx.beginPath();
				for ( let px = 0; px <= width; px += 2 ) {
					const t = px / period;
					const frac = t - Math.floor( t );
					const osc =
						3 === style
							? 4 * Math.abs( frac - 0.5 ) - 1
							: Math.sin( frac * Math.PI * 2 );
					const yy = yb + osc * amp;
					if ( 0 === px ) {
						ctx.moveTo( x + px, yy );
					} else {
						ctx.lineTo( x + px, yy );
					}
				}
				ctx.stroke();
			} else {
				ctx.beginPath();
				ctx.moveTo( x, yb );
				ctx.lineTo( x + width, yb );
				ctx.stroke();
				if ( 1 === style ) {
					const y2 = yb + th * 2.2;
					ctx.beginPath();
					ctx.moveTo( x, y2 );
					ctx.lineTo( x + width, y2 );
					ctx.stroke();
				}
			}
		} );
		ctx.restore();
		ctx.fillStyle = baseFill;
	}

	// Pill background per line (v0.6), straight text only.
	if ( layer.bgColor && ! layer.curve && ! layer.textPath?.d ) {
		ctx.fillStyle = layer.bgColor;
		lines.forEach( ( line, i ) => {
			const st = sty[ i ];
			ctx.font = st.font;
			const padX = st.size * 0.28;
			const padY = st.size * 0.16;
			const width = measureWithSpacing( ctx, line, st.ls );
			if ( ! line ) {
				return;
			}
			let x = 0;
			if ( 'center' === layer.align ) {
				x = ( layer.w - width ) / 2;
			} else if ( 'right' === layer.align ) {
				x = layer.w - width;
			}
			const y = baseAt( i );
			const rx = x - padX;
			const ry = y - st.size * 0.78 - padY;
			const rw = width + padX * 2;
			const rh = st.size + padY * 2;
			const rr = Math.min( layer.bgRadius ?? 8, rh / 2 );
			ctx.beginPath();
			ctx.moveTo( rx + rr, ry );
			ctx.arcTo( rx + rw, ry, rx + rw, ry + rh, rr );
			ctx.arcTo( rx + rw, ry + rh, rx, ry + rh, rr );
			ctx.arcTo( rx, ry + rh, rx, ry, rr );
			ctx.arcTo( rx, ry, rx + rw, ry, rr );
			ctx.closePath();
			ctx.fill();
		} );
		ctx.fillStyle = baseFill;
	}

	// Hard shadow + outline setup (v0.6).
	const useShadow = !! layer.shadowOn;
	const applyShadow = ( st ) => {
		if ( useShadow ) {
			ctx.shadowColor = layer.shadowColor || '#000';
			ctx.shadowOffsetX = st.size * 0.06;
			ctx.shadowOffsetY = st.size * 0.06;
			ctx.shadowBlur = st.size * 0.08;
		}
	};
	const clearShadow = () => {
		ctx.shadowColor = 'transparent';
		ctx.shadowOffsetX = 0;
		ctx.shadowOffsetY = 0;
		ctx.shadowBlur = 0;
	};
	const hasOutline = layer.outlineColor && layer.outlineW > 0;
	if ( hasOutline ) {
		ctx.strokeStyle = layer.outlineColor;
		ctx.lineWidth = layer.outlineW;
		ctx.lineJoin = 'round';
		applyOutlineDash( ctx, layer );
	}
	const paintGlyph = ( text, gx, gy, st ) => {
		applyShadow( st );
		if ( hasOutline ) {
			ctx.strokeText( text, gx, gy );
			clearShadow();
		}
		ctx.fillText( text, gx, gy );
		clearShadow();
	};
	const charFx = charFxFor( layer );

	if ( layer.curve || layer.textPath?.d ) {
		// Text on a circular arc or a stored path; underline is skipped.
		const onPath = !! layer.textPath?.d;
		const sampled = onPath ? sampledPathFor( layer.textPath ) : null;
		const prevAlign = ctx.textAlign;
		ctx.textAlign = 'center';
		lines.forEach( ( line, i ) => {
			const st = sty[ i ];
			ctx.font = st.font;
			ctx.fillStyle = st.color || baseFill;
			const chars = Array.from( line );
			const widths = chars.map( ( ch ) => ctx.measureText( ch ).width );
			const glyphs = onPath
				? pathGlyphLayout( {
						chars,
						widths,
						path: sampled,
						start: layer.textPath.start || 0,
						align: layer.align,
						letterSpacing: st.ls,
						baselineOffset: baseAt( i ) - baseAt( 0 ),
				  } )
				: curvedGlyphLayout( {
						chars,
						widths,
						curve: layer.curve,
						width: layer.w,
						align: layer.align,
						baseline: baseAt( i ),
						letterSpacing: st.ls,
				  } );
			for ( const g of glyphs ) {
				const m = charFx ? charFx.next( g.char, st.size ) : null;
				if ( m?.color ) {
					ctx.fillStyle = m.color;
				}
				ctx.save();
				ctx.translate( g.x + ( m?.dx || 0 ), g.y + ( m?.dy || 0 ) );
				ctx.rotate( g.angle + ( m?.rot || 0 ) );
				paintGlyph( g.char, 0, 0, st );
				ctx.restore();
			}
		} );
		ctx.textAlign = prevAlign;
		return;
	}

	lines.forEach( ( line, i ) => {
		const st = sty[ i ];
		ctx.font = st.font;
		ctx.fillStyle = st.color || baseFill;
		const y = baseAt( i );
		const width = measureWithSpacing( ctx, line, st.ls );
		let x = 0;
		if ( 'center' === layer.align ) {
			x = ( layer.w - width ) / 2;
		} else if ( 'right' === layer.align ) {
			x = layer.w - width;
		}
		// Justify a soft-wrapped line: spread the leftover width evenly across
		// its word gaps so it fills the box; a paragraph's last line stays put.
		let gapExtra = 0;
		if ( isJustify && softWrap[ i ] ) {
			x = 0;
			const spaces = ( line.match( / /g ) || [] ).length;
			const slack = layer.w - width;
			if ( spaces > 0 && slack > 0 ) {
				gapExtra = slack / spaces;
			}
		}
		if ( st.ls || charFx || gapExtra ) {
			let cx = x;
			for ( const ch of line ) {
				const chW = ctx.measureText( ch ).width;
				paintGlyphFx( ctx, charFx, ch, cx, y, st, chW, ( gx, gy ) =>
					paintGlyph( ch, gx, gy, st )
				);
				cx += chW + ( st.ls || 0 ) + ( ' ' === ch ? gapExtra : 0 );
			}
		} else {
			paintGlyph( line, x, y, st );
		}
		if ( layer.underline ) {
			ctx.fillStyle = st.color || baseFill;
			ctx.fillRect(
				x,
				y + st.size * 0.08,
				gapExtra ? layer.w : width,
				Math.max( 1, st.size / 16 )
			);
		}
	} );
}
