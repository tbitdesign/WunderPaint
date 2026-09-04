/**
 * The critic: reads the picture, never touches it.
 *
 * Thomas, after the first evening: "es fehlt ein Kritiker, der verhindert,
 * dass nur chaotische Dinge aufeinandergeklatscht werden". So one actor
 * looks at the sheet the way a painter steps back from the easel - and
 * says what the picture needs, not what to paint. Its report is read by
 * everyone: the painters when they choose a place and a value, the
 * world when it decides whether a piece is resolved.
 *
 * What it reads, all from the sense map (pure math, no canvas):
 *  - the value structure: how much of the painted sheet is dark, middle
 *    and light; a painting wants all three, roughly a quarter, a half
 *    and a quarter;
 *  - focal contrast: the sharpest contrast should sit at the focal spot,
 *    not anywhere else;
 *  - temperature: warm against cool;
 *  - a quiet zone: the largest calm window, which must stay calm;
 *  - busyness: how much of the sheet is loud, and whether the loud part
 *    has become noise;
 *  - rhythm: whether a gesture recurs (three to five echoes) or not;
 *  - and from all of that a score, and the verdict "resolved".
 */

import { lum, hueSat } from './senses.js';

const clamp01 = ( v ) => Math.max( 0, Math.min( 1, v ) );

/** Warmth of an rgb triple: +1 warm (red/yellow), -1 cool (blue/cyan). */
export function warmth( c ) {
	const { h, s } = hueSat( c );
	if ( h < 0 || s < 0.08 ) {
		return 0;
	}
	// Hue 0..1: reds/oranges/yellows warm, cyans/blues cool.
	const w = Math.cos( ( h - 0.08 ) * Math.PI * 2 );
	return w * Math.min( 1, s * 1.5 );
}

/**
 * Read the picture.
 *
 * @param {Object} world The flat world (senses, plan, memes, phase).
 * @return {Object} The critique.
 */
export function critique( world ) {
	const s = world.senses;
	const plan = world.plan;
	const n = s.cols * s.rows;
	let painted = 0;
	let dark = 0;
	let mid = 0;
	let light = 0;
	let warm = 0;
	let cool = 0;
	let loud = 0;
	const groundL = s.groundLight === undefined ? 0.5 : s.groundLight;
	for ( let i = 0; i < n; i++ ) {
		const c = s.cover[ i ];
		if ( c < 0.15 ) {
			continue;
		}
		painted++;
		const l = s.light[ i ];
		if ( l < 0.3 ) {
			dark++;
		} else if ( l > 0.68 ) {
			light++;
		} else {
			mid++;
		}
		const rgb = [ s.rgb[ i * 3 ], s.rgb[ i * 3 + 1 ], s.rgb[ i * 3 + 2 ] ];
		const wm = warmth( rgb );
		if ( wm > 0.15 ) {
			warm++;
		} else if ( wm < -0.15 ) {
			cool++;
		}
		if ( s.edge[ i ] > 0.22 ) {
			loud++;
		}
	}
	const share = painted ? 1 / painted : 0;
	const values = {
		dark: dark * share,
		mid: mid * share,
		light: light * share,
	};
	// What the value structure lacks (only once there is a picture).
	let valueNeed = null;
	if ( painted > n * 0.08 ) {
		if ( values.dark < 0.12 && groundL > 0.4 ) {
			valueNeed = 'dark';
		} else if ( values.light < 0.1 && groundL < 0.6 ) {
			valueNeed = 'light';
		} else if ( values.mid < 0.25 ) {
			valueNeed = 'mid';
		}
	}
	// Focal contrast: the edges around the focal spot against the rest.
	const focalEdge = windowMean( s, s.edge, plan.focal.x, plan.focal.y, 0.16 );
	const elsewhere = ( () => {
		let e = 0;
		for ( let i = 0; i < n; i++ ) {
			e += s.edge[ i ];
		}
		return e / n;
	} )();
	const focalContrast = focalEdge - elsewhere;
	const focalNeed = painted > n * 0.15 && focalContrast < elsewhere * 0.35;
	// Temperature.
	const temperature = painted ? ( warm - cool ) / painted : 0;
	const warmNeed =
		painted > n * 0.15
			? temperature > 0.6
				? 'cool'
				: temperature < -0.6
				? 'warm'
				: null
			: null;
	// The quiet zone: the calmest window; it wants to stay calm.
	const quiet = s.emptiest( 0.3 );
	const quietNeed = painted > n * 0.3 && quiet.cover < 0.25;
	// Busyness: loud cells against painted cells; noise when most of the
	// painted sheet is edge.
	const busy = painted ? loud / painted : 0;
	const busyNeed = painted > n * 0.4 && busy > 0.62;
	// Rhythm: a gesture that recurs.
	const kinds = {};
	for ( const m of world.memes || [] ) {
		kinds[ m.kind ] = ( kinds[ m.kind ] || 0 ) + 1;
	}
	const echoes = Object.values( kinds ).reduce(
		( a, b ) => Math.max( a, b ),
		0
	);
	const rhythmNeed =
		painted > n * 0.3 && echoes < 2 && ( world.memes || [] ).length > 4;
	// The score: every want costs; a resolved picture wants little.
	let score = 1;
	if ( valueNeed ) {
		score -= 0.25;
	}
	if ( focalNeed ) {
		score -= 0.2;
	}
	if ( warmNeed ) {
		score -= 0.1;
	}
	if ( quietNeed ) {
		score -= 0.15;
	}
	if ( busyNeed ) {
		score -= 0.25;
	}
	if ( rhythmNeed ) {
		score -= 0.1;
	}
	const coverage = painted / n;
	const target = Math.max( 0.05, plan.coverage );
	const resolved =
		coverage >= target * 0.8 && score >= 0.75 && ! busyNeed && ! valueNeed;
	return {
		painted: coverage,
		values,
		valueNeed,
		focalContrast,
		focalNeed,
		temperature,
		warmNeed,
		quiet,
		quietNeed,
		busy,
		busyNeed,
		echoes,
		rhythmNeed,
		score: clamp01( score ),
		resolved,
	};
}

/** Mean of a map in a window of `size` (fraction of height) around a frame point. */
function windowMean( s, map, x, y, size ) {
	const r = Math.max( 1, Math.round( size * s.rows * 0.5 ) );
	const cx = Math.round( ( x / s.aspect ) * s.cols );
	const cy = Math.round( y * s.rows );
	let sum = 0;
	let k = 0;
	for ( let yy = cy - r; yy <= cy + r; yy++ ) {
		for ( let xx = cx - r; xx <= cx + r; xx++ ) {
			if ( xx < 0 || yy < 0 || xx >= s.cols || yy >= s.rows ) {
				continue;
			}
			sum += map[ yy * s.cols + xx ];
			k++;
		}
	}
	return k ? sum / k : 0;
}

/** Is a frame point inside the critic's quiet zone? */
export function inQuiet( report, p, size = 0.3 ) {
	if ( ! report || ! report.quietNeed ) {
		return false;
	}
	const q = report.quiet;
	return Math.hypot( p[ 0 ] - q.x, p[ 1 ] - q.y ) < size * 0.5;
}

export const groundLum = lum;
