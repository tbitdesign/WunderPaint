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
export function sourceLayerOptions( layers, depth = 0 ) {
	const out = [];
	for ( const l of layers || [] ) {
		const label = INDENT.repeat( depth ) + ( l.name || l.type );
		if ( 'group' === l.type ) {
			out.push( { value: '', label, disabled: true } );
			out.push( ...sourceLayerOptions( l.children, depth + 1 ) );
			continue;
		}
		out.push( { value: 'layer:' + l.id, label, disabled: false } );
	}
	return out;
}
