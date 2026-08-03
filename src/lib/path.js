/**
 * SVG path normalization (v1.2.1): parse ANY path data (absolute/relative
 * M L H V C S Q T A Z) and emit absolute M/L/C/Q/Z only, arcs become
 * cubic Béziers. Downstream code (tracePathD, scale/offset transforms)
 * then only ever deals with plain coordinate pairs.
 */

const TOKEN = /[a-zA-Z]|[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/g;

/** Arc endpoint parameterization → cubic segments (SVG F.6.5/F.6.6). */
function arcToCubics( x1, y1, rx, ry, phiDeg, largeArc, sweep, x2, y2 ) {
	if ( 0 === rx || 0 === ry ) {
		return [ [ x1, y1, x2, y2, x2, y2 ] ];
	}
	const phi = ( phiDeg * Math.PI ) / 180;
	const cosP = Math.cos( phi );
	const sinP = Math.sin( phi );
	rx = Math.abs( rx );
	ry = Math.abs( ry );

	const dx2 = ( x1 - x2 ) / 2;
	const dy2 = ( y1 - y2 ) / 2;
	const x1p = cosP * dx2 + sinP * dy2;
	const y1p = -sinP * dx2 + cosP * dy2;

	const lambda = ( x1p * x1p ) / ( rx * rx ) + ( y1p * y1p ) / ( ry * ry );
	if ( lambda > 1 ) {
		const s = Math.sqrt( lambda );
		rx *= s;
		ry *= s;
	}

	const sign = largeArc !== sweep ? 1 : -1;
	const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
	const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
	const coef = sign * Math.sqrt( Math.max( 0, num / den ) );
	const cxp = ( coef * rx * y1p ) / ry;
	const cyp = ( -coef * ry * x1p ) / rx;
	const cx = cosP * cxp - sinP * cyp + ( x1 + x2 ) / 2;
	const cy = sinP * cxp + cosP * cyp + ( y1 + y2 ) / 2;

	const angle = ( ux, uy, vx, vy ) => {
		const dot = ux * vx + uy * vy;
		const len = Math.sqrt( ( ux * ux + uy * uy ) * ( vx * vx + vy * vy ) );
		let a = Math.acos( Math.min( 1, Math.max( -1, dot / len ) ) );
		if ( ux * vy - uy * vx < 0 ) {
			a = -a;
		}
		return a;
	};
	const theta1 = angle( 1, 0, ( x1p - cxp ) / rx, ( y1p - cyp ) / ry );
	let delta = angle(
		( x1p - cxp ) / rx,
		( y1p - cyp ) / ry,
		( -x1p - cxp ) / rx,
		( -y1p - cyp ) / ry
	);
	if ( ! sweep && delta > 0 ) {
		delta -= 2 * Math.PI;
	} else if ( sweep && delta < 0 ) {
		delta += 2 * Math.PI;
	}

	const segments = Math.max(
		1,
		Math.ceil( Math.abs( delta ) / ( Math.PI / 2 ) )
	);
	const out = [];
	const step = delta / segments;
	for ( let i = 0; i < segments; i++ ) {
		const t1 = theta1 + i * step;
		const t2 = t1 + step;
		const alpha = ( 4 / 3 ) * Math.tan( ( t2 - t1 ) / 4 );
		const cos1 = Math.cos( t1 );
		const sin1 = Math.sin( t1 );
		const cos2 = Math.cos( t2 );
		const sin2 = Math.sin( t2 );
		const p = ( ct, st ) => [
			cx + rx * cosP * ct - ry * sinP * st,
			cy + rx * sinP * ct + ry * cosP * st,
		];
		const d1 = [
			-rx * cosP * sin1 - ry * sinP * cos1,
			-rx * sinP * sin1 + ry * cosP * cos1,
		];
		const d2 = [
			-rx * cosP * sin2 - ry * sinP * cos2,
			-rx * sinP * sin2 + ry * cosP * cos2,
		];
		const [ ex1, ey1 ] = p( cos1, sin1 );
		const [ ex2, ey2 ] = p( cos2, sin2 );
		out.push( [
			ex1 + alpha * d1[ 0 ],
			ey1 + alpha * d1[ 1 ],
			ex2 - alpha * d2[ 0 ],
			ey2 - alpha * d2[ 1 ],
			ex2,
			ey2,
		] );
	}
	return out;
}

const fmt = ( n ) => {
	const r = Math.round( n * 1000 ) / 1000;
	return Object.is( r, -0 ) ? '0' : String( r );
};

/**
 * Normalize path data to absolute M/L/C/Q/Z.
 *
 * @param {string} d Any SVG path data.
 * @return {string} Normalized path data.
 */
export function normalizePathD( d ) {
	const tokens = String( d || '' ).match( TOKEN ) || [];
	let i = 0;
	const out = [];
	let cmd = null;
	let x = 0;
	let y = 0;
	let startX = 0;
	let startY = 0;
	let prevC = null; // last cubic control (for S)
	let prevQ = null; // last quad control (for T)
	const num = () => parseFloat( tokens[ i++ ] );

	while ( i < tokens.length ) {
		if ( /[a-zA-Z]/.test( tokens[ i ] ) ) {
			cmd = tokens[ i++ ];
		}
		const rel = cmd === cmd.toLowerCase() && 'z' !== cmd.toLowerCase();
		const C = cmd.toUpperCase();
		switch ( C ) {
			case 'M': {
				const nx = num() + ( rel ? x : 0 );
				const ny = num() + ( rel ? y : 0 );
				x = nx;
				y = ny;
				startX = nx;
				startY = ny;
				out.push( `M ${ fmt( nx ) } ${ fmt( ny ) }` );
				cmd = rel ? 'l' : 'L';
				prevC = prevQ = null;
				break;
			}
			case 'L': {
				const nx = num() + ( rel ? x : 0 );
				const ny = num() + ( rel ? y : 0 );
				x = nx;
				y = ny;
				out.push( `L ${ fmt( nx ) } ${ fmt( ny ) }` );
				prevC = prevQ = null;
				break;
			}
			case 'H': {
				const nx = num() + ( rel ? x : 0 );
				x = nx;
				out.push( `L ${ fmt( nx ) } ${ fmt( y ) }` );
				prevC = prevQ = null;
				break;
			}
			case 'V': {
				const ny = num() + ( rel ? y : 0 );
				y = ny;
				out.push( `L ${ fmt( x ) } ${ fmt( ny ) }` );
				prevC = prevQ = null;
				break;
			}
			case 'C': {
				const c1x = num() + ( rel ? x : 0 );
				const c1y = num() + ( rel ? y : 0 );
				const c2x = num() + ( rel ? x : 0 );
				const c2y = num() + ( rel ? y : 0 );
				const nx = num() + ( rel ? x : 0 );
				const ny = num() + ( rel ? y : 0 );
				out.push(
					`C ${ fmt( c1x ) } ${ fmt( c1y ) } ${ fmt( c2x ) } ${ fmt(
						c2y
					) } ${ fmt( nx ) } ${ fmt( ny ) }`
				);
				prevC = [ c2x, c2y ];
				prevQ = null;
				x = nx;
				y = ny;
				break;
			}
			case 'S': {
				const c1x = prevC ? 2 * x - prevC[ 0 ] : x;
				const c1y = prevC ? 2 * y - prevC[ 1 ] : y;
				const c2x = num() + ( rel ? x : 0 );
				const c2y = num() + ( rel ? y : 0 );
				const nx = num() + ( rel ? x : 0 );
				const ny = num() + ( rel ? y : 0 );
				out.push(
					`C ${ fmt( c1x ) } ${ fmt( c1y ) } ${ fmt( c2x ) } ${ fmt(
						c2y
					) } ${ fmt( nx ) } ${ fmt( ny ) }`
				);
				prevC = [ c2x, c2y ];
				prevQ = null;
				x = nx;
				y = ny;
				break;
			}
			case 'Q': {
				const qx = num() + ( rel ? x : 0 );
				const qy = num() + ( rel ? y : 0 );
				const nx = num() + ( rel ? x : 0 );
				const ny = num() + ( rel ? y : 0 );
				out.push(
					`Q ${ fmt( qx ) } ${ fmt( qy ) } ${ fmt( nx ) } ${ fmt(
						ny
					) }`
				);
				prevQ = [ qx, qy ];
				prevC = null;
				x = nx;
				y = ny;
				break;
			}
			case 'T': {
				const qx = prevQ ? 2 * x - prevQ[ 0 ] : x;
				const qy = prevQ ? 2 * y - prevQ[ 1 ] : y;
				const nx = num() + ( rel ? x : 0 );
				const ny = num() + ( rel ? y : 0 );
				out.push(
					`Q ${ fmt( qx ) } ${ fmt( qy ) } ${ fmt( nx ) } ${ fmt(
						ny
					) }`
				);
				prevQ = [ qx, qy ];
				prevC = null;
				x = nx;
				y = ny;
				break;
			}
			case 'A': {
				const rx = num();
				const ry = num();
				const rot = num();
				const large = !! num();
				const sweep = !! num();
				const nx = num() + ( rel ? x : 0 );
				const ny = num() + ( rel ? y : 0 );
				for ( const seg of arcToCubics(
					x,
					y,
					rx,
					ry,
					rot,
					large,
					sweep,
					nx,
					ny
				) ) {
					out.push( `C ${ seg.map( fmt ).join( ' ' ) }` );
				}
				prevC = prevQ = null;
				x = nx;
				y = ny;
				break;
			}
			case 'Z': {
				out.push( 'Z' );
				x = startX;
				y = startY;
				prevC = prevQ = null;
				break;
			}
			default:
				// Unknown/garbage token, skip it to stay loop-safe.
				i++;
		}
	}
	return out.join( ' ' );
}

const NORMALIZED = /^[MLCQZ0-9eE.\s+-]*$/;

/** Cheap check: already absolute M/L/C/Q/Z-only? */
export const isNormalizedPathD = ( d ) => NORMALIZED.test( String( d || '' ) );

/** Normalize only when needed (hot path helper). */
export const ensureNormalizedPathD = ( d ) =>
	isNormalizedPathD( d ) ? String( d || '' ) : normalizePathD( d );

/** Scale every coordinate in a path string around the origin. */
export function scalePathD( d, sx, sy ) {
	// Normalized first: plain coordinate pairs only (no arc flags/H/V).
	const tokens =
		ensureNormalizedPathD( d ).match(
			/[a-zA-Z]|-?\d*\.?\d+(?:e[+-]?\d+)?/g
		) || [];
	const out = [];
	let isX = true;
	for ( const token of tokens ) {
		if ( /[a-zA-Z]/.test( token ) ) {
			out.push( token );
			isX = true;
		} else {
			out.push( String( parseFloat( token ) * ( isX ? sx : sy ) ) );
			isX = ! isX;
		}
	}
	return out.join( ' ' );
}

/** Shift every coordinate in a path string. */
export function offsetPathD( d, dx, dy ) {
	const tokens =
		ensureNormalizedPathD( d ).match(
			/[a-zA-Z]|-?\d*\.?\d+(?:e[+-]?\d+)?/g
		) || [];
	const out = [];
	let isX = true;
	for ( const token of tokens ) {
		if ( /[a-zA-Z]/.test( token ) ) {
			out.push( token );
			isX = true;
		} else {
			out.push( String( parseFloat( token ) + ( isX ? dx : dy ) ) );
			isX = ! isX;
		}
	}
	return out.join( ' ' );
}
