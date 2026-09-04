/** Gift tags: a shape with a hole, the theme pattern, a motif and a line of text. */
import {
	SHAPES,
	bg,
	outline,
	hole,
	patternIn,
	motifAt,
	label,
} from './common.js';

export const TAG_SHAPES = [
	{ value: 'tag', label: 'Tag' },
	{ value: 'rect', label: 'Rounded' },
	{ value: 'circle', label: 'Circle' },
	{ value: 'heart', label: 'Heart' },
	{ value: 'scallopCircle', label: 'Scallop' },
];

export const ITEM = {
	id: 'tags',
	label: 'Gift tags',
	hint: 'Tags with a hole for the ribbon: thank you, a name, a date.',
	group: 'gifts',
	uses: { text: true, names: 'optional', photo: 'none', event: [ 'title' ] },
	sizes: [
		{ label: 'Tag (50 x 90 mm)', w: 50, h: 90 },
		{ label: 'Square (60 x 60 mm)', w: 60, h: 60 },
		{ label: 'Small (40 x 70 mm)', w: 40, h: 70 },
	],
	repeat: true,
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const w = item.w || 50;
		const h = item.h || 90;
		const kind = item.shape || 'tag';
		const shape =
			'circle' === kind || 'scallopCircle' === kind
				? SHAPES[ kind ]( Math.min( w, h ) )
				: 'heart' === kind
				? SHAPES.heart( w, h )
				: 'rect' === kind
				? SHAPES.rect( w, h, { rx: w * 0.1 } )
				: SHAPES.tag( w, h );
		const texts =
			ctx.event.names &&
			ctx.event.names.length &&
			'names' === item.textFrom
				? ctx.event.names
				: [ item.text || ctx.event.title || '' ];
		const pieces = texts.map( ( text, i ) => {
			const parts = [ bg( shape, theme.colors.bg ) ];
			if ( false !== item.pattern ) {
				parts.push(
					patternIn( shape, theme, {
						seed: i + 5,
						opacity: 0.25,
						scale: 0.7,
					} )
				);
			}
			const holeY = 'heart' === kind ? shape.h * 0.2 : shape.h * 0.1;
			parts.push(
				hole(
					shape.w / 2,
					holeY,
					Math.min( 2.5, shape.w * 0.05 ),
					theme.colors.ink
				)
			);
			const heart = 'heart' === kind;
			const mid = heart
				? {
						x: shape.w * 0.18,
						y: shape.h * 0.3,
						w: shape.w * 0.64,
						h: shape.h * 0.26,
				  }
				: {
						x: shape.w * 0.12,
						y: shape.h * 0.3,
						w: shape.w * 0.76,
						h: shape.h * 0.34,
				  };
			if ( false !== item.motif && theme.motif ) {
				const size = shape.w * ( heart ? 0.22 : 0.3 );
				parts.push(
					motifAt(
						theme.motif,
						shape.w / 2 - size / 2,
						shape.h * 0.2,
						size,
						theme
					)
				);
				mid.y = shape.h * ( heart ? 0.44 : 0.56 );
				mid.h = shape.h * ( heart ? 0.2 : 0.28 );
			}
			parts.push(
				label(
					text,
					mid,
					{
						font: theme.displayFont,
						weight: 700,
						color: theme.colors.ink,
						maxSize: shape.h * 0.14,
					},
					env
				)
			);
			parts.push( outline( shape, theme.colors.ink, 0.25 ) );
			return { inner: parts.join( '' ), w: shape.w, h: shape.h };
		} );
		return { pieces, warnings: [] };
	},
};
