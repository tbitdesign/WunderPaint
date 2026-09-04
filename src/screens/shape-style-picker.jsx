/**
 * Shape style picker (v1.430): a popover of live tiles, each the layer's
 * own shape with one preset applied, grouped Outlines / Looks. The same
 * pattern as the text annotation picker: the tile IS the result, so the
 * list needs no explanations.
 */

import { useState, useEffect } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import {
	SHAPE_STYLE_PRESETS,
	SHAPE_STYLE_PRESET_CATEGORIES,
	SHAPE_STYLE_RESET_PRESET,
	shapeBaseColor,
} from '../lib/shape-style-presets';
import { renderToCanvas, sharedImageCache } from '../lib/raster';
import { scaleRadius } from '../lib/corner-radii';
import { scalePathD } from '../lib/path';
import { useEditor, activeLayerOf } from '../store/editor-context';
import { tileBg } from './text-style-picker';

/**
 * The layer's shape at tile size, padded for shadows and outside strokes,
 * in its own tiny document.
 *
 * @param {Object} layer Shape layer.
 * @return {{pv: Object, doc: Object}} Preview layer and document.
 */
function previewBase( layer ) {
	const aspect = Math.max(
		0.4,
		Math.min( 2.5, ( layer.w || 1 ) / Math.max( 1, layer.h || 1 ) )
	);
	const w = aspect >= 1 ? 120 : Math.round( 120 * aspect );
	const h = aspect >= 1 ? Math.round( 120 / aspect ) : 120;
	const pad = 28;
	const sx = w / Math.max( 1, layer.w || 1 );
	const sy = h / Math.max( 1, layer.h || 1 );
	const pv = {
		...layer,
		parent: null,
		filter: null,
		adjust: null,
		opacity: 1,
		rot: 0,
		flipX: false,
		flipY: false,
		visible: true,
		x: pad,
		y: pad,
		w,
		h,
		radius: scaleRadius( layer.radius, Math.min( sx, sy ) ),
		pathD: layer.pathD ? scalePathD( layer.pathD, sx, sy ) : layer.pathD,
	};
	return {
		pv,
		doc: {
			id: 'ssp-prev',
			w: w + pad * 2,
			h: h + pad * 2,
			bg: 'transparent',
		},
	};
}

export function ShapeStylePicker() {
	const editor = useEditor();
	const { state, dispatch, commit } = editor;
	const target = activeLayerOf( state );
	const [ anchor, setAnchor ] = useState( null );
	const open = !! anchor;
	const [ previews, setPreviews ] = useState( {} );
	const isShape = !! target && 'shape' === target.type && ! target.quad;

	useEffect( () => {
		if ( ! open || ! isShape ) {
			return undefined;
		}
		let cancelled = false;
		const { pv, doc } = previewBase( target );
		const scale = Math.min( 92 / doc.w, 60 / doc.h );
		Promise.all(
			SHAPE_STYLE_PRESETS.map( async ( preset ) => {
				try {
					const canvas = await renderToCanvas(
						doc,
						[ { ...pv, ...preset.patch( pv ) } ],
						{ scale, cache: sharedImageCache }
					);
					return [
						preset.id,
						canvas?.toDataURL ? canvas.toDataURL() : null,
					];
				} catch ( e ) {
					return [ preset.id, null ];
				}
			} )
		).then( ( pairs ) => {
			if ( ! cancelled ) {
				setPreviews( Object.fromEntries( pairs ) );
			}
		} );
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		open,
		target?.id,
		target?.shape,
		target?.pathD,
		target?.fill,
		target?.stroke,
		target?.w,
		target?.h,
	] );

	// Close on outside click or Escape while open.
	useEffect( () => {
		if ( ! open ) {
			return undefined;
		}
		const onDown = ( e ) => {
			if ( ! e.target.closest?.( '.shape-style-picker' ) ) {
				setAnchor( null );
			}
		};
		const onKey = ( e ) => {
			if ( 'Escape' === e.key ) {
				e.stopPropagation();
				setAnchor( null );
			}
		};
		document.addEventListener( 'pointerdown', onDown, true );
		document.addEventListener( 'keydown', onKey, true );
		return () => {
			document.removeEventListener( 'pointerdown', onDown, true );
			document.removeEventListener( 'keydown', onKey, true );
		};
	}, [ open ] );

	if ( ! isShape ) {
		return null;
	}

	const apply = ( preset ) => {
		dispatch( {
			type: 'UPDATE_LAYER',
			id: target.id,
			patch: preset.patch( target ),
		} );
		commit( __( 'Shape style', 'wunderpaint' ) );
		setAnchor( null );
	};

	const bg = tileBg( shapeBaseColor( target ) );

	return (
		<div className="group nb shape-style-picker">
			<button
				type="button"
				className="tsp-btn"
				aria-expanded={ open }
				aria-haspopup="menu"
				onClick={ ( e ) => {
					if ( anchor ) {
						setAnchor( null );
						return;
					}
					const r = e.currentTarget.getBoundingClientRect();
					setAnchor( { left: r.left, top: r.bottom + 8 } );
				} }
			>
				{ __( 'Style', 'wunderpaint' ) }
				<span className="chev">▾</span>
			</button>
			{ open && (
				<div
					className="tsp-pop"
					role="menu"
					style={ {
						left: Math.max(
							8,
							Math.min( anchor.left, window.innerWidth - 364 )
						),
						top: Math.min( anchor.top, window.innerHeight - 320 ),
					} }
				>
					<div className="tsp-inkrow">
						<span style={ { flex: 1 } } />
						<button
							type="button"
							className="tsp-clear"
							onClick={ () => apply( SHAPE_STYLE_RESET_PRESET ) }
						>
							{ __( 'Plain fill', 'wunderpaint' ) }
						</button>
					</div>
					{ Object.entries( SHAPE_STYLE_PRESET_CATEGORIES ).map(
						( [ key, catLabel ] ) => {
							const list = SHAPE_STYLE_PRESETS.filter(
								( p ) => p.category === key
							);
							return list.length ? (
								<div key={ key } className="tsp-group">
									<div className="tsp-head">
										{ catLabel() }
									</div>
									<div className="tsp-grid">
										{ list.map( ( preset ) => (
											<button
												key={ preset.id }
												type="button"
												className="tsp-tile"
												title={ preset.label }
												onClick={ () =>
													apply( preset )
												}
											>
												<span
													className="tsp-thumb"
													style={ { background: bg } }
												>
													{ previews[ preset.id ] ? (
														<img
															src={
																previews[
																	preset.id
																]
															}
															alt=""
														/>
													) : (
														<span className="tsp-fallback" />
													) }
												</span>
												<span className="tsp-label">
													{ preset.label }
												</span>
											</button>
										) ) }
									</div>
								</div>
							) : null;
						}
					) }
				</div>
			) }
		</div>
	);
}
