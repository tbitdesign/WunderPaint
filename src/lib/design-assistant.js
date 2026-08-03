/**
 * AI Design Assistant (v4 recipe engine): the model turns a brief into a
 * SEMANTIC plan - copy, one of the curated recipes, a mood - and code composes
 * the layout from that recipe, so contrast and typography are guaranteed
 * rather than hoped for. The image provider renders the photo and everything
 * lands as regular editable layers.
 *
 * The header used to describe the v1.12 model, where the model itself returned
 * positioned primitives as JSON. That path was removed in v1.336.0 together
 * with design-ir.js; see prepareDesignVariants().
 */

import { __, sprintf } from '@wordpress/i18n';

import { ai, stock } from './api';
import { ensureFontsForLayers } from './font-manager';
import { resolvePalette } from './design-composer';
import {
	composeRecipe,
	recipeFonts,
	pickRecipes,
	RECIPE_NAMES,
	PHOTO_RECIPES,
} from './design-recipes';
import { placeholderPhoto } from './design-flair';
import { createCanvas } from './raster';
import { makeImage, loadImage } from '../store/document';

/** Configured stock providers, best default first (Unsplash > Pexels > Pixabay). */
export function configuredStockProviders() {
	const status =
		( typeof window !== 'undefined' && window.WPIE?.stock ) || {};
	const order = [ 'unsplash', 'pexels', 'pixabay' ];
	return order
		.filter( ( id ) => status[ id ] )
		.concat(
			Object.keys( status ).filter(
				( id ) => status[ id ] && ! order.includes( id )
			)
		);
}

/**
 * Fetch a real stock photo for a query, orientation-matched to the doc.
 * Tries the top few results (a provider can return a dead URL) and returns
 * a usable { src, naturalW, naturalH, credit } or null (caller falls back
 * to a placeholder). Never throws.
 *
 * @param {string} provider Stock provider id.
 * @param {string} query    Photo search phrase.
 * @param {Object} doc      { w, h } for orientation preference.
 * @return {Promise<Object|null>} Photo descriptor or null.
 */
export async function resolveStockPhoto( provider, query, doc ) {
	const q = String( query || '' ).trim();
	if ( ! provider || ! q ) {
		return null;
	}
	let results;
	try {
		results =
			( await stock.search( provider, q, 1, 'photo' ) )?.results || [];
	} catch ( e ) {
		return null;
	}
	if ( ! results.length ) {
		return null;
	}
	const wantLandscape = doc.w >= doc.h;
	// Prefer results whose orientation matches the canvas so cover-fit crops
	// the least; keep provider relevance order within each orientation group.
	const ranked = results
		.map( ( r, i ) => ( {
			r,
			i,
			miss: r.w && r.h ? ( r.w >= r.h === wantLandscape ? 0 : 1 ) : 1,
		} ) )
		.sort( ( a, b ) => a.miss - b.miss || a.i - b.i )
		.map( ( x ) => x.r );
	for ( const pick of ranked.slice( 0, 4 ) ) {
		if ( ! pick.full ) {
			continue;
		}
		try {
			const { dataUrl } = await stock.fetch( pick.full );
			const img = await loadImage( dataUrl );
			return {
				src: dataUrl,
				naturalW: img.naturalWidth,
				naturalH: img.naturalHeight,
				credit: pick.author || '',
			};
		} catch ( e ) {
			// dead URL or decode failure, try the next candidate.
		}
	}
	return null;
}

/** A design is a SEMANTIC recipe plan (not the legacy positioned wire). */
export function isRecipePlan( d ) {
	return (
		!! d &&
		'object' === typeof d &&
		! Array.isArray( d.elements ) &&
		( 'string' === typeof d.recipe ||
			( d.copy && 'object' === typeof d.copy ) ||
			'string' === typeof d.headline )
	);
}

/**
 * Generate one image via the configured image provider and return it in the
 * same descriptor shape as a stock photo, so the compose path treats both
 * alike. A failure (no key, provider error, decode) returns null, which falls
 * back to the placeholder (v1.217.0).
 *
 * @param {string} provider Image provider id (openai | gemini).
 * @param {string} prompt   The image prompt (art direction + subject).
 * @param {Object} doc      Document ({ w, h }) for sizing.
 * @return {Promise<Object|null>} Photo descriptor or null.
 */
export async function resolveAiPhoto( provider, prompt, doc ) {
	const p = String( prompt || '' ).trim();
	if ( ! provider || ! p ) {
		return null;
	}
	try {
		const result = await ai.generate( {
			prompt: p,
			provider,
			size: `${ doc.w }x${ doc.h }`,
		} );
		const src = result?.images?.[ 0 ];
		if ( ! src ) {
			return null;
		}
		const img = await loadImage( src );
		return {
			src,
			naturalW: img.naturalWidth,
			naturalH: img.naturalHeight,
			credit: '',
		};
	} catch ( e ) {
		return null;
	}
}

/** Pull the copy fields out of a plan (tolerant of flat or nested shape). */
function normalizeCopy( d ) {
	const c = d && 'object' === typeof d.copy ? d.copy : d || {};
	const s = ( v ) => ( 'string' === typeof v ? v.trim() : '' );
	return {
		kicker: s( c.kicker ),
		headline: s( c.headline ) || s( d?.label ),
		subhead: s( c.subhead ),
		cta: s( c.cta ),
		badge: s( c.badge ),
		meta: s( c.meta ),
		stat: s( c.stat ),
		emphasisWord: s( c.emphasisWord ),
	};
}

/** Normalized text for matching a produced layer to its source copy field. */
const normText = ( s ) =>
	String( s || '' )
		.toLowerCase()
		.replace( /\s+/g, ' ' )
		.trim();

/**
 * Assign post-field bindings to the composed layers of ONE variant (dynamic
 * template, v1.223.0). Each text layer is matched to the copy field it was
 * built from (normalized, so a recipe uppercasing the headline still matches),
 * and the largest image layer takes the featured-image binding. resolveBindings
 * later swaps the dummy copy for the real post value at preview/export.
 *
 * @param {Array}  layers   The variant's layers (mutated in place).
 * @param {Object} copy     The variant's copy fields.
 * @param {Array}  bindings [{ role, binding }] the user enabled.
 */
export function assignBindings( layers, copy, bindings ) {
	const textTargets = [];
	let featured = null;
	for ( const b of bindings ) {
		if ( 'image' === b.role ) {
			featured = b.binding;
			continue;
		}
		const value = normText( copy[ b.role ] );
		if ( value ) {
			textTargets.push( { value, binding: b.binding } );
		}
	}
	for ( const layer of layers ) {
		if ( 'text' !== layer.type || layer.binding ) {
			continue;
		}
		const n = normText( layer.text );
		if ( ! n ) {
			continue;
		}
		// EXACT match only: a recipe that splits the headline into several word
		// layers (e.g. brutalist) must NOT bind every fragment to post.title, or
		// the resolved post title would repeat on each line. A single-layer
		// headline still matches through any uppercasing (both are normalized).
		const hit = textTargets.find( ( t ) => t.value === n );
		if ( hit ) {
			layer.binding = hit.binding;
		}
	}
	if ( featured ) {
		let hero = null;
		for ( const layer of layers ) {
			if ( 'image' === layer.type && ! layer.binding ) {
				const area = ( layer.w || 0 ) * ( layer.h || 0 );
				if ( ! hero || area > hero.area ) {
					hero = { layer, area };
				}
			}
		}
		if ( hero ) {
			hero.layer.binding = featured;
		}
	}
}

/**
 * Compose 3 finished variants from semantic recipe plans. Each variant is a
 * DISTINCT recipe (the model's choice leads; duplicates and misses are
 * diversified) rendered with a curated palette and its recipe's font pair,
 * so every result is professional and readable by construction.
 *
 * @param {Array}  designs Semantic plans from the model.
 * @param {Object} opts    { doc, brand, roll }.
 * @return {Promise<Array>} Variants ({ label, layers }).
 */
export async function composeRecipeVariants( designs, opts ) {
	const {
		doc,
		brand,
		roll = 0,
		onStatus,
		imageProvider,
		imagePrompt,
		bindings,
	} = opts;
	// Dynamic template (v1.223.0): bind text/image layers to post fields. A
	// featured-image binding needs a photo layer, so it forces a photo variant.
	const wantFeatured = !! (
		bindings && bindings.some( ( b ) => 'post.featured' === b.binding )
	);
	const brandColors = ( brand?.colors || [] ).filter(
		( c ) => 'string' === typeof c && /^#([0-9a-f]{3,8})$/i.test( c )
	);
	const brandMode = brandColors.length >= 3 ? 'brand' : 'intent';

	// Photos: the dialog's image mode governs them. 'none' shows none, 'stock'
	// pulls a real photo, 'placeholder' uses a tinted stand-in. Default to
	// stock when a provider is configured, else none.
	const provider =
		opts.stockProvider || configuredStockProviders()[ 0 ] || '';
	const mode = [ 'stock', 'placeholder', 'none', 'ai' ].includes(
		opts.imageMode
	)
		? opts.imageMode
		: provider
		? 'stock'
		: 'none';
	// 'ai' generates a real image per photo variant when an image provider is
	// configured; without one it degrades to a placeholder (v1.217.0).
	let photoMode = 'ai' === mode && ! imageProvider ? 'placeholder' : mode;
	if ( wantFeatured && 'none' === photoMode ) {
		photoMode = 'placeholder';
	}
	const allowPhoto =
		wantFeatured ||
		( 'none' !== photoMode &&
			( 'stock' !== photoMode || provider ) &&
			( 'ai' !== photoMode || imageProvider ) );
	const usable = ( name ) =>
		!! name && ( allowPhoto || ! PHOTO_RECIPES.includes( name ) );
	const pool = RECIPE_NAMES.filter( usable );

	// One distinct recipe per variant: honour the model's pick, then fill any
	// collision/miss with an intent-fitting alternative.
	const chosen = [];
	for ( let i = 0; i < designs.length; i++ ) {
		let name = RECIPE_NAMES.includes( designs[ i ]?.recipe )
			? designs[ i ].recipe
			: null;
		if ( ! usable( name ) || chosen.includes( name ) ) {
			const cands = pickRecipes(
				{ intent: designs[ i ]?.intent },
				RECIPE_NAMES.length,
				roll + i
			).filter( usable );
			name =
				cands.find( ( c ) => ! chosen.includes( c ) ) ||
				pool[ ( roll + i ) % pool.length ];
		}
		chosen.push( name );
	}

	// When the user is in stock mode but the model picked no photo layout,
	// make one variant a photo so a stock photo reliably appears (and the
	// feature is testable). The other two stay model-chosen.
	if (
		( ( 'stock' === photoMode && provider ) ||
			( 'ai' === photoMode && imageProvider ) ||
			wantFeatured ) &&
		! chosen.some( ( n ) => PHOTO_RECIPES.includes( n ) )
	) {
		chosen[ chosen.length - 1 ] = 'photo';
	}

	// Resolve a real stock photo for each photo-recipe variant, in parallel
	// (only in stock mode; placeholder mode fills a tinted stand-in at compose
	// time). A miss also falls back to the placeholder.
	const photos = designs.map( () => null );
	if (
		'stock' === photoMode &&
		provider &&
		chosen.some( ( n ) => PHOTO_RECIPES.includes( n ) )
	) {
		if ( onStatus ) {
			onStatus( __( 'Finding photos…', 'wunderpaint' ) );
		}
		await Promise.all(
			chosen.map( async ( name, i ) => {
				if ( ! PHOTO_RECIPES.includes( name ) ) {
					return;
				}
				const c = designs[ i ]?.copy || {};
				const q = String(
					c.imageQuery ||
						designs[ i ]?.imageQuery ||
						c.headline ||
						designs[ i ]?.label ||
						''
				).trim();
				photos[ i ] = await resolveStockPhoto( provider, q, doc );
			} )
		);
	}

	// Generate a real image per photo variant (v1.217.0). The art-direction
	// text steers the look; the design's subject anchors the content. A miss
	// falls back to the placeholder at compose time, so the flow never breaks.
	if (
		'ai' === photoMode &&
		imageProvider &&
		chosen.some( ( n ) => PHOTO_RECIPES.includes( n ) )
	) {
		if ( onStatus ) {
			onStatus( __( 'Generating images…', 'wunderpaint' ) );
		}
		await Promise.all(
			chosen.map( async ( name, i ) => {
				if ( ! PHOTO_RECIPES.includes( name ) ) {
					return;
				}
				const c = designs[ i ]?.copy || {};
				const subject = String(
					c.imageQuery ||
						designs[ i ]?.imageQuery ||
						c.headline ||
						designs[ i ]?.label ||
						''
				).trim();
				const prompt =
					[ imagePrompt, subject ]
						.map( ( p ) => String( p || '' ).trim() )
						.filter( Boolean )
						.join( '. ' ) || subject;
				photos[ i ] = await resolveAiPhoto(
					imageProvider,
					prompt,
					doc
				);
			} )
		);
	}

	// Preload each recipe's fonts before composition measures any text.
	const probe = ( fam, w ) => ( {
		type: 'text',
		text: 'Ag',
		fontFamily: fam,
		weight: w,
	} );
	const probes = [];
	for ( const name of chosen ) {
		const f = recipeFonts( name, brand );
		probes.push(
			probe( f.display, 800 ),
			probe( f.display, 400 ),
			probe( f.body, 700 ),
			probe( f.body, 400 )
		);
	}
	await ensureFontsForLayers( probes ).catch( () => {} );

	// Bake helper for recipes that clip a photo into a shape (photoframe):
	// draw onto an offscreen canvas and return a self-contained data URL.
	const bake = ( w, h, draw ) => {
		const c = createCanvas(
			Math.max( 1, Math.round( w ) ),
			Math.max( 1, Math.round( h ) )
		);
		draw( c.getContext( '2d' ) );
		return c.toDataURL( 'image/png' );
	};

	const variants = [];
	for ( let i = 0; i < designs.length; i++ ) {
		const d = designs[ i ];
		const name = chosen[ i ];
		const palette = resolvePalette(
			{
				palette: {
					mode: brandMode,
					intent: d?.intent,
					accent: d?.accent,
				},
			},
			brand,
			roll + i
		);
		const faces = recipeFonts( name, brand );
		const copy = normalizeCopy( d );
		// Photo recipes: the resolved stock photo, or a palette-tinted
		// placeholder if the lookup missed, so the layout still reads.
		let photo = photos[ i ];
		if ( ! photo && PHOTO_RECIPES.includes( name ) ) {
			const ph = placeholderPhoto(
				createCanvas,
				doc.w,
				doc.h,
				palette,
				roll + i
			);
			photo = { src: ph.src, naturalW: ph.w, naturalH: ph.h };
		}
		// A recipe that masks the photo into a shape needs the decoded image
		// at compose time to bake the clip.
		let photoImg = null;
		if ( photo && 'photoframe' === name ) {
			photoImg = await loadImage( photo.src ).catch( () => null );
		}
		const layers = composeRecipe( name, {
			doc,
			copy,
			palette,
			faces,
			seed: roll + i,
			photo,
			photoImg,
			bake,
		} );
		if ( bindings && bindings.length ) {
			assignBindings( layers, copy, bindings );
		}
		variants.push( {
			label:
				String( d?.label || '' ).trim() ||
				sprintf(
					/* translators: %d: variant number. */
					__( 'Design %d', 'wunderpaint' ),
					i + 1
				),
			layers,
		} );
	}
	return variants;
}

/**
 * Ask the model for the plan and compose 3 finished variants ("the LLM
 * plans, code perfects", v1.169.0). Legacy pixel-spec responses fall
 * back to the old converter (plus the new polish passes) as ONE
 * variant. Nothing is inserted yet - the dialog shows the variants.
 *
 * @param {Object}   editor   Editor context.
 * @param {Object}   params   { brief, product, brand, referenceDataUrl,
 *                            imageMode, rollSeed }.
 * @param {Function} onStatus Progress label callback.
 * @return {Promise<{variants: Array}>} The composed variants (nothing is
 *         inserted; the dialog shows them). Both Create and Regenerate call
 *         this, so every run asks the model for a fresh plan.
 */
export async function prepareDesignVariants( editor, params, onStatus ) {
	const { state } = editor;
	const doc = state.doc;
	onStatus( __( 'Designing…', 'wunderpaint' ) );
	const result = await ai.design( {
		brief: params.brief,
		w: doc.w,
		h: doc.h,
		brand: params.brand ? JSON.stringify( params.brand ) : undefined,
		product: params.product || undefined,
		image: params.referenceDataUrl || undefined,
		// A fresh angle each regenerate so the model does not return the
		// identical designs (v1.172.2); 0 on the first Create keeps it clean.
		variation: params.variation || undefined,
	} );
	const designs = Array.isArray( result?.designs )
		? result.designs.slice( 0, 3 )
		: [];
	if ( ! designs.length ) {
		throw new Error(
			__(
				'The design response was empty. Please try again.',
				'wunderpaint'
			)
		);
	}

	const roll = Number.isFinite( params.rollSeed )
		? params.rollSeed
		: 1 + Math.floor( Math.random() * 1e6 );

	// v4 recipe path ("recipes design, the model writes the words"): the model
	// returns a SEMANTIC plan (copy + a recipe + a mood). Code composes a
	// professional, guaranteed-readable layout from a curated recipe, so the
	// output no longer depends on a blind model arranging primitives.
	//
	// The legacy wire→IR path that used to follow was removed in v1.336.0.
	// It only ran when NOT ONE of the three designs carried a recipe, a copy
	// object or a headline (see isRecipePlan), while the provider schema
	// makes recipe, intent and copy required on every single one of them
	// (class-ai-provider.php). So it never ran - and through a static import
	// it was the one thing keeping design-ir.js, 1208 lines, in the bundle
	// every user downloads. A response that would have reached it is now a
	// plain error instead of a silent fallback nobody could have tested.
	if ( ! designs.some( isRecipePlan ) ) {
		throw new Error(
			__(
				'The design response did not match the expected shape. Please try again.',
				'wunderpaint'
			)
		);
	}

	onStatus( __( 'Composing…', 'wunderpaint' ) );
	const variants = await composeRecipeVariants( designs, {
		doc,
		brand: params.brand,
		roll,
		stockProvider: params.stockProvider,
		imageMode: params.imageMode,
		imageProvider: params.imageProvider,
		imagePrompt: params.imagePrompt,
		bindings: params.bindings,
		onStatus,
	} );
	return { variants };
}

/**
 * Insert one chosen variant: kit logo on top, fonts ensured, all
 * layers in one undo step.
 *
 * @param {Object} editor  Editor context.
 * @param {Array}  layers  The variant's layers.
 * @param {Object} params  { logoUrl } (kit logo).
 * @return {Promise<number>} Layer count.
 */
export async function insertDesignVariant( editor, layers, params = {} ) {
	const { state, dispatch, commit } = editor;
	const ordered = [ ...layers ];

	// Kit logo as a deterministic top layer (v1.90.0): never AI-redrawn,
	// bottom-right with the design's margin. A load failure only skips it.
	if ( params.logoUrl ) {
		try {
			const logo = await loadImage( params.logoUrl );
			const lw = Math.max( 1, Math.round( state.doc.w * 0.16 ) );
			const lh = Math.max(
				1,
				Math.round( ( lw / logo.naturalWidth ) * logo.naturalHeight )
			);
			const margin = Math.round(
				Math.min( state.doc.w, state.doc.h ) * 0.04
			);
			ordered.push(
				makeImage( {
					name: __( 'Logo', 'wunderpaint' ),
					x: state.doc.w - lw - margin,
					y: state.doc.h - lh - margin,
					w: lw,
					h: lh,
					src: params.logoUrl,
					naturalW: logo.naturalWidth,
					naturalH: logo.naturalHeight,
				} )
			);
		} catch ( e ) {
			// Logo failed to load; the design still applies without it.
		}
	}
	await ensureFontsForLayers( ordered );
	for ( const layer of ordered ) {
		// Groups arrive with preset children (the preview renders the
		// raw array); the reducer rebuilds the list as the children
		// follow, so reset it here or every id would double up.
		dispatch( {
			type: 'ADD_LAYER',
			layer: 'group' === layer.type ? { ...layer, children: [] } : layer,
		} );
	}
	commit( __( 'AI Design', 'wunderpaint' ) );
	return ordered.length;
}

// runDesignAssistant() stood here, documented as a "legacy one-shot entry
// (kept for compatibility)". Nothing imported it and it was not on
// window.WPIE.api, so it was compatible with nobody. Removed 2026-07-25;
// the live entry is prepareDesignVariants().
