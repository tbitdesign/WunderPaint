/**
 * Autosave & crash recovery (v0.2): a throttled snapshot of the serialized
 * document goes to IndexedDB while the editor is dirty; on boot a fresher
 * record than the last save offers a restore. The storage backend is
 * injectable (memory adapter in tests).
 */

import { siteSession, siteStorage, siteSuffix } from './local-storage';
const LEGACY_DB = 'wpie-autosave';
const STORE = 'sessions';
// One database per site (see local-storage.js): two installations on one
// origin used to share every rescue copy and tab record.
const dbName = () => LEGACY_DB + siteSuffix();
let legacyMove = null;

/**
 * Move the records of the shared, pre-site database into this site's one,
 * once. The first site on the origin after the update takes them all -
 * they were one pile before too - and the old database goes.
 *
 * @param {IDBDatabase} target The site's database, open.
 * @return {Promise<void>}
 */
function moveLegacyRecords( target ) {
	if ( legacyMove ) {
		return legacyMove;
	}
	legacyMove = ( async () => {
		if ( ! siteSuffix() || siteStorage.getItem( 'wpie-autosave-moved' ) ) {
			return;
		}
		if ( 'function' === typeof window.indexedDB.databases ) {
			const list = await window.indexedDB.databases();
			if ( ! list.some( ( d ) => d.name === LEGACY_DB ) ) {
				siteStorage.setItem( 'wpie-autosave-moved', '1' );
				return;
			}
		}
		const legacy = await new Promise( ( resolve, reject ) => {
			const req = window.indexedDB.open( LEGACY_DB, 1 );
			req.onupgradeneeded = () => req.result.createObjectStore( STORE );
			req.onsuccess = () => resolve( req.result );
			req.onerror = () => reject( req.error );
		} );
		const rows = await new Promise( ( resolve, reject ) => {
			const out = [];
			const cursor = legacy
				.transaction( STORE, 'readonly' )
				.objectStore( STORE )
				.openCursor();
			cursor.onsuccess = () => {
				const c = cursor.result;
				if ( c ) {
					out.push( [ c.key, c.value ] );
					c.continue();
				} else {
					resolve( out );
				}
			};
			cursor.onerror = () => reject( cursor.error );
		} );
		legacy.close();
		if ( rows.length ) {
			await new Promise( ( resolve, reject ) => {
				const tx = target.transaction( STORE, 'readwrite' );
				const store = tx.objectStore( STORE );
				rows.forEach( ( [ key, value ] ) => store.put( value, key ) );
				tx.oncomplete = () => resolve();
				tx.onerror = () => reject( tx.error );
			} );
		}
		window.indexedDB.deleteDatabase( LEGACY_DB );
		siteStorage.setItem( 'wpie-autosave-moved', '1' );
	} )().catch( () => {} );
	return legacyMove;
}
export const AUTOSAVE_INTERVAL = 30000;
const EARLY_WRITE = 3000;
/** Records carry a format version from here on, so a later shape can be told apart. */
export const RECORD_VERSION = 1;
/** Older than this, a record is dropped on load. */
export const MAX_AGE = 30 * 24 * 60 * 60 * 1000;

/* ---------------------------- storage adapters -------------------------- */

const indexedDbAdapter = {
	async _open() {
		const db = await new Promise( ( resolve, reject ) => {
			const request = window.indexedDB.open( dbName(), 1 );
			request.onupgradeneeded = () =>
				request.result.createObjectStore( STORE );
			request.onsuccess = () => resolve( request.result );
			request.onerror = () => reject( request.error );
		} );
		await moveLegacyRecords( db );
		return db;
	},
	async get( key ) {
		const db = await this._open();
		return new Promise( ( resolve, reject ) => {
			const tx = db
				.transaction( STORE, 'readonly' )
				.objectStore( STORE )
				.get( key );
			tx.onsuccess = () => resolve( tx.result || null );
			tx.onerror = () => reject( tx.error );
		} ).finally( () => db.close() );
	},
	async set( key, value ) {
		const db = await this._open();
		return new Promise( ( resolve, reject ) => {
			const tx = db
				.transaction( STORE, 'readwrite' )
				.objectStore( STORE )
				.put( value, key );
			tx.onsuccess = () => resolve();
			tx.onerror = () => reject( tx.error );
		} ).finally( () => db.close() );
	},
	async remove( key ) {
		const db = await this._open();
		return new Promise( ( resolve, reject ) => {
			const tx = db
				.transaction( STORE, 'readwrite' )
				.objectStore( STORE )
				.delete( key );
			tx.onsuccess = () => resolve();
			tx.onerror = () => reject( tx.error );
		} ).finally( () => db.close() );
	},
	/** Every key in the store (the orphan sweep in app.jsx reads them). */
	async keys() {
		const db = await this._open();
		return new Promise( ( resolve, reject ) => {
			const tx = db
				.transaction( STORE, 'readonly' )
				.objectStore( STORE )
				.getAllKeys();
			tx.onsuccess = () => resolve( tx.result || [] );
			tx.onerror = () => reject( tx.error );
		} ).finally( () => db.close() );
	},
};

export const memoryAdapter = () => {
	const map = new Map();
	return {
		get: async ( key ) => map.get( key ) ?? null,
		set: async ( key, value ) => void map.set( key, value ),
		remove: async ( key ) => void map.delete( key ),
		keys: async () => [ ...map.keys() ],
	};
};

/* -------------------------------- session ------------------------------- */

const WINDOW_KEY = 'wpie-window';
let windowIdMemo = null;

/**
 * This browser tab's own id, for records that have no attachment to key on.
 * `wpie:new` used to be ONE key for every window on the "new document" page,
 * so two windows overwrote each other's rescue copies and tab records.
 * sessionStorage is per browser tab and survives its reloads - the common
 * crash recovery, a reload in the same tab, finds its own records under the
 * same id. A window that is gone leaves its records behind; the next window
 * on the page adopts them (orphanSessions in lib/tab-session.js).
 *
 * @return {string} The id.
 */
export function windowId() {
	if ( windowIdMemo ) {
		return windowIdMemo;
	}
	let id = siteSession.getItem( WINDOW_KEY ) || '';
	if ( ! id ) {
		id =
			Math.random().toString( 36 ).slice( 2, 10 ) +
			Date.now().toString( 36 );
		siteSession.setItem( WINDOW_KEY, id );
	}
	windowIdMemo = id;
	return id;
}

/** Test hook: forget the memoised window id. */
export function resetWindowId() {
	windowIdMemo = null;
}

export const NEW_PREFIX = 'wpie:new';
export const TABS_PREFIX = 'wpie-tabs:new';

export const sessionKey = ( attachmentId ) =>
	attachmentId ? `wpie:${ attachmentId }` : `${ NEW_PREFIX }:${ windowId() }`;

/** The tabs record's key: per attachment, or per window for new documents. */
export const tabsKeyFor = ( attachmentId ) =>
	attachmentId
		? `wpie-tabs:${ attachmentId }`
		: `${ TABS_PREFIX }:${ windowId() }`;

/**
 * Direct access to the IndexedDB store for other per-session records
 * (v1.110.0: the document-tab sessions persist through it).
 */
export const autosaveStorage = indexedDbAdapter;

/**
 * Autosave session controller.
 *
 * @param {Object}   options            Options.
 * @param {number}   options.attachmentId Attachment id (0 = new doc).
 * @param {Function} options.getSnapshot () => { doc, layers } | null when
 *                                       not dirty (skip).
 * @param {Object}   [options.adapter]  Storage adapter override.
 * @param {number}   [options.interval] Throttle ms.
 * @param {Function} [options.now]      Clock (tests).
 * @param {Function} [options.onError]  Called ONCE with the first write
 *                                       failure (storage blocked, quota).
 *                                       A silent autosave is worse than
 *                                       none: the user trusts it.
 */
export function createAutosave( {
	attachmentId,
	getSnapshot,
	adapter = null,
	interval = AUTOSAVE_INTERVAL,
	now = () => Date.now(),
	onError = null,
} ) {
	const storage = adapter || indexedDbAdapter;
	const key = sessionKey( attachmentId );
	let timer = null;
	let early = null;
	let lastWrite = 0;
	let warned = false;

	// Three answers, and they are not the same thing: null when there was
	// nothing to write (a clean document), true when the record is stored,
	// false when the store refused it. The language switch reads the third
	// one before it reloads; a false for "nothing to save" would make it ask
	// about a loss that cannot happen (Codex C15).
	const write = async () => {
		try {
			// getSnapshot() serializes the document; a throw there used to
			// escape the try, skip onError and kill the loop in silence.
			const snapshot = getSnapshot();
			if ( ! snapshot ) {
				return null;
			}
			await storage.set( key, {
				v: RECORD_VERSION,
				ts: now(),
				...snapshot,
			} );
		} catch ( err ) {
			if ( ! warned && 'function' === typeof onError ) {
				warned = true;
				onError( err );
			}
			return false;
		}
		lastWrite = now();
		return true;
	};

	return {
		key,
		/** Start the periodic loop. */
		start() {
			if ( ! timer ) {
				timer = setInterval( write, interval );
				// The first tick used to be a full interval away: thirty
				// seconds after every mount (a tab switch remounts) in which
				// nothing was written. One early write covers that window.
				early = setTimeout( write, Math.min( EARLY_WRITE, interval ) );
			}
		},
		stop() {
			if ( timer ) {
				clearInterval( timer );
				timer = null;
			}
			if ( early ) {
				clearTimeout( early );
				early = null;
			}
		},
		/** Immediate write, throttled to one per interval (manual triggers). */
		async poke() {
			if ( now() - lastWrite >= interval ) {
				return write();
			}
			return false;
		},
		writeNow: write,
		/** The stored session, or null; a record past its age is dropped. */
		load: async () => {
			const record = await storage.get( key );
			if ( record && record.ts && now() - record.ts > MAX_AGE ) {
				// Nothing ever removed old records, and a rescue copy from
				// months ago is not a rescue any more.
				storage.remove( key ).catch( () => {} );
				return null;
			}
			return record;
		},
		/** Drop the session (after a successful library save / clean exit). */
		clear: () => storage.remove( key ),
	};
}
