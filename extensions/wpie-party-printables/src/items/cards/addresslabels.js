/**
 * Address labels on the common label sheets. One address per block of
 * lines; a single block repeats over the sheet (return address labels).
 * The presets carry the sheet margin and gap the label sheets use.
 */
import { SHAPES, motifAt, patternIn } from '../common.js';
import { textEl } from '../../engine/svg.js';
import { fitLine } from '../../engine/text.js';
import { blocksOf } from './listcard.js';

export const ITEM = {
	id: 'addresslabels',
	label: 'Address labels',
	hint: 'Labels for the common label sheets: one address per block; a single block repeats as a return address.',
	group: 'cards',
	uses: { text: 'lines', names: false, photo: 'none', event: [] },
	textLabel: 'One address per block, a blank line between',
	placeholder:
		'Anna and Ben Miller\n12 Rose Street\n10115 Berlin\n\nClara Schmidt\n5 Lake Road\n80331 Munich',
	sizes: [
		{ label: '63.5 x 38.1 mm (21 per A4)', w: 63.5, h: 38.1 },
		{ label: '63.5 x 33.9 mm (24 per A4)', w: 63.5, h: 33.9 },
		{ label: '99.1 x 38.1 mm (14 per A4)', w: 99.1, h: 38.1 },
		{ label: '70 x 37 mm (24 per A4)', w: 70, h: 37 },
	],
	repeat: ( item ) => blocksOf( item.text ).length <= 1,
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const w = item.w || 63.5;
		const h = item.h || 38.1;
		const blocks = blocksOf( item.text );
		const list = blocks.length
			? blocks
			: [
					[
						ctx.event.host || ctx.event.title || 'Anna and Ben',
						ctx.event.place || '',
					].filter( Boolean ),
			  ];
		const pieces = list.map( ( block, i ) => {
			const shape = SHAPES.rect( w, h, { rx: 2 } );
			const parts = [
				`<path d="${ shape.d }" fill="${ theme.colors.bg }"/>`,
			];
			const band = SHAPES.rect( w * 0.06, h );
			parts.push(
				`<path d="${ band.d }" fill="${ theme.colors.primary }"/>`
			);
			if ( false !== item.pattern ) {
				parts.push(
					patternIn( band, theme, {
						seed: 70 + i,
						opacity: 0.3,
						scale: 0.3,
					} )
				);
			}
			let x0 = w * 0.1;
			if ( false !== item.motif && theme.motif ) {
				const size = h * 0.34;
				parts.push(
					motifAt(
						theme.motif,
						w * 0.09,
						h / 2 - size / 2,
						size,
						theme
					)
				);
				x0 = w * 0.1 + size + w * 0.03;
			}
			const fs = Math.min(
				h * 0.14,
				w * 0.062,
				( h * 0.8 ) / ( block.length * 1.35 )
			);
			let ly = ( h - block.length * fs * 1.35 ) / 2 + fs;
			for ( const line of block ) {
				const size = fitLine(
					line,
					{
						w: w - x0 - w * 0.04,
						h: fs * 1.3,
						font: theme.textFont,
						weight: 400,
						maxSize: fs,
						minSize: 2,
					},
					env
				).size;
				parts.push(
					textEl( x0, ly, line, {
						size: size.toFixed( 2 ),
						font: theme.textFont,
						fill: theme.colors.ink,
					} )
				);
				ly += fs * 1.35;
			}
			parts.push(
				`<path d="${ shape.d }" fill="none" stroke="${ theme.colors.ink }" stroke-width="0.15" stroke-opacity="0.4"/>`
			);
			return { inner: parts.join( '' ), w, h };
		} );
		return { pieces, warnings: [] };
	},
};
