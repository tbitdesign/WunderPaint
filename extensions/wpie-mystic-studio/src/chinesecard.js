/**
 * The Chinese zodiac poster: the birth animal's character staged large
 * in an ornament ring, the full twelve-animal ring around it with the
 * own animal highlighted, a small taijitu carrying the yang/yin
 * polarity and the element character. CJK glyphs come from the system
 * font stack - every platform ships one.
 */

import {
	paintBackground,
	paintStarDust,
	foilStyle,
	fillCentered,
} from './themes.js';
import { HANZI, ELEMENT_HANZI } from './chinese.js';

const TAU = Math.PI * 2;

const CJK =
	"'Noto Serif SC', 'Songti SC', 'SimSun', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', serif";

function star4( ctx, x, y, s ) {
	ctx.beginPath();
	ctx.moveTo( x, y - s );
	ctx.quadraticCurveTo( x, y, x + s, y );
	ctx.quadraticCurveTo( x, y, x, y + s );
	ctx.quadraticCurveTo( x, y, x - s, y );
	ctx.quadraticCurveTo( x, y, x, y - s );
	ctx.fill();
}

/** The taijitu, drawn, not typed. */
function taijitu( ctx, cx, cy, r, dark, light ) {
	ctx.save();
	ctx.beginPath();
	ctx.arc( cx, cy, r, 0, TAU );
	ctx.clip();
	ctx.fillStyle = light;
	ctx.fillRect( cx - r, cy - r, r * 2, r * 2 );
	ctx.fillStyle = dark;
	ctx.beginPath();
	ctx.arc( cx, cy, r, -Math.PI / 2, Math.PI / 2 );
	ctx.arc( cx, cy + r / 2, r / 2, Math.PI / 2, -Math.PI / 2, true );
	ctx.arc( cx, cy - r / 2, r / 2, Math.PI / 2, -Math.PI / 2 );
	ctx.fill();
	ctx.fillStyle = light;
	ctx.beginPath();
	ctx.arc( cx, cy - r / 2, r * 0.16, 0, TAU );
	ctx.fill();
	ctx.fillStyle = dark;
	ctx.beginPath();
	ctx.arc( cx, cy + r / 2, r * 0.16, 0, TAU );
	ctx.fill();
	ctx.restore();
	ctx.strokeStyle = dark;
	ctx.lineWidth = Math.max( 1, r * 0.06 );
	ctx.beginPath();
	ctx.arc( cx, cy, r, 0, TAU );
	ctx.stroke();
}

/**
 * Draw the poster art.
 *
 * @param {CanvasRenderingContext2D} ctx  Context.
 * @param {number} size Canvas size (square).
 * @param {Object} sign From chineseSign(): { animal, element, yang }.
 * @param {Object} opts { theme, transparent }.
 */
export function drawChineseCard( ctx, size, sign, opts ) {
	const { theme, transparent = false } = opts;
	const foil = foilStyle( ctx, size, size, theme );
	if ( ! transparent ) {
		paintBackground( ctx, size, size, theme );
		paintStarDust( ctx, size, size, theme );
	}
	const cx = size / 2;
	const cy = size * 0.47;
	const R = size * 0.36; // the twelve-animal ring
	const Rin = size * 0.26; // the inner emblem ring

	/* Rings. */
	ctx.strokeStyle = foil;
	ctx.lineWidth = Math.max( 1.6, size * 0.0035 );
	ctx.beginPath();
	ctx.arc( cx, cy, R + size * 0.05, 0, TAU );
	ctx.stroke();
	ctx.lineWidth = Math.max( 1, size * 0.0016 );
	for ( const r of [ R - size * 0.045, Rin ] ) {
		ctx.beginPath();
		ctx.arc( cx, cy, r, 0, TAU );
		ctx.stroke();
	}

	/* The twelve animals around the ring, the own one lifted. The ring
	 * starts half a slot past twelve o'clock so the element medallion
	 * (top) and the taijitu (bottom) sit in the gaps. */
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	for ( let i = 0; i < 12; i++ ) {
		const a = -Math.PI / 2 + ( ( i + 0.5 ) / 12 ) * TAU;
		const x = cx + Math.cos( a ) * R;
		const y = cy + Math.sin( a ) * R;
		const own = i === sign.animal;
		ctx.fillStyle = own ? theme.accent : theme.dim;
		ctx.font = `${ own ? 600 : 400 } ${ Math.round(
			size * ( own ? 0.052 : 0.038 )
		) }px ${ CJK }`;
		fillCentered( ctx, HANZI[ i ], x, y );
		if ( own ) {
			ctx.strokeStyle = theme.accent;
			ctx.lineWidth = Math.max( 1, size * 0.002 );
			ctx.beginPath();
			ctx.arc( x, y, size * 0.045, 0, TAU );
			ctx.stroke();
		}
	}

	/* The big character. */
	ctx.fillStyle = foil;
	ctx.font = `600 ${ Math.round( size * 0.3 ) }px ${ CJK }`;
	fillCentered( ctx, HANZI[ sign.animal ], cx, cy );

	/* Element character in a small medallion at the top. */
	const ey = cy - R - size * 0.05;
	ctx.fillStyle = theme.dark ? theme.bg[ 0 ] : theme.bg[ 1 ];
	ctx.beginPath();
	ctx.arc( cx, ey, size * 0.048, 0, TAU );
	ctx.fill();
	ctx.strokeStyle = foil;
	ctx.lineWidth = Math.max( 1.2, size * 0.0024 );
	ctx.beginPath();
	ctx.arc( cx, ey, size * 0.048, 0, TAU );
	ctx.stroke();
	ctx.fillStyle = theme.accent;
	ctx.font = `600 ${ Math.round( size * 0.05 ) }px ${ CJK }`;
	fillCentered( ctx, ELEMENT_HANZI[ sign.element ], cx, ey );

	/* Taijitu at the bottom, tilted to the polarity. */
	const ty = cy + R + size * 0.055;
	ctx.save();
	ctx.translate( cx, ty );
	ctx.rotate( sign.yang ? 0 : Math.PI );
	taijitu(
		ctx,
		0,
		0,
		size * 0.042,
		theme.dark ? theme.ink : '#2a2622',
		theme.dark ? theme.bg[ 0 ] : '#f7f2e6'
	);
	ctx.restore();

	/* Corner sparkles. */
	ctx.fillStyle = theme.accent;
	star4( ctx, cx - R * 1.18, cy - R * 0.9, size * 0.013 );
	star4( ctx, cx + R * 1.2, cy - R * 0.55, size * 0.01 );
	star4( ctx, cx + R * 1.12, cy + R * 0.95, size * 0.012 );
}
