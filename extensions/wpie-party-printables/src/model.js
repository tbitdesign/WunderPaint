/**
 * The v3 params of a Party Printables sheet: sheet, theme, event, item,
 * photo. normalizeParams() fills defaults and migrates the 2.x shape
 * (one mode, one text, a palette id) so older groups keep opening.
 */
import { OCCASIONS } from './engine/theme.js';

export const SHEET_DEFAULTS = {
	format: 'a4',
	w: 210,
	h: 297,
	landscape: false,
	bleed: 0,
	marks: 'cut+fold',
	fit: 'auto',
	margin: 8,
	gap: 4,
	page: 1,
};
export const THEME_DEFAULTS = {
	occasion: 'birthday-kids',
	palette: '',
	brandKitId: '',
	pattern: { id: '', scale: 1, opacity: 0.35 },
	motif: '',
	displayFont: '',
	textFont: '',
};
export const EVENT_DEFAULTS = {
	title: '',
	subtitle: '',
	names: [],
	date: '',
	time: '',
	place: '',
	host: '',
	note: '',
};
export const PHOTO_DEFAULTS = { source: 'none', id: 0, url: '', items: [] };
export const OCCASION_IDS = OCCASIONS.map( ( o ) => o.id );

export const ITEM_DEFAULTS = {
	bunting: {
		text: 'HAPPY BIRTHDAY',
		shape: 'triangle',
		w: 90,
		h: 110,
		perRow: 3,
		motif: true,
		pattern: true,
	},
	letterbanner: { text: 'PARTY', w: 95, h: 140, motif: true, pattern: true },
	box: { size: 40, ribbon: true, span: 'face', pattern: true },
	tags: {
		text: 'Thank you',
		shape: 'tag',
		w: 50,
		h: 90,
		count: 8,
		motif: true,
		pattern: true,
	},
	toppers: {
		text: 'A',
		shape: 'circle',
		d: 50,
		count: 12,
		motif: true,
		pattern: true,
	},
	cupcakewrap: { scallop: true, count: 6, pattern: true, motif: true },
	placecards: { w: 90, h: 55, tent: true, motif: true, pattern: true },
	strawflags: { text: 'Cheers', w: 60, h: 30, count: 12, pattern: true },
	partyhat: { r: 110, pattern: true, motif: true },
	props: {
		text: 'Hi!',
		count: 6,
		kinds: 'moustache glasses lips hat bubble wand',
	},
	bottlelabels: {
		text: 'Aqua',
		w: 90,
		h: 60,
		count: 6,
		pattern: true,
		motif: true,
	},
	stickers: {
		shape: 'circle',
		d: 40,
		cols: 4,
		text: '',
		pattern: false,
		motif: true,
	},
	/* 3.1 cards and stationery */
	invitation: {
		text: 'You are warmly invited to',
		w: 148,
		h: 105,
		fold: false,
		motif: true,
		frame: true,
	},
	savethedate: { text: '', w: 148, h: 105, motif: true },
	thankyou: {
		text: 'Thank you\nfor celebrating with us.',
		w: 148,
		h: 105,
		motif: true,
	},
	reply: {
		text: 'Accepts with pleasure\nDeclines with regret',
		by: '',
		w: 90,
		h: 64,
		motif: true,
	},
	menu: {
		text: 'Starter\nBurrata with tomatoes\nPumpkin soup\n\nMain\nRoast chicken with rosemary\nMushroom risotto\n\nDessert\nLemon tart',
		title: '',
		w: 148,
		h: 210,
		motif: true,
		pattern: true,
	},
	drinks: {
		text: 'Cocktails\nAperol Spritz\nGin Basil Smash\n\nWine\nRiesling\nPinot Noir\n\nWithout alcohol\nHomemade lemonade',
		title: '',
		w: 148,
		h: 210,
		motif: true,
		pattern: true,
	},
	program: {
		text: '14:00 Ceremony\n15:00 Champagne and photos\n17:00 Dinner\n20:00 First dance\n21:00 Party',
		title: '',
		w: 148,
		h: 210,
		motif: true,
		pattern: true,
	},
	tablenumbers: {
		count: 10,
		start: 1,
		w: 100,
		h: 100,
		tent: true,
		motif: true,
	},
	seating: {
		text: 'Table 1: Anna, Ben, Clara, David\nTable 2: Emma, Felix, Greta, Henry\nTable 3: Ida, Jonas, Klara, Lukas',
		title: '',
		w: 194,
		h: 281,
		cols: 0,
		motif: true,
	},
	welcome: { text: 'Welcome', w: 194, h: 281, motif: true },
	signpost: {
		text: 'Party\nRestrooms\nParking',
		direction: 'right',
		w: 190,
		h: 70,
		motif: true,
		pattern: true,
	},
	voucher: {
		text: 'One breakfast in bed',
		count: 3,
		start: 1,
		w: 150,
		h: 70,
		motif: true,
	},
	tickets: {
		text: 'Admit one',
		mode: 'ticket',
		count: 8,
		start: 1,
		w: 150,
		h: 60,
		motif: true,
	},
	addresslabels: { text: '', w: 63.5, h: 38.1, motif: true, pattern: true },
	envelope: { text: '', w: 162, h: 114, motif: true, pattern: true },
	/* 3.1 gifts and favors */
	wrapping: { text: '', fill: 1, dark: false, motif: true, pattern: true },
	glassmarkers: {
		text: 'Cheers',
		d: 45,
		count: 8,
		motif: true,
		pattern: true,
	},
	napkinrings: {
		text: 'Enjoy',
		w: 180,
		h: 45,
		count: 6,
		motif: true,
		pattern: true,
	},
	coasters: {
		text: 'Cheers',
		shape: 'circle',
		d: 90,
		count: 6,
		motif: true,
		pattern: true,
	},
	bagtoppers: {
		text: 'Thank you for coming',
		w: 90,
		h: 45,
		count: 6,
		motif: true,
		pattern: true,
	},
	chocolate: {
		text: 'Sweet thanks',
		barW: 75,
		barH: 155,
		depth: 8,
		count: 2,
		motif: true,
		pattern: true,
	},
	jamlabels: {
		text: 'Strawberry jam\nhomemade with love',
		shape: 'circle',
		w: 60,
		h: 60,
		count: 8,
		motif: true,
		pattern: true,
	},
	candlewrap: {
		text: 'Light and love',
		w: 190,
		h: 60,
		count: 4,
		motif: true,
		pattern: true,
	},
	/* 3.2 decor */
	garland: { shape: 'circle', d: 60, count: 12, motif: true, pattern: true },
	fan: { w: 190, h: 100, step: 15, count: 4, motif: true, pattern: true },
	photoframe: {
		text: 'Our day',
		w: 150,
		h: 200,
		winW: 100,
		winH: 150,
		motif: true,
		pattern: true,
	},
	crown: {
		text: '',
		w: 170,
		h: 90,
		parts: 3,
		points: 4,
		motif: true,
		pattern: true,
	},
	caketopper: {
		text: '6\nMia',
		shape: 'banner',
		w: 140,
		h: 70,
		motif: true,
		pattern: true,
	},
	lantern: { window: 'star', w: 190, h: 80, count: 3, pattern: true },
	doorhanger: {
		text: 'Party\nin progress',
		w: 90,
		h: 230,
		count: 2,
		motif: true,
		pattern: true,
	},
	countdown: {
		shape: 'circle',
		d: 50,
		from: 1,
		to: 24,
		motif: true,
		pattern: true,
	},
	confetti: { shape: 'circle', d: 20 },
	/* 3.2 games */
	bingo: {
		mode: 'numbers',
		text: 'Cake\nBalloon\nCandle\nGift\nGame\nSong\nDance\nHat\nConfetti\nCard\nWish\nSmile\nPhoto\nToast\nFriend\nMusic',
		grid: 4,
		count: 6,
		seed: 1,
		d: 90,
		title: '',
		pattern: true,
	},
	scavenger: {
		text: 'Find something red\nTake a photo with the host\nCollect three leaves\nFind a guest born in May\nSpot the hidden balloon\nMake someone laugh',
		title: '',
		w: 63,
		h: 88,
		motif: true,
	},
	questions: {
		text: 'Would you rather fly or be invisible?\nWhat was your first concert?\nWhich song gets you on the dance floor?\nWhat is the best gift you ever got?\nWho would play you in a film?\nWhat is your hidden talent?',
		title: '',
		w: 63,
		h: 88,
		motif: true,
	},
	headbands: {
		text: 'Sherlock Holmes\nPippi Longstocking\nDarth Vader\nMary Poppins\nA giraffe\nThe Eiffel Tower',
		title: '',
		w: 88,
		h: 63,
		motif: true,
	},
	memory: { side: 'front', pairs: 12, d: 50, pattern: true },
	quartet: {
		text: 'A | Grandpa | Age 74 | Height 1.80 m | Jokes 100\nA | Grandma | Age 71 | Height 1.65 m | Jokes 40\nA | Dad | Age 45 | Height 1.85 m | Jokes 12\nA | Mom | Age 43 | Height 1.70 m | Jokes 80\nB | Mia | Age 6 | Height 1.15 m | Jokes 300\nB | Leo | Age 9 | Height 1.35 m | Jokes 250\nB | Ada | Age 4 | Height 1.05 m | Jokes 500\nB | Noah | Age 11 | Height 1.45 m | Jokes 90',
		w: 63,
		h: 88,
	},
	deck: { text: '', side: 'front', w: 63, h: 88, pattern: true },
	scoreboard: { text: '', rounds: 10, w: 194, h: 281, motif: true },
	chess: {
		board: 'chess',
		text: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1\ne7-e5\nmark e4',
		lines: 19,
		d: 120,
		coords: true,
		caption: '',
	},
	tactics: {
		sport: 'football',
		text: 'X1 6 50\nX4 25 30\nX5 25 70\nX8 45 50\nX9 60 40\nX11 60 60\nO 70 45\nO 75 55\n> 45 50 62 35\n~ 60 40 60 60\n* 60 40',
		title: '',
		w: 180,
		h: 120,
	},
	/* 3.3 more games, puzzles and awards */
	boardgame: {
		text: 'Move ahead 3\nGo back 2\nSkip a turn\nRoll again',
		title: '',
		seed: 1,
		w: 194,
		h: 281,
		motif: true,
	},
	dice: {
		mode: 'dots',
		text: 'Sing\nDance\nTell a joke\nHug someone\nMake a wish\nRoll again',
		size: 40,
		count: 2,
	},
	domino: { w: 25, h: 50 },
	secretcode: {
		text: 'The treasure is under the big tree\nLook behind the red door',
		seed: 1,
		w: 148,
		h: 105,
	},
	fortuneteller: {
		text: 'You will get cake\nA surprise is coming\nSing a song\nDance with the host\nYou win a prize\nTell a secret\nHug your neighbour\nMake a wish',
		s: 190,
		count: 1,
		motif: true,
	},
	bracket: { text: '', slots: 8, w: 281, h: 194, motif: true },
	guessphoto: { text: '', w: 63, h: 88 },
	wordsearch: {
		text: 'Cake\nBalloon\nCandle\nPresent\nConfetti\nMusic\nDance\nFriends\nParty\nWish',
		title: '',
		grid: 12,
		seed: 1,
		solution: true,
		w: 148,
		h: 210,
	},
	maze: {
		text: '',
		level: 'easy',
		seed: 1,
		solution: true,
		w: 194,
		h: 281,
		motif: true,
	},
	sudoku: { text: '', n: 9, level: 'easy', seed: 1, solution: true, d: 120 },
	coloring: { text: '', w: 194, h: 281 },
	placemat: { text: '', seed: 1, w: 281, h: 194 },
	playmoney: {
		text: '1\n5\n10\n20\n50\n100',
		copies: 3,
		w: 140,
		h: 70,
		motif: true,
	},
	certificate: {
		text: 'Best dancer of the night',
		w: 281,
		h: 194,
		motif: true,
	},
	medals: { text: '1\n2\n3', d: 70, motif: true },
};

export const FORMAT_OPTIONS = [
	{ value: 'a4', label: 'A4' },
	{ value: 'a5', label: 'A5' },
	{ value: 'a3', label: 'A3' },
	{ value: 'letter', label: 'US Letter' },
	{ value: 'legal', label: 'US Legal' },
	{ value: 'custom', label: 'Custom size' },
];
export const MARK_OPTIONS = [
	{ value: 'cut', label: 'Cut marks' },
	{ value: 'cut+fold', label: 'Cut marks and fold lines' },
	{ value: 'none', label: 'No marks' },
];
export const PHOTO_SOURCES = [
	{ value: 'none', label: 'No photo' },
	{ value: 'document', label: 'Whole document' },
	{ value: 'selection', label: 'Selected layer' },
	{ value: 'media', label: 'Media Library' },
];

/* 2.x mode/card ids -> v3 item types (the ids stayed the same). */
const V2_ITEMS = [
	'bunting',
	'letterbanner',
	'box',
	'tags',
	'toppers',
	'cupcakewrap',
	'placecards',
	'strawflags',
	'partyhat',
	'props',
	'bottlelabels',
	'stickers',
];
const V2_PALETTES = {
	party: 'confetti',
	pastel: 'pastel',
	gold: 'gold-cream',
	rose: 'blush',
	mint: 'mint',
	mono: 'slate',
};

const defined = ( o ) =>
	Object.fromEntries(
		Object.entries( o || {} ).filter( ( [ , v ] ) => undefined !== v )
	);
const namesOf = ( v ) =>
	( Array.isArray( v ) ? v : String( v || '' ).split( '\n' ) )
		.map( ( s ) => String( s ).trim() )
		.filter( Boolean );

export function itemDefaults( type ) {
	const t = ITEM_DEFAULTS[ type ] ? type : 'bunting';
	return { type: t, ...ITEM_DEFAULTS[ t ] };
}

function fromV2( s ) {
	const type = V2_ITEMS.includes( s.mode )
		? s.mode
		: V2_ITEMS.includes( s.card )
		? s.card
		: 'bunting';
	const item = { type };
	if ( 'string' === typeof s.text && s.text ) {
		item.text = s.text;
	}
	for ( const k of [ 'shape', 'perRow', 'cols', 'scallop', 'ribbon' ] ) {
		if ( undefined !== s[ k ] ) {
			item[ k ] = s[ k ];
		}
	}
	if ( 'swallow' === item.shape ) {
		item.shape = 'swallowtail';
	}
	if ( 'net' === s.imageSpan ) {
		item.span = 'net';
	}
	const custom = ( s.customColors || [] ).filter( Boolean );
	let palette = V2_PALETTES[ s.paletteId ] || '';
	if ( s.useBrand ) {
		palette = 'brand';
	} else if ( custom.length >= 2 ) {
		palette = {
			primary: custom[ 0 ],
			secondary: custom[ 1 ] || custom[ 0 ],
			accent: custom[ 2 ] || custom[ 1 ] || custom[ 0 ],
			ink: custom[ 3 ] || '',
		};
	}
	return normalizeParams( {
		v: 3,
		theme: {
			occasion: 'birthday-kids',
			palette,
			brandKitId: s.brandKitId || '',
		},
		event: {
			names: namesOf( s.names ),
			title: 'placecards' === type ? '' : '',
		},
		item,
		photo: {
			source:
				'media' === s.source && s.image
					? 'media'
					: 'none' === s.source || ! s.source
					? 'none'
					: s.source,
			id: s.image && s.image.id ? s.image.id : 0,
		},
	} );
}

export function normalizeParams( p ) {
	const src = p || {};
	if ( ! src.v && ( src.mode || src.card || src.paletteId ) ) {
		return fromV2( src );
	}
	const itemIn = src.item || {};
	const item = { ...itemDefaults( itemIn.type ), ...defined( itemIn ) };
	item.type = ITEM_DEFAULTS[ item.type ] ? item.type : 'bunting';
	const theme = { ...THEME_DEFAULTS, ...defined( src.theme ) };
	theme.pattern = {
		...THEME_DEFAULTS.pattern,
		...defined( src.theme && src.theme.pattern ),
	};
	if ( ! OCCASION_IDS.includes( theme.occasion ) ) {
		theme.occasion = THEME_DEFAULTS.occasion;
	}
	const event = { ...EVENT_DEFAULTS, ...defined( src.event ) };
	event.names = namesOf( event.names );
	const sheet = { ...SHEET_DEFAULTS, ...defined( src.sheet ) };
	return {
		v: 3,
		sheet,
		theme,
		event,
		item,
		photo: { ...PHOTO_DEFAULTS, ...defined( src.photo ) },
	};
}
