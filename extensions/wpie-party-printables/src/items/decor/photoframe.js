/** Photo frame: a patterned frame with a window to cut for a print size, a line under it. */
import { SHAPES, bg, outline, patternIn, motifAt, label } from '../common.js';
import { readableOn } from '../palette.js';

export const ITEM = {
	id: 'photoframe',
	label: 'Photo frame',
	hint: 'A frame to cut with a window for a 10 x 15 or 13 x 18 print, the pattern on the frame and a line under the window.',
	group: 'decor',
	uses: {
		text: true,
		names: false,
		photo: 'none',
		event: [ 'title', 'date' ],
	},
	textLabel: 'Line under the window',
	placeholder: 'Our day',
	sizes: [
		{
			label: 'Window 10 x 15 cm (frame 150 x 200 mm)',
			w: 150,
			h: 200,
			winW: 100,
			winH: 150,
		},
		{
			label: 'Window 13 x 18 cm (frame 180 x 240 mm)',
			w: 180,
			h: 240,
			winW: 130,
			winH: 180,
		},
		{
			label: 'Window 9 x 13 cm (frame 130 x 180 mm)',
			w: 130,
			h: 180,
			winW: 90,
			winH: 130,
		},
	],
	repeat: false,
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const w = item.w || 150;
		const h = item.h || 200;
		const winW = item.winW || 100;
		const winH = item.winH || 150;
		const shape = SHAPES.rect( w, h );
		const parts = [ bg( shape, theme.colors.primary ) ];
		if ( false !== item.pattern ) {
			parts.push(
				patternIn( shape, theme, {
					seed: 190,
					opacity: 0.3,
					scale: 0.8,
				} )
			);
		}
		const wx = ( w - winW ) / 2;
		const wy = Math.min( ( w - winW ) / 2, 15 );
		const win = SHAPES.rect( winW, winH );
		parts.push(
			`<g transform="translate(${ wx.toFixed( 2 ) } ${ wy.toFixed(
				2
			) })"><path d="${ win.d }" fill="#ffffff"/><path d="${
				win.d
			}" fill="none" stroke="${
				theme.colors.ink
			}" stroke-width="0.3"/></g>`
		);
		// A thin mat line around the window.
		const mat = SHAPES.rect( winW + 6, winH + 6 );
		parts.push(
			`<g transform="translate(${ ( wx - 3 ).toFixed( 2 ) } ${ (
				wy - 3
			).toFixed( 2 ) })"><path d="${ mat.d }" fill="none" stroke="${
				theme.colors.bg
			}" stroke-width="1.2"/></g>`
		);
		const below = h - wy - winH;
		if ( false !== item.motif && theme.motif ) {
			const size = Math.min( below * 0.5, w * 0.14 );
			parts.push(
				motifAt(
					theme.motif,
					w * 0.08,
					wy + winH + below / 2 - size / 2,
					size,
					theme,
					{ on: theme.colors.primary }
				)
			);
			parts.push(
				motifAt(
					theme.motif,
					w * 0.92 - size,
					wy + winH + below / 2 - size / 2,
					size,
					theme,
					{ on: theme.colors.primary, flip: true }
				)
			);
		}
		const text = [ item.text, ctx.event.title, ctx.event.date ].filter(
			Boolean
		);
		if ( text.length ) {
			parts.push(
				label(
					text[ 0 ],
					{
						x: w * 0.22,
						y: wy + winH + below * 0.2,
						w: w * 0.56,
						h: below * 0.32,
					},
					{
						font: theme.displayFont,
						weight: 700,
						color: readableOn( theme.colors.primary, theme.colors ),
						maxSize: below * 0.3,
					},
					env
				)
			);
			if ( text[ 1 ] ) {
				parts.push(
					label(
						text.slice( 1 ).join( ' · ' ),
						{
							x: w * 0.22,
							y: wy + winH + below * 0.56,
							w: w * 0.56,
							h: below * 0.18,
						},
						{
							font: theme.textFont,
							weight: 400,
							color: readableOn(
								theme.colors.primary,
								theme.colors
							),
							maxSize: below * 0.13,
						},
						env
					)
				);
			}
		}
		parts.push( outline( shape, theme.colors.ink, 0.25 ) );
		return { pieces: [ { inner: parts.join( '' ), w, h } ], warnings: [] };
	},
};
