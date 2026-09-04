/**
 * Number lines from a small command list:
 *   range -2 8      step 1      minor 2       labels above|below
 *   point 3 "x"     point 2/3   point -1.5 "a" open
 *   interval [2, 5)             jump 3 -> 7 "+4"
 * Fractions are typeset as stacked fractions.
 */
import { parse, evaluate } from './expr.js';
import { svgDoc, textEl, r } from './svg.js';

function value( s ) {
	const m = /^(-?)(\d+)\s*\/\s*(\d+)$/.exec( s.trim() );
	if ( m ) {
		return {
			v: ( '-' === m[ 1 ] ? -1 : 1 ) * ( +m[ 2 ] / +m[ 3 ] ),
			frac: { sign: m[ 1 ], n: +m[ 2 ], d: +m[ 3 ] },
		};
	}
	const mixed = /^(-?)(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec( s.trim() );
	if ( mixed ) {
		return {
			v:
				( '-' === mixed[ 1 ] ? -1 : 1 ) *
				( +mixed[ 2 ] + +mixed[ 3 ] / +mixed[ 4 ] ),
			frac: {
				sign: mixed[ 1 ],
				whole: +mixed[ 2 ],
				n: +mixed[ 3 ],
				d: +mixed[ 4 ],
			},
		};
	}
	return { v: evaluate( parse( s ), {} ), frac: null };
}

export function parseNumberLine( text ) {
	const spec = {
		from: 0,
		to: 10,
		step: 1,
		minor: 0,
		labels: 'below',
		points: [],
		intervals: [],
		jumps: [],
	};
	const errors = [];
	String( text || '' )
		.split( /\r?\n/ )
		.forEach( ( raw, li ) => {
			const line0 = raw
				.replace( /^\s*#.*$/, '' )
				.replace( /\s\/\/.*$/, '' )
				.trim();
			if ( ! line0 ) {
				return;
			}
			try {
				const lm = /"([^"]*)"/.exec( line0 );
				const label = lm ? lm[ 1 ] : null;
				const line = line0.replace( /"[^"]*"/, '' ).trim();
				let m;
				if ( ( m = /^range\s+(\S+)\s+(\S+)$/i.exec( line ) ) ) {
					spec.from = value( m[ 1 ] ).v;
					spec.to = value( m[ 2 ] ).v;
				} else if ( ( m = /^step\s+(\S+)$/i.exec( line ) ) ) {
					spec.step = value( m[ 1 ] ).v;
				} else if ( ( m = /^minor\s+(\d+)$/i.exec( line ) ) ) {
					spec.minor = parseInt( m[ 1 ], 10 );
				} else if ( ( m = /^labels\s+(above|below)$/i.exec( line ) ) ) {
					spec.labels = m[ 1 ].toLowerCase();
				} else if (
					( m = /^point\s+(.+?)(\s+open)?$/i.exec( line ) )
				) {
					const val = value( m[ 1 ].trim() );
					spec.points.push( { ...val, label, open: !! m[ 2 ] } );
				} else if (
					( m =
						/^interval\s*([\[(])\s*(.+?)\s*,\s*(.+?)\s*([\])])$/i.exec(
							line
						) )
				) {
					spec.intervals.push( {
						a: value( m[ 2 ] ).v,
						b: value( m[ 3 ] ).v,
						openA: '(' === m[ 1 ],
						openB: ')' === m[ 4 ],
						label,
					} );
				} else if (
					( m = /^jump\s+(.+?)\s*(?:->|to)\s*(.+)$/i.exec( line ) )
				) {
					spec.jumps.push( {
						from: value( m[ 1 ] ).v,
						to: value( m[ 2 ] ).v,
						label,
					} );
				} else {
					throw new Error( 'Unknown command' );
				}
			} catch ( e ) {
				errors.push( {
					line: li + 1,
					message: ( e && e.message ) || String( e ),
				} );
			}
		} );
	if ( spec.to <= spec.from ) {
		spec.to = spec.from + 1;
	}
	if ( ! ( spec.step > 0 ) ) {
		spec.step = 1;
	}
	return { spec, errors };
}

/** A stacked fraction as svg children at (x, baselineY), centred. */
export function fractionEl( frac, x, y, fs, font, fill ) {
	const parts = [];
	const num = String( frac.n );
	const den = String( frac.d );
	const w = Math.max( num.length, den.length ) * fs * 0.6;
	let left = x;
	if ( frac.sign || frac.whole !== undefined ) {
		const pre =
			( frac.sign || '' ) +
			( frac.whole !== undefined ? frac.whole : '' );
		parts.push(
			textEl( x - w / 2 - fs * 0.15, y + fs * 0.35, pre, {
				size: fs,
				font,
				fill,
				anchor: 'end',
			} )
		);
		left = x;
	}
	parts.push(
		textEl( left, y - fs * 0.15, num, {
			size: fs * 0.85,
			font,
			fill,
			anchor: 'middle',
		} )
	);
	parts.push(
		`<line x1="${ r( left - w / 2 ) }" y1="${ r(
			y + fs * 0.05
		) }" x2="${ r( left + w / 2 ) }" y2="${ r(
			y + fs * 0.05
		) }" stroke="${ fill }" stroke-width="${ r( fs * 0.07 ) }"/>`
	);
	parts.push(
		textEl( left, y + fs * 0.95, den, {
			size: fs * 0.85,
			font,
			fill,
			anchor: 'middle',
		} )
	);
	return parts.join( '' );
}

const fmt = ( v ) => {
	const s = String( Math.round( v * 1e6 ) / 1e6 );
	return s;
};

export function renderNumberLine( spec, o ) {
	const ink = o.ink || '#111111';
	const accent = o.accent || '#8d1436';
	const font = o.font || 'Arial';
	const fs = o.fontSize || 22;
	const width = o.width;
	const margin = fs * 2.2;
	const above = 'above' === spec.labels;
	const hasJumps = spec.jumps.length > 0;
	const top = fs * ( hasJumps ? 4.2 : 2.6 ) + ( above ? fs * 1.6 : 0 );
	const height =
		o.height ||
		Math.round( top + fs * 3.4 + ( spec.intervals.length ? fs : 0 ) );
	const y = top;
	const X = ( v ) =>
		margin +
		( ( v - spec.from ) / ( spec.to - spec.from ) ) *
			( width - 2 * margin );
	const children = [];
	const lineEl = ( x1, y1, x2, y2, stroke, w ) =>
		`<line x1="${ r( x1 ) }" y1="${ r( y1 ) }" x2="${ r( x2 ) }" y2="${ r(
			y2
		) }" stroke="${ stroke }" stroke-width="${ r(
			w
		) }" stroke-linecap="round"/>`;
	// Intervals under the line.
	for ( const iv of spec.intervals ) {
		const xa = X( Math.max( spec.from, iv.a ) );
		const xb = X( Math.min( spec.to, iv.b ) );
		children.push(
			`<rect x="${ r( xa ) }" y="${ r( y - fs * 0.5 ) }" width="${ r(
				xb - xa
			) }" height="${ r( fs ) }" fill="${ accent }" opacity="0.18"/>`
		);
		children.push( lineEl( xa, y, xb, y, accent, fs * 0.18 ) );
		for ( const [ xx, open ] of [
			[ X( iv.a ), iv.openA ],
			[ X( iv.b ), iv.openB ],
		] ) {
			children.push(
				`<circle cx="${ r( xx ) }" cy="${ r( y ) }" r="${ r(
					fs * 0.3
				) }" fill="${
					open ? o.bg || '#ffffff' : accent
				}" stroke="${ accent }" stroke-width="${ r( fs * 0.12 ) }"/>`
			);
		}
		if ( iv.label ) {
			children.push(
				textEl(
					( xa + xb ) / 2,
					y + fs * ( above ? -1.2 : 2.6 ),
					iv.label,
					{ size: fs * 0.9, font, fill: accent, anchor: 'middle' }
				)
			);
		}
	}
	// The line with arrow heads.
	children.push(
		lineEl( margin - fs * 0.8, y, width - margin + fs * 0.8, y, ink, 2.4 )
	);
	const ah = fs * 0.55;
	children.push(
		`<path d="M${ r( width - margin + fs * 0.8 ) } ${ r( y ) }l${ r(
			-ah
		) } ${ r( -ah * 0.45 ) }v${ r( ah * 0.9 ) }z" fill="${ ink }"/>`
	);
	children.push(
		`<path d="M${ r( margin - fs * 0.8 ) } ${ r( y ) }l${ r( ah ) } ${ r(
			-ah * 0.45
		) }v${ r( ah * 0.9 ) }z" fill="${ ink }"/>`
	);
	// Ticks.
	const step = spec.step;
	const minor = Math.max( 0, spec.minor | 0 );
	const sub = minor + 1;
	const labY = above ? y - fs * 0.9 : y + fs * 1.5;
	for (
		let k = Math.ceil( ( spec.from / step ) * sub - 1e-9 );
		( k * step ) / sub <= spec.to + 1e-9;
		k++
	) {
		const v = ( k * step ) / sub;
		const major = 0 === k % sub;
		const h = major ? fs * 0.5 : fs * 0.28;
		children.push(
			lineEl( X( v ), y - h, X( v ), y + h, ink, major ? 2.2 : 1.4 )
		);
		if ( major ) {
			children.push(
				textEl( X( v ), labY, fmt( v ), {
					size: fs * 0.9,
					font,
					fill: ink,
					anchor: 'middle',
				} )
			);
		}
	}
	// Jumps as arcs above the line.
	for ( const j of spec.jumps ) {
		const xa = X( j.from );
		const xb = X( j.to );
		const rad = Math.abs( xb - xa ) / 2;
		const hgt = Math.min( rad, fs * 2.4 );
		const d = `M${ r( xa ) } ${ r( y - fs * 0.6 ) }Q${ r(
			( xa + xb ) / 2
		) } ${ r( y - fs * 0.6 - hgt * 1.6 ) } ${ r( xb ) } ${ r(
			y - fs * 0.6
		) }`;
		children.push(
			`<path d="${ d }" fill="none" stroke="${ accent }" stroke-width="2.4"/>`
		);
		const dir = xb > xa ? 1 : -1;
		children.push(
			`<path d="M${ r( xb ) } ${ r( y - fs * 0.6 ) }l${ r(
				-dir * fs * 0.45
			) } ${ r( -fs * 0.5 ) }l${ r( dir * fs * 0.15 ) } ${ r(
				fs * 0.05
			) }z" fill="${ accent }"/>`
		);
		if ( j.label ) {
			children.push(
				textEl(
					( xa + xb ) / 2,
					y - fs * 0.6 - hgt * 0.8 - fs * 0.3,
					j.label,
					{ size: fs * 0.9, font, fill: accent, anchor: 'middle' }
				)
			);
		}
	}
	// Points.
	for ( const p of spec.points ) {
		const x = X( p.v );
		children.push(
			`<circle cx="${ r( x ) }" cy="${ r( y ) }" r="${ r(
				fs * 0.32
			) }" fill="${
				p.open ? o.bg || '#ffffff' : accent
			}" stroke="${ accent }" stroke-width="${ r( fs * 0.12 ) }"/>`
		);
		const py = above ? y + fs * 1.6 : y - fs * 1.0;
		if ( p.label ) {
			children.push(
				textEl( x, py + ( above ? 0 : 0 ), p.label, {
					size: fs,
					font,
					fill: accent,
					anchor: 'middle',
					weight: 700,
				} )
			);
		} else if ( p.frac ) {
			children.push(
				fractionEl(
					p.frac,
					x,
					above ? y + fs * 1.5 : y - fs * 1.9,
					fs * 0.9,
					font,
					accent
				)
			);
		} else {
			children.push(
				textEl( x, py, fmt( p.v ), {
					size: fs,
					font,
					fill: accent,
					anchor: 'middle',
					weight: 700,
				} )
			);
		}
	}
	return {
		svg: svgDoc( { width, height, bg: o.bg || null, children } ),
		width,
		height,
		warnings: [],
	};
}
