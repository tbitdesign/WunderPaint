/** Medals: a round medal with a ribbon tab, a number, a word or the motif on it, one per line. */
import {
	SHAPES,
	bg,
	outline,
	patternIn,
	motifAt,
	label,
	hole,
} from '../common.js';
import { readableOn } from '../palette.js';

export const ITEM = {
	id: 'medals',
	label: 'Medals',
	hint: 'Round medals with a ribbon tab and a punch hole: a number, a word or the motif on each, one medal per line.',
	group: 'decor',
	uses: { text: 'lines', names: false, photo: 'none', event: [ 'title' ] },
	textLabel: 'One medal per line (a number, a word, or empty for the motif)',
	placeholder: '1\n2\n3\nBest dancer',
	sizes: [
		{ label: '70 mm', d: 70 },
		{ label: '55 mm', d: 55 },
		{ label: '90 mm', d: 90 },
	],
	repeat: false,
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const d = item.d || 70;
		const ink = theme.colors.ink;
		const lines = String( item.text || '' )
			.split( '\n' )
			.map( ( s ) => s.trim() );
		const list = lines.filter( ( s, i ) => s || 0 === i ).length
			? lines
			: [ '1', '2', '3' ];
		const tabH = d * 0.42;
		const tabW = d * 0.36;
		const fills = [
			theme.colors.accent,
			theme.colors.secondary,
			theme.colors.primary,
		];
		const pieces = list.map( ( text, i ) => {
			const fill = fills[ i % 3 ];
			const parts = [];
			// The ribbon tab with a notch, the hole in it.
			const tx = d / 2 - tabW / 2;
			parts.push(
				`<path d="M${ tx.toFixed( 2 ) } 0H${ ( tx + tabW ).toFixed(
					2
				) }V${ ( tabH * 0.9 ).toFixed( 2 ) }L${ ( d / 2 ).toFixed(
					2
				) } ${ ( tabH * 0.7 ).toFixed( 2 ) }L${ tx.toFixed( 2 ) } ${ (
					tabH * 0.9
				).toFixed( 2 ) }Z" fill="${ theme.colors.primary }"/>`
			);
			parts.push(
				`<g transform="translate(${ tx.toFixed( 2 ) } 0)">${ patternIn(
					SHAPES.rect( tabW, tabH * 0.9 ),
					theme,
					{ seed: 410 + i, opacity: 0.3, scale: 0.3 }
				) }</g>`
			);
			parts.push(
				hole( d / 2, tabH * 0.2, Math.min( 2.5, d * 0.035 ), ink )
			);
			const shape = SHAPES.circle( d );
			parts.push(
				`<g transform="translate(0 ${ ( tabH * 0.6 ).toFixed(
					2
				) })">${ bg( shape, fill ) }<circle cx="${ ( d / 2 ).toFixed(
					2
				) }" cy="${ ( d / 2 ).toFixed( 2 ) }" r="${ ( d * 0.4 ).toFixed(
					2
				) }" fill="none" stroke="${
					theme.colors.bg
				}" stroke-width="${ ( d * 0.02 ).toFixed( 2 ) }"/>${ outline(
					shape,
					ink,
					0.3
				) }</g>`
			);
			const color = readableOn( fill, theme.colors );
			const oy = tabH * 0.6;
			if ( text ) {
				parts.push(
					label(
						text,
						{
							x: d * 0.15,
							y: oy + d * 0.22,
							w: d * 0.7,
							h: d * 0.56,
						},
						{
							font: theme.displayFont,
							weight: 700,
							color,
							maxSize: d * 0.5,
						},
						env
					)
				);
			} else if ( theme.motif ) {
				parts.push(
					motifAt(
						theme.motif,
						d * 0.25,
						oy + d * 0.25,
						d * 0.5,
						theme,
						{ on: fill }
					)
				);
			}
			if ( ctx.event.title ) {
				parts.push(
					label(
						ctx.event.title,
						{ x: d * 0.2, y: oy + d * 0.8, w: d * 0.6, h: d * 0.1 },
						{
							font: theme.textFont,
							weight: 400,
							color,
							maxSize: d * 0.06,
							wrap: false,
						},
						env
					)
				);
			}
			return { inner: parts.join( '' ), w: d, h: d + tabH * 0.6 };
		} );
		return { pieces, warnings: [] };
	},
};
