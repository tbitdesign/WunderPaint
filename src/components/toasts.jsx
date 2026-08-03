/**
 * Toast notifications (success/error with optional link).
 */

import {
	createContext,
	useContext,
	useState,
	useCallback,
	useMemo,
} from '@wordpress/element';

const ToastContext = createContext( null );
let toastId = 0;

export function ToastProvider( { children } ) {
	const [ toasts, setToasts ] = useState( [] );

	const remove = useCallback( ( id ) => {
		setToasts( ( list ) => list.filter( ( t ) => t.id !== id ) );
	}, [] );

	const push = useCallback(
		(
			message,
			{ type = 'info', linkText, linkHref, onLink, duration = 5000 } = {}
		) => {
			const id = ++toastId;
			setToasts( ( list ) => [
				...list,
				{ id, message, type, linkText, linkHref, onLink },
			] );
			if ( duration ) {
				window.setTimeout( () => remove( id ), duration );
			}
			return id;
		},
		[ remove ]
	);

	const value = useMemo(
		() => ( {
			toast: push,
			success: ( msg, opts ) => push( msg, { ...opts, type: 'success' } ),
			error: ( msg, opts ) =>
				push( msg, {
					...opts,
					type: 'error',
					duration: opts?.duration ?? 8000,
				} ),
			remove,
		} ),
		[ push, remove ]
	);

	return (
		<ToastContext.Provider value={ value }>
			{ children }
			<div className="wpie-toasts" role="status" aria-live="polite">
				{ toasts.map( ( t ) => (
					<div key={ t.id } className={ `wpie-toast ${ t.type }` }>
						<span>{ t.message }</span>
						{ t.linkText && (
							<a
								href={ t.linkHref || '#' }
								onClick={ ( e ) => {
									if ( t.onLink ) {
										e.preventDefault();
										t.onLink();
									}
								} }
							>
								{ t.linkText }
							</a>
						) }
						<button
							onClick={ () => remove( t.id ) }
							aria-label="Dismiss"
							style={ { marginLeft: 4, opacity: 0.6 } }
						>
							✕
						</button>
					</div>
				) ) }
			</div>
		</ToastContext.Provider>
	);
}

export function useToasts() {
	const ctx = useContext( ToastContext );
	if ( ! ctx ) {
		throw new Error( 'useToasts must be used inside <ToastProvider>' );
	}
	return ctx;
}
