import { useEffect, useRef } from '@wordpress/element';
import { drawCloneDab } from '../../lib/clone-source';

/** Paint only the small cursor canvas; pointer moves never render the editor. */
export function StampPreview( { areaRef, editorRef, altDown } ) {
	const canvasRef = useRef( null );
	const pointerRef = useRef( null );
	const opts = editorRef.current.state.toolOpts.stamp;
	const { zoom, pan } = editorRef.current.state;
	useEffect( () => {
		const area = areaRef.current;
		const canvas = canvasRef.current;
		if ( ! area || ! canvas ) {
			return;
		}
		const draw = ( e ) => {
			pointerRef.current = e;
			const state = editorRef.current.state;
			const settings = state.toolOpts.stamp;
			canvas.style.display = 'none';
			if (
				! settings.source ||
				! settings.preview ||
				settings.pickingSource ||
				altDown ||
				e.buttons ||
				e.target.closest?.( '.ed-float-panel' )
			) {
				return;
			}
			const rect = area.getBoundingClientRect();
			const at =
				settings.aligned && settings.offset
					? {
							x:
								( e.clientX - rect.left - state.pan.x ) /
									state.zoom +
								settings.offset.dx,
							y:
								( e.clientY - rect.top - state.pan.y ) /
									state.zoom +
								settings.offset.dy,
					  }
					: settings.source;
			drawCloneDab(
				canvas,
				settings.source,
				at,
				settings.size,
				settings.hardness
			);
			canvas.style.opacity = String( ( 0.65 * settings.opacity ) / 100 );
			canvas.style.display = 'block';
		};
		area.addEventListener( 'pointermove', draw );
		area.addEventListener( 'pointerdown', draw );
		area.addEventListener( 'pointerup', draw );
		if ( pointerRef.current ) {
			draw( pointerRef.current );
		}
		return () => {
			area.removeEventListener( 'pointermove', draw );
			area.removeEventListener( 'pointerdown', draw );
			area.removeEventListener( 'pointerup', draw );
		};
	}, [ areaRef, editorRef, opts, zoom, pan, altDown ] );
	return (
		<canvas
			ref={ canvasRef }
			className="csp-cursor-preview"
			aria-hidden="true"
		/>
	);
}
