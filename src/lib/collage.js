/**
 * Collage & Photo Grid layout engine (v1.375.0): pure, seeded geometry.
 * Input is a list of image aspects plus a target area; output is cell
 * specs in target pixels, ready to become editable layers. House rule:
 * no Math.random in engines - identical seed, identical collage.
 */

import { __ } from '@wordpress/i18n';

import { rng } from './seeded';

export const LAYOUTS = [
	{ id: 'grid', label: __( 'Grid', 'wunderpaint' ) },
	{ id: 'mosaic', label: __( 'Mosaic', 'wunderpaint' ) },
	{ id: 'polaroid', label: __( 'Polaroid', 'wunderpaint' ) },
	{ id: 'filmstrip', label: __( 'Filmstrip', 'wunderpaint' ) },
	{ id: 'contact', label: __( 'Contact sheet', 'wunderpaint' ) },
];

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
 *                       captions }.
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
		if ( card ) {
			specs.push( {
				kind: 'card',
				...card,
				rot: tilt,
				fill: frameColor,
				radius: isPolaroid ? 2 : radius,
				index: cell.index,
			} );
		}
		specs.push( {
			kind: 'photo',
			...pivotRect( cell, cx, cy, tilt ),
			rot: tilt,
			src: item.src,
			natW: item.width || cell.w,
			natH: item.height || cell.h,
			radius: isPolaroid ? 0 : radius,
			index: cell.index,
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
		case 'grid':
		default:
			return { cells: gridCells( images, o, false ), extras: {} };
	}
}
