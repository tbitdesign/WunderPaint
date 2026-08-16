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
import { registerWetFlush } from '../../lib/wet-hooks';
import { makeRaster } from '../../store/document';
import { buildRasterCanvas, STAR_SYMMETRY } from '../../lib/raster-layer';
import { stampMaxReach } from '../../lib/brush-tips';
import { tiltFactors } from '../../lib/pen-dynamics';
import { drawStrokePaths } from '../../lib/raster/styles';
import {
	paintTarget,
	setDocTransform,
	setLayerToDocTransform,
} from './paint-commit';

// THREE style-engine modules behind one interface - Thomas' verdict on
// the single-engine round was immediate ("watercolour variations"): the
// character of a medium is its TRANSPORT, so each family gets its own
// physics module. One is active at a time (one wash, one island).
const FAMILY_OF = {
	watercolour: 'liquid',
	water: 'liquid',
	ink: 'liquid',
	gouache: 'paste',
	acrylic: 'paste',
	oil: 'paste',
	// The BLENDER: the classic Smudge style, upgraded to the island
	// physics wherever WebGL runs (the static CPU smudge stays as the
	// no-GL fallback). No pigment of its own - it lives entirely on
	// what it picks up, and smears that while it stays open.
	smudge: 'paste',
	charcoal: 'dry',
	pastel: 'dry',
};
const FACTORIES = {
	liquid: createWetSurfaceGL,
	paste: createWetPasteGL,
	dry: createWetDryGL,
};
const engines = {};
// The document's PAPER, one sheet for every medium. 'auto' (default,
// also every existing document) keeps each family's traditional
// calibrated surface: cold-press for the washes, canvas for the pastes,
// laid paper for charcoal. kont = tooth contrast, freq = feature size.
export const PAPERS = {
	'hot-press': { kont: 0.45, freq: 0.7, gewebe: 0, rippen: 0 },
	'cold-press': { kont: 1, freq: 1, gewebe: 0, rippen: 0 },
	rough: { kont: 1.45, freq: 1.3, gewebe: 0, rippen: 0 },
	canvas: { kont: 1, freq: 1, gewebe: 1, rippen: 0 },
	laid: { kont: 1.1, freq: 1, gewebe: 0, rippen: 1 },
};

let surface = null; // the ACTIVE island
let bound = null; // { getEditor, requestRender }
let targetId = null; // the layer the wash will dry into
let targetParent = null;
let stroke = null; // params of the stroke being painted, null between
let ticking = false;
let lastTick = 0;
let tickNr = 0;
// The PRESENTATION surface: a plain 2D canvas the compositor reads. The
// island's own canvas is a working buffer - it gets CLEARED by every
// region resize and repainted a task later, and the editor's repaint can
// land exactly in that gap (Thomas: "flackert alle paar Sekunden", the
// stroke guide blinking in and out). The pres canvas is only ever
// touched ATOMICALLY: resize/clear + drawImage + geometry snapshot in
// one synchronous block, so the compositor sees old picture or new
// picture, never a blank or a mismatched frame.
let pres = null; // { canvas, ctx, x, y, w, h }

function islandFor( family ) {
	if ( ! engines[ family ] && wetGlAvailable() ) {
		engines[ family ] = FACTORIES[ family ]();
	}
	return engines[ family ] || null;
}

/** Wire the controller to the living editor. Called by editor-canvas. */
export function bindWet( callbacks ) {
	bound = callbacks;
	registerWetFlush( wetFlushNow );
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
	const w = surface.rw * WET_SC;
	const h = surface.rh * WET_SC;
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
	setLayerToDocTransform(
		gctx,
		dest,
		surface.rx * WET_SC,
		surface.ry * WET_SC
	);
	gctx.drawImage( dest.canvas, 0, 0 );
	surface.setGround( groundCanvas );
	if ( reseed && surface.seedGround ) {
		seedCells();
	}
}

/** Blit the island onto the presentation surface, atomically. */
function present() {
	if ( ! surface || ! surface.hasRegion() ) {
		return;
	}
	if ( ! pres ) {
		const c = document.createElement( 'canvas' );
		pres = { canvas: c, ctx: c.getContext( '2d' ), x: 0, y: 0, w: 0, h: 0 };
	}
	const w = surface.canvas.width;
	const h = surface.canvas.height;
	if ( pres.canvas.width !== w || pres.canvas.height !== h ) {
		pres.canvas.width = w;
		pres.canvas.height = h;
	} else {
		pres.ctx.clearRect( 0, 0, w, h );
	}
	pres.ctx.drawImage( surface.canvas, 0, 0 );
	pres.x = surface.rx * WET_SC;
	pres.y = surface.ry * WET_SC;
	pres.w = w;
	pres.h = h;
}

/* --------------------------- stroke handling --------------------------- */

const clamp01 = ( v ) => ( v < 0 ? 0 : v > 1 ? 1 : v );

/*
 * The wet styles as parameter sets on ONE island - the paint-engine
 * philosophy ("styles are values") lifted onto the GPU. Per style:
 *   sBase   scattering per pigment amount; 0 = transparent (watercolour,
 *           ink), high = opaque body paint (gouache, acrylic, oil)
 *   kMul    density multiplier of the colour
 *   water   [base, perFlow] - how much the medium floods
 *   pigment multiplier on the opacity slider
 *   evapK/sogK/korn/gran   the wash weather (watercolour reads its own
 *           sliders instead)
 *   depK    fixation: how fast pigment settles (ink stains, oil stays open)
 *   liftK   how easily settled pigment rewets (oil smears, acrylic locks)
 */
const WET_STYLES = {
	// visc ist der CHARAKTER-Schalter: 1 = freies Wasser, ~0.1 = Paste,
	// die stehen bleibt, dazwischen zaehe Medien. Ohne ihn verhielten
	// sich alle Stile wie Aquarell mit weniger Wasser (Thomas' Befund).
	watercolour: {
		sBase: 0,
		kMul: 1,
		water: [ 0.25, 0.5 ],
		pigment: 0.75,
		evapK: 1.3,
		sogK: 1,
		korn: 0.55,
		gran: 0.55,
		depK: 1,
		liftK: 1,
		visc: 1,
		// How readily standing water redissolves the LAYER underneath
		// (the stage-2 pickup): watercolour rewets, ink stains.
		seedK: 0.35,
	},
	// The WATER BRUSH: no pigment of its own. It wets for wet-in-wet,
	// spreads standing paint, and redissolves the dried layer harder
	// than a loaded brush would (seedK) - the physics did all of this
	// already, this preset is just the missing button.
	water: {
		sBase: 0,
		kMul: 0,
		water: [ 0.45, 0.75 ],
		pigment: 0,
		evapK: 1.1,
		sogK: 1,
		korn: 0.5,
		gran: 0,
		depK: 1,
		liftK: 1.2,
		visc: 1,
		seedK: 0.9,
	},
	ink: {
		sBase: 0,
		kMul: 1.7,
		water: [ 0.15, 0.35 ],
		pigment: 0.9,
		evapK: 1.6,
		sogK: 0.9,
		korn: 0.25,
		gran: 0.15,
		depK: 3,
		liftK: 0.25,
		visc: 0.7,
		seedK: 0.08,
	},
	// PASTE family (wet-paste-gl.js): thickness instead of water,
	// open-then-lock instead of evaporation, relief and gloss per style.
	gouache: {
		sBase: 1.1,
		kMul: 1,
		thick: [ 0.3, 0.45 ],
		pigRate: 0.8,
		body: 0.18,
		gloss: 0.05,
		// Real gouache REDISSOLVES: the brush lifts the layer's paint.
		pickK: 0.35,
		korn: 0.4,
		gran: 0.4,
		openK: 0.0011,
		blendK: 0.35,
	},
	acrylic: {
		sBase: 1.8,
		kMul: 1,
		thick: [ 0.35, 0.55 ],
		pigRate: 0.9,
		body: 0.45,
		gloss: 0.35,
		// Dry acrylic is locked; the brush barely lifts it.
		pickK: 0.05,
		korn: 0.22,
		gran: 0.22,
		openK: 0.0018,
		blendK: 0.15,
	},
	oil: {
		sBase: 1.6,
		kMul: 1,
		thick: [ 0.4, 0.65 ],
		pigRate: 0.9,
		body: 0.65,
		gloss: 0.55,
		// Oil smears: the brush drags the layer's paint into the stroke.
		pickK: 0.5,
		korn: 0.15,
		gran: 0.15,
		openK: 0.00035,
		blendK: 1,
	},
	smudge: {
		sBase: 0,
		kMul: 0,
		// Almost no body of its own: K=S=0 paint renders WHITE, so a dry
		// smudger over empty ground would lay a pale haze. Below the
		// open threshold nothing happens where nothing was picked up.
		thick: [ 0.004, 0.008 ],
		pigRate: 0,
		body: 0.35,
		gloss: 0.15,
		korn: 0.2,
		gran: 0,
		openK: 0.0004,
		blendK: 2,
		pickK: 0.85,
	},
	// DRY family (wet-dry-gl.js): dust on the tooth, nothing else.
	charcoal: {
		kMul: 1.4,
		amt: 0.55,
		tooth: 0.85,
		gran: 0.85,
	},
	// Charcoal's coloured, softer sibling: true colour instead of the
	// darkened stick, lays MORE dust, bites the tooth less - velvet.
	pastel: {
		kMul: 1,
		amt: 0.75,
		tooth: 0.5,
		gran: 0.5,
	},
};

/*
 * Every style gets its OWN dials, with medium-specific meaning. Stored in
 * toolOpts.brush.wetTuning[styleId] as 0..100; the labels live in the
 * brush panel (i18n stays in the UI layer).
 */
export const WET_TUNING_DEFS = {
	watercolour: [
		[ 'dry', 35 ],
		[ 'grain', 55 ],
		[ 'edge', 50 ],
		[ 'pickup', 35 ],
	],
	water: [
		[ 'wet', 50 ],
		[ 'dry', 35 ],
		[ 'pickup', 90 ],
	],
	ink: [
		[ 'wet', 50 ],
		[ 'bleed', 50 ],
		[ 'dry', 50 ],
	],
	gouache: [
		[ 'wet', 50 ],
		[ 'dry', 55 ],
		[ 'grain', 40 ],
		[ 'pickup', 35 ],
	],
	acrylic: [
		[ 'wet', 50 ],
		[ 'dry', 65 ],
		[ 'cover', 50 ],
		[ 'pickup', 5 ],
	],
	oil: [
		[ 'wet', 50 ],
		[ 'smear', 50 ],
		[ 'open', 85 ],
		[ 'pickup', 50 ],
	],
	smudge: [
		[ 'pickup', 85 ],
		[ 'smear', 80 ],
		// 35, not 80: at 80 the smear window ran ~14 sim-seconds and a
		// NEW smudge kept re-shading the previous one seconds after the
		// hand lifted (Thomas). The dial stays for long-open blending.
		[ 'open', 35 ],
	],
	charcoal: [
		[ 'press', 50 ],
		[ 'tooth', 85 ],
	],
	pastel: [
		[ 'press', 60 ],
		[ 'tooth', 50 ],
	],
};

/**
 * Apply a style's saved dials (0..100) onto a copy of its preset. The
 * SAME dial id can mean different engine knobs per family - 'dry' is
 * evaporation for liquids and the lock clock for paste.
 */
function tuned( styleId, opts ) {
	const preset = WET_STYLES[ styleId ];
	const family = FAMILY_OF[ styleId ];
	const out = { ...preset, waterMul: 1, pigMul: 1 };
	const saved = ( opts.wetTuning && opts.wetTuning[ styleId ] ) || {};
	for ( const [ id, def ] of WET_TUNING_DEFS[ styleId ] || [] ) {
		const x = ( saved[ id ] ?? def ) / 100;
		switch ( id ) {
			case 'dry':
				if ( 'paste' === family ) {
					out.openK = 0.0002 + 0.005 * x * x;
				} else {
					out.evapK = 0.25 + 3 * x;
				}
				break;
			case 'grain':
			case 'tooth':
				out.korn = x;
				out.gran = x;
				out.tooth = 0.3 + 0.7 * x;
				break;
			case 'edge':
				out.sogK = 2 * x;
				break;
			case 'wet':
				out.waterMul = 0.4 + 1.2 * x;
				break;
			case 'bleed':
				out.visc = 0.2 + x;
				break;
			case 'cover':
				out.sBase = preset.sBase * ( 0.5 + x );
				break;
			case 'smear':
				out.blendK = 2.4 * x;
				// And the DIRECTIONAL half: open paint dragged along the
				// stroke. Capped well under the shader's conservation
				// bound (see wet-paste-gl.js).
				out.advK = 0.14 * x;
				break;
			case 'open':
				// Offenzeit: hoch = Oel bleibt lange nass und mischbar.
				out.openK = 0.0001 + 0.004 * ( 1 - x ) * ( 1 - x );
				break;
			case 'press':
				out.pigMul = 0.4 + 1.2 * x;
				break;
			case 'pickup':
				// How much of the LAYER the stroke redissolves (liquid)
				// or lifts into the open paint (paste). 0 = none.
				if ( 'paste' === family ) {
					out.pickK = x;
				} else {
					out.seedK = x;
				}
				break;
		}
	}
	return out;
}

/** The style ids the island serves; everything else keeps the classic pass. */
export const WET_STYLE_IDS = Object.keys( WET_STYLES );

/**
 * Kubelka-Munk identity of a hex colour. Transparent media (sBase 0) get
 * absorption only, K = -ln(c). Opaque media invert KM: K/S = (1-c)^2 / 2c,
 * so WHITE really is a pigment (K ~ 0, all scattering) and mixes like one.
 */
function pigmentOf( hex, sBase, kMul ) {
	const c = ( o ) =>
		clamp01( parseInt( ( hex || '#000000' ).slice( o, o + 2 ), 16 ) / 255 );
	const ch = [ c( 1 ), c( 3 ), c( 5 ) ].map( ( v ) =>
		Math.min( 0.97, Math.max( 0.03, v ) )
	);
	if ( ! sBase ) {
		const k = ( v ) => -Math.log( v ) * ( kMul || 1 );
		return {
			kr: k( ch[ 0 ] ),
			kg: k( ch[ 1 ] ),
			kb: k( ch[ 2 ] ),
			sr: 0,
			sg: 0,
			sb: 0,
		};
	}
	const k = ( v ) =>
		Math.min( 8, ( ( ( 1 - v ) * ( 1 - v ) ) / ( 2 * v ) ) * sBase ) *
		( kMul || 1 );
	return {
		kr: k( ch[ 0 ] ),
		kg: k( ch[ 1 ] ),
		kb: k( ch[ 2 ] ),
		sr: sBase,
		sg: sBase,
		sb: sBase,
	};
}

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
		// Only a raster with a live canvas can take the bake without the
		// tool context (images convert through ensureRaster, which needs
		// tc); everything else keeps the classic pass.
		if ( 'raster' !== target.layer.type || ! target.layer.canvas ) {
			return false;
		}
		dest = target.layer;
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
	// it and dry as one.
	if ( targetId && ( targetId !== dest.id || surface !== isle ) ) {
		wetFlushNow();
	}
	// The document's paper: applied per island, and a change under a
	// LIVING wash flushes it first - swapping the tooth beneath wet
	// physics would repaint history.
	const paperId = tc.doc.paper || 'auto';
	if ( isle.setPaper && isle.wpPaper !== paperId ) {
		if ( isle.hasRegion() && targetId ) {
			wetFlushNow();
		}
		isle.setPaper( PAPERS[ paperId ] || null );
		isle.wpPaper = paperId;
	}
	surface = isle;
	targetId = dest.id;
	targetParent = dest.parent || null;
	const opts = tc.opts;
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
		Object.assign( stroke, pigmentOf( tc.fg, tune.sBase, preset.kMul ) );
		surface.setParams( {
			evapK: tune.evapK,
			sogK: tune.sogK,
			korn: tune.korn,
			depK: tune.depK,
			liftK: tune.liftK,
			viscK: tune.visc,
			seedK: tune.seedK ?? 0,
		} );
	} else if ( 'paste' === family ) {
		// Flow is how LOADED the brush is (thickness per pass), opacity
		// the pigment strength of the paste.
		stroke.water =
			( preset.thick[ 0 ] + preset.thick[ 1 ] * flow ) * tune.waterMul;
		stroke.pigment = preset.pigRate * opac;
		Object.assign( stroke, pigmentOf( tc.fg, tune.sBase, preset.kMul ) );
		surface.setParams( {
			openK: tune.openK,
			blendK: tune.blendK,
			body: preset.body,
			gloss: preset.gloss,
			korn: tune.korn,
			pickK: tune.pickK ?? 0,
			advK: tune.advK ?? 0,
		} );
	} else {
		// Dry dust: opacity is the pressure.
		stroke.water = 0;
		stroke.pigment = preset.amt * opac * tune.pigMul;
		Object.assign( stroke, pigmentOf( tc.fg, 0, preset.kMul ) );
		surface.setParams( { tooth: tune.tooth } );
	}
	surface.strokeBegin?.();
	// Reserve generously around the first touch, so the region rarely has
	// to grow mid-stroke (every grow is a resize plus six texture copies).
	surface.ensure( { x: p.x - 384, y: p.y - 384, w: 768, h: 768 } );
	feedGround( true );
	stampSegment( p, p );
	stroke.lastPt = p;
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
	stroke.press = tc.penPressure ?? 1;
	stroke.tilt = tc.penTilt ?? 0;
	stampSegment( from, p );
	startTicker();
}

export function wetStrokeUp() {
	// The hand left: directional smearing stops, or open oil would keep
	// marching downstream on its own while the clock runs.
	if ( stroke && 'paste' === stroke.family && surface ) {
		surface.setParams( { advX: 0, advY: 0 } );
	}
	stroke = null;
}

/** Whether a wash is currently wet or waiting to bake. */
export const wetActive = () => !! targetId;

/**
 * Rasterize one segment with the real dab renderer at grid resolution and
 * pour its alpha into the island as water + pigment. Mirror twins stamp
 * their own mirrored segments.
 */
function stampSegment( a, b ) {
	stampOne( a, b );
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
			stampOne( rot( a ), rot( b ) );
		}
		return;
	}
	const fx = ( pt ) => ( { x: stroke.docW - pt.x, y: pt.y } );
	const fy = ( pt ) => ( { x: pt.x, y: stroke.docH - pt.y } );
	if ( 'x' === m || 'xy' === m ) {
		stampOne( fx( a ), fx( b ) );
	}
	if ( 'y' === m || 'xy' === m ) {
		stampOne( fy( a ), fy( b ) );
	}
	if ( 'xy' === m ) {
		stampOne( fx( fy( a ) ), fx( fy( b ) ) );
	}
}

let scratch = null;

function stampOne( a, b ) {
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
			sizeF = 0.6 + 0.4 * press;
			wF = Math.pow( press, 1.5 );
			pF = press;
		} else if ( 'dry' === stroke.family ) {
			sizeF = 0.45 + 0.55 * press;
			pF = Math.pow( press, 1.3 );
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
		wetFlushNow();
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
	const gx = Math.floor( x0 / WET_SC );
	const gy = Math.floor( y0 / WET_SC );
	const gw = Math.ceil( ( x1 - x0 ) / WET_SC ) + 1;
	const gh = Math.ceil( ( y1 - y0 ) / WET_SC ) + 1;
	if ( ! scratch ) {
		scratch = document.createElement( 'canvas' );
	}
	if ( scratch.width < gw || scratch.height < gh ) {
		scratch.width = Math.max( scratch.width, gw );
		scratch.height = Math.max( scratch.height, gh );
	}
	const ctx = scratch.getContext( '2d', { willReadFrequently: true } );
	ctx.setTransform( 1, 0, 0, 1, 0, 0 );
	ctx.clearRect( 0, 0, gw, gh );
	// Document -> grid cells, shifted so the segment lands at the origin.
	ctx.setTransform( 1 / WET_SC, 0, 0, 1 / WET_SC, -gx, -gy );
	// The paste engines drag open paint along the CURRENT segment.
	if ( 'paste' === stroke.family ) {
		const dlen = Math.hypot( b.x - a.x, b.y - a.y );
		s.setParams(
			dlen > 0.5
				? { advX: ( b.x - a.x ) / dlen, advY: ( b.y - a.y ) / dlen }
				: { advX: 0, advY: 0 }
		);
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
			},
		],
	} );
	const img = ctx.getImageData( 0, 0, gw, gh );
	const alpha = new Float32Array( gw * gh );
	for ( let i = 0; i < gw * gh; i++ ) {
		alpha[ i ] = img.data[ i * 4 + 3 ] / 255;
	}
	s.stamp(
		{ data: alpha, w: gw, h: gh, gx, gy },
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
	window.requestAnimationFrame( tick );
}

function tick( now ) {
	if ( ! targetId || ! surface ) {
		ticking = false;
		return;
	}
	const dt = Math.min( 60, now - lastTick );
	lastTick = now;
	tickNr++;
	if ( surface.wet > 0 ) {
		// Wall-clock pacing (the calibration runs refined time, x2), sped
		// up sixfold once the hand lets go. All GPU passes - no budget
		// brake needed, that was the CPU engine's fan.
		let sub = Math.max( 1, Math.round( dt / 5.5 ) ) * 2;
		if ( ! stroke && false !== surface.raffer ) {
			sub *= 6;
		}
		surface.steps( Math.min( sub, 96 ) );
		surface.render();
		present();
		if ( 0 === tickNr % 10 ) {
			surface.checkWet();
		}
	}
	if ( bound ) {
		// The island's canvas already holds the fresh picture; the editor
		// recomposite is the CPU-side cost, so it runs at half rate while
		// drying and full rate under the hand.
		if ( stroke || 0 === tickNr % 2 ) {
			bound.requestRender();
		}
	}
	if ( surface.wet < 1 && ! stroke ) {
		ticking = false;
		bake();
		return;
	}
	window.requestAnimationFrame( tick );
}

/* ------------------------------- the bake ------------------------------- */

/**
 * Write the dried wash into its target layer and make it ONE history entry.
 * Also the flush for undo/save/export, so it must work synchronously.
 */
function bake() {
	if ( ! targetId || ! bound || ! surface ) {
		return;
	}
	const editor = bound.getEditor();
	const dest = editor.state.layers.find( ( l ) => l.id === targetId );
	if ( dest && dest.canvas && surface.hasRegion() && ! surface.lost ) {
		// Settle everything and render the final state through the SAME
		// ink mapping the live overlay used - the moment of drying must
		// not change a single colour. The ground is re-fed first so the
		// glaze bakes over the layer's CURRENT pixels even if something
		// edited them while the wash was wet.
		groundKey = '';
		feedGround( false );
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
		dctx.drawImage(
			surface.canvas,
			surface.rx * WET_SC,
			surface.ry * WET_SC
		);
		dctx.restore();
		editor.dispatch( {
			type: 'UPDATE_LAYER',
			id: dest.id,
			patch: { canvas: dest.canvas, dataUrl: null },
		} );
		editor.commit( __( 'Watercolor wash', 'wunderpaint' ) );
	}
	surface.reset();
	pres = null;
	targetId = null;
	targetParent = null;
	stroke = null;
	groundKey = '';
	if ( bound ) {
		bound.requestRender();
	}
}

/** Commit any wet paint right now (undo/redo, save, export, region cap). */
export function wetFlushNow() {
	if ( targetId ) {
		bake();
	}
}
