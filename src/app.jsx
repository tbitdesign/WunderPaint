/**
 * Root app: reads window.WPIE, boots the API client, loads the document
 * (sidecar project → attachment image → blank) and mounts the editor.
 */

import { siteStorage } from './lib/local-storage';
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
	serializeDocument,
} from './store/document';
import { EditorProvider } from './store/editor-context';
import { renderToCanvas, sharedImageCache } from './lib/raster';
import { autosaveStorage, tabsKeyFor, windowId } from './lib/autosave';
import { offerRestore } from './lib/restore-offer';
import { takeIntentionalReload } from './lib/editor-locale';
import {
	orphanSessions,
	restoreCandidates,
	takeCandidates,
	withLeftovers,
} from './lib/tab-session';
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
			const stored = siteStorage.getItem( 'wpie-theme' );
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
// Open documents at once. 10 since the tabs collapsed into the flyout (was
// 5, a limit of the old always-open strip's width, not of the architecture:
// parked tabs are serialized snapshots, only the active one runs). ONE
// number for opening and for restoring - the restore kept the old 5 and
// brought five of seven documents back (Codex F05).
const MAX_TABS = 10;

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
	// Parked documents of the previous visit that are not restored (yet):
	// they ride along in every write of the tabs record until they are.
	const leftoverRef = useRef( [] );

	const dimsOf = ( doc ) => `${ doc.w }×${ doc.h }`;
	// Pages included: parking a tab used to drop every page but the open one.
	const snapshotOf = ( live ) => serializeDocument( live.state );

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
		const boot = await wakeTab( target );
		captureActive();
		setTabs( ( prev ) =>
			prev.map( ( t ) => ( t.id === id ? { ...t, boot } : t ) )
		);
		setActive( id );
	};

	// A parked tab back to life: hydrate the open page, carry the other
	// pages serialized, and arm the one-shot SET_PAGES for the mounted
	// screen (the provider only takes doc and layers - the same one-shot
	// the library uses when it opens a design for the first time). ONE
	// place for both ways a parked tab becomes active, a switch or the
	// neighbour closing: the close path used to rebuild the boot by hand
	// and dropped the pages.
	// The provider only takes doc and layers, so a boot that carries pages
	// hands them to the mounted screen through the one-shot. ONE helper for
	// every way a tab comes up with content: a parked tab waking (wakeTab)
	// and a fresh tab opened with a ready document (openDocInTab). The
	// second used to build its boot without pages at all, so "Open Project"
	// on a multi-page file kept one page whenever it went into a new tab -
	// the in-place path had been fixed the same day and the report said
	// F02 was closed (Codex C01).
	const armPages = ( boot, after = null ) => {
		if ( ! boot || ! boot.pages ) {
			afterMountRef.current = after;
			return;
		}
		const seiten = boot.pages;
		const aktuell = boot.currentPage ?? 0;
		afterMountRef.current = ( mounted ) => {
			mounted.dispatch( {
				type: 'SET_PAGES',
				pages: seiten,
				current: aktuell,
			} );
			if ( after ) {
				after( mounted );
			}
		};
	};

	const wakeTab = async ( target ) => {
		let boot = target.boot;
		if ( ! boot && target.snap ) {
			boot = {
				doc: target.snap.doc,
				layers: await hydrateLayers(
					JSON.parse( JSON.stringify( target.snap.layers ) )
				),
				pages: target.snap.pages || null,
				currentPage: target.snap.currentPage ?? 0,
			};
		}
		if ( boot && boot.pages ) {
			armPages( boot );
		}
		return boot;
	};

	// New tab with a ready document (Create dialog, library opens,
	// Screenshot Beautifier). attachmentId 0 = unsaved new document.
	const openDocInTab = ( {
		doc,
		layers,
		name,
		attachmentId = 0,
		afterMount,
		pages = null,
		currentPage = 0,
	} ) => {
		// Read the freshest tab count via the ref, never the closed-over
		// `tabs`: the caller (editor-main `extras`) is memoised and can hand
		// this a stale closure, which used to keep reporting "full" after tabs
		// were closed until a full browser reload (v1.226.0 fix).
		const openTabs = stateRef.current?.tabs || tabs;
		if ( openTabs.length >= MAX_TABS ) {
			return 'full';
		}
		const boot = Array.isArray( pages )
			? { doc, layers, pages, currentPage }
			: { doc, layers };
		armPages( boot, afterMount || null );
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
				boot,
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
			const boot = await wakeTab( next );
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
	const tabsKey = tabsKeyFor( WPIE.attachmentId );
	const persistTabs = ( { closed = false } = {} ) => {
		const current = stateRef.current;
		if ( ! current ) {
			return;
		}
		const live = liveRef.current?.current;
		const record = {
			ts: Date.now(),
			// A normal close says so, and the next window on the page may
			// adopt the record at once; a crash leaves no mark, and the
			// record has to age out first (orphanSessions).
			...( closed ? { closed: true } : {} ),
			tabs: withLeftovers(
				current.tabs
					.map( ( t ) => {
						if ( t.id === current.active && live ) {
							return {
								name: live.state.doc.name || t.name,
								dims: dimsOf( live.state.doc ),
								attachmentId: t.attachmentId || 0,
								dirty: !! live.dirty || !! t.dirty,
								snap: snapshotOf( live ),
								// The active document is the autosave's business
								// (screens/editor-main.jsx); the tab record keeps it
								// only so a tab switch can park it. Marked, so the
								// restore below does not offer it a second time.
								active: true,
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
				leftoverRef.current
			),
		};
		autosaveStorage.set( tabsKey, record ).catch( () => {} );
	};
	useEffect( () => {
		const iv = setInterval( persistTabs, 20000 );
		const onHide = () => persistTabs( { closed: true } );
		window.addEventListener( 'pagehide', onHide );
		return () => {
			clearInterval( iv );
			window.removeEventListener( 'pagehide', onHide );
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [] );

	// Records of windows that are gone (crashed, or closed with unsaved
	// work): every window on the "new document" page keys its records by
	// its own id since v1.429.1, so what another window left behind has to
	// be looked for. Adopted records move into THIS window's record right
	// away and are offered like its own leftovers; the orphan keys go, so
	// no third window adopts them again.
	const sweepOrphans = async () => {
		if ( WPIE.attachmentId || ! autosaveStorage.keys ) {
			return [];
		}
		let keys = [];
		try {
			keys = await autosaveStorage.keys();
		} catch ( e ) {
			return [];
		}
		const relevant = keys.filter( ( k ) =>
			/^wpie(-tabs)?:new(?::|$)/.test( String( k ) )
		);
		const records = {};
		await Promise.all(
			relevant.map( async ( k ) => {
				records[ k ] = await autosaveStorage
					.get( k )
					.catch( () => null );
			} )
		);
		const adopted = [];
		for ( const orphan of orphanSessions( relevant, records, {
			own: windowId(),
			now: Date.now(),
		} ) ) {
			adopted.push( ...orphan.candidates );
			await Promise.all(
				orphan.keys.map( ( k ) =>
					autosaveStorage.remove( k ).catch( () => {} )
				)
			);
		}
		return adopted;
	};
	useEffect( () => {
		const timer = setTimeout( persistTabs, 1500 );
		return () => clearTimeout( timer );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ tabs, active ] );

	// Offer the parked documents of the previous visit once per load.
	useEffect( () => {
		const afterLocaleSwitch = takeIntentionalReload();
		const toTab = ( t ) => {
			counter.current += 1;
			return {
				id: 'tab' + counter.current,
				name: t.name || __( 'untitled', 'wunderpaint' ),
				dims: t.dims,
				attachmentId: t.attachmentId || 0,
				isNew: false,
				dirty: !! t.dirty,
				boot: null,
				snap: t.snap,
			};
		};
		Promise.all( [ autosaveStorage.get( tabsKey ), sweepOrphans() ] )
			.then( ( [ record, adopted ] ) => {
				// The document that was ACTIVE when the record was written is
				// a candidate only when the autosave will NOT restore it into
				// the current tab: the autosave reads one key, the page's
				// attachment or the window's new-document key, so an active
				// tab of another identity was lost from every offer (Codex
				// C02). Same identity is still filtered - a freshly created,
				// never saved document on a page that boots new used to come
				// back twice (Thomas, 02.09.2026). lib/tab-session.js holds
				// the rule and its test.
				const candidates = [
					...restoreCandidates( record, WPIE.attachmentId ),
					...adopted,
				];
				if ( ! candidates.length ) {
					return;
				}
				// Whatever is not restored stays in the record: the 1.5-second
				// persist above used to overwrite it with the fresh session
				// while the offer was still on screen, and whoever did not
				// click at once lost the parked work. Adopted records are
				// written into this window's record at once - their old keys
				// are gone by now.
				leftoverRef.current = candidates;
				if ( adopted.length ) {
					persistTabs();
				}
				const restore = () =>
					setTabs( ( prev ) => {
						const { taken, leftover } = takeCandidates(
							candidates,
							prev,
							MAX_TABS
						);
						leftoverRef.current = leftover;
						return [ ...prev, ...taken.map( toTab ) ];
					} );
				// After an intentional language switch the reload was asked
				// for, and a question about restoring your own session reads
				// like an error. So the parked documents simply come back, as
				// the autosave brings back the active one - only the QUESTION
				// is skipped. It used to skip the restore too, and every
				// other document was gone (Codex F04).
				if ( afterLocaleSwitch ) {
					restore();
					return;
				}
				// One toast per reload (v1.130.1): merged with the current
				// document's autosave offer when both exist.
				offerRestore(
					{ kind: 'tabs', count: candidates.length, restore },
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
