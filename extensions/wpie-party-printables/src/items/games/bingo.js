/**
 * Bingo: cards with numbers (1..75 in the B-I-N-G-O columns, free centre),
 * words from the lines, or motifs. Every card is different (seeded), the
 * last piece is the call list in a random order.
 */
import {
	SHAPES,
	bg,
	outline,
	patternIn,
	motifAt,
	label,
	fitWrap,
	checkbox,
} from '../common.js';
import { textEl } from '../../engine/svg.js';
import { MOTIF_IDS } from '../../engine/motifs.js';
import { seeded } from '../../engine/rng.js';

export const BINGO_MODES = [
	{ value: 'numbers', label: 'Numbers 1 to 75' },
	{ value: 'words', label: 'Words from the lines' },
	{ value: 'motifs', label: 'Motifs' },
];

function shuffle( arr, rnd ) {
	const a = arr.slice();
	for ( let i = a.length - 1; i > 0; i-- ) {
		const j = Math.floor( rnd() * ( i + 1 ) );
		[ a[ i ], a[ j ] ] = [ a[ j ], a[ i ] ];
	}
	return a;
}

/** The cards as grids of cell values; null is the free centre. */
export function bingoCards( o ) {
	const rnd = seeded( o.seed || 1 );
	const n = Math.max( 1, Math.min( 60, o.count || 6 ) );
	const cards = [];
	const seen = new Set();
	const grid = 'numbers' === o.mode ? 5 : o.grid || 4;
	const pool = 'numbers' === o.mode ? null : o.items;
	let tries = 0;
	while ( cards.length < n && tries < n * 60 ) {
		tries++;
		let cells;
		if ( 'numbers' === o.mode ) {
			const cols = [ 0, 1, 2, 3, 4 ].map( ( c ) =>
				shuffle(
					[ ...Array( 15 ) ].map( ( _, k ) => c * 15 + k + 1 ),
					rnd
				).slice( 0, 5 )
			);
			cells = [];
			for ( let row = 0; row < 5; row++ ) {
				for ( let c = 0; c < 5; c++ ) {
					cells.push(
						2 === row && 2 === c ? null : cols[ c ][ row ]
					);
				}
			}
		} else {
			const need = grid * grid;
			if ( pool.length < need ) {
				return { cards: [], error: 'few' };
			}
			cells = shuffle( pool, rnd ).slice( 0, need );
		}
		const sig = cells.join( '|' );
		if ( seen.has( sig ) ) {
			continue;
		}
		seen.add( sig );
		cards.push( cells );
	}
	const calls =
		'numbers' === o.mode
			? shuffle(
					[ ...Array( 75 ) ].map( ( _, k ) => k + 1 ),
					rnd
			  )
			: shuffle( pool, rnd );
	return { cards, grid, calls };
}

export const ITEM = {
	id: 'bingo',
	label: 'Bingo',
	hint: 'Bingo cards with numbers, words or motifs, every card different, plus a call list; the seed changes the draw.',
	group: 'games',
	uses: { text: 'lines', names: false, photo: 'none', event: [ 'title' ] },
	textLabel: 'Words for word bingo, one per line',
	placeholder:
		'Cake\nBalloon\nCandle\nGift\nGame\nSong\nDance\nHat\nConfetti\nCard\nWish\nSmile\nPhoto\nToast\nFriend\nMusic',
	sizes: [
		{ label: '90 mm (4 per A4)', d: 90 },
		{ label: '75 mm (6 per A4)', d: 75 },
		{ label: '120 mm (2 per A4)', d: 120 },
	],
	repeat: false,
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const t = ctx.t;
		const d = item.d || 90;
		const mode = item.mode || 'numbers';
		const words = String( item.text || '' )
			.split( '\n' )
			.map( ( s ) => s.trim() )
			.filter( Boolean );
		const items =
			'words' === mode ? words : 'motifs' === mode ? MOTIF_IDS : null;
		const grid =
			'numbers' === mode
				? 5
				: Math.max( 3, Math.min( 5, item.grid || 4 ) );
		const res = bingoCards( {
			mode,
			count: item.count || 6,
			seed: item.seed || 1,
			items,
			grid,
		} );
		if ( res.error ) {
			return {
				pieces: [],
				warnings: [
					t(
						'Word bingo needs at least as many words as cells; add lines or choose a smaller grid.'
					),
				],
			};
		}
		const head = d * 0.14;
		const cell = ( d - 2 * d * 0.04 ) / res.grid;
		const x0 = d * 0.04;
		const y0 = head + d * 0.02;
		const H = y0 + cell * res.grid + d * 0.04;
		// Word cells: one size for the whole set, the largest at which every phrase fits its cell.
		const cellBox = { w: cell * 0.86, h: cell * 0.76 };
		const cellFit = {
			font: theme.textFont,
			weight: 700,
			maxSize: cell * 0.2,
			maxLines: 4,
		};
		const wordCellSize =
			'words' === mode
				? Math.min(
						...res.calls.map(
							( v ) =>
								fitWrap( String( v ), cellBox, cellFit, env )
									.size
						)
				  )
				: 0;
		const pieces = res.cards.map( ( cells, i ) => {
			const shape = SHAPES.rect( d, H );
			const parts = [ bg( shape, theme.colors.bg ) ];
			const band = SHAPES.rect( d, head );
			parts.push(
				`<path d="${ band.d }" fill="${ theme.colors.primary }"/>`
			);
			if ( false !== item.pattern ) {
				parts.push(
					patternIn( band, theme, {
						seed: 250 + i,
						opacity: 0.25,
						scale: 0.4,
					} )
				);
			}
			if ( 'numbers' === mode ) {
				'BINGO'.split( '' ).forEach( ( ch, c ) => {
					parts.push(
						textEl( x0 + cell * ( c + 0.5 ), head * 0.72, ch, {
							size: ( head * 0.62 ).toFixed( 2 ),
							font: theme.displayFont,
							weight: 700,
							fill: theme.colors.bg,
							anchor: 'middle',
						} )
					);
				} );
			} else {
				parts.push(
					label(
						item.title || ctx.event.title || 'BINGO',
						{
							x: d * 0.06,
							y: head * 0.15,
							w: d * 0.88,
							h: head * 0.7,
						},
						{
							font: theme.displayFont,
							weight: 700,
							color: theme.colors.bg,
							maxSize: head * 0.6,
						},
						env
					)
				);
			}
			cells.forEach( ( v, k ) => {
				const cx = x0 + ( k % res.grid ) * cell;
				const cy = y0 + Math.floor( k / res.grid ) * cell;
				parts.push(
					`<rect x="${ cx.toFixed( 2 ) }" y="${ cy.toFixed(
						2
					) }" width="${ cell.toFixed( 2 ) }" height="${ cell.toFixed(
						2
					) }" fill="${
						null === v ? theme.colors.secondary : theme.colors.bg
					}" fill-opacity="${ null === v ? 0.6 : 1 }" stroke="${
						theme.colors.ink
					}" stroke-width="0.25"/>`
				);
				if ( null === v ) {
					if ( theme.motif ) {
						parts.push(
							motifAt(
								theme.motif,
								cx + cell * 0.2,
								cy + cell * 0.2,
								cell * 0.6,
								theme,
								{ on: theme.colors.secondary }
							)
						);
					}
				} else if ( 'motifs' === mode ) {
					parts.push(
						motifAt(
							v,
							cx + cell * 0.15,
							cy + cell * 0.15,
							cell * 0.7,
							theme
						)
					);
				} else if ( 'numbers' === mode ) {
					parts.push(
						label(
							String( v ),
							{
								x: cx + cell * 0.08,
								y: cy + cell * 0.2,
								w: cell * 0.84,
								h: cell * 0.6,
							},
							{
								font: theme.displayFont,
								weight: 700,
								color: theme.colors.ink,
								maxSize: cell * 0.5,
							},
							env
						)
					);
				} else {
					// Phrases wrap over up to four lines at the shared size.
					const box = {
						x: cx + cell * 0.07,
						y: cy + cell * 0.12,
						...cellBox,
					};
					const fit = fitWrap(
						String( v ),
						box,
						{ ...cellFit, maxSize: wordCellSize },
						env
					);
					parts.push(
						label(
							fit.lines.join( '\n' ),
							box,
							{
								font: theme.textFont,
								weight: 700,
								color: theme.colors.ink,
								maxSize: fit.size,
								wrap: false,
							},
							env
						)
					);
				}
			} );
			parts.push(
				textEl( d - d * 0.04, H - d * 0.012, String( i + 1 ), {
					size: ( d * 0.028 ).toFixed( 2 ),
					font: theme.textFont,
					fill: theme.colors.ink,
					anchor: 'end',
				} )
			);
			parts.push( outline( shape, theme.colors.ink, 0.25 ) );
			return { inner: parts.join( '' ), w: d, h: H };
		} );
		// The call list.
		const list = [ bg( SHAPES.rect( d, H ), theme.colors.bg ) ];
		list.push(
			label(
				t( 'Call list' ),
				{ x: d * 0.06, y: d * 0.03, w: d * 0.88, h: head * 0.7 },
				{
					font: theme.displayFont,
					weight: 700,
					color: theme.colors.ink,
					maxSize: head * 0.5,
				},
				env
			)
		);
		const cols = 'numbers' === mode ? 10 : 'motifs' === mode ? 6 : 2;
		const rows = Math.ceil( res.calls.length / cols );
		const cw = ( d - 2 * x0 ) / cols;
		const ch = Math.min(
			( H - y0 - d * 0.04 ) / rows,
			cw * ( 'words' === mode ? 0.3 : 1 )
		);
		// Words: a tick box and the phrase, wrapped to two lines, one size for the whole list.
		const tick = 'words' === mode ? Math.min( ch * 0.5, d * 0.035 ) : 0;
		const wordBox = { w: cw - tick * 1.6 - cw * 0.08, h: ch * 0.9 };
		const wordSize =
			'words' === mode
				? Math.min(
						...res.calls.map(
							( v ) =>
								fitWrap(
									String( v ),
									wordBox,
									{
										font: theme.textFont,
										weight: 400,
										maxSize: ch * 0.42,
										maxLines: 2,
									},
									env
								).size
						)
				  )
				: 0;
		res.calls.forEach( ( v, k ) => {
			const cx = x0 + ( k % cols ) * cw;
			const cy = y0 + Math.floor( k / cols ) * ch;
			if ( 'words' === mode ) {
				const fit = fitWrap(
					String( v ),
					wordBox,
					{
						font: theme.textFont,
						weight: 400,
						maxSize: wordSize,
						maxLines: 2,
					},
					env
				);
				list.push(
					checkbox(
						cx + cw * 0.04,
						cy + ( ch - tick ) / 2,
						tick,
						theme.colors.ink
					)
				);
				list.push(
					label(
						fit.lines.join( '\n' ),
						{
							x: cx + cw * 0.04 + tick * 1.6,
							y: cy + ch * 0.05,
							w: wordBox.w,
							h: wordBox.h,
						},
						{
							font: theme.textFont,
							weight: 400,
							color: theme.colors.ink,
							maxSize: wordSize,
							wrap: false,
							align: 'start',
						},
						env
					)
				);
			} else if ( 'motifs' === mode ) {
				list.push(
					motifAt(
						v,
						cx + cw * 0.15,
						cy + ch * 0.1,
						Math.min( cw, ch ) * 0.7,
						theme
					)
				);
			} else {
				list.push(
					textEl( cx + cw / 2, cy + ch * 0.72, String( v ), {
						size: Math.min( ch * 0.6, cw * 0.28 ).toFixed( 2 ),
						font: theme.textFont,
						fill: theme.colors.ink,
						anchor: 'middle',
					} )
				);
			}
			if ( 'numbers' === mode ) {
				list.push(
					`<rect x="${ cx.toFixed( 2 ) }" y="${ cy.toFixed(
						2
					) }" width="${ cw.toFixed( 2 ) }" height="${ ch.toFixed(
						2
					) }" fill="none" stroke="${
						theme.colors.ink
					}" stroke-width="0.15" stroke-opacity="0.5"/>`
				);
			}
		} );
		list.push( outline( SHAPES.rect( d, H ), theme.colors.ink, 0.25 ) );
		pieces.push( { inner: list.join( '' ), w: d, h: H } );
		return { pieces, warnings: [] };
	},
};
