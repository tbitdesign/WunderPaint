/**
 * "My Archive" (v1.431.0): a folder on the visitor's own computer, browsed
 * inside the editor. The folder is read in place - nothing is uploaded,
 * nothing is copied - and an image lands on the canvas through the same
 * path as File > Place. The mechanics (index, previews, the two ways a
 * browser can reach a folder) live in src/lib/local-archive.js; this file
 * holds the two surfaces over them:
 *
 *   ArchiveSection  the section in the Asset Library dialog, where folders
 *                   are connected, refreshed and disconnected;
 *   ArchiveStrip    the strip in the tray under the canvas, the place
 *                   people actually insert from - click or drag. Its chip
 *                   is always there; before a folder is connected the strip
 *                   offers the connecting itself, as does File > Connect
 *                   Folder through connectFolder() below.
 */

import {
	useState,
	useRef,
	useEffect,
	useMemo,
	useCallback,
} from '@wordpress/element';
import { __, _n, sprintf } from '@wordpress/i18n';
import { I } from '../../icons';
import { confirmDialog } from '../../lib/dialogs';
import { importFiles } from '../../lib/import-files';
import { siteStorage, writeLocal } from '../../lib/local-storage';
import {
	archiveLibrary,
	canPickDirectory,
	pickDirectoryHandle,
	readDroppedFolder,
	filterFiles,
	ARCHIVE_EVENT,
} from '../../lib/local-archive';

/** Which archive the dialog showed last. */
const ACTIVE_KEY = 'wpie-archive-active';
/** Tiles rendered per step; a big folder is paged like the media library. */
const PAGE = 120;
/** Previews generated at once. */
const PARALLEL = 3;

/** The asset descriptor the tray, the canvas drop and insertAsset share. */
export const archiveAsset = ( rec ) => ( {
	kind: 'archive',
	archiveId: rec.archiveId,
	path: rec.path,
	title: rec.name,
} );

/** Does this drag carry files from the desktop (types only)? */
const hasFiles = ( e ) =>
	Array.from( e.dataTransfer?.types || [] ).includes( 'Files' );

/** The hidden folder input every desktop browser understands. */
const FolderInput = ( { inputRef, onChange } ) => (
	<input
		ref={ inputRef }
		type="file"
		webkitdirectory=""
		multiple
		accept="image/*"
		style={ { display: 'none' } }
		onChange={ onChange }
		tabIndex={ -1 }
		aria-hidden="true"
	/>
);

/**
 * Lazy previews: tiles register through the returned ref; the ones that
 * scroll into view are queued, a few run at once, and every finished
 * preview is patched into the file list. `isCurrent( archiveId )` lets a
 * surface drop results for an archive it no longer shows.
 */
function useThumbLoader( { lib, patchFiles, isCurrent } ) {
	const queueRef = useRef( { waiting: [], running: 0, seen: new Set() } );
	const reset = useCallback( () => {
		queueRef.current = { waiting: [], running: 0, seen: new Set() };
	}, [] );
	const pump = useCallback( () => {
		const q = queueRef.current;
		while ( q.running < PARALLEL && q.waiting.length ) {
			const { id, path } = q.waiting.shift();
			q.running++;
			lib.ensureThumb( id, path )
				.then( ( rec ) => {
					if (
						rec &&
						isCurrent( id ) &&
						( rec.thumb || rec.broken )
					) {
						patchFiles( ( prev ) =>
							prev.map( ( r ) =>
								r.archiveId === id && r.path === path
									? { ...r, ...rec }
									: r
							)
						);
					}
				} )
				.catch( () => {} )
				.finally( () => {
					q.running--;
					pump();
				} );
		}
	}, [ lib, patchFiles, isCurrent ] );
	const observer = useMemo( () => {
		if ( 'undefined' === typeof window.IntersectionObserver ) {
			return null;
		}
		return new window.IntersectionObserver(
			( entries ) => {
				const q = queueRef.current;
				for ( const entry of entries ) {
					if ( ! entry.isIntersecting ) {
						continue;
					}
					const { path, archive: id } = entry.target.dataset;
					const k = `${ id }::${ path }`;
					if ( id && path && ! q.seen.has( k ) ) {
						q.seen.add( k );
						q.waiting.push( { id, path } );
					}
					observer.unobserve( entry.target );
				}
				pump();
			},
			{ rootMargin: '200px' }
		);
	}, [ pump ] );
	useEffect( () => () => observer?.disconnect(), [ observer ] );
	const tileRef = useCallback(
		( el ) => {
			if ( el && observer && ! el.dataset.thumb ) {
				observer.observe( el );
			}
		},
		[ observer ]
	);
	return { tileRef, reset };
}

/* ------------------------------ the dialog ------------------------------ */

export function ArchiveSection( { editor, extras, onClose } ) {
	const lib = useMemo( archiveLibrary, [] );
	const [ archives, setArchives ] = useState( null );
	const [ activeId, setActiveIdState ] = useState(
		() => siteStorage.getItem( ACTIVE_KEY ) || ''
	);
	const [ files, setFiles ] = useState( [] );
	const [ query, setQuery ] = useState( '' );
	const [ access, setAccess ] = useState( 'granted' );
	const [ busy, setBusy ] = useState( '' );
	const [ shown, setShown ] = useState( PAGE );
	const [ over, setOver ] = useState( false );
	const inputRef = useRef( null );
	const contentRef = useRef( null );
	const pendingRef = useRef( null );
	const activeRef = useRef( activeId );
	const aliveRef = useRef( true );

	const archive = ( archives || [] ).find( ( a ) => a.id === activeId );

	useEffect( () => {
		aliveRef.current = true;
		return () => {
			aliveRef.current = false;
		};
	}, [] );

	const setActiveId = useCallback( ( id ) => {
		activeRef.current = id;
		setActiveIdState( id );
		siteStorage.setItem( ACTIVE_KEY, id || '' );
	}, [] );

	const toastError = ( msg ) => extras?.toasts?.error?.( msg );

	const isCurrent = useCallback( ( id ) => activeRef.current === id, [] );
	const { tileRef, reset: resetThumbs } = useThumbLoader( {
		lib,
		patchFiles: setFiles,
		isCurrent,
	} );

	/* ------------------------------ loading ------------------------------ */

	const reloadArchives = useCallback(
		async ( preferId ) => {
			const list = await lib.listArchives();
			list.sort( ( a, b ) => ( a.added || 0 ) - ( b.added || 0 ) );
			if ( ! aliveRef.current ) {
				return list;
			}
			setArchives( list );
			const want = preferId || activeRef.current;
			const next = list.find( ( a ) => a.id === want ) || list[ 0 ];
			setActiveId( next ? next.id : '' );
			return list;
		},
		[ lib, setActiveId ]
	);

	useEffect( () => {
		reloadArchives().catch( () => setArchives( [] ) );
	}, [ reloadArchives ] );

	const loadFiles = useCallback(
		async ( id ) => {
			const list = await lib.listFiles( id );
			if ( aliveRef.current && activeRef.current === id ) {
				setFiles( list );
			}
		},
		[ lib ]
	);

	// Switching archives: show the stored index at once, then find out
	// whether the folder can be read now and, for a remembered handle,
	// re-read it in the background so new files appear by themselves.
	useEffect( () => {
		if ( ! archive ) {
			setFiles( [] );
			return;
		}
		const id = archive.id;
		resetThumbs();
		setShown( PAGE );
		setQuery( '' );
		loadFiles( id );
		let cancelled = false;
		( async () => {
			const state = await lib.permissionState( archive );
			if ( cancelled ) {
				return;
			}
			setAccess( state );
			if ( archive.handle && 'granted' === state ) {
				setBusy( 'refreshing' );
				try {
					await lib.rescan( archive );
					if ( ! cancelled ) {
						await reloadArchives( id );
						await loadFiles( id );
					}
				} catch ( e ) {
					// Folder moved or unreadable: the stored index stays.
				} finally {
					if ( ! cancelled ) {
						setBusy( '' );
					}
				}
			}
		} )();
		return () => {
			cancelled = true;
		};
		// The archive object changes on every refresh; its id is the key.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ archive?.id ] );

	/* ------------------------------ actions ------------------------------ */

	const afterConnect = async ( next ) => {
		await reloadArchives( next.id );
		await loadFiles( next.id );
		setAccess( 'granted' );
	};

	const connect = async () => {
		if ( canPickDirectory() ) {
			let handle;
			try {
				handle = await pickDirectoryHandle();
			} catch ( e ) {
				return; // cancelled
			}
			setBusy( 'reading' );
			try {
				await afterConnect( await lib.connectHandle( handle ) );
			} catch ( e ) {
				toastError(
					__( 'Could not read this folder.', 'wunderpaint' )
				);
			} finally {
				setBusy( '' );
			}
			return;
		}
		pendingRef.current = null;
		inputRef.current?.click();
	};

	const onPicked = async ( e ) => {
		const list = Array.from( e.target.files || [] );
		e.target.value = '';
		if ( ! list.length ) {
			return;
		}
		setBusy( 'reading' );
		try {
			const next = await lib.connectFiles( list );
			await afterConnect( next );
			const pending = pendingRef.current;
			pendingRef.current = null;
			if ( pending && pending.archiveId === next.id ) {
				await insertPath( next.id, pending.path );
			}
		} catch ( err ) {
			toastError(
				__( 'No images found in this folder.', 'wunderpaint' )
			);
		} finally {
			setBusy( '' );
		}
	};

	const onDrop = async ( e ) => {
		e.preventDefault();
		e.stopPropagation();
		setOver( false );
		const dropped = readDroppedFolder( e.dataTransfer );
		setBusy( 'reading' );
		try {
			const what = await dropped;
			if ( ! what ) {
				toastError(
					__(
						'Drop a folder here. Single images go straight onto the canvas.',
						'wunderpaint'
					)
				);
				return;
			}
			const next = what.handle
				? await lib.connectHandle( what.handle )
				: await lib.connectFiles( what );
			await afterConnect( next );
		} catch ( err ) {
			toastError(
				__( 'No images found in this folder.', 'wunderpaint' )
			);
		} finally {
			setBusy( '' );
		}
	};

	const allow = async () => {
		if ( ! archive ) {
			return;
		}
		if ( archive.handle ) {
			if ( await lib.requestPermission( archive ) ) {
				setAccess( 'granted' );
				setBusy( 'refreshing' );
				try {
					await lib.rescan( archive );
					await reloadArchives( archive.id );
					await loadFiles( archive.id );
				} catch ( e ) {
					toastError(
						__( 'Could not read this folder.', 'wunderpaint' )
					);
				} finally {
					setBusy( '' );
				}
			}
			return;
		}
		pendingRef.current = null;
		inputRef.current?.click();
	};

	const refresh = async () => {
		if ( ! archive ) {
			return;
		}
		if ( ! archive.handle ) {
			pendingRef.current = null;
			inputRef.current?.click();
			return;
		}
		if ( 'granted' !== access ) {
			return allow();
		}
		setBusy( 'refreshing' );
		try {
			await lib.rescan( archive );
			await reloadArchives( archive.id );
			await loadFiles( archive.id );
		} catch ( e ) {
			toastError( __( 'Could not read this folder.', 'wunderpaint' ) );
		} finally {
			setBusy( '' );
		}
	};

	const disconnect = async () => {
		if ( ! archive ) {
			return;
		}
		const ok = await confirmDialog( {
			title: sprintf(
				/* translators: %s: folder name. */ __(
					'Disconnect “%s”?',
					'wunderpaint'
				),
				archive.name
			),
			message: __(
				'The previews kept in this browser are removed. The folder and its files are not touched.',
				'wunderpaint'
			),
			confirmLabel: __( 'Disconnect', 'wunderpaint' ),
		} );
		if ( ! ok ) {
			return;
		}
		await lib.disconnect( archive.id );
		await reloadArchives( '' );
	};

	const insertPath = async ( id, path ) => {
		const file = await lib.getFile( id, path );
		if ( ! file ) {
			toastError(
				__(
					'Could not open this image. Choose the folder again.',
					'wunderpaint'
				)
			);
			return;
		}
		await importFiles( [ file ], editor, extras, null );
		onClose();
	};

	const insert = async ( rec ) => {
		if ( ! archive ) {
			return;
		}
		if ( archive.handle ) {
			if ( 'granted' !== access ) {
				if ( ! ( await lib.requestPermission( archive ) ) ) {
					return;
				}
				setAccess( 'granted' );
			}
			await insertPath( archive.id, rec.path );
			return;
		}
		if ( ! lib.hasSession( archive.id ) ) {
			// The browser forgot the folder with the last tab; picking it
			// again must start inside this click, so it is done here and
			// the insert continues once the files are back.
			pendingRef.current = { archiveId: archive.id, path: rec.path };
			inputRef.current?.click();
			return;
		}
		await insertPath( archive.id, rec.path );
	};

	/* ------------------------------ render ------------------------------- */

	const list = useMemo( () => filterFiles( files, query ), [ files, query ] );
	const visible = list.slice( 0, shown );
	const hasMore = list.length > shown;

	// Keep filling while the grid does not overflow the panel, otherwise no
	// scroll event ever asks for the next page.
	useEffect( () => {
		const el = contentRef.current;
		if ( el && hasMore && el.scrollHeight <= el.clientHeight + 40 ) {
			setShown( ( s ) => s + PAGE );
		}
	}, [ visible.length, hasMore ] );

	const dragProps = {
		onDragOver: ( e ) => {
			e.preventDefault();
			e.stopPropagation();
			if ( ! over ) {
				setOver( true );
			}
		},
		onDragLeave: ( e ) => {
			if ( ! e.currentTarget.contains( e.relatedTarget ) ) {
				setOver( false );
			}
		},
		onDrop,
	};

	if ( null === archives ) {
		return (
			<div className="library-content">
				<div className="library-hint">
					<span className="spin" />{ ' ' }
					{ __( 'Loading…', 'wunderpaint' ) }
				</div>
			</div>
		);
	}

	if ( ! archive ) {
		return (
			<div className="library-content">
				<div
					className={ `archive-empty${ over ? ' is-over' : '' }` }
					{ ...dragProps }
				>
					<strong>
						{ __(
							'Connect a folder on this computer',
							'wunderpaint'
						) }
					</strong>
					<p>
						{ __(
							'Your own image archive, right inside the library. WunderPaint reads the folder in place: nothing is uploaded and nothing is copied, only small previews stay in this browser.',
							'wunderpaint'
						) }
					</p>
					<div className="archive-empty-actions">
						<button
							className="ai-btn primary"
							onClick={ connect }
							disabled={ !! busy }
						>
							{ busy
								? __( 'Reading folder…', 'wunderpaint' )
								: __( 'Connect folder', 'wunderpaint' ) }
						</button>
					</div>
					<p className="library-hint">
						{ __( 'Or drop a folder here.', 'wunderpaint' ) }
					</p>
				</div>
				<FolderInput inputRef={ inputRef } onChange={ onPicked } />
			</div>
		);
	}

	return (
		<div
			className={ `library-content${ over ? ' archive-over' : '' }` }
			ref={ contentRef }
			{ ...dragProps }
			onScroll={ ( e ) => {
				const el = e.currentTarget;
				if (
					hasMore &&
					el.scrollTop + el.clientHeight > el.scrollHeight - 400
				) {
					setShown( ( s ) => s + PAGE );
				}
			} }
		>
			<div className="library-toolbar archive-head">
				{ archives.length > 1 ? (
					<select
						className="archive-pick"
						value={ archive.id }
						onChange={ ( e ) => setActiveId( e.target.value ) }
						aria-label={ __( 'Folder', 'wunderpaint' ) }
					>
						{ archives.map( ( a ) => (
							<option key={ a.id } value={ a.id }>
								{ a.name }
							</option>
						) ) }
					</select>
				) : (
					<span className="archive-name" title={ archive.name }>
						{ I.folder( { size: 15 } ) }
						<span>{ archive.name }</span>
					</span>
				) }
				<input
					type="search"
					value={ query }
					onChange={ ( e ) => setQuery( e.target.value ) }
					placeholder={ __( 'Search this folder', 'wunderpaint' ) }
					aria-label={ __( 'Search this folder', 'wunderpaint' ) }
				/>
				<div className="archive-actions">
					<button
						className="ai-btn ghost sm"
						onClick={ refresh }
						disabled={ !! busy }
						title={ __( 'Read the folder again', 'wunderpaint' ) }
					>
						{ I.refresh( { size: 14 } ) }
						<span>{ __( 'Refresh', 'wunderpaint' ) }</span>
					</button>
					<button
						className="ai-btn ghost sm"
						onClick={ connect }
						disabled={ !! busy }
						title={ __( 'Connect another folder', 'wunderpaint' ) }
					>
						{ I.plus( { size: 14 } ) }
						<span>{ __( 'Add folder', 'wunderpaint' ) }</span>
					</button>
					<button
						className="ai-btn ghost sm"
						onClick={ disconnect }
						disabled={ !! busy }
						title={ __( 'Disconnect this folder', 'wunderpaint' ) }
					>
						{ I.unlink( { size: 14 } ) }
						<span>{ __( 'Disconnect', 'wunderpaint' ) }</span>
					</button>
				</div>
			</div>

			<div className="archive-status">
				<span>
					{ sprintf(
						/* translators: %d: number of images. */ _n(
							'%d image',
							'%d images',
							files.length,
							'wunderpaint'
						),
						files.length
					) }
				</span>
				{ busy && (
					<span>
						<span className="spin" />{ ' ' }
						{ 'reading' === busy
							? __( 'Reading folder…', 'wunderpaint' )
							: __( 'Looking for changes…', 'wunderpaint' ) }
					</span>
				) }
				{ ! busy && 'granted' !== access && (
					<span className="archive-access">
						{ archive.handle
							? __(
									'The browser needs your permission again before it can read this folder.',
									'wunderpaint'
							  )
							: __(
									'This browser forgets the folder when the tab closes. Previews stay; to insert an original, choose the folder again.',
									'wunderpaint'
							  ) }{ ' ' }
						<button className="ai-btn ghost sm" onClick={ allow }>
							{ archive.handle
								? __( 'Allow access', 'wunderpaint' )
								: __( 'Choose folder', 'wunderpaint' ) }
						</button>
					</span>
				) }
			</div>

			{ 0 === files.length && ! busy && (
				<div className="library-hint">
					{ __( 'No images found in this folder.', 'wunderpaint' ) }
				</div>
			) }
			{ files.length > 0 && 0 === list.length && (
				<div className="library-hint">
					{ __( 'No matches.', 'wunderpaint' ) }
				</div>
			) }
			{ visible.length > 0 && (
				<div className="library-tpl-grid archive-grid">
					{ visible.map( ( rec ) => (
						<button
							key={ rec.path }
							ref={ tileRef }
							data-path={ rec.path }
							data-archive={ archive.id }
							data-thumb={ rec.thumb || rec.broken ? '1' : '' }
							className="uploads-tile archive-tile"
							title={
								rec.dir
									? `${ rec.dir }/${ rec.name }`
									: rec.name
							}
							onClick={ () => insert( rec ) }
						>
							{ rec.thumb ? (
								<img src={ rec.thumb } alt="" />
							) : (
								<span
									className={ `archive-ph${
										rec.broken ? ' is-broken' : ''
									}` }
								>
									{ rec.broken && I.alert( { size: 16 } ) }
								</span>
							) }
							<span className="library-tpl-name">
								{ rec.name }
							</span>
						</button>
					) ) }
				</div>
			) }
			{ hasMore && (
				<div className="stock-more">
					<button
						className="button"
						onClick={ () => setShown( ( s ) => s + PAGE ) }
					>
						{ __( 'Load more', 'wunderpaint' ) }
					</button>
				</div>
			) }
			<FolderInput inputRef={ inputRef } onChange={ onPicked } />
		</div>
	);
}

/* ------------------------------ connecting ------------------------------ */

/** Point the tray at the archive strip, now and on its next mount. */
function openTrayOnArchive() {
	writeLocal( 'wpie-tray-open', '1' );
	writeLocal( 'wpie-tray-section', 'archive' );
	try {
		window.dispatchEvent(
			new window.CustomEvent( 'wpie:tray-open', {
				detail: { section: 'archive' },
			} )
		);
	} catch ( e ) {}
}

/** A throwaway folder input, resolved with its files (null when empty). */
function pickFolderFiles() {
	return new Promise( ( resolve ) => {
		const input = document.createElement( 'input' );
		input.type = 'file';
		input.multiple = true;
		input.accept = 'image/*';
		input.setAttribute( 'webkitdirectory', '' );
		input.style.display = 'none';
		input.onchange = () => {
			const list = Array.from( input.files || [] );
			input.remove();
			resolve( list.length ? list : null );
		};
		document.body.appendChild( input );
		input.click();
	} );
}

/**
 * Connect a folder from anywhere - the File menu, the tray strip, a drop:
 * the native directory picker where the browser has one, a throwaway
 * folder input otherwise. Must run from a click or drop. The tray turns
 * to the archive strip afterwards. Resolves with the archive, or null when
 * the visitor cancelled or nothing usable came in (reported as a toast).
 *
 * @param {Object} extras           Toasts.
 * @param {Object} [opts]           Options.
 * @param {Promise} [opts.dropped]  readDroppedFolder() of a drop event.
 * @return {Promise<Object|null>} The archive.
 */
export async function connectFolder( extras, { dropped } = {} ) {
	const lib = archiveLibrary();
	const fail = ( msg ) => extras?.toasts?.error?.( msg );
	let archive = null;
	if ( dropped ) {
		const what = await dropped;
		if ( ! what ) {
			fail(
				__(
					'Drop a folder here. Single images go straight onto the canvas.',
					'wunderpaint'
				)
			);
			return null;
		}
		try {
			archive = what.handle
				? await lib.connectHandle( what.handle )
				: await lib.connectFiles( what );
		} catch ( e ) {
			fail( __( 'No images found in this folder.', 'wunderpaint' ) );
			return null;
		}
	} else if ( canPickDirectory() ) {
		let handle;
		try {
			handle = await pickDirectoryHandle();
		} catch ( e ) {
			return null; // cancelled
		}
		try {
			archive = await lib.connectHandle( handle );
		} catch ( e ) {
			fail( __( 'Could not read this folder.', 'wunderpaint' ) );
			return null;
		}
	} else {
		const files = await pickFolderFiles();
		if ( ! files ) {
			return null;
		}
		try {
			archive = await lib.connectFiles( files );
		} catch ( e ) {
			fail( __( 'No images found in this folder.', 'wunderpaint' ) );
			return null;
		}
	}
	openTrayOnArchive();
	return archive;
}

/* ------------------------------- the tray ------------------------------- */

/** Tiles the strip renders per step; more arrive while scrolling. */
const STRIP_PAGE = 80;

/**
 * The tray strip: every connected folder in one row, newest first, filtered
 * by the tray's search. A click inserts through the tray's `insert` (the
 * archive asset kind), a drag carries the same descriptor to the canvas,
 * to an image layer (swap) or into a frame. `tileProps` and `wheelScroll`
 * come from the tray so the tiles behave like every other tile there.
 */
export function ArchiveStrip( {
	query,
	insert,
	extras,
	tileProps,
	wheelScroll,
} ) {
	const lib = useMemo( archiveLibrary, [] );
	const [ archives, setArchives ] = useState( [] );
	const [ files, setFiles ] = useState( null );
	const [ shown, setShown ] = useState( STRIP_PAGE );
	const [ over, setOver ] = useState( false );
	const inputRef = useRef( null );
	const pendingRef = useRef( null );
	const aliveRef = useRef( true );

	const patchFiles = useCallback(
		( fn ) => setFiles( ( prev ) => ( prev ? fn( prev ) : prev ) ),
		[]
	);
	const isCurrent = useCallback( () => true, [] );
	const { tileRef, reset } = useThumbLoader( { lib, patchFiles, isCurrent } );

	const load = useCallback( async () => {
		const list = await lib.listArchives();
		list.sort( ( a, b ) => ( a.added || 0 ) - ( b.added || 0 ) );
		const all = (
			await Promise.all( list.map( ( a ) => lib.listFiles( a.id ) ) )
		).flat();
		if ( ! aliveRef.current ) {
			return list;
		}
		reset();
		setArchives( list );
		setFiles( all );
		return list;
	}, [ lib, reset ] );

	// Load, follow changes made in the dialog, and re-read remembered
	// folders that can be read without asking, so new files show up.
	useEffect( () => {
		aliveRef.current = true;
		load()
			.then( async ( list ) => {
				for ( const a of list ) {
					if (
						a.handle &&
						'granted' === ( await lib.permissionState( a ) )
					) {
						lib.rescan( a ).catch( () => {} );
					}
				}
			} )
			.catch( () => aliveRef.current && setFiles( [] ) );
		const onChange = () => load().catch( () => {} );
		window.addEventListener( ARCHIVE_EVENT, onChange );
		return () => {
			aliveRef.current = false;
			window.removeEventListener( ARCHIVE_EVENT, onChange );
		};
	}, [ lib, load ] );

	const byId = useMemo(
		() => new Map( archives.map( ( a ) => [ a.id, a ] ) ),
		[ archives ]
	);

	const use = async ( rec ) => {
		const archive = byId.get( rec.archiveId );
		if ( ! archive ) {
			return;
		}
		if ( ! archive.handle && ! lib.hasSession( archive.id ) ) {
			// Session-only folder after a reload: pick it again inside this
			// click, then insert what was clicked.
			pendingRef.current = { archiveId: archive.id, path: rec.path };
			inputRef.current?.click();
			return;
		}
		await insert( archiveAsset( rec ) );
	};

	const onPicked = async ( e ) => {
		const list = Array.from( e.target.files || [] );
		e.target.value = '';
		if ( ! list.length ) {
			return;
		}
		try {
			const next = await lib.connectFiles( list );
			const pending = pendingRef.current;
			pendingRef.current = null;
			if ( pending && pending.archiveId === next.id ) {
				await insert( {
					kind: 'archive',
					archiveId: next.id,
					path: pending.path,
					title: pending.path.split( '/' ).pop(),
				} );
			}
		} catch ( err ) {
			extras?.toasts?.error?.(
				__( 'No images found in this folder.', 'wunderpaint' )
			);
		}
	};

	const list = useMemo(
		() => filterFiles( files || [], query ),
		[ files, query ]
	);
	const visible = list.slice( 0, shown );
	const several = archives.length > 1;
	const titleOf = ( rec ) => {
		const where = rec.dir ? `${ rec.dir }/${ rec.name }` : rec.name;
		return several
			? `${ byId.get( rec.archiveId )?.name || '' } / ${ where }`
			: where;
	};

	return (
		<div
			onWheel={ wheelScroll }
			className={ `tray-strip${ over ? ' archive-over' : '' }` }
			onDragOver={ ( e ) => {
				// Only a folder from the desktop; tiles dragging past the
				// strip on their way to the canvas are not ours.
				if ( ! hasFiles( e ) ) {
					return;
				}
				e.preventDefault();
				e.stopPropagation();
				if ( ! over ) {
					setOver( true );
				}
			} }
			onDragLeave={ ( e ) => {
				if ( ! e.currentTarget.contains( e.relatedTarget ) ) {
					setOver( false );
				}
			} }
			onDrop={ ( e ) => {
				if ( ! hasFiles( e ) ) {
					return;
				}
				e.preventDefault();
				e.stopPropagation();
				setOver( false );
				connectFolder( extras, {
					dropped: readDroppedFolder( e.dataTransfer ),
				} );
			} }
			onScroll={ ( e ) => {
				const el = e.currentTarget;
				if (
					list.length > shown &&
					el.scrollLeft + el.clientWidth > el.scrollWidth - 400
				) {
					setShown( ( s ) => s + STRIP_PAGE );
				}
			} }
		>
			{ null === files && <span className="spin" /> }
			{ files && 0 === archives.length && (
				<div className="archive-tray-empty">
					<span className="tray-hint">
						{ __(
							'Connect a folder on this computer',
							'wunderpaint'
						) }
					</span>
					<button
						className="ai-btn primary sm"
						onClick={ () => connectFolder( extras ) }
					>
						{ __( 'Connect folder', 'wunderpaint' ) }
					</button>
					<span className="tray-hint">
						{ __( 'Or drop a folder here.', 'wunderpaint' ) }
					</span>
				</div>
			) }
			{ files && archives.length > 0 && 0 === list.length && (
				<span className="tray-hint">
					{ query
						? __( 'No matching images found.', 'wunderpaint' )
						: __(
								'No images found in this folder.',
								'wunderpaint'
						  ) }
				</span>
			) }
			{ visible.map( ( rec ) => (
				<button
					key={ `${ rec.archiveId }::${ rec.path }` }
					ref={ tileRef }
					data-path={ rec.path }
					data-archive={ rec.archiveId }
					data-thumb={ rec.thumb || rec.broken ? '1' : '' }
					className="tray-tile tray-tile-labeled"
					title={ titleOf( rec ) }
					{ ...tileProps( archiveAsset( rec ), () => use( rec ) ) }
				>
					<span className="tray-tile-preview">
						{ rec.thumb ? (
							<img src={ rec.thumb } alt="" draggable={ false } />
						) : (
							<span
								className={ `archive-ph${
									rec.broken ? ' is-broken' : ''
								}` }
							/>
						) }
					</span>
					<span className="tray-tile-name">{ rec.name }</span>
				</button>
			) ) }
			<FolderInput inputRef={ inputRef } onChange={ onPicked } />
		</div>
	);
}
