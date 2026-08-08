/**
 * Pure token helpers (no DOM, no highlight.js) so they can be unit tested:
 * the highlight.js scope -> theme key map, tab expansion and line splitting.
 */

// highlight.js emits classes like `hljs-title function_`; we key off the first
// class with the `hljs-` prefix stripped and map it to a theme colour key.
const SCOPE = {
	comment: 'comment',
	quote: 'comment',
	deletion: 'comment',
	keyword: 'keyword',
	'selector-tag': 'keyword',
	literal: 'keyword',
	doctag: 'keyword',
	tag: 'keyword',
	'meta-keyword': 'keyword',
	built_in: 'builtin',
	type: 'builtin',
	class: 'builtin',
	string: 'string',
	regexp: 'string',
	char: 'string',
	symbol: 'string',
	addition: 'string',
	'template-tag': 'string',
	'template-variable': 'string',
	'selector-attr': 'string',
	'selector-pseudo': 'string',
	number: 'number',
	boolean: 'number',
	title: 'function',
	function: 'function',
	section: 'function',
	name: 'function',
	attr: 'attr',
	attribute: 'attr',
	property: 'attr',
	variable: 'attr',
	'selector-id': 'attr',
	'selector-class': 'attr',
	meta: 'meta',
	'meta-string': 'string',
	'meta-prompt': 'meta',
	operator: 'punctuation',
	punctuation: 'punctuation',
	bullet: 'punctuation',
	subst: 'text',
	params: 'text',
};

export function colorKeyFor( cls ) {
	if ( ! cls ) {
		return 'text';
	}
	return SCOPE[ cls ] || 'text';
}

export function escapeHtml( s ) {
	return String( s ).replace(
		/[&<>]/g,
		( c ) => ( { '&': '&amp;', '<': '&lt;', '>': '&gt;' } )[ c ]
	);
}

export function unescapeHtml( s ) {
	return String( s ).replace(
		/&(amp|lt|gt|quot|#x27|#39);/g,
		( _, e ) =>
			( {
				amp: '&',
				lt: '<',
				gt: '>',
				quot: '"',
				'#x27': "'",
				'#39': "'",
			} )[ e ]
	);
}

/**
 * Parse highlight.js's (fully escaped, span-only) HTML into a flat run list
 * WITHOUT touching the DOM - the code text is already escaped by highlight.js,
 * and a string parser avoids innerHTML entirely and stays pure/testable.
 *
 * @param {string} html highlight.js `.value` markup.
 * @return {Array} runs [{text, key}].
 */
export function htmlToRuns( html ) {
	const runs = [];
	const stack = [ 'text' ];
	const re = /<[^>]+>/g;
	let m,
		last = 0;
	const push = ( raw ) => {
		if ( raw ) {
			runs.push( {
				text: unescapeHtml( raw ),
				key: stack[ stack.length - 1 ],
			} );
		}
	};
	while ( ( m = re.exec( String( html ) ) ) !== null ) {
		if ( m.index > last ) {
			push( html.slice( last, m.index ) );
		}
		const tag = m[ 0 ];
		if ( '/' === tag[ 1 ] ) {
			if ( stack.length > 1 ) {
				stack.pop();
			}
		} else {
			const cm = tag.match( /class="hljs-([a-z0-9_-]+)/i );
			stack.push(
				cm ? colorKeyFor( cm[ 1 ] ) : stack[ stack.length - 1 ]
			);
		}
		last = re.lastIndex;
	}
	if ( last < html.length ) {
		push( html.slice( last ) );
	}
	return runs.filter( ( r ) => r.text.length );
}

export function expandTabs( code, width = 2 ) {
	const pad = ' '.repeat( Math.max( 1, width ) );
	return String( code ).replace( /\t/g, pad );
}

/**
 * Parse a line spec like "2-4, 7 9" into a Set of 1-based line numbers,
 * clamped to `max` when given. Bad parts are ignored.
 *
 * @param {string} spec e.g. "2-4, 7".
 * @param {number} [max] Highest valid line.
 * @return {Set<number>}
 */
export function parseLineSpec( spec, max ) {
	const set = new Set();
	if ( ! spec ) {
		return set;
	}
	for ( const part of String( spec ).split( /[,\s]+/ ) ) {
		const m = part && part.match( /^(\d+)(?:-(\d+))?$/ );
		if ( ! m ) {
			continue;
		}
		let a = parseInt( m[ 1 ], 10 ),
			b = m[ 2 ] ? parseInt( m[ 2 ], 10 ) : a;
		if ( a > b ) {
			const tmp = a;
			a = b;
			b = tmp;
		}
		for ( let i = a; i <= b; i++ ) {
			if ( ! max || i <= max ) {
				set.add( i );
			}
		}
	}
	return set;
}

/**
 * Diff pre-pass: strip a leading +/- marker per line and record the type, so
 * the code below still highlights correctly while the renderer tints the row.
 * Lines without a marker are left untouched (indentation is never altered).
 *
 * @param {string} code Raw code (LF newlines).
 * @return {{ code: string, types: string[] }} types[i] in add|del|ctx.
 */
export function splitDiff( code ) {
	const lines = String( code ).split( '\n' );
	const out = [],
		types = [];
	for ( const ln of lines ) {
		const ch = ln.charAt( 0 );
		if ( '+' === ch ) {
			types.push( 'add' );
			out.push( ln.slice( 1 ) );
		} else if ( '-' === ch ) {
			types.push( 'del' );
			out.push( ln.slice( 1 ) );
		} else {
			types.push( 'ctx' );
			out.push( ln );
		}
	}
	return { code: out.join( '\n' ), types };
}

/**
 * Turn a flat run list ([{text,key}]) into an array of lines, each a run list.
 * Splits runs on newlines and preserves empty lines.
 *
 * @param {Array} runs Flat runs with embedded newlines.
 * @return {Array} lines[] of run[].
 */
export function splitLines( runs ) {
	const lines = [ [] ];
	for ( const r of runs ) {
		const parts = String( r.text ).split( '\n' );
		for ( let i = 0; i < parts.length; i++ ) {
			if ( i > 0 ) {
				lines.push( [] );
			}
			if ( parts[ i ] ) {
				lines[ lines.length - 1 ].push( {
					text: parts[ i ],
					key: r.key,
				} );
			}
		}
	}
	return lines;
}
