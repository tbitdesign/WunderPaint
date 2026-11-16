/**
 * One interaction layer for numeric controls, including lazy extension dialogs.
 * Existing inputs remain the source of truth: input/change/blur still call their
 * own handlers. No React-owned children are replaced. Only the temporary editor
 * and drag readout live in a separate, disposable overlay.
 */
import { __ } from '@wordpress/i18n';
import {
	angleDetents,
	dragNumber,
	normalizeNumber,
	numberDisplay,
	numberSpec,
	parseNumberText,
	snapValue,
	splitNumberText,
} from './number-control';
import {
	beginNumberTransaction,
	endNumberTransaction,
} from './number-transaction';

const NUMBER_FIELDS = 'input[type="number"], input[data-number-input]';
const SCALARS = `input[type="range"], ${ NUMBER_FIELDS }`;
const VALUES =
	'[data-number-value], .val, .dsm-sliderrow-val, .bp-row-val, .chs-val, .vgn-val, .ssd-dial-val, .cp-alpha-val, output';
const LABELS =
	'[data-number-label], .dsm-rowline-label, .dsm-label, .field-label, .label, .chs-lbl, .vgn-lbl, .bp-row-label';
const metadata = new WeakMap();
const associations = new WeakMap();
const installations = new WeakMap();

/** Optional metadata for a custom display, or a ScrubLabel without an input. */
export function registerNumericControl( element, options ) {
	metadata.set( element, options );
	if ( element.matches( SCALARS ) ) {
		queueMicrotask( () => {
			if ( element.isConnected ) {
				decorate( element );
			}
		} );
	}
	return () => metadata.delete( element );
}

function optionsFor( element ) {
	const options = metadata.get( element );
	return typeof options === 'function' ? options() : options || {};
}

function enabled( element ) {
	return (
		element.isConnected &&
		! element.matches( ':disabled, [readonly], [aria-disabled="true"]' ) &&
		! element.closest( '[inert], fieldset:disabled' )
	);
}

function scalarRow( input ) {
	let row = input.parentElement;
	for ( let depth = 0; row && depth < 4; depth++, row = row.parentElement ) {
		const ranges = row.querySelectorAll( 'input[type="range"]' );
		const numbers = row.querySelectorAll( NUMBER_FIELDS );
		if ( ranges.length > 1 || numbers.length > 1 ) {
			return null;
		}
		if (
			row.matches(
				'label, .field, .group, .tool-setting, .slider-row, .dsm-sliderrow'
			) ||
			row.querySelector( LABELS + ', ' + VALUES )
		) {
			return row;
		}
	}
	return input.parentElement;
}

function labelFor( input, row ) {
	const native = Array.from( input.labels || [] ).find(
		( label ) => ! label.contains( input )
	);
	if ( native ) {
		return native;
	}
	if ( row ) {
		const explicit =
			row.querySelector( '[data-number-label]' ) ||
			row.querySelector( LABELS );
		if ( explicit && ! explicit.querySelector( 'input, select, button' ) ) {
			return explicit;
		}
		const groupLabel = row.getAttribute( 'aria-labelledby' );
		if ( groupLabel ) {
			return input.ownerDocument.getElementById( groupLabel );
		}
		const head = row.querySelector(
			'.dsm-sliderrow-head > span:first-child'
		);
		if ( head ) {
			return head;
		}
		const parent = row.parentElement;
		if ( parent?.querySelectorAll( 'input[type="range"]' ).length === 1 ) {
			const outside = parent.querySelector( '[data-number-label]' );
			if ( outside ) {
				return outside;
			}
		}
		const first = row.firstElementChild;
		if (
			first &&
			first !== input &&
			first.matches( 'span, label' ) &&
			! first.querySelector( 'input, button, select' ) &&
			! first.matches( VALUES )
		) {
			return first;
		}
		if ( row.matches( 'label' ) ) {
			return row;
		}
	}
	return null;
}

function controlFor( input ) {
	const options = optionsFor( input );
	const spec = input.matches( 'input[type="range"], input[type="number"]' )
		? numberSpec( input )
		: {
				min: options.min ?? -Infinity,
				max: options.max ?? Infinity,
				step: options.step ?? 1,
		  };
	const row = input.matches( SCALARS ) ? scalarRow( input ) : null;
	const value = options.valueElement || row?.querySelector( VALUES );
	const label = options.labelElement || labelFor( input, row );
	const format = options.format;
	const scale = Number( input.dataset.numberScale ) || options.displayScale;
	const display = numberDisplay( format, spec.min, spec.max, scale );
	const read = () => {
		const live = optionsFor( input );
		return live.getValue ? live.getValue() : Number( input.value );
	};
	const currentText = format ? format( read() ) : value?.textContent || '';
	const suffix = options.unit ?? splitNumberText( currentText )?.suffix ?? '';
	const name =
		options.label ||
		input.getAttribute( 'aria-label' ) ||
		label?.textContent.trim() ||
		input.title ||
		__( 'Value', 'wunderpaint' );
	let detents = options.detents;
	if ( input.dataset.numberDetents !== undefined ) {
		try {
			detents = JSON.parse( input.dataset.numberDetents );
		} catch {
			detents = [];
		}
	}
	const angle =
		options.kind === 'angle' ||
		input.dataset.numberKind === 'angle' ||
		suffix === '°' ||
		name.includes( '°' );
	if ( angle ) {
		detents = angleDetents(
			spec.min * display.scale,
			spec.max * display.scale
		).map( ( point ) => point / display.scale );
	}
	return {
		input,
		options,
		spec,
		row,
		value,
		label,
		name,
		read,
		display,
		suffix,
		detents: detents || [],
		angle,
	};
}

// Formula inputs resolve their pending draft once before an arrow step. Reading
// the stored value stays separate so Escape and Undo retain the real origin.
function stepValue( control ) {
	const live = optionsFor( control.input );
	return live.resolveStepValue ? live.resolveStepValue() : control.read();
}

function setValue( control, raw ) {
	const value = normalizeNumber( raw, control.spec );
	if ( value === null || value === control.read() ) {
		return;
	}
	const live = optionsFor( control.input );
	if ( live.onInput ) {
		live.onInput( value );
	} else {
		const input = control.input;
		const setter = Object.getOwnPropertyDescriptor(
			input.ownerDocument.defaultView.HTMLInputElement.prototype,
			'value'
		).set;
		setter.call( input, String( value ) );
		input.dispatchEvent( new Event( 'input', { bubbles: true } ) );
	}
}

function finishControl( control, pointer = true ) {
	const live = optionsFor( control.input );
	if ( live.onCommit || control.options.onCommit ) {
		( live.onCommit || control.options.onCommit )();
	}
	if ( control.input.matches( SCALARS ) ) {
		control.input.dispatchEvent( new Event( 'change', { bubbles: true } ) );
		if ( pointer ) {
			control.input.dispatchEvent(
				new ( control.input.ownerDocument.defaultView.PointerEvent ||
					control.input.ownerDocument.defaultView.MouseEvent )(
					'pointerup',
					{ bubbles: true, pointerId: -1 }
				)
			);
		}
		// Legacy React rows commit on mouse-up; touch/pen and label drags must
		// reach that same boundary even though pointerdown prevented mouse events.
		control.input.dispatchEvent(
			new MouseEvent( 'mouseup', { bubbles: true } )
		);
		if ( control.input.type === 'number' ) {
			control.input.dispatchEvent(
				new control.input.ownerDocument.defaultView.FocusEvent(
					'focusout',
					{ bubbles: true }
				)
			);
		}
	}
}

function decorate( input ) {
	if (
		! input.closest( '#wpie-root' ) ||
		input.closest( '[data-number-controls="off"]' )
	) {
		return;
	}
	const control = controlFor( input );
	input.classList.add( 'wpie-number-control' );
	if ( ! input.title ) {
		input.title = __(
			'Alt + drag: fine adjustment. Shift + drag: faster.',
			'wunderpaint'
		);
	}
	const label = control.label;
	if (
		label &&
		! metadata.has( label ) &&
		! label.matches( '[data-number-scrub]' )
	) {
		label.classList.add( 'wpie-number-label' );
		associations.set( label, { input, value: false } );
		label.title = __(
			'Drag to change the value. Alt: fine. Shift: faster.',
			'wunderpaint'
		);
	}
	// Rows with a real numeric input already have an editable value.
	const value = control.value;
	if (
		input.type === 'range' &&
		value &&
		! control.row?.querySelector( NUMBER_FIELDS ) &&
		! value.querySelector( 'input, button, select' )
	) {
		value.classList.add( 'wpie-number-value' );
		value.tabIndex = enabled( input ) ? 0 : -1;
		value.setAttribute( 'role', 'button' );
		value.setAttribute( 'aria-disabled', String( ! enabled( input ) ) );
		value.setAttribute(
			'aria-label',
			control.name + ': ' + __( 'Edit value', 'wunderpaint' )
		);
		value.title = __(
			'Click to enter a value, or drag to adjust. Alt: fine. Shift: faster.',
			'wunderpaint'
		);
		associations.set( value, { input, value: true } );
	}
}

/** Idempotent, scoped to the editor. Lazy modals/extensions join automatically. */
export function installNumericControls( doc = document ) {
	if ( installations.has( doc ) ) {
		return installations.get( doc );
	}
	const win = doc.defaultView;
	let drag = null;
	let keySession = null;
	let edit = null;
	let suppressClick = null;
	let readout = null;
	let marks = null;

	const removeOverlays = () => {
		readout?.remove();
		marks?.remove();
		readout = null;
		marks = null;
	};
	const showReadout = ( control, fine ) => {
		if ( ! readout ) {
			readout = doc.createElement( 'div' );
			readout.className = 'wpie-number-readout';
			readout.setAttribute( 'aria-hidden', 'true' );
			control.input.closest( '#wpie-root' ).appendChild( readout );
		}
		const value = control.options.toDisplay
			? control.options.toDisplay( control.read() )
			: control.read() * control.display.scale;
		readout.textContent =
			String( Number( value.toFixed( 8 ) ) ) +
			( control.suffix ? ' ' + control.suffix : '' ) +
			( fine ? ' · ' + __( 'Fine', 'wunderpaint' ) : '' );
		const rect = control.input.getBoundingClientRect();
		readout.style.left =
			Math.max( 4, Math.min( win.innerWidth - 150, rect.left ) ) + 'px';
		readout.style.top = Math.max( 4, rect.top - 30 ) + 'px';
		if (
			! marks &&
			control.detents.length &&
			control.input.type === 'range'
		) {
			marks = doc.createElement( 'div' );
			marks.className = 'wpie-number-marks';
			marks.setAttribute( 'aria-hidden', 'true' );
			marks.style.cssText = `left:${ rect.left + 8 }px;top:${
				rect.bottom + 1
			}px;width:${ Math.max( 1, rect.width - 16 ) }px`;
			for ( const point of control.detents ) {
				if (
					point < control.spec.min ||
					point > control.spec.max ||
					control.spec.min === control.spec.max
				) {
					continue;
				}
				const mark = doc.createElement( 'i' );
				mark.style.left =
					( ( point - control.spec.min ) /
						( control.spec.max - control.spec.min ) ) *
						100 +
					'%';
				marks.appendChild( mark );
			}
			control.input.closest( '#wpie-root' ).appendChild( marks );
		}
		marks?.classList.toggle( 'is-fine', fine );
	};

	function finishKeys( cancel = false ) {
		if ( ! keySession ) {
			return;
		}
		const session = keySession;
		keySession = null;
		if ( cancel ) {
			setValue( session.control, session.original );
		}
		const changed = session.control.read() !== session.original;
		finishControl( session.control );
		endNumberTransaction( session.transaction, cancel || ! changed );
	}

	const closeEdit = ( cancel = false, restoreFocus = false ) => {
		if ( ! edit ) {
			return;
		}
		const session = edit;
		edit = null;
		const parsed = parseNumberText( session.field.value );
		if ( cancel || parsed === null ) {
			setValue( session.control, session.original );
		} else {
			setValue(
				session.control,
				session.control.options.parse
					? session.control.options.parse( parsed )
					: parsed / session.control.display.scale
			);
		}
		const changed = session.control.read() !== session.original;
		finishControl( session.control );
		session.field.remove();
		endNumberTransaction(
			session.transaction,
			cancel || parsed === null || ! changed
		);
		if ( restoreFocus && session.anchor.isConnected ) {
			session.anchor.focus( { preventScroll: true } );
		}
	};

	const openEdit = ( control, anchor ) => {
		if ( ! enabled( control.input ) ) {
			return;
		}
		finishKeys();
		closeEdit();
		const field = doc.createElement( 'input' );
		field.type = 'text';
		field.inputMode = 'decimal';
		field.className = 'wpie-number-editor';
		field.setAttribute( 'aria-label', control.name );
		field.setAttribute( 'autocomplete', 'off' );
		field.value = String(
			Number(
				( control.options.toDisplay
					? control.options.toDisplay( control.read() )
					: control.read() * control.display.scale
				).toFixed( 8 )
			)
		);
		const rect = anchor.getBoundingClientRect();
		const width = Math.max( 76, Math.min( 160, rect.width + 18 ) );
		field.style.cssText = `left:${ Math.max(
			4,
			Math.min( win.innerWidth - width - 4, rect.right - width )
		) }px;top:${ Math.max(
			4,
			Math.min( win.innerHeight - 30, rect.top - 3 )
		) }px;width:${ width }px`;
		control.input.closest( '#wpie-root' ).appendChild( field );
		edit = {
			field,
			anchor,
			control,
			original: control.read(),
			transaction: beginNumberTransaction(),
		};
		field.addEventListener( 'blur', () => closeEdit() );
		field.addEventListener( 'input', () => {
			const parsed = parseNumberText( field.value );
			const raw =
				parsed === null
					? null
					: control.options.parse
					? control.options.parse( parsed )
					: parsed / control.display.scale;
			// Allow incomplete text and values below min while typing 192, etc.
			if (
				raw !== null &&
				raw >= control.spec.min &&
				raw <= control.spec.max
			) {
				setValue( control, raw );
			}
		} );
		field.focus( { preventScroll: true } );
		field.select();
	};

	const finishDrag = ( cancel = false, nativePointerUp = false ) => {
		if ( ! drag ) {
			return;
		}
		const session = drag;
		drag = null;
		win.clearTimeout( session.stepTimer );
		if ( cancel ) {
			setValue( session.control, session.original );
		}
		const changed = session.control.read() !== session.original;
		finishControl( session.control, ! session.range || ! nativePointerUp );
		if ( session.handle.hasPointerCapture?.( session.pointerId ) ) {
			session.handle.releasePointerCapture( session.pointerId );
		}
		doc.body.classList.remove(
			'wpie-number-dragging',
			'wpie-number-stepping'
		);
		removeOverlays();
		suppressClick = session.handle;
		// Native pointer-up handlers run after capture and can request their
		// own commit. Fold those into this transaction as well.
		queueMicrotask( () => {
			endNumberTransaction( session.transaction, cancel || ! changed );
			if ( session.editable && ! session.moved && ! cancel ) {
				openEdit( session.control, session.handle );
			}
		} );
	};

	const resolve = ( target ) => {
		if (
			! target.closest?.( '#wpie-root' ) ||
			target.closest( '[data-number-controls="off"]' )
		) {
			return null;
		}
		if ( target.matches( 'input[type="range"]' ) ) {
			return { input: target, handle: target, range: true };
		}
		const handle = target.closest(
			'.wpie-number-value, .wpie-number-label, [data-number-scrub]'
		);
		if (
			! handle ||
			target.closest( 'input, select, textarea, button, a' )
		) {
			return null;
		}
		if ( metadata.has( handle ) ) {
			return {
				input: handle,
				handle,
				editable: optionsFor( handle ).editable,
			};
		}
		const assoc = associations.get( handle );
		return assoc && { input: assoc.input, handle, editable: assoc.value };
	};

	// Native number and registered formula inputs share the same pointer areas.
	// Their existing input nodes and compact panel row widths stay intact.
	const stepTarget = ( e ) => {
		const input = e.target;
		if (
			! input.matches?.( NUMBER_FIELDS ) ||
			! input.classList.contains( 'wpie-number-control' ) ||
			! enabled( input ) ||
			input.closest( '[data-number-controls="off"]' )
		) {
			return 0;
		}
		const rect = input.getBoundingClientRect();
		const width =
			parseFloat(
				win
					.getComputedStyle( input )
					.getPropertyValue( '--number-stepper-width' )
			) || 16;
		if (
			e.clientX < rect.right - width - 1 ||
			e.clientX >= rect.right ||
			e.clientY < rect.top ||
			e.clientY >= rect.bottom
		) {
			return 0;
		}
		return e.clientY < rect.top + rect.height / 2 ? 1 : -1;
	};
	const stepOnce = () => {
		if ( ! drag?.stepDirection || ! enabled( drag.input ) ) {
			return;
		}
		setValue(
			drag.control,
			stepValue( drag.control ) +
				drag.stepDirection *
					( drag.control.spec.step || 0.01 ) *
					( drag.fast ? 10 : 1 )
		);
	};
	const repeatStep = () => {
		if ( ! drag?.stepDirection ) {
			return;
		}
		if ( ! enabled( drag.input ) ) {
			finishDrag();
			return;
		}
		if ( drag.stepInside ) {
			stepOnce();
		}
		drag.stepTimer = win.setTimeout( repeatStep, 80 );
	};

	const down = ( e ) => {
		if (
			e.button !== 0 ||
			e.isPrimary === false ||
			drag ||
			edit?.field === e.target
		) {
			return;
		}
		const direction = stepTarget( e );
		const found = direction
			? { input: e.target, handle: e.target, stepDirection: direction }
			: resolve( e.target );
		if ( ! found || ! enabled( found.input ) ) {
			return;
		}
		const control = controlFor( found.input );
		if ( ! Number.isFinite( control.read() ) || control.options.disabled ) {
			return;
		}
		finishKeys();
		closeEdit();
		e.preventDefault();
		if ( found.input.matches( SCALARS ) ) {
			found.input.focus( { preventScroll: true } );
		}
		const rect = found.input.getBoundingClientRect();
		const width = Math.max( 1, rect.width - 16 );
		drag = {
			...found,
			control,
			pointerId: e.pointerId,
			original: control.read(),
			current: control.read(),
			lastX: e.clientX,
			startX: e.clientX,
			moved: false,
			fine: e.altKey,
			fast: e.shiftKey,
			width,
			transaction: beginNumberTransaction(),
		};
		found.handle.setPointerCapture?.( e.pointerId );
		if ( direction ) {
			drag.moved = true;
			drag.stepInside = true;
			stepOnce();
			drag.stepTimer = win.setTimeout( repeatStep, 400 );
			doc.body.classList.add( 'wpie-number-stepping' );
			return;
		}

		if (
			found.range &&
			! e.altKey &&
			control.spec.max > control.spec.min
		) {
			const thumb =
				rect.left +
				8 +
				( ( control.read() - control.spec.min ) /
					( control.spec.max - control.spec.min ) ) *
					width;
			if ( Math.abs( e.clientX - thumb ) > 10 ) {
				drag.current =
					control.spec.min +
					Math.max(
						0,
						Math.min( 1, ( e.clientX - rect.left - 8 ) / width )
					) *
						( control.spec.max - control.spec.min );
				setValue(
					control,
					snapValue(
						drag.current,
						control.spec.min,
						control.spec.max,
						control.detents,
						control.spec.step,
						width
					)
				);
				drag.moved = true;
			}
		}
		doc.body.classList.add( 'wpie-number-dragging' );
		showReadout( control, e.altKey );
	};
	const move = ( e ) => {
		if ( ! drag && e.target.matches?.( NUMBER_FIELDS ) ) {
			e.target.classList.toggle(
				'is-number-step-target',
				!! stepTarget( e )
			);
		}
		if ( ! drag || e.pointerId !== drag.pointerId ) {
			return;
		}
		if ( ! enabled( drag.control.input ) ) {
			finishDrag( true );
			return;
		}
		e.preventDefault();
		if ( drag.stepDirection ) {
			drag.stepInside = stepTarget( e ) === drag.stepDirection;
			drag.fast = e.shiftKey;
			return;
		}
		if ( e.altKey !== drag.fine || e.shiftKey !== drag.fast ) {
			drag.current = drag.control.read();
			drag.lastX = e.clientX;
			drag.fine = e.altKey;
			drag.fast = e.shiftKey;
			showReadout( drag.control, e.altKey );
			return;
		}
		if ( ! drag.moved && Math.abs( e.clientX - drag.startX ) < 2 ) {
			return;
		}
		drag.moved = true;
		if (
			e.altKey &&
			drag.control.options.toDisplay &&
			drag.control.options.parse &&
			drag.control.options.displayStep > 0
		) {
			const displayed = drag.control.options.toDisplay( drag.current );
			drag.current = Math.max(
				drag.control.spec.min,
				Math.min(
					drag.control.spec.max,
					drag.control.options.parse(
						displayed +
							( ( e.clientX - drag.lastX ) *
								( drag.control.options.displayStep || 1 ) ) /
								4
					)
				)
			);
		} else {
			drag.current = dragNumber(
				drag.current,
				e.clientX - drag.lastX,
				drag.control.spec,
				{
					fine: e.altKey,
					fast: e.shiftKey,
					rangeWidth: drag.range ? drag.width : 0,
				}
			);
		}
		drag.lastX = e.clientX;
		const { min, max, step } = drag.control.spec;
		setValue(
			drag.control,
			e.altKey
				? drag.current
				: snapValue(
						drag.current,
						min,
						max,
						drag.control.detents,
						step,
						drag.width
				  )
		);
		showReadout( drag.control, e.altKey );
	};
	const up = ( e ) => {
		if ( drag && e.pointerId === drag.pointerId ) {
			finishDrag( e.type === 'pointercancel', e.type === 'pointerup' );
		}
	};
	const click = ( e ) => {
		if (
			suppressClick &&
			( e.target === suppressClick || suppressClick.contains( e.target ) )
		) {
			e.preventDefault();
			e.stopImmediatePropagation();
			suppressClick = null;
			return;
		}
		suppressClick = null;
		const found = resolve( e.target );
		if ( found?.editable ) {
			e.preventDefault();
			e.stopImmediatePropagation();
			openEdit( controlFor( found.input ), found.handle );
		}
	};
	const key = ( e ) => {
		if ( edit && e.target === edit.field ) {
			if ( e.key === 'Enter' || e.key === 'Escape' ) {
				e.preventDefault();
				e.stopImmediatePropagation();
				closeEdit( e.key === 'Escape', true );
			} else if ( e.key.startsWith( 'Arrow' ) ) {
				e.stopImmediatePropagation();
			}
			return;
		}
		if ( keySession && e.key === 'Escape' ) {
			e.preventDefault();
			e.stopImmediatePropagation();
			finishKeys( true );
			return;
		}
		if ( drag ) {
			if ( e.key === 'Escape' ) {
				e.preventDefault();
				e.stopImmediatePropagation();
				finishDrag( true );
			} else if ( [ 'Alt', 'Shift' ].includes( e.key ) ) {
				e.preventDefault();
				drag.fine = e.altKey;
				drag.fast = e.shiftKey;
				drag.current = drag.control.read();
				if ( ! drag.stepDirection ) {
					showReadout( drag.control, e.altKey );
				}
			}
			return;
		}
		const found = resolve( e.target );
		if ( found?.editable && [ 'Enter', ' ' ].includes( e.key ) ) {
			e.preventDefault();
			e.stopImmediatePropagation();
			openEdit( controlFor( found.input ), found.handle );
			return;
		}
		if (
			e.target.matches?.( SCALARS ) &&
			e.target.closest( '#wpie-root' ) &&
			! e.target.closest( '[data-number-controls="off"]' ) &&
			enabled( e.target ) &&
			[
				'ArrowLeft',
				'ArrowRight',
				'ArrowUp',
				'ArrowDown',
				'Home',
				'End',
				'PageUp',
				'PageDown',
			].includes( e.key ) &&
			( e.target.type === 'range' ||
				[ 'ArrowUp', 'ArrowDown' ].includes( e.key ) )
		) {
			if ( e.ctrlKey || e.metaKey ) {
				return;
			}
			e.preventDefault();
			e.stopImmediatePropagation();
			const control = controlFor( e.target );
			const { min, max, step } = control.spec;
			const direction = [ 'ArrowLeft', 'ArrowDown', 'PageDown' ].includes(
				e.key
			)
				? -1
				: 1;
			let value =
				e.key === 'Home'
					? min
					: e.key === 'End'
					? max
					: stepValue( control ) +
					  direction *
							( step || 0.01 ) *
							( e.shiftKey || e.key.startsWith( 'Page' )
								? 10
								: 1 );
			if (
				control.options.toDisplay &&
				control.options.parse &&
				control.options.displayStep > 0 &&
				! [ 'Home', 'End' ].includes( e.key )
			) {
				value = control.options.parse(
					control.options.toDisplay( control.read() ) +
						direction *
							( control.options.displayStep || 1 ) *
							( e.shiftKey || e.key.startsWith( 'Page' )
								? 10
								: 1 )
				);
			}
			if ( keySession && keySession.control.input !== control.input ) {
				finishKeys();
			}
			if ( ! keySession ) {
				keySession = {
					control,
					original: control.read(),
					key: e.key,
					transaction: beginNumberTransaction(),
				};
			}
			setValue( control, value );
		}
	};
	const keyup = ( e ) => {
		if ( keySession?.key === e.key ) {
			finishKeys();
		}
		if ( drag && [ 'Alt', 'Shift' ].includes( e.key ) ) {
			drag.current = drag.control.read();
			drag.fine = e.altKey;
			drag.fast = e.shiftKey;
			if ( ! drag.stepDirection ) {
				showReadout( drag.control, e.altKey );
			}
		}
	};
	const blur = () => {
		finishKeys();
		finishDrag();
		closeEdit();
	};

	const scan = ( node ) => {
		if ( node.nodeType !== 1 ) {
			return;
		}
		if ( node.matches( SCALARS ) ) {
			decorate( node );
		}
		node.querySelectorAll( SCALARS ).forEach( decorate );
	};
	const observer = new win.MutationObserver( ( records ) => {
		const nodes = new Set();
		for ( const record of records ) {
			if ( record.type === 'attributes' ) {
				nodes.add( record.target );
			} else {
				for ( const node of record.addedNodes ) {
					if (
						node.nodeType === 1 &&
						! node.matches(
							'.wpie-number-readout, .wpie-number-editor, .wpie-number-marks'
						)
					) {
						nodes.add( node );
					}
				}
			}
		}
		nodes.forEach( scan );
		if ( drag && ! drag.control.input.isConnected ) {
			finishDrag();
		}
		if ( keySession && ! keySession.control.input.isConnected ) {
			finishKeys();
		}
		if ( edit && ! edit.control.input.isConnected ) {
			closeEdit();
		}
	} );
	observer.observe( doc.documentElement, {
		childList: true,
		subtree: true,
		attributes: true,
		attributeFilter: [ 'min', 'max', 'step', 'disabled' ],
	} );
	scan( doc.documentElement );
	const events = {
		pointerdown: down,
		pointermove: move,
		pointerout: ( e ) =>
			e.target.classList?.remove( 'is-number-step-target' ),
		pointerup: up,
		pointercancel: up,
		lostpointercapture: up,
		focusout: ( e ) => {
			if ( keySession?.control.input === e.target ) {
				finishKeys();
			}
		},
		click,
		keydown: key,
		keyup,
	};
	for ( const [ name, handler ] of Object.entries( events ) ) {
		doc.addEventListener( name, handler, {
			capture: true,
			passive: false,
		} );
	}
	win.addEventListener( 'blur', blur );
	const dispose = () => {
		blur();
		observer.disconnect();
		for ( const [ name, handler ] of Object.entries( events ) ) {
			doc.removeEventListener( name, handler, true );
		}
		win.removeEventListener( 'blur', blur );
		installations.delete( doc );
	};
	installations.set( doc, dispose );
	return dispose;
}
