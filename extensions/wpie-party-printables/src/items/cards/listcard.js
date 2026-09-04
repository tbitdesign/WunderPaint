/**
 * The list cards: menu, drinks and program share one layout. A title at
 * the top, a small motif, blocks of lines from the text. Menu and drinks:
 * a blank line starts a new course, its first line is the course name.
 * Program: every line is "time  what happens".
 */
import {
	SHAPES,
	cardFrame,
	patternIn,
	motifAt,
	label,
	outline,
} from '../common.js';
import { textEl } from '../../engine/svg.js';
import { fitLine } from '../../engine/text.js';

export const LIST_SIZES = [
	{ label: 'A5 (148 x 210 mm)', w: 148, h: 210 },
	{ label: 'A6 (105 x 148 mm, 2 per A4 landscape)', w: 105, h: 148 },
	{ label: 'Tall (90 x 190 mm, 3 per A4 landscape)', w: 90, h: 190 },
];

export function blocksOf( text ) {
	const blocks = [];
	let cur = [];
	for ( const raw of String( text || '' ).split( '\n' ) ) {
		const line = raw.trim();
		if ( ! line ) {
			if ( cur.length ) {
				blocks.push( cur );
			}
			cur = [];
		} else {
			cur.push( line );
		}
	}
	if ( cur.length ) {
		blocks.push( cur );
	}
	return blocks;
}

export function renderList( item, ctx, env, o ) {
	const theme = ctx.theme;
	const t = ctx.t;
	const w = item.w || 148;
	const h = item.h || 210;
	const shape = SHAPES.rect( w, h );
	const parts = [
		cardFrame( shape, theme, { band: 'top', bandSize: h * 0.05, seed: 7 } ),
	];
	if ( false !== item.pattern ) {
		parts.push(
			`<g transform="translate(0 ${ ( h * 0.95 ).toFixed(
				2
			) })"><path d="${ SHAPES.rect( w, h * 0.05 ).d }" fill="${
				theme.colors.primary
			}"/>${ patternIn( SHAPES.rect( w, h * 0.05 ), theme, {
				seed: 8,
				opacity: 0.3,
				scale: 0.6,
			} ) }</g>`
		);
	}
	let y = h * 0.08;
	if ( false !== item.motif && theme.motif ) {
		const size = w * 0.16;
		parts.push( motifAt( theme.motif, w / 2 - size / 2, y, size, theme ) );
		y += size + h * 0.015;
	}
	const title = item.title || t( o.title );
	parts.push(
		label(
			title,
			{ x: w * 0.1, y, w: w * 0.8, h: h * 0.08 },
			{
				font: theme.displayFont,
				weight: 700,
				color: theme.colors.ink,
				maxSize: h * 0.06,
			},
			env
		)
	);
	y += h * 0.08;
	if ( ctx.event.title ) {
		parts.push(
			textEl( w / 2, y + h * 0.02, ctx.event.title, {
				size: ( h * 0.024 ).toFixed( 2 ),
				font: theme.textFont,
				fill: theme.colors.accent,
				anchor: 'middle',
			} )
		);
		y += h * 0.04;
	}
	y += h * 0.02;
	const warnings = [];
	const lh = 1.45;
	const bottom = h * 0.93;
	const blocks = blocksOf( item.text );
	// Base sizes, then scaled so the list fills the card (never below 70 %, never above 190 %).
	let headSize = h * 0.022;
	let lineSize = h * 0.019;
	const needed =
		'program' === o.mode
			? blocks.flat().length * lineSize * lh
			: blocks.reduce(
					( sum, block ) =>
						sum +
						( block.length > 1
							? headSize * lh +
							  ( block.length - 1 ) * lineSize * lh
							: lineSize * lh ) +
						lineSize * 0.8,
					0
			  );
	const scale = Math.max(
		0.7,
		Math.min( 1.9, ( ( bottom - y ) / Math.max( 1, needed ) ) * 0.85 )
	);
	headSize *= scale;
	lineSize *= scale;
	const fit = ( s, size, font, weight ) =>
		fitLine(
			s,
			{
				w: w * 0.84,
				h: size * lh,
				font,
				weight,
				maxSize: size,
				minSize: 2,
			},
			env
		).size;
	let overflow = false;
	if ( 'program' === o.mode ) {
		const lines = blocks.flat();
		for ( const line of lines ) {
			if ( y + lineSize * lh > bottom ) {
				overflow = true;
				break;
			}
			const m = line.match(
				/^(\d{1,2}[:.]\d{2}\s*(?:[ap]m)?|\d{1,2}\s*[ap]m)\s+(.*)$/i
			);
			const time = m ? m[ 1 ] : '';
			const what = m ? m[ 2 ] : line;
			if ( time ) {
				parts.push(
					textEl( w * 0.36, y + lineSize, time, {
						size: lineSize.toFixed( 2 ),
						font: theme.textFont,
						fill: theme.colors.accent,
						weight: 700,
						anchor: 'end',
					} )
				);
			}
			const size = fitLine(
				what,
				{
					w: w * 0.5,
					h: lineSize * lh,
					font: theme.textFont,
					weight: 400,
					maxSize: lineSize,
					minSize: 2,
				},
				env
			).size;
			parts.push(
				textEl( time ? w * 0.4 : w / 2, y + lineSize, what, {
					size: size.toFixed( 2 ),
					font: theme.textFont,
					fill: theme.colors.ink,
					anchor: time ? 'start' : 'middle',
				} )
			);
			y += lineSize * lh;
		}
	} else {
		for ( const block of blocks ) {
			const [ head, ...rest ] =
				block.length > 1 ? block : [ '', ...block ];
			if ( head ) {
				if ( y + headSize * lh > bottom ) {
					overflow = true;
					break;
				}
				const size = fit(
					head.toUpperCase(),
					headSize,
					theme.textFont,
					700
				);
				parts.push(
					textEl( w / 2, y + headSize, head.toUpperCase(), {
						size: size.toFixed( 2 ),
						font: theme.textFont,
						fill: theme.colors.accent,
						weight: 700,
						anchor: 'middle',
					} )
				);
				y += headSize * lh;
			}
			for ( const line of rest ) {
				if ( y + lineSize * lh > bottom ) {
					overflow = true;
					break;
				}
				const size = fit( line, lineSize, theme.textFont, 400 );
				parts.push(
					textEl( w / 2, y + lineSize, line, {
						size: size.toFixed( 2 ),
						font: theme.textFont,
						fill: theme.colors.ink,
						anchor: 'middle',
					} )
				);
				y += lineSize * lh;
			}
			y += lineSize * 0.8;
		}
	}
	if ( overflow ) {
		warnings.push(
			t( 'Too many lines for this card size; the rest was left off.' )
		);
	}
	parts.push( outline( shape, theme.colors.ink, 0.25 ) );
	return { pieces: [ { inner: parts.join( '' ), w, h } ], warnings };
}
