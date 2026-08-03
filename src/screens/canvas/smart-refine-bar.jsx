/**
 * Smart Select refine card (v1.125, redesigned v1.125.1): after a Smart
 * Select click the friendly path appears - soften/grow the edge and hit
 * the primary "Cut Out" button to apply the result as a layer mask in
 * one go. Made for people who have never touched a mask; closing keeps
 * the plain selection for the classic workflow.
 */

import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { I } from '../../icons';
import * as Ops from '../../store/ops';

export function SmartRefineBar( { editor, extras, onClose } ) {
	const [ feather, setFeather ] = useState( 2 );
	const [ expand, setExpand ] = useState( 0 );
	const [ busy, setBusy ] = useState( false );

	const apply = ( invert ) => {
		setBusy( true );
		try {
			Ops.cutOutOp( editor, { feather, expand, invert } );
			extras.toasts.success(
				invert
					? __(
							'Removed! Nothing is lost: right-click the layer and choose Delete Mask to bring everything back.',
							'wunderpaint'
					  )
					: __(
							'Cut out! Nothing is lost: right-click the layer and choose Delete Mask to bring everything back.',
							'wunderpaint'
					  )
			);
		} catch ( err ) {
			extras.toasts.error( err.message );
		}
		setBusy( false );
	};

	return (
		<div
			className="smart-refine"
			role="dialog"
			aria-label={ __( 'Refine selection', 'wunderpaint' ) }
			onPointerDown={ ( e ) => e.stopPropagation() }
			onMouseDown={ ( e ) => e.stopPropagation() }
			onDoubleClick={ ( e ) => e.stopPropagation() }
		>
			<div className="smart-refine-head">
				<span className="smart-refine-title">
					{ I.smartselect ? I.smartselect( { size: 14 } ) : null }
					{ __( 'Subject selected', 'wunderpaint' ) }
				</span>
				<button
					className="smart-refine-close"
					title={ __( 'Keep as selection', 'wunderpaint' ) }
					aria-label={ __( 'Keep as selection', 'wunderpaint' ) }
					onClick={ onClose }
				>
					{ I.close ? I.close( { size: 14 } ) : '✕' }
				</button>
			</div>
			<label className="smart-refine-field">
				<span>{ __( 'Soft edge', 'wunderpaint' ) }</span>
				<input
					type="range"
					min="0"
					max="25"
					value={ feather }
					onChange={ ( e ) => setFeather( +e.target.value ) }
				/>
			</label>
			<label className="smart-refine-field">
				<span>{ __( 'Grow / shrink', 'wunderpaint' ) }</span>
				<input
					type="range"
					min="-15"
					max="15"
					value={ expand }
					onChange={ ( e ) => setExpand( +e.target.value ) }
				/>
			</label>
			<button
				className="ai-btn primary smart-refine-cta"
				disabled={ busy }
				title={ __(
					'Keeps only the highlighted area on the layer.',
					'wunderpaint'
				) }
				onClick={ () => apply( false ) }
			>
				{ __( 'Keep this', 'wunderpaint' ) }
			</button>
			<button
				className="ai-btn secondary smart-refine-cta"
				disabled={ busy }
				title={ __(
					'Deletes the highlighted area from the layer.',
					'wunderpaint'
				) }
				onClick={ () => apply( true ) }
			>
				{ __( 'Remove this', 'wunderpaint' ) }
			</button>
			<button
				className="ai-btn ghost smart-refine-cta"
				disabled={ busy }
				title={ __(
					'Drops the current points so the next click picks a different object.',
					'wunderpaint'
				) }
				onClick={ () =>
					editor.dispatch( {
						type: 'SET_SELECTION',
						selection: null,
					} )
				}
			>
				{ __( 'New selection', 'wunderpaint' ) }
			</button>
			<div className="smart-refine-hint">
				{ __( 'Click adds areas, Alt-click removes.', 'wunderpaint' ) }
			</div>
		</div>
	);
}
