/**
 * Fluid Text ops (v1.429): the switch behind the context-bar button and
 * the properties-panel checkbox. On: the box takes over (a layout lockup
 * is removed first, its lines must not survive as hard breaks). Off: the
 * current look is baked into spans so nothing jumps.
 */

import { __ } from '@wordpress/i18n';

import { ensureFont } from './font-manager';
import { bakeTextFit } from './text-fit';
import { sourceTextOf } from './text-layouts';
import { cleanTextLook } from './text-look';

/** Whether the switch applies to this layer at all. */
export const canFluidText = ( layer ) =>
	!! layer &&
	'text' === layer.type &&
	! layer.textPath &&
	! layer.shapeBox &&
	! layer.curve;

/**
 * Toggle Fluid Text on the active layer, one history step.
 *
 * @param {Object} editor Editor context { state, dispatch, commit }.
 * @return {boolean} True when toggled.
 */
export function toggleFluidTextOp( editor ) {
	const { state, dispatch, commit } = editor;
	const layer = state.layers.find( ( l ) => l.id === state.activeId );
	if ( ! canFluidText( layer ) ) {
		return false;
	}
	let patch;
	if ( layer.textFit ) {
		patch = bakeTextFit( layer );
	} else {
		patch = { textFit: 'fluid' };
		if ( layer.textLayout ) {
			patch.text = sourceTextOf( layer );
			patch.spans = null;
			patch.lineStyles = null;
			patch.textLayout = null;
		}
	}
	dispatch( { type: 'UPDATE_LAYER', id: layer.id, patch } );
	commit( __( 'Fluid Text', 'wunderpaint' ) );
	return true;
}

/* ------------------------------ looks -------------------------------- */

/** Whether a look can go on this layer: fluid-capable text with a word. */
export const canTextLook = ( layer ) =>
	canFluidText( layer ) && /\S/.test( layer.text || '' );

/**
 * Put a look on the active layer (v1.430): its fonts are loaded first,
 * Fluid Text goes on, a legacy baked layout gives its source text back,
 * and the lines centre. One history step.
 *
 * @param {Object} editor  Editor context { state, dispatch, commit }.
 * @param {Object} rawLook Look (classic, generated or from the cloud).
 * @return {Promise<boolean>} True when applied.
 */
export async function applyTextLookOp( editor, rawLook ) {
	const { state, dispatch, commit } = editor;
	const layer = state.layers.find( ( l ) => l.id === state.activeId );
	const look = cleanTextLook( rawLook );
	if ( ! canTextLook( layer ) || ! look ) {
		return false;
	}
	const faces = Object.values( look.roles ).map( ( r ) => [
		r.family,
		r.weight,
	] );
	if ( look.emph?.style?.family ) {
		faces.push( [ look.emph.style.family, look.emph.style.weight || 400 ] );
	}
	await Promise.all(
		faces.map( ( [ family, weight ] ) =>
			Promise.resolve()
				.then( () => ensureFont( family, weight ) )
				.catch( () => {} )
		)
	);
	const patch = { textFit: 'fluid', textLook: look, align: 'center' };
	if ( layer.textLayout ) {
		patch.text = sourceTextOf( layer );
		patch.spans = null;
		patch.lineStyles = null;
		patch.textLayout = null;
	}
	dispatch( { type: 'UPDATE_LAYER', id: layer.id, patch } );
	commit( __( 'Text layout', 'wunderpaint' ) );
	return true;
}

/**
 * Take the look off the active layer; Fluid Text stays on.
 *
 * @param {Object} editor Editor context.
 * @return {boolean} True when removed.
 */
export function clearTextLookOp( editor ) {
	const { state, dispatch, commit } = editor;
	const layer = state.layers.find( ( l ) => l.id === state.activeId );
	if ( ! layer || 'text' !== layer.type || ! layer.textLook ) {
		return false;
	}
	dispatch( {
		type: 'UPDATE_LAYER',
		id: layer.id,
		patch: { textLook: null },
	} );
	commit( __( 'Text layout', 'wunderpaint' ) );
	return true;
}
