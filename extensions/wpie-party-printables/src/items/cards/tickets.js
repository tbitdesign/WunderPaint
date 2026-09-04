/** Tickets and raffle tickets: a serial on the ticket and on the stub, a dashed tear line. */
import {
	SHAPES,
	cardFrame,
	label,
	motifAt,
	outline,
	dashed,
	serial,
	patternIn,
} from '../common.js';
import { textEl } from '../../engine/svg.js';

export const TICKET_MODES = [
	{ value: 'ticket', label: 'Entry ticket' },
	{ value: 'raffle', label: 'Raffle ticket' },
];

export const ITEM = {
	id: 'tickets',
	label: 'Tickets',
	hint: 'Entry or raffle tickets with a running number on the ticket and on the stub, a dashed line to tear.',
	group: 'cards',
	uses: {
		text: true,
		names: false,
		photo: 'none',
		event: [ 'title', 'date', 'time', 'place' ],
	},
	textLabel: 'The line on the ticket',
	placeholder: 'Admit one',
	sizes: [
		{ label: '150 x 60 mm (4 per A4)', w: 150, h: 60 },
		{ label: '180 x 70 mm (3 per A4)', w: 180, h: 70 },
		{ label: '120 x 50 mm', w: 120, h: 50 },
	],
	repeat: false,
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const t = ctx.t;
		const w = item.w || 150;
		const h = item.h || 60;
		const n = Math.max( 1, Math.min( 200, item.count || 8 ) );
		const start = Math.max( 0, item.start || 1 );
		const raffle = 'raffle' === item.mode;
		const stub = w * 0.28;
		const pieces = [];
		for ( let i = 0; i < n; i++ ) {
			const shape = SHAPES.rect( w, h );
			const ink = theme.colors.ink;
			const no = serial( start + i );
			const parts = [
				cardFrame( shape, theme, {
					band: 'top',
					bandSize: h * 0.14,
					seed: 60 + i,
				} ),
			];
			// The stub on the right, a lighter paper.
			const stubShape = SHAPES.rect( stub, h );
			parts.push(
				`<g transform="translate(${ ( w - stub ).toFixed(
					2
				) } 0)"><path d="${ stubShape.d }" fill="${
					theme.colors.primary
				}" fill-opacity="0.1"/>${ patternIn( stubShape, theme, {
					seed: 61 + i,
					opacity: 0.15,
					scale: 0.5,
				} ) }</g>`
			);
			parts.push( dashed( w - stub, 0, w - stub, h, ink, 0.3 ) );
			const main = w - stub;
			if ( false !== item.motif && theme.motif ) {
				const size = h * 0.34;
				parts.push(
					motifAt( theme.motif, main * 0.04, h * 0.2, size, theme )
				);
			}
			const x0 =
				main * 0.06 +
				( false !== item.motif && theme.motif ? h * 0.36 : 0 );
			const cw = main - x0 - main * 0.04;
			parts.push(
				label(
					ctx.event.title || t( 'Party' ),
					{ x: x0, y: h * 0.2, w: cw, h: h * 0.26 },
					{
						font: theme.displayFont,
						weight: 700,
						color: ink,
						maxSize: h * 0.2,
						align: 'start',
					},
					env
				)
			);
			const info = [ ctx.event.date, ctx.event.time, ctx.event.place ]
				.filter( Boolean )
				.join( ' · ' );
			if ( info ) {
				parts.push(
					label(
						info,
						{ x: x0, y: h * 0.48, w: cw, h: h * 0.14 },
						{
							font: theme.textFont,
							weight: 400,
							color: ink,
							maxSize: h * 0.08,
							align: 'start',
						},
						env
					)
				);
			}
			parts.push(
				label(
					item.text || ( raffle ? t( 'Raffle' ) : t( 'Admit one' ) ),
					{ x: x0, y: h * 0.66, w: cw, h: h * 0.14 },
					{
						font: theme.textFont,
						weight: 700,
						color: theme.colors.accent,
						maxSize: h * 0.09,
						align: 'start',
					},
					env
				)
			);
			parts.push(
				textEl( main - main * 0.04, h * 0.92, t( 'No.' ) + ' ' + no, {
					size: ( h * 0.07 ).toFixed( 2 ),
					font: theme.textFont,
					fill: ink,
					anchor: 'end',
				} )
			);
			// The stub: number and a title line.
			parts.push(
				label(
					no,
					{
						x: w - stub + stub * 0.1,
						y: h * 0.3,
						w: stub * 0.8,
						h: h * 0.3,
					},
					{
						font: theme.displayFont,
						weight: 700,
						color: ink,
						maxSize: h * 0.24,
					},
					env
				)
			);
			parts.push(
				label(
					raffle
						? t( 'Keep this stub' )
						: ctx.event.title || t( 'Party' ),
					{
						x: w - stub + stub * 0.06,
						y: h * 0.64,
						w: stub * 0.88,
						h: h * 0.14,
					},
					{
						font: theme.textFont,
						weight: 400,
						color: ink,
						maxSize: h * 0.075,
					},
					env
				)
			);
			parts.push( outline( shape, ink, 0.25 ) );
			pieces.push( { inner: parts.join( '' ), w, h } );
		}
		return { pieces, warnings: [] };
	},
};
