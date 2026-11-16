import { useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

/** Mirror the canvas draft, then hand editing over when this field receives focus. */
export function TextContentInput( { layer, extras, onChange } ) {
	const session = extras?.richText;
	const [ live, setLive ] = useState( null );
	useEffect( () => {
		const read = () => {
			const rt = session?.current;
			setLive(
				rt?.layerId === layer.id && rt.getText
					? { id: layer.id, text: rt.getText() }
					: null
			);
		};
		const input = ( event ) => {
			if ( event.target.closest?.( '.text-edit' ) ) {
				read();
			}
		};
		document.addEventListener( 'input', input );
		document.addEventListener( 'wpie-richtext-session', read );
		read();
		return () => {
			document.removeEventListener( 'input', input );
			document.removeEventListener( 'wpie-richtext-session', read );
		};
	}, [ session, layer.id ] );
	return (
		<textarea
			aria-label={ __( 'Text', 'wunderpaint' ) }
			value={ live?.id === layer.id ? live.text : layer.text }
			rows={ 2 }
			style={ {
				width: '100%',
				padding: 4,
				border: '1px solid var(--ed-border-strong)',
				borderRadius: 3,
				background: 'var(--ed-panel-alt)',
				color: 'var(--ed-text)',
				fontSize: 12,
				fontFamily: 'var(--font-ui)',
				resize: 'vertical',
			} }
			onFocus={ () => {
				const rt = session?.current;
				if ( rt?.layerId === layer.id ) {
					rt.commit();
				}
			} }
			onChange={ ( event ) => onChange( event.target.value ) }
		/>
	);
}
