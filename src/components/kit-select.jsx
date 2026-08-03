/**
 * Brand-kit dropdown (v1.273.0): the kit chooser every studio drew by
 * hand. Controlled; renders nothing when the site has no kits (the mount
 * then leaves the node empty, hosts need no guard).
 */

import { __ } from '@wordpress/i18n';

import { brandKits } from '../lib/brand-kits';

export function KitSelect( { value, onChange, allowEmpty = false } ) {
	const kits = brandKits().filter( ( k ) => k?.name );
	if ( ! kits.length ) {
		return null;
	}
	return (
		<select
			className="dsm-select"
			value={ String( value ?? '' ) }
			onChange={ ( e ) => onChange( e.target.value ) }
		>
			{ allowEmpty && (
				<option value="">
					{ __( 'Site default', 'wunderpaint' ) }
				</option>
			) }
			{ kits.map( ( k ) => (
				<option key={ k.id } value={ String( k.id ) }>
					{ k.name }
				</option>
			) ) }
		</select>
	);
}
