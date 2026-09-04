/** Coasters: round or square, the pattern, the motif and a word. */
import {
	SHAPES,
	bg,
	outline,
	patternIn,
	motifAt,
	label,
	image,
} from '../common.js';

export const COASTER_SHAPES = [
	{ value: 'circle', label: 'Circle' },
	{ value: 'rect', label: 'Square' },
	{ value: 'hexagon', label: 'Hexagon' },
	{ value: 'scallopCircle', label: 'Scallop' },
];

export const ITEM = {
	id: 'coasters',
	label: 'Coasters',
	hint: 'Round, square or hexagonal coasters with the pattern, the motif, a word or a photo.',
	group: 'gifts',
	uses: { text: true, names: false, photo: 'optional', event: [ 'title' ] },
	textLabel: 'Text on the coaster',
	placeholder: 'Cheers',
	sizes: [
		{ label: '90 mm', d: 90 },
		{ label: '100 mm', d: 100 },
		{ label: '80 mm', d: 80 },
	],
	repeat: true,
	photoBox( item ) {
		const d = item.d || 90;
		const shape = coasterShape( item.shape, d );
		return { w: d, h: d, d: shape.d };
	},
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const d = item.d || 90;
		const shape = coasterShape( item.shape, d );
		const n = Math.max( 1, item.count || 6 );
		const fills = [
			theme.colors.primary,
			theme.colors.secondary,
			theme.colors.bg,
		];
		const pieces = [ ...Array( n ) ].map( ( _, i ) => {
			const fill = fills[ i % 3 ];
			const parts = [ bg( shape, fill ) ];
			if ( ctx.photo ) {
				parts.push( image( ctx.photo, 0, 0, d, d ) );
				if ( item.text ) {
					parts.push(
						label(
							item.text,
							{ x: d * 0.15, y: d * 0.6, w: d * 0.7, h: d * 0.2 },
							{
								font: theme.displayFont,
								weight: 700,
								color: '#ffffff',
								shadow: true,
								maxSize: d * 0.14,
							},
							env
						)
					);
				}
			} else {
				if ( false !== item.pattern ) {
					parts.push(
						patternIn( shape, theme, {
							seed: 120 + i,
							opacity: 0.25,
							scale: 0.7,
						} )
					);
				}
				const ring =
					'circle' === ( item.shape || 'circle' ) ||
					'scallopCircle' === item.shape;
				if ( ring ) {
					parts.push(
						`<circle cx="${ ( d / 2 ).toFixed( 2 ) }" cy="${ (
							d / 2
						).toFixed( 2 ) }" r="${ ( d * 0.36 ).toFixed(
							2
						) }" fill="none" stroke="${
							theme.colors.ink
						}" stroke-width="0.4" stroke-opacity="0.6"/>`
					);
				}
				if ( false !== item.motif && theme.motif ) {
					const size = d * 0.28;
					parts.push(
						motifAt(
							theme.motif,
							d / 2 - size / 2,
							d * ( item.text ? 0.2 : 0.36 ),
							size,
							theme,
							{ on: fill }
						)
					);
				}
				if ( item.text ) {
					parts.push(
						label(
							item.text,
							{
								x: d * 0.2,
								y: d * 0.54,
								w: d * 0.6,
								h: d * 0.18,
							},
							{
								font: theme.displayFont,
								weight: 700,
								color: theme.colors.ink,
								maxSize: d * 0.12,
							},
							env
						)
					);
				}
			}
			parts.push( outline( shape, theme.colors.ink, 0.25 ) );
			return { inner: parts.join( '' ), w: d, h: d };
		} );
		return { pieces, warnings: [] };
	},
};

function coasterShape( kind, d ) {
	kind = kind || 'circle';
	return 'rect' === kind
		? SHAPES.rect( d, d, { rx: d * 0.1 } )
		: SHAPES[ kind ]
		? SHAPES[ kind ]( d )
		: SHAPES.circle( d );
}
