/** Broad color fields, kept as editable recipes rather than baked thumbnails. */
import { __ } from '@wordpress/i18n';
import { makeFreeform, makeGradientMesh } from './gradient-fields';

export function gradientFieldPresets() {
	const palettes = [
		[
			__( 'Aurora field', 'wunderpaint' ),
			__( 'Aurora mesh', 'wunderpaint' ),
			[ '#092c54', '#3cd9a5', '#7553e8', '#f2b8ef' ],
		],
		[
			__( 'Sunset field', 'wunderpaint' ),
			__( 'Sunset mesh', 'wunderpaint' ),
			[ '#6f25ae', '#ff6b69', '#f7bb57', '#cc417b' ],
		],
		[
			__( 'Ocean field', 'wunderpaint' ),
			__( 'Ocean mesh', 'wunderpaint' ),
			[ '#132753', '#1eaec9', '#b9efe6', '#436ac8' ],
		],
		[
			__( 'Pastel field', 'wunderpaint' ),
			__( 'Pastel mesh', 'wunderpaint' ),
			[ '#e9bbdb', '#fce7c6', '#b8ddd8', '#bebde7' ],
		],
		[
			__( 'Ember field', 'wunderpaint' ),
			__( 'Ember mesh', 'wunderpaint' ),
			[ '#23182e', '#b43b46', '#ef773f', '#f5bb77' ],
		],
		[
			__( 'Forest field', 'wunderpaint' ),
			__( 'Forest mesh', 'wunderpaint' ),
			[ '#123d37', '#5c9771', '#d9d9a0', '#a7bc80' ],
		],
		[
			__( 'Lagoon field', 'wunderpaint' ),
			__( 'Lagoon mesh', 'wunderpaint' ),
			[ '#104d5e', '#43a4a3', '#dfdbac', '#6389b3' ],
		],
		[
			__( 'Porcelain field', 'wunderpaint' ),
			__( 'Porcelain mesh', 'wunderpaint' ),
			[ '#a499a4', '#e7d2b8', '#fff4da', '#b5c5d8' ],
		],
		[
			__( 'Cobalt field', 'wunderpaint' ),
			__( 'Cobalt mesh', 'wunderpaint' ),
			[ '#172a63', '#4867d6', '#c5caeb', '#e7c9b2' ],
		],
		[
			__( 'Copper field', 'wunderpaint' ),
			__( 'Copper mesh', 'wunderpaint' ),
			[ '#3e3043', '#b46a63', '#f2c386', '#788b8a' ],
		],
		[
			__( 'Iris field', 'wunderpaint' ),
			__( 'Iris mesh', 'wunderpaint' ),
			[ '#393768', '#8a79bf', '#cbbce6', '#eccabd' ],
		],
		[
			__( 'Mineral field', 'wunderpaint' ),
			__( 'Mineral mesh', 'wunderpaint' ),
			[ '#244b56', '#649187', '#c8bb81', '#9e7e9d' ],
		],
		[
			__( 'Cherry field', 'wunderpaint' ),
			__( 'Cherry mesh', 'wunderpaint' ),
			[ '#4f2546', '#b74e78', '#f4b6a4', '#e4d799' ],
		],
		[
			__( 'Slate field', 'wunderpaint' ),
			__( 'Slate mesh', 'wunderpaint' ),
			[ '#1d3445', '#638a9e', '#cfdfd6', '#9f9dac' ],
		],
		[
			__( 'Citrus field', 'wunderpaint' ),
			__( 'Citrus mesh', 'wunderpaint' ),
			[ '#285952', '#7fa46d', '#e5d27c', '#f4b697' ],
		],
		[
			__( 'Velvet field', 'wunderpaint' ),
			__( 'Velvet mesh', 'wunderpaint' ),
			[ '#34244b', '#765987', '#c994a0', '#e5c798' ],
		],
	];
	return palettes.flatMap( ( [ freeName, meshName, colors ], i ) => {
		const stops = colors.map( ( color, n ) => ( { at: n / 3, color } ) );
		const freeform = makeFreeform( stops ),
			mesh = makeGradientMesh( stops );
		freeform.points.forEach( ( p, n ) => {
			p.color = colors[ n ];
		} );
		mesh.nodes.forEach( ( p, n ) => {
			p.color = colors[ [ 0, 0, 1, 0, 2, 1, 3, 3, 2 ][ n ] ];
		} );
		mesh.nodes[ 4 ] = {
			...mesh.nodes[ 4 ],
			x: 0.38 + ( i % 3 ) * 0.1,
			y: 0.42 + ( i % 2 ) * 0.16,
			u: { x: 0.55, y: 0.2 },
			v: { x: -0.18, y: 0.55 },
		};
		return [
			{ name: freeName, kind: 'freeform', stops, freeform },
			{ name: meshName, kind: 'mesh', stops, mesh },
		];
	} );
}
