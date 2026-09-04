/** Confetti sheet: small shapes in the theme colours to punch or cut. */
import { SHAPES, bg, outline } from '../common.js';

export const CONFETTI_SHAPES = [
	{ value: 'circle', label: 'Circles' },
	{ value: 'star', label: 'Stars' },
	{ value: 'heart', label: 'Hearts' },
	{ value: 'hexagon', label: 'Hexagons' },
];

export const ITEM = {
	id: 'confetti',
	label: 'Confetti sheet',
	hint: 'A sheet of small circles, stars or hearts in the theme colours to punch out for the table.',
	group: 'decor',
	uses: { text: false, names: false, photo: 'none', event: [] },
	sizes: [
		{ label: '20 mm', d: 20 },
		{ label: '15 mm', d: 15 },
		{ label: '30 mm', d: 30 },
	],
	repeat: true,
	render( item, ctx ) {
		const theme = ctx.theme;
		const d = item.d || 20;
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
			theme.colors.ink,
		];
		const pieces = fills.map( ( fill ) => ( {
			inner: bg( shape, fill ) + outline( shape, theme.colors.ink, 0.15 ),
			w: d,
			h: d,
		} ) );
		return { pieces, warnings: [] };
	},
};
