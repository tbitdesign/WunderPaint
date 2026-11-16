/**
 * The editor side of the wet watercolour layer (spec 2026-08-14, GPU
 * revision 14.08. after Thomas' fan verdict on the CPU engine).
 *
 * lib/wet-surface-gl.js is the physics ISLAND: simulation and ink render
 * live in one WebGL2 context, and its canvas is handed to the 2D pipeline
 * like any raster - the document renderer stays Canvas 2D, exactly like
 * the 3D studios hand their pictures over. This file is the glue that
 * knows the editor: it rasterizes brush segments into the grid (so all 37
 * tips work), runs the drying ticker, shows the island's canvas as a
 * pseudo layer directly above its target layer, and BAKES the dried
 * result into that layer as one history entry. While a wash is wet it
 * lives here and nowhere else - which is why undo, save and export call
 * runWetFlush() (lib/wet-hooks.js) first.
 *
 * Without WebGL2 float support there is no wet mode at all: wetStrokeDown
 * says no and the brush falls back to the classic static watercolour
 * pass. One engine in production, not two.
 */

import { __ } from '@wordpress/i18n';

import {
	createWetSurfaceGL,
	wetGlAvailable,
	WET_GL_SC as WET_SC,
} from '../../lib/wet-surface-gl';
import { createWetPasteGL } from '../../lib/wet-paste-gl';
import { createWetDryGL } from '../../lib/wet-dry-gl';
import {
	createPace,
	paceFrame,
	stepsWithin,
	STEP_CAP,
	wetReplay,
} from '../../lib/wet-gl-active';
import { registerWetFlush } from '../../lib/wet-hooks';
import {
	FAMILY_OF,
	PAPERS,
	WET_STYLES,
	WET_TUNING_DEFS,
	WET_STYLE_IDS,
	tuned,
	pigmentOf,
	headLoad,
} from '../../lib/wet-styles';
import { bandPigment } from '../../lib/pigment-bands';
import { makeRaster } from '../../store/document';
import { selectionToMaskCanvas } from '../../store/selection';
import { createCanvas } from '../../lib/raster/env';
import { buildRasterCanvas, STAR_SYMMETRY } from '../../lib/raster-layer';
import { getStyle } from '../../lib/paint-engine';
import { stampMaxReach, getTip } from '../../lib/brush-tips';
import { tiltFactors } from '../../lib/pen-dynamics';
import { bristleContact } from '../../lib/bristle-contact';
import { toothTile } from '../../lib/dry-grain';
import { leafTurn, leafPieceFor } from '../../lib/metal-leaf';
import { drawStrokePaths } from '../../lib/raster/styles';
import {
	paintTarget,
	setDocTransform,
	setLayerToDocTransform,
} from './paint-commit';
import { ensureRaster } from './ensure-raster';

const FACTORIES = {
	liquid: createWetSurfaceGL,
	paste: createWetPasteGL,
	// Dust has no neighbour physics and a pencil line is three pixels
	// wide: the dry island runs at one document pixel per cell.
	dry: () => createWetDryGL( { sc: 1 } ),
};
const engines = {};
// Document pixels per cell of an island (the wet islands 2, the dry one 1).
const scOf = ( isle ) => isle?.sc || WET_SC;

// Re-exported for the panel and the tool handlers, which import them here.
export { PAPERS, WET_TUNING_DEFS, WET_STYLE_IDS };

let surface = null; // the ACTIVE island
let bound = null; // { getEditor, requestRender }
let targetId = null; // the layer the wash will dry into
let targetParent = null;
let stroke = null; // params of the stroke being painted, null between
let ticking = false;
let lastTick = 0;
let tickNr = 0;
// The frame budget (wet-gl-active.js paceFrame): what the GPU manages per
// frame, learned across washes - Thomas' notebook froze without it.
const pace = createPace();
// Steps the island had run when the last frame ended: whatever it ran
// since then came from stamp() folding a batch (a rate change per pen
// event), and counts against the next frame's budget.
let stepsSeen = 0;
// A presented picture the editor has not composited yet.
let showPending = false;
// Frames since the island's last full render (see tick).
let sinceFull = 0;
// When the hand last let go: the drying time-lapse eases in from there.
let releasedAt = 0;
// The last frame's length (missedFrames), and how long the last tick
// itself took.
let lastRaw = 1000 / 60;
let tickCost = 0;
// Six times the steps from one frame to the next was a load step the
// frame budget could only learn about from late frames.
const RAFFER_EASE = 400;
let historyLabel = null;
let stopAirListeners = null;
// The PRESENTATION surface: a plain 2D canvas the compositor reads. The
// island's own canvas is a working buffer - it gets CLEARED by every
// region resize and repainted a task later, and the editor's repaint can
// land exactly in that gap (Thomas: "flackert alle paar Sekunden", the
// stroke guide blinking in and out). The pres canvas is only ever
// touched ATOMICALLY: resize/clear + drawImage + geometry snapshot in
// one synchronous block, so the compositor sees old picture or new
// picture, never a blank or a mismatched frame.
let pres = null; // { canvas, ctx, x, y, w, h }
// The FRISKET: a live selection clips the wash, exactly as masking film
// or masking fluid does on paper - the medium still behaves as itself
// inside, and nothing reaches the layer outside. { sel, canvas } in
// document pixels; null without a selection.
let clip = null;
let clipScratch = null;

/*
 * THE KEPT DRY WASH. Dust "sets" a beat after the hand lifts and bakes
 * into the layer as one history entry - but the island used to be emptied
 * with it, and the next stroke knew nothing of the pigment already in the
 * tooth: it reached the same peaks again and left the same pores white.
 * Twelve passes of coloured pencil with the hand lifted between them still
 * showed 56 % bare paper; four passes without lifting, 13 % (analysis of
 * 09.11.2026). Layering IS the technique of pencil, pastel and charcoal.
 *
 * So a dry island is KEPT after it sets: its amounts stay, and so does the
 * BASE - the layer's pixels under it from before its first grain. While a
 * wash lives the layer shows that base and the overlay shows the island;
 * setting writes base + island into the layer. Picking the wash up again
 * takes the island's last bake back out of the layer first, so nothing
 * is ever counted twice.
 *
 * Kept only while it is provably still true: the same layer OBJECT (any
 * edit, move, undo or redo of the layer makes a new one), upright and
 * unscaled, the same style, dials, paper and frisket. Anything else, or
 * two minutes without a stroke, lets it go - then the next stroke starts
 * on the layer's pixels alone, exactly as before.
 */
let kept = null; // { isle, layerId, layer, parent, clip, key, base }
let keptTimer = null;
const KEEP_MS = 120000;
// The base of the living dry wash: a copy carried over from the kept wash,
// until the ground is sliced afresh (a grow, a first stroke).
let baseHeld = null;
let groundFresh = false;

// Islands that have been warmed up, per family and paper, and the ones
// still waiting for an idle moment (wetPrewarm).
const warmed = new Set();
const warmWanted = new Map();
let warmJob = null;

function islandFor( family ) {
	if ( engines[ family ]?.lost ) {
		// The GPU took this island back (a driver reset, or the browser
		// reclaiming contexts on a crowded page). It used to stay in the
		// cache, dead, and every medium of its family fell back to the
		// static pass until a reload. A fresh island serves the next
		// stroke; a wash still living on the old one bakes from its last
		// presented picture first (see bake).
		if ( kept?.isle === engines[ family ] ) {
			kept = null;
		}
		engines[ family ] = null;
		for ( const key of [ ...warmed ] ) {
			if ( key.startsWith( family + ':' ) ) {
				warmed.delete( key );
			}
		}
	}
	if ( ! engines[ family ] && wetGlAvailable() ) {
		try {
			engines[ family ] = FACTORIES[ family ]();
		} catch ( e ) {
			// A driver that refuses a shader: no wet mode, the static
			// style pass serves - never a dead brush.
			engines[ family ] = null;
		}
	}
	return engines[ family ] || null;
}

/** The paper a style paints on: the document's, or its medium's default. */
function paperFor( docPaper, preset ) {
	if ( docPaper && docPaper !== 'auto' ) {
		return docPaper;
	}
	return preset.medium ? 'cold-press' : 'auto';
}

/**
 * Get a style's island ready BEFORE its first stroke. Building one costs
 * a quarter of a second and more (a WebGL context, the shaders, the paper
 * tiles worked out in JavaScript - measured 253 ms for gouache on the
 * server, and integrated graphics compile slower), and it used to be paid
 * inside the first pointerdown with the medium: the stroke started late
 * and its first stretch arrived in one lump. The canvas calls this when a
 * wet style is picked; the work runs when the browser is idle. A living
 * wash is never touched - its paper and region belong to it.
 *
 * @param {string} style    Paint style id.
 * @param {string} docPaper The document's paper setting.
 */
export function wetPrewarm( style, docPaper ) {
	const preset = WET_STYLES[ style ];
	if ( ! preset || ! wetGlAvailable() ) {
		return;
	}
	const family = FAMILY_OF[ style ];
	const paperId = paperFor( docPaper, preset );
	const key = family + ':' + paperId;
	if ( ! warmed.has( key ) ) {
		warmWanted.set( key, { family, paperId } );
		scheduleWarm();
	}
}

/** One waiting warm-up per idle moment, so none of them is a long task. */
function scheduleWarm() {
	if ( warmJob || ! warmWanted.size ) {
		return;
	}
	const run = () => {
		warmJob = null;
		const [ key, { family, paperId } ] = warmWanted.entries().next().value;
		warmWanted.delete( key );
		const isle = islandFor( family );
		if ( isle && ! isle.lost && ! isle.hasRegion() ) {
			if ( isle.setPaper && isle.wpPaper !== paperId ) {
				isle.setPaper( PAPERS[ paperId ] || null );
				isle.wpPaper = paperId;
			}
			// The reservoir's tooth (see wetStrokeDown), cached per paper.
			toothTile(
				PAPERS[
					'auto' === paperId && 'paste' === family
						? 'canvas'
						: paperId
				] || null
			);
			isle.warmUp?.();
			warmed.add( key );
		}
		scheduleWarm();
	};
	warmJob =
		'function' === typeof window.requestIdleCallback
			? window.requestIdleCallback( run, { timeout: 1500 } )
			: window.setTimeout( run, 200 );
}

/** Wire the controller to the living editor. Called by editor-canvas. */
export function bindWet( callbacks ) {
	stopAirListeners?.();
	forgetKept();
	bound = callbacks;
	registerWetFlush( wetFlushNow );
	if ( callbacks ) {
		const stop = () => {
			if ( stroke?.spray ) {
				wetStrokeUp();
			}
		};
		const hidden = () => {
			if ( document.hidden ) {
				stop();
			}
		};
		window.addEventListener( 'blur', stop );
		window.addEventListener( 'pointercancel', stop );
		document.addEventListener( 'visibilitychange', hidden );
		stopAirListeners = () => {
			window.removeEventListener( 'blur', stop );
			window.removeEventListener( 'pointercancel', stop );
			document.removeEventListener( 'visibilitychange', hidden );
		};
	} else {
		stopAirListeners = null;
	}
}

/**
 * The pseudo layer the canvas inserts DIRECTLY ABOVE the target layer, so
 * layers stacked higher stay higher while the wash is wet.
 *
 * @return {Object|null} { layer, afterId } or null while nothing is wet.
 */
export function wetOverlayLayer() {
	if ( ! targetId || ! pres || ! pres.w ) {
		return null;
	}
	return {
		afterId: targetId,
		layer: {
			id: '__wet-overlay',
			type: 'raster',
			visible: true,
			opacity: 1,
			blend: 'normal',
			filter: 'none',
			adjust: null,
			styles: null,
			mask: null,
			rot: 0,
			parent: targetParent,
			x: pres.x,
			y: pres.y,
			w: pres.w,
			h: pres.h,
			canvas: pres.canvas,
		},
	};
}

// The GROUND feed: the liquid engine glazes the target layer's own pixels
// (KM layering in the render) instead of floating as an alpha film - that
// is what makes a yellow wash over dried blue turn green. The slice is
// re-fed whenever the island geometry changes, and right before the bake
// so the baked pixels always glaze the CURRENT layer content.
let groundCanvas = null;
let seedCanvas = null;
let groundKey = '';

/**
 * Convert the ground slice to per-cell pigment and plant it as the wash's
 * SEED (stage 2: rewetting). Grid resolution; the engine merges into
 * virgin cells only, so a re-feed never resurrects lifted pigment.
 */
function seedCells() {
	const rw = surface.rw;
	const rh = surface.rh;
	if ( ! seedCanvas ) {
		seedCanvas = document.createElement( 'canvas' );
	}
	if ( seedCanvas.width !== rw || seedCanvas.height !== rh ) {
		seedCanvas.width = rw;
		seedCanvas.height = rh;
	}
	const sctx = seedCanvas.getContext( '2d', { willReadFrequently: true } );
	sctx.setTransform( 1, 0, 0, 1, 0, 0 );
	sctx.clearRect( 0, 0, rw, rh );
	sctx.drawImage( groundCanvas, 0, 0, rw, rh );
	const img = sctx.getImageData( 0, 0, rw, rh ).data;
	const cells = new Float32Array( rw * rh * 4 );
	for ( let i = 0; i < rw * rh; i++ ) {
		const al = img[ i * 4 + 3 ] / 255;
		if ( al < 0.01 ) {
			continue;
		}
		// What the pixel SHOWS over paper is (1-a) + a*c per channel; K is
		// the transparent-glaze inversion of exactly that, so lifting all
		// of it into the suspension renders as the same colour until the
		// water moves it.
		let sum = 0;
		for ( let ch = 0; ch < 3; ch++ ) {
			const c = 1 - al + ( al * img[ i * 4 + ch ] ) / 255;
			const k = -Math.log( Math.max( c, 1 / 255 ) );
			cells[ i * 4 + ch ] = k;
			sum += k;
		}
		if ( sum < 0.01 ) {
			// White on white: nothing to redissolve, stays virgin.
			cells[ i * 4 ] = 0;
			cells[ i * 4 + 1 ] = 0;
			cells[ i * 4 + 2 ] = 0;
			continue;
		}
		cells[ i * 4 + 3 ] = 2; // 1 + full remaining fraction
	}
	surface.seedGround( cells );
}

function feedGround( reseed ) {
	if (
		! surface ||
		! surface.setGround ||
		! surface.hasRegion() ||
		! bound ||
		! targetId
	) {
		return;
	}
	const dest = bound
		.getEditor()
		.state.layers.find( ( l ) => l.id === targetId );
	// Only a PLAIN layer can be sliced 1:1: anything the renderer applies
	// on top of the raw pixels (filters, adjustments, styles, masks, warp,
	// opacity, blend) would bake into the wash and double up. Those keep
	// the floating film, exactly the pre-glaze behaviour.
	const plain =
		dest &&
		dest.canvas &&
		! dest.quad &&
		! dest.mask &&
		! dest.adjust &&
		( ! dest.filter || 'none' === dest.filter ) &&
		! dest.styles &&
		1 === ( dest.opacity ?? 1 ) &&
		'normal' === ( dest.blend || 'normal' );
	const key = plain
		? [ surface.rx, surface.ry, surface.rw, surface.rh, targetId ].join(
				':'
		  )
		: '';
	if ( key === groundKey ) {
		return;
	}
	groundKey = key;
	if ( ! plain ) {
		surface.setGround( null );
		return;
	}
	const sc = scOf( surface );
	const w = surface.rw * sc;
	const h = surface.rh * sc;
	if ( ! groundCanvas ) {
		groundCanvas = document.createElement( 'canvas' );
	}
	if ( groundCanvas.width !== w || groundCanvas.height !== h ) {
		groundCanvas.width = w;
		groundCanvas.height = h;
	}
	const gctx = groundCanvas.getContext( '2d' );
	gctx.setTransform( 1, 0, 0, 1, 0, 0 );
	gctx.clearRect( 0, 0, w, h );
	setLayerToDocTransform( gctx, dest, surface.rx * sc, surface.ry * sc );
	gctx.drawImage( dest.canvas, 0, 0 );
	surface.setGround( groundCanvas );
	groundFresh = true;
	// The island turns the ground into pigment on the GPU where it can;
	// seedCells is the JavaScript original.
	if ( reseed && ! surface.seedFromGround?.() && surface.seedGround ) {
		seedCells();
	}
}

/**
 * Blit the island onto the presentation surface, atomically - only the
 * part its renders redrew since the last blit, unless the surface itself
 * changed (size, place, frisket).
 *
 * @return {boolean} Whether anything new reached the presentation.
 */
function present() {
	// A lost island draws nothing any more; the presentation keeps the
	// last picture it had - it is what the bake falls back to.
	if ( ! surface || ! surface.hasRegion() || surface.lost ) {
		return false;
	}
	if ( ! pres ) {
		const c = document.createElement( 'canvas' );
		pres = { canvas: c, ctx: c.getContext( '2d' ), x: 0, y: 0, w: 0, h: 0 };
	}
	const w = surface.canvas.width;
	const h = surface.canvas.height;
	const x = surface.rx * scOf( surface );
	const y = surface.ry * scOf( surface );
	// What the island's renders redrew: rects (the tile islands) or one
	// rect (the dry island).
	let list = surface.drawn;
	surface.drawn = null;
	if ( list && ! Array.isArray( list ) ) {
		list = [ list ];
	}
	if (
		pres.canvas.width !== w ||
		pres.canvas.height !== h ||
		pres.x !== x ||
		pres.y !== y ||
		pres.clip !== clip
	) {
		list = [ { x: 0, y: 0, w, h } ];
		if ( pres.canvas.width !== w || pres.canvas.height !== h ) {
			pres.canvas.width = w;
			pres.canvas.height = h;
		}
	}
	if ( ! list || ! list.length ) {
		return false;
	}
	// ONE copy, over the box around everything redrawn. Every drawImage
	// from a WebGL canvas takes a snapshot of its whole drawing buffer
	// first, so a copy per rect cost a full snapshot each (measured: the
	// tiles' own rects made the frames slower, not faster).
	const x0 = Math.min( ...list.map( ( r ) => r.x ) );
	const y0 = Math.min( ...list.map( ( r ) => r.y ) );
	const d = {
		x: x0,
		y: y0,
		w: Math.max( ...list.map( ( r ) => r.x + r.w ) ) - x0,
		h: Math.max( ...list.map( ( r ) => r.y + r.h ) ) - y0,
	};
	const ctx = pres.ctx;
	ctx.save();
	ctx.beginPath();
	ctx.rect( d.x, d.y, d.w, d.h );
	ctx.clip();
	ctx.clearRect( d.x, d.y, d.w, d.h );
	ctx.drawImage( surface.canvas, d.x, d.y, d.w, d.h, d.x, d.y, d.w, d.h );
	if ( clip ) {
		ctx.globalCompositeOperation = 'destination-in';
		ctx.drawImage( clip.canvas, -x, -y );
	}
	ctx.restore();
	pres.x = x;
	pres.y = y;
	pres.w = w;
	pres.h = h;
	pres.clip = clip;
	return true;
}

/* --------------------------- stroke handling --------------------------- */

/**
 * Begin a wet stroke. Decides the target layer NOW and keeps it: a layer
 * switch while the wash dries must not move where it lands.
 *
 * @param {Object} tc Tool context.
 * @param {Object} p  First point, document coordinates.
 * @return {boolean} False when this stroke cannot be wet (the caller then
 *                   falls back to the classic static watercolour pass).
 */
export function wetStrokeDown( tc, p ) {
	const preset = WET_STYLES[ tc.opts.paintStyle ];
	if ( ! bound || ! preset ) {
		return false;
	}
	const family = FAMILY_OF[ tc.opts.paintStyle ];
	const isle = islandFor( family );
	if ( ! isle || isle.lost ) {
		return false;
	}
	const target = paintTarget( {
		layers: tc.layers,
		activeId: tc.editor.state.activeId,
		// ALWAYS 'single': per-stroke layers mean nothing to a living
		// wash, and honouring the (hidden) option would silently disable
		// the wet engine.
		layerMode: 'single',
	} );
	let dest = null;
	if ( 'paint' === target.kind ) {
		// A fresh layer from "New Layer" has no canvas until something
		// paints into it, and an image layer is no raster at all. Both
		// get theirs NOW, through the same ensureRaster the classic pass
		// uses at commit time. Deciding on the missing canvas instead
		// sent the FIRST medium stroke on every new layer down the static
		// style pass and only the second one into the wash (Thomas,
		// 16.09.2026: "wirkt erst beim zweiten Strich"). The one thing
		// that still says no is an image that has not finished loading:
		// the classic pass owns the "still loading" message.
		dest = ensureRaster( tc, target.layer );
		if ( ! dest || ! dest.canvas ) {
			return false;
		}
	} else if ( 'newRaster' === target.kind ) {
		dest = makeRaster( {
			name: __( 'Paint', 'wunderpaint' ),
			x: 0,
			y: 0,
			w: tc.doc.w,
			h: tc.doc.h,
		} );
		dest.canvas = buildRasterCanvas( dest );
		tc.editor.dispatch( {
			type: 'ADD_LAYER',
			layer: dest,
			index: target.index,
		} );
	} else {
		return false;
	}
	// A wash already drying onto ANOTHER layer or living in ANOTHER
	// engine commits first; strokes onto the same layer and family join
	// it and dry as one. So does a wash under a DIFFERENT selection: it
	// was masked by the old one.
	const sel = tc.selection || null;
	if (
		targetId &&
		( targetId !== dest.id ||
			surface !== isle ||
			( clip?.sel || null ) !== sel )
	) {
		wetFlushNow();
	}
	// New bound media have a different render model. Bake before changing it
	// or a sheen/tooth dial would also repaint the preceding unfinished stroke.
	// A tip can carry MATERIAL of its own (leaf size, flakes, wear, droplet
	// size); the island renders everything it holds with one set, so a
	// tip with other material bakes the wash first, too.
	const material = preset.medium
		? getTip( tc.opts.tip || 'round' ).material || null
		: null;
	// The metal's platelets stay small whatever the brush: pigment is
	// pigment (Thomas: leaves of 200 px are tiles, not gold).
	const piece = leafPieceFor( material );
	// Charcoal and pastel count as well: they once shared one key, and a
	// pastel stroke then re-rendered the charcoal still in the island as
	// pastel - with the kept wash and the covering powder, black blotches.
	const materialKey = JSON.stringify( [
		tc.opts.paintStyle,
		tc.opts.wetTuning?.[ tc.opts.paintStyle ] || {},
		material,
		material?.piece ? Math.round( piece ) : 0,
	] );
	if ( 'dry' === family && isle.wpDryMaterial !== materialKey ) {
		if ( targetId ) {
			wetFlushNow();
		}
		// The island renders all it holds with ONE style and one set of
		// dials: a kept wash of another style cannot be carried on.
		if ( kept?.isle === isle ) {
			forgetKept();
		}
		isle.wpDryMaterial = materialKey;
	}
	// The document's paper: applied per island, and a change under a
	// LIVING wash flushes it first - swapping the tooth beneath wet
	// physics would repaint history.
	const paperId = paperFor( tc.doc.paper, preset );
	if ( isle.setPaper && isle.wpPaper !== paperId ) {
		if ( isle.hasRegion() && targetId ) {
			wetFlushNow();
		}
		if ( kept?.isle === isle ) {
			forgetKept();
		}
		isle.setPaper( PAPERS[ paperId ] || null );
		isle.wpPaper = paperId;
	}
	// A kept dry wash on this very sheet is picked up again; one that no
	// longer matches is let go, and with it everything it held.
	let resumed = false;
	if ( kept && ! targetId && kept.isle === isle ) {
		if (
			kept.layer === dest &&
			( kept.clip?.sel || null ) === sel &&
			keepable( isle, dest )
		) {
			resumeKept( tc.editor, dest );
			resumed = true;
		} else {
			forgetKept();
		}
	}
	// A new wash is a new laying of leaf: its own turn and shift.
	if ( ! targetId ) {
		washSeed = Math.random();
	}
	// A wash this stroke joins (see the smudger's look below).
	const joins = !! targetId;
	surface = isle;
	targetId = dest.id;
	targetParent = resumed ? targetParent : dest.parent || null;
	if ( ( clip?.sel || null ) !== sel ) {
		clip = sel
			? {
					sel,
					canvas: selectionToMaskCanvas( sel, tc.doc.w, tc.doc.h, {
						feather: sel.feather,
					} ),
			  }
			: null;
	}
	const opts = tc.opts;
	historyLabel = preset.medium
		? getStyle( opts.paintStyle ).name
		: __( 'Watercolor wash', 'wunderpaint' );
	const tune = tuned( opts.paintStyle, opts );
	const flow = ( opts.flow ?? 100 ) / 100;
	const opac = ( opts.opacity ?? 100 ) / 100;
	stroke = {
		family,
		press: tc.penPressure ?? 1,
		tilt: tc.penTilt ?? 0,
		tip: opts.tip || 'round',
		size: opts.size || 24,
		hardness: opts.hardness ?? 85,
		spacing: opts.spacing,
		scatter: opts.scatter,
		alphaJitter: opts.alphaJitter,
		sizeJitter: opts.sizeJitter,
		mirror: opts.mirror && 'off' !== opts.mirror ? opts.mirror : null,
		docW: tc.doc.w,
		docH: tc.doc.h,
		gran: tune.gran,
	};
	if ( 'liquid' === family ) {
		// Flow is the water, opacity the pigment.
		stroke.water =
			( preset.water[ 0 ] + preset.water[ 1 ] * flow ) * tune.waterMul;
		stroke.pigment = preset.pigment * opac * tune.pigMul;
		// SIX BANDS of absorption (pigment-bands.js): bands 1 to 3 ride
		// where the three channels did, 4 to 6 on the scattering side a
		// transparent wash never used. Blue into yellow is a green.
		const bands = bandPigment( tc.fg, 0, preset.kMul ).k;
		Object.assign( stroke, {
			kr: bands[ 0 ],
			kg: bands[ 1 ],
			kb: bands[ 2 ],
			sr: bands[ 3 ],
			sg: bands[ 4 ],
			sb: bands[ 5 ],
		} );
		surface.setParams( {
			evapK: tune.evapK,
			sogK: tune.sogK,
			korn: tune.korn,
			depK: tune.depK,
			liftK: tune.liftK,
			viscK: tune.visc,
			seedK: tune.seedK ?? 0,
			stainK: tune.stain ?? 0,
			warpK: tune.warp ?? 1,
			bands: 1,
		} );
	} else if ( 'paste' === family ) {
		// Flow is how LOADED the brush is (thickness per pass), opacity
		// the pigment strength of the paste.
		stroke.water =
			( preset.thick[ 0 ] + preset.thick[ 1 ] * flow ) * tune.waterMul;
		stroke.pigment = preset.pigRate * opac;
		// SIX BANDS here too: body paint scatters alike in every band, so
		// one number (sc) carries the scattering and the three channels it
		// used to fill carry bands 4 to 6 of the absorption.
		const body = bandPigment( tc.fg, tune.sBase, preset.kMul );
		Object.assign( stroke, {
			kr: body.k[ 0 ],
			kg: body.k[ 1 ],
			kb: body.k[ 2 ],
			sr: body.k[ 3 ],
			sg: body.k[ 4 ],
			sb: body.k[ 5 ],
			sc: body.s,
		} );
		// How paint LOOKS belongs to the paint, and the island renders all
		// it holds with one look. The smudger brings no paint: in a wash
		// of oil it leaves the oil its body and its gloss (it used to turn
		// the whole island dull the moment it touched it), and on its own,
		// over the layer's dried pixels, it has a look that adds nothing.
		const own = {
			body: preset.body,
			gloss: preset.gloss,
			korn: tune.korn,
			hideK: tune.hide ?? 3,
		};
		const smudger = 'smudge' === opts.paintStyle;
		if ( ! smudger ) {
			isle.wpLook = own;
		} else if ( ! joins ) {
			isle.wpLook = null;
		}
		surface.setParams( {
			bands: 1,
			openK: tune.openK,
			blendK: tune.blendK,
			...( ( smudger && isle.wpLook ) || own ),
			pickK: tune.pickK ?? 0,
			advK: tune.advK ?? 0,
			// Fresh paint lies on top: it hides what it covers the better
			// the more the medium scatters, and open paint underneath
			// stirs in the more the medium blends.
			coverK: 2.2 * ( tune.sBase || 0 ),
			mixK: Math.min( 0.8, 0.25 + 0.35 * ( tune.blendK || 0 ) ),
			// What the tool itself holds and carries along (brush-carry.js):
			// the smudger, which has nothing else.
			carryK: tune.carry ?? 0,
		} );
		// The bristle grooves of this stroke: its own pattern.
		stroke.laneSeed = ( ++laneSeq % 811 ) * 53.7;
		// A tool that carries tells the island where it stands; its film
		// is as large as the head at full pressure, whatever the hand does.
		stroke.carryR =
			( tune.carry ?? 0 ) > 0
				? stampMaxReach( stroke.tip, stroke.size, stroke )
				: 0;
	} else {
		// Dry dust: opacity is the pressure.
		stroke.water = 0;
		stroke.pigment =
			preset.amt *
			opac *
			tune.pigMul *
			( preset.medium ? flow : 1 ) *
			// A head whose mask is drawn thin lays as much as any other
			// (the media that ask for it).
			headLoad( opts.paintStyle, getTip( stroke.tip ) );
		Object.assign( stroke, pigmentOf( tc.fg, 0, preset.kMul ) );
		surface.setParams( {
			tooth: tune.tooth,
			medium: preset.medium || 0,
			sheen: tune.sheen || 0,
			piece,
			leafXf: leafTurn( washSeed ),
			flakes: material?.flakes ? 1 : 0,
			wear: material?.wear ?? 0,
			drop: material?.drop ?? 1,
			opaque: preset.opaque || 0,
		} );
		// Charcoal, pastel, wax and pencil are STICKS: a worn contact face
		// dragged over the tooth. The airbrush and the leaf are not.
		stroke.stick = ! preset.medium || preset.medium < 3;
		// How the medium answers pressure: [smallest size factor, pigment
		// exponent]. A pencil line hardly widens, it darkens; an airbrush
		// trigger meters paint, the spray cone stays put.
		stroke.pressSize = preset.pressSize ?? 0.45;
		stroke.pressExp = preset.pressExp ?? 1.3;
	}
	// The virtual pen for a mouse or a finger (see penMove): only when the
	// device reports no pressure of its own, and never for the airbrush,
	// whose trigger meters paint rather than the hand.
	const taper = ( opts.taper ?? 35 ) / 100;
	stroke.pen =
		! tc.penReal && taper > 0 && opts.paintStyle !== 'airbrush'
			? {
					len: Math.max(
						6,
						Math.min( 140, stroke.size * ( 0.4 + 2.2 * taper ) )
					),
					// The held-back lift-off is also how far the paint
					// trails the cursor, so it stays short.
					hold: Math.max(
						4,
						Math.min( 24, stroke.size * ( 0.2 + 0.9 * taper ) )
					),
					arc: 0,
					queue: [],
					speed: 0,
					t: performance.now(),
			  }
			: null;
	// The RESERVOIR (see drain): the wet media carry a finite charge; a
	// dry stick never runs out, and the smudger lays nothing of its own.
	const load = ( opts.load ?? 65 ) / 100;
	stroke.reservoir =
		load < 1 && 'dry' !== family && 'smudge' !== opts.paintStyle
			? {
					load: 1,
					// How much NEW ground a full brush covers, in brush
					// areas: 0 is a brush wiped almost dry (3), the
					// default 65 about 60, and towards 100 it grows
					// without bound. A small brush lasts more of its
					// widths, the way a rigger draws a long line.
					lasts:
						( ( 3 + ( 60 * load * load ) / ( 1.02 - load ) ) *
							( 1 + 30 / Math.max( 4, stroke.size ) ) ) /
						( preset.thirst ?? 1 ),
					seen: new Set(),
					seed: ++strokeSeq,
					nx: 0,
					ny: 1,
					// The tooth the paint breaks over: the paper of this
					// island (canvas under the pastes by tradition).
					tooth: toothTile(
						PAPERS[
							'auto' === paperId && 'paste' === family
								? 'canvas'
								: paperId
						] || null
					),
			  }
			: null;
	surface.strokeBegin?.();
	// Reserve generously around the first touch, so the region rarely has
	// to grow mid-stroke (every grow is a resize plus six texture copies).
	surface.ensure( { x: p.x - 384, y: p.y - 384, w: 768, h: 768 } );
	feedGround( true );
	stroke.lastPt = p;
	if ( opts.paintStyle === 'airbrush' ) {
		stroke.spray = {
			rate: tune.rate,
			last: performance.now(),
			points: [ p ],
		};
		sprayFrame( 16 );
	} else {
		if ( stroke.pen ) {
			// The first touch of a pen-less stroke is light.
			stroke.press = TAPER_FLOOR;
		}
		stampSegment( p, p );
	}
	startTicker();
	return true;
}

export function wetStrokeMove( tc, prev, p ) {
	if ( ! stroke ) {
		return;
	}
	// NOT the caller's prev: that comes from the React draft, and under
	// load several pointermoves read the SAME stale lastPt before the
	// next commit - every segment then fans out of one frozen point
	// ("sun rays" / the stroke splitting into shortening lines, Thomas).
	// Wet segments DEPOSIT, so the fan stays visible. The controller
	// keeps its own last point, updated synchronously per event.
	const from = stroke.lastPt || prev;
	stroke.lastPt = p;
	const press0 = stroke.press;
	const tilt0 = stroke.tilt;
	stroke.press = tc.penPressure ?? 1;
	stroke.tilt = tc.penTilt ?? 0;
	const missed = missedFrames();
	if ( stroke.spray ) {
		stroke.spray.points.push( p );
	} else if ( stroke.pen ) {
		penMove( from, p, missed );
	} else if ( missed > 1 && 'liquid' === stroke.family ) {
		// A real pen lays one segment per pointer event, and a wash ADDS
		// UP what every segment lays. When frames run long the events
		// come further apart, each standing in for several frames of the
		// hand: fewer, longer segments, a paler, drier stroke - on just
		// the machine that struggles (the paste and dry media lay only
		// the coverage they add, they do not mind). The segment is cut
		// into as many pieces as frames went by, pressure and tilt eased
		// across them: the stroke a frame on time would have laid.
		const press1 = stroke.press;
		const tilt1 = stroke.tilt;
		const at = ( t ) => ( {
			x: from.x + ( p.x - from.x ) * t,
			y: from.y + ( p.y - from.y ) * t,
		} );
		for ( let k = 1; k <= missed; k++ ) {
			const t = k / missed;
			stroke.press = press0 + ( press1 - press0 ) * t;
			stroke.tilt = tilt0 + ( tilt1 - tilt0 ) * t;
			stampSegment( at( ( k - 1 ) / missed ), at( t ) );
		}
	} else {
		stampSegment( from, p );
	}
	startTicker();
}

/**
 * How many display frames this pointer event stands for: one on a machine
 * that keeps up (nothing changes then), more while frames run long - but
 * only as many as the pointer was actually away, so a pause of the hand
 * is never mistaken for missed frames. Replayed frames (the lab) are not
 * real ones.
 *
 * @return {number} 1 to 4.
 */
function missedFrames() {
	const now = performance.now();
	const since = now - ( stroke.movedAt ?? now );
	stroke.movedAt = now;
	if ( wetReplay() || ! ( pace.floor > 0 ) ) {
		return 1;
	}
	const frames = Math.min( since, lastRaw ) / pace.floor;
	return Math.min( 4, Math.max( 1, Math.round( frames ) ) );
}

/* ---------------------------- the virtual pen ---------------------------- */

/*
 * A mouse or a finger reports no pressure, so every stroke started and
 * ended at full load - blunt, like a stamp. The VIRTUAL PEN gives them
 * what a hand gives a pencil: the stroke swells in over a short stretch
 * and lifts off light instead of stopping dead. The lift cannot be known
 * before the hand lets go, so the last stretch (about half a brush
 * width, capped: the paint trails the cursor by that much) is held back
 * and laid when it is overtaken or released - then with the pressure
 * falling to the end. Speed thins it too: a quick stroke lays less than
 * a slow one. Real pens keep their own pressure.
 */
const TAPER_FLOOR = 0.14;

function penEase( u ) {
	const x = Math.min( 1, Math.max( 0, u ) );
	return TAPER_FLOOR + ( 1 - TAPER_FLOOR ) * x * x * ( 3 - 2 * x );
}

function penMove( a, b, missed = 1 ) {
	const pen = stroke.pen;
	const len = Math.hypot( b.x - a.x, b.y - a.y );
	if ( len <= 0 ) {
		return;
	}
	const now = performance.now();
	const v = len / Math.max( 4, now - pen.t );
	pen.t = now;
	pen.speed = pen.speed * 0.7 + v * 0.3;
	const fast = Math.min( 1, Math.max( 0, ( pen.speed - 0.5 ) / 2.5 ) );
	const speedF = 1 - 0.3 * fast * fast * ( 3 - 2 * fast );
	// Pieces of at most 6 px, so the swell and the lift are ramps, not
	// steps, however far apart the pointer events land - and at least one
	// per display frame the event stands for (wetStrokeMove).
	const n = Math.max( missed, Math.ceil( len / 6 ) );
	for ( let k = 0; k < n; k++ ) {
		const t0 = k / n;
		const t1 = ( k + 1 ) / n;
		pen.queue.push( {
			a: { x: a.x + ( b.x - a.x ) * t0, y: a.y + ( b.y - a.y ) * t0 },
			b: { x: a.x + ( b.x - a.x ) * t1, y: a.y + ( b.y - a.y ) * t1 },
			s0: pen.arc + len * t0,
			s1: pen.arc + len * t1,
			speedF,
		} );
	}
	pen.arc += len;
	while ( pen.queue.length && pen.arc - pen.queue[ 0 ].s1 > pen.hold ) {
		penLay( pen.queue.shift(), null );
	}
}

/** Lay one held segment; `end` is the stroke's length once it is known. */
function penLay( seg, end ) {
	const pen = stroke.pen;
	const mid = ( seg.s0 + seg.s1 ) / 2;
	let press = penEase( mid / pen.len ) * seg.speedF;
	if ( null !== end ) {
		press *= penEase( ( end - mid ) / pen.hold );
	}
	stroke.press = press;
	stampSegment( seg.a, seg.b );
}

export function wetStrokeUp() {
	if ( stroke?.spray ) {
		sprayFrame( Math.min( 60, performance.now() - stroke.spray.last ) );
	}
	if ( stroke?.pen && surface ) {
		// The lift-off: what was held back goes down, getting lighter.
		const pen = stroke.pen;
		const held = pen.queue.splice( 0 );
		held.forEach( ( seg ) => penLay( seg, pen.arc ) );
		if ( pen.arc <= 0 && stroke.lastPt ) {
			// A click without a stroke is a deliberate dot: full load.
			stroke.press = 1;
			stampSegment( stroke.lastPt, stroke.lastPt );
		}
	}
	// The hand left: directional smearing stops, or open oil would keep
	// marching downstream on its own while the clock runs.
	if ( stroke && 'paste' === stroke.family && surface ) {
		surface.setParams( { advX: 0, advY: 0 } );
	}
	if ( stroke ) {
		releasedAt = performance.now();
	}
	stroke = null;
}

/** Spray dose follows elapsed time, including a stationary held pointer. */
function sprayFrame( elapsed ) {
	const held = stroke;
	if ( ! held?.spray || held.spray.inFrame || ! surface || elapsed <= 0 ) {
		return;
	}
	const spray = held.spray;
	spray.inFrame = true;
	spray.last = performance.now();
	const points = spray.points;
	let length = 0;
	for ( let i = 1; i < points.length; i++ ) {
		length += Math.hypot(
			points[ i ].x - points[ i - 1 ].x,
			points[ i ].y - points[ i - 1 ].y
		);
	}
	const dose =
		( ( Math.min( 60, elapsed ) / 1000 ) * spray.rate ) /
		Math.max( 1, length / Math.max( 1, held.size * 0.3 ) );
	const pigment = held.pigment;
	held.pigment *= dose;
	surface.strokeBegin?.();
	try {
		if ( points.length < 2 ) {
			stampSegment( held.lastPt, held.lastPt );
		} else {
			for ( let i = 1; i < points.length; i++ ) {
				stampSegment( points[ i - 1 ], points[ i ] );
			}
		}
	} finally {
		held.pigment = pigment;
		spray.inFrame = false;
		spray.points = [ held.lastPt ];
	}
}

/** Whether a wash is currently wet or waiting to bake. */
export const wetActive = () => !! targetId;

/** The last point the stroke under the hand reached, or null. */
export const wetLastPoint = () => stroke?.lastPt || null;

/* ----------------------------- the reservoir ----------------------------- */

/*
 * A loaded brush carries a finite charge and gives it off to NEW ground:
 * going back over its own wet paint costs nothing, it picks up about as
 * much as it lays, so a scrubbed fill keeps going. The charge only shows
 * once half of it is spent. Then the water gives out, the paint breaks
 * over the tooth and into streaks along the bristles - dry brush - and
 * the empty brush scratches on a little further before it fades out.
 * Lifting the brush reloads it. Measured in grid blocks a quarter brush
 * wide, once per segment (mirror twins share the one brush).
 */
function drain( a, b ) {
	const r = stroke.reservoir;
	if ( ! r ) {
		return;
	}
	const size = stroke.size;
	const B = Math.max( 3, size / 4 );
	const rad = size / 2;
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const l2 = dx * dx + dy * dy;
	if ( l2 > 0.01 ) {
		const l = Math.sqrt( l2 );
		r.nx = -dy / l;
		r.ny = dx / l;
	}
	// Spent is spent: nothing more to count, and the block set stays
	// bounded by what one charge (and its dry tail) can cover.
	if ( r.load <= -0.3 ) {
		return;
	}
	const bx0 = Math.floor( ( Math.min( a.x, b.x ) - rad ) / B );
	const bx1 = Math.floor( ( Math.max( a.x, b.x ) + rad ) / B );
	const by0 = Math.floor( ( Math.min( a.y, b.y ) - rad ) / B );
	const by1 = Math.floor( ( Math.max( a.y, b.y ) + rad ) / B );
	let fresh = 0;
	for ( let by = by0; by <= by1; by++ ) {
		for ( let bx = bx0; bx <= bx1; bx++ ) {
			const key = ( bx + 32768 ) * 65536 + ( by + 32768 );
			if ( r.seen.has( key ) ) {
				continue;
			}
			const cx = ( bx + 0.5 ) * B;
			const cy = ( by + 0.5 ) * B;
			const u =
				l2 > 0
					? Math.min(
							1,
							Math.max(
								0,
								( ( cx - a.x ) * dx + ( cy - a.y ) * dy ) / l2
							)
					  )
					: 0;
			if ( Math.hypot( cx - a.x - dx * u, cy - a.y - dy * u ) > rad ) {
				continue;
			}
			r.seen.add( key );
			fresh++;
		}
	}
	// Brush areas of new ground; a firm hand squeezes out more.
	const used = ( fresh * B * B ) / ( size * size );
	r.load = Math.max(
		-0.3,
		r.load - ( used / r.lasts ) * ( 0.4 + 0.6 * ( stroke.press ?? 1 ) )
	);
}

const hash01 = ( n, s ) => {
	let h =
		Math.imul( n ^ 0x5bd1e995, 0x27d4eb2d ) ^ Math.imul( s, 0x165667b1 );
	h = Math.imul( h ^ ( h >>> 15 ), 0x85ebca6b );
	return ( ( h ^ ( h >>> 13 ) ) >>> 0 ) / 4294967296;
};

/**
 * The dry brush: what is left of a stamp's alpha once the load runs low.
 * The bristles are strips along the stroke (a per-stroke pattern, in
 * clumps), the paper's tooth breaks each strip further.
 */
function dryBrush( alpha, gw, gh, gx, gy, a, b, width, dryB ) {
	const r = stroke.reservoir;
	const bw = Math.max( 2.2, width * 0.07 );
	const thr = 0.95 * dryB;
	// Across THIS segment (a mirror twin runs its own way); a dab without
	// a direction keeps the stroke's last one.
	const dl = Math.hypot( b.x - a.x, b.y - a.y );
	const nx = dl > 0.1 ? -( b.y - a.y ) / dl : r.nx;
	const ny = dl > 0.1 ? ( b.x - a.x ) / dl : r.ny;
	for ( let j = 0; j < gh; j++ ) {
		for ( let i = 0; i < gw; i++ ) {
			const k = j * gw + i;
			if ( ! ( alpha[ k ] > 0 ) ) {
				continue;
			}
			const px = ( gx + i + 0.5 ) * scOf( surface );
			const py = ( gy + j + 0.5 ) * scOf( surface );
			const off = ( px - a.x ) * nx + ( py - a.y ) * ny;
			const bristle =
				0.6 * hash01( Math.floor( off / bw ), r.seed ) +
				0.4 * hash01( Math.floor( off / ( bw * 2.7 ) ), r.seed + 7 );
			const tooth =
				r.tooth[ ( ( py | 0 ) & 511 ) * 512 + ( ( px | 0 ) & 511 ) ];
			const v = 0.55 * bristle + 0.45 * tooth;
			const e = Math.min( 1, Math.max( 0, ( v - thr + 0.08 ) / 0.16 ) );
			alpha[ k ] *= e * e * ( 3 - 2 * e );
		}
	}
}

/**
 * Rasterize one segment with the real dab renderer at grid resolution and
 * pour its alpha into the island as water + pigment. Mirror twins stamp
 * their own mirrored segments.
 */
function stampSegment( a, b ) {
	drain( a, b );
	// Every mirrored copy of the brush is a brush of its own (its number
	// tells the island whose film is whose).
	stampOne( a, b, 0 );
	const m = stroke.mirror;
	if ( ! m ) {
		return;
	}
	const star = STAR_SYMMETRY[ m ];
	if ( star ) {
		const cx = stroke.docW / 2;
		const cy = stroke.docH / 2;
		for ( let k = 1; k < star; k++ ) {
			const ang = ( 2 * Math.PI * k ) / star;
			const cos = Math.cos( ang );
			const sin = Math.sin( ang );
			const rot = ( pt ) => ( {
				x: cx + cos * ( pt.x - cx ) - sin * ( pt.y - cy ),
				y: cy + sin * ( pt.x - cx ) + cos * ( pt.y - cy ),
			} );
			stampOne( rot( a ), rot( b ), k );
		}
		return;
	}
	const fx = ( pt ) => ( { x: stroke.docW - pt.x, y: pt.y } );
	const fy = ( pt ) => ( { x: pt.x, y: stroke.docH - pt.y } );
	if ( 'x' === m || 'xy' === m ) {
		stampOne( fx( a ), fx( b ), 1 );
	}
	if ( 'y' === m || 'xy' === m ) {
		stampOne( fy( a ), fy( b ), 2 );
	}
	if ( 'xy' === m ) {
		stampOne( fx( fy( a ) ), fx( fy( b ) ), 3 );
	}
}

let scratch = null;
let strokeSeq = 0;
let laneSeq = 0;
let washSeed = 0;
// A pixel counts as wet above this alpha (of 255): the island's own
// threshold for a wet cell, two hundredths.
const WET_EDGE = 5;

function stampOne( a, b, copy = 0 ) {
	const s = surface;
	// Pen pressure, per family: watercolour presses more WATER out of the
	// brush, paste presses more PASTE onto the ground (superlinear - a
	// loaded knife responds hard), charcoal is almost all pressure. Size
	// breathes with it.
	const press = stroke.press ?? 1;
	let sizeF = 1;
	let wF = 1;
	let pF = 1;
	if ( press < 1 ) {
		if ( 'paste' === stroke.family ) {
			// A light hand touches with FEWER BRISTLES (bristleContact
			// below). What it does lay is thinner, but it is paint: with
			// the thickness alone answering (press ^ 1.5) every stroke
			// began and ended in a see-through ramp, like an airbrush.
			sizeF = 0.6 + 0.4 * press;
			wF = 0.45 + 0.55 * press;
			pF = press;
		} else if ( 'dry' === stroke.family ) {
			const floor = stroke.pressSize ?? 0.45;
			sizeF = floor + ( 1 - floor ) * press;
			pF = Math.pow( press, stroke.pressExp ?? 1.3 );
		} else {
			sizeF = 0.55 + 0.45 * press;
			wF = press;
			pF = press;
		}
	}
	// A leaning pen answers per medium too: charcoal on its side is
	// broad, light and soft; a flat brush belly wider and wetter; a
	// flat knife spreads its load thinner.
	const lean = tiltFactors( stroke.family, stroke.tilt ?? 0 );
	sizeF *= lean.sizeF;
	wF *= lean.wF;
	pF *= lean.pF;
	// A FINE POINT presses harder: the same hand on a fraction of the
	// area. Without this a pencil line three pixels wide laid so little
	// that it reached a third of the tooth - a row of crumbs.
	if ( stroke.stick ) {
		const point = stroke.size * sizeF;
		pF *= Math.min( 2.2, Math.max( 1, 1 + ( 12 - point ) / 7 ) );
	}
	// The reservoir: a brush lays evenly until half of its charge is
	// spent; then the water gives out first, and the marks it still makes
	// keep most of their colour - a dry brush thins by AREA, not by
	// strength (dryBrush). Past empty it scratches on a little further
	// and fades out (the load runs on to -0.3).
	let dryB = 0;
	if ( stroke.reservoir ) {
		const L = stroke.reservoir.load;
		const u = Math.min( 1, Math.max( 0, L / 0.5 ) );
		const eff = u * u * ( 3 - 2 * u );
		// A running wash would flood the gaps of a dry stroke shut again:
		// a watercolour brush that runs dry has hardly any water left.
		wF *= 'liquid' === stroke.family ? 0.08 + 0.92 * eff : 0.4 + 0.6 * eff;
		pF *= 0.75 + 0.25 * eff;
		const v = Math.min( 1, Math.max( 0, ( L + 0.3 ) / 0.7 ) );
		dryB = 1 - v * v * ( 3 - 2 * v );
	}
	// The scratch reach is sized for the ACTUAL mark: tilt more than
	// doubles a dry stick, and a window sized for the upright pen
	// would slice the mark off flat at its edge.
	const reach = stampMaxReach( stroke.tip, stroke.size * sizeF, stroke ) + 2;
	const x0 = Math.min( a.x, b.x ) - reach;
	const y0 = Math.min( a.y, b.y ) - reach;
	const x1 = Math.max( a.x, b.x ) + reach;
	const y1 = Math.max( a.y, b.y ) + reach;
	const sigBefore = s.rx + ':' + s.ry + ':' + s.rw + ':' + s.rh;
	if ( ! s.ensure( { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } ) ) {
		// The region would blow the cap: dry and commit what is there,
		// then keep THIS stroke painting into a fresh region. bake()
		// clears the stroke and target state, so both are carried over.
		const keepStroke = stroke;
		const keepTarget = targetId;
		const keepParent = targetParent;
		// ... and the island EMPTIED: a kept one would refuse again.
		wetFlushNow( true );
		stroke = keepStroke;
		targetId = keepTarget;
		targetParent = keepParent;
		if ( ! s.ensure( { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } ) ) {
			return; // a single absurd stroke; drop it rather than crash
		}
	}
	if ( sigBefore !== s.rx + ':' + s.ry + ':' + s.rw + ':' + s.rh ) {
		// The region grew: the island canvas was resized and is therefore
		// BLANK, and the grow dropped the ground. Re-feed and repaint in
		// this very task, before the compositor can show a frame - the
		// repaint half of this was the flicker.
		feedGround( true );
		s.render();
		present();
	}
	const sc = scOf( s );
	const gx = Math.floor( x0 / sc );
	const gy = Math.floor( y0 / sc );
	const gw = Math.ceil( ( x1 - x0 ) / sc ) + 1;
	const gh = Math.ceil( ( y1 - y0 ) / sc ) + 1;
	// The liquid island wants the OUTLINE of the wet patch as well as its
	// alpha - it draws the contour of a wash from how much of each cell the
	// wash touches (wet-surface-gl.js, "the contour"). So its segments are
	// drawn at twice the grid, and every cell is told which of its four
	// pixels are wet. The brush's own alpha will not do for that: under a
	// soft tip it is how MUCH paint lands, not where the water ends.
	const ss = 'liquid' === stroke.family ? 2 : 1;
	if ( ! scratch ) {
		scratch = document.createElement( 'canvas' );
	}
	if ( scratch.width < gw * ss || scratch.height < gh * ss ) {
		scratch.width = Math.max( scratch.width, gw * ss );
		scratch.height = Math.max( scratch.height, gh * ss );
	}
	const ctx = scratch.getContext( '2d', { willReadFrequently: true } );
	ctx.setTransform( 1, 0, 0, 1, 0, 0 );
	ctx.clearRect( 0, 0, gw * ss, gh * ss );
	// Pastes and sticks take the head's own PROFILE: the most any dab of
	// the segment covers a cell, not the dabs piled up. Piled up, three
	// or four overlapping dabs fill the film between the bristles to
	// nearly the bristles' own coverage, and the head's comb - the
	// grooves, the streaks, everything pressure could lift - is gone
	// before it reaches the island. The media tips draw their masks as
	// opaque grey for this (brush-tips.js, 'lighten' keeps the maximum);
	// every other tip keeps its alpha.
	const tipDef = getTip( stroke.tip );
	const profile =
		( 'paste' === stroke.family || stroke.stick ) &&
		'media' === tipDef.shape &&
		'stamp' === tipDef.render;
	if ( profile ) {
		ctx.fillStyle = '#000';
		ctx.fillRect( 0, 0, gw * ss, gh * ss );
	}
	// The masks land smaller than they are: filter them properly (and see
	// path.grid below - a fine nib is asked for at a size that has it).
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	// Document -> grid cells, shifted so the segment lands at the origin.
	ctx.setTransform( ss / sc, 0, 0, ss / sc, -gx * ss, -gy * ss );
	// The paste engines drag open paint along the CURRENT segment, and
	// their bristle grooves run along it: the lane of a point is its
	// offset across the stroke (plus the stroke's own seed). Segment to
	// segment the lanes line up - the next one starts where this ends.
	let lane = null;
	if ( 'paste' === stroke.family ) {
		const dlen = Math.hypot( b.x - a.x, b.y - a.y );
		s.setParams(
			dlen > 0.5
				? { advX: ( b.x - a.x ) / dlen, advY: ( b.y - a.y ) / dlen }
				: { advX: 0, advY: 0 }
		);
		if ( dlen > 0.5 ) {
			const nx = -( b.y - a.y ) / dlen;
			const ny = ( b.x - a.x ) / dlen;
			let ang = Math.atan2( b.y - a.y, b.x - a.x );
			if ( ang < 0 ) {
				ang += 2 * Math.PI;
			}
			lane = {
				nx,
				ny,
				c: ( stroke.laneSeed || 0 ) - ( a.x * nx + a.y * ny ),
				code: 1 + Math.min( 0.999999, ang / ( 2 * Math.PI ) ),
			};
		}
	}
	drawStrokePaths( ctx, {
		hardness: stroke.hardness * lean.hardF,
		paths: [
			{
				d: `M ${ a.x } ${ a.y } L ${ b.x } ${ b.y }`,
				pts: [ a, b ],
				color: '#000000',
				size: stroke.size * sizeF,
				opacity: 1,
				flow: 1,
				tip: stroke.tip,
				spacing: stroke.spacing,
				scatter: stroke.scatter,
				alphaJitter: stroke.alphaJitter,
				sizeJitter: stroke.sizeJitter,
				luma: profile,
				grid: true,
			},
		],
	} );
	const img = ctx.getImageData( 0, 0, gw * ss, gh * ss );
	const alpha = new Float32Array( gw * gh );
	let cover = null;
	// A profile was drawn as grey on black; anything else as alpha.
	const channel = profile ? 0 : 3;
	if ( 1 === ss ) {
		for ( let i = 0; i < gw * gh; i++ ) {
			alpha[ i ] = img.data[ i * 4 + channel ] / 255;
		}
	} else {
		// Four pixels a cell: their mean is the cell's alpha, and which of
		// them the wash touches at all its coverage (one bit each).
		cover = new Uint8Array( gw * gh );
		const row = gw * 2 * 4;
		const px = img.data;
		for ( let y = 0; y < gh; y++ ) {
			for ( let x = 0; x < gw; x++ ) {
				const o = y * 2 * row + x * 8 + 3;
				const a0 = px[ o ];
				const a1 = px[ o + 4 ];
				const a2 = px[ o + row ];
				const a3 = px[ o + row + 4 ];
				alpha[ y * gw + x ] = ( a0 + a1 + a2 + a3 ) / 1020;
				cover[ y * gw + x ] =
					( a0 > WET_EDGE ? 1 : 0 ) |
					( a1 > WET_EDGE ? 2 : 0 ) |
					( a2 > WET_EDGE ? 4 : 0 ) |
					( a3 > WET_EDGE ? 8 : 0 );
			}
		}
	}
	if ( 'paste' === stroke.family ) {
		// Fewer bristles reach the ground under a light hand.
		bristleContact( alpha, press );
	}
	if ( dryB > 0 ) {
		dryBrush( alpha, gw, gh, gx, gy, a, b, stroke.size * sizeF, dryB );
		if ( cover ) {
			// What the dry brush took away is not covered either.
			for ( let i = 0; i < gw * gh; i++ ) {
				if ( alpha[ i ] <= 0.02 ) {
					cover[ i ] = 0;
				}
			}
		}
	}
	// A tool that carries: the way of its middle in this segment.
	const brush =
		stroke.carryR > 0
			? { ax: a.x, ay: a.y, bx: b.x, by: b.y, r: stroke.carryR, copy }
			: null;
	s.stamp(
		{ data: alpha, w: gw, h: gh, gx, gy, lane, cover, brush },
		1 === wF && 1 === pF
			? stroke
			: {
					...stroke,
					water: stroke.water * wF,
					pigment: stroke.pigment * pF,
			  }
	);
}

/* ------------------------------ the ticker ------------------------------ */

function startTicker() {
	if ( ticking ) {
		return;
	}
	ticking = true;
	lastTick = performance.now();
	tickCost = 0;
	stepsSeen = surface?.stepCount?.() ?? 0;
	window.requestAnimationFrame( tick );
}

function tick( now ) {
	if ( ! targetId || ! surface ) {
		ticking = false;
		return;
	}
	const tickStart = performance.now();
	const raw = now - lastTick;
	const dt = Math.min( 60, raw );
	lastTick = now;
	lastRaw = raw;
	tickNr++;
	if ( stroke?.spray ) {
		sprayFrame( dt );
	}
	if ( surface.wet > 0 ) {
		// Replayed frames (the brush lab) are not real ones: no budget, no
		// easing, every frame rendered - every run stays the same run.
		const replay = wetReplay();
		// Wall-clock pacing (the calibration runs refined time, x2), sped
		// up sixfold once the hand lets go - eased in over a moment, and
		// within what the GPU manages.
		let sub = Math.max( 1, Math.round( dt / 5.5 ) ) * 2;
		if ( ! stroke && false !== surface.raffer ) {
			const ease = replay
				? 1
				: Math.min( 1, ( now - releasedAt ) / RAFFER_EASE );
			sub = Math.round( sub * ( 1 + 5 * ease ) );
		}
		sub = Math.min( STEP_CAP, sub );
		// Behind: the GPU still on the last frame's work - or the last
		// tick itself waited that long for it. Where the browser copies
		// the island's picture synchronously (software graphics), the
		// wait lands inside our own tick and the fence looks idle after.
		const busy =
			! replay &&
			( !! surface.gpuBusy?.() || tickCost > pace.floor * 0.5 );
		let n = sub;
		if ( ! replay ) {
			// Always learnt (the display's frame interval); spent only by an
			// island whose steps are what costs - not by one that asks to
			// stay out (surface.paced, the pastes).
			const budget = paceFrame( pace, raw, busy );
			const area =
				false !== surface.paced ? surface.stepArea?.() || 0 : 0;
			const folded = ( surface.stepCount?.() ?? 0 ) - stepsSeen;
			n = stepsWithin( budget, area, sub, folded );
			pace.used = ( n + folded ) * area;
			pace.bound = n < sub;
		}
		surface.steps( n );
		stepsSeen = surface.stepCount?.() ?? 0;
		// What gets drawn this frame. Under the hand the brush's own fresh
		// paint every frame, the rest of the wash - which moves too slowly
		// to need it - every other frame, every fourth on a GPU that is
		// behind (the preserved canvas keeps what it shows, the next full
		// render catches up). While the wash dries on its own, the editor
		// recomposites every other frame only, so a picture rendered in
		// between was never seen: render just for the frames that show -
		// and every fourth where the GPU is the limit (behind, or the
		// budget held the steps back): a render costs about three steps,
		// and a wash that dries by itself needs its steps more than a
		// smooth picture of the drying.
		const behind = busy && raw > pace.floor * 1.5;
		let draw = 'full';
		if ( ! replay ) {
			sinceFull++;
			if ( stroke ) {
				draw = sinceFull >= ( behind ? 4 : 2 ) ? 'full' : 'near';
			} else {
				draw =
					sinceFull >= ( behind || pace.bound ? 4 : 2 )
						? 'full'
						: null;
			}
		}
		if ( draw ) {
			if ( 'full' === draw ) {
				sinceFull = 0;
			}
			surface.render( 'near' === draw );
			showPending = present() || showPending;
		}
		if ( 0 === tickNr % 10 ) {
			surface.checkWet();
		}
	}
	if ( bound ) {
		// The island's canvas already holds the fresh picture; the editor
		// recomposite is the CPU-side cost, so it runs with the island's
		// own renders - every frame under the hand, every other while
		// drying - and not at all while the paint sits still (a dry
		// stroke setting, a wash done moving).
		if ( stroke || showPending ) {
			bound.requestRender();
			showPending = false;
		}
	}
	if ( surface.wet < 1 && ! stroke ) {
		ticking = false;
		bake();
		return;
	}
	tickCost = performance.now() - tickStart;
	window.requestAnimationFrame( tick );
}

/* ------------------------------- the bake ------------------------------- */

/**
 * Write the dried wash into its target layer and make it ONE history entry.
 * Also the flush for undo/save/export, so it must work synchronously.
 */
function bake( forget = false ) {
	if ( ! targetId || ! bound || ! surface ) {
		return;
	}
	let editor = bound.getEditor();
	let dest = editor.state.layers.find( ( l ) => l.id === targetId );
	// A dry wash that can be picked up again is KEPT (see `kept`). Its
	// bake goes through the editor's live facade where there is one: the
	// dispatch lands at once, so the layer object the bake leaves behind
	// can be told from one that something else changed afterwards.
	const keep =
		! forget && !! dest && !! groundKey && keepable( surface, dest );
	if ( keep && editor.live ) {
		editor = editor.live;
		dest = editor.state.layers.find( ( l ) => l.id === targetId ) || dest;
	}
	if ( dest && dest.canvas && surface.hasRegion() && ! surface.lost ) {
		// Settle everything and render the final state through the SAME
		// ink mapping the live overlay used - the moment of drying must
		// not change a single colour. The ground is re-fed first so the
		// glaze bakes over the layer's CURRENT pixels even if something
		// edited them while the wash was wet. (Not for a kept wash: its
		// ground is its base, and the layer under it IS that base.)
		if ( ! keep ) {
			groundKey = '';
			feedGround( false );
		}
		surface.dryAll();
		surface.render();
		const dctx = dest.canvas.getContext( '2d' );
		dctx.save();
		setDocTransform( dctx, dest, {
			cw: dest.canvas.width,
			ch: dest.canvas.height,
		} );
		dctx.globalCompositeOperation = 'source-over';
		dctx.globalAlpha = 1;
		let src = surface.canvas;
		if ( clip ) {
			// Through the frisket: only what lies inside the selection
			// reaches the layer, feathered edge included.
			if (
				! clipScratch ||
				clipScratch.width !== src.width ||
				clipScratch.height !== src.height
			) {
				clipScratch = createCanvas( src.width, src.height );
			}
			const cctx = clipScratch.getContext( '2d' );
			cctx.globalCompositeOperation = 'source-over';
			cctx.clearRect( 0, 0, src.width, src.height );
			cctx.drawImage( src, 0, 0 );
			cctx.globalCompositeOperation = 'destination-in';
			cctx.drawImage(
				clip.canvas,
				-surface.rx * scOf( surface ),
				-surface.ry * scOf( surface )
			);
			cctx.globalCompositeOperation = 'source-over';
			src = clipScratch;
		}
		dctx.drawImage(
			src,
			surface.rx * scOf( surface ),
			surface.ry * scOf( surface )
		);
		dctx.restore();
		editor.dispatch( {
			type: 'UPDATE_LAYER',
			id: dest.id,
			patch: { canvas: dest.canvas, dataUrl: null },
		} );
		editor.commit( historyLabel || __( 'Watercolor wash', 'wunderpaint' ) );
		if ( keep ) {
			keepWash( editor, dest.id );
			return;
		}
	} else if ( dest && dest.canvas && surface.lost && pres?.w ) {
		// The GPU dropped the island under a living wash (a driver reset,
		// or the browser reclaiming contexts - integrated graphics share
		// their memory with everything else). The physics is gone, but the
		// presentation copy still holds the last picture the hand saw, the
		// frisket already applied: that is what dries into the layer,
		// instead of the whole wash vanishing.
		const dctx = dest.canvas.getContext( '2d' );
		dctx.save();
		setDocTransform( dctx, dest, {
			cw: dest.canvas.width,
			ch: dest.canvas.height,
		} );
		dctx.globalCompositeOperation = 'source-over';
		dctx.globalAlpha = 1;
		dctx.drawImage( pres.canvas, pres.x, pres.y );
		dctx.restore();
		editor.dispatch( {
			type: 'UPDATE_LAYER',
			id: dest.id,
			patch: { canvas: dest.canvas, dataUrl: null },
		} );
		editor.commit( historyLabel || __( 'Watercolor wash', 'wunderpaint' ) );
	}
	surface.reset();
	pres = null;
	clip = null;
	targetId = null;
	targetParent = null;
	stroke = null;
	groundKey = '';
	if ( bound ) {
		bound.requestRender();
	}
}

/**
 * Whether a dry wash on this layer can be kept: the island's own ground is
 * the layer's slice, pixel for pixel, and nothing but a shift lies between
 * the two - so taking the wash back out of the layer and writing it in
 * again is exact.
 *
 * @param {Object} isle The island.
 * @param {Object} dest The target layer.
 * @return {boolean} True when the wash may stay alive after it sets.
 */
function keepable( isle, dest ) {
	const plain =
		dest.canvas &&
		! dest.quad &&
		! dest.mask &&
		! dest.adjust &&
		( ! dest.filter || 'none' === dest.filter ) &&
		! dest.styles &&
		1 === ( dest.opacity ?? 1 ) &&
		'normal' === ( dest.blend || 'normal' );
	return !! (
		isle &&
		isle === engines.dry &&
		! isle.lost &&
		// Metal leaf is a new laying with every wash (Thomas).
		4 !== ( isle.params.medium | 0 ) &&
		plain &&
		! dest.rot &&
		! dest.flipX &&
		! dest.flipY &&
		dest.canvas.width === Math.max( 1, dest.w ) &&
		dest.canvas.height === Math.max( 1, dest.h ) &&
		Number.isInteger( dest.x ) &&
		Number.isInteger( dest.y )
	);
}

/**
 * The wash has set and stays: remember what picking it up again needs.
 *
 * @param {Object} editor  The editor the bake went through.
 * @param {string} layerId The layer it dried into.
 */
function keepWash( editor, layerId ) {
	let base = baseHeld;
	if ( groundFresh || ! base ) {
		base = createCanvas( groundCanvas.width, groundCanvas.height );
		base.getContext( '2d' ).drawImage( groundCanvas, 0, 0 );
	}
	kept = {
		isle: surface,
		layerId,
		layer: editor.state.layers.find( ( l ) => l.id === layerId ),
		parent: targetParent,
		clip,
		key: groundKey,
		base,
	};
	baseHeld = null;
	groundFresh = false;
	pres = null;
	clip = null;
	targetId = null;
	targetParent = null;
	stroke = null;
	groundKey = '';
	if ( keptTimer ) {
		clearTimeout( keptTimer );
	}
	keptTimer = setTimeout( forgetKept, KEEP_MS );
	if ( bound ) {
		bound.requestRender();
	}
}

/** Let a kept wash go: the island is emptied, the layer keeps its pixels. */
function forgetKept() {
	if ( keptTimer ) {
		clearTimeout( keptTimer );
		keptTimer = null;
	}
	if ( kept ) {
		const isle = kept.isle;
		kept = null;
		if ( ! targetId || surface !== isle ) {
			isle.reset();
		}
	}
}

/**
 * Pick the kept wash up again: its last bake comes back out of the layer
 * (the layer is the island's ground while the wash lives) and the overlay
 * shows the island instead - one synchronous block, so no frame ever shows
 * the sheet without its dust.
 *
 * @param {Object} editor The editor the stroke came through.
 * @param {Object} dest   The target layer.
 */
function resumeKept( editor, dest ) {
	const isle = kept.isle;
	const sc = scOf( isle );
	const dctx = dest.canvas.getContext( '2d' );
	dctx.save();
	setDocTransform( dctx, dest, {
		cw: dest.canvas.width,
		ch: dest.canvas.height,
	} );
	dctx.clearRect(
		isle.rx * sc,
		isle.ry * sc,
		kept.base.width,
		kept.base.height
	);
	dctx.globalCompositeOperation = 'source-over';
	dctx.globalAlpha = 1;
	dctx.drawImage( kept.base, isle.rx * sc, isle.ry * sc );
	dctx.restore();
	( editor.live || editor ).dispatch( {
		type: 'UPDATE_LAYER',
		id: dest.id,
		patch: { canvas: dest.canvas, dataUrl: null },
	} );
	surface = isle;
	targetId = dest.id;
	targetParent = kept.parent;
	clip = kept.clip;
	groundKey = kept.key;
	baseHeld = kept.base;
	groundFresh = false;
	kept = null;
	if ( keptTimer ) {
		clearTimeout( keptTimer );
		keptTimer = null;
	}
	// The island's canvas still holds its last render: show it at once.
	pres = null;
	present();
}

/**
 * Commit any wet paint right now (undo/redo, save, export, region cap).
 *
 * @param {boolean} forget Empty the island even where it could be kept.
 */
export function wetFlushNow( forget = false ) {
	if ( stroke?.spray ) {
		wetStrokeUp();
	}
	if ( targetId ) {
		bake( forget );
	} else if ( forget ) {
		forgetKept();
	}
}
