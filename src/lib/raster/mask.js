import { createCanvas } from './env';
import { blurCanvas } from './styles';

/**
 * Effective mask coverage in device pixels, shared by export and editing.
 * Density zero reveals everything; density one uses the complete mask.
 *
 * @param {Object} layer Layer whose mask is being rendered.
 * @param {Object} env Document, viewport, scale and image cache.
 * @param {Object} bounds Device-space destination rectangle.
 * @return {HTMLCanvasElement|null} Coverage, or null while the source loads.
 */
export function renderMaskCoverage( layer, env, bounds ) {
	const spec = layer.mask;
	let source =
		spec?.canvas ||
		( typeof spec?.data === 'string' ? env.cache.get( spec.data ) : null );
	if ( ! source ) {
		return null;
	}
	const density = Number.isFinite( spec.density )
		? Math.max( 0, Math.min( 1, spec.density ) )
		: 1;
	if ( spec.feather > 0 ) {
		// The source remains in document coordinates, independent of zoom.
		source = blurCanvas(
			source,
			( spec.feather * source.width ) / env.doc.w
		);
	}
	const coverage = createCanvas( bounds.w, bounds.h );
	const ctx = coverage.getContext( '2d' );
	ctx.translate( -bounds.x, -bounds.y );
	ctx.scale( env.scale, env.scale );
	ctx.translate( -env.viewport.x, -env.viewport.y );
	ctx.globalAlpha = spec.inverted ? density : 1;
	const anchor = spec.anchor;
	if ( anchor && layer.type !== 'stroke' && ! layer.quad ) {
		ctx.translate( layer.x + layer.w / 2, layer.y + layer.h / 2 );
		ctx.rotate( ( ( layer.rot || 0 ) * Math.PI ) / 180 );
		ctx.scale( layer.flipX ? -1 : 1, layer.flipY ? -1 : 1 );
		ctx.translate( -layer.w / 2, -layer.h / 2 );
		// Rasterization may expand the layer around its content. Preserve the
		// original mask sampling window inside that larger anchor, after feather.
		const clip = anchor.clip || anchor;
		const x = Math.max( anchor.x, clip.x ),
			y = Math.max( anchor.y, clip.y );
		const w = Math.min( anchor.x + anchor.w, clip.x + clip.w ) - x;
		const h = Math.min( anchor.y + anchor.h, clip.y + clip.h ) - y;
		if ( w > 0 && h > 0 ) {
			ctx.drawImage(
				source,
				x,
				y,
				w,
				h,
				( ( x - anchor.x ) * layer.w ) / anchor.w,
				( ( y - anchor.y ) * layer.h ) / anchor.h,
				( w * layer.w ) / anchor.w,
				( h * layer.h ) / anchor.h
			);
		}
	} else {
		ctx.drawImage( source, 0, 0, env.doc.w, env.doc.h );
	}
	ctx.setTransform( 1, 0, 0, 1, 0, 0 );
	ctx.fillStyle = '#ffffff';
	if ( spec.inverted ) {
		ctx.globalAlpha = 1;
		ctx.globalCompositeOperation = 'source-out';
	} else {
		ctx.globalAlpha = 1 - density;
		ctx.globalCompositeOperation = 'destination-over';
	}
	ctx.fillRect( 0, 0, bounds.w, bounds.h );
	ctx.globalAlpha = 1;
	ctx.globalCompositeOperation = 'source-in';
	ctx.fillRect( 0, 0, bounds.w, bounds.h );
	ctx.globalCompositeOperation = 'source-over';
	return coverage;
}
