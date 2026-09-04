/** Table numbers: a tent or a flat card per table with the number big. */
import { SHAPES, cardFrame, label, motifAt, outline } from '../common.js';

export const ITEM = {
	id: 'tablenumbers',
	label: 'Table numbers',
	hint: 'One card per table with the number big, as a tent card or flat; the event title under it.',
	group: 'cards',
	uses: { text: false, names: false, photo: 'none', event: [ 'title' ] },
	sizes: [
		{ label: 'Tent 100 x 100 mm', w: 100, h: 100, tent: true },
		{ label: 'Flat A6 (105 x 148 mm)', w: 105, h: 148, tent: false },
		{ label: 'Tent 120 x 90 mm', w: 120, h: 90, tent: true },
	],
	repeat: false,
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const w = item.w || 100;
		const h = item.h || 100;
		const n = Math.max( 1, Math.min( 60, item.count || 10 ) );
		const start = Math.max( 1, item.start || 1 );
		const pieces = [];
		for ( let i = 0; i < n; i++ ) {
			const num = String( start + i );
			const H = item.tent ? h * 2 : h;
			const shape = SHAPES.rect( w, H );
			const parts = [
				`<path d="${ shape.d }" fill="${ theme.colors.bg }"/>`,
			];
			const face = ( y0 ) => {
				const g = [
					`<g transform="translate(0 ${ y0.toFixed(
						2
					) })">${ cardFrame( SHAPES.rect( w, h ), theme, {
						band: 'bottom',
						bandSize: h * 0.1,
						seed: 11 + i,
					} ) }`,
				];
				if ( false !== item.motif && theme.motif ) {
					const size = h * 0.16;
					g.push(
						motifAt(
							theme.motif,
							w / 2 - size / 2,
							h * 0.06,
							size,
							theme
						)
					);
				}
				g.push(
					label(
						num,
						{ x: w * 0.1, y: h * 0.24, w: w * 0.8, h: h * 0.44 },
						{
							font: theme.displayFont,
							weight: 700,
							color: theme.colors.ink,
							maxSize: h * 0.42,
						},
						env
					)
				);
				if ( ctx.event.title ) {
					g.push(
						label(
							ctx.event.title,
							{
								x: w * 0.1,
								y: h * 0.72,
								w: w * 0.8,
								h: h * 0.12,
							},
							{
								font: theme.textFont,
								weight: 400,
								color: theme.colors.accent,
								maxSize: h * 0.06,
							},
							env
						)
					);
				}
				g.push( '</g>' );
				return g.join( '' );
			};
			parts.push( face( item.tent ? h : 0 ) );
			if ( item.tent ) {
				// The back half is plain (the importer cannot rotate a mirrored face).
				parts.push(
					`<path d="${ SHAPES.rect( w, h ).d }" fill="${
						theme.colors.primary
					}" fill-opacity="0.12"/>`
				);
			}
			parts.push( outline( shape, theme.colors.ink, 0.25 ) );
			pieces.push( {
				inner: parts.join( '' ),
				w,
				h: H,
				folds: item.tent ? [ [ 0, h, w, h ] ] : [],
			} );
		}
		return { pieces, warnings: [] };
	},
};
