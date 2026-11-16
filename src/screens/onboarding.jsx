/** Manual editor overview and the shared spotlight for task-specific guides. */
import {
	useState,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
} from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { useEscape } from '../components/use-escape';
import { onboardingSteps } from './onboarding-steps';

function findTarget( root, selector ) {
	return Array.from( root?.querySelectorAll( selector ) || [] ).find(
		( el ) => {
			const r = el.getBoundingClientRect();
			const style = window.getComputedStyle( el );
			return (
				style.visibility !== 'hidden' &&
				style.display !== 'none' &&
				r.width > 0 &&
				r.height > 0 &&
				r.right > 0 &&
				r.bottom > 0 &&
				r.left < window.innerWidth &&
				r.top < window.innerHeight
			);
		}
	);
}

/** Guides retain their `before` hooks; the overview only visits visible UI. */
export function SpotlightTour( {
	steps,
	onClose,
	editor,
	extras,
	doneLabel,
	skipMissingTargets = false,
} ) {
	const [ step, setStep ] = useState( 0 );
	const [ available, setAvailable ] = useState( steps );
	const [ layout, setLayout ] = useState( { rect: null, left: 16, top: 16 } );
	const tourRef = useRef( null );
	const boxRef = useRef( null );
	const context = useRef( { editor, extras } );
	context.current = { editor, extras };
	const closeRef = useRef( onClose );
	closeRef.current = onClose;
	const current = available[ step ];
	useEscape( onClose );

	useLayoutEffect( () => {
		const root = tourRef.current?.closest( '.editor-root' ) || document;
		const visible = skipMissingTargets
			? steps.filter( ( item ) => findTarget( root, item.selector ) )
			: steps;
		setAvailable( visible );
		setStep( 0 );
		if ( ! visible.length ) {
			closeRef.current();
		}
	}, [ steps, skipMissingTargets ] );

	useEffect( () => {
		const tour = tourRef.current;
		if ( ! tour ) {
			return undefined;
		}
		const previous = tour.ownerDocument.activeElement;
		const root = tour.closest( '.editor-root' );
		const onKey = ( event ) => {
			// Keep editor shortcuts and focus behind the tour inactive.
			event.stopPropagation();
			if ( event.key === 'Tab' ) {
				const buttons = tour.querySelectorAll( 'button' );
				const next = event.shiftKey
					? buttons[ buttons.length - 1 ]
					: buttons[ 0 ];
				const edge = event.shiftKey
					? buttons[ 0 ]
					: buttons[ buttons.length - 1 ];
				if ( tour.ownerDocument.activeElement === edge ) {
					event.preventDefault();
					next.focus();
				}
			}
		};
		tour.addEventListener( 'keydown', onKey );
		tour.querySelector( '.ai-btn.primary' )?.focus();
		return () => {
			tour.removeEventListener( 'keydown', onKey );
			const target = previous?.isConnected
				? previous
				: root?.querySelector( '[data-menu="help"]' );
			target?.focus?.( { preventScroll: true } );
		};
	}, [] );

	useLayoutEffect( () => {
		if ( ! current ) {
			return undefined;
		}
		try {
			current.before?.( context.current.editor, context.current.extras );
		} catch ( e ) {}
		const root = tourRef.current?.closest( '.editor-root' ) || document;
		let frame;
		const measure = () => {
			const el = findTarget( root, current.selector );
			const r = el?.getBoundingClientRect();
			const width = window.innerWidth;
			const height = window.innerHeight;
			const rect = r
				? {
						x: Math.max( 0, r.left ),
						y: Math.max( 0, r.top ),
						w: Math.min( width, r.right ) - Math.max( 0, r.left ),
						h: Math.min( height, r.bottom ) - Math.max( 0, r.top ),
				  }
				: null;
			const box = boxRef.current?.getBoundingClientRect();
			const w = box?.width || 320;
			const h = box?.height || 200;
			let left = ( width - w ) / 2;
			let top = ( height - h ) / 2;
			if ( rect ) {
				if ( rect.x + rect.w + w + 32 <= width ) {
					left = rect.x + rect.w + 16;
					top = rect.y + ( rect.h - h ) / 2;
				} else if ( rect.x - w - 16 >= 16 ) {
					left = rect.x - w - 16;
					top = rect.y + ( rect.h - h ) / 2;
				} else if ( rect.y + rect.h + h + 32 <= height ) {
					top = rect.y + rect.h + 16;
				} else if ( rect.y - h - 16 >= 16 ) {
					top = rect.y - h - 16;
				}
			}
			const next = {
				rect,
				left: Math.max( 16, Math.min( width - w - 16, left ) ),
				top: Math.max( 16, Math.min( height - h - 16, top ) ),
			};
			setLayout( ( previous ) =>
				JSON.stringify( previous ) === JSON.stringify( next )
					? previous
					: next
			);
		};
		const schedule = () => {
			cancelAnimationFrame( frame );
			frame = requestAnimationFrame( measure );
		};
		measure();
		// Let the existing how-to guides settle after a tool or tab switch.
		const timer = setTimeout( measure, 120 );
		const observer = new ResizeObserver( schedule );
		if ( root instanceof Element ) {
			observer.observe( root );
		}
		if ( boxRef.current ) {
			observer.observe( boxRef.current );
		}
		const target = findTarget( root, current.selector );
		if ( target ) {
			observer.observe( target );
		}
		window.addEventListener( 'resize', schedule );
		window.addEventListener( 'scroll', schedule, true );
		return () => {
			clearTimeout( timer );
			cancelAnimationFrame( frame );
			observer.disconnect();
			window.removeEventListener( 'resize', schedule );
			window.removeEventListener( 'scroll', schedule, true );
		};
	}, [ current ] );

	if ( ! current ) {
		return null;
	}
	const { rect, left, top } = layout;
	return (
		<div
			ref={ tourRef }
			className="wpie-tour"
			role="dialog"
			aria-modal="true"
			aria-label={ __( 'Editor tour', 'wunderpaint' ) }
		>
			{ ! rect && <div className="wpie-tour-veil" /> }
			{ rect && (
				<div
					className="wpie-tour-spot"
					style={ {
						left: rect.x - 6,
						top: rect.y - 6,
						width: rect.w + 12,
						height: rect.h + 12,
					} }
				/>
			) }
			<div
				ref={ boxRef }
				className="wpie-tour-box"
				style={ { left, top } }
			>
				<div className="wpie-tour-step">
					{ step + 1 } / { available.length }
				</div>
				<div className="wpie-tour-title">{ current.title }</div>
				<div className="wpie-tour-body">
					{ typeof current.body === 'function'
						? current.body()
						: current.body }
				</div>
				<div className="wpie-tour-buttons">
					<button
						type="button"
						className="ai-btn secondary"
						onClick={ onClose }
					>
						{ __( 'Close', 'wunderpaint' ) }
					</button>
					{ step < available.length - 1 ? (
						<button
							type="button"
							className="ai-btn primary"
							onClick={ () => setStep( step + 1 ) }
						>
							{ __( 'Next', 'wunderpaint' ) }
						</button>
					) : (
						<button
							type="button"
							className="ai-btn primary"
							onClick={ onClose }
						>
							{ doneLabel ||
								__( 'Start editing', 'wunderpaint' ) }
						</button>
					) }
				</div>
			</div>
		</div>
	);
}

export function OnboardingTour( { onClose, easyMode = false } ) {
	const steps = useMemo( () => onboardingSteps( easyMode ), [ easyMode ] );
	return (
		<SpotlightTour
			steps={ steps }
			onClose={ onClose }
			skipMissingTargets
			doneLabel={ __( 'Done', 'wunderpaint' ) }
		/>
	);
}
