/**
 * Root app: reads window.WPIE, boots the API client, loads the document
 * (sidecar project → attachment image → blank) and mounts the editor.
 */

import { useMemo, useRef, useState, useEffect } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { initApi, fetchProjectJson } from './lib/api';
import { isEmbedded, postReady, postCancelled } from './lib/embed-host';
import './lib/psd-setup';
import { getPsdImporter } from './lib/psd-registry';
import {
	createBlankDoc,
	createDocFromBootstrap,
	hydrateLayers,
	serializeLayers,
} from './store/document';
import { EditorProvider } from './store/editor-context';
import { renderToCanvas, sharedImageCache } from './lib/raster';
import { autosaveStorage } from './lib/autosave';
import { offerRestore } from './lib/restore-offer';
import { takeIntentionalReload } from './lib/editor-locale';
import { initDebugLog } from './lib/debug-log';
import { ToastProvider, useToasts } from './components/toasts';
import { WpieLogo } from './components/logo';
import { EditorScreen } from './screens/editor-main';

// Small-screen gate (v1.78): phones (and coarse-pointer landscape slivers)
// get a friendly hint instead of a cramped, unusable editor.
const SMALL_QUERY =
	'(max-width: 767px), (pointer: coarse) and (max-height: 480px)';

function useIsSmallScreen() {
	const [ small, setSmall ] = useState(
		() => !! window.matchMedia?.( SMALL_QUERY ).matches
	);
	useEffect( () => {
		const mq = window.matchMedia?.( SMALL_QUERY );
		if ( ! mq?.addEventListener ) {
			return undefined;
		}
		const onChange = () => setSmall( mq.matches );
		mq.addEventListener( 'change', onChange );
		return () => mq.removeEventListener( 'change', onChange );
	}, [] );
	return small;
}

export default function App() {
	const WPIE = window.WPIE || {};
	const [ booted, setBooted ] = useState( null );
	const [ error, setError ] = useState( null );
	const small = useIsSmallScreen();
	const [ forceDesktop, setForceDesktop ] = useState( false );
	const gated = small && ! forceDesktop;

	// Initial theme before anything mounts (avoid flash); the gate screen
	// is themed too, so this runs even while the editor boot is held back.
	useEffect( () => {
		const root = document.getElementById( 'wpie-root' );
		if ( root ) {
			const stored = window.localStorage?.getItem( 'wpie-theme' );
			const theme =
				stored ||
				( 'system' === WPIE.theme
					? window.matchMedia &&
					  window.matchMedia( '(prefers-color-scheme: light)' )
							.matches
						? 'light'
						: 'dark'
					: WPIE.theme || 'dark' );
			root.dataset.theme = theme;
			root.style.setProperty( '--accent', WPIE.accent || '#3b66ff' );
			root.style.setProperty(
				'--accent-soft',
				( WPIE.accent || '#3b66ff' ) + '22'
			);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [] );

	// Edit-in-place: when a host builder opened us in an iframe, announce that
	// we are interactive once booted, and signal a cancel if the session is
	// torn down before the user applies (v1.180.0).
	const readySent = useRef( false );
	useEffect( () => {
		if ( booted && isEmbedded() && ! readySent.current ) {
			readySent.current = true;
			postReady();
		}
	}, [ booted ] );
	useEffect( () => {
		if ( ! isEmbedded() ) {
			return undefined;
		}
		const onUnload = () => postCancelled();
		window.addEventListener( 'pagehide', onUnload );
		return () => window.removeEventListener( 'pagehide', onUnload );
	}, [] );

	useEffect( () => {
		// Gated: skip the whole document boot on phones; it starts as soon
		// as the screen grows past the breakpoint or the user opts in.
		if ( gated || booted ) {
			return;
		}
		initApi( WPIE );
		initDebugLog();

		const loaders = {
			fetchJson: fetchProjectJson,
			hydrateLayers,
			loadPsd: async ( url ) => {
				const importer = getPsdImporter();
				const response = await window.fetch( url, {
					credentials: 'same-origin',
					headers: { 'X-WP-Nonce': WPIE.nonce },
				} );
				if ( ! response.ok || ! importer ) {
					throw new Error( 'psd sidecar unavailable' );
				}
				const { doc, layers } = await importer(
					await response.arrayBuffer(),
					WPIE.doc?.name || 'psd'
				);
				doc.source = {
					...doc.source,
					attachmentId: WPIE.attachmentId,
					isNew: false,
				};
				return { doc, layers };
			},
		};

		createDocFromBootstrap( WPIE, loaders )
			.then( ( result ) => setBooted( result ) )
			.catch( ( e ) => setError( e.message || String( e ) ) );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ gated ] );

	if ( gated ) {
		return (
			<div className="wpie-mobile-gate">
				<WpieLogo height={ 34 } />
				<div className="wpie-mobile-gate-title">
					{ __( 'Built for bigger screens', 'wunderpaint' ) }
				</div>
				<p className="wpie-mobile-gate-text">
					{ __(
						'WunderPaint is a full desktop editing tool and needs more room than this screen offers. Please open it on a desktop or laptop computer.',
						'wunderpaint'
					) }
				</p>
				<div className="wpie-mobile-gate-actions">
					<a className="ai-btn" href={ WPIE.libraryUrl }>
						{ __( 'Back to Media Library', 'wunderpaint' ) }
					</a>
					<button
						className="ai-btn ghost"
						onClick={ () => setForceDesktop( true ) }
					>
						{ __( 'Continue anyway', 'wunderpaint' ) }
					</button>
				</div>
			</div>
		);
	}

	if ( error ) {
		return (
			<div className="wpie-loading" role="alert">
				<div>
					<p>{ __( 'Could not open the editor.', 'wunderpaint' ) }</p>
					<p style={ { fontSize: 11, opacity: 0.7 } }>{ error }</p>
					<p>
						<a href={ WPIE.libraryUrl }>
							{ __( 'Back to Media Library', 'wunderpaint' ) }
						</a>
					</p>
				</div>
			</div>
		);
	}

	if ( ! booted ) {
		return (
			<div className="wpie-loading">
				<div
					style={ { display: 'flex', alignItems: 'center', gap: 10 } }
				>
					<span className="spin" />
					{ __( 'Loading WunderPaint…', 'wunderpaint' ) }
				</div>
			</div>
		);
	}

	return (
		<ToastProvider>
			<TabbedEditor booted={ booted } WPIE={ WPIE } />
		</ToastProvider>
	);
}

/**
 * Document tabs (v1.107.0): each tab is a full editor session. The active
 * tab lives in the mounted EditorProvider; inactive tabs are parked as
 * serialized snapshots (same format as autosave/.wpie) and re-hydrated on
 * switch. `key={active}` remounts the whole screen per tab, so nothing
 * leaks between documents.
 */
function TabbedEditor( { booted, WPIE } ) {
	const counter = useRef( 1 );
	const [ tabs, setTabs ] = useState( () => [
		{
			id: 'tab1',
			name: booted.doc.name || __( 'untitled', 'wunderpaint' ),
			dims: `${ booted.doc.w }×${ booted.doc.h }`,
			attachmentId: WPIE.attachmentId || 0,
			isNew: !! WPIE.isNew,
			dirty: false,
			boot: { doc: booted.doc, layers: booted.layers },
			snap: null,
		},
	] );
	const [ active, setActive ] = useState( 'tab1' );
	// Ref-of-ref: EditorScreen registers its live editor ref here, so
	// switching can snapshot the CURRENT state without prop drilling.
	const liveRef = useRef( null );
	// One-shot callback for the NEXT mounted screen (e.g. SET_PAGES for
	// multi-page designs opened into a fresh tab).
	const afterMountRef = useRef( null );
	const toasts = useToasts();
	// Latest tabs/active for the persistence writer (closures go stale).
	const stateRef = useRef( null );

	const dimsOf = ( doc ) => `${ doc.w }×${ doc.h }`;
	const snapshotOf = ( live ) => ( {
		doc: { ...live.state.doc },
		layers: serializeLayers( live.state.layers ),
	} );

	// Card preview for the tabs flyout, rendered from the live state at
	// park time (images sit in the shared cache, so the scaled draw is
	// cheap). Fire-and-forget: a missing preview just shows the fallback.
	const previewTab = ( id, live ) => {
		const { doc, layers } = live.state;
		const scale = Math.min( 240 / doc.w, 180 / doc.h, 1 );
		renderToCanvas( doc, layers, { scale, cache: sharedImageCache } )
			.then( ( canvas ) => {
				const preview = canvas?.toDataURL ? canvas.toDataURL() : null;
				if ( preview ) {
					setTabs( ( prev ) =>
						prev.map( ( t ) =>
							t.id === id ? { ...t, preview } : t
						)
					);
				}
			} )
			.catch( () => {} );
	};

	// Park the active tab (name/dirty refreshed, boot dropped for memory).
	const captureActive = () => {
		const live = liveRef.current?.current;
		if ( ! live ) {
			return;
		}
		setTabs( ( prev ) =>
			prev.map( ( t ) =>
				t.id === active
					? {
							...t,
							name: live.state.doc.name || t.name,
							dims: dimsOf( live.state.doc ),
							// A set dot survives parking no matter what the
							// fresh-history session claims; only MARK_SAVED
							// (savedRef watcher) lowers it (v1.107.6).
							dirty: !! live.dirty || !! t.dirty,
							isNew: false,
							boot: null,
							snap: snapshotOf( live ),
					  }
					: t
			)
		);
		previewTab( active, live );
	};

	const selectTab = async ( id ) => {
		if ( id === active ) {
			return;
		}
		const target = tabs.find( ( t ) => t.id === id );
		if ( ! target ) {
			return;
		}
		// Hydrate the target FIRST (images/canvases come back from data
		// URLs); the current tab stays interactive meanwhile.
		let boot = target.boot;
		if ( ! boot && target.snap ) {
			boot = {
				doc: target.snap.doc,
				layers: await hydrateLayers(
					JSON.parse( JSON.stringify( target.snap.layers ) )
				),
			};
		}
		captureActive();
		setTabs( ( prev ) =>
			prev.map( ( t ) => ( t.id === id ? { ...t, boot } : t ) )
		);
		setActive( id );
	};

	// New tab with a ready document (Create dialog, library opens,
	// Screenshot Beautifier). attachmentId 0 = unsaved new document.
	const openDocInTab = ( {
		doc,
		layers,
		name,
		attachmentId = 0,
		afterMount,
	} ) => {
		// Read the freshest tab count via the ref, never the closed-over
		// `tabs`: the caller (editor-main `extras`) is memoised and can hand
		// this a stale closure, which used to keep reporting "full" after tabs
		// were closed until a full browser reload (v1.226.0 fix).
		const openTabs = stateRef.current?.tabs || tabs;
		// 10 since the tabs collapsed into the flyout (was 5, a limit of
		// the old always-open strip's width, not of the architecture:
		// parked tabs are serialized snapshots, only the active one runs).
		if ( openTabs.length >= 10 ) {
			return 'full';
		}
		afterMountRef.current = afterMount || null;
		captureActive();
		counter.current += 1;
		const id = 'tab' + counter.current;
		setTabs( ( prev ) => [
			...prev,
			{
				id,
				name: name || doc.name || __( 'untitled', 'wunderpaint' ),
				attachmentId,
				isNew: false,
				dirty: false,
				boot: { doc, layers },
				snap: null,
			},
		] );
		setActive( id );
		return true;
	};

	const closeTab = async ( id ) => {
		// Freshest tabs/active from the ref so quick successive closes each see
		// the already-committed list, not a stale closure (v1.226.0).
		const snap = stateRef.current || { tabs, active };
		const curTabs = snap.tabs;
		const curActive = snap.active;
		if ( curTabs.length < 2 ) {
			return;
		}
		const idx = curTabs.findIndex( ( t ) => t.id === id );
		const rest = curTabs.filter( ( t ) => t.id !== id );
		if ( id === curActive ) {
			const next = rest[ Math.max( 0, idx - 1 ) ];
			let boot = next.boot;
			if ( ! boot && next.snap ) {
				boot = {
					doc: next.snap.doc,
					layers: await hydrateLayers(
						JSON.parse( JSON.stringify( next.snap.layers ) )
					),
				};
			}
			setTabs(
				rest.map( ( t ) => ( t.id === next.id ? { ...t, boot } : t ) )
			);
			setActive( next.id );
		} else {
			setTabs( rest );
		}
	};

	// Keep the tab label in sync while working (rename, dirty dot).
	const syncActive = ( patch ) =>
		setTabs( ( prev ) =>
			prev.map( ( t ) => ( t.id === active ? { ...t, ...patch } : t ) )
		);

	const tab = tabs.find( ( t ) => t.id === active );
	const tabWPIE = useMemo(
		() => ( {
			...WPIE,
			attachmentId: tab?.attachmentId || 0,
			isNew: !! tab?.isNew,
		} ),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[ active ]
	);

	/*
	 * This block sits ABOVE the early return on purpose (v1.342.0). Its
	 * three effects used to follow it, so on a render where `tab` is not
	 * ready React saw three hooks fewer than on the render before - the
	 * one thing the Rules of Hooks exist to prevent. Nothing in here needs
	 * `tab`; it works on `tabs` and `active`, both defined further up.
	 */
	/* ---------------- reload persistence (v1.110.0, tabs stage 2) -------- */
	stateRef.current = { tabs, active };
	const tabsKey = 'wpie-tabs:' + ( WPIE.attachmentId || 'new' );
	const persistTabs = () => {
		const current = stateRef.current;
		if ( ! current ) {
			return;
		}
		const live = liveRef.current?.current;
		const record = {
			ts: Date.now(),
			tabs: current.tabs
				.map( ( t ) => {
					if ( t.id === current.active && live ) {
						return {
							name: live.state.doc.name || t.name,
							dims: dimsOf( live.state.doc ),
							attachmentId: t.attachmentId || 0,
							dirty: !! live.dirty || !! t.dirty,
							snap: snapshotOf( live ),
						};
					}
					return t.snap
						? {
								name: t.name,
								dims: t.dims,
								attachmentId: t.attachmentId || 0,
								dirty: !! t.dirty,
								snap: t.snap,
						  }
						: null;
				} )
				.filter( Boolean ),
		};
		autosaveStorage.set( tabsKey, record ).catch( () => {} );
	};
	useEffect( () => {
		const iv = setInterval( persistTabs, 20000 );
		return () => clearInterval( iv );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [] );
	useEffect( () => {
		const timer = setTimeout( persistTabs, 1500 );
		return () => clearTimeout( timer );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ tabs, active ] );

	// Offer the parked documents of the previous visit once per load.
	useEffect( () => {
		// Not after an intentional language switch: the reload was asked
		// for, and being asked to restore your own session reads like an
		// error. The autosave offer in screens/editor-main.jsx skips for
		// the same reason; this one has to skip too, because its filter
		// below only drops candidates matching WPIE.attachmentId, so a
		// document without an attachment (every freshly created image)
		// stays a candidate against itself. Measured on v1.360.0: a
		// switch on a blank document offered "restore tabs" 1.5 seconds
		// later, and accepting it opened the same blank tab twice.
		if ( takeIntentionalReload() ) {
			return;
		}
		autosaveStorage
			.get( tabsKey )
			.then( ( record ) => {
				const candidates = ( record?.tabs || [] ).filter(
					( t ) =>
						t.snap &&
						! (
							WPIE.attachmentId &&
							t.attachmentId === WPIE.attachmentId
						)
				);
				if ( ! candidates.length ) {
					return;
				}
				// One toast per reload (v1.130.1): merged with the
				// current document's autosave offer when both exist.
				offerRestore(
					{
						kind: 'tabs',
						count: candidates.length,
						restore: () =>
							setTabs( ( prev ) => [
								...prev,
								...candidates
									// Never duplicate a document that is
									// already open as a tab (v1.130.2).
									.filter(
										( t ) =>
											! t.attachmentId ||
											! prev.some(
												( p ) =>
													p.attachmentId ===
													t.attachmentId
											)
									)
									.slice( 0, Math.max( 0, 5 - prev.length ) )
									.map( ( t ) => {
										counter.current += 1;
										return {
											id: 'tab' + counter.current,
											name: t.name,
											dims: t.dims,
											attachmentId: t.attachmentId || 0,
											isNew: false,
											dirty: !! t.dirty,
											boot: null,
											snap: t.snap,
										};
									} ),
							] ),
					},
					toasts
				);
			} )
			.catch( () => {} );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [] );

	if ( ! tab || ( ! tab.boot && ! tab.isNew ) ) {
		return null;
	}
	const boot = tab.boot || { doc: createBlankDoc(), layers: [] };

	const tabsApi = {
		registerLive: ( ref ) => {
			liveRef.current = ref;
			const cb = afterMountRef.current;
			afterMountRef.current = null;
			if ( cb ) {
				window.setTimeout( () => cb( ref.current ), 0 );
			}
		},
		openDocInTab,
		syncActive,
	};

	return (
		<EditorProvider
			key={ active }
			doc={ boot.doc }
			layers={ boot.layers }
			WPIE={ tabWPIE }
		>
			<EditorScreen
				isNew={ !! tab.isNew }
				tabs={ tabs }
				activeTab={ active }
				tabsApi={ tabsApi }
				onSelectTab={ selectTab }
				onCloseTab={ closeTab }
			/>
		</EditorProvider>
	);
}
