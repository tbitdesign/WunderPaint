/** Seating chart: a board with one box per table, the guests listed under the table name. */
import {
	SHAPES,
	cardFrame,
	label,
	motifAt,
	outline,
	patternIn,
} from '../common.js';
import { blocksOf } from './listcard.js';
import { textEl } from '../../engine/svg.js';
import { fitLine } from '../../engine/text.js';

export function tablesOf( text ) {
	const out = [];
	for ( const block of blocksOf( text ) ) {
		const colon = block.map( ( l ) => l.match( /^([^:]+):\s*(.*)$/ ) );
		if ( colon.every( Boolean ) ) {
			// "Table 1: Anna, Ben" per line, one table each.
			for ( const m of colon ) {
				out.push( {
					name: m[ 1 ].trim(),
					guests: m[ 2 ]
						.split( /\s*[,;]\s*/ )
						.map( ( s ) => s.trim() )
						.filter( Boolean ),
				} );
			}
		} else if ( colon[ 0 ] ) {
			out.push( {
				name: colon[ 0 ][ 1 ].trim(),
				guests: [
					...colon[ 0 ][ 2 ].split( /\s*[,;]\s*/ ),
					...block.slice( 1 ),
				]
					.map( ( s ) => s.trim() )
					.filter( Boolean ),
			} );
		} else {
			out.push( { name: block[ 0 ], guests: block.slice( 1 ) } );
		}
	}
	return out;
}

export const ITEM = {
	id: 'seating',
	label: 'Seating chart',
	hint: 'A board with a box per table: "Table 1: Anna, Ben" per block, or the table name on the first line and the guests under it.',
	group: 'cards',
	uses: { text: 'lines', names: false, photo: 'none', event: [ 'title' ] },
	textLabel: 'One table per block',
	placeholder:
		'Table 1: Anna, Ben, Clara, David\nTable 2: Emma, Felix, Greta, Henry\nTable 3: Ida, Jonas, Klara, Lukas',
	sizes: [
		{ label: 'A4 (210 x 297 mm)', w: 194, h: 281 },
		{ label: 'A3 (297 x 420 mm)', w: 281, h: 404 },
		{ label: 'A4 landscape', w: 281, h: 194 },
	],
	repeat: false,
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const t = ctx.t;
		const w = item.w || 194;
		const h = item.h || 281;
		const shape = SHAPES.rect( w, h );
		const parts = [
			cardFrame( shape, theme, {
				band: 'top',
				bandSize: h * 0.04,
				seed: 12,
			} ),
		];
		let y = h * 0.07;
		if ( false !== item.motif && theme.motif ) {
			const size = h * 0.07;
			parts.push(
				motifAt( theme.motif, w / 2 - size / 2, y, size, theme )
			);
			y += size + h * 0.01;
		}
		parts.push(
			label(
				item.title || t( 'Find your seat' ),
				{ x: w * 0.1, y, w: w * 0.8, h: h * 0.06 },
				{
					font: theme.displayFont,
					weight: 700,
					color: theme.colors.ink,
					maxSize: h * 0.05,
				},
				env
			)
		);
		y += h * 0.07;
		if ( ctx.event.title ) {
			parts.push(
				label(
					ctx.event.title,
					{ x: w * 0.1, y, w: w * 0.8, h: h * 0.03 },
					{
						font: theme.textFont,
						weight: 400,
						color: theme.colors.accent,
						maxSize: h * 0.02,
					},
					env
				)
			);
			y += h * 0.045;
		}
		const tables = tablesOf( item.text );
		const warnings = [];
		if ( ! tables.length ) {
			warnings.push(
				t( 'Add the tables, one block each: "Table 1: Anna, Ben".' )
			);
		}
		const cols = Math.max(
			1,
			Math.min( 4, item.cols || ( w > h ? 4 : 3 ) )
		);
		const gap = w * 0.03;
		const bw = ( w * 0.9 - gap * ( cols - 1 ) ) / cols;
		const rows = Math.ceil( tables.length / cols );
		const avail = h * 0.95 - y;
		const maxGuests = Math.max(
			1,
			...tables.map( ( tb ) => tb.guests.length )
		);
		let nameSize = Math.min( h * 0.026, bw * 0.12 );
		let guestSize = Math.min( h * 0.02, bw * 0.095 );
		let bh = nameSize * 2.4 + maxGuests * guestSize * 1.5 + bw * 0.12;
		const perRow = ( avail - gap * ( rows - 1 ) ) / Math.max( 1, rows );
		if ( bh > perRow ) {
			// Too many guests for the page: the type shrinks until the rows fit.
			const k = Math.max( 0.5, perRow / bh );
			nameSize *= k;
			guestSize *= k;
			bh = perRow;
		}
		tables.forEach( ( tb, i ) => {
			const cx = w * 0.05 + ( i % cols ) * ( bw + gap );
			const cy = y + Math.floor( i / cols ) * ( bh + gap );
			if ( cy + bh > h * 0.96 ) {
				return;
			}
			const boxShape = SHAPES.rect( bw, bh, { rx: bw * 0.04 } );
			const g = [
				`<path d="${ boxShape.d }" fill="${ theme.colors.primary }" fill-opacity="0.1" stroke="${ theme.colors.accent }" stroke-width="0.35"/>`,
			];
			g.push(
				`<path d="${ SHAPES.rect( bw, nameSize * 2 ).d }" fill="${
					theme.colors.primary
				}"/>`
			);
			g.push(
				patternIn( SHAPES.rect( bw, nameSize * 2 ), theme, {
					seed: 30 + i,
					opacity: 0.25,
					scale: 0.4,
				} )
			);
			const ns = fitLine(
				tb.name,
				{
					w: bw * 0.9,
					h: nameSize * 1.3,
					font: theme.displayFont,
					weight: 700,
					maxSize: nameSize,
					minSize: 2,
				},
				env
			).size;
			g.push(
				textEl( bw / 2, nameSize * 1.35, tb.name, {
					size: ns.toFixed( 2 ),
					font: theme.displayFont,
					weight: 700,
					fill: theme.colors.bg,
					anchor: 'middle',
				} )
			);
			let gy = nameSize * 2 + guestSize * 1.6;
			for ( const guest of tb.guests ) {
				if ( gy > bh - guestSize * 0.4 ) {
					break;
				}
				const gs = fitLine(
					guest,
					{
						w: bw * 0.9,
						h: guestSize * 1.3,
						font: theme.textFont,
						weight: 400,
						maxSize: guestSize,
						minSize: 2,
					},
					env
				).size;
				g.push(
					textEl( bw / 2, gy, guest, {
						size: gs.toFixed( 2 ),
						font: theme.textFont,
						fill: theme.colors.ink,
						anchor: 'middle',
					} )
				);
				gy += guestSize * 1.5;
			}
			parts.push(
				`<g transform="translate(${ cx.toFixed( 2 ) } ${ cy.toFixed(
					2
				) })">${ g.join( '' ) }</g>`
			);
		} );
		if ( rows * ( bh + gap ) - gap > avail + 0.01 ) {
			warnings.push(
				t(
					'Not every table fits on this board; choose A3 or fewer tables.'
				)
			);
		}
		parts.push( outline( shape, theme.colors.ink, 0.25 ) );
		return { pieces: [ { inner: parts.join( '' ), w, h } ], warnings };
	},
};
