/**
 * Blend-mode picker (v1.24.12): a styled dropdown that LIVE-PREVIEWS each mode
 * as you hover, the canvas updates immediately (a no-commit layer patch), so
 * you see the result before choosing. Clicking commits it; leaving the menu,
 * clicking away or pressing Escape reverts to the mode you started with.
 * Replaces the plain <select>.
 *
 * The parent wires the actual dispatch through `onPreview` (no history entry)
 * and `onCommit` (history entry), so this works for a single layer or a
 * multi-selection alike.
 *
 * Tiles (v1.430): hand in `tiles` = { doc, layers, activeId } and the menu
 * shows one small render per mode, families in rows, all sixteen results at
 * once. Rendered ONCE per opening from the state at that moment (the hover
 * preview keeps patching the canvas, the tiles must not follow it). Without
 * `tiles` it stays the text list (vignette dialog).
 */
import { useState, useRef, useEffect } from '@wordpress/element';
import { _x } from '@wordpress/i18n';

import { I } from '../icons';
import { BLEND_MODES, BLEND_MODE_LABELS } from '../store/constants';
import { BLEND_FAMILIES, renderBlendTiles } from '../lib/raster/blend-tiles';

const labelFor = ( b ) => BLEND_MODE_LABELS[ b ] || b.replace( /-/g, ' ' );

/** Family headings (the first family, Normal, has none). */
const FAMILY_LABELS = {
	darken: _x( 'Darken', 'blend family', 'wunderpaint' ),
	lighten: _x( 'Lighten', 'blend family', 'wunderpaint' ),
	contrast: _x( 'Contrast', 'blend family', 'wunderpaint' ),
	invert: _x( 'Invert', 'blend family', 'wunderpaint' ),
	color: _x( 'Color', 'blend family', 'wunderpaint' ),
};

/**
 * Tile menu: 4 × 60px tiles + 3 × 6px gaps + 2 × 6px padding + border wide;
 * six rows of fixed height tall (see editor-shell.css), it never scrolls.
 */
const TILE_MENU_W = 272;
const TILE_MENU_H = 487;

/** Fixed-position menu anchored to the button, clamped to the viewport. */
function menuStyle( rect, minWidth = 152, maxH = 300 ) {
	const width = Math.max( minWidth, rect.width );
	let left = rect.left;
	if ( left + width > window.innerWidth - 8 ) {
		left = window.innerWidth - width - 8;
	}
	let top = rect.bottom + 4;
	if ( top + maxH > window.innerHeight - 8 ) {
		// Above the button, or, when neither side has room, flush with
		// the bottom edge (the tile menu has no scrollbar to fall back on).
		top = rect.top - maxH - 4;
		if ( top < 8 ) {
			top = Math.max( 8, window.innerHeight - maxH - 8 );
		}
	}
	return { position: 'fixed', left, top, width };
}

export function BlendModeSelect( {
	value,
	disabled,
	width,
	tiles,
	onPreview,
	onCommit,
} ) {
	const [ menu, setMenu ] = useState( null ); // anchored style | null
	const [ tileMap, setTileMap ] = useState( null ); // mode → data URL
	const ref = useRef( null );
	const original = useRef( value );
	// Read at opening time only, never re-rendered on hover patches.
	const tilesRef = useRef( tiles );
	tilesRef.current = tiles;

	useEffect( () => {
		if ( ! menu ) {
			return;
		}
		const revertClose = () => {
			onPreview( original.current );
			setMenu( null );
		};
		const onDown = ( e ) => {
			if ( ref.current && ! ref.current.contains( e.target ) ) {
				revertClose();
			}
		};
		const onKey = ( e ) => {
			if ( 'Escape' === e.key ) {
				e.stopPropagation();
				revertClose();
			}
		};
		document.addEventListener( 'mousedown', onDown, true );
		document.addEventListener( 'keydown', onKey, true );
		return () => {
			document.removeEventListener( 'mousedown', onDown, true );
			document.removeEventListener( 'keydown', onKey, true );
		};
	}, [ menu, onPreview ] );

	useEffect( () => {
		const src = tilesRef.current;
		if ( ! menu || ! src ) {
			setTileMap( null );
			return;
		}
		let cancelled = false;
		renderBlendTiles( src.doc, src.layers, src.activeId )
			.then( ( map ) => {
				if ( ! cancelled ) {
					setTileMap( map );
				}
			} )
			.catch( () => {} );
		return () => {
			cancelled = true;
		};
	}, [ menu ] );

	const toggle = ( e ) => {
		if ( disabled ) {
			return;
		}
		if ( menu ) {
			onPreview( original.current );
			setMenu( null );
			return;
		}
		// Read the rect synchronously (never inside a state updater).
		const rect = e.currentTarget.getBoundingClientRect();
		original.current = value;
		setMenu(
			tiles
				? menuStyle( rect, TILE_MENU_W, TILE_MENU_H )
				: menuStyle( rect )
		);
	};

	const optionProps = ( b ) => ( {
		type: 'button',
		role: 'option',
		'aria-selected': b === value,
		onMouseEnter: () => onPreview( b ),
		onFocus: () => onPreview( b ),
		onClick: () => {
			onCommit( b );
			setMenu( null );
		},
	} );

	return (
		<div
			className="blend-select"
			ref={ ref }
			style={ width ? { width } : undefined }
		>
			<button
				type="button"
				className="blend-select-btn"
				disabled={ disabled }
				aria-haspopup="listbox"
				aria-expanded={ !! menu }
				onClick={ toggle }
			>
				<span>{ labelFor( value || 'normal' ) }</span>
				{ I.chevDown( { size: 12 } ) }
			</button>
			{ menu && tiles && (
				<div
					className="blend-menu has-tiles"
					style={ menu }
					role="listbox"
				>
					{ BLEND_FAMILIES.map( ( fam ) => (
						<div key={ fam.key } className="blend-family-row">
							{ FAMILY_LABELS[ fam.key ] && (
								<div className="blend-family">
									{ FAMILY_LABELS[ fam.key ] }
								</div>
							) }
							<div className="blend-tiles">
								{ fam.modes.map( ( b ) => (
									<button
										key={ b }
										{ ...optionProps( b ) }
										className={ `blend-tile ${
											b === value ? 'active' : ''
										}` }
									>
										<span className="blend-tile-img">
											{ tileMap?.[ b ] && (
												<img
													src={ tileMap[ b ] }
													alt=""
												/>
											) }
										</span>
										<span className="blend-tile-name">
											{ labelFor( b ) }
										</span>
									</button>
								) ) }
							</div>
						</div>
					) ) }
				</div>
			) }
			{ menu && ! tiles && (
				<div className="blend-menu" style={ menu } role="listbox">
					{ BLEND_MODES.map( ( b ) => (
						<button
							key={ b }
							{ ...optionProps( b ) }
							className={ `blend-opt ${
								b === value ? 'active' : ''
							}` }
						>
							{ labelFor( b ) }
						</button>
					) ) }
				</div>
			) }
		</div>
	);
}
