/**
 * Where a project lives.
 *
 * Two places, for two different jobs. The work in progress goes to
 * IndexedDB after every stroke, because losing an hour of drawing to a
 * closed tab would be unforgivable and the editor's own key-value store
 * is capped at 32 KB, which a full alphabet passes long before it is
 * finished.
 *
 * The finished project goes inside the font file, in a private table.
 * That makes the font its own project file: it can be reopened on
 * another machine, handed to somebody else, or recovered from the site
 * it was installed on, all without a second store to keep in step.
 *
 * Points are stored as flat integer arrays rather than objects. It is a
 * small change that roughly halves the payload before compression even
 * starts, and compression is what decides whether the private table is
 * a rounding error on the font or a burden on every page that uses it.
 */

import { PROJECT_TAG } from './fontbuild.js';
import { readProjectBytes } from './fontread.js';

const MAGIC = [ 0x57, 0x50, 0x48, 0x46 ]; // "WPHF"
const FORMAT = 1;
const DB_NAME = 'wpie-handwriting-fonts';
const DB_STORE = 'projects';

/** Pressure is stored in whole percent; the eye cannot see finer. */
const packPressure = ( p ) => Math.max( 0, Math.min( 100, Math.round( ( p ?? 0.5 ) * 100 ) ) );

/**
 * Flatten strokes to integer triples.
 *
 * @param {Array} strokes Strokes `{ w, pts }`.
 * @return {Array} Packed strokes `{ w, p: number[] }`.
 */
export function packStrokes( strokes ) {
	return ( strokes || [] ).map( ( st ) => {
		const flat = [];
		for ( const pt of st.pts || [] ) {
			flat.push( Math.round( pt.x ), Math.round( pt.y ), packPressure( pt.p ) );
		}
		return { w: Math.round( st.w ), p: flat };
	} );
}

/** The way back from flat triples to points. */
export function unpackStrokes( packed ) {
	return ( packed || [] ).map( ( st ) => {
		const pts = [];
		const flat = st.p || [];
		for ( let i = 0; i + 2 < flat.length; i += 3 ) {
			pts.push( { x: flat[ i ], y: flat[ i + 1 ], p: flat[ i + 2 ] / 100 } );
		}
		return { w: st.w, pts };
	} );
}

/** Flatten outline contours the same way. */
export function packContours( contours ) {
	return ( contours || [] ).map( ( ring ) => {
		const flat = [];
		for ( const p of ring ) {
			flat.push( Math.round( p.x ), Math.round( p.y ), false === p.on ? 0 : 1 );
		}
		return flat;
	} );
}

/** And back. */
export function unpackContours( packed ) {
	return ( packed || [] ).map( ( flat ) => {
		const ring = [];
		for ( let i = 0; i + 2 < flat.length; i += 3 ) {
			ring.push( { x: flat[ i ], y: flat[ i + 1 ], on: 1 === flat[ i + 2 ] } );
		}
		return ring;
	} );
}

/**
 * Thin a stroke out for storage.
 *
 * The drawing surface samples far more densely than the shape needs.
 * Removing points that sit within a fraction of a unit of the line they
 * are on costs nothing visible and is the difference between a project
 * that rides comfortably inside a font file and one that does not.
 *
 * @param {Array}  pts Points.
 * @param {number} tol Tolerance in units.
 * @return {Array} Thinned points.
 */
export function thinPoints( pts, tol = 2.5 ) {
	const src = pts || [];
	if ( src.length < 3 ) {
		return src.slice();
	}
	const keep = new Uint8Array( src.length );
	keep[ 0 ] = 1;
	keep[ src.length - 1 ] = 1;
	const stack = [ [ 0, src.length - 1 ] ];
	while ( stack.length ) {
		const [ a, b ] = stack.pop();
		let far = -1;
		let idx = -1;
		for ( let i = a + 1; i < b; i++ ) {
			const d = pointLine( src[ i ], src[ a ], src[ b ] );
			if ( d > far ) {
				far = d;
				idx = i;
			}
		}
		if ( far > tol && idx > 0 ) {
			keep[ idx ] = 1;
			stack.push( [ a, idx ], [ idx, b ] );
		}
	}
	return src.filter( ( _, i ) => keep[ i ] );
}

function pointLine( p, a, b ) {
	const vx = b.x - a.x;
	const vy = b.y - a.y;
	const len2 = vx * vx + vy * vy;
	let t = len2 > 0 ? ( ( p.x - a.x ) * vx + ( p.y - a.y ) * vy ) / len2 : 0;
	t = t < 0 ? 0 : t > 1 ? 1 : t;
	return Math.hypot( p.x - ( a.x + vx * t ), p.y - ( a.y + vy * t ) );
}

/** Strip a project down to what is worth storing. */
export function toStorable( project ) {
	const glyphs = {};
	for ( const key of Object.keys( project.glyphs || {} ) ) {
		const g = project.glyphs[ key ];
		if ( ! g ) {
			continue;
		}
		if ( 'scan' === g.src ) {
			glyphs[ key ] = {
				s: 1,
				c: packContours( g.contours ),
				nl: g.nudgeL || 0,
				nr: g.nudgeR || 0,
			};
		} else {
			const strokes = ( g.strokes || [] ).map( ( st ) => ( {
				w: st.w,
				pts: thinPoints( st.pts, 2.5 ),
			} ) );
			glyphs[ key ] = {
				s: 0,
				k: packStrokes( strokes ),
				nl: g.nudgeL || 0,
				nr: g.nudgeR || 0,
			};
		}
	}
	return {
		v: FORMAT,
		id: project.id,
		family: project.family,
		metrics: project.metrics,
		options: project.options,
		kerns: project.kerns || {},
		glyphs,
	};
}

/** And the way back into the shape the rest of the code expects. */
export function fromStorable( raw ) {
	const glyphs = {};
	for ( const key of Object.keys( raw.glyphs || {} ) ) {
		const g = raw.glyphs[ key ];
		if ( 1 === g.s ) {
			glyphs[ key ] = {
				src: 'scan',
				contours: unpackContours( g.c ),
				nudgeL: g.nl || 0,
				nudgeR: g.nr || 0,
			};
		} else {
			glyphs[ key ] = {
				src: 'draw',
				strokes: unpackStrokes( g.k ),
				nudgeL: g.nl || 0,
				nudgeR: g.nr || 0,
			};
		}
	}
	return {
		v: raw.v || FORMAT,
		id: raw.id,
		family: raw.family || 'My Handwriting',
		metrics: raw.metrics,
		options: raw.options,
		kerns: raw.kerns || {},
		glyphs,
	};
}

async function gzip( bytes ) {
	if ( 'undefined' === typeof CompressionStream ) {
		return null;
	}
	try {
		const cs = new CompressionStream( 'gzip' );
		const stream = new Blob( [ bytes ] ).stream().pipeThrough( cs );
		return new Uint8Array( await new Response( stream ).arrayBuffer() );
	} catch ( e ) {
		return null;
	}
}

async function gunzip( bytes ) {
	const ds = new DecompressionStream( 'gzip' );
	const stream = new Blob( [ bytes ] ).stream().pipeThrough( ds );
	return new Uint8Array( await new Response( stream ).arrayBuffer() );
}

/**
 * Encode a project for the private font table.
 *
 * @param {Object} project Project.
 * @return {Promise<Uint8Array>} Payload bytes.
 */
export async function encodeProject( project ) {
	const json = new TextEncoder().encode( JSON.stringify( toStorable( project ) ) );
	const packed = await gzip( json );
	const body = packed || json;
	const out = new Uint8Array( 6 + body.length );
	out.set( MAGIC, 0 );
	out[ 4 ] = FORMAT;
	out[ 5 ] = packed ? 1 : 0;
	out.set( body, 6 );
	return out;
}

/**
 * Decode a payload back into a project.
 *
 * @param {Uint8Array} bytes Payload bytes.
 * @return {Promise<Object|null>} Project, or null when it is not ours.
 */
export async function decodeProject( bytes ) {
	if ( ! bytes || bytes.length < 7 ) {
		return null;
	}
	for ( let i = 0; i < 4; i++ ) {
		if ( bytes[ i ] !== MAGIC[ i ] ) {
			return null;
		}
	}
	if ( bytes[ 4 ] > FORMAT ) {
		return null; // Written by a newer version than this one understands.
	}
	const body = bytes.subarray( 6 );
	const json = 1 === bytes[ 5 ] ? await gunzip( body ) : body;
	try {
		return fromStorable( JSON.parse( new TextDecoder().decode( json ) ) );
	} catch ( e ) {
		return null;
	}
}

/**
 * Pull the project out of a built font file.
 *
 * @param {Uint8Array} font Font file.
 * @return {Promise<Object|null>} Project, or null when the font has none.
 */
export async function projectFromFont( font ) {
	const payload = readProjectBytes( font );
	return payload ? decodeProject( payload ) : null;
}

/* ------------------------------ the draft ------------------------------- */

function openDb() {
	return new Promise( ( resolve, reject ) => {
		if ( 'undefined' === typeof indexedDB ) {
			reject( new Error( 'no indexeddb' ) );
			return;
		}
		const req = indexedDB.open( DB_NAME, 1 );
		req.onupgradeneeded = () => {
			const db = req.result;
			if ( ! db.objectStoreNames.contains( DB_STORE ) ) {
				db.createObjectStore( DB_STORE, { keyPath: 'id' } );
			}
		};
		req.onsuccess = () => resolve( req.result );
		req.onerror = () => reject( req.error );
	} );
}

function tx( db, mode, run ) {
	return new Promise( ( resolve, reject ) => {
		const t = db.transaction( DB_STORE, mode );
		const req = run( t.objectStore( DB_STORE ) );
		t.oncomplete = () => resolve( req ? req.result : undefined );
		t.onerror = () => reject( t.error );
	} );
}

/**
 * Save the draft. Failure is reported but never thrown at the drawing
 * loop, because a browser with storage switched off should still let
 * somebody finish an alphabet and install it.
 *
 * @param {string} id      Draft id.
 * @param {Object} project Project.
 * @return {Promise<boolean>} Whether it was stored.
 */
export async function saveDraft( id, project ) {
	try {
		const db = await openDb();
		await tx( db, 'readwrite', ( store ) =>
			store.put( {
				id,
				at: Date.now(),
				family: project.family,
				data: toStorable( project ),
			} )
		);
		db.close();
		return true;
	} catch ( e ) {
		return false;
	}
}

/**
 * Load a draft.
 *
 * @param {string} id Draft id.
 * @return {Promise<Object|null>} Project.
 */
export async function loadDraft( id ) {
	try {
		const db = await openDb();
		const row = await tx( db, 'readonly', ( store ) => store.get( id ) );
		db.close();
		return row && row.data ? fromStorable( row.data ) : null;
	} catch ( e ) {
		return null;
	}
}

/**
 * Every draft in this browser, newest first.
 *
 * @return {Promise<Array>} `{ id, family, at }` records.
 */
export async function listDrafts() {
	try {
		const db = await openDb();
		const rows = await tx( db, 'readonly', ( store ) => store.getAll() );
		db.close();
		return ( rows || [] )
			.map( ( r ) => ( { id: r.id, family: r.family, at: r.at } ) )
			.sort( ( a, b ) => b.at - a.at );
	} catch ( e ) {
		return [];
	}
}

/**
 * Remove a draft.
 *
 * @param {string} id Draft id.
 * @return {Promise<boolean>} Whether it was removed.
 */
export async function deleteDraft( id ) {
	try {
		const db = await openDb();
		await tx( db, 'readwrite', ( store ) => store.delete( id ) );
		db.close();
		return true;
	} catch ( e ) {
		return false;
	}
}

export { PROJECT_TAG };
