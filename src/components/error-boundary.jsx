/**
 * Error boundaries: a render error stays a broken panel, not a white page.
 *
 * Two shapes. `root` wraps the whole app: it flushes an autosave snapshot
 * while the document is still intact (getDerivedStateFromError runs
 * before the failed tree is unmounted), then shows a plain screen with
 * reload, project download and the technical details. Without `root` it
 * wraps one panel and offers to try again in place.
 *
 * The root screen carries its own inline styles on purpose: it renders
 * outside `.editor-root`, so none of the editor's variables reach it, and
 * a crash screen must not depend on the stylesheet that may be the thing
 * that failed.
 */
import { Component } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { logEvent } from '../lib/debug-log';
import {
	flushLastResort,
	downloadLastResort,
	hasLastResort,
} from '../lib/last-resort';

const message = ( error ) =>
	String( ( error && error.message ) || error || 'Unknown error' );

export class ErrorBoundary extends Component {
	constructor( props ) {
		super( props );
		this.state = { error: null, saved: null };
		this.reset = () => this.setState( { error: null, saved: null } );
	}

	static getDerivedStateFromError( error ) {
		// Side effect in a static, deliberately: this is the only moment
		// the document is still mounted and consistent.
		ErrorBoundary.pendingFlush = flushLastResort();
		return { error };
	}

	componentDidCatch( error, info ) {
		logEvent(
			'error',
			this.props.source || 'ui',
			message( error ),
			info && info.componentStack
		);
		if ( this.props.root && ErrorBoundary.pendingFlush ) {
			ErrorBoundary.pendingFlush.then( ( ok ) =>
				this.setState( { saved: !! ok } )
			);
		}
	}

	render() {
		const { error, saved } = this.state;
		if ( ! error ) {
			return this.props.children;
		}
		if ( ! this.props.root ) {
			return (
				<div className="ed-crash-box" role="alert">
					<p>
						{ this.props.label
							? this.props.label
							: __(
									'This panel ran into a problem.',
									'wunderpaint'
							  ) }
					</p>
					<code>{ message( error ) }</code>
					<button
						type="button"
						className="ai-btn"
						onClick={ this.reset }
					>
						{ __( 'Try again', 'wunderpaint' ) }
					</button>
				</div>
			);
		}
		return (
			<div style={ ROOT.wrap } role="alert">
				<div style={ ROOT.card }>
					<h1 style={ ROOT.title }>
						{ __(
							'WunderPaint ran into a problem',
							'wunderpaint'
						) }
					</h1>
					<p style={ ROOT.text }>
						{ saved
							? __(
									'A snapshot of your work was just saved in this browser. Reload, and the editor offers to restore it.',
									'wunderpaint'
							  )
							: __(
									'Reload the editor. If a recent snapshot exists in this browser, the editor offers to restore it.',
									'wunderpaint'
							  ) }
					</p>
					<div style={ ROOT.row }>
						<button
							type="button"
							style={ { ...ROOT.btn, ...ROOT.primary } }
							onClick={ () => window.location.reload() }
						>
							{ __( 'Reload the editor', 'wunderpaint' ) }
						</button>
						{ hasLastResort( 'download' ) && (
							<button
								type="button"
								style={ ROOT.btn }
								onClick={ () => downloadLastResort() }
							>
								{ __(
									'Download project (.wpie)',
									'wunderpaint'
								) }
							</button>
						) }
					</div>
					<details style={ ROOT.details }>
						<summary>
							{ __( 'Technical details', 'wunderpaint' ) }
						</summary>
						<pre style={ ROOT.pre }>
							{ message( error ) }
							{ '\n' }
							{ ( error && error.stack ) || '' }
						</pre>
					</details>
				</div>
			</div>
		);
	}
}

const ROOT = {
	wrap: {
		position: 'fixed',
		inset: 0,
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		background: '#1e1f24',
		color: '#e8e8ec',
		fontFamily:
			'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
		fontSize: 14,
		zIndex: 100000,
	},
	card: {
		width: 'min(560px, calc(100vw - 32px))',
		background: '#2a2b31',
		border: '1px solid #3d3e46',
		borderRadius: 10,
		padding: '28px 28px 20px',
	},
	title: { margin: '0 0 10px', fontSize: 20, fontWeight: 600 },
	text: { margin: '0 0 18px', lineHeight: 1.5, color: '#c9c9d1' },
	row: { display: 'flex', gap: 10, flexWrap: 'wrap' },
	btn: {
		height: 36,
		padding: '0 16px',
		borderRadius: 6,
		border: '1px solid #4a4b54',
		background: '#33343b',
		color: '#e8e8ec',
		font: 'inherit',
		cursor: 'pointer',
	},
	primary: { background: '#3b82f6', borderColor: '#3b82f6', color: '#fff' },
	details: { marginTop: 18, color: '#9a9aa6', fontSize: 12 },
	pre: {
		margin: '8px 0 0',
		maxHeight: 180,
		overflow: 'auto',
		whiteSpace: 'pre-wrap',
		wordBreak: 'break-word',
		color: '#b9b9c3',
		fontSize: 11,
	},
};
