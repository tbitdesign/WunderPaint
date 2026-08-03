/**
 * Framework-free UI builders for extension dialogs (v1.273.0 / API 2.10):
 * the el()/dialog/section/slider helpers sixteen extensions each carried
 * as local copies, emitting the editor's shared dsm classes so everything
 * matches the studio CI without per-extension CSS. Bridged as `ui.*`.
 */

let fieldSeq = 0;

/**
 * Create an element, append it, optionally set text.
 *
 * @param {string}      tag    Tag name.
 * @param {string|null} cls    Class name(s).
 * @param {Element}     parent Parent to append to (optional).
 * @param {string}      [text] Text content.
 * @return {Element} The node.
 */
export function el( tag, cls, parent, text ) {
	const n = document.createElement( tag );
	if ( cls ) {
		n.className = cls;
	}
	if ( undefined !== text && null !== text ) {
		n.textContent = text;
	}
	if ( /^(INPUT|SELECT|TEXTAREA)$/.test( n.tagName ) ) {
		// Unique names + autocomplete off so Chrome never autofills
		// studio fields (the wpiedg lesson).
		n.name = 'wpie-xf' + fieldSeq++;
		n.setAttribute( 'autocomplete', 'off' );
	}
	if ( parent ) {
		parent.appendChild( n );
	}
	return n;
}

/**
 * The dsm dialog shell: backdrop + dialog + head (title/subtitle/close) +
 * body + foot.
 *
 * ESCAPE CLOSES, always (v1.366.0). It used to be the host's job, and a
 * survey of the family on 2026-08-01 found nine studios where nobody had
 * done it - six of them could only be left through the small × in the
 * corner. A dialog that traps the Escape key is broken in the same way
 * everywhere, so the shell answers for it now. `escapeCloses: false`
 * opts out for the rare dialog that must not vanish on a stray key.
 *
 * @param {Object}   opts
 * @param {string}   opts.title             Dialog title.
 * @param {string}   [opts.subtitle]        Subtitle line.
 * @param {number}   [opts.width]           Max width in px (0 = dsm default).
 * @param {Function} [opts.onClose]         Called when the dialog closes itself.
 * @param {boolean}  [opts.closeOnBackdrop] Backdrop click closes (default false).
 * @param {boolean}  [opts.escapeCloses]    Escape closes (default true).
 * @return {Object} { backdrop, dialog, head, body, foot, close }.
 */
export function dialog( {
	title,
	subtitle = '',
	width = 0,
	onClose = null,
	closeOnBackdrop = false,
	escapeCloses = true,
} = {} ) {
	const host = document.getElementById( 'wpie-root' ) || document.body;
	const backdrop = el( 'div', 'modal-backdrop', host );
	const box = el( 'div', 'dsm', backdrop );
	box.setAttribute( 'role', 'dialog' );
	box.setAttribute( 'aria-label', title || '' );
	if ( width ) {
		box.style.maxWidth = 'min(' + width + 'px, 97vw)';
	}
	box.addEventListener( 'click', ( e ) => e.stopPropagation() );

	const head = el( 'div', 'dsm-head', box );
	const titles = el( 'div', 'dsm-titles', head );
	el( 'span', 'dsm-title', titles, title || '' );
	if ( subtitle ) {
		el( 'div', 'dsm-sub', titles, subtitle );
	}
	// One exit path for every way out, so a host that only knows about
	// close() still gets its listener removed.
	const close = () => {
		document.removeEventListener( 'keydown', onKey, true );
		backdrop.remove();
	};
	const dismiss = () => {
		close();
		if ( onClose ) {
			onClose();
		}
	};
	// Capture phase: a control inside the dialog that swallows keydown
	// (a select, a colour popover) must not eat the way out.
	function onKey( e ) {
		if ( 'Escape' !== e.key || ! backdrop.isConnected ) {
			return;
		}
		// Only the TOP dialog reacts. Another modal opened over ours owns
		// the key; anything else in the root (toasts, panels) does not.
		for (
			let n = backdrop.nextElementSibling;
			n;
			n = n.nextElementSibling
		) {
			if ( n.classList && n.classList.contains( 'modal-backdrop' ) ) {
				return;
			}
		}
		e.stopPropagation();
		dismiss();
	}
	if ( escapeCloses ) {
		document.addEventListener( 'keydown', onKey, true );
	}
	const closeBtn = el( 'button', 'dsm-close', head, '×' );
	closeBtn.type = 'button';
	closeBtn.onclick = dismiss;
	if ( closeOnBackdrop ) {
		backdrop.addEventListener( 'click', dismiss );
	}

	const body = el( 'div', 'dsm-body', box );
	const foot = el( 'div', 'dsm-foot', box );
	return { backdrop, dialog: box, head, body, foot, close };
}

/**
 * Icon-headed settings card (the shared studio CI).
 *
 * @param {Element} parent Parent element.
 * @param {Object}  opts   { icon: raw SVG string (optional), title }.
 * @return {Element} The card body to fill.
 */
export function section( parent, opts = {} ) {
	const { icon = '', title } = opts;
	const card = el( 'div', 'dsm-card', parent );
	const head = el( 'div', 'dsm-card-head', card );
	// Icon is a trusted inline SVG string from the extension bundle.
	head.innerHTML = ( icon || '' ) + '<span></span>';
	head.querySelector( 'span' ).textContent = title || '';
	return el( 'div', 'dsm-card-body', card );
}

/**
 * Label-left property row.
 *
 * @param {Element} parent Parent element.
 * @param {string}  label  Row label.
 * @return {Element} The value cell to put the control into.
 */
export function row( parent, label ) {
	const line = el( 'div', 'dsm-rowline', parent );
	el( 'span', 'dsm-rowline-label', line, label );
	return el( 'div', 'dsm-rowline-value', line );
}

/**
 * Slider with a live value readout.
 *
 * @param {Element}  parent Parent element.
 * @param {Object}   opts   { label, min, max, step, value, onInput, format }.
 * @return {Object} { input, set( value ) }.
 */
export function slider( parent, opts = {} ) {
	const { label, min, max, step = 1, value, onInput, format = String } = opts;
	const wrap = el( 'div', 'dsm-sliderrow', parent );
	const head = el( 'div', 'dsm-sliderrow-head', wrap );
	el( 'span', null, head, label );
	const out = el( 'span', 'dsm-sliderrow-val', head, format( value ) );
	const input = el( 'input', 'dsm-range', wrap );
	input.type = 'range';
	input.min = String( min );
	input.max = String( max );
	input.step = String( step );
	input.value = String( value );
	input.oninput = () => {
		out.textContent = format( Number( input.value ) );
		if ( onInput ) {
			onInput( Number( input.value ) );
		}
	};
	const set = ( v ) => {
		input.value = String( v );
		out.textContent = format( Number( v ) );
	};
	return { input, set };
}

/**
 * dsm-select from options.
 *
 * @param {Element} parent Parent element.
 * @param {Object}  opts   { options: [{value,label}]|string[], value, onChange }.
 * @return {Element} The select.
 */
export function select( parent, opts = {} ) {
	const { options = [], value, onChange } = opts;
	const sel = el( 'select', 'dsm-select', parent );
	options.forEach( ( o ) => {
		const opt = document.createElement( 'option' );
		opt.value = String( 'object' === typeof o ? o.value : o );
		opt.textContent = String( 'object' === typeof o ? o.label : o );
		sel.appendChild( opt );
	} );
	if ( undefined !== value ) {
		sel.value = String( value );
	}
	if ( onChange ) {
		sel.onchange = () => onChange( sel.value );
	}
	return sel;
}

/**
 * Checkbox row.
 *
 * @param {Element} parent Parent element.
 * @param {Object}  opts   { label, checked, onChange }.
 * @return {Element} The checkbox input.
 */
export function check( parent, opts = {} ) {
	const { label, checked = false, onChange } = opts;
	const line = el( 'label', 'dsm-checkrow', parent );
	const input = el( 'input', null, line );
	input.type = 'checkbox';
	input.checked = !! checked;
	el( 'span', null, line, label );
	if ( onChange ) {
		input.onchange = () => onChange( input.checked );
	}
	return input;
}

/**
 * Standard button (ai-btn).
 *
 * @param {Element} parent Parent element.
 * @param {Object}  opts   { label, primary, onClick }.
 * @return {Element} The button.
 */
export function btn( parent, opts = {} ) {
	const { label, primary = false, onClick } = opts;
	const b = el(
		'button',
		'ai-btn ' + ( primary ? 'primary' : 'secondary' ),
		parent,
		label
	);
	b.type = 'button';
	if ( onClick ) {
		b.onclick = onClick;
	}
	return b;
}
