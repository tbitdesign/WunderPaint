/**
 * Shared host-side "edit in place" overlay (v1.180.4).
 *
 * Builder-agnostic: Elementor, the Gutenberg image block (and Bricks/Divi next)
 * all open the editor through this one full-viewport iframe overlay and receive
 * the result over postMessage. Each host only supplies where to read the image
 * from and how to write the result back; everything visual + the protocol lives
 * here. The editor (child) side of the protocol is src/lib/embed-host.js.
 *
 * Same-origin only (host and editor are the same wp-admin origin): the exact
 * `window.location.origin` is required on incoming messages and the opaque
 * per-open token must match, so a stale or foreign message is ignored.
 */

const SOURCE = 'wpie';

let overlay = null;
let shell = null;
let frame = null;
let spinner = null;
// The live session while the overlay is open: the token we expect echoed back
// and the callback that writes the result into the host.
let session = null;
let counter = 0;

// The token-less pick URL currently loaded in the frame ('' = none). A
// warm pick iframe is kept alive between opens (v1.245.1): reopening the
// picker for the same scope skips the whole editor reload.
let pickBase = '';

function hideOverlay( keepFrame ) {
	if ( ! overlay ) {
		return;
	}
	overlay.style.display = 'none';
	if ( ! keepFrame ) {
		frame.src = 'about:blank';
		pickBase = '';
	}
}

function cancel() {
	const keep = 'pick' === session?.kind;
	session = null;
	hideOverlay( keep );
}

function ensureOverlay() {
	if ( overlay ) {
		return;
	}
	overlay = document.createElement( 'div' );
	overlay.className = 'wpie-embed-overlay';
	// Above the wp.media modal (~160000) so the "edit in place" flow works when
	// opened from any builder's media picker, not just from a panel control.
	overlay.setAttribute(
		'style',
		'position:fixed;inset:0;z-index:200000;background:rgba(13,15,20,.6);' +
			'display:none;align-items:center;justify-content:center;'
	);

	shell = document.createElement( 'div' );
	// Edge-to-edge: the editor fills the whole viewport (a real full-screen
	// feel) while staying the seamless in-place iframe.
	shell.setAttribute(
		'style',
		'position:relative;width:100vw;height:100vh;background:#0d0f14;overflow:hidden;'
	);

	spinner = document.createElement( 'div' );
	spinner.className = 'wpie-embed-loading';
	spinner.setAttribute(
		'style',
		'position:absolute;inset:0;display:flex;align-items:center;' +
			'justify-content:center;color:#e6e8ee;font:14px system-ui,sans-serif;'
	);

	frame = document.createElement( 'iframe' );
	frame.setAttribute(
		'style',
		'position:relative;width:100%;height:100%;border:0;background:#0d0f14;'
	);

	// No floating close button: it would sit over the editor's own Apply
	// button. The editor shows a Close next to Apply in embed mode (see
	// editor-titlebar); Esc here is the fallback.
	shell.appendChild( spinner );
	shell.appendChild( frame );
	overlay.appendChild( shell );
	document.body.appendChild( overlay );

	document.addEventListener( 'keydown', ( e ) => {
		if ( 'Escape' === e.key && session ) {
			cancel();
		}
	} );

	window.addEventListener( 'message', ( e ) => {
		if ( e.origin !== window.location.origin ) {
			return;
		}
		const m = e.data;
		if (
			! m ||
			SOURCE !== m.source ||
			! session ||
			m.token !== session.token
		) {
			return;
		}
		if ( 'ready' === m.type ) {
			spinner.style.display = 'none';
			// Pick iframes stay hidden until the child paints its
			// transparent page, so the admin default never flashes.
			frame.style.visibility = 'visible';
		} else if ( 'applied' === m.type ) {
			const cb = session.onApplied;
			session = null;
			hideOverlay();
			if ( cb ) {
				cb( {
					attachmentId: Number( m.attachmentId || 0 ) || 0,
					url: String( m.url || '' ),
					width: Number( m.width || 0 ) || 0,
					height: Number( m.height || 0 ) || 0,
					alt: String( m.alt || '' ),
				} );
			}
		} else if ( 'picked' === m.type ) {
			const cb = session.onPicked;
			session = null;
			hideOverlay( true );
			if ( cb ) {
				cb(
					( Array.isArray( m.ids ) ? m.ids : [] )
						.map( Number )
						.filter( ( id ) => id > 0 )
				);
			}
		} else if ( 'cancelled' === m.type ) {
			cancel();
		}
	} );
}

/**
 * Open the editor on an attachment in the overlay and hand the result back.
 *
 * @param {Object}   opts              Options.
 * @param {string}   opts.editorBase   Editor page URL (no &new=1); we append &attachment etc.
 * @param {number}   opts.attachmentId Attachment to open.
 * @param {string}   opts.host         Host key echoed to the editor (elementor|gutenberg|…).
 * @param {Object}   [opts.strings]    { loading, close, title } for the overlay chrome.
 * @param {Function} opts.onApplied    Called with {attachmentId,url,width,height,alt} on apply.
 */
export function openEmbedEditor( {
	editorBase,
	attachmentId,
	host,
	strings = {},
	onApplied,
} ) {
	if ( ! editorBase || ! attachmentId ) {
		return;
	}
	ensureOverlay();

	// Edit sessions are the full dark editor stage.
	overlay.style.background = 'rgba(13,15,20,.6)';
	shell.style.background = '#0d0f14';
	frame.style.background = '#0d0f14';
	frame.style.visibility = 'visible';
	setSpinner( strings.loading || 'Loading editor…' );
	frame.setAttribute( 'title', strings.title || 'WunderPaint' );

	// A fresh token per open so a stale message from a previous session cannot
	// land in this one. Not a security value (the same-origin check is).
	counter += 1;
	const token =
		host +
		'-' +
		String( attachmentId ) +
		'-' +
		String( counter ) +
		String( ( window.performance?.now?.() || 0 ) | 0 );
	session = { token, onApplied };

	pickBase = '';
	frame.src =
		editorBase +
		'&attachment=' +
		encodeURIComponent( attachmentId ) +
		'&wpie_embed=1&wpie_host=' +
		encodeURIComponent( host ) +
		'&wpie_token=' +
		encodeURIComponent( token );
	overlay.style.display = 'flex';
}

/**
 * Open the Media Library Manager in the overlay as a PICKER (v1.242): the
 * editor boots straight into pick mode and posts the chosen attachment
 * ids back; the host feeds them into its own wp.media selection.
 *
 * @param {Object}   opts            Options.
 * @param {string}   opts.editorBase Editor page URL (no &new=1).
 * @param {boolean}  opts.multiple   Allow more than one image.
 * @param {string}   [opts.types]    'image' (default) or 'all' when the
 *                                   host modal accepts every file type.
 * @param {Object}   [opts.strings]  { loading, title } for the chrome.
 * @param {Function} opts.onPicked   Called with number[] attachment ids.
 */
export function openPickOverlay( {
	editorBase,
	multiple,
	types,
	strings = {},
	onPicked,
} ) {
	if ( ! editorBase ) {
		return;
	}
	ensureOverlay();

	// The picker reads like a native modal (v1.245.2): the iframe page is
	// transparent, the manager's own backdrop provides the only dim, and
	// the frame stays hidden until the child says 'ready' so the admin
	// default background never flashes.
	overlay.style.background = 'transparent';
	shell.style.background = 'transparent';
	frame.style.background = 'transparent';
	setSpinner( strings.loading || 'Loading editor…' );
	frame.setAttribute( 'title', strings.title || 'WunderPaint' );

	counter += 1;
	const token =
		'pick-' +
		String( counter ) +
		String( ( window.performance?.now?.() || 0 ) | 0 );
	session = { token, onPicked, kind: 'pick' };

	const base =
		editorBase +
		'&new=1&wpie_pick=' +
		( multiple ? 'multiple' : 'single' ) +
		( types && 'image' !== types
			? '&wpie_pick_types=' + encodeURIComponent( types )
			: '' );
	if ( base === pickBase && frame.contentWindow ) {
		// Warm iframe from a previous pick of the same scope: skip the
		// reload, just hand the fresh token over and reopen the dialog.
		spinner.style.display = 'none';
		frame.style.visibility = 'visible';
		overlay.style.display = 'flex';
		frame.contentWindow.postMessage(
			{ source: 'wpie-host', type: 'pick-open', token },
			window.location.origin
		);
		return;
	}
	pickBase = base;
	frame.style.visibility = 'hidden';
	frame.src = base + '&wpie_token=' + encodeURIComponent( token );
	overlay.style.display = 'flex';
}

/** Loading pill: readable over a bright host page and the dark stage. */
function setSpinner( text ) {
	spinner.innerHTML = '';
	const pill = document.createElement( 'span' );
	pill.setAttribute(
		'style',
		'background:rgba(13,15,20,.8);color:#e6e8ee;padding:10px 18px;' +
			'border-radius:8px;font:13px system-ui,sans-serif;'
	);
	pill.textContent = text;
	spinner.appendChild( pill );
	spinner.style.display = 'flex';
}
