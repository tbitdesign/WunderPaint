/** Scoreboard: a sheet with a column per player and a row per round. */
import { SHAPES, cardFrame, label, motifAt, outline } from '../common.js';
import { textEl } from '../../engine/svg.js';
import { fitLine } from '../../engine/text.js';

export const ITEM = {
	id: 'scoreboard',
	label: 'Scoreboard',
	hint: 'A sheet to keep score: a column per player (the guest names), a row per round and a total.',
	group: 'games',
	uses: {
		text: true,
		names: 'optional',
		photo: 'none',
		event: [ 'title', 'names' ],
	},
	textLabel: 'Title of the game',
	placeholder: 'Game night',
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
		const shape = SHAPES.rect( w, h );
		const ink = theme.colors.ink;
		const names =
			ctx.event.names && ctx.event.names.length
				? ctx.event.names.slice( 0, 8 )
				: [ 1, 2, 3, 4 ].map( ( n ) => t( 'Player' ) + ' ' + n );
		const rounds = Math.max( 1, Math.min( 30, item.rounds || 10 ) );
		const parts = [
			cardFrame( shape, theme, {
				band: 'top',
				bandSize: h * 0.04,
				seed: 300,
			} ),
		];
		let y = h * 0.07;
		if ( false !== item.motif && theme.motif ) {
			const size = h * 0.06;
			parts.push( motifAt( theme.motif, w * 0.06, y, size, theme ) );
		}
		parts.push(
			label(
				item.text || ctx.event.title || t( 'Scoreboard' ),
				{ x: w * 0.16, y, w: w * 0.68, h: h * 0.06 },
				{
					font: theme.displayFont,
					weight: 700,
					color: ink,
					maxSize: h * 0.045,
				},
				env
			)
		);
		y += h * 0.1;
		const x0 = w * 0.05;
		const roundW = w * 0.14;
		const colW = ( w * 0.9 - roundW ) / names.length;
		const rowH = Math.min( h * 0.05, ( h * 0.9 - y ) / ( rounds + 2 ) );
		const fs = Math.min( rowH * 0.5, colW * 0.16 );
		// Header.
		parts.push(
			`<rect x="${ x0.toFixed( 2 ) }" y="${ y.toFixed( 2 ) }" width="${ (
				w * 0.9
			).toFixed( 2 ) }" height="${ rowH.toFixed( 2 ) }" fill="${
				theme.colors.primary
			}"/>`
		);
		parts.push(
			textEl( x0 + roundW / 2, y + rowH * 0.66, t( 'Round' ), {
				size: fs.toFixed( 2 ),
				font: theme.textFont,
				weight: 700,
				fill: theme.colors.bg,
				anchor: 'middle',
			} )
		);
		names.forEach( ( name, c ) => {
			const size = fitLine(
				String( name ),
				{
					w: colW * 0.9,
					h: rowH * 0.8,
					font: theme.displayFont,
					weight: 700,
					maxSize: fs * 1.1,
					minSize: 2,
				},
				env
			).size;
			parts.push(
				textEl(
					x0 + roundW + colW * ( c + 0.5 ),
					y + rowH * 0.66,
					String( name ),
					{
						size: size.toFixed( 2 ),
						font: theme.displayFont,
						weight: 700,
						fill: theme.colors.bg,
						anchor: 'middle',
					}
				)
			);
		} );
		for ( let rnd = 0; rnd <= rounds; rnd++ ) {
			const ry = y + rowH * ( rnd + 1 );
			const total = rnd === rounds;
			parts.push(
				`<rect x="${ x0.toFixed( 2 ) }" y="${ ry.toFixed(
					2
				) }" width="${ ( w * 0.9 ).toFixed(
					2
				) }" height="${ rowH.toFixed( 2 ) }" fill="${
					total
						? theme.colors.secondary
						: rnd % 2
						? theme.colors.primary
						: theme.colors.bg
				}" fill-opacity="${
					total ? 0.4 : rnd % 2 ? 0.08 : 1
				}" stroke="${ ink }" stroke-width="0.2"/>`
			);
			parts.push(
				textEl(
					x0 + roundW / 2,
					ry + rowH * 0.66,
					total ? t( 'Total' ) : String( rnd + 1 ),
					{
						size: fs.toFixed( 2 ),
						font: theme.textFont,
						weight: total ? 700 : 400,
						fill: ink,
						anchor: 'middle',
					}
				)
			);
		}
		for ( let c = 0; c <= names.length; c++ ) {
			const cx = x0 + roundW + colW * c;
			parts.push(
				`<line x1="${ cx.toFixed( 2 ) }" y1="${ y.toFixed(
					2
				) }" x2="${ cx.toFixed( 2 ) }" y2="${ (
					y +
					rowH * ( rounds + 2 )
				).toFixed( 2 ) }" stroke="${ ink }" stroke-width="0.2"/>`
			);
		}
		parts.push( outline( shape, ink, 0.25 ) );
		return { pieces: [ { inner: parts.join( '' ), w, h } ], warnings: [] };
	},
};
