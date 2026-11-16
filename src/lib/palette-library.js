/**
 * Saved palettes (v1.432.0): pure list operations for the Color Schemer's
 * library. The shared /palettes store takes the whole list on every save
 * and keeps owners and other people's sets on the server side; these
 * helpers only build the next list. Twelve opaque colors per palette is
 * the store's contract (class-palettes.php).
 */

import { colorKey } from './color-replace';

export const PALETTE_MAX = 12;

/**
 * Colors as the store keeps them: unique opaque #rrggbb, in order, at most
 * PALETTE_MAX. Transparent entries (a theme's "Transparent") are dropped.
 *
 * @param {string[]} colors Any CSS colors.
 * @return {string[]} Palette colors.
 */
export function paletteColors( colors ) {
	const out = [];
	for ( const color of colors || [] ) {
		const c = colorKey( color );
		if ( ! c || c.alpha < 1 || out.includes( c.key ) ) {
			continue;
		}
		out.push( c.key );
		if ( out.length === PALETTE_MAX ) {
			break;
		}
	}
	return out;
}

/** Same id scheme as save-color-palette.js; the server keeps [a-z0-9]. */
export function newPaletteId() {
	return (
		'color' +
		Date.now().toString( 36 ) +
		Math.random().toString( 36 ).slice( 2, 8 )
	);
}

/**
 * The name, or the name with the next free number, so two palettes never
 * look alike in a picker.
 *
 * @param {Array}  sets     Palettes.
 * @param {string} name     Wanted name.
 * @param {string} exceptId The palette being renamed (keeps its own name).
 * @return {string} Free name.
 */
export function uniqueName( sets, name, exceptId = '' ) {
	const base = String( name || '' ).trim();
	const taken = new Set(
		sets.filter( ( s ) => s.id !== exceptId ).map( ( s ) => s.name )
	);
	if ( ! taken.has( base ) ) {
		return base;
	}
	let i = 2;
	while ( taken.has( `${ base } ${ i }` ) ) {
		i++;
	}
	return `${ base } ${ i }`;
}

export function addPalette( sets, { name, colors } ) {
	const entry = {
		id: newPaletteId(),
		name: uniqueName( sets, name ),
		colors: paletteColors( colors ),
	};
	return { sets: [ ...sets, entry ], entry };
}

export function updatePalette( sets, id, { name, colors } = {} ) {
	return sets.map( ( s ) =>
		s.id === id
			? {
					...s,
					...( undefined === name
						? {}
						: { name: uniqueName( sets, name, id ) || s.name } ),
					...( colors ? { colors: paletteColors( colors ) } : {} ),
			  }
			: s
	);
}

export function duplicatePalette( sets, id, name ) {
	const i = sets.findIndex( ( s ) => s.id === id );
	if ( i < 0 ) {
		return { sets, entry: null };
	}
	const entry = {
		id: newPaletteId(),
		name: uniqueName( sets, name ),
		colors: [ ...sets[ i ].colors ],
	};
	return {
		sets: [ ...sets.slice( 0, i + 1 ), entry, ...sets.slice( i + 1 ) ],
		entry,
	};
}

/**
 * Move one entry; `to` is the index it ends up at.
 *
 * @param {Array}  list Any list.
 * @param {number} from Current index.
 * @param {number} to   New index.
 * @return {Array} New list (the same list when nothing moves).
 */
export function moveItem( list, from, to ) {
	if (
		from === to ||
		from < 0 ||
		from >= list.length ||
		to < 0 ||
		to >= list.length
	) {
		return list;
	}
	const next = [ ...list ];
	const [ item ] = next.splice( from, 1 );
	next.splice( to, 0, item );
	return next;
}

export function removePalette( sets, id ) {
	const index = sets.findIndex( ( s ) => s.id === id );
	if ( index < 0 ) {
		return { sets, removed: null, index };
	}
	return {
		sets: sets.filter( ( s ) => s.id !== id ),
		removed: sets[ index ],
		index,
	};
}

/** Undo of removePalette: back at its old place, owner and id included. */
export function restorePalette( sets, entry, index ) {
	if ( ! entry || sets.some( ( s ) => s.id === entry.id ) ) {
		return sets;
	}
	const next = [ ...sets ];
	next.splice( Math.max( 0, Math.min( index, next.length ) ), 0, entry );
	return next;
}

/**
 * A palette as text to paste elsewhere (19.10.2026): a hex list, CSS
 * custom properties named after the palette, or JSON. The Color Schemer
 * had no way to take a palette out of the editor.
 *
 * @param {string[]} colors Hex colors.
 * @param {string}   format 'hex', 'css' or 'json'.
 * @param {string}   name   Palette name (for the CSS prefix and JSON).
 * @return {string} The text.
 */
export function paletteText( colors, format = 'hex', name = '' ) {
	const list = ( colors || [] ).filter( Boolean );
	if ( 'json' === format ) {
		return JSON.stringify(
			{ name: String( name || '' ), colors: list },
			null,
			2
		);
	}
	if ( 'css' === format ) {
		const slug =
			String( name || '' )
				.toLowerCase()
				.normalize( 'NFKD' )
				.replace( /[\u0300-\u036f]/g, '' )
				.replace( /[^a-z0-9]+/g, '-' )
				.replace( /^-+|-+$/g, '' ) || 'color';
		return (
			':root {\n' +
			list
				.map( ( c, i ) => `\t--${ slug }-${ i + 1 }: ${ c };` )
				.join( '\n' ) +
			'\n}'
		);
	}
	return list.join( '\n' );
}
