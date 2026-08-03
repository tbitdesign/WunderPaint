import { createCanvas } from './env';

// Procedural 8px fill patterns (F10, v0.5), cached per kind+color.
export const shapePatternCache = new Map();

/* Decoded user pattern tiles (v1.1): dataUrl → canvas, filled ahead of
   render by registerUserTile (UI selection, hydration). */
export const userTileCache = new Map();

/**
 * Decode a user pattern tile so sync renders can use it.
 *
 * @param {string} dataUrl Tile data URL.
 * @return {Promise<void>} Resolves when decoded.
 */
export function registerUserTile( dataUrl ) {
	if ( ! dataUrl || userTileCache.has( dataUrl ) ) {
		return Promise.resolve();
	}
	return new Promise( ( resolve ) => {
		const img = new window.Image();
		img.onload = () => {
			const tile = createCanvas( img.naturalWidth, img.naturalHeight );
			tile.getContext( '2d' ).drawImage( img, 0, 0 );
			userTileCache.set( dataUrl, tile );
			if ( userTileCache.size > 24 ) {
				const first = userTileCache.keys().next().value;
				userTileCache.delete( first );
			}
			resolve();
		};
		img.onerror = () => resolve();
		img.src = dataUrl;
	} );
}

/** Sync lookup for a decoded user tile (null while still decoding). */
export const userTile = ( dataUrl ) => userTileCache.get( dataUrl ) || null;

// Pattern fill scale (v1.111.0): pre-scaled tile variants, cached per
// source tile so repeated renders stay cheap.
export const scaledTiles = new WeakMap();

export function scaledTile( tile, factor ) {
	const s = Math.max( 0.05, Math.min( 8, Number( factor ) || 1 ) );
	if ( ! tile || Math.abs( s - 1 ) < 0.001 ) {
		return tile;
	}
	let per = scaledTiles.get( tile );
	if ( ! per ) {
		per = new Map();
		scaledTiles.set( tile, per );
	}
	const key = Math.round( s * 100 );
	if ( per.has( key ) ) {
		return per.get( key );
	}
	const out = createCanvas(
		Math.max( 1, Math.round( tile.width * s ) ),
		Math.max( 1, Math.round( tile.height * s ) )
	);
	const c = out.getContext( '2d' );
	c.imageSmoothingEnabled = true;
	c.imageSmoothingQuality = 'high';
	c.drawImage( tile, 0, 0, out.width, out.height );
	per.set( key, out );
	return out;
}

/** Test hook: seed a decoded tile synchronously (node-canvas). */
export const __seedUserTile = ( dataUrl, tile ) =>
	userTileCache.set( dataUrl, tile );

export function patternTile( kind, color ) {
	const key = kind + '|' + color;
	let tile = shapePatternCache.get( key );
	if ( ! tile ) {
		tile = createCanvas( 8, 8 );
		const p = tile.getContext( '2d' );
		p.fillStyle = color;
		p.strokeStyle = color;
		if ( 'dots' === kind ) {
			p.beginPath();
			p.arc( 2, 2, 1.6, 0, 2 * Math.PI );
			p.fill();
			p.beginPath();
			p.arc( 6, 6, 1.6, 0, 2 * Math.PI );
			p.fill();
		} else if ( 'stripes' === kind ) {
			p.lineWidth = 2.2;
			p.beginPath();
			p.moveTo( -2, 10 );
			p.lineTo( 10, -2 );
			p.moveTo( -2, 2 );
			p.lineTo( 2, -2 );
			p.moveTo( 6, 10 );
			p.lineTo( 10, 6 );
			p.stroke();
		} else if ( 'checker' === kind ) {
			p.fillRect( 0, 0, 4, 4 );
			p.fillRect( 4, 4, 4, 4 );
		} else if ( 'grid' === kind ) {
			p.lineWidth = 1;
			p.strokeRect( 0.5, 0.5, 8, 8 );
		} else if ( 'diagonal' === kind ) {
			p.lineWidth = 2.2;
			p.beginPath();
			p.moveTo( -2, -2 );
			p.lineTo( 10, 10 );
			p.moveTo( -2, 6 );
			p.lineTo( 2, 10 );
			p.moveTo( 6, -2 );
			p.lineTo( 10, 2 );
			p.stroke();
		} else if ( 'crosshatch' === kind ) {
			p.lineWidth = 1.2;
			p.beginPath();
			p.moveTo( -2, 10 );
			p.lineTo( 10, -2 );
			p.moveTo( -2, -2 );
			p.lineTo( 10, 10 );
			p.stroke();
		} else if ( 'zigzag' === kind ) {
			p.lineWidth = 1.6;
			p.beginPath();
			p.moveTo( 0, 6 );
			p.lineTo( 2, 2 );
			p.lineTo( 4, 6 );
			p.lineTo( 6, 2 );
			p.lineTo( 8, 6 );
			p.stroke();
		} else if ( 'waves' === kind ) {
			p.lineWidth = 1.4;
			p.beginPath();
			p.moveTo( 0, 4 );
			p.quadraticCurveTo( 2, 1, 4, 4 );
			p.quadraticCurveTo( 6, 7, 8, 4 );
			p.stroke();
		} else if ( 'bricks' === kind ) {
			p.lineWidth = 1;
			p.beginPath();
			p.moveTo( 0, 0.5 );
			p.lineTo( 8, 0.5 );
			p.moveTo( 0, 4.5 );
			p.lineTo( 8, 4.5 );
			p.moveTo( 4.5, 0 );
			p.lineTo( 4.5, 4 );
			p.moveTo( 0.5, 4 );
			p.lineTo( 0.5, 8 );
			p.stroke();
		} else if ( 'plus' === kind ) {
			p.fillRect( 3, 1, 2, 6 );
			p.fillRect( 1, 3, 6, 2 );
		} else if ( 'triangles' === kind ) {
			p.beginPath();
			p.moveTo( 0, 8 );
			p.lineTo( 4, 0 );
			p.lineTo( 8, 8 );
			p.closePath();
			p.fill();
		} else if ( 'scales' === kind ) {
			p.lineWidth = 1.2;
			p.beginPath();
			p.arc( 4, 0, 4, 0, Math.PI );
			p.stroke();
			p.beginPath();
			p.arc( 0, 4, 4, 0, Math.PI / 2 );
			p.stroke();
			p.beginPath();
			p.arc( 8, 4, 4, Math.PI / 2, Math.PI );
			p.stroke();
		}
		if ( shapePatternCache.size > 24 ) {
			shapePatternCache.clear();
		}
		shapePatternCache.set( key, tile );
	}
	return tile;
}

/**
 * A gradient spanning a w×h box (shared by text + shape gradient fills,
 * v1.23; kinds v1.24). `kind` = linear | radial | angle; `angle` in degrees
 * drives linear direction / conic start angle.
 */
export function gradientFillFor( ctx, w, h, stops, angle, kind ) {
	const ww = Math.max( 1, w || 1 );
	const hh = Math.max( 1, h || 1 );
	let grad;
	if ( 'radial' === kind ) {
		grad = ctx.createRadialGradient(
			ww / 2,
			hh / 2,
			0,
			ww / 2,
			hh / 2,
			Math.max( ww, hh ) / 2
		);
	} else if ( 'angle' === kind && ctx.createConicGradient ) {
		grad = ctx.createConicGradient(
			( ( angle || 0 ) * Math.PI ) / 180,
			ww / 2,
			hh / 2
		);
	} else {
		// Linear (and the fallback when conic gradients are unavailable).
		const rad = ( ( angle || 0 ) * Math.PI ) / 180;
		const dx = Math.cos( rad );
		const dy = Math.sin( rad );
		const len = ( Math.abs( dx ) * ww + Math.abs( dy ) * hh ) / 2;
		grad = ctx.createLinearGradient(
			ww / 2 - dx * len,
			hh / 2 - dy * len,
			ww / 2 + dx * len,
			hh / 2 + dy * len
		);
	}
	for ( const stop of stops ) {
		grad.addColorStop( Math.max( 0, Math.min( 1, stop.at ) ), stop.color );
	}
	return grad;
}
