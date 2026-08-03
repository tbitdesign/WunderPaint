/**
 * Semantic search index status (v1.131.3): ONE shared line used by the
 * tray strip and the modal section. Indexing itself starts automatically
 * (editor-main), so this is a status display, not a control - a manual
 * button appears only as fallback when auto-indexing has not kicked in.
 */

import { useState, useEffect } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import {
	searchModelInstalled,
	fetchIndexStatus,
	runIndexer,
	subscribeIndexer,
	indexerStatus,
} from '../lib/image-search';

export function SearchIndexHint( { showReady = true } ) {
	const semantic = searchModelInstalled();
	const [ info, setInfo ] = useState( null );
	const [ idx, setIdx ] = useState( indexerStatus );
	useEffect( () => subscribeIndexer( setIdx ), [] );
	useEffect( () => {
		if ( semantic && ! idx.running ) {
			fetchIndexStatus()
				.then( setInfo )
				.catch( () => {} );
		}
	}, [ semantic, idx.running ] );

	if ( ! semantic ) {
		return null;
	}
	if ( idx.running ) {
		return (
			<div className="library-index-hint">
				<span className="spin" />
				{ sprintf(
					/* translators: 1: done count, 2: total count. */
					__( 'Preparing image search… %1$d / %2$d', 'wunderpaint' ),
					idx.done,
					idx.total
				) }
			</div>
		);
	}
	if ( info && info.pending > 0 ) {
		return (
			<div className="library-index-hint">
				{ sprintf(
					/* translators: %d: image count. */
					__(
						'%d images are not indexed for semantic search yet.',
						'wunderpaint'
					),
					info.pending
				) }{ ' ' }
				<button className="ai-btn sm" onClick={ () => runIndexer() }>
					{ __( 'Index now', 'wunderpaint' ) }
				</button>
			</div>
		);
	}
	if ( showReady && info && 0 === info.pending && info.total > 0 ) {
		return (
			<div className="library-index-hint">
				{ __(
					'Image search is ready: describe what you are looking for in the search box.',
					'wunderpaint'
				) }
			</div>
		);
	}
	return null;
}
