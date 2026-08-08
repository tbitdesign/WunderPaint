/**
 * The paper route: print a ruled sheet, fill it in, photograph it.
 *
 * The whole design rests on one decision: the sheet carries four
 * registration marks, and the grid inside them is known. Once those
 * four points are located in the photograph, every cell's position
 * follows from arithmetic, so nothing has to be recognised, matched or
 * guessed. The letter in row three column five is the letter the sheet
 * printed there, full stop.
 *
 * The ruled lines are printed in a light cyan and the photograph is
 * read through its red channel, where cyan is as good as white. The
 * guides therefore disappear completely while pen ink stays black, and
 * that costs one array lookup rather than a cleanup pass.
 */

import { traceToContours } from './trace.js';

/** Sheet geometry in millimetres. */
export const SHEET = {
	pageW: 210,
	pageH: 297,
	margin: 14,
	markSize: 7,
	cell: 21,
	gap: 1.5,
	labelSpace: 5,
};

/**
 * The colour the guides print in.
 *
 * The trick only works if the guide is as bright as paper in the channel
 * being read, and the first choice here was a light cyan, which looks
 * pale to the eye but has a red value of 143. That is mid grey in the
 * red channel, and Otsu on a photographed cell lands around 150, so the
 * printed baseline was read as ink and vectorised along with the letter.
 *
 * These are pinks with the red channel at full: whatever the lighting,
 * they cannot be darker than the paper in the channel we look at. On a
 * black and white printer they come out as light grey, still far above
 * any threshold that separates pen from paper.
 */
export const GUIDE_COLOR = '#ff9aa2';
export const GUIDE_FAINT = '#ffc9cf';

/**
 * Lay the drawable keys out over as many pages as they need.
 *
 * @param {Array}  keys Drawable keys.
 * @param {Object} opts Overrides for SHEET.
 * @return {Array} Pages `{ index, marks, cells, geom }`.
 */
export function sheetLayout( keys, opts = {} ) {
	const g = { ...SHEET, ...opts };

	// The marks define a frame the camera can find, and the writing grid
	// lives inside it with the marks' own width to spare. Putting the
	// marks on the grid corners instead would land them on top of the
	// first and last boxes, where they would cover the very letters they
	// are meant to help read.
	const frame = {
		x: g.margin,
		y: g.margin,
		w: g.pageW - g.margin * 2,
		h: g.pageH - g.margin * 2,
	};
	const marks = [
		{ x: frame.x, y: frame.y },
		{ x: frame.x + frame.w, y: frame.y },
		{ x: frame.x + frame.w, y: frame.y + frame.h },
		{ x: frame.x, y: frame.y + frame.h },
	];

	const innerW = frame.w - g.markSize * 2;
	const innerH = frame.h - g.markSize * 2;
	const pitchX = g.cell + g.gap;
	const pitchY = g.cell + g.labelSpace;
	const cols = Math.max( 1, Math.floor( ( innerW + g.gap ) / pitchX ) );
	const rows = Math.max( 1, Math.floor( innerH / pitchY ) );
	const perPage = cols * rows;
	const gridW = cols * pitchX - g.gap;
	const gridH = rows * pitchY;
	const left = frame.x + g.markSize + ( innerW - gridW ) / 2;
	const top = frame.y + g.markSize + ( innerH - gridH ) / 2;
	const bounds = { x: left, y: top, w: gridW, h: gridH };
	const grid = {
		left,
		top,
		pitchX,
		pitchY,
		cols,
		rows,
		cellW: g.cell,
		cellH: g.cell,
		labelSpace: g.labelSpace,
	};

	const pages = [];
	for ( let start = 0; start < keys.length; start += perPage ) {
		const slice = keys.slice( start, start + perPage );
		const cells = slice.map( ( key, i ) => {
			const c = i % cols;
			const r = Math.floor( i / cols );
			return {
				key,
				col: c,
				row: r,
				x: left + c * pitchX,
				y: top + r * pitchY + g.labelSpace,
				w: g.cell,
				h: g.cell,
			};
		} );
		pages.push( { index: pages.length, id: 'grid2', cols, rows, marks, frame, cells, geom: g, bounds, grid } );
	}
	return pages.length
		? pages
		: [ { index: 0, id: 'grid2', cols, rows, marks, frame, cells: [], geom: g, bounds, grid } ];
}

/**
 * The sheet the first released version printed.
 *
 * Its registration marks sat on the corners of the writing grid rather
 * than on an outer frame, so the distance between them is different.
 * A photograph of one read with the current geometry has every box
 * looked up about a tenth of the page away from where it really is,
 * which produces confident nonsense rather than an obvious failure.
 * Sheets that were already filled in deserve better than being thrown
 * away, so the reader still knows how to read them.
 *
 * @param {Array} keys Drawable keys.
 * @return {Array} Pages in the same shape as `sheetLayout`.
 */
export function legacySheetLayout( keys ) {
	const g = { ...SHEET, cell: 23, gap: 0 };
	const innerW = g.pageW - g.margin * 2;
	const innerH = g.pageH - g.margin * 2;
	const cols = Math.max( 1, Math.floor( innerW / g.cell ) );
	const pitchY = g.cell + g.labelSpace;
	const rows = Math.max( 1, Math.floor( innerH / pitchY ) );
	const gridW = cols * g.cell;
	const gridH = rows * pitchY;
	const left = ( g.pageW - gridW ) / 2;
	const top = ( g.pageH - gridH ) / 2;
	const marks = [
		{ x: left, y: top },
		{ x: left + gridW, y: top },
		{ x: left + gridW, y: top + gridH },
		{ x: left, y: top + gridH },
	];
	const grid = { left, top, pitchX: g.cell, pitchY, cols, rows, cellW: g.cell, cellH: g.cell, labelSpace: g.labelSpace };
	const bounds = { x: left, y: top, w: gridW, h: gridH };
	const perPage = cols * rows;
	const pages = [];
	for ( let start = 0; start < keys.length; start += perPage ) {
		const cells = keys.slice( start, start + perPage ).map( ( key, i ) => {
			const c = i % cols;
			const r = Math.floor( i / cols );
			return {
				key,
				col: c,
				row: r,
				x: left + c * g.cell,
				y: top + r * pitchY + g.labelSpace,
				w: g.cell,
				h: g.cell,
			};
		} );
		pages.push( { index: pages.length, id: 'grid1', cols, rows, marks, frame: bounds, cells, geom: g, bounds, grid } );
	}
	return pages.length
		? pages
		: [ { index: 0, id: 'grid1', cols, rows, marks, frame: bounds, cells: [], geom: g, bounds, grid } ];
}

/**
 * How cleanly the writing sits inside its boxes.
 *
 * This is what tells one sheet layout from another without the sheet
 * having to say which it is, and it is deliberately not a count of ink
 * inside boxes: the older layout packs its boxes edge to edge, so it
 * would win that comparison whatever the photograph showed. What cannot
 * be faked is whether letters are cut by box edges. Read with the
 * geometry it was printed with, a letter sits in the middle of its box
 * with clear paper around it. Read with the wrong geometry, the boxes
 * land somewhere else and nearly every one is crossed by a stroke.
 *
 * @param {Object} img   `{ width, height, data }` RGBA.
 * @param {Object} page  A page from either layout.
 * @param {Array}  marks The four marks as found in the photo.
 * @return {Object} `{ score, cells }` where score is 0..1, higher better.
 */
export function borderFit( img, page, marks ) {
	const H = homography( page.marks, marks );
	if ( ! H ) {
		return { score: 0, cells: 0 };
	}
	let clean = 0;
	let used = 0;
	for ( const cell of page.cells ) {
		const bmp = extractCell( img, H, cell, { size: 96, inset: 0.4 } );
		if ( bmp.empty ) {
			continue;
		}
		let ink = 0;
		let edge = 0;
		const band = Math.max( 2, Math.round( bmp.w * 0.06 ) );
		for ( let y = 0; y < bmp.h; y++ ) {
			for ( let x = 0; x < bmp.w; x++ ) {
				if ( ! bmp.data[ y * bmp.w + x ] ) {
					continue;
				}
				ink++;
				if ( x < band || y < band || x >= bmp.w - band || y >= bmp.h - band ) {
					edge++;
				}
			}
		}
		if ( ink < bmp.w * 2 ) {
			continue;
		}
		used++;
		if ( edge / ink < 0.12 ) {
			clean++;
		}
	}
	return { score: used ? clean / used : 0, cells: used };
}

/**
 * Work out which sheet a photograph is of.
 *
 * @param {Object} img   Photo.
 * @param {Array}  marks The four marks as found in the photo.
 * @param {Array}  keys  Drawable keys, to build the candidate pages.
 * @return {Object} `{ pages, id, score, cells, runnerUp }`.
 */
export function chooseLayout( img, marks, keys ) {
	const scored = [ sheetLayout( keys ), legacySheetLayout( keys ) ]
		.map( ( pages ) => ( { pages, id: pages[ 0 ].id, ...borderFit( img, pages[ 0 ], marks ) } ) )
		.sort( ( a, b ) => b.score - a.score || b.cells - a.cells );
	return { ...scored[ 0 ], runnerUp: scored[ 1 ] };
}

/**
 * Where the writing lines sit inside a cell, as fractions of its height.
 *
 * The same four heights the drawing surface shows, so a sheet and a
 * mouse produce letters that stand on the same baseline.
 *
 * @param {Object} metrics Font metrics.
 * @return {Object} Fractions measured from the top of the cell.
 */
export function cellGuides( metrics ) {
	const top = metrics.ascender;
	const bottom = metrics.descender;
	const span = top - bottom;
	const at = ( v ) => ( top - v ) / span;
	return {
		ascender: at( metrics.ascender ),
		capHeight: at( metrics.capHeight ),
		xHeight: at( metrics.xHeight ),
		baseline: at( 0 ),
		descender: at( metrics.descender ),
	};
}

/**
 * Draw one printable page onto a 2D context.
 *
 * @param {Object}   ctx     Canvas 2D context.
 * @param {Object}   page    One page from `sheetLayout`.
 * @param {Object}   opts    Options.
 * @param {number}   opts.dpi        Output resolution.
 * @param {Object}   opts.metrics    Font metrics for the guide lines.
 * @param {Function} opts.labelFor   Key to printed label.
 * @param {string}   opts.title      Line printed at the top.
 */
export function drawSheet( ctx, page, opts = {} ) {
	const { dpi = 300, metrics, labelFor = ( k ) => k, title = '' } = opts;
	const s = dpi / 25.4;
	const g = page.geom;
	ctx.fillStyle = '#ffffff';
	ctx.fillRect( 0, 0, g.pageW * s, g.pageH * s );

	ctx.fillStyle = '#111111';
	for ( const m of page.marks ) {
		const half = ( g.markSize * s ) / 2;
		ctx.fillRect( m.x * s - half, m.y * s - half, half * 2, half * 2 );
	}

	if ( title ) {
		ctx.fillStyle = '#555555';
		ctx.font = `${ Math.round( 3.4 * s ) }px sans-serif`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'alphabetic';
		ctx.fillText( title, ( g.pageW / 2 ) * s, ( page.frame.y - 2 ) * s );
	}

	const guides = cellGuides( metrics );
	for ( const cell of page.cells ) {
		const x = cell.x * s;
		const y = cell.y * s;
		const w = cell.w * s;
		const h = cell.h * s;

		ctx.strokeStyle = GUIDE_FAINT;
		ctx.lineWidth = Math.max( 1, 0.25 * s );
		ctx.strokeRect( x, y, w, h );

		for ( const [ name, frac ] of Object.entries( guides ) ) {
			const solid = 'baseline' === name;
			ctx.strokeStyle = solid ? GUIDE_COLOR : GUIDE_FAINT;
			ctx.lineWidth = ( solid ? 0.5 : 0.25 ) * s;
			ctx.beginPath();
			ctx.moveTo( x, y + h * frac );
			ctx.lineTo( x + w, y + h * frac );
			ctx.stroke();
		}

		ctx.fillStyle = GUIDE_COLOR;
		ctx.font = `${ Math.round( 3.2 * s ) }px sans-serif`;
		ctx.textAlign = 'left';
		ctx.textBaseline = 'bottom';
		ctx.fillText( labelFor( cell.key ), x, y - 0.8 * s );
	}
}

/* --------------------------- reading the photo -------------------------- */

/**
 * The red channel of an image, which is where the cyan guides are not.
 *
 * @param {Object} img `{ width, height, data }` RGBA.
 * @return {Uint8Array} One byte per pixel.
 */
export function redChannel( img ) {
	const out = new Uint8Array( img.width * img.height );
	for ( let i = 0, p = 0; i < out.length; i++, p += 4 ) {
		out[ i ] = img.data[ p ];
	}
	return out;
}

/**
 * Otsu's threshold: the split that separates ink from paper with the
 * least overlap, computed from the histogram alone.
 *
 * @param {Uint8Array} gray Grayscale pixels.
 * @return {number} Threshold in 0..255.
 */
export function otsu( gray ) {
	const hist = new Float64Array( 256 );
	for ( let i = 0; i < gray.length; i++ ) {
		hist[ gray[ i ] ]++;
	}
	const total = gray.length;
	let sum = 0;
	for ( let i = 0; i < 256; i++ ) {
		sum += i * hist[ i ];
	}
	let sumB = 0;
	let wB = 0;
	let lo = 0;
	let hi = 0;
	let bestVar = -1;
	for ( let t = 0; t < 256; t++ ) {
		wB += hist[ t ];
		if ( ! wB ) {
			continue;
		}
		const wF = total - wB;
		if ( ! wF ) {
			break;
		}
		sumB += t * hist[ t ];
		const mB = sumB / wB;
		const mF = ( sum - sumB ) / wF;
		const between = wB * wF * ( mB - mF ) * ( mB - mF );
		if ( between > bestVar ) {
			bestVar = between;
			lo = t;
			hi = t;
		} else if ( between === bestVar ) {
			hi = t;
		}
	}
	// Any level in the empty gap between the two populations separates
	// them equally well, and the middle of the gap is the one that copes
	// with the soft edges a photograph brings.
	return Math.round( ( lo + hi ) / 2 );
}

/**
 * Label the connected dark regions of an image.
 *
 * @param {Uint8Array} gray  Grayscale pixels.
 * @param {number}     w     Width.
 * @param {number}     h     Height.
 * @param {number}     limit Pixels at or below this count as ink.
 * @return {Array} Blobs `{ area, x0, y0, x1, y1, cx, cy }`.
 */
export function darkBlobs( gray, w, h, limit ) {
	const seen = new Uint8Array( w * h );
	const blobs = [];
	const stack = [];
	for ( let start = 0; start < gray.length; start++ ) {
		if ( seen[ start ] || gray[ start ] > limit ) {
			continue;
		}
		let area = 0;
		let x0 = w;
		let y0 = h;
		let x1 = 0;
		let y1 = 0;
		let sx = 0;
		let sy = 0;
		stack.length = 0;
		stack.push( start );
		seen[ start ] = 1;
		while ( stack.length ) {
			const i = stack.pop();
			const x = i % w;
			const y = ( i - x ) / w;
			area++;
			sx += x;
			sy += y;
			if ( x < x0 ) {
				x0 = x;
			}
			if ( y < y0 ) {
				y0 = y;
			}
			if ( x > x1 ) {
				x1 = x;
			}
			if ( y > y1 ) {
				y1 = y;
			}
			if ( x > 0 && ! seen[ i - 1 ] && gray[ i - 1 ] <= limit ) {
				seen[ i - 1 ] = 1;
				stack.push( i - 1 );
			}
			if ( x < w - 1 && ! seen[ i + 1 ] && gray[ i + 1 ] <= limit ) {
				seen[ i + 1 ] = 1;
				stack.push( i + 1 );
			}
			if ( y > 0 && ! seen[ i - w ] && gray[ i - w ] <= limit ) {
				seen[ i - w ] = 1;
				stack.push( i - w );
			}
			if ( y < h - 1 && ! seen[ i + w ] && gray[ i + w ] <= limit ) {
				seen[ i + w ] = 1;
				stack.push( i + w );
			}
		}
		blobs.push( { area, x0, y0, x1, y1, cx: sx / area, cy: sy / area } );
	}
	return blobs;
}

/**
 * Find the four registration marks in a photographed sheet.
 *
 * The marks are the only solid, roughly square, roughly equal blobs
 * near the four corners of the picture, so candidates are filtered on
 * exactly those three properties and then assigned to the corner each
 * is nearest to. When the picture will not give up four of them, the
 * caller falls back to letting the user place them, which is why this
 * returns null rather than a guess.
 *
 * @param {Object} img `{ width, height, data }` RGBA.
 * @return {Array|null} Four points in top-left, top-right, bottom-right,
 *                      bottom-left order.
 */
export function findRegistrationMarks( img ) {
	const w = img.width;
	const h = img.height;
	const gray = redChannel( img );
	const limit = Math.min( 110, otsu( gray ) );
	const area = w * h;
	const candidates = darkBlobs( gray, w, h, limit ).filter( ( b ) => {
		const bw = b.x1 - b.x0 + 1;
		const bh = b.y1 - b.y0 + 1;
		if ( b.area < area * 0.00008 || b.area > area * 0.02 ) {
			return false;
		}
		const ratio = bw / bh;
		if ( ratio < 0.6 || ratio > 1.7 ) {
			return false;
		}
		return b.area / ( bw * bh ) > 0.68;
	} );
	if ( candidates.length < 4 ) {
		return null;
	}
	const corners = [
		{ x: 0, y: 0 },
		{ x: w, y: 0 },
		{ x: w, y: h },
		{ x: 0, y: h },
	];
	const picked = [];
	const used = new Set();
	for ( const corner of corners ) {
		let best = null;
		let bestD = Infinity;
		for ( let i = 0; i < candidates.length; i++ ) {
			if ( used.has( i ) ) {
				continue;
			}
			const b = candidates[ i ];
			const d = Math.hypot( b.cx - corner.x, b.cy - corner.y );
			if ( d < bestD ) {
				bestD = d;
				best = i;
			}
		}
		if ( null === best ) {
			return null;
		}
		used.add( best );
		picked.push( { x: candidates[ best ].cx, y: candidates[ best ].cy } );
	}
	// Four marks of wildly different sizes mean we found something else.
	const sizes = Array.from( used ).map( ( i ) => candidates[ i ].area );
	if ( Math.max( ...sizes ) > Math.min( ...sizes ) * 4 ) {
		return null;
	}
	return picked;
}

/**
 * The projective map taking four source points to four destinations.
 *
 * A photograph of a sheet is a projective view of it, so nothing weaker
 * than a homography will straighten it: an affine fit leaves the far
 * edge of the page visibly wider than the near one.
 *
 * @param {Array} src Four `{ x, y }` points.
 * @param {Array} dst Four `{ x, y }` points.
 * @return {number[]|null} Nine coefficients, row major.
 */
export function homography( src, dst ) {
	const A = [];
	const b = [];
	for ( let i = 0; i < 4; i++ ) {
		const { x, y } = src[ i ];
		const { x: u, y: v } = dst[ i ];
		A.push( [ x, y, 1, 0, 0, 0, -u * x, -u * y ] );
		b.push( u );
		A.push( [ 0, 0, 0, x, y, 1, -v * x, -v * y ] );
		b.push( v );
	}
	const sol = solve( A, b );
	return sol ? sol.concat( 1 ) : null;
}

function solve( A, b ) {
	const n = b.length;
	const m = A.map( ( row, i ) => row.concat( b[ i ] ) );
	for ( let col = 0; col < n; col++ ) {
		let pivot = col;
		for ( let r = col + 1; r < n; r++ ) {
			if ( Math.abs( m[ r ][ col ] ) > Math.abs( m[ pivot ][ col ] ) ) {
				pivot = r;
			}
		}
		if ( Math.abs( m[ pivot ][ col ] ) < 1e-10 ) {
			return null;
		}
		const tmp = m[ col ];
		m[ col ] = m[ pivot ];
		m[ pivot ] = tmp;
		for ( let r = 0; r < n; r++ ) {
			if ( r === col ) {
				continue;
			}
			const f = m[ r ][ col ] / m[ col ][ col ];
			for ( let c = col; c <= n; c++ ) {
				m[ r ][ c ] -= f * m[ col ][ c ];
			}
		}
	}
	// Full elimination leaves a diagonal, so each unknown reads straight off.
	return m.map( ( row, i ) => row[ n ] / m[ i ][ i ] );
}

/** Apply a homography to a point. */
export function applyH( H, x, y ) {
	const d = H[ 6 ] * x + H[ 7 ] * y + H[ 8 ];
	return {
		x: ( H[ 0 ] * x + H[ 1 ] * y + H[ 2 ] ) / d,
		y: ( H[ 3 ] * x + H[ 4 ] * y + H[ 5 ] ) / d,
	};
}

/**
 * Lift one cell out of a photograph as a clean bitmap.
 *
 * @param {Object} img   `{ width, height, data }` RGBA.
 * @param {Array}  H     Homography from sheet millimetres to image pixels.
 * @param {Object} cell  One cell from `sheetLayout`.
 * @param {Object} opts  Options.
 * @param {number} opts.size    Output resolution of the cell, in pixels.
 * @param {number} opts.inset   Millimetres trimmed off each edge.
 * @return {Object} `{ w, h, data }` bitmap, ink set to 1.
 */
export function extractCell( img, H, cell, opts = {} ) {
	const { size = 320, inset = 0.8 } = opts;
	const gray = redChannel( img );
	const w = img.width;
	const h = img.height;
	const out = new Uint8Array( size * size );
	const samples = new Uint8Array( size * size );
	const x0 = cell.x + inset;
	const y0 = cell.y + inset;
	const span = cell.w - inset * 2;
	for ( let py = 0; py < size; py++ ) {
		for ( let px = 0; px < size; px++ ) {
			const p = applyH( H, x0 + ( span * ( px + 0.5 ) ) / size, y0 + ( span * ( py + 0.5 ) ) / size );
			samples[ py * size + px ] = sampleBilinear( gray, w, h, p.x, p.y );
		}
	}
	const limit = otsu( samples );
	// A blank cell has no two populations to separate, and Otsu will
	// happily invent one out of paper texture, so refuse to see ink
	// where the darkest sample is barely darker than the page.
	let min = 255;
	let max = 0;
	for ( let i = 0; i < samples.length; i++ ) {
		if ( samples[ i ] < min ) {
			min = samples[ i ];
		}
		if ( samples[ i ] > max ) {
			max = samples[ i ];
		}
	}
	if ( max - min < 45 ) {
		return { w: size, h: size, data: out, empty: true };
	}
	for ( let i = 0; i < samples.length; i++ ) {
		out[ i ] = samples[ i ] <= limit ? 1 : 0;
	}
	return dropPrintedRules( { w: size, h: size, data: out, empty: false } );
}

/**
 * Drop anything that is shaped like a printed rule rather than writing.
 *
 * The guide colour alone should make this unnecessary, and on a colour
 * printer it does. A tired toner cartridge or a photograph taken in bad
 * light can still leave a trace of a rule behind, so the one shape a
 * letter never has is removed: a hairline running nearly the full width
 * of the box. A hyphen covers about two fifths of a box, so it is in no
 * danger.
 *
 * @param {Object} bmp Cell bitmap.
 * @return {Object} Bitmap without full-width hairlines.
 */
export function dropPrintedRules( bmp ) {
	const { w, h, data } = bmp;
	const seen = new Uint8Array( data.length );
	const stack = [];
	const blob = [];
	let left = 0;
	for ( let start = 0; start < data.length; start++ ) {
		if ( seen[ start ] || ! data[ start ] ) {
			continue;
		}
		stack.length = 0;
		blob.length = 0;
		stack.push( start );
		seen[ start ] = 1;
		let x0 = w;
		let x1 = 0;
		let y0 = h;
		let y1 = 0;
		while ( stack.length ) {
			const i = stack.pop();
			blob.push( i );
			const x = i % w;
			const y = ( i - x ) / w;
			if ( x < x0 ) {
				x0 = x;
			}
			if ( x > x1 ) {
				x1 = x;
			}
			if ( y < y0 ) {
				y0 = y;
			}
			if ( y > y1 ) {
				y1 = y;
			}
			if ( x > 0 && data[ i - 1 ] && ! seen[ i - 1 ] ) {
				seen[ i - 1 ] = 1;
				stack.push( i - 1 );
			}
			if ( x < w - 1 && data[ i + 1 ] && ! seen[ i + 1 ] ) {
				seen[ i + 1 ] = 1;
				stack.push( i + 1 );
			}
			if ( i >= w && data[ i - w ] && ! seen[ i - w ] ) {
				seen[ i - w ] = 1;
				stack.push( i - w );
			}
			if ( i + w < data.length && data[ i + w ] && ! seen[ i + w ] ) {
				seen[ i + w ] = 1;
				stack.push( i + w );
			}
		}
		const wide = x1 - x0 >= w * 0.85;
		const flat = y1 - y0 <= h * 0.04;
		if ( wide && flat ) {
			for ( const i of blob ) {
				data[ i ] = 0;
			}
		} else {
			left++;
		}
	}
	return { w, h, data, empty: 0 === left };
}

function sampleBilinear( gray, w, h, x, y ) {
	if ( x < 0 || y < 0 || x > w - 1 || y > h - 1 ) {
		return 255;
	}
	const xi = Math.floor( x );
	const yi = Math.floor( y );
	const fx = x - xi;
	const fy = y - yi;
	const xi2 = Math.min( w - 1, xi + 1 );
	const yi2 = Math.min( h - 1, yi + 1 );
	const a = gray[ yi * w + xi ];
	const b = gray[ yi * w + xi2 ];
	const c = gray[ yi2 * w + xi ];
	const d = gray[ yi2 * w + xi2 ];
	return ( a * ( 1 - fx ) + b * fx ) * ( 1 - fy ) + ( c * ( 1 - fx ) + d * fx ) * fy;
}

/**
 * Remove specks the pen never made.
 *
 * Paper grain and JPEG noise survive thresholding as a scatter of tiny
 * blobs. Anything far smaller than a pen stroke is not writing.
 *
 * @param {Object} bmp     Bitmap.
 * @param {number} minArea Smallest blob kept, in pixels.
 * @return {Object} Cleaned bitmap.
 */
export function despeckle( bmp, minArea ) {
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
		while ( stack.length ) {
			const i = stack.pop();
			blob.push( i );
			const x = i % w;
			if ( x > 0 && data[ i - 1 ] && ! seen[ i - 1 ] ) {
				seen[ i - 1 ] = 1;
				stack.push( i - 1 );
			}
			if ( x < w - 1 && data[ i + 1 ] && ! seen[ i + 1 ] ) {
				seen[ i + 1 ] = 1;
				stack.push( i + 1 );
			}
			if ( i >= w && data[ i - w ] && ! seen[ i - w ] ) {
				seen[ i - w ] = 1;
				stack.push( i - w );
			}
			if ( i + w < data.length && data[ i + w ] && ! seen[ i + w ] ) {
				seen[ i + w ] = 1;
				stack.push( i + w );
			}
		}
		if ( blob.length >= minArea ) {
			kept++;
			for ( const i of blob ) {
				out[ i ] = 1;
			}
		}
	}
	return { w, h, data: out, empty: 0 === kept };
}

/**
 * Rub out the printed rules where they run alone.
 *
 * Sheets printed before the guide colour changed carry rules that are
 * as dark as ink in the channel we read, and a letter sitting on the
 * baseline is joined to it, so no test on the shape as a whole can
 * separate them. What does separate them is local: where a rule runs by
 * itself, the ink is a thin horizontal hairline; where a stroke crosses
 * it or rests on it, the ink is thick. So only the thin part is removed,
 * and the letter keeps the ground it stands on.
 *
 * On current sheets there is nothing at these heights to find, so this
 * costs a scan and changes nothing.
 *
 * @param {Object} bmp     Cell bitmap.
 * @param {Object} metrics Font metrics, for the guide heights.
 * @param {Object} opts    Options.
 * @param {number} opts.inset  Millimetres trimmed by `extractCell`.
 * @param {number} opts.cellMm Cell size in millimetres.
 * @return {Object} Bitmap with free-standing rules removed.
 */
export function removeRules( bmp, metrics, opts = {} ) {
	const { inset = 0.8, cellMm = SHEET.cell } = opts;
	if ( ! bmp || bmp.empty ) {
		return bmp;
	}
	const { w, h, data } = bmp;
	const span = cellMm - inset * 2;
	const perMm = h / span;
	// Comfortably under any pen, comfortably over the printed rule.
	const maxThin = Math.max( 2, Math.round( perMm * 0.62 ) );
	// And it has to actually run across the box. A stroke that merely
	// crosses a rule is thin for a few pixels, not for half a cell.
	const minRun = Math.round( w * 0.5 );
	const guides = cellGuides( metrics );
	const rows = new Set();
	for ( const frac of Object.values( guides ) ) {
		const row = Math.round( ( ( frac * cellMm - inset ) / span ) * h );
		for ( let d = -maxThin; d <= maxThin; d++ ) {
			const r = row + d;
			if ( r >= 0 && r < h ) {
				rows.add( r );
			}
		}
	}
	if ( ! rows.size ) {
		return bmp;
	}
	const out = data.slice();
	const top = new Int32Array( w );
	const bottom = new Int32Array( w );
	let removed = 0;
	for ( const row of rows ) {
		// Where does the ink through this row start and stop, column by
		// column, and how thin is it?
		let thin = 0;
		for ( let x = 0; x < w; x++ ) {
			top[ x ] = -1;
			if ( ! data[ row * w + x ] ) {
				continue;
			}
			let t = row;
			while ( t > 0 && data[ ( t - 1 ) * w + x ] ) {
				t--;
			}
			let bt = row;
			while ( bt < h - 1 && data[ ( bt + 1 ) * w + x ] ) {
				bt++;
			}
			if ( bt - t + 1 <= maxThin ) {
				top[ x ] = t;
				bottom[ x ] = bt;
				thin++;
			}
		}
		if ( thin < minRun ) {
			continue;
		}
		// A printed rule is not merely thin, it is FLAT: its upper and
		// lower edges sit at the same height all the way across. The
		// bottom of a round letter resting on it is just as thin, but it
		// is a curve, so its edges wander. Requiring both edges to match
		// the row's own median is what keeps the letter and takes the
		// rule, and it needs no assumption about how thick anybody's pen
		// happens to be.
		const tops = [];
		const bottoms = [];
		for ( let x = 0; x < w; x++ ) {
			if ( top[ x ] >= 0 ) {
				tops.push( top[ x ] );
				bottoms.push( bottom[ x ] );
			}
		}
		tops.sort( ( a, c ) => a - c );
		bottoms.sort( ( a, c ) => a - c );
		const medTop = tops[ tops.length >> 1 ];
		const medBottom = bottoms[ bottoms.length >> 1 ];
		let flat = 0;
		for ( let x = 0; x < w; x++ ) {
			if ( top[ x ] < 0 ) {
				continue;
			}
			if ( Math.abs( top[ x ] - medTop ) > 1 || Math.abs( bottom[ x ] - medBottom ) > 1 ) {
				top[ x ] = -1;
				continue;
			}
			flat++;
		}
		if ( flat < minRun ) {
			continue;
		}
		for ( let x = 0; x < w; x++ ) {
			if ( top[ x ] < 0 ) {
				continue;
			}
			for ( let y = top[ x ]; y <= bottom[ x ]; y++ ) {
				out[ y * w + x ] = 0;
				removed++;
			}
		}
	}
	if ( ! removed ) {
		return bmp;
	}
	let any = 0;
	for ( let i = 0; i < out.length; i++ ) {
		any += out[ i ];
	}
	return { w, h, data: out, empty: 0 === any };
}

/**
 * Turn one extracted cell into glyph contours.
 *
 * The cell's height covers the full ascender-to-descender span, which
 * is exactly what the printed guide lines told the writer, so a letter
 * that sat on the printed baseline sits on the font's baseline. The
 * cell is square, so the same scale applies across.
 *
 * @param {Object} bmp     Cell bitmap from `extractCell`.
 * @param {Object} metrics Font metrics.
 * @param {Object} opts    Options.
 * @param {number} opts.inset  Millimetres trimmed by `extractCell`.
 * @param {number} opts.cellMm Cell size in millimetres.
 * @return {Array} Contours in font units.
 */
export function cellToContours( bmp, metrics, opts = {} ) {
	const { inset = 0.8, cellMm = SHEET.cell } = opts;
	if ( ! bmp || bmp.empty ) {
		return [];
	}
	const span = metrics.ascender - metrics.descender;
	const perMm = span / cellMm;
	const unitsAcross = ( cellMm - inset * 2 ) * perMm;
	const left = inset * perMm;
	const top = metrics.ascender - inset * perMm;
	const toUnits = ( p ) => ( {
		x: left + ( p.x / bmp.w ) * unitsAcross,
		y: top - ( p.y / bmp.h ) * unitsAcross,
	} );
	const scale = unitsAcross / bmp.w;
	return traceToContours( bmp, {
		toUnits,
		// Deliberately no pre-simplification. The fitter only checks its
		// error where it has data, so thinning the boundary first blinds
		// it exactly where a long run needs watching.
		simplify: 0,
		// A photographed edge is rougher than a drawn one, so the fit is
		// allowed a little more room before it starts chasing paper grain.
		fitTol: 1.1,
		quadTol: Math.max( 0.8, scale * 0.6 ),
		minArea: 12,
	} );
}
