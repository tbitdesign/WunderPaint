/**
 * Help Assistant (v1.253): a grounded chatbot for "how do I …?"
 * questions, opened via Help → Help Assistant. Answers come from the
 * bundled feature knowledge base through the configured text provider;
 * when an answer matches an interactive tour, a "Show me" button plays
 * it as spotlight steps over the live UI.
 *
 * The panel docks bottom-left next to the tool rail (the Navigator
 * lives bottom-right and stays clear). It stays mounted while the
 * editor is open so the conversation survives close/reopen.
 */

import { useState, useRef, useEffect } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { I } from '../icons';
import { assistant } from '../lib/api';
import { HELP_GUIDES } from '../help/guides';

const SUGGESTIONS = [
	__( 'How do I add and style text?', 'wunderpaint' ),
	__( 'What is a shape layer?', 'wunderpaint' ),
	__( 'What are dynamic templates?', 'wunderpaint' ),
	__( 'How do I remove a background?', 'wunderpaint' ),
	__( 'How do actions and batch processing work?', 'wunderpaint' ),
];

/** Whether any text-capable AI provider is configured. */
const hasTextProviderKey = () => {
	const p = window.WPIE?.providers || {};
	return !! ( p.anthropic || p.openai || p.gemini );
};

export function HelpAssistant( { open, onClose, extras } ) {
	const [ messages, setMessages ] = useState( [] ); // {role, content, tour?}
	const [ input, setInput ] = useState( '' );
	const [ busy, setBusy ] = useState( false );
	const listRef = useRef( null );
	const inputRef = useRef( null );

	useEffect( () => {
		if ( open ) {
			inputRef.current?.focus();
		}
	}, [ open ] );

	useEffect( () => {
		const el = listRef.current;
		if ( el ) {
			el.scrollTop = el.scrollHeight;
		}
	}, [ messages, busy, open ] );

	const send = async ( text ) => {
		const q = String( text || '' ).trim();
		if ( ! q || busy ) {
			return;
		}
		const next = [ ...messages, { role: 'user', content: q } ];
		setMessages( next );
		setInput( '' );
		setBusy( true );
		try {
			const res = await assistant.chat(
				next.map( ( m ) => ( {
					role: m.role,
					content: m.content,
				} ) )
			);
			setMessages( ( cur ) => [
				...cur,
				{
					role: 'assistant',
					content: String( res?.answer || '' ),
					tour: String( res?.tour || '' ),
				},
			] );
		} catch ( err ) {
			setMessages( ( cur ) => [
				...cur,
				{
					role: 'assistant',
					content:
						( err?.message ||
							__(
								'Something went wrong, please try again.',
								'wunderpaint'
							) ) + '',
					error: true,
				},
			] );
		} finally {
			setBusy( false );
		}
	};

	const startTour = ( id ) => {
		onClose();
		if ( 'welcome' === id ) {
			extras.openTour();
			return;
		}
		const guide = HELP_GUIDES.find( ( g ) => g.id === id );
		if ( guide ) {
			extras.startGuide( guide );
		}
	};

	if ( ! open ) {
		return null;
	}

	const configured = hasTextProviderKey();

	return (
		<div
			className="wpie-helpbot"
			role="dialog"
			aria-label={ __( 'Help Assistant', 'wunderpaint' ) }
		>
			<div className="wpie-helpbot-head">
				<span className="wpie-helpbot-badge">
					{ I.brand( { size: 20 } ) }
				</span>
				<strong>{ __( 'Help Assistant', 'wunderpaint' ) }</strong>
				{ messages.length > 0 && (
					<button
						type="button"
						className="wpie-helpbot-clear"
						onClick={ () => setMessages( [] ) }
						title={ __( 'New conversation', 'wunderpaint' ) }
						aria-label={ __( 'New conversation', 'wunderpaint' ) }
					>
						{ I.plus( { size: 14 } ) }
					</button>
				) }
				<button
					type="button"
					className="wpie-helpbot-close"
					onClick={ onClose }
					aria-label={ __( 'Close', 'wunderpaint' ) }
				>
					{ I.close( { size: 14 } ) }
				</button>
			</div>

			<div className="wpie-helpbot-list" ref={ listRef }>
				{ ! configured && (
					<div className="wpie-helpbot-note">
						{ __(
							'The Help Assistant needs an AI text provider. Add an API key (Gemini, OpenAI or Anthropic) under Settings → WunderPaint → AI Providers.',
							'wunderpaint'
						) }
					</div>
				) }
				{ configured && 0 === messages.length && (
					<div className="wpie-helpbot-empty">
						<p>
							{ __(
								'Ask me anything about the editor - what a feature is, where to find it or how a workflow goes.',
								'wunderpaint'
							) }
						</p>
						<div className="wpie-helpbot-pills">
							{ SUGGESTIONS.map( ( s ) => (
								<button
									key={ s }
									type="button"
									onClick={ () => send( s ) }
								>
									{ s }
								</button>
							) ) }
						</div>
					</div>
				) }
				{ messages.map( ( m, i ) => (
					<div
						key={ i }
						className={
							'wpie-helpbot-msg ' +
							( 'user' === m.role ? 'user' : 'bot' ) +
							( m.error ? ' error' : '' )
						}
					>
						<div className="wpie-helpbot-bubble">{ m.content }</div>
						{ !! m.tour && (
							<button
								type="button"
								className="ai-btn sm wpie-helpbot-tourbtn"
								onClick={ () => startTour( m.tour ) }
							>
								{ I.eye( { size: 13 } ) }{ ' ' }
								{ __( 'Show me (tour)', 'wunderpaint' ) }
							</button>
						) }
					</div>
				) ) }
				{ busy && (
					<div className="wpie-helpbot-msg bot">
						<div className="wpie-helpbot-bubble wpie-helpbot-typing">
							<span />
							<span />
							<span />
						</div>
					</div>
				) }
			</div>

			<form
				className="wpie-helpbot-inputrow"
				onSubmit={ ( e ) => {
					e.preventDefault();
					send( input );
				} }
			>
				<input
					ref={ inputRef }
					type="text"
					value={ input }
					disabled={ ! configured }
					placeholder={ __( 'Ask a question…', 'wunderpaint' ) }
					onChange={ ( e ) => setInput( e.target.value ) }
				/>
				<button
					type="submit"
					className="ai-btn primary sm"
					disabled={ busy || ! configured || ! input.trim() }
				>
					{ __( 'Send', 'wunderpaint' ) }
				</button>
			</form>
		</div>
	);
}
