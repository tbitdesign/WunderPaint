/** Paper fans and rosettes: accordion strips with fold lines, the pattern all over. */
import { SHAPES, bg, outline, patternIn, motifAt, dashed } from '../common.js';

export const ITEM = {
	id: 'fan',
	label: 'Paper fan',
	hint: 'Strips to fold accordion-style into fans and rosettes: fold lines every 15 mm, the pattern all over, two strips make one rosette.',
	group: 'decor',
	uses: { text: false, names: false, photo: 'none', event: [] },
	sizes: [
		{ label: 'Strip 190 x 100 mm (rosette 20 cm)', w: 190, h: 100 },
		{ label: 'Strip 190 x 70 mm (rosette 14 cm)', w: 190, h: 70 },
		{ label: 'Strip 280 x 120 mm (A4 landscape)', w: 280, h: 120 },
	],
	repeat: true,
	render( item, ctx ) {
		const theme = ctx.theme;
		const w = item.w || 190;
		const h = item.h || 100;
		const step = item.step || 15;
		const n = Math.max( 1, item.count || 4 );
		const fills = [ theme.colors.primary, theme.colors.secondary ];
		const pieces = [ ...Array( n ) ].map( ( _, i ) => {
			const shape = SHAPES.rect( w, h );
			const fill = fills[ i % 2 ];
			const parts = [ bg( shape, fill ) ];
			if ( false !== item.pattern ) {
				parts.push(
					patternIn( shape, theme, {
						seed: 180 + i,
						opacity: 0.3,
						scale: 0.7,
					} )
				);
			}
			if ( false !== item.motif && theme.motif ) {
				const size = Math.min( step * 0.8, h * 0.2 );
				for ( let x = step * 1.5; x < w - step; x += step * 2 ) {
					parts.push(
						motifAt(
							theme.motif,
							x - size / 2,
							h / 2 - size / 2,
							size,
							theme,
							{ on: fill }
						)
					);
				}
			}
			const folds = [];
			for ( let x = step; x < w - 0.5; x += step ) {
				folds.push( [ x, 0, x, h ] );
				parts.push( dashed( x, 0, x, h, theme.colors.ink ) );
			}
			parts.push( outline( shape, theme.colors.ink, 0.25 ) );
			return { inner: parts.join( '' ), w, h, folds };
		} );
		return { pieces, warnings: [] };
	},
};
