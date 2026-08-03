/**
 * Magic Resize (v1.11): retarget the document to another format without
 * distortion, pick a social preset or custom dimensions; every layer
 * scales uniformly and the composition recenters.
 */

import { useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { I } from '../icons';
import { useEditor } from '../store/editor-context';
import { useEscape } from '../components/use-escape';
import { HelpLink } from './help-dialog';
import { magicResizeDoc } from '../store/doc-ops';

const PRESETS = [
	[ 'Instagram Post', 1080, 1080 ],
	[ 'Instagram Story', 1080, 1920 ],
	[ 'Facebook Post', 1200, 630 ],
	[ 'YouTube Thumbnail', 1280, 720 ],
	[ 'X Header', 1500, 500 ],
	[ 'Pinterest Pin', 1000, 1500 ],
	[ 'LinkedIn Banner', 1584, 396 ],
	[ 'Full HD', 1920, 1080 ],
];

export function MagicResizeDialog( { onClose, extras } ) {
	const editor = useEditor();
	const { doc } = editor.state;
	const [ w, setW ] = useState( doc.w );
	const [ h, setH ] = useState( doc.h );
	useEscape( onClose );

	const valid = w >= 16 && h >= 16 && w <= 12000 && h <= 12000;
	const apply = ( tw, th ) => {
		if ( ! magicResizeDoc( editor, tw, th ) ) {
			extras.toasts.error( __( 'Invalid size.', 'wunderpaint' ) );
			return;
		}
		extras.toasts.success(
			sprintf(
				/* translators: 1: width, 2: height. */
				__(
					'Resized to %1$d × %2$d px, undo restores the old format.',
					'wunderpaint'
				),
				Math.round( tw ),
				Math.round( th )
			)
		);
		onClose();
	};

	return (
		<div className="modal-backdrop" onClick={ onClose } role="presentation">
			<div
				className="stock-dialog"
				style={ {
					width: 460,
					height: 'auto',
					gridTemplateRows: 'auto 1fr',
				} }
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-label={ __( 'Resize Design', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<div className="dsm-title-row">
							<span className="dsm-title">
								{ __( 'Resize Design', 'wunderpaint' ) }
							</span>
							<HelpLink article="resize" extras={ extras } />
						</div>
						<div className="dsm-sub">
							{ __(
								'Rescales the whole design to a new format.',
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
				<div style={ { padding: 16, display: 'grid', gap: 14 } }>
					<div
						style={ {
							fontSize: 12,
							color: 'var(--ed-text-muted)',
						} }
					>
						{ sprintf(
							/* translators: 1: width, 2: height. */
							__(
								'Current: %1$d × %2$d px. Layers scale uniformly, nothing gets distorted.',
								'wunderpaint'
							),
							doc.w,
							doc.h
						) }
					</div>
					<div
						style={ {
							display: 'grid',
							gridTemplateColumns: '1fr 1fr',
							gap: 6,
						} }
					>
						{ PRESETS.map( ( [ label, pw, ph ] ) => (
							<button
								key={ label }
								className="ai-btn secondary"
								style={ {
									justifyContent: 'space-between',
									display: 'inline-flex',
								} }
								onClick={ () => apply( pw, ph ) }
							>
								<span>{ label }</span>
								<span
									style={ {
										color: 'var(--ed-text-muted)',
										fontSize: 11,
									} }
								>
									{ pw }×{ ph }
								</span>
							</button>
						) ) }
					</div>
					<div
						style={ { display: 'flex', gap: 8, alignItems: 'end' } }
					>
						<label
							style={ { display: 'grid', gap: 4, fontSize: 12 } }
						>
							{ __( 'Width', 'wunderpaint' ) }
							<input
								type="number"
								value={ w }
								style={ { width: 90 } }
								aria-label={ __( 'Width', 'wunderpaint' ) }
								onChange={ ( e ) =>
									setW( Math.round( +e.target.value || 0 ) )
								}
							/>
						</label>
						<label
							style={ { display: 'grid', gap: 4, fontSize: 12 } }
						>
							{ __( 'Height', 'wunderpaint' ) }
							<input
								type="number"
								value={ h }
								style={ { width: 90 } }
								aria-label={ __( 'Height', 'wunderpaint' ) }
								onChange={ ( e ) =>
									setH( Math.round( +e.target.value || 0 ) )
								}
							/>
						</label>
						<button
							className="ai-btn primary"
							disabled={ ! valid }
							onClick={ () => apply( w, h ) }
						>
							{ __( 'Resize', 'wunderpaint' ) }
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
