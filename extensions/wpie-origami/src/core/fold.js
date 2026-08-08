/**
 * The hinge tree: paper that folds because somebody folds it.
 *
 * A figure is a set of flat faces tiling the unit square, plus a list of
 * steps. Each step turns one or more sets of faces about a crease line.
 * The crease is written in PAPER coordinates and mapped through the
 * current transform of an anchor face, so a crease on a flap that is
 * already standing in the air turns about the line where that flap
 * actually is - nested hinges for free, and a fold by pi is an exact
 * reflection no matter how deep the nesting, so every flat state is
 * exact by construction and only the way there is animation.
 *
 * Pure module: no three.js, no DOM, runs under node --test.
 *
 * Conventions
 * - Paper space: unit square, x right, y DOWN (canvas/UV convention).
 * - 3D: paper point (x, y) starts at (x - 0.5, 0, y - 0.5); +Y is up,
 *   the front of the sheet (the outside of the design) faces up.
 * - A rotation's `dir` says where the flap lands in the CURRENT global
 *   view: +1 in front of (above) the rest, -1 behind (below). It drives
 *   the layer stacking and the valley/mountain notation, not the
 *   geometry - the geometry comes from `angle`, whose sign follows the
 *   right-hand rule about the crease direction line[0] -> line[1].
 */

/* ------------------------------ small algebra ----------------------------- */

/** Identity transform. r is a row-major 3x3, t a translation. */
export const IDENT = { r: [ 1, 0, 0, 0, 1, 0, 0, 0, 1 ], t: [ 0, 0, 0 ] };

/** Apply transform to a 3D point. */
export function tApply( tr, p ) {
	const { r, t } = tr;
	return [
		r[ 0 ] * p[ 0 ] + r[ 1 ] * p[ 1 ] + r[ 2 ] * p[ 2 ] + t[ 0 ],
		r[ 3 ] * p[ 0 ] + r[ 4 ] * p[ 1 ] + r[ 5 ] * p[ 2 ] + t[ 1 ],
		r[ 6 ] * p[ 0 ] + r[ 7 ] * p[ 1 ] + r[ 8 ] * p[ 2 ] + t[ 2 ],
	];
}

/** Rotate a direction (no translation). */
export function tRotate( tr, d ) {
	const { r } = tr;
	return [
		r[ 0 ] * d[ 0 ] + r[ 1 ] * d[ 1 ] + r[ 2 ] * d[ 2 ],
		r[ 3 ] * d[ 0 ] + r[ 4 ] * d[ 1 ] + r[ 5 ] * d[ 2 ],
		r[ 6 ] * d[ 0 ] + r[ 7 ] * d[ 1 ] + r[ 8 ] * d[ 2 ],
	];
}

/** a after b: result(p) = a(b(p)). */
export function tCompose( a, b ) {
	const r = new Array( 9 );
	for ( let i = 0; i < 3; i++ ) {
		for ( let j = 0; j < 3; j++ ) {
			r[ 3 * i + j ] =
				a.r[ 3 * i ] * b.r[ j ] +
				a.r[ 3 * i + 1 ] * b.r[ 3 + j ] +
				a.r[ 3 * i + 2 ] * b.r[ 6 + j ];
		}
	}
	return { r, t: tApply( a, b.t ) };
}

/** Rotation by `angle` about the line through p0 with direction d (unit not required). */
export function rotationAbout( p0, d, angle ) {
	const len = Math.hypot( d[ 0 ], d[ 1 ], d[ 2 ] ) || 1;
	const x = d[ 0 ] / len;
	const y = d[ 1 ] / len;
	const z = d[ 2 ] / len;
	const c = Math.cos( angle );
	const s = Math.sin( angle );
	const C = 1 - c;
	const r = [
		c + x * x * C,
		x * y * C - z * s,
		x * z * C + y * s,
		y * x * C + z * s,
		c + y * y * C,
		y * z * C - x * s,
		z * x * C - y * s,
		z * y * C + x * s,
		c + z * z * C,
	];
	// p' = R (p - p0) + p0
	const rp0 = [
		r[ 0 ] * p0[ 0 ] + r[ 1 ] * p0[ 1 ] + r[ 2 ] * p0[ 2 ],
		r[ 3 ] * p0[ 0 ] + r[ 4 ] * p0[ 1 ] + r[ 5 ] * p0[ 2 ],
		r[ 6 ] * p0[ 0 ] + r[ 7 ] * p0[ 1 ] + r[ 8 ] * p0[ 2 ],
	];
	return {
		r,
		t: [ p0[ 0 ] - rp0[ 0 ], p0[ 1 ] - rp0[ 1 ], p0[ 2 ] - rp0[ 2 ] ],
	};
}

/** Paper (x, y) to its starting position on the table. */
export const paperTo3d = ( p ) => [ p[ 0 ] - 0.5, 0, p[ 1 ] - 0.5 ];

const easeInOut = ( t ) =>
	t < 0.5 ? 4 * t * t * t : 1 - Math.pow( -2 * t + 2, 3 ) / 2;

/* -------------------------------- folding -------------------------------- */

/**
 * The window a rotation animates in, inside its step (default the whole step).
 *
 * @param {Object} rot Rotation entry.
 * @param {number} t   Raw step parameter 0..1.
 * @return {number} Eased rotation parameter 0..1.
 */
function windowT( rot, t ) {
	const [ a, b ] = rot.w || [ 0, 1 ];
	const u = Math.min( 1, Math.max( 0, ( t - a ) / ( b - a || 1 ) ) );
	return easeInOut( u );
}

/**
 * Which way round the hinge turns: authors say WHERE the flap goes
 * (`dir` +1 in front, -1 behind), not which sign the angle needs after
 * an unknown number of mirrorings. A whisker of rotation applied to the
 * flap's centroid tells us which sign lifts it the wanted way. Authored
 * negative angles (unfolds) and `exact: true` pass through untouched.
 *
 * @param {Object} figure     The figure.
 * @param {Object} rot        Rotation entry.
 * @param {Array}  transforms Current transforms (the rotation's rest state).
 * @param {Array}  a          Axis point.
 * @param {Array}  axis       Axis direction.
 * @return {number} +1 or -1.
 */
function spinSign( figure, rot, transforms, a, axis ) {
	if ( rot.exact ) {
		return 1;
	}
	let cx = 0;
	let cy = 0;
	let cz = 0;
	let count = 0;
	for ( const f of rot.faces ) {
		for ( const pt of figure.faces[ f ] ) {
			const p = mapPoint( transforms, f, pt );
			cx += p[ 0 ];
			cy += p[ 1 ];
			cz += p[ 2 ];
			count++;
		}
	}
	const c = [ cx / count, cy / count, cz / count ];
	const probe = rotationAbout( a, axis, 1e-4 );
	const dy = tApply( probe, c )[ 1 ] - c[ 1 ];
	return dy * ( rot.dir || 1 ) >= 0 ? 1 : -1;
}

/** A flat pi fold - the only kind that flips a piece over. */
const flatPi = ( rot ) =>
	! rot.posed &&
	! rot.exact &&
	Math.abs( Math.abs( rot.angle ) - Math.PI ) < 1e-9;

/**
 * How wide a moving packet fans open while it turns: the layer that
 * lands nearest the pile leads, the outer ones trail behind like the
 * pages of a closing book, and everything meets exactly at the end.
 * Real paper does this because the layers slide on each other; here it
 * also keeps the layers of a turning packet visibly apart instead of
 * coplanar.
 */
const FAN = 0.1;

/**
 * Per-face lag ranks for a rotation, 0 (leads) to 1 (trails), or null
 * when the rotation should stay rigid (single face, posed, turn-over).
 *
 * @param {Object} figure The figure.
 * @param {number} s      Step index.
 * @param {Object} rot    Rotation entry.
 * @return {Map|null} face -> rank.
 */
function fanRanks( figure, s, rot ) {
	if (
		! figure.heightsTable ||
		rot.faces.length < 2 ||
		rot.faces.length === figure.faces.length ||
		! flatPi( rot )
	) {
		return null;
	}
	const hPost = figure.heightsTable[ s + 1 ];
	const hs = rot.faces.map( ( f ) => hPost[ f ] );
	const dir = rot.dir || 1;
	const near = dir > 0 ? Math.min( ...hs ) : Math.max( ...hs );
	const span = Math.max( ...hs.map( ( h ) => Math.abs( h - near ) ) );
	if ( span < 1e-9 ) {
		return null;
	}
	const ranks = new Map();
	rot.faces.forEach( ( f, i ) =>
		ranks.set( f, Math.abs( hs[ i ] - near ) / span )
	);
	return ranks;
}

/**
 * Fold a figure to a point in its sequence.
 *
 * @param {Object} figure   The figure (faces + steps).
 * @param {number} progress 0..steps.length; the integer part is completed
 *                          steps, the fraction animates the next one.
 * @return {Object} { transforms, step, t } - one transform per face.
 */
export function foldState( figure, progress ) {
	const n = figure.faces.length;
	const transforms = new Array( n ).fill( IDENT );
	const total = figure.steps.length;
	const p = Math.min( Math.max( progress, 0 ), total );
	const done = Math.floor( p );
	const t = p - done;

	for ( let s = 0; s < done + ( t > 0 ? 1 : 0 ); s++ ) {
		const step = figure.steps[ s ];
		const stepT = s < done ? 1 : t;
		for ( const rot of step.rotations || [] ) {
			const u = windowT( rot, stepT );
			if ( 0 === u ) {
				continue;
			}
			const anchor =
				undefined === rot.anchor ? rot.faces[ 0 ] : rot.anchor;
			const base = transforms[ anchor ];
			const a = tApply( base, paperTo3d( rot.line[ 0 ] ) );
			const b = tApply( base, paperTo3d( rot.line[ 1 ] ) );
			const axis = [ b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ], b[ 2 ] - a[ 2 ] ];
			const sign = spinSign( figure, rot, transforms, a, axis );
			const size = rot.exact ? rot.angle : Math.abs( rot.angle );
			const ranks = u < 1 ? fanRanks( figure, s, rot ) : null;
			if ( ranks ) {
				const fan = Math.sin( Math.PI * u );
				for ( const f of rot.faces ) {
					const uf = u - FAN * ranks.get( f ) * fan;
					const spin = rotationAbout( a, axis, sign * size * uf );
					transforms[ f ] = tCompose( spin, transforms[ f ] );
				}
			} else {
				const spin = rotationAbout( a, axis, sign * size * u );
				for ( const f of rot.faces ) {
					transforms[ f ] = tCompose( spin, transforms[ f ] );
				}
			}
		}
	}
	return { transforms, step: done, t };
}

/**
 * Which way up each piece lies in every FLAT rest state: +1 front up,
 * -1 front down. Only flat pi folds flip a piece; posed rotations
 * (standing walls, fanned wings) carry the last flat orientation with
 * them - which is exactly what a layer offset along the rotated normal
 * needs, where reading the normal itself would be degenerate.
 *
 * @param {Object} figure The figure.
 * @return {Array} orient[step][face] - step 0 is the flat sheet.
 */
export function foldOrientations( figure ) {
	const n = figure.faces.length;
	const out = [ new Array( n ).fill( 1 ) ];
	let o = new Array( n ).fill( 1 );
	for ( const step of figure.steps ) {
		o = o.slice();
		for ( const rot of step.rotations || [] ) {
			if ( flatPi( rot ) ) {
				for ( const f of rot.faces ) {
					o[ f ] = -o[ f ];
				}
			}
		}
		out.push( o );
	}
	return out;
}

/**
 * Map a paper point of one face through a fold state.
 *
 * @param {Array}  transforms Transforms from foldState().
 * @param {number} face       Face index.
 * @param {Array}  pt         Paper [x, y].
 * @return {Array} 3D point.
 */
export function mapPoint( transforms, face, pt ) {
	return tApply( transforms[ face ], paperTo3d( pt ) );
}

/** The transformed face normal (starts as +Y). */
export function faceNormal( tr ) {
	return tRotate( tr, [ 0, 1, 0 ] );
}

/* ----------------------------- layer stacking ----------------------------- */

const faceBounds = ( figure, transforms, f ) => {
	let minX = Infinity;
	let maxX = -Infinity;
	let minZ = Infinity;
	let maxZ = -Infinity;
	for ( const pt of figure.faces[ f ] ) {
		const p = mapPoint( transforms, f, pt );
		minX = Math.min( minX, p[ 0 ] );
		maxX = Math.max( maxX, p[ 0 ] );
		minZ = Math.min( minZ, p[ 2 ] );
		maxZ = Math.max( maxZ, p[ 2 ] );
	}
	return { minX, maxX, minZ, maxZ };
};

const boundsTouch = ( a, b ) =>
	a.minX < b.maxX - 1e-6 &&
	b.minX < a.maxX - 1e-6 &&
	a.minZ < b.maxZ - 1e-6 &&
	b.minZ < a.maxZ - 1e-6;

/**
 * Layer heights after every step: which face lies how far up the stack.
 *
 * A folded-over set lands just beyond the faces it now covers, with its
 * own internal order reversed - the physics of flipping a stack of
 * paper, done with bounding boxes because it only has to be right, not
 * beautiful. Steps may override single faces via `heights`.
 *
 * @param {Object} figure The figure.
 * @return {Array} heights[step][face] - step 0 is the flat sheet.
 */
export function stackHeights( figure ) {
	if ( figure.heightsTable ) {
		return figure.heightsTable;
	}
	const n = figure.faces.length;
	const out = [ new Array( n ).fill( 0 ) ];
	let h = new Array( n ).fill( 0 );

	for ( let s = 0; s < figure.steps.length; s++ ) {
		const step = figure.steps[ s ];
		h = h.slice();
		const state = foldState( figure, s + 1 );
		for ( const rot of step.rotations || [] ) {
			const moved = new Set( rot.faces );
			if ( moved.size === n ) {
				// Turning the whole model over flips the stack.
				for ( let f = 0; f < n; f++ ) {
					h[ f ] = -h[ f ] || 0;
				}
				continue;
			}
			if ( ! rot.angle || Math.abs( rot.angle ) < 0.5 ) {
				continue; // Shaping, not layering.
			}
			const dir = rot.dir || 1;
			const movedList = [ ...moved ];
			const boxes = movedList.map( ( f ) =>
				faceBounds( figure, state.transforms, f )
			);
			let extreme = 0;
			for ( let f = 0; f < n; f++ ) {
				if ( moved.has( f ) ) {
					continue;
				}
				const fb = faceBounds( figure, state.transforms, f );
				if ( boxes.some( ( b ) => boundsTouch( b, fb ) ) ) {
					extreme =
						dir > 0
							? Math.max( extreme, h[ f ] )
							: Math.min( extreme, h[ f ] );
				}
			}
			const hs = movedList.map( ( f ) => h[ f ] );
			const top = Math.max( ...hs );
			for ( let i = 0; i < movedList.length; i++ ) {
				h[ movedList[ i ] ] = extreme + dir * ( 1 + ( top - hs[ i ] ) );
			}
		}
		for ( const [ f, v ] of Object.entries( step.heights || {} ) ) {
			h[ Number( f ) ] = v;
		}
		out.push( h );
	}
	return out;
}

/* ------------------------------- validation ------------------------------- */

const polyArea = ( pts ) => {
	let a = 0;
	for ( let i = 0; i < pts.length; i++ ) {
		const p = pts[ i ];
		const q = pts[ ( i + 1 ) % pts.length ];
		a += p[ 0 ] * q[ 1 ] - q[ 0 ] * p[ 1 ];
	}
	return a / 2;
};

/**
 * Sanity-check a figure. Returns a list of complaints; empty is good.
 *
 * @param {Object} figure The figure.
 * @return {string[]} Complaints.
 */
export function validateFigure( figure ) {
	const bad = [];
	let area = 0;
	figure.faces.forEach( ( pts, i ) => {
		const a = polyArea( pts );
		if ( a <= 1e-9 ) {
			bad.push( `face ${ i }: not counter-clockwise (area ${ a })` );
		}
		area += Math.abs( a );
		for ( const [ x, y ] of pts ) {
			if ( x < -1e-9 || x > 1 + 1e-9 || y < -1e-9 || y > 1 + 1e-9 ) {
				bad.push( `face ${ i }: point ${ x },${ y } off the sheet` );
			}
		}
	} );
	if ( Math.abs( area - 1 ) > 1e-6 ) {
		bad.push( `faces cover ${ area } of the unit square` );
	}
	figure.steps.forEach( ( step, s ) => {
		for ( const rot of step.rotations || [] ) {
			if ( ! rot.faces || ! rot.faces.length ) {
				bad.push( `step ${ s }: rotation without faces` );
				continue;
			}
			for ( const f of rot.faces ) {
				if ( f < 0 || f >= figure.faces.length ) {
					bad.push( `step ${ s }: unknown face ${ f }` );
				}
			}
			const [ a, b ] = rot.line;
			if ( Math.hypot( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ] ) < 1e-9 ) {
				bad.push( `step ${ s }: degenerate crease line` );
			}
		}
	} );
	return bad;
}

/**
 * Edge lengths survive any fold state - paper does not stretch.
 * Returns the largest relative error across all face edges.
 *
 * @param {Object} figure   The figure.
 * @param {number} progress Fold progress.
 * @return {number} Largest relative edge-length error.
 */
export function isometryError( figure, progress ) {
	const { transforms } = foldState( figure, progress );
	let worst = 0;
	figure.faces.forEach( ( pts, f ) => {
		for ( let i = 0; i < pts.length; i++ ) {
			const p = pts[ i ];
			const q = pts[ ( i + 1 ) % pts.length ];
			const flat = Math.hypot( q[ 0 ] - p[ 0 ], q[ 1 ] - p[ 1 ] );
			const a = mapPoint( transforms, f, p );
			const b = mapPoint( transforms, f, q );
			const bent = Math.hypot(
				b[ 0 ] - a[ 0 ],
				b[ 1 ] - a[ 1 ],
				b[ 2 ] - a[ 2 ]
			);
			worst = Math.max( worst, Math.abs( bent - flat ) / flat );
		}
	} );
	return worst;
}

/**
 * How far the completed state `k` strays from a single flat plane -
 * flat-folded steps should come back to (nearly) zero thickness.
 *
 * @param {Object} figure The figure.
 * @param {number} k      Completed step count.
 * @return {number} Largest |y| across all corners.
 */
export function flatnessAt( figure, k ) {
	const { transforms } = foldState( figure, k );
	let worst = 0;
	figure.faces.forEach( ( pts, f ) => {
		for ( const pt of pts ) {
			worst = Math.max(
				worst,
				Math.abs( mapPoint( transforms, f, pt )[ 1 ] )
			);
		}
	} );
	return worst;
}

/** Bounding box of the folded model (for camera fitting). */
export function foldBounds( figure, transforms ) {
	const lo = [ Infinity, Infinity, Infinity ];
	const hi = [ -Infinity, -Infinity, -Infinity ];
	figure.faces.forEach( ( pts, f ) => {
		for ( const pt of pts ) {
			const p = mapPoint( transforms, f, pt );
			for ( let i = 0; i < 3; i++ ) {
				lo[ i ] = Math.min( lo[ i ], p[ i ] );
				hi[ i ] = Math.max( hi[ i ], p[ i ] );
			}
		}
	} );
	return { lo, hi };
}
