/**
 * Quartet: cards in groups of four with a picture, a name and values.
 * One card per line: "Group | Name | Speed 120 | Weight 3 t | Age 5".
 */
import {
	SHAPES,
	cardFrame,
	label,
	motifAt,
	outline,
	image,
} from '../common.js';
import { textEl } from '../../engine/svg.js';
import { fitLine } from '../../engine/text.js';
import { MOTIF_IDS } from '../../engine/motifs.js';

export function quartetCards( text ) {
	const lines = String( text || '' )
		.split( '\n' )
		.map( ( s ) => s.trim() )
		.filter( Boolean );
	const groups = new Map();
	const cards = [];
	for ( const line of lines ) {
		const cols = line.split( '|' ).map( ( s ) => s.trim() );
		if ( cols.length < 2 ) {
			continue;
		}
		const [ group, name, ...values ] = cols;
		const n = ( groups.get( group ) || 0 ) + 1;
		groups.set( group, n );
		cards.push( { group, index: n, name, values } );
	}
	return cards;
}

export const ITEM = {
	id: 'quartet',
	label: 'Quartet',
	hint: 'A quartet deck: one card per line as "Group | Name | value | value", pictures from the Media Library or the motifs.',
	group: 'games',
	uses: { text: 'lines', names: false, photo: 'many', event: [ 'title' ] },
	textLabel: 'One card per line: Group | Name | value | value',
	placeholder:
		'A | Grandpa | Age 74 | Height 1.80 m | Jokes 100\nA | Grandma | Age 71 | Height 1.65 m | Jokes 40\nA | Dad | Age 45 | Height 1.85 m | Jokes 12\nA | Mom | Age 43 | Height 1.70 m | Jokes 80\nB | Mia | Age 6 | Height 1.15 m | Jokes 300\nB | Leo | Age 9 | Height 1.35 m | Jokes 250',
	sizes: [
		{ label: 'Poker (63 x 88 mm, 6 per A4)', w: 63, h: 88 },
		{ label: 'Large (90 x 120 mm, 4 per A4)', w: 90, h: 120 },
	],
	repeat: false,
	photoBox( item ) {
		const w = item.w || 63;
		return { w: w * 0.84, h: w * 0.7 };
	},
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const t = ctx.t;
		const w = item.w || 63;
		const h = item.h || 88;
		const cards = quartetCards( item.text );
		if ( ! cards.length ) {
			return {
				pieces: [],
				warnings: [
					t( 'Add one card per line: Group | Name | value | value.' ),
				],
			};
		}
		const photos = ( ctx.photos || [] ).filter( Boolean );
		const pieces = cards.map( ( c, i ) => {
			const shape = SHAPES.rect( w, h, { rx: w * 0.06 } );
			const parts = [
				cardFrame( shape, theme, {
					band: 'top',
					bandSize: h * 0.1,
					seed: 280 + i,
				} ),
			];
			parts.push(
				textEl( w * 0.08, h * 0.072, c.group + c.index, {
					size: ( h * 0.055 ).toFixed( 2 ),
					font: theme.displayFont,
					weight: 700,
					fill: theme.colors.bg,
				} )
			);
			const px = w * 0.08;
			const py = h * 0.13;
			const pw = w * 0.84;
			const ph = w * 0.7;
			if ( photos[ i ] ) {
				parts.push( image( photos[ i ], px, py, pw, ph ) );
			} else {
				parts.push(
					`<rect x="${ px.toFixed( 2 ) }" y="${ py.toFixed(
						2
					) }" width="${ pw.toFixed( 2 ) }" height="${ ph.toFixed(
						2
					) }" fill="${
						theme.colors.secondary
					}" fill-opacity="0.35"/>`
				);
				parts.push(
					motifAt(
						MOTIF_IDS[ i % MOTIF_IDS.length ],
						px + pw * 0.25,
						py + ph * 0.15,
						pw * 0.5,
						theme
					)
				);
			}
			parts.push(
				label(
					c.name,
					{
						x: w * 0.08,
						y: py + ph + h * 0.02,
						w: w * 0.84,
						h: h * 0.1,
					},
					{
						font: theme.displayFont,
						weight: 700,
						color: theme.colors.ink,
						maxSize: h * 0.07,
					},
					env
				)
			);
			let y = py + ph + h * 0.16;
			const fs = Math.min( h * 0.036, w * 0.06 );
			for ( const v of c.values.slice( 0, 6 ) ) {
				if ( y > h * 0.95 ) {
					break;
				}
				const m = v.match( /^(.*?)\s+([\d.,]+\s*\S*)$/ );
				if ( m ) {
					const size = fitLine(
						m[ 1 ],
						{
							w: w * 0.5,
							h: fs * 1.3,
							font: theme.textFont,
							weight: 400,
							maxSize: fs,
							minSize: 2,
						},
						env
					).size;
					parts.push(
						textEl( w * 0.08, y, m[ 1 ], {
							size: size.toFixed( 2 ),
							font: theme.textFont,
							fill: theme.colors.ink,
						} )
					);
					parts.push(
						textEl( w * 0.92, y, m[ 2 ], {
							size: fs.toFixed( 2 ),
							font: theme.textFont,
							weight: 700,
							fill: theme.colors.ink,
							anchor: 'end',
						} )
					);
				} else {
					const size = fitLine(
						v,
						{
							w: w * 0.84,
							h: fs * 1.3,
							font: theme.textFont,
							weight: 400,
							maxSize: fs,
							minSize: 2,
						},
						env
					).size;
					parts.push(
						textEl( w * 0.08, y, v, {
							size: size.toFixed( 2 ),
							font: theme.textFont,
							fill: theme.colors.ink,
						} )
					);
				}
				parts.push(
					`<line x1="${ ( w * 0.08 ).toFixed( 2 ) }" y1="${ (
						y +
						fs * 0.4
					).toFixed( 2 ) }" x2="${ ( w * 0.92 ).toFixed(
						2
					) }" y2="${ ( y + fs * 0.4 ).toFixed( 2 ) }" stroke="${
						theme.colors.accent
					}" stroke-width="0.2"/>`
				);
				y += fs * 1.6;
			}
			parts.push( outline( shape, theme.colors.ink, 0.25 ) );
			return { inner: parts.join( '' ), w, h };
		} );
		return { pieces, warnings: [] };
	},
};
