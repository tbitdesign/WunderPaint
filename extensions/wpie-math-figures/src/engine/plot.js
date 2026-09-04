/**
 * Function graphs: a line-based input ("f(x) = x^2", "param: ...",
 * "polar: ...", "point (1,2)", "area f 0..2"), sampling with breaks at
 * poles, clipping at the frame, axes, grid, ticks, legend. Pure strings.
 */
import { parse, evaluate, toLatex, ExprError } from './expr.js';
import { svgDoc, textEl, escapeXml, r } from './svg.js';

export const PALETTE = [
	'#2563eb',
	'#dc2626',
	'#16a34a',
	'#9333ea',
	'#ea580c',
	'#0891b2',
	'#be185d',
	'#4d7c0f',
];

/** Top-level split on a separator, ignoring parentheses. */
function splitTop( s, sep ) {
	const out = [];
	let depth = 0;
	let cur = '';
	for ( const ch of s ) {
		if ( '(' === ch ) {
			depth++;
		} else if ( ')' === ch ) {
			depth--;
		}
		if ( ch === sep && 0 === depth ) {
			out.push( cur );
			cur = '';
		} else {
			cur += ch;
		}
	}
	out.push( cur );
	return out.map( ( x ) => x.trim() ).filter( Boolean );
}

function takeLabel( s ) {
	const m = /"([^"]*)"\s*$/.exec( s );
	return m
		? { rest: s.slice( 0, m.index ).trim(), label: m[ 1 ] }
		: { rest: s.trim(), label: null };
}
function takeColor( s ) {
	const m = /\bcolor\s+(#[0-9a-fA-F]{3,6}|[a-zA-Z]+)\s*$/.exec( s );
	return m
		? { rest: s.slice( 0, m.index ).trim(), color: m[ 1 ] }
		: { rest: s.trim(), color: null };
}
function parseRange( s, dflt ) {
	const m = /^\s*(?:t\s*(?:=|in)\s*)?(.+?)\s*(?:\.\.|to|,)\s*(.+?)\s*$/.exec(
		s || ''
	);
	if ( ! m ) {
		return dflt;
	}
	return [ evaluate( parse( m[ 1 ] ), {} ), evaluate( parse( m[ 2 ] ), {} ) ];
}

/**
 * Lines -> items. Every item: { kind, name, label, color, ... }.
 * Errors: [{ line, message }].
 */
export function parseFunctions( text, params = {} ) {
	const items = [];
	const errors = [];
	let fi = 0;
	const lines = String( text || '' ).split( /\r?\n/ );
	lines.forEach( ( raw, li ) => {
		let line = raw
			.replace( /^\s*#.*$/, '' )
			.replace( /\s\/\/.*$/, '' )
			.trim();
		if ( ! line ) {
			return;
		}
		try {
			let color = null;
			( { rest: line, color } = takeColor( line ) );
			let label = null;
			( { rest: line, label } = takeLabel( line ) );
			let m;
			if ( ( m = /^param(?:etric)?\s*:\s*(.*)$/i.exec( line ) ) ) {
				const parts =
					splitTop( m[ 1 ], ';' ).length >= 2
						? splitTop( m[ 1 ], ';' )
						: splitTop( m[ 1 ], ',' );
				if ( parts.length < 2 ) {
					throw new ExprError( 'param needs x(t), y(t)', 0 );
				}
				const rangePart =
					parts.slice( 2 ).find( ( p ) => /^t\s*(=|in)/.test( p ) ) ||
					null;
				const range = parseRange( rangePart, [ 0, 2 * Math.PI ] );
				items.push( {
					kind: 'param',
					x: parse( parts[ 0 ] ),
					y: parse( parts[ 1 ] ),
					range,
					label,
					color: color || PALETTE[ fi++ % PALETTE.length ],
					name: 'c' + fi,
				} );
				return;
			}
			if ( ( m = /^polar\s*:\s*(.*)$/i.exec( line ) ) ) {
				const parts =
					splitTop( m[ 1 ], ';' ).length >= 2
						? splitTop( m[ 1 ], ';' )
						: splitTop( m[ 1 ], ',' );
				const rangePart =
					parts.slice( 1 ).find( ( p ) => /^t\s*(=|in)/.test( p ) ) ||
					null;
				items.push( {
					kind: 'polar',
					r: parse( parts[ 0 ] ),
					range: parseRange( rangePart, [ 0, 2 * Math.PI ] ),
					label,
					color: color || PALETTE[ fi++ % PALETTE.length ],
					name: 'r' + fi,
				} );
				return;
			}
			if (
				( m = /^point\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)\s*$/i.exec( line ) )
			) {
				items.push( {
					kind: 'point',
					x: evaluate( parse( m[ 1 ] ), params ),
					y: evaluate( parse( m[ 2 ] ), params ),
					label,
					color: color || null,
				} );
				return;
			}
			if (
				( m =
					/^area\s+([a-zA-Z]\w*)(?:\s*\(\s*x\s*\))?\s+(.+?)\s*(?:\.\.|to)\s*(.+?)\s*$/i.exec(
						line
					) )
			) {
				items.push( {
					kind: 'area',
					of: m[ 1 ],
					from: evaluate( parse( m[ 2 ] ), params ),
					to: evaluate( parse( m[ 3 ] ), params ),
					label,
					color: color || null,
				} );
				return;
			}
			// f(x) = ..., y = ..., or a bare expression.
			let name = null;
			let body = line;
			if (
				( m = /^([a-zA-Z]\w*)\s*\(\s*x\s*\)\s*=\s*(.+)$/.exec( line ) )
			) {
				name = m[ 1 ];
				body = m[ 2 ];
			} else if ( ( m = /^y\s*=\s*(.+)$/.exec( line ) ) ) {
				body = m[ 1 ];
			}
			const ast = parse( body );
			if ( ! name ) {
				name =
					'fghpqu'[
						items.filter( ( x ) => 'y' === x.kind ).length
					] || 'f';
			}
			items.push( {
				kind: 'y',
				name,
				ast,
				label,
				color: color || PALETTE[ fi++ % PALETTE.length ],
			} );
		} catch ( e ) {
			errors.push( {
				line: li + 1,
				message: ( e && e.message ) || String( e ),
			} );
		}
	} );
	return { items, errors };
}

/* --------------------------------- scales --------------------------------- */

/** A "nice" tick step for a range aiming at about `n` ticks. */
export function niceStep( span, n = 8 ) {
	const raw = Math.abs( span ) / Math.max( 1, n );
	const p = Math.pow( 10, Math.floor( Math.log10( raw ) ) );
	const f = raw / p;
	const step = f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10;
	return step * p;
}

function fmtTick( v, step ) {
	const digits = Math.max(
		0,
		Math.min( 6, -Math.floor( Math.log10( step ) ) )
	);
	let s = v.toFixed( digits );
	if ( s.includes( '.' ) ) {
		s = s.replace( /0+$/, '' ).replace( /\.$/, '' );
	}
	return '-0' === s ? '0' : s;
}

/** Labels like π/2, π, 3π/2 for multiples of π/2 (k half-turns). */
function piLabel( k ) {
	if ( 0 === k ) {
		return '0';
	}
	const halves = k; // value = k * π/2
	const sign = halves < 0 ? '-' : '';
	const h = Math.abs( halves );
	if ( h % 2 === 0 ) {
		const n = h / 2;
		return sign + ( 1 === n ? 'π' : n + 'π' );
	}
	return sign + ( 1 === h ? 'π/2' : h + 'π/2' );
}

/* -------------------------------- rendering ------------------------------- */

/**
 * spec = parseFunctions().items; o = { width, height, xmin, xmax, ymin, ymax
 * (null = auto), equal, grid: 'none'|'major'|'fine', ticks: 'numbers'|'pi',
 * legend, xLabel, yLabel, ink, bg, font, params: {a,b,c,k}, typeset }.
 */
export function renderPlot( items, o ) {
	const warnings = [];
	const params = { a: 1, b: 1, c: 1, k: 1, ...( o.params || {} ) };
	const width = o.width;
	const ink = o.ink || '#111111';
	const font = o.font || 'Arial';
	const fs = o.fontSize || 18;
	let xmin = Number.isFinite( o.xmin ) ? o.xmin : -5;
	let xmax = Number.isFinite( o.xmax ) ? o.xmax : 5;
	if ( xmax <= xmin ) {
		xmax = xmin + 1;
	}
	const N = o.samples || 700;
	const fnY = ( it ) => ( x ) => {
		try {
			return evaluate( it.ast, { ...params, x } );
		} catch ( e ) {
			return NaN;
		}
	};
	// y-range: given or from the samples (2nd..98th percentile, padded).
	let ymin = o.ymin;
	let ymax = o.ymax;
	if ( ! Number.isFinite( ymin ) || ! Number.isFinite( ymax ) ) {
		const vals = [];
		for ( const it of items ) {
			if ( 'y' === it.kind ) {
				const f = fnY( it );
				for ( let i = 0; i <= 200; i++ ) {
					const v = f( xmin + ( ( xmax - xmin ) * i ) / 200 );
					if ( Number.isFinite( v ) ) {
						vals.push( v );
					}
				}
			} else if ( 'param' === it.kind || 'polar' === it.kind ) {
				for ( let i = 0; i <= 200; i++ ) {
					const t =
						it.range[ 0 ] +
						( ( it.range[ 1 ] - it.range[ 0 ] ) * i ) / 200;
					const p = paramPoint( it, t, params );
					if ( p && Number.isFinite( p[ 1 ] ) ) {
						vals.push( p[ 1 ] );
					}
				}
			} else if ( 'point' === it.kind ) {
				vals.push( it.y );
			}
		}
		vals.sort( ( a, b ) => a - b );
		if ( vals.length ) {
			let lo = vals[ Math.floor( vals.length * 0.02 ) ];
			let hi = vals[ Math.ceil( vals.length * 0.98 ) - 1 ];
			if ( hi - lo < 1e-9 ) {
				lo -= 1;
				hi += 1;
			}
			const pad = ( hi - lo ) * 0.12;
			lo -= pad;
			hi += pad;
			if ( lo > 0 && lo < ( hi - lo ) * 0.5 ) {
				lo = 0;
			}
			if ( hi < 0 && -hi < ( hi - lo ) * 0.5 ) {
				hi = 0;
			}
			ymin = Number.isFinite( o.ymin ) ? o.ymin : lo;
			ymax = Number.isFinite( o.ymax ) ? o.ymax : hi;
		} else {
			ymin = Number.isFinite( o.ymin ) ? o.ymin : -5;
			ymax = Number.isFinite( o.ymax ) ? o.ymax : 5;
		}
	}
	if ( ymax <= ymin ) {
		ymax = ymin + 1;
	}
	// Frame and plot area.
	const padL = fs * 3.2;
	const padR = fs * 1.6;
	const padT = fs * 1.4;
	const padB = fs * 2.4;
	const pw = width - padL - padR;
	let height = o.height;
	if ( ! height ) {
		const ratio = o.equal ? ( ymax - ymin ) / ( xmax - xmin ) : 0.62;
		height = Math.round(
			pw * Math.min( 1.6, Math.max( 0.3, ratio ) ) + padT + padB
		);
	}
	const ph = height - padT - padB;
	if ( o.equal ) {
		// Same px per unit on both axes: widen the y-range (or the x-range) to fit.
		const ux = pw / ( xmax - xmin );
		const uy = ph / ( ymax - ymin );
		if ( uy > ux ) {
			const mid = ( ymin + ymax ) / 2;
			const half = ph / ux / 2;
			ymin = mid - half;
			ymax = mid + half;
		} else {
			const mid = ( xmin + xmax ) / 2;
			const half = pw / uy / 2;
			xmin = mid - half;
			xmax = mid + half;
		}
	}
	const X = ( x ) => padL + ( ( x - xmin ) / ( xmax - xmin ) ) * pw;
	const Y = ( y ) => padT + ( ( ymax - y ) / ( ymax - ymin ) ) * ph;
	const children = [];
	const muted = mix( ink, o.bg || '#ffffff', 0.72 );
	const faint = mix( ink, o.bg || '#ffffff', 0.9 );
	// Ticks.
	const piMode = 'pi' === o.ticks;
	const xStep = piMode
		? Math.PI / 2
		: niceStep( xmax - xmin, Math.max( 4, Math.round( pw / ( fs * 7 ) ) ) );
	const yStep = niceStep(
		ymax - ymin,
		Math.max( 3, Math.round( ph / ( fs * 5 ) ) )
	);
	const xTicks = [];
	for (
		let k = Math.ceil( xmin / xStep - 1e-9 );
		k * xStep <= xmax + 1e-9;
		k++
	) {
		xTicks.push( { v: k * xStep, k } );
	}
	const yTicks = [];
	for (
		let k = Math.ceil( ymin / yStep - 1e-9 );
		k * yStep <= ymax + 1e-9;
		k++
	) {
		yTicks.push( { v: k * yStep, k } );
	}
	// Grid.
	if ( o.grid && 'none' !== o.grid ) {
		const sub = 'fine' === o.grid ? 5 : 1;
		for (
			let k = Math.ceil( ( xmin / xStep ) * sub - 1e-9 );
			( k * xStep ) / sub <= xmax + 1e-9;
			k++
		) {
			const v = ( k * xStep ) / sub;
			const major = 0 === k % sub;
			children.push(
				lineEl(
					X( v ),
					padT,
					X( v ),
					padT + ph,
					major ? muted : faint,
					major ? 1 : 0.6
				)
			);
		}
		for (
			let k = Math.ceil( ( ymin / yStep ) * sub - 1e-9 );
			( k * yStep ) / sub <= ymax + 1e-9;
			k++
		) {
			const v = ( k * yStep ) / sub;
			const major = 0 === k % sub;
			children.push(
				lineEl(
					padL,
					Y( v ),
					padL + pw,
					Y( v ),
					major ? muted : faint,
					major ? 1 : 0.6
				)
			);
		}
	}
	// Axes through the origin when inside, else along the edge.
	const axY = ymin <= 0 && ymax >= 0 ? Y( 0 ) : ymin > 0 ? padT + ph : padT;
	const axX = xmin <= 0 && xmax >= 0 ? X( 0 ) : xmin > 0 ? padL : padL + pw;
	const arrow = fs * 0.55;
	children.push(
		lineEl( padL - fs * 0.4, axY, padL + pw + fs * 0.4, axY, ink, 1.6 )
	);
	children.push(
		`<path d="M${ r( padL + pw + fs * 0.4 ) } ${ r( axY ) }l${ r(
			-arrow
		) } ${ r( -arrow * 0.45 ) }v${ r( arrow * 0.9 ) }z" fill="${ ink }"/>`
	);
	children.push(
		lineEl( axX, padT + ph + fs * 0.4, axX, padT - fs * 0.4, ink, 1.6 )
	);
	children.push(
		`<path d="M${ r( axX ) } ${ r( padT - fs * 0.4 ) }l${ r(
			-arrow * 0.45
		) } ${ r( arrow ) }h${ r( arrow * 0.9 ) }z" fill="${ ink }"/>`
	);
	children.push(
		textEl( padL + pw + fs * 0.5, axY - fs * 0.5, o.xLabel || 'x', {
			size: fs,
			font,
			fill: ink,
			italic: true,
		} )
	);
	children.push(
		textEl( axX + fs * 0.5, padT - fs * 0.2, o.yLabel || 'y', {
			size: fs,
			font,
			fill: ink,
			italic: true,
		} )
	);
	// Tick marks and labels.
	for ( const tk of xTicks ) {
		if (
			Math.abs( tk.v ) < 1e-9 &&
			xmin <= 0 &&
			xmax >= 0 &&
			ymin <= 0 &&
			ymax >= 0
		) {
			continue;
		}
		children.push(
			lineEl(
				X( tk.v ),
				axY - fs * 0.25,
				X( tk.v ),
				axY + fs * 0.25,
				ink,
				1.4
			)
		);
		const lab = piMode ? piLabel( tk.k ) : fmtTick( tk.v, xStep );
		children.push(
			textEl( X( tk.v ), axY + fs * 1.15, lab, {
				size: fs * 0.85,
				font,
				fill: ink,
				anchor: 'middle',
			} )
		);
	}
	for ( const tk of yTicks ) {
		if ( Math.abs( tk.v ) < 1e-9 ) {
			continue;
		}
		children.push(
			lineEl(
				axX - fs * 0.25,
				Y( tk.v ),
				axX + fs * 0.25,
				Y( tk.v ),
				ink,
				1.4
			)
		);
		children.push(
			textEl(
				axX - fs * 0.45,
				Y( tk.v ) + fs * 0.3,
				fmtTick( tk.v, yStep ),
				{ size: fs * 0.85, font, fill: ink, anchor: 'end' }
			)
		);
	}
	if ( xmin <= 0 && xmax >= 0 && ymin <= 0 && ymax >= 0 ) {
		children.push(
			textEl( axX - fs * 0.4, axY + fs * 1.1, '0', {
				size: fs * 0.85,
				font,
				fill: ink,
				anchor: 'end',
			} )
		);
	}
	// Areas first (under the curves).
	const rect = { x0: padL, y0: padT, x1: padL + pw, y1: padT + ph };
	for ( const it of items ) {
		if ( 'area' !== it.kind ) {
			continue;
		}
		const fnItem = items.find(
			( f ) => 'y' === f.kind && f.name === it.of
		);
		if ( ! fnItem ) {
			warnings.push( it.of );
			continue;
		}
		const f = fnY( fnItem );
		const pts = [];
		const n = 160;
		for ( let i = 0; i <= n; i++ ) {
			const x = it.from + ( ( it.to - it.from ) * i ) / n;
			const y = f( x );
			pts.push( [
				X( x ),
				Y(
					Number.isFinite( y )
						? Math.max( ymin, Math.min( ymax, y ) )
						: 0
				),
			] );
		}
		const base = Y( Math.max( ymin, Math.min( ymax, 0 ) ) );
		const d =
			'M' +
			r( pts[ 0 ][ 0 ] ) +
			' ' +
			r( base ) +
			pts
				.map( ( p ) => 'L' + r( p[ 0 ] ) + ' ' + r( p[ 1 ] ) )
				.join( '' ) +
			'L' +
			r( pts[ pts.length - 1 ][ 0 ] ) +
			' ' +
			r( base ) +
			'Z';
		children.push(
			`<path d="${ d }" fill="${
				it.color || fnItem.color
			}" opacity="0.22"/>`
		);
	}
	// Curves.
	const legend = [];
	for ( const it of items ) {
		if ( 'y' === it.kind ) {
			const f = fnY( it );
			const pts = [];
			for ( let i = 0; i <= N; i++ ) {
				const x = xmin + ( ( xmax - xmin ) * i ) / N;
				pts.push( [ x, f( x ) ] );
			}
			children.push(
				polyPaths( pts, X, Y, rect, ymax - ymin, it.color )
			);
			legend.push( {
				color: it.color,
				latex: it.label ? null : it.name + '(x)=' + toLatex( it.ast ),
				text: it.label || it.name + '(x) = ' + exprText( it.ast ),
			} );
		} else if ( 'param' === it.kind || 'polar' === it.kind ) {
			const pts = [];
			const n = N;
			for ( let i = 0; i <= n; i++ ) {
				const t =
					it.range[ 0 ] +
					( ( it.range[ 1 ] - it.range[ 0 ] ) * i ) / n;
				const p = paramPoint( it, t, params );
				pts.push( p || [ NaN, NaN ] );
			}
			children.push(
				polyPaths( pts, X, Y, rect, ymax - ymin, it.color )
			);
			legend.push( {
				color: it.color,
				latex: it.label
					? null
					: 'polar' === it.kind
					? 'r(\\theta)=' + toLatex( it.r )
					: '\\left(' +
					  toLatex( it.x ) +
					  ',\\ ' +
					  toLatex( it.y ) +
					  '\\right)',
				text:
					it.label ||
					( 'polar' === it.kind
						? 'r = ' + exprText( it.r )
						: '(' +
						  exprText( it.x ) +
						  ', ' +
						  exprText( it.y ) +
						  ')' ),
			} );
		}
	}
	// Points.
	for ( const it of items ) {
		if ( 'point' !== it.kind ) {
			continue;
		}
		if ( it.x < xmin || it.x > xmax || it.y < ymin || it.y > ymax ) {
			continue;
		}
		const col = it.color || o.accent || ink;
		children.push(
			`<circle cx="${ r( X( it.x ) ) }" cy="${ r( Y( it.y ) ) }" r="${ r(
				fs * 0.28
			) }" fill="${ col }"/>`
		);
		const lab =
			it.label ||
			'(' + fmtTick( it.x, 0.01 ) + ' | ' + fmtTick( it.y, 0.01 ) + ')';
		children.push(
			textEl( X( it.x ) + fs * 0.45, Y( it.y ) - fs * 0.45, lab, {
				size: fs * 0.9,
				font,
				fill: col,
			} )
		);
	}
	// Legend, top right, typeset when the engine is there.
	if ( false !== o.legend && legend.length ) {
		let ly = padT + fs * 0.6;
		const entries = [];
		let maxW = 0;
		for ( const e of legend ) {
			let block = null;
			if ( e.latex && o.typeset ) {
				try {
					block = o.typeset( e.latex, {
						size: fs * 1.1,
						color: ink,
					} );
				} catch ( err ) {
					block = null;
				}
			}
			const w = block ? block.w : e.text.length * fs * 0.55;
			const h = block ? block.h : fs * 1.2;
			maxW = Math.max( maxW, w );
			entries.push( { e, block, w, h } );
		}
		const boxW = maxW + fs * 3.2;
		const boxH =
			entries.reduce( ( a, x ) => a + x.h + fs * 0.5, 0 ) + fs * 0.5;
		const bx = padL + pw - boxW - fs * 0.6;
		const by = padT + fs * 0.4;
		children.push(
			`<rect x="${ r( bx ) }" y="${ r( by ) }" width="${ r(
				boxW
			) }" height="${ r( boxH ) }" rx="6" fill="${
				o.bg || '#ffffff'
			}" opacity="0.88" stroke="${ muted }"/>`
		);
		ly = by + fs * 0.5;
		for ( const { e, block, h } of entries ) {
			const cy = ly + h / 2;
			children.push(
				lineEl( bx + fs * 0.5, cy, bx + fs * 2.1, cy, e.color, 3 )
			);
			if ( block ) {
				children.push(
					`<g transform="translate(${ r( bx + fs * 2.6 ) } ${ r(
						ly
					) })">${ block.inner }</g>`
				);
			} else {
				children.push(
					textEl( bx + fs * 2.6, cy + fs * 0.35, e.text, {
						size: fs,
						font,
						fill: ink,
					} )
				);
			}
			ly += h + fs * 0.5;
		}
	}
	return {
		svg: svgDoc( { width, height, bg: o.bg || null, children } ),
		width,
		height,
		warnings,
		view: { xmin, xmax, ymin, ymax },
	};
}

function paramPoint( it, t, params ) {
	try {
		if ( 'polar' === it.kind ) {
			const rr = evaluate( it.r, { ...params, t } );
			return [ rr * Math.cos( t ), rr * Math.sin( t ) ];
		}
		return [
			evaluate( it.x, { ...params, t } ),
			evaluate( it.y, { ...params, t } ),
		];
	} catch ( e ) {
		return null;
	}
}

/** Curve segments clipped to the rect, broken at poles and gaps. */
function polyPaths( pts, X, Y, rect, yspan, color ) {
	const paths = [];
	let cur = [];
	const flush = () => {
		if ( cur.length > 1 ) {
			paths.push(
				'M' +
					cur
						.map( ( p ) => r( p[ 0 ] ) + ' ' + r( p[ 1 ] ) )
						.join( 'L' )
			);
		}
		cur = [];
	};
	for ( let i = 1; i < pts.length; i++ ) {
		const a = pts[ i - 1 ];
		const b = pts[ i ];
		const ok = ( p ) =>
			Number.isFinite( p[ 0 ] ) && Number.isFinite( p[ 1 ] );
		if ( ! ok( a ) || ! ok( b ) ) {
			flush();
			continue;
		}
		// A pole: both far out on opposite sides, or a jump larger than the view.
		if ( Math.abs( b[ 1 ] - a[ 1 ] ) > 4 * yspan ) {
			flush();
			continue;
		}
		const seg = clipSegment(
			[ X( a[ 0 ] ), Y( a[ 1 ] ) ],
			[ X( b[ 0 ] ), Y( b[ 1 ] ) ],
			rect
		);
		if ( ! seg ) {
			flush();
			continue;
		}
		if (
			! cur.length ||
			cur[ cur.length - 1 ][ 0 ] !== seg[ 0 ][ 0 ] ||
			cur[ cur.length - 1 ][ 1 ] !== seg[ 0 ][ 1 ]
		) {
			flush();
			cur.push( seg[ 0 ] );
		}
		cur.push( seg[ 1 ] );
	}
	flush();
	return paths
		.map(
			( d ) =>
				`<path d="${ d }" fill="none" stroke="${ color }" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>`
		)
		.join( '' );
}

/** Liang-Barsky clipping of a segment to a rect; null when outside. */
export function clipSegment( p0, p1, rc ) {
	let t0 = 0;
	let t1 = 1;
	const dx = p1[ 0 ] - p0[ 0 ];
	const dy = p1[ 1 ] - p0[ 1 ];
	const checks = [
		[ -dx, p0[ 0 ] - rc.x0 ],
		[ dx, rc.x1 - p0[ 0 ] ],
		[ -dy, p0[ 1 ] - rc.y0 ],
		[ dy, rc.y1 - p0[ 1 ] ],
	];
	for ( const [ p, q ] of checks ) {
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
			if ( t > t0 ) {
				t0 = t;
			}
		} else {
			if ( t < t0 ) {
				return null;
			}
			if ( t < t1 ) {
				t1 = t;
			}
		}
	}
	const a = [
		Math.round( ( p0[ 0 ] + t0 * dx ) * 100 ) / 100,
		Math.round( ( p0[ 1 ] + t0 * dy ) * 100 ) / 100,
	];
	const b = [
		Math.round( ( p0[ 0 ] + t1 * dx ) * 100 ) / 100,
		Math.round( ( p0[ 1 ] + t1 * dy ) * 100 ) / 100,
	];
	return [ a, b ];
}

/** A readable plain-text form of an expression for legends without MathJax. */
export function exprText( ast ) {
	switch ( ast.k ) {
		case 'num':
			return String( Math.round( ast.v * 1e6 ) / 1e6 );
		case 'const':
			return 'pi' === ast.v ? 'π' : 'e';
		case 'var':
			return ast.v;
		case 'group':
			return '(' + exprText( ast.e ) + ')';
		case 'neg':
			return '-' + exprText( ast.e );
		case 'add':
			return exprText( ast.a ) + ' + ' + exprText( ast.b );
		case 'sub':
			return exprText( ast.a ) + ' - ' + exprText( ast.b );
		case 'mul':
			return (
				exprText( ast.a ) +
				( ast.implicit ? '' : '·' ) +
				exprText( ast.b )
			);
		case 'div':
			return exprText( ast.a ) + '/' + exprText( ast.b );
		case 'pow':
			return exprText( ast.a ) + '^' + exprText( ast.b );
		case 'call':
			return ast.f + '(' + ast.args.map( exprText ).join( ', ' ) + ')';
		default:
			return '';
	}
}

const lineEl = ( x1, y1, x2, y2, stroke, w ) =>
	`<line x1="${ r( x1 ) }" y1="${ r( y1 ) }" x2="${ r( x2 ) }" y2="${ r(
		y2
	) }" stroke="${ stroke }" stroke-width="${ r( w ) }"/>`;

export function mix( a, b, t ) {
	const pa = parseInt( String( a ).replace( '#', '' ).padEnd( 6, '0' ), 16 );
	const pb = parseInt( String( b ).replace( '#', '' ).padEnd( 6, '0' ), 16 );
	const c = ( sh ) =>
		Math.round(
			( ( pa >> sh ) & 255 ) * ( 1 - t ) + ( ( pb >> sh ) & 255 ) * t
		);
	return (
		'#' +
		[ 16, 8, 0 ]
			.map( ( sh ) => c( sh ).toString( 16 ).padStart( 2, '0' ) )
			.join( '' )
	);
}

export { escapeXml };
