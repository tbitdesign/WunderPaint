/**
 * One-click text annotation presets (v1.11, reworked v1.248, refocused
 * v1.256.0): each returns an UPDATE_LAYER patch. Every preset starts
 * from the same RESET, so switching presets never leaves half of the
 * previous look behind - including text effects.
 *
 * Deliberately hand-drawn ONLY: markers, circles, boxes, underlines and
 * strikes on the doodle painters (marker/circleMark/scribbleUnder/
 * strikeFx style variants). Material looks live in the Effects panel,
 * shadows/outlines in Blending Options - no overlap (the old Basics and
 * Multi Outline groups moved out for exactly that reason).
 */

import { __ } from '@wordpress/i18n';

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
	fxPreset( 'marker-yellow', 'marker', __( 'Marker', 'wunderpaint' ), {
		marker: { style: 0, color: '#ffe066', rough: 4, seed: 1 },
	} ),
	fxPreset( 'marker-swipe', 'marker', __( 'Pink Swipe', 'wunderpaint' ), {
		marker: { style: 1, color: '#ff5da2', rough: 5, seed: 5 },
	} ),
	fxPreset( 'marker-double', 'marker', __( 'Double Swipe', 'wunderpaint' ), {
		marker: { style: 2, color: '#4fe3c1', rough: 5, seed: 2 },
	} ),
	fxPreset(
		'marker-scribble',
		'marker',
		__( 'Scribble Fill', 'wunderpaint' ),
		{ marker: { style: 3, color: '#ffb054', rough: 6, seed: 4 } }
	),
	fxPreset( 'marker-sky-swipe', 'marker', __( 'Sky Swipe', 'wunderpaint' ), {
		marker: { style: 1, color: '#8ecbff', rough: 6, seed: 9 },
	} ),
	fxPreset(
		'marker-rough',
		'marker',
		__( 'Weathered Marker', 'wunderpaint' ),
		{ marker: { style: 0, color: '#c9b6ff', rough: 10, seed: 8 } }
	),
	fxPreset( 'marker-sun', 'marker', __( 'Sun Swipe', 'wunderpaint' ), {
		marker: { style: 1, color: '#ffd166', rough: 4, seed: 11 },
	} ),
	fxPreset( 'marker-mint', 'marker', __( 'Mint Band', 'wunderpaint' ), {
		marker: { style: 0, color: '#4fe3c1', rough: 5, seed: 6 },
	} ),

	/* --------------------------- circles & boxes ------------------------- */
	fxPreset( 'circled', 'circles', __( 'Circled', 'wunderpaint' ), {
		circleMark: { style: 0, color: '#e5484d', rough: 4, seed: 2 },
	} ),
	fxPreset(
		'circled-sketch',
		'circles',
		__( 'Sketchy Circle', 'wunderpaint' ),
		{ circleMark: { style: 0, color: '#3b82f6', rough: 9, seed: 7 } }
	),
	fxPreset( 'circled-double', 'circles', __( 'Double Loop', 'wunderpaint' ), {
		circleMark: { style: 1, color: '#e5484d', rough: 5, seed: 6 },
	} ),
	fxPreset( 'boxed', 'circles', __( 'Sketchy Box', 'wunderpaint' ), {
		circleMark: { style: 2, color: '#1a1d21', rough: 5, seed: 3 },
	} ),
	fxPreset( 'boxed-blue', 'circles', __( 'Blue Box', 'wunderpaint' ), {
		circleMark: { style: 2, color: '#3b82f6', rough: 7, seed: 9 },
	} ),
	fxPreset( 'ink-loop', 'circles', __( 'Ink Loop', 'wunderpaint' ), {
		circleMark: { style: 1, color: '#1a1d21', rough: 6, seed: 12 },
	} ),
	fxPreset( 'green-oval', 'circles', __( 'Green Oval', 'wunderpaint' ), {
		circleMark: { style: 0, color: '#1a7f37', rough: 7, seed: 10 },
	} ),
	fxPreset( 'boxed-red', 'circles', __( 'Red Box', 'wunderpaint' ), {
		circleMark: { style: 2, color: '#e5484d', rough: 5, seed: 5 },
	} ),

	/* ------------------------------ underlines --------------------------- */
	fxPreset( 'scribbled', 'underline', __( 'Scribble Under', 'wunderpaint' ), {
		scribbleUnder: { style: 0, color: '#3b82f6', rough: 5, seed: 3 },
	} ),
	fxPreset(
		'double-under',
		'underline',
		__( 'Double Under', 'wunderpaint' ),
		{ scribbleUnder: { style: 1, color: '#e5484d', rough: 5, seed: 4 } }
	),
	fxPreset( 'zigzag-hand', 'underline', __( 'Hand Zigzag', 'wunderpaint' ), {
		scribbleUnder: { style: 2, color: '#1a7f37', rough: 5, seed: 2 },
	} ),
	fxPreset( 'loop-under', 'underline', __( 'Cursive Loops', 'wunderpaint' ), {
		scribbleUnder: { style: 3, color: '#8e4ec6', rough: 4, seed: 5 },
	} ),
	fxPreset( 'wave-under', 'underline', __( 'Wave Under', 'wunderpaint' ), {
		underlineFx: {
			style: 2,
			thickness: 8,
			offset: 12,
			color: '#3b82f6',
		},
	} ),
	fxPreset( 'rough-under', 'underline', __( 'Rough Under', 'wunderpaint' ), {
		scribbleUnder: { style: 0, color: '#ffb054', rough: 9, seed: 9 },
	} ),
	fxPreset( 'clean-under', 'underline', __( 'Clean Under', 'wunderpaint' ), {
		underlineFx: {
			style: 0,
			thickness: 10,
			offset: 12,
			color: '#1a1d21',
		},
	} ),
	fxPreset(
		'dashed-under',
		'underline',
		__( 'Dashed Under', 'wunderpaint' ),
		{
			underlineFx: {
				style: 1,
				thickness: 9,
				offset: 12,
				color: '#e5484d',
			},
		}
	),

	/* ------------------------------- strikes ----------------------------- */
	fxPreset( 'redline', 'strike', __( 'Red Strike', 'wunderpaint' ), {
		strikeFx: { style: 0, color: '#e5484d', rough: 6, seed: 2 },
	} ),
	fxPreset( 'double-strike', 'strike', __( 'Double Strike', 'wunderpaint' ), {
		strikeFx: { style: 1, color: '#1a1d21', rough: 4, seed: 4 },
	} ),
	fxPreset( 'crossed-out', 'strike', __( 'Crossed Out', 'wunderpaint' ), {
		strikeFx: { style: 2, color: '#e5484d', rough: 5, seed: 3 },
	} ),
	fxPreset( 'blue-pencil', 'strike', __( 'Blue Pencil', 'wunderpaint' ), {
		strikeFx: { style: 0, color: '#3b82f6', rough: 8, seed: 7 },
	} ),

	/* ------------------------------- combos ------------------------------ */
	fxPreset( 'teacher-red', 'combo', __( "Teacher's Red", 'wunderpaint' ), {
		circleMark: { style: 0, color: '#e5484d', rough: 6, seed: 4 },
		strikeFx: { style: 0, color: '#e5484d', rough: 6, seed: 9 },
	} ),
	fxPreset( 'important', 'combo', __( 'Important!', 'wunderpaint' ), {
		marker: { style: 0, color: '#ffe066', rough: 4, seed: 2 },
		scribbleUnder: { style: 2, color: '#e5484d', rough: 5, seed: 7 },
	} ),
	fxPreset( 'done-deal', 'combo', __( 'Checked Off', 'wunderpaint' ), {
		marker: { style: 1, color: '#b8f0c9', rough: 5, seed: 6 },
		strikeFx: { style: 0, color: '#1a7f37', rough: 4, seed: 5 },
	} ),
	fxPreset( 'noted', 'combo', __( 'Noted', 'wunderpaint' ), {
		marker: { style: 0, color: '#ffe066', rough: 4, seed: 3 },
		circleMark: { style: 0, color: '#e5484d', rough: 5, seed: 8 },
	} ),
	fxPreset( 'proof-read', 'combo', __( 'Proofread', 'wunderpaint' ), {
		circleMark: { style: 2, color: '#3b82f6', rough: 6, seed: 2 },
		scribbleUnder: { style: 1, color: '#3b82f6', rough: 5, seed: 6 },
	} ),
	fxPreset( 'sold-out', 'combo', __( 'Sold Out', 'wunderpaint' ), {
		marker: { style: 0, color: '#ffe066', rough: 5, seed: 5 },
		strikeFx: { style: 2, color: '#e5484d', rough: 5, seed: 6 },
	} ),
	fxPreset( 'action-item', 'combo', __( 'Action Item', 'wunderpaint' ), {
		circleMark: { style: 2, color: '#1a1d21', rough: 5, seed: 7 },
		scribbleUnder: { style: 2, color: '#e5484d', rough: 5, seed: 3 },
	} ),
	fxPreset( 'annotated', 'combo', __( 'Annotated', 'wunderpaint' ), {
		circleMark: { style: 1, color: '#8e4ec6', rough: 5, seed: 4 },
		scribbleUnder: { style: 3, color: '#8e4ec6', rough: 4, seed: 8 },
	} ),
];
