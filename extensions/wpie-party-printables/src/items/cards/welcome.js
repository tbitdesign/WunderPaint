/** Welcome sign: the big word, the event title, date and place, the motif. */
import {
	SHAPES,
	cardFrame,
	textStack,
	motifAt,
	outline,
	image,
} from '../common.js';

export const ITEM = {
	id: 'welcome',
	label: 'Welcome sign',
	hint: 'A sign for the door or the easel: the big word, the event title, date and place.',
	group: 'cards',
	uses: {
		text: true,
		names: false,
		photo: 'optional',
		event: [ 'title', 'subtitle', 'date', 'place' ],
	},
	textLabel: 'The big word',
	placeholder: 'Welcome',
	sizes: [
		{ label: 'A4 (210 x 297 mm)', w: 194, h: 281 },
		{ label: 'A3 (297 x 420 mm)', w: 281, h: 404 },
		{ label: 'A5 (148 x 210 mm)', w: 140, h: 200 },
	],
	repeat: false,
	photoBox( item ) {
		return { w: ( item.w || 194 ) * 0.7, h: ( item.h || 281 ) * 0.36 };
	},
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const t = ctx.t;
		const w = item.w || 194;
		const h = item.h || 281;
		const shape = SHAPES.rect( w, h );
		const parts = [
			cardFrame( shape, theme, {
				band: 'bottom',
				bandSize: h * 0.1,
				seed: 13,
				inset: 4,
			} ),
		];
		let box = { x: w * 0.1, y: h * 0.12, w: w * 0.8, h: h * 0.72 };
		if ( ctx.photo ) {
			parts.push(
				image( ctx.photo, w * 0.15, h * 0.08, w * 0.7, h * 0.36 )
			);
			box = { x: w * 0.1, y: h * 0.47, w: w * 0.8, h: h * 0.4 };
		} else if ( false !== item.motif && theme.motif ) {
			const size = w * 0.24;
			parts.push(
				motifAt( theme.motif, w / 2 - size / 2, h * 0.08, size, theme )
			);
			box = {
				x: w * 0.1,
				y: h * 0.08 + size + h * 0.02,
				w: w * 0.8,
				h: h * 0.76 - size,
			};
		}
		const when = [ ctx.event.date, ctx.event.time ]
			.filter( Boolean )
			.join( ' · ' );
		parts.push(
			textStack(
				[
					{ text: item.text || t( 'Welcome' ), role: 'title' },
					{ text: ctx.event.title || '', role: 'strong' },
					{ text: ctx.event.subtitle || '', role: 'subtitle' },
					{ role: 'gap' },
					{ text: when, role: 'line' },
					{ text: ctx.event.place || '', role: 'line' },
				],
				box,
				{ theme, maxSize: w * 0.2 },
				env
			).inner
		);
		parts.push( outline( shape, theme.colors.ink, 0.25 ) );
		return { pieces: [ { inner: parts.join( '' ), w, h } ], warnings: [] };
	},
};
