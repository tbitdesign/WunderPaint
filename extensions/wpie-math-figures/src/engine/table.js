/**
 * Tables: rows with cells split by `|`, a `---` line after the first row
 * makes it a header, cells may hold $math$, **bold** and *italic*. A
 * `values` line computes a value table through the expression engine:
 *   values f(x) = x^2 - 1; g(x) = 2x; x = -3..3 step 1 [vertical]
 */
import { parse, evaluate } from './expr.js';
import { layoutText } from './text.js';
import { r } from './svg.js';

const fmt = ( n ) => {
	if ( ! Number.isFinite( n ) ) {
		return '–';
	}
	const v = Math.round( n * 1000 ) / 1000;
	return String( 0 === v ? 0 : v );
};

export function valuesTable( line ) {
	let body = String( line || '' )
		.replace( /^values\s+/i, '' )
		.trim();
	let vertical = false;
	if ( /\bvertical\b/i.test( body ) ) {
		vertical = true;
		body = body.replace( /\s*\bvertical\b\s*/i, ' ' ).trim();
	}
	const parts = body
		.split( ';' )
		.map( ( s ) => s.trim() )
		.filter( Boolean );
	let range = null;
	const fns = [];
	for ( const p of parts ) {
		const m =
			/^([a-zA-Zθ])\s*=\s*(-?[\d.]+)\s*\.\.\s*(-?[\d.]+)(?:\s+step\s+(-?[\d.]+))?$/i.exec(
				p
			);
		if ( m ) {
			range = {
				v: m[ 1 ],
				from: parseFloat( m[ 2 ] ),
				to: parseFloat( m[ 3 ] ),
				step: m[ 4 ] ? parseFloat( m[ 4 ] ) : 1,
			};
		} else {
			fns.push( p );
		}
	}
	if ( ! range ) {
		throw new Error( 'values needs a range like x = -3..3 step 1' );
	}
	if ( ! fns.length ) {
		throw new Error( 'values needs an expression like f(x) = x^2' );
	}
	if (
		! ( range.step > 0 ) ||
		( range.to - range.from ) / range.step > 200
	) {
		throw new Error(
			'values: the step must be positive and give at most 200 columns'
		);
	}
	const xs = [];
	for ( let x = range.from; x <= range.to + 1e-9; x += range.step ) {
		xs.push( Math.round( x * 1e6 ) / 1e6 );
	}
	let rows = [ [ range.v, ...xs.map( fmt ) ] ];
	for ( const fn of fns ) {
		const m = /^([a-zA-Z]\w*\s*\(\s*[a-zA-Zθ]\s*\))\s*=\s*(.+)$/.exec( fn );
		const label = m ? m[ 1 ].replace( /\s+/g, '' ) : fn;
		const expr = m ? m[ 2 ] : fn;
		const ast = parse( expr, { vars: [ range.v ] } );
		rows.push( [
			label,
			...xs.map( ( x ) => {
				try {
					return fmt(
						evaluate( ast, {
							a: 1,
							b: 1,
							c: 1,
							k: 1,
							[ range.v ]: x,
						} )
					);
				} catch ( e ) {
					return '–';
				}
			} ),
		] );
	}
	if ( vertical ) {
		rows = rows[ 0 ].map( ( _, j ) => rows.map( ( row ) => row[ j ] ) );
	}
	return { rows, header: true };
}

export function parseTable( text ) {
	const rows = [];
	const errors = [];
	let header = false;
	String( text || '' )
		.split( '\n' )
		.forEach( ( raw, i ) => {
			const line = raw.trim();
			if ( ! line ) {
				return;
			}
			if ( /^values\s+/i.test( line ) ) {
				try {
					const v = valuesTable( line );
					if ( ! rows.length ) {
						header = true;
					}
					rows.push( ...v.rows );
				} catch ( e ) {
					errors.push( {
						line: i + 1,
						message: ( e && e.message ) || String( e ),
					} );
				}
				return;
			}
			if ( /^[-:|\s]+$/.test( line ) && line.includes( '-' ) ) {
				if ( 1 === rows.length ) {
					header = true;
				}
				return;
			}
			rows.push(
				line
					.replace( /^\|/, '' )
					.replace( /\|$/, '' )
					.split( '|' )
					.map( ( c ) => c.trim() )
			);
		} );
	return { rows, header, errors };
}

export function layoutTable( table, o, env = {} ) {
	const size = o.size || 22;
	const font = o.font || 'Arial';
	const ink = o.ink || '#000';
	const accent = o.accent || ink;
	const pad = undefined === o.pad ? 0.6 * size : o.pad;
	const width = o.width || 1200;
	const header = !! ( table.header || o.header );
	const warnings = [];
	const rows = table.rows || [];
	if ( ! rows.length ) {
		return { inner: '', w: 0, h: 0, warnings };
	}
	const cols = rows.reduce( ( m, row ) => Math.max( m, row.length ), 0 );
	const cells = rows.map( ( row, i ) =>
		[ ...Array( cols ) ].map( ( _, j ) =>
			layoutText(
				row[ j ] || '',
				{
					width: Infinity,
					size,
					font,
					color: ink,
					weight: header && 0 === i ? 700 : 400,
					lineHeight: 1.2,
				},
				env
			)
		)
	);
	const colW = [ ...Array( cols ) ].map(
		( _, j ) =>
			cells.reduce( ( m, row ) => Math.max( m, row[ j ].w ), 0 ) + 2 * pad
	);
	const rowH = cells.map(
		( row ) =>
			row.reduce( ( m, c ) => Math.max( m, c.h ), size * 1.2 ) + pad
	);
	const totalW = colW.reduce( ( a, b ) => a + b, 0 );
	const totalH = rowH.reduce( ( a, b ) => a + b, 0 );
	const parts = [];
	let y = 0;
	rows.forEach( ( row, i ) => {
		if ( header && 0 === i ) {
			parts.push(
				`<rect x="0" y="0" width="${ r( totalW ) }" height="${ r(
					rowH[ 0 ]
				) }" fill="${ accent }" fill-opacity="0.14"/>`
			);
		} else if ( o.zebra && ( i - ( header ? 1 : 0 ) ) % 2 === 1 ) {
			parts.push(
				`<rect x="0" y="${ r( y ) }" width="${ r(
					totalW
				) }" height="${ r(
					rowH[ i ]
				) }" fill="${ accent }" fill-opacity="0.07"/>`
			);
		}
		let x = 0;
		for ( let j = 0; j < cols; j++ ) {
			const c = cells[ i ][ j ];
			if ( c.inner ) {
				parts.push(
					`<g transform="translate(${ r(
						x + ( colW[ j ] - c.w ) / 2
					) } ${ r( y + ( rowH[ i ] - c.h ) / 2 ) })">${
						c.inner
					}</g>`
				);
			}
			x += colW[ j ];
		}
		y += rowH[ i ];
	} );
	if ( o.border ) {
		let yy = 0;
		for ( let i = 0; i <= rows.length; i++ ) {
			parts.push(
				`<line x1="0" y1="${ r( yy ) }" x2="${ r( totalW ) }" y2="${ r(
					yy
				) }" stroke="${ ink }" stroke-width="${
					0 === i || rows.length === i || ( header && 1 === i )
						? 1.8
						: 1
				}"/>`
			);
			yy += i < rows.length ? rowH[ i ] : 0;
		}
		let xx = 0;
		for ( let j = 0; j <= cols; j++ ) {
			parts.push(
				`<line x1="${ r( xx ) }" y1="0" x2="${ r( xx ) }" y2="${ r(
					totalH
				) }" stroke="${ ink }" stroke-width="${
					0 === j || cols === j ? 1.8 : 1
				}"/>`
			);
			xx += j < cols ? colW[ j ] : 0;
		}
	}
	let inner = parts.join( '' );
	let w = totalW;
	let h = totalH;
	if ( totalW > width ) {
		const k = width / totalW;
		inner = `<g transform="scale(${ r( k ) })">${ inner }</g>`;
		w = width;
		h = totalH * k;
		warnings.push( 'wide' );
	}
	return { inner, w: r( w ), h: r( h ), warnings };
}
