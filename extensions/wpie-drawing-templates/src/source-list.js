/**
 * The entries of the source dropdown, as data.
 *
 * This sits apart from main.js for one reason: the indentation rule below
 * is a real rule and it broke silently once. The list is a plain <select>,
 * and a browser collapses every run of ordinary spaces inside an <option> -
 * so an indent built from normal spaces is simply not on screen, and the
 * layer list looks flat no matter how deeply the layers are grouped. Kept
 * here it can be tested; inside the dialog it could not.
 */

// U+00A0 twice per level - the same indent Smart Diagrams uses for its
// category list. Written as an escape, not as literal characters, so the
// file stays plain ASCII and nobody can "tidy" the odd invisible glyphs
// back into normal spaces without noticing what they are.
export const INDENT = '\u00a0\u00a0';

/**
 * Flattens the layer tree into dropdown entries, deepest nesting kept as
 * indentation.
 *
 * A group is never a source of its own here, but it is listed all the
 * same, disabled: without its name above them the indented children would
 * be pushed to the right under nothing.
 *
 * @param {Array}  layers Editor layers, groups carrying `children`.
 * @param {number} depth  Nesting level, 0 at the top.
 * @return {Array} Entries `{ value, label, disabled }`; `value` is empty
 *                 for the group headings.
 */
export function sourceLayerOptions( layers, depth = 0, index = null ) {
	// The core keeps ONE FLAT layer list, and a group's `children` are layer
	// IDs, not layer objects (src/store/ops/edit-ops.js, editor-context.jsx).
	// Recursing into them handed this loop a string: `l.type` and `l.name` were
	// undefined, so every child fell into the second branch and became an entry
	// reading "undefined" with the value "layer:undefined" - selectable, and
	// selecting it gave no source. The same layers then appeared again, flat,
	// because the list they came from already contained them.
	//
	// Codex named exactly this in F15 and named the reason it stayed green: the
	// test fixture is a nested tree of layer objects, which the core never
	// produces.
	const list = layers || [];
	const map =
		index ||
		list.reduce( ( acc, l ) => {
			if ( l && l.id ) {
				acc[ l.id ] = l;
			}
			return acc;
		}, {} );

	const out = [];
	for ( const raw of list ) {
		// Anything that is not a layer object is an id: the core uses strings,
		// a caller may hand numbers, and both have to resolve.
		const l = raw && 'object' === typeof raw ? raw : map[ raw ];
		if ( ! l || ! l.id ) {
			continue;
		}
		// At the top level only the roots: the flat list holds the children
		// too, and without this every grouped layer was offered twice.
		if ( ! index && l.parent ) {
			continue;
		}
		const label = INDENT.repeat( depth ) + ( l.name || l.type );
		if ( 'group' === l.type ) {
			out.push( { value: '', label, disabled: true } );
			out.push( ...sourceLayerOptions( l.children, depth + 1, map ) );
			continue;
		}
		out.push( { value: 'layer:' + l.id, label, disabled: false } );
	}
	return out;
}
