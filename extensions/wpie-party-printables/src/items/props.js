/** Photo props: moustache, glasses, lips, hat, speech bubble and star wand, each on a stick. */
import { label } from './common.js';

const PROPS = {
	moustache: {
		w: 90,
		h: 30,
		d: 'M45 20C30 0 8 4 4 18C10 30 30 30 45 20C60 30 80 30 86 18C82 4 60 0 45 20Z',
		fill: 'ink',
	},
	glasses: {
		w: 90,
		h: 34,
		d: 'M4 14C4 4 36 4 36 14C36 28 4 28 4 14ZM54 14C54 4 86 4 86 14C86 28 54 28 54 14ZM36 12H54V17H36Z',
		fill: 'primary',
	},
	lips: {
		w: 60,
		h: 30,
		d: 'M4 14C14 2 24 4 30 10C36 4 46 2 56 14C46 30 14 30 4 14Z',
		fill: 'accent',
	},
	hat: {
		w: 80,
		h: 44,
		d: 'M2 38H78V44H2ZM14 38C12 20 18 6 40 4C62 6 68 20 66 38Z',
		fill: 'secondary',
	},
	bubble: { w: 90, h: 54, d: 'M5 5H85V40H36L25 52L27 40H5Z', fill: 'bg' },
	wand: {
		w: 40,
		h: 40,
		d: 'M20 2L25 15L38 15L28 23L32 36L20 28L8 36L12 23L2 15L15 15Z',
		fill: 'accent',
	},
};

export const ITEM = {
	id: 'props',
	label: 'Photo props',
	hint: 'Moustache, glasses, lips, hat, speech bubble and star wand on sticks for the photo corner.',
	group: 'decor',
	uses: { text: true, names: false, photo: 'none', event: [] },
	sizes: [
		{ label: 'Standard', scale: 1 },
		{ label: 'Large', scale: 1.3 },
	],
	repeat: false,
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const k = item.scale || 1;
		const kinds = String(
			item.kinds || 'moustache glasses lips hat bubble wand'
		)
			.split( /\s+/ )
			.filter( ( id ) => PROPS[ id ] );
		const stickH = 80 * k;
		const pieces = kinds.map( ( id ) => {
			const p = PROPS[ id ];
			const w = p.w * k;
			const h = p.h * k;
			const parts = [];
			const fill = theme.colors[ p.fill ] || theme.colors.ink;
			parts.push(
				`<g transform="scale(${ k.toFixed( 3 ) })"><path d="${
					p.d
				}" fill="${ fill }" stroke="${
					theme.colors.ink
				}" stroke-width="${ ( 0.3 / k ).toFixed( 2 ) }"/></g>`
			);
			if ( 'bubble' === id ) {
				parts.push(
					label(
						item.text || 'Hi!',
						{ x: w * 0.1, y: h * 0.12, w: w * 0.8, h: h * 0.5 },
						{
							font: theme.displayFont,
							weight: 700,
							color: theme.colors.ink,
							maxSize: h * 0.4,
						},
						env
					)
				);
			}
			// The stick: a strip under the prop, glued to a skewer.
			parts.push(
				`<rect x="${ ( w / 2 - 3 * k ).toFixed( 2 ) }" y="${ (
					h * 0.7
				).toFixed( 2 ) }" width="${ ( 6 * k ).toFixed(
					2
				) }" height="${ stickH.toFixed( 2 ) }" fill="${
					theme.colors.secondary
				}" stroke="${ theme.colors.ink }" stroke-width="0.25"/>`
			);
			return { inner: parts.join( '' ), w, h: h * 0.7 + stickH };
		} );
		return { pieces, warnings: [] };
	},
};
