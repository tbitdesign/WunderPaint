/**
 * Depth Blur dialog (v1.27): estimate a depth map for the active layer, then
 * preview a graduated background blur with Focus + Strength sliders and bake it
 * on Apply. Fully local (Depth Anything via the self-hosted model).
 */

import { useState, useEffect, useRef } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { I } from '../icons';
import { useEditor, activeLayerOf } from '../store/editor-context';
import { useEscape } from '../components/use-escape';
import { HelpLink } from './help-dialog';
import { isModelInstalled } from '../lib/ml';
import { estimateDepth, renderDepthBlur } from '../lib/depth-blur';
import { layerDataUrl, replaceLayerContent } from '../lib/ai-actions';

export function DepthBlurDialog( { onClose, extras } ) {
	const editor = useEditor();
	const layer = activeLayerOf( editor.state );
	const [ status, setStatus ] = useState( 'loading' ); // loading|ready|missing|applying|error
	const [ errMsg, setErrMsg ] = useState( '' );
	const [ focus, setFocus ] = useState( 50 );
	const [ strength, setStrength ] = useState( 3.5 );
	const dRef = useRef( null );
	const previewRef = useRef( null );
	useEscape( onClose );

	useEffect( () => {
		let cancelled = false;
		( async () => {
			if ( ! layer ) {
				setErrMsg( __( 'Select a layer first.', 'wunderpaint' ) );
				setStatus( 'error' );
				return;
			}
			if ( ! isModelInstalled( 'depth' ) ) {
				setStatus( 'missing' );
				return;
			}
			try {
				const url = await layerDataUrl( editor.state, layer, 1536 );
				const d = await estimateDepth( url );
				if ( cancelled ) {
					return;
				}
				dRef.current = d;
				setFocus( Math.round( d.autoFocus * 100 ) );
				setStatus( 'ready' );
			} catch ( e ) {
				if ( ! cancelled ) {
					setErrMsg( ( e && e.message ) || String( e ) );
					setStatus( 'error' );
				}
			}
		} )();
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [] );

	useEffect( () => {
		if ( 'ready' !== status || ! dRef.current || ! previewRef.current ) {
			return;
		}
		const cv = renderDepthBlur( dRef.current, focus / 100, strength );
		const p = previewRef.current;
		p.width = cv.width;
		p.height = cv.height;
		p.getContext( '2d' ).drawImage( cv, 0, 0 );
	}, [ status, focus, strength ] );

	const apply = async () => {
		if ( ! dRef.current || ! layer ) {
			return;
		}
		setStatus( 'applying' );
		try {
			const url = renderDepthBlur(
				dRef.current,
				focus / 100,
				strength
			).toDataURL();
			await replaceLayerContent(
				editor,
				layer,
				url,
				__( 'Depth Blur', 'wunderpaint' )
			);
			onClose();
		} catch ( e ) {
			setErrMsg( ( e && e.message ) || String( e ) );
			setStatus( 'error' );
		}
	};

	return (
		<div className="modal-backdrop" onClick={ onClose } role="presentation">
			<div
				className="stock-dialog"
				style={ {
					width: 560,
					height: 'auto',
					maxHeight: '88vh',
					gridTemplateRows: 'auto 1fr',
				} }
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-label={ __( 'Depth Blur', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<div className="dsm-title-row">
							<span className="dsm-title">
								{ __(
									'Depth Blur (background)',
									'wunderpaint'
								) }
							</span>
							<HelpLink article="ai" extras={ extras } />
						</div>
						<div className="dsm-sub">
							{ __(
								'Depth-of-field blur: keep the focus sharp, melt the background away.',
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

				<div style={ { padding: 16, overflowY: 'auto' } }>
					{ 'missing' === status && (
						<p style={ { fontSize: 13 } }>
							{ __(
								'The Depth model isn’t installed yet. Download it under Settings → WunderPaint → AI Models (local), then reopen this.',
								'wunderpaint'
							) }{ ' ' }
							<a
								href={ editor.WPIE?.settingsUrl }
								target="_blank"
								rel="noreferrer"
							>
								{ __( 'Open Settings', 'wunderpaint' ) }
							</a>
						</p>
					) }

					{ 'loading' === status && (
						<p
							style={ {
								fontSize: 13,
								color: 'var(--ed-text-muted)',
							} }
						>
							{ __( 'Estimating depth…', 'wunderpaint' ) }
						</p>
					) }

					{ 'error' === status && (
						<p style={ { fontSize: 13, color: 'var(--danger)' } }>
							{ errMsg }
						</p>
					) }

					{ ( 'ready' === status || 'applying' === status ) && (
						<div style={ { display: 'grid', gap: 14 } }>
							<div
								style={ {
									lineHeight: 0,
									borderRadius: 8,
									overflow: 'hidden',
									border: '1px solid var(--ed-border)',
								} }
							>
								<canvas
									ref={ previewRef }
									style={ {
										display: 'block',
										width: '100%',
										height: 'auto',
									} }
								/>
							</div>
							<label
								style={ {
									display: 'flex',
									alignItems: 'center',
									gap: 10,
									fontSize: 12,
								} }
							>
								<span style={ { width: 90 } }>
									{ __( 'Focus depth', 'wunderpaint' ) }
								</span>
								<input
									type="range"
									min="0"
									max="100"
									value={ focus }
									style={ { flex: 1 } }
									onChange={ ( e ) =>
										setFocus( +e.target.value )
									}
								/>
							</label>
							<label
								style={ {
									display: 'flex',
									alignItems: 'center',
									gap: 10,
									fontSize: 12,
								} }
							>
								<span style={ { width: 90 } }>
									{ __( 'Strength', 'wunderpaint' ) }
								</span>
								<input
									type="range"
									min="1"
									max="8"
									step="0.5"
									value={ strength }
									style={ { flex: 1 } }
									onChange={ ( e ) =>
										setStrength( +e.target.value )
									}
								/>
							</label>
							<div
								style={ {
									display: 'flex',
									justifyContent: 'flex-end',
									gap: 8,
								} }
							>
								<button
									className="ai-btn secondary"
									onClick={ onClose }
								>
									{ __( 'Cancel', 'wunderpaint' ) }
								</button>
								<button
									className="ai-btn primary"
									disabled={ 'applying' === status }
									onClick={ apply }
								>
									{ 'applying' === status
										? __( 'Applying…', 'wunderpaint' )
										: __( 'Apply', 'wunderpaint' ) }
								</button>
							</div>
						</div>
					) }
				</div>
			</div>
		</div>
	);
}
