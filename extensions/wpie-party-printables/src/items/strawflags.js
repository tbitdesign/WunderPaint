/** Straw flags: two flags side by side with a fold, wrapped around a straw. */
import { bg, outline, patternIn, label } from './common.js';
import { readableOn } from './palette.js';

export const ITEM = {
	id: 'strawflags',
	label: 'Straw flags',
	hint: 'Small flags to fold around a straw, with a word or a name.',
	group: 'decor',
	uses: { text: true, names: false, photo: 'none', event: [] },
	sizes: [
		{ label: '60 x 30 mm', w: 60, h: 30 },
		{ label: '50 x 25 mm', w: 50, h: 25 },
		{ label: '70 x 35 mm', w: 70, h: 35 },
	],
	repeat: true,
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const w = item.w || 60;
		const h = item.h || 30;
		const text = item.text || ctx.event.title || 'Cheers';
		const n = Math.max( 1, item.count || 12 );
		const fills = [
			theme.colors.primary,
			theme.colors.secondary,
			theme.colors.accent,
		];
		const pieces = [ ...Array( n ) ].map( ( _, i ) => {
			const fill = fills[ i % 3 ];
			// Two mirrored flags: the whole piece is 2w wide, notches at both ends.
			const W = w * 2;
			const notch = w * 0.16;
			const pts = [
				[ 0, 0 ],
				[ W, 0 ],
				[ W - notch, h / 2 ],
				[ W, h ],
				[ 0, h ],
				[ notch, h / 2 ],
			];
			const shape = {
				d:
					'M' +
					pts
						.map(
							( p ) =>
								p[ 0 ].toFixed( 2 ) + ' ' + p[ 1 ].toFixed( 2 )
						)
						.join( 'L' ) +
					'Z',
				pts,
				w: W,
				h,
			};
			const parts = [ bg( shape, fill ) ];
			if ( false !== item.pattern ) {
				parts.push(
					patternIn( shape, theme, {
						seed: i + 11,
						opacity: 0.2,
						scale: 0.45,
					} )
				);
			}
			const color = readableOn( fill, theme.colors );
			parts.push(
				label(
					text,
					{
						x: notch + w * 0.06,
						y: h * 0.18,
						w: w - notch - w * 0.12,
						h: h * 0.64,
					},
					{
						font: theme.displayFont,
						weight: 700,
						color,
						maxSize: h * 0.5,
					},
					env
				)
			);
			parts.push(
				label(
					text,
					{
						x: w + w * 0.06,
						y: h * 0.18,
						w: w - notch - w * 0.12,
						h: h * 0.64,
					},
					{
						font: theme.displayFont,
						weight: 700,
						color,
						maxSize: h * 0.5,
					},
					env
				)
			);
			parts.push( outline( shape, theme.colors.ink, 0.25 ) );
			return {
				inner: parts.join( '' ),
				w: W,
				h,
				folds: [ [ w, 0, w, h ] ],
			};
		} );
		return { pieces, warnings: [] };
	},
};
