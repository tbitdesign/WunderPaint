/** Place cards: a tent card per name with a fold line, or a flat card. */
import { SHAPES, bg, outline, patternIn, motifAt, label } from './common.js';

export const ITEM = {
	id: 'placecards',
	label: 'Place cards',
	hint: 'A card per guest, folded as a tent or flat, with the name in the display font.',
	group: 'cards',
	uses: { text: false, names: true, photo: 'none', event: [ 'names' ] },
	sizes: [
		{ label: '90 x 55 mm', w: 90, h: 55 },
		{ label: '100 x 60 mm', w: 100, h: 60 },
		{ label: '80 x 50 mm', w: 80, h: 50 },
	],
	repeat: false,
	render( item, ctx, env ) {
		const t = ctx.t;
		const theme = ctx.theme;
		const w = item.w || 90;
		const h = item.h || 55;
		const tent = false !== item.tent;
		const names =
			ctx.event.names && ctx.event.names.length ? ctx.event.names : [];
		if ( ! names.length ) {
			return {
				pieces: [],
				warnings: [
					t(
						'Add the guests, one name per line, in the Event card.'
					),
				],
			};
		}
		const pieces = names.map( ( name, i ) => {
			const H = tent ? h * 2 : h;
			const shape = SHAPES.rect( w, H );
			const parts = [ bg( shape, theme.colors.bg ) ];
			const frontY = tent ? h : 0;
			if ( false !== item.pattern ) {
				// A band along the bottom edge of the front.
				const band = SHAPES.rect( w, h * 0.32 );
				parts.push(
					`<g transform="translate(0 ${ ( frontY + h * 0.68 ).toFixed(
						2
					) })">${ `<path d="${ band.d }" fill="${ theme.colors.primary }" fill-opacity="0.18"/>` }${ patternIn(
						band,
						theme,
						{ seed: i + 9, opacity: 0.35, scale: 0.6 }
					) }</g>`
				);
			}
			if ( false !== item.motif && theme.motif ) {
				const size = h * 0.34;
				parts.push(
					motifAt(
						theme.motif,
						w * 0.08,
						frontY + h * 0.14,
						size,
						theme
					)
				);
			}
			const box = {
				x: w * 0.3,
				y: frontY + h * 0.12,
				w: w * 0.62,
				h: h * 0.5,
			};
			parts.push(
				label(
					name,
					box,
					{
						font: theme.displayFont,
						weight: 700,
						color: theme.colors.ink,
						maxSize: h * 0.34,
					},
					env
				)
			);
			if ( tent ) {
				// The back half carries the motif upside down is not possible without rotate; leave it plain with a small motif.
				if ( theme.motif ) {
					parts.push(
						motifAt(
							theme.motif,
							w / 2 - h * 0.2,
							h * 0.3,
							h * 0.4,
							theme
						)
					);
				}
			}
			parts.push( outline( shape, theme.colors.ink, 0.25 ) );
			const folds = tent ? [ [ 0, h, w, h ] ] : [];
			return { inner: parts.join( '' ), w: shape.w, h: shape.h, folds };
		} );
		return { pieces, warnings: [] };
	},
};
