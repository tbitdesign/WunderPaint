/**
 * Occasions, palettes and the resolved theme. A palette is five colours:
 * background, primary, secondary, accent and ink. An occasion picks a
 * palette, a pattern, a motif and two fonts; every one of them can be
 * changed afterwards. 'brand' takes the colours of the first brand kit.
 */
export const PALETTES = [
	{
		id: 'confetti',
		label: 'Confetti',
		bg: '#fffdf7',
		primary: '#ff6b6b',
		secondary: '#4ecdc4',
		accent: '#ffd93d',
		ink: '#2b2d42',
	},
	{
		id: 'pastel',
		label: 'Pastel',
		bg: '#fffaf5',
		primary: '#f8b4c8',
		secondary: '#b5e2fa',
		accent: '#fdf3a3',
		ink: '#4a4458',
	},
	{
		id: 'candy',
		label: 'Candy',
		bg: '#fff5fa',
		primary: '#ff4f9a',
		secondary: '#7ad0ff',
		accent: '#ffe36e',
		ink: '#3a2a4d',
	},
	{
		id: 'rainbow',
		label: 'Rainbow',
		bg: '#ffffff',
		primary: '#ef476f',
		secondary: '#118ab2',
		accent: '#ffd166',
		ink: '#073b4c',
	},
	{
		id: 'blush',
		label: 'Blush',
		bg: '#fff7f5',
		primary: '#e8a0a8',
		secondary: '#f3d3c6',
		accent: '#c9a96e',
		ink: '#5a3d45',
	},
	{
		id: 'sage',
		label: 'Sage',
		bg: '#f8faf6',
		primary: '#9caf88',
		secondary: '#d9e2cf',
		accent: '#c9a96e',
		ink: '#3f4a3c',
	},
	{
		id: 'navy-gold',
		label: 'Navy and gold',
		bg: '#fbf8f1',
		primary: '#1f2a44',
		secondary: '#8a9bb8',
		accent: '#c9a227',
		ink: '#1a2238',
	},
	{
		id: 'blush-gold',
		label: 'Blush and gold',
		bg: '#fffaf7',
		primary: '#f1c4c4',
		secondary: '#f9e5e0',
		accent: '#d4af37',
		ink: '#5b4a4a',
	},
	{
		id: 'dusty-rose',
		label: 'Dusty rose',
		bg: '#fbf6f4',
		primary: '#c98b8b',
		secondary: '#e9cfcf',
		accent: '#8a9a7b',
		ink: '#4c3a3a',
	},
	{
		id: 'eucalyptus',
		label: 'Eucalyptus',
		bg: '#f7faf8',
		primary: '#7fa08c',
		secondary: '#c5d6c9',
		accent: '#e6c79c',
		ink: '#324338',
	},
	{
		id: 'terracotta',
		label: 'Terracotta',
		bg: '#fdf6ef',
		primary: '#c96f4a',
		secondary: '#e8b89d',
		accent: '#7e9c8a',
		ink: '#4a2f24',
	},
	{
		id: 'ocean',
		label: 'Ocean',
		bg: '#f3f9fb',
		primary: '#1b6ca8',
		secondary: '#7fc8e8',
		accent: '#f4a259',
		ink: '#12334a',
	},
	{
		id: 'sunflower',
		label: 'Sunflower',
		bg: '#fffdf2',
		primary: '#f7b801',
		secondary: '#7fb069',
		accent: '#d95d39',
		ink: '#3b2f1e',
	},
	{
		id: 'lavender',
		label: 'Lavender',
		bg: '#faf7fd',
		primary: '#a78bd8',
		secondary: '#d9cdef',
		accent: '#f4c2c2',
		ink: '#3f3352',
	},
	{
		id: 'mint',
		label: 'Mint',
		bg: '#f4fbf8',
		primary: '#5cc8a1',
		secondary: '#bfead9',
		accent: '#ff9f80',
		ink: '#2f4a41',
	},
	{
		id: 'peach',
		label: 'Peach',
		bg: '#fff8f3',
		primary: '#ffb088',
		secondary: '#ffd8c2',
		accent: '#7bc2b4',
		ink: '#4d3a30',
	},
	{
		id: 'forest',
		label: 'Forest',
		bg: '#f6f8f4',
		primary: '#2f5d3a',
		secondary: '#8fb996',
		accent: '#c94f4f',
		ink: '#1f2f22',
	},
	{
		id: 'cranberry',
		label: 'Cranberry and pine',
		bg: '#fbf7f2',
		primary: '#9b1b30',
		secondary: '#2e5e4e',
		accent: '#d4af37',
		ink: '#2b1a1f',
	},
	{
		id: 'gold-cream',
		label: 'Gold and cream',
		bg: '#fdf9ee',
		primary: '#c9a227',
		secondary: '#efe2bd',
		accent: '#8b6f2f',
		ink: '#3d3220',
	},
	{
		id: 'midnight',
		label: 'Midnight',
		bg: '#f4f4fa',
		primary: '#1c1f4a',
		secondary: '#4b4f8a',
		accent: '#f2c94c',
		ink: '#111330',
	},
	{
		id: 'silver-blue',
		label: 'Silver and blue',
		bg: '#f6f8fb',
		primary: '#3a5ba0',
		secondary: '#c3cfe2',
		accent: '#9aa5b8',
		ink: '#22304a',
	},
	{
		id: 'spring',
		label: 'Spring',
		bg: '#fbfef5',
		primary: '#a3d977',
		secondary: '#f9e79f',
		accent: '#f4a6c8',
		ink: '#3a4a2a',
	},
	{
		id: 'meadow',
		label: 'Meadow',
		bg: '#f7fbf3',
		primary: '#6bbf59',
		secondary: '#c7e8b0',
		accent: '#f2c14e',
		ink: '#2f4a2a',
	},
	{
		id: 'pumpkin',
		label: 'Pumpkin',
		bg: '#1d1a24',
		primary: '#f26b1d',
		secondary: '#7b3fa0',
		accent: '#b6e35a',
		ink: '#f7f2e8',
	},
	{
		id: 'candy-corn',
		label: 'Candy corn',
		bg: '#fff8ec',
		primary: '#f28c28',
		secondary: '#4a2a5a',
		accent: '#f7d94c',
		ink: '#2a1f2e',
	},
	{
		id: 'corporate',
		label: 'Corporate blue',
		bg: '#ffffff',
		primary: '#1f4e79',
		secondary: '#9dc3e6',
		accent: '#f0a500',
		ink: '#1a2a3a',
	},
	{
		id: 'slate',
		label: 'Slate',
		bg: '#f7f7f7',
		primary: '#475569',
		secondary: '#cbd5e1',
		accent: '#f59e0b',
		ink: '#1e293b',
	},
	{
		id: 'coral',
		label: 'Coral',
		bg: '#fff7f4',
		primary: '#ff7f66',
		secondary: '#ffd1c4',
		accent: '#2ec4b6',
		ink: '#3d2b2b',
	},
	{
		id: 'lemon',
		label: 'Lemon',
		bg: '#fffef0',
		primary: '#ffd23f',
		secondary: '#fff3a3',
		accent: '#3bceac',
		ink: '#3a3a1a',
	},
	{
		id: 'chalk',
		label: 'Chalk',
		bg: '#25332b',
		primary: '#f7f2e8',
		secondary: '#c9d1c5',
		accent: '#ffd166',
		ink: '#f7f2e8',
	},
];

export const OCCASIONS = [
	{
		id: 'birthday-kids',
		label: 'Kids birthday',
		palette: 'confetti',
		pattern: 'confetti',
		motif: 'balloon',
		displayFont: 'Fredoka',
		textFont: 'Nunito',
	},
	{
		id: 'birthday',
		label: 'Birthday',
		palette: 'coral',
		pattern: 'dots',
		motif: 'cake',
		displayFont: 'Lobster',
		textFont: 'Nunito',
	},
	{
		id: 'wedding',
		label: 'Wedding',
		palette: 'blush-gold',
		pattern: 'blooms',
		motif: 'rings',
		displayFont: 'Great Vibes',
		textFont: 'Cormorant Garamond',
	},
	{
		id: 'baby',
		label: 'Baby shower',
		palette: 'pastel',
		pattern: 'stars',
		motif: 'pram',
		displayFont: 'Baloo 2',
		textFont: 'Nunito',
	},
	{
		id: 'christening',
		label: 'Christening',
		palette: 'silver-blue',
		pattern: 'rings',
		motif: 'dove',
		displayFont: 'Cormorant Garamond',
		textFont: 'Lato',
	},
	{
		id: 'school',
		label: 'First day of school',
		palette: 'rainbow',
		pattern: 'check',
		motif: 'schoolcone',
		displayFont: 'Fredoka',
		textFont: 'Nunito',
	},
	{
		id: 'graduation',
		label: 'Graduation',
		palette: 'navy-gold',
		pattern: 'diamonds',
		motif: 'mortarboard',
		displayFont: 'Playfair Display',
		textFont: 'Lato',
	},
	{
		id: 'retirement',
		label: 'Retirement',
		palette: 'slate',
		pattern: 'waves',
		motif: 'compass',
		displayFont: 'Playfair Display',
		textFont: 'Source Sans 3',
	},
	{
		id: 'anniversary',
		label: 'Anniversary',
		palette: 'gold-cream',
		pattern: 'hearts',
		motif: 'heart',
		displayFont: 'Great Vibes',
		textFont: 'Lato',
	},
	{
		id: 'christmas',
		label: 'Christmas',
		palette: 'cranberry',
		pattern: 'snowflakes',
		motif: 'tree',
		displayFont: 'Lobster',
		textFont: 'Nunito',
	},
	{
		id: 'newyear',
		label: 'New Year',
		palette: 'midnight',
		pattern: 'stars',
		motif: 'champagne',
		displayFont: 'Cinzel',
		textFont: 'Lato',
	},
	{
		id: 'easter',
		label: 'Easter',
		palette: 'spring',
		pattern: 'eggs',
		motif: 'bunny',
		displayFont: 'Pacifico',
		textFont: 'Nunito',
	},
	{
		id: 'halloween',
		label: 'Halloween',
		palette: 'pumpkin',
		pattern: 'pumpkins',
		motif: 'pumpkin',
		displayFont: 'Creepster',
		textFont: 'Nunito',
	},
	{
		id: 'corporate',
		label: 'Company event',
		palette: 'corporate',
		pattern: 'chevron',
		motif: 'star',
		displayFont: 'Montserrat',
		textFont: 'Open Sans',
	},
	{
		id: 'summer',
		label: 'Summer party',
		palette: 'ocean',
		pattern: 'waves',
		motif: 'sun',
		displayFont: 'Pacifico',
		textFont: 'Nunito',
	},
	{
		id: 'mothersday',
		label: "Mother's Day",
		palette: 'dusty-rose',
		pattern: 'leaves',
		motif: 'flower',
		displayFont: 'Great Vibes',
		textFont: 'Lato',
	},
];

export const PATTERN_IDS = [
	'none',
	'confetti',
	'stripes',
	'dots',
	'stars',
	'hearts',
	'check',
	'chevron',
	'leaves',
	'snowflakes',
	'pumpkins',
	'eggs',
	'rings',
	'blooms',
	'waves',
	'diamonds',
];

export const paletteById = ( id ) =>
	PALETTES.find( ( p ) => p.id === id ) || PALETTES[ 0 ];
export const occasionById = ( id ) =>
	OCCASIONS.find( ( o ) => o.id === id ) || OCCASIONS[ 0 ];

const normHex = ( c ) => {
	const s = String( c || '' )
		.trim()
		.toLowerCase();
	if ( /^#[0-9a-f]{6}$/.test( s ) ) {
		return s;
	}
	const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec( s );
	return m ? '#' + m[ 1 ] + m[ 1 ] + m[ 2 ] + m[ 2 ] + m[ 3 ] + m[ 3 ] : null;
};
const lum = ( h ) => {
	const n = parseInt( h.slice( 1 ), 16 );
	return (
		0.299 * ( ( n >> 16 ) & 255 ) +
		0.587 * ( ( n >> 8 ) & 255 ) +
		0.114 * ( n & 255 )
	);
};

/** Colours from a brand kit: lightest is the paper, darkest the ink, the rest primary, secondary, accent. */
export function brandColors( kits, kitId ) {
	const list = Array.isArray( kits ) ? kits : [];
	const kit = ( kitId && list.find( ( k ) => k.id === kitId ) ) || list[ 0 ];
	const cols = ( ( kit && kit.colors ) || [] )
		.map( normHex )
		.filter( Boolean );
	if ( cols.length < 2 ) {
		return null;
	}
	const byLum = [ ...cols ].sort( ( a, b ) => lum( a ) - lum( b ) );
	const ink = byLum[ 0 ];
	let bg = byLum[ byLum.length - 1 ];
	if ( lum( bg ) - lum( ink ) < 60 ) {
		bg = '#ffffff';
	}
	const mid = byLum.slice( 1, -1 );
	const primary = mid[ 0 ] || ink;
	const secondary = mid[ 1 ] || primary;
	const accent = mid[ 2 ] || secondary;
	return { bg, primary, secondary, accent, ink };
}

export function resolveTheme( theme, kits ) {
	const t = theme || {};
	const occ = occasionById( t.occasion );
	let colors;
	if ( 'brand' === t.palette ) {
		colors =
			brandColors( kits, t.brandKitId ) || paletteById( occ.palette );
	} else if ( t.palette && 'object' === typeof t.palette ) {
		const base = paletteById( occ.palette );
		colors = {
			bg: t.palette.bg || base.bg,
			primary: t.palette.primary || base.primary,
			secondary: t.palette.secondary || base.secondary,
			accent: t.palette.accent || base.accent,
			ink: t.palette.ink || base.ink,
		};
	} else {
		colors = paletteById( t.palette || occ.palette );
	}
	const { bg, primary, secondary, accent, ink } = colors;
	const pattern =
		t.pattern && 'object' === typeof t.pattern
			? t.pattern
			: { id: occ.pattern };
	return {
		occasion: occ.id,
		colors: { bg, primary, secondary, accent, ink },
		pattern: {
			id: pattern.id || occ.pattern,
			scale: pattern.scale || 1,
			opacity: undefined === pattern.opacity ? 0.35 : pattern.opacity,
		},
		motif: t.motif || occ.motif,
		displayFont: t.displayFont || occ.displayFont,
		textFont: t.textFont || occ.textFont,
	};
}
