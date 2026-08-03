/**
 * Text spacing you can pull (v1.371).
 *
 * Tracking and leading are the two numbers a designer changes most and the
 * two that are hardest to guess from a field: 0.5 or 1.5 means nothing
 * until you see the line. They now have grips on the text box itself.
 *
 * Where the grips sit matters more than usual, because the text frame is
 * crowded: eight resize handles on the edges and the rotate handle hanging
 * off the bottom centre. So leading and tracking take the bottom edge at
 * the quarter and three-quarter marks, well clear of the rotate handle,
 * and width takes the middle of the right edge, which is where anyone
 * would reach for it.
 *
 * Width is the odd one out and worth stating plainly: dragging a resize
 * handle on a text layer scales the type, which is usually what you want
 * and never what you want when you are setting a measure. The width grip
 * changes the box alone and switches wrapping on, so the type keeps its
 * size and the lines break where you put the edge.
 */

/** How far outside the box the grips sit, in screen pixels. */
const OUT = 18;

/** Sensible limits, so one careless drag cannot make the text unreadable. */
const LINE_HEIGHT_RANGE = [ 0.5, 4 ];
const MIN_WIDTH = 24;

/**
 * Is this a text layer the grips should appear on?
 *
 * @param {Object} layer Any layer.
 * @return {boolean} True for a text layer.
 */
export const isTextLayer = ( layer ) => !! layer && 'text' === layer.type;

/**
 * Grip positions in LAYER coordinates, ready to be scaled by the zoom.
 *
 * @param {Object} layer Text layer.
 * @param {number} zoom  Current zoom, so the outset stays a screen distance.
 * @return {Object[]|null} [ { kind, x, y, cursor } ] or null.
 */
export function textGrips( layer, zoom ) {
	if ( ! isTextLayer( layer ) ) {
		return null;
	}
	const w = layer.w || 0;
	const h = layer.h || 0;
	const out = OUT / Math.max( zoom, 0.01 );
	return [
		{
			kind: 'textWidth',
			cls: 'text-width',
			icon: 'textWidth',
			x: w + out,
			y: h / 2,
			cursor: 'ew-resize',
		},
		{
			kind: 'textLeading',
			cls: 'text-leading',
			icon: 'lineSpacing',
			x: w * 0.25,
			y: h + out,
			cursor: 'ns-resize',
		},
		{
			kind: 'textTracking',
			cls: 'text-tracking',
			icon: 'letterSpacing',
			x: w * 0.75,
			y: h + out,
			cursor: 'ew-resize',
		},
	];
}

/**
 * Line height from a vertical drag.
 *
 * The drag is measured against the font size, so the same hand movement
 * means the same visual change on 12pt and on 200pt type.
 *
 * @param {Object} orig Layer as the gesture started.
 * @param {number} dy   Vertical movement in document units.
 * @return {number} The new line height.
 */
export function leadingFromDrag( orig, dy ) {
	const size = Math.max( 1, orig.fontSize || 16 );
	const next = ( orig.lineHeight || 1.05 ) + dy / size;
	return (
		Math.round(
			Math.max(
				LINE_HEIGHT_RANGE[ 0 ],
				Math.min( next, LINE_HEIGHT_RANGE[ 1 ] )
			) * 100
		) / 100
	);
}

/**
 * Letter spacing from a horizontal drag, in px, measured against the font
 * size for the same reason.
 *
 * @param {Object} orig Layer as the gesture started.
 * @param {number} dx   Horizontal movement in document units.
 * @return {number} The new letter spacing.
 */
export function trackingFromDrag( orig, dx ) {
	const size = Math.max( 1, orig.fontSize || 16 );
	const next = ( orig.letterSpacing || 0 ) + dx / 6;
	// Tighter than a third of the size turns words into knots; wider than
	// twice it stops being type.
	return (
		Math.round( Math.max( -size / 3, Math.min( next, size * 2 ) ) * 10 ) /
		10
	);
}

/**
 * Box width from a horizontal drag, and the wrap flag that goes with it.
 *
 * @param {Object} orig Layer as the gesture started.
 * @param {number} dx   Horizontal movement in document units.
 * @return {Object} { w, fixedWidth } patch.
 */
export function widthFromDrag( orig, dx ) {
	return {
		w: Math.max( MIN_WIDTH, Math.round( ( orig.w || 0 ) + dx ) ),
		fixedWidth: true,
	};
}
