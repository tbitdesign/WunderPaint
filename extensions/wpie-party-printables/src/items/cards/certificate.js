/** Certificate: one per guest name, the title from the text, the event, the date and two signature lines. */
import {
	SHAPES,
	cardFrame,
	textStack,
	motifAt,
	outline,
	writeLine,
} from '../common.js';
import { textEl } from '../../engine/svg.js';

export const ITEM = {
	id: 'certificate',
	label: 'Certificate',
	hint: 'An award per guest name: the title from your text (best dancer, bravest pirate), the event, the date and signature lines.',
	group: 'cards',
	uses: {
		text: true,
		names: 'optional',
		photo: 'none',
		event: [ 'title', 'subtitle', 'date', 'host', 'names' ],
	},
	textLabel: 'What the certificate is for',
	placeholder: 'Best dancer of the night',
	sizes: [
		{ label: 'A4 landscape', w: 281, h: 194 },
		{ label: 'A5 landscape (2 per A4)', w: 194, h: 134 },
		{ label: 'A4 (210 x 297 mm)', w: 194, h: 281 },
	],
	repeat: ( item, event ) => ! ( event && event.names && event.names.length ),
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const t = ctx.t;
		const w = item.w || 281;
		const h = item.h || 194;
		const ink = theme.colors.ink;
		const names =
			ctx.event.names && ctx.event.names.length
				? ctx.event.names
				: [ '' ];
		const pieces = names.map( ( name, i ) => {
			const shape = SHAPES.rect( w, h );
			const parts = [
				cardFrame( shape, theme, {
					band: 'none',
					seed: 400 + i,
					inset: Math.min( w, h ) * 0.04,
				} ),
			];
			const inner = Math.min( w, h ) * 0.055;
			parts.push(
				`<rect x="${ inner.toFixed( 2 ) }" y="${ inner.toFixed(
					2
				) }" width="${ ( w - 2 * inner ).toFixed( 2 ) }" height="${ (
					h -
					2 * inner
				).toFixed(
					2
				) }" fill="none" stroke="${ ink }" stroke-width="0.8"/>`
			);
			if ( theme.motif ) {
				const ms = Math.min( w, h ) * 0.11;
				parts.push(
					motifAt( theme.motif, w / 2 - ms / 2, h * 0.08, ms, theme )
				);
				const cs = ms * 0.5;
				for ( const [ x, y ] of [
					[ inner * 1.6, inner * 1.6 ],
					[ w - inner * 1.6 - cs, inner * 1.6 ],
					[ inner * 1.6, h - inner * 1.6 - cs ],
					[ w - inner * 1.6 - cs, h - inner * 1.6 - cs ],
				] ) {
					parts.push( motifAt( theme.motif, x, y, cs, theme ) );
				}
			}
			parts.push(
				textStack(
					[
						{ text: t( 'Certificate' ), role: 'small' },
						{ text: item.text || t( 'Best guest' ), role: 'title' },
						{ text: t( 'awarded to' ), role: 'small' },
						{
							text: name || ' ',
							role: 'strong',
							font: theme.displayFont,
						},
						{ role: 'gap' },
						{
							text: [ ctx.event.title, ctx.event.date ]
								.filter( Boolean )
								.join( ' · ' ),
							role: 'line',
						},
					],
					{ x: w * 0.12, y: h * 0.22, w: w * 0.76, h: h * 0.5 },
					{ theme, maxSize: h * 0.11 },
					env
				).inner
			);
			if ( ! name ) {
				parts.push( writeLine( w * 0.3, h * 0.5, w * 0.4, ink ) );
			}
			const sy = h * 0.85;
			const fs = h * 0.025;
			for ( const [ x, who ] of [
				[ w * 0.16, ctx.event.host || t( 'Host' ) ],
				[ w * 0.56, t( 'Date' ) ],
			] ) {
				parts.push( writeLine( x, sy, w * 0.28, ink ) );
				parts.push(
					textEl( x + w * 0.14, sy + fs * 1.4, who, {
						size: fs.toFixed( 2 ),
						font: theme.textFont,
						fill: ink,
						anchor: 'middle',
					} )
				);
			}
			parts.push( outline( shape, ink, 0.25 ) );
			return { inner: parts.join( '' ), w, h };
		} );
		return { pieces, warnings: [] };
	},
};
