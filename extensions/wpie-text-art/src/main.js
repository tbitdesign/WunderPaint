/**
 * WPIE extension: Text Art (free mini).
 *
 * The image emerges from characters: ASCII ramps, emoji, packed words,
 * readable text flows (rows, diagonal, waves, spiral - from your own
 * text or a WordPress post) and text inside a silhouette. Glyph color,
 * size and density carry the picture - never an overlay. Everything is
 * computed locally.
 */

import {
	measureEmojis,
	renderAscii,
	renderEmojiArt,
	renderWordArt,
	renderTextFlow,
	renderSilhouetteText,
	renderBrickArt,
	renderDiceArt,
	renderCubeArt,
	renderStickyNotes,
	renderDotMatrix,
	renderCeramicMosaic,
	renderKeycapArt,
	renderMarquee,
	renderStampWall,
	renderBottleCaps,
	renderCoinMosaic,
	renderButtonMosaic,
	renderDominoArt,
	renderTileMosaic,
} from './textart-engine.js';
import {
	renderElementWords,
	renderLetterGrid,
	renderScrabble,
	renderRansomNote,
	renderWordCloud,
	tokenizeCloud,
	makeShapeMask,
} from './textart-typo.js';
import { renderQrPortrait } from './qr.js';

const GEN_ID = 'wpie-text-art/sheet';

const PALETTES = [
	{
		id: 'party',
		label: 'Party',
		colors: [
			'#f94144',
			'#f3722c',
			'#f8961e',
			'#f9c74f',
			'#90be6d',
			'#43aa8b',
			'#577590',
		],
	},
	{
		id: 'pastel',
		label: 'Pastel',
		colors: [
			'#ffd6e0',
			'#ffef9f',
			'#c1fba4',
			'#7bf1a8',
			'#a5d8ff',
			'#d0bfff',
		],
	},
	{
		id: 'gold',
		label: 'Gold & Black',
		colors: [ '#d9a441', '#101010', '#f5e6c4', '#8a5a1c' ],
	},
	{
		id: 'ocean',
		label: 'Ocean',
		colors: [ '#1098ad', '#66d9e8', '#0b7285', '#e3fafc' ],
	},
	{
		id: 'blush',
		label: 'Blush',
		colors: [ '#e58aa4', '#c94f6d', '#f7d6de', '#6d2136' ],
	},
	{
		id: 'forest',
		label: 'Forest',
		colors: [ '#80b918', '#2b9348', '#eeef20', '#007f5f' ],
	},
	{
		id: 'candy',
		label: 'Candy',
		colors: [ '#f9a8d4', '#818cf8', '#e879f9', '#38bdf8' ],
	},
	{
		id: 'sunset',
		label: 'Sunset',
		colors: [ '#ff7e5f', '#c2427b', '#ffd27a', '#7a2948' ],
	},
	{
		id: 'mono',
		label: 'Black & White',
		colors: [ '#e8eaee', '#4a4f57', '#9aa0a8', '#111418' ],
	},
	{
		id: 'noel',
		label: 'Christmas',
		colors: [ '#b3212b', '#1f6f43', '#f5e6c4', '#8a5a1c' ],
	},
];

const EMOJI_SETS = {
	mixed: '🟥 🟧 🟨 🟩 🟦 🟪 🟫 ⬛ ⬜ ❤️ 🧡 💛 💚 💙 💜 🤎 🖤 🤍 😀 😎 🌻 🌸 🌺 🌷 🌹 🍁 🍂 🌿 🍀 🌵 🌊 🔥 ⭐ 🌙 ☀️ ☁️ ⚡ ❄️ 🍊 🍋 🍏 🍎 🍇 🍓 🫐 🍑 🥝 🥥 🍅 🌽 🥑 🥕 🍆 🍄 🧀 🍫 🍩 🍪 ☕ 💎 🏀 ⚽ 🎾 🧿 🎈 🎨 🧸 📘 📗 📙 📕 💌 🌑 🌕 🐢 🐙 🦀 🐳 🦜 🐤 🦩',
	hearts: '❤️ 🧡 💛 💚 💙 💜 🤎 🖤 🤍 💗 💖 💘 💝 💕 💞 💓 💟 ❣️ 🩷 🩵 🩶',
	nature: '🌻 🌸 🌺 🌷 🌹 🥀 🌼 🌿 🍀 🍁 🍂 🌵 🌲 🌳 🌴 🍄 🌊 ⭐ 🌙 ☀️ ☁️ ❄️ 🔥 🌈 🐢 🐟 🦋 🐝 🐞',
	food: '🍊 🍋 🍏 🍎 🍇 🍓 🫐 🍑 🥝 🥥 🍅 🌽 🥑 🥕 🍆 🧅 🍄 🍞 🧀 🥩 🍫 🍩 🍪 🥛 ☕ 🍷 🍰 🧁 🍭',
};

const DEFAULTS = {
	image: null,
	source: 'doc',
	mode: 'ascii',
	background: 'dark',
	colorMode: 'image', // 'image' | 'mono' | 'gradient'
	paletteId: 'sunset',
	useBrand: false,
	brandKitId: '',
	customColors: [],
	contrast: 100,
	// ascii
	cell: 7,
	charset: 'classic',
	customChars: '',
	bold: true,
	// emoji
	ecell: 17,
	emojiSet: 'mixed',
	customEmoji: '',
	// words
	words: 'LOVE\nFAMILY\nSMILE\nDREAM\nHAPPY\nJOY',
	sizeMin: 7,
	sizeMax: 24,
	rotation: 'none',
	seed: 7,
	// flow (lyrics/post) + silhouette
	text: '',
	postId: 0,
	postTitle: '',
	postText: '',
	font: '',
	size: 13,
	layout: 'rows',
	dynamicSize: true,
	threshold: 50,
	invert: false,
	// shape source (words/silhouette without a photo)
	shape: 'heart',
	shapeText: 'A',
	// brick
	bcell: 18,
	brickOriginal: false,
	// object mosaics
	diceCell: 24,
	diceMix: 'both',
	cubeCell: 14,
	noteCell: 26,
	dotCell: 16,
	dotStyle: 'led',
	tileCell: 24,
	capCell: 28,
	capText: '',
	// elements
	elemWords: 'BaCoN\nGeNiUs',
	elemStyle: 'classic',
	elemNames: true,
	// hidden words
	hiddenWords: 'ANNA\nNOAH\nFAMILY\nLOVE',
	hiddenDensity: 40,
	hiddenDiag: false,
	hiddenDim: 78,
	// letter tiles
	tileWords: 'FAMILY\nSMILE\nLAUGH\nLOVE',
	tileStyle: 'wood',
	tilePoints: true,
	// marquee / stamps / caps / coins / buttons / domino
	marqCell: 20,
	marqStyle: 'warm',
	stampCell: 34,
	capsCell: 28,
	coinCell: 24,
	btnCell: 26,
	domCell: 22,
	domStyle: 'black',
	// your tile
	tmCell: 24,
	tmTint: 65,
	tmJitter: true,
	tileLayerId: '',
	tileData: '',
	// ransom note
	ransomText: 'BIG\nNEWS',
	ransomPaper: 'color',
	ransomTilt: 55,
	// word cloud
	cloudWords: 'CREATIVE\nDESIGN\nCOLOR\nIDEAS\nSTUDIO\nART\nPIXEL\nCANVAS',
	cloudSource: 'words',
	cloudShape: 'none',
	cloudShapeText: 'A',
	// qr portrait
	qrText: '',
	qrCell: 18,
	qrPhoto: 70,
	qrRound: true,
	// reveal animation
	animSecs: 4,
};

import { t } from './i18n.js';

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
	type: tabIcon( 'M4 20l3 0 M6 20v-16l10 16v-16 M20 4l0 16' ),
	source: tabIcon(
		'M15 8h.01 M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12 M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5 M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3'
	),
	colors: tabIcon(
		'M12 21a9 9 0 0 1 0 -18c4.97 0 9 3.582 9 8c0 1.06 -.474 2.078 -1.318 2.828c-.844 .75 -1.989 1.172 -3.182 1.172h-2.5a2 2 0 0 0 -1 3.75a1.3 1.3 0 0 1 -1 2.25 M8.5 10.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M12.5 7.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M16.5 10.5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0'
	),
	settings: tabIcon(
		'M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065 M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0'
	),
	film: tabIcon(
		'M6 3a2 2 0 0 0 -2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-14a2 2 0 0 0 -2 -2z M8 3v18 M16 3v18 M4 9h4 M4 15h4 M16 9h4 M16 15h4'
	),
};

const MODES = [
	{ id: 'ascii', label: 'ASCII Art' },
	{ id: 'emoji', label: 'Emoji Art' },
	{ id: 'brick', label: 'Brick Art' },
	{ id: 'dice', label: 'Dice Art' },
	{ id: 'cube', label: 'Cube Art' },
	{ id: 'sticky', label: 'Sticky Notes' },
	{ id: 'dots', label: 'Dot Matrix' },
	{ id: 'marquee', label: 'Marquee Lights' },
	{ id: 'ceramic', label: 'Ceramic Mosaic' },
	{ id: 'keycap', label: 'Keycap Art' },
	{ id: 'stamp', label: 'Stamp Wall' },
	{ id: 'caps', label: 'Bottle Caps' },
	{ id: 'coins', label: 'Coin Mosaic' },
	{ id: 'buttons', label: 'Button Mosaic' },
	{ id: 'domino', label: 'Domino Art' },
	{ id: 'tile', label: 'Your Tile' },
	{ id: 'qr', label: 'QR Portrait' },
	{ id: 'words', label: 'Word Portrait' },
	{ id: 'lyrics', label: 'Lyrics Art' },
	{ id: 'post', label: 'Post Art' },
	{ id: 'silhouette', label: 'Silhouette Text' },
	{ id: 'elements', label: 'Element Art' },
	{ id: 'hidden', label: 'Hidden Words' },
	{ id: 'scrabble', label: 'Letter Tiles' },
	{ id: 'ransom', label: 'Ransom Note' },
	{ id: 'wordcloud', label: 'Word Cloud' },
];

// The typography types need no source image at all.
const TEXT_ONLY = [ 'elements', 'hidden', 'scrabble', 'ransom', 'wordcloud' ];

// Object-mosaic types bring their own look: no color mode, palettes or
// contrast; the ones with a fixed board also hide the ground select.
const OBJ_MOSAIC = [
	'brick',
	'dice',
	'cube',
	'sticky',
	'dots',
	'ceramic',
	'keycap',
	'marquee',
	'stamp',
	'caps',
	'coins',
	'buttons',
	'domino',
	'tile',
	'qr',
];
const FIXED_BOARD = [ 'brick', 'cube', 'dots', 'keycap', 'marquee', 'qr' ];

// Grid-revealing modes and their cell size in baked pixels - the reveal
// animation pops these cell by cell; everything else wipes like a
// typewriter.
const CELL_OF = {
	ascii: ( p ) => [ p.cell, Math.round( p.cell * 1.7 ) ],
	emoji: ( p ) => [ p.ecell, p.ecell ],
	brick: ( p ) => [ p.bcell, p.bcell ],
	dice: ( p ) => [ p.diceCell, p.diceCell ],
	cube: ( p ) => [ p.cubeCell * 3, p.cubeCell * 3 ],
	sticky: ( p ) => [ p.noteCell, p.noteCell ],
	dots: ( p ) => [ p.dotCell, p.dotCell ],
	marquee: ( p ) => [ p.marqCell, p.marqCell ],
	ceramic: ( p ) => [ p.tileCell, p.tileCell ],
	keycap: ( p ) => [ p.capCell, p.capCell ],
	stamp: ( p ) => [ p.stampCell, p.stampCell ],
	caps: ( p ) => [ p.capsCell, p.capsCell ],
	coins: ( p ) => [ p.coinCell, p.coinCell ],
	buttons: ( p ) => [ p.btnCell, p.btnCell ],
	tile: ( p ) => [ p.tmCell, p.tmCell ],
};

const splitLines = ( s, maxLines = 40 ) =>
	String( s || '' )
		.split( /\r?\n/ )
		.map( ( l ) => l.trim() )
		.filter( Boolean )
		.slice( 0, maxLines );

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

	let srcRaw = null; // with alpha (silhouette masks)
	let srcFlat = null; // flattened onto white (everything else)
	let srcToken = 0;
	let tileCanvas = null; // 'Your Tile': the chosen layer, cropped small
	let tileToken = 0;
	const emojiCache = new Map();

	// A friendly stand-in tile (heart) for the thumbnail before a layer
	// is chosen.
	const demoTile = () => {
		const c = document.createElement( 'canvas' );
		c.width = 64;
		c.height = 64;
		const g = c.getContext( '2d' );
		g.fillStyle = '#e05572';
		g.font = '900 58px sans-serif';
		g.textAlign = 'center';
		g.textBaseline = 'middle';
		g.fillText( '♥', 32, 36 );
		return c;
	};

	const host = document.getElementById( 'wpie-root' ) || document.body;
	const backdrop = el( 'div', 'modal-backdrop', host );
	const dialog = el( 'div', 'dsm wpieta-dialog', backdrop );
	dialog.onclick = ( e ) => e.stopPropagation();
	const head = el( 'div', 'dsm-head', dialog );
	const badge = el( 'span', 'dsm-badge', head );
	badge.innerHTML = ICON_BRAND;
	const titles = el( 'div', 'dsm-titles', head );
	el( 'span', 'dsm-title', titles, 'Text Art' );
	el(
		'div',
		'dsm-sub',
		titles,
		t(
			'Your image, rebuilt from characters, bricks and tiles - as editable layers.'
		)
	);
	const closeBtn = el( 'button', 'dsm-x', head );
	closeBtn.innerHTML = '&times;';
	closeBtn.setAttribute( 'aria-label', t( 'Close' ) );

	const body = el( 'div', 'wpieta-body', dialog );
	const view = el( 'div', 'wpieta-view', body );
	const canvas = el( 'canvas', null, view );
	const side = el( 'div', 'wpieta-side', body );
	const status = el( 'div', 'wpieta-status', view );
	const setStatus = ( msg, isErr ) => {
		status.textContent = msg || '';
		status.classList.toggle( 'on', !! msg );
		status.classList.toggle( 'err', !! isErr );
	};

	const section = ( parent, icon, label ) => {
		const card = el( 'div', 'wpieta-card', parent );
		const h = el( 'div', 'wpieta-card-head', card );
		h.innerHTML = icon + '<span>' + label + '</span>';
		return el( 'div', 'wpieta-card-body', card );
	};

	/* ------------------------------ type cards ---------------------------- */

	const modeSec = section( side, ICONS.type, t( 'Type' ) );
	const modeGrid = el( 'div', 'wpieta-cards', modeSec );
	const modeTiles = new Map();
	for ( const m of MODES ) {
		const card = el( 'button', 'wpieta-tcard', modeGrid );
		card.type = 'button';
		card.title = t( m.label );
		const thumb = el( 'canvas', 'wpieta-tthumb', card );
		thumb.width = 132;
		thumb.height = 92;
		el( 'span', 'wpieta-tlabel', card, t( m.label ) );
		card.onclick = () => {
			params.mode = m.id;
			syncUi();
			schedule();
		};
		modeTiles.set( m.id, { card, thumb } );
	}

	function thumbSource() {
		if ( srcFlat ) {
			return srcFlat;
		}
		const c = document.createElement( 'canvas' );
		c.width = 132;
		c.height = 92;
		const g = c.getContext( '2d' );
		const gr = g.createLinearGradient( 0, 0, 132, 92 );
		gr.addColorStop( 0, '#577590' );
		gr.addColorStop( 1, '#f9c74f' );
		g.fillStyle = gr;
		g.fillRect( 0, 0, 132, 92 );
		g.fillStyle = '#1d2126';
		g.beginPath();
		g.arc( 66, 46, 26, 0, Math.PI * 2 );
		g.fill();
		return c;
	}
	function paintCardThumbs() {
		const src = thumbSource();
		const like = document.createElement( 'canvas' );
		const base = {
			colorMode: params.colorMode,
			colors: resolvedColors(),
			background: params.background,
		};
		const renders = {
			ascii: () => renderAscii( like, src, { ...base, cell: 6 } ),
			emoji: () => {
				const tiles = getEmojiTiles();
				return (
					renderEmojiArt( like, src, tiles, { ...base, cell: 14 } ) ||
					null
				);
			},
			words: () =>
				renderWordArt( like, src, {
					...base,
					words: [ 'LOVE', 'JOY' ],
					sizeMin: 5,
					sizeMax: 14,
				} ),
			lyrics: () =>
				renderTextFlow( like, src, {
					...base,
					text: 'La la la sing along ',
					size: 9,
				} ),
			post: () =>
				renderTextFlow( like, src, {
					...base,
					text: 'Lorem ipsum dolor sit amet ',
					size: 9,
					layout: 'diagonal',
				} ),
			silhouette: () =>
				renderSilhouetteText( like, src, {
					...base,
					text: 'ART ',
					size: 8,
				} ),
			brick: () => renderBrickArt( like, src, { cell: 14 } ),
			dice: () =>
				renderDiceArt( like, src, {
					cell: 16,
					background: params.background,
				} ),
			cube: () => renderCubeArt( like, src, { cell: 10 } ),
			sticky: () =>
				renderStickyNotes( like, src, {
					cell: 18,
					background: params.background,
				} ),
			dots: () =>
				renderDotMatrix( like, src, {
					cell: 12,
					style: params.dotStyle,
				} ),
			ceramic: () =>
				renderCeramicMosaic( like, src, {
					cell: 16,
					background: params.background,
				} ),
			keycap: () =>
				renderKeycapArt( like, src, {
					cell: 20,
					text: params.capText,
				} ),
			marquee: () =>
				renderMarquee( like, src, {
					cell: 14,
					style: params.marqStyle,
				} ),
			stamp: () =>
				renderStampWall( like, src, {
					cell: 26,
					background: params.background,
				} ),
			caps: () =>
				renderBottleCaps( like, src, {
					cell: 18,
					background: params.background,
				} ),
			coins: () =>
				renderCoinMosaic( like, src, {
					cell: 16,
					background: params.background,
				} ),
			buttons: () =>
				renderButtonMosaic( like, src, {
					cell: 18,
					background: params.background,
				} ),
			domino: () =>
				renderDominoArt( like, src, {
					cell: 14,
					stoneStyle: params.domStyle,
					background: params.background,
				} ),
			tile: () =>
				renderTileMosaic( like, src, tileCanvas || demoTile(), {
					cell: 16,
					tint: params.tmTint,
					jitter: params.tmJitter,
					background: params.background,
				} ),
			qr: () =>
				renderQrPortrait( like, src, {
					text: 'WUNDERPAINT',
					cell: 10,
					photo: params.qrPhoto,
					round: params.qrRound,
				} ),
			ransom: () =>
				renderRansomNote( like, {
					...base,
					width: 264,
					height: 184,
					lines: [ 'ART' ],
					paperStyle: params.ransomPaper,
					tilt: params.ransomTilt,
					seed: 7,
				} ),
			wordcloud: () =>
				renderWordCloud( like, {
					...base,
					width: 264,
					height: 184,
					entries: [
						{ word: 'LOVE', weight: 5 },
						{ word: 'JOY', weight: 3 },
						{ word: 'ART', weight: 2 },
						{ word: 'FUN', weight: 2 },
						{ word: 'WOW', weight: 1 },
					],
					seed: 7,
				} ),
			elements: () =>
				renderElementWords( like, {
					...base,
					width: 264,
					height: 184,
					words: [ 'BaCoN' ],
					tileStyle: 'classic',
					showNames: false,
				} ),
			hidden: () =>
				renderLetterGrid( like, {
					...base,
					width: 264,
					height: 184,
					words: [ 'LOVE', 'JOY' ],
					density: 10,
					dim: 78,
					seed: 7,
				} ),
			scrabble: () =>
				renderScrabble( like, {
					...base,
					width: 264,
					height: 184,
					words: [ 'LOVE', 'JOY' ],
					tileStyle: 'wood',
					showPoints: true,
				} ),
		};
		for ( const m of MODES ) {
			const { thumb } = modeTiles.get( m.id );
			try {
				const c = renders[ m.id ]();
				const g = thumb.getContext( '2d' );
				g.fillStyle = '#14171c';
				g.fillRect( 0, 0, thumb.width, thumb.height );
				if ( c ) {
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
				}
			} catch ( e ) {}
		}
	}
	let thumbTimer = 0;
	const refreshThumbs = () => {
		window.clearTimeout( thumbTimer );
		thumbTimer = window.setTimeout( paintCardThumbs, 200 );
	};

	/* ------------------------------- source ------------------------------- */

	const srcSec = section( side, ICONS.source, t( 'Source' ) );
	const srcSel = el( 'select', 'dsm-select wpieta-wide', srcSec );
	const srcNote = el( 'div', 'wpieta-info', srcSec );

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
		add( 'shape', t( 'Shape (no image)' ) );
	}
	fillSourceOptions();
	srcSel.value =
		[ 'doc', 'media', 'shape' ].includes( params.source ) ||
		srcSel.querySelector( `option[value="${ params.source }"]` )
			? params.source
			: 'doc';
	params.source = srcSel.value;
	const shapeRow = el( 'label', 'wpieta-row', srcSec );
	el( 'span', null, shapeRow ).textContent = t( 'Shape' );
	const shapeSel = el( 'select', 'dsm-select', shapeRow );
	for ( const [ v, l ] of [
		[ 'heart', t( 'Heart' ) ],
		[ 'star', t( 'Star' ) ],
		[ 'circle', t( 'Circle' ) ],
		[ 'diamond', t( 'Diamond' ) ],
		[ 'letter', t( 'Letter' ) ],
		[ 'emoji', t( 'Emoji' ) ],
	] ) {
		const o = el( 'option', null, shapeSel );
		o.value = v;
		o.textContent = l;
	}
	shapeSel.value = params.shape;
	shapeSel.onchange = () => {
		params.shape = shapeSel.value;
		syncUi();
		loadSource();
	};
	const shapeTextRow = el( 'label', 'wpieta-text-row', srcSec );
	el( 'span', null, shapeTextRow ).textContent = t( 'Letter or emoji' );
	const shapeTextInput = el( 'input', 'wpieta-input', shapeTextRow );
	shapeTextInput.type = 'text';
	shapeTextInput.maxLength = 4;
	shapeTextInput.value = params.shapeText;
	shapeTextInput.oninput = () => {
		params.shapeText = shapeTextInput.value;
		loadSource();
	};

	async function urlToCanvas( url, max ) {
		const img = new window.Image();
		img.crossOrigin = 'anonymous';
		await new Promise( ( res, rej ) => {
			img.onload = res;
			img.onerror = rej;
			img.src = url;
		} );
		const c = document.createElement( 'canvas' );
		const scale = Math.min( 1, max / img.width );
		c.width = Math.round( img.width * scale );
		c.height = Math.round( img.height * scale );
		c.getContext( '2d' ).drawImage( img, 0, 0, c.width, c.height );
		return c;
	}

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
			if ( 'shape' === desc ) {
				// Alpha mask; the flat version paints the shape in the
				// glow direction of the chosen ground (bright on dark,
				// dark on light) so every image-driven type reads it.
				const doc = editor.state.doc;
				const mw = 900;
				const mh = Math.max(
					300,
					Math.min( 1600, Math.round( ( mw * doc.h ) / doc.w ) )
				);
				const mask = makeShapeMask(
					document.createElement( 'canvas' ),
					mw,
					mh,
					params.shape,
					params.shapeText,
					params.font
				);
				const dark = 'light' !== params.background;
				const flat = document.createElement( 'canvas' );
				flat.width = mw;
				flat.height = mh;
				const fg = flat.getContext( '2d' );
				fg.fillStyle = dark ? '#000000' : '#ffffff';
				fg.fillRect( 0, 0, mw, mh );
				fg.drawImage( mask, 0, 0 );
				fg.globalCompositeOperation = 'source-atop';
				// Recolor the (black) shape: bright on dark ground.
				if ( dark ) {
					fg.fillStyle = '#ffffff';
					const tmp = document.createElement( 'canvas' );
					tmp.width = mw;
					tmp.height = mh;
					const tg = tmp.getContext( '2d' );
					tg.drawImage( mask, 0, 0 );
					tg.globalCompositeOperation = 'source-in';
					tg.fillStyle = '#ffffff';
					tg.fillRect( 0, 0, mw, mh );
					fg.globalCompositeOperation = 'source-over';
					fg.drawImage( tmp, 0, 0 );
				}
				if ( token === srcToken ) {
					srcRaw = mask;
					srcFlat = flat;
					refreshThumbs();
					schedule();
				}
				return;
			}
			if ( 'media' === desc ) {
				if ( params.image && params.image.url ) {
					c = await urlToCanvas( params.image.url, 900 );
					srcNote.textContent = params.image.title || '';
				}
			} else if ( 'doc' === desc ) {
				c = await bridge.raster.renderToCanvas(
					editor.state.doc,
					editor.state.layers,
					{ scale: Math.min( 1, 900 / editor.state.doc.w ) }
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
						{ scale: Math.min( 1, 900 / editor.state.doc.w ) }
					);
					srcNote.textContent = target.name || '';
				}
			}
			if ( token === srcToken ) {
				srcRaw = c;
				srcFlat = flattenWhite( c );
				refreshThumbs();
				schedule();
			}
		} catch ( e ) {
			if ( token === srcToken ) {
				srcRaw = null;
				srcFlat = null;
				setStatus( t( 'Could not load the image.' ), true );
				schedule();
			}
		}
	}

	srcSel.onchange = async () => {
		if ( 'media' === srcSel.value ) {
			const picked = await new Promise( ( resolve ) => {
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
					const item = frame
						.state()
						.get( 'selection' )
						.first()
						.toJSON();
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
	const cmRow = el( 'label', 'wpieta-row', colSec );
	el( 'span', null, cmRow ).textContent = t( 'Color mode' );
	const cmSel = el( 'select', 'dsm-select', cmRow );
	for ( const [ v, l ] of [
		[ 'image', t( 'Image colors' ) ],
		[ 'mono', t( 'Single color' ) ],
		[ 'gradient', t( 'Gradient' ) ],
	] ) {
		const o = el( 'option', null, cmSel );
		o.value = v;
		o.textContent = l;
	}
	cmSel.value = params.colorMode;
	cmSel.onchange = () => {
		params.colorMode = cmSel.value;
		syncUi();
		refreshThumbs();
		schedule();
	};
	const bgRow = el( 'label', 'wpieta-row', colSec );
	el( 'span', null, bgRow ).textContent = t( 'Background' );
	const bgSel = el( 'select', 'dsm-select', bgRow );
	for ( const [ v, l ] of [
		[ 'dark', t( 'Dark' ) ],
		[ 'light', t( 'Light' ) ],
	] ) {
		const o = el( 'option', null, bgSel );
		o.value = v;
		o.textContent = l;
	}
	bgSel.value = params.background;
	bgSel.onchange = () => {
		params.background = bgSel.value;
		refreshThumbs();
		schedule();
	};

	const palWrap = el( 'div', 'wpieta-pals', colSec );
	const palBtns = new Map();
	for ( const p of PALETTES ) {
		const b = el( 'button', 'wpieta-pal', palWrap );
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
			schedule();
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
		const brandLbl = el( 'label', 'wpieta-check', colSec );
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
			schedule();
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
					schedule();
				},
			} );
		}
	}
	const customRow = el( 'div', 'wpieta-row wpieta-customrow', colSec );
	el( 'span', null, customRow ).textContent = t( 'Custom colors' );
	const customWrap = el( 'span', 'wpieta-customs', customRow );
	const mountSwatch = bridge.components && bridge.components.mountColorButton;
	const customCtls = [];
	for ( let i = 0; i < 4; i++ ) {
		const slot = el( 'span', 'wpieta-swatch', customWrap );
		const onChange = ( c ) => {
			const hex = 'string' === typeof c ? c : ( c && c.hex ) || '';
			params.customColors[ i ] = hex;
			params.useBrand = false;
			if ( customCtls[ i ] && customCtls[ i ].set && hex ) {
				customCtls[ i ].set( hex );
			}
			syncUi();
			refreshThumbs();
			schedule();
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
	const resetBtn = el( 'button', 'wpieta-reset', customRow );
	resetBtn.textContent = t( 'Auto' );
	resetBtn.onclick = ( e ) => {
		e.preventDefault();
		params.customColors = [];
		params.useBrand = false;
		customCtls.forEach( ( ctl ) => ctl && ctl.set && ctl.set( '#cccccc' ) );
		syncUi();
		refreshThumbs();
		schedule();
	};
	const resolvedColors = () => {
		const valid = ( c ) => /^#[0-9a-f]{6}$/i.test( String( c ) );
		const custom = ( params.customColors || [] ).filter( valid );
		if ( custom.length >= 1 ) {
			return custom;
		}
		const brand = brandColors().filter( valid );
		if ( brand.length >= 2 ) {
			return brand;
		}
		return (
			PALETTES.find( ( p ) => p.id === params.paletteId ) || PALETTES[ 0 ]
		).colors;
	};

	/* ------------------------------ settings ------------------------------ */

	const setSec = section( side, ICONS.settings, t( 'Settings' ) );
	function sliderRowIn( parent, label, min, max, get, set, unit ) {
		const row = el( 'label', 'wpieta-row', parent );
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
			schedule();
		};
		return row;
	}
	function selectRow( parent, label, pairs, get, set ) {
		const row = el( 'label', 'wpieta-row', parent );
		el( 'span', null, row ).textContent = label;
		const sel = el( 'select', 'dsm-select', row );
		for ( const [ v, l ] of pairs ) {
			const o = el( 'option', null, sel );
			o.value = v;
			o.textContent = l;
		}
		sel.value = get();
		sel.onchange = () => {
			set( sel.value );
			syncUi();
			schedule();
		};
		return row;
	}
	function checkRow( parent, label, get, set ) {
		const row = el( 'label', 'wpieta-check', parent );
		const cb = el( 'input', null, row );
		cb.type = 'checkbox';
		cb.checked = !! get();
		el( 'span', null, row ).textContent = label;
		cb.onchange = () => {
			set( cb.checked );
			schedule();
		};
		return row;
	}
	function textAreaRow( parent, label, rows, get, set ) {
		const row = el( 'label', 'wpieta-text-row', parent );
		el( 'span', null, row ).textContent = label;
		const area = el( 'textarea', 'wpieta-names', row );
		area.rows = rows;
		area.value = get();
		area.oninput = () => {
			set( area.value );
			schedule();
		};
		return row;
	}

	const contrastRow = sliderRowIn(
		setSec,
		t( 'Contrast' ),
		50,
		200,
		() => params.contrast,
		( v ) => ( params.contrast = v ),
		'%'
	);
	// ascii
	const cellRow = sliderRowIn(
		setSec,
		t( 'Cell size' ),
		5,
		16,
		() => params.cell,
		( v ) => ( params.cell = v )
	);
	const charsetRow = selectRow(
		setSec,
		t( 'Charset' ),
		[
			[ 'classic', t( 'Classic' ) ],
			[ 'blocks', t( 'Blocks' ) ],
			[ 'braille', t( 'Braille' ) ],
			[ 'binary', t( 'Binary' ) ],
			[ 'matrix', t( 'Matrix' ) ],
			[ 'typewriter', t( 'Typewriter' ) ],
			[ 'custom', t( 'Own characters' ) ],
		],
		() => params.charset,
		( v ) => ( params.charset = v )
	);
	const customCharsRow = el( 'label', 'wpieta-text-row', setSec );
	el( 'span', null, customCharsRow ).textContent = t( 'Own characters' );
	const customCharsInput = el( 'input', 'wpieta-input', customCharsRow );
	customCharsInput.type = 'text';
	customCharsInput.value = params.customChars;
	customCharsInput.oninput = () => {
		params.customChars = customCharsInput.value;
		schedule();
	};
	const boldRow = checkRow(
		setSec,
		t( 'Bold' ),
		() => params.bold,
		( v ) => ( params.bold = v )
	);
	// emoji
	const ecellRow = sliderRowIn(
		setSec,
		t( 'Cell size' ),
		12,
		30,
		() => params.ecell,
		( v ) => ( params.ecell = v )
	);
	const esetRow = selectRow(
		setSec,
		t( 'Emoji set' ),
		[
			[ 'mixed', t( 'Mixed' ) ],
			[ 'hearts', t( 'Hearts' ) ],
			[ 'nature', t( 'Nature' ) ],
			[ 'food', t( 'Food' ) ],
			[ 'custom', t( 'Own emoji' ) ],
		],
		() => params.emojiSet,
		( v ) => ( params.emojiSet = v )
	);
	const customEmojiRow = el( 'label', 'wpieta-text-row', setSec );
	el( 'span', null, customEmojiRow ).textContent = t( 'Own emoji' );
	const customEmojiInput = el( 'input', 'wpieta-input', customEmojiRow );
	customEmojiInput.type = 'text';
	customEmojiInput.value = params.customEmoji;
	customEmojiInput.oninput = () => {
		params.customEmoji = customEmojiInput.value;
		schedule();
	};
	// words
	const wordsRow = textAreaRow(
		setSec,
		t( 'Words (one per line)' ),
		4,
		() => params.words,
		( v ) => ( params.words = v )
	);
	const sizeMinRow = sliderRowIn(
		setSec,
		t( 'Size min' ),
		5,
		14,
		() => params.sizeMin,
		( v ) => ( params.sizeMin = v )
	);
	const sizeMaxRow = sliderRowIn(
		setSec,
		t( 'Size max' ),
		12,
		40,
		() => params.sizeMax,
		( v ) => ( params.sizeMax = v )
	);
	const rotRow = selectRow(
		setSec,
		t( 'Rotation' ),
		[
			[ 'none', t( 'Straight' ) ],
			[ 'slight', t( 'Slight' ) ],
			[ 'wild', t( 'Wild' ) ],
		],
		() => params.rotation,
		( v ) => ( params.rotation = v )
	);
	const shuffleBtn = el( 'button', 'ai-btn secondary wpieta-wide', setSec );
	shuffleBtn.type = 'button';
	shuffleBtn.textContent = t( 'Shuffle' );
	shuffleBtn.onclick = () => {
		params.seed = 1 + Math.floor( Math.random() * 99999 );
		schedule();
	};
	// flow text + post
	const textRow = textAreaRow(
		setSec,
		t( 'Text (lyrics, poem…)' ),
		5,
		() => params.text,
		( v ) => ( params.text = v )
	);
	const postRow = el( 'div', 'wpieta-text-row', setSec );
	el( 'span', null, postRow ).textContent = t( 'Find post…' );
	const postInput = el( 'input', 'wpieta-input', postRow );
	postInput.type = 'text';
	postInput.placeholder = t( 'Search posts' );
	const postList = el( 'div', 'wpieta-postlist', postRow );
	const postPicked = el( 'div', 'wpieta-info', postRow );
	const syncPostPicked = () => {
		postPicked.textContent = params.postTitle
			? `✓ ${ params.postTitle }`
			: '';
	};
	syncPostPicked();
	let postTimer = 0;
	async function searchPosts( q ) {
		postList.innerHTML = '';
		if ( ! ( window.wp && window.wp.apiFetch ) ) {
			el(
				'div',
				'wpieta-info',
				postList,
				t( 'Posts need WordPress (not available here).' )
			);
			return;
		}
		try {
			const posts = await window.wp.apiFetch( {
				path: `/wp/v2/posts?per_page=8&_fields=id,title,content${
					q ? `&search=${ encodeURIComponent( q ) }` : ''
				}`,
			} );
			postList.innerHTML = '';
			if ( ! posts.length ) {
				el( 'div', 'wpieta-info', postList, t( 'No posts found.' ) );
				return;
			}
			for ( const p of posts ) {
				const b = el( 'button', 'wpieta-postitem', postList );
				b.type = 'button';
				b.textContent = p.title?.rendered
					? p.title.rendered.replace( /<[^>]+>/g, '' )
					: `#${ p.id }`;
				b.onclick = () => {
					const div = document.createElement( 'div' );
					div.innerHTML = ( p.content && p.content.rendered ) || '';
					params.postId = p.id;
					params.postTitle = b.textContent;
					params.postText = ( div.textContent || '' )
						.replace( /\s+/g, ' ' )
						.trim()
						.slice( 0, 8000 );
					postList.innerHTML = '';
					syncPostPicked();
					schedule();
				};
			}
		} catch ( e ) {
			postList.innerHTML = '';
			el( 'div', 'wpieta-info', postList, t( 'No posts found.' ) );
		}
	}
	postInput.oninput = () => {
		window.clearTimeout( postTimer );
		postTimer = window.setTimeout(
			() => searchPosts( postInput.value.trim() ),
			350
		);
	};
	postInput.onfocus = () => {
		if ( ! postList.childElementCount ) {
			searchPosts( postInput.value.trim() );
		}
	};

	const fontRow = el( 'div', 'wpieta-text-row', setSec );
	el( 'span', null, fontRow ).textContent = t( 'Font' );
	const fontMount = el( 'div', null, fontRow );
	let fontCtl = null;
	const onFont = ( fam ) => {
		params.font = ! fam || 'System' === fam ? '' : fam;
		if ( params.font && bridge.fonts && bridge.fonts.ensureFont ) {
			bridge.fonts
				.ensureFont( params.font, 700 )
				.then( schedule )
				.catch( schedule );
		} else {
			schedule();
		}
	};
	if ( bridge.components && bridge.components.mountFontPicker ) {
		fontCtl = bridge.components.mountFontPicker( fontMount, {
			value: params.font || 'Montserrat',
			onChange: onFont,
		} );
	} else {
		const fontSel = el( 'select', 'dsm-select wpieta-wide', fontMount );
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
	const sizeRow = sliderRowIn(
		setSec,
		t( 'Text size' ),
		9,
		22,
		() => params.size,
		( v ) => ( params.size = v )
	);
	const layoutRow = selectRow(
		setSec,
		t( 'Layout' ),
		[
			[ 'rows', t( 'Rows' ) ],
			[ 'diagonal', t( 'Diagonal' ) ],
			[ 'waves', t( 'Waves' ) ],
			[ 'spiral', t( 'Spiral' ) ],
		],
		() => params.layout,
		( v ) => ( params.layout = v )
	);
	const dynRow = checkRow(
		setSec,
		t( 'Dynamic size' ),
		() => params.dynamicSize,
		( v ) => ( params.dynamicSize = v )
	);
	const thrRow = sliderRowIn(
		setSec,
		t( 'Threshold' ),
		5,
		95,
		() => params.threshold,
		( v ) => ( params.threshold = v ),
		'%'
	);
	const invRow = checkRow(
		setSec,
		t( 'Invert' ),
		() => params.invert,
		( v ) => ( params.invert = v )
	);
	const maskInfo = el(
		'div',
		'wpieta-info',
		setSec,
		t( 'Cut-out layers use their transparency as the shape.' )
	);
	// brick art
	const bcellRow = sliderRowIn(
		setSec,
		t( 'Brick size' ),
		10,
		40,
		() => params.bcell,
		( v ) => ( params.bcell = v )
	);
	const brickOrigRow = checkRow(
		setSec,
		t( 'Original colors' ),
		() => params.brickOriginal,
		( v ) => ( params.brickOriginal = v )
	);
	// dice
	const diceCellRow = sliderRowIn(
		setSec,
		t( 'Dice size' ),
		14,
		44,
		() => params.diceCell,
		( v ) => ( params.diceCell = v )
	);
	const diceMixRow = selectRow(
		setSec,
		t( 'Dice colors' ),
		[
			[ 'both', t( 'Both' ) ],
			[ 'white', t( 'White dice' ) ],
			[ 'black', t( 'Black dice' ) ],
		],
		() => params.diceMix,
		( v ) => ( params.diceMix = v )
	);
	// cube
	const cubeCellRow = sliderRowIn(
		setSec,
		t( 'Sticker size' ),
		8,
		26,
		() => params.cubeCell,
		( v ) => ( params.cubeCell = v )
	);
	// sticky notes
	const noteCellRow = sliderRowIn(
		setSec,
		t( 'Note size' ),
		14,
		48,
		() => params.noteCell,
		( v ) => ( params.noteCell = v )
	);
	// dot matrix
	const dotCellRow = sliderRowIn(
		setSec,
		t( 'Dot size' ),
		10,
		30,
		() => params.dotCell,
		( v ) => ( params.dotCell = v )
	);
	const dotStyleRow = selectRow(
		setSec,
		t( 'Display style' ),
		[
			[ 'led', t( 'LED wall' ) ],
			[ 'flip', t( 'Flip-dot' ) ],
			[ 'peg', t( 'Pegboard' ) ],
		],
		() => params.dotStyle,
		( v ) => {
			params.dotStyle = v;
			refreshThumbs();
		}
	);
	// ceramic
	const tileCellRow = sliderRowIn(
		setSec,
		t( 'Tile size' ),
		12,
		40,
		() => params.tileCell,
		( v ) => ( params.tileCell = v )
	);
	// keycaps
	const capCellRow = sliderRowIn(
		setSec,
		t( 'Key size' ),
		18,
		48,
		() => params.capCell,
		( v ) => ( params.capCell = v )
	);
	const capTextRow = el( 'label', 'wpieta-text-row', setSec );
	el( 'span', null, capTextRow ).textContent = t( 'Key text (optional)' );
	const capTextInput = el( 'input', 'wpieta-input', capTextRow );
	capTextInput.type = 'text';
	capTextInput.value = params.capText;
	capTextInput.oninput = () => {
		params.capText = capTextInput.value;
		schedule();
	};
	// element tiles
	const elemWordsRow = textAreaRow(
		setSec,
		t( 'Words (one per line)' ),
		4,
		() => params.elemWords,
		( v ) => ( params.elemWords = v )
	);
	const elemStyleRow = selectRow(
		setSec,
		t( 'Tile style' ),
		[
			[ 'classic', t( 'Classic' ) ],
			[ 'neon', t( 'Neon' ) ],
			[ 'chalk', t( 'Chalkboard' ) ],
		],
		() => params.elemStyle,
		( v ) => ( params.elemStyle = v )
	);
	const elemNamesRow = checkRow(
		setSec,
		t( 'Show element names' ),
		() => params.elemNames,
		( v ) => ( params.elemNames = v )
	);
	// hidden words
	const hiddenWordsRow = textAreaRow(
		setSec,
		t( 'Words (one per line)' ),
		4,
		() => params.hiddenWords,
		( v ) => ( params.hiddenWords = v )
	);
	const hiddenDensityRow = sliderRowIn(
		setSec,
		t( 'Grid density' ),
		0,
		100,
		() => params.hiddenDensity,
		( v ) => ( params.hiddenDensity = v )
	);
	const hiddenDiagRow = checkRow(
		setSec,
		t( 'Diagonal words' ),
		() => params.hiddenDiag,
		( v ) => ( params.hiddenDiag = v )
	);
	const hiddenDimRow = sliderRowIn(
		setSec,
		t( 'Dimming' ),
		20,
		95,
		() => params.hiddenDim,
		( v ) => ( params.hiddenDim = v )
	);
	// letter tiles
	const tileWordsRow = textAreaRow(
		setSec,
		t( 'Words (one per line)' ),
		4,
		() => params.tileWords,
		( v ) => ( params.tileWords = v )
	);
	const tileStyleRow = selectRow(
		setSec,
		t( 'Tile style' ),
		[
			[ 'wood', t( 'Wood' ) ],
			[ 'ivory', t( 'Ivory' ) ],
			[ 'dark', t( 'Dark' ) ],
		],
		() => params.tileStyle,
		( v ) => ( params.tileStyle = v )
	);
	const tilePointsRow = checkRow(
		setSec,
		t( 'Show letter values' ),
		() => params.tilePoints,
		( v ) => ( params.tilePoints = v )
	);
	// marquee
	const marqCellRow = sliderRowIn(
		setSec,
		t( 'Bulb size' ),
		12,
		36,
		() => params.marqCell,
		( v ) => ( params.marqCell = v )
	);
	const marqStyleRow = selectRow(
		setSec,
		t( 'Bulb style' ),
		[
			[ 'warm', t( 'Warm white' ) ],
			[ 'color', t( 'Image colors' ) ],
		],
		() => params.marqStyle,
		( v ) => {
			params.marqStyle = v;
			refreshThumbs();
		}
	);
	// stamps / caps / coins / buttons
	const stampCellRow = sliderRowIn(
		setSec,
		t( 'Stamp size' ),
		22,
		56,
		() => params.stampCell,
		( v ) => ( params.stampCell = v )
	);
	const capsCellRow = sliderRowIn(
		setSec,
		t( 'Cap size' ),
		18,
		48,
		() => params.capsCell,
		( v ) => ( params.capsCell = v )
	);
	const coinCellRow = sliderRowIn(
		setSec,
		t( 'Coin size' ),
		16,
		40,
		() => params.coinCell,
		( v ) => ( params.coinCell = v )
	);
	const btnCellRow = sliderRowIn(
		setSec,
		t( 'Button size' ),
		16,
		44,
		() => params.btnCell,
		( v ) => ( params.btnCell = v )
	);
	// domino
	const domCellRow = sliderRowIn(
		setSec,
		t( 'Stone size' ),
		14,
		40,
		() => params.domCell,
		( v ) => ( params.domCell = v )
	);
	const domStyleRow = selectRow(
		setSec,
		t( 'Domino colors' ),
		[
			[ 'black', t( 'Black' ) ],
			[ 'white', t( 'White' ) ],
			[ 'both', t( 'Both' ) ],
		],
		() => params.domStyle,
		( v ) => {
			params.domStyle = v;
			refreshThumbs();
		}
	);
	// your tile
	const tmLayerRow = el( 'label', 'wpieta-row', setSec );
	el( 'span', null, tmLayerRow ).textContent = t( 'Tile layer' );
	const tmLayerSel = el( 'select', 'dsm-select', tmLayerRow );
	{
		const none = el( 'option', null, tmLayerSel );
		none.value = '';
		none.textContent = t( 'Pick a layer…' );
		const walk = ( layers, depth ) => {
			for ( const l of layers || [] ) {
				if ( 'group' === l.type ) {
					walk( l.children, depth + 1 );
					continue;
				}
				const o = el( 'option', null, tmLayerSel );
				o.value = String( l.id );
				o.textContent = ' '.repeat( depth * 2 ) + ( l.name || l.type );
			}
		};
		walk( editor.state.layers, 0 );
	}
	tmLayerSel.value = params.tileLayerId || '';
	tmLayerSel.onchange = () => {
		params.tileLayerId = tmLayerSel.value;
		loadTile();
	};
	const tmCellRow = sliderRowIn(
		setSec,
		t( 'Tile size' ),
		12,
		48,
		() => params.tmCell,
		( v ) => ( params.tmCell = v )
	);
	const tmTintRow = sliderRowIn(
		setSec,
		t( 'Tint' ),
		0,
		100,
		() => params.tmTint,
		( v ) => ( params.tmTint = v ),
		'%'
	);
	const tmJitterRow = checkRow(
		setSec,
		t( 'Rotate tiles' ),
		() => params.tmJitter,
		( v ) => ( params.tmJitter = v )
	);
	// ransom note
	const ransomTextRow = textAreaRow(
		setSec,
		t( 'Message (short lines)' ),
		3,
		() => params.ransomText,
		( v ) => ( params.ransomText = v )
	);
	const ransomPaperRow = selectRow(
		setSec,
		t( 'Paper style' ),
		[
			[ 'color', t( 'Colored paper' ) ],
			[ 'news', t( 'Newsprint' ) ],
		],
		() => params.ransomPaper,
		( v ) => ( params.ransomPaper = v )
	);
	const ransomTiltRow = sliderRowIn(
		setSec,
		t( 'Tilt' ),
		0,
		100,
		() => params.ransomTilt,
		( v ) => ( params.ransomTilt = v ),
		'%'
	);
	// word cloud
	const cloudSourceRow = selectRow(
		setSec,
		t( 'Word source' ),
		[
			[ 'words', t( 'Own words' ) ],
			[ 'post', t( 'From post' ) ],
		],
		() => params.cloudSource,
		( v ) => ( params.cloudSource = v )
	);
	const cloudWordsRow = textAreaRow(
		setSec,
		t( 'Words (one per line)' ),
		5,
		() => params.cloudWords,
		( v ) => ( params.cloudWords = v )
	);
	const cloudShapeRow = selectRow(
		setSec,
		t( 'Shape' ),
		[
			[ 'none', t( 'No shape' ) ],
			[ 'heart', t( 'Heart' ) ],
			[ 'star', t( 'Star' ) ],
			[ 'circle', t( 'Circle' ) ],
			[ 'diamond', t( 'Diamond' ) ],
			[ 'letter', t( 'Letter' ) ],
			[ 'emoji', t( 'Emoji' ) ],
		],
		() => params.cloudShape,
		( v ) => ( params.cloudShape = v )
	);
	const cloudShapeTextRow = el( 'label', 'wpieta-text-row', setSec );
	el( 'span', null, cloudShapeTextRow ).textContent = t( 'Letter or emoji' );
	const cloudShapeTextInput = el(
		'input',
		'wpieta-input',
		cloudShapeTextRow
	);
	cloudShapeTextInput.type = 'text';
	cloudShapeTextInput.maxLength = 4;
	cloudShapeTextInput.value = params.cloudShapeText;
	cloudShapeTextInput.oninput = () => {
		params.cloudShapeText = cloudShapeTextInput.value;
		schedule();
	};
	// qr portrait
	const qrTextRow = el( 'label', 'wpieta-text-row', setSec );
	el( 'span', null, qrTextRow ).textContent = t( 'QR content (URL or text)' );
	const qrTextInput = el( 'input', 'wpieta-input', qrTextRow );
	qrTextInput.type = 'text';
	qrTextInput.maxLength = 116;
	qrTextInput.placeholder =
		( window.location && window.location.origin ) || 'https://…';
	qrTextInput.value = params.qrText;
	qrTextInput.oninput = () => {
		params.qrText = qrTextInput.value;
		schedule();
	};
	const qrCellRow = sliderRowIn(
		setSec,
		t( 'Module size' ),
		10,
		30,
		() => params.qrCell,
		( v ) => ( params.qrCell = v )
	);
	const qrPhotoRow = sliderRowIn(
		setSec,
		t( 'Photo strength' ),
		0,
		100,
		() => params.qrPhoto,
		( v ) => ( params.qrPhoto = v ),
		'%'
	);
	const qrRoundRow = checkRow(
		setSec,
		t( 'Rounded dots' ),
		() => params.qrRound,
		( v ) => ( params.qrRound = v )
	);
	const qrInfo = el(
		'div',
		'wpieta-info',
		setSec,
		t( 'Always test the finished code with your phone before printing.' )
	);

	/* ------------------------------ tile loader ---------------------------- */

	async function loadTile() {
		const token = ++tileToken;
		tileCanvas = null;
		if ( ! params.tileLayerId ) {
			if ( params.tileData ) {
				// Offline re-edit: the baked tile travels in the params.
				const img = new window.Image();
				img.onload = () => {
					if ( token !== tileToken ) {
						return;
					}
					const c = document.createElement( 'canvas' );
					c.width = img.width;
					c.height = img.height;
					c.getContext( '2d' ).drawImage( img, 0, 0 );
					tileCanvas = c;
					refreshThumbs();
					schedule();
				};
				img.src = params.tileData;
			}
			schedule();
			return;
		}
		try {
			const find = ( layers ) => {
				for ( const l of layers || [] ) {
					if ( String( l.id ) === params.tileLayerId ) {
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
			if ( ! target ) {
				schedule();
				return;
			}
			// Transparent stand-in doc: the core paints doc.bg even for a
			// single layer, which would glue a board to the tile.
			const doc = editor.state.doc;
			const full = await bridge.raster.renderToCanvas(
				{ ...doc, bg: 'transparent' },
				[ target ],
				{ scale: Math.min( 1, 700 / doc.w ) }
			);
			// Crop to solid pixels, then shrink to tile size.
			const fg = full.getContext( '2d', { willReadFrequently: true } );
			const d = fg.getImageData( 0, 0, full.width, full.height ).data;
			let x0 = full.width;
			let y0 = full.height;
			let x1 = -1;
			let y1 = -1;
			for ( let y = 0; y < full.height; y++ ) {
				for ( let x = 0; x < full.width; x++ ) {
					if ( d[ ( y * full.width + x ) * 4 + 3 ] > 24 ) {
						x0 = Math.min( x0, x );
						x1 = Math.max( x1, x );
						y0 = Math.min( y0, y );
						y1 = Math.max( y1, y );
					}
				}
			}
			if ( x1 < 0 || token !== tileToken ) {
				schedule();
				return;
			}
			const cw = x1 - x0 + 1;
			const ch = y1 - y0 + 1;
			const k = Math.min( 1, 128 / Math.max( cw, ch ) );
			const c = document.createElement( 'canvas' );
			c.width = Math.max( 1, Math.round( cw * k ) );
			c.height = Math.max( 1, Math.round( ch * k ) );
			c.getContext( '2d' ).drawImage(
				full,
				x0,
				y0,
				cw,
				ch,
				0,
				0,
				c.width,
				c.height
			);
			tileCanvas = c;
			params.tileData = c.toDataURL( 'image/png' );
			refreshThumbs();
			schedule();
		} catch ( e ) {
			schedule();
		}
	}

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
		const flow = 'lyrics' === m || 'post' === m;
		const textOnly = TEXT_ONLY.includes( m );
		const usesFont =
			flow ||
			'words' === m ||
			'silhouette' === m ||
			( textOnly && 'scrabble' !== m );
		const shapeable = 'shape' === params.source;
		// Text-only types: no source, no image color mode, no contrast.
		srcSec.parentElement.style.display = textOnly ? 'none' : '';
		shapeRow.style.display = ! textOnly && shapeable ? '' : 'none';
		shapeTextRow.style.display =
			! textOnly &&
			shapeable &&
			( 'letter' === params.shape || 'emoji' === params.shape )
				? ''
				: 'none';
		const objMosaic = OBJ_MOSAIC.includes( m );
		cmRow.style.display = textOnly || objMosaic ? 'none' : '';
		contrastRow.style.display = textOnly || objMosaic ? 'none' : '';
		bgRow.style.display = FIXED_BOARD.includes( m ) ? 'none' : '';
		const showPalettes =
			! objMosaic && ( textOnly || 'image' !== params.colorMode );
		palWrap.style.display = showPalettes ? '' : 'none';
		customRow.style.display = showPalettes ? '' : 'none';
		cellRow.style.display = 'ascii' === m ? '' : 'none';
		charsetRow.style.display = 'ascii' === m ? '' : 'none';
		customCharsRow.style.display =
			'ascii' === m && 'custom' === params.charset ? '' : 'none';
		boldRow.style.display = 'ascii' === m ? '' : 'none';
		ecellRow.style.display = 'emoji' === m ? '' : 'none';
		esetRow.style.display = 'emoji' === m ? '' : 'none';
		customEmojiRow.style.display =
			'emoji' === m && 'custom' === params.emojiSet ? '' : 'none';
		wordsRow.style.display = 'words' === m ? '' : 'none';
		sizeMinRow.style.display = 'words' === m ? '' : 'none';
		sizeMaxRow.style.display = 'words' === m ? '' : 'none';
		rotRow.style.display = 'words' === m ? '' : 'none';
		shuffleBtn.style.display =
			'words' === m || 'ransom' === m || 'wordcloud' === m ? '' : 'none';
		textRow.style.display =
			'lyrics' === m || 'silhouette' === m ? '' : 'none';
		postRow.style.display =
			'post' === m ||
			( 'wordcloud' === m && 'post' === params.cloudSource )
				? ''
				: 'none';
		fontRow.style.display = usesFont ? '' : 'none';
		sizeRow.style.display = flow || 'silhouette' === m ? '' : 'none';
		layoutRow.style.display = flow ? '' : 'none';
		dynRow.style.display = flow ? '' : 'none';
		thrRow.style.display = 'silhouette' === m ? '' : 'none';
		invRow.style.display = 'silhouette' === m ? '' : 'none';
		maskInfo.style.display =
			'silhouette' === m && 'shape' !== params.source ? '' : 'none';
		bcellRow.style.display = 'brick' === m ? '' : 'none';
		brickOrigRow.style.display = 'brick' === m ? '' : 'none';
		diceCellRow.style.display = 'dice' === m ? '' : 'none';
		diceMixRow.style.display = 'dice' === m ? '' : 'none';
		cubeCellRow.style.display = 'cube' === m ? '' : 'none';
		noteCellRow.style.display = 'sticky' === m ? '' : 'none';
		dotCellRow.style.display = 'dots' === m ? '' : 'none';
		dotStyleRow.style.display = 'dots' === m ? '' : 'none';
		tileCellRow.style.display = 'ceramic' === m ? '' : 'none';
		capCellRow.style.display = 'keycap' === m ? '' : 'none';
		capTextRow.style.display = 'keycap' === m ? '' : 'none';
		elemWordsRow.style.display = 'elements' === m ? '' : 'none';
		elemStyleRow.style.display = 'elements' === m ? '' : 'none';
		elemNamesRow.style.display = 'elements' === m ? '' : 'none';
		hiddenWordsRow.style.display = 'hidden' === m ? '' : 'none';
		hiddenDensityRow.style.display = 'hidden' === m ? '' : 'none';
		hiddenDiagRow.style.display = 'hidden' === m ? '' : 'none';
		hiddenDimRow.style.display = 'hidden' === m ? '' : 'none';
		tileWordsRow.style.display = 'scrabble' === m ? '' : 'none';
		tileStyleRow.style.display = 'scrabble' === m ? '' : 'none';
		tilePointsRow.style.display = 'scrabble' === m ? '' : 'none';
		marqCellRow.style.display = 'marquee' === m ? '' : 'none';
		marqStyleRow.style.display = 'marquee' === m ? '' : 'none';
		stampCellRow.style.display = 'stamp' === m ? '' : 'none';
		capsCellRow.style.display = 'caps' === m ? '' : 'none';
		coinCellRow.style.display = 'coins' === m ? '' : 'none';
		btnCellRow.style.display = 'buttons' === m ? '' : 'none';
		domCellRow.style.display = 'domino' === m ? '' : 'none';
		domStyleRow.style.display = 'domino' === m ? '' : 'none';
		tmLayerRow.style.display = 'tile' === m ? '' : 'none';
		tmCellRow.style.display = 'tile' === m ? '' : 'none';
		tmTintRow.style.display = 'tile' === m ? '' : 'none';
		tmJitterRow.style.display = 'tile' === m ? '' : 'none';
		ransomTextRow.style.display = 'ransom' === m ? '' : 'none';
		ransomPaperRow.style.display = 'ransom' === m ? '' : 'none';
		ransomTiltRow.style.display = 'ransom' === m ? '' : 'none';
		cloudSourceRow.style.display = 'wordcloud' === m ? '' : 'none';
		cloudWordsRow.style.display =
			'wordcloud' === m && 'words' === params.cloudSource ? '' : 'none';
		cloudShapeRow.style.display = 'wordcloud' === m ? '' : 'none';
		cloudShapeTextRow.style.display =
			'wordcloud' === m &&
			( 'letter' === params.cloudShape || 'emoji' === params.cloudShape )
				? ''
				: 'none';
		qrTextRow.style.display = 'qr' === m ? '' : 'none';
		qrCellRow.style.display = 'qr' === m ? '' : 'none';
		qrPhotoRow.style.display = 'qr' === m ? '' : 'none';
		qrRoundRow.style.display = 'qr' === m ? '' : 'none';
		qrInfo.style.display = 'qr' === m ? '' : 'none';
	};

	/* ---------------------------- reveal animation ------------------------- */

	const animSec = section( side, ICONS.film, t( 'Animation' ) );
	sliderRowIn(
		animSec,
		t( 'Duration' ),
		2,
		8,
		() => params.animSecs,
		( v ) => ( params.animSecs = v ),
		's'
	);
	const animRow = el( 'div', 'wpieta-btnrow', animSec );
	const animBtn = el( 'button', 'ai-btn secondary', animRow );
	animBtn.type = 'button';
	const LB_ANIM = t( 'Animation (WebM)' );
	animBtn.textContent = LB_ANIM;
	const animLib = el( 'button', 'ai-btn secondary', animRow );
	animLib.type = 'button';
	const LB_ALIB = t( 'To Media Library' );
	animLib.textContent = LB_ALIB;
	el(
		'div',
		'wpieta-info',
		animSec,
		t(
			'The artwork builds itself piece by piece and ends on the full picture.'
		)
	);

	const easeOut = ( k ) => 1 - Math.pow( 1 - k, 2 );

	/** Seeded, diagonally flavoured cell order for the pop-in reveal. */
	function revealPlan( baked ) {
		const cf = CELL_OF[ params.mode ];
		if ( ! cf ) {
			return null;
		}
		const [ cw, ch ] = cf( params );
		const cols = Math.max( 1, Math.round( baked.width / cw ) );
		const rows = Math.max( 1, Math.round( baked.height / ch ) );
		const rand = ( x, y ) => {
			const n =
				Math.sin( x * 127.1 + y * 311.7 + params.seed * 74.7 ) *
				43758.5453;
			return n - Math.floor( n );
		};
		const cells = [];
		for ( let y = 0; y < rows; y++ ) {
			for ( let x = 0; x < cols; x++ ) {
				cells.push( {
					sx: Math.round( ( x * baked.width ) / cols ),
					sy: Math.round( ( y * baked.height ) / rows ),
					sw: Math.ceil( baked.width / cols ),
					sh: Math.ceil( baked.height / rows ),
					key: ( x + y ) / ( cols + rows ) + rand( x, y ) * 0.35,
				} );
			}
		}
		cells.sort( ( a, b ) => a.key - b.key );
		return cells;
	}

	async function recordReveal( btn, sink ) {
		if ( btn.disabled ) {
			return;
		}
		const baked = bake();
		if ( ! baked ) {
			return;
		}
		animBtn.disabled = true;
		animLib.disabled = true;
		btn.textContent = t( 'Recording…' );
		try {
			const sc = Math.min(
				1,
				1080 / Math.max( baked.width, baked.height )
			);
			const AW = Math.max( 2, Math.round( baked.width * sc ) & ~1 );
			const AH = Math.max( 2, Math.round( baked.height * sc ) & ~1 );
			const rec = document.createElement( 'canvas' );
			rec.width = AW;
			rec.height = AH;
			const rg = rec.getContext( '2d' );
			// The empty board color: the baked corner pixel.
			const probe = document.createElement( 'canvas' );
			probe.width = 1;
			probe.height = 1;
			const pg = probe.getContext( '2d' );
			pg.drawImage( baked, 0, 0 );
			const bp = pg.getImageData( 0, 0, 1, 1 ).data;
			const board = `rgb(${ bp[ 0 ] },${ bp[ 1 ] },${ bp[ 2 ] })`;
			const cells = revealPlan( baked );
			const committed = document.createElement( 'canvas' );
			committed.width = AW;
			committed.height = AH;
			const cg = committed.getContext( '2d' );
			cg.fillStyle = board;
			cg.fillRect( 0, 0, AW, AH );
			let committedN = 0;
			const POP = 0.06;
			const total = Math.max( 2, params.animSecs );
			const tail = 0.6;
			const drawFrame = ( p ) => {
				if ( cells ) {
					const n = cells.length;
					// Commit finished cells once; compose only transitions.
					while (
						committedN < n &&
						( committedN / n ) * 0.92 + POP <= p
					) {
						const cell = cells[ committedN++ ];
						cg.drawImage(
							baked,
							cell.sx,
							cell.sy,
							cell.sw,
							cell.sh,
							cell.sx * sc,
							cell.sy * sc,
							cell.sw * sc,
							cell.sh * sc
						);
					}
					rg.drawImage( committed, 0, 0 );
					for ( let i = committedN; i < n; i++ ) {
						const at = ( i / n ) * 0.92;
						if ( at > p ) {
							break;
						}
						const k = easeOut( Math.min( 1, ( p - at ) / POP ) );
						const cell = cells[ i ];
						const w = cell.sw * sc * k;
						const h = cell.sh * sc * k;
						rg.drawImage(
							baked,
							cell.sx,
							cell.sy,
							cell.sw,
							cell.sh,
							cell.sx * sc + ( cell.sw * sc - w ) / 2,
							cell.sy * sc + ( cell.sh * sc - h ) / 2,
							w,
							h
						);
					}
					return;
				}
				// Typewriter wipe with a soft leading band.
				rg.fillStyle = board;
				rg.fillRect( 0, 0, AW, AH );
				const band = AH * 0.12;
				const edge = p * ( AH + band );
				const solid = Math.max( 0, Math.min( AH, edge - band ) );
				if ( solid > 0 ) {
					rg.drawImage(
						baked,
						0,
						0,
						baked.width,
						( solid / AH ) * baked.height,
						0,
						0,
						AW,
						solid
					);
				}
				const partH = Math.max(
					0,
					Math.min( AH - solid, edge - solid )
				);
				if ( partH > 0 ) {
					rg.globalAlpha = 0.45;
					rg.drawImage(
						baked,
						0,
						( solid / AH ) * baked.height,
						baked.width,
						( partH / AH ) * baked.height,
						0,
						solid,
						AW,
						partH
					);
					rg.globalAlpha = 1;
				}
			};
			drawFrame( 0 );
			const stream = rec.captureStream( 30 );
			const mimes = [
				'video/webm;codecs=vp9',
				'video/webm;codecs=vp8',
				'video/webm',
			];
			const mime = mimes.find(
				( m2 ) =>
					window.MediaRecorder &&
					window.MediaRecorder.isTypeSupported &&
					window.MediaRecorder.isTypeSupported( m2 )
			);
			if ( ! mime ) {
				throw new Error( 'unsupported' );
			}
			const recorder = new window.MediaRecorder( stream, {
				mimeType: mime,
				videoBitsPerSecond: 9000000,
			} );
			const chunks = [];
			recorder.ondataavailable = ( ev ) => {
				if ( ev.data && ev.data.size ) {
					chunks.push( ev.data );
				}
			};
			const done = new Promise( ( resolve, reject ) => {
				recorder.onstop = resolve;
				recorder.onerror = () => reject( new Error( 'recorder' ) );
			} );
			recorder.start( 200 );
			const t0 = performance.now();
			await new Promise( ( resolve ) => {
				const step = ( now ) => {
					const s2 = ( now - t0 ) / 1000;
					drawFrame( Math.min( 1, s2 / ( total - tail ) ) );
					if ( s2 >= total ) {
						resolve();
						return;
					}
					window.requestAnimationFrame( step );
				};
				window.requestAnimationFrame( step );
			} );
			recorder.stop();
			await done;
			await sink( new Blob( chunks, { type: mime } ) );
		} catch ( e ) {
			setStatus( t( 'Recording failed.' ), true );
		}
		animBtn.disabled = false;
		animLib.disabled = false;
		animBtn.textContent = LB_ANIM;
		animLib.textContent = LB_ALIB;
	}

	const downloadBlob = ( blob, name ) => {
		const a = document.createElement( 'a' );
		a.href = URL.createObjectURL( blob );
		a.download = name;
		a.click();
		window.setTimeout( () => URL.revokeObjectURL( a.href ), 4000 );
	};

	async function animToMedia( blob ) {
		const boot = window.WPIE || {};
		const restRoot = String( boot.restUrl || '/wp-json/wpie/v1/' ).replace(
			/wpie\/v1\/?$/,
			''
		);
		const res = await window.fetch( restRoot + 'wp/v2/media', {
			method: 'POST',
			credentials: 'same-origin',
			headers: {
				'X-WP-Nonce': boot.nonce || '',
				'Content-Disposition': 'attachment; filename="text-art.webm"',
				'Content-Type': blob.type || 'video/webm',
			},
			body: blob,
		} );
		setStatus(
			res.ok
				? t( 'Saved to Media Library.' )
				: t( 'Could not save to the Media Library.' ),
			! res.ok
		);
	}

	animBtn.onclick = () =>
		recordReveal( animBtn, async ( blob ) =>
			downloadBlob( blob, 'text-art.webm' )
		);
	animLib.onclick = () => recordReveal( animLib, animToMedia );

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
	apply.textContent = editing ? t( 'Update artwork' ) : t( 'Insert artwork' );
	apply.disabled = true;

	/* ------------------------------- painting ----------------------------- */

	function getEmojiTiles() {
		const key =
			'custom' === params.emojiSet
				? 'c:' + params.customEmoji
				: params.emojiSet;
		if ( ! emojiCache.has( key ) ) {
			const list =
				'custom' === params.emojiSet
					? Array.from( params.customEmoji || '' ).join( ' ' )
					: EMOJI_SETS[ params.emojiSet ] || EMOJI_SETS.mixed;
			emojiCache.set(
				key,
				measureEmojis( document.createElement( 'canvas' ), list )
			);
		}
		return emojiCache.get( key );
	}

	function bake() {
		const textOnly = TEXT_ONLY.includes( params.mode );
		if ( ! srcFlat && ! textOnly ) {
			return null;
		}
		const like = document.createElement( 'canvas' );
		const base = {
			colorMode: params.colorMode,
			colors: resolvedColors(),
			background: params.background,
			contrast: params.contrast / 100,
			font: params.font,
		};
		if ( textOnly ) {
			const doc = editor.state.doc;
			const W = 1200;
			const H = Math.max(
				500,
				Math.min( 2200, Math.round( ( W * doc.h ) / doc.w ) )
			);
			const dims = { width: W, height: H };
			switch ( params.mode ) {
				case 'elements':
					return renderElementWords( like, {
						...base,
						...dims,
						words: splitLines( params.elemWords ),
						tileStyle: params.elemStyle,
						showNames: params.elemNames,
					} );
				case 'hidden':
					return renderLetterGrid( like, {
						...base,
						...dims,
						words: splitLines( params.hiddenWords ),
						density: params.hiddenDensity,
						diagonals: params.hiddenDiag,
						dim: params.hiddenDim,
						seed: params.seed,
					} );
				case 'ransom':
					return renderRansomNote( like, {
						...base,
						...dims,
						lines: splitLines( params.ransomText, 6 ),
						paperStyle: params.ransomPaper,
						tilt: params.ransomTilt,
						seed: params.seed,
					} );
				case 'wordcloud': {
					const entries =
						'post' === params.cloudSource && params.postText
							? tokenizeCloud( params.postText )
							: splitLines( params.cloudWords, 60 ).map(
									( w, i, arr ) => ( {
										word: w,
										weight: arr.length - i,
									} )
							  );
					const mask =
						'none' !== params.cloudShape
							? makeShapeMask(
									like,
									dims.width,
									dims.height,
									params.cloudShape,
									params.cloudShapeText,
									params.font
							  )
							: null;
					return renderWordCloud( like, {
						...base,
						...dims,
						entries,
						seed: params.seed,
						mask,
					} );
				}
				default:
					return renderScrabble( like, {
						...base,
						...dims,
						words: splitLines( params.tileWords ),
						tileStyle: params.tileStyle,
						showPoints: params.tilePoints,
					} );
			}
		}
		switch ( params.mode ) {
			case 'ascii':
				return renderAscii( like, srcFlat, {
					...base,
					cell: params.cell,
					charset: params.charset,
					customChars: params.customChars,
					bold: params.bold,
				} );
			case 'emoji':
				return renderEmojiArt( like, srcFlat, getEmojiTiles(), {
					...base,
					cell: params.ecell,
				} );
			case 'brick':
				return renderBrickArt( like, srcFlat, {
					cell: params.bcell,
					originalColors: params.brickOriginal,
				} );
			case 'dice':
				return renderDiceArt( like, srcFlat, {
					cell: params.diceCell,
					mix: params.diceMix,
					background: params.background,
				} );
			case 'cube':
				return renderCubeArt( like, srcFlat, {
					cell: params.cubeCell,
				} );
			case 'sticky':
				return renderStickyNotes( like, srcFlat, {
					cell: params.noteCell,
					background: params.background,
				} );
			case 'dots':
				return renderDotMatrix( like, srcFlat, {
					cell: params.dotCell,
					style: params.dotStyle,
				} );
			case 'ceramic':
				return renderCeramicMosaic( like, srcFlat, {
					cell: params.tileCell,
					background: params.background,
				} );
			case 'keycap':
				return renderKeycapArt( like, srcFlat, {
					cell: params.capCell,
					text: params.capText,
				} );
			case 'marquee':
				return renderMarquee( like, srcFlat, {
					cell: params.marqCell,
					style: params.marqStyle,
				} );
			case 'stamp':
				return renderStampWall( like, srcFlat, {
					cell: params.stampCell,
					background: params.background,
				} );
			case 'caps':
				return renderBottleCaps( like, srcFlat, {
					cell: params.capsCell,
					background: params.background,
				} );
			case 'coins':
				return renderCoinMosaic( like, srcFlat, {
					cell: params.coinCell,
					background: params.background,
				} );
			case 'buttons':
				return renderButtonMosaic( like, srcFlat, {
					cell: params.btnCell,
					background: params.background,
				} );
			case 'domino':
				return renderDominoArt( like, srcFlat, {
					cell: params.domCell,
					stoneStyle: params.domStyle,
					background: params.background,
				} );
			case 'tile':
				return renderTileMosaic( like, srcFlat, tileCanvas, {
					cell: params.tmCell,
					tint: params.tmTint,
					jitter: params.tmJitter,
					background: params.background,
				} );
			case 'qr':
				return renderQrPortrait( like, srcFlat, {
					text:
						params.qrText.trim() ||
						( window.location && window.location.origin ) ||
						'WunderPaint',
					cell: params.qrCell,
					photo: params.qrPhoto,
					round: params.qrRound,
				} );
			case 'words':
				return renderWordArt( like, srcFlat, {
					...base,
					words: splitLines( params.words ),
					sizeMin: params.sizeMin,
					sizeMax: params.sizeMax,
					rotation: params.rotation,
					seed: params.seed,
				} );
			case 'lyrics':
				return renderTextFlow( like, srcFlat, {
					...base,
					text: params.text || 'LA LA LA ',
					size: params.size,
					layout: params.layout,
					dynamicSize: params.dynamicSize,
				} );
			case 'post':
				return renderTextFlow( like, srcFlat, {
					...base,
					text: params.postText || params.postTitle || 'WordPress ',
					size: params.size,
					layout: params.layout,
					dynamicSize: params.dynamicSize,
				} );
			default:
				return renderSilhouetteText( like, srcRaw || srcFlat, {
					...base,
					text: params.text || 'ART ',
					size: params.size,
					threshold: params.threshold,
					invert: params.invert,
				} );
		}
	}

	let timer = 0;
	let bakeToken = 0;
	function drawBaked( baked ) {
		const maxW = Math.max( 200, view.clientWidth - 36 );
		const maxH = Math.max( 200, view.clientHeight - 36 );
		const sc = Math.min( maxW / baked.width, maxH / baked.height, 1 );
		canvas.width = Math.round( baked.width * sc );
		canvas.height = Math.round( baked.height * sc );
		const g = canvas.getContext( '2d' );
		g.imageSmoothingEnabled = true;
		g.drawImage( baked, 0, 0, canvas.width, canvas.height );
	}
	function paintNow() {
		syncUi();
		if ( ! srcFlat && ! TEXT_ONLY.includes( params.mode ) ) {
			apply.disabled = true;
			canvas.width = 10;
			canvas.height = 10;
			return;
		}
		const tk = ++bakeToken;
		setStatus( t( 'Rendering the artwork' ) );
		window.setTimeout( () => {
			if ( tk !== bakeToken ) {
				return;
			}
			const baked = bake();
			if ( tk !== bakeToken ) {
				return;
			}
			apply.disabled = ! baked;
			if ( baked ) {
				drawBaked( baked );
				setStatus( '' );
			} else if ( 'tile' === params.mode && ! tileCanvas ) {
				setStatus( t( 'Pick a tile layer below.' ), true );
			} else if ( 'qr' === params.mode ) {
				setStatus(
					t( 'The QR text is too long - about 110 characters fit.' ),
					true
				);
			} else {
				setStatus( '' );
			}
		}, 40 );
	}
	function schedule() {
		window.clearTimeout( timer );
		timer = window.setTimeout( paintNow, 220 );
	}

	/* ------------------------------ lifecycle ----------------------------- */

	const onResize = () => schedule();
	const viewRO =
		'function' === typeof window.ResizeObserver
			? new window.ResizeObserver( () => schedule() )
			: null;
	const onKey = ( e ) => {
		if ( 'Escape' === e.key ) {
			close();
		}
	};
	function close() {
		window.clearTimeout( timer );
		window.clearTimeout( thumbTimer );
		bakeToken++;
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
		setStatus( t( 'Rendering the artwork' ) );
		try {
			const baked = bake();
			if ( ! baked ) {
				throw new Error( t( 'Could not insert the artwork.' ) );
			}
			const url = baked.toDataURL( 'image/png' );
			const doc = editor.state.doc;
			const stored = { ...params };
			if ( editing ) {
				editor.dispatch( {
					type: 'UPDATE_LAYER',
					id: layer.id,
					patch: {
						src: url,
						naturalW: baked.width,
						naturalH: baked.height,
						generator: { id: GEN_ID, params: stored },
					},
				} );
				editor.commit( t( 'Update artwork' ) );
				setStatus( t( 'Artwork updated.' ) );
			} else {
				const name = t(
					MODES.find( ( m ) => m.id === params.mode ).label
				);
				// The text/shape modes bake to the document's aspect ratio, so
				// they can fill the whole canvas; image-based art keeps its own
				// aspect and is fit centred (filling it would distort the art).
				const docAR = ( doc.w || 1 ) / ( doc.h || 1 );
				const fillsCanvas =
					Math.abs( baked.width / baked.height - docAR ) / docAR <
					0.02;
				let box;
				if ( fillsCanvas ) {
					box = { x: 0, y: 0, w: doc.w, h: doc.h };
				} else {
					const fit = Math.min(
						( doc.w * 0.92 ) / baked.width,
						( doc.h * 0.92 ) / baked.height
					);
					const w = Math.round( baked.width * fit ),
						h = Math.round( baked.height * fit );
					box = {
						x: Math.round( ( doc.w - w ) / 2 ),
						y: Math.round( ( doc.h - h ) / 2 ),
						w,
						h,
					};
				}
				const imgLayer = bridge.documents.makeImage( {
					name,
					...box,
					src: url,
					naturalW: baked.width,
					naturalH: baked.height,
				} );
				imgLayer.generator = { id: GEN_ID, params: stored };
				editor.dispatch( { type: 'ADD_LAYER', layer: imgLayer } );
				editor.dispatch( { type: 'SET_ACTIVE', id: imgLayer.id } );
				editor.commit( t( 'Insert artwork' ) );
				setStatus( t( 'Inserted.' ) );
			}
			close();
		} catch ( e ) {
			setStatus(
				e && e.message
					? e.message
					: t( 'Could not insert the artwork.' ),
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
		loadSource();
		if ( params.tileLayerId || params.tileData ) {
			loadTile();
		}
		if ( params.font && bridge.fonts && bridge.fonts.ensureFont ) {
			bridge.fonts
				.ensureFont( params.font, 700 )
				.then( schedule )
				.catch( () => {} );
		}
	} );
}

/* -------------------------------- register ------------------------------- */

function register( api ) {
	api.registerGenerator( {
		id: GEN_ID,
		label: 'Text Art',
		run: ( ctx ) => openStudio( ctx ),
		edit: ( ctx ) => openStudio( ctx ),
	} );
}

if ( window.WPIE && window.WPIE.api ) {
	register( window.WPIE.api );
} else {
	window.wp.hooks.addAction( 'wpie.ready', 'wpie-text-art', register );
}
