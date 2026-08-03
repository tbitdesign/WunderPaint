/**
 * Smart Select (v1.27): SlimSAM segmentation. Encode an image once, then each
 * click returns a mask, the interactive "magic" click-to-select. Runs fully
 * in the browser on the self-hosted model (see ml.js / class-ml-models.php).
 */

import { loadTransformers, deviceForModel } from './ml';

const MODEL = 'Xenova/slimsam-77-uniform';

let model = null;
let processor = null;

async function ensureModel() {
	const TF = await loadTransformers();
	if ( ! model ) {
		// Device comes from the central blocklist in ml.js: 'smart-select'
		// is pinned to WASM there because SAM returns garbage masks on the
		// WebGPU execution provider (re-verified on an RTX 4090, Chrome).
		model = await TF.SamModel.from_pretrained( MODEL, {
			dtype: 'q8',
			device: deviceForModel( 'smart-select' ),
		} );
		processor = await TF.AutoProcessor.from_pretrained( MODEL );
	}
	return TF;
}

/**
 * Encode an image and return a segmenter bound to it.
 *
 * @param {string} dataUrl Image data URL (the layer's pixels).
 * @return {Promise<Object>} { width, height, segment(points) }.
 */
export async function createSegmenter( dataUrl ) {
	const TF = await ensureModel();
	const image = await TF.RawImage.read( dataUrl );
	const inputs = await processor( image );
	const embeddings = await model.get_image_embeddings( inputs );

	return {
		width: image.width,
		height: image.height,

		/**
		 * Segment from one or more points.
		 *
		 * @param {Array} points [{ x, y, label }] as 0..1 fractions; label 1 =
		 *                       include (default), 0 = exclude (negative).
		 * @return {Promise<{data:Uint8Array,w:number,h:number,score:number}>}
		 *         A binary mask at the original image resolution.
		 */
		async segment( points ) {
			const reshaped = inputs.reshaped_input_sizes[ 0 ]; // [h, w]
			const coords = points.flatMap( ( p ) => [
				p.x * reshaped[ 1 ],
				p.y * reshaped[ 0 ],
			] );
			const labels = points.map( ( p ) => ( 0 === p.label ? 0n : 1n ) );
			const inputPoints = new TF.Tensor( 'float32', coords, [
				1,
				1,
				points.length,
				2,
			] );
			const inputLabels = new TF.Tensor( 'int64', labels, [
				1,
				1,
				points.length,
			] );

			const out = await model( {
				...embeddings,
				input_points: inputPoints,
				input_labels: inputLabels,
			} );
			const masks = await processor.post_process_masks(
				out.pred_masks,
				inputs.original_sizes,
				inputs.reshaped_input_sizes
			);

			const scores = out.iou_scores.data;
			let best = 0;
			for ( let i = 1; i < scores.length; i++ ) {
				if ( scores[ i ] > scores[ best ] ) {
					best = i;
				}
			}

			const m = masks[ 0 ];
			const dims = m.dims;
			const h = dims[ dims.length - 2 ];
			const w = dims[ dims.length - 1 ];
			const off = best * h * w;
			const data = new Uint8Array( w * h );
			for ( let i = 0; i < w * h; i++ ) {
				data[ i ] = m.data[ off + i ] ? 1 : 0;
			}
			return { data, w, h, score: scores[ best ] };
		},
	};
}
