/** A deck of 52 cards and two jokers with the event on the aces; the backs on their own sheet. */
import {
	SHAPES,
	cardFrame,
	bg,
	outline,
	patternIn,
	motifAt,
	label,
	glyph,
	SUITS,
	SUIT_IDS,
} from '../common.js';
import { textEl } from '../../engine/svg.js';

const RANKS = [
	'A',
	'2',
	'3',
	'4',
	'5',
	'6',
	'7',
	'8',
	'9',
	'10',
	'J',
	'Q',
	'K',
];

export const ITEM = {
	id: 'deck',
	label: 'Playing cards',
	hint: 'A full deck of 52 cards and two jokers in the theme: the motif on the court cards and the aces, the backs as their own sheet.',
	group: 'games',
	uses: { text: true, names: false, photo: 'none', event: [ 'title' ] },
	textLabel: 'Line on the aces and jokers',
	placeholder: 'Anna & Ben',
	sizes: [
		{ label: 'Poker (63 x 88 mm, 6 per A4)', w: 63, h: 88 },
		{ label: 'Bridge (57 x 89 mm)', w: 57, h: 89 },
		{ label: 'Mini (44 x 63 mm, 12 per A4)', w: 44, h: 63 },
	],
	repeat: ( item ) => 'back' === item.side,
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const t = ctx.t;
		const w = item.w || 63;
		const h = item.h || 88;
		const shape = SHAPES.rect( w, h, { rx: w * 0.06 } );
		const line = item.text || ctx.event.title || '';
		if ( 'back' === item.side ) {
			const parts = [ bg( shape, theme.colors.primary ) ];
			if ( false !== item.pattern ) {
				parts.push(
					patternIn( shape, theme, {
						seed: 290,
						opacity: 0.3,
						scale: 0.4,
					} )
				);
			}
			const inner = SHAPES.rect( w * 0.8, h * 0.86, { rx: w * 0.04 } );
			parts.push(
				`<g transform="translate(${ ( w * 0.1 ).toFixed( 2 ) } ${ (
					h * 0.07
				).toFixed( 2 ) })"><path d="${ inner.d }" fill="none" stroke="${
					theme.colors.bg
				}" stroke-width="0.6"/></g>`
			);
			if ( theme.motif ) {
				parts.push(
					motifAt(
						theme.motif,
						w * 0.3,
						h / 2 - w * 0.2,
						w * 0.4,
						theme,
						{ on: theme.colors.primary }
					)
				);
			}
			parts.push( outline( shape, theme.colors.ink, 0.25 ) );
			return {
				pieces: [ { inner: parts.join( '' ), w, h } ],
				warnings: [],
			};
		}
		const red = theme.colors.accent;
		const black = theme.colors.ink;
		const pieces = [];
		for ( const suit of SUIT_IDS ) {
			const color = 'heart' === suit || 'diamond' === suit ? red : black;
			for ( const rank of RANKS ) {
				const parts = [ bg( shape, theme.colors.bg ) ];
				const fs = w * 0.16;
				parts.push(
					textEl( w * 0.07, fs * 1.05, rank, {
						size: fs.toFixed( 2 ),
						font: theme.textFont,
						weight: 700,
						fill: color,
					} )
				);
				parts.push(
					glyph( SUITS[ suit ], w * 0.06, fs * 1.2, w * 0.12, color )
				);
				parts.push(
					textEl( w * 0.93, h - fs * 0.25, rank, {
						size: fs.toFixed( 2 ),
						font: theme.textFont,
						weight: 700,
						fill: color,
						anchor: 'end',
					} )
				);
				parts.push(
					glyph(
						SUITS[ suit ],
						w * 0.82,
						h - fs * 1.7,
						w * 0.12,
						color
					)
				);
				const court = 'J' === rank || 'Q' === rank || 'K' === rank;
				if ( 'A' === rank ) {
					parts.push(
						glyph(
							SUITS[ suit ],
							w * 0.28,
							h * 0.3,
							w * 0.44,
							color
						)
					);
					if ( line ) {
						parts.push(
							label(
								line,
								{
									x: w * 0.12,
									y: h * 0.66,
									w: w * 0.76,
									h: h * 0.11,
								},
								{
									font: theme.displayFont,
									weight: 700,
									color: theme.colors.ink,
									maxSize: h * 0.07,
								},
								env
							)
						);
					}
				} else if ( court ) {
					const frame = SHAPES.rect( w * 0.62, h * 0.56, {
						rx: w * 0.03,
					} );
					parts.push(
						`<g transform="translate(${ ( w * 0.19 ).toFixed(
							2
						) } ${ ( h * 0.22 ).toFixed( 2 ) })"><path d="${
							frame.d
						}" fill="${
							theme.colors.primary
						}" fill-opacity="0.25" stroke="${ color }" stroke-width="0.4"/></g>`
					);
					if ( theme.motif ) {
						parts.push(
							motifAt(
								theme.motif,
								w * 0.3,
								h * 0.28,
								w * 0.4,
								theme
							)
						);
					}
					parts.push(
						label(
							'J' === rank
								? t( 'Jack' )
								: 'Q' === rank
								? t( 'Queen' )
								: t( 'King' ),
							{ x: w * 0.2, y: h * 0.64, w: w * 0.6, h: h * 0.1 },
							{
								font: theme.displayFont,
								weight: 700,
								color,
								maxSize: h * 0.06,
							},
							env
						)
					);
				} else {
					const n = parseInt( rank, 10 );
					const cols = n > 3 ? 2 : 1;
					const rows = Math.ceil( n / cols );
					const gs = w * 0.16;
					for ( let k = 0; k < n; k++ ) {
						const c = k % cols;
						const rw = Math.floor( k / cols );
						const cx = 1 === cols ? w / 2 : w * 0.34 + c * w * 0.32;
						const cy =
							h * 0.22 +
							( rows > 1
								? ( rw * ( h * 0.56 ) ) / ( rows - 1 )
								: h * 0.28 );
						parts.push(
							glyph(
								SUITS[ suit ],
								cx - gs / 2,
								cy - gs / 2,
								gs,
								color
							)
						);
					}
				}
				parts.push( outline( shape, theme.colors.ink, 0.25 ) );
				pieces.push( { inner: parts.join( '' ), w, h } );
			}
		}
		for ( let j = 0; j < 2; j++ ) {
			const parts = [
				cardFrame( shape, theme, {
					band: 'bottom',
					bandSize: h * 0.14,
					seed: 295 + j,
				} ),
			];
			if ( theme.motif ) {
				parts.push(
					motifAt( theme.motif, w * 0.2, h * 0.16, w * 0.6, theme )
				);
			}
			parts.push(
				label(
					t( 'Joker' ),
					{ x: w * 0.1, y: h * 0.66, w: w * 0.8, h: h * 0.12 },
					{
						font: theme.displayFont,
						weight: 700,
						color: theme.colors.ink,
						maxSize: h * 0.08,
					},
					env
				)
			);
			if ( line ) {
				parts.push(
					label(
						line,
						{ x: w * 0.1, y: h * 0.88, w: w * 0.8, h: h * 0.08 },
						{
							font: theme.textFont,
							weight: 400,
							color: theme.colors.bg,
							maxSize: h * 0.045,
						},
						env
					)
				);
			}
			parts.push( outline( shape, theme.colors.ink, 0.25 ) );
			pieces.push( { inner: parts.join( '' ), w, h } );
		}
		return { pieces, warnings: [] };
	},
};
