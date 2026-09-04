/**
 * Invitation: a postcard, or a folded card with an outside and an inside
 * page (two pieces, two sheets). The event data fills it; the text is
 * the opening line, the message goes inside.
 */
import {
	SHAPES,
	cardFrame,
	textStack,
	motifAt,
	outline,
	image,
	paragraph,
	dashed,
	label,
} from '../common.js';

export const INVITATION_SIZES = [
	{ label: 'A6 postcard (148 x 105 mm)', w: 148, h: 105, fold: false },
	{ label: '5 x 7 in (178 x 127 mm)', w: 178, h: 127, fold: false },
	{
		label: 'Folded A6 (A5 flat, A4 landscape, two sheets)',
		w: 210,
		h: 148,
		fold: true,
	},
	{
		label: 'Folded A5 (A4 flat, A3 landscape, two sheets)',
		w: 297,
		h: 210,
		fold: true,
	},
];

export function eventLines( item, ctx, o = {} ) {
	const ev = ctx.event;
	const t = ctx.t;
	const when = [ ev.date, ev.time ].filter( Boolean ).join( ' · ' );
	return [
		o.lead ? { text: o.lead, role: 'small' } : null,
		{ text: ev.title || item.title || '', role: 'title' },
		{ text: ev.subtitle || '', role: 'subtitle' },
		{ role: 'gap' },
		{ text: when, role: 'strong' },
		{ text: ev.place || '', role: 'line' },
		ev.host
			? { text: t( 'Hosted by' ) + ' ' + ev.host, role: 'small' }
			: null,
	].filter( Boolean );
}

/** The front of a card of w x h at the origin: band, motif or photo, the event stack. */
export function frontFace( item, ctx, env, w, h, o = {} ) {
	const theme = ctx.theme;
	const shape = SHAPES.rect( w, h );
	const parts = [
		cardFrame( shape, theme, {
			band: 'bottom',
			bandSize: h * 0.12,
			seed: 4,
			inset: false !== item.frame ? 3 : 0,
		} ),
	];
	let box = { x: w * 0.08, y: h * 0.1, w: w * 0.84, h: h * 0.74 };
	if ( ctx.photo ) {
		const pw = w * 0.42;
		parts.push( image( ctx.photo, 3, 3, pw, h * 0.88 - 6 ) );
		box = {
			x: pw + w * 0.06,
			y: h * 0.1,
			w: w - pw - w * 0.1,
			h: h * 0.74,
		};
	} else if ( false !== item.motif && theme.motif ) {
		const size = Math.min( w, h ) * 0.2;
		parts.push(
			motifAt( theme.motif, w / 2 - size / 2, h * 0.07, size, theme )
		);
		box = {
			x: w * 0.08,
			y: h * 0.07 + size + h * 0.02,
			w: w * 0.84,
			h: h * 0.86 - size - h * 0.02 - h * 0.12,
		};
	}
	parts.push(
		textStack(
			eventLines( item, ctx, { lead: o.lead } ),
			box,
			{ theme, maxSize: h * 0.16 },
			env
		).inner
	);
	return parts.join( '' );
}

export const ITEM = {
	id: 'invitation',
	label: 'Invitation',
	hint: 'A postcard or a folded card with the title, date, time, place and host from the Event card; your opening line on the front, the message inside.',
	group: 'cards',
	uses: {
		text: true,
		names: false,
		photo: 'optional',
		event: [ 'title', 'subtitle', 'date', 'time', 'place', 'host' ],
	},
	textLabel: 'Opening line (front) and message (inside, after a blank line)',
	placeholder:
		'You are warmly invited to\n\nWe would love to celebrate this day with you. Dinner and dancing follow the ceremony; please let us know by the first of March whether you can join us.',
	sizes: INVITATION_SIZES,
	repeat: ( item ) => ! item.fold,
	photoBox( item ) {
		const w = item.fold ? ( item.w || 210 ) / 2 : item.w || 148;
		const h = item.h || 105;
		return { w: w * 0.42, h: h * 0.88 - 6 };
	},
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const t = ctx.t;
		const [ lead, ...rest ] = String( item.text || '' ).split( /\n\s*\n/ );
		const message = rest.join( '\n\n' ).trim();
		const W = item.w || 148;
		const H = item.h || 105;
		if ( ! item.fold ) {
			const inner =
				frontFace( item, ctx, env, W, H, { lead: lead.trim() } ) +
				outline( SHAPES.rect( W, H ), theme.colors.ink, 0.25 );
			return { pieces: [ { inner, w: W, h: H } ], warnings: [] };
		}
		// Outside: back (left) and front (right), fold in the middle.
		const w = W / 2;
		const outside = [];
		outside.push(
			`<path d="${ SHAPES.rect( w, H ).d }" fill="${ theme.colors.bg }"/>`
		);
		if ( theme.motif ) {
			const size = w * 0.16;
			outside.push(
				motifAt(
					theme.motif,
					w / 2 - size / 2,
					H / 2 - size / 2,
					size,
					theme
				)
			);
		}
		if ( ctx.event.host ) {
			outside.push(
				label(
					ctx.event.host,
					{ x: w * 0.1, y: H * 0.86, w: w * 0.8, h: H * 0.06 },
					{
						font: theme.textFont,
						weight: 400,
						color: theme.colors.ink,
						maxSize: H * 0.03,
					},
					env
				)
			);
		}
		outside.push(
			`<g transform="translate(${ w.toFixed( 2 ) } 0)">${ frontFace(
				item,
				ctx,
				env,
				w,
				H,
				{ lead: lead.trim() }
			) }</g>`
		);
		outside.push( outline( SHAPES.rect( W, H ), theme.colors.ink, 0.25 ) );
		// Inside: the message on the right page, a line for the reply on the left.
		const inside = [
			`<path d="${ SHAPES.rect( W, H ).d }" fill="${
				theme.colors.bg
			}"/>`,
		];
		inside.push(
			paragraph(
				message || t( 'We would love to celebrate with you.' ),
				{ x: w + w * 0.1, y: H * 0.15, w: w * 0.8, h: H * 0.6 },
				{
					size: H * 0.032,
					font: theme.textFont,
					color: theme.colors.ink,
				},
				env
			)
		);
		if ( ctx.event.date ) {
			inside.push(
				label(
					ctx.event.date +
						( ctx.event.time ? ' · ' + ctx.event.time : '' ),
					{ x: w + w * 0.1, y: H * 0.78, w: w * 0.8, h: H * 0.07 },
					{
						font: theme.displayFont,
						weight: 700,
						color: theme.colors.accent,
						maxSize: H * 0.05,
					},
					env
				)
			);
		}
		if ( theme.motif ) {
			const size = w * 0.12;
			inside.push(
				motifAt( theme.motif, w / 2 - size / 2, H * 0.1, size, theme )
			);
		}
		inside.push( dashed( w, 0, w, H, theme.colors.ink ) );
		inside.push( outline( SHAPES.rect( W, H ), theme.colors.ink, 0.25 ) );
		return {
			pieces: [
				{
					inner: outside.join( '' ),
					w: W,
					h: H,
					folds: [ [ w, 0, w, H ] ],
				},
				{
					inner: inside.join( '' ),
					w: W,
					h: H,
					folds: [ [ w, 0, w, H ] ],
				},
			],
			warnings: [],
		};
	},
};
