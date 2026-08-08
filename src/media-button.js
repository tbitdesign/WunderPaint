/**
 * Media-library entry points (vanilla JS + wp.media events).
 *
 * - "New Image" button next to "Add New Media File" on upload.php.
 * - Upgrades the WPIE "Edit Image" button (server-rendered in the attachment
 *   details) so that, when clicked inside a wp.media modal, it opens the shared
 *   overlay (edit in place) and, on apply, selects the edited copy in the frame
 *   so whatever opened the picker (classic editor, or a wp.media builder like
 *   Bricks/Divi/Beaver) receives it. Outside a modal (the attachment edit
 *   screen) the button keeps navigating to the full editor.
 * - Hover "Edit" badge on grid tiles (best-effort nicety).
 */

/* global WPIEMedia */

import { openEmbedEditor, openPickOverlay } from './lib/embed-overlay';

( () => {
	if ( typeof WPIEMedia === 'undefined' ) {
		return;
	}

	const accent = '#3b66ff';

	const idFromHref = ( href ) => {
		const m = /[?&]attachment=(\d+)/.exec( href || '' );
		return m ? Number( m[ 1 ] ) : 0;
	};

	// The image attachment id selected in the active media frame, or 0.
	const selectedImageId = () => {
		const state = window.wp?.media?.frame?.state && wp.media.frame.state();
		const model = state?.get?.( 'selection' )?.first?.();
		if ( model && 'image' === model.get?.( 'type' ) ) {
			return Number( model.get( 'id' ) ) || 0;
		}
		return 0;
	};

	// After applying an edit, make the edited copy the frame's selection so the
	// host (classic editor / builder) inserts it on its own Select/Insert click.
	const selectInFrame = ( id ) => {
		const frame = window.wp?.media?.frame;
		if ( ! id || ! frame?.state || ! wp.media.attachment ) {
			return;
		}
		const attachment = wp.media.attachment( id );
		const done = () => {
			const state = frame.state?.();
			if ( ! state?.get ) {
				return;
			}
			const library = state.get( 'library' );
			if ( library?.add && library.get && ! library.get( id ) ) {
				try {
					library.add( attachment, { at: 0 } );
				} catch ( e ) {
					// non-fatal
				}
			}
			state.get( 'selection' )?.reset?.( [ attachment ] );
		};
		const p = attachment.fetch?.();
		if ( p?.then ) {
			p.then( done, done );
		} else {
			done();
		}
	};

	// Upgrade the WPIE "Edit Image" button to open in place whenever it is
	// clicked inside a wp.media modal; on the attachment edit screen (no media
	// frame) it falls through to its normal navigation.
	document.addEventListener( 'click', ( e ) => {
		const btn = e.target?.closest?.( '.wpie-edit-button' );
		if ( ! btn || ! window.wp?.media?.frame?.state ) {
			return;
		}
		const id =
			idFromHref( btn.getAttribute( 'href' ) ) || selectedImageId();
		if ( ! id ) {
			return;
		}
		e.preventDefault();
		openEmbedEditor( {
			editorBase: WPIEMedia.editorBase,
			attachmentId: id,
			// Two media contexts (v1.236): on the library grid (upload.php)
			// the user MANAGES the attachment itself, so the editor offers
			// the normal overwrite save; inside a post editor's media modal
			// the edit is part of an insert flow, where Apply saves a copy
			// and selects it (shared originals stay untouched).
			host: 'upload' === window.pagenow ? 'media-library' : 'media',
			strings: {
				loading: WPIEMedia.loading,
				close: WPIEMedia.close,
				title: WPIEMedia.title,
			},
			onApplied: ( r ) => selectInFrame( r.attachmentId ),
		} );
	} );

	// The media grid binds its uploader toggle to every .page-title-action
	// (preventDefault + inline upload panel), which would hijack our create
	// link. A capture-phase guard keeps the click ours so the browser
	// navigates to the editor's Create dialog.
	document.addEventListener(
		'click',
		( e ) => {
			if ( e.target?.closest?.( '.wpie-create-button' ) ) {
				e.stopPropagation();
			}
		},
		true
	);

	/* --- upload.php H1 toolbar button --- */
	const addCreateButton = () => {
		const h1 = document.querySelector( 'body.upload-php .wrap h1' );
		if ( ! h1 || document.querySelector( '.wpie-create-button' ) ) {
			return;
		}
		const anchor = document.createElement( 'a' );
		anchor.href = WPIEMedia.createNew;
		anchor.className = 'wpie-create-button page-title-action';
		anchor.textContent = WPIEMedia.createLbl;
		anchor.style.cssText = `background:${ accent };color:#fff;border-color:transparent;`;
		const addNew = h1.parentElement.querySelector( '.page-title-action' );
		if ( addNew && addNew.parentElement ) {
			addNew.insertAdjacentElement( 'afterend', anchor );
		} else {
			h1.insertAdjacentElement( 'afterend', anchor );
		}
	};

	if ( 'loading' === document.readyState ) {
		document.addEventListener( 'DOMContentLoaded', addCreateButton );
	} else {
		addCreateButton();
	}

	/* --- wp.media picker takeover (v1.242) ---------------------------------
	 * With the "Media Library Manager as image picker" setting on, every
	 * wp.media modal (classic editor, Gutenberg, Elementor, WooCommerce,
	 * any builder) gets a "Media Library Manager" button in its toolbar.
	 * It opens the manager as an overlay ABOVE the modal; the picked
	 * attachments are fed back into the modal's own selection and the
	 * primary button is clicked programmatically, so the host receives a
	 * perfectly normal wp.media result. Purely additive: wp.media itself
	 * is never replaced.
	 */
	let takeoverInstalled = false;
	const bootPickerTakeover = () => {
		const Modal = window.wp?.media?.view?.Modal;
		if ( takeoverInstalled || ! WPIEMedia.pickerManager || ! Modal ) {
			return;
		}
		takeoverInstalled = true;

		// Hand the manager's picks to the modal: real attachment models,
		// fetched first (hosts read their attributes on select), then the
		// primary button is clicked exactly like a user would.
		const transferSelection = ( frame, modalEl, ids ) => {
			const state = frame?.state?.();
			const selection = state?.get?.( 'selection' );
			if ( ! selection || ! ids.length || ! wp.media.attachment ) {
				return;
			}
			const wanted = selection.multiple ? ids : ids.slice( 0, 1 );
			const models = wanted.map( ( id ) => wp.media.attachment( id ) );
			const fetches = models.map( ( att ) => {
				const p = att.fetch?.();
				return p?.then
					? Promise.resolve( p ).catch( () => null )
					: Promise.resolve();
			} );
			Promise.all( fetches ).then( () => {
				const library = state.get?.( 'library' );
				models.forEach( ( att ) => {
					try {
						if (
							library?.add &&
							library.get &&
							! library.get( att.id )
						) {
							library.add( att, { at: 0 } );
						}
					} catch ( err ) {
						// non-fatal
					}
				} );
				selection.reset( models );
				// Give the toolbar a beat to enable its primary button; if a
				// host keeps it disabled, the modal simply stays open with
				// the selection applied and the user clicks it themselves.
				window.setTimeout( () => {
					// NEVER match our own injected button (it lives in the
					// same toolbar): that clicked the manager open again in
					// an endless loop (v1.242.2).
					const primary = modalEl.querySelector(
						'.media-toolbar-primary .media-button:not([disabled]):not(.wpie-manager-pick)'
					);
					if ( primary ) {
						primary.click();
					}
				}, 60 );
			} );
		};

		const injectButton = ( modal ) => {
			const modalEl = modal?.el;
			const frame = modal?.controller;
			if ( ! modalEl || ! frame?.state ) {
				return;
			}
			const toolbar = modalEl.querySelector(
				'.media-frame-toolbar .media-toolbar-primary'
			);
			if (
				! toolbar ||
				toolbar.querySelector( '.wpie-manager-pick' ) ||
				! frame.state()?.get?.( 'selection' )
			) {
				return;
			}
			const btn = document.createElement( 'button' );
			btn.type = 'button';
			btn.className = 'button media-button wpie-manager-pick';
			btn.textContent = WPIEMedia.managerLbl;
			btn.style.cssText = `margin-right:8px;border-color:${ accent };color:${ accent };`;
			btn.addEventListener( 'click', ( e ) => {
				e.preventDefault();
				const state = frame.state();
				const selection = state?.get?.( 'selection' );
				// A type-restricted host (image/video/audio blocks) keeps
				// the manager on that type; an unrestricted "Add Media"
				// opens the full library (v1.243/1.245).
				const libType = state
					?.get?.( 'library' )
					?.props?.get?.( 'type' );
				const single =
					Array.isArray( libType ) && 1 === libType.length
						? libType[ 0 ]
						: libType;
				const types = [ 'image', 'video', 'audio' ].includes( single )
					? single
					: 'all';
				openPickOverlay( {
					editorBase: WPIEMedia.editorBase,
					multiple: !! selection?.multiple,
					types,
					strings: {
						loading: WPIEMedia.managerLoading || WPIEMedia.loading,
						title: WPIEMedia.title,
					},
					onPicked: ( ids ) =>
						transferSelection( frame, modalEl, ids ),
				} );
			} );
			toolbar.insertBefore( btn, toolbar.firstChild );
		};

		// Media toolbars re-render on every state/selection change, which
		// throws injected children away; a scoped observer puts the button
		// back (the injectButton no-op guard keeps this cheap).
		const watched = new WeakSet();
		const watchModal = ( modal ) => {
			injectButton( modal );
			if ( ! modal?.el || watched.has( modal.el ) ) {
				return;
			}
			watched.add( modal.el );
			new MutationObserver( () => injectButton( modal ) ).observe(
				modal.el,
				{ childList: true, subtree: true }
			);
		};

		const origOpen = Modal.prototype.open;
		Modal.prototype.open = function () {
			const result = origOpen.apply( this, arguments );
			try {
				watchModal( this );
			} catch ( err ) {
				// never break the host's modal
			}
			return result;
		};
	};

	/* --- Image Details, the classic editor's way in (v1.388.0) -------------
	 * Clicking an image that already sits in a classic-editor post opens
	 * wp.media's ImageDetails frame, and that frame is the one place our
	 * button could never reach: it is rendered from tmpl-image-details, which
	 * carries no <div class="attachment-compat"> at all, so the field added
	 * through attachment_fields_to_edit is never printed there. WordPress
	 * offers exactly two actions in it, "Edit Original" (its own image editor)
	 * and "Replace". This adds a third next to them.
	 *
	 * Everything after the edit follows core's own Replace button verbatim
	 * (media-views.js, the replace toolbar): close the frame, hand the new
	 * attachment to the PostImage model, trigger 'replace' so the editor swaps
	 * the <img> in the content. Doing it any other way left the dialog showing
	 * the old picture while the model already held the new one.
	 *
	 * The label is the same "Edit Image" the attachment sidebar uses, so the
	 * same action is called the same thing wherever somebody meets it.
	 */
	const detailsFrame = () => {
		const frame = window.wp?.media?.frame;
		return frame?.image && frame?.state?.() ? frame : null;
	};

	const editFromImageDetails = () => {
		const frame = detailsFrame();
		const id = Number( frame?.image?.attachment?.id ) || 0;
		if ( ! id ) {
			return;
		}
		openEmbedEditor( {
			editorBase: WPIEMedia.editorBase,
			attachmentId: id,
			// An insert flow, not library management: Apply saves a copy and
			// the original the post shares with other posts stays untouched.
			host: 'media',
			strings: {
				loading: WPIEMedia.loading,
				close: WPIEMedia.close,
				title: WPIEMedia.title,
			},
			onApplied: ( r ) => {
				const newId = Number( r?.attachmentId ) || 0;
				const live = detailsFrame();
				if ( ! newId || ! live || ! wp.media.attachment ) {
					return;
				}
				const attachment = wp.media.attachment( newId );
				// Exactly what pressing Update does (media-views.js, the
				// image-details toolbar): swap the attachment on the model,
				// close, then fire 'update' with the model's JSON.
				//
				// 'update' and not 'replace', and that distinction cost a
				// round: the classic editor binds BOTH, but to different
				// states - `frame.state('image-details').on('update')` and
				// `frame.state('replace-image').on('replace')`. Firing
				// 'replace' on the image-details state, as the first version
				// did, reaches nobody: the copy was saved and the picture in
				// the post never changed.
				const swap = () => {
					const state = live.state?.();
					// changeAttachment() calls props.get('size') on this, so it
					// has to be a Backbone model. Core passes state.display(),
					// but that lives on the Library controller and the
					// image-details state is NOT a Library - it extends State.
					// The earlier fallback of {} therefore threw inside the
					// promise chain, silently, and no swap ever happened.
					// Overwrite still looked right because the url stays the
					// same and only the file behind it changes.
					//
					// The settings come from the image as it sits in the post,
					// so replacing it keeps its size, alignment and link.
					const props = window.Backbone
						? new window.Backbone.Model( {
								size: live.image.get( 'size' ) || 'full',
								align: live.image.get( 'align' ) || 'none',
								link: live.image.get( 'link' ) || 'none',
						  } )
						: null;
					if ( ! props ) {
						return;
					}
					live.image.changeAttachment( attachment, props );
					live.close?.();
					state?.trigger?.( 'update', live.image.toJSON() );
					live.setState?.( live.options?.state );
					live.reset?.();
				};
				const p = attachment.fetch?.();
				if ( p?.then ) {
					p.then( swap, swap );
				} else {
					swap();
				}
			},
		} );
	};

	// The frame is built and torn down by wp.media, so the button is injected
	// whenever its action row shows up. If core ever renames that row the
	// button simply stops appearing - it can never break the two beside it.
	//
	// The selector deserves a note, because the obvious one is wrong: core does
	// modal.$el.addClass('image-details'), and modal.$el is a BARE <div> with no
	// class of its own - `.media-modal` only appears inside its template. So the
	// marker sits on an ANCESTOR of the modal, and '.media-modal.image-details'
	// matches nothing at all. Scoped to .column-image so it cannot reach an
	// .actions row elsewhere on the screen.
	//
	// The early return is not premature tuning: this runs on EVERY mutation of
	// a wp-admin screen, and TinyMCE, autosave and the media grid mutate
	// constantly. Without it every keystroke in the editor would cost a
	// document-wide querySelectorAll. wp.media inserts the modal as one chunk,
	// so looking only at added elements finds it just as reliably.
	const addDetailsButton = ( records ) => {
		if (
			records &&
			! records.some( ( rec ) =>
				[ ...rec.addedNodes ].some(
					( n ) =>
						1 === n.nodeType &&
						( n.matches?.( '.media-modal, .actions' ) ||
							n.querySelector?.( '.media-modal, .actions' ) )
				)
			)
		) {
			return;
		}
		document
			.querySelectorAll( '.image-details .column-image .actions' )
			.forEach( ( row ) => {
				if ( row.querySelector( '.wpie-details-edit' ) ) {
					return;
				}
				const btn = document.createElement( 'button' );
				btn.type = 'button';
				btn.className = 'button wpie-details-edit';
				btn.textContent = WPIEMedia.label;
				btn.style.cssText =
					'margin-left:6px;background:' +
					accent +
					';border-color:' +
					accent +
					';color:#fff;';
				btn.addEventListener( 'click', ( e ) => {
					e.preventDefault();
					editFromImageDetails();
				} );
				row.appendChild( btn );
			} );
	};

	// This is DOM-level integration because WordPress offers no filter for that
	// dialog, so it rests on markup core could rename. It fails safe - nothing
	// of core's is replaced, the button just would not appear - but silently,
	// and a feature that quietly stops existing is the worst kind. So: if the
	// dialog is on screen and our button is not, say it once. Same idea as the
	// trim warning in the standalone studio.
	let warned = false;
	const warnIfMissing = () => {
		if (
			warned ||
			! document.querySelector( '.image-details' ) ||
			document.querySelector( '.wpie-details-edit' )
		) {
			return;
		}
		warned = true;
		// eslint-disable-next-line no-console
		console.warn(
			'WunderPaint: the Image Details dialog no longer has the action row this button attaches to - WordPress probably changed its markup. See src/media-button.js'
		);
	};

	new window.MutationObserver( ( records ) => {
		addDetailsButton( records );
		window.setTimeout( warnIfMissing, 500 );
	} ).observe( document.body, {
		childList: true,
		subtree: true,
	} );
	addDetailsButton();

	// wp.media can arrive after us (builders lazy-load the media stack),
	// so retry briefly until wp.media.view exists; the installed flag
	// makes every extra call a no-op.
	bootPickerTakeover();
	document.addEventListener( 'DOMContentLoaded', bootPickerTakeover );
	window.addEventListener( 'load', bootPickerTakeover );
	if ( WPIEMedia.pickerManager ) {
		let tries = 0;
		const timer = window.setInterval( () => {
			tries += 1;
			bootPickerTakeover();
			if ( takeoverInstalled || tries > 40 ) {
				window.clearInterval( timer );
			}
		}, 500 );
	}
} )();
