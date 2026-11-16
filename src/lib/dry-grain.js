/**
 * The TOOTH of drawing paper, one sheet for the CPU and the GPU painter.
 *
 * Dry media live on the tooth: a pencil or a crayon only reaches the
 * peaks of the paper at light pressure and fills the valleys as it is
 * pressed harder. So the tooth decides whether a stroke reads as pencil
 * on paper or as a noise filter - and a per-pixel hash is exactly the
 * noise filter (single white pixels, the newspaper-raster lesson of the
 * watercolour paper). Real paper is FELT and FIBRE: soft bumps a few
 * pixels wide from the felt it was pressed on, and short fibres lying in
 * every direction that make the white specks inside a stroke long and
 * irregular instead of round.
 *
 * The tile is built once (512 x 512, periodic, deterministic) from three
 * layers - fibres, felt, fine grain - and EQUALISED to a uniform spread,
 * so "the lead reaches a fraction f of the sheet" is simply a threshold
 * at 1 - f. That turns pressure into coverage linearly and keeps every
 * paper setting calibrated alike.
 */

const TILE = 512;
const MASK = TILE - 1;
const N = TILE * TILE;

const clamp = ( x ) => Math.max( 0, Math.min( 1, x ) );
const smooth = ( a, b, x ) => {
	const t = clamp( ( x - a ) / ( b - a ) );
	return t * t * ( 3 - 2 * t );
};

/** Deterministic dice (mulberry32). */
function dice( seed ) {
	let a = seed >>> 0;
	return () => {
		a = ( a + 0x6d2b79f5 ) >>> 0;
		let t = a;
		t = Math.imul( t ^ ( t >>> 15 ), t | 1 );
		t ^= t + Math.imul( t ^ ( t >>> 7 ), t | 61 );
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;
	};
}

function hash( x, y, s ) {
	let n = Math.imul( x, 374761393 ) ^ Math.imul( y, 668265263 ) ^ s;
	n = Math.imul( n ^ ( n >>> 13 ), 1274126177 );
	return ( ( n ^ ( n >>> 16 ) ) >>> 0 ) / 4294967296;
}

/** Separable box blur with wrap-around, in place. */
function blurWrap( a, r ) {
	if ( r < 1 ) {
		return a;
	}
	const tmp = new Float32Array( N );
	const inv = 1 / ( 2 * r + 1 );
	for ( let y = 0; y < TILE; y++ ) {
		const row = y * TILE;
		let s = 0;
		for ( let k = -r; k <= r; k++ ) {
			s += a[ row + ( k & MASK ) ];
		}
		for ( let x = 0; x < TILE; x++ ) {
			tmp[ row + x ] = s * inv;
			s +=
				a[ row + ( ( x + r + 1 ) & MASK ) ] -
				a[ row + ( ( x - r ) & MASK ) ];
		}
	}
	for ( let x = 0; x < TILE; x++ ) {
		let s = 0;
		for ( let k = -r; k <= r; k++ ) {
			s += tmp[ ( k & MASK ) * TILE + x ];
		}
		for ( let y = 0; y < TILE; y++ ) {
			a[ y * TILE + x ] = s * inv;
			s +=
				tmp[ ( ( y + r + 1 ) & MASK ) * TILE + x ] -
				tmp[ ( ( y - r ) & MASK ) * TILE + x ];
		}
	}
	return a;
}

/** Map any distribution onto an even 0..1 spread (4096-bin CDF). */
function equalise( a ) {
	let lo = Infinity;
	let hi = -Infinity;
	for ( let i = 0; i < N; i++ ) {
		lo = Math.min( lo, a[ i ] );
		hi = Math.max( hi, a[ i ] );
	}
	const B = 4096;
	const span = hi - lo || 1;
	const hist = new Float64Array( B + 1 );
	for ( let i = 0; i < N; i++ ) {
		hist[ Math.min( B - 1, ( ( ( a[ i ] - lo ) / span ) * B ) | 0 ) ]++;
	}
	const cdf = new Float64Array( B + 1 );
	for ( let b = 0; b < B; b++ ) {
		cdf[ b + 1 ] = cdf[ b ] + hist[ b ] / N;
	}
	for ( let i = 0; i < N; i++ ) {
		const f = ( ( a[ i ] - lo ) / span ) * B;
		const b = Math.min( B - 1, f | 0 );
		const t = f - b;
		a[ i ] = cdf[ b ] + ( cdf[ b + 1 ] - cdf[ b ] ) * t;
	}
	return a;
}

/** Periodic gradient-free value noise with `n` cells across the tile. */
function valueNoise( n, seed ) {
	const out = new Float32Array( N );
	for ( let y = 0; y < TILE; y++ ) {
		const v = ( y * n ) / TILE;
		const y0 = Math.floor( v );
		let ty = v - y0;
		ty = ty * ty * ( 3 - 2 * ty );
		for ( let x = 0; x < TILE; x++ ) {
			const u = ( x * n ) / TILE;
			const x0 = Math.floor( u );
			let tx = u - x0;
			tx = tx * tx * ( 3 - 2 * tx );
			const a = hash( x0 % n, y0 % n, seed );
			const b = hash( ( x0 + 1 ) % n, y0 % n, seed );
			const c = hash( x0 % n, ( y0 + 1 ) % n, seed );
			const d = hash( ( x0 + 1 ) % n, ( y0 + 1 ) % n, seed );
			out[ y * TILE + x ] =
				a +
				( b - a ) * tx +
				( c - a ) * ty +
				( a - b - c + d ) * tx * ty;
		}
	}
	return out;
}

/**
 * Felt: the imprint of the felt blanket a sheet was pressed on - small
 * PITS in a connected web of ridges (Worley distance: low at the cell
 * points, high along their borders). A lead or a wax stick rides the
 * web, so a stroke reads as colour with white pores in it, not as dots.
 */
function felt( cells, seed ) {
	const out = new Float32Array( N );
	const pitch = TILE / cells;
	const pts = new Float32Array( cells * cells * 2 );
	const rnd = dice( seed );
	for ( let i = 0; i < cells * cells; i++ ) {
		pts[ i * 2 ] = rnd();
		pts[ i * 2 + 1 ] = rnd();
	}
	for ( let y = 0; y < TILE; y++ ) {
		const cy = Math.floor( y / pitch );
		for ( let x = 0; x < TILE; x++ ) {
			const cx = Math.floor( x / pitch );
			let d1 = 9;
			for ( let j = -1; j <= 1; j++ ) {
				for ( let i = -1; i <= 1; i++ ) {
					const gx = ( cx + i + cells ) % cells;
					const gy = ( cy + j + cells ) % cells;
					const k = ( gy * cells + gx ) * 2;
					const px = ( cx + i + pts[ k ] ) * pitch;
					const py = ( cy + j + pts[ k + 1 ] ) * pitch;
					const dx = ( x - px ) / pitch;
					const dy = ( y - py ) / pitch;
					d1 = Math.min( d1, dx * dx + dy * dy );
				}
			}
			out[ y * TILE + x ] = Math.min( 1, Math.sqrt( d1 ) );
		}
	}
	return out;
}

/**
 * Fibres: short, slightly bent strands in every direction, splatted as
 * soft lines with wrap-around. They make the white specks inside a
 * stroke long and ragged - the tell of real paper under a lead.
 */
function fibres( count, seed, scale ) {
	const out = new Float32Array( N );
	const rnd = dice( seed );
	for ( let f = 0; f < count; f++ ) {
		const x0 = rnd() * TILE;
		const y0 = rnd() * TILE;
		const ang = rnd() * Math.PI;
		const bend = ( rnd() - 0.5 ) * 0.9;
		const len = ( 3 + rnd() * rnd() * 11 ) * scale;
		const wid = ( 0.45 + rnd() * 0.5 ) * Math.min( 1.4, scale );
		const amp = 0.35 + rnd() * 0.65;
		const steps = Math.max( 2, Math.ceil( len / 0.6 ) );
		const r = Math.ceil( wid * 2.2 );
		const inv = 1 / ( 2 * wid * wid );
		for ( let s = 0; s <= steps; s++ ) {
			const t = s / steps - 0.5;
			const a = ang + bend * t;
			const px = x0 + Math.cos( a ) * len * t;
			const py = y0 + Math.sin( a ) * len * t;
			const ix = Math.floor( px );
			const iy = Math.floor( py );
			for ( let j = -r; j <= r; j++ ) {
				for ( let i = -r; i <= r; i++ ) {
					const dx = ix + i + 0.5 - px;
					const dy = iy + j + 0.5 - py;
					const w = Math.exp( -( dx * dx + dy * dy ) * inv );
					if ( w < 0.02 ) {
						continue;
					}
					const k =
						( ( iy + j ) & MASK ) * TILE + ( ( ix + i ) & MASK );
					out[ k ] += w * amp * ( 0.6 / steps ) * len;
				}
			}
		}
	}
	// Saturate: where fibres pile up the sheet does not rise forever.
	for ( let i = 0; i < N; i++ ) {
		out[ i ] = 1 - Math.exp( -out[ i ] * 0.9 );
	}
	return out;
}

/** Fine grain: white noise, correlated over ~2 px (never raw pixels). */
function fineGrain( seed ) {
	const out = new Float32Array( N );
	for ( let i = 0; i < N; i++ ) {
		out[ i ] = hash( i & MASK, i >> 9, seed );
	}
	blurWrap( out, 1 );
	return blurWrap( out, 1 );
}

const tiles = new Map();

/**
 * The tooth tile for a paper: 0 = deepest valley, 1 = highest peak,
 * evenly spread. `pap` is one of PAPERS (wet-styles.js) or null for the
 * calibrated default (cold-press).
 *
 * @param {Object|null} pap Paper dials { kont, freq, gewebe, rippen }.
 * @return {Float32Array} 512 x 512 tooth heights.
 */
export function toothTile( pap ) {
	const freq = pap ? pap.freq : 1;
	const kont = pap ? pap.kont : 1;
	const key = [ freq, kont, pap?.gewebe || 0, pap?.rippen || 0 ].join( ':' );
	const hit = tiles.get( key );
	if ( hit ) {
		return hit;
	}
	// Feature size follows the paper: rough paper has bigger felt bumps
	// and longer fibres, hot-press fine ones.
	const cells = Math.max( 24, Math.round( 72 / freq ) );
	const f1 = felt( cells, 7711 );
	const f2 = valueNoise( Math.max( 12, Math.round( 56 / freq ) ), 431 );
	const fb = fibres( Math.round( 5200 * freq ), 90210, 0.8 + 0.4 * freq );
	const fg = fineGrain( 5501 );
	const out = new Float32Array( N );
	for ( let i = 0; i < N; i++ ) {
		// Fibre and fine grain lead: a lead meets the sheet at the scale
		// of a few pixels. Wax adds the coarse relief on top (ridge).
		let v = 0.36 * f1[ i ] + 0.14 * f2[ i ] + 0.2 * fb[ i ] + 0.3 * fg[ i ];
		if ( pap?.gewebe ) {
			const x = i & MASK;
			const y = i >> 9;
			v =
				0.55 * v +
				0.45 *
					( 0.5 +
						0.5 *
							Math.sin( ( x * 2 * Math.PI * 64 ) / TILE ) *
							Math.sin( ( y * 2 * Math.PI * 64 ) / TILE + 1.3 ) );
		} else if ( pap?.rippen ) {
			const y = i >> 9;
			v =
				0.78 * v +
				0.22 *
					( 0.5 + 0.5 * Math.sin( ( y * 2 * Math.PI * 96 ) / TILE ) );
		}
		out[ i ] = v;
	}
	equalise( out );
	// Contrast: a smooth sheet squeezes its spread towards the middle, so
	// light pressure already reaches most of it.
	if ( 1 !== kont ) {
		for ( let i = 0; i < N; i++ ) {
			out[ i ] = clamp(
				0.5 + ( out[ i ] - 0.5 ) * Math.min( 1.25, kont )
			);
		}
	}
	tiles.set( key, out );
	return out;
}

/**
 * The window each mixed tooth fills, for spreading it out evenly again
 * (boundTooth; the GPU painter reads the same numbers).
 */
export const TOOTH_SPREAD = { pencil: [ 0.11, 0.89 ], wax: [ 0.03, 0.97 ] };

/**
 * The tooth a bound medium FEELS at a document pixel: a lead reads the
 * sheet finer than a wax stick. Pencil = the tile at three times and twice
 * its frequency over itself (pores of a pixel or two - at twice alone they
 * were as large as a pencil line is wide); wax = the tile mixed with
 * itself at half frequency (clusters of pores next to denser patches).
 * The GPU painter samples exactly the same three positions.
 *
 * A mix of even layers is no longer even - it bunches around the middle,
 * and "the lead reaches a fraction f of the sheet" stops being a
 * threshold at 1 - f: a stroke then goes from nothing to everything
 * within a breath of pressure. So the mix is spread out again
 * (TOOTH_SPREAD: a smoothstep over the window the mix really fills, within
 * a hundredth of its true distribution).
 *
 * @param {Float32Array} tile   A toothTile().
 * @param {number}       x      Document x (integer).
 * @param {number}       y      Document y (integer).
 * @param {boolean}      pencil Lead (true) or wax.
 * @return {number} Tooth 0..1.
 */
export function boundTooth( tile, x, y, pencil ) {
	const at = ( u, v ) => tile[ ( v & MASK ) * TILE + ( u & MASK ) ];
	const t1 = at( x | 0, y | 0 );
	if ( pencil ) {
		return smooth(
			TOOTH_SPREAD.pencil[ 0 ],
			TOOTH_SPREAD.pencil[ 1 ],
			0.5 * at( ( x | 0 ) * 3 + 7, ( y | 0 ) * 3 + 3 ) +
				0.3 * at( ( x | 0 ) * 2 + 11, ( y | 0 ) * 2 + 5 ) +
				0.2 * t1
		);
	}
	return smooth(
		TOOTH_SPREAD.wax[ 0 ],
		TOOTH_SPREAD.wax[ 1 ],
		0.65 * t1 +
			0.35 * at( ( ( x | 0 ) + 256 ) >> 1, ( ( y | 0 ) + 128 ) >> 1 )
	);
}

/** Tooth height at a document pixel, default sheet (CPU painter). */
export function dryGrain( x, y ) {
	return toothTile( null )[
		( ( y | 0 ) & MASK ) * TILE + ( ( x | 0 ) & MASK )
	];
}

/**
 * How much of a pixel a BOUND medium covers (the colour, not the
 * amount): the lead or the wax reaches the peaks first. `amount` is the
 * pigment laid there, `tooth` the paper at this pixel (0..1, even),
 * `ridge` the coarse relief, `dial` the Tooth setting (0 = smooth).
 * Pencil keeps a fine, crisp break; wax bites into the coarse felt.
 */
export function boundCoverage( amount, ridge, tooth, dial, pencil = false ) {
	if ( ! ( amount > 0 ) ) {
		return 0;
	}
	const relief = pencil
		? 0.85 * tooth + 0.15 * ridge
		: 0.72 * tooth + 0.28 * ridge;
	// Even heavy wax leaves the deepest pits open until it is burnished.
	const reach = pencil
		? 1 - Math.exp( -amount * 1.9 )
		: 0.94 * ( 1 - Math.exp( -amount * 2.2 ) );
	// The Tooth dial is how CRISP the break is: a sharp threshold on a
	// toothy sheet, a soft one (nearly an even film) on a smooth one.
	const soft =
		( pencil ? 0.05 : 0.035 ) + ( 1 - dial ) * ( pencil ? 0.5 : 0.3 );
	// From above the highest peak (nothing reached) to below the deepest
	// valley (all of it), so zero amount is zero paint.
	const thr = 1 + soft - reach * ( 1 + 2 * soft );
	const tex = smooth( thr - soft, thr + soft, relief );
	// Heavy pressure BURNISHES: the valleys fill last, but they fill.
	const burnish = smooth( 2.2, 4.2, amount ) * 0.9;
	const gated = tex + ( 1 - tex ) * burnish;
	// Tooth 0 is a smooth sheet: an even film, whatever the paper. From
	// a little tooth up, the valleys stay paper-white.
	return reach + ( gated - reach ) * smooth( 0, 0.4, dial );
}

export const BOUND_GLSL = `
float boundCoverage( float amount, float ridge, float tooth, float dial, bool pencil ) {
	if ( amount <= 0.0 ) {
		return 0.0;
	}
	float relief = pencil ? 0.85 * tooth + 0.15 * ridge : 0.72 * tooth + 0.28 * ridge;
	float reach = pencil
		? 1.0 - exp( -amount * 1.9 )
		: 0.94 * ( 1.0 - exp( -amount * 2.2 ) );
	float soft = ( pencil ? 0.05 : 0.035 ) + ( 1.0 - dial ) * ( pencil ? 0.5 : 0.3 );
	float thr = 1.0 + soft - reach * ( 1.0 + 2.0 * soft );
	float tex = smoothstep( thr - soft, thr + soft, relief );
	float burnish = smoothstep( 2.2, 4.2, amount ) * 0.9;
	float gated = tex + ( 1.0 - tex ) * burnish;
	return mix( reach, gated, smoothstep( 0.0, 0.4, dial ) );
}
`;
