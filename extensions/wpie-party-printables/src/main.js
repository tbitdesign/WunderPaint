/**
 * WPIE extension: Party Printables (v2 dialog).
 *
 * Twelve printable party templates, computed locally: bunting, letter
 * banner, gift box, gift tags, cupcake toppers, place cards, straw
 * flags, party hat, cupcake wrappers, photo props, bottle labels and a
 * print-and-cut sticker sheet. Sources: the whole document (default),
 * any layer by name, or the media library. Colors come from ten
 * palettes, the brand kit or up to four custom colors picked with the
 * editor's own color picker; text templates use the editor's font
 * catalog and a size factor.
 */

import {
	PALETTES,
	STICKER_SHAPES,
	colorsFor,
	bunting,
	boxDieline,
	stickerSheet,
	giftTags,
	cupcakeToppers,
	placeCards,
	strawFlags,
	partyHat,
	letterBanner,
	cupcakeWrappers,
	photoProps,
	bottleLabels,
} from './party-engine.js';

const GEN_ID = 'wpie-party-printables/sheet';

const DEFAULTS = {
	image: null, // { id, url, title } for media picks
	source: 'doc', // 'doc' | 'layer:<id>' | 'media' | 'none'
	mode: 'bunting',
	text: 'HAPPY BIRTHDAY',
	tagText: '',
	names: '',
	shape: 'triangle',
	paletteId: 'party',
	useBrand: false,
	brandKitId: '',
	customColors: [],
	perRow: 8,
	imageSpan: 'face',
	ribbon: false,
	decor: 'stripes',
	stripeCount: 9,
	scallop: true,
	stickerShape: 'circle',
	cols: 4,
	font: '',
	textScale: 100,
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

const MODES = [
	{ id: 'bunting', label: 'Bunting' },
	{ id: 'letterbanner', label: 'Letter banner' },
	{ id: 'box', label: 'Gift box' },
	{ id: 'tags', label: 'Gift tags' },
	{ id: 'toppers', label: 'Cupcake toppers' },
	{ id: 'cupcakewrap', label: 'Cupcake wrappers' },
	{ id: 'placecards', label: 'Place cards' },
	{ id: 'strawflags', label: 'Straw flags' },
	{ id: 'partyhat', label: 'Party hat' },
	{ id: 'props', label: 'Photo props' },
	{ id: 'bottlelabels', label: 'Bottle labels' },
	{ id: 'stickers', label: 'Sticker sheet' },
];

// Which templates can use an image source (all render with colors too).
const USES_IMAGE = [
	'box',
	'tags',
	'toppers',
	'partyhat',
	'stickers',
	'cupcakewrap',
	'bottlelabels',
];
// Which templates carry text (font + size apply).
const HAS_FONT = [
	'bunting',
	'letterbanner',
	'tags',
	'toppers',
	'placecards',
	'strawflags',
	'props',
	'bottlelabels',
	'stickers',
];

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
	const dialog = el( 'div', 'dsm wpiepty-dialog', backdrop );
	dialog.onclick = ( e ) => e.stopPropagation();
	const head = el( 'div', 'dsm-head', dialog );
	const badge = el( 'span', 'dsm-badge', head );
	badge.innerHTML = ICON_BRAND;
	const titles = el( 'div', 'dsm-titles', head );
	el( 'span', 'dsm-title', titles, 'Party Printables' );
	el(
		'div',
		'dsm-sub',
		titles,
		t( 'Twelve printable party templates - as editable layers.' )
	);
	const closeBtn = el( 'button', 'dsm-x', head );
	closeBtn.innerHTML = '&times;';
	closeBtn.setAttribute( 'aria-label', t( 'Close' ) );

	const body = el( 'div', 'wpiepty-body', dialog );
	const view = el( 'div', 'wpiepty-view', body );
	const canvas = el( 'canvas', null, view );
	const side = el( 'div', 'wpiepty-side', body );
	const status = el( 'div', 'wpiepty-status', view );
	const setStatus = ( msg, isErr ) => {
		status.textContent = msg || '';
		status.classList.toggle( 'on', !! msg );
		status.classList.toggle( 'err', !! isErr );
	};

	const section = ( parent, icon, label ) => {
		const card = el( 'div', 'wpiepty-card', parent );
		const h = el( 'div', 'wpiepty-card-head', card );
		h.innerHTML = icon + '<span>' + label + '</span>';
		return el( 'div', 'wpiepty-card-body', card );
	};

	/* --------------------------- template cards --------------------------- */

	const modeSec = section( side, ICONS.template, t( 'Template' ) );
	const modeGrid = el( 'div', 'wpiepty-cards', modeSec );
	const modeTiles = new Map();
	for ( const m of MODES ) {
		const card = el( 'button', 'wpiepty-tcard', modeGrid );
		card.type = 'button';
		card.title = t( m.label );
		const thumb = el( 'canvas', 'wpiepty-tthumb', card );
		thumb.width = 132;
		thumb.height = 92;
		el( 'span', 'wpiepty-tlabel', card, t( m.label ) );
		card.onclick = () => {
			params.mode = m.id;
			syncUi();
			schedule();
		};
		modeTiles.set( m.id, { card, thumb } );
	}

	// Tiny live previews on the cards, rendered once with neutral
	// settings (no image, palette colors).
	function paintCardThumbs() {
		const like = document.createElement( 'canvas' );
		const opts = {
			paletteId: params.paletteId,
			colors: resolvedColors(),
			labels: { cut: t( 'Cut' ), fold: t( 'Fold' ) },
		};
		const renders = {
			bunting: () => bunting( like, { ...opts, text: 'ABC', perRow: 3 } ),
			letterbanner: () => letterBanner( like, { ...opts, text: 'AB' } ),
			box: () => boxDieline( like, { ...opts, ribbon: true } ),
			tags: () => giftTags( like, { ...opts, text: 'Danke' } ),
			toppers: () => cupcakeToppers( like, { ...opts, text: 'A' } ),
			cupcakewrap: () => cupcakeWrappers( like, opts ),
			placecards: () => placeCards( like, { ...opts, names: [ 'Mia' ] } ),
			strawflags: () => strawFlags( like, { ...opts, text: 'Hey' } ),
			partyhat: () => partyHat( like, opts ),
			props: () => photoProps( like, { ...opts, text: 'Hi!' } ),
			bottlelabels: () => bottleLabels( like, { ...opts, text: 'Aqua' } ),
			stickers: () =>
				stickerSheet( like, { ...opts, image: null, cols: 3 } ).canvas,
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

	/* ------------------------------- source ------------------------------- */

	const srcSec = section( side, ICONS.source, t( 'Source' ) );
	const srcSel = el( 'select', 'dsm-select wpiepty-wide', srcSec );
	const srcNote = el( 'div', 'wpiepty-info', srcSec );

	function fillSourceOptions() {
		srcSel.innerHTML = '';
		const add = ( v, label ) => {
			const o = el( 'option', null, srcSel );
			o.value = v;
			o.textContent = label;
		};
		add( 'none', t( 'Colors' ) );
		add( 'doc', t( 'Whole document' ) );
		const walk = ( layers, depth ) => {
			for ( const l of layers || [] ) {
				if ( 'group' === l.type ) {
					walk( l.children, depth + 1 );
					continue;
				}
				add(
					'layer:' + l.id,
					' '.repeat( depth * 2 ) + ( l.name || l.type )
				);
			}
		};
		walk( editor.state.layers, 0 );
		add( 'media', t( 'Media library…' ) );
	}
	fillSourceOptions();
	srcSel.value = [ 'none', 'doc', 'media' ].includes( params.source )
		? params.source
		: srcSel.querySelector( `option[value="${ params.source }"]` )
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
		const scale = Math.min( 1, 800 / img.width );
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
			if ( 'none' === desc ) {
				c = null;
			} else if ( 'media' === desc ) {
				if ( params.image && params.image.url ) {
					c = await urlToCanvas( params.image.url );
					srcNote.textContent = params.image.title || '';
				}
			} else if ( 'doc' === desc ) {
				c = await bridge.raster.renderToCanvas(
					editor.state.doc,
					editor.state.layers,
					{ scale: Math.min( 1, 800 / editor.state.doc.w ) }
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
						{ scale: Math.min( 1, 800 / editor.state.doc.w ) }
					);
					srcNote.textContent = target.name || '';
				}
			}
			c = flattenWhite( c );
			if ( token === srcToken ) {
				srcCanvas = c;
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
	const palWrap = el( 'div', 'wpiepty-pals', colSec );
	const palBtns = new Map();
	for ( const p of PALETTES ) {
		const b = el( 'button', 'wpiepty-pal', palWrap );
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
	if ( brandKits.length ) {
		const brandLbl = el( 'label', 'wpiepty-check', colSec );
		const brandCb = el( 'input', null, brandLbl );
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

	// Up to four custom colors via the editor's own picker. The mounted
	// color button is a controlled component: call handle.set() with
	// every change or the swatch snaps back visually.
	const customRow = el( 'div', 'wpiepty-row wpiepty-customrow', colSec );
	el( 'span', null, customRow ).textContent = t( 'Custom colors' );
	const customWrap = el( 'span', 'wpiepty-customs', customRow );
	const mountSwatch = bridge.components && bridge.components.mountColorButton;
	const customCtls = [];
	for ( let i = 0; i < 4; i++ ) {
		const slot = el( 'span', 'wpiepty-swatch', customWrap );
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
			customCtls.push( {
				set: ( hex ) => ( input.value = hex ),
			} );
		}
	}
	const resetBtn = el( 'button', 'wpiepty-reset', customRow );
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

	const resolvedColors = () =>
		colorsFor( {
			customColors: params.customColors,
			brandColors: brandColors(),
			paletteId: params.paletteId,
		} );

	let thumbTimer = 0;
	const refreshThumbs = () => {
		window.clearTimeout( thumbTimer );
		thumbTimer = window.setTimeout( paintCardThumbs, 120 );
	};

	/* ------------------------------ settings ------------------------------ */

	const setSec = section( side, ICONS.settings, t( 'Settings' ) );
	// Multi-line inputs: line breaks reach the engine (extra rows on the
	// bunting, stacked lines on tags, flags, labels and stickers).
	const textRow = el( 'label', 'wpiepty-text-row', setSec );
	el( 'span', null, textRow ).textContent = t( 'Text' );
	const textInput = el( 'textarea', 'wpiepty-names', textRow );
	textInput.rows = 2;
	textInput.value = params.text;
	textInput.oninput = () => {
		params.text = textInput.value;
		schedule();
	};
	const tagRow = el( 'label', 'wpiepty-text-row', setSec );
	el( 'span', null, tagRow ).textContent = t( 'Tag text' );
	const tagInput = el( 'textarea', 'wpiepty-names', tagRow );
	tagInput.rows = 2;
	tagInput.value = params.tagText;
	tagInput.oninput = () => {
		params.tagText = tagInput.value;
		schedule();
	};
	const namesRow = el( 'label', 'wpiepty-text-row', setSec );
	el( 'span', null, namesRow ).textContent = t( 'Names (one per line)' );
	const namesArea = el( 'textarea', 'wpiepty-names', namesRow );
	namesArea.rows = 4;
	namesArea.value = params.names;
	namesArea.oninput = () => {
		params.names = namesArea.value;
		schedule();
	};
	// Typography: the editor's font catalog plus a size factor - for
	// every template that carries text.
	const fontRow = el( 'div', 'wpiepty-text-row', setSec );
	el( 'span', null, fontRow ).textContent = t( 'Font' );
	const fontMount = el( 'div', null, fontRow );
	let fontCtl = null;
	const onFont = ( fam ) => {
		params.font = ! fam || 'System' === fam ? '' : fam;
		if ( params.font && bridge.fonts && bridge.fonts.ensureFont ) {
			bridge.fonts
				.ensureFont( params.font, 700 )
				.then( () => {
					refreshThumbs();
					schedule();
				} )
				.catch( schedule );
		} else {
			refreshThumbs();
			schedule();
		}
	};
	if ( bridge.components && bridge.components.mountFontPicker ) {
		fontCtl = bridge.components.mountFontPicker( fontMount, {
			value: params.font || 'Montserrat',
			onChange: onFont,
		} );
	} else {
		const fontSel = el( 'select', 'dsm-select wpiepty-wide', fontMount );
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
		60,
		160,
		() => params.textScale,
		( v ) => ( params.textScale = v ),
		'%'
	);
	const shapeRow = el( 'label', 'wpiepty-row', setSec );
	el( 'span', null, shapeRow ).textContent = t( 'Shape' );
	const shapeSel = el( 'select', 'dsm-select', shapeRow );
	for ( const [ v, l ] of [
		[ 'triangle', t( 'Triangle' ) ],
		[ 'swallow', t( 'Swallowtail' ) ],
		[ 'flag', t( 'Flag' ) ],
		[ 'scallop', t( 'Scallop' ) ],
	] ) {
		const o = el( 'option', null, shapeSel );
		o.value = v;
		o.textContent = l;
	}
	shapeSel.value = params.shape;
	shapeSel.onchange = () => {
		params.shape = shapeSel.value;
		schedule();
	};
	const spanRow = el( 'label', 'wpiepty-row', setSec );
	el( 'span', null, spanRow ).textContent = t( 'Image on the box' );
	const spanSel = el( 'select', 'dsm-select', spanRow );
	for ( const [ v, l ] of [
		[ 'face', t( 'Each face' ) ],
		[ 'net', t( 'Across the whole box' ) ],
	] ) {
		const o = el( 'option', null, spanSel );
		o.value = v;
		o.textContent = l;
	}
	spanSel.value = params.imageSpan;
	spanSel.onchange = () => {
		params.imageSpan = spanSel.value;
		schedule();
	};
	const checkRow = ( label, get, set ) => {
		const row = el( 'label', 'wpiepty-check', setSec );
		const cb = el( 'input', null, row );
		cb.type = 'checkbox';
		cb.checked = !! get();
		el( 'span', null, row ).textContent = label;
		cb.onchange = () => {
			set( cb.checked );
			schedule();
		};
		return row;
	};
	const ribbonRow = checkRow(
		t( 'Ribbon band' ),
		() => params.ribbon,
		( v ) => ( params.ribbon = v )
	);
	const decorRow = el( 'label', 'wpiepty-row', setSec );
	el( 'span', null, decorRow ).textContent = t( 'Decor' );
	const decorSel = el( 'select', 'dsm-select', decorRow );
	for ( const [ v, l ] of [
		[ 'stripes', t( 'Stripes' ) ],
		[ 'dots', t( 'Dots' ) ],
		[ 'solid', t( 'Solid' ) ],
	] ) {
		const o = el( 'option', null, decorSel );
		o.value = v;
		o.textContent = l;
	}
	decorSel.value = params.decor;
	decorSel.onchange = () => {
		params.decor = decorSel.value;
		syncUi();
		schedule();
	};
	const stripesRow = sliderRowIn(
		setSec,
		t( 'Stripe count' ),
		5,
		14,
		() => params.stripeCount,
		( v ) => ( params.stripeCount = v )
	);
	const scallopRow = checkRow(
		t( 'Scalloped edge' ),
		() => params.scallop,
		( v ) => ( params.scallop = v )
	);
	function sliderRowIn( parent, label, min, max, get, set, unit ) {
		const row = el( 'label', 'wpiepty-row', parent );
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
	const perRowRow = sliderRowIn(
		setSec,
		t( 'Per row' ),
		4,
		12,
		() => params.perRow,
		( v ) => ( params.perRow = v )
	);
	const stShapeRow = el( 'label', 'wpiepty-row', setSec );
	el( 'span', null, stShapeRow ).textContent = t( 'Shape' );
	const stShapeSel = el( 'select', 'dsm-select', stShapeRow );
	const SHAPE_LABELS = {
		circle: t( 'Circle' ),
		rounded: t( 'Rounded' ),
		square: t( 'Square' ),
		heart: t( 'Heart' ),
		star: t( 'Star' ),
		oval: t( 'Oval' ),
		hexagon: t( 'Hexagon' ),
		flower: t( 'Flower' ),
	};
	for ( const v of STICKER_SHAPES ) {
		const o = el( 'option', null, stShapeSel );
		o.value = v;
		o.textContent = SHAPE_LABELS[ v ] || v;
	}
	stShapeSel.value = params.stickerShape;
	stShapeSel.onchange = () => {
		params.stickerShape = stShapeSel.value;
		schedule();
	};
	const colsRow = sliderRowIn(
		setSec,
		t( 'Columns' ),
		2,
		6,
		() => params.cols,
		( v ) => ( params.cols = v )
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
		const m = params.mode;
		const img = USES_IMAGE.includes( m ) && srcCanvas;
		textRow.style.display = [
			'bunting',
			'letterbanner',
			'strawflags',
			'props',
			'bottlelabels',
		].includes( m )
			? ''
			: 'none';
		tagRow.style.display =
			[ 'tags', 'toppers' ].includes( m ) || ( 'stickers' === m && ! img )
				? ''
				: 'none';
		namesRow.style.display = 'placecards' === m ? '' : 'none';
		fontRow.style.display = HAS_FONT.includes( m ) ? '' : 'none';
		sizeRow.style.display = HAS_FONT.includes( m ) ? '' : 'none';
		shapeRow.style.display = 'bunting' === m ? '' : 'none';
		perRowRow.style.display = 'bunting' === m ? '' : 'none';
		spanRow.style.display = 'box' === m && img ? '' : 'none';
		ribbonRow.style.display = 'box' === m ? '' : 'none';
		decorRow.style.display = 'partyhat' === m && ! img ? '' : 'none';
		stripesRow.style.display =
			'partyhat' === m && ! img && 'stripes' === params.decor
				? ''
				: 'none';
		scallopRow.style.display = 'cupcakewrap' === m ? '' : 'none';
		stShapeRow.style.display = 'stickers' === m ? '' : 'none';
		colsRow.style.display = 'stickers' === m ? '' : 'none';
		srcSec.parentElement.style.display = USES_IMAGE.includes( m )
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
	apply.textContent = editing ? t( 'Update sheet' ) : t( 'Insert sheet' );

	/* ------------------------------- painting ----------------------------- */

	function bake() {
		const like = document.createElement( 'canvas' );
		const colors = resolvedColors();
		const img = USES_IMAGE.includes( params.mode ) ? srcCanvas : null;
		const common = {
			colors,
			paletteId: params.paletteId,
			font: params.font,
			textScale: params.textScale,
		};
		switch ( params.mode ) {
			case 'bunting':
				return bunting( like, {
					...common,
					text: params.text,
					shape: params.shape,
					perRow: params.perRow,
				} );
			case 'letterbanner':
				return letterBanner( like, { ...common, text: params.text } );
			case 'box':
				return boxDieline( like, {
					...common,
					image: img,
					imageSpan: params.imageSpan,
					ribbon: params.ribbon,
					labels: { cut: t( 'Cut' ), fold: t( 'Fold' ) },
				} );
			case 'tags':
				return giftTags( like, {
					...common,
					image: img,
					text: params.tagText,
				} );
			case 'toppers':
				return cupcakeToppers( like, {
					...common,
					image: img,
					text: params.tagText,
				} );
			case 'cupcakewrap':
				return cupcakeWrappers( like, {
					...common,
					image: img,
					scallop: params.scallop,
				} );
			case 'placecards':
				return placeCards( like, {
					...common,
					names: params.names.split( /\n+/ ),
				} );
			case 'strawflags':
				return strawFlags( like, { ...common, text: params.text } );
			case 'partyhat':
				return partyHat( like, {
					...common,
					image: img,
					decor: params.decor,
					stripeCount: params.stripeCount,
				} );
			case 'props':
				return photoProps( like, { ...common, text: params.text } );
			case 'bottlelabels':
				return bottleLabels( like, {
					...common,
					image: img,
					text: params.text,
				} );
			default:
				return stickerSheet( like, {
					...common,
					image: img,
					shape: params.stickerShape,
					cols: params.cols,
					text: params.tagText,
				} ).canvas;
		}
	}

	let timer = 0;
	function schedule() {
		window.clearTimeout( timer );
		timer = window.setTimeout( paintNow, 100 );
	}
	function paintNow() {
		syncUi();
		const baked = bake();
		apply.disabled = ! baked;
		if ( ! baked ) {
			canvas.width = 10;
			canvas.height = 10;
			return;
		}
		setStatus( '' );
		const maxW = Math.max( 200, view.clientWidth - 36 );
		const maxH = Math.max( 200, view.clientHeight - 36 );
		const s = Math.min( maxW / baked.width, maxH / baked.height, 1 );
		canvas.width = Math.round( baked.width * s );
		canvas.height = Math.round( baked.height * s );
		canvas
			.getContext( '2d' )
			.drawImage( baked, 0, 0, canvas.width, canvas.height );
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
		apply.disabled = true;
		setStatus( t( 'Rendering the sheet' ) );
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
				editor.commit( t( 'Update sheet' ) );
			} else {
				const imgLayer = bridge.documents.makeImage( {
					name: `${ t( 'Sheet' ) } ${ t(
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
				editor.dispatch( { type: 'SET_ACTIVE', id: imgLayer.id } );
				editor.commit( t( 'Insert sheet' ) );
			}
			setStatus( t( 'Inserted.' ) );
			close();
		} catch ( e ) {
			setStatus(
				e && e.message ? e.message : t( 'Could not insert the sheet.' ),
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
		schedule();
		loadSource();
		if ( params.font && bridge.fonts && bridge.fonts.ensureFont ) {
			bridge.fonts
				.ensureFont( params.font, 700 )
				.then( () => {
					refreshThumbs();
					schedule();
				} )
				.catch( () => {} );
		}
	} );
}

/* -------------------------------- register ------------------------------- */

function register( api ) {
	api.registerGenerator( {
		id: GEN_ID,
		label: 'Party Printables',
		run: ( ctx ) => openStudio( ctx ),
		edit: ( ctx ) => openStudio( ctx ),
	} );
}

if ( window.WPIE && window.WPIE.api ) {
	register( window.WPIE.api );
} else {
	window.wp.hooks.addAction(
		'wpie.ready',
		'wpie-party-printables',
		register
	);
}
