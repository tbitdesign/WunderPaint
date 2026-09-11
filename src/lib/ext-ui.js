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

/* ------------------------------------------------------------------ */

/*
 * THE CI BUILDERS (v1.430.0). Everything below draws a component that
 * every studio needs and that, until the audit on 2026-09-08, each of the
 * forty-seven packages drew for itself with slightly different numbers.
 * The look lives in src/styles/editor/ext-kit.css; these functions only
 * put the right class names on the right elements.
 *
 * The concept: docs/extension-ci.md.
 */

/**
 * THE brand mark, once. Thirteen packages carried their own copy of this
 * string; twelve differed only in an attribute, and one - Party Printables -
 * had a mark that is not the product's at all, which is what a human spotted
 * in the dialog header. A logo is not something a package should be able to
 * get wrong, so it lives here and `badge()` puts it in place.
 *
 * Mirrors the frame + sparkle of src/components/logo.jsx.
 */
export const BRAND_MARK =
	'<svg width="24" height="24" viewBox="0 0 18.83 18.83" aria-hidden="true" focusable="false">' +
	'<path fill="currentColor" d="M13.84,18.83H3.62c-2,0-3.62-1.62-3.62-3.62V3.52h1.72c.7,0,1.28.57,1.28,1.28v10.43c0,.34.28.62.62.62h8.94c.71,0,1.29.58,1.29,1.29v1.71Z"/>' +
	'<path fill="#3b66ff" d="M18.83,14.02h-1.71c-.71,0-1.29-.58-1.29-1.29V3.62c0-.34-.28-.62-.62-.62H4.82c-.7,0-1.28-.57-1.28-1.28V0h11.67c2,0,3.62,1.62,3.62,3.62v10.4Z"/>' +
	'<circle fill="currentColor" cx="17.33" cy="17.33" r="1.5"/>' +
	'<path fill="#3b66ff" d="M9.51,5.71l.91,2.45c.03.08.09.14.17.17l2.45.91c.07.03.07.13,0,.16l-2.45.91c-.08.03-.14.09-.17.17l-.91,2.45c-.03.07-.13.07-.16,0l-.91-2.45c-.03-.08-.09-.14-.17-.17l-2.45-.91c-.07-.03-.07-.13,0-.16l2.45-.91c.08-.03.14-.09.17-.17l.91-2.45c.03-.07.13-.07.16,0Z"/>' +
	'</svg>';

/**
 * Put the brand mark at the front of a dialog header.
 *
 * @param {Object|Element} target A modal from dialog(), or the head element
 *                               itself for a hand-built shell.
 * @return {Element} The badge.
 */
export function badge( target ) {
	const head = target && target.head ? target.head : target;
	const span = document.createElement( 'span' );
	span.className = 'dsm-badge';
	span.innerHTML = BRAND_MARK;
	head.insertBefore( span, head.firstChild );
	return span;
}

/**
 * Write the selected state. aria-pressed is the one a screen reader also
 * reads, so it is the one the kit writes; the stylesheet still honours the
 * older .is-on/.active spellings so a package can migrate its markup
 * without touching its state handling on the same day.
 *
 * @param {Element} node Button-ish node.
 * @param {boolean} on   Selected.
 * @return {Element} The node.
 */
export function pressed( node, on ) {
	node.setAttribute( 'aria-pressed', on ? 'true' : 'false' );
	return node;
}

/**
 * The kit class plus the package's own hook class, if it brought one.
 * A package keeps its `mypack-thing` selector for its JS and its QA and
 * lets the kit class carry the look - that is what makes a migration a
 * deletion in the stylesheet rather than a rewrite of the markup.
 *
 * @param {string} base Kit class.
 * @param {string} cls  Package class (optional).
 * @return {string} The class attribute.
 */
function withCls( base, cls ) {
	return cls ? base + ' ' + cls : base;
}

/**
 * Attach an inline SVG string, or nothing when there is none.
 *
 * @param {Element} node Target.
 * @param {string}  svg  Inline SVG markup.
 */
function setIcon( node, svg ) {
	if ( svg ) {
		node.insertAdjacentHTML( 'afterbegin', svg );
	}
}

/** The glass that sits inside every search field. */
export const SEARCH_ICON =
	'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
	'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>';

/**
 * A search field: the glass inside the field at the left, the kit input,
 * no trailing ellipsis in the placeholder. One shape for every studio.
 *
 * @param {Element} parent Parent element.
 * @param {Object}  opts   { placeholder, value, cls, onInput }.
 * @return {Object} { node, input }.
 */
export function search( parent, opts = {} ) {
	const { placeholder = '', value = '', cls = '', onInput } = opts;
	const wrap = el( 'div', withCls( 'dsm-search', cls ), parent );
	wrap.innerHTML = SEARCH_ICON;
	const input = el( 'input', 'dsm-input', wrap );
	input.type = 'search';
	input.placeholder = placeholder.replace( /[.\u2026]+$/, '' );
	input.value = value;
	if ( onInput ) {
		input.oninput = () => onInput( input.value );
	}
	return { node: wrap, input };
}

/**
 * A row of filter pills (categories above a card list).
 *
 * @param {Element} parent Parent element.
 * @param {string}  [cls]  The package's own hook class.
 * @return {Element} The container to put pills in.
 */
export function pills( parent, cls = '' ) {
	return el( 'div', withCls( 'dsm-pills', cls ), parent );
}

/**
 * One filter pill.
 *
 * @param {Element} parent Parent element.
 * @param {Object}  opts   { label, icon, on, cls, onClick }.
 * @return {Element} The button.
 */
export function pill( parent, opts = {} ) {
	const { label, icon = '', on = false, cls = '', onClick } = opts;
	const b = el( 'button', withCls( 'dsm-pill', cls ), parent, label );
	b.type = 'button';
	setIcon( b, icon );
	pressed( b, on );
	if ( onClick ) {
		b.onclick = () => onClick( b );
	}
	return b;
}

/**
 * The option grid: one small button per option, all the same size, in
 * equal columns. This is the choice with MORE than three options - the
 * segmented control (`dsm-seg`) is for two or three words on one line
 * and wraps into a shapeless block beyond that.
 *
 * @param {Element} parent Parent element.
 * @param {Object}  opts   { cols, cls } columns (default 2).
 * @return {Element} The grid.
 */
export function optGrid( parent, opts = {} ) {
	const grid = el( 'div', withCls( 'dsm-opts', opts.cls || '' ), parent );
	if ( opts.cols ) {
		grid.style.setProperty( '--dsm-cols', String( opts.cols ) );
	}
	return grid;
}

/**
 * One option in the grid.
 *
 * @param {Element} parent Parent element.
 * @param {Object}  opts   { label, icon, on, cls, onClick }.
 * @return {Element} The button.
 */
export function optBtn( parent, opts = {} ) {
	const { label, icon = '', on = false, cls = '', onClick } = opts;
	const b = el( 'button', withCls( 'dsm-opt', cls ), parent, label );
	b.type = 'button';
	setIcon( b, icon );
	pressed( b, on );
	if ( onClick ) {
		b.onclick = () => onClick( b );
	}
	return b;
}

/**
 * The preview-card grid. Cards keep a FIXED width and the leftover width
 * falls into the gaps - never into the cards.
 *
 * @param {Element} parent Parent element.
 * @param {Object}  opts   { cell, cls } fixed card width in px (default 84).
 * @return {Element} The grid.
 */
export function picks( parent, opts = {} ) {
	const grid = el( 'div', withCls( 'dsm-picks', opts.cls || '' ), parent );
	if ( opts.cell ) {
		grid.style.setProperty( '--dsm-cell', opts.cell + 'px' );
	}
	return grid;
}

/**
 * A preview card: picture above, centred label below.
 *
 * @param {Element} parent Parent element.
 * @param {Object}  opts   { label, thumb, icon, badge, on, title, cls, onClick }.
 * @return {Object} { node, thumb, label } - draw into `thumb`.
 */
export function pick( parent, opts = {} ) {
	const {
		label = '',
		thumb = null,
		icon = '',
		badge: badgeText = '',
		on = false,
		title,
		cls = '',
		onClick,
	} = opts;
	const b = el( 'button', withCls( 'dsm-pick', cls ), parent );
	b.type = 'button';
	const box = el( 'div', 'dsm-pick-thumb', b );
	if ( thumb ) {
		box.appendChild( thumb );
	} else {
		setIcon( box, icon );
	}
	const cap = el( 'span', 'dsm-pick-label', b, label );
	if ( badgeText ) {
		el( 'span', 'dsm-pick-badge', b, String( badgeText ) );
	}
	if ( title || label ) {
		b.title = title || label;
	}
	pressed( b, on );
	if ( onClick ) {
		b.onclick = () => onClick( b );
	}
	return { node: b, thumb: box, label: cap };
}

/**
 * The list-card column (type/template/item choice).
 *
 * @param {Element} parent Parent element.
 * @param {string}  [cls]  The package's own hook class.
 * @return {Element} The list.
 */
export function picklist( parent, cls = '' ) {
	return el( 'div', withCls( 'dsm-picklist', cls ), parent );
}

/**
 * A list card: icon left, name, and the explanation INSIDE the card - never
 * as a paragraph under the list, never as a tooltip alone.
 *
 * @param {Element} parent Parent element.
 * `compact` is the short card - icon and name only, half the height - for a
 * choice that has no explanation to give (a shape, a form).
 *
 * @param {Object}  opts   { title, text, icon, thumb, on, compact, cls, onClick }.
 * @return {Object} { node, icon, title, text }.
 */
export function pickrow( parent, opts = {} ) {
	const {
		title = '',
		text = '',
		icon = '',
		thumb = null,
		on = false,
		compact = false,
		cls = '',
		onClick,
	} = opts;
	const b = el(
		'button',
		withCls( compact ? 'dsm-pickrow dsm-pickrow-sm' : 'dsm-pickrow', cls ),
		parent
	);
	b.type = 'button';
	const ico = el( 'span', 'dsm-pickrow-icon', b );
	if ( thumb ) {
		ico.appendChild( thumb );
	} else {
		setIcon( ico, icon );
	}
	const wrap = el( 'span', 'dsm-pickrow-text', b );
	const name = el( 'b', null, wrap, title );
	const sub = text ? el( 'small', null, wrap, text ) : null;
	pressed( b, on );
	if ( onClick ) {
		b.onclick = () => onClick( b );
	}
	return { node: b, icon: ico, title: name, text: sub };
}

/**
 * A 26px icon button (dice, remove, up, down).
 *
 * @param {Element} parent Parent element.
 * @param {Object}  opts   { icon, title, danger, cls, onClick }.
 * @return {Element} The button.
 */
export function mini( parent, opts = {} ) {
	const { icon = '', title = '', danger = false, cls = '', onClick } = opts;
	const b = el(
		'button',
		withCls( 'dsm-mini' + ( danger ? ' danger' : '' ), cls ),
		parent
	);
	b.type = 'button';
	setIcon( b, icon );
	if ( title ) {
		b.title = title;
		b.setAttribute( 'aria-label', title );
	}
	if ( onClick ) {
		b.onclick = () => onClick( b );
	}
	return b;
}

/**
 * The dashed "add another" button under a list.
 *
 * @param {Element} parent Parent element.
 * @param {Object}  opts   { label, icon, cls, onClick }.
 * @return {Element} The button.
 */
export function add( parent, opts = {} ) {
	const { label = '', icon = '', cls = '', onClick } = opts;
	const b = el( 'button', withCls( 'dsm-add', cls ), parent, label );
	b.type = 'button';
	setIcon( b, icon );
	if ( onClick ) {
		b.onclick = () => onClick( b );
	}
	return b;
}

/**
 * Small explanatory text under a control.
 *
 * @param {Element} parent Parent element.
 * @param {string}  text   The text.
 * @return {Element} The node.
 */
export function note( parent, text ) {
	return el( 'div', 'dsm-note', parent, text );
}

/**
 * A textarea that carries the shared input colours (the pair that made
 * Code Shot's field black on black when it was guessed instead).
 *
 * @param {Element} parent Parent element.
 * @param {Object}  opts   { value, placeholder, rows, onInput }.
 * @return {Element} The textarea.
 */
export function textarea( parent, opts = {} ) {
	const { value = '', placeholder = '', rows = 0, onInput } = opts;
	const t = el( 'textarea', 'dsm-input', parent );
	t.value = value;
	if ( placeholder ) {
		t.placeholder = placeholder;
	}
	if ( rows ) {
		t.rows = rows;
	}
	if ( onInput ) {
		t.oninput = () => onInput( t.value );
	}
	return t;
}

/**
 * The transport bar for animated studios: play/pause, scrub, time. The
 * package positions it inside its view; the kit draws it.
 *
 * @param {Element} parent Parent element.
 * @param {Object}  opts   { playing, icons: { play, pause }, onToggle, onSeek, max, step }.
 * @return {Object} { node, play, scrub, time, setPlaying, setTime }.
 */
export function transport( parent, opts = {} ) {
	const {
		playing = false,
		icons = {},
		onToggle,
		onSeek,
		max = 100,
		step = 1,
	} = opts;
	const bar = el( 'div', 'dsm-transport', parent );
	const play = el( 'button', 'dsm-play', bar );
	play.type = 'button';
	const scrub = el( 'input', 'dsm-range dsm-scrub', bar );
	scrub.type = 'range';
	scrub.min = '0';
	scrub.max = String( max );
	scrub.step = String( step );
	scrub.value = '0';
	const time = el( 'span', 'dsm-time', bar, '' );

	let on = !! playing;
	const setPlaying = ( next ) => {
		on = !! next;
		play.innerHTML = on ? icons.pause || '❚❚' : icons.play || '▶';
		play.title = on ? 'Pause' : 'Play';
		play.setAttribute( 'aria-label', play.title );
	};
	setPlaying( on );

	play.onclick = () => {
		setPlaying( ! on );
		if ( onToggle ) {
			onToggle( on );
		}
	};
	if ( onSeek ) {
		scrub.oninput = () => onSeek( Number( scrub.value ) );
	}

	return {
		node: bar,
		play,
		scrub,
		time,
		setPlaying,
		setTime: ( text ) => {
			time.textContent = text;
		},
	};
}
