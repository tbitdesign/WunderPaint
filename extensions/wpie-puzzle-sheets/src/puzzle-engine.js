/**
 * Puzzle Sheets render engine: word search, shaped mazes, sudoku,
 * criss-cross word grids, number cryptograms and addition pyramids -
 * with matching solution sheets. Pure module, node-testable.
 */

const makeCanvas = ( like, w, h ) => {
	const c =
		'undefined' !== typeof document
			? document.createElement( 'canvas' )
			: new like.constructor( w, h );
	c.width = w;
	c.height = h;
	return c;
};

/* ------------------------- palettes and typography ------------------------ */

export const PALETTES = [
	{
		id: 'party',
		label: 'Party',
		colors: [
			'#f94144',
			'#f3722c',
			'#f8961e',
			'#f9c74f',
			'#90be6d',
			'#43aa8b',
			'#577590',
		],
	},
	{
		id: 'pastel',
		label: 'Pastel',
		colors: [
			'#ffd6e0',
			'#ffef9f',
			'#c1fba4',
			'#7bf1a8',
			'#a5d8ff',
			'#d0bfff',
		],
	},
	{
		id: 'gold',
		label: 'Gold & Black',
		colors: [ '#101010', '#d9a441', '#f5e6c4', '#8a5a1c' ],
	},
	{
		id: 'ocean',
		label: 'Ocean',
		colors: [ '#0b7285', '#1098ad', '#66d9e8', '#e3fafc' ],
	},
	{
		id: 'blush',
		label: 'Blush',
		colors: [ '#c94f6d', '#e58aa4', '#f7d6de', '#6d2136' ],
	},
	{
		id: 'forest',
		label: 'Forest',
		colors: [ '#2b9348', '#80b918', '#eeef20', '#007f5f' ],
	},
	{
		id: 'candy',
		label: 'Candy',
		colors: [ '#f9a8d4', '#e879f9', '#818cf8', '#38bdf8' ],
	},
	{
		id: 'sunset',
		label: 'Sunset',
		colors: [ '#ffd27a', '#ff7e5f', '#c2427b', '#7a2948' ],
	},
	{
		id: 'mono',
		label: 'Black & White',
		colors: [ '#111418', '#4a4f57', '#9aa0a8', '#e8eaee' ],
	},
	{
		id: 'noel',
		label: 'Christmas',
		colors: [ '#b3212b', '#1f6f43', '#f5e6c4', '#8a5a1c' ],
	},
];

export const paletteById = ( id ) =>
	PALETTES.find( ( p ) => p.id === id ) || PALETTES[ 0 ];

/**
 * Effective color list: custom colors win (a single one counts), then
 * a brand kit, then the chosen palette preset.
 */
export function colorsFor( opts = {} ) {
	const valid = ( c ) => /^#[0-9a-f]{6}$/i.test( String( c ) );
	const custom = ( opts.customColors || [] ).filter( valid );
	if ( custom.length >= 1 ) {
		return custom;
	}
	const brand = ( opts.brandColors || [] ).filter( valid );
	if ( brand.length >= 2 ) {
		return brand;
	}
	return paletteById( opts.paletteId ).colors;
}

const famFor = ( opts ) =>
	opts && opts.font ? `"${ opts.font }", sans-serif` : 'sans-serif';
const tscale = ( opts ) =>
	Math.max( 60, Math.min( 160, ( opts && opts.textScale ) || 100 ) ) / 100;
export const splitLines = ( s, maxLines = 3 ) =>
	String( s || '' )
		.split( /\r?\n/ )
		.map( ( l ) => l.trim() )
		.filter( Boolean )
		.slice( 0, maxLines );

// Accent color (titles, frames, word-bank deco). Ink stays dark for
// print-friendly puzzle content.
const accentOf = ( opts ) =>
	( opts && opts.colors && opts.colors[ 0 ] ) || '#26292e';
const INK = '#26292e';
const SOLVE = '#2f9e44';

// Sheet title: up to two centered lines in the accent color. Returns
// the vertical space it occupies.
const titleBlock = ( opts ) => {
	const lines = splitLines( opts && opts.title, 2 );
	const px = Math.round( 40 * tscale( opts ) );
	const lh = Math.round( px * 1.22 );
	return { lines, px, lh, h: lines.length ? lines.length * lh + 24 : 0 };
};
const drawTitle = ( g, tb, opts, cx, y0 ) => {
	if ( ! tb.lines.length ) {
		return;
	}
	g.save();
	g.fillStyle = accentOf( opts );
	g.font = `700 ${ tb.px }px ${ famFor( opts ) }`;
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	tb.lines.forEach( ( ln, i ) =>
		g.fillText( ln, cx, y0 + tb.lh / 2 + i * tb.lh )
	);
	g.restore();
};

/** Deterministic mulberry32 PRNG. */
export function rng( seed ) {
	let a = seed >>> 0 || 1;
	return function () {
		a |= 0;
		a = ( a + 0x6d2b79f5 ) | 0;
		let t = Math.imul( a ^ ( a >>> 15 ), 1 | a );
		t = ( t + Math.imul( t ^ ( t >>> 7 ), 61 | t ) ) ^ t;
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;
	};
}

/* ------------------------------- word search ------------------------------ */

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Place words into a letter grid.
 *
 * @param {Array}  words Raw word list.
 * @param {Object} opts  { size (10..22), hard (8 directions + reverse),
 *                         seed }.
 * @return {Object} { grid, size, placed: [{word, x, y, dx, dy}], skipped }
 */
export function buildWordSearch( words, opts = {} ) {
	const size = Math.max( 8, Math.min( 22, opts.size || 14 ) );
	const rand = rng( opts.seed || 7 );
	const clean = Array.from(
		new Set(
			( words || [] )
				.map( ( w ) =>
					String( w )
						.toUpperCase()
						.replace( /[^A-ZÄÖÜ]/g, '' )
						.replace( /Ä/g, 'AE' )
						.replace( /Ö/g, 'OE' )
						.replace( /Ü/g, 'UE' )
				)
				.filter( ( w ) => w.length >= 3 && w.length <= size )
		)
	).slice( 0, 20 );
	const dirs = opts.hard
		? [
				[ 1, 0 ],
				[ 0, 1 ],
				[ 1, 1 ],
				[ 1, -1 ],
				[ -1, 0 ],
				[ 0, -1 ],
				[ -1, -1 ],
				[ -1, 1 ],
		  ]
		: [
				[ 1, 0 ],
				[ 0, 1 ],
				[ 1, 1 ],
		  ];
	const grid = Array.from( { length: size }, () =>
		new Array( size ).fill( '' )
	);
	const placed = [];
	const skipped = [];
	// Longest first: they are the hardest to fit.
	clean.sort( ( a, b ) => b.length - a.length );
	for ( const word of clean ) {
		let done = false;
		for ( let tries = 0; tries < 220 && ! done; tries++ ) {
			const [ dx, dy ] = dirs[ Math.floor( rand() * dirs.length ) ];
			const maxX =
				dx > 0
					? size - word.length
					: dx < 0
					? word.length - 1
					: size - 1;
			const minX = dx < 0 ? word.length - 1 : 0;
			const maxY =
				dy > 0
					? size - word.length
					: dy < 0
					? word.length - 1
					: size - 1;
			const minY = dy < 0 ? word.length - 1 : 0;
			if ( maxX < minX || maxY < minY ) {
				continue;
			}
			const x0 = minX + Math.floor( rand() * ( maxX - minX + 1 ) );
			const y0 = minY + Math.floor( rand() * ( maxY - minY + 1 ) );
			let ok = true;
			for ( let i = 0; i < word.length; i++ ) {
				const cell = grid[ y0 + dy * i ][ x0 + dx * i ];
				if ( cell && cell !== word[ i ] ) {
					ok = false;
					break;
				}
			}
			if ( ! ok ) {
				continue;
			}
			for ( let i = 0; i < word.length; i++ ) {
				grid[ y0 + dy * i ][ x0 + dx * i ] = word[ i ];
			}
			placed.push( { word, x: x0, y: y0, dx, dy } );
			done = true;
		}
		if ( ! done ) {
			skipped.push( word );
		}
	}
	for ( let y = 0; y < size; y++ ) {
		for ( let x = 0; x < size; x++ ) {
			if ( ! grid[ y ][ x ] ) {
				grid[ y ][ x ] = ALPHA[ Math.floor( rand() * 26 ) ];
			}
		}
	}
	return { grid, size, placed, skipped };
}

/**
 * Render the word-search sheet (or its solution).
 *
 * @param {Object} like Canvas-like.
 * @param {Object} ws   From buildWordSearch.
 * @param {Object} opts { solution (highlight placements), title, colors,
 *                        font, textScale }.
 * @return {HTMLCanvasElement}
 */
export function renderWordSearch( like, ws, opts = {} ) {
	const { grid, size, placed } = ws;
	const CELL = 46;
	const M = 60;
	const tb = titleBlock( opts );
	const top = M + tb.h;
	const gridPx = size * CELL;
	const listCols = 3;
	const listRows = Math.ceil( placed.length / listCols );
	const listLh = Math.round( 34 * tscale( opts ) );
	const c = makeCanvas(
		like,
		gridPx + M * 2,
		top + gridPx + M + 70 + listRows * listLh
	);
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, c.width, c.height );
	drawTitle( g, tb, opts, c.width / 2, M - 16 );
	// Solution highlights under the letters.
	if ( opts.solution ) {
		g.strokeStyle = 'rgba(46, 125, 50, 0.85)';
		g.lineWidth = CELL * 0.72;
		g.lineCap = 'round';
		g.globalAlpha = 0.35;
		for ( const p of placed ) {
			const x0 = M + p.x * CELL + CELL / 2;
			const y0 = top + p.y * CELL + CELL / 2;
			const x1 = x0 + p.dx * ( p.word.length - 1 ) * CELL;
			const y1 = y0 + p.dy * ( p.word.length - 1 ) * CELL;
			g.beginPath();
			g.moveTo( x0, y0 );
			g.lineTo( x1, y1 );
			g.stroke();
		}
		g.globalAlpha = 1;
	}
	// The letter grid, framed in the accent color.
	g.strokeStyle = accentOf( opts );
	g.lineWidth = 2.4;
	g.strokeRect( M + 0.5, top + 0.5, gridPx, gridPx );
	g.fillStyle = INK;
	g.font = `600 ${ Math.round( CELL * 0.52 ) }px monospace`;
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	for ( let y = 0; y < size; y++ ) {
		for ( let x = 0; x < size; x++ ) {
			g.fillText(
				grid[ y ][ x ],
				M + x * CELL + CELL / 2,
				top + y * CELL + CELL / 2
			);
		}
	}
	// Word list with accent bullets.
	const ly = top + gridPx + 44;
	g.font = `600 ${ Math.round( 17 * tscale( opts ) ) }px ${ famFor( opts ) }`;
	g.textAlign = 'left';
	const accent = accentOf( opts );
	placed
		.map( ( p ) => p.word )
		.sort()
		.forEach( ( w, i ) => {
			const col = i % listCols;
			const row = Math.floor( i / listCols );
			const lx = M + col * ( ( gridPx - 20 ) / listCols );
			g.fillStyle = accent;
			g.beginPath();
			g.arc( lx + 5, ly + row * listLh - 5, 5, 0, Math.PI * 2 );
			g.fill();
			g.fillStyle = '#31353b';
			g.fillText( w, lx + 18, ly + row * listLh );
		} );
	return c;
}

/* ---------------------------------- maze ---------------------------------- */

const HEART_SEGS = [
	[
		[ 0.5, 0.91 ],
		[ 0.24, 0.66 ],
		[ 0.1, 0.52 ],
		[ 0.1, 0.36 ],
	],
	[
		[ 0.1, 0.36 ],
		[ 0.1, 0.23 ],
		[ 0.2, 0.13 ],
		[ 0.33, 0.13 ],
	],
	[
		[ 0.33, 0.13 ],
		[ 0.41, 0.13 ],
		[ 0.47, 0.17 ],
		[ 0.5, 0.25 ],
	],
	[
		[ 0.5, 0.25 ],
		[ 0.53, 0.17 ],
		[ 0.59, 0.13 ],
		[ 0.67, 0.13 ],
	],
	[
		[ 0.67, 0.13 ],
		[ 0.8, 0.13 ],
		[ 0.9, 0.23 ],
		[ 0.9, 0.36 ],
	],
	[
		[ 0.9, 0.36 ],
		[ 0.9, 0.52 ],
		[ 0.76, 0.66 ],
		[ 0.5, 0.91 ],
	],
];

function shapeMaskPath( g, shape, s ) {
	g.beginPath();
	if ( 'heart' === shape ) {
		const X = ( u ) => u * s;
		const Y = ( v ) => v * s;
		g.moveTo(
			X( HEART_SEGS[ 0 ][ 0 ][ 0 ] ),
			Y( HEART_SEGS[ 0 ][ 0 ][ 1 ] )
		);
		for ( const [ , c1, c2, p1 ] of HEART_SEGS ) {
			g.bezierCurveTo(
				X( c1[ 0 ] ),
				Y( c1[ 1 ] ),
				X( c2[ 0 ] ),
				Y( c2[ 1 ] ),
				X( p1[ 0 ] ),
				Y( p1[ 1 ] )
			);
		}
		g.closePath();
	} else if ( 'star' === shape ) {
		const cx = s / 2;
		const cy = s / 2;
		const outer = s * 0.5;
		const inner = outer * 0.45;
		let rot = -Math.PI / 2;
		g.moveTo( cx + Math.cos( rot ) * outer, cy + Math.sin( rot ) * outer );
		for ( let i = 0; i < 5; i++ ) {
			rot += Math.PI / 5;
			g.lineTo(
				cx + Math.cos( rot ) * inner,
				cy + Math.sin( rot ) * inner
			);
			rot += Math.PI / 5;
			g.lineTo(
				cx + Math.cos( rot ) * outer,
				cy + Math.sin( rot ) * outer
			);
		}
		g.closePath();
	} else if ( 'hexagon' === shape ) {
		for ( let i = 0; i < 6; i++ ) {
			const a = -Math.PI / 2 + ( i * Math.PI ) / 3;
			const px = s / 2 + Math.cos( a ) * ( s / 2 - 1 );
			const py = s / 2 + Math.sin( a ) * ( s / 2 - 1 );
			if ( i ) {
				g.lineTo( px, py );
			} else {
				g.moveTo( px, py );
			}
		}
		g.closePath();
	} else if ( 'diamond' === shape ) {
		g.moveTo( s / 2, 2 );
		g.lineTo( s - 2, s / 2 );
		g.lineTo( s / 2, s - 2 );
		g.lineTo( 2, s / 2 );
		g.closePath();
	} else if ( 'flower' === shape ) {
		const n = 8;
		const r0 = s * 0.34;
		const bump = ( ( Math.PI * r0 ) / n ) * 1.1;
		for ( let i = 0; i < n; i++ ) {
			const a = ( i / n ) * Math.PI * 2;
			g.arc(
				s / 2 + Math.cos( a ) * r0,
				s / 2 + Math.sin( a ) * r0,
				bump,
				a - Math.PI * 0.72,
				a + Math.PI * 0.72
			);
		}
		g.closePath();
	} else {
		g.arc( s / 2, s / 2, s / 2 - 1, 0, Math.PI * 2 );
	}
}

export const MAZE_SHAPES = [
	'circle',
	'heart',
	'star',
	'hexagon',
	'diamond',
	'flower',
	'letter',
	'image',
];

/**
 * Keep only the largest 4-connected component of a cell mask - a maze
 * must be one connected region (dots on letters, specks from photo
 * silhouettes would otherwise render as solid blocks).
 */
function largestComponent( mask, cols ) {
	const rows = mask.length / cols;
	const label = new Int32Array( mask.length ).fill( -1 );
	let best = -1;
	let bestSize = 0;
	let next = 0;
	for ( let i = 0; i < mask.length; i++ ) {
		if ( ! mask[ i ] || label[ i ] >= 0 ) {
			continue;
		}
		const q = [ i ];
		label[ i ] = next;
		let sz = 0;
		while ( q.length ) {
			const cur = q.pop();
			sz++;
			const cx = cur % cols;
			const cy = ( cur / cols ) | 0;
			for ( const [ dx, dy ] of [
				[ 1, 0 ],
				[ -1, 0 ],
				[ 0, 1 ],
				[ 0, -1 ],
			] ) {
				const nx = cx + dx;
				const ny = cy + dy;
				const ni = ny * cols + nx;
				if (
					nx >= 0 &&
					ny >= 0 &&
					nx < cols &&
					ny < rows &&
					mask[ ni ] &&
					label[ ni ] < 0
				) {
					label[ ni ] = next;
					q.push( ni );
				}
			}
		}
		if ( sz > bestSize ) {
			bestSize = sz;
			best = next;
		}
		next++;
	}
	const out = new Uint8Array( mask.length );
	for ( let i = 0; i < mask.length; i++ ) {
		out[ i ] = mask[ i ] && label[ i ] === best ? 1 : 0;
	}
	return out;
}

/**
 * Cell mask for the maze: which grid cells lie inside the shape, the
 * typed letter/initial, or the silhouette of an image (Otsu threshold
 * on luminance - the darker side is the object unless it swallows the
 * frame, transparent pixels count as outside).
 */
function buildMask( like, shape, letter, cols, maskImage ) {
	const s = 300;
	const c = makeCanvas( like, s, s );
	const g = c.getContext( '2d' );
	g.fillStyle = '#000000';
	g.fillRect( 0, 0, s, s );
	if ( 'image' === shape && maskImage ) {
		// Draw contained, then threshold below.
		const sc = Math.min( s / maskImage.width, s / maskImage.height );
		const dw = maskImage.width * sc;
		const dh = maskImage.height * sc;
		g.drawImage( maskImage, ( s - dw ) / 2, ( s - dh ) / 2, dw, dh );
	} else if ( 'letter' === shape ) {
		g.fillStyle = '#ffffff';
		const ch = ( String( letter || 'A' ).trim()[ 0 ] || 'A' ).toUpperCase();
		g.font = `900 ${ Math.round( s * 1.02 ) }px sans-serif`;
		g.textAlign = 'center';
		g.textBaseline = 'middle';
		g.fillText( ch, s / 2, s * 0.56 );
	} else {
		g.fillStyle = '#ffffff';
		shapeMaskPath( g, shape, s );
		g.fill();
	}
	const data = g.getImageData( 0, 0, s, s ).data;
	let inside;
	if ( 'image' === shape && maskImage ) {
		// Luminance histogram -> Otsu split -> darker class = object.
		const lum = new Uint8Array( s * s );
		const alpha = new Uint8Array( s * s );
		const hist = new Uint32Array( 256 );
		for ( let i = 0; i < s * s; i++ ) {
			const l = Math.round(
				0.299 * data[ i * 4 ] +
					0.587 * data[ i * 4 + 1 ] +
					0.114 * data[ i * 4 + 2 ]
			);
			lum[ i ] = l;
			alpha[ i ] = data[ i * 4 + 3 ];
			if ( alpha[ i ] > 40 ) {
				hist[ l ]++;
			}
		}
		let total = 0;
		let sum = 0;
		for ( let i = 0; i < 256; i++ ) {
			total += hist[ i ];
			sum += i * hist[ i ];
		}
		let sumB = 0;
		let wB = 0;
		let maxVar = 0;
		let thr = 127;
		for ( let i = 0; i < 256; i++ ) {
			wB += hist[ i ];
			if ( ! wB || wB === total ) {
				continue;
			}
			sumB += i * hist[ i ];
			const mB = sumB / wB;
			const mF = ( sum - sumB ) / ( total - wB );
			const v = wB * ( total - wB ) * ( mB - mF ) * ( mB - mF );
			if ( v > maxVar ) {
				maxVar = v;
				thr = i;
			}
		}
		let dark = 0;
		for ( let i = 0; i < s * s; i++ ) {
			if ( alpha[ i ] > 40 && lum[ i ] <= thr ) {
				dark++;
			}
		}
		const darkIsObject = dark / ( total || 1 ) <= 0.7;
		inside = ( px, py ) => {
			const i = py * s + px;
			if ( alpha[ i ] <= 40 ) {
				return false;
			}
			return darkIsObject ? lum[ i ] <= thr : lum[ i ] > thr;
		};
	} else {
		inside = ( px, py ) => data[ ( py * s + px ) * 4 ] > 128;
	}
	const rows = cols;
	const mask = new Uint8Array( cols * rows );
	for ( let y = 0; y < rows; y++ ) {
		for ( let x = 0; x < cols; x++ ) {
			// Sample the cell center plus 4 offsets - a cell counts when
			// most of it is inside.
			let hits = 0;
			for ( const [ ox, oy ] of [
				[ 0.5, 0.5 ],
				[ 0.25, 0.5 ],
				[ 0.75, 0.5 ],
				[ 0.5, 0.25 ],
				[ 0.5, 0.75 ],
			] ) {
				const px = Math.min(
					s - 1,
					Math.round( ( ( x + ox ) / cols ) * s )
				);
				const py = Math.min(
					s - 1,
					Math.round( ( ( y + oy ) / rows ) * s )
				);
				if ( inside( px, py ) ) {
					hits++;
				}
			}
			mask[ y * cols + x ] = hits >= 4 ? 1 : 0;
		}
	}
	const clean = largestComponent( mask, cols );
	// A usable maze needs some area; fall back to the circle if the
	// silhouette collapsed to specks.
	let area = 0;
	for ( let i = 0; i < clean.length; i++ ) {
		area += clean[ i ];
	}
	if ( area < cols * rows * 0.06 && 'circle' !== shape ) {
		return buildMask( like, 'circle', letter, cols );
	}
	return clean;
}

/**
 * Generate a maze on the masked cells (recursive backtracker) and
 * solve it (BFS start to end).
 *
 * @param {Object} like Canvas-like.
 * @param {Object} opts { shape (MAZE_SHAPES), letter, maskImage (canvas,
 *                        for shape 'image'), cols (13..31 odd-ish), seed }.
 * @return {Object} { cols, mask, walls, start, end, path }
 */
export function buildMaze( like, opts = {} ) {
	const cols = Math.max( 11, Math.min( 33, opts.cols || 21 ) );
	const shape = MAZE_SHAPES.includes( opts.shape ) ? opts.shape : 'circle';
	const rand = rng( opts.seed || 11 );
	const mask = buildMask( like, shape, opts.letter, cols, opts.maskImage );
	const idx = ( x, y ) => y * cols + x;
	const inGrid = ( x, y ) => x >= 0 && y >= 0 && x < cols && y < cols;
	// walls[i] = bitmask N=1 E=2 S=4 W=8 (all up initially).
	const walls = new Uint8Array( cols * cols ).fill( 15 );
	const visited = new Uint8Array( cols * cols );
	// Start carving from the top-most masked cell.
	let startCell = -1;
	for ( let i = 0; i < mask.length && startCell < 0; i++ ) {
		if ( mask[ i ] ) {
			startCell = i;
		}
	}
	if ( startCell < 0 ) {
		return null;
	}
	const stack = [ startCell ];
	visited[ startCell ] = 1;
	const DIRS = [
		[ 0, -1, 1, 4 ],
		[ 1, 0, 2, 8 ],
		[ 0, 1, 4, 1 ],
		[ -1, 0, 8, 2 ],
	];
	while ( stack.length ) {
		const cur = stack[ stack.length - 1 ];
		const cx = cur % cols;
		const cy = ( cur / cols ) | 0;
		const options = [];
		for ( const [ dx, dy, bit, opp ] of DIRS ) {
			const nx = cx + dx;
			const ny = cy + dy;
			if (
				inGrid( nx, ny ) &&
				mask[ idx( nx, ny ) ] &&
				! visited[ idx( nx, ny ) ]
			) {
				options.push( [ nx, ny, bit, opp ] );
			}
		}
		if ( ! options.length ) {
			stack.pop();
			continue;
		}
		const [ nx, ny, bit, opp ] =
			options[ Math.floor( rand() * options.length ) ];
		walls[ cur ] &= ~bit;
		walls[ idx( nx, ny ) ] &= ~opp;
		visited[ idx( nx, ny ) ] = 1;
		stack.push( idx( nx, ny ) );
	}
	// Entrance = top-most cell (open N), exit = bottom-most (open S).
	let end = -1;
	for ( let i = mask.length - 1; i >= 0 && end < 0; i-- ) {
		if ( mask[ i ] && visited[ i ] ) {
			end = i;
		}
	}
	walls[ startCell ] &= ~1;
	walls[ end ] &= ~4;
	// BFS solve.
	const prev = new Int32Array( cols * cols ).fill( -1 );
	const q = [ startCell ];
	const seen = new Uint8Array( cols * cols );
	seen[ startCell ] = 1;
	while ( q.length ) {
		const cur = q.shift();
		if ( cur === end ) {
			break;
		}
		const cx = cur % cols;
		const cy = ( cur / cols ) | 0;
		for ( const [ dx, dy, bit ] of DIRS ) {
			if ( walls[ cur ] & bit ) {
				continue;
			}
			const nx = cx + dx;
			const ny = cy + dy;
			if ( ! inGrid( nx, ny ) || seen[ idx( nx, ny ) ] ) {
				continue;
			}
			seen[ idx( nx, ny ) ] = 1;
			prev[ idx( nx, ny ) ] = cur;
			q.push( idx( nx, ny ) );
		}
	}
	const path = [];
	for ( let p = end; p >= 0; p = prev[ p ] ) {
		path.push( p );
		if ( p === startCell ) {
			break;
		}
	}
	path.reverse();
	return { cols, mask, walls, start: startCell, end, path };
}

/**
 * Render the maze sheet (or its solution).
 *
 * @param {Object} like Canvas-like.
 * @param {Object} maze From buildMaze.
 * @param {Object} opts { solution, title, colors, font, textScale }.
 * @return {HTMLCanvasElement}
 */
export function renderMaze( like, maze, opts = {} ) {
	const { cols, mask, walls, start, end, path } = maze;
	const CELL = 34;
	const M = 50;
	const tb = titleBlock( opts );
	const s = cols * CELL;
	const c = makeCanvas( like, s + M * 2, s + M * 2 + tb.h );
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, c.width, c.height );
	drawTitle( g, tb, opts, c.width / 2, M - 20 );
	g.strokeStyle = INK;
	g.lineWidth = 3;
	g.lineCap = 'round';
	const X = ( x ) => M + x * CELL;
	const Y = ( y ) => M + tb.h + y * CELL;
	for ( let y = 0; y < cols; y++ ) {
		for ( let x = 0; x < cols; x++ ) {
			const i = y * cols + x;
			if ( ! mask[ i ] ) {
				continue;
			}
			const w = walls[ i ];
			if ( w & 1 ) {
				g.beginPath();
				g.moveTo( X( x ), Y( y ) );
				g.lineTo( X( x + 1 ), Y( y ) );
				g.stroke();
			}
			if ( w & 2 ) {
				g.beginPath();
				g.moveTo( X( x + 1 ), Y( y ) );
				g.lineTo( X( x + 1 ), Y( y + 1 ) );
				g.stroke();
			}
			if ( w & 4 ) {
				g.beginPath();
				g.moveTo( X( x ), Y( y + 1 ) );
				g.lineTo( X( x + 1 ), Y( y + 1 ) );
				g.stroke();
			}
			if ( w & 8 ) {
				g.beginPath();
				g.moveTo( X( x ), Y( y ) );
				g.lineTo( X( x ), Y( y + 1 ) );
				g.stroke();
			}
		}
	}
	// Start / end markers.
	const mark = ( cell, color ) => {
		const x = cell % cols;
		const y = ( cell / cols ) | 0;
		g.fillStyle = color;
		g.beginPath();
		g.arc(
			X( x ) + CELL / 2,
			Y( y ) + CELL / 2,
			CELL * 0.22,
			0,
			Math.PI * 2
		);
		g.fill();
	};
	mark( start, '#2f9e44' );
	mark( end, '#e03131' );
	if ( opts.solution && path.length > 1 ) {
		g.strokeStyle = '#e03131';
		g.lineWidth = CELL * 0.24;
		g.lineJoin = 'round';
		g.globalAlpha = 0.65;
		g.beginPath();
		path.forEach( ( cell, i ) => {
			const x = X( cell % cols ) + CELL / 2;
			const y = Y( ( cell / cols ) | 0 ) + CELL / 2;
			if ( i ) {
				g.lineTo( x, y );
			} else {
				g.moveTo( x, y );
			}
		} );
		g.stroke();
		g.globalAlpha = 1;
	}
	return c;
}

/* --------------------------------- sudoku --------------------------------- */

const sudokuBox = ( size ) =>
	9 === size ? [ 3, 3 ] : 6 === size ? [ 3, 2 ] : [ 2, 2 ];

function sudokuCandidates( grid, size, boxW, boxH, pos ) {
	const y = ( pos / size ) | 0;
	const x = pos % size;
	const used = new Uint8Array( size + 1 );
	for ( let k = 0; k < size; k++ ) {
		used[ grid[ y * size + k ] ] = 1;
		used[ grid[ k * size + x ] ] = 1;
	}
	const bx = Math.floor( x / boxW ) * boxW;
	const by = Math.floor( y / boxH ) * boxH;
	for ( let yy = by; yy < by + boxH; yy++ ) {
		for ( let xx = bx; xx < bx + boxW; xx++ ) {
			used[ grid[ yy * size + xx ] ] = 1;
		}
	}
	const out = [];
	for ( let v = 1; v <= size; v++ ) {
		if ( ! used[ v ] ) {
			out.push( v );
		}
	}
	return out;
}

// Count solutions up to `limit` (MRV backtracking).
function sudokuCount( grid, size, boxW, boxH, limit ) {
	let bestPos = -1;
	let bestCands = null;
	for ( let i = 0; i < grid.length; i++ ) {
		if ( grid[ i ] ) {
			continue;
		}
		const cands = sudokuCandidates( grid, size, boxW, boxH, i );
		if ( ! cands.length ) {
			return 0;
		}
		if ( ! bestCands || cands.length < bestCands.length ) {
			bestPos = i;
			bestCands = cands;
			if ( 1 === cands.length ) {
				break;
			}
		}
	}
	if ( bestPos < 0 ) {
		return 1;
	}
	let n = 0;
	for ( const v of bestCands ) {
		grid[ bestPos ] = v;
		n += sudokuCount( grid, size, boxW, boxH, limit - n );
		grid[ bestPos ] = 0;
		if ( n >= limit ) {
			break;
		}
	}
	return n;
}

/**
 * Generate a sudoku with a unique solution.
 *
 * @param {Object} opts { size 4|6|9, diff 1..3, seed }.
 * @return {Object} { size, boxW, boxH, puzzle, solution }
 */
export function buildSudoku( opts = {} ) {
	const size = [ 4, 6, 9 ].includes( opts.size ) ? opts.size : 9;
	const [ boxW, boxH ] = sudokuBox( size );
	const rand = rng( ( opts.seed || 5 ) * 7 + size );
	const cells = size * size;
	const grid = new Uint16Array( cells );
	const fill = ( pos ) => {
		if ( pos === cells ) {
			return true;
		}
		const cands = sudokuCandidates( grid, size, boxW, boxH, pos );
		for ( let i = cands.length - 1; i > 0; i-- ) {
			const j = Math.floor( rand() * ( i + 1 ) );
			[ cands[ i ], cands[ j ] ] = [ cands[ j ], cands[ i ] ];
		}
		for ( const v of cands ) {
			grid[ pos ] = v;
			if ( fill( pos + 1 ) ) {
				return true;
			}
		}
		grid[ pos ] = 0;
		return false;
	};
	fill( 0 );
	const solution = grid.slice();
	const puzzle = grid.slice();
	const ratio = [ 0, 0.52, 0.42, 0.34 ][
		Math.max( 1, Math.min( 3, opts.diff || 2 ) )
	];
	const target = Math.max( boxW * boxH + 2, Math.round( cells * ratio ) );
	const order = Array.from( { length: cells }, ( _, i ) => i );
	for ( let i = order.length - 1; i > 0; i-- ) {
		const j = Math.floor( rand() * ( i + 1 ) );
		[ order[ i ], order[ j ] ] = [ order[ j ], order[ i ] ];
	}
	let givens = cells;
	for ( const i of order ) {
		if ( givens <= target ) {
			break;
		}
		const saved = puzzle[ i ];
		puzzle[ i ] = 0;
		const probe = puzzle.slice();
		if ( 1 !== sudokuCount( probe, size, boxW, boxH, 2 ) ) {
			puzzle[ i ] = saved;
		} else {
			givens--;
		}
	}
	return { size, boxW, boxH, puzzle, solution };
}

/**
 * Render the sudoku sheet (or its solution).
 */
export function renderSudoku( like, sud, opts = {} ) {
	const { size, boxW, boxH, puzzle, solution } = sud;
	const CELL = 9 === size ? 64 : 6 === size ? 76 : 92;
	const M = 56;
	const tb = titleBlock( opts );
	const s = size * CELL;
	const c = makeCanvas( like, s + M * 2, s + M * 2 + tb.h );
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, c.width, c.height );
	drawTitle( g, tb, opts, c.width / 2, M - 20 );
	const top = M + tb.h;
	// Thin cell lines, thick box lines, accent outer frame.
	g.strokeStyle = 'rgba(0,0,0,0.4)';
	g.lineWidth = 1;
	for ( let i = 1; i < size; i++ ) {
		g.beginPath();
		g.moveTo( M + i * CELL, top );
		g.lineTo( M + i * CELL, top + s );
		g.moveTo( M, top + i * CELL );
		g.lineTo( M + s, top + i * CELL );
		g.stroke();
	}
	g.strokeStyle = INK;
	g.lineWidth = 3;
	for ( let i = boxW; i < size; i += boxW ) {
		g.beginPath();
		g.moveTo( M + i * CELL, top );
		g.lineTo( M + i * CELL, top + s );
		g.stroke();
	}
	for ( let i = boxH; i < size; i += boxH ) {
		g.beginPath();
		g.moveTo( M, top + i * CELL );
		g.lineTo( M + s, top + i * CELL );
		g.stroke();
	}
	g.strokeStyle = accentOf( opts );
	g.lineWidth = 4;
	g.strokeRect( M, top, s, s );
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	for ( let i = 0; i < size * size; i++ ) {
		const x = M + ( i % size ) * CELL + CELL / 2;
		const y = top + ( ( i / size ) | 0 ) * CELL + CELL / 2 + 2;
		if ( puzzle[ i ] ) {
			g.fillStyle = INK;
			g.font = `700 ${ Math.round( CELL * 0.5 ) }px ${ famFor( opts ) }`;
			g.fillText( String( puzzle[ i ] ), x, y );
		} else if ( opts.solution ) {
			g.fillStyle = SOLVE;
			g.font = `400 ${ Math.round( CELL * 0.5 ) }px ${ famFor( opts ) }`;
			g.fillText( String( solution[ i ] ), x, y );
		}
	}
	return c;
}

/* ------------------------------- criss-cross ------------------------------ */

/**
 * Interlocking word grid from the user's words: the longest word is
 * prefilled, the rest cross it - fill the empty boxes from the bank.
 *
 * @param {Array}  words Raw list.
 * @param {Object} opts  { seed }.
 * @return {Object} { w, h, letters, prefill, placed, skipped }
 */
export function buildCrissCross( words, opts = {} ) {
	const rand = rng( opts.seed || 3 );
	const clean = Array.from(
		new Set(
			( words || [] )
				.map( ( w ) =>
					String( w )
						.toUpperCase()
						.replace( /Ä/g, 'AE' )
						.replace( /Ö/g, 'OE' )
						.replace( /Ü/g, 'UE' )
						.replace( /[^A-Z]/g, '' )
				)
				.filter( ( w ) => w.length >= 3 && w.length <= 14 )
		)
	).slice( 0, 16 );
	clean.sort( ( a, b ) => b.length - a.length );
	const N = 42;
	const grid = new Array( N * N ).fill( '' );
	const at = ( x, y ) =>
		x >= 0 && y >= 0 && x < N && y < N ? grid[ y * N + x ] : '';
	const placed = [];
	const skipped = [];
	const put = ( word, x0, y0, dx, dy ) => {
		for ( let i = 0; i < word.length; i++ ) {
			grid[ ( y0 + dy * i ) * N + ( x0 + dx * i ) ] = word[ i ];
		}
		placed.push( { word, x: x0, y: y0, dx, dy } );
	};
	const fits = ( word, x0, y0, dx, dy ) => {
		const xe = x0 + dx * ( word.length - 1 );
		const ye = y0 + dy * ( word.length - 1 );
		if ( x0 < 0 || y0 < 0 || xe >= N || ye >= N ) {
			return -1;
		}
		// Cell before start and after end must be free.
		if ( at( x0 - dx, y0 - dy ) || at( xe + dx, ye + dy ) ) {
			return -1;
		}
		let crossings = 0;
		for ( let i = 0; i < word.length; i++ ) {
			const x = x0 + dx * i;
			const y = y0 + dy * i;
			const cur = at( x, y );
			if ( cur ) {
				if ( cur !== word[ i ] ) {
					return -1;
				}
				crossings++;
				continue;
			}
			// New cells must not touch foreign words sideways.
			if ( dx ) {
				if ( at( x, y - 1 ) || at( x, y + 1 ) ) {
					return -1;
				}
			} else if ( at( x - 1, y ) || at( x + 1, y ) ) {
				return -1;
			}
		}
		return crossings;
	};
	if ( ! clean.length ) {
		return { w: 0, h: 0, letters: [], prefill: new Set(), placed, skipped };
	}
	// First (longest) word horizontal in the middle.
	put(
		clean[ 0 ],
		Math.floor( ( N - clean[ 0 ].length ) / 2 ),
		Math.floor( N / 2 ),
		1,
		0
	);
	const rest = clean.slice( 1 );
	let progress = true;
	while ( progress ) {
		progress = false;
		for ( let r = rest.length - 1; r >= 0; r-- ) {
			const word = rest[ r ];
			let best = null;
			for ( const p of placed ) {
				for ( let i = 0; i < p.word.length; i++ ) {
					const cx = p.x + p.dx * i;
					const cy = p.y + p.dy * i;
					for ( let k = 0; k < word.length; k++ ) {
						if ( word[ k ] !== p.word[ i ] ) {
							continue;
						}
						const dx = p.dx ? 0 : 1;
						const dy = p.dx ? 1 : 0;
						const x0 = cx - dx * k;
						const y0 = cy - dy * k;
						const cr = fits( word, x0, y0, dx, dy );
						if (
							cr >= 1 &&
							( ! best ||
								cr > best.cr ||
								( cr === best.cr && rand() < 0.35 ) )
						) {
							best = { x0, y0, dx, dy, cr };
						}
					}
				}
			}
			if ( best ) {
				put( word, best.x0, best.y0, best.dx, best.dy );
				rest.splice( r, 1 );
				progress = true;
			}
		}
	}
	skipped.push( ...rest );
	// Crop to the bounding box.
	let minX = N;
	let minY = N;
	let maxX = -1;
	let maxY = -1;
	for ( let y = 0; y < N; y++ ) {
		for ( let x = 0; x < N; x++ ) {
			if ( grid[ y * N + x ] ) {
				minX = Math.min( minX, x );
				minY = Math.min( minY, y );
				maxX = Math.max( maxX, x );
				maxY = Math.max( maxY, y );
			}
		}
	}
	const w = maxX - minX + 1;
	const h = maxY - minY + 1;
	const letters = new Array( w * h ).fill( '' );
	for ( let y = 0; y < h; y++ ) {
		for ( let x = 0; x < w; x++ ) {
			letters[ y * w + x ] = grid[ ( y + minY ) * N + ( x + minX ) ];
		}
	}
	const prefill = new Set();
	const first = placed[ 0 ];
	for ( let i = 0; i < first.word.length; i++ ) {
		prefill.add(
			( first.y + first.dy * i - minY ) * w +
				( first.x + first.dx * i - minX )
		);
	}
	return { w, h, letters, prefill, placed, skipped };
}

/**
 * Render the criss-cross sheet (or its solution).
 */
export function renderCrissCross( like, cc, opts = {} ) {
	const { w, h, letters, prefill } = cc;
	const CELL = 52;
	const M = 60;
	const tb = titleBlock( opts );
	const words = cc.placed
		.map( ( p ) => p.word )
		.sort( ( a, b ) => a.length - b.length || ( a < b ? -1 : 1 ) );
	const listCols = 3;
	const listLh = Math.round( 34 * tscale( opts ) );
	const listRows = Math.ceil( words.length / listCols );
	const gw = Math.max( w * CELL, 9 * CELL );
	const c = makeCanvas(
		like,
		gw + M * 2,
		tb.h + h * CELL + M * 2 + 66 + listRows * listLh
	);
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, c.width, c.height );
	drawTitle( g, tb, opts, c.width / 2, M - 16 );
	const ox = M + ( gw - w * CELL ) / 2;
	const oy = M + tb.h;
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	for ( let y = 0; y < h; y++ ) {
		for ( let x = 0; x < w; x++ ) {
			const ch = letters[ y * w + x ];
			if ( ! ch ) {
				continue;
			}
			const px = ox + x * CELL;
			const py = oy + y * CELL;
			g.fillStyle = '#ffffff';
			g.fillRect( px, py, CELL, CELL );
			g.strokeStyle = INK;
			g.lineWidth = 2;
			g.strokeRect( px + 1, py + 1, CELL - 2, CELL - 2 );
			const pre = prefill.has( y * w + x );
			if ( pre || opts.solution ) {
				g.fillStyle = pre ? accentOf( opts ) : SOLVE;
				g.font = `700 ${ Math.round( CELL * 0.52 ) }px ${ famFor(
					opts
				) }`;
				g.fillText( ch, px + CELL / 2, py + CELL / 2 + 1 );
			}
		}
	}
	// Word bank with accent bullets, shortest first.
	const ly = oy + h * CELL + 44;
	g.font = `600 ${ Math.round( 17 * tscale( opts ) ) }px ${ famFor( opts ) }`;
	g.textAlign = 'left';
	words.forEach( ( word, i ) => {
		const col = i % listCols;
		const row = Math.floor( i / listCols );
		const lx = M + col * ( ( gw - 20 ) / listCols );
		g.fillStyle = accentOf( opts );
		g.beginPath();
		g.arc( lx + 5, ly + row * listLh - 5, 5, 0, Math.PI * 2 );
		g.fill();
		g.fillStyle = '#31353b';
		g.fillText( word, lx + 18, ly + row * listLh );
	} );
	return c;
}

/* ------------------------------- cryptogram ------------------------------- */

/**
 * Number cryptogram: every letter of the phrase becomes a number, a
 * few letters are given - crack the code. Works with multi-line
 * phrases.
 *
 * @param {string} phrase Up to 4 lines.
 * @param {Object} opts   { seed, diff 1..3 }.
 * @return {Object} { lines, map, hints, used }
 */
export function buildCryptogram( phrase, opts = {} ) {
	const rand = rng( ( opts.seed || 13 ) * 3 + 1 );
	const lines = splitLines( phrase || 'HAVE FUN', 4 )
		.map( ( l ) =>
			l
				.toUpperCase()
				.replace( /Ä/g, 'AE' )
				.replace( /Ö/g, 'OE' )
				.replace( /Ü/g, 'UE' )
				.replace( /ß/g, 'SS' )
				.replace( /[^A-Z0-9 .,!?'\-]/g, '' )
				.slice( 0, 26 )
		)
		.filter( Boolean );
	if ( ! lines.length ) {
		lines.push( 'HAVE FUN' );
	}
	const nums = Array.from( { length: 26 }, ( _, i ) => i + 1 );
	for ( let i = nums.length - 1; i > 0; i-- ) {
		const j = Math.floor( rand() * ( i + 1 ) );
		[ nums[ i ], nums[ j ] ] = [ nums[ j ], nums[ i ] ];
	}
	const map = {};
	for ( let i = 0; i < 26; i++ ) {
		map[ String.fromCharCode( 65 + i ) ] = nums[ i ];
	}
	const used = Array.from(
		new Set(
			lines
				.join( '' )
				.replace( /[^A-Z]/g, '' )
				.split( '' )
		)
	).sort();
	const ratio = [ 0, 0.4, 0.22, 0.1 ][
		Math.max( 1, Math.min( 3, opts.diff || 2 ) )
	];
	const count = Math.max( 1, Math.round( used.length * ratio ) );
	const pool = used.slice();
	const hints = new Set();
	for ( let i = 0; i < count && pool.length; i++ ) {
		hints.add( pool.splice( Math.floor( rand() * pool.length ), 1 )[ 0 ] );
	}
	return { lines, map, hints, used };
}

/**
 * Render the cryptogram sheet (or its solution).
 */
export function renderCryptogram( like, cg, opts = {} ) {
	const { lines, map, hints, used } = cg;
	const BW = 46;
	const BH = 64;
	const GAP = 8;
	const SPACE = 26;
	const M = 60;
	const tb = titleBlock( opts );
	const lineW = ( line ) => {
		let lw = 0;
		for ( const ch of line ) {
			lw += /[A-Z]/.test( ch ) ? BW + GAP : /\s/.test( ch ) ? SPACE : 22;
		}
		return lw;
	};
	const maxW = Math.max( 9 * ( BW + GAP ), ...lines.map( lineW ) );
	const legendCols = Math.min( 13, used.length );
	const legendRows = Math.ceil( used.length / legendCols );
	const legendW = legendCols * ( BW + GAP );
	const W = Math.max( maxW, legendW ) + M * 2;
	const H =
		tb.h +
		lines.length * ( BH + 26 ) +
		70 +
		legendRows * ( BH + 18 ) +
		M * 2;
	const c = makeCanvas( like, W, H );
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, c.width, c.height );
	drawTitle( g, tb, opts, W / 2, M - 16 );
	g.textAlign = 'center';
	const accent = accentOf( opts );
	const cellFont = `700 ${ Math.round( BW * 0.58 ) }px ${ famFor( opts ) }`;
	const numFont = `600 13px ${ famFor( opts ) }`;
	const drawBox = ( x, y, ch ) => {
		// Write line + number underneath; hint/solution letters on top.
		g.strokeStyle = INK;
		g.lineWidth = 2;
		g.beginPath();
		g.moveTo( x + 3, y + BH - 18 );
		g.lineTo( x + BW - 3, y + BH - 18 );
		g.stroke();
		g.fillStyle = '#6a7078';
		g.font = numFont;
		g.textBaseline = 'alphabetic';
		g.fillText( String( map[ ch ] ), x + BW / 2, y + BH - 2 );
		const isHint = hints.has( ch );
		if ( isHint || opts.solution ) {
			g.fillStyle = isHint ? accent : SOLVE;
			g.font = cellFont;
			g.fillText( ch, x + BW / 2, y + BH - 26 );
		}
	};
	let y = M + tb.h;
	for ( const line of lines ) {
		let x = M + ( W - M * 2 - lineW( line ) ) / 2;
		for ( const ch of line ) {
			if ( /[A-Z]/.test( ch ) ) {
				drawBox( x, y, ch );
				x += BW + GAP;
			} else if ( /\s/.test( ch ) ) {
				x += SPACE;
			} else {
				g.fillStyle = INK;
				g.font = cellFont;
				g.textBaseline = 'alphabetic';
				g.fillText( ch, x + 10, y + BH - 26 );
				x += 22;
			}
		}
		y += BH + 26;
	}
	// Legend: one box per used letter, number inside, letter above.
	y += 26;
	g.font = numFont;
	const lx0 = ( W - legendW ) / 2;
	used.forEach( ( ch, i ) => {
		const x = lx0 + ( i % legendCols ) * ( BW + GAP );
		const yy = y + Math.floor( i / legendCols ) * ( BH + 18 );
		g.fillStyle = '#f3f4f6';
		g.fillRect( x, yy, BW, BH - 16 );
		g.strokeStyle = INK;
		g.lineWidth = 1.6;
		g.strokeRect( x, yy, BW, BH - 16 );
		g.fillStyle = '#6a7078';
		g.font = numFont;
		g.textBaseline = 'alphabetic';
		g.fillText( String( map[ ch ] ), x + BW / 2, yy + BH - 22 );
		const isHint = hints.has( ch );
		if ( isHint || opts.solution ) {
			g.fillStyle = isHint ? accent : SOLVE;
			g.font = cellFont;
			g.fillText( ch, x + BW / 2, yy + BH - 34 );
		}
	} );
	return c;
}

/* ------------------------------- bingo cards ------------------------------ */

/**
 * Bingo cards from the user's own terms: every card is a different
 * seeded selection and arrangement, and no two cards in the set repeat.
 *
 * @param {Array}  words Raw term list.
 * @param {Object} opts  { grid 3|4|5, cards 1..8, free (center free
 *                         cell on odd grids), seed }.
 * @return {Object|null} { grid, free, cards: [ [terms] ], short }
 */
export function buildBingo( words, opts = {} ) {
	const grid = [ 3, 4, 5 ].includes( opts.grid ) ? opts.grid : 4;
	const count = Math.max( 1, Math.min( 8, opts.cards || 4 ) );
	const rand = rng( ( opts.seed || 19 ) * 13 + grid );
	const free = !! opts.free && 1 === grid % 2;
	const cells = grid * grid - ( free ? 1 : 0 );
	const terms = Array.from(
		new Set(
			( words || [] )
				.map( ( w ) => String( w ).trim() )
				.filter( ( w ) => w.length >= 1 && w.length <= 24 )
		)
	).slice( 0, 60 );
	// Too few terms: pad with numbers so the sheet stays playable, and
	// report how many were missing.
	const short = Math.max( 0, cells - terms.length );
	for ( let n = 1; terms.length < cells; n++ ) {
		const t2 = String( n );
		if ( ! terms.includes( t2 ) ) {
			terms.push( t2 );
		}
	}
	const seen = new Set();
	const cards = [];
	for ( let cIdx = 0; cIdx < count; cIdx++ ) {
		let pick = null;
		for ( let tries = 0; tries < 60; tries++ ) {
			const pool = terms.slice();
			for ( let i = pool.length - 1; i > 0; i-- ) {
				const j = Math.floor( rand() * ( i + 1 ) );
				[ pool[ i ], pool[ j ] ] = [ pool[ j ], pool[ i ] ];
			}
			const cand = pool.slice( 0, cells );
			const sig = cand.join( '' );
			if ( ! seen.has( sig ) ) {
				seen.add( sig );
				pick = cand;
				break;
			}
		}
		if ( ! pick ) {
			break; // term pool too small for more distinct cards
		}
		cards.push( pick );
	}
	return cards.length ? { grid, free, cards, short } : null;
}

/**
 * Render ONE bingo card (cardIndex into the built set).
 */
export function renderBingo( like, bingo, opts = {} ) {
	const { grid, free } = bingo;
	const card = bingo.cards[ Math.max( 0, opts.cardIndex || 0 ) ];
	const CELL = 5 === grid ? 120 : 4 === grid ? 140 : 168;
	const M = 60;
	const tb = titleBlock( opts );
	const s = grid * CELL;
	const c = makeCanvas( like, s + M * 2, tb.h + s + M * 2 + 40 );
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, c.width, c.height );
	drawTitle( g, tb, opts, c.width / 2, M - 16 );
	const top = M + tb.h;
	const accent = accentOf( opts );
	const mid = ( grid - 1 ) / 2;
	let ti = 0;
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	for ( let y = 0; y < grid; y++ ) {
		for ( let x = 0; x < grid; x++ ) {
			const px = M + x * CELL;
			const py = top + y * CELL;
			const isFree = free && x === mid && y === mid;
			g.fillStyle = isFree ? accent : '#ffffff';
			g.fillRect( px, py, CELL, CELL );
			g.strokeStyle = INK;
			g.lineWidth = 2;
			g.strokeRect( px + 1, py + 1, CELL - 2, CELL - 2 );
			if ( isFree ) {
				// A star marks the free cell.
				g.fillStyle = '#ffffff';
				g.save();
				g.translate( px + CELL / 2, py + CELL / 2 );
				g.beginPath();
				for ( let i = 0; i < 10; i++ ) {
					const r = i % 2 ? CELL * 0.13 : CELL * 0.3;
					const a = -Math.PI / 2 + ( i * Math.PI ) / 5;
					const sx = Math.cos( a ) * r;
					const sy = Math.sin( a ) * r;
					if ( i ) {
						g.lineTo( sx, sy );
					} else {
						g.moveTo( sx, sy );
					}
				}
				g.closePath();
				g.fill();
				g.restore();
				continue;
			}
			const term = card[ ti++ ] || '';
			// Shrink to fit the cell.
			let px2 = Math.round( CELL * 0.24 * tscale( opts ) );
			g.fillStyle = INK;
			do {
				g.font = `600 ${ px2 }px ${ famFor( opts ) }`;
				px2 -= 2;
			} while ( px2 > 9 && g.measureText( term ).width > CELL - 16 );
			g.fillText( term, px + CELL / 2, py + CELL / 2 + 1 );
		}
	}
	// Accent frame around the whole card.
	g.strokeStyle = accent;
	g.lineWidth = 5;
	g.strokeRect( M - 4, top - 4, s + 8, s + 8 );
	return c;
}

/* ------------------------------ photo jigsaw ------------------------------ */

/**
 * Seeded tab directions for a jigsaw cut: one sign per interior edge.
 *
 * @param {number} cols Columns.
 * @param {number} rows Rows.
 * @param {number} seed Seed.
 * @return {Object} { v, h } sign arrays (+1/-1), v[y][x] = edge right
 *                  of cell x, h[y][x] = edge below cell x.
 */
export function buildJigsawTabs( cols, rows, seed ) {
	const rand = rng( ( seed || 23 ) * 29 + cols * 7 + rows );
	const v = [];
	const h = [];
	for ( let y = 0; y < rows; y++ ) {
		v[ y ] = [];
		h[ y ] = [];
		for ( let x = 0; x < cols; x++ ) {
			v[ y ][ x ] = rand() < 0.5 ? 1 : -1;
			h[ y ][ x ] = rand() < 0.5 ? 1 : -1;
		}
	}
	return { v, h };
}

// One jigsaw edge in local coordinates: a >180-degree arc whose center
// sits off the edge line makes the classic knob WITH its neck in a
// single stroke (chord narrower than the bump's diameter).
function jigsawEdge( g, x0, y0, x1, y1, sign ) {
	const dx = x1 - x0;
	const dy = y1 - y0;
	const len = Math.hypot( dx, dy );
	const ang = Math.atan2( dy, dx );
	g.save();
	g.translate( x0, y0 );
	g.rotate( ang );
	const hOff = 0.11 * len * sign;
	const r = 0.14 * len;
	const chord = Math.sqrt( r * r - hOff * hOff );
	g.lineTo( 0.5 * len - chord, 0 );
	const a0 = Math.atan2( -hOff, -chord );
	const a1 = Math.atan2( -hOff, chord );
	g.arc( 0.5 * len, hOff, r, a0, a1, sign > 0 );
	g.lineTo( len, 0 );
	g.restore();
	// Keep the path position honest for the caller.
	g.moveTo( x1, y1 );
}

/**
 * Render the photo jigsaw sheet: the picture with classic interlocking
 * cut lines (print, laminate, cut). The solution variant numbers every
 * piece - write them on the back before cutting.
 *
 * @param {Object}            like Canvas-like.
 * @param {HTMLCanvasElement} src  Source image canvas.
 * @param {Object}            opts { cols 3..10, seed, solution, title,
 *                                   colors, font, textScale }.
 * @return {HTMLCanvasElement|null}
 */
export function renderJigsaw( like, src, opts = {} ) {
	if ( ! src || ! src.width || ! src.height ) {
		return null;
	}
	const cols = Math.max( 3, Math.min( 10, opts.cols || 5 ) );
	const rows = Math.max(
		2,
		Math.min( 12, Math.round( ( cols * src.height ) / src.width ) )
	);
	const W = 940;
	const IH = Math.round( ( W * src.height ) / src.width );
	const M = 56;
	const tb = titleBlock( opts );
	const c = makeCanvas( like, W + M * 2, tb.h + IH + M * 2 );
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, c.width, c.height );
	drawTitle( g, tb, opts, c.width / 2, M - 16 );
	const top = M + tb.h;
	g.drawImage( src, M, top, W, IH );
	const tabs = buildJigsawTabs( cols, rows, opts.seed );
	const cw = W / cols;
	const ch = IH / rows;
	// The cut path: interior edges with knobs, drawn twice (dark core +
	// white halo) so it reads on any photo.
	const tracePath = () => {
		g.beginPath();
		for ( let y = 0; y < rows; y++ ) {
			for ( let x = 0; x < cols - 1; x++ ) {
				g.moveTo( M + ( x + 1 ) * cw, top + y * ch );
				jigsawEdge(
					g,
					M + ( x + 1 ) * cw,
					top + y * ch,
					M + ( x + 1 ) * cw,
					top + ( y + 1 ) * ch,
					tabs.v[ y ][ x ]
				);
			}
		}
		for ( let y = 0; y < rows - 1; y++ ) {
			for ( let x = 0; x < cols; x++ ) {
				g.moveTo( M + x * cw, top + ( y + 1 ) * ch );
				jigsawEdge(
					g,
					M + x * cw,
					top + ( y + 1 ) * ch,
					M + ( x + 1 ) * cw,
					top + ( y + 1 ) * ch,
					tabs.h[ y ][ x ]
				);
			}
		}
	};
	g.lineJoin = 'round';
	g.lineCap = 'round';
	tracePath();
	g.strokeStyle = 'rgba(255,255,255,0.9)';
	g.lineWidth = 4.5;
	g.stroke();
	tracePath();
	g.strokeStyle = 'rgba(20,22,26,0.9)';
	g.lineWidth = 1.6;
	g.stroke();
	// Outer frame in the accent color.
	g.strokeStyle = accentOf( opts );
	g.lineWidth = 5;
	g.strokeRect( M, top, W, IH );
	if ( opts.solution ) {
		// Piece numbers, row by row - copy them onto the back.
		g.textAlign = 'center';
		g.textBaseline = 'middle';
		let n = 1;
		for ( let y = 0; y < rows; y++ ) {
			for ( let x = 0; x < cols; x++ ) {
				const cx = M + x * cw + cw / 2;
				const cy = top + y * ch + ch / 2;
				g.fillStyle = 'rgba(255,255,255,0.85)';
				g.beginPath();
				g.arc( cx, cy, Math.min( cw, ch ) * 0.2, 0, Math.PI * 2 );
				g.fill();
				g.fillStyle = INK;
				g.font = `700 ${ Math.round(
					Math.min( cw, ch ) * 0.24
				) }px ${ famFor( opts ) }`;
				g.fillText( String( n++ ), cx, cy + 1 );
			}
		}
	}
	return c;
}

/* ------------------------------- dot to dot ------------------------------- */

/**
 * Dot-to-dot from an image silhouette: Otsu threshold, largest
 * component, Moore boundary trace, arc-length resample to N numbered
 * dots.
 *
 * @param {Object}            like Canvas-like.
 * @param {HTMLCanvasElement} src  Source image canvas.
 * @param {Object}            opts { points 20..120 }.
 * @return {Object|null} { pts: [[x,y] 0..1 normalized], cx, cy }
 */
export function buildDot2Dot( like, src, opts = {} ) {
	if ( ! src || ! src.width || ! src.height ) {
		return null;
	}
	const N = Math.max( 20, Math.min( 120, opts.points || 60 ) );
	const s = 260;
	const c = makeCanvas( like, s, s );
	const g = c.getContext( '2d' );
	g.fillStyle = '#000000';
	g.fillRect( 0, 0, s, s );
	const sc = Math.min( s / src.width, s / src.height );
	g.drawImage(
		src,
		( s - src.width * sc ) / 2,
		( s - src.height * sc ) / 2,
		src.width * sc,
		src.height * sc
	);
	const data = g.getImageData( 0, 0, s, s ).data;
	// Otsu on luminance, darker class = object unless it swallows all.
	const lum = new Uint8Array( s * s );
	const hist = new Uint32Array( 256 );
	for ( let i = 0; i < s * s; i++ ) {
		const l = Math.round(
			0.299 * data[ i * 4 ] +
				0.587 * data[ i * 4 + 1 ] +
				0.114 * data[ i * 4 + 2 ]
		);
		lum[ i ] = l;
		hist[ l ]++;
	}
	const total = s * s;
	let sum = 0;
	for ( let i = 0; i < 256; i++ ) {
		sum += i * hist[ i ];
	}
	let sumB = 0;
	let wB = 0;
	let maxVar = 0;
	let thr = 127;
	for ( let i = 0; i < 256; i++ ) {
		wB += hist[ i ];
		if ( ! wB || wB === total ) {
			continue;
		}
		sumB += i * hist[ i ];
		const mB = sumB / wB;
		const mF = ( sum - sumB ) / ( total - wB );
		const v = wB * ( total - wB ) * ( mB - mF ) * ( mB - mF );
		if ( v > maxVar ) {
			maxVar = v;
			thr = i;
		}
	}
	let dark = 0;
	for ( let i = 0; i < s * s; i++ ) {
		if ( lum[ i ] <= thr ) {
			dark++;
		}
	}
	const darkIsObject = dark / total <= 0.7;
	const mask = new Uint8Array( s * s );
	for ( let i = 0; i < s * s; i++ ) {
		mask[ i ] = ( darkIsObject ? lum[ i ] <= thr : lum[ i ] > thr ) ? 1 : 0;
	}
	// Largest 4-connected component only.
	const label = new Int32Array( s * s ).fill( -1 );
	let bestLabel = -1;
	let bestSize = 0;
	let next = 0;
	for ( let i = 0; i < s * s; i++ ) {
		if ( ! mask[ i ] || label[ i ] >= 0 ) {
			continue;
		}
		const q = [ i ];
		label[ i ] = next;
		let sz = 0;
		while ( q.length ) {
			const cur = q.pop();
			sz++;
			const cx = cur % s;
			const cy = ( cur / s ) | 0;
			for ( const [ ddx, ddy ] of [
				[ 1, 0 ],
				[ -1, 0 ],
				[ 0, 1 ],
				[ 0, -1 ],
			] ) {
				const nx = cx + ddx;
				const ny = cy + ddy;
				const ni = ny * s + nx;
				if (
					nx >= 0 &&
					ny >= 0 &&
					nx < s &&
					ny < s &&
					mask[ ni ] &&
					label[ ni ] < 0
				) {
					label[ ni ] = next;
					q.push( ni );
				}
			}
		}
		if ( sz > bestSize ) {
			bestSize = sz;
			bestLabel = next;
		}
		next++;
	}
	if ( bestSize < s * s * 0.01 ) {
		return null;
	}
	const inside = ( x, y ) =>
		x >= 0 && y >= 0 && x < s && y < s && label[ y * s + x ] === bestLabel;
	// Moore boundary trace, starting at the top-most object pixel.
	let sx = -1;
	let sy = -1;
	for ( let i = 0; i < s * s && sx < 0; i++ ) {
		if ( label[ i ] === bestLabel ) {
			sx = i % s;
			sy = ( i / s ) | 0;
		}
	}
	const NB = [
		[ 1, 0 ],
		[ 1, 1 ],
		[ 0, 1 ],
		[ -1, 1 ],
		[ -1, 0 ],
		[ -1, -1 ],
		[ 0, -1 ],
		[ 1, -1 ],
	];
	const contour = [ [ sx, sy ] ];
	let cx2 = sx;
	let cy2 = sy;
	let dir = 6; // came from above
	for ( let step = 0; step < s * s * 4; step++ ) {
		let found = false;
		for ( let k = 0; k < 8; k++ ) {
			const d = ( dir + 6 + k ) % 8; // backtrack-relative sweep
			const nx = cx2 + NB[ d ][ 0 ];
			const ny = cy2 + NB[ d ][ 1 ];
			if ( inside( nx, ny ) ) {
				cx2 = nx;
				cy2 = ny;
				dir = d;
				contour.push( [ nx, ny ] );
				found = true;
				break;
			}
		}
		if ( ! found ) {
			break; // single-pixel island
		}
		if ( cx2 === sx && cy2 === sy && contour.length > 8 ) {
			break;
		}
	}
	if ( contour.length < 24 ) {
		return null;
	}
	// Arc-length resample to exactly N dots.
	let perim = 0;
	const segs = [ 0 ];
	for ( let i = 1; i < contour.length; i++ ) {
		perim += Math.hypot(
			contour[ i ][ 0 ] - contour[ i - 1 ][ 0 ],
			contour[ i ][ 1 ] - contour[ i - 1 ][ 1 ]
		);
		segs.push( perim );
	}
	const pts = [];
	let si = 0;
	for ( let k = 0; k < N; k++ ) {
		const target = ( k / N ) * perim;
		while ( si < segs.length - 1 && segs[ si + 1 ] < target ) {
			si++;
		}
		const span = segs[ si + 1 ] - segs[ si ] || 1;
		const f = ( target - segs[ si ] ) / span;
		const a = contour[ si ];
		const b = contour[ si + 1 ] || a;
		pts.push( [
			( a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * f ) / s,
			( a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * f ) / s,
		] );
	}
	const cX = pts.reduce( ( acc, p ) => acc + p[ 0 ], 0 ) / N;
	const cY = pts.reduce( ( acc, p ) => acc + p[ 1 ], 0 ) / N;
	return { pts, cx: cX, cy: cY };
}

/**
 * Render the dot-to-dot sheet (or its solution, which draws the line).
 */
export function renderDot2Dot( like, dd, opts = {} ) {
	const { pts, cx, cy } = dd;
	const S = 860;
	const M = 70;
	const tb = titleBlock( opts );
	const c = makeCanvas( like, S + M * 2, tb.h + S + M * 2 );
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, c.width, c.height );
	drawTitle( g, tb, opts, c.width / 2, M - 20 );
	const top = M + tb.h;
	const P = ( p ) => [ M + p[ 0 ] * S, top + p[ 1 ] * S ];
	const accent = accentOf( opts );
	if ( opts.solution ) {
		g.strokeStyle = SOLVE;
		g.lineWidth = 3;
		g.lineJoin = 'round';
		g.beginPath();
		pts.forEach( ( p, i ) => {
			const [ x, y ] = P( p );
			if ( i ) {
				g.lineTo( x, y );
			} else {
				g.moveTo( x, y );
			}
		} );
		g.closePath();
		g.stroke();
	}
	const numPx = Math.round( 15 * tscale( opts ) );
	g.font = `600 ${ numPx }px ${ famFor( opts ) }`;
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	pts.forEach( ( p, i ) => {
		const [ x, y ] = P( p );
		// The label sits outward from the shape's centroid.
		const dx = p[ 0 ] - cx;
		const dy = p[ 1 ] - cy;
		const dl = Math.hypot( dx, dy ) || 1;
		const lx = x + ( dx / dl ) * ( numPx * 1.05 );
		const ly = y + ( dy / dl ) * ( numPx * 1.05 );
		const first = 0 === i;
		g.fillStyle = first ? accent : INK;
		g.beginPath();
		g.arc( x, y, first ? 6.5 : 4.5, 0, Math.PI * 2 );
		g.fill();
		g.fillStyle = first ? accent : '#4a4f57';
		g.fillText( String( i + 1 ), lx, ly );
	} );
	// The closing hint: last dot connects back to 1.
	const [ lx2, ly2 ] = P( pts[ pts.length - 1 ] );
	const [ fx2, fy2 ] = P( pts[ 0 ] );
	g.strokeStyle = 'rgba(0,0,0,0.25)';
	g.setLineDash( [ 6, 6 ] );
	g.lineWidth = 1.6;
	g.beginPath();
	g.moveTo( lx2, ly2 );
	g.lineTo( fx2, fy2 );
	g.stroke();
	g.setLineDash( [] );
	return c;
}

/* -------------------------------- crossword ------------------------------- */

/**
 * A real crossword from "word: clue" lines: the criss-cross layout is
 * reused, then start cells get numbers in reading order and the clues
 * split into Across and Down lists.
 *
 * @param {Object} cc      From buildCrissCross.
 * @param {Object} clueMap UPPERCASED word -> clue text.
 * @return {Object} { numbers: Map "x,y"->n, across, down } with
 *                  entries { n, clue, len }.
 */
export function buildCrosswordClues( cc, clueMap = {} ) {
	const { placed } = cc;
	// Re-derive the crop offset the criss-cross applied.
	let minX = Infinity;
	let minY = Infinity;
	for ( const p of placed ) {
		minX = Math.min( minX, p.x );
		minY = Math.min( minY, p.y );
	}
	const starts = placed.map( ( p ) => ( {
		x: p.x - minX,
		y: p.y - minY,
		dx: p.dx,
		dy: p.dy,
		word: p.word,
	} ) );
	starts.sort( ( a, b ) => a.y - b.y || a.x - b.x );
	const numbers = new Map();
	const across = [];
	const down = [];
	let n = 0;
	for ( const p2 of starts ) {
		const key = `${ p2.x },${ p2.y }`;
		let num = numbers.get( key );
		if ( ! num ) {
			num = ++n;
			numbers.set( key, num );
		}
		const entry = {
			n: num,
			clue: clueMap[ p2.word ] || '',
			len: p2.word.length,
			word: p2.word,
		};
		if ( p2.dx ) {
			across.push( entry );
		} else {
			down.push( entry );
		}
	}
	return { numbers, across, down };
}

/**
 * Render the crossword sheet (or its solution). Unlike the criss-cross
 * there is NO prefill - the clues carry the puzzle.
 */
export function renderCrossword( like, cc, cw, opts = {} ) {
	const { w, h, letters } = cc;
	const { numbers, across, down } = cw;
	const CELL = 52;
	const M = 60;
	const tb = titleBlock( opts );
	const cluePx = Math.round( 16 * tscale( opts ) );
	const clueLh = Math.round( cluePx * 1.45 );
	const listRows = Math.max( across.length, down.length ) + 2;
	const gw = Math.max( w * CELL, 11 * CELL );
	const c = makeCanvas(
		like,
		gw + M * 2,
		tb.h + h * CELL + M * 2 + 40 + listRows * clueLh
	);
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, c.width, c.height );
	drawTitle( g, tb, opts, c.width / 2, M - 16 );
	const ox = M + ( gw - w * CELL ) / 2;
	const oy = M + tb.h;
	for ( let y = 0; y < h; y++ ) {
		for ( let x = 0; x < w; x++ ) {
			const ch = letters[ y * w + x ];
			if ( ! ch ) {
				continue;
			}
			const px = ox + x * CELL;
			const py = oy + y * CELL;
			g.fillStyle = '#ffffff';
			g.fillRect( px, py, CELL, CELL );
			g.strokeStyle = INK;
			g.lineWidth = 2;
			g.strokeRect( px + 1, py + 1, CELL - 2, CELL - 2 );
			const num = numbers.get( `${ x },${ y }` );
			if ( num ) {
				g.fillStyle = accentOf( opts );
				g.font = `700 ${ Math.round( CELL * 0.24 ) }px ${ famFor(
					opts
				) }`;
				g.textAlign = 'left';
				g.textBaseline = 'top';
				g.fillText( String( num ), px + 5, py + 4 );
			}
			if ( opts.solution ) {
				g.fillStyle = SOLVE;
				g.font = `700 ${ Math.round( CELL * 0.5 ) }px ${ famFor(
					opts
				) }`;
				g.textAlign = 'center';
				g.textBaseline = 'middle';
				g.fillText( ch, px + CELL / 2, py + CELL / 2 + 3 );
			}
		}
	}
	// Two clue columns.
	const colW = ( gw - 40 ) / 2;
	const ly0 = oy + h * CELL + 40;
	const list = ( entries, header, lx ) => {
		g.fillStyle = accentOf( opts );
		g.font = `700 ${ cluePx + 2 }px ${ famFor( opts ) }`;
		g.textAlign = 'left';
		g.textBaseline = 'alphabetic';
		g.fillText( header, lx, ly0 );
		g.fillStyle = '#31353b';
		g.font = `500 ${ cluePx }px ${ famFor( opts ) }`;
		entries.forEach( ( e, i ) => {
			const text = `${ e.n }. ${ e.clue || '' } (${ e.len })`;
			// Trim overlong clues to the column.
			let out = text;
			while ( out.length > 8 && g.measureText( out ).width > colW - 8 ) {
				out = out.slice( 0, -1 );
			}
			if ( out !== text ) {
				out = out.slice( 0, -1 ) + '…';
			}
			g.fillText( out, lx, ly0 + ( i + 1.4 ) * clueLh );
		} );
	};
	list( across, opts.acrossLabel || 'Across →', M );
	list( down, opts.downLabel || 'Down ↓', M + colW + 40 );
	return c;
}

/* -------------------------------- nonogram -------------------------------- */

/**
 * Deduce one nonogram line: every legal placement of the runs against
 * the known cells, intersected. Cells all placements agree on become
 * facts.
 *
 * @param {Int8Array} know Line state (-1 unknown, 0 empty, 1 filled).
 * @param {Array}     runs Clue run lengths.
 * @return {Int8Array|null} Merged deduction, null when contradictory.
 */
export function solveNonogramLine( know, runs ) {
	const L = know.length;
	let merged = null;
	const acc = new Int8Array( L );
	const rec = ( idx, pos ) => {
		if ( idx === runs.length ) {
			for ( let i = pos; i < L; i++ ) {
				if ( 1 === know[ i ] ) {
					return;
				}
				acc[ i ] = 0;
			}
			if ( ! merged ) {
				merged = Int8Array.from( acc );
			} else {
				for ( let i = 0; i < L; i++ ) {
					if ( merged[ i ] !== acc[ i ] ) {
						merged[ i ] = -1;
					}
				}
			}
			return;
		}
		const run = runs[ idx ];
		let restMin = 0;
		for ( let k = idx + 1; k < runs.length; k++ ) {
			restMin += runs[ k ] + 1;
		}
		for ( let s = pos; s + run + restMin <= L; s++ ) {
			// Skipping past a known filled cell is illegal - stop sliding.
			if ( s > pos && 1 === know[ s - 1 ] ) {
				break;
			}
			let ok = true;
			for ( let i = s; i < s + run && ok; i++ ) {
				if ( 0 === know[ i ] ) {
					ok = false;
				}
			}
			if ( ok && s + run < L && 1 === know[ s + run ] ) {
				ok = false;
			}
			if ( ! ok ) {
				continue;
			}
			for ( let i = pos; i < s; i++ ) {
				acc[ i ] = 0;
			}
			for ( let i = s; i < s + run; i++ ) {
				acc[ i ] = 1;
			}
			if ( s + run < L ) {
				acc[ s + run ] = 0;
				rec( idx + 1, s + run + 1 );
			} else {
				rec( idx + 1, s + run );
			}
		}
	};
	rec( 0, 0 );
	return merged;
}

/**
 * Build a nonogram from a shape or image silhouette. Line logic alone
 * must crack it: whenever the solver stalls, one stalled cell is
 * revealed as a printed hint (a dot for filled, a small x for empty)
 * and solving continues - so the sheet is GUARANTEED solvable.
 *
 * @param {Object} like Canvas-like.
 * @param {Object} opts { shape (MAZE_SHAPES), letter, maskImage,
 *                        size 10..25 }.
 * @return {Object} { size, mask, rowClues, colClues, givens: Map
 *                    "x,y" -> 0|1 }
 */
export function buildNonogram( like, opts = {} ) {
	const size = Math.max( 10, Math.min( 25, opts.size || 15 ) );
	const shape = MAZE_SHAPES.includes( opts.shape ) ? opts.shape : 'circle';
	const mask = buildMask( like, shape, opts.letter, size, opts.maskImage );
	const runsOf = ( cells ) => {
		const runs = [];
		let n = 0;
		for ( const v of cells ) {
			if ( v ) {
				n++;
			} else if ( n ) {
				runs.push( n );
				n = 0;
			}
		}
		if ( n ) {
			runs.push( n );
		}
		return runs;
	};
	const rowClues = [];
	const colClues = [];
	for ( let y = 0; y < size; y++ ) {
		rowClues.push(
			runsOf(
				Array.from( { length: size }, ( _, x ) => mask[ y * size + x ] )
			)
		);
	}
	for ( let x = 0; x < size; x++ ) {
		colClues.push(
			runsOf(
				Array.from( { length: size }, ( _, y ) => mask[ y * size + x ] )
			)
		);
	}
	// Solve by line logic; reveal stalled cells as givens until it cracks.
	const givens = new Map();
	const know = new Int8Array( size * size ).fill( -1 );
	for ( let guard = 0; guard < size * size; guard++ ) {
		let changed = true;
		while ( changed ) {
			changed = false;
			for ( let y = 0; y < size; y++ ) {
				const line = Int8Array.from(
					{ length: size },
					( _, x ) => know[ y * size + x ]
				);
				const ded = solveNonogramLine( line, rowClues[ y ] );
				if ( ! ded ) {
					continue;
				}
				for ( let x = 0; x < size; x++ ) {
					if ( ded[ x ] >= 0 && know[ y * size + x ] < 0 ) {
						know[ y * size + x ] = ded[ x ];
						changed = true;
					}
				}
			}
			for ( let x = 0; x < size; x++ ) {
				const line = Int8Array.from(
					{ length: size },
					( _, y ) => know[ y * size + x ]
				);
				const ded = solveNonogramLine( line, colClues[ x ] );
				if ( ! ded ) {
					continue;
				}
				for ( let y = 0; y < size; y++ ) {
					if ( ded[ y ] >= 0 && know[ y * size + x ] < 0 ) {
						know[ y * size + x ] = ded[ y ];
						changed = true;
					}
				}
			}
		}
		let stalled = -1;
		for ( let i = 0; i < size * size; i++ ) {
			if ( know[ i ] < 0 ) {
				stalled = i;
				break;
			}
		}
		if ( stalled < 0 ) {
			break;
		}
		// Prefer revealing a stalled FILLED cell (the classic hint dot).
		let pick = -1;
		for ( let i = stalled; i < size * size; i++ ) {
			if ( know[ i ] < 0 && mask[ i ] ) {
				pick = i;
				break;
			}
		}
		if ( pick < 0 ) {
			pick = stalled;
		}
		know[ pick ] = mask[ pick ] ? 1 : 0;
		givens.set(
			`${ pick % size },${ ( pick / size ) | 0 }`,
			mask[ pick ] ? 1 : 0
		);
	}
	return { size, mask, rowClues, colClues, givens };
}

/**
 * Render the nonogram sheet (or its solution).
 */
export function renderNonogram( like, ng, opts = {} ) {
	const { size, mask, rowClues, colClues, givens } = ng;
	const CELL = 34;
	const cluePx = 15;
	const maxRow = Math.max( 1, ...rowClues.map( ( r ) => r.length ) );
	const maxCol = Math.max( 1, ...colClues.map( ( r ) => r.length ) );
	const left = 24 + maxRow * ( cluePx + 8 );
	const topClue = 20 + maxCol * ( cluePx + 6 );
	const M = 50;
	const tb = titleBlock( opts );
	const s = size * CELL;
	const c = makeCanvas( like, M * 2 + left + s, M * 2 + tb.h + topClue + s );
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, c.width, c.height );
	drawTitle( g, tb, opts, c.width / 2, M - 20 );
	const ox = M + left;
	const oy = M + tb.h + topClue;
	// Cells: solution fill, hint dots and x marks.
	for ( let y = 0; y < size; y++ ) {
		for ( let x = 0; x < size; x++ ) {
			const px = ox + x * CELL;
			const py = oy + y * CELL;
			const giv = givens.get( `${ x },${ y }` );
			if ( opts.solution && mask[ y * size + x ] ) {
				g.fillStyle = accentOf( opts );
				g.fillRect( px + 1, py + 1, CELL - 2, CELL - 2 );
			} else if ( 1 === giv ) {
				g.fillStyle = INK;
				g.beginPath();
				g.arc(
					px + CELL / 2,
					py + CELL / 2,
					CELL * 0.14,
					0,
					Math.PI * 2
				);
				g.fill();
			} else if ( 0 === giv && ! opts.solution ) {
				g.strokeStyle = 'rgba(0,0,0,0.45)';
				g.lineWidth = 1.6;
				g.beginPath();
				g.moveTo( px + CELL * 0.34, py + CELL * 0.34 );
				g.lineTo( px + CELL * 0.66, py + CELL * 0.66 );
				g.moveTo( px + CELL * 0.66, py + CELL * 0.34 );
				g.lineTo( px + CELL * 0.34, py + CELL * 0.66 );
				g.stroke();
			}
		}
	}
	// Grid: thin lines, thick every fifth, accent frame.
	for ( let i = 0; i <= size; i++ ) {
		const major = 0 === i % 5 || i === size;
		g.strokeStyle = major ? INK : 'rgba(0,0,0,0.35)';
		g.lineWidth = major ? 2.2 : 1;
		g.beginPath();
		g.moveTo( ox + i * CELL, oy );
		g.lineTo( ox + i * CELL, oy + s );
		g.moveTo( ox, oy + i * CELL );
		g.lineTo( ox + s, oy + i * CELL );
		g.stroke();
	}
	g.strokeStyle = accentOf( opts );
	g.lineWidth = 3;
	g.strokeRect( ox, oy, s, s );
	// Clues.
	g.fillStyle = INK;
	g.font = `600 ${ cluePx }px ${ famFor( opts ) }`;
	g.textAlign = 'right';
	g.textBaseline = 'middle';
	rowClues.forEach( ( runs, y ) => {
		const cy = oy + y * CELL + CELL / 2;
		runs.forEach( ( run, k ) => {
			g.fillText(
				String( run ),
				ox - 10 - ( runs.length - 1 - k ) * ( cluePx + 8 ),
				cy
			);
		} );
		if ( ! runs.length ) {
			g.fillText( '0', ox - 10, cy );
		}
	} );
	g.textAlign = 'center';
	colClues.forEach( ( runs, x ) => {
		const cx = ox + x * CELL + CELL / 2;
		runs.forEach( ( run, k ) => {
			g.fillText(
				String( run ),
				cx,
				oy - 12 - ( runs.length - 1 - k ) * ( cluePx + 6 )
			);
		} );
		if ( ! runs.length ) {
			g.fillText( '0', cx, oy - 12 );
		}
	} );
	return c;
}

/* -------------------------------- anagrams -------------------------------- */

/**
 * Anagram rows: every word seeded-scrambled, never equal to itself.
 *
 * @param {Array}  words Raw list.
 * @param {Object} opts  { seed }.
 * @return {Object|null} { items: [ { word, scrambled } ] }
 */
export function buildAnagram( words, opts = {} ) {
	const rand = rng( ( opts.seed || 31 ) * 17 + 3 );
	const clean = Array.from(
		new Set(
			( words || [] )
				.map( ( w ) =>
					String( w )
						.toUpperCase()
						.replace( /[^A-ZÄÖÜ]/g, '' )
				)
				.filter( ( w ) => w.length >= 3 && w.length <= 14 )
		)
	).slice( 0, 12 );
	if ( ! clean.length ) {
		return null;
	}
	const items = clean.map( ( word ) => {
		let scrambled = word;
		for ( let tries = 0; tries < 12 && scrambled === word; tries++ ) {
			const a = word.split( '' );
			for ( let i = a.length - 1; i > 0; i-- ) {
				const j = Math.floor( rand() * ( i + 1 ) );
				[ a[ i ], a[ j ] ] = [ a[ j ], a[ i ] ];
			}
			scrambled = a.join( '' );
		}
		if ( scrambled === word ) {
			scrambled = word.split( '' ).reverse().join( '' );
		}
		return { word, scrambled };
	} );
	return { items };
}

/**
 * Render the anagram sheet (or its solution).
 */
export function renderAnagram( like, an, opts = {} ) {
	const { items } = an;
	const BOX = 44;
	const GAP = 6;
	const M = 60;
	const tb = titleBlock( opts );
	const maxLen = Math.max( ...items.map( ( it ) => it.word.length ) );
	const rowW = maxLen * ( BOX + GAP ) * 2 + 70;
	const rowH = BOX + 34;
	const W = Math.max( 720, rowW + M * 2 );
	const H = tb.h + items.length * rowH + M * 2;
	const c = makeCanvas( like, W, H );
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, c.width, c.height );
	drawTitle( g, tb, opts, W / 2, M - 16 );
	const accent = accentOf( opts );
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	items.forEach( ( it, r ) => {
		const y = M + tb.h + r * rowH;
		let x = M;
		// Scrambled letters on accent tiles.
		for ( const ch of it.scrambled ) {
			g.fillStyle = accent;
			g.globalAlpha = 0.16;
			g.fillRect( x, y, BOX, BOX );
			g.globalAlpha = 1;
			g.strokeStyle = accent;
			g.lineWidth = 2;
			g.strokeRect( x + 1, y + 1, BOX - 2, BOX - 2 );
			g.fillStyle = INK;
			g.font = `700 ${ Math.round( BOX * 0.52 ) }px ${ famFor( opts ) }`;
			g.fillText( ch, x + BOX / 2, y + BOX / 2 + 1 );
			x += BOX + GAP;
		}
		// Arrow.
		x = M + maxLen * ( BOX + GAP ) + 8;
		g.fillStyle = '#6a7078';
		g.font = `700 ${ Math.round( BOX * 0.5 ) }px ${ famFor( opts ) }`;
		g.fillText( '→', x + 16, y + BOX / 2 );
		x += 54;
		// Answer boxes.
		for ( let i = 0; i < it.word.length; i++ ) {
			g.fillStyle = '#ffffff';
			g.fillRect( x, y, BOX, BOX );
			g.strokeStyle = INK;
			g.lineWidth = 2;
			g.strokeRect( x + 1, y + 1, BOX - 2, BOX - 2 );
			const show = opts.solution || ( opts.hint && 0 === i );
			if ( show ) {
				g.fillStyle =
					opts.solution && ! ( opts.hint && 0 === i )
						? SOLVE
						: accent;
				g.font = `700 ${ Math.round( BOX * 0.52 ) }px ${ famFor(
					opts
				) }`;
				g.fillText( it.word[ i ], x + BOX / 2, y + BOX / 2 + 1 );
			}
			x += BOX + GAP;
		}
	} );
	return c;
}

/* ------------------------------- game sheets ------------------------------ */

/**
 * Printable game sheets: the categories game (a lettered table), the
 * battleships double grid, or a dots-and-boxes field. No puzzle logic,
 * no solution - just very good paper.
 *
 * @param {Object} like Canvas-like.
 * @param {Object} opts { game 'slf'|'ships'|'boxes', categories [],
 *                        rounds, boxCols, labels { letter, points,
 *                        fleet, own, shots }, title, colors, font,
 *                        textScale }.
 * @return {HTMLCanvasElement}
 */
export function renderGameSheet( like, opts = {} ) {
	const game = opts.game || 'slf';
	const M = 56;
	const tb = titleBlock( opts );
	const accent = accentOf( opts );
	const L = opts.labels || {};
	if ( 'ships' === game ) {
		const CELL = 40;
		const GRID = 10 * CELL;
		const headH = 44;
		const legendH = 76;
		const W = GRID + CELL + M * 2;
		const H = tb.h + legendH + 2 * ( headH + CELL + GRID ) + 40 + M * 2;
		const c = makeCanvas( like, W, H );
		const g = c.getContext( '2d' );
		g.fillStyle = '#ffffff';
		g.fillRect( 0, 0, W, H );
		drawTitle( g, tb, opts, W / 2, M - 16 );
		// Fleet legend: 5 4 3 3 2 as box strips.
		let lx = M;
		const ly = M + tb.h;
		g.fillStyle = INK;
		g.font = `600 ${ Math.round( 16 * tscale( opts ) ) }px ${ famFor(
			opts
		) }`;
		g.textAlign = 'left';
		g.textBaseline = 'middle';
		g.fillText( L.fleet || 'Fleet:', lx, ly + 14 );
		lx += g.measureText( L.fleet || 'Fleet:' ).width + 16;
		for ( const len of [ 5, 4, 3, 3, 2 ] ) {
			for ( let i = 0; i < len; i++ ) {
				g.strokeStyle = accent;
				g.lineWidth = 2;
				g.strokeRect( lx, ly, 22, 22 );
				lx += 22;
			}
			lx += 14;
		}
		let oy = ly + legendH - 20;
		for ( const label of [ L.own || 'My fleet', L.shots || 'My shots' ] ) {
			g.fillStyle = accent;
			g.font = `700 ${ Math.round( 19 * tscale( opts ) ) }px ${ famFor(
				opts
			) }`;
			g.textAlign = 'left';
			g.fillText( label, M, oy + headH / 2 );
			const gx = M + CELL;
			const gy = oy + headH + CELL;
			g.font = `600 15px ${ famFor( opts ) }`;
			g.fillStyle = INK;
			g.textAlign = 'center';
			for ( let i = 0; i < 10; i++ ) {
				g.fillText(
					String.fromCharCode( 65 + i ),
					gx + i * CELL + CELL / 2,
					gy - CELL / 2
				);
				g.fillText(
					String( i + 1 ),
					gx - CELL / 2,
					gy + i * CELL + CELL / 2
				);
			}
			for ( let i = 0; i <= 10; i++ ) {
				g.strokeStyle = 'rgba(0,0,0,0.5)';
				g.lineWidth = 1;
				g.beginPath();
				g.moveTo( gx + i * CELL, gy );
				g.lineTo( gx + i * CELL, gy + GRID );
				g.moveTo( gx, gy + i * CELL );
				g.lineTo( gx + GRID, gy + i * CELL );
				g.stroke();
			}
			g.strokeStyle = accent;
			g.lineWidth = 3;
			g.strokeRect( gx, gy, GRID, GRID );
			oy = gy + GRID + 40 - headH;
		}
		return c;
	}
	if ( 'boxes' === game ) {
		const cols = Math.max( 8, Math.min( 24, opts.boxCols || 16 ) );
		const rows = Math.round( cols * 0.72 );
		const STEP = Math.min( 46, Math.round( 860 / cols ) );
		const W = cols * STEP + M * 2;
		const H = tb.h + rows * STEP + M * 2 + 60;
		const c = makeCanvas( like, W, H );
		const g = c.getContext( '2d' );
		g.fillStyle = '#ffffff';
		g.fillRect( 0, 0, W, H );
		drawTitle( g, tb, opts, W / 2, M - 16 );
		g.fillStyle = INK;
		for ( let y = 0; y <= rows; y++ ) {
			for ( let x = 0; x <= cols; x++ ) {
				g.beginPath();
				g.arc( M + x * STEP, M + tb.h + y * STEP, 2.4, 0, Math.PI * 2 );
				g.fill();
			}
		}
		// Score line.
		const sy = M + tb.h + rows * STEP + 40;
		g.font = `600 ${ Math.round( 16 * tscale( opts ) ) }px ${ famFor(
			opts
		) }`;
		g.textAlign = 'left';
		g.textBaseline = 'middle';
		g.fillStyle = accent;
		const pts = L.points || 'Points';
		g.fillText( `${ pts }:`, M, sy );
		const pw = g.measureText( `${ pts }:` ).width;
		g.strokeStyle = 'rgba(0,0,0,0.5)';
		g.lineWidth = 1.6;
		for ( let i = 0; i < 2; i++ ) {
			g.beginPath();
			g.moveTo( M + pw + 20 + i * 220, sy + 10 );
			g.lineTo( M + pw + 180 + i * 220, sy + 10 );
			g.stroke();
		}
		return c;
	}
	// Categories game (Stadt-Land-Fluss).
	const cats = ( opts.categories || [] ).slice( 0, 6 );
	if ( ! cats.length ) {
		cats.push( 'A', 'B', 'C' );
	}
	const rounds = Math.max( 6, Math.min( 14, opts.rounds || 10 ) );
	const letterW = 64;
	const ptsW = 80;
	const colW = Math.max(
		110,
		Math.min( 200, Math.round( 780 / cats.length ) )
	);
	const rowH = 52;
	const headHt = 46;
	const W = letterW + cats.length * colW + ptsW + M * 2;
	const H = tb.h + headHt + rounds * rowH + M * 2;
	const c = makeCanvas( like, W, H );
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, W, H );
	drawTitle( g, tb, opts, W / 2, M - 16 );
	const ox = M;
	const oy = M + tb.h;
	// Header band.
	g.fillStyle = accent;
	g.fillRect( ox, oy, W - 2 * M, headHt );
	g.fillStyle = '#ffffff';
	g.font = `700 ${ Math.round( 15 * tscale( opts ) ) }px ${ famFor( opts ) }`;
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	g.fillText( L.letter || 'ABC', ox + letterW / 2, oy + headHt / 2 );
	cats.forEach( ( cat, i ) => {
		let out = cat;
		while ( out.length > 3 && g.measureText( out ).width > colW - 12 ) {
			out = out.slice( 0, -1 );
		}
		g.fillText( out, ox + letterW + i * colW + colW / 2, oy + headHt / 2 );
	} );
	g.fillText(
		L.points || 'Points',
		ox + letterW + cats.length * colW + ptsW / 2,
		oy + headHt / 2
	);
	// Row and column lines.
	g.strokeStyle = 'rgba(0,0,0,0.45)';
	g.lineWidth = 1;
	for ( let r = 0; r <= rounds; r++ ) {
		g.beginPath();
		g.moveTo( ox, oy + headHt + r * rowH );
		g.lineTo( W - M, oy + headHt + r * rowH );
		g.stroke();
	}
	const xs = [ ox, ox + letterW ];
	for ( let i = 1; i <= cats.length; i++ ) {
		xs.push( ox + letterW + i * colW );
	}
	xs.push( W - M );
	for ( const x of xs ) {
		g.beginPath();
		g.moveTo( x, oy );
		g.lineTo( x, oy + headHt + rounds * rowH );
		g.stroke();
	}
	g.strokeStyle = accent;
	g.lineWidth = 3;
	g.strokeRect( ox, oy, W - 2 * M, headHt + rounds * rowH );
	return c;
}

/* ------------------------------- memory cards ----------------------------- */

/**
 * Memory cut-out sheet: every motif twice, seeded shuffle.
 *
 * @param {Array}  motifs Emoji / short strings.
 * @param {Object} opts   { pairs 4..15, seed }.
 * @return {Object|null} { cells, cols, rows }
 */
export function buildMemory( motifs, opts = {} ) {
	const list = Array.from(
		new Set(
			( motifs || [] )
				.map( ( m ) => String( m ).trim() )
				.filter( Boolean )
		)
	);
	const pairs = Math.max( 4, Math.min( 15, opts.pairs || 8 ) );
	if ( list.length < 4 ) {
		return null;
	}
	const rand = rng( ( opts.seed || 37 ) * 19 + pairs );
	const chosen = list.slice( 0, pairs );
	const cells = chosen.concat( chosen );
	for ( let i = cells.length - 1; i > 0; i-- ) {
		const j = Math.floor( rand() * ( i + 1 ) );
		[ cells[ i ], cells[ j ] ] = [ cells[ j ], cells[ i ] ];
	}
	const cols = Math.ceil( Math.sqrt( cells.length ) );
	const rows = Math.ceil( cells.length / cols );
	return { cells, cols, rows };
}

/**
 * Render the memory sheet: fronts with dashed cut lines - or, as the
 * "solution" slot, the matching back sheet for duplex printing.
 */
export function renderMemory( like, mem, opts = {} ) {
	const { cells, cols, rows } = mem;
	const CARD = 150;
	const M = 56;
	const tb = titleBlock( opts );
	const W = cols * CARD + M * 2;
	const H = tb.h + rows * CARD + M * 2;
	const c = makeCanvas( like, W, H );
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, W, H );
	drawTitle( g, tb, opts, W / 2, M - 16 );
	const accent = accentOf( opts );
	const ox = M;
	const oy = M + tb.h;
	for ( let i = 0; i < cells.length; i++ ) {
		const x = ox + ( i % cols ) * CARD;
		const y = oy + ( ( i / cols ) | 0 ) * CARD;
		if ( opts.solution ) {
			// Back: accent frame, diagonal stripes, a question mark.
			g.fillStyle = accent;
			g.globalAlpha = 0.12;
			g.fillRect( x + 4, y + 4, CARD - 8, CARD - 8 );
			g.globalAlpha = 1;
			g.save();
			g.beginPath();
			g.rect( x + 4, y + 4, CARD - 8, CARD - 8 );
			g.clip();
			g.strokeStyle = accent;
			g.globalAlpha = 0.3;
			g.lineWidth = 5;
			for ( let d = -CARD; d < CARD * 2; d += 22 ) {
				g.beginPath();
				g.moveTo( x + d, y );
				g.lineTo( x + d + CARD, y + CARD );
				g.stroke();
			}
			g.globalAlpha = 1;
			g.restore();
			g.fillStyle = accent;
			g.font = `800 ${ Math.round( CARD * 0.34 ) }px ${ famFor( opts ) }`;
			g.textAlign = 'center';
			g.textBaseline = 'middle';
			g.fillText( '?', x + CARD / 2, y + CARD / 2 );
		} else {
			const motif = cells[ i ];
			g.font = /^[A-Za-z0-9ÄÖÜäöüß]/.test( motif )
				? `700 ${ Math.round( CARD * 0.2 ) }px ${ famFor( opts ) }`
				: `${ Math.round( CARD * 0.42 ) }px sans-serif`;
			g.fillStyle = INK;
			g.textAlign = 'center';
			g.textBaseline = 'middle';
			g.fillText( motif, x + CARD / 2, y + CARD / 2, CARD - 24 );
		}
	}
	// Dashed cut lines across the full sheet.
	g.strokeStyle = 'rgba(0,0,0,0.55)';
	g.lineWidth = 1.4;
	g.setLineDash( [ 8, 6 ] );
	for ( let i = 0; i <= cols; i++ ) {
		g.beginPath();
		g.moveTo( ox + i * CARD, oy );
		g.lineTo( ox + i * CARD, oy + rows * CARD );
		g.stroke();
	}
	for ( let i = 0; i <= rows; i++ ) {
		g.beginPath();
		g.moveTo( ox, oy + i * CARD );
		g.lineTo( ox + cols * CARD, oy + i * CARD );
		g.stroke();
	}
	g.setLineDash( [] );
	return c;
}

/* ----------------------------- addition pyramid --------------------------- */

/**
 * Addition pyramid: every brick is the sum of the two below. Givens
 * are chosen so the puzzle stays solvable by pure propagation.
 *
 * @param {Object} opts { rows 5..8, diff 1..3, seed }.
 * @return {Object} { rows, values, given }
 */
export function buildPyramid( opts = {} ) {
	const rows = Math.max( 4, Math.min( 8, opts.rows || 6 ) );
	const rand = rng( ( opts.seed || 17 ) * 11 + rows );
	const values = [];
	for ( let r = rows - 1; r >= 0; r-- ) {
		values[ r ] = [];
	}
	for ( let i = 0; i < rows; i++ ) {
		values[ rows - 1 ][ i ] = 1 + Math.floor( rand() * 9 );
	}
	for ( let r = rows - 2; r >= 0; r-- ) {
		for ( let i = 0; i <= r; i++ ) {
			values[ r ][ i ] = values[ r + 1 ][ i ] + values[ r + 1 ][ i + 1 ];
		}
	}
	const cells = [];
	for ( let r = 0; r < rows; r++ ) {
		for ( let i = 0; i <= r; i++ ) {
			cells.push( [ r, i ] );
		}
	}
	const solvable = ( givenSet ) => {
		const known = new Set( givenSet );
		let changed = true;
		while ( changed ) {
			changed = false;
			for ( let r = 0; r < rows - 1; r++ ) {
				for ( let i = 0; i <= r; i++ ) {
					const a = `${ r }:${ i }`;
					const b = `${ r + 1 }:${ i }`;
					const cc = `${ r + 1 }:${ i + 1 }`;
					const k = [
						known.has( a ),
						known.has( b ),
						known.has( cc ),
					];
					const n = k.filter( Boolean ).length;
					if ( 2 === n ) {
						if ( ! k[ 0 ] ) {
							known.add( a );
						} else if ( ! k[ 1 ] ) {
							known.add( b );
						} else {
							known.add( cc );
						}
						changed = true;
					}
				}
			}
		}
		return known.size === cells.length;
	};
	const ratio = [ 0, 0.62, 0.5, 0.42 ][
		Math.max( 1, Math.min( 3, opts.diff || 2 ) )
	];
	const target = Math.max( rows, Math.round( cells.length * ratio ) );
	const order = cells.slice();
	for ( let i = order.length - 1; i > 0; i-- ) {
		const j = Math.floor( rand() * ( i + 1 ) );
		[ order[ i ], order[ j ] ] = [ order[ j ], order[ i ] ];
	}
	const given = new Set( cells.map( ( [ r, i ] ) => `${ r }:${ i }` ) );
	for ( const [ r, i ] of order ) {
		if ( given.size <= target ) {
			break;
		}
		const key = `${ r }:${ i }`;
		given.delete( key );
		if ( ! solvable( given ) ) {
			given.add( key );
		}
	}
	return { rows, values, given };
}

/**
 * Render the pyramid sheet (or its solution).
 */
export function renderPyramid( like, py, opts = {} ) {
	const { rows, values, given } = py;
	const BW = 92;
	const BH = 58;
	const M = 60;
	const tb = titleBlock( opts );
	const W = rows * BW + M * 2;
	const H = tb.h + rows * BH + M * 2;
	const c = makeCanvas( like, W, H );
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, c.width, c.height );
	drawTitle( g, tb, opts, W / 2, M - 20 );
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	for ( let r = 0; r < rows; r++ ) {
		const rowW = ( r + 1 ) * BW;
		const x0 = ( W - rowW ) / 2;
		for ( let i = 0; i <= r; i++ ) {
			const x = x0 + i * BW;
			const y = M + tb.h + r * BH;
			g.fillStyle = '#ffffff';
			g.fillRect( x, y, BW, BH );
			g.strokeStyle = 0 === r ? accentOf( opts ) : INK;
			g.lineWidth = 0 === r ? 3 : 2;
			g.strokeRect( x + 1, y + 1, BW - 2, BH - 2 );
			const isGiven = given.has( `${ r }:${ i }` );
			if ( isGiven || opts.solution ) {
				g.fillStyle = isGiven ? INK : SOLVE;
				g.font = `${ isGiven ? 700 : 400 } ${ Math.round(
					BH * 0.46
				) }px ${ famFor( opts ) }`;
				g.fillText(
					String( values[ r ][ i ] ),
					x + BW / 2,
					y + BH / 2 + 1
				);
			}
		}
	}
	return c;
}
