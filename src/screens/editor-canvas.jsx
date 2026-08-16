/**
 * Canvas area (spec 05): ONE <canvas> rendered through the shared
 * renderSync pipeline (viewport-sized, DPR-aware, rAF-throttled) + DOM/SVG
 * interaction overlays. All 15 tools route through TOOL_HANDLERS.
 */

import { hasPivot } from '../lib/pivot';
import {
	useRef,
	useState,
	useEffect,
	useLayoutEffect,
	useCallback,
} from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { useEditor, activeLayerOf } from '../store/editor-context';
import { makeText } from '../store/document';
import { isEasyMode } from '../lib/easy-mode';
import { recentColors } from '../lib/user-swatches';
import { FloatPanel } from './panels/float-panel';
import { BrushPanel } from './panels/brush-panel';
import { clampFloat, loadFloats, saveFloats } from '../lib/panel-floats';

/**
 * Tools the brush panel belongs to. It is a TOOL panel, so it comes and
 * goes with the tool rather than sitting there while you move a shape.
 */
const PAINT_TOOLS = [ 'brush', 'pencil', 'eraser' ];
import { getExtensionGenerator } from '../lib/extensions';
import { prefixVersions } from '../lib/prefix-cache';
import { I } from '../icons';
import {
	renderSync,
	sharedImageCache,
	measureTextHeight,
	textCommitHeight,
	layerAlphaAt,
	PIXEL_HIT_ALPHA,
	renderToDataURL,
	sharedImageCache as onionCache,
} from '../lib/raster';
import { vectorizeActiveLayer } from '../lib/ai-actions';
import {
	insertAsset,
	replaceImageOnLayer,
	placeImageIntoShape,
} from '../lib/asset-insert';
import { resolveBindings, bindingLabel } from '../lib/dynamic-content';
import {
	prepareGeneratorLayers,
	needsGeneratorPrepare,
	refreshGeneratorLayer,
} from '../lib/generator-resolve';
import {
	fitView,
	zoomAboutPoint,
	screenToDoc,
	docToScreen,
} from './canvas/use-viewport';
import {
	TOOL_HANDLERS,
	topLayerAt,
	topGroupOf,
	dropTargetsAt,
	ancestorHidden,
	hitTestLayer,
	transformGesture,
	startTransform,
	applyCrop,
	finalizePen,
	pathTextSource,
	insertPathText,
	shapeTextSource,
	insertShapeText,
} from './canvas/tool-handlers';
import { isParametricShape } from '../lib/shape-path';
import {
	SelectionBox,
	DropHint,
	HoverOutline,
	MarchingAnts,
	SmartPoints,
	CropOverlay,
	PenOverlay,
	GridOverlay,
	SmartGuides,
	GuidesOverlay,
	Rulers,
	TipBox,
	DistanceLabels,
	selectionBox,
	canvasEdgeRects,
} from './canvas/overlays';
import { SelectionActionsBar } from './canvas/selection-actions-bar';
import { TextEditOverlay } from './canvas/text-edit-overlay';
import { ImagePanOverlay } from './canvas/image-pan-overlay';
import { PathEditOverlay } from './canvas/path-edit-overlay';
import { Navigator } from './canvas/navigator';
import {
	bindWet,
	wetOverlayLayer,
	wetActive,
	wetFlushNow,
} from './canvas/wet-controller';
import { ScrubLabel } from '../components/scrub-label';
import { ColorWheel } from '../components/color-wheel';
import { ContextBar } from './canvas/context-bar';
import { SmartRefineBar } from './canvas/smart-refine-bar';
import { TextFxPopover } from './canvas/text-fx-popover';
import { socialCropById, safeZoneRect } from '../lib/safe-zones';
import { edgeDistances } from '../lib/snap';
import { proofCssFilter } from '../lib/proof';
import { gifFrameLayers } from '../lib/gif-export';
import * as Ops from '../store/ops';
import { importFiles } from '../lib/import-files';

// The Select tool gets its own white arrow (v1.127.0) - the same glyph as
// its toolbar icon - so you can SEE you are in direct-selection mode.
const SELECT_CURSOR = `url("data:image/svg+xml;charset=utf-8,${ encodeURIComponent(
	'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path d="M6 3l12 9-5.2 1.1L15 19l-2.6 1.2-2.2-5.7L6 17.5V3z" fill="#fff" stroke="#1e1e1e" stroke-width="1.6" stroke-linejoin="round"/></svg>'
) }") 5 3, default`;

const CURSORS = {
	move: 'default',
	select: SELECT_CURSOR,
	wand: 'crosshair',
	smartselect: 'crosshair',
	brush: 'crosshair',
	pencil: 'crosshair',
	eraser: 'crosshair',
	text: 'text',
	shape: 'crosshair',
	pen: 'crosshair',
	zoom: 'zoom-in',
	hand: 'grab',
	eyedropper: 'crosshair',
	crop: 'crosshair',
	marquee: 'crosshair',
	lasso: 'crosshair',
	bucket: 'crosshair',
	gradient: 'crosshair',
	stamp: 'crosshair',
};

// Prefix-cache version tags live in lib/prefix-cache (leaf module, v1.65.5).

/**
 * Right-click size HUD for paint tools (v1.64): a small popover at the
 * cursor with size (and hardness) sliders, so brush/pencil/eraser sizes
 * change without a trip to the options bar. Esc/Enter/outside closes.
 */
function BrushHud( { hud, editor, onClose } ) {
	const { state, dispatch } = editor;
	const ref = useRef( null );
	const opts = state.toolOpts[ hud.tool ] || {};
	const set = ( patch ) =>
		dispatch( { type: 'SET_TOOL_OPTS', tool: hud.tool, patch } );

	useEffect( () => {
		const onDown = ( e ) => {
			if ( ref.current && ! ref.current.contains( e.target ) ) {
				onClose();
			}
		};
		const onKey = ( e ) => {
			if ( 'Escape' === e.key || 'Enter' === e.key ) {
				e.stopPropagation();
				onClose();
			}
		};
		document.addEventListener( 'pointerdown', onDown, true );
		document.addEventListener( 'keydown', onKey, true );
		return () => {
			document.removeEventListener( 'pointerdown', onDown, true );
			document.removeEventListener( 'keydown', onKey, true );
		};
	}, [ onClose ] );

	// Initial guess before the popover has ever painted, so there is
	// something on screen the very first frame. Rows shown vary per tool
	// (hardness/color/layer-mode checkbox), so the real size is measured
	// and clamped below rather than trusted here.
	const [ pos, setPos ] = useState( () => ( {
		left: Math.max( 8, Math.min( hud.x, window.innerWidth - 260 ) ),
		top: Math.max( 8, Math.min( hud.y, window.innerHeight - 130 ) ),
	} ) );
	// Runs before paint: reads the popover's real rendered box and clamps
	// against that instead of a guessed width/height, so a right-click near
	// the window edge never pushes rows (or the layer-mode checkbox) off
	// screen. Re-measures whenever the HUD moves or the tool changes, since
	// different tools show different rows and thus a different box size.
	useLayoutEffect( () => {
		if ( ! ref.current ) {
			return;
		}
		const { width, height } = ref.current.getBoundingClientRect();
		setPos( {
			left: Math.max(
				8,
				Math.min( hud.x, window.innerWidth - width - 8 )
			),
			top: Math.max(
				8,
				Math.min( hud.y, window.innerHeight - height - 8 )
			),
		} );
	}, [ hud.x, hud.y, hud.tool ] );

	return (
		<div
			ref={ ref }
			className="brush-hud"
			style={ { left: pos.left, top: pos.top } }
			onPointerDown={ ( e ) => e.stopPropagation() }
			onContextMenu={ ( e ) => e.preventDefault() }
		>
			<div className="brush-hud-rows">
				{ /* The painter's palette (v1.420.0): the style brushes, the
				     colours - including the one under the cursor - size and
				     opacity, and for wet media the missing Dry-now. The old
				     rows were the brush panel in miniature; everything the
				     palette drops lives there. */ }
				{ [ 'brush', 'pencil' ].includes( hud.tool ) && (
					<>
						<span className="bp-sect-head brush-hud-colorhead">
							{ __( 'Color', 'wunderpaint' ) }
							{ hud.pick && hud.pick !== state.fgColor && (
								<button
									type="button"
									className="brush-hud-eyedrop"
									title={ __(
										'Pick the color under the cursor',
										'wunderpaint'
									) }
									aria-label={ __(
										'Pick the color under the cursor',
										'wunderpaint'
									) }
									onClick={ () =>
										dispatch( {
											type: 'SET_FG',
											color: hud.pick,
										} )
									}
								>
									{ I.eyedropper( { size: 12 } ) }
									<span
										className="brush-hud-pickchip"
										style={ { background: hud.pick } }
									/>
								</button>
							) }
						</span>
						<ColorWheel
							color={ state.fgColor }
							onChange={ ( c ) =>
								dispatch( { type: 'SET_FG', color: c } )
							}
						/>
					</>
				) }
				{ [ 'brush', 'pencil' ].includes( hud.tool ) && (
					<div className="brush-hud-swatches">
						{ recentColors()
							.slice( 0, 18 )
							.map( ( c ) => (
								<button
									key={ c }
									type="button"
									className="brush-hud-recent"
									style={ { background: c } }
									aria-label={ c }
									title={ c }
									onClick={ () =>
										dispatch( {
											type: 'SET_FG',
											color: c,
										} )
									}
								/>
							) ) }
					</div>
				) }
				<span className="bp-sect-head">
					{ __( 'Brush', 'wunderpaint' ) }
				</span>
				<label>
					<ScrubLabel
						as="span"
						value={ opts.size || 1 }
						min={ 1 }
						max={ 500 }
						onScrub={ ( v ) => set( { size: v } ) }
					>
						{ __( 'Size', 'wunderpaint' ) }
					</ScrubLabel>
					<input
						type="range"
						min="1"
						max="400"
						value={ opts.size || 1 }
						onChange={ ( e ) => set( { size: +e.target.value } ) }
					/>
					<ScrubLabel
						as="b"
						value={ opts.size || 1 }
						min={ 1 }
						max={ 500 }
						onScrub={ ( v ) => set( { size: v } ) }
					>
						{ opts.size }px
					</ScrubLabel>
				</label>
				{ Number.isFinite( opts.opacity ) && (
					<label>
						<ScrubLabel
							as="span"
							value={ opts.opacity }
							min={ 0 }
							max={ 100 }
							onScrub={ ( v ) => set( { opacity: v } ) }
						>
							{ __( 'Opacity', 'wunderpaint' ) }
						</ScrubLabel>
						<input
							type="range"
							min="0"
							max="100"
							value={ opts.opacity }
							onChange={ ( e ) =>
								set( { opacity: +e.target.value } )
							}
						/>
						<ScrubLabel
							as="b"
							value={ opts.opacity }
							min={ 0 }
							max={ 100 }
							onScrub={ ( v ) => set( { opacity: v } ) }
						>
							{ opts.opacity }%
						</ScrubLabel>
					</label>
				) }
				{ 'brush' === hud.tool && wetActive() && (
					<button
						type="button"
						className="brush-hud-dry"
						onClick={ () => {
							wetFlushNow();
							onClose();
						} }
					>
						{ __( 'Dry now', 'wunderpaint' ) }
					</button>
				) }
			</div>
		</div>
	);
}

/** Previous animation frame ghost (v1.1 timeline onion skin). */
function OnionSkin( { state, stageScreen } ) {
	const [ url, setUrl ] = useState( null );
	const frames = gifFrameLayers( state.layers );
	const idx = frames.findIndex( ( f ) => f.id === state.activeId );
	const prev = idx > 0 ? frames[ idx - 1 ] : null;

	useEffect( () => {
		if ( ! prev ) {
			setUrl( null );
			return;
		}
		let cancelled = false;
		const frameLayers = state.layers.map( ( l ) =>
			! l.parent && l.id !== prev.id ? { ...l, visible: false } : l
		);
		renderToDataURL( { ...state.doc, bg: 'transparent' }, frameLayers, {
			scale: Math.min( 1, 800 / Math.max( state.doc.w, state.doc.h ) ),
			format: 'png',
			cache: onionCache,
		} )
			.then( ( u ) => ! cancelled && setUrl( u ) )
			.catch( () => {} );
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ prev?.id, state.layers, state.doc ] );

	if ( ! url || ! prev ) {
		return null;
	}
	return (
		<img
			src={ url }
			alt=""
			style={ {
				position: 'absolute',
				left: stageScreen.x,
				top: stageScreen.y,
				width: stageScreen.w,
				height: stageScreen.h,
				opacity: 0.35,
				pointerEvents: 'none',
				zIndex: 5,
			} }
		/>
	);
}

export function EditorCanvas( { viewApi, extras } ) {
	const editor = useEditor();
	const activeLayer = activeLayerOf( editor.state );
	const [ measure, setMeasure ] = useState( null ); // Alt = measure (v0.7)
	const [ altDown, setAltDown ] = useState( false ); // zoom-out cursor (v1.0.2)
	const [ canvasMenu, setCanvasMenu ] = useState( null ); // right-click (v0.7)
	const [ imagePanId, setImagePanId ] = useState( null ); // crop pan (v1.116)
	const [ pathEditId, setPathEditId ] = useState( null ); // anchors (v1.118)
	// Layer a dragged-over file would replace or fill (v1.363.0).
	const [ dropHint, setDropHint ] = useState( null );
	const dropHintRaf = useRef( 0 );
	// Unit a click would select while hovering (v1.365.0).
	const [ hoverId, setHoverId ] = useState( null );
	const hoverRaf = useRef( 0 );
	// Smart Select refine bar dismissal (v1.125): remembers WHICH smart
	// selection was closed, so the next click shows the bar again.
	const [ refineDismissed, setRefineDismissed ] = useState( null );
	// Floating text-effect settings card (v1.142.0), opened by the
	// Effects panel tiles via a window event.
	const [ fxPopover, setFxPopover ] = useState( null );
	useEffect( () => {
		const onOpen = ( e ) => setFxPopover( e.detail?.id || null );
		window.addEventListener( 'wpie-fx-settings', onOpen );
		return () => window.removeEventListener( 'wpie-fx-settings', onOpen );
	}, [] );
	// Pro "Text" tool button (editor-toolbar): drop a centered text BOX and
	// open it for typing at once — one click, same ease as Easy Mode, but a
	// growing area box (fixedWidth) so pasted paragraphs wrap and the box
	// stretches to fit instead of running off as one endless line (v1.179.0).
	useEffect( () => {
		const onInsert = () => {
			const st = editorRef.current.state;
			const o = st.toolOpts.text || {};
			const fontSize = Math.max(
				o.fontSize || 48,
				Math.round( Math.min( st.doc.w, st.doc.h ) * 0.045 )
			);
			const w = Math.max(
				fontSize * 6,
				Math.min( Math.round( st.doc.w * 0.5 ), st.doc.w - 20 )
			);
			const layer = makeText( {
				text: '',
				fontSize,
				fontFamily: o.fontFamily || 'Inter',
				weight: o.weight || 700,
				italic: !! o.italic,
				align: o.align || 'center',
				valign: 'middle',
				letterSpacing: o.letterSpacing || 0,
				lineHeight: o.lineHeight || 1.05,
				color: st.fgColor,
				w,
				fixedWidth: true,
			} );
			layer.name = __( 'Text', 'wunderpaint' );
			layer.h = Math.max( layer.h, measureTextHeight( layer ) );
			layer.x = Math.round( ( st.doc.w - w ) / 2 );
			layer.y = Math.round( ( st.doc.h - layer.h ) / 2 );
			editorRef.current.dispatch( { type: 'ADD_LAYER', layer } );
			editorRef.current.commit( __( 'Add Text', 'wunderpaint' ) );
			editorRef.current.dispatch( { type: 'SET_TOOL', tool: 'move' } );
			// Jump straight into editing (empty box self-removes if left blank).
			setEditingTextId( layer.id );
		};
		window.addEventListener( 'wpie-insert-text', onInsert );
		return () => window.removeEventListener( 'wpie-insert-text', onInsert );
	}, [] );
	useEffect( () => {
		if ( ! canvasMenu ) {
			return;
		}
		const closer = ( e ) => {
			if ( ! e.target.closest?.( '.ctx-menu' ) ) {
				setCanvasMenu( null );
			}
		};
		window.addEventListener( 'pointerdown', closer, true );
		return () => window.removeEventListener( 'pointerdown', closer, true );
	}, [ canvasMenu ] );
	const prefixCache = useRef( null ); // v0.7 prefix compositing cache

	// Track Alt so the zoom tool can flip its cursor (v1.0.2).
	useEffect( () => {
		const down = ( e ) => 'Alt' === e.key && setAltDown( true );
		const up = ( e ) => 'Alt' === e.key && setAltDown( false );
		const blur = () => setAltDown( false );
		window.addEventListener( 'keydown', down );
		window.addEventListener( 'keyup', up );
		window.addEventListener( 'blur', blur );
		return () => {
			window.removeEventListener( 'keydown', down );
			window.removeEventListener( 'keyup', up );
			window.removeEventListener( 'blur', blur );
		};
	}, [] );
	const { state, dispatch } = editor;
	const { doc, layers, zoom, pan, tool, selection, maskEditId } = state;

	const areaRef = useRef( null );
	const brushTipRef = useRef( null );

	// Brush-tip circle follows the pointer without React re-renders (v1.6).
	useEffect( () => {
		const area = areaRef.current;
		if ( ! area ) {
			return;
		}
		const move = ( e ) => {
			const el = brushTipRef.current;
			if ( ! el ) {
				return;
			}
			// A floating panel sits INSIDE the canvas area, so its pointer
			// moves arrive here too. Without this the brush ring followed
			// the mouse across the panel while the panel's own arrow was
			// hidden by the area's `cursor: none` - so over anything that
			// was not a button, the mouse simply vanished.
			if ( e.target.closest && e.target.closest( '.ed-float-panel' ) ) {
				el.style.visibility = 'hidden';
				return;
			}
			el.style.left = `${ e.clientX }px`;
			el.style.top = `${ e.clientY }px`;
			el.style.visibility = 'visible';
		};
		const hide = () => {
			if ( brushTipRef.current ) {
				brushTipRef.current.style.visibility = 'hidden';
			}
		};
		area.addEventListener( 'pointermove', move );
		area.addEventListener( 'pointerenter', move );
		area.addEventListener( 'pointerleave', hide );
		return () => {
			area.removeEventListener( 'pointermove', move );
			area.removeEventListener( 'pointerenter', move );
			area.removeEventListener( 'pointerleave', hide );
		};
	}, [] );
	const canvasRef = useRef( null );
	const [ draft, setDraft ] = useState( null );
	const [ guides, setGuides ] = useState( [] );
	const [ editingTextId, setEditingTextId ] = useState( null );
	const [ brushHud, setBrushHud ] = useState( null );
	// Where the brush panel sits, remembered per browser exactly like the
	// detached right-rail panels - the same store, the same clamping.
	const [ brushPos, setBrushPosRaw ] = useState( () => {
		const saved = loadFloats().brush;
		// CLEAR OF THE TOOL RAIL. At x = 24 the panel opened straight on
		// top of it: the rail's buttons are 40px wide plus its border, so
		// the first thing a new brush panel did was cover the tools. You
		// can drag it anywhere, but nothing says so, and a beginner reads
		// a covered toolbar as a broken editor rather than as a window in
		// the way.
		return clampFloat( saved || { x: 96, y: 120 } );
	} );
	const setBrushPos = useCallback( ( p ) => {
		const at = clampFloat( p );
		setBrushPosRaw( at );
		saveFloats( { ...loadFloats(), brush: at } );
	}, [] ); // v1.64 right-click size HUD
	const [ rulerCursor, setRulerCursor ] = useState( null );
	const [ areaSize, setAreaSize ] = useState( { w: 0, h: 0 } );
	const renderPending = useRef( false );
	const paintSeq = useRef( 0 );
	const didFit = useRef( false );

	/* ------------------------------ rendering --------------------------- */

	const paint = useCallback( () => {
		renderPending.current = false;
		const canvas = canvasRef.current;
		const area = areaRef.current;
		if ( ! canvas || ! area ) {
			return;
		}
		const dpr = window.devicePixelRatio || 1;
		const w = area.clientWidth;
		const h = area.clientHeight;
		if ( ! w || ! h ) {
			return;
		}
		if (
			canvas.width !== Math.round( w * dpr ) ||
			canvas.height !== Math.round( h * dpr )
		) {
			canvas.width = Math.round( w * dpr );
			canvas.height = Math.round( h * dpr );
			canvas.style.width = w + 'px';
			canvas.style.height = h + 'px';
		}
		const current = editorRef.current.state;
		const currentDraft = draftRef.current;
		let paintedLayers = current.layers;
		if (
			currentDraft &&
			[ 'paint', 'shape' ].includes( currentDraft.kind )
		) {
			paintedLayers = [ ...paintedLayers, currentDraft.layer ];
		}
		if ( currentDraft && 'gradient' === currentDraft.kind ) {
			paintedLayers = [
				...paintedLayers,
				{
					id: '__gradient-draft',
					type: 'gradient',
					visible: true,
					opacity: 0.9,
					blend: 'normal',
					x: 0,
					y: 0,
					w: current.doc.w,
					h: current.doc.h,
					rot: 0,
					mask: null,
					filter: 'none',
					adjust: null,
					styles: null,
					parent: null,
					kind: current.toolOpts.gradient.kind || 'linear',
					from: currentDraft.from,
					to: currentDraft.to,
					stops: current.toolOpts.gradient.stops || [
						{ color: current.fgColor, at: 0 },
						{ color: 'rgba(0,0,0,0)', at: 1 },
					],
				},
			];
		}
		// Hide the text layer being edited (the DOM overlay shows it).
		if ( editingRef.current ) {
			paintedLayers = paintedLayers.map( ( l ) =>
				l.id === editingRef.current ? { ...l, visible: false } : l
			);
		}
		// Dynamic templates E1: with an active post preview, bindings resolve
		// at paint time only; the document and its history stay untouched.
		if ( current.previewPost?.ctx ) {
			paintedLayers = resolveBindings(
				paintedLayers,
				current.previewPost.ctx
			);
		}
		// Wet watercolour: while a wash is wet it lives in an overlay that
		// sits DIRECTLY ABOVE its target layer (same parent, so it stays
		// inside that group) - layers stacked higher stay higher.
		const wet = wetOverlayLayer();
		if ( wet ) {
			const at = paintedLayers.findIndex( ( l ) => l.id === wet.afterId );
			if ( at >= 0 ) {
				paintedLayers = [
					...paintedLayers.slice( 0, at + 1 ),
					{ ...wet.layer, parent: paintedLayers[ at ].parent },
					...paintedLayers.slice( at + 1 ),
				];
			}
		}

		const view = {
			x: -current.pan.x / current.zoom,
			y: -current.pan.y / current.zoom,
			w: w / current.zoom,
			h: h / current.zoom,
		};
		const ctx = canvas.getContext( '2d' );
		// Prefix cache (v0.7): composite the top-level layers BELOW the
		// active layer's root once; repaint only active + above per frame.
		const topLevel = paintedLayers.filter( ( l ) => ! l.parent );
		let rootId = current.activeId;
		{
			let cursor = paintedLayers.find( ( l ) => l.id === rootId );
			while ( cursor?.parent ) {
				cursor = paintedLayers.find( ( l ) => l.id === cursor.parent );
			}
			rootId = cursor?.id || null;
		}
		const activeIdx = rootId
			? topLevel.findIndex( ( l ) => l.id === rootId )
			: -1;
		// Prefix caching stays ON while a wash is wet - switching it off
		// made every water tick recomposite the whole stack, which was
		// half the CPU bill of the first integration. The one case that
		// must NOT cache: the wash dries on a layer BELOW the active one,
		// then its overlay sits inside the prefix and a cached prefix
		// would never see the water move.
		let wetInPrefix = false;
		if ( wet && activeIdx > 0 ) {
			let wr = paintedLayers.find( ( l ) => l.id === wet.afterId );
			while ( wr?.parent ) {
				wr = paintedLayers.find( ( l ) => l.id === wr.parent );
			}
			const wIdx = wr
				? topLevel.findIndex( ( l ) => l.id === wr.id )
				: -1;
			wetInPrefix = wIdx >= 0 && wIdx < activeIdx;
		}
		const sig =
			! wetInPrefix && activeIdx > 0
				? ( current.revealPasteboard ? 'pb|' : '' ) +
				  topLevel
						.slice( 0, activeIdx )
						.map( ( l ) => l.id )
						.join( ',' ) +
				  `|${ current.zoom }|${ current.pan.x }|${ current.pan.y }|${ w }x${ h }|` +
				  prefixVersions(
						paintedLayers,
						topLevel.slice( 0, activeIdx )
				  ).join( ',' )
				: null;
		let base = null;
		if ( sig && prefixCache.current?.sig === sig ) {
			base = { canvas: prefixCache.current.canvas, fromIndex: activeIdx };
		}
		// The paint completes ASYNC after warm(); on a cold cache that can
		// be seconds. A later paint (auto-fit, pan) must then win: without
		// this guard the first open painted the image with the pre-fit
		// view AFTER the fitted paint, stranding it outside the doc frame
		// until the next interaction repainted.
		const seq = ++paintSeq.current;
		sharedImageCache.warm( paintedLayers ).then( () => {
			if ( seq !== paintSeq.current ) {
				return;
			}
			if ( sig && ! base ) {
				const cacheCanvas = document.createElement( 'canvas' );
				cacheCanvas.width = canvas.width;
				cacheCanvas.height = canvas.height;
				renderSync(
					cacheCanvas.getContext( '2d' ),
					current.doc,
					topLevel.slice( 0, activeIdx ),
					{
						scale: current.zoom * dpr,
						viewport: view,
						cache: sharedImageCache,
						revealPasteboard: current.revealPasteboard,
						// Groups in the prefix must resolve their children.
						allLayers: paintedLayers,
					}
				);
				prefixCache.current = { sig, canvas: cacheCanvas };
				base = { canvas: cacheCanvas, fromIndex: activeIdx };
			}
			renderSync( ctx, current.doc, paintedLayers, {
				scale: current.zoom * dpr,
				viewport: view,
				cache: sharedImageCache,
				revealPasteboard: current.revealPasteboard,
				base,
			} );
			paintMaskOverlay( ctx, current, view, dpr );
		} );
	}, [] );

	// Rubylith (v1.11.2, Photoshop parity): while a mask is being edited,
	// tint its HIDDEN areas translucent red so the mask is visible and
	// paintable in place.
	const rubyRef = useRef( null );
	const paintMaskOverlay = ( ctx, current, view, dpr ) => {
		const layer =
			current.maskEditId &&
			current.layers.find( ( l ) => l.id === current.maskEditId );
		const mask = layer?.mask;
		if ( ! mask || mask.enabled === false ) {
			return;
		}
		const source =
			mask.canvas ||
			( 'string' === typeof mask.data
				? sharedImageCache.get( mask.data )
				: null );
		if ( ! source ) {
			return;
		}
		const scale = current.zoom * dpr;
		const docX = -view.x * scale;
		const docY = -view.y * scale;
		const docW = current.doc.w * scale;
		const docH = current.doc.h * scale;
		let ruby = rubyRef.current;
		if ( ! ruby ) {
			ruby = document.createElement( 'canvas' );
			rubyRef.current = ruby;
		}
		if (
			ruby.width !== ctx.canvas.width ||
			ruby.height !== ctx.canvas.height
		) {
			ruby.width = ctx.canvas.width;
			ruby.height = ctx.canvas.height;
		}
		const rctx = ruby.getContext( '2d' );
		rctx.setTransform( 1, 0, 0, 1, 0, 0 );
		rctx.clearRect( 0, 0, ruby.width, ruby.height );
		rctx.fillStyle = '#e5281e';
		rctx.fillRect( docX, docY, docW, docH );
		// The mask stores alpha = visibility: punch the visible part out of
		// the red sheet (inverted masks keep it instead).
		rctx.globalCompositeOperation = mask.inverted
			? 'destination-in'
			: 'destination-out';
		rctx.drawImage( source, docX, docY, docW, docH );
		rctx.globalCompositeOperation = 'source-over';
		ctx.save();
		ctx.setTransform( 1, 0, 0, 1, 0, 0 );
		ctx.globalAlpha = 0.45;
		ctx.drawImage( ruby, 0, 0 );
		ctx.restore();
	};

	const requestRender = useCallback( () => {
		if ( ! renderPending.current ) {
			renderPending.current = true;
			window.requestAnimationFrame( paint );
		}
	}, [ paint ] );

	// Fresh refs for the rAF closure.
	const editorRef = useRef( editor );
	editorRef.current = editor;
	// The wet watercolour controller needs a live editor and a way to ask
	// for a repaint while its wash dries.
	useEffect( () => {
		bindWet( {
			getEditor: () => editorRef.current,
			requestRender,
		} );
	}, [ requestRender ] );
	const draftRef = useRef( draft );
	draftRef.current = draft;
	const editingRef = useRef( editingTextId );
	editingRef.current = editingTextId;

	useEffect( requestRender, [
		layers,
		doc,
		zoom,
		pan,
		draft,
		editingTextId,
		maskEditId,
		requestRender,
	] );

	// Dynamic generator layers (API 2.3): with a post preview active,
	// mockups with template sources re-bake asynchronously, then repaint.
	// Token QR codes and dynamic smart objects ride the same pass.
	// Results memoise per layer + context, so this is a no-op once done.
	useEffect( () => {
		if ( ! state.previewPost?.ctx || ! needsGeneratorPrepare( layers ) ) {
			return undefined;
		}
		let alive = true;
		prepareGeneratorLayers( layers, state.previewPost.ctx ).then( () => {
			if ( alive ) {
				requestRender();
			}
		} );
		return () => {
			alive = false;
		};
	}, [ layers, state.previewPost, requestRender ] );

	// Track area size (also re-renders).
	useEffect( () => {
		const area = areaRef.current;
		if ( ! area ) {
			return;
		}
		const observer = new window.ResizeObserver( () => {
			setAreaSize( { w: area.clientWidth, h: area.clientHeight } );
			requestRender();
		} );
		observer.observe( area );
		setAreaSize( { w: area.clientWidth, h: area.clientHeight } );
		return () => observer.disconnect();
	}, [ requestRender ] );

	/* ------------------------------- view api ---------------------------- */

	const fit = useCallback( () => {
		const area = areaRef.current;
		if ( ! area ) {
			return;
		}
		const view = fitView(
			area.clientWidth,
			area.clientHeight,
			editorRef.current.state.doc.w,
			editorRef.current.state.doc.h
		);
		dispatch( { type: 'SET_VIEW', zoom: view.zoom, pan: view.pan } );
	}, [ dispatch ] );

	useEffect( () => {
		viewApi.current = {
			fit,
			zoomTo: ( z ) => {
				const area = areaRef.current;
				const center = {
					x: area.clientWidth / 2,
					y: area.clientHeight / 2,
				};
				const view = zoomAboutPoint(
					editorRef.current.state.zoom,
					z,
					editorRef.current.state.pan,
					center
				);
				dispatch( {
					type: 'SET_VIEW',
					zoom: view.zoom,
					pan: view.pan,
				} );
			},
			zoomToRect: ( rect ) => {
				const area = areaRef.current;
				const z = Math.min(
					area.clientWidth / rect.w,
					area.clientHeight / rect.h
				);
				dispatch( {
					type: 'SET_VIEW',
					zoom: z,
					pan: {
						x: ( area.clientWidth - rect.w * z ) / 2 - rect.x * z,
						y: ( area.clientHeight - rect.h * z ) / 2 - rect.y * z,
					},
				} );
			},
			applyCrop: () => applyCrop( editorRef.current ),
			invalidate: requestRender,
			commitDraft: () => {
				const st = editorRef.current.state;
				if ( st.freeTransformId ) {
					dispatch( { type: 'SET_FREE_TRANSFORM', id: null } );
					editorRef.current.commit(
						__( 'Free Transform', 'wunderpaint' )
					);
					return true;
				}
				const current = draftRef.current;
				if (
					current &&
					'pen' === current.kind &&
					current.anchors.length > 1
				) {
					setDraft( { ...current, finalizing: true } );
					return true;
				}
				if ( editorRef.current.state.crop ) {
					return applyCrop( editorRef.current );
				}
				return false;
			},
			cancelDraft: () => {
				const st = editorRef.current.state;
				if ( st.freeTransformId ) {
					const layer = st.layers.find(
						( l ) => l.id === st.freeTransformId
					);
					if ( layer ) {
						// Esc = back to the session-start state: an imported
						// Distort/Perspective quad (and a rotation folded into
						// the seed) must survive the cancel (spec 13.6).
						const entry = st.freeTransformEntry;
						dispatch( {
							type: 'UPDATE_LAYER',
							id: layer.id,
							patch: entry
								? { quad: entry.quad, rot: entry.rot }
								: { quad: null },
						} );
					}
					dispatch( { type: 'SET_FREE_TRANSFORM', id: null } );
					return true;
				}
				if ( draftRef.current ) {
					setDraft( null );
					return true;
				}
				if ( editingRef.current ) {
					setEditingTextId( null );
					return true;
				}
				return false;
			},
		};
	}, [ fit, dispatch, requestRender, viewApi ] );

	// Auto-fit on load and on doc-size change (spec 05.1).
	useEffect( () => {
		if (
			areaSize.w &&
			( ! didFit.current ||
				doc.w !== didFit.current.w ||
				doc.h !== didFit.current.h )
		) {
			didFit.current = { w: doc.w, h: doc.h };
			fit();
		}
	}, [ areaSize.w, doc.w, doc.h, fit ] );

	/* ------------------------------- events ------------------------------ */

	/* --------------------------- guides (v0.2) ---------------------------- */

	const setDocGuides = ( docGuides, label ) => {
		editorRef.current.dispatch( {
			type: 'SET_DOC',
			doc: { guides: docGuides },
		} );
		if ( label ) {
			editorRef.current.commit( label );
		}
	};

	const startGuideFromRuler = ( axis, e ) => {
		e.preventDefault();
		e.stopPropagation();
		setDraft( { kind: 'guide', axis, index: -1, pos: null } );
	};

	const guideNear = ( p ) => {
		const current = editorRef.current.state;
		const guidesList = current.doc.guides || [];
		const tolerance = 5 / current.zoom;
		for ( let i = 0; i < guidesList.length; i++ ) {
			const guide = guidesList[ i ];
			const delta =
				'v' === guide.axis
					? Math.abs( p.x - guide.pos )
					: Math.abs( p.y - guide.pos );
			if ( delta <= tolerance ) {
				return i;
			}
		}
		return -1;
	};

	const moveGuide = ( e, p ) => {
		const d = draftRef.current;
		const current = editorRef.current.state;
		const pos = Math.round( 'v' === d.axis ? p.x : p.y );
		const guidesList = [ ...( current.doc.guides || [] ) ];
		if ( -1 === d.index ) {
			guidesList.push( { axis: d.axis, pos } );
			setDraft( { ...d, index: guidesList.length - 1, pos } );
		} else {
			guidesList[ d.index ] = { axis: d.axis, pos };
			setDraft( { ...d, pos } );
		}
		setDocGuides( guidesList );
	};

	const endGuide = ( e ) => {
		const d = draftRef.current;
		setDraft( null );
		const current = editorRef.current.state;
		const rect = areaRef.current.getBoundingClientRect();
		const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
		// Dropping back onto a ruler removes the guide.
		const onRuler = 'v' === d.axis ? screen.x <= 16 : screen.y <= 16;
		const guidesList = [ ...( current.doc.guides || [] ) ];
		if ( -1 !== d.index && ( onRuler || null === d.pos ) ) {
			guidesList.splice( d.index, 1 );
		}
		setDocGuides( guidesList, __( 'Edit guides', 'wunderpaint' ) );
	};

	const buildToolCtx = () => ( {
		editor: editorRef.current,
		extras,
		doc: editorRef.current.state.doc,
		layers: editorRef.current.state.layers,
		opts:
			editorRef.current.state.toolOpts[ editorRef.current.state.tool ] ||
			{},
		fg: editorRef.current.state.fgColor,
		bg: editorRef.current.state.bgColor,
		selection: editorRef.current.state.selection,
		zoom: editorRef.current.state.zoom,
		draft: draftRef.current,
		setDraft,
		setGuides,
		imageCache: sharedImageCache,
		requestRender,
		beginTextEdit: setEditingTextId,
		beginImagePan: setImagePanId,
		beginPathEdit: setPathEditId,
		viewApi: viewApi.current,
	} );

	const pointOf = ( e ) => {
		const rect = areaRef.current.getBoundingClientRect();
		const screenP = { x: e.clientX - rect.left, y: e.clientY - rect.top };
		return {
			screenP,
			p: screenToDoc(
				screenP,
				editorRef.current.state.pan,
				editorRef.current.state.zoom
			),
		};
	};

	const onMouseDown = ( e ) => {
		if ( 0 !== e.button ) {
			return;
		}
		const tc = buildToolCtx();
		const { p, screenP } = pointOf( e );
		// Grab an existing guide under the Move tool (v0.2).
		if (
			'move' === editorRef.current.state.tool &&
			editorRef.current.state.showGuides
		) {
			const guideIdx = guideNear( p );
			if ( -1 !== guideIdx ) {
				const guide = ( editorRef.current.state.doc.guides || [] )[
					guideIdx
				];
				setDraft( {
					kind: 'guide',
					axis: guide.axis,
					index: guideIdx,
					pos: guide.pos,
				} );
				return;
			}
		}
		const handler = TOOL_HANDLERS[ editorRef.current.state.tool ];
		handler?.onDown?.( tc, e, p, screenP );
	};

	const updateMeasure = ( e, p ) => {
		const st = editorRef.current.state;
		const active = st.layers.find( ( l ) => l.id === st.activeId );
		// Not while a handle is being dragged (v1.367). Alt has its own job
		// inside a gesture - resize from the centre, rotate freely, bend one
		// corner - and the measuring rulers on top of that drag are noise
		// over exactly the edge the user is watching.
		if ( draftRef.current ) {
			setMeasure( ( cur ) => ( cur ? null : cur ) );
			return;
		}
		if ( ! e.altKey || 'move' !== st.tool || ! active ) {
			setMeasure( ( cur ) => ( cur ? null : cur ) );
			return;
		}
		const bbox = { x: active.x, y: active.y, w: active.w, h: active.h };
		const rects = canvasEdgeRects( bbox, st.doc.w, st.doc.h );
		// Pixel-accurate (v1.364.0): measure against the layer you SEE,
		// not the box of a transparent overlay above it.
		const hover = topLayerAt( st.layers, p.x, p.y, {
			pixel: true,
			cache: sharedImageCache,
		} );
		if ( hover && hover.id !== active.id ) {
			const gaps = edgeDistances( bbox, {
				x: hover.x,
				y: hover.y,
				w: hover.w,
				h: hover.h,
			} );
			if ( gaps.xLine ) {
				rects.push( { line: gaps.xLine, value: gaps.gapX } );
			}
			if ( gaps.yLine ) {
				rects.push( { line: gaps.yLine, value: gaps.gapY } );
			}
		}
		setMeasure( { rects } );
	};

	// Preview what a click would grab (v1.365.0): the pixel-accurate hit
	// is invisible until you click without it. Same resolution as the
	// click itself - Move auto-selects the outer group, Select the leaf.
	const updateHover = ( e, p ) => {
		const st = editorRef.current.state;
		if (
			! [ 'move', 'select' ].includes( st.tool ) ||
			draftRef.current ||
			editingTextId ||
			pathEditId
		) {
			setHoverId( ( cur ) => ( cur ? null : cur ) );
			return;
		}
		if ( hoverRaf.current ) {
			return;
		}
		const deep = 'select' === st.tool || e.metaKey || e.ctrlKey;
		hoverRaf.current = requestAnimationFrame( () => {
			hoverRaf.current = 0;
			const cur = editorRef.current.state;
			const hit = topLayerAt( cur.layers, p.x, p.y, {
				pixel: true,
				cache: sharedImageCache,
			} );
			const target =
				hit && ( deep ? hit : topGroupOf( cur.layers, hit ) );
			setHoverId(
				target &&
					target.id !== cur.activeId &&
					! cur.selectedIds.includes( target.id )
					? target.id
					: null
			);
		} );
	};

	const onMouseMove = ( e ) => {
		const { p, screenP } = pointOf( e );
		setRulerCursor( screenP );
		updateMeasure( e, p );
		updateHover( e, p );
		const tc = buildToolCtx();
		if ( draftRef.current && 'transform' === draftRef.current.kind ) {
			transformGesture.onMove( tc, e, p );
			return;
		}
		if ( draftRef.current && 'cropHandle' === draftRef.current.kind ) {
			moveCropHandle( tc, e, p );
			return;
		}
		if ( draftRef.current && 'cropMove' === draftRef.current.kind ) {
			const d = draftRef.current;
			const c = editorRef.current.state.crop;
			editorRef.current.dispatch( {
				type: 'SET_CROP',
				crop: {
					...c,
					x: Math.round( p.x - d.dx ),
					y: Math.round( p.y - d.dy ),
				},
			} );
			return;
		}
		if ( draftRef.current && 'guide' === draftRef.current.kind ) {
			moveGuide( e, p );
			return;
		}
		TOOL_HANDLERS[ editorRef.current.state.tool ]?.onMove?.(
			tc,
			e,
			p,
			screenP
		);
	};

	const onMouseUp = ( e ) => {
		const tc = buildToolCtx();
		const { p, screenP } = pointOf( e );
		if ( draftRef.current && 'transform' === draftRef.current.kind ) {
			transformGesture.onUp( tc, e, p );
			return;
		}
		if (
			draftRef.current &&
			( 'cropHandle' === draftRef.current.kind ||
				'cropMove' === draftRef.current.kind )
		) {
			setDraft( null );
			return;
		}
		if ( draftRef.current && 'guide' === draftRef.current.kind ) {
			endGuide( e );
			return;
		}
		TOOL_HANDLERS[ editorRef.current.state.tool ]?.onUp?.(
			tc,
			e,
			p,
			screenP
		);
	};

	const onDblClick = ( e ) => {
		const tc = buildToolCtx();
		const { p } = pointOf( e );
		TOOL_HANDLERS[ editorRef.current.state.tool ]?.onDblClick?.( tc, e, p );
	};

	// Crop-rect corner dragging.
	const moveCropHandle = ( tc, e, p ) => {
		const d = draftRef.current;
		const crop = { ...tc.editor.state.crop };
		if ( d.corner.includes( 'w' ) ) {
			crop.w += crop.x - p.x;
			crop.x = p.x;
		}
		if ( d.corner.includes( 'e' ) ) {
			crop.w = p.x - crop.x;
		}
		if ( d.corner.includes( 'n' ) ) {
			crop.h += crop.y - p.y;
			crop.y = p.y;
		}
		if ( d.corner.includes( 's' ) ) {
			crop.h = p.y - crop.y;
		}
		if ( crop.w > 1 && crop.h > 1 ) {
			tc.editor.dispatch( { type: 'SET_CROP', crop } );
		}
	};

	// ⌘/Ctrl wheel zoom about cursor (spec 05.1).
	useEffect( () => {
		const area = areaRef.current;
		if ( ! area ) {
			return;
		}
		const onWheel = ( e ) => {
			if ( ! ( e.ctrlKey || e.metaKey ) ) {
				return;
			}
			e.preventDefault();
			const rect = area.getBoundingClientRect();
			const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
			const current = editorRef.current.state;
			const view = zoomAboutPoint(
				current.zoom,
				current.zoom * ( e.deltaY < 0 ? 1.1 : 0.9 ),
				current.pan,
				point
			);
			dispatch( { type: 'SET_VIEW', zoom: view.zoom, pan: view.pan } );
		};
		area.addEventListener( 'wheel', onWheel, { passive: false } );
		return () => area.removeEventListener( 'wheel', onWheel );
	}, [ dispatch ] );

	// Mouse-up anywhere ends gestures (except pen).
	useEffect( () => {
		const onUp = ( e ) => {
			const current = draftRef.current;
			if ( ! current || 'pen' === current.kind ) {
				return;
			}
			// Only handle if the event didn't land on the area (handled there).
			if ( areaRef.current && ! areaRef.current.contains( e.target ) ) {
				const tc = buildToolCtx();
				if ( 'transform' === current.kind ) {
					transformGesture.onUp( tc, e, { x: 0, y: 0 } );
				} else {
					TOOL_HANDLERS[ editorRef.current.state.tool ]?.onUp?.(
						tc,
						e,
						{ x: 0, y: 0 }
					);
				}
			}
		};
		window.addEventListener( 'mouseup', onUp );
		return () => window.removeEventListener( 'mouseup', onUp );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [] );

	// Drag & drop / paste import (spec 05.6).
	useEffect( () => {
		const area = areaRef.current;
		if ( ! area ) {
			return;
		}
		const onDrop = ( e ) => {
			e.preventDefault();
			setDropHint( null );
			const rect = area.getBoundingClientRect();
			const p = screenToDoc(
				{ x: e.clientX - rect.left, y: e.clientY - rect.top },
				editorRef.current.state.pan,
				editorRef.current.state.zoom
			);
			// Canva-style swap (v1.115): dropping an image ONTO an image
			// layer replaces its picture inside the existing box (cover
			// crop). Since v1.363.0 an ACTIVE image layer wins no matter
			// where the drop lands (the layer panel is explicit intent),
			// and overlays above - vignettes, glows - no longer swallow
			// the drop where they are transparent. Alt still forces the
			// old insert-as-new-layer behavior.
			const { swap: swapTarget, frame: frameTarget } = e.altKey
				? { swap: null, frame: null }
				: dropTargetsAt(
						editorRef.current.state.layers,
						editorRef.current.state.activeId,
						p.x,
						p.y,
						{ cache: sharedImageCache }
				  );
			// Library-tray tiles drop as asset descriptors (v1.15).
			const assetJson = e.dataTransfer?.getData(
				'application/x-wpie-asset'
			);
			if ( assetJson ) {
				try {
					const asset = JSON.parse( assetJson );
					if (
						swapTarget &&
						[ 'photo', 'upload' ].includes( asset.kind )
					) {
						replaceImageOnLayer(
							editorRef.current,
							extras,
							swapTarget.id,
							{ asset }
						);
						return;
					}
					if (
						frameTarget &&
						[ 'photo', 'upload' ].includes( asset.kind )
					) {
						placeImageIntoShape(
							editorRef.current,
							extras,
							frameTarget.id,
							{ asset }
						);
						return;
					}
					insertAsset( editorRef.current, extras, asset, p );
				} catch ( err ) {
					// Malformed payload, ignore.
				}
				return;
			}
			const files = Array.from( e.dataTransfer?.files || [] );
			if (
				swapTarget &&
				1 === files.length &&
				files[ 0 ].type.startsWith( 'image/' ) &&
				'image/svg+xml' !== files[ 0 ].type
			) {
				replaceImageOnLayer( editorRef.current, extras, swapTarget.id, {
					file: files[ 0 ],
				} );
				return;
			}
			if (
				frameTarget &&
				1 === files.length &&
				files[ 0 ].type.startsWith( 'image/' ) &&
				'image/svg+xml' !== files[ 0 ].type
			) {
				placeImageIntoShape(
					editorRef.current,
					extras,
					frameTarget.id,
					{ file: files[ 0 ] }
				);
				return;
			}
			importFiles( files, editorRef.current, extras, p );
		};
		// Live target hint while dragging a file over the canvas
		// (v1.363.0): frame the layer the drop would replace or fill, so
		// you see the outcome BEFORE letting go. Types only - the drag
		// payload is sealed until drop - so image tiles from the library
		// tray announce themselves via an extra type NAME (v1.363.1).
		const onDragOver = ( e ) => {
			e.preventDefault();
			const types = Array.from( e.dataTransfer?.types || [] );
			const isImage =
				types.includes( 'Files' ) ||
				types.includes( 'application/x-wpie-asset-image' );
			// Several files always insert as new layers (the swap needs
			// exactly one), so a swap frame would lie (v1.364.0). Count
			// FILE items only: a tray drag carries two STRING items
			// (payload + kind marker) and must not look like two files.
			const many =
				Array.from( e.dataTransfer?.items || [] ).filter(
					( item ) => 'file' === item.kind
				).length > 1;
			if ( ! isImage || many || e.altKey ) {
				setDropHint( null );
				return;
			}
			if ( dropHintRaf.current ) {
				return;
			}
			const { clientX, clientY } = e;
			dropHintRaf.current = requestAnimationFrame( () => {
				dropHintRaf.current = 0;
				const rect = area.getBoundingClientRect();
				const p = screenToDoc(
					{ x: clientX - rect.left, y: clientY - rect.top },
					editorRef.current.state.pan,
					editorRef.current.state.zoom
				);
				const t = dropTargetsAt(
					editorRef.current.state.layers,
					editorRef.current.state.activeId,
					p.x,
					p.y,
					{ cache: sharedImageCache }
				);
				setDropHint( ( t.swap || t.frame )?.id ?? null );
			} );
		};
		// Only a REAL exit clears the hint: entering a child element also
		// fires dragleave on the area (drag events have no mouseleave
		// semantics), which made the frame flicker or vanish.
		const onDragLeave = ( e ) => {
			if ( e.relatedTarget && area.contains( e.relatedTarget ) ) {
				return;
			}
			setDropHint( null );
		};
		const onPaste = ( e ) => {
			const files = Array.from( e.clipboardData?.files || [] );
			if ( files.length ) {
				e.preventDefault();
				importFiles( files, editorRef.current, extras, null );
			}
		};
		area.addEventListener( 'drop', onDrop );
		area.addEventListener( 'dragover', onDragOver );
		area.addEventListener( 'dragleave', onDragLeave );
		window.addEventListener( 'paste', onPaste );
		return () => {
			area.removeEventListener( 'drop', onDrop );
			area.removeEventListener( 'dragover', onDragOver );
			area.removeEventListener( 'dragleave', onDragLeave );
			window.removeEventListener( 'paste', onPaste );
			if ( dropHintRaf.current ) {
				cancelAnimationFrame( dropHintRaf.current );
				dropHintRaf.current = 0;
			}
		};
	}, [ extras ] );

	/* ------------------------------- render ------------------------------ */

	const editingLayer = editingTextId
		? layers.find( ( l ) => l.id === editingTextId )
		: null;
	// Photoshop-style brush tip (v1.6): size-carrying tools show a circle
	// of their actual on-canvas diameter instead of the OS cursor.
	const BRUSH_TIP_TOOLS = [ 'brush', 'pencil', 'eraser', 'stamp', 'fxbrush' ];
	const showBrushTip = BRUSH_TIP_TOOLS.includes( tool );
	const brushDiameter = Math.max(
		2,
		( editor.state.toolOpts[ tool ]?.size || 0 ) * zoom
	);

	const cursor = showBrushTip
		? 'none'
		: 'hand' === tool && draft
		? 'grabbing'
		: 'zoom' === tool && altDown
		? 'zoom-out'
		: CURSORS[ tool ] || 'default';
	const stageScreen = {
		x: pan.x,
		y: pan.y,
		w: doc.w * zoom,
		h: doc.h * zoom,
	};

	return (
		<div
			className="ed-canvas-area"
			ref={ areaRef }
			style={ { cursor } }
			role="application"
			aria-label={ __( 'Canvas', 'wunderpaint' ) }
			onContextMenu={ ( e ) => {
				e.preventDefault();
				if ( draftRef.current || editingRef.current ) {
					return;
				}
				// Easy Mode (v1.166): the layer menu is pro territory
				// (masks, smart objects, …); the context bar covers the
				// beginner actions.
				if ( isEasyMode() ) {
					return;
				}
				const st = editorRef.current.state;
				// Paint tools: right-click opens the painter's palette
				// (v1.420.0, was the quick size HUD) instead of the layer
				// menu. The colour under the cursor is sampled NOW, from
				// the composited view - wet paint included - so the
				// palette can offer it as a one-click pick.
				if ( Number.isFinite( st.toolOpts[ st.tool ]?.size ) ) {
					let pick = null;
					try {
						const c = canvasRef.current;
						const r = c.getBoundingClientRect();
						const dpr = window.devicePixelRatio || 1;
						const d = c
							.getContext( '2d' )
							.getImageData(
								Math.round( ( e.clientX - r.left ) * dpr ),
								Math.round( ( e.clientY - r.top ) * dpr ),
								1,
								1
							).data;
						if ( d[ 3 ] > 8 ) {
							const hx = ( v ) =>
								v.toString( 16 ).padStart( 2, '0' );
							pick =
								'#' +
								hx( d[ 0 ] ) +
								hx( d[ 1 ] ) +
								hx( d[ 2 ] );
						}
					} catch ( err ) {
						pick = null;
					}
					setBrushHud( {
						x: e.clientX,
						y: e.clientY,
						tool: st.tool,
						pick,
					} );
					return;
				}
				const { p } = pointOf( e );
				// Rotation-aware (v1.130.0): the raw box test missed or
				// mis-hit rotated layers; hitTestLayer un-rotates first.
				const hits = st.layers
					.filter(
						( l ) =>
							'group' !== l.type &&
							l.visible &&
							! ancestorHidden( st.layers, l ) &&
							hitTestLayer( l, p.x, p.y )
					)
					.reverse()
					.slice( 0, 6 );
				// The menu acts on what's UNDER the cursor, select the top
				// hit; empty space deselects and shows the lean menu (v1.15.1).
				// Keep a multi-selection if a hit is part of it, so Convert to
				// Smart Object takes all selected layers (v1.24.6).
				// Prefer the first layer with actual pixels under the cursor
				// (v1.127.0), so vector stacks act on the element you see.
				if (
					hits.length &&
					! hits.some( ( l ) => st.selectedIds.includes( l.id ) )
				) {
					const solid =
						hits.find( ( l ) => {
							const a = layerAlphaAt(
								l,
								p.x,
								p.y,
								sharedImageCache
							);
							return (
								null === a ||
								a * ( l.opacity ?? 1 ) >= PIXEL_HIT_ALPHA
							);
						} ) || hits[ 0 ];
					dispatch( { type: 'SET_ACTIVE', id: solid.id } );
				} else if ( ! hits.length && st.activeId ) {
					dispatch( { type: 'SET_ACTIVE', id: null } );
				}
				setCanvasMenu( { x: e.clientX, y: e.clientY, p, hits } );
			} }
			onPointerDown={ ( e ) => {
				// Pen/touch draw like the mouse (F16); capture keeps strokes
				// alive when the pointer leaves the area mid-drag.
				if ( 'mouse' !== e.pointerType ) {
					e.currentTarget.setPointerCapture?.( e.pointerId );
				}
				setHoverId( null );
				onMouseDown( e );
			} }
			onPointerMove={ onMouseMove }
			onPointerUp={ onMouseUp }
			onPointerLeave={ () => setHoverId( null ) }
			onDoubleClick={ onDblClick }
		>
			{ /* Stage backdrop: bg checkerboard + drop shadow behind the pixels. */ }
			<div
				className="ed-canvas-stage"
				style={ {
					position: 'absolute',
					left: stageScreen.x,
					top: stageScreen.y,
					width: stageScreen.w,
					height: stageScreen.h,
					background: 'transparent',
					pointerEvents: 'none',
				} }
			/>
			<canvas
				ref={ canvasRef }
				style={ {
					position: 'absolute',
					inset: 0,
					pointerEvents: 'none',
					filter: proofCssFilter( state.proof ) || undefined,
				} }
			/>
			{ state.timeline?.on && state.timeline.onion && (
				<OnionSkin state={ state } stageScreen={ stageScreen } />
			) }
			{ /* Right-click brush size HUD (v1.64). */ }
			{ brushHud && (
				<BrushHud
					hud={ brushHud }
					editor={ editor }
					onClose={ () => setBrushHud( null ) }
				/>
			) }
			{ /* Post preview chip (dynamic templates E1); the brand kit
			     resolving brand.* rides along (v1.251.0) so it is always
			     visible what the preview resolves with. */ }
			{ state.previewPost && (
				<div className="preview-post-chip">
					{ I.link( { size: 12 } ) }
					<span>
						{ state.previewPost.title }
						{ state.previewPost.ctx?.brand?.name
							? ' · ' + state.previewPost.ctx.brand.name
							: '' }
					</span>
					<button
						onClick={ () =>
							dispatch( { type: 'SET_PREVIEW_POST', post: null } )
						}
						aria-label={ __( 'Exit post preview', 'wunderpaint' ) }
						title={ __( 'Exit post preview', 'wunderpaint' ) }
					>
						×
					</button>
				</div>
			) }

			{ state.showGrid && (
				<GridOverlay
					doc={ doc }
					zoom={ zoom }
					pan={ pan }
					size={ state.gridSize }
				/>
			) }
			<MarchingAnts
				selection={ selection }
				draft={ draft }
				zoom={ zoom }
				pan={ pan }
				tint={
					selection?.source === 'smart' &&
					selection !== refineDismissed
				}
			/>
			<SmartPoints
				selection={ selection }
				tool={ tool }
				zoom={ zoom }
				pan={ pan }
			/>
			{ [ 'move', 'select' ].includes( tool ) &&
				! editingTextId &&
				! pathEditId && (
					<SelectionBox
						layers={ layers }
						ids={ state.selectedIds }
						zoom={ zoom }
						pan={ pan }
						rotating={
							'transform' === draft?.kind &&
							'rotate' === draft?.mode
						}
						onHandleDown={ ( layer, mode, handle, e ) => {
							const { p } = pointOf( e );
							startTransform(
								buildToolCtx(),
								layer,
								mode,
								handle,
								p,
								e
							);
						} }
					/>
				) }
			{ /* Frame around the layer a dragged file would land in (v1.363.0). */ }
			{ dropHint &&
				( () => {
					const target = layers.find( ( l ) => l.id === dropHint );
					return target ? (
						<DropHint layer={ target } zoom={ zoom } pan={ pan } />
					) : null;
				} )() }
			{ /* Faint frame around what a click would grab (v1.365.0). */ }
			{ hoverId && ! dropHint && ! draft && (
				<HoverOutline
					layers={ layers }
					id={ hoverId }
					zoom={ zoom }
					pan={ pan }
				/>
			) }
			{ /* Dynamic-template bindings announce themselves (v1.365.0):
			     a chip marks what WordPress will fill in. Hidden while a
			     post preview shows the real content anyway. */ }
			{ [ 'move', 'select' ].includes( tool ) &&
				! editingTextId &&
				! state.previewPost &&
				layers
					.filter(
						( l ) =>
							l.binding &&
							l.visible &&
							'group' !== l.type &&
							! ancestorHidden( layers, l )
					)
					.map( ( l ) => {
						const at = docToScreen( l, pan, zoom );
						return (
							<span
								key={ 'bind-' + l.id }
								className="binding-chip"
								style={ { left: at.x, top: at.y } }
							>
								{ I.link ? I.link( { size: 9 } ) : null }
								{ bindingLabel( l.binding ) }
							</span>
						);
					} ) }
			{ /* Distance to each canvas edge while dragging a layer (v1.19). */ }
			{ draft &&
				'move' === draft.kind &&
				draft.moved &&
				! editingTextId &&
				( () => {
					const box = selectionBox( layers, state.selectedIds );
					return box ? (
						<DistanceLabels
							rects={ canvasEdgeRects( box, doc.w, doc.h ) }
							zoom={ zoom }
							pan={ pan }
						/>
					) : null;
				} )() }
			{ draft && 'rubber' === draft.kind && draft.rect.w > 1 && (
				<div
					style={ {
						position: 'absolute',
						left: draft.rect.x * zoom + pan.x,
						top: draft.rect.y * zoom + pan.y,
						width: draft.rect.w * zoom,
						height: draft.rect.h * zoom,
						border: '1px dashed var(--accent)',
						background: 'var(--accent-soft)',
						pointerEvents: 'none',
					} }
				/>
			) }
			{ /* Dragging a text box previews its bounds live (v1.46.1). */ }
			{ draft &&
				'textbox' === draft.kind &&
				draft.rect &&
				draft.rect.w > 1 && (
					<div
						style={ {
							position: 'absolute',
							left: draft.rect.x * zoom + pan.x,
							top: draft.rect.y * zoom + pan.y,
							width: draft.rect.w * zoom,
							height: draft.rect.h * zoom,
							border: '1px dashed var(--accent)',
							background: 'var(--accent-soft)',
							pointerEvents: 'none',
						} }
					/>
				) }
			{ 'crop' === tool && (
				<>
					<CropOverlay
						crop={ state.crop }
						zoom={ zoom }
						pan={ pan }
						areaW={ areaSize.w }
						areaH={ areaSize.h }
						onHandleDown={ ( corner, e ) => {
							areaRef.current?.setPointerCapture?.( e.pointerId );
							setDraft( { kind: 'cropHandle', corner } );
						} }
						onRectDown={ ( e ) => {
							const { p } = pointOf( e );
							const c = editorRef.current.state.crop;
							areaRef.current?.setPointerCapture?.( e.pointerId );
							setDraft( {
								kind: 'cropMove',
								dx: p.x - c.x,
								dy: p.y - c.y,
							} );
						} }
						onRectDblClick={ () => applyCrop( editorRef.current ) }
					/>
					{ state.crop &&
						String( state.toolOpts.crop.ratio ).startsWith(
							'social:'
						) &&
						( () => {
							const preset = socialCropById(
								state.toolOpts.crop.ratio.slice( 7 )
							);
							if ( ! preset ) {
								return null;
							}
							const zone = safeZoneRect( state.crop, preset );
							return (
								<div
									style={ {
										position: 'absolute',
										left: zone.x * zoom + pan.x,
										top: zone.y * zoom + pan.y,
										width: zone.w * zoom,
										height: zone.h * zoom,
										border: '1.5px dashed rgba(255,255,255,.85)',
										boxShadow: '0 0 0 1px rgba(0,0,0,.4)',
										pointerEvents: 'none',
										zIndex: 32,
									} }
								>
									<span
										style={ {
											position: 'absolute',
											top: 2,
											left: 4,
											fontSize: 10,
											color: '#fff',
											textShadow:
												'0 1px 2px rgba(0,0,0,.8)',
										} }
									>
										{ __( 'Safe zone', 'wunderpaint' ) } ·{ ' ' }
										{ preset.label }
									</span>
								</div>
							);
						} )() }
				</>
			) }
			<PenOverlay
				draft={ draft }
				zoom={ zoom }
				pan={ pan }
				onFinalize={ ( mode ) =>
					mode
						? finalizePen( buildToolCtx(), mode )
						: setDraft( null )
				}
			/>
			{ state.showGuides && (
				<GuidesOverlay
					guides={ doc.guides }
					zoom={ zoom }
					pan={ pan }
					areaW={ areaSize.w }
					areaH={ areaSize.h }
				/>
			) }
			<SmartGuides
				guides={ guides }
				zoom={ zoom }
				pan={ pan }
				areaW={ areaSize.w }
				areaH={ areaSize.h }
			/>
			{ state.showRulers && (
				<Rulers
					doc={ doc }
					zoom={ zoom }
					pan={ pan }
					cursor={ rulerCursor }
					onStartGuide={ startGuideFromRuler }
				/>
			) }
			{ editingLayer && (
				<TextEditOverlay
					layer={ editingLayer }
					zoom={ zoom }
					pan={ pan }
					richTextRef={ extras.richText }
					onCommit={ ( { text, spans } ) => {
						setEditingTextId( null );
						// A fresh text layer left empty is useless, drop it (B4).
						if ( ! text.trim() && ! editingLayer.text ) {
							dispatch( {
								type: 'REMOVE_LAYERS',
								ids: [ editingLayer.id ],
							} );
							return;
						}
						const spansChanged =
							JSON.stringify( spans || null ) !==
							JSON.stringify( editingLayer.spans || null );
						if (
							text !== editingLayer.text ||
							spansChanged ||
							editingLayer.lineStyles
						) {
							// Point text hugs its content; a drawn area-text box keeps its
							// height (grows only on overflow) so valign can centre within it;
							// path/shape text keep their box (v1.229). See textCommitHeight.
							const h = textCommitHeight( {
								...editingLayer,
								text,
								spans,
								lineStyles: null,
							} );
							dispatch( {
								type: 'UPDATE_LAYER',
								id: editingLayer.id,
								patch: {
									text,
									spans,
									lineStyles: null,
									name:
										text.slice( 0, 24 ) ||
										editingLayer.name,
									h,
								},
							} );
							editor.commit( __( 'Edit text', 'wunderpaint' ) );
						}
					} }
					onCancel={ () => {
						setEditingTextId( null );
						// Cancelling a fresh, still-empty text layer removes it (B4).
						if ( ! editingLayer.text ) {
							dispatch( {
								type: 'REMOVE_LAYERS',
								ids: [ editingLayer.id ],
							} );
						}
					} }
				/>
			) }
			{ imagePanId && (
				<ImagePanOverlay
					editor={ editor }
					layerId={ imagePanId }
					zoom={ zoom }
					pan={ pan }
					onDone={ () => setImagePanId( null ) }
					onEditText={ ( id ) => {
						setImagePanId( null );
						dispatch( { type: 'SET_ACTIVE', id } );
						setEditingTextId( id );
					} }
				/>
			) }
			{ pathEditId && (
				<PathEditOverlay
					editor={ editor }
					layerId={ pathEditId }
					zoom={ zoom }
					pan={ pan }
					onDone={ () => setPathEditId( null ) }
				/>
			) }
			{ 'stamp' === tool && state.toolOpts.stamp.source && (
				<div
					style={ {
						position: 'absolute',
						left: state.toolOpts.stamp.source.x * zoom + pan.x - 7,
						top: state.toolOpts.stamp.source.y * zoom + pan.y - 7,
						width: 14,
						height: 14,
						border: '1.5px solid var(--accent)',
						borderRadius: '50%',
						boxShadow: '0 0 0 1px rgba(0,0,0,.4)',
						pointerEvents: 'none',
					} }
				/>
			) }
			{ state.compare && doc.source?.originalUrl && (
				<img
					src={ doc.source.originalUrl }
					alt=""
					style={ {
						position: 'absolute',
						left: pan.x,
						top: pan.y,
						width: doc.w * zoom,
						height: doc.h * zoom,
						pointerEvents: 'none',
						zIndex: 40,
					} }
				/>
			) }
			{ state.selection?.source === 'smart' &&
				state.selection !== refineDismissed && (
					<SmartRefineBar
						editor={ editor }
						extras={ extras }
						onClose={ () => setRefineDismissed( state.selection ) }
					/>
				) }
			{ /* Plain selections get their next steps spelled out (v1.365.0). */ }
			{ state.selection &&
				( state.selection.source !== 'smart' ||
					state.selection === refineDismissed ) &&
				! draft &&
				! editingTextId && (
					<SelectionActionsBar editor={ editor } extras={ extras } />
				) }
			{ fxPopover && 'text' === activeLayer?.type && (
				<TextFxPopover
					editor={ editor }
					layer={ activeLayer }
					fxId={ fxPopover }
					onClose={ () => setFxPopover( null ) }
				/>
			) }
			{ [ 'move', 'select' ].includes( tool ) &&
				activeLayer &&
				! draft &&
				! editingTextId &&
				! imagePanId &&
				! pathEditId &&
				! state.crop && (
					<ContextBar
						editor={ editor }
						extras={ extras }
						layer={ activeLayer }
						zoom={ zoom }
						pan={ pan }
						areaSize={ areaSize }
						viewApi={ extras.viewApi }
					/>
				) }
			{ [ 'brush', 'pencil', 'eraser' ].includes( tool ) &&
				state.toolOpts[ tool ]?.mirror &&
				'off' !== state.toolOpts[ tool ].mirror && (
					<>
						{ [ 'x', 'xy' ].includes(
							state.toolOpts[ tool ].mirror
						) && (
							<div
								style={ {
									position: 'absolute',
									left: ( doc.w / 2 ) * zoom + pan.x,
									top: pan.y,
									width: 1,
									height: doc.h * zoom,
									borderLeft: '1px dashed var(--accent)',
									opacity: 0.6,
									pointerEvents: 'none',
									zIndex: 30,
								} }
							/>
						) }
						{ [ 'y', 'xy' ].includes(
							state.toolOpts[ tool ].mirror
						) && (
							<div
								style={ {
									position: 'absolute',
									left: pan.x,
									top: ( doc.h / 2 ) * zoom + pan.y,
									width: doc.w * zoom,
									height: 1,
									borderTop: '1px dashed var(--accent)',
									opacity: 0.6,
									pointerEvents: 'none',
									zIndex: 30,
								} }
							/>
						) }
					</>
				) }
			{ state.freeTransformId &&
				activeLayer?.quad &&
				activeLayer.id === state.freeTransformId && (
					<>
						{ [ 'tl', 'tr', 'br', 'bl' ].map( ( corner ) => (
							<div
								key={ corner }
								role="presentation"
								style={ {
									position: 'absolute',
									left:
										activeLayer.quad[ corner ].x * zoom +
										pan.x -
										6,
									top:
										activeLayer.quad[ corner ].y * zoom +
										pan.y -
										6,
									width: 12,
									height: 12,
									background: 'var(--accent)',
									border: '2px solid #fff',
									borderRadius: 2,
									cursor: 'grab',
									zIndex: 48,
								} }
								onPointerDown={ ( e ) => {
									e.stopPropagation();
									e.currentTarget.setPointerCapture(
										e.pointerId
									);
									setDraft( {
										kind: 'quad',
										corner,
										startQuad: { ...activeLayer.quad },
									} );
								} }
								onPointerMove={ ( e ) => {
									if ( draftRef.current?.kind !== 'quad' ) {
										return;
									}
									const { p } = pointOf( e );
									const st = editorRef.current.state;
									const layer = st.layers.find(
										( l ) => l.id === st.freeTransformId
									);
									if ( layer ) {
										dispatch( {
											type: 'UPDATE_LAYER',
											id: layer.id,
											patch: {
												quad: {
													...layer.quad,
													[ draftRef.current.corner ]:
														p,
												},
											},
										} );
									}
								} }
								onPointerUp={ () => {
									if ( draftRef.current?.kind === 'quad' ) {
										setDraft( null );
										editor.commit(
											__(
												'Free Transform',
												'wunderpaint'
											)
										);
									}
								} }
							/>
						) ) }
						<div
							className="fab-hint"
							style={ {
								left: 24,
								bottom: 66,
								display: 'flex',
								gap: 6,
								maxWidth: 460,
							} }
						>
							{ __(
								'Free Transform: drag the corners · Enter applies · Esc resets',
								'wunderpaint'
							) }
						</div>
					</>
				) }
			{ canvasMenu && (
				<div
					className="ctx-menu"
					style={ {
						position: 'fixed',
						left: Math.min( canvasMenu.x, window.innerWidth - 200 ),
						top: Math.min( canvasMenu.y, window.innerHeight - 320 ),
						zIndex: 650,
					} }
					onPointerDown={ ( e ) => e.stopPropagation() }
					onMouseDown={ ( e ) => e.stopPropagation() }
				>
					{ ( () => {
						// Sectioned, icon-led, and ONLY applicable entries
						// (v1.15.1, empty-canvas clicks got dead items).
						const target = canvasMenu.hits.length
							? activeLayer
							: null;
						/*
						 * Owner lookup for chart/generator entries
						 * (v1.287.2): the old checks looked at the target
						 * and ONE parent up. That missed every nested
						 * arrangement (a chart child inside a sub-group, a
						 * studio group inside a template wrapper) and the
						 * stale-selection case, where right-clicking a
						 * chart while something else is selected made the
						 * menu act on the selection - "Edit Chart" simply
						 * vanished. The menu's own rule is "act on what's
						 * under the cursor": walk the FULL ancestor chain
						 * of the target and of every hit.
						 */
						const byId = new Map(
							state.layers.map( ( l ) => [ l.id, l ] )
						);
						const ancestorWith = ( l, pred ) => {
							let cur = l;
							let hops = 0;
							while ( cur && hops++ < 32 ) {
								if ( pred( cur ) ) {
									return cur;
								}
								cur = byId.get( cur.parent );
							}
							return null;
						};
						const hitOwner = ( pred ) => {
							if ( target ) {
								const own = ancestorWith( target, pred );
								if ( own ) {
									return own;
								}
							}
							for ( const h of canvasMenu.hits ) {
								const own = ancestorWith( h, pred );
								if ( own ) {
									return own;
								}
							}
							return null;
						};
						const close = ( fn ) => () => {
							fn();
							setCanvasMenu( null );
						};
						const items = [];
						const add = ( icon, label, fn, opts = {} ) =>
							items.push( { icon, label, fn, ...opts } );
						const rule = () => items.push( { divider: true } );
						if ( target ) {
							if ( 'text' === target.type ) {
								add(
									'text',
									__( 'Edit Text', 'wunderpaint' ),
									() => setEditingTextId( target.id )
								);
							} else {
								// Masked/framed text: the text frame sits UNDER
								// the clipped image (or whatever covers it) in the
								// same spot, so a plain double-click reaches the
								// cover, never the text. Offer it here directly
								// from the hit stack under the cursor (v1.179.0).
								const textHit = canvasMenu.hits.find(
									( l ) => 'text' === l.type
								);
								if ( textHit ) {
									add(
										'text',
										__( 'Edit Text', 'wunderpaint' ),
										() => {
											dispatch( {
												type: 'SET_ACTIVE',
												id: textHit.id,
											} );
											setEditingTextId( textHit.id );
										}
									);
								}
							}
							if ( target.qr ) {
								add(
									'qr',
									__( 'Edit QR Code', 'wunderpaint' ),
									() => extras.openQr( target.id )
								);
							}
							if ( target.bg ) {
								add(
									'palette',
									__( 'Edit Background', 'wunderpaint' ),
									() =>
										extras.openBackgroundStudio( target.id )
								);
							}
							if ( target.mockup ) {
								add(
									'image',
									__( 'Edit Mockup', 'wunderpaint' ),
									() => extras.openMockup( target.id )
								);
							}
							{
								// Extension-generated layers (v1.119): the
								// generator stores { id, params } on the
								// layer (or its group) and gets an edit
								// re-entry here.
								const genLayer = hitOwner(
									( l ) => l.generator
								);
								const gen =
									genLayer &&
									getExtensionGenerator(
										genLayer.generator.id
									);
								if ( gen && ( gen.edit || gen.run ) ) {
									add(
										'sparkles',
										sprintf(
											/* translators: %s: generator name. */
											__( 'Edit %s', 'wunderpaint' ),
											gen.label
										),
										() =>
											( gen.edit || gen.run )( {
												editor,
												extras,
												layer: genLayer,
											} )
									);
								}
								// Data-bound generator groups re-pull their
								// records in place (v1.276).
								if (
									gen &&
									'function' === typeof gen.resolve &&
									'group' === genLayer.type
								) {
									add(
										'refresh',
										sprintf(
											/* translators: %s: generator name. */
											__( 'Refresh %s', 'wunderpaint' ),
											gen.label
										),
										() =>
											refreshGeneratorLayer(
												editor,
												genLayer
											)
									);
								}
							}
							if (
								'shape' === target.type &&
								target.pathD &&
								! target.quad
							) {
								add(
									'pen',
									__( 'Edit Path', 'wunderpaint' ),
									() => setPathEditId( target.id )
								);
							}
							if (
								'text' === target.type &&
								target.textPath?.d
							) {
								// Reshape a text-on-path curve directly; the
								// text follows live (v1.212.0).
								add(
									'pen',
									__( 'Edit Path', 'wunderpaint' ),
									() => setPathEditId( target.id )
								);
							}
							if ( isParametricShape( target ) ) {
								// Expand a primitive (ellipse/star/...) into an
								// editable path, then drop straight into anchor
								// editing (v1.210.0).
								add(
									'pen',
									__( 'Convert to Path', 'wunderpaint' ),
									() => {
										if (
											Ops.convertShapeToPathOp(
												editor,
												target.id
											)
										) {
											setPathEditId( target.id );
										}
									}
								);
							}
							if ( pathTextSource( target ) ) {
								// Text on Path without switching tools
								// (v1.156.1) - covers pen strokes too.
								add(
									'text',
									__( 'Text on Path', 'wunderpaint' ),
									() =>
										insertPathText( buildToolCtx(), target )
								);
							}
							if ( shapeTextSource( target ) ) {
								// Flow text INSIDE the shape's silhouette
								// (area text, v1.210.0).
								add(
									'text',
									__( 'Text in Shape', 'wunderpaint' ),
									() =>
										insertShapeText(
											buildToolCtx(),
											target
										)
								);
							}
							if ( 'smart' === target.type ) {
								add(
									'smart',
									__( 'Edit Smart Object', 'wunderpaint' ),
									() =>
										extras.smartObject?.editContents?.(
											target
										)
								);
							}
							{
								// Charts: the hit is usually a child bar/slice,
								// the params live on the group (v1.114).
								const chartGroup = hitOwner( ( l ) => l.chart );
								if ( chartGroup ) {
									const isTbl = String(
										chartGroup.chart?.type || ''
									).startsWith( 'table' );
									add(
										'sliders',
										isTbl
											? __( 'Edit Table', 'wunderpaint' )
											: __( 'Edit Chart', 'wunderpaint' ),
										() => extras.openChart( chartGroup.id )
									);
								}
							}
							if (
								[
									'image',
									'raster',
									'smart',
									'text',
									'shape',
									'gradient',
								].includes( target.type )
							) {
								add(
									'move',
									__( 'Free Transform', 'wunderpaint' ),
									() => Ops.freeTransformOp( editor, extras )
								);
							}
							if ( hasPivot( target ) ) {
								add(
									'rotateCw',
									__( 'Radial Repeat…', 'wunderpaint' ),
									() => Ops.radialRepeatPrompt( editor )
								);
							}
							if (
								[
									'shape',
									'text',
									'stroke',
									'gradient',
								].includes( target.type )
							) {
								add(
									'image',
									__( 'Rasterize', 'wunderpaint' ),
									() => Ops.rasterizeLayerOp( editor )
								);
							}
							if (
								[ 'image', 'raster', 'smart' ].includes(
									target.type
								)
							) {
								// Vectorize where the pixels are (v1.127.0):
								// same tracer as the AI panel button.
								add(
									'pen',
									__( 'Vectorize', 'wunderpaint' ),
									async () => {
										const tid = extras.toasts.toast(
											__( 'Vectorizing…', 'wunderpaint' ),
											{ duration: 0 }
										);
										try {
											const parsed =
												await vectorizeActiveLayer(
													editor
												);
											Ops.placeSvgLayers(
												editor,
												parsed,
												`${ parsed.name } ${ __(
													'vector',
													'wunderpaint'
												) }`,
												__( 'Vectorize', 'wunderpaint' )
											);
											extras.toasts.success(
												sprintf(
													/* translators: %d: shape count. */
													__(
														'Traced into %d editable vector shapes.',
														'wunderpaint'
													),
													parsed.layers.length
												)
											);
										} catch ( err ) {
											extras.toasts.error( err.message );
										} finally {
											extras.toasts.remove( tid );
										}
									}
								);
							}
							if ( items.length ) {
								rule();
							}
							if ( 'group' === target.type ) {
								add(
									'folder',
									__( 'Ungroup', 'wunderpaint' ),
									() => Ops.ungroupOp( editor )
								);
							} else {
								add(
									'folder',
									__( 'Group', 'wunderpaint' ),
									() => Ops.newGroupOp( editor )
								);
							}
							add(
								'mask',
								__( 'Add Layer Mask', 'wunderpaint' ),
								() => Ops.addMaskOp( editor )
							);
							if ( 'group' !== target.type ) {
								add(
									'crop',
									target.clipped
										? __(
												'Release Clipping Mask',
												'wunderpaint'
										  )
										: __(
												'Create Clipping Mask',
												'wunderpaint'
										  ),
									() => Ops.clippingMaskOp( editor )
								);
							}
							add(
								'sparkles',
								__( 'Convert to Smart Object', 'wunderpaint' ),
								() => Ops.convertToSmartOp( editor )
							);
							rule();
							// Copy the layer's whole look (effects, blend, filter, paint) and
							// stamp it onto other layers (v1.226.0).
							add( 'fx', __( 'Copy Styles', 'wunderpaint' ), () =>
								Ops.copyLayerStyles( editor )
							);
							if ( state.styleClipboard ) {
								add(
									'stamp',
									__( 'Paste Styles', 'wunderpaint' ),
									() => Ops.pasteLayerStyles( editor )
								);
							}
							rule();
							// Panel shortcuts (v1.111.1): duplicate/bring/send
							// live in the mini context bar already; the menu
							// jumps straight into the editing panels instead.
							add( 'layers', __( 'Layers', 'wunderpaint' ), () =>
								dispatch( {
									type: 'SET_RIGHT_TAB',
									tab: 'layers',
								} )
							);
							add(
								'sliders',
								__( 'Properties', 'wunderpaint' ),
								() =>
									dispatch( {
										type: 'SET_RIGHT_TAB',
										tab: 'props',
									} )
							);
							add( 'fx', __( 'Effects', 'wunderpaint' ), () =>
								dispatch( {
									type: 'SET_RIGHT_TAB',
									tab: 'effects',
								} )
							);
							add( 'adjust', __( 'Adjust', 'wunderpaint' ), () =>
								dispatch( {
									type: 'SET_RIGHT_TAB',
									tab: 'adjust',
								} )
							);
							add(
								'sparkAI',
								__( 'AI Studio', 'wunderpaint' ),
								() =>
									dispatch( {
										type: 'SET_RIGHT_TAB',
										tab: 'ai',
									} )
							);
							rule();
							add(
								'trash',
								__( 'Delete', 'wunderpaint' ),
								() => Ops.deleteLayers( editor ),
								{ danger: true }
							);
						} else {
							// Empty canvas: only things that make sense with
							// nothing under the cursor. Every label reuses an
							// existing menubar msgid, so this menu costs the
							// translation tables nothing (v1.373.2).
							add( 'plus', __( 'New Layer', 'wunderpaint' ), () =>
								Ops.newLayerOp( editor )
							);
							if ( state.clipboard?.length ) {
								add(
									'duplicate',
									__( 'Paste Layer', 'wunderpaint' ),
									() => Ops.pasteLayers( editor )
								);
							}
							rule();
							add(
								'marquee',
								__( 'Select All', 'wunderpaint' ),
								() => Ops.selectAllOp( editor )
							);
							if ( state.selection ) {
								add(
									'close',
									__( 'Deselect', 'wunderpaint' ),
									() => Ops.deselectOp( editor )
								);
							}
							rule();
							add( 'zoom', __( 'Fit', 'wunderpaint' ), () =>
								fit()
							);
							add( 'zoom', __( '100%', 'wunderpaint' ), () =>
								viewApi.current?.zoomTo( 1 )
							);
							add(
								'grid',
								__( 'Guides & Grid', 'wunderpaint' ),
								() => extras.openGuides()
							);
						}
						return items.map( ( item, i ) =>
							item.divider ? (
								<div key={ i } className="divider" />
							) : (
								<button
									key={ i }
									className={ item.danger ? 'danger' : '' }
									onClick={ close( item.fn ) }
								>
									<span className="ctx-ic">
										{ I[ item.icon ]
											? I[ item.icon ]( { size: 13 } )
											: null }
									</span>
									{ item.label }
								</button>
							)
						);
					} )() }
				</div>
			) }
			{ measure && (
				<DistanceLabels
					rects={ measure.rects }
					zoom={ zoom }
					pan={ pan }
				/>
			) }
			{ state.showBrushPanel && PAINT_TOOLS.includes( tool ) && (
				<FloatPanel
					// One panel serves all three paint tools, so it says
					// which one you are holding rather than always "Brush".
					title={
						'pencil' === tool
							? __( 'Pencil', 'wunderpaint' )
							: 'eraser' === tool
							? __( 'Eraser', 'wunderpaint' )
							: __( 'Brush', 'wunderpaint' )
					}
					icon={ I.brand( { size: 15 } ) }
					// Two columns for the tools that have tips, one for the
					// rest. 300 rather than less because that is the
					// floating panel's own min-width; going under it just
					// gets ignored. The strip and this number move together,
					// or the right side gets clipped - and the TOTAL stays
					// compact: the panel has to stay usable on small
					// monitors. 350 is the measured no-horizontal-scroll
					// minimum with the 134px strip (Thomas, v1.411.5).
					width={
						undefined === state.toolOpts[ tool ]?.tip ? 300 : 350
					}
					pos={ brushPos }
					onMove={ setBrushPos }
					onFront={ () => {} }
					onClose={ () =>
						editor.dispatch( { type: 'TOGGLE_BRUSH_PANEL' } )
					}
				>
					<BrushPanel editor={ editor } />
				</FloatPanel>
			) }
			{ state.showNavigator && (
				<Navigator
					editor={ editor }
					areaSize={ areaSize }
					viewApi={ extras.viewApi }
				/>
			) }
			<TipBox
				tool={ tool }
				opts={ state.toolOpts[ tool ] || {} }
				fg={ state.fgColor }
				selection={ selection }
			/>
			{ showBrushTip && (
				<div
					ref={ brushTipRef }
					className="ed-brush-tip"
					style={ {
						width: brushDiameter,
						height: brushDiameter,
						visibility: 'hidden',
					} }
				/>
			) }
		</div>
	);
}
