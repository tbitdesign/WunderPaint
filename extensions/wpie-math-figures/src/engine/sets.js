/**
 * Sets as Venn diagrams: `A = {1, 2, 3}`, `B = {3, 4}`, `C = {4, 6}` (two
 * or three sets, a bare name is a set without listed elements), `U =
 * {1..10}` for the universe, `shade A ∩ B` (also & and, ∪ | or, \, A',
 * not, parentheses). Regions are hatched with horizontal lines computed
 * from the circle membership, so any combination works with plain lines.
 */
import { textEl, r } from './svg.js';

const expandRange = ( tk ) => {
	const m = /^(-?\d+)\s*\.\.\s*(-?\d+)$/.exec( tk );
	if ( ! m ) {
		return [ tk ];
	}
	const out = [];
	for ( let v = +m[ 1 ]; v <= +m[ 2 ] && out.length < 100; v++ ) {
		out.push( String( v ) );
	}
	return out;
};
const parseList = ( body ) =>
	body
		.replace( /^\{|\}$/g, '' )
		.split( /[,;]+/ )
		.map( ( s ) => s.trim() )
		.filter( Boolean )
		.flatMap( expandRange );

export function parseSets( text ) {
	const spec = { sets: [], universe: null, shade: new Set(), expr: [] };
	const errors = [];
	const lines = String( text || '' ).split( '\n' );
	lines.forEach( ( raw, i ) => {
		const line = raw.trim();
		if ( ! line ) {
			return;
		}
		let m = /^([A-Z])\s*=\s*(\{.*\}|.*)$/.exec( line );
		if ( m ) {
			const elements = parseList( m[ 2 ] );
			if ( 'U' === m[ 1 ] ) {
				spec.universe = elements;
			} else if ( spec.sets.length < 3 ) {
				spec.sets.push( { name: m[ 1 ], elements } );
			} else {
				errors.push( { line: i + 1, message: 'At most three sets' } );
			}
			return;
		}
		if ( /^[A-Z]$/.test( line ) ) {
			if ( spec.sets.length < 3 ) {
				spec.sets.push( { name: line, elements: [] } );
			} else {
				errors.push( { line: i + 1, message: 'At most three sets' } );
			}
			return;
		}
		m = /^shade\s+(.+)$/i.exec( line );
		if ( m ) {
			spec.expr.push( { line: i + 1, text: m[ 1 ] } );
			return;
		}
		errors.push( {
			line: i + 1,
			message: 'Commands: A = {1, 2, 3}, U = {1..10}, shade A ∩ B',
		} );
	} );
	const names = spec.sets.map( ( s ) => s.name );
	for ( const e of spec.expr ) {
		try {
			for ( const mask of regionsOf( e.text, names ) ) {
				spec.shade.add( mask );
			}
		} catch ( err ) {
			errors.push( { line: e.line, message: err.message } );
		}
	}
	return { spec, errors };
}

/** Which regions (bit masks over the sets) an expression covers. */
export function regionsOf( expr, names ) {
	const n = names.length;
	const all = [ ...Array( 1 << n ).keys() ];
	const toks =
		String( expr )
			.replace( /\band\b/gi, '∩' )
			.replace( /\bor\b/gi, '∪' )
			.replace( /\bnot\b/gi, '¬' )
			.replace( /\bwithout\b|\bminus\b/gi, '\\' )
			.replace( /&/g, '∩' )
			.replace( /\|/g, '∪' )
			.match( /[A-Z]|∩|∪|\\|'|¬|\(|\)/g ) || [];
	let p = 0;
	const peek = () => toks[ p ];
	const setOf = ( name ) => {
		const i = names.indexOf( name );
		if ( i < 0 ) {
			throw new Error( 'No set named ' + name );
		}
		return new Set( all.filter( ( m ) => m & ( 1 << i ) ) );
	};
	const complement = ( s ) => new Set( all.filter( ( m ) => ! s.has( m ) ) );
	const primary = () => {
		const tk = toks[ p++ ];
		let val;
		if ( '¬' === tk ) {
			val = complement( primary() );
		} else if ( '(' === tk ) {
			val = union();
			if ( ')' !== toks[ p++ ] ) {
				throw new Error( 'Missing )' );
			}
		} else if ( /^[A-Z]$/.test( tk || '' ) ) {
			val = setOf( tk );
		} else {
			throw new Error( 'Expected a set name' );
		}
		while ( "'" === peek() ) {
			p++;
			val = complement( val );
		}
		return val;
	};
	const inter = () => {
		let val = primary();
		while ( '∩' === peek() || '\\' === peek() ) {
			const op = toks[ p++ ];
			const rhs = primary();
			val = new Set(
				[ ...val ].filter( ( m ) =>
					'∩' === op ? rhs.has( m ) : ! rhs.has( m )
				)
			);
		}
		return val;
	};
	const union = () => {
		let val = inter();
		while ( '∪' === peek() ) {
			p++;
			val = new Set( [ ...val, ...inter() ] );
		}
		return val;
	};
	const out = union();
	if ( p < toks.length ) {
		throw new Error( 'Unexpected ' + toks[ p ] );
	}
	return out;
}

export function renderSets( spec, o ) {
	const scale = o.scale || 1;
	const width = o.width || 900;
	const ink = o.ink || '#000';
	const accent = o.accent || ink;
	const font = o.font || 'Arial';
	const fs = ( o.size || 22 ) * 0.9;
	const n = spec.sets.length;
	if ( ! n ) {
		return { inner: '', w: 0, h: 0, warnings: [] };
	}
	const W = Math.min( width, 720 * scale );
	const H = W * ( 3 === n ? 0.78 : 0.62 );
	const R = 3 === n ? W * 0.2 : W * 0.22;
	const cx = W / 2;
	const cy = H / 2 + ( 3 === n ? R * 0.1 : 0 );
	const centres =
		3 === n
			? [
					[ cx - R * 0.6, cy + R * 0.35 ],
					[ cx + R * 0.6, cy + R * 0.35 ],
					[ cx, cy - R * 0.68 ],
			  ]
			: 2 === n
			? [
					[ cx - R * 0.55, cy ],
					[ cx + R * 0.55, cy ],
			  ]
			: [ [ cx, cy ] ];
	const inside = ( x, y, i ) =>
		( x - centres[ i ][ 0 ] ) ** 2 + ( y - centres[ i ][ 1 ] ) ** 2 <=
		R * R;
	const maskAt = ( x, y ) => {
		let m = 0;
		for ( let i = 0; i < n; i++ ) {
			if ( inside( x, y, i ) ) {
				m |= 1 << i;
			}
		}
		return m;
	};
	const pad = fs * 0.6;
	const parts = [];
	parts.push(
		`<rect x="${ r( pad ) }" y="${ r( pad ) }" width="${ r(
			W - 2 * pad
		) }" height="${ r(
			H - 2 * pad
		) }" fill="none" stroke="${ ink }" stroke-width="${ r(
			1.5 * scale
		) }"/>`
	);
	// Hatching: horizontal lines through every shaded region.
	if ( spec.shade.size ) {
		const step = Math.max( 4, 6 * scale );
		const dx = 2;
		for ( let y = pad + step / 2; y < H - pad; y += step ) {
			let runStart = null;
			for ( let x = pad + 2; x <= W - pad - 2 + dx; x += dx ) {
				const on = x <= W - pad - 2 && spec.shade.has( maskAt( x, y ) );
				if ( on && null === runStart ) {
					runStart = x;
				} else if ( ! on && null !== runStart ) {
					parts.push(
						`<line x1="${ r( runStart ) }" y1="${ r(
							y
						) }" x2="${ r( x - dx ) }" y2="${ r(
							y
						) }" stroke="${ accent }" stroke-width="${ r(
							1.6 * scale
						) }" stroke-opacity="0.8"/>`
					);
					runStart = null;
				}
			}
		}
	}
	centres.forEach( ( c, i ) => {
		parts.push(
			`<circle cx="${ r( c[ 0 ] ) }" cy="${ r( c[ 1 ] ) }" r="${ r(
				R
			) }" fill="none" stroke="${ ink }" stroke-width="${ r(
				2 * scale
			) }"/>`
		);
		const ax = c[ 0 ] - cx;
		const ay = c[ 1 ] - cy;
		const len = Math.hypot( ax, ay ) || 1;
		const lx = c[ 0 ] + ( ax / len ) * R * 0.85 + ( 1 === n ? 0 : 0 );
		const ly = c[ 1 ] + ( ay / len ) * R * 0.85;
		parts.push(
			textEl(
				1 === n ? c[ 0 ] : lx,
				( 1 === n ? c[ 1 ] - R : ly ) - fs * 0.3,
				spec.sets[ i ].name,
				{
					size: r( fs * 1.1 ),
					font,
					fill: ink,
					weight: 700,
					anchor: 'middle',
				}
			)
		);
	} );
	parts.push(
		textEl( pad + fs * 0.5, pad + fs * 1.1, 'U', {
			size: r( fs ),
			font,
			fill: ink,
			weight: 700,
		} )
	);
	if ( false !== o.elements ) {
		// Elements per region: anchor = centroid of the region's sample points.
		const byRegion = new Map();
		const seen = new Set();
		const add = ( el, mask ) => {
			if ( seen.has( el ) ) {
				return;
			}
			seen.add( el );
			if ( ! byRegion.has( mask ) ) {
				byRegion.set( mask, [] );
			}
			byRegion.get( mask ).push( el );
		};
		const memberMask = ( el ) => {
			let m = 0;
			spec.sets.forEach( ( s, i ) => {
				if ( s.elements.includes( el ) ) {
					m |= 1 << i;
				}
			} );
			return m;
		};
		for ( const s of spec.sets ) {
			for ( const el of s.elements ) {
				add( el, memberMask( el ) );
			}
		}
		for ( const el of spec.universe || [] ) {
			add( el, memberMask( el ) );
		}
		const anchors = new Map();
		const sums = new Map();
		for ( let y = pad + 8; y < H - pad; y += 6 ) {
			for ( let x = pad + 8; x < W - pad; x += 6 ) {
				const m = maskAt( x, y );
				const s = sums.get( m ) || { x: 0, y: 0, k: 0 };
				s.x += x;
				s.y += y;
				s.k++;
				sums.set( m, s );
			}
		}
		for ( const [ m, s ] of sums ) {
			anchors.set( m, [ s.x / s.k, s.y / s.k ] );
		}
		// The outside region's centroid may sit inside a circle; use the bottom band instead.
		anchors.set( 0, [ cx, H - pad - fs * 1.2 ] );
		for ( const [ m, els ] of byRegion ) {
			const a = anchors.get( m );
			if ( ! a ) {
				continue;
			}
			const cols = Math.min( els.length, 3 === n ? 3 : 4 );
			const rows = Math.ceil( els.length / cols );
			const dxs = fs * 1.6;
			const dys = fs * 1.3;
			els.forEach( ( el, i ) => {
				const col = i % cols;
				const row = Math.floor( i / cols );
				const x = a[ 0 ] + ( col - ( cols - 1 ) / 2 ) * dxs;
				const y = a[ 1 ] + ( row - ( rows - 1 ) / 2 ) * dys + fs * 0.35;
				parts.push(
					textEl( x, y, el, {
						size: r( fs ),
						font,
						fill: ink,
						anchor: 'middle',
					} )
				);
			} );
		}
	}
	return { inner: parts.join( '' ), w: r( W ), h: r( H ), warnings: [] };
}
