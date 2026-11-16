/**
 * One zodiac sign staged large: its real constellation figure (stars and
 * lines from the bundled catalog subset) and its glyph, in three layouts.
 * Facts and keywords land as editable text layers, not in the bake.
 */

import zodiac from './zodiac.json';
import { drawGlyph, SIGN_KEYS } from './glyphs.js';
import { paintBackground, paintStarDust, foilStyle } from './themes.js';

const TAU = Math.PI * 2;

/** Constellation codes in sign order (Aries..Pisces). */
export const SIGN_CODES = [
	'Ari',
	'Tau',
	'Gem',
	'Cnc',
	'Leo',
	'Vir',
	'Lib',
	'Sco',
	'Sgr',
	'Cap',
	'Aqr',
	'Psc',
];

/**
 * Project a constellation into a centred box: plate carree around the
 * figure's midpoint (RA mirrored - the poster shows the figure, not a
 * sky chart), scaled to fit.
 */
export function projectConstellation( code, boxW, boxH ) {
	const data = zodiac[ code ];
	if ( ! data ) {
		return null;
	}
	let raMin = Infinity;
	let raMax = -Infinity;
	let decMin = Infinity;
	let decMax = -Infinity;
	for ( const seg of data.segs ) {
		for ( const [ ra, dec ] of seg ) {
			raMin = Math.min( raMin, ra );
			raMax = Math.max( raMax, ra );
			decMin = Math.min( decMin, dec );
			decMax = Math.max( decMax, dec );
		}
	}
	const ra0 = ( raMin + raMax ) / 2;
	const dec0 = ( decMin + decMax ) / 2;
	const cosD = Math.cos( ( dec0 * Math.PI ) / 180 );
	const w = ( raMax - raMin ) * cosD;
	const h = decMax - decMin;
	const scale = Math.min( boxW / Math.max( w, 1 ), boxH / Math.max( h, 1 ) );
	const px = ( ra, dec ) => ( {
		x: -( ra - ra0 ) * cosD * scale,
		y: -( dec - dec0 ) * scale,
	} );
	return {
		lines: data.segs.map( ( seg ) =>
			seg.map( ( [ ra, dec ] ) => px( ra, dec ) )
		),
		stars: data.stars.map( ( [ ra, dec, mag ] ) => ( {
			...px( ra, dec ),
			mag,
		} ) ),
	};
}

/**
 * How visible a field star may be at ( x, y ) on the size x size art. The
 * catalog brings the stars around a figure too, and the figure is fitted
 * by its lines, so the field reaches past the square: it thins out over
 * the last stretch instead of being cut by the layer's edge. `foot` is
 * the star's own reach (radius or spikes).
 */
export function edgeFade( x, y, foot, size ) {
	const room = Math.min( x, y, size - x, size - y ) - foot - size * 0.01;
	return Math.max( 0, Math.min( 1, room / ( size * 0.06 ) ) );
}

function drawConstellation( ctx, proj, cx, cy, theme, foil, size, faint ) {
	ctx.save();
	ctx.translate( cx, cy );
	ctx.strokeStyle = faint ? theme.faint : foil;
	ctx.lineWidth = Math.max( 1.4, size * ( faint ? 0.002 : 0.003 ) );
	ctx.lineJoin = 'round';
	for ( const seg of proj.lines ) {
		ctx.beginPath();
		seg.forEach( ( p, i ) =>
			i ? ctx.lineTo( p.x, p.y ) : ctx.moveTo( p.x, p.y )
		);
		ctx.stroke();
	}
	for ( const s of proj.stars ) {
		const r =
			Math.max( 0.6, ( 5.8 - s.mag ) * 0.42 ) * ( size / 1000 ) * 2.2;
		const spikes = ! faint && s.mag < 1.6;
		const fade = edgeFade(
			cx + s.x,
			cy + s.y,
			( spikes ? r * 3.2 : r ) + 1,
			size
		);
		if ( fade <= 0 ) {
			continue;
		}
		ctx.globalAlpha = ( faint ? 0.35 : 1 ) * fade;
		ctx.fillStyle = theme.star;
		ctx.beginPath();
		ctx.arc( s.x, s.y, r, 0, TAU );
		ctx.fill();
		// Diffraction spikes on the brightest.
		if ( spikes ) {
			ctx.strokeStyle = theme.star;
			ctx.lineWidth = Math.max( 0.8, size * 0.0008 );
			ctx.beginPath();
			ctx.moveTo( s.x - r * 3.2, s.y );
			ctx.lineTo( s.x + r * 3.2, s.y );
			ctx.moveTo( s.x, s.y - r * 3.2 );
			ctx.lineTo( s.x, s.y + r * 3.2 );
			ctx.stroke();
		}
	}
	ctx.globalAlpha = 1;
	ctx.restore();
}

/**
 * Draw the zodiac poster art.
 *
 * @param {CanvasRenderingContext2D} ctx  Context.
 * @param {number} size Canvas size (square).
 * @param {number} sign Sign index 0..11.
 * @param {Object} opts { theme, layout: 'constellation'|'glyph'|'split'|'medallion',
 *   transparent }.
 */
export function drawZodiacCard( ctx, size, sign, opts ) {
	const { theme, layout = 'constellation', transparent = false } = opts;
	const code = SIGN_CODES[ sign ];
	const key = SIGN_KEYS[ sign ];
	const foil = foilStyle( ctx, size, size, theme );

	if ( ! transparent ) {
		paintBackground( ctx, size, size, theme );
		paintStarDust( ctx, size, size, theme );
	}

	if ( 'glyph' === layout ) {
		const proj = projectConstellation( code, size * 0.8, size * 0.8 );
		if ( proj ) {
			drawConstellation(
				ctx,
				proj,
				size / 2,
				size / 2,
				theme,
				foil,
				size,
				true
			);
		}
		drawGlyph( ctx, key, size / 2, size / 2, size * 0.42, foil );
		return;
	}

	if ( 'medallion' === layout ) {
		const cx = size / 2;
		const cy = size / 2;
		const R = size * 0.34;
		// The figure inside a double ring.
		ctx.strokeStyle = foil;
		ctx.lineWidth = Math.max( 1.6, size * 0.0035 );
		ctx.beginPath();
		ctx.arc( cx, cy, R, 0, TAU );
		ctx.stroke();
		ctx.lineWidth = Math.max( 1, size * 0.0015 );
		ctx.beginPath();
		ctx.arc( cx, cy, R * 0.955, 0, TAU );
		ctx.stroke();
		const proj = projectConstellation( code, R * 1.25, R * 1.25 );
		if ( proj ) {
			drawConstellation( ctx, proj, cx, cy, theme, foil, size, false );
		}
		// The twelve signs around it on a faint orbit, this one lit.
		ctx.strokeStyle = theme.faint;
		ctx.lineWidth = Math.max( 1, size * 0.0013 );
		ctx.beginPath();
		ctx.arc( cx, cy, R * 1.24, 0, TAU );
		ctx.stroke();
		for ( let s = 0; s < 12; s++ ) {
			const a = -Math.PI / 2 + ( ( s - sign ) / 12 ) * TAU;
			const x = cx + Math.cos( a ) * R * 1.24;
			const y = cy + Math.sin( a ) * R * 1.24;
			const on = s === sign;
			if ( on ) {
				ctx.fillStyle = theme.accent;
				ctx.beginPath();
				ctx.arc( x, y, size * 0.036, 0, TAU );
				ctx.fill();
			}
			drawGlyph(
				ctx,
				SIGN_KEYS[ s ],
				x,
				y,
				size * ( on ? 0.042 : 0.03 ),
				on ? ( theme.dark ? theme.bg[ 0 ] : '#ffffff' ) : theme.dim
			);
		}
		return;
	}

	if ( 'split' === layout ) {
		const proj = projectConstellation( code, size * 0.62, size * 0.5 );
		if ( proj ) {
			drawConstellation(
				ctx,
				proj,
				size / 2,
				size * 0.34,
				theme,
				foil,
				size,
				false
			);
		}
		drawGlyph( ctx, key, size / 2, size * 0.76, size * 0.2, foil );
		// A fine divider between the halves.
		ctx.strokeStyle = theme.faint;
		ctx.lineWidth = Math.max( 1, size * 0.0014 );
		ctx.beginPath();
		ctx.moveTo( size * 0.2, size * 0.62 );
		ctx.lineTo( size * 0.8, size * 0.62 );
		ctx.stroke();
		return;
	}

	// Default: the constellation carries the poster, the glyph signs it.
	const proj = projectConstellation( code, size * 0.72, size * 0.62 );
	if ( proj ) {
		drawConstellation(
			ctx,
			proj,
			size / 2,
			size * 0.44,
			theme,
			foil,
			size,
			false
		);
	}
	drawGlyph( ctx, key, size / 2, size * 0.84, size * 0.09, theme.accent );
	// A thin ring frames the figure.
	ctx.strokeStyle = theme.faint;
	ctx.lineWidth = Math.max( 1.2, size * 0.0018 );
	ctx.beginPath();
	ctx.arc( size / 2, size * 0.44, size * 0.4, 0, TAU );
	ctx.stroke();
}
