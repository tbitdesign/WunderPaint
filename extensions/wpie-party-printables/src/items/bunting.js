/** Bunting: one letter per pennant on a cord; the sheet holds the pennants, the cord goes through two holes. */
import {
	SHAPES,
	bg,
	outline,
	hole,
	patternIn,
	motifAt,
	label,
} from './common.js';
import { lum } from './palette.js';

const PENNANTS = {
	triangle: 'triangle',
	swallowtail: 'swallowtail',
	flag: 'flag',
	scallop: 'scallop',
};

export const ITEM = {
	id: 'bunting',
	label: 'Bunting',
	hint: 'A pennant per letter on a cord: birthday names, welcome words, a whole sentence.',
	group: 'decor',
	uses: { text: true, names: false, photo: 'none', event: [] },
	sizes: [
		{ label: 'Medium (90 x 110 mm, 4 per A4)', w: 90, h: 110 },
		{ label: 'Small (60 x 75 mm, 9 per A4)', w: 60, h: 75 },
		{ label: 'Large (120 x 150 mm, 1 per A4)', w: 120, h: 150 },
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
						'Type the words for the bunting; every letter becomes a pennant.'
					),
				],
			};
		}
		const shapeFn = SHAPES[ PENNANTS[ item.shape ] || 'triangle' ];
		const w = item.w || 90;
		const h = item.h || 110;
		const fills = [
			theme.colors.primary,
			theme.colors.secondary,
			theme.colors.accent,
		];
		const pieces = letters.map( ( ch, i ) => {
			const shape = shapeFn( w, h );
			const fill = fills[ i % 3 ];
			const inkOn =
				lum( fill ) > 170 ? theme.colors.ink : theme.colors.bg;
			const parts = [ bg( shape, fill ) ];
			if ( false !== item.pattern ) {
				parts.push(
					patternIn( shape, theme, {
						seed: i + 1,
						opacity: 0.22,
						scale: 0.9,
					} )
				);
			}
			// A cord band along the top, two holes.
			parts.push(
				`<rect x="0" y="0" width="${ w }" height="${ (
					h * 0.09
				).toFixed( 2 ) }" fill="${
					theme.colors.ink
				}" fill-opacity="0.12"/>`
			);
			parts.push(
				hole(
					w * 0.12,
					h * 0.045,
					Math.min( 3, w * 0.03 ),
					theme.colors.ink
				)
			);
			parts.push(
				hole(
					w * 0.88,
					h * 0.045,
					Math.min( 3, w * 0.03 ),
					theme.colors.ink
				)
			);
			const box = { x: w * 0.14, y: h * 0.13, w: w * 0.72, h: h * 0.42 };
			parts.push(
				label(
					ch,
					box,
					{
						font: theme.displayFont,
						weight: 700,
						color: inkOn,
						maxSize: h * 0.42,
					},
					env
				)
			);
			if ( false !== item.motif && theme.motif ) {
				const size = w * 0.24;
				parts.push(
					motifAt(
						theme.motif,
						w / 2 - size / 2,
						h * 0.58,
						size,
						theme,
						{ on: fill }
					)
				);
			}
			parts.push( outline( shape, theme.colors.ink, 0.25 ) );
			return { inner: parts.join( '' ), w: shape.w, h: shape.h };
		} );
		return { pieces, warnings: [] };
	},
};
