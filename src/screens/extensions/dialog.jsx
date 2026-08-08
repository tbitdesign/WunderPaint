/**
 * Extensions: what this editor has, and a switch per entry.
 *
 * The free plugin ships its studios inside itself, so this screen is a
 * library and not a shop. It cannot install, update or remove anything -
 * there is no upload here, no catalogue request and no delete, because the
 * free plugin has no route for any of that any more (wordpress.org review,
 * 2026-08-08: a ZIP of JavaScript that the editor then runs is arbitrary
 * code insertion, however carefully the archive is checked first).
 *
 * When Pro is active, Help > Manage Extensions opens ITS manager instead of
 * this one: same list and switches, plus the catalogue, installing, updating
 * and removing. So this screen is what a free install sees, not a reduced
 * half of something else.
 *
 * Switching a package off still needs a reload to take effect - a script
 * that has run cannot be unrun.
 */

import { useState, useEffect, useMemo } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { I } from '../../icons';
import { useEscape } from '../../components/use-escape';
import { HelpLink } from '../help-dialog';
import { listExtensions, toggleExtension } from '../../lib/extension-loader';
import {
	listExtensionIssues,
	subscribeExtensions,
	API_VERSION,
} from '../../lib/extensions';
import { ExtensionCard } from './card';
import { ExtensionDetail } from './detail';

export function ExtensionsDialog( { onClose, extras } ) {
	const [ list, setList ] = useState( () => window.WPIE?.extensions || [] );
	const [ busy, setBusy ] = useState( false );
	// Slugs whose on-disk state differs from the running session.
	const [ reloadSlugs, setReloadSlugs ] = useState( [] );
	const [ , setTick ] = useState( 0 );
	const [ query, setQuery ] = useState( '' );
	const [ detailSlug, setDetailSlug ] = useState( null );
	useEscape( detailSlug ? () => setDetailSlug( null ) : onClose );

	useEffect(
		() => subscribeExtensions( () => setTick( ( t ) => t + 1 ) ),
		[]
	);
	useEffect( () => {
		listExtensions()
			.then( setList )
			.catch( () => {} );
	}, [] );

	const markReload = ( slug ) =>
		setReloadSlugs( ( s ) => ( s.includes( slug ) ? s : [ ...s, slug ] ) );

	const toggle = async ( card ) => {
		setBusy( true );
		try {
			const next = await toggleExtension( card.slug, ! card.enabled );
			setList( ( l ) =>
				l.map( ( e ) => ( e.slug === card.slug ? next : e ) )
			);
			// Enabling can load the code straight away; disabling cannot
			// unload it, so that direction always asks for a reload.
			markReload( card.slug );
		} catch ( err ) {
			extras.toasts.error( err.message );
		}
		setBusy( false );
	};

	const issues = listExtensionIssues();
	const canManage = !! window.WPIE?.canExtensions;

	const cards = useMemo(
		() =>
			list.map( ( e ) => ( {
				...e,
				installed: true,
				state: e.apiBlocked ? 'error' : 'installed',
			} ) ),
		[ list ]
	);
	const shown = useMemo( () => {
		const q = query.trim().toLowerCase();
		if ( ! q ) {
			return cards;
		}
		return cards.filter(
			( c ) =>
				c.name.toLowerCase().includes( q ) ||
				String( c.description || '' )
					.toLowerCase()
					.includes( q )
		);
	}, [ cards, query ] );
	const detail = detailSlug
		? cards.find( ( c ) => c.slug === detailSlug )
		: null;

	return (
		<div className="modal-backdrop" onClick={ onClose } role="presentation">
			<div
				className="export-dialog extensions-dialog"
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-label={ __( 'Extensions', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<span className="dsm-title">
							{ __( 'Extensions', 'wunderpaint' ) }
						</span>
						<HelpLink article="extensions" extras={ extras } />
						<div className="dsm-sub">
							{ __(
								'Generators, asset packs, effects and tools that come with the editor.',
								'wunderpaint'
							) }
						</div>
					</div>
					<input
						className="ext-search"
						type="search"
						placeholder={ __(
							'Search extensions…',
							'wunderpaint'
						) }
						value={ query }
						onChange={ ( e ) => {
							setQuery( e.target.value );
							setDetailSlug( null );
						} }
					/>
					<button
						className="dsm-close"
						onClick={ onClose }
						aria-label={ __( 'Close', 'wunderpaint' ) }
					>
						{ I.close ? I.close( { size: 17 } ) : '✕' }
					</button>
				</div>
				<div className="ext-body ext-body-plain">
					<div className="ext-main">
						{ detail ? (
							<ExtensionDetail
								card={ detail }
								busy={ busy }
								canManage={ canManage }
								needsReload={ reloadSlugs.includes(
									detail.slug
								) }
								issues={ issues.filter(
									( i ) => i.source === detail.slug
								) }
								onBack={ () => setDetailSlug( null ) }
								onToggle={ toggle }
							/>
						) : (
							<>
								<div className="ext-main-heading">
									{ query.trim()
										? sprintf(
												/* translators: %d: number of matches. */
												__(
													'Search results (%d)',
													'wunderpaint'
												),
												shown.length
										  )
										: __( 'Installed', 'wunderpaint' ) }
								</div>
								{ ! shown.length && (
									<div className="ext-empty">
										{ __( 'Nothing here.', 'wunderpaint' ) }
									</div>
								) }
								<div className="ext-gallery-grid">
									{ shown.map( ( card ) => (
										<ExtensionCard
											key={ card.slug }
											card={ card }
											busy={ busy }
											canManage={ canManage }
											needsReload={ reloadSlugs.includes(
												card.slug
											) }
											hasIssues={ issues.some(
												( i ) => i.source === card.slug
											) }
											onOpen={ ( c ) =>
												setDetailSlug( c.slug )
											}
											onToggle={ toggle }
										/>
									) ) }
								</div>
							</>
						) }
					</div>
				</div>
				<div className="ext-foot">
					<span className="ext-foot-api">
						{ sprintf(
							/* translators: %s: API version. */
							__( 'API v%s', 'wunderpaint' ),
							API_VERSION
						) }
					</span>
				</div>
			</div>
		</div>
	);
}
