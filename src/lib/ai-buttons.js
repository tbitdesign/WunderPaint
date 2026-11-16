/**
 * AI Studio Buttons (spec 2026-09-16): the panel's buttons as a table.
 *
 * Built-in rows carry the label and tooltip the panel used to keep in its
 * own closures; the five prompt-based ones also carry input, output and
 * prompt so an admin can duplicate them. Own buttons, hiding and ordering
 * live in the site option wpie_ai_buttons (includes/class-ai-buttons.php)
 * and are resolved here by pure functions; runAiButton() executes an own
 * button from the same building blocks the built-in ones use.
 */

import { __ } from '@wordpress/i18n';

import { AI_PROMPTS } from './ai-prompts';
import {
	AI_BUTTON_INPUTS,
	OUTPUTS_FOR,
	isValidCombo,
	emptyAiButtonsConfig,
	sanitizeAiButtonsConfig,
} from './ai-buttons-config';

// The pure config pieces live in ai-buttons-config.js (no editor imports,
// so the studio host can load them without the runner's dependencies);
// re-exported here so callers have one door.
export {
	AI_BUTTON_INPUTS,
	OUTPUTS_FOR,
	isValidCombo,
	emptyAiButtonsConfig,
	sanitizeAiButtonsConfig,
};
import { ai } from './api';
import {
	requireActive,
	layerDataUrl,
	replaceLayerContent,
	insertResultLayer,
	refLayers,
	urlToDataUrl,
	nearestAspect,
} from './ai-actions';
import { renderToDataURL, sharedImageCache } from './raster';
import { activeLayerOf } from '../store/editor-context';

/**
 * The built-in buttons in the panel's order. A function, not a constant:
 * __() has to read the catalogue at call time, and tests inject their own
 * table. Label and tooltip strings are the panel's, verbatim, so the
 * msgids stay the same.
 *
 * kind: 'local' runs without a provider; 'code' is a provider action with
 * its own flow (not duplicable); 'prompt' runs a fixed prompt through the
 * generic runner and is the one kind an admin can duplicate.
 */
export function builtinAiButtons() {
	const local = ( id, label, title ) => ( {
		id,
		label,
		title,
		kind: 'local',
	} );
	const code = ( id, label, title ) => ( { id, label, title, kind: 'code' } );
	const prompt = ( id, label, title, input, output ) => ( {
		id,
		label,
		title,
		kind: 'prompt',
		input,
		output,
		prompt: AI_PROMPTS[ id ],
	} );
	return [
		local(
			'selectSubject',
			__( 'Select Subject', 'wunderpaint' ),
			__(
				'Detects the main subject of the active image and turns it into a selection.',
				'wunderpaint'
			)
		),
		local(
			'selectByText',
			__( 'Select by Description', 'wunderpaint' ),
			__(
				'Type what to select in the prompt box, for example “the red car”, then click: the object becomes the selection. Runs locally with the Smart Select and Local alt text models.',
				'wunderpaint'
			)
		),
		local(
			'removeObjectLocal',
			__( 'Remove Object', 'wunderpaint' ),
			__(
				'Erases the selected area and rebuilds the background, locally. ① Select the object (Smart Select “K” / Select Subject). ② Click this. With the Object removal model downloaded (Settings, Local AI models) it paints in what should be there; without it, it blends the surrounding pixels inward.',
				'wunderpaint'
			)
		),
		prompt(
			'enhanceLayer',
			__( 'Enhance Layer', 'wunderpaint' ),
			__(
				'Sends the active layer to the AI and recreates it at much higher quality, sharper, cleaner and more detailed, keeping the same subject, colors and composition.',
				'wunderpaint'
			),
			'layer',
			'replace'
		),
		prompt(
			'enhanceDesign',
			__( 'Enhance Design', 'wunderpaint' ),
			__(
				'Flattens the whole canvas as a reference and redesigns it to a professional standard, keeping the layout, text and composition but making it noticeably cooler and more polished. Adds the result as a new layer on top.',
				'wunderpaint'
			),
			'document',
			'newLayer'
		),
		code(
			'designReview',
			__( 'Design Review', 'wunderpaint' ),
			__(
				'An art director looks at your design and answers in your editor language: one overall verdict plus the few changes with the biggest impact.',
				'wunderpaint'
			)
		),
		code(
			'improveText',
			__( 'Improve Text', 'wunderpaint' ),
			__(
				'Five stronger alternatives for the selected text layer, same language and length - pick one and it replaces the text.',
				'wunderpaint'
			)
		),
		code(
			'removeObject',
			__( 'Remove Object', 'wunderpaint' ),
			__(
				'Erases the selected area, the AI reconstructs what was behind it. ① Select the object (Smart Select tool “K”, or “Select Subject” below). ② Click this.',
				'wunderpaint'
			)
		),
		local(
			'removeBg',
			__( 'Remove BG', 'wunderpaint' ),
			__(
				'Cuts out the subject of the active image layer, the background becomes transparent.',
				'wunderpaint'
			)
		),
		local(
			'blurBg',
			__( 'Blur Background', 'wunderpaint' ),
			__(
				'Keeps the subject sharp and blurs everything behind it (portrait effect), asks for the blur strength.',
				'wunderpaint'
			)
		),
		local(
			'depthBlur',
			__( 'Depth Blur', 'wunderpaint' ),
			__(
				'Graduated background blur with a focus/strength slider, from a depth map (depth-of-field).',
				'wunderpaint'
			)
		),
		local(
			'blurfaces',
			__( 'Blur Faces', 'wunderpaint' ),
			__(
				'Finds every face on the active layer and pixelates it beyond recognition, e.g. for privacy-safe photos. Runs locally, nothing leaves your browser.',
				'wunderpaint'
			)
		),
		local(
			'vectorize',
			__( 'Vectorize', 'wunderpaint' ),
			__(
				'Traces the active image into editable vector shapes (SVG paths).',
				'wunderpaint'
			)
		),
		local(
			'upscale',
			__( 'Upscale', 'wunderpaint' ),
			__(
				'Doubles the source resolution of the active image layer with a local AI model that adds real detail; the layer keeps its size on canvas.',
				'wunderpaint'
			)
		),
		code(
			'inpaint',
			__( 'Inpaint', 'wunderpaint' ),
			__(
				'Repaints ONLY the selected area from your prompt, everything else stays. ① Select an area. ② Type what should go there (prompt box above). ③ Click this.',
				'wunderpaint'
			)
		),
		code(
			'outpaint',
			__( 'Outpaint', 'wunderpaint' ),
			/*
			 * The rule below reads "25% per" as a %p placeholder. There is
			 * none; it is a literal percentage and needs no translator note.
			 */
			// eslint-disable-next-line @wordpress/i18n-translator-comments
			__(
				'Extends the picture outward, the AI invents more scenery. Fills empty canvas around your image, or enlarges the canvas by 25% per side if it’s already full. An optional prompt steers what appears.',
				'wunderpaint'
			)
		),
		local(
			'enhance',
			__( 'Enhance', 'wunderpaint' ),
			__(
				'One-click auto color, contrast and sharpness boost for the active image layer.',
				'wunderpaint'
			)
		),
		prompt(
			'colorize',
			__( 'Colorize', 'wunderpaint' ),
			__(
				'Adds natural, realistic color to a black-and-white photo on the active image layer.',
				'wunderpaint'
			),
			'layer',
			'replace'
		),
		prompt(
			'cartoon',
			__( 'Cartoon', 'wunderpaint' ),
			__(
				'Redraws the active image layer as a clean, vibrant cartoon illustration.',
				'wunderpaint'
			),
			'layer',
			'replace'
		),
		prompt(
			'restore',
			__( 'Restore Photo', 'wunderpaint' ),
			__(
				'Repairs an old or damaged photo on the active layer, removes scratches, dust and noise and improves clarity.',
				'wunderpaint'
			),
			'layer',
			'replace'
		),
		code(
			'replaceBg',
			__( 'Replace BG', 'wunderpaint' ),
			__(
				'Keeps the subject (cut out locally) and generates a NEW background from your prompt behind it. Type the background you want in the prompt box first.',
				'wunderpaint'
			)
		),
		local(
			'refineEdges',
			__( 'Refine Edges', 'wunderpaint' ),
			__(
				'Smooths and slightly tightens the cutout edge of the active image layer, cleans Remove-BG fringes.',
				'wunderpaint'
			)
		),
		local(
			'cropSubject',
			__( 'Crop to Subject', 'wunderpaint' ),
			__(
				'Crops the canvas to the detected subject with a small margin.',
				'wunderpaint'
			)
		),
		local(
			'sticker',
			__( 'Sticker', 'wunderpaint' ),
			__(
				'Cuts out the subject and adds a white sticker outline with a soft shadow.',
				'wunderpaint'
			)
		),
		local(
			'textBehind',
			__( 'Text Behind Subject', 'wunderpaint' ),
			__(
				'Cuts out the subject locally and slides an editable headline between background and subject - the magazine cover look.',
				'wunderpaint'
			)
		),
		local(
			'colorPop',
			__( 'Color Pop', 'wunderpaint' ),
			__(
				'Keeps the subject in color and turns everything else black and white - fully local, soft edges included.',
				'wunderpaint'
			)
		),
		local(
			'productShot',
			__( 'Product Shot', 'wunderpaint' ),
			__(
				'Cuts out the subject and centers it on clean white with a soft contact shadow - the catalog look.',
				'wunderpaint'
			)
		),
		local(
			'neonRim',
			__( 'Neon Rim', 'wunderpaint' ),
			__(
				'Dims the background and wraps the subject in a glowing rim - uses your first vivid Brand Kit color when one is set.',
				'wunderpaint'
			)
		),
		local(
			'speedBlur',
			__( 'Speed Blur', 'wunderpaint' ),
			__(
				'Zoom-blurs the background around the sharp subject - instant motion.',
				'wunderpaint'
			)
		),
		local(
			'depthFog',
			__( 'Depth Fog', 'wunderpaint' ),
			__(
				'Adds atmospheric haze staged by real depth - clear up front, misty in the distance.',
				'wunderpaint'
			)
		),
		code(
			'variations',
			__( 'Variations', 'wunderpaint' ),
			__(
				'Generates 4 alternative takes on the active layer to choose from (OpenAI).',
				'wunderpaint'
			)
		),
	];
}

const byId = ( list ) => Object.fromEntries( list.map( ( b ) => [ b.id, b ] ) );

/**
 * Every button of both sections in display order, hidden ones included
 * and flagged: what the management dialog lists.
 *
 * Own buttons join the cloud section (they always need a provider).
 * Unknown ids in the order are dropped, ids the order does not mention
 * follow in table order. An own button whose input/output combination
 * the table forbids is left out: the server refuses such a record, this
 * is the belt to that suspender.
 *
 * @param {Object|null} config     { custom, hidden, order } or null.
 * @param {Object[]}    [builtins] Table rows; defaults to builtinAiButtons().
 * @return {{local: Object[], cloud: Object[]}} Rows { id, label, title,
 *   kind, hidden, custom? } in display order.
 */
export function listAiButtons( config, builtins ) {
	const table = builtins || builtinAiButtons();
	const custom = ( config?.custom || [] )
		.filter( ( c ) => c && c.id && isValidCombo( c.input, c.output ) )
		.map( ( c ) => ( {
			id: c.id,
			label: c.title,
			title: c.description || c.title,
			kind: 'custom',
			custom: c,
		} ) );
	const hidden = new Set( config?.hidden || [] );
	const sections = {
		local: table.filter( ( b ) => 'local' === b.kind ),
		cloud: [ ...table.filter( ( b ) => 'local' !== b.kind ), ...custom ],
	};
	const out = {};
	for ( const key of [ 'local', 'cloud' ] ) {
		const known = byId( sections[ key ] );
		const wanted = ( config?.order?.[ key ] || [] ).filter(
			( id ) => known[ id ]
		);
		const seen = new Set( wanted );
		out[ key ] = [
			...wanted.map( ( id ) => known[ id ] ),
			...sections[ key ].filter( ( b ) => ! seen.has( b.id ) ),
		].map( ( b ) => ( { ...b, hidden: hidden.has( b.id ) } ) );
	}
	return out;
}

/**
 * The panel's two sections: listAiButtons() without the hidden rows.
 *
 * @param {Object|null} config     { custom, hidden, order } or null.
 * @param {Object[]}    [builtins] Table rows; defaults to builtinAiButtons().
 * @return {{local: Object[], cloud: Object[]}}
 */
export function resolveAiButtons( config, builtins ) {
	const all = listAiButtons( config, builtins );
	return {
		local: all.local.filter( ( b ) => ! b.hidden ),
		cloud: all.cloud.filter( ( b ) => ! b.hidden ),
	};
}

/** A fresh own-button id in the shape the server accepts: btn_ + 8 of [a-z0-9]. */
export function newButtonId() {
	let s = '';
	while ( s.length < 8 ) {
		s += Math.random().toString( 36 ).slice( 2 );
	}
	return 'btn_' + s.slice( 0, 8 );
}

/** A blank own button, the shape the dialog edits. */
export function blankButton() {
	return {
		id: newButtonId(),
		title: '',
		description: '',
		input: 'layer',
		prompt: '',
		refImageId: 0,
		refImageUrl: '',
		refThumbUrl: '',
		output: 'newLayer',
		source: '',
	};
}

/**
 * The starter examples the dialog shows while nothing is selected: each
 * becomes an own preset with a finished prompt to reword (Thomas,
 * 16.09.2026). They cover all four inputs, and the two text ones show
 * what the built-in prompt presets do not. Prompts are model
 * instructions, English on purpose; titles and descriptions are UI.
 *
 * @return {Object[]} { id, title, description, input, output, prompt }.
 */
export function starterAiPresets() {
	return [
		{
			id: 'comic',
			title: __( 'Comic Art', 'wunderpaint' ),
			description: __(
				'Ink outlines and halftone shading on the active layer.',
				'wunderpaint'
			),
			input: 'layer',
			output: 'replace',
			prompt: 'Redraw this image as bold comic art: confident ink outlines, flat cel colors and halftone shading. Keep the subject, pose, composition and framing exactly as they are.',
		},
		{
			id: 'lineart',
			title: __( 'Clean Line Art', 'wunderpaint' ),
			description: __(
				'Black outlines on white, like a coloring page, as a new layer.',
				'wunderpaint'
			),
			input: 'layer',
			output: 'newLayer',
			prompt: 'Turn this image into clean black line art on a pure white background: even, closed outlines, no shading, no color, like a coloring page. Keep the subject and composition exactly as they are.',
		},
		{
			id: 'product',
			title: __( 'Product on White', 'wunderpaint' ),
			description: __(
				'The product cut out on white with a soft shadow.',
				'wunderpaint'
			),
			input: 'layer',
			output: 'replace',
			prompt: 'Place the product from this image on a seamless pure white studio background with a soft, natural contact shadow. Keep the product itself, its colors and proportions exactly as they are; remove everything else.',
		},
		{
			id: 'poster',
			title: __( 'Poster Look', 'wunderpaint' ),
			description: __(
				'The whole design in a bold poster look, as a new layer on top.',
				'wunderpaint'
			),
			input: 'document',
			output: 'newLayer',
			prompt: 'Restyle this design as a bold poster: saturated colors, strong contrast, crisp edges and a printed, graphic feel. Keep the layout, every element, all text and the composition exactly where they are; change only the look.',
		},
		{
			id: 'placeholder',
			title: __( 'Placeholder Text', 'wunderpaint' ),
			description: __(
				'Lorem ipsum of the same length replaces the text layer.',
				'wunderpaint'
			),
			input: 'text',
			output: 'replaceText',
			prompt: 'Replace this text with lorem ipsum placeholder text of the same length and the same line-break structure. Return only the placeholder text.',
		},
		{
			id: 'headline',
			title: __( 'Punchier Headline', 'wunderpaint' ),
			description: __(
				'Five shorter, sharper takes on the headline to pick from.',
				'wunderpaint'
			),
			input: 'text',
			output: 'alternatives',
			prompt: 'Rewrite this as a punchier headline: shorter, sharper, more concrete, in the same language and with the same meaning.',
		},
	];
}

/**
 * An own preset made from a starter example.
 *
 * @param {Object} starter One of starterAiPresets().
 * @return {Object} The preset, with a fresh id and the starter as source.
 */
export function presetFromStarter( starter ) {
	return {
		...blankButton(),
		title: starter.title,
		description: starter.description,
		input: starter.input,
		prompt: starter.prompt,
		output: starter.output,
		source: 'starter_' + starter.id,
	};
}

/**
 * A new own button copied from a row: one of the five prompt built-ins
 * (label becomes the title, the tooltip the description, the id the
 * source) or an own button (everything but the id).
 *
 * @param {Object} row A row from listAiButtons().
 * @return {Object} The copy, with a fresh id.
 */
export function duplicateOf( row ) {
	if ( row.custom ) {
		return { ...blankButton(), ...row.custom, id: newButtonId() };
	}
	return {
		...blankButton(),
		title: row.label,
		description: row.title,
		input: row.input,
		prompt: row.prompt,
		output: row.output,
		source: row.id,
	};
}

/* ------------------------------ the runner ------------------------------ */

// The frame around an admin's text prompt: the same copywriter role Improve
// Text uses, so an own text button behaves like the built-in one.
const TEXT_SYSTEM =
	'You are a senior copywriter for graphic design. You return only the rewritten text, nothing else.';

async function referenceOf( button ) {
	return button.refImageUrl
		? urlToDataUrl( button.refImageUrl, 1024 )
		: undefined;
}

function firstImage( result ) {
	if ( ! result?.images?.length ) {
		throw new Error(
			__( 'The provider returned no image.', 'wunderpaint' )
		);
	}
	return result.images[ 0 ];
}

/**
 * Run an own button (spec section 4).
 *
 * @param {Object} editor        Editor context (state, dispatch, commit).
 * @param {Object} button        Record from the option, plus refImageUrl
 *                               as the server resolves it.
 * @param {Object} opts          Options.
 * @param {string} opts.provider The provider chosen in the panel.
 * @return {Promise<Object>} { kind: 'done' } once the document changed, or
 *   { kind: 'alternatives', layerId, original, alternatives } for the
 *   panel's picker.
 */
export async function runAiButton( editor, button, { provider } = {} ) {
	const { state } = editor;
	const label = button.title;

	if ( 'text' === button.input ) {
		const layer = activeLayerOf( state );
		if (
			! layer ||
			'text' !== layer.type ||
			! String( layer.text ).trim()
		) {
			throw new Error(
				__( 'Select a text layer first.', 'wunderpaint' )
			);
		}
		const original = String( layer.text );
		const n = 'alternatives' === button.output ? 5 : 1;
		const res = await ai.complete( {
			system: TEXT_SYSTEM,
			prompt:
				button.prompt +
				'\n\nKeep the SAME language as the original and keep its line-break structure. Return ' +
				n +
				( 1 === n ? ' version.' : ' distinct versions.' ) +
				'\n\nOriginal:\n' +
				original,
			schema: {
				type: 'object',
				properties: {
					alternatives: {
						type: 'array',
						items: { type: 'string' },
						minItems: n,
						maxItems: n,
					},
				},
				required: [ 'alternatives' ],
			},
			tier: 'caption',
			maxTokens: 1200,
			provider,
		} );
		const alternatives = ( res?.data?.alternatives || [] )
			.map( ( t ) => String( t ).trim() )
			.filter( Boolean )
			.slice( 0, n );
		if ( ! alternatives.length ) {
			throw new Error(
				__( 'The provider returned no text.', 'wunderpaint' )
			);
		}
		if ( 'alternatives' === button.output ) {
			return {
				kind: 'alternatives',
				layerId: layer.id,
				original,
				alternatives,
			};
		}
		editor.dispatch( {
			type: 'UPDATE_LAYER',
			id: layer.id,
			patch: { text: alternatives[ 0 ] },
		} );
		editor.commit( label );
		return { kind: 'done' };
	}

	const refImage = await referenceOf( button );

	if ( 'none' === button.input ) {
		const result = await ai.generate( {
			prompt: button.prompt,
			provider,
			refImage,
			aspect: nearestAspect( state.doc.w, state.doc.h ),
		} );
		await insertResultLayer( editor, firstImage( result ), label, null );
		return { kind: 'done' };
	}

	if ( 'document' === button.input ) {
		const image = await renderToDataURL( state.doc, refLayers( state ), {
			scale: Math.min( 1, 1280 / state.doc.w, 1280 / state.doc.h ),
			format: 'png',
			cache: sharedImageCache,
		} );
		const result = await ai.edit( {
			prompt: button.prompt,
			provider,
			image,
			refImage,
			size: `${ state.doc.w }x${ state.doc.h }`,
			aspect: nearestAspect( state.doc.w, state.doc.h ),
		} );
		await insertResultLayer( editor, firstImage( result ), label, {
			x: 0,
			y: 0,
			w: state.doc.w,
			h: state.doc.h,
		} );
		return { kind: 'done' };
	}

	// 'layer': the active layer alone, as the built-in prompt buttons do.
	const layer = requireActive( editor );
	const image = await layerDataUrl( state, layer, 1536 );
	const result = await ai.edit( {
		prompt: button.prompt,
		provider,
		image,
		refImage,
		size: `${ Math.round( layer.w ) }x${ Math.round( layer.h ) }`,
		aspect: nearestAspect( layer.w, layer.h ),
	} );
	const src = firstImage( result );
	if ( 'replace' === button.output ) {
		await replaceLayerContent( editor, layer, src, label );
	} else {
		await insertResultLayer( editor, src, label, {
			x: layer.x,
			y: layer.y,
			w: layer.w,
			h: layer.h,
		} );
	}
	return { kind: 'done' };
}
