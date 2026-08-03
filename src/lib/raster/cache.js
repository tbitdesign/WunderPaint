import { ensureFontsForLayers } from '../font-manager';
import { sizedSvgUrl } from '../svg-intrinsic';
import { registerUserTile } from './patterns';

/* ------------------------------ image cache --------------------------- */

export class ImageCache {
	constructor() {
		this.map = new Map();
		// src → in-flight load promise, so overlapping warm() calls share
		// one load instead of racing duplicate Images for the same URL.
		this.pending = new Map();
	}

	/**
	 * Load every image/smart src + serialized mask so renderSync stays sync.
	 * @param layers
	 */
	async warm( layers ) {
		const sources = [];
		// Custom pattern-fill tiles decode through their own cache
		// (userTileCache); without collecting them here a freshly
		// dispatched pattern layer painted its plain fill (white) until
		// something else happened to register the tile - the Pattern
		// Generator insert sat blank until the layer was moved (v1.287.1).
		const tiles = [];
		const collect = ( layer ) => {
			if ( layer.src ) {
				sources.push( layer.src );
			}
			if ( layer.dataUrl && ! layer.canvas ) {
				sources.push( layer.dataUrl );
			}
			if ( layer.patternData ) {
				tiles.push( layer.patternData );
			}
			if ( layer.styles?.patternOverlay?.patternData ) {
				tiles.push( layer.styles.patternOverlay.patternData );
			}
			if ( layer.rasterFallback && layer.useRasterFallback ) {
				sources.push( layer.rasterFallback );
			}
			if ( layer.textFX?.imageFill?.src ) {
				sources.push( layer.textFX.imageFill.src );
			}
			if (
				layer.mask &&
				'string' === typeof layer.mask.data &&
				layer.mask.data.startsWith( 'data:' )
			) {
				sources.push( layer.mask.data );
			}
		};
		layers.forEach( collect );
		// Google fonts must be resident before canvas text draws (v0.3).
		await ensureFontsForLayers( layers );
		await Promise.all( tiles.map( ( t ) => registerUserTile( t ) ) );
		await Promise.all(
			sources
				.filter( ( src ) => ! this.map.has( src ) )
				.map( ( src ) => {
					if ( ! this.pending.has( src ) ) {
						this.pending.set( src, this.load( src ) );
					}
					return this.pending.get( src );
				} )
		);
		return this;
	}

	/**
	 * Decode one source into the cache. Resolves either way: a failed load
	 * is remembered as null so it is not retried on every paint.
	 *
	 * SVGs without an intrinsic size are decoded from a sized copy, or
	 * drawImage() would guess a different raster size for every surface it
	 * paints into (unclickable layer, size drifting with the zoom).
	 *
	 * @param {string} src Image source.
	 * @return {Promise} Settles when the image is decoded or has failed.
	 */
	async load( src ) {
		const objectUrl = await sizedSvgUrl( src );
		return new Promise( ( resolve ) => {
			const img = new window.Image();
			img.crossOrigin = 'anonymous';
			const settle = ( value ) => {
				if ( objectUrl ) {
					// The decoded image keeps the document, the copy is done.
					window.URL.revokeObjectURL( objectUrl );
				}
				this.map.set( src, value );
				this.pending.delete( src );
				resolve();
			};
			img.onload = () => settle( img );
			img.onerror = () => settle( null );
			img.src = objectUrl || src;
		} );
	}

	get( src ) {
		return this.map.get( src ) || null;
	}

	set( src, img ) {
		this.map.set( src, img );
	}
}

export const defaultCache = new ImageCache();
