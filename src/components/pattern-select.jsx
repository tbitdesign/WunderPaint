/**
 * Pattern select shared by shape options, shape properties and layer
 * styles (v1.1): built-in procedural tiles + the user's own pattern
 * library ("Manage…" opens the upload dialog).
 */

import { __ } from '@wordpress/i18n';

import { listPatterns } from '../lib/user-patterns';
import { registerUserTile } from '../lib/raster';

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
			<option value="dots">{ __( 'Dots', 'wunderpaint' ) }</option>
			<option value="stripes">{ __( 'Stripes', 'wunderpaint' ) }</option>
			<option value="checker">{ __( 'Checker', 'wunderpaint' ) }</option>
			<option value="grid">{ __( 'Grid', 'wunderpaint' ) }</option>
			<option value="diagonal">
				{ __( 'Diagonal', 'wunderpaint' ) }
			</option>
			<option value="crosshatch">
				{ __( 'Crosshatch', 'wunderpaint' ) }
			</option>
			<option value="zigzag">{ __( 'Zigzag', 'wunderpaint' ) }</option>
			<option value="waves">{ __( 'Waves', 'wunderpaint' ) }</option>
			<option value="bricks">{ __( 'Bricks', 'wunderpaint' ) }</option>
			<option value="plus">{ __( 'Plus', 'wunderpaint' ) }</option>
			<option value="triangles">
				{ __( 'Triangles', 'wunderpaint' ) }
			</option>
			<option value="scales">{ __( 'Scales', 'wunderpaint' ) }</option>
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
