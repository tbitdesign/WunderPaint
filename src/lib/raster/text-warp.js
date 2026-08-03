import { createCanvas } from './env';
import { stampTextWithShadow } from './text-paint';
import { maxTextSize } from './text-metrics';

export const DEG = Math.PI / 180;

/**
 * Warp presets (v1.41, expanded v1.43): each maps a normalised source point
 * (u,v) ∈ [0,1]² to a displacement `{ dx, dy }` expressed as a fraction of the
 * layer width / height. `bend` (-1..1) scales the whole displacement. All are
 * smooth so a coarse mesh renders them cleanly.
 */
export const sq = ( x ) => x * x;

export const TEXT_WARPS = {
	arc: ( u ) => ( { dx: 0, dy: -( 1 - sq( 2 * u - 1 ) ) } ),
	arch: ( u, v ) => ( { dx: 0, dy: -( 1 - sq( 2 * u - 1 ) ) * ( 1 - v ) } ),
	arcLower: ( u, v ) => ( { dx: 0, dy: ( 1 - sq( 2 * u - 1 ) ) * v } ),
	bulge: ( u, v ) => ( {
		dx: 0,
		dy: ( 1 - sq( 2 * u - 1 ) ) * ( v - 0.5 ) * 2,
	} ),
	squeeze: ( u, v ) => ( {
		dx: 0,
		dy: -( 1 - sq( 2 * u - 1 ) ) * ( v - 0.5 ) * 2,
	} ),
	flag: ( u ) => ( { dx: 0, dy: 0.5 * Math.sin( 2 * Math.PI * u * 1.1 ) } ),
	wave: ( u, v ) => ( {
		dx: 0,
		dy: 0.4 * Math.sin( 2 * Math.PI * u * 2 ) * ( 1 - 0.3 * v ),
	} ),
	rise: ( u ) => ( { dx: 0, dy: -( 2 * u - 1 ) * 0.5 } ),
	fisheye: ( u, v ) => {
		const ox = 2 * u - 1;
		const oy = 2 * v - 1;
		const f = Math.max( 0, 1 - ( sq( ox ) + sq( oy ) ) * 0.5 );
		return { dx: ox * f * 0.5, dy: oy * f * 0.5 };
	},
	twist: ( u, v ) => {
		const ox = u - 0.5;
		const oy = v - 0.5;
		const f = Math.max( 0, 1 - Math.hypot( ox, oy ) * 1.4 );
		return { dx: -oy * f * 2, dy: ox * f * 2 };
	},
	cone: ( u, v ) => ( { dx: 0, dy: ( v - 0.5 ) * 2 * u } ),
	fish: ( u, v ) => ( {
		dx: 0,
		dy: ( v - 0.5 ) * 2 * Math.sin( Math.PI * Math.pow( u, 1.5 ) ) * 0.9,
	} ),
	bounce: ( u ) => ( {
		dx: 0,
		dy: -Math.abs( Math.sin( Math.PI * 2 * u ) ) * 0.6,
	} ),
	ripple: ( u, v ) => ( {
		dx: 0,
		dy: 0.3 * Math.sin( 2 * Math.PI * ( 2 * u + 0.25 * v ) ),
	} ),
	melt: ( u, v ) => ( {
		dx: 0,
		dy: v * ( 0.45 + 0.35 * Math.sin( 2 * Math.PI * u * 2.7 ) ),
	} ),
	persp: ( u, v ) => ( { dx: ( 2 * u - 1 ) * v * 0.35, dy: 0 } ),
	pinch: ( u, v ) => ( {
		dx: -( 2 * u - 1 ) * ( 1 - Math.abs( 2 * v - 1 ) ) * 0.16,
		dy: 0,
	} ),
};

// Max |dx|/|dy| a warp preset can displace (fraction of layer w/h), sampled
// once over the mesh grid so buffer padding can be sized to the actual reach.
export const warpReachCache = {};

export function warpMaxDisp( type ) {
	if ( warpReachCache[ type ] === undefined ) {
		const fn = TEXT_WARPS[ type ];
		let m = 0;
		for ( let r = 0; r <= 8; r++ ) {
			for ( let c = 0; c <= 48; c++ ) {
				const d = fn( c / 48, r / 8 );
				m = Math.max( m, Math.abs( d.dx ), Math.abs( d.dy ) );
			}
		}
		warpReachCache[ type ] = m;
	}
	return warpReachCache[ type ];
}

/**
 * How far a text layer's live text effects (v1.38+) bleed outside the layer
 * box, in doc px, so scratch buffers pad enough that long shadows, glows,
 * reflections and warps never get cut at the buffer edge.
 *
 * @param {Object} layer Layer.
 * @return {number} Padding in doc px (0 without text effects).
 */
export function textFxReach( layer ) {
	const fx = ( 'text' === layer.type ? layer.textFX : null ) || {};
	const spanMark =
		'text' === layer.type &&
		Array.isArray( layer.spans ) &&
		layer.spans.some( ( run ) => run?.s?.mark );
	if ( ! layer.textFX && ! spanMark ) {
		return 0;
	}
	let r = 0;
	if ( spanMark ) {
		r = Math.ceil( maxTextSize( layer ) * 0.5 ) + 6;
	}
	if ( fx.longShadow ) {
		r = Math.max( r, Math.min( 400, fx.longShadow.length ?? 20 ) );
	}
	if ( fx.extrude ) {
		r = Math.max( r, Math.min( 400, fx.extrude.depth ?? 20 ) );
	}
	if ( fx.glow ) {
		r = Math.max( r, Math.ceil( Math.min( 60, fx.glow.size || 14 ) ) + 2 );
	}
	if ( fx.neon ) {
		r = Math.max(
			r,
			Math.ceil( Math.min( 60, fx.neon.size || 18 ) * 1.4 ) + 2
		);
	}
	if ( fx.echo ) {
		r = Math.max(
			r,
			Math.min( 20, Math.round( fx.echo.count || 5 ) ) *
				Math.min( 80, fx.echo.gap || 10 )
		);
	}
	if ( fx.outline ) {
		r = Math.max(
			r,
			Math.ceil( Math.min( 40, fx.outline.size || 8 ) ) + 2
		);
	}
	if ( fx.splice ) {
		r = Math.max( r, Math.min( 80, fx.splice.offset || 10 ) + 6 );
	}
	if ( fx.dotShadow ) {
		r = Math.max( r, Math.min( 80, fx.dotShadow.offset || 14 ) + 2 );
	}
	if ( fx.reflection ) {
		r = Math.max(
			r,
			Math.ceil(
				( layer.h || 0 ) * 0.8 + Math.min( 60, fx.reflection.gap || 6 )
			)
		);
	}
	if ( fx.rings ) {
		const count = Math.max( 2, Math.min( 5, fx.rings.count || 2 ) );
		r = Math.max(
			r,
			Math.ceil( Math.min( 30, fx.rings.size || 6 ) * count ) + 2
		);
	}
	if ( fx.bevel || fx.letterpress ) {
		r = Math.max(
			r,
			Math.ceil(
				Math.min( 12, ( fx.bevel || fx.letterpress ).depth || 3 )
			) + 2
		);
	}
	if ( fx.jitter ) {
		r = Math.max(
			r,
			Math.ceil(
				( Math.min( 100, fx.jitter.amount || 50 ) / 100 ) *
					0.3 *
					maxTextSize( layer )
			) + 2
		);
	}
	if ( fx.chromatic ) {
		r = Math.max(
			r,
			Math.ceil( Math.min( 40, fx.chromatic.offset || 4 ) ) + 2
		);
	}
	if ( fx.glitch ) {
		r = Math.max(
			r,
			Math.ceil( Math.min( 60, fx.glitch.strength || 12 ) ) + 2
		);
	}
	if ( fx.dashedOutline ) {
		r = Math.max(
			r,
			Math.ceil( Math.min( 12, fx.dashedOutline.width || 2 ) ) + 4
		);
	}
	if ( fx.groundShadow ) {
		r = Math.max(
			r,
			Math.ceil(
				( ( layer.h || 0 ) *
					Math.min( 100, fx.groundShadow.squash ?? 45 ) ) /
					100 +
					Math.min( 20, fx.groundShadow.blur ?? 6 ) +
					( Math.abs( fx.groundShadow.shear ?? 25 ) / 100 ) *
						( layer.h || 0 )
			) + 2
		);
	}
	if ( fx.neonTube ) {
		r = Math.max(
			r,
			Math.ceil( Math.min( 60, fx.neonTube.glow ?? 16 ) * 1.4 ) + 2
		);
	}
	if ( fx.motionBlur ) {
		r = Math.max(
			r,
			Math.ceil( Math.min( 120, fx.motionBlur.length || 40 ) ) + 2
		);
	}
	if ( fx.paperCut ) {
		r = Math.max(
			r,
			Math.ceil( Math.min( 60, fx.paperCut.pad ?? 14 ) ) + 2
		);
	}
	if ( fx.sketch ) {
		r = Math.max(
			r,
			Math.ceil(
				Math.min( 10, fx.sketch.rough ?? 3 ) +
					Math.min( 6, fx.sketch.width || 2 )
			) + 8
		);
	}
	if ( fx.confetti ) {
		r = Math.max(
			r,
			Math.ceil( Math.min( 14, fx.confetti.size || 5 ) * 2 ) + 8
		);
	}
	if ( fx.drip ) {
		r = Math.max(
			r,
			Math.ceil( Math.min( 160, fx.drip.length || 50 ) ) + 4
		);
	}
	if ( fx.marker || fx.circleMark || fx.scribbleUnder || fx.strikeFx ) {
		// Full size: the box style circles above the cap height and the
		// swipe marker overshoots the line ends (v1.256.0). The double
		// loop swings up to ~1.3x the text size above the baseline.
		r = Math.max(
			r,
			Math.ceil( maxTextSize( layer ) * ( fx.circleMark ? 1.4 : 1 ) ) + 6
		);
	}
	if ( fx.highlight ) {
		r = Math.max(
			r,
			Math.ceil( Math.min( 40, fx.highlight.pad ?? 14 ) ) + 6
		);
	}
	if ( fx.underlineFx ) {
		r = Math.max(
			r,
			Math.ceil(
				( ( fx.underlineFx.offset ?? 8 ) / 100 +
					( fx.underlineFx.thickness ?? 8 ) / 100 ) *
					maxTextSize( layer ) +
					maxTextSize( layer ) * 0.2
			) + 4
		);
	}
	if ( fx.sticker ) {
		r = Math.max(
			r,
			Math.ceil( Math.min( 40, fx.sticker.size ?? 12 ) ) +
				Math.ceil( Math.min( 40, fx.sticker.size ?? 12 ) * 0.6 ) +
				8
		);
	}
	if ( fx.burst ) {
		r = Math.max(
			r,
			Math.ceil(
				Math.min( 120, fx.burst.gap ?? 40 ) +
					Math.min( 200, fx.burst.length ?? 60 )
			) + 4
		);
	}
	if ( fx.stackShadow ) {
		r = Math.max(
			r,
			Math.ceil(
				Math.min( 60, fx.stackShadow.offset ?? 12 ) *
					Math.max( 1, Math.min( 3, fx.stackShadow.count || 2 ) )
			) + 2
		);
	}
	if ( fx.softBlur ) {
		r = Math.max(
			r,
			Math.ceil( Math.min( 30, fx.softBlur.amount || 6 ) * 2 ) + 2
		);
	}
	if ( fx.offsetPrint ) {
		r = Math.max(
			r,
			Math.ceil( Math.min( 40, fx.offsetPrint.offset ?? 8 ) ) + 4
		);
	}
	if ( fx.threeD ) {
		r = Math.max(
			r,
			Math.ceil( Math.min( 60, fx.threeD.depth ?? 20 ) ) + 6
		);
	}
	if ( fx.skew && ( fx.skew.x || fx.skew.y ) ) {
		const tx = Math.abs( Math.tan( ( fx.skew.x || 0 ) * DEG ) );
		const ty = Math.abs( Math.tan( ( fx.skew.y || 0 ) * DEG ) );
		r = Math.max(
			r,
			Math.ceil( ( tx * ( layer.h || 0 ) + ty * ( layer.w || 0 ) ) / 2 )
		);
	}
	if ( fx.warp && TEXT_WARPS[ fx.warp.type ] ) {
		const bend = Math.min( 100, Math.abs( fx.warp.bend ?? 50 ) ) / 100;
		r = Math.max(
			r,
			Math.ceil(
				warpMaxDisp( fx.warp.type ) *
					bend *
					Math.max( layer.w || 0, layer.h || 0 )
			) + 2
		);
	}
	return Math.min( 600, r );
}

/**
 * Map source triangle → destination triangle via an affine transform, then
 *  draw the (clipped) image. The dest triangle is inflated a hair around its
 *  centroid so neighbouring cells overlap and no hairline seams show.
 */
export function drawTexTri( ctx, img, s0, s1, s2, d0, d1, d2 ) {
	const denom =
		( s1.x - s0.x ) * ( s2.y - s0.y ) - ( s2.x - s0.x ) * ( s1.y - s0.y );
	if ( Math.abs( denom ) < 1e-6 ) {
		return;
	}
	const a =
		( ( d1.x - d0.x ) * ( s2.y - s0.y ) -
			( d2.x - d0.x ) * ( s1.y - s0.y ) ) /
		denom;
	const b =
		( ( d1.y - d0.y ) * ( s2.y - s0.y ) -
			( d2.y - d0.y ) * ( s1.y - s0.y ) ) /
		denom;
	const c =
		( ( d2.x - d0.x ) * ( s1.x - s0.x ) -
			( d1.x - d0.x ) * ( s2.x - s0.x ) ) /
		denom;
	const d =
		( ( d2.y - d0.y ) * ( s1.x - s0.x ) -
			( d1.y - d0.y ) * ( s2.x - s0.x ) ) /
		denom;
	const e = d0.x - a * s0.x - c * s0.y;
	const f = d0.y - b * s0.x - d * s0.y;

	// Inflate the clip triangle slightly to hide inter-cell seams.
	const gx = ( d0.x + d1.x + d2.x ) / 3;
	const gy = ( d0.y + d1.y + d2.y ) / 3;
	const grow = ( p ) => {
		const vx = p.x - gx;
		const vy = p.y - gy;
		const len = Math.hypot( vx, vy ) || 1;
		return { x: p.x + ( vx / len ) * 0.6, y: p.y + ( vy / len ) * 0.6 };
	};
	const g0 = grow( d0 );
	const g1 = grow( d1 );
	const g2 = grow( d2 );

	ctx.save();
	ctx.beginPath();
	ctx.moveTo( g0.x, g0.y );
	ctx.lineTo( g1.x, g1.y );
	ctx.lineTo( g2.x, g2.y );
	ctx.closePath();
	ctx.clip();
	ctx.transform( a, b, c, d, e, f );
	ctx.drawImage( img, 0, 0 );
	ctx.restore();
}

/**
 * Render the (flat, already shadow-stamped) text to an offscreen buffer, then
 *  mesh-warp it onto ctx using the chosen preset. Supersampled to stay crisp
 *  when the canvas is zoomed in.
 */
export function warpText( ctx, layer, warpId, bend, env ) {
	const fn = TEXT_WARPS[ warpId ];
	const W = Math.max( 1, Math.round( layer.w || 1 ) );
	const H = Math.max( 1, Math.round( layer.h || 1 ) );
	let ss = 2;
	try {
		const m = ctx.getTransform();
		ss = Math.max(
			1,
			Math.min( 4, Math.round( Math.hypot( m.a, m.b ) ) || 1 )
		);
	} catch ( e ) {}
	// Pad the stamp buffer by the non-warp effect reach (shadows, glows …)
	// so those effects survive the mesh warp instead of clipping at the box.
	const p = Math.min(
		200,
		textFxReach( {
			...layer,
			textFX: { ...( layer.textFX || {} ), warp: null, skew: null },
		} )
	);
	const BW = W + 2 * p;
	const BH = H + 2 * p;
	const off = createCanvas( BW * ss, BH * ss );
	const octx = off.getContext( '2d' );
	octx.save();
	octx.scale( ss, ss );
	octx.translate( p, p );
	stampTextWithShadow( octx, layer, env );
	octx.restore();

	const cols = 44;
	const rows = 6;
	const clamp01 = ( n ) => Math.max( 0, Math.min( 1, n ) );
	const src = ( u, v ) => ( { x: u * BW * ss, y: v * BH * ss } );
	const dst = ( u, v ) => {
		// Evaluate the preset in text-box space (padding edge-extends it).
		const xd = u * BW - p;
		const yd = v * BH - p;
		const d = fn( clamp01( xd / W ), clamp01( yd / H ) );
		return {
			x: xd + d.dx * bend * W,
			y: yd + d.dy * bend * H,
		};
	};
	for ( let r = 0; r < rows; r++ ) {
		for ( let c = 0; c < cols; c++ ) {
			const u0 = c / cols;
			const u1 = ( c + 1 ) / cols;
			const v0 = r / rows;
			const v1 = ( r + 1 ) / rows;
			const s00 = src( u0, v0 );
			const s10 = src( u1, v0 );
			const s01 = src( u0, v1 );
			const s11 = src( u1, v1 );
			const d00 = dst( u0, v0 );
			const d10 = dst( u1, v0 );
			const d01 = dst( u0, v1 );
			const d11 = dst( u1, v1 );
			drawTexTri( ctx, off, s00, s10, s11, d00, d10, d11 );
			drawTexTri( ctx, off, s00, s11, s01, d00, d11, d01 );
		}
	}
}
