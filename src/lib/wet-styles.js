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
	crayon: 'dry',
	'colored-pencil': 'dry',
	airbrush: 'dry',
	'metal-leaf': 'dry',
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
 *   stain   liquid only: the share of that settling which does not wait
 *           for the water to go - ink takes to the fibres where it lands
 *   warp    liquid only: how far the edge wanders along the fibres (1 = a
 *           wash; a pen line keeps its edge)
 *   liftK   how easily settled pigment rewets (oil smears, acrylic locks)
 *   hide    paste only: how steeply a film's opacity rises with thickness
 *   carry   paste only: what the tool itself holds and carries along at
 *           the full smear dial (brush-carry.js) - the smudger
 *   opaque  dry only: powder that covers (pastel) instead of tinting what
 *           lies under it like a film (charcoal)
 *   amt     dry only: what one pass lays on the tooth
 *   fullHead  dry only: every head lays that amount, a thinly drawn mask
 *           too (headLoad below)
 *
 * The COLOUR of a wash or a body paint is carried in six bands
 * (pigment-bands.js); pigmentOf below is the three-channel pigment the
 * dry media and the extensions' own drivers still use.
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
		// How fast the brush spends its charge (the Paint load dial):
		// the paper drinks a watercolour brush dry soonest.
		thirst: 1.3,
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
		// Hardly any pull to the rim: with the film at rest a line three
		// cells wide dried HOLLOW at 0.9, dark edges around a grey middle.
		sogK: 0.3,
		korn: 0.25,
		gran: 0.15,
		depK: 3,
		// Ink STAINS: it takes to the fibres where it lands instead of
		// floating until the water has gone - a line stays the line that
		// was drawn, and into a wet wash it feathers and then holds.
		stain: 12,
		// A pen line keeps its edge: the read position wanders along the
		// paper's fibres a third as far as a wash's does.
		warp: 0.3,
		liftK: 0.25,
		// (The Bleed dial sets this; its default of 25 is this value.)
		visc: 0.45,
		seedK: 0.08,
		thirst: 1,
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
		// How well a film of this paint HIDES what it lies on (the render's
		// opacity over thickness). Gouache is chalk-laden and covers in a
		// breath (its film is the thinnest of the three, so the number is
		// the highest); oil stays the most see-through when thin.
		hide: 14,
		// Real gouache REDISSOLVES: the brush lifts the layer's paint - a
		// little. At 0.35 a stroke of white over dried blue came out a mid
		// blue: the white of a single pass has to stay a white. (In bands
		// a strong pigment tints far harder than three channels let it;
		// 0.15 still left the white half blue.)
		pickK: 0.08,
		korn: 0.4,
		gran: 0.4,
		openK: 0.0011,
		blendK: 0.35,
		thirst: 0.9,
	},
	acrylic: {
		sBase: 1.8,
		kMul: 1,
		thick: [ 0.35, 0.55 ],
		pigRate: 0.9,
		body: 0.45,
		gloss: 0.35,
		hide: 7,
		// Dry acrylic is locked; the brush barely lifts it.
		pickK: 0.05,
		korn: 0.22,
		gran: 0.22,
		openK: 0.0018,
		blendK: 0.15,
		thirst: 0.7,
	},
	oil: {
		sBase: 1.6,
		kMul: 1,
		thick: [ 0.4, 0.65 ],
		pigRate: 0.9,
		body: 0.65,
		gloss: 0.55,
		hide: 6,
		// Oil smears: the brush drags the layer's paint into the stroke.
		// (The Pickup dial sets this; its default of 25 is this value.)
		pickK: 0.25,
		korn: 0.15,
		gran: 0.15,
		openK: 0.00035,
		blendK: 1,
		thirst: 0.8,
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
		// No sheen and no tooth of its own (korn below): over the layer's
		// dried pixels a film without them shows exactly the colour it was
		// lifted from. With the gloss at 0.15 a stroke through an even
		// field left a band a thirtieth paler, dotted with the weave. In a
		// wash of real paint the smudger takes that paint's look instead
		// (wet-controller.js).
		gloss: 0,
		// What it lifts has to cover what it was lifted from: the layer's
		// paint comes up as a film of 0.38 at the most, and at the 3 this
		// stood at such a film hides two thirds - a stroke through an even
		// field left it a third paler, the white of the canvas through it.
		hide: 14,
		korn: 0,
		gran: 0,
		openK: 0.0004,
		blendK: 2,
		pickK: 0.85,
		// THE TOOL CARRIES (brush-carry.js): what its film holds at the
		// full smear dial, in films of the thickness under it. It is all
		// the smudger has - it brings no paint, it moves the paint that
		// is there. At 3 and the dial's own 80 it draws paint out of a
		// field for some three brush widths (at 1.9: under two).
		carry: 3,
	},
	// DRY family (wet-dry-gl.js): dust on the tooth, nothing else.
	charcoal: {
		kMul: 1.4,
		amt: 0.55,
		tooth: 0.85,
		gran: 0.85,
		// One stick, whichever head: see headLoad.
		fullHead: true,
	},
	// Charcoal's coloured, softer sibling: true colour instead of the
	// darkened stick, lays MORE dust, bites the tooth less - velvet.
	pastel: {
		kMul: 1,
		amt: 1.2,
		tooth: 0.5,
		gran: 0.5,
		// Pastel is opaque powder: it covers, it does not tint (the dry
		// island's uOpaque). Charcoal stays the absorbing film it was.
		opaque: 1,
	},
	// Bound pigment: wax bridges the tooth; pencils leave a thin, layered film.
	// pressSize/pressExp: how the medium answers pen pressure - the
	// smallest size factor and the pigment exponent (dry default 0.45/1.3).
	crayon: {
		kMul: 1,
		amt: 1.25,
		tooth: 0.75,
		gran: 0.45,
		medium: 1,
		sheen: 0.18,
		pressSize: 0.72,
		pressExp: 1.15,
	},
	// A pencil line hardly widens under pressure, it darkens.
	'colored-pencil': {
		kMul: 1,
		// One firm pass leaves the grain of the sheet in the line; the
		// second closes it. (Laid as the head's profile - see stampOne -
		// a pass carries about six tenths of this to the tooth.)
		amt: 1.45,
		tooth: 0.8,
		gran: 0.65,
		medium: 2,
		sheen: 0.05,
		pressSize: 0.82,
		pressExp: 1.25,
	},
	// Airbrush is deposited by elapsed time, independent of pointer event
	// rate. The trigger meters paint; the cone is the distance, not the hand.
	airbrush: {
		kMul: 1,
		amt: 0.6,
		tooth: 0,
		gran: 0,
		medium: 3,
		rate: 2,
		pressSize: 1,
		pressExp: 1.1,
	},
	// Reflective leaf, not a gold RGB preset. Every selected color can be foil.
	'metal-leaf': {
		kMul: 1,
		amt: 1.6,
		tooth: 0.35,
		gran: 0.2,
		medium: 4,
		sheen: 0.8,
		pressSize: 0.6,
		pressExp: 1,
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
		// 25, not 50: the dial IS the viscosity (0.2 + x), and at 0.7 a
		// line a few cells wide ran to its own edges and dried hollow.
		[ 'bleed', 25 ],
		[ 'dry', 50 ],
	],
	gouache: [
		[ 'wet', 50 ],
		[ 'dry', 55 ],
		[ 'grain', 40 ],
		// 8, not 35: the dial IS pickK - see the preset.
		[ 'pickup', 8 ],
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
		// 25, not 50: what the brush lifts here is paint that has SET (the
		// layer). Open oil mixes by itself, as long as it is open.
		[ 'pickup', 25 ],
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
	crayon: [
		[ 'press', 55 ],
		[ 'tooth', 75 ],
		[ 'sheen', 18 ],
	],
	'colored-pencil': [
		[ 'press', 50 ],
		[ 'tooth', 80 ],
	],
	airbrush: [ [ 'rate', 50 ] ],
	'metal-leaf': [
		[ 'press', 60 ],
		[ 'tooth', 35 ],
		[ 'sheen', 80 ],
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
			case 'sheen':
				out.sheen = x;
				break;
			case 'rate':
				out.rate = 0.5 + 3 * x;
				break;
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
				out.tooth = preset.medium ? x : 0.3 + 0.7 * x;
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
				out.hide = ( preset.hide ?? 3 ) * ( 0.5 + x );
				break;
			case 'smear':
				out.blendK = 2.4 * x;
				// And the DIRECTIONAL half: open paint dragged along the
				// stroke. Capped well under the shader's conservation
				// bound (see wet-paste-gl.js).
				out.advK = 0.14 * x;
				// ... and what the tool itself carries along, where the
				// medium is one that carries (the smudger).
				if ( preset.carry ) {
					out.carry = preset.carry * x;
				}
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
 * How much more a stick lays with a head whose mask is drawn thin.
 *
 * The island takes a head's PROFILE - the most any dab of a segment covers
 * a cell - and not its dabs piled up. A mask drawn at six tenths was made
 * to build up over twenty overlapping dabs; as a profile it lays six
 * tenths for good, and soft charcoal and the stick on its side came out a
 * pale grey beside the tip (seen in the brush previews, 10.11.2026). A
 * medium that says `fullHead` is one stick whichever head it wears, and
 * lays the amount of its preset with each. The others were tuned on their
 * heads as drawn (pastel on the soft charcoal head) and are left alone.
 *
 * @param {string}  styleId The medium.
 * @param {?Object} tip     The head (a tip definition).
 * @return {number} Factor on the stroke's pigment, 1 or more.
 */
export function headLoad( styleId, tip ) {
	const drawn = tip?.genArgs?.deckung;
	return WET_STYLES[ styleId ]?.fullHead && drawn > 0 && drawn < 1
		? 1 / drawn
		: 1;
}

/**
 * Kubelka-Munk identity of a hex colour. Transparent media (sBase 0) get
 * absorption only, K = -ln(c). Opaque media invert KM: K/S = (1-c)^2 / 2c,
 * so WHITE really is a pigment (K ~ 0, all scattering) and mixes like one.
 *
 * A LIGHT pigment scatters more than a dark one. With one scattering for
 * every colour, white had the tinting strength of ultramarine: white laid
 * into wet blue in equal parts came out #4678be, a blue hardly lighter
 * than the blue (measured 09.11.2026 - highlights did not read at all).
 * Real white is the strongest scatterer on the palette. K scales with S,
 * so K/S - the colour a pigment shows on its own - is exactly what it was;
 * only what a pigment does to OTHERS in a mix changes.
 */
const SCATTER_LIGHT = 6;
const SCATTER_CURVE = 3.5;

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
	const light = ( ch[ 0 ] + ch[ 1 ] + ch[ 2 ] ) / 3;
	const boost = 1 + SCATTER_LIGHT * Math.pow( light, SCATTER_CURVE );
	const s = sBase * boost;
	const k = ( v ) =>
		Math.min( 8, ( ( ( 1 - v ) * ( 1 - v ) ) / ( 2 * v ) ) * sBase ) *
		boost *
		( kMul || 1 );
	return {
		kr: k( ch[ 0 ] ),
		kg: k( ch[ 1 ] ),
		kb: k( ch[ 2 ] ),
		sr: s,
		sg: s,
		sb: s,
	};
}
