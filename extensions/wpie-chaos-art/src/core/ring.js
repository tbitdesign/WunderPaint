/**
 * The snapshot ring: because nothing here can be repeated, the moments
 * keep themselves. A fixed-size ring of the last ~two minutes; the
 * moment picker reads it oldest-first after Stop.
 */

export function makeRing( cap = 48 ) {
	const items = [];
	return {
		cap,
		push( item ) {
			items.push( item );
			while ( items.length > cap ) {
				items.shift();
			}
		},
		list() {
			return items.slice();
		},
		size() {
			return items.length;
		},
		clear() {
			items.length = 0;
		},
	};
}
