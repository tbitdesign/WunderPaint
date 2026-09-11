/**
 * The motif: a picture or a text, read the way a painter reads it.
 *
 * Nothing here is copied. The picture is squinted at: light and dark,
 * the big planes of color, where the edges run and which way, what is
 * near and what is far, what the subject is. Out of that comes a plan
 * (masses with roles, a focal spot, a direction, a few lines and bands)
 * that the schools paint in their own words - an abstract version of
 * the picture, never the picture. A text is the same thing with letters
 * for planes.
 *
 * Everything works on a small grid that matches the painters' sense
 * map, so the maps can be read at any point of the frame with the same
 * index the senses use. Pure math over arrays, testable without a
 * canvas; the canvas work (rendering a text, downsampling a picture)
 * sits in two small helpers at the end.
 */

import { lum, hueSat } from './senses.js';
import { gridSize } from '../core/frame.js';
import { hexRgb } from '../core/palette.js';
import { toHex } from './palette2d.js';

const TAU = Math.PI * 2;
const clamp01 = ( v ) => Math.max( 0, Math.min( 1, v ) );

/** Which way the picture's structure runs at a point: a structure tensor over a window. */
function tensorAngle( light, cols, rows, x0, y0, x1, y1 ) {
	let jxx = 0;
	let jyy = 0;
	let jxy = 0;
	for ( let y = Math.max( 1, y0 ); y < Math.min( rows - 1, y1 ); y++ ) {
		for ( let x = Math.max( 1, x0 ); x < Math.min( cols - 1, x1 ); x++ ) {
			const i = y * cols + x;
			const gx = light[ i + 1 ] - light[ i - 1 ];
			const gy = light[ i + cols ] - light[ i - cols ];
			jxx += gx * gx;
			jyy += gy * gy;
			jxy += gx * gy;
		}
	}
	const tr = jxx + jyy;
	if ( tr < 1e-9 ) {
		return { angle: 0, coherence: 0, energy: 0 };
	}
	const ang = 0.5 * Math.atan2( 2 * jxy, jxx - jyy );
	const l1 = 0.5 * ( tr + Math.hypot( jxx - jyy, 2 * jxy ) );
	const l2 = 0.5 * ( tr - Math.hypot( jxx - jyy, 2 * jxy ) );
	return {
		angle: ang + Math.PI / 2,
		coherence: ( l1 - l2 ) / ( l1 + l2 + 1e-9 ),
		energy: tr,
	};
}

/**
 * Read a picture into motif maps.
 *
 * @param {Object}   src            { data: Uint8ClampedArray RGBA, width, height }.
 * @param {Object}   o              Options.
 * @param {number}   o.aspect       The frame's aspect (w/h); the picture covers it.
 * @param {number}   [o.rows]       Grid rows (36, like the senses).
 * @param {Function} [o.rng]        Random stream for the color clustering.
 * @param {Object}   [o.depth]      { w, h, depth: Uint8Array } 0 far .. 255 near.
 * @param {Object}   [o.mask]       { data, width, height } RGBA whose alpha is the subject.
 * @param {boolean}  [o.maskIsLight] Read the mask from the picture's own lightness (a text).
 * @return {Object} The motif.
 */
export function readPixels( src, o = {} ) {
	const aspect = o.aspect || src.width / src.height;
	const { rows, cols } = gridSize( aspect, o.rows || 36 );
	const rng = o.rng || Math.random;
	const F = 4; // fine grid factor for edges
	const fr = rows * F;
	const fc = cols * F;
	// Cover mapping: the picture fills the frame, cropped at the centre.
	const sa = src.width / src.height;
	let sw = src.width;
	let sh = src.height;
	let sx0 = 0;
	let sy0 = 0;
	if ( sa > aspect ) {
		sw = Math.round( src.height * aspect );
		sx0 = Math.round( ( src.width - sw ) / 2 );
	} else {
		sh = Math.round( src.width / aspect );
		sy0 = Math.round( ( src.height - sh ) / 2 );
	}
	const data = src.data;
	const W = src.width;
	// Fine grid: box-filtered rgb + light.
	const frgb = new Float32Array( fr * fc * 3 );
	const flight = new Float32Array( fr * fc );
	for ( let y = 0; y < fr; y++ ) {
		const py0 = sy0 + Math.floor( ( y / fr ) * sh );
		const py1 = Math.max(
			py0 + 1,
			sy0 + Math.floor( ( ( y + 1 ) / fr ) * sh )
		);
		for ( let x = 0; x < fc; x++ ) {
			const px0 = sx0 + Math.floor( ( x / fc ) * sw );
			const px1 = Math.max(
				px0 + 1,
				sx0 + Math.floor( ( ( x + 1 ) / fc ) * sw )
			);
			let r = 0;
			let g = 0;
			let b = 0;
			let n = 0;
			// Sample at most 4x4 pixels of the block: enough for a plane.
			const stepY = Math.max( 1, Math.floor( ( py1 - py0 ) / 4 ) );
			const stepX = Math.max( 1, Math.floor( ( px1 - px0 ) / 4 ) );
			for ( let py = py0; py < py1; py += stepY ) {
				for ( let px = px0; px < px1; px += stepX ) {
					const i = ( py * W + px ) * 4;
					r += data[ i ];
					g += data[ i + 1 ];
					b += data[ i + 2 ];
					n++;
				}
			}
			const k = y * fc + x;
			frgb[ k * 3 ] = r / n / 255;
			frgb[ k * 3 + 1 ] = g / n / 255;
			frgb[ k * 3 + 2 ] = b / n / 255;
			flight[ k ] = lum( [
				frgb[ k * 3 ],
				frgb[ k * 3 + 1 ],
				frgb[ k * 3 + 2 ],
			] );
		}
	}
	// Coarse maps.
	const n = rows * cols;
	const rgb = new Float32Array( n * 3 );
	const light = new Float32Array( n );
	const sat = new Float32Array( n );
	const edge = new Float32Array( n );
	const dir = new Float32Array( n );
	const coh = new Float32Array( n );
	const inside = new Float32Array( n );
	const depth = new Float32Array( n );
	let edgeMax = 0;
	for ( let y = 0; y < rows; y++ ) {
		for ( let x = 0; x < cols; x++ ) {
			const i = y * cols + x;
			let r = 0;
			let g = 0;
			let b = 0;
			let l = 0;
			for ( let yy = 0; yy < F; yy++ ) {
				for ( let xx = 0; xx < F; xx++ ) {
					const k = ( y * F + yy ) * fc + x * F + xx;
					r += frgb[ k * 3 ];
					g += frgb[ k * 3 + 1 ];
					b += frgb[ k * 3 + 2 ];
					l += flight[ k ];
				}
			}
			const m = F * F;
			rgb[ i * 3 ] = r / m;
			rgb[ i * 3 + 1 ] = g / m;
			rgb[ i * 3 + 2 ] = b / m;
			light[ i ] = l / m;
			sat[ i ] = hueSat( [ r / m, g / m, b / m ] ).s;
			const t = tensorAngle(
				flight,
				fc,
				fr,
				x * F - 1,
				y * F - 1,
				( x + 1 ) * F + 1,
				( y + 1 ) * F + 1
			);
			edge[ i ] = Math.sqrt( t.energy );
			dir[ i ] = t.angle;
			coh[ i ] = t.coherence;
			edgeMax = Math.max( edgeMax, edge[ i ] );
			if ( o.maskIsLight ) {
				inside[ i ] = l / m;
			} else if ( o.mask ) {
				inside[ i ] = sampleMask(
					o.mask,
					x / cols,
					y / rows,
					( x + 1 ) / cols,
					( y + 1 ) / rows,
					sx0,
					sy0,
					sw,
					sh,
					src
				);
			}
			if ( o.depth ) {
				depth[ i ] = sampleDepth(
					o.depth,
					( x + 0.5 ) / cols,
					( y + 0.5 ) / rows,
					sx0,
					sy0,
					sw,
					sh,
					src
				);
			}
		}
	}
	// Edges to 0..1 against a robust maximum.
	const sortedE = Array.from( edge ).sort( ( a, b ) => a - b );
	const e95 = sortedE[ Math.floor( sortedE.length * 0.95 ) ] || edgeMax || 1;
	for ( let i = 0; i < n; i++ ) {
		edge[ i ] = clamp01( edge[ i ] / ( e95 || 1 ) );
	}
	const hasMask = !! ( o.mask || o.maskIsLight );
	const hasDepth = !! o.depth;
	// Planes: k-means over the cells' colors.
	const k = Math.max(
		2,
		Math.min( 7, o.k || ( hasMask && o.maskIsLight ? 2 : 6 ) )
	);
	const { ids, centers } = kmeans( rgb, n, k, rng );
	// Regions: connected runs of one plane.
	const comps = components(
		ids,
		cols,
		rows,
		rgb,
		light,
		depth,
		inside,
		edge,
		hasDepth,
		hasMask
	);
	// The mean light and the value key.
	let meanL = 0;
	for ( let i = 0; i < n; i++ ) {
		meanL += light[ i ];
	}
	meanL /= n;
	// The focal spot: the subject's centre, or where edges, color and the centre agree.
	let focal;
	if ( hasMask ) {
		let sx = 0;
		let sy = 0;
		let s = 0;
		for ( let i = 0; i < n; i++ ) {
			const wgt = inside[ i ];
			if ( wgt > 0.5 ) {
				sx += ( ( i % cols ) + 0.5 ) * wgt;
				sy += ( Math.floor( i / cols ) + 0.5 ) * wgt;
				s += wgt;
			}
		}
		focal =
			s > 0 ? { x: ( sx / s / cols ) * aspect, y: sy / s / rows } : null;
	}
	if ( ! focal ) {
		let best = -1;
		let at = 0;
		for ( let i = 0; i < n; i++ ) {
			const x = ( ( i % cols ) + 0.5 ) / cols;
			const y = ( Math.floor( i / cols ) + 0.5 ) / rows;
			const centre =
				1 - Math.min( 1, Math.hypot( x - 0.5, y - 0.5 ) * 1.6 );
			const score = edge[ i ] + sat[ i ] * 0.5 + centre * 0.6;
			if ( score > best ) {
				best = score;
				at = i;
			}
		}
		focal = {
			x: ( ( ( at % cols ) + 0.5 ) / cols ) * aspect,
			y: ( Math.floor( at / cols ) + 0.5 ) / rows,
		};
	}
	const global = tensorAngle( light, cols, rows, 0, 0, cols, rows );
	// Bands: where the rows' light changes most.
	const rowL = new Float32Array( rows );
	for ( let y = 0; y < rows; y++ ) {
		let s = 0;
		for ( let x = 0; x < cols; x++ ) {
			s += light[ y * cols + x ];
		}
		rowL[ y ] = s / cols;
	}
	const cuts = [];
	for ( let y = 2; y < rows - 2; y++ ) {
		const d = Math.abs( rowL[ y + 1 ] - rowL[ y - 1 ] );
		if ( d > 0.12 ) {
			cuts.push( { y, d } );
		}
	}
	cuts.sort( ( a, b ) => b.d - a.d );
	const chosen = [];
	for ( const c of cuts ) {
		if ( chosen.every( ( o2 ) => Math.abs( o2 - c.y ) > rows * 0.12 ) ) {
			chosen.push( c.y );
		}
		if ( chosen.length >= 3 ) {
			break;
		}
	}
	chosen.sort( ( a, b ) => a - b );
	const bands = [];
	let y0 = 0;
	for ( const y of [ ...chosen, rows ] ) {
		let s = 0;
		for ( let yy = y0; yy < y; yy++ ) {
			s += rowL[ yy ];
		}
		bands.push( {
			y0: y0 / rows,
			y1: y / rows,
			value: s / Math.max( 1, y - y0 ),
		} );
		y0 = y;
	}
	// Lines: the strongest coherent edges, spread out.
	const lines = [];
	const order = Array.from( { length: n }, ( _, i ) => i )
		.filter( ( i ) => edge[ i ] > 0.55 && coh[ i ] > 0.45 )
		.sort( ( a, b ) => edge[ b ] - edge[ a ] );
	for ( const i of order ) {
		const x = ( ( ( i % cols ) + 0.5 ) / cols ) * aspect;
		const y = ( Math.floor( i / cols ) + 0.5 ) / rows;
		if ( lines.every( ( l ) => Math.hypot( l.x - x, l.y - y ) > 0.16 ) ) {
			lines.push( { x, y, angle: dir[ i ], strength: edge[ i ] } );
		}
		if ( lines.length >= 5 ) {
			break;
		}
	}
	// The strongest edge cells, for the contour painters.
	const edgeCells = Array.from( { length: n }, ( _, i ) => i )
		.sort( ( a, b ) => edge[ b ] - edge[ a ] )
		.slice( 0, Math.max( 8, Math.floor( n * 0.15 ) ) );
	return {
		cols,
		rows,
		aspect,
		rgb,
		light,
		sat,
		edge,
		dir,
		coh,
		inside,
		depth,
		hasMask,
		hasDepth,
		meanLight: meanL,
		planes: centers.map( ( c, i ) => ( {
			id: i,
			rgb: c,
			count: ids.reduce( ( a, v ) => a + ( v === i ), 0 ),
		} ) ),
		comps,
		focal,
		direction: global.angle,
		coherence: global.coherence,
		bands,
		lines,
		edgeCells,
	};
}

function sampleMask( mask, u0, v0, u1, v1, sx0, sy0, sw, sh, src ) {
	// The mask is in the source picture's pixel space (any size).
	const kx = mask.width / src.width;
	const ky = mask.height / src.height;
	const x0 = Math.floor( ( sx0 + u0 * sw ) * kx );
	const x1 = Math.max( x0 + 1, Math.floor( ( sx0 + u1 * sw ) * kx ) );
	const y0 = Math.floor( ( sy0 + v0 * sh ) * ky );
	const y1 = Math.max( y0 + 1, Math.floor( ( sy0 + v1 * sh ) * ky ) );
	let s = 0;
	let n = 0;
	const stepX = Math.max( 1, Math.floor( ( x1 - x0 ) / 3 ) );
	const stepY = Math.max( 1, Math.floor( ( y1 - y0 ) / 3 ) );
	for ( let y = y0; y < y1; y += stepY ) {
		for ( let x = x0; x < x1; x += stepX ) {
			const i =
				( Math.min( mask.height - 1, y ) * mask.width +
					Math.min( mask.width - 1, x ) ) *
					4 +
				3;
			s += mask.data[ i ] / 255;
			n++;
		}
	}
	return n ? s / n : 0;
}

function sampleDepth( d, u, v, sx0, sy0, sw, sh, src ) {
	const x = Math.min(
		d.w - 1,
		Math.floor( ( ( sx0 + u * sw ) / src.width ) * d.w )
	);
	const y = Math.min(
		d.h - 1,
		Math.floor( ( ( sy0 + v * sh ) / src.height ) * d.h )
	);
	return d.depth[ y * d.w + x ] / 255;
}

/** Plain k-means over rgb cells; k-means++ seeding from the stream. */
export function kmeans( rgb, n, k, rng ) {
	const centers = [];
	const first = Math.floor( rng() * n ) % n;
	centers.push( [
		rgb[ first * 3 ],
		rgb[ first * 3 + 1 ],
		rgb[ first * 3 + 2 ],
	] );
	const d2 = new Float32Array( n );
	while ( centers.length < k ) {
		let sum = 0;
		for ( let i = 0; i < n; i++ ) {
			let best = Infinity;
			for ( const c of centers ) {
				const dd =
					( rgb[ i * 3 ] - c[ 0 ] ) ** 2 +
					( rgb[ i * 3 + 1 ] - c[ 1 ] ) ** 2 +
					( rgb[ i * 3 + 2 ] - c[ 2 ] ) ** 2;
				best = Math.min( best, dd );
			}
			d2[ i ] = best;
			sum += best;
		}
		if ( sum <= 1e-9 ) {
			break;
		}
		let pick = rng() * sum;
		let at = n - 1;
		for ( let i = 0; i < n; i++ ) {
			pick -= d2[ i ];
			if ( pick <= 0 ) {
				at = i;
				break;
			}
		}
		centers.push( [ rgb[ at * 3 ], rgb[ at * 3 + 1 ], rgb[ at * 3 + 2 ] ] );
	}
	const ids = new Int16Array( n );
	for ( let iter = 0; iter < 12; iter++ ) {
		for ( let i = 0; i < n; i++ ) {
			let best = Infinity;
			let bi = 0;
			for ( let c = 0; c < centers.length; c++ ) {
				const cc = centers[ c ];
				const dd =
					( rgb[ i * 3 ] - cc[ 0 ] ) ** 2 +
					( rgb[ i * 3 + 1 ] - cc[ 1 ] ) ** 2 +
					( rgb[ i * 3 + 2 ] - cc[ 2 ] ) ** 2;
				if ( dd < best ) {
					best = dd;
					bi = c;
				}
			}
			ids[ i ] = bi;
		}
		const acc = centers.map( () => [ 0, 0, 0, 0 ] );
		for ( let i = 0; i < n; i++ ) {
			const a = acc[ ids[ i ] ];
			a[ 0 ] += rgb[ i * 3 ];
			a[ 1 ] += rgb[ i * 3 + 1 ];
			a[ 2 ] += rgb[ i * 3 + 2 ];
			a[ 3 ]++;
		}
		let moved = 0;
		acc.forEach( ( a, c ) => {
			if ( a[ 3 ] ) {
				const nc = [
					a[ 0 ] / a[ 3 ],
					a[ 1 ] / a[ 3 ],
					a[ 2 ] / a[ 3 ],
				];
				moved += Math.hypot(
					nc[ 0 ] - centers[ c ][ 0 ],
					nc[ 1 ] - centers[ c ][ 1 ],
					nc[ 2 ] - centers[ c ][ 2 ]
				);
				centers[ c ] = nc;
			}
		} );
		if ( moved < 1e-4 ) {
			break;
		}
	}
	return { ids, centers };
}

/** Connected regions of one plane, with the statistics a plan needs. */
function components(
	ids,
	cols,
	rows,
	rgb,
	light,
	depth,
	inside,
	edge,
	hasDepth,
	hasMask
) {
	const n = cols * rows;
	const seen = new Int32Array( n ).fill( -1 );
	const out = [];
	const stack = [];
	for ( let s = 0; s < n; s++ ) {
		if ( seen[ s ] >= 0 ) {
			continue;
		}
		const id = ids[ s ];
		const cells = [];
		stack.push( s );
		seen[ s ] = out.length;
		while ( stack.length ) {
			const i = stack.pop();
			cells.push( i );
			const x = i % cols;
			const y = Math.floor( i / cols );
			const nb = [];
			if ( x > 0 ) {
				nb.push( i - 1 );
			}
			if ( x < cols - 1 ) {
				nb.push( i + 1 );
			}
			if ( y > 0 ) {
				nb.push( i - cols );
			}
			if ( y < rows - 1 ) {
				nb.push( i + cols );
			}
			for ( const j of nb ) {
				if ( seen[ j ] < 0 && ids[ j ] === id ) {
					seen[ j ] = out.length;
					stack.push( j );
				}
			}
		}
		out.push( { plane: id, cells } );
	}
	const minCells = Math.max( 3, Math.round( n * 0.012 ) );
	const comps = out
		.filter( ( c ) => c.cells.length >= minCells )
		.map( ( c ) => {
			let sx = 0;
			let sy = 0;
			let r = 0;
			let g = 0;
			let b = 0;
			let l = 0;
			let d = 0;
			let ins = 0;
			let e = 0;
			let border = 0;
			for ( const i of c.cells ) {
				const x = ( i % cols ) + 0.5;
				const y = Math.floor( i / cols ) + 0.5;
				sx += x;
				sy += y;
				r += rgb[ i * 3 ];
				g += rgb[ i * 3 + 1 ];
				b += rgb[ i * 3 + 2 ];
				l += light[ i ];
				d += depth[ i ];
				ins += inside[ i ];
				e += edge[ i ];
				if ( x < 1 || y < 1 || x > cols - 1 || y > rows - 1 ) {
					border++; // a cell on the frame's rim
				}
			}
			const m = c.cells.length;
			const cx = sx / m;
			const cy = sy / m;
			let vxx = 0;
			let vyy = 0;
			let vxy = 0;
			for ( const i of c.cells ) {
				const dx = ( i % cols ) + 0.5 - cx;
				const dy = Math.floor( i / cols ) + 0.5 - cy;
				vxx += dx * dx;
				vyy += dy * dy;
				vxy += dx * dy;
			}
			vxx /= m;
			vyy /= m;
			vxy /= m;
			const angle = 0.5 * Math.atan2( 2 * vxy, vxx - vyy );
			const tr = vxx + vyy;
			const det = Math.sqrt(
				Math.max( 0, ( ( vxx - vyy ) / 2 ) ** 2 + vxy * vxy )
			);
			const l1 = tr / 2 + det;
			const l2 = Math.max( 1e-6, tr / 2 - det );
			return {
				plane: c.plane,
				n: m,
				share: m / n,
				cx: cx / cols, // 0..1 of width (the frame's aspect applied later)
				cy: cy / rows,
				rx: ( Math.sqrt( l1 ) * 1.7 ) / cols,
				ry: ( Math.sqrt( l2 ) * 1.7 ) / rows,
				angle,
				rgb: [ r / m, g / m, b / m ],
				light: l / m,
				depth: hasDepth ? d / m : 0.5,
				inside: hasMask ? ins / m : 0,
				edge: e / m,
				// How much of the frame's rim this region holds: a sky, a
				// wall, a floor hug the rim; a subject does not.
				border: border / ( 2 * cols + 2 * rows - 4 ),
				cells: c.cells,
			};
		} )
		.sort( ( a, b ) => b.n - a.n );
	return comps.slice( 0, 14 );
}

/* ------------------------------ the plan ------------------------------ */

/**
 * A composition plan from a motif: masses from the regions, roles by
 * size and subject, focal spot, direction, bands and lines.
 */
export function planFromMotif( motif, aspect, rng, signature = null ) {
	const comps = motif.comps;
	const masses = [];
	// The background: the biggest region that hugs the border.
	const bg = comps.find( ( c ) => c.border > 0.25 && c.share > 0.12 ) || null;
	const subject = motif.hasMask
		? comps
				.filter( ( c ) => c !== bg )
				.sort( ( a, b ) => b.inside * b.n - a.inside * a.n )[ 0 ] ||
		  null
		: null;
	const sats = comps
		.filter( ( c ) => c !== bg )
		.sort( ( a, b ) => hueSat( b.rgb ).s * b.n - hueSat( a.rgb ).s * a.n );
	const accent =
		subject && subject.inside > 0.3 ? subject : sats[ 0 ] || null;
	let rank = 0;
	for ( const c of comps ) {
		let role;
		if ( c === bg ) {
			role = 'counter';
		} else if ( c === accent ) {
			role = 'accent';
		} else if ( 0 === rank ) {
			role = 'dominant';
			rank++;
		} else if ( rank < 3 ) {
			role = 'secondary';
			rank++;
		} else {
			role = 'counter';
		}
		masses.push( {
			cx: c.cx * aspect,
			cy: c.cy,
			rx: Math.max( 0.04, Math.min( aspect, c.rx * aspect ) ),
			ry: Math.max( 0.04, Math.min( 1, c.ry ) ),
			angle: c.angle,
			shape: c.edge > 0.35 ? 'hard' : 'soft',
			value: c.light,
			role,
			motifRgb: c.rgb,
			depth: c.depth,
			subject: c === subject,
			bg: c === bg,
		} );
	}
	if ( ! masses.length ) {
		masses.push( {
			cx: aspect / 2,
			cy: 0.5,
			rx: aspect * 0.35,
			ry: 0.35,
			angle: 0,
			shape: 'soft',
			value: motif.meanLight,
			role: 'dominant',
			motifRgb: [ 0.5, 0.5, 0.5 ],
			depth: 0.5,
		} );
	}
	const sig = signature || {};
	const cov = 0.9 * ( sig.coverage || 1 );
	const vk =
		motif.meanLight < 0.38
			? 'low'
			: motif.meanLight > 0.66
			? 'high'
			: 'mid';
	return {
		archetype: 'motif',
		aspect,
		valueKey: vk,
		masses,
		focal: { x: motif.focal.x, y: motif.focal.y },
		direction: motif.direction,
		margin: 0.03 + rng() * 0.04,
		bleed: true,
		coverage: Math.max( 0.5, Math.min( 1, cov ) ),
		lines: motif.lines.map( ( l ) => ( {
			x: l.x,
			y: l.y,
			angle: l.angle,
			strength: l.strength,
		} ) ),
		bands: motif.bands.map( ( b ) => ( {
			y0: b.y0,
			y1: b.y1,
			value: b.value,
		} ) ),
		cells: [],
		pole:
			motif.coherence < 0.2
				? { x: motif.focal.x, y: motif.focal.y }
				: null,
	};
}

/** The motif's own colors as a palette list (hex), biggest planes first. */
export function paletteFromMotif( motif, max = 7 ) {
	return motif.planes
		.slice()
		.sort( ( a, b ) => b.count - a.count )
		.slice( 0, max )
		.map( ( p ) => toHex( p.rgb ) );
}

/**
 * Bend a picture's colors toward a school's taste: vivid schools push
 * saturation, muted ones pull it, ink and mono keep only the values.
 */
export function adaptPalette( hexes, mode ) {
	const list = hexes.map( hexRgb ).filter( Boolean );
	const satMul = {
		vivid: 1.5,
		pure: 1.4,
		primaries: 1.45,
		luminous: 1.2,
		highkey: 0.9,
		muted: 0.65,
		earth: 0.75,
		optical: 1,
		ink: 0,
		mono: 0,
	}[ mode ];
	const out = list.map( ( c ) => {
		const l = lum( c );
		if ( 0 === satMul ) {
			return [ l, l, l ];
		}
		const k = satMul === undefined ? 1 : satMul;
		const gray = [ l, l, l ];
		return [ 0, 1, 2 ].map( ( i ) =>
			clamp01( gray[ i ] + ( c[ i ] - gray[ i ] ) * k )
		);
	} );
	if ( 'highkey' === mode ) {
		return out.map( ( c ) =>
			toHex( c.map( ( v ) => clamp01( v * 0.85 + 0.15 ) ) )
		);
	}
	return out.map( toHex );
}

/* ------------------------------ line art ------------------------------ */

/**
 * The motif's edges as lines: from the strongest edge cells, follow the
 * structure direction while the edge holds - a line drawing of the
 * picture at the grid's resolution, for an underdrawing or a woodcut.
 *
 * @param {Object} motif   The maps.
 * @param {Object} [o]     { max: lines, minLen: cells, threshold }.
 * @return {Array} Polylines of [x, y] in frame units.
 */
export function traceEdges( motif, o = {} ) {
	const max = o.max || 60;
	const minLen = o.minLen || 4;
	const threshold = o.threshold === undefined ? 0.3 : o.threshold;
	const { cols, rows, edge, dir, aspect } = motif;
	const used = new Uint8Array( cols * rows );
	const lines = [];
	const order = Array.from( { length: cols * rows }, ( _, i ) => i )
		.filter( ( i ) => edge[ i ] >= threshold )
		.sort( ( a, b ) => edge[ b ] - edge[ a ] );
	const step = ( x, y, ang, sign ) => [
		x + Math.cos( ang ) * sign,
		y + Math.sin( ang ) * sign,
	];
	for ( const start of order ) {
		if ( used[ start ] || lines.length >= max ) {
			continue;
		}
		const sx = ( start % cols ) + 0.5;
		const sy = Math.floor( start / cols ) + 0.5;
		const walk = ( sign ) => {
			const pts = [];
			let x = sx;
			let y = sy;
			let ang = dir[ start ];
			for ( let k = 0; k < 40; k++ ) {
				const cx = Math.floor( x );
				const cy = Math.floor( y );
				if ( cx < 0 || cy < 0 || cx >= cols || cy >= rows ) {
					break;
				}
				const i = cy * cols + cx;
				if ( edge[ i ] < threshold * 0.6 || ( used[ i ] && k > 0 ) ) {
					break;
				}
				used[ i ] = 1;
				pts.push( [ ( x / cols ) * aspect, y / rows ] );
				// Keep the heading continuous: the tensor angle is only
				// defined modulo pi, so pick the half that continues.
				let a = dir[ i ];
				const d = Math.atan2(
					Math.sin( a - ang ),
					Math.cos( a - ang )
				);
				if ( Math.abs( d ) > Math.PI / 2 ) {
					a += Math.PI;
				}
				ang = a;
				[ x, y ] = step( x, y, ang, sign );
			}
			return pts;
		};
		const fwd = walk( 1 );
		used[ start ] = 0;
		const back = walk( -1 );
		const line = back.reverse().concat( fwd.slice( 1 ) );
		if ( line.length >= minLen ) {
			lines.push( line );
		}
	}
	return lines;
}

/**
 * The planes as a small picture: each cell in its plane's color. Drawn
 * scaled up with smoothing it is a soft poster of the motif.
 */
export function posterPixels( motif ) {
	const { cols, rows, rgb } = motif;
	const data = new Uint8ClampedArray( cols * rows * 4 );
	for ( let i = 0; i < cols * rows; i++ ) {
		data[ i * 4 ] = Math.round( clamp01( rgb[ i * 3 ] ) * 255 );
		data[ i * 4 + 1 ] = Math.round( clamp01( rgb[ i * 3 + 1 ] ) * 255 );
		data[ i * 4 + 2 ] = Math.round( clamp01( rgb[ i * 3 + 2 ] ) * 255 );
		data[ i * 4 + 3 ] = 255;
	}
	return { data, width: cols, height: rows };
}

/**
 * The letters of a text as a soft base: inside cells in one color at
 * a given strength, outside transparent. Drawn under the marks, the
 * word reads before the first mark and through all of them.
 */
export function textBasePixels( motif, rgb, strength = 0.35 ) {
	const { cols, rows, inside } = motif;
	const data = new Uint8ClampedArray( cols * rows * 4 );
	for ( let i = 0; i < cols * rows; i++ ) {
		data[ i * 4 ] = Math.round( clamp01( rgb[ 0 ] ) * 255 );
		data[ i * 4 + 1 ] = Math.round( clamp01( rgb[ 1 ] ) * 255 );
		data[ i * 4 + 2 ] = Math.round( clamp01( rgb[ 2 ] ) * 255 );
		data[ i * 4 + 3 ] = Math.round(
			clamp01( inside[ i ] * strength ) * 255
		);
	}
	return { data, width: cols, height: rows };
}

/* --------------------------- readers for actors --------------------------- */

/** Cell index at a frame point. */
export function cellAt( motif, x, y ) {
	const cx = Math.max(
		0,
		Math.min(
			motif.cols - 1,
			Math.floor( ( x / motif.aspect ) * motif.cols )
		)
	);
	const cy = Math.max(
		0,
		Math.min( motif.rows - 1, Math.floor( y * motif.rows ) )
	);
	return cy * motif.cols + cx;
}

export function cellCentre( motif, i ) {
	return [
		( ( ( i % motif.cols ) + 0.5 ) / motif.cols ) * motif.aspect,
		( Math.floor( i / motif.cols ) + 0.5 ) / motif.rows,
	];
}

export function rgbAt( motif, x, y ) {
	const i = cellAt( motif, x, y );
	return [
		motif.rgb[ i * 3 ],
		motif.rgb[ i * 3 + 1 ],
		motif.rgb[ i * 3 + 2 ],
	];
}

/* --------------------------- canvas helpers --------------------------- */

/**
 * Pixels of a canvas-like source, scaled down so the read stays cheap.
 *
 * @param {Function} createCanvas (w, h) -> canvas.
 * @param {*}        image        Anything drawImage accepts.
 * @param {number}   [edge]       Longest side of the read (px).
 * @return {Object} { data, width, height }.
 */
export function pixelsOf( createCanvas, image, edge = 384 ) {
	const iw = image.naturalWidth || image.width;
	const ih = image.naturalHeight || image.height;
	const k = Math.min( 1, edge / Math.max( iw, ih ) );
	const w = Math.max( 2, Math.round( iw * k ) );
	const h = Math.max( 2, Math.round( ih * k ) );
	const c = createCanvas( w, h );
	const g = c.getContext( '2d' );
	g.drawImage( image, 0, 0, w, h );
	const img = g.getImageData( 0, 0, w, h );
	return { data: img.data, width: w, height: h };
}

/**
 * A text as a picture: white letters on black, fitted to the frame.
 *
 * @param {Function} createCanvas (w, h) -> canvas.
 * @param {string}   text         Lines separated by newlines.
 * @param {string}   font         A CSS font family.
 * @param {number}   aspect       Frame aspect.
 * @param {number}   [h]          Canvas height (px).
 * @return {Object} { data, width, height, canvas }.
 */
export function renderText( createCanvas, text, font, aspect, h = 400 ) {
	const w = Math.max( 2, Math.round( h * aspect ) );
	const c = createCanvas( w, h );
	const g = c.getContext( '2d' );
	g.fillStyle = '#000';
	g.fillRect( 0, 0, w, h );
	const lines = String( text || '' )
		.split( /\n/ )
		.map( ( s ) => s.trim() )
		.filter( Boolean );
	if ( ! lines.length ) {
		const img = g.getImageData( 0, 0, w, h );
		return { data: img.data, width: w, height: h, canvas: c };
	}
	g.fillStyle = '#fff';
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	const family = font || 'sans-serif';
	// Fit: the widest line takes 84 % of the width, the block 80 % of the height.
	let size = ( h * 0.8 ) / lines.length / 1.15;
	g.font = `bold ${ size }px ${ family }`;
	const widest = Math.max(
		...lines.map( ( s ) => g.measureText( s ).width )
	);
	if ( widest > w * 0.84 ) {
		size *= ( w * 0.84 ) / widest;
		g.font = `bold ${ size }px ${ family }`;
	}
	const lh = size * 1.15;
	const y0 = h / 2 - ( lh * ( lines.length - 1 ) ) / 2;
	lines.forEach( ( s, i ) => g.fillText( s, w / 2, y0 + i * lh ) );
	const img = g.getImageData( 0, 0, w, h );
	return { data: img.data, width: w, height: h, canvas: c };
}

export { TAU as MOTIF_TAU };
