/** Treat bag toppers: a folded card that closes a bag, front with the text and the motif. */
import { SHAPES, bg, outline, patternIn, motifAt, label } from '../common.js';

export const ITEM = {
	id: 'bagtoppers',
	label: 'Treat bag toppers',
	hint: 'A folded topper that closes a treat bag with two staples: the text and the motif on the front.',
	group: 'gifts',
	uses: { text: true, names: 'optional', photo: 'none', event: [ 'title' ] },
	textLabel: 'Text on the topper',
	placeholder: 'Thank you for coming',
	sizes: [
		{ label: '90 x 45 mm folded (6 per A4)', w: 90, h: 45 },
		{ label: '80 x 40 mm folded', w: 80, h: 40 },
		{ label: '120 x 60 mm folded', w: 120, h: 60 },
	],
	repeat: true,
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const w = item.w || 90;
		const h = item.h || 45;
		const texts =
			ctx.event.names &&
			ctx.event.names.length &&
			'names' === item.textFrom
				? ctx.event.names
				: [ item.text || ctx.event.title || '' ];
		const pieces = texts.map( ( text, i ) => {
			const shape = SHAPES.rect( w, 2 * h );
			const parts = [ bg( shape, theme.colors.bg ) ];
			// Back half on top (plain), front half below with the pattern band.
			const front = SHAPES.rect( w, h );
			parts.push(
				`<g transform="translate(0 ${ h.toFixed( 2 ) })"><path d="${
					front.d
				}" fill="${ theme.colors.primary }"/>${
					false !== item.pattern
						? patternIn( front, theme, {
								seed: 130 + i,
								opacity: 0.25,
								scale: 0.5,
						  } )
						: ''
				}</g>`
			);
			const plate = SHAPES.rect( w * 0.7, h * 0.56, { rx: h * 0.1 } );
			parts.push(
				`<g transform="translate(${ ( w * 0.15 ).toFixed( 2 ) } ${ (
					h * 1.22
				).toFixed( 2 ) })"><path d="${ plate.d }" fill="${
					theme.colors.bg
				}"/></g>`
			);
			if ( false !== item.motif && theme.motif ) {
				const size = h * 0.4;
				parts.push(
					motifAt( theme.motif, w * 0.17, h * 1.3, size, theme )
				);
				parts.push(
					label(
						text,
						{
							x: w * 0.17 + size + w * 0.02,
							y: h * 1.28,
							w: w * 0.66 - size,
							h: h * 0.44,
						},
						{
							font: theme.displayFont,
							weight: 700,
							color: theme.colors.ink,
							maxSize: h * 0.22,
						},
						env
					)
				);
			} else {
				parts.push(
					label(
						text,
						{ x: w * 0.18, y: h * 1.28, w: w * 0.64, h: h * 0.44 },
						{
							font: theme.displayFont,
							weight: 700,
							color: theme.colors.ink,
							maxSize: h * 0.24,
						},
						env
					)
				);
			}
			// Two staple marks on the front.
			for ( const x of [ w * 0.12, w * 0.88 ] ) {
				parts.push(
					`<line x1="${ x.toFixed( 2 ) }" y1="${ ( h * 1.82 ).toFixed(
						2
					) }" x2="${ x.toFixed( 2 ) }" y2="${ ( h * 1.92 ).toFixed(
						2
					) }" stroke="${
						theme.colors.ink
					}" stroke-width="0.4" stroke-opacity="0.5"/>`
				);
			}
			parts.push( outline( shape, theme.colors.ink, 0.25 ) );
			return {
				inner: parts.join( '' ),
				w,
				h: 2 * h,
				folds: [ [ 0, h, w, h ] ],
			};
		} );
		return { pieces, warnings: [] };
	},
};
