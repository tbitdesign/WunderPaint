/**
 * Deterministic layer ids for the Design Markup compiler: the same
 * element and part always map to the same id, so two compiles of one
 * markup are comparable. insertDesign() replaces them with uid().
 */
export function fnv1a( str ) {
	let h = 0x811c9dc5;
	for ( let i = 0; i < str.length; i++ ) {
		h ^= str.charCodeAt( i );
		h = Math.imul( h, 0x01000193 ) >>> 0;
	}
	return h >>> 0;
}

export const dmId = ( el, part = 'main' ) =>
	'dm-' + fnv1a( `${ el }:${ part }` ).toString( 36 );
