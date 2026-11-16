/** Stable inputs for thumbnails which intentionally replace the layer's grading. */
import { useRef } from '@wordpress/element';
import { samePreviewValues } from './catalog-preview-cache';

export function useCatalogSource( layer, state ) {
	const source = layer
		? {
				...layer,
				filter: null,
				filterAmount: 100,
				adjust: null,
				previewEffect: null,
				visible: true,
		  }
		: null;
	const previous = useRef();
	// Paint and destructive effects can mutate a canvas in place. Existing undo
	// snapshots already serialize those pixels and masks on commit. Reuse that
	// content signal rather than reading a full-size canvas for every slider move.
	const snapshot =
		layer?.canvas || layer?.mask?.canvas
			? state.history?.present?.layers?.find(
					( entry ) => entry.id === layer.id
			  )
			: null;
	// A snapshot still encoding holds frozen pixels: the same signal.
	const pixels = layer?.canvas
		? snapshot?.dataUrl ?? snapshot?.pixels ?? layer
		: null;
	const mask = layer?.mask?.canvas
		? snapshot?.mask?.data ?? snapshot?.mask?.pixels ?? layer.mask
		: null;
	if (
		! previous.current ||
		! samePreviewValues( previous.current.source, source ) ||
		previous.current.pixels !== pixels ||
		previous.current.mask !== mask
	) {
		previous.current = { source, pixels, mask };
	}
	return previous.current.source;
}
