/**
 * The three finished dialogs that used to live inside editor-main.jsx, plus
 * the TopLayer portal they all mount through.
 *
 * They were never part of the editor shell's job - they are self-contained
 * screens with no state of their own beyond what they are handed, and they
 * made up 475 of that file's 1578 lines (v1.341.0). What stays behind is the
 * shell: the extras table, the flags and the dialog wiring, which IS coherent
 * and is deliberately left alone.
 */

import { useState, useRef, useEffect, createPortal } from '@wordpress/element';
import { useEscape } from '../components/use-escape';
import { I } from '../icons';
import { __, sprintf } from '@wordpress/i18n';
import { useEditor } from '../store/editor-context';
import { request } from '../lib/api';
import { LICENSE_GPL, LICENSE_THIRD_PARTY } from '../lib/license-texts';
import {
	listShortcutBindings,
	setShortcutOverride,
	findConflict,
	comboString,
	comboOf,
} from '../lib/shortcuts';

/**
 * Renders its children into a fresh element appended to #wpie-root at
 * mount time. Modals inside #wpie-root stack by DOM order (same
 * z-index), so a dialog opened FROM a later-mounted dialog (e.g. Brand
 * Kits from the Pro Generate Content modal) would otherwise appear
 * behind its opener.
 */
export function TopLayer( { children } ) {
	const hostRef = useRef( null );
	if ( ! hostRef.current ) {
		hostRef.current = document.createElement( 'div' );
		// Above the shared-picker host (150000, lib/media-pick.js) so a
		// dialog opened from a pick-mode manager still lands on top.
		hostRef.current.style.position = 'relative';
		hostRef.current.style.zIndex = '150001';
	}
	useEffect( () => {
		const rootEl = document.getElementById( 'wpie-root' ) || document.body;
		rootEl.appendChild( hostRef.current );
		const host = hostRef.current;
		return () => host.remove();
	}, [] );
	return createPortal( children, hostRef.current );
}

export function ShortcutHelpDialog( { onClose } ) {
	useEscape( onClose );
	const [ bindings, setBindings ] = useState( listShortcutBindings );
	const [ capturing, setCapturing ] = useState( null ); // id | null
	const [ conflict, setConflict ] = useState( null );

	const prettify = ( combo ) =>
		combo
			.replace( 'mod+', '⌘' )
			.replace( 'shift+', '⇧' )
			.replace( 'alt+', '⌥' )
			.toUpperCase();

	const capture = ( id ) => ( e ) => {
		e.preventDefault();
		e.stopPropagation();
		if ( 'Escape' === e.key ) {
			setCapturing( null );
			setConflict( null );
			return;
		}
		if ( [ 'Shift', 'Control', 'Meta', 'Alt' ].includes( e.key ) ) {
			return; // wait for the actual key
		}
		const combo = comboString( comboOf( e ) );
		const clash = findConflict( combo, id );
		if ( clash ) {
			setConflict( { id, with: clash } );
			return;
		}
		setShortcutOverride( id, combo );
		setBindings( listShortcutBindings() );
		setCapturing( null );
		setConflict( null );
	};

	const staticRows = [
		[ 'Space (hold)', __( 'Temporary Hand tool (pan)', 'wunderpaint' ) ],
		[
			__( 'Arrows (⇧ = 10px)', 'wunderpaint' ),
			__( 'Nudge active layer', 'wunderpaint' ),
		],
		[ '[ / ]', __( 'Brush size down / up', 'wunderpaint' ) ],
		[ '⌘[ / ⌘]', __( 'Send backward / Bring forward', 'wunderpaint' ) ],
		[
			'Enter / Esc',
			__( 'Commit / cancel (crop, pen, text)', 'wunderpaint' ),
		],
		[
			'⌫',
			__( 'Delete layer (or clear selection contents)', 'wunderpaint' ),
		],
		[ '0–9', __( 'Layer opacity', 'wunderpaint' ) ],
	];

	return (
		<div className="modal-backdrop" onClick={ onClose } role="presentation">
			<div
				className="export-dialog"
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-label={ __( 'Keyboard shortcuts', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<span className="dsm-title">
							{ __( 'Keyboard Shortcuts', 'wunderpaint' ) }
						</span>
						<div className="dsm-sub">
							{ __(
								'Every key the editor listens to.',
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
				<div
					className="export-body"
					style={ { maxHeight: 460, overflowY: 'auto' } }
				>
					<p
						style={ {
							fontSize: 11,
							color: 'var(--ed-text-muted)',
							margin: '0 0 8px',
						} }
					>
						{ __(
							'Click a shortcut to remap it, then press the new keys. Esc cancels.',
							'wunderpaint'
						) }
					</p>
					{ bindings.map( ( b ) => (
						<div
							key={ b.id }
							style={ {
								display: 'grid',
								gridTemplateColumns: '150px 1fr 24px',
								gap: 10,
								fontSize: 12,
								padding: '2px 0',
								alignItems: 'center',
							} }
						>
							{ capturing === b.id ? (
								<input
									autoFocus
									readOnly
									value={
										conflict?.id === b.id
											? sprintf(
													/* translators: %s: command name. */
													__(
														'In use by “%s”',
														'wunderpaint'
													),
													conflict.with.label
											  )
											: __( 'Press keys…', 'wunderpaint' )
									}
									onKeyDown={ capture( b.id ) }
									onBlur={ () => {
										setCapturing( null );
										setConflict( null );
									} }
									style={ {
										border: `1px solid ${
											conflict?.id === b.id
												? 'var(--danger, #d63638)'
												: 'var(--accent)'
										}`,
										borderRadius: 3,
										background: 'var(--ed-panel-alt)',
										color:
											conflict?.id === b.id
												? 'var(--danger, #d63638)'
												: 'var(--ed-text)',
										padding: '1px 6px',
										width: 140,
									} }
								/>
							) : (
								<button
									className="kbd-chip"
									title={ __(
										'Click to remap',
										'wunderpaint'
									) }
									onClick={ () => setCapturing( b.id ) }
								>
									{ prettify( b.combo ) }
								</button>
							) }
							<span>{ b.label }</span>
							{ ! b.isDefault ? (
								<button
									className="wp-modal-close"
									title={ __(
										'Reset to default',
										'wunderpaint'
									) }
									aria-label={ __(
										'Reset to default',
										'wunderpaint'
									) }
									onClick={ () => {
										setShortcutOverride( b.id, null );
										setBindings( listShortcutBindings() );
									} }
								>
									↺
								</button>
							) : (
								<span />
							) }
						</div>
					) ) }
					{ bindings.some( ( b ) => ! b.isDefault ) && (
						<button
							className="ai-btn secondary"
							style={ { marginTop: 8 } }
							onClick={ () => {
								bindings.forEach( ( b ) =>
									setShortcutOverride( b.id, null )
								);
								setBindings( listShortcutBindings() );
							} }
						>
							{ __( 'Reset all to defaults', 'wunderpaint' ) }
						</button>
					) }
					<div
						style={ {
							borderTop: '1px solid var(--ed-border)',
							margin: '10px 0 6px',
						} }
					/>
					{ staticRows.map( ( [ combo, label ] ) => (
						<div
							key={ combo }
							style={ {
								display: 'grid',
								gridTemplateColumns: '150px 1fr',
								gap: 10,
								fontSize: 12,
								padding: '3px 0',
							} }
						>
							<code
								style={ {
									fontFamily: 'var(--font-mono)',
									color: 'var(--ed-text-dim)',
								} }
							>
								{ combo }
							</code>
							<span>{ label }</span>
						</div>
					) ) }
				</div>
			</div>
		</div>
	);
}

// The license text is BUNDLED (src/lib/license-texts.js), so the About window
// shows it with no network request - the plugin makes no external calls.
function LicenseAccordion( { title, text } ) {
	return (
		<details className="about-acc">
			<summary>{ title }</summary>
			<div className="about-acc-body">
				<pre>{ text }</pre>
			</div>
		</details>
	);
}

export function AboutDialog( { onClose } ) {
	const { WPIE } = useEditor();
	useEscape( onClose );
	// Live version check (v1.130.2): WPIE.version is frozen at page load,
	// so a long-running editor session shows a stale number after the
	// plugin was updated. Ask the server on open, offer a reload.
	const [ installed, setInstalled ] = useState( null );
	useEffect( () => {
		request( { path: '/version', method: 'GET' } )
			.then( ( r ) => setInstalled( r?.version || null ) )
			.catch( () => {} );
	}, [] );
	const outdated = installed && installed !== WPIE?.version;
	return (
		<div className="modal-backdrop" onClick={ onClose } role="presentation">
			<div
				className="export-dialog about-dialog"
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-label={ __( 'About', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<span className="dsm-title">
							{ __( 'About WunderPaint', 'wunderpaint' ) }
						</span>
						<div className="dsm-sub">
							{ __(
								'Version, credits and legal information.',
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
					<p className="about-lead">
						{ __(
							'WunderPaint is a complete, layer-based design studio built directly into the WordPress Media Library. Open any image or start from a blank canvas and work with layers, masks, blend modes, adjustment layers and a full non-destructive history, without ever leaving your site.',
							'wunderpaint'
						) }
					</p>
					<p className="about-para">
						{ __(
							'It is made for everyday edits and ambitious designs alike: precise selections and retouching, vector shapes with editable paths, a rich text engine with styles, text on a path and text inside a shape, gradients, patterns, filters and effects, smart objects, dynamic templates and PSD import and export. Charts, QR codes, mockups and a growing family of studios and extensions turn a single image into finished, on-brand graphics.',
							'wunderpaint'
						) }
					</p>
					<p className="about-para">
						{ __(
							'Optional assistants take on the heavy lifting, from image generation and background removal to upscaling, metadata and a design assistant, with several models running locally in your browser for privacy. Everything is drawn through one rendering pipeline, so the canvas you design on is exactly what you export.',
							'wunderpaint'
						) }
					</p>
					{ outdated && (
						<p className="about-outdated">
							{ sprintf(
								/* translators: %s: version number. */
								__(
									'Version %s is installed. This session still runs the version it was loaded with.',
									'wunderpaint'
								),
								installed
							) }{ ' ' }
							<a
								href="#wpie-reload"
								onClick={ ( e ) => {
									e.preventDefault();
									window.location.reload();
								} }
							>
								{ __( 'Reload editor', 'wunderpaint' ) }
							</a>
						</p>
					) }
					<div className="about-acc-group">
						<LicenseAccordion
							title={ __(
								'License: GNU General Public License, version 2 or later',
								'wunderpaint'
							) }
							text={ LICENSE_GPL }
						/>
						<LicenseAccordion
							title={ __(
								'Third-party licenses',
								'wunderpaint'
							) }
							text={ LICENSE_THIRD_PARTY }
						/>
					</div>
					<p className="about-copy">
						© 2026 TBIT DESIGN · Thomas Breher
					</p>
				</div>
				<div className="dsm-foot">
					<span className="dsm-mono">
						{ __( 'Version', 'wunderpaint' ) }{ ' ' }
						{ WPIE?.version || '' }
					</span>
					<div className="dsm-actions">
						<a
							className="ai-btn"
							href={
								WPIE?.proUrl || 'https://wp-image-editor.com/'
							}
							target="_blank"
							rel="noreferrer"
						>
							{ __( 'Visit website', 'wunderpaint' ) }
						</a>
						{ ! window.WPIE?.pro?.active && (
							<a
								className="ai-btn"
								href="https://wp-image-editor.com/pricing/"
								target="_blank"
								rel="noreferrer"
							>
								{ __( 'Get Pro', 'wunderpaint' ) }
							</a>
						) }
						<button className="ai-btn primary" onClick={ onClose }>
							{ __( 'Close', 'wunderpaint' ) }
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

// First-run font source picker (v1.316). The plugin bundles 10 families and
// knows a much larger catalog; the admin decides once whether to download the
// rest locally (default, GDPR-clean), load them from the Google CDN on demand,
// or stay with the ten. Only shown to admins, after the onboarding tour.
export function FontFirstRunDialog( { onClose } ) {
	const [ phase, setPhase ] = useState( 'ask' ); // ask | working | done
	const [ progress, setProgress ] = useState( { done: 0, total: 0 } );
	const cancelledRef = useRef( false );
	useEscape( () => {
		if ( 'working' !== phase ) {
			onClose();
		}
	} );

	const recordChoice = ( choice ) => {
		request( {
			path: '/fonts/choice',
			method: 'POST',
			data: { choice },
		} ).catch( () => {} );
		if ( window.WPIE ) {
			window.WPIE.fontsFirstRun = false;
			if ( 'google' === choice ) {
				window.WPIE.fontsGoogle = true;
			}
		}
	};

	const chooseGoogle = () => {
		recordChoice( 'google' );
		onClose();
	};
	const chooseSkip = () => {
		recordChoice( 'skip' );
		onClose();
	};

	const chooseDownload = async () => {
		cancelledRef.current = false;
		setPhase( 'working' );
		let prev = -1;
		let keepGoing = true;
		while ( keepGoing ) {
			if ( cancelledRef.current ) {
				break;
			}
			let result;
			try {
				result = await request( {
					path: '/fonts/library',
					method: 'POST',
				} );
			} catch ( e ) {
				break;
			}
			const done = ( result.downloaded || [] ).length;
			setProgress( { done, total: result.total || 0 } );
			if ( window.WPIE ) {
				window.WPIE.fontsDownloaded = result.downloaded || [];
				window.WPIE.fontsFirstRun = false;
			}
			// Stop when finished, or when a whole batch made no progress.
			if ( result.done || done <= prev ) {
				keepGoing = false;
			} else {
				prev = done;
			}
		}
		if ( cancelledRef.current ) {
			// The pick is already stored server-side after the first batch.
			onClose();
			return;
		}
		setPhase( 'done' );
	};

	return (
		<div className="modal-backdrop" role="presentation">
			<div
				className="export-dialog about-dialog"
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-label={ __( 'Fonts', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand ? I.brand( { size: 24 } ) : null }
					</span>
					<div className="dsm-titles">
						<span className="dsm-title">
							{ __( 'Set up your fonts', 'wunderpaint' ) }
						</span>
						<div className="dsm-sub">
							{ __(
								'Choose how the editor gets its fonts.',
								'wunderpaint'
							) }
						</div>
					</div>
				</div>
				<div className="export-body">
					{ 'ask' === phase && (
						<>
							<p className="about-lead">
								{ __(
									'The editor comes with 10 built-in font families and knows a much larger catalog. Download the full catalog once so every family is available and served straight from your own site, with no external requests while you design. This is the recommended, privacy-friendly option.',
									'wunderpaint'
								) }
							</p>
							<p className="about-para">
								{ __(
									'Only your server contacts Google during the download. You can instead load fonts from the Google CDN on demand, which sends visitor IP addresses to Google while they work, or skip for now and stay with the 10 built-in families. You can change this any time under Settings, Fonts.',
									'wunderpaint'
								) }
							</p>
						</>
					) }
					{ 'working' === phase && (
						<p className="about-lead">
							{ sprintf(
								/* translators: 1: downloaded count, 2: total. */
								__(
									'Downloading font families to your site: %1$d of %2$d. You can keep working; it finishes in the background. Cancel to stop and keep what has arrived so far.',
									'wunderpaint'
								),
								progress.done,
								progress.total
							) }
						</p>
					) }
					{ 'done' === phase && (
						<p className="about-lead">
							{ __(
								'All set. The full font library is installed locally and every family is now available in the picker.',
								'wunderpaint'
							) }
						</p>
					) }
				</div>
				<div className="dsm-foot">
					<div className="dsm-actions">
						{ 'ask' === phase && (
							<>
								<button
									className="ai-btn"
									onClick={ chooseSkip }
								>
									{ __( 'Not now', 'wunderpaint' ) }
								</button>
								<button
									className="ai-btn"
									onClick={ chooseGoogle }
								>
									{ __( 'Use Google CDN', 'wunderpaint' ) }
								</button>
								<button
									className="ai-btn primary"
									onClick={ chooseDownload }
								>
									{ __( 'Download library', 'wunderpaint' ) }
								</button>
							</>
						) }
						{ 'working' === phase && (
							<button
								className="ai-btn"
								onClick={ () => {
									cancelledRef.current = true;
								} }
							>
								{ __( 'Cancel', 'wunderpaint' ) }
							</button>
						) }
						{ 'done' === phase && (
							<button
								className="ai-btn primary"
								onClick={ onClose }
							>
								{ __( 'Close', 'wunderpaint' ) }
							</button>
						) }
					</div>
				</div>
			</div>
		</div>
	);
}
