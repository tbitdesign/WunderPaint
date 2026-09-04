/** Thank-you card: the big thanks, a message, the host's name. */
import {
	SHAPES,
	cardFrame,
	label,
	paragraph,
	motifAt,
	outline,
	image,
} from '../common.js';

export const ITEM = {
	id: 'thankyou',
	label: 'Thank-you card',
	hint: 'A big thank you with a short message and the names of the hosts.',
	group: 'cards',
	uses: {
		text: true,
		names: false,
		photo: 'optional',
		event: [ 'title', 'host' ],
	},
	textLabel: 'The thanks (first line) and the message',
	placeholder:
		'Thank you\nfor celebrating with us, for the gift and for the dance.',
	sizes: [
		{ label: 'A6 postcard (148 x 105 mm)', w: 148, h: 105 },
		{ label: 'A7 (105 x 74 mm, 4 per A4)', w: 105, h: 74 },
		{ label: 'Square (120 x 120 mm)', w: 120, h: 120 },
	],
	repeat: true,
	photoBox( item ) {
		return { w: item.w || 148, h: ( item.h || 105 ) * 0.5 };
	},
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const t = ctx.t;
		const w = item.w || 148;
		const h = item.h || 105;
		const shape = SHAPES.rect( w, h );
		const [ first, ...rest ] = String(
			item.text || t( 'Thank you' )
		).split( '\n' );
		const message = rest.join( '\n' ).trim();
		const parts = [
			cardFrame( shape, theme, {
				band: ctx.photo ? 'none' : 'top',
				bandSize: h * 0.08,
				seed: 6,
			} ),
		];
		let top = h * 0.1;
		if ( ctx.photo ) {
			parts.push( image( ctx.photo, 0, 0, w, h * 0.5 ) );
			top = h * 0.53;
		} else if ( false !== item.motif && theme.motif ) {
			const size = h * 0.2;
			parts.push(
				motifAt( theme.motif, w / 2 - size / 2, h * 0.12, size, theme )
			);
			top = h * 0.34;
		}
		parts.push(
			label(
				first.trim() || t( 'Thank you' ),
				{ x: w * 0.08, y: top, w: w * 0.84, h: h * 0.2 },
				{
					font: theme.displayFont,
					weight: 700,
					color: theme.colors.ink,
					maxSize: h * 0.16,
				},
				env
			)
		);
		if ( message ) {
			parts.push(
				paragraph(
					message,
					{
						x: w * 0.12,
						y: top + h * 0.22,
						w: w * 0.76,
						h: h * 0.22,
					},
					{
						size: h * 0.045,
						font: theme.textFont,
						color: theme.colors.ink,
					},
					env
				)
			);
		}
		const who = ctx.event.host || ctx.event.title;
		if ( who ) {
			parts.push(
				label(
					who,
					{ x: w * 0.1, y: h * 0.84, w: w * 0.8, h: h * 0.08 },
					{
						font: theme.textFont,
						weight: 400,
						color: theme.colors.ink,
						maxSize: h * 0.05,
						italic: true,
					},
					env
				)
			);
		}
		parts.push( outline( shape, theme.colors.ink, 0.25 ) );
		return { pieces: [ { inner: parts.join( '' ), w, h } ], warnings: [] };
	},
};
