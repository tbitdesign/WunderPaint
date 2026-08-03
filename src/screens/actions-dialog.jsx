/**
 * Actions dialog (v1.25.0): the macro recorder / saved-actions manager, moved
 * out of the right-panel tabs into a modal opened from the Actions menu so the
 * tab strip stays lean.
 */

import { __ } from '@wordpress/i18n';

import { I } from '../icons';
import { useEscape } from '../components/use-escape';
import { HelpLink } from './help-dialog';
import { ActionsPanel } from './panels/actions-panel';

export function ActionsDialog( { extras, onClose } ) {
	useEscape( onClose );
	return (
		<div className="modal-backdrop" onClick={ onClose } role="presentation">
			<div
				className="stock-dialog"
				style={ {
					width: 520,
					height: 'auto',
					maxHeight: '85vh',
					gridTemplateRows: 'auto 1fr',
				} }
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-label={ __( 'Actions', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<div className="dsm-title-row">
							<span className="dsm-title">
								{ __( 'Actions', 'wunderpaint' ) }
							</span>
							<HelpLink article="actions" extras={ extras } />
						</div>
						<div className="dsm-sub">
							{ __(
								'Record, play and manage reusable action sequences.',
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
				<div style={ { overflowY: 'auto' } }>
					<ActionsPanel extras={ extras } />
				</div>
			</div>
		</div>
	);
}
