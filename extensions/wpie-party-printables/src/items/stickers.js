/** Sticker sheet: shapes with a photo, or a colour label with the motif and a word. */
import {
	SHAPES,
	bg,
	outline,
	patternIn,
	motifAt,
	label,
	image,
} from './common.js';
import { readableOn } from './palette.js';

export const STICKER_SHAPES = [
	{ value: 'circle', label: 'Circle' },
	{ value: 'rect', label: 'Rounded square' },
	{ value: 'star', label: 'Star' },
	{ value: 'heart', label: 'Heart' },
	{ value: 'scallopCircle', label: 'Scallop' },
	{ value: 'hexagon', label: 'Hexagon' },
];

function stickerShape( kind, d ) {
	kind = kind || 'circle';
	return 'rect' === kind
		? SHAPES.rect( d, d, { rx: d * 0.15 } )
		: 'heart' === kind
		? SHAPES.heart( d, d )
		: SHAPES[ kind ]
		? SHAPES[ kind ]( d )
		: SHAPES.circle( d );
}

export const ITEM = {
	id: 'stickers',
	label: 'Sticker sheet',
	hint: 'A sheet of stickers: a photo in a shape, or the motif and a word on colour.',
	group: 'gifts',
	uses: { text: true, names: false, photo: 'optional', event: [] },
	sizes: [
		{ label: '40 mm', d: 40 },
		{ label: '30 mm', d: 30 },
		{ label: '50 mm', d: 50 },
	],
	repeat: true,
	/** The photo is cut to the sticker shape before it lands here. */
	photoBox( item ) {
		const d = item.d || 40;
		const shape = stickerShape( item.shape, d );
		return { w: d, h: d, d: shape.d };
	},
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const d = item.d || 40;
		const shape = stickerShape( item.shape, d );
		const n = Math.max( 1, item.count || ( item.cols || 4 ) * 5 );
		const fills = [
			theme.colors.primary,
			theme.colors.secondary,
			theme.colors.accent,
		];
		const pieces = [ ...Array( n ) ].map( ( _, i ) => {
			const parts = [];
			if ( ctx.photo ) {
				parts.push( bg( shape, theme.colors.bg ) );
				parts.push( image( ctx.photo, 0, 0, d, d ) );
				if ( item.text ) {
					parts.push(
						label(
							item.text,
							{
								x: d * 0.1,
								y: d * 0.62,
								w: d * 0.8,
								h: d * 0.25,
							},
							{
								font: theme.displayFont,
								weight: 700,
								color: '#ffffff',
								shadow: true,
								maxSize: d * 0.2,
							},
							env
						)
					);
				}
			} else {
				const fill = fills[ i % 3 ];
				parts.push( bg( shape, fill ) );
				if ( item.pattern ) {
					parts.push(
						patternIn( shape, theme, {
							seed: i + 17,
							opacity: 0.2,
							scale: 0.5,
						} )
					);
				}
				if ( false !== item.motif && theme.motif ) {
					parts.push(
						motifAt(
							theme.motif,
							d * 0.25,
							d * ( item.text ? 0.14 : 0.22 ),
							d * 0.5,
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
								x: d * 0.12,
								y: d * 0.64,
								w: d * 0.76,
								h: d * 0.22,
							},
							{
								font: theme.displayFont,
								weight: 700,
								color: readableOn( fill, theme.colors ),
								maxSize: d * 0.18,
							},
							env
						)
					);
				}
			}
			parts.push( outline( shape, theme.colors.ink, 0.2 ) );
			return {
				inner: parts.join( '' ),
				w: shape.w,
				h: shape.h,
				cut: true,
			};
		} );
		return { pieces, warnings: [] };
	},
};
