/**
 * The reading cards: Big Three (sun, moon and rising sign as three
 * medallions), Element Balance (the chart's elements as a ring, the
 * dominant one in the centre) and Cosmic Profile (one sheet with the Big
 * Three, the birth moon, the life path, the Chinese animal and the
 * dominant element). All art is transparent; the poster backdrop and the
 * captions come from the studio.
 */

import { drawGlyph, SIGN_KEYS } from './glyphs.js';
import { foilStyle, fillCentered, spacedLabel, star4, rgba } from './themes.js';
import { medallion, badge, elementSymbol, elementColors } from './medallion.js';
import { drawMoonDisc } from './mooncard.js';
import { phaseIcon } from './frames.js';
import { HANZI } from './chinese.js';

const TAU = Math.PI * 2;
const CJK =
	"'Noto Serif SC', 'Songti SC', 'SimSun', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', serif";
const stack = ( family ) => `'${ family }', 'Playfair Display', Georgia, serif`;
const sans = ( family ) => `'${ family }', 'Inter', system-ui, sans-serif`;

/** A sign medallion: ring, glyph, badge, and two labels under it. */
function signMedallion( ctx, x, y, r, sign, what, labels, o ) {
	const { theme, foil, size, family } = o;
	const known = null !== sign && undefined !== sign;
	medallion( ctx, x, y, r, theme, foil, { dashed: ! known } );
	if ( known ) {
		drawGlyph( ctx, SIGN_KEYS[ sign ], x, y + r * 0.04, r * 0.95, foil );
	} else {
		ctx.fillStyle = theme.dim;
		ctx.textAlign = 'center';
		ctx.font = `500 ${ Math.round( r * 0.7 ) }px ${ stack( family ) }`;
		fillCentered( ctx, '?', x, y );
	}
	badge( ctx, x, y - r, r * 0.26, theme, what );
	const lx = labels.sign;
	if ( lx ) {
		spacedLabel(
			ctx,
			lx,
			x,
			y + r + size * 0.045,
			size * 0.03,
			theme.ink,
			sans( family ),
			0.16
		);
	}
	if ( labels.role ) {
		spacedLabel(
			ctx,
			labels.role,
			x,
			y + r + size * 0.083,
			size * 0.019,
			theme.accent,
			sans( family ),
			0.3
		);
	}
}

/**
 * Big Three.
 *
 * @param {CanvasRenderingContext2D} ctx  Context.
 * @param {number} size Square size.
 * @param {Object} b3   From bigThree(): { sun, moon, rising }.
 * @param {Object} opts { theme, signNames[12], roles: { sun, moon,
 *   rising }, fontFamily }.
 */
export function drawBigThreeCard( ctx, size, b3, opts ) {
	const { theme, signNames = [], roles = {}, fontFamily = 'Inter' } = opts;
	const foil = foilStyle( ctx, size, size, theme );
	const o = { theme, foil, size, family: fontFamily };
	const pts = [
		{ x: size * 0.5, y: size * 0.29, r: size * 0.15 },
		{ x: size * 0.24, y: size * 0.66, r: size * 0.125 },
		{ x: size * 0.76, y: size * 0.66, r: size * 0.125 },
	];

	// The great circle that holds all three, with a fine tick scale.
	const cx = size / 2;
	const cy = size * 0.53;
	const R = size * 0.335;
	ctx.save();
	ctx.strokeStyle = theme.faint;
	ctx.lineWidth = Math.max( 1, size * 0.0014 );
	ctx.beginPath();
	ctx.arc( cx, cy, R, 0, TAU );
	ctx.stroke();
	ctx.beginPath();
	for ( let d = 0; d < 360; d += 5 ) {
		const a = ( d * Math.PI ) / 180;
		const l = 0 === d % 30 ? 0.022 : 0.011;
		ctx.moveTo( cx + Math.cos( a ) * R, cy + Math.sin( a ) * R );
		ctx.lineTo(
			cx + Math.cos( a ) * ( R - size * l ),
			cy + Math.sin( a ) * ( R - size * l )
		);
	}
	ctx.stroke();
	// The triangle of the three lights.
	ctx.strokeStyle = foil;
	ctx.globalAlpha = 0.55;
	ctx.lineWidth = Math.max( 1, size * 0.0018 );
	ctx.beginPath();
	pts.forEach( ( p, i ) =>
		0 === i ? ctx.moveTo( p.x, p.y ) : ctx.lineTo( p.x, p.y )
	);
	ctx.closePath();
	ctx.stroke();
	ctx.globalAlpha = 1;
	ctx.fillStyle = theme.accent;
	star4( ctx, cx, size * 0.54, size * 0.022 );
	star4( ctx, cx - size * 0.05, size * 0.5, size * 0.008 );
	star4( ctx, cx + size * 0.05, size * 0.58, size * 0.008 );
	ctx.restore();

	signMedallion(
		ctx,
		pts[ 0 ].x,
		pts[ 0 ].y,
		pts[ 0 ].r,
		b3.sun,
		{ glyph: 'sun' },
		{ sign: signNames[ b3.sun ], role: roles.sun },
		o
	);
	signMedallion(
		ctx,
		pts[ 1 ].x,
		pts[ 1 ].y,
		pts[ 1 ].r,
		b3.moon,
		{ glyph: 'moon' },
		{ sign: signNames[ b3.moon ], role: roles.moon },
		o
	);
	signMedallion(
		ctx,
		pts[ 2 ].x,
		pts[ 2 ].y,
		pts[ 2 ].r,
		b3.rising,
		{ text: 'AC' },
		{
			sign: null === b3.rising ? '—' : signNames[ b3.rising ],
			role: roles.rising,
		},
		o
	);
}

/**
 * Element Balance.
 *
 * @param {CanvasRenderingContext2D} ctx  Context.
 * @param {number} size Square size.
 * @param {Object} bal  From elementBalance() plus pct: whole percents.
 * @param {Object} opts { theme, elementNames[4], modalityNames[3],
 *   fontFamily }.
 */
export function drawElementsCard( ctx, size, bal, opts ) {
	const {
		theme,
		elementNames = [],
		modalityNames = [],
		fontFamily = 'Inter',
	} = opts;
	const foil = foilStyle( ctx, size, size, theme );
	const colors = elementColors( theme );
	const cx = size / 2;
	const cy = size / 2;
	const R = size * 0.315;
	const band = size * 0.075;
	const ring = R + band / 2 + size * 0.03;
	const pct = bal.pct || bal.elements.map( ( v ) => Math.round( v * 100 ) );

	// Outer scale ring.
	ctx.save();
	ctx.strokeStyle = foil;
	ctx.lineWidth = Math.max( 1.2, size * 0.0024 );
	ctx.beginPath();
	ctx.arc( cx, cy, ring, 0, TAU );
	ctx.stroke();
	ctx.strokeStyle = theme.faint;
	ctx.lineWidth = Math.max( 1, size * 0.0013 );
	ctx.beginPath();
	for ( let d = 0; d < 360; d += 3.6 ) {
		const a = ( d * Math.PI ) / 180 - Math.PI / 2;
		const r0 = ring;
		const l = 0 === Math.round( d / 3.6 ) % 5 ? 0.018 : 0.009;
		ctx.moveTo( cx + Math.cos( a ) * r0, cy + Math.sin( a ) * r0 );
		ctx.lineTo(
			cx + Math.cos( a ) * ( r0 - size * l ),
			cy + Math.sin( a ) * ( r0 - size * l )
		);
	}
	ctx.stroke();

	// The four segments, clockwise from the top.
	const gapA = 0.035;
	let a0 = -Math.PI / 2;
	const mids = [];
	bal.elements.forEach( ( share, i ) => {
		const span = share * TAU;
		if ( span > gapA * 2 ) {
			ctx.strokeStyle = rgba( colors[ i ], theme.dark ? 0.9 : 0.85 );
			ctx.lineWidth = band;
			ctx.lineCap = 'butt';
			ctx.beginPath();
			ctx.arc( cx, cy, R, a0 + gapA, a0 + span - gapA );
			ctx.stroke();
		}
		mids.push( { a: a0 + span / 2, span } );
		a0 += span;
	} );

	// Symbols on the band, percentages outside it. Each label clears the
	// scale ring by its own extent in that direction and stays inside the
	// square, so no figure is ever cut by the art layer's edge.
	const symColor = theme.dark ? theme.bg[ 0 ] : '#ffffff';
	const edge = size * 0.025;
	mids.forEach( ( m, i ) => {
		if ( m.span < 0.2 ) {
			return;
		}
		const cos = Math.cos( m.a );
		const sin = Math.sin( m.a );
		elementSymbol(
			ctx,
			i,
			cx + cos * R,
			cy + sin * R,
			band * 0.56,
			symColor
		);
		const label = pct[ i ] + '%';
		ctx.fillStyle = theme.ink;
		ctx.textAlign = 'center';
		ctx.font = `600 ${ Math.round( size * 0.036 ) }px ${ stack(
			fontFamily
		) }`;
		const hw = ctx.measureText( label ).width / 2;
		const hh = size * 0.018;
		const rr =
			ring + size * 0.022 + Math.abs( cos ) * hw + Math.abs( sin ) * hh;
		const clamp = ( v, h ) =>
			Math.min( size - edge - h, Math.max( edge + h, v ) );
		fillCentered(
			ctx,
			label,
			clamp( cx + cos * rr, hw ),
			clamp( cy + sin * rr, hh )
		);
	} );

	// The dominant element in the heart of the ring.
	const d = bal.dominant;
	ctx.strokeStyle = rgba( colors[ d ], 0.3 );
	ctx.lineWidth = Math.max( 1, size * 0.002 );
	ctx.beginPath();
	ctx.arc( cx, cy, R - band / 2 - size * 0.035, 0, TAU );
	ctx.stroke();
	elementSymbol( ctx, d, cx, cy - size * 0.045, size * 0.12, foil );
	spacedLabel(
		ctx,
		elementNames[ d ] || '',
		cx,
		cy + size * 0.07,
		size * 0.034,
		theme.ink,
		sans( fontFamily ),
		0.2
	);
	spacedLabel(
		ctx,
		modalityNames[ bal.mode ] || '',
		cx,
		cy + size * 0.115,
		size * 0.02,
		theme.accent,
		sans( fontFamily ),
		0.32
	);
	ctx.restore();
}

/**
 * Cosmic Profile: the whole birth in one sheet.
 *
 * @param {CanvasRenderingContext2D} ctx  Context.
 * @param {number} size Square size.
 * @param {Object} p    { b3, phase, lifePath, animal, element }.
 * @param {Object} opts { theme, moonImg, southern, fontFamily, labels:
 *   { sun, moon, rising, lifePath, animal, element }, signNames }.
 */
export function drawProfileCard( ctx, size, p, opts ) {
	const {
		theme,
		moonImg = null,
		southern = false,
		fontFamily = 'Inter',
		labels = {},
	} = opts;
	const foil = foilStyle( ctx, size, size, theme );
	const cx = size / 2;
	const rowTop = size * 0.2;
	const rowBottom = size * 0.8;
	const xs = [ size * 0.2, size * 0.5, size * 0.8 ];
	const mr = size * 0.078;

	// Axis and rails first, so everything else sits on top.
	ctx.save();
	ctx.strokeStyle = theme.faint;
	ctx.lineWidth = Math.max( 1, size * 0.0015 );
	ctx.beginPath();
	ctx.moveTo( xs[ 0 ] + mr * 1.2, rowTop );
	ctx.lineTo( xs[ 2 ] - mr * 1.2, rowTop );
	ctx.moveTo( xs[ 0 ] + mr * 1.2, rowBottom );
	ctx.lineTo( xs[ 2 ] - mr * 1.2, rowBottom );
	ctx.moveTo( cx, rowTop + mr * 1.9 );
	ctx.lineTo( cx, size * 0.5 - size * 0.17 );
	ctx.moveTo( cx, size * 0.5 + size * 0.17 );
	ctx.lineTo( cx, rowBottom - mr * 1.3 );
	ctx.stroke();
	ctx.restore();

	// Top row: the Big Three.
	const top = [
		{ sign: p.b3.sun, what: { glyph: 'sun' }, label: labels.sun },
		{ sign: p.b3.moon, what: { glyph: 'moon' }, label: labels.moon },
		{ sign: p.b3.rising, what: { text: 'AC' }, label: labels.rising },
	];
	top.forEach( ( t, i ) => {
		const known = null !== t.sign && undefined !== t.sign;
		medallion( ctx, xs[ i ], rowTop, mr, theme, foil, {
			dashed: ! known,
			glow: false,
		} );
		if ( known ) {
			drawGlyph(
				ctx,
				SIGN_KEYS[ t.sign ],
				xs[ i ],
				rowTop,
				mr * 0.95,
				foil
			);
		}
		badge( ctx, xs[ i ], rowTop - mr, mr * 0.28, theme, t.what );
		spacedLabel(
			ctx,
			t.label,
			xs[ i ],
			rowTop + mr + size * 0.034,
			size * 0.02,
			theme.accent,
			sans( fontFamily ),
			0.26
		);
	} );

	// Centre: the moon of the birth night, ringed by the eight phases.
	const mR = size * 0.14;
	const my = size * 0.5;
	if ( theme.dark ) {
		const glow = ctx.createRadialGradient(
			cx,
			my,
			mR * 0.8,
			cx,
			my,
			mR * 1.8
		);
		glow.addColorStop( 0, 'rgba(240,235,215,0.12)' );
		glow.addColorStop( 1, 'rgba(240,235,215,0)' );
		ctx.fillStyle = glow;
		ctx.beginPath();
		ctx.arc( cx, my, mR * 1.8, 0, TAU );
		ctx.fill();
	}
	drawMoonDisc( ctx, cx, my, mR, p.phase, { theme, southern, moonImg } );
	for ( let k = 0; k < 8; k++ ) {
		const a = -Math.PI / 2 + ( k / 8 ) * TAU;
		const on = k === p.phase.index;
		phaseIcon(
			ctx,
			cx + Math.cos( a ) * mR * 1.38,
			my + Math.sin( a ) * mR * 1.38,
			size * ( on ? 0.012 : 0.0085 ),
			k * 45,
			on ? theme.accent : theme.dim
		);
	}

	// Bottom row: life path, Chinese animal, dominant element.
	const bottom = [ 0, 1, 2 ];
	bottom.forEach( ( i ) => {
		medallion( ctx, xs[ i ], rowBottom, mr, theme, foil, { glow: false } );
	} );
	ctx.textAlign = 'center';
	ctx.fillStyle = foil;
	ctx.font = `600 ${ Math.round( mr * 1.05 ) }px ${ stack( fontFamily ) }`;
	fillCentered( ctx, p.lifePath, xs[ 0 ], rowBottom );
	ctx.font = `600 ${ Math.round( mr * 0.95 ) }px ${ CJK }`;
	fillCentered( ctx, HANZI[ p.animal ], xs[ 1 ], rowBottom );
	elementSymbol( ctx, p.element, xs[ 2 ], rowBottom, mr * 0.78, foil );
	[ labels.lifePath, labels.animal, labels.element ].forEach( ( l, i ) =>
		spacedLabel(
			ctx,
			l,
			xs[ i ],
			rowBottom + mr + size * 0.034,
			size * 0.02,
			theme.accent,
			sans( fontFamily ),
			0.26
		)
	);
}
