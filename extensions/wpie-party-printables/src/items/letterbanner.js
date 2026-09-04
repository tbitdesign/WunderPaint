/** Letter banner: one big card per letter, hung side by side. */
import {
	SHAPES,
	bg,
	outline,
	hole,
	patternIn,
	motifAt,
	label,
} from './common.js';
import { readableOn } from './palette.js';

export const ITEM = {
	id: 'letterbanner',
	label: 'Letter banner',
	hint: 'One big card per letter for a name or a word across the wall.',
	group: 'decor',
	uses: { text: true, names: false, photo: 'none', event: [] },
	sizes: [
		{ label: '95 x 140 mm (2 per A4)', w: 95, h: 140 },
		{ label: 'A6 (105 x 148 mm)', w: 105, h: 148 },
		{ label: 'A5 (148 x 210 mm)', w: 148, h: 210 },
	],
	repeat: false,
	render( item, ctx, env ) {
		const t = ctx.t;
		const theme = ctx.theme;
		const letters = [ ...String( item.text || '' ).toUpperCase() ].filter(
			( ch ) => ' ' !== ch && '\n' !== ch
		);
		if ( ! letters.length ) {
			return {
				pieces: [],
				warnings: [
					t(
						'Type the word for the banner; every letter becomes a card.'
					),
				],
			};
		}
		const w = item.w || 95;
		const h = item.h || 140;
		const pieces = letters.map( ( ch, i ) => {
			const shape = SHAPES.flag( w, h );
			const fill = i % 2 ? theme.colors.secondary : theme.colors.primary;
			const parts = [ bg( shape, theme.colors.bg ) ];
			if ( false !== item.pattern ) {
				parts.push(
					patternIn( shape, theme, { seed: i + 3, opacity: 0.18 } )
				);
			}
			// A coloured plate for the letter.
			const plate = { x: w * 0.12, y: h * 0.12, w: w * 0.76, h: h * 0.5 };
			parts.push(
				`<rect x="${ plate.x.toFixed( 2 ) }" y="${ plate.y.toFixed(
					2
				) }" width="${ plate.w.toFixed(
					2
				) }" height="${ plate.h.toFixed( 2 ) }" rx="${ (
					w * 0.04
				).toFixed( 2 ) }" fill="${ fill }"/>`
			);
			parts.push(
				label(
					ch,
					{
						x: plate.x,
						y: plate.y + plate.h * 0.08,
						w: plate.w,
						h: plate.h * 0.84,
					},
					{
						font: theme.displayFont,
						weight: 700,
						color: readableOn( fill, theme.colors ),
						maxSize: plate.h * 0.8,
					},
					env
				)
			);
			if ( false !== item.motif && theme.motif ) {
				const size = w * 0.3;
				parts.push(
					motifAt(
						theme.motif,
						w / 2 - size / 2,
						h * 0.64,
						size,
						theme
					)
				);
			}
			parts.push( hole( w * 0.1, h * 0.06, 3, theme.colors.ink ) );
			parts.push( hole( w * 0.9, h * 0.06, 3, theme.colors.ink ) );
			parts.push( outline( shape, theme.colors.ink, 0.25 ) );
			return { inner: parts.join( '' ), w: shape.w, h: shape.h };
		} );
		return { pieces, warnings: [] };
	},
};
