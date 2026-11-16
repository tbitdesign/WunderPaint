import { __, sprintf } from '@wordpress/i18n';
import { request } from './api';
import { promptDialog } from './dialogs';
import { parseColor, rgbToHex } from './color';

/** Uses the existing shared /palettes store and its twelve-color contract. */
export async function saveColorPalette( colors, extras ) {
	if ( window.WPIE?.standalone || ! colors.length ) {
		return null;
	}
	const values = [
		...new Set(
			colors.map( ( color ) => {
				const { r, g, b } = parseColor( color );
				return rgbToHex( r, g, b );
			} )
		),
	];
	if ( values.length > 12 ) {
		return null;
	}
	const name = await promptDialog( {
		title: __( 'Save palette', 'wunderpaint' ),
		label: __( 'Palette name', 'wunderpaint' ),
		defaultValue: sprintf(
			/* translators: %d: palette number. */
			__( 'Palette %d', 'wunderpaint' ),
			( window.WPIE?.palettes || [] ).length + 1
		),
		confirmLabel: __( 'Save', 'wunderpaint' ),
	} );
	if ( ! name?.trim() ) {
		return null;
	}
	try {
		// A new set, even for an existing name. Never silently overwrite another palette.
		const id =
			'color' +
			Date.now().toString( 36 ) +
			Math.random().toString( 36 ).slice( 2, 8 );
		const entry = { id, name: name.trim(), colors: values };
		const saved = await request( {
			path: '/palettes',
			method: 'POST',
			data: [ ...( window.WPIE?.palettes || [] ), entry ],
		} );
		if (
			! Array.isArray( saved ) ||
			! saved.some( ( item ) => item.id === id )
		) {
			throw new Error(
				__( 'The swatch set could not be saved.', 'wunderpaint' )
			);
		}
		window.WPIE.palettes = saved;
		window.dispatchEvent( new CustomEvent( 'wpie:palettes-updated' ) );
		extras?.toasts?.success?.(
			__(
				'Swatch set saved. It now shows up in every color picker.',
				'wunderpaint'
			)
		);
		return entry;
	} catch ( error ) {
		extras?.toasts?.error?.(
			error?.message ||
				__( 'The swatch set could not be saved.', 'wunderpaint' )
		);
		return null;
	}
}
