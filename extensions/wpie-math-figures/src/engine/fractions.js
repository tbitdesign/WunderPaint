/**
 * Fraction pictures: "3/4, 1/2, 1 3/4" as circles, bars, grids or sets,
 * with the fraction typeset below each picture.
 */
import { svgDoc, r } from './svg.js';
import { fractionEl } from './numberline.js';

export function parseFractions( text ) {
	const out = [];
	const errors = [];
	String( text || '' )
		.split( /[,;\n]+/ )
		.map( ( s ) => s.trim() )
		.filter( Boolean )
		.forEach( ( s, i ) => {
			let m;
			if ( ( m = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec( s ) ) ) {
				out.push( { whole: +m[ 1 ], n: +m[ 2 ], d: +m[ 3 ], text: s } );
			} else if ( ( m = /^(\d+)\s*\/\s*(\d+)$/.exec( s ) ) ) {
				out.push( { whole: 0, n: +m[ 1 ], d: +m[ 2 ], text: s } );
			} else {
				errors.push( { line: i + 1, message: 'Not a fraction: ' + s } );
			}
		} );
	for ( const f of out ) {
		if ( f.d < 1 || f.d > 144 ) {
			errors.push( {
				line: 0,
				message: 'Denominator out of range: ' + f.text,
			} );
		}
	}
	return { fractions: out.filter( ( f ) => f.d >= 1 && f.d <= 144 ), errors };
}

/** One fraction picture at (0,0), returns { inner, w, h }. */
function picture( f, mode, size, accent, ink, bg ) {
	const parts = [];
	const total = f.whole * f.d + f.n;
	const wholes = Math.ceil( total / f.d ) || 1;
	const gap = size * 0.12;
	let w = 0;
	let h = size;
	const cell = ( idx ) => idx < total; // filled?
	if ( 'circle' === mode ) {
		for ( let k = 0; k < wholes; k++ ) {
			const cx = k * ( size + gap ) + size / 2;
			const cy = size / 2;
			const rad = size / 2;
			for ( let i = 0; i < f.d; i++ ) {
				const a0 = -Math.PI / 2 + ( 2 * Math.PI * i ) / f.d;
				const a1 = -Math.PI / 2 + ( 2 * Math.PI * ( i + 1 ) ) / f.d;
				const on = cell( k * f.d + i );
				const d =
					1 === f.d
						? `M${ r( cx ) } ${ r( cy - rad ) }A${ r( rad ) } ${ r(
								rad
						  ) } 0 1 1 ${ r( cx - 0.01 ) } ${ r( cy - rad ) }Z`
						: `M${ r( cx ) } ${ r( cy ) }L${ r(
								cx + rad * Math.cos( a0 )
						  ) } ${ r( cy + rad * Math.sin( a0 ) ) }A${ r(
								rad
						  ) } ${ r( rad ) } 0 ${
								a1 - a0 > Math.PI ? 1 : 0
						  } 1 ${ r( cx + rad * Math.cos( a1 ) ) } ${ r(
								cy + rad * Math.sin( a1 )
						  ) }Z`;
				parts.push(
					`<path d="${ d }" fill="${
						on ? accent : bg
					}" stroke="${ ink }" stroke-width="2" stroke-linejoin="round"/>`
				);
			}
		}
		w = wholes * size + ( wholes - 1 ) * gap;
	} else if ( 'bar' === mode ) {
		const bw = size * 2.2;
		const bh = size * 0.5;
		for ( let k = 0; k < wholes; k++ ) {
			const x0 = k * ( bw + gap );
			for ( let i = 0; i < f.d; i++ ) {
				const on = cell( k * f.d + i );
				parts.push(
					`<rect x="${ r( x0 + ( bw * i ) / f.d ) }" y="${ r(
						( size - bh ) / 2
					) }" width="${ r( bw / f.d ) }" height="${ r(
						bh
					) }" fill="${
						on ? accent : bg
					}" stroke="${ ink }" stroke-width="2"/>`
				);
			}
		}
		w = wholes * bw + ( wholes - 1 ) * gap;
	} else if ( 'grid' === mode ) {
		const cols = Math.ceil( Math.sqrt( f.d ) );
		const rows = Math.ceil( f.d / cols );
		const cw = size / cols;
		const ch = size / rows;
		for ( let k = 0; k < wholes; k++ ) {
			const x0 = k * ( size + gap );
			for ( let i = 0; i < f.d; i++ ) {
				const on = cell( k * f.d + i );
				parts.push(
					`<rect x="${ r( x0 + ( i % cols ) * cw ) }" y="${ r(
						Math.floor( i / cols ) * ch
					) }" width="${ r( cw ) }" height="${ r( ch ) }" fill="${
						on ? accent : bg
					}" stroke="${ ink }" stroke-width="2"/>`
				);
			}
		}
		w = wholes * size + ( wholes - 1 ) * gap;
		h = rows * ch;
	} else {
		// set: dots
		const cols = Math.min( f.d, 8 );
		const rows = Math.ceil( ( wholes * f.d ) / cols );
		const dot = size / 5;
		for ( let i = 0; i < wholes * f.d; i++ ) {
			const on = cell( i );
			parts.push(
				`<circle cx="${ r(
					( i % cols ) * dot * 1.4 + dot * 0.7
				) }" cy="${ r(
					Math.floor( i / cols ) * dot * 1.4 + dot * 0.7
				) }" r="${ r( dot * 0.5 ) }" fill="${
					on ? accent : bg
				}" stroke="${ ink }" stroke-width="2"/>`
			);
		}
		w = cols * dot * 1.4;
		h = rows * dot * 1.4;
	}
	return { inner: parts.join( '' ), w, h };
}

export function renderFractions( fractions, o ) {
	const ink = o.ink || '#111111';
	const accent = o.accent || '#8d1436';
	const bg = o.bg || '#ffffff';
	const font = o.font || 'Arial';
	const fs = o.fontSize || 30;
	const width = o.width;
	const size = o.size || 220;
	const mode = o.mode || 'circle';
	const margin = fs * 1.5;
	const gap = fs * 2;
	const tiles = fractions.map( ( f ) => ( {
		f,
		...picture( f, mode, size, accent, ink, bg ),
	} ) );
	// Wrap tiles into rows.
	const rows = [ [] ];
	let x = 0;
	for ( const t of tiles ) {
		if ( x + t.w > width - 2 * margin && rows[ rows.length - 1 ].length ) {
			rows.push( [] );
			x = 0;
		}
		rows[ rows.length - 1 ].push( t );
		x += t.w + gap;
	}
	const children = [];
	let y = margin;
	for ( const row of rows ) {
		const rowW =
			row.reduce( ( s, t ) => s + t.w, 0 ) + gap * ( row.length - 1 );
		let cx = ( width - rowW ) / 2;
		const rowH = Math.max( ...row.map( ( t ) => t.h ) );
		for ( const t of row ) {
			children.push(
				`<g transform="translate(${ r( cx ) } ${ r(
					y + ( rowH - t.h ) / 2
				) })">${ t.inner }</g>`
			);
			if ( false !== o.labels ) {
				children.push(
					fractionEl(
						{
							sign: '',
							whole: t.f.whole || undefined,
							n: t.f.n,
							d: t.f.d,
						},
						cx + t.w / 2 + ( t.f.whole ? fs * 0.3 : 0 ),
						y + rowH + fs * 1.3,
						fs,
						font,
						ink
					)
				);
			}
			cx += t.w + gap;
		}
		y += rowH + ( false !== o.labels ? fs * 2.6 : fs );
	}
	const height = o.height || Math.round( y + margin - fs * 0.5 );
	return {
		svg: svgDoc( { width, height, bg: o.bg || null, children } ),
		width,
		height,
		warnings: [],
	};
}
