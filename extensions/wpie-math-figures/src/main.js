/**
 * Math Figures: formulas, function graphs, geometry, number lines,
 * fractions, text, worked solutions and tables, stacked into ONE figure
 * and inserted as an editable vector group. The dialog is the house form
 * (bridge.ui, three columns); the picture comes from renderFigure() in
 * blocks.js. The formula engine (MathJax) is a separate bundle in
 * assets/, loaded on first use.
 */
import { t } from './i18n.js';
import { BLOCKS, renderFigure } from './blocks.js';
import { normalizeParams, newBlock, blockFields } from './figure.js';
import { STARTERS, starterById, groupOf } from './starters.js';
import { flattenMathSvg } from './engine/mathsvg.js';
import { normalizeTextAnchors } from './engine/svg-dom.js';
import { buildLeft } from './ui/left.js';
import { buildView } from './ui/view.js';
import { buildSide } from './ui/side.js';
import { buildMaterial } from './ui/material.js';

export const GEN_ID = 'wpie-math-figures/figure';
const SLUG = 'wpie-math-figures';
const HAS_MATH = /\$[^$]+\$/;

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

/* The formula engine, loaded once from assets/mathjax.js. */
let mjLoading = null;
export function ensureMathJax() {
	if ( window.__wpieMathJax ) {
		return Promise.resolve();
	}
	if ( ! mjLoading ) {
		mjLoading = new Promise( ( ok, bad ) => {
			const own = ownEntry();
			const s = document.createElement( 'script' );
			s.src =
				baseUrl() +
				'assets/mathjax.js?ver=' +
				encodeURIComponent( ( own && own.version ) || '1' );
			s.onload = () =>
				window.__wpieMathJax
					? ok()
					: bad(
							new Error(
								t( 'The formula engine did not start.' )
							)
					  );
			s.onerror = () => {
				mjLoading = null;
				bad(
					new Error( t( 'The formula engine could not be loaded.' ) )
				);
			};
			document.head.appendChild( s );
		} );
	}
	return mjLoading;
}

/** LaTeX -> flat px markup; null while the engine is not there yet. */
function typesetFn() {
	if ( ! window.__wpieMathJax ) {
		return null;
	}
	return ( latex, o ) => {
		const { svg, error } = window.__wpieMathJax.typeset(
			latex,
			false !== o.display
		);
		const flat = flattenMathSvg( svg, {
			size: o.size || 40,
			color: o.color || '#111111',
		} );
		return { ...flat, error };
	};
}

/* Text widths from a canvas; the engines wrap and align with these. */
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
		t,
		kits: brandKits( bridge ),
		typeset: typesetFn(),
		measure,
	};
}

/** Does this figure need MathJax for anything? */
function needsEngine( params ) {
	if (
		params.blocks.some(
			( b ) => BLOCKS[ b.type ] && BLOCKS[ b.type ].needsEngine( b )
		)
	) {
		return true;
	}
	return [
		params.head.title,
		params.head.subtitle,
		params.foot.caption,
		params.foot.note,
	].some( ( s ) => HAS_MATH.test( s || '' ) );
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
		toast( t( 'Math Figures needs a newer WunderPaint.' ), 'error' );
		return;
	}
	const editing = !! (
		layer &&
		layer.generator &&
		layer.generator.id === GEN_ID
	);
	const first = starterById( 'quadratic' );
	const params = normalizeParams(
		editing ? layer.generator.params : first.params
	);
	const S = {
		params,
		blockId: params.blocks[ 0 ].id,
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
	};
	const env = makeEnv( editor, bridge );

	const modal = ui.dialog( {
		title: 'Math Figures',
		subtitle: t(
			'Formulas, graphs, geometry, number lines, fractions, text and tables as one editable vector figure.'
		),
		width: 1400,
		onClose: () => cleanup(),
	} );
	modal.dialog.classList.add( 'wpiemf-dialog' );
	// Die Marke kommt aus dem Kit (bridge.ui), nicht aus dem Paket.
	ui.badge( modal );
	const body = ui.el( 'div', 'wpiemf-body', modal.body );
	const left = ui.el( 'div', 'wpiemf-left', body );
	const mid = ui.el( 'div', 'wpiemf-mid', body );
	const side = ui.el( 'div', 'wpiemf-side', body );

	const view = buildView( mid, { ui, t, onToggleDoc: () => toggleDoc() } );
	const matUi = buildMaterial( mid, {
		S,
		ui,
		bridge,
		t,
		onChange: ( textChanged ) => {
			if ( textChanged ) {
				leftUi.renderBlocks();
			}
			queue();
		},
	} );
	const leftUi = buildLeft( left, {
		S,
		ui,
		bridge,
		t,
		modal,
		onSelect: ( id ) => selectBlock( id ),
		onAdd: ( type ) => addBlock( type ),
		onRemove: ( id ) => removeBlock( id ),
		onMove: ( id, dir ) => moveBlock( id, dir ),
		onStarter: ( id ) => loadStarter( id ),
		onChange: () => queue(),
	} );
	const sideUi = buildSide( side, {
		S,
		ui,
		bridge,
		t,
		onChange: () => queue(),
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
	insertBtn.classList.add( 'wpiemf-insert' );

	function setStatus( msg, bad ) {
		S.status = msg || '';
		status.textContent = S.status;
		status.classList.toggle( 'is-bad', !! bad );
	}

	const selected = () =>
		S.params.blocks.find( ( b ) => b.id === S.blockId ) ||
		S.params.blocks[ 0 ];

	function selectBlock( id ) {
		if ( ! S.params.blocks.some( ( b ) => b.id === id ) ) {
			return;
		}
		S.blockId = id;
		leftUi.refresh();
		matUi.refresh();
		sideUi.rebuild();
		setTimeout( () => view.fit(), 0 );
	}

	function addBlock( type ) {
		if ( ! BLOCKS[ type ] ) {
			return;
		}
		const b = newBlock( type );
		// A fresh block starts with the first one-block starter of its kind, so there is something to see.
		const seed = STARTERS.find(
			( s ) =>
				1 === s.params.blocks.length &&
				s.params.blocks[ 0 ].type === type
		);
		if ( seed ) {
			const rest = { ...seed.params.blocks[ 0 ] };
			delete rest.type;
			Object.assign( b, rest );
		}
		S.params.blocks.push( b );
		S.blockId = b.id;
		S.starter = null;
		leftUi.refresh();
		matUi.refresh();
		sideUi.rebuild();
		setTimeout( () => view.fit(), 0 );
		queue( 0 );
	}

	function removeBlock( id ) {
		const blocks = S.params.blocks;
		if ( blocks.length <= 1 ) {
			return;
		}
		const i = blocks.findIndex( ( b ) => b.id === id );
		if ( i < 0 ) {
			return;
		}
		blocks.splice( i, 1 );
		if ( S.blockId === id ) {
			S.blockId = blocks[ Math.min( i, blocks.length - 1 ) ].id;
		}
		S.starter = null;
		leftUi.refresh();
		matUi.refresh();
		sideUi.rebuild();
		setTimeout( () => view.fit(), 0 );
		queue( 0 );
	}

	function moveBlock( id, dir ) {
		const blocks = S.params.blocks;
		const i = blocks.findIndex( ( b ) => b.id === id );
		const j = i + dir;
		if ( i < 0 || j < 0 || j >= blocks.length ) {
			return;
		}
		const [ b ] = blocks.splice( i, 1 );
		blocks.splice( j, 0, b );
		S.starter = null;
		leftUi.refresh();
		matUi.refresh();
		queue( 0 );
	}

	function loadParams( p, starterId ) {
		S.params = normalizeParams( p );
		S.blockId = S.params.blocks[ 0 ].id;
		S.starter = starterId || null;
		leftUi.refresh();
		matUi.refresh();
		sideUi.rebuild();
		setTimeout( () => view.fit(), 0 );
		queue( 0 );
	}

	function loadStarter( id ) {
		const s = starterById( id );
		if ( ! s ) {
			return;
		}
		loadParams( s.params, s.id );
	}

	function queue( delay = 250 ) {
		clearTimeout( S.timer );
		S.timer = setTimeout( () => render(), delay );
	}
	async function render() {
		const my = ++S.token;
		S.busy = true;
		try {
			// The engine comes in the moment something wants a formula.
			if ( ! env.typeset && needsEngine( S.params ) ) {
				setStatus( t( 'Loading the formula engine' ), false );
				try {
					await ensureMathJax();
					env.typeset = typesetFn();
				} catch ( e ) {
					setStatus( ( e && e.message ) || String( e ), true );
				}
				if ( my !== S.token ) {
					return;
				}
			}
			const res = await renderFigure( S.params, env );
			if ( my !== S.token ) {
				return;
			}
			S.last = res;
			matUi.setWarnings( res.warnings );
			await view.show( res );
			if ( res.warnings && res.warnings.length ) {
				setStatus( res.warnings.join( ' · ' ), true );
			} else {
				const n = S.params.blocks.length;
				setStatus(
					res.width +
						' × ' +
						res.height +
						' · ' +
						( 1 === n
							? t( BLOCKS[ selected().type ].label )
							: n + ' ' + t( 'blocks' ) ),
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

	function insert() {
		if ( ! S.last || S.busy ) {
			return;
		}
		const stored = normalizeParams( S.params );
		const res = S.last;
		const doc = editor.state.doc;
		let box;
		if ( S.editing ) {
			box = boundsOf( layer, editor.state.layers );
			const fit = Math.min( box.w / res.width, box.h / res.height );
			const w = Math.round( res.width * fit );
			const h = Math.round( res.height * fit );
			box = {
				x: Math.round( box.x + ( box.w - w ) / 2 ),
				y: Math.round( box.y + ( box.h - h ) / 2 ),
				w,
				h,
			};
		} else {
			const srcAR = res.width / res.height;
			const docAR = ( doc.w || 1 ) / ( doc.h || 1 );
			if ( Math.abs( srcAR - docAR ) / docAR < 0.02 ) {
				box = { x: 0, y: 0, w: doc.w, h: doc.h };
			} else {
				const fit = Math.min(
					( doc.w * 0.92 ) / res.width,
					( doc.h * 0.92 ) / res.height
				);
				const w = Math.round( res.width * fit );
				const h = Math.round( res.height * fit );
				box = {
					x: Math.round( ( doc.w - w ) / 2 ),
					y: Math.round( ( doc.h - h ) / 2 ),
					w,
					h,
				};
			}
		}
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
		const group = bridge.documents.makeGroup( { name: 'Math Figures' } );
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
			S.editing ? t( 'Update figure' ) : t( 'Insert figure' )
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
			editor.commit( t( 'Update figure' ) );
		} else {
			const nl = bridge.documents.makeImage( {
				name: 'Math Figures',
				...box,
				src: url,
				naturalW: canvas.width,
				naturalH: canvas.height,
			} );
			nl.generator = { id: GEN_ID, params: stored };
			editor.dispatch( { type: 'ADD_LAYER', layer: nl } );
			editor.dispatch( { type: 'SET_ACTIVE', id: nl.id } );
			editor.commit( t( 'Insert figure' ) );
		}
		cleanup();
		modal.close();
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
		leftUi.unmountAll();
		matUi.unmountAll();
		sideUi.unmountAll();
		window.__wpiemfState = null;
		window.__wpiemfProof = null;
	}

	window.__wpiemfState = () => ( {
		params: S.params,
		blockId: S.blockId,
		blocks: S.params.blocks.map( ( b ) => b.type ),
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
		frames: S.frames,
	} );
	window.__wpiemfProof = {
		starters: STARTERS.map( ( s ) => ( {
			id: s.id,
			group: groupOf( s ),
			name: s.name,
		} ) ),
		render: async ( id ) => {
			const s = starterById( id );
			const p = normalizeParams( s.params );
			if ( ! env.typeset ) {
				await ensureMathJax();
				env.typeset = typesetFn();
			}
			return renderFigure( p, env );
		},
		load: ( id ) => loadStarter( id ),
		open: ( p ) => loadParams( p, null ),
	};

	leftUi.refresh();
	matUi.refresh();
	queue( 0 );
	setTimeout( () => view.fit(), 50 );
}

/* ------------------------- dynamic pictures (resolve) ----------------------- */

async function resolveFigure( args ) {
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
	for ( const k of [ 'title', 'subtitle' ] ) {
		expand( p.head, k );
	}
	for ( const k of [ 'caption', 'note' ] ) {
		expand( p.foot, k );
	}
	for ( const b of p.blocks ) {
		for ( const k of blockFields( b.type ) ) {
			expand( b, k );
		}
	}
	if ( ! any ) {
		return null;
	}
	const bridge = window.WPIE && window.WPIE.bridge;
	const env = makeEnv( args.editor || null, bridge || {} );
	if ( ! env.typeset && needsEngine( p ) ) {
		await ensureMathJax();
		env.typeset = typesetFn();
	}
	const res = await renderFigure( p, env );
	const img = await new Promise( ( ok, bad ) => {
		const i = new Image();
		i.onload = () => ok( i );
		i.onerror = () => bad( new Error( 'The figure could not be drawn.' ) );
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
		label: 'Math Figures',
		run: ( ctx ) => openStudio( ctx ),
		edit: ( ctx ) => openStudio( ctx ),
		resolve: ( a ) => resolveFigure( a ),
	} );
}

if ( window.WPIE && window.WPIE.api ) {
	register( window.WPIE.api );
} else if ( window.wp && window.wp.hooks ) {
	window.wp.hooks.addAction( 'wpie.ready', SLUG, register );
}

export { BLOCKS };
