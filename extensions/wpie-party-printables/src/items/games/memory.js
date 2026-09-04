/** Memory: pairs of cards from the photos or the motifs; the backs on their own sheet. */
import {
	SHAPES,
	bg,
	outline,
	patternIn,
	motifAt,
	image,
	label,
} from '../common.js';
import { MOTIF_IDS } from '../../engine/motifs.js';

export const SIDE_OPTIONS = [
	{ value: 'front', label: 'Fronts' },
	{ value: 'back', label: 'Backs' },
];

export const ITEM = {
	id: 'memory',
	label: 'Memory',
	hint: 'Pairs to turn over: from photos out of the Media Library or from the motifs; the backs print as their own sheet.',
	group: 'games',
	uses: { text: false, names: false, photo: 'many', event: [ 'title' ] },
	sizes: [
		{ label: '50 mm (12 per A4)', d: 50 },
		{ label: '60 mm (8 per A4)', d: 60 },
		{ label: '40 mm (20 per A4)', d: 40 },
	],
	repeat: ( item ) => 'back' === item.side,
	photoBox( item ) {
		const d = item.d || 50;
		return { w: d, h: d };
	},
	render( item, ctx ) {
		const theme = ctx.theme;
		const d = item.d || 50;
		const pairs = Math.max( 2, Math.min( 40, item.pairs || 12 ) );
		const shape = SHAPES.rect( d, d, { rx: d * 0.08 } );
		if ( 'back' === item.side ) {
			const parts = [ bg( shape, theme.colors.primary ) ];
			if ( false !== item.pattern ) {
				parts.push(
					patternIn( shape, theme, {
						seed: 270,
						opacity: 0.3,
						scale: 0.4,
					} )
				);
			}
			if ( theme.motif ) {
				parts.push(
					motifAt( theme.motif, d * 0.3, d * 0.3, d * 0.4, theme, {
						on: theme.colors.primary,
					} )
				);
			}
			parts.push( outline( shape, theme.colors.ink, 0.25 ) );
			return {
				pieces: [ { inner: parts.join( '' ), w: d, h: d } ],
				warnings: [],
			};
		}
		const photos = ( ctx.photos || [] ).filter( Boolean );
		const faces = photos.length
			? photos.slice( 0, pairs )
			: MOTIF_IDS.slice( 0, pairs );
		const pieces = [];
		faces.forEach( ( face, i ) => {
			for ( let k = 0; k < 2; k++ ) {
				const parts = [ bg( shape, theme.colors.bg ) ];
				if ( photos.length ) {
					parts.push(
						image( face, d * 0.06, d * 0.06, d * 0.88, d * 0.88 )
					);
				} else {
					parts.push(
						motifAt( face, d * 0.18, d * 0.14, d * 0.64, theme )
					);
					parts.push(
						label(
							String( i + 1 ),
							{
								x: d * 0.4,
								y: d * 0.82,
								w: d * 0.2,
								h: d * 0.12,
							},
							{
								font: theme.textFont,
								weight: 400,
								color: theme.colors.ink,
								maxSize: d * 0.08,
							},
							ctx.env
						)
					);
				}
				parts.push( outline( shape, theme.colors.ink, 0.25 ) );
				pieces.push( { inner: parts.join( '' ), w: d, h: d } );
			}
		} );
		return { pieces, warnings: [] };
	},
};
