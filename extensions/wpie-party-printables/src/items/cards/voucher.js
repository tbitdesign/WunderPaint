/** Gift voucher: what it is for, lines for whom and from whom, a serial. */
import {
	SHAPES,
	cardFrame,
	label,
	motifAt,
	outline,
	writeLine,
	serial,
} from '../common.js';
import { textEl } from '../../engine/svg.js';

export const ITEM = {
	id: 'voucher',
	label: 'Gift voucher',
	hint: 'A voucher for a dinner, a day out or a favor, with lines for whom and from whom and a serial number.',
	group: 'cards',
	uses: { text: true, names: false, photo: 'none', event: [ 'title' ] },
	textLabel: 'What the voucher is for',
	placeholder: 'One breakfast in bed',
	sizes: [
		{ label: '150 x 70 mm (3 per A4)', w: 150, h: 70 },
		{ label: 'A6 landscape (148 x 105 mm)', w: 148, h: 105 },
		{ label: 'DL (200 x 95 mm)', w: 200, h: 95 },
	],
	repeat: false,
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const t = ctx.t;
		const w = item.w || 150;
		const h = item.h || 70;
		const n = Math.max( 1, Math.min( 50, item.count || 3 ) );
		const start = Math.max( 0, item.start || 1 );
		const pieces = [];
		for ( let i = 0; i < n; i++ ) {
			const shape = SHAPES.rect( w, h );
			const ink = theme.colors.ink;
			const parts = [
				cardFrame( shape, theme, {
					band: 'left',
					bandSize: w * 0.22,
					seed: 50 + i,
					inset: 2.5,
				} ),
			];
			if ( false !== item.motif && theme.motif ) {
				const size = w * 0.12;
				parts.push(
					motifAt(
						theme.motif,
						w * 0.11 - size / 2,
						h / 2 - size / 2,
						size,
						theme,
						{ on: theme.colors.primary }
					)
				);
			}
			const x0 = w * 0.27;
			const cw = w * 0.68;
			parts.push(
				label(
					t( 'Gift voucher' ),
					{ x: x0, y: h * 0.1, w: cw, h: h * 0.14 },
					{
						font: theme.textFont,
						weight: 700,
						color: theme.colors.accent,
						maxSize: h * 0.08,
						align: 'start',
					},
					env
				)
			);
			parts.push(
				label(
					item.text || t( 'One wish come true' ),
					{ x: x0, y: h * 0.26, w: cw, h: h * 0.28 },
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
			const fs = h * 0.055;
			const ly = h * 0.68;
			parts.push(
				textEl( x0, ly, t( 'For' ), {
					size: fs.toFixed( 2 ),
					font: theme.textFont,
					fill: ink,
				} )
			);
			parts.push( writeLine( x0 + fs * 2.2, ly, cw * 0.4, ink ) );
			parts.push(
				textEl( x0 + cw * 0.5, ly, t( 'From' ), {
					size: fs.toFixed( 2 ),
					font: theme.textFont,
					fill: ink,
				} )
			);
			parts.push(
				writeLine( x0 + cw * 0.5 + fs * 3, ly, cw * 0.5 - fs * 3, ink )
			);
			parts.push(
				textEl(
					x0,
					h * 0.88,
					( ctx.event.title ? ctx.event.title + ' · ' : '' ) +
						t( 'No.' ) +
						' ' +
						serial( start + i ),
					{
						size: ( fs * 0.8 ).toFixed( 2 ),
						font: theme.textFont,
						fill: theme.colors.accent,
					}
				)
			);
			parts.push( outline( shape, ink, 0.25 ) );
			pieces.push( { inner: parts.join( '' ), w, h } );
		}
		return { pieces, warnings: [] };
	},
};
