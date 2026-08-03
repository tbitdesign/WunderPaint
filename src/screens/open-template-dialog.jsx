/**
 * File → Open Template (v1.160.0): a slim picker over the saved dynamic
 * templates. Opening carries the template identity, so the title bar
 * shows the badge and Save updates the template in place - the direct
 * maintenance entry that previously required the Asset Library detour.
 */

import { useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { templates } from '../lib/api';
import { I } from '../icons';
import { useEscape } from '../components/use-escape';
import { HelpLink } from './help-dialog';
import { openTemplateDocument } from './library-dialog';

export function OpenTemplateDialog( { editor, extras, onClose } ) {
	const [ list, setList ] = useState( null );
	useEscape( onClose );

	useEffect( () => {
		templates
			.list()
			.then( ( items ) => setList( items || [] ) )
			.catch( () => setList( [] ) );
	}, [] );

	return (
		<div className="modal-backdrop" onClick={ onClose } role="presentation">
			<div
				className="export-dialog wpie-open-template"
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-label={ __( 'Open Template', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<span className="dsm-title">
							{ __( 'Open Template', 'wunderpaint' ) }
						</span>
						<HelpLink article="templates" extras={ extras } />
						<div className="dsm-sub">
							{ __(
								'Edit a dynamic template; saving updates it in place.',
								'wunderpaint'
							) }
						</div>
					</div>
					<button
						className="dsm-close"
						onClick={ onClose }
						aria-label={ __( 'Close', 'wunderpaint' ) }
					>
						{ I.close ? I.close( { size: 17 } ) : '✕' }
					</button>
				</div>
				<div className="export-body">
					{ null === list && (
						<p
							style={ {
								margin: 0,
								color: 'var(--ed-text-muted)',
							} }
						>
							{ __( 'Loading…', 'wunderpaint' ) }
						</p>
					) }
					{ list && ! list.length && (
						<p
							style={ {
								margin: 0,
								color: 'var(--ed-text-muted)',
							} }
						>
							{ __(
								'No dynamic templates yet. Design something and use File → Save as Dynamic Template.',
								'wunderpaint'
							) }
						</p>
					) }
					{ list && list.length > 0 && (
						<div className="wpie-open-template-grid">
							{ list.map( ( t ) => (
								<button
									key={ t.id }
									className="wpie-open-template-card"
									onClick={ async () => {
										if (
											await openTemplateDocument(
												editor,
												t,
												extras
											)
										) {
											onClose();
										}
									} }
								>
									{ t.preview ? (
										<img
											src={ t.preview }
											alt=""
											loading="lazy"
										/>
									) : (
										<span className="wpie-open-template-empty">
											{ I.image
												? I.image( { size: 20 } )
												: null }
										</span>
									) }
									<span className="wpie-open-template-name">
										{ t.name }
									</span>
								</button>
							) ) }
						</div>
					) }
				</div>
			</div>
		</div>
	);
}
