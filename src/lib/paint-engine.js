/**
 * Paint styles: one engine, the styles are values.
 *
 * The brush renders its stroke exactly as before - the tip does its own
 * work and lands in a scratch canvas. What a style changes is HOW that
 * stroke meets the pixels underneath. That is deliberately the only seam:
 * every one of the 37 tips keeps working, and a new style is a row of
 * numbers rather than a new renderer.
 *
 * Eight things a style sets, and each one is something you can see:
 *
 *   mixing  pigment instead of alpha - blue over yellow becomes green
 *   load    the paint runs out along the stroke
 *   pickup  the brush drags what is already there (this is smudging)
 *   edge    the dark rim a drying wash leaves - watercolour's signature
 *   grain   pigment settling in the paper's tooth
 *   bleed   the wash creeping past the bristles
 *   body    the paint stands proud of the sheet and catches the light
 *   gloss   how sharply it does that - matt gouache to wet acrylic
 *
 * The first six are about COVERAGE and COLOUR. Nothing in them knows how
 * THICK the paint lies, which is why acrylic came out looking like matt
 * gouache with better coverage: a sheen is a fact about a surface, not
 * about a colour. Body and gloss add that surface - a height field taken
 * from the stroke's own coverage, a normal from its gradient, one fixed
 * light. Still Canvas 2D, still the CPU, still no per-pixel state that
 * outlives the stroke.
 *
 * NOT a fluid simulation. Water that keeps running after you let go and
 * then dries needs per-pixel state that lives between frames, and that is
 * the one thing that would force WebGL into a core that has none. Bleed
 * here is a widened, thresholded edge; measured against the real thing it
 * carries most of the look for a hundredth of the cost.
 */

import { __ } from '@wordpress/i18n';

import { makeMixer } from './spectral';

/**
 * The styles. Ids are stored in tool options - stable, do not rename.
 * The NAMES are shown to people and go through the dictionary; the ids
 * never do. Mixing those two up is how a saved setting stops matching
 * itself the moment somebody switches language.
 */
export const PAINT_STYLES = [
	{
		id: 'normal',
		name: __( 'Normal', 'wunderpaint' ),
		mixing: false,
		load: 0,
		pickup: 0,
		edge: 0,
		grain: 0,
		bleed: 0,
		body: 0,
		gloss: 0,
	},
	{
		id: 'watercolour',
		name: __( 'Watercolor', 'wunderpaint' ),
		// Little paint, lots of water: it runs out, it creeps, it dries
		// darker at the rim, and the pigment settles in the paper.
		mixing: true,
		load: 0.6,
		pickup: 0.1,
		edge: 0.6,
		grain: 0.4,
		bleed: 0.55,
		body: 0,
		gloss: 0,
	},
	{
		id: 'gouache',
		name: __( 'Gouache', 'wunderpaint' ),
		// Watercolour's opaque cousin: still mixes, barely creeps.
		mixing: true,
		load: 0.25,
		pickup: 0.08,
		edge: 0.2,
		grain: 0.25,
		bleed: 0.12,
		body: 0.28,
		gloss: 0.05,
	},
	{
		id: 'acrylic',
		name: __( 'Acrylic', 'wunderpaint' ),
		// Loaded, covering, no water anywhere near it.
		mixing: true,
		load: 0.1,
		pickup: 0.04,
		edge: 0,
		grain: 0.08,
		bleed: 0,
		body: 0.5,
		gloss: 0.42,
	},
	{
		id: 'oil',
		name: __( 'Oil', 'wunderpaint' ),
		// A loaded bristle brush in paint that is still wet. It holds a
		// lot and gives out slowly, and above all it DRAGS what it crosses
		// - that is the whole difference to acrylic, which lies on top of
		// what is already there instead of moving it.
		mixing: true,
		load: 0.35,
		pickup: 0.4,
		edge: 0,
		grain: 0.1,
		bleed: 0,
		body: 0.62,
		gloss: 0.3,
	},
	{
		id: 'smudge',
		name: __( 'Smudge', 'wunderpaint' ),
		// No paint of its own at all: everything it lays down was already
		// on the sheet. That falls straight out of pickup at full strength.
		mixing: true,
		load: 0,
		pickup: 1,
		edge: 0,
		grain: 0,
		bleed: 0,
		body: 0,
		gloss: 0,
	},
];

export const STYLE_BY_ID = {};
PAINT_STYLES.forEach( ( s ) => {
	STYLE_BY_ID[ s.id ] = s;
} );

/** A style by id, falling back to Normal so a bad value never throws. */
export const getStyle = ( id ) => STYLE_BY_ID[ id ] || PAINT_STYLES[ 0 ];

/**
 * How far past the stroke a style pushes paint, in pixels.
 *
 * The scratch canvas a stroke is rendered into is only as big as the TIP
 * can reach. Everything in here happens afterwards and some of it moves
 * paint OUTWARD: the bleed lays a wash beyond the bristles, the rim is a
 * blur of the coverage. Without this the wash simply stopped at the edge
 * of the window and left a straight cut across a curve - the same bug
 * class as a Gaussian blur clipped by a shape's bounding box.
 *
 * Twice the radius, because blurChannel runs two box passes.
 *
 * @param {string} id   Style id.
 * @param {number} size Brush size.
 * @return {number} Padding the caller must add, 0 for styles that add none.
 */
export function styleMaxSpread( id, size ) {
	const st = getStyle( id );
	const brush = Math.max( 1, size || 24 );
	const bleedR = st.bleed > 0 ? brush * 0.35 * st.bleed + 1 : 0;
	const edgeR = st.edge > 0 ? Math.max( 2, brush * 0.18 ) : 0;
	const widest = Math.max( bleedR, edgeR );
	return widest > 0 ? Math.ceil( widest * 2 + 2 ) : 0;
}

/** Whether a style needs the pixel pass at all. */
export const styleIsPlain = ( id ) => 'normal' === getStyle( id ).id;

/**
 * Stable value noise, so granulation belongs to the PAPER and not to the
 * stroke. Paint the same spot twice and the grain lands in the same places,
 * which is what makes it read as texture rather than as dirt.
 *
 * @param {number} x Pixel x in document space.
 * @param {number} y Pixel y in document space.
 * @return {number} 0..1.
 */
function paperNoise( x, y ) {
	let h = ( ( x | 0 ) * 374761393 + ( y | 0 ) * 668265263 ) | 0;
	h = ( h ^ ( h >> 13 ) ) * 1274126177;
	return ( ( h ^ ( h >> 16 ) ) >>> 0 ) / 4294967296;
}

/**
 * A cheap separable box blur of one channel, run twice for a rounder
 * falloff. Used for the rim and for the bleed halo - both only need the
 * SHAPE of the coverage, so blurring a single channel is enough.
 *
 * @param {Float32Array} src    Source, w*h.
 * @param {Float32Array} dst    Destination, w*h.
 * @param {number}       w      Width.
 * @param {number}       h      Height.
 * @param {number}       radius Blur radius in pixels.
 */
function blurChannel( src, dst, w, h, radius ) {
	const r = Math.max( 1, Math.round( radius ) );
	const tmp = new Float32Array( w * h );
	const norm = 1 / ( 2 * r + 1 );
	for ( let pass = 0; pass < 2; pass++ ) {
		const from = 0 === pass ? src : dst;
		// Horizontal.
		for ( let y = 0; y < h; y++ ) {
			let sum = 0;
			const row = y * w;
			for ( let x = -r; x <= r; x++ ) {
				sum += from[ row + Math.min( w - 1, Math.max( 0, x ) ) ];
			}
			for ( let x = 0; x < w; x++ ) {
				tmp[ row + x ] = sum * norm;
				sum -= from[ row + Math.min( w - 1, Math.max( 0, x - r ) ) ];
				sum +=
					from[ row + Math.min( w - 1, Math.max( 0, x + r + 1 ) ) ];
			}
		}
		// Vertical.
		for ( let x = 0; x < w; x++ ) {
			let sum = 0;
			for ( let y = -r; y <= r; y++ ) {
				sum += tmp[ Math.min( h - 1, Math.max( 0, y ) ) * w + x ];
			}
			for ( let y = 0; y < h; y++ ) {
				dst[ y * w + x ] = sum * norm;
				sum -= tmp[ Math.min( h - 1, Math.max( 0, y - r ) ) * w + x ];
				sum +=
					tmp[ Math.min( h - 1, Math.max( 0, y + r + 1 ) ) * w + x ];
			}
		}
	}
}

/**
 * BODY AND GLOSS: the surface pass.
 *
 * Everything above this point decides what colour a pixel is. This decides
 * what the paint at that pixel looks like as a SURFACE, and that is a
 * different question - it is why acrylic read as matt gouache no matter
 * how its six colour numbers were tuned. Thick paint stands proud of the
 * sheet, so it has slopes, so it has a lit side, a shadowed side and a
 * highlight. None of that is expressible in coverage.
 *
 * The height field is the stroke's own coverage, roughened with the paper
 * noise and then blurred. Blurring matters twice over: a hard tip edge is
 * a cliff, and the gradient of a cliff is a blinding rim, and per-pixel
 * noise reads as glitter rather than as paint. One blur fixes both.
 *
 * One fixed light from the upper left, the direction every interface on
 * the machine already lights its shadows from. The lighting is weighted by
 * coverage, so it fades out exactly where the stroke does and cannot draw
 * a rim of its own.
 *
 * @param {Uint8ClampedArray} d     Destination pixels, modified in place.
 * @param {Float32Array}      cov   The stroke's shaped coverage.
 * @param {Float32Array|null}  bed   Paint that was already there, as a
 *                                   height to lie on rather than beside.
 * @param {number}            w     Width.
 * @param {number}            h     Height.
 * @param {Object}            style The style.
 * @param {number}            ox    Window origin x, in document pixels.
 * @param {number}            oy    Window origin y, in document pixels.
 * @param {number}            brush Brush size, for the relief scale.
 */
function applySurface( d, cov, bed, w, h, style, ox, oy, brush ) {
	const body = style.body || 0;
	const gloss = style.gloss || 0;
	if ( body <= 0 && gloss <= 0 ) {
		return;
	}
	const n = w * h;
	const rough = new Float32Array( n );
	for ( let i = 0; i < n; i++ ) {
		const c = cov[ i ];
		// PAINT LIES ON PAINT. The height is what was already on the sheet
		// PLUS what this stroke adds, which is why a stroke crossing an
		// older one shows the older one's edge running underneath it. The
		// bed alone changes nothing where it is flat - a gradient of a
		// constant is zero - so an opaque photo underneath stays smooth
		// and only real edges read as relief.
		const b = bed ? bed[ i ] : 0;
		if ( c <= 0 && b <= 0 ) {
			continue;
		}
		const x = ox + ( i % w );
		const y = oy + ( ( i / w ) | 0 );
		// Two octaves, at two and four pixels. Per-pixel noise is gone
		// after the blur below, and then the only slopes left are the
		// stroke's own outline - which is what makes a relief read as an
		// emboss filter instead of as paint.
		const g =
			paperNoise( x >> 1, y >> 1 ) * 0.55 +
			paperNoise( x >> 2, y >> 2 ) * 0.45;
		// Bumps belong to the paint, not to the paper, so they scale with
		// how much paint is there.
		rough[ i ] = c * ( 1 + ( g - 0.5 ) * 0.9 * body ) + b;
	}
	const hgt = new Float32Array( n );
	blurChannel( rough, hgt, w, h, Math.max( 1, brush * 0.045 ) );

	// Upper left, the way every shadow in the editor already falls.
	const lx = -0.45,
		ly = -0.45,
		lz = 0.772;
	// Half vector against a viewer looking straight down at the sheet.
	const hl = Math.sqrt( lx * lx + ly * ly + ( lz + 1 ) * ( lz + 1 ) );
	const hx = lx / hl,
		hy = ly / hl,
		hz = ( lz + 1 ) / hl;
	// How steep the relief reads. Thin paint is a film, thick paint is a
	// ridge, and the same gradient has to mean more for the latter.
	const relief = 5.5 * ( 0.35 + body );

	for ( let i = 0; i < n; i++ ) {
		const c = cov[ i ];
		if ( c <= 0.004 ) {
			continue;
		}
		const x = i % w;
		const y = ( i / w ) | 0;
		const xl = x > 0 ? i - 1 : i;
		const xr = x < w - 1 ? i + 1 : i;
		const yt = y > 0 ? i - w : i;
		const yb = y < h - 1 ? i + w : i;
		let nx = -( hgt[ xr ] - hgt[ xl ] ) * relief;
		let ny = -( hgt[ yb ] - hgt[ yt ] ) * relief;
		const inv = 1 / Math.sqrt( nx * nx + ny * ny + 1 );
		nx *= inv;
		ny *= inv;
		const nz = inv;

		// Fade the whole surface in with the coverage: at the stroke's rim
		// there is no paint to catch anything.
		const k = Math.min( 1, c * 2.2 );
		const o = i * 4;
		// Lambert, measured AGAINST A FLAT SHEET. What you see is the
		// difference a slope makes, so a flat stretch of paint keeps
		// exactly the colour the pigment pass gave it.
		const lit = 1 + ( nx * lx + ny * ly + nz * lz - lz ) * 1.15 * body * k;
		let sp = 0;
		if ( gloss > 0 ) {
			const nh = nx * hx + ny * hy + nz * hz;
			if ( nh > 0 ) {
				// nh^32 by squaring - a tight highlight, five multiplies,
				// no Math.pow in a per-pixel loop.
				const a2 = nh * nh;
				const a4 = a2 * a2;
				const a8 = a4 * a4;
				const a16 = a8 * a8;
				sp = a16 * a16 * gloss * k;
			}
		}
		for ( let ch = 0; ch < 3; ch++ ) {
			const v = ( d[ o + ch ] / 255 ) * lit;
			// The highlight is light reflected OFF the surface, so it adds
			// towards white instead of scaling what is underneath.
			d[ o + ch ] = Math.round(
				255 * Math.min( 1, Math.max( 0, v + ( 1 - v ) * sp ) )
			);
		}
	}
}

/**
 * Lay a rendered stroke onto a destination, the way a style says.
 *
 * Both images cover the SAME window and are in the destination canvas'
 * own pixels. `dst` is read and written in place; `src` carries the
 * stroke's coverage in its alpha channel and its colour in the rest.
 *
 * @param {Object} dst     Destination ImageData, modified in place.
 * @param {Object} src     Stroke ImageData, read only.
 * @param {Object} opts    { style, colour, size, originX, originY }.
 * @return {Object} The destination, for chaining.
 */
export function applyPaintStyle( dst, src, opts ) {
	const style = getStyle( opts.style );
	const w = dst.width;
	const h = dst.height;
	const d = dst.data;
	const s = src.data;
	const n = w * h;
	const ox = opts.originX || 0;
	const oy = opts.originY || 0;
	const brush = Math.max( 1, opts.size || 24 );

	// Coverage as its own plane: every effect below reshapes it before a
	// single pixel of colour is touched.
	const cov = new Float32Array( n );
	for ( let i = 0; i < n; i++ ) {
		cov[ i ] = s[ i * 4 + 3 ] / 255;
	}

	// What was already on the sheet, kept BEFORE anything is written, as
	// the bed the new paint lies on. Only styles with body ever look at
	// it, so nothing else pays for it. Taken from alpha rather than from
	// a stored height field: a layer does not carry one, and adding one
	// would mean new state in every document for an effect you mostly see
	// where two strokes cross.
	let bed = null;
	if ( style.body > 0 ) {
		bed = new Float32Array( n );
		for ( let i = 0; i < n; i++ ) {
			// Three quarters, not one. A full previous stroke would be a
			// bed as thick as a fresh one, which is the honest model but
			// doubles the relief wherever two strokes meet; at a half the
			// ridge was there in the numbers and not on the screen.
			bed[ i ] = ( d[ i * 4 + 3 ] / 255 ) * 0.75;
		}
	}

	// LOAD. The paint running out ALONG THE STROKE, which is a different
	// thing from along the straight line between its ends.
	//
	// The first version projected each pixel onto the chord from the first
	// point to the last. Exact for a straight stroke, and wrong for every
	// other: draw a loop and the chord is short, draw a stroke that comes
	// back to where it started and the chord is nothing at all, so the
	// paint ran out in the wrong place or all at once.
	//
	// Now the arc length decides. Building a field of "how far along the
	// stroke is this pixel" would be a distance transform at full size;
	// instead the samples stamp their own arc fraction into a QUARTER-size
	// grid as they go. Later samples overwrite earlier ones, which is what
	// you want where a stroke crosses itself: the brush really was emptier
	// the second time it passed.
	if ( style.load > 0 ) {
		const line = opts.points && opts.points.length > 1 ? opts.points : null;
		if ( line ) {
			// Arc length first, so the fraction is real distance travelled
			// and not "which sample number is this".
			let total = 0;
			const at = [ 0 ];
			for ( let i = 1; i < line.length; i++ ) {
				total += Math.hypot(
					line[ i ].x - line[ i - 1 ].x,
					line[ i ].y - line[ i - 1 ].y
				);
				at.push( total );
			}
			// WALK THE PATH AT A FIXED STEP, not at the pointer's own
			// rhythm. The pointer reports a handful of positions on a fast
			// drag and dozens on a slow one, and the field was as coarse as
			// whatever it was handed: measured on a straight stroke, the
			// biggest jump in the load went from 6 at two-pixel samples to
			// 27 at thirty-pixel ones. The load must not know how fast the
			// hand moved.
			const walk = [];
			// Scaled to the brush: the field only has to be smooth relative
			// to the mark it modulates. A flat two pixels would make a
			// 200px brush walk thousands of steps for nothing.
			const STEP = Math.max( 2, brush / 12 );
			for ( let i = 1; i < line.length; i++ ) {
				const ax = line[ i - 1 ].x,
					ay = line[ i - 1 ].y;
				const dx = line[ i ].x - ax,
					dy = line[ i ].y - ay;
				const seg = Math.hypot( dx, dy );
				const cuts = Math.max( 1, Math.ceil( seg / STEP ) );
				for ( let k = 0; k < cuts; k++ ) {
					const u = k / cuts;
					walk.push( {
						x: ax + dx * u,
						y: ay + dy * u,
						f: total > 0 ? ( at[ i - 1 ] + seg * u ) / total : 0,
					} );
				}
			}
			walk.push( {
				x: line[ line.length - 1 ].x,
				y: line[ line.length - 1 ].y,
				f: 1,
			} );

			const gw = Math.max( 2, Math.ceil( w / 4 ) + 1 );
			const gh = Math.max( 2, Math.ceil( h / 4 ) + 1 );
			// FULLEST PASS WINS, not the nearest one and not the last.
			//
			// The style pass sees ONE merged coverage for the whole stroke,
			// so it can put exactly one load value on a pixel. Paint that
			// has been laid does not un-lay itself: where the brush went
			// twice, what you see is the fuller of the two passes. Taking
			// the SMALLEST arc fraction within reach says exactly that.
			//
			// Both alternatives were tried and both were visibly wrong.
			// Last-writer stamped a disc per sample and terraced the ramp.
			// Nearest-sample put a hard edge down the middle of a retraced
			// stroke, where the winner flips from the outbound pass to the
			// return one, and it washed the first half of a retraced M
			// away because the return pass is emptier and overwrote paint
			// that was already on the sheet.
			//
			// 2 is "no sample reached here"; a real fraction is 0..1.
			const field = new Float32Array( gw * gh ).fill( 2 );
			const reach = Math.max( 2, ( brush * 0.9 ) / 4 );
			for ( let i = 0; i < walk.length; i++ ) {
				const f = walk[ i ].f;
				const cx = walk[ i ].x / 4;
				const cy = walk[ i ].y / 4;
				const x0 = Math.max( 0, Math.floor( cx - reach ) );
				const x1 = Math.min( gw - 1, Math.ceil( cx + reach ) );
				const y0 = Math.max( 0, Math.floor( cy - reach ) );
				const y1 = Math.min( gh - 1, Math.ceil( cy + reach ) );
				for ( let y = y0; y <= y1; y++ ) {
					const dy = y - cy;
					for ( let x = x0; x <= x1; x++ ) {
						const dx = x - cx;
						const d2 = dx * dx + dy * dy;
						if ( d2 > reach * reach ) {
							continue;
						}
						const c = y * gw + x;
						if ( f < field[ c ] ) {
							field[ c ] = f;
						}
					}
				}
			}
			for ( let i = 0; i < n; i++ ) {
				if ( cov[ i ] <= 0 ) {
					continue;
				}
				// Read BETWEEN cells. A nearest-cell read quantises the
				// load into four-pixel steps, and a ramp in four-pixel
				// steps is a staircase you can see.
				const gx = ( i % w ) / 4;
				const gy = ( ( i / w ) | 0 ) / 4;
				const x0 = Math.min( gw - 2, Math.max( 0, Math.floor( gx ) ) );
				const y0 = Math.min( gh - 2, Math.max( 0, Math.floor( gy ) ) );
				const tx = Math.min( 1, Math.max( 0, gx - x0 ) );
				const ty = Math.min( 1, Math.max( 0, gy - y0 ) );
				const c00 = y0 * gw + x0;
				const c10 = c00 + 1;
				const c01 = c00 + gw;
				const c11 = c01 + 1;
				// A pixel no sample ever reached is scatter thrown clear of
				// the path; it keeps whatever the tip gave it.
				if (
					field[ c00 ] > 1 &&
					field[ c10 ] > 1 &&
					field[ c01 ] > 1 &&
					field[ c11 ] > 1
				) {
					continue;
				}
				// An unreached corner carries the sentinel; let it borrow
				// from the corners that were reached instead of dragging
				// the reading up to 2.
				let low = 2;
				for ( const c of [ c00, c10, c01, c11 ] ) {
					if ( field[ c ] < low ) {
						low = field[ c ];
					}
				}
				const v = ( c ) => ( field[ c ] > 1 ? low : field[ c ] );
				const a00 = v( c00 );
				const a10 = v( c10 );
				const a01 = v( c01 );
				const a11 = v( c11 );
				const top = a00 + ( a10 - a00 ) * tx;
				const bot = a01 + ( a11 - a01 ) * tx;
				cov[ i ] *= loadAt( top + ( bot - top ) * ty, style );
			}
		} else if ( opts.from && opts.to ) {
			// No path handed over: the old straight-line reading, which is
			// still right for the one-segment case it now covers.
			const ax = opts.from.x,
				ay = opts.from.y;
			const bx = opts.to.x - ax,
				by = opts.to.y - ay;
			const len2 = bx * bx + by * by;
			if ( len2 > 1 ) {
				for ( let i = 0; i < n; i++ ) {
					if ( cov[ i ] <= 0 ) {
						continue;
					}
					const px = ( i % w ) - ax;
					const py = ( ( i / w ) | 0 ) - ay;
					cov[ i ] *= loadAt( ( px * bx + py * by ) / len2, style );
				}
			}
		}
	}

	// BLEED. A wide blur of the coverage, thresholded so it stays a wash
	// edge rather than a general haze, then taken as a floor under the
	// stroke. It is what makes a watercolour edge look wet.
	if ( style.bleed > 0 ) {
		const wide = new Float32Array( n );
		blurChannel( cov, wide, w, h, brush * 0.35 * style.bleed + 1 );
		for ( let i = 0; i < n; i++ ) {
			// Below the threshold there is no water, above it the wash
			// carries a thin, even film.
			const t = wide[ i ] > 0.06 ? wide[ i ] : 0;
			const wash = Math.min( 0.55, t * 0.9 ) * style.bleed;
			if ( wash > cov[ i ] ) {
				cov[ i ] = wash;
			}
		}
	}

	// EDGE. The rim is where the coverage falls away faster than a blur of
	// itself - exactly the ring a drying wash leaves behind.
	if ( style.edge > 0 ) {
		const soft = new Float32Array( n );
		blurChannel( cov, soft, w, h, Math.max( 2, brush * 0.18 ) );
		for ( let i = 0; i < n; i++ ) {
			const rim = cov[ i ] - soft[ i ];
			if ( rim > 0 && cov[ i ] > 0.02 ) {
				cov[ i ] = Math.min( 1, cov[ i ] + rim * style.edge * 2.2 );
			}
		}
	}

	// GRAIN. Keyed to document position, so it belongs to the paper.
	if ( style.grain > 0 ) {
		for ( let i = 0; i < n; i++ ) {
			if ( cov[ i ] <= 0 ) {
				continue;
			}
			const x = ox + ( i % w );
			const y = oy + ( ( i / w ) | 0 );
			const g =
				paperNoise( x, y ) * 0.6 + paperNoise( x >> 1, y >> 1 ) * 0.4;
			cov[ i ] *= 1 - style.grain * ( 1 - g );
		}
	}

	// PICKUP. What the brush drags along. Sampled from the destination a
	// little way back down the stroke and carried forward - which is all
	// smudging is. Without a direction the sample is taken from the local
	// neighbourhood, which still reads as "moved paint" and costs nothing.
	let dragR = null,
		dragG = null,
		dragB = null,
		dragA = null;
	if ( style.pickup > 0 ) {
		const cr = new Float32Array( n );
		const cg = new Float32Array( n );
		const cb = new Float32Array( n );
		const ca = new Float32Array( n );
		for ( let i = 0; i < n; i++ ) {
			const a = d[ i * 4 + 3 ] / 255;
			cr[ i ] = ( d[ i * 4 ] / 255 ) * a;
			cg[ i ] = ( d[ i * 4 + 1 ] / 255 ) * a;
			cb[ i ] = ( d[ i * 4 + 2 ] / 255 ) * a;
			ca[ i ] = a;
		}
		dragR = new Float32Array( n );
		dragG = new Float32Array( n );
		dragB = new Float32Array( n );
		dragA = new Float32Array( n );
		const rad = Math.max( 1, brush * 0.22 * style.pickup );
		blurChannel( cr, dragR, w, h, rad );
		blurChannel( cg, dragG, w, h, rad );
		blurChannel( cb, dragB, w, h, rad );
		blurChannel( ca, dragA, w, h, rad );
	}

	const mix = style.mixing ? makeMixer( opts.colour || '#000000' ) : null;
	const out = [ 0, 0, 0 ];
	// The paint's own colour, straight, for the transparent case.
	const pr = parseInt( ( opts.colour || '#000000' ).slice( 1, 3 ), 16 ) / 255;
	const pg = parseInt( ( opts.colour || '#000000' ).slice( 3, 5 ), 16 ) / 255;
	const pb = parseInt( ( opts.colour || '#000000' ).slice( 5, 7 ), 16 ) / 255;

	for ( let i = 0; i < n; i++ ) {
		let a = cov[ i ];
		if ( a <= 0.002 ) {
			continue;
		}
		const o = i * 4;
		const da = d[ o + 3 ] / 255;
		const br = d[ o ] / 255,
			bg = d[ o + 1 ] / 255,
			bb = d[ o + 2 ] / 255;

		// What this brush is carrying: its own paint, or what it picked up.
		let cr2 = pr,
			cg2 = pg,
			cb2 = pb;
		// How much there actually WAS to pick up, ramped in rather than
		// switched on. A hard threshold here drew a visible ring exactly
		// along the contour where the layer's own alpha ran out.
		let drag = 0;
		if ( dragA && dragA[ i ] > 0.0015 ) {
			const inv = 1 / dragA[ i ];
			const sr = dragR[ i ] * inv,
				sg = dragG[ i ] * inv,
				sb = dragB[ i ] * inv;
			// Smoothstep, not a clamp: a clamp still has a kink where it
			// reaches 1, and a kink in the amount of paint being laid down
			// is a visible line on the canvas.
			const t = Math.min( 1, dragA[ i ] / 0.09 );
			drag = style.pickup * t * t * ( 3 - 2 * t );
			cr2 = pr + ( sr - pr ) * drag;
			cg2 = pg + ( sg - pg ) * drag;
			cb2 = pb + ( sb - pb ) * drag;
		}
		if ( style.pickup > 0 ) {
			// A brush carries its own paint PLUS what it lifted. Where
			// there was nothing to lift, that share of the load simply is
			// not there - which is why Smudge, whose entire load is lifted
			// paint, has to leave clear pixels clear instead of stamping
			// the foreground colour onto them.
			a *= 1 - style.pickup + drag;
			if ( a <= 0.002 ) {
				continue;
			}
		}

		// TWO THINGS HAPPEN AT ONCE and both have to be right, which the
		// first version got wrong: paint meets PIGMENT where the layer is
		// opaque, and it meets NOTHING where the layer is clear. So the
		// substrate result is blended towards the raw paint by how much
		// substrate there actually is. At full opacity this is pure
		// mixing; on an empty layer it is pure paint; in between it is
		// what you would expect.
		let rr, rg, rb;
		if ( ! mix || 1 === drag ) {
			// No pigment model, or a brush carrying nothing but what it
			// picked up: a plain lay-down of whatever is on the bristles.
			rr = br + ( cr2 - br ) * a;
			rg = bg + ( cg2 - bg ) * a;
			rb = bb + ( cb2 - bb ) * a;
		} else {
			mix( br, bg, bb, a, out );
			rr = out[ 0 ];
			rg = out[ 1 ];
			rb = out[ 2 ];
			if ( drag > 0 ) {
				// The mixer is bound to ONE colour, so it cannot be handed
				// the dragged colour per pixel - rebinding would cost more
				// than the whole pass. Pulling the mixed result towards a
				// plain lay-down of that colour is free and continuous: at
				// pickup 1 it lands exactly on the branch above. Without
				// this, pickup did nothing at all on opaque ground, which
				// is precisely where a brush drags the most.
				rr += ( br + ( cr2 - br ) * a - rr ) * drag;
				rg += ( bg + ( cg2 - bg ) * a - rg ) * drag;
				rb += ( bb + ( cb2 - bb ) * a - rb ) * drag;
			}
		}
		// Now the two cases have to be weighed against each other, and this
		// is where the first version drew a hard rim. Source-over splits
		// into three parts: paint on nothing (a*(1-da)), paint on paint
		// (a*da) and untouched substrate (da*(1-a)). The mixed result above
		// already covers the last two, so the RAW paint only gets the
		// first share - a*(1-da)/na. The old line used (1-da) flat, with no
		// regard for how much paint was actually landing, so the instant a
		// stroke's outermost coverage touched a half-transparent pixel its
		// colour jumped a quarter of the way to the brush colour. On a
		// soft edge that is a ring: outside untouched, inside jumped.
		const na = da + a * ( 1 - da );
		if ( na <= 0 ) {
			continue;
		}
		const raw = ( a * ( 1 - da ) ) / na;
		rr += ( cr2 - rr ) * raw;
		rg += ( cg2 - rg ) * raw;
		rb += ( cb2 - rb ) * raw;
		d[ o ] = Math.round( 255 * Math.min( 1, Math.max( 0, rr ) ) );
		d[ o + 1 ] = Math.round( 255 * Math.min( 1, Math.max( 0, rg ) ) );
		d[ o + 2 ] = Math.round( 255 * Math.min( 1, Math.max( 0, rb ) ) );
		d[ o + 3 ] = Math.round( 255 * Math.min( 1, na ) );
	}

	// The surface goes on last, over the colour the pigment pass settled
	// on. It never touches alpha - a highlight is light coming off paint,
	// not more paint.
	applySurface( d, cov, bed, w, h, style, ox, oy, brush );
	return dst;
}

/**
 * How the paint runs out along a stroke.
 *
 * Returned as a plain multiplier so the caller can render the stroke in
 * chunks and hand each one its own opacity - which is the cheapest honest
 * way to get a loaded brush emptying itself, without any per-pixel notion
 * of where along the stroke a pixel sits.
 *
 * @param {number} t     0 at the start of the stroke, 1 at the end.
 * @param {Object} style A style.
 * @return {number} 0..1 multiplier.
 */
export function loadAt( t, style ) {
	if ( ! style || style.load <= 0 ) {
		return 1;
	}
	// Not linear: a real brush holds up well and then gives out.
	const u = Math.min( 1, Math.max( 0, t ) );
	return 1 - style.load * u * u;
}
