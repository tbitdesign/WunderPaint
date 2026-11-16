/**
 * One-click text annotation presets (v1.11, reworked v1.248, refocused
 * v1.256.0): each returns an UPDATE_LAYER patch. Every preset starts
 * from the same RESET, so switching presets never leaves half of the
 * previous look behind - including text effects.
 *
 * Text annotations: highlights, markers, circles, boxes, underlines and
 * strikes on the doodle painters (marker/circleMark/scribbleUnder/
 * strikeFx style variants). Material looks live in the Effects panel,
 * shadows/outlines in Blending Options - no overlap (the old Basics and
 * Multi Outline groups moved out for exactly that reason).
 */

import { __ } from '@wordpress/i18n';
import { TEXT_FX } from './text-fx-defs';

/** Picker groups, in display order. */
export const TEXT_STYLE_PRESET_CATEGORIES = {
	marker: () => __( 'Marker', 'wunderpaint' ),
	circles: () => __( 'Circles & Boxes', 'wunderpaint' ),
	underline: () => __( 'Underlines', 'wunderpaint' ),
	strike: () => __( 'Strikes', 'wunderpaint' ),
	combo: () => __( 'Combos', 'wunderpaint' ),
};

const RESET = {
	outlineColor: null,
	outlineW: 0,
	shadowOn: false,
	styles: null,
	textFX: null,
};

/** The bare reset - the picker offers it as "Remove annotation". */
export const TEXT_STYLE_RESET_PRESET = {
	id: 'none',
	category: '',
	label: __( 'None', 'wunderpaint' ),
	patch: () => ( { ...RESET } ),
};

/** A preset whose look is a plain textFX combination. */
const fxPreset = ( id, category, label, fx ) => ( {
	id,
	category,
	label,
	patch: () => ( { ...RESET, textFX: { ...fx } } ),
} );

export const TEXT_STYLE_PRESETS = [
	/* ------------------------------- marker ------------------------------ */
	fxPreset( 'highlight', 'marker', __( 'Highlight', 'wunderpaint' ), {
		highlight: {
			...TEXT_FX.find( ( item ) => item.id === 'highlight' ).def,
			color: '#efd959',
			opacity: 88,
			pressure: 32,
			texture: 20,
			pad: 9,
			radius: 14,
		},
	} ),
	fxPreset( 'marker-yellow', 'marker', __( 'Marker', 'wunderpaint' ), {
		marker: {
			seed: 1,
			color: '#edcc45',
			style: 0,
			rough: 2,
			thickness: 57,
			pressure: 34,
			texture: 32,
			opacity: 92,
		},
	} ),
	fxPreset( 'marker-swipe', 'marker', __( 'Pink Swipe', 'wunderpaint' ), {
		marker: {
			style: 1,
			seed: 5,
			color: '#e783a3',
			rough: 4,
			thickness: 57,
			pressure: 78,
			texture: 46,
			opacity: 91,
		},
	} ),
	fxPreset( 'marker-double', 'marker', __( 'Double Swipe', 'wunderpaint' ), {
		marker: {
			style: 2,
			seed: 2,
			color: '#69c4a5',
			rough: 3,
			thickness: 68,
			pressure: 45,
			texture: 30,
			opacity: 91,
		},
	} ),
	fxPreset(
		'marker-scribble',
		'marker',
		__( 'Scribble Fill', 'wunderpaint' ),
		{
			marker: {
				style: 3,
				seed: 4,
				color: '#e3ad4c',
				rough: 3,
				thickness: 63,
				pressure: 68,
				texture: 40,
				opacity: 91,
			},
		}
	),
	fxPreset( 'marker-sky-swipe', 'marker', __( 'Sky Swipe', 'wunderpaint' ), {
		marker: {
			style: 1,
			seed: 9,
			color: '#78acd2',
			rough: 2,
			thickness: 52,
			pressure: 53,
			texture: 23,
			opacity: 92,
		},
	} ),
	fxPreset(
		'marker-rough',
		'marker',
		__( 'Weathered Marker', 'wunderpaint' ),
		{
			marker: {
				style: 0,
				seed: 8,
				color: '#a48bb8',
				rough: 7,
				thickness: 68,
				pressure: 78,
				texture: 90,
				opacity: 94,
			},
		}
	),
	fxPreset( 'marker-sun', 'marker', __( 'Sun Swipe', 'wunderpaint' ), {
		marker: {
			style: 1,
			seed: 11,
			color: '#efbc42',
			rough: 3,
			thickness: 72,
			pressure: 44,
			texture: 37,
			opacity: 95,
		},
	} ),
	fxPreset( 'marker-mint', 'marker', __( 'Mint Band', 'wunderpaint' ), {
		marker: {
			style: 0,
			seed: 6,
			color: '#83bc9c',
			rough: 2,
			thickness: 34,
			pressure: 35,
			texture: 20,
			opacity: 91,
		},
	} ),

	/* --------------------------- circles & boxes ------------------------- */
	fxPreset( 'circled', 'circles', __( 'Circled', 'wunderpaint' ), {
		circleMark: {
			style: 0,
			seed: 2,
			color: '#bc4638',
			rough: 3,
			thickness: 37,
			pressure: 80,
			texture: 23,
			opacity: 100,
		},
	} ),
	fxPreset(
		'circled-sketch',
		'circles',
		__( 'Sketchy Circle', 'wunderpaint' ),
		{
			circleMark: {
				style: 0,
				seed: 7,
				color: '#416d94',
				material: 'pencil',
				rough: 7,
				thickness: 52,
				pressure: 72,
				texture: 85,
				opacity: 100,
			},
		}
	),
	fxPreset( 'circled-double', 'circles', __( 'Double Loop', 'wunderpaint' ), {
		circleMark: {
			style: 1,
			seed: 6,
			color: '#bf4a3d',
			rough: 4,
			thickness: 26,
			pressure: 68,
			texture: 20,
			opacity: 98,
		},
	} ),
	fxPreset( 'boxed', 'circles', __( 'Sketchy Box', 'wunderpaint' ), {
		circleMark: {
			style: 2,
			seed: 3,
			color: '#343633',
			rough: 5,
			thickness: 33,
			pressure: 75,
			texture: 32,
			opacity: 98,
		},
	} ),
	fxPreset( 'boxed-blue', 'circles', __( 'Blue Box', 'wunderpaint' ), {
		circleMark: {
			style: 2,
			seed: 9,
			color: '#306e9d',
			rough: 2,
			thickness: 47,
			pressure: 63,
			texture: 23,
			opacity: 95,
		},
	} ),
	fxPreset( 'ink-loop', 'circles', __( 'Ink Loop', 'wunderpaint' ), {
		circleMark: {
			style: 1,
			seed: 12,
			color: '#343634',
			rough: 4,
			thickness: 25,
			pressure: 87,
			texture: 33,
			opacity: 96,
		},
	} ),
	fxPreset( 'green-oval', 'circles', __( 'Green Oval', 'wunderpaint' ), {
		circleMark: {
			style: 0,
			seed: 10,
			color: '#447858',
			rough: 2,
			thickness: 56,
			pressure: 92,
			texture: 19,
			opacity: 96,
		},
	} ),
	fxPreset( 'boxed-red', 'circles', __( 'Red Box', 'wunderpaint' ), {
		circleMark: {
			style: 2,
			seed: 5,
			color: '#aa504a',
			material: 'pencil',
			rough: 6,
			thickness: 52,
			pressure: 74,
			texture: 73,
			opacity: 100,
		},
	} ),

	/* ------------------------------ underlines --------------------------- */
	fxPreset( 'scribbled', 'underline', __( 'Scribble Under', 'wunderpaint' ), {
		scribbleUnder: {
			style: 0,
			seed: 3,
			color: '#306d97',
			rough: 4,
			thickness: 50,
			pressure: 87,
			texture: 24,
			opacity: 100,
		},
	} ),
	fxPreset(
		'double-under',
		'underline',
		__( 'Double Under', 'wunderpaint' ),
		{
			scribbleUnder: {
				style: 1,
				seed: 4,
				color: '#ba4b3c',
				rough: 3,
				thickness: 43,
				pressure: 84,
				texture: 21,
				opacity: 98,
			},
		}
	),
	fxPreset( 'zigzag-hand', 'underline', __( 'Hand Zigzag', 'wunderpaint' ), {
		scribbleUnder: {
			style: 2,
			seed: 2,
			color: '#4c7658',
			rough: 4,
			thickness: 30,
			pressure: 71,
			texture: 34,
			opacity: 98,
		},
	} ),
	fxPreset( 'loop-under', 'underline', __( 'Cursive Loops', 'wunderpaint' ), {
		scribbleUnder: {
			style: 3,
			seed: 5,
			color: '#79648e',
			rough: 3,
			thickness: 32,
			pressure: 79,
			texture: 19,
			opacity: 97,
		},
	} ),
	fxPreset( 'wave-under', 'underline', __( 'Wave Under', 'wunderpaint' ), {
		underlineFx: {
			style: 2,
			color: '#397397',
			thickness: 6,
			offset: 10,
			rough: 2,
			pressure: 72,
			texture: 22,
			seed: 5,
		},
	} ),
	fxPreset( 'rough-under', 'underline', __( 'Rough Under', 'wunderpaint' ), {
		scribbleUnder: {
			style: 0,
			seed: 9,
			color: '#b68843',
			material: 'pencil',
			rough: 7,
			thickness: 77,
			pressure: 88,
			texture: 90,
			opacity: 100,
		},
	} ),
	fxPreset( 'clean-under', 'underline', __( 'Clean Under', 'wunderpaint' ), {
		underlineFx: {
			style: 0,
			color: '#353b36',
			thickness: 7,
			offset: 10,
			rough: 1,
			pressure: 84,
			texture: 16,
			seed: 7,
		},
	} ),
	fxPreset(
		'dashed-under',
		'underline',
		__( 'Dashed Under', 'wunderpaint' ),
		{
			underlineFx: {
				color: '#b44b42',
				style: 0,
				dashed: true,
				thickness: 6,
				offset: 10,
				rough: 2,
				pressure: 58,
				texture: 25,
				seed: 11,
			},
		}
	),

	/* ------------------------------- strikes ----------------------------- */
	fxPreset( 'redline', 'strike', __( 'Red Strike', 'wunderpaint' ), {
		strikeFx: {
			style: 0,
			seed: 2,
			color: '#c24d40',
			rough: 3,
			thickness: 37,
			pressure: 85,
			texture: 24,
			opacity: 94,
		},
	} ),
	fxPreset( 'double-strike', 'strike', __( 'Double Strike', 'wunderpaint' ), {
		strikeFx: {
			style: 1,
			seed: 4,
			color: '#383b36',
			rough: 3,
			thickness: 28,
			pressure: 78,
			texture: 28,
			opacity: 96,
		},
	} ),
	fxPreset( 'crossed-out', 'strike', __( 'Crossed Out', 'wunderpaint' ), {
		strikeFx: {
			style: 2,
			seed: 3,
			color: '#bd493e',
			rough: 4,
			thickness: 38,
			pressure: 78,
			texture: 28,
			opacity: 95,
		},
	} ),
	fxPreset( 'blue-pencil', 'strike', __( 'Blue Pencil', 'wunderpaint' ), {
		strikeFx: {
			style: 0,
			seed: 7,
			color: '#466e91',
			material: 'pencil',
			rough: 5,
			thickness: 56,
			pressure: 80,
			texture: 81,
			opacity: 100,
		},
	} ),

	/* ------------------------------- combos ------------------------------ */
	fxPreset( 'teacher-red', 'combo', __( "Teacher's Red", 'wunderpaint' ), {
		circleMark: {
			style: 0,
			seed: 4,
			color: '#bd4d3e',
			rough: 4,
			thickness: 34,
			pressure: 82,
			texture: 25,
		},
		strikeFx: {
			style: 0,
			seed: 9,
			color: '#bd4d3e',
			rough: 3,
			thickness: 32,
			pressure: 87,
			texture: 23,
			opacity: 92,
		},
	} ),
	fxPreset( 'important', 'combo', __( 'Important!', 'wunderpaint' ), {
		marker: {
			style: 0,
			seed: 2,
			color: '#ebd257',
			rough: 2,
			thickness: 50,
			pressure: 32,
			texture: 28,
			opacity: 88,
		},
		scribbleUnder: {
			style: 2,
			seed: 7,
			color: '#b64a3a',
			rough: 3,
			thickness: 30,
			pressure: 81,
			texture: 23,
		},
	} ),
	fxPreset( 'done-deal', 'combo', __( 'Checked Off', 'wunderpaint' ), {
		marker: {
			style: 1,
			seed: 6,
			color: '#a1c5a2',
			rough: 3,
			thickness: 46,
			pressure: 64,
			texture: 35,
			opacity: 86,
		},
		strikeFx: {
			style: 0,
			seed: 5,
			color: '#4b7657',
			rough: 3,
			thickness: 38,
			pressure: 86,
			texture: 25,
		},
	} ),
	fxPreset( 'noted', 'combo', __( 'Noted', 'wunderpaint' ), {
		marker: {
			style: 0,
			seed: 3,
			color: '#e7cf6b',
			rough: 2,
			thickness: 51,
			pressure: 30,
			texture: 23,
			opacity: 83,
		},
		circleMark: {
			style: 0,
			seed: 8,
			color: '#b95345',
			rough: 4,
			thickness: 35,
			pressure: 80,
			texture: 23,
		},
	} ),
	fxPreset( 'proof-read', 'combo', __( 'Proofread', 'wunderpaint' ), {
		circleMark: {
			style: 2,
			seed: 2,
			color: '#486e98',
			material: 'pencil',
			rough: 4,
			thickness: 44,
			pressure: 78,
			texture: 73,
		},
		scribbleUnder: {
			style: 1,
			seed: 6,
			color: '#486e98',
			rough: 3,
			thickness: 28,
			pressure: 80,
			texture: 25,
		},
	} ),
	fxPreset( 'sold-out', 'combo', __( 'Sold Out', 'wunderpaint' ), {
		marker: {
			style: 0,
			seed: 5,
			color: '#e9ce63',
			rough: 4,
			thickness: 53,
			pressure: 58,
			texture: 47,
			opacity: 88,
		},
		strikeFx: {
			style: 2,
			seed: 6,
			color: '#b4493b',
			rough: 4,
			thickness: 41,
			pressure: 76,
			texture: 34,
		},
	} ),
	fxPreset( 'action-item', 'combo', __( 'Action Item', 'wunderpaint' ), {
		circleMark: {
			style: 2,
			seed: 7,
			color: '#40463f',
			rough: 3,
			thickness: 35,
			pressure: 80,
			texture: 28,
		},
		scribbleUnder: {
			style: 2,
			seed: 3,
			color: '#b75042',
			rough: 3,
			thickness: 28,
			pressure: 78,
			texture: 25,
		},
	} ),
	fxPreset( 'annotated', 'combo', __( 'Annotated', 'wunderpaint' ), {
		circleMark: {
			style: 1,
			seed: 4,
			color: '#776387',
			rough: 4,
			thickness: 29,
			pressure: 87,
			texture: 25,
		},
		scribbleUnder: {
			style: 3,
			seed: 8,
			color: '#776387',
			rough: 3,
			thickness: 28,
			pressure: 82,
			texture: 20,
		},
	} ),
];
