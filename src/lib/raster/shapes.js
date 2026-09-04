import { ensureNormalizedPathD } from '../path';
import { cornerRadii } from '../corner-radii';
import {
	polygonVertices,
	rectVertices,
	roundedPolyCommands,
	traceCommands,
} from '../corner-geometry';
import { arrowHeadSpec, ARROW_KINDS } from '../line-geometry';
import {
	gradientFillFor,
	patternTile,
	registerUserTile,
	scaledTile,
	userTile,
} from './patterns';
import { extraShapePath } from '../shape-library';
import { dynamicShapeCommands, roundedPathCommands } from '../shape-dynamics';
import { strokeAlignOf, strokeCapOf, strokeJoinOf } from '../stroke-align';
import { createCanvas } from './env';

/**
 * Default dash/gap for a stroke style, derived from the stroke width so the
 * pattern reads at any weight. Shared by the renderer AND the UI (the
 * inputs display these until the user types explicit values).
 *
 * @param {string} kind  'dashed' | 'dotted'.
 * @param {number} width Stroke width in px.
 */
export const dashDefaults = ( kind, width ) => {
	const w = Math.max( 1, width || 1 );
	return 'dotted' === kind
		? { len: 0, gap: Math.round( w * 2 ) }
		: { len: Math.round( w * 3 ), gap: Math.round( w * 2 ) };
};

/**
 * setLineDash pattern for a layer stroke, or null for solid. Dotted uses a
 * near-zero on-segment with round caps, so each dash renders as a circle of
 * the stroke width; `gap` is the visual space between dots, hence + width.
 *
 * @param {string} kind  'dashed' | 'dotted' (anything else = solid).
 * @param {number} width Stroke width in px.
 * @param {number} len   Explicit dash length (optional).
 * @param {number} gap   Explicit gap (optional).
 */
export function dashPattern( kind, width, len, gap ) {
	if ( 'dashed' !== kind && 'dotted' !== kind ) {
		return null;
	}
	const d = dashDefaults( kind, width );
	const g = Math.max( 1, gap ?? d.gap );
	return 'dotted' === kind
		? [ 0.01, g + Math.max( 1, width || 1 ) ]
		: [ Math.max( 1, len ?? d.len ), g ];
}

/** Apply a shape layer's stroke dash (if any) to the context. */
function applyStrokeDash( ctx, layer, width = layer.strokeW ) {
	const dash = dashPattern(
		layer.strokeDash,
		width,
		layer.strokeDashLen,
		layer.strokeDashGap
	);
	if ( dash ) {
		ctx.setLineDash( dash );
		if ( 'dotted' === layer.strokeDash ) {
			ctx.lineCap = 'round';
		}
	}
	return !! dash;
}

/**
 * Trace an SVG-ish path string (M/L/Q/C/Z, the subset our tools generate)
 * onto a context. No Path2D dependency, so it runs in workers/node too.
 *
 * @param {CanvasRenderingContext2D} ctx Context (beginPath NOT called here).
 * @param {string}                   d   Path data.
 */
export function tracePathD( ctx, d ) {
	// Full SVG path support (v1.2.1): relative commands, H/V, arcs and
	// shorthands are normalized to absolute M/L/C/Q/Z before tracing.
	const tokens =
		ensureNormalizedPathD( d ).match(
			/[a-df-zA-DF-Z]|-?\d*\.?\d+(?:e[+-]?\d+)?/g
		) || [];
	let i = 0;
	let cmd = null;
	let sx = 0;
	let sy = 0;
	const num = () => parseFloat( tokens[ i++ ] );
	while ( i < tokens.length ) {
		if ( /[a-zA-Z]/.test( tokens[ i ] ) ) {
			cmd = tokens[ i++ ];
		}
		switch ( cmd ) {
			case 'M': {
				sx = num();
				sy = num();
				ctx.moveTo( sx, sy );
				cmd = 'L';
				break;
			}
			case 'L':
				ctx.lineTo( num(), num() );
				break;
			case 'Q': {
				const cx = num();
				const cy = num();
				ctx.quadraticCurveTo( cx, cy, num(), num() );
				break;
			}
			case 'C': {
				const c1x = num();
				const c1y = num();
				const c2x = num();
				const c2y = num();
				ctx.bezierCurveTo( c1x, c1y, c2x, c2y, num(), num() );
				break;
			}
			case 'Z':
			case 'z':
				ctx.closePath();
				ctx.moveTo( sx, sy );
				cmd = null;
				break;
			default:
				i++; // Unknown command, skip defensively.
		}
	}
}

export function shapeFillStyle( ctx, layer ) {
	// Effective fill type, pre-fillType shapes with a pattern still render it.
	const fillType =
		layer.fillType ||
		( layer.pattern && 'none' !== layer.pattern ? 'pattern' : 'solid' );
	if ( 'gradient' === fillType && layer.gradientStops?.length ) {
		return gradientFillFor(
			ctx,
			layer.w,
			layer.h,
			layer.gradientStops,
			layer.gradientAngle,
			layer.gradientKind
		);
	}
	const kind = layer.pattern;
	if ( 'pattern' !== fillType || ! kind || 'none' === kind ) {
		return layer.fill;
	}
	if ( 'custom' === kind ) {
		const tile = userTile( layer.patternData );
		if ( tile ) {
			return ctx.createPattern(
				scaledTile( tile, layer.patternScale ),
				'repeat'
			);
		}
		registerUserTile( layer.patternData ); // decode for the next render
		return layer.fill;
	}
	return ctx.createPattern(
		scaledTile( patternTile( kind, layer.fill ), layer.patternScale ),
		'repeat'
	);
}

/**
 * One arrowhead at a line tip (v1.300). The angle points OUT of the
 * line; heads always paint solid (dashes stop at the shaft).
 *
 * @param {CanvasRenderingContext2D} ctx   Target context.
 * @param {Object}                   tip   { x, y } line endpoint.
 * @param {number}                   angle Outward direction in radians.
 * @param {string}                   kind  arrow|triangle|circle|bar.
 * @param {number}                   lw    Stroke width.
 * @param {string}                   color Head color.
 */
function drawArrowHead( ctx, tip, angle, kind, lw, color ) {
	const { len, half, r } = arrowHeadSpec( kind, lw );
	ctx.save();
	ctx.translate( tip.x, tip.y );
	ctx.rotate( angle );
	ctx.strokeStyle = color;
	ctx.fillStyle = color;
	ctx.lineWidth = lw;
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	ctx.setLineDash( [] );
	ctx.beginPath();
	if ( 'arrow' === kind ) {
		ctx.moveTo( -len, -half );
		ctx.lineTo( 0, 0 );
		ctx.lineTo( -len, half );
		ctx.stroke();
	} else if ( 'triangle' === kind ) {
		ctx.moveTo( 0, 0 );
		ctx.lineTo( -len, -half );
		ctx.lineTo( -len, half );
		ctx.closePath();
		ctx.fill();
	} else if ( 'circle' === kind ) {
		ctx.arc( 0, 0, r, 0, 2 * Math.PI );
		ctx.fill();
	} else if ( 'bar' === kind ) {
		ctx.moveTo( 0, -half );
		ctx.lineTo( 0, half );
		ctx.stroke();
	}
	ctx.restore();
}

/**
 * Stroke the current path in the layer's stroke colour.
 *
 * @param {CanvasRenderingContext2D} ctx   Target context.
 * @param {Object}                   layer Shape layer.
 * @param {number}                   width Line width to use.
 * @param {boolean}                  round Round joins and caps.
 */
function strokeOutline( ctx, layer, width, round ) {
	ctx.strokeStyle = layer.stroke;
	ctx.lineWidth = width;
	// Caps and joins (v1.429): the layer's own when set, else round for
	// path shapes and mitred/flat for the legacy maths shapes.
	ctx.lineJoin = strokeJoinOf( layer, round ? 'round' : 'miter' );
	ctx.lineCap = strokeCapOf( layer, round ? 'round' : 'butt' );
	const dashed = applyStrokeDash( ctx, layer );
	ctx.stroke();
	if ( dashed ) {
		ctx.setLineDash( [] );
	}
}

/**
 * The outer half of a double-width stroke (v1.430): painted on a scratch
 * canvas at the context's resolution, the shape punched out of it, the
 * rest drawn over the fill. A destination-out on the target context
 * itself would take the layers below with it, which is why the scratch
 * exists. Returns false when the scratch would be absurd; the caller then
 * strokes centred.
 *
 * @param {CanvasRenderingContext2D} ctx   Target context.
 * @param {Object}                   layer Shape layer.
 * @param {Function}                 trace Traces the outline on a context.
 * @param {boolean}                  round Round joins and caps.
 * @return {boolean} Whether the stroke was painted.
 */
function paintOutsideStroke( ctx, layer, trace, round ) {
	const sw = layer.strokeW;
	const t = ctx.getTransform ? ctx.getTransform() : null;
	const res = t ? Math.max( 0.25, Math.hypot( t.a, t.b ) ) : 1;
	const pad = Math.ceil( sw ) + 2;
	const W = Math.ceil( ( layer.w + 2 * pad ) * res );
	const H = Math.ceil( ( layer.h + 2 * pad ) * res );
	if ( ! ( W > 0 && H > 0 ) || W * H > 16e6 ) {
		return false;
	}
	const scratch = createCanvas( W, H );
	const sc = scratch.getContext( '2d' );
	sc.scale( res, res );
	sc.translate( pad, pad );
	sc.beginPath();
	trace( sc );
	strokeOutline( sc, layer, sw * 2, round );
	sc.globalCompositeOperation = 'destination-out';
	sc.fillStyle = '#000';
	sc.fill();
	ctx.drawImage( scratch, -pad, -pad, layer.w + 2 * pad, layer.h + 2 * pad );
	return true;
}

/**
 * Fill and stroke one traced outline in the layer's colours (v1.430): the
 * one place that knows where the stroke sits. `trace( c )` draws the
 * outline onto whichever context it is handed, because an outside stroke
 * is painted on a scratch canvas first. Centred strokes paint exactly as
 * they always did.
 *
 * @param {CanvasRenderingContext2D} ctx   Target context.
 * @param {Object}                   layer Shape layer.
 * @param {Function}                 trace Traces the outline on a context.
 * @param {boolean}                  round Round joins and caps.
 */
function paintPath( ctx, layer, trace, round ) {
	ctx.beginPath();
	trace( ctx );
	if ( layer.fill && 'transparent' !== layer.fill ) {
		ctx.fillStyle = shapeFillStyle( ctx, layer );
		ctx.fill();
	}
	if ( ! layer.stroke || ! layer.strokeW ) {
		return;
	}
	const align = strokeAlignOf( layer );
	if ( 'inside' === align ) {
		// Half of a double-width stroke lies inside the outline; the
		// clip keeps that half.
		ctx.save();
		ctx.clip();
		strokeOutline( ctx, layer, layer.strokeW * 2, round );
		ctx.restore();
		return;
	}
	if (
		'outside' === align &&
		paintOutsideStroke( ctx, layer, trace, round )
	) {
		return;
	}
	strokeOutline( ctx, layer, layer.strokeW, round );
}

/**
 * The shapes still defined as maths here (ellipse, polygon, star, badge,
 * rectangle), traced without filling.
 *
 * @param {CanvasRenderingContext2D} ctx   Target context.
 * @param {Object}                   layer Shape layer.
 */
function traceLegacyShape( ctx, layer ) {
	const { w, h } = layer;
	switch ( layer.shape ) {
		case 'ellipse':
			ctx.ellipse( w / 2, h / 2, w / 2, h / 2, 0, 0, 2 * Math.PI );
			break;
		case 'polygon':
		case 'star': {
			// Polygons and stars round their corners since v1.368 (and a
			// star's waist is adjustable): same geometry helper as the
			// rectangle, so all three agree on what a radius means.
			const pts = polygonVertices(
				layer.shape,
				w,
				h,
				layer.sides || ( 'star' === layer.shape ? 5 : 6 ),
				layer.innerRatio
			);
			traceCommands(
				ctx,
				roundedPolyCommands( pts, layer.radius, layer.cornerSmoothing )
			);
			break;
		}
		// 'arrow' and 'speech' moved to shape-dynamics (their defaults
		// reproduce the geometry that used to be hard-wired here).
		case 'badge': {
			const teeth = 24;
			for ( let i = 0; i < teeth * 2; i++ ) {
				const a = ( i / ( teeth * 2 ) ) * 2 * Math.PI - Math.PI / 2;
				const f = i % 2 ? 0.86 : 1;
				const px = w / 2 + ( w / 2 ) * f * Math.cos( a );
				const py = h / 2 + ( h / 2 ) * f * Math.sin( a );
				if ( i ) {
					ctx.lineTo( px, py );
				} else {
					ctx.moveTo( px, py );
				}
			}
			ctx.closePath();
			break;
		}
		default: {
			// Rectangle, optionally rounded. Four corners since v1.367 (the
			// on-canvas grips drag them apart); cornerRadii() reads both the
			// number and the [ tl, tr, br, bl ] form.
			const radii = cornerRadii( layer.radius, w, h );
			if ( radii.some( ( v ) => v > 0 ) ) {
				traceCommands(
					ctx,
					roundedPolyCommands(
						rectVertices( w, h ),
						radii,
						layer.cornerSmoothing
					)
				);
			} else {
				ctx.rect( 0, 0, w, h );
			}
		}
	}
}

export function drawShape( ctx, layer ) {
	const { w, h } = layer;
	// Dynamic (parametric) shapes trace the same command list the vector
	// export reads, so canvas and export cannot drift. A null means the
	// shape defers to its legacy path below (unsliced ellipse).
	const dyn = layer.pathD ? null : dynamicShapeCommands( layer );
	if ( dyn ) {
		paintPath( ctx, layer, ( c ) => traceCommands( c, dyn ), true );
		return;
	}
	// A shape from the path library draws itself: the same string the
	// exporter hands out is what lands on the canvas, so the two cannot
	// drift the way the nine hand-written ones can. A PURE-POLYGON path
	// with a radius runs through the corner engine first (v1.427) - that
	// is what makes the element catalog's arrows and banners dialable.
	const libD = layer.pathD ? null : extraShapePath( layer.shape, w, h );
	const roundedPath =
		layer.pathD && layer.radius
			? roundedPathCommands(
					layer.pathD,
					layer.radius,
					layer.cornerSmoothing
			  )
			: null;
	if ( roundedPath ) {
		paintPath( ctx, layer, ( c ) => traceCommands( c, roundedPath ), true );
		return;
	}
	if ( layer.pathD || libD ) {
		const d = layer.pathD || libD;
		paintPath( ctx, layer, ( c ) => tracePathD( c, d ), true );
		return;
	}
	if ( 'line' === layer.shape ) {
		ctx.beginPath();
		// lineFlip: the stroke runs along the anti-diagonal (bottom-left to
		// top-right), so lines match the direction they were drawn in.
		const a = layer.lineFlip ? { x: 0, y: h } : { x: 0, y: 0 };
		const b = layer.lineFlip ? { x: w, y: 0 } : { x: w, y: h };
		const lw = Math.max( 2, layer.strokeW || 0 );
		const color = layer.fill || layer.stroke || '#000';
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const len = Math.hypot( dx, dy ) || 1;
		const ux = dx / len;
		const uy = dy / len;
		const startKind = ARROW_KINDS.includes( layer.arrowStart )
			? layer.arrowStart
			: '';
		const endKind = ARROW_KINDS.includes( layer.arrowEnd )
			? layer.arrowEnd
			: '';
		// Filled tips pull the shaft back so it never pokes past them
		// (skipped when the line is too short to trim).
		let t1 = startKind ? arrowHeadSpec( startKind, lw ).trim : 0;
		let t2 = endKind ? arrowHeadSpec( endKind, lw ).trim : 0;
		if ( t1 + t2 >= len ) {
			t1 = 0;
			t2 = 0;
		}
		ctx.moveTo( a.x + ux * t1, a.y + uy * t1 );
		ctx.lineTo( b.x - ux * t2, b.y - uy * t2 );
		ctx.strokeStyle = color;
		ctx.lineWidth = lw;
		ctx.lineCap = strokeCapOf( layer, 'round' );
		{
			const dashed = applyStrokeDash( ctx, layer, ctx.lineWidth );
			ctx.stroke();
			if ( dashed ) {
				ctx.setLineDash( [] );
			}
		}
		if ( startKind ) {
			drawArrowHead(
				ctx,
				a,
				Math.atan2( -dy, -dx ),
				startKind,
				lw,
				color
			);
		}
		if ( endKind ) {
			drawArrowHead( ctx, b, Math.atan2( dy, dx ), endKind, lw, color );
		}
		return;
	}
	// Legacy maths shapes keep their mitred joins and butt caps: an old
	// document must paint as it always did.
	paintPath( ctx, layer, ( c ) => traceLegacyShape( c, layer ), false );
}

export function drawGradient( ctx, layer ) {
	const { w, h } = layer;
	// from/to are doc coords; convert into layer-local space.
	const fx = ( layer.from?.x ?? 0 ) - layer.x;
	const fy = ( layer.from?.y ?? 0 ) - layer.y;
	const tx = ( layer.to?.x ?? w ) - layer.x;
	const ty = ( layer.to?.y ?? h ) - layer.y;
	let grad;
	if ( 'radial' === layer.kind ) {
		const r = Math.max( 1, Math.hypot( tx - fx, ty - fy ) );
		grad = ctx.createRadialGradient( fx, fy, 0, fx, fy, r );
	} else if ( 'angle' === layer.kind && ctx.createConicGradient ) {
		grad = ctx.createConicGradient(
			Math.atan2( ty - fy, tx - fx ),
			fx,
			fy
		);
	} else {
		grad = ctx.createLinearGradient( fx, fy, tx, ty );
	}
	for ( const stop of layer.stops || [] ) {
		grad.addColorStop( Math.min( 1, Math.max( 0, stop.at ) ), stop.color );
	}
	ctx.fillStyle = grad;
	ctx.fillRect( 0, 0, w, h );
}
