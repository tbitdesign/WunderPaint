/** Kids' place mat: a maze, the motif to colour, tic-tac-toe grids and a dot grid on one landscape sheet. */
import {
	SHAPES,
	cardFrame,
	outline,
	outlineMotif,
	label,
	motifAt,
} from '../common.js';
import { maze, drawMaze } from './maze.js';

export const ITEM = {
	id: 'placemat',
	label: "Kids' place mat",
	hint: "A landscape sheet for the kids' table: a maze, the motif to colour, three tic-tac-toe grids and a dot grid for dots and boxes.",
	group: 'games',
	uses: {
		text: true,
		names: 'optional',
		photo: 'none',
		event: [ 'title', 'names' ],
	},
	textLabel: 'Line at the top',
	placeholder: 'Welcome to the party',
	sizes: [
		{ label: 'A4 landscape', w: 281, h: 194 },
		{ label: 'A3 landscape', w: 404, h: 281 },
	],
	repeat: ( item, event ) => ! ( event && event.names && event.names.length ),
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const t = ctx.t;
		const w = item.w || 281;
		const h = item.h || 194;
		const ink = theme.colors.ink;
		const names =
			ctx.event.names && ctx.event.names.length
				? ctx.event.names
				: [ '' ];
		const m = maze( 11, 9, item.seed || 1 );
		const pieces = names.map( ( name, i ) => {
			const shape = SHAPES.rect( w, h );
			const parts = [
				cardFrame( shape, theme, {
					band: 'top',
					bandSize: h * 0.045,
					seed: 390 + i,
				} ),
			];
			const title = [
				name,
				item.text || ctx.event.title || t( 'Welcome to the party' ),
			]
				.filter( Boolean )
				.join( ' · ' );
			parts.push(
				label(
					title,
					{ x: w * 0.05, y: h * 0.065, w: w * 0.9, h: h * 0.08 },
					{
						font: theme.displayFont,
						weight: 700,
						color: ink,
						maxSize: h * 0.06,
						wrap: false,
					},
					env
				)
			);
			// Left: the maze.
			const mazeBox = {
				x: w * 0.05,
				y: h * 0.2,
				w: w * 0.42,
				h: h * 0.72,
			};
			parts.push(
				drawMaze(
					m,
					mazeBox,
					ink,
					theme.colors.accent,
					false,
					theme.motif
						? ( x, y, s ) =>
								motifAt( theme.motif, x - s / 2, y, s, theme )
						: null
				).svg
			);
			parts.push(
				label(
					t( 'Maze' ),
					{ x: mazeBox.x, y: h * 0.155, w: mazeBox.w, h: h * 0.04 },
					{
						font: theme.textFont,
						weight: 700,
						color: theme.colors.accent,
						maxSize: h * 0.03,
						align: 'start',
						wrap: false,
					},
					env
				)
			);
			// Right top: the motif to colour.
			const cx = w * 0.52;
			const cw = w * 0.43;
			parts.push(
				label(
					t( 'Colour me' ),
					{ x: cx, y: h * 0.155, w: cw, h: h * 0.04 },
					{
						font: theme.textFont,
						weight: 700,
						color: theme.colors.accent,
						maxSize: h * 0.03,
						align: 'start',
						wrap: false,
					},
					env
				)
			);
			const ms = Math.min( cw * 0.5, h * 0.36 );
			parts.push(
				outlineMotif(
					theme.motif || 'star',
					cx + cw / 2 - ms / 2,
					h * 0.2,
					ms,
					ink,
					0.5
				)
			);
			// Right bottom: three tic-tac-toe grids and a dot grid.
			const gy = h * 0.62;
			parts.push(
				label(
					t( 'Tic-tac-toe' ),
					{ x: cx, y: gy - h * 0.045, w: cw * 0.6, h: h * 0.04 },
					{
						font: theme.textFont,
						weight: 700,
						color: theme.colors.accent,
						maxSize: h * 0.03,
						align: 'start',
						wrap: false,
					},
					env
				)
			);
			const gs = Math.min( cw * 0.17, h * 0.26 );
			for ( let k = 0; k < 3; k++ ) {
				const x = cx + k * ( gs + cw * 0.03 );
				let d = '';
				for ( let q = 1; q < 3; q++ ) {
					d += `M${ ( x + ( gs * q ) / 3 ).toFixed(
						2
					) } ${ gy.toFixed( 2 ) }V${ ( gy + gs ).toFixed(
						2
					) }M${ x.toFixed( 2 ) } ${ ( gy + ( gs * q ) / 3 ).toFixed(
						2
					) }H${ ( x + gs ).toFixed( 2 ) }`;
				}
				parts.push(
					`<path d="${ d }" fill="none" stroke="${ ink }" stroke-width="0.4"/>`
				);
			}
			const dx = cx + 3 * ( gs + cw * 0.03 ) + cw * 0.02;
			const dw = cx + cw - dx;
			if ( dw > 20 ) {
				parts.push(
					label(
						t( 'Dots and boxes' ),
						{ x: dx, y: gy - h * 0.045, w: dw, h: h * 0.04 },
						{
							font: theme.textFont,
							weight: 700,
							color: theme.colors.accent,
							maxSize: h * 0.03,
							align: 'start',
							wrap: false,
						},
						env
					)
				);
				const cols = 6;
				const rows = 5;
				const step = Math.min( dw / ( cols - 1 ), gs / ( rows - 1 ) );
				for ( let yy = 0; yy < rows; yy++ ) {
					for ( let xx = 0; xx < cols; xx++ ) {
						parts.push(
							`<circle cx="${ ( dx + xx * step ).toFixed(
								2
							) }" cy="${ ( gy + yy * step ).toFixed(
								2
							) }" r="0.7" fill="${ ink }"/>`
						);
					}
				}
			}
			parts.push( outline( shape, ink, 0.25 ) );
			return { inner: parts.join( '' ), w, h };
		} );
		return { pieces, warnings: [] };
	},
};
