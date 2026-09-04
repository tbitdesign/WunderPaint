/**
 * Worked solutions: one step per line, `LaTeX | explanation`. The math
 * lines up at the first top-level equals sign (left sides right-aligned,
 * `= right side` in one column), the explanation sits in the text font
 * to the right, optional numbers `(n)` at the far right and arrows
 * (<=>, =>) at the far left. Rows without `=` are centred over the math.
 */
import { textEl, r } from './svg.js';
import { layoutText } from './text.js';

export function parseSteps( text ) {
	const steps = [];
	const errors = [];
	for ( const raw of String( text || '' ).split( '\n' ) ) {
		let s = raw.trim();
		if ( ! s ) {
			continue;
		}
		let arrow = '';
		const m = /^(<=>|=>|⇔|⇒)\s*/.exec( s );
		if ( m ) {
			arrow = '⇔' === m[ 1 ] ? '<=>' : '⇒' === m[ 1 ] ? '=>' : m[ 1 ];
			s = s.slice( m[ 0 ].length );
		}
		let latex = s;
		let note = '';
		const k = s.lastIndexOf( ' | ' );
		if ( k >= 0 ) {
			latex = s.slice( 0, k ).trim();
			note = s.slice( k + 3 ).trim();
		} else if ( s.endsWith( ' |' ) ) {
			latex = s.slice( 0, -2 ).trim();
		}
		steps.push( { latex, note, arrow } );
	}
	return { steps, errors };
}

/** First `=` outside braces and \left...\right; the right side keeps the sign. */
export function splitAtEquals( latex ) {
	const s = String( latex || '' );
	let depth = 0;
	let lr = 0;
	for ( let i = 0; i < s.length; i++ ) {
		const c = s[ i ];
		if ( '\\' === c ) {
			const m = /^\\([a-zA-Z]+|.)/.exec( s.slice( i ) );
			if ( m ) {
				if ( 'left' === m[ 1 ] ) {
					lr++;
				} else if ( 'right' === m[ 1 ] ) {
					lr--;
				}
				i += m[ 0 ].length - 1;
			}
			continue;
		}
		if ( '{' === c ) {
			depth++;
		} else if ( '}' === c ) {
			depth--;
		} else if ( '=' === c && 0 === depth && 0 === lr ) {
			return { lhs: s.slice( 0, i ), rhs: s.slice( i ) };
		}
	}
	return { lhs: s, rhs: '' };
}

export function layoutSteps( steps, o, env = {} ) {
	const size = o.size || 40;
	const textSize = o.textSize || 20;
	const font = o.font || 'Arial';
	const ink = o.ink || '#000';
	const muted = o.muted || ink;
	const numbered = !! o.numbered;
	const numberSize = o.numberSize || textSize;
	const rowGap = undefined === o.rowGap ? size * 0.5 : o.rowGap;
	const noteGap = undefined === o.noteGap ? 40 : o.noteGap;
	const width = o.width || 1200;
	const warnings = [];
	const typeset = env.typeset
		? ( latex ) => env.typeset( latex, { size, color: ink, display: true } )
		: null;
	const measure = ( s, sz ) => {
		if ( env.measure ) {
			try {
				return env.measure( s, sz, font, 400, false );
			} catch ( e ) {
				// fall through
			}
		}
		return s.length * sz * 0.55;
	};
	const plainBox = ( s ) => ( {
		inner: textEl( 0, size * 0.8, s, {
			size,
			font,
			fill: ink,
			italic: true,
		} ),
		w: measure( s, size ),
		h: size * 1.1,
		baseline: size * 0.8,
		plain: true,
	} );

	const rows = steps.map( ( st, i ) => {
		const row = { st, L: null, R: null, whole: null, A: null, note: null };
		const arrow = st.arrow || ( o.arrows && i > 0 ? '<=>' : '' );
		if ( typeset && st.latex.trim() ) {
			try {
				const { lhs, rhs } = splitAtEquals( st.latex );
				if ( rhs ) {
					row.L = lhs.trim()
						? typeset( lhs.trim() )
						: { inner: '', w: 0, h: 0, baseline: 0 };
					row.R = typeset( rhs.trim() );
				} else {
					row.whole = typeset( st.latex.trim() );
				}
				if ( arrow ) {
					row.A = typeset(
						'<=>' === arrow ? '\\Leftrightarrow' : '\\Rightarrow'
					);
				}
			} catch ( e ) {
				warnings.push( ( e && e.message ) || String( e ) );
				row.L = null;
				row.R = null;
				row.whole = plainBox( st.latex );
			}
		} else {
			row.whole = plainBox(
				( arrow ? ( '<=>' === arrow ? '⇔ ' : '⇒ ' ) : '' ) + st.latex
			);
		}
		return row;
	} );

	const arrowW = rows.reduce(
		( m, row ) => Math.max( m, row.A ? row.A.w : 0 ),
		0
	);
	const arrowCol = arrowW ? arrowW + size * 0.5 : 0;
	const eqGap = size * 0.25;
	const eqX =
		arrowCol +
		rows.reduce( ( m, row ) => Math.max( m, row.L ? row.L.w : 0 ), 0 );
	let mathRight = rows.reduce(
		( m, row ) => Math.max( m, row.R ? eqX + eqGap + row.R.w : 0 ),
		eqX
	);
	for ( const row of rows ) {
		if ( row.whole ) {
			mathRight = Math.max( mathRight, arrowCol + row.whole.w );
		}
	}
	const numberW = numbered
		? measure( '(' + rows.length + ')', numberSize ) + 20
		: 0;
	let noteX = mathRight + noteGap;
	let noteW = width - noteX - numberW;
	const notesBelow = noteW < 160;
	if ( notesBelow ) {
		noteX = arrowCol;
		noteW = width - arrowCol - numberW;
	}

	const parts = [];
	let y = 0;
	rows.forEach( ( row, i ) => {
		// Baselines line up: the row's ascent is the tallest baseline, its descent the deepest tail.
		const boxes = [ row.whole, row.L, row.R, row.A ].filter(
			( b ) => b && b.inner
		);
		const asc = boxes.reduce(
			( m, b ) => Math.max( m, b.baseline || 0 ),
			0
		);
		const desc = boxes.reduce(
			( m, b ) => Math.max( m, b.h - ( b.baseline || 0 ) ),
			0
		);
		const mathH = asc + desc;
		const note = row.st.note
			? layoutText(
					row.st.note,
					{ width: noteW, size: textSize, font, color: muted },
					env
			  )
			: null;
		const rowH = notesBelow
			? mathH + ( note ? note.h + 6 : 0 )
			: Math.max( mathH, note ? note.h : 0 );
		const mathTop = notesBelow ? y : y + ( rowH - mathH ) / 2;
		const place = ( box, x ) =>
			parts.push(
				`<g transform="translate(${ r( x ) } ${ r(
					mathTop + asc - ( box.baseline || 0 )
				) })">${ box.inner }</g>`
			);
		if ( row.A ) {
			place( row.A, 0 );
		}
		if ( row.whole ) {
			const span = mathRight - arrowCol;
			place(
				row.whole,
				row.whole.plain
					? arrowCol
					: arrowCol + Math.max( 0, ( span - row.whole.w ) / 2 )
			);
		} else {
			if ( row.L && row.L.inner ) {
				place( row.L, eqX - row.L.w );
			}
			place( row.R, eqX + eqGap );
		}
		if ( note ) {
			const noteTop = notesBelow
				? y + mathH + 6
				: y + ( rowH - note.h ) / 2;
			parts.push(
				`<g transform="translate(${ r( noteX ) } ${ r( noteTop ) })">${
					note.inner
				}</g>`
			);
		}
		if ( numbered ) {
			parts.push(
				textEl(
					width,
					y + rowH / 2 + numberSize * 0.35,
					'(' + ( i + 1 ) + ')',
					{ size: numberSize, font, fill: muted, anchor: 'end' }
				)
			);
		}
		y += rowH + rowGap;
	} );
	return {
		inner: parts.join( '' ),
		w: width,
		h: r( Math.max( 0, y - rowGap ) ),
		warnings,
	};
}
