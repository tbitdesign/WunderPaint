/**
 * The poster layout engine: where the art sits and where every text block
 * goes, for any sheet size. Pure - the studio hands in a measure function
 * (canvas measureText with the real fonts), tests hand in an estimate.
 *
 * Text blocks become editable text layers, so the wrap here MIRRORS the
 * editor's own (text-metrics.js wrapLine: greedy on spaces, letter spacing
 * added per gap), and a block's height is the editor's box floor
 * (advances + 1.3 x size) - the inserted layer then never grows on edit
 * and the preview shows exactly what lands on the canvas.
 */

export const LAYOUTS = [
	'auto',
	'classic',
	'framed',
	'minimal',
	'split',
	'art',
];

/**
 * Greedy word wrap, the editor's way.
 *
 * @param {Function} measure ( text ) => width in px.
 * @param {string}   text    Text, may hold newlines.
 * @param {number}   maxW    Box width.
 * @param {number}   spacing Letter spacing in px.
 * @return {string[]} Lines.
 */
export function wrapText( measure, text, maxW, spacing = 0 ) {
	const width = ( s ) =>
		measure( s ) + spacing * Math.max( 0, [ ...s ].length - 1 );
	const out = [];
	for ( const raw of String( text ).split( '\n' ) ) {
		let current = '';
		for ( const word of raw.split( ' ' ) ) {
			const candidate = current ? current + ' ' + word : word;
			if ( width( candidate ) > maxW && current ) {
				out.push( current );
				current = word;
			} else {
				current = candidate;
			}
		}
		out.push( current );
	}
	return out;
}

/** The height the editor gives a text box of n lines (its floor). */
export function blockHeight( lines, size, lineHeight ) {
	return Math.max( 1, lines ) > 1
		? ( lines - 1 ) * size * lineHeight + size * 1.3
		: size * 1.3;
}

/** Which layout a sheet gets when the user leaves it on auto. */
export function resolveLayout( mode, w, h ) {
	if ( mode && 'auto' !== mode && LAYOUTS.includes( mode ) ) {
		return mode;
	}
	return w / h > 1.28 ? 'split' : 'classic';
}

/**
 * Lay out a poster.
 *
 * @param {Object}   o
 * @param {number}   o.w         Sheet width.
 * @param {number}   o.h         Sheet height.
 * @param {string}   o.mode      Layout key (auto resolves by aspect).
 * @param {Object}   o.frame     { inset, top, bottom } from frameMetrics.
 * @param {number}   [o.artScale] 0.5..1, share of the free room the art takes.
 * @param {Array}    o.blocks    Ordered text blocks: { role, text, size,
 *   lineHeight, spacing, place: 'top'|'bottom', maxWidth (fraction of the
 *   column), optional (droppable when room runs out) }. Sizes are in px.
 * @param {Function} o.measure   ( text, block ) => width in px.
 * @return {Object} { mode, art: { x, y, s }, blocks: [ { ...block, x, y,
 *   w, h, lines, align } ] }.
 */
export function layoutPoster( o ) {
	const { w, h, frame } = o;
	const mode = resolveLayout( o.mode, w, h );
	const artScale = Math.max( 0.4, Math.min( 1, o.artScale ?? 1 ) );
	const u = Math.min( w, h );
	const box = {
		x: frame.inset,
		y: frame.top,
		w: w - 2 * frame.inset,
		h: h - frame.top - frame.bottom,
	};

	if ( 'art' === mode ) {
		const s = Math.min( w, h ) * 0.86 * artScale;
		return {
			mode,
			art: { x: ( w - s ) / 2, y: ( h - s ) / 2, s },
			blocks: [],
		};
	}

	const source = ( o.blocks || [] ).filter(
		( b ) => b && String( b.text || '' ).trim()
	);

	if ( 'split' === mode ) {
		return layoutSplit( {
			u,
			box,
			artScale,
			source,
			measure: o.measure,
		} );
	}

	const minArt = u * ( 'minimal' === mode ? 0.5 : 0.36 );
	const gap = u * 0.018;
	const artGap = u * 0.045;
	let blocks = source;
	let result = null;
	for ( let attempt = 0; attempt < 7; attempt++ ) {
		const f = [ 1, 0.92, 0.85, 0.78, 0.78, 0.72, 0.66 ][ attempt ];
		if ( 4 === attempt ) {
			blocks = blocks.filter( ( b ) => 'data' !== b.role );
		}
		if ( 5 === attempt ) {
			blocks = blocks.filter( ( b ) => ! b.optional );
		}
		const laid = blocks.map( ( b ) =>
			measureBlock( b, f, box.w, o.measure, 'center' )
		);
		const top =
			'framed' === mode ? laid.filter( ( b ) => 'top' === b.place ) : [];
		const bottom = laid.filter( ( b ) => ! top.includes( b ) );
		const stack = ( list ) =>
			list.reduce( ( s, b ) => s + b.h, 0 ) +
			Math.max( 0, list.length - 1 ) * gap;
		const tTop = stack( top );
		const tBottom = stack( bottom );
		const room =
			box.h -
			tTop -
			tBottom -
			( top.length ? artGap : 0 ) -
			( bottom.length ? artGap : 0 );
		const s = Math.max( 0, Math.min( box.w, room ) ) * artScale;
		result = { s, top, bottom, tTop, tBottom };
		if ( s >= minArt ) {
			break;
		}
	}
	const { s, top, bottom, tTop, tBottom } = result;
	const total =
		tTop +
		( top.length ? artGap : 0 ) +
		s +
		( bottom.length ? artGap : 0 ) +
		tBottom;
	let y = box.y + Math.max( 0, ( box.h - total ) / 2 );
	const place = ( list ) =>
		list.map( ( b ) => {
			const out = { ...b, x: w / 2 - b.w / 2, y };
			y += b.h + gap;
			return out;
		} );
	const placedTop = place( top );
	if ( top.length ) {
		y += artGap - gap;
	}
	const art = { x: ( w - s ) / 2, y, s };
	y += s + ( bottom.length ? artGap : 0 );
	const placedBottom = place( bottom );
	return { mode, art, blocks: [ ...placedTop, ...placedBottom ] };
}

/** Measure one block at a font scale f into a column of width colW. */
function measureBlock( b, f, colW, measure, align ) {
	const size = b.size * f;
	const spacing = ( b.spacing || 0 ) * f;
	const maxW = colW * ( b.maxWidth || 1 );
	const lines = wrapText(
		( s ) => measure( s, { ...b, size } ),
		b.text,
		maxW,
		spacing
	);
	const lh = b.lineHeight || 1.2;
	// The box is the full column width so centred and left text line up
	// with the art, and the user has room to type. A tight block (the
	// title, whose foil gradient spans the box) hugs its widest line; the
	// editor's greedy wrap breaks exactly where it did at the full width,
	// because every break already overflowed the wider box.
	let w = maxW;
	if ( b.tight ) {
		const width = ( s ) =>
			measure( s, { ...b, size } ) +
			spacing * Math.max( 0, [ ...s ].length - 1 );
		const widest = Math.max( 0, ...lines.map( width ) );
		w = Math.min( maxW, Math.ceil( widest + size * 0.2 ) );
	}
	return {
		...b,
		size,
		spacing,
		w,
		h: blockHeight( lines.length, size, lh ),
		lines,
		align,
	};
}

/** Landscape: art on the left, a left-aligned text column on the right. */
function layoutSplit( { u, box, artScale, source, measure } ) {
	const colGap = u * 0.08;
	const artCol = Math.min( box.h, box.w * 0.5 );
	const s = artCol * artScale;
	const textX = box.x + artCol + colGap;
	const colW = box.x + box.w - textX;
	const gap = u * 0.022;
	let blocks = source;
	let laid = [];
	for ( let attempt = 0; attempt < 6; attempt++ ) {
		const f = [ 1, 0.9, 0.82, 0.75, 0.75, 0.68 ][ attempt ];
		if ( 4 === attempt ) {
			blocks = blocks.filter( ( b ) => ! b.optional );
		}
		laid = blocks.map( ( b ) =>
			measureBlock( b, f, colW, measure, 'left' )
		);
		const total =
			laid.reduce( ( t, b ) => t + b.h, 0 ) +
			Math.max( 0, laid.length - 1 ) * gap;
		if ( total <= box.h ) {
			break;
		}
	}
	const total =
		laid.reduce( ( t, b ) => t + b.h, 0 ) +
		Math.max( 0, laid.length - 1 ) * gap;
	let y = box.y + Math.max( 0, ( box.h - total ) / 2 );
	const placed = laid.map( ( b ) => {
		// Keep the wrap width as the box width: the editor re-wraps at the
		// box, so a wider box would break the lines differently.
		const out = { ...b, x: textX, y };
		y += b.h + gap;
		return out;
	} );
	return {
		mode: 'split',
		art: {
			x: box.x + ( artCol - s ) / 2,
			y: box.y + ( box.h - s ) / 2,
			s,
		},
		blocks: placed,
	};
}

/** A rough measure for tests and hosts without canvas text metrics. */
export function estimateWidth( text, block ) {
	let wsum = 0;
	for ( const ch of String( text ) ) {
		wsum += /[A-Z0-9]/.test( ch ) ? 0.64 : /\s/.test( ch ) ? 0.28 : 0.52;
	}
	return wsum * block.size;
}
