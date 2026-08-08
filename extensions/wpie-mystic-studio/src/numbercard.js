/**
 * The numerology cards: Life Path (the reduction cascade descending into
 * one big numeral in an ornamental ring), Name Chart (the letter grid
 * with its three result medallions) and Angel Number (the number staged
 * huge with a ray burst). Meaning sentences land as editable text layers
 * in main.js, labels inside the art come in as strings.
 */

import {
	paintBackground,
	paintStarDust,
	foilStyle,
	fillCentered,
} from './themes.js';

const TAU = Math.PI * 2;

/** The ornamental ring every number card shares. */
function ornamentRing( ctx, cx, cy, r, theme, foil, size ) {
	ctx.strokeStyle = foil;
	ctx.lineWidth = Math.max( 1.6, size * 0.0035 );
	ctx.beginPath();
	ctx.arc( cx, cy, r, 0, TAU );
	ctx.stroke();
	ctx.lineWidth = Math.max( 1, size * 0.0016 );
	ctx.beginPath();
	ctx.arc( cx, cy, r * 0.94, 0, TAU );
	ctx.stroke();
	// Tick marks like a zodiac band, quietly.
	ctx.strokeStyle = theme.faint;
	for ( let d = 0; d < 360; d += 15 ) {
		const a = ( d * Math.PI ) / 180;
		ctx.beginPath();
		ctx.moveTo(
			cx + Math.cos( a ) * r * 0.94,
			cy + Math.sin( a ) * r * 0.94
		);
		ctx.lineTo(
			cx + Math.cos( a ) * r * 0.885,
			cy + Math.sin( a ) * r * 0.885
		);
		ctx.stroke();
	}
	// Four little stars on the diagonals.
	ctx.fillStyle = theme.accent;
	for ( let q = 0; q < 4; q++ ) {
		const a = Math.PI / 4 + ( q * Math.PI ) / 2;
		star4(
			ctx,
			cx + Math.cos( a ) * r * 1.12,
			cy + Math.sin( a ) * r * 1.12,
			size * 0.012
		);
	}
}

/** A tiny four-point sparkle. */
function star4( ctx, x, y, s ) {
	ctx.beginPath();
	ctx.moveTo( x, y - s );
	ctx.quadraticCurveTo( x, y, x + s, y );
	ctx.quadraticCurveTo( x, y, x, y + s );
	ctx.quadraticCurveTo( x, y, x - s, y );
	ctx.quadraticCurveTo( x, y, x, y - s );
	ctx.fill();
}

const fontStack = ( family ) =>
	`'${ family }', 'Playfair Display', Georgia, serif`;

/**
 * Life Path: cascade line up top, the big number in the ring.
 *
 * @param {CanvasRenderingContext2D} ctx  Context.
 * @param {number} size Canvas size (square).
 * @param {Object} lp   From lifePath(): { value, parts, sum }.
 * @param {Object} opts { theme, fontFamily, cascadeText, label,
 *   transparent }.
 */
export function drawLifePathCard( ctx, size, lp, opts ) {
	const {
		theme,
		fontFamily = 'Playfair Display',
		cascadeText = '',
		label = '',
		transparent = false,
	} = opts;
	const foil = foilStyle( ctx, size, size, theme );
	if ( ! transparent ) {
		paintBackground( ctx, size, size, theme );
		paintStarDust( ctx, size, size, theme );
	}
	const cx = size / 2;
	const cy = size * 0.55;
	const r = size * 0.3;
	ornamentRing( ctx, cx, cy, r, theme, foil, size );

	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = foil;
	ctx.font = `600 ${ Math.round( size * 0.3 ) }px ${ fontStack(
		fontFamily
	) }`;
	fillCentered( ctx, lp.value, cx, cy );

	// The cascade, drawn as the story above the ring.
	if ( cascadeText ) {
		ctx.fillStyle = theme.dim;
		ctx.font = `500 ${ Math.round( size * 0.026 ) }px ${ fontStack(
			fontFamily
		) }`;
		ctx.fillText( cascadeText, cx, size * 0.13 );
	}
	if ( label ) {
		ctx.fillStyle = theme.accent;
		ctx.font = `600 ${ Math.round( size * 0.022 ) }px ${ fontStack(
			fontFamily
		) }`;
		const prev = ctx.letterSpacing;
		try {
			ctx.letterSpacing = '0.3em';
		} catch ( e ) {}
		ctx.fillText( label.toUpperCase(), cx, size * 0.19 );
		try {
			ctx.letterSpacing = prev || '0px';
		} catch ( e ) {}
	}
}

/**
 * Name Chart: the letter grid with values, three medallions below.
 *
 * @param {CanvasRenderingContext2D} ctx  Context.
 * @param {number} size Canvas size (square).
 * @param {Object} nn   From nameNumbers().
 * @param {Object} opts { theme, fontFamily, medallions: [ { label,
 *   value } x3 ], transparent }.
 */
export function drawNameCard( ctx, size, nn, opts ) {
	const {
		theme,
		fontFamily = 'Playfair Display',
		medallions = [],
		transparent = false,
	} = opts;
	const foil = foilStyle( ctx, size, size, theme );
	if ( ! transparent ) {
		paintBackground( ctx, size, size, theme );
		paintStarDust( ctx, size, size, theme );
	}

	// Layout the letters into rows (words never break).
	const words = [];
	let current = [];
	for ( const l of nn.letters ) {
		if ( l.space ) {
			words.push( current );
			current = [];
		} else {
			current.push( l );
		}
	}
	if ( current.length ) {
		words.push( current );
	}
	const maxLen = Math.max( 1, ...words.map( ( w ) => w.length ) );
	const cell = Math.min( size * 0.11, ( size * 0.84 ) / maxLen );
	const gridH = words.length * cell * 1.35;
	let y = size * 0.16 + ( size * 0.36 - gridH / 2 - size * 0.16 );

	for ( const word of words ) {
		const w = word.length * cell;
		let x = ( size - w ) / 2 + cell / 2;
		for ( const l of word ) {
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillStyle = l.vowel ? theme.accent : theme.ink;
			ctx.font = `600 ${ Math.round( cell * 0.62 ) }px ${ fontStack(
				fontFamily
			) }`;
			ctx.fillText( l.ch, x, y );
			ctx.fillStyle = theme.dim;
			ctx.font = `500 ${ Math.round( cell * 0.26 ) }px ${ fontStack(
				fontFamily
			) }`;
			ctx.fillText( String( l.value ), x, y + cell * 0.52 );
			x += cell;
		}
		y += cell * 1.35;
	}

	// Divider.
	ctx.strokeStyle = theme.faint;
	ctx.lineWidth = Math.max( 1, size * 0.0014 );
	ctx.beginPath();
	ctx.moveTo( size * 0.18, size * 0.6 );
	ctx.lineTo( size * 0.82, size * 0.6 );
	ctx.stroke();
	ctx.fillStyle = theme.accent;
	star4( ctx, size / 2, size * 0.6, size * 0.012 );

	// Medallions.
	const mr = size * 0.085;
	const my = size * 0.76;
	const positions = [ size * 0.25, size * 0.5, size * 0.75 ];
	medallions.slice( 0, 3 ).forEach( ( m, i ) => {
		const mx = positions[ i ];
		ctx.strokeStyle = foil;
		ctx.lineWidth = Math.max( 1.4, size * 0.0028 );
		ctx.beginPath();
		ctx.arc( mx, my, mr, 0, TAU );
		ctx.stroke();
		ctx.beginPath();
		ctx.arc( mx, my, mr * 0.9, 0, TAU );
		ctx.lineWidth = Math.max( 1, size * 0.0012 );
		ctx.stroke();
		ctx.fillStyle = foil;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.font = `600 ${ Math.round( mr * 0.95 ) }px ${ fontStack(
			fontFamily
		) }`;
		fillCentered( ctx, m.value || '-', mx, my );
		ctx.fillStyle = theme.dim;
		ctx.font = `500 ${ Math.round( size * 0.02 ) }px ${ fontStack(
			fontFamily
		) }`;
		ctx.fillText( m.label, mx, my + mr + size * 0.035 );
	} );
}

/**
 * Angel Number: the number huge with a soft ray burst behind it.
 *
 * @param {CanvasRenderingContext2D} ctx  Context.
 * @param {number} size Canvas size (square).
 * @param {string} num  The number text, e.g. '444' or '11:11'.
 * @param {Object} opts { theme, fontFamily, transparent }.
 */
export function drawAngelCard( ctx, size, num, opts ) {
	const {
		theme,
		fontFamily = 'Playfair Display',
		transparent = false,
	} = opts;
	const foil = foilStyle( ctx, size, size, theme );
	if ( ! transparent ) {
		paintBackground( ctx, size, size, theme );
		paintStarDust( ctx, size, size, theme );
	}
	const cx = size / 2;
	const cy = size * 0.46;

	// Ray burst.
	ctx.save();
	ctx.strokeStyle = theme.dark ? theme.faint : theme.faint;
	ctx.lineWidth = Math.max( 1, size * 0.0014 );
	for ( let i = 0; i < 36; i++ ) {
		const a = ( i / 36 ) * TAU;
		const r1 = size * ( 0 === i % 3 ? 0.26 : 0.3 );
		const r2 = size * ( 0 === i % 3 ? 0.44 : 0.38 );
		ctx.beginPath();
		ctx.moveTo( cx + Math.cos( a ) * r1, cy + Math.sin( a ) * r1 );
		ctx.lineTo( cx + Math.cos( a ) * r2, cy + Math.sin( a ) * r2 );
		ctx.stroke();
	}
	ctx.restore();

	// Halo ring.
	ctx.strokeStyle = foil;
	ctx.lineWidth = Math.max( 1.6, size * 0.003 );
	ctx.beginPath();
	ctx.arc( cx, cy, size * 0.24, 0, TAU );
	ctx.stroke();

	// The number: sized to fit its ring.
	const text = String( num || '' ).trim() || '111';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	let px = Math.round( size * 0.22 );
	ctx.font = `600 ${ px }px ${ fontStack( fontFamily ) }`;
	while ( px > 20 && ctx.measureText( text ).width > size * 0.38 ) {
		px -= 4;
		ctx.font = `600 ${ px }px ${ fontStack( fontFamily ) }`;
	}
	ctx.fillStyle = foil;
	fillCentered( ctx, text, cx, cy );

	// Sparkles.
	ctx.fillStyle = theme.accent;
	star4( ctx, cx - size * 0.3, cy - size * 0.26, size * 0.014 );
	star4( ctx, cx + size * 0.32, cy - size * 0.18, size * 0.01 );
	star4( ctx, cx + size * 0.26, cy + size * 0.3, size * 0.013 );
}
