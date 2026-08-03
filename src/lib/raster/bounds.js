import { arrowHeadSpec, ARROW_KINDS } from '../line-geometry';
import { warpedQuadPoints } from '../quad-warp';
import { textFxReach } from './text-warp';
import { maxTextSize } from './text-metrics';

/* ------------------------------- geometry ----------------------------- */

/**
 * Device-space bounding box of a rotated layer rect, padded for styles.
 * @param layer
 * @param env
 */
export function layerDeviceBounds( layer, env ) {
	// Text glyphs may overshoot the em box (emoji ascenders, swashes,
	// combining marks), pad the scratch buffer so they never get cut
	// at the layer bounds (v1.4 emoji clipping fix).
	const pad =
		stylesPadding( layer ) +
		liveEffectPadding( layer ) +
		strokePadding( layer ) +
		textFxReach( layer ) +
		// Path text overshoots further: the baseline rides the path (which
		// may touch the box edge) and overflow continues straight past the
		// path ends (v1.156.2).
		( 'text' === layer.type
			? Math.ceil( maxTextSize( layer ) * ( layer.textPath ? 1.5 : 0.5 ) )
			: 0 );
	let corners;
	if ( 'stroke' === layer.type ) {
		// Stroke paths are absolute doc coordinates; use the tracked bbox.
		const maxSize = ( layer.paths || [] ).reduce(
			( m, p ) => Math.max( m, p.size || 0 ),
			0
		);
		corners = rectCorners(
			layer.x - maxSize,
			layer.y - maxSize,
			layer.w + 2 * maxSize,
			layer.h + 2 * maxSize,
			layer.rot,
			layer
		);
	} else if ( layer.quad ) {
		// Free transform (v0.7): bounds = the warped corner points. A
		// Bézier warp mesh can bulge OUTSIDE the quad, so sample it.
		corners = layer.warpMesh
			? warpedQuadPoints( layer.quad, layer.warpMesh )
			: [ layer.quad.tl, layer.quad.tr, layer.quad.br, layer.quad.bl ];
	} else {
		corners = rectCorners(
			layer.x,
			layer.y,
			layer.w,
			layer.h,
			layer.rot,
			layer
		);
	}
	const xs = corners.map( ( c ) => c.x );
	const ys = corners.map( ( c ) => c.y );
	const minX = Math.min( ...xs ) - pad;
	const minY = Math.min( ...ys ) - pad;
	const maxX = Math.max( ...xs ) + pad;
	const maxY = Math.max( ...ys ) + pad;
	const dev = {
		x: ( minX - env.viewport.x ) * env.scale,
		y: ( minY - env.viewport.y ) * env.scale,
		w: ( maxX - minX ) * env.scale,
		h: ( maxY - minY ) * env.scale,
	};
	// Intersect with the device viewport.
	const vw = env.viewport.w * env.scale;
	const vh = env.viewport.h * env.scale;
	const x0 = Math.max( 0, Math.floor( dev.x ) );
	const y0 = Math.max( 0, Math.floor( dev.y ) );
	const x1 = Math.min( vw, Math.ceil( dev.x + dev.w ) );
	const y1 = Math.min( vh, Math.ceil( dev.y + dev.h ) );
	if ( x1 <= x0 || y1 <= y0 ) {
		return null;
	}
	return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function rectCorners( x, y, w, h, rot ) {
	if ( ! rot ) {
		return [
			{ x, y },
			{ x: x + w, y },
			{ x, y: y + h },
			{ x: x + w, y: y + h },
		];
	}
	const cx = x + w / 2;
	const cy = y + h / 2;
	const rad = ( rot * Math.PI ) / 180;
	const cos = Math.cos( rad );
	const sin = Math.sin( rad );
	return [
		[ x, y ],
		[ x + w, y ],
		[ x, y + h ],
		[ x + w, y + h ],
	].map( ( [ px, py ] ) => ( {
		x: cx + ( px - cx ) * cos - ( py - cy ) * sin,
		y: cy + ( px - cx ) * sin + ( py - cy ) * cos,
	} ) );
}

/**
 * How far an effect bleeds OUTSIDE the pixels it is applied to (doc px):
 * blurs/glows need this much extra buffer or they get cut at the layer
 * bounds (v1.15.2 "hard edge on strong blur" fix).
 *
 * @param {Object} params Effect params.
 * @return {number} Padding in px.
 */
export function effectReach( params = {} ) {
	return Math.min(
		300,
		Math.ceil(
			3 * ( params.radius || 0 ) +
				2 * ( params.blur || 0 ) +
				( params.distance || 0 ) +
				( params.spread || 0 )
		)
	);
}

/** Combined reach of a layer's live effects (smart filters + preview). */
/**
 * A shape's stroke straddles its path, overshooting the layer box by half
 * its width, pad the scratch buffer so it isn't clipped at the bounds
 * (v1.23).
 *
 * @param {Object} layer Layer.
 * @return {number} Padding in doc px.
 */
export function strokePadding( layer ) {
	if ( 'shape' !== layer.type ) {
		return 0;
	}
	let pad = 0;
	if ( layer.stroke && 'transparent' !== layer.stroke && layer.strokeW ) {
		pad = Math.ceil( layer.strokeW / 2 ) + 1;
	}
	// Lines stroke via `fill` (stroke often null): their round caps
	// overshoot the endpoints and arrowheads (v1.300) reach further out.
	if ( 'line' === layer.shape ) {
		const lw = Math.max( 2, layer.strokeW || 0 );
		let reach = lw / 2 + 1;
		for ( const kind of [ layer.arrowStart, layer.arrowEnd ] ) {
			if ( ARROW_KINDS.includes( kind ) ) {
				const spec = arrowHeadSpec( kind, lw );
				reach = Math.max( reach, spec.half + lw / 2 + 1, spec.r + 1 );
			}
		}
		pad = Math.max( pad, Math.ceil( reach ) );
	}
	return pad;
}

export function liveEffectPadding( layer ) {
	let pad = 0;
	for ( const sf of layer.smartFilters || [] ) {
		if ( sf.enabled ) {
			pad = Math.max( pad, effectReach( sf.params ) );
		}
	}
	if ( layer.previewEffect ) {
		pad = Math.max( pad, effectReach( layer.previewEffect.params ) );
	}
	return pad;
}

export function stylesPadding( layer ) {
	const s = layer.styles;
	if ( ! s ) {
		return 2;
	}
	let pad = 2;
	// Canvas filter blur(r) is a Gaussian with sigma = r, and its visible
	// spill reaches about 3*sigma: reserve 3x the blur radius, or soft
	// shadows and glows get clipped hard at the layer bounds (v1.97.1).
	if ( s.dropShadow ) {
		pad = Math.max(
			pad,
			( s.dropShadow.distance || 0 ) +
				( s.dropShadow.blur || 0 ) * 3 +
				( s.dropShadow.spread || 0 ) +
				2
		);
	}
	if ( s.innerShadow ) {
		pad = Math.max( pad, ( s.innerShadow.blur || 0 ) + 2 );
	}
	if ( s.outerGlow ) {
		pad = Math.max(
			pad,
			( s.outerGlow.blur || 0 ) * 3 + ( s.outerGlow.spread || 0 ) + 2
		);
	}
	if ( s.stroke && 'inside' !== s.stroke.position ) {
		pad = Math.max( pad, ( s.stroke.size || 0 ) + 2 );
	}
	return pad;
}

/**
 * How far a layer's rendering overshoots its geometric box, per side, in doc
 * px: shape stroke, layer styles, live-effect bleed and text glyph overshoot.
 * Unlike the render-time padding it omits the baseline anti-alias margin, so
 * a plain box with none of these returns 0 and stays tight. Used to expand a
 * rasterize/crop region so nothing is clipped (v1.24.5: Convert to Smart
 * Object cut strokes off at the layer bounds).
 *
 * @param {Object} layer Layer.
 * @return {number} Overshoot in doc px (0 when the box is exact).
 */
export function layerOvershoot( layer ) {
	return (
		strokePadding( layer ) +
		liveEffectPadding( layer ) +
		textFxReach( layer ) +
		( layer.styles ? stylesPadding( layer ) : 0 ) +
		( 'text' === layer.type
			? Math.ceil( maxTextSize( layer ) * ( layer.textPath ? 1.5 : 0.5 ) )
			: 0 )
	);
}
