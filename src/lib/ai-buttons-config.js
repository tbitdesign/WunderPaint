/**
 * AI Studio Buttons: the config's shape and its validation (spec
 * 2026-09-16), with no editor imports on purpose. lib/ai-buttons.js
 * re-exports everything here for the editor; the studio host imports
 * this file directly, so it never drags the runner's dependencies
 * (workers, raster) into the standalone bootstrap.
 */

import { __, sprintf } from '@wordpress/i18n';

export const AI_BUTTON_INPUTS = [ 'layer', 'document', 'text', 'none' ];

/** Which results an input can have (the spec's combination table). */
export const OUTPUTS_FOR = {
	layer: [ 'replace', 'newLayer' ],
	document: [ 'newLayer' ],
	text: [ 'replaceText', 'alternatives' ],
	none: [ 'newLayer' ],
};

export function isValidCombo( input, output ) {
	return !! OUTPUTS_FOR[ input ] && OUTPUTS_FOR[ input ].includes( output );
}

/* ----------------------------- the sanitizer ---------------------------- */

const MAX_CUSTOM = 100;
const MAX_TITLE = 60;
const MAX_DESC = 200;
const MAX_PROMPT = 2000;

/** The empty config, the shape the option and the studio store hold. */
export function emptyAiButtonsConfig() {
	return { custom: [], hidden: [], order: { local: [], cloud: [] } };
}

const idList = ( list ) => {
	const out = [];
	for ( const k of Array.isArray( list ) ? list : [] ) {
		const id = String( k ).replace( /[^A-Za-z0-9_]/g, '' );
		if ( id && ! out.includes( id ) ) {
			out.push( id );
		}
	}
	return out;
};

const plain = ( v, max ) =>
	String( v ?? '' )
		.replace( /<[^>]*>/g, '' )
		.replace( /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '' )
		.trim()
		.slice( 0, max );

/**
 * Validate a config the way includes/class-ai-buttons.php does, for the
 * host that has no PHP: the studio. Same rules, same refusals; the first
 * bad record refuses the whole set instead of vanishing quietly.
 *
 * @param {*} raw Untrusted config.
 * @return {{config?: Object, error?: string}} The clean config or the
 *   refusal message.
 */
export function sanitizeAiButtonsConfig( raw ) {
	const src = raw && 'object' === typeof raw ? raw : {};
	const out = emptyAiButtonsConfig();
	const custom = Array.isArray( src.custom ) ? src.custom : [];
	if ( custom.length > MAX_CUSTOM ) {
		return {
			error: sprintf(
				/* translators: %d: maximum number of own AI presets. */
				__(
					'This site holds at most %d own AI presets.',
					'wunderpaint'
				),
				MAX_CUSTOM
			),
		};
	}
	const seen = new Set();
	for ( const b of custom ) {
		const rec = b && 'object' === typeof b ? b : {};
		const id = String( rec.id || '' );
		if ( ! /^btn_[a-z0-9]{4,24}$/.test( id ) || seen.has( id ) ) {
			return {
				error: __( 'An AI preset has an invalid id.', 'wunderpaint' ),
			};
		}
		seen.add( id );
		const input = String( rec.input || '' );
		const output = String( rec.output || '' );
		if ( ! isValidCombo( input, output ) ) {
			return {
				error: __(
					'An AI preset combines an input and a result that do not fit.',
					'wunderpaint'
				),
			};
		}
		const title = plain( rec.title, MAX_TITLE );
		const prompt = String( rec.prompt ?? '' )
			.replace( /<[^>]*>/g, '' )
			.trim()
			.slice( 0, MAX_PROMPT );
		if ( ! title || ! prompt ) {
			return {
				error: __(
					'An AI preset needs a title and a prompt.',
					'wunderpaint'
				),
			};
		}
		const ref =
			'text' === input
				? 0
				: Math.max( 0, parseInt( rec.refImageId, 10 ) || 0 );
		out.custom.push( {
			id,
			title,
			description: plain( rec.description, MAX_DESC ),
			input,
			prompt,
			refImageId: ref,
			output,
			source: String( rec.source || '' ).replace( /[^a-z0-9_]/gi, '' ),
		} );
	}
	out.hidden = idList( src.hidden );
	out.order.local = idList( src.order?.local );
	out.order.cloud = idList( src.order?.cloud );
	return { config: out };
}
