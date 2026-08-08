/**
 * Canvas painter for the tile engine. Pixel-exact sibling of the SVG
 * serializer: both consume the same tile shape list and draw every
 * shape at all wrap offsets, so the tile edge is seamless by
 * construction.
 */

import { tileShapes, expandPlaces, bgColor } from './pattern-core.js';

// Decoded stamp bitmaps by dataUrl. renderTile is synchronous, so the
// dialog awaits ensureStamp() once; later paints hit the cache.
const stampCache = new Map();

export function stampImage( dataUrl ) {
	return ( dataUrl && stampCache.get( dataUrl ) ) || null;
}

export function ensureStamp( dataUrl ) {
	if ( ! dataUrl ) {
		return Promise.resolve( null );
	}
	if ( stampCache.has( dataUrl ) ) {
		return Promise.resolve( stampCache.get( dataUrl ) );
	}
	return new Promise( ( resolve ) => {
		const img = new Image();
		img.onload = () => {
			stampCache.set( dataUrl, img );
			resolve( img );
		};
		img.onerror = () => resolve( null );
		img.src = dataUrl;
	} );
}

export function paintTile( ctx, P, cellPx ) {
	const { shapes, cols, rows } = tileShapes( P );
	const W = cols * cellPx;
	const H = rows * cellPx;
	const bg = bgColor( P );
	ctx.clearRect( 0, 0, W, H );
	if ( bg ) {
		ctx.fillStyle = bg;
		ctx.fillRect( 0, 0, W, H );
	}
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	const stamp = stampImage( P.stampData );
	for ( const s of shapes ) {
		if ( 'img' === s.kind ) {
			if ( ! stamp ) {
				continue;
			}
			const aspect = stamp.height / Math.max( 1, stamp.width );
			const pad = s.s;
			ctx.globalAlpha = s.opacity;
			for ( let ox = -cols; ox <= cols; ox += cols ) {
				for ( let oy = -rows; oy <= rows; oy += rows ) {
					const x = s.x + ox;
					const y = s.y + oy;
					if (
						x + pad < 0 ||
						x - pad > cols ||
						y + pad < 0 ||
						y - pad > rows
					) {
						continue;
					}
					ctx.save();
					ctx.translate( x * cellPx, y * cellPx );
					ctx.rotate( s.rot || 0 );
					ctx.scale( s.fx ? -1 : 1, s.fy ? -1 : 1 );
					const w = s.s * cellPx;
					ctx.drawImage(
						stamp,
						-w / 2,
						( -w * aspect ) / 2,
						w,
						w * aspect
					);
					ctx.restore();
				}
			}
			continue;
		}
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;
		for ( const p of s.points ) {
			minX = Math.min( minX, p.x );
			maxX = Math.max( maxX, p.x );
			minY = Math.min( minY, p.y );
			maxY = Math.max( maxY, p.y );
		}
		const pad = ( s.width || 0 ) + 0.02;
		ctx.globalAlpha = s.opacity;
		for ( let ox = -cols; ox <= cols; ox += cols ) {
			for ( let oy = -rows; oy <= rows; oy += rows ) {
				if (
					maxX + ox + pad < 0 ||
					minX + ox - pad > cols ||
					maxY + oy + pad < 0 ||
					minY + oy - pad > rows
				) {
					continue;
				}
				ctx.beginPath();
				s.points.forEach( ( p, i ) => {
					const x = ( p.x + ox ) * cellPx;
					const y = ( p.y + oy ) * cellPx;
					if ( 0 === i ) {
						ctx.moveTo( x, y );
					} else {
						ctx.lineTo( x, y );
					}
				} );
				if ( s.closed ) {
					ctx.closePath();
				}
				if ( s.fill ) {
					ctx.fillStyle = s.fill;
					ctx.fill();
				} else {
					ctx.strokeStyle = s.color;
					const lw = Math.max( 0.4, s.width * cellPx );
					ctx.lineWidth = lw;
					if ( 'dash' === s.dash ) {
						ctx.setLineDash( [ lw * 3.2, lw * 2.4 ] );
					} else if ( 'dot' === s.dash ) {
						ctx.setLineDash( [ 0.5, lw * 2.6 ] );
					} else {
						ctx.setLineDash( [] );
					}
					ctx.stroke();
					ctx.setLineDash( [] );
				}
			}
		}
	}
	ctx.globalAlpha = 1;
}

/**
 * Render the repeat-unit tile to a fresh canvas. Transparent unless
 * the params define a background - pattern fills honor alpha.
 */
export function renderTile( P, cellPx ) {
	const { cols, rows } = expandPlaces( P.repeat );
	const c = document.createElement( 'canvas' );
	c.width = Math.max( 2, Math.round( cols * cellPx ) );
	c.height = Math.max( 2, Math.round( rows * cellPx ) );
	paintTile( c.getContext( '2d' ), P, cellPx );
	return c;
}
