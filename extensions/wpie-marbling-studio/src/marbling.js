/**
 * Marble Bath (wpie-marbling-studio) - the mathematics of the bath.
 *
 * Paper marbling has an exact mathematical model (the one Aubrey Jaffer
 * worked out for Ebru/Suminagashi): the picture is never painted, it is
 * the HISTORY of the bath. Every action is an operation with a closed
 * form, and - the beautiful part - every operation's decay coordinate is
 * INVARIANT under its own displacement, so every operation has an exact
 * closed-form inverse:
 *
 *   drop    existing ink is pushed away from the centre so a disc of new
 *           colour fits: p' = c + (p-c)·sqrt(1 + r²/|p-c|²). Distances
 *           from c simply gain r² under the square root - invertible.
 *   tine    a needle dragged along a line shears ink ALONG the line,
 *           decaying with the perpendicular distance d (invariant):
 *           p' = p + m·α·λ/(λ+d).
 *   comb    the same with d measured to the NEAREST of parallel tines.
 *   vortex  rotation about a point by an angle that decays with radius
 *           (invariant): θ(L) = turn / (1 + (L/R)²)².
 *   wave    a sideways sway whose phase runs ALONG an axis while the
 *           displacement is PERPENDICULAR to it - the phase coordinate
 *           never changes, so subtracting the same sine undoes it.
 *
 * Rendering is therefore backward: for each pixel, undo the operations
 * newest to oldest; the first drop that contains the wandering point is
 * the colour, and a pixel that escapes every drop shows the bath. No
 * simulation, no grid, no accumulation error - the picture at any zoom
 * is exact, and any prefix of the history is a valid picture (which is
 * what the replay video plays).
 *
 * Coordinates live in bath units: height 1, width = aspect, y downward.
 * Ink colours are stored as slot INDICES, so recolouring a slot (or
 * loading brand colours) recolours the finished marbling.
 */

/** Operation type tags, first element of every stored op array. */
export const OP = {
	DROP: 'd', // [ 'd', x, y, r, ink ]
	TINE: 't', // [ 't', ax, ay, ux, uy, alpha, lambda ]
	COMB: 'c', // [ 'c', ax, ay, ux, uy, alpha, lambda, spacing ]
	VORTEX: 'v', // [ 'v', cx, cy, turn, radius ]
	WAVE: 'w', // [ 'w', ux, uy, amp, wavelength, phase ]
	ARC: 'a', // [ 'a', cx, cy, R, alpha, lambda ] - shear along a circle
	RING: 'o', // [ 'o', cx, cy, R, alpha, lambda, spacing ] - circle comb
};

/*
 * A drop's ink may be -1: the gall drop (ox gall in the real workshop).
 * It displaces every earlier colour exactly like ink, but what it leaves
 * behind is WATER - open cells in the pattern, or windows onto the
 * design when the bath is clear.
 */
export const GALL = -1;

/** The bath refuses to become unbounded history. */
export const MAX_OPS = 400;

/** Numeric codes for the shader (texel one carries the code). */
export const OP_CODE = { d: 0, t: 1, c: 2, v: 3, w: 4, a: 5, o: 6 };

export const TOOLS = [
	'drop',
	'lace',
	'flower',
	'needle',
	'stylus',
	'comb',
	'wavycomb',
	'arc',
	'ringcomb',
	'wave',
	'vortex',
	'splatter',
	'feather',
	'fan',
	'twin',
];

export const FLOWER_KINDS = [ 'tulip', 'carnation', 'daisy', 'rose', 'iris' ];

/**
 * The default inks: an Ebru palette - indigo, terracotta, cream, gold and
 * soot - on a pale paper bath.
 */
export const DEFAULT_INKS = [
	'#22456e',
	'#c2603f',
	'#e9dfc9',
	'#d19c3f',
	'#232630',
];

export const DEFAULTS = Object.freeze( {
	ops: [],
	inks: DEFAULT_INKS,
	bath: '#f0e8d6',
	bathClear: false,
	aspect: 4 / 3,
	seed: 7,
	recipe: '',
	// Tool settings (the gesture supplies position, direction and force).
	tool: 'drop',
	dropSize: 0.05,
	rings: 1,
	spacing: 0.11,
	softness: 0.012,
	// v1.3: the needle and the combs cap their pull here - a stroke across
	// the whole bath used to drag every drop a bath-length along the
	// teeth, and every composition ended up as the same long stripes.
	force: 0.55,
	// v1.4: every gesture twinned across the middle of the bath.
	mirror: false,
	// v1.4: the film can also be the print - the sheet lifted off.
	// replay | water | interactive
	embed: 'replay',
	waveAmp: 0.05,
	waveLen: 0.3,
	vortexRadius: 0.16,
	fanSpread: 75,
	fanTeeth: 7,
	arcForce: 0.5,
	flowerKind: 'tulip',
	flowerSize: 0.15,
	petals: 10,
	stem: true,
	// The look of the ink itself.
	veins: 0.45,
	paper: 0.22,
	// Gesture groups: how many ops each committed move added (undo unit).
	groups: [],
	// v1.9: a seamless tile - the bath wraps around its edges.
	seamless: false,
	// v1.9: a picture floating on the water instead of a plain colour
	// (a downscaled JPEG data URL; '' = none).
	picture: '',
	// The video: how the finished bath moves.
	video: 'grow', // 'grow' (the making, replayed) | 'water' (living loop)
	waterAmp: 0.35,
	loop: 6,
} );

const clamp = ( v, lo, hi ) => Math.max( lo, Math.min( hi, v ) );

const num = ( v, lo, hi, dflt ) => {
	const n = Number( v );
	return Number.isFinite( n ) ? clamp( n, lo, hi ) : dflt;
};

const hex = ( v, dflt ) =>
	/^#[0-9a-f]{6}$/i.test( String( v || '' ) ) ? String( v ) : dflt;

const pick = ( v, list, dflt ) => ( list.includes( v ) ? v : dflt );

/** One stored op, validated; null when it is not an op at all. */
function cleanOp( raw ) {
	if ( ! Array.isArray( raw ) || 'string' !== typeof raw[ 0 ] ) {
		return null;
	}
	const t = raw[ 0 ];
	const n = ( i, lo, hi, d ) => num( raw[ i ], lo, hi, d );
	if ( OP.DROP === t ) {
		return [
			t,
			n( 1, -1, 3, 0.5 ),
			n( 2, -1, 2, 0.5 ),
			n( 3, 0.002, 0.6, 0.05 ),
			Math.round( n( 4, -1, 7, 0 ) ),
		];
	}
	if ( OP.TINE === t || OP.COMB === t ) {
		const ux = n( 3, -1, 1, 0 );
		const uy = n( 4, -1, 1, 1 );
		const L = Math.hypot( ux, uy ) || 1;
		const out = [
			t,
			n( 1, -1, 3, 0.5 ),
			n( 2, -1, 2, 0.5 ),
			ux / L,
			uy / L,
			n( 5, 0, 1.2, 0.3 ),
			n( 6, 0.002, 0.3, 0.02 ),
		];
		if ( OP.COMB === t ) {
			out.push( n( 7, 0.01, 1.5, 0.11 ) );
		}
		return out;
	}
	if ( OP.VORTEX === t ) {
		return [
			t,
			n( 1, -1, 3, 0.5 ),
			n( 2, -1, 2, 0.5 ),
			n( 3, -14, 14, 2.5 ),
			n( 4, 0.02, 1.2, 0.16 ),
		];
	}
	if ( OP.ARC === t || OP.RING === t ) {
		const out = [
			t,
			n( 1, -1, 3, 0.5 ),
			n( 2, -1, 2, 0.5 ),
			n( 3, 0.02, 2, 0.3 ),
			n( 4, -1.2, 1.2, 0.3 ),
			n( 5, 0.002, 0.3, 0.02 ),
		];
		if ( OP.RING === t ) {
			out.push( n( 6, 0.01, 1, 0.09 ) );
		}
		return out;
	}
	if ( OP.WAVE === t ) {
		const ux = n( 1, -1, 1, 0 );
		const uy = n( 2, -1, 1, 1 );
		const L = Math.hypot( ux, uy ) || 1;
		return [
			t,
			ux / L,
			uy / L,
			n( 3, 0, 0.35, 0.05 ),
			n( 4, 0.03, 2, 0.3 ),
			n( 5, -7, 7, 0 ),
		];
	}
	return null;
}

/**
 * Normalize raw params (defaults, a stored generator payload, QA input)
 * into the complete safe shape the studio and the engine expect.
 */
export function mergeParams( raw ) {
	const p = { ...DEFAULTS, ...( raw && 'object' === typeof raw ? raw : {} ) };
	const d = DEFAULTS;
	p.ops = ( Array.isArray( p.ops ) ? p.ops : [] )
		.map( cleanOp )
		.filter( Boolean )
		.slice( 0, MAX_OPS );
	const inks = ( Array.isArray( p.inks ) ? p.inks : [] )
		.map( ( c, i ) => hex( c, DEFAULT_INKS[ i % DEFAULT_INKS.length ] ) )
		.slice( 0, 8 );
	while ( inks.length < 5 ) {
		inks.push( DEFAULT_INKS[ inks.length % DEFAULT_INKS.length ] );
	}
	p.inks = inks;
	p.bath = hex( p.bath, d.bath );
	p.bathClear = !! p.bathClear;
	p.aspect = num( p.aspect, 0.5, 2, d.aspect );
	p.seed = num( p.seed, 1, 999999, d.seed ) | 0;
	p.recipe = String( p.recipe || '' );
	p.tool = pick( p.tool, TOOLS, d.tool );
	p.dropSize = num( p.dropSize, 0.01, 0.16, d.dropSize );
	p.rings = clamp( Math.round( num( p.rings, 1, 7, 1 ) ), 1, 7 );
	p.spacing = num( p.spacing, 0.02, 0.5, d.spacing );
	p.softness = num( p.softness, 0.004, 0.12, d.softness );
	p.force = num( p.force, 0.1, 1.4, d.force );
	p.mirror = !! p.mirror;
	p.embed = pick( p.embed, [ 'replay', 'water', 'interactive' ], d.embed );
	p.waveAmp = num( p.waveAmp, 0.005, 0.25, d.waveAmp );
	p.waveLen = num( p.waveLen, 0.05, 1.2, d.waveLen );
	p.vortexRadius = num( p.vortexRadius, 0.04, 0.6, d.vortexRadius );
	p.fanSpread = num( p.fanSpread, 20, 140, d.fanSpread );
	p.fanTeeth = Math.round( num( p.fanTeeth, 3, 13, d.fanTeeth ) );
	p.arcForce = num( p.arcForce, 0.05, 1.2, d.arcForce );
	p.flowerKind = pick( p.flowerKind, FLOWER_KINDS, d.flowerKind );
	p.flowerSize = num( p.flowerSize, 0.05, 0.3, d.flowerSize );
	p.petals = clamp( Math.round( num( p.petals, 4, 14, d.petals ) ), 4, 14 );
	p.stem = !! p.stem;
	p.veins = num( p.veins, 0, 1, d.veins );
	p.paper = num( p.paper, 0, 1, d.paper );
	// Groups must partition the history exactly, or undo would tear ops
	// apart; anything inconsistent falls back to one-op groups.
	const g = ( Array.isArray( p.groups ) ? p.groups : [] ).map( ( v ) =>
		Math.max( 1, Math.round( Number( v ) || 1 ) )
	);
	p.groups =
		g.reduce( ( a, b ) => a + b, 0 ) === p.ops.length
			? g
			: p.ops.map( () => 1 );
	p.seamless = !! p.seamless;
	p.picture =
		'string' === typeof p.picture &&
		/^data:image\/(jpeg|png|webp);base64,/.test( p.picture ) &&
		p.picture.length < 6000000
			? p.picture
			: '';
	// A picture has edges of its own; it cannot wrap without a seam. And
	// it IS the water, so the water is not clear.
	if ( p.picture ) {
		p.seamless = false;
		p.bathClear = false;
	}
	p.video = pick( p.video, [ 'grow', 'water', 'print' ], d.video );
	p.waterAmp = num( p.waterAmp, 0, 1, d.waterAmp );
	p.loop = num( p.loop, 2, 16, d.loop );
	return p;
}

/* ------------------------------ the inverses ------------------------------ */

/*
 * Each function maps a point BACK through one operation. `s` scales the
 * operation's strength (the replay grows the newest op from 0 to 1; a
 * finished op has s = 1).
 */

/** Drop: inside the disc the journey ends - the caller checks that. */
function unDrop( x, y, op, s ) {
	const r = op[ 3 ] * s;
	const dx = x - op[ 1 ];
	const dy = y - op[ 2 ];
	const L2 = dx * dx + dy * dy;
	const r2 = r * r;
	if ( L2 <= r2 ) {
		return null; // landed in the drop
	}
	const k = Math.sqrt( 1 - r2 / L2 );
	return [ op[ 1 ] + dx * k, op[ 2 ] + dy * k ];
}

function unTine( x, y, op, s ) {
	const ux = op[ 3 ];
	const uy = op[ 4 ];
	// Perpendicular distance to the line - invariant under the shear.
	const d = Math.abs( ( x - op[ 1 ] ) * -uy + ( y - op[ 2 ] ) * ux );
	const shift = ( op[ 5 ] * s * op[ 6 ] ) / ( op[ 6 ] + d );
	return [ x - ux * shift, y - uy * shift ];
}

function unComb( x, y, op, s ) {
	const ux = op[ 3 ];
	const uy = op[ 4 ];
	const sp = op[ 7 ];
	const e = ( x - op[ 1 ] ) * -uy + ( y - op[ 2 ] ) * ux;
	// Distance to the nearest tine of the comb.
	const m = ( ( ( e + sp / 2 ) % sp ) + sp ) % sp;
	const d = Math.abs( m - sp / 2 );
	const shift = ( op[ 5 ] * s * op[ 6 ] ) / ( op[ 6 ] + d );
	return [ x - ux * shift, y - uy * shift ];
}

function unVortex( x, y, op, s ) {
	const dx = x - op[ 1 ];
	const dy = y - op[ 2 ];
	const L = Math.hypot( dx, dy );
	const q = 1 + ( L / op[ 4 ] ) * ( L / op[ 4 ] );
	const th = ( -op[ 3 ] * s ) / ( q * q );
	const c = Math.cos( th );
	const sn = Math.sin( th );
	return [ op[ 1 ] + dx * c - dy * sn, op[ 2 ] + dx * sn + dy * c ];
}

function unArc( x, y, op, s, ring ) {
	const dx = x - op[ 1 ];
	const dy = y - op[ 2 ];
	const L = Math.hypot( dx, dy );
	const R = Math.max( 0.02, op[ 3 ] );
	let dist = L - R;
	if ( ring ) {
		const sp = op[ 6 ];
		dist = ( ( ( ( dist + sp / 2 ) % sp ) + sp ) % sp ) - sp / 2;
	}
	// alpha is an arc LENGTH at the circle, so the pull feels like a tine.
	const phi =
		( ( op[ 4 ] * s ) / R ) * ( op[ 5 ] / ( op[ 5 ] + Math.abs( dist ) ) );
	const c = Math.cos( -phi );
	const sn = Math.sin( -phi );
	return [ op[ 1 ] + dx * c - dy * sn, op[ 2 ] + dx * sn + dy * c ];
}

function unWave( x, y, op, s ) {
	const ux = op[ 1 ];
	const uy = op[ 2 ];
	// Phase runs along u, the sway is perpendicular - phase is invariant.
	const v = x * ux + y * uy;
	const shift =
		op[ 3 ] * s * Math.sin( ( 2 * Math.PI * v ) / op[ 4 ] + op[ 5 ] );
	return [ x - -uy * shift, y - ux * shift ];
}

/**
 * The colour of the bath at (x, y): walk the history backwards; the first
 * drop that contains the wandering point wins.
 *
 * @param {Array}  ops   The history.
 * @param {number} x     Bath x (0..aspect).
 * @param {number} y     Bath y (0..1).
 * @param {Object} [opt] { count, lastT } - a replay renders a prefix, the
 *                       newest op scaled by lastT.
 * @return {number} Ink slot index, or -1 for the bath itself.
 */
export function colorAt( ops, x, y, opt ) {
	return traceColor( ops, x, y, opt ).ink;
}

/**
 * Like colorAt, but with everything the LOOK needs: the rim distance
 * (0 centre .. 1 rim of the ORIGINAL drop - exact through every later
 * deformation, because it is measured in the pre-image), the pre-image
 * position inside the drop (pigment clouds live there and stretch with
 * the combing), and which drop it was (per-drop tone).
 *
 * @return {Object} { ink, edge, u, v, k } - ink -1 for bath AND for the
 *                  gall drop (whose edge still reports, for its rim).
 */
export function traceColor( ops, x, y, opt ) {
	const count = opt && Number.isFinite( opt.count ) ? opt.count : ops.length;
	const lastT = opt && Number.isFinite( opt.lastT ) ? opt.lastT : 1;
	if ( opt && opt.seamless ) {
		return traceSeamless( ops, x, y, count, lastT, opt.aspect || 1 );
	}
	let px = x;
	let py = y;
	for ( let k = count - 1; k >= 0; k-- ) {
		const op = ops[ k ];
		const s = k === count - 1 ? lastT : 1;
		if ( s <= 0 ) {
			continue;
		}
		let out;
		if ( OP.DROP === op[ 0 ] ) {
			out = unDrop( px, py, op, s );
			if ( ! out ) {
				const r = op[ 3 ] * s;
				return {
					ink: op[ 4 ],
					edge: Math.hypot( px - op[ 1 ], py - op[ 2 ] ) / r,
					u: ( px - op[ 1 ] ) / r,
					v: ( py - op[ 2 ] ) / r,
					k,
				};
			}
		} else if ( OP.TINE === op[ 0 ] ) {
			out = unTine( px, py, op, s );
		} else if ( OP.COMB === op[ 0 ] ) {
			out = unComb( px, py, op, s );
		} else if ( OP.VORTEX === op[ 0 ] ) {
			out = unVortex( px, py, op, s );
		} else if ( OP.ARC === op[ 0 ] ) {
			out = unArc( px, py, op, s, false );
		} else if ( OP.RING === op[ 0 ] ) {
			out = unArc( px, py, op, s, true );
		} else {
			out = unWave( px, py, op, s );
		}
		px = out[ 0 ];
		py = out[ 1 ];
	}
	// Where the point started on the water - a picture floating on the
	// bath shows its colour from exactly there.
	return { ink: -1, edge: 0, u: 0, v: 0, k: -1, x: px, y: py };
}

/* ------------------------------ seamless tile ----------------------------- */

/*
 * v1.9: the bath as a tile that wraps around its edges (a torus of
 * aspect x 1). The exact drop pushes ink out to infinity, which a finite
 * tile cannot hold, so every op gets a periodic form that is still
 * exactly invertible:
 *
 *   drop     displaces only within the reach (just under half the tile):
 *            r'^2 = r^2 + r0^2 (1 - r^2/R^2) maps 0..R onto r..R - near the
 *            drop it is the classic drop, at the reach it is still.
 *   curl,    rotate by an angle that depends only on the distance (that
 *   arc      is what makes them exact); in the tile it fades to zero at
 *            the reach.
 *   needle,  are snapped (toSeamless) to directions and spacings whose
 *   comb,    lines close on themselves across the tile - a needle on a
 *   wave     torus is a comb of its own wrapped copies.
 *
 * Distances are taken to the nearest copy of the centre (the reach is
 * under half the tile, so that copy is unambiguous).
 */
export const seamReach = ( aspect ) => 0.48 * Math.min( aspect, 1 );

const wrapIn = ( v, size ) => ( ( v % size ) + size ) % size;
const nearest = ( d, size ) => d - size * Math.round( d / size );

function traceSeamless( ops, x, y, count, lastT, A ) {
	const R = seamReach( A );
	let px = wrapIn( x, A );
	let py = wrapIn( y, 1 );
	for ( let k = count - 1; k >= 0; k-- ) {
		const op = ops[ k ];
		const s = k === count - 1 ? lastT : 1;
		if ( s <= 0 ) {
			continue;
		}
		const t = op[ 0 ];
		if ( OP.DROP === t ) {
			const dx = nearest( px - op[ 1 ], A );
			const dy = nearest( py - op[ 2 ], 1 );
			const r = op[ 3 ] * s;
			const L2 = dx * dx + dy * dy;
			if ( L2 <= r * r ) {
				return {
					ink: op[ 4 ],
					edge: Math.sqrt( L2 ) / r,
					u: dx / r,
					v: dy / r,
					k,
				};
			}
			if ( L2 < R * R ) {
				const q = Math.sqrt(
					( ( L2 - r * r ) * R * R ) / ( ( R * R - r * r ) * L2 )
				);
				px = op[ 1 ] + dx * q;
				py = op[ 2 ] + dy * q;
			}
		} else if ( OP.VORTEX === t ) {
			const dx = nearest( px - op[ 1 ], A );
			const dy = nearest( py - op[ 2 ], 1 );
			const L = Math.hypot( dx, dy );
			if ( L < R ) {
				const q = 1 + ( L / op[ 4 ] ) * ( L / op[ 4 ] );
				const qc = 1 + ( R / op[ 4 ] ) * ( R / op[ 4 ] );
				const th =
					( -op[ 3 ] * s * ( 1 / ( q * q ) - 1 / ( qc * qc ) ) ) /
					( 1 - 1 / ( qc * qc ) );
				const c = Math.cos( th );
				const sn = Math.sin( th );
				px = op[ 1 ] + dx * c - dy * sn;
				py = op[ 2 ] + dx * sn + dy * c;
			}
		} else if ( OP.ARC === t || OP.RING === t ) {
			const dx = nearest( px - op[ 1 ], A );
			const dy = nearest( py - op[ 2 ], 1 );
			const L = Math.hypot( dx, dy );
			if ( L < R ) {
				const Rc = Math.max( 0.02, op[ 3 ] );
				let dist = L - Rc;
				if ( OP.RING === t ) {
					const sp = op[ 6 ];
					dist =
						( ( ( ( dist + sp / 2 ) % sp ) + sp ) % sp ) - sp / 2;
				}
				const fade = ( 1 - ( L / R ) * ( L / R ) ) ** 2;
				const phi =
					( ( op[ 4 ] * s ) / Rc ) *
					( op[ 5 ] / ( op[ 5 ] + Math.abs( dist ) ) ) *
					fade;
				const c = Math.cos( -phi );
				const sn = Math.sin( -phi );
				px = op[ 1 ] + dx * c - dy * sn;
				py = op[ 2 ] + dx * sn + dy * c;
			}
		} else {
			// Needles, combs and waves arrive snapped; their own formulas
			// are periodic then.
			const out =
				OP.TINE === t
					? unTine( px, py, op, s )
					: OP.COMB === t
					? unComb( px, py, op, s )
					: unWave( px, py, op, s );
			px = out[ 0 ];
			py = out[ 1 ];
		}
		px = wrapIn( px, A );
		py = wrapIn( py, 1 );
	}
	return { ink: -1, edge: 0, u: 0, v: 0, k: -1, x: px, y: py };
}

const gcd = ( a, b ) => ( b ? gcd( b, a % b ) : Math.abs( a ) );

/*
 * A line family that closes on the tile: normal n parallel to
 * (i / A, j) with whole numbers i, j; the copies are 1 / |(i/A, j)|
 * apart. snapComb picks the family closest to a wanted normal and
 * spacing; a lone needle takes the widest family in its direction.
 */
function snapLines( nx, ny, A, spacing ) {
	if ( spacing ) {
		const i = Math.round( ( A * nx ) / spacing );
		const j = Math.round( ny / spacing );
		if ( i || j ) {
			const L = Math.hypot( i / A, j );
			return { nx: i / A / L, ny: j / L, sp: 1 / L };
		}
	}
	let best = null;
	for ( let i = -4; i <= 4; i++ ) {
		for ( let j = -4; j <= 4; j++ ) {
			if ( ( ! i && ! j ) || 1 !== gcd( Math.abs( i ), Math.abs( j ) ) ) {
				continue;
			}
			const L = Math.hypot( i / A, j );
			const c = ( ( i / A ) * nx + j * ny ) / L;
			if ( ! best || c > best.c + 1e-9 ) {
				best = { c, nx: i / A / L, ny: j / L, sp: 1 / L };
			}
		}
	}
	return best;
}

/**
 * The history as the seamless tile renders it: needles become combs of
 * their wrapped copies, combs and waves snap to spacings that close on
 * the tile, drops and arcs stay inside the reach. Pure and idempotent;
 * the stored history is never changed, so switching the tile off brings
 * the open bath back exactly.
 *
 * @param {Array}  ops    Clean ops.
 * @param {number} aspect Tile aspect.
 * @return {Array} Ops for the seamless renderer.
 */
export function toSeamless( ops, aspect ) {
	const A = aspect;
	const R = seamReach( A );
	return ops.map( ( op ) => {
		const t = op[ 0 ];
		if ( OP.DROP === t ) {
			return [
				t,
				op[ 1 ],
				op[ 2 ],
				Math.min( op[ 3 ], R * 0.9 ),
				op[ 4 ],
			];
		}
		if ( OP.ARC === t || OP.RING === t ) {
			const out = [ ...op ];
			out[ 3 ] = Math.min( op[ 3 ], R * 0.85 );
			return out;
		}
		if ( OP.TINE === t || OP.COMB === t ) {
			const ux = op[ 3 ];
			const uy = op[ 4 ];
			const snap = snapLines( -uy, ux, A, OP.COMB === t ? op[ 7 ] : 0 );
			// u is the normal turned back; keep the pull's sense.
			let nux = snap.ny;
			let nuy = -snap.nx;
			if ( nux * ux + nuy * uy < 0 ) {
				nux = -nux;
				nuy = -nuy;
			}
			return [
				OP.COMB,
				op[ 1 ],
				op[ 2 ],
				nux,
				nuy,
				op[ 5 ],
				op[ 6 ],
				snap.sp,
			];
		}
		if ( OP.WAVE === t ) {
			let a = Math.round( ( A * op[ 1 ] ) / op[ 4 ] );
			let b = Math.round( op[ 2 ] / op[ 4 ] );
			if ( ! a && ! b ) {
				if ( Math.abs( op[ 1 ] ) * A >= Math.abs( op[ 2 ] ) ) {
					a = op[ 1 ] < 0 ? -1 : 1;
				} else {
					b = op[ 2 ] < 0 ? -1 : 1;
				}
			}
			const L = Math.hypot( a / A, b );
			return [ t, a / A / L, b / L, op[ 3 ], 1 / L, op[ 5 ] ];
		}
		return op;
	} );
}

/** The forward comb shear - the tests prove rim EXACTNESS through it. */
export function combForward( x, y, op ) {
	const e = ( x - op[ 1 ] ) * -op[ 4 ] + ( y - op[ 2 ] ) * op[ 3 ];
	const sp = op[ 7 ];
	const m = ( ( ( e + sp / 2 ) % sp ) + sp ) % sp;
	const d = Math.abs( m - sp / 2 );
	const shift = ( op[ 5 ] * op[ 6 ] ) / ( op[ 6 ] + d );
	return [ x + op[ 3 ] * shift, y + op[ 4 ] * shift ];
}

/** cleanOp for builders that assemble ops at runtime (flowers, splatter). */
export const cleanOpPublic = ( raw ) => cleanOp( raw );

/** The raw inverses, exported so the tests can prove them exact. */
export const INV = { unDrop, unTine, unComb, unVortex, unWave, unArc };

/**
 * The forward drop displacement - only the tests need it, to prove the
 * inverse honest.
 */
export function dropForward( x, y, op ) {
	const dx = x - op[ 1 ];
	const dy = y - op[ 2 ];
	const L2 = dx * dx + dy * dy;
	if ( L2 < 1e-12 ) {
		return [ x, y ];
	}
	const k = Math.sqrt( 1 + ( op[ 3 ] * op[ 3 ] ) / L2 );
	return [ op[ 1 ] + dx * k, op[ 2 ] + dy * k ];
}

/* ------------------------------- the recipes ------------------------------ */

/** Deterministic Lehmer walk - the house bans the browser's dice. */
export function rng( seed ) {
	let s = ( seed | 0 ) % 2147483647 || 7;
	return () => {
		s = ( s * 48271 ) % 2147483647;
		return s / 2147483647;
	};
}

const sprinkleOps = ( rand, aspect, inkCount, n, rMin, rMax ) => {
	const ops = [];
	for ( let i = 0; i < n; i++ ) {
		const big = 1 - i / n; // early drops large, late drops small
		ops.push( [
			OP.DROP,
			0.05 + rand() * ( aspect - 0.1 ),
			0.05 + rand() * 0.9,
			rMin + rand() * ( rMax - rMin ) * ( 0.45 + 0.55 * big ),
			Math.floor( rand() * inkCount ),
		] );
	}
	return ops;
};

/*
 * The classic ground: real marbling COVERS the bath before any comb
 * touches it. First a bed of large drops in the first two inks, then a
 * middle layer in every ink, then small accents - water stays visible
 * only in the cracks, which is exactly the traditional look.
 */
const groundOps = ( rand, aspect, inkCount ) => {
	const ops = [];
	for ( let i = 0; i < 18; i++ ) {
		ops.push( [
			OP.DROP,
			0.04 + rand() * ( aspect - 0.08 ),
			0.04 + rand() * 0.92,
			0.12 + rand() * 0.07,
			i % Math.min( 2, inkCount ),
		] );
	}
	for ( let i = 0; i < 26; i++ ) {
		ops.push( [
			OP.DROP,
			0.04 + rand() * ( aspect - 0.08 ),
			0.04 + rand() * 0.92,
			0.05 + rand() * 0.05,
			Math.floor( rand() * inkCount ),
		] );
	}
	for ( let i = 0; i < 20; i++ ) {
		ops.push( [
			OP.DROP,
			0.04 + rand() * ( aspect - 0.08 ),
			0.04 + rand() * 0.92,
			0.02 + rand() * 0.03,
			Math.floor( rand() * inkCount ),
		] );
	}
	return ops;
};

/*
 * v1.9: the gel-git lying on its side, pulled left and right, so the
 * nonpareil comb can cross its bands from above.
 */
const lyingGelgit = ( rand, aspect, spacing = 0.08 ) => {
	const y = 0.5 + rand() * spacing;
	return [
		[ OP.COMB, aspect / 2, y, 1, 0, 0.3, 0.02, spacing ],
		[ OP.COMB, aspect / 2, y + spacing / 2, -1, 0, 0.3, 0.02, spacing ],
	];
};

const gelgitOps = ( aspect, spacing = 0.15, alpha = 0.45, lambda = 0.024 ) => [
	[ OP.COMB, aspect / 2, 0.5, 0, 1, alpha, lambda, spacing ],
	[ OP.COMB, aspect / 2 + spacing / 2, 0.5, 0, -1, alpha, lambda, spacing ],
];

/**
 * The classic patterns, each a seeded op sequence over the CURRENT inks.
 * A recipe is a starting point - the bath stays fully combable after it.
 */
export const RECIPES = [
	{
		id: 'stone',
		label: 'Stone',
		build: ( rand, aspect, inks ) => [
			...groundOps( rand, aspect, inks ),
			...sprinkleOps( rand, aspect, inks, 10, 0.015, 0.05 ),
		],
	},
	{
		id: 'gelgit',
		label: 'Gel-git',
		build: ( rand, aspect, inks ) => [
			...groundOps( rand, aspect, inks ),
			...gelgitOps( aspect ),
		],
	},
	// v1.9: the fine-comb patterns were rebuilt. Their combs used to pull
	// half a bath-length through an already fine gel-git, which smeared
	// every one of them into the same grainy streaks; now each pull is
	// sized to its tooth spacing, so the pattern's own shape shows.
	{
		id: 'nonpareil',
		label: 'Nonpareil',
		build: ( rand, aspect, inks ) => [
			...groundOps( rand, aspect, inks ),
			...lyingGelgit( rand, aspect ),
			// The fine comb, pulled once across the bands: a row of small
			// arches in every band.
			[ OP.COMB, aspect / 2, 0.5, 0, 1, 0.06, 0.01, 0.035 ],
		],
	},
	{
		id: 'chevron',
		label: 'Chevron',
		build: ( rand, aspect, inks ) => {
			const ground = [
				...groundOps( rand, aspect, inks ),
				...gelgitOps( aspect, 0.08, 0.3, 0.02 ),
			];
			// One comb across, then the same comb back, shifted by half a
			// tooth: neighbouring rows point opposite ways - arrows.
			const y = 0.5 + rand() * 0.07;
			return [
				...ground,
				[ OP.COMB, aspect / 2, y, 1, 0, 0.07, 0.01, 0.07 ],
				[ OP.COMB, aspect / 2, y + 0.035, -1, 0, 0.07, 0.01, 0.07 ],
			];
		},
	},
	{
		id: 'bouquet',
		label: 'Bouquet',
		build: ( rand, aspect, inks ) => [
			...groundOps( rand, aspect, inks ),
			...gelgitOps( aspect ),
			[ OP.COMB, aspect / 2, 0.5, 0, 1, 0.55, 0.016, 0.09 ],
			[ OP.WAVE, 0, 1, 0.055, 0.3, rand() * 6.28 ],
		],
	},
	{
		id: 'curls',
		label: 'French curls',
		build: ( rand, aspect, inks ) => {
			const ops = [
				...groundOps( rand, aspect, inks ),
				...gelgitOps( aspect ),
			];
			const cols = Math.max( 2, Math.round( 3 * aspect ) );
			for ( let gy = 0; gy < 3; gy++ ) {
				for ( let gx = 0; gx < cols; gx++ ) {
					ops.push( [
						OP.VORTEX,
						( ( gx + 0.5 ) / cols ) * aspect +
							( rand() - 0.5 ) * 0.04,
						( gy + 0.5 ) / 3 + ( rand() - 0.5 ) * 0.04,
						( ( gx + gy ) % 2 ? -1 : 1 ) * ( 2.4 + rand() * 1.4 ),
						0.14,
					] );
				}
			}
			return ops;
		},
	},
	{
		id: 'peacock',
		label: 'Peacock',
		build: ( rand, aspect, inks ) => [
			...groundOps( rand, aspect, inks ),
			...lyingGelgit( rand, aspect, 0.1 ),
			// A wide comb down and the same back up between its teeth
			// opens rounded fans; a fine comb sets the feathers in them.
			[
				OP.COMB,
				aspect / 2 + rand() * 0.16,
				0.5,
				0,
				1,
				0.22,
				0.03,
				0.16,
			],
			[ OP.COMB, aspect / 2 + 0.08, 0.5, 0, -1, 0.16, 0.03, 0.16 ],
			[ OP.COMB, aspect / 2, 0.5, 0, 1, 0.05, 0.01, 0.04 ],
		],
	},
];

/*
 * v1.3, two more classics. Spanish wave: the sheet is rocked as it is
 * laid on, so a fine comb pattern carries long diagonal folds - here a
 * long slanted sway with a faint cross ripple. Italian vein: the bath is
 * showered with gall, which opens cells between the colours; a light
 * comb then draws the thin veins that run between them.
 */
RECIPES.push(
	{
		id: 'spanish',
		label: 'Spanish wave',
		build: ( rand, aspect, inks ) => [
			...groundOps( rand, aspect, inks ),
			...gelgitOps( aspect, 0.08, 0.3, 0.02 ),
			[ OP.COMB, aspect / 2, 0.5, 1, 0, 0.06, 0.01, 0.035 ],
			[ OP.WAVE, 0.94, 0.34, 0.07, 0.62, rand() * 6.28 ],
			[ OP.WAVE, -0.34, 0.94, 0.01, 0.12, rand() * 6.28 ],
		],
	},
	{
		id: 'italian',
		label: 'Italian vein',
		// v1.9: the vein colour first, as one sheet over the bath; every
		// later drop squeezes it into the thin veins between the cells -
		// exactly what the drop mathematics does to earlier ink.
		build: ( rand, aspect, inks ) => {
			const vein = Math.min( 4, inks - 1 );
			const ops = [ [ OP.DROP, aspect / 2, 0.5, 0.95, vein ] ];
			for ( let i = 0; i < 160; i++ ) {
				ops.push( [
					OP.DROP,
					0.02 + rand() * ( aspect - 0.04 ),
					0.02 + rand() * 0.96,
					0.04 + rand() * 0.07,
					( i % 4 ) % inks,
				] );
			}
			for ( let i = 0; i < 40; i++ ) {
				ops.push( [
					OP.DROP,
					0.02 + rand() * ( aspect - 0.04 ),
					0.02 + rand() * 0.96,
					0.006 + rand() * 0.012,
					GALL,
				] );
			}
			ops.push( [ OP.WAVE, 0.4, 0.92, 0.025, 0.55, rand() * 6.28 ] );
			return ops;
		},
	}
);

/*
 * v1.9, five more classics.
 *
 * Suminagashi: the Japanese floating ink - ink and clear water dropped
 * in turn on the same spots make rings of fine lines, which a breath and
 * a stir set flowing. Hatip: the Turkish spot patterns, small ebru
 * flowers on a light stone ground. Bird wing: nonpareil with a coarse
 * comb pulled across it, the arches folding into feathers. Zebra: rows
 * of drops in two inks make bands, two sways and two curls set them
 * rolling. French shell: every drop lies in a pale halo of its own.
 */
RECIPES.push(
	{
		id: 'suminagashi',
		label: 'Suminagashi',
		build: ( rand, aspect, inks ) => {
			const ops = [];
			const centers = [
				[ 0.26 * aspect, 0.36 ],
				[ 0.75 * aspect, 0.3 ],
				[ 0.52 * aspect, 0.78 ],
			].map( ( [ x, y ] ) => [
				x + ( rand() - 0.5 ) * 0.12,
				y + ( rand() - 0.5 ) * 0.1,
			] );
			const sumi = Math.min( 4, inks - 1 );
			for ( let k = 0; k < 34; k++ ) {
				for ( const [ cx, cy ] of centers ) {
					ops.push( [
						OP.DROP,
						cx,
						cy,
						0.042,
						k % 2 ? GALL : 4 === k % 6 ? 0 : sumi,
					] );
				}
			}
			ops.push(
				[
					OP.VORTEX,
					0.41 * aspect + ( rand() - 0.5 ) * 0.1,
					0.5,
					1.6 + rand() * 0.8,
					0.3,
				],
				[
					OP.VORTEX,
					0.79 * aspect + ( rand() - 0.5 ) * 0.1,
					0.62,
					-1.3 - rand() * 0.6,
					0.26,
				],
				[ OP.WAVE, 0.3, 0.95, 0.07, 0.6, rand() * 6.28 ],
				[ OP.WAVE, 0.95, -0.3, 0.04, 0.33, rand() * 6.28 ]
			);
			return ops;
		},
	},
	{
		id: 'hatip',
		label: 'Hatip',
		build: ( rand, aspect, inks ) => {
			const ops = [];
			const light = [ 2, 3, 2 ].map( ( k ) => k % inks );
			for ( let i = 0; i < 40; i++ ) {
				ops.push( [
					OP.DROP,
					0.03 + rand() * ( aspect - 0.06 ),
					0.03 + rand() * 0.94,
					0.06 + rand() * 0.07,
					light[ i % 3 ],
				] );
			}
			const kinds = [ 'tulip', 'carnation', 'daisy' ];
			const cols = 3;
			for ( let i = 0; i < 6; i++ ) {
				ops.push(
					...flowerOps(
						kinds[ ( i + Math.floor( rand() * 3 ) ) % 3 ],
						( ( ( i % cols ) + 0.5 ) / cols ) * aspect +
							( rand() - 0.5 ) * 0.06,
						0.3 + Math.floor( i / cols ) * 0.42,
						0.07 + rand() * 0.015,
						( rand() - 0.5 ) * 24,
						{
							inkA: [ 0, 1, 4 ][ i % 3 ] % inks,
							inkB: [ 1, 0, 3 ][ i % 3 ] % inks,
							inkStem: 4 % inks,
							petals: 9,
							stem: true,
						}
					)
				);
			}
			return ops;
		},
	},
	{
		id: 'birdwing',
		label: 'Bird wing',
		build: ( rand, aspect, inks ) => [
			...groundOps( rand, aspect, inks ),
			...lyingGelgit( rand, aspect ),
			[ OP.COMB, aspect / 2, 0.5, 0, 1, 0.06, 0.01, 0.035 ],
			[
				OP.COMB,
				aspect / 2,
				0.5 + rand() * 0.24,
				1,
				0,
				0.14,
				0.03,
				0.24,
			],
		],
	},
	{
		id: 'zebra',
		label: 'Zebra',
		build: ( rand, aspect, inks ) => {
			const ops = [];
			const a = Math.min( 4, inks - 1 );
			const b = 2 % inks;
			// Rows of overlapping drops - well inside MAX_OPS, or the
			// sways at the end would be cut off.
			for ( let row = 0; row < 12; row++ ) {
				for ( let x = -0.02; x < aspect + 0.06; x += 0.06 ) {
					ops.push( [
						OP.DROP,
						x,
						( row + 0.5 ) / 12,
						0.052,
						row % 2 ? b : a,
					] );
				}
			}
			ops.push(
				[ OP.WAVE, 1, 0, 0.07, 0.48, rand() * 6.28 ],
				[ OP.WAVE, 0.25, 0.97, 0.035, 0.22, rand() * 6.28 ],
				[
					OP.VORTEX,
					( 0.25 + rand() * 0.15 ) * aspect,
					0.3 + rand() * 0.2,
					1.0,
					0.25,
				],
				[
					OP.VORTEX,
					( 0.6 + rand() * 0.15 ) * aspect,
					0.55 + rand() * 0.2,
					-1.1,
					0.25,
				]
			);
			return ops;
		},
	},
	{
		id: 'shell',
		label: 'French shell',
		build: ( rand, aspect, inks ) => {
			const ops = [];
			const halo = 2 % inks;
			const colors = [ 0, 1, 3, 4 ].map( ( k ) => k % inks );
			for ( let i = 0; i < 90; i++ ) {
				const x = 0.03 + rand() * ( aspect - 0.06 );
				const y = 0.03 + rand() * 0.94;
				const r = 0.045 + rand() * 0.08 * ( 1 - i / 110 );
				ops.push(
					[ OP.DROP, x, y, r, halo ],
					[ OP.DROP, x, y, r * 0.86, colors[ i % 4 ] ]
				);
			}
			return ops;
		},
	}
);

export const recipeOf = ( id ) => RECIPES.find( ( r ) => r.id === id ) || null;

/**
 * Build a recipe into an op list.
 *
 * @param {string} id      Recipe id.
 * @param {number} seed    Studio seed (drives every random choice).
 * @param {number} aspect  Bath aspect.
 * @param {number} inks    How many ink slots to cycle through.
 * @return {Array} ops, already MAX_OPS-safe.
 */
export function buildRecipe( id, seed, aspect, inks ) {
	const r = recipeOf( id );
	if ( ! r ) {
		return [];
	}
	return r
		.build( rng( seed ), aspect, Math.max( 1, inks | 0 ) )
		.map( cleanOp )
		.filter( Boolean )
		.slice( 0, MAX_OPS );
}

/* --------------------------------- mirror --------------------------------- */

/**
 * The twin of an op across the bath's middle (x -> aspect - x). Every
 * op's decay coordinate is a distance or a lattice distance, both even
 * under the flip, so the twin is exact: the mirrored bath is the bath
 * of the mirrored history. Rotations and the wave's shear flip sign.
 *
 * @param {Array}  op     A clean op.
 * @param {number} aspect Bath aspect (the width in bath units).
 * @return {Array} The mirrored op.
 */
export function mirrorOp( op, aspect ) {
	const A = aspect;
	switch ( op[ 0 ] ) {
		case OP.DROP:
			return [ op[ 0 ], A - op[ 1 ], op[ 2 ], op[ 3 ], op[ 4 ] ];
		case OP.TINE:
			return [
				op[ 0 ],
				A - op[ 1 ],
				op[ 2 ],
				-op[ 3 ],
				op[ 4 ],
				op[ 5 ],
				op[ 6 ],
			];
		case OP.COMB:
			return [
				op[ 0 ],
				A - op[ 1 ],
				op[ 2 ],
				-op[ 3 ],
				op[ 4 ],
				op[ 5 ],
				op[ 6 ],
				op[ 7 ],
			];
		case OP.VORTEX:
			return [ op[ 0 ], A - op[ 1 ], op[ 2 ], -op[ 3 ], op[ 4 ] ];
		case OP.WAVE:
			return [
				op[ 0 ],
				-op[ 1 ],
				op[ 2 ],
				-op[ 3 ],
				op[ 4 ],
				op[ 5 ] + ( 2 * Math.PI * A * op[ 1 ] ) / op[ 4 ],
			];
		case OP.ARC:
			return [
				op[ 0 ],
				A - op[ 1 ],
				op[ 2 ],
				op[ 3 ],
				-op[ 4 ],
				op[ 5 ],
			];
		case OP.RING:
			return [
				op[ 0 ],
				A - op[ 1 ],
				op[ 2 ],
				op[ 3 ],
				-op[ 4 ],
				op[ 5 ],
				op[ 6 ],
			];
		default:
			return op.slice();
	}
}

/** The history as the engine renders it: each op followed by its twin. */
export function mirroredOps( ops, aspect ) {
	const out = [];
	for ( const op of ops ) {
		out.push( op, mirrorOp( op, aspect ) );
	}
	return out.slice( 0, MAX_OPS );
}

/* -------------------------------- flowers --------------------------------- */

const rot2 = ( x, y, c, sn ) => [ x * c - y * sn, x * sn + y * c ];

/**
 * An Ebru flower as an op sequence: the traditional move of laying
 * concentric rings and then pulling the needle through them. The pulls
 * are ordinary tine ops - their far field falls off as lambda/d, so a
 * flower does not smear the rest of the bath.
 *
 * @param {string}  kind    'tulip' | 'carnation' | 'daisy'.
 * @param {number}  cx      Centre x (bath units).
 * @param {number}  cy      Centre y.
 * @param {number}  size    Ring radius.
 * @param {number}  rotDeg  Rotation: where the flower points, degrees.
 * @param {Object}  o       { petals, stem, inkA, inkB, inkStem }.
 * @return {Array} ops.
 */
export function flowerOps( kind, cx, cy, size, rotDeg, o ) {
	const ops = [];
	const rad = ( rotDeg * Math.PI ) / 180;
	const c = Math.cos( rad );
	const sn = Math.sin( rad );
	const up = rot2( 0, -1, c, sn );
	const petals = Math.max( 4, Math.min( 14, o.petals | 0 ) );
	// The rings: alternating body and accent ink.
	const ringN = 'carnation' === kind ? 5 : 4;
	for ( let i = 0; i < ringN; i++ ) {
		ops.push( [ OP.DROP, cx, cy, size, i % 2 ? o.inkB : o.inkA ] );
	}
	if ( 'tulip' === kind ) {
		// One strong pull up through the middle makes the point and the
		// cleft; two shifted pulls lift the side petals.
		ops.push( [
			OP.TINE,
			cx,
			cy,
			up[ 0 ],
			up[ 1 ],
			size * 1.3,
			size * 0.26,
		] );
		for ( const side of [ -1, 1 ] ) {
			const off = rot2( side * size * 0.52, 0, c, sn );
			ops.push( [
				OP.TINE,
				cx + off[ 0 ],
				cy + off[ 1 ],
				up[ 0 ],
				up[ 1 ],
				size * 0.5,
				size * 0.14,
			] );
		}
	} else if ( 'carnation' === kind ) {
		// Fringed top: inward pulls fanned over the upper half.
		const n = Math.max( 5, Math.round( petals * 0.7 ) );
		for ( let i = 0; i < n; i++ ) {
			const a = ( ( i / ( n - 1 ) ) * 2 - 1 ) * 1.35;
			const dir = rot2( Math.sin( a ), -Math.cos( a ), c, sn );
			ops.push( [
				OP.TINE,
				cx,
				cy,
				-dir[ 0 ],
				-dir[ 1 ],
				size * 0.62,
				size * 0.1,
			] );
		}
	} else if ( 'rose' === kind ) {
		// Rose: the rings curled by a vortex - the workshop's own trick -
		// then a few short pulls that tuck the outer petals in.
		ops.push( [ OP.VORTEX, cx, cy, 2.6, size * 0.95 ] );
		const n = Math.max( 4, Math.round( petals * 0.6 ) );
		for ( let i = 0; i < n; i++ ) {
			const a = ( i / n ) * Math.PI * 2;
			const off = rot2(
				Math.cos( a ) * size * 0.8,
				Math.sin( a ) * size * 0.8,
				c,
				sn
			);
			const dir = rot2( -Math.cos( a ), -Math.sin( a ), c, sn );
			ops.push( [
				OP.TINE,
				cx + off[ 0 ],
				cy + off[ 1 ],
				dir[ 0 ],
				dir[ 1 ],
				size * 0.22,
				size * 0.08,
			] );
		}
	} else if ( 'iris' === kind ) {
		// Iris: three standards pulled up, three falls pulled down and
		// out, a dab of the accent ink for the beard.
		for ( const a of [ -0.55, 0, 0.55 ] ) {
			const dir = rot2( Math.sin( a ), -Math.cos( a ), c, sn );
			ops.push( [
				OP.TINE,
				cx,
				cy,
				dir[ 0 ],
				dir[ 1 ],
				size * 1.15,
				size * 0.16,
			] );
		}
		for ( const a of [ -0.9, 0, 0.9 ] ) {
			const dir = rot2( Math.sin( a ), Math.cos( a ), c, sn );
			ops.push( [
				OP.TINE,
				cx,
				cy,
				dir[ 0 ],
				dir[ 1 ],
				size * 0.8,
				size * 0.14,
			] );
		}
		ops.push( [ OP.DROP, cx, cy, size * 0.18, o.inkB ] );
	} else {
		// Daisy: lines through the centre; each makes an out-petal on
		// one end and a notch on the other - petals all around.
		const n = Math.max( 3, Math.round( petals / 2 ) );
		for ( let i = 0; i < n; i++ ) {
			const a = ( i / n ) * Math.PI;
			const dir = rot2( Math.cos( a ), Math.sin( a ), c, sn );
			ops.push( [
				OP.TINE,
				cx,
				cy,
				dir[ 0 ],
				dir[ 1 ],
				size * 0.55,
				size * 0.09,
			] );
		}
	}
	if ( o.stem ) {
		// The stem LAST, laid bottom-up: each new drop bites into the one
		// below, so the trail becomes a chain of little leaves pointing at
		// the blossom - drop displacement doing the drawing, the same way
		// pulled-heart vines are made on real water.
		const base =
			'tulip' === kind
				? 0.75
				: 'carnation' === kind
				? 1.65
				: 'iris' === kind
				? 1.4
				: 'rose' === kind
				? 1.15
				: 1.25;
		for ( let i = 0; i <= 14; i++ ) {
			const t = i / 14;
			ops.push( [
				OP.DROP,
				cx - up[ 0 ] * size * ( base + t * 2.3 ),
				cy - up[ 1 ] * size * ( base + t * 2.3 ),
				size * 0.09 * ( 1 - t * 0.3 ),
				o.inkStem,
			] );
		}
	}
	return ops.map( ( raw ) => cleanOpPublic( raw ) ).filter( Boolean );
}

/** Splatter: the flick of the brush - a fan of tiny drops along a path. */
/**
 * The lace drop (v1.3): the Stormont technique - a drop of colour, then a
 * shower of tiny gall drops inside it. Each gall drop opens a cell of
 * water, and the colour between the cells becomes lace. Seeded, bounded.
 *
 * @param {Function} rand  Seeded generator.
 * @param {number}   cx    Centre x (bath units).
 * @param {number}   cy    Centre y.
 * @param {number}   r     Drop radius.
 * @param {number}   ink   Ink slot.
 * @param {number}   [n]   Cells (default 18).
 * @return {Array} ops.
 */
export function laceOps( rand, cx, cy, r, ink, n = 18 ) {
	const ops = [ [ OP.DROP, cx, cy, r, ink ] ];
	for ( let i = 0; i < n; i++ ) {
		const a = rand() * Math.PI * 2;
		const d = Math.sqrt( rand() ) * r * 0.78;
		ops.push( [
			OP.DROP,
			cx + Math.cos( a ) * d,
			cy + Math.sin( a ) * d,
			r * ( 0.09 + rand() * 0.17 ),
			GALL,
		] );
	}
	return ops;
}

export function splatterOps( rand, ax, ay, bx, by, baseR, ink ) {
	const ops = [];
	const L = Math.hypot( bx - ax, by - ay );
	const n = Math.max( 3, Math.min( 26, Math.round( L / 0.028 ) ) );
	const nx = -( by - ay ) / ( L || 1 );
	const ny = ( bx - ax ) / ( L || 1 );
	for ( let i = 0; i < n; i++ ) {
		const t = ( i + rand() * 0.8 ) / n;
		const spread = ( rand() - 0.5 ) * 0.09 * ( 0.4 + t );
		ops.push( [
			OP.DROP,
			ax + ( bx - ax ) * t + nx * spread,
			ay + ( by - ay ) * t + ny * spread,
			baseR * ( 0.25 + rand() * 0.75 ),
			ink,
		] );
	}
	return ops;
}

/* ------------------------------ replay timing ----------------------------- */

/** Seconds each op takes in the replay - drops patter, strokes sweep. */
export const opDuration = ( op ) =>
	OP.DROP === op[ 0 ] ? 0.14 : OP.VORTEX === op[ 0 ] ? 0.65 : 0.95;

/**
 * The replay schedule: cumulative start times plus a hold on the finished
 * bath, everything compressed so the whole film stays watchable.
 *
 * @param {Array}  ops     The history.
 * @param {number} maxSecs Cap for the making part (before the hold).
 * @return {Object} { starts, total, hold } in seconds.
 */
export function replaySchedule( ops, maxSecs = 11 ) {
	const starts = [];
	let t = 0;
	for ( const op of ops ) {
		starts.push( t );
		t += opDuration( op );
	}
	const scale = t > maxSecs ? maxSecs / t : 1;
	return {
		starts: starts.map( ( v ) => v * scale ),
		durations: ops.map( ( op ) => opDuration( op ) * scale ),
		total: t * scale,
		hold: 1.4,
	};
}

/** Smooth 0..1 easing for a growing op. */
export const ease = ( t ) => {
	const k = clamp( t, 0, 1 );
	return k * k * ( 3 - 2 * k );
};

/** Two composed tools reuse the exact reversible operations and history format. */
/**
 * v1.9.1: the wavy comb, exact. It used to be a chain of short combs -
 * every one of them spanning the whole bath in a slightly different
 * direction, and every one pulling by its own length, so a long wavy
 * stroke dragged the entire bath further than its width and frayed it
 * everywhere. A rake that follows a wave is a straight comb seen through
 * a sway: sway the bath straight (the wave, half a turn shifted), pull
 * the comb, sway it back. Ink then travels along wavy tooth paths, every
 * step stays exactly invertible, and the pull is capped by the force
 * like any comb.
 *
 * The drawn path gives the direction (start to end) and a sine fitted to
 * how far it strays to the side; a straight path is a straight comb.
 *
 * @param {Array}  path     Points { x, y } of the stroke so far.
 * @param {Object} params   Studio params (force, softness, spacing).
 * @param {number} pressure Pen pressure factor.
 * @return {Array} [] (too short), [ comb ] or [ wave, comb, wave ].
 */
export function wavyCombOps( path, params, pressure = 1 ) {
	const p = mergeParams( params );
	if ( ! path || path.length < 2 ) {
		return [];
	}
	const a = path[ 0 ];
	const b = path[ path.length - 1 ];
	const L = Math.hypot( b.x - a.x, b.y - a.y );
	if ( L < 0.03 ) {
		return [];
	}
	const ux = ( b.x - a.x ) / L;
	const uy = ( b.y - a.y ) / L;
	const nx = -uy;
	const ny = ux;
	const pts = path.map( ( q ) => ( {
		v: ( q.x - a.x ) * ux + ( q.y - a.y ) * uy,
		e: ( q.x - a.x ) * nx + ( q.y - a.y ) * ny,
	} ) );
	// Least squares for e(v) = A sin(w v) + B cos(w v), the wavelength
	// scanned coarse, then fine around the best.
	let best = { err: Infinity, amp: 0, lam: 1, ph: 0 };
	const tryLam = ( lam ) => {
		let ss = 0;
		let sc = 0;
		let cc = 0;
		let es = 0;
		let ec = 0;
		for ( const q of pts ) {
			const w = ( 2 * Math.PI * q.v ) / lam;
			const sn = Math.sin( w );
			const cs = Math.cos( w );
			ss += sn * sn;
			sc += sn * cs;
			cc += cs * cs;
			es += q.e * sn;
			ec += q.e * cs;
		}
		const det = ss * cc - sc * sc;
		if ( Math.abs( det ) < 1e-9 ) {
			return;
		}
		const A1 = ( es * cc - ec * sc ) / det;
		const B1 = ( ec * ss - es * sc ) / det;
		let err = 0;
		for ( const q of pts ) {
			const w = ( 2 * Math.PI * q.v ) / lam;
			err += ( q.e - A1 * Math.sin( w ) - B1 * Math.cos( w ) ) ** 2;
		}
		if ( err < best.err ) {
			best = {
				err,
				amp: Math.hypot( A1, B1 ),
				lam,
				ph: Math.atan2( B1, A1 ),
			};
		}
	};
	for ( let lam = 0.06; lam <= 1.2; lam *= 1.03 ) {
		tryLam( lam );
	}
	const coarse = best.lam;
	for ( let k = -15; k <= 15; k++ ) {
		tryLam( coarse * ( 1 + k * 0.002 ) );
	}
	const alpha = Math.min( p.force * pressure, L * 0.95 );
	const amp = Math.min( 0.3, best.amp );
	// Too little sway to matter: the plain comb.
	if ( amp < 0.004 ) {
		return [ [ OP.COMB, a.x, a.y, ux, uy, alpha, p.softness, p.spacing ] ];
	}
	// The wave op measures its phase from the origin, the fit from a.
	const v0 = a.x * ux + a.y * uy;
	const norm = ( t ) =>
		( ( ( t % ( 2 * Math.PI ) ) + 3 * Math.PI ) % ( 2 * Math.PI ) ) -
		Math.PI;
	const ph = norm( best.ph - ( 2 * Math.PI * v0 ) / best.lam );
	// The straightening sway is the same wave half a turn on (a stored
	// wave amplitude is never negative).
	const back = norm( ph + Math.PI );
	const lift = -amp * Math.sin( ( 2 * Math.PI * v0 ) / best.lam + ph );
	return [
		[ OP.WAVE, ux, uy, amp, best.lam, back ],
		[
			OP.COMB,
			a.x + nx * lift,
			a.y + ny * lift,
			ux,
			uy,
			alpha,
			p.softness,
			p.spacing,
		],
		[ OP.WAVE, ux, uy, amp, best.lam, ph ],
	];
}

export function sweepToolOps( tool, start, end, params, pressure = 1 ) {
	const p = mergeParams( params );
	const dx = end.x - start.x,
		dy = end.y - start.y,
		length = Math.hypot( dx, dy );
	if ( length < 0.008 || ! [ 'fan', 'twin' ].includes( tool ) ) {
		return [];
	}
	const angle = Math.atan2( dy, dx );
	if ( tool === 'fan' ) {
		const spread = ( p.fanSpread * Math.PI ) / 180;
		return Array.from( { length: p.fanTeeth }, ( _, i ) => {
			const theta = angle + ( i / ( p.fanTeeth - 1 ) - 0.5 ) * spread;
			return [
				OP.TINE,
				start.x,
				start.y,
				Math.cos( theta ),
				Math.sin( theta ),
				( Math.min( p.force * pressure, length ) * 1.8 ) / p.fanTeeth,
				p.softness,
			];
		} );
	}
	const radius = p.vortexRadius,
		offset = radius * 0.72;
	const turn = Math.min( 10, length * 20 ) * pressure;
	return [ -1, 1 ].map( ( side ) => [
		OP.VORTEX,
		start.x + dx * 0.35 - ( dy / length ) * offset * side,
		start.y + dy * 0.35 + ( dx / length ) * offset * side,
		side * turn,
		radius,
	] );
}
