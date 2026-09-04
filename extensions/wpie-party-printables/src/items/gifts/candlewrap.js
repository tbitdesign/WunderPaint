/** Candle wrap: a band around a glass candle with the pattern, the motif and a word. */
import {
	SHAPES,
	bg,
	outline,
	patternIn,
	motifAt,
	label,
	dashed,
} from '../common.js';

export const ITEM = {
	id: 'candlewrap',
	label: 'Candle wrap',
	hint: 'A band that wraps around a glass candle or a jar, with a glue tab, the pattern, the motif and a word.',
	group: 'gifts',
	uses: { text: true, names: false, photo: 'none', event: [ 'title' ] },
	textLabel: 'Text on the band',
	placeholder: 'Light and love',
	sizes: [
		{ label: '190 x 60 mm (jar)', w: 190, h: 60 },
		{ label: '160 x 50 mm (small jar)', w: 160, h: 50 },
		{ label: '260 x 90 mm (A4 landscape)', w: 260, h: 90 },
	],
	repeat: true,
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const w = item.w || 190;
		const h = item.h || 60;
		const tab = h * 0.3;
		const n = Math.max( 1, item.count || 3 );
		const pieces = [ ...Array( n ) ].map( ( _, i ) => {
			const shape = SHAPES.rect( w, h );
			const fill = i % 2 ? theme.colors.secondary : theme.colors.primary;
			const parts = [ bg( shape, fill ) ];
			if ( false !== item.pattern ) {
				parts.push(
					patternIn( SHAPES.rect( w - tab, h ), theme, {
						seed: 160 + i,
						opacity: 0.25,
						scale: 0.6,
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
			const mid = ( w - tab ) / 2;
			const plateW = Math.min( w * 0.36, h * 2.6 );
			const plate = SHAPES.rect( plateW, h * 0.56, { rx: h * 0.1 } );
			parts.push(
				`<g transform="translate(${ ( mid - plateW / 2 ).toFixed(
					2
				) } ${ ( h * 0.22 ).toFixed( 2 ) })"><path d="${
					plate.d
				}" fill="${ theme.colors.bg }"/></g>`
			);
			parts.push(
				label(
					item.text || ctx.event.title || '',
					{
						x: mid - plateW / 2 + plateW * 0.06,
						y: h * 0.28,
						w: plateW * 0.88,
						h: h * 0.44,
					},
					{
						font: theme.displayFont,
						weight: 700,
						color: theme.colors.ink,
						maxSize: h * 0.26,
					},
					env
				)
			);
			if ( false !== item.motif && theme.motif ) {
				const size = h * 0.46;
				for ( const x of [
					mid - plateW / 2 - size * 1.6,
					mid + plateW / 2 + size * 0.6,
				] ) {
					parts.push(
						motifAt(
							theme.motif,
							x,
							h / 2 - size / 2,
							size,
							theme,
							{ on: fill }
						)
					);
				}
			}
			parts.push( outline( shape, theme.colors.ink, 0.25 ) );
			return { inner: parts.join( '' ), w, h };
		} );
		return { pieces, warnings: [] };
	},
};
