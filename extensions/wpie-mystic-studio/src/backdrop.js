/**
 * Poster backdrops: the whole sheet behind the art, painted at the size
 * of the document. Six styles over the theme colors, and a star field
 * whose density the user sets. Stars follow a magnitude law (many faint,
 * a few bright), the brightest carry a soft glint, and dark themes tint
 * them slightly warm or cool like a real sky.
 */

import { rgba, mix, seeded } from './themes.js';

export const BACKDROPS = [
	'sky',
	'nebula',
	'aurora',
	'dusk',
	'paper',
	'plain',
];

const TAU = Math.PI * 2;

/** The base gradient every style starts from. */
function base( ctx, w, h, theme, style ) {
	const [ b0, b1 ] = theme.bg;
	if ( 'plain' === style ) {
		ctx.fillStyle = b0;
		ctx.fillRect( 0, 0, w, h );
		return;
	}
	if ( 'dusk' === style ) {
		const g = ctx.createLinearGradient( 0, 0, 0, h );
		g.addColorStop( 0, theme.dark ? b0 : b1 );
		g.addColorStop( 0.62, theme.dark ? b1 : b0 );
		g.addColorStop( 1, mix( theme.dark ? b1 : b0, theme.accent, 0.28 ) );
		ctx.fillStyle = g;
		ctx.fillRect( 0, 0, w, h );
		// The horizon glow sits low and wide.
		const glow = ctx.createRadialGradient(
			w / 2,
			h * 1.02,
			0,
			w / 2,
			h * 1.02,
			Math.max( w, h ) * 0.7
		);
		glow.addColorStop( 0, rgba( theme.accent, theme.dark ? 0.32 : 0.22 ) );
		glow.addColorStop( 1, rgba( theme.accent, 0 ) );
		ctx.fillStyle = glow;
		ctx.fillRect( 0, 0, w, h );
		return;
	}
	if ( theme.dark ) {
		const g = ctx.createRadialGradient(
			w / 2,
			h * 0.4,
			0,
			w / 2,
			h / 2,
			Math.hypot( w, h ) * 0.62
		);
		g.addColorStop( 0, b1 );
		g.addColorStop( 1, b0 );
		ctx.fillStyle = g;
	} else {
		const g = ctx.createLinearGradient( 0, 0, 0, h );
		g.addColorStop( 0, b0 );
		g.addColorStop( 1, b1 );
		ctx.fillStyle = g;
	}
	ctx.fillRect( 0, 0, w, h );
}

/** Soft colored clouds: many overlapping radial blobs. */
function nebula( ctx, w, h, theme, rnd ) {
	const u = Math.max( w, h );
	ctx.save();
	ctx.globalCompositeOperation = theme.dark ? 'lighter' : 'multiply';
	const tints = [ theme.mist[ 0 ], theme.mist[ 1 ], theme.accent ];
	// A drifting band across the sheet carries most of the cloud.
	const angle = -0.5 + rnd() * 1;
	for ( let i = 0; i < 26; i++ ) {
		const t = rnd();
		const x = w / 2 + ( t - 0.5 ) * u * Math.cos( angle ) * 1.2;
		const y =
			h / 2 +
			( t - 0.5 ) * u * Math.sin( angle ) * 1.2 +
			( rnd() - 0.5 ) * u * 0.35;
		const r = u * ( 0.12 + rnd() * 0.3 );
		const c = tints[ i % 3 === 2 && rnd() < 0.5 ? 2 : i % 2 ];
		const a = theme.dark ? 0.05 + rnd() * 0.08 : 0.06 + rnd() * 0.08;
		const g = ctx.createRadialGradient( x, y, 0, x, y, r );
		g.addColorStop( 0, rgba( c, a ) );
		g.addColorStop( 0.55, rgba( c, a * 0.45 ) );
		g.addColorStop( 1, rgba( c, 0 ) );
		ctx.fillStyle = g;
		ctx.beginPath();
		ctx.arc( x, y, r, 0, TAU );
		ctx.fill();
	}
	ctx.restore();
}

/** Curtains of light: layered sine bands fading downwards. */
function aurora( ctx, w, h, theme, rnd ) {
	ctx.save();
	ctx.globalCompositeOperation = theme.dark ? 'lighter' : 'multiply';
	const bands = 4;
	for ( let b = 0; b < bands; b++ ) {
		const c = theme.mist[ b % 2 ];
		const y0 = h * ( 0.14 + b * 0.09 + rnd() * 0.05 );
		const amp = h * ( 0.04 + rnd() * 0.05 );
		const freq = 1.2 + rnd() * 1.6;
		const phase = rnd() * TAU;
		const depth = h * ( 0.22 + rnd() * 0.18 );
		const steps = 64;
		ctx.beginPath();
		for ( let i = 0; i <= steps; i++ ) {
			const x = ( i / steps ) * w;
			const y =
				y0 +
				Math.sin( ( i / steps ) * TAU * freq + phase ) * amp +
				Math.sin( ( i / steps ) * TAU * freq * 2.7 + phase ) *
					amp *
					0.25;
			if ( 0 === i ) {
				ctx.moveTo( x, y );
			} else {
				ctx.lineTo( x, y );
			}
		}
		ctx.lineTo( w, y0 + depth );
		ctx.lineTo( 0, y0 + depth );
		ctx.closePath();
		const g = ctx.createLinearGradient( 0, y0 - amp, 0, y0 + depth );
		const a = theme.dark ? 0.2 : 0.14;
		g.addColorStop( 0, rgba( c, 0 ) );
		g.addColorStop( 0.12, rgba( c, a ) );
		g.addColorStop( 1, rgba( c, 0 ) );
		ctx.fillStyle = g;
		ctx.fill();
	}
	ctx.restore();
}

/** Paper fibre: fine flecks and a few long hairs, plus a soft vignette. */
function paper( ctx, w, h, theme, rnd ) {
	const n = Math.round( ( w * h ) / 260 );
	const dark = theme.dark;
	ctx.save();
	for ( let i = 0; i < n; i++ ) {
		const x = rnd() * w;
		const y = rnd() * h;
		const light = rnd() < 0.5;
		ctx.fillStyle = light
			? `rgba(255,255,255,${ dark ? 0.03 : 0.22 })`
			: `rgba(0,0,0,${ dark ? 0.12 : 0.05 })`;
		ctx.fillRect( x, y, 1 + rnd() * 1.2, 1 + rnd() * 1.2 );
	}
	const hairs = Math.round( ( w * h ) / 24000 );
	ctx.lineWidth = Math.max( 0.6, Math.min( w, h ) * 0.0006 );
	for ( let i = 0; i < hairs; i++ ) {
		const x = rnd() * w;
		const y = rnd() * h;
		const len = Math.min( w, h ) * ( 0.006 + rnd() * 0.014 );
		const a = rnd() * TAU;
		ctx.strokeStyle = dark
			? 'rgba(255,255,255,0.05)'
			: 'rgba(80,60,30,0.07)';
		ctx.beginPath();
		ctx.moveTo( x, y );
		ctx.quadraticCurveTo(
			x + Math.cos( a + 0.6 ) * len * 0.5,
			y + Math.sin( a + 0.6 ) * len * 0.5,
			x + Math.cos( a ) * len,
			y + Math.sin( a ) * len
		);
		ctx.stroke();
	}
	ctx.restore();
}

/** The edge falls off gently, drawing the eye to the centre. */
function vignette( ctx, w, h, theme, strength ) {
	const g = ctx.createRadialGradient(
		w / 2,
		h / 2,
		Math.min( w, h ) * 0.35,
		w / 2,
		h / 2,
		Math.hypot( w, h ) * 0.58
	);
	const edge = theme.dark ? '#000000' : mix( theme.bg[ 1 ], theme.ink, 0.35 );
	g.addColorStop( 0, rgba( edge, 0 ) );
	g.addColorStop( 1, rgba( edge, strength ) );
	ctx.fillStyle = g;
	ctx.fillRect( 0, 0, w, h );
}

/**
 * Stars by magnitude: count scales with the sheet area and the density
 * setting; the faint majority are dots, the bright few carry a glint.
 */
export function paintStars( ctx, w, h, theme, density, rnd ) {
	if ( density <= 0 ) {
		return;
	}
	const u = Math.min( w, h );
	const count = Math.round( ( ( w * h ) / 1e6 ) * 9 * density );
	const px = u / 1000; // one "reference pixel" at 1000 px sheets
	const warm = mix( theme.star, '#ffd9a0', 0.35 );
	const cool = mix( theme.star, '#a8c8ff', 0.35 );
	ctx.save();
	for ( let i = 0; i < count; i++ ) {
		const x = rnd() * w;
		const y = rnd() * h;
		// Magnitude law: most stars are faint.
		const m = rnd() ** 3.2;
		const r = Math.max( 0.35, ( 0.45 + m * 2.1 ) * px );
		const tint = theme.dark
			? rnd() < 0.2
				? warm
				: rnd() < 0.3
				? cool
				: theme.star
			: theme.ink;
		ctx.globalAlpha = theme.dark ? 0.25 + m * 0.75 : 0.18 + m * 0.4;
		ctx.fillStyle = tint;
		ctx.beginPath();
		ctx.arc( x, y, r, 0, TAU );
		ctx.fill();
		if ( m > 0.62 && theme.dark ) {
			// Glint: a soft halo and a thin cross.
			const halo = ctx.createRadialGradient( x, y, 0, x, y, r * 6 );
			halo.addColorStop( 0, rgba( tint, 0.35 ) );
			halo.addColorStop( 1, rgba( tint, 0 ) );
			ctx.fillStyle = halo;
			ctx.beginPath();
			ctx.arc( x, y, r * 6, 0, TAU );
			ctx.fill();
			ctx.strokeStyle = rgba( tint, 0.55 );
			ctx.lineWidth = Math.max( 0.5, r * 0.28 );
			const len = r * ( 5 + m * 6 );
			ctx.beginPath();
			ctx.moveTo( x - len, y );
			ctx.lineTo( x + len, y );
			ctx.moveTo( x, y - len );
			ctx.lineTo( x, y + len );
			ctx.stroke();
		}
	}
	ctx.restore();
}

/**
 * Paint a full backdrop.
 *
 * @param {CanvasRenderingContext2D} ctx   Context.
 * @param {number} w     Width.
 * @param {number} h     Height.
 * @param {Object} theme Resolved theme.
 * @param {Object} opts  { style, stars (0..100), seed }.
 */
export function paintBackdrop( ctx, w, h, theme, opts = {} ) {
	const style = BACKDROPS.includes( opts.style ) ? opts.style : 'sky';
	const stars = Math.max( 0, Math.min( 100, opts.stars ?? 50 ) );
	const rnd = seeded( ( opts.seed || 11 ) * 7919 + 13 );
	base( ctx, w, h, theme, style );
	if ( 'nebula' === style ) {
		nebula( ctx, w, h, theme, rnd );
	} else if ( 'aurora' === style ) {
		aurora( ctx, w, h, theme, rnd );
	} else if ( 'paper' === style ) {
		paper( ctx, w, h, theme, rnd );
	}
	// Paper keeps its stars sparse and inky; plain has none unless asked.
	const density =
		'paper' === style
			? stars * 0.35
			: 'plain' === style
			? stars * 0.5
			: stars;
	paintStars( ctx, w, h, theme, density, rnd );
	if ( 'plain' !== style ) {
		vignette( ctx, w, h, theme, theme.dark ? 0.38 : 0.12 );
	}
}
