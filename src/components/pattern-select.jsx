/**
 * Pattern select shared by shape options, shape properties and layer
 * styles (v1.1): built-in procedural tiles + the user's own pattern
 * library ("Manage…" opens the upload dialog).
 */

import { __ } from '@wordpress/i18n';

import { listPatterns } from '../lib/user-patterns';
import { registerUserTile } from '../lib/raster';

/** The same built-ins are shown as previews in the common Color panel. */
export const patternOptions = () => [
	[ 'dots', __( 'Dots', 'wunderpaint' ) ],
	[ 'stripes', __( 'Stripes', 'wunderpaint' ) ],
	[ 'checker', __( 'Checker', 'wunderpaint' ) ],
	[ 'grid', __( 'Grid', 'wunderpaint' ) ],
	[ 'diagonal', __( 'Diagonal', 'wunderpaint' ) ],
	[ 'crosshatch', __( 'Crosshatch', 'wunderpaint' ) ],
	[ 'zigzag', __( 'Zigzag', 'wunderpaint' ) ],
	[ 'waves', __( 'Waves', 'wunderpaint' ) ],
	[ 'bricks', __( 'Bricks', 'wunderpaint' ) ],
	[ 'plus', __( 'Plus', 'wunderpaint' ) ],
	[ 'triangles', __( 'Triangles', 'wunderpaint' ) ],
	[ 'scales', __( 'Scales', 'wunderpaint' ) ],
	[ 'pinstripe', __( 'Pinstripe', 'wunderpaint' ) ],
	[ 'horizontal-lines', __( 'Horizontal Lines', 'wunderpaint' ) ],
	[ 'vertical-lines', __( 'Vertical Lines', 'wunderpaint' ) ],
	[ 'double-stripe', __( 'Double Stripe', 'wunderpaint' ) ],
	[ 'dashed-lines', __( 'Dashed Lines', 'wunderpaint' ) ],
	[ 'herringbone', __( 'Herringbone', 'wunderpaint' ) ],
	[ 'chevron-wide', __( 'Wide Chevron', 'wunderpaint' ) ],
	[ 'basket-weave', __( 'Basket Weave', 'wunderpaint' ) ],
	[ 'dot-grid', __( 'Dot Grid', 'wunderpaint' ) ],
	[ 'offset-dots', __( 'Offset Dots', 'wunderpaint' ) ],
	[ 'micro-dots', __( 'Micro Dots', 'wunderpaint' ) ],
	[ 'dot-rings', __( 'Dot Rings', 'wunderpaint' ) ],
	[ 'square-dots', __( 'Square Dots', 'wunderpaint' ) ],
	[ 'diamond-grid', __( 'Diamond Grid', 'wunderpaint' ) ],
	[ 'hollow-diamonds', __( 'Hollow Diamonds', 'wunderpaint' ) ],
	[ 'honeycomb', __( 'Honeycomb', 'wunderpaint' ) ],
	[ 'triangle-grid', __( 'Triangle Grid', 'wunderpaint' ) ],
	[ 'tessellated-triangles', __( 'Triangle Mosaic', 'wunderpaint' ) ],
	[ 'isometric', __( 'Isometric Grid', 'wunderpaint' ) ],
	[ 'octagons', __( 'Octagons', 'wunderpaint' ) ],
	[ 'arches', __( 'Arches', 'wunderpaint' ) ],
	[ 'scallops', __( 'Scallops', 'wunderpaint' ) ],
	[ 'fan-waves', __( 'Fan Waves', 'wunderpaint' ) ],
	[ 'concentric-rings', __( 'Concentric Rings', 'wunderpaint' ) ],
	[ 'ripples', __( 'Ripples', 'wunderpaint' ) ],
	[ 'petals', __( 'Petals', 'wunderpaint' ) ],
	[ 'daisies', __( 'Daisies', 'wunderpaint' ) ],
	[ 'clover', __( 'Clover', 'wunderpaint' ) ],
	[ 'seed-pods', __( 'Seed Pods', 'wunderpaint' ) ],
	[ 'leaves', __( 'Leaves', 'wunderpaint' ) ],
	[ 'woven-check', __( 'Woven Check', 'wunderpaint' ) ],
	[ 'plaid', __( 'Plaid', 'wunderpaint' ) ],
	[ 'terrazzo', __( 'Terrazzo', 'wunderpaint' ) ],
	[ 'confetti', __( 'Confetti', 'wunderpaint' ) ],
	[ 'sprinkles', __( 'Sprinkles', 'wunderpaint' ) ],
	[ 'stipple', __( 'Stipple', 'wunderpaint' ) ],
];

export function PatternSelect( {
	value,
	patternData,
	onChange,
	extras,
	style,
} ) {
	const patterns = listPatterns();
	const selected =
		'custom' === value
			? 'custom:' +
			  ( patterns.find( ( p ) => p.dataUrl === patternData )?.name ||
					'' )
			: value || 'none';

	return (
		<select
			value={ selected }
			style={ style }
			onChange={ async ( e ) => {
				const v = e.target.value;
				if ( '__manage' === v ) {
					extras?.openPatterns?.();
					return;
				}
				if ( v.startsWith( 'custom:' ) ) {
					const pattern = patterns.find(
						( p ) => p.name === v.slice( 7 )
					);
					if ( pattern ) {
						await registerUserTile( pattern.dataUrl );
						onChange( 'custom', pattern.dataUrl );
					}
					return;
				}
				onChange( v, null );
			} }
		>
			<option value="none">{ __( 'Solid', 'wunderpaint' ) }</option>
			{ patternOptions().map( ( [ kind, label ] ) => (
				<option key={ kind } value={ kind }>
					{ label }
				</option>
			) ) }
			{ patterns.map( ( p ) => (
				<option key={ p.name } value={ `custom:${ p.name }` }>
					{ p.name }
				</option>
			) ) }
			<option value="__manage">
				{ __( 'Manage patterns…', 'wunderpaint' ) }
			</option>
		</select>
	);
}
