import { placeholderPhoto } from '../design-flair';
import { createCanvas } from '../raster';
import { ai as aiApi, stock as stockApi } from '../api';
import { nearestAspect } from '../aspect';
import { loadImage } from '../../store/document';

/**
 * Paid images per design run, across every variant and asset. A run
 * compiles k variants and each may place up to three photos, so one click
 * could buy nine pictures; past this many the chain below falls through to
 * stock and the placeholder. Generations are shared within the run: the
 * same prompt at the same aspect is bought once, whichever variant asks.
 */
export const AI_IMAGES_PER_RUN = 6;

/** Nur Assets, auf die ein Foto zeigt. */
export function planAssets( markup ) {
	const used = new Set(
		markup.elements
			.filter( ( e ) => 'photo' === e.kind && e.asset )
			.map( ( e ) => e.asset )
	);
	return markup.assets.filter( ( a ) => used.has( a.id ) );
}

const orientationOf = ( w, h ) =>
	w > h * 1.15 ? 'landscape' : h > w * 1.15 ? 'portrait' : 'square';

function placeholderFor( id, ctx ) {
	const size = ctx.sizes.get( id ) || { w: 800, h: 600 };
	const p = placeholderPhoto(
		createCanvas,
		size.w,
		size.h,
		ctx.tokens.palette,
		ctx.seed || 0
	);
	return { src: p.src, w: p.w, h: p.h, credit: '', kind: 'placeholder' };
}

const decodeSize = async ( src ) => {
	const img = await loadImage( src );
	return { w: img.naturalWidth || 0, h: img.naturalHeight || 0 };
};

/**
 * Buy the picture (spec section 5: `api.ai.generate` only with
 * `allowPaid`). The dialog's "Generate with AI" sets that flag together with
 * the provider; every other mode leaves it off and the asset goes through
 * stock with the same phrase. The person's description leads the prompt,
 * the model's own prompt for the asset follows it. Any failure returns
 * null and the caller carries on down the chain.
 */
async function fromAi( asset, ctx ) {
	if ( ! ctx.allowPaid || ! ctx.imageProvider ) {
		return null;
	}
	const prompt = [ ctx.imagePrompt, asset.prompt || asset.query ]
		.map( ( p ) => String( p || '' ).trim() )
		.filter( Boolean )
		.join( '. ' );
	if ( ! prompt ) {
		return null;
	}
	const size = ctx.sizes?.get( asset.id ) || { w: 1024, h: 1024 };
	const aspect = nearestAspect( size.w, size.h );
	const key = `${ aspect }|${ prompt }`;
	const ledger = ctx.paid || { cache: new Map(), spent: 0 };
	if ( ledger.cache.has( key ) ) {
		return ledger.cache.get( key );
	}
	if ( ledger.spent >= AI_IMAGES_PER_RUN ) {
		return null;
	}
	ledger.spent++;
	if ( ctx.onStatus && 1 === ledger.spent ) {
		ctx.onStatus( 'generating' );
	}
	const generate = ctx.generate || aiApi.generate;
	const decode = ctx.decode || decodeSize;
	const job = ( async () => {
		try {
			const result = await generate( {
				prompt,
				provider: ctx.imageProvider,
				size: `${ Math.round( size.w ) }x${ Math.round( size.h ) }`,
				aspect,
			} );
			const src = result?.images?.[ 0 ];
			if ( ! src ) {
				return null;
			}
			const dim = await decode( src );
			return { src, w: dim.w, h: dim.h, credit: '', kind: 'ai' };
		} catch ( e ) {
			return null;
		}
	} )();
	ledger.cache.set( key, job );
	return job;
}

async function fromStock( asset, ctx ) {
	const stock = ctx.stock || stockApi;
	const provider = ctx.stockProvider || '';
	// An `ai` asset that was not bought (no paid mode, no provider, a failed
	// generation, the run's ceiling) runs through stock. The person's own
	// description, when they typed one in the dialog, is the search phrase
	// for those; otherwise the model's query, then its prompt.
	const phrase =
		( 'ai' === asset.kind && ctx.imagePrompt ) ||
		asset.query ||
		asset.prompt ||
		'';
	if ( ! provider || ! phrase ) {
		return null;
	}
	try {
		const res = await stock.search( provider, phrase, 1, 'photo' );
		// `items`/`url` cover the resolver's own test double; `results`/`full`
		// are what the real REST normalizer sends (includes/class-stock.php:
		// normalize_pexels/normalize_unsplash/normalize_pixabay).
		const items = (
			res?.items ||
			res?.results ||
			res?.photos ||
			[]
		).filter( ( i ) => i && ( i.url || i.full ) && i.w && i.h );
		const fitting = items.filter(
			( i ) => orientationOf( i.w, i.h ) === asset.orientation
		);
		const pool = ( fitting.length ? fitting : items ).slice( 0, 10 );
		if ( ! pool.length ) {
			return null;
		}
		const pick = pool[ ( ctx.seed || 0 ) % pool.length ];
		const { dataUrl } = await stock.fetch( pick.url || pick.full );
		if ( ! dataUrl ) {
			return null;
		}
		return {
			src: dataUrl,
			w: pick.w,
			h: pick.h,
			credit: pick.credit || pick.author || pick.link || '',
			kind: 'stock',
		};
	} catch ( e ) {
		return null;
	}
}

/** Mediathek-Eintrag laden; ein scheiternder Lookup wird `null` (Spec Abschnitt 6: nie durch ein fremdes Motiv ersetzt, sondern `missing`). */
async function fromMedia( asset, ctx ) {
	if ( ! ctx.media ) {
		return null;
	}
	try {
		return await ctx.media( asset.mediaId );
	} catch ( e ) {
		return null;
	}
}

/**
 * Löst jede Bildquelle zu { src, w, h }. KI fällt auf Stock und dann auf
 * den Platzhalter zurück, Stock auf den Platzhalter; Logo und Mediathek
 * melden `missing` und werden nie durch ein fremdes Motiv ersetzt (Spec
 * Abschnitt 6).
 */
export async function resolveAssets( markup, ctx ) {
	const out = new Map();
	for ( const asset of planAssets( markup ) ) {
		let entry = null;
		if ( 'ai' === asset.kind ) {
			entry =
				( await fromAi( asset, ctx ) ) ||
				( await fromStock( asset, ctx ) ) ||
				placeholderFor( asset.id, ctx );
		} else if ( 'stock' === asset.kind ) {
			entry =
				( await fromStock( asset, ctx ) ) ||
				placeholderFor( asset.id, ctx );
		} else if ( 'logo' === asset.kind ) {
			entry = ctx.brand?.logoUrl
				? {
						src: ctx.brand.logoUrl,
						w: 0,
						h: 0,
						credit: '',
						kind: 'logo',
				  }
				: { missing: true, kind: 'logo' };
		} else if ( 'media' === asset.kind ) {
			const m = await fromMedia( asset, ctx );
			entry =
				m && m.src
					? { ...m, kind: 'media' }
					: { missing: true, kind: 'media' };
		} else {
			entry = placeholderFor( asset.id, ctx );
		}
		out.set( asset.id, entry );
	}
	return out;
}
