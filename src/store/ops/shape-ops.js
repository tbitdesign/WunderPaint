/**
 * Shape ops (v1.430): boolean operations between shape layers and the
 * stroke as a filled path. The geometry lives in lib/shape-boolean.js,
 * which loads on first use together with polybooljs.
 */

import { __, sprintf } from '@wordpress/i18n';

import { makeShape, uid } from '../document';
import { promptDialog } from '../../lib/dialogs';

/**
 * The selected shape layers with an area, in stack order (bottom first).
 * That order decides the base of a subtract.
 *
 * @param {Object} state Editor state.
 * @return {Object[]} Shape layers.
 */
export function selectedShapeLayers( state ) {
	const ids = new Set( state.selectedIds || [] );
	if ( state.activeId ) {
		ids.add( state.activeId );
	}
	return state.layers.filter(
		( l ) =>
			ids.has( l.id ) &&
			'shape' === l.type &&
			'line' !== l.shape &&
			! l.quad &&
			! l.locked
	);
}

/** True when two or more shapes are selected. */
export const canCombineShapes = ( state ) =>
	selectedShapeLayers( state ).length >= 2;

const COMBINE_LABELS = {
	unite: () => __( 'Unite', 'wunderpaint' ),
	subtract: () => __( 'Subtract', 'wunderpaint' ),
	intersect: () => __( 'Intersect', 'wunderpaint' ),
	exclude: () => __( 'Exclude', 'wunderpaint' ),
};

/** The four modes with their labels, for menus. */
export const COMBINE_MODES = Object.keys( COMBINE_LABELS ).map( ( id ) => ( {
	id,
	label: COMBINE_LABELS[ id ],
} ) );

/** Fields of the source that no longer describe a baked path. */
const BAKED = {
	rot: 0,
	flipX: false,
	flipY: false,
	radius: 0,
	cornerSmoothing: 0,
	shapeParams: null,
};

/**
 * Combine the selected shapes. The bottom-most keeps its style, name and
 * place in the stack and receives the result; the others are removed.
 *
 * @param {Object} editor Editor context.
 * @param {string} mode   unite | subtract | intersect | exclude.
 * @return {Promise<boolean>} Whether anything changed.
 */
export async function combineShapesOp( editor, mode ) {
	const { state, dispatch, commit } = editor;
	const layers = selectedShapeLayers( state );
	if ( layers.length < 2 || ! COMBINE_LABELS[ mode ] ) {
		return false;
	}
	const { combineShapes } = await import(
		/* webpackChunkName: "polybool" */ '../../lib/shape-boolean'
	);
	const rec = combineShapes( layers, mode );
	if ( ! rec ) {
		return false;
	}
	const base = layers[ 0 ];
	dispatch( {
		type: 'UPDATE_LAYER',
		id: base.id,
		patch: { ...BAKED, ...rec },
	} );
	dispatch( {
		type: 'REMOVE_LAYERS',
		ids: layers.slice( 1 ).map( ( l ) => l.id ),
	} );
	dispatch( { type: 'SET_ACTIVE', id: base.id } );
	commit( COMBINE_LABELS[ mode ]() );
	return true;
}

/** True when the layer is a shape with an area. */
export const canOffsetPath = ( layer ) =>
	!! layer &&
	'shape' === layer.type &&
	'line' !== layer.shape &&
	! layer.quad;

/**
 * Offset Path (v1.429): a new shape above the source, grown or shrunk by
 * `d` px, with the source's style. The source stays.
 *
 * @param {Object} editor Editor context.
 * @param {string} id     Shape layer id.
 * @param {number} d      Distance in px, negative shrinks.
 * @return {Promise<boolean>} Whether a layer was added.
 */
export async function offsetPathOp( editor, id, d ) {
	const { state, dispatch, commit } = editor;
	const layer = state.layers.find( ( l ) => l.id === id );
	if ( ! canOffsetPath( layer ) || ! d ) {
		return false;
	}
	const { offsetShape } = await import(
		/* webpackChunkName: "polybool" */ '../../lib/shape-boolean'
	);
	const rec = offsetShape( layer, d );
	if ( ! rec ) {
		return false;
	}
	const copy = {
		...layer,
		...BAKED,
		...rec,
		id: uid(),
		name: sprintf(
			/* translators: %s: layer name. */
			__( '%s offset', 'wunderpaint' ),
			layer.name || __( 'Shape', 'wunderpaint' )
		),
		pathD: rec.pathD,
	};
	dispatch( {
		type: 'ADD_LAYER',
		layer: copy,
		index: state.layers.findIndex( ( l ) => l.id === id ) + 1,
	} );
	commit( __( 'Offset Path', 'wunderpaint' ) );
	return true;
}

/**
 * Ask for the distance, then offset.
 *
 * @param {Object} editor Editor context.
 * @param {string} id     Shape layer id.
 */
export async function offsetPathPrompt( editor, id ) {
	const value = await promptDialog( {
		title: __( 'Offset Path', 'wunderpaint' ),
		label: __( 'Distance in px (negative shrinks)', 'wunderpaint' ),
		type: 'number',
		defaultValue: '10',
	} );
	if ( null === value || undefined === value ) {
		return;
	}
	const d = parseFloat( value );
	if ( ! Number.isFinite( d ) || ! d ) {
		return;
	}
	await offsetPathOp( editor, id, d );
}

/** True when the layer is a shape with a visible stroke. */
export const canOutlineStroke = ( layer ) =>
	!! layer &&
	'shape' === layer.type &&
	'line' !== layer.shape &&
	! layer.quad &&
	!! layer.stroke &&
	'transparent' !== layer.stroke &&
	( Number( layer.strokeW ) || 0 ) > 0;

/**
 * Turn the stroke into a filled path. A filled shape keeps its fill and
 * gets the outline as a new layer above it; a shape without a fill is
 * replaced by its outline.
 *
 * @param {Object} editor Editor context.
 * @param {string} id     Shape layer id.
 * @return {Promise<boolean>} Whether anything changed.
 */
export async function outlineStrokeOp( editor, id ) {
	const { state, dispatch, commit } = editor;
	const layer = state.layers.find( ( l ) => l.id === id );
	if ( ! canOutlineStroke( layer ) ) {
		return false;
	}
	const { strokeOutline } = await import(
		/* webpackChunkName: "polybool" */ '../../lib/shape-boolean'
	);
	const rec = strokeOutline( layer );
	if ( ! rec ) {
		return false;
	}
	const hasFill = !! layer.fill && 'transparent' !== layer.fill;
	if ( ! hasFill ) {
		dispatch( {
			type: 'UPDATE_LAYER',
			id,
			patch: {
				...BAKED,
				...rec,
				fill: layer.stroke,
				fillType: 'solid',
				stroke: null,
				strokeW: 0,
				strokeAlign: null,
				strokeDash: null,
			},
		} );
		commit( __( 'Outline Stroke', 'wunderpaint' ) );
		return true;
	}
	const outline = makeShape( {
		name: sprintf(
			/* translators: %s: layer name. */
			__( '%s outline', 'wunderpaint' ),
			layer.name || __( 'Shape', 'wunderpaint' )
		),
		x: rec.x,
		y: rec.y,
		w: rec.w,
		h: rec.h,
		shape: 'rect',
		pathD: rec.pathD,
		fill: layer.stroke,
		stroke: null,
		strokeW: 0,
	} );
	outline.parent = layer.parent || null;
	outline.opacity = layer.opacity ?? 1;
	dispatch( {
		type: 'UPDATE_LAYER',
		id,
		patch: {
			stroke: null,
			strokeW: 0,
			strokeAlign: null,
			strokeDash: null,
		},
	} );
	dispatch( {
		type: 'ADD_LAYER',
		layer: outline,
		index: state.layers.findIndex( ( l ) => l.id === id ) + 1,
	} );
	commit( __( 'Outline Stroke', 'wunderpaint' ) );
	return true;
}
