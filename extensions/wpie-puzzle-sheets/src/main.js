/**
 * WPIE extension: Puzzle Sheets (v2 dialog).
 *
 * Printable puzzle types, computed locally: word search, mazes in
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
	renderLogicGrid,
	renderMathChains,
	foldLetters,
	shapeMask,
	pickSecretCells,
	composeSheet,
} from './puzzle-engine.js';
import {
	buildBinary,
	buildInequality,
	buildMathChains,
} from './logic-puzzles.js';
import {
	buildArithmetic,
	renderArithmetic,
	canWriteInColumns,
	buildClocks,
	renderClocks,
	buildCircleMaze,
	renderCircleMaze,
} from './school-sheets.js';

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
	binarySize: 6,
	inequalitySize: 5,
	logicDiff: 2,
	mathRows: 8,
	mathSteps: 4,
	mathDiff: 2,
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
	// v2.8: missing letters and magic squares.
	missGaps: 40,
	magicCount: 4,
	magicRange: 'small',
	magicClues: 3,
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
	// v2.6: word search in a shape, hidden messages and solution words.
	wsShape: 'square',
	wsSecret: '',
	secretWord: '',
	// v2.6: the worksheet head and several puzzles per page.
	sheetHeader: false,
	instructions: '',
	perPage: 1,
	// v2.6: picture sudoku and picture crossword.
	picMotifs: '🍎 🐟 🌟 🚗 🌸 🎈 🦋 🍩 ⚽',
	picSize: 4,
	picDiff: 1,
	picClues: '',
	// v2.7: series, school sheets and the circle maze.
	series: 1,
	arithOps: 'add',
	arithMax: 20,
	arithCount: 24,
	arithLayout: 'rows',
	arithGaps: false,
	clockTask: 'read',
	clockStep: 'quarter',
	clockCount: 6,
	rings: 10,
};

// The picture crossword's starter set: one picture, the word in each
// editor language. Accents stay as written - the grid folds them.
const PIC_WORDS = [
	[
		'🐶',
		{
			en: 'DOG',
			de: 'HUND',
			es: 'PERRO',
			fr: 'CHIEN',
			pt: 'CÃO',
			it: 'CANE',
			nl: 'HOND',
		},
	],
	[
		'🐱',
		{
			en: 'CAT',
			de: 'KATZE',
			es: 'GATO',
			fr: 'CHAT',
			pt: 'GATO',
			it: 'GATTO',
			nl: 'KAT',
		},
	],
	[
		'🐟',
		{
			en: 'FISH',
			de: 'FISCH',
			es: 'PEZ',
			fr: 'POISSON',
			pt: 'PEIXE',
			it: 'PESCE',
			nl: 'VIS',
		},
	],
	[
		'🍎',
		{
			en: 'APPLE',
			de: 'APFEL',
			es: 'MANZANA',
			fr: 'POMME',
			pt: 'MAÇÃ',
			it: 'MELA',
			nl: 'APPEL',
		},
	],
	[
		'☀️',
		{
			en: 'SUN',
			de: 'SONNE',
			es: 'SOL',
			fr: 'SOLEIL',
			pt: 'SOL',
			it: 'SOLE',
			nl: 'ZON',
		},
	],
	[
		'🏠',
		{
			en: 'HOUSE',
			de: 'HAUS',
			es: 'CASA',
			fr: 'MAISON',
			pt: 'CASA',
			it: 'CASA',
			nl: 'HUIS',
		},
	],
	[
		'🌳',
		{
			en: 'TREE',
			de: 'BAUM',
			es: 'ÁRBOL',
			fr: 'ARBRE',
			pt: 'ÁRVORE',
			it: 'ALBERO',
			nl: 'BOOM',
		},
	],
	[
		'🌙',
		{
			en: 'MOON',
			de: 'MOND',
			es: 'LUNA',
			fr: 'LUNE',
			pt: 'LUA',
			it: 'LUNA',
			nl: 'MAAN',
		},
	],
];
const defaultPicClues = ( lang ) =>
	PIC_WORDS.map(
		( [ pic, words ] ) => `${ words[ lang ] || words.en }: ${ pic }`
	).join( '\n' );
// Fallback pictures when the list is shorter than the sudoku is wide.
const PIC_FALLBACK = [ '🍎', '🐟', '🌟', '🚗', '🌸', '🎈', '🦋', '🍩', '⚽' ];
// Modes that can put several different puzzles on one page.
const PER_PAGE = [
	'sudoku',
	'picsudoku',
	'maze',
	'circlemaze',
	'binary',
	'inequality',
	'pyramid',
	'mathchains',
];
// Modes whose seed gives a genuinely different puzzle - a class set in
// versions A, B, C. (The crossword family places the same words much the
// same way whatever the seed, so it stays out.)
const SERIES = [
	'wordsearch',
	'anagram',
	'cryptogram',
	'sudoku',
	'picsudoku',
	'maze',
	'circlemaze',
	'binary',
	'inequality',
	'pyramid',
	'mathchains',
	'arith',
	'clock',
];

import {
	buildMissingLetters,
	renderMissingLetters,
	buildMagicSquares,
	renderMagicSquares,
	renderMoreGame,
	MORE_GAMES,
	ALPHABETS,
} from './more-sheets.js';
import { t, LANG } from './i18n.js';
import { studioUndo } from '../../shared/studio-undo.js';

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
	{
		id: 'wedding',
		label: 'Wedding',
		en: [
			'BRIDE',
			'GROOM',
			'RING',
			'VOWS',
			'KISS',
			'DANCE',
			'CAKE',
			'FLOWERS',
			'VEIL',
			'LOVE',
		],
		de: [
			'BRAUT',
			'BRÄUTIGAM',
			'RING',
			'KUSS',
			'TANZ',
			'TORTE',
			'BLUMEN',
			'SCHLEIER',
			'LIEBE',
			'HOCHZEIT',
		],
		es: [
			'NOVIA',
			'NOVIO',
			'ANILLO',
			'BESO',
			'BAILE',
			'PASTEL',
			'FLORES',
			'VELO',
			'AMOR',
			'BODA',
		],
		fr: [
			'MARIÉE',
			'MARIÉ',
			'ALLIANCE',
			'BAISER',
			'DANSE',
			'GÂTEAU',
			'FLEURS',
			'VOILE',
			'AMOUR',
			'NOCES',
		],
		pt: [
			'NOIVA',
			'NOIVO',
			'ANEL',
			'BEIJO',
			'DANÇA',
			'BOLO',
			'FLORES',
			'VÉU',
			'AMOR',
			'CASAMENTO',
		],
		it: [
			'SPOSA',
			'SPOSO',
			'ANELLO',
			'BACIO',
			'BALLO',
			'TORTA',
			'FIORI',
			'VELO',
			'AMORE',
			'NOZZE',
		],
		nl: [
			'BRUID',
			'BRUIDEGOM',
			'RING',
			'KUS',
			'DANS',
			'TAART',
			'BLOEMEN',
			'SLUIER',
			'LIEFDE',
			'BRUILOFT',
		],
	},
	{
		id: 'easter',
		label: 'Easter',
		en: [
			'EGG',
			'BUNNY',
			'BASKET',
			'CHICK',
			'SPRING',
			'TULIP',
			'CHOCOLATE',
			'LAMB',
			'NEST',
			'HUNT',
		],
		de: [
			'OSTEREI',
			'HASE',
			'KORB',
			'KÜKEN',
			'FRÜHLING',
			'TULPE',
			'SCHOKOLADE',
			'LAMM',
			'NEST',
			'SUCHE',
		],
		es: [
			'HUEVO',
			'CONEJO',
			'CESTA',
			'POLLITO',
			'PRIMAVERA',
			'TULIPÁN',
			'CHOCOLATE',
			'CORDERO',
			'NIDO',
			'PASCUA',
		],
		fr: [
			'LAPIN',
			'PANIER',
			'POUSSIN',
			'PRINTEMPS',
			'TULIPE',
			'CHOCOLAT',
			'AGNEAU',
			'NID',
			'CLOCHES',
			'PÂQUES',
		],
		pt: [
			'OVO',
			'COELHO',
			'CESTA',
			'PINTINHO',
			'PRIMAVERA',
			'TULIPA',
			'CHOCOLATE',
			'CORDEIRO',
			'NINHO',
			'PÁSCOA',
		],
		it: [
			'UOVO',
			'CONIGLIO',
			'CESTINO',
			'PULCINO',
			'PRIMAVERA',
			'TULIPANO',
			'CIOCCOLATO',
			'AGNELLO',
			'NIDO',
			'PASQUA',
		],
		nl: [
			'PAASEI',
			'HAAS',
			'MANDJE',
			'KUIKEN',
			'LENTE',
			'TULP',
			'CHOCOLADE',
			'LAM',
			'NEST',
			'PASEN',
		],
	},
	{
		id: 'halloween',
		label: 'Halloween',
		en: [
			'PUMPKIN',
			'GHOST',
			'WITCH',
			'BAT',
			'SPIDER',
			'CANDY',
			'COSTUME',
			'MOON',
			'BROOM',
			'SKELETON',
		],
		de: [
			'KÜRBIS',
			'GESPENST',
			'HEXE',
			'FLEDERMAUS',
			'SPINNE',
			'SÜSSES',
			'KOSTÜM',
			'MOND',
			'BESEN',
			'SKELETT',
		],
		es: [
			'CALABAZA',
			'FANTASMA',
			'BRUJA',
			'MURCIÉLAGO',
			'ARAÑA',
			'DULCES',
			'DISFRAZ',
			'LUNA',
			'ESCOBA',
			'ESQUELETO',
		],
		fr: [
			'CITROUILLE',
			'FANTÔME',
			'SORCIÈRE',
			'VAMPIRE',
			'ARAIGNÉE',
			'BONBONS',
			'COSTUME',
			'LUNE',
			'BALAI',
			'SQUELETTE',
		],
		pt: [
			'ABÓBORA',
			'FANTASMA',
			'BRUXA',
			'MORCEGO',
			'ARANHA',
			'DOCES',
			'FANTASIA',
			'LUA',
			'VASSOURA',
			'ESQUELETO',
		],
		it: [
			'ZUCCA',
			'FANTASMA',
			'STREGA',
			'PIPISTRELLO',
			'RAGNO',
			'CARAMELLE',
			'COSTUME',
			'LUNA',
			'SCOPA',
			'SCHELETRO',
		],
		nl: [
			'POMPOEN',
			'SPOOK',
			'HEKS',
			'VLEERMUIS',
			'SPIN',
			'SNOEP',
			'KOSTUUM',
			'MAAN',
			'BEZEM',
			'SKELET',
		],
	},
	{
		id: 'autumn',
		label: 'Autumn',
		en: [
			'LEAVES',
			'ACORN',
			'CHESTNUT',
			'RAIN',
			'WIND',
			'APPLE',
			'MUSHROOM',
			'HARVEST',
			'KITE',
			'FOG',
		],
		de: [
			'BLÄTTER',
			'EICHEL',
			'KASTANIE',
			'REGEN',
			'WIND',
			'APFEL',
			'PILZ',
			'ERNTE',
			'DRACHEN',
			'NEBEL',
		],
		es: [
			'HOJAS',
			'BELLOTA',
			'CASTAÑA',
			'LLUVIA',
			'VIENTO',
			'MANZANA',
			'SETA',
			'COSECHA',
			'COMETA',
			'NIEBLA',
		],
		fr: [
			'FEUILLES',
			'GLAND',
			'CHÂTAIGNE',
			'PLUIE',
			'VENT',
			'POMME',
			'CHAMPIGNON',
			'RÉCOLTE',
			'CITROUILLE',
			'BROUILLARD',
		],
		pt: [
			'FOLHAS',
			'BOLOTA',
			'CASTANHA',
			'CHUVA',
			'VENTO',
			'MAÇÃ',
			'COGUMELO',
			'COLHEITA',
			'PIPA',
			'NEBLINA',
		],
		it: [
			'FOGLIE',
			'GHIANDA',
			'CASTAGNA',
			'PIOGGIA',
			'VENTO',
			'MELA',
			'FUNGO',
			'RACCOLTO',
			'AQUILONE',
			'NEBBIA',
		],
		nl: [
			'BLADEREN',
			'EIKEL',
			'KASTANJE',
			'REGEN',
			'WIND',
			'APPEL',
			'PADDENSTOEL',
			'OOGST',
			'VLIEGER',
			'MIST',
		],
	},
	{
		id: 'winter',
		label: 'Winter',
		en: [
			'SNOW',
			'SNOWMAN',
			'SLED',
			'SCARF',
			'MITTENS',
			'ICE',
			'SKATES',
			'COCOA',
			'FROST',
			'PENGUIN',
		],
		de: [
			'SCHNEE',
			'SCHNEEMANN',
			'SCHLITTEN',
			'SCHAL',
			'HANDSCHUHE',
			'EIS',
			'SCHLITTSCHUH',
			'KAKAO',
			'FROST',
			'PINGUIN',
		],
		es: [
			'NIEVE',
			'MUÑECO',
			'TRINEO',
			'BUFANDA',
			'GUANTES',
			'HIELO',
			'PATINES',
			'CHOCOLATE',
			'ESCARCHA',
			'PINGÜINO',
		],
		fr: [
			'NEIGE',
			'BONHOMME',
			'LUGE',
			'ÉCHARPE',
			'MOUFLES',
			'GLACE',
			'PATINS',
			'CHOCOLAT',
			'GIVRE',
			'PINGOUIN',
		],
		pt: [
			'NEVE',
			'BONECO',
			'TRENÓ',
			'CACHECOL',
			'LUVAS',
			'GELO',
			'PATINS',
			'CHOCOLATE',
			'GEADA',
			'PINGUIM',
		],
		it: [
			'NEVE',
			'PUPAZZO',
			'SLITTA',
			'SCIARPA',
			'GUANTI',
			'GHIACCIO',
			'PATTINI',
			'CIOCCOLATA',
			'BRINA',
			'PINGUINO',
		],
		nl: [
			'SNEEUW',
			'SNEEUWPOP',
			'SLEE',
			'SJAAL',
			'WANTEN',
			'IJS',
			'SCHAATSEN',
			'MUTS',
			'VORST',
			'PINGUÏN',
		],
	},
	{
		id: 'school',
		label: 'School',
		en: [
			'PENCIL',
			'BOOK',
			'TEACHER',
			'DESK',
			'RULER',
			'ERASER',
			'BACKPACK',
			'CHALK',
			'LESSON',
			'FRIEND',
		],
		de: [
			'BLEISTIFT',
			'BUCH',
			'LEHRER',
			'TISCH',
			'LINEAL',
			'RADIERER',
			'RUCKSACK',
			'KREIDE',
			'PAUSE',
			'FREUNDE',
		],
		es: [
			'LÁPIZ',
			'LIBRO',
			'MAESTRA',
			'PUPITRE',
			'REGLA',
			'GOMA',
			'MOCHILA',
			'TIZA',
			'RECREO',
			'AMIGOS',
		],
		fr: [
			'CRAYON',
			'LIVRE',
			'MAÎTRESSE',
			'PUPITRE',
			'RÈGLE',
			'GOMME',
			'CARTABLE',
			'CRAIE',
			'RÉCRÉ',
			'AMIS',
		],
		pt: [
			'LÁPIS',
			'LIVRO',
			'PROFESSORA',
			'CARTEIRA',
			'RÉGUA',
			'BORRACHA',
			'MOCHILA',
			'GIZ',
			'RECREIO',
			'AMIGOS',
		],
		it: [
			'MATITA',
			'LIBRO',
			'MAESTRA',
			'BANCO',
			'RIGHELLO',
			'GOMMA',
			'ZAINO',
			'GESSO',
			'RICREAZIONE',
			'AMICI',
		],
		nl: [
			'POTLOOD',
			'BOEK',
			'JUF',
			'TAFEL',
			'LINIAAL',
			'GUM',
			'RUGZAK',
			'KRIJT',
			'PAUZE',
			'VRIENDEN',
		],
	},
	{
		id: 'space',
		label: 'Space',
		en: [
			'PLANET',
			'ROCKET',
			'STAR',
			'MOON',
			'COMET',
			'ASTRONAUT',
			'GALAXY',
			'ORBIT',
			'SUN',
			'TELESCOPE',
		],
		de: [
			'PLANET',
			'RAKETE',
			'STERN',
			'MOND',
			'KOMET',
			'ASTRONAUT',
			'GALAXIE',
			'UMLAUFBAHN',
			'SONNE',
			'TELESKOP',
		],
		es: [
			'PLANETA',
			'COHETE',
			'ESTRELLA',
			'LUNA',
			'COMETA',
			'ASTRONAUTA',
			'GALAXIA',
			'ÓRBITA',
			'SOL',
			'TELESCOPIO',
		],
		fr: [
			'PLANÈTE',
			'FUSÉE',
			'ÉTOILE',
			'LUNE',
			'COMÈTE',
			'ASTRONAUTE',
			'GALAXIE',
			'ORBITE',
			'SOLEIL',
			'TÉLESCOPE',
		],
		pt: [
			'PLANETA',
			'FOGUETE',
			'ESTRELA',
			'LUA',
			'COMETA',
			'ASTRONAUTA',
			'GALÁXIA',
			'ÓRBITA',
			'SOL',
			'TELESCÓPIO',
		],
		it: [
			'PIANETA',
			'RAZZO',
			'STELLA',
			'LUNA',
			'COMETA',
			'ASTRONAUTA',
			'GALASSIA',
			'ORBITA',
			'SOLE',
			'TELESCOPIO',
		],
		nl: [
			'PLANEET',
			'RAKET',
			'STER',
			'MAAN',
			'KOMEET',
			'ASTRONAUT',
			'MELKWEG',
			'BAAN',
			'ZON',
			'TELESCOOP',
		],
	},
	{
		id: 'ocean',
		label: 'Ocean',
		en: [
			'FISH',
			'WHALE',
			'DOLPHIN',
			'OCTOPUS',
			'CRAB',
			'SHELL',
			'CORAL',
			'WAVE',
			'TURTLE',
			'STARFISH',
		],
		de: [
			'FISCH',
			'WAL',
			'DELFIN',
			'KRAKE',
			'KRABBE',
			'MUSCHEL',
			'KORALLE',
			'WELLE',
			'SCHILDKRÖTE',
			'SEESTERN',
		],
		es: [
			'PEZ',
			'BALLENA',
			'DELFÍN',
			'PULPO',
			'CANGREJO',
			'CONCHA',
			'CORAL',
			'OLA',
			'TORTUGA',
			'MEDUSA',
		],
		fr: [
			'POISSON',
			'BALEINE',
			'DAUPHIN',
			'PIEUVRE',
			'CRABE',
			'COQUILLAGE',
			'CORAIL',
			'VAGUE',
			'TORTUE',
			'MÉDUSE',
		],
		pt: [
			'PEIXE',
			'BALEIA',
			'GOLFINHO',
			'POLVO',
			'CARANGUEJO',
			'CONCHA',
			'CORAL',
			'ONDA',
			'TARTARUGA',
			'MEDUSA',
		],
		it: [
			'PESCE',
			'BALENA',
			'DELFINO',
			'POLPO',
			'GRANCHIO',
			'CONCHIGLIA',
			'CORALLO',
			'ONDA',
			'TARTARUGA',
			'MEDUSA',
		],
		nl: [
			'VIS',
			'WALVIS',
			'DOLFIJN',
			'OCTOPUS',
			'KRAB',
			'SCHELP',
			'KORAAL',
			'GOLF',
			'SCHILDPAD',
			'ZEESTER',
		],
	},
	{
		id: 'farm',
		label: 'Farm',
		en: [
			'COW',
			'PIG',
			'SHEEP',
			'HORSE',
			'CHICKEN',
			'TRACTOR',
			'BARN',
			'GOAT',
			'DUCK',
			'FARMER',
		],
		de: [
			'KUH',
			'SCHWEIN',
			'SCHAF',
			'PFERD',
			'HUHN',
			'TRAKTOR',
			'SCHEUNE',
			'ZIEGE',
			'ENTE',
			'BAUER',
		],
		es: [
			'VACA',
			'CERDO',
			'OVEJA',
			'CABALLO',
			'GALLINA',
			'TRACTOR',
			'GRANERO',
			'CABRA',
			'PATO',
			'GRANJERO',
		],
		fr: [
			'VACHE',
			'COCHON',
			'MOUTON',
			'CHEVAL',
			'POULE',
			'TRACTEUR',
			'GRANGE',
			'CHÈVRE',
			'CANARD',
			'FERMIER',
		],
		pt: [
			'VACA',
			'PORCO',
			'OVELHA',
			'CAVALO',
			'GALINHA',
			'TRATOR',
			'CELEIRO',
			'CABRA',
			'PATO',
			'FAZENDEIRO',
		],
		it: [
			'MUCCA',
			'MAIALE',
			'PECORA',
			'CAVALLO',
			'GALLINA',
			'TRATTORE',
			'FIENILE',
			'CAPRA',
			'ANATRA',
			'CONTADINO',
		],
		nl: [
			'KOE',
			'VARKEN',
			'SCHAAP',
			'PAARD',
			'KIP',
			'TRACTOR',
			'SCHUUR',
			'GEIT',
			'EEND',
			'BOER',
		],
	},
	{
		id: 'food',
		label: 'Fruit and vegetables',
		en: [
			'APPLE',
			'BANANA',
			'CHERRY',
			'GRAPE',
			'LEMON',
			'CARROT',
			'TOMATO',
			'PEAR',
			'POTATO',
			'ONION',
		],
		de: [
			'APFEL',
			'BANANE',
			'KIRSCHE',
			'TRAUBE',
			'ZITRONE',
			'KAROTTE',
			'TOMATE',
			'BIRNE',
			'KARTOFFEL',
			'ZWIEBEL',
		],
		es: [
			'MANZANA',
			'PLÁTANO',
			'CEREZA',
			'UVA',
			'LIMÓN',
			'ZANAHORIA',
			'TOMATE',
			'PERA',
			'PATATA',
			'CEBOLLA',
		],
		fr: [
			'POMME',
			'BANANE',
			'CERISE',
			'RAISIN',
			'CITRON',
			'CAROTTE',
			'TOMATE',
			'POIRE',
			'NAVET',
			'OIGNON',
		],
		pt: [
			'MAÇÃ',
			'BANANA',
			'CEREJA',
			'UVA',
			'LIMÃO',
			'CENOURA',
			'TOMATE',
			'PERA',
			'BATATA',
			'CEBOLA',
		],
		it: [
			'MELA',
			'BANANA',
			'CILIEGIA',
			'UVA',
			'LIMONE',
			'CAROTA',
			'POMODORO',
			'PERA',
			'PATATA',
			'CIPOLLA',
		],
		nl: [
			'APPEL',
			'BANAAN',
			'KERS',
			'DRUIF',
			'CITROEN',
			'WORTEL',
			'TOMAAT',
			'PEER',
			'AARDAPPEL',
			'PRUIM',
		],
	},
	{
		id: 'sports',
		label: 'Sports',
		en: [
			'SOCCER',
			'TENNIS',
			'SWIMMING',
			'RUNNING',
			'CYCLING',
			'SKIING',
			'BASKETBALL',
			'HOCKEY',
			'JUDO',
			'GOLF',
		],
		de: [
			'FUSSBALL',
			'TENNIS',
			'SCHWIMMEN',
			'LAUFEN',
			'RADFAHREN',
			'SKIFAHREN',
			'BASKETBALL',
			'HOCKEY',
			'JUDO',
			'GOLF',
		],
		es: [
			'FÚTBOL',
			'TENIS',
			'NATACIÓN',
			'CARRERA',
			'CICLISMO',
			'ESQUÍ',
			'BALONCESTO',
			'HOCKEY',
			'JUDO',
			'GOLF',
		],
		fr: [
			'FOOTBALL',
			'TENNIS',
			'NATATION',
			'COURSE',
			'CYCLISME',
			'SKI',
			'BASKET',
			'HOCKEY',
			'JUDO',
			'GOLF',
		],
		pt: [
			'FUTEBOL',
			'TÊNIS',
			'NATAÇÃO',
			'CORRIDA',
			'CICLISMO',
			'ESQUI',
			'BASQUETE',
			'HÓQUEI',
			'JUDÔ',
			'GOLFE',
		],
		it: [
			'CALCIO',
			'TENNIS',
			'NUOTO',
			'CORSA',
			'CICLISMO',
			'SCI',
			'BASKET',
			'HOCKEY',
			'JUDO',
			'GOLF',
		],
		nl: [
			'VOETBAL',
			'TENNIS',
			'ZWEMMEN',
			'HARDLOPEN',
			'FIETSEN',
			'SKIEN',
			'BASKETBAL',
			'HOCKEY',
			'JUDO',
			'GOLF',
		],
	},
	{
		id: 'vehicles',
		label: 'Vehicles',
		en: [
			'CAR',
			'BUS',
			'TRAIN',
			'PLANE',
			'BOAT',
			'BICYCLE',
			'TRUCK',
			'TRACTOR',
			'ROCKET',
			'HELICOPTER',
		],
		de: [
			'AUTO',
			'BUS',
			'ZUG',
			'FLUGZEUG',
			'BOOT',
			'FAHRRAD',
			'LASTWAGEN',
			'TRAKTOR',
			'RAKETE',
			'HUBSCHRAUBER',
		],
		es: [
			'COCHE',
			'AUTOBÚS',
			'TREN',
			'AVIÓN',
			'BARCO',
			'BICICLETA',
			'CAMIÓN',
			'TRACTOR',
			'COHETE',
			'HELICÓPTERO',
		],
		fr: [
			'VOITURE',
			'AUTOBUS',
			'TRAIN',
			'AVION',
			'BATEAU',
			'VÉLO',
			'CAMION',
			'TRACTEUR',
			'FUSÉE',
			'HÉLICOPTÈRE',
		],
		pt: [
			'CARRO',
			'ÔNIBUS',
			'TREM',
			'AVIÃO',
			'BARCO',
			'BICICLETA',
			'CAMINHÃO',
			'TRATOR',
			'FOGUETE',
			'HELICÓPTERO',
		],
		it: [
			'AUTO',
			'AUTOBUS',
			'TRENO',
			'AEREO',
			'BARCA',
			'BICICLETTA',
			'CAMION',
			'TRATTORE',
			'RAZZO',
			'ELICOTTERO',
		],
		nl: [
			'AUTO',
			'BUS',
			'TREIN',
			'VLIEGTUIG',
			'BOOT',
			'FIETS',
			'VRACHTWAGEN',
			'TRACTOR',
			'RAKET',
			'HELIKOPTER',
		],
	},
];
const THEME_LABELS = {
	animals: 'Animals',
	party: 'Party',
	summer: 'Summer',
	christmas: 'Christmas',
	wedding: 'Wedding',
	easter: 'Easter',
	halloween: 'Halloween',
	autumn: 'Autumn',
	winter: 'Winter',
	school: 'School',
	space: 'Space',
	ocean: 'Ocean',
	farm: 'Farm',
	food: 'Fruit and vegetables',
	sports: 'Sports',
	vehicles: 'Vehicles',
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
	sheet: tabIcon(
		'M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2 M9 5a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2 M9 12h6 M9 16h6'
	),
	settings: tabIcon(
		'M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065 M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0'
	),
};

const MODES = [
	{ id: 'wordsearch', label: 'Word search' },
	{ id: 'crossword', label: 'Crossword' },
	{ id: 'piccross', label: 'Picture crossword' },
	{ id: 'maze', label: 'Maze' },
	{ id: 'circlemaze', label: 'Circle maze' },
	{ id: 'jigsaw', label: 'Photo jigsaw' },
	{ id: 'dot2dot', label: 'Dot to dot' },
	{ id: 'sudoku', label: 'Sudoku' },
	{ id: 'picsudoku', label: 'Picture sudoku' },
	{ id: 'binary', label: 'Binary puzzle' },
	{ id: 'inequality', label: 'Inequality puzzle' },
	{ id: 'mathchains', label: 'Math chains' },
	{ id: 'arith', label: 'Arithmetic' },
	{ id: 'clock', label: 'Telling time' },
	{ id: 'crisscross', label: 'Criss-cross' },
	{ id: 'bingo', label: 'Bingo cards' },
	{ id: 'cryptogram', label: 'Secret code' },
	{ id: 'pyramid', label: 'Number pyramid' },
	{ id: 'magic', label: 'Magic squares' },
	{ id: 'nonogram', label: 'Nonogram' },
	{ id: 'anagram', label: 'Anagrams' },
	{ id: 'missing', label: 'Missing letters' },
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
	if ( ! String( params.picClues || '' ).trim() ) {
		params.picClues = defaultPicClues( LANG );
	}
	// The word search reads an image only for its silhouette shape.
	const wantsImage = () =>
		NEEDS_IMAGE.includes( params.mode ) ||
		( 'maze' === params.mode && 'image' === params.shape ) ||
		( 'nonogram' === params.mode && 'image' === params.nonoShape ) ||
		( 'wordsearch' === params.mode && 'image' === params.wsShape );

	let srcCanvas = null;
	let srcToken = 0;

	const host = document.getElementById( 'wpie-root' ) || document.body;
	const backdrop = el( 'div', 'modal-backdrop', host );
	const dialog = el( 'div', 'dsm wpiepzl-dialog', backdrop );
	dialog.onclick = ( e ) => e.stopPropagation();
	const head = el( 'div', 'dsm-head', dialog );
	// Die Marke kommt aus dem Kit (bridge.ui), nicht aus dem Paket.
	window.WPIE.bridge.ui.badge( head );
	const titles = el( 'div', 'dsm-titles', head );
	el( 'span', 'dsm-title', titles, 'Puzzle Sheets' );
	el(
		'div',
		'dsm-sub',
		titles,
		t( 'Printable puzzles and games with solution sheets.' )
	);
	const closeBtn = el( 'button', 'dsm-x', head );
	closeBtn.innerHTML = '&times;';
	closeBtn.setAttribute( 'aria-label', t( 'Close' ) );

	const ui = bridge.ui;
	const body = el( 'div', 'wpiepzl-body', dialog );
	const library = el( 'div', 'dsm-col start wpiepzl-library', body );
	const view = el( 'div', 'wpiepzl-view', body );
	const canvas = el( 'canvas', null, view );
	const side = el( 'div', 'dsm-col end wpiepzl-side', body );
	const status = el( 'div', 'dsm-viewhint wpiepzl-status', view );
	const setStatus = ( msg, isErr ) => {
		status.textContent = msg || '';
		status.classList.toggle( 'on', !! msg );
		status.classList.toggle( 'err', !! isErr );
	};

	const section = ( parent, icon, label ) => {
		const content = ui.section( parent, { icon, title: label } );
		content.parentElement.classList.add( 'wpiepzl-card' );
		return content;
	};

	/* --------------------------- puzzle cards ----------------------------- */

	const modeSec = section( library, ICONS.puzzle, t( 'Puzzle' ) );
	const modeGrid = ui.picks( modeSec, { cell: 110, cls: 'wpiepzl-cards' } );
	const modeTiles = new Map();
	for ( const m of MODES ) {
		const thumb = document.createElement( 'canvas' );
		thumb.width = 198;
		thumb.height = 138;
		thumb.setAttribute( 'aria-hidden', 'true' );
		const { node: card } = ui.pick( modeGrid, {
			label: t( m.label ),
			thumb,
			cls: 'wpiepzl-tcard',
			on: params.mode === m.id,
		} );
		card.dataset.mode = m.id;
		card.onclick = () => {
			params.mode = m.id;
			syncUi();
			if ( wantsImage() && ! srcCanvas ) {
				loadSource();
			} else {
				paint();
			}
		};
		modeTiles.set( m.id, { card, thumb } );
	}
	const warn = el( 'div', 'dsm-note wpiepzl-info', modeSec );

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
			binary: () =>
				renderLogicGrid(
					like(),
					buildBinary( { size: 4, seed: 3 } ),
					opts
				),
			inequality: () =>
				renderLogicGrid(
					like(),
					buildInequality( { size: 4, seed: 3 } ),
					opts
				),
			mathchains: () =>
				renderMathChains(
					like(),
					buildMathChains( { rows: 4, steps: 3, seed: 3 } ),
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
			circlemaze: () =>
				renderCircleMaze(
					like(),
					buildCircleMaze( { rings: 5, seed: 4 } ),
					opts
				),
			arith: () =>
				renderArithmetic(
					like(),
					buildArithmetic( {
						ops: 'addsub',
						max: 20,
						count: 6,
						seed: 2,
					} ),
					opts
				),
			clock: () =>
				renderClocks(
					like(),
					buildClocks( { count: 4, step: 'quarter', seed: 2 } ),
					opts
				),
			picsudoku: () =>
				renderSudoku(
					like(),
					buildSudoku( { size: 4, diff: 1, seed: 3 } ),
					{ ...opts, symbols: [ '🍎', '🐟', '🌟', '🚗' ] }
				),
			piccross: () => {
				const cc = buildCrissCross( [ 'SUN', 'SEA', 'SAND' ], {
					seed: 2,
				} );
				return renderCrossword(
					like(),
					cc,
					buildCrosswordClues( cc, {
						SUN: '☀️',
						SEA: '🌊',
						SAND: '🏖️',
					} ),
					{ ...opts, pictures: true }
				);
			},
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
					{
						...opts,
						hint: true,
					}
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
			missing: () =>
				renderMissingLetters(
					like(),
					buildMissingLetters( [ 'SUN', 'SEA', 'SAND', 'SHELL' ], {
						seed: 3,
						gaps: 40,
					} ),
					opts
				),
			magic: () =>
				renderMagicSquares(
					like(),
					buildMagicSquares( { count: 1, seed: 3, clues: 4 } ),
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

	// The picture a sheet is made from sits at the top of the right-hand
	// panel, with the other settings (Thomas, 26.09.2026) - the left column
	// is for choosing the puzzle.
	const srcSec = section( side, ICONS.source, t( 'Source' ) );
	const srcSel = el( 'select', 'dsm-select wpiepzl-wide', srcSec );
	const srcNote = el( 'div', 'dsm-note wpiepzl-info', srcSec );

	function fillSourceOptions() {
		srcSel.innerHTML = '';
		const add = ( v, label ) => {
			const o = el( 'option', null, srcSel );
			o.value = v;
			o.textContent = label;
		};
		add( 'doc', t( 'Whole document' ) );
		// Der Kern haelt EINE FLACHE Ebenenliste, und group.children sind
		// IDs, keine Objekte. Die alte Rekursion lief damit ueber Strings:
		// l.type und l.name waren undefined, jedes Kind wurde als
		// "layer:undefined" mit der Beschriftung "undefined" angeboten - und
		// danach standen dieselben Ebenen noch einmal flach in der Liste,
		// weil sie dort ohnehin schon drin sind. (Audit F15.)
		const walk = ( layers ) => {
			const list = layers || [];
			for ( const l of list ) {
				if ( ! l || ! l.id || 'group' === l.type ) {
					continue;
				}
				add(
					'layer:' + l.id,
					( l.parent ? '  ' : '' ) + ( l.name || l.type )
				);
			}
		};
		walk( editor.state.layers );
		add( 'media', t( 'Media library' ) );
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
				const flat = editor.state.layers || [];
				const target = flat.find( ( l ) => String( l.id ) === id );
				if ( target ) {
					// The layer may be the child of a group: the renderer
					// starts at roots without a parent and never reached it,
					// so a grouped photo arrived as an empty canvas (audit
					// F15, 10.09.2026). Render a parent-less copy and hand the
					// renderer its descendants for a group.
					const byId = new Map(
						flat.map( ( l ) => [ String( l.id ), l ] )
					);
					const members = new Set();
					const collect = ( item ) => {
						if ( ! item || members.has( item.id ) ) {
							return;
						}
						members.add( item.id );
						( item.children || [] ).forEach( ( cid ) =>
							collect( byId.get( String( cid ) ) )
						);
					};
					collect( target );
					const selected = flat.filter( ( l ) =>
						members.has( l.id )
					);
					await bridge.raster.sharedImageCache?.warm?.( selected );
					c = await bridge.raster.renderToCanvas(
						editor.state.doc,
						[ { ...target, parent: null } ],
						{
							scale: Math.min( 1, 600 / editor.state.doc.w ),
							cache: bridge.raster.sharedImageCache,
							allLayers: selected,
						}
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
		const b = el( 'button', 'dsm-strip wpiepzl-pal', palWrap );
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
		const brandLbl = el( 'label', 'dsm-checkrow wpiepzl-check', colSec );
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
	el( 'span', 'dsm-rowline-label', customRow ).textContent =
		t( 'Custom colors' );
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
	const resetBtn = el(
		'button',
		'ai-btn secondary wpiepzl-reset',
		customRow
	);
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
	el( 'span', 'dsm-fieldlabel', titleRow ).textContent = t( 'Title' );
	const titleArea = el( 'textarea', 'dsm-input wpiepzl-words', titleRow );
	titleArea.rows = 2;
	titleArea.value = params.title;
	titleArea.oninput = () => {
		params.title = titleArea.value;
		paint();
	};

	// Typography: editor font catalog + size factor.
	const fontRow = el( 'div', 'wpiepzl-text-row', setSec );
	el( 'span', 'dsm-fieldlabel', fontRow ).textContent = t( 'Font' );
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
		el( 'span', 'dsm-rowline-label', row ).textContent = label;
		const input = el( 'input', 'dsm-range', row );
		input.type = 'range';
		input.min = String( min );
		input.max = String( max );
		input.value = String( get() );
		const out = el( 'output', 'dsm-sliderrow-val', row );
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
	el( 'span', 'dsm-fieldlabel', wordsRow ).textContent = t(
		'Words (one per line)'
	);
	const wordsArea = el( 'textarea', 'dsm-input wpiepzl-words', wordsRow );
	wordsArea.rows = 6;
	wordsArea.value = params.words;
	wordsArea.oninput = () => {
		params.words = wordsArea.value;
		paint();
	};
	const themeRow = el( 'label', 'wpiepzl-row', setSec );
	el( 'span', 'dsm-rowline-label', themeRow ).textContent =
		t( 'Suggestions' );
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
	const hardLbl = el( 'label', 'dsm-checkrow wpiepzl-check', setSec );
	const hardCb = el( 'input', null, hardLbl );
	hardCb.type = 'checkbox';
	hardCb.checked = !! params.hard;
	el( 'span', null, hardLbl ).textContent = t( 'All directions (hard)' );
	hardCb.onchange = () => {
		params.hard = hardCb.checked;
		paint();
	};

	// Word search in a shape: the maze and nonogram shapes, or square.
	const SHAPE_NAMES = {
		square: 'Square',
		circle: 'Circle',
		heart: 'Heart',
		star: 'Star',
		hexagon: 'Hexagon',
		diamond: 'Diamond',
		flower: 'Flower',
		letter: 'Letter',
		image: 'Image silhouette',
	};
	const wsShapeRow = el( 'label', 'wpiepzl-row', setSec );
	el( 'span', 'dsm-rowline-label', wsShapeRow ).textContent = t( 'Shape' );
	const wsShapeSel = el( 'select', 'dsm-select', wsShapeRow );
	for ( const v of [ 'square', ...MAZE_SHAPES ] ) {
		const o = el( 'option', null, wsShapeSel );
		o.value = v;
		o.textContent = t( SHAPE_NAMES[ v ] || v );
	}
	wsShapeSel.value = params.wsShape;
	wsShapeSel.onchange = () => {
		params.wsShape = wsShapeSel.value;
		syncUi();
		if ( 'image' === params.wsShape && ! srcCanvas ) {
			loadSource();
		} else {
			paint();
		}
	};
	// The hidden message: the leftover letters spell it.
	const wsSecretRow = el( 'label', 'wpiepzl-text-row', setSec );
	el( 'span', 'dsm-fieldlabel', wsSecretRow ).textContent =
		t( 'Hidden message' );
	const wsSecretArea = el(
		'textarea',
		'dsm-input wpiepzl-words',
		wsSecretRow
	);
	wsSecretArea.rows = 2;
	wsSecretArea.value = params.wsSecret;
	wsSecretArea.oninput = () => {
		params.wsSecret = wsSecretArea.value;
		paint();
	};
	const wsSecretNote = ui.note(
		setSec,
		t(
			'The letters left over, read row by row, spell the message. The grid picks its own size.'
		)
	);

	// Maze: shape, letter, difficulty.
	const shapeRow = el( 'label', 'wpiepzl-row', setSec );
	el( 'span', 'dsm-rowline-label', shapeRow ).textContent = t( 'Shape' );
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
	el( 'span', 'dsm-rowline-label', letterRow ).textContent = t( 'Letter' );
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
		el( 'span', 'dsm-rowline-label', row ).textContent = t( 'Difficulty' );
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

	const logicSizeRow = el( 'label', 'wpiepzl-row', setSec );
	el( 'span', 'dsm-rowline-label', logicSizeRow, t( 'Grid size' ) );
	const logicSizeSel = ui.select( logicSizeRow, { options: [] } );
	logicSizeSel.onchange = () => {
		params[ params.mode === 'binary' ? 'binarySize' : 'inequalitySize' ] =
			Number( logicSizeSel.value );
		paint();
	};
	const logicDiffRow = diffRow(
		() => params.logicDiff,
		( v ) => ( params.logicDiff = v )
	);
	const mathRowsRow = sliderRowIn(
		setSec,
		t( 'Rows' ),
		4,
		12,
		() => params.mathRows,
		( v ) => ( params.mathRows = v )
	);
	const mathStepsRow = sliderRowIn(
		setSec,
		t( 'Steps' ),
		3,
		6,
		() => params.mathSteps,
		( v ) => ( params.mathSteps = v )
	);
	const mathDiffRow = diffRow(
		() => params.mathDiff,
		( v ) => ( params.mathDiff = v )
	);
	const rulesNote = ui.note( setSec, '' );

	// Sudoku: size + difficulty.
	const sudSizeRow = el( 'label', 'wpiepzl-row', setSec );
	el( 'span', 'dsm-rowline-label', sudSizeRow ).textContent =
		t( 'Grid size' );
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
	el( 'span', 'dsm-fieldlabel', phraseRow ).textContent = t(
		'Phrase (the secret message)'
	);
	const phraseArea = el( 'textarea', 'dsm-input wpiepzl-words', phraseRow );
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
	el( 'span', 'dsm-fieldlabel', cluesRow ).textContent =
		t( 'Clues (word: clue)' );
	const cluesArea = el( 'textarea', 'dsm-input wpiepzl-words', cluesRow );
	cluesArea.rows = 7;
	cluesArea.value = params.clues;
	cluesArea.oninput = () => {
		params.clues = cluesArea.value;
		paint();
	};

	// Picture crossword: word + picture pairs.
	const picCluesRow = el( 'label', 'wpiepzl-text-row', setSec );
	el( 'span', 'dsm-fieldlabel', picCluesRow ).textContent = t(
		'Words and pictures (word: picture)'
	);
	const picCluesArea = el(
		'textarea',
		'dsm-input wpiepzl-words',
		picCluesRow
	);
	picCluesArea.rows = 7;
	picCluesArea.value = params.picClues;
	picCluesArea.oninput = () => {
		params.picClues = picCluesArea.value;
		paint();
	};

	// The solution word of crossword and criss-cross: numbered cells.
	const secretRow = el( 'label', 'wpiepzl-row', setSec );
	el( 'span', 'dsm-rowline-label', secretRow ).textContent =
		t( 'Solution word' );
	const secretInput = el( 'input', 'dsm-input', secretRow );
	secretInput.type = 'text';
	secretInput.maxLength = 16;
	secretInput.value = params.secretWord;
	secretInput.oninput = () => {
		params.secretWord = secretInput.value;
		paint();
	};
	const secretNote = ui.note(
		setSec,
		t( 'The numbered cells spell it, for a prize draw or a surprise.' )
	);

	// Picture sudoku: the pictures, the size, the difficulty.
	const picMotifsRow = el( 'label', 'wpiepzl-text-row', setSec );
	el( 'span', 'dsm-fieldlabel', picMotifsRow ).textContent = t(
		'Pictures (emoji or short words)'
	);
	const picMotifsArea = el(
		'textarea',
		'dsm-input wpiepzl-words',
		picMotifsRow
	);
	picMotifsArea.rows = 2;
	picMotifsArea.value = params.picMotifs;
	picMotifsArea.oninput = () => {
		params.picMotifs = picMotifsArea.value;
		paint();
	};
	const picSizeRow = el( 'label', 'wpiepzl-row', setSec );
	el( 'span', 'dsm-rowline-label', picSizeRow ).textContent =
		t( 'Grid size' );
	const picSizeSel = el( 'select', 'dsm-select', picSizeRow );
	for ( const v of [ 4, 6, 9 ] ) {
		const o = el( 'option', null, picSizeSel );
		o.value = String( v );
		o.textContent = `${ v } × ${ v }`;
	}
	picSizeSel.value = String( params.picSize );
	picSizeSel.onchange = () => {
		params.picSize = parseInt( picSizeSel.value, 10 );
		paint();
	};
	const picDiffRow = diffRow(
		() => params.picDiff,
		( v ) => ( params.picDiff = v )
	);

	// Nonogram: shape (shares the maze vocabulary) + grid size.
	const nonoShapeRow = el( 'label', 'wpiepzl-row', setSec );
	el( 'span', 'dsm-rowline-label', nonoShapeRow ).textContent = t( 'Shape' );
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
	const anagHintLbl = el( 'label', 'dsm-checkrow wpiepzl-check', setSec );
	const anagHintCb = el( 'input', null, anagHintLbl );
	anagHintCb.type = 'checkbox';
	anagHintCb.checked = !! params.anagHint;
	el( 'span', null, anagHintLbl ).textContent = t( 'First letter hint' );
	anagHintCb.onchange = () => {
		params.anagHint = anagHintCb.checked;
		paint();
	};

	// Missing letters (2.8): how much of each word is left out.
	const missGapsRow = sliderRowIn(
		setSec,
		t( 'Letters left out' ),
		20,
		70,
		() => params.missGaps,
		( v ) => ( params.missGaps = v ),
		'%'
	);

	// Memory: motifs + pairs.
	const memMotifsRow = el( 'label', 'wpiepzl-text-row', setSec );
	el( 'span', 'dsm-fieldlabel', memMotifsRow ).textContent = t(
		'Motifs (emoji or words)'
	);
	const memMotifsArea = el(
		'textarea',
		'dsm-input wpiepzl-words',
		memMotifsRow
	);
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
	el( 'span', 'dsm-rowline-label', gameRow ).textContent = t( 'Game' );
	const gameSel = el( 'select', 'dsm-select', gameRow );
	for ( const [ v, l ] of [
		[ 'slf', t( 'City-Country-River' ) ],
		[ 'ships', t( 'Battleships' ) ],
		[ 'boxes', t( 'Dots & Boxes' ) ],
		[ 'hangman', t( 'Hangman' ) ],
		[ 'tictactoe', t( 'Tic-tac-toe' ) ],
		[ 'codebreaker', t( 'Code breaker' ) ],
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
	el( 'span', 'dsm-fieldlabel', slfCatsRow ).textContent = t(
		'Categories (one per line)'
	);
	const slfCatsArea = el( 'textarea', 'dsm-input wpiepzl-words', slfCatsRow );
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
		'dsm-note wpiepzl-info',
		setSec,
		t( 'Sheets in the pack:' )
	);
	const packRows = [];
	const packCheck = ( key, label ) => {
		const lbl = el( 'label', 'dsm-checkrow wpiepzl-check', setSec );
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
	el( 'span', 'dsm-rowline-label', bingoGridRow ).textContent =
		t( 'Card size' );
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
	const bingoFreeLbl = el( 'label', 'dsm-checkrow wpiepzl-check', setSec );
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

	// A select row from [ value, label ] pairs, the value kept as `key`.
	const selectRow = ( label, key, pairs, numeric = false ) => {
		const row = el( 'label', 'wpiepzl-row', setSec );
		el( 'span', 'dsm-rowline-label', row ).textContent = label;
		const sel = el( 'select', 'dsm-select', row );
		for ( const [ v, l ] of pairs ) {
			const o = el( 'option', null, sel );
			o.value = String( v );
			o.textContent = l;
		}
		sel.value = String( params[ key ] );
		sel.onchange = () => {
			params[ key ] = numeric ? parseInt( sel.value, 10 ) : sel.value;
			syncUi();
			paint();
		};
		return row;
	};

	// Magic squares (2.8).
	const magicRangeRow = selectRow( t( 'Numbers' ), 'magicRange', [
		[ 'small', t( '1 to 9' ) ],
		[ 'even', t( 'Even numbers 2 to 18' ) ],
		[ 'teens', t( '11 to 19' ) ],
		[ 'tens', t( 'Tens 10 to 90' ) ],
	] );
	const magicCluesRow = selectRow(
		t( 'Given numbers' ),
		'magicClues',
		[ 2, 3, 4, 5 ].map( ( v ) => [ v, String( v ) ] ),
		true
	);
	const magicCountRow = selectRow(
		t( 'Squares per sheet' ),
		'magicCount',
		[ 1, 2, 4, 6 ].map( ( v ) => [ v, String( v ) ] ),
		true
	);

	// Arithmetic drills.
	const arithOpsRow = selectRow( t( 'Tasks' ), 'arithOps', [
		[ 'add', t( 'Addition' ) ],
		[ 'sub', t( 'Subtraction' ) ],
		[ 'addsub', t( 'Plus and minus' ) ],
		[ 'mul', t( 'Multiplication' ) ],
		[ 'div', t( 'Division' ) ],
		[ 'muldiv', t( 'Times and divided by' ) ],
		[ 'all', t( 'All four' ) ],
	] );
	const arithMaxRow = selectRow(
		t( 'Numbers up to' ),
		'arithMax',
		[ 10, 20, 100, 1000 ].map( ( v ) => [ v, String( v ) ] ),
		true
	);
	const arithCountRow = sliderRowIn(
		setSec,
		t( 'Tasks on the sheet' ),
		8,
		40,
		() => params.arithCount,
		( v ) => ( params.arithCount = v )
	);
	const arithLayoutRow = selectRow( t( 'Layout' ), 'arithLayout', [
		[ 'rows', t( 'In rows' ) ],
		[ 'columns', t( 'Written, in columns' ) ],
	] );
	const arithGapsLbl = el( 'label', 'dsm-checkrow wpiepzl-check', setSec );
	const arithGapsCb = el( 'input', null, arithGapsLbl );
	arithGapsCb.type = 'checkbox';
	arithGapsCb.checked = !! params.arithGaps;
	el( 'span', null, arithGapsLbl ).textContent = t(
		'Missing number anywhere'
	);
	arithGapsCb.onchange = () => {
		params.arithGaps = arithGapsCb.checked;
		paint();
	};

	// Telling time.
	const clockTaskRow = selectRow( t( 'Task' ), 'clockTask', [
		[ 'read', t( 'Read the time' ) ],
		[ 'draw', t( 'Draw the hands' ) ],
		[ 'mixed', t( 'Both' ) ],
	] );
	const clockStepRow = selectRow( t( 'Times' ), 'clockStep', [
		[ 'hour', t( 'Full hours' ) ],
		[ 'half', t( 'Half hours' ) ],
		[ 'quarter', t( 'Quarter hours' ) ],
		[ 'five', t( 'Five minutes' ) ],
		[ 'minute', t( 'Every minute' ) ],
	] );
	const clockCountRow = selectRow(
		t( 'Clocks' ),
		'clockCount',
		[ 4, 6, 9, 12 ].map( ( v ) => [ v, String( v ) ] ),
		true
	);

	// Circle maze: how many rings.
	const ringsRow = sliderRowIn(
		setSec,
		t( 'Rings' ),
		5,
		18,
		() => params.rings,
		( v ) => ( params.rings = v )
	);

	const shuffleBtn = el( 'button', 'ai-btn secondary wpiepzl-wide', setSec );
	shuffleBtn.type = 'button';
	shuffleBtn.textContent = t( 'Shuffle' );
	shuffleBtn.onclick = () => {
		params.seed = 1 + Math.floor( Math.random() * 99999 );
		paint();
	};
	const solLbl = el( 'label', 'dsm-checkrow wpiepzl-check', setSec );
	const solCb = el( 'input', null, solLbl );
	solCb.type = 'checkbox';
	solCb.checked = !! params.withSolution;
	const solLblText = el( 'span', null, solLbl );
	solLblText.textContent = t( 'Solution sheet' );
	solCb.onchange = () => {
		params.withSolution = solCb.checked;
		paint();
	};

	/* ------------------------------ worksheet ----------------------------- */

	// The head a teacher needs on the page, and several puzzles per page.
	const sheetSec = section( side, ICONS.sheet, t( 'Worksheet' ) );
	const headLbl = el( 'label', 'dsm-checkrow wpiepzl-check', sheetSec );
	const headCb = el( 'input', null, headLbl );
	headCb.type = 'checkbox';
	headCb.checked = !! params.sheetHeader;
	el( 'span', null, headLbl ).textContent = t(
		'Line for name, class and date'
	);
	headCb.onchange = () => {
		params.sheetHeader = headCb.checked;
		paint();
	};
	const taskRow = el( 'label', 'wpiepzl-text-row', sheetSec );
	el( 'span', 'dsm-fieldlabel', taskRow ).textContent =
		t( 'Task (optional)' );
	const taskArea = el( 'textarea', 'dsm-input wpiepzl-words', taskRow );
	taskArea.rows = 2;
	taskArea.value = params.instructions;
	taskArea.oninput = () => {
		params.instructions = taskArea.value;
		paint();
	};
	const perPageRow = el( 'label', 'wpiepzl-row', sheetSec );
	el( 'span', 'dsm-rowline-label', perPageRow ).textContent =
		t( 'Puzzles per page' );
	const perPageSel = el( 'select', 'dsm-select', perPageRow );
	for ( const v of [ 1, 2, 4, 6 ] ) {
		const o = el( 'option', null, perPageSel );
		o.value = String( v );
		o.textContent = String( v );
	}
	perPageSel.value = String( params.perPage );
	perPageSel.onchange = () => {
		params.perPage = parseInt( perPageSel.value, 10 );
		paint();
	};
	const perPageNote = ui.note(
		sheetSec,
		t(
			'Every puzzle on the page is a different one, each with its number.'
		)
	);
	const seriesRow = el( 'label', 'wpiepzl-row', sheetSec );
	el( 'span', 'dsm-rowline-label', seriesRow ).textContent = t( 'Versions' );
	const seriesSel = el( 'select', 'dsm-select', seriesRow );
	for ( let v = 1; v <= 10; v++ ) {
		const o = el( 'option', null, seriesSel );
		o.value = String( v );
		o.textContent =
			1 === v ? '1' : `${ v } (A-${ String.fromCharCode( 64 + v ) })`;
	}
	seriesSel.value = String( params.series );
	seriesSel.onchange = () => {
		params.series = parseInt( seriesSel.value, 10 );
		paint();
	};
	const seriesNote = ui.note(
		sheetSec,
		t(
			'Each version is a different puzzle and its own layer, marked A, B, C. The solutions share one sheet.'
		)
	);

	const syncUi = () => {
		modeTiles.forEach( ( { card }, id ) =>
			ui.pressed( card, id === params.mode )
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
		const logic = m === 'binary' || m === 'inequality';
		logicSizeRow.style.display = logic ? '' : 'none';
		logicDiffRow.style.display = logic ? '' : 'none';
		if ( logic ) {
			logicSizeSel.textContent = '';
			for ( const n of m === 'binary' ? [ 4, 6, 8 ] : [ 4, 5, 6 ] ) {
				const option = el(
					'option',
					null,
					logicSizeSel,
					`${ n } × ${ n }`
				);
				option.value = String( n );
			}
			logicSizeSel.value = String(
				params[ m === 'binary' ? 'binarySize' : 'inequalitySize' ]
			);
		}
		for ( const row of [ mathRowsRow, mathStepsRow, mathDiffRow ] ) {
			row.style.display = m === 'mathchains' ? '' : 'none';
		}
		rulesNote.textContent = puzzleRules( m );
		rulesNote.style.display = rulesNote.textContent ? '' : 'none';
		const words = 'wordsearch' === m || 'crisscross' === m || 'bingo' === m;
		wordsRow.style.display = words ? '' : 'none';
		themeRow.style.display = words ? '' : 'none';
		const ws = 'wordsearch' === m;
		const hasMessage = ws && !! String( params.wsSecret || '' ).trim();
		// With a hidden message the grid picks its own size.
		gridRow.style.display = ws && ! hasMessage ? '' : 'none';
		hardLbl.style.display = ws ? '' : 'none';
		wsShapeRow.style.display = ws ? '' : 'none';
		wsSecretRow.style.display = ws ? '' : 'none';
		wsSecretNote.style.display = ws ? '' : 'none';
		const secretModes = [ 'crossword', 'piccross', 'crisscross' ];
		secretRow.style.display = secretModes.includes( m ) ? '' : 'none';
		secretNote.style.display = secretModes.includes( m ) ? '' : 'none';
		picCluesRow.style.display = 'piccross' === m ? '' : 'none';
		for ( const row of [ picMotifsRow, picSizeRow, picDiffRow ] ) {
			row.style.display = 'picsudoku' === m ? '' : 'none';
		}
		perPageRow.style.display = PER_PAGE.includes( m ) ? '' : 'none';
		perPageNote.style.display = PER_PAGE.includes( m ) ? '' : 'none';
		seriesRow.style.display = SERIES.includes( m ) ? '' : 'none';
		seriesNote.style.display = SERIES.includes( m ) ? '' : 'none';
		const arith = 'arith' === m;
		for ( const row of [
			arithOpsRow,
			arithMaxRow,
			arithCountRow,
			arithGapsLbl,
		] ) {
			row.style.display = arith ? '' : 'none';
		}
		// Written arithmetic exists for sums and differences only.
		arithLayoutRow.style.display =
			arith && [ 'add', 'sub', 'addsub' ].includes( params.arithOps )
				? ''
				: 'none';
		for ( const row of [ clockTaskRow, clockStepRow, clockCountRow ] ) {
			row.style.display = 'clock' === m ? '' : 'none';
		}
		ringsRow.style.display = 'circlemaze' === m ? '' : 'none';
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
		missGapsRow.style.display = 'missing' === m ? '' : 'none';
		for ( const row of [ magicRangeRow, magicCluesRow, magicCountRow ] ) {
			row.style.display = 'magic' === m ? '' : 'none';
		}
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
		if ( 'anagram' === m || 'missing' === m || 'pack' === m ) {
			wordsRow.style.display = '';
			themeRow.style.display = '';
		}
		if ( 'nonogram' === m && 'letter' === params.nonoShape ) {
			letterRow.style.display = '';
		}
		if ( ws && 'letter' === params.wsShape ) {
			letterRow.style.display = '';
		}
		// Bingo and the game sheets have no solution; memory repurposes
		// the slot as the duplex back sheet.
		solLbl.style.display = 'bingo' === m || 'games' === m ? 'none' : '';
		solLblText.textContent =
			'memory' === m ? t( 'Back sheet (duplex)' ) : t( 'Solution sheet' );
		srcSec.parentElement.style.display = wantsImage() ? '' : 'none';
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

	const puzzleRules = ( mode ) => {
		if ( mode === 'binary' ) {
			return t(
				'Fill each row and column with equal numbers of 0s and 1s. No three identical neighbors. Every row and every column must be different.'
			);
		}
		if ( mode === 'inequality' ) {
			return t(
				'Use each number from 1 to the grid size once in every row and column. The narrow tip of each sign points to the smaller number.'
			);
		}
		if ( mode === 'mathchains' ) {
			return t(
				'Start with the given number. Follow the arrows from left to right and write each result in the next box.'
			);
		}
		if ( mode === 'missing' ) {
			return t( 'Fill in the missing letters to complete each word.' );
		}
		if ( mode === 'magic' ) {
			return t(
				'Use each number once. Every row, every column and both diagonals must add up to the same sum.'
			);
		}
		return '';
	};
	// Color, title and resizing reuse the same generated puzzle.
	let logicCache = null;
	const logicModel = () => {
		const key = JSON.stringify( [
			params.mode,
			params.seed,
			params.binarySize,
			params.inequalitySize,
			params.logicDiff,
			params.mathRows,
			params.mathSteps,
			params.mathDiff,
		] );
		if ( ! logicCache || logicCache.key !== key ) {
			const model =
				params.mode === 'binary'
					? buildBinary( {
							size: params.binarySize,
							diff: params.logicDiff,
							seed: params.seed,
					  } )
					: params.mode === 'inequality'
					? buildInequality( {
							size: params.inequalitySize,
							diff: params.logicDiff,
							seed: params.seed,
					  } )
					: buildMathChains( {
							rows: params.mathRows,
							steps: params.mathSteps,
							diff: params.mathDiff,
							seed: params.seed,
					  } );
			logicCache = { key, model };
		}
		return logicCache.model;
	};

	// A word search in a shape asks for the mask at every size it tries.
	const maskCache = new Map();
	const wsMask = ( n ) => {
		if ( 'square' === params.wsShape || ! params.wsShape ) {
			return null;
		}
		if ( 'image' === params.wsShape && ! srcCanvas ) {
			return null;
		}
		const key = [ params.wsShape, params.letter, n, srcToken ].join( '|' );
		if ( ! maskCache.has( key ) ) {
			maskCache.set(
				key,
				shapeMask(
					like(),
					params.wsShape,
					params.letter,
					n,
					'image' === params.wsShape ? srcCanvas : null
				)
			);
		}
		return maskCache.get( key );
	};

	// The solution word: numbered cells in the grid, or a warning when the
	// grid lacks a letter it needs.
	const secretFor = ( cc, avoid ) => {
		if ( ! String( params.secretWord || '' ).trim() ) {
			return null;
		}
		const sec = pickSecretCells( cc, params.secretWord, {
			seed: params.seed,
			avoid,
		} );
		if ( sec && sec.missing.length ) {
			warn.textContent = `${ t(
				'The solution word needs letters the grid does not have:'
			) } ${ sec.missing.join( ', ' ) }`;
		}
		return sec;
	};

	// Word + clue lines ("SUN: It shines") for crossword and picture
	// crossword, the keys folded the way the grid folds its words.
	const crosswordSheets = ( text, common, pictures ) => {
		const entries = String( text || '' )
			.split( /\r?\n/ )
			.map( ( l ) => l.trim() )
			.filter( Boolean )
			.map( ( l ) => {
				const i = l.indexOf( ':' );
				return i > 0
					? { word: l.slice( 0, i ), clue: l.slice( i + 1 ).trim() }
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
			const k = foldLetters( e.word );
			if ( k && ! map[ k ] ) {
				map[ k ] = e.clue;
			}
		}
		const cw = buildCrosswordClues( cc, map );
		const extra = {
			acrossLabel: t( 'Across →' ),
			downLabel: t( 'Down ↓' ),
			secret: secretFor( cc, null ),
			secretLabel: t( 'Solution word:' ),
			pictures,
		};
		return {
			sheet: renderCrossword( like(), cc, cw, { ...common, ...extra } ),
			solution: params.withSolution
				? renderCrossword( like(), cc, cw, {
						...common,
						...extra,
						solution: true,
				  } )
				: null,
		};
	};

	/**
	 * The finished sheets. Without a worksheet head and with one puzzle
	 * per page this is exactly the sheet the studio always made. With a
	 * head, a task or several puzzles, the puzzles are rendered untitled
	 * (seeds apart, so every one is different) and set on one page that
	 * carries the title, the name line, the task and the rules once.
	 */
	const modeName = () =>
		t(
			( MODES.find( ( x ) => x.id === params.mode ) || MODES[ 0 ] ).label
		);

	function bake() {
		const perPage = PER_PAGE.includes( params.mode )
			? Math.max( 1, Math.min( 6, params.perPage | 0 ) )
			: 1;
		const series = SERIES.includes( params.mode )
			? Math.max( 1, Math.min( 10, params.series | 0 ) )
			: 1;
		const instructions = String( params.instructions || '' ).trim();
		const header = !! params.sheetHeader;
		if ( ! header && ! instructions && perPage < 2 && series < 2 ) {
			return bakeRaw( {
				title: params.title,
				rules: puzzleRules( params.mode ),
			} );
		}
		// Seeds far apart: version v, puzzle i. Version A, puzzle 1 is the
		// very puzzle the single sheet shows.
		const seed0 = params.seed;
		const versions = [];
		try {
			for ( let v = 0; v < series; v++ ) {
				const runs = [];
				for ( let i = 0; i < perPage; i++ ) {
					params.seed = seed0 + v * 1009 + i * 101;
					const r = bakeRaw( { title: '', rules: '' } );
					if ( ! r ) {
						return null;
					}
					runs.push( r );
				}
				versions.push( runs );
			}
		} finally {
			params.seed = seed0;
		}
		const page = {
			title: params.title,
			colors: resolvedColors(),
			font: params.font,
			textScale: params.textScale,
			labels: { name: t( 'Name' ), cls: t( 'Class' ), date: t( 'Date' ) },
		};
		const letter = ( v ) => String.fromCharCode( 65 + v );
		const sheetPage = ( tiles, v = 0 ) =>
			composeSheet( like(), tiles, {
				...page,
				header,
				instructions,
				rules: puzzleRules( params.mode ),
				badge: series > 1 ? `${ t( 'Version' ) } ${ letter( v ) }` : '',
			} );
		// Memory's "solution" is the duplex back: same head height, empty,
		// so front and back still line up when printed on both sides.
		const solPage = ( tiles, v = 0 ) =>
			'memory' === params.mode
				? composeSheet( like(), tiles, {
						...page,
						header,
						instructions,
						ghost: true,
				  } )
				: composeSheet( like(), tiles, {
						...page,
						caption:
							series > 1
								? `${ t( 'Solution' ) } ${ letter( v ) }`
								: t( 'Solution' ),
				  } );
		if ( 1 === series ) {
			const runs = versions[ 0 ];
			const first = runs[ 0 ];
			return {
				sheet: sheetPage( runs.map( ( r ) => r.sheet ) ),
				solution: first.solution
					? solPage( runs.map( ( r ) => r.solution ) )
					: null,
				extras: ( first.extras || [] ).map( ( ex, i ) =>
					first.extraKinds && 'solution' === first.extraKinds[ i ]
						? solPage( [ ex ] )
						: sheetPage( [ ex ] )
				),
				extraNames: first.extraNames,
			};
		}
		// A series: every version is its own layer. With one puzzle per
		// version the solutions share a sheet, six to a page, each marked
		// with its letter; with several they get a page per version.
		const sheets = versions.map( ( runs, v ) =>
			sheetPage(
				runs.map( ( r ) => r.sheet ),
				v
			)
		);
		const names = versions.map(
			( _, v ) => `${ modeName() } ${ letter( v ) }`
		);
		const sols = [];
		const solNames = [];
		if ( versions[ 0 ][ 0 ].solution ) {
			if ( 1 === perPage ) {
				const tiles = versions.map( ( runs ) => runs[ 0 ].solution );
				for ( let k = 0; k < tiles.length; k += 6 ) {
					const part = tiles.slice( k, k + 6 );
					const labels = part.map( ( _, i ) => letter( k + i ) );
					sols.push(
						composeSheet( like(), part, {
							...page,
							caption: t( 'Solutions' ),
							tileLabels: labels,
						} )
					);
					solNames.push(
						`${ t( 'Solutions' ) } ${ labels[ 0 ] }-${
							labels[ labels.length - 1 ]
						}`
					);
				}
			} else {
				versions.forEach( ( runs, v ) => {
					sols.push(
						solPage(
							runs.map( ( r ) => r.solution ),
							v
						)
					);
					solNames.push( `${ t( 'Solution' ) } ${ letter( v ) }` );
				} );
			}
		}
		return {
			sheet: sheets[ 0 ],
			name: names[ 0 ],
			solution: sols[ 0 ] || null,
			solutionName: solNames[ 0 ],
			extras: [ ...sheets.slice( 1 ), ...sols.slice( 1 ) ],
			extraNames: [ ...names.slice( 1 ), ...solNames.slice( 1 ) ],
		};
	}

	function bakeRaw( base ) {
		const common = {
			title: base.title,
			colors: resolvedColors(),
			font: params.font,
			textScale: params.textScale,
			rules: base.rules,
		};
		warn.textContent = '';
		const two = ( build, render ) => ( {
			sheet: render( like(), build, common ),
			solution: params.withSolution
				? render( like(), build, { ...common, solution: true } )
				: null,
		} );
		if (
			[ 'binary', 'inequality', 'mathchains' ].includes( params.mode )
		) {
			const model = logicModel();
			return model
				? two(
						model,
						params.mode === 'mathchains'
							? renderMathChains
							: renderLogicGrid
				  )
				: null;
		}
		if ( 'wordsearch' === params.mode ) {
			if ( 'image' === params.wsShape && ! srcCanvas ) {
				return null;
			}
			const ws = buildWordSearch( params.words.split( /\n+/ ), {
				size: params.size,
				hard: params.hard,
				seed: params.seed,
				mask: wsMask,
				secret: params.wsSecret,
			} );
			if ( ws.skipped.length ) {
				warn.textContent = `${ t(
					'Some words did not fit:'
				) } ${ ws.skipped.join( ', ' ) }`;
			}
			if ( ws.secretTooLong ) {
				warn.textContent = t(
					'The hidden message is too long for these words. Shorten it or add words.'
				);
			} else if (
				ws.secret &&
				ws.blocked.size > ws.secret.cells.length
			) {
				// More empty cells than message letters: say how to fill it.
				warn.textContent = t(
					'Tip: a longer message leaves fewer empty cells.'
				);
			}
			return two( ws, ( lk, model, o ) =>
				renderWordSearch( lk, model, {
					...o,
					secretLabel: t( 'Hidden message:' ),
				} )
			);
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
		if ( 'arith' === params.mode ) {
			const model = buildArithmetic( {
				ops: params.arithOps,
				max: params.arithMax,
				count: params.arithCount,
				gaps: params.arithGaps,
				seed: params.seed,
			} );
			const columns =
				'columns' === params.arithLayout && canWriteInColumns( model );
			return two( model, ( lk, mdl, o ) =>
				renderArithmetic( lk, mdl, { ...o, columns } )
			);
		}
		if ( 'clock' === params.mode ) {
			return two(
				buildClocks( {
					count: params.clockCount,
					step: params.clockStep,
					task: params.clockTask,
					seed: params.seed,
				} ),
				renderClocks
			);
		}
		if ( 'circlemaze' === params.mode ) {
			return two(
				buildCircleMaze( { rings: params.rings, seed: params.seed } ),
				renderCircleMaze
			);
		}
		if ( 'sudoku' === params.mode ) {
			const sud = buildSudoku( {
				size: params.sudokuSize,
				diff: params.sudokuDiff,
				seed: params.seed,
			} );
			return two( sud, renderSudoku );
		}
		if ( 'picsudoku' === params.mode ) {
			const size = [ 4, 6, 9 ].includes( params.picSize )
				? params.picSize
				: 4;
			const own = Array.from(
				new Set(
					String( params.picMotifs || '' )
						.split( /\s+/ )
						.filter( Boolean )
				)
			);
			if ( own.length < size ) {
				warn.textContent = t(
					'Fewer pictures than the grid is wide - some come from the starter set.'
				);
			}
			const symbols = own
				.concat( PIC_FALLBACK.filter( ( p ) => ! own.includes( p ) ) )
				.slice( 0, size );
			const sud = buildSudoku( {
				size,
				diff: params.picDiff,
				seed: params.seed,
			} );
			return two( sud, ( lk, model, o ) =>
				renderSudoku( lk, model, { ...o, symbols } )
			);
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
			// The given word must not hand out the solution word's letters.
			const secret = secretFor( cc, cc.prefill );
			return two( cc, ( lk, model, o ) =>
				renderCrissCross( lk, model, {
					...o,
					secret,
					secretLabel: t( 'Solution word:' ),
				} )
			);
		}
		if ( 'crossword' === params.mode ) {
			return crosswordSheets( params.clues, common, false );
		}
		if ( 'piccross' === params.mode ) {
			return crosswordSheets( params.picClues, common, true );
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
		if ( 'missing' === params.mode ) {
			const miss = buildMissingLetters( params.words.split( /\n+/ ), {
				seed: params.seed,
				gaps: params.missGaps,
			} );
			if ( ! miss ) {
				warn.textContent = t(
					'Add a few words of three letters or more.'
				);
				return null;
			}
			return two( miss, renderMissingLetters );
		}
		if ( 'magic' === params.mode ) {
			const labels = {
				sum: t( 'Every line adds up to' ),
				use: t( 'Use each number once' ),
			};
			return two(
				buildMagicSquares( {
					seed: params.seed,
					count: params.magicCount,
					range: params.magicRange,
					clues: params.magicClues,
				} ),
				( cv, model, opts ) =>
					renderMagicSquares( cv, model, { ...opts, labels } )
			);
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
		if ( 'games' === params.mode && MORE_GAMES.includes( params.game ) ) {
			return {
				sheet: renderMoreGame( like(), {
					...common,
					game: params.game,
					alphabet: ALPHABETS[ LANG ],
					labels: {
						round: t( 'Round' ),
						wins: t( 'Wins' ),
						secret: t( 'The code (cover it)' ),
						exact: t( 'Right color, right place' ),
						near: t( 'Right color, wrong place' ),
						colors: t( 'Colors' ),
					},
				} ),
				solution: null,
			};
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
				out.push( { c: sheet, name, kind: 'sheet' } );
				if ( solution && params.withSolution ) {
					out.push( {
						c: solution,
						name: `${ name }: ${ t( 'Solution' ) }`,
						kind: 'solution',
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
				extraKinds: out.slice( 1 ).map( ( o ) => o.kind ),
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
		history.dispose();
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
	// Ctrl+Z / Ctrl+Shift+Z (shared/studio-undo.js), no button: puzzle
	// type, its settings, words and colours; the fields and choices follow
	// through their own handlers.
	const history = studioUndo( {
		backdrop,
		read: () => params,
		write: ( data ) => {
			Object.assign( params, data );
			customCtls.forEach( ( ctl, i ) =>
				ctl?.set?.( params.customColors[ i ] || '#cccccc' )
			);
			syncUi();
			refreshThumbs();
			if ( wantsImage() && ! srcCanvas ) {
				loadSource();
			} else {
				paint();
			}
		},
	} );

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
				// A saved mode the list no longer knows must not throw on
				// insert (EXTZUSTAND-06): the first mode stands in.
				( MODES.find( ( m ) => m.id === params.mode ) || MODES[ 0 ] )
					.label
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
				const main = place( baked.sheet, baked.name || modeLabel, 0 );
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
					const sol = place(
						baked.solution,
						baked.solutionName || t( 'Solution' ),
						40
					);
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
		if ( wantsImage() ) {
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
