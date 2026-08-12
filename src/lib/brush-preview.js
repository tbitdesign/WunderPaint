/**
 * A rendered stroke preview for a brush tip.
 *
 * Cached by id and size, because the panel shows all 37 at once and they
 * never change. Lifted out of the menubar so the brush panel and the tip
 * dropdown draw the SAME thing - a second implementation would drift, and
 * a preview that lies about what the tip does is worse than none.
 */

import { getTip, isStampTip, stampTipStroke } from './brush-tips';
import { drawSoftRoundStroke } from './raster/styles';

const cache = {};

/**
 * The square tile every tip chooser paints: the brush panel's strip, the
 * menubar dropdown and its trigger button. One shared object rather than
 * three literals, because the cache key is built from these numbers - the
 * same tile drawn with a different `size` is a second entry that renders
 * a visibly different stroke in the other list.
 */
export const TIP_TILE = Object.freeze( { w: 34, h: 34, size: 6 } );

/**
 * @param {string} id    Tip id.
 * @param {Object} opts  { w, h, color, size } - all optional.
 * @return {string} A data URL of the preview.
 */
export function tipPreview( id, opts = {} ) {
	const w = opts.w || 62;
	const h = opts.h || 38;
	const color = opts.color || '#e6e8eb';
	const size = opts.size || 9;
	const key = id + ':' + w + 'x' + h + ':' + color + ':' + size;
	if ( cache[ key ] ) {
		return cache[ key ];
	}
	const c = document.createElement( 'canvas' );
	c.width = w;
	c.height = h;
	const ctx = c.getContext( '2d' );
	const pts = [];
	const pad = Math.max( 6, size * 0.9 );
	for ( let i = 0; i <= 26; i++ ) {
		const t = i / 26;
		pts.push( {
			x: pad + t * ( w - pad * 2 ),
			y: h / 2 + Math.sin( t * Math.PI * 1.7 ) * ( h * 0.24 ),
		} );
	}
	const path = { pts, size, color, opacity: 1, tip: id };
	if ( isStampTip( id ) ) {
		stampTipStroke( ctx, path );
	} else {
		const soft = getTip( id ).soft || 0;
		if ( soft > 0 ) {
			// The same feathered engine the canvas uses (v1.123).
			drawSoftRoundStroke( ctx, path, soft );
		} else {
			ctx.strokeStyle = color;
			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';
			ctx.beginPath();
			pts.forEach( ( p, i ) =>
				i ? ctx.lineTo( p.x, p.y ) : ctx.moveTo( p.x, p.y )
			);
			ctx.lineWidth = size;
			ctx.stroke();
		}
	}
	cache[ key ] = c.toDataURL();
	return cache[ key ];
}
