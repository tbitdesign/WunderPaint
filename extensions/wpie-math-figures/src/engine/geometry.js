/**
 * Geometry figures from a command list, one per line:
 *   A = (0, 0)            point A (expressions allowed: (sqrt(2), 1))
 *   segment A B "c"       line A B    ray A B    vector A B
 *   polygon A B C         circle A 2  circle A B   arc A 2 30 120
 *   angle A B C ["α"]     (vertex B; right angles get the square)
 *   midpoint M A B        label A "A'"   hide A   text (1, 1) "note"
 *   grid on|off  axes on|off  range xmin xmax ymin ymax
 * Rendering keeps equal scaling and fits the figure with a margin.
 */
import { parse, evaluate } from './expr.js';
import { svgDoc, textEl, r } from './svg.js';
import { mix } from './plot.js';

const num = ( s ) => evaluate( parse( s ), {} );

export function parseGeometry( text ) {
	const points = new Map();
	const items = [];
	const errors = [];
	const opts = {
		grid: false,
		axes: false,
		range: null,
		hidden: new Set(),
		labels: new Map(),
	};
	const lines = String( text || '' ).split( /\r?\n/ );
	const label = ( s ) => {
		const m = /"([^"]*)"\s*$/.exec( s );
		return m
			? { rest: s.slice( 0, m.index ).trim(), label: m[ 1 ] }
			: { rest: s.trim(), label: null };
	};
	const need = ( name, li ) => {
		if ( ! points.has( name ) ) {
			throw new Error( 'Unknown point ' + name );
		}
		void li;
		return name;
	};
	lines.forEach( ( raw, li ) => {
		const line0 = raw
			.replace( /^\s*#.*$/, '' )
			.replace( /\s\/\/.*$/, '' )
			.trim();
		if ( ! line0 ) {
			return;
		}
		try {
			const { rest: line, label: lab } = label( line0 );
			let m;
			if (
				( m = /^text\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)\s*$/i.exec(
					line
				) ) &&
				lab !== null
			) {
				items.push( {
					kind: 'text',
					x: num( m[ 1 ] ),
					y: num( m[ 2 ] ),
					label: lab,
				} );
				return;
			}
			if (
				( m =
					/^(?:point\s+)?([A-Za-z]\w*)\s*(?:=|:)?\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)\s*$/.exec(
						line
					) )
			) {
				points.set( m[ 1 ], {
					x: num( m[ 2 ] ),
					y: num( m[ 3 ] ),
					show: true,
				} );
				if ( lab ) {
					opts.labels.set( m[ 1 ], lab );
				}
				return;
			}
			if (
				( m =
					/^midpoint\s+([A-Za-z]\w*)\s+([A-Za-z]\w*)\s+([A-Za-z]\w*)\s*$/i.exec(
						line
					) )
			) {
				const a = points.get( need( m[ 2 ] ) );
				const b = points.get( need( m[ 3 ] ) );
				points.set( m[ 1 ], {
					x: ( a.x + b.x ) / 2,
					y: ( a.y + b.y ) / 2,
					show: true,
				} );
				return;
			}
			if (
				( m =
					/^(segment|line|ray|vector)\s+([A-Za-z]\w*)\s+([A-Za-z]\w*)\s*$/i.exec(
						line
					) )
			) {
				items.push( {
					kind: m[ 1 ].toLowerCase(),
					a: need( m[ 2 ] ),
					b: need( m[ 3 ] ),
					label: lab,
				} );
				return;
			}
			if ( ( m = /^polygon\s+(.+)$/i.exec( line ) ) ) {
				const names = m[ 1 ]
					.trim()
					.split( /[\s,]+/ )
					.map( ( n ) => need( n ) );
				if ( names.length < 3 ) {
					throw new Error( 'polygon needs three points' );
				}
				items.push( { kind: 'polygon', pts: names, label: lab } );
				return;
			}
			if ( ( m = /^circle\s+([A-Za-z]\w*)\s+(.+)$/i.exec( line ) ) ) {
				const c = need( m[ 1 ] );
				const arg = m[ 2 ].trim();
				let radius;
				if ( points.has( arg ) ) {
					const p = points.get( arg );
					const q = points.get( c );
					radius = Math.hypot( p.x - q.x, p.y - q.y );
				} else {
					radius = num( arg );
				}
				items.push( { kind: 'circle', c, r: radius, label: lab } );
				return;
			}
			if (
				( m = /^arc\s+([A-Za-z]\w*)\s+(\S+)\s+(\S+)\s+(\S+)\s*$/i.exec(
					line
				) )
			) {
				items.push( {
					kind: 'arc',
					c: need( m[ 1 ] ),
					r: num( m[ 2 ] ),
					from: num( m[ 3 ] ),
					to: num( m[ 4 ] ),
					label: lab,
				} );
				return;
			}
			if (
				( m =
					/^angle\s+([A-Za-z]\w*)\s+([A-Za-z]\w*)\s+([A-Za-z]\w*)\s*$/i.exec(
						line
					) )
			) {
				items.push( {
					kind: 'angle',
					a: need( m[ 1 ] ),
					v: need( m[ 2 ] ),
					c: need( m[ 3 ] ),
					label: lab,
				} );
				return;
			}
			if (
				( m = /^label\s+([A-Za-z]\w*)\s*$/i.exec( line ) ) &&
				lab !== null
			) {
				opts.labels.set( need( m[ 1 ] ), lab );
				return;
			}
			if ( ( m = /^hide\s+(.+)$/i.exec( line ) ) ) {
				m[ 1 ]
					.trim()
					.split( /[\s,]+/ )
					.forEach( ( n ) => opts.hidden.add( n ) );
				return;
			}
			if ( ( m = /^grid\s+(on|off)\s*$/i.exec( line ) ) ) {
				opts.grid = 'on' === m[ 1 ].toLowerCase();
				return;
			}
			if ( ( m = /^axes\s+(on|off)\s*$/i.exec( line ) ) ) {
				opts.axes = 'on' === m[ 1 ].toLowerCase();
				return;
			}
			if (
				( m = /^range\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s*$/i.exec(
					line
				) )
			) {
				opts.range = {
					xmin: num( m[ 1 ] ),
					xmax: num( m[ 2 ] ),
					ymin: num( m[ 3 ] ),
					ymax: num( m[ 4 ] ),
				};
				return;
			}
			throw new Error( 'Unknown command' );
		} catch ( e ) {
			errors.push( {
				line: li + 1,
				message: ( e && e.message ) || String( e ),
			} );
		}
	} );
	return { points, items, opts, errors };
}

const deg = ( rad ) => ( rad * 180 ) / Math.PI;

/** { points, items, opts } -> svg. o = { width, height|null, ink, accent, bg, font, fontSize }. */
export function renderGeometry( fig, o ) {
	const { points, items, opts } = fig;
	const ink = o.ink || '#111111';
	const accent = o.accent || '#8d1436';
	const font = o.font || 'Arial';
	const fs = o.fontSize || 20;
	const width = o.width;
	const warnings = [];
	// Bounds.
	let xmin = Infinity;
	let xmax = -Infinity;
	let ymin = Infinity;
	let ymax = -Infinity;
	const grow = ( x, y ) => {
		xmin = Math.min( xmin, x );
		xmax = Math.max( xmax, x );
		ymin = Math.min( ymin, y );
		ymax = Math.max( ymax, y );
	};
	for ( const p of points.values() ) {
		grow( p.x, p.y );
	}
	for ( const it of items ) {
		if ( 'circle' === it.kind || 'arc' === it.kind ) {
			const c = points.get( it.c );
			grow( c.x - it.r, c.y - it.r );
			grow( c.x + it.r, c.y + it.r );
		} else if ( 'text' === it.kind ) {
			grow( it.x, it.y );
		}
	}
	if ( opts.range ) {
		( { xmin, xmax, ymin, ymax } = opts.range );
	} else {
		if ( ! Number.isFinite( xmin ) ) {
			xmin = -1;
			xmax = 1;
			ymin = -1;
			ymax = 1;
		}
		if ( xmax - xmin < 1e-9 ) {
			xmin -= 1;
			xmax += 1;
		}
		if ( ymax - ymin < 1e-9 ) {
			ymin -= 1;
			ymax += 1;
		}
		const px = ( xmax - xmin ) * 0.16 + 0.3;
		const py = ( ymax - ymin ) * 0.16 + 0.3;
		xmin -= px;
		xmax += px;
		ymin -= py;
		ymax += py;
		if ( opts.axes ) {
			xmin = Math.min( xmin, -0.5 );
			ymin = Math.min( ymin, -0.5 );
		}
	}
	const margin = fs * 1.2;
	const pw = width - 2 * margin;
	let height = o.height;
	const ratio = ( ymax - ymin ) / ( xmax - xmin );
	if ( ! height ) {
		height = Math.round(
			pw * Math.min( 1.4, Math.max( 0.35, ratio ) ) + 2 * margin
		);
	}
	const ph = height - 2 * margin;
	// Equal units: the tighter axis decides, the other range widens.
	const unit = Math.min( pw / ( xmax - xmin ), ph / ( ymax - ymin ) );
	const cx = ( xmin + xmax ) / 2;
	const cy = ( ymin + ymax ) / 2;
	xmin = cx - pw / unit / 2;
	xmax = cx + pw / unit / 2;
	ymin = cy - ph / unit / 2;
	ymax = cy + ph / unit / 2;
	const X = ( x ) => margin + ( x - xmin ) * unit;
	const Y = ( y ) => margin + ( ymax - y ) * unit;
	const P = ( name ) => {
		const p = points.get( name );
		return [ X( p.x ), Y( p.y ) ];
	};
	const children = [];
	const muted = mix( ink, o.bg || '#ffffff', 0.75 );
	const lineEl = ( x1, y1, x2, y2, stroke, w, extra = '' ) =>
		`<line x1="${ r( x1 ) }" y1="${ r( y1 ) }" x2="${ r( x2 ) }" y2="${ r(
			y2
		) }" stroke="${ stroke }" stroke-width="${ r(
			w
		) }" stroke-linecap="round"${ extra }/>`;
	// Grid and axes in world units.
	if ( opts.grid ) {
		const step = niceUnit( xmax - xmin );
		for ( let k = Math.ceil( xmin / step ); k * step <= xmax; k++ ) {
			children.push(
				lineEl(
					X( k * step ),
					margin,
					X( k * step ),
					margin + ph,
					mix( ink, o.bg || '#ffffff', 0.88 ),
					1
				)
			);
		}
		for ( let k = Math.ceil( ymin / step ); k * step <= ymax; k++ ) {
			children.push(
				lineEl(
					margin,
					Y( k * step ),
					margin + pw,
					Y( k * step ),
					mix( ink, o.bg || '#ffffff', 0.88 ),
					1
				)
			);
		}
	}
	if ( opts.axes ) {
		const ax = xmin <= 0 && xmax >= 0 ? X( 0 ) : margin;
		const ay = ymin <= 0 && ymax >= 0 ? Y( 0 ) : margin + ph;
		children.push( lineEl( margin, ay, margin + pw, ay, muted, 1.4 ) );
		children.push( lineEl( ax, margin + ph, ax, margin, muted, 1.4 ) );
		const step = niceUnit( xmax - xmin );
		for ( let k = Math.ceil( xmin / step ); k * step <= xmax; k++ ) {
			if ( 0 !== k ) {
				children.push(
					textEl( X( k * step ), ay + fs * 0.95, fmt( k * step ), {
						size: fs * 0.7,
						font,
						fill: muted,
						anchor: 'middle',
					} )
				);
			}
		}
		for ( let k = Math.ceil( ymin / step ); k * step <= ymax; k++ ) {
			if ( 0 !== k ) {
				children.push(
					textEl(
						ax - fs * 0.35,
						Y( k * step ) + fs * 0.25,
						fmt( k * step ),
						{ size: fs * 0.7, font, fill: muted, anchor: 'end' }
					)
				);
			}
		}
	}
	// Centroid of everything, to push labels outward.
	const all = [ ...points.values() ];
	const gx = all.reduce( ( s, p ) => s + p.x, 0 ) / ( all.length || 1 );
	const gy = all.reduce( ( s, p ) => s + p.y, 0 ) / ( all.length || 1 );
	const outward = ( x, y, dist ) => {
		let dx = x - gx;
		let dy = y - gy;
		const len = Math.hypot( dx, dy ) || 1;
		dx = dx / len;
		dy = dy / len;
		if ( Math.abs( dx ) < 1e-6 && Math.abs( dy ) < 1e-6 ) {
			dx = 0.7;
			dy = 0.7;
		}
		return [ X( x ) + dx * dist, Y( y ) - dy * dist ];
	};
	// Polygons first (fills), then circles, lines, angles, points, labels.
	for ( const it of items ) {
		if ( 'polygon' === it.kind ) {
			const d =
				it.pts
					.map(
						( n, i ) =>
							( i ? 'L' : 'M' ) + P( n ).map( r ).join( ' ' )
					)
					.join( '' ) + 'Z';
			children.push(
				`<path d="${ d }" fill="${ accent }" opacity="0.14"/>`
			);
			children.push(
				`<path d="${ d }" fill="none" stroke="${ ink }" stroke-width="2.4" stroke-linejoin="round"/>`
			);
			if ( it.label ) {
				const mx =
					it.pts.reduce( ( s, n ) => s + points.get( n ).x, 0 ) /
					it.pts.length;
				const my =
					it.pts.reduce( ( s, n ) => s + points.get( n ).y, 0 ) /
					it.pts.length;
				children.push(
					textEl( X( mx ), Y( my ) + fs * 0.35, it.label, {
						size: fs,
						font,
						fill: ink,
						anchor: 'middle',
						italic: true,
					} )
				);
			}
		}
	}
	for ( const it of items ) {
		if ( 'circle' === it.kind ) {
			const [ x, y ] = P( it.c );
			children.push(
				`<circle cx="${ r( x ) }" cy="${ r( y ) }" r="${ r(
					it.r * unit
				) }" fill="none" stroke="${ ink }" stroke-width="2.2"/>`
			);
			if ( it.label ) {
				children.push(
					textEl(
						x + it.r * unit * 0.72,
						y - it.r * unit * 0.72 - fs * 0.3,
						it.label,
						{ size: fs, font, fill: ink, italic: true }
					)
				);
			}
		} else if ( 'arc' === it.kind ) {
			const [ x, y ] = P( it.c );
			const rr = it.r * unit;
			const a0 = ( it.from * Math.PI ) / 180;
			const a1 = ( it.to * Math.PI ) / 180;
			const large = Math.abs( it.to - it.from ) > 180 ? 1 : 0;
			children.push(
				`<path d="M${ r( x + rr * Math.cos( a0 ) ) } ${ r(
					y - rr * Math.sin( a0 )
				) }A${ r( rr ) } ${ r( rr ) } 0 ${ large } 0 ${ r(
					x + rr * Math.cos( a1 )
				) } ${ r(
					y - rr * Math.sin( a1 )
				) }" fill="none" stroke="${ accent }" stroke-width="2.4"/>`
			);
			if ( it.label ) {
				const am = ( a0 + a1 ) / 2;
				children.push(
					textEl(
						x + ( rr + fs * 0.8 ) * Math.cos( am ),
						y - ( rr + fs * 0.8 ) * Math.sin( am ) + fs * 0.3,
						it.label,
						{
							size: fs,
							font,
							fill: ink,
							anchor: 'middle',
							italic: true,
						}
					)
				);
			}
		}
	}
	for ( const it of items ) {
		if ( ! [ 'segment', 'line', 'ray', 'vector' ].includes( it.kind ) ) {
			continue;
		}
		const a = points.get( it.a );
		const b = points.get( it.b );
		let [ x1, y1 ] = P( it.a );
		let [ x2, y2 ] = P( it.b );
		if ( 'line' === it.kind || 'ray' === it.kind ) {
			// Extend to the frame.
			const dx = x2 - x1;
			const dy = y2 - y1;
			const far = ( width + height ) * 2;
			const len = Math.hypot( dx, dy ) || 1;
			const ex = ( dx / len ) * far;
			const ey = ( dy / len ) * far;
			const q0 = 'line' === it.kind ? [ x1 - ex, y1 - ey ] : [ x1, y1 ];
			const q1 = [ x2 + ex, y2 + ey ];
			const seg = clip( q0, q1, {
				x0: margin,
				y0: margin,
				x1: margin + pw,
				y1: margin + ph,
			} );
			if ( seg ) {
				[ [ x1, y1 ], [ x2, y2 ] ] = seg;
			}
		}
		const isVec = 'vector' === it.kind;
		children.push(
			lineEl( x1, y1, x2, y2, isVec ? accent : ink, isVec ? 2.8 : 2.4 )
		);
		if ( isVec ) {
			const ang = Math.atan2( y2 - y1, x2 - x1 );
			const s = fs * 0.7;
			children.push(
				`<path d="M${ r( x2 ) } ${ r( y2 ) }L${ r(
					x2 - s * Math.cos( ang - 0.45 )
				) } ${ r( y2 - s * Math.sin( ang - 0.45 ) ) }L${ r(
					x2 - s * Math.cos( ang + 0.45 )
				) } ${ r(
					y2 - s * Math.sin( ang + 0.45 )
				) }Z" fill="${ accent }"/>`
			);
		}
		if ( it.label ) {
			// Midpoint, offset perpendicular away from the centroid.
			const mx = ( a.x + b.x ) / 2;
			const my = ( a.y + b.y ) / 2;
			let nx = -( b.y - a.y );
			let ny = b.x - a.x;
			const len = Math.hypot( nx, ny ) || 1;
			nx /= len;
			ny /= len;
			if ( ( mx - gx ) * nx + ( my - gy ) * ny < 0 ) {
				nx = -nx;
				ny = -ny;
			}
			// Far enough that a label of this width clears the line.
			const est = it.label.length * fs * 0.3;
			const dist =
				fs * 0.55 + Math.abs( nx ) * est + Math.abs( ny ) * fs * 0.45;
			children.push(
				textEl(
					X( mx ) + nx * dist,
					Y( my ) - ny * dist + fs * 0.35,
					it.label,
					{
						size: fs,
						font,
						fill: ink,
						anchor: 'middle',
						italic: true,
					}
				)
			);
		}
	}
	// Angles.
	for ( const it of items ) {
		if ( 'angle' !== it.kind ) {
			continue;
		}
		const v = points.get( it.v );
		const a = points.get( it.a );
		const c = points.get( it.c );
		const a1 = Math.atan2( a.y - v.y, a.x - v.x );
		const a2 = Math.atan2( c.y - v.y, c.x - v.x );
		let sweep = a2 - a1;
		while ( sweep <= -Math.PI ) {
			sweep += 2 * Math.PI;
		}
		while ( sweep > Math.PI ) {
			sweep -= 2 * Math.PI;
		}
		const degrees = Math.abs( deg( sweep ) );
		const [ vx, vy ] = P( it.v );
		const rad = Math.min(
			fs * 1.6,
			Math.min(
				Math.hypot( a.x - v.x, a.y - v.y ),
				Math.hypot( c.x - v.x, c.y - v.y )
			) *
				unit *
				0.35
		);
		const right = Math.abs( degrees - 90 ) < 1.5;
		if ( right ) {
			const s = rad * 0.75;
			const ux = Math.cos( a1 );
			const uy = Math.sin( a1 );
			const wx = Math.cos( a2 );
			const wy = Math.sin( a2 );
			const d = `M${ r( vx + ux * s ) } ${ r( vy - uy * s ) }L${ r(
				vx + ( ux + wx ) * s
			) } ${ r( vy - ( uy + wy ) * s ) }L${ r( vx + wx * s ) } ${ r(
				vy - wy * s
			) }`;
			children.push(
				`<path d="${ d }" fill="none" stroke="${ accent }" stroke-width="2"/>`
			);
			children.push(
				`<circle cx="${ r( vx + ( ux + wx ) * s * 0.5 ) }" cy="${ r(
					vy - ( uy + wy ) * s * 0.5
				) }" r="${ r( fs * 0.12 ) }" fill="${ accent }"/>`
			);
		} else {
			const start = sweep > 0 ? a1 : a2;
			const end = sweep > 0 ? a2 : a1;
			const large = Math.abs( sweep ) > Math.PI ? 1 : 0;
			// SVG y is down: a positive world sweep is counter-clockwise on screen, flag 0.
			children.push(
				`<path d="M${ r( vx + rad * Math.cos( start ) ) } ${ r(
					vy - rad * Math.sin( start )
				) }A${ r( rad ) } ${ r( rad ) } 0 ${ large } 0 ${ r(
					vx + rad * Math.cos( end )
				) } ${ r(
					vy - rad * Math.sin( end )
				) }" fill="${ accent }" fill-opacity="0.15" stroke="${ accent }" stroke-width="2"/>`
			);
		}
		const mid = a1 + sweep / 2;
		const lab =
			it.label !== null && it.label !== undefined
				? it.label
				: Math.round( degrees * 10 ) / 10 + '°';
		if ( lab ) {
			children.push(
				textEl(
					vx + ( rad + fs * 0.75 ) * Math.cos( mid ),
					vy - ( rad + fs * 0.75 ) * Math.sin( mid ) + fs * 0.32,
					lab,
					{ size: fs * 0.9, font, fill: ink, anchor: 'middle' }
				)
			);
		}
	}
	// Points and names.
	for ( const [ name, p ] of points ) {
		if ( opts.hidden.has( name ) || ! p.show ) {
			continue;
		}
		const [ x, y ] = P( name );
		children.push(
			`<circle cx="${ r( x ) }" cy="${ r( y ) }" r="${ r(
				fs * 0.22
			) }" fill="${ accent }" stroke="${
				o.bg || '#ffffff'
			}" stroke-width="1.5"/>`
		);
		const lab = opts.labels.has( name ) ? opts.labels.get( name ) : name;
		if ( lab ) {
			const [ lx, ly ] = outward( p.x, p.y, fs * 0.95 );
			children.push(
				textEl( lx, ly + fs * 0.35, lab, {
					size: fs,
					font,
					fill: ink,
					anchor: 'middle',
					italic: true,
				} )
			);
		}
	}
	for ( const it of items ) {
		if ( 'text' === it.kind ) {
			children.push(
				textEl( X( it.x ), Y( it.y ) + fs * 0.35, it.label, {
					size: fs,
					font,
					fill: ink,
					anchor: 'middle',
				} )
			);
		}
	}
	return {
		svg: svgDoc( { width, height, bg: o.bg || null, children } ),
		width,
		height,
		warnings,
		view: { xmin, xmax, ymin, ymax, unit },
	};
}

function niceUnit( span ) {
	const raw = span / 10;
	const p = Math.pow( 10, Math.floor( Math.log10( raw ) ) );
	const f = raw / p;
	return ( f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10 ) * p;
}
const fmt = ( v ) => String( Math.round( v * 1000 ) / 1000 );

function clip( p0, p1, rc ) {
	let t0 = 0;
	let t1 = 1;
	const dx = p1[ 0 ] - p0[ 0 ];
	const dy = p1[ 1 ] - p0[ 1 ];
	for ( const [ p, q ] of [
		[ -dx, p0[ 0 ] - rc.x0 ],
		[ dx, rc.x1 - p0[ 0 ] ],
		[ -dy, p0[ 1 ] - rc.y0 ],
		[ dy, rc.y1 - p0[ 1 ] ],
	] ) {
		if ( 0 === p ) {
			if ( q < 0 ) {
				return null;
			}
			continue;
		}
		const t = q / p;
		if ( p < 0 ) {
			if ( t > t1 ) {
				return null;
			}
			t0 = Math.max( t0, t );
		} else {
			if ( t < t0 ) {
				return null;
			}
			t1 = Math.min( t1, t );
		}
	}
	return [
		[ p0[ 0 ] + t0 * dx, p0[ 1 ] + t0 * dy ],
		[ p0[ 0 ] + t1 * dx, p0[ 1 ] + t1 * dy ],
	];
}
