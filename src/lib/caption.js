/**
 * Local image captioning (v1.138.0): describe an image entirely in the
 * browser with Florence-2 (self-hosted model, no API key), then translate
 * the English caption into the site language with a small local Opus-MT
 * model when one is installed. Used by the Alt Text assistant as the
 * keyless option. (Replaced ViT-GPT2 after an A/B on real library images:
 * 8x faster, far better captions.)
 */

import {
	loadTransformers,
	mlPipeline,
	isModelInstalled,
	loadWithFallback,
} from './ml';
import { logEvent } from './debug-log';

const MODEL = 'onnx-community/Florence-2-base-ft';
const TASK = '<CAPTION>';

let session = null;
let translator = null;

async function ensureSession() {
	if ( ! session ) {
		session = ( async () => {
			const TF = await loadTransformers();
			const [ model, processor, tokenizer ] = await Promise.all( [
				loadWithFallback( 'caption', ( device ) =>
					TF.Florence2ForConditionalGeneration.from_pretrained(
						MODEL,
						{ dtype: 'q8', device }
					)
				),
				TF.AutoProcessor.from_pretrained( MODEL ),
				TF.AutoTokenizer.from_pretrained( MODEL ),
			] );
			return { TF, model, processor, tokenizer };
		} )();
	}
	return session;
}

/**
 * Tidy a model caption into alt-text shape: collapsed whitespace, leading
 * capital, one trailing period.
 *
 * @param {string} text Raw model output.
 * @return {string} Polished sentence (may be empty).
 */
export function polishCaption( text ) {
	let out = String( text || '' )
		.replace( /<[^>]*>/g, ' ' )
		.replace( /\s+/g, ' ' )
		.trim();
	if ( ! out ) {
		return '';
	}
	out = out.charAt( 0 ).toUpperCase() + out.slice( 1 );
	if ( ! /[.!?]$/.test( out ) ) {
		out += '.';
	}
	return out;
}

/**
 * Translate an English caption into the site language when a local
 * translation model is installed; otherwise return the text unchanged.
 *
 * @param {string} text English caption.
 * @return {Promise<string>} Localized (or original) caption.
 */
export async function localizeCaption( text ) {
	const repo = window.WPIE?.captionTranslateRepo;
	if ( ! text || ! repo || ! isModelInstalled( 'caption-translate' ) ) {
		return text;
	}
	try {
		if ( ! translator ) {
			translator = await mlPipeline( 'translation', repo );
		}
		const out = await translator( text );
		return polishCaption( out?.[ 0 ]?.translation_text ) || text;
	} catch ( e ) {
		logEvent( 'warn', 'ml', 'caption translation failed', e?.message );
		return text; // English beats nothing.
	}
}

/**
 * Generate a short caption for an image, in the site language when the
 * translation model is installed (English otherwise).
 *
 * @param {string} dataUrl Image data URL.
 * @return {Promise<string>} The caption (may be empty on failure).
 */
export async function captionImage( dataUrl ) {
	const { TF, model, processor, tokenizer } = await ensureSession();
	const image = await TF.RawImage.fromURL( dataUrl );
	const textInputs = tokenizer( processor.construct_prompts( TASK ) );
	const visionInputs = await processor( image );
	const ids = await model.generate( {
		...textInputs,
		...visionInputs,
		max_new_tokens: 64,
	} );
	const raw = tokenizer.batch_decode( ids, {
		skip_special_tokens: false,
	} )[ 0 ];
	const out = processor.post_process_generation( raw, TASK, image.size );
	return localizeCaption( polishCaption( out?.[ TASK ] ) );
}

const GROUND_TASK = '<CAPTION_TO_PHRASE_GROUNDING>';

/**
 * Ground a phrase: bounding boxes for every match in the image (e.g.
 * 'human face' for the local Blur Faces tool). Shares the caption
 * model session, everything stays in the browser.
 *
 * @param {string} dataUrl Image data URL.
 * @param {string} phrase  What to locate.
 * @return {Promise<Array>} [{ x1, y1, x2, y2 }] in image pixels.
 */
export async function groundPhrase( dataUrl, phrase ) {
	const { TF, model, processor, tokenizer } = await ensureSession();
	const image = await TF.RawImage.fromURL( dataUrl );
	const textInputs = tokenizer(
		processor.construct_prompts( GROUND_TASK + phrase )
	);
	const visionInputs = await processor( image );
	const ids = await model.generate( {
		...textInputs,
		...visionInputs,
		max_new_tokens: 128,
	} );
	const raw = tokenizer.batch_decode( ids, {
		skip_special_tokens: false,
	} )[ 0 ];
	const out = processor.post_process_generation(
		raw,
		GROUND_TASK,
		image.size
	);
	return ( out?.[ GROUND_TASK ]?.bboxes || [] ).map( ( b ) => ( {
		x1: b[ 0 ],
		y1: b[ 1 ],
		x2: b[ 2 ],
		y2: b[ 3 ],
	} ) );
}

/** Test hook. */
export const __resetCaptionCache = () => {
	session = null;
	translator = null;
};
