/** Crown: a band in two halves with points, jewels from the motif, a glue tab. */
import { bg, outline, patternIn, motifAt, label, dashed } from '../common.js';
import { r } from '../../engine/units.js';

export const ITEM = {
	id: 'crown',
	label: 'Crown',
	hint: 'A paper crown in three or four pieces to glue into a band: points along the top, the motif as jewels, a name on the front.',
	group: 'decor',
	uses: { text: true, names: false, photo: 'none', event: [] },
	textLabel: 'Name on the crown',
	placeholder: 'Mia',
	sizes: [
		{
			label: 'Child (3 pieces, 51 cm)',
			w: 170,
			h: 90,
			parts: 3,
			points: 4,
		},
		{
			label: 'Adult (4 pieces, 60 cm)',
			w: 150,
			h: 110,
			parts: 4,
			points: 4,
		},
		{
			label: 'Toddler (3 pieces, 48 cm)',
			w: 160,
			h: 80,
			parts: 3,
			points: 4,
		},
	],
	repeat: false,
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const w = item.w || 170;
		const h = item.h || 90;
		const points = Math.max( 3, item.points || 4 );
		const tab = 12;
		const bandH = h * 0.5;
		const pieces = [
			...Array( Math.max( 2, Math.min( 6, item.parts || 3 ) ) ),
		].map( ( _, half ) => {
			const W = w + tab;
			const pts = [ [ 0, h ] ];
			const seg = w / points;
			for ( let i = 0; i < points; i++ ) {
				pts.push( [ i * seg, h - bandH ] );
				pts.push( [ i * seg + seg / 2, 0 ] );
			}
			pts.push( [ w, h - bandH ] );
			pts.push( [ w, h - bandH * 0.9 ] );
			pts.push( [ W, h - bandH * 0.8 ] );
			pts.push( [ W, h - bandH * 0.1 ] );
			pts.push( [ w, h ] );
			const d =
				'M' +
				pts
					.map( ( p ) => r( p[ 0 ] ) + ' ' + r( p[ 1 ] ) )
					.join( 'L' ) +
				'Z';
			const shape = { d, pts, w: W, h };
			const fill =
				half % 2 ? theme.colors.secondary : theme.colors.primary;
			const parts = [ bg( shape, fill ) ];
			if ( false !== item.pattern ) {
				parts.push(
					patternIn( shape, theme, {
						seed: 200 + half,
						opacity: 0.25,
						scale: 0.6,
						sheetBg: '#ffffff',
					} )
				);
			}
			if ( false !== item.motif && theme.motif ) {
				const size = Math.min( seg * 0.4, bandH * 0.6 );
				for ( let i = 0; i < points; i++ ) {
					parts.push(
						motifAt(
							theme.motif,
							i * seg + seg / 2 - size / 2,
							h -
								bandH * 0.55 -
								size / 2 +
								( item.text && ! half ? -bandH * 0.15 : 0 ),
							size,
							theme,
							{ on: fill }
						)
					);
				}
			}
			if ( item.text && ! half ) {
				parts.push(
					label(
						item.text,
						{
							x: w * 0.2,
							y: h - bandH * 0.42,
							w: w * 0.6,
							h: bandH * 0.36,
						},
						{
							font: theme.displayFont,
							weight: 700,
							color: theme.colors.bg,
							maxSize: bandH * 0.34,
						},
						env
					)
				);
			}
			parts.push( dashed( w, h - bandH * 0.9, w, h, theme.colors.ink ) );
			parts.push( outline( shape, theme.colors.ink, 0.25 ) );
			return { inner: parts.join( '' ), w: W, h };
		} );
		return { pieces, warnings: [] };
	},
};
