import { colorPanelState } from '../lib/color-panel-layout';
import { CLONE_HISTORY_LIMIT } from '../lib/clone-source';
/**
 * Editor state store: reducer + context (spec 02.3) with the history stack
 * (04.6) attached. Continuous gestures mutate state freely and call
 * `commit(label)` ONCE on gesture end, which pushes a serialized snapshot.
 */

import { readLocal, siteStorage } from '../lib/local-storage';
import {
	patchFxBrushSettings,
	readFxBrushSettings,
	saveFxBrushSettings,
} from '../lib/fxbrush-settings';
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
import { hydrateLayers, restoreLayers, snapshotLayers } from './document';
import { scalePathD } from '../lib/path';
import { measureTextHeight, measureTextWidth } from '../lib/raster';
import * as History from './history';
import * as SharedClipboard from './shared-clipboard';
import { setDrawnTips } from '../lib/brush-tips';
import { runWetFlush } from '../lib/wet-hooks';
import { withRepeatSync } from './repeat-sync';
import { withColorSync } from './color-sync';
import { detachPatchedColorLinks, syncColorLinks } from '../lib/color-links';
import { numberCommit } from '../lib/number-transaction';

/* ------------------------------- helpers ------------------------------- */

const clamp = ( v, min, max ) => Math.min( max, Math.max( min, v ) );

// What changes how wide a line of text is.
const LINE_WIDTH_KEYS = [
	'text',
	'spans',
	'lineStyles',
	'fontSize',
	'fontFamily',
	'weight',
	'italic',
	'letterSpacing',
	'textTransform',
	'listStyle',
];

/**
 * A point text box made `w` wide without moving its text: it grows away
 * from the edge the text is aligned to (to both sides when centred), along
 * the text's own line when the layer is turned. The renderer turns a layer
 * around the middle of its box, so that middle is what has to move.
 *
 * @param {Object} box Text layer ( x, y, w, h, rot, align ).
 * @param {number} w   The new width.
 * @return {Object} { x, y, w }.
 */
function widenPointText( box, w ) {
	const centred = 'center' === box.align;
	// Whole pixels stay whole: a centred box grows by an even amount.
	if ( centred && ! box.rot ) {
		w = box.w + 2 * Math.ceil( ( w - box.w ) / 2 );
	}
	const by = w - box.w;
	let shift = by / 2;
	if ( centred ) {
		shift = 0;
	} else if ( 'right' === box.align ) {
		shift = -by / 2;
	}
	const rad = ( ( box.rot || 0 ) * Math.PI ) / 180;
	const cx = box.x + box.w / 2 + shift * Math.cos( rad );
	const cy = box.y + box.h / 2 + shift * Math.sin( rad );
	return { x: cx - w / 2, y: cy - box.h / 2, w };
}

/**
 * Apply a patch to one layer. Custom-path shapes (inserted icons, traced
 * shapes) bake their geometry into `pathD`, so a plain w/h patch never
 * changed what was drawn (v1.4 fix: icons could not be resized). Whenever
 * w/h change and the patch doesn't bring its own pathD, rescale the path
 * (and the stroke width) proportionally, Photoshop-style transform.
 */
function patchLayer( layer, patch ) {
	patch = detachPatchedColorLinks( layer, patch );
	const next = { ...layer, ...patch };
	// Gradient endpoints use document coordinates. Carry their local position
	// with the layer, including group moves and clipping-mask groups. Explicit
	// endpoint patches (drawing, crop/document transforms) remain authoritative.
	if (
		layer.type === 'gradient' &&
		( next.x !== layer.x ||
			next.y !== layer.y ||
			next.w !== layer.w ||
			next.h !== layer.h )
	) {
		const sx = layer.w > 0 ? next.w / layer.w : 1,
			sy = layer.h > 0 ? next.h / layer.h : 1;
		for ( const key of [ 'from', 'to' ] ) {
			if ( layer[ key ] && ! ( key in patch ) ) {
				next[ key ] = {
					x: next.x + ( layer[ key ].x - layer.x ) * sx,
					y: next.y + ( layer[ key ].y - layer.y ) * sy,
				};
			}
		}
	}
	// An ordinary outline edit detaches the editable pen recipe. Native pen
	// edits supply a new recipe; affine resizing keeps its reference space.
	if (
		layer.penPath &&
		! ( 'penPath' in patch ) &&
		'pathD' in patch &&
		patch.pathD !== layer.pathD
	) {
		const resized =
			layer.w > 0 &&
			layer.h > 0 &&
			( next.w !== layer.w || next.h !== layer.h )
				? scalePathD( layer.pathD, next.w / layer.w, next.h / layer.h )
				: layer.pathD;
		if ( patch.pathD !== resized ) {
			next.penPath = null;
		}
	}

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
		! layer.textFit &&
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
		// (v1.156.2 / v1.210.0), which scales below. Fluid Text (v1.429)
		// owns the box: never auto-size it.
		'text' === layer.type &&
		! layer.textFit &&
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
	} else if (
		// Leading, paragraph spacing or new text from the panel (v1.429):
		// the box follows the content, or lines fall out of the buffer.
		// Point text hugs; a drawn box only grows. A patch that brings its
		// own height (the edit overlay) is left alone.
		'text' === layer.type &&
		! layer.textFit &&
		! layer.textPath &&
		! layer.shapeBox &&
		! ( 'h' in patch ) &&
		( 'paragraphSpacing' in patch ||
			'lineHeight' in patch ||
			( 'text' in patch && ! layer.fixedWidth ) )
	) {
		try {
			const need = measureTextHeight( next );
			next.h = layer.fixedWidth ? Math.max( next.h, need ) : need;
		} catch ( e ) {
			// Headless without a canvas: keep the height.
		}
	}
	if (
		// Point text: the box follows its lines in WIDTH too. The height
		// has always hugged the content, the width never did, so a line
		// typed longer than its box ran out of the buffer the renderer
		// draws a text into (the box plus half a font size) and lost its
		// ends on the canvas. The box only GROWS, and away from the edge
		// the text is aligned to, so the text stays where it is - where
		// the edit field showed it while it was typed. A patch that sets
		// the width itself (handles, scaling) is left alone; area text
		// wraps, and fluid, path, shape, arc and warped text own their box.
		// So does a layout lockup: its lines are FITTED to the box, and a
		// line that comes out two pixels wider by rounding must not move
		// the box it was fitted to.
		'text' === layer.type &&
		! next.fixedWidth &&
		! next.textFit &&
		! next.textLayout &&
		! next.textPath &&
		! next.shapeBox &&
		! next.curve &&
		! next.quad &&
		! ( 'w' in patch ) &&
		LINE_WIDTH_KEYS.some( ( key ) => key in patch )
	) {
		try {
			const need = measureTextWidth( next );
			const has = next.w || 0;
			// A box that lines were FITTED to (a fluid text that was
			// frozen) is a hair narrower than a line by rounding. That
			// is not "too narrow": the same tolerance the fit itself has.
			if ( need > has + Math.max( 2, has * 0.005 ) ) {
				Object.assign( next, widenPointText( next, need ) );
			}
		} catch ( e ) {
			// Headless without a canvas: keep the width.
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
	layers = syncColorLinks( layers );
	const theme =
		readLocal( 'wpie-theme' ) ||
		( 'system' === ( WPIE?.theme || 'dark' )
			? window.matchMedia &&
			  window.matchMedia( '(prefers-color-scheme: light)' ).matches
				? 'light'
				: 'dark'
			: WPIE?.theme || 'dark' );

	const snapshot = {
		label: doc.source?.isNew ? 'New Document' : `Open “${ doc.name }”`,
		doc,
		layers: snapshotLayers( layers ),
		selection: null,
	};

	return {
		doc,
		layers,
		activeId: layers.length ? layers[ layers.length - 1 ].id : null,
		selectedIds: [],
		tool: 'move',
		toolOpts: {
			...JSON.parse( JSON.stringify( DEFAULT_TOOL_OPTS ) ),
			fxbrush: readFxBrushSettings(),
		},
		zoom: 1,
		pan: { x: 0, y: 0 },
		// A visible starting colour. The near-black ink default read as
		// "almost black" in the brush panel and first strokes vanished on
		// dark documents (Thomas, v1.408.2).
		paintTarget: 'fill',
		colorTarget: 'auto',
		colorSelectionRevision: 0,
		gradientStop: 0,
		fgColor: '#ff0000',
		bgColor: '#ffffff',
		selection: null,
		savedSelections: [],
		lastSelection: null,
		selectionPreview: 'outline',
		// Seed from the page-level shared clipboard so a tab switch (which
		// remounts this provider) or a freshly opened editor still offers the
		// last copied layer / style (v1.226.0).
		clipboard: SharedClipboard.getLayerClip(),
		styleClipboard: SharedClipboard.getStyleClip(),
		crop: null,
		// Straighten during a crop (lib/straighten.js): what Cancel restores
		// and the rectangle to grow back to. Dropped with the crop.
		cropStraighten: null,
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
			null === ( readLocal( 'wpie-navigator' ) ?? null )
				? !! WPIE?.demo
				: '1' === readLocal( 'wpie-navigator' ),
		// Like panel pins, Color visibility belongs to this open editor.
		// Do not restore an old open flag into the Create dialog.
		showColorPanel: false,
		colorPanelMode: 'panel',
		colorPanelDetached: false,
		showHistoryPanel: false,
		showThemePanel: false,
		// The brush panel is ON by default: it is the whole point of the
		// brush rebuild, and a panel nobody finds is a panel nobody uses.
		// It only SHOWS for paint tools, so it costs nothing elsewhere.
		showBrushPanel:
			null === ( readLocal( 'wpie-brush-panel' ) ?? null )
				? true
				: '1' === readLocal( 'wpie-brush-panel' ),
		// The shape panel follows it, for the same reason: shapes are held
		// and tuned like a brush, not configured once in a dialog. It only
		// SHOWS in shape context - the shape tool, or a shape layer picked
		// up with move/select - so it costs nothing elsewhere.
		showPenPanel: readLocal( 'wpie-pen-panel' ) !== '0',
		showRepeatPanel: readLocal( 'wpie-repeat-panel' ) !== '0',
		stampSources: [],
		showSelectionPanel: readLocal( 'wpie-selection-panel' ) !== '0',
		showStampPanel: readLocal( 'wpie-stamp-panel' ) !== '0',
		showFxBrushPanel: readLocal( 'wpie-fxbrush-panel' ) !== '0',
		showCropPanel: readLocal( 'wpie-crop-panel' ) !== '0',
		showBucketPanel: readLocal( 'wpie-bucket-panel' ) !== '0',
		showTextPanel: readLocal( 'wpie-text-panel' ) !== '0',
		showMaskPanel: readLocal( 'wpie-mask-panel' ) !== '0',
		maskPreview: 'overlay',
		showShapePanel:
			null === ( readLocal( 'wpie-shape-panel' ) ?? null )
				? true
				: '1' === readLocal( 'wpie-shape-panel' ),
		compare: false,
		revealPasteboard: false, // v1.379.1: paint off-canvas content
		proof: null, // CVD proofing mode (view-only, v1.1)
		previewPost: null, // dynamic templates E1: {id,title,ctx}, view-only
		timeline: { on: false, onion: false }, // animation bar (v1.1)
		// Bottom docks (v1.35): the library tray + pages bar stack with the
		// timeline and can be shown/hidden from the View menu.
		libraryHidden: '1' === readLocal( 'wpie-library-hidden' ),
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
 * - A selection INSIDE a group puts the new layer into that same group,
 *   right above the selected member (Thomas, 19.10.2026; until then it
 *   anchored on the whole group, his call of 11.08.2026).
 * - Except a group something else keeps: one a generator owns (a diagram,
 *   a showcase), the Repeat wrapper around a source and its copies, or a
 *   locked one. A studio rebuilds its group from its own settings and would
 *   silently drop a stranger, Repeat is one unit, and locked means hands
 *   off. There the new layer goes above the whole closed group.
 * - A layer that already names a `parent` is a studio building a group,
 *   child by child. Those keep appending, so no extension has to change.
 * - With several layers selected the topmost decides.
 *
 * @param {Object} state Editor state.
 * @param {Object} layer The layer about to be added.
 * @return {{index: number, parent: (string|null)}} Where to splice it, and
 *                                                  the group it joins.
 */
export function insertPlace( state, layer ) {
	const layers = state.layers || [];
	if ( ! layer || layer.parent ) {
		return { index: layers.length, parent: null };
	}
	const anchors =
		state.selectedIds && state.selectedIds.length
			? state.selectedIds
			: [ state.activeId ];
	const byId = new Map( layers.map( ( l ) => [ l.id, l ] ) );
	const closed = ( g ) =>
		!! g && ( !! g.generator || !! g.repeatGroup || !! g.locked );
	// The layer the new one sits right above: the selected one, or the
	// outermost closed group around it.
	const anchorOf = ( id ) => {
		let anchor = byId.get( id );
		const seen = new Set();
		for ( let cur = anchor; cur && cur.parent && ! seen.has( cur.id );  ) {
			seen.add( cur.id );
			const up = byId.get( cur.parent );
			if ( ! up ) {
				break;
			}
			if ( closed( up ) ) {
				anchor = up;
			}
			cur = up;
		}
		return anchor;
	};
	let best = null;
	let at = -1;
	for ( const id of anchors ) {
		const anchor = id ? anchorOf( id ) : null;
		const i = anchor ? layers.indexOf( anchor ) : -1;
		if ( i > at ) {
			at = i;
			best = anchor;
		}
	}
	if ( ! best ) {
		return { index: layers.length, parent: null };
	}
	return {
		index: at + 1,
		parent: best.parent && byId.has( best.parent ) ? best.parent : null,
	};
}

export function reducer( state, action ) {
	const next = reduceEditorState( state, action );
	const reselectObject =
		[ 'SET_ACTIVE', 'SET_SELECTED' ].includes( action.type ) &&
		next.activeId &&
		[ 'fg', 'bg', 'gradientTool' ].includes( next.colorTarget );
	if (
		next.activeId === state.activeId &&
		action.type !== 'LOAD_DOCUMENT' &&
		! reselectObject
	) {
		return next;
	}
	// A new selection shows its own paint immediately. Explicit stroke/stop
	// choices remain stable while editing that same object, including Undo.
	const layer = next.layers.find( ( item ) => item.id === next.activeId );
	return {
		...next,
		colorTarget: 'auto',
		paintTarget:
			layer?.type === 'shape' && layer.shape === 'line'
				? 'stroke'
				: 'fill',
		gradientStop: 0,
		colorSelectionRevision: ( state.colorSelectionRevision || 0 ) + 1,
	};
}

function reduceEditorState( state, action ) {
	switch ( action.type ) {
		// The brush panel follows the Navigator's pattern exactly: a stored
		// preference, toggled from the View menu. It is not a seventh tab
		// in the right rail - that grid is three over three and every
		// tutorial video is built on it.
		case 'TOGGLE_BRUSH_PANEL': {
			// `show` makes it an ENSURE (v1.429): the slider button in the
			// paint bars must end with the panel up, never close it.
			const showBrushPanel = action.show ?? ! state.showBrushPanel;
			try {
				siteStorage.setItem(
					'wpie-brush-panel',
					showBrushPanel ? '1' : '0'
				);
			} catch ( e ) {}
			return { ...state, showBrushPanel };
		}
		case 'TOGGLE_SHAPE_PANEL': {
			// `show` makes it an ENSURE rather than a toggle: every entry
			// point into the shape studio (double-click, the context menu,
			// the options bar, the help article) has to end with the panel
			// up, and a plain toggle would close it for whoever already
			// had it open.
			const showShapePanel = action.show ?? ! state.showShapePanel;
			try {
				siteStorage.setItem(
					'wpie-shape-panel',
					showShapePanel ? '1' : '0'
				);
			} catch ( e ) {}
			return { ...state, showShapePanel };
		}
		case 'TOGGLE_SELECTION_PANEL': {
			const showSelectionPanel =
				action.show ?? ! state.showSelectionPanel;
			try {
				siteStorage.setItem(
					'wpie-selection-panel',
					showSelectionPanel ? '1' : '0'
				);
			} catch ( e ) {}
			return { ...state, showSelectionPanel };
		}
		case 'TOGGLE_STAMP_PANEL': {
			const showStampPanel = action.show ?? ! state.showStampPanel;
			try {
				siteStorage.setItem(
					'wpie-stamp-panel',
					showStampPanel ? '1' : '0'
				);
			} catch ( e ) {}
			return { ...state, showStampPanel };
		}
		case 'STAMP_CAPTURE_SOURCE':
		case 'STAMP_SELECT_SOURCE':
		case 'STAMP_CLEAR_HISTORY': {
			const source =
				action.type === 'STAMP_CAPTURE_SOURCE'
					? action.source
					: action.type === 'STAMP_SELECT_SOURCE'
					? state.stampSources.find(
							( item ) => item.id === action.id
					  )
					: null;
			if ( action.type === 'STAMP_SELECT_SOURCE' && ! source ) {
				return state;
			}
			const stampSources =
				action.type === 'STAMP_CAPTURE_SOURCE'
					? [ source, ...state.stampSources ].slice(
							0,
							CLONE_HISTORY_LIMIT
					  )
					: action.type === 'STAMP_CLEAR_HISTORY'
					? []
					: state.stampSources;
			return {
				...state,
				stampSources,
				toolOpts: {
					...state.toolOpts,
					stamp: {
						...state.toolOpts.stamp,
						source,
						offset: null,
						pickingSource: false,
					},
				},
			};
		}
		case 'TOGGLE_BUCKET_PANEL':
		case 'TOGGLE_TEXT_PANEL':
		case 'TOGGLE_MASK_PANEL': {
			const name = {
				TOGGLE_BUCKET_PANEL: 'Bucket',
				TOGGLE_TEXT_PANEL: 'Text',
				TOGGLE_MASK_PANEL: 'Mask',
			}[ action.type ];
			const key = `show${ name }Panel`;
			const show = action.show ?? ! state[ key ];
			try {
				siteStorage.setItem(
					`wpie-${ name.toLowerCase() }-panel`,
					show ? '1' : '0'
				);
			} catch ( e ) {}
			return {
				...state,
				[ key ]: show,
				...( name === 'Mask' && ! show
					? { maskPreview: 'image' }
					: {} ),
			};
		}
		case 'SET_MASK_PREVIEW':
			return [ 'image', 'overlay', 'mask' ].includes( action.value )
				? { ...state, maskPreview: action.value }
				: state;
		case 'TOGGLE_CROP_PANEL': {
			const showCropPanel = action.show ?? ! state.showCropPanel;
			try {
				siteStorage.setItem(
					'wpie-crop-panel',
					showCropPanel ? '1' : '0'
				);
			} catch ( e ) {}
			return { ...state, showCropPanel };
		}
		case 'TOGGLE_FXBRUSH_PANEL': {
			const showFxBrushPanel = action.show ?? ! state.showFxBrushPanel;
			try {
				siteStorage.setItem(
					'wpie-fxbrush-panel',
					showFxBrushPanel ? '1' : '0'
				);
			} catch ( e ) {}
			return { ...state, showFxBrushPanel };
		}
		case 'TOGGLE_REPEAT_PANEL': {
			const showRepeatPanel = action.show ?? ! state.showRepeatPanel;
			try {
				siteStorage.setItem(
					'wpie-repeat-panel',
					showRepeatPanel ? '1' : '0'
				);
			} catch ( e ) {}
			return { ...state, showRepeatPanel };
		}
		// Compatibility entry point used by existing theme cards and extensions.
		// Gradient and Color share a window, pin and visibility state.
		case 'TOGGLE_GRADIENT_PANEL': {
			const showColorPanel = action.show ?? ! state.showColorPanel;
			return {
				...state,
				...colorPanelState( state, { show: showColorPanel } ),
				colorTarget: 'gradientTool',
				gradientPanelReveal: ( state.gradientPanelReveal || 0 ) + 1,
			};
		}
		case 'TOGGLE_PEN_PANEL': {
			const showPenPanel = action.show ?? ! state.showPenPanel;
			try {
				siteStorage.setItem(
					'wpie-pen-panel',
					showPenPanel ? '1' : '0'
				);
			} catch ( e ) {}
			return { ...state, showPenPanel };
		}
		case 'TOGGLE_THEME_PANEL': {
			const showThemePanel = action.show ?? ! state.showThemePanel;
			return {
				...state,
				showThemePanel,
				themePanelReveal:
					( state.themePanelReveal || 0 ) +
					( showThemePanel ? 1 : 0 ),
			};
		}
		case 'TOGGLE_COLOR_PANEL':
			return { ...state, ...colorPanelState( state, action ) };
		case 'TOGGLE_HISTORY_PANEL':
			return {
				...state,
				showHistoryPanel: action.show ?? ! state.showHistoryPanel,
			};
		case 'SET_COLOR_PANEL_DETACHED': {
			const next = { ...state, colorPanelDetached: !! action.detached };
			return {
				...next,
				...colorPanelState( next, { show: true, fromSwatch: true } ),
				...( action.detached && state.rightTab === 'color'
					? { rightTab: 'layers' }
					: {} ),
			};
		}
		case 'TOGGLE_NAVIGATOR': {
			const showNavigator = ! state.showNavigator;
			try {
				siteStorage.setItem(
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
				siteStorage.setItem(
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
			return {
				...state,
				doc: { ...state.doc, ...action.doc },
				// A remembered selection belongs to the previous canvas geometry.
				lastSelection:
					'w' in action.doc || 'h' in action.doc
						? null
						: state.lastSelection,
			};
		case 'SET_LAYERS':
			return { ...state, layers: action.layers };
		case 'ADD_LAYER': {
			const layers = [ ...state.layers ];
			let layer = action.layer;
			let index = action.index;
			if ( undefined === index || null === index ) {
				const place = insertPlace( state, layer );
				index = place.index;
				if ( place.parent ) {
					layer = { ...layer, parent: place.parent };
				}
			}
			layers.splice( index, 0, layer );
			let out = {
				...state,
				layers,
				activeId: layer.id,
				selectedIds: [ layer.id ],
			};
			if ( layer.parent ) {
				// Idempotent membership (v1.335): a caller that inserts a
				// group whose `children` is already filled and then sends one
				// ADD_LAYER per child used to list every child twice, and the
				// editor drew the whole thing on top of itself. Extensions hit
				// this repeatedly (Step Guides report), so the reducer - not
				// each caller - guarantees the id appears once.
				out = reducer( out, {
					type: 'SET_LAYERS',
					layers: out.layers.map( ( l ) =>
						l.id === layer.parent && 'group' === l.type
							? {
									...l,
									children: ( l.children || [] ).includes(
										layer.id
									)
										? l.children
										: [ ...( l.children || [] ), layer.id ],
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
				maskEditId:
					action.id === state.maskEditId ? state.maskEditId : null,
				selectedIds,
				layers: autoDiscloseGroups( state.layers, selectedIds ),
			};
		}
		case 'SET_SELECTED': {
			const selectedIds = action.ids;
			return {
				...state,
				selectedIds,
				maskEditId:
					selectedIds[ selectedIds.length - 1 ] === state.maskEditId
						? state.maskEditId
						: null,
				activeId: selectedIds.length
					? selectedIds[ selectedIds.length - 1 ]
					: null,
				layers: autoDiscloseGroups( state.layers, selectedIds ),
			};
		}
		case 'SET_TOOL': {
			// Explicitly choosing a selection tool starts a fresh selection.
			// Space-hold panning restores the current mode instead.
			const resetSelectionMode =
				[ 'marquee', 'lasso', 'wand' ].includes( action.tool ) &&
				! action.preserveSelectionMode;
			return {
				...state,
				tool: action.tool,
				...( action.tool === 'gradient'
					? {
							...colorPanelState( state, { show: true } ),
							colorTarget: 'gradientTool',
							gradientPanelReveal:
								( state.gradientPanelReveal || 0 ) + 1,
							colorPanelReveal:
								( state.colorPanelReveal || 0 ) + 1,
					  }
					: state.colorTarget === 'gradientTool' &&
					  action.tool !== 'eyedropper'
					? { colorTarget: 'auto' }
					: {} ),
				prevTool: state.tool,
				toolOpts: resetSelectionMode
					? {
							...state.toolOpts,
							[ action.tool ]: {
								...state.toolOpts[ action.tool ],
								combine: 'replace',
							},
					  }
					: state.toolOpts,
			};
		}
		case 'SET_TOOL_OPTS':
			if ( action.tool === 'stamp' ) {
				const stamp = { ...state.toolOpts.stamp, ...action.patch };
				if ( 'aligned' in action.patch || 'source' in action.patch ) {
					stamp.offset = null;
				}
				return { ...state, toolOpts: { ...state.toolOpts, stamp } };
			}
			if ( action.tool === 'fxbrush' ) {
				const fxbrush = patchFxBrushSettings(
					state.toolOpts.fxbrush,
					action.patch
				);
				saveFxBrushSettings( fxbrush );
				return { ...state, toolOpts: { ...state.toolOpts, fxbrush } };
			}
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
		case 'SET_PAINT_TARGET':
			return {
				...state,
				paintTarget: action.target === 'stroke' ? 'stroke' : 'fill',
				colorTarget: 'auto',
				gradientStop:
					action.target === state.paintTarget
						? state.gradientStop
						: 0,
			};
		case 'SET_GRADIENT_STOP':
			return {
				...state,
				gradientStop: Math.max( 0, Math.floor( action.index ) || 0 ),
			};
		case 'SET_COLOR_TARGET': {
			const paintTarget = [ 'stroke', 'outline' ].includes(
				action.target
			)
				? 'stroke'
				: [ 'fill', 'text' ].includes( action.target )
				? 'fill'
				: state.paintTarget;
			return {
				...state,
				colorTarget: action.target,
				paintTarget,
				gradientStop:
					paintTarget === state.paintTarget ? state.gradientStop : 0,
			};
		}
		case 'SET_FG':
			return { ...state, fgColor: action.color };
		case 'SET_BG':
			return { ...state, bgColor: action.color };
		case 'SWAP_COLORS':
			return { ...state, fgColor: state.bgColor, bgColor: state.fgColor };
		case 'SET_SELECTION_FEATHER': {
			if ( ! Number.isFinite( action.feather ) ) {
				return state;
			}
			const feather = Math.max( 0, action.feather );
			const toolOpts = { ...state.toolOpts };
			for ( const tool of [
				'marquee',
				'lasso',
				'wand',
				'smartselect',
			] ) {
				toolOpts[ tool ] = { ...toolOpts[ tool ], feather };
			}
			return {
				...state,
				toolOpts,
				selection:
					state.selection &&
					( state.selection.feather || 0 ) !== feather
						? { ...state.selection, feather }
						: state.selection,
			};
		}
		case 'SET_SELECTION':
			return {
				...state,
				selection: action.selection,
				// Only explicit Deselect remembers a selection. Internal clears
				// after cropping/imports must not restore obsolete coordinates.
				lastSelection:
					action.remember && state.selection && ! action.selection
						? state.selection
						: state.lastSelection,
			};
		case 'RESTORE_SELECTION':
			return ! state.selection && state.lastSelection
				? { ...state, selection: state.lastSelection }
				: state;
		case 'SET_SELECTION_PREVIEW':
			return {
				...state,
				selectionPreview: action.mode === 'mask' ? 'mask' : 'outline',
			};
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
		case 'DELETE_SAVED_SELECTION':
			return {
				...state,
				savedSelections: state.savedSelections.filter(
					( item ) => item.name !== action.name
				),
			};
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
			return {
				...state,
				crop: action.crop,
				cropStraighten: action.crop ? state.cropStraighten : null,
			};
		case 'SET_CROP_STRAIGHTEN':
			return { ...state, cropStraighten: action.value || null };
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
			// Existing commands for History now open its independent window.
			if ( action.tab === 'history' ) {
				return { ...state, showHistoryPanel: true };
			}
			if ( action.tab === 'color' ) {
				return {
					...state,
					...colorPanelState( state, { show: true } ),
				};
			}
			return {
				...state,
				rightTab: action.tab,
				showColorPanel:
					state.colorPanelMode === 'picker'
						? state.showColorPanel
						: !! state.colorPanelDetached && state.showColorPanel,
			};
		case 'SET_MASK_EDIT':
			return {
				...state,
				maskEditId: action.id,
				showMaskPanel: action.id ? true : state.showMaskPanel,
				maskPreview:
					action.id && action.id !== state.maskEditId
						? 'overlay'
						: state.maskPreview,
			};
		case 'LOAD_DOCUMENT': {
			// Replace the whole document (Create dialog / PSD import) and
			// reset the history stack (spec 13.1).
			const snapshot = {
				label: action.label || 'New Document',
				doc: action.doc,
				layers: snapshotLayers( action.layers ),
				selection: null,
			};
			return {
				...state,
				// Saved masks belong to this document; keep them only on its page switches.
				savedSelections: action.keepPages ? state.savedSelections : [],
				stampSources: [],
				lastSelection: null,
				selectionPreview: 'outline',
				toolOpts: {
					...state.toolOpts,
					stamp: {
						...state.toolOpts.stamp,
						source: null,
						offset: null,
						pickingSource: false,
					},
				},
				doc: action.doc,
				layers: action.layers,
				activeId: action.layers.length
					? action.layers[ action.layers.length - 1 ].id
					: null,
				selectedIds: [],
				selection: null,
				crop: null,
				cropStraighten: null,
				maskEditId: null,
				// Page switches keep the pages strip; real document loads
				// (template, PSD, attachment) leave pages mode (v1.11).
				// Page switches keep the strip (keepPages), a real document
				// load drops it - unless the document BRINGS one. The write
				// side has carried pages through serializeDocument() since
				// F02 was closed, and the comment above the autosave call even
				// says a rescue copy must not restore a single page over the
				// real thing; the read side then threw them away right here,
				// so a restored or reopened multi-page design came back with
				// one page and the next save wrote that back to the server.
				pages: action.pages
					? {
							list: action.pages,
							current: action.currentPage ?? 0,
					  }
					: action.keepPages
					? state.pages
					: null,
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
			// The pixels freeze now and encode in the background
			// (snapshotLayers) - a PNG per changed raster on the spot was
			// the hitch after every stroke.
			const snapshot = {
				label: action.label,
				doc: state.doc,
				layers: snapshotLayers( state.layers ),
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
				layers: restoreLayers( snap.layers ),
				maskEditId: snap.layers.some(
					( layer ) => layer.id === state.maskEditId && layer.mask
				)
					? state.maskEditId
					: null,
				selection: snap.selection,
				lastSelection:
					snap.doc.w !== state.doc.w || snap.doc.h !== state.doc.h
						? null
						: state.lastSelection,
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
			return {
				...state,
				history: History.markSaved(
					state.history,
					action.snapshot || null
				),
			};
		default:
			return state;
	}
}

/* ------------------------------- context ------------------------------- */

const EditorContext = createContext( null );

const repeatReducer = withRepeatSync( withColorSync( reducer ) );

export function EditorProvider( { doc, layers, WPIE, children } ) {
	const [ state, dispatch ] = useReducer(
		// Repeat layers derive box, parent and z order from their source (v1.431).
		repeatReducer,
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
		( label ) =>
			numberCommit( dispatch, () =>
				dispatch( { type: 'COMMIT', label } )
			),
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
				numberCommit( dispatch, () =>
					flushSync( () => dispatch( { type: 'COMMIT', label } ) )
				),
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
