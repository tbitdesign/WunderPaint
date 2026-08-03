/**
 * Modal host for lib/dialogs.js prompt/confirm requests, editor-styled
 * replacement for native browser popups. Mounted once in EditorScreen.
 */

import { useState, useEffect, useRef } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { bindDialogHost } from '../lib/dialogs';
import { SwatchButton } from './color-popover';

export function DialogHost() {
	const [ request, setRequest ] = useState( null );
	const [ value, setValue ] = useState( '' );
	const [ selectValue, setSelectValue ] = useState( '' );
	// An optional third control (v1.370). Some commands need one boolean
	// beside the value - "keep every copy upright" - and without it the
	// choice has to be folded into the select as twice as many options.
	const [ checkValue, setCheckValue ] = useState( false );
	const queue = useRef( [] );
	const inputRef = useRef( null );

	const initialFor = ( req ) =>
		null !== ( req.opts.defaultValue ?? null )
			? String( req.opts.defaultValue )
			: req.opts.options?.[ 0 ] ?? '';

	const initialCheckFor = ( req ) => !! req.opts.check?.defaultValue;

	const initialSelectFor = ( req ) =>
		req.opts.select
			? req.opts.select.defaultValue ??
			  req.opts.select.options?.[ 0 ] ??
			  ''
			: '';

	useEffect( () => {
		const unbind = bindDialogHost( ( req ) => {
			setRequest( ( current ) => {
				if ( current ) {
					queue.current.push( req );
					return current;
				}
				setValue( initialFor( req ) );
				setSelectValue( initialSelectFor( req ) );
				return req;
			} );
		} );
		return unbind;
	}, [] );

	useEffect( () => {
		if ( request && 'prompt' === request.kind ) {
			inputRef.current?.focus();
			inputRef.current?.select?.();
		}
	}, [ request ] );

	if ( ! request ) {
		return null;
	}

	const finish = ( result ) => {
		request.resolve( result );
		const next = queue.current.shift() || null;
		if ( next ) {
			setValue( initialFor( next ) );
			setSelectValue( initialSelectFor( next ) );
			setCheckValue( initialCheckFor( next ) );
		}
		setRequest( next );
	};

	const { opts, kind } = request;
	const cancel = () => finish( 'prompt' === kind ? null : false );
	const submit = () =>
		finish(
			'prompt' !== kind
				? true
				: opts.select || opts.check
				? { value, select: selectValue, check: checkValue }
				: value
		);

	return (
		<div
			className="modal-backdrop"
			style={ { zIndex: 700 } }
			onClick={ cancel }
			role="presentation"
			onKeyDown={ ( e ) => {
				if ( 'Escape' === e.key ) {
					e.stopPropagation();
					cancel();
				}
			} }
		>
			<div
				className="wpie-input-dialog"
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-label={ opts.title }
			>
				<div className="wpie-input-dialog-title">{ opts.title }</div>
				{ opts.message && (
					<div className="wpie-input-dialog-message">
						{ opts.message }
					</div>
				) }
				{ 'prompt' === kind && (
					<form
						onSubmit={ ( e ) => {
							e.preventDefault();
							submit();
						} }
					>
						{ opts.label && (
							<label
								className="wpie-input-dialog-label"
								htmlFor="wpie-dialog-input"
							>
								{ opts.label }
							</label>
						) }
						{ opts.options ? (
							<select
								className="dsm-select"
								id="wpie-dialog-input"
								ref={ inputRef }
								value={ value }
								onChange={ ( e ) => setValue( e.target.value ) }
							>
								{ opts.options.map( ( option ) => (
									<option key={ option } value={ option }>
										{ option }
									</option>
								) ) }
							</select>
						) : 'color' === opts.type ? (
							// House rule: our HSV picker, never the OS
							// color dialog (v1.245.5).
							<SwatchButton
								color={ value }
								size={ 34 }
								title={ opts.label }
								onChange={ ( c ) => setValue( c ) }
							/>
						) : (
							<input
								id="wpie-dialog-input"
								ref={ inputRef }
								type={
									'number' === opts.type ? 'number' : 'text'
								}
								value={ value }
								placeholder={ opts.placeholder }
								onChange={ ( e ) => setValue( e.target.value ) }
							/>
						) }
						{ opts.select && (
							<div className="wpie-input-dialog-second">
								{ opts.select.label && (
									<label
										className="wpie-input-dialog-label"
										htmlFor="wpie-dialog-select"
									>
										{ opts.select.label }
									</label>
								) }
								<select
									className="dsm-select"
									id="wpie-dialog-select"
									value={ selectValue }
									onChange={ ( e ) =>
										setSelectValue( e.target.value )
									}
								>
									{ ( opts.select.options || [] ).map(
										( option ) => (
											<option
												key={ option }
												value={ option }
											>
												{ option }
											</option>
										)
									) }
								</select>
							</div>
						) }
						{ opts.check && (
							<label className="wpie-input-dialog-check">
								<input
									type="checkbox"
									checked={ checkValue }
									onChange={ ( e ) =>
										setCheckValue( e.target.checked )
									}
								/>
								<span>{ opts.check.label }</span>
							</label>
						) }
					</form>
				) }
				<div className="wpie-input-dialog-buttons">
					<button className="ai-btn secondary" onClick={ cancel }>
						{ opts.cancelLabel || __( 'Cancel', 'wunderpaint' ) }
					</button>
					<button
						className={ `ai-btn primary${
							opts.danger ? ' danger' : ''
						}` }
						onClick={ submit }
					>
						{ opts.confirmLabel || __( 'OK', 'wunderpaint' ) }
					</button>
				</div>
			</div>
		</div>
	);
}
