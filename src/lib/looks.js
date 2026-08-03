/**
 * One-click look math (v1.376.0): the pure halves of the local look
 * actions - Product Shot placement, Depth Fog ramp, Speed Blur taps.
 * Canvas and model work lives in local-image-ops.js; these stay plain
 * numbers so Jest can hold the recipes.
 */

/**
 * Place a subject bounding box on a clean product canvas: centered,
 * comfortable margins, sitting slightly below the optical center.
 *
 * @param {Object} bbox   Subject bounds { x, y, w, h } (source pixels).
 * @param {number} W      Canvas width.
 * @param {number} H      Canvas height.
 * @param {number} margin Margin as a fraction of the canvas (default 8%).
 * @return {Object} { x, y, w, h, scale } target rect + applied scale.
 */
export function fitProductRect( bbox, W, H, margin = 0.08 ) {
	const availW = W * ( 1 - 2 * margin );
	const availH = H * ( 1 - 2 * margin );
	// Fill the frame, but never blow a tiny cutout up beyond recognition.
	const scale = Math.min( availW / bbox.w, availH / bbox.h, 1.6 );
	const w = bbox.w * scale;
	const h = bbox.h * scale;
	const x = ( W - w ) / 2;
	// A product sits a touch low; keep the bottom margin honest.
	const y = Math.min( ( H - h ) / 2 + H * 0.03, H * ( 1 - margin ) - h );
	return { x, y, w, h, scale };
}

/**
 * Contact shadow ellipse under a placed subject rect.
 *
 * @param {Object} rect Placed rect { x, y, w, h }.
 * @return {Object} { cx, cy, rx, ry }.
 */
export function shadowEllipse( rect ) {
	return {
		cx: rect.x + rect.w / 2,
		cy: rect.y + rect.h - rect.w * 0.01,
		rx: rect.w * 0.44,
		ry: Math.max( 6, rect.w * 0.07 ),
	};
}

/**
 * Fog opacity for one depth byte. Depth Anything is inverse depth:
 * bright = near, dark = far - fog belongs to the dark end.
 *
 * @param {number} depthByte 0..255 depth value.
 * @param {number} strength  Ramp multiplier (~1).
 * @return {number} Fog alpha 0..0.9.
 */
export function fogAlphaAt( depthByte, strength = 1 ) {
	const far = 1 - depthByte / 255;
	return Math.min( 0.9, Math.pow( far, 1.4 ) * strength * 0.9 );
}

/**
 * Scale taps for a canvas zoom blur: N draws of the image scaled about
 * the center, last tap at 1 so the sharp frame wins the highlights.
 *
 * @param {number} taps     Number of draws.
 * @param {number} strength Total zoom range (0.12 = 12%).
 * @return {number[]} Ascending scales ending at 1.
 */
export function zoomOffsets( taps, strength ) {
	const offs = [];
	for ( let i = 0; i < taps; i++ ) {
		offs.push( 1 - strength * ( 1 - i / ( taps - 1 ) ) );
	}
	return offs;
}
