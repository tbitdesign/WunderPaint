/**
 * The shared look system of all Mystic Studio cards: four themes in the
 * Star Map spirit. A theme carries flat colors plus two style makers -
 * lineStyle() for ordinary strokes and foilStyle() for the showpiece
 * strokes (zodiac ring, constellation lines), which the foil theme turns
 * into a metallic gradient.
 */

export const THEMES = [
	{
		key: 'celestial',
		bg: [ '#0c0f1e', '#181f38' ],
		ink: '#ece7d9',
		accent: '#d4af37',
		dim: 'rgba(236,231,217,0.42)',
		faint: 'rgba(236,231,217,0.16)',
		soft: '#7fb3a3',
		hard: '#c46a5a',
		star: '#f2ecdc',
		dark: true,
	},
	{
		key: 'vintage',
		bg: [ '#f4ecdb', '#e9dcc2' ],
		ink: '#2e2820',
		accent: '#8a5a2b',
		dim: 'rgba(46,40,32,0.55)',
		faint: 'rgba(46,40,32,0.18)',
		soft: '#4f7355',
		hard: '#9c4a38',
		star: '#2e2820',
		dark: false,
	},
	{
		key: 'foil',
		bg: [ '#101015', '#1c1c26' ],
		ink: '#efe9db',
		accent: '#e6c56a',
		dim: 'rgba(239,233,219,0.42)',
		faint: 'rgba(239,233,219,0.15)',
		soft: '#9db89f',
		hard: '#c98d6b',
		star: '#f5efdf',
		dark: true,
		foil: [ '#8a6a1f', '#f4e09a', '#c9a13b', '#fdf6d8', '#8a6a1f' ],
	},
	{
		key: 'lineart',
		bg: [ '#ffffff', '#ffffff' ],
		ink: '#101014',
		accent: '#101014',
		dim: 'rgba(16,16,20,0.55)',
		faint: 'rgba(16,16,20,0.16)',
		soft: 'rgba(16,16,20,0.7)',
		hard: 'rgba(16,16,20,0.7)',
		star: '#101014',
		dark: false,
	},
	{
		key: 'rose',
		bg: [ '#f9f0ee', '#f3ddd8' ],
		ink: '#46292e',
		accent: '#b76e79',
		dim: 'rgba(70,41,46,0.55)',
		faint: 'rgba(70,41,46,0.16)',
		soft: '#6f8f7a',
		hard: '#a85a4a',
		star: '#46292e',
		dark: false,
		foil: [ '#8a4f57', '#eab7ab', '#c98d92', '#f9e0d7', '#8a4f57' ],
	},
	{
		key: 'silver',
		bg: [ '#0e1016', '#1b202c' ],
		ink: '#e9ecf2',
		accent: '#c3c9d6',
		dim: 'rgba(233,236,242,0.42)',
		faint: 'rgba(233,236,242,0.15)',
		soft: '#8fb3b0',
		hard: '#b07a8a',
		star: '#f0f2f7',
		dark: true,
		foil: [ '#6e7684', '#e2e6ee', '#aab2c0', '#f7f9fd', '#6e7684' ],
	},
	{
		key: 'emerald',
		bg: [ '#0a1510', '#132a1f' ],
		ink: '#eae7d8',
		accent: '#cba64f',
		dim: 'rgba(234,231,216,0.42)',
		faint: 'rgba(234,231,216,0.15)',
		soft: '#7fb394',
		hard: '#c07a5a',
		star: '#f1eddc',
		dark: true,
	},
	{
		key: 'amethyst',
		bg: [ '#150f23', '#26193c' ],
		ink: '#ece6f2',
		accent: '#b78fd6',
		dim: 'rgba(236,230,242,0.42)',
		faint: 'rgba(236,230,242,0.15)',
		soft: '#8fb3d6',
		hard: '#c9799e',
		star: '#f1e9f8',
		dark: true,
	},
];

export function themeByKey( key ) {
	return THEMES.find( ( t ) => t.key === key ) || THEMES[ 0 ];
}

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
export function foilStyle( ctx, w, h, theme ) {
	if ( ! theme.foil ) {
		return theme.accent;
	}
	const g = ctx.createLinearGradient( 0, 0, w, h );
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
