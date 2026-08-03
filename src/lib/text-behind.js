/**
 * Text behind subject (v1.375.0): geometry plan for the magazine look -
 * an editable headline slides between an image layer and a local cutout
 * of its subject, so the text reads behind the person but in front of
 * the background. Pure math; the runtime half (cutout via the local
 * model) lives in ai-actions.js.
 */

import { __ } from '@wordpress/i18n';

const clamp = ( v, lo, hi ) => Math.min( hi, Math.max( lo, v ) );

/**
 * Plan the two new layers for a source image layer.
 *
 * @param {Object} layer The active image layer.
 * @return {Object} { cutout, text } geometry + text defaults.
 */
export function textBehindPlan( layer ) {
	const rot = layer.rot || 0;
	const w = layer.w * 0.92;
	const h = clamp( layer.h * 0.34, 40, Math.max( 40, layer.h ) );
	return {
		cutout: {
			name: ( layer.name || 'Image' ) + ' cutout',
			x: layer.x,
			y: layer.y,
			w: layer.w,
			h: layer.h,
			rot,
		},
		text: {
			name: 'Headline',
			text: __( 'Your headline', 'wunderpaint' ),
			x: layer.x + ( layer.w - w ) / 2,
			y: layer.y + ( layer.h - h ) / 2,
			w,
			h,
			fontSize: Math.round(
				clamp( Math.min( layer.w, layer.h ) * 0.26, 24, 240 )
			),
			// Anton ships in the plugin and only exists in one weight.
			fontFamily: 'Anton',
			weight: 400,
			color: '#ffffff',
			align: 'center',
			valign: 'middle',
			textTransform: 'uppercase',
			fixedWidth: true,
			rot,
		},
	};
}

/**
 * Splice the sandwich into the flat layer list: original, headline,
 * cutout (paint order bottom to top).
 *
 * @param {Array}  layers      Current flat layer list.
 * @param {string} layerId     Source layer id.
 * @param {Object} textLayer   Built headline layer.
 * @param {Object} cutoutLayer Built cutout layer.
 * @return {Array} New layer list.
 */
export function textBehindOrder( layers, layerId, textLayer, cutoutLayer ) {
	const index = layers.findIndex( ( l ) => l.id === layerId );
	const next = [ ...layers ];
	next.splice( index + 1, 0, textLayer, cutoutLayer );
	return next;
}

/**
 * Groups are double-linked: when the source layer is nested, the parent
 * group must list the two new ids right after it.
 *
 * @param {Array}  layers   Current flat layer list.
 * @param {Object} layer    Source layer.
 * @param {string} textId   Headline layer id.
 * @param {string} cutoutId Cutout layer id.
 * @return {?Object} { id, children } patch for the group, or null.
 */
export function textBehindGroupPatch( layers, layer, textId, cutoutId ) {
	if ( ! layer.parent ) {
		return null;
	}
	const group = layers.find( ( l ) => l.id === layer.parent );
	if ( ! group ) {
		return null;
	}
	const children = [ ...( group.children || [] ) ];
	const at = children.indexOf( layer.id );
	children.splice( at + 1, 0, textId, cutoutId );
	return { id: group.id, children };
}
