/**
 * Probability trees from indented lines: `R 0.3`, two spaces deeper the
 * next stage. Probabilities as decimals, percent or fractions; an
 * optional "label" after the number. Path probabilities are multiplied
 * along the branches (fractions stay fractions and are reduced).
 */
import { textEl, r } from './svg.js';

const gcd = ( a, b ) => ( b ? gcd( b, a % b ) : a );

function parseProb( tk ) {
	let m;
	if ( ( m = /^(\d+)\/(\d+)$/.exec( tk ) ) && +m[ 2 ] > 0 ) {
		return {
			value: +m[ 1 ] / +m[ 2 ],
			text: tk,
			frac: [ +m[ 1 ], +m[ 2 ] ],
		};
	}
	if ( ( m = /^(\d+(?:[.,]\d+)?)\s*%$/.exec( tk ) ) ) {
		return {
			value: parseFloat( m[ 1 ].replace( ',', '.' ) ) / 100,
			text: tk,
			frac: null,
		};
	}
	if ( /^\d*[.,]?\d+$/.test( tk ) ) {
		return {
			value: parseFloat( tk.replace( ',', '.' ) ),
			text: tk.replace( ',', '.' ),
			frac: null,
		};
	}
	return null;
}

export function formatProb( p, format ) {
	if ( 'typed' === format || ! format ) {
		return p.text;
	}
	if ( 'percent' === format ) {
		return String( Math.round( p.value * 1000 ) / 10 ) + '%';
	}
	if ( 'fraction' === format ) {
		if ( p.frac ) {
			const g = gcd( p.frac[ 0 ], p.frac[ 1 ] ) || 1;
			return p.frac[ 0 ] / g + '/' + p.frac[ 1 ] / g;
		}
		for ( let d = 1; d <= 100; d++ ) {
			const nmr = Math.round( p.value * d );
			if ( Math.abs( nmr / d - p.value ) < 1e-9 ) {
				return nmr + '/' + d;
			}
		}
	}
	return String( Math.round( p.value * 100 ) / 100 );
}

export function parseTree( text ) {
	const root = { label: '', p: null, children: [], depth: -1 };
	const errors = [];
	const stack = [ root ];
	String( text || '' )
		.split( '\n' )
		.forEach( ( raw, i ) => {
			if ( ! raw.trim() ) {
				return;
			}
			const indent = raw
				.match( /^[ \t]*/ )[ 0 ]
				.replace( /\t/g, '  ' ).length;
			const depth = Math.round( indent / 2 );
			let line = raw.trim();
			let label = '';
			line = line
				.replace( /"([^"]*)"/, ( m, l ) => {
					label = l;
					return '';
				} )
				.trim();
			const toks = line.split( /\s+/ ).filter( Boolean );
			let p = null;
			let name = label;
			for ( const tk of toks ) {
				const pp = parseProb( tk );
				if ( pp && ! p ) {
					p = pp;
				} else if ( ! name ) {
					name = tk;
				} else if ( ! label ) {
					name += ' ' + tk;
				}
			}
			if ( ! p ) {
				errors.push( {
					line: i + 1,
					message:
						'Each branch needs a probability like 0.3, 30% or 1/3',
				} );
				return;
			}
			if ( depth > stack.length - 1 ) {
				errors.push( {
					line: i + 1,
					message: 'Indent by two spaces per stage',
				} );
				return;
			}
			stack.length = depth + 1;
			const node = { label: name, p, children: [], depth };
			stack[ depth ].children.push( node );
			stack.push( node );
		} );
	return { spec: { root }, errors };
}

const multiply = ( path ) => {
	if ( path.every( ( p ) => p.frac ) ) {
		let nmr = 1;
		let den = 1;
		for ( const p of path ) {
			nmr *= p.frac[ 0 ];
			den *= p.frac[ 1 ];
		}
		const g = gcd( nmr, den ) || 1;
		return {
			value: nmr / den,
			text: nmr / g + '/' + den / g,
			frac: [ nmr / g, den / g ],
		};
	}
	const value = path.reduce( ( a, p ) => a * p.value, 1 );
	return {
		value,
		text: String( Math.round( value * 10000 ) / 10000 ),
		frac: null,
	};
};

export function renderTree( spec, o ) {
	const scale = o.scale || 1;
	const width = o.width || 900;
	const ink = o.ink || '#000';
	const accent = o.accent || ink;
	const muted = o.muted || ink;
	const bg = o.bg || '#ffffff';
	const font = o.font || 'Arial';
	const fs = ( o.size || 22 ) * 0.9;
	const format = o.format || 'typed';
	const down = 'down' === o.direction;
	const root = spec.root;
	const leaves = [];
	let depth = 0;
	( function walk( node, path ) {
		depth = Math.max( depth, node.depth + 1 );
		if ( ! node.children.length && node !== root ) {
			node.path = path;
			leaves.push( node );
		}
		for ( const c of node.children ) {
			walk( c, [ ...path, c.p ] );
		}
	} )( root, [] );
	if ( ! leaves.length ) {
		return { inner: '', w: 0, h: 0, warnings: [] };
	}
	const leafGap = fs * 2.6;
	const levelGap = down
		? fs * 4.2
		: Math.min( fs * 9, ( width - fs * 6 ) / Math.max( 1, depth ) );
	const across = ( leaves.length - 1 ) * leafGap;
	leaves.forEach( ( l, i ) => ( l.t = i * leafGap ) );
	( function place( node ) {
		if ( node.children.length ) {
			for ( const c of node.children ) {
				place( c );
			}
			node.t =
				node.children.reduce( ( s, c ) => s + c.t, 0 ) /
				node.children.length;
		}
	} )( root );
	const pos = ( node ) => {
		const along = ( node.depth + 1 ) * levelGap;
		return down ? [ node.t + fs, along + fs ] : [ along + fs, node.t + fs ];
	};
	const parts = [];
	const labels = [];
	( function draw( node ) {
		const [ x1, y1 ] = pos( node );
		for ( const c of node.children ) {
			const [ x2, y2 ] = pos( c );
			parts.push(
				`<line x1="${ r( x1 ) }" y1="${ r( y1 ) }" x2="${ r(
					x2
				) }" y2="${ r( y2 ) }" stroke="${ ink }" stroke-width="${ r(
					1.8 * scale
				) }"/>`
			);
			const mx = ( x1 + x2 ) / 2;
			const my = ( y1 + y2 ) / 2;
			const txt = formatProb( c.p, format );
			const tw = txt.length * fs * 0.55 + fs * 0.5;
			labels.push(
				`<rect x="${ r( mx - tw / 2 ) }" y="${ r(
					my - fs * 0.65
				) }" width="${ r( tw ) }" height="${ r(
					fs * 1.2
				) }" rx="4" fill="${ bg }"/>`
			);
			labels.push(
				textEl( mx, my + fs * 0.3, txt, {
					size: r( fs * 0.85 ),
					font,
					fill: accent,
					anchor: 'middle',
				} )
			);
			draw( c );
		}
		if ( node !== root ) {
			labels.push(
				`<circle cx="${ r( x1 ) }" cy="${ r( y1 ) }" r="${ r(
					fs * 0.22
				) }" fill="${ ink }"/>`
			);
			labels.push(
				textEl(
					down ? x1 : x1 + fs * 0.5,
					down ? y1 + fs * 1.1 : y1 - fs * 0.5,
					node.label,
					{
						size: r( fs ),
						font,
						fill: ink,
						weight: 700,
						anchor: down ? 'middle' : 'start',
					}
				)
			);
		} else {
			labels.push(
				`<circle cx="${ r( x1 ) }" cy="${ r( y1 ) }" r="${ r(
					fs * 0.3
				) }" fill="${ ink }"/>`
			);
		}
	} )( root );
	parts.push( ...labels );
	let maxX = 0;
	let maxY = 0;
	if ( o.paths ) {
		for ( const l of leaves ) {
			const [ x, y ] = pos( l );
			const txt = formatProb( multiply( l.path ), format );
			const px = down ? x : x + fs * 0.5;
			const py = down ? y + fs * 2.3 : y + fs * 1.0;
			parts.push(
				textEl( px, py, txt, {
					size: r( fs * 0.9 ),
					font,
					fill: muted,
					anchor: down ? 'middle' : 'start',
				} )
			);
			maxX = Math.max(
				maxX,
				px + ( down ? txt.length * fs * 0.3 : txt.length * fs * 0.6 )
			);
			maxY = Math.max( maxY, py + fs * 0.3 );
		}
	}
	const w = Math.max(
		maxX,
		down ? across + fs * 2 : ( depth + 0.5 ) * levelGap + fs * 6
	);
	const h = Math.max(
		maxY,
		down ? ( depth + 0.5 ) * levelGap + fs * 2.5 : across + fs * 2.5
	);
	return {
		inner: parts.join( '' ),
		w: r( Math.min( w, width ) ),
		h: r( h ),
		warnings: [],
	};
}
