/**
 * Party Printables: printable party items on a real sheet, in a theme,
 * inserted as an editable vector group. The dialog is the house form
 * (bridge.ui, three columns); the picture comes from renderSheet() in
 * items.js. Photos are rendered by the editor and cut to shape here.
 */
import { t } from './i18n.js';
import { ITEMS, renderSheet, itemById } from './items.js';
import { normalizeParams, itemDefaults } from './model.js';
import { STARTERS, starterById } from './starters.js';
import { resolveTheme } from './engine/theme.js';
import { sheetSize } from './engine/units.js';
import { embedFonts } from './engine/fonts-embed.js';
import { buildLeft } from './ui/left.js';
import { buildView } from './ui/view.js';
import { buildMaterial } from './ui/material.js';
import { buildSide } from './ui/side.js';

export const GEN_ID = 'wpie-party-printables/sheet';
const SLUG = 'wpie-party-printables';

/* Text widths from a canvas; the engines fit labels with these. */
let measureCtx = null;
function measure( text, size, font, weight = 400, italic = false ) {
	if ( ! measureCtx ) {
		measureCtx = document.createElement( 'canvas' ).getContext( '2d' );
	}
	const fam = /[\s"']/.test( font )
		? '"' + String( font ).replace( /"/g, '' ) + '"'
		: font;
	measureCtx.font =
		( italic ? 'italic ' : '' ) +
		( weight || 400 ) +
		' ' +
		size +
		'px ' +
		fam +
		', Arial, sans-serif';
	return measureCtx.measureText( text ).width;
}

function brandKits( bridge ) {
	try {
		const k =
			bridge && bridge.brand && bridge.brand.kits
				? bridge.brand.kits()
				: [];
		return Array.isArray( k ) ? k : [];
	} catch ( e ) {
		return [];
	}
}

/* --------------------------------- studio --------------------------------- */

function openStudio( ctx ) {
	const editor = ctx.editor;
	const extras = ctx.extras;
	const layer = ctx.layer;
	const bridge = window.WPIE && window.WPIE.bridge;
	const ui = bridge && bridge.ui;
	const toast = ( m, kind ) =>
		extras &&
		extras.toasts &&
		( extras.toasts[ kind || 'success' ] || extras.toasts.success )( m );
	if ( ! ui || ! ui.dialog ) {
		toast( t( 'Party Printables needs a newer WunderPaint.' ), 'error' );
		return;
	}
	const editing = !! (
		layer &&
		layer.generator &&
		layer.generator.id === GEN_ID
	);
	const first = starterById( 'birthday-kids-bunting' ) || STARTERS[ 0 ];
	const params = normalizeParams(
		editing ? layer.generator.params : first.params
	);
	const S = {
		params,
		starter: editing ? null : first.id,
		filter: 'all',
		last: null,
		status: '',
		busy: false,
		token: 0,
		timer: 0,
		showDoc: false,
		editing,
		layer,
		frames: 0,
		setDoc: true,
		photoCache: new Map(),
	};
	const env = {
		t,
		kits: brandKits( bridge ),
		measure,
		photo: ( p, def, box ) => photoFor( p, def, box ),
		photos: ( p, def, box ) => photosFor( p, def, box ),
	};

	const modal = ui.dialog( {
		title: 'Party Printables',
		subtitle: t(
			'Printable party items on a real sheet, in one theme, inserted as editable vectors.'
		),
		width: 1400,
		onClose: () => cleanup(),
	} );
	modal.dialog.classList.add( 'wpiepp-dialog' );
	// Die Marke kommt aus dem Kit (bridge.ui), nicht aus dem Paket.
	ui.badge( modal );
	const body = ui.el( 'div', 'wpiepp-body', modal.body );
	const left = ui.el( 'div', 'wpiepp-left', body );
	const mid = ui.el( 'div', 'wpiepp-mid', body );
	const side = ui.el( 'div', 'wpiepp-side', body );

	const view = buildView( mid, { ui, t, onToggleDoc: () => toggleDoc() } );
	const matUi = buildMaterial( mid, {
		S,
		ui,
		bridge,
		t,
		onChange: () => queue(),
		onPhoto: () => {
			S.photoCache.clear();
			queue( 0 );
		},
	} );
	const leftUi = buildLeft( left, {
		S,
		ui,
		t,
		modal,
		onItem: ( type ) => chooseItem( type ),
		onStarter: ( id ) => loadStarter( id ),
	} );
	const sideUi = buildSide( side, {
		S,
		ui,
		bridge,
		t,
		onChange: () => queue(),
		onRebuild: () => {
			matUi.refresh();
			sideUi.rebuild();
			queue( 0 );
		},
	} );

	const status = ui.el( 'div', 'dsm-mono', modal.foot, '' );
	const foot = ui.el( 'div', 'dsm-actions', modal.foot );
	ui.btn( foot, {
		label: t( 'Cancel' ),
		onClick: () => {
			cleanup();
			modal.close();
		},
	} );
	const insertBtn = ui.btn( foot, {
		label: editing ? t( 'Update' ) : t( 'Insert' ),
		primary: true,
		onClick: () => insert(),
	} );
	insertBtn.classList.add( 'wpiepp-insert' );

	function setStatus( msg, bad ) {
		S.status = msg || '';
		status.textContent = S.status;
		status.classList.toggle( 'is-bad', !! bad );
	}

	function chooseItem( type ) {
		if ( ! ITEMS[ type ] ) {
			return;
		}
		const keep = S.params.item;
		const fresh = itemDefaults( type );
		S.params.item = {
			...fresh,
			text: keep.text && ITEMS[ type ].uses.text ? keep.text : fresh.text,
		};
		// A wide piece that fits the sheet only sideways turns the sheet.
		const sh = S.params.sheet;
		const size = sheetSize( sh );
		const pw = fresh.w || 0;
		if (
			pw &&
			fresh.h &&
			pw > fresh.h &&
			pw > size.w - 2 * sh.margin &&
			pw <= size.h - 2 * sh.margin &&
			! sh.landscape
		) {
			sh.landscape = true;
		}
		S.params.sheet.page = 1;
		S.starter = null;
		refreshAll();
	}

	function loadStarter( id ) {
		const s = starterById( id );
		if ( ! s ) {
			return;
		}
		// A starter brings its item and theme; the event data the user typed stays.
		const p = normalizeParams( s.params );
		const typed = Object.fromEntries(
			Object.entries( S.params.event ).filter( ( [ , v ] ) =>
				Array.isArray( v ) ? v.length : v
			)
		);
		p.event = { ...p.event, ...typed };
		S.params = p;
		S.starter = id;
		S.photoCache.clear();
		refreshAll();
	}

	function refreshAll() {
		leftUi.refresh();
		matUi.refresh();
		sideUi.rebuild();
		queue( 0 );
	}

	function queue( delay = 250 ) {
		clearTimeout( S.timer );
		S.timer = setTimeout( () => render(), delay );
	}
	async function render() {
		const my = ++S.token;
		S.busy = true;
		try {
			const res = await renderSheet( S.params, env );
			res.svg = await embedFonts(
				res.svg,
				familiesOf( S.params ),
				bridge
			);
			if ( my !== S.token ) {
				return;
			}
			S.last = res;
			matUi.setWarnings( res.warnings );
			sideUi.setPages( res.pages, res.page );
			await view.show( res );
			if ( res.warnings && res.warnings.length ) {
				setStatus( res.warnings.join( ' · ' ), true );
			} else {
				const def = itemById( S.params.item.type );
				setStatus(
					Math.round( res.sheet.w ) +
						' × ' +
						Math.round( res.sheet.h ) +
						' mm · ' +
						res.count +
						' × ' +
						t( def.label ) +
						( res.pages > 1
							? ' · ' +
							  t( 'Sheet' ) +
							  ' ' +
							  res.page +
							  '/' +
							  res.pages
							: '' ),
					false
				);
			}
		} catch ( e ) {
			if ( my === S.token ) {
				setStatus( ( e && e.message ) || String( e ), true );
			}
		} finally {
			if ( my === S.token ) {
				S.busy = false;
				S.frames++;
			}
		}
	}

	/* ------------------------------- photos ------------------------------- */

	async function sourceCanvas( photo ) {
		if ( 'media' === photo.source && photo.url ) {
			const img = await new Promise( ( ok, bad ) => {
				const i = new Image();
				i.crossOrigin = 'anonymous';
				i.onload = () => ok( i );
				i.onerror = () => bad( new Error( 'image' ) );
				i.src = photo.url;
			} );
			const c = document.createElement( 'canvas' );
			c.width = img.naturalWidth || img.width;
			c.height = img.naturalHeight || img.height;
			c.getContext( '2d' ).drawImage( img, 0, 0 );
			return c;
		}
		if (
			! (
				bridge.raster &&
				bridge.raster.renderToCanvas &&
				editor.state &&
				editor.state.doc
			)
		) {
			return null;
		}
		const doc = editor.state.doc;
		let layers = editor.state.layers || [];
		if ( S.editing ) {
			layers = layers.filter(
				( l ) => ! ( l.id === layer.id || l.parent === layer.id )
			);
		}
		if ( 'selection' === photo.source ) {
			const active = editor.state.activeId || editor.state.active;
			const sel = layers.filter(
				( l ) => l.id === active || l.parent === active
			);
			if ( ! sel.length ) {
				return null;
			}
			layers = sel;
		}
		return bridge.raster.renderToCanvas( doc, layers, {
			scale: Math.min( 1, 1200 / Math.max( doc.w, doc.h ) ),
			cache: bridge.raster.sharedImageCache,
		} );
	}

	/** The photo cut to the item's box: a PNG data URL, cached per source and box. */
	async function photoFor( photo, def, box ) {
		if ( ! photo || 'none' === photo.source ) {
			return null;
		}
		const key =
			photo.source +
			':' +
			( photo.id || photo.url || '' ) +
			':' +
			( box ? box.d || box.w + 'x' + box.h : 'raw' );
		if ( S.photoCache.has( key ) ) {
			return S.photoCache.get( key );
		}
		const src = await sourceCanvas( photo );
		if ( ! src ) {
			return null;
		}
		const w = box ? box.w : src.width;
		const h = box ? box.h : src.height;
		const k = 600 / Math.max( w, h );
		const c = document.createElement( 'canvas' );
		c.width = Math.max( 1, Math.round( w * k ) );
		c.height = Math.max( 1, Math.round( h * k ) );
		const g = c.getContext( '2d' );
		if ( box && box.d ) {
			g.save();
			g.scale( k, k );
			g.clip( new window.Path2D( box.d ) );
			g.scale( 1 / k, 1 / k );
		}
		const s = Math.max( c.width / src.width, c.height / src.height );
		const dw = src.width * s;
		const dh = src.height * s;
		g.drawImage( src, ( c.width - dw ) / 2, ( c.height - dh ) / 2, dw, dh );
		if ( box && box.d ) {
			g.restore();
		}
		const url = c.toDataURL( 'image/png' );
		S.photoCache.set( key, url );
		return url;
	}

	/** Several photos (memory, quartet): every chosen Media Library item, or the document once. */
	async function photosFor( photo, def, box ) {
		if ( ! photo || 'none' === photo.source ) {
			return [];
		}
		if ( 'media' === photo.source ) {
			const out = [];
			for ( const it of photo.items || [] ) {
				if ( it && it.url ) {
					out.push(
						await photoFor(
							{ source: 'media', id: it.id, url: it.url },
							def,
							box
						)
					);
				}
			}
			return out.filter( Boolean );
		}
		const one = await photoFor( photo, def, box );
		return one ? [ one ] : [];
	}

	function toggleDoc() {
		S.showDoc = ! S.showDoc;
		if (
			! S.showDoc ||
			! (
				bridge.raster &&
				bridge.raster.renderToCanvas &&
				editor.state &&
				editor.state.doc
			)
		) {
			view.setDoc( null );
			return;
		}
		const doc = editor.state.doc;
		bridge.raster
			.renderToCanvas(
				doc,
				( editor.state.layers || [] ).filter(
					( l ) =>
						! (
							S.editing &&
							( l.id === layer.id || l.parent === layer.id )
						)
				),
				{
					scale: Math.min( 1, 1400 / Math.max( doc.w, doc.h ) ),
					cache: bridge.raster.sharedImageCache,
				}
			)
			.then( ( c ) => {
				const bg = document.createElement( 'canvas' );
				bg.width = c.width;
				bg.height = c.height;
				const g = bg.getContext( '2d' );
				g.fillStyle = doc.bg || '#ffffff';
				g.fillRect( 0, 0, bg.width, bg.height );
				g.drawImage( c, 0, 0 );
				view.setDoc( bg.toDataURL() );
			} )
			.catch( () => view.setDoc( null ) );
	}

	/* ------------------------------- insert ------------------------------- */

	/** The two font families a sheet uses (display and text). */
	function familiesOf( p ) {
		const theme = resolveTheme( p.theme, env.kits );
		return [ theme.displayFont, theme.textFont ];
	}

	/** The SVG drawn at full size (300 dpi) as a PNG data URL. */
	function rasterize( svg, w, h ) {
		return new Promise( ( ok, bad ) => {
			const img = new Image();
			img.onload = () => {
				const c = document.createElement( 'canvas' );
				c.width = w;
				c.height = h;
				c.getContext( '2d' ).drawImage( img, 0, 0, w, h );
				ok( c.toDataURL( 'image/png' ) );
			};
			img.onerror = () =>
				bad( new Error( t( 'The sheet could not be drawn.' ) ) );
			img.src =
				'data:image/svg+xml;charset=utf-8,' + encodeURIComponent( svg );
		} );
	}

	/**
	 * Insert: every sheet as a 300 dpi image. Sheet one lands in the open
	 * document (which takes the sheet size unless the option is off), the
	 * other sheets become pages of their own. Editing replaces the image of
	 * the sheet the layer holds.
	 */
	async function insert() {
		if ( ! S.last || S.busy ) {
			return;
		}
		S.busy = true;
		insertBtn.disabled = true;
		setStatus( t( 'Drawing the sheets' ), false );
		try {
			const stored = normalizeParams( S.params );
			const families = familiesOf( S.params );
			const pages = S.editing ? 1 : S.last.pages || 1;
			const sheets = [];
			for ( let p = 1; p <= pages; p++ ) {
				const page = S.editing ? S.last.page : p;
				let res = S.last;
				if ( page !== S.last.page ) {
					res = await renderSheet(
						{ ...S.params, sheet: { ...S.params.sheet, page } },
						env
					);
					res.svg = await embedFonts( res.svg, families, bridge );
				}
				sheets.push( {
					page,
					w: res.width,
					h: res.height,
					src: await rasterize( res.svg, res.width, res.height ),
				} );
			}
			const sheet0 = sheets[ 0 ];
			const paramsFor = ( page ) => ( {
				...stored,
				sheet: { ...stored.sheet, page },
			} );
			const nameFor = ( page ) =>
				'Party Printables' +
				( pages > 1 ? ' ' + page + '/' + pages : '' );
			if ( S.editing ) {
				const box = fitBox(
					boundsOf( layer, editor.state.layers ),
					sheet0.w,
					sheet0.h
				);
				editor.dispatch( {
					type: 'UPDATE_LAYER',
					id: layer.id,
					patch: {
						src: sheet0.src,
						...box,
						naturalW: sheet0.w,
						naturalH: sheet0.h,
						generator: {
							id: GEN_ID,
							params: paramsFor( sheet0.page ),
						},
					},
				} );
				editor.commit( t( 'Update sheet' ) );
				cleanup();
				modal.close();
				return;
			}
			let doc = editor.state.doc;
			if ( S.setDoc ) {
				doc = { ...doc, w: sheet0.w, h: sheet0.h };
				editor.dispatch( { type: 'SET_DOC', doc } );
			}
			const box = S.setDoc
				? { x: 0, y: 0, w: sheet0.w, h: sheet0.h }
				: fitBox(
						{ x: 0, y: 0, w: doc.w, h: doc.h },
						sheet0.w,
						sheet0.h,
						0.96
				  );
			const nl = bridge.documents.makeImage( {
				name: nameFor( sheet0.page ),
				...box,
				src: sheet0.src,
				naturalW: sheet0.w,
				naturalH: sheet0.h,
			} );
			nl.generator = { id: GEN_ID, params: paramsFor( sheet0.page ) };
			editor.dispatch( { type: 'ADD_LAYER', layer: nl } );
			editor.dispatch( { type: 'SET_ACTIVE', id: nl.id } );
			editor.commit( t( 'Insert sheet' ) );
			if ( sheets.length > 1 ) {
				// The open document is the current page; every further sheet is a page after it.
				const serialize =
					bridge.documents.serializeLayers || ( ( l ) => l );
				const state = editor.state;
				const current =
					state.pages && state.pages.list
						? state.pages.current || 0
						: 0;
				const list =
					state.pages && state.pages.list
						? [ ...state.pages.list ]
						: [ null ];
				list[ current ] = {
					doc: { ...doc },
					layers: serialize( [
						...( state.layers || [] ).filter(
							( l ) => l.id !== nl.id
						),
						nl,
					] ),
				};
				const extra = sheets.slice( 1 ).map( ( sh ) => {
					const pl = bridge.documents.makeImage( {
						name: nameFor( sh.page ),
						x: 0,
						y: 0,
						w: sh.w,
						h: sh.h,
						src: sh.src,
						naturalW: sh.w,
						naturalH: sh.h,
					} );
					pl.generator = { id: GEN_ID, params: paramsFor( sh.page ) };
					return {
						doc: { ...doc, w: sh.w, h: sh.h },
						layers: serialize( [ pl ] ),
					};
				} );
				list.splice( current + 1, 0, ...extra );
				editor.dispatch( { type: 'SET_PAGES', pages: list, current } );
			}
			cleanup();
			modal.close();
		} catch ( e ) {
			setStatus( ( e && e.message ) || String( e ), true );
		} finally {
			S.busy = false;
			insertBtn.disabled = false;
		}
	}

	/** A w x h picture fitted into a box, centred. */
	function fitBox( into, w, h, share = 1 ) {
		const fit = Math.min( ( into.w * share ) / w, ( into.h * share ) / h );
		const fw = Math.round( w * fit );
		const fh = Math.round( h * fit );
		return {
			x: Math.round( into.x + ( into.w - fw ) / 2 ),
			y: Math.round( into.y + ( into.h - fh ) / 2 ),
			w: fw,
			h: fh,
		};
	}

	function boundsOf( l, layers ) {
		const kids = ( layers || [] ).filter( ( x ) => x.parent === l.id );
		if ( ! kids.length ) {
			return { x: l.x || 0, y: l.y || 0, w: l.w || 100, h: l.h || 100 };
		}
		const x0 = Math.min( ...kids.map( ( k ) => k.x ) );
		const y0 = Math.min( ...kids.map( ( k ) => k.y ) );
		const x1 = Math.max( ...kids.map( ( k ) => k.x + k.w ) );
		const y1 = Math.max( ...kids.map( ( k ) => k.y + k.h ) );
		return {
			x: x0,
			y: y0,
			w: Math.max( 1, x1 - x0 ),
			h: Math.max( 1, y1 - y0 ),
		};
	}

	function cleanup() {
		clearTimeout( S.timer );
		S.token++;
		matUi.unmountAll();
		sideUi.unmountAll();
		window.__wpieppState = null;
		window.__wpieppProof = null;
	}

	window.__wpieppState = () => ( {
		params: S.params,
		item: S.params.item.type,
		starter: S.starter,
		last: S.last
			? {
					width: S.last.width,
					height: S.last.height,
					count: S.last.count,
					pages: S.last.pages,
					page: S.last.page,
					pieces: S.last.pieces,
					warnings: S.last.warnings,
					svg: S.last.svg,
			  }
			: null,
		status: S.status,
		busy: S.busy,
		frames: S.frames,
		editing: S.editing,
	} );
	window.__wpieppProof = {
		starters: STARTERS.map( ( s ) => ( {
			id: s.id,
			name: s.name,
			occasion: s.params.theme && s.params.theme.occasion,
		} ) ),
		render: ( id ) =>
			renderSheet( normalizeParams( starterById( id ).params ), env ),
		load: ( id ) => loadStarter( id ),
		open: ( p ) => {
			S.params = normalizeParams( p );
			S.starter = null;
			refreshAll();
		},
	};

	refreshAll();
	setTimeout( () => view.fit(), 50 );
}

/* ------------------------- dynamic pictures (resolve) ----------------------- */

async function resolveSheet( args ) {
	const params = args && args.params;
	const expandTokens = args && args.expandTokens;
	const hasTokens = args && args.hasTokens;
	if ( ! params || ! expandTokens || ! hasTokens ) {
		return null;
	}
	const p = normalizeParams( params );
	let any = false;
	const expand = ( obj, key ) => {
		if ( 'string' === typeof obj[ key ] && hasTokens( obj[ key ] ) ) {
			obj[ key ] = expandTokens( obj[ key ] );
			any = true;
		}
	};
	for ( const k of [
		'title',
		'subtitle',
		'date',
		'time',
		'place',
		'host',
		'note',
	] ) {
		expand( p.event, k );
	}
	p.event.names = p.event.names.map( ( n ) => {
		if ( hasTokens( n ) ) {
			any = true;
			return expandTokens( n );
		}
		return n;
	} );
	expand( p.item, 'text' );
	if ( ! any ) {
		return null;
	}
	const bridge = window.WPIE && window.WPIE.bridge;
	const env = { t, kits: brandKits( bridge ), measure, photo: null };
	const res = await renderSheet( p, env );
	const img = await new Promise( ( ok, bad ) => {
		const i = new Image();
		i.onload = () => ok( i );
		i.onerror = () => bad( new Error( 'The sheet could not be drawn.' ) );
		i.src =
			'data:image/svg+xml;charset=utf-8,' + encodeURIComponent( res.svg );
	} );
	const c = document.createElement( 'canvas' );
	c.width = res.width;
	c.height = res.height;
	c.getContext( '2d' ).drawImage( img, 0, 0 );
	return {
		src: c.toDataURL( 'image/png' ),
		naturalW: c.width,
		naturalH: c.height,
	};
}

function register( api ) {
	api.registerGenerator( {
		id: GEN_ID,
		label: 'Party Printables',
		run: ( ctx ) => openStudio( ctx ),
		edit: ( ctx ) => openStudio( ctx ),
		resolve: ( a ) => resolveSheet( a ),
	} );
}

if ( window.WPIE && window.WPIE.api ) {
	register( window.WPIE.api );
} else if ( window.wp && window.wp.hooks ) {
	window.wp.hooks.addAction( 'wpie.ready', SLUG, register );
}

export { ITEMS };
