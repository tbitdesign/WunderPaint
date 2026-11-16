/**
 * Tiling for the AI upscaler (Real-ESRGAN general x4v3, 20.10.2026).
 *
 * The model upscales 4x and costs about 2.4 million operations per input
 * pixel; on one browser thread that is roughly a minute per megapixel. It
 * runs in tiles so the worker can report progress and stop between them,
 * and so memory stays small. Each tile is cut with a margin and only its
 * core is kept: the model's convolutions look a few pixels around, and
 * without the margin the seams would show.
 *
 * Pure functions, shared by esrgan.worker.js and the tests.
 */

/**
 * Input pixels per tile side, and the margin around each tile. The model
 * sees 34 px around a pixel (34 3x3 layers). Measured against upscaling
 * the whole picture at once (20.10.2026): a 10 px margin (Real-ESRGAN's own
 * default) left seams up to 19/255, 16 px up to 5, 24 px at most 1/255 for
 * about 5 % more time.
 */
export const TILE = 128;
export const PAD = 24;
export const SCALE = 4;

/**
 * Tiles covering a w x h picture: the core each tile keeps, and the padded
 * rectangle the model sees (clamped to the picture).
 *
 * @param {number} w    Width.
 * @param {number} h    Height.
 * @param {number} tile Core side.
 * @param {number} pad  Margin.
 * @return {Array<{x:number,y:number,w:number,h:number,px:number,py:number,pw:number,ph:number}>} Tiles.
 */
export function tilePlan( w, h, tile = TILE, pad = PAD ) {
	const tiles = [];
	for ( let y = 0; y < h; y += tile ) {
		for ( let x = 0; x < w; x += tile ) {
			const cw = Math.min( tile, w - x ),
				ch = Math.min( tile, h - y );
			const px = Math.max( 0, x - pad ),
				py = Math.max( 0, y - pad );
			const pw = Math.min( w, x + cw + pad ) - px,
				ph = Math.min( h, y + ch + pad ) - py;
			tiles.push( { x, y, w: cw, h: ch, px, py, pw, ph } );
		}
	}
	return tiles;
}

/**
 * The padded rectangle of an RGBA picture as the model's input: planar
 * RGB, 0..1.
 *
 * @param {Uint8ClampedArray} rgba Picture, w * h * 4.
 * @param {number}            w    Picture width.
 * @param {Object}            t    Tile from tilePlan().
 * @return {Float32Array} 3 * pw * ph.
 */
export function tileInput( rgba, w, t ) {
	const n = t.pw * t.ph;
	const out = new Float32Array( 3 * n );
	for ( let yy = 0; yy < t.ph; yy++ ) {
		let s = ( ( t.py + yy ) * w + t.px ) * 4;
		let d = yy * t.pw;
		for ( let xx = 0; xx < t.pw; xx++, s += 4, d++ ) {
			out[ d ] = rgba[ s ] / 255;
			out[ n + d ] = rgba[ s + 1 ] / 255;
			out[ 2 * n + d ] = rgba[ s + 2 ] / 255;
		}
	}
	return out;
}

/**
 * Write the core of one upscaled tile into the result (RGB, alpha 255).
 *
 * @param {Uint8ClampedArray} out    Result, (w*s) * (h*s) * 4.
 * @param {number}            outW   Result width (w * s).
 * @param {Float32Array}      planes Model output, 3 * (pw*s) * (ph*s).
 * @param {Object}            t      Tile from tilePlan().
 * @param {number}            s      Scale.
 */
export function stitchTile( out, outW, planes, t, s = SCALE ) {
	const tw = t.pw * s,
		th = t.ph * s;
	const n = tw * th;
	const ox = ( t.x - t.px ) * s,
		oy = ( t.y - t.py ) * s;
	const cw = t.w * s,
		ch = t.h * s;
	for ( let yy = 0; yy < ch; yy++ ) {
		let src = ( oy + yy ) * tw + ox;
		let dst = ( ( t.y * s + yy ) * outW + t.x * s ) * 4;
		for ( let xx = 0; xx < cw; xx++, src++, dst += 4 ) {
			out[ dst ] = planes[ src ] * 255;
			out[ dst + 1 ] = planes[ n + src ] * 255;
			out[ dst + 2 ] = planes[ 2 * n + src ] * 255;
			out[ dst + 3 ] = 255;
		}
	}
}

/**
 * Halve a picture by averaging 2 x 2 blocks (the 2x result from the 4x
 * one; averaging is the clean way down by exactly half).
 *
 * @param {Uint8ClampedArray} src RGBA, w * h * 4.
 * @param {number}            w   Width (even).
 * @param {number}            h   Height (even).
 * @return {Uint8ClampedArray} (w/2) * (h/2) * 4.
 */
export function halve( src, w, h ) {
	const hw = w >> 1,
		hh = h >> 1;
	const out = new Uint8ClampedArray( hw * hh * 4 );
	for ( let y = 0; y < hh; y++ ) {
		for ( let x = 0; x < hw; x++ ) {
			const a = ( 2 * y * w + 2 * x ) * 4,
				b = a + 4,
				c = a + w * 4,
				d = c + 4;
			const o = ( y * hw + x ) * 4;
			for ( let k = 0; k < 4; k++ ) {
				out[ o + k ] =
					( src[ a + k ] +
						src[ b + k ] +
						src[ c + k ] +
						src[ d + k ] +
						2 ) >>
					2;
			}
		}
	}
	return out;
}

/**
 * Upscale a picture 4x tile by tile with a model.
 *
 * @param {Uint8ClampedArray} rgba   Picture, w * h * 4.
 * @param {number}            w      Width.
 * @param {number}            h      Height.
 * @param {Function}          runner async ( input, pw, ph ) => Float32Array
 *                                   of 3 * (pw*4) * (ph*4).
 * @param {Object}            opts   { onTile( done, total ), stopped() }.
 * @return {Promise<Uint8ClampedArray|null>} 4w * 4h * 4, null when stopped.
 */
export async function upscaleTiles( rgba, w, h, runner, opts = {} ) {
	const tiles = tilePlan( w, h );
	const outW = w * SCALE;
	const out = new Uint8ClampedArray( outW * h * SCALE * 4 );
	for ( let i = 0; i < tiles.length; i++ ) {
		if ( opts.stopped?.() ) {
			return null;
		}
		const t = tiles[ i ];
		const planes = await runner( tileInput( rgba, w, t ), t.pw, t.ph );
		stitchTile( out, outW, planes, t );
		opts.onTile?.( i + 1, tiles.length );
	}
	return out;
}
