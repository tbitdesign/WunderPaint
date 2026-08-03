/**
 * Small, friendly hint shown when a Pro feature's menu entry is picked
 * while the Pro add-on is not installed or licensed (v1.79). Deliberately
 * quiet: one card, one sentence, no nag loops.
 */

import { __, sprintf } from '@wordpress/i18n';

import { I } from '../icons';
import { useEscape } from '../components/use-escape';

export function ProTeaserDialog( { label, onClose } ) {
	useEscape( onClose );
	return (
		<div className="modal-backdrop" onClick={ onClose } role="presentation">
			<div
				className="dsm pro-teaser"
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-label={ label }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<div className="dsm-title-row">
							<span className="dsm-title">{ label }</span>
							<span className="dsm-chip-ai">Pro</span>
						</div>
						<div className="dsm-sub">
							{ __( 'Part of WunderPaint Pro', 'wunderpaint' ) }
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
				<div className="dsm-body">
					<p className="pro-teaser-text">
						{ sprintf(
							/* translators: %s: feature name. */
							__(
								'“%s” is part of WunderPaint Pro, together with the AI Content Generator, automation, CSV merge, batch processing, multiple brand kits and S3 backups.',
								'wunderpaint'
							),
							label
						) }
					</p>
				</div>
				<div className="dsm-foot">
					<span className="dsm-hint" />
					<div className="dsm-actions">
						<button className="ai-btn ghost" onClick={ onClose }>
							{ __( 'Close', 'wunderpaint' ) }
						</button>
						{ !! window.WPIE?.proUrl && (
							<a
								className="ai-btn primary"
								href={ window.WPIE.proUrl }
								target="_blank"
								rel="noreferrer"
								style={ { textDecoration: 'none' } }
							>
								{ __( 'Get Pro', 'wunderpaint' ) }
							</a>
						) }
					</div>
				</div>
			</div>
		</div>
	);
}
