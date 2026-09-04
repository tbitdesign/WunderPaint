/** Domino: the 28 tiles, the values as pips of six motifs. */
import { SHAPES, bg, outline, motifAt, PIPS } from '../common.js';
import { MOTIF_IDS } from '../../engine/motifs.js';

export const ITEM = {
	id: 'domino',
	label: 'Domino',
	hint: 'The classic 28 tiles with the motifs of the occasion as pips: one motif per value, from one to six.',
	group: 'games',
	uses: { text: false, names: false, photo: 'none', event: [] },
	sizes: [
		{ label: '25 x 50 mm (all 28 on one A4)', w: 25, h: 50 },
		{ label: '30 x 60 mm', w: 30, h: 60 },
		{ label: '40 x 80 mm', w: 40, h: 80 },
	],
	repeat: false,
	render( item, ctx ) {
		const theme = ctx.theme;
		const w = item.w || 25;
		const h = item.h || 50;
		const ink = theme.colors.ink;
		const motifs = [
			theme.motif,
			'star',
			'heart',
			'balloon',
			'gift',
			'flower',
			'sun',
			'cake',
		]
			.filter(
				( m, i, a ) =>
					m && MOTIF_IDS.includes( m ) && a.indexOf( m ) === i
			)
			.slice( 0, 6 );
		const half = ( v ) => {
			if ( ! v ) {
				return '';
			}
			const id = motifs[ ( v - 1 ) % motifs.length ];
			const size = w * ( 1 === v ? 0.5 : v < 4 ? 0.34 : 0.3 );
			return PIPS[ v ]
				.map( ( [ px, py ] ) =>
					motifAt(
						id,
						px * w - size / 2,
						py * w - size / 2,
						size,
						theme,
						{ on: theme.colors.bg }
					)
				)
				.join( '' );
		};
		const pieces = [];
		for ( let a = 0; a <= 6; a++ ) {
			for ( let b = a; b <= 6; b++ ) {
				const shape = SHAPES.rect( w, h, { rx: w * 0.1 } );
				const parts = [ bg( shape, theme.colors.bg ) ];
				parts.push( half( a ) );
				parts.push(
					`<g transform="translate(0 ${ ( h / 2 ).toFixed(
						2
					) })">${ half( b ) }</g>`
				);
				parts.push(
					`<line x1="${ ( w * 0.1 ).toFixed( 2 ) }" y1="${ (
						h / 2
					).toFixed( 2 ) }" x2="${ ( w * 0.9 ).toFixed(
						2
					) }" y2="${ ( h / 2 ).toFixed( 2 ) }" stroke="${
						theme.colors.accent
					}" stroke-width="0.5"/>`
				);
				parts.push( outline( shape, ink, 0.3 ) );
				pieces.push( { inner: parts.join( '' ), w, h } );
			}
		}
		return { pieces, warnings: [] };
	},
};
