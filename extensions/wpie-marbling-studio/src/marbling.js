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
	'flower',
	'needle',
	'comb',
	'arc',
	'ringcomb',
	'wave',
	'vortex',
	'splatter',
];

export const FLOWER_KINDS = [ 'tulip', 'carnation', 'daisy' ];

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
	softness: 0.018,
	waveAmp: 0.05,
	waveLen: 0.3,
	vortexRadius: 0.16,
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
	p.waveAmp = num( p.waveAmp, 0.005, 0.25, d.waveAmp );
	p.waveLen = num( p.waveLen, 0.05, 1.2, d.waveLen );
	p.vortexRadius = num( p.vortexRadius, 0.04, 0.6, d.vortexRadius );
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
	p.video = pick( p.video, [ 'grow', 'water' ], d.video );
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
	return { ink: -1, edge: 0, u: 0, v: 0, k: -1 };
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
	{
		id: 'nonpareil',
		label: 'Nonpareil',
		build: ( rand, aspect, inks ) => [
			...groundOps( rand, aspect, inks ),
			...gelgitOps( aspect ),
			[ OP.COMB, aspect / 2, 0.5, 1, 0, 0.5, 0.011, 0.052 ],
		],
	},
	{
		id: 'chevron',
		label: 'Chevron',
		build: ( rand, aspect, inks ) => [
			...groundOps( rand, aspect, inks ),
			...gelgitOps( aspect ),
			[ OP.COMB, aspect / 2, 0.5, 1, 0, 0.5, 0.011, 0.052 ],
			// The herringbone: a crosswise sway of exactly two tooth
			// spacings shifts neighbouring rows against each other.
			[ OP.WAVE, 0, 1, 0.03, 0.104, 0 ],
		],
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
			...gelgitOps( aspect ),
			[ OP.COMB, aspect / 2, 0.5, 0, 1, 0.5, 0.014, 0.08 ],
			[ OP.WAVE, 0, 1, 0.04, 0.16, rand() * 6.28 ],
			[ OP.COMB, aspect / 2 + 0.02, 0.5, 0, -1, 0.28, 0.01, 0.08 ],
		],
	},
];

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
			'tulip' === kind ? 0.75 : 'carnation' === kind ? 1.65 : 1.25;
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
