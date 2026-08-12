/**
 * Opening the stamp maker on a BRUSH TIP.
 *
 * The maker itself knows nothing about brushes: it edits a recipe. This is
 * the piece that decides what a recipe means here - a coverage mask, with
 * no colours to choose and no time to animate along - and where the result
 * ends up.
 *
 * It ends up on `doc.tips`, and that is the whole reason this file is not
 * three lines inside the panel. A saved design is the document serialised,
 * so a recipe stored there travels with the picture; a stroke records only
 * its tip's ID, and an ID whose recipe cannot be found comes back as Hard
 * Round without a word of complaint.
 */

import { __ } from '@wordpress/i18n';

import { createRoot } from '@wordpress/element';

import { I } from '../icons';
import { proBridge } from './pro-bridge';
import { emptyDoc, fromStored, STARTERS } from './stamp-doc';
import { promptDialog } from './dialogs';
import { openStampMaker } from './stamp-maker';

const NS = 'wpie-brush-tips';

/** Everything you saved in the maker, across documents. */
export async function readTipLibrary() {
	try {
		const all = await proBridge.storage.get( NS );
		return Array.isArray( all && all.tips ) ? all.tips : [];
	} catch ( e ) {
		return [];
	}
}

async function writeTipLibrary( list ) {
	try {
		const all = await proBridge.storage.get( NS );
		await proBridge.storage.set( NS, { ...all, tips: list } );
		return true;
	} catch ( e ) {
		return false;
	}
}

/**
 * Take a tip out of the library and into THIS document.
 *
 * Copied rather than referenced, and that is the whole point: a stroke
 * records only its tip's id, so a picture that used a library tip and did
 * not carry its recipe would come back as plain round strokes on any other
 * machine.
 *
 * @param {Object} editor The editor.
 * @param {Object} entry  A library entry { id, name, elements }.
 * @return {string} The tip id to select.
 */
export function adoptLibraryTip( editor, entry ) {
	const tips = editor.state.doc?.tips || [];
	if ( tips.some( ( t ) => t.id === entry.id ) ) {
		return entry.id;
	}
	const next = [
		...tips,
		{
			id: entry.id,
			label: entry.name || __( 'Tip', 'wunderpaint' ),
			rev: 1,
			doc: fromStored( entry ),
		},
	];
	editor.dispatch( { type: 'SET_DOC', doc: { tips: next } } );
	editor.commit?.( __( 'Add brush tip', 'wunderpaint' ) );
	return entry.id;
}

/** A tip id that cannot collide with a shipped one. */
const newId = () =>
	'drawn-' +
	Math.random().toString( 36 ).slice( 2, 8 ) +
	Date.now().toString( 36 ).slice( -4 );

/**
 * Open the maker on one drawn tip, new or existing.
 *
 * @param {Object}   editor   The editor ({ state, dispatch }).
 * @param {string}   tipId    Id of the tip to edit, or '' for a new one.
 * @param {Function} onPicked Called with the tip id once it exists.
 */
export function editDrawnTip( editor, tipId, onPicked ) {
	const tips = editor.state.doc?.tips || [];
	const existing = tips.find( ( t ) => t.id === tipId ) || null;
	const id = existing ? existing.id : newId();
	// The maker edits this object in place, which is why it gets a copy:
	// cancelling has to leave the document's own recipe untouched.
	const doc = existing
		? JSON.parse( JSON.stringify( existing.doc ) )
		: emptyDoc();

	// One write, on close, rather than a document commit per brush stroke
	// inside the maker.
	const save = async () => {
		if ( ! doc.elements.length ) {
			return;
		}
		// Ask once, for a new tip only. Every tip being called "My tip" is
		// no help at all once there are three of them.
		let label = existing?.label;
		if ( ! label ) {
			label =
				( await promptDialog( {
					title: __( 'Name this tip', 'wunderpaint' ),
					label: __( 'Tip name', 'wunderpaint' ),
					defaultValue:
						__( 'Tip', 'wunderpaint' ) + ' ' + ( tips.length + 1 ),
				} ) ) || __( 'Tip', 'wunderpaint' ) + ' ' + ( tips.length + 1 );
		}
		const entry = {
			id,
			label,
			// The mask cache is keyed on this, so an edited recipe has to
			// look like a different one or the old mask would be reused.
			rev: ( existing?.rev || 0 ) + 1,
			doc,
		};
		const next = existing
			? tips.map( ( t ) => ( t.id === id ? entry : t ) )
			: [ ...tips, entry ];
		editor.dispatch( { type: 'SET_DOC', doc: { tips: next } } );
		editor.commit?.( __( 'Edit brush tip', 'wunderpaint' ) );
		if ( onPicked ) {
			onPicked( id );
		}
	};

	return openStampMaker( {
		ui: proBridge.ui,
		bridge: proBridge,
		// The editor's own mark in the head, like every other core modal.
		badgeMount: ( node ) => {
			const root = createRoot( node );
			root.render( I.brand( { size: 22 } ) );
			return { unmount: () => root.unmount() };
		},
		// ENGLISH FOR NOW, and deliberately so rather than by oversight.
		// The maker asks for a translator function and hands it its own
		// source strings, so `__( s )` with a variable is the obvious move
		// - and it is wrong: make-pot reads the source, never runs it, so
		// it would collect none of them and every language would show
		// English anyway, minus the honesty. Particle Strokes carries a
		// hand-written table of these same strings in five languages; the
		// right fix is to move that table in here, and that belongs to the
		// translation round rather than to this commit.
		t: ( s ) => s,
		doc,
		images: {},
		// A library of your own tips, kept per user rather than per
		// document: the recipe on `doc.tips` is what makes a picture
		// reopen correctly, this is what lets you use a tip again in the
		// next document. The starters are the shipped shapes to begin from.
		library: {
			starters: STARTERS,
			read: readTipLibrary,
			write: writeTipLibrary,
		},
		// A tip is a coverage mask: the stroke brings the colour, and there
		// is no time axis to animate along.
		colour: false,
		motion: false,
		onChange: () => {},
		// onDone, NOT onClose. On onClose this ran for × and Escape too,
		// so cancelling wrote the edit into the document anyway, with a
		// bumped revision and an undo step - and, for a new tip, asked for
		// a name for something just thrown away. The deep copy above is
		// there precisely so cancelling changes nothing; now it does.
		onDone: save,
	} );
}
