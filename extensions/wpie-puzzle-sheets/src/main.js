/**
 * WPIE extension: Puzzle Sheets (v2 dialog).
 *
 * Six printable puzzle types, computed locally: word search, mazes in
 * eight shapes (including the silhouette of an image), sudoku with a
 * guaranteed unique solution, criss-cross word grids, number
 * cryptograms and addition pyramids - each with an optional solution
 * sheet. Colors from ten palettes, the brand kit or custom colors;
 * titles use the editor font catalog, all text fields are multi-line.
 */

import {
	PALETTES,
	MAZE_SHAPES,
	colorsFor,
	buildWordSearch,
	renderWordSearch,
	buildMaze,
	renderMaze,
	buildSudoku,
	renderSudoku,
	buildCrissCross,
	renderCrissCross,
	buildCryptogram,
	renderCryptogram,
	buildPyramid,
	renderPyramid,
	buildBingo,
	renderBingo,
	renderJigsaw,
	buildDot2Dot,
	renderDot2Dot,
	buildCrosswordClues,
	renderCrossword,
	buildNonogram,
	renderNonogram,
	buildAnagram,
	renderAnagram,
	renderGameSheet,
	buildMemory,
	renderMemory,
} from './puzzle-engine.js';

const GEN_ID = 'wpie-puzzle-sheets/sheet';

const DEFAULTS = {
	mode: 'wordsearch',
	title: '',
	words: 'SUMMER\nBEACH\nSUN\nHOLIDAY\nICECREAM\nFAMILY',
	phrase: 'HAVE FUN',
	size: 14,
	hard: false,
	shape: 'heart',
	letter: 'A',
	cells: 21,
	sudokuSize: 9,
	sudokuDiff: 2,
	cryptoDiff: 2,
	pyrRows: 6,
	pyrDiff: 2,
	bingoGrid: 4,
	bingoCards: 4,
	bingoFree: true,
	jigCols: 5,
	dotsN: 60,
	nonoShape: 'image',
	nonoSize: 15,
	anagHint: true,
	memPairs: 8,
	memMotifs: '🍎 🌟 🎈 🐟 🌸 🚗 🎁 ⚽ 🦋 🍩 🌈 🐢',
	game: 'slf',
	slfCats: 'City\nCountry\nRiver\nName\nAnimal\nFood',
	slfRounds: 10,
	boxCols: 16,
	packWS: true,
	packCC: true,
	packMaze: true,
	packAnagram: true,
	packBingo: true,
	packPyramid: true,
	clues: 'SUN: It shines in the sky\nBEACH: Sand meets the sea\nHOLIDAY: The best weeks of the year\nICECREAM: Cold and sweet\nFAMILY: The people you love',
	seed: 7,
	withSolution: true,
	paletteId: 'party',
	useBrand: false,
	brandKitId: '',
	customColors: [],
	font: '',
	textScale: 100,
	source: 'doc', // for the maze image silhouette
	image: null,
};

import { t, LANG } from './i18n.js';

/* --------------------------- word suggestions ----------------------------- */

// Tiny starter lists only - the user types their own words; these just
// break the blank-page moment. No word database, no AI.
const WORD_THEMES = [
	{
		id: 'animals',
		label: 'Animals',
		en: [
			'DOG',
			'CAT',
			'HORSE',
			'LION',
			'TIGER',
			'MOUSE',
			'EAGLE',
			'SHARK',
			'WHALE',
			'RABBIT',
		],
		de: [
			'HUND',
			'KATZE',
			'PFERD',
			'LÖWE',
			'TIGER',
			'MAUS',
			'ADLER',
			'HAI',
			'WAL',
			'HASE',
		],
		es: [
			'PERRO',
			'GATO',
			'CABALLO',
			'LEON',
			'TIGRE',
			'RATON',
			'AGUILA',
			'TIBURON',
			'BALLENA',
			'CONEJO',
		],
		fr: [
			'CHIEN',
			'CHAT',
			'CHEVAL',
			'LION',
			'TIGRE',
			'SOURIS',
			'AIGLE',
			'REQUIN',
			'BALEINE',
			'LAPIN',
		],
		pt: [
			'CACHORRO',
			'GATO',
			'CAVALO',
			'LEAO',
			'TIGRE',
			'RATO',
			'AGUIA',
			'TUBARAO',
			'BALEIA',
			'COELHO',
		],
		it: [
			'CANE',
			'GATTO',
			'CAVALLO',
			'LEONE',
			'TIGRE',
			'TOPO',
			'AQUILA',
			'SQUALO',
			'BALENA',
			'CONIGLIO',
		],
		nl: [
			'HOND',
			'KAT',
			'PAARD',
			'LEEUW',
			'TIJGER',
			'MUIS',
			'AREND',
			'HAAI',
			'WALVIS',
			'KONIJN',
		],
	},
	{
		id: 'party',
		label: 'Party',
		en: [
			'BALLOON',
			'CAKE',
			'MUSIC',
			'DANCE',
			'GIFT',
			'CANDLE',
			'CONFETTI',
			'FRIENDS',
			'GAMES',
			'CANDY',
		],
		de: [
			'LUFTBALLON',
			'KUCHEN',
			'MUSIK',
			'TANZEN',
			'GESCHENK',
			'KERZE',
			'KONFETTI',
			'FREUNDE',
			'SPIELE',
			'BONBON',
		],
		es: [
			'GLOBO',
			'PASTEL',
			'MUSICA',
			'BAILE',
			'REGALO',
			'VELA',
			'CONFETI',
			'AMIGOS',
			'JUEGOS',
			'DULCES',
		],
		fr: [
			'BALLON',
			'GATEAU',
			'MUSIQUE',
			'DANSE',
			'CADEAU',
			'BOUGIE',
			'CONFETTIS',
			'AMIS',
			'JEUX',
			'BONBON',
		],
		pt: [
			'BALAO',
			'BOLO',
			'MUSICA',
			'DANCA',
			'PRESENTE',
			'VELA',
			'CONFETE',
			'AMIGOS',
			'JOGOS',
			'DOCES',
		],
		it: [
			'PALLONCINO',
			'TORTA',
			'MUSICA',
			'BALLO',
			'REGALO',
			'CANDELA',
			'CORIANDOLI',
			'AMICI',
			'GIOCHI',
			'CARAMELLE',
		],
		nl: [
			'BALLON',
			'TAART',
			'MUZIEK',
			'DANSEN',
			'CADEAU',
			'KAARS',
			'CONFETTI',
			'VRIENDEN',
			'SPELLETJES',
			'SNOEP',
		],
	},
	{
		id: 'summer',
		label: 'Summer',
		en: [
			'BEACH',
			'SUN',
			'OCEAN',
			'ICECREAM',
			'HOLIDAY',
			'SANDCASTLE',
			'WAVES',
			'SUNSHINE',
			'POOL',
			'PICNIC',
		],
		de: [
			'STRAND',
			'SONNE',
			'MEER',
			'EISCREME',
			'FERIEN',
			'SANDBURG',
			'WELLEN',
			'SONNENSCHEIN',
			'POOL',
			'PICKNICK',
		],
		es: [
			'PLAYA',
			'SOL',
			'MAR',
			'HELADO',
			'VACACIONES',
			'CASTILLO',
			'OLAS',
			'VERANO',
			'PISCINA',
			'PICNIC',
		],
		fr: [
			'PLAGE',
			'SOLEIL',
			'MER',
			'GLACE',
			'VACANCES',
			'CHATEAU',
			'VAGUES',
			'ETE',
			'PISCINE',
			'PIQUENIQUE',
		],
		pt: [
			'PRAIA',
			'SOL',
			'MAR',
			'SORVETE',
			'FERIAS',
			'CASTELO',
			'ONDAS',
			'VERAO',
			'PISCINA',
			'PIQUENIQUE',
		],
		it: [
			'SPIAGGIA',
			'SOLE',
			'MARE',
			'GELATO',
			'VACANZE',
			'CASTELLO',
			'ONDE',
			'ESTATE',
			'PISCINA',
			'PICNIC',
		],
		nl: [
			'STRAND',
			'ZON',
			'ZEE',
			'IJSJE',
			'VAKANTIE',
			'ZANDKASTEEL',
			'GOLVEN',
			'ZONNESCHIJN',
			'ZWEMBAD',
			'PICKNICK',
		],
	},
	{
		id: 'christmas',
		label: 'Christmas',
		en: [
			'SANTA',
			'SNOW',
			'GIFTS',
			'STAR',
			'ANGEL',
			'CANDLE',
			'COOKIES',
			'REINDEER',
			'SLEIGH',
			'WINTER',
		],
		de: [
			'NIKOLAUS',
			'SCHNEE',
			'GESCHENKE',
			'STERN',
			'ENGEL',
			'KERZE',
			'PLÄTZCHEN',
			'RENTIER',
			'SCHLITTEN',
			'WINTER',
		],
		es: [
			'PAPANOEL',
			'NIEVE',
			'REGALOS',
			'ESTRELLA',
			'ANGEL',
			'VELA',
			'GALLETAS',
			'RENO',
			'TRINEO',
			'INVIERNO',
		],
		fr: [
			'PERENOEL',
			'NEIGE',
			'CADEAUX',
			'ETOILE',
			'ANGE',
			'BOUGIE',
			'BISCUITS',
			'RENNE',
			'TRAINEAU',
			'HIVER',
		],
		pt: [
			'PAPAINOEL',
			'NEVE',
			'PRESENTES',
			'ESTRELA',
			'ANJO',
			'VELA',
			'BISCOITOS',
			'RENA',
			'TRENO',
			'INVERNO',
		],
		it: [
			'BABBONATALE',
			'NEVE',
			'REGALI',
			'STELLA',
			'ANGELO',
			'CANDELA',
			'BISCOTTI',
			'RENNA',
			'SLITTA',
			'INVERNO',
		],
		nl: [
			'KERSTMAN',
			'SNEEUW',
			'CADEAUS',
			'STER',
			'ENGEL',
			'KAARS',
			'KOEKJES',
			'RENDIER',
			'SLEE',
			'WINTER',
		],
	},
];
const THEME_LABELS = {
	animals: 'Animals',
	party: 'Party',
	summer: 'Summer',
	christmas: 'Christmas',
};

/* -------------------------------- helpers -------------------------------- */

function el( tag, cls, parent, text ) {
	const node = document.createElement( tag );
	if ( cls ) {
		node.className = cls;
	}
	if ( parent ) {
		parent.appendChild( node );
	}
	if ( undefined !== text ) {
		node.textContent = text;
	}
	return node;
}

// The WPIE brand mark for the dialog head (shared across studios).
const ICON_BRAND =
	'<svg width="24" height="24" viewBox="0 0 18.83 18.83" aria-hidden="true" focusable="false"><path fill="currentColor" d="M13.84,18.83H3.62c-2,0-3.62-1.62-3.62-3.62V3.52h1.72c.7,0,1.28.57,1.28,1.28v10.43c0,.34.28.62.62.62h8.94c.71,0,1.29.58,1.29,1.29v1.71Z"/><path fill="#3b66ff" d="M18.83,14.02h-1.71c-.71,0-1.29-.58-1.29-1.29V3.62c0-.34-.28-.62-.62-.62H4.82c-.7,0-1.28-.57-1.28-1.28V0h11.67c2,0,3.62,1.62,3.62,3.62v10.4Z"/><circle fill="currentColor" cx="17.33" cy="17.33" r="1.5"/><path fill="#3b66ff" d="M9.51,5.71l.91,2.45c.03.08.09.14.17.17l2.45.91c.07.03.07.13,0,.16l-2.45.91c-.08.03-.14.09-.17.17l-.91,2.45c-.03.07-.13.07-.16,0l-.91-2.45c-.03-.08-.09-.14-.17-.17l-2.45-.91c-.07-.03-.07-.13,0-.16l2.45-.91c.08-.03.14-.09.17-.17l.91-2.45c.03-.07.13-.07.16,0Z"/></svg>';

const tabIcon = ( d, size = 15 ) =>
	'<svg xmlns="http://www.w3.org/2000/svg" width="' +
	size +
	'" height="' +
	size +
	'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="' +
	d +
	'"/></svg>';

const ICONS = {
	puzzle: tabIcon(
		'M4 7h3a1 1 0 0 0 1 -1v-1a2 2 0 0 1 4 0v1a1 1 0 0 0 1 1h3a1 1 0 0 1 1 1v3a1 1 0 0 0 1 1h1a2 2 0 0 1 0 4h-1a1 1 0 0 0 -1 1v3a1 1 0 0 1 -1 1h-3a1 1 0 0 1 -1 -1v-1a2 2 0 0 0 -4 0v1a1 1 0 0 1 -1 1h-3a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1h1a2 2 0 0 0 0 -4h-1a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1'
	),
	source: tabIcon(
		'M15 8h.01 M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12 M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5 M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3'
	),
	colors: tabIcon(
		'M12 21a9 9 0 0 1 0 -18c4.97 0 9 3.582 9 8c0 1.06 -.474 2.078 -1.318 2.828c-.844 .75 -1.989 1.172 -3.182 1.172h-2.5a2 2 0 0 0 -1 3.75a1.3 1.3 0 0 1 -1 2.25 M8.5 10.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M12.5 7.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M16.5 10.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0'
	),
	settings: tabIcon(
		'M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065 M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0'
	),
};

const MODES = [
	{ id: 'wordsearch', label: 'Word search' },
	{ id: 'crossword', label: 'Crossword' },
	{ id: 'maze', label: 'Maze' },
	{ id: 'jigsaw', label: 'Photo jigsaw' },
	{ id: 'dot2dot', label: 'Dot to dot' },
	{ id: 'sudoku', label: 'Sudoku' },
	{ id: 'crisscross', label: 'Criss-cross' },
	{ id: 'bingo', label: 'Bingo cards' },
	{ id: 'cryptogram', label: 'Secret code' },
	{ id: 'pyramid', label: 'Number pyramid' },
	{ id: 'nonogram', label: 'Nonogram' },
	{ id: 'anagram', label: 'Anagrams' },
	{ id: 'memory', label: 'Memory cards' },
	{ id: 'games', label: 'Game sheets' },
	{ id: 'pack', label: 'Puzzle pack' },
];

// These read an image through the Source section.
const NEEDS_IMAGE = [ 'jigsaw', 'dot2dot' ];

/* --------------------------------- studio -------------------------------- */

function openStudio( ctx ) {
	const { editor, extras, layer } = ctx;
	const bridge = window.WPIE && window.WPIE.bridge;
	if ( ! bridge || ! bridge.documents ) {
		return;
	}
	const editing = !! ( layer && layer.generator );
	const params = {
		...DEFAULTS,
		...( editing ? layer.generator.params : {} ),
	};
	params.customColors = ( params.customColors || [] ).slice( 0, 4 );

	let srcCanvas = null;
	let srcToken = 0;

	const host = document.getElementById( 'wpie-root' ) || document.body;
	const backdrop = el( 'div', 'modal-backdrop', host );
	const dialog = el( 'div', 'dsm wpiepzl-dialog', backdrop );
	dialog.onclick = ( e ) => e.stopPropagation();
	const head = el( 'div', 'dsm-head', dialog );
	const badge = el( 'span', 'dsm-badge', head );
	badge.innerHTML = ICON_BRAND;
	const titles = el( 'div', 'dsm-titles', head );
	el( 'span', 'dsm-title', titles, 'Puzzle Sheets' );
	el(
		'div',
		'dsm-sub',
		titles,
		t( 'Six printable puzzle types - with solution sheets.' )
	);
	const closeBtn = el( 'button', 'dsm-x', head );
	closeBtn.innerHTML = '&times;';
	closeBtn.setAttribute( 'aria-label', t( 'Close' ) );

	const body = el( 'div', 'wpiepzl-body', dialog );
	const view = el( 'div', 'wpiepzl-view', body );
	const canvas = el( 'canvas', null, view );
	const side = el( 'div', 'wpiepzl-side', body );
	const status = el( 'div', 'wpiepzl-status', view );
	const setStatus = ( msg, isErr ) => {
		status.textContent = msg || '';
		status.classList.toggle( 'on', !! msg );
		status.classList.toggle( 'err', !! isErr );
	};

	const section = ( parent, icon, label ) => {
		const card = el( 'div', 'wpiepzl-card', parent );
		const h = el( 'div', 'wpiepzl-card-head', card );
		h.innerHTML = icon + '<span>' + label + '</span>';
		return el( 'div', 'wpiepzl-card-body', card );
	};

	/* --------------------------- puzzle cards ----------------------------- */

	const modeSec = section( side, ICONS.puzzle, t( 'Puzzle' ) );
	const modeGrid = el( 'div', 'wpiepzl-cards', modeSec );
	const modeTiles = new Map();
	for ( const m of MODES ) {
		const card = el( 'button', 'wpiepzl-tcard', modeGrid );
		card.type = 'button';
		card.title = t( m.label );
		const thumb = el( 'canvas', 'wpiepzl-tthumb', card );
		thumb.width = 132;
		thumb.height = 92;
		el( 'span', 'wpiepzl-tlabel', card, t( m.label ) );
		card.onclick = () => {
			params.mode = m.id;
			syncUi();
			const wantsImg =
				NEEDS_IMAGE.includes( m.id ) ||
				( 'nonogram' === m.id && 'image' === params.nonoShape );
			if ( wantsImg && ! srcCanvas ) {
				loadSource();
			} else {
				paint();
			}
		};
		modeTiles.set( m.id, { card, thumb } );
	}
	const warn = el( 'div', 'wpiepzl-info', modeSec );

	const like = () => document.createElement( 'canvas' );

	// A tiny stand-in subject for the image-driven thumbnails.
	const demoSubject = () => {
		const c = document.createElement( 'canvas' );
		c.width = 160;
		c.height = 120;
		const g = c.getContext( '2d' );
		const gr = g.createLinearGradient( 0, 0, 160, 120 );
		gr.addColorStop( 0, '#a5d8ff' );
		gr.addColorStop( 1, '#ffd27a' );
		g.fillStyle = gr;
		g.fillRect( 0, 0, 160, 120 );
		g.fillStyle = '#1d2126';
		g.beginPath();
		g.arc( 80, 60, 38, 0, Math.PI * 2 );
		g.fill();
		return c;
	};

	function paintCardThumbs() {
		const opts = { colors: resolvedColors() };
		const renders = {
			wordsearch: () =>
				renderWordSearch(
					like(),
					buildWordSearch( [ 'SUN', 'SEA', 'FUN' ], {
						size: 8,
						seed: 5,
					} ),
					opts
				),
			maze: () =>
				renderMaze(
					like(),
					buildMaze( like(), { shape: 'circle', cols: 15, seed: 4 } ),
					opts
				),
			sudoku: () =>
				renderSudoku(
					like(),
					buildSudoku( { size: 4, diff: 1, seed: 3 } ),
					opts
				),
			crisscross: () =>
				renderCrissCross(
					like(),
					buildCrissCross( [ 'SUN', 'SEA', 'SAND' ], { seed: 2 } ),
					opts
				),
			cryptogram: () =>
				renderCryptogram(
					like(),
					buildCryptogram( 'HI!', { seed: 2, diff: 1 } ),
					opts
				),
			pyramid: () =>
				renderPyramid(
					like(),
					buildPyramid( { rows: 4, diff: 1, seed: 2 } ),
					opts
				),
			crossword: () => {
				const cc = buildCrissCross( [ 'SUN', 'SEA', 'SAND' ], {
					seed: 2,
				} );
				return renderCrossword(
					like(),
					cc,
					buildCrosswordClues( cc, {} ),
					opts
				);
			},
			bingo: () =>
				renderBingo(
					like(),
					buildBingo( [ 'SUN', 'SEA', 'FUN', 'ICE' ], {
						grid: 3,
						cards: 1,
						seed: 4,
					} ),
					opts
				),
			jigsaw: () =>
				renderJigsaw( like(), srcCanvas || demoSubject(), {
					cols: 3,
					seed: 4,
					...opts,
				} ),
			dot2dot: () => {
				const dd = buildDot2Dot( like(), srcCanvas || demoSubject(), {
					points: 24,
				} );
				return dd ? renderDot2Dot( like(), dd, opts ) : null;
			},
			nonogram: () =>
				renderNonogram(
					like(),
					buildNonogram( like(), { shape: 'heart', size: 10 } ),
					opts
				),
			anagram: () =>
				renderAnagram(
					like(),
					buildAnagram( [ 'SUN', 'ICE' ], { seed: 3 } ),
					{ ...opts, hint: true }
				),
			memory: () =>
				renderMemory(
					like(),
					buildMemory( [ '🍎', '🌟', '🎈', '🐟' ], {
						pairs: 4,
						seed: 3,
					} ),
					opts
				),
			games: () =>
				renderGameSheet( like(), {
					...opts,
					game: 'slf',
					categories: [ 'A', 'B', 'C' ],
					rounds: 6,
					labels: {},
				} ),
			pack: () =>
				renderBingo(
					like(),
					buildBingo( [ 'SUN', 'SEA', 'FUN', 'ICE' ], {
						grid: 3,
						cards: 1,
						seed: 7,
					} ),
					opts
				),
		};
		for ( const m of MODES ) {
			const { thumb } = modeTiles.get( m.id );
			try {
				const c = renders[ m.id ]();
				const g = thumb.getContext( '2d' );
				g.fillStyle = '#ffffff';
				g.fillRect( 0, 0, thumb.width, thumb.height );
				const s = Math.min(
					thumb.width / c.width,
					thumb.height / c.height
				);
				g.drawImage(
					c,
					( thumb.width - c.width * s ) / 2,
					( thumb.height - c.height * s ) / 2,
					c.width * s,
					c.height * s
				);
			} catch ( e ) {}
		}
	}
	let thumbTimer = 0;
	const refreshThumbs = () => {
		window.clearTimeout( thumbTimer );
		thumbTimer = window.setTimeout( paintCardThumbs, 120 );
	};

	/* ------------------------------- source ------------------------------- */

	const srcSec = section( side, ICONS.source, t( 'Source' ) );
	const srcSel = el( 'select', 'dsm-select wpiepzl-wide', srcSec );
	const srcNote = el( 'div', 'wpiepzl-info', srcSec );

	function fillSourceOptions() {
		srcSel.innerHTML = '';
		const add = ( v, label ) => {
			const o = el( 'option', null, srcSel );
			o.value = v;
			o.textContent = label;
		};
		add( 'doc', t( 'Whole document' ) );
		const walk = ( layers, depth ) => {
			for ( const l of layers || [] ) {
				if ( 'group' === l.type ) {
					walk( l.children, depth + 1 );
					continue;
				}
				add(
					'layer:' + l.id,
					' '.repeat( depth * 2 ) + ( l.name || l.type )
				);
			}
		};
		walk( editor.state.layers, 0 );
		add( 'media', t( 'Media library…' ) );
	}
	fillSourceOptions();
	srcSel.value =
		[ 'doc', 'media' ].includes( params.source ) ||
		srcSel.querySelector( `option[value="${ params.source }"]` )
			? params.source
			: 'doc';
	params.source = srcSel.value;

	async function loadFromMedia() {
		// THE EDITOR'S OWN PICKER FIRST. `wp.media` is the WordPress admin
		// modal and does not exist in the standalone studio on
		// wunderpaint.com, so the guard below returned null and the button
		// did nothing at all - no picker, no message.
		if ( window.WPIE && window.WPIE.pickMedia ) {
			const picked = await window.WPIE.pickMedia( {
				multiple: false,
				title: t( 'Choose image' ),
				button: t( 'Use image' ),
				types: 'image',
			} );
			if ( ! picked || ! picked.length ) {
				return undefined;
			}
			return {
				id: picked[ 0 ].id,
				url: picked[ 0 ].url,
				title: picked[ 0 ].title || '',
			};
		}
		return new Promise( ( resolve ) => {
			if ( ! window.wp || ! window.wp.media ) {
				resolve( null );
				return;
			}
			const frame = window.wp.media( {
				title: t( 'Choose image' ),
				library: { type: 'image' },
				multiple: false,
				button: { text: t( 'Use image' ) },
			} );
			frame.on( 'select', () => {
				const item = frame.state().get( 'selection' ).first().toJSON();
				resolve( {
					id: item.id,
					url:
						( item.sizes &&
							item.sizes.large &&
							item.sizes.large.url ) ||
						item.url,
					title: item.title || item.filename || '',
				} );
			} );
			frame.on( 'close', () => resolve( undefined ) );
			frame.open();
		} );
	}

	async function urlToCanvas( url ) {
		const img = new window.Image();
		img.crossOrigin = 'anonymous';
		await new Promise( ( res, rej ) => {
			img.onload = res;
			img.onerror = rej;
			img.src = url;
		} );
		const c = document.createElement( 'canvas' );
		const scale = Math.min( 1, 600 / img.width );
		c.width = Math.round( img.width * scale );
		c.height = Math.round( img.height * scale );
		c.getContext( '2d' ).drawImage( img, 0, 0, c.width, c.height );
		return c;
	}

	// renderToCanvas returns transparency for empty areas - quantizers
	// would read that as black. Flatten every source onto white.
	function flattenWhite( c ) {
		if ( ! c ) {
			return c;
		}
		const w = document.createElement( 'canvas' );
		w.width = c.width;
		w.height = c.height;
		const g2 = w.getContext( '2d' );
		g2.fillStyle = '#ffffff';
		g2.fillRect( 0, 0, w.width, w.height );
		g2.drawImage( c, 0, 0 );
		return w;
	}

	async function loadSource() {
		const token = ++srcToken;
		const desc = params.source;
		srcNote.textContent = '';
		try {
			let c = null;
			if ( 'media' === desc ) {
				if ( params.image && params.image.url ) {
					c = await urlToCanvas( params.image.url );
					srcNote.textContent = params.image.title || '';
				}
			} else if ( 'doc' === desc ) {
				c = await bridge.raster.renderToCanvas(
					editor.state.doc,
					editor.state.layers,
					{ scale: Math.min( 1, 600 / editor.state.doc.w ) }
				);
			} else if ( desc.startsWith( 'layer:' ) ) {
				const id = desc.slice( 6 );
				const find = ( layers ) => {
					for ( const l of layers || [] ) {
						if ( String( l.id ) === id ) {
							return l;
						}
						const hit = l.children && find( l.children );
						if ( hit ) {
							return hit;
						}
					}
					return null;
				};
				const target = find( editor.state.layers );
				if ( target ) {
					c = await bridge.raster.renderToCanvas(
						editor.state.doc,
						[ target ],
						{ scale: Math.min( 1, 600 / editor.state.doc.w ) }
					);
					srcNote.textContent = target.name || '';
				}
			}
			c = flattenWhite( c );
			if ( token === srcToken ) {
				srcCanvas = c;
				paint();
			}
		} catch ( e ) {
			if ( token === srcToken ) {
				srcCanvas = null;
				setStatus( t( 'Could not load the image.' ), true );
				paint();
			}
		}
	}

	srcSel.onchange = async () => {
		if ( 'media' === srcSel.value ) {
			const picked = await loadFromMedia();
			if ( picked ) {
				params.image = picked;
				params.source = 'media';
			} else if ( undefined === picked && params.image ) {
				params.source = 'media';
			} else {
				srcSel.value = params.source;
				return;
			}
		} else {
			params.source = srcSel.value;
		}
		loadSource();
	};

	/* ------------------------------- colors ------------------------------- */

	const colSec = section( side, ICONS.colors, t( 'Colors' ) );
	const palWrap = el( 'div', 'wpiepzl-pals', colSec );
	const palBtns = new Map();
	for ( const p of PALETTES ) {
		const b = el( 'button', 'wpiepzl-pal', palWrap );
		b.type = 'button';
		b.title = p.label;
		b.style.background = `linear-gradient(90deg, ${ p.colors.join(
			','
		) })`;
		b.onclick = () => {
			params.paletteId = p.id;
			params.customColors = [];
			params.useBrand = false;
			syncUi();
			refreshThumbs();
			paint();
		};
		palBtns.set( p.id, b );
	}

	const brandKits = (
		bridge.brand ? bridge.brand.kits() : window.WPIE.brandKits || []
	).filter( ( k ) => k && Array.isArray( k.colors ) && k.colors.length >= 2 );
	const brandColors = () => {
		if ( ! params.useBrand ) {
			return [];
		}
		const kit =
			brandKits.find(
				( k ) => String( k.id ) === String( params.brandKitId )
			) || brandKits[ 0 ];
		return ( kit && kit.colors ) || [];
	};
	let brandCb = null;
	if ( brandKits.length ) {
		const brandLbl = el( 'label', 'wpiepzl-check', colSec );
		brandCb = el( 'input', null, brandLbl );
		brandCb.type = 'checkbox';
		brandCb.checked = !! params.useBrand;
		el( 'span', null, brandLbl ).textContent = t( 'Use brand colors' );
		brandCb.onchange = () => {
			params.useBrand = brandCb.checked;
			if ( params.useBrand ) {
				params.customColors = [];
			}
			syncUi();
			refreshThumbs();
			paint();
		};
		if (
			brandKits.length > 1 &&
			bridge.components &&
			bridge.components.mountKitPicker
		) {
			bridge.components.mountKitPicker( el( 'div', null, colSec ), {
				value: params.brandKitId || brandKits[ 0 ].id,
				onChange: ( id ) => {
					params.brandKitId = id;
					params.useBrand = true;
					brandCb.checked = true;
					refreshThumbs();
					paint();
				},
			} );
		}
	}

	// Up to four custom colors; the mounted button is controlled -
	// call handle.set() on every change.
	const customRow = el( 'div', 'wpiepzl-row wpiepzl-customrow', colSec );
	el( 'span', null, customRow ).textContent = t( 'Custom colors' );
	const customWrap = el( 'span', 'wpiepzl-customs', customRow );
	const mountSwatch = bridge.components && bridge.components.mountColorButton;
	const customCtls = [];
	for ( let i = 0; i < 4; i++ ) {
		const slot = el( 'span', 'wpiepzl-swatch', customWrap );
		const onChange = ( c ) => {
			const hex = 'string' === typeof c ? c : ( c && c.hex ) || '';
			params.customColors[ i ] = hex;
			params.useBrand = false;
			if ( customCtls[ i ] && customCtls[ i ].set && hex ) {
				customCtls[ i ].set( hex );
			}
			syncUi();
			refreshThumbs();
			paint();
		};
		if ( mountSwatch ) {
			customCtls.push(
				mountSwatch( slot, {
					color: params.customColors[ i ] || '#cccccc',
					title: t( 'Custom colors' ),
					onChange,
				} )
			);
		} else {
			const input = el( 'input', null, slot );
			input.type = 'color';
			input.oninput = () => onChange( input.value );
			customCtls.push( { set: ( hex ) => ( input.value = hex ) } );
		}
	}
	const resetBtn = el( 'button', 'wpiepzl-reset', customRow );
	resetBtn.textContent = t( 'Auto' );
	resetBtn.onclick = ( e ) => {
		e.preventDefault();
		params.customColors = [];
		params.useBrand = false;
		customCtls.forEach( ( ctl ) => ctl && ctl.set && ctl.set( '#cccccc' ) );
		syncUi();
		refreshThumbs();
		paint();
	};

	const resolvedColors = () =>
		colorsFor( {
			customColors: params.customColors,
			brandColors: brandColors(),
			paletteId: params.paletteId,
		} );

	/* ------------------------------ settings ------------------------------ */

	const setSec = section( side, ICONS.settings, t( 'Settings' ) );

	// Title (multi-line, up to two lines on the sheet).
	const titleRow = el( 'label', 'wpiepzl-text-row', setSec );
	el( 'span', null, titleRow ).textContent = t( 'Title' );
	const titleArea = el( 'textarea', 'wpiepzl-words', titleRow );
	titleArea.rows = 2;
	titleArea.value = params.title;
	titleArea.oninput = () => {
		params.title = titleArea.value;
		paint();
	};

	// Typography: editor font catalog + size factor.
	const fontRow = el( 'div', 'wpiepzl-text-row', setSec );
	el( 'span', null, fontRow ).textContent = t( 'Font' );
	const fontMount = el( 'div', null, fontRow );
	let fontCtl = null;
	const onFont = ( fam ) => {
		params.font = ! fam || 'System' === fam ? '' : fam;
		if ( params.font && bridge.fonts && bridge.fonts.ensureFont ) {
			bridge.fonts
				.ensureFont( params.font, 700 )
				.then( paint )
				.catch( paint );
		} else {
			paint();
		}
	};
	if ( bridge.components && bridge.components.mountFontPicker ) {
		fontCtl = bridge.components.mountFontPicker( fontMount, {
			value: params.font || 'Montserrat',
			onChange: onFont,
		} );
	} else {
		const fontSel = el( 'select', 'dsm-select wpiepzl-wide', fontMount );
		const fams =
			bridge.fonts && bridge.fonts.listFamilies
				? bridge.fonts.listFamilies()
				: [ 'System' ];
		for ( const f of fams ) {
			const o = el( 'option', null, fontSel );
			o.value = f;
			o.textContent = f;
		}
		fontSel.value = params.font || fams[ 0 ];
		fontSel.onchange = () => onFont( fontSel.value );
	}

	function sliderRowIn( parent, label, min, max, get, set, unit ) {
		const row = el( 'label', 'wpiepzl-row', parent );
		el( 'span', null, row ).textContent = label;
		const input = el( 'input', null, row );
		input.type = 'range';
		input.min = String( min );
		input.max = String( max );
		input.value = String( get() );
		const out = el( 'output', null, row );
		const suffix = unit || '';
		out.textContent = String( get() ) + suffix;
		input.oninput = () => {
			set( parseInt( input.value, 10 ) );
			out.textContent = input.value + suffix;
			paint();
		};
		return row;
	}
	sliderRowIn(
		setSec,
		t( 'Text size' ),
		60,
		160,
		() => params.textScale,
		( v ) => ( params.textScale = v ),
		'%'
	);

	// Words (word search + criss-cross) with tiny theme suggestions.
	const wordsRow = el( 'label', 'wpiepzl-text-row', setSec );
	el( 'span', null, wordsRow ).textContent = t( 'Words (one per line)' );
	const wordsArea = el( 'textarea', 'wpiepzl-words', wordsRow );
	wordsArea.rows = 6;
	wordsArea.value = params.words;
	wordsArea.oninput = () => {
		params.words = wordsArea.value;
		paint();
	};
	const themeRow = el( 'label', 'wpiepzl-row', setSec );
	el( 'span', null, themeRow ).textContent = t( 'Suggestions…' );
	const themeSel = el( 'select', 'dsm-select', themeRow );
	{
		const o = el( 'option', null, themeSel );
		o.value = '';
		o.textContent = '–';
	}
	for ( const th of WORD_THEMES ) {
		const o = el( 'option', null, themeSel );
		o.value = th.id;
		o.textContent = t( THEME_LABELS[ th.id ] );
	}
	themeSel.onchange = () => {
		const th = WORD_THEMES.find( ( x ) => x.id === themeSel.value );
		if ( th ) {
			const list = th[ LANG ] || th.en;
			params.words = list.join( '\n' );
			wordsArea.value = params.words;
			paint();
		}
		themeSel.value = '';
	};

	const gridRow = sliderRowIn(
		setSec,
		t( 'Grid size' ),
		10,
		20,
		() => params.size,
		( v ) => ( params.size = v )
	);
	const hardLbl = el( 'label', 'wpiepzl-check', setSec );
	const hardCb = el( 'input', null, hardLbl );
	hardCb.type = 'checkbox';
	hardCb.checked = !! params.hard;
	el( 'span', null, hardLbl ).textContent = t( 'All directions (hard)' );
	hardCb.onchange = () => {
		params.hard = hardCb.checked;
		paint();
	};

	// Maze: shape, letter, difficulty.
	const shapeRow = el( 'label', 'wpiepzl-row', setSec );
	el( 'span', null, shapeRow ).textContent = t( 'Shape' );
	const shapeSel = el( 'select', 'dsm-select', shapeRow );
	const SHAPE_LABELS = {
		circle: t( 'Circle' ),
		heart: t( 'Heart' ),
		star: t( 'Star' ),
		hexagon: t( 'Hexagon' ),
		diamond: t( 'Diamond' ),
		flower: t( 'Flower' ),
		letter: t( 'Letter' ),
		image: t( 'Image silhouette' ),
	};
	for ( const v of MAZE_SHAPES ) {
		const o = el( 'option', null, shapeSel );
		o.value = v;
		o.textContent = SHAPE_LABELS[ v ] || v;
	}
	shapeSel.value = params.shape;
	shapeSel.onchange = () => {
		params.shape = shapeSel.value;
		syncUi();
		if ( 'image' === params.shape && ! srcCanvas ) {
			loadSource();
		} else {
			paint();
		}
	};
	const letterRow = el( 'label', 'wpiepzl-row', setSec );
	el( 'span', null, letterRow ).textContent = t( 'Letter' );
	const letterInput = el( 'input', null, letterRow );
	letterInput.type = 'text';
	letterInput.maxLength = 1;
	letterInput.value = params.letter;
	letterInput.oninput = () => {
		params.letter = letterInput.value || 'A';
		paint();
	};
	const cellsRow = sliderRowIn(
		setSec,
		t( 'Difficulty' ),
		13,
		31,
		() => params.cells,
		( v ) => ( params.cells = v )
	);

	// Shared difficulty select helper (sudoku / code / pyramid).
	const diffRow = ( get, set ) => {
		const row = el( 'label', 'wpiepzl-row', setSec );
		el( 'span', null, row ).textContent = t( 'Difficulty' );
		const sel = el( 'select', 'dsm-select', row );
		for ( const [ v, l ] of [
			[ '1', t( 'Easy' ) ],
			[ '2', t( 'Medium' ) ],
			[ '3', t( 'Hard' ) ],
		] ) {
			const o = el( 'option', null, sel );
			o.value = v;
			o.textContent = l;
		}
		sel.value = String( get() );
		sel.onchange = () => {
			set( parseInt( sel.value, 10 ) );
			paint();
		};
		return row;
	};

	// Sudoku: size + difficulty.
	const sudSizeRow = el( 'label', 'wpiepzl-row', setSec );
	el( 'span', null, sudSizeRow ).textContent = t( 'Grid size' );
	const sudSizeSel = el( 'select', 'dsm-select', sudSizeRow );
	for ( const v of [ 4, 6, 9 ] ) {
		const o = el( 'option', null, sudSizeSel );
		o.value = String( v );
		o.textContent = `${ v } × ${ v }`;
	}
	sudSizeSel.value = String( params.sudokuSize );
	sudSizeSel.onchange = () => {
		params.sudokuSize = parseInt( sudSizeSel.value, 10 );
		paint();
	};
	const sudDiffRow = diffRow(
		() => params.sudokuDiff,
		( v ) => ( params.sudokuDiff = v )
	);

	// Secret code: phrase + difficulty.
	const phraseRow = el( 'label', 'wpiepzl-text-row', setSec );
	el( 'span', null, phraseRow ).textContent = t(
		'Phrase (the secret message)'
	);
	const phraseArea = el( 'textarea', 'wpiepzl-words', phraseRow );
	phraseArea.rows = 3;
	phraseArea.value = params.phrase;
	phraseArea.oninput = () => {
		params.phrase = phraseArea.value;
		paint();
	};
	const cryptoDiffRow = diffRow(
		() => params.cryptoDiff,
		( v ) => ( params.cryptoDiff = v )
	);

	// Pyramid: rows + difficulty.
	const pyrRowsRow = sliderRowIn(
		setSec,
		t( 'Rows' ),
		4,
		8,
		() => params.pyrRows,
		( v ) => ( params.pyrRows = v )
	);
	const pyrDiffRow = diffRow(
		() => params.pyrDiff,
		( v ) => ( params.pyrDiff = v )
	);

	// Crossword: word + clue pairs.
	const cluesRow = el( 'label', 'wpiepzl-text-row', setSec );
	el( 'span', null, cluesRow ).textContent = t( 'Clues (word: clue)' );
	const cluesArea = el( 'textarea', 'wpiepzl-words', cluesRow );
	cluesArea.rows = 7;
	cluesArea.value = params.clues;
	cluesArea.oninput = () => {
		params.clues = cluesArea.value;
		paint();
	};

	// Nonogram: shape (shares the maze vocabulary) + grid size.
	const nonoShapeRow = el( 'label', 'wpiepzl-row', setSec );
	el( 'span', null, nonoShapeRow ).textContent = t( 'Shape' );
	const nonoShapeSel = el( 'select', 'dsm-select', nonoShapeRow );
	for ( const v of MAZE_SHAPES ) {
		const o = el( 'option', null, nonoShapeSel );
		o.value = v;
		o.textContent = SHAPE_LABELS[ v ] || v;
	}
	nonoShapeSel.value = params.nonoShape;
	nonoShapeSel.onchange = () => {
		params.nonoShape = nonoShapeSel.value;
		syncUi();
		if ( 'image' === params.nonoShape && ! srcCanvas ) {
			loadSource();
		} else {
			paint();
		}
	};
	const nonoSizeRow = sliderRowIn(
		setSec,
		t( 'Grid size' ),
		10,
		25,
		() => params.nonoSize,
		( v ) => ( params.nonoSize = v )
	);

	// Anagrams: first-letter hint.
	const anagHintLbl = el( 'label', 'wpiepzl-check', setSec );
	const anagHintCb = el( 'input', null, anagHintLbl );
	anagHintCb.type = 'checkbox';
	anagHintCb.checked = !! params.anagHint;
	el( 'span', null, anagHintLbl ).textContent = t( 'First letter hint' );
	anagHintCb.onchange = () => {
		params.anagHint = anagHintCb.checked;
		paint();
	};

	// Memory: motifs + pairs.
	const memMotifsRow = el( 'label', 'wpiepzl-text-row', setSec );
	el( 'span', null, memMotifsRow ).textContent = t(
		'Motifs (emoji or words)'
	);
	const memMotifsArea = el( 'textarea', 'wpiepzl-words', memMotifsRow );
	memMotifsArea.rows = 2;
	memMotifsArea.value = params.memMotifs;
	memMotifsArea.oninput = () => {
		params.memMotifs = memMotifsArea.value;
		paint();
	};
	const memPairsRow = sliderRowIn(
		setSec,
		t( 'Pairs' ),
		4,
		15,
		() => params.memPairs,
		( v ) => ( params.memPairs = v )
	);

	// Game sheets: which game + its knobs.
	const gameRow = el( 'label', 'wpiepzl-row', setSec );
	el( 'span', null, gameRow ).textContent = t( 'Game' );
	const gameSel = el( 'select', 'dsm-select', gameRow );
	for ( const [ v, l ] of [
		[ 'slf', t( 'City-Country-River' ) ],
		[ 'ships', t( 'Battleships' ) ],
		[ 'boxes', t( 'Dots & Boxes' ) ],
	] ) {
		const o = el( 'option', null, gameSel );
		o.value = v;
		o.textContent = l;
	}
	gameSel.value = params.game;
	gameSel.onchange = () => {
		params.game = gameSel.value;
		syncUi();
		paint();
	};
	const slfCatsRow = el( 'label', 'wpiepzl-text-row', setSec );
	el( 'span', null, slfCatsRow ).textContent = t(
		'Categories (one per line)'
	);
	const slfCatsArea = el( 'textarea', 'wpiepzl-words', slfCatsRow );
	slfCatsArea.rows = 4;
	slfCatsArea.value = params.slfCats;
	slfCatsArea.oninput = () => {
		params.slfCats = slfCatsArea.value;
		paint();
	};
	const slfRoundsRow = sliderRowIn(
		setSec,
		t( 'Rounds' ),
		6,
		14,
		() => params.slfRounds,
		( v ) => ( params.slfRounds = v )
	);
	const boxColsRow = sliderRowIn(
		setSec,
		t( 'Grid width' ),
		8,
		24,
		() => params.boxCols,
		( v ) => ( params.boxCols = v )
	);

	// Puzzle pack: which sheets to include.
	const packInfo = el(
		'div',
		'wpiepzl-info',
		setSec,
		t( 'Sheets in the pack:' )
	);
	const packRows = [];
	const packCheck = ( key, label ) => {
		const lbl = el( 'label', 'wpiepzl-check', setSec );
		const cb = el( 'input', null, lbl );
		cb.type = 'checkbox';
		cb.checked = !! params[ key ];
		el( 'span', null, lbl ).textContent = label;
		cb.onchange = () => {
			params[ key ] = cb.checked;
			paint();
		};
		packRows.push( lbl );
		return lbl;
	};
	packCheck( 'packWS', t( 'Word search' ) );
	packCheck( 'packCC', t( 'Criss-cross' ) );
	packCheck( 'packMaze', t( 'Maze' ) );
	packCheck( 'packAnagram', t( 'Anagrams' ) );
	packCheck( 'packBingo', t( 'Bingo cards' ) );
	packCheck( 'packPyramid', t( 'Number pyramid' ) );

	// Bingo: card size, number of cards, free center.
	const bingoGridRow = el( 'label', 'wpiepzl-row', setSec );
	el( 'span', null, bingoGridRow ).textContent = t( 'Card size' );
	const bingoGridSel = el( 'select', 'dsm-select', bingoGridRow );
	for ( const v of [ 3, 4, 5 ] ) {
		const o = el( 'option', null, bingoGridSel );
		o.value = String( v );
		o.textContent = `${ v } × ${ v }`;
	}
	bingoGridSel.value = String( params.bingoGrid );
	bingoGridSel.onchange = () => {
		params.bingoGrid = parseInt( bingoGridSel.value, 10 );
		syncUi();
		paint();
	};
	const bingoCardsRow = sliderRowIn(
		setSec,
		t( 'Cards' ),
		1,
		8,
		() => params.bingoCards,
		( v ) => ( params.bingoCards = v )
	);
	const bingoFreeLbl = el( 'label', 'wpiepzl-check', setSec );
	const bingoFreeCb = el( 'input', null, bingoFreeLbl );
	bingoFreeCb.type = 'checkbox';
	bingoFreeCb.checked = !! params.bingoFree;
	el( 'span', null, bingoFreeLbl ).textContent = t( 'Free center' );
	bingoFreeCb.onchange = () => {
		params.bingoFree = bingoFreeCb.checked;
		paint();
	};

	// Photo jigsaw: pieces across.
	const jigColsRow = sliderRowIn(
		setSec,
		t( 'Pieces across' ),
		3,
		10,
		() => params.jigCols,
		( v ) => ( params.jigCols = v )
	);

	// Dot to dot: number of dots.
	const dotsRow = sliderRowIn(
		setSec,
		t( 'Dots' ),
		20,
		120,
		() => params.dotsN,
		( v ) => ( params.dotsN = v )
	);

	const shuffleBtn = el( 'button', 'ai-btn secondary wpiepzl-wide', setSec );
	shuffleBtn.type = 'button';
	shuffleBtn.textContent = t( 'Shuffle' );
	shuffleBtn.onclick = () => {
		params.seed = 1 + Math.floor( Math.random() * 99999 );
		paint();
	};
	const solLbl = el( 'label', 'wpiepzl-check', setSec );
	const solCb = el( 'input', null, solLbl );
	solCb.type = 'checkbox';
	solCb.checked = !! params.withSolution;
	const solLblText = el( 'span', null, solLbl );
	solLblText.textContent = t( 'Solution sheet' );
	solCb.onchange = () => {
		params.withSolution = solCb.checked;
		paint();
	};

	const syncUi = () => {
		modeTiles.forEach( ( { card }, id ) =>
			card.classList.toggle( 'sel', id === params.mode )
		);
		palBtns.forEach( ( b, id ) =>
			b.classList.toggle(
				'sel',
				id === params.paletteId &&
					! params.useBrand &&
					! params.customColors.filter( Boolean ).length
			)
		);
		const m = params.mode;
		const words = 'wordsearch' === m || 'crisscross' === m || 'bingo' === m;
		wordsRow.style.display = words ? '' : 'none';
		themeRow.style.display = words ? '' : 'none';
		gridRow.style.display = 'wordsearch' === m ? '' : 'none';
		hardLbl.style.display = 'wordsearch' === m ? '' : 'none';
		shapeRow.style.display = 'maze' === m ? '' : 'none';
		letterRow.style.display =
			'maze' === m && 'letter' === params.shape ? '' : 'none';
		cellsRow.style.display = 'maze' === m ? '' : 'none';
		sudSizeRow.style.display = 'sudoku' === m ? '' : 'none';
		sudDiffRow.style.display = 'sudoku' === m ? '' : 'none';
		phraseRow.style.display = 'cryptogram' === m ? '' : 'none';
		cryptoDiffRow.style.display = 'cryptogram' === m ? '' : 'none';
		pyrRowsRow.style.display = 'pyramid' === m ? '' : 'none';
		pyrDiffRow.style.display = 'pyramid' === m ? '' : 'none';
		cluesRow.style.display = 'crossword' === m ? '' : 'none';
		bingoGridRow.style.display = 'bingo' === m ? '' : 'none';
		bingoCardsRow.style.display = 'bingo' === m ? '' : 'none';
		bingoFreeLbl.style.display =
			'bingo' === m && 1 === params.bingoGrid % 2 ? '' : 'none';
		jigColsRow.style.display = 'jigsaw' === m ? '' : 'none';
		dotsRow.style.display = 'dot2dot' === m ? '' : 'none';
		nonoShapeRow.style.display = 'nonogram' === m ? '' : 'none';
		nonoSizeRow.style.display = 'nonogram' === m ? '' : 'none';
		anagHintLbl.style.display = 'anagram' === m ? '' : 'none';
		memMotifsRow.style.display = 'memory' === m ? '' : 'none';
		memPairsRow.style.display = 'memory' === m ? '' : 'none';
		gameRow.style.display = 'games' === m ? '' : 'none';
		slfCatsRow.style.display =
			'games' === m && 'slf' === params.game ? '' : 'none';
		slfRoundsRow.style.display =
			'games' === m && 'slf' === params.game ? '' : 'none';
		boxColsRow.style.display =
			'games' === m && 'boxes' === params.game ? '' : 'none';
		packInfo.style.display = 'pack' === m ? '' : 'none';
		packRows.forEach(
			( r ) => ( r.style.display = 'pack' === m ? '' : 'none' )
		);
		// The words list also feeds anagrams and the pack; the maze letter
		// row also serves letter-shaped nonograms.
		if ( 'anagram' === m || 'pack' === m ) {
			wordsRow.style.display = '';
			themeRow.style.display = '';
		}
		if ( 'nonogram' === m && 'letter' === params.nonoShape ) {
			letterRow.style.display = '';
		}
		// Bingo and the game sheets have no solution; memory repurposes
		// the slot as the duplex back sheet.
		solLbl.style.display = 'bingo' === m || 'games' === m ? 'none' : '';
		solLblText.textContent =
			'memory' === m ? t( 'Back sheet (duplex)' ) : t( 'Solution sheet' );
		srcSec.parentElement.style.display =
			( 'maze' === m && 'image' === params.shape ) ||
			( 'nonogram' === m && 'image' === params.nonoShape ) ||
			NEEDS_IMAGE.includes( m )
				? ''
				: 'none';
	};

	/* ------------------------------- footer ------------------------------- */

	const foot = el( 'div', 'dsm-foot', dialog );
	el(
		'div',
		'dsm-hint',
		foot,
		t( 'Everything is computed locally in your browser.' )
	);
	const actions = el( 'div', 'dsm-actions', foot );
	const cancelBtn = el( 'button', 'ai-btn secondary', actions );
	cancelBtn.textContent = t( 'Cancel' );
	const apply = el( 'button', 'ai-btn primary', actions );
	apply.textContent = editing ? t( 'Update sheets' ) : t( 'Insert sheets' );

	/* ------------------------------- painting ----------------------------- */

	function bake() {
		const common = {
			title: params.title,
			colors: resolvedColors(),
			font: params.font,
			textScale: params.textScale,
		};
		warn.textContent = '';
		const two = ( build, render ) => ( {
			sheet: render( like(), build, common ),
			solution: params.withSolution
				? render( like(), build, { ...common, solution: true } )
				: null,
		} );
		if ( 'wordsearch' === params.mode ) {
			const ws = buildWordSearch( params.words.split( /\n+/ ), {
				size: params.size,
				hard: params.hard,
				seed: params.seed,
			} );
			if ( ws.skipped.length ) {
				warn.textContent = `${ t(
					'Some words did not fit:'
				) } ${ ws.skipped.join( ', ' ) }`;
			}
			return two( ws, renderWordSearch );
		}
		if ( 'maze' === params.mode ) {
			const maze = buildMaze( like(), {
				shape: params.shape,
				letter: params.letter,
				maskImage: 'image' === params.shape ? srcCanvas : null,
				cols: params.cells,
				seed: params.seed,
			} );
			if ( ! maze ) {
				return null;
			}
			return two( maze, renderMaze );
		}
		if ( 'sudoku' === params.mode ) {
			const sud = buildSudoku( {
				size: params.sudokuSize,
				diff: params.sudokuDiff,
				seed: params.seed,
			} );
			return two( sud, renderSudoku );
		}
		if ( 'crisscross' === params.mode ) {
			const cc = buildCrissCross( params.words.split( /\n+/ ), {
				seed: params.seed,
			} );
			if ( ! cc.placed.length ) {
				return null;
			}
			if ( cc.skipped.length ) {
				warn.textContent = `${ t(
					'Some words did not fit:'
				) } ${ cc.skipped.join( ', ' ) }`;
			}
			return two( cc, renderCrissCross );
		}
		if ( 'crossword' === params.mode ) {
			const cleanWord = ( w ) =>
				String( w )
					.toUpperCase()
					.replace( /Ä/g, 'AE' )
					.replace( /Ö/g, 'OE' )
					.replace( /Ü/g, 'UE' )
					.replace( /[^A-Z]/g, '' );
			const entries = params.clues
				.split( /\r?\n/ )
				.map( ( l ) => l.trim() )
				.filter( Boolean )
				.map( ( l ) => {
					const i = l.indexOf( ':' );
					return i > 0
						? {
								word: l.slice( 0, i ),
								clue: l.slice( i + 1 ).trim(),
						  }
						: { word: l, clue: '' };
				} );
			const cc = buildCrissCross(
				entries.map( ( e ) => e.word ),
				{ seed: params.seed }
			);
			if ( ! cc.placed.length ) {
				return null;
			}
			if ( cc.skipped.length ) {
				warn.textContent = `${ t(
					'Some words did not fit:'
				) } ${ cc.skipped.join( ', ' ) }`;
			}
			const map = {};
			for ( const e of entries ) {
				const k = cleanWord( e.word );
				if ( k && ! map[ k ] ) {
					map[ k ] = e.clue;
				}
			}
			const cw = buildCrosswordClues( cc, map );
			const labels = {
				acrossLabel: t( 'Across →' ),
				downLabel: t( 'Down ↓' ),
			};
			return {
				sheet: renderCrossword( like(), cc, cw, {
					...common,
					...labels,
				} ),
				solution: params.withSolution
					? renderCrossword( like(), cc, cw, {
							...common,
							...labels,
							solution: true,
					  } )
					: null,
			};
		}
		if ( 'bingo' === params.mode ) {
			const b = buildBingo( params.words.split( /\n+/ ), {
				grid: params.bingoGrid,
				cards: params.bingoCards,
				free: params.bingoFree,
				seed: params.seed,
			} );
			if ( ! b ) {
				return null;
			}
			if ( b.short > 0 ) {
				warn.textContent = t(
					'Not enough terms - numbers fill the gaps.'
				);
			} else if ( b.cards.length < params.bingoCards ) {
				warn.textContent = t(
					'Add more terms for more distinct cards.'
				);
			}
			const renderCard = ( idx ) =>
				renderBingo( like(), b, { ...common, cardIndex: idx } );
			return {
				sheet: renderCard( 0 ),
				solution: null,
				extras: b.cards
					.slice( 1 )
					.map( ( _, i ) => renderCard( i + 1 ) ),
			};
		}
		if ( 'jigsaw' === params.mode ) {
			if ( ! srcCanvas ) {
				return null;
			}
			const jopts = { cols: params.jigCols, seed: params.seed };
			return {
				sheet: renderJigsaw( like(), srcCanvas, {
					...common,
					...jopts,
				} ),
				solution: params.withSolution
					? renderJigsaw( like(), srcCanvas, {
							...common,
							...jopts,
							solution: true,
					  } )
					: null,
			};
		}
		if ( 'dot2dot' === params.mode ) {
			if ( ! srcCanvas ) {
				return null;
			}
			const dd = buildDot2Dot( like(), srcCanvas, {
				points: params.dotsN,
			} );
			if ( ! dd ) {
				warn.textContent = t( 'The picture needs a clear subject.' );
				return null;
			}
			return two( dd, renderDot2Dot );
		}
		if ( 'nonogram' === params.mode ) {
			if ( 'image' === params.nonoShape && ! srcCanvas ) {
				return null;
			}
			const ng = buildNonogram( like(), {
				shape: params.nonoShape,
				letter: params.letter,
				maskImage: 'image' === params.nonoShape ? srcCanvas : null,
				size: params.nonoSize,
			} );
			return two( ng, renderNonogram );
		}
		if ( 'anagram' === params.mode ) {
			const an = buildAnagram( params.words.split( /\n+/ ), {
				seed: params.seed,
			} );
			if ( ! an ) {
				return null;
			}
			const hint = { hint: params.anagHint };
			return {
				sheet: renderAnagram( like(), an, { ...common, ...hint } ),
				solution: params.withSolution
					? renderAnagram( like(), an, {
							...common,
							...hint,
							solution: true,
					  } )
					: null,
			};
		}
		if ( 'memory' === params.mode ) {
			const mem = buildMemory( params.memMotifs.split( /\s+/ ), {
				pairs: params.memPairs,
				seed: params.seed,
			} );
			if ( ! mem ) {
				warn.textContent = t( 'Add at least four motifs.' );
				return null;
			}
			return two( mem, renderMemory );
		}
		if ( 'games' === params.mode ) {
			return {
				sheet: renderGameSheet( like(), {
					...common,
					game: params.game,
					categories: params.slfCats
						.split( /\r?\n/ )
						.map( ( l ) => l.trim() )
						.filter( Boolean ),
					rounds: params.slfRounds,
					boxCols: params.boxCols,
					labels: {
						letter: t( 'ABC' ),
						points: t( 'Points' ),
						fleet: t( 'Fleet:' ),
						own: t( 'My fleet' ),
						shots: t( 'My shots' ),
					},
				} ),
				solution: null,
			};
		}
		if ( 'pack' === params.mode ) {
			const out = [];
			const push = ( sheet, name, solution ) => {
				out.push( { c: sheet, name } );
				if ( solution && params.withSolution ) {
					out.push( {
						c: solution,
						name: `${ name } – ${ t( 'Solution' ) }`,
					} );
				}
			};
			const wordsList = params.words.split( /\n+/ );
			if ( params.packWS ) {
				const ws = buildWordSearch( wordsList, {
					size: params.size,
					hard: params.hard,
					seed: params.seed,
				} );
				push(
					renderWordSearch( like(), ws, common ),
					t( 'Word search' ),
					renderWordSearch( like(), ws, {
						...common,
						solution: true,
					} )
				);
			}
			if ( params.packCC ) {
				const cc = buildCrissCross( wordsList, {
					seed: params.seed,
				} );
				if ( cc.placed.length ) {
					push(
						renderCrissCross( like(), cc, common ),
						t( 'Criss-cross' ),
						renderCrissCross( like(), cc, {
							...common,
							solution: true,
						} )
					);
				}
			}
			if ( params.packMaze ) {
				const mz = buildMaze( like(), {
					shape: 'image' === params.shape ? 'heart' : params.shape,
					letter: params.letter,
					cols: params.cells,
					seed: params.seed,
				} );
				if ( mz ) {
					push(
						renderMaze( like(), mz, common ),
						t( 'Maze' ),
						renderMaze( like(), mz, {
							...common,
							solution: true,
						} )
					);
				}
			}
			if ( params.packAnagram ) {
				const an = buildAnagram( wordsList, {
					seed: params.seed,
				} );
				if ( an ) {
					const hint = { hint: params.anagHint };
					push(
						renderAnagram( like(), an, {
							...common,
							...hint,
						} ),
						t( 'Anagrams' ),
						renderAnagram( like(), an, {
							...common,
							...hint,
							solution: true,
						} )
					);
				}
			}
			if ( params.packBingo ) {
				const b = buildBingo( wordsList, {
					grid: params.bingoGrid,
					cards: 2,
					free: params.bingoFree,
					seed: params.seed,
				} );
				if ( b ) {
					b.cards.forEach( ( _, i ) => {
						push(
							renderBingo( like(), b, {
								...common,
								cardIndex: i,
							} ),
							`${ t( 'Bingo cards' ) } ${ i + 1 }`,
							null
						);
					} );
				}
			}
			if ( params.packPyramid ) {
				const py = buildPyramid( {
					rows: params.pyrRows,
					diff: params.pyrDiff,
					seed: params.seed,
				} );
				push(
					renderPyramid( like(), py, common ),
					t( 'Number pyramid' ),
					renderPyramid( like(), py, {
						...common,
						solution: true,
					} )
				);
			}
			if ( ! out.length ) {
				return null;
			}
			return {
				sheet: out[ 0 ].c,
				solution: null,
				extras: out.slice( 1 ).map( ( o ) => o.c ),
				extraNames: out.slice( 1 ).map( ( o ) => o.name ),
			};
		}
		if ( 'cryptogram' === params.mode ) {
			const cg = buildCryptogram( params.phrase, {
				seed: params.seed,
				diff: params.cryptoDiff,
			} );
			return two( cg, renderCryptogram );
		}
		const py = buildPyramid( {
			rows: params.pyrRows,
			diff: params.pyrDiff,
			seed: params.seed,
		} );
		return two( py, renderPyramid );
	}

	let raf = 0;
	function paintNow() {
		syncUi();
		let baked = null;
		try {
			baked = bake();
		} catch ( e ) {
			baked = null;
		}
		apply.disabled = ! baked;
		if ( ! baked ) {
			canvas.width = 10;
			canvas.height = 10;
			return;
		}
		setStatus( '' );
		const tiles = [ baked.sheet ];
		if ( baked.solution ) {
			tiles.push( baked.solution );
		}
		for ( const ex of ( baked.extras || [] ).slice( 0, 2 ) ) {
			tiles.push( ex );
		}
		const gap = 20;
		const totalW =
			tiles.reduce( ( s, tl ) => s + tl.width, 0 ) +
			gap * ( tiles.length - 1 );
		const totalH = Math.max( ...tiles.map( ( tl ) => tl.height ) );
		const maxW = Math.max( 200, view.clientWidth - 36 );
		const maxH = Math.max( 200, view.clientHeight - 36 );
		const s = Math.min( maxW / totalW, maxH / totalH, 1 );
		canvas.width = Math.round( totalW * s );
		canvas.height = Math.round( totalH * s );
		const g = canvas.getContext( '2d' );
		let x = 0;
		for ( const tl of tiles ) {
			g.drawImage( tl, x, 0, tl.width * s, tl.height * s );
			x += ( tl.width + gap ) * s;
		}
	}
	function paint() {
		if ( raf ) {
			return;
		}
		raf = window.requestAnimationFrame( () => {
			raf = 0;
			paintNow();
		} );
	}

	/* ------------------------------ lifecycle ----------------------------- */

	const onResize = () => paint();
	const viewRO =
		'function' === typeof window.ResizeObserver
			? new window.ResizeObserver( () => paint() )
			: null;
	const onKey = ( e ) => {
		if ( 'Escape' === e.key ) {
			close();
		}
	};
	function close() {
		window.clearTimeout( thumbTimer );
		window.removeEventListener( 'resize', onResize );
		if ( viewRO ) {
			viewRO.disconnect();
		}
		document.removeEventListener( 'keydown', onKey );
		customCtls.forEach( ( c ) => {
			if ( c && c.unmount ) {
				c.unmount();
			}
		} );
		if ( fontCtl && fontCtl.unmount ) {
			fontCtl.unmount();
		}
		backdrop.remove();
	}
	window.addEventListener( 'resize', onResize );
	if ( viewRO ) {
		viewRO.observe( view );
	}
	document.addEventListener( 'keydown', onKey );
	closeBtn.onclick = close;
	cancelBtn.onclick = close;
	backdrop.onclick = ( e ) => {
		if ( e.target === backdrop ) {
			close();
		}
	};

	/* -------------------------------- insert ------------------------------ */

	apply.onclick = async () => {
		apply.disabled = true;
		setStatus( t( 'Rendering the sheets' ) );
		try {
			const baked = bake();
			const doc = editor.state.doc;
			const place = ( c, name, offset ) => {
				const fit = Math.min(
					( doc.w * 0.86 ) / c.width,
					( doc.h * 0.86 ) / c.height
				);
				const w = Math.round( c.width * fit );
				const h = Math.round( c.height * fit );
				return bridge.documents.makeImage( {
					name,
					x: Math.round( ( doc.w - w ) / 2 ) + offset,
					y: Math.round( ( doc.h - h ) / 2 ) + offset,
					w,
					h,
					src: c.toDataURL( 'image/png' ),
					naturalW: c.width,
					naturalH: c.height,
				} );
			};
			const stored = { ...params };
			const modeLabel = t(
				MODES.find( ( m ) => m.id === params.mode ).label
			);
			if ( editing ) {
				const fitC = baked.sheet;
				editor.dispatch( {
					type: 'UPDATE_LAYER',
					id: layer.id,
					patch: {
						src: fitC.toDataURL( 'image/png' ),
						naturalW: fitC.width,
						naturalH: fitC.height,
						generator: { id: GEN_ID, params: stored },
					},
				} );
				editor.commit( t( 'Update sheets' ) );
			} else {
				const main = place( baked.sheet, modeLabel, 0 );
				main.generator = { id: GEN_ID, params: stored };
				editor.dispatch( { type: 'ADD_LAYER', layer: main } );
				// Bingo sets: every further card is its own layer.
				( baked.extras || [] ).forEach( ( ex, i ) => {
					const exName =
						( baked.extraNames && baked.extraNames[ i ] ) ||
						`${ modeLabel } ${ i + 2 }`;
					const exLayer = place( ex, exName, ( i + 1 ) * 40 );
					editor.dispatch( { type: 'ADD_LAYER', layer: exLayer } );
				} );
				if ( baked.solution ) {
					const sol = place( baked.solution, t( 'Solution' ), 40 );
					editor.dispatch( { type: 'ADD_LAYER', layer: sol } );
				}
				editor.dispatch( { type: 'SET_ACTIVE', id: main.id } );
				editor.commit( t( 'Insert sheets' ) );
			}
			setStatus( t( 'Inserted.' ) );
			close();
		} catch ( e ) {
			setStatus(
				e && e.message
					? e.message
					: t( 'Could not insert the sheets.' ),
				true
			);
			apply.disabled = false;
		}
	};

	/* --------------------------------- boot ------------------------------- */

	void extras;
	requestAnimationFrame( () => {
		syncUi();
		paintCardThumbs();
		paint();
		if (
			( 'maze' === params.mode && 'image' === params.shape ) ||
			( 'nonogram' === params.mode && 'image' === params.nonoShape ) ||
			NEEDS_IMAGE.includes( params.mode )
		) {
			loadSource();
		}
		if ( params.font && bridge.fonts && bridge.fonts.ensureFont ) {
			bridge.fonts
				.ensureFont( params.font, 700 )
				.then( () => {
					refreshThumbs();
					paint();
				} )
				.catch( () => {} );
		}
	} );
}

/* -------------------------------- register ------------------------------- */

function register( api ) {
	api.registerGenerator( {
		id: GEN_ID,
		label: 'Puzzle Sheets',
		run: ( ctx ) => openStudio( ctx ),
		edit: ( ctx ) => openStudio( ctx ),
	} );
}

if ( window.WPIE && window.WPIE.api ) {
	register( window.WPIE.api );
} else {
	window.wp.hooks.addAction( 'wpie.ready', 'wpie-puzzle-sheets', register );
}
