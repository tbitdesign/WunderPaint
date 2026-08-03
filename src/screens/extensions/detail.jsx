/**
 * Full page for one extension inside the manager: the complete description
 * that the cards only tease, deep links to try and read about it, and every
 * action the current state allows. Errors (API gate, runtime issues) are
 * explained here rather than crammed into the card.
 */
import { __, sprintf } from '@wordpress/i18n';

import { I } from '../../icons';
import { POINT_LABELS, categoryLabel } from './labels';

// Canonical product URLs. Deep links are DERIVED, never fetched from the
// marketing site: the demo opens the extension by its slug, docs and details
// resolve from the display name. Shown only for official catalog extensions
// (card.tier set), so a user's own uploaded ZIP never gets a dead link.
const DEMO_BASE = 'https://demo.wp-image-editor.com';
const HELP_BASE = 'https://help.wp-image-editor.com';
const SITE_BASE = 'https://wp-image-editor.com';
const slugify = ( s ) =>
	( s || '' )
		.toLowerCase()
		.replace( /[^a-z0-9]+/g, '-' )
		.replace( /^-+|-+$/g, '' );

export function ExtensionDetail( {
	card,
	crumb,
	busy,
	canManage,
	deliveryUrl,
	proActive,
	proUrl,
	needsReload,
	issues,
	onBack,
	onToggle,
	onRemove,
	onProInstall,
} ) {
	const isPro = 'pro' === card.tier;
	const dl =
		deliveryUrl && card.download
			? deliveryUrl.replace( /\/$/, '' ) + card.download
			: null;
	const nameSlug = slugify( card.name );
	const links = card.tier
		? [
				{
					href: `${ DEMO_BASE }/?wpie-demo=1&wpie-open=${ encodeURIComponent(
						card.slug
					) }`,
					label: __( 'Try in the live demo', 'wunderpaint' ),
				},
				{
					href: `${ HELP_BASE }/glossary-ext-${ nameSlug }.html`,
					label: __( 'Documentation', 'wunderpaint' ),
				},
				{
					href: `${ SITE_BASE }/extensions/${ nameSlug }/`,
					label: __( 'Details and previews', 'wunderpaint' ),
				},
		  ]
		: [];
	const actions = [];
	if ( card.installed && canManage ) {
		actions.push(
			<button
				key="toggle"
				className="ai-btn secondary"
				disabled={ busy }
				onClick={ () => onToggle( card ) }
			>
				{ card.enabled
					? __( 'Disable', 'wunderpaint' )
					: __( 'Enable', 'wunderpaint' ) }
			</button>
		);
	}
	if ( 'update' === card.state || ! card.installed ) {
		if ( isPro && ! proActive ) {
			actions.push(
				<a
					key="pro"
					className="ai-btn primary"
					href={ proUrl }
					target="_blank"
					rel="noreferrer"
				>
					{ __( 'Get Pro', 'wunderpaint' ) }
				</a>
			);
		} else if ( isPro && proActive && canManage ) {
			actions.push(
				<button
					key="install"
					className="ai-btn primary"
					disabled={ busy }
					onClick={ () => onProInstall( card ) }
				>
					{ 'update' === card.state
						? __( 'Update', 'wunderpaint' )
						: __( 'Install', 'wunderpaint' ) }
				</button>
			);
		} else if ( dl ) {
			actions.push(
				<a key="dl" className="ai-btn primary" href={ dl } download>
					{ 'update' === card.state
						? __( 'Download update', 'wunderpaint' )
						: __( 'Download', 'wunderpaint' ) }
				</a>
			);
		}
	}
	if ( card.installed && canManage ) {
		actions.push(
			<button
				key="remove"
				className="ai-btn danger"
				disabled={ busy }
				onClick={ () => onRemove( card ) }
			>
				{ __( 'Remove', 'wunderpaint' ) }
			</button>
		);
	}
	return (
		<div className="ext-detail">
			<button className="ext-detail-back" onClick={ onBack }>
				{ I.chevRight( { size: 14 } ) }
				<span>{ [ ...crumb, card.name ].join( ' › ' ) }</span>
			</button>
			<div className="ext-detail-title">
				<strong>{ card.name }</strong>
				{ isPro && (
					<span className="ext-chip ext-chip-pro">
						{ __( 'Pro', 'wunderpaint' ) }
					</span>
				) }
				{ 'free' === card.tier && (
					<span className="ext-chip">
						{ __( 'Free', 'wunderpaint' ) }
					</span>
				) }
				{ 'update' === card.state && (
					<span className="ext-chip ext-chip-update">
						{ __( 'Update available', 'wunderpaint' ) }
					</span>
				) }
				{ false === card.enabled && (
					<span className="ext-chip ext-chip-off">
						{ __( 'Disabled', 'wunderpaint' ) }
					</span>
				) }
			</div>
			<div className="ext-detail-meta">
				{ !! card.installedVersion && (
					<span>
						{ sprintf(
							/* translators: %s: version number. */
							__( 'Installed: v%s', 'wunderpaint' ),
							card.installedVersion
						) }
					</span>
				) }
				{ !! card.catalogVersion &&
					card.catalogVersion !== card.installedVersion && (
						<span>
							{ sprintf(
								/* translators: %s: version number. */
								__( 'Latest: v%s', 'wunderpaint' ),
								card.catalogVersion
							) }
						</span>
					) }
				{ !! card.author && (
					<span>
						{ sprintf(
							/* translators: %s: author name. */
							__( 'By %s', 'wunderpaint' ),
							card.author
						) }
					</span>
				) }
				<span>{ categoryLabel( card.category ) }</span>
				{ ( card.provides || [] ).map( ( p ) => (
					<span key={ p } className="ext-chip">
						{ POINT_LABELS[ p.replace( /s$/, '' ).toLowerCase() ] ||
							p }
					</span>
				) ) }
				{ !! card.homepage && (
					<a href={ card.homepage } target="_blank" rel="noreferrer">
						{ __( 'Website', 'wunderpaint' ) }
					</a>
				) }
			</div>
			{ !! actions.length && (
				<div className="ext-detail-actions">{ actions }</div>
			) }
			{ ! card.installed && ! isPro && (
				<div className="ext-detail-hint">
					{ __(
						'Free extensions come as a ZIP: download it, then add it below with "Install from ZIP". Nothing is fetched behind your back.',
						'wunderpaint'
					) }
				</div>
			) }
			{ needsReload && (
				<div className="ext-detail-hint">
					{ __(
						'Takes effect after the editor is reloaded.',
						'wunderpaint'
					) }
				</div>
			) }
			{ !! card.apiBlocked && (
				<div className="ext-row-error">
					{ sprintf(
						/* translators: %s: required API version. */
						__(
							'Built for a newer editor (needs API %s). Update WunderPaint to use it.',
							'wunderpaint'
						),
						card.requiresApi
					) }
				</div>
			) }
			{ ( issues || [] ).map( ( issue, i ) => (
				<div key={ i } className="ext-row-error">
					{ issue.message }
				</div>
			) ) }
			{ !! card.description && (
				<div className="ext-detail-desc">{ card.description }</div>
			) }
			{ !! links.length && (
				<div className="ext-detail-links">
					{ links.map( ( l ) => (
						<a
							key={ l.href }
							className="ai-btn secondary"
							href={ l.href }
							target="_blank"
							rel="noreferrer"
						>
							{ l.label }
						</a>
					) ) }
				</div>
			) }
		</div>
	);
}
