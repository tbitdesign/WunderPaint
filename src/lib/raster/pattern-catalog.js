/** Additional seamless tiles. Original 8px patterns keep their old geometry. */
import { createCanvas } from './env';

const TAU = Math.PI * 2;
const line = ( p, points ) => {
	p.beginPath();
	points.forEach( ( [ x, y ], i ) =>
		i ? p.lineTo( x, y ) : p.moveTo( x, y )
	);
	p.stroke();
};
const circle = ( p, x, y, r, fill = false ) => {
	p.beginPath();
	p.arc( x, y, r, 0, TAU );
	if ( fill ) {
		p.fill();
	} else {
		p.stroke();
	}
};
const polygon = ( p, points, fill = false ) => {
	p.beginPath();
	points.forEach( ( [ x, y ], i ) =>
		i ? p.lineTo( x, y ) : p.moveTo( x, y )
	);
	p.closePath();
	if ( fill ) {
		p.fill();
	} else {
		p.stroke();
	}
};
const diamond = ( p, x, y, r, fill = false ) =>
	polygon(
		p,
		[
			[ x, y - r ],
			[ x + r, y ],
			[ x, y + r ],
			[ x - r, y ],
		],
		fill
	);
const arc = ( p, x, y, r, start, end ) => {
	p.beginPath();
	p.arc( x, y, r, start, end );
	p.stroke();
};

// A tile's coordinates are local. Neighbor copies wrap motifs over every edge.
const TILES = {
	pinstripe: [
		16,
		( p ) => {
			p.fillRect( 3, 0, 1, 16 );
			p.fillRect( 6, 0, 2, 16 );
		},
	],
	'horizontal-lines': [ 16, ( p ) => p.fillRect( 0, 7, 16, 2 ) ],
	'vertical-lines': [ 16, ( p ) => p.fillRect( 7, 0, 2, 16 ) ],
	'double-stripe': [
		24,
		( p ) => {
			p.lineWidth = 2;
			line( p, [
				[ 0, 24 ],
				[ 24, 0 ],
			] );
			line( p, [
				[ 4, 24 ],
				[ 24, 4 ],
			] );
			line( p, [
				[ 0, 4 ],
				[ 4, 0 ],
			] );
		},
	],
	'dashed-lines': [
		24,
		( p ) => {
			p.fillRect( 2, 5, 9, 2 );
			p.fillRect( 14, 17, 9, 2 );
		},
	],
	herringbone: [
		24,
		( p ) => {
			for ( let i = -2; i <= 2; i++ ) {
				line( p, [
					[ 0, i * 8 ],
					[ 12, i * 8 + 8 ],
					[ 24, i * 8 ],
				] );
			}
		},
	],
	'chevron-wide': [
		24,
		( p ) => {
			p.lineWidth = 4;
			line( p, [
				[ 0, 6 ],
				[ 12, 16 ],
				[ 24, 6 ],
			] );
		},
	],
	'basket-weave': [
		24,
		( p ) => {
			for ( let i = 2; i < 12; i += 4 ) {
				p.fillRect( 1, i, 10, 2 );
				p.fillRect( 13, i + 12, 10, 2 );
				p.fillRect( i + 12, 1, 2, 10 );
				p.fillRect( i, 13, 2, 10 );
			}
		},
	],
	'dot-grid': [ 16, ( p ) => circle( p, 8, 8, 2.2, true ) ],
	'offset-dots': [
		24,
		( p ) => {
			circle( p, 6, 6, 3.4, true );
			circle( p, 18, 18, 3.4, true );
		},
	],
	'micro-dots': [
		12,
		( p ) => {
			for ( const x of [ 3, 9 ] ) {
				for ( const y of [ 3, 9 ] ) {
					circle( p, x, y, 0.75, true );
				}
			}
		},
	],
	'dot-rings': [
		24,
		( p ) => {
			circle( p, 12, 12, 7 );
			circle( p, 12, 12, 1.5, true );
			circle( p, 0, 0, 1.5, true );
		},
	],
	'square-dots': [ 16, ( p ) => p.fillRect( 6, 6, 4, 4 ) ],
	'diamond-grid': [
		24,
		( p ) => {
			diamond( p, 6, 6, 3.5, true );
			diamond( p, 18, 18, 3.5, true );
		},
	],
	'hollow-diamonds': [ 24, ( p ) => diamond( p, 12, 12, 8 ) ],
	honeycomb: [
		[ 14, 42 ],
		( p ) => {
			for ( const [ x, y ] of [
				[ 7, 14 ],
				[ 0, 35 ],
			] ) {
				polygon( p, [
					[ x, y - 14 ],
					[ x + 7, y - 7 ],
					[ x + 7, y + 7 ],
					[ x, y + 14 ],
					[ x - 7, y + 7 ],
					[ x - 7, y - 7 ],
				] );
			}
		},
	],
	'triangle-grid': [
		24,
		( p ) => {
			line( p, [
				[ 0, 0 ],
				[ 24, 0 ],
			] );
			line( p, [
				[ 0, 12 ],
				[ 24, 12 ],
			] );
			line( p, [
				[ 0, 0 ],
				[ 12, 12 ],
				[ 24, 0 ],
			] );
			line( p, [
				[ 0, 12 ],
				[ 12, 24 ],
				[ 24, 12 ],
			] );
		},
	],
	'tessellated-triangles': [
		24,
		( p ) => {
			polygon(
				p,
				[
					[ 1, 1 ],
					[ 11, 1 ],
					[ 1, 11 ],
				],
				true
			);
			polygon(
				p,
				[
					[ 13, 13 ],
					[ 23, 13 ],
					[ 13, 23 ],
				],
				true
			);
			polygon(
				p,
				[
					[ 23, 1 ],
					[ 23, 11 ],
					[ 13, 11 ],
				],
				true
			);
			polygon(
				p,
				[
					[ 11, 13 ],
					[ 11, 23 ],
					[ 1, 23 ],
				],
				true
			);
		},
	],
	isometric: [
		24,
		( p ) => {
			polygon( p, [
				[ 12, 0 ],
				[ 24, 6 ],
				[ 24, 18 ],
				[ 12, 24 ],
				[ 0, 18 ],
				[ 0, 6 ],
			] );
			line( p, [
				[ 0, 6 ],
				[ 12, 12 ],
				[ 24, 6 ],
			] );
			line( p, [
				[ 12, 12 ],
				[ 12, 24 ],
			] );
		},
	],
	octagons: [
		24,
		( p ) => {
			polygon( p, [
				[ 7, 1 ],
				[ 17, 1 ],
				[ 23, 7 ],
				[ 23, 17 ],
				[ 17, 23 ],
				[ 7, 23 ],
				[ 1, 17 ],
				[ 1, 7 ],
			] );
		},
	],
	arches: [
		24,
		( p ) => {
			arc( p, 12, 14, 9, Math.PI, TAU );
			line( p, [
				[ 3, 14 ],
				[ 3, 23 ],
			] );
			line( p, [
				[ 21, 14 ],
				[ 21, 23 ],
			] );
		},
	],
	scallops: [
		24,
		( p ) => {
			arc( p, 12, 0, 12, 0, Math.PI );
			arc( p, 0, 12, 12, 0, Math.PI );
			arc( p, 24, 12, 12, 0, Math.PI );
		},
	],
	'fan-waves': [
		32,
		( p ) => {
			for ( const r of [ 4, 8, 12, 16 ] ) {
				arc( p, 16, 16, r, Math.PI, TAU );
				arc( p, 0, 32, r, Math.PI, TAU );
				arc( p, 32, 32, r, Math.PI, TAU );
			}
		},
	],
	'concentric-rings': [
		28,
		( p ) => {
			for ( const r of [ 3, 7, 11 ] ) {
				circle( p, 14, 14, r );
			}
		},
	],
	ripples: [
		32,
		( p ) => {
			for ( const dy of [ 4, 12, 20, 28 ] ) {
				p.beginPath();
				p.moveTo( 0, dy );
				p.bezierCurveTo( 8, dy - 6, 8, dy - 6, 16, dy );
				p.bezierCurveTo( 24, dy + 6, 24, dy + 6, 32, dy );
				p.stroke();
			}
		},
	],
	petals: [
		24,
		( p ) => {
			for ( let i = 0; i < 4; i++ ) {
				p.save();
				p.translate( 12, 12 );
				p.rotate( ( i * Math.PI ) / 2 );
				p.beginPath();
				p.ellipse( 0, -5, 2.6, 4.5, 0, 0, TAU );
				p.fill();
				p.restore();
			}
		},
	],
	daisies: [
		28,
		( p ) => {
			for ( let i = 0; i < 8; i++ ) {
				const a = ( i * TAU ) / 8;
				p.beginPath();
				p.ellipse(
					14 + 6 * Math.cos( a ),
					14 + 6 * Math.sin( a ),
					3.8,
					1.5,
					a,
					0,
					TAU
				);
				p.fill();
			}
			circle( p, 14, 14, 2.2, true );
		},
	],
	clover: [
		24,
		( p ) => {
			for ( const [ x, y ] of [
				[ 8, 8 ],
				[ 16, 8 ],
				[ 8, 16 ],
				[ 16, 16 ],
			] ) {
				circle( p, x, y, 4, true );
			}
		},
	],
	'seed-pods': [
		24,
		( p ) => {
			p.beginPath();
			p.ellipse( 7, 7, 2, 5, -0.7, 0, TAU );
			p.ellipse( 18, 18, 2, 5, 0.7, 0, TAU );
			p.fill();
		},
	],
	leaves: [
		28,
		( p ) => {
			line( p, [
				[ 14, 0 ],
				[ 14, 28 ],
			] );
			for ( const [ x, y, a ] of [
				[ 9, 8, -0.6 ],
				[ 19, 21, 0.6 ],
			] ) {
				p.beginPath();
				p.ellipse( x, y, 3, 7, a, 0, TAU );
				p.fill();
			}
		},
	],
	'woven-check': [
		24,
		( p ) => {
			p.fillRect( 0, 0, 10, 10 );
			p.fillRect( 12, 12, 10, 10 );
			for ( let i = 1; i < 10; i += 3 ) {
				p.fillRect( 12 + i, 0, 1, 10 );
				p.fillRect( 0, 12 + i, 10, 1 );
			}
		},
	],
	plaid: [
		32,
		( p ) => {
			p.globalAlpha = 0.4;
			p.fillRect( 4, 0, 7, 32 );
			p.fillRect( 0, 4, 32, 7 );
			p.globalAlpha = 1;
			p.fillRect( 17, 0, 1, 32 );
			p.fillRect( 20, 0, 1, 32 );
			p.fillRect( 0, 17, 32, 1 );
			p.fillRect( 0, 20, 32, 1 );
		},
	],
	terrazzo: [
		32,
		( p ) => {
			polygon(
				p,
				[
					[ 2, 3 ],
					[ 9, 2 ],
					[ 8, 8 ],
					[ 4, 10 ],
				],
				true
			);
			polygon(
				p,
				[
					[ 19, 5 ],
					[ 25, 7 ],
					[ 22, 13 ],
				],
				true
			);
			polygon(
				p,
				[
					[ 10, 20 ],
					[ 16, 15 ],
					[ 18, 23 ],
					[ 15, 26 ],
				],
				true
			);
			polygon(
				p,
				[
					[ 27, 24 ],
					[ 34, 27 ],
					[ 31, 31 ],
					[ 25, 29 ],
				],
				true
			);
			circle( p, 5, 27, 1.3, true );
		},
	],
	confetti: [
		28,
		( p ) => {
			for ( const [ x, y, a ] of [
				[ 5, 6, 0.3 ],
				[ 21, 8, 1.1 ],
				[ 13, 19, -0.6 ],
				[ 27, 26, 0.8 ],
			] ) {
				p.save();
				p.translate( x, y );
				p.rotate( a );
				p.fillRect( -1.5, -3, 3, 6 );
				p.restore();
			}
		},
	],
	sprinkles: [
		24,
		( p ) => {
			p.lineWidth = 1.6;
			p.lineCap = 'round';
			for ( const [ x, y, a ] of [
				[ 4, 4, 0.3 ],
				[ 16, 6, 1.7 ],
				[ 8, 17, 2.5 ],
				[ 21, 21, 0.6 ],
			] ) {
				line( p, [
					[ x - 2 * Math.cos( a ), y - 2 * Math.sin( a ) ],
					[ x + 2 * Math.cos( a ), y + 2 * Math.sin( a ) ],
				] );
			}
		},
	],
	stipple: [
		24,
		( p ) => {
			for ( let i = 0; i < 26; i++ ) {
				const x = ( ( ( i * 97 + 31 ) % 229 ) / 229 ) * 24;
				const y = ( ( ( i * i * 47 + 19 ) % 233 ) / 233 ) * 24;
				circle( p, x, y, 0.45 + ( i % 3 ) * 0.18, true );
			}
		},
	],
};

/** Returns null for the original patterns, whose renderer remains unchanged. */
export function extraPatternTile( kind, color ) {
	const recipe = Object.prototype.hasOwnProperty.call( TILES, kind )
		? TILES[ kind ]
		: null;
	if ( ! recipe ) {
		return null;
	}
	const [ size, paint ] = recipe;
	const [ width, height ] = Array.isArray( size ) ? size : [ size, size ];
	const tile = createCanvas( width, height );
	const p = tile.getContext( '2d' );
	for ( let y = -1; y <= 1; y++ ) {
		for ( let x = -1; x <= 1; x++ ) {
			p.save();
			p.translate( x * width, y * height );
			p.fillStyle = color;
			p.strokeStyle = color;
			p.lineWidth = 1;
			paint( p );
			p.restore();
		}
	}
	return tile;
}
