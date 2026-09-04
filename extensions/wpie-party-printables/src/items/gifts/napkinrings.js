/** Napkin rings: a band with a glue tab, the pattern, a motif and a name. */
import {
	SHAPES,
	bg,
	outline,
	patternIn,
	motifAt,
	label,
	dashed,
} from '../common.js';

export const ITEM = {
	id: 'napkinrings',
	label: 'Napkin rings',
	hint: 'Paper bands that close around a napkin, with a glue tab, the motif and a name or a word.',
	group: 'gifts',
	uses: { text: true, names: 'optional', photo: 'none', event: [] },
	textLabel: 'Text on the band',
	placeholder: 'Enjoy',
	sizes: [
		{ label: '180 x 45 mm', w: 180, h: 45 },
		{ label: '160 x 40 mm', w: 160, h: 40 },
		{ label: '200 x 55 mm', w: 200, h: 55 },
	],
	repeat: true,
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const w = item.w || 180;
		const h = item.h || 45;
		const tab = h * 0.5;
		const texts =
			ctx.event.names &&
			ctx.event.names.length &&
			'names' === item.textFrom
				? ctx.event.names
				: [ item.text || '' ];
		const pieces = texts.map( ( text, i ) => {
			const shape = SHAPES.rect( w, h );
			const fill = i % 2 ? theme.colors.secondary : theme.colors.primary;
			const parts = [ bg( shape, fill ) ];
			if ( false !== item.pattern ) {
				parts.push(
					patternIn( SHAPES.rect( w - tab, h ), theme, {
						seed: 110 + i,
						opacity: 0.25,
						scale: 0.5,
					} )
				);
			}
			parts.push(
				`<path d="${
					SHAPES.rect( tab, h ).d
				}" transform="translate(${ ( w - tab ).toFixed(
					2
				) } 0)" fill="${ theme.colors.bg }" fill-opacity="0.6"/>`
			);
			parts.push( dashed( w - tab, 0, w - tab, h, theme.colors.ink ) );
			const mid = ( w - tab ) / 2;
			const plate = SHAPES.rect( w * 0.28, h * 0.62, { rx: h * 0.12 } );
			parts.push(
				`<g transform="translate(${ ( mid - w * 0.14 ).toFixed(
					2
				) } ${ ( h * 0.19 ).toFixed( 2 ) })"><path d="${
					plate.d
				}" fill="${ theme.colors.bg }"/></g>`
			);
			parts.push(
				label(
					text,
					{
						x: mid - w * 0.12,
						y: h * 0.26,
						w: w * 0.24,
						h: h * 0.48,
					},
					{
						font: theme.displayFont,
						weight: 700,
						color: theme.colors.ink,
						maxSize: h * 0.34,
					},
					env
				)
			);
			if ( false !== item.motif && theme.motif ) {
				const size = h * 0.5;
				parts.push(
					motifAt(
						theme.motif,
						mid - w * 0.14 - size - h * 0.15,
						h / 2 - size / 2,
						size,
						theme,
						{ on: fill }
					)
				);
				parts.push(
					motifAt(
						theme.motif,
						mid + w * 0.14 + h * 0.15,
						h / 2 - size / 2,
						size,
						theme,
						{ on: fill, flip: true }
					)
				);
			}
			parts.push( outline( shape, theme.colors.ink, 0.25 ) );
			return { inner: parts.join( '' ), w, h };
		} );
		return { pieces, warnings: [] };
	},
};
