/**
 * Editor state store: reducer + context (spec 02.3) with the history stack
 * (04.6) attached. Continuous gestures mutate state freely and call
 * `commit(label)` ONCE on gesture end, which pushes a serialized snapshot.
 */

import {
	createContext,
	useContext,
	useReducer,
	useMemo,
	useEffect,
	useCallback,
	useRef,
} from '@wordpress/element';
import { flushSync } from 'react-dom';

import { DEFAULT_TOOL_OPTS, ZOOM_MIN, ZOOM_MAX } from './constants';
import { serializeLayers, hydrateLayers } from './document';
import { scalePathD } from '../lib/path';
import { measureTextHeight } from '../lib/raster';
import * as History from './history';
import * as SharedClipboard from './shared-clipboard';
import { setDrawnTips } from '../lib/brush-tips';
import { runWetFlush } from '../lib/wet-hooks';

/* ------------------------------- helpers ------------------------------- */

const clamp = ( v, min, max ) => Math.min( max, Math.max( min, v ) );

/**
 * Apply a patch to one layer. Custom-path shapes (inserted icons, traced
 * shapes) bake their geometry into `pathD`, so a plain w/h patch never
 * changed what was drawn (v1.4 fix: icons could not be resized). Whenever
 * w/h change and the patch doesn't bring its own pathD, rescale the path
 * (and the stroke width) proportionally, Photoshop-style transform.
 */
function patchLayer( layer, patch ) {
	const next = { ...layer, ...patch };
	// A free-transform quad lives in absolute doc coords, so a plain move
	// (x/y change, same size) must carry the quad along or the layer looks
	// frozen in place (v1.43 fix). Resize/own-quad patches are left alone.
	if (
		layer.quad &&
		! ( 'quad' in patch ) &&
		( 'x' in patch || 'y' in patch ) &&
		next.w === layer.w &&
		next.h === layer.h
	) {
		const dx = next.x - layer.x;
		const dy = next.y - layer.y;
		if ( dx || dy ) {
			next.quad = {
				tl: { x: layer.quad.tl.x + dx, y: layer.quad.tl.y + dy },
				tr: { x: layer.quad.tr.x + dx, y: layer.quad.tr.y + dy },
				br: { x: layer.quad.br.x + dx, y: layer.quad.br.y + dy },
				bl: { x: layer.quad.bl.x + dx, y: layer.quad.bl.y + dy },
			};
		}
	}
	if (
		'shape' === layer.type &&
		layer.pathD &&
		! ( 'pathD' in patch ) &&
		layer.w > 0 &&
		layer.h > 0 &&
		( next.w !== layer.w || next.h !== layer.h )
	) {
		const sx = next.w / layer.w;
		const sy = next.h / layer.h;
		next.pathD = scalePathD( layer.pathD, sx, sy );
		if ( layer.strokeW && ! ( 'strokeW' in patch ) ) {
			next.strokeW = layer.strokeW * Math.sqrt( Math.abs( sx * sy ) );
		}
	}
	// Layout lockups (v1.47): the lines are fitted to the box width, so a
	// width change re-FITS the type proportionally instead of overflowing.
	if (
		'text' === layer.type &&
		layer.textLayout &&
		Array.isArray( layer.spans ) &&
		'w' in patch &&
		next.w !== layer.w &&
		layer.w > 0 &&
		! ( 'fontSize' in patch ) &&
		! ( 'text' in patch ) &&
		! ( 'spans' in patch )
	) {
		const f = next.w / layer.w;
		next.spans = layer.spans.map( ( run ) =>
			run?.s
				? {
						...run,
						s: {
							...run.s,
							...( run.s.size
								? {
										size: Math.max(
											4,
											Math.round( run.s.size * f )
										),
								  }
								: {} ),
							...( run.s.ls
								? { ls: Math.round( run.s.ls * f ) }
								: {} ),
						},
				  }
				: run
		);
		try {
			next.h = measureTextHeight( next );
		} catch ( e ) {
			// Headless without a canvas: keep the requested height.
		}
	} else if (
		// Area text (v1.46): a width change re-wraps the content, so the box
		// height follows the reflowed text instead of clipping it. Patches
		// with their own fontSize (corner scale) already fit by construction.
		// Path text and shape text are exempt: their box frames the OUTLINE
		// (v1.156.2 / v1.210.0), which scales below.
		'text' === layer.type &&
		layer.fixedWidth &&
		! layer.textPath &&
		! layer.shapeBox &&
		'w' in patch &&
		next.w !== layer.w &&
		! ( 'fontSize' in patch ) &&
		! ( 'text' in patch )
	) {
		try {
			next.h = measureTextHeight( next );
		} catch ( e ) {
			// Headless without a canvas: keep the requested height.
		}
	}
	if (
		// Path text scales its path with the box (v1.156.2), exactly like
		// shape layers scale pathD - resizing the frame resizes the curve.
		'text' === layer.type &&
		layer.textPath?.d &&
		! ( 'textPath' in patch ) &&
		layer.w > 0 &&
		layer.h > 0 &&
		( next.w !== layer.w || next.h !== layer.h )
	) {
		next.textPath = {
			...layer.textPath,
			d: scalePathD(
				layer.textPath.d,
				next.w / layer.w,
				next.h / layer.h
			),
		};
	}
	if (
		// Shape text scales its outline with the box, so resizing the frame
		// reshapes the silhouette the text flows in (v1.210.0).
		'text' === layer.type &&
		layer.shapeBox?.d &&
		! ( 'shapeBox' in patch ) &&
		layer.w > 0 &&
		layer.h > 0 &&
		( next.w !== layer.w || next.h !== layer.h )
	) {
		next.shapeBox = {
			...layer.shapeBox,
			d: scalePathD(
				layer.shapeBox.d,
				next.w / layer.w,
				next.h / layer.h
			),
		};
	}
	return next;
}

/** ids of a layer and all its (grand)children (groups). */
export function withDescendants( layers, ids ) {
	const all = new Set( ids );
	let grew = true;
	while ( grew ) {
		grew = false;
		for ( const layer of layers ) {
			if ( 'group' === layer.type && all.has( layer.id ) ) {
				for ( const child of layer.children || [] ) {
					if ( ! all.has( child ) ) {
						all.add( child );
						grew = true;
					}
				}
			}
		}
	}
	return all;
}

/**
 * Expand a selection for whole-object transforms: group ids pull in all
 * their (grand)children so moving a selected group moves the group as one
 * unit (v1.4). Non-group ids pass through unchanged.
 */
export function expandGroupIds( layers, ids ) {
	return Array.from( withDescendants( layers, ids ) );
}

/**
 * Auto-disclose groups by selection (v1.291.0): a top-level group is expanded
 * while it - or one of its descendants - is part of the current selection, and
 * collapsed otherwise. Inserting Word Art, Headlines and other multi-layer
 * lockups then no longer leaves the layer list permanently long; the group
 * opens when you select it and folds away when you move on.
 *
 * A group the user opened by HAND (the panel caret sets `manualOpen`) is left
 * alone - it stays open regardless of selection (v1.291.1). Only the automatic
 * open/close follows selection. Returns the SAME array when nothing changes,
 * so selection during a drag is cheap.
 */
const autoDiscloseGroups = ( layers, selectedIds ) => {
	const byId = new Map( layers.map( ( l ) => [ l.id, l ] ) );
	const engaged = new Set();
	for ( const id of selectedIds ) {
		let cur = byId.get( id );
		while ( cur && cur.parent && byId.get( cur.parent ) ) {
			cur = byId.get( cur.parent );
		}
		if ( cur && 'group' === cur.type ) {
			engaged.add( cur.id );
		}
	}
	let changed = false;
	const next = layers.map( ( l ) => {
		if ( 'group' !== l.type || l.parent || l.manualOpen ) {
			return l;
		}
		const want = engaged.has( l.id );
		if ( !! l.isOpen === want ) {
			return l;
		}
		changed = true;
		return { ...l, isOpen: want };
	} );
	return changed ? next : layers;
};

/** Remove ids from every group's children list. */
const scrubChildren = ( layers, removed ) =>
	layers.map( ( layer ) =>
		'group' === layer.type
			? {
					...layer,
					children: ( layer.children || [] ).filter(
						( id ) => ! removed.has( id )
					),
			  }
			: layer
	);

/* ------------------------------- reducer ------------------------------- */

export function initialState( { doc, layers, WPIE } ) {
	const theme =
		window.localStorage?.getItem( 'wpie-theme' ) ||
		( 'system' === ( WPIE?.theme || 'dark' )
			? window.matchMedia &&
			  window.matchMedia( '(prefers-color-scheme: light)' ).matches
				? 'light'
				: 'dark'
			: WPIE?.theme || 'dark' );

	const snapshot = {
		label: doc.source?.isNew ? 'New Document' : `Open “${ doc.name }”`,
		doc,
		layers: serializeLayers( layers ),
		selection: null,
	};

	return {
		doc,
		layers,
		activeId: layers.length ? layers[ layers.length - 1 ].id : null,
		selectedIds: [],
		tool: 'move',
		toolOpts: JSON.parse( JSON.stringify( DEFAULT_TOOL_OPTS ) ),
		zoom: 1,
		pan: { x: 0, y: 0 },
		// A visible starting colour. The near-black ink default read as
		// "almost black" in the brush panel and first strokes vanished on
		// dark documents (Thomas, v1.408.2).
		fgColor: '#ff0000',
		bgColor: '#ffffff',
		selection: null,
		savedSelections: [],
		// Seed from the page-level shared clipboard so a tab switch (which
		// remounts this provider) or a freshly opened editor still offers the
		// last copied layer / style (v1.226.0).
		clipboard: SharedClipboard.getLayerClip(),
		styleClipboard: SharedClipboard.getStyleClip(),
		crop: null,
		showGrid: false,
		gridSize: 50,
		showRulers: true,
		showGuides: true,
		snap: true,
		theme,
		accent: WPIE?.accent || '#3b66ff',
		history: History.createHistory( snapshot ),
		rightTab: 'layers',
		maskEditId: null,
		// Demo installs show the navigator to first-time visitors
		// (v1.308); a visitor's own toggle sticks via localStorage.
		showNavigator:
			null ===
			( window.localStorage?.getItem( 'wpie-navigator' ) ?? null )
				? !! WPIE?.demo
				: '1' === window.localStorage?.getItem( 'wpie-navigator' ),
		// The brush panel is ON by default: it is the whole point of the
		// brush rebuild, and a panel nobody finds is a panel nobody uses.
		// It only SHOWS for paint tools, so it costs nothing elsewhere.
		showBrushPanel:
			null ===
			( window.localStorage?.getItem( 'wpie-brush-panel' ) ?? null )
				? true
				: '1' === window.localStorage?.getItem( 'wpie-brush-panel' ),
		compare: false,
		revealPasteboard: false, // v1.379.1: paint off-canvas content
		proof: null, // CVD proofing mode (view-only, v1.1)
		previewPost: null, // dynamic templates E1: {id,title,ctx}, view-only
		timeline: { on: false, onion: false }, // animation bar (v1.1)
		// Bottom docks (v1.35): the library tray + pages bar stack with the
		// timeline and can be shown/hidden from the View menu.
		libraryHidden:
			'1' === window.localStorage?.getItem( 'wpie-library-hidden' ),
		pagesHidden: false,
		freeTransformId: null,
	};
}

/**
 * Where a new layer goes when the caller does not say (v1.399).
 *
 * It used to be "the very end", which is the very top - so however
 * carefully you picked a layer first, everything you inserted landed above
 * everything else and had to be dragged back down. The rule now is the one
 * the adjustment layers and the new brush layer already followed: directly
 * above what is selected.
 *
 * Two deliberate limits:
 * - A selection INSIDE a group anchors on the whole group, not on the
 *   member. Landing between two members would silently change a group the
 *   user did not mean to touch (Thomas' call, 11.08.2026).
 * - A layer that already names a `parent` is a studio building a group,
 *   child by child. Those keep appending, so no extension has to change.
 *
 * @param {Object} state Editor state.
 * @param {Object} layer The layer about to be added.
 * @return {number} Index to splice at.
 */
function insertPoint( state, layer ) {
	const layers = state.layers || [];
	if ( ! layer || layer.parent ) {
		return layers.length;
	}
	const anchors =
		state.selectedIds && state.selectedIds.length
			? state.selectedIds
			: [ state.activeId ];
	// Up to the outermost ancestor: that entry sits ABOVE its own members
	// in flat order, so one past it is "above the whole group".
	const rootOf = ( id ) => {
		let cur = layers.find( ( l ) => l.id === id );
		const seen = new Set();
		while ( cur && cur.parent && ! seen.has( cur.id ) ) {
			seen.add( cur.id );
			const up = layers.find( ( l ) => l.id === cur.parent );
			if ( ! up ) {
				break;
			}
			cur = up;
		}
		return cur;
	};
	let at = -1;
	for ( const id of anchors ) {
		const root = id ? rootOf( id ) : null;
		if ( root ) {
			at = Math.max(
				at,
				layers.findIndex( ( l ) => l.id === root.id )
			);
		}
	}
	return at < 0 ? layers.length : at + 1;
}

export function reducer( state, action ) {
	switch ( action.type ) {
		// The brush panel follows the Navigator's pattern exactly: a stored
		// preference, toggled from the View menu. It is not a seventh tab
		// in the right rail - that grid is three over three and every
		// tutorial video is built on it.
		case 'TOGGLE_BRUSH_PANEL': {
			const showBrushPanel = ! state.showBrushPanel;
			try {
				window.localStorage?.setItem(
					'wpie-brush-panel',
					showBrushPanel ? '1' : '0'
				);
			} catch ( e ) {}
			return { ...state, showBrushPanel };
		}
		case 'TOGGLE_NAVIGATOR': {
			const showNavigator = ! state.showNavigator;
			try {
				window.localStorage?.setItem(
					'wpie-navigator',
					showNavigator ? '1' : '0'
				);
			} catch ( e ) {}
			return { ...state, showNavigator };
		}
		case 'SET_FREE_TRANSFORM':
			return {
				...state,
				freeTransformId: action.id || null,
				// Session-start snapshot; Esc restores it (spec 13.6).
				freeTransformEntry: action.id ? action.entry || null : null,
			};
		case 'SET_COMPARE':
			return { ...state, compare: !! action.on };
		case 'SET_PROOF':
			return { ...state, proof: action.mode || null };
		case 'SET_PREVIEW_POST':
			// Paint-time preview only; remember the pick on the doc so the
			// template keeps its sample post (no history step of its own).
			return {
				...state,
				previewPost: action.post || null,
				doc: action.post?.id
					? { ...state.doc, samplePostId: action.post.id }
					: state.doc,
			};
		case 'TOGGLE_TIMELINE':
			return {
				...state,
				timeline: { ...state.timeline, on: ! state.timeline.on },
			};
		case 'TOGGLE_LIBRARY': {
			const libraryHidden = ! state.libraryHidden;
			try {
				window.localStorage?.setItem(
					'wpie-library-hidden',
					libraryHidden ? '1' : '0'
				);
			} catch ( e ) {}
			return { ...state, libraryHidden };
		}
		case 'TOGGLE_PAGES':
			return { ...state, pagesHidden: ! state.pagesHidden };
		case 'SET_TIMELINE':
			return {
				...state,
				timeline: { ...state.timeline, ...action.timeline },
			};
		case 'SET_DOC':
			return { ...state, doc: { ...state.doc, ...action.doc } };
		case 'SET_LAYERS':
			return { ...state, layers: action.layers };
		case 'ADD_LAYER': {
			const layers = [ ...state.layers ];
			const index = action.index ?? insertPoint( state, action.layer );
			layers.splice( index, 0, action.layer );
			let out = {
				...state,
				layers,
				activeId: action.layer.id,
				selectedIds: [ action.layer.id ],
			};
			if ( action.layer.parent ) {
				// Idempotent membership (v1.335): a caller that inserts a
				// group whose `children` is already filled and then sends one
				// ADD_LAYER per child used to list every child twice, and the
				// editor drew the whole thing on top of itself. Extensions hit
				// this repeatedly (Step Guides report), so the reducer - not
				// each caller - guarantees the id appears once.
				out = reducer( out, {
					type: 'SET_LAYERS',
					layers: out.layers.map( ( l ) =>
						l.id === action.layer.parent && 'group' === l.type
							? {
									...l,
									children: ( l.children || [] ).includes(
										action.layer.id
									)
										? l.children
										: [
												...( l.children || [] ),
												action.layer.id,
										  ],
							  }
							: l
					),
				} );
			}
			return out;
		}
		case 'UPDATE_LAYER':
			return {
				...state,
				layers: state.layers.map( ( l ) =>
					l.id === action.id ? patchLayer( l, action.patch ) : l
				),
			};
		case 'UPDATE_LAYERS': {
			const ids = new Set( action.ids );
			return {
				...state,
				layers: state.layers.map( ( l ) =>
					ids.has( l.id )
						? patchLayer(
								l,
								action.patchFor
									? action.patchFor( l )
									: action.patch
						  )
						: l
				),
			};
		}
		case 'REMOVE_LAYERS': {
			const removed = withDescendants( state.layers, action.ids );
			const layers = scrubChildren(
				state.layers.filter( ( l ) => ! removed.has( l.id ) ),
				removed
			);
			const activeId = removed.has( state.activeId )
				? layers.length
					? layers[ layers.length - 1 ].id
					: null
				: state.activeId;
			return {
				...state,
				layers,
				activeId,
				selectedIds: state.selectedIds.filter(
					( id ) => ! removed.has( id )
				),
			};
		}
		case 'REORDER': {
			// Move layer `id` so it sits at `toIndex` in the flat array and
			// belongs to `parent` (null = top level).
			const { id, toIndex, parent = null } = action;
			const layer = state.layers.find( ( l ) => l.id === id );
			if ( ! layer ) {
				return state;
			}
			let layers = state.layers.filter( ( l ) => l.id !== id );
			layers = scrubChildren( layers, new Set( [ id ] ) );
			const index = clamp( toIndex, 0, layers.length );
			layers.splice( index, 0, { ...layer, parent } );
			if ( parent ) {
				layers = layers.map( ( l ) =>
					l.id === parent && 'group' === l.type
						? { ...l, children: [ ...( l.children || [] ), id ] }
						: l
				);
			}
			return { ...state, layers };
		}
		case 'SET_ACTIVE': {
			const selectedIds = action.id ? [ action.id ] : [];
			return {
				...state,
				activeId: action.id,
				selectedIds,
				layers: autoDiscloseGroups( state.layers, selectedIds ),
			};
		}
		case 'SET_SELECTED': {
			const selectedIds = action.ids;
			return {
				...state,
				selectedIds,
				activeId: selectedIds.length
					? selectedIds[ selectedIds.length - 1 ]
					: null,
				layers: autoDiscloseGroups( state.layers, selectedIds ),
			};
		}
		case 'SET_TOOL':
			return { ...state, tool: action.tool, prevTool: state.tool };
		case 'SET_TOOL_OPTS':
			return {
				...state,
				toolOpts: {
					...state.toolOpts,
					[ action.tool ]: {
						...state.toolOpts[ action.tool ],
						...action.patch,
					},
				},
			};
		case 'SET_PASTEBOARD':
			return { ...state, revealPasteboard: !! action.on };
		case 'SET_ZOOM':
			return { ...state, zoom: clamp( action.zoom, ZOOM_MIN, ZOOM_MAX ) };
		case 'SET_PAN':
			return { ...state, pan: action.pan };
		case 'SET_VIEW':
			return {
				...state,
				zoom: clamp( action.zoom ?? state.zoom, ZOOM_MIN, ZOOM_MAX ),
				pan: action.pan ?? state.pan,
			};
		case 'SET_FG':
			return { ...state, fgColor: action.color };
		case 'SET_BG':
			return { ...state, bgColor: action.color };
		case 'SWAP_COLORS':
			return { ...state, fgColor: state.bgColor, bgColor: state.fgColor };
		case 'SET_SELECTION':
			return { ...state, selection: action.selection };
		case 'SAVE_SELECTION':
			return state.selection
				? {
						...state,
						savedSelections: [
							...state.savedSelections.filter(
								( s ) => s.name !== action.name
							),
							{ name: action.name, sel: state.selection },
						],
				  }
				: state;
		case 'LOAD_SELECTION': {
			const found = state.savedSelections.find(
				( s ) => s.name === action.name
			);
			return found ? { ...state, selection: found.sel } : state;
		}
		case 'SET_CLIPBOARD':
			return { ...state, clipboard: action.layers };
		case 'SET_STYLE_CLIPBOARD':
			return { ...state, styleClipboard: action.style };
		case 'SET_CROP':
			return { ...state, crop: action.crop };
		case 'TOGGLE_GRID':
			return { ...state, showGrid: ! state.showGrid };
		case 'SET_GRID_SIZE':
			return { ...state, gridSize: action.size };
		case 'TOGGLE_RULERS':
			return { ...state, showRulers: ! state.showRulers };
		case 'TOGGLE_GUIDES':
			return { ...state, showGuides: ! state.showGuides };
		case 'TOGGLE_SNAP':
			return { ...state, snap: ! state.snap };
		case 'SET_THEME':
			return { ...state, theme: action.theme };
		case 'SET_ACCENT':
			return { ...state, accent: action.accent };
		case 'SET_RIGHT_TAB':
			return { ...state, rightTab: action.tab };
		case 'SET_MASK_EDIT':
			return { ...state, maskEditId: action.id };
		case 'LOAD_DOCUMENT': {
			// Replace the whole document (Create dialog / PSD import) and
			// reset the history stack (spec 13.1).
			const snapshot = {
				label: action.label || 'New Document',
				doc: action.doc,
				layers: serializeLayers( action.layers ),
				selection: null,
			};
			return {
				...state,
				doc: action.doc,
				layers: action.layers,
				activeId: action.layers.length
					? action.layers[ action.layers.length - 1 ].id
					: null,
				selectedIds: [],
				selection: null,
				crop: null,
				maskEditId: null,
				// Page switches keep the pages strip; real document loads
				// (template, PSD, attachment) leave pages mode (v1.11).
				pages: action.keepPages ? state.pages : null,
				history: History.createHistory( snapshot ),
			};
		}
		case 'SET_PAGES':
			return {
				...state,
				pages: action.pages
					? { list: action.pages, current: action.current ?? 0 }
					: null,
			};

		/* ---- history ---- */
		case 'COMMIT': {
			const snapshot = {
				label: action.label,
				doc: state.doc,
				layers: serializeLayers( state.layers ),
				selection: state.selection,
			};
			return {
				...state,
				history: History.push( state.history, snapshot ),
			};
		}
		case 'UNDO':
		case 'REDO':
		case 'TIME_TRAVEL': {
			const history =
				'UNDO' === action.type
					? History.undo( state.history )
					: 'REDO' === action.type
					? History.redo( state.history )
					: History.goTo( state.history, action.index );
			if ( history === state.history ) {
				return state;
			}
			const snap = history.present;
			return {
				...state,
				history,
				doc: snap.doc,
				layers: snap.layers,
				selection: snap.selection,
				activeId: snap.layers.some( ( l ) => l.id === state.activeId )
					? state.activeId
					: snap.layers.length
					? snap.layers[ snap.layers.length - 1 ].id
					: null,
				selectedIds: state.selectedIds.filter( ( id ) =>
					snap.layers.some( ( l ) => l.id === id )
				),
			};
		}
		case 'HYDRATED':
			// Silent canvas restoration after undo/redo, no history push.
			return action.token === state.layers
				? { ...state, layers: action.layers }
				: state;
		case 'MARK_SAVED':
			return { ...state, history: History.markSaved( state.history ) };
		default:
			return state;
	}
}

/* ------------------------------- context ------------------------------- */

const EditorContext = createContext( null );

export function EditorProvider( { doc, layers, WPIE, children } ) {
	const [ state, dispatch ] = useReducer(
		reducer,
		{ doc, layers, WPIE },
		initialState
	);

	// Re-hydrate raster canvases after undo/redo/time-travel (serialized
	// snapshots carry dataUrls, not live canvases).
	useEffect( () => {
		const needy = state.layers.filter(
			( l ) => 'raster' === l.type && l.dataUrl && ! l.canvas
		);
		if ( ! needy.length ) {
			return;
		}
		let cancelled = false;
		const token = state.layers;
		hydrateLayers( state.layers ).then( ( hydrated ) => {
			if ( ! cancelled ) {
				dispatch( { type: 'HYDRATED', layers: hydrated, token } );
			}
		} );
		return () => {
			cancelled = true;
		};
	}, [ state.layers ] );

	const commit = useCallback(
		( label ) => dispatch( { type: 'COMMIT', label } ),
		[]
	);

	// Live facade for sequential op runners (v1.246.3): `state` always
	// reads the LATEST reducer state and every dispatch flushes React
	// synchronously, so step N+1 of a multi-step action sees step N's
	// result. The plain context value is a render snapshot - doc-ops that
	// compute layers from it (scale, flatten, crop) would chain on stale
	// geometry (the "400px thumbnail looks cropped until redo" bug).
	const stateRef = useRef( state );
	stateRef.current = state;

	// DRAWN BRUSH TIPS, and the timing is the whole point.
	//
	// A stroke stores only its tip's id, and `getTip` answers an unknown id
	// with Hard Round and no complaint. So the document's own tips have to
	// be in the registry BEFORE anything draws a layer. An effect would be
	// too late: a child's effect runs before its parent's, and the canvas
	// is the child. useMemo runs during this component's render, which is
	// before any child renders at all.
	//
	// Not a violation worth agonising over: setDrawnTips is idempotent and
	// the registry is a cache, not state.
	useMemo( () => {
		setDrawnTips( state.doc?.tips );
	}, [ state.doc?.tips ] );
	const live = useMemo(
		() => ( {
			get state() {
				return stateRef.current;
			},
			dispatch: ( action ) => flushSync( () => dispatch( action ) ),
			commit: ( label ) =>
				flushSync( () => dispatch( { type: 'COMMIT', label } ) ),
			// Wet watercolour dries into its layer BEFORE history moves, so
			// undo takes back the whole wash instead of leaving a half-wet
			// overlay pointing at a layer state that no longer exists.
			undo: () => {
				runWetFlush();
				flushSync( () => dispatch( { type: 'UNDO' } ) );
			},
			redo: () => {
				runWetFlush();
				flushSync( () => dispatch( { type: 'REDO' } ) );
			},
			WPIE,
		} ),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[]
	);

	const value = useMemo(
		() => ( {
			state,
			dispatch,
			commit,
			live,
			undo: () => {
				runWetFlush();
				dispatch( { type: 'UNDO' } );
			},
			redo: () => {
				runWetFlush();
				dispatch( { type: 'REDO' } );
			},
			timeTravel: ( index ) => {
				runWetFlush();
				dispatch( { type: 'TIME_TRAVEL', index } );
			},
			canUndo: History.canUndo( state.history ),
			canRedo: History.canRedo( state.history ),
			dirty: History.isDirty( state.history ),
			WPIE,
		} ),
		[ state, commit, live, WPIE ]
	);

	return (
		<EditorContext.Provider value={ value }>
			{ children }
		</EditorContext.Provider>
	);
}

export function useEditor() {
	const ctx = useContext( EditorContext );
	if ( ! ctx ) {
		throw new Error( 'useEditor must be used inside <EditorProvider>' );
	}
	return ctx;
}

/**
 * Nullable variant for components that can mount OUTSIDE the provider:
 * the bridge's mountColorButton renders SwatchButton into a standalone
 * React root (extension packs), where the throwing hook unmounted the
 * whole root the moment the popover opened (v1.145.4).
 */
export function useEditorMaybe() {
	return useContext( EditorContext );
}

/** The active layer object (or null). */
export const activeLayerOf = ( state ) =>
	state.layers.find( ( l ) => l.id === state.activeId ) || null;
