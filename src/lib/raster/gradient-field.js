/** Cached CPU fallback for editable color fields and non-pad gradient spread. */
import { createCanvas } from './env';
import {
	normalizeFreeform,
	prepareFreeform,
	sampleFreeform,
	normalizeGradientMesh,
	prepareGradientMesh,
	meshPatchPoint,
	straightColor,
} from '../gradient-fields';
import {
	preparedGradientRamp,
	sampleGradientRamp,
	spreadPosition,
} from '../gradient-ramp';

const cache = new Map();
const CACHE_BYTES = 32 * 1024 * 1024;
let cacheBytes = 0;
export function clearGradientRasterCache() {
	cache.clear();
	cacheBytes = 0;
}
export function gradientRasterCacheInfo() {
	return { entries: cache.size, bytes: cacheBytes };
}

function putColor( data, index, color ) {
	const alpha = Math.max( 0, Math.min( 1, color[ 3 ] ) );
	data[ index ] = color[ 0 ];
	data[ index + 1 ] = color[ 1 ];
	data[ index + 2 ] = color[ 2 ];
	data[ index + 3 ] = alpha * 255;
}
function triangle( data, width, height, a, b, c ) {
	const denominator =
		( b.y - c.y ) * ( a.x - c.x ) + ( c.x - b.x ) * ( a.y - c.y );
	if ( Math.abs( denominator ) < 1e-12 ) {
		return;
	}
	const minX = Math.max( 0, Math.floor( Math.min( a.x, b.x, c.x ) ) );
	const maxX = Math.min( width - 1, Math.ceil( Math.max( a.x, b.x, c.x ) ) );
	const minY = Math.max( 0, Math.floor( Math.min( a.y, b.y, c.y ) ) );
	const maxY = Math.min( height - 1, Math.ceil( Math.max( a.y, b.y, c.y ) ) );
	for ( let y = minY; y <= maxY; y++ ) {
		for ( let x = minX; x <= maxX; x++ ) {
			const u =
				( ( b.y - c.y ) * ( x + 0.5 - c.x ) +
					( c.x - b.x ) * ( y + 0.5 - c.y ) ) /
				denominator;
			const v =
				( ( c.y - a.y ) * ( x + 0.5 - c.x ) +
					( a.x - c.x ) * ( y + 0.5 - c.y ) ) /
				denominator;
			const w = 1 - u - v;
			if ( u < -1e-7 || v < -1e-7 || w < -1e-7 ) {
				continue;
			}
			const color = a.color.map(
				( value, k ) => value * u + b.color[ k ] * v + c.color[ k ] * w
			);
			putColor( data, ( y * width + x ) * 4, straightColor( color ) );
		}
	}
}
function renderMesh( data, width, height, value, draft ) {
	const mesh = prepareGradientMesh( value );
	// Every patch uses the same subdivision count, so shared edges have no cracks.
	const steps = Math.max(
		8,
		Math.min( draft ? 12 : 40, Math.ceil( Math.max( width, height ) / 24 ) )
	);
	for ( let row = 0; row < mesh.rows - 1; row++ ) {
		for ( let col = 0; col < mesh.cols - 1; col++ ) {
			const vertices = [];
			for ( let j = 0; j <= steps; j++ ) {
				for ( let i = 0; i <= steps; i++ ) {
					const p = meshPatchPoint(
						mesh,
						row,
						col,
						i / steps,
						j / steps
					);
					vertices.push( { ...p, x: p.x * width, y: p.y * height } );
				}
			}
			for ( let j = 0; j < steps; j++ ) {
				for ( let i = 0; i < steps; i++ ) {
					const a = vertices[ j * ( steps + 1 ) + i ],
						b = vertices[ j * ( steps + 1 ) + i + 1 ];
					const c = vertices[ ( j + 1 ) * ( steps + 1 ) + i ],
						d = vertices[ ( j + 1 ) * ( steps + 1 ) + i + 1 ];
					triangle( data, width, height, a, b, d );
					triangle( data, width, height, a, d, c );
				}
			}
		}
	}
}
export function gradientRaster( layer, width, height, quality = 'final' ) {
	const draft = quality === 'draft';
	// Pixel budget is local to this derived cache; project recipes stay lossless.
	const scale = Math.min(
		1,
		( draft ? 256 : 8192 ) / Math.max( width, height ),
		Math.sqrt(
			( draft ? 65536 : 16777216 ) / Math.max( 1, width * height )
		)
	);
	width = Math.max( 1, Math.ceil( width * scale ) );
	height = Math.max( 1, Math.ceil( height * scale ) );
	const field =
		layer.kind === 'freeform'
			? normalizeFreeform( layer.freeform, layer.stops )
			: layer.kind === 'mesh'
			? normalizeGradientMesh( layer.mesh, layer.stops )
			: null;
	const axis = field
		? null
		: [
				( layer.from.x - layer.x ) / layer.w,
				( layer.from.y - layer.y ) / layer.h,
				( layer.to.x - layer.x ) / layer.w,
				( layer.to.y - layer.y ) / layer.h,
				layer.w / layer.h,
		  ];
	const key = JSON.stringify( [
		width,
		height,
		draft,
		layer.kind,
		field || [ layer.stops, layer.spread, axis ],
	] );
	if ( cache.has( key ) ) {
		const hit = cache.get( key );
		cache.delete( key );
		cache.set( key, hit );
		return hit;
	}
	const canvas = createCanvas( width, height ),
		ctx = canvas.getContext( '2d' );
	const image = ctx.createImageData( width, height ),
		data = image.data;
	if ( layer.kind === 'mesh' ) {
		renderMesh( data, width, height, field, draft );
	} else {
		const freeform = field && prepareFreeform( field );
		const ramp = ! field && preparedGradientRamp( layer.stops );
		const fx = layer.from?.x - layer.x,
			fy = layer.from?.y - layer.y;
		const dx = layer.to?.x - layer.from?.x,
			dy = layer.to?.y - layer.from?.y;
		const length2 = Math.max( 1e-12, dx * dx + dy * dy );
		for ( let y = 0; y < height; y++ ) {
			for ( let x = 0; x < width; x++ ) {
				let color;
				if ( freeform ) {
					color = straightColor(
						sampleFreeform(
							freeform,
							( x + 0.5 ) / width,
							( y + 0.5 ) / height
						)
					);
				} else {
					const px = ( ( x + 0.5 ) * layer.w ) / width - fx,
						py = ( ( y + 0.5 ) * layer.h ) / height - fy;
					const at =
						layer.kind === 'radial'
							? Math.hypot( px, py ) / Math.sqrt( length2 )
							: layer.kind === 'angle'
							? ( ( Math.atan2( py, px ) -
									Math.atan2( dy, dx ) ) /
									( 2 * Math.PI ) +
									1 ) %
							  1
							: ( px * dx + py * dy ) / length2;
					color = sampleGradientRamp(
						ramp,
						spreadPosition( at, layer.spread )
					);
				}
				putColor( data, ( y * width + x ) * 4, color );
			}
		}
	}
	ctx.putImageData( image, 0, 0 );
	const bytes = width * height * 4;
	if ( bytes <= CACHE_BYTES ) {
		while ( cacheBytes + bytes > CACHE_BYTES && cache.size ) {
			const oldest = cache.keys().next().value,
				old = cache.get( oldest );
			cacheBytes -= old.width * old.height * 4;
			cache.delete( oldest );
		}
		cache.set( key, canvas );
		cacheBytes += bytes;
	}
	return canvas;
}
export function drawGradientField( ctx, layer, env = {} ) {
	const transform = ctx.getTransform();
	const sx = Math.hypot( transform.a, transform.b ),
		sy = Math.hypot( transform.c, transform.d );
	const canvas = gradientRaster(
		layer,
		Math.ceil( layer.w * sx ),
		Math.ceil( layer.h * sy ),
		env.gradientQuality
	);
	ctx.save();
	ctx.imageSmoothingEnabled = true;
	ctx.drawImage( canvas, 0, 0, layer.w, layer.h );
	ctx.restore();
}
