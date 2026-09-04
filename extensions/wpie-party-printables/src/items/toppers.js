/** Cupcake toppers: small discs, stars or scallops with a letter or the motif, on a toothpick. */
import { SHAPES, bg, outline, patternIn, motifAt, label } from './common.js';
import { readableOn } from './palette.js';

export const TOPPER_SHAPES = [
	{ value: 'circle', label: 'Circle' },
	{ value: 'star', label: 'Star' },
	{ value: 'scallopCircle', label: 'Scallop' },
	{ value: 'hexagon', label: 'Hexagon' },
	{ value: 'heart', label: 'Heart' },
];

export const ITEM = {
	id: 'toppers',
	label: 'Cupcake toppers',
	hint: 'Discs, stars or scallops with letters or the motif, glued to a toothpick.',
	group: 'decor',
	uses: { text: true, names: false, photo: 'none', event: [] },
	sizes: [
		{ label: '50 mm', d: 50 },
		{ label: '40 mm', d: 40 },
		{ label: '60 mm', d: 60 },
	],
	repeat: true,
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const d = item.d || 50;
		const kind = item.shape || 'circle';
		const shape =
			'heart' === kind
				? SHAPES.heart( d, d )
				: SHAPES[ kind ]
				? SHAPES[ kind ]( d )
				: SHAPES.circle( d );
		const letters = [ ...String( item.text || '' ).toUpperCase() ].filter(
			( ch ) => ' ' !== ch && '\n' !== ch
		);
		const fills = [
			theme.colors.primary,
			theme.colors.secondary,
			theme.colors.accent,
		];
		const piece = ( ch, i ) => {
			const fill = fills[ i % 3 ];
			const parts = [ bg( shape, fill ) ];
			if ( false !== item.pattern ) {
				parts.push(
					patternIn( shape, theme, {
						seed: i + 7,
						opacity: 0.2,
						scale: 0.6,
					} )
				);
			}
			if ( ch ) {
				parts.push(
					label(
						ch,
						'star' === kind
							? {
									x: d * 0.25,
									y: d * 0.3,
									w: d * 0.5,
									h: d * 0.45,
							  }
							: {
									x: d * 0.2,
									y: d * 0.2,
									w: d * 0.6,
									h: d * 0.6,
							  },
						{
							font: theme.displayFont,
							weight: 700,
							color: readableOn( fill, theme.colors ),
							maxSize: d * 0.55,
						},
						env
					)
				);
			} else if ( theme.motif ) {
				parts.push(
					motifAt( theme.motif, d * 0.22, d * 0.22, d * 0.56, theme, {
						on: fill,
					} )
				);
			}
			parts.push( outline( shape, theme.colors.ink, 0.25 ) );
			return { inner: parts.join( '' ), w: shape.w, h: shape.h };
		};
		if ( letters.length > 1 ) {
			return { pieces: letters.map( piece ), warnings: [] };
		}
		const n = Math.max( 1, item.count || 12 );
		return {
			pieces: [ ...Array( n ) ].map( ( _, i ) =>
				piece( letters[ 0 ] || '', i )
			),
			warnings: [],
		};
	},
};
