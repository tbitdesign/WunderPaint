import { __ } from '@wordpress/i18n';
import { createPixelstorm } from './engine';
import { captureEditor } from './snapshot';
import './pixelstorm.css';

/** Only transparent pixels above the real editor. No replacement UI. */
export function openPixelstorm( root, onClosed, onError ) {
	if ( ! root ) {
		throw new Error( 'Editor unavailable' );
	}
	const previousFocus = root.ownerDocument.activeElement;
	const previousInert = root.inert;
	const previousHidden = root.getAttribute( 'aria-hidden' );
	const controller = new AbortController();
	const brand = root.querySelector( '.ed-brand' )?.getBoundingClientRect();
	let game = null;
	let disposed = false;
	let closeTimer = 0;
	let clicks = [];
	const host = document.createElement( 'div' );
	host.className = 'wpie-pixelstorm';
	host.tabIndex = -1;
	host.setAttribute( 'role', 'dialog' );
	host.setAttribute( 'aria-modal', 'true' );
	host.setAttribute( 'aria-label', __( 'Pixelstorm', 'wunderpaint' ) );
	const canvas = document.createElement( 'canvas' );
	canvas.className = 'wpie-pixelstorm-canvas';
	host.appendChild( canvas );
	const end = () => {
		if ( disposed ) {
			return;
		}
		disposed = true;
		controller.abort();
		clearTimeout( closeTimer );
		game?.destroy();
		host.remove();
		root.inert = previousInert;
		if ( previousHidden === null ) {
			root.removeAttribute( 'aria-hidden' );
		} else {
			root.setAttribute( 'aria-hidden', previousHidden );
		}
		if ( previousFocus?.isConnected ) {
			previousFocus.focus?.( { preventScroll: true } );
		}
		if ( window.__wpiePixelstorm?.host === host ) {
			delete window.__wpiePixelstorm;
		}
		onClosed();
	};
	const close = () => {
		if ( ! game || document.hidden ) {
			end();
			return;
		}
		game.close();
		if ( ! disposed ) {
			clearTimeout( closeTimer );
			closeTimer = setTimeout( end, 2600 );
		}
	};
	const listen = ( target, event, fn, options = {} ) =>
		target.addEventListener( event, fn, {
			...options,
			signal: controller.signal,
		} );
	listen( window, 'resize', end );
	listen( window, 'scroll', end );
	listen( host, 'wheel', ( event ) => event.preventDefault(), {
		passive: false,
	} );
	listen( host, 'click', ( event ) => {
		if (
			! brand ||
			event.clientX < brand.left ||
			event.clientX > brand.right ||
			event.clientY < brand.top ||
			event.clientY > brand.bottom
		) {
			clicks = [];
			return;
		}
		const now = performance.now();
		clicks = clicks.filter( ( stamp ) => now - stamp < 900 );
		clicks.push( now );
		if ( clicks.length >= 3 ) {
			close();
		}
	} );
	// A second finger exits without adding a visible mobile control.
	listen(
		host,
		'pointerdown',
		( event ) => {
			if ( event.pointerType === 'touch' && ! event.isPrimary ) {
				event.stopImmediatePropagation();
				close();
			}
		},
		{ capture: true }
	);
	listen(
		window,
		'keydown',
		( event ) => {
			event.stopImmediatePropagation();
			event.preventDefault();
			if ( event.key === 'Escape' ) {
				close();
			}
		},
		{ capture: true }
	);
	listen( window, 'keyup', ( event ) => event.stopImmediatePropagation(), {
		capture: true,
	} );
	root.inert = true;
	root.setAttribute( 'aria-hidden', 'true' );
	document.body.appendChild( host );
	host.focus( { preventScroll: true } );
	captureEditor( root, controller.signal )
		.then( ( snapshot ) => {
			if ( disposed ) {
				return;
			}
			game = createPixelstorm( { canvas, ...snapshot, onClose: end } );
			window.__wpiePixelstorm = { host, inspect: game.inspect };
		} )
		.catch( ( error ) => {
			if ( ! disposed ) {
				end();
				onError?.( error );
			}
		} );
	return end;
}
