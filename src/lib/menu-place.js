/**
 * Right-click menus stay on screen (21.10.2026). The layer menu opened at
 * the pointer and nothing checked the room: the layers panel sits on the
 * right, so the menu ran off the right edge every time. The canvas menu
 * guessed a width of 240 px and only measured the bottom.
 *
 * Measured once mounted: a menu that would run off the right edge opens to
 * the left of the pointer instead, one that would run off the bottom is
 * lifted, and neither ever starts outside the margin.
 *
 * @param {HTMLElement} el     The menu (position: fixed).
 * @param {number}      x      Pointer x (clientX).
 * @param {number}      y      Pointer y (clientY).
 * @param {number}      margin Distance kept from the window's edges.
 * @param {Window}      win    Window (for tests).
 * @return {{left: number, top: number}} Where the menu went.
 */
export function fitMenu( el, x, y, margin = 8, win = window ) {
	const r = el.getBoundingClientRect();
	const W = win.innerWidth,
		H = win.innerHeight;
	let left = x,
		top = y;
	if ( left + r.width > W - margin ) {
		// The other side of the pointer, as desktop menus do.
		left = x - r.width;
	}
	left = Math.max( margin, Math.min( left, W - margin - r.width ) );
	if ( top + r.height > H - margin ) {
		top = H - margin - r.height;
	}
	top = Math.max( margin, top );
	el.style.left = `${ left }px`;
	el.style.top = `${ top }px`;
	return { left, top };
}
