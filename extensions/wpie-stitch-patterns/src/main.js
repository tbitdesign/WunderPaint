/**
 * WPIE extension: Stitch Patterns (v2 dialog).
 *
 * The whole document (default), any layer or a media-library image
 * becomes a counted craft chart: cross-stitch, diamond painting, fuse
 * beads (pegboard splits), a gauge-aware knitting chart, C2C crochet
 * or a latch-hook rug. Yarn colors come from the image (median cut
 * with accent rescue), from ten preset palettes, the brand kit or up
 * to four custom colors; every sheet takes a multi-line title in the
 * editor font catalog. Everything is computed locally.
 */

import {
	MODES,
	buildGrid,
	renderChart,
	renderLegend,
	planStringArt,
	drawStringArt,
	threadMetres,
	BOARD_SHAPES,
	NAIL_INSET_CM,
	renderStringGuide,
	buildStringMandala,
	fairIsle,
	fitText,
	pickThreadColors,
	threadCount,
	hexOf,
	CRAFTS,
} from './stitch-engine.js';
import {
	beadWeave,
	filetCrochet,
	blackwork,
	blackworkKey,
	quilt,
	hitomezashi,
	bracelet,
	WEAVES,
	NO_PHOTO,
} from './crafts.js';
import { renderFinished, FINISHED_MODES } from './finished.js';
import { nailTemplatePages, pagesToPdf, PAPERS } from './nail-template.js';
import { YARN_SETS, yarnFor, nearestYarn, yarnLabel } from './threadsets.js';
import { patternPages } from './pattern-pdf.js';
import { encodeMp4, encodeGif, mp4Available } from './export.js';

const GEN_ID = 'wpie-stitch-patterns/chart';
const BAKE_CELL = 18;
const MARGIN = 30;

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
		colors: [ '#101010', '#d9a441', '#f5e6c4', '#8a5a1c' ],
	},
	{
		id: 'ocean',
		label: 'Ocean',
		colors: [ '#0b7285', '#1098ad', '#66d9e8', '#e3fafc' ],
	},
	{
		id: 'blush',
		label: 'Blush',
		colors: [ '#c94f6d', '#e58aa4', '#f7d6de', '#6d2136' ],
	},
	{
		id: 'forest',
		label: 'Forest',
		colors: [ '#2b9348', '#80b918', '#eeef20', '#007f5f' ],
	},
	{
		id: 'candy',
		label: 'Candy',
		colors: [ '#f9a8d4', '#e879f9', '#818cf8', '#38bdf8' ],
	},
	{
		id: 'sunset',
		label: 'Sunset',
		colors: [ '#ffd27a', '#ff7e5f', '#c2427b', '#7a2948' ],
	},
	{
		id: 'mono',
		label: 'Black & White',
		colors: [ '#111418', '#4a4f57', '#9aa0a8', '#e8eaee' ],
	},
	{
		id: 'noel',
		label: 'Christmas',
		colors: [ '#b3212b', '#1f6f43', '#f5e6c4', '#8a5a1c' ],
	},
];

const DEFAULTS = {
	image: null, // { id, url, title } for media picks
	source: 'doc', // 'doc' | 'layer:<id>' | 'media'
	mode: 'crossstitch',
	title: '',
	font: '',
	textScale: 100,
	gridW: 60,
	colors: 14,
	symbols: true,
	drill: 'square',
	gauge: 75,
	boardSize: 29,
	nails: 288,
	threads: 2400,
	thickness: 'normal',
	guide: true,
	board: 'round',
	boardCm: 40,
	paper: '',
	// chart | finished | both: the counted chart, the piece as it looks
	// once made, or both side by side.
	view: 'both',
	factor: 2,
	paletteId: '', // '' = auto colors from the image
	// v2.9: the range the legend names its colors in - 'auto' picks the
	// craft's own (DMC for floss and drills, Hama for beads), '' none.
	yarn: 'auto',
	// v2.9: string art in several thread colours (1 = the classic one).
	threadColors: 1,
	// v2.9: knitting as Fair Isle - two colours per row, long floats marked.
	fairIsle: false,
	maxFloat: 5,
	// v3.0: the crafts from the proof sheet.
	weave: 'peyote',
	filetInvert: false,
	quiltBlocks: 14,
	blockCm: 10,
	hitoAcross: 'SASHIKO',
	hitoDown: 'HITOMEZASHI',
	hitoSize: 30,
	braceletKind: 'alpha',
	braceletName: 'LOVE',
	braceletLength: 24,
	useBrand: false,
	brandKitId: '',
	customColors: [],
};

import { t } from './i18n.js';
import { studioUndo } from '../../shared/studio-undo.js';

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

const hexToRgb = ( hex ) => [
	parseInt( hex.slice( 1, 3 ), 16 ),
	parseInt( hex.slice( 3, 5 ), 16 ),
	parseInt( hex.slice( 5, 7 ), 16 ),
];

const splitLines = ( s, maxLines = 2 ) =>
	String( s || '' )
		.split( /\r?\n/ )
		.map( ( l ) => l.trim() )
		.filter( Boolean )
		.slice( 0, maxLines );

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
	craft: tabIcon(
		'M3 21h4l11 -11a2.828 2.828 0 0 0 -4 -4l-11 11v4 M14.5 5.5l4 4'
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
	if ( ! PAPERS[ params.paper ] ) {
		params.paper = /^en[-_](us|ca)/i.test(
			String( ( window.WPIE && window.WPIE.locale ) || '' )
		)
			? 'letter'
			: 'a4';
	}

	let srcBase = null; // full source canvas (doc, layer or media)
	let srcVersion = 0; // bumps with every new source: the plan cache key
	let srcCanvas = null; // cropped to grid aspect
	let srcToken = 0;
	let grid = null;
	let gridKey = '';

	const host = document.getElementById( 'wpie-root' ) || document.body;
	const backdrop = el( 'div', 'modal-backdrop', host );
	const dialog = el( 'div', 'dsm wpiestp-dialog', backdrop );
	dialog.onclick = ( e ) => e.stopPropagation();
	const head = el( 'div', 'dsm-head', dialog );
	// Die Marke kommt aus dem Kit (bridge.ui), nicht aus dem Paket.
	window.WPIE.bridge.ui.badge( head );
	const titles = el( 'div', 'dsm-titles', head );
	el( 'span', 'dsm-title', titles, 'Stitch Patterns' );
	el( 'div', 'dsm-sub', titles, t( 'Craft sheets - as editable layers.' ) );
	const closeBtn = el( 'button', 'dsm-x', head );
	closeBtn.innerHTML = '&times;';
	closeBtn.setAttribute( 'aria-label', t( 'Close' ) );

	const ui = bridge.ui;
	const body = el( 'div', 'wpiestp-body', dialog );
	const library = el( 'div', 'dsm-col start wpiestp-library', body );
	const view = el( 'div', 'wpiestp-view', body );
	const canvas = el( 'canvas', null, view );
	const side = el( 'div', 'dsm-col end wpiestp-side', body );
	const status = el( 'div', 'dsm-viewhint wpiestp-status', view );
	const setStatus = ( msg, isErr ) => {
		status.textContent = msg || '';
		status.classList.toggle( 'on', !! msg );
		status.classList.toggle( 'err', !! isErr );
	};

	const section = ( parent, icon, label ) => {
		const content = ui.section( parent, { icon, title: label } );
		content.parentElement.classList.add( 'wpiestp-card' );
		return content;
	};

	/* ----------------------------- craft cards ---------------------------- */

	const modeSec = section( library, ICONS.craft, t( 'Craft' ) );
	// v3.0: fourteen crafts read better in two groups - the ones made from
	// a picture, and the ones that need none.
	const modeGrids = new Map();
	for ( const [ id, label ] of [
		[ 'photo', 'From a picture' ],
		[ 'nophoto', 'Without a picture' ],
	] ) {
		el( 'div', 'dsm-subhead wpiestp-subhead', modeSec, t( label ) );
		modeGrids.set( id, ui.picks( modeSec, { cell: 110, cls: 'wpiestp-cards' } ) );
	}
	const modeTiles = new Map();
	for ( const m of MODES ) {
		const thumb = document.createElement( 'canvas' );
		thumb.width = 198;
		thumb.height = 138;
		thumb.setAttribute( 'aria-hidden', 'true' );
		const { node: card } = ui.pick( modeGrids.get( m.group || 'photo' ), {
			label: t( m.label ),
			thumb,
			cls: 'wpiestp-tcard',
			on: params.mode === m.id,
		} );
		card.dataset.mode = m.id;
		card.onclick = () => {
			params.mode = m.id;
			onGeometryChange();
			syncUi();
		};
		modeTiles.set( m.id, { card, thumb } );
	}

	// Live craft previews on the cards: a tiny chart of the ACTUAL
	// source (fallback swatch until it loads).
	function thumbSource() {
		if ( srcCanvas ) {
			return srcCanvas;
		}
		const c = document.createElement( 'canvas' );
		c.width = 96;
		c.height = 72;
		const g = c.getContext( '2d' );
		const gr = g.createLinearGradient( 0, 0, 96, 72 );
		gr.addColorStop( 0, '#577590' );
		gr.addColorStop( 0.5, '#f9c74f' );
		gr.addColorStop( 1, '#f94144' );
		g.fillStyle = gr;
		g.fillRect( 0, 0, 96, 72 );
		g.fillStyle = '#ffffff';
		g.beginPath();
		g.arc( 48, 36, 20, 0, Math.PI * 2 );
		g.fill();
		return c;
	}
	function paintCardThumbs() {
		const src = thumbSource();
		let tGrid;
		try {
			tGrid = buildGrid( src, 24, 18, 8, resolvedFixed() );
		} catch ( e ) {
			return;
		}
		for ( const m of MODES ) {
			const { thumb } = modeTiles.get( m.id );
			try {
				let c;
				if ( 'stringart' === m.id ) {
					c = drawStringArt(
						src,
						planStringArt( src, {
							nails: 144,
							threads: 500,
							grid: 150,
							board: params.board,
						} ),
						{ size: 138, color: accentHex() || '#26292e' }
					);
				} else if ( CRAFTS.includes( m.id ) ) {
					const res = craftResult( m.id, src, 5, true );
					c = res ? res.finished : null;
				} else if ( 'mandala' === m.id ) {
					c = buildStringMandala(
						document.createElement( 'canvas' ),
						{
							nails: 100,
							factor: params.factor,
							color: accentHex() || '#26292e',
							// A 96px tile has no room for nail numbers.
							labels: false,
						}
					);
				} else {
					c = document.createElement( 'canvas' );
					const cell = 6;
					const ch =
						'knitting' === m.id ? Math.round( cell * 0.75 ) : cell;
					c.width = 24 * cell;
					c.height = 18 * ch;
					renderChart( c.getContext( '2d' ), tGrid, 24, 18, {
						mode: m.id,
						cell,
						cellH: ch,
						symbols: false,
						boardSize: 0,
					} );
				}
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

	const srcSec = section( library, ICONS.source, t( 'Source' ) );
	const srcSel = el( 'select', 'dsm-select wpiestp-wide', srcSec );
	srcSel.setAttribute( 'aria-label', t( 'Source' ) );
	const srcNote = el( 'div', 'dsm-note wpiestp-info', srcSec );
	library.prepend( srcSec.parentElement );

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
		const scale = Math.min( 1, 900 / img.width );
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
		setStatus( t( 'Rendering the chart' ) );
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
					{ scale: Math.min( 1, 900 / editor.state.doc.w ) }
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
							scale: Math.min( 1, 900 / editor.state.doc.w ),
							cache: bridge.raster.sharedImageCache,
							allLayers: selected,
						}
					);
					srcNote.textContent = target.name || '';
				}
			}
			c = flattenWhite( c );
			if ( token === srcToken ) {
				srcBase = c;
				srcVersion++;
				srcCanvas = c ? cropToGrid( c ) : null;
				gridKey = '';
				apply.disabled = ! srcCanvas && ! NO_PHOTO.includes( params.mode );
				setStatus( '' );
				syncInfo();
				refreshThumbs();
				paint();
			}
		} catch ( e ) {
			if ( token === srcToken ) {
				srcBase = null;
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

	function cropToGrid( img ) {
		// Crop the source to the grid aspect so cells stay square in
		// the motif (knitting compensates via cell height instead).
		const cols = params.gridW;
		const rows = gridRows( img.width / img.height );
		const c = document.createElement( 'canvas' );
		const target = cols / rows;
		let sw = img.width;
		let sh = img.width / target;
		if ( sh > img.height ) {
			sh = img.height;
			sw = img.height * target;
		}
		c.width = Math.round( sw );
		c.height = Math.round( sh );
		c.getContext( '2d' ).drawImage(
			img,
			( img.width - sw ) / 2,
			( img.height - sh ) / 2,
			sw,
			sh,
			0,
			0,
			c.width,
			c.height
		);
		return c;
	}

	function gridRows( srcAspect ) {
		const cellAspect = 'knitting' === params.mode ? params.gauge / 100 : 1;
		return Math.max(
			8,
			Math.round( params.gridW / srcAspect / cellAspect )
		);
	}

	const syncInfo = () => {
		srcNote.textContent = srcBase
			? `${
					'media' === params.source && params.image
						? params.image.title || ''
						: srcNote.textContent
			  } · ${ params.gridW } x ${ gridRows(
					srcBase.width / srcBase.height
			  ) } ${ t( 'cells' ) }`
					.replace( /^ ·/, '' )
					.trim()
			: '';
	};

	/* ------------------------------- colors ------------------------------- */

	const colSec = section( side, ICONS.colors, t( 'Colors' ) );
	const palWrap = el( 'div', 'wpiestp-pals', colSec );
	const palBtns = new Map();
	for ( const p of PALETTES ) {
		const b = el( 'button', 'dsm-strip wpiestp-pal', palWrap );
		b.type = 'button';
		b.title = p.label;
		b.style.background = `linear-gradient(90deg, ${ p.colors.join(
			','
		) })`;
		b.onclick = () => {
			params.paletteId = p.id;
			params.customColors = [];
			params.useBrand = false;
			gridKey = '';
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
		const brandLbl = el( 'label', 'dsm-checkrow wpiestp-check', colSec );
		brandCb = el( 'input', null, brandLbl );
		brandCb.type = 'checkbox';
		brandCb.checked = !! params.useBrand;
		el( 'span', null, brandLbl ).textContent = t( 'Use brand colors' );
		brandCb.onchange = () => {
			params.useBrand = brandCb.checked;
			if ( params.useBrand ) {
				params.customColors = [];
				params.paletteId = '';
			}
			gridKey = '';
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
					gridKey = '';
					refreshThumbs();
					paint();
				},
			} );
		}
	}

	// Up to four custom yarn colors; the mounted button is controlled -
	// call handle.set() on every change.
	const customRow = el( 'div', 'wpiestp-row wpiestp-customrow', colSec );
	el( 'span', 'dsm-rowline-label', customRow ).textContent =
		t( 'Custom colors' );
	const customWrap = el( 'span', 'wpiestp-customs', customRow );
	const mountSwatch = bridge.components && bridge.components.mountColorButton;
	const customCtls = [];
	for ( let i = 0; i < 4; i++ ) {
		const slot = el( 'span', 'wpiestp-swatch', customWrap );
		const onChange = ( c ) => {
			const hex = 'string' === typeof c ? c : ( c && c.hex ) || '';
			params.customColors[ i ] = hex;
			params.useBrand = false;
			params.paletteId = '';
			if ( customCtls[ i ] && customCtls[ i ].set && hex ) {
				customCtls[ i ].set( hex );
			}
			gridKey = '';
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
		'ai-btn secondary wpiestp-reset',
		customRow
	);
	resetBtn.textContent = t( 'Auto' );
	resetBtn.onclick = ( e ) => {
		e.preventDefault();
		params.customColors = [];
		params.useBrand = false;
		params.paletteId = '';
		customCtls.forEach( ( ctl ) => ctl && ctl.set && ctl.set( '#cccccc' ) );
		gridKey = '';
		syncUi();
		refreshThumbs();
		paint();
	};

	// v2.9: the range the legend names the colors in - the thread, bead
	// or yarn to buy. The palette snaps to its real colors.
	const yarnRow = el( 'label', 'wpiestp-row', colSec );
	el( 'span', 'dsm-rowline-label', yarnRow ).textContent = t( 'Yarn range' );
	const yarnSel = el( 'select', 'dsm-select', yarnRow );
	for ( const [ v, l ] of [
		[ 'auto', t( 'For this craft' ) ],
		...YARN_SETS.map( ( y ) => [ y.id, t( y.label ) ] ),
		[ '', t( 'No numbers, colors from the image' ) ],
	] ) {
		const o = el( 'option', null, yarnSel );
		o.value = v;
		o.textContent = l;
	}
	yarnSel.value = params.yarn ?? 'auto';
	yarnSel.onchange = () => {
		params.yarn = yarnSel.value;
		gridKey = '';
		planKey = '';
		syncUi();
		refreshThumbs();
		paint();
	};
	// The data comes with a credit, and it belongs where the numbers show.
	const yarnCredit = el(
		'div',
		'dsm-note wpiestp-credit',
		colSec,
		t( 'Thread numbers: nearest color. Color data: craft-color-codes by MakeBead, CC BY 4.0.' )
	);
	const activeYarn = () => yarnFor( params.mode, params.yarn );

	// First pinned color as hex - the thread color for string art and
	// the mandala ('' = default ink).
	function accentHex() {
		const fixed = resolvedFixed();
		return fixed
			? '#' +
					fixed[ 0 ]
						.map( ( v ) => v.toString( 16 ).padStart( 2, '0' ) )
						.join( '' )
			: '';
	}

	// Fixed yarn palette (rgb triplets) or null = auto from the image.
	function resolvedFixed() {
		const valid = ( c ) => /^#[0-9a-f]{6}$/i.test( String( c ) );
		const custom = ( params.customColors || [] ).filter( valid );
		if ( custom.length >= 2 ) {
			return custom.map( hexToRgb );
		}
		const brand = brandColors().filter( valid );
		if ( brand.length >= 2 ) {
			return brand.map( hexToRgb );
		}
		const pal = PALETTES.find( ( p ) => p.id === params.paletteId );
		if ( pal ) {
			return pal.colors.map( hexToRgb );
		}
		return null;
	}

	/* ------------------------------ settings ------------------------------ */

	const setSec = section( side, ICONS.settings, t( 'Settings' ) );

	const titleRow = el( 'label', 'wpiestp-text-row', setSec );
	el( 'span', 'dsm-fieldlabel', titleRow ).textContent = t( 'Title' );
	const titleArea = el( 'textarea', 'dsm-input wpiestp-names', titleRow );
	titleArea.rows = 2;
	titleArea.value = params.title;
	titleArea.oninput = () => {
		params.title = titleArea.value;
		paint();
	};

	const fontRow = el( 'div', 'wpiestp-text-row', setSec );
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
		const fontSel = el( 'select', 'dsm-select wpiestp-wide', fontMount );
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
		const row = el( 'label', 'wpiestp-row', parent );
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
		};
		return row;
	}
	const sizeTextRow = sliderRowIn(
		setSec,
		t( 'Text size' ),
		60,
		160,
		() => params.textScale,
		( v ) => {
			params.textScale = v;
			paint();
		},
		'%'
	);
	const gridWRow = sliderRowIn(
		setSec,
		t( 'Grid width' ),
		24,
		120,
		() => params.gridW,
		( v ) => {
			params.gridW = v;
			onGeometryChange();
		}
	);
	const colorsRow = sliderRowIn(
		setSec,
		t( 'Colors' ),
		6,
		24,
		() => params.colors,
		( v ) => {
			params.colors = v;
			gridKey = '';
			refreshThumbs();
			paint();
		}
	);
	const gaugeRow = sliderRowIn(
		setSec,
		t( 'Stitch gauge' ),
		60,
		100,
		() => params.gauge,
		( v ) => {
			params.gauge = v;
			onGeometryChange();
		},
		'%'
	);
	const boardRow = el( 'label', 'wpiestp-row', setSec );
	el( 'span', 'dsm-rowline-label', boardRow ).textContent =
		t( 'Pegboard size' );
	const boardSel = el( 'select', 'dsm-select', boardRow );
	for ( const size of [ 29, 50 ] ) {
		const o = el( 'option', null, boardSel );
		o.value = String( size );
		o.textContent = `${ size } x ${ size }`;
	}
	boardSel.value = String( params.boardSize );
	boardSel.onchange = () => {
		params.boardSize = parseInt( boardSel.value, 10 );
		paint();
	};
	const drillRow = el( 'label', 'wpiestp-row', setSec );
	el( 'span', 'dsm-rowline-label', drillRow ).textContent =
		t( 'Drill shape' );
	const drillSel = el( 'select', 'dsm-select', drillRow );
	for ( const [ v, l ] of [
		[ 'square', t( 'Square' ) ],
		[ 'round', t( 'Round' ) ],
	] ) {
		const o = el( 'option', null, drillSel );
		o.value = v;
		o.textContent = l;
	}
	drillSel.value = params.drill || 'square';
	drillSel.onchange = () => {
		params.drill = drillSel.value;
		paint();
	};
	const symLbl = el( 'label', 'dsm-checkrow wpiestp-check', setSec );
	const symCb = el( 'input', null, symLbl );
	symCb.type = 'checkbox';
	symCb.checked = !! params.symbols;
	el( 'span', null, symLbl ).textContent = t( 'Chart symbols' );
	symCb.onchange = () => {
		params.symbols = symCb.checked;
		paint();
	};
	// String art / mandala settings.
	const selectRow = ( label, values, get, set, fmt ) => {
		const row = el( 'label', 'wpiestp-row', setSec );
		el( 'span', 'dsm-rowline-label', row ).textContent = label;
		const sel = el( 'select', 'dsm-select', row );
		for ( const v of values ) {
			const o = el( 'option', null, sel );
			o.value = String( v );
			o.textContent = fmt ? fmt( v ) : String( v );
		}
		sel.value = String( get() );
		sel.onchange = () => {
			set( parseInt( sel.value, 10 ) );
			paint();
		};
		return row;
	};
	const nailsRow = selectRow(
		t( 'Nails' ),
		[ 144, 192, 240, 288, 360 ],
		() => params.nails,
		( v ) => ( params.nails = v )
	);
	const threadsRow = selectRow(
		t( 'Threads' ),
		[ 800, 1500, 2400, 3500 ],
		() => params.threads,
		( v ) => ( params.threads = v ),
		( v ) => `≈ ${ v }`
	);
	const thicknessRow = ( () => {
		const row = el( 'label', 'wpiestp-row', setSec );
		el( 'span', 'dsm-rowline-label', row ).textContent =
			t( 'Thread weight' );
		const sel = el( 'select', 'dsm-select', row );
		for ( const [ v, l ] of [
			[ 'fine', t( 'Fine' ) ],
			[ 'normal', 'Normal' ],
			[ 'bold', t( 'Bold' ) ],
		] ) {
			const o = el( 'option', null, sel );
			o.value = v;
			o.textContent = l;
		}
		sel.value = params.thickness;
		sel.onchange = () => {
			params.thickness = sel.value;
			paint();
		};
		return row;
	} )();
	// v2.9: string art in several thread colours.
	const threadColorsRow = selectRow(
		t( 'Thread colors' ),
		[ 1, 2, 3, 4 ],
		() => params.threadColors || 1,
		( v ) => ( params.threadColors = v )
	);
	// v2.9: Fair Isle - two colours per row, long floats marked.
	const fairLbl = el( 'label', 'dsm-checkrow wpiestp-check', setSec );
	const fairCb = el( 'input', null, fairLbl );
	fairCb.type = 'checkbox';
	fairCb.checked = !! params.fairIsle;
	el( 'span', null, fairLbl ).textContent = t( 'Fair Isle (two colors per row)' );
	fairCb.onchange = () => {
		params.fairIsle = fairCb.checked;
		gridKey = '';
		syncUi();
		paint();
	};
	const floatRow = sliderRowIn(
		setSec,
		t( 'Longest float' ),
		3,
		9,
		() => params.maxFloat || 5,
		( v ) => {
			params.maxFloat = v;
			gridKey = '';
			paint();
		}
	);
	const guideLbl = el( 'label', 'dsm-checkrow wpiestp-check', setSec );
	const guideCb = el( 'input', null, guideLbl );
	guideCb.type = 'checkbox';
	guideCb.checked = !! params.guide;
	el( 'span', null, guideLbl ).textContent = t( 'Guide sheet' );
	guideCb.onchange = () => {
		params.guide = guideCb.checked;
	};
	const factorRow = sliderRowIn(
		setSec,
		t( 'Factor' ),
		2,
		12,
		() => params.factor,
		( v ) => {
			params.factor = v;
			refreshThumbs();
			paint();
		}
	);
	// A row with a select of named choices (string values).
	const choiceRow = ( label, choices, get, set ) => {
		const row = el( 'label', 'wpiestp-row', setSec );
		el( 'span', 'dsm-rowline-label', row ).textContent = label;
		const sel = el( 'select', 'dsm-select', row );
		for ( const [ v, l ] of choices ) {
			const o = el( 'option', null, sel );
			o.value = v;
			o.textContent = l;
		}
		sel.value = String( get() );
		sel.onchange = () => set( sel.value );
		return row;
	};
	// The finished piece next to (or instead of) the counted chart.
	const viewRow = choiceRow(
		t( 'Show' ),
		[
			[ 'chart', t( 'Counted chart' ) ],
			[ 'finished', t( 'Finished piece' ) ],
			[ 'both', t( 'Chart and finished piece' ) ],
		],
		() => params.view,
		( v ) => {
			params.view = v;
			paint();
		}
	);
	// String art as a board you can build: its shape and real size, the
	// thread it takes and a nail template to print.
	const boardShapeRow = choiceRow(
		t( 'Board' ),
		BOARD_SHAPES.map( ( b ) => [ b.id, t( b.label ) ] ),
		() => params.board,
		( v ) => {
			params.board = v;
			refreshThumbs();
			paint();
		}
	);
	const boardCmRow = sliderRowIn(
		setSec,
		t( 'Board size' ),
		20,
		100,
		() => params.boardCm,
		( v ) => {
			params.boardCm = v;
			showThread();
		},
		' cm'
	);
	const paperRow = choiceRow(
		t( 'Paper' ),
		[
			[ 'a4', 'A4' ],
			[ 'letter', 'Letter' ],
		],
		() => params.paper,
		( v ) => ( params.paper = v )
	);
	/* v3.0: the settings of the new crafts */
	const redraw = () => {
		craftKey = '';
		refreshThumbs();
		paint();
	};
	const textRow = ( label, get, set ) => {
		const row = el( 'label', 'wpiestp-text-row', setSec );
		el( 'span', 'dsm-fieldlabel', row ).textContent = label;
		const input = el( 'input', 'dsm-input wpiestp-wide', row );
		input.type = 'text';
		input.maxLength = 24;
		input.value = get();
		input.oninput = () => {
			set( input.value );
			redraw();
		};
		return row;
	};
	const weaveRow = choiceRow(
		t( 'Technique' ),
		WEAVES.map( ( w ) => [ w.id, t( w.label ) ] ),
		() => params.weave,
		( v ) => {
			params.weave = v;
			redraw();
		}
	);
	const filetLbl = el( 'label', 'dsm-checkrow wpiestp-check', setSec );
	const filetCb = el( 'input', null, filetLbl );
	filetCb.type = 'checkbox';
	filetCb.checked = !! params.filetInvert;
	el( 'span', null, filetLbl ).textContent = t( 'Swap filled and open' );
	filetCb.onchange = () => {
		params.filetInvert = filetCb.checked;
		redraw();
	};
	const quiltRow = sliderRowIn( setSec, t( 'Blocks across' ), 6, 30, () => params.quiltBlocks, ( v ) => {
		params.quiltBlocks = v;
		redraw();
	} );
	const blockCmRow = sliderRowIn(
		setSec,
		t( 'Block size' ),
		5,
		20,
		() => params.blockCm,
		( v ) => {
			params.blockCm = v;
			redraw();
		},
		' cm'
	);
	const hitoAcrossRow = textRow( t( 'Word across' ), () => params.hitoAcross, ( v ) => ( params.hitoAcross = v ) );
	const hitoDownRow = textRow( t( 'Word down' ), () => params.hitoDown, ( v ) => ( params.hitoDown = v ) );
	const hitoSizeRow = sliderRowIn( setSec, t( 'Grid size' ), 12, 60, () => params.hitoSize, ( v ) => {
		params.hitoSize = v;
		redraw();
	} );
	const braceletKindRow = choiceRow(
		t( 'Pattern' ),
		[
			[ 'alpha', t( 'Name in knots' ) ],
			[ 'chevron', t( 'Chevron' ) ],
		],
		() => params.braceletKind,
		( v ) => {
			params.braceletKind = v;
			syncUi();
			redraw();
		}
	);
	const braceletNameRow = textRow( t( 'Name' ), () => params.braceletName, ( v ) => ( params.braceletName = v ) );
	const braceletLenRow = sliderRowIn( setSec, t( 'Rows' ), 12, 60, () => params.braceletLength, ( v ) => {
		params.braceletLength = v;
		redraw();
	} );

	const threadNote = el( 'div', 'dsm-note wpiestp-info', setSec );
	const templateBtn = el( 'button', 'ai-btn secondary', setSec );
	templateBtn.type = 'button';
	templateBtn.textContent = t( 'Nail template (PDF)' );
	// v2.9: the winding as a time-lapse film.
	const filmBtn = el( 'button', 'ai-btn secondary wpiestp-film', setSec );
	filmBtn.type = 'button';
	filmBtn.textContent = t( 'Winding as a video' );
	// v2.9: the whole pattern as a printable PDF.
	const pdfBtn = el( 'button', 'ai-btn secondary wpiestp-pdf', setSec );
	pdfBtn.type = 'button';
	pdfBtn.textContent = t( 'Pattern as PDF' );

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
		void sizeTextRow;
		const m = params.mode;
		const stringy = 'stringart' === m || 'mandala' === m;
		const craft = CRAFTS.includes( m );
		// Colour count: the photo crafts that choose their own palette.
		colorsRow.style.display =
			stringy || resolvedFixed() || [ 'filet', 'blackwork', 'hitomezashi', 'bracelet' ].includes( m )
				? 'none'
				: '';
		gridWRow.style.display =
			stringy || [ 'quilt', 'hitomezashi', 'bracelet' ].includes( m ) ? 'none' : '';
		gaugeRow.style.display = 'knitting' === m ? '' : 'none';
		boardRow.style.display = 'beads' === m ? '' : 'none';
		drillRow.style.display = 'diamond' === m ? '' : 'none';
		symLbl.style.display = [ 'crossstitch', 'diamond', 'c2c', 'beadweave' ].includes( m )
			? ''
			: 'none';
		weaveRow.style.display = 'beadweave' === m ? '' : 'none';
		filetLbl.style.display = 'filet' === m ? '' : 'none';
		quiltRow.style.display = 'quilt' === m ? '' : 'none';
		blockCmRow.style.display = 'quilt' === m ? '' : 'none';
		for ( const node of [ hitoAcrossRow, hitoDownRow, hitoSizeRow ] ) {
			node.style.display = 'hitomezashi' === m ? '' : 'none';
		}
		braceletKindRow.style.display = 'bracelet' === m ? '' : 'none';
		braceletNameRow.style.display =
			'bracelet' === m && 'chevron' !== params.braceletKind ? '' : 'none';
		braceletLenRow.style.display =
			'bracelet' === m && 'chevron' === params.braceletKind ? '' : 'none';
		nailsRow.style.display = stringy ? '' : 'none';
		threadsRow.style.display = 'stringart' === m ? '' : 'none';
		thicknessRow.style.display = 'stringart' === m ? '' : 'none';
		guideLbl.style.display = 'stringart' === m ? '' : 'none';
		for ( const node of [
			boardShapeRow,
			boardCmRow,
			threadNote,
			templateBtn,
			threadColorsRow,
			filmBtn,
		] ) {
			node.style.display = 'stringart' === m ? '' : 'none';
		}
		// Paper is for anything printed: the nail template and the pattern.
		paperRow.style.display = 'mandala' === m || craft ? 'none' : '';
		pdfBtn.style.display = stringy || craft ? 'none' : '';
		fairLbl.style.display = 'knitting' === m ? '' : 'none';
		floatRow.style.display = 'knitting' === m && params.fairIsle ? '' : 'none';
		// Thread numbers where a craft is worked in floss, beads or yarn.
		const named = ! [ 'mandala', 'filet', 'quilt', 'hitomezashi' ].includes( m );
		yarnRow.style.display = named ? '' : 'none';
		yarnCredit.style.display = activeYarn() && named ? '' : 'none';
		viewRow.style.display = FINISHED_MODES.includes( m ) || craft ? '' : 'none';
		factorRow.style.display = 'mandala' === m ? '' : 'none';
		srcSec.parentElement.style.display = NO_PHOTO.includes( m ) ? 'none' : '';
	};

	function onGeometryChange() {
		if ( srcBase ) {
			srcCanvas = cropToGrid( srcBase );
			gridKey = '';
		}
		syncInfo();
		refreshThumbs();
		paint();
	}

	/* ------------------------------- footer ------------------------------- */

	const foot = el( 'div', 'dsm-foot', dialog );
	el(
		'div',
		'dsm-hint',
		foot,
		t( 'The pattern is computed locally in your browser.' )
	);
	const actions = el( 'div', 'dsm-actions', foot );
	const cancelBtn = el( 'button', 'ai-btn secondary', actions );
	cancelBtn.textContent = t( 'Cancel' );
	const apply = el( 'button', 'ai-btn primary', actions );
	apply.textContent = editing ? t( 'Update chart' ) : t( 'Insert chart' );
	apply.disabled = true;

	/* ------------------------------- painting ----------------------------- */

	function ensureGrid() {
		if ( ! srcCanvas ) {
			return null;
		}
		const rows = gridRows( srcBase.width / srcBase.height );
		const fixed = resolvedFixed();
		const yarn = activeYarn();
		const fair = 'knitting' === params.mode && params.fairIsle;
		const key = [
			params.gridW,
			rows,
			params.colors,
			fixed ? fixed.map( ( p ) => p.join( ',' ) ).join( '|' ) : 'auto',
			yarn,
			fair ? params.maxFloat : 'off',
		].join( ':' );
		if ( grid && key === gridKey ) {
			return { grid, rows };
		}
		grid = buildGrid( srcCanvas, params.gridW, rows, params.colors, fixed, yarn );
		if ( fair ) {
			grid = fairIsle( grid, params.gridW, rows, params.maxFloat || 5 );
		}
		gridKey = key;
		return { grid, rows };
	}

	// Title composer for the non-grid sheets (string art, mandala).
	function withSheetTitle( sheet ) {
		const tLines = splitLines( params.title, 2 );
		if ( ! tLines.length ) {
			return sheet;
		}
		// The title grows with the sheet, so a board drawn for a large
		// layer keeps its proportions.
		const tPx = Math.round(
			( sheet.width *
				0.036 *
				Math.max( 60, Math.min( 160, params.textScale ) ) ) /
				100
		);
		const tLh = Math.round( tPx * 1.22 );
		const titleH = tLines.length * tLh + Math.round( tPx * 0.45 );
		const c = document.createElement( 'canvas' );
		c.width = sheet.width;
		c.height = sheet.height + titleH;
		const g = c.getContext( '2d' );
		g.fillStyle = '#ffffff';
		g.fillRect( 0, 0, c.width, c.height );
		g.fillStyle = accentHex() || '#26292e';
		g.font = `700 ${ tPx }px ${
			params.font ? `"${ params.font }", sans-serif` : 'sans-serif'
		}`;
		g.textAlign = 'center';
		g.textBaseline = 'middle';
		tLines.forEach( ( ln, i ) =>
			g.fillText(
				ln,
				c.width / 2,
				Math.round( tPx * 0.22 ) + tLh / 2 + i * tLh
			)
		);
		g.drawImage( sheet, 0, titleH );
		return c;
	}

	/* ---------------------- the crafts of v3.0 (crafts.js) ----------------- */

	let craftCache = null;
	let craftKey = '';
	const craftWords = () => ( {
		filled: t( 'filled' ),
		open: t( 'open' ),
		stitches: t( 'stitches' ),
		knots: t( 'knots' ),
		squares: t( 'squares' ),
		halves: t( 'triangle squares' ),
		beads: t( 'beads' ),
	} );
	const toHex = ( p ) => hexOf( p.map( ( v ) => Math.round( v ) ) );
	/** "DMC 310 Black" for a colour, when the craft names its threads. */
	function threadName( rgb, yarn ) {
		const y = yarn ? nearestYarn( rgb, yarn ) : null;
		const short = yarn ? ( YARN_SETS.find( ( s ) => s.id === yarn ) || {} ).short : '';
		return y ? yarnLabel( { brand: short, code: y.code, name: y.name } ) : toHex( rgb );
	}
	/**
	 * One craft, drawn: { chart, finished, legend, facts }. Cached per
	 * source and setting, so retyping the title does not redraw a quilt.
	 */
	function craftResult( mode, src, cell, thumb = false ) {
		const fixed = resolvedFixed();
		const yarn = yarnFor( mode, params.yarn );
		const key = JSON.stringify( [
			mode,
			srcVersion,
			cell,
			fixed,
			yarn,
			params.weave,
			params.gridW,
			params.colors,
			params.symbols,
			params.filetInvert,
			params.quiltBlocks,
			params.blockCm,
			params.hitoAcross,
			params.hitoDown,
			params.hitoSize,
			params.braceletKind,
			params.braceletName,
			params.braceletLength,
		] );
		if ( ! thumb && craftCache && key === craftKey ) {
			return craftCache;
		}
		const words = craftWords();
		const like = document.createElement( 'canvas' );
		let res = null;
		if ( 'beadweave' === mode && src ) {
			res = beadWeave( src, {
				weave: params.weave,
				cols: thumb ? 22 : params.gridW,
				colors: params.colors,
				fixed,
				yarn,
				cell,
				symbols: params.symbols && ! thumb,
				words,
			} );
		} else if ( 'filet' === mode && src ) {
			const thread = accentHex();
			res = filetCrochet( src, {
				cols: thumb ? 28 : params.gridW,
				cell,
				invert: params.filetInvert,
				thread: thread || undefined,
				words,
			} );
		} else if ( 'blackwork' === mode && src ) {
			const thread = accentHex() || '#1d1f24';
			res = blackwork( src, {
				cols: thumb ? 30 : params.gridW,
				cell,
				thread,
				label: threadName( hexToRgb( thread ), yarn ),
				words,
			} );
			res.thread = thread;
		} else if ( 'quilt' === mode && src ) {
			res = quilt( src, {
				blocks: thumb ? 10 : params.quiltBlocks,
				fabrics: params.colors,
				fixed,
				cell: cell * 3,
				blockCm: params.blockCm,
				seed: 7,
				words,
			} );
		} else if ( 'hitomezashi' === mode ) {
			// Pinned colours: the thread, then the fabric (two shades).
			const pins = fixed ? fixed.map( toHex ) : [];
			const thread = pins[ 0 ] || '#f4efe4';
			const fabric = pins.length >= 3 ? [ pins[ 1 ], pins[ 2 ] ] : pins.length === 2 ? [ pins[ 1 ], pins[ 1 ] ] : null;
			const size = thumb ? 16 : params.hitoSize;
			res = hitomezashi( like, {
				across: params.hitoAcross,
				down: params.hitoDown,
				cols: size,
				rows: size,
				cell: Math.round( cell * 1.2 ),
				thread,
				fabric: fabric || undefined,
				words,
			} );
		} else if ( 'bracelet' === mode ) {
			let colors = fixed && fixed.length >= 2 ? fixed.slice( 0, 5 ) : null;
			if ( colors && yarn ) {
				colors = colors.map( ( c ) => nearestYarn( c, yarn ).rgb );
			}
			const base = colors || [
				[ 232, 80, 91 ],
				[ 249, 213, 110 ],
				[ 20, 177, 171 ],
				[ 243, 236, 226 ],
			];
			const named = yarn ? base.map( ( c ) => nearestYarn( c, yarn ).rgb ) : base;
			res = bracelet( like, {
				kind: params.braceletKind,
				name: params.braceletName,
				colors: named,
				labels: named.map( ( c ) => threadName( c, yarn ) ),
				cell: Math.round( cell * 1.4 ),
				length: thumb ? 14 : params.braceletLength,
				words,
			} );
		}
		if ( ! thumb ) {
			craftCache = res;
			craftKey = key;
		}
		return res;
	}

	/** The facts line under a craft sheet: how big, how many. */
	function craftFacts( mode, res ) {
		const f = res.facts || {};
		const cm = ( mm ) => ( mm / 10 ).toFixed( 0 );
		if ( 'beadweave' === mode ) {
			return t( '%1 × %2 beads · about %3 × %4 cm with Delica 11/0' )
				.replace( '%1', f.cols )
				.replace( '%2', f.rows )
				.replace( '%3', cm( f.widthMm ) )
				.replace( '%4', cm( f.heightMm ) );
		}
		if ( 'quilt' === mode ) {
			return t( '%1 × %2 blocks of %3 cm · quilt %4 × %5 cm · cut squares at %6 cm, triangle squares at %7 cm' )
				.replace( '%1', f.blocks[ 0 ] )
				.replace( '%2', f.blocks[ 1 ] )
				.replace( '%3', f.blockCm )
				.replace( '%4', f.widthCm )
				.replace( '%5', f.heightCm )
				.replace( '%6', f.cutSquare.toFixed( 2 ).replace( /\.?0+$/, '' ) )
				.replace( '%7', f.cutHalf.toFixed( 1 ).replace( /\.0$/, '' ) );
		}
		if ( 'bracelet' === mode ) {
			return t( '%1 strings · %2 knots · about %3 cm long' )
				.replace( '%1', f.strings )
				.replace( '%2', f.knots )
				.replace( '%3', f.lengthCm );
		}
		if ( f.cols && f.rows ) {
			return `${ f.cols } × ${ f.rows }${ f.stitches ? ` · ${ f.stitches } ${ t( 'stitches' ) }` : '' }`;
		}
		return '';
	}

	/** Title, chart and/or finished piece, legend and facts on one sheet. */
	function craftSheet( mode, res, cell ) {
		const view = params.view;
		const parts =
			'chart' === view ? [ res.chart ] : 'finished' === view ? [ res.finished ] : [ res.chart, res.finished ];
		const partsW = parts.reduce( ( a, p ) => a + p.width, 0 ) + MARGIN * ( parts.length - 1 );
		const partsH = Math.max( ...parts.map( ( p ) => p.height ) );
		const W = Math.max( partsW, 560 ) + MARGIN * 2;
		const tLines = splitLines( params.title, 2 );
		const tPx = Math.round( ( cell * 2.6 * Math.max( 60, Math.min( 160, params.textScale ) ) ) / 100 );
		const tLh = Math.round( tPx * 1.22 );
		const titleH = tLines.length ? tLines.length * tLh + 18 : 0;
		const items = 'finished' === view ? [] : res.legend || [];
		const perRow = Math.max( 1, Math.floor( ( W - MARGIN * 2 ) / 240 ) );
		const legendH = items.length ? Math.ceil( items.length / perRow ) * 34 + 16 : 0;
		const key =
			'blackwork' === mode && 'finished' !== view
				? blackworkKey( document.createElement( 'canvas' ), Math.round( cell * 1.3 ), res.thread )
				: null;
		const keyH = key ? key.height + 12 : 0;
		const facts = craftFacts( mode, res );
		const factsH = facts ? 30 : 0;
		const c = document.createElement( 'canvas' );
		c.width = W;
		c.height = MARGIN * 2 + titleH + partsH + ( legendH ? 14 + legendH : 0 ) + keyH + factsH;
		const g = c.getContext( '2d' );
		g.fillStyle = '#ffffff';
		g.fillRect( 0, 0, c.width, c.height );
		if ( tLines.length ) {
			g.fillStyle = accentHex() || '#26292e';
			g.font = `700 ${ tPx }px ${ params.font ? `"${ params.font }", sans-serif` : 'sans-serif' }`;
			g.textAlign = 'center';
			g.textBaseline = 'middle';
			tLines.forEach( ( ln, i ) => g.fillText( ln, c.width / 2, MARGIN - 8 + tLh / 2 + i * tLh ) );
		}
		let x = ( W - partsW ) / 2;
		const y = MARGIN + titleH;
		for ( const p of parts ) {
			g.drawImage( p, x, y + ( partsH - p.height ) / 2 );
			x += p.width + MARGIN;
		}
		let ly = y + partsH + 14;
		if ( items.length ) {
			const colW = ( W - MARGIN * 2 ) / perRow;
			items.forEach( ( it, i ) => {
				const lx = MARGIN + ( i % perRow ) * colW;
				const yy = ly + 8 + Math.floor( i / perRow ) * 34;
				g.fillStyle = hexOf( it.rgb.map( ( v ) => Math.round( v ) ) );
				g.fillRect( lx, yy, 22, 22 );
				g.strokeStyle = 'rgba(0,0,0,0.35)';
				g.lineWidth = 1;
				g.strokeRect( lx + 0.5, yy + 0.5, 21, 21 );
				if ( it.symbol ) {
					g.fillStyle = 0.299 * it.rgb[ 0 ] + 0.587 * it.rgb[ 1 ] + 0.114 * it.rgb[ 2 ] > 150 ? '#31353b' : '#ffffff';
					g.font = '600 12px sans-serif';
					g.textAlign = 'center';
					g.textBaseline = 'middle';
					g.fillText( it.symbol, lx + 11, yy + 12 );
				}
				g.fillStyle = '#31353b';
				g.font = '600 11px sans-serif';
				g.textAlign = 'left';
				g.textBaseline = 'top';
				g.fillText( fitText( g, it.label, colW - 40 ), lx + 30, yy + 1 );
				g.fillStyle = '#6a7078';
				g.font = '500 10px sans-serif';
				g.fillText( fitText( g, it.usage || '', colW - 40 ), lx + 30, yy + 13 );
			} );
			ly += legendH;
		}
		if ( key ) {
			g.drawImage( key, MARGIN, ly + 4 );
			ly += keyH;
		}
		if ( facts ) {
			g.fillStyle = '#4a4f57';
			g.font = '500 13px sans-serif';
			g.textAlign = 'left';
			g.textBaseline = 'middle';
			g.fillText( fitText( g, facts, W - MARGIN * 2 ), MARGIN, ly + 15 );
		}
		return c;
	}

	// The board is wound once per source and setting; preview and insert
	// draw the very same winding, only at different sizes.
	let plan = null;
	let planKey = '';
	function ensurePlan() {
		const src = srcBase || srcCanvas;
		if ( ! src ) {
			return null;
		}
		const colors = threadColorsFor( src );
		const key = [
			srcVersion,
			params.nails,
			params.threads,
			params.thickness,
			params.board,
			colors ? colors.map( ( c ) => c.join( ',' ) ).join( '|' ) : 'one',
		].join( ':' );
		if ( ! plan || key !== planKey ) {
			plan = planStringArt( src, {
				nails: params.nails,
				threads: params.threads,
				thickness: params.thickness,
				board: params.board,
				colors,
			} );
			planKey = key;
		}
		showThread();
		return plan;
	}
	// v2.9: the thread colours of a coloured board - pinned colours first,
	// otherwise the picture's own; named in the yarn range, if one is on.
	function threadColorsFor( src ) {
		const k = params.threadColors || 1;
		if ( k < 2 ) {
			return null;
		}
		const pinned = resolvedFixed();
		let colors =
			pinned && pinned.length >= 2 ? pinned.slice( 0, k ) : pickThreadColors( src, k );
		const yarn = activeYarn();
		if ( yarn ) {
			colors = colors.map( ( c ) => nearestYarn( c, yarn ).rgb );
		}
		return colors;
	}
	function threadLabels() {
		const yarn = activeYarn();
		const short = yarn ? YARN_SETS.find( ( y ) => y.id === yarn ).short : '';
		return ( plan ? plan.layers : [] ).map( ( l ) => {
			if ( ! l.color ) {
				return '';
			}
			const y = yarn ? nearestYarn( l.color, yarn ) : null;
			return y ? yarnLabel( { brand: short, code: y.code, name: y.name } ) : hexOf( l.color );
		} );
	}
	const boardLabel = () =>
		t(
			(
				BOARD_SHAPES.find( ( b ) => b.id === params.board ) ||
				BOARD_SHAPES[ 0 ]
			).label
		);
	function threadFacts() {
		if ( ! plan ) {
			return '';
		}
		const metres = Math.round( threadMetres( plan, params.boardCm ) );
		const names = threadLabels();
		const colours =
			plan.layers.length > 1
				? ` · ${ plan.layers
						.map(
							( l, i ) =>
								`${ names[ i ] } ≈ ${ Math.round(
									threadMetres( plan, params.boardCm, l )
								) } m`
						)
						.join( ', ' ) }`
				: '';
		return `${ boardLabel() } · ${ params.boardCm } cm · ${ t(
			'Thread'
		) } ≈ ${ metres } m · ${ threadCount( plan ) } ${ t( 'Threads' ) }${ colours }`;
	}
	function showThread() {
		threadNote.textContent = threadFacts();
	}

	function bake( cell, artSize = 900 ) {
		if ( 'mandala' === params.mode ) {
			return withSheetTitle(
				buildStringMandala( document.createElement( 'canvas' ), {
					nails: params.nails,
					factor: params.factor,
					color: accentHex() || '#26292e',
				} )
			);
		}
		if ( 'stringart' === params.mode ) {
			const wound = ensurePlan();
			if ( ! wound ) {
				return null;
			}
			return withSheetTitle(
				drawStringArt( document.createElement( 'canvas' ), wound, {
					size: artSize,
					color: accentHex() || '#26292e',
				} )
			);
		}
		if ( CRAFTS.includes( params.mode ) ) {
			const src = srcCanvas;
			if ( ! src && ! NO_PHOTO.includes( params.mode ) ) {
				return null;
			}
			const res = craftResult( params.mode, src, cell );
			return res ? craftSheet( params.mode, res, cell ) : null;
		}
		const built = ensureGrid();
		if ( ! built ) {
			return null;
		}
		const { rows } = built;
		const cols = params.gridW;
		const view = FINISHED_MODES.includes( params.mode )
			? params.view
			: 'chart';
		// The finished piece alone is a picture, not a working sheet: it
		// gets bigger stitches.
		const unit = 'finished' === view ? Math.round( cell * 1.5 ) : cell;
		const cellH =
			'knitting' === params.mode
				? Math.round( ( unit * params.gauge ) / 100 )
				: unit;
		const chartW = cols * unit;
		const chartH = rows * cellH;
		// Sheet title in the accent color and chosen font.
		const tLines = splitLines( params.title, 2 );
		const tPx = Math.round(
			( unit * 2.6 * Math.max( 60, Math.min( 160, params.textScale ) ) ) /
				100
		);
		const tLh = Math.round( tPx * 1.22 );
		const titleH = tLines.length ? tLines.length * tLh + 18 : 0;
		const legendRows =
			'finished' === view
				? 0
				: Math.ceil(
						built.grid.palette.length /
							Math.max( 2, Math.floor( chartW / 190 ) )
				  );
		const floatNote =
			'finished' !== view && built.grid.floats && built.grid.floats.length
				? t( 'Red bars: floats longer than %d stitches - catch them.' ).replace(
						'%d',
						String( params.maxFloat || 5 )
				  )
				: '';
		const legendH = legendRows ? legendRows * 34 + 16 + ( floatNote ? 26 : 0 ) : 0;
		const c = document.createElement( 'canvas' );
		c.width =
			'both' === view ? chartW * 2 + MARGIN * 3 : chartW + MARGIN * 2;
		c.height =
			chartH + MARGIN * 2 + titleH + legendH + ( legendH ? 14 : 0 );
		const g = c.getContext( '2d' );
		g.fillStyle = '#ffffff';
		g.fillRect( 0, 0, c.width, c.height );
		if ( tLines.length ) {
			const fixed = resolvedFixed();
			g.fillStyle = fixed
				? `rgb(${ fixed[ 0 ].join( ',' ) })`
				: '#26292e';
			g.font = `700 ${ tPx }px ${
				params.font ? `"${ params.font }", sans-serif` : 'sans-serif'
			}`;
			g.textAlign = 'center';
			g.textBaseline = 'middle';
			tLines.forEach( ( ln, i ) =>
				g.fillText( ln, c.width / 2, MARGIN - 8 + tLh / 2 + i * tLh )
			);
		}
		const finished = ( x ) =>
			renderFinished( g, built.grid, cols, rows, {
				mode: params.mode,
				cell: unit,
				cellH,
				drill: params.drill,
				x,
				y: MARGIN + titleH,
			} );
		if ( 'finished' === view ) {
			finished( MARGIN );
			return c;
		}
		renderChart( g, built.grid, cols, rows, {
			mode: params.mode,
			cell: unit,
			cellH,
			symbols: params.symbols,
			boardSize: 'beads' === params.mode ? params.boardSize : 0,
			drill: params.drill,
			x: MARGIN,
			y: MARGIN + titleH,
		} );
		if ( 'both' === view ) {
			finished( MARGIN * 2 + chartW );
		}
		const legendDrawn = renderLegend( g, built.grid, {
			mode: params.mode,
			x: MARGIN,
			y: MARGIN + titleH + chartH + 14,
			width: chartW,
			symbols: params.symbols,
		} );
		if ( floatNote ) {
			const ny = MARGIN + titleH + chartH + 14 + legendDrawn + 4;
			g.fillStyle = '#e5484d';
			g.fillRect( MARGIN + 12, ny + 6, 22, 5 );
			g.fillStyle = '#31353b';
			g.font = '500 12px sans-serif';
			g.textAlign = 'left';
			g.textBaseline = 'middle';
			g.fillText( floatNote, MARGIN + 42, ny + 9 );
		}
		return c;
	}

	let raf = 0;
	let bakeToken = 0;
	function drawBaked( baked ) {
		const maxW = Math.max( 200, view.clientWidth - 36 );
		const maxH = Math.max( 200, view.clientHeight - 36 );
		const sc = Math.min( maxW / baked.width, maxH / baked.height, 1 );
		canvas.width = Math.round( baked.width * sc );
		canvas.height = Math.round( baked.height * sc );
		const g = canvas.getContext( '2d' );
		g.imageSmoothingEnabled = sc < 0.999;
		g.drawImage( baked, 0, 0, canvas.width, canvas.height );
	}
	function paintNow() {
		syncUi();
		if ( ! srcCanvas && ! NO_PHOTO.includes( params.mode ) ) {
			canvas.width = 10;
			canvas.height = 10;
			return;
		}
		if ( 'stringart' === params.mode ) {
			// Weaving takes seconds - show the status, then compute off
			// the current frame so it actually renders first.
			const tk = ++bakeToken;
			setStatus( t( 'Rendering the chart' ) );
			window.setTimeout( () => {
				if ( tk !== bakeToken ) {
					return;
				}
				const baked = bake( 12 );
				if ( tk !== bakeToken ) {
					return;
				}
				apply.disabled = ! baked;
				if ( baked ) {
					drawBaked( baked );
				}
				setStatus( '' );
			}, 40 );
			return;
		}
		const baked = bake( 12 );
		apply.disabled = ! baked;
		if ( ! baked ) {
			return;
		}
		const maxW = Math.max( 200, view.clientWidth - 36 );
		const maxH = Math.max( 200, view.clientHeight - 36 );
		const s = Math.min( maxW / baked.width, maxH / baked.height, 1 );
		canvas.width = Math.round( baked.width * s );
		canvas.height = Math.round( baked.height * s );
		const g = canvas.getContext( '2d' );
		g.imageSmoothingEnabled = s < 0.999;
		g.drawImage( baked, 0, 0, canvas.width, canvas.height );
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
	// Ctrl+Z / Ctrl+Shift+Z (shared/studio-undo.js), no button: craft,
	// palette, colours, size and sheet; a changed picture is loaded again.
	const history = studioUndo( {
		backdrop,
		read: () => params,
		write: ( data ) => {
			const source = () => JSON.stringify( [ params.source, params.image ] );
			const before = source();
			Object.assign( params, data );
			customCtls.forEach( ( ctl, i ) =>
				ctl?.set?.( params.customColors[ i ] || '#cccccc' )
			);
			gridKey = '';
			syncUi();
			if ( source() !== before ) {
				loadSource();
			} else {
				onGeometryChange();
			}
		},
	} );

	/* -------------------------------- insert ------------------------------ */

	apply.onclick = async () => {
		if ( ! srcCanvas && ! NO_PHOTO.includes( params.mode ) ) {
			return;
		}
		apply.disabled = true;
		setStatus( t( 'Rendering the chart' ) );
		try {
			const doc = editor.state.doc;
			// A board is drawn at the size its layer will have in the
			// document (a reopened one at its current size), so it is sharp
			// there - never smaller than a crisp default, never past 4096.
			const want =
				editing && layer
					? Math.max( layer.w || 0, layer.h || 0 )
					: Math.min( doc.w, doc.h ) * 0.92;
			const baked = bake(
				BAKE_CELL,
				Math.max( 1200, Math.min( 4096, Math.round( want ) ) )
			);
			const url = baked.toDataURL( 'image/png' );
			const fit = Math.min(
				( doc.w * 0.92 ) / baked.width,
				( doc.h * 0.92 ) / baked.height
			);
			const w = Math.round( baked.width * fit );
			const h = Math.round( baked.height * fit );
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
				editor.commit( t( 'Update chart' ) );
				setStatus( t( 'Chart updated.' ) );
			} else {
				const imgLayer = bridge.documents.makeImage( {
					name: `${ t( 'Chart' ) } ${ t(
						MODES.find( ( m ) => m.id === params.mode ).label
					) }`,
					x: Math.round( ( doc.w - w ) / 2 ),
					y: Math.round( ( doc.h - h ) / 2 ),
					w,
					h,
					src: url,
					naturalW: baked.width,
					naturalH: baked.height,
				} );
				imgLayer.generator = { id: GEN_ID, params: stored };
				editor.dispatch( { type: 'ADD_LAYER', layer: imgLayer } );
				// String art: the winding guide as a second layer.
				if ( 'stringart' === params.mode && params.guide && plan ) {
					const guideC = renderStringGuide(
						document.createElement( 'canvas' ),
						plan,
						{
							title:
								splitLines( params.title, 1 )[ 0 ] ||
								'String Art',
							facts: threadFacts(),
							labels: threadLabels(),
						}
					);
					const gfit = Math.min(
						( doc.w * 0.86 ) / guideC.width,
						( doc.h * 0.86 ) / guideC.height
					);
					const guideLayer = bridge.documents.makeImage( {
						name: t( 'Guide sheet' ),
						x:
							Math.round( ( doc.w - guideC.width * gfit ) / 2 ) +
							40,
						y:
							Math.round( ( doc.h - guideC.height * gfit ) / 2 ) +
							40,
						w: Math.round( guideC.width * gfit ),
						h: Math.round( guideC.height * gfit ),
						src: guideC.toDataURL( 'image/png' ),
						naturalW: guideC.width,
						naturalH: guideC.height,
					} );
					editor.dispatch( { type: 'ADD_LAYER', layer: guideLayer } );
				}
				editor.dispatch( { type: 'SET_ACTIVE', id: imgLayer.id } );
				editor.commit( t( 'Insert chart' ) );
				setStatus( t( 'Inserted.' ) );
			}
			close();
		} catch ( e ) {
			setStatus(
				e && e.message ? e.message : t( 'Could not insert the chart.' ),
				true
			);
			apply.disabled = false;
		}
	};

	/* ---------------------------- nail template --------------------------- */

	const download = ( blob, name ) => {
		if ( bridge.util && bridge.util.downloadBlob ) {
			bridge.util.downloadBlob( blob, name );
			return;
		}
		const a = document.createElement( 'a' );
		a.href = URL.createObjectURL( blob );
		a.download = name;
		document.body.appendChild( a );
		a.click();
		a.remove();
		window.setTimeout( () => URL.revokeObjectURL( a.href ), 4000 );
	};
	templateBtn.onclick = async () => {
		templateBtn.disabled = true;
		setStatus( t( 'Rendering the chart' ) );
		try {
			const pages = nailTemplatePages(
				document.createElement( 'canvas' ),
				{
					shape: params.board,
					nails: params.nails,
					boardCm: params.boardCm,
					insetCm: NAIL_INSET_CM,
					paper: params.paper,
					labels: {
						title: `${
							splitLines( params.title, 1 )[ 0 ] ||
							t( 'String art' )
						} · ${ boardLabel() } · ${ params.boardCm } cm · ${
							params.nails
						} ${ t( 'Nails' ) }`,
						start: t( 'start' ),
						scale: t( '5 cm - print at 100 %' ),
						page: t( 'Page' ),
					},
				}
			);
			download(
				await pagesToPdf( pages ),
				`nail-template-${ params.board }-${ params.boardCm }cm.pdf`
			);
			setStatus( t( 'Nail template downloaded. Print it at 100 %.' ) );
		} catch ( e ) {
			setStatus( t( 'The nail template could not be created.' ), true );
		}
		templateBtn.disabled = false;
	};

	/* ---------------------------- pattern PDF (v2.9) ---------------------- */

	// What a stitcher needs to know before buying: how big it will be.
	function sizeFact( cols, rows ) {
		const cm = ( n, mm ) => ( ( n * mm ) / 10 ).toFixed( 0 );
		const m = params.mode;
		if ( 'crossstitch' === m ) {
			// 14-count Aida: 14 stitches to the inch.
			return t( 'On 14-count Aida: %s × %s cm' )
				.replace( '%s', cm( cols, 25.4 / 14 ) )
				.replace( '%s', cm( rows, 25.4 / 14 ) );
		}
		if ( 'diamond' === m ) {
			return t( 'With 2.5 mm drills: %s × %s cm' )
				.replace( '%s', cm( cols, 2.5 ) )
				.replace( '%s', cm( rows, 2.5 ) );
		}
		if ( 'beads' === m ) {
			return t( 'With 5 mm beads: %s × %s cm' )
				.replace( '%s', cm( cols, 5 ) )
				.replace( '%s', cm( rows, 5 ) );
		}
		return '';
	}

	pdfBtn.onclick = async () => {
		const built = ensureGrid();
		if ( ! built ) {
			return;
		}
		pdfBtn.disabled = true;
		setStatus( t( 'Rendering the chart' ) );
		try {
			const cols = params.gridW;
			const { rows } = built;
			// The finished piece on the cover, where the craft has one.
			let finished = null;
			if ( FINISHED_MODES.includes( params.mode ) ) {
				const unit = 10;
				const cellH =
					'knitting' === params.mode ? Math.round( ( unit * params.gauge ) / 100 ) : unit;
				finished = document.createElement( 'canvas' );
				finished.width = cols * unit;
				finished.height = rows * cellH;
				renderFinished( finished.getContext( '2d' ), built.grid, cols, rows, {
					mode: params.mode,
					cell: unit,
					cellH,
					drill: params.drill,
					x: 0,
					y: 0,
				} );
			}
			const mode = MODES.find( ( m ) => m.id === params.mode );
			const pages = patternPages( document.createElement( 'canvas' ), built.grid, cols, rows, {
				mode: params.mode,
				gauge: params.gauge,
				symbols: params.symbols,
				drill: params.drill,
				boardSize: 'beads' === params.mode ? params.boardSize : 0,
				paper: params.paper || 'a4',
				title: splitLines( params.title, 1 )[ 0 ] || t( mode.label ),
				finished,
				facts: [
					`${ t( mode.label ) } · ${ cols } × ${ rows } · ${ built.grid.palette.length } ${ t( 'Colors' ) }`,
					sizeFact( cols, rows ),
				].filter( Boolean ),
				labels: {
					page: t( 'Page' ),
					of: t( 'of' ),
					columns: t( 'Columns' ),
					rows: t( 'Rows' ),
					colors: t( 'Colors' ),
					stitches: '',
					overview: t( 'Which page holds which part' ),
					floats:
						built.grid.floats && built.grid.floats.length
							? t( 'Red bars: floats longer than %d stitches - catch them.' ).replace(
									'%d',
									String( params.maxFloat || 5 )
							  )
							: '',
				},
			} );
			download( await pagesToPdf( pages ), `pattern-${ params.mode }.pdf` );
			setStatus( t( 'Pattern downloaded. Print it at 100 %.' ) );
		} catch ( e ) {
			setStatus( t( 'The pattern could not be created.' ), true );
		}
		pdfBtn.disabled = false;
	};

	/* --------------------------- winding film (v2.9) ----------------------- */

	// The board wound thread by thread - slowly at first, then faster, and
	// the finished piece held for a moment at the end. Made frame by frame:
	// an MP4 where the browser encodes H.264, a GIF otherwise.
	filmBtn.onclick = async () => {
		const wound = ensurePlan();
		if ( ! wound ) {
			return;
		}
		filmBtn.disabled = true;
		apply.disabled = true;
		try {
			const mp4 = mp4Available();
			const size = mp4 ? 1080 : 540;
			const fps = mp4 ? 30 : 15;
			const total = threadCount( wound );
			const winding = 12;
			const hold = 1.5;
			const color = accentHex() || '#26292e';
			const frames = async ( { onFrame } ) => {
				const n = Math.round( ( winding + hold ) * fps );
				const c = document.createElement( 'canvas' );
				c.width = size;
				c.height = size;
				for ( let i = 0; i < n; i++ ) {
					const u = Math.min( 1, i / ( winding * fps ) );
					// Ease in: the first threads are worth watching.
					const limit = Math.round( total * u * u * ( 3 - 2 * u ) * 0.5 + total * u * 0.5 );
					drawStringArt( c, wound, { size, color, limit, canvas: c } );
					await onFrame( c, i );
					if ( 0 === i % 10 ) {
						setStatus( `${ t( 'Rendering the video' ) } ${ Math.round( ( i / n ) * 100 ) }%` );
						await new Promise( ( r ) => window.setTimeout( r, 0 ) );
					}
				}
			};
			let out;
			try {
				out = mp4
					? await encodeMp4( { frames, width: size, height: size, fps } )
					: await encodeGif( { frames, width: size, height: size, fps } );
			} catch ( e ) {
				out = await encodeGif( { frames, width: 540, height: 540, fps: 15 } );
			}
			download( out.blob, `string-art-winding.${ out.ext }` );
			lastFilm = { ext: out.ext, bytes: out.blob.size };
			setStatus( t( 'Video downloaded.' ) );
		} catch ( e ) {
			setStatus( t( 'The video could not be made.' ), true );
		}
		filmBtn.disabled = false;
		apply.disabled = false;
	};
	let lastFilm = null;
	if ( window.__wpieQA ) {
		window.__stitchStudio = {
			params: () => JSON.parse( JSON.stringify( params ) ),
			lastFilm: () => lastFilm,
			plan: () => plan && { layers: plan.layers.length, threads: threadCount( plan ) },
			grid: () => grid && { colors: grid.palette.length, codes: grid.codes, floats: ( grid.floats || [] ).length },
		};
	}

	/* --------------------------------- boot ------------------------------- */

	void extras;
	requestAnimationFrame( () => {
		syncUi();
		paintCardThumbs();
		loadSource();
		if ( params.font && bridge.fonts && bridge.fonts.ensureFont ) {
			bridge.fonts
				.ensureFont( params.font, 700 )
				.then( paint )
				.catch( () => {} );
		}
	} );
}

/* -------------------------------- register ------------------------------- */

function register( api ) {
	api.registerGenerator( {
		id: GEN_ID,
		label: 'Stitch Patterns',
		run: ( ctx ) => openStudio( ctx ),
		edit: ( ctx ) => openStudio( ctx ),
	} );
}

if ( window.WPIE && window.WPIE.api ) {
	register( window.WPIE.api );
} else {
	window.wp.hooks.addAction( 'wpie.ready', 'wpie-stitch-patterns', register );
}
