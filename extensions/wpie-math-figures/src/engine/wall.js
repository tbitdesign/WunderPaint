/**
 * Number walls and number triangles. `wall 3 5 2 4` is the base row,
 * every brick above is the sum of the two below; `?` is an unknown
 * brick. `hide 2.1` (row from the bottom, position) blanks a computed
 * brick. `triangle 3 5 2` puts three inner numbers in a triangle and the
 * sums of neighbouring pairs in the outer fields; `hide inner | outer |
 * a b c ab bc ca` blanks fields.
 */
import { textEl, r } from './svg.js';

export function buildWall( base ) {
	const rows = [ base.slice() ];
	while ( rows[ rows.length - 1 ].length > 1 ) {
		const prev = rows[ rows.length - 1 ];
		const next = [];
		for ( let i = 0; i < prev.length - 1; i++ ) {
			next.push(
				null === prev[ i ] || null === prev[ i + 1 ]
					? null
					: prev[ i ] + prev[ i + 1 ]
			);
		}
		rows.push( next );
	}
	return rows;
}

export function parseWall( text ) {
	const spec = { kind: 'wall', base: [], inner: [], hide: [] };
	const errors = [];
	let seen = false;
	String( text || '' )
		.split( '\n' )
		.forEach( ( raw, i ) => {
			const line = raw.trim();
			if ( ! line ) {
				return;
			}
			const [ cmd, ...rest ] = line.split( /\s+/ );
			switch ( cmd.toLowerCase() ) {
				case 'wall': {
					const vals = rest.map( ( tk ) =>
						'?' === tk
							? null
							: /^-?\d+$/.test( tk )
							? +tk
							: undefined
					);
					if (
						vals.length < 2 ||
						vals.some( ( v ) => undefined === v )
					) {
						errors.push( {
							line: i + 1,
							message:
								'wall needs at least two numbers or ? for the base row',
						} );
					} else {
						spec.kind = 'wall';
						spec.base = vals;
						seen = true;
					}
					break;
				}
				case 'triangle': {
					const vals = rest.map( ( tk ) =>
						'?' === tk
							? null
							: /^-?\d+$/.test( tk )
							? +tk
							: undefined
					);
					if (
						3 !== vals.length ||
						vals.some( ( v ) => undefined === v )
					) {
						errors.push( {
							line: i + 1,
							message: 'triangle needs three numbers',
						} );
					} else {
						spec.kind = 'triangle';
						spec.inner = vals;
						seen = true;
					}
					break;
				}
				case 'hide':
					spec.hide.push( ...rest.map( ( tk ) => tk.toLowerCase() ) );
					break;
				default:
					errors.push( {
						line: i + 1,
						message:
							'Commands: wall 3 5 2 4, triangle 3 5 2, hide 2.1, hide outer',
					} );
			}
		} );
	if ( ! seen && ! errors.length && text && text.trim() ) {
		errors.push( { line: 1, message: 'Start with wall or triangle' } );
	}
	return { spec, errors };
}

function renderBricks( spec, o ) {
	const scale = o.scale || 1;
	const width = o.width || 1000;
	const ink = o.ink || '#000';
	const accent = o.accent || ink;
	const bg = o.bg || '#ffffff';
	const font = o.font || 'Arial';
	const rows = buildWall( spec.base );
	const n = spec.base.length;
	const bw = Math.min( width / n, 120 * scale );
	const bh = bw * 0.55;
	const fs = bh * 0.5;
	const hidden = new Set( spec.hide );
	const parts = [];
	const totalH = rows.length * bh;
	rows.forEach( ( row, ri ) => {
		const y = totalH - ( ri + 1 ) * bh;
		const x0 = ( ( n - row.length ) * bw ) / 2;
		row.forEach( ( v, ci ) => {
			const x = x0 + ci * bw;
			const open = null === v || hidden.has( ri + 1 + '.' + ( ci + 1 ) );
			parts.push(
				`<rect x="${ r( x + 2 ) }" y="${ r( y + 2 ) }" width="${ r(
					bw - 4
				) }" height="${ r( bh - 4 ) }" rx="${ r( bh * 0.18 ) }" fill="${
					0 === ri ? accent : bg
				}"${
					0 === ri ? ' fill-opacity="0.18"' : ''
				} stroke="${ ink }" stroke-width="${ r( 1.6 * scale ) }"/>`
			);
			if ( ! open ) {
				parts.push(
					textEl( x + bw / 2, y + bh / 2 + fs * 0.35, String( v ), {
						size: r( fs ),
						font,
						fill: ink,
						weight: 700,
						anchor: 'middle',
					} )
				);
			}
		} );
	} );
	return {
		inner: parts.join( '' ),
		w: r( n * bw ),
		h: r( totalH ),
		warnings: [],
	};
}

function renderTriangle( spec, o ) {
	const scale = o.scale || 1;
	const width = o.width || 1000;
	const ink = o.ink || '#000';
	const accent = o.accent || ink;
	const bg = o.bg || '#ffffff';
	const font = o.font || 'Arial';
	const S = Math.min( width, 420 * scale );
	const pad = S * 0.16;
	const side = S - 2 * pad;
	const hgt = ( side * Math.sqrt( 3 ) ) / 2;
	const H = hgt + 2 * pad;
	const A = [ pad, pad + hgt ];
	const B = [ pad + side, pad + hgt ];
	const C = [ pad + side / 2, pad ];
	const fs = S * 0.075;
	const hide = new Set( spec.hide );
	const [ a, b, c ] = spec.inner;
	const sum = ( x, y ) => ( null === x || null === y ? null : x + y );
	const parts = [];
	parts.push(
		`<path d="M${ r( A[ 0 ] ) } ${ r( A[ 1 ] ) }L${ r( B[ 0 ] ) } ${ r(
			B[ 1 ]
		) }L${ r( C[ 0 ] ) } ${ r(
			C[ 1 ]
		) }Z" fill="${ accent }" fill-opacity="0.1" stroke="${ ink }" stroke-width="${ r(
			2 * scale
		) }"/>`
	);
	const cx = pad + side / 2;
	const cy = pad + ( 2 * hgt ) / 3;
	const field = ( x, y, v, key, circle ) => {
		const open =
			null === v ||
			hide.has( key ) ||
			( circle && hide.has( 'inner' ) ) ||
			( ! circle && hide.has( 'outer' ) );
		if ( circle ) {
			parts.push(
				`<circle cx="${ r( x ) }" cy="${ r( y ) }" r="${ r(
					fs * 1.1
				) }" fill="${ bg }" stroke="${ ink }" stroke-width="${ r(
					1.6 * scale
				) }"/>`
			);
		} else {
			parts.push(
				`<rect x="${ r( x - fs * 1.25 ) }" y="${ r(
					y - fs * 0.85
				) }" width="${ r( fs * 2.5 ) }" height="${ r(
					fs * 1.7
				) }" rx="${ r(
					fs * 0.3
				) }" fill="${ bg }" stroke="${ ink }" stroke-width="${ r(
					1.6 * scale
				) }"/>`
			);
		}
		if ( ! open ) {
			parts.push(
				textEl( x, y + fs * 0.35, String( v ), {
					size: r( fs ),
					font,
					fill: ink,
					weight: 700,
					anchor: 'middle',
				} )
			);
		}
	};
	// Inner fields near the corners (a bottom-left, b bottom-right, c top).
	const k = 0.55;
	field(
		A[ 0 ] + ( cx - A[ 0 ] ) * k,
		A[ 1 ] + ( cy - A[ 1 ] ) * k,
		a,
		'a',
		true
	);
	field(
		B[ 0 ] + ( cx - B[ 0 ] ) * k,
		B[ 1 ] + ( cy - B[ 1 ] ) * k,
		b,
		'b',
		true
	);
	field(
		C[ 0 ] + ( cx - C[ 0 ] ) * k,
		C[ 1 ] + ( cy - C[ 1 ] ) * k,
		c,
		'c',
		true
	);
	// Outer fields beyond each side: ab (bottom), bc (right), ca (left).
	const out = ( P, Q, v, key ) => {
		const mx = ( P[ 0 ] + Q[ 0 ] ) / 2;
		const my = ( P[ 1 ] + Q[ 1 ] ) / 2;
		const dx = mx - cx;
		const dy = my - cy;
		const len = Math.hypot( dx, dy ) || 1;
		field(
			mx + ( dx / len ) * fs * 1.5,
			my + ( dy / len ) * fs * 1.5,
			v,
			key,
			false
		);
	};
	out( A, B, sum( a, b ), 'ab' );
	out( B, C, sum( b, c ), 'bc' );
	out( C, A, sum( c, a ), 'ca' );
	return { inner: parts.join( '' ), w: r( S ), h: r( H ), warnings: [] };
}

export function renderWall( spec, o ) {
	if ( 'triangle' === spec.kind ) {
		return renderTriangle( spec, o );
	}
	if ( ! spec.base.length ) {
		return { inner: '', w: 0, h: 0, warnings: [] };
	}
	return renderBricks( spec, o );
}
