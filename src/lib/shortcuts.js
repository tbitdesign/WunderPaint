/**
 * Keyboard shortcut map (spec 04.5), table-driven, testable in isolation.
 *
 * `bindShortcuts(getContext)` attaches window listeners; getContext() returns
 * `{ editor, extras }` fresh per event (avoids stale closures).
 */

import { __ } from '@wordpress/i18n';

import { TOOLS } from '../store/constants';
import { easyAllowsShortcut, isEasyMode } from './easy-mode';
import { selectionUnits } from './selection-units';
import * as Ops from '../store/ops';

const isEditableTarget = ( target ) =>
	target &&
	( 'INPUT' === target.tagName ||
		'TEXTAREA' === target.tagName ||
		'SELECT' === target.tagName ||
		target.isContentEditable );

/** Normalize an event into a combo descriptor. */
export const comboOf = ( e ) => ( {
	key: e.key.length === 1 ? e.key.toLowerCase() : e.key,
	meta: e.metaKey || e.ctrlKey,
	shift: e.shiftKey,
	alt: e.altKey,
} );

/** Combo descriptor → canonical string ('mod+shift+z', 'v', '[' …). */
export const comboString = ( c ) =>
	[
		c.meta ? 'mod' : '',
		c.alt ? 'alt' : '',
		c.shift ? 'shift' : '',
		String( c.key ).toLowerCase(),
	]
		.filter( Boolean )
		.join( '+' );

/* --------------------- user overrides (v1.1) --------------------------- */

const OVERRIDE_KEY = 'wpie-shortcuts';
let overrideStorage = null;
try {
	overrideStorage = window.localStorage;
} catch ( e ) {
	overrideStorage = null;
}

/** Test hook. */
export const __setShortcutStorage = ( st ) => {
	overrideStorage = st;
};

/** @return {Object} id → combo string. */
export function listOverrides() {
	try {
		const raw = overrideStorage?.getItem( OVERRIDE_KEY );
		const map = raw ? JSON.parse( raw ) : {};
		return map && 'object' === typeof map ? map : {};
	} catch ( e ) {
		return {};
	}
}

/**
 * Remap a shortcut (null removes the override).
 *
 * @param {string}      id    Shortcut id.
 * @param {string|null} combo Combo string.
 * @return {Object} Updated override map.
 */
export function setShortcutOverride( id, combo ) {
	const map = listOverrides();
	if ( combo ) {
		map[ id ] = combo;
	} else {
		delete map[ id ];
	}
	try {
		overrideStorage?.setItem( OVERRIDE_KEY, JSON.stringify( map ) );
	} catch ( e ) {}
	return map;
}

/**
 * The shortcut table. Order matters: first match wins.
 * Each entry: { match(combo), run(editor, extras, e) }.
 */
export const SHORTCUTS = [
	// Undo / redo.
	{
		id: 'undo',
		match: ( c ) => c.meta && ! c.shift && 'z' === c.key,
		run: ( editor ) => editor.undo(),
	},
	{
		id: 'redo',
		match: ( c ) =>
			( c.meta && c.shift && 'z' === c.key ) ||
			( c.meta && 'y' === c.key ),
		run: ( editor ) => editor.redo(),
	},
	// Zoom.
	{
		id: 'zoom-in',
		match: ( c ) => c.meta && ( '+' === c.key || '=' === c.key ),
		run: ( editor ) =>
			editor.dispatch( {
				type: 'SET_ZOOM',
				zoom: editor.state.zoom * 1.25,
			} ),
	},
	{
		id: 'zoom-out',
		match: ( c ) => c.meta && '-' === c.key,
		run: ( editor ) =>
			editor.dispatch( {
				type: 'SET_ZOOM',
				zoom: editor.state.zoom / 1.25,
			} ),
	},
	{
		id: 'fit',
		match: ( c ) => c.meta && '0' === c.key,
		run: ( editor, extras ) => extras.viewApi.current?.fit(),
	},
	{
		id: 'zoom-100',
		match: ( c ) => c.meta && '1' === c.key,
		run: ( editor, extras ) => extras.viewApi.current?.zoomTo( 1 ),
	},
	// Selection.
	{
		id: 'select-all',
		match: ( c ) => c.meta && ! c.shift && 'a' === c.key,
		run: ( editor ) => Ops.selectAllOp( editor ),
	},
	{
		id: 'deselect',
		match: ( c ) => c.meta && 'd' === c.key,
		run: ( editor ) => Ops.deselectOp( editor ),
	},
	{
		id: 'inverse',
		match: ( c ) => c.meta && c.shift && 'i' === c.key,
		run: ( editor ) => Ops.inverseSelectionOp( editor ),
	},
	// Layers.
	{
		id: 'duplicate',
		match: ( c ) => c.meta && 'j' === c.key,
		run: ( editor ) => Ops.duplicateLayer( editor ),
	},
	{
		id: 'copy',
		match: ( c ) => c.meta && ! c.shift && 'c' === c.key,
		run: ( editor ) => Ops.copyLayers( editor ),
	},
	{
		id: 'cut',
		match: ( c ) => c.meta && 'x' === c.key,
		run: ( editor ) => Ops.copyLayers( editor, true ),
	},
	{
		id: 'paste',
		match: ( c ) => c.meta && 'v' === c.key,
		run: ( editor ) => Ops.pasteLayers( editor ),
	},
	{
		id: 'bring-forward',
		match: ( c ) => c.meta && ']' === c.key,
		run: ( editor ) => Ops.bringForwardOp( editor ),
	},
	{
		id: 'send-backward',
		match: ( c ) => c.meta && '[' === c.key,
		run: ( editor ) => Ops.sendBackwardOp( editor ),
	},
	{
		id: 'delete-layer',
		match: ( c ) =>
			! c.meta && ( 'Delete' === c.key || 'Backspace' === c.key ),
		run: ( editor ) => {
			if ( editor.state.selection ) {
				Ops.deleteWithinSelectionOp( editor );
			} else {
				Ops.deleteLayers( editor );
			}
		},
	},
	// Save.
	{
		id: 'save',
		match: ( c ) => c.meta && 's' === c.key,
		run: ( editor, extras ) => {
			// Demo mode: every save destination is read-only, the export
			// download is the one true save (v1.307).
			if ( window.WPIE?.demo ) {
				extras.openExport( 'export' );
				return;
			}
			// A doc bound to a design saves the design (v1.10); one opened
			// from a dynamic template updates that template (v1.160.0);
			// attachment docs keep saving to the library.
			if (
				editor.state.doc.source?.isNew &&
				editor.state.doc.source?.designId
			) {
				import( '../store/ops' ).then( ( mod ) =>
					mod.saveDesignOp( editor, extras )
				);
				return;
			}
			if (
				editor.state.doc.source?.isNew &&
				editor.state.doc.source?.templateId
			) {
				import( '../store/ops' ).then( ( mod ) =>
					mod.updateTemplateOp( editor, extras )
				);
				return;
			}
			extras.openExport(
				editor.state.doc.source?.isNew ? 'saveAs' : 'save'
			);
		},
	},
	// Brush size.
	{
		id: 'brush-smaller',
		match: ( c ) => ! c.meta && '[' === c.key,
		run: ( editor ) => {
			const tool = editor.state.tool;
			if ( [ 'brush', 'pencil', 'eraser' ].includes( tool ) ) {
				const size = editor.state.toolOpts[ tool ].size;
				editor.dispatch( {
					type: 'SET_TOOL_OPTS',
					tool,
					patch: {
						size: Math.max( 1, size - ( size > 10 ? 5 : 1 ) ),
					},
				} );
			}
		},
	},
	{
		id: 'brush-larger',
		match: ( c ) => ! c.meta && ']' === c.key,
		run: ( editor ) => {
			const tool = editor.state.tool;
			if ( [ 'brush', 'pencil', 'eraser' ].includes( tool ) ) {
				const size = editor.state.toolOpts[ tool ].size;
				editor.dispatch( {
					type: 'SET_TOOL_OPTS',
					tool,
					patch: { size: size + ( size >= 10 ? 5 : 1 ) },
				} );
			}
		},
	},
	// Nudge (arrow keys; Shift = 10px).
	{
		id: 'nudge',
		match: ( c ) =>
			! c.meta &&
			[ 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight' ].includes(
				c.key
			),
		run: ( editor, extras, e ) => {
			const selIds = editor.state.selectedIds.length
				? editor.state.selectedIds
				: editor.state.activeId
				? [ editor.state.activeId ]
				: [];
			if ( ! selIds.length ) {
				return;
			}
			// Selected groups nudge with all their descendants (v1.4); a
			// locked member freezes its whole unit (v1.66).
			const ids = selectionUnits( editor.state )
				.filter( ( u ) => ! u.locked )
				.flatMap( ( u ) => u.ids );
			if ( ! ids.length ) {
				return;
			}
			e?.preventDefault?.();
			const step = e?.shiftKey ? 10 : 1;
			const dx =
				'ArrowLeft' === e.key
					? -step
					: 'ArrowRight' === e.key
					? step
					: 0;
			const dy =
				'ArrowUp' === e.key ? -step : 'ArrowDown' === e.key ? step : 0;
			editor.dispatch( {
				type: 'UPDATE_LAYERS',
				ids,
				patchFor: ( l ) => ( { x: l.x + dx, y: l.y + dy } ),
			} );
			editor.commit( __( 'Nudge layer', 'wunderpaint' ) );
		},
	},
	// Quick insert palette (v1.11).
	{
		id: 'quick-insert',
		match: ( c ) => ! c.meta && '/' === c.key,
		run: ( editor, extras, e ) => {
			e?.preventDefault?.();
			extras.openQuickInsert?.();
		},
	},
	// Swap fg/bg.
	{
		id: 'swap-colors',
		match: ( c ) => ! c.meta && 'x' === c.key,
		run: ( editor ) => editor.dispatch( { type: 'SWAP_COLORS' } ),
	},
	// Enter/Escape (commit/cancel), handled per-tool by the canvas; the
	// fallback here cancels a crop or clears the selection.
	{
		id: 'escape',
		match: ( c ) => 'Escape' === c.key,
		run: ( editor, extras ) => {
			if ( extras.viewApi.current?.cancelDraft?.() ) {
				return;
			}
			if ( editor.state.crop ) {
				editor.dispatch( { type: 'SET_CROP', crop: null } );
				return;
			}
			// Step out one level when drilled into a group: a selected child
			// pops back up to its parent group (Figma/PowerPoint), the reverse
			// of click-to-drill on the canvas (v1.291.0).
			const active =
				editor.state.activeId &&
				editor.state.layers.find(
					( l ) => l.id === editor.state.activeId
				);
			if (
				active &&
				active.parent &&
				editor.state.layers.some( ( l ) => l.id === active.parent )
			) {
				editor.dispatch( { type: 'SET_ACTIVE', id: active.parent } );
				return;
			}
			if ( editor.state.selection ) {
				editor.dispatch( { type: 'SET_SELECTION', selection: null } );
			}
		},
	},
	{
		id: 'enter-commit',
		match: ( c ) => 'Enter' === c.key && ! c.meta,
		run: ( editor, extras ) => extras.viewApi.current?.commitDraft?.(),
	},
	// Handbook (v0.8).
	{
		id: 'help',
		match: ( c ) => '?' === c.key && ! c.meta,
		run: ( editor, extras, e ) => {
			// The dialog autofocuses its search box; without this the
			// same keystroke would type '?' into it.
			e?.preventDefault?.();
			extras.openHelp?.();
		},
	},
	// Layer opacity via digits (v0.7): 1–9 → 10–90%, 0 → 100%.
	{
		id: 'layer-opacity',
		match: ( c ) => ! c.meta && ! c.alt && /^[0-9]$/.test( c.key ),
		run: ( editor, extras, e ) => {
			const layer = editor.state.layers.find(
				( l ) => l.id === editor.state.activeId
			);
			if ( ! layer ) {
				return;
			}
			const digit = parseInt( e?.key ?? '0', 10 );
			editor.dispatch( {
				type: 'UPDATE_LAYER',
				id: layer.id,
				patch: { opacity: 0 === digit ? 100 : digit * 10 },
			} );
			editor.commit( 'Layer opacity' );
		},
	},
	{
		id: 'library',
		match: ( c ) => c.meta && c.shift && 'l' === c.key,
		run: ( editor, extras ) => extras.openLibrary?.(),
	},
	{
		id: 'palette',
		match: ( c ) => c.meta && ! c.shift && 'k' === c.key,
		run: ( editor, extras ) => extras.openPalette?.(),
	},
	// Open the AI panel (v1.24.12), 'A' is free (Cmd+A is Select All).
	{
		id: 'ai',
		match: ( c ) => ! c.meta && ! c.alt && 'a' === c.key,
		run: ( editor ) =>
			editor.dispatch( { type: 'SET_RIGHT_TAB', tab: 'ai' } ),
	},
	// Tool switching (single letters, LAST so they don't shadow the above).
	...TOOLS.map( ( tool ) => ( {
		id: `tool-${ tool.id }`,
		match: ( c ) => ! c.meta && ! c.alt && c.key === tool.kbd.toLowerCase(),
		run: ( editor ) =>
			editor.dispatch( { type: 'SET_TOOL', tool: tool.id } ),
	} ) ),
];

/** Default combo strings + labels for the remappable commands (v1.1). */
export const SHORTCUT_META = [
	{ id: 'undo', combo: 'mod+z', label: __( 'Undo', 'wunderpaint' ) },
	{
		id: 'redo',
		combo: 'mod+shift+z',
		label: __( 'Redo', 'wunderpaint' ),
	},
	{
		id: 'zoom-in',
		combo: 'mod++',
		label: __( 'Zoom in', 'wunderpaint' ),
	},
	{
		id: 'zoom-out',
		combo: 'mod+-',
		label: __( 'Zoom out', 'wunderpaint' ),
	},
	{
		id: 'fit',
		combo: 'mod+0',
		label: __( 'Fit to screen', 'wunderpaint' ),
	},
	{ id: 'zoom-100', combo: 'mod+1', label: __( '100%', 'wunderpaint' ) },
	{
		id: 'select-all',
		combo: 'mod+a',
		label: __( 'Select all', 'wunderpaint' ),
	},
	{
		id: 'deselect',
		combo: 'mod+d',
		label: __( 'Deselect', 'wunderpaint' ),
	},
	{
		id: 'inverse',
		combo: 'mod+shift+i',
		label: __( 'Inverse selection', 'wunderpaint' ),
	},
	{
		id: 'duplicate',
		combo: 'mod+j',
		label: __( 'Duplicate layer', 'wunderpaint' ),
	},
	{
		id: 'copy',
		combo: 'mod+c',
		label: __( 'Copy layer', 'wunderpaint' ),
	},
	{ id: 'cut', combo: 'mod+x', label: __( 'Cut layer', 'wunderpaint' ) },
	{
		id: 'paste',
		combo: 'mod+v',
		label: __( 'Paste layer', 'wunderpaint' ),
	},
	{
		id: 'library',
		combo: 'mod+shift+l',
		label: __( 'Asset Library', 'wunderpaint' ),
	},
	{
		id: 'palette',
		combo: 'mod+k',
		label: __( 'Command palette', 'wunderpaint' ),
	},
	{
		id: 'ai',
		combo: 'a',
		label: __( 'AI panel', 'wunderpaint' ),
	},
	...TOOLS.map( ( tool ) => ( {
		id: `tool-${ tool.id }`,
		combo: tool.kbd.toLowerCase(),
		label: tool.label,
	} ) ),
];

/**
 * Effective bindings for the shortcuts dialog.
 *
 * @return {Array} [{id, label, combo, isDefault}].
 */
export function listShortcutBindings() {
	const overrides = listOverrides();
	return SHORTCUT_META.map( ( m ) => ( {
		...m,
		combo: overrides[ m.id ] || m.combo,
		isDefault: undefined === overrides[ m.id ],
	} ) );
}

/**
 * Built-in combos that cannot be remapped but must still be seen by
 * findConflict, so the Shortcuts dialog can say "that one is taken".
 *
 * Structural keys (Escape, Enter) are deliberately absent: they are not
 * combos a user would try to claim, and listing them would only add noise.
 */
export const RESERVED_COMBOS = [
	{ id: 'save', combo: 'mod+s', label: __( 'Save', 'wunderpaint' ) },
	{
		id: 'quick-insert',
		combo: '/',
		label: __( 'Quick insert', 'wunderpaint' ),
	},
	{
		id: 'swap-colors',
		combo: 'x',
		label: __( 'Swap colors', 'wunderpaint' ),
	},
	{ id: 'help', combo: '?', label: __( 'Handbook', 'wunderpaint' ) },
	{
		id: 'bring-forward',
		combo: 'mod+]',
		label: __( 'Bring forward', 'wunderpaint' ),
	},
	{
		id: 'send-backward',
		combo: 'mod+[',
		label: __( 'Send backward', 'wunderpaint' ),
	},
	{
		id: 'delete-layer',
		combo: 'backspace',
		label: __( 'Delete layer', 'wunderpaint' ),
	},
	{
		id: 'brush-smaller',
		combo: '[',
		label: __( 'Smaller brush', 'wunderpaint' ),
	},
	{
		id: 'brush-larger',
		combo: ']',
		label: __( 'Larger brush', 'wunderpaint' ),
	},
	{
		id: 'layer-opacity',
		combo: '0-9',
		label: __( 'Layer opacity', 'wunderpaint' ),
	},
	{ id: 'nudge', combo: 'arrows', label: __( 'Nudge', 'wunderpaint' ) },
];

/**
 * The binding (if any) already using a combo.
 *
 * @param {string} combo    Combo string.
 * @param {string} exceptId Ignore this id.
 * @return {Object|null} Conflicting binding.
 */
export function findConflict( combo, exceptId ) {
	const remappable = listShortcutBindings().find(
		( b ) => b.combo === combo && b.id !== exceptId
	);
	if ( remappable ) {
		return remappable;
	}
	// The built-ins that are NOT remappable were invisible here, because this
	// only ever searched SHORTCUT_META. Binding a command to mod+s or to "/"
	// reported no conflict and then quietly shadowed Save or Quick insert.
	const reserved = RESERVED_COMBOS.find( ( b ) => b.combo === combo );
	return reserved ? { ...reserved, reserved: true } : null;
}

/**
 * Dispatch a keydown event against the table.
 *
 * @return {boolean} Whether a shortcut ran.
 */
export function handleKeyDown( e, editor, extras ) {
	if ( isEditableTarget( e.target ) ) {
		return false;
	}
	const combo = comboOf( e );
	// Easy Mode (v1.166): only everyday combos fire - single-key tool
	// switches and pro-surface shortcuts stay quiet so beginners cannot
	// stumble into masks, panels or tools their shell does not show.
	if ( isEasyMode() ) {
		const plain = [
			'Delete',
			'Backspace',
			'Escape',
			'Enter',
			'ArrowLeft',
			'ArrowRight',
			'ArrowUp',
			'ArrowDown',
		].includes( combo.key );
		if ( ! plain && ! ( combo.meta && easyAllowsShortcut( combo.key ) ) ) {
			return false;
		}
	}
	const overrides = listOverrides();
	const asString = comboString( combo );
	// Remapped combos win; shortcuts remapped away no longer fire on their
	// default keys (v1.1 custom shortcuts).
	const overriddenId = Object.keys( overrides ).find(
		( id ) => overrides[ id ] === asString
	);
	for ( const entry of SHORTCUTS ) {
		const remapped = undefined !== overrides[ entry.id ];
		const hit = overriddenId
			? entry.id === overriddenId
			: ! remapped && entry.match( combo );
		if ( hit ) {
			if (
				combo.meta ||
				[ 'Delete', 'Backspace' ].includes( combo.key )
			) {
				e.preventDefault();
			}
			try {
				entry.run( editor, extras, e );
			} catch ( err ) {
				if ( err?.pending ) {
					extras.toasts?.error?.( err.message );
				} else {
					throw err;
				}
			}
			return true;
		}
	}
	return false;
}

/**
 * Space-hold temporary Hand tool + main keydown binding.
 *
 * @param {Function} getContext () => ({ editor, extras }).
 * @return {Function} Unbind.
 */
export function bindShortcuts( getContext ) {
	let spaceHeld = false;
	let toolBeforeSpace = null;

	const onKeyDown = ( e ) => {
		const { editor, extras } = getContext();
		if ( ' ' === e.key && ! isEditableTarget( e.target ) ) {
			if ( ! spaceHeld ) {
				spaceHeld = true;
				toolBeforeSpace = editor.state.tool;
				if ( 'hand' !== editor.state.tool ) {
					editor.dispatch( { type: 'SET_TOOL', tool: 'hand' } );
				}
			}
			e.preventDefault();
			return;
		}
		handleKeyDown( e, editor, extras );
	};

	const onKeyUp = ( e ) => {
		if ( ' ' === e.key && spaceHeld ) {
			spaceHeld = false;
			const { editor } = getContext();
			if ( toolBeforeSpace && 'hand' !== toolBeforeSpace ) {
				editor.dispatch( { type: 'SET_TOOL', tool: toolBeforeSpace } );
			}
			toolBeforeSpace = null;
		}
	};

	window.addEventListener( 'keydown', onKeyDown );
	window.addEventListener( 'keyup', onKeyUp );
	return () => {
		window.removeEventListener( 'keydown', onKeyDown );
		window.removeEventListener( 'keyup', onKeyUp );
	};
}
