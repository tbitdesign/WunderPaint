/**
 * Autosave & crash recovery (v0.2): a throttled snapshot of the serialized
 * document goes to IndexedDB while the editor is dirty; on boot a fresher
 * record than the last save offers a restore. The storage backend is
 * injectable (memory adapter in tests).
 */

const DB_NAME = 'wpie-autosave';
const STORE = 'sessions';
export const AUTOSAVE_INTERVAL = 30000;

/* ---------------------------- storage adapters -------------------------- */

const indexedDbAdapter = {
	_open() {
		return new Promise( ( resolve, reject ) => {
			const request = window.indexedDB.open( DB_NAME, 1 );
			request.onupgradeneeded = () =>
				request.result.createObjectStore( STORE );
			request.onsuccess = () => resolve( request.result );
			request.onerror = () => reject( request.error );
		} );
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
};

export const memoryAdapter = () => {
	const map = new Map();
	return {
		get: async ( key ) => map.get( key ) ?? null,
		set: async ( key, value ) => void map.set( key, value ),
		remove: async ( key ) => void map.delete( key ),
	};
};

/* -------------------------------- session ------------------------------- */

export const sessionKey = ( attachmentId ) => `wpie:${ attachmentId || 'new' }`;

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
 */
export function createAutosave( {
	attachmentId,
	getSnapshot,
	adapter = null,
	interval = AUTOSAVE_INTERVAL,
	now = () => Date.now(),
} ) {
	const storage = adapter || indexedDbAdapter;
	const key = sessionKey( attachmentId );
	let timer = null;
	let lastWrite = 0;

	const write = async () => {
		const snapshot = getSnapshot();
		if ( ! snapshot ) {
			return false;
		}
		await storage.set( key, { ts: now(), ...snapshot } );
		lastWrite = now();
		return true;
	};

	return {
		key,
		/** Start the periodic loop. */
		start() {
			if ( ! timer ) {
				timer = setInterval( write, interval );
			}
		},
		stop() {
			if ( timer ) {
				clearInterval( timer );
				timer = null;
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
		/** The stored session, or null. */
		load: () => storage.get( key ),
		/** Drop the session (after a successful library save / clean exit). */
		clear: () => storage.remove( key ),
	};
}
