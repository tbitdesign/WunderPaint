/**
 * Dynamic generator layers: a layer inserted by an extension generator
 * (layer.generator = { id, params }, e.g. the 3D Mockup Studio) can
 * re-render itself per post context, so a mockup inside a dynamic
 * template updates with the post like any bound text or image.
 *
 * Two phases, exactly like ai.background: this ASYNC prepare pass asks
 * the registered generator's optional `resolve` hook for fresh pixels
 * and memoises them; the sync resolveBindings consumes the memo at
 * paint time. Pipelines opt in with one line before resolveBindings:
 *
 *     await prepareGeneratorLayers( layers, ctx );
 *     const resolved = resolveBindings( layers, ctx );
 *
 * `renderTemplateResolved` is the standard building block generators
 * need: a template rendered with all its bindings resolved against the
 * same context (fonts included). Nesting is bounded: a template inside
 * a generator may itself contain generator layers, but only one level
 * deep, so two templates referencing each other cannot recurse.
 */

import { getExtensionGenerator, recordExtensionIssue } from './extensions';
import {
	setResolvedGenerator,
	hasResolvedGenerator,
	setResolvedSmart,
	hasResolvedSmart,
	resolveBindings,
	expandTokens,
	hasTokens,
	registerResolvePass,
} from './dynamic-content';
import { hydrateLayers } from '../store/document';
import { loadTemplate } from './template-cache';
import { ensureFontsForLayers } from './font-manager';
import { renderToCanvas, sharedImageCache } from './raster';
import { qrPayload, qrPayloadReady, renderQr } from './qr';
import { prepareChartLayers } from './chart-refresh';

const MAX_DEPTH = 1;

/**
 * Render a template with its bindings (and nested generator layers, up
 * to MAX_DEPTH) resolved against a post context.
 *
 * @param {string} templateId   Template id.
 * @param {Object} ctx          Post context (same shape as resolveBindings).
 * @param {Object} [opts]       Options.
 * @param {number} [opts.depth] Internal recursion depth.
 * @return {Promise<HTMLCanvasElement>} The rendered template.
 */
export async function renderTemplateResolved(
	templateId,
	ctx,
	{ depth = 0 } = {}
) {
	if ( depth > MAX_DEPTH ) {
		throw new Error(
			'renderTemplateResolved: template nesting is limited to ' +
				MAX_DEPTH +
				' level'
		);
	}
	const tpl = await loadTemplate( templateId );
	const layers = tpl.layers || [];
	await prepareGeneratorLayers( layers, ctx, { depth: depth + 1 } );
	await ensureFontsForLayers( layers );
	const resolved = resolveBindings( layers, ctx );
	await sharedImageCache.warm( resolved );
	return renderToCanvas( tpl.doc, resolved, { cache: sharedImageCache } );
}

/**
 * QR content with all `{{…}}` tokens expanded against a post context
 * (string fields only; kind, hidden etc. pass through).
 *
 * @param {Object} content QR content descriptor.
 * @param {Object} ctx     Post context.
 * @return {Object} Expanded content.
 */
export function expandQrContent( content, ctx ) {
	const out = {};
	for ( const [ key, value ] of Object.entries( content || {} ) ) {
		out[ key ] =
			'string' === typeof value ? expandTokens( value, ctx ) : value;
	}
	return out;
}

/** Whether any string field of a QR content descriptor carries tokens. */
const qrHasTokens = ( content ) =>
	Object.values( content || {} ).some(
		( v ) => 'string' === typeof v && hasTokens( v )
	);

/**
 * Re-render QR layers whose content carries `{{…}}` tokens (v1.161.0):
 * the expanded payload becomes fresh pixels for this context, an empty
 * expansion hides the layer (a code that scans to nothing is worse than
 * no code). A failing render keeps the design-time pixels.
 *
 * @param {Array}  layers Document layers.
 * @param {Object} ctx    Post context.
 * @return {Promise<void>} Resolves when all QR layers prepared.
 */
async function prepareQrLayers( layers, ctx ) {
	const jobs = layers.filter(
		( l ) =>
			l &&
			l.qr &&
			! l.hidden &&
			qrHasTokens( l.qr.content ) &&
			! hasResolvedGenerator( l, ctx )
	);
	await Promise.all(
		jobs.map( async ( layer ) => {
			const content = expandQrContent( layer.qr.content, ctx );
			if ( ! qrPayloadReady( content ) ) {
				setResolvedGenerator( layer, ctx, { hide: true } );
				return;
			}
			try {
				const { canvas } = await renderQr( qrPayload( content ), {
					...( layer.qr.style || {} ),
					size: 1024,
				} );
				setResolvedGenerator( layer, ctx, {
					src: canvas.toDataURL( 'image/png' ),
					naturalW: canvas.width,
					naturalH: canvas.height,
				} );
			} catch ( e ) {
				// Too-long payloads etc.: the design-time code stays.
			}
		} )
	);
}

/**
 * Whether a prepare pass could change anything for these layers: any
 * generator layer, token QR code or embedded-layer smart object counts.
 * UI callers (canvas preview, export dialog) gate their async prepare
 * effect on this instead of "has a generator layer" — a 3D text turned
 * into a smart object leaves no generator at the top level, so the
 * smart object never resolved (v1.249.1). Token QR codes without any
 * generator layer had the same gap.
 *
 * @param {Array} layers Document layers.
 * @return {boolean} Whether prepareGeneratorLayers can have any effect.
 */
export const needsGeneratorPrepare = ( layers ) =>
	Array.isArray( layers ) &&
	layers.some(
		( l ) =>
			l &&
			! l.hidden &&
			( ( l.generator && l.generator.id ) ||
				( l.qr && qrHasTokens( l.qr.content ) ) ||
				( 'smart' === l.type &&
					'layers' === l.embedded?.kind &&
					Array.isArray( l.embedded.layers ) ) )
	);

/** Does this embedded layer set contain anything context-dependent? */
const smartIsDynamic = ( inner ) =>
	inner.some(
		( l ) =>
			l &&
			( l.binding ||
				( l.generator && l.generator.id ) ||
				( l.qr && qrHasTokens( l.qr.content ) ) ||
				( 'text' === l.type && hasTokens( l.text ) ) )
	);

/**
 * Dynamic smart objects (v1.249): a smart object whose embedded layers
 * carry bindings, {{tokens}}, variable QR codes or generator layers
 * (e.g. a 3D text turned into a smart object) re-renders its content
 * per post context. The fresh pixels are memoised for resolveBindings;
 * the layer itself stays a smart object, so smart filters and Edit
 * Contents are untouched. One nesting level, like templates.
 *
 * @param {Array}  layers Document layers.
 * @param {Object} ctx    Post context.
 * @param {number} depth  Recursion depth.
 * @return {Promise<void>} Resolves when all smart layers prepared.
 */
async function prepareSmartLayers( layers, ctx, depth ) {
	const jobs = layers.filter(
		( l ) =>
			l &&
			'smart' === l.type &&
			'layers' === l.embedded?.kind &&
			Array.isArray( l.embedded.layers ) &&
			! l.hidden &&
			! hasResolvedSmart( l, ctx )
	);
	await Promise.all(
		jobs.map( async ( layer ) => {
			try {
				const inner = await hydrateLayers( layer.embedded.layers );
				if ( ! smartIsDynamic( inner ) ) {
					// Memoise the no-op so preview repaints skip the
					// hydrate on every pass.
					setResolvedSmart( layer, ctx, {} );
					return;
				}
				await prepareGeneratorLayers( inner, ctx, {
					depth: depth + 1,
				} );
				await ensureFontsForLayers( inner );
				const resolved = resolveBindings( inner, ctx );
				await sharedImageCache.warm( resolved );
				const w = Math.max(
					1,
					Math.round(
						layer.embedded.doc?.w || layer.srcW || layer.w || 1
					)
				);
				const h = Math.max(
					1,
					Math.round(
						layer.embedded.doc?.h || layer.srcH || layer.h || 1
					)
				);
				const canvas = await renderToCanvas(
					{ w, h, bg: 'transparent' },
					resolved,
					{ cache: sharedImageCache }
				);
				setResolvedSmart( layer, ctx, {
					src: canvas.toDataURL( 'image/png' ),
				} );
			} catch ( e ) {
				// Design-time pixels stay on any failure; never break a
				// preview or batch run over one smart object.
			}
		} )
	);
}

// Group-generator rebuilds (v1.276): group.id → { ctx, group, children,
// srcMin }. A GROUP generator's resolve may return { group, layers } - a
// full re-composition with fresh children (counts may change, the
// repeater case: Showcase Studio). The memo is spliced in by a
// registered resolveBindings pass at paint time, exactly the
// chart-refresh pattern. srcMin is the top-left anchor of the live
// children the memo was baked from, so a later move can translate the
// cached composition instead of stranding it (see applyGeneratorGroupMemos).
const groupMemo = new Map();

/** Top-left anchor (min x/y) of a group's live children. */
function childAnchor( kids ) {
	if ( ! kids.length ) {
		return { x: 0, y: 0 };
	}
	return {
		x: Math.min( ...kids.map( ( l ) => l.x || 0 ) ),
		y: Math.min( ...kids.map( ( l ) => l.y || 0 ) ),
	};
}

/** Paint-time swap for rebuilt generator groups. */
function applyGeneratorGroupMemos( layers, ctx ) {
	const dropIds = new Set();
	let any = false;
	for ( const l of layers ) {
		const m = l.generator && groupMemo.get( l.id );
		if ( m && m.ctx === ctx ) {
			any = true;
			( l.children || [] ).forEach( ( id ) => dropIds.add( id ) );
		}
	}
	if ( ! any ) {
		return layers;
	}
	const byId = new Map( layers.map( ( l ) => [ l.id, l ] ) );
	// A group moved in post preview carries the drag on its real children
	// (UPDATE_LAYERS moves them in state), while the composed memo stays
	// baked at srcMin. Translate the cached composition by that delta so it
	// tracks the move live, without an expensive per-frame re-bake (and so
	// nothing jumps when the preview ends and the real layers take over).
	const shift = ( l, dx, dy ) =>
		dx || dy ? { ...l, x: ( l.x || 0 ) + dx, y: ( l.y || 0 ) + dy } : l;
	const out = [];
	for ( const l of layers ) {
		if ( dropIds.has( l.id ) ) {
			continue;
		}
		const m = l.generator && groupMemo.get( l.id );
		if ( m && m.ctx === ctx ) {
			const kids = ( l.children || [] )
				.map( ( id ) => byId.get( id ) )
				.filter( Boolean );
			const now = childAnchor( kids );
			const src = m.srcMin || now;
			const dx = Math.round( now.x - src.x );
			const dy = Math.round( now.y - src.y );
			for ( const c of m.children ) {
				out.push( shift( c, dx, dy ) );
			}
			out.push( shift( m.group, dx, dy ) );
		} else {
			out.push( l );
		}
	}
	return out;
}

registerResolvePass( applyGeneratorGroupMemos );

/**
 * Run one generator layer's `resolve` hook and route the result: pixels
 * → generator memo, { group, layers } (group generators) → group memo.
 *
 * @param {Object} layer  The generator layer.
 * @param {Array}  layers The full flat list (for group children).
 * @param {Object} ctx    Post context.
 * @param {number} depth  Recursion depth.
 * @return {Promise<void>} Resolves when the layer is prepared.
 */
async function prepareOneGenerator( layer, layers, ctx, depth ) {
	const gen = getExtensionGenerator( layer.generator.id );
	if ( ! gen || 'function' !== typeof gen.resolve ) {
		return;
	}
	try {
		const res = await gen.resolve( {
			layer,
			params: layer.generator.params || {},
			ctx,
			depth,
			// Group generators re-compose from their current children
			// (bounding box, move offset) - hand them over (v1.276).
			children: layers.filter( ( l ) => l.parent === layer.id ),
			// Token helpers (v1.162, additive): generators expand
			// {{binding.id}} placeholders in their text params
			// against the current post without own resolver code.
			expandTokens: ( s ) => expandTokens( s, ctx ),
			hasTokens,
			renderTemplate: ( id, opts ) =>
				renderTemplateResolved( id, ctx, {
					...opts,
					depth: depth + 1,
				} ),
		} );
		if ( res && res.hide ) {
			// {hide:true} (v1.163): the layer disappears for this
			// context - the sale-badge pattern (a discount star
			// only exists while there is a discount).
			setResolvedGenerator( layer, ctx, { hide: true } );
		} else if (
			res &&
			Array.isArray( res.layers ) &&
			res.group &&
			'group' === layer.type
		) {
			// Full group rebuild (v1.276): fresh children spliced in at
			// paint time by applyGeneratorGroupMemos. Anchor the memo to
			// the live children it was baked from (srcMin) so a later move
			// translates the composition instead of leaving it stranded.
			groupMemo.set( layer.id, {
				ctx,
				group: res.group,
				children: res.layers,
				srcMin: childAnchor(
					layers.filter( ( l ) => l.parent === layer.id )
				),
			} );
		} else if ( res && res.src ) {
			setResolvedGenerator( layer, ctx, {
				src: res.src,
				...( res.naturalW > 0 ? { naturalW: res.naturalW } : {} ),
				...( res.naturalH > 0 ? { naturalH: res.naturalH } : {} ),
			} );
		}
	} catch ( e ) {
		groupMemo.delete( layer.id );
		recordExtensionIssue(
			layer.generator.id,
			'resolve failed: ' + ( e && e.message ? e.message : e )
		);
	}
}

/**
 * Ask every generator layer's `resolve` hook for context-specific
 * pixels (in parallel) and memoise the results for resolveBindings.
 * Layers whose generator is not installed, has no `resolve`, or throws
 * keep their design-time pixels — a failing generator must not break
 * a batch run. Like bindings, only top-level layers participate.
 * QR layers with variable tokens ride the same pass, so every pipeline
 * that prepares generators gets per-post QR codes for free.
 *
 * @param {Array}  layers       Document layers.
 * @param {Object} ctx          Post context; falsy = no-op.
 * @param {Object} [opts]       Options.
 * @param {number} [opts.depth] Internal recursion depth.
 * @return {Promise<void>} Resolves when all generator layers prepared.
 */
export async function prepareGeneratorLayers(
	layers,
	ctx,
	{ depth = 0 } = {}
) {
	if ( ! ctx || ! Array.isArray( layers ) ) {
		return;
	}
	// Sourced/tokenised charts rebuild per context (v1.271); their memo
	// is consumed by a registered resolveBindings pass at paint time.
	const chartsDone = prepareChartLayers( layers, ctx );
	const qrDone = prepareQrLayers( layers, ctx );
	const smartDone =
		depth <= MAX_DEPTH
			? prepareSmartLayers( layers, ctx, depth )
			: Promise.resolve();
	const jobs = layers.filter(
		( l ) =>
			l &&
			l.generator &&
			l.generator.id &&
			! l.hidden &&
			// Already prepared for this context (preview repaints run
			// this pass repeatedly): skip the expensive re-bake.
			! hasResolvedGenerator( l, ctx ) &&
			groupMemo.get( l.id )?.ctx !== ctx
	);
	await Promise.all(
		jobs.map( ( layer ) =>
			prepareOneGenerator( layer, layers, ctx, depth )
		)
	);
	await qrDone;
	await smartDone;
	await chartsDone;
}

/**
 * Manual in-document refresh (v1.276, the "Refresh …" context-menu
 * entry): run the generator's resolve against a bare site context and
 * swap the group's children in place via SET_LAYERS. Returns false when
 * the generator has no resolve hook or produced no rebuild.
 *
 * @param {Object} editor The editor facade ({ state, dispatch, commit }).
 * @param {Object} layer  The generator group layer.
 * @return {Promise<boolean>} Whether the layer was refreshed.
 */
export async function refreshGeneratorLayer( editor, layer ) {
	const gen =
		layer && layer.generator && getExtensionGenerator( layer.generator.id );
	if ( ! gen || 'function' !== typeof gen.resolve ) {
		return false;
	}
	const layers = editor.state.layers;
	const res = await gen.resolve( {
		layer,
		params: layer.generator.params || {},
		// A minimal context: manual refresh has no post, generators pull
		// their own data from params.
		ctx: { fields: {} },
		depth: 0,
		children: layers.filter( ( l ) => l.parent === layer.id ),
		expandTokens: ( s ) => s,
		hasTokens,
		renderTemplate: null,
	} );
	if ( ! res || ! Array.isArray( res.layers ) || ! res.group ) {
		return false;
	}
	await ensureFontsForLayers(
		res.layers.filter( ( l ) => 'text' === l.type )
	);
	const kids = new Set(
		layers.filter( ( l ) => l.parent === layer.id ).map( ( l ) => l.id )
	);
	const next = layers.flatMap( ( l ) => {
		if ( l.id === layer.id ) {
			return [ ...res.layers, res.group ];
		}
		return kids.has( l.id ) ? [] : [ l ];
	} );
	editor.dispatch( { type: 'SET_LAYERS', layers: next } );
	editor.dispatch( { type: 'SET_ACTIVE', id: res.group.id } );
	editor.commit( 'Refresh ' + ( gen.label || 'generator' ) );
	return true;
}
