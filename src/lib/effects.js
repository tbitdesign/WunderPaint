/**
 * The 11 extended pixel effects (spec 02.4) as DOM-free kernels operating on
 * `{ data: Uint8ClampedArray, width, height }` buffers, so they run in jsdom,
 * workers, the live preview and the export rasterizer, one implementation.
 */

import { __ } from '@wordpress/i18n';
import { hexToRgb } from './color';
import { decodeLutTable, sampleLut3d, sampleLut1d } from './cube-lut';
import { getExtensionEffect } from './extensions';

/* ------------------------------ helpers ------------------------------- */

/**
 * Separable box blur (one pass), radius in px; blurs RGBA incl. alpha.
 * @param img
 * @param radius
 */
function boxBlurPass( img, radius ) {
	const r = Math.max( 0, Math.round( radius ) );
	if ( ! r ) {
		return img;
	}
	const { width: w, height: h } = img;
	const src = img.data;
	const tmp = new Float32Array( src.length );
	const size = 2 * r + 1;

	// Horizontal.
	for ( let y = 0; y < h; y++ ) {
		const row = y * w * 4;
		const acc = [ 0, 0, 0, 0 ];
		for ( let x = -r; x <= r; x++ ) {
			const i = row + Math.min( w - 1, Math.max( 0, x ) ) * 4;
			for ( let c = 0; c < 4; c++ ) {
				acc[ c ] += src[ i + c ];
			}
		}
		for ( let x = 0; x < w; x++ ) {
			const o = row + x * 4;
			for ( let c = 0; c < 4; c++ ) {
				tmp[ o + c ] = acc[ c ] / size;
			}
			const addI = row + Math.min( w - 1, x + r + 1 ) * 4;
			const subI = row + Math.max( 0, x - r ) * 4;
			for ( let c = 0; c < 4; c++ ) {
				acc[ c ] += src[ addI + c ] - src[ subI + c ];
			}
		}
	}

	// Vertical.
	for ( let x = 0; x < w; x++ ) {
		const col = x * 4;
		const acc = [ 0, 0, 0, 0 ];
		for ( let y = -r; y <= r; y++ ) {
			const i = Math.min( h - 1, Math.max( 0, y ) ) * w * 4 + col;
			for ( let c = 0; c < 4; c++ ) {
				acc[ c ] += tmp[ i + c ];
			}
		}
		for ( let y = 0; y < h; y++ ) {
			const o = y * w * 4 + col;
			for ( let c = 0; c < 4; c++ ) {
				src[ o + c ] = acc[ c ] / size;
			}
			const addI = Math.min( h - 1, y + r + 1 ) * w * 4 + col;
			const subI = Math.max( 0, y - r ) * w * 4 + col;
			for ( let c = 0; c < 4; c++ ) {
				acc[ c ] += tmp[ addI + c ] - tmp[ subI + c ];
			}
		}
	}
	return img;
}

const luma = ( d, i ) =>
	0.2126 * d[ i ] + 0.7152 * d[ i + 1 ] + 0.0722 * d[ i + 2 ];

/**
 * Deterministic LCG so add-noise is testable/reproducible.
 * @param seed
 */
function lcg( seed ) {
	let s = seed >>> 0 || 1;
	return () => {
		s = ( s * 1664525 + 1013904223 ) >>> 0;
		return s / 4294967296;
	};
}

const clone = ( img ) => ( {
	data: new Uint8ClampedArray( img.data ),
	width: img.width,
	height: img.height,
} );

/* ------------------------------ kernels ------------------------------- */

export function gaussianBlur( img, { radius = 4 } = {} ) {
	// Three box passes approximate a Gaussian well (Kovesi).
	const r = Math.max( 0, radius );
	if ( ! r ) {
		return img;
	}
	const boxR = Math.max( 1, Math.round( r / 2 ) );
	boxBlurPass( img, boxR );
	boxBlurPass( img, boxR );
	boxBlurPass( img, Math.max( 1, Math.round( r / 3 ) ) );
	return img;
}

export function boxBlur( img, { radius = 4 } = {} ) {
	return boxBlurPass( img, radius );
}

export function sharpen( img, { amount = 100 } = {} ) {
	const a = amount / 100;
	if ( ! a ) {
		return img;
	}
	const { width: w, height: h } = img;
	const orig = new Uint8ClampedArray( img.data );
	const d = img.data;
	for ( let y = 1; y < h - 1; y++ ) {
		for ( let x = 1; x < w - 1; x++ ) {
			const i = ( y * w + x ) * 4;
			for ( let c = 0; c < 3; c++ ) {
				const center = orig[ i + c ];
				const lap =
					4 * center -
					orig[ i - 4 + c ] -
					orig[ i + 4 + c ] -
					orig[ i - w * 4 + c ] -
					orig[ i + w * 4 + c ];
				d[ i + c ] = center + a * lap * 0.5;
			}
		}
	}
	return img;
}

export function unsharpMask(
	img,
	{ radius = 2, amount = 100, threshold: cutoff = 0 } = {}
) {
	const a = amount / 100;
	if ( ! a || radius <= 0 ) {
		return img;
	}
	const blurred = gaussianBlur( clone( img ), { radius } );
	const d = img.data;
	const b = blurred.data;
	for ( let i = 0; i < d.length; i += 4 ) {
		for ( let c = 0; c < 3; c++ ) {
			const diff = d[ i + c ] - b[ i + c ];
			if ( Math.abs( diff ) > cutoff ) {
				d[ i + c ] = d[ i + c ] + diff * a;
			}
		}
	}
	return img;
}

export function addNoise(
	img,
	{ amount = 12, monochrome = false, seed = 1, size = 1 } = {}
) {
	const rand = lcg( seed );
	const strength = ( amount / 100 ) * 127;
	const d = img.data;
	const grain = Math.max( 1, Math.round( size ) );
	if ( 1 === grain ) {
		for ( let i = 0; i < d.length; i += 4 ) {
			if ( monochrome ) {
				const n = ( rand() * 2 - 1 ) * strength;
				d[ i ] += n;
				d[ i + 1 ] += n;
				d[ i + 2 ] += n;
			} else {
				d[ i ] += ( rand() * 2 - 1 ) * strength;
				d[ i + 1 ] += ( rand() * 2 - 1 ) * strength;
				d[ i + 2 ] += ( rand() * 2 - 1 ) * strength;
			}
		}
		return img;
	}
	// Film-grain mode (v0.4): noise generated on a coarser grid so the
	// grain has visible size instead of per-pixel salt.
	const { width: w, height: h } = img;
	const gw = Math.ceil( w / grain );
	const gh = Math.ceil( h / grain );
	const cells = new Float32Array( gw * gh * 3 );
	for ( let p = 0; p < gw * gh; p++ ) {
		const n = ( rand() * 2 - 1 ) * strength;
		cells[ p * 3 ] = n;
		cells[ p * 3 + 1 ] = monochrome ? n : ( rand() * 2 - 1 ) * strength;
		cells[ p * 3 + 2 ] = monochrome ? n : ( rand() * 2 - 1 ) * strength;
	}
	for ( let y = 0; y < h; y++ ) {
		const gy = ( y / grain ) | 0;
		for ( let x = 0; x < w; x++ ) {
			const p = ( gy * gw + ( ( x / grain ) | 0 ) ) * 3;
			const i = ( y * w + x ) * 4;
			if ( monochrome ) {
				d[ i ] += cells[ p ];
				d[ i + 1 ] += cells[ p ];
				d[ i + 2 ] += cells[ p ];
			} else {
				d[ i ] += cells[ p ];
				d[ i + 1 ] += cells[ p + 1 ];
				d[ i + 2 ] += cells[ p + 2 ];
			}
		}
	}
	return img;
}

export function pixelate( img, { cell = 8 } = {} ) {
	const size = Math.max( 1, Math.round( cell ) );
	if ( 1 === size ) {
		return img;
	}
	const { width: w, height: h } = img;
	const d = img.data;
	for ( let cy = 0; cy < h; cy += size ) {
		for ( let cx = 0; cx < w; cx += size ) {
			const acc = [ 0, 0, 0, 0 ];
			let count = 0;
			for ( let y = cy; y < Math.min( cy + size, h ); y++ ) {
				for ( let x = cx; x < Math.min( cx + size, w ); x++ ) {
					const i = ( y * w + x ) * 4;
					for ( let c = 0; c < 4; c++ ) {
						acc[ c ] += d[ i + c ];
					}
					count++;
				}
			}
			for ( let y = cy; y < Math.min( cy + size, h ); y++ ) {
				for ( let x = cx; x < Math.min( cx + size, w ); x++ ) {
					const i = ( y * w + x ) * 4;
					for ( let c = 0; c < 4; c++ ) {
						d[ i + c ] = acc[ c ] / count;
					}
				}
			}
		}
	}
	return img;
}

export function posterize( img, { levels: levelCount = 6 } = {} ) {
	const n = Math.min( 32, Math.max( 2, Math.round( levelCount ) ) );
	const step = 255 / ( n - 1 );
	const d = img.data;
	for ( let i = 0; i < d.length; i += 4 ) {
		for ( let c = 0; c < 3; c++ ) {
			d[ i + c ] = Math.round( d[ i + c ] / step ) * step;
		}
	}
	return img;
}

export function threshold( img, { level = 128 } = {} ) {
	const d = img.data;
	for ( let i = 0; i < d.length; i += 4 ) {
		const v = luma( d, i ) >= level ? 255 : 0;
		d[ i ] = v;
		d[ i + 1 ] = v;
		d[ i + 2 ] = v;
	}
	return img;
}

export function invert( img ) {
	const d = img.data;
	for ( let i = 0; i < d.length; i += 4 ) {
		d[ i ] = 255 - d[ i ];
		d[ i + 1 ] = 255 - d[ i + 1 ];
		d[ i + 2 ] = 255 - d[ i + 2 ];
	}
	return img;
}

export function gamma( img, { value = 1.0 } = {} ) {
	const g = Math.min( 3, Math.max( 0.1, value ) );
	if ( 1 === g ) {
		return img;
	}
	const lut = new Uint8ClampedArray( 256 );
	for ( let v = 0; v < 256; v++ ) {
		lut[ v ] = 255 * Math.pow( v / 255, 1 / g );
	}
	const d = img.data;
	for ( let i = 0; i < d.length; i += 4 ) {
		d[ i ] = lut[ d[ i ] ];
		d[ i + 1 ] = lut[ d[ i + 1 ] ];
		d[ i + 2 ] = lut[ d[ i + 2 ] ];
	}
	return img;
}

export function duotone(
	img,
	{ shadow = '#1a1d21', highlight = '#f0f0f1' } = {}
) {
	const s = hexToRgb( shadow );
	const hl = hexToRgb( highlight );
	const d = img.data;
	for ( let i = 0; i < d.length; i += 4 ) {
		const t = luma( d, i ) / 255;
		d[ i ] = s.r + ( hl.r - s.r ) * t;
		d[ i + 1 ] = s.g + ( hl.g - s.g ) * t;
		d[ i + 2 ] = s.b + ( hl.b - s.b ) * t;
	}
	return img;
}

/* --------------------------- v0.4 effects ------------------------------ */

const smoothstep = ( t ) => {
	const c = Math.min( 1, Math.max( 0, t ) );
	return c * c * ( 3 - 2 * c );
};

export function vignette(
	img,
	{ amount = 40, size = 55, softness = 50 } = {}
) {
	const a = amount / 100;
	if ( ! a ) {
		return img;
	}
	const { width: w, height: h } = img;
	const d = img.data;
	const cx = w / 2;
	const cy = h / 2;
	const maxDist = Math.hypot( cx, cy );
	const start = ( size / 100 ) * maxDist;
	const span = Math.max( 1, ( softness / 100 ) * maxDist );
	for ( let y = 0; y < h; y++ ) {
		for ( let x = 0; x < w; x++ ) {
			const t = smoothstep(
				( Math.hypot( x - cx, y - cy ) - start ) / span
			);
			if ( ! t ) {
				continue;
			}
			const i = ( y * w + x ) * 4;
			const f = t * Math.abs( a );
			if ( a > 0 ) {
				d[ i ] *= 1 - f;
				d[ i + 1 ] *= 1 - f;
				d[ i + 2 ] *= 1 - f;
			} else {
				d[ i ] += ( 255 - d[ i ] ) * f;
				d[ i + 1 ] += ( 255 - d[ i + 1 ] ) * f;
				d[ i + 2 ] += ( 255 - d[ i + 2 ] ) * f;
			}
		}
	}
	return img;
}

export function tiltShift( img, { center = 50, band = 30, radius = 12 } = {} ) {
	if ( radius <= 0 ) {
		return img;
	}
	const { width: w, height: h } = img;
	const blurred = gaussianBlur( clone( img ), { radius } );
	const d = img.data;
	const b = blurred.data;
	const cy = ( center / 100 ) * h;
	const half = Math.max( 1, ( band / 200 ) * h );
	for ( let y = 0; y < h; y++ ) {
		const t = smoothstep( ( Math.abs( y - cy ) - half ) / half );
		if ( ! t ) {
			continue;
		}
		for ( let x = 0; x < w; x++ ) {
			const i = ( y * w + x ) * 4;
			d[ i ] += ( b[ i ] - d[ i ] ) * t;
			d[ i + 1 ] += ( b[ i + 1 ] - d[ i + 1 ] ) * t;
			d[ i + 2 ] += ( b[ i + 2 ] - d[ i + 2 ] ) * t;
		}
	}
	return img;
}

export function colorSplash( img, { hue = 0, range = 30 } = {} ) {
	const d = img.data;
	for ( let i = 0; i < d.length; i += 4 ) {
		const r = d[ i ] / 255;
		const g = d[ i + 1 ] / 255;
		const bl = d[ i + 2 ] / 255;
		const max = Math.max( r, g, bl );
		const min = Math.min( r, g, bl );
		const delta = max - min;
		let hh = 0;
		if ( delta ) {
			if ( max === r ) {
				hh = 60 * ( ( ( g - bl ) / delta + 6 ) % 6 );
			} else if ( max === g ) {
				hh = 60 * ( ( bl - r ) / delta + 2 );
			} else {
				hh = 60 * ( ( r - g ) / delta + 4 );
			}
		}
		let dist = Math.abs( hh - hue );
		if ( dist > 180 ) {
			dist = 360 - dist;
		}
		const sat = max ? delta / max : 0;
		let keep =
			dist <= range
				? 1
				: dist <= range * 1.5
				? 1 - ( dist - range ) / ( range * 0.5 )
				: 0;
		keep *= Math.min( 1, sat * 4 );
		if ( keep >= 1 ) {
			continue;
		}
		const l = luma( d, i );
		d[ i ] += ( l - d[ i ] ) * ( 1 - keep );
		d[ i + 1 ] += ( l - d[ i + 1 ] ) * ( 1 - keep );
		d[ i + 2 ] += ( l - d[ i + 2 ] ) * ( 1 - keep );
	}
	return img;
}

export function halftone( img, { cell = 8, angle = 45 } = {} ) {
	const size = Math.max( 2, Math.round( cell ) );
	const { width: w, height: h } = img;
	const src = new Uint8ClampedArray( img.data );
	const d = img.data;
	const rad = ( angle * Math.PI ) / 180;
	const cos = Math.cos( rad );
	const sin = Math.sin( rad );
	const rMax = size * 0.75;
	for ( let y = 0; y < h; y++ ) {
		for ( let x = 0; x < w; x++ ) {
			// Rotate into grid space, find the cell center, rotate back.
			const qx = x * cos + y * sin;
			const qy = -x * sin + y * cos;
			const ccx = ( Math.floor( qx / size ) + 0.5 ) * size;
			const ccy = ( Math.floor( qy / size ) + 0.5 ) * size;
			const px = Math.round( ccx * cos - ccy * sin );
			const py = Math.round( ccx * sin + ccy * cos );
			const sx = Math.min( w - 1, Math.max( 0, px ) );
			const sy = Math.min( h - 1, Math.max( 0, py ) );
			const lum = luma( src, ( sy * w + sx ) * 4 ) / 255;
			// Sub-half-pixel dots are dropped (also guards float luma ≈ 1).
			const rDot = ( 1 - lum ) * rMax;
			const i = ( y * w + x ) * 4;
			const v =
				rDot >= 0.5 && Math.hypot( qx - ccx, qy - ccy ) < rDot
					? 0
					: 255;
			d[ i ] = v;
			d[ i + 1 ] = v;
			d[ i + 2 ] = v;
		}
	}
	return img;
}

export function glitch(
	img,
	{ shift = 6, scanlines = 30, blocks = 30, seed = 7 } = {}
) {
	const { width: w, height: h } = img;
	const rand = lcg( seed );
	const src = new Uint8ClampedArray( img.data );
	const d = img.data;
	const sh = Math.round( shift );
	const rowOffset = new Int16Array( h );
	if ( blocks > 0 ) {
		let y = 0;
		while ( y < h ) {
			const bandH = 2 + Math.floor( rand() * 10 );
			const off =
				rand() < 0.35
					? Math.round(
							( rand() * 2 - 1 ) * ( blocks / 100 ) * w * 0.15
					  )
					: 0;
			for ( let k = y; k < Math.min( h, y + bandH ); k++ ) {
				rowOffset[ k ] = off;
			}
			y += bandH;
		}
	}
	const clampX = ( x ) => Math.min( w - 1, Math.max( 0, x ) );
	for ( let y = 0; y < h; y++ ) {
		const off = rowOffset[ y ];
		const row = y * w;
		const dark = scanlines && y % 2 ? 1 - ( scanlines / 100 ) * 0.5 : 1;
		for ( let x = 0; x < w; x++ ) {
			const i = ( row + x ) * 4;
			const bx = clampX( x + off );
			d[ i ] = src[ ( row + clampX( bx - sh ) ) * 4 ] * dark;
			d[ i + 1 ] = src[ ( row + bx ) * 4 + 1 ] * dark;
			d[ i + 2 ] = src[ ( row + clampX( bx + sh ) ) * 4 + 2 ] * dark;
			d[ i + 3 ] = src[ ( row + bx ) * 4 + 3 ];
		}
	}
	return img;
}

export function glow( img, { radius = 12, intensity = 60 } = {} ) {
	const t = intensity / 100;
	if ( ! t || radius <= 0 ) {
		return img;
	}
	const blurred = gaussianBlur( clone( img ), { radius } );
	const d = img.data;
	const b = blurred.data;
	for ( let i = 0; i < d.length; i += 4 ) {
		for ( let c = 0; c < 3; c++ ) {
			const screen =
				255 - ( ( 255 - d[ i + c ] ) * ( 255 - b[ i + c ] ) ) / 255;
			d[ i + c ] += ( screen - d[ i + c ] ) * t;
		}
	}
	return img;
}

export function emboss( img, { strength = 100 } = {} ) {
	const s = strength / 100;
	const { width: w, height: h } = img;
	const src = new Uint8ClampedArray( img.data );
	const d = img.data;
	for ( let y = 0; y < h; y++ ) {
		for ( let x = 0; x < w; x++ ) {
			const x0 = Math.max( 0, x - 1 );
			const y0 = Math.max( 0, y - 1 );
			const x1 = Math.min( w - 1, x + 1 );
			const y1 = Math.min( h - 1, y + 1 );
			const v =
				128 +
				( luma( src, ( y1 * w + x1 ) * 4 ) -
					luma( src, ( y0 * w + x0 ) * 4 ) ) *
					s;
			const i = ( y * w + x ) * 4;
			d[ i ] = v;
			d[ i + 1 ] = v;
			d[ i + 2 ] = v;
		}
	}
	return img;
}

export function edgeDetect( img, { strength = 100 } = {} ) {
	const s = strength / 100;
	const { width: w, height: h } = img;
	const src = img.data;
	const g = new Float32Array( w * h );
	for ( let p = 0, i = 0; p < w * h; p++, i += 4 ) {
		g[ p ] = luma( src, i );
	}
	const d = img.data;
	for ( let y = 0; y < h; y++ ) {
		for ( let x = 0; x < w; x++ ) {
			const i = ( y * w + x ) * 4;
			if ( ! x || ! y || x === w - 1 || y === h - 1 ) {
				d[ i ] = 0;
				d[ i + 1 ] = 0;
				d[ i + 2 ] = 0;
				continue;
			}
			const p = y * w + x;
			const gx =
				-g[ p - w - 1 ] -
				2 * g[ p - 1 ] -
				g[ p + w - 1 ] +
				g[ p - w + 1 ] +
				2 * g[ p + 1 ] +
				g[ p + w + 1 ];
			const gy =
				-g[ p - w - 1 ] -
				2 * g[ p - w ] -
				g[ p - w + 1 ] +
				g[ p + w - 1 ] +
				2 * g[ p + w ] +
				g[ p + w + 1 ];
			const v = Math.hypot( gx, gy ) * s * 0.5;
			d[ i ] = v;
			d[ i + 1 ] = v;
			d[ i + 2 ] = v;
		}
	}
	return img;
}

// Decoded-table cache: base64 → Float32Array (LUTs are ~100KB–1.5MB).
const lutTableCache = new Map();

export function lut3d( img, { table = null, intensity = 100 } = {} ) {
	if ( ! table || ! table.data || ! table.size ) {
		return img;
	}
	const t = intensity / 100;
	if ( ! t ) {
		return img;
	}
	let f32 = lutTableCache.get( table.data );
	if ( ! f32 ) {
		f32 = decodeLutTable( table );
		if ( lutTableCache.size > 3 ) {
			lutTableCache.clear();
		}
		lutTableCache.set( table.data, f32 );
	}
	const sample = table.is1D ? sampleLut1d : sampleLut3d;
	const d = img.data;
	for ( let i = 0; i < d.length; i += 4 ) {
		const [ r, g, b ] = sample(
			f32,
			table.size,
			d[ i ] / 255,
			d[ i + 1 ] / 255,
			d[ i + 2 ] / 255
		);
		d[ i ] += ( r * 255 - d[ i ] ) * t;
		d[ i + 1 ] += ( g * 255 - d[ i + 1 ] ) * t;
		d[ i + 2 ] += ( b * 255 - d[ i + 2 ] ) * t;
	}
	return img;
}

/* ---------------------- photo finish (v1.0) ---------------------------- */

export function shadowsHighlights( img, { shadows = 0, highlights = 0 } = {} ) {
	if ( ! shadows && ! highlights ) {
		return img;
	}
	const d = img.data;
	const sh = shadows / 100;
	const hi = highlights / 100;
	for ( let i = 0; i < d.length; i += 4 ) {
		const l = luma( d, i ) / 255;
		const ws = ( 1 - l ) * ( 1 - l );
		const wh = l * l;
		for ( let c = 0; c < 3; c++ ) {
			let v = d[ i + c ];
			// Lift/deepen shadows toward white/black, weighted by darkness.
			v += sh * ws * ( sh > 0 ? 255 - v : v ) * 0.7;
			// Recover/boost highlights, weighted by brightness.
			v += hi * wh * ( hi > 0 ? 255 - v : v ) * 0.7;
			d[ i + c ] = v;
		}
	}
	return img;
}

export function denoise( img, { strength = 1 } = {} ) {
	const passes = Math.min( 3, Math.max( 1, Math.round( strength ) ) );
	const { width: w, height: h } = img;
	const win = new Array( 9 );
	for ( let pass = 0; pass < passes; pass++ ) {
		const src = new Uint8ClampedArray( img.data );
		const d = img.data;
		for ( let y = 1; y < h - 1; y++ ) {
			for ( let x = 1; x < w - 1; x++ ) {
				const i = ( y * w + x ) * 4;
				for ( let c = 0; c < 3; c++ ) {
					let n = 0;
					for ( let dy = -1; dy <= 1; dy++ ) {
						for ( let dx = -1; dx <= 1; dx++ ) {
							win[ n++ ] = src[ i + ( dy * w + dx ) * 4 + c ];
						}
					}
					win.sort( ( a, b ) => a - b );
					d[ i + c ] = win[ 4 ];
				}
			}
		}
	}
	return img;
}

/* ------------------------ auto corrections (v0.7) ---------------------- */

/** Per-channel histogram with 0..255 bins. */
function channelHistograms( d ) {
	const hist = [
		new Uint32Array( 256 ),
		new Uint32Array( 256 ),
		new Uint32Array( 256 ),
	];
	for ( let i = 0; i < d.length; i += 4 ) {
		hist[ 0 ][ d[ i ] ]++;
		hist[ 1 ][ d[ i + 1 ] ]++;
		hist[ 2 ][ d[ i + 2 ] ]++;
	}
	return hist;
}

/** Low/high bounds after clipping `clip` fraction from both ends. */
function clipBounds( hist, total, clip ) {
	const limit = total * clip;
	let lo = 0;
	let acc = 0;
	while ( lo < 255 && acc + hist[ lo ] <= limit ) {
		acc += hist[ lo ];
		lo++;
	}
	let hi = 255;
	acc = 0;
	while ( hi > lo && acc + hist[ hi ] <= limit ) {
		acc += hist[ hi ];
		hi--;
	}
	return [ lo, hi ];
}

export function autoLevels( img ) {
	const d = img.data;
	const total = d.length / 4;
	const hist = channelHistograms( d );
	const luts = hist.map( ( h ) => {
		const [ lo, hi ] = clipBounds( h, total, 0.005 );
		const lut = new Uint8ClampedArray( 256 );
		const span = Math.max( 1, hi - lo );
		for ( let v = 0; v < 256; v++ ) {
			lut[ v ] = ( ( v - lo ) / span ) * 255;
		}
		return lut;
	} );
	for ( let i = 0; i < d.length; i += 4 ) {
		d[ i ] = luts[ 0 ][ d[ i ] ];
		d[ i + 1 ] = luts[ 1 ][ d[ i + 1 ] ];
		d[ i + 2 ] = luts[ 2 ][ d[ i + 2 ] ];
	}
	return img;
}

export function autoContrast( img ) {
	// Single luminance-based stretch, preserves color relationships.
	const d = img.data;
	const total = d.length / 4;
	const hist = new Uint32Array( 256 );
	for ( let i = 0; i < d.length; i += 4 ) {
		hist[ Math.round( luma( d, i ) ) ]++;
	}
	const [ lo, hi ] = clipBounds( hist, total, 0.005 );
	const span = Math.max( 1, hi - lo );
	const lut = new Uint8ClampedArray( 256 );
	for ( let v = 0; v < 256; v++ ) {
		lut[ v ] = ( ( v - lo ) / span ) * 255;
	}
	return applyLut( img, lut );
}

export function autoColor( img ) {
	// Gray-world white balance, damped so it never overshoots.
	const d = img.data;
	let r = 0;
	let g = 0;
	let b = 0;
	const n = d.length / 4;
	for ( let i = 0; i < d.length; i += 4 ) {
		r += d[ i ];
		g += d[ i + 1 ];
		b += d[ i + 2 ];
	}
	r /= n;
	g /= n;
	b /= n;
	const gray = ( r + g + b ) / 3;
	const damp = 0.7;
	const fr = 1 + ( gray / Math.max( 1, r ) - 1 ) * damp;
	const fg = 1 + ( gray / Math.max( 1, g ) - 1 ) * damp;
	const fb = 1 + ( gray / Math.max( 1, b ) - 1 ) * damp;
	for ( let i = 0; i < d.length; i += 4 ) {
		d[ i ] *= fr;
		d[ i + 1 ] *= fg;
		d[ i + 2 ] *= fb;
	}
	return img;
}

/* ---------------------- levels & curves (v0.2) ------------------------- */

const applyLut = ( img, lut ) => {
	const d = img.data;
	for ( let i = 0; i < d.length; i += 4 ) {
		d[ i ] = lut[ d[ i ] ];
		d[ i + 1 ] = lut[ d[ i + 1 ] ];
		d[ i + 2 ] = lut[ d[ i + 2 ] ];
	}
	return img;
};

export function levels(
	img,
	{
		inBlack = 0,
		inWhite = 255,
		gamma: midGamma = 1,
		outBlack = 0,
		outWhite = 255,
	} = {}
) {
	const lo = Math.min( 254, Math.max( 0, inBlack ) );
	const hi = Math.max( lo + 1, Math.min( 255, inWhite ) );
	const g = Math.min( 3, Math.max( 0.1, midGamma ) );
	const lut = new Uint8ClampedArray( 256 );
	for ( let v = 0; v < 256; v++ ) {
		let t = ( v - lo ) / ( hi - lo );
		t = Math.min( 1, Math.max( 0, t ) );
		t = Math.pow( t, 1 / g );
		lut[ v ] = outBlack + t * ( outWhite - outBlack );
	}
	return applyLut( img, lut );
}

/**
 * Monotone cubic Hermite interpolation (Fritsch–Carlson) through the
 * control points, the classic Curves tool (values in 0..255 space).
 */
export function curvesLut( points ) {
	const pts = [
		...( points?.length
			? points
			: [
					{ x: 0, y: 0 },
					{ x: 255, y: 255 },
			  ] ),
	]
		.map( ( p ) => ( {
			x: Math.min( 255, Math.max( 0, p.x ) ),
			y: Math.min( 255, Math.max( 0, p.y ) ),
		} ) )
		.sort( ( a, b ) => a.x - b.x );
	if ( pts[ 0 ].x > 0 ) {
		pts.unshift( { x: 0, y: pts[ 0 ].y } );
	}
	if ( pts[ pts.length - 1 ].x < 255 ) {
		pts.push( { x: 255, y: pts[ pts.length - 1 ].y } );
	}
	const n = pts.length;
	const xs = pts.map( ( p ) => p.x );
	const ys = pts.map( ( p ) => p.y );
	const dx = [];
	const slope = [];
	for ( let i = 0; i < n - 1; i++ ) {
		dx.push( Math.max( 1e-6, xs[ i + 1 ] - xs[ i ] ) );
		slope.push( ( ys[ i + 1 ] - ys[ i ] ) / dx[ i ] );
	}
	const m = [ slope[ 0 ] ];
	for ( let i = 1; i < n - 1; i++ ) {
		if ( slope[ i - 1 ] * slope[ i ] <= 0 ) {
			m.push( 0 );
		} else {
			const w1 = 2 * dx[ i ] + dx[ i - 1 ];
			const w2 = dx[ i ] + 2 * dx[ i - 1 ];
			m.push( ( w1 + w2 ) / ( w1 / slope[ i - 1 ] + w2 / slope[ i ] ) );
		}
	}
	m.push( slope[ n - 2 ] );

	const lut = new Uint8ClampedArray( 256 );
	let seg = 0;
	for ( let v = 0; v < 256; v++ ) {
		while ( seg < n - 2 && v > xs[ seg + 1 ] ) {
			seg++;
		}
		const t = ( v - xs[ seg ] ) / dx[ seg ];
		const t2 = t * t;
		const t3 = t2 * t;
		lut[ v ] =
			( 2 * t3 - 3 * t2 + 1 ) * ys[ seg ] +
			( t3 - 2 * t2 + t ) * dx[ seg ] * m[ seg ] +
			( -2 * t3 + 3 * t2 ) * ys[ seg + 1 ] +
			( t3 - t2 ) * dx[ seg ] * m[ seg + 1 ];
	}
	return lut;
}

export function curves( img, { points } = {} ) {
	return applyLut( img, curvesLut( points ) );
}

/* ------------------------------ registry ------------------------------ */

/**
 * Canonical effect registry (ids + param schemas exactly per spec 02.4).
 * `params`: { key: { min, max, default, type } }, drives the UI popovers
 * and the SmartFilter.params schema.
 */
export const EFFECTS = [
	{
		id: 'gaussian-blur',
		label: __( 'Gaussian Blur', 'wunderpaint' ),
		apply: gaussianBlur,
		params: { radius: { min: 0, max: 100, default: 4, unit: 'px' } },
	},
	{
		id: 'sharpen',
		label: __( 'Sharpen', 'wunderpaint' ),
		apply: sharpen,
		params: { amount: { min: 0, max: 300, default: 100, unit: '%' } },
	},
	{
		id: 'unsharp-mask',
		label: __( 'Unsharp Mask', 'wunderpaint' ),
		apply: unsharpMask,
		params: {
			radius: { min: 0, max: 50, default: 2, unit: 'px' },
			amount: { min: 0, max: 300, default: 100, unit: '%' },
			threshold: { min: 0, max: 255, default: 0 },
		},
	},
	{
		id: 'box-blur',
		label: __( 'Box Blur', 'wunderpaint' ),
		apply: boxBlur,
		params: { radius: { min: 0, max: 100, default: 4, unit: 'px' } },
	},
	{
		id: 'add-noise',
		label: __( 'Noise / Grain', 'wunderpaint' ),
		apply: addNoise,
		params: {
			amount: { min: 0, max: 100, default: 12 },
			size: { min: 1, max: 4, default: 1, unit: 'px' },
			monochrome: { type: 'bool', default: false },
		},
	},
	{
		id: 'pixelate',
		label: __( 'Pixelate', 'wunderpaint' ),
		apply: pixelate,
		params: { cell: { min: 1, max: 200, default: 8, unit: 'px' } },
	},
	{
		id: 'posterize',
		label: __( 'Posterize', 'wunderpaint' ),
		apply: posterize,
		params: { levels: { min: 2, max: 32, default: 6 } },
	},
	{
		id: 'threshold',
		label: __( 'Threshold', 'wunderpaint' ),
		apply: threshold,
		params: { level: { min: 0, max: 255, default: 128 } },
	},
	{
		id: 'invert',
		label: __( 'Invert', 'wunderpaint' ),
		apply: invert,
		params: {},
	},
	{
		id: 'gamma',
		label: __( 'Gamma', 'wunderpaint' ),
		apply: gamma,
		params: { value: { min: 0.1, max: 3.0, default: 1.0, step: 0.05 } },
	},
	{
		id: 'duotone',
		label: __( 'Duotone', 'wunderpaint' ),
		apply: duotone,
		params: {
			shadow: { type: 'color', default: '#1a1d21' },
			highlight: { type: 'color', default: '#f0f0f1' },
		},
	},
	{
		id: 'levels',
		label: __( 'Levels', 'wunderpaint' ),
		apply: levels,
		params: {
			inBlack: { min: 0, max: 254, default: 0 },
			inWhite: { min: 1, max: 255, default: 255 },
			gamma: { min: 0.1, max: 3, default: 1, step: 0.05 },
			outBlack: { min: 0, max: 255, default: 0 },
			outWhite: { min: 0, max: 255, default: 255 },
		},
	},
	{
		id: 'curves',
		label: __( 'Curves', 'wunderpaint' ),
		apply: curves,
		params: {
			points: {
				type: 'curve',
				default: [
					{ x: 0, y: 0 },
					{ x: 255, y: 255 },
				],
			},
		},
	},
	{
		id: 'vignette',
		label: __( 'Vignette', 'wunderpaint' ),
		apply: vignette,
		params: {
			amount: { min: -100, max: 100, default: 40 },
			size: { min: 0, max: 100, default: 55 },
			softness: { min: 5, max: 100, default: 50 },
		},
	},
	{
		id: 'tilt-shift',
		label: __( 'Tilt-Shift', 'wunderpaint' ),
		apply: tiltShift,
		params: {
			center: { min: 0, max: 100, default: 50, unit: '%' },
			band: { min: 5, max: 100, default: 30, unit: '%' },
			radius: { min: 1, max: 60, default: 12, unit: 'px' },
		},
	},
	{
		id: 'color-splash',
		label: __( 'Color Splash', 'wunderpaint' ),
		apply: colorSplash,
		params: {
			hue: { min: 0, max: 360, default: 0, unit: '°' },
			range: { min: 5, max: 120, default: 30, unit: '°' },
		},
	},
	{
		id: 'halftone',
		label: __( 'Halftone', 'wunderpaint' ),
		apply: halftone,
		params: {
			cell: { min: 3, max: 40, default: 8, unit: 'px' },
			angle: { min: 0, max: 90, default: 45, unit: '°' },
		},
	},
	{
		id: 'glitch',
		label: __( 'Glitch', 'wunderpaint' ),
		apply: glitch,
		params: {
			shift: { min: 0, max: 50, default: 6, unit: 'px' },
			scanlines: { min: 0, max: 100, default: 30 },
			blocks: { min: 0, max: 100, default: 30 },
			seed: { min: 1, max: 99, default: 7 },
		},
	},
	{
		id: 'glow',
		label: __( 'Glow', 'wunderpaint' ),
		apply: glow,
		params: {
			radius: { min: 1, max: 80, default: 12, unit: 'px' },
			intensity: { min: 0, max: 100, default: 60, unit: '%' },
		},
	},
	{
		id: 'emboss',
		label: __( 'Emboss', 'wunderpaint' ),
		apply: emboss,
		params: { strength: { min: 10, max: 300, default: 100, unit: '%' } },
	},
	{
		id: 'edge-detect',
		label: __( 'Edge Detect', 'wunderpaint' ),
		apply: edgeDetect,
		params: { strength: { min: 10, max: 300, default: 100, unit: '%' } },
	},
	{
		id: 'shadows-highlights',
		label: __( 'Shadows / Highlights', 'wunderpaint' ),
		apply: shadowsHighlights,
		params: {
			shadows: { min: -100, max: 100, default: 30 },
			highlights: { min: -100, max: 100, default: -30 },
		},
	},
	{
		id: 'denoise',
		label: __( 'Denoise', 'wunderpaint' ),
		apply: denoise,
		params: { strength: { min: 1, max: 3, default: 1 } },
	},
	{
		id: 'auto-levels',
		label: __( 'Auto Levels', 'wunderpaint' ),
		apply: autoLevels,
		params: {},
	},
	{
		id: 'auto-contrast',
		label: __( 'Auto Contrast', 'wunderpaint' ),
		apply: autoContrast,
		params: {},
	},
	{
		id: 'auto-color',
		label: __( 'Auto Color', 'wunderpaint' ),
		apply: autoColor,
		params: {},
	},
	{
		id: 'lut-3d',
		label: __( 'Color LUT', 'wunderpaint' ),
		hidden: true, // applied via “Load LUT (.cube)…”, not the generic lists
		apply: lut3d,
		// `table` is set by the “Load LUT (.cube)…” import, not by the UI.
		params: {
			table: { type: 'data', default: null },
			intensity: { min: 0, max: 100, default: 100, unit: '%' },
		},
	},
];

export const effectById = ( id ) =>
	EFFECTS.find( ( e ) => e.id === id ) || getExtensionEffect( id );

export const defaultParamsFor = ( id ) => {
	const effect = effectById( id );
	if ( ! effect ) {
		return {};
	}
	const out = {};
	for ( const [ key, schema ] of Object.entries( effect.params ) ) {
		out[ key ] = schema.default;
	}
	return out;
};

/**
 * Apply an effect to a live canvas in place (browser helper).
 *
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas Canvas.
 * @param {string}                            id     Effect id.
 * @param {Object}                            params Effect params.
 */
export function applyEffectToCanvas( canvas, id, params ) {
	const effect = effectById( id );
	if ( ! effect || ! canvas.width || ! canvas.height ) {
		return canvas;
	}
	const ctx = canvas.getContext( '2d' );
	const imageData = ctx.getImageData( 0, 0, canvas.width, canvas.height );
	effect.apply(
		{ data: imageData.data, width: canvas.width, height: canvas.height },
		params || defaultParamsFor( id )
	);
	ctx.putImageData( imageData, 0, 0 );
	return canvas;
}
