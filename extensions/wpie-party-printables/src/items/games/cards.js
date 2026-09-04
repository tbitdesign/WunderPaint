/**
 * Small text cards that share one look: scavenger hunt tasks, question
 * cards and "who am I" headband cards. One card per line.
 */
import {
	SHAPES,
	cardFrame,
	label,
	paragraph,
	motifAt,
	outline,
	checkbox,
} from '../common.js';
import { textEl } from '../../engine/svg.js';

export const CARD_SIZES = [
	{ label: 'Poker (63 x 88 mm, 6 per A4)', w: 63, h: 88 },
	{ label: 'Large (90 x 120 mm, 4 per A4)', w: 90, h: 120 },
	{ label: 'Mini (45 x 63 mm, 12 per A4)', w: 45, h: 63 },
];

export function textCards( item, ctx, env, o ) {
	const theme = ctx.theme;
	const t = ctx.t;
	const w = item.w || 63;
	const h = item.h || 88;
	const lines = String( item.text || '' )
		.split( '\n' )
		.map( ( s ) => s.trim() )
		.filter( Boolean );
	if ( ! lines.length ) {
		return { pieces: [], warnings: [ t( 'Add one line per card.' ) ] };
	}
	const title = item.title || t( o.title );
	const pieces = lines.map( ( text, i ) => {
		const shape = SHAPES.rect( w, h, { rx: w * 0.06 } );
		const parts = [
			cardFrame( shape, theme, {
				band: 'top',
				bandSize: h * 0.12,
				seed: 260 + i,
			} ),
		];
		parts.push(
			label(
				title,
				{ x: w * 0.06, y: h * 0.015, w: w * 0.88, h: h * 0.09 },
				{
					font: theme.displayFont,
					weight: 700,
					color: theme.colors.bg,
					maxSize: h * 0.075,
					wrap: false,
				},
				env
			)
		);
		let top = h * 0.16;
		if ( false !== item.motif && theme.motif ) {
			const size = w * 0.26;
			parts.push(
				motifAt( theme.motif, w / 2 - size / 2, top, size, theme )
			);
			top += size + h * 0.02;
		}
		if ( 'big' === o.body ) {
			parts.push(
				label(
					text,
					{ x: w * 0.08, y: top, w: w * 0.84, h: h * 0.86 - top },
					{
						font: theme.displayFont,
						weight: 700,
						color: theme.colors.ink,
						maxSize: h * 0.12,
					},
					env
				)
			);
		} else {
			parts.push(
				paragraph(
					text,
					{ x: w * 0.1, y: top, w: w * 0.8, h: h * 0.84 - top },
					{
						size: Math.min( h * 0.055, w * 0.09 ),
						font: theme.textFont,
						color: theme.colors.ink,
					},
					env
				)
			);
		}
		if ( o.check ) {
			parts.push(
				checkbox( w * 0.08, h * 0.88, h * 0.05, theme.colors.ink )
			);
		}
		parts.push(
			textEl( w * 0.94, h * 0.94, i + 1 + ' / ' + lines.length, {
				size: ( h * 0.035 ).toFixed( 2 ),
				font: theme.textFont,
				fill: theme.colors.ink,
				anchor: 'end',
			} )
		);
		parts.push( outline( shape, theme.colors.ink, 0.25 ) );
		return { inner: parts.join( '' ), w, h };
	} );
	return { pieces, warnings: [] };
}

export const SCAVENGER = {
	id: 'scavenger',
	label: 'Scavenger hunt',
	hint: 'One task per card with a box to tick: find, photograph, collect.',
	group: 'games',
	uses: { text: 'lines', names: false, photo: 'none', event: [] },
	textLabel: 'One task per line',
	placeholder:
		'Find something red\nTake a photo with the host\nCollect three leaves\nFind a guest born in May\nSpot the hidden balloon',
	sizes: CARD_SIZES,
	repeat: false,
	render( item, ctx, env ) {
		return textCards( item, ctx, env, {
			title: 'Scavenger hunt',
			body: 'text',
			check: true,
		} );
	},
};

export const QUESTIONS = {
	id: 'questions',
	label: 'Question cards',
	hint: 'Icebreakers, would-you-rather or table questions: one question per card.',
	group: 'games',
	uses: { text: 'lines', names: false, photo: 'none', event: [] },
	textLabel: 'One question per line',
	placeholder:
		'Would you rather fly or be invisible?\nWhat was your first concert?\nWhich song gets you on the dance floor?\nWhat is the best gift you ever got?',
	sizes: CARD_SIZES,
	repeat: false,
	render( item, ctx, env ) {
		return textCards( item, ctx, env, {
			title: 'Question',
			body: 'text',
			check: false,
		} );
	},
};

export const HEADBANDS = {
	id: 'headbands',
	label: 'Who am I cards',
	hint: 'Cards for the headband game: the name big, the others give hints, one name per line.',
	group: 'games',
	uses: { text: 'lines', names: false, photo: 'none', event: [] },
	textLabel: 'One name per line',
	placeholder:
		'Sherlock Holmes\nPippi Longstocking\nDarth Vader\nMary Poppins\nA giraffe\nThe Eiffel Tower',
	sizes: [
		{ label: 'Landscape (88 x 63 mm, 6 per A4)', w: 88, h: 63 },
		{ label: 'Large (120 x 90 mm, 4 per A4)', w: 120, h: 90 },
	],
	repeat: false,
	render( item, ctx, env ) {
		return textCards( item, ctx, env, {
			title: 'Who am I?',
			body: 'big',
			check: false,
		} );
	},
};
