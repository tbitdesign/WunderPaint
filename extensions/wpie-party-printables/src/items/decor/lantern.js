/** Lantern wrap: a band around a glass with windows to cut out, the light shines through. */
import { SHAPES, bg, outline, patternIn, dashed } from '../common.js';

export const LANTERN_WINDOWS = [
	{ value: 'star', label: 'Stars' },
	{ value: 'heart', label: 'Hearts' },
	{ value: 'circle', label: 'Circles' },
	{ value: 'hexagon', label: 'Hexagons' },
];

export const ITEM = {
	id: 'lantern',
	label: 'Lantern wrap',
	hint: 'A band for a glass with a tea light: windows to cut out along the middle, the pattern around them.',
	group: 'decor',
	uses: { text: false, names: false, photo: 'none', event: [] },
	sizes: [
		{ label: '190 x 80 mm (jar)', w: 190, h: 80 },
		{ label: '160 x 65 mm (small glass)', w: 160, h: 65 },
		{ label: '260 x 100 mm (A4 landscape)', w: 260, h: 100 },
	],
	repeat: true,
	render( item, ctx ) {
		const theme = ctx.theme;
		const w = item.w || 190;
		const h = item.h || 80;
		const tab = h * 0.2;
		const n = Math.max( 1, item.count || 3 );
		const kind = item.window || 'star';
		const pieces = [ ...Array( n ) ].map( ( _, i ) => {
			const shape = SHAPES.rect( w, h );
			const fill = i % 2 ? theme.colors.secondary : theme.colors.primary;
			const parts = [ bg( shape, fill ) ];
			if ( false !== item.pattern ) {
				parts.push(
					patternIn( SHAPES.rect( w - tab, h ), theme, {
						seed: 220 + i,
						opacity: 0.25,
						scale: 0.5,
					} )
				);
			}
			parts.push(
				`<path d="${
					SHAPES.rect( tab, h ).d
				}" transform="translate(${ ( w - tab ).toFixed(
					2
				) } 0)" fill="${ theme.colors.bg }" fill-opacity="0.6"/>`
			);
			parts.push( dashed( w - tab, 0, w - tab, h, theme.colors.ink ) );
			// The windows: white with a cut outline.
			const size = h * 0.42;
			const count = Math.max(
				2,
				Math.floor( ( w - tab ) / ( size * 1.7 ) )
			);
			const step = ( w - tab ) / count;
			for ( let k = 0; k < count; k++ ) {
				const win =
					'heart' === kind
						? SHAPES.heart( size, size )
						: SHAPES[ kind ]
						? SHAPES[ kind ]( size )
						: SHAPES.star( size );
				parts.push(
					`<g transform="translate(${ (
						step * ( k + 0.5 ) -
						size / 2
					).toFixed( 2 ) } ${ ( h / 2 - size / 2 ).toFixed(
						2
					) })"><path d="${ win.d }" fill="#ffffff"/><path d="${
						win.d
					}" fill="none" stroke="${
						theme.colors.ink
					}" stroke-width="0.3"/></g>`
				);
			}
			parts.push( outline( shape, theme.colors.ink, 0.25 ) );
			return { inner: parts.join( '' ), w, h };
		} );
		return { pieces, warnings: [] };
	},
};
