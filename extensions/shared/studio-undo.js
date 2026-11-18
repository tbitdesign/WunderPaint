/**
 * Ctrl+Z in a studio, keyboard only (20.10.2026). Thomas had the undo icon
 * for Random taken out of the Solar System Studio in September, so there is
 * no button: Ctrl+Z (Cmd+Z) goes back, Ctrl+Shift+Z or Ctrl+Y forward.
 *
 * The studio hands over two functions: read() returns its settings as
 * plain data, write( data ) puts them back (settings, controls, picture).
 * Steps are found by watching the studio's own events: whatever a click,
 * a slider, a colour pick or a drag changed becomes one step once the
 * studio has been quiet for a moment, so a whole slider drag is one step.
 * Changes nobody asked for (a texture that finished loading) are taken
 * as the new starting point, not as a step.
 *
 * Inside a text field the browser's own undo keeps the key. While the
 * studio is the top dialog the key never reaches the editor behind it:
 * that used to undo a step of the document under the studio.
 *
 * No imports: every studio bundles its own copy (see three3d/README.md).
 */

/**
 * The bare history: JSON strings of the studio's settings.
 *
 * @param {number} limit Steps kept.
 * @return {Object} { reset, note, undo, redo, canUndo, canRedo }.
 */
export function undoStack( limit = 60 ) {
	const past = [],
		future = [];
	let last = null;
	// An entry is the settings' JSON, or { key: that JSON, ... } carrying
	// more (the controls' values); only the key decides what changed.
	const keyOf = ( e ) => ( e && 'object' === typeof e ? e.key : e );
	return {
		/** A new starting point; the steps stay. */
		reset( now ) {
			last = now;
		},
		/**
		 * The settings after a user's action: a step if they changed.
		 *
		 * @param {string|Object} now The settings now (see keyOf).
		 * @return {boolean} A step was added.
		 */
		note( now ) {
			if ( null === last ) {
				last = now;
				return false;
			}
			if ( keyOf( now ) === keyOf( last ) ) {
				// Same settings: keep the newer controls' values.
				last = now;
				return false;
			}
			past.push( last );
			if ( past.length > limit ) {
				past.shift();
			}
			future.length = 0;
			last = now;
			return true;
		},
		undo( now ) {
			if ( ! past.length ) {
				return null;
			}
			future.push( now );
			last = past.pop();
			return last;
		},
		redo( now ) {
			if ( ! future.length ) {
				return null;
			}
			past.push( now );
			last = future.pop();
			return last;
		},
		get canUndo() {
			return past.length > 0;
		},
		get canRedo() {
			return future.length > 0;
		},
	};
}

const TEXT_TYPES = [
	'',
	'text',
	'search',
	'number',
	'email',
	'url',
	'tel',
	'password',
];

/**
 * A field where Ctrl+Z means "undo my typing".
 *
 * @param {EventTarget} t Event target.
 * @return {boolean} Text entry.
 */
export function isTextEntry( t ) {
	if ( ! t || ! t.tagName ) {
		return false;
	}
	if ( t.isContentEditable || 'TEXTAREA' === t.tagName ) {
		return true;
	}
	return (
		'INPUT' === t.tagName &&
		TEXT_TYPES.includes( ( t.getAttribute( 'type' ) || '' ).toLowerCase() )
	);
}

/**
 * Which way a key goes: 'undo', 'redo' or null.
 *
 * @param {KeyboardEvent} e Key event.
 * @return {string|null} Direction.
 */
export function undoKey( e ) {
	if ( ! ( e.ctrlKey || e.metaKey ) || e.altKey || ! e.key ) {
		return null;
	}
	const k = e.key.toLowerCase();
	if ( 'z' === k ) {
		return e.shiftKey ? 'redo' : 'undo';
	}
	return 'y' === k && ! e.shiftKey ? 'redo' : null;
}

const SKIP_TYPES = [ 'file', 'search', 'button', 'submit', 'reset', 'image', 'hidden' ];

/** The dialog's form controls, in document order. */
function controlsOf( root ) {
	return root
		? [ ...root.querySelectorAll( 'input, select, textarea' ) ].filter(
				( n ) =>
					! SKIP_TYPES.includes( ( n.type || '' ).toLowerCase() ) &&
					! n.closest( '[data-undo-skip]' )
		  )
		: [];
}
// Which control this is. A rebuilt panel has new controls (ext-ui names
// every field once), so a stored value never lands in the wrong one.
const signature = ( n ) =>
	[
		n.tagName,
		n.type,
		n.name,
		n.min,
		n.max,
		n.getAttribute( 'aria-label' ),
	].join( '|' );
const isCheck = ( n ) => 'checkbox' === n.type || 'radio' === n.type;

/**
 * The values the controls show.
 *
 * @param {Element} root Dialog.
 * @return {Array} [ signature, value ] per control.
 */
export function controlState( root ) {
	return controlsOf( root ).map( ( n ) => [
		signature( n ),
		isCheck( n ) ? n.checked : n.value,
	] );
}

/**
 * Puts stored values back into the controls that show something else,
 * through their own handlers (an input and a change event), as if the
 * user had set them: the studio then updates itself the way it always
 * does. Nothing happens when the panel was rebuilt in between.
 *
 * @param {Element} root  Dialog.
 * @param {Array}   saved From controlState.
 * @return {number} Controls set.
 */
export function restoreControls( root, saved ) {
	// (a studio that rebuilds its panels itself hands over no controls)
	if ( ! root ) {
		return 0;
	}
	const list = controlsOf( root );
	if ( ! saved || list.length !== saved.length ) {
		return 0;
	}
	const Ev = root.ownerDocument.defaultView.Event;
	let set = 0;
	list.forEach( ( n, i ) => {
		const [ sig, value ] = saved[ i ];
		if ( sig !== signature( n ) || ! n.isConnected ) {
			return;
		}
		if ( isCheck( n ) ? n.checked === value : n.value === value ) {
			return;
		}
		if ( isCheck( n ) ) {
			n.checked = value;
		} else {
			n.value = value;
		}
		n.dispatchEvent( new Ev( 'input', { bubbles: true } ) );
		n.dispatchEvent( new Ev( 'change', { bubbles: true } ) );
		set++;
	} );
	return set;
}

// What a user does in a studio. The change is read once it is quiet.
const ACTIONS = [ 'input', 'change', 'click', 'pointerup', 'keyup', 'drop' ];
// The start of an action: a quiet studio takes its state as the baseline.
const STARTS = [ 'pointerdown', 'keydown', 'focusin' ];

/**
 * Wires the history to a studio dialog.
 *
 * @param {Object}   o
 * @param {Element}  o.backdrop The studio's .modal-backdrop (the colour
 *                              editor of a swatch lives in it too).
 * @param {Function} o.read     () => the settings as plain data, or
 *                              undefined when there is nothing to take.
 * @param {Function} o.write    ( data ) => put them back. Controls it
 *                              leaves showing other values are then set
 *                              through their own handlers.
 * @param {Element|false} [o.controls] Where those controls live (default:
 *                              the studio's .dsm box; false: none).
 * @param {number}   [o.settle] Quiet time before a step is taken, ms.
 * @param {number}   [o.limit]  Steps kept.
 * @return {{dispose: Function, flush: Function, reset: Function, stack: Object}} Controller.
 */
export function studioUndo( {
	backdrop,
	read,
	write,
	controls = null,
	settle = 350,
	limit = 60,
} ) {
	const stack = undoStack( limit );
	const doc = backdrop.ownerDocument;
	// The studio's own box, not the colour editor portalled next to it.
	const root = () =>
		false === controls
			? null
			: controls ||
			  [ ...backdrop.children ].find( ( n ) =>
					n.classList.contains( 'dsm' )
			  ) ||
			  backdrop.firstElementChild;
	let timer = 0,
		busy = false;
	// read() may return undefined: nothing to take right now (while an
	// animation drives the settings, say).
	const now = () => {
		try {
			const data = read();
			return undefined === data
				? null
				: { key: JSON.stringify( data ), ui: controlState( root() ) };
		} catch ( e ) {
			return null;
		}
	};
	stack.reset( now() );

	const flush = () => {
		if ( ! timer ) {
			return;
		}
		clearTimeout( timer );
		timer = 0;
		const state = now();
		if ( null !== state ) {
			stack.note( state );
		}
	};
	const onAction = () => {
		if ( busy ) {
			return;
		}
		clearTimeout( timer );
		timer = setTimeout( flush, settle );
	};
	const onStart = ( e ) => {
		if ( busy ) {
			return;
		}
		if ( timer ) {
			// A new press ends the last action: two quick clicks on Random
			// are two steps. Held keys (arrows on a slider) stay one.
			if ( 'pointerdown' === e.type ) {
				flush();
			}
			return;
		}
		const state = now();
		if ( null !== state ) {
			stack.reset( state );
		}
	};
	// The top dialog only: a dialog the studio opened over itself owns
	// the key.
	const isTop = () => {
		for (
			let n = backdrop.nextElementSibling;
			n;
			n = n.nextElementSibling
		) {
			if ( n.classList && n.classList.contains( 'modal-backdrop' ) ) {
				return false;
			}
		}
		return true;
	};
	const onKey = ( e ) => {
		if ( ! backdrop.isConnected ) {
			// Closed without telling us: let go.
			api.dispose();
			return;
		}
		const dir = undoKey( e );
		if ( ! dir || ! isTop() ) {
			return;
		}
		if ( isTextEntry( e.target ) ) {
			return;
		}
		// Ours, even with nothing to undo: never the document behind.
		e.preventDefault();
		e.stopPropagation();
		if ( e.repeat && busy ) {
			return;
		}
		flush();
		const state = now();
		if ( null === state ) {
			return;
		}
		const target = 'undo' === dir ? stack.undo( state ) : stack.redo( state );
		if ( null === target ) {
			return;
		}
		busy = true;
		try {
			write( JSON.parse( target.key ) );
			// Sliders, choices and fields the studio did not set itself.
			restoreControls( root(), target.ui );
		} finally {
			busy = false;
		}
		// The studio may tidy what it got (defaults, clamping).
		const after = now();
		if ( null !== after ) {
			stack.reset( after );
		}
	};

	for ( const type of ACTIONS ) {
		backdrop.addEventListener( type, onAction, true );
	}
	for ( const type of STARTS ) {
		backdrop.addEventListener( type, onStart, true );
	}
	doc.addEventListener( 'keydown', onKey, true );
	const api = {
		stack,
		flush,
		/** After the studio replaced everything itself (a new document). */
		reset() {
			clearTimeout( timer );
			timer = 0;
			const state = now();
			if ( null !== state ) {
				stack.reset( state );
			}
		},
		dispose() {
			clearTimeout( timer );
			timer = 0;
			for ( const type of ACTIONS ) {
				backdrop.removeEventListener( type, onAction, true );
			}
			for ( const type of STARTS ) {
				backdrop.removeEventListener( type, onStart, true );
			}
			doc.removeEventListener( 'keydown', onKey, true );
		},
	};
	return api;
}
