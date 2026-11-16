/**
 * The shared look system of all Mystic Studio cards. A theme carries flat
 * colors plus two style makers - lineStyle() for ordinary strokes and
 * foilStyle() for the showpiece strokes (zodiac ring, constellation
 * lines), which the metallic themes turn into a foil gradient.
 *
 * `mist` are the two tints the nebula and aurora backdrops paint with.
 * resolveTheme() lays the user's own colors over a theme and derives the
 * rest (muted tones, foil) from them.
 */

export const THEMES = [
	{
		key: 'celestial',
		bg: [ '#0c0f1e', '#1b2342' ],
		ink: '#ece7d9',
		accent: '#d4af37',
		soft: '#7fb3a3',
		hard: '#c46a5a',
		mist: [ '#3b4f9a', '#7a4f9a' ],
		dark: true,
	},
	{
		key: 'vintage',
		bg: [ '#f4ecdb', '#e6d6b8' ],
		ink: '#2e2820',
		accent: '#8a5a2b',
		soft: '#4f7355',
		hard: '#9c4a38',
		mist: [ '#c9a978', '#b88a6a' ],
		dark: false,
	},
	{
		key: 'foil',
		bg: [ '#0f0f14', '#1f1f2b' ],
		ink: '#efe9db',
		accent: '#e6c56a',
		soft: '#9db89f',
		hard: '#c98d6b',
		mist: [ '#5a4a22', '#3a3450' ],
		dark: true,
		foil: [ '#8a6a1f', '#f4e09a', '#c9a13b', '#fdf6d8', '#8a6a1f' ],
	},
	{
		key: 'lineart',
		bg: [ '#ffffff', '#f6f6f4' ],
		ink: '#101014',
		accent: '#101014',
		soft: '#3c3c44',
		hard: '#3c3c44',
		mist: [ '#d8d8dc', '#e8e8ea' ],
		dark: false,
	},
	{
		key: 'rose',
		bg: [ '#f9f0ee', '#f0d6d0' ],
		ink: '#46292e',
		accent: '#b76e79',
		soft: '#6f8f7a',
		hard: '#a85a4a',
		mist: [ '#e8b4b4', '#d7a6c4' ],
		dark: false,
		foil: [ '#8a4f57', '#eab7ab', '#c98d92', '#f9e0d7', '#8a4f57' ],
	},
	{
		key: 'silver',
		bg: [ '#0e1016', '#1e2431' ],
		ink: '#e9ecf2',
		accent: '#c3c9d6',
		soft: '#8fb3b0',
		hard: '#b07a8a',
		mist: [ '#3e4d66', '#5a5f78' ],
		dark: true,
		foil: [ '#6e7684', '#e2e6ee', '#aab2c0', '#f7f9fd', '#6e7684' ],
	},
	{
		key: 'emerald',
		bg: [ '#0a1510', '#15301f' ],
		ink: '#eae7d8',
		accent: '#cba64f',
		soft: '#7fb394',
		hard: '#c07a5a',
		mist: [ '#1f6a4a', '#3a5a2a' ],
		dark: true,
	},
	{
		key: 'amethyst',
		bg: [ '#150f23', '#2a1b42' ],
		ink: '#ece6f2',
		accent: '#b78fd6',
		soft: '#8fb3d6',
		hard: '#c9799e',
		mist: [ '#6a3f9a', '#3f4f9a' ],
		dark: true,
	},
	{
		key: 'midnight',
		bg: [ '#0a1222', '#172746' ],
		ink: '#f1e9df',
		accent: '#d08a55',
		soft: '#7fa7b8',
		hard: '#c96a50',
		mist: [ '#274a7a', '#7a4a3a' ],
		dark: true,
		foil: [ '#7a4523', '#f0bb8a', '#c47a45', '#fbe1c8', '#7a4523' ],
	},
	{
		key: 'terracotta',
		bg: [ '#f5e9dc', '#ead3bd' ],
		ink: '#4a2e22',
		accent: '#b5562d',
		soft: '#7a8f6a',
		hard: '#a4452a',
		mist: [ '#e0a784', '#d9b99a' ],
		dark: false,
	},
	{
		key: 'sage',
		bg: [ '#eff1e8', '#dde3d0' ],
		ink: '#2f3a2c',
		accent: '#667f58',
		soft: '#5f8a78',
		hard: '#a4684f',
		mist: [ '#b9c9a8', '#cfd8bd' ],
		dark: false,
	},
	{
		key: 'noir',
		bg: [ '#050506', '#17171a' ],
		ink: '#f4f4f2',
		accent: '#ffffff',
		soft: '#b8b8bc',
		hard: '#b8b8bc',
		mist: [ '#2a2a30', '#3a3a40' ],
		dark: true,
	},
	{
		key: 'cosmic',
		bg: [ '#170a2c', '#3a1452' ],
		ink: '#fbeef8',
		accent: '#ff9ecf',
		soft: '#8fd6e6',
		hard: '#ff7a8a',
		mist: [ '#b43f9a', '#3f5fd6' ],
		dark: true,
		foil: [ '#a0457a', '#ffd3ec', '#ff9ecf', '#fff2fa', '#a0457a' ],
	},
	{
		key: 'ocean',
		bg: [ '#061e26', '#0d3a45' ],
		ink: '#e6f4f1',
		accent: '#7fd6c9',
		soft: '#8fc7e6',
		hard: '#e69a8a',
		mist: [ '#1f7a8a', '#1f4a7a' ],
		dark: true,
	},
	{
		key: 'sand',
		bg: [ '#f1e6d2', '#e2cfaf' ],
		ink: '#3b2f22',
		accent: '#a8842f',
		soft: '#6f8a6a',
		hard: '#a0553a',
		mist: [ '#d9b97a', '#e6cf9a' ],
		dark: false,
		foil: [ '#7a5a1a', '#e8cf86', '#b8932f', '#f6e7b8', '#7a5a1a' ],
	},
].map( withDerived );

/* ------------------------------ color maths ------------------------------ */

/** '#rgb' / '#rrggbb' -> [ r, g, b ] (0..255), or null. */
export function hexToRgb( hex ) {
	const s = String( hex || '' ).trim();
	let m = /^#?([0-9a-f]{6})$/i.exec( s );
	if ( m ) {
		const n = parseInt( m[ 1 ], 16 );
		return [ ( n >> 16 ) & 255, ( n >> 8 ) & 255, n & 255 ];
	}
	m = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec( s );
	if ( m ) {
		return [ 1, 2, 3 ].map( ( i ) => parseInt( m[ i ] + m[ i ], 16 ) );
	}
	return null;
}

/** [ r, g, b ] -> '#rrggbb'. */
export function rgbToHex( rgb ) {
	return (
		'#' +
		rgb
			.map( ( v ) =>
				Math.max( 0, Math.min( 255, Math.round( v ) ) )
					.toString( 16 )
					.padStart( 2, '0' )
			)
			.join( '' )
	);
}

/** Mix two hex colors, t = 0 gives a, 1 gives b. */
export function mix( a, b, t ) {
	const x = hexToRgb( a ) || [ 0, 0, 0 ];
	const y = hexToRgb( b ) || [ 0, 0, 0 ];
	return rgbToHex( x.map( ( v, i ) => v + ( y[ i ] - v ) * t ) );
}

/** A hex color with alpha, as rgba(). */
export function rgba( hex, alpha ) {
	const c = hexToRgb( hex ) || [ 20, 20, 28 ];
	return `rgba(${ c[ 0 ] },${ c[ 1 ] },${ c[ 2 ] },${ alpha })`;
}

/** Relative luminance 0..1. */
export function luminance( hex ) {
	const c = ( hexToRgb( hex ) || [ 0, 0, 0 ] ).map( ( v ) => {
		const s = v / 255;
		return s <= 0.03928 ? s / 12.92 : ( ( s + 0.055 ) / 1.055 ) ** 2.4;
	} );
	return 0.2126 * c[ 0 ] + 0.7152 * c[ 1 ] + 0.0722 * c[ 2 ];
}

/** The derived tones every renderer reads, from the base colors. */
function withDerived( theme ) {
	const ink = theme.ink;
	return {
		...theme,
		dim: rgba( ink, theme.dark ? 0.46 : 0.55 ),
		faint: rgba( ink, theme.dark ? 0.17 : 0.18 ),
		star: theme.star || mix( ink, '#ffffff', theme.dark ? 0.3 : 0 ),
		// Opaque text tones: text layers carry hex, never rgba, so the
		// color panel can show and edit them.
		muted: mix( ink, theme.bg[ 0 ], theme.dark ? 0.38 : 0.34 ),
	};
}

/** A five-stop foil gradient built from one accent color. */
export function foilFrom( accent ) {
	return [
		mix( accent, '#000000', 0.42 ),
		mix( accent, '#ffffff', 0.55 ),
		accent,
		mix( accent, '#ffffff', 0.78 ),
		mix( accent, '#000000', 0.42 ),
	];
}

export function themeByKey( key ) {
	return THEMES.find( ( t ) => t.key === key ) || THEMES[ 0 ];
}

/**
 * The theme a poster is drawn in: a named theme, optionally with the
 * user's own background, ink and accent laid over it.
 *
 * @param {string}      key    Theme key.
 * @param {Object|null} custom { bg, ink, accent } hex colors, or null.
 * @return {Object} Theme.
 */
export function resolveTheme( key, custom = null ) {
	const base = themeByKey( key );
	if ( ! custom ) {
		return base;
	}
	const bg = hexToRgb( custom.bg ) ? custom.bg : base.bg[ 0 ];
	const ink = hexToRgb( custom.ink ) ? custom.ink : base.ink;
	const accent = hexToRgb( custom.accent ) ? custom.accent : base.accent;
	const dark = luminance( bg ) < 0.3;
	return withDerived( {
		...base,
		key: base.key,
		bg: [ bg, mix( bg, dark ? '#ffffff' : '#000000', 0.09 ) ],
		ink,
		accent,
		mist: [ mix( accent, bg, 0.55 ), mix( ink, bg, 0.7 ) ],
		dark,
		star: undefined,
		foil: foilFrom( accent ),
	} );
}

/* ------------------------------- painting -------------------------------- */

/** Paint the poster background (radial night sky or flat paper). */
export function paintBackground( ctx, w, h, theme ) {
	if ( theme.dark ) {
		const g = ctx.createRadialGradient(
			w / 2,
			h * 0.42,
			0,
			w / 2,
			h / 2,
			Math.max( w, h ) * 0.75
		);
		g.addColorStop( 0, theme.bg[ 1 ] );
		g.addColorStop( 1, theme.bg[ 0 ] );
		ctx.fillStyle = g;
	} else {
		const g = ctx.createLinearGradient( 0, 0, 0, h );
		g.addColorStop( 0, theme.bg[ 0 ] );
		g.addColorStop( 1, theme.bg[ 1 ] );
		ctx.fillStyle = g;
	}
	ctx.fillRect( 0, 0, w, h );
}

/** Stroke style for the showpiece lines: metallic gradient on foil. */
export function foilStyle( ctx, w, h, theme, x = 0, y = 0 ) {
	if ( ! theme.foil ) {
		return theme.accent;
	}
	const g = ctx.createLinearGradient( x, y, x + w, y + h );
	theme.foil.forEach( ( c, i ) =>
		g.addColorStop( i / ( theme.foil.length - 1 ), c )
	);
	return g;
}

/**
 * Fill a text truly centred on (x, y): numerals sit optically off with
 * textBaseline 'middle' (the 4 hangs deeper than the 8), so the glyph's
 * real ink box from measureText decides. Falls back to 'middle' where
 * the metrics are missing.
 *
 * @param {CanvasRenderingContext2D} ctx  Context, font and fill set.
 * @param {string|number} text Text to draw.
 * @param {number} x Centre x (with textAlign 'center').
 * @param {number} y Centre y.
 */
export function fillCentered( ctx, text, x, y ) {
	const s = String( text );
	const prev = ctx.textBaseline;
	// measureText metrics are RELATIVE TO THE CURRENT BASELINE - measure
	// and draw under the same one, or the offset is garbage (browsers
	// honour this strictly; node-canvas is more forgiving, which is why
	// only the editor showed the drift).
	ctx.textBaseline = 'alphabetic';
	const m = ctx.measureText( s );
	const asc = m.actualBoundingBoxAscent;
	const desc = m.actualBoundingBoxDescent;
	if ( Number.isFinite( asc ) && Number.isFinite( desc ) ) {
		ctx.fillText( s, x, y + ( asc - desc ) / 2 );
		ctx.textBaseline = prev;
		return;
	}
	ctx.textBaseline = 'middle';
	ctx.fillText( s, x, y );
	ctx.textBaseline = prev;
}

/**
 * Small caps label with letter spacing, centred on x (the art's own short
 * labels: medallion names, sign names).
 *
 * @param {CanvasRenderingContext2D} ctx    Context.
 * @param {string} text   Label.
 * @param {number} x      Centre x.
 * @param {number} y      Baseline-centred y.
 * @param {number} px     Font size.
 * @param {string} color  Fill.
 * @param {string} family Font family stack.
 * @param {number} [spacing] Letter spacing in em.
 */
export function spacedLabel(
	ctx,
	text,
	x,
	y,
	px,
	color,
	family,
	spacing = 0.2
) {
	const s = String( text || '' ).toUpperCase();
	if ( ! s ) {
		return;
	}
	ctx.save();
	ctx.font = `600 ${ Math.round( px ) }px ${ family }`;
	ctx.fillStyle = color;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	// Letter spacing by hand: canvas letterSpacing is not everywhere.
	const gap = px * spacing;
	const widths = [ ...s ].map( ( ch ) => ctx.measureText( ch ).width );
	const total =
		widths.reduce( ( a, b ) => a + b, 0 ) + gap * ( s.length - 1 );
	let cx = x - total / 2;
	[ ...s ].forEach( ( ch, i ) => {
		ctx.fillText( ch, cx + widths[ i ] / 2, y );
		cx += widths[ i ] + gap;
	} );
	ctx.restore();
}

/** A light scatter of decorative background stars (dark themes only). */
export function paintStarDust( ctx, w, h, theme, seed = 7 ) {
	if ( ! theme.dark ) {
		return;
	}
	let s = seed;
	const rnd = () => {
		s = ( s * 16807 ) % 2147483647;
		return s / 2147483647;
	};
	ctx.save();
	for ( let i = 0; i < 140; i++ ) {
		const x = rnd() * w;
		const y = rnd() * h;
		const r = 0.4 + rnd() * 1.1;
		ctx.globalAlpha = 0.12 + rnd() * 0.5;
		ctx.fillStyle = theme.star;
		ctx.beginPath();
		ctx.arc( x, y, r, 0, Math.PI * 2 );
		ctx.fill();
	}
	ctx.restore();
}

/** A four-point sparkle, filled with the current fillStyle. */
export function star4( ctx, x, y, s ) {
	ctx.beginPath();
	ctx.moveTo( x, y - s );
	ctx.quadraticCurveTo( x, y, x + s, y );
	ctx.quadraticCurveTo( x, y, x, y + s );
	ctx.quadraticCurveTo( x, y, x - s, y );
	ctx.quadraticCurveTo( x, y, x, y - s );
	ctx.fill();
}

/** Seeded random generator (Park-Miller). */
export function seeded( seed ) {
	let s = Math.max( 1, Math.floor( seed ) % 2147483647 );
	return () => {
		s = ( s * 16807 ) % 2147483647;
		return s / 2147483647;
	};
}
