/**
 * The couple cards: two people side by side. Couple Chart shows each
 * person's zodiac constellation, sign glyph and the moon of their birth
 * night, joined by an ampersand and the element pairing. Couple Numbers
 * lets both life-path cascades descend into one shared number.
 */

import { drawGlyph, SIGN_KEYS } from './glyphs.js';
import {
	paintBackground,
	paintStarDust,
	foilStyle,
	fillCentered,
} from './themes.js';
import { projectConstellation, SIGN_CODES } from './zodiaccard.js';
import { drawMoonDisc } from './mooncard.js';

const TAU = Math.PI * 2;

const fontStack = ( family ) =>
	`'${ family }', 'Playfair Display', Georgia, serif`;

/** One person's half: constellation, glyph, mini moon. */
function drawHalf( ctx, size, cx, side, theme, foil, opts ) {
	const { sign, phase, moonImg, southern } = side;

	// Constellation, small and quiet.
	const proj = projectConstellation(
		SIGN_CODES[ sign ],
		size * 0.3,
		size * 0.26
	);
	if ( proj ) {
		ctx.save();
		ctx.translate( cx, size * 0.3 );
		ctx.strokeStyle = foil;
		ctx.lineWidth = Math.max( 1, size * 0.0016 );
		ctx.lineJoin = 'round';
		for ( const seg of proj.lines ) {
			ctx.beginPath();
			seg.forEach( ( p, i ) =>
				i ? ctx.lineTo( p.x, p.y ) : ctx.moveTo( p.x, p.y )
			);
			ctx.stroke();
		}
		ctx.fillStyle = theme.star;
		for ( const s of proj.stars ) {
			ctx.beginPath();
			ctx.arc(
				s.x,
				s.y,
				Math.max( 0.5, ( 5.8 - s.mag ) * 0.35 ) * ( size / 1000 ) * 2,
				0,
				TAU
			);
			ctx.fill();
		}
		ctx.restore();
	}

	// Sign glyph beneath the figure.
	drawGlyph( ctx, SIGN_KEYS[ sign ], cx, size * 0.52, size * 0.07, foil );

	// The moon of the birth night, small - the shared soft painter.
	const mr = size * 0.085;
	const my = size * 0.68;
	drawMoonDisc( ctx, cx, my, mr, phase, { theme, southern, moonImg } );
	ctx.strokeStyle = theme.faint;
	ctx.lineWidth = Math.max( 1, size * 0.0016 );
	ctx.beginPath();
	ctx.arc( cx, my, mr + size * 0.004, 0, TAU );
	ctx.stroke();
	if ( opts && opts.ring ) {
		ctx.strokeStyle = theme.faint;
		ctx.beginPath();
		ctx.arc( cx, size * 0.42, size * 0.24, 0, TAU );
		ctx.stroke();
	}
}

/**
 * Couple Chart.
 *
 * @param {CanvasRenderingContext2D} ctx  Context.
 * @param {number} size Canvas size (square).
 * @param {Object} data { a: {sign, phase}, b: {sign, phase} }.
 * @param {Object} opts { theme, fontFamily, moonImg, southern,
 *   elementsText, transparent }.
 */
export function drawCoupleCard( ctx, size, data, opts ) {
	const {
		theme,
		fontFamily = 'Playfair Display',
		moonImg = null,
		southern = false,
		elementsText = '',
		transparent = false,
	} = opts;
	const foil = foilStyle( ctx, size, size, theme );
	if ( ! transparent ) {
		paintBackground( ctx, size, size, theme );
		paintStarDust( ctx, size, size, theme );
	}

	drawHalf(
		ctx,
		size,
		size * 0.27,
		{ ...data.a, moonImg, southern },
		theme,
		foil
	);
	drawHalf(
		ctx,
		size,
		size * 0.73,
		{ ...data.b, moonImg, southern },
		theme,
		foil
	);

	// The joining ampersand.
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = foil;
	ctx.font = `500 ${ Math.round( size * 0.11 ) }px ${ fontStack(
		fontFamily
	) }`;
	ctx.fillText( '&', size / 2, size * 0.46 );

	// A fine vertical divider above and below the ampersand.
	ctx.strokeStyle = theme.faint;
	ctx.lineWidth = Math.max( 1, size * 0.0014 );
	ctx.beginPath();
	ctx.moveTo( size / 2, size * 0.16 );
	ctx.lineTo( size / 2, size * 0.36 );
	ctx.moveTo( size / 2, size * 0.56 );
	ctx.lineTo( size / 2, size * 0.78 );
	ctx.stroke();

	// Element pairing line, baked small at the bottom of the art.
	if ( elementsText ) {
		ctx.fillStyle = theme.accent;
		ctx.font = `600 ${ Math.round( size * 0.024 ) }px ${ fontStack(
			fontFamily
		) }`;
		const prev = ctx.letterSpacing;
		try {
			ctx.letterSpacing = '0.25em';
		} catch ( e ) {}
		ctx.fillText( elementsText.toUpperCase(), size / 2, size * 0.88 );
		try {
			ctx.letterSpacing = prev || '0px';
		} catch ( e ) {}
	}
}

/**
 * Couple Numbers: two cascades meet in one shared ringed number.
 *
 * @param {CanvasRenderingContext2D} ctx  Context.
 * @param {number} size Canvas size (square).
 * @param {Object} cn   From coupleNumber(): { value, a, b }.
 * @param {Object} opts { theme, fontFamily, leftText, rightText,
 *   transparent }.
 */
export function drawCoupleNumbersCard( ctx, size, cn, opts ) {
	const {
		theme,
		fontFamily = 'Playfair Display',
		leftText = '',
		rightText = '',
		transparent = false,
	} = opts;
	const foil = foilStyle( ctx, size, size, theme );
	if ( ! transparent ) {
		paintBackground( ctx, size, size, theme );
		paintStarDust( ctx, size, size, theme );
	}
	const cx = size / 2;
	const cy = size * 0.58;
	const r = size * 0.24;

	// The two source numbers up in the corners.
	const srcY = size * 0.18;
	const srcs = [
		{ x: size * 0.24, v: cn.a.value, text: leftText },
		{ x: size * 0.76, v: cn.b.value, text: rightText },
	];
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	for ( const s of srcs ) {
		ctx.strokeStyle = theme.faint;
		ctx.lineWidth = Math.max( 1.2, size * 0.002 );
		ctx.beginPath();
		ctx.arc( s.x, srcY, size * 0.09, 0, TAU );
		ctx.stroke();
		ctx.fillStyle = theme.ink;
		ctx.font = `600 ${ Math.round( size * 0.085 ) }px ${ fontStack(
			fontFamily
		) }`;
		fillCentered( ctx, s.v, s.x, srcY );
		if ( s.text ) {
			ctx.fillStyle = theme.dim;
			ctx.font = `500 ${ Math.round( size * 0.022 ) }px ${ fontStack(
				fontFamily
			) }`;
			ctx.fillText( s.text, s.x, srcY - size * 0.135 );
		}
	}

	// The two paths swing down and meet at the ring.
	ctx.strokeStyle = foil;
	ctx.lineWidth = Math.max( 1.4, size * 0.0024 );
	ctx.beginPath();
	ctx.moveTo( srcs[ 0 ].x, srcY + size * 0.09 );
	ctx.quadraticCurveTo( size * 0.22, cy - r * 0.4, cx - r, cy );
	ctx.moveTo( srcs[ 1 ].x, srcY + size * 0.09 );
	ctx.quadraticCurveTo( size * 0.78, cy - r * 0.4, cx + r, cy );
	ctx.stroke();

	// The shared number in its ring.
	ctx.strokeStyle = foil;
	ctx.lineWidth = Math.max( 1.6, size * 0.0035 );
	ctx.beginPath();
	ctx.arc( cx, cy, r, 0, TAU );
	ctx.stroke();
	ctx.lineWidth = Math.max( 1, size * 0.0016 );
	ctx.beginPath();
	ctx.arc( cx, cy, r * 0.93, 0, TAU );
	ctx.stroke();
	ctx.fillStyle = foil;
	ctx.font = `600 ${ Math.round( size * 0.24 ) }px ${ fontStack(
		fontFamily
	) }`;
	fillCentered( ctx, cn.value, cx, cy );
}
