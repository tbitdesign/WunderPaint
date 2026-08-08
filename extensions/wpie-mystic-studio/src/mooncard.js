/**
 * The moon disc as it stood on a date: bundled NASA photo (or procedural
 * fallback) with the computed terminator shadow. The disc painter is
 * shared with the Couple Chart's mini moons: photo slightly overscanned
 * so it truly fills the circle, the terminator blurred soft (canvas
 * filter, where the engine has one) and a gentle limb shade melting the
 * edge into the sky.
 */

import { paintBackground, paintStarDust } from './themes.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/** #rrggbb -> rgba() with alpha. */
function rgba( hex, alpha ) {
	const v = /^#?([0-9a-f]{6})$/i.exec( String( hex ) );
	if ( ! v ) {
		return `rgba(20,20,28,${ alpha })`;
	}
	const n = parseInt( v[ 1 ], 16 );
	return `rgba(${ ( n >> 16 ) & 255 },${ ( n >> 8 ) & 255 },${
		n & 255
	},${ alpha })`;
}

/** Procedural moon face when the photo has not loaded (or in tests). */
function proceduralMoon( ctx, cx, cy, r ) {
	const g = ctx.createRadialGradient(
		cx - r * 0.3,
		cy - r * 0.3,
		r * 0.1,
		cx,
		cy,
		r
	);
	g.addColorStop( 0, '#d8d4c8' );
	g.addColorStop( 1, '#9d9a90' );
	ctx.fillStyle = g;
	ctx.beginPath();
	ctx.arc( cx, cy, r, 0, TAU );
	ctx.fill();
	let s = 42;
	const rnd = () => {
		s = ( s * 16807 ) % 2147483647;
		return s / 2147483647;
	};
	ctx.fillStyle = 'rgba(110,108,100,0.35)';
	for ( let i = 0; i < 14; i++ ) {
		const a = rnd() * TAU;
		const d = rnd() * r * 0.7;
		ctx.beginPath();
		ctx.arc(
			cx + Math.cos( a ) * d,
			cy + Math.sin( a ) * d,
			r * ( 0.06 + rnd() * 0.16 ),
			0,
			TAU
		);
		ctx.fill();
	}
}

/**
 * One finished moon disc with its phase shadow, any size.
 *
 * @param {CanvasRenderingContext2D} ctx  Context.
 * @param {number} cx Centre x.
 * @param {number} cy Centre y.
 * @param {number} r  Disc radius.
 * @param {Object} phase From moonPhase(): { angle, waxing }.
 * @param {Object} opts  { theme, southern, moonImg }.
 */
export function drawMoonDisc( ctx, cx, cy, r, phase, opts ) {
	const { theme, southern = false, moonImg = null } = opts;
	const shade = theme.dark ? theme.bg[ 0 ] : '#2f2b24';

	ctx.save();
	ctx.beginPath();
	ctx.arc( cx, cy, r, 0, TAU );
	ctx.clip();

	/* The face, overscanned so the photo's rim never shows. */
	if ( moonImg ) {
		const over = r * 1.06;
		ctx.drawImage( moonImg, cx - over, cy - over, over * 2, over * 2 );
	} else {
		proceduralMoon( ctx, cx, cy, r );
	}

	/* Soft limb: the disc melts into the sky, no hard cut. */
	const limb = ctx.createRadialGradient( cx, cy, r * 0.72, cx, cy, r );
	limb.addColorStop( 0, rgba( shade, 0 ) );
	limb.addColorStop( 0.82, rgba( shade, 0.08 ) );
	limb.addColorStop( 1, rgba( shade, 0.55 ) );
	ctx.fillStyle = limb;
	ctx.beginPath();
	ctx.arc( cx, cy, r, 0, TAU );
	ctx.fill();

	/* Terminator shadow, baked on an offscreen pad and laid down through
	 * a blur so the edge stays gentle. The path is drawn on the LEFT;
	 * side = -1 mirrors it (waning in the northern view, flipped south). */
	let side = phase.waxing ? 1 : -1;
	if ( southern ) {
		side = -side;
	}
	const a = r * Math.cos( phase.angle * DEG );
	const pad = Math.ceil( r * 0.12 ) + 2;
	const S = Math.ceil( r * 2 + pad * 2 );
	const off = document.createElement( 'canvas' );
	off.width = S;
	off.height = S;
	const octx = off.getContext( '2d' );
	octx.translate( S / 2, S / 2 );
	octx.scale( side, 1 );
	octx.beginPath();
	octx.arc( 0, 0, r + pad, -Math.PI / 2, Math.PI / 2, true );
	octx.ellipse(
		0,
		0,
		Math.max( 0.001, Math.abs( a ) ),
		r + pad,
		0,
		Math.PI / 2,
		-Math.PI / 2,
		a > 0
	);
	octx.closePath();
	octx.fillStyle = shade;
	octx.fill();

	const canBlur = 'filter' in ctx;
	if ( canBlur ) {
		ctx.filter = `blur(${ Math.max( 1, r * 0.045 ) }px)`;
	}
	ctx.globalAlpha = 0.92;
	ctx.drawImage( off, cx - S / 2, cy - S / 2 );
	ctx.globalAlpha = 1;
	if ( canBlur ) {
		ctx.filter = 'none';
	}
	ctx.restore();
}

/**
 * Draw the moon card.
 *
 * @param {CanvasRenderingContext2D} ctx  Context.
 * @param {number} size  Canvas size (square).
 * @param {Object} phase From moonPhase(): { angle, illum, waxing }.
 * @param {Object} opts  { theme, southern, moonImg, transparent }.
 */
export function drawMoonCard( ctx, size, phase, opts ) {
	const {
		theme,
		southern = false,
		moonImg = null,
		transparent = false,
	} = opts;
	const cx = size / 2;
	const cy = size * 0.46;
	const r = size * 0.31;

	if ( ! transparent ) {
		paintBackground( ctx, size, size, theme );
		paintStarDust( ctx, size, size, theme );
	}

	/* Glow. */
	if ( theme.dark && phase.illum > 0.02 ) {
		const glow = ctx.createRadialGradient(
			cx,
			cy,
			r * 0.8,
			cx,
			cy,
			r * 1.7
		);
		glow.addColorStop( 0, 'rgba(240,235,215,' + 0.16 * phase.illum + ')' );
		glow.addColorStop( 1, 'rgba(240,235,215,0)' );
		ctx.fillStyle = glow;
		ctx.beginPath();
		ctx.arc( cx, cy, r * 1.7, 0, TAU );
		ctx.fill();
	}

	drawMoonDisc( ctx, cx, cy, r, phase, { theme, southern, moonImg } );

	/* A whisper of a ring holds the disc on light themes. */
	ctx.strokeStyle = theme.dark
		? 'rgba(240,235,215,0.18)'
		: rgba( '#2f2b24', 0.25 );
	ctx.lineWidth = Math.max( 1, size * 0.0016 );
	ctx.beginPath();
	ctx.arc( cx, cy, r + size * 0.004, 0, TAU );
	ctx.stroke();
}
