/**
 * Select > Modify (v1.429): expand, contract, smooth and border for any
 * selection. The selection is rasterised to a mask, reshaped there and
 * comes back as a mask selection with tight bounds.
 */

import { __ } from '@wordpress/i18n';

import { promptDialog } from '../../lib/dialogs';
import {
	borderMaskCanvas,
	maskBounds,
	morphMaskCanvas,
	smoothMaskCanvas,
} from '../../lib/mask-morph';
import { selectionToMaskCanvas } from '../selection';

export const MODIFY_KINDS = {
	expand: {
		label: () => __( 'Expand…', 'wunderpaint' ),
		title: () => __( 'Expand Selection', 'wunderpaint' ),
		prompt: () => __( 'Expand by (px)', 'wunderpaint' ),
		def: 8,
	},
	contract: {
		label: () => __( 'Contract…', 'wunderpaint' ),
		title: () => __( 'Contract Selection', 'wunderpaint' ),
		prompt: () => __( 'Contract by (px)', 'wunderpaint' ),
		def: 8,
	},
	smooth: {
		label: () => __( 'Smooth…', 'wunderpaint' ),
		title: () => __( 'Smooth Selection', 'wunderpaint' ),
		prompt: () => __( 'Sample radius (px)', 'wunderpaint' ),
		def: 6,
	},
	border: {
		label: () => __( 'Border…', 'wunderpaint' ),
		title: () => __( 'Border Selection', 'wunderpaint' ),
		prompt: () => __( 'Width (px)', 'wunderpaint' ),
		def: 10,
	},
};

/**
 * Reshape the selection.
 *
 * @param {Object} editor Editor context.
 * @param {string} kind   expand | contract | smooth | border.
 * @param {number} px     Pixels.
 * @return {boolean} Whether the selection changed.
 */
export function modifySelection( editor, kind, px ) {
	const { state, dispatch, commit } = editor;
	const spec = MODIFY_KINDS[ kind ];
	const amount = Math.round( Number( px ) || 0 );
	if ( ! spec || ! state.selection || amount <= 0 ) {
		return false;
	}
	const { doc } = state;
	const base = selectionToMaskCanvas( state.selection, doc.w, doc.h, {
		feather: 0,
	} );
	let canvas;
	if ( 'expand' === kind ) {
		canvas = morphMaskCanvas( base, amount );
	} else if ( 'contract' === kind ) {
		canvas = morphMaskCanvas( base, -amount );
	} else if ( 'smooth' === kind ) {
		canvas = smoothMaskCanvas( base, amount );
	} else {
		canvas = borderMaskCanvas( base, amount );
	}
	const bounds = maskBounds( canvas );
	if ( ! bounds ) {
		dispatch( { type: 'SET_SELECTION', selection: null } );
		commit( spec.title() );
		return true;
	}
	dispatch( {
		type: 'SET_SELECTION',
		selection: {
			kind: 'mask',
			canvas,
			bounds,
			feather: state.selection.feather || 0,
		},
	} );
	commit( spec.title() );
	return true;
}

/**
 * Ask for the pixels, then reshape.
 *
 * @param {Object} editor Editor context.
 * @param {string} kind   expand | contract | smooth | border.
 */
export async function modifySelectionPrompt( editor, kind ) {
	const spec = MODIFY_KINDS[ kind ];
	if ( ! spec || ! editor.state.selection ) {
		return;
	}
	const value = await promptDialog( {
		title: spec.title(),
		label: spec.prompt(),
		type: 'number',
		defaultValue: String( spec.def ),
	} );
	if ( null === value || undefined === value ) {
		return;
	}
	modifySelection( editor, kind, parseFloat( value ) );
}
