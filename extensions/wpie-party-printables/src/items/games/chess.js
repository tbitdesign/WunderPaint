/**
 * Board diagrams: chess from a FEN, draughts and go from piece lists.
 * The text: the position on the first line, then arrows and marks:
 *   rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1
 *   e2-e4  g1-f3        arrows
 *   mark e4 d5          highlighted squares
 * Draughts: "w: a1 c1 e1 ...; b: b10 d10 ..." (kings as A1K). Go: "b: d4 q16; w: d16".
 */
import { SHAPES, bg, outline, arrow, label, glyph, CHESS } from '../common.js';
import { textEl } from '../../engine/svg.js';

export const BOARD_TYPES = [
	{ value: 'chess', label: 'Chess' },
	{ value: 'draughts', label: 'Draughts' },
	{ value: 'go', label: 'Go' },
];

const FILES = 'abcdefghijklmnopqrst';
export const START_FEN =
	'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function parseFen( fen ) {
	const rows = String( fen || '' )
		.trim()
		.split( /\s+/ )[ 0 ]
		.split( '/' );
	if ( 8 !== rows.length ) {
		return null;
	}
	const board = [];
	for ( const row of rows ) {
		const cells = [];
		for ( const ch of row ) {
			if ( /\d/.test( ch ) ) {
				for ( let k = 0; k < +ch; k++ ) {
					cells.push( null );
				}
			} else if ( /[prnbqkPRNBQK]/.test( ch ) ) {
				cells.push( ch );
			} else {
				return null;
			}
		}
		if ( 8 !== cells.length ) {
			return null;
		}
		board.push( cells );
	}
	return board;
}

/** Square name -> { col, row } from the top-left, or null. */
export function square( name, size ) {
	const m = String( name )
		.toLowerCase()
		.match( /^([a-t])(\d{1,2})$/ );
	if ( ! m ) {
		return null;
	}
	const col = FILES.indexOf( m[ 1 ] );
	const rank = parseInt( m[ 2 ], 10 );
	if ( col < 0 || col >= size || rank < 1 || rank > size ) {
		return null;
	}
	return { col, row: size - rank };
}

export function parseBoardText( text, type ) {
	const lines = String( text || '' )
		.split( '\n' )
		.map( ( s ) => s.trim() )
		.filter( Boolean );
	const out = { arrows: [], marks: [], pieces: [], board: null, errors: [] };
	let first = true;
	const size = 'go' === type ? 19 : 'draughts' === type ? 10 : 8;
	for ( const line of lines ) {
		if ( first && 'chess' === type && line.includes( '/' ) ) {
			out.board = parseFen( line );
			if ( ! out.board ) {
				out.errors.push( 'fen' );
			}
			first = false;
			continue;
		}
		first = false;
		const pieceList = line.match( /^([wb])\s*:\s*(.*)$/i );
		if ( pieceList && 'chess' !== type ) {
			for ( const tok of pieceList[ 2 ]
				.split( /[\s,;]+/ )
				.filter( Boolean ) ) {
				const king = /k$/i.test( tok );
				const sq = square( tok.replace( /k$/i, '' ), size );
				if ( sq ) {
					out.pieces.push( {
						...sq,
						color: pieceList[ 1 ].toLowerCase(),
						king,
					} );
				} else {
					out.errors.push( tok );
				}
			}
			continue;
		}
		const mark = line.match( /^mark\s+(.*)$/i );
		if ( mark ) {
			for ( const tok of mark[ 1 ].split( /[\s,]+/ ).filter( Boolean ) ) {
				const sq = square( tok, size );
				if ( sq ) {
					out.marks.push( sq );
				}
			}
			continue;
		}
		for ( const tok of line.split( /[\s,;]+/ ).filter( Boolean ) ) {
			const m = tok.match( /^([a-t]\d{1,2})-?>?([a-t]\d{1,2})$/i );
			if ( m ) {
				const a = square( m[ 1 ], size );
				const b = square( m[ 2 ], size );
				if ( a && b ) {
					out.arrows.push( [ a, b ] );
					continue;
				}
			}
			out.errors.push( tok );
		}
	}
	if ( 'chess' === type && ! out.board ) {
		out.board = parseFen( START_FEN );
	}
	return out;
}

function draughtsStart( size ) {
	const pieces = [];
	const rows = 10 === size ? 4 : 3;
	for ( let row = 0; row < size; row++ ) {
		for ( let col = 0; col < size; col++ ) {
			if ( ( row + col ) % 2 === 1 ) {
				if ( row < rows ) {
					pieces.push( { col, row, color: 'b', king: false } );
				} else if ( row >= size - rows ) {
					pieces.push( { col, row, color: 'w', king: false } );
				}
			}
		}
	}
	return pieces;
}

export const ITEM = {
	id: 'chess',
	label: 'Board diagram',
	hint: 'A chess position from a FEN with arrows and marked squares, or draughts and go from piece lists, for puzzle cards and tournament sheets.',
	group: 'games',
	uses: { text: 'lines', names: false, photo: 'none', event: [] },
	textLabel: 'Position, then arrows (e2-e4) and marks (mark e4)',
	placeholder: START_FEN + '\ne2-e4\nmark e4',
	sizes: [
		{ label: '120 mm', d: 120 },
		{ label: '160 mm', d: 160 },
		{ label: '90 mm (2 per A4)', d: 90 },
	],
	repeat: false,
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const t = ctx.t;
		const type = item.board || 'chess';
		const d = item.d || 120;
		const n =
			'go' === type
				? Math.max( 5, Math.min( 19, item.lines || 19 ) )
				: 'draughts' === type
				? 8 === item.lines
					? 8
					: 10
				: 8;
		const parsed = parseBoardText( item.text, type );
		const warnings = [];
		if ( parsed.errors.length ) {
			warnings.push(
				t( 'Some of the board text was not understood:' ) +
					' ' +
					parsed.errors.slice( 0, 4 ).join( ', ' )
			);
		}
		const capH = item.caption ? d * 0.1 : 0;
		const margin = d * 0.05;
		const boardD = d - 2 * margin;
		const cell = boardD / n;
		const shape = SHAPES.rect( d, d + capH );
		const light = theme.colors.bg;
		const dark = theme.colors.secondary;
		const ink = theme.colors.ink;
		const parts = [ bg( shape, theme.colors.bg ) ];
		const sx = ( col ) => margin + col * cell;
		const sy = ( row ) => margin + row * cell;
		if ( 'go' === type ) {
			parts.push(
				`<rect x="${ margin.toFixed( 2 ) }" y="${ margin.toFixed(
					2
				) }" width="${ boardD.toFixed( 2 ) }" height="${ boardD.toFixed(
					2
				) }" fill="${ theme.colors.primary }" fill-opacity="0.25"/>`
			);
			for ( let k = 0; k < n; k++ ) {
				const p = margin + cell / 2 + k * cell;
				parts.push(
					`<line x1="${ ( margin + cell / 2 ).toFixed(
						2
					) }" y1="${ p.toFixed( 2 ) }" x2="${ (
						margin +
						boardD -
						cell / 2
					).toFixed( 2 ) }" y2="${ p.toFixed(
						2
					) }" stroke="${ ink }" stroke-width="0.25"/>`
				);
				parts.push(
					`<line x1="${ p.toFixed( 2 ) }" y1="${ (
						margin +
						cell / 2
					).toFixed( 2 ) }" x2="${ p.toFixed( 2 ) }" y2="${ (
						margin +
						boardD -
						cell / 2
					).toFixed( 2 ) }" stroke="${ ink }" stroke-width="0.25"/>`
				);
			}
			if ( 19 === n ) {
				for ( const a of [ 3, 9, 15 ] ) {
					for ( const b of [ 3, 9, 15 ] ) {
						parts.push(
							`<circle cx="${ (
								margin +
								cell / 2 +
								a * cell
							).toFixed( 2 ) }" cy="${ (
								margin +
								cell / 2 +
								b * cell
							).toFixed( 2 ) }" r="${ ( cell * 0.1 ).toFixed(
								2
							) }" fill="${ ink }"/>`
						);
					}
				}
			}
		} else {
			for ( let row = 0; row < n; row++ ) {
				for ( let col = 0; col < n; col++ ) {
					parts.push(
						`<rect x="${ sx( col ).toFixed( 2 ) }" y="${ sy(
							row
						).toFixed( 2 ) }" width="${ cell.toFixed(
							2
						) }" height="${ cell.toFixed( 2 ) }" fill="${
							( row + col ) % 2 ? dark : light
						}"/>`
					);
				}
			}
		}
		for ( const m of parsed.marks ) {
			parts.push(
				`<rect x="${ sx( m.col ).toFixed( 2 ) }" y="${ sy(
					m.row
				).toFixed( 2 ) }" width="${ cell.toFixed(
					2
				) }" height="${ cell.toFixed( 2 ) }" fill="${
					theme.colors.accent
				}" fill-opacity="0.45"/>`
			);
		}
		// Coordinates.
		if ( false !== item.coords ) {
			const fs = Math.max( 1.6, cell * 0.22 );
			for ( let k = 0; k < n; k++ ) {
				parts.push(
					textEl( sx( k ) + cell / 2, d - margin * 0.15, FILES[ k ], {
						size: fs.toFixed( 2 ),
						font: theme.textFont,
						fill: ink,
						anchor: 'middle',
					} )
				);
				parts.push(
					textEl(
						margin * 0.45,
						sy( k ) + cell / 2 + fs * 0.35,
						String( n - k ),
						{
							size: fs.toFixed( 2 ),
							font: theme.textFont,
							fill: ink,
							anchor: 'middle',
						}
					)
				);
			}
		}
		// Pieces.
		if ( 'chess' === type && parsed.board ) {
			parsed.board.forEach( ( row, r ) => {
				row.forEach( ( p, c ) => {
					if ( ! p ) {
						return;
					}
					const white = p === p.toUpperCase();
					parts.push(
						glyph(
							CHESS[ p.toLowerCase() ],
							sx( c ) + cell * 0.1,
							sy( r ) + cell * 0.08,
							cell * 0.8,
							white ? '#ffffff' : ink,
							white ? ink : null
						)
					);
				} );
			} );
		} else if ( 'chess' !== type ) {
			const pieces = parsed.pieces.length
				? parsed.pieces
				: 'draughts' === type
				? draughtsStart( n )
				: [];
			for ( const p of pieces ) {
				const cx = sx( p.col ) + cell / 2;
				const cy = sy( p.row ) + cell / 2;
				const rad = cell * 0.4;
				parts.push(
					`<circle cx="${ cx.toFixed( 2 ) }" cy="${ cy.toFixed(
						2
					) }" r="${ rad.toFixed( 2 ) }" fill="${
						'w' === p.color ? '#ffffff' : ink
					}" stroke="${ ink }" stroke-width="0.3"/>`
				);
				if ( p.king ) {
					parts.push(
						`<circle cx="${ cx.toFixed( 2 ) }" cy="${ cy.toFixed(
							2
						) }" r="${ ( rad * 0.5 ).toFixed(
							2
						) }" fill="none" stroke="${
							'w' === p.color ? ink : '#ffffff'
						}" stroke-width="0.4"/>`
					);
				}
			}
		}
		for ( const [ a, b ] of parsed.arrows ) {
			parts.push(
				arrow(
					sx( a.col ) + cell / 2,
					sy( a.row ) + cell / 2,
					sx( b.col ) + cell / 2,
					sy( b.row ) + cell / 2,
					{ width: cell * 0.12, color: theme.colors.accent }
				)
			);
		}
		parts.push(
			`<rect x="${ margin.toFixed( 2 ) }" y="${ margin.toFixed(
				2
			) }" width="${ boardD.toFixed( 2 ) }" height="${ boardD.toFixed(
				2
			) }" fill="none" stroke="${ ink }" stroke-width="0.4"/>`
		);
		if ( item.caption ) {
			parts.push(
				label(
					item.caption,
					{ x: margin, y: d, w: boardD, h: capH * 0.8 },
					{
						font: theme.textFont,
						weight: 400,
						color: ink,
						maxSize: capH * 0.45,
					},
					env
				)
			);
		}
		parts.push( outline( shape, ink, 0.25 ) );
		return {
			pieces: [ { inner: parts.join( '' ), w: d, h: d + capH } ],
			warnings,
		};
	},
};
