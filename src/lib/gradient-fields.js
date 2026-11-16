/** Normalized, serializable freeform points and bicubic Hermite mesh patches. */
import { parseColor, toHexColor } from './color';
import { clampGradient as clamp, gradientColorAt } from './gradient-ramp';

export const isGradientField = ( kind ) =>
	kind === 'freeform' || kind === 'mesh';
const count = ( n ) => Math.round( clamp( n || 3, 2, 6 ) );
const rgba = ( color ) => {
	const c = parseColor( color );
	return [ c.r * c.a, c.g * c.a, c.b * c.a, c.a ];
};
export const straightColor = ( c ) =>
	c[ 3 ] > 1e-8
		? [ c[ 0 ] / c[ 3 ], c[ 1 ] / c[ 3 ], c[ 2 ] / c[ 3 ], c[ 3 ] ]
		: [ 0, 0, 0, 0 ];
export function makeFreeform( stops ) {
	return {
		softness: 0.65,
		points: [
			[ 0.12, 0.15 ],
			[ 0.85, 0.2 ],
			[ 0.2, 0.85 ],
			[ 0.8, 0.8 ],
		].map( ( [ x, y ], i ) => ( {
			x,
			y,
			radius: 0.65,
			color: gradientColorAt( stops, i / 3 ),
		} ) ),
	};
}
export function normalizeFreeform( value, stops = [] ) {
	const base =
		Array.isArray( value?.points ) &&
		value.points.filter( Boolean ).length >= 2
			? value
			: makeFreeform( stops );
	return {
		softness: clamp( base.softness ?? 0.65, 0.1, 1 ),
		points: base.points
			.filter( Boolean )
			.slice( 0, 24 )
			.map( ( p ) => ( {
				x: clamp( p.x ),
				y: clamp( p.y ),
				radius: clamp( p.radius ?? 0.65, 0.05, 2 ),
				color: p.color || '#000000',
			} ) ),
	};
}
export function prepareFreeform( field ) {
	return {
		...field,
		points: field.points.map( ( p ) => ( {
			...p,
			rgba: rgba( p.color ),
		} ) ),
	};
}
/** Normalized inverse-distance blending: point colors are exact, including alpha. */
export function sampleFreeform( field, x, y ) {
	const out = [ 0, 0, 0, 0 ];
	let sum = 0;
	const power = 1.1 + ( 1 - field.softness ) * 2.5;
	for ( const p of field.points ) {
		const d2 = ( x - p.x ) ** 2 + ( y - p.y ) ** 2;
		if ( d2 < 1e-12 ) {
			return p.rgba.slice();
		}
		const weight = Math.pow(
			( p.radius * p.radius ) / Math.max( 1e-12, d2 ),
			power
		);
		sum += weight;
		for ( let k = 0; k < 4; k++ ) {
			out[ k ] += p.rgba[ k ] * weight;
		}
	}
	return out.map( ( c ) => c / Math.max( sum, 1e-12 ) );
}
export function addFreeformPoint( field, position ) {
	if ( field.points.length >= 24 ) {
		return field;
	}
	let best = position,
		distance = -1;
	if ( ! best ) {
		for ( let y = 0.1; y < 1; y += 0.2 ) {
			for ( let x = 0.1; x < 1; x += 0.2 ) {
				const d = Math.min(
					...field.points.map(
						( p ) => ( x - p.x ) ** 2 + ( y - p.y ) ** 2
					)
				);
				if ( d > distance ) {
					distance = d;
					best = { x, y };
				}
			}
		}
	}
	const x = clamp( best.x ),
		y = clamp( best.y );
	return {
		...field,
		points: [
			...field.points,
			{
				x,
				y,
				radius: 0.65,
				color: toHexColor(
					...straightColor(
						sampleFreeform( prepareFreeform( field ), x, y )
					)
				),
			},
		],
	};
}
export function makeGradientMesh( stops, rows = 3, cols = 3 ) {
	rows = count( rows );
	cols = count( cols );
	return {
		rows,
		cols,
		nodes: Array.from( { length: rows * cols }, ( _, i ) => {
			const x = ( i % cols ) / ( cols - 1 ),
				y = Math.floor( i / cols ) / ( rows - 1 );
			return {
				x,
				y,
				color: gradientColorAt( stops, ( x + y ) / 2 ),
				u: { x: 1 / ( cols - 1 ), y: 0 },
				v: { x: 0, y: 1 / ( rows - 1 ) },
			};
		} ),
	};
}
export function normalizeGradientMesh( value, stops = [] ) {
	const rows = count( value?.rows ),
		cols = count( value?.cols );
	const base = makeGradientMesh( stops, rows, cols );
	if (
		! Array.isArray( value?.nodes ) ||
		value.nodes.length !== rows * cols
	) {
		return base;
	}
	return {
		rows,
		cols,
		nodes: base.nodes.map( ( fallback, i ) => {
			const n = value.nodes[ i ] || fallback;
			return {
				x: clamp( n.x ),
				y: clamp( n.y ),
				color: n.color || fallback.color,
				u: {
					x: clamp( n.u?.x ?? fallback.u.x, -2, 2 ),
					y: clamp( n.u?.y ?? 0, -2, 2 ),
				},
				v: {
					x: clamp( n.v?.x ?? 0, -2, 2 ),
					y: clamp( n.v?.y ?? fallback.v.y, -2, 2 ),
				},
			};
		} ),
	};
}
const basis = ( t ) => [
	2 * t ** 3 - 3 * t ** 2 + 1,
	-2 * t ** 3 + 3 * t ** 2,
	t ** 3 - 2 * t ** 2 + t,
	t ** 3 - t ** 2,
];
export function prepareGradientMesh( mesh ) {
	return {
		...mesh,
		nodes: mesh.nodes.map( ( n ) => ( { ...n, rgba: rgba( n.color ) } ) ),
	};
}
/** Shared node derivatives give neighboring patches exactly the same curved edge. */
export function meshPatchPoint( mesh, row, col, s, t ) {
	const a = basis( s ),
		b = basis( t ),
		out = { x: 0, y: 0, color: [ 0, 0, 0, 0 ] };
	const cs = s * s * ( 3 - 2 * s ),
		ct = t * t * ( 3 - 2 * t );
	for ( let j = 0; j < 2; j++ ) {
		for ( let i = 0; i < 2; i++ ) {
			const node = mesh.nodes[ ( row + j ) * mesh.cols + col + i ];
			for ( const key of [ 'x', 'y' ] ) {
				out[ key ] +=
					node[ key ] * a[ i ] * b[ j ] +
					node.u[ key ] * a[ i + 2 ] * b[ j ] +
					node.v[ key ] * a[ i ] * b[ j + 2 ];
			}
			const weight = ( i ? cs : 1 - cs ) * ( j ? ct : 1 - ct );
			const color = node.rgba || rgba( node.color );
			for ( let k = 0; k < 4; k++ ) {
				out.color[ k ] += color[ k ] * weight;
			}
		}
	}
	return out;
}
export function sampleGradientMesh( mesh, x, y ) {
	const sx = clamp( x ) * ( mesh.cols - 1 ),
		sy = clamp( y ) * ( mesh.rows - 1 );
	const col = Math.min( mesh.cols - 2, Math.floor( sx ) ),
		row = Math.min( mesh.rows - 2, Math.floor( sy ) );
	return meshPatchPoint( mesh, row, col, sx - col, sy - row );
}
/** Rebuild grid density by sampling the existing surface and its derivatives. */
export function resampleGradientMesh( mesh, rows, cols ) {
	rows = count( rows );
	cols = count( cols );
	const prepared = prepareGradientMesh( mesh ),
		epsilon = 1e-4;
	const nodes = Array.from( { length: rows * cols }, ( _, i ) => {
		const x = ( i % cols ) / ( cols - 1 ),
			y = Math.floor( i / cols ) / ( rows - 1 );
		const p = sampleGradientMesh( prepared, x, y );
		const derivative = ( axis, divisions ) => {
			const low = Math.max( 0, ( axis === 'x' ? x : y ) - epsilon );
			const high = Math.min( 1, ( axis === 'x' ? x : y ) + epsilon );
			const a = sampleGradientMesh(
				prepared,
				axis === 'x' ? low : x,
				axis === 'y' ? low : y
			);
			const b = sampleGradientMesh(
				prepared,
				axis === 'x' ? high : x,
				axis === 'y' ? high : y
			);
			return {
				x: ( b.x - a.x ) / ( high - low ) / divisions,
				y: ( b.y - a.y ) / ( high - low ) / divisions,
			};
		};
		return {
			x: p.x,
			y: p.y,
			color: toHexColor( ...straightColor( p.color ) ),
			u: derivative( 'x', cols - 1 ),
			v: derivative( 'y', rows - 1 ),
		};
	} );
	return { rows, cols, nodes };
}
