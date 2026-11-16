/**
 * The generated route: the blank sheet goes to an image model together with
 * a description of a handwriting or a photo of a handwritten note, and the
 * sheet comes back filled in. From there it is the paper route again - the
 * same corner squares, the same boxes, the same reader - only that the page
 * geometry is known, because we drew the page we sent.
 *
 * Pure: prompt, labels and the reader work on plain `{ width, height, data }`
 * images, so node tests the whole path on synthetic sheets.
 */

import {
	sheetLayout,
	findRegistrationMarks,
	homography,
	applyH,
	extractCell,
	redChannel,
	removeRules,
	despeckle,
	cellToContours,
	SHEET,
} from './sheet.js';
import { ALL_KEYS, isMark } from './charset.js';
import { contourBounds } from './outline.js';

/**
 * What an accent box shows the model: the accent itself. The paper sheet
 * prints its name ("Acute"), which a person reads and a model may write
 * out as a word.
 */
export const AI_MARK_GLYPHS = {
	'mark:acute': '´',
	'mark:grave': '`',
	'mark:circumflex': 'ˆ',
	'mark:tilde': '˜',
	'mark:diaeresis': '¨',
	'mark:cedilla': '¸',
};

/**
 * The printed label of a box on a generated sheet.
 *
 * @param {string} key Glyph key.
 * @return {string} Label.
 */
export function aiLabel( key ) {
	return isMark( key ) ? AI_MARK_GLYPHS[ key ] || key : key;
}

/**
 * How a generated sheet is laid out: more room between the rows than on
 * paper. Models write past the box edges - on the measured 4K sheets
 * descender loops up to 4 mm below a box and ascenders up to 2.2 mm above
 * it, right up to the label - and the reader follows a letter into that
 * space. Eight rows then fill each page exactly (2 x 56 = the whole
 * charset), which leaves no empty page area to invent rows in.
 */
export const AI_LAYOUT = { labelSpace: 10.5 };

/**
 * How a generated sheet is drawn: the labels are what the model reads, so
 * they are larger and centred over their box. They are pink like the boxes
 * - a full red channel, which the reader does not see - so a letter that
 * runs into a label is still read clean, and the rows are told apart by
 * the pink alone.
 */
export const AI_DRAW = {
	labelFor: aiLabel,
	labelColor: '#f0386b',
	labelSize: 4.4,
	labelAlign: 'center',
	labelGap: 1.5,
	// A clear box edge the model can see; red 255, so the reader cannot.
	boxColor: '#ff6f84',
	boxWidth: 0.6,
};

/**
 * How far past its box a letter is read, in millimetres. The space between
 * two rows is shared - the upper row's descenders, the lower row's
 * ascenders - so the two windows split it without overlapping, the larger
 * part for the descenders; what reaches in from the other row does not
 * touch this box and is dropped (`keepLetter`).
 */
export const AI_READ = {
	above: 4,
	below: AI_LAYOUT.labelSpace - 4.3,
	// Sideways into the gap to the next box, up to its middle.
	side: SHEET.gap / 2 - 0.05,
};

/**
 * The heights a generated sheet is drawn and read with. Image models write
 * descenders the way handwriting does, about as long as an x is tall, and
 * the paper sheet's room below the baseline cut every g, j, f and y off at
 * the box edge (measured on the first 4K sheets). A deeper box fixes that
 * for any model; drawing and reading share the numbers, so the letters
 * still land on the font's own baseline. The font writer takes its Windows
 * limits from the real glyph bounds, so nothing gets clipped.
 *
 * @param {Object} metrics The project's metrics.
 * @return {Object} Metrics for the generated sheet.
 */
export function aiMetrics( metrics ) {
	return {
		...metrics,
		descender: Math.min( metrics.descender, -400 ),
	};
}

/**
 * The labels of a page, row by row from the top, left to right - spelled
 * out in the prompt, so the model does not have to read them off the page.
 *
 * @param {Object} page One page from `sheetLayout`.
 * @return {Array<Array<string>>} Rows of labels.
 */
export function aiRows( page ) {
	const rows = new Map();
	for ( const cell of page.cells ) {
		const y = Math.round( cell.y * 10 );
		if ( ! rows.has( y ) ) {
			rows.set( y, [] );
		}
		rows.get( y ).push( cell );
	}
	return [ ...rows.keys() ]
		.sort( ( a, b ) => a - b )
		.map( ( y ) =>
			rows
				.get( y )
				.sort( ( a, b ) => a.x - b.x )
				.map( ( cell ) => aiLabel( cell.key ) )
		);
}

/**
 * The pages of a generated sheet: every character, or only the missing ones.
 *
 * @param {Object}  glyphs      The project's drawn glyphs by key.
 * @param {boolean} onlyMissing Leave out what is already there.
 * @return {Array} Pages as `sheetLayout` makes them (empty pages dropped).
 */
export function aiPages( glyphs = {}, onlyMissing = false ) {
	const keys = onlyMissing
		? ALL_KEYS.filter( ( k ) => ! glyphs[ k ] )
		: ALL_KEYS.slice();
	return sheetLayout( keys, AI_LAYOUT ).filter( ( p ) => p.cells.length );
}

/**
 * Pixel size of a page at a resolution, both edges divisible by sixteen
 * (what the image models ask for).
 *
 * @param {number} dpi Resolution.
 * @return {{w:number,h:number}} Size.
 */
export function aiPageSize( dpi = 300 ) {
	const snap = ( v ) => Math.max( 16, Math.round( v / 16 ) * 16 );
	return {
		w: snap( ( SHEET.pageW * dpi ) / 25.4 ),
		h: snap( ( SHEET.pageH * dpi ) / 25.4 ),
	};
}

/**
 * The instruction that goes with one page.
 *
 * @param {Object}  o             Options.
 * @param {string}  o.source      'describe' | 'note'.
 * @param {string}  o.description What the handwriting looks like (describe),
 *                                or extra wishes (note), may be empty.
 * @param {number}  o.page        Page number, from 1.
 * @param {number}  o.pages       Number of pages.
 * @param {boolean} o.continued   A reference image is the filled page 1.
 * @param {Array}   o.rows        The page's labels row by row (aiRows).
 * @return {string} Prompt.
 */
export function aiPrompt( {
	source,
	description = '',
	page = 1,
	pages = 1,
	continued = false,
	rows = [],
} ) {
	const wish = String( description || '' ).trim();
	let style;
	if ( continued ) {
		style =
			'exactly the handwriting of the reference image, which is page 1 of this same sheet already filled in: the same letter shapes, slant, size, spacing, stroke weight and pen, so that both pages belong to one font';
	} else if ( 'note' === source ) {
		style =
			'the handwriting of the reference image, a handwritten note: copy its letter shapes, slant, proportions, stroke weight and pen as closely as possible, and for every character that does not appear in the note invent a form that the same person would write';
	} else {
		style = wish
			? 'this handwriting: ' + wish
			: 'a natural, legible everyday handwriting';
	}
	const extra =
		wish && ( continued || 'note' === source )
			? '\nAlso follow this wish for the handwriting: ' + wish
			: '';
	return (
		'This image is page ' +
		page +
		' of ' +
		pages +
		' of an empty handwriting font sheet: a printed page with ' +
		( rows.length
			? rows.length + ( 1 === rows.length ? ' row' : ' rows' ) + ' of boxes'
			: 'a grid of boxes' ) +
		'. The pink character printed above each box names the one character that belongs in that box.\n\n' +
		'Fill in the sheet. In every box write exactly the character printed above it, once, by hand, in ' +
		style +
		'.' +
		extra +
		( rows.length
			? '\n\nThe boxes, row by row from the top, each row from left to right (write exactly these, in this order, one per box; do not continue any alphabet on your own):\n' +
			  rows
					.map(
						( r, i ) =>
							'Row ' + ( i + 1 ) + ': ' + r.join( '   ' )
					)
					.join( '\n' ) +
				'\nThat is all of them: exactly ' +
				rows.length +
				( 1 === rows.length ? ' row' : ' rows' ) +
				'. The paper below the last row stays empty; do not add, repeat or move any row.'
			: '' ) +
		'\n\nRules:\n' +
		'- One character per box: always the one printed above it, never another, never more than one.\n' +
		'- Each box has three pink guide lines: the upper thin line is the cap line, the middle thin line the x-height line, the thick lower line the baseline. The top and bottom edges of the box are hard limits.\n' +
		'- Centre each character horizontally and never write larger than the guide lines say. Capitals and digits stand on the baseline and reach the cap line. Lowercase letters stand on the baseline and reach the x-height line; b, d, f, h, k, l and t rise to about the cap line. g, j, p, q and y (and f, if its stem goes down) hang below the baseline, and their descenders end above the bottom edge of the box.\n' +
		'- Every stroke stays completely inside its own box: nothing touches or crosses an edge, nothing reaches into a label or a neighbouring box.\n' +
		'- A box labelled with a lone accent (´ ` ˆ ˜ ¨ ¸) gets only that accent mark, nothing else.\n' +
		'- Dark ink, black or dark blue, never red or pink, on the white paper. The same pen and the same consistent handwriting in every box, as if one person wrote the whole sheet in one sitting.\n' +
		'- Keep everything else exactly as it is: the page, the pink boxes and lines, the printed labels, the four black corner squares and the heading. Do not add, move, crop, rotate or recolour anything.'
	);
}

/* ------------------------- reading a filled page ------------------------- */

/** How far red has to stand above green and blue to count as box pink. */
const PINK = 40;

/** Label comparison: bin size and sampling step, in millimetres. */
const BIN = 0.5;
const STEP = 0.125;

/** Below this much ink (in bins) a label strip counts as blank. */
const BLANK = 0.3;

/** How far red stands above green and blue in a printed label. */
const LABEL_PINK = 50;

/**
 * Pinkness of the image at a sheet point: red over the mean of green and
 * blue. Box edges and guides are pink; paper, ink and labels are not.
 *
 * @param {Object} img `{ width, height, data }` RGBA.
 * @param {Array}  H   Sheet millimetres to image pixels.
 * @param {number} x   Sheet x in millimetres.
 * @param {number} y   Sheet y in millimetres.
 * @return {number} Pinkness, 0 for paper and ink.
 */
function pinkAt( img, H, x, y ) {
	const p = applyH( H, x, y );
	const px = Math.round( p.x );
	const py = Math.round( p.y );
	if ( px < 0 || py < 0 || px >= img.width || py >= img.height ) {
		return 0;
	}
	const o = ( py * img.width + px ) * 4;
	return img.data[ o ] - ( img.data[ o + 1 ] + img.data[ o + 2 ] ) / 2;
}

/**
 * The rows of boxes where the model actually drew them. A box row is
 * where the pink side edges of the boxes run; the label space between two
 * rows has none, and the guide lines cannot fake a row there, because
 * they only exist inside the boxes.
 *
 * Measured on the first generated sheets: a model keeps the columns where
 * they were, but may add a row (page 2 got a copy of one of its rows in
 * the empty space below the grid, which pushed the last row down).
 *
 * @param {Object} img  `{ width, height, data }` RGBA.
 * @param {Array}  H    Sheet millimetres to image pixels.
 * @param {Object} page The page that was sent.
 * @return {Array<{top:number,height:number}>} Box rows in sheet
 *                                             millimetres, top down.
 */
export function findBoxRows( img, H, page ) {
	const { grid, frame } = page;
	const lefts = [ ...new Set( page.cells.map( ( c ) => c.col ) ) ].map(
		( c ) => grid.left + c * grid.pitchX
	);
	const edgeAt = ( x, y ) => {
		for ( let dx = -1.2; dx <= 1.2; dx += 0.3 ) {
			if ( pinkAt( img, H, x + dx, y ) > PINK ) {
				return true;
			}
		}
		return false;
	};
	const half = AI_DRAW.boxWidth / 2;
	const rows = [];
	let start = -1;
	let last = -1;
	const close = () => {
		const height = last - start - half * 2;
		if (
			height > grid.cellH * 0.6 &&
			height < grid.cellH * 1.5
		) {
			rows.push( { top: start + half, height } );
		}
		start = -1;
	};
	for ( let y = frame.y; y <= frame.y + frame.h; y += 0.25 ) {
		const on = lefts.some(
			( x ) => edgeAt( x, y ) && edgeAt( x + grid.cellW, y )
		);
		if ( on ) {
			if ( start < 0 ) {
				start = y;
			}
			last = y;
		} else if ( start >= 0 && y - last > 1 ) {
			close();
		}
	}
	if ( start >= 0 ) {
		close();
	}
	return rows;
}

/**
 * The printed labels of one row as coarse maps of their pink, one per
 * column: what the reader compares to tell the rows of a page apart. The
 * handwriting is dark, so a letter reaching into a label does not blur it.
 *
 * @param {Object} img  `{ width, height, data }` RGBA.
 * @param {Array}  H    Sheet millimetres to image pixels.
 * @param {Object} page The page.
 * @param {number} top  Top of the row's boxes, in millimetres.
 * @return {Array<{w:number,h:number,data:Float32Array,ink:number}>} Maps
 *                                                                  by column.
 */
function labelMaps( img, H, page, top ) {
	const { grid } = page;
	const { width: w, height: h, data } = img;
	const y0 = top - AI_DRAW.labelGap - AI_DRAW.labelSize * 1.1;
	// Short of the box's own pink top edge.
	const y1 = top - 0.6;
	const bh = Math.max( 1, Math.round( ( y1 - y0 ) / BIN ) );
	const maps = [];
	for ( let c = 0; c < grid.cols; c++ ) {
		const x0 = grid.left + c * grid.pitchX - 0.75;
		const x1 = x0 + grid.cellW + 1.5;
		const bw = Math.max( 1, Math.round( ( x1 - x0 ) / BIN ) );
		const sum = new Float32Array( bw * bh );
		const n = new Float32Array( bw * bh );
		for ( let y = y0 + STEP / 2; y < y1; y += STEP ) {
			const by = Math.min( bh - 1, Math.floor( ( y - y0 ) / BIN ) );
			for ( let x = x0 + STEP / 2; x < x1; x += STEP ) {
				const bx = Math.min( bw - 1, Math.floor( ( x - x0 ) / BIN ) );
				const p = applyH( H, x, y );
				const px = Math.round( p.x );
				const py = Math.round( p.y );
				let pink = 0;
				if ( px >= 0 && py >= 0 && px < w && py < h ) {
					const o = ( py * w + px ) * 4;
					pink = data[ o ] - ( data[ o + 1 ] + data[ o + 2 ] ) / 2;
				}
				sum[ by * bw + bx ] += pink > LABEL_PINK ? 1 : 0;
				n[ by * bw + bx ]++;
			}
		}
		let ink = 0;
		for ( let i = 0; i < sum.length; i++ ) {
			sum[ i ] = n[ i ] ? sum[ i ] / n[ i ] : 0;
			ink += sum[ i ];
		}
		maps.push( { w: bw, h: bh, data: blur( sum, bw, bh ), ink } );
	}
	return maps;
}

/**
 * A 1-2-1 blur both ways, so a label drawn a little off still overlaps.
 *
 * @param {Float32Array} a Values.
 * @param {number}       w Width.
 * @param {number}       h Height.
 * @return {Float32Array} Blurred values.
 */
function blur( a, w, h ) {
	const t = new Float32Array( a.length );
	const out = new Float32Array( a.length );
	for ( let y = 0; y < h; y++ ) {
		for ( let x = 0; x < w; x++ ) {
			const l = a[ y * w + Math.max( 0, x - 1 ) ];
			const r = a[ y * w + Math.min( w - 1, x + 1 ) ];
			t[ y * w + x ] = ( l + 2 * a[ y * w + x ] + r ) / 4;
		}
	}
	for ( let y = 0; y < h; y++ ) {
		for ( let x = 0; x < w; x++ ) {
			const u = t[ Math.max( 0, y - 1 ) * w + x ];
			const d = t[ Math.min( h - 1, y + 1 ) * w + x ];
			out[ y * w + x ] = ( u + 2 * t[ y * w + x ] + d ) / 4;
		}
	}
	return out;
}

/**
 * How alike two label maps are: the best normalised correlation over
 * small shifts, 1 for two blanks, 0 for a blank against a label.
 *
 * @param {Object} a Map.
 * @param {Object} b Map of the same size.
 * @return {number} Likeness, -1 to 1.
 */
function likeness( a, b ) {
	const inkA = a.ink > BLANK;
	const inkB = b.ink > BLANK;
	if ( ! inkA && ! inkB ) {
		return 1;
	}
	if ( inkA !== inkB ) {
		return 0;
	}
	let best = -1;
	for ( let sy = -1; sy <= 1; sy++ ) {
		for ( let sx = -2; sx <= 2; sx++ ) {
			let n = 0;
			let sa = 0;
			let sb = 0;
			for ( let y = Math.max( 0, -sy ); y < Math.min( a.h, b.h - sy ); y++ ) {
				for ( let x = Math.max( 0, -sx ); x < Math.min( a.w, b.w - sx ); x++ ) {
					sa += a.data[ y * a.w + x ];
					sb += b.data[ ( y + sy ) * b.w + x + sx ];
					n++;
				}
			}
			if ( ! n ) {
				continue;
			}
			const ma = sa / n;
			const mb = sb / n;
			let ab = 0;
			let aa = 0;
			let bb = 0;
			for ( let y = Math.max( 0, -sy ); y < Math.min( a.h, b.h - sy ); y++ ) {
				for ( let x = Math.max( 0, -sx ); x < Math.min( a.w, b.w - sx ); x++ ) {
					const da = a.data[ y * a.w + x ] - ma;
					const db = b.data[ ( y + sy ) * b.w + x + sx ] - mb;
					ab += da * db;
					aa += da * da;
					bb += db * db;
				}
			}
			if ( aa > 0 && bb > 0 ) {
				best = Math.max( best, ab / Math.sqrt( aa * bb ) );
			}
		}
	}
	return best;
}

/**
 * Pair the rows the model drew with the rows that were sent, in order,
 * by their labels. A row the model repeated, added or left out is simply
 * not paired; of two copies the one nearer its place wins, which on the
 * measured sheet is also the one drawn first.
 *
 * @param {Array} score Label likeness, score[found][sent].
 * @param {Array} dist  Distance from the sent place in rows, same shape.
 * @return {Array<number>} For each sent row the found row, or -1.
 */
export function pairRows( score, dist ) {
	const F = score.length;
	const S = F ? score[ 0 ].length : 0;
	const gain = ( f, s ) => score[ f ][ s ] - 0.35 - 0.04 * dist[ f ][ s ];
	const best = Array.from( { length: F + 1 }, () =>
		new Float64Array( S + 1 )
	);
	for ( let f = 1; f <= F; f++ ) {
		for ( let s = 1; s <= S; s++ ) {
			best[ f ][ s ] = Math.max(
				best[ f - 1 ][ s ],
				best[ f ][ s - 1 ],
				best[ f - 1 ][ s - 1 ] + gain( f - 1, s - 1 )
			);
		}
	}
	const pairs = new Array( S ).fill( -1 );
	let f = F;
	let s = S;
	while ( f > 0 && s > 0 ) {
		if ( best[ f ][ s ] === best[ f - 1 ][ s ] ) {
			f--;
		} else if ( best[ f ][ s ] === best[ f ][ s - 1 ] ) {
			s--;
		} else {
			pairs[ s - 1 ] = f - 1;
			f--;
			s--;
		}
	}
	return pairs;
}

/**
 * Where each sent row was drawn: found by the pink box edges, paired by
 * the printed labels against the page as it was sent.
 *
 * @param {Object}     img      Filled page.
 * @param {Array}      H        Sheet to filled page.
 * @param {Object}     page     The page.
 * @param {Object}     template The page as sent, `{ width, height, data }`.
 * @return {{rows: Array, found: number, by: string}|null} For each sent
 *         row its `{ top, height }` on the filled page or null, and whether
 *         the rows were paired by 'labels' or by 'place'; null when the
 *         page shows no boxes at all.
 */
function locateRows( img, H, page, template ) {
	const found = findBoxRows( img, H, page );
	if ( ! found.length ) {
		return null;
	}
	const { grid } = page;
	const sentRows = Math.max( ...page.cells.map( ( c ) => c.row ) ) + 1;
	const sentTop = ( r ) => grid.top + r * grid.pitchY + grid.labelSpace;
	const dist = found.map( ( f ) =>
		Array.from(
			{ length: sentRows },
			( _, r ) => Math.abs( f.top - sentTop( r ) ) / grid.pitchY
		)
	);
	const byPlace = () =>
		Array.from( { length: sentRows }, ( _, r ) => {
			let at = -1;
			found.forEach( ( f, i ) => {
				if ( dist[ i ][ r ] < 0.5 && ( at < 0 || dist[ i ][ r ] < dist[ at ][ r ] ) ) {
					at = i;
				}
			} );
			return at;
		} );

	let pairs = null;
	let by = 'place';
	const tMarks = template ? findRegistrationMarks( template ) : null;
	const Ht = tMarks ? homography( page.marks, tMarks ) : null;
	if ( Ht ) {
		const sent = Array.from( { length: sentRows }, ( _, r ) =>
			labelMaps( template, Ht, page, sentTop( r ) )
		);
		const drawn = found.map( ( f ) => labelMaps( img, H, page, f.top ) );
		// A model that dropped the labels leaves nothing to pair by.
		const labelled =
			drawn.filter( ( m ) => m.some( ( c ) => c.ink > BLANK ) ).length >=
			drawn.length / 2;
		if ( labelled ) {
			const score = drawn.map( ( d ) =>
				sent.map(
					( s ) =>
						s.reduce( ( a, col, c ) => a + likeness( d[ c ], col ), 0 ) /
						s.length
				)
			);
			pairs = pairRows( score, dist );
			by = 'labels';
		}
	}
	pairs = pairs || byPlace();
	return {
		rows: pairs.map( ( i ) => ( i < 0 ? null : found[ i ] ) ),
		found: found.length,
		by,
	};
}

/**
 * A homography that reads sent row `r` where it was drawn: the sheet map
 * after a vertical move and stretch of that row.
 *
 * @param {Array}  H     Sheet to image.
 * @param {number} from  Top of the sent row, millimetres.
 * @param {number} fromH Its height.
 * @param {Object} to    `{ top, height }` of the drawn row.
 * @return {Array} Homography.
 */
function rowMap( H, from, fromH, to ) {
	const sy = to.height / fromH;
	const ty = to.top - from * sy;
	// H · [ 1 0 0 ; 0 sy ty ; 0 0 1 ]
	return [
		H[ 0 ],
		H[ 1 ] * sy,
		H[ 1 ] * ty + H[ 2 ],
		H[ 3 ],
		H[ 4 ] * sy,
		H[ 4 ] * ty + H[ 5 ],
		H[ 6 ],
		H[ 7 ] * sy,
		H[ 7 ] * ty + H[ 8 ],
	];
}

/**
 * Keep what belongs to the letter: every blob that reaches into the box
 * itself. What lies only in the window around it - a stray mark, the tip
 * of a neighbour's letter - goes.
 *
 * @param {Object} bmp  Bitmap from `extractCell`.
 * @param {Object} box  The inside of the box in bitmap pixels,
 *                      `{ x0, y0, x1, y1 }`, inclusive.
 * @return {Object} Bitmap.
 */
export function keepLetter( bmp, box ) {
	const { w, h, data } = bmp;
	const out = new Uint8Array( data.length );
	const seen = new Uint8Array( data.length );
	const stack = [];
	const blob = [];
	let kept = 0;
	for ( let start = 0; start < data.length; start++ ) {
		if ( seen[ start ] || ! data[ start ] ) {
			continue;
		}
		stack.length = 0;
		blob.length = 0;
		stack.push( start );
		seen[ start ] = 1;
		let inside = false;
		while ( stack.length ) {
			const i = stack.pop();
			blob.push( i );
			const x = i % w;
			const y = ( i - x ) / w;
			if ( y >= box.y0 && y <= box.y1 && x >= box.x0 && x <= box.x1 ) {
				inside = true;
			}
			for ( const j of [ i - 1, i + 1, i - w, i + w ] ) {
				if ( j < 0 || j >= data.length || seen[ j ] || ! data[ j ] ) {
					continue;
				}
				// No wrapping from one row's end to the next row's start.
				if ( ( j === i - 1 && 0 === x ) || ( j === i + 1 && w - 1 === x ) ) {
					continue;
				}
				seen[ j ] = 1;
				stack.push( j );
			}
		}
		if ( inside ) {
			for ( const i of blob ) {
				out[ i ] = 1;
			}
			kept += blob.length;
		}
	}
	return { w, h, data: out, empty: 0 === kept };
}

/**
 * Read a filled page back. The corner squares give the page; the rows are
 * then taken where the model drew them, matched to the sent rows by their
 * printed labels, so a row the model repeated or moved is still read into
 * the right characters.
 *
 * @param {Object} img           `{ width, height, data }` RGBA.
 * @param {Object} page          The page that was sent.
 * @param {Object} metrics       The metrics the page was drawn with.
 * @param {Object} opts          Options.
 * @param {Object} opts.template The page as sent, `{ width, height, data }`;
 *                               without it the rows are taken by place.
 * @param {boolean} opts.bitmaps Keep each box's cleaned bitmap on its
 *                               glyph (for the probe).
 * @return {{glyphs: Array, corners: Array, rows: Object}|{error: string}}
 *         Result; `rows` says how many rows were sent, found and read,
 *         and `by` how they were matched: 'labels', 'place', or 'sent'
 *         when the page showed no boxes and was read as it was sent.
 */
export function readFilledPage( img, page, metrics, opts = {} ) {
	const corners = findRegistrationMarks( img );
	if ( ! corners ) {
		return { error: 'corners' };
	}
	const H = homography( page.marks, corners );
	if ( ! H ) {
		return { error: 'corners' };
	}
	const gray = redChannel( img );
	const { grid } = page;
	const located = locateRows( img, H, page, opts.template || null );
	const sentRows = page.cells.length
		? Math.max( ...page.cells.map( ( c ) => c.row ) ) + 1
		: 0;
	const rowH = Array.from( { length: sentRows }, ( _, r ) => {
		if ( ! located ) {
			// No boxes to go by: read the page as it was sent.
			return H;
		}
		const at = located.rows[ r ];
		return at
			? rowMap( H, grid.top + r * grid.pitchY + grid.labelSpace, grid.cellH, at )
			: null;
	} );
	const glyphs = [];
	const SIZE = 300;
	// The box's own edge is left out of what counts as inside it.
	const EDGE = 0.8;
	const reach = {
		above: Math.min( AI_READ.above, grid.labelSpace ),
		below: Math.min( AI_READ.below, grid.labelSpace ),
		// A negative inset widens the window past the box's sides.
		inset: -AI_READ.side,
	};
	const perMm = SIZE / ( grid.cellW + AI_READ.side * 2 );
	const inside = {
		x0: Math.round( ( AI_READ.side + EDGE ) * perMm ),
		x1: Math.round( ( AI_READ.side + grid.cellW - EDGE ) * perMm ),
		y0: Math.round( ( reach.above + EDGE ) * perMm ),
		y1: Math.round( ( reach.above + grid.cellH - EDGE ) * perMm ),
	};
	for ( const cell of page.cells ) {
		const Hc = rowH[ cell.row ];
		if ( ! Hc ) {
			continue;
		}
		const raw = extractCell( img, Hc, cell, { size: SIZE, gray, ...reach } );
		const geo = { cellMm: cell.w, inset: reach.inset, above: reach.above };
		const ruled = raw.empty ? raw : removeRules( raw, metrics, geo );
		const clean = ruled.empty ? ruled : despeckle( ruled, 40 );
		const bmp = clean.empty ? clean : keepLetter( clean, inside );
		if ( bmp.empty ) {
			continue;
		}
		const contours = cellToContours( bmp, metrics, geo );
		if ( ! contours.length || ! contourBounds( contours ) ) {
			continue;
		}
		glyphs.push(
			opts.bitmaps
				? { key: cell.key, contours, bmp }
				: { key: cell.key, contours }
		);
	}
	return {
		glyphs,
		corners,
		rows: {
			sent: sentRows,
			found: located ? located.found : 0,
			read: rowH.filter( Boolean ).length,
			by: located ? located.by : 'sent',
		},
	};
}
