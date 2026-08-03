/**
 * Font picker (F3, v0.5): searchable dropdown that previews every family
 * in its own face. All families are self-hosted (v1.26); their preview faces
 * load from the plugin (no CDN) when the list opens.
 */

import { useState, useEffect, useRef } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { FONT_GROUPS } from '../store/constants';
import { useEditorMaybe } from '../store/editor-context';
import {
	ensureFont,
	customFamilies,
	googleEnabled,
	isLoadableFamily,
	GOOGLE_FONTS,
	LOCAL_FONTS,
} from '../lib/font-manager';

export function FontPicker( {
	value,
	onChange,
	width = 150,
	families = null,
} ) {
	// Nullable context (v1.272.1): the picker also mounts OUTSIDE the
	// editor provider - the bridge's mountFontPicker renders it into a
	// standalone root for extension packs; the bootstrap payload then
	// supplies the brand fonts.
	const ctx = useEditorMaybe();
	const WPIE = ctx?.WPIE || window.WPIE || {};
	const brandFonts = WPIE?.brand?.fonts || [];
	const custom = customFamilies();
	// Optional allow-list (v1.273.0): curated catalogs (a 3D face set, a
	// poster pack) filter every group; empty groups vanish in render.
	const allow = families?.length ? new Set( families ) : null;
	const baseGroups = [
		...( brandFonts.length
			? [ { label: __( 'Brand', 'wunderpaint' ), fonts: brandFonts } ]
			: [] ),
		...( custom.length
			? [ { label: __( 'Custom fonts', 'wunderpaint' ), fonts: custom } ]
			: [] ),
		...FONT_GROUPS,
		// CDN faces load lazily as their rows scroll into view (and on
		// selection) - 195 upfront stylesheet links would be absurd.
		...( googleEnabled()
			? [
					{
						label: __( 'Google Fonts', 'wunderpaint' ),
						fonts: GOOGLE_FONTS,
						cdn: true,
					},
			  ]
			: [] ),
	];
	// Only families that are actually drawable show up: the ten bundled, any
	// downloaded, custom uploads, brand faces that resolve, and - when the CDN
	// is on - the Google list. Catalog families that are neither downloaded nor
	// reachable via CDN stay hidden, so nothing silently falls back (v1.316).
	const groups = baseGroups.map( ( g ) => ( {
		...g,
		fonts: g.fonts.filter(
			( f ) => ( ! allow || allow.has( f ) ) && isLoadableFamily( f )
		),
	} ) );
	// Admins get a nudge when catalog families are still hidden because the
	// library is not downloaded and the CDN is off.
	const moreFonts =
		!! WPIE?.canManage &&
		! googleEnabled() &&
		Object.keys( LOCAL_FONTS ).some( ( f ) => ! isLoadableFamily( f ) );
	const [ open, setOpen ] = useState( null ); // fixed anchor style | null
	// Search is back (v1.313): 300+ families (locals + Google) are not
	// scannable by eye. Filter is a case-insensitive substring across
	// every group; empty groups vanish in render.
	const [ query, setQuery ] = useState( '' );
	const ref = useRef( null );
	const searchRef = useRef( null );

	const q = query.trim().toLowerCase();
	const shown = q
		? groups.map( ( g ) => ( {
				...g,
				fonts: g.fonts.filter( ( f ) => f.toLowerCase().includes( q ) ),
		  } ) )
		: groups;

	useEffect( () => {
		if ( ! open ) {
			return;
		}
		// Load each family's preview face (self-hosted) so the list shows
		// real glyphs; browser-cached after the first open.
		groups
			.filter( ( group ) => ! group.cdn )
			.forEach( ( group ) =>
				group.fonts.forEach( ( family ) => ensureFont( family ) )
			);
		// Focus the search, jump to the current family (only while the
		// list is unfiltered - a filtered list starts at the top).
		searchRef.current?.focus();
		if ( ! query ) {
			ref.current
				?.querySelector( '.font-picker-list .active' )
				?.scrollIntoView( { block: 'center' } );
		}
		// CDN previews: fetch each Google face when its row scrolls into
		// view; the browser swaps the rendered row once the face arrives.
		const list = ref.current?.querySelector( '.font-picker-list' );
		let observer = null;
		if ( list && 'undefined' !== typeof IntersectionObserver ) {
			observer = new IntersectionObserver(
				( entries ) => {
					for ( const entry of entries ) {
						if ( entry.isIntersecting ) {
							ensureFont( entry.target.dataset.family );
							observer.unobserve( entry.target );
						}
					}
				},
				{ root: list, rootMargin: '80px' }
			);
			list.querySelectorAll( '[data-cdn-family]' ).forEach( ( el ) =>
				observer.observe( el )
			);
		}
		const onDown = ( e ) => {
			if ( ref.current && ! ref.current.contains( e.target ) ) {
				setOpen( null );
			}
		};
		const onKey = ( e ) => {
			if ( 'Escape' === e.key ) {
				e.stopPropagation();
				setOpen( null );
			}
		};
		document.addEventListener( 'mousedown', onDown );
		document.addEventListener( 'keydown', onKey, true );
		return () => {
			observer?.disconnect();
			document.removeEventListener( 'mousedown', onDown );
			document.removeEventListener( 'keydown', onKey, true );
		};
		// query is a dep so the CDN-preview observer re-attaches to rows
		// that filtering just brought into existence.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ open, query ] );

	return (
		<span className="font-picker" ref={ ref } style={ { width } }>
			<button
				type="button"
				className="font-picker-toggle"
				aria-haspopup="listbox"
				aria-expanded={ open }
				style={ { fontFamily: `"${ value }", sans-serif` } }
				onClick={ ( e ) => {
					if ( open ) {
						setOpen( null );
						return;
					}
					// position: fixed, the bar/panels clip absolute popups
					// (house rule since v1.0.6).
					const rect = e.currentTarget.getBoundingClientRect();
					const popWidth = Math.max( rect.width, 220 );
					const left = Math.min(
						Math.max( 8, rect.left ),
						window.innerWidth - popWidth - 12
					);
					const maxHeight = Math.min(
						420,
						window.innerHeight - rect.bottom - 16
					);
					setQuery( '' );
					setOpen( {
						position: 'fixed',
						left,
						top: rect.bottom + 4,
						width: popWidth,
						maxHeight: Math.max( 180, maxHeight ),
						zIndex: 700,
					} );
				} }
			>
				<span className="font-picker-label">{ value }</span>
				<span aria-hidden="true">▾</span>
			</button>
			{ open && (
				<div className="font-picker-pop" role="listbox" style={ open }>
					<div className="font-picker-search">
						<input
							ref={ searchRef }
							type="search"
							value={ query }
							placeholder={ __( 'Search fonts…', 'wunderpaint' ) }
							onChange={ ( e ) => setQuery( e.target.value ) }
							onKeyDown={ ( e ) => {
								if ( 'Enter' === e.key ) {
									const first = shown.flatMap(
										( g ) => g.fonts
									)[ 0 ];
									if ( first ) {
										onChange( first );
										setOpen( null );
									}
								}
							} }
						/>
					</div>
					<div className="font-picker-list">
						{ shown.map( ( group ) => {
							const fonts = group.fonts;
							if ( ! fonts.length ) {
								return null;
							}
							return (
								<div key={ group.label }>
									<div className="font-picker-group">
										{ group.label }
									</div>
									{ fonts.map( ( family ) => (
										<button
											type="button"
											key={ family }
											role="option"
											aria-selected={ family === value }
											className={
												family === value ? 'active' : ''
											}
											data-cdn-family={
												group.cdn ? family : undefined
											}
											data-family={ family }
											style={ {
												fontFamily: `"${ family }", sans-serif`,
											} }
											onClick={ () => {
												onChange( family );
												setOpen( null );
											} }
										>
											{ family }
										</button>
									) ) }
								</div>
							);
						} ) }
					</div>
					{ moreFonts && (
						<div
							className="font-picker-hint"
							style={ {
								padding: '6px 10px',
								fontSize: 11,
								opacity: 0.7,
								borderTop: '1px solid rgba(128,128,128,0.25)',
							} }
						>
							{ __(
								'More fonts available. Download the full library under Settings, Fonts.',
								'wunderpaint'
							) }
						</div>
					) }
				</div>
			) }
		</span>
	);
}
