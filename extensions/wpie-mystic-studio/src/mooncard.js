/**
 * The moon disc as it stood on a date: bundled NASA photo (or procedural
 * fallback) with the computed terminator shadow. The disc painter is
 * shared with the Couple Chart's mini moons: photo slightly overscanned
 * so it truly fills the circle, the terminator blurred soft (canvas
 * filter, where the engine has one) and a gentle limb shade melting the
 * edge into the sky.
 */

import { paintBackground, paintStarDust, fillCentered } from './themes.js';

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
 * The soft glow behind a lit disc on dark themes. The art is a square
 * layer on the poster, so the glow must fade to nothing before the edge
 * of that square: `reach` is the room from the centre to the nearest
 * edge, and the falloff is eased so it ends without a visible rim.
 */
function moonGlow( ctx, cx, cy, r, illum, theme, reach ) {
	if ( ! theme.dark || illum <= 0.02 ) {
		return;
	}
	const outer = Math.min( r * 1.7, reach - 1 );
	if ( outer <= r ) {
		return;
	}
	const inner = r * 0.8;
	const peak = 0.16 * illum;
	const glow = ctx.createRadialGradient( cx, cy, inner, cx, cy, outer );
	glow.addColorStop( 0, 'rgba(240,235,215,' + peak + ')' );
	// From the rim outwards: (1 - u)^2, sampled so the curve stays smooth.
	const rim = ( r - inner ) / ( outer - inner );
	for ( let i = 0; i <= 6; i++ ) {
		const u = i / 6;
		const a = peak * 0.8 * ( 1 - u ) * ( 1 - u );
		glow.addColorStop(
			rim + ( 1 - rim ) * u,
			'rgba(240,235,215,' + a + ')'
		);
	}
	ctx.fillStyle = glow;
	ctx.beginPath();
	ctx.arc( cx, cy, outer, 0, TAU );
	ctx.fill();
}

/** Room from ( x, y ) to the nearest edge of a size x size square. */
function roomAt( x, y, size ) {
	return Math.min( x, y, size - x, size - y );
}

/** A whisper of a ring that holds a disc on light themes. */
function moonRing( ctx, cx, cy, r, size, theme, color ) {
	ctx.strokeStyle =
		color ||
		( theme.dark ? 'rgba(240,235,215,0.18)' : rgba( '#2f2b24', 0.25 ) );
	ctx.lineWidth = Math.max( 1, size * 0.0016 );
	ctx.beginPath();
	ctx.arc( cx, cy, r + size * 0.004, 0, TAU );
	ctx.stroke();
}

/**
 * Draw the moon card.
 *
 * @param {CanvasRenderingContext2D} ctx  Context.
 * @param {number} size  Canvas size (square).
 * @param {Object} phase From moonPhase(): { angle, illum, waxing, index }.
 * @param {Object} opts  { theme, southern, moonImg, transparent, layout:
 *   'single'|'cycle'|'week', week: [ { phase, day } x7 ] (week layout,
 *   the day itself in the middle), accent (stroke style for highlights),
 *   fontFamily }.
 */
export function drawMoonCard( ctx, size, phase, opts ) {
	const {
		theme,
		southern = false,
		moonImg = null,
		transparent = false,
		layout = 'single',
		week = null,
		fontFamily = 'Playfair Display',
	} = opts;
	const accent = opts.accent || theme.accent;
	if ( ! transparent ) {
		paintBackground( ctx, size, size, theme );
		paintStarDust( ctx, size, size, theme );
	}

	if ( 'cycle' === layout ) {
		const cx = size / 2;
		const cy = size / 2;
		const r = size * 0.2;
		moonGlow( ctx, cx, cy, r, phase.illum, theme, roomAt( cx, cy, size ) );
		drawMoonDisc( ctx, cx, cy, r, phase, { theme, southern, moonImg } );
		moonRing( ctx, cx, cy, r, size, theme );
		// The orbit of the eight phases: new at the top, full below.
		const R = size * 0.38;
		ctx.strokeStyle = theme.faint;
		ctx.lineWidth = Math.max( 1, size * 0.0014 );
		ctx.beginPath();
		ctx.arc( cx, cy, R, 0, TAU );
		ctx.stroke();
		for ( let k = 0; k < 8; k++ ) {
			const a = -Math.PI / 2 + ( k / 8 ) * TAU;
			const x = cx + Math.cos( a ) * R;
			const y = cy + Math.sin( a ) * R;
			const small = size * 0.05;
			const angle = k * 45 || 0.5;
			drawMoonDisc(
				ctx,
				x,
				y,
				small,
				{
					angle,
					waxing: angle < 180,
					illum: ( 1 - Math.cos( ( angle * Math.PI ) / 180 ) ) / 2,
				},
				{ theme, southern, moonImg }
			);
			if ( k === phase.index ) {
				ctx.strokeStyle = accent;
				ctx.lineWidth = Math.max( 1.4, size * 0.0035 );
				ctx.beginPath();
				ctx.arc( x, y, small * 1.32, 0, TAU );
				ctx.stroke();
			} else {
				moonRing( ctx, x, y, small, size, theme );
			}
		}
		return;
	}

	if ( 'week' === layout && Array.isArray( week ) && week.length ) {
		const n = week.length;
		const mid = Math.floor( n / 2 );
		const big = size * 0.12;
		const small = size * 0.044;
		const gap = size * 0.032;
		// Centre moon, then equal steps outwards; the outermost disc and
		// its ring keep a margin inside the square, never cut by its edge.
		const reach = size * 0.47 - small - size * 0.006;
		const first = big + small + gap;
		const step =
			mid > 1
				? Math.min( size * 0.128, ( reach - first ) / ( mid - 1 ) )
				: 0;
		const xs = [];
		for ( let i = 0; i < n; i++ ) {
			const k = i - mid;
			const off =
				0 === k
					? 0
					: Math.sign( k ) * ( first + ( Math.abs( k ) - 1 ) * step );
			xs.push( size / 2 + off );
		}
		week.forEach( ( entry, i ) => {
			const k = i - mid;
			const off = ( xs[ i ] - size / 2 ) / size;
			const x = xs[ i ];
			const y = size * 0.45 + off * off * size * 0.95;
			const r = 0 === k ? big : small;
			if ( 0 === k ) {
				moonGlow(
					ctx,
					x,
					y,
					r,
					entry.phase.illum,
					theme,
					roomAt( x, y, size )
				);
			}
			drawMoonDisc( ctx, x, y, r, entry.phase, {
				theme,
				southern,
				moonImg,
			} );
			moonRing( ctx, x, y, r, size, theme, 0 === k ? accent : null );
			ctx.fillStyle = 0 === k ? theme.ink : theme.dim;
			ctx.textAlign = 'center';
			ctx.font = `${ 0 === k ? 600 : 500 } ${ Math.round(
				size * ( 0 === k ? 0.036 : 0.026 )
			) }px '${ fontFamily }', Georgia, serif`;
			fillCentered( ctx, String( entry.day ), x, y + r + size * 0.045 );
		} );
		return;
	}

	const cx = size / 2;
	const cy = size / 2;
	const r = size * 0.36;
	moonGlow( ctx, cx, cy, r, phase.illum, theme, roomAt( cx, cy, size ) );
	drawMoonDisc( ctx, cx, cy, r, phase, { theme, southern, moonImg } );
	moonRing( ctx, cx, cy, r, size, theme );
}
