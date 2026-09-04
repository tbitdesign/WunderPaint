/** Coloring page: the motif of the occasion big as an outline, a frame and a name. */
import { SHAPES, bg, outline, outlineMotif, label } from '../common.js';

export const ITEM = {
	id: 'coloring',
	label: 'Coloring page',
	hint: 'The motif of the occasion big as an outline to colour, with a frame and the name of the artist.',
	group: 'games',
	uses: { text: true, names: false, photo: 'none', event: [ 'title' ] },
	textLabel: 'Line under the picture',
	placeholder: 'Coloured by',
	sizes: [
		{ label: 'A4 (210 x 297 mm)', w: 194, h: 281 },
		{ label: 'A5 (148 x 210 mm)', w: 140, h: 200 },
		{ label: 'A4 landscape', w: 281, h: 194 },
	],
	repeat: false,
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const t = ctx.t;
		const w = item.w || 194;
		const h = item.h || 281;
		const ink = theme.colors.ink;
		const shape = SHAPES.rect( w, h );
		const parts = [ bg( shape, '#ffffff' ) ];
		parts.push(
			`<rect x="${ ( w * 0.04 ).toFixed( 2 ) }" y="${ (
				h * 0.03
			).toFixed( 2 ) }" width="${ ( w * 0.92 ).toFixed(
				2
			) }" height="${ ( h * 0.94 ).toFixed(
				2
			) }" fill="none" stroke="${ ink }" stroke-width="0.8"/>`
		);
		parts.push(
			`<rect x="${ ( w * 0.06 ).toFixed( 2 ) }" y="${ (
				h * 0.045
			).toFixed( 2 ) }" width="${ ( w * 0.88 ).toFixed(
				2
			) }" height="${ ( h * 0.91 ).toFixed(
				2
			) }" fill="none" stroke="${ ink }" stroke-width="0.3"/>`
		);
		const motif = theme.motif || 'star';
		const size = Math.min( w * 0.76, h * 0.6 );
		parts.push(
			outlineMotif( motif, w / 2 - size / 2, h * 0.12, size, ink, 0.7 )
		);
		// Small copies in the corners to colour too.
		const small = size * 0.18;
		for ( const [ x, y ] of [
			[ w * 0.1, h * 0.07 ],
			[ w * 0.9 - small, h * 0.07 ],
			[ w * 0.1, h * 0.86 - small ],
			[ w * 0.9 - small, h * 0.86 - small ],
		] ) {
			parts.push( outlineMotif( motif, x, y, small, ink, 0.4 ) );
		}
		const line = [ item.text || t( 'Coloured by' ), ctx.event.title ]
			.filter( Boolean )
			.join( ' · ' );
		parts.push(
			label(
				line,
				{ x: w * 0.12, y: h * 0.86, w: w * 0.76, h: h * 0.05 },
				{
					font: theme.displayFont,
					weight: 700,
					color: ink,
					maxSize: h * 0.035,
					wrap: false,
				},
				env
			)
		);
		parts.push(
			`<line x1="${ ( w * 0.25 ).toFixed( 2 ) }" y1="${ (
				h * 0.935
			).toFixed( 2 ) }" x2="${ ( w * 0.75 ).toFixed( 2 ) }" y2="${ (
				h * 0.935
			).toFixed( 2 ) }" stroke="${ ink }" stroke-width="0.3"/>`
		);
		parts.push( outline( shape, ink, 0.25 ) );
		return { pieces: [ { inner: parts.join( '' ), w, h } ], warnings: [] };
	},
};
