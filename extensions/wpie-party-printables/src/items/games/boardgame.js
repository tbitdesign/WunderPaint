/**
 * Board game: a snake of numbered fields from Start to Finish, event
 * fields from the lines placed by the seed, the motif at the finish.
 */
import { SHAPES, cardFrame, label, motifAt, outline } from '../common.js';
import { readableOn } from '../palette.js';
import { textEl } from '../../engine/svg.js';
import { fitLine } from '../../engine/text.js';
import { seeded } from '../../engine/rng.js';

export const ITEM = {
	id: 'boardgame',
	label: 'Board game',
	hint: 'A roll-and-move board: a snake of numbered fields from start to finish, event fields from your lines, the motif at the finish.',
	group: 'games',
	uses: { text: 'lines', names: false, photo: 'none', event: [ 'title' ] },
	textLabel: 'Event fields, one per line',
	placeholder: 'Move ahead 3\nGo back 2\nSkip a turn\nRoll again',
	sizes: [
		{ label: 'A4 (210 x 297 mm)', w: 194, h: 281 },
		{ label: 'A3 (297 x 420 mm)', w: 281, h: 404 },
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
		const parts = [
			cardFrame( shape, theme, {
				band: 'top',
				bandSize: h * 0.04,
				seed: 310,
			} ),
		];
		const title = item.title || ctx.event.title || t( 'Party race' );
		parts.push(
			label(
				title,
				{ x: w * 0.1, y: h * 0.05, w: w * 0.8, h: h * 0.06 },
				{
					font: theme.displayFont,
					weight: 700,
					color: ink,
					maxSize: h * 0.045,
				},
				env
			)
		);
		const top = h * 0.13;
		const areaW = w * 0.9;
		const areaH = h * 0.84 - top;
		const cols = w > h ? 9 : 6;
		const cell = areaW / cols;
		const rows = Math.max( 3, Math.floor( areaH / cell ) );
		const x0 = w * 0.05;
		const y0 = top + ( areaH - rows * cell ) / 2;
		const events = String( item.text || '' )
			.split( '\n' )
			.map( ( s ) => s.trim() )
			.filter( Boolean );
		const rnd = seeded( item.seed || 1 );
		const total = cols * rows;
		const special = new Map();
		if ( events.length ) {
			for ( let n = 3; n < total - 1; n += 3 + Math.floor( rnd() * 3 ) ) {
				special.set( n, events[ Math.floor( rnd() * events.length ) ] );
			}
		}
		const fills = [
			theme.colors.primary,
			theme.colors.secondary,
			theme.colors.bg,
		];
		for ( let n = 1; n <= total; n++ ) {
			const rowFromBottom = Math.floor( ( n - 1 ) / cols );
			const k = ( n - 1 ) % cols;
			const col = rowFromBottom % 2 ? cols - 1 - k : k;
			const row = rows - 1 - rowFromBottom;
			const cx = x0 + col * cell;
			const cy = y0 + row * cell;
			const first = 1 === n;
			const last = n === total;
			const ev = special.get( n );
			const fill =
				first || last
					? theme.colors.accent
					: ev
					? theme.colors.bg
					: fills[ n % 3 ];
			const box = SHAPES.rect( cell * 0.92, cell * 0.92, {
				rx: cell * 0.12,
			} );
			parts.push(
				`<g transform="translate(${ ( cx + cell * 0.04 ).toFixed(
					2
				) } ${ ( cy + cell * 0.04 ).toFixed( 2 ) })"><path d="${
					box.d
				}" fill="${ fill }" stroke="${ ink }" stroke-width="0.3"/></g>`
			);
			const color = readableOn( fill, theme.colors );
			if ( first || last ) {
				parts.push(
					label(
						first ? t( 'Start' ) : t( 'Finish' ),
						{
							x: cx + cell * 0.1,
							y: cy + cell * 0.12,
							w: cell * 0.8,
							h: cell * 0.36,
						},
						{
							font: theme.displayFont,
							weight: 700,
							color,
							maxSize: cell * 0.26,
							wrap: false,
						},
						env
					)
				);
				if ( last && theme.motif ) {
					parts.push(
						motifAt(
							theme.motif,
							cx + cell * 0.3,
							cy + cell * 0.48,
							cell * 0.4,
							theme,
							{ on: fill }
						)
					);
				} else {
					parts.push(
						textEl( cx + cell / 2, cy + cell * 0.8, String( n ), {
							size: ( cell * 0.22 ).toFixed( 2 ),
							font: theme.textFont,
							weight: 700,
							fill: color,
							anchor: 'middle',
						} )
					);
				}
			} else if ( ev ) {
				parts.push(
					textEl( cx + cell * 0.14, cy + cell * 0.3, String( n ), {
						size: ( cell * 0.2 ).toFixed( 2 ),
						font: theme.textFont,
						weight: 700,
						fill: color,
					} )
				);
				parts.push(
					label(
						ev,
						{
							x: cx + cell * 0.1,
							y: cy + cell * 0.38,
							w: cell * 0.8,
							h: cell * 0.5,
						},
						{
							font: theme.textFont,
							weight: 700,
							color: theme.colors.accent,
							maxSize: cell * 0.16,
						},
						env
					)
				);
			} else {
				const size = fitLine(
					String( n ),
					{
						w: cell * 0.7,
						h: cell * 0.5,
						font: theme.displayFont,
						weight: 700,
						maxSize: cell * 0.42,
						minSize: 2,
					},
					env
				).size;
				parts.push(
					textEl( cx + cell / 2, cy + cell * 0.64, String( n ), {
						size: size.toFixed( 2 ),
						font: theme.displayFont,
						weight: 700,
						fill: color,
						anchor: 'middle',
					} )
				);
			}
		}
		parts.push(
			label(
				t(
					'Roll the die and move your token; the first at the finish wins.'
				),
				{ x: w * 0.1, y: h * 0.88, w: w * 0.8, h: h * 0.05 },
				{
					font: theme.textFont,
					weight: 400,
					color: ink,
					maxSize: h * 0.02,
				},
				env
			)
		);
		parts.push( outline( shape, ink, 0.25 ) );
		return { pieces: [ { inner: parts.join( '' ), w, h } ], warnings: [] };
	},
};
