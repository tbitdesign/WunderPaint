/**
 * QA stage setup for Handwriting Fonts.
 *
 * The shared mock only knows about generator extensions, and this one
 * registers a menu item, so the registration is captured here and run
 * by hand once the bundle has loaded. A stand-in `wp.apiFetch` is added
 * so the install path can be exercised without a WordPress behind it.
 */
window.__installWpieMock( {
	iconClassPrefix: 'wpiehw',
	autoRun: false,
	patch: ( WPIE, editor ) => {
		WPIE.canManage = true;
		WPIE.customFonts = [];
		WPIE.api.registerMenuItem = ( menuId, item ) => {
			window.__menuId = menuId;
			window.__menuItem = item;
		};
		window.__editorCtx = editor;
		window.__uploads = [];
		window.wp = window.wp || {};
		window.wp.apiFetch = async ( req ) => {
			if ( 'POST' === req.method ) {
				window.__uploads.push( req.body.get( 'family' ) );
				return { fonts: window.__uploads.map( ( f, i ) => ( { id: `f${ i }`, family: f } ) ) };
			}
			return { fonts: [] };
		};
	},
} );

window.addEventListener( 'load', () => {
	window.__menuItem.run( {
		editor: window.__editorCtx,
		extras: { toasts: { success: () => {}, error: () => {} } },
	} );
	setTimeout( () => {
		window.__dialogReady = true;
	}, 500 );
} );
