/** Drawing Templates: local practice sheets, original motifs and image studies.
 * Source selection and generator insertion use the editor's shared bridge.
 */

import {
	paintByNumbers,
	renderNumberLegend,
	coloringPage,
	tracingSheet,
	connectTheDots,
	symmetrySheet,
	gridSheet,
	stepGuide,
	colorByCode,
	shadeByNumbers,
	oneLineDrawing,
	finishSheet,
	mandalaSheet,
} from './drawing-engine.js';

import {
	ALL_MODES as MODES,
	PRACTICE_MODES,
	PRACTICE_DEFAULTS,
	DIFFICULTIES,
	practiceOptions,
} from './practice-catalog.js';
import { renderPractice } from './practice-engine.js';
import { motifCanvas, MOTIFS } from './motifs.js';
import { mountLibrary } from './library.js';
import { version as VERSION } from '../manifest.json';
const BUNDLE_URL =
	document.currentScript?.src ||
	( window.WPIE?.extensions || [] ).find?.(
		( extension ) => extension.slug === 'wpie-drawing-templates'
	)?.main;
const asset = ( file ) =>
	new URL( 'assets/' + file + '?ver=' + VERSION, BUNDLE_URL || location.href )
		.href;

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
	source: 'motif', // 'motif' | 'doc' | 'layer:<id>' | 'media'
	mode: 'warmup',
	...PRACTICE_DEFAULTS,
	title: '',
	font: 'Arial',
	textScale: 100,
	colors: 14,
	smooth: 2,
	detail: 2,
	dots: 60,
	dotHints: true,
	cells: 8,
	symCells: 12,
	symSide: 'right',
	// v2.3 sheets.
	steps: 6, // 4 | 6
	codeKind: 'add', // add | sub | mul | mixed | letters
	codeRange: 20, // 10 | 20 | 100
	codeColors: 8,
	shades: 4,
	lineStyle: 'waves', // waves | spiral
	lineCount: 70,
	lineWeight: 2,
	lineInvert: false,
	finishVariant: 'fade', // fade | missing
	finishDir: 'lr', // lr | tb
	finishAmount: 50,
	segments: 8, // 6 | 8 | 12
	mandalaHints: true,
	seed: 1,
	paletteId: '', // '' = auto colors from the image
	useBrand: false,
	brandKitId: '',
	customColors: [],
};

import { t } from './i18n.js';
import { sourceLayerOptions } from './source-list.js';
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
	const ui = bridge && bridge.ui;
	if ( ! bridge || ! bridge.documents ) {
		return;
	}
	const editing = !! ( layer && layer.generator );
	const params = {
		...DEFAULTS,
		...( editing ? layer.generator.params : {} ),
	};
	Object.assign( params, practiceOptions( params ) );
	if ( ! MODES.some( ( m ) => m.id === params.mode ) )
		params.mode = DEFAULTS.mode;
	params.customColors = Array.isArray( params.customColors )
		? params.customColors.slice( 0, 4 )
		: [];
	const controlSync = [];
	let closed = false,
		loading = false;
	const canRender = () =>
		! MODES.find( ( m ) => m.id === params.mode ).source ||
		( !! srcCanvas && ! loading );

	let srcCanvas = null;
	let srcToken = 0;

	const host = document.getElementById( 'wpie-root' ) || document.body;
	const backdrop = el( 'div', 'modal-backdrop', host );
	const dialog = el( 'div', 'dsm wpiedrw-dialog', backdrop );
	dialog.onclick = ( e ) => e.stopPropagation();
	const head = el( 'div', 'dsm-head', dialog );
	// Die Marke kommt aus dem Kit (bridge.ui), nicht aus dem Paket.
	window.WPIE.bridge.ui.badge( head );
	const titles = el( 'div', 'dsm-titles', head );
	el( 'span', 'dsm-title', titles, 'Drawing Templates' );
	el(
		'div',
		'dsm-sub',
		titles,
		t( 'Drawing practice, original motifs and templates from your images.' )
	);
	const closeBtn = el( 'button', 'dsm-x', head );
	closeBtn.innerHTML = '&times;';
	closeBtn.setAttribute( 'aria-label', t( 'Close' ) );

	const body = el( 'div', 'wpiedrw-body', dialog );
	const library = el( 'div', 'dsm-col start wpiedrw-library', body );
	const view = el( 'div', 'dsm-view wpiedrw-view', body );
	const canvas = el( 'canvas', null, view );
	const side = el( 'div', 'dsm-col end wpiedrw-side', body );
	const status = el( 'div', 'dsm-viewhint wpiedrw-status', view );
	const setStatus = ( msg, isErr ) => {
		status.textContent = msg || '';
		status.classList.toggle( 'on', !! msg );
		status.classList.toggle( 'err', !! isErr );
	};

	const section = ( parent, icon, title ) => {
		const body = ui.section( parent, { icon, title } );
		body.classList.add( 'wpiedrw-card-body' );
		body.parentElement.classList.add( 'wpiedrw-card' );
		return body;
	};

	/* --------------------------- template library ------------------------- */

	const srcSec = section( side, ICONS.source, t( 'Source' ) );
	const choose = ( patch ) => {
		const previousSource = params.source,
			previousMotif = params.motif;
		Object.assign( params, patch );
		Object.assign( params, practiceOptions( params ) );
		if ( ! MODES.some( ( m ) => m.id === params.mode ) )
			params.mode = DEFAULTS.mode;
		syncUi();
		if (
			previousSource !== params.source ||
			previousMotif !== params.motif
		)
			loadSource();
		schedule();
	};
	const libraryCtl = mountLibrary( {
		parent: library,
		ui,
		t,
		asset,
		params,
		choose,
	} );
	// Library thumbnails are generated from the same renderers at build time.
	// Color and source edits only render the selected full-size worksheet.

	/* ------------------------------- source ------------------------------- */

	const srcSel = el( 'select', 'dsm-select wpiedrw-wide', srcSec );
	srcSel.setAttribute( 'aria-label', t( 'Source' ) );
	const srcNote = el( 'div', 'dsm-note wpiedrw-info', srcSec );

	function fillSourceOptions() {
		srcSel.innerHTML = '';
		const add = ( v, label ) => {
			const o = el( 'option', null, srcSel );
			o.value = v;
			o.textContent = label;
			return o;
		};
		add( 'motif', t( 'Motif library' ) );
		add( 'doc', t( 'Whole Document' ) );
		// The layer entries come ready-indented from source-list.js - with
		// non-breaking spaces, because a browser eats ordinary ones inside
		// an <option> and the nesting would be gone.
		for ( const entry of sourceLayerOptions( editor.state.layers ) ) {
			const o = add( entry.value, entry.label );
			// Group headings only name what follows, they are no source.
			o.disabled = entry.disabled;
		}
		add( 'media', t( 'Media Library' ) );
	}
	fillSourceOptions();
	if (
		! Array.from( srcSel.options ).some(
			( option ) => ! option.disabled && option.value === params.source
		)
	)
		params.source = 'doc';
	srcSel.value = params.source;
	const motifButton = el(
		'button',
		'ai-btn secondary wpiedrw-wide',
		srcSec,
		t( 'Choose motif' )
	);
	motifButton.onclick = () => libraryCtl.open( 'motifs' );

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
		if ( closed ) return;
		const token = ++srcToken;
		loading = true;
		apply.disabled = ! canRender();
		const desc = params.source;
		srcNote.textContent = '';
		setStatus( t( 'Rendering the template' ) );
		try {
			let c = null;
			if ( 'motif' === desc ) {
				c = motifCanvas( canvas, params.motif, 900 );
				srcNote.textContent = t(
					MOTIFS.find( ( m ) => m.id === params.motif )?.label ||
						'Fox'
				);
			} else if ( 'media' === desc ) {
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
			if ( ! closed && token === srcToken ) {
				srcCanvas = c;
				loading = false;
				apply.disabled = ! canRender();
				setStatus( '' );
				schedule();
			}
		} catch ( e ) {
			if ( ! closed && token === srcToken ) {
				srcCanvas = null;
				loading = false;
				apply.disabled = ! canRender();
				setStatus( t( 'Could not load the image.' ), true );
				schedule();
			}
		}
	}

	let pickerToken = 0;
	srcSel.onchange = async () => {
		const selection = ++pickerToken;
		if ( 'media' === srcSel.value ) {
			const picked = await loadFromMedia();
			if ( closed || selection !== pickerToken ) return;
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
		const b = el( 'button', 'dsm-strip wpiedrw-pal', palWrap );
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
	let brandCb = null,
		kitCtl = null;
	if ( brandKits.length ) {
		const brandLbl = el( 'label', 'dsm-checkrow wpiedrw-check', colSec );
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
			schedule();
		};
		if (
			brandKits.length > 1 &&
			bridge.components &&
			bridge.components.mountKitPicker
		) {
			kitCtl = bridge.components.mountKitPicker(
				el( 'div', null, colSec ),
				{
					value: params.brandKitId || brandKits[ 0 ].id,
					onChange: ( id ) => {
						params.brandKitId = id;
						params.useBrand = true;
						brandCb.checked = true;
						schedule();
					},
				}
			);
		}
	}

	// Up to four custom paint colors; the mounted button is controlled -
	// call handle.set() on every change.
	const customRow = el( 'div', 'wpiedrw-row wpiedrw-customrow', colSec );
	el( 'span', 'dsm-rowline-label', customRow ).textContent =
		t( 'Custom colors' );
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
	const resetBtn = el(
		'button',
		'ai-btn secondary wpiedrw-reset',
		customRow
	);
	resetBtn.textContent = t( 'Auto' );
	resetBtn.onclick = ( e ) => {
		e.preventDefault();
		params.customColors = [];
		params.useBrand = false;
		params.paletteId = '';
		customCtls.forEach( ( ctl ) => ctl && ctl.set && ctl.set( '#cccccc' ) );
		syncUi();
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
		// A single custom swatch is already enough for grid lines and titles.
		const custom = params.customColors.find( ( color ) =>
			/^#[0-9a-f]{6}$/i.test( String( color ) )
		);
		if ( custom ) return custom;
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
	el( 'span', 'dsm-fieldlabel', titleRow ).textContent = t( 'Title' );
	const titleArea = el( 'textarea', 'dsm-input wpiedrw-names', titleRow );
	titleArea.rows = 2;
	titleArea.value = params.title;
	titleArea.oninput = () => {
		params.title = titleArea.value;
		schedule();
	};

	const fontRow = el( 'div', 'wpiedrw-text-row', setSec );
	el( 'span', 'dsm-fieldlabel', fontRow ).textContent = t( 'Font' );
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
			value: params.font || 'Arial',
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
		el( 'span', 'dsm-rowline-label', row ).textContent = label;
		const input = el( 'input', null, row );
		input.type = 'range';
		input.min = String( min );
		input.max = String( max );
		input.value = String( get() );
		const out = el( 'output', null, row );
		const suffix = unit || '';
		out.textContent = String( get() ) + suffix;
		controlSync.push( () => {
			input.value = String( get() );
			out.textContent = String( get() ) + suffix;
		} );
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
	const hintsLbl = el( 'label', 'dsm-checkrow wpiedrw-check', setSec );
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
	el( 'span', 'dsm-rowline-label', sideRow ).textContent = t( 'Empty half' );
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

	/* ---- v2.3 sheet options ---- */
	function selectRowIn( parent, label, options, get, set ) {
		const row = el( 'label', 'wpiedrw-row', parent );
		el( 'span', 'dsm-rowline-label', row ).textContent = label;
		const sel = el( 'select', 'dsm-select', row );
		for ( const [ v, l ] of options ) {
			const o = el( 'option', null, sel );
			o.value = String( v );
			o.textContent = l;
		}
		sel.value = String( get() );
		controlSync.push( () => {
			sel.value = String( get() );
		} );
		sel.onchange = () => {
			set( sel.value );
			schedule();
		};
		return row;
	}
	function checkRowIn( parent, label, get, set ) {
		const lbl = el( 'label', 'dsm-checkrow wpiedrw-check', parent );
		const cb = el( 'input', null, lbl );
		cb.type = 'checkbox';
		cb.checked = !! get();
		controlSync.push( () => {
			cb.checked = !! get();
		} );
		el( 'span', null, lbl ).textContent = label;
		cb.onchange = () => {
			set( cb.checked );
			schedule();
		};
		return lbl;
	}
	const stepsRow = selectRowIn(
		setSec,
		t( 'Steps' ),
		[
			[ 6, '6' ],
			[ 4, '4' ],
		],
		() => params.steps,
		( v ) => ( params.steps = parseInt( v, 10 ) )
	);
	const codeKindRow = selectRowIn(
		setSec,
		t( 'Task type' ),
		[
			[ 'add', t( 'Addition' ) ],
			[ 'sub', t( 'Subtraction' ) ],
			[ 'mixed', t( 'Addition and subtraction' ) ],
			[ 'mul', t( 'Multiplication' ) ],
			[ 'letters', t( 'Letters' ) ],
			[ 'symbols', t( 'Symbols' ) ],
		],
		() => params.codeKind,
		( v ) => ( params.codeKind = v )
	);
	const codeRangeRow = selectRowIn(
		setSec,
		t( 'Number range' ),
		[
			[ 10, t( 'Up to 10' ) ],
			[ 20, t( 'Up to 20' ) ],
			[ 100, t( 'Up to 100' ) ],
		],
		() => params.codeRange,
		( v ) => ( params.codeRange = parseInt( v, 10 ) )
	);
	const codeColorsRow = sliderRowIn(
		setSec,
		t( 'Colors' ),
		6,
		12,
		() => params.codeColors,
		( v ) => ( params.codeColors = v )
	);
	const shuffleRow = el( 'div', 'wpiedrw-row', setSec );
	el( 'span', 'dsm-rowline-label', shuffleRow ).textContent =
		t( 'Variation' );
	const shuffleBtn = el( 'button', 'ai-btn secondary', shuffleRow );
	shuffleBtn.type = 'button';
	shuffleBtn.textContent = t( 'Shuffle' );
	shuffleBtn.onclick = () => {
		params.seed = ( ( params.seed | 0 ) % 100000 ) + 1;
		schedule();
	};
	const shadesRow = sliderRowIn(
		setSec,
		t( 'Shades' ),
		3,
		5,
		() => params.shades,
		( v ) => ( params.shades = v )
	);
	const lineStyleRow = selectRowIn(
		setSec,
		t( 'Line style' ),
		[
			[ 'waves', t( 'Waves' ) ],
			[ 'spiral', t( 'Spiral' ) ],
		],
		() => params.lineStyle,
		( v ) => ( params.lineStyle = v )
	);
	const lineCountRow = sliderRowIn(
		setSec,
		t( 'Lines' ),
		30,
		140,
		() => params.lineCount,
		( v ) => ( params.lineCount = v )
	);
	const lineWeightRow = sliderRowIn(
		setSec,
		t( 'Line weight' ),
		1,
		3,
		() => params.lineWeight,
		( v ) => ( params.lineWeight = v )
	);
	const lineInvertLbl = checkRowIn(
		setSec,
		t( 'Draw the light parts' ),
		() => params.lineInvert,
		( v ) => ( params.lineInvert = v )
	);
	const variantRow = selectRowIn(
		setSec,
		t( 'Variant' ),
		[
			[ 'fade', t( 'Lines fade out' ) ],
			[ 'missing', t( 'Missing parts' ) ],
		],
		() => params.finishVariant,
		( v ) => ( params.finishVariant = v )
	);
	const dirRow = selectRowIn(
		setSec,
		t( 'Direction' ),
		[
			[ 'lr', t( 'Left to right' ) ],
			[ 'tb', t( 'Top to bottom' ) ],
		],
		() => params.finishDir,
		( v ) => ( params.finishDir = v )
	);
	const amountRow = sliderRowIn(
		setSec,
		t( 'To finish' ),
		30,
		70,
		() => params.finishAmount,
		( v ) => ( params.finishAmount = v ),
		'%'
	);
	const segRow = selectRowIn(
		setSec,
		t( 'Segments' ),
		[
			[ 6, '6' ],
			[ 8, '8' ],
			[ 12, '12' ],
		],
		() => params.segments,
		( v ) => ( params.segments = parseInt( v, 10 ) )
	);
	const mandalaHintsLbl = checkRowIn(
		setSec,
		t( 'Ghost hints' ),
		() => params.mandalaHints,
		( v ) => ( params.mandalaHints = v )
	);

	const practiceSec = section( side, ICONS.template, t( 'Practice' ) );
	side.insertBefore( practiceSec.parentElement, setSec.parentElement );
	const difficultyRow = selectRowIn(
		practiceSec,
		t( 'Difficulty' ),
		DIFFICULTIES.map( ( [ id, label ] ) => [ id, t( label ) ] ),
		() => params.difficulty,
		( v ) => {
			params.difficulty = v;
		}
	);
	const variantLabel = el( 'label', 'wpiedrw-text-row', practiceSec );
	el( 'span', 'dsm-fieldlabel', variantLabel, t( 'Variant' ) );
	const practiceVariant = el(
		'select',
		'dsm-select wpiedrw-wide',
		variantLabel
	);
	practiceVariant.onchange = () => {
		params.practiceVariant = Number( practiceVariant.value );
		schedule();
	};
	let variantMode = '';
	const rowCount = sliderRowIn(
		practiceSec,
		t( 'Practice rows' ),
		3,
		7,
		() => params.rows,
		( v ) => {
			params.rows = v;
		}
	);
	const hintRow = sliderRowIn(
		practiceSec,
		t( 'Guide opacity' ),
		10,
		70,
		() => params.hintOpacity,
		( v ) => {
			params.hintOpacity = v;
		},
		'%'
	);
	const weightRow = sliderRowIn(
		practiceSec,
		t( 'Line weight' ),
		1,
		4,
		() => params.strokeWeight,
		( v ) => {
			params.strokeWeight = v;
		}
	);
	const ringRow = sliderRowIn(
		practiceSec,
		t( 'Rings' ),
		2,
		6,
		() => params.rings,
		( v ) => {
			params.rings = v;
		}
	);
	const textRow = el( 'label', 'wpiedrw-text-row', practiceSec );
	el( 'span', 'dsm-fieldlabel', textRow, t( 'Practice text' ) );
	const practiceText = el( 'input', 'dsm-input wpiedrw-wide', textRow );
	practiceText.maxLength = 80;
	practiceText.value = params.practiceText;
	practiceText.oninput = () => {
		params.practiceText = practiceText.value;
		schedule();
	};
	const axisRow = selectRowIn(
		setSec,
		t( 'Mirror axis' ),
		[
			[ 'vertical', 'Vertical' ],
			[ 'horizontal', 'Horizontal' ],
			[ 'diagonal', 'Diagonal' ],
			[ 'quarter', 'Quarter' ],
		].map( ( [ id, label ] ) => [ id, t( label ) ] ),
		() => params.symAxis,
		( v ) => {
			params.symAxis = v;
		}
	);
	const scaleRow = selectRowIn(
		setSec,
		t( 'Drawing scale' ),
		[
			[ 0.75, '75%' ],
			[ 1, '100%' ],
			[ 1.5, '150%' ],
			[ 2, '200%' ],
		],
		() => params.gridScale,
		( v ) => {
			params.gridScale = Number( v );
		}
	);
	const syncUi = () => {
		libraryCtl.sync();
		controlSync.forEach( ( sync ) => sync() );
		srcSel.value = params.source;
		hintsCb.checked = !! params.dotHints;
		sideSel.value = params.symSide;
		practiceText.value = params.practiceText;
		motifButton.style.display =
			params.source === 'motif' || params.mode === 'construction'
				? ''
				: 'none';
		srcSel.hidden = params.mode === 'construction';
		difficultyRow.hidden =
			[ 'values', 'stippling', 'negative', 'construction' ].includes(
				params.mode
			) ||
			( params.mode === 'rosette' && params.practiceVariant !== 3 );
		const practice = PRACTICE_MODES.find( ( m ) => m.id === params.mode );
		practiceSec.parentElement.hidden = ! practice;
		srcSec.parentElement.hidden =
			!! practice && ! practice.source && params.mode !== 'construction';
		if ( practice && variantMode !== params.mode ) {
			practiceVariant.replaceChildren();
			practice.variants.forEach( ( label, i ) => {
				const option = el( 'option', '', practiceVariant, t( label ) );
				option.value = String( i );
			} );
			variantMode = params.mode;
		}
		practiceVariant.value = String( params.practiceVariant );
		const practicingRows =
			practice &&
			! practice.source &&
			! [ 'rosette', 'construction' ].includes( params.mode );
		rowCount.hidden = ! practicingRows;
		textRow.hidden = params.mode !== 'lettering';
		ringRow.hidden = params.mode !== 'rosette';
		weightRow.hidden = ! [
			'warmup',
			'forms',
			'ornaments',
			'rosette',
			'construction',
		].includes( params.mode );
		hintRow.hidden = [
			'negative',
			'detailstudy',
			'construction',
			'values',
			'stippling',
		].includes( params.mode );
		axisRow.hidden = params.mode !== 'symmetry';
		scaleRow.hidden = params.mode !== 'grid';
		apply.disabled = ! canRender();
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
		sideRow.style.display =
			'symmetry' === m && params.symAxis === 'vertical' ? '' : 'none';
		const show = ( node, on ) => ( node.style.display = on ? '' : 'none' );
		show( stepsRow, 'steps' === m );
		show( codeKindRow, 'code' === m );
		show(
			codeRangeRow,
			'code' === m &&
				! [ 'letters', 'symbols' ].includes( params.codeKind )
		);
		show( codeColorsRow, 'code' === m && ! resolvedFixed() );
		show(
			shuffleRow,
			'code' === m ||
				( 'finish' === m && 'missing' === params.finishVariant )
		);
		show( shadesRow, 'shade' === m );
		show( lineStyleRow, 'oneline' === m );
		show( lineCountRow, 'oneline' === m );
		show( lineWeightRow, 'oneline' === m );
		show( lineInvertLbl, 'oneline' === m );
		show( variantRow, 'finish' === m );
		show( dirRow, 'finish' === m && 'fade' === params.finishVariant );
		show( amountRow, 'finish' === m );
		show( segRow, [ 'mandala', 'rosette' ].includes( m ) );
		show( mandalaHintsLbl, 'mandala' === m );
		// Detail drives the region pipeline of the finish sheet too.
		if ( 'finish' === m ) {
			detailRow.style.display = '';
		}
		// Smoothing serves every region sheet that carries labels.
		if ( [ 'code', 'shade' ].includes( m ) ) {
			smoothRow.style.display = '';
		}
		colSec.parentElement.style.display = [
			'paintbynumbers',
			'symmetry',
			'grid',
			'code',
			'steps',
			'mandala',
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
			g.fillText( ln, c.width / 2, 8 + tLh / 2 + i * tLh, c.width - 40 )
		);
		g.drawImage( sheet, 0, titleH );
		return c;
	}

	let cachedKey = '',
		cachedSheet = null;
	function bake() {
		if ( ! canRender() ) return null;
		const key = JSON.stringify( params ) + ':' + srcToken;
		if ( key === cachedKey && cachedSheet ) return cachedSheet;
		cachedSheet = computeSheet();
		cachedKey = key;
		return cachedSheet;
	}
	function computeSheet() {
		if ( PRACTICE_MODES.some( ( m ) => m.id === params.mode ) )
			return withTitle( renderPractice( canvas, params, srcCanvas, t ) );
		if (
			params.source === 'motif' &&
			[ 'coloring', 'tracing' ].includes( params.mode )
		) {
			return withTitle(
				motifCanvas( canvas, params.motif, 1200, {
					outline: true,
					weight: 1.5 + params.detail,
					color: params.mode === 'tracing' ? '#a5adb5' : '#303943',
					dashed: params.mode === 'tracing',
				} )
			);
		}
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
					axis: params.symAxis,
					gridColor: accent || undefined,
				} )
			);
		}
		// A numbered sheet plus its legend, shared by code and shade.
		const withLegend = ( sheet, palette, labels ) => {
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
				labels,
			} );
			return withTitle( c );
		};
		if ( 'steps' === params.mode ) {
			return withTitle(
				stepGuide( srcCanvas, {
					steps: params.steps,
					accent: accent || undefined,
				} ).canvas
			);
		}
		if ( 'code' === params.mode ) {
			const out = colorByCode( srcCanvas, {
				kind: params.codeKind,
				range: params.codeRange,
				colors: params.codeColors,
				smooth: params.smooth,
				seed: params.seed,
				fixedPalette: resolvedFixed(),
			} );
			return withLegend( out.canvas, out.palette, out.labels );
		}
		if ( 'shade' === params.mode ) {
			const out = shadeByNumbers( srcCanvas, {
				shades: params.shades,
				smooth: params.smooth,
			} );
			return withLegend( out.canvas, out.palette );
		}
		if ( 'oneline' === params.mode ) {
			return withTitle(
				oneLineDrawing( srcCanvas, {
					style: params.lineStyle,
					lines: params.lineCount,
					weight: params.lineWeight,
					invert: params.lineInvert,
				} ).canvas
			);
		}
		if ( 'finish' === params.mode ) {
			return withTitle(
				finishSheet( srcCanvas, {
					variant: params.finishVariant,
					direction: params.finishDir,
					amount: params.finishAmount,
					detail: params.detail,
					seed: params.seed,
				} ).canvas
			);
		}
		if ( 'mandala' === params.mode ) {
			return withTitle(
				mandalaSheet( srcCanvas, {
					segments: params.segments,
					hints: params.mandalaHints,
					gridColor: accent || undefined,
				} )
			);
		}
		return withTitle(
			gridSheet( srcCanvas, {
				cells: params.cells,
				scale: params.gridScale,
				gridColor: accent || undefined,
			} )
		);
	}

	let timer = 0;
	let busy = false;
	function schedule() {
		if ( closed ) return;
		cachedKey = '';
		// The heavy modes take a few hundred ms - debounce slider drags.
		window.clearTimeout( timer );
		timer = window.setTimeout( paintNow, 180 );
	}
	function paintNow() {
		if ( closed ) return;
		syncUi();
		if ( ! canRender() ) {
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
		} catch ( error ) {
			setStatus(
				error.message || t( 'Could not render the template.' ),
				true
			);
		} finally {
			busy = false;
		}
	}

	/* ------------------------------ lifecycle ----------------------------- */

	const onResize = () => paintNow();
	const viewRO =
		'function' === typeof window.ResizeObserver
			? new window.ResizeObserver( () => paintNow() )
			: null;
	const onKey = ( e ) => {
		if ( e.key !== 'Escape' || e.defaultPrevented || closed ) return;
		const dialogs = [
			...document.querySelectorAll( '#wpie-root .modal-backdrop' ),
		];
		if ( dialogs.length && dialogs.at( -1 ) !== backdrop ) return;
		if (
			dialog.querySelector(
				'.wpie-color-swatch button[aria-expanded="true"], .color-popover'
			)
		)
			return;
		e.preventDefault();
		e.stopImmediatePropagation();
		close();
	};
	function close() {
		if ( closed ) return;
		closed = true;
		history.dispose();
		++srcToken;
		cachedSheet = null;
		window.clearTimeout( timer );
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
		kitCtl?.unmount?.();
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
	// Ctrl+Z / Ctrl+Shift+Z (shared/studio-undo.js), no button: the same
	// way back in as a library pick (choose), source included.
	const history = studioUndo( {
		backdrop,
		read: () => params,
		write: ( data ) => choose( data ),
	} );

	/* -------------------------------- insert ------------------------------ */

	apply.onclick = async () => {
		if ( ! canRender() ) {
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
	if ( window.__wpieQA )
		window.__drawingTemplates = {
			params,
			choose,
			bake,
			close,
			ready: () => ! closed && ! loading && canRender(),
		};
	requestAnimationFrame( () => {
		if ( closed ) return;
		syncUi();
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
