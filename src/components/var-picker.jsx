/**
 * VarButton (v1.161.0): a tiny `{…}` button for any input or textarea
 * that inserts dynamic-variable tokens (`{{post.url}}`, `{{wc.sku}}`, …)
 * at the caret. One global component so every form field that stores
 * token-capable strings (QR contents today, more tools tomorrow) offers
 * the same compact picker: search box, the grouped server catalog, and
 * a custom-field escape hatch.
 *
 * Controlled-input contract: the caller passes the field's `value`,
 * `onChange` (receives the full new string) and a ref to the DOM
 * element so the token lands at the selection and focus returns there.
 */

import { useEffect, useRef, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { bindingGroups } from '../lib/dynamic-content';

const POP_W = 264;
const POP_MAX_H = 320;

/** Popover position next to the button; flips above when space runs out. */
const popStyle = ( btn ) => {
	const r = btn.getBoundingClientRect();
	const below = window.innerHeight - r.bottom;
	const style = {
		position: 'fixed',
		zIndex: 4000,
		width: POP_W,
		maxHeight: POP_MAX_H,
		left: Math.max(
			8,
			Math.min( r.right - POP_W, window.innerWidth - POP_W - 8 )
		),
	};
	if ( below < POP_MAX_H + 12 && r.top > below ) {
		style.bottom = window.innerHeight - r.top + 4;
	} else {
		style.top = r.bottom + 4;
	}
	return style;
};

// `getValue` (optional) beats `value`: mounted-DOM consumers (extension
// packs via bridge.components.mountVarButton) read the field lazily at
// insert time instead of re-rendering on every keystroke.
export function VarButton( {
	value,
	onChange,
	inputRef,
	kit = null,
	getValue,
	groups: groupsProp = null,
	// Hover handlers from useHoverTip (v1.250.1): when set, the styled
	// tooltip replaces the native title bubble (canvas context bar).
	tipProps = null,
	// Kit switcher (v1.251.0): with 2+ kits the popover shows which kit
	// supplies the brand variables and lets the user switch right there.
	// The callback persists the choice (the document's kit assignment);
	// without it the switcher stays hidden - a list-only switch would lie,
	// tokens still resolve against the assigned kit.
	onKitChange = null,
} ) {
	const [ open, setOpen ] = useState( false );
	const [ query, setQuery ] = useState( '' );
	const [ kitId, setKitId ] = useState( '' );
	const wrapRef = useRef( null );
	const btnRef = useRef( null );
	const allKits = window.WPIE?.brandKits || [];
	const activeKit =
		( kitId && allKits.find( ( k ) => k.id === kitId ) ) || kit;
	const showKitRow = ! groupsProp && onKitChange && allKits.length > 1;

	useEffect( () => {
		if ( ! open ) {
			return;
		}
		const away = ( e ) => {
			if ( ! wrapRef.current?.contains( e.target ) ) {
				setOpen( false );
			}
		};
		const key = ( e ) => {
			if ( 'Escape' === e.key ) {
				e.stopPropagation();
				setOpen( false );
			}
		};
		document.addEventListener( 'mousedown', away );
		document.addEventListener( 'keydown', key, true );
		return () => {
			document.removeEventListener( 'mousedown', away );
			document.removeEventListener( 'keydown', key, true );
		};
	}, [ open ] );

	const insert = ( id ) => {
		const token = `{{${ id }}}`;
		const el = inputRef?.current;
		const cur = String( ( getValue ? getValue() : value ) || '' );
		let next = cur + token;
		let caret = next.length;
		if ( el && 'number' === typeof el.selectionStart ) {
			const s = el.selectionStart;
			next = cur.slice( 0, s ) + token + cur.slice( el.selectionEnd );
			caret = s + token.length;
		}
		onChange( next );
		setOpen( false );
		setQuery( '' );
		if ( el ) {
			window.requestAnimationFrame( () => {
				el.focus();
				try {
					el.setSelectionRange( caret, caret );
				} catch ( e ) {
					// Number/color inputs have no selection API.
				}
			} );
		}
	};

	const q = query.trim().toLowerCase();
	const groups = ( groupsProp || bindingGroups( activeKit ) )
		.map( ( g ) => ( {
			...g,
			items: ( g.items || [] ).filter(
				( b ) =>
					'text' === b.kind &&
					( ! q ||
						b.label.toLowerCase().includes( q ) ||
						b.id.toLowerCase().includes( q ) )
			),
		} ) )
		.filter( ( g ) => g.items.length );
	// Escape hatch: any key-shaped query becomes a custom-field token, so
	// meta values work without memorizing the {{meta.…}} syntax.
	const metaKey = /^[A-Za-z0-9_-]+$/.test( query.trim() ) ? query.trim() : '';

	return (
		<span
			ref={ wrapRef }
			style={ {
				position: 'relative',
				display: 'inline-flex',
				flexShrink: 0,
			} }
		>
			<button
				type="button"
				ref={ btnRef }
				className="wpie-var-btn"
				title={
					tipProps
						? undefined
						: __( 'Insert dynamic variable', 'wunderpaint' )
				}
				aria-label={ __( 'Insert dynamic variable', 'wunderpaint' ) }
				aria-expanded={ open }
				{ ...( tipProps || {} ) }
				onClick={ ( e ) => {
					// The styled tip must not linger over the picker.
					tipProps?.onMouseLeave?.( e );
					setOpen( ( o ) => ! o );
				} }
			>
				{ '{…}' }
			</button>
			{ open && (
				<div
					className="wpie-var-pop"
					style={ popStyle( btnRef.current ) }
					role="listbox"
				>
					{ showKitRow && (
						<div className="wpie-var-kitrow">
							<span>{ __( 'Brand Kit', 'wunderpaint' ) }</span>
							<select
								className="dsm-select"
								value={ activeKit?.id || '' }
								onChange={ ( e ) => {
									setKitId( e.target.value );
									onKitChange( e.target.value );
								} }
							>
								{ allKits.map( ( k ) => (
									<option key={ k.id } value={ k.id }>
										{ k.name }
									</option>
								) ) }
							</select>
						</div>
					) }
					<div className="wpie-var-list">
						{ groups.map( ( g ) => (
							<div key={ g.label }>
								<div className="wpie-var-group">
									{ g.label }
								</div>
								{ g.items.map( ( b ) => (
									<button
										type="button"
										key={ b.id }
										className="wpie-var-item"
										onClick={ () => insert( b.id ) }
									>
										<span>{ b.label }</span>
										<code>{ `{{${ b.id }}}` }</code>
									</button>
								) ) }
							</div>
						) ) }
						{ !! metaKey && (
							<button
								type="button"
								className="wpie-var-item"
								onClick={ () => insert( 'meta.' + metaKey ) }
							>
								<span>
									{ sprintf(
										/* translators: %s: post meta key. */
										__(
											'Custom field “%s”',
											'wunderpaint'
										),
										metaKey
									) }
								</span>
								<code>{ `{{meta.${ metaKey }}}` }</code>
							</button>
						) }
						{ ! groups.length && ! metaKey && (
							<div className="wpie-var-group">
								{ __( 'No matching variable.', 'wunderpaint' ) }
							</div>
						) }
					</div>
					<input
						type="text"
						className="dsm-input wpie-var-search"
						placeholder={ __( 'Search variables…', 'wunderpaint' ) }
						value={ query }
						/* eslint-disable-next-line jsx-a11y/no-autofocus -- search box of a just-opened picker */
						autoFocus
						onChange={ ( e ) => setQuery( e.target.value ) }
					/>
				</div>
			) }
		</span>
	);
}
