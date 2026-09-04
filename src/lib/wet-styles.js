/**
 * The wet styles as data: what the islands are told about a medium.
 *
 * Moved out of the editor's wet controller (screens) so the bridge can
 * hand them to extensions: a studio that drives an island of its own
 * needs the same presets, dials and Kubelka-Munk identities the brush
 * uses, or its watercolour would be a different watercolour. Pure data
 * and pure functions - no DOM, no GL, no editor state.
 */

const clamp01 = ( v ) => ( v < 0 ? 0 : v > 1 ? 1 : v );

// THREE style-engine modules behind one interface - Thomas' verdict on
// the single-engine round was immediate ("watercolour variations"): the
// character of a medium is its TRANSPORT, so each family gets its own
// physics module. One is active at a time (one wash, one island).
export const FAMILY_OF = {
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
export const WET_STYLES = {
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
export function tuned( styleId, opts ) {
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
export function pigmentOf( hex, sBase, kMul ) {
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
