/**
 * Command palette (v1.15, ⌘K), the window form of the search. Since v1.434
 * the search lives in the title bar; this window only opens where there is
 * no title-bar field (Easy Mode, nested editors) and searches the same
 * index: every menu command, tool, filter and extension (lib/command-search).
 */

import { useState, useEffect, useRef, useMemo } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { bestHit, searchIndex } from '../lib/command-search';
import { useCommandIndex, runSearchEntry, hintOf } from './title-search';

export function CommandPalette( { onClose, extras } ) {
	const [ query, setQuery ] = useState( '' );
	const [ markedKey, setMarkedKey ] = useState( null );
	const inputRef = useRef( null );
	const listRef = useRef( null );
	const commands = useCommandIndex( extras, true );

	useEffect( () => {
		inputRef.current?.focus();
	}, [] );

	const matches = useMemo(
		() =>
			searchIndex( commands, query, { perGroup: 12 } ).flatMap(
				( group ) =>
					group.items.map( ( item ) => ( {
						...item,
						groupLabel: group.label,
					} ) )
			),
		[ commands, query ]
	);
	// The best hit is marked first, even in a later group; of two equal
	// ones the one that can run.
	const marked =
		matches.find( ( row ) => row.key === markedKey ) || bestHit( matches );
	const move = ( step ) => {
		if ( ! matches.length ) {
			return;
		}
		const at = Math.max( 0, matches.indexOf( marked ) );
		setMarkedKey(
			matches[ ( at + step + matches.length ) % matches.length ].key
		);
	};
	const run = ( row ) => {
		if ( row.disabled ) {
			runSearchEntry( row, extras );
			return;
		}
		onClose();
		runSearchEntry( row, extras );
	};
	useEffect( () => {
		listRef.current
			?.querySelector( '.active' )
			?.scrollIntoView?.( { block: 'nearest' } );
	}, [ marked?.key ] );

	return (
		<div
			className="modal-backdrop quick-insert-backdrop"
			onClick={ onClose }
			role="presentation"
		>
			<div
				className="quick-insert command-palette"
				role="dialog"
				aria-modal="true"
				aria-label={ __( 'Command palette', 'wunderpaint' ) }
				onClick={ ( e ) => e.stopPropagation() }
			>
				<input
					ref={ inputRef }
					type="text"
					placeholder={ __(
						'Type a command, tool, extension or filter',
						'wunderpaint'
					) }
					value={ query }
					onChange={ ( e ) => {
						setQuery( e.target.value );
						setMarkedKey( null );
					} }
					onKeyDown={ ( e ) => {
						e.stopPropagation();
						if ( 'Escape' === e.key ) {
							onClose();
						} else if ( 'ArrowDown' === e.key ) {
							e.preventDefault();
							move( 1 );
						} else if ( 'ArrowUp' === e.key ) {
							e.preventDefault();
							move( -1 );
						} else if ( 'Enter' === e.key && marked ) {
							run( marked );
						}
					} }
				/>
				<div className="quick-insert-list" ref={ listRef }>
					{ matches.map( ( row ) => (
						<button
							key={ row.key }
							className={
								( row === marked ? 'active' : '' ) +
								( row.disabled ? ' is-disabled' : '' )
							}
							aria-disabled={ row.disabled || undefined }
							title={ row.reason || undefined }
							onMouseEnter={ () => setMarkedKey( row.key ) }
							onClick={ () => run( row ) }
						>
							<span>{ row.label }</span>
							<span className="quick-insert-hint">
								{ [ row.groupLabel, hintOf( row ) ]
									.filter( Boolean )
									.join( ' · ' ) }
							</span>
						</button>
					) ) }
					{ !! query.trim() && ! matches.length && (
						<div
							className="quick-insert-hint"
							style={ { padding: 8 } }
						>
							{ __( 'No match.', 'wunderpaint' ) }
						</div>
					) }
				</div>
			</div>
		</div>
	);
}
