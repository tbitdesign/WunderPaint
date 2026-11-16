/**
 * Collage & Photo Grid layout engine (v1.375.0): pure, seeded geometry.
 * Input is a list of image aspects plus a target area; output is cell
 * specs in target pixels, ready to become editable layers. House rule:
 * no Math.random in engines - identical seed, identical collage.
 */

import { __, _x } from '@wordpress/i18n';

import { rng } from './seeded';
import { faceAnchor } from './face-detect';

/** The generator id an inserted collage group carries (19.10.2026). */
export const COLLAGE_GENERATOR_ID = 'wpie-core/collage';

export const LAYOUTS = [
	{ id: 'grid', label: __( 'Grid', 'wunderpaint' ) },
	{ id: 'mosaic', label: __( 'Mosaic', 'wunderpaint' ) },
	{ id: 'bento', label: __( 'Bento', 'wunderpaint' ) },
	{ id: 'hero', label: __( 'Hero', 'wunderpaint' ) },
	{ id: 'strips', label: __( 'Strips', 'wunderpaint' ) },
	{ id: 'circles', label: __( 'Circles', 'wunderpaint' ) },
	{ id: 'polaroid', label: __( 'Polaroid', 'wunderpaint' ) },
	{ id: 'filmstrip', label: __( 'Filmstrip', 'wunderpaint' ) },
	{ id: 'contact', label: __( 'Contact sheet', 'wunderpaint' ) },
	{ id: 'beforeafter', label: __( 'Before / After', 'wunderpaint' ) },
	// 20.10.2026. Own context: "Split" and "Inset" already mean other
	// things in the editor (a text effect, a stroke position).
	{ id: 'masonry', label: _x( 'Masonry', 'collage layout', 'wunderpaint' ) },
	{
		id: 'diagonal',
		label: _x( 'Diagonal', 'collage layout', 'wunderpaint' ),
	},
	{ id: 'hexagon', label: _x( 'Hexagon', 'collage layout', 'wunderpaint' ) },
	{ id: 'split', label: _x( 'Split', 'collage layout', 'wunderpaint' ) },
	{ id: 'inset', label: _x( 'Inset', 'collage layout', 'wunderpaint' ) },
];

/** Layouts that honor a column count. */
export const LAYOUTS_WITH_COLUMNS = [
	'grid',
	'contact',
	'polaroid',
	'circles',
	'masonry',
	'hexagon',
	'split',
];

/** Layouts that use only some of the photos, and how many. */
export const LAYOUT_PHOTO_LIMIT = {
	beforeafter: 2,
	diagonal: 4,
	split: 1,
	inset: 5,
};

/** Layouts that write captions (file names, or Before / After). */
export const LAYOUTS_WITH_CAPTIONS = [ 'polaroid', 'contact', 'beforeafter' ];

const clamp = ( v, lo, hi ) => Math.min( hi, Math.max( lo, v ) );

/** Auto column count that keeps cells roughly square on the target area. */
const autoCols = ( n, width, height ) =>
	clamp( Math.round( Math.sqrt( n * ( width / height ) ) ), 1, n );

/**
 * Split n items into per-row counts for a plain grid.
 *
 * @param {number} n    Item count.
 * @param {number} cols Columns.
 * @return {number[]} Items per row.
 */
const rowCounts = ( n, cols ) => {
	const rows = [];
	for ( let left = n; left > 0; left -= cols ) {
		rows.push( Math.min( cols, left ) );
	}
	return rows;
};

/** Inset a rect on all sides. */
const inset = ( r, d ) => ( {
	x: r.x + d,
	y: r.y + d,
	w: r.w - 2 * d,
	h: r.h - 2 * d,
} );

/**
 * Grid-family layout (grid + contact). Blocks are equal cells, incomplete
 * last rows are centered; contact reserves a caption strip per block.
 */
function gridCells( images, opts, withCaptions ) {
	const { width, height, gap, frame } = opts;
	const cols =
		opts.cols > 0
			? Math.min( opts.cols, images.length )
			: autoCols( images.length, width, height );
	const rows = rowCounts( images.length, cols );
	const cellW = ( width - gap * ( cols + 1 ) ) / cols;
	const cellH = ( height - gap * ( rows.length + 1 ) ) / rows.length;
	const cells = [];
	let index = 0;
	rows.forEach( ( count, row ) => {
		const rowW = count * cellW + ( count - 1 ) * gap;
		const x0 = ( width - rowW ) / 2;
		for ( let col = 0; col < count; col++ ) {
			const block = {
				x: x0 + col * ( cellW + gap ),
				y: gap + row * ( cellH + gap ),
				w: cellW,
				h: cellH,
			};
			const cell = { index };
			if ( frame > 0 ) {
				cell.frame = { ...block };
			}
			const innerRect = frame > 0 ? inset( block, frame ) : block;
			if ( withCaptions ) {
				const capH = clamp( innerRect.h * 0.16, 12, 40 );
				cell.x = innerRect.x;
				cell.y = innerRect.y;
				cell.w = innerRect.w;
				cell.h = innerRect.h - capH;
				cell.caption = {
					x: innerRect.x,
					y: innerRect.y + innerRect.h - capH,
					w: innerRect.w,
					h: capH,
				};
			} else {
				cell.x = innerRect.x;
				cell.y = innerRect.y;
				cell.w = innerRect.w;
				cell.h = innerRect.h;
			}
			cell.rot = 0;
			cells.push( cell );
			index++;
		}
	} );
	return cells;
}

/** Justified rows (Flickr style), scaled vertically to fill the height. */
function mosaicCells( images, opts ) {
	const { width, height, gap } = opts;
	const n = images.length;
	const rowCount = clamp(
		Math.round( Math.sqrt( ( n * height ) / width ) ),
		1,
		n
	);
	const totalAspect = images.reduce( ( s, im ) => s + im.aspect, 0 );
	const target = totalAspect / rowCount;
	// Greedy row fill; every later row keeps at least one image.
	const rowsImages = [];
	let current = [];
	let acc = 0;
	images.forEach( ( im, i ) => {
		current.push( { ...im, index: i } );
		acc += im.aspect;
		const itemsAfter = n - i - 1;
		const rowsAfterClose = rowCount - rowsImages.length - 1;
		// Close when the row is full enough - but never starve a later
		// row (each remaining row still needs at least one image).
		const canClose = rowsAfterClose > 0 && itemsAfter >= rowsAfterClose;
		if ( canClose && ( acc >= target || itemsAfter === rowsAfterClose ) ) {
			rowsImages.push( current );
			current = [];
			acc = 0;
		}
	} );
	if ( current.length ) {
		rowsImages.push( current );
	}
	const idealHeights = rowsImages.map( ( row ) => {
		const availW = width - gap * ( row.length + 1 );
		const rowAspect = row.reduce( ( s, im ) => s + im.aspect, 0 );
		return availW / rowAspect;
	} );
	const availH = height - gap * ( rowsImages.length + 1 );
	const idealTotal = idealHeights.reduce( ( s, h ) => s + h, 0 );
	// Never taller than the area (bounds win over aspect fidelity); cap
	// the stretch so sparse collages sit centered instead of distorted.
	const scaleY = Math.min( availH / idealTotal, 1.9 );
	const usedH =
		idealHeights.reduce( ( s, h ) => s + h * scaleY, 0 ) +
		gap * ( rowsImages.length + 1 );
	let y = gap + Math.max( 0, ( height - usedH ) / 2 );
	const cells = [];
	rowsImages.forEach( ( row, r ) => {
		const rowH = idealHeights[ r ] * scaleY;
		let x = gap;
		row.forEach( ( im ) => {
			cells.push( {
				index: im.index,
				x,
				y,
				w: im.aspect * idealHeights[ r ],
				h: rowH,
				rot: 0,
			} );
			x += im.aspect * idealHeights[ r ] + gap;
		} );
		y += rowH + gap;
	} );
	return cells;
}

/** Scattered instant photos: grid base, seeded jitter and tilt per card. */
function polaroidCells( images, opts ) {
	const { width, height, gap, seed } = opts;
	const r = rng( seed >>> 0 || 1 );
	const cols =
		opts.cols > 0
			? Math.min( opts.cols, images.length )
			: autoCols( images.length, width, height );
	const rows = rowCounts( images.length, cols );
	const cellW = ( width - gap * ( cols + 1 ) ) / cols;
	const cellH = ( height - gap * ( rows.length + 1 ) ) / rows.length;
	const margin = gap * 0.8;
	const cells = [];
	let index = 0;
	rows.forEach( ( count, row ) => {
		const rowW = count * cellW + ( count - 1 ) * gap;
		const x0 = ( width - rowW ) / 2;
		for ( let col = 0; col < count; col++ ) {
			const block = {
				x: x0 + col * ( cellW + gap ),
				y: gap + row * ( cellH + gap ),
				w: cellW,
				h: cellH,
			};
			const card = inset( block, margin );
			card.x += ( r() * 2 - 1 ) * margin;
			card.y += ( r() * 2 - 1 ) * margin;
			const rot = ( r() * 2 - 1 ) * 7;
			const pad = card.w * 0.055;
			const capH = card.h * 0.18;
			const photo = {
				x: card.x + pad,
				y: card.y + pad,
				w: card.w - 2 * pad,
				h: card.h - 2 * pad - capH,
			};
			cells.push( {
				index,
				...photo,
				rot,
				frame: card,
				caption: {
					x: photo.x,
					y: photo.y + photo.h,
					w: photo.w,
					h: capH,
				},
			} );
			index++;
		}
	} );
	return cells;
}

/** One justified row on a full-width film strip with sprocket holes. */
function filmstripLayout( images, opts ) {
	const { width, height, gap } = opts;
	const n = images.length;
	const totalAspect = images.reduce( ( s, im ) => s + im.aspect, 0 );
	const availW = width - gap * ( n + 1 );
	let photoH = availW / totalAspect;
	let perfPad = photoH * 0.22;
	const maxStrip = height - 2 * gap;
	if ( photoH + 2 * perfPad > maxStrip ) {
		const scale = maxStrip / ( photoH + 2 * perfPad );
		photoH *= scale;
		perfPad *= scale;
	}
	const rowW =
		images.reduce( ( s, im ) => s + im.aspect * photoH, 0 ) +
		gap * ( n - 1 );
	let x = Math.max( gap, ( width - rowW ) / 2 );
	const y = ( height - photoH ) / 2;
	const cells = images.map( ( im, index ) => {
		const cell = { index, x, y, w: im.aspect * photoH, h: photoH, rot: 0 };
		x += cell.w + gap;
		return cell;
	} );
	const strip = {
		x: 0,
		y: y - perfPad,
		w: width,
		h: photoH + 2 * perfPad,
	};
	const holes = [];
	const s = perfPad * 0.42;
	const pitch = s * 2.4;
	const count = Math.floor( ( width - s ) / pitch );
	const start = ( width - ( ( count - 1 ) * pitch + s ) ) / 2;
	for ( let k = 0; k < count; k++ ) {
		const hx = start + k * pitch;
		holes.push( { x: hx, y: strip.y + ( perfPad - s ) / 2, w: s, h: s } );
		holes.push( {
			x: hx,
			y: strip.y + strip.h - perfPad + ( perfPad - s ) / 2,
			w: s,
			h: s,
		} );
	}
	return { cells, extras: { strip, holes } };
}

/** One cell from an outer block: optional matte frame, photo inset by it. */
function blockCell( index, block, frame ) {
	const inner = frame > 0 ? inset( block, frame ) : block;
	return {
		index,
		rot: 0,
		...( frame > 0 ? { frame: { ...block } } : {} ),
		x: inner.x,
		y: inner.y,
		w: inner.w,
		h: inner.h,
	};
}

const shiftRect = ( r, dx, dy ) => ( { ...r, x: r.x + dx, y: r.y + dy } );

/** Move a cell (and its frame and caption) and renumber it. */
const shiftCell = ( c, dx, dy, di ) => ( {
	...c,
	index: c.index + di,
	x: c.x + dx,
	y: c.y + dy,
	...( c.frame ? { frame: shiftRect( c.frame, dx, dy ) } : {} ),
	...( c.caption ? { caption: shiftRect( c.caption, dx, dy ) } : {} ),
} );

/**
 * Hero (v1.433): the first photo large, the others as a grid beside it on
 * a landscape area, below it on a portrait one.
 */
function heroCells( images, opts ) {
	const { width, height, gap, frame } = opts;
	const n = images.length;
	if ( n < 2 ) {
		return gridCells( images, { ...opts, cols: 1 }, false );
	}
	const share = n > 4 ? 0.62 : 0.6;
	let hero;
	let area;
	if ( width >= height ) {
		const heroW = ( width - 3 * gap ) * share;
		hero = { x: gap, y: gap, w: heroW, h: height - 2 * gap };
		area = { x: gap + heroW, y: 0, w: width - gap - heroW, h: height };
	} else {
		const heroH = ( height - 3 * gap ) * share;
		hero = { x: gap, y: gap, w: width - 2 * gap, h: heroH };
		area = { x: 0, y: gap + heroH, w: width, h: height - gap - heroH };
	}
	const rest = gridCells(
		images.slice( 1 ),
		{ ...opts, width: area.w, height: area.h, cols: 0 },
		false
	).map( ( c ) => shiftCell( c, area.x, area.y, 1 ) );
	return [ blockCell( 0, hero, frame ), ...rest ];
}

/**
 * Bento (v1.433): the area split again and again, always the biggest
 * tile, across or down by its shape, at a seeded ratio. The biggest tile
 * takes the first photo. Shuffle deals new splits.
 */
function bentoCells( images, opts ) {
	const { width, height, gap, frame, seed } = opts;
	const r = rng( ( ( seed || 1 ) * 2246822519 ) >>> 0 || 1 );
	const half = gap / 2;
	const rects = [ { x: half, y: half, w: width - gap, h: height - gap } ];
	const byArea = ( a, b ) => b.w * b.h - a.w * a.h || a.y - b.y || a.x - b.x;
	while ( rects.length < images.length ) {
		rects.sort( byArea );
		const big = rects.shift();
		const shape = big.w / big.h;
		let across = r() < 0.5;
		if ( shape > 1.25 ) {
			across = true;
		} else if ( shape < 0.8 ) {
			across = false;
		}
		const t = 0.4 + r() * 0.2;
		if ( across ) {
			const w1 = big.w * t;
			rects.push(
				{ ...big, w: w1 },
				{ ...big, x: big.x + w1, w: big.w - w1 }
			);
		} else {
			const h1 = big.h * t;
			rects.push(
				{ ...big, h: h1 },
				{ ...big, y: big.y + h1, h: big.h - h1 }
			);
		}
	}
	rects.sort( byArea );
	return rects.map( ( rc, i ) => blockCell( i, inset( rc, half ), frame ) );
}

/** Strips (v1.433): full-height columns on a wide area, rows on a tall one. */
function stripCells( images, opts ) {
	const { width, height, gap, frame } = opts;
	const n = images.length;
	const across = width >= height;
	const size = ( ( across ? width : height ) - gap * ( n + 1 ) ) / n;
	return images.map( ( _, i ) =>
		blockCell(
			i,
			across
				? {
						x: gap + i * ( size + gap ),
						y: gap,
						w: size,
						h: height - 2 * gap,
				  }
				: {
						x: gap,
						y: gap + i * ( size + gap ),
						w: width - 2 * gap,
						h: size,
				  },
			frame
		)
	);
}

/**
 * Circles (v1.433): round photos packed like a honeycomb, every second
 * row half a step to the right, the block centered on the area.
 */
function circleCells( images, opts ) {
	const { width, height, gap, frame } = opts;
	const n = images.length;
	const cols =
		opts.cols > 0 ? Math.min( opts.cols, n ) : autoCols( n, width, height );
	const rows = rowCounts( n, cols );
	const shifted = rows.length > 1;
	const pack = 0.866;
	const byW =
		( width - 2 * gap - ( cols - 1 ) * gap - ( shifted ? gap / 2 : 0 ) ) /
		( cols + ( shifted ? 0.5 : 0 ) );
	const byH =
		( height - 2 * gap - ( rows.length - 1 ) * gap * pack ) /
		( 1 + ( rows.length - 1 ) * pack );
	const d = Math.max( 2, Math.min( byW, byH ) );
	const step = d + gap;
	const fullW = cols * d + ( cols - 1 ) * gap + ( shifted ? step / 2 : 0 );
	const y0 = ( height - ( d + ( rows.length - 1 ) * step * pack ) ) / 2;
	const cells = [];
	let index = 0;
	const baseX = ( width - fullW ) / 2;
	rows.forEach( ( count, row ) => {
		// A short last row is centered on the honeycomb itself: snapped to
		// the nearest lattice position of its row, never between two, so it
		// keeps a full step from the row above.
		const lattice = baseX + ( shifted && row % 2 ? step / 2 : 0 );
		const ideal = ( width - ( count * d + ( count - 1 ) * gap ) ) / 2;
		const x0 = lattice + Math.round( ( ideal - lattice ) / step ) * step;
		for ( let col = 0; col < count; col++ ) {
			const block = {
				x: x0 + col * step,
				y: y0 + row * step * pack,
				w: d,
				h: d,
			};
			cells.push( { ...blockCell( index, block, frame ), round: true } );
			index++;
		}
	} );
	return cells;
}

/**
 * Before / After (v1.433): the first two photos edge to edge, the spacing
 * becomes the divider, a knob on its middle and a badge on each side.
 */
function beforeAfterLayout( images, opts ) {
	const { width, height, gap, frame } = opts;
	if ( images.length < 2 ) {
		return {
			cells: [
				blockCell( 0, { x: 0, y: 0, w: width, h: height }, frame ),
			],
			extras: {},
		};
	}
	const across = width >= height;
	const line = Math.max( 2, gap );
	const halfW = across ? ( width - line ) / 2 : width;
	const halfH = across ? height : ( height - line ) / 2;
	const cells = [
		blockCell( 0, { x: 0, y: 0, w: halfW, h: halfH }, frame ),
		blockCell(
			1,
			across
				? { x: halfW + line, y: 0, w: halfW, h: halfH }
				: { x: 0, y: halfH + line, w: halfW, h: halfH },
			frame
		),
	];
	const unit = Math.min( width, height );
	const knob = unit * 0.075;
	const bh = unit * 0.06;
	const bw = bh * 3.6;
	const pad = unit * 0.035;
	return {
		cells,
		extras: {
			divider: across
				? { x: halfW, y: 0, w: line, h: height }
				: { x: 0, y: halfH, w: width, h: line },
			knob: {
				x: width / 2 - knob / 2,
				y: height / 2 - knob / 2,
				w: knob,
				h: knob,
			},
			badges: [
				{ which: 'before', x: pad, y: pad, w: bw, h: bh },
				across
					? {
							which: 'after',
							x: width - pad - bw,
							y: pad,
							w: bw,
							h: bh,
					  }
					: {
							which: 'after',
							x: pad,
							y: halfH + line + pad,
							w: bw,
							h: bh,
					  },
			],
		},
	};
}

/* ---------------- v20.10.2026: masonry, diagonal, hexagon, split, inset ---------------- */

/** Points -> closed path data, relative to an origin, two decimals. */
const polyPath = ( pts, ox = 0, oy = 0 ) =>
	pts
		.map(
			( [ x, y ], i ) =>
				( i ? 'L ' : 'M ' ) + pn( x - ox ) + ' ' + pn( y - oy )
		)
		.join( ' ' ) + ' Z';

/** The bounding box of points. */
const bbox = ( pts ) => {
	const xs = pts.map( ( p ) => p[ 0 ] );
	const ys = pts.map( ( p ) => p[ 1 ] );
	const x = Math.min( ...xs );
	const y = Math.min( ...ys );
	return { x, y, w: Math.max( ...xs ) - x, h: Math.max( ...ys ) - y };
};

/**
 * Masonry: columns of photos in their own proportion, each placed in the
 * column that is shortest so far, every column then stretched to the full
 * height (the photo crop absorbs the difference) - the column-wise sibling
 * of the justified rows of Mosaic.
 */
function masonryCells( images, opts ) {
	const { width, height, gap, frame } = opts;
	const n = images.length;
	const cols =
		opts.cols > 0
			? Math.min( opts.cols, n )
			: clamp(
					Math.round( Math.sqrt( n * ( width / height ) * 0.8 ) ),
					1,
					n
			  );
	const colW = ( width - gap * ( cols + 1 ) ) / cols;
	const columns = Array.from( { length: cols }, () => ( {
		items: [],
		sum: 0,
	} ) );
	images.forEach( ( im, index ) => {
		const target = columns.reduce(
			( best, c ) => ( c.sum < best.sum ? c : best ),
			columns[ 0 ]
		);
		const hh = colW / clamp( im.aspect || 1, 0.4, 2.5 );
		target.items.push( { index, h: hh } );
		target.sum += hh;
	} );
	const cells = [];
	columns.forEach( ( c, ci ) => {
		if ( ! c.items.length ) {
			return;
		}
		const room = height - gap * ( c.items.length + 1 );
		const k = room / c.sum;
		let y = gap;
		for ( const it of c.items ) {
			const h = it.h * k;
			cells.push(
				blockCell(
					it.index,
					{ x: gap + ci * ( colW + gap ), y, w: colW, h },
					frame
				)
			);
			y += h + gap;
		}
	} );
	return cells.sort( ( a, b ) => a.index - b.index );
}

/**
 * Diagonal: up to four photos side by side, cut apart by slanted lines
 * with the spacing between them. Across on a landscape area, down on a
 * portrait one; the seed flips the slant.
 */
function diagonalCells( images, opts ) {
	const { width, height, gap } = opts;
	const k = Math.min( 4, images.length );
	const across = width >= height;
	const along = across ? width : height;
	const cross = across ? height : width;
	const dir = opts.seed > 1 && 0 === opts.seed % 2 ? -1 : 1;
	// The slant: a tenth of the long side over the full short side, so the
	// cut stays clearly diagonal on a wide banner and on a square.
	const slant = dir * Math.min( along / k / 2, along * 0.1 );
	const half = gap / 2;
	// Line i runs from (b + slant/2) at the top to (b - slant/2) at the bottom.
	const at = ( i, t ) =>
		0 === i ? 0 : i === k ? along : ( i / k ) * along + slant * ( 0.5 - t );
	const cells = [];
	for ( let i = 0; i < k; i++ ) {
		const l0 = at( i, 0 ) + ( i ? half : 0 );
		const l1 = at( i, 1 ) + ( i ? half : 0 );
		const r0 = at( i + 1, 0 ) - ( i < k - 1 ? half : 0 );
		const r1 = at( i + 1, 1 ) - ( i < k - 1 ? half : 0 );
		const pts = across
			? [
					[ l0, 0 ],
					[ r0, 0 ],
					[ r1, cross ],
					[ l1, cross ],
			  ]
			: [
					[ 0, l0 ],
					[ cross, l0 + ( l1 - l0 ) ],
					[ cross, r1 ],
					[ 0, r0 ],
			  ];
		const box = bbox( pts );
		cells.push( {
			index: i,
			rot: 0,
			...box,
			clip: polyPath( pts, box.x, box.y ),
		} );
	}
	return cells;
}

/**
 * Hexagon: the honeycomb of Circles with six-sided cells that interlock,
 * pointy side up; every cell is the photo cut to a hexagon.
 */
function hexagonCells( images, opts ) {
	const { height, frame } = opts;
	// A pointy-top hexagon of width d is 1.155 d tall; leave the honeycomb
	// that room above and below.
	const grown = circleCells( images, {
		...opts,
		height: height / 1.12,
		frame: 0,
	} );
	const dy = ( height - height / 1.12 ) / 2;
	const hex = ( r ) => {
		const hh = r.w * 1.1547;
		const y = r.y + r.h / 2 - hh / 2;
		return {
			x: r.x,
			y,
			w: r.w,
			h: hh,
			pts: [
				[ r.x + r.w / 2, y ],
				[ r.x + r.w, y + hh / 4 ],
				[ r.x + r.w, y + ( 3 * hh ) / 4 ],
				[ r.x + r.w / 2, y + hh ],
				[ r.x, y + ( 3 * hh ) / 4 ],
				[ r.x, y + hh / 4 ],
			],
		};
	};
	return grown.map( ( c ) => {
		const outer = hex( { x: c.x, y: c.y + dy, w: c.w, h: c.h } );
		const inner =
			frame > 0
				? hex( {
						x: c.x + frame,
						y: c.y + dy + frame,
						w: c.w - 2 * frame,
						h: c.h - 2 * frame,
				  } )
				: outer;
		return {
			index: c.index,
			rot: 0,
			x: inner.x,
			y: inner.y,
			w: inner.w,
			h: inner.h,
			clip: polyPath( inner.pts, inner.x, inner.y ),
			...( frame > 0
				? {
						frame: {
							x: outer.x,
							y: outer.y,
							w: outer.w,
							h: outer.h,
							clip: polyPath( outer.pts, outer.x, outer.y ),
						},
				  }
				: {} ),
		};
	} );
}

/**
 * Split: ONE photo across two to six panels (Columns sets how many, three
 * by default) with the spacing between them - a triptych. Panels run across
 * the long side; from the second shuffle on they step up and down a little.
 * It is one photo layer clipped to one shape holding every panel, so the
 * picture moves inside all panels at once.
 */
function splitLayout( images, opts ) {
	const { width, height, gap } = opts;
	const k = clamp( opts.cols > 0 ? opts.cols : 3, 2, 6 );
	const across = width >= height;
	const along = across ? width : height;
	const cross = across ? height : width;
	const panel = ( along - gap * ( k + 1 ) ) / k;
	const r = rng( ( ( opts.seed || 1 ) * 374761393 ) >>> 0 || 1 );
	const stagger = opts.seed > 1 ? cross * 0.08 : 0;
	const rects = [];
	for ( let i = 0; i < k; i++ ) {
		const off = stagger ? ( r() * 2 - 1 ) * stagger : 0;
		const a = gap + i * ( panel + gap );
		const b0 = gap + Math.max( 0, off );
		const b1 = cross - gap - Math.max( 0, -off );
		rects.push(
			across
				? { x: a, y: b0, w: panel, h: b1 - b0 }
				: { x: b0, y: a, w: b1 - b0, h: panel }
		);
	}
	const box = bbox(
		rects.flatMap( ( q ) => [
			[ q.x, q.y ],
			[ q.x + q.w, q.y + q.h ],
		] )
	);
	const clip = rects
		.map( ( q ) =>
			polyPath(
				[
					[ q.x, q.y ],
					[ q.x + q.w, q.y ],
					[ q.x + q.w, q.y + q.h ],
					[ q.x, q.y + q.h ],
				],
				box.x,
				box.y
			)
		)
		.join( ' ' );
	return {
		cells: [ { index: 0, rot: 0, ...box, clip } ],
		extras: { panels: rects },
	};
}

/**
 * Inset: the first photo fills the area, up to four more sit on it as
 * framed prints in a row along one edge (the shuffle walks the edges:
 * bottom, right, top).
 */
function insetCells( images, opts ) {
	const { width, height, gap } = opts;
	const cells = [
		{ index: 0, rot: 0, x: 0, y: 0, w: width, h: height, back: true },
	];
	const rest = images.slice( 1, 5 );
	if ( ! rest.length ) {
		return cells;
	}
	const unit = Math.min( width, height );
	const margin = Math.max( gap, unit * 0.045 );
	const mat = Math.max( opts.frame || 0, unit * 0.012 );
	const side = [ 'bottom', 'right', 'top' ][ ( ( opts.seed || 1 ) - 1 ) % 3 ];
	const rowLike = 'right' !== side;
	const size = unit * ( rest.length > 2 ? 0.27 : 0.34 );
	let boxes = rest.map( ( im ) => {
		const a = clamp( im.aspect || 1, 0.66, 1.5 );
		return a >= 1 ? { w: size, h: size / a } : { w: size * a, h: size };
	} );
	const runOf = ( list ) =>
		list.reduce(
			( sum, b ) => sum + ( rowLike ? b.w : b.h ) + 2 * mat,
			0
		) +
		gap * ( list.length - 1 );
	// Four tall prints down the right edge of a wide picture do not fit at
	// that size: shrink them until the row fits between the margins.
	const room = ( rowLike ? width : height ) - 2 * margin;
	const fixed = 2 * mat * boxes.length + gap * ( boxes.length - 1 );
	if ( runOf( boxes ) > room ) {
		const k = Math.max(
			0.1,
			( room - fixed ) / ( runOf( boxes ) - fixed )
		);
		boxes = boxes.map( ( b ) => ( { w: b.w * k, h: b.h * k } ) );
	}
	const run = runOf( boxes );
	let pos = rowLike ? width - margin - run : height - margin - run;
	boxes.forEach( ( b, i ) => {
		const outerW = b.w + 2 * mat;
		const outerH = b.h + 2 * mat;
		let x;
		let y;
		if ( rowLike ) {
			x = pos;
			y = 'bottom' === side ? height - margin - outerH : margin;
			pos += outerW + gap;
		} else {
			x = width - margin - outerW;
			y = pos;
			pos += outerH + gap;
		}
		cells.push( {
			index: i + 1,
			rot: 0,
			frame: { x, y, w: outerW, h: outerH },
			x: x + mat,
			y: y + mat,
			w: b.w,
			h: b.h,
			inset: true,
		} );
	} );
	return cells;
}

/** Apply a matte frame to plain photo cells (grid handles it inline). */
function applyFrame( cells, frame ) {
	if ( ! ( frame > 0 ) ) {
		return cells;
	}
	return cells.map( ( c ) => ( {
		...c,
		frame: {
			x: c.x - frame,
			y: c.y - frame,
			w: c.w + 2 * frame,
			h: c.h + 2 * frame,
		},
	} ) );
}

/** Rotate a point around a center, degrees. */
const rotAround = ( px, py, cx, cy, deg ) => {
	const rad = ( deg * Math.PI ) / 180;
	const cos = Math.cos( rad );
	const sin = Math.sin( rad );
	const dx = px - cx;
	const dy = py - cy;
	return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
};

/** Re-center a rect so its center lands on the rotated position. */
const pivotRect = ( rect, cx, cy, deg ) => {
	const c = rotAround(
		rect.x + rect.w / 2,
		rect.y + rect.h / 2,
		cx,
		cy,
		deg
	);
	return { x: c.x - rect.w / 2, y: c.y - rect.h / 2, w: rect.w, h: rect.h };
};

/** "IMG_0042.JPG" -> "IMG 0042": strip the extension, unglue the words. */
export function captionFromName( name ) {
	return String( name || '' )
		.replace( /\.[a-z0-9]+$/i, '' )
		.replace( /[-_]+/g, ' ' )
		.replace( /\s+/g, ' ' )
		.trim();
}

const pn = ( v ) => Math.round( v * 100 ) / 100;

/**
 * Turn a layout into flat layer specs (paint order bottom to top). The
 * dialog maps kinds to real layers: card/strip/holes -> shape, photo ->
 * image, caption -> text. Pure and Jest-testable, like beautify.js.
 *
 * @param {Array}  items [{ src, name, width, height }].
 * @param {Object} opts  collageLayout opts + { radius, frameColor,
 *                       captions, shadow 0-100, backdrop color|'' }.
 * @return {Array} Specs [{ kind, x, y, w, h, rot, ... }].
 */
export function collageLayerSpecs( items, opts ) {
	const images = items.map( ( it ) => ( {
		aspect: it.width > 0 && it.height > 0 ? it.width / it.height : 1,
	} ) );
	const { cells, extras } = collageLayout( images, opts );
	const specs = [];
	const isPolaroid = opts.layout === 'polaroid';
	const radius = opts.radius ?? 0;
	const frameColor = opts.frameColor || '#ffffff';
	const withCaptions = opts.captions !== false;
	const shadow = Math.max( 0, Math.min( 100, opts.shadow || 0 ) );
	if ( opts.backdrop ) {
		specs.push( {
			kind: 'backdrop',
			x: 0,
			y: 0,
			w: opts.width,
			h: opts.height,
			rot: 0,
			fill: opts.backdrop,
		} );
	}
	if ( extras.strip ) {
		const strip = extras.strip;
		specs.push( {
			kind: 'strip',
			...strip,
			rot: 0,
			fill: '#14171c',
			radius: pn( Math.min( 16, strip.h * 0.05 ) ),
		} );
		const d = ( extras.holes || [] )
			.map( ( hole ) => {
				const x = pn( hole.x - strip.x );
				const y = pn( hole.y - strip.y );
				const xw = pn( x + hole.w );
				const yh = pn( y + hole.h );
				return `M ${ x } ${ y } L ${ xw } ${ y } L ${ xw } ${ yh } L ${ x } ${ yh } Z`;
			} )
			.join( ' ' );
		specs.push( {
			kind: 'holes',
			x: strip.x,
			y: strip.y,
			w: strip.w,
			h: strip.h,
			rot: 0,
			fill: '#f4f6f8',
			pathD: d,
		} );
	}
	cells.forEach( ( cell ) => {
		const item = items[ cell.index ];
		const tilt = opts.__noTilt ? 0 : cell.rot || 0;
		const card = cell.frame;
		const cx = card ? card.x + card.w / 2 : cell.x + cell.w / 2;
		const cy = card ? card.y + card.h / 2 : cell.y + cell.h / 2;
		let cardRadius = isPolaroid ? 2 : radius;
		let photoRadius = isPolaroid ? 0 : radius;
		if ( cell.round ) {
			cardRadius = card ? Math.min( card.w, card.h ) / 2 : 0;
			photoRadius = Math.min( cell.w, cell.h ) / 2;
		}
		// A print on a background photo always lifts off it a little.
		const lift = cell.inset ? Math.max( shadow, 30 ) : shadow;
		if ( card ) {
			const { clip: cardClip, ...cardRect } = card;
			specs.push( {
				kind: 'card',
				...cardRect,
				rot: tilt,
				fill: frameColor,
				radius: cardClip ? 0 : pn( cardRadius ),
				index: cell.index,
				...( cardClip ? { pathD: cardClip } : {} ),
				...( lift ? { shadow: lift } : {} ),
			} );
		}
		// A photo cut to a shape (Diagonal, Hexagon, Split, 20.10.2026):
		// the shape as a layer, the photo clipped to it above - both stay
		// editable, and the photo can still be moved inside its shape.
		if ( cell.clip ) {
			specs.push( {
				kind: 'mask',
				x: cell.x,
				y: cell.y,
				w: cell.w,
				h: cell.h,
				rot: tilt,
				fill: frameColor,
				pathD: cell.clip,
				index: cell.index,
				...( lift && ! card ? { shadow: lift } : {} ),
			} );
		}
		const { clip, back, inset: isInset, ...photoCell } = cell;
		specs.push( {
			kind: 'photo',
			...pivotRect( photoCell, cx, cy, tilt ),
			rot: tilt,
			src: item.src,
			natW: item.width || cell.w,
			natH: item.height || cell.h,
			radius: clip || back ? 0 : pn( photoRadius ),
			index: cell.index,
			...photoFocus( item, cell, opts ),
			...( clip ? { clip, clipped: true } : {} ),
			...( lift && ! card && ! clip && ! back ? { shadow: lift } : {} ),
		} );
		if ( cell.caption && withCaptions ) {
			specs.push( {
				kind: 'caption',
				...pivotRect( cell.caption, cx, cy, tilt ),
				rot: tilt,
				text: captionFromName( item.name ),
				index: cell.index,
			} );
		}
	} );
	if ( extras.divider ) {
		specs.push( {
			kind: 'divider',
			...extras.divider,
			rot: 0,
			fill: '#ffffff',
		} );
		specs.push( {
			kind: 'knob',
			...extras.knob,
			rot: 0,
			fill: '#ffffff',
			radius: pn( extras.knob.w / 2 ),
			shadow: 40,
		} );
	}
	if ( extras.badges && withCaptions ) {
		for ( const badge of extras.badges ) {
			const { which, ...rect } = badge;
			specs.push( {
				kind: 'badge',
				...rect,
				rot: 0,
				fill: '#0c0e129e',
				radius: pn( rect.h / 2 ),
			} );
			specs.push( {
				kind: 'badgeText',
				...rect,
				rot: 0,
				text:
					'before' === which
						? __( 'Before', 'wunderpaint' )
						: __( 'After', 'wunderpaint' ),
			} );
		}
	}
	return specs;
}

/**
 * Lay out a collage.
 *
 * @param {Array}  images List of { aspect } (aspect = w / h).
 * @param {Object} opts   { width, height, layout, gap, cols, seed, frame }.
 * @return {Object} { cells, extras } - cells in target pixels, extras
 *                  carries layout-wide decor (filmstrip strip + holes).
 */
export function collageLayout( images, opts ) {
	const o = {
		layout: 'grid',
		gap: 16,
		cols: 0,
		seed: 1,
		frame: 0,
		...opts,
	};
	if ( ! images.length ) {
		return { cells: [], extras: {} };
	}
	// Shuffle (v1.376): seed 1 keeps the pick order, every re-roll deals
	// a seeded permutation - so the button does something in EVERY
	// layout, not only in the polaroid scatter. Layouts see positions;
	// cell.index is mapped back to the original image afterwards.
	let perm = null;
	if ( o.seed > 1 ) {
		perm = images.map( ( _, i ) => i );
		const r = rng( ( o.seed * 2654435761 ) >>> 0 || 1 );
		for ( let i = perm.length - 1; i > 0; i-- ) {
			const j = Math.floor( r() * ( i + 1 ) );
			[ perm[ i ], perm[ j ] ] = [ perm[ j ], perm[ i ] ];
		}
		images = perm.map( ( k ) => images[ k ] );
	}
	const result = layoutCells( images, o );
	if ( perm ) {
		result.cells.forEach( ( c ) => {
			c.index = perm[ c.index ];
		} );
	}
	return result;
}

/** The per-layout dispatch, over (possibly permuted) images. */
function layoutCells( images, o ) {
	switch ( o.layout ) {
		case 'mosaic':
			return {
				cells: applyFrame( mosaicCells( images, o ), o.frame ),
				extras: {},
			};
		case 'polaroid':
			return { cells: polaroidCells( images, o ), extras: {} };
		case 'filmstrip': {
			const { cells, extras } = filmstripLayout( images, o );
			return { cells, extras };
		}
		case 'contact':
			return { cells: gridCells( images, o, true ), extras: {} };
		case 'hero':
			return { cells: heroCells( images, o ), extras: {} };
		case 'bento':
			return { cells: bentoCells( images, o ), extras: {} };
		case 'strips':
			return { cells: stripCells( images, o ), extras: {} };
		case 'circles':
			return { cells: circleCells( images, o ), extras: {} };
		case 'beforeafter':
			return beforeAfterLayout( images, o );
		case 'masonry':
			return { cells: masonryCells( images, o ), extras: {} };
		case 'diagonal':
			return { cells: diagonalCells( images, o ), extras: {} };
		case 'hexagon':
			return { cells: hexagonCells( images, o ), extras: {} };
		case 'split':
			return splitLayout( images, o );
		case 'inset':
			return { cells: insetCells( images, o ), extras: {} };
		case 'grid':
		default:
			return { cells: gridCells( images, o, false ), extras: {} };
	}
}

/**
 * The crop of one photo in its cell (20.10.2026): a crop chosen by hand
 * wins; otherwise, with `opts.faces` not off, the faces found in it stay
 * in frame - worked out for this cell, so they stay in frame in every
 * layout; otherwise the middle (no focus).
 *
 * @param {Object} item A pick ({ focus, faces, width, height }).
 * @param {Object} cell Its cell ({ w, h }).
 * @param {Object} opts collageLayerSpecs options.
 * @return {Object} { focus } or nothing.
 */
function photoFocus( item, cell, opts ) {
	if ( item.focus ) {
		return { focus: item.focus };
	}
	if ( false !== opts.faces && item.faces && item.faces.length ) {
		const focus = faceAnchor(
			item.faces,
			cell.w,
			cell.h,
			item.width || cell.w,
			item.height || cell.h
		);
		if ( focus ) {
			return { focus, faceFocus: true };
		}
	}
	return {};
}

/**
 * Where a photo's crop sits after a drag inside its frame (20.10.2026).
 * A photo fills its frame the way an image layer on "cover" does; a drag
 * moves the picture under the frame, so the focus moves against the
 * pointer by the share of the picture that is cropped away. An axis with
 * nothing cropped away keeps its focus.
 *
 * @param {Object|null} focus { x, y } from 0 to 1, or null for the middle.
 * @param {Object}      spec  The photo spec ({ w, h, natW, natH }).
 * @param {number}      dx    Drag in document pixels along the photo's width.
 * @param {number}      dy    Drag along its height.
 * @return {Object} The new { x, y }.
 */
export function panFocus( focus, spec, dx, dy ) {
	const fx = focus && 'number' === typeof focus.x ? focus.x : 0.5;
	const fy = focus && 'number' === typeof focus.y ? focus.y : 0.5;
	const iw = spec.natW || spec.w;
	const ih = spec.natH || spec.h;
	if ( ! iw || ! ih || ! spec.w || ! spec.h ) {
		return { x: fx, y: fy };
	}
	const s = Math.max( spec.w / iw, spec.h / ih );
	const spareX = iw * s - spec.w;
	const spareY = ih * s - spec.h;
	return {
		x: spareX > 0.5 ? clamp( fx - dx / spareX, 0, 1 ) : fx,
		y: spareY > 0.5 ? clamp( fy - dy / spareY, 0, 1 ) : fy,
	};
}

/**
 * The layer list with a collage group in it (19.10.2026): a new one on top
 * of the stack, an edited one in place of the old - its children and any
 * nested layers removed, the new parts and the group (which keeps the old
 * id, so a parent's child list and the selection stay valid) where the old
 * ones began.
 *
 * @param {Array}  layers  The document's flat layer list.
 * @param {Array}  parts   The new child layers.
 * @param {Object} group   The new group.
 * @param {string} oldId   The group being replaced, if any.
 * @return {Array} The new layer list.
 */
export function placeCollage( layers, parts, group, oldId = null ) {
	if ( ! oldId || ! layers.some( ( l ) => l.id === oldId ) ) {
		return [ ...layers, ...parts, group ];
	}
	const removed = new Set( [ oldId ] );
	let grew = true;
	while ( grew ) {
		grew = false;
		for ( const l of layers ) {
			if (
				l.parent &&
				removed.has( l.parent ) &&
				! removed.has( l.id )
			) {
				removed.add( l.id );
				grew = true;
			}
		}
	}
	const first = layers.findIndex( ( l ) => removed.has( l.id ) );
	const at = layers
		.slice( 0, first )
		.filter( ( l ) => ! removed.has( l.id ) ).length;
	const next = layers.filter( ( l ) => ! removed.has( l.id ) );
	next.splice( at, 0, ...parts, group );
	return next;
}
