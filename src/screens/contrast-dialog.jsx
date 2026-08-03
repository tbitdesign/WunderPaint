/**
 * Contrast checker dialog (v1.15): WCAG rating for every text layer
 * against what actually lies under it; click a row to select the layer.
 */

import { useState, useEffect } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { I } from '../icons';
import { useEditor } from '../store/editor-context';
import { useEscape } from '../components/use-escape';
import { HelpLink } from './help-dialog';
import { checkContrast } from '../lib/contrast-check';

export function ContrastDialog( { onClose, extras } ) {
	const editor = useEditor();
	const { state, dispatch } = editor;
	const [ results, setResults ] = useState( null );
	useEscape( onClose );

	useEffect( () => {
		let cancelled = false;
		checkContrast( state.doc, state.layers )
			.then( ( list ) => ! cancelled && setResults( list ) )
			.catch( () => ! cancelled && setResults( [] ) );
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [] );

	const failing = ( results || [] ).filter( ( r ) => ! r.pass ).length;

	return (
		<div className="modal-backdrop" onClick={ onClose } role="presentation">
			<div
				className="stock-dialog contrast-dialog"
				style={ {
					width: 460,
					height: 'auto',
					gridTemplateRows: 'auto 1fr',
				} }
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-label={ __( 'Contrast check', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<div className="dsm-title-row">
							<span className="dsm-title">
								{ __( 'Contrast Check', 'wunderpaint' ) }
							</span>
							<HelpLink
								article="design-tools"
								extras={ extras }
							/>
						</div>
						<div className="dsm-sub">
							{ __(
								'Checks your text layers against WCAG contrast.',
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
				<div style={ { padding: 16, display: 'grid', gap: 10 } }>
					{ null === results && (
						<div className="library-hint">
							<span className="spin" />{ ' ' }
							{ __( 'Checking text layers…', 'wunderpaint' ) }
						</div>
					) }
					{ results && 0 === results.length && (
						<div className="library-hint">
							{ __(
								'No visible text layers to check.',
								'wunderpaint'
							) }
						</div>
					) }
					{ results && results.length > 0 && (
						<div
							style={ {
								fontSize: 12,
								color: 'var(--ed-text-muted)',
							} }
						>
							{ failing
								? sprintf(
										/* translators: %d: number of layers. */
										__(
											'%d text layer(s) fall below the WCAG contrast recommendation.',
											'wunderpaint'
										),
										failing
								  )
								: __(
										'All text layers meet the WCAG contrast recommendation.',
										'wunderpaint'
								  ) }
						</div>
					) }
					{ ( results || [] ).map( ( r ) => (
						<button
							key={ r.id }
							className="contrast-row"
							onClick={ () => {
								dispatch( { type: 'SET_ACTIVE', id: r.id } );
								onClose();
							} }
						>
							<span
								className="contrast-swatch"
								style={ { background: r.textColor } }
							/>
							<span className="contrast-name">{ r.name }</span>
							<span
								className={ `contrast-ratio ${
									r.pass ? 'pass' : 'fail'
								}` }
							>
								{ r.ratio }:1{ ' ' }
								{ r.pass
									? '✓'
									: sprintf(
											/* translators: %s: required ratio. */
											__( '(needs %s:1)', 'wunderpaint' ),
											r.required
									  ) }
							</span>
						</button>
					) ) }
				</div>
			</div>
		</div>
	);
}
