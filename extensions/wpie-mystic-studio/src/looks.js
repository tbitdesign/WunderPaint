/**
 * Looks: curated starting points that set the whole poster at once -
 * theme, backdrop, star density, frame, layout and the two typefaces.
 * Every field stays editable afterwards; a look is only a preset.
 * shuffleLook() rolls a new, still harmonious combination.
 */

import { THEMES, seeded } from './themes.js';
import { BACKDROPS } from './backdrop.js';
import { FRAMES } from './frames.js';

/** Title faces with the weight they look best in (all in the catalog). */
export const TITLE_FONTS = [
	{ family: 'Cinzel', weight: 600, track: 0.06 },
	{ family: 'Cormorant Garamond', weight: 600, track: 0.02 },
	{ family: 'Playfair Display', weight: 600, track: 0.01 },
	{ family: 'Italiana', weight: 400, track: 0.05 },
	{ family: 'Marcellus', weight: 400, track: 0.05 },
	{ family: 'Bodoni Moda', weight: 500, track: 0.02 },
	{ family: 'DM Serif Display', weight: 400, track: 0.01 },
	{ family: 'Josefin Sans', weight: 300, track: 0.12 },
	{ family: 'Poiret One', weight: 400, track: 0.08 },
	{ family: 'Great Vibes', weight: 400, track: 0 },
];

export const titleFontOf = ( family ) =>
	TITLE_FONTS.find( ( f ) => f.family === family ) || {
		family,
		weight: 600,
		track: 0.02,
	};

export const LOOKS = [
	{
		key: 'midnight-gold',
		label: 'Midnight Gold',
		theme: 'celestial',
		backdrop: 'sky',
		stars: 60,
		frame: 'double',
		titleFont: 'Cinzel',
		textFont: 'Inter',
		titleFoil: true,
	},
	{
		key: 'gold-foil',
		label: 'Gold Foil',
		theme: 'foil',
		backdrop: 'plain',
		stars: 35,
		frame: 'deco',
		titleFont: 'Cinzel',
		textFont: 'Inter',
		titleFoil: true,
	},
	{
		key: 'amethyst-dream',
		label: 'Amethyst Dream',
		theme: 'amethyst',
		backdrop: 'nebula',
		stars: 70,
		frame: 'celestial',
		titleFont: 'Cormorant Garamond',
		textFont: 'Inter',
		titleFoil: true,
	},
	{
		key: 'aurora',
		label: 'Aurora',
		theme: 'midnight',
		backdrop: 'aurora',
		stars: 65,
		frame: 'none',
		titleFont: 'Josefin Sans',
		textFont: 'Inter',
		titleFoil: false,
	},
	{
		key: 'silver-night',
		label: 'Silver Night',
		theme: 'silver',
		backdrop: 'nebula',
		stars: 75,
		frame: 'stars',
		titleFont: 'Italiana',
		textFont: 'Inter',
		titleFoil: true,
	},
	{
		key: 'almanac',
		label: 'Almanac',
		theme: 'vintage',
		backdrop: 'paper',
		stars: 30,
		frame: 'line',
		titleFont: 'Playfair Display',
		textFont: 'Lora',
		titleFoil: false,
	},
	{
		key: 'rose-quartz',
		label: 'Rose Quartz',
		theme: 'rose',
		backdrop: 'paper',
		stars: 25,
		frame: 'arch',
		titleFont: 'Cormorant Garamond',
		textFont: 'Inter',
		titleFoil: true,
	},
	{
		key: 'emerald-temple',
		label: 'Emerald Temple',
		theme: 'emerald',
		backdrop: 'dusk',
		stars: 50,
		frame: 'arch',
		titleFont: 'Cinzel',
		textFont: 'Inter',
		titleFoil: true,
	},
	{
		key: 'line-art',
		label: 'Line Art',
		theme: 'lineart',
		backdrop: 'plain',
		stars: 15,
		frame: 'line',
		titleFont: 'Josefin Sans',
		textFont: 'Inter',
		titleFoil: false,
	},
	{
		key: 'terracotta-sun',
		label: 'Terracotta Sun',
		theme: 'terracotta',
		backdrop: 'paper',
		stars: 20,
		frame: 'moons',
		titleFont: 'DM Serif Display',
		textFont: 'Inter',
		titleFoil: false,
	},
	{
		key: 'herbal',
		label: 'Herbal',
		theme: 'sage',
		backdrop: 'paper',
		stars: 20,
		frame: 'double',
		titleFont: 'Marcellus',
		textFont: 'Lora',
		titleFoil: false,
	},
	{
		key: 'noir',
		label: 'Noir',
		theme: 'noir',
		backdrop: 'plain',
		stars: 30,
		frame: 'zodiac',
		titleFont: 'Bodoni Moda',
		textFont: 'Inter',
		titleFoil: true,
	},
	{
		key: 'cosmic-pop',
		label: 'Cosmic Pop',
		theme: 'cosmic',
		backdrop: 'nebula',
		stars: 85,
		frame: 'stars',
		titleFont: 'Poiret One',
		textFont: 'Inter',
		titleFoil: false,
	},
	{
		key: 'tide',
		label: 'Tide',
		theme: 'ocean',
		backdrop: 'aurora',
		stars: 45,
		frame: 'moons',
		titleFont: 'Marcellus',
		textFont: 'Inter',
		titleFoil: true,
	},
	{
		key: 'desert',
		label: 'Desert',
		theme: 'sand',
		backdrop: 'dusk',
		stars: 30,
		frame: 'zodiac',
		titleFont: 'Italiana',
		textFont: 'Inter',
		titleFoil: true,
	},
	{
		key: 'love-letter',
		label: 'Love Letter',
		theme: 'rose',
		backdrop: 'dusk',
		stars: 35,
		frame: 'double',
		titleFont: 'Great Vibes',
		textFont: 'Inter',
		titleFoil: true,
	},
];

export const lookByKey = ( key ) =>
	LOOKS.find( ( l ) => l.key === key ) || null;

/** The look fields a preset writes into the parameters. */
export function lookParams( look ) {
	return {
		look: look.key,
		theme: look.theme,
		custom: null,
		backdrop: look.backdrop,
		stars: look.stars,
		frame: look.frame,
		titleFont: look.titleFont,
		textFont: look.textFont,
		titleFoil: look.titleFoil,
	};
}

/**
 * A random, still harmonious look: paper backdrops only on light themes,
 * aurora and nebula only on dark ones, script titles never with the
 * busier frames.
 *
 * @param {number} seed Any integer.
 * @return {Object} Look parameters (with a fresh star seed).
 */
export function shuffleLook( seed ) {
	const rnd = seeded( ( seed >>> 0 ) * 2654435761 + 7 );
	const pick = ( list ) => list[ Math.floor( rnd() * list.length ) ];
	const theme = pick( THEMES );
	const backdrops = BACKDROPS.filter( ( b ) =>
		theme.dark ? 'paper' !== b : 'aurora' !== b && 'nebula' !== b
	);
	const font = pick( TITLE_FONTS );
	const frames = FRAMES.filter(
		( f ) =>
			! (
				'Great Vibes' === font.family &&
				[ 'zodiac', 'deco' ].includes( f )
			)
	);
	return {
		look: '',
		theme: theme.key,
		custom: null,
		backdrop: pick( backdrops ),
		stars: Math.round( 20 + rnd() * 70 ),
		frame: pick( frames ),
		titleFont: font.family,
		textFont: rnd() < 0.25 ? 'Lora' : 'Inter',
		titleFoil: !! theme.foil || rnd() < 0.5,
		seed: 1 + Math.floor( rnd() * 9999 ),
	};
}
