/** Envelope: a C6 or mini net with fold lines, the pattern as a liner on the flap. */
import { motifAt, patternIn, label } from '../common.js';
import { r } from '../../engine/units.js';

export const ITEM = {
	id: 'envelope',
	label: 'Envelope',
	hint: 'An envelope to cut, fold and glue, with the pattern as a liner inside the flap; C6 fits an A6 card.',
	group: 'cards',
	uses: { text: true, names: false, photo: 'none', event: [ 'host' ] },
	textLabel: 'Return address on the flap (optional)',
	placeholder: '',
	sizes: [
		{ label: 'C6 (162 x 114 mm, fits A6)', w: 162, h: 114 },
		{ label: 'Mini (120 x 85 mm, fits A7)', w: 120, h: 85 },
		{ label: 'Square (130 x 130 mm)', w: 130, h: 130 },
	],
	repeat: false,
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const w = item.w || 162;
		const h = item.h || 114;
		const side = Math.min( 15, w * 0.1 );
		const top = h * 0.5;
		const bottom = h * 0.6;
		const W = w + 2 * side;
		const H = h + top + bottom;
		const ink = theme.colors.ink;
		// Net: top flap (triangle), body, bottom flap, two side flaps.
		const pts = [
			[ side, top ],
			[ side + w / 2, 0 ],
			[ side + w, top ],
			[ W, top + h * 0.06 ],
			[ W, top + h * 0.94 ],
			[ side + w, top + h ],
			[ side + w, top + h + bottom * 0.9 ],
			[ side + w * 0.5, H ],
			[ side, top + h + bottom * 0.9 ],
			[ side, top + h ],
			[ 0, top + h * 0.94 ],
			[ 0, top + h * 0.06 ],
		];
		const d =
			'M' +
			pts.map( ( p ) => r( p[ 0 ] ) + ' ' + r( p[ 1 ] ) ).join( 'L' ) +
			'Z';
		const parts = [ `<path d="${ d }" fill="${ theme.colors.bg }"/>` ];
		// The liner: pattern on the top flap and a band inside the body's top.
		const flap = {
			d: `M${ r( side ) } ${ r( top ) }L${ r( side + w / 2 ) } 0L${ r(
				side + w
			) } ${ r( top ) }Z`,
			pts: [
				[ side, top ],
				[ side + w / 2, 0 ],
				[ side + w, top ],
			],
			w: W,
			h: top,
		};
		if ( false !== item.pattern ) {
			parts.push(
				`<path d="${ flap.d }" fill="${ theme.colors.primary }" fill-opacity="0.9"/>`
			);
			parts.push(
				patternIn( flap, theme, {
					seed: 80,
					opacity: 0.35,
					scale: 0.8,
					sheetBg: theme.colors.bg,
				} )
			);
		}
		if ( false !== item.motif && theme.motif ) {
			const size = h * 0.22;
			parts.push(
				motifAt(
					theme.motif,
					side + w / 2 - size / 2,
					top + h * 0.02,
					size,
					theme
				)
			);
		}
		if ( item.text ) {
			parts.push(
				label(
					item.text,
					{
						x: side + w * 0.25,
						y: top * 0.62,
						w: w * 0.5,
						h: top * 0.3,
					},
					{
						font: theme.textFont,
						weight: 400,
						color: theme.colors.bg,
						maxSize: top * 0.12,
					},
					env
				)
			);
		}
		parts.push(
			`<path d="${ d }" fill="none" stroke="${ ink }" stroke-width="0.25"/>`
		);
		const folds = [
			[ side, top, side + w, top ],
			[ side, top + h, side + w, top + h ],
			[ side, top, side, top + h ],
			[ side + w, top, side + w, top + h ],
		];
		return {
			pieces: [ { inner: parts.join( '' ), w: W, h: H, folds } ],
			warnings: [],
		};
	},
};
