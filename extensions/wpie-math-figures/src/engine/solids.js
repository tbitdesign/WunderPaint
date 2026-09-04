/**
 * Solids in cabinet projection: `cube 4`, `cuboid 5 3 2`, `cylinder 2 5`,
 * `cone 2 5`, `sphere 3`, `pyramid 4 4 5`, `prism 4 3 6`, each with an
 * optional "label". Visible edges solid, hidden edges dashed, curved
 * outlines as sampled paths, dimension labels, and the net of a cube or
 * cuboid beside it.
 */
import { textEl, r } from './svg.js';

const K = 0.5;
const ANG = Math.PI / 4;

/** Cabinet projection: depth z goes up and to the right at half length. */
export function project( x, y, z ) {
	return [ x + z * K * Math.cos( ANG ), -( y + z * K * Math.sin( ANG ) ) ];
}

const ARITY = {
	cube: 1,
	cuboid: 3,
	cylinder: 2,
	cone: 2,
	sphere: 1,
	pyramid: 3,
	prism: 3,
};

export function parseSolids( text ) {
	const spec = { solids: [] };
	const errors = [];
	String( text || '' )
		.split( '\n' )
		.forEach( ( raw, i ) => {
			let line = raw.trim();
			if ( ! line ) {
				return;
			}
			let label = '';
			line = line.replace( /\s*"([^"]*)"\s*$/, ( m, l ) => {
				label = l;
				return '';
			} );
			const [ kind, ...rest ] = line.split( /\s+/ );
			const k = kind.toLowerCase();
			const dims = rest.map( ( tk ) =>
				parseFloat( tk.replace( ',', '.' ) )
			);
			if ( ! ( k in ARITY ) ) {
				errors.push( {
					line: i + 1,
					message:
						'Solids: cube 4, cuboid 5 3 2, cylinder 2 5, cone 2 5, sphere 3, pyramid 4 4 5, prism 4 3 6',
				} );
				return;
			}
			if (
				dims.length < ARITY[ k ] ||
				dims.some( ( d ) => ! ( d > 0 ) )
			) {
				errors.push( {
					line: i + 1,
					message:
						k +
						' needs ' +
						ARITY[ k ] +
						' positive number' +
						( 1 === ARITY[ k ] ? '' : 's' ),
				} );
				return;
			}
			spec.solids.push( {
				kind: k,
				dims: dims.slice( 0, ARITY[ k ] ),
				label,
			} );
		} );
	return { spec, errors };
}

/* Each builder returns { edges: [ [p, q, hidden] ], paths: [ { d: [ [x,y] ], hidden } ], circles, labels: [ [x, y, text] ], net } in unit space. */
function box( a, b, c ) {
	// a wide (x), b tall (y), c deep (z).
	const P = [
		[ 0, 0, 0 ],
		[ a, 0, 0 ],
		[ a, b, 0 ],
		[ 0, b, 0 ],
		[ 0, 0, c ],
		[ a, 0, c ],
		[ a, b, c ],
		[ 0, b, c ],
	];
	const E = [
		[ 0, 1 ],
		[ 1, 2 ],
		[ 2, 3 ],
		[ 3, 0 ],
		[ 4, 5 ],
		[ 5, 6 ],
		[ 6, 7 ],
		[ 7, 4 ],
		[ 0, 4 ],
		[ 1, 5 ],
		[ 2, 6 ],
		[ 3, 7 ],
	];
	const hiddenV = 4; // back bottom left
	const edges = E.map( ( [ i, j ] ) => [
		P[ i ],
		P[ j ],
		i === hiddenV || j === hiddenV,
	] );
	const labels = [
		[ a / 2, -0.35, 0, 'a = ' + a ],
		[ a + 0.3, b / 2, 0, 'b = ' + b ],
		[ a + 0.25, -0.05, c / 2, 'c = ' + c ],
	];
	return { edges, labels, net: [ a, b, c ] };
}
function pyramid( a, b, h ) {
	const P = [
		[ 0, 0, 0 ],
		[ a, 0, 0 ],
		[ a, 0, b ],
		[ 0, 0, b ],
		[ a / 2, h, b / 2 ],
	];
	const E = [
		[ 0, 1, false ],
		[ 1, 2, false ],
		[ 2, 3, true ],
		[ 3, 0, true ],
		[ 0, 4, false ],
		[ 1, 4, false ],
		[ 2, 4, false ],
		[ 3, 4, true ],
	];
	return {
		edges: E.map( ( [ i, j, hd ] ) => [ P[ i ], P[ j ], hd ] ),
		labels: [
			[ a / 2, -0.35, 0, 'a = ' + a ],
			[ a + 0.25, -0.05, b / 2, 'b = ' + b ],
			[ a / 2 + 0.3, h / 2, b / 2, 'h = ' + h ],
		],
	};
}
function prism( a, b, l ) {
	const P = [
		[ 0, 0, 0 ],
		[ a, 0, 0 ],
		[ a / 2, b, 0 ],
		[ 0, 0, l ],
		[ a, 0, l ],
		[ a / 2, b, l ],
	];
	const E = [
		[ 0, 1, false ],
		[ 1, 2, false ],
		[ 2, 0, false ],
		[ 3, 4, true ],
		[ 4, 5, false ],
		[ 5, 3, true ],
		[ 0, 3, true ],
		[ 1, 4, false ],
		[ 2, 5, false ],
	];
	return {
		edges: E.map( ( [ i, j, hd ] ) => [ P[ i ], P[ j ], hd ] ),
		labels: [
			[ a / 2, -0.35, 0, 'a = ' + a ],
			[ -0.3, b / 2, 0, 'b = ' + b ],
			[ a + 0.25, -0.05, l / 2, 'l = ' + l ],
		],
	};
}
function ellipsePath( cx, cy, cz, rad, front ) {
	// Circle in the horizontal plane at height cy, split into front (z < 0 side, towards the viewer) and back.
	const pts = [];
	const n = 40;
	for ( let i = 0; i <= n; i++ ) {
		const t = ( front ? 0 : Math.PI ) + ( i / n ) * Math.PI;
		pts.push( [ cx + rad * Math.cos( t ), cy, cz - rad * Math.sin( t ) ] );
	}
	return pts;
}
function cylinder( rad, h ) {
	return {
		edges: [
			[ [ -rad, 0, 0 ], [ -rad, h, 0 ], false ],
			[ [ rad, 0, 0 ], [ rad, h, 0 ], false ],
		],
		paths: [
			{ pts: ellipsePath( 0, 0, 0, rad, true ), hidden: false },
			{ pts: ellipsePath( 0, 0, 0, rad, false ), hidden: true },
			{ pts: ellipsePath( 0, h, 0, rad, true ), hidden: false },
			{ pts: ellipsePath( 0, h, 0, rad, false ), hidden: false },
		],
		labels: [
			[ 0, -0.4, -rad, 'r = ' + rad ],
			[ rad + 0.3, h / 2, 0, 'h = ' + h ],
		],
	};
}
function cone( rad, h ) {
	return {
		edges: [
			[ [ -rad, 0, 0 ], [ 0, h, 0 ], false ],
			[ [ rad, 0, 0 ], [ 0, h, 0 ], false ],
		],
		paths: [
			{ pts: ellipsePath( 0, 0, 0, rad, true ), hidden: false },
			{ pts: ellipsePath( 0, 0, 0, rad, false ), hidden: true },
		],
		labels: [
			[ 0, -0.4, -rad, 'r = ' + rad ],
			[ rad / 2 + 0.4, h / 2, 0, 'h = ' + h ],
		],
	};
}
function sphere( rad ) {
	return {
		edges: [],
		circle: rad,
		paths: [
			{ pts: ellipsePath( 0, 0, 0, rad, true ), hidden: false },
			{ pts: ellipsePath( 0, 0, 0, rad, false ), hidden: true },
		],
		labels: [ [ rad / 2, 0.3, 0, 'r = ' + rad ] ],
		radiusLine: true,
	};
}

function build( s ) {
	const d = s.dims;
	switch ( s.kind ) {
		case 'cube':
			return box( d[ 0 ], d[ 0 ], d[ 0 ] );
		case 'cuboid':
			return box( d[ 0 ], d[ 1 ], d[ 2 ] );
		case 'cylinder':
			return cylinder( d[ 0 ], d[ 1 ] );
		case 'cone':
			return cone( d[ 0 ], d[ 1 ] );
		case 'sphere':
			return sphere( d[ 0 ] );
		case 'pyramid':
			return pyramid( d[ 0 ], d[ 1 ], d[ 2 ] );
		default:
			return prism( d[ 0 ], d[ 1 ], d[ 2 ] );
	}
}

export function renderSolids( spec, o ) {
	const scale = o.scale || 1;
	const width = o.width || 1000;
	const ink = o.ink || '#000';
	const accent = o.accent || ink;
	const muted = o.muted || ink;
	const font = o.font || 'Arial';
	const fs = ( o.size || 22 ) * 0.85;
	const hiddenOn = false !== o.hidden;
	const dimsOn = false !== o.dims;
	const n = spec.solids.length;
	if ( ! n ) {
		return { inner: '', w: 0, h: 0, warnings: [] };
	}
	const slotW = Math.min( width / n, 380 * scale );
	const slotH = slotW * 0.95;
	const parts = [];
	let totalW = 0;
	spec.solids.forEach( ( s, idx ) => {
		const g = build( s );
		// Collect projected points for the bounding box.
		const pts = [];
		const P = ( v ) => project( v[ 0 ], v[ 1 ], v[ 2 ] );
		for ( const [ p, q ] of g.edges ) {
			pts.push( P( p ), P( q ) );
		}
		for ( const path of g.paths || [] ) {
			for ( const v of path.pts ) {
				pts.push( P( v ) );
			}
		}
		if ( g.circle ) {
			pts.push( [ -g.circle, -g.circle ], [ g.circle, g.circle ] );
		}
		const xs = pts.map( ( p ) => p[ 0 ] );
		const ys = pts.map( ( p ) => p[ 1 ] );
		const minX = Math.min( ...xs );
		const maxX = Math.max( ...xs );
		const minY = Math.min( ...ys );
		const maxY = Math.max( ...ys );
		const netW = o.net && g.net ? g.net[ 0 ] * 3 + g.net[ 2 ] * 1 + 1 : 0;
		const bw = maxX - minX + ( dimsOn ? 1.2 : 0.4 ) + netW;
		const bh = maxY - minY + ( dimsOn ? 1 : 0.4 );
		const k = Math.min(
			( slotW * ( o.net && g.net ? 1.6 : 0.9 ) ) / bw,
			( slotH * 0.9 ) / bh
		);
		const ox = totalW + ( dimsOn ? 0.6 : 0.2 ) * k - minX * k;
		const oy = ( dimsOn ? 0.4 : 0.2 ) * k - minY * k;
		const S = ( v ) => {
			const [ x, y ] = P( v );
			return [ ox + x * k, oy + y * k ];
		};
		const sw = r( 2 * scale );
		for ( const [ p, q, hd ] of g.edges ) {
			if ( hd && ! hiddenOn ) {
				continue;
			}
			const [ x1, y1 ] = S( p );
			const [ x2, y2 ] = S( q );
			parts.push(
				`<line x1="${ r( x1 ) }" y1="${ r( y1 ) }" x2="${ r(
					x2
				) }" y2="${ r(
					y2
				) }" stroke="${ ink }" stroke-width="${ sw }"${
					hd ? ' stroke-dasharray="6 5"' : ''
				}/>`
			);
		}
		for ( const path of g.paths || [] ) {
			if ( path.hidden && ! hiddenOn ) {
				continue;
			}
			const d = path.pts
				.map( ( v, i ) => {
					const [ x, y ] = S( v );
					return ( i ? 'L' : 'M' ) + r( x ) + ' ' + r( y );
				} )
				.join( '' );
			parts.push(
				`<path d="${ d }" fill="none" stroke="${ ink }" stroke-width="${ sw }"${
					path.hidden ? ' stroke-dasharray="6 5"' : ''
				}/>`
			);
		}
		if ( g.circle ) {
			const [ cx, cy ] = S( [ 0, 0, 0 ] );
			parts.push(
				`<circle cx="${ r( cx ) }" cy="${ r( cy ) }" r="${ r(
					g.circle * k
				) }" fill="none" stroke="${ ink }" stroke-width="${ sw }"/>`
			);
			if ( dimsOn ) {
				parts.push(
					`<line x1="${ r( cx ) }" y1="${ r( cy ) }" x2="${ r(
						cx + g.circle * k
					) }" y2="${ r(
						cy
					) }" stroke="${ accent }" stroke-width="${ sw }"/>`
				);
			}
		}
		if ( dimsOn ) {
			for ( const [ x, y, z, txt ] of g.labels ) {
				const [ lx, ly ] = S( [ x, y, z ] );
				parts.push(
					textEl( lx, ly + fs * 0.35, txt, {
						size: r( fs * 0.85 ),
						font,
						fill: accent,
						anchor: 'middle',
					} )
				);
			}
		}
		if ( o.net && g.net ) {
			// Cross-shaped net beside the solid: a x b faces around, c the depth.
			const [ a, b, c ] = g.net;
			const nx = totalW + ( maxX - minX + 1.6 ) * k;
			const ny = oy + ( minY + 0.2 ) * k;
			const faces = [
				[ c, 0, a, b ],
				[ 0, b, c, a ],
				[ c, b, a, a ],
				[ c + a, b, c, a ],
				[ c, b + a, a, b ],
				[ c, b + a + b, a, a ],
			];
			for ( const [ fx, fy, fw, fh ] of faces ) {
				parts.push(
					`<rect x="${ r( nx + fx * k * 0.6 ) }" y="${ r(
						ny + fy * k * 0.6
					) }" width="${ r( fw * k * 0.6 ) }" height="${ r(
						fh * k * 0.6
					) }" fill="${ accent }" fill-opacity="0.15" stroke="${ ink }" stroke-width="${ r(
						1.4 * scale
					) }"/>`
				);
			}
		}
		if ( s.label ) {
			parts.push(
				textEl( totalW + ( bw * k ) / 2, slotH - fs * 0.3, s.label, {
					size: r( fs ),
					font,
					fill: muted,
					anchor: 'middle',
				} )
			);
		}
		totalW += bw * k + fs;
		void idx;
	} );
	return {
		inner: parts.join( '' ),
		w: r( Math.max( 1, totalW - fs ) ),
		h: r( slotH ),
		warnings: [],
	};
}
