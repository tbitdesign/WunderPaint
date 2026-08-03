/**
 * The one section that searches across all the others, plus the modal an
 * extension gets when it registers a section of its own.
 *
 * Split out of library-dialog.jsx in v1.344.0, which had grown to 2828 lines
 * over thirteen sections that share no state - the shell keeps two pieces of
 * state and renders one section at a time.
 */

import { useState, useEffect } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import {
	useTemplates,
	useCombos,
	useElements,
	useGradients,
} from '../../content/use-content';
import { filterTemplates } from '../../content/template-filter';
import { insertAsset } from '../../lib/asset-insert';
import {
	searchModelInstalled,
	searchMediaLibrary,
	fetchIndexStatus,
	runIndexer,
	subscribeIndexer,
	indexerStatus,
} from '../../lib/image-search';
import { listExtensionLibrarySections } from '../../lib/extensions';
import { useExtensionTemplatePacks } from '../../components/use-extension-packs';
import { useUserItems } from '../../lib/user-content';
import * as Ops from '../../store/ops';
import { ElementTile, TextComboTile } from './content-sections';
import { StarterPreview, openStarterDocument } from './template-sections';

export function ExtensionSectionModal( { section, editor, extras, onClose } ) {
	// Extension library sections (v1.120.1): the same packs that appear as
	// tray chips get a full card grid in the Asset Library dialog.
	const dynamic = 'function' === typeof section.items;
	const [ items, setItems ] = useState( null );
	const [ query, setQuery ] = useState( '' );
	const q = query.trim().toLowerCase();
	useEffect( () => {
		let cancelled = false;
		Promise.resolve( dynamic ? section.items( q ) : section.items )
			.then( ( list ) => {
				if ( ! cancelled ) {
					setItems( Array.isArray( list ) ? list : [] );
				}
			} )
			.catch( () => {
				if ( ! cancelled ) {
					setItems( [] );
				}
			} );
		return () => {
			cancelled = true;
		};
	}, [ section, q, dynamic ] );
	const list = ! items
		? []
		: dynamic
		? items
		: items.filter(
				( item ) =>
					! q || ( item.name || '' ).toLowerCase().includes( q )
		  );
	const pick = async ( item ) => {
		if ( item.use ) {
			item.use( { editor, extras } );
		} else {
			await insertAsset( editor, extras, item.asset, null );
		}
		onClose();
	};
	return (
		<div className="library-content">
			<div className="library-toolbar">
				<input
					type="search"
					placeholder={ __( 'Filter…', 'wunderpaint' ) }
					value={ query }
					onChange={ ( e ) => setQuery( e.target.value ) }
					aria-label={ __( 'Search the library', 'wunderpaint' ) }
				/>
				<span className="stock-count">{ section.label }</span>
			</div>
			{ ! items && <span className="spin" /> }
			{ items && ! list.length && (
				<div className="library-subhead">
					{ __( 'No items found.', 'wunderpaint' ) }
				</div>
			) }
			<div className="library-tpl-grid">
				{ list.map( ( item, i ) => (
					<div
						key={ item.id || item.name || i }
						className="library-tpl"
					>
						<button
							className="library-tpl-open"
							title={ item.name }
							onClick={ () => pick( item ) }
						>
							<img
								src={ item.preview }
								alt=""
								draggable={ false }
							/>
							{ !! item.name && (
								<span className="library-tpl-name">
									{ item.name }
								</span>
							) }
						</button>
					</div>
				) ) }
			</div>
		</div>
	);
}

export function GlobalSearchSection( { query, editor, extras, onClose } ) {
	// Hero search (v1.120.2): one query, live hits across every asset
	// source that carries a title, grouped like the sidebar sections.
	const q = query.trim().toLowerCase();
	const combos = useCombos()
		.filter( ( c ) => c.label.toLowerCase().includes( q ) )
		.slice( 0, 8 );
	const elements = useElements()
		.flatMap( ( s ) => s.items )
		.filter( ( i ) => i.name.toLowerCase().includes( q ) )
		.slice( 0, 18 );
	const gradients = useGradients()
		.filter( ( g ) => g.name.toLowerCase().includes( q ) )
		.slice( 0, 18 );
	const templatePacks = useExtensionTemplatePacks();
	// filterTemplates (v1.255.0) also matches a template's copy, its
	// category and its color buckets, not just the name.
	const starters = filterTemplates(
		[
			...useTemplates(),
			...templatePacks.flatMap( ( pack ) => pack.templates ),
		],
		{ q }
	).slice( 0, 8 );
	const myAssets = useUserItems( 'asset' )
		.filter(
			( it ) =>
				( it.label || '' ).toLowerCase().includes( q ) ||
				( it.category || '' ).toLowerCase().includes( q )
		)
		.slice( 0, 12 );
	const [ icons, setIcons ] = useState( null );
	const [ emoji, setEmoji ] = useState( null );
	useEffect( () => {
		import(
			/* webpackChunkName: "icons-lib" */ '../../icons-lib/tabler.json'
		)
			.then( ( m ) => setIcons( m.default || m ) )
			.catch( () => setIcons( {} ) );
		import(
			/* webpackChunkName: "emoji-lib" */ '../../icons-lib/emoji.json'
		)
			.then( ( m ) => setEmoji( m.default || m ) )
			.catch( () => setEmoji( [] ) );
	}, [] );
	const iconMatches = icons
		? Object.keys( icons )
				.filter( ( n ) => n.includes( q ) )
				.slice( 0, 36 )
		: [];
	const emojiMatches = ( emoji || [] )
		.filter( ( e ) => e.n.includes( q ) )
		.slice( 0, 36 );
	// Extension packs: static items filter by name, dynamic ones get the
	// query passed through.
	const [ extHits, setExtHits ] = useState( [] );
	useEffect( () => {
		let cancelled = false;
		Promise.all(
			listExtensionLibrarySections().map( ( sec ) =>
				Promise.resolve(
					'function' === typeof sec.items ? sec.items( q ) : sec.items
				)
					.then( ( list ) => ( {
						sec,
						items: ( Array.isArray( list ) ? list : [] )
							.filter(
								( item ) =>
									'function' === typeof sec.items ||
									( item.name || '' )
										.toLowerCase()
										.includes( q )
							)
							.slice( 0, 12 ),
					} ) )
					.catch( () => ( { sec, items: [] } ) )
			)
		).then( ( groups ) => {
			if ( ! cancelled ) {
				setExtHits( groups.filter( ( g ) => g.items.length ) );
			}
		} );
		return () => {
			cancelled = true;
		};
	}, [ q ] );

	const insert = async ( asset ) => {
		await insertAsset( editor, extras, asset, null );
		onClose();
	};
	const openStarter = async ( template ) => {
		if ( await openStarterDocument( editor, template, extras ) ) {
			onClose();
		}
	};

	// Semantic media search (v1.131.0): SigLIP ranks the indexed library
	// by MEANING, so 'dog on the beach' finds IMG_2847.jpg. Only active
	// once the model is installed; results refresh when indexing ends.
	const semantic = searchModelInstalled();
	const [ mediaHits, setMediaHits ] = useState( [] );
	const [ indexInfo, setIndexInfo ] = useState( null );
	const [ idx, setIdx ] = useState( indexerStatus );
	useEffect( () => subscribeIndexer( setIdx ), [] );
	useEffect( () => {
		if ( semantic && ! idx.running ) {
			fetchIndexStatus()
				.then( setIndexInfo )
				.catch( () => {} );
		}
	}, [ semantic, idx.running ] );
	useEffect( () => {
		if ( ! semantic || q.length < 3 ) {
			setMediaHits( [] );
			return undefined;
		}
		let cancelled = false;
		const timer = setTimeout( () => {
			searchMediaLibrary( q )
				.then( ( hits ) => ! cancelled && setMediaHits( hits ) )
				.catch( () => ! cancelled && setMediaHits( [] ) );
		}, 350 );
		return () => {
			cancelled = true;
			clearTimeout( timer );
		};
	}, [ semantic, q, idx.running ] );

	const insertMedia = async ( hit ) => {
		if (
			false !==
			( await insertAsset( editor, extras, {
				kind: 'upload',
				fullUrl: hit.url || hit.thumb,
				title: hit.title,
			} ) )
		) {
			onClose();
		}
	};

	const nothing =
		! combos.length &&
		! elements.length &&
		! gradients.length &&
		! starters.length &&
		! myAssets.length &&
		! iconMatches.length &&
		! emojiMatches.length &&
		! extHits.length &&
		! mediaHits.length;

	return (
		<div className="library-content">
			{ nothing && (
				<div className="library-subhead">
					{ __( 'No items found.', 'wunderpaint' ) }
				</div>
			) }
			{ semantic &&
				( mediaHits.length > 0 ||
					idx.running ||
					( indexInfo && indexInfo.pending > 0 ) ) && (
					<>
						<div className="library-subhead">
							{ __( 'Media Library', 'wunderpaint' ) }
						</div>
						{ idx.running && (
							<div className="library-index-hint">
								{ sprintf(
									/* translators: 1: done count, 2: total count. */
									__(
										'Indexing for semantic search… %1$d / %2$d',
										'wunderpaint'
									),
									idx.done,
									idx.total
								) }
							</div>
						) }
						{ ! idx.running &&
							indexInfo &&
							indexInfo.pending > 0 && (
								<div className="library-index-hint">
									{ sprintf(
										/* translators: %d: image count. */
										__(
											'%d images are not indexed for semantic search yet.',
											'wunderpaint'
										),
										indexInfo.pending
									) }{ ' ' }
									<button
										className="ai-btn sm"
										onClick={ () => runIndexer() }
									>
										{ __( 'Index now', 'wunderpaint' ) }
									</button>
								</div>
							) }
						{ mediaHits.length > 0 && (
							<div className="library-tpl-grid">
								{ mediaHits.map( ( hit ) => (
									<div key={ hit.id } className="library-tpl">
										<button
											className="library-tpl-open"
											title={ hit.title }
											onClick={ () => insertMedia( hit ) }
										>
											<img
												src={ hit.thumb }
												alt=""
												loading="lazy"
											/>
											<span className="library-tpl-name">
												{ hit.title || '#' + hit.id }
											</span>
										</button>
									</div>
								) ) }
							</div>
						) }
					</>
				) }
			{ starters.length > 0 && (
				<>
					<div className="library-subhead">
						{ __( 'Starter Templates', 'wunderpaint' ) }
					</div>
					<div className="library-tpl-grid">
						{ starters.map( ( template ) => (
							<div key={ template.id } className="library-tpl">
								<button
									className="library-tpl-open"
									onClick={ () => openStarter( template ) }
									title={ __(
										'Open as new document',
										'wunderpaint'
									) }
								>
									<StarterPreview template={ template } />
									<span className="library-tpl-name">
										{ template.name }
									</span>
								</button>
							</div>
						) ) }
					</div>
				</>
			) }
			{ myAssets.length > 0 && (
				<>
					<div className="library-subhead">
						{ __( 'My Assets', 'wunderpaint' ) }
					</div>
					<div className="library-tpl-grid">
						{ myAssets.map( ( it ) => (
							<div key={ it.id } className="library-tpl">
								<button
									className="library-tpl-open"
									title={ it.label }
									onClick={ () => {
										Ops.insertLayerSnapshotOp(
											editor,
											it,
											extras
										);
										onClose();
									} }
								>
									{ it.preview ? (
										<img src={ it.preview } alt="" />
									) : (
										<span className="spin" />
									) }
									<span className="library-tpl-name">
										{ it.label }
									</span>
								</button>
							</div>
						) ) }
					</div>
				</>
			) }
			{ combos.length > 0 && (
				<>
					<div className="library-subhead">
						{ __( 'Text', 'wunderpaint' ) }
					</div>
					<div className="library-tpl-grid">
						{ combos.map( ( combo ) => (
							<div key={ combo.id } className="library-tpl">
								<TextComboTile
									combo={ combo }
									onInsert={ () =>
										insert( {
											kind: 'combo',
											id: combo.id,
										} )
									}
								/>
							</div>
						) ) }
					</div>
				</>
			) }
			{ elements.length > 0 && (
				<>
					<div className="library-subhead">
						{ __( 'Shapes', 'wunderpaint' ) }
					</div>
					<div className="icon-grid element-grid">
						{ elements.map( ( item ) => (
							<ElementTile
								key={ item.name }
								item={ item }
								onInsert={ () =>
									insert( {
										kind: 'element',
										name: item.name,
									} )
								}
							/>
						) ) }
					</div>
				</>
			) }
			{ gradients.length > 0 && (
				<>
					<div className="library-subhead">
						{ __( 'Backgrounds', 'wunderpaint' ) }
					</div>
					<div className="bg-grid">
						{ gradients.map( ( preset ) => (
							<button
								key={ preset.name }
								title={ preset.name }
								style={ {
									background: `linear-gradient(135deg, ${ preset.stops
										.map(
											( s ) =>
												`${ s.color } ${ Math.round(
													s.at * 100
												) }%`
										)
										.join( ', ' ) })`,
								} }
								onClick={ () =>
									insert( {
										kind: 'bg-gradient',
										name: preset.name,
									} )
								}
							/>
						) ) }
					</div>
				</>
			) }
			{ iconMatches.length > 0 && (
				<>
					<div className="library-subhead">
						{ __( 'Icons', 'wunderpaint' ) }
					</div>
					<div className="icon-grid">
						{ iconMatches.map( ( name ) => (
							<button
								key={ name }
								title={ name }
								onClick={ () =>
									insert( { kind: 'icon', name } )
								}
							>
								<svg
									viewBox="0 0 24 24"
									width="28"
									height="28"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<path d={ icons[ name ] } />
								</svg>
							</button>
						) ) }
					</div>
				</>
			) }
			{ emojiMatches.length > 0 && (
				<>
					<div className="library-subhead">
						{ __( 'Emoji', 'wunderpaint' ) }
					</div>
					<div className="icon-grid emoji-grid">
						{ emojiMatches.map( ( item ) => (
							<button
								key={ item.c }
								title={ item.n }
								aria-label={ item.n }
								onClick={ () =>
									insert( {
										kind: 'emoji',
										c: item.c,
										n: item.n,
									} )
								}
							>
								{ item.c }
							</button>
						) ) }
					</div>
				</>
			) }
			{ extHits.map( ( { sec, items } ) => (
				<div key={ sec.id }>
					<div className="library-subhead">{ sec.label }</div>
					<div className="library-tpl-grid">
						{ items.map( ( item, i ) => (
							<div
								key={ item.id || item.name || i }
								className="library-tpl"
							>
								<button
									className="library-tpl-open"
									title={ item.name }
									onClick={ async () => {
										if ( item.use ) {
											item.use( { editor, extras } );
											onClose();
										} else {
											await insert( item.asset );
										}
									} }
								>
									<img
										src={ item.preview }
										alt=""
										draggable={ false }
									/>
									{ !! item.name && (
										<span className="library-tpl-name">
											{ item.name }
										</span>
									) }
								</button>
							</div>
						) ) }
					</div>
				</div>
			) ) }
		</div>
	);
}
