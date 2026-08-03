/**
 * Text on a path (v1.156.0): flatten an SVG path once into arc-length
 * segments, then place glyph centers at distances along it with the
 * local tangent angle. Pure math so the layout is unit-testable without
 * a canvas; the renderer feeds measured glyph widths exactly like the
 * circular-arc layout (curvedGlyphLayout) does.
 *
 * The path lives ON the text layer (`layer.textPath = { d, start, flip }`,
 * coordinates relative to the layer box) - copied from the clicked shape,
 * so projects stay self-contained and survive export/import even when the
 * source path layer is deleted later.
 */

const TOKEN_RE = /([MmLlHhVvCcSsQqTtZzAa])|(-?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?)/g;

/**
 * Flatten an SVG path string into polylines (one per subpath). Supports
 * M/L/H/V/C/S/Q/T/Z in both absolute and relative form; elliptical arcs
 * (A) degrade to a straight line to their endpoint (nothing in the
 * editor emits them).
 *
 * @param {string} d    Path data.
 * @param {number} step Approximate sample spacing for curves (px).
 * @return {Array<Array<{x: number, y: number}>>} Subpath polylines.
 */
export function flattenPathD( d, step = 3 ) {
	const tokens = [];
	let m;
	TOKEN_RE.lastIndex = 0;
	while ( ( m = TOKEN_RE.exec( String( d || '' ) ) ) ) {
		tokens.push( m[ 1 ] || parseFloat( m[ 2 ] ) );
	}
	const subs = [];
	let pts = null;
	let cx = 0;
	let cy = 0;
	let sx = 0;
	let sy = 0;
	let prevCtrl = null; // reflected control point for S/T
	let prevCmd = '';
	let i = 0;
	const num = () => tokens[ i++ ];
	const moveTo = ( x, y ) => {
		pts = [ { x, y } ];
		subs.push( pts );
		cx = x;
		cy = y;
		sx = x;
		sy = y;
	};
	const lineTo = ( x, y ) => {
		if ( ! pts ) {
			moveTo( cx, cy );
		}
		pts.push( { x, y } );
		cx = x;
		cy = y;
	};
	const sampleCount = ( approxLen ) =>
		Math.min( 64, Math.max( 4, Math.ceil( approxLen / step ) ) );
	const cubicTo = ( x1, y1, x2, y2, x, y ) => {
		const approx =
			Math.hypot( x1 - cx, y1 - cy ) +
			Math.hypot( x2 - x1, y2 - y1 ) +
			Math.hypot( x - x2, y - y2 );
		const n = sampleCount( approx );
		const ax = cx;
		const ay = cy;
		for ( let k = 1; k <= n; k++ ) {
			const t = k / n;
			const u = 1 - t;
			const px =
				u * u * u * ax +
				3 * u * u * t * x1 +
				3 * u * t * t * x2 +
				t * t * t * x;
			const py =
				u * u * u * ay +
				3 * u * u * t * y1 +
				3 * u * t * t * y2 +
				t * t * t * y;
			pts.push( { x: px, y: py } );
		}
		cx = x;
		cy = y;
		prevCtrl = { x: x2, y: y2 };
	};
	const quadTo = ( x1, y1, x, y ) => {
		const approx =
			Math.hypot( x1 - cx, y1 - cy ) + Math.hypot( x - x1, y - y1 );
		const n = sampleCount( approx );
		const ax = cx;
		const ay = cy;
		for ( let k = 1; k <= n; k++ ) {
			const t = k / n;
			const u = 1 - t;
			pts.push( {
				x: u * u * ax + 2 * u * t * x1 + t * t * x,
				y: u * u * ay + 2 * u * t * y1 + t * t * y,
			} );
		}
		cx = x;
		cy = y;
		prevCtrl = { x: x1, y: y1 };
	};

	while ( i < tokens.length ) {
		let cmd = tokens[ i ];
		if ( 'string' === typeof cmd ) {
			i++;
		} else {
			// Implicit command repetition; an implicit M continues as L.
			cmd = 'M' === prevCmd ? 'L' : 'm' === prevCmd ? 'l' : prevCmd;
		}
		const rel = cmd === cmd.toLowerCase();
		switch ( cmd.toUpperCase() ) {
			case 'M': {
				const x = num();
				const y = num();
				moveTo( rel ? cx + x : x, rel ? cy + y : y );
				break;
			}
			case 'L': {
				const x = num();
				const y = num();
				lineTo( rel ? cx + x : x, rel ? cy + y : y );
				break;
			}
			case 'H': {
				const x = num();
				lineTo( rel ? cx + x : x, cy );
				break;
			}
			case 'V': {
				const y = num();
				lineTo( cx, rel ? cy + y : y );
				break;
			}
			case 'C': {
				const n = [ num(), num(), num(), num(), num(), num() ];
				if ( ! pts ) {
					moveTo( cx, cy );
				}
				cubicTo(
					rel ? cx + n[ 0 ] : n[ 0 ],
					rel ? cy + n[ 1 ] : n[ 1 ],
					rel ? cx + n[ 2 ] : n[ 2 ],
					rel ? cy + n[ 3 ] : n[ 3 ],
					rel ? cx + n[ 4 ] : n[ 4 ],
					rel ? cy + n[ 5 ] : n[ 5 ]
				);
				break;
			}
			case 'S': {
				const n = [ num(), num(), num(), num() ];
				if ( ! pts ) {
					moveTo( cx, cy );
				}
				const refl =
					prevCtrl && /^[CcSs]$/.test( prevCmd )
						? { x: 2 * cx - prevCtrl.x, y: 2 * cy - prevCtrl.y }
						: { x: cx, y: cy };
				cubicTo(
					refl.x,
					refl.y,
					rel ? cx + n[ 0 ] : n[ 0 ],
					rel ? cy + n[ 1 ] : n[ 1 ],
					rel ? cx + n[ 2 ] : n[ 2 ],
					rel ? cy + n[ 3 ] : n[ 3 ]
				);
				break;
			}
			case 'Q': {
				const n = [ num(), num(), num(), num() ];
				if ( ! pts ) {
					moveTo( cx, cy );
				}
				quadTo(
					rel ? cx + n[ 0 ] : n[ 0 ],
					rel ? cy + n[ 1 ] : n[ 1 ],
					rel ? cx + n[ 2 ] : n[ 2 ],
					rel ? cy + n[ 3 ] : n[ 3 ]
				);
				break;
			}
			case 'T': {
				const n = [ num(), num() ];
				if ( ! pts ) {
					moveTo( cx, cy );
				}
				const refl =
					prevCtrl && /^[QqTt]$/.test( prevCmd )
						? { x: 2 * cx - prevCtrl.x, y: 2 * cy - prevCtrl.y }
						: { x: cx, y: cy };
				quadTo(
					refl.x,
					refl.y,
					rel ? cx + n[ 0 ] : n[ 0 ],
					rel ? cy + n[ 1 ] : n[ 1 ]
				);
				break;
			}
			case 'A': {
				// rx ry rot large sweep x y - endpoint only (see docblock).
				num();
				num();
				num();
				num();
				num();
				const x = num();
				const y = num();
				lineTo( rel ? cx + x : x, rel ? cy + y : y );
				break;
			}
			case 'Z': {
				if ( pts && ( cx !== sx || cy !== sy ) ) {
					lineTo( sx, sy );
				}
				pts = null;
				cx = sx;
				cy = sy;
				break;
			}
			default:
				i = tokens.length; // unknown command: stop parsing
		}
		prevCmd = cmd;
	}
	return subs.filter( ( s ) => s.length > 1 );
}

/**
 * Arc-length segment table for a path string.
 *
 * @param {string}  d         Path data.
 * @param {Object}  opts      Options.
 * @param {boolean} opts.flip Walk the path in reverse (text on the other
 *                            side, reading the other way).
 * @param {number}  opts.step Curve sample spacing.
 * @return {Object} { segs: [{ax,ay,bx,by,len,cum}], total }.
 */
export function samplePath( d, { flip = false, step = 3 } = {} ) {
	let subs = flattenPathD( d, step );
	if ( flip ) {
		subs = subs.map( ( pts ) => pts.slice().reverse() ).reverse();
	}
	const segs = [];
	let cum = 0;
	for ( const pts of subs ) {
		for ( let i = 1; i < pts.length; i++ ) {
			const a = pts[ i - 1 ];
			const b = pts[ i ];
			const len = Math.hypot( b.x - a.x, b.y - a.y );
			if ( len < 1e-6 ) {
				continue;
			}
			segs.push( { ax: a.x, ay: a.y, bx: b.x, by: b.y, len, cum } );
			cum += len;
		}
	}
	return { segs, total: cum };
}

/**
 * Point + tangent angle at an arc-length distance. Before the start and
 * past the end the first/last segment extends straight, so overflowing
 * text keeps flowing instead of vanishing.
 *
 * @param {Object} path Sampled path from samplePath().
 * @param {number} dist Distance along the path.
 * @return {{x: number, y: number, angle: number}} Point and tangent.
 */
export function pointAtLength( path, dist ) {
	const { segs, total } = path;
	if ( ! segs.length ) {
		return { x: 0, y: 0, angle: 0 };
	}
	let s;
	if ( dist <= 0 ) {
		s = segs[ 0 ];
	} else if ( dist >= total ) {
		s = segs[ segs.length - 1 ];
	} else {
		// Binary search over cumulative offsets.
		let lo = 0;
		let hi = segs.length - 1;
		while ( lo < hi ) {
			const mid = ( lo + hi + 1 ) >> 1;
			if ( segs[ mid ].cum <= dist ) {
				lo = mid;
			} else {
				hi = mid - 1;
			}
		}
		s = segs[ lo ];
	}
	const t = ( dist - s.cum ) / s.len;
	return {
		x: s.ax + ( s.bx - s.ax ) * t,
		y: s.ay + ( s.by - s.ay ) * t,
		angle: Math.atan2( s.by - s.ay, s.bx - s.ax ),
	};
}

/**
 * Lay glyphs along a sampled path. Mirrors curvedGlyphLayout's contract:
 * pure given measured widths, returns glyph centers plus rotation
 * (translate, rotate, fillText with textAlign 'center').
 *
 * `align` places the run on the path like it would on a straight line
 * (start / centered / end), `start` shifts it by -100…100 % of the path
 * length, `baselineOffset` moves later text lines to parallel offset
 * paths along the local normal.
 *
 * @param {Object}   a                Layout args.
 * @param {string[]} a.chars          Glyphs of one line.
 * @param {number[]} a.widths         Measured advance per glyph.
 * @param {Object}   a.path           Sampled path (samplePath()).
 * @param {number}   a.start          Offset in % of the path length.
 * @param {string}   a.align          left|center|right.
 * @param {number}   a.letterSpacing  Extra advance between glyphs.
 * @param {number}   a.baselineOffset Normal offset (later lines).
 * @return {Array<{char: string, x: number, y: number, angle: number}>} Placements.
 */
export function pathGlyphLayout( {
	chars,
	widths,
	path,
	start = 0,
	align = 'left',
	letterSpacing = 0,
	baselineOffset = 0,
} ) {
	const advance =
		widths.reduce( ( acc, w ) => acc + w, 0 ) +
		letterSpacing * Math.max( 0, chars.length - 1 );
	let s = ( start / 100 ) * path.total;
	if ( 'center' === align ) {
		s += ( path.total - advance ) / 2;
	} else if ( 'right' === align ) {
		s += path.total - advance;
	}
	const out = [];
	for ( let i = 0; i < chars.length; i++ ) {
		const p = pointAtLength( path, s + widths[ i ] / 2 );
		out.push( {
			char: chars[ i ],
			// Normal to the right of travel carries later lines below.
			x: p.x - Math.sin( p.angle ) * baselineOffset,
			y: p.y + Math.cos( p.angle ) * baselineOffset,
			angle: p.angle,
		} );
		s += widths[ i ] + letterSpacing;
	}
	return out;
}

/* ------------------------------ sampled cache ---------------------------- */

// Paths re-sample on every paint otherwise (drags repaint per frame).
const CACHE = new Map();

/**
 * Cached sampled path for a layer's textPath.
 *
 * @param {Object} textPath { d, flip } of a text layer.
 * @return {Object} Sampled path.
 */
export function sampledPathFor( textPath ) {
	const key = ( textPath.flip ? '1|' : '0|' ) + textPath.d;
	let hit = CACHE.get( key );
	if ( ! hit ) {
		hit = samplePath( textPath.d, { flip: !! textPath.flip } );
		CACHE.set( key, hit );
		if ( CACHE.size > 24 ) {
			CACHE.delete( CACHE.keys().next().value );
		}
	}
	return hit;
}
