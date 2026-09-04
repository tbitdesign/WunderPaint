/**
 * Text for a figure: paragraphs, bullets, **bold**, *italic* and inline
 * math in $...$, wrapped at a width. Widths come from env.measure (a
 * canvas in the browser); without it every character counts 0.55 em.
 * Math runs come from env.typeset (MathJax, flattened) and sit on the
 * line's baseline; without the engine they are drawn as slanted text.
 * Every run is its own <text>, so the importer keeps weight and slant.
 */
import { textEl, r } from './svg.js';

export const measureOf =
	( env, size, font, weight = 400, italic = false ) =>
	( s ) => {
		if ( env && env.measure ) {
			try {
				return env.measure( s, size, font, weight, italic );
			} catch ( e ) {
				// fall through
			}
		}
		return measureFallback( s, size ) * ( weight >= 600 ? 1.06 : 1 );
	};

export const measureFallback = ( text, size ) => text.length * size * 0.55;

export function parseInline( s ) {
	const out = [];
	const re = /\$([^$]+)\$|\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*/g;
	let last = 0;
	let m;
	const str = String( s || '' );
	while ( ( m = re.exec( str ) ) ) {
		if ( m.index > last ) {
			out.push( { kind: 'text', value: str.slice( last, m.index ) } );
		}
		if ( undefined !== m[ 1 ] ) {
			out.push( { kind: 'math', value: m[ 1 ] } );
		} else if ( undefined !== m[ 2 ] ) {
			out.push( { kind: 'bold', value: m[ 2 ] } );
		} else {
			out.push( { kind: 'italic', value: m[ 3 ] } );
		}
		last = m.index + m[ 0 ].length;
	}
	if ( last < str.length ) {
		out.push( { kind: 'text', value: str.slice( last ) } );
	}
	return out;
}

/** Paragraphs and bullet items out of the raw text. */
function paragraphsOf( text ) {
	const out = [];
	let buf = [];
	const flush = () => {
		if ( buf.length ) {
			out.push( { bullet: false, text: buf.join( ' ' ) } );
			buf = [];
		}
	};
	for ( const raw of String( text || '' ).split( '\n' ) ) {
		const line = raw.trim();
		if ( ! line ) {
			flush();
		} else if ( /^[-*•]\s+/.test( line ) ) {
			flush();
			out.push( { bullet: true, text: line.replace( /^[-*•]\s+/, '' ) } );
		} else {
			buf.push( line );
		}
	}
	flush();
	return out;
}

export function layoutText( text, o, env = {} ) {
	const size = o.size || 22;
	const font = o.font || 'Arial';
	const color = o.color || '#000';
	const baseWeight = o.weight || 400;
	const baseItalic = !! o.italic;
	const align = o.align || 'left';
	const lineHeight = o.lineHeight || 1.35;
	const width =
		Number.isFinite( o.width ) && o.width > 0 ? o.width : Infinity;
	const bullet = o.bullet || '•';
	const measure = ( s, weight, italic ) => {
		if ( env.measure ) {
			try {
				return env.measure( s, size, font, weight, italic );
			} catch ( e ) {
				// fall through
			}
		}
		return measureFallback( s, size ) * ( weight >= 600 ? 1.06 : 1 );
	};
	const styleOf = ( kind ) => ( {
		weight: 'bold' === kind ? 700 : baseWeight,
		italic: 'italic' === kind || 'math-plain' === kind ? true : baseItalic,
	} );

	/* Tokens: words and spaces per run, math as one atom. */
	const tokensOf = ( runs ) => {
		const toks = [];
		for ( const run of runs ) {
			if ( 'math' === run.kind ) {
				let flat = null;
				if ( env.typeset ) {
					try {
						flat = env.typeset( run.value, {
							size,
							color,
							display: false,
						} );
					} catch ( e ) {
						flat = null;
					}
				}
				if ( flat && flat.inner ) {
					toks.push( {
						kind: 'math',
						flat,
						w: flat.w,
						space: false,
					} );
				} else {
					const st = styleOf( 'math-plain' );
					toks.push( {
						kind: 'math-plain',
						text: run.value,
						w: measure( run.value, st.weight, st.italic ),
						space: false,
						...st,
					} );
				}
				continue;
			}
			const st = styleOf( run.kind );
			for ( const part of run.value.split( /(\s+)/ ) ) {
				if ( ! part ) {
					continue;
				}
				const isSpace = /^\s+$/.test( part );
				toks.push( {
					kind: run.kind,
					text: isSpace ? ' ' : part,
					w: measure( isSpace ? ' ' : part, st.weight, st.italic ),
					space: isSpace,
					...st,
				} );
			}
		}
		return toks;
	};

	const parts = [];
	let y = 0;
	let lines = 0;
	let maxW = 0;
	const paras = paragraphsOf( text );
	paras.forEach( ( para, pi ) => {
		const indent = para.bullet ? size * 1.4 : 0;
		const avail = width - indent;
		const toks = tokensOf( parseInline( para.text ) );
		// Greedy wrap.
		const rows = [];
		let row = [];
		let rowW = 0;
		for ( const tk of toks ) {
			if ( tk.space ) {
				if ( row.length ) {
					row.push( tk );
					rowW += tk.w;
				}
				continue;
			}
			if ( row.length && rowW + tk.w > avail ) {
				while ( row.length && row[ row.length - 1 ].space ) {
					rowW -= row.pop().w;
				}
				rows.push( { toks: row, w: rowW } );
				row = [];
				rowW = 0;
			}
			row.push( tk );
			rowW += tk.w;
		}
		while ( row.length && row[ row.length - 1 ].space ) {
			rowW -= row.pop().w;
		}
		if ( row.length || ! rows.length ) {
			rows.push( { toks: row, w: rowW } );
		}
		rows.forEach( ( ln, li ) => {
			let ascent = size * 0.8;
			let descent = size * 0.3;
			for ( const tk of ln.toks ) {
				if ( 'math' === tk.kind ) {
					ascent = Math.max( ascent, tk.flat.baseline );
					descent = Math.max( descent, tk.flat.h - tk.flat.baseline );
				}
			}
			const step = Math.max(
				size * lineHeight,
				ascent + descent + size * 0.2
			);
			const baseline = y + ( step - ( ascent + descent ) ) / 2 + ascent;
			const shift = Number.isFinite( avail )
				? ( avail - ln.w ) *
				  ( 'center' === align ? 0.5 : 'right' === align ? 1 : 0 )
				: 0;
			let x = indent + Math.max( 0, shift );
			if ( para.bullet && 0 === li ) {
				parts.push(
					textEl( indent - size * 0.9, baseline, bullet, {
						size,
						font,
						fill: color,
						weight: baseWeight,
						anchor: 'middle',
					} )
				);
			}
			// Merge neighbouring tokens of one style into one <text>.
			let cur = null;
			const flushRun = () => {
				if ( cur ) {
					parts.push(
						textEl( cur.x, baseline, cur.text, {
							size,
							font,
							fill: color,
							weight: cur.weight,
							italic: cur.italic,
						} )
					);
					cur = null;
				}
			};
			for ( const tk of ln.toks ) {
				if ( 'math' === tk.kind ) {
					flushRun();
					parts.push(
						`<g transform="translate(${ r( x ) } ${ r(
							baseline - tk.flat.baseline
						) })">${ tk.flat.inner }</g>`
					);
					x += tk.w;
					continue;
				}
				if ( ! cur && tk.space ) {
					// A leading space in a <text> collapses; just move on.
					x += tk.w;
					continue;
				}
				if (
					cur &&
					cur.weight === tk.weight &&
					cur.italic === tk.italic
				) {
					cur.text += tk.text;
				} else {
					flushRun();
					cur = {
						x,
						text: tk.text,
						weight: tk.weight,
						italic: tk.italic,
					};
				}
				x += tk.w;
			}
			flushRun();
			maxW = Math.max( maxW, indent + ln.w );
			y += step;
			lines++;
		} );
		if ( pi < paras.length - 1 ) {
			y += size * 0.6;
		}
	} );
	return {
		inner: parts.join( '' ),
		w: Number.isFinite( width ) ? width : r( maxW ),
		h: r( y ),
		lines,
	};
}

/**
 * The largest font size at which one line fits a box: width by measure,
 * height by the size itself. Names on tags and cards use this so long
 * names shrink instead of running off the piece.
 */
export function fitLine( text, o, env = {} ) {
	const maxSize = o.maxSize || 40;
	const minSize = o.minSize || 8;
	let size = maxSize;
	while ( size > minSize ) {
		const w = measureOf(
			env,
			size,
			o.font,
			o.weight || 400,
			o.italic
		)( text );
		if ( w <= o.w && size * 1.15 <= o.h ) {
			return { size: r( size ), width: r( w ) };
		}
		size -= Math.max( 0.5, size * 0.06 );
	}
	return {
		size: minSize,
		width: r(
			measureOf( env, minSize, o.font, o.weight || 400, o.italic )( text )
		),
	};
}
