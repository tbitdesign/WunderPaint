/**
 * Animation timeline (v1.1): visible top-level layers as frames —
 * thumbnails, reorder, per-frame delay, onion skin and play preview.
 */

import { useState, useEffect, useRef } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { useEditor } from '../store/editor-context';
import { gifFrameLayers } from '../lib/gif-export';
import { renderToDataURL, sharedImageCache } from '../lib/raster';

function FrameThumb( { doc, layers, frame } ) {
	const [ url, setUrl ] = useState( null );
	useEffect( () => {
		let cancelled = false;
		const frameLayers = layers.map( ( l ) =>
			! l.parent && l.id !== frame.id ? { ...l, visible: false } : l
		);
		renderToDataURL( doc, frameLayers, {
			scale: Math.min( 48 / doc.w, 40 / doc.h ),
			format: 'png',
			cache: sharedImageCache,
		} )
			.then( ( u ) => ! cancelled && setUrl( u ) )
			.catch( () => {} );
		return () => {
			cancelled = true;
		};
	}, [ frame, doc, layers ] );
	return url ? (
		<img src={ url } alt="" style={ { maxWidth: 48, maxHeight: 40 } } />
	) : (
		<span className="spin" />
	);
}

export function TimelineBar( { extras } ) {
	const editor = useEditor();
	const { state, dispatch, commit } = editor;
	const { doc, layers } = state;
	const frames = gifFrameLayers( layers );
	const [ playing, setPlaying ] = useState( null ); // {urls, i} | null
	const playRef = useRef( null );

	useEffect( () => () => clearTimeout( playRef.current ), [] );

	const play = async () => {
		if ( frames.length < 2 ) {
			return;
		}
		const urls = [];
		for ( const frame of frames ) {
			const frameLayers = layers.map( ( l ) =>
				! l.parent && l.id !== frame.id ? { ...l, visible: false } : l
			);
			urls.push( {
				url: await renderToDataURL( doc, frameLayers, {
					scale: Math.min( 1, 480 / Math.max( doc.w, doc.h ) ),
					format: 'png',
					cache: sharedImageCache,
				} ),
				delay: frame.frameDelay ?? 500,
			} );
		}
		let i = 0;
		const step = () => {
			setPlaying( { urls, i } );
			playRef.current = setTimeout( () => {
				i = ( i + 1 ) % urls.length;
				step();
			}, urls[ i ].delay );
		};
		step();
	};

	const stop = () => {
		clearTimeout( playRef.current );
		setPlaying( null );
	};

	const move = ( frame, dir ) => {
		const index = layers.findIndex( ( l ) => l.id === frame.id );
		const target = index + dir;
		if ( target < 0 || target >= layers.length ) {
			return;
		}
		const next = [ ...layers ];
		const [ item ] = next.splice( index, 1 );
		next.splice( target, 0, item );
		dispatch( { type: 'SET_LAYERS', layers: next } );
		commit( __( 'Reorder frames', 'wunderpaint' ) );
	};

	return (
		<div className="timeline-bar">
			<div className="timeline-head">
				<strong>{ __( 'Timeline', 'wunderpaint' ) }</strong>
				<span className="timeline-note">
					{ sprintf(
						/* translators: %d: frame count. */
						__(
							'%d frames, every visible top-level layer is one frame',
							'wunderpaint'
						),
						frames.length
					) }
				</span>
				<span style={ { flex: 1 } } />
				<label className="timeline-toggle">
					<input
						type="checkbox"
						checked={ !! state.timeline.onion }
						onChange={ () =>
							dispatch( {
								type: 'SET_TIMELINE',
								timeline: { onion: ! state.timeline.onion },
							} )
						}
					/>
					{ __( 'Onion skin', 'wunderpaint' ) }
				</label>
				{ playing ? (
					<button className="ai-btn secondary" onClick={ stop }>
						■ { __( 'Stop', 'wunderpaint' ) }
					</button>
				) : (
					<button
						className="ai-btn secondary"
						onClick={ play }
						disabled={ frames.length < 2 }
					>
						▶ { __( 'Play', 'wunderpaint' ) }
					</button>
				) }
				<button
					className="ai-btn secondary"
					disabled={ frames.length < 2 }
					onClick={ () => extras.openExport( 'export' ) }
					title={ __(
						'Export as GIF/APNG/WebM in the export dialog',
						'wunderpaint'
					) }
				>
					{ __( 'Export', 'wunderpaint' ) }
				</button>
				<button
					className="ai-btn secondary"
					onClick={ () => dispatch( { type: 'TOGGLE_TIMELINE' } ) }
					aria-label={ __( 'Close timeline', 'wunderpaint' ) }
				>
					×
				</button>
			</div>
			<div className="timeline-frames">
				{ frames.map( ( frame, i ) => (
					<div
						key={ frame.id }
						className={ `timeline-frame ${
							state.activeId === frame.id ? 'active' : ''
						}` }
					>
						<button
							className="timeline-thumb"
							title={ frame.name }
							onClick={ () =>
								dispatch( { type: 'SET_ACTIVE', id: frame.id } )
							}
						>
							<FrameThumb
								doc={ doc }
								layers={ layers }
								frame={ frame }
							/>
						</button>
						<div className="timeline-frame-meta">
							<span className="timeline-frame-nr">{ i + 1 }</span>
							<input
								type="number"
								min="20"
								max="10000"
								step="10"
								value={ frame.frameDelay ?? 500 }
								title={ __(
									'Frame delay (ms)',
									'wunderpaint'
								) }
								aria-label={ __(
									'Frame delay (ms)',
									'wunderpaint'
								) }
								onChange={ ( e ) => {
									dispatch( {
										type: 'UPDATE_LAYER',
										id: frame.id,
										patch: {
											frameDelay: Math.max(
												20,
												Math.min(
													10000,
													Math.round(
														+e.target.value || 500
													)
												)
											),
										},
									} );
									commit(
										__( 'Frame delay', 'wunderpaint' )
									);
								} }
							/>
							<button
								className="timeline-mini"
								aria-label={ __(
									'Move frame left',
									'wunderpaint'
								) }
								disabled={ 0 === i }
								onClick={ () => move( frame, -1 ) }
							>
								◀
							</button>
							<button
								className="timeline-mini"
								aria-label={ __(
									'Move frame right',
									'wunderpaint'
								) }
								disabled={ i === frames.length - 1 }
								onClick={ () => move( frame, 1 ) }
							>
								▶
							</button>
						</div>
					</div>
				) ) }
				{ frames.length < 2 && (
					<div className="timeline-empty">
						{ __(
							'Add at least two visible top-level layers to animate.',
							'wunderpaint'
						) }
					</div>
				) }
			</div>
			{ playing && (
				<div
					className="timeline-play"
					role="presentation"
					onClick={ stop }
				>
					<img src={ playing.urls[ playing.i ].url } alt="" />
				</div>
			) }
		</div>
	);
}
