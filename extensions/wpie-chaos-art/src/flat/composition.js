/**
 * Composition on a flat picture: the plan a piece is born with.
 *
 * A picture that hangs on a wall has a relation to its own edges: a
 * mass sits off center or presses against a side, a horizon divides,
 * a diagonal thrusts, a void answers a cluster. The plan holds that
 * relation as PROPOSALS - masses with roles, a focal spot, a direction,
 * a value key, a coverage the piece wants to reach. Painters read it
 * with their own temperament and the picture drifts from it; the
 * restless one may tear it up mid-piece. Nothing here draws.
 *
 * Frame units: x in [0, aspect], y in [0, 1].
 */

export const ARCHETYPES = [
	'field', // all-over, no single focus
	'mass', // one dominant mass, a counterweight, room to breathe
	'horizon', // a division across the picture, two worlds
	'diagonal', // a thrust from corner to corner
	'cluster', // a crowd in one region, a void in the other
	'grid', // a lattice with breaks
	'stack', // bands stacked on each other
	'vortex', // everything turning around an off-center pole
	'cascade', // weight at the top, falling
	'frame', // an inner stage inside a border
	'duet', // two masses in conversation
	'single', // one thing, and emptiness
];

const GOLD = 0.382;

/** A golden or thirds anchor on one axis, jittered. */
function anchor( rng, extent ) {
	const g = rng() < 0.5 ? GOLD : 1 - GOLD;
	return ( g + ( rng() - 0.5 ) * 0.12 ) * extent;
}

/**
 * Recursive partition of the frame into rectangles (De Stijl, grids).
 * Splits at golden-ish ratios; depth grows with rng.
 */
export function partition( rng, aspect, depth = 3 ) {
	const rects = [];
	const lines = [];
	const split = ( x, y, w, h, d ) => {
		const stop = d <= 0 || ( d < depth && rng() < 0.28 );
		if ( stop || ( w < 0.12 && h < 0.12 ) ) {
			rects.push( { x, y, w, h } );
			return;
		}
		const ratios = [ GOLD, 0.5, 1 - GOLD, 0.25, 0.75 ];
		const r = ratios[ Math.floor( rng() * ratios.length ) % ratios.length ];
		const vertical = w > h ? rng() < 0.7 : rng() < 0.3;
		if ( vertical ) {
			const cut = x + w * r;
			lines.push( { axis: 'v', at: cut, from: y, to: y + h } );
			split( x, y, w * r, h, d - 1 );
			split( cut, y, w * ( 1 - r ), h, d - 1 );
		} else {
			const cut = y + h * r;
			lines.push( { axis: 'h', at: cut, from: x, to: x + w } );
			split( x, y, w, h * r, d - 1 );
			split( x, cut, w, h * ( 1 - r ), d - 1 );
		}
	};
	split( 0, 0, aspect, 1, depth );
	return { rects, lines };
}

/**
 * Draw a plan.
 *
 * @param {Function} rng    Random source.
 * @param {number}   aspect Frame aspect (w/h).
 * @param {Object}   [pref] School preferences: { archetypes: {id: weight},
 *                          coverage: [lo, hi], valueKeys: [...] }.
 * @return {Object} The plan.
 */
export function drawPlan( rng, aspect, pref = {} ) {
	// A school that names its archetypes gets ONLY those; one that names
	// none gets all of them evenly.
	const weights = pref.archetypes || null;
	const pool = ARCHETYPES.map( ( id ) => [
		id,
		weights ? weights[ id ] || 0 : 1,
	] ).filter( ( a ) => a[ 1 ] > 0 );
	// A signature may bring ONE archetype from outside the school's list.
	if ( pref.extra && ! pool.some( ( a ) => a[ 0 ] === pref.extra ) ) {
		const mean =
			pool.reduce( ( a, b ) => a + b[ 1 ], 0 ) / ( pool.length || 1 );
		pool.push( [ pref.extra, mean || 1 ] );
	}
	// The last pieces of this school: not the same anlage again while
	// there is a choice.
	const avoid = pref.avoid || [];
	const fresh = pool.filter( ( a ) => ! avoid.includes( a[ 0 ] ) );
	const use = fresh.length ? fresh : pool;
	const sum = use.reduce( ( a, b ) => a + b[ 1 ], 0 ) || 1;
	let pick = rng() * sum;
	let archetype = use[ use.length - 1 ][ 0 ];
	for ( const [ id, w ] of use ) {
		pick -= w;
		if ( pick <= 0 ) {
			archetype = id;
			break;
		}
	}
	const keys = pref.valueKeys || [ 'high', 'mid', 'low' ];
	const valueKey = keys[ Math.floor( rng() * keys.length ) % keys.length ];
	const plan = {
		archetype,
		aspect,
		valueKey,
		masses: [],
		focal: { x: anchor( rng, aspect ), y: anchor( rng, 1 ) },
		direction: ( rng() - 0.5 ) * Math.PI * 0.5,
		margin: 0.03 + rng() * 0.08,
		bleed: rng() < 0.5,
		coverage: 0.6,
		lines: [],
		bands: [],
		cells: [],
		pole: null,
		horizon: null,
	};
	const cov = ( lo, hi ) => {
		const c = pref.coverage || [ 0, 1 ];
		const v = lo + rng() * ( hi - lo );
		return Math.max( c[ 0 ], Math.min( c[ 1 ], v ) );
	};
	const mass = ( o ) =>
		plan.masses.push( {
			angle: ( rng() - 0.5 ) * 0.9,
			shape: rng() < 0.6 ? 'soft' : 'hard',
			value: rng(),
			...o,
		} );

	switch ( archetype ) {
		case 'field': {
			plan.coverage = cov( 0.82, 1 );
			// A gentle density gradient across the field, in some direction.
			plan.direction = rng() * Math.PI * 2;
			const n = 3 + Math.floor( rng() * 4 );
			for ( let i = 0; i < n; i++ ) {
				mass( {
					cx: rng() * aspect,
					cy: rng(),
					rx: 0.15 + rng() * 0.25,
					ry: 0.12 + rng() * 0.22,
					role: i ? 'secondary' : 'dominant',
				} );
			}
			break;
		}
		case 'mass': {
			plan.coverage = cov( 0.32, 0.62 );
			const cx = plan.focal.x;
			const cy = plan.focal.y;
			mass( {
				cx,
				cy,
				rx: 0.2 + rng() * 0.2,
				ry: 0.18 + rng() * 0.2,
				role: 'dominant',
			} );
			// The counterweight sits across the center, smaller and lighter.
			mass( {
				cx: aspect - cx + ( rng() - 0.5 ) * 0.2,
				cy: 1 - cy + ( rng() - 0.5 ) * 0.2,
				rx: 0.06 + rng() * 0.09,
				ry: 0.05 + rng() * 0.08,
				role: 'counter',
			} );
			if ( rng() < 0.5 ) {
				mass( {
					cx: cx + ( rng() - 0.5 ) * 0.5,
					cy: cy + ( rng() - 0.5 ) * 0.5,
					rx: 0.08 + rng() * 0.1,
					ry: 0.07 + rng() * 0.1,
					role: 'secondary',
				} );
			}
			break;
		}
		case 'horizon': {
			plan.coverage = cov( 0.75, 1 );
			const hy = anchor( rng, 1 );
			plan.horizon = { y: hy, tilt: ( rng() - 0.5 ) * 0.08 };
			plan.direction = plan.horizon.tilt;
			mass( {
				cx: aspect / 2,
				cy: hy / 2,
				rx: aspect * 0.6,
				ry: hy / 2,
				role: 'secondary',
				shape: 'band',
				value: valueKey === 'low' ? 0.3 : 0.8,
			} );
			mass( {
				cx: aspect / 2,
				cy: hy + ( 1 - hy ) / 2,
				rx: aspect * 0.6,
				ry: ( 1 - hy ) / 2,
				role: 'dominant',
				shape: 'band',
				value: valueKey === 'low' ? 0.15 : 0.45,
			} );
			// A sun, a boat, a tree: one small thing near the line.
			if ( rng() < 0.7 ) {
				plan.focal = {
					x: anchor( rng, aspect ),
					y: hy + ( rng() - 0.5 ) * 0.16,
				};
				mass( {
					cx: plan.focal.x,
					cy: plan.focal.y,
					rx: 0.05 + rng() * 0.08,
					ry: 0.05 + rng() * 0.08,
					role: 'accent',
				} );
			}
			break;
		}
		case 'diagonal': {
			plan.coverage = cov( 0.4, 0.72 );
			const up = rng() < 0.5;
			const ang = ( up ? -1 : 1 ) * ( 0.45 + rng() * 0.5 );
			plan.direction = ang;
			const n = 2 + Math.floor( rng() * 3 );
			for ( let i = 0; i < n; i++ ) {
				const t = ( i + 0.5 ) / n;
				const cx = t * aspect;
				const cy = 0.5 + ( t - 0.5 ) * Math.tan( ang ) * aspect;
				mass( {
					cx,
					cy,
					rx: 0.1 + rng() * 0.16,
					ry: 0.06 + rng() * 0.1,
					angle: ang,
					role: i === 1 || n < 2 ? 'dominant' : 'secondary',
				} );
			}
			// A counter-diagonal accent keeps the thrust from sliding out.
			mass( {
				cx: rng() < 0.5 ? aspect * 0.15 : aspect * 0.85,
				cy: up ? 0.2 : 0.8,
				rx: 0.05,
				ry: 0.05,
				angle: -ang,
				role: 'counter',
			} );
			break;
		}
		case 'cluster': {
			plan.coverage = cov( 0.28, 0.5 );
			// The crowd lives in one region; the void is the other.
			const corner = Math.floor( rng() * 4 );
			const cx = ( corner % 2 ? 1 - GOLD * 0.8 : GOLD * 0.8 ) * aspect;
			const cy = corner < 2 ? GOLD * 0.8 : 1 - GOLD * 0.8;
			plan.focal = { x: cx, y: cy };
			const n = 4 + Math.floor( rng() * 5 );
			for ( let i = 0; i < n; i++ ) {
				const a = rng() * Math.PI * 2;
				const d = Math.pow( rng(), 0.7 ) * 0.28;
				mass( {
					cx: cx + Math.cos( a ) * d * aspect * 0.7,
					cy: cy + Math.sin( a ) * d,
					rx: 0.04 + rng() * 0.12,
					ry: 0.04 + rng() * 0.1,
					role: i ? 'secondary' : 'dominant',
				} );
			}
			// Strays bridge toward the void.
			mass( {
				cx: aspect - cx,
				cy: 1 - cy,
				rx: 0.025,
				ry: 0.025,
				role: 'counter',
			} );
			break;
		}
		case 'grid': {
			plan.coverage = cov( 0.7, 1 );
			const part = partition( rng, aspect, 4 + Math.floor( rng() * 2 ) );
			plan.lines = part.lines;
			plan.cells = part.rects;
			// A few cells are the picture; the rest is ground.
			const shuffled = part.rects.slice().sort( () => rng() - 0.5 );
			const k = Math.max(
				1,
				Math.round( shuffled.length * ( 0.2 + rng() * 0.3 ) )
			);
			shuffled.slice( 0, k ).forEach( ( r, i ) =>
				mass( {
					cx: r.x + r.w / 2,
					cy: r.y + r.h / 2,
					rx: r.w / 2,
					ry: r.h / 2,
					angle: 0,
					shape: 'hard',
					role: i ? 'secondary' : 'dominant',
				} )
			);
			break;
		}
		case 'stack': {
			plan.coverage = cov( 0.9, 1 );
			const n = 2 + Math.floor( rng() * 3 );
			const cuts = [ 0 ];
			for ( let i = 1; i < n; i++ ) {
				cuts.push(
					cuts[ i - 1 ] +
						( 1 - cuts[ i - 1 ] ) * ( 0.3 + rng() * 0.45 )
				);
			}
			cuts.push( 1 );
			for ( let i = 0; i < n; i++ ) {
				const y0 = cuts[ i ];
				const y1 = cuts[ i + 1 ];
				plan.bands.push( { y0, y1, value: rng() } );
				mass( {
					cx: aspect / 2,
					cy: ( y0 + y1 ) / 2,
					rx: aspect * 0.46,
					ry: ( y1 - y0 ) / 2,
					angle: 0,
					shape: 'band',
					role: i === Math.floor( n / 2 ) ? 'dominant' : 'secondary',
				} );
			}
			plan.direction = 0;
			break;
		}
		case 'vortex': {
			plan.coverage = cov( 0.5, 0.85 );
			plan.pole = {
				x: anchor( rng, aspect ),
				y: anchor( rng, 1 ),
				turns: 1.5 + rng() * 2.5,
				sense: rng() < 0.5 ? 1 : -1,
			};
			plan.focal = { x: plan.pole.x, y: plan.pole.y };
			const n = 3 + Math.floor( rng() * 3 );
			for ( let i = 0; i < n; i++ ) {
				const a = ( i / n ) * Math.PI * 2 + rng();
				const d = 0.15 + ( i / n ) * 0.3;
				mass( {
					cx: plan.pole.x + Math.cos( a ) * d,
					cy: plan.pole.y + Math.sin( a ) * d,
					rx: 0.08 + rng() * 0.1,
					ry: 0.05 + rng() * 0.08,
					angle: a + Math.PI / 2,
					role: i ? 'secondary' : 'dominant',
				} );
			}
			break;
		}
		case 'cascade': {
			plan.coverage = cov( 0.4, 0.7 );
			const x0 = anchor( rng, aspect );
			const n = 3 + Math.floor( rng() * 4 );
			for ( let i = 0; i < n; i++ ) {
				const t = i / Math.max( 1, n - 1 );
				mass( {
					cx: x0 + ( rng() - 0.5 ) * 0.3 * ( 0.4 + t ),
					cy: 0.12 + t * 0.7,
					rx: ( 0.18 - t * 0.1 ) * ( 0.8 + rng() * 0.5 ),
					ry: 0.1 - t * 0.05 + rng() * 0.05,
					role: i ? 'secondary' : 'dominant',
				} );
			}
			plan.direction = Math.PI / 2;
			plan.focal = { x: x0, y: 0.25 };
			break;
		}
		case 'frame': {
			plan.coverage = cov( 0.65, 0.9 );
			const m = 0.08 + rng() * 0.12;
			plan.frameRect = {
				x: m * aspect * 0.8,
				y: m,
				w: aspect - 2 * m * aspect * 0.8,
				h: 1 - 2 * m,
			};
			mass( {
				cx: aspect / 2,
				cy: 0.5,
				rx: plan.frameRect.w / 2,
				ry: plan.frameRect.h / 2,
				angle: 0,
				shape: 'hard',
				role: 'secondary',
				value: valueKey === 'low' ? 0.2 : 0.8,
			} );
			mass( {
				cx: plan.focal.x,
				cy: plan.focal.y,
				rx: 0.12 + rng() * 0.15,
				ry: 0.1 + rng() * 0.15,
				role: 'dominant',
			} );
			break;
		}
		case 'duet': {
			plan.coverage = cov( 0.28, 0.5 );
			const cx = anchor( rng, aspect );
			const cy = anchor( rng, 1 );
			mass( {
				cx,
				cy,
				rx: 0.14 + rng() * 0.16,
				ry: 0.14 + rng() * 0.16,
				role: 'dominant',
			} );
			// The partner: across, smaller or larger, lighter or darker.
			mass( {
				cx: aspect - cx + ( rng() - 0.5 ) * 0.25,
				cy: 1 - cy + ( rng() - 0.5 ) * 0.25,
				rx: 0.08 + rng() * 0.14,
				ry: 0.08 + rng() * 0.14,
				role: 'secondary',
			} );
			break;
		}
		case 'single':
		default: {
			plan.coverage = cov( 0.08, 0.3 );
			mass( {
				cx: plan.focal.x,
				cy: plan.focal.y,
				rx: 0.18 + rng() * 0.22,
				ry: 0.14 + rng() * 0.2,
				role: 'dominant',
			} );
			break;
		}
	}
	// Keep every mass inside the frame by its center.
	for ( const m of plan.masses ) {
		m.cx = Math.max( 0.02 * aspect, Math.min( 0.98 * aspect, m.cx ) );
		m.cy = Math.max( 0.02, Math.min( 0.98, m.cy ) );
	}
	return plan;
}

/** A point inside a mass (elliptical, denser toward the middle). */
export function sampleMass( m, rng, spread = 1 ) {
	const a = rng() * Math.PI * 2;
	const r = Math.pow( rng(), 0.6 ) * spread;
	const lx = Math.cos( a ) * r * m.rx;
	const ly = Math.sin( a ) * r * m.ry;
	const cs = Math.cos( m.angle || 0 );
	const sn = Math.sin( m.angle || 0 );
	return [ m.cx + lx * cs - ly * sn, m.cy + lx * sn + ly * cs ];
}

/** Which mass covers a point (first hit), or null. */
export function massAt( plan, x, y ) {
	for ( const m of plan.masses ) {
		const dx = x - m.cx;
		const dy = y - m.cy;
		const cs = Math.cos( -( m.angle || 0 ) );
		const sn = Math.sin( -( m.angle || 0 ) );
		const lx = dx * cs - dy * sn;
		const ly = dx * sn + dy * cs;
		if (
			( lx * lx ) / ( m.rx * m.rx ) + ( ly * ly ) / ( m.ry * m.ry ) <=
			1
		) {
			return m;
		}
	}
	return null;
}

/**
 * What the picture needs next, read from the senses against the plan:
 * a place to add weight (balance), the coverage gap, whether the piece
 * still wants a focal accent.
 */
export function needs( plan, senses ) {
	const cov = senses.coverage();
	const imb = senses.imbalance();
	const c = senses.contrast();
	const empty = senses.emptiest( 0.22 );
	return {
		coverage: cov,
		gap: Math.max( 0, plan.coverage - cov ),
		// Pull toward the light side of the scale to restore balance.
		balanceAt: {
			x: plan.aspect * ( 0.5 - imb.x * 0.3 ),
			y: 0.5 - imb.y * 0.3,
		},
		imbalance: Math.hypot( imb.x, imb.y ),
		contrast: c.range,
		empty,
		wantsAccent: c.range < 0.55 && cov > 0.15,
	};
}
