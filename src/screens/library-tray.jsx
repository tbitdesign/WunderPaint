/**
 * Library tray (v1.14): a collapsible dock under the canvas, section
 * chips + horizontally scrolling preview strips for one-click inserting.
 * The full Library dialog (Assets → Library) stays; the tray is the fast
 * path and keeps itself open so you can insert several assets in a row.
 * v1.14.1: fixed body height, head search (filters every section, drives
 * the stock search), Photos section. v1.14.2: infinite scroll.
 * v1.15: unified asset descriptors (lib/asset-insert), tiles are
 * DRAGGABLE onto the canvas, and a "Recent" section lists the last
 * inserted assets.
 */

import { useState, useEffect, useRef } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { I } from '../icons';
import { useEditor } from '../store/editor-context';
import { makeShape } from '../store/document';
import { renderToCanvas, sharedImageCache } from '../lib/raster';
import {
	useCombos,
	useElements,
	useGradients,
	useTemplates,
} from '../content/use-content';
import { COMBO_CATEGORIES } from '../content/combo-categories';
import { scalePathD as scaleElementPath } from '../lib/path';
import { ensureFontsForLayers } from '../lib/font-manager';
import {
	listMediaPage,
	stock,
	templates as templatesApi,
	designs as designsApi,
} from '../lib/api';
import { insertAsset, listRecentAssets } from '../lib/asset-insert';
import { SearchIndexHint } from '../components/search-index-hint';
import { searchModelInstalled, searchMediaLibrary } from '../lib/image-search';
import {
	StarterPreview,
	openTemplateDocument,
	openStarterDocument,
	openDesignDocument,
} from './library-dialog';
import { filterTemplates } from '../content/template-filter';
import { mergeTemplateCategories } from '../content/template-categories';
import { comboToLayers } from '../lib/content-io';
import {
	useUserItems,
	removeUserItem,
	useCategories,
} from '../lib/user-content';
import { confirmDialog } from '../lib/dialogs';
import {
	listExtensionLibrarySections,
	getExtensionLibrarySection,
	subscribeExtensions,
} from '../lib/extensions';
import { useExtensionTemplatePacks } from '../components/use-extension-packs';
import { PHOTO_CATEGORIES, usePhotoCatThumbs } from '../lib/stock-categories';
import * as Ops from '../store/ops';

export const ASSET_MIME = 'application/x-wpie-asset';

/* ------------------------- preview tile helpers ------------------------- */

const trayPreviewCache = new Map();

/** Drag payload + click insert shared by every tile. */
const tileProps = ( asset, onUse ) => ( {
	draggable: true,
	onDragStart: ( e ) => {
		e.dataTransfer.setData( ASSET_MIME, JSON.stringify( asset ) );
		// Kind marker (v1.363.1): during dragover only the type NAMES are
		// readable, never the payload - the canvas needs the kind in a
		// type name to frame the swap target while an image tile drags.
		if ( [ 'photo', 'upload' ].includes( asset.kind ) ) {
			e.dataTransfer.setData( ASSET_MIME + '-image', '1' );
		}
		e.dataTransfer.effectAllowed = 'copy';
	},
	onClick: onUse,
} );

/** Render layers through the real pipeline into a cached tile preview. */
function PipelineTile( {
	cacheKey,
	buildLayers,
	doc,
	title,
	asset,
	onUse,
	label,
	scale = 0.35,
} ) {
	const [ url, setUrl ] = useState(
		() => trayPreviewCache.get( cacheKey ) || null
	);
	useEffect( () => {
		if ( url ) {
			return;
		}
		let cancelled = false;
		const layers = buildLayers();
		ensureFontsForLayers( layers )
			.then( () =>
				renderToCanvas( doc, layers, {
					scale,
					cache: sharedImageCache,
				} )
			)
			.then( ( canvas ) => {
				if ( ! cancelled && canvas.toDataURL ) {
					const dataUrl = canvas.toDataURL();
					trayPreviewCache.set( cacheKey, dataUrl );
					setUrl( dataUrl );
				}
			} )
			.catch( () => {} );
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ cacheKey ] );
	return (
		<button
			className={ `tray-tile${ label ? ' tray-tile-labeled' : '' }` }
			title={ title }
			{ ...tileProps( asset, onUse ) }
		>
			<span className="tray-tile-preview">
				{ url ? (
					<img src={ url } alt="" draggable={ false } />
				) : (
					<span className="spin" />
				) }
			</span>
			{ label && <span className="tray-tile-name">{ label }</span> }
		</button>
	);
}

/** Fire loadMore when a horizontal strip scrolls near its end (v1.14.2). */
const nearEnd = ( loadMore ) => ( e ) => {
	const el = e.currentTarget;
	// Generous look-ahead (v1.61): the next page is usually loaded before
	// the user reaches the end, so the strip feels truly endless.
	if ( el.scrollLeft + el.clientWidth > el.scrollWidth - 480 ) {
		loadMore();
	}
};

/** Vertical mouse wheel scrolls the horizontal strips (v1.15.2). */
const wheelScroll = ( e ) => {
	if ( Math.abs( e.deltaY ) > Math.abs( e.deltaX ) ) {
		e.currentTarget.scrollLeft += e.deltaY;
	}
};

const comboPreviewDoc = { id: 'tray-combo', w: 480, h: 360, bg: '#f6f4ef' };
const elementPreviewDoc = { id: 'tray-el', w: 64, h: 64, bg: 'transparent' };

const elementPreviewLayers = ( item ) => [
	makeShape( {
		x: 4,
		y: 4,
		w: 56,
		h: 56,
		fill: '#8a93a6',
		shape: item.shape || 'rect',
		sides: item.sides,
		...( item.pathD
			? { pathD: scaleElementPath( item.pathD, 0.56, 0.56 ) }
			: {} ),
	} ),
];

/* ------------------------------- strips --------------------------------- */

function TextStrip( { category, query, insert } ) {
	// A search query looks across ALL categories; the chip browses one.
	const combos = useCombos().filter( ( combo ) =>
		query
			? combo.label.toLowerCase().includes( query )
			: ( combo.category || 'headlines' ) === category
	);
	const mine = useUserItems( 'combo' ).filter(
		( d ) => ! query || ( d.label || '' ).toLowerCase().includes( query )
	);
	const rmHint = __( 'Alt-click to remove', 'wunderpaint' );
	return (
		<div onWheel={ wheelScroll } className="tray-strip">
			{ mine.map( ( d ) => (
				<PipelineTile
					key={ d.id }
					cacheKey={ `ucombo:${ d.id }` }
					doc={ comboPreviewDoc }
					buildLayers={ () => comboToLayers( d, comboPreviewDoc ) }
					label={ d.label }
					title={ `${ d.label } (${ rmHint })` }
					asset={ { kind: 'user-combo', descriptor: d } }
					onUse={ ( e ) =>
						e && e.altKey
							? removeUserItem( 'combo', d.id )
							: insert( { kind: 'user-combo', descriptor: d } )
					}
				/>
			) ) }
			{ combos.map( ( combo ) => (
				<PipelineTile
					key={ combo.id }
					cacheKey={ `combo:${ combo.id }` }
					doc={ comboPreviewDoc }
					buildLayers={ () => combo.build( comboPreviewDoc, {} ) }
					label={ combo.label }
					title={ combo.label }
					asset={ { kind: 'combo', id: combo.id } }
					onUse={ () => insert( { kind: 'combo', id: combo.id } ) }
				/>
			) ) }
		</div>
	);
}

function ElementsStrip( { query, insert } ) {
	const items = useElements()
		.flatMap( ( set ) => set.items )
		.filter(
			( item ) => ! query || item.name.toLowerCase().includes( query )
		);
	const mine = useUserItems( 'element' ).filter(
		( d ) => ! query || ( d.name || '' ).toLowerCase().includes( query )
	);
	const rmHint = __( 'Alt-click to remove', 'wunderpaint' );
	// Full-height labeled cards like every other section (v1.120.1).
	return (
		<div onWheel={ wheelScroll } className="tray-strip">
			{ mine.map( ( d ) => (
				<PipelineTile
					key={ d.id }
					cacheKey={ `uel:${ d.id }` }
					doc={ elementPreviewDoc }
					buildLayers={ () => elementPreviewLayers( d ) }
					scale={ 1 }
					title={ `${ d.name } (${ rmHint })` }
					label={ d.name }
					asset={ { kind: 'user-element', descriptor: d } }
					onUse={ ( e ) =>
						e && e.altKey
							? removeUserItem( 'element', d.id )
							: insert( { kind: 'user-element', descriptor: d } )
					}
				/>
			) ) }
			{ items.map( ( item ) => (
				<PipelineTile
					key={ item.name }
					cacheKey={ `el:${ item.name }` }
					doc={ elementPreviewDoc }
					buildLayers={ () => elementPreviewLayers( item ) }
					scale={ 1 }
					title={ item.name }
					label={ item.name }
					asset={ { kind: 'element', name: item.name } }
					onUse={ () =>
						insert( { kind: 'element', name: item.name } )
					}
				/>
			) ) }
		</div>
	);
}

function BackgroundsStrip( { editor, query, insert } ) {
	const { state } = editor;
	const brand = editor.WPIE?.brand?.colors || [];
	const solids = [
		...new Set( [
			...brand,
			state.fgColor,
			state.bgColor,
			'#ffffff',
			'#1a1d21',
			'#f6f1e7',
			'#eef2f7',
		] ),
	].filter( Boolean );
	const gradients = useGradients().filter(
		( preset ) => ! query || preset.name.toLowerCase().includes( query )
	);
	const myBgs = useUserItems( 'background' ).filter(
		( d ) => ! query || ( d.name || '' ).toLowerCase().includes( query )
	);
	const rmHint = __( 'Alt-click to remove', 'wunderpaint' );
	const bgStyle = ( d ) => {
		if ( 'solid' === d.kind ) {
			return d.color;
		}
		const stops = ( d.stops || [] )
			.map( ( s ) => `${ s.color } ${ Math.round( s.at * 100 ) }%` )
			.join( ', ' );
		return 'radial' === d.kind
			? `radial-gradient(circle, ${ stops })`
			: `linear-gradient(135deg, ${ stops })`;
	};
	// Full-height labeled swatch cards (v1.120.1).
	const swatch = ( key, title, caption, background, asset, onUse ) => (
		<button
			key={ key }
			className="tray-tile tray-tile-labeled tray-swatch"
			title={ title }
			{ ...tileProps( asset, onUse ) }
		>
			<span className="tray-tile-preview">
				<span className="tray-swatch-fill" style={ { background } } />
			</span>
			<span className="tray-tile-name">{ caption }</span>
		</button>
	);
	return (
		<div onWheel={ wheelScroll } className="tray-strip">
			{ myBgs.map( ( d ) =>
				swatch(
					d.id,
					`${ d.name } (${ rmHint })`,
					d.name,
					bgStyle( d ),
					{ kind: 'user-background', descriptor: d },
					( e ) =>
						e && e.altKey
							? removeUserItem( 'background', d.id )
							: insert( {
									kind: 'user-background',
									descriptor: d,
							  } )
				)
			) }
			{ gradients.map( ( preset ) =>
				swatch(
					preset.name,
					preset.name,
					preset.name,
					`linear-gradient(135deg, ${ preset.stops
						.map(
							( s ) =>
								`${ s.color } ${ Math.round( s.at * 100 ) }%`
						)
						.join( ', ' ) })`,
					{ kind: 'bg-gradient', name: preset.name },
					() => insert( { kind: 'bg-gradient', name: preset.name } )
				)
			) }
			{ ! query &&
				solids.map( ( color ) =>
					swatch(
						color,
						color,
						color,
						color,
						{ kind: 'bg-solid', color },
						() => insert( { kind: 'bg-solid', color } )
					)
				) }
		</div>
	);
}

function IconTile( { name, d, insert } ) {
	return (
		<button
			className="tray-tile tray-tile-labeled tray-icon"
			title={ name }
			{ ...tileProps( { kind: 'icon', name }, () =>
				insert( { kind: 'icon', name } )
			) }
		>
			<span className="tray-tile-preview">
				<svg
					viewBox="0 0 24 24"
					width="36"
					height="36"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<path d={ d } />
				</svg>
			</span>
			<span className="tray-tile-name">{ name }</span>
		</button>
	);
}

function IconsStrip( { query, insert } ) {
	const [ icons, setIcons ] = useState( null );
	const [ limit, setLimit ] = useState( 120 );
	useEffect( () => {
		import( /* webpackChunkName: "icons-lib" */ '../icons-lib/tabler.json' )
			.then( ( mod ) => setIcons( mod.default || mod ) )
			.catch( () => setIcons( {} ) );
	}, [] );
	const names = icons ? Object.keys( icons ) : [];
	const filtered = query
		? names.filter( ( n ) => n.includes( query ) )
		: names;
	const matches = filtered.slice( 0, limit );
	return (
		<div
			onWheel={ wheelScroll }
			className="tray-strip"
			onScroll={ nearEnd(
				() =>
					matches.length < filtered.length && setLimit( limit + 120 )
			) }
		>
			{ ! icons && <span className="spin" /> }
			{ matches.map( ( name ) => (
				<IconTile
					key={ name }
					name={ name }
					d={ icons[ name ] }
					insert={ insert }
				/>
			) ) }
		</div>
	);
}

function EmojiStrip( { query, insert } ) {
	const [ emoji, setEmoji ] = useState( null );
	const [ limit, setLimit ] = useState( 120 );
	useEffect( () => {
		import( /* webpackChunkName: "emoji-lib" */ '../icons-lib/emoji.json' )
			.then( ( mod ) => setEmoji( mod.default || mod ) )
			.catch( () => setEmoji( [] ) );
	}, [] );
	const filtered = ( emoji || [] ).filter(
		( e ) => ! query || e.n.includes( query )
	);
	const matches = filtered.slice( 0, limit );
	return (
		<div
			onWheel={ wheelScroll }
			className="tray-strip"
			onScroll={ nearEnd(
				() =>
					matches.length < filtered.length && setLimit( limit + 120 )
			) }
		>
			{ ! emoji && <span className="spin" /> }
			{ matches.map( ( item ) => (
				<button
					key={ item.c }
					className="tray-tile tray-tile-labeled tray-emoji"
					title={ item.n }
					{ ...tileProps(
						{ kind: 'emoji', c: item.c, n: item.n },
						() => insert( { kind: 'emoji', c: item.c, n: item.n } )
					) }
				>
					<span className="tray-tile-preview">{ item.c }</span>
					<span className="tray-tile-name">{ item.n }</span>
				</button>
			) ) }
		</div>
	);
}

/**
 * The user's own assets (File → "Save as Asset", v1.74.2): saved layer
 * snapshots with their stored previews; Alt-click removes (asks first
 * since v1.266). When categories are in use the strip opens as one CARD
 * per category (the starter-template drill-in, v1.255.0): a click browses
 * that category, the leading tile goes back; without categories the flat
 * strip stays, nobody clicks through a pointless level.
 */
function MyAssetsStrip( { query, editor, extras } ) {
	const all = useUserItems( 'asset' );
	const categories = useCategories();
	// null = category cards; '' = Unsorted; anything else = that category.
	const [ cat, setCat ] = useState( null );
	const rmHint = __( 'Alt-click to remove', 'wunderpaint' );
	if ( ! all.length ) {
		return (
			<div className="tray-hint">
				{ __(
					'Nothing here yet. Select layers and use File → "Save as Asset".',
					'wunderpaint'
				) }
			</div>
		);
	}
	const usedCats = categories.filter( ( c ) =>
		all.some( ( it ) => it.category === c )
	);
	const hasUnsorted = all.some( ( it ) => ! it.category );
	if ( ! query && null === cat && usedCats.length ) {
		const card = ( key, label, inCat ) => (
			<button
				key={ key || '::unsorted' }
				className="tray-tile tray-tile-labeled tray-photo-cat tray-tile-asset"
				title={ sprintf(
					/* translators: 1: category name, 2: number of assets. */
					__( '%1$s (%2$d assets)', 'wunderpaint' ),
					label,
					inCat.length
				) }
				onClick={ () => setCat( key ) }
			>
				<span className="tray-tile-preview">
					{ inCat[ 0 ].preview ? (
						<img
							src={ inCat[ 0 ].preview }
							alt=""
							draggable={ false }
						/>
					) : (
						<span className="spin" />
					) }
				</span>
				<span className="tray-tile-name">{ label }</span>
			</button>
		);
		return (
			<div onWheel={ wheelScroll } className="tray-strip">
				{ usedCats.map( ( c ) =>
					card(
						c,
						c,
						all.filter( ( it ) => it.category === c )
					)
				) }
				{ hasUnsorted &&
					card(
						'',
						__( 'Unsorted', 'wunderpaint' ),
						all.filter( ( it ) => ! it.category )
					) }
			</div>
		);
	}
	const items = all.filter( ( it ) => {
		if ( null !== cat && ( it.category || '' ) !== cat ) {
			return false;
		}
		return (
			! query ||
			( it.label || '' ).toLowerCase().includes( query ) ||
			( null === cat &&
				( it.category || '' ).toLowerCase().includes( query ) )
		);
	} );
	return (
		<div onWheel={ wheelScroll } className="tray-strip">
			{ null !== cat && (
				<button
					className="tray-tile tray-tile-labeled tray-photo-cat tray-search-card"
					onClick={ () => setCat( null ) }
					title={ __( 'All categories', 'wunderpaint' ) }
				>
					<span className="tray-tile-preview">
						{ I.grid( { size: 20 } ) }
					</span>
					<span className="tray-tile-name">
						{ __( 'All categories', 'wunderpaint' ) }
					</span>
				</button>
			) }
			{ ! items.length && (
				<span className="tray-hint">
					{ __( 'No matches.', 'wunderpaint' ) }
				</span>
			) }
			{ items.map( ( it ) => (
				<button
					key={ it.id }
					className="tray-tile tray-tile-labeled tray-tile-asset"
					title={ `${ it.label }${
						it.category ? ` · ${ it.category }` : ''
					} (${ rmHint })` }
					onClick={ async ( e ) => {
						if ( ! e.altKey ) {
							Ops.insertLayerSnapshotOp( editor, it, extras );
							return;
						}
						if (
							await confirmDialog( {
								title: __( 'Delete asset', 'wunderpaint' ),
								message: sprintf(
									/* translators: %s: asset name. */
									__( 'Delete “%s”?', 'wunderpaint' ),
									it.label
								),
								confirmLabel: __( 'Delete', 'wunderpaint' ),
								danger: true,
							} )
						) {
							removeUserItem( 'asset', it.id );
						}
					} }
				>
					<span className="tray-tile-preview">
						{ it.preview ? (
							<img
								src={ it.preview }
								alt=""
								draggable={ false }
							/>
						) : (
							<span className="spin" />
						) }
					</span>
					<span className="tray-tile-name">{ it.label }</span>
				</button>
			) ) }
		</div>
	);
}

function UploadsStrip( { query, insert } ) {
	const [ items, setItems ] = useState( null );
	const [ page, setPage ] = useState( 1 );
	const [ hasMore, setHasMore ] = useState( false );
	const loading = useRef( false );
	useEffect( () => {
		loading.current = true;
		listMediaPage( page )
			.then( ( result ) => {
				setItems( ( prev ) => [ ...( prev || [] ), ...result.items ] );
				setHasMore( result.hasMore );
			} )
			.catch( () => setItems( ( prev ) => prev || [] ) )
			.finally( () => {
				loading.current = false;
			} );
	}, [ page ] );
	// Semantic hits (v1.131.5): from 3 chars on, SigLIP ranks the indexed
	// library by MEANING and joins the plain title matches (deduped).
	const [ semanticHits, setSemanticHits ] = useState( [] );
	useEffect( () => {
		if ( ! query || query.length < 3 || ! searchModelInstalled() ) {
			setSemanticHits( [] );
			return undefined;
		}
		let cancelled = false;
		const timer = setTimeout( () => {
			searchMediaLibrary( query )
				.then( ( hits ) => ! cancelled && setSemanticHits( hits ) )
				.catch( () => ! cancelled && setSemanticHits( [] ) );
		}, 350 );
		return () => {
			cancelled = true;
			clearTimeout( timer );
		};
	}, [ query ] );
	const titleMatches = ( items || [] ).filter(
		( item ) =>
			! query || ( item.title || '' ).toLowerCase().includes( query )
	);
	const seen = new Set( titleMatches.map( ( m ) => m.id ) );
	const matches = [
		...titleMatches,
		...semanticHits
			.filter( ( h ) => ! seen.has( h.id ) )
			.map( ( h ) => ( {
				id: h.id,
				url: h.thumb,
				fullUrl: h.url,
				title: h.title,
			} ) ),
	];
	const assetOf = ( item ) => ( {
		kind: 'upload',
		id: item.id,
		url: item.url,
		fullUrl: item.fullUrl,
		title: item.title,
	} );
	return (
		<div
			onWheel={ wheelScroll }
			className="tray-strip"
			onScroll={ nearEnd( () => {
				if ( hasMore && ! loading.current ) {
					setPage( ( p ) => p + 1 );
				}
			} ) }
		>
			<SearchIndexHint showReady={ false } />
			{ null === items && <span className="spin" /> }
			{ items && 0 === matches.length && (
				<span className="tray-hint">
					{ query
						? __( 'No matching images found.', 'wunderpaint' )
						: __(
								'No images in the media library yet.',
								'wunderpaint'
						  ) }
				</span>
			) }
			{ matches.map( ( item ) => (
				<button
					key={ item.id }
					className="tray-tile tray-tile-labeled"
					title={ item.title }
					{ ...tileProps( assetOf( item ), () =>
						insert( assetOf( item ) )
					) }
				>
					<span className="tray-tile-preview">
						<img
							src={ item.url }
							alt=""
							loading="lazy"
							draggable={ false }
						/>
					</span>
					<span className="tray-tile-name">
						{ item.title || __( 'Untitled', 'wunderpaint' ) }
					</span>
				</button>
			) ) }
		</div>
	);
}

/**
 * Stock photos (v1.14.1): the head search drives the provider search.
 *  v1.291.4: the Photos section can pick the provider (providerOverride);
 *  illustrations/vectors stay Pixabay-only.
 */
function PhotosStrip( {
	editor,
	query,
	setQuery,
	insert,
	type = 'photo',
	providerOverride,
} ) {
	const { WPIE } = editor;
	const configured = Object.keys( WPIE?.stock || {} ).filter(
		( id ) => WPIE.stock[ id ]
	);
	// Illustrations/vector graphics exist on Pixabay only (v1.109.0).
	const provider =
		'photo' === type
			? providerOverride || configured[ 0 ] || null
			: configured.includes( 'pixabay' )
			? 'pixabay'
			: null;
	// Same source as the Stock Images dialog, so a provider is called the
	// same thing in both places.
	const labelFor = ( id ) =>
		WPIE?.stockLabels?.[ id ] ||
		{ pexels: 'Pexels', pixabay: 'Pixabay', unsplash: 'Unsplash' }[ id ] ||
		id;
	const [ results, setResults ] = useState( [] );
	const [ total, setTotal ] = useState( 0 );
	const [ busy, setBusy ] = useState( false );
	// Provider errors (invalid key, rate limit) surface as a hint instead
	// of a silently empty strip (v1.288.1).
	const [ error, setError ] = useState( '' );
	const pageRef = useRef( 1 );
	const busyRef = useRef( false );
	const stripRef = useRef( null );
	const catThumbs = usePhotoCatThumbs(
		provider && ! query ? provider : null,
		type
	);

	// Debounced search-as-you-type.
	useEffect( () => {
		if ( ! provider || ! query ) {
			setResults( [] );
			setTotal( 0 );
			return;
		}
		let cancelled = false;
		const timer = setTimeout( () => {
			setBusy( true );
			busyRef.current = true;
			pageRef.current = 1;
			stock
				.search( provider, query, 1, type )
				.then( ( data ) => {
					if ( ! cancelled ) {
						setResults( data.results || [] );
						setTotal( data.total || 0 );
						setError( '' );
					}
				} )
				.catch( ( err ) => {
					if ( ! cancelled ) {
						setError( err?.message || 'error' );
					}
				} )
				.finally( () => {
					busyRef.current = false;
					if ( ! cancelled ) {
						setBusy( false );
					}
				} );
		}, 500 );
		return () => {
			cancelled = true;
			clearTimeout( timer );
		};
	}, [ provider, query, type ] );

	// Infinite scroll (v1.14.2): pull the next provider page near the end.
	const loadMore = () => {
		if (
			busyRef.current ||
			! provider ||
			! query ||
			results.length >= total
		) {
			return;
		}
		busyRef.current = true;
		setBusy( true );
		stock
			.search( provider, query, pageRef.current + 1, type )
			.then( ( data ) => {
				pageRef.current += 1;
				setResults( ( prev ) => [
					...prev,
					...( data.results || [] ),
				] );
				setTotal( data.total || 0 );
			} )
			.catch( () => {} )
			.finally( () => {
				busyRef.current = false;
				setBusy( false );
			} );
	};

	// Auto-fill (v1.63.1): on wide monitors the first page may not overflow
	// the strip, so there is never a scroll event and infinite scroll never
	// starts. Keep loading until the content actually overflows.
	useEffect( () => {
		const el = stripRef.current;
		if (
			el &&
			query &&
			results.length &&
			results.length < total &&
			! busyRef.current &&
			el.scrollWidth <= el.clientWidth + 40
		) {
			loadMore();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ results, total, query ] );

	const assetOf = ( item ) => ( {
		kind: 'photo',
		id: item.id,
		thumb: item.thumb,
		full: item.full,
		author: item.author,
		// Travels with the asset so the insert can tell the provider the
		// photo was used. Unsplash requires that call and it is how the
		// photographer gets counted; without it here, everything inserted
		// from the tray would go uncounted.
		downloadLocation: item.downloadLocation,
	} );

	// "Ada L. · Unsplash", not just the name: a photo has to be shown WITH
	// its source, and on a tile this narrow that is the only place it fits.
	// The dialog carries the full credit with both links.
	const creditOf = ( item ) =>
		item.author
			? item.author + ' \u00B7 ' + labelFor( provider )
			: labelFor( provider );

	return (
		<div
			ref={ stripRef }
			onWheel={ wheelScroll }
			className="tray-strip"
			onScroll={ nearEnd( loadMore ) }
		>
			{ ! provider && (
				<span className="tray-hint">
					{ 'photo' === type
						? __(
								'No stock provider configured (Settings → Stock & Watermark).',
								'wunderpaint'
						  )
						: __(
								'Illustrations and vector graphics need a Pixabay API key (Settings → Stock & Watermark).',
								'wunderpaint'
						  ) }
				</span>
			) }
			{ provider && !! error && ! results.length && (
				<span className="tray-hint">{ error }</span>
			) }
			{ provider && ! query && ! results.length && (
				<>
					<button
						className="tray-tile tray-tile-labeled tray-photo-cat tray-search-card"
						onClick={ () =>
							document
								.querySelector( '#wpie-root .tray-search' )
								?.focus()
						}
					>
						<span className="tray-tile-preview">
							{ I.search ? I.search( { size: 20 } ) : '🔍' }
						</span>
						<span className="tray-tile-name">
							{ __( 'Search', 'wunderpaint' ) }
						</span>
					</button>
					{ PHOTO_CATEGORIES.map( ( c ) => (
						<button
							key={ c.q }
							className="tray-tile tray-tile-labeled tray-photo-cat"
							onClick={ () => setQuery && setQuery( c.q ) }
						>
							<span
								className="tray-tile-preview"
								style={
									catThumbs[ c.q ]
										? {
												backgroundImage: `url(${
													catThumbs[ c.q ]
												})`,
										  }
										: undefined
								}
							/>
							<span className="tray-tile-name">{ c.label }</span>
						</button>
					) ) }
				</>
			) }
			{ busy && <span className="spin" /> }
			{ /* The tile is a container, not one big button, and that is
			     the providers' doing: a photo has to be shown with a link
			     back to the photographer, and a link inside a button is
			     invalid HTML. So the picture is the button that inserts,
			     and the credit underneath is its own line.
			     Consequence worth knowing: clicking the name no longer
			     inserts the photo, it opens the photographer's page. */ }
			{ results.map( ( item ) => (
				<div
					key={ item.id }
					className="tray-tile tray-tile-labeled tray-photo"
				>
					<button
						className="tray-photo-hit"
						title={ creditOf( item ) }
						{ ...tileProps( assetOf( item ), () =>
							insert( assetOf( item ) )
						) }
					>
						<span className="tray-tile-preview">
							<img
								src={ item.thumb }
								alt={ item.author }
								loading="lazy"
								draggable={ false }
							/>
						</span>
					</button>
					<span className="tray-tile-name tray-photo-credit">
						{ item.authorUrl && item.author ? (
							<a
								href={ item.authorUrl }
								target="_blank"
								rel="noreferrer"
							>
								{ item.author }
							</a>
						) : (
							item.author
						) }
						{ item.author ? ' \u00B7 ' : '' }
						{ labelFor( provider ) }
					</span>
				</div>
			) ) }
		</div>
	);
}

/** Last inserted assets, newest first (v1.15). */
function RecentStrip( { query, insert, version } ) {
	const combos = useCombos();
	const elements = useElements();
	const gradients = useGradients();
	const [ icons, setIcons ] = useState( null );
	useEffect( () => {
		import( /* webpackChunkName: "icons-lib" */ '../icons-lib/tabler.json' )
			.then( ( mod ) => setIcons( mod.default || mod ) )
			.catch( () => setIcons( {} ) );
	}, [] );
	// `version` bumps after every insert so the list refreshes.
	const recents = listRecentAssets().filter( ( asset ) => {
		const label =
			asset.name ||
			asset.n ||
			asset.title ||
			asset.author ||
			asset.id ||
			asset.color ||
			'';
		return ! query || String( label ).toLowerCase().includes( query );
	} );
	return (
		<div
			onWheel={ wheelScroll }
			className="tray-strip"
			data-version={ version }
		>
			{ 0 === recents.length && (
				<span className="tray-hint">
					{ __(
						'Nothing inserted yet, everything you insert lands here.',
						'wunderpaint'
					) }
				</span>
			) }
			{ recents.map( ( asset ) => {
				const key = `${ asset.kind }:${
					asset.id || asset.name || asset.c || asset.color
				}`;
				if ( 'combo' === asset.kind ) {
					const combo = combos.find( ( c ) => c.id === asset.id );
					return combo ? (
						<PipelineTile
							key={ key }
							cacheKey={ `combo:${ combo.id }` }
							doc={ comboPreviewDoc }
							buildLayers={ () =>
								combo.build( comboPreviewDoc, {} )
							}
							title={ combo.label }
							asset={ asset }
							onUse={ () => insert( asset ) }
						/>
					) : null;
				}
				if ( 'element' === asset.kind ) {
					const item = elements
						.flatMap( ( set ) => set.items )
						.find( ( entry ) => entry.name === asset.name );
					return item ? (
						<PipelineTile
							key={ key }
							cacheKey={ `el:${ item.name }` }
							doc={ elementPreviewDoc }
							buildLayers={ () => elementPreviewLayers( item ) }
							title={ item.name }
							asset={ asset }
							onUse={ () => insert( asset ) }
						/>
					) : null;
				}
				if ( 'icon' === asset.kind ) {
					return icons?.[ asset.name ] ? (
						<IconTile
							key={ key }
							name={ asset.name }
							d={ icons[ asset.name ] }
							insert={ insert }
						/>
					) : null;
				}
				if ( 'emoji' === asset.kind ) {
					return (
						<button
							key={ key }
							className="tray-tile tray-emoji"
							title={ asset.n }
							{ ...tileProps( asset, () => insert( asset ) ) }
						>
							{ asset.c }
						</button>
					);
				}
				if ( 'upload' === asset.kind || 'photo' === asset.kind ) {
					return (
						<button
							key={ key }
							className="tray-tile"
							title={ asset.title || asset.author }
							{ ...tileProps( asset, () => insert( asset ) ) }
						>
							<img
								src={ asset.thumb || asset.url }
								alt=""
								loading="lazy"
								draggable={ false }
							/>
						</button>
					);
				}
				if ( 'bg-gradient' === asset.kind ) {
					const preset = gradients.find(
						( entry ) => entry.name === asset.name
					);
					return preset ? (
						<button
							key={ key }
							className="tray-tile tray-swatch"
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
							{ ...tileProps( asset, () => insert( asset ) ) }
						/>
					) : null;
				}
				if ( 'bg-solid' === asset.kind ) {
					return (
						<button
							key={ key }
							className="tray-tile tray-swatch"
							title={ asset.color }
							style={ { background: asset.color } }
							{ ...tileProps( asset, () => insert( asset ) ) }
						/>
					);
				}
				return null;
			} ) }
		</div>
	);
}

/* -------------------------------- tray ---------------------------------- */

/* ------------------------- template strips (v1.98) ---------------------- */

function TemplatesStrip( { query, editor, extras } ) {
	const [ list, setList ] = useState( null );
	useEffect( () => {
		templatesApi
			.list()
			.then( setList )
			.catch( () => setList( [] ) );
	}, [] );
	const items = ( list || [] ).filter(
		( t ) => ! query || t.name.toLowerCase().includes( query )
	);
	if ( null === list ) {
		return (
			<div className="tray-hint">{ __( 'Loading…', 'wunderpaint' ) }</div>
		);
	}
	if ( ! items.length ) {
		return (
			<div className="tray-hint">
				{ __(
					'No dynamic templates yet. Use File → “Save as Dynamic Template”.',
					'wunderpaint'
				) }
			</div>
		);
	}
	return (
		<div onWheel={ wheelScroll } className="tray-strip">
			{ items.map( ( t ) => (
				<button
					key={ t.id }
					className="tray-tile tray-tile-labeled"
					title={ t.name }
					onClick={ async () => {
						try {
							await openTemplateDocument( editor, t, extras );
						} catch ( err ) {
							extras?.toasts?.error?.( err.message );
						}
					} }
				>
					<span className="tray-tile-preview">
						{ t.preview ? (
							<img src={ t.preview } alt="" draggable={ false } />
						) : I.image ? (
							I.image( { size: 18 } )
						) : null }
					</span>
					<span className="tray-tile-name">{ t.name }</span>
				</button>
			) ) }
		</div>
	);
}

function DesignsStrip( { query, editor, extras } ) {
	const [ list, setList ] = useState( null );
	useEffect( () => {
		designsApi
			.list()
			.then( setList )
			.catch( () => setList( [] ) );
	}, [] );
	const items = ( list || [] ).filter(
		( d ) =>
			! query ||
			d.name.toLowerCase().includes( query ) ||
			( d.folder || '' ).toLowerCase().includes( query )
	);
	if ( null === list ) {
		return (
			<div className="tray-hint">{ __( 'Loading…', 'wunderpaint' ) }</div>
		);
	}
	if ( ! items.length ) {
		return (
			<div className="tray-hint">
				{ __(
					'No designs yet. Use File → “Save Design” to keep an editable copy of your work here.',
					'wunderpaint'
				) }
			</div>
		);
	}
	return (
		<div onWheel={ wheelScroll } className="tray-strip">
			{ items.map( ( d ) => (
				<button
					key={ d.id }
					className="tray-tile tray-tile-labeled"
					title={ d.name }
					onClick={ async () => {
						try {
							await openDesignDocument( editor, d, extras );
						} catch ( err ) {
							extras?.toasts?.error?.( err.message );
						}
					} }
				>
					<span className="tray-tile-preview">
						{ d.preview ? (
							<img src={ d.preview } alt="" draggable={ false } />
						) : I.image ? (
							I.image( { size: 18 } )
						) : null }
					</span>
					<span className="tray-tile-name">{ d.name }</span>
				</button>
			) ) }
		</div>
	);
}

function StartersStrip( { query, editor, extras } ) {
	const starters = useTemplates();
	// Extension template packs (v1.121) join the built-in starters.
	const packs = useExtensionTemplatePacks();
	// Photo-UX drill-in (v1.255.0, the v1.55 stock pattern): with no
	// search the strip shows one CARD per category; a click drills into
	// that category, the leading tile goes back. The tray search feeds
	// the shared matcher, so "red menu" also hits copy and palette.
	const [ cat, setCat ] = useState( '' );
	// Pack templates count into the cards and the drill-in (v1.257.0).
	const combined = [
		...starters,
		...packs.flatMap( ( pack ) => pack.templates ),
	];
	if ( ! query && ! cat ) {
		return (
			<div onWheel={ wheelScroll } className="tray-strip">
				{ mergeTemplateCategories( packs ).map( ( c ) => {
					const inCat = filterTemplates( combined, {
						cat: c.id,
					} );
					if ( ! inCat.length ) {
						return null;
					}
					return (
						<button
							key={ c.id }
							className="tray-tile tray-tile-labeled tray-photo-cat"
							title={ sprintf(
								/* translators: 1: category name, 2: number of templates. */
								__( '%1$s (%2$d templates)', 'wunderpaint' ),
								c.label,
								inCat.length
							) }
							onClick={ () => setCat( c.id ) }
						>
							<span className="tray-tile-preview">
								<StarterPreview template={ inCat[ 0 ] } />
							</span>
							<span className="tray-tile-name">{ c.label }</span>
						</button>
					);
				} ) }
			</div>
		);
	}
	const filters = { q: query, cat };
	const items = [
		...filterTemplates( starters, filters ).map( ( t ) => ( {
			template: t,
			packLabel: null,
		} ) ),
		...packs.flatMap( ( pack ) =>
			pack.templates
				.filter(
					( t ) =>
						filterTemplates( [ t ], filters ).length ||
						( ! cat &&
							!! query &&
							pack.label.toLowerCase().includes( query ) )
				)
				.map( ( t ) => ( { template: t, packLabel: pack.label } ) )
		),
	];
	return (
		<div onWheel={ wheelScroll } className="tray-strip">
			{ !! cat && (
				<button
					className="tray-tile tray-tile-labeled tray-photo-cat tray-search-card"
					onClick={ () => setCat( '' ) }
					title={ __( 'All categories', 'wunderpaint' ) }
				>
					<span className="tray-tile-preview">
						{ I.grid( { size: 20 } ) }
					</span>
					<span className="tray-tile-name">
						{ __( 'All categories', 'wunderpaint' ) }
					</span>
				</button>
			) }
			{ ! items.length && (
				<span className="tray-hint">
					{ __( 'No matches.', 'wunderpaint' ) }
				</span>
			) }
			{ items.map( ( { template, packLabel } ) => (
				<button
					key={ template.id }
					className="tray-tile tray-tile-labeled"
					title={
						packLabel
							? `${ template.name } · ${ packLabel }`
							: template.name
					}
					onClick={ () =>
						openStarterDocument( editor, template, extras )
					}
				>
					<span className="tray-tile-preview">
						<StarterPreview template={ template } />
					</span>
					<span className="tray-tile-name">{ template.name }</span>
				</button>
			) ) }
		</div>
	);
}

function BrandStrip( { query, editor, extras } ) {
	// One tile per kit logo (v1.98.1): a click inserts that kit's logo.
	const kits = ( window.WPIE?.brandKits || [] ).filter(
		( k ) =>
			!! k.logoUrl &&
			( ! query || k.name.toLowerCase().includes( query ) )
	);
	if ( ! kits.length ) {
		return (
			<div className="tray-hint">
				{ __( 'No Brand Kit has a logo yet.', 'wunderpaint' ) }
			</div>
		);
	}
	return (
		<div onWheel={ wheelScroll } className="tray-strip">
			{ kits.map( ( kit ) => (
				<button
					key={ kit.id }
					className="tray-tile tray-tile-labeled"
					title={ __( 'Insert logo', 'wunderpaint' ) }
					onClick={ () =>
						Ops.insertLogoOp( editor, extras, kit.logoUrl )
					}
				>
					<span className="tray-tile-preview">
						<img src={ kit.logoUrl } alt="" draggable={ false } />
					</span>
					<span className="tray-tile-name">{ kit.name }</span>
				</button>
			) ) }
		</div>
	);
}

function ExtensionStrip( { section, query, insert, editor, extras } ) {
	// Extension library sections (v1.119): items are a static array
	// (filtered here by the tray search) or a function of the query.
	const dynamic = 'function' === typeof section.items;
	const [ items, setItems ] = useState( null );
	useEffect( () => {
		let cancelled = false;
		Promise.resolve( dynamic ? section.items( query ) : section.items )
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
	}, [ section, query, dynamic ] );
	if ( ! items ) {
		return (
			<div className="tray-hint">
				<span className="spin" />
			</div>
		);
	}
	const list = dynamic
		? items
		: items.filter(
				( item ) =>
					! query ||
					( item.name || '' ).toLowerCase().includes( query )
		  );
	if ( ! list.length ) {
		return (
			<div className="tray-hint">
				{ __( 'No items found.', 'wunderpaint' ) }
			</div>
		);
	}

	// `item.use` is the extension's own insert callback and keeps its name -
	// it is part of the registered section descriptor, so renaming it would
	// break every package. Our own prop was called `use` too until v1.346.0,
	// which made React's rules-of-hooks rule flag both; it is `insert` now.
	const pick = ( item ) =>
		item.use ? item.use( { editor, extras } ) : insert( item.asset );
	return (
		<div onWheel={ wheelScroll } className="tray-strip">
			{ list.map( ( item, i ) => (
				<button
					key={ item.id || item.name || i }
					className={ `tray-tile${
						item.name ? ' tray-tile-labeled' : ''
					}` }
					title={ item.name }
					{ ...( item.asset
						? tileProps( item.asset, () => pick( item ) )
						: { onClick: () => pick( item ) } ) }
				>
					<span className="tray-tile-preview">
						<img
							src={ item.preview }
							alt=""
							draggable={ false }
							loading="lazy"
						/>
					</span>
					{ item.name && (
						<span className="tray-tile-name">{ item.name }</span>
					) }
				</button>
			) ) }
		</div>
	);
}

export function LibraryTray( { extras } ) {
	const editor = useEditor();
	const [ open, setOpen ] = useState( () => {
		const stored = window.localStorage.getItem( 'wpie-tray-open' );
		// Demo installs open the tray for first-time visitors (v1.308):
		// the asset shelf IS the pitch. A visitor's own choice sticks.
		if ( null === stored ) {
			return !! window.WPIE?.demo;
		}
		return '1' === stored;
	} );
	const [ section, setSection ] = useState(
		() => window.localStorage.getItem( 'wpie-tray-section' ) || 'buttons'
	);
	const [ query, setQuery ] = useState( '' );
	const [ recentVersion, setRecentVersion ] = useState( 0 );
	// Stock providers for the Photos section (v1.291.4): a small dropdown by
	// the search lets you pick Pexels / Pixabay / Unsplash instead of being
	// stuck on the first configured one.
	const stockCfg = Object.keys( editor.WPIE?.stock || {} ).filter(
		( id ) => editor.WPIE.stock[ id ]
	);
	const stockLabel = ( id ) =>
		editor.WPIE?.stockLabels?.[ id ] ||
		{ pexels: 'Pexels', pixabay: 'Pixabay', unsplash: 'Unsplash' }[ id ] ||
		id;
	const [ photoProvider, setPhotoProvider ] = useState(
		() => stockCfg[ 0 ] || ''
	);
	// Extension sections may register after mount (v1.119).
	const [ , setExtTick ] = useState( 0 );
	useEffect(
		() => subscribeExtensions( () => setExtTick( ( t ) => t + 1 ) ),
		[]
	);
	useEffect( () => {
		window.localStorage.setItem( 'wpie-tray-open', open ? '1' : '0' );
		window.localStorage.setItem( 'wpie-tray-section', section );
	}, [ open, section ] );

	// Deep link into a tray section (v1.166.3): the Easy Mode toolbar
	// sends users here for photos and emoji - the tray is the surface
	// people actually use, not the modal library.
	useEffect( () => {
		const onOpen = ( e ) => {
			const id = e.detail?.section;
			if ( ! id ) {
				return;
			}
			setQuery( '' );
			setSection( id );
			setOpen( true );
		};
		window.addEventListener( 'wpie:tray-open', onOpen );
		return () => window.removeEventListener( 'wpie:tray-open', onOpen );
	}, [] );

	const insert = async ( asset ) => {
		await insertAsset( editor, extras, asset, null );
		setRecentVersion( ( v ) => v + 1 );
	};

	const sections = [
		{ id: 'recent', label: __( 'Recent', 'wunderpaint' ) },
		{ id: 'assets', label: __( 'My Assets', 'wunderpaint' ) },
		{ id: 'designs', label: __( 'My Designs', 'wunderpaint' ) },
		{ id: 'templates', label: __( 'Dynamic Templates', 'wunderpaint' ) },
		{ id: 'starters', label: __( 'Starter Templates', 'wunderpaint' ) },
		{ id: 'brand', label: __( 'Brand Kits', 'wunderpaint' ) },
		// Text-combo categories as top-level tray chips (v1.55.1).
		...COMBO_CATEGORIES,
		{ id: 'elements', label: __( 'Shapes', 'wunderpaint' ) },
		{ id: 'backgrounds', label: __( 'Backgrounds', 'wunderpaint' ) },
		{ id: 'icons', label: __( 'Icons', 'wunderpaint' ) },
		{ id: 'emoji', label: __( 'Emoji', 'wunderpaint' ) },
		{ id: 'photos', label: __( 'Photos', 'wunderpaint' ) },
		// Illustrations/vectors are Pixabay-only: no key, no chips (v1.110).
		...( editor.WPIE?.stock?.pixabay
			? [
					{
						id: 'illustrations',
						label: __( 'Illustrations', 'wunderpaint' ),
					},
					{ id: 'vectors', label: __( 'Vectors', 'wunderpaint' ) },
			  ]
			: [] ),
		{ id: 'uploads', label: __( 'Media Library', 'wunderpaint' ) },
		// Extension sections (v1.119): installed asset packs et al.
		...listExtensionLibrarySections().map( ( s ) => ( {
			id: s.id,
			label: s.label,
		} ) ),
	];

	const pick = ( id ) => {
		if ( open && id === section ) {
			setOpen( false );
			return;
		}
		// Switching categories clears the search: a leftover query from the
		// previous section silently empties the new one and reads as broken
		// (user report, v1.118).
		if ( id !== section ) {
			setQuery( '' );
		}
		setSection( id );
		setOpen( true );
	};
	const q = query.trim().toLowerCase();

	return (
		<div className={ `library-tray ${ open ? 'open' : '' }` }>
			<div className="tray-head">
				<span className="tray-title">
					{ __( 'Asset Library', 'wunderpaint' ) }
				</span>
				{ /* Only the category chips scroll; search, provider and the
				     toggle stay pinned on the right so they are always
				     reachable without horizontal scrolling (v1.291.4). */ }
				<div onWheel={ wheelScroll } className="tray-chips">
					{ sections.map( ( s ) => (
						<button
							key={ s.id }
							className={ `tray-chip ${
								open && section === s.id ? 'active' : ''
							}` }
							onClick={ () => pick( s.id ) }
						>
							{ s.label }
						</button>
					) ) }
				</div>
				{ open && (
					<input
						type="search"
						className="tray-search"
						value={ query }
						placeholder={
							'photos' === section
								? __( 'Search free photos…', 'wunderpaint' )
								: 'illustrations' === section
								? __(
										'Search free illustrations…',
										'wunderpaint'
								  )
								: 'vectors' === section
								? __(
										'Search free vector graphics…',
										'wunderpaint'
								  )
								: __( 'Filter…', 'wunderpaint' )
						}
						aria-label={ __( 'Search the library', 'wunderpaint' ) }
						onChange={ ( e ) => setQuery( e.target.value ) }
					/>
				) }
				{ open && 'photos' === section && stockCfg.length > 1 && (
					<select
						className="tray-provider"
						value={ photoProvider }
						aria-label={ __( 'Stock provider', 'wunderpaint' ) }
						title={ __( 'Stock provider', 'wunderpaint' ) }
						onChange={ ( e ) => setPhotoProvider( e.target.value ) }
					>
						{ stockCfg.map( ( id ) => (
							<option key={ id } value={ id }>
								{ stockLabel( id ) }
							</option>
						) ) }
					</select>
				) }
				<button
					className="tray-toggle"
					title={
						open
							? __( 'Collapse', 'wunderpaint' )
							: __( 'Expand', 'wunderpaint' )
					}
					aria-label={
						open
							? __( 'Collapse library tray', 'wunderpaint' )
							: __( 'Expand library tray', 'wunderpaint' )
					}
					onClick={ () => setOpen( ! open ) }
				>
					{ open
						? I.arrDown( { size: 14 } )
						: I.arrUp( { size: 14 } ) }
				</button>
			</div>
			{ open && (
				<div className="tray-body">
					{ 'recent' === section && (
						<RecentStrip
							query={ q }
							insert={ insert }
							version={ recentVersion }
						/>
					) }
					{ COMBO_CATEGORIES.some( ( c ) => c.id === section ) && (
						<TextStrip
							category={ section }
							query={ q }
							insert={ insert }
						/>
					) }
					{ 'elements' === section && (
						<ElementsStrip query={ q } insert={ insert } />
					) }
					{ 'backgrounds' === section && (
						<BackgroundsStrip
							editor={ editor }
							query={ q }
							insert={ insert }
						/>
					) }
					{ 'icons' === section && (
						<IconsStrip query={ q } insert={ insert } />
					) }
					{ 'emoji' === section && (
						<EmojiStrip query={ q } insert={ insert } />
					) }
					{ 'photos' === section && (
						<PhotosStrip
							editor={ editor }
							query={ q }
							setQuery={ setQuery }
							insert={ insert }
							providerOverride={ photoProvider }
						/>
					) }
					{ 'illustrations' === section && (
						<PhotosStrip
							editor={ editor }
							query={ q }
							setQuery={ setQuery }
							insert={ insert }
							type="illustration"
						/>
					) }
					{ 'vectors' === section && (
						<PhotosStrip
							editor={ editor }
							query={ q }
							setQuery={ setQuery }
							insert={ insert }
							type="vector"
						/>
					) }
					{ 'assets' === section && (
						<MyAssetsStrip
							query={ q }
							editor={ editor }
							extras={ extras }
						/>
					) }
					{ 'designs' === section && (
						<DesignsStrip
							query={ q }
							editor={ editor }
							extras={ extras }
						/>
					) }
					{ 'templates' === section && (
						<TemplatesStrip
							query={ q }
							editor={ editor }
							extras={ extras }
						/>
					) }
					{ 'starters' === section && (
						<StartersStrip
							query={ q }
							editor={ editor }
							extras={ extras }
						/>
					) }
					{ 'brand' === section && (
						<BrandStrip
							query={ q }
							editor={ editor }
							extras={ extras }
						/>
					) }
					{ 'uploads' === section && (
						<UploadsStrip query={ q } insert={ insert } />
					) }
					{ !! getExtensionLibrarySection( section ) && (
						<ExtensionStrip
							section={ getExtensionLibrarySection( section ) }
							query={ q }
							insert={ insert }
							editor={ editor }
							extras={ extras }
						/>
					) }
				</div>
			) }
		</div>
	);
}
