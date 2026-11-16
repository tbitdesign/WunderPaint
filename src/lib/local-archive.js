/**
 * Local archive (v1.431.0): a folder on the visitor's own machine, connected
 * once and browsed from the Asset Library like any other section.
 *
 * The folder is read in place. Nothing is uploaded and nothing is copied:
 * the browser keeps an INDEX (path, size, modification time) and a small
 * preview per image in IndexedDB, the originals stay on disk and are read
 * only when one is inserted - through the same path as File > Place.
 *
 * Two ways to reach a folder, chosen by what the browser offers:
 *
 *   handle    Chromium: `showDirectoryPicker()` hands over a directory
 *             handle that survives in IndexedDB. The next visit asks once
 *             for permission (or never, once the visitor allowed it for
 *             every visit) and the folder is read again, without a dialog.
 *   snapshot  Every desktop browser: a folder picked through
 *             `<input webkitdirectory>` or dropped onto the section gives
 *             the files of THIS session only. The index and the previews
 *             stay, so the archive is browsable after a reload; inserting an
 *             original then asks for the folder once more, and picking the
 *             same folder refreshes the archive instead of adding a second.
 *
 * The module is host-neutral: it runs in the WordPress plugin and in the
 * standalone studio alike and talks to no server of ours. HEIC/RAW are left
 * out on purpose (browsers cannot decode them), so is mobile (no folder
 * picker there, and the editor is a desktop tool).
 */

import { loadImage } from '../store/document';
import { createCanvas } from './raster/env';

/* -------------------------------- paths -------------------------------- */

/** What browsers decode: the formats worth indexing. */
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|svg|bmp)$/i;

/** Names that are never an image the visitor wants to see. */
const LITTER = new Set( [ '__MACOSX', 'Thumbs.db', 'desktop.ini' ] );

/**
 * Is this file name an image the browser can show?
 *
 * @param {string} name File name.
 * @return {boolean} Image?
 */
export function isImageName( name ) {
	return IMAGE_EXT.test( String( name || '' ) );
}

/**
 * Hidden files and OS litter, anywhere in the path.
 *
 * @param {string} path Relative path with `/` separators.
 * @return {boolean} Hidden?
 */
export function isHiddenPath( path ) {
	return String( path || '' )
		.split( '/' )
		.some( ( seg ) => seg.startsWith( '.' ) || LITTER.has( seg ) );
}

/**
 * Name and folder of a relative path.
 *
 * @param {string} path Relative path.
 * @return {{name: string, dir: string}} Parts.
 */
export function splitPath( path ) {
	const i = path.lastIndexOf( '/' );
	return i < 0
		? { name: path, dir: '' }
		: { name: path.slice( i + 1 ), dir: path.slice( 0, i ) };
}

/**
 * The files of a folder picked through `<input webkitdirectory>`: their
 * relative paths start with the folder's own name, which becomes the
 * archive name and is stripped from every path.
 *
 * @param {ArrayLike<File>} fileList Files from the input or a drop.
 * @return {{rootName: string, entries: Array<{path: string, file: File}>}} Root and image entries.
 */
export function entriesFromFileList( fileList ) {
	const files = Array.from( fileList || [] );
	let rootName = '';
	const entries = [];
	for ( const file of files ) {
		const rel = file.webkitRelativePath || '';
		let path = file.name;
		if ( rel.includes( '/' ) ) {
			const cut = rel.indexOf( '/' );
			rootName = rootName || rel.slice( 0, cut );
			path = rel.slice( cut + 1 );
		}
		if ( ! path || isHiddenPath( path ) || ! isImageName( path ) ) {
			continue;
		}
		entries.push( { path, file } );
	}
	return { rootName, entries };
}

/**
 * The index record of one entry: what browsing and change detection need,
 * nothing heavy. The preview is added later, when the tile scrolls into
 * view.
 *
 * @param {{path: string, file: File}} entry Entry.
 * @return {Object} Index record without archive id.
 */
export function describeEntry( entry ) {
	const { name, dir } = splitPath( entry.path );
	return {
		path: entry.path,
		name,
		dir,
		size: entry.file.size,
		mtime: entry.file.lastModified || 0,
		type: entry.file.type || '',
	};
}

/**
 * Reconcile the stored index with a fresh listing. A file with the same
 * path, size and modification time is the same file and keeps its record
 * (and preview); a changed one is re-indexed; a missing one is dropped.
 *
 * @param {Object[]}                          existing Stored records.
 * @param {Array<{path: string, file: File}>} entries  Fresh listing.
 * @return {{keep: Object[], add: Object[], remove: string[]}} Plan.
 */
export function diffIndex( existing, entries ) {
	const byPath = new Map( existing.map( ( r ) => [ r.path, r ] ) );
	const keep = [];
	const add = [];
	for ( const entry of entries ) {
		const old = byPath.get( entry.path );
		byPath.delete( entry.path );
		if (
			old &&
			old.size === entry.file.size &&
			old.mtime === ( entry.file.lastModified || 0 )
		) {
			keep.push( old );
		} else {
			add.push( describeEntry( entry ) );
		}
	}
	return { keep, add, remove: Array.from( byPath.keys() ) };
}

/**
 * Newest first; with a query, every word must occur in the name or the
 * folder (case-insensitive).
 *
 * @param {Object[]} records Index records.
 * @param {string}   query   Search words.
 * @return {Object[]} Sorted, filtered copy.
 */
export function filterFiles( records, query ) {
	const words = String( query || '' )
		.toLowerCase()
		.split( /\s+/ )
		.filter( Boolean );
	const list = words.length
		? records.filter( ( r ) => {
				const hay = `${ r.dir }/${ r.name }`.toLowerCase();
				return words.every( ( w ) => hay.includes( w ) );
		  } )
		: records.slice();
	return list.sort(
		( a, b ) =>
			( b.mtime || 0 ) - ( a.mtime || 0 ) ||
			String( a.name ).localeCompare( String( b.name ) )
	);
}

/* ---------------------------- browser access --------------------------- */

/** Does this browser hand out directory handles that survive a reload? */
export function canPickDirectory() {
	return (
		'undefined' !== typeof window &&
		'function' === typeof window.showDirectoryPicker
	);
}

/**
 * Open the native directory picker (Chromium). Rejects with AbortError
 * when the visitor cancels.
 *
 * @return {Promise<FileSystemDirectoryHandle>} The folder.
 */
export function pickDirectoryHandle() {
	return window.showDirectoryPicker( { id: 'wpie-archive', mode: 'read' } );
}

/**
 * Walk a directory handle and collect its image files as entries with the
 * File objects (size and modification time come from them).
 *
 * @param {FileSystemDirectoryHandle} dir    Folder.
 * @param {string}                    [base] Path prefix while recursing.
 * @param {Object}                    [out]  Accumulator.
 * @return {Promise<Array<{path: string, file: File, handle: FileSystemFileHandle}>>} Entries.
 */
export async function entriesFromHandle( dir, base = '', out = [] ) {
	for await ( const [ name, handle ] of dir.entries() ) {
		const path = base ? `${ base }/${ name }` : name;
		if ( isHiddenPath( name ) ) {
			continue;
		}
		if ( 'directory' === handle.kind ) {
			await entriesFromHandle( handle, path, out );
		} else if ( isImageName( name ) ) {
			try {
				const file = await handle.getFile();
				out.push( { path, file, handle } );
			} catch ( e ) {
				// Unreadable entry (locked, vanished mid-walk): skip it.
			}
		}
	}
	return out;
}

/** Resolve a relative path below a directory handle to its File. */
async function fileFromHandlePath( dir, path ) {
	const segs = path.split( '/' );
	const name = segs.pop();
	let cur = dir;
	for ( const seg of segs ) {
		cur = await cur.getDirectoryHandle( seg );
	}
	const fh = await cur.getFileHandle( name );
	return fh.getFile();
}

/**
 * The files of a folder DROPPED onto the page, through the older entry
 * API every desktop browser has (`webkitGetAsEntry`). Reads whole
 * directory trees; `readEntries` hands out batches and must be called
 * until it returns an empty one.
 *
 * @param {FileSystemEntry} entry  Dropped entry.
 * @param {string}          [base] Path prefix while recursing.
 * @param {Object[]}        [out]  Accumulator.
 * @return {Promise<Array<{path: string, file: File}>>} Image entries.
 */
export async function entriesFromDroppedEntry( entry, base = '', out = [] ) {
	if ( ! entry || isHiddenPath( entry.name ) ) {
		return out;
	}
	const path = base ? `${ base }/${ entry.name }` : entry.name;
	if ( entry.isFile ) {
		if ( isImageName( entry.name ) ) {
			const file = await new Promise( ( resolve ) =>
				entry.file( resolve, () => resolve( null ) )
			);
			if ( file ) {
				out.push( { path, file } );
			}
		}
		return out;
	}
	if ( entry.isDirectory ) {
		const reader = entry.createReader();
		for (;;) {
			const batch = await new Promise( ( resolve ) =>
				reader.readEntries( resolve, () => resolve( [] ) )
			);
			if ( ! batch.length ) {
				break;
			}
			for ( const child of batch ) {
				await entriesFromDroppedEntry( child, path, out );
			}
		}
	}
	return out;
}

/**
 * Sort a drop into what the library can connect: a directory handle where
 * the browser gives one (Chromium, survives a reload), otherwise the
 * dropped folder's files for this session. Call it synchronously from the
 * drop handler: the DataTransfer items are gone after the first await.
 *
 * @param {DataTransfer} dataTransfer The drop's transfer.
 * @return {Promise<{handle?: FileSystemDirectoryHandle, rootName?: string, entries?: Array<{path: string, file: File}>}|null>} What to connect, or null when nothing usable was dropped.
 */
export function readDroppedFolder( dataTransfer ) {
	const items = Array.from( dataTransfer?.items || [] ).filter(
		( item ) => 'file' === item.kind
	);
	if ( ! items.length ) {
		return Promise.resolve( null );
	}
	// Both lookups must happen before any await.
	const handlePromises = items.map( ( item ) =>
		'function' === typeof item.getAsFileSystemHandle
			? item.getAsFileSystemHandle().catch( () => null )
			: Promise.resolve( null )
	);
	const entries = items.map( ( item ) =>
		'function' === typeof item.webkitGetAsEntry
			? item.webkitGetAsEntry()
			: null
	);
	return ( async () => {
		const handles = await Promise.all( handlePromises );
		const dirHandle = handles.find( ( h ) => h && 'directory' === h.kind );
		if ( dirHandle ) {
			return { handle: dirHandle };
		}
		const dirEntry = entries.find( ( e ) => e && e.isDirectory );
		if ( dirEntry ) {
			const list = await entriesFromDroppedEntry( dirEntry );
			// Paths carry the folder's own name in front; strip it like
			// the picker does.
			const cut = dirEntry.name.length + 1;
			return {
				rootName: dirEntry.name,
				entries: list.map( ( e ) => ( {
					path: e.path.slice( cut ),
					file: e.file,
				} ) ),
			};
		}
		return null;
	} )();
}

/* -------------------------------- previews ----------------------------- */

/**
 * Long edge of a stored preview, in pixels. The tiles that show it are
 * 120px wide, so this is the smallest size that is never scaled up; at
 * WebP quality 0.8 a preview weighs a few kilobytes.
 */
export const THUMB_SIZE = 128;

/**
 * A small preview of an image file, as a data URL, plus the image's natural
 * size. WebP where the browser can encode it, JPEG otherwise (Safari before
 * 16 answers a WebP request with PNG, which the prefix check catches).
 * Transparent areas land on a light ground.
 *
 * @param {File} file Image file.
 * @return {Promise<{thumb: string, w: number, h: number}>} Preview.
 */
export async function makeThumb( file ) {
	const url = URL.createObjectURL( file );
	try {
		const img = await loadImage( url );
		const iw = img.naturalWidth || img.width || 1;
		const ih = img.naturalHeight || img.height || 1;
		const scale = Math.min( 1, THUMB_SIZE / Math.max( iw, ih ) );
		const w = Math.max( 1, Math.round( iw * scale ) );
		const h = Math.max( 1, Math.round( ih * scale ) );
		const canvas = createCanvas( w, h );
		const ctx = canvas.getContext( '2d' );
		ctx.fillStyle = '#e9ebef';
		ctx.fillRect( 0, 0, w, h );
		ctx.drawImage( img, 0, 0, w, h );
		let thumb = canvas.toDataURL( 'image/webp', 0.8 );
		if ( ! thumb.startsWith( 'data:image/webp' ) ) {
			thumb = canvas.toDataURL( 'image/jpeg', 0.8 );
		}
		return { thumb, w: iw, h: ih };
	} finally {
		URL.revokeObjectURL( url );
	}
}

/* -------------------------------- storage ------------------------------ */

const DB_NAME = 'wpie-archive';
const DB_VERSION = 1;

/**
 * The store the library talks to. Two implementations, same shape:
 * IndexedDB in the browser, a Map for tests and for a browser that refuses
 * IndexedDB (private windows, cleared site data) - there the archive lives
 * for the session and is gone with the tab, which beats a broken section.
 */
export function createMemoryStore() {
	const archives = new Map();
	const files = new Map();
	const key = ( archiveId, path ) => `${ archiveId }::${ path }`;
	return {
		kind: 'memory',
		async listArchives() {
			return Array.from( archives.values() );
		},
		async putArchive( archive ) {
			archives.set( archive.id, archive );
		},
		async deleteArchive( id ) {
			archives.delete( id );
			for ( const [ k, rec ] of files ) {
				if ( rec.archiveId === id ) {
					files.delete( k );
				}
			}
		},
		async listFiles( archiveId ) {
			return Array.from( files.values() ).filter(
				( r ) => r.archiveId === archiveId
			);
		},
		async putFiles( records ) {
			for ( const r of records ) {
				files.set( key( r.archiveId, r.path ), r );
			}
		},
		async deleteFiles( archiveId, paths ) {
			for ( const p of paths ) {
				files.delete( key( archiveId, p ) );
			}
		},
	};
}

/**
 * IndexedDB: `archives` by id, `files` by [archiveId, path] with an index
 * on the archive. One connection, opened lazily and kept.
 *
 * @param {IDBFactory} idb window.indexedDB.
 */
export function createIdbStore( idb ) {
	let dbPromise = null;
	const open = () => {
		if ( ! dbPromise ) {
			dbPromise = new Promise( ( resolve, reject ) => {
				const req = idb.open( DB_NAME, DB_VERSION );
				req.onupgradeneeded = () => {
					const db = req.result;
					if ( ! db.objectStoreNames.contains( 'archives' ) ) {
						db.createObjectStore( 'archives', { keyPath: 'id' } );
					}
					if ( ! db.objectStoreNames.contains( 'files' ) ) {
						const s = db.createObjectStore( 'files', {
							keyPath: [ 'archiveId', 'path' ],
						} );
						s.createIndex( 'archive', 'archiveId' );
					}
				};
				req.onsuccess = () => {
					const db = req.result;
					// Another tab upgrading: let go so it can.
					db.onversionchange = () => {
						db.close();
						dbPromise = null;
					};
					resolve( db );
				};
				req.onerror = () => reject( req.error );
				req.onblocked = () => reject( new Error( 'blocked' ) );
			} ).catch( ( e ) => {
				dbPromise = null;
				throw e;
			} );
		}
		return dbPromise;
	};
	const request = ( r ) =>
		new Promise( ( resolve, reject ) => {
			r.onsuccess = () => resolve( r.result );
			r.onerror = () => reject( r.error );
		} );
	const done = ( tx ) =>
		new Promise( ( resolve, reject ) => {
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject( tx.error );
			tx.onabort = () => reject( tx.error || new Error( 'aborted' ) );
		} );
	// A browser that refuses to open the database (private window, blocked
	// site data) gets the memory store for the rest of the session: the
	// section keeps working, the archive just does not survive the tab.
	let fallback = null;
	const withDb = async ( run, viaMemory ) => {
		if ( fallback ) {
			return viaMemory( fallback );
		}
		let db;
		try {
			db = await open();
		} catch ( e ) {
			fallback = createMemoryStore();
			return viaMemory( fallback );
		}
		return run( db );
	};
	return {
		kind: 'idb',
		listArchives: () =>
			withDb(
				( db ) =>
					request(
						db
							.transaction( 'archives' )
							.objectStore( 'archives' )
							.getAll()
					),
				( m ) => m.listArchives()
			),
		putArchive: ( archive ) =>
			withDb(
				async ( db ) => {
					const tx = db.transaction( 'archives', 'readwrite' );
					tx.objectStore( 'archives' ).put( archive );
					await done( tx );
				},
				( m ) => m.putArchive( archive )
			),
		deleteArchive: ( id ) =>
			withDb(
				async ( db ) => {
					const tx = db.transaction(
						[ 'archives', 'files' ],
						'readwrite'
					);
					tx.objectStore( 'archives' ).delete( id );
					const files = tx.objectStore( 'files' );
					const keys = await request(
						files.index( 'archive' ).getAllKeys( id )
					);
					for ( const k of keys ) {
						files.delete( k );
					}
					await done( tx );
				},
				( m ) => m.deleteArchive( id )
			),
		listFiles: ( archiveId ) =>
			withDb(
				( db ) =>
					request(
						db
							.transaction( 'files' )
							.objectStore( 'files' )
							.index( 'archive' )
							.getAll( archiveId )
					),
				( m ) => m.listFiles( archiveId )
			),
		putFiles: ( records ) =>
			records.length
				? withDb(
						async ( db ) => {
							const tx = db.transaction( 'files', 'readwrite' );
							const s = tx.objectStore( 'files' );
							for ( const r of records ) {
								s.put( r );
							}
							await done( tx );
						},
						( m ) => m.putFiles( records )
				  )
				: Promise.resolve(),
		deleteFiles: ( archiveId, paths ) =>
			paths.length
				? withDb(
						async ( db ) => {
							const tx = db.transaction( 'files', 'readwrite' );
							const s = tx.objectStore( 'files' );
							for ( const p of paths ) {
								s.delete( [ archiveId, p ] );
							}
							await done( tx );
						},
						( m ) => m.deleteFiles( archiveId, paths )
				  )
				: Promise.resolve(),
	};
}

/* -------------------------------- library ------------------------------ */

const newId = () =>
	`a${ Date.now().toString( 36 ) }${ Math.random()
		.toString( 36 )
		.slice( 2, 8 ) }`;

/**
 * Fired on window whenever an archive is connected, re-read or removed, so
 * the tray and the library dialog stay in step without knowing each other.
 */
export const ARCHIVE_EVENT = 'wpie:archive-changed';

const notify = () => {
	try {
		window.dispatchEvent( new window.CustomEvent( ARCHIVE_EVENT ) );
	} catch ( e ) {
		// No window (tests without DOM): nobody to tell.
	}
};

/**
 * The archive library: archives, their indexes, the session's File
 * objects and preview generation, over a store.
 *
 * @param {Object}   opts             Options.
 * @param {Object}   opts.store       Store (memory or IndexedDB).
 * @param {Function} [opts.makeThumb] Preview maker (injected in tests).
 * @param {Function} [opts.now]       Clock.
 */
export function createArchiveLibrary( {
	store,
	makeThumb: thumbFn = makeThumb,
	now = () => Date.now(),
} ) {
	/** archiveId -> Map( path -> File | FileSystemFileHandle ). */
	const session = new Map();
	/** In-flight preview jobs, keyed archiveId\0path. */
	const inflight = new Map();

	const sessionMap = ( id ) => {
		if ( ! session.has( id ) ) {
			session.set( id, new Map() );
		}
		return session.get( id );
	};

	/** Apply a fresh listing to an archive (new or existing). */
	async function applyListing( archive, entries ) {
		const existing = archive.count
			? await store.listFiles( archive.id )
			: [];
		const { keep, add, remove } = diffIndex( existing, entries );
		const records = add.map( ( r ) => ( { ...r, archiveId: archive.id } ) );
		await store.deleteFiles( archive.id, remove );
		await store.putFiles( records );
		const next = {
			...archive,
			count: keep.length + records.length,
			updated: now(),
		};
		await store.putArchive( next );
		const map = sessionMap( archive.id );
		map.clear();
		for ( const e of entries ) {
			map.set( e.path, e.handle || e.file );
		}
		notify();
		return next;
	}

	async function findByHandle( handle ) {
		for ( const a of await store.listArchives() ) {
			if ( a.handle && 'function' === typeof a.handle.isSameEntry ) {
				try {
					if ( await a.handle.isSameEntry( handle ) ) {
						return a;
					}
				} catch ( e ) {
					// A handle from another origin/profile: not the same.
				}
			}
		}
		return null;
	}

	async function findByName( name ) {
		return (
			( await store.listArchives() ).find(
				( a ) => 'snapshot' === a.mode && a.name === name
			) || null
		);
	}

	const lib = {
		store,

		listArchives: () => store.listArchives(),

		listFiles: ( archiveId ) => store.listFiles( archiveId ),

		/**
		 * Connect (or refresh) a folder from a picked/dropped file list.
		 *
		 * @param {ArrayLike<File>|{rootName: string, entries: Object[]}} picked Files or prepared entries.
		 * @return {Promise<Object>} The archive.
		 */
		async connectFiles( picked ) {
			const { rootName, entries } =
				picked && Array.isArray( picked.entries )
					? picked
					: entriesFromFileList( picked );
			if ( ! entries.length ) {
				throw new Error( 'empty' );
			}
			const name = rootName || 'Folder';
			const known = await findByName( name );
			const archive = known || {
				id: newId(),
				name,
				mode: 'snapshot',
				added: now(),
				updated: now(),
				count: 0,
			};
			return applyListing( archive, entries );
		},

		/**
		 * Connect (or refresh) a folder from a directory handle.
		 *
		 * @param {FileSystemDirectoryHandle} handle Folder.
		 * @return {Promise<Object>} The archive.
		 */
		async connectHandle( handle ) {
			const known = await findByHandle( handle );
			const archive = known || {
				id: newId(),
				name: handle.name || 'Folder',
				mode: 'handle',
				handle,
				added: now(),
				updated: now(),
				count: 0,
			};
			const entries = await entriesFromHandle( handle );
			return applyListing( { ...archive, handle }, entries );
		},

		/**
		 * Re-read a handle archive (permission already granted).
		 *
		 * @param {Object} archive Archive with a handle.
		 * @return {Promise<Object>} The refreshed archive.
		 */
		async rescan( archive ) {
			if ( ! archive.handle ) {
				return archive;
			}
			const entries = await entriesFromHandle( archive.handle );
			return applyListing( archive, entries );
		},

		hasSession( archiveId ) {
			return ( session.get( archiveId )?.size || 0 ) > 0;
		},

		/**
		 * Can the folder be read right now? `granted` reads without a
		 * dialog, `prompt` needs a click (permission or picking again).
		 *
		 * @param {Object} archive Archive.
		 * @return {Promise<'granted'|'prompt'>} State.
		 */
		async permissionState( archive ) {
			if ( archive.handle ) {
				try {
					const s = await archive.handle.queryPermission( {
						mode: 'read',
					} );
					return 'granted' === s ? 'granted' : 'prompt';
				} catch ( e ) {
					return 'prompt';
				}
			}
			return lib.hasSession( archive.id ) ? 'granted' : 'prompt';
		},

		/**
		 * Ask the browser for read access again (handle archives). Must
		 * run from a user gesture.
		 *
		 * @param {Object} archive Archive.
		 * @return {Promise<boolean>} Granted?
		 */
		async requestPermission( archive ) {
			if ( ! archive.handle ) {
				return false;
			}
			try {
				const s = await archive.handle.requestPermission( {
					mode: 'read',
				} );
				return 'granted' === s;
			} catch ( e ) {
				return false;
			}
		},

		/**
		 * The original file, when it is at hand: from this session's
		 * listing, or resolved through the directory handle.
		 *
		 * @param {string} archiveId Archive.
		 * @param {string} path      Relative path.
		 * @return {Promise<File|null>} File or null.
		 */
		async getFile( archiveId, path ) {
			const held = session.get( archiveId )?.get( path );
			if ( held ) {
				try {
					return 'function' === typeof held.getFile
						? await held.getFile()
						: held;
				} catch ( e ) {
					return null;
				}
			}
			const archive = ( await store.listArchives() ).find(
				( a ) => a.id === archiveId
			);
			if ( ! archive?.handle ) {
				return null;
			}
			try {
				if (
					'granted' !==
					( await archive.handle.queryPermission( { mode: 'read' } ) )
				) {
					return null;
				}
				return await fileFromHandlePath( archive.handle, path );
			} catch ( e ) {
				return null;
			}
		},

		/**
		 * The record with its preview, generating and storing the preview
		 * on first request. Without the original at hand the record comes
		 * back as is.
		 *
		 * @param {string} archiveId Archive.
		 * @param {string} path      Relative path.
		 * @return {Promise<Object|null>} Record.
		 */
		async ensureThumb( archiveId, path ) {
			const k = `${ archiveId }::${ path }`;
			if ( inflight.has( k ) ) {
				return inflight.get( k );
			}
			const job = ( async () => {
				const records = await store.listFiles( archiveId );
				const rec = records.find( ( r ) => r.path === path );
				if ( ! rec || rec.thumb ) {
					return rec || null;
				}
				const file = await lib.getFile( archiveId, path );
				if ( ! file ) {
					return rec;
				}
				let made;
				try {
					made = await thumbFn( file );
				} catch ( e ) {
					// Undecodable file: remember that, so the tile stops
					// asking on every scroll.
					made = { thumb: '', w: 0, h: 0, broken: true };
				}
				const next = { ...rec, ...made };
				await store.putFiles( [ next ] );
				return next;
			} )().finally( () => inflight.delete( k ) );
			inflight.set( k, job );
			return job;
		},

		/**
		 * The original file for an insert: like getFile, but a remembered
		 * folder that needs permission again is asked for it. Call it from
		 * a click or drop, the browser wants a gesture for the question.
		 *
		 * @param {string} archiveId Archive.
		 * @param {string} path      Relative path.
		 * @return {Promise<File|null>} File or null.
		 */
		async openFile( archiveId, path ) {
			const file = await lib.getFile( archiveId, path );
			if ( file ) {
				return file;
			}
			const archive = ( await store.listArchives() ).find(
				( a ) => a.id === archiveId
			);
			if ( ! archive?.handle ) {
				return null;
			}
			if ( ! ( await lib.requestPermission( archive ) ) ) {
				return null;
			}
			return lib.getFile( archiveId, path );
		},

		async disconnect( archiveId ) {
			await store.deleteArchive( archiveId );
			session.delete( archiveId );
			notify();
		},
	};
	return lib;
}

/* ------------------------------ the instance --------------------------- */

let instance = null;

/**
 * The shared library, over IndexedDB when the browser has it and lets us
 * open it, over memory otherwise.
 *
 * @return {Object} Library.
 */
export function archiveLibrary() {
	if ( ! instance ) {
		let store;
		try {
			store = window.indexedDB
				? createIdbStore( window.indexedDB )
				: createMemoryStore();
		} catch ( e ) {
			store = createMemoryStore();
		}
		instance = createArchiveLibrary( { store } );
	}
	return instance;
}
