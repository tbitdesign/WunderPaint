/** Maze: a carved grid with an entrance, an exit at the motif and, on its own sheet, the solution. */
import { SHAPES, cardFrame, label, motifAt, outline } from '../common.js';
import { seeded } from '../../engine/rng.js';

export const MAZE_LEVELS = [
	{ value: 'easy', label: 'Easy' },
	{ value: 'medium', label: 'Medium' },
	{ value: 'hard', label: 'Hard' },
];

/** Carve a cols x rows maze (recursive backtracker); walls per cell as [n, e, s, w]; the solution path. */
export function maze( cols, rows, seed ) {
	const rnd = seeded( seed || 1 );
	const walls = [ ...Array( rows ) ].map( () =>
		[ ...Array( cols ) ].map( () => [ true, true, true, true ] )
	);
	const seen = [ ...Array( rows ) ].map( () => Array( cols ).fill( false ) );
	const stack = [ [ 0, 0 ] ];
	seen[ 0 ][ 0 ] = true;
	const D = [
		[ 0, -1, 0, 2 ],
		[ 1, 0, 1, 3 ],
		[ 0, 1, 2, 0 ],
		[ -1, 0, 3, 1 ],
	];
	while ( stack.length ) {
		const [ x, y ] = stack[ stack.length - 1 ];
		const options = D.filter(
			( [ dx, dy ] ) =>
				x + dx >= 0 &&
				y + dy >= 0 &&
				x + dx < cols &&
				y + dy < rows &&
				! seen[ y + dy ][ x + dx ]
		);
		if ( ! options.length ) {
			stack.pop();
			continue;
		}
		const [ dx, dy, wall, opposite ] =
			options[ Math.floor( rnd() * options.length ) ];
		walls[ y ][ x ][ wall ] = false;
		walls[ y + dy ][ x + dx ][ opposite ] = false;
		seen[ y + dy ][ x + dx ] = true;
		stack.push( [ x + dx, y + dy ] );
	}
	// Solution by breadth-first search from the entrance to the exit.
	const prev = new Map();
	const queue = [ [ 0, 0 ] ];
	const key = ( x, y ) => x + ',' + y;
	prev.set( key( 0, 0 ), null );
	while ( queue.length ) {
		const [ x, y ] = queue.shift();
		if ( x === cols - 1 && y === rows - 1 ) {
			break;
		}
		for ( const [ dx, dy, wall ] of D ) {
			if ( walls[ y ][ x ][ wall ] ) {
				continue;
			}
			const k = key( x + dx, y + dy );
			if ( ! prev.has( k ) ) {
				prev.set( k, [ x, y ] );
				queue.push( [ x + dx, y + dy ] );
			}
		}
	}
	const path = [];
	let cur = [ cols - 1, rows - 1 ];
	while ( cur ) {
		path.unshift( cur );
		cur = prev.get( key( cur[ 0 ], cur[ 1 ] ) );
	}
	return { walls, path };
}

/** Draw a maze into a box (mm) with the entrance at the top left and the exit at the bottom right. */
export function drawMaze( m, box, ink, accent, solution, motifSvg ) {
	const cols = m.walls[ 0 ].length;
	const rows = m.walls.length;
	const cell = Math.min( box.w / cols, box.h / rows );
	const x0 = box.x + ( box.w - cell * cols ) / 2;
	const y0 = box.y + ( box.h - cell * rows ) / 2;
	const out = [];
	const L = ( x1, y1, x2, y2 ) =>
		`M${ x1.toFixed( 2 ) } ${ y1.toFixed( 2 ) }L${ x2.toFixed(
			2
		) } ${ y2.toFixed( 2 ) }`;
	let d = '';
	for ( let y = 0; y < rows; y++ ) {
		for ( let x = 0; x < cols; x++ ) {
			const [ n, e, s, w ] = m.walls[ y ][ x ];
			const X = x0 + x * cell;
			const Y = y0 + y * cell;
			if ( n && ! ( 0 === x && 0 === y ) ) {
				d += L( X, Y, X + cell, Y );
			}
			if ( w ) {
				d += L( X, Y, X, Y + cell );
			}
			if ( e ) {
				d += L( X + cell, Y, X + cell, Y + cell );
			}
			if ( s && ! ( x === cols - 1 && y === rows - 1 ) ) {
				d += L( X, Y + cell, X + cell, Y + cell );
			}
		}
	}
	out.push(
		`<path d="${ d }" fill="none" stroke="${ ink }" stroke-width="${ Math.max(
			0.3,
			cell * 0.08
		).toFixed( 2 ) }" stroke-linecap="square"/>`
	);
	if ( solution ) {
		const pts = m.path.map(
			( [ x, y ] ) =>
				( x0 + ( x + 0.5 ) * cell ).toFixed( 2 ) +
				' ' +
				( y0 + ( y + 0.5 ) * cell ).toFixed( 2 )
		);
		out.push(
			`<path d="M${ ( x0 + cell / 2 ).toFixed( 2 ) } ${ (
				y0 -
				cell * 0.4
			).toFixed( 2 ) }L${ pts.join( 'L' ) }L${ (
				x0 +
				( cols - 0.5 ) * cell
			).toFixed( 2 ) } ${ ( y0 + rows * cell + cell * 0.4 ).toFixed(
				2
			) }" fill="none" stroke="${ accent }" stroke-width="${ (
				cell * 0.3
			).toFixed(
				2
			) }" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="0.8"/>`
		);
	}
	if ( motifSvg ) {
		out.push(
			motifSvg(
				x0 + ( cols - 0.5 ) * cell,
				y0 + rows * cell + cell * 0.2,
				cell * 1.2
			)
		);
	}
	return { svg: out.join( '' ), cell, x0, y0 };
}

const GRID = { easy: [ 10, 14 ], medium: [ 15, 21 ], hard: [ 22, 31 ] };

export const ITEM = {
	id: 'maze',
	label: 'Maze',
	hint: 'A maze in three sizes, the way in at the top, the way out at the motif; the solution on its own sheet.',
	group: 'games',
	uses: { text: true, names: false, photo: 'none', event: [ 'title' ] },
	textLabel: 'Title over the maze',
	placeholder: 'Find the way to the cake',
	sizes: [
		{ label: 'A4 (210 x 297 mm)', w: 194, h: 281 },
		{ label: 'A5 (148 x 210 mm)', w: 140, h: 200 },
		{ label: 'A4 landscape', w: 281, h: 194 },
	],
	repeat: false,
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const t = ctx.t;
		const w = item.w || 194;
		const h = item.h || 281;
		const ink = theme.colors.ink;
		let [ cols, rows ] = GRID[ item.level ] || GRID.easy;
		if ( w > h ) {
			[ cols, rows ] = [ rows, cols ];
		}
		const m = maze( cols, rows, item.seed || 1 );
		const title = item.text || ctx.event.title || t( 'Maze' );
		const sheet = ( solution ) => {
			const shape = SHAPES.rect( w, h );
			const parts = [
				cardFrame( shape, theme, {
					band: 'top',
					bandSize: h * 0.04,
					seed: 370,
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
			const box = { x: w * 0.08, y: h * 0.14, w: w * 0.84, h: h * 0.76 };
			parts.push(
				drawMaze(
					m,
					box,
					ink,
					theme.colors.accent,
					solution,
					theme.motif
						? ( x, y, s ) =>
								motifAt( theme.motif, x - s / 2, y, s, theme )
						: null
				).svg
			);
			parts.push( outline( shape, ink, 0.25 ) );
			return { inner: parts.join( '' ), w, h };
		};
		const pieces = [ sheet( false ) ];
		if ( false !== item.solution ) {
			pieces.push( sheet( true ) );
		}
		return { pieces, warnings: [] };
	},
};
