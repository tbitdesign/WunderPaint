/**
 * Tiny registration point between the wet watercolour controller (screens)
 * and the places that must never see a half-wet document (store history,
 * saving, exporting). The store cannot import from screens, so the
 * controller registers its flush here and the store calls it blind.
 */

let flushFn = null;

/**
 * @param {Function|null} fn Called before undo/redo/save/export; must
 *                           synchronously commit any wet paint.
 */
export function registerWetFlush( fn ) {
	flushFn = fn;
}

/** Commit any wet paint now. Safe to call when nothing is wet. */
export function runWetFlush() {
	if ( flushFn ) {
		flushFn();
	}
}
