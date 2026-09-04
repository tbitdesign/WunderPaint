/**
 * The last resort: what the crash screen can still do for the document.
 *
 * When a render error unmounts the editor, React runs every effect
 * cleanup BEFORE the boundary's componentDidCatch, so anything the crash
 * screen needs must already be parked here, outside React, and must never
 * be unregistered - a stale handler is still better than none. The editor
 * shell registers two things once it is up: a snapshot writer (the
 * autosave's immediate write) and the project download.
 */
let handlers = {};

/** Register (or replace) the handlers. Never unregistered on purpose. */
export function registerLastResort( next ) {
	handlers = { ...handlers, ...next };
}

/** True when a handler of that name exists. */
export const hasLastResort = ( name ) => 'function' === typeof handlers[ name ];

/** Write an autosave snapshot right now; false when there is nothing or it failed. */
export async function flushLastResort() {
	if ( ! hasLastResort( 'snapshot' ) ) {
		return false;
	}
	try {
		return !! ( await handlers.snapshot() );
	} catch ( e ) {
		return false;
	}
}

/** Hand the current document over as a .wpie download. */
export function downloadLastResort() {
	if ( ! hasLastResort( 'download' ) ) {
		return false;
	}
	try {
		handlers.download();
		return true;
	} catch ( e ) {
		return false;
	}
}

/** Tests only. */
export const __resetLastResort = () => {
	handlers = {};
};
