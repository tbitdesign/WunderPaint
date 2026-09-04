/** Cupcake wrappers: an arc band that wraps around the cup, optionally scalloped. */
import { SHAPES, bg, outline, patternIn, motifAt } from './common.js';

export const ITEM = {
	id: 'cupcakewrap',
	label: 'Cupcake wrappers',
	hint: 'A band that wraps around the cupcake cup, plain or scalloped.',
	group: 'decor',
	uses: { text: false, names: false, photo: 'none', event: [] },
	sizes: [
		{ label: 'Standard', R1: 75, R2: 50 },
		{ label: 'Mini', R1: 55, R2: 38 },
	],
	repeat: true,
	render( item, ctx ) {
		const theme = ctx.theme;
		const R1 = item.R1 || 75;
		const R2 = item.R2 || 50;
		const sweep = Math.PI * 0.62;
		const shape = SHAPES.band( R1, R2, sweep );
		const n = Math.max( 1, item.count || 6 );
		const pieces = [ ...Array( n ) ].map( ( _, i ) => {
			const fill = i % 2 ? theme.colors.secondary : theme.colors.primary;
			const g = [];
			let br = 0;
			if ( item.scallop ) {
				// Bumps centred on the outer arc, drawn first so the band covers their inner halves.
				const k = 9;
				br = ( R1 * sweep ) / k / 2;
				for ( let j = 0; j < k; j++ ) {
					const a = shape.a0 + ( ( j + 0.5 ) * sweep ) / k;
					g.push(
						`<circle cx="${ (
							shape.cx +
							Math.cos( a ) * R1
						).toFixed( 2 ) }" cy="${ (
							shape.cy +
							Math.sin( a ) * R1
						).toFixed( 2 ) }" r="${ br.toFixed(
							2
						) }" fill="${ fill }" stroke="${
							theme.colors.ink
						}" stroke-width="0.25"/>`
					);
				}
			}
			g.push( bg( shape, fill ) );
			if ( false !== item.pattern ) {
				g.push(
					patternIn( shape, theme, {
						seed: i + 23,
						opacity: 0.25,
						scale: 0.8,
					} )
				);
			}
			if ( false !== item.motif && theme.motif ) {
				const size = ( R1 - R2 ) * 0.55;
				g.push(
					motifAt(
						theme.motif,
						shape.w / 2 - size / 2,
						shape.h * 0.32,
						size,
						theme,
						{ on: fill }
					)
				);
			}
			g.push(
				item.scallop
					? `<path d="${ shape.innerAndSides }" fill="none" stroke="${ theme.colors.ink }" stroke-width="0.25"/>`
					: outline( shape, theme.colors.ink, 0.25 )
			);
			// Room for the bumps above and beside the band.
			return {
				inner: `<g transform="translate(${ br.toFixed(
					2
				) } ${ br.toFixed( 2 ) })">${ g.join( '' ) }</g>`,
				w: shape.w + 2 * br,
				h: shape.h + br,
			};
		} );
		return { pieces, warnings: [] };
	},
};
