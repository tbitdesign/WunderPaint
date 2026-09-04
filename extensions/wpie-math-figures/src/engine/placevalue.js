/**
 * Place value chart: one number per line (`4736`, `number 205`, `3.75`).
 * Columns come from the widest number: thousands, hundreds, tens, ones,
 * and tenths, hundredths for decimals, labelled through t(). With
 * `blocks` the base-ten material is drawn under the digits: hundreds as
 * flats, tens as rods, ones as cubes.
 */
import { textEl, r } from './svg.js';

const INT_LABELS = [ 'O', 'T', 'H', 'Th', 'TTh', 'HTh', 'M' ];
const FRAC_LABELS = [ 't', 'h', 'th' ];

export function parsePlaceValue( text ) {
	const numbers = [];
	const errors = [];
	String( text || '' )
		.split( '\n' )
		.forEach( ( raw, i ) => {
			let line = raw.trim();
			if ( ! line ) {
				return;
			}
			line = line.replace( /^number\s+/i, '' ).replace( ',', '.' );
			const m = /^(\d{1,7})(?:\.(\d{1,3}))?$/.exec( line );
			if ( ! m ) {
				errors.push( {
					line: i + 1,
					message: 'Expected a number like 4736 or 3.75',
				} );
				return;
			}
			numbers.push( { text: line, int: m[ 1 ], frac: m[ 2 ] || '' } );
		} );
	return { numbers, errors };
}

export function renderPlaceValue( numbers, o ) {
	const scale = o.scale || 1;
	const width = o.width || 1000;
	const ink = o.ink || '#000';
	const accent = o.accent || ink;
	const bg = o.bg || '#ffffff';
	const font = o.font || 'Arial';
	const t = o.t || ( ( s ) => s );
	if ( ! numbers.length ) {
		return { inner: '', w: 0, h: 0, warnings: [] };
	}
	const intCols = Math.max( 1, ...numbers.map( ( n ) => n.int.length ) );
	const fracCols = Math.max( 0, ...numbers.map( ( n ) => n.frac.length ) );
	const cols = intCols + fracCols;
	const cell = Math.min(
		( width - ( fracCols ? 24 * scale : 0 ) ) / cols,
		110 * scale
	);
	const dotW = fracCols ? cell * 0.25 : 0;
	const headH = cell * 0.5;
	const rowH = cell * 0.7;
	const blockH = o.blocks ? cell * 1.3 : 0;
	const fs = cell * 0.36;
	const parts = [];
	const colX = ( j ) => j * cell + ( j >= intCols ? dotW : 0 );
	const totalW = cols * cell + dotW;
	const totalH = headH + numbers.length * ( rowH + blockH );
	// Header.
	parts.push(
		`<rect x="0" y="0" width="${ r( totalW ) }" height="${ r(
			headH
		) }" fill="${ accent }" fill-opacity="0.14"/>`
	);
	for ( let j = 0; j < cols; j++ ) {
		const label =
			j < intCols
				? INT_LABELS[ intCols - 1 - j ] || ''
				: FRAC_LABELS[ j - intCols ] || '';
		parts.push(
			textEl( colX( j ) + cell / 2, headH / 2 + fs * 0.3, t( label ), {
				size: r( fs * 0.85 ),
				font,
				fill: ink,
				weight: 700,
				anchor: 'middle',
			} )
		);
	}
	// Rows.
	numbers.forEach( ( n, i ) => {
		const y0 = headH + i * ( rowH + blockH );
		const digits = [];
		for ( let j = 0; j < intCols; j++ ) {
			const k = n.int.length - intCols + j;
			digits.push( k >= 0 ? n.int[ k ] : '' );
		}
		for ( let j = 0; j < fracCols; j++ ) {
			digits.push( n.frac[ j ] || ( n.frac ? '0' : '' ) );
		}
		digits.forEach( ( d, j ) => {
			if ( d ) {
				parts.push(
					textEl(
						colX( j ) + cell / 2,
						y0 + rowH / 2 + fs * 0.35,
						d,
						{
							size: r( fs * 1.1 ),
							font,
							fill: ink,
							anchor: 'middle',
						}
					)
				);
			}
		} );
		if ( fracCols && n.frac ) {
			parts.push(
				`<circle cx="${ r( intCols * cell + dotW / 2 ) }" cy="${ r(
					y0 + rowH * 0.72
				) }" r="${ r( fs * 0.12 ) }" fill="${ ink }"/>`
			);
		}
		if ( o.blocks ) {
			const by = y0 + rowH;
			for ( let j = 0; j < intCols; j++ ) {
				const place = intCols - 1 - j;
				const count = digits[ j ] ? +digits[ j ] : 0;
				const x0 = colX( j ) + cell * 0.08;
				const u = cell * 0.115;
				if ( 2 === place ) {
					// Flats: 10 x 10 squares with a grid, side by side then wrapped.
					for ( let k = 0; k < count; k++ ) {
						const fx = x0 + ( k % 3 ) * u * 3.3;
						const fy = by + Math.floor( k / 3 ) * u * 3.3 + u * 0.3;
						parts.push(
							`<rect x="${ r( fx ) }" y="${ r(
								fy
							) }" width="${ r( u * 3 ) }" height="${ r(
								u * 3
							) }" fill="${ accent }" fill-opacity="0.25" stroke="${ ink }" stroke-width="1"/>`
						);
						for ( let g = 1; g < 10; g++ ) {
							parts.push(
								`<line x1="${ r(
									fx + ( u * 3 * g ) / 10
								) }" y1="${ r( fy ) }" x2="${ r(
									fx + ( u * 3 * g ) / 10
								) }" y2="${ r(
									fy + u * 3
								) }" stroke="${ ink }" stroke-width="0.4"/>`
							);
							parts.push(
								`<line x1="${ r( fx ) }" y1="${ r(
									fy + ( u * 3 * g ) / 10
								) }" x2="${ r( fx + u * 3 ) }" y2="${ r(
									fy + ( u * 3 * g ) / 10
								) }" stroke="${ ink }" stroke-width="0.4"/>`
							);
						}
					}
				} else if ( 1 === place ) {
					// Rods: 1 x 10, standing.
					for ( let k = 0; k < count; k++ ) {
						const rx = x0 + k * u * 1.1;
						const ry = by + u * 0.3;
						parts.push(
							`<rect x="${ r( rx ) }" y="${ r(
								ry
							) }" width="${ r( u * 0.8 ) }" height="${ r(
								u * 8
							) }" fill="${ accent }" fill-opacity="0.25" stroke="${ ink }" stroke-width="1"/>`
						);
						for ( let g = 1; g < 10; g++ ) {
							parts.push(
								`<line x1="${ r( rx ) }" y1="${ r(
									ry + ( u * 8 * g ) / 10
								) }" x2="${ r( rx + u * 0.8 ) }" y2="${ r(
									ry + ( u * 8 * g ) / 10
								) }" stroke="${ ink }" stroke-width="0.4"/>`
							);
						}
					}
				} else if ( 0 === place ) {
					// Cubes in two rows of five.
					for ( let k = 0; k < count; k++ ) {
						const cx = x0 + ( k % 5 ) * u * 1.15;
						const cy =
							by + u * 0.3 + Math.floor( k / 5 ) * u * 1.15;
						parts.push(
							`<rect x="${ r( cx ) }" y="${ r(
								cy
							) }" width="${ r( u * 0.9 ) }" height="${ r(
								u * 0.9
							) }" fill="${ accent }" fill-opacity="0.25" stroke="${ ink }" stroke-width="1"/>`
						);
					}
				}
			}
		}
	} );
	// Grid.
	for ( let i = 0; i <= numbers.length; i++ ) {
		const y = headH + i * ( rowH + blockH );
		parts.push(
			`<line x1="0" y1="${ r( y ) }" x2="${ r( totalW ) }" y2="${ r(
				y
			) }" stroke="${ ink }" stroke-width="${ 0 === i ? 1.8 : 1 }"/>`
		);
	}
	parts.push(
		`<line x1="0" y1="0" x2="${ r(
			totalW
		) }" y2="0" stroke="${ ink }" stroke-width="1.8"/>`
	);
	parts.push(
		`<line x1="0" y1="${ r( totalH ) }" x2="${ r( totalW ) }" y2="${ r(
			totalH
		) }" stroke="${ ink }" stroke-width="1.8"/>`
	);
	for ( let j = 0; j <= cols; j++ ) {
		const x = j < cols ? colX( j ) : totalW;
		parts.push(
			`<line x1="${ r( x ) }" y1="0" x2="${ r( x ) }" y2="${ r(
				totalH
			) }" stroke="${ ink }" stroke-width="${
				0 === j || cols === j ? 1.8 : 1
			}"/>`
		);
		if ( fracCols && j === intCols ) {
			parts.push(
				`<line x1="${ r( x + dotW ) }" y1="0" x2="${ r(
					x + dotW
				) }" y2="${ r( totalH ) }" stroke="${ ink }" stroke-width="1"/>`
			);
		}
	}
	void bg;
	return {
		inner: parts.join( '' ),
		w: r( totalW ),
		h: r( totalH ),
		warnings: [],
	};
}
