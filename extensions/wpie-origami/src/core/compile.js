/**
 * The figure compiler: fold instructions in, hinge data out.
 *
 * A figure is written the way origami instructions are written - "fold
 * along this line, this side moves, it lands in front" - each crease
 * given ONCE, in the coordinates of the sheet as it lies folded in
 * front of you. The compiler carries every fold down through the
 * layers: it clips each layer piece against the crease, mirrors the
 * moving parts, keeps the exact layer stacking, and remembers for each
 * final piece which folds moved it and where each crease runs in its
 * own paper coordinates. Out comes exactly what fold.js eats: faces
 * tiling the square, steps with rotation sets, and an exact heights
 * table - the mirrored under-layer creases and corner slivers that are
 * misery to derive by hand simply fall out of the clipping.
 *
 * Flat folds only, until the end: folds with an angle other than pi
 * (walls of a box, wings bent down) mark their step `shaped` and must
 * come last - after the paper leaves the table there is no flat layout
 * left to clip against.
 */

const EPS = 1e-7;

/* --------------------------- 2D affine helpers ---------------------------- */

const AID = { xx: 1, xy: 0, yx: 0, yy: 1, tx: 0, ty: 0 };

const aApply = ( m, p ) => [
	m.xx * p[ 0 ] + m.xy * p[ 1 ] + m.tx,
	m.yx * p[ 0 ] + m.yy * p[ 1 ] + m.ty,
];

const aCompose = ( a, b ) => ( {
	xx: a.xx * b.xx + a.xy * b.yx,
	xy: a.xx * b.xy + a.xy * b.yy,
	yx: a.yx * b.xx + a.yy * b.yx,
	yy: a.yx * b.xy + a.yy * b.yy,
	tx: a.xx * b.tx + a.xy * b.ty + a.tx,
	ty: a.yx * b.tx + a.yy * b.ty + a.ty,
} );

const aDet = ( m ) => m.xx * m.yy - m.xy * m.yx;

/** Inverse of an orthogonal (+-reflection) affine. */
const aInvert = ( m ) => {
	const d = aDet( m );
	const inv = {
		xx: m.yy / d,
		xy: -m.xy / d,
		yx: -m.yx / d,
		yy: m.xx / d,
	};
	inv.tx = -( inv.xx * m.tx + inv.xy * m.ty );
	inv.ty = -( inv.yx * m.tx + inv.yy * m.ty );
	return inv;
};

/** Reflection across the line a-b as an affine. */
function reflection( a, b ) {
	const dx = b[ 0 ] - a[ 0 ];
	const dy = b[ 1 ] - a[ 1 ];
	const L = dx * dx + dy * dy;
	const xx = ( dx * dx - dy * dy ) / L;
	const xy = ( 2 * dx * dy ) / L;
	return {
		xx,
		xy,
		yx: xy,
		yy: -xx,
		tx: a[ 0 ] - xx * a[ 0 ] - xy * a[ 1 ],
		ty: a[ 1 ] - xy * a[ 0 ] + xx * a[ 1 ],
	};
}

/* ------------------------------ polygon bits ------------------------------ */

const polyArea = ( pts ) => {
	let s = 0;
	for ( let i = 0; i < pts.length; i++ ) {
		const p = pts[ i ];
		const q = pts[ ( i + 1 ) % pts.length ];
		s += p[ 0 ] * q[ 1 ] - q[ 0 ] * p[ 1 ];
	}
	return s / 2;
};

const centroid = ( pts ) => {
	let x = 0;
	let y = 0;
	for ( const p of pts ) {
		x += p[ 0 ];
		y += p[ 1 ];
	}
	return [ x / pts.length, y / pts.length ];
};

/**
 * Clip a convex polygon against the half plane `side * cross(b-a, p-a) >= 0`.
 */
function clipHalf( pts, a, b, side ) {
	const dx = b[ 0 ] - a[ 0 ];
	const dy = b[ 1 ] - a[ 1 ];
	const d = ( p ) =>
		side * ( dx * ( p[ 1 ] - a[ 1 ] ) - dy * ( p[ 0 ] - a[ 0 ] ) );
	const out = [];
	for ( let i = 0; i < pts.length; i++ ) {
		const p = pts[ i ];
		const q = pts[ ( i + 1 ) % pts.length ];
		const dp = d( p );
		const dq = d( q );
		if ( dp >= -EPS ) {
			out.push( p );
		}
		if ( ( dp > EPS && dq < -EPS ) || ( dp < -EPS && dq > EPS ) ) {
			const t = dp / ( dp - dq );
			out.push( [
				p[ 0 ] + t * ( q[ 0 ] - p[ 0 ] ),
				p[ 1 ] + t * ( q[ 1 ] - p[ 1 ] ),
			] );
		}
	}
	return out;
}

const bboxOf = ( pts ) => {
	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;
	for ( const [ x, y ] of pts ) {
		minX = Math.min( minX, x );
		maxX = Math.max( maxX, x );
		minY = Math.min( minY, y );
		maxY = Math.max( maxY, y );
	}
	return { minX, maxX, minY, maxY };
};

const boxesTouch = ( a, b ) =>
	a.minX < b.maxX - 1e-6 &&
	b.minX < a.maxX - 1e-6 &&
	a.minY < b.maxY - 1e-6 &&
	b.minY < a.maxY - 1e-6;

/* ------------------------------ the compiler ------------------------------ */

/**
 * Compile a fold recipe into a figure for fold.js.
 *
 * @param {Object} recipe { id, label, view, difficulty, steps, probes }.
 *   Each step: { text, folds: [ { line, side, dir, layers, angle, w,
 *   turnOver } ] } with `line` in folded-sheet coordinates, `side` +1
 *   moving the left of line[0]->line[1] and -1 the right, `dir` +1
 *   landing in front and -1 behind, `layers` 'all' | 'top' | 'bottom',
 *   `angle` in radians (default pi; anything else marks the step
 *   shaped), `turnOver` true for turning the whole model over.
 * @return {Object} A figure: { faces, steps, heightsTable, visible, ... }.
 */
export function compileFigure( recipe ) {
	let pieces = [
		{
			paper: [
				[ 0, 0 ],
				[ 1, 0 ],
				[ 1, 1 ],
				[ 0, 1 ],
			],
			m: AID,
			h: 0,
			moved: new Map(),
			hist: [],
		},
	];
	let shaped = false;
	let foldIdx = 0;
	const stepMeta = [];

	for ( const step of recipe.steps ) {
		const rots = [];
		const folds = step.folds || [];
		for ( let fi = 0; fi < folds.length; fi++ ) {
			const fold = folds[ fi ];
			// A pi turn is a flat fold only while it happens IN the
			// plane - an exact-angle or `shaped: true` pi (wrapping
			// over the rim of a standing wall) is a posed rotation.
			const flat =
				! fold.exact &&
				! fold.shaped &&
				( ! fold.angle ||
					Math.abs( Math.abs( fold.angle ) - Math.PI ) < 1e-9 );
			if ( ! flat ) {
				shaped = true;
			} else if ( shaped ) {
				throw new Error(
					`${ recipe.id }: flat fold after a shaped one`
				);
			}
			const [ A, B ] = fold.line;

			if ( fold.turnOver ) {
				for ( const p of pieces ) {
					p.m = aCompose( reflection( A, B ), p.m );
					p.h = -p.h || 0;
					p.moved.set( foldIdx, {
						line: fold.line,
						fold,
					} );
				}
				rots.push( { foldIdx, fold, movers: pieces.slice() } );
				foldIdx++;
				continue;
			}

			// A crease is a SEGMENT, not a line: material sideways past
			// its ends is not behind the hinge and stays where it is
			// (think of the little corner folds on a heart - their
			// lines, extended, would cut the whole model).
			const segX = B[ 0 ] - A[ 0 ];
			const segY = B[ 1 ] - A[ 1 ];
			const segLen = Math.hypot( segX, segY );
			const inSpan = ( folded ) => {
				let min = Infinity;
				let max = -Infinity;
				for ( const p of folded ) {
					const t =
						( ( p[ 0 ] - A[ 0 ] ) * segX +
							( p[ 1 ] - A[ 1 ] ) * segY ) /
						segLen;
					min = Math.min( min, t );
					max = Math.max( max, t );
				}
				// Positive overlap required: a neighbouring flap that
				// merely TOUCHES a crease end must not ride along.
				return max > 1e-3 && min < segLen - 1e-3;
			};
			// A piece the crease does not cross may only move if it
			// actually HINGES on the crease - one of its edges lies on
			// the line. A flap that merely lies across the region
			// (the other blintz corners meeting at the middle) stays.
			const hinges = ( folded ) => {
				const off = ( p ) =>
					( segX * ( p[ 1 ] - A[ 1 ] ) -
						segY * ( p[ 0 ] - A[ 0 ] ) ) /
					segLen;
				for ( let i = 0; i < folded.length; i++ ) {
					const p = folded[ i ];
					const q = folded[ ( i + 1 ) % folded.length ];
					if (
						Math.abs( off( p ) ) < 1e-6 &&
						Math.abs( off( q ) ) < 1e-6 &&
						inSpan( [ p, q ] )
					) {
						return true;
					}
				}
				return false;
			};

			// Split every piece the crease crosses.
			const next = [];
			const candidates = [];
			for ( const piece of pieces ) {
				const folded = piece.paper.map( ( p ) => aApply( piece.m, p ) );
				if ( ! inSpan( folded ) ) {
					next.push( piece );
					continue;
				}
				const movePart = clipHalf( folded, A, B, fold.side );
				const stayPart = clipHalf( folded, A, B, -fold.side );
				const moveArea = Math.abs( polyArea( movePart ) );
				const stayArea = Math.abs( polyArea( stayPart ) );
				if ( moveArea < EPS ) {
					next.push( piece );
					continue;
				}
				if ( stayArea < EPS ) {
					next.push( piece );
					if (
						hinges( folded ) ||
						'function' === typeof fold.layers
					) {
						candidates.push( piece );
					}
					continue;
				}
				// Real split: clip the paper polygon by the crease
				// pre-image; a reflection in m flips which side is which.
				const inv = aInvert( piece.m );
				const pa = aApply( inv, A );
				const pb = aApply( inv, B );
				const paperSide = fold.side * Math.sign( aDet( piece.m ) );
				const mover = {
					paper: clipHalf( piece.paper, pa, pb, paperSide ),
					m: piece.m,
					h: piece.h,
					moved: new Map( piece.moved ),
					hist: piece.hist.slice(),
				};
				const stayer = {
					paper: clipHalf( piece.paper, pa, pb, -paperSide ),
					m: piece.m,
					h: piece.h,
					moved: new Map( piece.moved ),
					hist: piece.hist.slice(),
				};
				next.push( stayer );
				next.push( mover );
				candidates.push( mover );
			}
			pieces = next;

			// Layer filter.
			let movers = candidates;
			if ( 'top' === fold.layers || 'bottom' === fold.layers ) {
				const pick =
					'top' === fold.layers
						? Math.max( ...candidates.map( ( p ) => p.h ) )
						: Math.min( ...candidates.map( ( p ) => p.h ) );
				movers = candidates.filter( ( p ) => p.h === pick );
			} else if ( 'function' === typeof fold.layers ) {
				movers = candidates.filter( fold.layers );
			}
			if ( ! movers.length ) {
				throw new Error(
					`${ recipe.id }: fold ${ foldIdx } moves nothing`
				);
			}

			// Move: mirror in the layout, remember the paper crease.
			const refl = reflection( A, B );
			for ( const p of movers ) {
				const inv = aInvert( p.m );
				p.moved.set( foldIdx, {
					line: [ aApply( inv, A ), aApply( inv, B ) ],
					fold,
				} );
				if ( flat ) {
					p.m = aCompose( refl, p.m );
				}
			}

			// Stacking, exactly like flipping a real packet.
			if ( flat ) {
				const dir = fold.dir || 1;
				const moverSet = new Set( movers );
				const boxes = movers.map( ( p ) =>
					bboxOf( p.paper.map( ( q ) => aApply( p.m, q ) ) )
				);
				let extreme = 0;
				for ( const p of pieces ) {
					if ( moverSet.has( p ) ) {
						continue;
					}
					const box = bboxOf(
						p.paper.map( ( q ) => aApply( p.m, q ) )
					);
					if ( boxes.some( ( b ) => boxesTouch( b, box ) ) ) {
						extreme =
							dir > 0
								? Math.max( extreme, p.h )
								: Math.min( extreme, p.h );
					}
				}
				const top = Math.max( ...movers.map( ( p ) => p.h ) );
				for ( const p of movers ) {
					p.h =
						undefined !== fold.setH
							? fold.setH
							: extreme + dir * ( 1 + top - p.h );
				}
			}

			rots.push( { foldIdx, fold, movers } );
			foldIdx++;
		}
		// Snapshot heights at the end of the step.
		for ( const p of pieces ) {
			p.hist.push( p.h );
		}
		stepMeta.push( { step, rots } );
	}

	/* ------------------------------- emit -------------------------------- */

	const faces = pieces.map( ( p ) => p.paper );
	const index = new Map( pieces.map( ( p, i ) => [ p, i ] ) );

	// The rotation axis is the crease mapped through the ANCHOR's
	// transform - so the anchor must be a piece that actually HINGES on
	// the crease (has an edge on it). A piece that merely rides along
	// from elsewhere maps the axis to where the crease used to be, and
	// the fold turns about thin air (the masu wrap found this).
	const hingesOnOwnLine = ( p, line ) => {
		const [ A, B ] = line;
		const dx = B[ 0 ] - A[ 0 ];
		const dy = B[ 1 ] - A[ 1 ];
		const len = Math.hypot( dx, dy ) || 1;
		const off = ( pt ) =>
			Math.abs(
				( dx * ( pt[ 1 ] - A[ 1 ] ) - dy * ( pt[ 0 ] - A[ 0 ] ) ) / len
			);
		for ( let i = 0; i < p.paper.length; i++ ) {
			const a = p.paper[ i ];
			const b = p.paper[ ( i + 1 ) % p.paper.length ];
			if ( off( a ) < 1e-6 && off( b ) < 1e-6 ) {
				return true;
			}
		}
		return false;
	};

	const steps = stepMeta.map( ( { step, rots } ) => {
		const k = rots.length;
		const spread = k > 1 ? 0.45 / ( k - 1 ) : 0;
		const rotations = rots.map( ( { foldIdx: fi, fold }, j ) => {
			const members = pieces.filter( ( p ) => p.moved.has( fi ) );
			const anchor =
				members.find( ( p ) =>
					hingesOnOwnLine( p, p.moved.get( fi ).line )
				) || members[ 0 ];
			return {
				faces: members.map( ( p ) => index.get( p ) ),
				anchor: index.get( anchor ),
				line: anchor.moved.get( fi ).line,
				angle: fold.angle || Math.PI,
				dir: fold.dir || 1,
				w:
					fold.w ||
					( k > 1 ? [ j * spread, j * spread + 0.55 ] : undefined ),
				exact: fold.exact || undefined,
				posed: fold.exact || fold.shaped || undefined,
			};
		} );
		return {
			text: step.text,
			rotations,
			shaped:
				rotations.some(
					( r ) =>
						r.posed ||
						Math.abs( Math.abs( r.angle ) - Math.PI ) > 1e-9
				) ||
				step.shaped ||
				undefined,
		};
	} );

	const heightsTable = [
		pieces.map( () => 0 ),
		...recipe.steps.map( ( _, s ) => pieces.map( ( p ) => p.hist[ s ] ) ),
	];

	// What ends up visible: for each piece, is its folded centroid
	// covered by a higher piece? Which side of the paper shows?
	const finals = pieces.map( ( p ) => ( {
		poly: p.paper.map( ( q ) => aApply( p.m, q ) ),
		h: p.h,
		up: aDet( p.m ) > 0,
	} ) );
	const inPoly = ( pt, pts ) => {
		let hit = false;
		for ( let i = 0, j = pts.length - 1; i < pts.length; j = i++ ) {
			const [ xi, yi ] = pts[ i ];
			const [ xj, yj ] = pts[ j ];
			if (
				yi > pt[ 1 ] !== yj > pt[ 1 ] &&
				pt[ 0 ] < ( ( xj - xi ) * ( pt[ 1 ] - yi ) ) / ( yj - yi ) + xi
			) {
				hit = ! hit;
			}
		}
		return hit;
	};
	const visible = pieces.map( ( p, i ) => {
		const c = centroid( finals[ i ].poly );
		const covered = finals.some(
			( o, j ) => j !== i && o.h > finals[ i ].h && inPoly( c, o.poly )
		);
		return covered ? null : { side: finals[ i ].up ? 'front' : 'back' };
	} );

	const regions = ( recipe.probes || [] ).map( ( probe ) => {
		const at = pieces
			.map( ( p, i ) => ( { p, i } ) )
			.filter( ( { i } ) => inPoly( probe.at, finals[ i ].poly ) )
			.sort( ( x, y ) => finals[ y.i ].h - finals[ x.i ].h );
		if ( ! at.length ) {
			throw new Error(
				`${ recipe.id }: probe ${ probe.label } hits nothing`
			);
		}
		const top = at[ 0 ];
		return {
			label: probe.label,
			side: finals[ top.i ].up ? 'front' : 'back',
			polys: [ top.p.paper ],
		};
	} );

	return {
		id: recipe.id,
		label: recipe.label,
		difficulty: recipe.difficulty || 1,
		view: recipe.view || { yaw: 0, pitch: 60, zoom: 1 },
		faces,
		steps,
		heightsTable,
		visible,
		regions,
	};
}
