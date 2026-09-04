/** Countdown and advent numbers: cards numbered from one value to another, the motif on each. */
import { SHAPES, bg, outline, patternIn, motifAt, label } from '../common.js';
import { readableOn } from '../palette.js';

export const COUNTDOWN_SHAPES = [
	{ value: 'circle', label: 'Circle' },
	{ value: 'rect', label: 'Square' },
	{ value: 'star', label: 'Star' },
	{ value: 'scallopCircle', label: 'Scallop' },
];

export const ITEM = {
	id: 'countdown',
	label: 'Countdown numbers',
	hint: 'Numbered cards for an advent calendar or a countdown: from a first to a last number, the motif on each.',
	group: 'decor',
	uses: { text: false, names: false, photo: 'none', event: [] },
	sizes: [
		{ label: '50 mm', d: 50 },
		{ label: '40 mm', d: 40 },
		{ label: '65 mm', d: 65 },
	],
	repeat: false,
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const d = item.d || 50;
		const from = Math.round( undefined === item.from ? 1 : item.from );
		const to = Math.round( undefined === item.to ? 24 : item.to );
		const step = to >= from ? 1 : -1;
		const kind = item.shape || 'circle';
		const shape =
			'rect' === kind
				? SHAPES.rect( d, d, { rx: d * 0.12 } )
				: SHAPES[ kind ]
				? SHAPES[ kind ]( d )
				: SHAPES.circle( d );
		const fills = [
			theme.colors.primary,
			theme.colors.secondary,
			theme.colors.accent,
		];
		const pieces = [];
		for (
			let n = from, i = 0;
			step > 0 ? n <= to : n >= to;
			n += step, i++
		) {
			if ( i >= 100 ) {
				break;
			}
			const fill = fills[ i % 3 ];
			const parts = [ bg( shape, fill ) ];
			if ( false !== item.pattern ) {
				parts.push(
					patternIn( shape, theme, {
						seed: 240 + i,
						opacity: 0.2,
						scale: 0.4,
					} )
				);
			}
			if ( false !== item.motif && theme.motif ) {
				const size = d * 0.26;
				parts.push(
					motifAt(
						theme.motif,
						d / 2 - size / 2,
						d * ( 'star' === kind ? 0.2 : 0.14 ),
						size,
						theme,
						{ on: fill }
					)
				);
			}
			parts.push(
				label(
					String( n ),
					{
						x: d * 0.2,
						y: d * ( 'star' === kind ? 0.48 : 0.44 ),
						w: d * 0.6,
						h: d * ( 'star' === kind ? 0.3 : 0.36 ),
					},
					{
						font: theme.displayFont,
						weight: 700,
						color: readableOn( fill, theme.colors ),
						maxSize: d * 0.34,
					},
					env
				)
			);
			parts.push( outline( shape, theme.colors.ink, 0.25 ) );
			pieces.push( { inner: parts.join( '' ), w: d, h: d } );
		}
		return { pieces, warnings: [] };
	},
};
