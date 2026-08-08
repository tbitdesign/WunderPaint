/**
 * Seamless Patterns - seeded seamless-tile engine.
 *
 * A pattern is a square design cell filled by one of ten motif
 * builders (scatter doodles, grids, diamonds, polka dots, stripes,
 * waves, fish scales, gingham, chevron, terrazzo), repeated by a
 * rapport (straight, half-drop, brick, mirror). Everything derives
 * from a seed plus dials, so the same params always produce the same
 * tile - and every element crossing a cell edge re-enters on the
 * opposite side, which is what makes the tile mathematically seamless.
 *
 * Shapes are normalized to CELL units (0..1). The painter and the SVG
 * serializer both draw each shape at all nine +-(cols,rows) offsets,
 * so wraparound continuity is structural, not per-motif fiddling.
 */

const TAU = Math.PI * 2;

/* ---------------------------------- rng ---------------------------------- */

/** Deterministic PRNG (mulberry32). */
export function rng( seed ) {
	let a = seed >>> 0;
	return function () {
		a |= 0;
		a = ( a + 0x6d2b79f5 ) | 0;
		let t = Math.imul( a ^ ( a >>> 15 ), 1 | a );
		t = ( t + Math.imul( t ^ ( t >>> 7 ), 61 | t ) ) ^ t;
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;
	};
}

export const pick = ( r, list ) => list[ Math.floor( r() * list.length ) ];

/* -------------------------------- palettes ------------------------------- */

export const PALETTES = [
	{ id: 'nordlicht', label: 'Northern Lights', colors: [ '#1b3a5b', '#2e6f95', '#54a0bf', '#9fd0dc', '#f4ebd9' ] },
	{ id: 'sunset', label: 'Sunset', colors: [ '#2d1b4e', '#93329e', '#e4508f', '#ff7b54', '#ffd56b' ] },
	{ id: 'bauhaus', label: 'Bauhaus', colors: [ '#e63946', '#f1a208', '#2a9d8f', '#1d3557', '#f4f1de' ] },
	{ id: 'ozean', label: 'Ocean', colors: [ '#0b2545', '#13497b', '#1d70a2', '#5ea8c4', '#bfe0e2' ] },
	{ id: 'terracotta', label: 'Terracotta', colors: [ '#5c3a2e', '#a4573e', '#d98156', '#ecb98a', '#f6e7cb' ] },
	{ id: 'pastell', label: 'Pastel', colors: [ '#b5c7eb', '#f2b8c6', '#f7e3af', '#bfe3c0', '#e8d9f0' ] },
	{ id: 'neonNoir', label: 'Neon Noir', colors: [ '#0d0221', '#5f0f9f', '#c81d77', '#ff5f6d', '#22e4ac' ] },
	{ id: 'salbei', label: 'Sage', colors: [ '#3a4f41', '#6b8f71', '#a3c4a8', '#d9e5d6', '#f2efe9' ] },
	{ id: 'mono', label: 'Ink', colors: [ '#14161a', '#3c4048', '#71767f', '#aab0b8', '#e8eaee' ] },
	{ id: 'royal', label: 'Royal', colors: [ '#1a1a40', '#270082', '#7a0bc0', '#fa58b6', '#ffe5ae' ] },
	{ id: 'zitrus', label: 'Citrus', colors: [ '#144d3a', '#2c8c5b', '#8fc93a', '#e4e34b', '#f7f6d5' ] },
	{ id: 'rose', label: 'Rosé', colors: [ '#4a1d33', '#8c2f5a', '#c9527e', '#eb95ab', '#f9dcd9' ] },
];

export const paletteById = ( id ) =>
	PALETTES.find( ( p ) => p.id === id ) || PALETTES[ 0 ];

export function hslHex( h, s, l ) {
	h = ( ( h % 360 ) + 360 ) % 360;
	s = Math.max( 0, Math.min( 1, s ) );
	l = Math.max( 0, Math.min( 1, l ) );
	const c = ( 1 - Math.abs( 2 * l - 1 ) ) * s;
	const x = c * ( 1 - Math.abs( ( ( h / 60 ) % 2 ) - 1 ) );
	const m = l - c / 2;
	const seg = Math.floor( h / 60 );
	const rgb1 = [
		[ c, x, 0 ],
		[ x, c, 0 ],
		[ 0, c, x ],
		[ 0, x, c ],
		[ x, 0, c ],
		[ c, 0, x ],
	][ seg ] || [ 0, 0, 0 ];
	return (
		'#' +
		rgb1
			.map( ( v ) =>
				Math.round( ( v + m ) * 255 )
					.toString( 16 )
					.padStart( 2, '0' )
			)
			.join( '' )
	);
}

const hexRgb = ( hex ) => [
	parseInt( hex.slice( 1, 3 ), 16 ),
	parseInt( hex.slice( 3, 5 ), 16 ),
	parseInt( hex.slice( 5, 7 ), 16 ),
];

/** Brand-color palette: five harmonic stops dark -> light around hex. */
export function customPalette( hex ) {
	const [ r, g, b ] = hexRgb(
		/^#[0-9a-f]{6}$/i.test( hex || '' ) ? hex : '#3b66ff'
	).map( ( v ) => v / 255 );
	const max = Math.max( r, g, b );
	const min = Math.min( r, g, b );
	const l = ( max + min ) / 2;
	const d = max - min;
	const s = 0 === d ? 0 : d / ( 1 - Math.abs( 2 * l - 1 ) );
	let h = 0;
	if ( d ) {
		if ( max === r ) {
			h = ( ( ( g - b ) / d ) % 6 ) * 60;
		} else if ( max === g ) {
			h = ( ( b - r ) / d + 2 ) * 60;
		} else {
			h = ( ( r - g ) / d + 4 ) * 60;
		}
	}
	return {
		id: 'custom',
		label: 'Custom',
		colors: [
			hslHex( h, s * 0.9, Math.max( 0.14, l * 0.35 ) ),
			hslHex( h - 16, s, Math.min( 0.62, Math.max( 0.3, l * 0.8 ) ) ),
			hslHex( h, s, l ),
			hslHex( h + 16, s * 0.85, Math.min( 0.8, l * 1.25 + 0.08 ) ),
			hslHex( h + 4, s * 0.45, 0.93 ),
		],
	};
}

/** Validated brand-kit palette from P.kitColors, or null. */
export function kitPalette( P ) {
	const colors = ( P.kitColors || [] )
		.filter( ( c ) => /^#[0-9a-f]{6}$/i.test( c ) )
		.slice( 0, 8 );
	return colors.length >= 2
		? { id: 'kit', label: P.kitName || 'Brand Kit', colors }
		: null;
}

const basePalette = ( P ) =>
	( 'kit' === P.palette && kitPalette( P ) ) ||
	( 'custom' === P.palette
		? customPalette( P.customBase )
		: paletteById( P.palette ) );

/** Effective palette for P: brand kit, custom base or curated. */
export function palOf( P ) {
	const pal = basePalette( P );
	const colors = P.reverse ? pal.colors.slice().reverse() : pal.colors;
	return { ...pal, colors };
}

/**
 * Background color: '' transparent, palette 'dark'/'light', or custom.
 * Derived from the UNREVERSED palette so light stays light.
 */
export function bgColor( P ) {
	if ( ! P.bg ) {
		return '';
	}
	if ( 'custom' === P.bg ) {
		return /^#[0-9a-f]{6}$/i.test( P.bgCustom || '' )
			? P.bgCustom
			: '#ffffff';
	}
	const pal = basePalette( P );
	return 'dark' === P.bg
		? pal.colors[ 0 ]
		: pal.colors[ pal.colors.length - 1 ];
}

/**
 * Drawing colors: on a palette background the matching end of the
 * palette is excluded, so no element vanishes into the ground.
 */
function drawColors( P ) {
	const colors = palOf( P ).colors.slice();
	const bg = bgColor( P );
	const filtered = colors.filter( ( c ) => c !== bg );
	return filtered.length >= 2 ? filtered : colors;
}

const colFor = ( colors, i, P ) => {
	const n = colors.length;
	const idx = ( ( ( i + ( P.colorway || 0 ) ) % n ) + n ) % n;
	return colors[ idx ];
};

/* --------------------------------- glyphs -------------------------------- */

// Glyph space is -0.5..0.5. A glyph is a list of primitives:
// { pts, closed, fill } draws a filled poly, { pts, closed:false, w }
// strokes a polyline with width w relative to the glyph size.

const circlePts = ( cx, cy, r, n = 34 ) => {
	const pts = [];
	for ( let i = 0; i < n; i++ ) {
		const a = ( i / n ) * TAU;
		pts.push( [ cx + Math.cos( a ) * r, cy + Math.sin( a ) * r ] );
	}
	return pts;
};

const arcPts = ( cx, cy, r, a0, a1, n = 22 ) => {
	const pts = [];
	for ( let i = 0; i <= n; i++ ) {
		const a = a0 + ( ( a1 - a0 ) * i ) / n;
		pts.push( [ cx + Math.cos( a ) * r, cy + Math.sin( a ) * r ] );
	}
	return pts;
};

const regularPts = ( n, r, rot = -Math.PI / 2 ) => {
	const pts = [];
	for ( let i = 0; i < n; i++ ) {
		const a = rot + ( i / n ) * TAU;
		pts.push( [ Math.cos( a ) * r, Math.sin( a ) * r ] );
	}
	return pts;
};

const starPts = ( spikes, ro, ri ) => {
	const pts = [];
	for ( let i = 0; i < spikes * 2; i++ ) {
		const a = -Math.PI / 2 + ( i / ( spikes * 2 ) ) * TAU;
		const r = i % 2 ? ri : ro;
		pts.push( [ Math.cos( a ) * r, Math.sin( a ) * r ] );
	}
	return pts;
};

const heartPts = ( s = 0.031 ) => {
	const pts = [];
	for ( let i = 0; i < 40; i++ ) {
		const t = ( i / 40 ) * TAU;
		pts.push( [
			16 * Math.pow( Math.sin( t ), 3 ) * s,
			-(
				13 * Math.cos( t ) -
				5 * Math.cos( 2 * t ) -
				2 * Math.cos( 3 * t ) -
				Math.cos( 4 * t )
			) * s,
		] );
	}
	return pts;
};

// Organic blob: fixed fourier wobble per variant (no rng - glyphs are
// data, randomness lives in placement).
const blobPts = ( harm ) => {
	const pts = [];
	for ( let i = 0; i < 44; i++ ) {
		const a = ( i / 44 ) * TAU;
		let r = 0.4;
		for ( const [ k, amp, ph ] of harm ) {
			r += amp * Math.sin( k * a + ph );
		}
		pts.push( [ Math.cos( a ) * r, Math.sin( a ) * r ] );
	}
	return pts;
};

const sinePts = ( periods, amp, n = 40 ) => {
	const pts = [];
	for ( let i = 0; i <= n; i++ ) {
		const x = i / n - 0.5;
		pts.push( [ x, amp * Math.sin( periods * TAU * ( x + 0.5 ) ) ] );
	}
	return pts;
};

const leafPrim = ( len, wid, cx = 0, cy = 0, rot = 0 ) => {
	const pts = [];
	for ( let i = 0; i <= 20; i++ ) {
		const t = i / 20;
		pts.push( [ ( t - 0.5 ) * len, -Math.sin( t * Math.PI ) * wid ] );
	}
	for ( let i = 20; i >= 0; i-- ) {
		const t = i / 20;
		pts.push( [ ( t - 0.5 ) * len, Math.sin( t * Math.PI ) * wid ] );
	}
	const c = Math.cos( rot );
	const s = Math.sin( rot );
	return {
		pts: pts.map( ( [ x, y ] ) => [
			cx + x * c - y * s,
			cy + x * s + y * c,
		] ),
		closed: true,
		fill: true,
	};
};

const P_FILL = ( pts ) => ( { pts, closed: true, fill: true } );
const P_STROKE = ( pts, w = 0.14, closed = false ) => ( {
	pts,
	closed,
	fill: false,
	w,
} );

export const GLYPH_SETS = [
	{
		id: 'geo',
		label: 'Geometric',
		glyphs: [
			[ P_FILL( circlePts( 0, 0, 0.36 ) ) ],
			[ P_STROKE( circlePts( 0, 0, 0.33 ), 0.15, true ) ],
			[ P_FILL( regularPts( 3, 0.4 ) ) ],
			[ P_STROKE( regularPts( 4, 0.4, 0 ), 0.13, true ) ],
			[
				P_FILL( [
					[ -0.11, -0.4 ], [ 0.11, -0.4 ], [ 0.11, -0.11 ],
					[ 0.4, -0.11 ], [ 0.4, 0.11 ], [ 0.11, 0.11 ],
					[ 0.11, 0.4 ], [ -0.11, 0.4 ], [ -0.11, 0.11 ],
					[ -0.4, 0.11 ], [ -0.4, -0.11 ], [ -0.11, -0.11 ],
				] ),
			],
			[ P_FILL( arcPts( 0, 0.1, 0.38, Math.PI, TAU ) ) ],
		],
	},
	{
		id: 'memphis',
		label: 'Memphis',
		glyphs: [
			[ P_STROKE( sinePts( 2.5, 0.14 ), 0.13 ) ],
			[
				P_STROKE(
					[
						[ -0.42, 0.12 ], [ -0.21, -0.12 ], [ 0, 0.12 ],
						[ 0.21, -0.12 ], [ 0.42, 0.12 ],
					],
					0.13
				),
			],
			[ P_STROKE( arcPts( 0, 0.08, 0.36, Math.PI * 1.05, TAU * 0.98 ), 0.15 ) ],
			[
				P_STROKE( [ [ -0.3, -0.3 ], [ 0.3, 0.3 ] ], 0.14 ),
				P_STROKE( [ [ 0.3, -0.3 ], [ -0.3, 0.3 ] ], 0.14 ),
			],
			[
				P_FILL(
					arcPts( -0.22, 0, 0.16, Math.PI / 2, Math.PI * 1.5 ).concat(
						arcPts( 0.22, 0, 0.16, -Math.PI / 2, Math.PI / 2 )
					)
				),
			],
			[ P_STROKE( regularPts( 3, 0.38 ), 0.12, true ) ],
		],
	},
	{
		id: 'botanik',
		label: 'Botanical',
		glyphs: [
			[
				leafPrim( 0.85, 0.2 ),
				P_STROKE( [ [ -0.4, 0 ], [ 0.33, 0 ] ], 0.045 ),
			],
			[
				P_STROKE( [ [ 0, 0.45 ], [ 0, -0.3 ] ], 0.055 ),
				leafPrim( 0.34, 0.09, -0.14, -0.02, -0.85 ),
				leafPrim( 0.34, 0.09, 0.14, -0.08, 0.85 ),
				leafPrim( 0.3, 0.08, 0, -0.36, Math.PI / 2 ),
			],
			[
				P_FILL( circlePts( 0, -0.24, 0.14 ) ),
				P_FILL( circlePts( 0.23, -0.07, 0.14 ) ),
				P_FILL( circlePts( 0.14, 0.2, 0.14 ) ),
				P_FILL( circlePts( -0.14, 0.2, 0.14 ) ),
				P_FILL( circlePts( -0.23, -0.07, 0.14 ) ),
				P_FILL( circlePts( 0, 0.02, 0.11 ) ),
			],
			[
				P_FILL(
					arcPts( 0, 0.1, 0.3, Math.PI * 0.75, Math.PI * 2.25, 30 ).concat( [
						[ 0, -0.44 ],
					] )
				),
			],
			[
				P_STROKE( [ [ -0.4, 0.34 ], [ 0.4, -0.34 ] ], 0.05 ),
				P_FILL( circlePts( -0.18, 0.05, 0.07 ) ),
				P_FILL( circlePts( 0.02, -0.1, 0.07 ) ),
				P_FILL( circlePts( 0.22, -0.26, 0.07 ) ),
			],
		],
	},
	{
		id: 'himmel',
		label: 'Sky',
		glyphs: [
			[ P_FILL( starPts( 5, 0.44, 0.18 ) ) ],
			[ P_FILL( starPts( 4, 0.42, 0.1 ) ) ],
			[
				P_FILL(
					arcPts( 0, 0, 0.4, Math.PI * 0.62, Math.PI * 2.38, 30 ).concat(
						arcPts( 0.17, 0, 0.3, Math.PI * 2.25, Math.PI * 0.72, 26 )
					)
				),
			],
			[
				P_FILL( circlePts( -0.18, -0.18, 0.16 ) ),
				P_STROKE( [ [ 0, 0 ], [ 0.38, 0.38 ] ], 0.055 ),
				P_STROKE( [ [ 0.08, -0.14 ], [ 0.42, 0.16 ] ], 0.045 ),
				P_STROKE( [ [ -0.14, 0.08 ], [ 0.16, 0.42 ] ], 0.045 ),
			],
			[
				P_FILL( circlePts( 0, 0, 0.26 ) ),
				P_STROKE(
					[ [ -0.46, 0.14 ], [ -0.2, 0.23 ], [ 0.2, 0.23 ], [ 0.46, 0.1 ] ],
					0.07
				),
			],
			[
				P_FILL( circlePts( -0.2, -0.1, 0.07 ) ),
				P_FILL( circlePts( 0.1, -0.24, 0.05 ) ),
				P_FILL( circlePts( 0.16, 0.14, 0.09 ) ),
			],
		],
	},
	{
		id: 'blobs',
		label: 'Blobs',
		glyphs: [
			[ P_FILL( blobPts( [ [ 2, 0.09, 0 ], [ 3, 0.05, 1.3 ] ] ) ) ],
			[ P_FILL( blobPts( [ [ 3, 0.07, 0.6 ], [ 5, 0.045, 2.4 ] ] ) ) ],
			[ P_FILL( blobPts( [ [ 2, 0.11, 2.2 ], [ 4, 0.04, 0.9 ] ] ) ) ],
			[ P_FILL( blobPts( [ [ 5, 0.08, 0 ], [ 7, 0.04, 1 ] ] ) ) ],
			[ P_STROKE( blobPts( [ [ 2, 0.08, 1 ], [ 3, 0.05, 0.2 ] ] ), 0.12, true ) ],
			[ P_FILL( blobPts( [ [ 2, 0.05, 0.4 ] ] ) ) ],
		],
	},
	{
		id: 'konfetti',
		label: 'Confetti',
		glyphs: [
			[
				P_FILL( [
					[ -0.08, -0.42 ], [ 0.08, -0.42 ], [ 0.08, 0.42 ],
					[ -0.08, 0.42 ],
				] ),
			],
			[ P_STROKE( sinePts( 1.5, 0.18 ), 0.16 ) ],
			[ P_FILL( regularPts( 3, 0.3 ) ) ],
			[ P_FILL( circlePts( 0, 0, 0.2 ) ) ],
			[ P_STROKE( arcPts( 0, 0, 0.32, Math.PI, TAU ), 0.16 ) ],
			[ P_STROKE( regularPts( 4, 0.3, Math.PI / 4 ), 0.14, true ) ],
		],
	},
	{
		id: 'herzen',
		label: 'Hearts',
		glyphs: [
			[ P_FILL( heartPts() ) ],
			[ P_STROKE( heartPts(), 0.11, true ) ],
			[ P_FILL( starPts( 4, 0.4, 0.09 ) ) ],
			[ P_FILL( heartPts( 0.02 ) ) ],
			[ P_FILL( circlePts( 0, 0, 0.16 ) ) ],
		],
	},
];

export const glyphSetById = ( id ) =>
	GLYPH_SETS.find( ( s ) => s.id === id ) || GLYPH_SETS[ 0 ];

/* ------------------------------ shape helpers ----------------------------- */

// Cell-space shape: { points, closed, color, fill, width, opacity }.

const XF = ( pts, x, y, s, rot ) => {
	const c = Math.cos( rot );
	const sn = Math.sin( rot );
	return pts.map( ( [ px, py ] ) => ( {
		x: x + ( px * c - py * sn ) * s,
		y: y + ( px * sn + py * c ) * s,
	} ) );
};

function glyphShapes( glyph, e, color, P, out ) {
	const wMul = 0.5 + ( P.weight / 100 ) * 1.3;
	const op = Math.max( 0.05, Math.min( 1, ( P.alpha ?? 100 ) / 100 ) );
	for ( const prim of glyph ) {
		out.push( {
			points: XF( prim.pts, e.x, e.y, e.s, e.rot || 0 ),
			closed: !! ( prim.closed || prim.fill ),
			color,
			fill: prim.fill ? color : null,
			width: prim.fill
				? 0
				: Math.max( 0.0016, ( prim.w || 0.14 ) * e.s * wMul ),
			opacity: op,
		} );
	}
}

/* ------------------------------ element motifs ---------------------------- */

/**
 * Seeded scatter elements for scatter/terrazzo, BEFORE user edits:
 * jittered-grid placement avoids clumping while staying wrap-safe.
 */
function baseElements( P, R, glyphCount, opts = {} ) {
	const n = Math.max( 3, Math.min( 90, opts.count ?? P.count ) );
	const g = Math.max( 2, Math.ceil( Math.sqrt( n ) ) );
	const jit = ( P.jitter / 100 ) * ( opts.jitterMul ?? 0.9 );
	const cells = [];
	for ( let i = 0; i < g * g; i++ ) {
		cells.push( i );
	}
	// Seeded shuffle so dropped cells (g*g > n) vary per seed.
	for ( let i = cells.length - 1; i > 0; i-- ) {
		const j = Math.floor( R() * ( i + 1 ) );
		[ cells[ i ], cells[ j ] ] = [ cells[ j ], cells[ i ] ];
	}
	const base = ( opts.size ?? ( 0.34 + ( P.size / 100 ) * 0.62 ) ) / g;
	const els = [];
	for ( let k = 0; k < n; k++ ) {
		const cell = cells[ k % cells.length ];
		const cx = cell % g;
		const cy = Math.floor( cell / g );
		const x = ( cx + 0.5 + ( R() - 0.5 ) * jit ) / g;
		const y = ( cy + 0.5 + ( R() - 0.5 ) * jit ) / g;
		els.push( {
			x: ( ( x % 1 ) + 1 ) % 1,
			y: ( ( y % 1 ) + 1 ) % 1,
			g: Math.floor( R() * glyphCount ),
			s: base * ( 0.72 + R() * 0.56 ),
			rot: ( R() - 0.5 ) * TAU * ( P.rot / 100 ),
			c: k,
		} );
	}
	return els;
}

/** Apply the playground edits (moved/removed/added) to base elements. */
function editedElements( P, els, glyphCount ) {
	const removed = new Set( P.removed || [] );
	const out = els
		.map( ( e, i ) => ( { ...e, i } ) )
		.filter( ( e ) => ! removed.has( e.i ) );
	( P.added || [] ).forEach( ( a, k ) => {
		out.push( {
			x: ( ( a.x % 1 ) + 1 ) % 1,
			y: ( ( a.y % 1 ) + 1 ) % 1,
			g: ( ( a.g || 0 ) % glyphCount + glyphCount ) % glyphCount,
			s: a.s,
			rot: a.rot || 0,
			c: a.c || 0,
			i: 100000 + k,
		} );
	} );
	// Moves last, so dragged hand-added elements stick too.
	for ( const m of P.moved || [] ) {
		const hit = out.find( ( e ) => e.i === m.i );
		if ( hit ) {
			hit.x = ( ( m.x % 1 ) + 1 ) % 1;
			hit.y = ( ( m.y % 1 ) + 1 ) % 1;
		}
	}
	return out;
}

/** Public: the editable element list (for hit tests in the dialog). */
export function cellElements( P ) {
	if ( 'terrazzo' === P.motif ) {
		const R = rng( P.seed );
		return editedElements(
			P,
			baseElements( P, R, TERRAZZO_GLYPHS.length, {
				count: Math.round( P.count * 2.2 ),
				size: 0.5 + ( P.size / 100 ) * 0.55,
				jitterMul: 1,
			} ),
			TERRAZZO_GLYPHS.length
		);
	}
	if ( 'scatter' !== P.motif ) {
		return [];
	}
	const R = rng( P.seed );
	const n = ( glyphPool( P ) || [ 0 ] ).length;
	return editedElements( P, baseElements( P, R, n ), n );
}

/**
 * Active glyph pool: primary set, optionally mixed with a second one.
 * 'stamp' (own layer as image stamp) returns null - element motifs
 * then emit img shapes instead of vector primitives.
 */
export function glyphPool( P ) {
	if ( 'stamp' === P.set ) {
		return null;
	}
	const glyphs = glyphSetById( P.set ).glyphs;
	return P.set2 && 'stamp' !== P.set2
		? glyphs.concat( glyphSetById( P.set2 ).glyphs )
		: glyphs;
}

const stampShape = ( e, P ) => ( {
	kind: 'img',
	x: e.x,
	y: e.y,
	s: e.s,
	rot: e.rot || 0,
	fx: false,
	fy: false,
	opacity: Math.max( 0.05, Math.min( 1, ( P.alpha ?? 100 ) / 100 ) ),
} );

function scatterShapes( P, colors ) {
	const glyphs = glyphPool( P );
	const out = [];
	for ( const e of cellElements( P ) ) {
		if ( ! glyphs ) {
			out.push( stampShape( e, P ) );
			continue;
		}
		glyphShapes(
			glyphs[ e.g % glyphs.length ],
			e,
			colFor( colors, e.c, P ),
			P,
			out
		);
	}
	return out;
}

// Terrazzo chips: blobs and angular shards, always filled.
const TERRAZZO_GLYPHS = [
	[ P_FILL( blobPts( [ [ 2, 0.09, 0 ], [ 3, 0.05, 1.3 ] ] ) ) ],
	[ P_FILL( blobPts( [ [ 3, 0.07, 0.6 ], [ 5, 0.045, 2.4 ] ] ) ) ],
	[ P_FILL( blobPts( [ [ 2, 0.11, 2.2 ], [ 4, 0.04, 0.9 ] ] ) ) ],
	[ P_FILL( [ [ -0.4, -0.25 ], [ 0.42, -0.38 ], [ 0.18, 0.4 ] ] ) ],
	[ P_FILL( [ [ -0.38, -0.1 ], [ 0.05, -0.42 ], [ 0.4, 0.05 ], [ -0.05, 0.38 ] ] ) ],
	[ P_FILL( circlePts( 0, 0, 0.3 ) ) ],
];

function terrazzoShapes( P, colors ) {
	const out = [];
	for ( const e of cellElements( P ) ) {
		glyphShapes(
			TERRAZZO_GLYPHS[ e.g % TERRAZZO_GLYPHS.length ],
			e,
			colFor( colors, e.c, P ),
			P,
			out
		);
	}
	// Fine specks between the chips - the terrazzo dust.
	const R = rng( P.seed + 31 );
	const op = Math.max( 0.05, Math.min( 1, ( P.alpha ?? 100 ) / 100 ) );
	const n = Math.round( P.count * 1.6 );
	for ( let i = 0; i < n; i++ ) {
		out.push( {
			points: XF(
				circlePts( 0, 0, 0.5, 10 ),
				R(),
				R(),
				0.004 + R() * 0.007,
				0
			),
			closed: true,
			color: colFor( colors, i + 2, P ),
			fill: colFor( colors, i + 2, P ),
			width: 0,
			opacity: op * 0.85,
		} );
	}
	return out;
}

/* ------------------------------- grid motifs ------------------------------ */

function gridShapes( P, colors, stagger ) {
	const glyphs = glyphPool( P );
	const k = Math.max( 2, Math.min( 10, Math.round( P.count ) ) );
	const R = rng( P.seed );
	const nG = glyphs
		? Math.min( glyphs.length, 1 + Math.floor( P.variety / 26 ) )
		: 1;
	const size = ( 0.42 + ( P.size / 100 ) * 0.5 ) / k;
	const jit = ( ( P.jitter / 100 ) * 0.3 ) / k;
	const out = [];
	for ( let j = 0; j < k; j++ ) {
		for ( let i = 0; i < k; i++ ) {
			const rSteps = Math.floor( R() * 4 );
			const gPick = Math.floor( R() * nG );
			const jx = ( R() - 0.5 ) * 2 * jit;
			const jy = ( R() - 0.5 ) * 2 * jit;
			const e = {
				x: ( i + 0.5 + ( stagger && j % 2 ? 0.5 : 0 ) ) / k + jx,
				y: ( j + 0.5 ) / k + jy,
				s: size,
				rot:
					P.rot >= 50
						? rSteps * ( Math.PI / 2 )
						: ( R() - 0.5 ) * ( P.rot / 100 ) * 1.4,
			};
			if ( ! glyphs ) {
				out.push( stampShape( e, P ) );
				continue;
			}
			glyphShapes(
				glyphs[ gPick ],
				e,
				colFor( colors, i + j * 2, P ),
				P,
				out
			);
		}
	}
	return out;
}

function polkaShapes( P, colors ) {
	const k = Math.max( 3, Math.min( 14, Math.round( P.count ) ) );
	const rBig = ( 0.18 + ( P.size / 100 ) * 0.34 ) / k;
	const alt = P.variety >= 50;
	const op = Math.max( 0.05, Math.min( 1, ( P.alpha ?? 100 ) / 100 ) );
	const out = [];
	for ( let j = 0; j < k; j++ ) {
		for ( let i = 0; i < k; i++ ) {
			const r = alt && ( i + j ) % 2 ? rBig * 0.55 : rBig;
			const color = colFor( colors, j, P );
			out.push( {
				points: XF(
					circlePts( 0, 0, 0.5 ),
					( i + 0.5 + ( j % 2 ? 0.5 : 0 ) ) / k,
					( j + 0.5 ) / k,
					r * 2,
					0
				),
				closed: true,
				color,
				fill: color,
				width: 0,
				opacity: op,
			} );
		}
	}
	return out;
}

/* ------------------------------ line motifs ------------------------------- */

// Curated width rhythms - stripe patterns feel designed, not random.
const RHYTHMS = [
	[ 1 ],
	[ 1, 0.45 ],
	[ 1, 0.4, 0.7 ],
	[ 0.9, 0.35, 0.6, 0.35 ],
];

function stripeShapes( P, colors ) {
	const rhythm = RHYTHMS[ Math.min( 3, Math.floor( P.variety / 26 ) ) ];
	const op = Math.max( 0.05, Math.min( 1, ( P.alpha ?? 100 ) / 100 ) );
	const out = [];
	const dir = P.dir % 4;
	if ( dir < 2 ) {
		const n = Math.max( 2, Math.min( 16, Math.round( P.count ) ) );
		const base = ( 1 / n ) * ( 0.22 + ( P.weight / 100 ) * 0.62 );
		for ( let i = 0; i < n; i++ ) {
			const c = ( i + 0.5 ) / n;
			out.push( {
				points:
					0 === dir
						? [ { x: -0.3, y: c }, { x: 1.3, y: c } ]
						: [ { x: c, y: -0.3 }, { x: c, y: 1.3 } ],
				closed: false,
				color: colFor( colors, i, P ),
				fill: null,
				width: base * rhythm[ i % rhythm.length ],
				opacity: op,
			} );
		}
		return out;
	}
	// Diagonals: lines x+y=c (dir 2) or x-y=c (dir 3). Shifting the cell
	// by 1 shifts c by 1, so the c-grid must divide 1: force an even
	// count over the c-range of length 2.
	const n2 = Math.max( 2, 2 * Math.round( P.count / 2 ) );
	const spacing = 2 / n2;
	const base = ( spacing / Math.SQRT2 ) * ( 0.26 + ( P.weight / 100 ) * 0.66 );
	for ( let i = 0; i < n2; i++ ) {
		const c = ( i + 0.5 ) * spacing + ( 3 === dir ? -1 : 0 );
		const mid =
			2 === dir ? { x: c / 2, y: c / 2 } : { x: c / 2, y: -c / 2 };
		const d = 2 === dir ? { x: 1, y: -1 } : { x: 1, y: 1 };
		out.push( {
			points: [
				{ x: mid.x - d.x * 0.95, y: mid.y - d.y * 0.95 },
				{ x: mid.x + d.x * 0.95, y: mid.y + d.y * 0.95 },
			],
			closed: false,
			color: colFor( colors, i, P ),
			fill: null,
			width: base * rhythm[ i % rhythm.length ],
			opacity: op,
		} );
	}
	return out;
}

function waveShapes( P, colors ) {
	const n = Math.max( 3, Math.min( 24, Math.round( P.count ) ) );
	const f = Math.max( 1, Math.min( 6, Math.round( P.freqI ) ) );
	const amp = ( 0.5 / n ) * ( P.amp / 100 ) * 1.7;
	const width = ( 1 / n ) * ( 0.14 + ( P.weight / 100 ) * 0.5 );
	const op = Math.max( 0.05, Math.min( 1, ( P.alpha ?? 100 ) / 100 ) );
	const out = [];
	for ( let r = 0; r < n; r++ ) {
		const ph = ( r * P.phase ) / 100 / Math.max( 1, n - 1 );
		const pts = [];
		// x sampled on a 1/40 grid from -0.25 to 1.25, so x=0 and x=1
		// are exact samples - the loop test verifies y(0) == y(1).
		for ( let k = 0; k <= 60; k++ ) {
			const x = -0.25 + k * 0.025;
			pts.push( {
				x,
				y: ( r + 0.5 ) / n + amp * Math.sin( TAU * ( f * x + ph ) ),
			} );
		}
		out.push( {
			points: pts,
			closed: false,
			color: colFor( colors, r, P ),
			fill: null,
			width,
			opacity: op,
		} );
	}
	return out;
}

function chevronShapes( P, colors ) {
	const n = Math.max( 2, Math.min( 14, Math.round( P.count ) ) );
	const t = Math.max( 1, Math.min( 8, Math.round( P.freqI ) ) );
	const amp = ( 0.5 / n ) * ( 0.4 + ( P.amp / 100 ) * 0.75 );
	const width = ( 1 / n ) * ( 0.2 + ( P.weight / 100 ) * 0.5 );
	const op = Math.max( 0.05, Math.min( 1, ( P.alpha ?? 100 ) / 100 ) );
	const out = [];
	for ( let r = 0; r < n; r++ ) {
		const pts = [];
		for ( let k = -1; k <= t * 2 + 1; k++ ) {
			pts.push( {
				x: k / ( t * 2 ),
				y: ( r + 0.5 ) / n + ( k % 2 ? -amp : amp ),
			} );
		}
		out.push( {
			points: pts,
			closed: false,
			color: colFor( colors, r, P ),
			fill: null,
			width,
			opacity: op,
		} );
	}
	return out;
}

/* ------------------------------ area motifs ------------------------------- */

function scaleShapes( P, colors ) {
	const c = Math.max( 3, Math.min( 14, Math.round( P.count ) ) );
	const rad = ( 0.52 + ( P.size / 100 ) * 0.26 ) / c;
	const m = Math.max( 2, Math.round( 1 / ( rad * 0.82 ) ) );
	const rowH = 1 / m;
	const op = Math.max( 0.05, Math.min( 1, ( P.alpha ?? 100 ) / 100 ) );
	const wMul = 0.5 + ( P.weight / 100 ) * 1.3;
	const out = [];
	// Painted top row last: each row of scales overlaps the row below,
	// and the 3x3 wrap keeps that order across the tile edge.
	for ( let j = m - 1; j >= 0; j-- ) {
		for ( let i = 0; i < c; i++ ) {
			const x = ( i + 0.5 + ( j % 2 ? 0.5 : 0 ) ) / c;
			const y = ( j + 0.5 ) * rowH - rad * 0.4;
			const pts = arcPts( x, y, rad, 0, Math.PI, 26 ).map( ( [ px, py ] ) => ( {
				x: px,
				y: py,
			} ) );
			pts.unshift( { x: x + rad, y } );
			pts.push( { x: x - rad, y } );
			const color = colFor( colors, i + j * 2, P );
			out.push( {
				points: pts,
				closed: true,
				color,
				fill: color,
				width: 0,
				opacity: op,
			} );
			out.push( {
				points: pts.slice(),
				closed: true,
				color: colFor( colors, i + j * 2 + 1, P ),
				fill: null,
				width: Math.max( 0.0016, rad * 0.06 * wMul ),
				opacity: op,
			} );
		}
	}
	return out;
}

function ginghamShapes( P, colors ) {
	const k = Math.max( 2, Math.min( 8, Math.round( P.count / 2 ) ) );
	const w = 1 / ( 2 * k );
	const op =
		Math.max( 0.05, Math.min( 1, ( P.alpha ?? 100 ) / 100 ) ) * 0.5;
	const two = P.variety >= 50;
	const out = [];
	const bar = ( x, y, horiz, color ) => ( {
		points: horiz
			? [
					{ x: -0.1, y }, { x: 1.1, y },
					{ x: 1.1, y: y + w }, { x: -0.1, y: y + w },
			  ]
			: [
					{ x, y: -0.1 }, { x: x + w, y: -0.1 },
					{ x: x + w, y: 1.1 }, { x, y: 1.1 },
			  ],
		closed: true,
		color,
		fill: color,
		width: 0,
		opacity: op,
	} );
	for ( let i = 0; i < k; i++ ) {
		out.push( bar( 2 * i * w, 0, false, colFor( colors, 0, P ) ) );
	}
	for ( let i = 0; i < k; i++ ) {
		out.push(
			bar( 0, 2 * i * w, true, colFor( colors, two ? 1 : 0, P ) )
		);
	}
	return out;
}

/* ------------------------------ tile motifs ------------------------------- */

function truchetShapes( P, colors ) {
	const k = Math.max( 2, Math.min( 12, Math.round( P.count ) ) );
	const w = 1 / k;
	const R = rng( P.seed );
	const width = w * ( 0.1 + ( P.weight / 100 ) * 0.3 );
	const op = Math.max( 0.05, Math.min( 1, ( P.alpha ?? 100 ) / 100 ) );
	const out = [];
	const arcShape = ( cx, cy, a0, a1, color ) => ( {
		points: arcPts( cx, cy, w / 2, a0, a1, 14 ).map( ( [ x, y ] ) => ( {
			x,
			y,
		} ) ),
		closed: false,
		color,
		fill: null,
		width,
		opacity: op,
	} );
	for ( let j = 0; j < k; j++ ) {
		for ( let i = 0; i < k; i++ ) {
			const color = colFor( colors, i + j * 2, P );
			const flip = R() < 0.5;
			// A slice of cells trades arcs for crossing diagonals.
			const diag = R() * 100 < P.variety - 20;
			const x0 = i * w;
			const y0 = j * w;
			if ( diag ) {
				out.push( {
					points: [
						{ x: x0 + w / 2, y: y0 },
						{ x: x0 + w, y: y0 + w / 2 },
					],
					closed: false,
					color,
					fill: null,
					width,
					opacity: op,
				} );
				out.push( {
					points: [
						{ x: x0, y: y0 + w / 2 },
						{ x: x0 + w / 2, y: y0 + w },
					],
					closed: false,
					color,
					fill: null,
					width,
					opacity: op,
				} );
				continue;
			}
			if ( flip ) {
				out.push( arcShape( x0, y0, 0, Math.PI / 2, color ) );
				out.push(
					arcShape( x0 + w, y0 + w, Math.PI, Math.PI * 1.5, color )
				);
			} else {
				out.push(
					arcShape( x0 + w, y0, Math.PI / 2, Math.PI, color )
				);
				out.push(
					arcShape( x0, y0 + w, Math.PI * 1.5, TAU, color )
				);
			}
		}
	}
	return out;
}

function hexShapes( P, colors ) {
	const c = Math.max( 3, Math.min( 12, Math.round( P.count ) ) );
	// Pointy-top honeycomb; rows are forced onto an exact 0..1 grid by
	// stretching the hexagons a hair (invisible, keeps the tile seamless).
	const m = Math.max( 2, Math.round( c * 1.1547 ) );
	const rX = 1 / ( Math.sqrt( 3 ) * c );
	const rY = 1 / ( 1.5 * m );
	const shrink = 0.55 + ( ( P.size ?? 55 ) / 100 ) * 0.45;
	const width = rX * ( 0.12 + ( P.weight / 100 ) * 0.4 );
	const op = Math.max( 0.05, Math.min( 1, ( P.alpha ?? 100 ) / 100 ) );
	const R = rng( P.seed );
	const out = [];
	for ( let j = 0; j < m; j++ ) {
		for ( let i = 0; i < c; i++ ) {
			const cx = ( i + 0.5 + ( j % 2 ? 0.5 : 0 ) ) / c;
			const cy = ( j + 0.5 ) * ( 1 / m );
			const pts = [];
			for ( let q = 0; q < 6; q++ ) {
				const a = Math.PI / 6 + ( q / 6 ) * TAU;
				pts.push( {
					x: cx + Math.cos( a ) * rX * shrink,
					y: cy + Math.sin( a ) * rY * shrink,
				} );
			}
			const color = colFor( colors, i + j * 2, P );
			const filled = R() * 100 < P.variety;
			out.push( {
				points: pts,
				closed: true,
				color,
				fill: filled ? color : null,
				width: filled ? 0 : Math.max( 0.0016, width ),
				opacity: op,
			} );
		}
	}
	return out;
}

function ogeeShapes( P, colors ) {
	const n = Math.max( 3, Math.min( 16, Math.round( P.count ) ) );
	const f = Math.max( 1, Math.min( 4, Math.round( P.freqI ) ) );
	const amp = ( 0.5 / n ) * ( 0.5 + ( P.amp / 100 ) * 0.85 );
	const width = ( 1 / n ) * ( 0.12 + ( P.weight / 100 ) * 0.4 );
	const op = Math.max( 0.05, Math.min( 1, ( P.alpha ?? 100 ) / 100 ) );
	const out = [];
	// Two mirrored cosine rails per row build the classic onion net;
	// alternate rows shift by half a period. Same seamless sampling
	// grid as the waves (x=0 and x=1 are exact samples).
	for ( let r = 0; r < n; r++ ) {
		const ph = r % 2 ? 0.5 : 0;
		const base = ( r + 0.5 ) / n;
		for ( const sign of [ 1, -1 ] ) {
			const pts = [];
			for ( let k = 0; k <= 60; k++ ) {
				const x = -0.25 + k * 0.025;
				pts.push( {
					x,
					y:
						base +
						sign * amp * Math.cos( TAU * ( f * x + ph ) ),
				} );
			}
			out.push( {
				points: pts,
				closed: false,
				color: colFor( colors, r, P ),
				fill: null,
				width,
				opacity: op,
			} );
		}
	}
	return out;
}

function hatchShapes( P, colors ) {
	// Two diagonal stripe layers crossing each other; the second one
	// steps one palette slot further and thins out.
	const a = stripeShapes( { ...P, dir: 2 }, colors );
	const b = stripeShapes(
		{ ...P, dir: 3, colorway: ( P.colorway || 0 ) + 1 },
		colors
	).map( ( s ) => ( {
		...s,
		width: s.width * 0.6,
		opacity: s.opacity * 0.85,
	} ) );
	return a.concat( b );
}

/* --------------------------------- motifs -------------------------------- */

/* ------------------------- v2.3 motif additions ------------------------- */

const plusGlyph = ( a = 0.16, b = 0.5 ) => [
	[ -a, -b ], [ a, -b ], [ a, -a ], [ b, -a ], [ b, a ], [ a, a ],
	[ a, b ], [ -a, b ], [ -a, a ], [ -b, a ], [ -b, -a ], [ -a, -a ],
];

const starGlyph = ( points = 5, r1 = 0.5, r2 = 0.21 ) => {
	const pts = [];
	for ( let i = 0; i < points * 2; i++ ) {
		const r = i % 2 ? r2 : r1;
		const a = -Math.PI / 2 + ( i * Math.PI ) / points;
		pts.push( [ Math.cos( a ) * r, Math.sin( a ) * r ] );
	}
	return pts;
};

function plusShapes( P, colors ) {
	const k = Math.max( 3, Math.min( 12, Math.round( P.count ) ) );
	const s = ( ( 0.45 + ( ( P.size ?? 55 ) / 100 ) * 0.5 ) * 1 ) / k;
	const op = Math.max( 0.05, Math.min( 1, ( P.alpha ?? 100 ) / 100 ) );
	const glyph = plusGlyph();
	const out = [];
	for ( let j = 0; j < k; j++ ) {
		for ( let i = 0; i < k; i++ ) {
			const rot =
				P.variety >= 50 && ( i + j ) % 2 ? Math.PI / 4 : 0;
			const color = colFor( colors, i + j, P );
			out.push( {
				points: XF( glyph, ( i + 0.5 ) / k, ( j + 0.5 ) / k, s, rot ),
				closed: true,
				color,
				fill: color,
				width: 0,
				opacity: op,
			} );
		}
	}
	return out;
}

function starGridShapes( P, colors ) {
	const k = Math.max( 3, Math.min( 12, Math.round( P.count ) ) );
	const s = ( 0.5 + ( ( P.size ?? 55 ) / 100 ) * 0.5 ) / k;
	const op = Math.max( 0.05, Math.min( 1, ( P.alpha ?? 100 ) / 100 ) );
	const big = starGlyph( 5 );
	const spark = starGlyph( 4, 0.5, 0.14 );
	const out = [];
	for ( let j = 0; j < k; j++ ) {
		for ( let i = 0; i < k; i++ ) {
			const alt = P.variety >= 50 && ( i + j ) % 2;
			const color = colFor( colors, j + ( alt ? 1 : 0 ), P );
			out.push( {
				points: XF(
					alt ? spark : big,
					( i + 0.5 + ( j % 2 ? 0.5 : 0 ) ) / k,
					( j + 0.5 ) / k,
					alt ? s * 0.6 : s,
					alt ? 0 : ( ( i * 7 + j * 3 ) % 4 ) * 0.12
				),
				closed: true,
				color,
				fill: color,
				width: 0,
				opacity: op,
			} );
		}
	}
	return out;
}

function triangleShapes( P, colors ) {
	// Alternating up/down triangles fill the tile exactly - seamless by
	// construction, two palette slots on the checker.
	const k = Math.max( 3, Math.min( 12, Math.round( P.count ) ) );
	const op = Math.max( 0.05, Math.min( 1, ( P.alpha ?? 100 ) / 100 ) );
	const out = [];
	for ( let j = 0; j < k; j++ ) {
		for ( let i = 0; i < k; i++ ) {
			const x0 = i / k;
			const x1 = ( i + 1 ) / k;
			const y0 = j / k;
			const y1 = ( j + 1 ) / k;
			const up = [
				{ x: x0, y: y1 },
				{ x: ( x0 + x1 ) / 2, y: y0 },
				{ x: x1, y: y1 },
			];
			const down = [
				{ x: x0, y: y0 },
				{ x: x1, y: y0 },
				{ x: ( x0 + x1 ) / 2, y: y1 },
			];
			const colorA = colFor( colors, i + j, P );
			const colorB = colFor( colors, i + j + 1, P );
			out.push(
				{ points: up, closed: true, color: colorA, fill: colorA, width: 0, opacity: op },
				{ points: down, closed: true, color: colorB, fill: colorB, width: 0, opacity: op * 0.92 }
			);
		}
	}
	return out;
}

function quatrefoilShapes( P, colors ) {
	// Moroccan lattice: four-lobed outline per cell, lobes touching the
	// cell edges so neighbours interlock.
	const k = Math.max( 3, Math.min( 10, Math.round( P.count ) ) );
	const width = ( 0.05 + ( ( P.weight ?? 45 ) / 100 ) * 0.12 ) / k;
	const op = Math.max( 0.05, Math.min( 1, ( P.alpha ?? 100 ) / 100 ) );
	const glyph = [];
	for ( const [ lx, ly, a0 ] of [
		[ 0, -0.25, Math.PI ],
		[ 0.25, 0, -Math.PI / 2 ],
		[ 0, 0.25, 0 ],
		[ -0.25, 0, Math.PI / 2 ],
	] ) {
		glyph.push( ...arcPts( lx, ly, 0.25, a0, a0 + Math.PI, 16 ) );
	}
	const out = [];
	for ( let j = 0; j < k; j++ ) {
		for ( let i = 0; i < k; i++ ) {
			const color = colFor( colors, j, P );
			out.push( {
				points: XF( glyph, ( i + 0.5 ) / k, ( j + 0.5 ) / k, 2 / k, 0 ),
				closed: true,
				color,
				fill: null,
				width,
				opacity: op,
			} );
		}
	}
	return out;
}

function leafShapes( P, colors ) {
	// Petal lens (two arcs), diagonal orientation alternating per cell.
	const k = Math.max( 3, Math.min( 12, Math.round( P.count ) ) );
	const s = ( 0.55 + ( ( P.size ?? 55 ) / 100 ) * 0.4 ) / k;
	const op = Math.max( 0.05, Math.min( 1, ( P.alpha ?? 100 ) / 100 ) );
	const lens = [
		...arcPts( 0, -0.28, 0.57, Math.PI * 0.28, Math.PI * 0.72, 14 ),
		...arcPts( 0, 0.28, 0.57, -Math.PI * 0.72, -Math.PI * 0.28, 14 ),
	];
	const out = [];
	for ( let j = 0; j < k; j++ ) {
		for ( let i = 0; i < k; i++ ) {
			const rot =
				( ( i + j ) % 2 ? -1 : 1 ) *
				( Math.PI / 4 + ( P.variety >= 66 ? ( ( i * 5 + j ) % 3 ) * 0.2 : 0 ) );
			const color = colFor( colors, i + 2 * j, P );
			out.push( {
				points: XF( lens, ( i + 0.5 ) / k, ( j + 0.5 ) / k, s, rot ),
				closed: true,
				color,
				fill: color,
				width: 0,
				opacity: op,
			} );
		}
	}
	return out;
}

function ringShapes( P, colors ) {
	const k = Math.max( 3, Math.min( 12, Math.round( P.count ) ) );
	const width = ( 0.06 + ( ( P.weight ?? 45 ) / 100 ) * 0.14 ) / k;
	const op = Math.max( 0.05, Math.min( 1, ( P.alpha ?? 100 ) / 100 ) );
	const out = [];
	for ( let j = 0; j < k; j++ ) {
		for ( let i = 0; i < k; i++ ) {
			const cx = ( i + 0.5 + ( j % 2 ? 0.5 : 0 ) ) / k;
			const cy = ( j + 0.5 ) / k;
			const rBase = ( 0.34 + ( ( P.size ?? 55 ) / 100 ) * 0.14 ) / k;
			const color = colFor( colors, j, P );
			const color2 = colFor( colors, j + 1, P );
			out.push(
				{ points: XF( circlePts( 0, 0, 0.5 ), cx, cy, rBase * 2, 0 ), closed: true, color, fill: null, width, opacity: op },
				{ points: XF( circlePts( 0, 0, 0.5 ), cx, cy, rBase * 1.1, 0 ), closed: true, color: color2, fill: null, width: width * 0.85, opacity: op * 0.9 }
			);
		}
	}
	return out;
}

function weaveShapes( P, colors ) {
	// Basketweave: alternating horizontal/vertical slats on the checker.
	const k = Math.max( 3, Math.min( 12, Math.round( P.count ) ) );
	const inset = 0.02 + ( 1 - ( P.size ?? 55 ) / 100 ) * 0.05;
	const op = Math.max( 0.05, Math.min( 1, ( P.alpha ?? 100 ) / 100 ) );
	const out = [];
	const slat = ( x0, y0, x1, y1, color ) =>
		out.push( {
			points: [
				{ x: x0, y: y0 },
				{ x: x1, y: y0 },
				{ x: x1, y: y1 },
				{ x: x0, y: y1 },
			],
			closed: true,
			color,
			fill: color,
			width: 0,
			opacity: op,
		} );
	for ( let j = 0; j < k; j++ ) {
		for ( let i = 0; i < k; i++ ) {
			const x0 = i / k;
			const y0 = j / k;
			const c = 1 / k;
			const pad = inset / k;
			if ( ( i + j ) % 2 ) {
				slat( x0 + pad, y0 + pad * 2.4, x0 + c - pad, y0 + c - pad * 2.4, colFor( colors, 0, P ) );
			} else {
				slat( x0 + pad * 2.4, y0 + pad, x0 + c - pad * 2.4, y0 + c - pad, colFor( colors, 1, P ) );
			}
		}
	}
	return out;
}

function sprinkleShapes( P, colors ) {
	// Confetti dashes: seeded scatter, kept inside the tile so the
	// rapport stays seamless.
	const k = Math.max( 3, Math.min( 14, Math.round( P.count ) ) );
	const n = k * k * 2;
	const R = rng( P.seed );
	const len = ( 0.35 + ( ( P.size ?? 55 ) / 100 ) * 0.5 ) / k;
	const width = ( 0.14 + ( ( P.weight ?? 45 ) / 100 ) * 0.2 ) / k;
	const op = Math.max( 0.05, Math.min( 1, ( P.alpha ?? 100 ) / 100 ) );
	const out = [];
	for ( let i = 0; i < n; i++ ) {
		const cx = R();
		const cy = R();
		const a = R() * Math.PI;
		const dx = ( Math.cos( a ) * len ) / 2;
		const dy = ( Math.sin( a ) * len ) / 2;
		const color = colFor( colors, Math.floor( R() * colors.length ), P );
		// Wrap copies near the tile edges keep the rapport seamless.
		for ( const ox of cx < len ? [ 0, 1 ] : cx > 1 - len ? [ 0, -1 ] : [ 0 ] ) {
			for ( const oy of cy < len ? [ 0, 1 ] : cy > 1 - len ? [ 0, -1 ] : [ 0 ] ) {
				out.push( {
					points: [
						{ x: cx + ox - dx, y: cy + oy - dy },
						{ x: cx + ox + dx, y: cy + oy + dy },
					],
					closed: false,
					color,
					fill: null,
					width,
					opacity: op,
				} );
			}
		}
	}
	return out;
}

export const MOTIFS = [
	{ id: 'scatter', label: 'Scatter', fn: ( P, c ) => scatterShapes( P, c ) },
	{ id: 'gitter', label: 'Grid', fn: ( P, c ) => gridShapes( P, c, false ) },
	{ id: 'raute', label: 'Diamond', fn: ( P, c ) => gridShapes( P, c, true ) },
	{ id: 'punkte', label: 'Polka dots', fn: polkaShapes },
	{ id: 'streifen', label: 'Stripes', fn: stripeShapes },
	{ id: 'wellen', label: 'Waves', fn: waveShapes },
	{ id: 'chevron', label: 'Chevron', fn: chevronShapes },
	{ id: 'schuppen', label: 'Scales', fn: scaleShapes },
	{ id: 'karo', label: 'Gingham', fn: ginghamShapes },
	{ id: 'terrazzo', label: 'Terrazzo', fn: ( P, c ) => terrazzoShapes( P, c ) },
	{ id: 'truchet', label: 'Truchet', fn: truchetShapes },
	{ id: 'hex', label: 'Honeycomb', fn: hexShapes },
	{ id: 'ogee', label: 'Ogee', fn: ogeeShapes },
	{ id: 'schraffur', label: 'Crosshatch', fn: hatchShapes },
	{ id: 'kreuzchen', label: 'Plus grid', fn: plusShapes },
	{ id: 'sterne', label: 'Stars', fn: starGridShapes },
	{ id: 'dreiecke', label: 'Triangles', fn: triangleShapes },
	{ id: 'gitterwerk', label: 'Lattice', fn: quatrefoilShapes },
	{ id: 'blaetter', label: 'Petals', fn: leafShapes },
	{ id: 'ringe', label: 'Rings', fn: ringShapes },
	{ id: 'flechtwerk', label: 'Basketweave', fn: weaveShapes },
	{ id: 'streusel', label: 'Sprinkles', fn: sprinkleShapes },
];

export const motifById = ( id ) =>
	MOTIFS.find( ( m ) => m.id === id ) || MOTIFS[ 0 ];

/** Motifs whose elements can be dragged/added/removed in the preview. */
export const ELEMENT_MOTIFS = [ 'scatter', 'terrazzo' ];

/* -------------------------------- rapport -------------------------------- */

/**
 * Repeat layouts in cell units. The exported tile is (cols x rows)
 * cells; every rapport is expressed as straight-repeating placements
 * so the editor's plain `repeat` pattern fill just works.
 */
export function expandPlaces( repeat ) {
	switch ( repeat ) {
		case 'halfdrop':
			return {
				cols: 2,
				rows: 1,
				places: [
					{ ox: 0, oy: 0, fx: false, fy: false },
					{ ox: 1, oy: 0.5, fx: false, fy: false },
				],
			};
		case 'brick':
			return {
				cols: 1,
				rows: 2,
				places: [
					{ ox: 0, oy: 0, fx: false, fy: false },
					{ ox: 0.5, oy: 1, fx: false, fy: false },
				],
			};
		case 'mirror':
			return {
				cols: 2,
				rows: 2,
				places: [
					{ ox: 0, oy: 0, fx: false, fy: false },
					{ ox: 1, oy: 0, fx: true, fy: false },
					{ ox: 0, oy: 1, fx: false, fy: true },
					{ ox: 1, oy: 1, fx: true, fy: true },
				],
			};
		default:
			return {
				cols: 1,
				rows: 1,
				places: [ { ox: 0, oy: 0, fx: false, fy: false } ],
			};
	}
}

/** One design cell as a shape list (cell space, may bleed past 0..1). */
export function buildCell( P ) {
	const colors = drawColors( P );
	let shapes = motifById( P.motif ).fn( P, colors );
	// Riso offset print: a second ink layer, nudged and slightly
	// translucent, UNDER the first one. Vector shapes only - image
	// stamps double-print badly.
	if ( P.riso > 0 ) {
		const d = ( P.riso / 100 ) * 0.028;
		const under = shapes
			.filter( ( s ) => 'img' !== s.kind )
			.map( ( s, i ) => ( {
				...s,
				points: s.points.map( ( p ) => ( {
					x: p.x + d,
					y: p.y + d * 0.6,
				} ) ),
				color: colFor( colors, i + 1 + ( P.colorway || 0 ), P ),
				fill: s.fill
					? colFor( colors, i + 1 + ( P.colorway || 0 ), P )
					: null,
				opacity: s.opacity * 0.62,
			} ) );
		shapes = under.concat( shapes );
	}
	// Line style stamp on strokes (canvas + SVG render it alike).
	if ( P.dash ) {
		for ( const s of shapes ) {
			if ( ! s.fill && 'img' !== s.kind ) {
				s.dash = P.dash;
			}
		}
	}
	const sx = P.shift?.x || 0;
	const sy = P.shift?.y || 0;
	if ( sx || sy ) {
		for ( const s of shapes ) {
			if ( 'img' === s.kind ) {
				s.x += sx;
				s.y += sy;
				continue;
			}
			for ( const p of s.points ) {
				p.x += sx;
				p.y += sy;
			}
		}
	}
	return shapes;
}

/**
 * The full repeat unit: cell shapes stamped at every rapport place
 * (mirrored where the place says so), in TILE space (0..cols/0..rows).
 * The painter/SVG still add the nine wrap offsets.
 */
export function tileShapes( P ) {
	const cell = buildCell( P );
	const { cols, rows, places } = expandPlaces( P.repeat );
	const out = [];
	for ( const pl of places ) {
		for ( const s of cell ) {
			if ( 'img' === s.kind ) {
				out.push( {
					...s,
					x: pl.ox + ( pl.fx ? 1 - s.x : s.x ),
					y: pl.oy + ( pl.fy ? 1 - s.y : s.y ),
					rot: s.rot * ( pl.fx ? -1 : 1 ) * ( pl.fy ? -1 : 1 ),
					fx: pl.fx,
					fy: pl.fy,
				} );
				continue;
			}
			out.push( {
				...s,
				points: s.points.map( ( p ) => ( {
					x: pl.ox + ( pl.fx ? 1 - p.x : p.x ),
					y: pl.oy + ( pl.fy ? 1 - p.y : p.y ),
				} ) ),
			} );
		}
	}
	return { shapes: out, cols, rows };
}

/**
 * Editable elements stamped into tile space, for pointer hit tests:
 * [{ i, x, y, s }] with i = stable element id inside the cell.
 */
export function elementsInTile( P ) {
	const els = cellElements( P );
	const { cols, rows, places } = expandPlaces( P.repeat );
	const sx = P.shift?.x || 0;
	const sy = P.shift?.y || 0;
	const out = [];
	for ( const pl of places ) {
		for ( const e of els ) {
			const lx = ( ( ( e.x + sx ) % 1 ) + 1 ) % 1;
			const ly = ( ( ( e.y + sy ) % 1 ) + 1 ) % 1;
			const gx = pl.ox + ( pl.fx ? 1 - lx : lx );
			const gy = pl.oy + ( pl.fy ? 1 - ly : ly );
			out.push( {
				i: e.i,
				x: ( ( gx % cols ) + cols ) % cols,
				y: ( ( gy % rows ) + rows ) % rows,
				s: e.s,
				fx: pl.fx,
				fy: pl.fy,
			} );
		}
	}
	return out;
}

/* ---------------------------------- svg ----------------------------------- */

const fmt = ( v ) => ( Math.round( v * 100 ) / 100 ).toFixed( 2 );

/**
 * Serialize the tile as standalone SVG (cellPx per cell edge). Shapes
 * are drawn with all wrap copies that touch the tile and clipped to
 * it, so the file tiles seamlessly in any layout tool.
 */
export function toSvgTile( P, cellPx = 256, stamp = null ) {
	const { shapes, cols, rows } = tileShapes( P );
	const W = cols * cellPx;
	const H = rows * cellPx;
	const parts = [
		'<svg xmlns="http://www.w3.org/2000/svg" width="' +
			W +
			'" height="' +
			H +
			'" viewBox="0 0 ' +
			W +
			' ' +
			H +
			'">',
		'<defs><clipPath id="tile"><rect width="' +
			W +
			'" height="' +
			H +
			'"/></clipPath>' +
			( stamp
				? '<g id="pgstamp"><image href="' +
				  stamp.href +
				  '" x="-0.5" y="' +
				  fmt( -stamp.aspect / 2 ) +
				  '" width="1" height="' +
				  fmt( stamp.aspect ) +
				  '" preserveAspectRatio="none"/></g>'
				: '' ) +
			'</defs>',
	];
	const bg = bgColor( P );
	if ( bg ) {
		parts.push(
			'<rect width="' + W + '" height="' + H + '" fill="' + bg + '"/>'
		);
	}
	parts.push( '<g clip-path="url(#tile)">' );
	for ( const s of shapes ) {
		if ( 'img' === s.kind ) {
			if ( ! stamp ) {
				continue;
			}
			const pad = s.s;
			for ( let ox = -cols; ox <= cols; ox += cols ) {
				for ( let oy = -rows; oy <= rows; oy += rows ) {
					const x = s.x + ox;
					const y = s.y + oy;
					if (
						x + pad < 0 ||
						x - pad > cols ||
						y + pad < 0 ||
						y - pad > rows
					) {
						continue;
					}
					parts.push(
						'<use href="#pgstamp" transform="translate(' +
							fmt( x * cellPx ) +
							' ' +
							fmt( y * cellPx ) +
							') rotate(' +
							fmt( ( s.rot * 180 ) / Math.PI ) +
							') scale(' +
							fmt( s.s * cellPx * ( s.fx ? -1 : 1 ) ) +
							' ' +
							fmt( s.s * cellPx * ( s.fy ? -1 : 1 ) ) +
							')"' +
							( s.opacity < 1
								? ' opacity="' + fmt( s.opacity ) + '"'
								: '' ) +
							'/>'
					);
				}
			}
			continue;
		}
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;
		for ( const p of s.points ) {
			minX = Math.min( minX, p.x );
			maxX = Math.max( maxX, p.x );
			minY = Math.min( minY, p.y );
			maxY = Math.max( maxY, p.y );
		}
		const pad = ( s.width || 0 ) + 0.02;
		for ( let ox = -cols; ox <= cols; ox += cols ) {
			for ( let oy = -rows; oy <= rows; oy += rows ) {
				if (
					maxX + ox + pad < 0 ||
					minX + ox - pad > cols ||
					maxY + oy + pad < 0 ||
					minY + oy - pad > rows
				) {
					continue;
				}
				let d = '';
				s.points.forEach( ( p, i ) => {
					d +=
						( i ? 'L' : 'M' ) +
						fmt( ( p.x + ox ) * cellPx ) +
						' ' +
						fmt( ( p.y + oy ) * cellPx );
				} );
				if ( s.closed ) {
					d += 'Z';
				}
				const lw = s.width * cellPx;
				const attrs = s.fill
					? 'fill="' + s.fill + '"'
					: 'fill="none" stroke="' +
					  s.color +
					  '" stroke-width="' +
					  fmt( lw ) +
					  '" stroke-linecap="round" stroke-linejoin="round"' +
					  ( 'dash' === s.dash
							? ' stroke-dasharray="' +
							  fmt( lw * 3.2 ) +
							  ' ' +
							  fmt( lw * 2.4 ) +
							  '"'
							: 'dot' === s.dash
							? ' stroke-dasharray="0.5 ' +
							  fmt( lw * 2.6 ) +
							  '"'
							: '' );
				parts.push(
					'<path d="' +
						d +
						'" ' +
						attrs +
						( s.opacity < 1
							? ' opacity="' + fmt( s.opacity ) + '"'
							: '' ) +
						'/>'
				);
			}
		}
	}
	parts.push( '</g></svg>' );
	return parts.join( '' );
}
