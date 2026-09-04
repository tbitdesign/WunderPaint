/** Wine glass markers: a ring with a slit that hangs on the stem, a name on it. */
import { SHAPES, bg, outline, patternIn, motifAt, label } from '../common.js';
import { readableOn } from '../palette.js';
import { r } from '../../engine/units.js';

export const ITEM = {
	id: 'glassmarkers',
	label: 'Glass markers',
	hint: 'Rings with a slit that sit on the stem of a glass, one name each so nobody loses their drink.',
	group: 'gifts',
	uses: { text: true, names: 'optional', photo: 'none', event: [] },
	textLabel: 'Text on the marker',
	placeholder: 'Cheers',
	sizes: [
		{ label: '45 mm', d: 45 },
		{ label: '55 mm', d: 55 },
		{ label: '38 mm', d: 38 },
	],
	repeat: true,
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const d = item.d || 45;
		const texts =
			ctx.event.names &&
			ctx.event.names.length &&
			'names' === item.textFrom
				? ctx.event.names
				: [ item.text || '' ];
		const inner = d * 0.3;
		const pieces = texts.map( ( text, i ) => {
			const shape = SHAPES.circle( d );
			const fill = i % 2 ? theme.colors.secondary : theme.colors.primary;
			const parts = [ bg( shape, fill ) ];
			if ( false !== item.pattern ) {
				parts.push(
					patternIn( shape, theme, {
						seed: 100 + i,
						opacity: 0.25,
						scale: 0.4,
					} )
				);
			}
			// The centre hole and the slit from the edge.
			parts.push(
				`<circle cx="${ r( d / 2 ) }" cy="${ r( d / 2 ) }" r="${ r(
					inner / 2
				) }" fill="#ffffff" stroke="${
					theme.colors.ink
				}" stroke-width="0.25"/>`
			);
			parts.push(
				`<line x1="${ r( d / 2 ) }" y1="${ r(
					d / 2 + inner / 2
				) }" x2="${ r( d / 2 ) }" y2="${ r( d ) }" stroke="${
					theme.colors.ink
				}" stroke-width="0.3"/>`
			);
			if ( false !== item.motif && theme.motif ) {
				const size = d * 0.2;
				parts.push(
					motifAt(
						theme.motif,
						d / 2 - size / 2,
						d * 0.07,
						size,
						theme,
						{ on: fill }
					)
				);
			}
			parts.push(
				label(
					text,
					{ x: d * 0.08, y: d * 0.68, w: d * 0.84, h: d * 0.24 },
					{
						font: theme.displayFont,
						weight: 700,
						color: readableOn( fill, theme.colors ),
						maxSize: d * 0.17,
						wrap: false,
					},
					env
				)
			);
			parts.push( outline( shape, theme.colors.ink, 0.25 ) );
			return { inner: parts.join( '' ), w: d, h: d };
		} );
		return { pieces, warnings: [] };
	},
};
