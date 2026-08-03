/**
 * Effect dialog with live canvas preview (v1.0.5). While open, the active
 * layer carries a transient `previewEffect` that the renderer applies at
 * device scale, every slider move shows up on the canvas immediately.
 * Apply bakes the effect via applyEffectToLayer (Smart Filter on smart
 * objects); Cancel/unmount removes the preview without touching history.
 */

import {
	useState,
	useEffect,
	useRef,
	Fragment,
	useId,
} from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { I } from '../icons';
import { effectById, defaultParamsFor } from '../lib/effects';
import { useEditor, activeLayerOf } from '../store/editor-context';
import { applyEffectToLayer } from '../store/effect-ops';
import { CurveEditor } from './curve-editor';
import { SnapSlider } from './snap-slider';
import { SwatchButton } from './color-popover';
import { useEscape } from './use-escape';

export function EffectDialog( { effectId, onClose, extras } ) {
	// Unique per mount, so two of these can never share an id.
	const fieldId = useId();
	const editor = useEditor();
	const effect = effectById( effectId );
	const layerId = useRef( activeLayerOf( editor.state )?.id );
	const [ params, setParams ] = useState( () =>
		defaultParamsFor( effectId )
	);
	const debounce = useRef( null );
	const editorRef = useRef( editor );
	editorRef.current = editor;
	useEscape( onClose );

	const patchPreview = ( nextParams ) => {
		if ( ! layerId.current ) {
			return;
		}
		editorRef.current.dispatch( {
			type: 'UPDATE_LAYER',
			id: layerId.current,
			patch: {
				previewEffect: nextParams
					? { id: effectId, params: nextParams }
					: null,
			},
		} );
	};

	// Live preview: seed with defaults, debounce slider streams a little.
	useEffect( () => {
		patchPreview( params );
		return () => {
			clearTimeout( debounce.current );
			patchPreview( null );
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [] );

	const update = ( next ) => {
		setParams( next );
		clearTimeout( debounce.current );
		debounce.current = setTimeout( () => patchPreview( next ), 80 );
	};

	if ( ! effect || ! layerId.current ) {
		return null;
	}
	const isSmart =
		'smart' ===
		editor.state.layers.find( ( l ) => l.id === layerId.current )?.type;

	const apply = () => {
		clearTimeout( debounce.current );
		patchPreview( null );
		applyEffectToLayer( editorRef.current, effectId, params ).catch( () =>
			extras.toasts.error(
				__( 'Could not apply the effect.', 'wunderpaint' )
			)
		);
		onClose();
	};

	return (
		<div
			className="effect-dialog"
			role="dialog"
			aria-label={ effect.label }
		>
			<div className="create-head" style={ { padding: '10px 12px' } }>
				<span>{ effect.label }</span>
				<button
					className="wp-modal-close"
					onClick={ onClose }
					aria-label={ __( 'Close', 'wunderpaint' ) }
				>
					{ I.close( { size: 14 } ) }
				</button>
			</div>
			<div className="effect-dialog-body">
				{ Object.keys( effect.params || {} ).length === 0 && (
					<p
						style={ {
							fontSize: 12,
							color: 'var(--ed-text-muted)',
							margin: 0,
						} }
					>
						{ __(
							'This effect has no options, the canvas shows the result.',
							'wunderpaint'
						) }
					</p>
				) }
				{ Object.entries( effect.params || {} ).map(
					( [ key, schema ] ) => (
						<Fragment key={ key }>
							{ 'data' === schema.type ? null : 'curve' ===
							  schema.type ? (
								<CurveEditor
									points={ params[ key ] }
									onChange={ ( pts ) =>
										update( { ...params, [ key ]: pts } )
									}
								/>
							) : 'bool' === schema.type ? (
								<label
									style={ {
										display: 'flex',
										gap: 6,
										fontSize: 12,
										padding: '4px 0',
									} }
								>
									<input
										type="checkbox"
										checked={ !! params[ key ] }
										onChange={ ( e ) =>
											update( {
												...params,
												[ key ]: e.target.checked,
											} )
										}
									/>
									{ key }
								</label>
							) : 'color' === schema.type ? (
								<div
									className="field"
									style={ {
										gridTemplateColumns: '70px 1fr',
									} }
								>
									<label htmlFor={ fieldId + '-' + key }>
										{ key }
									</label>
									{ /* House rule: our HSV picker, no OS color dialog (v1.8). */ }
									<SwatchButton
										id={ fieldId + '-' + key }
										color={ params[ key ] }
										onChange={ ( c ) =>
											update( { ...params, [ key ]: c } )
										}
									/>
								</div>
							) : (
								<div className="slider-row">
									<label htmlFor={ fieldId + '-' + key }>
										{ key }
									</label>
									<SnapSlider
										id={ fieldId + '-' + key }
										min={ schema.min }
										max={ schema.max }
										step={ schema.step || 1 }
										value={ params[ key ] }
										def={ schema.default ?? 0 }
										ariaLabel={ key }
										onChange={ ( v ) =>
											update( { ...params, [ key ]: v } )
										}
									/>
									<span className="val">
										{ params[ key ] }
									</span>
								</div>
							) }
						</Fragment>
					)
				) }
				<p className="effect-live-note">
					{ __( 'Live preview on the canvas.', 'wunderpaint' ) }
				</p>
				<div style={ { display: 'flex', gap: 6 } }>
					<button
						className="ai-btn primary"
						style={ { flex: 1 } }
						onClick={ apply }
					>
						{ isSmart
							? __( 'Add Smart Filter', 'wunderpaint' )
							: __( 'Apply', 'wunderpaint' ) }
					</button>
					<button className="ai-btn secondary" onClick={ onClose }>
						{ __( 'Cancel', 'wunderpaint' ) }
					</button>
				</div>
			</div>
		</div>
	);
}
