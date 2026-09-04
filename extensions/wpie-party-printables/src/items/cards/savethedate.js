/** Save the date: the names, the date big, the place, "invitation to follow". */
import {
	SHAPES,
	cardFrame,
	textStack,
	motifAt,
	outline,
	image,
} from '../common.js';

export const ITEM = {
	id: 'savethedate',
	label: 'Save the date',
	hint: 'The names and the date, sent before the invitation; the place and a closing line under it.',
	group: 'cards',
	uses: {
		text: true,
		names: false,
		photo: 'optional',
		event: [ 'title', 'date', 'place' ],
	},
	textLabel: 'Closing line',
	placeholder: 'Invitation to follow',
	sizes: [
		{ label: 'A6 postcard (148 x 105 mm)', w: 148, h: 105 },
		{ label: 'Square (120 x 120 mm)', w: 120, h: 120 },
		{ label: '5 x 7 in (178 x 127 mm)', w: 178, h: 127 },
	],
	repeat: true,
	photoBox( item ) {
		return { w: ( item.w || 148 ) * 0.42, h: ( item.h || 105 ) - 6 };
	},
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const t = ctx.t;
		const w = item.w || 148;
		const h = item.h || 105;
		const shape = SHAPES.rect( w, h );
		const parts = [
			cardFrame( shape, theme, {
				band: 'left',
				bandSize: w * 0.06,
				seed: 5,
			} ),
		];
		let box = { x: w * 0.14, y: h * 0.1, w: w * 0.78, h: h * 0.8 };
		if ( ctx.photo ) {
			const pw = w * 0.42;
			parts.push( image( ctx.photo, w * 0.06 + 3, 3, pw, h - 6 ) );
			box = {
				x: w * 0.06 + pw + w * 0.05,
				y: h * 0.1,
				w: w - pw - w * 0.17,
				h: h * 0.8,
			};
		} else if ( false !== item.motif && theme.motif ) {
			const size = h * 0.16;
			parts.push(
				motifAt( theme.motif, w * 0.9 - size, h * 0.06, size, theme )
			);
		}
		parts.push(
			textStack(
				[
					{ text: t( 'Save the date' ), role: 'small' },
					{ text: ctx.event.title || '', role: 'title' },
					{ role: 'gap' },
					{ text: ctx.event.date || '', role: 'strong' },
					{ text: ctx.event.place || '', role: 'line' },
					{ role: 'gap' },
					{
						text: item.text || t( 'Invitation to follow' ),
						role: 'small',
					},
				],
				box,
				{ theme, maxSize: h * 0.18 },
				env
			).inner
		);
		parts.push( outline( shape, theme.colors.ink, 0.25 ) );
		return { pieces: [ { inner: parts.join( '' ), w, h } ], warnings: [] };
	},
};
