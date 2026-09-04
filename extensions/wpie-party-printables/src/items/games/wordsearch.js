/** Word search: words from the lines hidden in a letter grid in eight directions, with a solution. */
import { SHAPES, cardFrame, label, outline } from '../common.js';
import { textEl } from '../../engine/svg.js';
import { seeded } from '../../engine/rng.js';

const DIRS = [
	[ 1, 0 ],
	[ 0, 1 ],
	[ 1, 1 ],
	[ -1, 1 ],
	[ -1, 0 ],
	[ 0, -1 ],
	[ -1, -1 ],
	[ 1, -1 ],
];
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Place words in an n x n grid; returns { grid, placed: [{word, cells}], missing }. */
export function wordSearch( words, n, seed ) {
	const rnd = seeded( seed || 1 );
	const grid = [ ...Array( n ) ].map( () => Array( n ).fill( '' ) );
	const placed = [];
	const missing = [];
	const list = words
		.map( ( w ) => w.toUpperCase().replace( /[^A-ZÄÖÜ0-9]/g, '' ) )
		.filter( ( w ) => w.length >= 2 && w.length <= n )
		.sort( ( a, b ) => b.length - a.length );
	for ( const word of list ) {
		let done = false;
		for ( let tries = 0; tries < 300 && ! done; tries++ ) {
			const [ dx, dy ] = DIRS[ Math.floor( rnd() * DIRS.length ) ];
			const x0 = Math.floor( rnd() * n );
			const y0 = Math.floor( rnd() * n );
			const xe = x0 + dx * ( word.length - 1 );
			const ye = y0 + dy * ( word.length - 1 );
			if ( xe < 0 || ye < 0 || xe >= n || ye >= n ) {
				continue;
			}
			let ok = true;
			for ( let k = 0; k < word.length; k++ ) {
				const c = grid[ y0 + dy * k ][ x0 + dx * k ];
				if ( c && c !== word[ k ] ) {
					ok = false;
					break;
				}
			}
			if ( ! ok ) {
				continue;
			}
			const cells = [];
			for ( let k = 0; k < word.length; k++ ) {
				grid[ y0 + dy * k ][ x0 + dx * k ] = word[ k ];
				cells.push( [ x0 + dx * k, y0 + dy * k ] );
			}
			placed.push( { word, cells } );
			done = true;
		}
		if ( ! done ) {
			missing.push( word );
		}
	}
	for ( let y = 0; y < n; y++ ) {
		for ( let x = 0; x < n; x++ ) {
			if ( ! grid[ y ][ x ] ) {
				grid[ y ][ x ] = ALPHA[ Math.floor( rnd() * 26 ) ];
			}
		}
	}
	return { grid, placed, missing };
}

export const ITEM = {
	id: 'wordsearch',
	label: 'Word search',
	hint: 'Your words hidden in a letter grid in eight directions, the word list under it, and a solution sheet.',
	group: 'games',
	uses: { text: 'lines', names: false, photo: 'none', event: [ 'title' ] },
	textLabel: 'Words to hide, one per line',
	placeholder:
		'Cake\nBalloon\nCandle\nPresent\nConfetti\nMusic\nDance\nFriends\nParty\nWish',
	sizes: [
		{ label: 'A5 (148 x 210 mm)', w: 148, h: 210 },
		{ label: 'A4 (210 x 297 mm)', w: 194, h: 281 },
	],
	repeat: false,
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const t = ctx.t;
		const w = item.w || 148;
		const h = item.h || 210;
		const ink = theme.colors.ink;
		const n = Math.max( 6, Math.min( 20, item.grid || 12 ) );
		const words = String( item.text || '' )
			.split( '\n' )
			.map( ( s ) => s.trim() )
			.filter( Boolean );
		const warnings = [];
		if ( ! words.length ) {
			warnings.push( t( 'Add the words to hide, one per line.' ) );
		}
		const res = wordSearch( words, n, item.seed || 1 );
		if ( res.missing.length ) {
			warnings.push(
				t( 'Some words did not fit the grid:' ) +
					' ' +
					res.missing.join( ', ' )
			);
		}
		const title = item.title || ctx.event.title || t( 'Word search' );
		const sheet = ( solution ) => {
			const shape = SHAPES.rect( w, h );
			const parts = [
				cardFrame( shape, theme, {
					band: 'top',
					bandSize: h * 0.04,
					seed: 360,
				} ),
			];
			parts.push(
				label(
					title + ( solution ? ' · ' + t( 'Solution' ) : '' ),
					{ x: w * 0.08, y: h * 0.06, w: w * 0.84, h: h * 0.06 },
					{
						font: theme.displayFont,
						weight: 700,
						color: ink,
						maxSize: h * 0.045,
						wrap: false,
					},
					env
				)
			);
			const gridW = w * 0.84;
			const cell = gridW / n;
			const gx = w * 0.08;
			const gy = h * 0.14;
			if ( solution ) {
				for ( const p of res.placed ) {
					for ( const [ cx, cy ] of p.cells ) {
						parts.push(
							`<rect x="${ ( gx + cx * cell ).toFixed(
								2
							) }" y="${ ( gy + cy * cell ).toFixed(
								2
							) }" width="${ cell.toFixed(
								2
							) }" height="${ cell.toFixed( 2 ) }" fill="${
								theme.colors.accent
							}" fill-opacity="0.45"/>`
						);
					}
				}
			}
			for ( let y = 0; y < n; y++ ) {
				for ( let x = 0; x < n; x++ ) {
					parts.push(
						textEl(
							gx + ( x + 0.5 ) * cell,
							gy + ( y + 0.72 ) * cell,
							res.grid[ y ][ x ],
							{
								size: ( cell * 0.62 ).toFixed( 2 ),
								font: theme.textFont,
								weight: 700,
								fill: ink,
								anchor: 'middle',
							}
						)
					);
				}
			}
			parts.push(
				`<rect x="${ gx.toFixed( 2 ) }" y="${ gy.toFixed(
					2
				) }" width="${ gridW.toFixed( 2 ) }" height="${ (
					cell * n
				).toFixed(
					2
				) }" fill="none" stroke="${ ink }" stroke-width="0.35"/>`
			);
			// The word list in columns.
			const listY = gy + cell * n + h * 0.03;
			const cols = 3;
			const fs = Math.min(
				h * 0.02,
				( ( h * 0.95 - listY ) /
					Math.ceil( Math.max( 1, res.placed.length ) / cols ) ) *
					0.6
			);
			res.placed.forEach( ( p, i ) => {
				const x = gx + ( i % cols ) * ( gridW / cols );
				const y = listY + Math.floor( i / cols ) * fs * 1.6 + fs;
				if ( y < h * 0.97 ) {
					parts.push(
						textEl( x, y, p.word, {
							size: fs.toFixed( 2 ),
							font: theme.textFont,
							fill: ink,
						} )
					);
				}
			} );
			parts.push( outline( shape, ink, 0.25 ) );
			return { inner: parts.join( '' ), w, h };
		};
		const pieces = [ sheet( false ) ];
		if ( false !== item.solution ) {
			pieces.push( sheet( true ) );
		}
		return { pieces, warnings };
	},
};
