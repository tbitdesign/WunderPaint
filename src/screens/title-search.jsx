/**
 * The search in the title bar (v1.434, Thomas 27.09.2026): a magnifier after
 * Undo and Redo that a click or ⌘K turns into a slim field. Every menu command,
 * tool, filter and extension, found by name, word, typo or menu path and run
 * with Enter; Esc, a run or a click elsewhere turns the field back into the
 * magnifier. The index is rebuilt each time the field opens, so it holds
 * exactly what the menus offer at that moment; lib/command-search.js does
 * the matching.
 */
import { useEffect, useMemo, useRef, useState } from '@wordpress/element';
import { __, getLocaleData } from '@wordpress/i18n';

import { I } from '../icons';
import { useEditor } from '../store/editor-context';
import { TOOLS } from '../store/constants';
import * as Ops from '../store/ops';
import { buildMenus } from './editor-menubar';
import { panelSearchItems } from './search-sources';
import {
	bestHit,
	buildSearchIndex,
	englishLookup,
	searchIndex,
} from '../lib/command-search';
import '../styles/editor/title-search.css';

/**
 * The search index over the live menu model, built while `active`.
 *
 * @param {Object}  extras Editor extras (the menus run through them).
 * @param {boolean} active Build only while the search is in use.
 * @return {Array} Index entries.
 */
export function useCommandIndex( extras, active ) {
	const editor = useEditor();
	const english = useMemo(
		() => englishLookup( getLocaleData( 'wunderpaint' ) ),
		[]
	);
	return useMemo(
		() =>
			active
				? buildSearchIndex( {
						menus: buildMenus( editor, extras ),
						tools: TOOLS,
						items: panelSearchItems( editor ),
						runTool: ( tool ) =>
							editor.dispatch( { type: 'SET_TOOL', tool } ),
						english,
						reasons: {
							filters: __(
								'Select a layer to apply filters and effects.',
								'wunderpaint'
							),
						},
				  } )
				: [],
		// Rebuilt per opening on purpose: the menus read the editor state
		// of that moment.
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[ active ]
	);
}

/**
 * Run a hit like the menu runs an entry: an operation that has to wait
 * reports why instead of throwing, and a greyed hit only says why it
 * cannot run.
 *
 * @param {Object} entry  Search hit.
 * @param {Object} extras Editor extras.
 * @return {boolean} False when the hit could not run.
 */
export function runSearchEntry( entry, extras ) {
	if ( entry.disabled ) {
		if ( entry.reason ) {
			extras.toasts?.error( entry.reason );
		}
		return false;
	}
	try {
		entry.run();
	} catch ( err ) {
		if ( err instanceof Ops.PendingOp || err?.pending ) {
			extras.toasts?.error( err.message );
		} else {
			throw err;
		}
	}
	return true;
}

/** The hint beside a hit: where it lives, and its shortcut. */
export const hintOf = ( entry ) =>
	[ entry.hint, 'tools' !== entry.group && entry.kbd ]
		.filter( Boolean )
		.join( ' · ' );

export function TitleSearch( { extras, focusRef } ) {
	const [ query, setQuery ] = useState( '' );
	const [ open, setOpen ] = useState( false );
	const [ markedKey, setMarkedKey ] = useState( null );
	const inputRef = useRef( null );
	const toggleRef = useRef( null );
	const listRef = useRef( null );
	const index = useCommandIndex( extras, open );
	const groups = useMemo(
		() => searchIndex( index, query ),
		[ index, query ]
	);
	const rows = groups.flatMap( ( group ) => group.items );
	// The best hit is marked first, even in a later group; of two equal
	// ones the one that can run.
	const marked =
		rows.find( ( row ) => row.key === markedKey ) || bestHit( rows );

	useEffect( () => {
		if ( ! focusRef ) {
			return undefined;
		}
		focusRef.current = () => {
			setOpen( true );
			inputRef.current?.focus();
			inputRef.current?.select();
		};
		return () => {
			focusRef.current = null;
		};
	}, [ focusRef ] );

	// The magnifier became the field: the cursor goes straight in.
	useEffect( () => {
		if ( open ) {
			inputRef.current?.focus();
		}
	}, [ open ] );

	useEffect( () => {
		listRef.current
			?.querySelector( '.focused' )
			?.scrollIntoView?.( { block: 'nearest' } );
	}, [ marked?.key ] );

	const close = () => {
		setOpen( false );
		setQuery( '' );
		setMarkedKey( null );
	};
	const choose = ( row ) => {
		if ( row.disabled ) {
			runSearchEntry( row, extras );
			return;
		}
		close();
		runSearchEntry( row, extras );
	};
	const move = ( step ) => {
		if ( ! rows.length ) {
			return;
		}
		const at = Math.max( 0, rows.indexOf( marked ) );
		setMarkedKey( rows[ ( at + step + rows.length ) % rows.length ].key );
	};
	const showList = open && !! query.trim();
	const rowId = ( row ) => `wpie-search-${ rows.indexOf( row ) }`;

	// Not .ed-search: that class is the panels' search field and grows with
	// flex: 1, which pulled Undo, Redo and the magnifier to the middle.
	return (
		<div className={ 'ed-title-search' + ( open ? ' is-open' : '' ) }>
			<button
				ref={ toggleRef }
				type="button"
				className="ed-search-toggle"
				title={ __( 'Search (⌘K)', 'wunderpaint' ) }
				aria-label={ __( 'Search', 'wunderpaint' ) }
				aria-expanded={ open }
				onClick={ () => setOpen( true ) }
			>
				{ I.search( { size: 14 } ) }
			</button>
			{ open && (
				<div className="ed-search-field">
					<span className="ed-search-icon" aria-hidden="true">
						{ I.search( { size: 13 } ) }
					</span>
					<input
						ref={ inputRef }
						type="text"
						role="combobox"
						aria-autocomplete="list"
						aria-expanded={ showList }
						aria-controls="wpie-search-results"
						aria-activedescendant={
							showList && marked ? rowId( marked ) : undefined
						}
						aria-label={ __( 'Search', 'wunderpaint' ) }
						placeholder={ __( 'Search', 'wunderpaint' ) }
						value={ query }
						onBlur={ close }
						onChange={ ( e ) => {
							setQuery( e.target.value );
							setMarkedKey( null );
						} }
						onKeyDown={ ( e ) => {
							// Typing here must not reach the editor's shortcuts.
							e.stopPropagation();
							if ( 'Escape' === e.key ) {
								e.preventDefault();
								close();
								toggleRef.current?.focus();
							} else if ( 'ArrowDown' === e.key ) {
								e.preventDefault();
								move( 1 );
							} else if ( 'ArrowUp' === e.key ) {
								e.preventDefault();
								move( -1 );
							} else if (
								'Enter' === e.key &&
								showList &&
								marked
							) {
								e.preventDefault();
								choose( marked );
							}
						} }
					/>
					{ showList && (
						<div
							id="wpie-search-results"
							className="ed-dropdown ed-search-results"
							role="listbox"
							tabIndex={ -1 }
							ref={ listRef }
							// Keeps the focus in the field, so a click lands.
							onMouseDown={ ( e ) => e.preventDefault() }
						>
							{ groups.map( ( group ) => (
								<div
									key={ group.id }
									role="group"
									aria-label={ group.label }
								>
									<div className="ed-head">
										<span>{ group.label }</span>
									</div>
									{ group.items.map( ( row ) => (
										<button
											key={ row.key }
											id={ rowId( row ) }
											type="button"
											role="option"
											aria-selected={ row === marked }
											aria-disabled={
												row.disabled || undefined
											}
											title={ row.reason || undefined }
											className={
												'ed-item' +
												( row === marked
													? ' focused'
													: '' ) +
												( row.disabled
													? ' is-disabled'
													: '' )
											}
											onMouseEnter={ () =>
												setMarkedKey( row.key )
											}
											onClick={ () => choose( row ) }
										>
											<span className="ed-search-label">
												{ row.label }
											</span>
											{ hintOf( row ) && (
												<span className="kbd-hint">
													{ hintOf( row ) }
												</span>
											) }
										</button>
									) ) }
								</div>
							) ) }
							{ ! rows.length && (
								<div className="ed-search-empty">
									{ __( 'No match.', 'wunderpaint' ) }
								</div>
							) }
						</div>
					) }
				</div>
			) }
		</div>
	);
}
