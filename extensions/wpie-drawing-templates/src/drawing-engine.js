/**
 * Drawing Templates render engine: a photo becomes a printable
 * template - paint by numbers, a coloring page, a connect-the-dots
 * sheet or the classic grid-method drawing aid. Pure module,
 * unit-testable in node-canvas.
 */

/* ------------------------------ shared helpers ---------------------------- */

const makeCanvas = ( like, w, h ) => {
	const c =
		'undefined' !== typeof document
			? document.createElement( 'canvas' )
			: new like.constructor( w, h );
	c.width = w;
	c.height = h;
	return c;
};

export const hexOf = ( p ) =>
	'#' + p.map( ( v ) => v.toString( 16 ).padStart( 2, '0' ) ).join( '' );

function boxBlurRGBA( data, w, h, r ) {
	const tmp = new Float32Array( data.length );
	for ( let y = 0; y < h; y++ ) {
		for ( let x = 0; x < w; x++ ) {
			for ( let c = 0; c < 3; c++ ) {
				let s = 0;
				let n = 0;
				for ( let k = -r; k <= r; k++ ) {
					const xx = Math.min( w - 1, Math.max( 0, x + k ) );
					s += data[ ( y * w + xx ) * 4 + c ];
					n++;
				}
				tmp[ ( y * w + x ) * 4 + c ] = s / n;
			}
		}
	}
	for ( let y = 0; y < h; y++ ) {
		for ( let x = 0; x < w; x++ ) {
			for ( let c = 0; c < 3; c++ ) {
				let s = 0;
				let n = 0;
				for ( let k = -r; k <= r; k++ ) {
					const yy = Math.min( h - 1, Math.max( 0, y + k ) );
					s += tmp[ ( yy * w + x ) * 4 + c ];
					n++;
				}
				data[ ( y * w + x ) * 4 + c ] = s / n;
			}
		}
	}
}

function medianCut( pixels, n ) {
	const boxes = [ pixels ];
	const spread = ( box ) => {
		let s = 0;
		for ( let c = 0; c < 3; c++ ) {
			let lo = 255;
			let hi = 0;
			for ( const p of box ) {
				if ( p[ c ] < lo ) {
					lo = p[ c ];
				}
				if ( p[ c ] > hi ) {
					hi = p[ c ];
				}
			}
			s = Math.max( s, hi - lo );
		}
		return s * Math.log( box.length + 1 );
	};
	while ( boxes.length < n ) {
		boxes.sort( ( a, b ) => spread( b ) - spread( a ) );
		const box = boxes.shift();
		if ( box.length < 2 ) {
			boxes.push( box );
			break;
		}
		let bc = 0;
		let br = -1;
		for ( let c = 0; c < 3; c++ ) {
			let lo = 255;
			let hi = 0;
			for ( const p of box ) {
				if ( p[ c ] < lo ) {
					lo = p[ c ];
				}
				if ( p[ c ] > hi ) {
					hi = p[ c ];
				}
			}
			if ( hi - lo > br ) {
				br = hi - lo;
				bc = c;
			}
		}
		box.sort( ( a, b ) => a[ bc ] - b[ bc ] );
		const mid = box.length >> 1;
		boxes.push( box.slice( 0, mid ), box.slice( mid ) );
	}
	return boxes.map( ( box ) => {
		const s = [ 0, 0, 0 ];
		for ( const p of box ) {
			s[ 0 ] += p[ 0 ];
			s[ 1 ] += p[ 1 ];
			s[ 2 ] += p[ 2 ];
		}
		return s.map( ( v ) => Math.round( v / box.length ) );
	} );
}

const nearestIdx = ( pal, r, g, b ) => {
	let bi = 0;
	let bd = Infinity;
	for ( let i = 0; i < pal.length; i++ ) {
		const q = pal[ i ];
		const d =
			( q[ 0 ] - r ) ** 2 * 0.55 +
			( q[ 1 ] - g ) ** 2 +
			( q[ 2 ] - b ) ** 2 * 0.45;
		if ( d < bd ) {
			bd = d;
			bi = i;
		}
	}
	return bi;
};

const lumaOf = ( data, i ) =>
	0.299 * data[ i * 4 ] +
	0.587 * data[ i * 4 + 1 ] +
	0.114 * data[ i * 4 + 2 ];

/* ------------------------------- modes list ------------------------------- */

export const MODES = [
	{ id: 'paintbynumbers', label: 'Paint by numbers' },
	{ id: 'coloring', label: 'Coloring page' },
	{ id: 'tracing', label: 'Tracing sheet' },
	{ id: 'dots', label: 'Connect the dots' },
	{ id: 'symmetry', label: 'Symmetry drawing' },
	{ id: 'grid', label: 'Grid drawing aid' },
];

/* ---------------------------- paint by numbers ---------------------------- */

/**
 * Photo to a paint-by-numbers sheet: flattened color regions, thin
 * contours, a number in every paintable region, numbered legend.
 *
 * @param {HTMLCanvasElement} source Source canvas (any size).
 * @param {Object}            opts   { colors (8..20), smooth (1..3),
 *                                     fixedPalette ([ [r,g,b], ... ]:
 *                                     paint with exactly these colors) }.
 * @return {Object} { canvas, palette, regions }
 */
export function paintByNumbers( source, opts = {} ) {
	const colors = Math.max( 6, Math.min( 20, opts.colors || 14 ) );
	const smooth = Math.max( 1, Math.min( 3, opts.smooth || 2 ) );
	const W = 400;
	const H = Math.round( ( W * source.height ) / source.width );
	const work = makeCanvas( source, W, H );
	const g = work.getContext( '2d' );
	g.drawImage( source, 0, 0, W, H );
	const id = g.getImageData( 0, 0, W, H );
	boxBlurRGBA( id.data, W, H, 2 + smooth );
	boxBlurRGBA( id.data, W, H, smooth );

	const pix = [];
	for ( let i = 0; i < W * H; i += 3 ) {
		pix.push( [
			id.data[ i * 4 ],
			id.data[ i * 4 + 1 ],
			id.data[ i * 4 + 2 ],
		] );
	}
	const palette =
		opts.fixedPalette && opts.fixedPalette.length >= 2
			? opts.fixedPalette.map( ( p ) => p.slice() )
			: medianCut( pix, colors );
	let lab = new Int32Array( W * H );
	for ( let i = 0; i < W * H; i++ ) {
		lab[ i ] = nearestIdx(
			palette,
			id.data[ i * 4 ],
			id.data[ i * 4 + 1 ],
			id.data[ i * 4 + 2 ]
		);
	}
	// Mode filter melts label noise into painterly patches.
	const R = 1 + smooth;
	for ( let pass = 0; pass < 2; pass++ ) {
		const out = new Int32Array( W * H );
		const cnt = new Int32Array( palette.length );
		for ( let y = 0; y < H; y++ ) {
			for ( let x = 0; x < W; x++ ) {
				cnt.fill( 0 );
				for ( let dy = -R; dy <= R; dy++ ) {
					for ( let dx = -R; dx <= R; dx++ ) {
						const xx = Math.min( W - 1, Math.max( 0, x + dx ) );
						const yy = Math.min( H - 1, Math.max( 0, y + dy ) );
						cnt[ lab[ yy * W + xx ] ]++;
					}
				}
				let bi = 0;
				let bv = -1;
				for ( let c = 0; c < palette.length; c++ ) {
					if ( cnt[ c ] > bv ) {
						bv = cnt[ c ];
						bi = c;
					}
				}
				out[ y * W + x ] = bi;
			}
		}
		lab = out;
	}

	const label = ( comp, compColor, compArea ) => {
		const stack = new Int32Array( W * H );
		comp.fill( -1 );
		compColor.length = 0;
		compArea.length = 0;
		let n = 0;
		for ( let i = 0; i < W * H; i++ ) {
			if ( comp[ i ] >= 0 ) {
				continue;
			}
			let sp = 0;
			stack[ sp++ ] = i;
			comp[ i ] = n;
			let area = 0;
			while ( sp ) {
				const p = stack[ --sp ];
				area++;
				const x = p % W;
				const y = ( p / W ) | 0;
				const c = lab[ p ];
				if ( x > 0 && comp[ p - 1 ] < 0 && lab[ p - 1 ] === c ) {
					comp[ p - 1 ] = n;
					stack[ sp++ ] = p - 1;
				}
				if ( x < W - 1 && comp[ p + 1 ] < 0 && lab[ p + 1 ] === c ) {
					comp[ p + 1 ] = n;
					stack[ sp++ ] = p + 1;
				}
				if ( y > 0 && comp[ p - W ] < 0 && lab[ p - W ] === c ) {
					comp[ p - W ] = n;
					stack[ sp++ ] = p - W;
				}
				if ( y < H - 1 && comp[ p + W ] < 0 && lab[ p + W ] === c ) {
					comp[ p + W ] = n;
					stack[ sp++ ] = p + W;
				}
			}
			compColor[ n ] = lab[ i ];
			compArea[ n ] = area;
			n++;
		}
		return n;
	};

	const comp = new Int32Array( W * H );
	const compColor = [];
	const compArea = [];
	label( comp, compColor, compArea );
	// Tiny regions adopt a big neighbor - repeated until stable-ish.
	const MIN_AREA = Math.round( ( W * H ) / ( 700 / smooth ) );
	for ( let rounds = 0; rounds < 4; rounds++ ) {
		let changed = false;
		for ( let i = 0; i < W * H; i++ ) {
			if ( compArea[ comp[ i ] ] >= MIN_AREA ) {
				continue;
			}
			const x = i % W;
			const y = ( i / W ) | 0;
			for ( const q of [
				x > 0 ? i - 1 : -1,
				x < W - 1 ? i + 1 : -1,
				y > 0 ? i - W : -1,
				y < H - 1 ? i + W : -1,
			] ) {
				if ( q >= 0 && compArea[ comp[ q ] ] >= MIN_AREA ) {
					lab[ i ] = lab[ q ];
					comp[ i ] = comp[ q ];
					changed = true;
					break;
				}
			}
		}
		if ( ! changed ) {
			break;
		}
	}
	const nComp = label( comp, compColor, compArea );

	// Deepest interior point per region via two-pass chamfer transform.
	const dist = new Int32Array( W * H );
	for ( let i = 0; i < W * H; i++ ) {
		const x = i % W;
		const y = ( i / W ) | 0;
		const border =
			0 === x ||
			0 === y ||
			x === W - 1 ||
			y === H - 1 ||
			comp[ i - 1 ] !== comp[ i ] ||
			comp[ i + 1 ] !== comp[ i ] ||
			comp[ i - W ] !== comp[ i ] ||
			comp[ i + W ] !== comp[ i ];
		dist[ i ] = border ? 1 : 1e7;
	}
	for ( let y = 0; y < H; y++ ) {
		for ( let x = 0; x < W; x++ ) {
			const i = y * W + x;
			if ( x > 0 ) {
				dist[ i ] = Math.min( dist[ i ], dist[ i - 1 ] + 1 );
			}
			if ( y > 0 ) {
				dist[ i ] = Math.min( dist[ i ], dist[ i - W ] + 1 );
			}
		}
	}
	const bestPos = new Int32Array( nComp ).fill( -1 );
	const bestD = new Int32Array( nComp ).fill( -1 );
	for ( let y = H - 1; y >= 0; y-- ) {
		for ( let x = W - 1; x >= 0; x-- ) {
			const i = y * W + x;
			if ( x < W - 1 ) {
				dist[ i ] = Math.min( dist[ i ], dist[ i + 1 ] + 1 );
			}
			if ( y < H - 1 ) {
				dist[ i ] = Math.min( dist[ i ], dist[ i + W ] + 1 );
			}
			const c = comp[ i ];
			if ( dist[ i ] > bestD[ c ] ) {
				bestD[ c ] = dist[ i ];
				bestPos[ c ] = i;
			}
		}
	}

	// Render at 2x: white paper, soft gray contours, numbers.
	const S = 2;
	const c = makeCanvas( source, W * S, H * S );
	const gg = c.getContext( '2d' );
	gg.fillStyle = '#ffffff';
	gg.fillRect( 0, 0, W * S, H * S );
	gg.fillStyle = '#9aa0a8';
	for ( let i = 0; i < W * H; i++ ) {
		const x = i % W;
		const y = ( i / W ) | 0;
		if (
			( x < W - 1 && comp[ i + 1 ] !== comp[ i ] ) ||
			( y < H - 1 && comp[ i + W ] !== comp[ i ] )
		) {
			gg.fillRect( x * S, y * S, S, S );
		}
	}
	gg.textAlign = 'center';
	gg.textBaseline = 'middle';
	let regions = 0;
	for ( let k = 0; k < nComp; k++ ) {
		if ( compArea[ k ] < MIN_AREA || bestPos[ k ] < 0 || bestD[ k ] < 5 ) {
			continue;
		}
		const p = bestPos[ k ];
		const fs = Math.max(
			9,
			Math.min( 24, Math.round( Math.sqrt( compArea[ k ] ) * 0.5 ) )
		);
		gg.font = `600 ${ fs }px sans-serif`;
		gg.fillStyle = '#3a3f46';
		gg.fillText(
			String( compColor[ k ] + 1 ),
			( p % W ) * S,
			( ( p / W ) | 0 ) * S
		);
		regions++;
	}
	return { canvas: c, palette, regions };
}

/**
 * Numbered legend for the paint-by-numbers sheet.
 *
 * @param {CanvasRenderingContext2D} ctx  Target.
 * @param {Array}                    palette Palette.
 * @param {Object}                   opts { x, y, width }.
 * @return {number} Height used.
 */
export function renderNumberLegend( ctx, palette, opts ) {
	const { x = 0, y = 0, width = 600 } = opts;
	const perRow = Math.max( 3, Math.floor( width / 130 ) );
	const rowH = 32;
	const rows = Math.ceil( palette.length / perRow );
	ctx.save();
	ctx.fillStyle = '#ffffff';
	ctx.fillRect( x, y, width, rows * rowH + 12 );
	palette.forEach( ( p, i ) => {
		const lx = x + 10 + ( i % perRow ) * ( ( width - 20 ) / perRow );
		const ly = y + 8 + Math.floor( i / perRow ) * rowH;
		ctx.fillStyle = hexOf( p );
		ctx.fillRect( lx, ly, 22, 22 );
		ctx.strokeStyle = 'rgba(0,0,0,0.35)';
		ctx.strokeRect( lx + 0.5, ly + 0.5, 21, 21 );
		ctx.fillStyle = '#31353b';
		ctx.font = '600 12px sans-serif';
		ctx.textAlign = 'left';
		ctx.textBaseline = 'middle';
		ctx.fillText( String( i + 1 ), lx + 30, ly + 11 );
	} );
	ctx.restore();
	return rows * rowH + 12;
}

/* --------------------------- shared region map ---------------------------- */

/**
 * The shared region pipeline (same family as paint by numbers): blur,
 * median-cut quantization, mode filter, tiny-region merge. Returns a
 * label map whose region borders are closed, smooth outlines - the
 * backbone of the coloring page, the tracing sheet and connect the
 * dots.
 *
 * @param {HTMLCanvasElement} source Source canvas.
 * @param {Object}            opts   { detail (1..3) }.
 * @return {Object} { lab, W, H }
 */
export function regionMap( source, opts = {} ) {
	const detail = Math.max( 1, Math.min( 3, opts.detail || 2 ) );
	const colors = [ 0, 6, 10, 14 ][ detail ];
	const W = 400;
	const H = Math.round( ( W * source.height ) / source.width );
	const work = makeCanvas( source, W, H );
	const g = work.getContext( '2d' );
	g.drawImage( source, 0, 0, W, H );
	const id = g.getImageData( 0, 0, W, H );
	boxBlurRGBA( id.data, W, H, 2 );
	const pix = [];
	for ( let i = 0; i < W * H; i += 2 ) {
		pix.push( [
			id.data[ i * 4 ],
			id.data[ i * 4 + 1 ],
			id.data[ i * 4 + 2 ],
		] );
	}
	const palette = medianCut( pix, colors );
	let lab = new Int32Array( W * H );
	for ( let i = 0; i < W * H; i++ ) {
		lab[ i ] = nearestIdx(
			palette,
			id.data[ i * 4 ],
			id.data[ i * 4 + 1 ],
			id.data[ i * 4 + 2 ]
		);
	}
	// Mode filter melts label noise into clean patches (coarser detail
	// gets a wider filter).
	const R = 4 - detail;
	for ( let pass = 0; pass < 2; pass++ ) {
		const out = new Int32Array( W * H );
		const cnt = new Int32Array( palette.length );
		for ( let y = 0; y < H; y++ ) {
			for ( let x = 0; x < W; x++ ) {
				cnt.fill( 0 );
				for ( let dy = -R; dy <= R; dy++ ) {
					for ( let dx = -R; dx <= R; dx++ ) {
						const xx = Math.min( W - 1, Math.max( 0, x + dx ) );
						const yy = Math.min( H - 1, Math.max( 0, y + dy ) );
						cnt[ lab[ yy * W + xx ] ]++;
					}
				}
				let bi = 0;
				let bv = -1;
				for ( let c = 0; c < palette.length; c++ ) {
					if ( cnt[ c ] > bv ) {
						bv = cnt[ c ];
						bi = c;
					}
				}
				out[ y * W + x ] = bi;
			}
		}
		lab = out;
	}
	return { lab, W, H };
}

// Region-border bitmap renderer shared by coloring page and tracing:
// closed outlines drawn as soft round dabs at 3x scale.
function borderSheet( like, map, { dashed = false, color = '#2a2e34' } = {} ) {
	const { lab, W, H } = map;
	const S = 3;
	const sheet = makeCanvas( like, W * S, H * S );
	const g = sheet.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, sheet.width, sheet.height );
	g.fillStyle = color;
	for ( let y = 0; y < H; y++ ) {
		for ( let x = 0; x < W; x++ ) {
			const i = y * W + x;
			const edge =
				( x < W - 1 && lab[ i ] !== lab[ i + 1 ] ) ||
				( y < H - 1 && lab[ i ] !== lab[ i + W ] );
			if ( ! edge ) {
				continue;
			}
			if ( dashed && ( x + y ) % 12 < 5 ) {
				continue;
			}
			g.beginPath();
			g.arc( x * S + S / 2, y * S + S / 2, S * 0.9, 0, Math.PI * 2 );
			g.fill();
		}
	}
	g.strokeStyle = 'rgba(0,0,0,0.35)';
	g.lineWidth = 2;
	g.strokeRect( 1, 1, sheet.width - 2, sheet.height - 2 );
	return sheet;
}

/* ------------------------------ coloring page ----------------------------- */

/**
 * Coloring page: closed, smooth region outlines from the shared
 * region pipeline (the same family that powers paint by numbers) -
 * real colorable patches instead of noisy edge pixels.
 *
 * @param {HTMLCanvasElement} source Source canvas.
 * @param {Object}            opts   { detail (1..3) }.
 * @return {HTMLCanvasElement}
 */
export function coloringPage( source, opts = {} ) {
	return borderSheet( source, regionMap( source, opts ), {} );
}

/* ----------------------------- connect the dots --------------------------- */

/**
 * Connect the dots: EVERY distinct region becomes its own numbered
 * contour (running numbers across contours, each start marked with a
 * red ring) - multi-part motifs keep all their parts. Optional faint
 * hint lines help younger kids.
 *
 * @param {HTMLCanvasElement} source Source canvas.
 * @param {Object}            opts   { count (20..120), hints (default
 *                                     true), detail (1..3) }.
 * @return {Object} { canvas, dots, contours }
 */
export function connectTheDots( source, opts = {} ) {
	const count = Math.max( 20, Math.min( 120, opts.count || 60 ) );
	const hints = false !== opts.hints;
	const map = regionMap( source, { detail: opts.detail || 2 } );
	const { lab, W, H } = map;
	// Connected components per label; background = touches the frame
	// border heavily or covers most of the image.
	const comp = new Int32Array( W * H ).fill( -1 );
	const comps = [];
	for ( let i = 0; i < W * H; i++ ) {
		if ( comp[ i ] >= 0 ) {
			continue;
		}
		const want = lab[ i ];
		const q = [ i ];
		comp[ i ] = comps.length;
		const cells = [];
		let borderHits = 0;
		while ( q.length ) {
			const cur = q.pop();
			cells.push( cur );
			const x = cur % W;
			const y = ( cur / W ) | 0;
			if ( 0 === x || 0 === y || x === W - 1 || y === H - 1 ) {
				borderHits++;
			}
			for ( const [ dx, dy ] of [
				[ 1, 0 ],
				[ -1, 0 ],
				[ 0, 1 ],
				[ 0, -1 ],
			] ) {
				const nx = x + dx;
				const ny = y + dy;
				const ni = ny * W + nx;
				if (
					nx >= 0 &&
					ny >= 0 &&
					nx < W &&
					ny < H &&
					comp[ ni ] < 0 &&
					lab[ ni ] === want
				) {
					comp[ ni ] = comps.length;
					q.push( ni );
				}
			}
		}
		comps.push( { cells, borderHits } );
	}
	const frame = 2 * ( W + H );
	const objects = comps
		.filter(
			( c ) =>
				c.cells.length > W * H * 0.012 &&
				c.cells.length < W * H * 0.6 &&
				c.borderHits / frame < 0.16
		)
		.sort( ( a, b ) => b.cells.length - a.cells.length )
		.slice( 0, 8 );
	// Boundary walk per object.
	const contours = [];
	for ( const obj of objects ) {
		const set = new Set( obj.cells );
		const boundary = obj.cells.filter( ( i ) => {
			const x = i % W;
			const y = ( i / W ) | 0;
			return [
				[ 1, 0 ],
				[ -1, 0 ],
				[ 0, 1 ],
				[ 0, -1 ],
			].some( ( [ dx, dy ] ) => {
				const nx = x + dx;
				const ny = y + dy;
				return (
					nx < 0 ||
					ny < 0 ||
					nx >= W ||
					ny >= H ||
					! set.has( ny * W + nx )
				);
			} );
		} );
		if ( boundary.length < 16 ) {
			continue;
		}
		const rest = new Set( boundary );
		let cur = boundary[ 0 ];
		const path = [ cur ];
		rest.delete( cur );
		while ( rest.size ) {
			const x = cur % W;
			const y = ( cur / W ) | 0;
			let best = null;
			let bd = Infinity;
			for ( const cand of rest ) {
				const cx = cand % W;
				const cy = ( cand / W ) | 0;
				const dd = ( cx - x ) ** 2 + ( cy - y ) ** 2;
				if ( dd < bd ) {
					bd = dd;
					best = cand;
				}
			}
			if ( bd > 220 ) {
				break;
			}
			path.push( best );
			rest.delete( best );
			cur = best;
		}
		if ( path.length >= 16 ) {
			contours.push( path );
		}
	}
	// Fallback: nothing detected (flat image) - one frame-inset contour.
	const S = 3;
	const c = makeCanvas( source, W * S, H * S );
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, c.width, c.height );
	if ( ! contours.length ) {
		g.strokeStyle = 'rgba(0,0,0,0.35)';
		g.lineWidth = 2;
		g.strokeRect( 1, 1, c.width - 2, c.height - 2 );
		return { canvas: c, dots: 0, contours: 0 };
	}
	const totalLen = contours.reduce( ( s, p ) => s + p.length, 0 );
	let num = 1;
	const placed = [];
	const labelAt = ( x, y ) => {
		// Dodge label collisions: try a ring of offsets, keep 16px apart.
		for ( const [ ox, oy ] of [
			[ 7, -6 ],
			[ -16, -6 ],
			[ 7, 14 ],
			[ -16, 14 ],
			[ 12, 4 ],
			[ -22, 4 ],
			[ 0, -14 ],
			[ 0, 20 ],
		] ) {
			const lx = x + ox;
			const ly = y + oy;
			if (
				placed.every(
					( [ px, py ] ) => ( px - lx ) ** 2 + ( py - ly ) ** 2 > 256
				)
			) {
				placed.push( [ lx, ly ] );
				return [ lx, ly ];
			}
		}
		return null; // too crowded: skip the label, keep the dot
	};
	for ( const path of contours ) {
		const n = Math.max(
			6,
			Math.round( ( count * path.length ) / totalLen )
		);
		const pts = [];
		for ( let k = 0; k < n; k++ ) {
			const i = path[ Math.floor( ( k / n ) * path.length ) ];
			pts.push( [ ( i % W ) * S, ( ( i / W ) | 0 ) * S ] );
		}
		if ( hints ) {
			g.strokeStyle = 'rgba(0,0,0,0.07)';
			g.lineWidth = 1.4;
			g.beginPath();
			pts.forEach( ( [ x, y ], k ) =>
				k ? g.lineTo( x, y ) : g.moveTo( x, y )
			);
			g.closePath();
			g.stroke();
		}
		pts.forEach( ( [ x, y ], k ) => {
			g.fillStyle = '#26292e';
			g.beginPath();
			g.arc( x, y, 0 === k ? 5 : 3.2, 0, Math.PI * 2 );
			g.fill();
			if ( 0 === k ) {
				g.strokeStyle = '#e03131';
				g.lineWidth = 2;
				g.beginPath();
				g.arc( x, y, 9, 0, Math.PI * 2 );
				g.stroke();
			}
			const pos = labelAt( x, y );
			if ( pos ) {
				g.fillStyle = '#31353b';
				g.font = '600 13px sans-serif';
				g.textAlign = 'left';
				g.textBaseline = 'alphabetic';
				g.fillText( String( num ), pos[ 0 ], pos[ 1 ] );
			}
			num++;
		} );
	}
	g.strokeStyle = 'rgba(0,0,0,0.35)';
	g.lineWidth = 2;
	g.strokeRect( 1, 1, c.width - 2, c.height - 2 );
	return { canvas: c, dots: num - 1, contours: contours.length };
}

/* ------------------------------- grid method ------------------------------ */

/**
 * The classic drawing aid: the photo (grayscale) under a labeled grid,
 * next to an empty grid with the same labels for practicing.
 *
 * @param {HTMLCanvasElement} source Source canvas.
 * @param {Object}            opts   { cells (4..16), gridColor (hex,
 *                                     default classic red) }.
 * @return {HTMLCanvasElement}
 */
export function gridSheet( source, opts = {} ) {
	const cells = Math.max( 4, Math.min( 16, opts.cells || 8 ) );
	const W = 360;
	const H = Math.round( ( W * source.height ) / source.width );
	const S = 2;
	const top = 44;
	const c = makeCanvas( source, W * 2 * S + 40, H * S + top + 10 );
	const gg = c.getContext( '2d' );
	gg.fillStyle = '#ffffff';
	gg.fillRect( 0, 0, c.width, c.height );
	// Manual grayscale (ctx.filter is not portable to node-canvas).
	const photo = makeCanvas( source, W, H );
	const pg = photo.getContext( '2d' );
	pg.drawImage( source, 0, 0, W, H );
	const pid = pg.getImageData( 0, 0, W, H );
	for ( let i = 0; i < W * H; i++ ) {
		const l = lumaOf( pid.data, i );
		pid.data[ i * 4 ] = l;
		pid.data[ i * 4 + 1 ] = l;
		pid.data[ i * 4 + 2 ] = l;
	}
	pg.putImageData( pid, 0, 0 );
	gg.drawImage( photo, 0, top, W * S, H * S );

	const cell = ( W * S ) / cells;
	const rows = Math.max( 1, Math.round( ( H * S ) / cell ) );
	const drawGrid = ( ox ) => {
		gg.strokeStyle = opts.gridColor || 'rgba(200,60,60,0.75)';
		gg.lineWidth = 1;
		for ( let i = 0; i <= cells; i++ ) {
			gg.beginPath();
			gg.moveTo( ox + i * cell, top );
			gg.lineTo( ox + i * cell, top + rows * cell );
			gg.stroke();
		}
		for ( let r = 0; r <= rows; r++ ) {
			gg.beginPath();
			gg.moveTo( ox, top + r * cell );
			gg.lineTo( ox + cells * cell, top + r * cell );
			gg.stroke();
		}
		gg.fillStyle = opts.gridColor || '#8a2b2b';
		gg.font = '600 13px sans-serif';
		gg.textAlign = 'center';
		for ( let i = 0; i < cells; i++ ) {
			gg.fillText(
				String.fromCharCode( 65 + i ),
				ox + ( i + 0.5 ) * cell,
				top - 12
			);
		}
		gg.textAlign = 'right';
		for ( let r = 0; r < rows; r++ ) {
			gg.fillText( String( r + 1 ), ox - 6, top + ( r + 0.62 ) * cell );
		}
	};
	drawGrid( 0 );
	drawGrid( W * S + 40 );
	return c;
}

/* ------------------------------ tracing sheet ----------------------------- */

/**
 * Tracing sheet: the same closed region outlines as the coloring
 * page, but DASHED in a light gray - the classic follow-the-dashed-
 * line practice sheet, clearly distinct from the coloring page.
 *
 * @param {HTMLCanvasElement} source Source canvas.
 * @param {Object}            opts   { detail (1..3) }.
 * @return {HTMLCanvasElement}
 */
export function tracingSheet( source, opts = {} ) {
	return borderSheet( source, regionMap( source, opts ), {
		dashed: true,
		color: '#b0b6bf',
	} );
}

/* ---------------------------- symmetry drawing ---------------------------- */

/**
 * Symmetry drawing sheet: one half shows the motif, the other half is
 * an empty grid - complete the picture across the dashed mirror line.
 *
 * @param {HTMLCanvasElement} source Source canvas.
 * @param {Object}            opts   { cells (6..20), side 'right'|'left'
 *                                     (which half stays EMPTY),
 *                                     gridColor (hex) }.
 * @return {HTMLCanvasElement}
 */
export function symmetrySheet( source, opts = {} ) {
	const cells = Math.max( 6, Math.min( 20, opts.cells || 12 ) );
	const emptySide = 'left' === opts.side ? 'left' : 'right';
	const W = 420;
	const H = Math.round( ( W * source.height ) / source.width );
	const S = 2;
	const M = 26;
	const c = makeCanvas( source, W * S + M * 2, H * S + M * 2 );
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, c.width, c.height );
	// The kept half of the motif.
	const halfW = ( W * S ) / 2;
	const sx = 'right' === emptySide ? 0 : source.width / 2;
	const dx = 'right' === emptySide ? M : M + halfW;
	g.drawImage(
		source,
		sx,
		0,
		source.width / 2,
		source.height,
		dx,
		M,
		halfW,
		H * S
	);
	// Light transfer grid over the whole sheet.
	const cell = ( W * S ) / cells;
	const rows = Math.max( 1, Math.round( ( H * S ) / cell ) );
	g.strokeStyle = 'rgba(120,128,140,0.4)';
	g.lineWidth = 1;
	for ( let i = 0; i <= cells; i++ ) {
		g.beginPath();
		g.moveTo( M + i * cell, M );
		g.lineTo( M + i * cell, M + rows * cell );
		g.stroke();
	}
	for ( let r = 0; r <= rows; r++ ) {
		g.beginPath();
		g.moveTo( M, M + r * cell );
		g.lineTo( M + cells * cell, M + r * cell );
		g.stroke();
	}
	// Dashed mirror line in the accent color.
	g.save();
	g.strokeStyle = opts.gridColor || '#e03131';
	g.lineWidth = 2.4;
	g.setLineDash( [ 10, 7 ] );
	g.beginPath();
	g.moveTo( M + halfW, M - 6 );
	g.lineTo( M + halfW, M + rows * cell + 6 );
	g.stroke();
	g.restore();
	// Outer frame.
	g.strokeStyle = 'rgba(0,0,0,0.5)';
	g.lineWidth = 2;
	g.strokeRect( M, M, W * S, rows * cell );
	return c;
}
