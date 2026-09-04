/** Jam and jar labels: round or rectangular, the title, a line and the date. */
import { SHAPES, bg, outline, patternIn, motifAt, label } from '../common.js';

export const JAR_SHAPES = [
	{ value: 'circle', label: 'Circle' },
	{ value: 'rect', label: 'Rectangle' },
	{ value: 'scallopCircle', label: 'Scallop' },
];

export const ITEM = {
	id: 'jamlabels',
	label: 'Jar labels',
	hint: 'Labels for jam, honey, cookies or bath salts: the title, a line and the date, round or rectangular.',
	group: 'gifts',
	uses: {
		text: true,
		names: false,
		photo: 'none',
		event: [ 'date', 'host' ],
	},
	textLabel: 'Title and a second line',
	placeholder: 'Strawberry jam\nhomemade with love',
	sizes: [
		{ label: '60 mm round', w: 60, h: 60 },
		{ label: '70 x 50 mm', w: 70, h: 50 },
		{ label: '50 mm round', w: 50, h: 50 },
	],
	repeat: true,
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const t = ctx.t;
		const w = item.w || 60;
		const h = item.h || 60;
		const kind = item.shape || ( w === h ? 'circle' : 'rect' );
		const shape =
			'rect' === kind
				? SHAPES.rect( w, h, { rx: Math.min( w, h ) * 0.12 } )
				: SHAPES[ kind ]
				? SHAPES[ kind ]( Math.min( w, h ) )
				: SHAPES.circle( Math.min( w, h ) );
		const [ title, ...rest ] = String( item.text || 'Homemade' ).split(
			'\n'
		);
		const line = rest.join( ' ' ).trim();
		const n = Math.max( 1, item.count || 8 );
		const pieces = [ ...Array( n ) ].map( ( _, i ) => {
			const parts = [ bg( shape, theme.colors.bg ) ];
			if ( false !== item.pattern ) {
				parts.push(
					patternIn( shape, theme, {
						seed: 150 + i,
						opacity: 0.18,
						scale: 0.4,
					} )
				);
			}
			const inner =
				'rect' === kind
					? SHAPES.rect( shape.w * 0.84, shape.h * 0.78, {
							rx: shape.h * 0.08,
					  } )
					: SHAPES.circle( shape.w * 0.78 );
			parts.push(
				`<g transform="translate(${ (
					( shape.w - inner.w ) /
					2
				).toFixed( 2 ) } ${ ( ( shape.h - inner.h ) / 2 ).toFixed(
					2
				) })"><path d="${ inner.d }" fill="${
					theme.colors.bg
				}" stroke="${ theme.colors.accent }" stroke-width="0.4"/></g>`
			);
			let y = shape.h * 0.2;
			if ( false !== item.motif && theme.motif ) {
				const size = shape.h * 0.2;
				parts.push(
					motifAt(
						theme.motif,
						shape.w / 2 - size / 2,
						y,
						size,
						theme
					)
				);
				y += size;
			}
			parts.push(
				label(
					title.trim(),
					{
						x: shape.w * 0.16,
						y,
						w: shape.w * 0.68,
						h: shape.h * 0.2,
					},
					{
						font: theme.displayFont,
						weight: 700,
						color: theme.colors.ink,
						maxSize: shape.h * 0.13,
					},
					env
				)
			);
			y += shape.h * 0.2;
			if ( line ) {
				parts.push(
					label(
						line,
						{
							x: shape.w * 0.16,
							y,
							w: shape.w * 0.68,
							h: shape.h * 0.09,
						},
						{
							font: theme.textFont,
							weight: 400,
							color: theme.colors.ink,
							maxSize: shape.h * 0.06,
							italic: true,
						},
						env
					)
				);
				y += shape.h * 0.1;
			}
			const foot = [
				ctx.event.date,
				ctx.event.host ? t( 'by' ) + ' ' + ctx.event.host : '',
			]
				.filter( Boolean )
				.join( ' · ' );
			if ( foot ) {
				parts.push(
					label(
						foot,
						{
							x: shape.w * 0.16,
							y: Math.min( y, shape.h * 0.76 ),
							w: shape.w * 0.68,
							h: shape.h * 0.08,
						},
						{
							font: theme.textFont,
							weight: 400,
							color: theme.colors.accent,
							maxSize: shape.h * 0.05,
						},
						env
					)
				);
			}
			parts.push( outline( shape, theme.colors.ink, 0.25 ) );
			return { inner: parts.join( '' ), w: shape.w, h: shape.h };
		} );
		return { pieces, warnings: [] };
	},
};
