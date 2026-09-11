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
	// v2.3: six more sheets on the same pipeline.
	{ id: 'steps', label: 'Step-by-step guide' },
	{ id: 'code', label: 'Color by code' },
	{ id: 'shade', label: 'Shade by numbers' },
	{ id: 'oneline', label: 'One-line drawing' },
	{ id: 'finish', label: 'Finish the drawing' },
	{ id: 'mandala', label: 'Complete the mandala' },
];

/** Small deterministic generator, so a sheet re-renders the same way. */
export function seededRandom( seed ) {
	let x = ( Number( seed ) | 0 || 1 ) >>> 0;
	return () => {
		x = ( Math.imul( x, 1664525 ) + 1013904223 ) >>> 0;
		return x / 4294967296;
	};
}

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
		let fs = Math.max(
			9,
			Math.min( 24, Math.round( Math.sqrt( compArea[ k ] ) * 0.5 ) )
		);
		// v2.3: a label can be a task ("7+2") - shrink it into the region.
		const txt = opts.labelFor
			? String( opts.labelFor( compColor[ k ], k ) )
			: String( compColor[ k ] + 1 );
		gg.font = `600 ${ fs }px sans-serif`;
		while ( fs > 7 && gg.measureText( txt ).width > bestD[ k ] * S * 1.7 ) {
			fs--;
			gg.font = `600 ${ fs }px sans-serif`;
		}
		gg.fillStyle = '#3a3f46';
		gg.fillText( txt, ( p % W ) * S, ( ( p / W ) | 0 ) * S );
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
	const { x = 0, y = 0, width = 600, labels = null } = opts;
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
		ctx.fillText(
			labels && undefined !== labels[ i ]
				? String( labels[ i ] )
				: String( i + 1 ),
			lx + 30,
			ly + 11
		);
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
/**
 * Region borders as soft round dabs onto any context (v2.3: shared by
 * the coloring/tracing sheets, the step guide and the finish sheet).
 *
 * @param {CanvasRenderingContext2D} g    Target.
 * @param {Object}                   map  { lab, W, H } from regionMap.
 * @param {number}                   S    Scale (dab radius follows it).
 * @param {Object}                   o    { ox, oy, color, dashed, alphaAt
 *                                         ( x, y ) => 0..1 | -1 skip }.
 */
function drawBorders( g, map, S, o = {} ) {
	const { lab, W, H } = map;
	const ox = o.ox || 0;
	const oy = o.oy || 0;
	g.save();
	g.fillStyle = o.color || '#2a2e34';
	for ( let y = 0; y < H; y++ ) {
		for ( let x = 0; x < W; x++ ) {
			const i = y * W + x;
			const edge =
				( x < W - 1 && lab[ i ] !== lab[ i + 1 ] ) ||
				( y < H - 1 && lab[ i ] !== lab[ i + W ] );
			if ( ! edge ) {
				continue;
			}
			if ( o.dashed && ( x + y ) % 12 < 5 ) {
				continue;
			}
			if ( o.alphaAt ) {
				const a = o.alphaAt( x, y, i );
				if ( a < 0 ) {
					continue;
				}
				g.globalAlpha = a;
			}
			g.beginPath();
			g.arc(
				ox + x * S + S / 2,
				oy + y * S + S / 2,
				S * 0.9,
				0,
				Math.PI * 2
			);
			g.fill();
		}
	}
	g.restore();
}

function borderSheet( like, map, { dashed = false, color = '#2a2e34' } = {} ) {
	const { W, H } = map;
	const S = 3;
	const sheet = makeCanvas( like, W * S, H * S );
	const g = sheet.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, sheet.width, sheet.height );
	drawBorders( g, map, S, { color, dashed } );
	g.strokeStyle = 'rgba(0,0,0,0.35)';
	g.lineWidth = 2;
	g.strokeRect( 1, 1, sheet.width - 2, sheet.height - 2 );
	return sheet;
}

/**
 * Connected components of a label map, with the share of frame border
 * each one touches - the shared "what is the motif" step (v2.3, lifted
 * out of connect the dots).
 *
 * @param {Object} map { lab, W, H }.
 * @return {Object} { comp: Int32Array, comps: [ { cells, borderHits } ] }
 */
function componentsOf( map ) {
	const { lab, W, H } = map;
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
	return { comp, comps };
}

/** The motif's parts: big enough, not the ground, not hugging the frame. */
function foregroundOf( map, limit = 8, excludeGround = false ) {
	const { lab, W, H } = map;
	const { comp, comps } = componentsOf( map );
	const frame = 2 * ( W + H );
	// The ground: colour classes that own a big share of the frame edge.
	// A wall behind the subject splits into patches that pass the
	// per-component test, so the step guide asks for them to be dropped.
	const ground = new Set();
	if ( excludeGround ) {
		const hits = new Map();
		for ( let x = 0; x < W; x++ ) {
			for ( const i of [ x, ( H - 1 ) * W + x ] ) {
				hits.set( lab[ i ], ( hits.get( lab[ i ] ) || 0 ) + 1 );
			}
		}
		for ( let y = 0; y < H; y++ ) {
			for ( const i of [ y * W, y * W + W - 1 ] ) {
				hits.set( lab[ i ], ( hits.get( lab[ i ] ) || 0 ) + 1 );
			}
		}
		for ( const [ l, n ] of hits ) {
			if ( n / frame > 0.22 ) {
				ground.add( l );
			}
		}
	}
	const objects = comps
		.filter(
			( c ) =>
				c.cells.length > W * H * 0.012 &&
				c.cells.length < W * H * 0.6 &&
				c.borderHits / frame < 0.16 &&
				! ground.has( lab[ c.cells[ 0 ] ] )
		)
		.sort( ( a, b ) => b.cells.length - a.cells.length )
		.slice( 0, limit );
	return { comp, comps, objects };
}

/** Grayscale luma (0..255) of the source at W wide, lightly blurred. */
function lumaAt( source, W, blur = 1 ) {
	const H = Math.round( ( W * source.height ) / source.width );
	const work = makeCanvas( source, W, H );
	const g = work.getContext( '2d' );
	g.drawImage( source, 0, 0, W, H );
	const id = g.getImageData( 0, 0, W, H );
	if ( blur > 0 ) {
		boxBlurRGBA( id.data, W, H, blur );
	}
	const l = new Float32Array( W * H );
	for ( let i = 0; i < W * H; i++ ) {
		l[ i ] = lumaOf( id.data, i );
	}
	return { luma: l, W, H };
}

/** Luma thresholds that split the picture into n equally filled bins. */
function quantileCuts( luma, n ) {
	const sorted = Float32Array.from( luma ).sort();
	const cuts = [];
	for ( let k = 1; k < n; k++ ) {
		cuts.push( sorted[ Math.floor( ( sorted.length * k ) / n ) ] );
	}
	return cuts;
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
	const { W, H } = map;
	// Connected components per label; background = touches the frame
	// border heavily or covers most of the image.
	const { objects } = foregroundOf( map, 8 );
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

/* --------------------------- step-by-step guide --------------------------- */

/** Diagonal hatching dabs over the pixels of one luma band. */
function hatch( g, luma, W, H, S, ox, oy, lo, hi, spacing, cross ) {
	g.beginPath();
	for ( let y = 0; y < H; y++ ) {
		for ( let x = 0; x < W; x++ ) {
			const l = luma[ y * W + x ];
			if ( l < lo || l >= hi ) {
				continue;
			}
			const on =
				( x + y ) % spacing === 0 ||
				( cross && ( x - y + 4096 ) % spacing === 0 );
			if ( ! on ) {
				continue;
			}
			g.rect( ox + x * S, oy + y * S, S, S );
		}
	}
	g.fill();
}

/**
 * Step-by-step drawing guide: the classic "how to draw it in six
 * steps" sheet, computed from the picture. Construction shapes first
 * (best-fit ovals of the motif's parts), then coarse, medium and fine
 * outlines from the shared region pipeline, then hatched shading, and
 * the finished tonal picture last. Four steps skip the middle two.
 *
 * @param {HTMLCanvasElement} source Source canvas.
 * @param {Object}            opts   { steps (4|6), accent (hex) }.
 * @return {Object} { canvas, steps }
 */
export function stepGuide( source, opts = {} ) {
	const steps = 4 === Number( opts.steps ) ? 4 : 6;
	const accent = opts.accent || '#e03131';
	const maps = [ 1, 2, 3 ].map( ( detail ) =>
		regionMap( source, { detail } )
	);
	const { W, H } = maps[ 0 ];
	const { luma } = lumaAt( source, W, 2 );
	const cuts = quantileCuts( luma, 3 );
	// Placement: the subject's parts as ONE smooth silhouette - the mask
	// of the foreground, blurred and cut at half, so wrinkles and holes
	// close up into the big simple shape a tutorial starts with.
	const { objects } = foregroundOf( maps[ 0 ], 6, true );
	let silhouette = null;
	if ( objects.length ) {
		const mask = new Float32Array( W * H );
		for ( const o of objects ) {
			for ( const i of o.cells ) {
				mask[ i ] = 1;
			}
		}
		const r = 7;
		const tmp = new Float32Array( W * H );
		for ( let y = 0; y < H; y++ ) {
			let acc = 0;
			for ( let x = -r; x <= r; x++ ) {
				acc += mask[ y * W + Math.min( W - 1, Math.max( 0, x ) ) ];
			}
			for ( let x = 0; x < W; x++ ) {
				tmp[ y * W + x ] = acc / ( 2 * r + 1 );
				const xo = Math.max( 0, x - r );
				const xi = Math.min( W - 1, x + r + 1 );
				acc += mask[ y * W + xi ] - mask[ y * W + xo ];
			}
		}
		const lab = new Int32Array( W * H );
		for ( let x = 0; x < W; x++ ) {
			let acc = 0;
			for ( let y = -r; y <= r; y++ ) {
				acc += tmp[ Math.min( H - 1, Math.max( 0, y ) ) * W + x ];
			}
			for ( let y = 0; y < H; y++ ) {
				lab[ y * W + x ] = acc / ( 2 * r + 1 ) >= 0.5 ? 1 : 0;
				const yo = Math.max( 0, y - r );
				const yi = Math.min( H - 1, y + r + 1 );
				acc += tmp[ yi * W + x ] - tmp[ yo * W + x ];
			}
		}
		silhouette = { lab, W, H };
	}

	const S = 1.5;
	const pw = Math.round( W * S );
	const ph = Math.round( H * S );
	const landscape = W > H * 1.25;
	const cols = 4 === steps ? 2 : landscape ? 3 : 2;
	const rows = Math.ceil( steps / cols );
	const gap = 22;
	const pad = 18;
	const c = makeCanvas(
		source,
		pad * 2 + cols * pw + ( cols - 1 ) * gap,
		pad * 2 + rows * ph + ( rows - 1 ) * gap
	);
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, c.width, c.height );

	const construction = ( ox, oy, alpha ) => {
		g.save();
		g.globalAlpha = alpha;
		g.strokeStyle = accent;
		g.lineWidth = 1.6;
		g.setLineDash( [ 6, 5 ] );
		// Centre cross: where the middle of the paper is.
		g.beginPath();
		g.moveTo( ox + pw / 2, oy );
		g.lineTo( ox + pw / 2, oy + ph );
		g.moveTo( ox, oy + ph / 2 );
		g.lineTo( ox + pw, oy + ph / 2 );
		g.stroke();
		// Thirds, lighter than the cross.
		g.globalAlpha = alpha * 0.45;
		g.lineWidth = 1;
		g.beginPath();
		for ( const f of [ 1 / 3, 2 / 3 ] ) {
			g.moveTo( ox + pw * f, oy );
			g.lineTo( ox + pw * f, oy + ph );
			g.moveTo( ox, oy + ph * f );
			g.lineTo( ox + pw, oy + ph * f );
		}
		g.stroke();
		g.setLineDash( [] );
		g.globalAlpha = alpha;
		if ( silhouette ) {
			drawBorders( g, silhouette, S, { ox, oy, color: accent } );
		}
		g.restore();
	};
	const shading = ( ox, oy ) => {
		g.save();
		g.fillStyle = 'rgba(40,44,50,0.55)';
		hatch( g, luma, W, H, S, ox, oy, cuts[ 0 ], cuts[ 1 ], 5, false );
		hatch( g, luma, W, H, S, ox, oy, -1, cuts[ 0 ], 3, true );
		g.restore();
	};
	const finished = ( ox, oy ) => {
		// A soft pencil-grey version of the picture: the darkest tone
		// stays a graphite grey, so it reads as a drawing, not a print.
		const img = makeCanvas( source, W, H );
		const ig = img.getContext( '2d' );
		const id = ig.createImageData( W, H );
		for ( let i = 0; i < W * H; i++ ) {
			const v = Math.round( 78 + ( luma[ i ] / 255 ) * 170 );
			id.data[ i * 4 ] = v;
			id.data[ i * 4 + 1 ] = v;
			id.data[ i * 4 + 2 ] = v;
			id.data[ i * 4 + 3 ] = 255;
		}
		ig.putImageData( id, 0, 0 );
		g.drawImage( img, ox, oy, pw, ph );
	};
	const plan = ( () => {
		const outline = ( m, color ) => ( ox, oy ) =>
			drawBorders( g, maps[ m ], S, { ox, oy, color } );
		if ( 4 === steps ) {
			return [
				( ox, oy ) => construction( ox, oy, 0.9 ),
				( ox, oy ) => {
					construction( ox, oy, 0.25 );
					outline( 0, '#7a8089' )( ox, oy );
				},
				outline( 2, '#2a2e34' ),
				( ox, oy ) => {
					outline( 2, '#2a2e34' )( ox, oy );
					shading( ox, oy );
				},
			];
		}
		return [
			( ox, oy ) => construction( ox, oy, 0.9 ),
			( ox, oy ) => {
				construction( ox, oy, 0.25 );
				outline( 0, '#7a8089' )( ox, oy );
			},
			( ox, oy ) => {
				construction( ox, oy, 0.12 );
				outline( 1, '#4d525a' )( ox, oy );
			},
			outline( 2, '#2a2e34' ),
			( ox, oy ) => {
				outline( 2, '#2a2e34' )( ox, oy );
				shading( ox, oy );
			},
			( ox, oy ) => {
				finished( ox, oy );
				drawBorders( g, maps[ 2 ], S, {
					ox,
					oy,
					color: 'rgba(30,33,38,0.6)',
				} );
			},
		];
	} )();
	plan.forEach( ( draw, k ) => {
		const ox = pad + ( k % cols ) * ( pw + gap );
		const oy = pad + Math.floor( k / cols ) * ( ph + gap );
		g.save();
		g.beginPath();
		g.rect( ox, oy, pw, ph );
		g.clip();
		draw( ox, oy );
		g.restore();
		g.strokeStyle = 'rgba(0,0,0,0.35)';
		g.lineWidth = 1.5;
		g.strokeRect( ox + 0.5, oy + 0.5, pw - 1, ph - 1 );
		// Step badge.
		g.fillStyle = accent;
		g.beginPath();
		g.arc( ox + 16, oy + 16, 13, 0, Math.PI * 2 );
		g.fill();
		g.fillStyle = '#ffffff';
		g.font = '700 15px sans-serif';
		g.textAlign = 'center';
		g.textBaseline = 'middle';
		g.fillText( String( k + 1 ), ox + 16, oy + 17 );
	} );
	return { canvas: c, steps };
}

/* ------------------------------ color by code ----------------------------- */

/**
 * The tasks behind a colour-by-code sheet: one target value per colour
 * (distinct, inside the number range) and a fresh task per region that
 * lands on it. Kinds: add, sub, mul, mixed (add or sub), letters.
 *
 * @param {Object} o { kind, range, count, seed }.
 * @return {Object} { targets: [ number|string ], taskFor( colorIdx ) }
 */
export function codeTasks( o = {} ) {
	const kind = [ 'add', 'sub', 'mul', 'mixed', 'letters' ].includes( o.kind )
		? o.kind
		: 'add';
	const range = [ 10, 20, 100 ].includes( Number( o.range ) )
		? Number( o.range )
		: 20;
	const count = Math.max( 2, Math.min( 20, o.count || 8 ) );
	const rnd = seededRandom( o.seed || 1 );
	const shuffle = ( arr ) => {
		for ( let i = arr.length - 1; i > 0; i-- ) {
			const j = Math.floor( rnd() * ( i + 1 ) );
			[ arr[ i ], arr[ j ] ] = [ arr[ j ], arr[ i ] ];
		}
		return arr;
	};
	let targets;
	if ( 'letters' === kind ) {
		targets = Array.from( { length: count }, ( _, i ) =>
			String.fromCharCode( 65 + ( i % 26 ) )
		);
	} else if ( 'mul' === kind ) {
		const pool = new Set();
		for ( let a = 2; a <= 10; a++ ) {
			for ( let b = 2; b <= 10; b++ ) {
				if ( a * b <= range ) {
					pool.add( a * b );
				}
			}
		}
		const list = shuffle( [ ...pool ] );
		while ( list.length < count ) {
			list.push( list[ list.length % Math.max( 1, pool.size ) ] );
		}
		targets = list.slice( 0, count );
	} else {
		// Results that leave room for a real task on both sides.
		const lo = 2;
		const hi = 'add' === kind ? range : range - 1;
		const pool = [];
		for ( let v = lo; v <= hi; v++ ) {
			pool.push( v );
		}
		const list = shuffle( pool );
		while ( list.length < count ) {
			list.push( list[ list.length % pool.length ] );
		}
		targets = list.slice( 0, count );
	}
	const between = ( a, b ) => a + Math.floor( rnd() * ( b - a + 1 ) );
	const taskFor = ( ci ) => {
		const v = targets[ ci % targets.length ];
		if ( 'letters' === kind ) {
			return v;
		}
		let k = kind;
		if ( 'mixed' === k ) {
			k = rnd() < 0.5 ? 'add' : 'sub';
		}
		if ( 'mul' === k ) {
			const pairs = [];
			for ( let a = 2; a <= 10; a++ ) {
				if ( v % a === 0 && v / a >= 2 && v / a <= 10 ) {
					pairs.push( [ a, v / a ] );
				}
			}
			const [ a, b ] = pairs.length
				? pairs[ Math.floor( rnd() * pairs.length ) ]
				: [ 1, v ];
			return a + '×' + b;
		}
		if ( 'sub' === k && v < range ) {
			const r = between( 1, Math.min( 9, range - v ) );
			return v + r + '−' + r;
		}
		const a = between( 1, Math.max( 1, v - 1 ) );
		return a + '+' + ( v - a );
	};
	return { targets, taskFor, kind, range };
}

/**
 * Colour by code: the paint-by-numbers regions, but every region carries
 * a little task whose result names the colour - the school worksheet.
 *
 * @param {HTMLCanvasElement} source Source canvas.
 * @param {Object}            opts   { kind, range, colors (6..12), smooth,
 *                                     seed, fixedPalette }.
 * @return {Object} { canvas, palette, labels }
 */
export function colorByCode( source, opts = {} ) {
	const colors = Math.max( 6, Math.min( 12, opts.colors || 8 ) );
	const tasks = codeTasks( {
		kind: opts.kind,
		range: opts.range,
		count: opts.fixedPalette ? opts.fixedPalette.length : colors,
		seed: opts.seed,
	} );
	const out = paintByNumbers( source, {
		colors,
		smooth: opts.smooth || 3,
		fixedPalette: opts.fixedPalette,
		labelFor: ( ci ) => tasks.taskFor( ci ),
	} );
	return {
		canvas: out.canvas,
		palette: out.palette,
		labels: out.palette.map(
			( _, i ) => tasks.targets[ i % tasks.targets.length ]
		),
	};
}

/* ---------------------------- shade by numbers ---------------------------- */

/**
 * Shade by numbers: the pencil sibling of paint by numbers. The
 * picture's tones are split into a few equally filled bands, every
 * region carries its band number (1 = lightest, stays blank), the
 * legend shows the grey of each band.
 *
 * @param {HTMLCanvasElement} source Source canvas.
 * @param {Object}            opts   { shades (3..5), smooth }.
 * @return {Object} { canvas, palette }
 */
export function shadeByNumbers( source, opts = {} ) {
	const shades = Math.max( 3, Math.min( 5, opts.shades || 4 ) );
	const W = 400;
	const { luma, H } = lumaAt( source, W, 0 );
	const cuts = quantileCuts( luma, shades );
	// Mean luma per band, light to dark, as a fixed grey palette.
	const sums = new Float64Array( shades );
	const n = new Int32Array( shades );
	for ( let i = 0; i < W * H; i++ ) {
		let k = 0;
		while ( k < cuts.length && luma[ i ] >= cuts[ k ] ) {
			k++;
		}
		sums[ k ] += luma[ i ];
		n[ k ]++;
	}
	// Light to dark. A band with no pixels (a flat picture) takes the
	// middle of its tone range, and the ramp never runs backwards.
	const palette = [];
	let prev = 256;
	for ( let k = shades - 1; k >= 0; k-- ) {
		const lo = k > 0 ? cuts[ k - 1 ] : 0;
		const hi = k < cuts.length ? cuts[ k ] : 255;
		let v = Math.round( n[ k ] ? sums[ k ] / n[ k ] : ( lo + hi ) / 2 );
		v = Math.min( v, prev - 1 );
		v = Math.max( 0, v );
		prev = v;
		palette.push( [ v, v, v ] );
	}
	// Grey source so the region pipeline only sees tone.
	const gray = makeCanvas( source, W, H );
	const gg = gray.getContext( '2d' );
	const id = gg.createImageData( W, H );
	for ( let i = 0; i < W * H; i++ ) {
		const v = luma[ i ];
		id.data[ i * 4 ] = v;
		id.data[ i * 4 + 1 ] = v;
		id.data[ i * 4 + 2 ] = v;
		id.data[ i * 4 + 3 ] = 255;
	}
	gg.putImageData( id, 0, 0 );
	const out = paintByNumbers( gray, {
		colors: shades,
		smooth: opts.smooth || 2,
		fixedPalette: palette,
	} );
	return { canvas: out.canvas, palette: out.palette };
}

/* ----------------------------- one-line drawing --------------------------- */

/**
 * One continuous line through the picture: a set of lines (rows, or one
 * spiral from the centre) whose swing and wavelength follow the tone -
 * dark parts make the line swing wide and fast, light parts let it run
 * straight. The single-line portrait, ready to trace from the red start
 * ring to the end dot.
 *
 * @param {HTMLCanvasElement} source Source canvas.
 * @param {Object}            opts   { style 'waves'|'spiral', lines (30..140),
 *                                     weight (1..3), invert }.
 * @return {Object} { canvas, lines }
 */
export function oneLineDrawing( source, opts = {} ) {
	const style = 'spiral' === opts.style ? 'spiral' : 'waves';
	const lines = Math.max( 30, Math.min( 140, opts.lines || 70 ) );
	const weight = Math.max( 1, Math.min( 3, opts.weight || 2 ) );
	const W = 400;
	const { luma, H } = lumaAt( source, W, 1 );
	// Contrast stretch on the tones so a pale photo still swings.
	const cuts = quantileCuts( luma, 50 );
	const lo = cuts[ 1 ];
	const hi = cuts[ 47 ];
	const span = Math.max( 8, hi - lo );
	const invert = !! opts.invert;
	const darkAt = ( x, y ) => {
		if ( x < 0 || y < 0 || x >= W - 1 || y >= H - 1 ) {
			return 0;
		}
		const l = luma[ ( y | 0 ) * W + ( x | 0 ) ];
		let d = Math.min( 1, Math.max( 0, ( l - lo ) / span ) );
		d = invert ? d : 1 - d;
		// A soft toe: faint tones stay a straight line.
		return d < 0.1 ? 0 : Math.pow( ( d - 0.1 ) / 0.9, 1.15 );
	};
	const S = 3;
	const c = makeCanvas( source, W * S, H * S );
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, c.width, c.height );
	g.strokeStyle = '#1f2327';
	g.lineWidth = [ 0, 1.3, 2, 2.9 ][ weight ];
	g.lineJoin = 'round';
	g.lineCap = 'round';
	const pts = [];
	const spacing = ( 'spiral' === style ? Math.min( W, H ) : H ) / lines;
	let phase = 0;
	const step = 0.34; // in map pixels: about one canvas pixel
	const swing = ( d ) => 0.46 * spacing * Math.pow( d, 0.85 );
	const lambda = ( d ) => Math.max( 2.4, 10 - 7.2 * d ); // wavelength
	if ( 'waves' === style ) {
		for ( let r = 0; r < lines; r++ ) {
			const y0 = spacing * ( r + 0.5 );
			const ltr = r % 2 === 0;
			for ( let k = 0; k <= W / step; k++ ) {
				const x = ltr ? k * step : W - k * step;
				const d = darkAt( x, y0 );
				phase += ( 2 * Math.PI * step ) / lambda( d );
				pts.push( [ x, y0 + swing( d ) * Math.sin( phase ) ] );
			}
		}
	} else {
		const cx = W / 2;
		const cy = H / 2;
		const rMax = Math.sqrt( cx * cx + cy * cy ) + spacing;
		const b = spacing / ( 2 * Math.PI ); // radius growth per radian
		let theta = 0;
		let radius = 0;
		while ( radius < rMax ) {
			const d = darkAt(
				cx + radius * Math.cos( theta ),
				cy + radius * Math.sin( theta )
			);
			phase += ( 2 * Math.PI * step ) / lambda( d );
			const rr = radius + swing( d ) * Math.sin( phase );
			pts.push( [
				cx + rr * Math.cos( theta ),
				cy + rr * Math.sin( theta ),
			] );
			// Advance by one step of arc length.
			theta += step / Math.max( 0.6, radius );
			radius = b * theta;
		}
	}
	g.beginPath();
	pts.forEach( ( [ x, y ], k ) =>
		k ? g.lineTo( x * S, y * S ) : g.moveTo( x * S, y * S )
	);
	g.stroke();
	const first = pts[ 0 ];
	const last = pts[ pts.length - 1 ];
	g.strokeStyle = '#e03131';
	g.lineWidth = 2.2;
	g.beginPath();
	g.arc( first[ 0 ] * S, first[ 1 ] * S, 9, 0, Math.PI * 2 );
	g.stroke();
	g.fillStyle = '#1f2327';
	g.beginPath();
	g.arc( last[ 0 ] * S, last[ 1 ] * S, 4, 0, Math.PI * 2 );
	g.fill();
	g.strokeStyle = 'rgba(0,0,0,0.35)';
	g.lineWidth = 2;
	g.strokeRect( 1, 1, c.width - 2, c.height - 2 );
	return { canvas: c, lines };
}

/* ---------------------------- finish the drawing -------------------------- */

/**
 * Finish the drawing: the outlines stop and the child carries on. Either
 * the lines fade out across the sheet (left to right or top to bottom),
 * or whole parts of the motif are missing - the gaps keep faint dotted
 * hints so the drawing knows where to go.
 *
 * @param {HTMLCanvasElement} source Source canvas.
 * @param {Object}            opts   { variant 'fade'|'missing', direction
 *                                     'lr'|'tb', amount (30..70 = share
 *                                     to finish), detail, seed }.
 * @return {Object} { canvas, missing }
 */
export function finishSheet( source, opts = {} ) {
	const variant = 'missing' === opts.variant ? 'missing' : 'fade';
	const amount = Math.max( 30, Math.min( 70, opts.amount || 50 ) ) / 100;
	const map = regionMap( source, { detail: opts.detail || 2 } );
	const { W, H } = map;
	const S = 3;
	const c = makeCanvas( source, W * S, H * S );
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, c.width, c.height );
	let missing = 0;
	const hintAlpha = ( x, y ) => ( ( x + y ) % 5 === 0 ? 0.28 : -1 );
	if ( 'fade' === variant ) {
		const tb = 'tb' === opts.direction;
		const drawn = 1 - amount;
		drawBorders( g, map, S, {
			color: '#2a2e34',
			alphaAt: ( x, y ) => {
				const t = tb ? y / H : x / W;
				if ( t < drawn - 0.06 ) {
					return 1;
				}
				if ( t < drawn + 0.06 ) {
					return 1 - ( ( t - drawn + 0.06 ) / 0.12 ) * 0.75;
				}
				return hintAlpha( x, y );
			},
		} );
	} else {
		const { comp, comps } = componentsOf( map );
		const rnd = seededRandom( opts.seed || 1 );
		const frame = 2 * ( W + H );
		const parts = comps
			.map( ( p, idx ) => ( { ...p, idx } ) )
			.filter(
				( p ) =>
					p.cells.length > W * H * 0.004 &&
					p.cells.length < W * H * 0.5 &&
					p.borderHits / frame < 0.25
			);
		const total = parts.reduce( ( s, p ) => s + p.cells.length, 0 );
		for ( let i = parts.length - 1; i > 0; i-- ) {
			const j = Math.floor( rnd() * ( i + 1 ) );
			[ parts[ i ], parts[ j ] ] = [ parts[ j ], parts[ i ] ];
		}
		const gone = new Set();
		let area = 0;
		for ( const p of parts ) {
			if ( area >= total * amount ) {
				break;
			}
			gone.add( p.idx );
			area += p.cells.length;
		}
		missing = gone.size;
		drawBorders( g, map, S, {
			color: '#2a2e34',
			alphaAt: ( x, y, i ) => {
				const here = comp[ i ];
				const right = x < W - 1 ? comp[ i + 1 ] : here;
				const below = y < H - 1 ? comp[ i + W ] : here;
				if (
					gone.has( here ) ||
					gone.has( right ) ||
					gone.has( below )
				) {
					return hintAlpha( x, y );
				}
				return 1;
			},
		} );
	}
	g.strokeStyle = 'rgba(0,0,0,0.35)';
	g.lineWidth = 2;
	g.strokeRect( 1, 1, c.width - 2, c.height - 2 );
	return { canvas: c, missing };
}

/* --------------------------- complete the mandala ------------------------- */

/**
 * Complete the mandala: the picture fills ONE wedge of a circle, the
 * other wedges show only the guide lines - copy the wedge around. Ghost
 * hints (rotated copies at a whisper) can stay on for younger kids.
 *
 * @param {HTMLCanvasElement} source Source canvas.
 * @param {Object}            opts   { segments (6|8|12), hints, gridColor }.
 * @return {HTMLCanvasElement}
 */
export function mandalaSheet( source, opts = {} ) {
	const N = [ 6, 8, 12 ].includes( Number( opts.segments ) )
		? Number( opts.segments )
		: 8;
	const hints = false !== opts.hints;
	const side = 840;
	const M = 30;
	const R = side / 2 - M;
	const cx = side / 2;
	const cy = side / 2;
	const c = makeCanvas( source, side, side );
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, side, side );
	// Square crop of the picture, centred, covering the circle.
	const sq = Math.min( source.width, source.height );
	const sx = ( source.width - sq ) / 2;
	const sy = ( source.height - sq ) / 2;
	const theta = ( Math.PI * 2 ) / N;
	const a0 = -Math.PI / 2;
	const wedge = ( k, alpha ) => {
		g.save();
		g.translate( cx, cy );
		g.rotate( k * theta );
		g.beginPath();
		g.moveTo( 0, 0 );
		g.arc( 0, 0, R, a0, a0 + theta );
		g.closePath();
		g.clip();
		g.globalAlpha = alpha;
		g.drawImage( source, sx, sy, sq, sq, -R, -R, 2 * R, 2 * R );
		g.restore();
	};
	if ( hints ) {
		for ( let k = 1; k < N; k++ ) {
			wedge( k, 0.09 );
		}
	}
	wedge( 0, 1 );
	// Guides: rings and spokes.
	g.strokeStyle = 'rgba(120,128,140,0.45)';
	g.lineWidth = 1;
	for ( let r = 1; r <= 4; r++ ) {
		g.beginPath();
		g.arc( cx, cy, ( R * r ) / 5, 0, Math.PI * 2 );
		g.stroke();
	}
	for ( let k = 0; k < N; k++ ) {
		const a = a0 + k * theta;
		g.beginPath();
		g.moveTo( cx, cy );
		g.lineTo( cx + R * Math.cos( a ), cy + R * Math.sin( a ) );
		g.stroke();
	}
	// The sample wedge is outlined in the accent colour.
	g.save();
	g.strokeStyle = opts.gridColor || '#e03131';
	g.lineWidth = 2.4;
	g.setLineDash( [ 10, 7 ] );
	g.beginPath();
	g.moveTo( cx, cy );
	g.arc( cx, cy, R, a0, a0 + theta );
	g.closePath();
	g.stroke();
	g.restore();
	g.strokeStyle = 'rgba(0,0,0,0.5)';
	g.lineWidth = 2;
	g.beginPath();
	g.arc( cx, cy, R, 0, Math.PI * 2 );
	g.stroke();
	return c;
}
