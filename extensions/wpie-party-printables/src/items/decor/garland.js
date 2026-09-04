/** Motif garland: shapes with two holes on a cord, the motif on each, three colours in turn. */
import { SHAPES, bg, outline, hole, patternIn, motifAt } from '../common.js';

export const GARLAND_SHAPES = [
	{ value: 'circle', label: 'Circle' },
	{ value: 'heart', label: 'Heart' },
	{ value: 'star', label: 'Star' },
	{ value: 'hexagon', label: 'Hexagon' },
	{ value: 'scallopCircle', label: 'Scallop' },
];

export const ITEM = {
	id: 'garland',
	label: 'Motif garland',
	hint: 'Circles, hearts or stars with the motif and two holes to thread on a cord, in three colours in turn.',
	group: 'decor',
	uses: { text: false, names: false, photo: 'none', event: [] },
	sizes: [
		{ label: '60 mm', d: 60 },
		{ label: '80 mm', d: 80 },
		{ label: '45 mm', d: 45 },
	],
	repeat: true,
	render( item, ctx ) {
		const theme = ctx.theme;
		const d = item.d || 60;
		const kind = item.shape || 'circle';
		const shape =
			'heart' === kind
				? SHAPES.heart( d, d )
				: SHAPES[ kind ]
				? SHAPES[ kind ]( d )
				: SHAPES.circle( d );
		const fills = [
			theme.colors.primary,
			theme.colors.secondary,
			theme.colors.accent,
		];
		const n = Math.max( 1, item.count || 12 );
		const pieces = [ ...Array( n ) ].map( ( _, i ) => {
			const fill = fills[ i % 3 ];
			const parts = [ bg( shape, fill ) ];
			if ( false !== item.pattern ) {
				parts.push(
					patternIn( shape, theme, {
						seed: 170 + i,
						opacity: 0.22,
						scale: 0.45,
					} )
				);
			}
			if ( false !== item.motif && theme.motif ) {
				const size = d * 0.46;
				parts.push(
					motifAt(
						theme.motif,
						d / 2 - size / 2,
						d * ( 'heart' === kind ? 0.22 : 0.3 ),
						size,
						theme,
						{ on: fill }
					)
				);
			}
			const hy = 'star' === kind ? d * 0.36 : d * 0.16;
			parts.push(
				hole( d * 0.3, hy, Math.min( 2, d * 0.03 ), theme.colors.ink )
			);
			parts.push(
				hole( d * 0.7, hy, Math.min( 2, d * 0.03 ), theme.colors.ink )
			);
			parts.push( outline( shape, theme.colors.ink, 0.25 ) );
			return { inner: parts.join( '' ), w: d, h: d };
		} );
		return { pieces, warnings: [] };
	},
};
