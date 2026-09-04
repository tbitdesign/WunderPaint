/** Play money: notes per value line, a few copies each, the motif or a photo in the oval. */
import {
	SHAPES,
	bg,
	outline,
	patternIn,
	motifAt,
	label,
	image,
	serial,
} from '../common.js';
import { readableOn } from '../palette.js';
import { textEl } from '../../engine/svg.js';

export const ITEM = {
	id: 'playmoney',
	label: 'Play money',
	hint: 'Notes for the toy shop and the casino night: one value per line, a few copies of each, the motif or a photo in the oval.',
	group: 'games',
	uses: {
		text: 'lines',
		names: false,
		photo: 'optional',
		event: [ 'title' ],
	},
	textLabel: 'Values, one per line',
	placeholder: '1\n5\n10\n20\n50\n100',
	sizes: [
		{ label: '140 x 70 mm (3 per A4)', w: 140, h: 70 },
		{ label: '120 x 60 mm (4 per A4)', w: 120, h: 60 },
		{ label: '150 x 75 mm', w: 150, h: 75 },
	],
	repeat: false,
	photoBox( item ) {
		const h = item.h || 70;
		return { w: h * 0.62, h: h * 0.62, d: SHAPES.circle( h * 0.62 ).d };
	},
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const t = ctx.t;
		const w = item.w || 140;
		const h = item.h || 70;
		const ink = theme.colors.ink;
		const values = String( item.text || '' )
			.split( '\n' )
			.map( ( s ) => s.trim() )
			.filter( Boolean );
		const list = values.length ? values : [ '1', '5', '10' ];
		const copies = Math.max( 1, Math.min( 12, item.copies || 3 ) );
		const bank = ctx.event.title || t( 'Party bank' );
		const fills = [
			theme.colors.primary,
			theme.colors.secondary,
			theme.colors.accent,
		];
		const pieces = [];
		list.forEach( ( value, vi ) => {
			for ( let c = 0; c < copies; c++ ) {
				const fill = fills[ vi % 3 ];
				const shape = SHAPES.rect( w, h, { rx: h * 0.06 } );
				const parts = [ bg( shape, theme.colors.bg ) ];
				parts.push(
					patternIn( shape, theme, {
						seed: 420 + vi,
						opacity: 0.12,
						scale: 0.4,
					} )
				);
				parts.push(
					`<rect x="${ ( w * 0.03 ).toFixed( 2 ) }" y="${ (
						h * 0.06
					).toFixed( 2 ) }" width="${ ( w * 0.94 ).toFixed(
						2
					) }" height="${ ( h * 0.88 ).toFixed(
						2
					) }" fill="none" stroke="${ fill }" stroke-width="1.2"/>`
				);
				parts.push(
					`<rect x="${ ( w * 0.05 ).toFixed( 2 ) }" y="${ (
						h * 0.1
					).toFixed( 2 ) }" width="${ ( w * 0.9 ).toFixed(
						2
					) }" height="${ ( h * 0.8 ).toFixed(
						2
					) }" fill="none" stroke="${ ink }" stroke-width="0.25"/>`
				);
				const od = h * 0.62;
				const ox = w / 2 - od / 2;
				const oy = h / 2 - od / 2;
				parts.push(
					`<circle cx="${ ( w / 2 ).toFixed( 2 ) }" cy="${ (
						h / 2
					).toFixed( 2 ) }" r="${ ( od / 2 ).toFixed(
						2
					) }" fill="${ fill }" fill-opacity="0.25" stroke="${ fill }" stroke-width="0.8"/>`
				);
				if ( ctx.photo ) {
					parts.push( image( ctx.photo, ox, oy, od, od ) );
				} else if ( theme.motif ) {
					parts.push(
						motifAt(
							theme.motif,
							ox + od * 0.2,
							oy + od * 0.2,
							od * 0.6,
							theme
						)
					);
				}
				for ( const [ x, y, anchor ] of [
					[ w * 0.08, h * 0.32, 'start' ],
					[ w * 0.92, h * 0.86, 'end' ],
				] ) {
					parts.push(
						textEl( x, y, value, {
							size: ( h * 0.24 ).toFixed( 2 ),
							font: theme.displayFont,
							weight: 700,
							fill,
							anchor,
						} )
					);
				}
				parts.push(
					label(
						bank,
						{ x: w * 0.25, y: h * 0.1, w: w * 0.5, h: h * 0.12 },
						{
							font: theme.textFont,
							weight: 700,
							color: ink,
							maxSize: h * 0.08,
							wrap: false,
						},
						env
					)
				);
				parts.push(
					textEl(
						w / 2,
						h * 0.9,
						t( 'Play money' ) +
							' · ' +
							serial( vi * 100 + c + 1, 4 ),
						{
							size: ( h * 0.05 ).toFixed( 2 ),
							font: theme.textFont,
							fill: ink,
							anchor: 'middle',
						}
					)
				);
				parts.push( outline( shape, ink, 0.25 ) );
				void readableOn;
				pieces.push( { inner: parts.join( '' ), w, h } );
			}
		} );
		return { pieces, warnings: [] };
	},
};
