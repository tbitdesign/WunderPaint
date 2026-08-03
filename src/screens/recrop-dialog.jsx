/**
 * Smart Recrop (v1.375.0): WordPress crops its hard-crop sizes (thumbnail
 * and friends) dead center, which beheads portraits in theme grids. This
 * dialog shows every cropped size of one attachment, lets the crop window
 * be dragged on the full image (ratio-locked), and offers a local
 * auto-suggest that frames the detected subject. Saving rewrites ONLY the
 * generated size files - names stay stable, the original is never touched.
 */

import { useEffect, useRef, useState } from '@wordpress/element';
import { __, _n, sprintf } from '@wordpress/i18n';

import { I } from '../icons';
import { request } from '../lib/api';
import { localRuntimeAvailable } from '../lib/ml';
import { computeSubjectAlpha } from '../lib/local-image-ops';
import { fitRectToRatio, autoRect, alphaBBox } from '../lib/recrop';
import { loadImage } from '../store/document';

export function RecropDialog( { id, toasts, onClose } ) {
	const [ info, setInfo ] = useState( null );
	const [ active, setActive ] = useState( '' );
	const [ rects, setRects ] = useState( {} );
	const [ dirty, setDirty ] = useState( () => new Set() );
	const [ busy, setBusy ] = useState( false );
	const [ auto, setAuto ] = useState( false );
	const [ stageW, setStageW ] = useState( 0 );
	const bboxRef = useRef( null );
	const dragRef = useRef( null );

	useEffect( () => {
		let alive = true;
		request( { path: `/media/recrop-info?id=${ id }` } )
			.then( ( data ) => {
				if ( ! alive ) {
					return;
				}
				const defaults = {};
				data.sizes.forEach( ( s ) => {
					defaults[ s.name ] =
						s.rect ||
						fitRectToRatio(
							{
								x: 0,
								y: 0,
								w: data.original.width,
								h: data.original.height,
							},
							s.width / s.height,
							data.original.width,
							data.original.height
						);
				} );
				setRects( defaults );
				setInfo( data );
				setActive( data.sizes[ 0 ]?.name || '' );
			} )
			.catch( ( err ) => {
				toasts?.error?.( err.message );
				onClose();
			} );
		return () => {
			alive = false;
		};
	}, [ id ] ); // eslint-disable-line react-hooks/exhaustive-deps

	const activeSize = info?.sizes.find( ( s ) => s.name === active );
	const rect = activeSize ? rects[ active ] : null;
	const scale = info && stageW ? stageW / info.original.width : 0;

	const markDirty = ( name ) =>
		setDirty( ( prev ) => new Set( [ ...prev, name ] ) );

	const onDrag = ( e ) => {
		const d = dragRef.current;
		if ( ! d || ! info ) {
			return;
		}
		const { width: W, height: H } = info.original;
		const dx = ( e.clientX - d.sx ) / d.scale;
		const dy = ( e.clientY - d.sy ) / d.scale;
		const r = { ...d.rect };
		if ( 'move' === d.mode ) {
			r.x = Math.max( 0, Math.min( d.rect.x + dx, W - r.w ) );
			r.y = Math.max( 0, Math.min( d.rect.y + dy, H - r.h ) );
		} else {
			const ratio = d.ratio;
			let w = Math.max( 48, d.rect.w + dx );
			w = Math.min( w, W - d.rect.x, ( H - d.rect.y ) * ratio );
			r.w = w;
			r.h = w / ratio;
		}
		r.x = Math.round( r.x );
		r.y = Math.round( r.y );
		r.w = Math.round( r.w );
		r.h = Math.round( r.h );
		setRects( ( prev ) => ( { ...prev, [ d.name ]: r } ) );
	};

	const endDrag = () => {
		if ( dragRef.current ) {
			markDirty( dragRef.current.name );
			dragRef.current = null;
		}
		window.removeEventListener( 'pointermove', onDrag );
	};

	const startDrag = ( e, mode ) => {
		if ( ! rect || ! activeSize || ! scale ) {
			return;
		}
		e.preventDefault();
		e.stopPropagation();
		dragRef.current = {
			mode,
			name: active,
			sx: e.clientX,
			sy: e.clientY,
			rect: { ...rect },
			ratio: activeSize.width / activeSize.height,
			scale,
		};
		window.addEventListener( 'pointermove', onDrag );
		window.addEventListener( 'pointerup', endDrag, { once: true } );
	};

	const suggest = async ( all ) => {
		if ( ! info ) {
			return;
		}
		setAuto( true );
		try {
			if ( ! bboxRef.current ) {
				const img = await loadImage( info.original.url );
				const map = await computeSubjectAlpha( img );
				bboxRef.current =
					alphaBBox(
						map,
						info.original.width,
						info.original.height
					) || 'none';
			}
			if ( 'none' === bboxRef.current ) {
				toasts?.error?.(
					__( 'No clear subject was detected.', 'wunderpaint' )
				);
				return;
			}
			const targets = all
				? info.sizes
				: info.sizes.filter( ( s ) => s.name === active );
			setRects( ( prev ) => {
				const next = { ...prev };
				targets.forEach( ( s ) => {
					next[ s.name ] = autoRect(
						bboxRef.current,
						s.width / s.height,
						info.original.width,
						info.original.height
					);
				} );
				return next;
			} );
			setDirty(
				( prev ) =>
					new Set( [ ...prev, ...targets.map( ( s ) => s.name ) ] )
			);
		} catch ( err ) {
			toasts?.error?.( err.message );
		} finally {
			setAuto( false );
		}
	};

	const save = async () => {
		if ( ! dirty.size || busy ) {
			return;
		}
		setBusy( true );
		try {
			const names = [ ...dirty ];
			for ( const name of names ) {
				const res = await request( {
					path: '/media/recrop',
					method: 'POST',
					data: { id, size: name, rect: rects[ name ] },
				} );
				setInfo( ( prev ) => ( {
					...prev,
					sizes: prev.sizes.map( ( s ) =>
						s.name === name
							? { ...s, url: res.url, rect: res.rect }
							: s
					),
				} ) );
				setRects( ( prev ) => ( { ...prev, [ name ]: res.rect } ) );
			}
			setDirty( new Set() );
			toasts?.success?.(
				sprintf(
					/* translators: %d: number of recropped sizes. */
					_n(
						'%d size recropped.',
						'%d sizes recropped.',
						names.length,
						'wunderpaint'
					),
					names.length
				)
			);
		} catch ( err ) {
			toasts?.error?.( err.message );
		} finally {
			setBusy( false );
		}
	};

	return (
		<div
			className="wpie-alt-editwrap"
			onClick={ ( e ) => {
				e.stopPropagation();
				if ( ! busy ) {
					onClose();
				}
			} }
			role="presentation"
		>
			<div
				className="wpie-mlm-cluster-panel wide wpie-recrop"
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-label={ __( 'Recrop thumbnails', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<span className="dsm-title">
							{ __( 'Recrop thumbnails', 'wunderpaint' ) }
						</span>
						<div className="dsm-sub">
							{ __(
								'WordPress crops these sizes dead center. Place the window yourself - files keep their names, nothing else changes.',
								'wunderpaint'
							) }
						</div>
					</div>
					<button
						className="dsm-close"
						onClick={ onClose }
						aria-label={ __( 'Close', 'wunderpaint' ) }
					>
						{ I.close( { size: 17 } ) }
					</button>
				</div>
				{ ! info ? (
					<div style={ { padding: 40, textAlign: 'center' } }>
						<span className="spin" />
					</div>
				) : (
					<div
						style={ {
							display: 'grid',
							gridTemplateColumns: '190px 1fr',
							gap: 14,
							padding: 14,
							alignItems: 'start',
						} }
					>
						<div style={ { display: 'grid', gap: 6 } }>
							{ info.sizes.map( ( s ) => (
								<button
									key={ s.name }
									className={
										'ai-btn ' +
										( s.name === active
											? 'primary'
											: 'secondary' )
									}
									style={ {
										display: 'grid',
										gridTemplateColumns: '44px 1fr',
										gap: 8,
										alignItems: 'center',
										textAlign: 'left',
										padding: 6,
									} }
									onClick={ () => setActive( s.name ) }
								>
									<img
										src={ s.url }
										alt=""
										style={ {
											width: 44,
											height: Math.round(
												( 44 * s.height ) / s.width
											),
											objectFit: 'cover',
											borderRadius: 3,
										} }
									/>
									<span style={ { fontSize: 11 } }>
										{ s.name }
										{ dirty.has( s.name ) ? ' •' : '' }
										<br />
										<span
											style={ {
												color: 'var(--ed-text-muted)',
											} }
										>
											{ s.width }×{ s.height }
										</span>
									</span>
								</button>
							) ) }
							{ ! info.sizes.length && (
								<div
									style={ {
										fontSize: 12,
										color: 'var(--ed-text-muted)',
									} }
								>
									{ __(
										'This image has no cropped sizes - every registered size only scales, so there is nothing to place.',
										'wunderpaint'
									) }
								</div>
							) }
						</div>
						<div style={ { display: 'grid', gap: 10 } }>
							<div
								style={ {
									position: 'relative',
									overflow: 'hidden',
									borderRadius: 6,
									justifySelf: 'start',
									lineHeight: 0,
								} }
							>
								<img
									src={ info.original.url }
									alt=""
									draggable={ false }
									style={ {
										maxWidth: '100%',
										maxHeight: 420,
										display: 'block',
									} }
									onLoad={ ( e ) =>
										setStageW( e.target.clientWidth )
									}
								/>
								{ rect && scale > 0 && (
									<div
										role="presentation"
										onPointerDown={ ( e ) =>
											startDrag( e, 'move' )
										}
										style={ {
											position: 'absolute',
											left: rect.x * scale,
											top: rect.y * scale,
											width: rect.w * scale,
											height: rect.h * scale,
											border: '2px solid var(--ed-accent, #3b66ff)',
											boxShadow:
												'0 0 0 9999px rgba(0,0,0,0.45)',
											cursor: 'move',
											touchAction: 'none',
										} }
									>
										<span
											role="presentation"
											onPointerDown={ ( e ) =>
												startDrag( e, 'resize' )
											}
											style={ {
												position: 'absolute',
												right: -7,
												bottom: -7,
												width: 14,
												height: 14,
												borderRadius: '50%',
												background:
													'var(--ed-accent, #3b66ff)',
												cursor: 'nwse-resize',
												touchAction: 'none',
											} }
										/>
									</div>
								) }
							</div>
							<div
								style={ {
									display: 'flex',
									gap: 8,
									flexWrap: 'wrap',
									alignItems: 'center',
								} }
							>
								{ localRuntimeAvailable() && (
									<>
										<button
											className="ai-btn secondary"
											disabled={ auto || ! activeSize }
											onClick={ () => suggest( false ) }
										>
											{ auto
												? __(
														'Detecting…',
														'wunderpaint'
												  )
												: __(
														'Auto-frame subject',
														'wunderpaint'
												  ) }
										</button>
										<button
											className="ai-btn secondary"
											disabled={
												auto || ! info.sizes.length
											}
											onClick={ () => suggest( true ) }
										>
											{ __(
												'Auto for all sizes',
												'wunderpaint'
											) }
										</button>
									</>
								) }
								<span style={ { flex: 1 } } />
								<button
									className="ai-btn ghost"
									onClick={ onClose }
									disabled={ busy }
								>
									{ __( 'Close', 'wunderpaint' ) }
								</button>
								<button
									className="ai-btn primary"
									disabled={ ! dirty.size || busy }
									onClick={ save }
								>
									{ busy
										? __( 'Saving…', 'wunderpaint' )
										: sprintf(
												/* translators: %d: number of changed sizes. */
												__(
													'Save crops (%d)',
													'wunderpaint'
												),
												dirty.size
										  ) }
								</button>
							</div>
						</div>
					</div>
				) }
			</div>
		</div>
	);
}
