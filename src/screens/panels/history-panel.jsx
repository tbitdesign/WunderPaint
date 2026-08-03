/**
 * History panel (spec 06.4): the real snapshot stack with time-travel,
 * a named Snapshot button, and the attachment's saved versions footer.
 */

import { useState, useEffect, useRef, Fragment } from '@wordpress/element';
import { promptDialog, confirmDialog } from '../../lib/dialogs';
import { __, sprintf } from '@wordpress/i18n';

import { I } from '../../icons';
import { useEditor } from '../../store/editor-context';
import { entries } from '../../store/history';
import { hydrateLayers } from '../../store/document';
import { renderToCanvas } from '../../lib/raster';
import { getVersions, restoreVersion } from '../../lib/api';

/** Pick an icon by action label keywords (visual hint only). */
function iconFor( label ) {
	const l = ( label || '' ).toLowerCase();
	if ( /text/.test( l ) ) {
		return 'text';
	}
	if ( /shape|rect|ellipse|polygon|line|fill/.test( l ) ) {
		return 'shape';
	}
	if ( /brush|pencil|stroke|erase|paint/.test( l ) ) {
		return 'brush';
	}
	if ( /move|nudge|resize|rotate|flip|reorder/.test( l ) ) {
		return 'move';
	}
	if ( /open|place|image|new document/.test( l ) ) {
		return 'image';
	}
	if ( /crop|trim|canvas|size/.test( l ) ) {
		return 'crop';
	}
	if ( /select/.test( l ) ) {
		return 'marquee';
	}
	if ( /snapshot/.test( l ) ) {
		return 'camera';
	}
	return 'sliders';
}

export function HistoryPanel( { extras } ) {
	const editor = useEditor();
	const { state, commit, timeTravel, WPIE } = editor;
	const { list, currentIndex } = entries( state.history );
	const [ preview, setPreview ] = useState( null ); // {i, url, y}
	const previewCache = useRef( new Map() );
	const showPreview = ( i, snapshot, y ) => {
		const cached = previewCache.current.get( i );
		if ( cached ) {
			setPreview( { i, url: cached, y } );
			return;
		}
		hydrateLayers( ( snapshot.layers || [] ).map( ( l ) => ( { ...l } ) ) )
			.then( ( layers ) =>
				renderToCanvas( snapshot.doc, layers, {
					scale: Math.min(
						140 / snapshot.doc.w,
						100 / snapshot.doc.h,
						1
					),
				} )
			)
			.then( ( canvas ) => {
				const url = canvas.toDataURL();
				if ( previewCache.current.size > 20 ) {
					previewCache.current.clear();
				}
				previewCache.current.set( i, url );
				setPreview( ( p ) =>
					p && p.i === i ? { i, url, y: p.y } : { i, url, y }
				);
			} )
			.catch( () => {} );
		setPreview( { i, url: null, y } );
	};
	const [ versions, setVersions ] = useState( null );
	const [ restoring, setRestoring ] = useState( false );

	// Saved versions footer when editing an existing attachment (06.4).
	useEffect( () => {
		if ( WPIE.attachmentId ) {
			getVersions( WPIE.attachmentId )
				.then( setVersions )
				.catch( () => setVersions( null ) );
		}
	}, [ WPIE.attachmentId, state.history.savedRef ] );

	const takeSnapshot = async () => {
		const name = await promptDialog( {
			title: __( 'Take Snapshot', 'wunderpaint' ),
			label: __( 'Snapshot name', 'wunderpaint' ),
			defaultValue: __( 'Snapshot', 'wunderpaint' ),
		} );
		if ( name ) {
			commit( '📌 ' + name );
		}
	};

	const restore = async ( v ) => {
		if (
			! ( await confirmDialog( {
				title: __( 'Restore Version', 'wunderpaint' ),
				message: sprintf(
					/* translators: %d: version number. */ __(
						'Restore version v%d? The current file becomes a new version and the editor reloads.',
						'wunderpaint'
					),
					v
				),
				confirmLabel: __( 'Restore', 'wunderpaint' ),
			} ) )
		) {
			return;
		}
		setRestoring( true );
		try {
			await restoreVersion( WPIE.attachmentId, v );
			window.location.reload();
		} catch ( err ) {
			setRestoring( false );
			extras.toasts.error( err.message );
		}
	};

	return (
		<Fragment>
			<div
				style={ {
					padding: '10px 12px',
					borderBottom: '1px solid var(--ed-border)',
					fontSize: 11,
					color: 'var(--ed-text-muted)',
					textTransform: 'uppercase',
					letterSpacing: 0.5,
					display: 'flex',
					alignItems: 'center',
				} }
			>
				{ sprintf(
					/* translators: %d: number of steps. */ __(
						'History · %d steps',
						'wunderpaint'
					),
					list.length
				) }
				<span style={ { flex: 1 } } />
				<button
					className="icon-btn"
					title={ __( 'Take a named snapshot', 'wunderpaint' ) }
					style={ {
						display: 'inline-flex',
						gap: 4,
						alignItems: 'center',
						textTransform: 'none',
					} }
					onClick={ takeSnapshot }
				>
					{ I.camera( { size: 13 } ) }{ ' ' }
					{ __( 'Snapshot', 'wunderpaint' ) }
				</button>
			</div>
			<div
				className="history-list"
				style={ { flex: 1, maxHeight: 'none' } }
			>
				{ list.map( ( snapshot, i ) => (
					<div
						key={ i }
						className={ `history-item ${
							i === currentIndex ? 'current' : ''
						} ${ i > currentIndex ? 'future' : '' }` }
						role="button"
						tabIndex={ 0 }
						onClick={ () => timeTravel( i ) }
						onKeyDown={ ( e ) =>
							'Enter' === e.key && timeTravel( i )
						}
						onMouseEnter={ ( e ) =>
							showPreview( i, snapshot, e.clientY )
						}
						onMouseLeave={ () => setPreview( null ) }
					>
						<span className="icon">
							{ I[ iconFor( snapshot.label ) ]?.( {
								size: 12,
							} ) || I.sliders( { size: 12 } ) }
						</span>
						<span>{ snapshot.label }</span>
					</div>
				) ) }
			</div>
			{ preview && preview.url && (
				<div
					style={ {
						position: 'fixed',
						right: 300,
						top: Math.max(
							60,
							Math.min( window.innerHeight - 130, preview.y - 50 )
						),
						zIndex: 500,
						background: 'var(--ed-panel)',
						border: '1px solid var(--ed-border-strong)',
						borderRadius: 4,
						padding: 4,
						boxShadow: 'var(--shadow-lg)',
						pointerEvents: 'none',
					} }
				>
					<img
						src={ preview.url }
						alt=""
						style={ {
							display: 'block',
							maxWidth: 140,
							maxHeight: 100,
						} }
					/>
				</div>
			) }
			{ versions && versions.versions?.length > 0 && (
				<div
					style={ {
						padding: '10px 12px',
						borderTop: '1px solid var(--ed-border)',
						fontSize: 11,
						color: 'var(--ed-text-muted)',
					} }
				>
					{ __( 'Saved versions', 'wunderpaint' ) }
					<div
						className="version-list"
						style={ { padding: '6px 0 0', maxHeight: 140 } }
					>
						{ [ ...versions.versions ]
							.reverse()
							.map( ( version ) => (
								<div key={ version.v } className="version-item">
									<div
										className="vthumb"
										style={ {
											display: 'grid',
											placeItems: 'center',
											fontSize: 9,
										} }
									>
										v{ version.v }
									</div>
									<div>
										<div className="vname">
											v{ version.v }
										</div>
										<div className="vmeta">
											{ new Date(
												version.savedAt * 1000
											).toLocaleString() }{ ' ' }
											·{ ' ' }
											{ (
												version.byteSize / 1024
											).toFixed( 0 ) }{ ' ' }
											KB
										</div>
									</div>
									<button
										className="ai-btn secondary"
										style={ {
											fontSize: 10,
											padding: '3px 8px',
										} }
										disabled={ restoring }
										onClick={ () => restore( version.v ) }
									>
										{ __( 'Restore', 'wunderpaint' ) }
									</button>
								</div>
							) ) }
						<div className="version-item current">
							<div
								className="vthumb"
								style={ {
									display: 'grid',
									placeItems: 'center',
									fontSize: 9,
								} }
							>
								v{ versions.current }
							</div>
							<div>
								<div className="vname">
									v{ versions.current }
								</div>
								<div className="vmeta">
									{ __( 'current', 'wunderpaint' ) }
								</div>
							</div>
							<span className="vbadge">
								{ __( 'CURRENT', 'wunderpaint' ) }
							</span>
						</div>
					</div>
				</div>
			) }
		</Fragment>
	);
}
