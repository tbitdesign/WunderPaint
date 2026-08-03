/**
 * Shared metadata-captioning helpers (v1.189.0): the field definitions,
 * languages, rough per-image costs and the two functions that turn an image
 * URL into a compact data URL and run one caption engine over it. Extracted
 * from the Alt Text Assistant so the Media Library Manager reuses exactly the
 * same behaviour instead of a second copy.
 */

import { __ } from '@wordpress/i18n';
import { loadImage } from '../store/document';
import { createCanvas } from './raster';
import { captionImage } from './caption';
import { ai } from './api';

/** Output languages offered for cloud captioning. */
export const LANGS = [
	'English',
	'German',
	'French',
	'Spanish',
	'Italian',
	'Dutch',
	'Portuguese',
	'Polish',
];

/** Very rough USD per image, for the cost estimate only. */
export const COST_PER_IMG = {
	anthropic: 0.0012,
	openai: 0.0004,
	gemini: 0.0001,
};

/** The four metadata fields; `title` is written by cloud engines only. */
export const FIELD_DEFS = [
	{ key: 'title', label: __( 'Title', 'wunderpaint' ), aiOnly: true },
	{ key: 'alt', label: __( 'Alt text', 'wunderpaint' ) },
	{ key: 'caption', label: __( 'Caption', 'wunderpaint' ) },
	{ key: 'description', label: __( 'Description', 'wunderpaint' ) },
];

/** Downscale an image URL to a compact JPEG data URL for captioning. */
export async function toDataUrl( url ) {
	const img = await loadImage( url );
	const max = 512;
	const scale = Math.min(
		1,
		max / Math.max( img.naturalWidth, img.naturalHeight )
	);
	const canvas = createCanvas(
		Math.max( 1, Math.round( img.naturalWidth * scale ) ),
		Math.max( 1, Math.round( img.naturalHeight * scale ) )
	);
	const ctx = canvas.getContext( '2d' );
	ctx.fillStyle = '#fff';
	ctx.fillRect( 0, 0, canvas.width, canvas.height );
	ctx.drawImage( img, 0, 0, canvas.width, canvas.height );
	return canvas.toDataURL( 'image/jpeg', 0.8 );
}

/**
 * Run the chosen engine on one image data URL, returning the four text fields
 * plus tags and mood. The local model only produces descriptive text (no
 * title, tags or mood); cloud providers return everything in one request.
 */
export async function captionOne( dataUrl, engine, lang ) {
	if ( 'local' === engine ) {
		const text = await captionImage( dataUrl );
		return {
			title: '',
			alt: text,
			caption: text,
			description: text,
			tags: [],
			mood: '',
		};
	}
	const res = await ai.caption( { image: dataUrl, provider: engine, lang } );
	return {
		title: res.title || '',
		alt: res.altText || res.caption || '',
		caption: res.caption || '',
		description: res.description || '',
		tags: Array.isArray( res.tags ) ? res.tags : [],
		mood: res.mood || '',
	};
}
