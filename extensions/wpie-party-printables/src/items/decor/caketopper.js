/** Cake topper: a big number or a name on a plaque with a stick tab, one per line. */
import { SHAPES, bg, outline, patternIn, motifAt, label } from '../common.js';

export const TOPPER_PLAQUES = [
	{ value: 'banner', label: 'Banner' },
	{ value: 'circle', label: 'Circle' },
	{ value: 'star', label: 'Star' },
	{ value: 'heart', label: 'Heart' },
];

export const ITEM = {
	id: 'caketopper',
	label: 'Cake topper',
	hint: 'A big number or a name on a plaque with a tab for the stick, one topper per line.',
	group: 'decor',
	uses: { text: 'lines', names: false, photo: 'none', event: [] },
	textLabel: 'One topper per line',
	placeholder: '6\nMia',
	sizes: [
		{ label: '140 x 70 mm', w: 140, h: 70 },
		{ label: '110 x 55 mm', w: 110, h: 55 },
		{ label: '180 x 90 mm', w: 180, h: 90 },
	],
	repeat: false,
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const w = item.w || 140;
		const h = item.h || 70;
		const lines = String( item.text || '' )
			.split( '\n' )
			.map( ( s ) => s.trim() )
			.filter( Boolean );
		const kind = item.shape || 'banner';
		const tabH = h * 0.5;
		const pieces = ( lines.length ? lines : [ '1' ] ).map( ( text, i ) => {
			const plaque =
				'banner' === kind
					? SHAPES.swallowtail( w, h )
					: 'heart' === kind
					? SHAPES.heart( h * 1.1, h * 1.1 )
					: 'star' === kind
					? SHAPES.star( h * 1.25 )
					: SHAPES.circle( h * 1.1 );
			const pw = plaque.w;
			const W = pw;
			const H = plaque.h + tabH;
			const fill = i % 2 ? theme.colors.secondary : theme.colors.primary;
			const parts = [ bg( plaque, fill ) ];
			if ( false !== item.pattern ) {
				parts.push(
					patternIn( plaque, theme, {
						seed: 210 + i,
						opacity: 0.2,
						scale: 0.5,
					} )
				);
			}
			const textBox =
				'banner' === kind
					? { x: pw * 0.1, y: h * 0.12, w: pw * 0.8, h: h * 0.5 }
					: {
							x: pw * 0.18,
							y: plaque.h * 0.3,
							w: pw * 0.64,
							h: plaque.h * 0.4,
					  };
			parts.push(
				label(
					text,
					textBox,
					{
						font: theme.displayFont,
						weight: 700,
						color: theme.colors.bg,
						maxSize: textBox.h * 0.9,
					},
					env
				)
			);
			if ( false !== item.motif && theme.motif && 'banner' === kind ) {
				const size = h * 0.2;
				parts.push(
					motifAt( theme.motif, pw * 0.06, h * 0.08, size, theme, {
						on: fill,
					} )
				);
				parts.push(
					motifAt(
						theme.motif,
						pw * 0.94 - size,
						h * 0.08,
						size,
						theme,
						{ on: fill, flip: true }
					)
				);
			}
			// The tab for the stick.
			const tabW = Math.min( 14, pw * 0.12 );
			const tab = SHAPES.rect( tabW, tabH );
			parts.push(
				`<g transform="translate(${ ( pw / 2 - tabW / 2 ).toFixed(
					2
				) } ${ ( plaque.h - 1 ).toFixed( 2 ) })"><path d="${
					tab.d
				}" fill="${ theme.colors.bg }" stroke="${
					theme.colors.ink
				}" stroke-width="0.25"/></g>`
			);
			parts.push( outline( plaque, theme.colors.ink, 0.25 ) );
			return { inner: parts.join( '' ), w: W, h: H };
		} );
		return { pieces, warnings: [] };
	},
};
