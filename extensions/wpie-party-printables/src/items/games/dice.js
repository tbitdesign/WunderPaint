/** Paper dice: a cube net with dots, words from the lines or motifs on the faces. */
import {
	SHAPES,
	bg,
	outline,
	dashed,
	motifAt,
	label,
	PIPS,
} from '../common.js';
import { MOTIF_IDS } from '../../engine/motifs.js';

export const DICE_MODES = [
	{ value: 'dots', label: 'Dots' },
	{ value: 'words', label: 'Words from the lines' },
	{ value: 'motifs', label: 'Motifs' },
];

export const ITEM = {
	id: 'dice',
	label: 'Paper dice',
	hint: 'A cube to cut, fold and glue: dots, six words from the lines (a story die, a would-you-rather die) or motifs on the faces.',
	group: 'games',
	uses: { text: 'lines', names: false, photo: 'none', event: [] },
	textLabel: 'Six words or phrases, one per line',
	placeholder:
		'Sing\nDance\nTell a joke\nHug someone\nMake a wish\nRoll again',
	sizes: [
		{ label: '40 mm cube (2 per A4)', size: 40 },
		{ label: '30 mm cube', size: 30 },
		{ label: '55 mm cube (1 per A4)', size: 55 },
	],
	repeat: true,
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const F = item.size || 40;
		const flap = F * 0.22;
		const mode = item.mode || 'dots';
		const words = String( item.text || '' )
			.split( '\n' )
			.map( ( s ) => s.trim() )
			.filter( Boolean );
		const motifs = [
			theme.motif,
			...MOTIF_IDS.filter( ( m ) => m !== theme.motif ),
		]
			.filter( Boolean )
			.slice( 0, 6 );
		const faces = [
			[ 1, 0 ],
			[ 0, 1 ],
			[ 1, 1 ],
			[ 2, 1 ],
			[ 3, 1 ],
			[ 1, 2 ],
		];
		const W = 4 * F + flap;
		const H = 3 * F + flap;
		const n = Math.max( 1, item.count || 2 );
		const ink = theme.colors.ink;
		const pieces = [ ...Array( n ) ].map( ( _, idx ) => {
			const parts = [];
			// Glue flaps: along the top of face 0, the right of face 4 and the bottom of face 5.
			const flapShape = ( x, y, fw, fh ) =>
				`<rect x="${ x.toFixed( 2 ) }" y="${ y.toFixed(
					2
				) }" width="${ fw.toFixed( 2 ) }" height="${ fh.toFixed(
					2
				) }" fill="${
					theme.colors.bg
				}" stroke="${ ink }" stroke-width="0.25" stroke-dasharray="2 1.5"/>`;
			parts.push( flapShape( F + F * 0.1, 0, F * 0.8, flap ) );
			parts.push( flapShape( 4 * F, flap + F + F * 0.1, flap, F * 0.8 ) );
			parts.push( flapShape( F + F * 0.1, flap + 3 * F, F * 0.8, flap ) );
			for ( const side of [ 0, 2, 3 ] ) {
				parts.push(
					flapShape(
						F * ( side + 0.1 ),
						flap +
							( 0 === side ? 0 : 2 * F ) +
							( 0 === side ? -flap : 0 ) +
							( 0 === side ? 0 : 0 ),
						F * 0.8,
						flap
					).replace(
						/y="[^"]*"/,
						`y="${ ( 0 === side
							? flap + F - flap
							: flap + 2 * F
						).toFixed( 2 ) }"`
					)
				);
			}
			faces.forEach( ( [ fx, fy ], i ) => {
				const x = fx * F;
				const y = flap + fy * F;
				const face = SHAPES.rect( F, F );
				const fill = i % 2 ? theme.colors.bg : theme.colors.primary;
				const g = [ bg( face, fill ) ];
				const color = i % 2 ? theme.colors.primary : theme.colors.bg;
				if ( 'words' === mode ) {
					g.push(
						label(
							words[ i ] || String( i + 1 ),
							{ x: F * 0.1, y: F * 0.15, w: F * 0.8, h: F * 0.7 },
							{
								font: theme.displayFont,
								weight: 700,
								color: i % 2 ? ink : theme.colors.bg,
								maxSize: F * 0.22,
							},
							env
						)
					);
				} else if ( 'motifs' === mode ) {
					g.push(
						motifAt(
							motifs[ i % motifs.length ] || 'star',
							F * 0.2,
							F * 0.2,
							F * 0.6,
							theme,
							{ on: fill }
						)
					);
				} else {
					for ( const [ px, py ] of PIPS[ i + 1 ] ) {
						g.push(
							`<circle cx="${ ( px * F ).toFixed( 2 ) }" cy="${ (
								py * F
							).toFixed( 2 ) }" r="${ ( F * 0.09 ).toFixed(
								2
							) }" fill="${ color }"/>`
						);
					}
				}
				g.push( outline( face, ink, 0.25 ) );
				parts.push(
					`<g transform="translate(${ x.toFixed( 2 ) } ${ y.toFixed(
						2
					) })">${ g.join( '' ) }</g>`
				);
			} );
			const folds = [
				[ F, flap, F, flap + 3 * F ],
				[ 2 * F, flap, 2 * F, flap + 3 * F ],
				[ 3 * F, flap + F, 3 * F, flap + 2 * F ],
				[ F, flap + F, 4 * F, flap + F ],
				[ F, flap + 2 * F, 4 * F, flap + 2 * F ],
			];
			for ( const f of folds ) {
				parts.push( dashed( f[ 0 ], f[ 1 ], f[ 2 ], f[ 3 ], ink ) );
			}
			void idx;
			return { inner: parts.join( '' ), w: W + flap, h: H + flap };
		} );
		return { pieces, warnings: [] };
	},
};
