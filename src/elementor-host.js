/**
 * Elementor host adapter for "edit in place" (v1.180.4).
 *
 * Runs in the Elementor EDITOR (parent window). It injects an "Edit Image"
 * button into image controls and, on click, opens the shared overlay
 * (src/lib/embed-overlay.js) on that attachment. On apply it writes the result
 * back into the control via Elementor's public settings command.
 *
 * Only the Elementor-specific bits live here (button placement, resolving the
 * edited control, the write-back); the overlay + postMessage protocol are
 * shared so other builders reuse them. Everything Elementor-internal is guarded
 * so a wrong assumption degrades to a no-op instead of throwing in the editor.
 */

import { openEmbedEditor } from './lib/embed-overlay';

( function () {
	const CFG = window.WPIEElementor || {};
	const BTN_CLASS = 'wpie-elementor-edit';

	// Utility classes on an `.elementor-control` wrapper that are NOT the
	// setting name; whatever `elementor-control-<x>` remains is the setting.
	const NON_SETTING = new Set( [
		'media',
		'type',
		'separator',
		'responsive',
		'hidden',
	] );

	// The container of the element currently open in the panel. Public API,
	// but wrapped defensively across Elementor versions.
	function currentContainer() {
		try {
			const page = window.elementor
				?.getPanelView?.()
				?.getCurrentPageView?.();
			const view = page?.getOption?.( 'editedElementView' );
			return view?.getContainer?.() || null;
		} catch ( e ) {
			return null;
		}
	}

	// The setting name a media control edits, read from its wrapper classes:
	// `.elementor-control-<name>` (minus the known non-setting tokens).
	function settingNameFrom( controlEl ) {
		if ( ! controlEl ) {
			return '';
		}
		for ( const c of Array.from( controlEl.classList ) ) {
			const m = /^elementor-control-([a-z0-9_]+)$/.exec( c );
			if ( m && ! NON_SETTING.has( m[ 1 ] ) ) {
				return m[ 1 ];
			}
		}
		return '';
	}

	// A non-blocking message (no native popups): Elementor's toast when
	// available, otherwise a console warning.
	function notify( msg ) {
		try {
			if ( window.elementor?.notifications?.showToast ) {
				window.elementor.notifications.showToast( { message: msg } );
				return;
			}
		} catch ( e ) {
			// fall through to console
		}
		// eslint-disable-next-line no-console
		console.warn( '[wpie] ' + msg );
	}

	function openEditor( controlEl ) {
		const container = currentContainer();
		const name = settingNameFrom( controlEl );
		if ( ! container || ! name ) {
			// eslint-disable-next-line no-console
			console.warn(
				'[wpie] could not resolve the Elementor image control.'
			);
			return;
		}
		const value = container.settings?.get?.( name ) || {};
		const attachmentId = Number( value.id || 0 ) || 0;
		if ( ! attachmentId ) {
			notify(
				CFG.needsLibraryImage || 'Pick a media-library image first.'
			);
			return;
		}
		openEmbedEditor( {
			editorBase: CFG.editorBase,
			attachmentId,
			host: 'elementor',
			strings: CFG,
			onApplied: ( r ) => {
				try {
					window.$e.run( 'document/elements/settings', {
						container,
						settings: {
							[ name ]: { id: r.attachmentId, url: r.url },
						},
						options: { external: true },
					} );
				} catch ( e ) {
					// eslint-disable-next-line no-console
					console.warn(
						'[wpie] writing the image back into Elementor failed:',
						e
					);
				}
			},
		} );
	}

	function injectButton( controlEl ) {
		if ( ! controlEl || controlEl.querySelector( '.' + BTN_CLASS ) ) {
			return;
		}
		const holder =
			controlEl.querySelector( '.elementor-control-content' ) ||
			controlEl;
		const btn = document.createElement( 'button' );
		btn.type = 'button';
		btn.className = BTN_CLASS + ' elementor-button';
		btn.textContent = CFG.editLabel || 'Edit Image';
		btn.setAttribute(
			'style',
			'display:block;width:100%;margin-top:8px;cursor:pointer;'
		);
		btn.addEventListener( 'click', ( ev ) => {
			ev.preventDefault();
			openEditor( controlEl );
		} );
		holder.appendChild( btn );
	}

	function scan( root ) {
		( root || document )
			.querySelectorAll?.( '.elementor-control-type-media' )
			?.forEach( injectButton );
	}

	function start() {
		if ( ! CFG.editorBase ) {
			return;
		}
		const observer = new window.MutationObserver( ( mutations ) => {
			for ( const mut of mutations ) {
				mut.addedNodes.forEach( ( node ) => {
					if ( 1 !== node.nodeType ) {
						return;
					}
					if (
						node.classList?.contains?.(
							'elementor-control-type-media'
						)
					) {
						injectButton( node );
					} else {
						scan( node );
					}
				} );
			}
		} );
		observer.observe( document.body, { childList: true, subtree: true } );
		scan( document );
	}

	if ( window.elementor?.on ) {
		window.elementor.on( 'panel:init', start );
	}
	window.addEventListener( 'elementor/init', start );
	if ( 'complete' === document.readyState ) {
		start();
	} else {
		window.addEventListener( 'load', start );
	}
} )();
