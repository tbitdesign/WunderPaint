import { effectById } from '../effects';
import { drawImageFitted } from '../image-fit';
import { cornerRadii } from '../corner-radii';
import { createCanvas } from './env';
import { defaultCache } from './cache';
import { liveEffectPadding } from './bounds';
import { drawGradient, drawShape } from './shapes';
import { drawTextWithEffects } from './text-paint';
import { scaleEffectParams } from './styles';

/* ------------------------------ content draw --------------------------- */

export function drawContent( ctx, layer, env ) {
	const { w, h } = layer;
	switch ( layer.type ) {
		case 'image': {
			const img = env.cache.get( layer.src );
			if ( img ) {
				// Corner radius on image layers (v1.284): a number rounds
				// all corners, an [tl, tr, br, bl] array rounds per corner
				// (composed cards round only the top, where the image meets
				// the card edge). Rendered as a clip so cover/contain crop
				// math is untouched. The reading moved into corner-radii.js
				// in v1.367, when shapes learned the same four corners.
				const [ tl, tr, br, bl ] = cornerRadii( layer.radius, w, h );
				const clipped = tl || tr || br || bl;
				if ( clipped ) {
					ctx.save();
					ctx.beginPath();
					ctx.moveTo( tl, 0 );
					ctx.arcTo( w, 0, w, h, tr );
					ctx.arcTo( w, h, 0, h, br );
					ctx.arcTo( 0, h, 0, 0, bl );
					ctx.arcTo( 0, 0, w, 0, tl );
					ctx.closePath();
					ctx.clip();
				}
				drawImageFitted(
					ctx,
					img,
					img.naturalWidth || img.width,
					img.naturalHeight || img.height,
					w,
					h,
					layer.imageFit
				);
				if ( clipped ) {
					ctx.restore();
				}
			}
			break;
		}
		case 'raster': {
			if ( layer.canvas ) {
				ctx.drawImage( layer.canvas, 0, 0, w, h );
			} else if ( layer.dataUrl ) {
				const img = env.cache.get( layer.dataUrl );
				if ( img ) {
					ctx.drawImage( img, 0, 0, w, h );
				}
			}
			break;
		}
		case 'smart': {
			const source = env.cache.get( layer.src );
			if ( ! source ) {
				break;
			}
			if (
				layer.smartFilters &&
				layer.smartFilters.some( ( f ) => f.enabled )
			) {
				// Padded working buffer: blurs bleed OUTSIDE the content —
				// a tight buffer produced hard cut edges (v1.15.2).
				const padPx = Math.ceil(
					liveEffectPadding( layer ) * env.scale
				);
				const tight = createCanvas(
					Math.max( 1, w * env.scale ) + 2 * padPx,
					Math.max( 1, h * env.scale ) + 2 * padPx
				);
				const tctx = tight.getContext( '2d' );
				tctx.drawImage(
					source,
					padPx,
					padPx,
					tight.width - 2 * padPx,
					tight.height - 2 * padPx
				);
				const data = tctx.getImageData(
					0,
					0,
					tight.width,
					tight.height
				);
				const buffer = {
					data: data.data,
					width: tight.width,
					height: tight.height,
				};
				for ( const sf of layer.smartFilters ) {
					const effect = sf.enabled && effectById( sf.id );
					if ( effect ) {
						effect.apply(
							buffer,
							scaleEffectParams( sf.id, sf.params, env.scale )
						);
					}
				}
				tctx.putImageData( data, 0, 0 );
				const padDoc = padPx / env.scale;
				ctx.drawImage(
					tight,
					-padDoc,
					-padDoc,
					w + 2 * padDoc,
					h + 2 * padDoc
				);
				break;
			}
			ctx.drawImage( source, 0, 0, w, h );
			break;
		}
		case 'shape':
			drawShape( ctx, layer );
			break;
		case 'text':
			if ( layer.useRasterFallback && layer.rasterFallback ) {
				// Imported PSD text shown with its original rasterized look
				// (spec 13.1 fallback toggle).
				const fallback = env.cache.get( layer.rasterFallback );
				if ( fallback ) {
					ctx.drawImage( fallback, 0, 0, layer.w, layer.h );
					break;
				}
			}
			drawTextWithEffects( ctx, layer, env );
			break;
		case 'gradient':
			drawGradient( ctx, layer );
			break;
		default:
			break;
	}
}

/* ----------------------------- pixel hit test --------------------------- */

// Layer types whose CONTENT transparency should let clicks fall through
// (v1.127.0). Text stays a box hit: clicking between glyphs must still
// grab the text, and strokes keep their box for hairlines. Gradients
// joined in v1.363.0: template vignettes are full-canvas radial
// gradients whose clear middle blocked every click on the art below.
export const PIXEL_HIT_TYPES = [
	'image',
	'raster',
	'smart',
	'shape',
	'gradient',
];

// Half-visible counts as see-through (v1.365.2, Photoshop parity).
// The old 3% threshold made a 40%-alpha glow overlay swallow every
// click on the text you plainly read through it. Callers compare the
// EFFECTIVE alpha (content alpha x layer opacity) against this.
export const PIXEL_HIT_ALPHA = 128;

/**
 * Content alpha of a layer at a DOC point (v1.127.0): the clicked pixel is
 * rendered into a small probe canvas, so hit tests can ignore transparent
 * areas and pick the element you actually see - essential for stacked
 * vector paths from SVG imports where every bounding box overlaps.
 *
 * @param {Object} layer   Layer.
 * @param {number} x       Doc X.
 * @param {number} y       Doc Y.
 * @param {Object} [cache] Image cache (defaults to the shared cache).
 * @return {number|null} Max alpha (0-255) in a 5x5 window, or null when the
 *                       layer type is not pixel-testable (caller keeps the
 *                       bounding-box result).
 */
export function layerAlphaAt( layer, x, y, cache ) {
	if ( ! PIXEL_HIT_TYPES.includes( layer.type ) || layer.quad ) {
		return null;
	}
	// Bitmap not loaded yet? The probe would read "fully transparent" and
	// clicks would fall through an image you can plainly see (v1.364.0).
	// Report "not testable" instead so callers keep the box result.
	const lookup = cache || defaultCache;
	if (
		( ( 'image' === layer.type || 'smart' === layer.type ) &&
			! lookup.get( layer.src ) ) ||
		( 'raster' === layer.type &&
			! layer.canvas &&
			! ( layer.dataUrl && lookup.get( layer.dataUrl ) ) )
	) {
		return null;
	}
	// Doc point onto the unrotated, unflipped local content - the inverse
	// of the render transform.
	if ( layer.rot ) {
		const cx = layer.x + layer.w / 2;
		const cy = layer.y + layer.h / 2;
		const rad = ( -layer.rot * Math.PI ) / 180;
		const dx = x - cx;
		const dy = y - cy;
		x = cx + dx * Math.cos( rad ) - dy * Math.sin( rad );
		y = cy + dx * Math.sin( rad ) + dy * Math.cos( rad );
	}
	let lx = x - layer.x;
	let ly = y - layer.y;
	if ( layer.flipX ) {
		lx = layer.w - lx;
	}
	if ( layer.flipY ) {
		ly = layer.h - ly;
	}
	// 5x5 doc-pixel probe: forgiving enough for hairline strokes.
	const R = 2;
	const size = 2 * R + 1;
	const probe = createCanvas( size, size );
	const ctx = probe.getContext( '2d', { willReadFrequently: true } );
	ctx.translate( R - lx, R - ly );
	try {
		// Smart filters only restyle pixels, they never change the
		// silhouette - skip the (expensive) full filter chain so clicking
		// a big filtered smart object stays instant (v1.130.0).
		const probed = layer.smartFilters
			? { ...layer, smartFilters: null }
			: layer;
		drawContent( ctx, probed, { cache: cache || defaultCache, scale: 1 } );
	} catch ( e ) {
		return null;
	}
	const d = ctx.getImageData( 0, 0, size, size ).data;
	let a = 0;
	for ( let i = 3; i < d.length; i += 4 ) {
		if ( d[ i ] > a ) {
			a = d[ i ];
		}
	}
	return a;
}
