/**
 * The tabs record of a previous visit: which parked documents come back,
 * how many fit, and what stays in the record meanwhile. Pure, so the rules
 * can be tested without mounting the editor (app.jsx wires them).
 */

/**
 * Parked documents worth offering: those with a snapshot that are not the
 * attachment this page is already editing, and not the ACTIVE one when the
 * autosave brings that one back into the current tab.
 *
 * "When": the autosave of this page reads ONE key - the page's attachment,
 * or the window's new-document key. The active tab of the last visit is
 * covered by it only when it had the same identity: the same attachment
 * (already excluded by the last test), or a new document on a page that
 * boots new (the window id survives a reload). An active tab of any OTHER
 * identity used to be dropped here too, on the strength of the sentence
 * above - its autosave lay under a key nobody read, and the work was gone
 * from every offer (Codex C02). It comes back from its tab snapshot now.
 *
 * @param {Object} record       The stored tabs record.
 * @param {number} attachmentId The page's own attachment (0 for new).
 * @return {Array} Candidates.
 */
export function restoreCandidates( record, attachmentId ) {
	const coveredByAutosave = ( t ) =>
		attachmentId ? t.attachmentId === attachmentId : ! t.attachmentId;
	return ( record?.tabs || [] ).filter(
		( t ) =>
			t.snap &&
			! ( t.active && coveredByAutosave( t ) ) &&
			! ( attachmentId && t.attachmentId === attachmentId )
	);
}

/**
 * Split candidates into the ones that fit next to the open tabs and the
 * rest. A document already open as a tab is never duplicated (v1.130.2);
 * the cap is the same number that limits opening.
 *
 * @param {Array}  candidates From restoreCandidates().
 * @param {Array}  open       The tabs open right now.
 * @param {number} max        Open documents at once.
 * @return {{taken: Array, leftover: Array}} Restored now, kept for later.
 */
export function takeCandidates( candidates, open, max ) {
	const fresh = candidates.filter(
		( t ) =>
			! t.attachmentId ||
			! open.some( ( p ) => p.attachmentId === t.attachmentId )
	);
	const room = Math.max( 0, max - open.length );
	return { taken: fresh.slice( 0, room ), leftover: fresh.slice( room ) };
}

/**
 * Records of windows that are gone. Every open window writes its tab record
 * at least every 20 seconds (background tabs are throttled to about once a
 * minute), so a record older than `stale` has no window behind it any more:
 * crashed, or closed with work unsaved - the same thing to the person coming
 * back. A window that closes normally marks its record `closed`, which
 * counts at once. The pre-fix keys without a window id (`wpie:new`,
 * `wpie-tabs:new`) are one more such window.
 *
 * For each orphan: its tab entries with a snapshot, and its autosave record
 * as the copy of the document that was active there (the fresher one, so the
 * `active` tab entry yields to it). Own window and live windows are skipped.
 *
 * @param {Array}  keys      Keys of the store.
 * @param {Object} records   Key → record for those keys.
 * @param {Object} o         Options.
 * @param {string} o.own     This window's id.
 * @param {number} o.now     The clock.
 * @param {number} [o.stale] Age after which a record has no window (ms).
 * @return {Array} [ { keys, candidates } ] per orphan window.
 */
export function orphanSessions( keys, records, { own, now, stale = 180000 } ) {
	const sessions = new Map();
	const sessionOf = ( sid ) => {
		if ( ! sessions.has( sid ) ) {
			sessions.set( sid, { autosave: null, tabs: null } );
		}
		return sessions.get( sid );
	};
	for ( const key of keys ) {
		let m = /^wpie:new(?::(.+))?$/.exec( key );
		if ( m ) {
			sessionOf( m[ 1 ] || '' ).autosave = key;
			continue;
		}
		m = /^wpie-tabs:new(?::(.+))?$/.exec( key );
		if ( m ) {
			sessionOf( m[ 1 ] || '' ).tabs = key;
		}
	}
	const out = [];
	for ( const [ sid, s ] of sessions ) {
		if ( sid === own ) {
			continue;
		}
		const tabsRec = s.tabs ? records[ s.tabs ] : null;
		const autoRec = s.autosave ? records[ s.autosave ] : null;
		const newest = Math.max( tabsRec?.ts || 0, autoRec?.ts || 0 );
		if ( ! tabsRec?.closed && newest > now - stale ) {
			continue;
		}
		const candidates = [];
		const hasActiveCopy = !! ( autoRec && autoRec.doc );
		for ( const t of tabsRec?.tabs || [] ) {
			if ( ! t.snap || ( t.active && hasActiveCopy ) ) {
				continue;
			}
			candidates.push( { ...t, active: false, dirty: true } );
		}
		if ( hasActiveCopy ) {
			candidates.push( {
				name: autoRec.doc.name || '',
				dims: `${ autoRec.doc.w }×${ autoRec.doc.h }`,
				attachmentId: 0,
				dirty: true,
				snap: {
					doc: autoRec.doc,
					layers: autoRec.layers || [],
					pages: autoRec.pages || null,
					currentPage: autoRec.currentPage ?? 0,
				},
			} );
		}
		out.push( {
			keys: [ s.autosave, s.tabs ].filter( Boolean ),
			candidates,
		} );
	}
	return out;
}

/**
 * The entries of the next record write, with the leftovers of the previous
 * visit appended so they survive until restored - minus any whose
 * attachment is open by now.
 *
 * @param {Array} entries   Entries for the open tabs.
 * @param {Array} leftovers Not yet restored candidates.
 * @return {Array} Entries to write.
 */
export function withLeftovers( entries, leftovers ) {
	if ( ! leftovers || ! leftovers.length ) {
		return entries;
	}
	const open = new Set(
		entries.map( ( e ) => e.attachmentId ).filter( Boolean )
	);
	return [
		...entries,
		...leftovers.filter(
			( t ) => ! t.attachmentId || ! open.has( t.attachmentId )
		),
	];
}
