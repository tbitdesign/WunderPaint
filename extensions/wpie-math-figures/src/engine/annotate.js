/**
 * Marked formulas: \mark{key}{...} in the LaTeX tags a part, the notes
 * say what to write next to it. Every note becomes a soft highlight
 * behind the part, a leader line and a label above or below the
 * formula; labels of one side that would overlap step down a row.
 */
import { textEl, r } from './svg.js';

const normHex = ( c ) => {
	const s = String( c || '' )
		.trim()
		.toLowerCase();
	if ( /^#[0-9a-f]{6}$/.test( s ) ) {
		return s;
	}
	const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec( s );
	return m ? '#' + m[ 1 ] + m[ 1 ] + m[ 2 ] + m[ 2 ] + m[ 3 ] + m[ 3 ] : null;
};

export function parseNotes( text ) {
	const notes = [];
	const errors = [];
	String( text || '' )
		.split( '\n' )
		.forEach( ( raw, i ) => {
			const line = raw.trim();
			if ( ! line ) {
				return;
			}
			let key;
			let label = null;
			let rest;
			let m = /^([A-Za-z0-9_]+)\s+"([^"]*)"\s*(.*)$/.exec( line );
			if ( m ) {
				key = m[ 1 ];
				label = m[ 2 ];
				rest = m[ 3 ];
			} else {
				m = /^([A-Za-z0-9_]+)\s+(.+)$/.exec( line );
				if ( ! m ) {
					errors.push( {
						line: i + 1,
						message: 'Expected: key "label" above|below #color',
					} );
					return;
				}
				key = m[ 1 ];
				rest = m[ 2 ];
			}
			let side = 'below';
			let color = null;
			const words = [];
			for ( const tk of rest.split( /\s+/ ).filter( Boolean ) ) {
				if ( /^(above|below)$/i.test( tk ) ) {
					side = tk.toLowerCase();
				} else if ( /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test( tk ) ) {
					color = normHex( tk );
				} else {
					words.push( tk );
				}
			}
			if ( null === label ) {
				label = words.join( ' ' );
			}
			if ( ! label ) {
				errors.push( {
					line: i + 1,
					message: 'Expected: key "label" above|below #color',
				} );
				return;
			}
			notes.push( { key, label, side, color } );
		} );
	return { notes, errors };
}

const DEFAULT_PALETTE = [
	'#1f6feb',
	'#2e8b57',
	'#e08a00',
	'#8e44ad',
	'#c0392b',
];

export function layoutMarks( formula, notes, o, env = {} ) {
	const { inner, w, h } = formula;
	const marks = formula.marks || {};
	const size = o.size || 18;
	const font = o.font || 'Arial';
	const opacity = undefined === o.opacity ? 0.25 : o.opacity;
	const palette =
		o.palette && o.palette.length
			? o.palette
			: [ o.accent || '#8d1436', ...DEFAULT_PALETTE ];
	const measure = ( s ) => {
		if ( env.measure ) {
			try {
				return env.measure( s, size, font, 400, false );
			} catch ( e ) {
				// fall through
			}
		}
		return s.length * size * 0.55;
	};
	const missing = [];
	const items = [];
	notes.forEach( ( n, i ) => {
		const mk = marks[ n.key ];
		if ( ! mk ) {
			missing.push( n.key );
			return;
		}
		const pad = undefined === o.pad ? 0.18 * mk.h + 4 : o.pad;
		items.push( {
			...n,
			mk,
			pad,
			color: n.color || palette[ i % palette.length ],
			lw: measure( n.label ),
			cx: mk.x + mk.w / 2,
			row: 0,
		} );
	} );
	const rowH = size * 1.5;
	const leaderGap = 10;
	const assignRows = ( list ) => {
		list.sort( ( a, b ) => a.cx - b.cx );
		const rows = [];
		for ( const it of list ) {
			let row = 0;
			while (
				rows[ row ] &&
				rows[ row ].some(
					( other ) =>
						Math.abs( other.cx - it.cx ) <
						( other.lw + it.lw ) / 2 + 8
				)
			) {
				row++;
			}
			( rows[ row ] = rows[ row ] || [] ).push( it );
			it.row = row;
		}
		return rows.length;
	};
	const above = items.filter( ( it ) => 'above' === it.side );
	const below = items.filter( ( it ) => 'below' === it.side );
	const nAbove = assignRows( above );
	const nBelow = assignRows( below );
	const padTop = nAbove ? leaderGap + nAbove * rowH + 6 : 0;
	const padBottom = nBelow ? leaderGap + nBelow * rowH + 6 : 0;

	const parts = [];
	// Highlights first, so they sit behind the glyphs.
	for ( const it of items ) {
		parts.push(
			`<rect x="${ r( it.mk.x - it.pad ) }" y="${ r(
				it.mk.y - it.pad + padTop
			) }" width="${ r( it.mk.w + 2 * it.pad ) }" height="${ r(
				it.mk.h + 2 * it.pad
			) }" rx="6" fill="${ it.color }" fill-opacity="${ opacity }"/>`
		);
	}
	parts.push( `<g transform="translate(0 ${ r( padTop ) })">${ inner }</g>` );
	let minX = 0;
	let maxX = w;
	for ( const it of items ) {
		const half = it.lw / 2;
		const cx =
			it.lw < w ? Math.min( w - half, Math.max( half, it.cx ) ) : it.cx;
		minX = Math.min( minX, cx - half );
		maxX = Math.max( maxX, cx + half );
		let y0;
		let baseline;
		let tip;
		if ( 'below' === it.side ) {
			y0 = it.mk.y + it.mk.h + it.pad + padTop;
			baseline = padTop + h + leaderGap + it.row * rowH + size * 0.9;
			tip = baseline - size * 0.85;
		} else {
			y0 = it.mk.y - it.pad + padTop;
			baseline = padTop - leaderGap - it.row * rowH - size * 0.3;
			tip = baseline + 4;
		}
		parts.push(
			`<line x1="${ r( it.cx ) }" y1="${ r( y0 ) }" x2="${ r(
				cx
			) }" y2="${ r( tip ) }" stroke="${ it.color }" stroke-width="1.5"/>`
		);
		parts.push(
			textEl( cx, baseline, it.label, {
				size,
				font,
				fill: it.color,
				anchor: 'middle',
			} )
		);
	}
	let out = parts.join( '' );
	if ( minX < 0 ) {
		out = `<g transform="translate(${ r( -minX ) } 0)">${ out }</g>`;
	}
	return {
		inner: out,
		w: r( maxX - minX ),
		h: r( padTop + h + padBottom ),
		missing,
	};
}
