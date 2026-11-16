/**
 * What the panels offer beyond the menus, for the title-bar search (v1.434,
 * Thomas 27.09.2026: "dem fehlen aber noch alle effekte"): the layer styles
 * of the Blending Options, the text effects and the text styles. Each hit
 * runs through the same call its panel uses and then shows that panel, so
 * the settings are right there. The lists are the panels' own catalogues;
 * nothing is kept here.
 */
import { __ } from '@wordpress/i18n';

import { activeLayerOf } from '../store/editor-context';
import { setKeyHidden } from '../lib/workspace';
import { TEXT_FX_CATALOG } from '../lib/text-fx-defs';
import { TEXT_STYLES } from '../lib/text-styles';
import { activateTextEffect } from '../lib/text-effects-collection';
import {
	STYLE_DEFAULTS,
	STYLE_LABELS,
	layerStylePatch,
} from './panels/properties-panel';

/**
 * Search entries for the layer styles, text effects and text styles.
 *
 * @param {Object} editor Editor handle (state, dispatch, commit).
 * @return {Array} Entries for buildSearchIndex( { items } ).
 */
export function panelSearchItems( editor ) {
	const { state, dispatch, commit } = editor;
	const layer = activeLayerOf( state );
	const isText = 'text' === layer?.type;
	const reveal = ( tab ) => {
		setKeyHidden( 'panel.' + tab, false );
		dispatch( { type: 'SET_RIGHT_TAB', tab } );
	};
	const needLayer = __(
		'Select a layer to apply filters and effects.',
		'wunderpaint'
	);
	const needText = __( 'Select a text layer first.', 'wunderpaint' );
	return [
		...Object.keys( STYLE_DEFAULTS ).map( ( kind ) => ( {
			group: 'filters',
			label: STYLE_LABELS[ kind ],
			hint: __( 'Blending Options', 'wunderpaint' ),
			when: () => !! layer,
			reason: needLayer,
			run: () => {
				if ( ! layer.styles?.[ kind ] ) {
					dispatch( {
						type: 'UPDATE_LAYER',
						id: layer.id,
						patch: layerStylePatch( layer, kind, {
							...STYLE_DEFAULTS[ kind ],
						} ),
					} );
					commit(
						__( 'Add style:', 'wunderpaint' ) +
							' ' +
							STYLE_LABELS[ kind ]
					);
				}
				reveal( 'props' );
			},
		} ) ),
		...TEXT_FX_CATALOG.map( ( item ) => ( {
			group: 'filters',
			label: item.label,
			hint: __( 'Text Effects', 'wunderpaint' ),
			when: () => isText,
			reason: needText,
			run: () => {
				const fx = layer.textFX || {};
				if ( ! fx[ item.id ] ) {
					dispatch( {
						type: 'UPDATE_LAYER',
						id: layer.id,
						patch: { textFX: activateTextEffect( fx, item ) },
					} );
					commit( __( 'Text effect', 'wunderpaint' ) );
				}
				reveal( 'effects' );
				// The panel opens the effect's settings on this event once it
				// is on screen.
				window.setTimeout( () =>
					window.dispatchEvent(
						new CustomEvent( 'wpie-fx-settings', {
							detail: { id: item.id },
						} )
					)
				);
			},
		} ) ),
		...TEXT_STYLES.map( ( item ) => ( {
			group: 'filters',
			label: item.label,
			hint: __( 'Text Styles', 'wunderpaint' ),
			when: () => isText,
			reason: needText,
			run: () => {
				dispatch( {
					type: 'UPDATE_LAYER',
					id: layer.id,
					patch: item.patch,
				} );
				commit( __( 'Text style', 'wunderpaint' ) );
				reveal( 'effects' );
			},
		} ) ),
	];
}
