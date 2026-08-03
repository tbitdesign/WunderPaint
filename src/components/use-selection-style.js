/**
 * Mirror of the text style at the caret/selection of the active rich-text
 * edit session (v1.46). Toolbars use this so their font/size/colour controls
 * live-reflect the marked characters; null when no session is open.
 */

import { useState, useEffect } from '@wordpress/element';

export function useSelectionStyle( extras ) {
	const [ sty, setSty ] = useState( null );

	useEffect( () => {
		let raf = 0;
		const read = () => {
			raf = 0;
			const rt = extras?.richText?.current;
			const next = rt?.peekStyle ? rt.peekStyle() : null;
			setSty( ( prev ) =>
				JSON.stringify( prev ) === JSON.stringify( next ) ? prev : next
			);
		};
		const queue = () => {
			if ( ! raf ) {
				raf = requestAnimationFrame( read );
			}
		};
		document.addEventListener( 'selectionchange', queue );
		document.addEventListener( 'wpie-richtext-session', queue );
		queue();
		return () => {
			document.removeEventListener( 'selectionchange', queue );
			document.removeEventListener( 'wpie-richtext-session', queue );
			if ( raf ) {
				cancelAnimationFrame( raf );
			}
		};
	}, [ extras ] );

	return sty;
}
