/**
 * Where the edit field of a text layer goes, so that the text stands in the
 * field exactly where the renderer draws it.
 *
 * Three things the renderer does that a plain box at the layer's corner
 * does not:
 *
 * It hangs every line on the edge the text is aligned to: a centred line
 * stands around the middle of the box and a right-aligned one against its
 * right edge, also when the line is WIDER than the box (a point text whose
 * box was never fitted to it, or one that is typed longer). So the field
 * hangs on that edge too and grows away from it.
 *
 * It measures a line WITHOUT the letter spacing after its last letter. CSS
 * puts the spacing after every letter, the last one too. So the field is one
 * spacing wider than the box: a centred or right-aligned line then stands
 * where the renderer has it, and area text wraps at the same word.
 *
 * It turns the layer around the centre of its box. The field's own centre
 * lies elsewhere (its top is shifted onto the baseline, it grows with its
 * content), so the pivot is given in the field's own coordinates.
 *
 * All values are screen pixels; `left` counts from the layer's left edge and
 * `pivot` from the field's own top left corner.
 *
 * @param {Object} layer   Text layer.
 * @param {number} zoom    Canvas zoom.
 * @param {number} yOffset How far the field's top lies below the layer's top.
 * @return {{ tracking: number, left: number, pull: number, minWidth: number, width: (number|string), pivot: { x: number, y: number } }} Placement.
 */
export function textEditPlacement( layer, zoom, yOffset = 0 ) {
	const tracking = ( layer.letterSpacing || 0 ) * zoom;
	const boxW = ( layer.w || 0 ) * zoom;
	const hang = layer.textFit ? 'center' : layer.align;
	// Where the field's left edge goes, and by which share of its own width
	// the field is pulled back from there.
	let left = 0;
	let pull = 0;
	if ( 'center' === hang ) {
		left = ( boxW + tracking ) / 2;
		pull = 0.5;
	} else if ( 'right' === hang ) {
		left = boxW + tracking;
		pull = 1;
	}
	return {
		tracking,
		left,
		pull,
		minWidth: Math.max( 40, boxW + tracking ),
		// Point text is as wide as its lines and never wraps, as on the
		// canvas ('auto' wraps it where the window ends).
		width:
			layer.textFit || layer.fixedWidth ? boxW + tracking : 'max-content',
		pivot: {
			x: boxW / 2 - left,
			y: ( ( layer.h || 0 ) * zoom ) / 2 - yOffset,
		},
	};
}
