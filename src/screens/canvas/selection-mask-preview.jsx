import { useEffect, useRef } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { selectionToMaskCanvas } from '../../store/selection';

/** View-only coverage: white selected, black excluded, gray feathered. */
export function SelectionMaskPreview( { selection, doc, zoom, pan } ) {
	const ref = useRef( null );
	useEffect( () => {
		const canvas = ref.current;
		if ( ! canvas ) {
			return;
		}
		// Bound preview work for large documents; use the same alpha-mask
		// rasterizer as Fill and layer masks, with its scaled feather radius.
		const scale = Math.min( 1, 2048 / Math.max( doc.w, doc.h ) );
		const mask = selectionToMaskCanvas( selection, doc.w, doc.h, {
			scale,
		} );
		canvas.width = mask.width;
		canvas.height = mask.height;
		const ctx = canvas.getContext( '2d' );
		ctx.drawImage( mask, 0, 0 );
		ctx.globalCompositeOperation = 'source-in';
		ctx.fillStyle = '#ffffff';
		ctx.fillRect( 0, 0, canvas.width, canvas.height );
		ctx.globalCompositeOperation = 'destination-over';
		ctx.fillStyle = '#000000';
		ctx.fillRect( 0, 0, canvas.width, canvas.height );
		ctx.globalCompositeOperation = 'source-over';
	}, [ selection, doc.w, doc.h ] );
	return (
		<canvas
			ref={ ref }
			className="selection-mask-preview"
			role="img"
			aria-label={ __( 'Selection mask preview', 'wunderpaint' ) }
			style={ {
				position: 'absolute',
				left: pan.x,
				top: pan.y,
				width: doc.w * zoom,
				height: doc.h * zoom,
				pointerEvents: 'none',
			} }
		/>
	);
}
