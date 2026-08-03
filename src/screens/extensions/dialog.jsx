/**
 * Extensions manager: a two-pane modal. The sidebar holds the library
 * (installed, updates) and the catalog by category; the main pane shows
 * one unified card grid, a detail page per extension, and a global
 * search that looks across everything. Free packages download as a ZIP
 * (wp.org: no remote code), Pro installs in one click. Fresh installs
 * are injected live; disabling or updating an already loaded package
 * takes effect on the next reload (scripts cannot be unloaded).
 */

import { useRef, useState, useEffect, useMemo } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { I } from '../../icons';
import { useEscape } from '../../components/use-escape';
import { HelpLink } from '../help-dialog';
import { confirmDialog } from '../../lib/dialogs';
import {
	listExtensions,
	installExtension,
	toggleExtension,
	deleteExtension,
	injectExtension,
} from '../../lib/extension-loader';
import {
	listExtensionIssues,
	subscribeExtensions,
	API_VERSION,
} from '../../lib/extensions';
import {
	mergeCatalog,
	groupCounts,
	filterCards,
} from '../../lib/extension-catalog';
import { request } from '../../lib/api';
import { ExtensionsSidebar } from './sidebar';
import { ExtensionCard } from './card';
import { ExtensionDetail } from './detail';
import { categoryLabel } from './labels';

export function ExtensionsDialog( { onClose, extras } ) {
	const [ list, setList ] = useState( () => window.WPIE?.extensions || [] );
	const [ busy, setBusy ] = useState( false );
	// Slugs whose on-disk state differs from the running session.
	const [ reloadSlugs, setReloadSlugs ] = useState( [] );
	const [ catalog, setCatalog ] = useState( [] );
	const [ , setTick ] = useState( 0 );
	const [ view, setView ] = useState( () =>
		( window.WPIE?.extensions || [] ).length
			? { kind: 'installed', category: null }
			: { kind: 'browse', category: null }
	);
	const [ query, setQuery ] = useState( '' );
	const [ detailSlug, setDetailSlug ] = useState( null );
	const fileRef = useRef( null );
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
	useEffect( () => {
		request( { path: '/catalog' } )
			.then( ( d ) =>
				setCatalog( Array.isArray( d?.extensions ) ? d.extensions : [] )
			)
			.catch( () => {} );
	}, [] );

	const markReload = ( slug ) =>
		setReloadSlugs( ( s ) => ( s.includes( slug ) ? s : [ ...s, slug ] ) );

	// Shared by the ZIP uploader and the Pro one-click installer: fold a
	// freshly installed package into the list and load it live when possible.
	const applyInstalled = ( ext ) => {
		setList( ( l ) => [
			...l.filter( ( e ) => e.slug !== ext.slug ),
			ext,
		] );
		if ( injectExtension( ext ) ) {
			extras.toasts.success(
				sprintf(
					/* translators: %s: extension name. */
					__( '“%s” is installed and active.', 'wunderpaint' ),
					ext.name
				)
			);
		} else {
			markReload( ext.slug );
			extras.toasts.success(
				sprintf(
					/* translators: %s: extension name. */
					__(
						'“%s” is installed. Reload the editor to load the new version.',
						'wunderpaint'
					),
					ext.name
				)
			);
		}
	};

	const install = async ( file ) => {
		if ( ! file ) {
			return;
		}
		// Installing an extension runs its code with your permissions inside
		// the editor (like installing a WordPress plugin). Make that explicit
		// before the upload so packages are a conscious trust decision.
		const trusted = await confirmDialog( {
			title: __( 'Install this extension?', 'wunderpaint' ),
			message: __(
				'Only install extension packages from a source you trust. The extension runs with your permissions inside the editor: it can read and change your documents and act on your behalf, just like a WordPress plugin.',
				'wunderpaint'
			),
			confirmLabel: __( 'Install', 'wunderpaint' ),
		} );
		if ( ! trusted ) {
			return;
		}
		setBusy( true );
		try {
			applyInstalled( await installExtension( file ) );
		} catch ( err ) {
			extras.toasts.error( err.message );
		}
		setBusy( false );
	};

	// The Pro plugin sets window.WPIE.proExtInstall to a server-side installer
	// that fetches a licensed package from the delivery host and returns the
	// installed descriptor. Free only offers this when Pro is active.
	const proInstall = async ( card ) => {
		const fn = window.WPIE?.proExtInstall;
		if ( 'function' !== typeof fn ) {
			return;
		}
		setBusy( true );
		try {
			const ext = await fn( card );
			if ( ext ) {
				applyInstalled( ext );
			}
		} catch ( err ) {
			extras.toasts.error( err.message );
		}
		setBusy( false );
	};

	const toggle = async ( card ) => {
		setBusy( true );
		try {
			const next = await toggleExtension( card.slug, ! card.enabled );
			setList( ( l ) =>
				l.map( ( e ) => ( e.slug === card.slug ? next : e ) )
			);
			if ( next.enabled ) {
				if ( ! injectExtension( next ) ) {
					markReload( card.slug );
				}
			} else {
				// Already-loaded code cannot be unloaded.
				markReload( card.slug );
			}
		} catch ( err ) {
			extras.toasts.error( err.message );
		}
		setBusy( false );
	};

	const remove = async ( card ) => {
		const yes = await confirmDialog( {
			title: __( 'Remove extension', 'wunderpaint' ),
			message: sprintf(
				/* translators: %s: extension name. */
				__( 'Remove “%s” and delete its files?', 'wunderpaint' ),
				card.name
			),
			confirmLabel: __( 'Remove', 'wunderpaint' ),
			danger: true,
		} );
		if ( ! yes ) {
			return;
		}
		setBusy( true );
		try {
			await deleteExtension( card.slug );
			setList( ( l ) => l.filter( ( e ) => e.slug !== card.slug ) );
			if ( ! card.catalogVersion ) {
				// A sideloaded card vanishes entirely with its files.
				setDetailSlug( null );
			}
		} catch ( err ) {
			extras.toasts.error( err.message );
		}
		setBusy( false );
	};

	const issues = listExtensionIssues();
	const canManage = !! window.WPIE?.canExtensions;
	const deliveryUrl = window.WPIE?.deliveryUrl || '';
	const proUrl = window.WPIE?.proUrl || '';
	const proActive = !! window.WPIE?.pro?.active;
	const cards = useMemo(
		() => mergeCatalog( catalog, list ),
		[ catalog, list ]
	);
	const counts = useMemo( () => groupCounts( cards ), [ cards ] );
	const shown = filterCards( cards, { ...view, query } );
	const detail = detailSlug
		? cards.find( ( c ) => c.slug === detailSlug )
		: null;

	const crumb = [];
	if ( detail ) {
		if ( query.trim() ) {
			crumb.push( __( 'Search', 'wunderpaint' ) );
		} else if ( 'installed' === view.kind ) {
			crumb.push( __( 'Installed', 'wunderpaint' ) );
		} else if ( 'updates' === view.kind ) {
			crumb.push( __( 'Updates', 'wunderpaint' ) );
		} else {
			crumb.push( __( 'Discover', 'wunderpaint' ) );
			if ( view.category ) {
				crumb.push( categoryLabel( view.category ) );
			}
		}
	}

	let heading;
	if ( query.trim() ) {
		heading = sprintf(
			/* translators: %d: number of matches. */
			__( 'Search results (%d)', 'wunderpaint' ),
			shown.length
		);
	} else if ( 'installed' === view.kind ) {
		heading = __( 'Installed', 'wunderpaint' );
	} else if ( 'updates' === view.kind ) {
		heading = __( 'Updates', 'wunderpaint' );
	} else if ( view.category ) {
		heading = categoryLabel( view.category );
	} else {
		heading = __( 'All extensions', 'wunderpaint' );
	}

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
								'Add generators, asset packs, effects and tools to the editor.',
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
				<div className="ext-body">
					<ExtensionsSidebar
						counts={ counts }
						view={ view }
						onView={ ( v ) => {
							setView( v );
							setQuery( '' );
							setDetailSlug( null );
						} }
					/>
					<div className="ext-main">
						{ detail ? (
							<ExtensionDetail
								card={ detail }
								crumb={ crumb }
								busy={ busy }
								canManage={ canManage }
								deliveryUrl={ deliveryUrl }
								proActive={ proActive }
								proUrl={ proUrl }
								needsReload={ reloadSlugs.includes(
									detail.slug
								) }
								issues={ issues.filter(
									( i ) => i.source === detail.slug
								) }
								onBack={ () => setDetailSlug( null ) }
								onToggle={ toggle }
								onRemove={ remove }
								onProInstall={ proInstall }
							/>
						) : (
							<>
								<div className="ext-main-heading">
									{ heading }
								</div>
								{ ! shown.length && (
									<div className="ext-empty">
										{ 'installed' === view.kind &&
										! query.trim()
											? __(
													'No extensions installed yet. Pick one under Discover.',
													'wunderpaint'
											  )
											: __(
													'Nothing here.',
													'wunderpaint'
											  ) }
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
					{ canManage && (
						<>
							<button
								className="ai-btn secondary"
								disabled={ busy }
								title={ __(
									'An extension package is a ZIP with a manifest.json and a JavaScript entry file. It is loaded only inside the editor and never appears in the WordPress plugin list.',
									'wunderpaint'
								) }
								onClick={ () => fileRef.current?.click() }
							>
								{ busy
									? __( 'Installing…', 'wunderpaint' )
									: __( 'Install from ZIP', 'wunderpaint' ) }
							</button>
							<input
								ref={ fileRef }
								type="file"
								accept=".zip,application/zip"
								style={ { display: 'none' } }
								onChange={ ( e ) => {
									install( e.target.files?.[ 0 ] );
									e.target.value = '';
								} }
							/>
						</>
					) }
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
