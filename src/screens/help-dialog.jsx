/**
 * In-editor handbook (v1.304): categorized, searchable articles with
 * step-by-step walkthroughs, tips and buttons that open the real dialogs.
 */

import { useState, useEffect, useRef } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { I } from '../icons';
import {
	HELP_ARTICLES,
	HELP_CATEGORIES,
	searchArticles,
} from '../help/content';
import { HELP_GUIDES } from '../help/guides';
import { useEscape } from '../components/use-escape';

export function HelpDialog( { initial, onClose, onStartGuide, extras } ) {
	useEscape( onClose );
	const [ query, setQuery ] = useState( '' );
	const [ activeId, setActiveId ] = useState(
		initial && HELP_ARTICLES.some( ( a ) => a.id === initial )
			? initial
			: HELP_ARTICLES[ 0 ].id
	);
	const inputRef = useRef( null );
	const articleRef = useRef( null );
	useEffect( () => inputRef.current?.focus(), [] );
	useEffect( () => {
		articleRef.current?.scrollTo?.( 0, 0 );
	}, [ activeId ] );

	const results = searchArticles( HELP_ARTICLES, query );
	const active =
		results.find( ( a ) => a.id === activeId ) ||
		results[ 0 ] ||
		HELP_ARTICLES.find( ( a ) => a.id === activeId );
	const guides = ( active?.guides || [] )
		.map( ( id ) => HELP_GUIDES.find( ( g ) => g.id === id ) )
		.filter( Boolean );

	const articleButton = ( article ) => (
		<button
			key={ article.id }
			className={ active?.id === article.id ? 'active' : '' }
			onClick={ () => setActiveId( article.id ) }
		>
			{ article.title }
		</button>
	);

	return (
		<div
			className="modal-backdrop help-top"
			onClick={ onClose }
			role="presentation"
		>
			<div
				className="help-dialog"
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-label={ __( 'Handbook', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<div className="dsm-title-row">
							<span className="dsm-title">
								{ __( 'Handbook', 'wunderpaint' ) }
							</span>
						</div>
						<div className="dsm-sub">
							{ __(
								'Short, searchable articles for every part of the editor.',
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
				<div className="help-body">
					<div className="help-sidebar">
						<input
							ref={ inputRef }
							type="search"
							placeholder={ __( 'Search help…', 'wunderpaint' ) }
							value={ query }
							onChange={ ( e ) => setQuery( e.target.value ) }
							aria-label={ __( 'Search help', 'wunderpaint' ) }
						/>
						<div className="help-list">
							{ query.trim()
								? results.map( articleButton )
								: HELP_CATEGORIES.map( ( cat ) => {
										const inCat = results.filter(
											( a ) => a.cat === cat.id
										);
										return inCat.length ? (
											<div
												key={ cat.id }
												className="help-cat"
											>
												<div className="help-cat-title">
													{ cat.title }
												</div>
												{ inCat.map( articleButton ) }
											</div>
										) : null;
								  } ) }
							{ 0 === results.length && (
								<div className="help-empty">
									{ __( 'No matches.', 'wunderpaint' ) }
								</div>
							) }
						</div>
						<div className="help-guides">
							<div className="help-guides-title">
								{ __( 'Guided how-tos', 'wunderpaint' ) }
							</div>
							{ HELP_GUIDES.map( ( guide ) => (
								<button
									key={ guide.id }
									onClick={ () => onStartGuide( guide ) }
								>
									▶ { guide.title }
								</button>
							) ) }
						</div>
					</div>
					<div className="help-article" ref={ articleRef }>
						{ active && (
							<>
								<h2>{ active.title }</h2>
								{ !! active.proNote &&
									! window.WPIE?.pro?.active && (
										<p className="help-pro-note">
											<span className="help-pro-chip">
												{ __( 'Pro', 'wunderpaint' ) }
											</span>
											{ active.proNote }
										</p>
									) }
								{ !! active.actions?.length && (
									<div className="help-actions">
										{ active.actions.map( ( action, i ) => (
											<button
												key={ i }
												onClick={ () => {
													onClose();
													action.run( extras );
												} }
											>
												{ I.popout( { size: 13 } ) }
												{ action.label }
											</button>
										) ) }
									</div>
								) }
								{ active.body.map( ( paragraph, i ) => (
									<p key={ i }>{ paragraph }</p>
								) ) }
								{ !! active.steps?.length && (
									<>
										<h3>
											{ __(
												'Step by step',
												'wunderpaint'
											) }
										</h3>
										<ol className="help-steps">
											{ active.steps.map( ( step, i ) => (
												<li key={ i }>{ step }</li>
											) ) }
										</ol>
									</>
								) }
								{ ( active.tips || [] ).map( ( tip, i ) => (
									<div className="help-tip" key={ i }>
										<strong>
											{ __(
												'Good to know',
												'wunderpaint'
											) }
										</strong>
										<span>{ tip }</span>
									</div>
								) ) }
								{ !! guides.length && (
									<div className="help-article-guides">
										{ guides.map( ( guide ) => (
											<button
												key={ guide.id }
												onClick={ () =>
													onStartGuide( guide )
												}
											>
												▶ { guide.title }
											</button>
										) ) }
									</div>
								) }
							</>
						) }
					</div>
				</div>
			</div>
		</div>
	);
}

/** Small contextual "?" that opens the handbook at a specific article. */
export function HelpLink( { article, extras } ) {
	return (
		<button
			type="button"
			className="help-link"
			title={ __( 'Help for this dialog', 'wunderpaint' ) }
			aria-label={ __( 'Help', 'wunderpaint' ) }
			onClick={ ( e ) => {
				e.stopPropagation();
				extras.openHelp?.( article );
			} }
		>
			?
		</button>
	);
}
