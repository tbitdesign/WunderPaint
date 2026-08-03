/**
 * WunderPaint settings screen.
 *
 * Was a 300-line inline <script> in class-settings.php until v1.346.0, where
 * no linter could see it and it was re-parsed on every page view instead of
 * being cached. Everything it needs from PHP arrives in one localized object.
 *
 * The strings come translated from the server rather than through
 * wp_set_script_translations: a new script handle would mean a new md5 JED
 * file per locale for nine strings that PHP already has. The msgids are
 * unchanged, so nothing moves for translators.
 */

// window.WPIE_SETTINGS is filled by wp_localize_script; read defensively so a
// stale cache of this file cannot take the whole screen down.
( function () {
	const S = window.WPIE_SETTINGS || { i18n: {} };
	const tabs = document.querySelectorAll( '[data-wpie-tab]' );
	tabs.forEach( function ( tab ) {
		tab.addEventListener( 'click', function ( e ) {
			e.preventDefault();
			tabs.forEach( function ( t ) {
				t.classList.remove( 'nav-tab-active' );
			} );
			tab.classList.add( 'nav-tab-active' );
			document
				.querySelectorAll( '.wpie-tab-panel' )
				.forEach( function ( p ) {
					p.hidden = true;
				} );
			const panel = document.getElementById(
				'wpie-tab-' + tab.dataset.wpieTab
			);
			if ( panel ) {
				panel.hidden = false;
			}
			const submit = document.querySelector( 'form p.submit' );
			// The Save Changes button belongs to the core options.php
			// form; show it only while a tab whose panel lives inside
			// that form is active. Backup, About and add-on tabs render
			// their panels (and any own forms) outside it. Use
			// getAttribute so a hidden input named "action" cannot
			// shadow the form's action URL.
			const coreForm = panel && panel.closest( 'form' );
			const inCoreForm =
				!! coreForm &&
				-1 !==
					( coreForm.getAttribute( 'action' ) || '' ).indexOf(
						'options.php'
					);
			if ( submit ) {
				submit.style.display = inCoreForm ? '' : 'none';
			}
		} );
	} );
	// Restore the requested tab from the URL hash (#wpie-tab-x) or
	// a ?wpie-tab=x query (used by add-on save redirects).
	const params = new URLSearchParams( window.location.search );
	const wanted =
		0 === window.location.hash.indexOf( '#wpie-tab-' )
			? window.location.hash.slice( 10 )
			: params.get( 'wpie-tab' ) || '';
	if ( /^[a-z0-9_-]+$/i.test( wanted ) ) {
		const wantedTab = document.querySelector(
			'[data-wpie-tab="' + wanted + '"]'
		);
		if ( wantedTab ) {
			wantedTab.click();
		}
	}
	document.querySelectorAll( '.wpie-key-toggle' ).forEach( function ( btn ) {
		btn.addEventListener( 'click', function () {
			const input = btn.previousElementSibling;
			input.type = input.type === 'password' ? 'text' : 'password';
		} );
	} );
	// Remove key (v1.288.1): arms a hidden flag; Save Changes then
	// really deletes the stored key. Second click undoes.
	document.querySelectorAll( '.wpie-key-remove' ).forEach( function ( btn ) {
		const row = btn.closest( '.wpie-keyrow' );
		const input = row.querySelector( '.wpie-key-input' );
		const flag = row.parentElement.querySelector( '.wpie-key-remove-flag' );
		const label = btn.textContent;
		const undo = S.i18n.undo;
		btn.addEventListener( 'click', function () {
			const armed = flag.value === '1';
			flag.value = armed ? '' : '1';
			input.disabled = ! armed;
			if ( ! armed ) {
				input.value = '';
			}
			btn.textContent = armed ? label : undo;
			btn.classList.toggle( 'is-armed', ! armed );
		} );
	} );
	document
		.querySelectorAll( '.wpie-test-connection' )
		.forEach( function ( btn ) {
			btn.addEventListener( 'click', function () {
				const result =
					btn.parentElement.querySelector( '.wpie-test-result' );
				result.textContent = '…';
				result.className = 'wpie-test-result';
				window
					.fetch( S.aiTestUrl, {
						method: 'POST',
						credentials: 'same-origin',
						headers: {
							'Content-Type': 'application/json',
							'X-WP-Nonce': S.nonce,
						},
						body: JSON.stringify( {
							provider: btn.dataset.provider,
						} ),
					} )
					.then( function ( r ) {
						return r.json();
					} )
					.then( function ( data ) {
						const ok = data && data.ok;
						result.textContent = ok
							? 'OK'
							: ( data &&
									( data.message ||
										( data.data &&
											data.data.message ) ) ) ||
							  'fail';
						result.className =
							'wpie-test-result ' + ( ok ? 'ok' : 'fail' );
					} )
					.catch( function () {
						result.textContent = 'fail';
						result.className = 'wpie-test-result fail';
					} );
			} );
		} );
	// Stock providers: same flow against /stock/test. A saved key is
	// required first - the endpoint searches with the STORED key.
	document.querySelectorAll( '.wpie-test-stock' ).forEach( function ( btn ) {
		btn.addEventListener( 'click', function () {
			const result =
				btn.parentElement.querySelector( '.wpie-test-result' );
			result.textContent = '…';
			result.className = 'wpie-test-result';
			window
				.fetch( S.stockTestUrl, {
					method: 'POST',
					credentials: 'same-origin',
					headers: {
						'Content-Type': 'application/json',
						'X-WP-Nonce': S.nonce,
					},
					body: JSON.stringify( { provider: btn.dataset.provider } ),
				} )
				.then( function ( r ) {
					return r.json();
				} )
				.then( function ( data ) {
					const ok = data && data.ok;
					result.textContent = ok
						? 'OK'
						: ( data &&
								( data.message ||
									( data.data && data.data.message ) ) ) ||
						  'fail';
					result.className =
						'wpie-test-result ' + ( ok ? 'ok' : 'fail' );
				} )
				.catch( function () {
					result.textContent = 'fail';
					result.className = 'wpie-test-result fail';
				} );
		} );
	} );
	// Meshy: /meshy/test reads the credit balance with the saved key.
	document.querySelectorAll( '.wpie-test-meshy' ).forEach( function ( btn ) {
		btn.addEventListener( 'click', function () {
			const result =
				btn.parentElement.querySelector( '.wpie-test-result' );
			result.textContent = '…';
			result.className = 'wpie-test-result';
			window
				.fetch( S.meshyTestUrl, {
					method: 'POST',
					credentials: 'same-origin',
					headers: {
						'Content-Type': 'application/json',
						'X-WP-Nonce': S.nonce,
					},
					body: '{}',
				} )
				.then( function ( r ) {
					return r.json();
				} )
				.then( function ( data ) {
					const ok = data && data.ok;
					result.textContent = ok
						? 'OK' +
						  ( null === data.credits
								? ''
								: ' · ' + data.credits + ' credits' )
						: ( data &&
								( data.message ||
									( data.data && data.data.message ) ) ) ||
						  'fail';
					result.className =
						'wpie-test-result ' + ( ok ? 'ok' : 'fail' );
				} )
				.catch( function () {
					result.textContent = 'fail';
					result.className = 'wpie-test-result fail';
				} );
		} );
	} );

	// Backup restore: PHP silently drops uploads above its limit,
	// admin-post then never even sees the request (v1.140.1).
	( function () {
		const form = document.getElementById( 'wpie-backup-restore' );
		if ( ! form ) {
			return;
		}
		const note = document.getElementById( 'wpie-backup-size-note' );
		const max = S.maxUpload;
		const msg = S.i18n.tooBig;
		form.addEventListener( 'submit', function ( e ) {
			let file = form.querySelector( 'input[name="backup"]' );
			file = file && file.files && file.files[ 0 ];
			if ( file && max && file.size > max ) {
				e.preventDefault();
				note.textContent = msg
					.replace( '%1$s', ( file.size / 1048576 ).toFixed( 1 ) )
					.replace( '%2$s', Math.round( max / 1048576 ) );
			}
		} );
	} )();

	// Custom font upload/delete (v1.136.0).
	( function () {
		const uploadBtn = document.getElementById( 'wpie-font-upload' );
		if ( ! uploadBtn ) {
			return;
		}
		const fontsUrl = S.fontsUrl;
		const restNonce = S.nonce;
		const fileInput = document.getElementById( 'wpie-font-file' );
		const familyInp = document.getElementById( 'wpie-font-family' );
		const statusEl = document.getElementById( 'wpie-font-status' );
		// PHP drops oversized uploads BEFORE our handler runs, so
		// the size must be checked here (v1.140.1). 8 MB is the
		// font endpoint's own cap.
		const maxUpload = Math.min( S.maxUpload || Infinity, 8 * 1048576 );
		const sizeMsg = S.i18n.tooBig;

		uploadBtn.addEventListener( 'click', function () {
			const file = fileInput.files && fileInput.files[ 0 ];
			if ( ! file ) {
				statusEl.textContent = S.i18n.chooseFile;
				return;
			}
			if ( file.size > maxUpload ) {
				statusEl.textContent = sizeMsg
					.replace( '%1$s', ( file.size / 1048576 ).toFixed( 1 ) )
					.replace( '%2$s', Math.round( maxUpload / 1048576 ) );
				return;
			}
			const fd = new FormData();
			fd.append( 'file', file, file.name );
			fd.append( 'family', familyInp.value || '' );
			statusEl.textContent = S.i18n.uploading;
			fetch( fontsUrl, {
				method: 'POST',
				headers: { 'X-WP-Nonce': restNonce },
				body: fd,
			} )
				.then( function ( r ) {
					return r.json().then( function ( d ) {
						return { ok: r.ok, d };
					} );
				} )
				.then( function ( res ) {
					if ( ! res.ok ) {
						statusEl.textContent =
							( res.d && res.d.message ) || 'Error';
						return;
					}
					window.location.reload();
				} )
				.catch( function () {
					statusEl.textContent = 'Error';
				} );
		} );

		document
			.querySelectorAll( '.wpie-font-delete' )
			.forEach( function ( btn ) {
				btn.addEventListener( 'click', function () {
					const row = btn.closest( 'tr' );
					const id = row && row.getAttribute( 'data-font-id' );
					if ( ! id ) {
						return;
					}
					fetch( fontsUrl + '/' + id, {
						method: 'DELETE',
						headers: { 'X-WP-Nonce': restNonce },
					} ).then( function () {
						row.remove();
					} );
				} );
			} );
	} )();

	// Font library download (v1.316): batched, resumable, cancellable.
	( function () {
		const dl = document.getElementById( 'wpie-fonts-lib-download' );
		if ( ! dl ) {
			return;
		}
		const cancelBtn = document.getElementById( 'wpie-fonts-lib-cancel' );
		const removeBtn = document.getElementById( 'wpie-fonts-lib-remove' );
		const countEl = document.getElementById( 'wpie-fonts-lib-count' );
		const statusEl = document.getElementById( 'wpie-fonts-lib-status' );
		const libUrl = S.fontsLibraryUrl;
		const nonce = S.nonce;
		const countMsg = S.i18n.downloaded;
		const workMsg = S.i18n.downloading;
		const doneMsg = S.i18n.done;
		const errMsg = S.i18n.partial;
		let cancelled = false;
		let prevDone = -1;

		function setCount( done, total ) {
			countEl.textContent = countMsg
				.replace( '%1$d', done )
				.replace( '%2$d', total );
			removeBtn.style.display = done > 0 ? '' : 'none';
		}
		function running( on ) {
			dl.disabled = on;
			removeBtn.disabled = on;
			cancelBtn.style.display = on ? '' : 'none';
		}
		function batch() {
			if ( cancelled ) {
				running( false );
				statusEl.textContent = '';
				return;
			}
			fetch( libUrl, {
				method: 'POST',
				headers: { 'X-WP-Nonce': nonce },
			} )
				.then( function ( r ) {
					return r.json();
				} )
				.then( function ( d ) {
					const done = ( d.downloaded || [] ).length;
					setCount( done, d.total || 0 );
					if ( d.done ) {
						running( false );
						statusEl.textContent =
							d.failed && d.failed.length ? errMsg : doneMsg;
						return;
					}
					// No progress this round means the rest keeps failing:
					// stop instead of looping forever.
					if ( done <= prevDone ) {
						running( false );
						statusEl.textContent = errMsg;
						return;
					}
					prevDone = done;
					batch();
				} )
				.catch( function () {
					running( false );
					statusEl.textContent = errMsg;
				} );
		}
		dl.addEventListener( 'click', function () {
			cancelled = false;
			prevDone = -1;
			running( true );
			statusEl.textContent = workMsg;
			batch();
		} );
		cancelBtn.addEventListener( 'click', function () {
			cancelled = true;
			statusEl.textContent = '';
		} );
		removeBtn.addEventListener( 'click', function () {
			removeBtn.disabled = true;
			fetch( libUrl, {
				method: 'DELETE',
				headers: { 'X-WP-Nonce': nonce },
			} )
				.then( function ( r ) {
					return r.json();
				} )
				.then( function ( d ) {
					setCount( 0, d.total || 0 );
					removeBtn.disabled = false;
					statusEl.textContent = '';
				} )
				.catch( function () {
					removeBtn.disabled = false;
				} );
		} );
	} )();
} )();
