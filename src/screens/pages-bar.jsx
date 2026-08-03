/**
 * Pages strip (v1.11): multi-page designs Canva-style. Each page is a
 * serialized {doc, layers} snapshot; switching swaps the whole document
 * (per-page undo history). Saved as part of the design.
 */

import { useEffect, useRef, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { I } from '../icons';
import { useEditor } from '../store/editor-context';
import { serializeLayers, hydrateLayers } from '../store/document';
import { renderToCanvas, sharedImageCache } from '../lib/raster';
import { confirmDialog } from '../lib/dialogs';

/** Serialize the open document as a page entry. */
export const snapshotPage = ( state ) => ( {
	doc: { ...state.doc },
	layers: serializeLayers( state.layers ),
} );

const thumbCache = new WeakMap();

function PageThumb( { page } ) {
	const [ url, setUrl ] = useState( () => thumbCache.get( page ) || null );
	useEffect( () => {
		if ( url ) {
			return;
		}
		let cancelled = false;
		hydrateLayers( page.layers || [] )
			.then( ( layers ) =>
				renderToCanvas( page.doc, layers, {
					scale: Math.min( 72 / page.doc.w, 54 / page.doc.h ),
					cache: sharedImageCache,
				} )
			)
			.then( ( canvas ) => {
				if ( ! cancelled && canvas.toDataURL ) {
					const dataUrl = canvas.toDataURL();
					thumbCache.set( page, dataUrl );
					setUrl( dataUrl );
				}
			} )
			.catch( () => {} );
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ page ] );
	return url ? <img src={ url } alt="" /> : <span className="spin" />;
}

export function PagesBar( { extras } ) {
	const editor = useEditor();
	const { state, dispatch } = editor;
	const pages = state.pages;
	const busy = useRef( false );
	if ( ! pages ) {
		return null;
	}

	// The open document IS the current page, snapshot it before leaving.
	const listWithCurrent = () => {
		const list = [ ...pages.list ];
		list[ pages.current ] = snapshotPage( state );
		return list;
	};

	const switchTo = async ( index ) => {
		if ( busy.current || index === pages.current ) {
			return;
		}
		busy.current = true;
		try {
			const list = listWithCurrent();
			const layers = await hydrateLayers( list[ index ].layers || [] );
			dispatch( {
				type: 'LOAD_DOCUMENT',
				doc: list[ index ].doc,
				layers,
				keepPages: true,
				label: sprintf(
					/* translators: %d: page number. */
					__( 'Page %d', 'wunderpaint' ),
					index + 1
				),
			} );
			dispatch( { type: 'SET_PAGES', pages: list, current: index } );
		} finally {
			busy.current = false;
		}
	};

	const addPage = ( duplicate ) => {
		const list = listWithCurrent();
		const source = list[ pages.current ];
		const blank = duplicate
			? JSON.parse( JSON.stringify( source ) )
			: { doc: { ...source.doc }, layers: [] };
		list.splice( pages.current + 1, 0, blank );
		dispatch( { type: 'SET_PAGES', pages: list, current: pages.current } );
		switchToAfter( list, pages.current + 1 );
	};

	const switchToAfter = async ( list, index ) => {
		const layers = await hydrateLayers( list[ index ].layers || [] );
		dispatch( {
			type: 'LOAD_DOCUMENT',
			doc: list[ index ].doc,
			layers,
			keepPages: true,
			label: __( 'New Page', 'wunderpaint' ),
		} );
		dispatch( { type: 'SET_PAGES', pages: list, current: index } );
	};

	const removePage = async ( index ) => {
		if ( pages.list.length < 2 ) {
			return;
		}
		if (
			! ( await confirmDialog( {
				title: __( 'Delete page', 'wunderpaint' ),
				message: sprintf(
					/* translators: %d: page number. */
					__( 'Delete page %d?', 'wunderpaint' ),
					index + 1
				),
				confirmLabel: __( 'Delete', 'wunderpaint' ),
				danger: true,
			} ) )
		) {
			return;
		}
		const list = listWithCurrent();
		list.splice( index, 1 );
		const next = Math.min(
			index === pages.current
				? index
				: pages.current > index
				? pages.current - 1
				: pages.current,
			list.length - 1
		);
		await switchToAfter( list, Math.max( 0, next ) );
	};

	return (
		<div className="pages-bar">
			<span className="pages-label">
				{ sprintf(
					/* translators: 1: current page, 2: total pages. */
					__( 'Page %1$d/%2$d', 'wunderpaint' ),
					pages.current + 1,
					pages.list.length
				) }
			</span>
			<div className="pages-strip">
				{ pages.list.map( ( page, i ) => (
					<div
						key={ i }
						className={ `pages-thumb ${
							i === pages.current ? 'active' : ''
						}` }
					>
						<button
							className="pages-open"
							title={ sprintf(
								/* translators: %d: page number. */
								__( 'Go to page %d', 'wunderpaint' ),
								i + 1
							) }
							onClick={ () => switchTo( i ) }
						>
							{ i === pages.current ? (
								<span className="pages-now">{ i + 1 }</span>
							) : (
								<PageThumb page={ page } />
							) }
						</button>
						{ pages.list.length > 1 && (
							<button
								className="pages-del"
								title={ __( 'Delete page', 'wunderpaint' ) }
								aria-label={ __(
									'Delete page',
									'wunderpaint'
								) }
								onClick={ () => removePage( i ) }
							>
								×
							</button>
						) }
					</div>
				) ) }
			</div>
			<button
				className="ai-btn secondary"
				title={ __( 'Add empty page', 'wunderpaint' ) }
				onClick={ () => addPage( false ) }
			>
				＋ { __( 'Page', 'wunderpaint' ) }
			</button>
			<button
				className="ai-btn secondary"
				title={ __( 'Duplicate current page', 'wunderpaint' ) }
				onClick={ () => addPage( true ) }
			>
				{ I.duplicate( { size: 13 } ) }
			</button>
			<button
				className="ai-btn secondary"
				title={ __(
					'Hide the pages strip (pages stay in the design; show it again from the View menu)',
					'wunderpaint'
				) }
				onClick={ () => {
					dispatch( { type: 'TOGGLE_PAGES' } );
					extras.toasts.toast(
						__( 'Pages stay saved with the design.', 'wunderpaint' )
					);
				} }
			>
				×
			</button>
		</div>
	);
}
