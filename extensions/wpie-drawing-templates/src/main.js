/**
 * WPIE extension: Drawing Templates (v2 dialog).
 *
 * The whole document (default), any layer or a media-library image
 * becomes a printable drawing template: paint by numbers, a coloring
 * page, a tracing sheet, connect the dots, a symmetry drawing sheet
 * or the classic grid drawing aid. Paint colors can be pinned to ten
 * preset palettes, the brand kit or custom colors; every sheet takes
 * a multi-line title in the editor font catalog. Everything is
 * computed locally.
 */

import {
	MODES,
	paintByNumbers,
	renderNumberLegend,
	coloringPage,
	tracingSheet,
	connectTheDots,
	symmetrySheet,
	gridSheet,
} from './drawing-engine.js';

const GEN_ID = 'wpie-drawing-templates/sheet';

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
	mode: 'paintbynumbers',
	title: '',
	font: '',
	textScale: 100,
	colors: 14,
	smooth: 2,
	detail: 2,
	dots: 60,
	dotHints: true,
	cells: 8,
	symCells: 12,
	symSide: 'right',
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
	template: tabIcon(
		'M4 4h6v6h-6z M14 4h6v6h-6z M4 14h6v6h-6z M14 14h6v6h-6z'
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

	let srcCanvas = null;
	let srcToken = 0;

	const host = document.getElementById( 'wpie-root' ) || document.body;
	const backdrop = el( 'div', 'modal-backdrop', host );
	const dialog = el( 'div', 'dsm wpiedrw-dialog', backdrop );
	dialog.onclick = ( e ) => e.stopPropagation();
	const head = el( 'div', 'dsm-head', dialog );
	const badge = el( 'span', 'dsm-badge', head );
	badge.innerHTML = ICON_BRAND;
	const titles = el( 'div', 'dsm-titles', head );
	el( 'span', 'dsm-title', titles, 'Drawing Templates' );
	el(
		'div',
		'dsm-sub',
		titles,
		t(
			'Six printable drawing templates from one image - as editable layers.'
		)
	);
	const closeBtn = el( 'button', 'dsm-x', head );
	closeBtn.innerHTML = '&times;';
	closeBtn.setAttribute( 'aria-label', t( 'Close' ) );

	const body = el( 'div', 'wpiedrw-body', dialog );
	const view = el( 'div', 'wpiedrw-view', body );
	const canvas = el( 'canvas', null, view );
	const side = el( 'div', 'wpiedrw-side', body );
	const status = el( 'div', 'wpiedrw-status', view );
	const setStatus = ( msg, isErr ) => {
		status.textContent = msg || '';
		status.classList.toggle( 'on', !! msg );
		status.classList.toggle( 'err', !! isErr );
	};

	const section = ( parent, icon, label ) => {
		const card = el( 'div', 'wpiedrw-card', parent );
		const h = el( 'div', 'wpiedrw-card-head', card );
		h.innerHTML = icon + '<span>' + label + '</span>';
		return el( 'div', 'wpiedrw-card-body', card );
	};

	/* --------------------------- template cards --------------------------- */

	const modeSec = section( side, ICONS.template, t( 'Template' ) );
	const modeGrid = el( 'div', 'wpiedrw-cards', modeSec );
	const modeTiles = new Map();
	for ( const m of MODES ) {
		const card = el( 'button', 'wpiedrw-tcard', modeGrid );
		card.type = 'button';
		card.title = t( m.label );
		const thumb = el( 'canvas', 'wpiedrw-tthumb', card );
		thumb.width = 132;
		thumb.height = 92;
		el( 'span', 'wpiedrw-tlabel', card, t( m.label ) );
		card.onclick = () => {
			params.mode = m.id;
			syncUi();
			schedule();
		};
		modeTiles.set( m.id, { card, thumb } );
	}

	// Live previews of the actual source per template (fallback swatch
	// until the source loads). Rendered small to stay fast.
	function thumbSource() {
		const c = document.createElement( 'canvas' );
		c.width = 132;
		c.height = 92;
		const g = c.getContext( '2d' );
		if ( srcCanvas ) {
			const s = Math.max(
				c.width / srcCanvas.width,
				c.height / srcCanvas.height
			);
			g.drawImage(
				srcCanvas,
				( c.width - srcCanvas.width * s ) / 2,
				( c.height - srcCanvas.height * s ) / 2,
				srcCanvas.width * s,
				srcCanvas.height * s
			);
			return c;
		}
		const gr = g.createLinearGradient( 0, 0, 132, 92 );
		gr.addColorStop( 0, '#a5d8ff' );
		gr.addColorStop( 1, '#d0bfff' );
		g.fillStyle = gr;
		g.fillRect( 0, 0, 132, 92 );
		g.fillStyle = '#e03131';
		g.beginPath();
		g.arc( 66, 46, 26, 0, Math.PI * 2 );
		g.fill();
		return c;
	}
	function paintCardThumbs() {
		const src = thumbSource();
		const accent = accentHex();
		const renders = {
			paintbynumbers: () =>
				paintByNumbers( src, { colors: 8, smooth: 1 } ).canvas,
			coloring: () => coloringPage( src, { detail: 2 } ),
			tracing: () => tracingSheet( src, { detail: 2 } ),
			dots: () => connectTheDots( src, { count: 40 } ).canvas,
			symmetry: () =>
				symmetrySheet( src, { cells: 10, gridColor: accent } ),
			grid: () => gridSheet( src, { cells: 6, gridColor: accent } ),
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
		thumbTimer = window.setTimeout( paintCardThumbs, 160 );
	};

	/* ------------------------------- source ------------------------------- */

	const srcSec = section( side, ICONS.source, t( 'Source' ) );
	const srcSel = el( 'select', 'dsm-select wpiedrw-wide', srcSec );
	const srcNote = el( 'div', 'wpiedrw-info', srcSec );

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
		setStatus( t( 'Rendering the template' ) );
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
				srcCanvas = c;
				apply.disabled = ! srcCanvas;
				setStatus( '' );
				refreshThumbs();
				schedule();
			}
		} catch ( e ) {
			if ( token === srcToken ) {
				srcCanvas = null;
				setStatus( t( 'Could not load the image.' ), true );
				schedule();
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
	const palWrap = el( 'div', 'wpiedrw-pals', colSec );
	const palBtns = new Map();
	for ( const p of PALETTES ) {
		const b = el( 'button', 'wpiedrw-pal', palWrap );
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
		const brandLbl = el( 'label', 'wpiedrw-check', colSec );
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

	// Up to four custom paint colors; the mounted button is controlled -
	// call handle.set() on every change.
	const customRow = el( 'div', 'wpiedrw-row wpiedrw-customrow', colSec );
	el( 'span', null, customRow ).textContent = t( 'Custom colors' );
	const customWrap = el( 'span', 'wpiedrw-customs', customRow );
	const mountSwatch = bridge.components && bridge.components.mountColorButton;
	const customCtls = [];
	for ( let i = 0; i < 4; i++ ) {
		const slot = el( 'span', 'wpiedrw-swatch', customWrap );
		const onChange = ( c ) => {
			const hex = 'string' === typeof c ? c : ( c && c.hex ) || '';
			params.customColors[ i ] = hex;
			params.useBrand = false;
			params.paletteId = '';
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
	const resetBtn = el( 'button', 'wpiedrw-reset', customRow );
	resetBtn.textContent = t( 'Auto' );
	resetBtn.onclick = ( e ) => {
		e.preventDefault();
		params.customColors = [];
		params.useBrand = false;
		params.paletteId = '';
		customCtls.forEach( ( ctl ) => ctl && ctl.set && ctl.set( '#cccccc' ) );
		syncUi();
		refreshThumbs();
		schedule();
	};

	// Fixed paint palette (rgb triplets) or null = auto from the image.
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
	function accentHex() {
		const fixed = resolvedFixed();
		return fixed
			? '#' +
					fixed[ 0 ]
						.map( ( v ) => v.toString( 16 ).padStart( 2, '0' ) )
						.join( '' )
			: '';
	}

	/* ------------------------------ settings ------------------------------ */

	const setSec = section( side, ICONS.settings, t( 'Settings' ) );

	const titleRow = el( 'label', 'wpiedrw-text-row', setSec );
	el( 'span', null, titleRow ).textContent = t( 'Title' );
	const titleArea = el( 'textarea', 'wpiedrw-names', titleRow );
	titleArea.rows = 2;
	titleArea.value = params.title;
	titleArea.oninput = () => {
		params.title = titleArea.value;
		schedule();
	};

	const fontRow = el( 'div', 'wpiedrw-text-row', setSec );
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
		const fontSel = el( 'select', 'dsm-select wpiedrw-wide', fontMount );
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
		const row = el( 'label', 'wpiedrw-row', parent );
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
	const sizeTextRow = sliderRowIn(
		setSec,
		t( 'Text size' ),
		60,
		160,
		() => params.textScale,
		( v ) => ( params.textScale = v ),
		'%'
	);
	const colorsRow = sliderRowIn(
		setSec,
		t( 'Colors' ),
		6,
		20,
		() => params.colors,
		( v ) => ( params.colors = v )
	);
	const smoothRow = sliderRowIn(
		setSec,
		t( 'Smoothing' ),
		1,
		3,
		() => params.smooth,
		( v ) => ( params.smooth = v )
	);
	const detailRow = sliderRowIn(
		setSec,
		t( 'Detail' ),
		1,
		3,
		() => params.detail,
		( v ) => ( params.detail = v )
	);
	const dotsRow = sliderRowIn(
		setSec,
		t( 'Dots' ),
		20,
		120,
		() => params.dots,
		( v ) => ( params.dots = v )
	);
	const hintsLbl = el( 'label', 'wpiedrw-check', setSec );
	const hintsCb = el( 'input', null, hintsLbl );
	hintsCb.type = 'checkbox';
	hintsCb.checked = !! params.dotHints;
	el( 'span', null, hintsLbl ).textContent = t( 'Hint lines' );
	hintsCb.onchange = () => {
		params.dotHints = hintsCb.checked;
		schedule();
	};
	const cellsRow = sliderRowIn(
		setSec,
		t( 'Grid cells' ),
		4,
		16,
		() => params.cells,
		( v ) => ( params.cells = v )
	);
	const symCellsRow = sliderRowIn(
		setSec,
		t( 'Grid cells' ),
		6,
		20,
		() => params.symCells,
		( v ) => ( params.symCells = v )
	);
	const sideRow = el( 'label', 'wpiedrw-row', setSec );
	el( 'span', null, sideRow ).textContent = t( 'Empty half' );
	const sideSel = el( 'select', 'dsm-select', sideRow );
	for ( const [ v, l ] of [
		[ 'right', t( 'Right' ) ],
		[ 'left', t( 'Left' ) ],
	] ) {
		const o = el( 'option', null, sideSel );
		o.value = v;
		o.textContent = l;
	}
	sideSel.value = params.symSide;
	sideSel.onchange = () => {
		params.symSide = sideSel.value;
		schedule();
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
		void sizeTextRow;
		const m = params.mode;
		colorsRow.style.display =
			'paintbynumbers' === m && ! resolvedFixed() ? '' : 'none';
		smoothRow.style.display = 'paintbynumbers' === m ? '' : 'none';
		detailRow.style.display = [ 'coloring', 'tracing' ].includes( m )
			? ''
			: 'none';
		dotsRow.style.display = 'dots' === m ? '' : 'none';
		hintsLbl.style.display = 'dots' === m ? '' : 'none';
		cellsRow.style.display = 'grid' === m ? '' : 'none';
		symCellsRow.style.display = 'symmetry' === m ? '' : 'none';
		sideRow.style.display = 'symmetry' === m ? '' : 'none';
		colSec.parentElement.style.display = [
			'paintbynumbers',
			'symmetry',
			'grid',
		].includes( m )
			? ''
			: 'none';
	};

	/* ------------------------------- footer ------------------------------- */

	const foot = el( 'div', 'dsm-foot', dialog );
	el(
		'div',
		'dsm-hint',
		foot,
		t( 'The template is computed locally in your browser.' )
	);
	const actions = el( 'div', 'dsm-actions', foot );
	const cancelBtn = el( 'button', 'ai-btn secondary', actions );
	cancelBtn.textContent = t( 'Cancel' );
	const apply = el( 'button', 'ai-btn primary', actions );
	apply.textContent = editing
		? t( 'Update template' )
		: t( 'Insert template' );
	apply.disabled = true;

	/* ------------------------------- painting ----------------------------- */

	function withTitle( sheet ) {
		const tLines = splitLines( params.title, 2 );
		if ( ! tLines.length ) {
			return sheet;
		}
		const tPx = Math.round(
			( 30 * Math.max( 60, Math.min( 160, params.textScale ) ) ) / 100
		);
		const tLh = Math.round( tPx * 1.22 );
		const titleH = tLines.length * tLh + 16;
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
			g.fillText( ln, c.width / 2, 8 + tLh / 2 + i * tLh )
		);
		g.drawImage( sheet, 0, titleH );
		return c;
	}

	function bake() {
		if ( ! srcCanvas ) {
			return null;
		}
		const accent = accentHex();
		if ( 'paintbynumbers' === params.mode ) {
			const { canvas: sheet, palette } = paintByNumbers( srcCanvas, {
				colors: params.colors,
				smooth: params.smooth,
				fixedPalette: resolvedFixed(),
			} );
			const legendRows = Math.ceil(
				palette.length / Math.max( 3, Math.floor( sheet.width / 130 ) )
			);
			const c = document.createElement( 'canvas' );
			c.width = sheet.width;
			c.height = sheet.height + legendRows * 32 + 24;
			const g = c.getContext( '2d' );
			g.fillStyle = '#ffffff';
			g.fillRect( 0, 0, c.width, c.height );
			g.drawImage( sheet, 0, 0 );
			renderNumberLegend( g, palette, {
				x: 0,
				y: sheet.height + 10,
				width: sheet.width,
			} );
			return withTitle( c );
		}
		if ( 'coloring' === params.mode ) {
			return withTitle(
				coloringPage( srcCanvas, { detail: params.detail } )
			);
		}
		if ( 'tracing' === params.mode ) {
			return withTitle(
				tracingSheet( srcCanvas, { detail: params.detail } )
			);
		}
		if ( 'dots' === params.mode ) {
			return withTitle(
				connectTheDots( srcCanvas, {
					count: params.dots,
					hints: params.dotHints,
					detail: params.detail,
				} ).canvas
			);
		}
		if ( 'symmetry' === params.mode ) {
			return withTitle(
				symmetrySheet( srcCanvas, {
					cells: params.symCells,
					side: params.symSide,
					gridColor: accent || undefined,
				} )
			);
		}
		return withTitle(
			gridSheet( srcCanvas, {
				cells: params.cells,
				gridColor: accent || undefined,
			} )
		);
	}

	let timer = 0;
	let busy = false;
	function schedule() {
		// The heavy modes take a few hundred ms - debounce slider drags.
		window.clearTimeout( timer );
		timer = window.setTimeout( paintNow, 180 );
	}
	function paintNow() {
		syncUi();
		if ( ! srcCanvas ) {
			canvas.width = 10;
			canvas.height = 10;
			return;
		}
		if ( busy ) {
			schedule();
			return;
		}
		busy = true;
		try {
			const baked = bake();
			if ( baked ) {
				const maxW = Math.max( 200, view.clientWidth - 36 );
				const maxH = Math.max( 200, view.clientHeight - 36 );
				const s = Math.min(
					maxW / baked.width,
					maxH / baked.height,
					1
				);
				canvas.width = Math.round( baked.width * s );
				canvas.height = Math.round( baked.height * s );
				canvas
					.getContext( '2d' )
					.drawImage( baked, 0, 0, canvas.width, canvas.height );
			}
		} finally {
			busy = false;
		}
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
		if ( ! srcCanvas ) {
			return;
		}
		apply.disabled = true;
		setStatus( t( 'Rendering the template' ) );
		try {
			const baked = bake();
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
				editor.commit( t( 'Update template' ) );
				setStatus( t( 'Template updated.' ) );
			} else {
				const imgLayer = bridge.documents.makeImage( {
					name: t(
						MODES.find( ( m ) => m.id === params.mode ).label
					),
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
				editor.dispatch( { type: 'SET_ACTIVE', id: imgLayer.id } );
				editor.commit( t( 'Insert template' ) );
				setStatus( t( 'Inserted.' ) );
			}
			close();
		} catch ( e ) {
			setStatus(
				e && e.message
					? e.message
					: t( 'Could not insert the template.' ),
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
				.then( schedule )
				.catch( () => {} );
		}
	} );
}

/* -------------------------------- register ------------------------------- */

function register( api ) {
	api.registerGenerator( {
		id: GEN_ID,
		label: 'Drawing Templates',
		run: ( ctx ) => openStudio( ctx ),
		edit: ( ctx ) => openStudio( ctx ),
	} );
}

if ( window.WPIE && window.WPIE.api ) {
	register( window.WPIE.api );
} else {
	window.wp.hooks.addAction(
		'wpie.ready',
		'wpie-drawing-templates',
		register
	);
}
