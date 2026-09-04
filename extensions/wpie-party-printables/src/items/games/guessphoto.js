/** Guess the photo: numbered picture cards from the Media Library and answer cards with numbered lines. */
import {
	SHAPES,
	cardFrame,
	label,
	motifAt,
	outline,
	image,
	writeLine,
} from '../common.js';
import { textEl } from '../../engine/svg.js';
import { MOTIF_IDS } from '../../engine/motifs.js';

export const ITEM = {
	id: 'guessphoto',
	label: 'Guess the photo',
	hint: 'Who is the baby? Numbered picture cards from the Media Library and an answer card per guest with numbered lines.',
	group: 'games',
	uses: {
		text: true,
		names: 'optional',
		photo: 'many',
		event: [ 'title', 'names' ],
	},
	textLabel: 'The question on the cards',
	placeholder: 'Who is this?',
	sizes: [
		{ label: 'Poker (63 x 88 mm, 6 per A4)', w: 63, h: 88 },
		{ label: 'Large (90 x 120 mm, 4 per A4)', w: 90, h: 120 },
	],
	repeat: false,
	photoBox( item ) {
		const w = item.w || 63;
		return { w: w * 0.84, h: w * 0.84 };
	},
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const t = ctx.t;
		const w = item.w || 63;
		const h = item.h || 88;
		const ink = theme.colors.ink;
		const photos = ( ctx.photos || [] ).filter( Boolean );
		const warnings = [];
		const count = photos.length || 6;
		const question = item.text || t( 'Who is this?' );
		const pieces = [];
		for ( let i = 0; i < count; i++ ) {
			const shape = SHAPES.rect( w, h, { rx: w * 0.06 } );
			const parts = [
				cardFrame( shape, theme, {
					band: 'top',
					bandSize: h * 0.11,
					seed: 340 + i,
				} ),
			];
			parts.push(
				label(
					question,
					{ x: w * 0.06, y: h * 0.015, w: w * 0.88, h: h * 0.08 },
					{
						font: theme.displayFont,
						weight: 700,
						color: theme.colors.bg,
						maxSize: h * 0.06,
						wrap: false,
					},
					env
				)
			);
			const px = w * 0.08;
			const py = h * 0.15;
			const pw = w * 0.84;
			if ( photos[ i ] ) {
				parts.push( image( photos[ i ], px, py, pw, pw ) );
			} else {
				parts.push(
					`<rect x="${ px.toFixed( 2 ) }" y="${ py.toFixed(
						2
					) }" width="${ pw.toFixed( 2 ) }" height="${ pw.toFixed(
						2
					) }" fill="${
						theme.colors.secondary
					}" fill-opacity="0.35"/>`
				);
				parts.push(
					motifAt(
						MOTIF_IDS[ i % MOTIF_IDS.length ],
						px + pw * 0.25,
						py + pw * 0.25,
						pw * 0.5,
						theme
					)
				);
			}
			parts.push(
				`<circle cx="${ ( w / 2 ).toFixed( 2 ) }" cy="${ (
					py +
					pw +
					h * 0.1
				).toFixed( 2 ) }" r="${ ( h * 0.07 ).toFixed( 2 ) }" fill="${
					theme.colors.accent
				}"/>`
			);
			parts.push(
				textEl( w / 2, py + pw + h * 0.1 + h * 0.025, String( i + 1 ), {
					size: ( h * 0.075 ).toFixed( 2 ),
					font: theme.displayFont,
					weight: 700,
					fill: theme.colors.bg,
					anchor: 'middle',
				} )
			);
			parts.push( outline( shape, ink, 0.25 ) );
			pieces.push( { inner: parts.join( '' ), w, h } );
		}
		// Answer cards: one per guest, or eight.
		const guests =
			ctx.event.names && ctx.event.names.length
				? ctx.event.names
				: [ ...Array( 8 ) ].map( () => '' );
		for ( const [ gi, guest ] of guests.entries() ) {
			const shape = SHAPES.rect( w, h, { rx: w * 0.06 } );
			const parts = [
				cardFrame( shape, theme, {
					band: 'left',
					bandSize: w * 0.05,
					seed: 350 + gi,
				} ),
			];
			parts.push(
				label(
					t( 'Answer card' ),
					{ x: w * 0.1, y: h * 0.03, w: w * 0.84, h: h * 0.07 },
					{
						font: theme.displayFont,
						weight: 700,
						color: ink,
						maxSize: h * 0.05,
						wrap: false,
					},
					env
				)
			);
			const fs = h * 0.03;
			parts.push(
				textEl(
					w * 0.1,
					h * 0.16,
					t( 'Name' ) + ( guest ? ': ' + guest : '' ),
					{ size: fs.toFixed( 2 ), font: theme.textFont, fill: ink }
				)
			);
			if ( ! guest ) {
				parts.push( writeLine( w * 0.28, h * 0.16, w * 0.62, ink ) );
			}
			const rows = Math.min( count, 14 );
			const rowH = ( h * 0.76 ) / rows;
			for ( let k = 0; k < rows; k++ ) {
				const y = h * 0.22 + ( k + 0.8 ) * rowH;
				parts.push(
					textEl( w * 0.1, y, String( k + 1 ) + '.', {
						size: fs.toFixed( 2 ),
						font: theme.textFont,
						weight: 700,
						fill: theme.colors.accent,
					} )
				);
				parts.push( writeLine( w * 0.22, y, w * 0.68, ink ) );
			}
			parts.push( outline( shape, ink, 0.25 ) );
			pieces.push( { inner: parts.join( '' ), w, h } );
		}
		return { pieces, warnings };
	},
};
