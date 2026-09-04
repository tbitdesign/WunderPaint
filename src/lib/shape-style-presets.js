/**
 * Shape style presets (v1.430): one click gives a shape a complete look -
 * fill, stroke, dash, stroke position and layer styles together - built
 * on the layer's own colour. Every preset starts from the same RESET, so
 * switching presets never leaves half of the previous look behind; the
 * text annotation presets work the same way.
 */

import { __ } from '@wordpress/i18n';

import { parseColor, toHexColor } from './color';

/** Picker groups, in display order. */
export const SHAPE_STYLE_PRESET_CATEGORIES = {
	outline: () => __( 'Outlines', 'wunderpaint' ),
	look: () => __( 'Looks', 'wunderpaint' ),
};

/** Everything a preset may touch, back at its default. */
export const SHAPE_STYLE_RESET = {
	fillType: 'solid',
	gradientStops: null,
	pattern: 'none',
	patternData: null,
	stroke: null,
	strokeW: 0,
	strokeAlign: null,
	strokeDash: null,
	strokeDashLen: null,
	strokeDashGap: null,
	styles: null,
};

/**
 * The colour a preset builds on: the fill, or the stroke of an outline
 * (an outline preset moves the colour into the stroke, and the next
 * preset has to find it there).
 *
 * @param {Object} layer Shape layer.
 * @return {string} A CSS colour.
 */
export function shapeBaseColor( layer ) {
	const fill = layer?.fill;
	if ( fill && 'transparent' !== fill ) {
		return fill;
	}
	return layer?.stroke || '#3b66ff';
}

/** Mix a colour towards another (t = 0 keeps it, 1 is the target). */
const mix = ( color, target, t ) => {
	const a = parseColor( color );
	const b = parseColor( target );
	if ( ! a || ! b ) {
		return color;
	}
	return toHexColor(
		Math.round( a.r + ( b.r - a.r ) * t ),
		Math.round( a.g + ( b.g - a.g ) * t ),
		Math.round( a.b + ( b.b - a.b ) * t )
	);
};
const lighter = ( c, t ) => mix( c, '#ffffff', t );
const darker = ( c, t ) => mix( c, '#000000', t );
const translucent = ( c, alpha ) => {
	const p = parseColor( c );
	return p ? `rgba(${ p.r }, ${ p.g }, ${ p.b }, ${ alpha })` : c;
};

/**
 * @param {string}   id       Preset id.
 * @param {string}   category Group key.
 * @param {string}   label    Translated label.
 * @param {Function} build    ( baseColor ) => the fields on top of RESET.
 * @return {Object} The preset.
 */
const preset = ( id, category, label, build ) => ( {
	id,
	category,
	label,
	patch: ( layer ) => ( {
		...SHAPE_STYLE_RESET,
		...build( shapeBaseColor( layer ) ),
	} ),
} );

/** The bare reset: a plain fill in the base colour, nothing else. */
export const SHAPE_STYLE_RESET_PRESET = preset(
	'none',
	'',
	__( 'None', 'wunderpaint' ),
	( c ) => ( { fill: c } )
);

export const SHAPE_STYLE_PRESETS = [
	/* ------------------------------ outlines ----------------------------- */
	preset( 'outline', 'outline', __( 'Outline', 'wunderpaint' ), ( c ) => ( {
		fill: 'transparent',
		stroke: c,
		strokeW: 4,
	} ) ),
	preset(
		'outline-thin',
		'outline',
		__( 'Thin outline', 'wunderpaint' ),
		( c ) => ( { fill: 'transparent', stroke: c, strokeW: 1.5 } )
	),
	preset(
		'outline-dashed',
		'outline',
		__( 'Dashed', 'wunderpaint' ),
		( c ) => ( {
			fill: 'transparent',
			stroke: c,
			strokeW: 3,
			strokeDash: 'dashed',
		} )
	),
	preset(
		'outline-dotted',
		'outline',
		__( 'Dotted', 'wunderpaint' ),
		( c ) => ( {
			fill: 'transparent',
			stroke: c,
			strokeW: 3,
			strokeDash: 'dotted',
		} )
	),
	preset( 'band', 'outline', __( 'Inside band', 'wunderpaint' ), ( c ) => ( {
		fill: c,
		stroke: darker( c, 0.35 ),
		strokeW: 12,
		strokeAlign: 'inside',
	} ) ),
	preset( 'framed', 'outline', __( 'Framed', 'wunderpaint' ), ( c ) => ( {
		fill: lighter( c, 0.85 ),
		stroke: c,
		strokeW: 3,
	} ) ),
	/* -------------------------------- looks ------------------------------ */
	preset( 'sticker', 'look', __( 'Sticker', 'wunderpaint' ), ( c ) => ( {
		fill: c,
		stroke: '#ffffff',
		strokeW: 8,
		strokeAlign: 'outside',
		styles: {
			dropShadow: {
				color: '#000000',
				opacity: 0.35,
				blur: 8,
				distance: 4,
				angle: 120,
				spread: 0,
			},
		},
	} ) ),
	preset( 'neon', 'look', __( 'Neon', 'wunderpaint' ), ( c ) => ( {
		fill: 'transparent',
		stroke: c,
		strokeW: 3,
		styles: {
			outerGlow: { color: c, opacity: 0.9, blur: 14, spread: 2 },
		},
	} ) ),
	preset( 'glass', 'look', __( 'Glass', 'wunderpaint' ), ( c ) => ( {
		fill: translucent( c, 0.35 ),
		stroke: 'rgba(255, 255, 255, 0.8)',
		strokeW: 2,
		strokeAlign: 'inside',
	} ) ),
	preset(
		'soft-shadow',
		'look',
		__( 'Soft shadow', 'wunderpaint' ),
		( c ) => ( {
			fill: c,
			styles: {
				dropShadow: {
					color: '#000000',
					opacity: 0.3,
					blur: 18,
					distance: 8,
					angle: 120,
					spread: 0,
				},
			},
		} )
	),
	preset( 'pop', 'look', __( 'Pop', 'wunderpaint' ), ( c ) => ( {
		fill: c,
		stroke: '#111111',
		strokeW: 3,
		styles: {
			dropShadow: {
				color: '#111111',
				opacity: 1,
				blur: 0,
				distance: 8,
				angle: 135,
				spread: 0,
			},
		},
	} ) ),
	preset( 'gradient', 'look', __( 'Gradient', 'wunderpaint' ), ( c ) => ( {
		fill: c,
		fillType: 'gradient',
		gradientStops: [
			{ color: lighter( c, 0.45 ), at: 0 },
			{ color: c, at: 1 },
		],
		gradientAngle: 135,
		gradientKind: 'linear',
	} ) ),
	preset( 'hatched', 'look', __( 'Hatched', 'wunderpaint' ), ( c ) => ( {
		fill: c,
		fillType: 'pattern',
		pattern: 'diagonal',
		stroke: c,
		strokeW: 2,
	} ) ),
	preset( 'dots', 'look', __( 'Dots', 'wunderpaint' ), ( c ) => ( {
		fill: c,
		fillType: 'pattern',
		pattern: 'dots',
		stroke: c,
		strokeW: 2,
	} ) ),
	preset( 'blueprint', 'look', __( 'Blueprint', 'wunderpaint' ), ( c ) => ( {
		fill: c,
		fillType: 'pattern',
		pattern: 'grid',
		stroke: c,
		strokeW: 2,
		strokeDash: 'dashed',
	} ) ),
];
