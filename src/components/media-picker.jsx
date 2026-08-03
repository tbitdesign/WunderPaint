/**
 * In-modal media library picker (v1.134.0): a proper image chooser that
 * stays inside the editor instead of launching the WordPress media
 * frame. Title filtering plus the local semantic search (SigLIP), same
 * "describe it" search as the Asset Library. Single pick or, with a
 * `selected` Set, multi-select (the parent owns the selection).
 */

import { useState, useEffect, useRef } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { I } from '../icons';
import { listMediaPage } from '../lib/api';
import { searchModelInstalled, searchMediaLibrary } from '../lib/image-search';

export function MediaPicker( { onPick, selected = null, height = 240 } ) {
	const [ query, setQuery ] = useState( '' );
	const [ items, setItems ] = useState( null ); // null = loading first page
	const [ semantic, setSemantic ] = useState( [] );
	const pageRef = useRef( 0 );
	const loadingRef = useRef( false );
	const hasMoreRef = useRef( true );

	const loadMore = () => {
		if ( loadingRef.current || ! hasMoreRef.current ) {
			return;
		}
		loadingRef.current = true;
		listMediaPage( pageRef.current + 1 )
			.then( ( res ) => {
				pageRef.current += 1;
				hasMoreRef.current = res.hasMore;
				setItems( ( prev ) => [ ...( prev || [] ), ...res.items ] );
			} )
			.catch( () => {
				hasMoreRef.current = false;
				setItems( ( prev ) => prev || [] );
			} )
			.finally( () => {
				loadingRef.current = false;
			} );
	};

	useEffect( loadMore, [] );

	// Semantic results (debounced) when the model is installed.
	useEffect( () => {
		const q = query.trim();
		if ( q.length < 3 || ! searchModelInstalled() ) {
			setSemantic( [] );
			return undefined;
		}
		let cancelled = false;
		const timer = setTimeout( () => {
			searchMediaLibrary( q, { limit: 30 } )
				.then( ( hits ) => ! cancelled && setSemantic( hits ) )
				.catch( () => ! cancelled && setSemantic( [] ) );
		}, 350 );
		return () => {
			cancelled = true;
			clearTimeout( timer );
		};
	}, [ query ] );

	const q = query.trim().toLowerCase();
	const titleMatches = ( items || [] ).filter(
		( it ) => ! q || ( it.title || '' ).toLowerCase().includes( q )
	);
	const seen = new Set( titleMatches.map( ( it ) => it.id ) );
	const results = [
		...titleMatches,
		...semantic
			.filter( ( h ) => ! seen.has( h.id ) )
			.map( ( h ) => ( {
				id: h.id,
				url: h.thumb,
				fullUrl: h.url,
				title: h.title,
			} ) ),
	];

	return (
		<div className="media-picker">
			<div className="media-picker-search">
				{ I.search ? I.search( { size: 14 } ) : null }
				<input
					type="text"
					value={ query }
					placeholder={
						searchModelInstalled()
							? __(
									'Search by name or describe the image',
									'wunderpaint'
							  )
							: __( 'Search by name', 'wunderpaint' )
					}
					onChange={ ( e ) => setQuery( e.target.value ) }
				/>
				{ selected && (
					<span className="media-picker-count">
						{ selected.size }
					</span>
				) }
			</div>
			<div
				className="media-picker-grid"
				style={ { maxHeight: height } }
				onScroll={ ( e ) => {
					const el = e.currentTarget;
					if (
						! q &&
						el.scrollTop + el.clientHeight > el.scrollHeight - 200
					) {
						loadMore();
					}
				} }
			>
				{ null === items && <span className="spin" /> }
				{ items && 0 === results.length && (
					<div className="media-picker-empty">
						{ q
							? __( 'No matching images.', 'wunderpaint' )
							: __(
									'No images in the media library yet.',
									'wunderpaint'
							  ) }
					</div>
				) }
				{ results.map( ( item ) => (
					<button
						key={ item.id }
						className={
							selected?.has( item.id )
								? 'media-picker-tile selected'
								: 'media-picker-tile'
						}
						title={ item.title }
						onClick={ () => onPick( item ) }
					>
						<img src={ item.url } alt="" loading="lazy" />
						{ selected?.has( item.id ) && (
							<span className="media-picker-check">
								{ I.check ? I.check( { size: 12 } ) : '✓' }
							</span>
						) }
					</button>
				) ) }
			</div>
		</div>
	);
}
