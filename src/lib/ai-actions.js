/**
 * AI action orchestration (spec 11.2): every action returns editable
 * layers, nothing auto-saves. Remove-bg / upscale / enhance fall back to
 * the guaranteed LOCAL implementations when the proxy says so.
 */

import { __ } from '@wordpress/i18n';

import { ai } from './api';
import { resolveBindings } from './dynamic-content';
import {
	renderToCanvas,
	renderToDataURL,
	createCanvas,
	sharedImageCache,
} from './raster';
import { selectionToMaskCanvas, selectionBounds } from '../store/selection';
import { makeImage, makeText, loadImage } from '../store/document';
import {
	textBehindPlan,
	textBehindOrder,
	textBehindGroupPatch,
} from './text-behind';
import { activeLayerOf, withDescendants } from '../store/editor-context';
import { resizeCanvasDoc, cropDoc } from '../store/doc-ops';
import { nearestAspect } from './aspect';
import { posterizeFlat } from './posterize';

export { nearestAspect };
import {
	removeBackgroundLocal,
	blurBackgroundLocal,
	colorPopLocal,
	productShotLocal,
	neonRimLocal,
	speedBlurLocal,
	depthFogLocal,
	upscaleLocal,
	enhanceLocal,
	computeSubjectAlpha,
} from './local-image-ops';
import { activeKitColors } from './brand-kits';
import { currentLocale } from './editor-locale';

/** Rendered PNG data URL of one layer (its own bounds, transparent bg). */
// While previewing a template with a real post, the on-screen render resolves
// its {{token}} bindings (author name, product price, …). The AI actions that
// flatten the canvas as a reference must match, or the model sees raw
// `{{post.title}}` text instead of what you see. refLayers() resolves the same
// way when a preview is active, and is a no-op otherwise (v1.183.0).
function refLayers( state ) {
	return state.previewPost?.ctx
		? resolveBindings( state.layers, state.previewPost.ctx )
		: state.layers;
}

export async function layerDataUrl( state, layer, maxDim = 1536 ) {
	// Resolve this layer's bindings too, so editing/variations of a bound
	// layer in post-preview mode use the resolved values, not raw tokens.
	const src = state.previewPost?.ctx
		? resolveBindings( [ layer ], state.previewPost.ctx )[ 0 ] || layer
		: layer;
	const bounds = {
		x: layer.x,
		y: layer.y,
		w: Math.max( 1, layer.w ),
		h: Math.max( 1, layer.h ),
	};
	const scale = Math.min( 1, maxDim / bounds.w, maxDim / bounds.h );
	const canvas = await renderToCanvas(
		{ ...state.doc, bg: 'transparent' },
		[ { ...src, parent: null, opacity: 1, blend: 'normal', rot: 0 } ],
		{ viewport: bounds, scale, cache: sharedImageCache }
	);
	return canvas.toDataURL( 'image/png' );
}

/** Insert a result image as a new layer fitted to the doc (spec 06.5). */
async function insertResultLayer( editor, src, name, geometry = null ) {
	const { state, dispatch, commit } = editor;
	const img = await loadImage( src );
	let rect = geometry;
	if ( ! rect ) {
		const scale = Math.min(
			1,
			state.doc.w / img.naturalWidth,
			state.doc.h / img.naturalHeight
		);
		const w = Math.round( img.naturalWidth * scale );
		const h = Math.round( img.naturalHeight * scale );
		rect = {
			x: Math.round( ( state.doc.w - w ) / 2 ),
			y: Math.round( ( state.doc.h - h ) / 2 ),
			w,
			h,
		};
	}
	const layer = makeImage( {
		name,
		...rect,
		src,
		naturalW: img.naturalWidth,
		naturalH: img.naturalHeight,
	} );
	dispatch( { type: 'ADD_LAYER', layer } );
	dispatch( { type: 'SET_TOOL', tool: 'move' } );
	commit( name );
	return layer;
}

/** Replace the content of an image-ish layer, keeping geometry (11.2). */
export async function replaceLayerContent(
	editor,
	layer,
	src,
	label,
	{ updateNatural = true } = {}
) {
	const { dispatch, commit } = editor;
	const img = await loadImage( src );
	const patch = { src, canvas: null, dataUrl: null, type: 'image' };
	if ( updateNatural ) {
		patch.naturalW = img.naturalWidth;
		patch.naturalH = img.naturalHeight;
	}
	dispatch( { type: 'UPDATE_LAYER', id: layer.id, patch } );
	commit( label );
}

/**
 * Project a provider result onto a target size without distortion
 * (scale-to-cover + center-crop) and optionally keep ONLY the fill areas
 * of a white-on-black mask: the original layers below stay visible in
 * the kept areas, true out-/inpainting no matter how loosely the model
 * treated them (v1.5). Exported for tests.
 *
 * @param {*}      img      Decoded result image (Image/canvas).
 * @param {number} targetW  Target width.
 * @param {number} targetH  Target height.
 * @param {*}      fillMask White=fill/black=keep mask canvas (optional).
 * @param {number} feather  Seam overlap in px (browser only).
 * @return {*} Canvas of targetW×targetH.
 */
export function projectResult( img, targetW, targetH, fillMask, feather = 8 ) {
	const out = createCanvas( targetW, targetH );
	const ctx = out.getContext( '2d' );
	const iw = img.naturalWidth || img.width;
	const ih = img.naturalHeight || img.height;
	const cover = Math.max( targetW / iw, targetH / ih );
	const dw = iw * cover;
	const dh = ih * cover;
	ctx.drawImage( img, ( targetW - dw ) / 2, ( targetH - dh ) / 2, dw, dh );
	if ( ! fillMask ) {
		return out;
	}

	// White-luminance mask → alpha.
	const alphaMask = createCanvas( targetW, targetH );
	const actx = alphaMask.getContext( '2d' );
	actx.drawImage( fillMask, 0, 0, targetW, targetH );
	const d = actx.getImageData( 0, 0, targetW, targetH );
	for ( let i = 0; i < d.data.length; i += 4 ) {
		d.data[ i + 3 ] = d.data[ i ]; // alpha = red channel (white = fill)
	}
	actx.putImageData( d, 0, 0 );

	// Feather ONLY into the kept side (blurred + hard mask re-added):
	// the seam blends without ever thinning the fill at the canvas edge.
	let seam = alphaMask;
	if ( feather > 0 ) {
		try {
			const soft = createCanvas( targetW, targetH );
			const sctx = soft.getContext( '2d' );
			sctx.filter = `blur(${ feather }px)`;
			sctx.drawImage( alphaMask, 0, 0 );
			sctx.filter = 'none';
			sctx.globalCompositeOperation = 'lighter';
			sctx.drawImage( alphaMask, 0, 0 );
			seam = soft;
		} catch ( e ) {}
	}
	ctx.globalCompositeOperation = 'destination-in';
	ctx.drawImage( seam, 0, 0 );
	ctx.globalCompositeOperation = 'source-over';
	return out;
}

const IMAGE_TYPES = [ 'image', 'raster', 'smart' ];

// Exported for tests (group → image-child resolution).
export const requireActive = ( editor ) => {
	let layer = activeLayerOf( editor.state );
	// A selected group resolves to its single image-ish descendant
	// (v1.4.1): with group-as-unit selection the group often stays active
	// while the user clearly means "the image in it".
	if ( layer && 'group' === layer.type ) {
		const imageLeaves = Array.from(
			withDescendants( editor.state.layers, [ layer.id ] )
		)
			.map( ( id ) => editor.state.layers.find( ( l ) => l.id === id ) )
			.filter( ( l ) => l && IMAGE_TYPES.includes( l.type ) );
		if ( 1 === imageLeaves.length ) {
			layer = imageLeaves[ 0 ];
		}
	}
	if ( ! layer || ! IMAGE_TYPES.includes( layer.type ) ) {
		throw new Error( __( 'Select an image layer first.', 'wunderpaint' ) );
	}
	return layer;
};

/* -------------------------------- actions ------------------------------- */

export async function aiGenerate(
	editor,
	{ prompt, provider, aspect, refImage }
) {
	const { state } = editor;
	const result = await ai.generate( {
		prompt,
		provider,
		refImage,
		size: `${ state.doc.w }x${ state.doc.h }`,
		// Explicit aspect (v1.5 panel chips); defaults to the doc's ratio.
		aspect: aspect || nearestAspect( state.doc.w, state.doc.h ),
	} );
	if ( ! result.images?.length ) {
		throw new Error(
			__( 'The provider returned no image.', 'wunderpaint' )
		);
	}
	await insertResultLayer(
		editor,
		result.images[ 0 ],
		__( 'AI Generation', 'wunderpaint' )
	);
}

export async function aiEditLayer( editor, { prompt, provider, refImage } ) {
	const layer = requireActive( editor );
	const image = await layerDataUrl( editor.state, layer );
	const result = await ai.edit( {
		prompt,
		provider,
		image,
		refImage,
		size: `${ Math.round( layer.w ) }x${ Math.round( layer.h ) }`,
		aspect: nearestAspect( layer.w, layer.h ),
	} );
	if ( ! result.images?.length ) {
		throw new Error(
			__( 'The provider returned no image.', 'wunderpaint' )
		);
	}
	await replaceLayerContent(
		editor,
		layer,
		result.images[ 0 ],
		__( 'AI Edit Layer', 'wunderpaint' )
	);
}

/**
 * Turn the whole canvas (a multi-layer sketch/composition) into a finished
 * image (v1.23). The flattened document is sent as the reference image, so a
 * rough sketch across several layers guides the generation. The result is
 * inserted as a new full-canvas layer above the sketch.
 */
export async function aiFromSketch(
	editor,
	{ prompt, provider, aspect, refImage }
) {
	const { state } = editor;
	// Flatten every visible layer into one reference image (capped so the
	// base64 payload stays well under typical post_max_size limits).
	const image = await renderToDataURL( state.doc, refLayers( state ), {
		scale: Math.min( 1, 1280 / state.doc.w, 1280 / state.doc.h ),
		format: 'png',
		cache: sharedImageCache,
	} );
	const result = await ai.edit( {
		prompt,
		provider,
		image,
		refImage,
		size: `${ state.doc.w }x${ state.doc.h }`,
		aspect: aspect || nearestAspect( state.doc.w, state.doc.h ),
	} );
	if ( ! result.images?.length ) {
		throw new Error(
			__( 'The provider returned no image.', 'wunderpaint' )
		);
	}
	await insertResultLayer(
		editor,
		result.images[ 0 ],
		__( 'AI from Sketch', 'wunderpaint' ),
		{ x: 0, y: 0, w: state.doc.w, h: state.doc.h }
	);
}

/**
 * Fixed-prompt style/repair edits on the active layer (v1.23). The prompts
 * are model instructions (English, image models are more reliable with
 * English), not user-facing UI text.
 *
 * @param {Object} editor Editor context.
 * @param {string} prompt Model instruction.
 * @param {string} name   History / layer label.
 * @param {Object} opts   Options ({ provider }).
 */
async function aiPromptEdit( editor, prompt, name, opts = {} ) {
	const layer = requireActive( editor );
	const image = await layerDataUrl( editor.state, layer, 1536 );
	const result = await ai.edit( {
		prompt,
		provider: opts.provider,
		image,
		size: `${ Math.round( layer.w ) }x${ Math.round( layer.h ) }`,
		aspect: nearestAspect( layer.w, layer.h ),
	} );
	if ( ! result.images?.length ) {
		throw new Error(
			__( 'The provider returned no image.', 'wunderpaint' )
		);
	}
	await replaceLayerContent( editor, layer, result.images[ 0 ], name );
}

/** Colorize a black-and-white image on the active layer. */
export function aiColorize( editor, opts ) {
	return aiPromptEdit(
		editor,
		'Colorize this black-and-white image with natural, realistic colors. Keep every detail, the composition and the lighting exactly unchanged.',
		__( 'Colorize', 'wunderpaint' ),
		opts
	);
}

/** Turn the active image into a clean cartoon / illustration. */
export function aiCartoon( editor, opts ) {
	return aiPromptEdit(
		editor,
		'Redraw this image in a clean, vibrant cartoon illustration style with bold outlines and flat, cel-shaded colors. Keep the same subject, pose and composition.',
		__( 'Cartoon', 'wunderpaint' ),
		opts
	);
}

/**
 * Recreate the active layer at a much higher quality (v1.153): the layer
 * is sent as the reference and regenerated with greater fidelity, without
 * changing the subject, composition or style.
 */
export function aiEnhanceLayer( editor, opts ) {
	return aiPromptEdit(
		editor,
		'Recreate this image at a much higher quality: sharper focus, finer detail, cleaner edges, richer color depth and improved, natural lighting for a crisp, high-resolution finish. Preserve the exact subject, composition, colors, proportions and overall style, improving only the fidelity and craftsmanship.',
		__( 'Enhance Layer', 'wunderpaint' ),
		opts
	);
}

/**
 * Professionally redesign the whole composition (v1.153): the flattened
 * document is sent as the reference, and the model is asked to keep the
 * layout, structure, text and composition but elevate the visual design.
 */
export async function aiEnhanceDesign( editor, { provider } = {} ) {
	const { state } = editor;
	const image = await renderToDataURL( state.doc, refLayers( state ), {
		scale: Math.min( 1, 1280 / state.doc.w, 1280 / state.doc.h ),
		format: 'png',
		cache: sharedImageCache,
	} );
	const result = await ai.edit( {
		prompt: 'Redesign the following graphic, photo or composition to a professional, high-end standard. Keep the existing layout, structure, text content and overall composition exactly as they are; do not move, add or remove elements or change the wording. Elevate the visual design instead: refined typographic treatment, polished color and contrast, tasteful depth, lighting and shadow, cohesive spacing and visual hierarchy, and premium finishing details, so the result looks dramatically cooler, more striking and more professionally designed while remaining faithful to the original arrangement.',
		provider,
		image,
		size: `${ state.doc.w }x${ state.doc.h }`,
		aspect: nearestAspect( state.doc.w, state.doc.h ),
	} );
	if ( ! result.images?.length ) {
		throw new Error(
			__( 'The provider returned no image.', 'wunderpaint' )
		);
	}
	await insertResultLayer(
		editor,
		result.images[ 0 ],
		__( 'Enhance Design', 'wunderpaint' ),
		{ x: 0, y: 0, w: state.doc.w, h: state.doc.h }
	);
}

/** Restore an old / damaged photo on the active layer. */
export function aiRestore( editor, opts ) {
	return aiPromptEdit(
		editor,
		'Restore this old, damaged photograph: remove scratches, dust, creases, stains and noise, repair torn or faded areas, and improve sharpness and clarity, while keeping the original composition, content and era-accurate look.',
		__( 'Restore Photo', 'wunderpaint' ),
		opts
	);
}

export async function aiRemoveBg( editor ) {
	const layer = requireActive( editor );
	const image = await layerDataUrl( editor.state, layer, 2048 );
	const response = await ai
		.removeBg( { image } )
		.catch( () => ( { localFallback: true } ) );
	const src = response.localFallback
		? await removeBackgroundLocal( image )
		: response.images[ 0 ];
	await replaceLayerContent(
		editor,
		layer,
		src,
		__( 'Remove Background', 'wunderpaint' )
	);
}

/** Portrait-mode background blur, always local (v0.4). */
export async function blurBackground( editor, { radius = 18 } = {} ) {
	const layer = requireActive( editor );
	const image = await layerDataUrl( editor.state, layer, 2048 );
	const src = await blurBackgroundLocal( image, { radius } );
	await replaceLayerContent(
		editor,
		layer,
		src,
		__( 'Blur Background', 'wunderpaint' )
	);
}

/** Color Pop: subject in color, background black and white, local. */
export async function colorPop( editor ) {
	const layer = requireActive( editor );
	const image = await layerDataUrl( editor.state, layer, 2048 );
	const src = await colorPopLocal( image );
	await replaceLayerContent(
		editor,
		layer,
		src,
		__( 'Color Pop', 'wunderpaint' )
	);
}

/** One shared runner for the simple local looks (v1.376). */
async function runLocalLook( editor, fn, label ) {
	const layer = requireActive( editor );
	const image = await layerDataUrl( editor.state, layer, 2048 );
	const src = await fn( image );
	await replaceLayerContent( editor, layer, src, label );
}

/** Product Shot: cutout on clean white with a soft contact shadow. */
export function productShot( editor ) {
	return runLocalLook(
		editor,
		productShotLocal,
		__( 'Product Shot', 'wunderpaint' )
	);
}

/**
 * Neon Rim: dimmed background, glowing rim around the subject. The glow
 * borrows the first vivid Brand Kit color when one is set.
 */
export function neonRim( editor ) {
	const vivid = ( activeKitColors() || [] ).find( ( c ) => {
		const n = parseInt( String( c ).replace( '#', '' ), 16 );
		if ( Number.isNaN( n ) ) {
			return false;
		}
		const r = ( n >> 16 ) & 255;
		const g = ( n >> 8 ) & 255;
		const b = n & 255;
		const luma = 0.299 * r + 0.587 * g + 0.114 * b;
		const spread = Math.max( r, g, b ) - Math.min( r, g, b );
		return luma > 40 && luma < 220 && spread > 60;
	} );
	return runLocalLook(
		editor,
		( image ) => neonRimLocal( image, { color: vivid || '#00e5ff' } ),
		__( 'Neon Rim', 'wunderpaint' )
	);
}

/** Speed Blur: zoom-blurred background, sharp subject. */
export function speedBlur( editor ) {
	return runLocalLook(
		editor,
		speedBlurLocal,
		__( 'Speed Blur', 'wunderpaint' )
	);
}

/** Depth Fog: haze staged by the real depth map. */
export function depthFog( editor ) {
	return runLocalLook(
		editor,
		depthFogLocal,
		__( 'Depth Fog', 'wunderpaint' )
	);
}
/**
 * Vectorize (v1.77): trace the active image layer into vector paths,
 * fully local (imagetracerjs, no model download). Returns the parsed
 * SVG ({ layers, width, height }) ready for placeSvgLayers().
 */
/**
 * Load a (same-site) image URL and return it as a PNG data URL, capped
 * to `maxDim` (v1.77.1: brand logo as an extra AI reference image).
 */
export async function urlToDataUrl( url, maxDim = 512 ) {
	const img = await loadImage( url );
	const scale = Math.min(
		1,
		maxDim / Math.max( 1, Math.max( img.naturalWidth, img.naturalHeight ) )
	);
	const canvas = createCanvas(
		Math.max( 1, Math.round( img.naturalWidth * scale ) ),
		Math.max( 1, Math.round( img.naturalHeight * scale ) )
	);
	canvas
		.getContext( '2d' )
		.drawImage( img, 0, 0, canvas.width, canvas.height );
	return canvas.toDataURL( 'image/png' );
}

export async function vectorizeActiveLayer( editor ) {
	const layer = requireActive( editor );
	// VTracer handles detail well; 1024px gives smooth curves (v1.124,
	// the old 512px imagetracer pass produced jagged corners).
	const image = await layerDataUrl( editor.state, layer, 1024 );
	return traceDataUrl( image, layer.name );
}

/** The shared trace pipeline: data URL -> parsed editable path layers. */
async function traceDataUrl( image, name ) {
	const img = await loadImage( image );
	const traceScale = Math.min(
		1,
		1024 / Math.max( img.naturalWidth, img.naturalHeight )
	);
	const canvas = createCanvas(
		Math.max( 1, Math.round( img.naturalWidth * traceScale ) ),
		Math.max( 1, Math.round( img.naturalHeight * traceScale ) )
	);
	const c2d = canvas.getContext( '2d' );
	c2d.drawImage( img, 0, 0, canvas.width, canvas.height );
	const data = c2d.getImageData( 0, 0, canvas.width, canvas.height );
	// Flat artwork (the typical Vectorize input) gets snapped to its real
	// palette first (v1.128.0): anti-aliased edges and JPEG ringing
	// otherwise trace into mushy multi-colored fringe paths around every
	// shape. Photos are detected and pass through untouched.
	posterizeFlat( data );
	let svg;
	try {
		const { traceImageData } = await import(
			/* webpackChunkName: "vtracer-bridge" */ './vtracer'
		);
		svg = await traceImageData( data );
	} catch ( e ) {
		// WASM unavailable (ancient browser, blocked asset): fall back to
		// the old pure-JS tracer rather than failing the feature.
		const ImageTracer = (
			await import(
				/* webpackChunkName: "imagetracer" */ 'imagetracerjs'
			)
		).default;
		svg = ImageTracer.imagedataToSVG( data, {
			numberofcolors: 12,
			strokewidth: 0,
			ltres: 1,
			qtres: 1,
			pathomit: 8,
			roundcoords: 1,
		} );
	}
	const { importSvg } = await import(
		/* webpackChunkName: "svg-io" */ './svg-io'
	);
	const parsed = importSvg( svg );
	if ( ! parsed.layers.length ) {
		throw new Error(
			__( 'Nothing traceable found on this layer.', 'wunderpaint' )
		);
	}
	return { ...parsed, name };
}

/**
 * Prompt to vector (v1.378.0): the image model draws flat artwork with a
 * style wrapper, the local tracer turns it into editable path layers - a
 * prompt becomes real shapes, not pixels. Distinct from the Asset
 * Generator, whose text model writes simple SVG markup directly.
 *
 * @param {Object} editor        Editor context.
 * @param {Object} opts          Options.
 * @param {string} opts.prompt   Subject prompt.
 * @param {string} opts.provider Provider id.
 * @param {string} opts.aspect   Aspect ratio (defaults 1:1).
 * @return {Promise<Object>} Parsed SVG layers for placeSvgLayers().
 */
export async function aiGenerateVector( editor, { prompt, provider, aspect } ) {
	const result = await ai.generate( {
		prompt:
			prompt +
			'. Flat vector illustration style, bold simple shapes, solid colors, no gradients, no texture, no photo detail, clean edges, plain white background.',
		provider,
		size: `${ editor.state.doc.w }x${ editor.state.doc.h }`,
		aspect: aspect || '1:1',
	} );
	if ( ! result.images?.length ) {
		throw new Error(
			__( 'The provider returned no image.', 'wunderpaint' )
		);
	}
	return traceDataUrl( result.images[ 0 ], __( 'AI vector', 'wunderpaint' ) );
}

/**
 * 360° panorama generation (v1.378.0): prompt wrapper for a seamless
 * equirectangular sphere; providers rarely offer native 2:1, so the
 * widest supported frame is generated and resampled onto the exact 2:1
 * canvas the sphere projection expects.
 *
 * @param {Object} editor        Editor context.
 * @param {Object} opts          Options.
 * @param {string} opts.prompt   Scene prompt.
 * @param {string} opts.provider Provider id.
 */
export async function aiGeneratePanorama( editor, { prompt, provider } ) {
	const url = await generatePanoramaDataUrl( { prompt, provider } );
	await insertResultLayer(
		editor,
		url,
		__( '360° Panorama', 'wunderpaint' )
	);
}

const PANO_WRAP =
	'Seamless 360-degree equirectangular panorama, full spherical view, continuous horizon across the whole width, the left and right edges connect perfectly, nadir at the bottom and zenith at the top, no borders, no text, no watermark.';

/**
 * The shared panorama pipeline (v1.378.1): text-to-panorama, or - with a
 * source image - photo-to-panorama (the model rebuilds the place as a
 * full sphere). Returns the exact 2:1 data URL the sphere expects.
 *
 * @param {Object} opts          Options.
 * @param {string} opts.prompt   Scene prompt (may be empty with image).
 * @param {string} opts.provider Provider id.
 * @param {string} opts.image    Optional source photo data URL.
 * @return {Promise<string>} 2048x1024 JPEG data URL.
 */
export async function generatePanoramaDataUrl( { prompt, provider, image } ) {
	const scene = String( prompt || '' ).trim();
	const result = image
		? await ai.edit( {
				prompt:
					'Turn this photo into the full scene around the camera: keep its location, light and mood, extend it all around. ' +
					( scene ? scene + '. ' : '' ) +
					PANO_WRAP,
				provider,
				image,
				size: '2048x1024',
				aspect: '16:9',
		  } )
		: await ai.generate( {
				prompt: scene + '. ' + PANO_WRAP,
				provider,
				size: '2048x1024',
				aspect: '16:9',
		  } );
	if ( ! result.images?.length ) {
		throw new Error(
			__( 'The provider returned no image.', 'wunderpaint' )
		);
	}
	const img = await loadImage( result.images[ 0 ] );
	const canvas = createCanvas( 2048, 1024 );
	const c2d = canvas.getContext( '2d' );
	c2d.imageSmoothingEnabled = true;
	c2d.imageSmoothingQuality = 'high';
	c2d.drawImage( img, 0, 0, 2048, 1024 );
	return canvas.toDataURL( 'image/jpeg', 0.92 );
}

/** The editor language (Settings → Help), spelled out for a prompt. */
function editorLanguageName() {
	const names = {
		de: 'German',
		es: 'Spanish',
		fr: 'French',
		pt: 'Brazilian Portuguese',
		it: 'Italian',
	};
	return names[ String( currentLocale() ).slice( 0, 2 ) ] || 'English';
}

/**
 * Design Review (v1.378.0): a vision model looks at the flattened
 * document like an art director and answers in the EDITOR language (the
 * per-user language from Settings → Help, independent of the WordPress
 * locale). Returns plain structured text for the review dialog.
 *
 * @param {Object} editor Editor context.
 * @return {Promise<string>} Review text (OVERALL line + finding lines).
 */
export async function designReview( editor ) {
	const { state } = editor;
	const scale = Math.min( 1, 1280 / Math.max( state.doc.w, state.doc.h ) );
	const canvas = await renderToCanvas( state.doc, refLayers( state ), {
		viewport: { x: 0, y: 0, w: state.doc.w, h: state.doc.h },
		scale,
		cache: sharedImageCache,
	} );
	const language = editorLanguageName();
	const res = await ai.complete( {
		system:
			'You are a seasoned art director reviewing a graphic design for a non-designer. Be concrete, kind and useful: name what works in one breath, then the few changes with the biggest impact (contrast, hierarchy, alignment, spacing, text amount, color). Never suggest tools the user may not have; describe changes visually. Respond ENTIRELY in ' +
			language +
			' (including the area words). Format STRICTLY, it is machine-parsed: the first line is "OVERALL: " followed by one or two full sentences. Then 3 to 6 lines, each built as three parts separated by the | character: the area as ONE short word, then one full sentence naming the issue, then one full sentence with the concrete fix. Example line: Contrast | The caption almost disappears against the sky. | Darken the band behind it so the caption reads at a glance. Plain sentences only - no arrows, no colons after the area, no markdown, no bullets, nothing outside this format.',
		prompt:
			'Review this design (' + state.doc.w + 'x' + state.doc.h + ' px).',
		image: canvas.toDataURL( 'image/jpeg', 0.9 ),
		tier: 'design',
		maxTokens: 900,
	} );
	const text = String( res?.text || '' ).trim();
	if ( ! text ) {
		throw new Error(
			__( 'The provider returned no review.', 'wunderpaint' )
		);
	}
	return text;
}

/**
 * Improve Text (v1.378.0): five stronger alternatives for the selected
 * text layer, in the SAME language as the existing text, similar length.
 *
 * @param {Object} editor Editor context.
 * @return {Promise<Object>} { layerId, original, alternatives }.
 */
export async function improveTextAlternatives( editor ) {
	const layer = activeLayerOf( editor.state );
	if ( ! layer || 'text' !== layer.type || ! String( layer.text ).trim() ) {
		throw new Error( __( 'Select a text layer first.', 'wunderpaint' ) );
	}
	const original = String( layer.text );
	const res = await ai.complete( {
		system: 'You are a senior copywriter for graphic design. You return only the rewritten alternatives, nothing else.',
		prompt:
			'Rewrite this design copy as five distinct, stronger alternatives. Keep the SAME language as the original, keep a similar length (about ' +
			original.length +
			' characters, never more than a third longer), keep the intent, tone of voice and the line-break structure.\n\nOriginal:\n' +
			original,
		schema: {
			type: 'object',
			properties: {
				alternatives: {
					type: 'array',
					items: { type: 'string' },
					minItems: 5,
					maxItems: 5,
				},
			},
			required: [ 'alternatives' ],
		},
		tier: 'caption',
		maxTokens: 1200,
	} );
	const alternatives = ( res?.data?.alternatives || [] )
		.map( ( t ) => String( t ).trim() )
		.filter( Boolean )
		.slice( 0, 5 );
	if ( ! alternatives.length ) {
		throw new Error(
			__( 'The provider returned no text.', 'wunderpaint' )
		);
	}
	return { layerId: layer.id, original, alternatives };
}

export async function aiUpscale( editor, factor = 2 ) {
	const layer = requireActive( editor );
	const image = await layerDataUrl( editor.state, layer, 4096 );
	// Always local (Lanczos in a worker) since the Imagen Vertex upscaler
	// retired with Google's Imagen shutdown (v1.72). No key, no roundtrip.
	const { url, width, height } = await upscaleLocal( image, factor );
	// Keep the display size; only the source resolution grows (spec 11.2).
	await replaceLayerContent(
		editor,
		layer,
		url,
		__( 'Upscale', 'wunderpaint' )
	);
	return { width, height };
}

/**
 * Blur Faces (v1.241.0): Florence-2 grounds every "human face" box on
 * the active layer locally, the boxes get mosaic-pixelated beyond
 * recognition. No key, nothing leaves the browser.
 *
 * @param {Object} editor Editor handle.
 * @return {Promise<{count: number}>} How many faces were pixelated.
 */
export async function aiBlurFaces( editor ) {
	const layer = requireActive( editor );
	const { isModelInstalled } = await import( './ml' );
	if ( ! isModelInstalled( 'caption' ) ) {
		const err = new Error(
			__(
				'Blur Faces needs the local caption model (Florence-2). Install it under Settings → Local AI Models first.',
				'wunderpaint'
			)
		);
		err.isUnconfigured = true;
		throw err;
	}
	const image = await layerDataUrl( editor.state, layer, 4096 );
	const [ { groundPhrase }, { padBox, pixelateRegions } ] = await Promise.all(
		[ import( './caption' ), import( './faces' ) ]
	);
	const boxes = await groundPhrase( image, 'human face' );
	const img = await loadImage( image );
	const w = img.naturalWidth || img.width;
	const h = img.naturalHeight || img.height;
	const regions = boxes.map( ( b ) => padBox( b, w, h ) ).filter( Boolean );
	if ( ! regions.length ) {
		throw new Error(
			__( 'No faces found on the active layer.', 'wunderpaint' )
		);
	}
	const canvas = createCanvas( w, h );
	canvas.getContext( '2d' ).drawImage( img, 0, 0, w, h );
	pixelateRegions( canvas, regions );
	await replaceLayerContent(
		editor,
		layer,
		canvas.toDataURL( 'image/png' ),
		__( 'Blur Faces', 'wunderpaint' )
	);
	return { count: regions.length };
}

export async function aiEnhance( editor ) {
	const layer = requireActive( editor );
	const image = await layerDataUrl( editor.state, layer, 2048 );
	const response = await ai
		.enhance( { image } )
		.catch( () => ( { localFallback: true } ) );
	const src = response.localFallback
		? await enhanceLocal( image )
		: response.images[ 0 ];
	await replaceLayerContent(
		editor,
		layer,
		src,
		__( 'Enhance', 'wunderpaint' )
	);
}

export async function aiInpaint( editor, { prompt, provider } ) {
	const { state } = editor;
	if ( ! state.selection ) {
		throw new Error(
			__(
				'Make a selection first, it defines the inpaint region.',
				'wunderpaint'
			)
		);
	}
	// Whole-document composite as the edit source (region-based edit).
	const image = await renderToDataURL( state.doc, refLayers( state ), {
		// 1024 cap (v1.4.4): image+mask PNGs as base64 JSON must stay
		// under typical 8M post_max_size limits.
		scale: Math.min( 1, 1024 / state.doc.w, 1024 / state.doc.h ),
		format: 'png',
		cache: sharedImageCache,
	} );
	// Mask: WHITE = region to change (the proxy adapts per provider).
	const maskCanvas = selectionToMaskCanvas(
		state.selection,
		state.doc.w,
		state.doc.h,
		{ feather: state.selection.feather }
	);
	const scale = Math.min( 1, 1024 / state.doc.w, 1024 / state.doc.h );
	const scaledMask = createCanvas(
		Math.round( state.doc.w * scale ),
		Math.round( state.doc.h * scale )
	);
	const mctx = scaledMask.getContext( '2d' );
	mctx.fillStyle = '#000';
	mctx.fillRect( 0, 0, scaledMask.width, scaledMask.height );
	mctx.drawImage( maskCanvas, 0, 0, scaledMask.width, scaledMask.height );
	const mask = scaledMask.toDataURL( 'image/png' );

	const result = await ai.inpaint( {
		prompt,
		provider,
		image,
		mask,
		size: `${ scaledMask.width }x${ scaledMask.height }`,
		aspect: nearestAspect( state.doc.w, state.doc.h ),
	} );
	if ( ! result.images?.length ) {
		throw new Error(
			__( 'The provider returned no image.', 'wunderpaint' )
		);
	}
	// Composite back: cover-crop the result to the document (no stretch,
	// v1.5), then mask it to the selection (11.2).
	const resultImg = await loadImage( result.images[ 0 ] );
	const projected = projectResult( resultImg, state.doc.w, state.doc.h );
	const layer = await insertResultLayer(
		editor,
		projected.toDataURL( 'image/png' ),
		__( 'AI Inpaint', 'wunderpaint' ),
		{
			x: 0,
			y: 0,
			w: state.doc.w,
			h: state.doc.h,
		}
	);
	editor.dispatch( {
		type: 'UPDATE_LAYER',
		id: layer.id,
		patch: {
			mask: {
				kind: 'raster',
				canvas: maskCanvas,
				data: null,
				inverted: false,
				enabled: true,
			},
		},
	} );
	editor.commit( __( 'AI Inpaint', 'wunderpaint' ) );
}

export async function aiOutpaint(
	editor,
	{ prompt, provider, extendRatio = 0.25 }
) {
	const { state } = editor;

	// FILL mode (v1.4.3): when the content doesn't cover the canvas (an
	// image pulled smaller than the document, transparent doc, …), outpaint
	// means "fill the empty canvas around it", the document keeps its
	// size and the empty pixels are the mask. Only a fully covered canvas
	// falls through to EXTEND mode (grow the document by 25% per side).
	const fillScale = Math.min( 1, 1024 / state.doc.w, 1024 / state.doc.h );
	const flat = await renderToCanvas(
		{ ...state.doc, bg: 'transparent' },
		refLayers( state ),
		{ scale: fillScale, cache: sharedImageCache }
	);
	const fctx = flat.getContext( '2d' );
	const alpha = fctx.getImageData( 0, 0, flat.width, flat.height ).data;
	let empty = 0;
	for ( let i = 3; i < alpha.length; i += 4 ) {
		if ( alpha[ i ] < 8 ) {
			empty++;
		}
	}
	if ( empty / ( flat.width * flat.height ) >= 0.01 ) {
		const mask = createCanvas( flat.width, flat.height );
		const mctx = mask.getContext( '2d' );
		const mdata = mctx.createImageData( flat.width, flat.height );
		for ( let i = 3, p = 0; i < alpha.length; i += 4, p += 4 ) {
			const fill = alpha[ i ] < 8 ? 255 : 0;
			mdata.data[ p ] = fill;
			mdata.data[ p + 1 ] = fill;
			mdata.data[ p + 2 ] = fill;
			mdata.data[ p + 3 ] = 255;
		}
		mctx.putImageData( mdata, 0, 0 );
		const result = await ai.outpaint( {
			prompt:
				prompt ||
				__(
					'Extend the image naturally to fill the empty areas.',
					'wunderpaint'
				),
			provider,
			image: flat.toDataURL( 'image/png' ),
			mask: mask.toDataURL( 'image/png' ),
			size: `${ flat.width }x${ flat.height }`,
			aspect: nearestAspect( flat.width, flat.height ),
		} );
		if ( ! result.images?.length ) {
			throw new Error(
				__( 'The provider returned no image.', 'wunderpaint' )
			);
		}
		// TRUE outpaint (v1.5): cover-crop the result (no stretch) and keep
		// only the fill areas, the original pixels below stay untouched.
		const resultImg = await loadImage( result.images[ 0 ] );
		const projected = projectResult(
			resultImg,
			flat.width,
			flat.height,
			mask
		);
		await insertResultLayer(
			editor,
			projected.toDataURL( 'image/png' ),
			__( 'AI Outpaint', 'wunderpaint' ),
			{ x: 0, y: 0, w: state.doc.w, h: state.doc.h }
		);
		return;
	}

	const marginX = Math.round( state.doc.w * extendRatio );
	const marginY = Math.round( state.doc.h * extendRatio );
	const extW = state.doc.w + 2 * marginX;
	const extH = state.doc.h + 2 * marginY;

	// Extended composite with transparent margins + mask marking the margins.
	const composite = await renderToCanvas( state.doc, refLayers( state ), {
		cache: sharedImageCache,
	} );
	const scale = Math.min( 1, 1024 / extW, 1024 / extH );
	const extended = createCanvas(
		Math.round( extW * scale ),
		Math.round( extH * scale )
	);
	extended
		.getContext( '2d' )
		.drawImage(
			composite,
			marginX * scale,
			marginY * scale,
			state.doc.w * scale,
			state.doc.h * scale
		);

	const mask = createCanvas( extended.width, extended.height );
	const mctx = mask.getContext( '2d' );
	mctx.fillStyle = '#ffffff';
	mctx.fillRect( 0, 0, mask.width, mask.height );
	mctx.clearRect(
		marginX * scale,
		marginY * scale,
		state.doc.w * scale,
		state.doc.h * scale
	);
	mctx.fillStyle = '#000000';
	mctx.fillRect(
		marginX * scale,
		marginY * scale,
		state.doc.w * scale,
		state.doc.h * scale
	);

	const result = await ai.outpaint( {
		prompt:
			prompt ||
			__(
				'Extend the image naturally beyond its borders.',
				'wunderpaint'
			),
		provider,
		image: extended.toDataURL( 'image/png' ),
		mask: mask.toDataURL( 'image/png' ),
		size: `${ extended.width }x${ extended.height }`,
		aspect: nearestAspect( extended.width, extended.height ),
	} );
	if ( ! result.images?.length ) {
		throw new Error(
			__( 'The provider returned no image.', 'wunderpaint' )
		);
	}

	// Grow the document, then place the result across the new bounds (11.2)
	//, cover-cropped and masked to the new margins (v1.5): the original
	// image area keeps showing the untouched layers below.
	const resultImg = await loadImage( result.images[ 0 ] );
	const projected = projectResult(
		resultImg,
		extended.width,
		extended.height,
		mask
	);
	resizeCanvasDoc( editor, extW, extH );
	await insertResultLayer(
		editor,
		projected.toDataURL( 'image/png' ),
		__( 'AI Outpaint', 'wunderpaint' ),
		{
			x: 0,
			y: 0,
			w: extW,
			h: extH,
		}
	);
}

export async function aiVariations( editor, n = 2 ) {
	const layer = requireActive( editor );
	// Square input keeps the reprojection simple across providers (11.1).
	const source = await layerDataUrl( editor.state, layer, 1024 );
	const img = await loadImage( source );
	const size = Math.max( img.naturalWidth, img.naturalHeight );
	const square = createCanvas( size, size );
	square
		.getContext( '2d' )
		.drawImage(
			img,
			( size - img.naturalWidth ) / 2,
			( size - img.naturalHeight ) / 2
		);
	const result = await ai.variations( {
		image: square.toDataURL( 'image/png' ),
		n,
	} );
	if ( ! result.images?.length ) {
		throw new Error(
			__( 'The provider returned no variations.', 'wunderpaint' )
		);
	}
	return result.images; // panel shows the chooser (spec 06.5)
}

export { insertResultLayer, selectionBounds };

/* --------------------------- v0.2 additions ----------------------------- */

/**
 * Select Subject (v0.2, keyless): segment the visible composite with the
 * local U2-Netp model and set the result as a mask selection.
 */
export async function selectSubject( editor ) {
	const { state, dispatch, commit } = editor;
	const composite = await renderToCanvas( state.doc, refLayers( state ), {
		cache: sharedImageCache,
	} );
	const { alpha, size } = await computeSubjectAlpha( composite );

	// Threshold + upscale the 320×320 alpha map to a doc-sized mask.
	const small = createCanvas( size, size );
	const sctx = small.getContext( '2d' );
	const imageData = sctx.createImageData( size, size );
	let minX = size;
	let minY = size;
	let maxX = -1;
	let maxY = -1;
	for ( let i = 0; i < alpha.length; i++ ) {
		const on = alpha[ i ] > 0.5;
		imageData.data[ i * 4 + 3 ] = on ? 255 : 0;
		imageData.data[ i * 4 ] = 255;
		imageData.data[ i * 4 + 1 ] = 255;
		imageData.data[ i * 4 + 2 ] = 255;
		if ( on ) {
			const x = i % size;
			const y = ( i / size ) | 0;
			if ( x < minX ) {
				minX = x;
			}
			if ( x > maxX ) {
				maxX = x;
			}
			if ( y < minY ) {
				minY = y;
			}
			if ( y > maxY ) {
				maxY = y;
			}
		}
	}
	if ( maxX < 0 ) {
		throw new Error(
			__( 'No subject detected in the image.', 'wunderpaint' )
		);
	}
	sctx.putImageData( imageData, 0, 0 );

	const mask = createCanvas( state.doc.w, state.doc.h );
	const mctx = mask.getContext( '2d' );
	mctx.imageSmoothingEnabled = true;
	mctx.imageSmoothingQuality = 'high';
	mctx.drawImage( small, 0, 0, state.doc.w, state.doc.h );

	const sx = state.doc.w / size;
	const sy = state.doc.h / size;
	dispatch( {
		type: 'SET_SELECTION',
		selection: {
			kind: 'mask',
			canvas: mask,
			bounds: {
				x: Math.floor( minX * sx ),
				y: Math.floor( minY * sy ),
				w: Math.ceil( ( maxX - minX + 1 ) * sx ),
				h: Math.ceil( ( maxY - minY + 1 ) * sy ),
			},
		},
	} );
	commit( __( 'Select Subject', 'wunderpaint' ) );
}

/**
 * Remove Object (v0.2): one-click inpaint of the current selection with a
 * fixed removal prompt.
 */
export async function removeObject( editor, { provider } ) {
	try {
		return await aiInpaint( editor, {
			prompt: __(
				'Remove the selected object completely and reconstruct the background naturally and seamlessly.',
				'wunderpaint'
			),
			provider,
		} );
	} catch ( err ) {
		// No provider / provider failure → local content-aware fill (v0.6).
		return removeObjectLocal( editor );
	}
}

/** Keyless object removal: onion-peel inpaint on the composited image. */
export async function removeObjectLocal( editor ) {
	const { state, dispatch, commit } = editor;
	if ( ! state.selection ) {
		throw new Error( __( 'Make a selection first.', 'wunderpaint' ) );
	}
	const { inpaintRegion } = await import( './inpaint' );
	const composite = await renderToCanvas( state.doc, refLayers( state ), {
		cache: sharedImageCache,
	} );
	const ctx = composite.getContext( '2d' );
	const img = ctx.getImageData( 0, 0, state.doc.w, state.doc.h );

	const maskCanvas = selectionToMaskCanvas(
		state.selection,
		state.doc.w,
		state.doc.h,
		{ feather: state.selection.feather }
	);
	const maskData = maskCanvas
		.getContext( '2d' )
		.getImageData( 0, 0, state.doc.w, state.doc.h ).data;
	const mask = new Uint8Array( state.doc.w * state.doc.h );
	for ( let p = 0; p < mask.length; p++ ) {
		mask[ p ] = maskData[ p * 4 + 3 ] > 64 ? 1 : 0;
	}

	inpaintRegion(
		{ data: img.data, width: state.doc.w, height: state.doc.h },
		mask
	);
	ctx.putImageData( img, 0, 0 );

	// Result replaces the stack as a single image layer (like AI inpaint).
	const src = composite.toDataURL( 'image/png' );
	const layer = makeImage( {
		name: __( 'Remove Object (local)', 'wunderpaint' ),
		x: 0,
		y: 0,
		w: state.doc.w,
		h: state.doc.h,
		src,
		naturalW: state.doc.w,
		naturalH: state.doc.h,
	} );
	dispatch( { type: 'ADD_LAYER', layer } );
	dispatch( { type: 'SET_SELECTION', selection: null } );
	commit( __( 'Remove Object (local)', 'wunderpaint' ) );
	return layer;
}

/**
 * Crop the canvas to the detected subject plus a small margin, local
 * U2-Netp, no key needed (v1.6).
 *
 * @param {Object} editor Editor context.
 */
export async function cropToSubject( editor ) {
	const { state } = editor;
	const composite = await renderToCanvas( state.doc, refLayers( state ), {
		cache: sharedImageCache,
	} );
	const { alpha, size } = await computeSubjectAlpha( composite );
	let minX = size;
	let minY = size;
	let maxX = -1;
	let maxY = -1;
	for ( let i = 0; i < alpha.length; i++ ) {
		if ( alpha[ i ] > 0.5 ) {
			const x = i % size;
			const y = ( i / size ) | 0;
			if ( x < minX ) {
				minX = x;
			}
			if ( x > maxX ) {
				maxX = x;
			}
			if ( y < minY ) {
				minY = y;
			}
			if ( y > maxY ) {
				maxY = y;
			}
		}
	}
	if ( maxX < 0 ) {
		throw new Error(
			__( 'No subject detected in the image.', 'wunderpaint' )
		);
	}
	const sx = state.doc.w / size;
	const sy = state.doc.h / size;
	// 6% breathing room around the subject, clamped to the canvas.
	const padX = ( maxX - minX + 1 ) * sx * 0.06 + 8;
	const padY = ( maxY - minY + 1 ) * sy * 0.06 + 8;
	const x0 = Math.max( 0, Math.floor( minX * sx - padX ) );
	const y0 = Math.max( 0, Math.floor( minY * sy - padY ) );
	const x1 = Math.min( state.doc.w, Math.ceil( ( maxX + 1 ) * sx + padX ) );
	const y1 = Math.min( state.doc.h, Math.ceil( ( maxY + 1 ) * sy + padY ) );
	cropDoc(
		editor,
		{ x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
		__( 'Crop to Subject', 'wunderpaint' )
	);
}

/**
 * Sticker look (v1.6): local subject cutout + white outline + soft
 * drop shadow on the active image layer.
 *
 * @param {Object} editor Editor context.
 */
export async function makeSticker( editor ) {
	const layer = requireActive( editor );
	const image = await layerDataUrl( editor.state, layer, 2048 );
	const src = await removeBackgroundLocal( image );
	const img = await loadImage( src );
	editor.dispatch( {
		type: 'UPDATE_LAYER',
		id: layer.id,
		patch: {
			src,
			canvas: null,
			dataUrl: null,
			type: 'image',
			naturalW: img.naturalWidth,
			naturalH: img.naturalHeight,
			styles: {
				...( layer.styles || {} ),
				stroke: {
					size: Math.max(
						4,
						Math.round( Math.min( layer.w, layer.h ) * 0.02 )
					),
					color: '#ffffff',
					position: 'outside',
					opacity: 1,
				},
				dropShadow: {
					color: '#000000',
					opacity: 0.35,
					angle: 120,
					distance: 6,
					blur: 10,
					spread: 0,
				},
			},
		},
	} );
	editor.commit( __( 'Sticker', 'wunderpaint' ) );
}

/**
 * Text behind subject (v1.375.0): the magazine look in one click - the
 * active image layer gets a local subject cutout on top and an editable
 * headline in between, so the text reads behind the person but in front
 * of the background. The headline is selected afterwards, ready to type.
 *
 * @param {Object} editor Editor context.
 */
export async function textBehindSubject( editor ) {
	const { state, dispatch, commit } = editor;
	const layer = requireActive( editor );
	const image = await layerDataUrl( state, layer, 2048 );
	const cutoutSrc = await removeBackgroundLocal( image );
	const img = await loadImage( cutoutSrc );
	const plan = textBehindPlan( layer );
	const cutout = {
		...makeImage( {
			...plan.cutout,
			src: cutoutSrc,
			naturalW: img.naturalWidth,
			naturalH: img.naturalHeight,
		} ),
		rot: plan.cutout.rot,
	};
	const text = { ...makeText( plan.text ), rot: plan.text.rot };
	if ( layer.parent ) {
		cutout.parent = layer.parent;
		text.parent = layer.parent;
	}
	let next = textBehindOrder( state.layers, layer.id, text, cutout );
	const patch = textBehindGroupPatch(
		state.layers,
		layer,
		text.id,
		cutout.id
	);
	if ( patch ) {
		next = next.map( ( l ) =>
			l.id === patch.id ? { ...l, children: patch.children } : l
		);
	}
	dispatch( { type: 'SET_LAYERS', layers: next } );
	dispatch( { type: 'SET_ACTIVE', id: text.id } );
	commit( __( 'Text Behind Subject', 'wunderpaint' ) );
}

/**
 * Replace Background (v1.6): local subject cutout stays on top, an
 * AI-generated backdrop (cover-cropped, never stretched) slides below it.
 *
 * @param {Object} editor            Editor context.
 * @param {Object} opts              Options.
 * @param {string} opts.prompt       Backdrop description.
 * @param {string} opts.provider     Provider id.
 */
export async function replaceBackground( editor, { prompt, provider } ) {
	const { state, dispatch, commit } = editor;
	const layer = requireActive( editor );
	const image = await layerDataUrl( state, layer, 2048 );

	// Generate the backdrop first, a provider failure leaves the doc alone.
	const result = await ai.generate( {
		prompt,
		provider,
		size: `${ state.doc.w }x${ state.doc.h }`,
		aspect: nearestAspect( state.doc.w, state.doc.h ),
	} );
	if ( ! result.images?.length ) {
		throw new Error(
			__( 'The provider returned no image.', 'wunderpaint' )
		);
	}
	const cutout = await removeBackgroundLocal( image );

	const bgImg = await loadImage( result.images[ 0 ] );
	const projected = projectResult( bgImg, state.doc.w, state.doc.h );
	const index = state.layers.findIndex( ( l ) => l.id === layer.id );
	const bgLayer = makeImage( {
		name: __( 'AI Background', 'wunderpaint' ),
		x: 0,
		y: 0,
		w: state.doc.w,
		h: state.doc.h,
		src: projected.toDataURL( 'image/png' ),
		naturalW: projected.width,
		naturalH: projected.height,
	} );
	dispatch( {
		type: 'ADD_LAYER',
		layer: bgLayer,
		index: Math.max( 0, index ),
	} );

	const cutImg = await loadImage( cutout );
	dispatch( {
		type: 'UPDATE_LAYER',
		id: layer.id,
		patch: {
			src: cutout,
			canvas: null,
			dataUrl: null,
			type: 'image',
			naturalW: cutImg.naturalWidth,
			naturalH: cutImg.naturalHeight,
		},
	} );
	dispatch( { type: 'SET_ACTIVE', id: layer.id } );
	commit( __( 'Replace Background', 'wunderpaint' ) );
}

/**
 * Refine cutout edges (v1.8, local): smooths and slightly chokes the
 * alpha edge of the active image layer, cleans up Remove-BG fringes.
 *
 * @param {Object} editor           Editor context.
 * @param {Object} opts             Options.
 * @param {number} opts.feather     Edge blur radius in px.
 * @param {number} opts.choke       Edge shift inward (0..3).
 */
export async function refineEdges( editor, { feather = 2, choke = 1 } = {} ) {
	const layer = requireActive( editor );
	const src = await layerDataUrl( editor.state, layer, 2048 );
	const img = await loadImage( src );
	const w = img.naturalWidth || img.width;
	const h = img.naturalHeight || img.height;
	const canvas = createCanvas( w, h );
	const ctx = canvas.getContext( '2d' );
	ctx.drawImage( img, 0, 0 );
	const data = ctx.getImageData( 0, 0, w, h );
	const a = new Uint8ClampedArray( w * h );
	for ( let i = 0; i < w * h; i++ ) {
		a[ i ] = data.data[ i * 4 + 3 ];
	}
	// Separable box blur on the alpha channel only.
	const r = Math.max( 1, Math.round( feather ) );
	const pass = ( input, horizontal ) => {
		const out = new Uint8ClampedArray( w * h );
		const len = horizontal ? w : h;
		const stride = horizontal ? 1 : w;
		const lines = horizontal ? h : w;
		const lineStride = horizontal ? w : 1;
		for ( let line = 0; line < lines; line++ ) {
			let sum = 0;
			const base = line * lineStride;
			for ( let k = -r; k <= r; k++ ) {
				sum +=
					input[
						base + Math.min( len - 1, Math.max( 0, k ) ) * stride
					];
			}
			for ( let p = 0; p < len; p++ ) {
				out[ base + p * stride ] = sum / ( 2 * r + 1 );
				const add = Math.min( len - 1, p + r + 1 );
				const sub = Math.max( 0, p - r );
				sum +=
					input[ base + add * stride ] - input[ base + sub * stride ];
			}
		}
		return out;
	};
	const blurred = pass( pass( a, true ), false );
	// Contrast-stretch around a slightly raised midpoint = smooth + choke.
	const center = 128 + Math.min( 3, Math.max( 0, choke ) ) * 24;
	for ( let i = 0; i < w * h; i++ ) {
		const v = ( blurred[ i ] - center ) * 2.2 + 128;
		// Fully solid cores stay solid; only the edge band is remapped.
		data.data[ i * 4 + 3 ] =
			a[ i ] > 250 && blurred[ i ] > 250
				? 255
				: Math.max( 0, Math.min( 255, v ) );
	}
	ctx.putImageData( data, 0, 0 );
	await replaceLayerContent(
		editor,
		layer,
		canvas.toDataURL( 'image/png' ),
		__( 'Refine Edges', 'wunderpaint' )
	);
}
