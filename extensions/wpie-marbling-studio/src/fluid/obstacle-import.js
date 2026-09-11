import { roundLoop } from './obstacle-shapes.js';
/** Retain the selected branch and ancestor masks, without unrelated siblings. */
export function obstacleLayerBranch( layers, id ) {
	const byId = new Map( layers.map( ( l ) => [ l.id, l ] ) ),
		selected = byId.get( id ),
		keep = new Set();
	if ( ! selected ) {
		throw Error( 'Choose a canvas layer first.' );
	}
	const visit = ( key ) => {
		if ( keep.has( key ) ) {
			return;
		}
		const layer = byId.get( key );
		if ( ! layer ) {
			return;
		}
		keep.add( key );
		for ( const child of layer.children || [] ) {
			visit( child );
		}
	};
	visit( id );
	const ancestors = new Set();
	let parent = selected.parent;
	while ( parent && byId.has( parent ) && ! ancestors.has( parent ) ) {
		ancestors.add( parent );
		keep.add( parent );
		parent = byId.get( parent ).parent;
	}
	// Clipping bases must remain in the render stack, but must not become
	// part of the imported silhouette. The core composites their opacity
	// separately from the alpha used as the following layer's clipping base.
	const clipBases = new Set();
	for ( const key of [ id, ...ancestors ] ) {
		const layer = byId.get( key );
		if ( ! layer?.clipped ) {
			continue;
		}
		for (
			let i = layers.findIndex( ( l ) => l.id === key ) - 1;
			i >= 0;
			i--
		) {
			const candidate = layers[ i ];
			if (
				candidate.parent !== layer.parent ||
				! candidate.visible ||
				candidate.clipped ||
				candidate.type === 'adjustment' ||
				( candidate.type === 'stroke' && candidate.erase )
			) {
				continue;
			}
			visit( candidate.id );
			clipBases.add( candidate.id );
			break;
		}
	}
	return layers
		.filter( ( l ) => keep.has( l.id ) )
		.map( ( l ) => ( {
			...l,
			...( l.id === id || ancestors.has( l.id )
				? { visible: true }
				: {} ),
			...( clipBases.has( l.id ) ? { opacity: 0 } : {} ),
			children: l.children?.filter( ( key ) => keep.has( key ) ),
		} ) );
}
/** Remove the raster staircase before rounding, within one source pixel. */
function simplifyContour( points ) {
	const simplify = ( p ) => {
		if ( p.length < 3 ) {
			return p;
		}
		const a = p[ 0 ],
			b = p[ p.length - 1 ],
			dx = b[ 0 ] - a[ 0 ],
			dy = b[ 1 ] - a[ 1 ];
		let far = 0,
			index = 0;
		for ( let i = 1; i < p.length - 1; i++ ) {
			const t = Math.max(
					0,
					Math.min(
						1,
						( ( p[ i ][ 0 ] - a[ 0 ] ) * dx +
							( p[ i ][ 1 ] - a[ 1 ] ) * dy ) /
							( dx * dx + dy * dy || 1 )
					)
				),
				d = Math.hypot(
					p[ i ][ 0 ] - a[ 0 ] - dx * t,
					p[ i ][ 1 ] - a[ 1 ] - dy * t
				);
			if ( d > far ) {
				far = d;
				index = i;
			}
		}
		if ( far <= 0.8 ) {
			return [ a, b ];
		}
		return [
			...simplify( p.slice( 0, index + 1 ) ).slice( 0, -1 ),
			...simplify( p.slice( index ) ),
		];
	};
	let split = 1,
		far = 0;
	points.forEach( ( p, i ) => {
		const d = Math.hypot(
			p[ 0 ] - points[ 0 ][ 0 ],
			p[ 1 ] - points[ 0 ][ 1 ]
		);
		if ( d > far ) {
			far = d;
			split = i;
		}
	} );
	return [
		...simplify( points.slice( 0, split + 1 ) ).slice( 0, -1 ),
		...simplify( [ ...points.slice( split ), points[ 0 ] ] ).slice( 0, -1 ),
	];
}
/** Trace alpha silhouettes with holes. Collinear runs are removed before rounding. */
export function alphaContours( data, w, h ) {
	const solid = ( x, y ) =>
		x >= 0 &&
		y >= 0 &&
		x < w &&
		y < h &&
		data[ ( y * w + x ) * 4 + 3 ] >= 96;
	let minX = w,
		minY = h,
		maxX = 0,
		maxY = 0;
	const edges = new Map(),
		stride = w + 1;
	const add = ( ax, ay, bx, by ) => {
		const key = ay * stride + ax;
		if ( ! edges.has( key ) ) {
			edges.set( key, [] );
		}
		edges.get( key ).push( by * stride + bx );
	};
	for ( let y = 0; y < h; y++ ) {
		for ( let x = 0; x < w; x++ ) {
			if ( solid( x, y ) ) {
				minX = Math.min( minX, x );
				minY = Math.min( minY, y );
				maxX = Math.max( maxX, x + 1 );
				maxY = Math.max( maxY, y + 1 );
				if ( ! solid( x, y - 1 ) ) {
					add( x, y, x + 1, y );
				}
				if ( ! solid( x + 1, y ) ) {
					add( x + 1, y, x + 1, y + 1 );
				}
				if ( ! solid( x, y + 1 ) ) {
					add( x + 1, y + 1, x, y + 1 );
				}
				if ( ! solid( x - 1, y ) ) {
					add( x, y + 1, x, y );
				}
			}
		}
	}
	if ( ! edges.size ) {
		throw Error( 'This layer has no visible silhouette.' );
	}
	const loops = [],
		span = Math.max( maxX - minX, maxY - minY ),
		cx = ( maxX + minX ) / 2,
		cy = ( maxY + minY ) / 2;
	let count = 0;
	while ( edges.size ) {
		const start = edges.keys().next().value;
		let key = start;
		const points = [];
		do {
			points.push( [ key % stride, Math.floor( key / stride ) ] );
			const outgoing = edges.get( key );
			if ( ! outgoing ) {
				throw Error( 'This silhouette is too complex.' );
			}
			const next = outgoing.shift();
			if ( ! outgoing.length ) {
				edges.delete( key );
			}
			key = next;
		} while ( key !== start && points.length <= w * h * 4 );
		const simple = points.filter( ( p, i ) => {
			const a = points[ ( i + points.length - 1 ) % points.length ],
				b = points[ ( i + 1 ) % points.length ];
			return (
				( p[ 0 ] - a[ 0 ] ) * ( b[ 1 ] - p[ 1 ] ) !==
				( p[ 1 ] - a[ 1 ] ) * ( b[ 0 ] - p[ 0 ] )
			);
		} );
		if ( simple.length < 3 ) {
			continue;
		}
		const area =
			Math.abs(
				simple.reduce( ( sum, p, i ) => {
					const q = simple[ ( i + 1 ) % simple.length ];
					return sum + p[ 0 ] * q[ 1 ] - q[ 0 ] * p[ 1 ];
				}, 0 )
			) / 2;
		if ( area < 3 ) {
			continue;
		}
		const rounded = roundLoop(
			simplifyContour( simple ).map( ( [ x, y ] ) => [
				( x - cx ) / span,
				( y - cy ) / span,
			] ),
			2
		);
		count += rounded.length;
		if ( count > 12000 || rounded.length > 4096 || loops.length >= 128 ) {
			throw Error( 'This silhouette is too complex.' );
		}
		loops.push( rounded );
	}
	if ( ! loops.length ) {
		throw Error( 'This layer has no visible silhouette.' );
	}
	return loops;
}
export async function importObstacleLayer( bridge, state, id ) {
	if ( ! bridge.raster?.renderToCanvas ) {
		throw Error( 'Canvas layer import is unavailable.' );
	}
	const layers = obstacleLayerBranch( state.layers || [], id ),
		doc = { ...state.doc, bg: 'transparent' };
	await document.fonts?.ready;
	const canvas = await bridge.raster.renderToCanvas( doc, layers, {
		scale: Math.min( 1, 384 / Math.max( doc.w, doc.h ) ),
	} );
	return alphaContours(
		canvas
			.getContext( '2d' )
			.getImageData( 0, 0, canvas.width, canvas.height ).data,
		canvas.width,
		canvas.height
	);
}
