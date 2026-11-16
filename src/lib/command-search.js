/**
 * The title-bar search (v1.434, Thomas 27.09.2026): one index over the menu
 * model, the tools and the installed extensions, and a ranking that puts the
 * name before the words, the words before typos and all of it before the
 * menu path. Nothing here keeps a list of its own - every entry comes from a
 * source that is maintained anyway, so whatever the editor gains is found
 * without anyone remembering to add it.
 *
 * Pure module: the title bar and the command palette (Easy Mode, nested
 * editors) feed it and render the groups it returns.
 */
import { __ } from '@wordpress/i18n';

/** Result groups in their fixed order. */
export const SEARCH_GROUPS = [
	{ id: 'commands', label: __( 'Commands', 'wunderpaint' ) },
	{ id: 'tools', label: __( 'Tools', 'wunderpaint' ) },
	{ id: 'filters', label: __( 'Filters & Effects', 'wunderpaint' ) },
	{ id: 'extensions', label: __( 'Extensions', 'wunderpaint' ) },
];

/**
 * Lower case, accents off, ß as ss, every sign a space: "Gaußscher
 * Weichzeichner" and "gaussscher weichzeichner" are the same text.
 *
 * @param {string} text Any label.
 * @return {string} Comparable text.
 */
export function normalize( text ) {
	return String( text || '' )
		.toLowerCase()
		.replace( /ß/g, 'ss' )
		.normalize( 'NFD' )
		.replace( /[̀-ͯ]/g, '' )
		.replace( /[^a-z0-9]+/g, ' ' )
		.trim();
}

const wordsOf = ( texts ) => [
	...new Set(
		texts.map( normalize ).join( ' ' ).split( ' ' ).filter( Boolean )
	),
];

/**
 * Edit distance with swapped neighbours counted once (optimal string
 * alignment), cut off above `max`: only "is it close enough" matters.
 *
 * @param {string} a   First word.
 * @param {string} b   Second word.
 * @param {number} max Largest distance of interest.
 * @return {number} The distance, or max + 1 when it is larger.
 */
export function editDistance( a, b, max ) {
	if ( Math.abs( a.length - b.length ) > max ) {
		return max + 1;
	}
	let prev2 = null;
	let prev = Array.from( { length: b.length + 1 }, ( _, j ) => j );
	for ( let i = 1; i <= a.length; i++ ) {
		const row = [ i ];
		let best = i;
		for ( let j = 1; j <= b.length; j++ ) {
			const cost = a[ i - 1 ] === b[ j - 1 ] ? 0 : 1;
			let d = Math.min(
				prev[ j ] + 1,
				row[ j - 1 ] + 1,
				prev[ j - 1 ] + cost
			);
			if (
				prev2 &&
				i > 1 &&
				j > 1 &&
				a[ i - 1 ] === b[ j - 2 ] &&
				a[ i - 2 ] === b[ j - 1 ]
			) {
				d = Math.min( d, prev2[ j - 2 ] + 1 );
			}
			row.push( d );
			best = Math.min( best, d );
		}
		if ( best > max ) {
			return max + 1;
		}
		prev2 = prev;
		prev = row;
	}
	return prev[ b.length ];
}

/**
 * Translated label → English original, read backwards out of the editor's
 * own catalogue, so "Blur" finds "Gaußscher Weichzeichner" in a German
 * editor too.
 *
 * @param {Object} localeData wp.i18n locale data of the text domain.
 * @return {Function} ( label ) => English original, or '' when unknown.
 */
export function englishLookup( localeData ) {
	const back = new Map();
	for ( const [ key, value ] of Object.entries( localeData || {} ) ) {
		const msgstr = Array.isArray( value ) ? value[ 0 ] : '';
		if ( ! key || ! msgstr || back.has( msgstr ) ) {
			continue;
		}
		back.set( msgstr, key.split( '\u0004' ).pop() );
	}
	return ( label ) => back.get( label ) || '';
}

const GROUP_OF_MENU = { filter: 'filters', extensions: 'extensions' };

/**
 * Every runnable menu leaf and every tool as one flat list.
 *
 * Entries that cannot run right now stay in the index, `disabled`, with
 * the reason to show (Thomas 27.09.2026: filters without a selected layer
 * must not look missing).
 *
 * @param {Object}   src
 * @param {Array}    src.menus   The menu model: [{ id, label, items }].
 * @param {Array}    src.tools   Tools: [{ id, label, kbd }].
 * @param {Array}    src.items   More entries from the panels: { group,
 *                               label, hint, run, when?, reason?, alias? }.
 * @param {Function} src.runTool ( toolId ) => void.
 * @param {Function} src.english ( label ) => English original or ''.
 * @param {Object}   src.reasons Group id → why its menu entries may not run.
 * @return {Array} Entries: { key, group, label, hint, kbd, run, disabled,
 *                 reason, … }.
 */
export function buildSearchIndex( {
	menus = [],
	tools = [],
	items = [],
	runTool = () => {},
	english = () => '',
	reasons = {},
} ) {
	const out = [];
	const seen = new Set();
	const canRun = ( when ) => {
		try {
			return ! when || !! when();
		} catch ( e ) {
			return false;
		}
	};
	const add = ( entry, names, path ) => {
		const key = `${ entry.group }|${ entry.hint }|${ entry.label }`;
		if ( seen.has( key ) ) {
			return;
		}
		seen.add( key );
		const allNames = [
			...new Set(
				[ ...names, ...names.map( english ) ].filter( Boolean )
			),
		];
		out.push( {
			...entry,
			key,
			names: allNames.map( normalize ),
			nameWords: wordsOf( allNames ),
			pathWords: wordsOf( [ ...path, ...path.map( english ) ] ),
		} );
	};
	const walk = ( menu, entries, parents ) => {
		for ( const item of entries || [] ) {
			if ( ! item || item.head || item.divider ) {
				continue;
			}
			if ( Array.isArray( item.children ) ) {
				walk( menu, item.children, [ ...parents, item.label ] );
				continue;
			}
			if ( 'function' !== typeof item.run || ! item.label ) {
				continue;
			}
			const group = GROUP_OF_MENU[ menu.id ] || 'commands';
			const disabled = ! canRun( item.when );
			// An extension reads by its category, everything else by the
			// menu path it lives under.
			const shown =
				'extensions' === group ? parents : [ menu.label, ...parents ];
			add(
				{
					group,
					label: item.label,
					hint: shown.join( ' › ' ),
					kbd: item.kbd || '',
					run: item.run,
					disabled,
					reason: disabled ? reasons[ group ] || '' : '',
				},
				[ item.label, item.searchAlias ],
				[ menu.label, ...parents ]
			);
		}
	};
	for ( const menu of menus ) {
		walk( menu, menu.items, [] );
	}
	for ( const item of items ) {
		if ( 'function' !== typeof item.run || ! item.label ) {
			continue;
		}
		const disabled = ! canRun( item.when );
		add(
			{
				group: item.group,
				label: item.label,
				hint: item.hint || '',
				kbd: '',
				run: item.run,
				disabled,
				reason: disabled ? item.reason || '' : '',
			},
			[ item.label, item.alias ],
			[ item.hint || '' ]
		);
	}
	for ( const tool of tools ) {
		add(
			{
				group: 'tools',
				label: tool.label,
				hint: tool.kbd || '',
				kbd: tool.kbd || '',
				run: () => runTool( tool.id ),
				disabled: false,
				reason: '',
			},
			[ tool.label ],
			[]
		);
	}
	return out;
}

/**
 * How well one query word fits one word of an entry: the same word, its
 * beginning, a piece of it, then the typos - a shared beginning of four
 * letters in a word of about the same length ("halftauen" / "halftone") or
 * one or two slips of the finger.
 *
 * @param {string} q Query word.
 * @param {string} w Entry word.
 * @return {number} 0 when it does not fit.
 */
function wordScore( q, w ) {
	if ( w === q ) {
		return 100;
	}
	if ( w.startsWith( q ) ) {
		return 80;
	}
	if ( q.length >= 3 && w.includes( q ) ) {
		return 50;
	}
	if ( q.length >= 4 && w.length >= 4 ) {
		let shared = 0;
		while ( shared < q.length && q[ shared ] === w[ shared ] ) {
			shared++;
		}
		// A slip keeps about the length of the word: "schatten" shares
		// "scha" with "scharfzeichnen" and is still another word.
		if ( shared >= 4 && Math.abs( w.length - q.length ) <= 3 ) {
			return 40;
		}
		const max = q.length >= 8 ? 2 : 1;
		if ( editDistance( q, w, max ) <= max ) {
			return 35;
		}
	}
	return 0;
}

function scoreEntry( entry, words, whole ) {
	let total = 0;
	for ( const q of words ) {
		let best = 0;
		for ( const w of entry.nameWords ) {
			best = Math.max( best, wordScore( q, w ) );
		}
		if ( ! best ) {
			for ( const w of entry.pathWords ) {
				const s = wordScore( q, w );
				best = Math.max( best, s >= 80 ? 30 : s && 15 );
			}
		}
		if ( ! best ) {
			return 0;
		}
		total += best;
	}
	if ( entry.names.includes( whole ) ) {
		total += 1000;
	} else if ( entry.names.some( ( n ) => n.startsWith( whole ) ) ) {
		total += 500;
	}
	return total;
}

/**
 * Search the index: every query word has to fit the name or the path.
 *
 * @param {Array}  index            From buildSearchIndex().
 * @param {string} query            What the user typed.
 * @param {Object} [opts]
 * @param {number} [opts.perGroup] Best hits kept per group.
 * @return {Array} Non-empty groups in SEARCH_GROUPS order:
 *                 [{ id, label, items: [ entry + { score } ] }].
 */
export function searchIndex( index, query, { perGroup = 6 } = {} ) {
	const whole = normalize( query );
	if ( ! whole ) {
		return [];
	}
	const words = whole.split( ' ' );
	const hits = new Map();
	for ( const entry of index ) {
		const score = scoreEntry( entry, words, whole );
		if ( score > 0 ) {
			const list = hits.get( entry.group ) || [];
			list.push( { ...entry, score } );
			hits.set( entry.group, list );
		}
	}
	return SEARCH_GROUPS.filter( ( g ) => hits.has( g.id ) ).map( ( g ) => ( {
		...g,
		items: hits
			.get( g.id )
			.sort(
				// A greyed hit keeps the rank its match earns, so a weak
				// runnable hit never pushes it out of the list.
				( a, b ) =>
					b.score - a.score ||
					a.disabled - b.disabled ||
					a.label.length - b.label.length ||
					a.label.localeCompare( b.label )
			)
			.slice( 0, perGroup ),
	} ) );
}

/**
 * The hit to mark first: the best match, even in a later group; of two
 * equal ones the one that can run. A greyed hit marked this way says why on
 * Enter instead of something else running.
 *
 * @param {Array} rows Hits in list order.
 * @return {Object|null} The hit, or null for none.
 */
export function bestHit( rows ) {
	return rows.reduce(
		( top, row ) =>
			! top ||
			row.score > top.score ||
			( row.score === top.score && top.disabled && ! row.disabled )
				? row
				: top,
		null
	);
}
