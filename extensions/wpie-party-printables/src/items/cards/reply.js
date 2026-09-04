/** Reply card: name line, tick boxes for the answers, guests and dietary lines. */
import {
	SHAPES,
	cardFrame,
	label,
	motifAt,
	outline,
	checkbox,
	writeLine,
} from '../common.js';
import { textEl } from '../../engine/svg.js';

export const ITEM = {
	id: 'reply',
	label: 'Reply card',
	hint: 'The RSVP: a name line, one tick box per answer, lines for the number of guests and dietary needs, the reply-by date.',
	group: 'cards',
	uses: { text: 'lines', names: false, photo: 'none', event: [ 'title' ] },
	textLabel: 'One answer per line',
	placeholder: 'Accepts with pleasure\nDeclines with regret',
	sizes: [
		{ label: '90 x 64 mm (8 per A4)', w: 90, h: 64 },
		{ label: 'A6 postcard (148 x 105 mm)', w: 148, h: 105 },
	],
	repeat: true,
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const t = ctx.t;
		const w = item.w || 90;
		const h = item.h || 64;
		const shape = SHAPES.rect( w, h );
		const ink = theme.colors.ink;
		const parts = [
			cardFrame( shape, theme, {
				band: 'left',
				bandSize: w * 0.05,
				seed: 9,
			} ),
		];
		const x0 = w * 0.12;
		const cw = w * 0.8;
		parts.push(
			label(
				t( 'Kindly reply' ) +
					( item.by ? ' ' + t( 'by' ) + ' ' + item.by : '' ),
				{
					x: x0,
					y: h * 0.07,
					w:
						cw -
						( false !== item.motif && theme.motif ? h * 0.18 : 0 ),
					h: h * 0.12,
				},
				{
					font: theme.displayFont,
					weight: 700,
					color: ink,
					maxSize: h * 0.09,
					align: 'start',
				},
				env
			)
		);
		if ( false !== item.motif && theme.motif ) {
			const size = h * 0.14;
			parts.push(
				motifAt( theme.motif, w * 0.92 - size, h * 0.06, size, theme )
			);
		}
		const fs = h * 0.045;
		let y = h * 0.3;
		parts.push(
			textEl( x0, y, t( 'Name' ), {
				size: fs.toFixed( 2 ),
				font: theme.textFont,
				fill: ink,
			} )
		);
		parts.push( writeLine( x0 + fs * 3.2, y, cw - fs * 3.2, ink ) );
		y += h * 0.13;
		const answers = String( item.text || '' )
			.split( '\n' )
			.map( ( s ) => s.trim() )
			.filter( Boolean );
		for ( const a of answers.slice( 0, 4 ) ) {
			parts.push( checkbox( x0, y - fs * 0.85, fs, ink ) );
			parts.push(
				textEl( x0 + fs * 1.6, y, a, {
					size: fs.toFixed( 2 ),
					font: theme.textFont,
					fill: ink,
				} )
			);
			y += h * 0.1;
		}
		y += h * 0.02;
		parts.push(
			textEl( x0, y, t( 'Number of guests' ), {
				size: fs.toFixed( 2 ),
				font: theme.textFont,
				fill: ink,
			} )
		);
		parts.push( writeLine( x0 + fs * 8.5, y, cw - fs * 8.5, ink ) );
		y += h * 0.12;
		if ( y < h * 0.92 ) {
			parts.push(
				textEl( x0, y, t( 'Dietary needs' ), {
					size: fs.toFixed( 2 ),
					font: theme.textFont,
					fill: ink,
				} )
			);
			parts.push( writeLine( x0 + fs * 7, y, cw - fs * 7, ink ) );
		}
		parts.push( outline( shape, ink, 0.25 ) );
		return { pieces: [ { inner: parts.join( '' ), w, h } ], warnings: [] };
	},
};
