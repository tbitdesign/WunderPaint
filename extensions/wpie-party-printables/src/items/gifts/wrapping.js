/** Wrapping paper: the whole sheet in the pattern with the motif scattered over it. */
import { SHAPES, patternIn, motifAt } from '../common.js';
import { seeded } from '../../engine/rng.js';

export const ITEM = {
	id: 'wrapping',
	label: 'Wrapping paper',
	hint: 'The whole sheet as wrapping paper: the pattern all over, the motif scattered, a word here and there if you like.',
	group: 'gifts',
	uses: { text: true, names: false, photo: 'none', event: [] },
	textLabel: 'A word to scatter (optional)',
	placeholder: '',
	sizes: [
		{ label: 'Whole sheet', fill: 1 },
		{ label: 'Half sheet', fill: 0.5 },
	],
	repeat: false,
	render( item, ctx ) {
		const theme = ctx.theme;
		const sheet = ctx.sheet || { w: 210, h: 297, margin: 8 };
		const w = sheet.w - 2 * ( sheet.margin || 0 );
		const h =
			( sheet.h - 2 * ( sheet.margin || 0 ) ) * ( item.fill || 1 ) -
			( 1 === ( item.fill || 1 ) ? 0 : ( sheet.gap || 4 ) / 2 );
		const shape = SHAPES.rect( w, h );
		const parts = [
			`<path d="${ shape.d }" fill="${
				item.dark ? theme.colors.primary : theme.colors.bg
			}"/>`,
		];
		if ( false !== item.pattern ) {
			parts.push(
				patternIn( shape, theme, {
					seed: 90,
					opacity: 0.45,
					scale: 1.4,
				} )
			);
		}
		if ( false !== item.motif && theme.motif ) {
			const rnd = seeded( 91 );
			const size = Math.min( w, h ) * 0.11;
			const cols = Math.max( 2, Math.round( w / ( size * 2.2 ) ) );
			const rows = Math.max( 2, Math.round( h / ( size * 2.2 ) ) );
			for ( let j = 0; j < rows; j++ ) {
				for ( let i = 0; i < cols; i++ ) {
					const x =
						( ( i + 0.5 + ( j % 2 ? 0.5 : 0 ) ) * w ) / cols -
						size / 2 +
						( rnd() - 0.5 ) * size * 0.3;
					const y =
						( ( j + 0.5 ) * h ) / rows -
						size / 2 +
						( rnd() - 0.5 ) * size * 0.3;
					if (
						x < 1 ||
						y < 1 ||
						x + size > w - 1 ||
						y + size > h - 1
					) {
						continue;
					}
					parts.push(
						motifAt( theme.motif, x, y, size, theme, {
							on: item.dark
								? theme.colors.primary
								: theme.colors.bg,
							flip: !! ( i % 2 ),
						} )
					);
				}
			}
		}
		if ( item.text ) {
			const rnd = seeded( 92 );
			const fs = Math.min( w, h ) * 0.05;
			for ( let k = 0; k < 8; k++ ) {
				const x = 5 + rnd() * ( w - 10 - fs * item.text.length * 0.55 );
				const y = fs + rnd() * ( h - fs * 2 );
				parts.push(
					`<text x="${ x.toFixed( 2 ) }" y="${ y.toFixed(
						2
					) }" font-family="${
						theme.displayFont
					}" font-size="${ fs.toFixed(
						2
					) }" font-weight="700" fill="${
						theme.colors.accent
					}" fill-opacity="0.85">${ String( item.text ).replace(
						/[<&>]/g,
						''
					) }</text>`
				);
			}
		}
		return { pieces: [ { inner: parts.join( '' ), w, h } ], warnings: [] };
	},
};
