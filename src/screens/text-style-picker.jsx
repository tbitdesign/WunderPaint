/**
 * Text annotation picker (v1.248, refocused v1.256.0): a popover of live
 * mini previews for the hand-drawn doodle presets (markers, circles,
 * boxes, underlines, strikes), grouped by category. Each tile renders
 * the layer's own first word with the preset applied, so the tile IS
 * the result.
 */

import { useState, useEffect } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import {
	TEXT_STYLE_PRESETS,
	TEXT_STYLE_PRESET_CATEGORIES,
	TEXT_STYLE_RESET_PRESET,
} from '../lib/text-style-presets';
import {
	renderToCanvas,
	sharedImageCache,
	measureTextWidth,
	measureTextHeight,
} from '../lib/raster';
import { useEditor, activeLayerOf } from '../store/editor-context';
import { SwatchButton } from '../components/color-popover';

/** Every doodle effect recolored to one ink (the picker's color row). */
const recolorFx = ( fx, color ) =>
	Object.fromEntries(
		Object.entries( fx ).map( ( [ key, conf ] ) => [
			key,
			conf && 'object' === typeof conf ? { ...conf, color } : conf,
		] )
	);

/** Light or dark tile so the text never vanishes against the preview. */
const tileBg = ( color ) => {
	const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(
		String( color || '' )
	);
	if ( ! m ) {
		return '#eef0f2';
	}
	const lum =
		( 0.2126 * parseInt( m[ 1 ], 16 ) +
			0.7152 * parseInt( m[ 2 ], 16 ) +
			0.0722 * parseInt( m[ 3 ], 16 ) ) /
		255;
	return lum > 0.62 ? '#2b2e33' : '#eef0f2';
};

/** The layer's first word at a fixed size, plus a decoration-safe viewport. */
function previewBase( layer ) {
	const word = (
		String( layer.text || '' )
			.trim()
			.split( /\s+/ )[ 0 ] || 'Style'
	).slice( 0, 6 );
	const size = 96;
	const pv = {
		...layer,
		parent: null,
		filter: null,
		adjust: null,
		text: word || 'Style',
		fontSize: size,
		x: 0,
		y: 0,
		align: 'left',
		valign: 'top',
		fixedWidth: false,
		letterSpacing: 0,
		curve: 0,
		textPath: null,
		spans: null,
		lineStyles: null,
		bgColor: null,
		textFX: null,
		outlineColor: null,
		outlineW: 0,
		shadowOn: false,
		styles: null,
	};
	const w = Math.max(
		12,
		measureTextWidth( { ...pv, w: size * 6, h: size * 2 } )
	);
	const h = Math.max( 12, measureTextHeight( { ...pv, w } ) );
	// Decorations (circle, box, strike overshoot) reach past the glyph
	// box AND get clipped at the document edge, so the preview layer sits
	// padded INSIDE its own tiny document instead of at 0,0 with a
	// negative viewport (v1.256.1 - the double loop swings ~1.3x the
	// size above the baseline, which fell off the doc canvas).
	const pad = Math.ceil( size * 1.4 );
	return {
		pv: { ...pv, x: pad, y: pad, w, h },
		doc: {
			id: 'tsp-prev',
			w: w + pad * 2,
			h: h + pad * 2,
			bg: 'transparent',
		},
	};
}

export function TextStylePicker() {
	const editor = useEditor();
	const { state, dispatch, commit } = editor;
	const target = activeLayerOf( state );
	// Fixed-position anchor (v1.248.1): the toolbar clips absolutely
	// positioned children, so the popover pins to viewport coordinates
	// read from the button (same pattern as the Layout popover).
	const [ anchor, setAnchor ] = useState( null );
	const open = !! anchor;
	const [ previews, setPreviews ] = useState( {} );
	const [ inkColor, setInkColor ] = useState( null );
	const isText = target && 'text' === target.type;

	useEffect( () => {
		if ( ! open || ! isText ) {
			return undefined;
		}
		let cancelled = false;
		const { pv, doc } = previewBase( target );
		const scale = Math.min( 92 / doc.w, 60 / doc.h );
		Promise.all(
			TEXT_STYLE_PRESETS.map( async ( preset ) => {
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
		target?.text,
		target?.fontFamily,
		target?.color,
		target?.weight,
	] );

	// Close on outside click or Escape while open.
	useEffect( () => {
		if ( ! open ) {
			return undefined;
		}
		const onDown = ( e ) => {
			if ( ! e.target.closest?.( '.text-style-picker' ) ) {
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

	if ( ! isText ) {
		return null;
	}

	const apply = ( preset ) => {
		const patch = preset.patch( target );
		if ( inkColor && patch.textFX ) {
			patch.textFX = recolorFx( patch.textFX, inkColor );
		}
		dispatch( {
			type: 'UPDATE_LAYER',
			id: target.id,
			patch,
		} );
		commit( __( 'Text style preset', 'wunderpaint' ) );
		setAnchor( null );
	};

	// Ink color (v1.256.1): recolors the annotation already on the layer
	// live and tints every preset applied afterwards.
	const changeInk = ( color ) => {
		setInkColor( color );
		if ( target.textFX ) {
			dispatch( {
				type: 'UPDATE_LAYER',
				id: target.id,
				patch: { textFX: recolorFx( target.textFX, color ) },
			} );
			commit( __( 'Annotation color', 'wunderpaint' ) );
		}
	};

	const bg = tileBg( target.color );

	return (
		<div className="group nb text-style-picker">
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
				{ __( 'Annotate', 'wunderpaint' ) }
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
						<span className="tsp-inklbl">
							{ __( 'Color', 'wunderpaint' ) }
						</span>
						<SwatchButton
							color={ inkColor || '#e5484d' }
							title={ __( 'Annotation color', 'wunderpaint' ) }
							onChange={ changeInk }
						/>
						{ inkColor && (
							<button
								type="button"
								className="tsp-inkreset"
								onClick={ () => setInkColor( null ) }
							>
								{ __( 'Preset colors', 'wunderpaint' ) }
							</button>
						) }
						<span style={ { flex: 1 } } />
						<button
							type="button"
							className="tsp-clear"
							onClick={ () => apply( TEXT_STYLE_RESET_PRESET ) }
						>
							{ __( 'Remove annotation', 'wunderpaint' ) }
						</button>
					</div>
					{ Object.entries( TEXT_STYLE_PRESET_CATEGORIES ).map(
						( [ key, catLabel ] ) => {
							const list = TEXT_STYLE_PRESETS.filter(
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
