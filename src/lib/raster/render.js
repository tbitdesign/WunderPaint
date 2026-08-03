import { effectById } from '../effects';
import {
	evalBezierMesh,
	homographyFromQuad,
	projectUnitPoint,
} from '../quad-warp';
import {
	blendToComposite,
	createCanvas,
	cssFilterPixels,
	filterCssFor,
	supportsCtxFilter,
} from './env';
import { defaultCache } from './cache';
import { layerDeviceBounds, stylesPadding } from './bounds';
import { drawContent } from './content';
import {
	applyLayerStyles,
	blurCanvas,
	drawStrokePaths,
	scaleEffectParams,
} from './styles';

/* ------------------------------ layer render --------------------------- */

/**
 * Draw a source canvas into an arbitrary quad (v0.7 free transform) via an
 * 8×8 mesh of affine triangles. Since spec 13.6 the mesh points come from a
 * real homography, so Distort/Perspective placements foreshorten exactly
 * like Photoshop (the old bilinear mix kept edges straight but distributed
 * the interior wrongly - visible on imported perspective smart objects).
 *
 * @param {CanvasRenderingContext2D} ctx  Target (current transform = doc space).
 * @param {HTMLCanvasElement}        src  Source content (natural size).
 * @param {Object}                   quad { tl, tr, br, bl } in doc coords.
 * @param {Object}                   mesh Optional normalized Bézier warp
 *                                        mesh (Photoshop envelope warp,
 *                                        spec 13.6) applied before the
 *                                        quad homography.
 */
export function drawWarped( ctx, src, quad, mesh ) {
	const N = mesh ? 16 : 8;
	const w = src.width;
	const h = src.height;
	const m = homographyFromQuad( [
		quad.tl.x,
		quad.tl.y,
		quad.tr.x,
		quad.tr.y,
		quad.br.x,
		quad.br.y,
		quad.bl.x,
		quad.bl.y,
	] );
	const at = ( u, v ) => {
		if ( mesh ) {
			[ u, v ] = evalBezierMesh( mesh, u, v );
		}
		const [ x, y ] = projectUnitPoint( m, u, v );
		return { x, y };
	};
	const tri = ( s0, s1, s2, d0, d1, d2 ) => {
		// Affine map: solve for [a c e; b d f] with M*s_k = d_k.
		const den =
			s0.x * ( s1.y - s2.y ) +
			s1.x * ( s2.y - s0.y ) +
			s2.x * ( s0.y - s1.y );
		if ( ! den ) {
			return;
		}
		const a =
			( d0.x * ( s1.y - s2.y ) +
				d1.x * ( s2.y - s0.y ) +
				d2.x * ( s0.y - s1.y ) ) /
			den;
		const b =
			( d0.y * ( s1.y - s2.y ) +
				d1.y * ( s2.y - s0.y ) +
				d2.y * ( s0.y - s1.y ) ) /
			den;
		const c =
			( d0.x * ( s2.x - s1.x ) +
				d1.x * ( s0.x - s2.x ) +
				d2.x * ( s1.x - s0.x ) ) /
			den;
		const d =
			( d0.y * ( s2.x - s1.x ) +
				d1.y * ( s0.x - s2.x ) +
				d2.y * ( s1.x - s0.x ) ) /
			den;
		const e = d0.x - a * s0.x - c * s0.y;
		const f = d0.y - b * s0.x - d * s0.y;
		ctx.save();
		ctx.beginPath();
		// Slight overlap avoids hairline seams between triangles. Purely
		// relative growth left sub-pixel gaps on large cells (visible as
		// diagonal hairlines on flat fills), so enforce ~0.75px minimum.
		const cx = ( d0.x + d1.x + d2.x ) / 3;
		const cy = ( d0.y + d1.y + d2.y ) / 3;
		const grow = ( p ) => {
			const dx = p.x - cx;
			const dy = p.y - cy;
			const len = Math.hypot( dx, dy ) || 1;
			const g = Math.max( 0.75, len * 0.02 );
			return { x: p.x + ( dx / len ) * g, y: p.y + ( dy / len ) * g };
		};
		const g0 = grow( d0 );
		const g1 = grow( d1 );
		const g2 = grow( d2 );
		ctx.moveTo( g0.x, g0.y );
		ctx.lineTo( g1.x, g1.y );
		ctx.lineTo( g2.x, g2.y );
		ctx.closePath();
		ctx.clip();
		ctx.transform( a, b, c, d, e, f );
		ctx.drawImage( src, 0, 0 );
		ctx.restore();
	};
	for ( let j = 0; j < N; j++ ) {
		for ( let i = 0; i < N; i++ ) {
			const u0 = i / N;
			const u1 = ( i + 1 ) / N;
			const v0 = j / N;
			const v1 = ( j + 1 ) / N;
			const s00 = { x: u0 * w, y: v0 * h };
			const s10 = { x: u1 * w, y: v0 * h };
			const s11 = { x: u1 * w, y: v1 * h };
			const s01 = { x: u0 * w, y: v1 * h };
			tri( s00, s10, s11, at( u0, v0 ), at( u1, v0 ), at( u1, v1 ) );
			tri( s00, s11, s01, at( u0, v0 ), at( u1, v1 ), at( u0, v1 ) );
		}
	}
}

/**
 * Render one layer (or group) into a device-space scratch canvas clipped to
 * the viewport. Returns { canvas, x, y } in device pixels, or null.
 * @param layer
 * @param env
 */
export function renderLayerToDevice( layer, env ) {
	const bounds =
		'group' === layer.type
			? groupDeviceBounds( layer, env )
			: layerDeviceBounds( layer, env );
	if ( ! bounds ) {
		return null;
	}
	const canvas = createCanvas( bounds.w, bounds.h );
	const ctx = canvas.getContext( '2d' );

	// World transform: doc coords → this scratch canvas.
	const worldTransform = () => {
		ctx.setTransform( 1, 0, 0, 1, 0, 0 );
		ctx.translate( -bounds.x, -bounds.y );
		ctx.scale( env.scale, env.scale );
		ctx.translate( -env.viewport.x, -env.viewport.y );
	};
	worldTransform();

	if ( 'group' === layer.type ) {
		// Paint children in flat-array (z) order, the same order the Layers
		// panel shows, not the raw `children` order, which lags after a layer
		// is dropped into the group (v1.24 fix: dropped layers used to render
		// at the wrong z and hide behind siblings).
		const order = new Map( env.layers.map( ( l, i ) => [ l.id, i ] ) );
		const children = ( layer.children || [] )
			.map( ( id ) => env.layers.find( ( l ) => l.id === id ) )
			.filter( Boolean )
			.sort( ( a, b ) => order.get( a.id ) - order.get( b.id ) );
		// Isolation boundary: children composite among themselves first.
		ctx.setTransform( 1, 0, 0, 1, 0, 0 );
		compositeLayers( ctx, children, {
			...env,
			deviceOffset: { x: bounds.x, y: bounds.y },
			clipSeed: null, // group children clip among themselves only
		} );
		// Preset filter / adjustments on the GROUP apply to the finished
		// composite (v1.153.1: they silently did nothing on groups).
		const groupCss = filterCssFor( layer );
		if ( groupCss ) {
			if ( supportsCtxFilter() ) {
				const snapshot = createCanvas( canvas.width, canvas.height );
				snapshot.getContext( '2d' ).drawImage( canvas, 0, 0 );
				ctx.save();
				ctx.setTransform( 1, 0, 0, 1, 0, 0 );
				ctx.globalCompositeOperation = 'copy';
				ctx.filter = groupCss;
				ctx.drawImage( snapshot, 0, 0 );
				ctx.restore();
			} else {
				const data = ctx.getImageData(
					0,
					0,
					canvas.width,
					canvas.height
				);
				cssFilterPixels(
					{
						data: data.data,
						width: canvas.width,
						height: canvas.height,
					},
					groupCss
				);
				ctx.putImageData( data, 0, 0 );
			}
		}
	} else {
		// CSS filter (preset + adjustments), hardware path when available.
		const css = filterCssFor( {
			...layer,
			adjust: mergeClipAdjust( layer, env ),
		} );
		const useCtxFilter = css && supportsCtxFilter();
		if ( useCtxFilter ) {
			ctx.filter = css;
		}

		if ( 'stroke' === layer.type ) {
			// Paths are absolute doc coords; honor bbox translation + rotation.
			const dx = layer.x - ( layer.x0 ?? layer.x );
			const dy = layer.y - ( layer.y0 ?? layer.y );
			if ( layer.rot || layer.flipX || layer.flipY ) {
				const cx = layer.x + layer.w / 2;
				const cy = layer.y + layer.h / 2;
				ctx.translate( cx, cy );
				if ( layer.rot ) {
					ctx.rotate( ( layer.rot * Math.PI ) / 180 );
				}
				if ( layer.flipX || layer.flipY ) {
					ctx.scale( layer.flipX ? -1 : 1, layer.flipY ? -1 : 1 );
				}
				ctx.translate( -cx, -cy );
			}
			ctx.translate( dx, dy );
			drawStrokePaths( ctx, layer );
		} else if ( layer.quad ) {
			// Free transform (v0.7): render content flat, then mesh-warp it.
			const flat = createCanvas(
				Math.max( 1, Math.round( layer.w * env.scale ) ),
				Math.max( 1, Math.round( layer.h * env.scale ) )
			);
			const fx = flat.getContext( '2d' );
			fx.scale( env.scale, env.scale );
			drawContent( fx, layer, env );
			drawWarped( ctx, flat, layer.quad, layer.warpMesh || null );
		} else {
			const cx = layer.x + layer.w / 2;
			const cy = layer.y + layer.h / 2;
			ctx.translate( cx, cy );
			if ( layer.rot ) {
				ctx.rotate( ( layer.rot * Math.PI ) / 180 );
			}
			if ( layer.flipX || layer.flipY ) {
				ctx.scale( layer.flipX ? -1 : 1, layer.flipY ? -1 : 1 );
			}
			ctx.translate( -layer.w / 2, -layer.h / 2 );
			drawContent( ctx, layer, env );
		}

		if ( useCtxFilter ) {
			ctx.filter = 'none';
		} else if ( css ) {
			// Pixel fallback (no ctx.filter, spec 05.2).
			const data = ctx.getImageData( 0, 0, canvas.width, canvas.height );
			cssFilterPixels(
				{ data: data.data, width: canvas.width, height: canvas.height },
				css
			);
			ctx.putImageData( data, 0, 0 );
		}
	}

	// Mask: multiply alpha (destination-in), inverted → destination-out.
	if ( layer.mask && layer.mask.enabled !== false ) {
		const maskSource =
			layer.mask.canvas ||
			( 'string' === typeof layer.mask.data
				? env.cache.get( layer.mask.data )
				: null );
		if ( maskSource ) {
			let mask = maskSource;
			if ( layer.mask.feather ) {
				const wrapped = createCanvas(
					maskSource.width,
					maskSource.height
				);
				wrapped.getContext( '2d' ).drawImage( maskSource, 0, 0 );
				mask = blurCanvas( wrapped, layer.mask.feather * env.scale );
			}
			worldTransform();
			ctx.globalCompositeOperation = layer.mask.inverted
				? 'destination-out'
				: 'destination-in';
			const anchor = layer.mask.anchor;
			if ( anchor && 'stroke' !== layer.type && ! layer.quad ) {
				// Linked mask (v1.27): map the mask region that was under the
				// layer at mask time (anchor) onto the layer's local content and
				// apply the SAME transform as the content, so the mask follows
				// move / resize / scale / rotate / flip.
				const cx = layer.x + layer.w / 2;
				const cy = layer.y + layer.h / 2;
				ctx.translate( cx, cy );
				if ( layer.rot ) {
					ctx.rotate( ( layer.rot * Math.PI ) / 180 );
				}
				if ( layer.flipX || layer.flipY ) {
					ctx.scale( layer.flipX ? -1 : 1, layer.flipY ? -1 : 1 );
				}
				ctx.translate( -layer.w / 2, -layer.h / 2 );
				ctx.drawImage(
					mask,
					anchor.x,
					anchor.y,
					anchor.w,
					anchor.h,
					0,
					0,
					layer.w,
					layer.h
				);
			} else {
				// Legacy / stroke / free-transform masks stay in doc space.
				ctx.drawImage( mask, 0, 0, env.doc.w, env.doc.h );
			}
			ctx.globalCompositeOperation = 'source-over';
		}
	}

	// Live effect preview (v1.0.5): the effect dialog patches a transient
	// previewEffect onto the layer, applied here at device scale, exactly
	// like Smart Filters, so the canvas shows the result before Apply.
	if ( layer.previewEffect ) {
		const previewFx = effectById( layer.previewEffect.id );
		if ( previewFx && canvas.width && canvas.height ) {
			const pctx = canvas.getContext( '2d' );
			const pdata = pctx.getImageData(
				0,
				0,
				canvas.width,
				canvas.height
			);
			previewFx.apply(
				{
					data: pdata.data,
					width: canvas.width,
					height: canvas.height,
				},
				scaleEffectParams(
					layer.previewEffect.id,
					layer.previewEffect.params,
					env.scale
				)
			);
			pctx.putImageData( pdata, 0, 0 );
		}
	}

	const styled = layer.styles
		? applyLayerStyles( canvas, layer, env.scale )
		: canvas;
	return { canvas: styled, x: bounds.x, y: bounds.y };
}

export function groupDeviceBounds( layer, env ) {
	const children = ( layer.children || [] )
		.map( ( id ) => env.layers.find( ( l ) => l.id === id ) )
		.filter( Boolean );
	let box = null;
	for ( const child of children ) {
		if ( ! child.visible ) {
			continue;
		}
		const b =
			'group' === child.type
				? groupDeviceBounds( child, env )
				: layerDeviceBounds( child, env );
		if ( ! b ) {
			continue;
		}
		box = box
			? {
					x: Math.min( box.x, b.x ),
					y: Math.min( box.y, b.y ),
					w:
						Math.max( box.x + box.w, b.x + b.w ) -
						Math.min( box.x, b.x ),
					h:
						Math.max( box.y + box.h, b.y + b.h ) -
						Math.min( box.y, b.y ),
			  }
			: b;
	}
	// Group layer styles (v1.118) paint outside the children union: pad
	// the scratch like layerDeviceBounds does, clamped to the viewport.
	if ( box && layer.styles ) {
		const pad = Math.ceil( stylesPadding( layer ) * env.scale );
		if ( pad > 0 ) {
			const vw = env.viewport.w * env.scale;
			const vh = env.viewport.h * env.scale;
			const x0 = Math.max( 0, box.x - pad );
			const y0 = Math.max( 0, box.y - pad );
			box = {
				x: x0,
				y: y0,
				w: Math.min( vw, box.x + box.w + pad ) - x0,
				h: Math.min( vh, box.y + box.h + pad ) - y0,
			};
		}
	}
	return box;
}

/**
 * Merged adjustments from clip adjustment layers directly above (spec 02.2).
 * @param layer
 * @param env
 */
export function mergeClipAdjust( layer, env ) {
	const idx = env.layers.indexOf( layer );
	let merged = layer.adjust ? { ...layer.adjust } : null;
	for ( let i = idx + 1; i < env.layers.length; i++ ) {
		const above = env.layers[ i ];
		if (
			'adjustment' !== above.type ||
			! above.clip ||
			above.parent !== layer.parent
		) {
			break;
		}
		if ( above.visible && above.adjust ) {
			merged = merged || {};
			for ( const [ key, value ] of Object.entries( above.adjust ) ) {
				merged[ key ] = ( merged[ key ] || 0 ) + value;
			}
		}
	}
	return merged;
}

/* ------------------------------- composite ----------------------------- */

export function compositeLayers( mainCtx, layerList, env ) {
	let lastBase = null; // previous non-clipped rendered layer (clipping base)
	// Prefix-cache repaints start mid-stack: resolve the clipping base from
	// the layers below the slice, lazily and only once (v1.11.2).
	let clipSeed = env.clipSeed || null;
	const seedClipBase = () => {
		const seed = clipSeed;
		clipSeed = null;
		for ( let i = seed.length - 1; i >= 0; i-- ) {
			const below = seed[ i ];
			if (
				! below ||
				! below.visible ||
				below.clipped ||
				'adjustment' === below.type ||
				( 'stroke' === below.type && below.erase )
			) {
				continue;
			}
			const base = renderLayerToDevice( below, env );
			if ( base ) {
				lastBase = base;
				return;
			}
		}
	};
	for ( const layer of layerList ) {
		if ( ! layer || ! layer.visible ) {
			continue;
		}
		if ( 'adjustment' === layer.type ) {
			if ( ! layer.clip ) {
				applyAdjustmentToAccumulated( mainCtx, layer );
			}
			continue; // clip variants were merged into the layer below.
		}
		const offset = env.deviceOffset || { x: 0, y: 0 };
		if ( 'stroke' === layer.type && layer.erase ) {
			const rendered = renderLayerToDevice(
				{ ...layer, erase: false },
				env
			);
			if ( rendered ) {
				mainCtx.globalCompositeOperation = 'destination-out';
				mainCtx.globalAlpha = layer.opacity ?? 1;
				mainCtx.drawImage(
					rendered.canvas,
					rendered.x - offset.x,
					rendered.y - offset.y
				);
				mainCtx.globalCompositeOperation = 'source-over';
				mainCtx.globalAlpha = 1;
			}
			continue;
		}
		const rendered = renderLayerToDevice( layer, env );
		if ( ! rendered ) {
			continue;
		}
		// Clipping mask: restrict to the alpha of the base layer below
		// (spec 06.1). destination-in against the base's silhouette.
		if ( layer.clipped && ! lastBase && clipSeed ) {
			seedClipBase();
		}
		if ( layer.clipped && lastBase ) {
			const clippedCanvas = createCanvas(
				rendered.canvas.width,
				rendered.canvas.height
			);
			const cctx = clippedCanvas.getContext( '2d' );
			cctx.drawImage( rendered.canvas, 0, 0 );
			cctx.globalCompositeOperation = 'destination-in';
			cctx.drawImage(
				lastBase.canvas,
				lastBase.x - rendered.x,
				lastBase.y - rendered.y
			);
			rendered.canvas = clippedCanvas;
		} else if ( ! layer.clipped ) {
			lastBase = rendered;
		}
		mainCtx.globalAlpha = layer.opacity ?? 1;
		mainCtx.globalCompositeOperation = blendToComposite( layer.blend );
		mainCtx.drawImage(
			rendered.canvas,
			rendered.x - offset.x,
			rendered.y - offset.y
		);
		mainCtx.globalAlpha = 1;
		mainCtx.globalCompositeOperation = 'source-over';
	}
}

/**
 * Non-clip adjustment layer: re-process everything below it (spec 05.2).
 * @param mainCtx
 * @param layer
 */
export function applyAdjustmentToAccumulated( mainCtx, layer ) {
	const canvas = mainCtx.canvas;
	const css = filterCssFor( layer );
	if ( ! css ) {
		return;
	}
	if ( supportsCtxFilter() ) {
		const snapshot = createCanvas( canvas.width, canvas.height );
		snapshot.getContext( '2d' ).drawImage( canvas, 0, 0 );
		mainCtx.save();
		mainCtx.setTransform( 1, 0, 0, 1, 0, 0 );
		mainCtx.globalCompositeOperation = 'copy';
		mainCtx.filter = css;
		mainCtx.drawImage( snapshot, 0, 0 );
		mainCtx.restore();
	} else {
		const data = mainCtx.getImageData( 0, 0, canvas.width, canvas.height );
		cssFilterPixels(
			{ data: data.data, width: canvas.width, height: canvas.height },
			css
		);
		mainCtx.putImageData( data, 0, 0 );
	}
}

/* --------------------------------- API --------------------------------- */

/**
 * Synchronous composite into a prepared canvas context. The image cache must
 * be warm (`ImageCache#warm`), the async wrappers below handle that.
 *
 * @param {CanvasRenderingContext2D} ctx    Target context (device-sized).
 * @param {Object}                   doc    Document.
 * @param {Array}                    layers Flat layer array (bottom→top).
 * @param {Object}                   opts   { scale, viewport, cache, clearColor }.
 */
export function renderSync( ctx, doc, layers, opts = {} ) {
	const env = {
		doc,
		// Child/adjacency lookups (group children, clip adjustments) resolve
		// against `allLayers` when the paint list is only a top-level slice
		// (prefix cache), otherwise groups in the slice render empty (v1.4).
		layers: opts.allLayers || layers,
		scale: opts.scale || 1,
		viewport: opts.viewport || { x: 0, y: 0, w: doc.w, h: doc.h },
		cache: opts.cache || defaultCache,
	};
	const width = Math.ceil( env.viewport.w * env.scale );
	const height = Math.ceil( env.viewport.h * env.scale );

	ctx.save();
	ctx.setTransform( 1, 0, 0, 1, 0, 0 );
	ctx.clearRect( 0, 0, width, height );

	// Everything clips to the document bounds, layers larger than the
	// canvas must not spill onto the pasteboard (viewport rendering).
	// The editor's reveal-pasteboard view (v1.379.1) lifts the clip so
	// parked layers show around the frame; export paths never set it.
	const docX = -env.viewport.x * env.scale;
	const docY = -env.viewport.y * env.scale;
	const docW = doc.w * env.scale;
	const docH = doc.h * env.scale;
	if ( ! opts.revealPasteboard ) {
		ctx.beginPath();
		ctx.rect( docX, docY, docW, docH );
		ctx.clip();
	}

	if ( doc.bg && 'transparent' !== doc.bg ) {
		ctx.fillStyle = doc.bg;
		ctx.fillRect( docX, docY, docW, docH );
	}
	const topLevel = layers.filter( ( l ) => ! l.parent );
	if ( opts.base?.canvas ) {
		// Prefix cache (v0.7): pre-composited layers below the active one.
		// Clipped layers in the repaint slice still need their base layer
		// from the prefix, hand it over for lazy seeding (v1.11.2).
		ctx.drawImage( opts.base.canvas, 0, 0 );
		compositeLayers( ctx, topLevel.slice( opts.base.fromIndex || 0 ), {
			...env,
			clipSeed: topLevel.slice( 0, opts.base.fromIndex || 0 ),
		} );
	} else {
		compositeLayers( ctx, topLevel, env );
	}
	ctx.restore();
}

/**
 * Render the full document (or a region) to a new canvas, THE export path
 * and the preview path in one (spec 07.3).
 *
 * @param {Object} doc    Document.
 * @param {Array}  layers Layers.
 * @param {Object} opts   { scale = 1, viewport?, cache? }.
 * @return {Promise<HTMLCanvasElement>} Rendered canvas.
 */
export async function renderToCanvas( doc, layers, opts = {} ) {
	const cache = opts.cache || defaultCache;
	await cache.warm( layers );
	const viewport = opts.viewport || { x: 0, y: 0, w: doc.w, h: doc.h };
	const scale = opts.scale || 1;
	const canvas = createCanvas( viewport.w * scale, viewport.h * scale );
	renderSync( canvas.getContext( '2d' ), doc, layers, {
		...opts,
		cache,
		viewport,
		scale,
	} );
	return canvas;
}

export async function renderToBlob(
	doc,
	layers,
	{ scale = 1, format = 'png', quality = 90, cache, postProcess } = {}
) {
	let canvas = await renderToCanvas( doc, layers, { scale, cache } );
	if ( postProcess ) {
		canvas = postProcess( canvas ) || canvas;
	}
	const mime =
		'jpeg' === format || 'jpg' === format
			? 'image/jpeg'
			: 'webp' === format
			? 'image/webp'
			: 'avif' === format
			? 'image/avif'
			: 'image/png';
	return new Promise( ( resolve, reject ) =>
		canvas.toBlob(
			( blob ) =>
				blob
					? resolve( blob )
					: reject( new Error( 'Rendering failed' ) ),
			mime,
			Math.min( 1, Math.max( 0.1, quality / 100 ) )
		)
	);
}

export async function renderToDataURL(
	doc,
	layers,
	{ scale = 1, format = 'png', quality = 90, cache } = {}
) {
	const canvas = await renderToCanvas( doc, layers, { scale, cache } );
	const mime =
		'jpeg' === format || 'jpg' === format
			? 'image/jpeg'
			: 'webp' === format
			? 'image/webp'
			: 'image/png';
	return canvas.toDataURL(
		mime,
		Math.min( 1, Math.max( 0.1, quality / 100 ) )
	);
}

/**
 * Composited color at a doc pixel (eyedropper, spec 05.4).
 * @param doc
 * @param layers
 * @param x
 * @param y
 * @param cache
 */
export async function samplePixel( doc, layers, x, y, cache ) {
	const canvas = await renderToCanvas( doc, layers, {
		cache,
		viewport: { x: Math.floor( x ), y: Math.floor( y ), w: 1, h: 1 },
		scale: 1,
	} );
	const [ r, g, b, a ] = canvas
		.getContext( '2d' )
		.getImageData( 0, 0, 1, 1 ).data;
	return { r, g, b, a };
}
