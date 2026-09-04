/** Tournament bracket: four, eight or sixteen slots from the guest list, rounds to the final. */
import { SHAPES, cardFrame, label, motifAt, outline } from '../common.js';
import { textEl } from '../../engine/svg.js';
import { fitLine } from '../../engine/text.js';

export const BRACKET_SIZES = [
	{ value: 4, label: '4 players' },
	{ value: 8, label: '8 players' },
	{ value: 16, label: '16 players' },
];

export const ITEM = {
	id: 'bracket',
	label: 'Tournament bracket',
	hint: 'A knockout bracket for four, eight or sixteen players or teams from the guest list, with a box for the winner.',
	group: 'games',
	uses: {
		text: true,
		names: 'optional',
		photo: 'none',
		event: [ 'title', 'names' ],
	},
	textLabel: 'Title of the tournament',
	placeholder: 'Table football cup',
	sizes: [
		{ label: 'A4 landscape', w: 281, h: 194 },
		{ label: 'A4 (210 x 297 mm)', w: 194, h: 281 },
		{ label: 'A3 landscape', w: 404, h: 281 },
	],
	repeat: false,
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const t = ctx.t;
		const w = item.w || 281;
		const h = item.h || 194;
		const ink = theme.colors.ink;
		const slots = [ 4, 8, 16 ].includes( +item.slots ) ? +item.slots : 8;
		const names = ( ctx.event.names || [] ).slice( 0, slots );
		while ( names.length < slots ) {
			names.push( '' );
		}
		const rounds = Math.log2( slots );
		const shape = SHAPES.rect( w, h );
		const parts = [
			cardFrame( shape, theme, {
				band: 'top',
				bandSize: h * 0.05,
				seed: 330,
			} ),
		];
		parts.push(
			label(
				item.text || ctx.event.title || t( 'Tournament' ),
				{ x: w * 0.1, y: h * 0.07, w: w * 0.8, h: h * 0.08 },
				{
					font: theme.displayFont,
					weight: 700,
					color: ink,
					maxSize: h * 0.06,
					wrap: false,
				},
				env
			)
		);
		const top = h * 0.2;
		const areaH = h * 0.74;
		const colW = ( w * 0.9 ) / ( rounds + 1 );
		const boxW = colW * 0.72;
		const boxH = Math.min( h * 0.05, areaH / slots / 1.3 );
		const fs = boxH * 0.55;
		const centres = [];
		for ( let rd = 0; rd <= rounds; rd++ ) {
			const count = slots / Math.pow( 2, rd );
			const x = w * 0.05 + rd * colW;
			const ys = [];
			for ( let i = 0; i < count; i++ ) {
				const y = rd
					? ( centres[ rd - 1 ][ 2 * i ] +
							centres[ rd - 1 ][ 2 * i + 1 ] ) /
					  2
					: top + ( ( i + 0.5 ) * areaH ) / count;
				ys.push( y );
				const final = rd === rounds;
				parts.push(
					`<rect x="${ x.toFixed( 2 ) }" y="${ (
						y -
						boxH / 2
					).toFixed( 2 ) }" width="${ boxW.toFixed(
						2
					) }" height="${ boxH.toFixed( 2 ) }" fill="${
						final
							? theme.colors.accent
							: rd
							? theme.colors.bg
							: theme.colors.primary
					}" fill-opacity="${
						final ? 0.5 : rd ? 1 : 0.18
					}" stroke="${ ink }" stroke-width="0.3"/>`
				);
				if ( 0 === rd && names[ i ] ) {
					const size = fitLine(
						names[ i ],
						{
							w: boxW * 0.9,
							h: boxH,
							font: theme.textFont,
							weight: 700,
							maxSize: fs,
							minSize: 2,
						},
						env
					).size;
					parts.push(
						textEl( x + boxW * 0.05, y + size * 0.35, names[ i ], {
							size: size.toFixed( 2 ),
							font: theme.textFont,
							weight: 700,
							fill: ink,
						} )
					);
				}
				if ( rd > 0 ) {
					// Connectors from the two feeding boxes.
					const y1 = centres[ rd - 1 ][ 2 * i ];
					const y2 = centres[ rd - 1 ][ 2 * i + 1 ];
					const xPrev = w * 0.05 + ( rd - 1 ) * colW + boxW;
					const xm = x - colW * 0.12;
					parts.push(
						`<path d="M${ xPrev.toFixed( 2 ) } ${ y1.toFixed(
							2
						) }H${ xm.toFixed( 2 ) }V${ y2.toFixed(
							2
						) }H${ xPrev.toFixed( 2 ) }M${ xm.toFixed(
							2
						) } ${ y.toFixed( 2 ) }H${ x.toFixed(
							2
						) }" fill="none" stroke="${ ink }" stroke-width="0.35"/>`
					);
				}
				if ( final ) {
					parts.push(
						textEl( x + boxW / 2, y - boxH * 0.75, t( 'Winner' ), {
							size: ( fs * 0.9 ).toFixed( 2 ),
							font: theme.displayFont,
							weight: 700,
							fill: ink,
							anchor: 'middle',
						} )
					);
					if ( theme.motif ) {
						parts.push(
							motifAt(
								theme.motif,
								x + boxW / 2 - boxH * 0.8,
								y + boxH * 0.8,
								boxH * 1.6,
								theme
							)
						);
					}
				}
			}
			centres.push( ys );
		}
		parts.push( outline( shape, ink, 0.25 ) );
		return { pieces: [ { inner: parts.join( '' ), w, h } ], warnings: [] };
	},
};
