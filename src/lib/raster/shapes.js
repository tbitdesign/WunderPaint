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

export function drawShape( ctx, layer ) {
	const { w, h } = layer;
	ctx.beginPath();
	if ( layer.pathD ) {
		tracePathD( ctx, layer.pathD );
		if ( layer.fill && 'transparent' !== layer.fill ) {
			ctx.fillStyle = shapeFillStyle( ctx, layer );
			ctx.fill();
		}
		if ( layer.stroke && layer.strokeW ) {
			ctx.strokeStyle = layer.stroke;
			ctx.lineWidth = layer.strokeW;
			ctx.lineJoin = 'round';
			ctx.lineCap = 'round';
			const dashed = applyStrokeDash( ctx, layer );
			ctx.stroke();
			if ( dashed ) {
				ctx.setLineDash( [] );
			}
		}
		return;
	}
	switch ( layer.shape ) {
		case 'ellipse':
			ctx.ellipse( w / 2, h / 2, w / 2, h / 2, 0, 0, 2 * Math.PI );
			break;
		case 'line': {
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
			ctx.lineCap = 'round';
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
				drawArrowHead(
					ctx,
					b,
					Math.atan2( dy, dx ),
					endKind,
					lw,
					color
				);
			}
			return;
		}
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
		case 'arrow':
			ctx.moveTo( 0, h * 0.32 );
			ctx.lineTo( w * 0.62, h * 0.32 );
			ctx.lineTo( w * 0.62, h * 0.08 );
			ctx.lineTo( w, h / 2 );
			ctx.lineTo( w * 0.62, h * 0.92 );
			ctx.lineTo( w * 0.62, h * 0.68 );
			ctx.lineTo( 0, h * 0.68 );
			ctx.closePath();
			break;
		case 'heart':
			ctx.moveTo( w / 2, h * 0.95 );
			ctx.bezierCurveTo(
				-w * 0.18,
				h * 0.5,
				w * 0.08,
				-h * 0.18,
				w / 2,
				h * 0.3
			);
			ctx.bezierCurveTo(
				w * 0.92,
				-h * 0.18,
				w * 1.18,
				h * 0.5,
				w / 2,
				h * 0.95
			);
			ctx.closePath();
			break;
		case 'speech': {
			const r2 = Math.min( w, h ) * 0.12;
			const bh = h * 0.74;
			ctx.moveTo( r2, 0 );
			ctx.arcTo( w, 0, w, bh, r2 );
			ctx.arcTo( w, bh, 0, bh, r2 );
			ctx.lineTo( w * 0.34, bh );
			ctx.lineTo( w * 0.2, h );
			ctx.lineTo( w * 0.22, bh );
			ctx.arcTo( 0, bh, 0, 0, r2 );
			ctx.arcTo( 0, 0, w, 0, r2 );
			ctx.closePath();
			break;
		}
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
	if ( layer.fill && 'transparent' !== layer.fill ) {
		ctx.fillStyle = shapeFillStyle( ctx, layer );
		ctx.fill();
	}
	if ( layer.stroke && layer.strokeW ) {
		ctx.strokeStyle = layer.stroke;
		ctx.lineWidth = layer.strokeW;
		const dashed = applyStrokeDash( ctx, layer );
		ctx.stroke();
		if ( dashed ) {
			ctx.setLineDash( [] );
		}
	}
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
