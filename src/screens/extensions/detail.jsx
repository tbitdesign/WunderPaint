/**
 * Full page for one extension: the complete description that the cards only
 * tease, deep links to try and read about it, and the one action there is -
 * on or off. Errors (API gate, runtime issues) are explained here rather
 * than crammed into the card.
 *
 * Installing, updating and removing are not here any more; the free plugin
 * cannot do any of it (see dialog.jsx). Pro's own manager has that half.
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
	busy,
	canManage,
	needsReload,
	issues,
	onBack,
	onToggle,
} ) {
	const isPro = 'pro' === card.tier;
	const nameSlug = slugify( card.name );
	// Shown for anything that belongs to the official gallery: a catalogue
	// entry (tier set) or a studio that ships inside the plugin. A package
	// somebody sideloaded gets no links, so none of them can be dead.
	const official = !! ( card.tier || card.bundled );
	const links = official
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
	return (
		<div className="ext-detail">
			<button className="ext-detail-back" onClick={ onBack }>
				{ I.chevRight( { size: 14 } ) }
				<span>{ card.name }</span>
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
