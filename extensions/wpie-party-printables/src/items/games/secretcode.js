/** Secret code: a key card (letter to symbol) and message cards written in the symbols. */
import { SHAPES, cardFrame, label, motifAt, outline } from '../common.js';
import { textEl } from '../../engine/svg.js';
import { MOTIF_IDS } from '../../engine/motifs.js';
import { seeded } from '../../engine/rng.js';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function codeKey( seed ) {
	const rnd = seeded( seed || 1 );
	const pool = MOTIF_IDS.slice();
	for ( let i = pool.length - 1; i > 0; i-- ) {
		const j = Math.floor( rnd() * ( i + 1 ) );
		[ pool[ i ], pool[ j ] ] = [ pool[ j ], pool[ i ] ];
	}
	const key = {};
	LETTERS.split( '' ).forEach(
		( ch, i ) => ( key[ ch ] = pool[ i % pool.length ] )
	);
	return key;
}

export const ITEM = {
	id: 'secretcode',
	label: 'Secret code',
	hint: 'A key card that turns letters into symbols and message cards written in that code, for treasure hunts and party invitations with a twist.',
	group: 'games',
	uses: { text: 'lines', names: false, photo: 'none', event: [ 'title' ] },
	textLabel: 'One secret message per line',
	placeholder: 'The treasure is under the big tree\nLook behind the red door',
	sizes: [
		{ label: 'A6 landscape (148 x 105 mm)', w: 148, h: 105 },
		{ label: 'A5 landscape (210 x 148 mm)', w: 194, h: 137 },
	],
	repeat: false,
	render( item, ctx, env ) {
		const theme = ctx.theme;
		const t = ctx.t;
		const w = item.w || 148;
		const h = item.h || 105;
		const ink = theme.colors.ink;
		const key = codeKey( item.seed || 1 );
		const messages = String( item.text || '' )
			.split( '\n' )
			.map( ( s ) => s.trim() )
			.filter( Boolean );
		const pieces = [];
		// The key card.
		{
			const shape = SHAPES.rect( w, h );
			const parts = [
				cardFrame( shape, theme, {
					band: 'top',
					bandSize: h * 0.13,
					seed: 320,
				} ),
			];
			parts.push(
				label(
					t( 'Secret code' ),
					{ x: w * 0.06, y: h * 0.02, w: w * 0.88, h: h * 0.09 },
					{
						font: theme.displayFont,
						weight: 700,
						color: theme.colors.bg,
						maxSize: h * 0.075,
						wrap: false,
					},
					env
				)
			);
			const cols = 7;
			const rows = 4;
			const cw = ( w * 0.9 ) / cols;
			const ch = ( h * 0.78 ) / rows;
			LETTERS.split( '' ).forEach( ( ch2, i ) => {
				const cx = w * 0.05 + ( i % cols ) * cw;
				const cy = h * 0.17 + Math.floor( i / cols ) * ch;
				parts.push(
					textEl( cx + cw * 0.18, cy + ch * 0.62, ch2, {
						size: ( ch * 0.42 ).toFixed( 2 ),
						font: theme.textFont,
						weight: 700,
						fill: ink,
						anchor: 'middle',
					} )
				);
				parts.push(
					textEl( cx + cw * 0.36, cy + ch * 0.6, '=', {
						size: ( ch * 0.3 ).toFixed( 2 ),
						font: theme.textFont,
						fill: theme.colors.accent,
						anchor: 'middle',
					} )
				);
				parts.push(
					motifAt(
						key[ ch2 ],
						cx + cw * 0.48,
						cy + ch * 0.18,
						Math.min( cw * 0.46, ch * 0.66 ),
						theme
					)
				);
			} );
			parts.push( outline( shape, ink, 0.25 ) );
			pieces.push( { inner: parts.join( '' ), w, h } );
		}
		// The message cards.
		for ( const [ mi, msg ] of ( messages.length
			? messages
			: [ t( 'Find the treasure' ) ]
		).entries() ) {
			const shape = SHAPES.rect( w, h );
			const parts = [
				cardFrame( shape, theme, {
					band: 'left',
					bandSize: w * 0.05,
					seed: 321 + mi,
				} ),
			];
			parts.push(
				label(
					( ctx.event.title ? ctx.event.title + ' · ' : '' ) +
						t( 'Message' ) +
						' ' +
						( mi + 1 ),
					{ x: w * 0.1, y: h * 0.05, w: w * 0.8, h: h * 0.09 },
					{
						font: theme.displayFont,
						weight: 700,
						color: ink,
						maxSize: h * 0.07,
						wrap: false,
					},
					env
				)
			);
			const sym = h * 0.11;
			const gap = sym * 0.15;
			const perRow = Math.floor( ( w * 0.84 ) / ( sym + gap ) );
			const words = msg.toUpperCase().split( /\s+/ );
			const rowsOut = [];
			let row = [];
			for ( const word of words ) {
				if ( row.length && row.length + word.length + 1 > perRow ) {
					rowsOut.push( row );
					row = [];
				}
				if ( row.length ) {
					row.push( ' ' );
				}
				row.push( ...word.split( '' ) );
			}
			if ( row.length ) {
				rowsOut.push( row );
			}
			rowsOut.forEach( ( cells, ri ) => {
				const y = h * 0.18 + ri * ( sym + gap * 4 );
				if ( y + sym > h * 0.96 ) {
					return;
				}
				cells.forEach( ( ch2, ci ) => {
					const x = w * 0.08 + ci * ( sym + gap );
					if ( ' ' === ch2 ) {
						return;
					}
					if ( key[ ch2 ] ) {
						parts.push( motifAt( key[ ch2 ], x, y, sym, theme ) );
					} else {
						parts.push(
							textEl( x + sym / 2, y + sym * 0.78, ch2, {
								size: ( sym * 0.7 ).toFixed( 2 ),
								font: theme.textFont,
								weight: 700,
								fill: ink,
								anchor: 'middle',
							} )
						);
					}
					parts.push(
						`<line x1="${ x.toFixed( 2 ) }" y1="${ (
							y +
							sym +
							gap * 1.6
						).toFixed( 2 ) }" x2="${ ( x + sym ).toFixed(
							2
						) }" y2="${ ( y + sym + gap * 1.6 ).toFixed(
							2
						) }" stroke="${ ink }" stroke-width="0.25" stroke-opacity="0.6"/>`
					);
				} );
			} );
			parts.push( outline( shape, ink, 0.25 ) );
			pieces.push( { inner: parts.join( '' ), w, h } );
		}
		return { pieces, warnings: [] };
	},
};
