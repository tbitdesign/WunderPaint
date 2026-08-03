/**
 * Easy Mode flag (v1.166.0): an OPTIONAL beginner shell - slim bar,
 * reduced tools, one guided panel - over the unchanged document model.
 * Default is always the full editor; Help > Easy Mode switches, the
 * choice persists like the theme does (localStorage). The module-level
 * flag lets non-React code (shortcuts, canvas context menu) read the
 * mode without threading props.
 */

const KEY = 'wpie-easy-mode';

let flag = false;
try {
	flag = '1' === window.localStorage?.getItem( KEY );
} catch ( e ) {
	// Storage blocked: easy mode simply starts off.
}

/** Whether the beginner shell is active. */
export const isEasyMode = () => flag;

/**
 * Flip the beginner shell on/off (persisted).
 *
 * @param {boolean} on Easy mode on?
 */
export function setEasyModeFlag( on ) {
	flag = !! on;
	try {
		window.localStorage?.setItem( KEY, flag ? '1' : '0' );
	} catch ( e ) {
		// Session-only then.
	}
}

// Keyboard shortcuts that stay live in easy mode: everyday editing,
// nothing that opens pro surfaces (masks, smart objects, panels, …).
const EASY_KEYS = new Set( [
	'z', // undo / redo (shift)
	'y', // redo
	's', // save
	'c', // copy
	'v', // paste
	'x', // cut
	'j', // duplicate
	'a', // select all
	'd', // deselect
	'g', // group
	'+', // zoom
	'-',
	'=',
	'0',
] );

/**
 * Whether a cmd/ctrl shortcut key may run in easy mode.
 *
 * @param {string} key Lowercased event key.
 * @return {boolean} Allowed.
 */
export const easyAllowsShortcut = ( key ) => EASY_KEYS.has( key );
