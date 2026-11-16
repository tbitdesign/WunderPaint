/** Searchable card grid: cached visible thumbnails, one render per idle turn. */
import { useEffect, useMemo, useRef, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { I } from '../../icons';
import {
	cachedCatalogPreview,
	renderCatalogPreview,
	samePreviewValues,
} from './catalog-preview-cache';
import { TEXT_COLLECTION_GROUPS } from '../../lib/text-effects-collection';

const jobs = [];
let pending = false;
function pump() {
	if ( pending || ! jobs.length ) {
		return;
	}
	pending = true;
	const run = async () => {
		const job = jobs.shift();
		try {
			if ( job && ! job.cancelled ) {
				await job.run();
			}
		} finally {
			pending = false;
			while ( jobs[ 0 ]?.cancelled ) {
				jobs.shift();
			}
			pump();
		}
	};
	if ( typeof window.requestIdleCallback === 'function' ) {
		window.requestIdleCallback( run, { timeout: 160 } );
	} else {
		window.setTimeout( run, 16 );
	}
}
const groupOf = ( item ) => {
	if ( item.group ) {
		return item.group;
	}
	const id = item.id.toLowerCase();
	if ( /metal|platinum|gold|silver|chrome|foil/.test( id ) ) {
		return 'metal';
	}
	if ( /glass|opal/.test( id ) ) {
		return 'glass';
	}
	if ( /ribbon|shadow|echo|extrude/.test( id ) ) {
		return 'depth';
	}
	if ( /prism|splice|fold|cut/.test( id ) ) {
		return 'cut';
	}
	if ( /neon|glow|shine|sparkle|chromatic|vapor/.test( id ) ) {
		return 'light';
	}
	if ( /contour|tunnel|outline|wireframe/.test( id ) ) {
		return 'contour';
	}
	return 'essentials';
};
const searchable = ( text ) =>
	String( text )
		.normalize( 'NFD' )
		.replace( /[\u0300-\u036f]/g, '' )
		.toLowerCase();

function CatalogCard( {
	item,
	renderPreview,
	ready,
	choose,
	pressed,
	background,
	canvasPreview,
} ) {
	const itemRef = useRef( item );
	if ( ! samePreviewValues( itemRef.current, item ) ) {
		itemRef.current = item;
	}
	const recipe = itemRef.current;
	const element = useRef();
	useEffect( () => {
		const button = element.current;
		return () => canvasPreview?.stop( button );
	}, [ canvasPreview ] );
	const [ visible, setVisible ] = useState(
		typeof window.IntersectionObserver !== 'function'
	);
	const [ preview, setPreview ] = useState( () => {
		const cached = cachedCatalogPreview( renderPreview, recipe );
		return cached && ready
			? { renderer: renderPreview, recipe, url: cached.url, background }
			: null;
	} );
	useEffect( () => {
		if ( typeof window.IntersectionObserver !== 'function' ) {
			return undefined;
		}
		const observer = new window.IntersectionObserver(
			( entries ) => setVisible( entries[ 0 ].isIntersecting ),
			{ rootMargin: '80px' }
		);
		if ( element.current ) {
			observer.observe( element.current );
		}
		return () => observer.disconnect();
	}, [] );
	useEffect( () => {
		if (
			! ready ||
			! visible ||
			( preview?.renderer === renderPreview &&
				preview?.recipe === recipe )
		) {
			return undefined;
		}
		const job = {
			cancelled: false,
			run: async () => {
				let url = null;
				try {
					url = await renderCatalogPreview( renderPreview, recipe );
					if ( url && typeof window.Image === 'function' ) {
						const image = new window.Image();
						image.src = url;
						if ( image.decode ) {
							await image.decode();
						}
					}
				} catch ( e ) {
					url = null;
					/* A failed thumbnail must not prevent applying a style. */
				}
				if ( ! job.cancelled ) {
					setPreview( ( previous ) => ( {
						renderer: renderPreview,
						recipe,
						url: url || previous?.url || null,
						background: url
							? background
							: previous?.background ?? background,
					} ) );
				}
			},
		};
		jobs.push( job );
		pump();
		return () => {
			job.cancelled = true;
			const queued = jobs.indexOf( job );
			if ( queued !== -1 ) {
				jobs.splice( queued, 1 );
			}
		};
	}, [
		ready,
		visible,
		renderPreview,
		recipe,
		preview?.renderer,
		preview?.recipe,
		background,
	] );
	// Keep the previous bitmap until its replacement is rendered and decoded.
	const url = preview?.url;
	return (
		<button
			ref={ element }
			type="button"
			className={ 'effect-chip' + ( pressed ? ' active' : '' ) }
			title={ item.label }
			aria-pressed={ pressed }
			{ ...canvasPreview?.forItem( item ) }
			onClick={ () => {
				canvasPreview?.stop();
				choose( item );
			} }
		>
			<span
				className="effect-thumb"
				style={ { background: preview?.background ?? background } }
			>
				{ url ? (
					<img src={ url } alt="" />
				) : (
					<span className="effect-thumb-fallback" />
				) }
			</span>
			<span className="effect-label">{ item.label }</span>
		</button>
	);
}

export function TextCatalog( {
	items,
	kind,
	renderPreview,
	choose,
	active,
	background,
	categoryGroups = TEXT_COLLECTION_GROUPS,
	searchLabel,
	emptyLabel,
	previewScope,
	canvasPreview,
} ) {
	const [ renderer, setRenderer ] = useState( () => renderPreview );
	useEffect( () => {
		if ( renderer === renderPreview ) {
			return undefined;
		}
		const timer = window.setTimeout(
			() => setRenderer( () => renderPreview ),
			160
		);
		return () => window.clearTimeout( timer );
	}, [ renderPreview, renderer ] );
	const [ query, setQuery ] = useState( '' ),
		[ category, setCategory ] = useState( 'all' );
	const label =
		searchLabel ||
		( kind === 'styles'
			? __( 'Search styles', 'wunderpaint' )
			: __( 'Search text effects', 'wunderpaint' ) );
	const groups = useMemo( () => {
		const found = new Set( items.map( groupOf ) );
		return [
			...categoryGroups,
			{ id: 'essentials', label: __( 'Essentials', 'wunderpaint' ) },
		].filter( ( group ) => found.has( group.id ) );
	}, [ items, categoryGroups ] );
	const filtered = useMemo( () => {
		const needle = searchable( query.trim() );
		return items.filter(
			( item ) =>
				( category === 'all' || groupOf( item ) === category ) &&
				( ! needle ||
					searchable(
						item.label +
							' ' +
							item.id
								.replace( /([a-z])([A-Z])/g, '$1 $2' )
								.replace( /-/g, ' ' ) +
							' ' +
							( item.keywords || '' )
					).includes( needle ) )
		);
	}, [ items, category, query ] );
	return (
		<div
			className={
				'text-catalog' +
				( kind === 'filters' || kind === 'layer-effects'
					? ' layer-catalog'
					: '' )
			}
		>
			<div className="text-catalog-tools">
				<div className="dsm-search">
					{ I.search( { size: 14 } ) }
					<input
						type="search"
						className="dsm-input"
						aria-label={ label }
						placeholder={ label }
						value={ query }
						onChange={ ( e ) => setQuery( e.target.value ) }
					/>
				</div>
				<select
					className="dsm-select"
					aria-label={ __( 'Category', 'wunderpaint' ) }
					value={ category }
					onChange={ ( e ) => setCategory( e.target.value ) }
				>
					<option value="all">
						{ __( 'All categories', 'wunderpaint' ) }
					</option>
					{ groups.map( ( group ) => (
						<option key={ group.id } value={ group.id }>
							{ group.label }
						</option>
					) ) }
				</select>
			</div>
			<div className="effect-grid">
				{ filtered.map( ( item ) => (
					<CatalogCard
						key={ `${ previewScope || kind }:${ item.id }` }
						item={ item }
						renderPreview={ renderer }
						ready={ renderer === renderPreview }
						choose={ choose }
						canvasPreview={ canvasPreview }
						pressed={ active ? !! active[ item.id ] : undefined }
						background={
							typeof background === 'function'
								? background( item )
								: background
						}
					/>
				) ) }
			</div>
			{ ! filtered.length && (
				<p className="text-catalog-empty">
					{ emptyLabel ||
						( kind === 'styles'
							? __( 'No matching styles', 'wunderpaint' )
							: __( 'No matching effects', 'wunderpaint' ) ) }
				</p>
			) }
		</div>
	);
}
