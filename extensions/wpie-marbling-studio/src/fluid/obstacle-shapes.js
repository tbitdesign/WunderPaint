/** Shared contours: normalized, closed implicitly, with even-odd holes. */
export const OBSTACLE_SHAPES = [ 'circle', 'heart', 'star', 'pebble', 'ring' ];
export const MAX_OBSTACLES = 128;
const cache = new Map();
export const bounded = ( v, lo, hi, fallback ) =>
	Number.isFinite( v ) ? Math.max( lo, Math.min( hi, v ) ) : fallback;
export function roundLoop( loop, passes = 1 ) {
	for ( let k = 0; k < passes; k++ ) {
		const out = [];
		loop.forEach( ( a, i ) => {
			const b = loop[ ( i + 1 ) % loop.length ];
			out.push(
				[
					a[ 0 ] * 0.75 + b[ 0 ] * 0.25,
					a[ 1 ] * 0.75 + b[ 1 ] * 0.25,
				],
				[ a[ 0 ] * 0.25 + b[ 0 ] * 0.75, a[ 1 ] * 0.25 + b[ 1 ] * 0.75 ]
			);
		} );
		loop = out;
	}
	return loop;
}
export function builtinLoops( name ) {
	if ( cache.has( name ) ) {
		return cache.get( name );
	}
	let loop = Array.from( { length: 96 }, ( _, i ) => {
		const a = ( i * Math.PI * 2 ) / 96;
		if ( name === 'heart' ) {
			return [
				( 16 * Math.sin( a ) ** 3 ) / 34,
				-(
					13 * Math.cos( a ) -
					5 * Math.cos( 2 * a ) -
					2 * Math.cos( 3 * a ) -
					Math.cos( 4 * a ) +
					2
				) / 34,
			];
		}
		const r =
			name === 'pebble'
				? 0.44 + 0.035 * Math.sin( a * 3 ) + 0.02 * Math.cos( a * 2 )
				: 0.5;
		return [ Math.cos( a ) * r, Math.sin( a ) * r ];
	} );
	if ( name === 'star' ) {
		loop = roundLoop(
			Array.from( { length: 10 }, ( _, i ) => {
				const a = ( i * Math.PI ) / 5 - Math.PI / 2,
					r = i % 2 ? 0.24 : 0.5;
				return [ Math.cos( a ) * r, Math.sin( a ) * r ];
			} ),
			2
		);
	}
	const loops = [ loop ];
	if ( name === 'ring' ) {
		loops.push(
			loop.map( ( [ x, y ] ) => [ x * 0.52, y * 0.52 ] ).reverse()
		);
	}
	cache.set( name, loops );
	return loops;
}
export function insideLoop( x, y, loop ) {
	let inside = false;
	for ( let i = 0, j = loop.length - 1; i < loop.length; j = i++ ) {
		const a = loop[ i ],
			b = loop[ j ];
		if (
			a[ 1 ] > y !== b[ 1 ] > y &&
			x <
				( ( b[ 0 ] - a[ 0 ] ) * ( y - a[ 1 ] ) ) / ( b[ 1 ] - a[ 1 ] ) +
					a[ 0 ]
		) {
			inside = ! inside;
		}
	}
	return inside;
}
export function signedDistance( x, y, loops ) {
	let inside = false,
		distance = Infinity;
	for ( const loop of loops ) {
		if ( insideLoop( x, y, loop ) ) {
			inside = ! inside;
		}
		for ( let i = 0; i < loop.length; i++ ) {
			const a = loop[ i ],
				b = loop[ ( i + 1 ) % loop.length ],
				dx = b[ 0 ] - a[ 0 ],
				dy = b[ 1 ] - a[ 1 ];
			const u = bounded(
				( ( x - a[ 0 ] ) * dx + ( y - a[ 1 ] ) * dy ) /
					( dx * dx + dy * dy || 1 ),
				0,
				1,
				0
			);
			distance = Math.min(
				distance,
				Math.hypot( x - a[ 0 ] - u * dx, y - a[ 1 ] - u * dy )
			);
		}
	}
	return inside ? -distance : distance;
}
/** Cached local distance grids avoid polygon walks in the particle solver. */
export function distanceGrid( loops ) {
	const size = 128,
		field = new Float32Array( size * size );
	for ( let y = 0; y < size; y++ ) {
		for ( let x = 0; x < size; x++ ) {
			field[ y * size + x ] = signedDistance(
				x / ( size - 1 ) - 0.5,
				y / ( size - 1 ) - 0.5,
				loops
			);
		}
	}
	return { size, field };
}
export function sampleGrid( grid, x, y ) {
	const { size, field } = grid;
	const px = bounded( ( x + 0.5 ) * ( size - 1 ), 0, size - 1, 0 ),
		py = bounded( ( y + 0.5 ) * ( size - 1 ), 0, size - 1, 0 );
	const ix = Math.min( size - 2, Math.floor( px ) ),
		iy = Math.min( size - 2, Math.floor( py ) ),
		fx = px - ix,
		fy = py - iy;
	const value =
		( field[ iy * size + ix ] * ( 1 - fx ) +
			field[ iy * size + ix + 1 ] * fx ) *
			( 1 - fy ) +
		( field[ ( iy + 1 ) * size + ix ] * ( 1 - fx ) +
			field[ ( iy + 1 ) * size + ix + 1 ] * fx ) *
			fy;
	return (
		Math.max( value, 0 ) +
		Math.hypot(
			Math.max( 0, Math.abs( x ) - 0.5 ),
			Math.max( 0, Math.abs( y ) - 0.5 )
		) +
		Math.min( value, 0 )
	);
}
export function cleanObstacleState( raw, n = 0 ) {
	if ( ! raw ) {
		return { version: 1, items: [], assets: [], baseWall: null };
	}
	if (
		raw.version !== 1 ||
		! Array.isArray( raw.items ) ||
		raw.items.length > MAX_OBSTACLES ||
		! Array.isArray( raw.assets ) ||
		raw.assets.length > 16
	) {
		throw Error( 'Invalid obstacle state' );
	}
	let points = 0;
	const assets = raw.assets.map( ( a ) => {
		if (
			! a ||
			typeof a.id !== 'string' ||
			! /^layer-[0-9]+$/.test( a.id ) ||
			typeof a.name !== 'string' ||
			! Array.isArray( a.loops ) ||
			! a.loops.length ||
			a.loops.length > 128
		) {
			throw Error( 'Invalid obstacle shape' );
		}
		const loops = a.loops.map( ( loop ) => {
			if (
				! Array.isArray( loop ) ||
				loop.length < 3 ||
				loop.length > 4096
			) {
				throw Error( 'Invalid obstacle contour' );
			}
			points += loop.length;
			return loop.map( ( p ) => {
				if (
					! Array.isArray( p ) ||
					p.length !== 2 ||
					p.some(
						( v ) => ! Number.isFinite( v ) || Math.abs( v ) > 0.501
					)
				) {
					throw Error( 'Invalid obstacle point' );
				}
				return [ ...p ];
			} );
		} );
		return { id: a.id, name: a.name.slice( 0, 80 ), loops };
	} );
	if (
		points > 12000 ||
		new Set( assets.map( ( a ) => a.id ) ).size !== assets.length
	) {
		throw Error( 'Obstacle shape limit' );
	}
	const shapes = new Set( [
		...OBSTACLE_SHAPES,
		...assets.map( ( a ) => a.id ),
	] );
	const items = raw.items.map( ( o ) => {
		if (
			! o ||
			! Number.isSafeInteger( o.id ) ||
			o.id < 1 ||
			! shapes.has( o.shape ) ||
			! /^#[0-9a-f]{6}$/i.test( o.color ) ||
			! Number.isFinite( o.x ) ||
			o.x < 0 ||
			o.x > 1 ||
			! Number.isFinite( o.y ) ||
			o.y < 0 ||
			o.y > 1 ||
			! Number.isFinite( o.size ) ||
			o.size < 0.024 ||
			o.size > 0.8 ||
			! Number.isFinite( o.angle ) ||
			Math.abs( o.angle ) > 180
		) {
			throw Error( 'Invalid placed obstacle' );
		}
		return {
			id: o.id,
			shape: o.shape,
			color: o.color,
			x: o.x,
			y: o.y,
			size: o.size,
			angle: o.angle,
		};
	} );
	if ( new Set( items.map( ( o ) => o.id ) ).size !== items.length ) {
		throw Error( 'Duplicate obstacle' );
	}
	let baseWall = null;
	if ( n && raw.baseWall !== null && raw.baseWall !== undefined ) {
		if (
			! Array.isArray( raw.baseWall ) ||
			raw.baseWall.length !== n ||
			raw.baseWall.some(
				( v ) => ! Number.isFinite( v ) || v < 0 || v > 1
			)
		) {
			throw Error( 'Invalid obstacle base' );
		}
		baseWall = Float32Array.from( raw.baseWall );
	}
	if ( n && items.length && ! baseWall ) {
		throw Error( 'Missing obstacle base' );
	}
	return { version: 1, items, assets, baseWall };
}
