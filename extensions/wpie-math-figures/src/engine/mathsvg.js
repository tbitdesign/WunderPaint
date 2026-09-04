/**
 * Flattens a MathJax SVG into plain absolute paths and rectangles in px,
 * so the editor's importer (which flattens translate/scale itself but is
 * safer without a negative scale) and an <img> get simple markup. All
 * MathJax transforms are translate and scale chains; the outer group is
 * scale(1,-1). Pure string work, no DOM.
 *
 *   flattenMathSvg( svgText, { size: 40, color: '#111' } )
 *   -> { inner, w, h, baseline, warnings }   (inner = paths/rects, top-left at 0,0)
 */
const TAG_RE = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g;

function attrs( raw ) {
	const out = {};
	const re = /([a-zA-Z_:][\w:.-]*)\s*=\s*"([^"]*)"/g;
	let m;
	while ( ( m = re.exec( raw ) ) ) {
		out[ m[ 1 ] ] = m[ 2 ];
	}
	return out;
}

/** translate(a[,b]) scale(a[,b]) chains -> [sx, sy, tx, ty] (no rotation in MathJax). */
function parseTransform( t ) {
	let sx = 1;
	let sy = 1;
	let tx = 0;
	let ty = 0;
	const re = /(translate|scale|matrix)\s*\(([^)]*)\)/g;
	let m;
	while ( ( m = re.exec( t || '' ) ) ) {
		const v = m[ 2 ]
			.split( /[\s,]+/ )
			.filter( Boolean )
			.map( Number );
		if ( 'translate' === m[ 1 ] ) {
			tx += sx * ( v[ 0 ] || 0 );
			ty += sy * ( v[ 1 ] || 0 );
		} else if ( 'scale' === m[ 1 ] ) {
			sx *= v[ 0 ];
			sy *= v.length > 1 ? v[ 1 ] : v[ 0 ];
		} else if ( 'matrix' === m[ 1 ] && 6 === v.length ) {
			tx += sx * v[ 4 ];
			ty += sy * v[ 5 ];
			sx *= v[ 0 ];
			sy *= v[ 3 ];
		}
	}
	return [ sx, sy, tx, ty ];
}

const compose = ( p, c ) => [
	p[ 0 ] * c[ 0 ],
	p[ 1 ] * c[ 1 ],
	p[ 2 ] + p[ 0 ] * c[ 2 ],
	p[ 3 ] + p[ 1 ] * c[ 3 ],
];
const apply = ( m, x, y ) => [ m[ 0 ] * x + m[ 2 ], m[ 1 ] * y + m[ 3 ] ];
const r2 = ( v ) => Math.round( v * 100 ) / 100;

/** Path data through an affine map, emitted as absolute commands. */
export function transformPath( d, m ) {
	const toks = d.match( /[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g ) || [];
	let i = 0;
	let cmd = '';
	let cx = 0;
	let cy = 0;
	let sx0 = 0;
	let sy0 = 0;
	const out = [];
	const num = () => parseFloat( toks[ i++ ] );
	const emitPt = ( x, y ) => {
		const [ px, py ] = apply( m, x, y );
		return r2( px ) + ' ' + r2( py );
	};
	while ( i < toks.length ) {
		if ( /[a-zA-Z]/.test( toks[ i ] ) ) {
			cmd = toks[ i++ ];
		}
		const rel = cmd === cmd.toLowerCase() && 'z' !== cmd.toLowerCase();
		switch ( cmd.toUpperCase() ) {
			case 'M':
			case 'L':
			case 'T': {
				const x = num();
				const y = num();
				cx = rel ? cx + x : x;
				cy = rel ? cy + y : y;
				if ( 'M' === cmd.toUpperCase() ) {
					sx0 = cx;
					sy0 = cy;
				}
				out.push( cmd.toUpperCase() + emitPt( cx, cy ) );
				// Subsequent pairs after M are implicit L.
				if ( 'M' === cmd.toUpperCase() ) {
					cmd = rel ? 'l' : 'L';
				}
				break;
			}
			case 'H': {
				const x = num();
				cx = rel ? cx + x : x;
				out.push( 'L' + emitPt( cx, cy ) );
				break;
			}
			case 'V': {
				const y = num();
				cy = rel ? cy + y : y;
				out.push( 'L' + emitPt( cx, cy ) );
				break;
			}
			case 'C': {
				const x1 = num();
				const y1 = num();
				const x2 = num();
				const y2 = num();
				const x = num();
				const y = num();
				const p1 = rel ? [ cx + x1, cy + y1 ] : [ x1, y1 ];
				const p2 = rel ? [ cx + x2, cy + y2 ] : [ x2, y2 ];
				cx = rel ? cx + x : x;
				cy = rel ? cy + y : y;
				out.push(
					'C' +
						emitPt( ...p1 ) +
						' ' +
						emitPt( ...p2 ) +
						' ' +
						emitPt( cx, cy )
				);
				break;
			}
			case 'S':
			case 'Q': {
				const x1 = num();
				const y1 = num();
				const x = num();
				const y = num();
				const p1 = rel ? [ cx + x1, cy + y1 ] : [ x1, y1 ];
				cx = rel ? cx + x : x;
				cy = rel ? cy + y : y;
				out.push(
					cmd.toUpperCase() + emitPt( ...p1 ) + ' ' + emitPt( cx, cy )
				);
				break;
			}
			case 'A': {
				// Arcs: radii scale by the map's magnitudes (uniform in MathJax).
				const rx = num();
				const ry = num();
				const rot = num();
				const la = num();
				const sw = num();
				const x = num();
				const y = num();
				cx = rel ? cx + x : x;
				cy = rel ? cy + y : y;
				const flip = m[ 0 ] * m[ 1 ] < 0 ? 1 - sw : sw;
				out.push(
					'A' +
						r2( Math.abs( rx * m[ 0 ] ) ) +
						' ' +
						r2( Math.abs( ry * m[ 1 ] ) ) +
						' ' +
						rot +
						' ' +
						la +
						' ' +
						flip +
						' ' +
						emitPt( cx, cy )
				);
				break;
			}
			case 'Z':
				cx = sx0;
				cy = sy0;
				out.push( 'Z' );
				break;
			default:
				i++;
		}
	}
	return out.join( '' );
}

/**
 * The MathJax SVG as flat markup. `size` is the em size in px (the
 * formula's font size); MathJax's viewBox units are em/1000.
 */
export function flattenMathSvg(
	svgText,
	{ size = 40, color = '#111111', accent = null } = {}
) {
	const warnings = [];
	const root = /<svg([^>]*)>/.exec( svgText );
	if ( ! root ) {
		throw new Error( 'No SVG' );
	}
	const ra = attrs( root[ 1 ] );
	const vb = ( ra.viewBox || '0 0 1000 1000' )
		.split( /[\s,]+/ )
		.map( Number );
	const k = size / 1000;
	// Page map: viewBox min corner to the origin, units to px.
	const page = [ k, k, -vb[ 0 ] * k, -vb[ 1 ] * k ];
	const stack = [ page ];
	const paint = [ color ];
	// Marks: a <g id="mk-key"> from \mark{key}{...}; its box grows with every path and rect inside.
	const open = [];
	const marks = {};
	const grow = ( x0, y0, x1, y1 ) => {
		for ( const mk of open ) {
			if ( ! mk ) {
				continue;
			}
			if ( ! mk.box ) {
				mk.box = { x0, y0, x1, y1 };
			} else {
				mk.box.x0 = Math.min( mk.box.x0, x0 );
				mk.box.y0 = Math.min( mk.box.y0, y0 );
				mk.box.x1 = Math.max( mk.box.x1, x1 );
				mk.box.y1 = Math.max( mk.box.y1, y1 );
			}
		}
	};
	const growPath = ( d ) => {
		let x0 = Infinity;
		let y0 = Infinity;
		let x1 = -Infinity;
		let y1 = -Infinity;
		for ( const m of d.matchAll( /(-?[\d.]+) (-?[\d.]+)/g ) ) {
			const x = +m[ 1 ];
			const y = +m[ 2 ];
			x0 = Math.min( x0, x );
			y0 = Math.min( y0, y );
			x1 = Math.max( x1, x );
			y1 = Math.max( y1, y );
		}
		if ( Number.isFinite( x0 ) ) {
			grow( x0, y0, x1, y1 );
		}
	};
	const parts = [];
	const body = svgText.slice( root.index + root[ 0 ].length );
	let m;
	TAG_RE.lastIndex = 0;
	while ( ( m = TAG_RE.exec( body ) ) ) {
		const [ , closing, tag, raw, selfClose ] = m;
		if ( 'svg' === tag && closing ) {
			break;
		}
		if ( closing ) {
			if ( 'g' === tag ) {
				stack.pop();
				paint.pop();
				const mk = open.pop();
				if ( mk && mk.box ) {
					marks[ mk.key ] = {
						x: r2( mk.box.x0 ),
						y: r2( mk.box.y0 ),
						w: r2( mk.box.x1 - mk.box.x0 ),
						h: r2( mk.box.y1 - mk.box.y0 ),
					};
				}
			}
			continue;
		}
		const a = attrs( raw );
		const cur = stack[ stack.length - 1 ];
		const fillHere =
			a.fill && 'currentColor' !== a.fill
				? a.fill
				: paint[ paint.length - 1 ];
		if ( 'g' === tag ) {
			if ( ! selfClose ) {
				stack.push( compose( cur, parseTransform( a.transform ) ) );
				paint.push( fillHere );
				open.push(
					a.id && a.id.startsWith( 'mk-' )
						? { key: a.id.slice( 3 ), box: null }
						: null
				);
			}
			continue;
		}
		const mm = compose( cur, parseTransform( a.transform ) );
		if ( 'path' === tag ) {
			if ( a.d ) {
				const d = transformPath( a.d, mm );
				parts.push( `<path d="${ d }" fill="${ fillHere }"/>` );
				if ( open.length ) {
					growPath( d );
				}
			}
		} else if ( 'rect' === tag ) {
			const x = parseFloat( a.x || 0 );
			const y = parseFloat( a.y || 0 );
			const w = parseFloat( a.width || 0 );
			const h = parseFloat( a.height || 0 );
			const [ x0, y0 ] = apply( mm, x, y );
			const [ x1, y1 ] = apply( mm, x + w, y + h );
			const stroke =
				a.stroke && 'none' !== a.stroke
					? 'currentColor' === a.stroke
						? fillHere
						: a.stroke
					: null;
			const fill = 'none' === a.fill ? 'none' : fillHere;
			if ( open.length ) {
				grow(
					Math.min( x0, x1 ),
					Math.min( y0, y1 ),
					Math.max( x0, x1 ),
					Math.max( y0, y1 )
				);
			}
			parts.push(
				`<rect x="${ r2( Math.min( x0, x1 ) ) }" y="${ r2(
					Math.min( y0, y1 )
				) }" width="${ r2( Math.abs( x1 - x0 ) ) }" height="${ r2(
					Math.abs( y1 - y0 )
				) }" fill="${ fill }"${
					stroke
						? ` stroke="${ stroke }" stroke-width="${ r2(
								parseFloat( a[ 'stroke-width' ] || 1 ) *
									Math.abs( mm[ 0 ] )
						  ) }"`
						: ''
				}/>`
			);
		} else if ( 'line' === tag ) {
			const [ x0, y0 ] = apply(
				mm,
				parseFloat( a.x1 || 0 ),
				parseFloat( a.y1 || 0 )
			);
			const [ x1, y1 ] = apply(
				mm,
				parseFloat( a.x2 || 0 ),
				parseFloat( a.y2 || 0 )
			);
			parts.push(
				`<line x1="${ r2( x0 ) }" y1="${ r2( y0 ) }" x2="${ r2(
					x1
				) }" y2="${ r2( y1 ) }" stroke="${
					a.stroke && 'currentColor' !== a.stroke
						? a.stroke
						: fillHere
				}" stroke-width="${ r2(
					parseFloat( a[ 'stroke-width' ] || 1 ) * Math.abs( mm[ 0 ] )
				) }"/>`
			);
		} else if ( 'text' === tag ) {
			// An id makes MathJax add an empty <text data-id-align>; nothing to draw.
			if ( undefined === a[ 'data-id-align' ] ) {
				warnings.push( 'text' );
			}
		} else if ( 'use' === tag ) {
			warnings.push( 'use' );
		}
	}
	const w = vb[ 2 ] * k;
	const h = vb[ 3 ] * k;
	// The baseline sits at viewBox y = 0 (MathJax flips y); its px position from the top:
	const baseline = -vb[ 1 ] * k;
	void accent;
	return {
		inner: parts.join( '' ),
		w: r2( w ),
		h: r2( h ),
		baseline: r2( baseline ),
		warnings,
		marks,
	};
}
