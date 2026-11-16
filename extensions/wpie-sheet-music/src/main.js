/**
 * Sheet Music: scores, chord sheets, chord diagrams and fretboard maps
 * from the user's own material, inserted as an editable vector group.
 * The dialog follows the house form (bridge.ui, three columns); every
 * picture comes from a card's pure render function in cards.js.
 */
import { captureAround } from '../../shared/doc-preview.js';
import { t } from './i18n.js';
import { CARDS, cardById, normalizeParams } from './cards.js';
import { STARTERS, starterById } from './starters.js';
import { renderScore } from './engine/abc.js';
import { unzipMxl } from './engine/mxl.js';
import { ensureXml2abc, convertMusicXml } from './engine/xml2abc.js';
import { normalizeTextAnchors } from './engine/svg-dom.js';
import { buildLeft } from './ui/left.js';
import { buildView } from './ui/view.js';
import { buildSide } from './ui/side.js';
import { studioUndo } from '../../shared/studio-undo.js';

export const GEN_ID = 'wpie-sheet-music/sheet';
const SLUG = 'wpie-sheet-music';

/** Own folder URL and version from the boot payload. */
function ownEntry() {
	const boot = window.WPIE || {};
	return (
		( boot.extensions || [] ).find( ( e ) => e && SLUG === e.slug ) || null
	);
}
function baseUrl() {
	const own = ownEntry();
	return own && own.main
		? String( own.main ).replace( /extension\.js([?#].*)?$/, '' )
		: '';
}

let measureCtx = null;
function measure( text, size, font ) {
	if ( ! measureCtx ) {
		measureCtx = document.createElement( 'canvas' ).getContext( '2d' );
	}
	measureCtx.font =
		size +
		'px ' +
		( /[\s"']/.test( font )
			? '"' + font.replace( /"/g, '' ) + '"'
			: font ) +
		', Arial, sans-serif';
	return measureCtx.measureText( text ).width;
}

function brandKits( bridge ) {
	try {
		const k = bridge.brand && bridge.brand.kits ? bridge.brand.kits() : [];
		return Array.isArray( k ) ? k : [];
	} catch ( e ) {
		return [];
	}
}

function makeEnv( editor, bridge ) {
	const doc = ( editor && editor.state && editor.state.doc ) || {};
	return {
		docW: doc.w || 1600,
		docH: doc.h || 1000,
		measure,
		t,
		kits: brandKits( bridge ),
		renderScore,
	};
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
		toast( t( 'Sheet Music needs a newer WunderPaint.' ), 'error' );
		return;
	}
	const editing = !! (
		layer &&
		layer.generator &&
		layer.generator.id === GEN_ID
	);
	const first = starterById( 'first-melody' );
	const params = normalizeParams(
		editing ? layer.generator.params : { ...first.params, card: first.card }
	);
	const S = {
		params,
		card: params.card,
		starter: editing ? null : first.id,
		last: null,
		status: '',
		busy: false,
		token: 0,
		timer: 0,
		showDoc: false,
		editing,
		layer,
		drafts: new Map(),
	};
	const env = makeEnv( editor, bridge );

	const modal = ui.dialog( {
		title: 'Sheet Music',
		subtitle: t(
			'Music graphics, visual notation and coordinated teaching sheets.'
		),
		width: 1400,
		onClose: () => cleanup(),
	} );
	modal.dialog.classList.add( 'wpiesm-dialog' );
	// Die Marke kommt aus dem Kit (bridge.ui), nicht aus dem Paket.
	ui.badge( modal );
	const body = ui.el( 'div', 'wpiesm-body', modal.body );
	const left = ui.el( 'div', 'wpiesm-left', body );
	const mid = ui.el( 'div', 'wpiesm-mid', body );
	const side = ui.el( 'div', 'wpiesm-side', body );
	const materialHost = ui.el( 'div', 'wpiesm-settings-stack', side );
	const settingsHost = ui.el( 'div', 'wpiesm-settings-stack', side );
	const previewCache = new Map();
	async function previewStarter( id ) {
		if ( previewCache.has( id ) ) return previewCache.get( id );
		const starter = starterById( id );
		if ( ! starter ) return null;
		const p = normalizeParams( { ...starter.params, card: starter.card } );
		const res = await cardById( starter.card ).render( p, {
			...env,
			docW: 1000,
			docH: 800,
		} );
		const src =
			'data:image/svg+xml;charset=utf-8,' + encodeURIComponent( res.svg );
		if ( previewCache.size > 80 ) previewCache.clear();
		previewCache.set( id, src );
		return src;
	}

	const view = buildView( mid, {
		ui,
		t,
		onToggleDoc: () => toggleDoc(),
		getEditor: () => ( S.busy ? null : S.melodyEditor ),
	} );
	S.updateSelection = ( from, to ) => view.setSelection( from, to );
	const leftUi = buildLeft( left, {
		S,
		ui,
		bridge,
		t,
		onCard: ( id ) => switchCard( id ),
		onStarter: ( id ) => loadStarter( id ),
		onChange: () => {
			queue();
			if ( S.card === 'diagrams' ) rebuildControls();
		},
		onImport: ( file ) => importFile( file ),
		materialParent: materialHost,
		previewStarter,
		onRebuild: () => rebuildControls(),
	} );
	let sideUi;
	function rebuildControls() {
		sideUi?.unmountAll();
		settingsHost.replaceChildren();
		S.selectMelodyNote = null;
		S.melodyEditor = null;
		view.setSelection( -1, -1 );
		sideUi = buildSide( settingsHost, {
			S,
			ui,
			bridge,
			t,
			onChange: () => queue(),
			onRebuild: () => rebuildControls(),
		} );
	}
	rebuildControls();

	/* Footer. */
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
	insertBtn.classList.add( 'wpiesm-insert' );

	function setStatus( msg, bad ) {
		S.status = msg || '';
		status.textContent = S.status;
		status.classList.toggle( 'is-bad', !! bad );
	}

	function switchCard( id ) {
		if ( S.card === id ) {
			return;
		}
		S.drafts.set( S.card, {
			params: normalizeParams( S.params ),
			starter: S.starter,
		} );
		S.card = id;
		const draft = S.drafts.get( id );
		if ( draft ) {
			S.params = normalizeParams( draft.params );
			S.starter = draft.starter;
		} else {
			const own = STARTERS.find( ( s ) => s.card === id );
			if ( own ) applyStarter( own );
			else {
				S.params = normalizeParams( { card: id } );
				S.starter = null;
			}
		}
		leftUi.refresh();
		rebuildControls();
		queue( 0 );
	}

	function applyStarter( s ) {
		S.params = normalizeParams( { ...s.params, card: s.card } );
		S.starter = s.id;
	}

	function loadStarter( id ) {
		const s = starterById( id );
		if ( ! s ) {
			return;
		}
		if ( s.card !== S.card ) {
			S.drafts.set( S.card, {
				params: normalizeParams( S.params ),
				starter: S.starter,
			} );
			S.card = s.card;
			S.params.card = s.card;
		}
		applyStarter( s );
		leftUi.refresh();
		rebuildControls();
		queue( 0 );
	}

	// Ctrl+Z / Ctrl+Shift+Z (shared/studio-undo.js), no button: the card
	// and its music, notes included.
	const history = studioUndo( {
		backdrop: modal.backdrop,
		read: () => ( { card: S.card, params: S.params } ),
		write: ( data ) => {
			S.card = data.card;
			S.params = normalizeParams( { ...data.params, card: data.card } );
			leftUi.refresh();
			rebuildControls();
			queue( 0 );
		},
	} );

	/* Rendering, debounced; the newest request wins. */
	function queue( delay = 250 ) {
		clearTimeout( S.timer );
		S.token++;
		S.busy = true;
		S.last = null;
		insertBtn.disabled = true;
		S.timer = setTimeout( () => render(), delay );
	}
	async function render() {
		const my = ++S.token;
		S.busy = true;
		try {
			const card = cardById( S.card );
			const res = await card.render( normalizeParams( S.params ), env );
			if ( my !== S.token ) {
				return;
			}
			const shown = await view.show( res );
			if ( my !== S.token || ! shown ) return;
			S.last = res;
			insertBtn.disabled = false;
			if ( res.warnings && res.warnings.length ) {
				setStatus( res.warnings.join( ' · ' ), true );
			} else {
				setStatus(
					res.width + ' × ' + res.height + ' · ' + t( card.label ),
					false
				);
			}
		} catch ( e ) {
			if ( my === S.token ) {
				setStatus( t( ( e && e.message ) || String( e ) ), true );
			}
		} finally {
			if ( my === S.token ) {
				S.busy = false;
				S.frames = ( S.frames || 0 ) + 1;
			}
		}
	}

	/* Show document: the current design behind the paper. */
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
		// v1.1.2: split at the layer, placed where it lands.
		captureAround( bridge.raster, editor.state, S.editing ? layer.id : null )
			.then( ( around ) =>
				view.setDoc( {
					around,
					doc: editor.state.doc,
					region: ( w, h ) => targetBox( { width: w, height: h } ),
				} )
			)
			.catch( () => view.setDoc( null ) );
	}
	/** Where a picture of res's size lands in the document. */
	function targetBox( res ) {
		const doc = editor.state.doc;
		if ( S.editing ) {
			const box = boundsOf( layer, editor.state.layers );
			const fit = Math.min( box.w / res.width, box.h / res.height );
			const w = Math.round( res.width * fit );
			const h = Math.round( res.height * fit );
			return {
				x: Math.round( box.x + ( box.w - w ) / 2 ),
				y: Math.round( box.y + ( box.h - h ) / 2 ),
				w,
				h,
			};
		}
		const srcAR = res.width / res.height;
		const docAR = ( doc.w || 1 ) / ( doc.h || 1 );
		if ( Math.abs( srcAR - docAR ) / docAR < 0.02 ) {
			return { x: 0, y: 0, w: doc.w, h: doc.h };
		}
		const fit = Math.min( ( doc.w * 0.92 ) / res.width, ( doc.h * 0.92 ) / res.height );
		const w = Math.round( res.width * fit );
		const h = Math.round( res.height * fit );
		return {
			x: Math.round( ( doc.w - w ) / 2 ),
			y: Math.round( ( doc.h - h ) / 2 ),
			w,
			h,
		};
	}


	/* Import: ABC straight in, MusicXML through xml2abc. */
	async function importFile( file ) {
		setStatus( t( 'Importing' ), false );
		try {
			const buf = await file.arrayBuffer();
			const head = new TextDecoder().decode(
				new Uint8Array( buf ).slice( 0, 200 )
			);
			let abc;
			if ( /\.abc$/i.test( file.name ) || /^\s*(%|X:)/.test( head ) ) {
				abc = new TextDecoder().decode( new Uint8Array( buf ) );
				setStatus( t( 'Imported' ) + ' ' + file.name, false );
			} else {
				const xml = await unzipMxl( buf );
				const own = ownEntry();
				await ensureXml2abc( baseUrl(), own && own.version );
				const r = convertMusicXml( xml );
				abc = r.abc;
				setStatus(
					t( 'Imported from MusicXML' ) +
						( r.info.trim()
							? ' · ' + r.info.trim().split( '\n' )[ 0 ]
							: '' ),
					false
				);
			}
			if ( ! abc || ! abc.trim() ) {
				throw new Error( t( 'The file could not be read.' ) );
			}
			S.params.abc = abc;
			S.params.card = 'score';
			S.card = 'score';
			S.starter = null;
			S.params.text = { title: '', subtitle: '', composer: '' };
			leftUi.refresh();
			rebuildControls();
			queue( 0 );
		} catch ( e ) {
			setStatus(
				( e && e.message ) || t( 'The file could not be read.' ),
				true
			);
		}
	}

	/* ------------------------------- insert ------------------------------- */

	function insert() {
		if ( ! S.last || S.busy ) {
			return;
		}
		const stored = normalizeParams( S.params );
		const res = S.last;
		const doc = editor.state.doc;
		// Target box: a picture in the document's own frame covers it, a
		// foreign frame is fit centred (the placement rule of every studio);
		// an update keeps the old box.
		const box = targetBox( res );
		if (
			bridge.svg &&
			bridge.svg.importSvg &&
			bridge.documents &&
			bridge.documents.makeGroup
		) {
			try {
				if ( insertVector( res, box, stored ) ) {
					return;
				}
			} catch ( e ) {
				// fall through to the raster
			}
		}
		insertRaster( res, box, stored );
	}

	/** The root tag rescaled to the box, so the importer scales every layer. */
	function insertVector( res, box, stored ) {
		const svg = normalizeTextAnchors( res.svg ).replace(
			/^<svg([^>]*)>/,
			( m, attrs ) => {
				const a = attrs
					.replace( /\swidth="[^"]*"/, '' )
					.replace( /\sheight="[^"]*"/, '' );
				return `<svg${ a } width="${ box.w }" height="${ box.h }">`;
			}
		);
		const parsed = bridge.svg.importSvg( svg );
		const members = ( parsed && parsed.layers ) || [];
		if ( ! members.length ) {
			return false;
		}
		const group = bridge.documents.makeGroup( { name: 'Sheet Music' } );
		const moved = members.map( ( l ) => ( {
			...l,
			x: Math.round( l.x + box.x ),
			y: Math.round( l.y + box.y ),
			parent: group.id,
		} ) );
		group.children = moved.map( ( l ) => l.id );
		group.generator = { id: GEN_ID, params: stored };
		let layers = editor.state.layers || [];
		if ( S.editing ) {
			const gone = new Set( [ layer.id, ...( layer.children || [] ) ] );
			layers = layers.filter(
				( l ) => ! gone.has( l.id ) && l.parent !== layer.id
			);
		}
		editor.dispatch( {
			type: 'SET_LAYERS',
			layers: [ ...layers, ...moved, group ],
		} );
		editor.dispatch( { type: 'SET_ACTIVE', id: group.id } );
		editor.commit(
			S.editing ? t( 'Update sheet music' ) : t( 'Insert sheet music' )
		);
		cleanup();
		modal.close();
		return true;
	}

	function insertRaster( res, box, stored ) {
		const canvas = view.canvas;
		const url = canvas.toDataURL( 'image/png' );
		if ( S.editing && 'image' === layer.type ) {
			editor.dispatch( {
				type: 'UPDATE_LAYER',
				id: layer.id,
				patch: {
					src: url,
					...box,
					naturalW: canvas.width,
					naturalH: canvas.height,
					generator: { id: GEN_ID, params: stored },
				},
			} );
			editor.commit( t( 'Update sheet music' ) );
		} else {
			const nl = bridge.documents.makeImage( {
				name: 'Sheet Music',
				...box,
				src: url,
				naturalW: canvas.width,
				naturalH: canvas.height,
			} );
			nl.generator = { id: GEN_ID, params: stored };
			editor.dispatch( { type: 'ADD_LAYER', layer: nl } );
			editor.dispatch( { type: 'SET_ACTIVE', id: nl.id } );
			editor.commit( t( 'Insert sheet music' ) );
		}
		cleanup();
		modal.close();
	}

	/** The box of a group from its children, or the layer's own box. */
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
		history.dispose();
		S.token++;
		leftUi.dispose();
		sideUi.unmountAll();
		view.dispose();
		previewCache.clear();
		window.__wpiesmState = null;
		window.__wpiesmProof = null;
	}

	/* Test hooks (QA and proof). */
	window.__wpiesmState = () => ( {
		card: S.card,
		params: S.params,
		starter: S.starter,
		last: S.last
			? {
					width: S.last.width,
					height: S.last.height,
					warnings: S.last.warnings,
					svg: S.last.svg,
			  }
			: null,
		status: S.status,
		busy: S.busy,
		frames: S.frames || 0,
	} );
	window.__wpiesmProof = {
		starters: STARTERS.map( ( s ) => ( {
			id: s.id,
			card: s.card,
			name: s.name,
		} ) ),
		render: async ( id ) => {
			const s = starterById( id );
			const p = normalizeParams( { ...s.params, card: s.card } );
			return cardById( s.card ).render( p, env );
		},
		load: ( id ) => loadStarter( id ),
		importFile: ( file ) => importFile( file ),
	};

	leftUi.refresh();
	sideUi.applyVisibility();
	queue( 0 );
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
	const fields = [ 'abc', 'chordpro', 'chords' ];
	let any = false;
	for ( const f of fields ) {
		if ( 'string' === typeof p[ f ] && hasTokens( p[ f ] ) ) {
			p[ f ] = expandTokens( p[ f ] );
			any = true;
		}
	}
	if ( 'string' === typeof p.text.title && hasTokens( p.text.title ) ) {
		p.text.title = expandTokens( p.text.title );
		any = true;
	}
	if ( ! any ) {
		return null;
	}
	const bridge = window.WPIE && window.WPIE.bridge;
	const env = makeEnv( args.editor || null, bridge || {} );
	const res = await cardById( p.card ).render( p, env );
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

/* -------------------------------- register -------------------------------- */

function register( api ) {
	api.registerGenerator( {
		id: GEN_ID,
		label: 'Sheet Music',
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

export { CARDS };
