/** Party hat: a cone net (a sector) with a glue tab, the pattern and the motif. */
import { SHAPES, bg, outline, patternIn, motifAt } from './common.js';

export const ITEM = {
	id: 'partyhat',
	label: 'Party hat',
	hint: 'A cone hat to cut, roll and glue, with the pattern and the motif.',
	group: 'decor',
	uses: { text: false, names: false, photo: 'none', event: [] },
	sizes: [
		{ label: 'Standard (110 mm, A4)', r: 110 },
		{ label: 'Small (90 mm)', r: 90 },
		{ label: 'Tall (150 mm, A4 landscape)', r: 150 },
	],
	repeat: true,
	render( item, ctx ) {
		const theme = ctx.theme;
		const R = item.r || 110;
		const sweep = Math.PI * 0.64;
		const shape = SHAPES.sector( R, sweep );
		const n = Math.max( 1, item.count || 1 );
		const pieces = [ ...Array( n ) ].map( ( _, i ) => {
			const parts = [
				bg(
					shape,
					i % 2 ? theme.colors.secondary : theme.colors.primary
				),
			];
			if ( false !== item.pattern ) {
				parts.push(
					patternIn( shape, theme, { seed: i + 29, opacity: 0.25 } )
				);
			}
			if ( false !== item.motif && theme.motif ) {
				const size = R * 0.3;
				parts.push(
					motifAt(
						theme.motif,
						shape.w / 2 - size / 2,
						R * 0.55,
						size,
						theme,
						{
							on:
								i % 2
									? theme.colors.secondary
									: theme.colors.primary,
						}
					)
				);
			}
			// Glue tab along the right edge of the sector.
			const a1 = Math.PI / 2 + sweep / 2;
			const cx = shape.w / 2;
			const tab = R * 0.1;
			const ex = cx + Math.cos( a1 ) * R;
			const ey = Math.sin( a1 ) * R;
			const nx = Math.cos( a1 + Math.PI / 2 );
			const ny = Math.sin( a1 + Math.PI / 2 );
			const pts = [
				[ cx, 0 ],
				[ ex, ey ],
				[ ex - nx * tab, ey - ny * tab ],
				[ cx - nx * tab * 0.4, tab * 0.6 ],
			];
			parts.push(
				`<path d="M${ pts
					.map(
						( p ) => p[ 0 ].toFixed( 2 ) + ' ' + p[ 1 ].toFixed( 2 )
					)
					.join( 'L' ) }Z" fill="${ theme.colors.bg }" stroke="${
					theme.colors.ink
				}" stroke-width="0.25" stroke-dasharray="2 1.5"/>`
			);
			parts.push( outline( shape, theme.colors.ink, 0.3 ) );
			return { inner: parts.join( '' ), w: shape.w, h: shape.h };
		} );
		return { pieces, warnings: [] };
	},
};
