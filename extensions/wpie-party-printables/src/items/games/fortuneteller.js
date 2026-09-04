/**
 * Fortune teller (the folded paper game): a square with four coloured
 * corners, eight numbers in the ring and eight fortunes from the lines
 * in the middle, fold lines on the diagonals and the middle lines.
 */
import { SHAPES, bg, outline, dashed, motifAt, label } from '../common.js';
import { readableOn } from '../palette.js';
import { textEl } from '../../engine/svg.js';
import { r } from '../../engine/units.js';

export const ITEM = {
	id: 'fortuneteller',
	label: 'Fortune teller',
	hint: 'The folded paper game: four colours on the corners, eight numbers, eight fortunes from your lines under the flaps.',
	group: 'games',
	uses: { text: 'lines', names: false, photo: 'none', event: [] },
	textLabel: 'Eight fortunes, one per line',
	placeholder:
		'You will get cake\nA surprise is coming\nSing a song\nDance with the host\nYou win a prize\nTell a secret\nHug your neighbour\nMake a wish',
	sizes: [
		{ label: '190 mm square (A4)', s: 190 },
		{ label: '140 mm square', s: 140 },
		{ label: '270 mm square (A3)', s: 270 },
	],
	repeat: true,
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const t = ctx.t;
		const S = item.s || 190;
		const ink = theme.colors.ink;
		const lines = String( item.text || '' )
			.split( '\n' )
			.map( ( s ) => s.trim() )
			.filter( Boolean );
		const fortunes = [ ...Array( 8 ) ].map(
			( _, i ) => lines[ i % Math.max( 1, lines.length ) ] || t( 'Yes' )
		);
		const shape = SHAPES.rect( S, S );
		const parts = [ bg( shape, theme.colors.bg ) ];
		const C = S / 2;
		const fills = [
			theme.colors.primary,
			theme.colors.secondary,
			theme.colors.accent,
			theme.colors.primary,
		];
		// Corner triangles.
		const corners = [
			[
				[ 0, 0 ],
				[ C, 0 ],
				[ 0, C ],
			],
			[
				[ S, 0 ],
				[ S, C ],
				[ C, 0 ],
			],
			[
				[ S, S ],
				[ C, S ],
				[ S, C ],
			],
			[
				[ 0, S ],
				[ 0, C ],
				[ C, S ],
			],
		];
		corners.forEach( ( tri, i ) => {
			parts.push(
				`<path d="M${ tri
					.map( ( p ) => r( p[ 0 ] ) + ' ' + r( p[ 1 ] ) )
					.join( 'L' ) }Z" fill="${ fills[ i ] }"/>`
			);
			const cx = ( tri[ 0 ][ 0 ] + tri[ 1 ][ 0 ] + tri[ 2 ][ 0 ] ) / 3;
			const cy = ( tri[ 0 ][ 1 ] + tri[ 1 ][ 1 ] + tri[ 2 ][ 1 ] ) / 3;
			if ( theme.motif ) {
				parts.push(
					motifAt(
						theme.motif,
						cx - S * 0.05,
						cy - S * 0.05,
						S * 0.1,
						theme,
						{ on: fills[ i ] }
					)
				);
			}
		} );
		// Ring: eight triangles between the diamond of the midpoints and the inner diamond.
		const mids = [
			[ C, 0 ],
			[ S, C ],
			[ C, S ],
			[ 0, C ],
		];
		const inner = [
			[ C, S / 4 ],
			[ ( 3 * S ) / 4, C ],
			[ C, ( 3 * S ) / 4 ],
			[ S / 4, C ],
		];
		const corners2 = [
			[ 0, 0 ],
			[ S, 0 ],
			[ S, S ],
			[ 0, S ],
		];
		let n = 1;
		for ( let q = 0; q < 4; q++ ) {
			const m = mids[ q ];
			const m2 = mids[ ( q + 1 ) % 4 ];
			const corner = corners2[ ( q + 1 ) % 4 ];
			// Two number triangles per quadrant: mid -> corner side, split by the diagonal.
			const tris = [
				[
					m,
					[
						( m[ 0 ] + corner[ 0 ] ) / 2 + ( C - m[ 0 ] ) * 0,
						( m[ 1 ] + corner[ 1 ] ) / 2,
					],
					[ C, C ],
				],
				[
					m2,
					[
						( m2[ 0 ] + corner[ 0 ] ) / 2,
						( m2[ 1 ] + corner[ 1 ] ) / 2,
					],
					[ C, C ],
				],
			];
			for ( const tri of tris ) {
				const cx =
					( tri[ 0 ][ 0 ] * 0.6 +
						tri[ 1 ][ 0 ] * 0.6 +
						tri[ 2 ][ 0 ] * 0.8 ) /
					2;
				const cy =
					( tri[ 0 ][ 1 ] * 0.6 +
						tri[ 1 ][ 1 ] * 0.6 +
						tri[ 2 ][ 1 ] * 0.8 ) /
					2;
				parts.push(
					`<circle cx="${ r( cx ) }" cy="${ r( cy ) }" r="${ r(
						S * 0.035
					) }" fill="${
						theme.colors.bg
					}" stroke="${ ink }" stroke-width="0.3"/>`
				);
				parts.push(
					textEl( cx, cy + S * 0.013, String( n ), {
						size: ( S * 0.036 ).toFixed( 2 ),
						font: theme.displayFont,
						weight: 700,
						fill: ink,
						anchor: 'middle',
					} )
				);
				n++;
			}
		}
		// Inner diamond: eight small triangles with the fortunes.
		parts.push(
			`<path d="M${ inner
				.map( ( p ) => r( p[ 0 ] ) + ' ' + r( p[ 1 ] ) )
				.join( 'L' ) }Z" fill="${
				theme.colors.bg
			}" stroke="${ ink }" stroke-width="0.25"/>`
		);
		const boxes = [
			{ x: C - S * 0.2, y: S * 0.27, w: S * 0.18, h: S * 0.09 },
			{ x: C + S * 0.02, y: S * 0.27, w: S * 0.18, h: S * 0.09 },
			{ x: S * 0.55, y: C - S * 0.2, w: S * 0.16, h: S * 0.1 },
			{ x: S * 0.55, y: C + S * 0.06, w: S * 0.16, h: S * 0.1 },
			{ x: C + S * 0.02, y: S * 0.64, w: S * 0.18, h: S * 0.09 },
			{ x: C - S * 0.2, y: S * 0.64, w: S * 0.18, h: S * 0.09 },
			{ x: S * 0.29, y: C + S * 0.06, w: S * 0.16, h: S * 0.1 },
			{ x: S * 0.29, y: C - S * 0.2, w: S * 0.16, h: S * 0.1 },
		];
		boxes.forEach( ( b, i ) => {
			parts.push(
				label(
					fortunes[ i ],
					b,
					{
						font: theme.textFont,
						weight: 400,
						color: ink,
						maxSize: S * 0.022,
					},
					env
				)
			);
		} );
		// Fold lines.
		const folds = [
			[ 0, 0, S, S ],
			[ S, 0, 0, S ],
			[ C, 0, C, S ],
			[ 0, C, S, C ],
			[ C, 0, S, C ],
			[ S, C, C, S ],
			[ C, S, 0, C ],
			[ 0, C, C, 0 ],
		];
		for ( const f of folds ) {
			parts.push( dashed( f[ 0 ], f[ 1 ], f[ 2 ], f[ 3 ], ink ) );
		}
		parts.push( outline( shape, ink, 0.3 ) );
		void readableOn;
		return {
			pieces: [ { inner: parts.join( '' ), w: S, h: S, folds } ],
			warnings: [],
		};
	},
};
