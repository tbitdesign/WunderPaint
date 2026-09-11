import { getMediaMeta, posts } from '../api';
import { configuredStockProviders } from '../design-assistant';

/** Compiler-Kontext aus dem offenen Editor plus Optionen des Aufrufers. */
export async function contextFromEditor( editor, opts = {} ) {
	const doc = editor.state.doc;
	let previewContext = opts.previewContext || null;
	if ( ! previewContext && opts.previewPostId ) {
		previewContext = await posts.context( opts.previewPostId );
	}
	const kits = window.WPIE?.brandKits || editor.WPIE?.brandKits || [];
	const brand =
		opts.brand ||
		( opts.kitId ? kits.find( ( k ) => k.id === opts.kitId ) : null ) ||
		null;
	return {
		doc: { w: doc.w, h: doc.h, bg: doc.bg },
		brand,
		bindings: opts.bindings || [],
		previewContext,
		seed: Number( opts.seed ) || 1,
		// 'placeholder' and 'none' both mean NO stock service: fromStock()
		// bails on an empty provider and the resolver draws the palette
		// placeholder. It used to fall through to the first configured
		// service regardless of what the person had chosen.
		//
		// 'none' was missing from this test, and nothing else in
		// src/lib/design-markup/ reads imageMode - so "No image", which the
		// dialog offers as its own choice, did nothing at all: the draft came
		// back with photographs, and on a metered service it had spent the
		// quota to fetch them.
		stockProvider:
			'placeholder' === opts.imageMode || 'none' === opts.imageMode
				? ''
				: opts.stockProvider || configuredStockProviders()[ 0 ] || '',
		imageMode: opts.imageMode || ( opts.stockProvider ? 'stock' : '' ),
		// Carried for the resolver: the description a person typed for the
		// image. It leads the prompt of a bought picture and is the search
		// phrase when an `ai` asset goes through stock instead.
		imagePrompt: opts.imagePrompt || '',
		imageProvider: opts.imageProvider || '',
		// Paid generation only when the person chose "Generate with AI" AND
		// an image provider is configured (spec section 5: `api.ai.generate`
		// only with allowPaid). Every other mode buys nothing.
		allowPaid: 'ai' === opts.imageMode && !! opts.imageProvider,
		// The `media` asset kind is offered to the model, and the resolver
		// reports it missing when nobody can look an attachment up - which
		// used to be always, so every design naming one was rejected whole.
		media: async ( mediaId ) => {
			const m = await getMediaMeta( mediaId );
			return m && m.sourceUrl
				? {
						src: m.sourceUrl,
						w: m.width || 0,
						h: m.height || 0,
						credit: '',
				  }
				: null;
		},
		// One ledger per run, shared by every variant the run compiles:
		// what was bought, and how many times (assets.js AI_IMAGES_PER_RUN).
		paid: { cache: new Map(), spent: 0 },
		onStatus: 'function' === typeof opts.onStatus ? opts.onStatus : null,
	};
}

/**
 * Merge a fixture's own sample preview into `run()`'s opts - but only as a
 * fallback. Naming either `previewContext` or `previewPostId` is the
 * caller asking for a REAL post; the fixture's `meta.previewPost` is only
 * the demo shown when the caller names neither.
 */
export function previewOptsFor( fixture, opts = {} ) {
	if ( opts.previewContext || opts.previewPostId ) {
		return { ...opts };
	}
	return { ...opts, previewContext: fixture.meta.previewPost };
}
