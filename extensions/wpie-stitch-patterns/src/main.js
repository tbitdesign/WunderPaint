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
	buildStringArt,
	renderStringGuide,
	buildStringMandala,
} from './stitch-engine.js';

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
	threads: 1500,
	thickness: 'normal',
	guide: true,
	factor: 2,
	paletteId: '', // '' = auto colors from the image
	useBrand: false,
	brandKitId: '',
	customColors: [],
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

	let srcBase = null; // full source canvas (doc, layer or media)
	let srcCanvas = null; // cropped to grid aspect
	let srcToken = 0;
	let grid = null;
	let gridKey = '';

	const host = document.getElementById( 'wpie-root' ) || document.body;
	const backdrop = el( 'div', 'modal-backdrop', host );
	const dialog = el( 'div', 'dsm wpiestp-dialog', backdrop );
	dialog.onclick = ( e ) => e.stopPropagation();
	const head = el( 'div', 'dsm-head', dialog );
	const badge = el( 'span', 'dsm-badge', head );
	badge.innerHTML = ICON_BRAND;
	const titles = el( 'div', 'dsm-titles', head );
	el( 'span', 'dsm-title', titles, 'Stitch Patterns' );
	el(
		'div',
		'dsm-sub',
		titles,
		t( 'Eight craft sheets - as editable layers.' )
	);
	const closeBtn = el( 'button', 'dsm-x', head );
	closeBtn.innerHTML = '&times;';
	closeBtn.setAttribute( 'aria-label', t( 'Close' ) );

	const body = el( 'div', 'wpiestp-body', dialog );
	const view = el( 'div', 'wpiestp-view', body );
	const canvas = el( 'canvas', null, view );
	const side = el( 'div', 'wpiestp-side', body );
	const status = el( 'div', 'wpiestp-status', view );
	const setStatus = ( msg, isErr ) => {
		status.textContent = msg || '';
		status.classList.toggle( 'on', !! msg );
		status.classList.toggle( 'err', !! isErr );
	};

	const section = ( parent, icon, label ) => {
		const card = el( 'div', 'wpiestp-card', parent );
		const h = el( 'div', 'wpiestp-card-head', card );
		h.innerHTML = icon + '<span>' + label + '</span>';
		return el( 'div', 'wpiestp-card-body', card );
	};

	/* ----------------------------- craft cards ---------------------------- */

	const modeSec = section( side, ICONS.craft, t( 'Craft' ) );
	const modeGrid = el( 'div', 'wpiestp-cards', modeSec );
	const modeTiles = new Map();
	for ( const m of MODES ) {
		const card = el( 'button', 'wpiestp-tcard', modeGrid );
		card.type = 'button';
		card.title = t( m.label );
		const thumb = el( 'canvas', 'wpiestp-tthumb', card );
		thumb.width = 132;
		thumb.height = 92;
		el( 'span', 'wpiestp-tlabel', card, t( m.label ) );
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
					c = buildStringArt( src, {
						size: 240,
						nails: 144,
						budget: 320,
						color: accentHex() || '#26292e',
					} ).canvas;
				} else if ( 'mandala' === m.id ) {
					c = buildStringMandala(
						document.createElement( 'canvas' ),
						{
							nails: 100,
							factor: params.factor,
							color: accentHex() || '#26292e',
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

	const srcSec = section( side, ICONS.source, t( 'Source' ) );
	const srcSel = el( 'select', 'dsm-select wpiestp-wide', srcSec );
	const srcNote = el( 'div', 'wpiestp-info', srcSec );

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
			c = flattenWhite( c );
			if ( token === srcToken ) {
				srcBase = c;
				srcCanvas = c ? cropToGrid( c ) : null;
				gridKey = '';
				apply.disabled = ! srcCanvas && 'mandala' !== params.mode;
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
		const b = el( 'button', 'wpiestp-pal', palWrap );
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
		const brandLbl = el( 'label', 'wpiestp-check', colSec );
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
	el( 'span', null, customRow ).textContent = t( 'Custom colors' );
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
	const resetBtn = el( 'button', 'wpiestp-reset', customRow );
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
	el( 'span', null, titleRow ).textContent = t( 'Title' );
	const titleArea = el( 'textarea', 'wpiestp-names', titleRow );
	titleArea.rows = 2;
	titleArea.value = params.title;
	titleArea.oninput = () => {
		params.title = titleArea.value;
		paint();
	};

	const fontRow = el( 'div', 'wpiestp-text-row', setSec );
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
	el( 'span', null, boardRow ).textContent = t( 'Pegboard size' );
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
	el( 'span', null, drillRow ).textContent = t( 'Drill shape' );
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
	const symLbl = el( 'label', 'wpiestp-check', setSec );
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
		el( 'span', null, row ).textContent = label;
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
		el( 'span', null, row ).textContent = t( 'Thread weight' );
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
	const guideLbl = el( 'label', 'wpiestp-check', setSec );
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
		void sizeTextRow;
		const m = params.mode;
		const stringy = 'stringart' === m || 'mandala' === m;
		colorsRow.style.display = stringy || resolvedFixed() ? 'none' : '';
		gridWRow.style.display = stringy ? 'none' : '';
		gaugeRow.style.display = 'knitting' === m ? '' : 'none';
		boardRow.style.display = 'beads' === m ? '' : 'none';
		drillRow.style.display = 'diamond' === m ? '' : 'none';
		symLbl.style.display = [ 'crossstitch', 'diamond', 'c2c' ].includes( m )
			? ''
			: 'none';
		nailsRow.style.display = stringy ? '' : 'none';
		threadsRow.style.display = 'stringart' === m ? '' : 'none';
		thicknessRow.style.display = 'stringart' === m ? '' : 'none';
		guideLbl.style.display = 'stringart' === m ? '' : 'none';
		factorRow.style.display = 'mandala' === m ? '' : 'none';
		srcSec.parentElement.style.display = 'mandala' === m ? 'none' : '';
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
		const key = [
			params.gridW,
			rows,
			params.colors,
			fixed ? fixed.map( ( p ) => p.join( ',' ) ).join( '|' ) : 'auto',
		].join( ':' );
		if ( grid && key === gridKey ) {
			return { grid, rows };
		}
		grid = buildGrid( srcCanvas, params.gridW, rows, params.colors, fixed );
		gridKey = key;
		return { grid, rows };
	}

	// Title composer for the non-grid sheets (string art, mandala).
	function withSheetTitle( sheet ) {
		const tLines = splitLines( params.title, 2 );
		if ( ! tLines.length ) {
			return sheet;
		}
		const tPx = Math.round(
			( 44 * Math.max( 60, Math.min( 160, params.textScale ) ) ) / 100
		);
		const tLh = Math.round( tPx * 1.22 );
		const titleH = tLines.length * tLh + 20;
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
			g.fillText( ln, c.width / 2, 10 + tLh / 2 + i * tLh )
		);
		g.drawImage( sheet, 0, titleH );
		return c;
	}

	let lastArt = null;
	function bake( cell ) {
		lastArt = null;
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
			if ( ! srcCanvas ) {
				return null;
			}
			// Preview weaves a faster, smaller piece; the insert renders
			// the full quality.
			// The preview weaves the FULL thread count (what you see is
			// what you get) - only the internal resolution is smaller.
			const full = cell >= BAKE_CELL;
			const art = buildStringArt( srcBase || srcCanvas, {
				size: full ? 480 : 380,
				nails: params.nails,
				budget: params.threads,
				alpha: { fine: 0.12, normal: 0.16, bold: 0.22 }[
					params.thickness
				],
				color: accentHex() || '#26292e',
			} );
			lastArt = art;
			return withSheetTitle( art.canvas );
		}
		const built = ensureGrid();
		if ( ! built ) {
			return null;
		}
		const { rows } = built;
		const cols = params.gridW;
		const cellH =
			'knitting' === params.mode
				? Math.round( ( cell * params.gauge ) / 100 )
				: cell;
		const chartW = cols * cell;
		const chartH = rows * cellH;
		// Sheet title in the accent color and chosen font.
		const tLines = splitLines( params.title, 2 );
		const tPx = Math.round(
			( cell * 2.6 * Math.max( 60, Math.min( 160, params.textScale ) ) ) /
				100
		);
		const tLh = Math.round( tPx * 1.22 );
		const titleH = tLines.length ? tLines.length * tLh + 18 : 0;
		const legendRows = Math.ceil(
			built.grid.palette.length /
				Math.max( 2, Math.floor( chartW / 190 ) )
		);
		const legendH = legendRows * 34 + 16;
		const c = document.createElement( 'canvas' );
		c.width = chartW + MARGIN * 2;
		c.height = chartH + MARGIN * 2 + titleH + legendH + 14;
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
		renderChart( g, built.grid, cols, rows, {
			mode: params.mode,
			cell,
			cellH,
			symbols: params.symbols,
			boardSize: 'beads' === params.mode ? params.boardSize : 0,
			drill: params.drill,
			x: MARGIN,
			y: MARGIN + titleH,
		} );
		renderLegend( g, built.grid, {
			mode: params.mode,
			x: MARGIN,
			y: MARGIN + titleH + chartH + 14,
			width: chartW,
			symbols: params.symbols,
		} );
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
		if ( ! srcCanvas && 'mandala' !== params.mode ) {
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
		if ( ! srcCanvas && 'mandala' !== params.mode ) {
			return;
		}
		apply.disabled = true;
		setStatus( t( 'Rendering the chart' ) );
		try {
			const baked = bake( BAKE_CELL );
			const url = baked.toDataURL( 'image/png' );
			const doc = editor.state.doc;
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
				if ( 'stringart' === params.mode && params.guide && lastArt ) {
					const guideC = renderStringGuide(
						document.createElement( 'canvas' ),
						lastArt,
						{
							title:
								splitLines( params.title, 1 )[ 0 ] ||
								'String Art',
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
