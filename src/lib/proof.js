/**
 * Color-vision-deficiency proofing (v1.1): display-only feColorMatrix
 * simulations (Machado et al. approximations, severity 1.0). Applied as a
 * CSS filter on the canvas stage, exports are never affected.
 */

import { __ } from '@wordpress/i18n';

export const PROOF_MATRICES = {
	protanopia: [
		0.152286, 1.052583, -0.204868, 0, 0, 0.114503, 0.786281, 0.099216, 0, 0,
		-0.003882, -0.048116, 1.051998, 0, 0, 0, 0, 0, 1, 0,
	],
	deuteranopia: [
		0.367322, 0.860646, -0.227968, 0, 0, 0.280085, 0.672501, 0.047413, 0, 0,
		-0.01182, 0.04294, 0.968881, 0, 0, 0, 0, 0, 1, 0,
	],
	tritanopia: [
		1.255528, -0.076749, -0.178779, 0, 0, -0.078411, 0.930809, 0.147602, 0,
		0, 0.004733, 0.691367, 0.3039, 0, 0, 0, 0, 0, 1, 0,
	],
};

export const PROOF_MODES = [
	{ id: 'protanopia', label: __( 'Protanopia (no red)', 'wunderpaint' ) },
	{
		id: 'deuteranopia',
		label: __( 'Deuteranopia (no green)', 'wunderpaint' ),
	},
	{
		id: 'tritanopia',
		label: __( 'Tritanopia (no blue)', 'wunderpaint' ),
	},
	{ id: 'grayscale', label: __( 'Grayscale', 'wunderpaint' ) },
];

/**
 * CSS filter value for a proof mode ('' = none).
 *
 * @param {string} mode Mode id.
 * @return {string} CSS filter.
 */
export function proofCssFilter( mode ) {
	if ( 'grayscale' === mode ) {
		return 'grayscale(1)';
	}
	return PROOF_MATRICES[ mode ] ? `url(#wpie-proof-${ mode })` : '';
}
