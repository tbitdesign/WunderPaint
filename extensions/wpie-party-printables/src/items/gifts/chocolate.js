/** Chocolate bar wrapper: a net for the 100 g bar, the front panel with the title and the motif. */
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
	id: 'chocolate',
	label: 'Chocolate wrapper',
	hint: 'A wrapper for the classic 100 g bar: the front panel with the title and the motif, fold lines for the sides and ends.',
	group: 'gifts',
	uses: {
		text: true,
		names: false,
		photo: 'none',
		event: [ 'title', 'date' ],
	},
	textLabel: 'Title on the front',
	placeholder: 'Sweet thanks',
	sizes: [
		{ label: '100 g bar (155 x 75 mm)', barW: 75, barH: 155, depth: 8 },
		{ label: 'Mini bar (85 x 40 mm)', barW: 40, barH: 85, depth: 6 },
		{ label: 'Large bar (180 x 90 mm)', barW: 90, barH: 180, depth: 10 },
	],
	repeat: true,
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const bw = item.barW || 75;
		const bh = item.barH || 155;
		const dp = item.depth || 8;
		const lap = 10;
		const endFold = Math.min( 20, bh * 0.14 );
		const W = lap + bw + dp + bw + dp;
		const H = bh + 2 * dp + 2 * endFold;
		const n = Math.max( 1, item.count || 2 );
		const pieces = [ ...Array( n ) ].map( ( _, i ) => {
			const shape = SHAPES.rect( W, H );
			const parts = [ bg( shape, theme.colors.primary ) ];
			if ( false !== item.pattern ) {
				parts.push(
					patternIn( shape, theme, {
						seed: 140 + i,
						opacity: 0.3,
						scale: 0.8,
					} )
				);
			}
			// Panels from the left: overlap, back, side, front, side.
			const xs = [
				0,
				lap,
				lap + bw,
				lap + bw + dp,
				lap + bw + dp + bw,
				W,
			];
			const y0 = endFold + dp;
			const front = { x: xs[ 3 ], w: bw };
			const plate = SHAPES.rect( bw * 0.8, bh * 0.5, { rx: bw * 0.06 } );
			parts.push(
				`<g transform="translate(${ ( front.x + bw * 0.1 ).toFixed(
					2
				) } ${ ( y0 + bh * 0.25 ).toFixed( 2 ) })"><path d="${
					plate.d
				}" fill="${ theme.colors.bg }"/></g>`
			);
			if ( false !== item.motif && theme.motif ) {
				const size = bw * 0.36;
				parts.push(
					motifAt(
						theme.motif,
						front.x + bw / 2 - size / 2,
						y0 + bh * 0.28,
						size,
						theme
					)
				);
			}
			parts.push(
				label(
					item.text || ctx.event.title || 'Sweet',
					{
						x: front.x + bw * 0.14,
						y: y0 + bh * 0.52,
						w: bw * 0.72,
						h: bh * 0.14,
					},
					{
						font: theme.displayFont,
						weight: 700,
						color: theme.colors.ink,
						maxSize: bh * 0.07,
					},
					env
				)
			);
			const sub = [
				ctx.event.title !== ( item.text || '' ) ? ctx.event.title : '',
				ctx.event.date,
			]
				.filter( Boolean )
				.join( ' · ' );
			if ( sub ) {
				parts.push(
					label(
						sub,
						{
							x: front.x + bw * 0.14,
							y: y0 + bh * 0.66,
							w: bw * 0.72,
							h: bh * 0.06,
						},
						{
							font: theme.textFont,
							weight: 400,
							color: theme.colors.accent,
							maxSize: bh * 0.03,
						},
						env
					)
				);
			}
			const folds = [];
			for ( const x of xs.slice( 1, 5 ) ) {
				folds.push( [ x, 0, x, H ] );
			}
			for ( const y of [
				endFold,
				endFold + dp,
				H - endFold - dp,
				H - endFold,
			] ) {
				folds.push( [ 0, y, W, y ] );
			}
			for ( const f of folds ) {
				parts.push(
					dashed( f[ 0 ], f[ 1 ], f[ 2 ], f[ 3 ], theme.colors.ink )
				);
			}
			parts.push( outline( shape, theme.colors.ink, 0.25 ) );
			return { inner: parts.join( '' ), w: W, h: H };
		} );
		return { pieces, warnings: [] };
	},
};
