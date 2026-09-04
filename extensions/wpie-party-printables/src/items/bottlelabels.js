/** Bottle labels: a rounded label with the title, a line of text and the motif. */
import {
	SHAPES,
	bg,
	outline,
	patternIn,
	motifAt,
	label,
	paragraph,
} from './common.js';

export const ITEM = {
	id: 'bottlelabels',
	label: 'Bottle labels',
	hint: 'Labels for water, lemonade or wine bottles with the party title and a line.',
	group: 'gifts',
	uses: {
		text: true,
		names: false,
		photo: 'none',
		event: [ 'title', 'date' ],
	},
	sizes: [
		{ label: '90 x 60 mm', w: 90, h: 60 },
		{ label: '100 x 70 mm', w: 100, h: 70 },
		{ label: '80 x 50 mm', w: 80, h: 50 },
	],
	repeat: true,
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const w = item.w || 90;
		const h = item.h || 60;
		const n = Math.max( 1, item.count || 6 );
		const title = item.text || ctx.event.title || 'Aqua';
		const above =
			ctx.event.title && ctx.event.title !== title ? ctx.event.title : '';
		const line = [ above, ctx.event.subtitle || ctx.event.date || '' ]
			.filter( Boolean )
			.join( ' · ' );
		const shape = SHAPES.rect( w, h, { rx: h * 0.12 } );
		const piece = ( i ) => {
			const parts = [ bg( shape, theme.colors.bg ) ];
			if ( false !== item.pattern ) {
				const band = SHAPES.rect( w, h * 0.28 );
				parts.push(
					`<path d="${ band.d }" fill="${ theme.colors.primary }"/>`
				);
				parts.push(
					patternIn( band, theme, {
						seed: i + 13,
						opacity: 0.25,
						scale: 0.5,
					} )
				);
				parts.push(
					`<g transform="translate(0 ${ ( h * 0.72 ).toFixed(
						2
					) })"><path d="${ band.d }" fill="${
						theme.colors.primary
					}"/>${ patternIn( band, theme, {
						seed: i + 14,
						opacity: 0.25,
						scale: 0.5,
					} ) }</g>`
				);
			}
			if ( false !== item.motif && theme.motif ) {
				parts.push(
					motifAt( theme.motif, w * 0.06, h * 0.33, h * 0.34, theme )
				);
			}
			const box = { x: w * 0.3, y: h * 0.3, w: w * 0.64, h: h * 0.24 };
			parts.push(
				label(
					title,
					box,
					{
						font: theme.displayFont,
						weight: 700,
						color: theme.colors.ink,
						maxSize: h * 0.2,
					},
					env
				)
			);
			if ( line ) {
				parts.push(
					paragraph(
						line,
						{ x: w * 0.3, y: h * 0.55, w: w * 0.64, h: h * 0.14 },
						{
							size: h * 0.075,
							font: theme.textFont,
							color: theme.colors.ink,
						},
						env
					)
				);
			}
			parts.push( outline( shape, theme.colors.ink, 0.25 ) );
			return { inner: parts.join( '' ), w, h };
		};
		return {
			pieces: [ ...Array( n ) ].map( ( _, i ) => piece( i ) ),
			warnings: [],
		};
	},
};
