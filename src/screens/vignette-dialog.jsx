/**
 * Vignette & Film dialog (v1.256.0, studio round v1.258.0): a
 * live-preview studio for the film-overlay painter - vignette (four
 * shapes), light leaks, film grain, dust, scratches, frames and a retro
 * date stamp. The result is ONE image layer with a core generator
 * descriptor (wpie-core/vignette), so it reopens here for editing and
 * re-renders itself at any document size (dynamic templates, magic
 * resize, format automation).
 *
 * UI follows the studio CI (the 3D Gallery Studio look): preset pills
 * on top, card sections, hold-to-compare, drag the vignette center
 * right in the preview.
 *
 * 19.10.2026: the preview paints at its own size (the overlay is measured
 * against the picture now), inserting encodes off the main thread, the
 * overlay can sit on the selected photo only (a clipping mask at the
 * photo's box), and the grain can be in color.
 */

import { useState, useEffect, useMemo, useRef } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { I } from '../icons';
import { useEscape } from '../components/use-escape';
import { HelpLink } from './help-dialog';
import { SwatchButton } from '../components/color-popover';
import { BlendModeSelect } from '../components/blend-select';
import { renderToCanvas, sharedImageCache } from '../lib/raster';
import {
	renderFilmOverlay,
	normalizeFilmParams,
	filmParamsFromGradient,
	FILM_PRESETS,
	FILM_GENERATOR_ID,
} from '../lib/film-overlay';
import { encodeCanvas } from '../lib/canvas-encode';
import { makeImage } from '../store/document';

export { FILM_GENERATOR_ID };

/** Layers the overlay can sit on as a clipping mask (19.10.2026). */
const PHOTO_TYPES = [ 'image', 'raster', 'smart' ];

const SHAPE_LABELS = {
	oval: () => __( 'Oval', 'wunderpaint' ),
	circle: () => __( 'Circle', 'wunderpaint' ),
	rect: () => __( 'Edges', 'wunderpaint' ),
	corners: () => __( 'Corners', 'wunderpaint' ),
	top: () => __( 'Top', 'wunderpaint' ),
	bottom: () => __( 'Bottom', 'wunderpaint' ),
	left: () => __( 'Left', 'wunderpaint' ),
	right: () => __( 'Right', 'wunderpaint' ),
	letterbox: () => __( 'Letterbox', 'wunderpaint' ),
	pillar: () => __( 'Pillars', 'wunderpaint' ),
};

const FRAME_LABELS = {
	photo: () => __( 'Instant photo', 'wunderpaint' ),
	solid: () => __( 'Solid border', 'wunderpaint' ),
	thin: () => __( 'Thin line', 'wunderpaint' ),
	double: () => __( 'Double line', 'wunderpaint' ),
	film: () => __( 'Filmstrip', 'wunderpaint' ),
	slide: () => __( 'Slide mount', 'wunderpaint' ),
	rounded: () => __( 'Rounded matte', 'wunderpaint' ),
	painted: () => __( 'Painted edge', 'wunderpaint' ),
	tape: () => __( 'Corner tape', 'wunderpaint' ),
	mounts: () => __( 'Photo corners', 'wunderpaint' ),
};

/** How many preset pills show before "Show all". */
const PRESET_PREVIEW = 6;

/** Today as the classic camera stamp ("'26 07 16"). */
const todayStamp = () => {
	const now = new Date();
	const two = ( n ) => String( n ).padStart( 2, '0' );
	return `'${ two( now.getFullYear() % 100 ) } ${ two(
		now.getMonth() + 1
	) } ${ two( now.getDate() ) }`;
};

function Row( { label, children } ) {
	return (
		/*
		 * The label WRAPS its control: `children` is a single field at
		 * every call site. The rule cannot see that statically and asks
		 * for an htmlFor pointing at something this component does not
		 * know. Checked by hand rather than configured away (v1.348.0).
		 */
		// eslint-disable-next-line jsx-a11y/label-has-associated-control
		<label className="vgn-row">
			<span className="vgn-lbl">{ label }</span>
			{ children }
		</label>
	);
}

function Slider( { label, value, min = 0, max = 100, onChange } ) {
	return (
		<Row label={ label }>
			<input
				type="range"
				min={ min }
				max={ max }
				value={ value }
				onChange={ ( e ) => onChange( +e.target.value ) }
			/>
			<span className="vgn-val">{ value }</span>
		</Row>
	);
}

function Section( { title, on, onToggle, children } ) {
	return (
		<div className={ 'vgn-sec' + ( on ? ' on' : '' ) }>
			<label className="vgn-sec-head">
				<input
					type="checkbox"
					checked={ on }
					onChange={ ( e ) => onToggle( e.target.checked ) }
				/>
				<span>{ title }</span>
			</label>
			{ on && <div className="vgn-sec-body">{ children }</div> }
		</div>
	);
}

export function VignetteDialog( { data, onClose, editor, extras } ) {
	const { state, dispatch, commit } = editor;
	const editLayer = data?.layer || null;
	// Template vignettes are plain radial GRADIENT layers: when one is
	// selected while the studio opens, adopt its look and replace the
	// layer on insert (v1.256.2).
	const [ adoptLayer ] = useState( () => {
		if ( editLayer ) {
			return null;
		}
		const active = editor.state.layers.find(
			( l ) => l.id === editor.state.activeId
		);
		return active && filmParamsFromGradient( active ) ? active : null;
	} );
	// On one picture instead of the whole document (19.10.2026): with a
	// photo selected the overlay can go right above it as a clipping mask,
	// at the photo's size, so a layout's text and logo stay untouched.
	const [ photo ] = useState( () => {
		if ( editLayer || adoptLayer ) {
			return null;
		}
		const active = editor.state.layers.find(
			( l ) => l.id === editor.state.activeId
		);
		return active &&
			PHOTO_TYPES.includes( active.type ) &&
			active.generator?.id !== FILM_GENERATOR_ID &&
			active.w > 0 &&
			active.h > 0
			? active
			: null;
	} );
	const [ target, setTarget ] = useState( 'doc' );
	const onPhoto = !! photo && 'layer' === target;
	const [ busy, setBusy ] = useState( false );
	const mounted = useRef( true );
	useEffect(
		() => () => {
			mounted.current = false;
		},
		[]
	);
	const [ params, setParams ] = useState(
		() =>
			( adoptLayer && filmParamsFromGradient( adoptLayer ) ) ||
			normalizeFilmParams( editLayer?.generator?.params )
	);
	// Layer compositing (v1.258.0): blend + opacity live on the layer.
	const sourceLayer = editLayer || adoptLayer;
	const [ blend, setBlend ] = useState( sourceLayer?.blend || 'normal' );
	const [ opacity, setOpacity ] = useState(
		Math.round( ( sourceLayer?.opacity ?? 1 ) * 100 )
	);
	const [ compare, setCompare ] = useState( false );
	const [ presetsOpen, setPresetsOpen ] = useState( false );
	useEscape( onClose );

	const patch = ( group, part ) =>
		setParams( ( p ) => ( {
			...p,
			[ group ]: { ...p[ group ], ...part },
		} ) );

	const applyPreset = ( preset ) => {
		const next = normalizeFilmParams( preset.params );
		// The stamp needs text to show anything - seed it with today.
		if ( next.stamp.on && ! next.stamp.text ) {
			next.stamp.text = todayStamp();
		}
		setParams( next );
		setBlend( preset.blend || 'normal' );
	};

	// Where the overlay sits: the photo's box, the edited layer's own box,
	// or the whole document.
	const doc = state.doc;
	const placeLayer = onPhoto ? photo : editLayer;
	const place = placeLayer
		? {
				x: placeLayer.x || 0,
				y: placeLayer.y || 0,
				w: Math.max( 1, placeLayer.w || doc.w ),
				h: Math.max( 1, placeLayer.h || doc.h ),
				rot: placeLayer.rot || 0,
		  }
		: { x: 0, y: 0, w: doc.w, h: doc.h, rot: 0 };
	const clipped = onPhoto || !! editLayer?.clip;

	// The document under and over the overlay, rendered once per placement
	// (without the layer being edited/replaced, so the preview never
	// doubles it). An overlay that is not the top of the stack - on a
	// photo, a converted template vignette, an edited layer - has layers
	// above it that it must not shade, so those are drawn after it.
	const [ base, setBase ] = useState( null );
	useEffect( () => {
		let cancelled = false;
		const hidden = editLayer || adoptLayer;
		const layers = state.layers;
		const anchor = onPhoto ? photo : hidden;
		const at = anchor ? layers.indexOf( anchor ) : -1;
		const split = at >= 0 && ! anchor.parent;
		const keep = ( l ) => ! hidden || l.id !== hidden.id;
		const below = split
			? layers.slice( 0, onPhoto ? at + 1 : at ).filter( keep )
			: layers.filter( keep );
		const above = split ? layers.slice( at + 1 ).filter( keep ) : [];
		Promise.all( [
			renderToCanvas( doc, below, { cache: sharedImageCache } ),
			above.length
				? renderToCanvas( { ...doc, bg: 'transparent' }, above, {
						cache: sharedImageCache,
				  } )
				: null,
		] )
			.then(
				( [ under, over ] ) => ! cancelled && setBase( { under, over } )
			)
			.catch( () => ! cancelled && setBase( null ) );
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ onPhoto ] );

	// WYSIWYG at preview size (19.10.2026): grain, dust and scratches are
	// measured against the picture now, so the overlay painted at the size
	// it has in the preview shows what the inserted one carries. It used to
	// be painted at full document size for every slider step - at twelve
	// megapixels a quarter of a second each. The layer blend mode is
	// honored via the composite operation.
	const previewRef = useRef( null );
	useEffect( () => {
		const el = previewRef.current;
		if ( ! el ) {
			return;
		}
		const raf = requestAnimationFrame( () => {
			const ctx = el.getContext( '2d' );
			ctx.clearRect( 0, 0, el.width, el.height );
			if ( base?.under ) {
				ctx.drawImage( base.under, 0, 0, el.width, el.height );
			}
			if ( ! compare ) {
				const scale = el.width / doc.w;
				const ow = Math.max( 1, Math.round( place.w * scale ) );
				const oh = Math.max( 1, Math.round( place.h * scale ) );
				const overlay = renderFilmOverlay( params, ow, oh );
				ctx.save();
				ctx.globalAlpha = Math.max( 0, Math.min( 1, opacity / 100 ) );
				ctx.globalCompositeOperation =
					'normal' === blend ? 'source-over' : blend;
				ctx.translate(
					( place.x + place.w / 2 ) * scale,
					( place.y + place.h / 2 ) * scale
				);
				ctx.rotate( ( place.rot * Math.PI ) / 180 );
				if ( clipped ) {
					ctx.beginPath();
					ctx.rect( -ow / 2, -oh / 2, ow, oh );
					ctx.clip();
				}
				ctx.drawImage( overlay, -ow / 2, -oh / 2, ow, oh );
				ctx.restore();
			}
			if ( base?.over ) {
				ctx.drawImage( base.over, 0, 0, el.width, el.height );
			}
		} );
		return () => cancelAnimationFrame( raf );
	}, [
		params,
		base,
		doc.w,
		doc.h,
		blend,
		opacity,
		compare,
		place.x,
		place.y,
		place.w,
		place.h,
		place.rot,
		clipped,
	] );

	const previewDims = useMemo( () => {
		const scale = Math.min( 560 / doc.w, 620 / doc.h, 1 );
		return {
			w: Math.max( 1, Math.round( doc.w * scale ) ),
			h: Math.max( 1, Math.round( doc.h * scale ) ),
		};
	}, [ doc.w, doc.h ] );

	// Size and softness on the wheel (v1.371), because they are the two
	// numbers you judge by eye and the sliders sit far from the picture.
	// The vignette is baked into an image layer by a generator, so it
	// cannot have grips on the canvas itself the way a shape does - this
	// preview IS the place where it can be dialled by hand.
	const wheelSize = ( e ) => {
		if ( ! params.vignette.on ) {
			return;
		}
		e.preventDefault();
		const step = e.deltaY > 0 ? -3 : 3;
		if ( e.shiftKey ) {
			patch( 'vignette', {
				feather: Math.max(
					0,
					Math.min( 100, ( params.vignette.feather ?? 50 ) + step )
				),
			} );
			return;
		}
		patch( 'vignette', {
			size: Math.max(
				0,
				Math.min( 100, ( params.vignette.size ?? 50 ) + step )
			),
		} );
	};

	// Drag the vignette center right in the preview (oval only).
	const dragging = useRef( false );
	const canDrag =
		params.vignette.on &&
		( 'oval' === params.vignette.shape ||
			'circle' === params.vignette.shape );
	const centerFromEvent = ( e ) => {
		const rect = previewRef.current.getBoundingClientRect();
		// Into the overlay's own box (the photo's, when it sits on one),
		// turned back by its rotation.
		const dx =
			( ( e.clientX - rect.left ) / rect.width ) * doc.w -
			( place.x + place.w / 2 );
		const dy =
			( ( e.clientY - rect.top ) / rect.height ) * doc.h -
			( place.y + place.h / 2 );
		const a = ( -place.rot * Math.PI ) / 180;
		const lx = dx * Math.cos( a ) - dy * Math.sin( a );
		const ly = dx * Math.sin( a ) + dy * Math.cos( a );
		const pct = ( v, size ) =>
			Math.round(
				Math.max( 0, Math.min( 100, ( v / size + 0.5 ) * 100 ) )
			);
		patch( 'vignette', {
			cx: pct( lx, place.w ),
			cy: pct( ly, place.h ),
		} );
	};

	// Painting and encoding a full-size overlay took a second and more on a
	// large document, all on the main thread; the button now says so first
	// and the PNG is encoded off the main thread (19.10.2026).
	const insert = async () => {
		if ( busy ) {
			return;
		}
		setBusy( true );
		await new Promise( ( resolve ) =>
			requestAnimationFrame( () => setTimeout( resolve, 0 ) )
		);
		try {
			const ow = Math.max( 1, Math.round( place.w ) );
			const oh = Math.max( 1, Math.round( place.h ) );
			const src = await encodeCanvas(
				renderFilmOverlay( params, ow, oh ),
				'image/png'
			);
			if ( ! mounted.current ) {
				return;
			}
			finish( src, ow, oh );
			onClose();
		} catch ( e ) {
			extras?.toasts?.error?.(
				__( 'The overlay could not be created.', 'wunderpaint' )
			);
		} finally {
			if ( mounted.current ) {
				setBusy( false );
			}
		}
	};

	const finish = ( src, ow, oh ) => {
		const compositing = {
			blend,
			opacity: Math.max( 0, Math.min( 1, opacity / 100 ) ),
		};
		if ( editLayer ) {
			// An edited overlay keeps its own box: the document for a full
			// one, the photo's for one that sits on a picture.
			dispatch( {
				type: 'UPDATE_LAYER',
				id: editLayer.id,
				patch: {
					src,
					naturalW: ow,
					naturalH: oh,
					generator: { id: FILM_GENERATOR_ID, params },
					...compositing,
				},
			} );
			commit( __( 'Edit Vignette & Film', 'wunderpaint' ) );
			return;
		}
		const layer = makeImage( {
			name: adoptLayer?.name || __( 'Vignette & Film', 'wunderpaint' ),
			x: place.x,
			y: place.y,
			w: place.w,
			h: place.h,
			src,
			naturalW: ow,
			naturalH: oh,
			imageFit: { mode: 'fill' },
		} );
		// Set AFTER the factory - makeImage only keeps its known
		// fields, a generator in the options would be dropped (the
		// extension bridges assign it the same way).
		layer.generator = { id: FILM_GENERATOR_ID, params };
		layer.blend = compositing.blend;
		layer.opacity = compositing.opacity;
		if ( onPhoto ) {
			// Right above the photo, clipped to it.
			layer.rot = place.rot;
			layer.clip = true;
			layer.parent = photo.parent || null;
			dispatch( {
				type: 'ADD_LAYER',
				layer,
				index: state.layers.indexOf( photo ) + 1,
			} );
			commit( __( 'Add Vignette & Film', 'wunderpaint' ) );
		} else if ( adoptLayer ) {
			// Convert in place: the gradient vignette makes way for
			// the studio layer at the same stack position.
			const index = state.layers.findIndex(
				( l ) => l.id === adoptLayer.id
			);
			layer.parent = adoptLayer.parent || null;
			dispatch( {
				type: 'REMOVE_LAYERS',
				ids: [ adoptLayer.id ],
			} );
			dispatch( { type: 'ADD_LAYER', layer, index } );
			commit( __( 'Convert vignette layer', 'wunderpaint' ) );
		} else {
			dispatch( { type: 'ADD_LAYER', layer } );
			commit( __( 'Add Vignette & Film', 'wunderpaint' ) );
		}
	};

	const v = params.vignette;
	return (
		<div className="modal-backdrop" onClick={ onClose } role="presentation">
			<div
				className="stock-dialog vgn-dialog"
				style={ {
					width: 'min(980px, 96vw)',
					// Fixed height: toggling sections scrolls the control
					// column instead of resizing the whole dialog.
					height: 'min(800px, 92vh)',
					gridTemplateRows: 'auto 1fr auto',
				} }
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-modal="true"
				aria-label={ __( 'Vignette & Film', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<div className="dsm-title-row">
							<span className="dsm-title">
								{ __( 'Vignette & Film', 'wunderpaint' ) }
							</span>
							<HelpLink article="filters" extras={ extras } />
						</div>
						<div className="dsm-sub">
							{ __(
								'Vignette, light leaks, grain, dust, scratches, frames and a date stamp - one re-editable overlay layer.',
								'wunderpaint'
							) }
						</div>
					</div>
					<button
						className="dsm-close"
						onClick={ onClose }
						aria-label={ __( 'Close', 'wunderpaint' ) }
					>
						{ I.close( { size: 17 } ) }
					</button>
				</div>

				<div className="vgn-body">
					<div className="vgn-preview">
						<canvas
							ref={ previewRef }
							width={ previewDims.w }
							height={ previewDims.h }
							style={
								canDrag ? { cursor: 'crosshair' } : undefined
							}
							onPointerDown={ ( e ) => {
								if ( ! canDrag ) {
									return;
								}
								dragging.current = true;
								e.currentTarget.setPointerCapture(
									e.pointerId
								);
								centerFromEvent( e );
							} }
							onPointerMove={ ( e ) => {
								if ( dragging.current && canDrag ) {
									centerFromEvent( e );
								}
							} }
							onPointerUp={ () => {
								dragging.current = false;
							} }
							onWheel={ wheelSize }
						/>
						<button
							type="button"
							className="vgn-compare"
							onPointerDown={ () => setCompare( true ) }
							onPointerUp={ () => setCompare( false ) }
							onPointerLeave={ () => setCompare( false ) }
						>
							{ I.eye ? I.eye( { size: 13 } ) : null }{ ' ' }
							{ __( 'Compare', 'wunderpaint' ) }
						</button>
						{ params.vignette.on && (
							<span className="vgn-hint">
								{ canDrag
									? __(
											'Drag in the preview to move the center · wheel to resize · Shift + wheel to soften',
											'wunderpaint'
									  )
									: __(
											'Wheel over the preview to resize · Shift + wheel to soften',
											'wunderpaint'
									  ) }
							</span>
						) }
					</div>
					<div className="vgn-controls">
						{ /* Presets card, the Gallery Studio pattern: a
						     preview row of pills plus "Show all". */ }
						<div className="vgn-sec on">
							<div className="vgn-sec-head vgn-sec-plain">
								{ __( 'Presets', 'wunderpaint' ) }
							</div>
							<div className="vgn-sec-body">
								<div className="vgn-presets">
									{ ( presetsOpen
										? FILM_PRESETS
										: FILM_PRESETS.slice(
												0,
												PRESET_PREVIEW
										  )
									).map( ( preset ) => (
										<button
											key={ preset.id }
											type="button"
											className="vgn-chip"
											onClick={ () =>
												applyPreset( preset )
											}
										>
											{ preset.label }
										</button>
									) ) }
								</div>
								{ FILM_PRESETS.length > PRESET_PREVIEW && (
									<button
										type="button"
										className="vgn-more"
										onClick={ () =>
											setPresetsOpen( ( open ) => ! open )
										}
									>
										<span className="chev">
											{ presetsOpen ? '▴' : '▾' }
										</span>
										{ presetsOpen
											? __(
													'Show fewer presets',
													'wunderpaint'
											  )
											: sprintf(
													/* translators: %d: number of presets. */
													__(
														'Show all %d presets',
														'wunderpaint'
													),
													FILM_PRESETS.length
											  ) }
									</button>
								) }
							</div>
						</div>

						{ photo && (
							<Row label={ __( 'Apply to', 'wunderpaint' ) }>
								<select
									className="dsm-select sm"
									value={ target }
									onChange={ ( e ) =>
										setTarget( e.target.value )
									}
								>
									<option value="doc">
										{ __(
											'Whole document',
											'wunderpaint'
										) }
									</option>
									<option value="layer">
										{ sprintf(
											/* translators: %s: layer name. */
											__( 'Only on %s', 'wunderpaint' ),
											photo.name ||
												__( 'Image', 'wunderpaint' )
										) }
									</option>
								</select>
							</Row>
						) }

						<div className="vgn-row vgn-blendrow">
							<span className="vgn-lbl">
								{ __( 'Blend', 'wunderpaint' ) }
							</span>
							<BlendModeSelect
								value={ blend }
								width={ 110 }
								onPreview={ setBlend }
								onCommit={ setBlend }
							/>
							<input
								type="range"
								min="10"
								max="100"
								value={ opacity }
								aria-label={ __( 'Opacity', 'wunderpaint' ) }
								onChange={ ( e ) =>
									setOpacity( +e.target.value )
								}
							/>
							<span className="vgn-val">{ opacity }</span>
						</div>

						<Section
							title={ __( 'Vignette', 'wunderpaint' ) }
							on={ v.on }
							onToggle={ ( on ) => patch( 'vignette', { on } ) }
						>
							<Row label={ __( 'Shape', 'wunderpaint' ) }>
								<select
									className="dsm-select sm"
									value={ v.shape }
									onChange={ ( e ) =>
										patch( 'vignette', {
											shape: e.target.value,
										} )
									}
								>
									{ Object.entries( SHAPE_LABELS ).map(
										( [ id, label ] ) => (
											<option key={ id } value={ id }>
												{ label() }
											</option>
										)
									) }
								</select>
								<SwatchButton
									color={ v.color }
									title={ __( 'Color', 'wunderpaint' ) }
									onChange={ ( color ) =>
										patch( 'vignette', { color } )
									}
								/>
							</Row>
							<Slider
								label={ __( 'Strength', 'wunderpaint' ) }
								value={ v.strength }
								onChange={ ( strength ) =>
									patch( 'vignette', { strength } )
								}
							/>
							<Slider
								label={ __( 'Size', 'wunderpaint' ) }
								value={ v.size }
								onChange={ ( size ) =>
									patch( 'vignette', { size } )
								}
							/>
							{ ( 'oval' === v.shape ||
								'circle' === v.shape ) && (
								<>
									<Slider
										label={ __( 'Feather', 'wunderpaint' ) }
										value={ v.feather }
										onChange={ ( feather ) =>
											patch( 'vignette', { feather } )
										}
									/>
									<Slider
										label={ __(
											'Center X',
											'wunderpaint'
										) }
										value={ v.cx }
										onChange={ ( cx ) =>
											patch( 'vignette', { cx } )
										}
									/>
									<Slider
										label={ __(
											'Center Y',
											'wunderpaint'
										) }
										value={ v.cy }
										onChange={ ( cy ) =>
											patch( 'vignette', { cy } )
										}
									/>
								</>
							) }
						</Section>

						<Section
							title={ __( 'Light leaks', 'wunderpaint' ) }
							on={ params.leaks.on }
							onToggle={ ( on ) => patch( 'leaks', { on } ) }
						>
							<Row label={ __( 'Color', 'wunderpaint' ) }>
								<SwatchButton
									color={ params.leaks.color }
									title={ __( 'Color', 'wunderpaint' ) }
									onChange={ ( color ) =>
										patch( 'leaks', { color } )
									}
								/>
							</Row>
							<Slider
								label={ __( 'Strength', 'wunderpaint' ) }
								value={ params.leaks.strength }
								onChange={ ( strength ) =>
									patch( 'leaks', { strength } )
								}
							/>
							<Slider
								label={ __( 'Size', 'wunderpaint' ) }
								value={ params.leaks.size }
								onChange={ ( size ) =>
									patch( 'leaks', { size } )
								}
							/>
							<Slider
								label={ __( 'Count', 'wunderpaint' ) }
								value={ params.leaks.count }
								min={ 1 }
								max={ 3 }
								onChange={ ( count ) =>
									patch( 'leaks', { count } )
								}
							/>
							<Slider
								label={ __( 'Variant', 'wunderpaint' ) }
								value={ params.leaks.seed }
								min={ 1 }
								max={ 99 }
								onChange={ ( seed ) =>
									patch( 'leaks', { seed } )
								}
							/>
						</Section>

						<Section
							title={ __( 'Film grain', 'wunderpaint' ) }
							on={ params.grain.on }
							onToggle={ ( on ) => patch( 'grain', { on } ) }
						>
							<Slider
								label={ __( 'Amount', 'wunderpaint' ) }
								value={ params.grain.amount }
								onChange={ ( amount ) =>
									patch( 'grain', { amount } )
								}
							/>
							<Slider
								label={ __( 'Grain size', 'wunderpaint' ) }
								value={ params.grain.size }
								min={ 1 }
								max={ 6 }
								onChange={ ( size ) =>
									patch( 'grain', { size } )
								}
							/>
							<Row label={ __( 'Tone', 'wunderpaint' ) }>
								<select
									className="dsm-select sm"
									value={
										params.grain.color ? 'color' : 'mono'
									}
									onChange={ ( e ) =>
										patch( 'grain', {
											color: 'color' === e.target.value,
										} )
									}
								>
									<option value="mono">
										{ __(
											'Black and white',
											'wunderpaint'
										) }
									</option>
									<option value="color">
										{ __( 'Color', 'wunderpaint' ) }
									</option>
								</select>
							</Row>
							<Slider
								label={ __( 'Variant', 'wunderpaint' ) }
								value={ params.grain.seed }
								min={ 1 }
								max={ 99 }
								onChange={ ( seed ) =>
									patch( 'grain', { seed } )
								}
							/>
						</Section>

						<Section
							title={ __( 'Dust', 'wunderpaint' ) }
							on={ params.dust.on }
							onToggle={ ( on ) => patch( 'dust', { on } ) }
						>
							<Slider
								label={ __( 'Density', 'wunderpaint' ) }
								value={ params.dust.density }
								onChange={ ( density ) =>
									patch( 'dust', { density } )
								}
							/>
							<Slider
								label={ __( 'Size', 'wunderpaint' ) }
								value={ params.dust.size }
								onChange={ ( size ) =>
									patch( 'dust', { size } )
								}
							/>
							<Row label={ __( 'Tone', 'wunderpaint' ) }>
								<select
									className="dsm-select sm"
									value={
										params.dust.light ? 'light' : 'dark'
									}
									onChange={ ( e ) =>
										patch( 'dust', {
											light: 'light' === e.target.value,
										} )
									}
								>
									<option value="light">
										{ __( 'Light', 'wunderpaint' ) }
									</option>
									<option value="dark">
										{ __( 'Dark', 'wunderpaint' ) }
									</option>
								</select>
							</Row>
							<Slider
								label={ __( 'Variant', 'wunderpaint' ) }
								value={ params.dust.seed }
								min={ 1 }
								max={ 99 }
								onChange={ ( seed ) =>
									patch( 'dust', { seed } )
								}
							/>
						</Section>

						<Section
							title={ __( 'Scratches', 'wunderpaint' ) }
							on={ params.scratches.on }
							onToggle={ ( on ) => patch( 'scratches', { on } ) }
						>
							<Slider
								label={ __( 'Count', 'wunderpaint' ) }
								value={ params.scratches.count }
								min={ 1 }
								max={ 40 }
								onChange={ ( count ) =>
									patch( 'scratches', { count } )
								}
							/>
							<Slider
								label={ __( 'Strength', 'wunderpaint' ) }
								value={ params.scratches.strength }
								onChange={ ( strength ) =>
									patch( 'scratches', { strength } )
								}
							/>
							<Row label={ __( 'Tone', 'wunderpaint' ) }>
								<select
									className="dsm-select sm"
									value={
										params.scratches.light
											? 'light'
											: 'dark'
									}
									onChange={ ( e ) =>
										patch( 'scratches', {
											light: 'light' === e.target.value,
										} )
									}
								>
									<option value="light">
										{ __( 'Light', 'wunderpaint' ) }
									</option>
									<option value="dark">
										{ __( 'Dark', 'wunderpaint' ) }
									</option>
								</select>
							</Row>
							<Slider
								label={ __( 'Variant', 'wunderpaint' ) }
								value={ params.scratches.seed }
								min={ 1 }
								max={ 99 }
								onChange={ ( seed ) =>
									patch( 'scratches', { seed } )
								}
							/>
						</Section>

						<Section
							title={ __( 'Frame', 'wunderpaint' ) }
							on={ params.frame.on }
							onToggle={ ( on ) => patch( 'frame', { on } ) }
						>
							<Row label={ __( 'Style', 'wunderpaint' ) }>
								<select
									className="dsm-select sm"
									value={ params.frame.style }
									onChange={ ( e ) =>
										patch( 'frame', {
											style: e.target.value,
										} )
									}
								>
									{ Object.entries( FRAME_LABELS ).map(
										( [ id, label ] ) => (
											<option key={ id } value={ id }>
												{ label() }
											</option>
										)
									) }
								</select>
								<SwatchButton
									color={ params.frame.color }
									title={ __( 'Color', 'wunderpaint' ) }
									onChange={ ( color ) =>
										patch( 'frame', { color } )
									}
								/>
							</Row>
							<Slider
								label={ __( 'Size', 'wunderpaint' ) }
								value={ params.frame.size }
								min={ 1 }
								max={ 20 }
								onChange={ ( size ) =>
									patch( 'frame', { size } )
								}
							/>
							{ 'rounded' === params.frame.style && (
								<Slider
									label={ __( 'Radius', 'wunderpaint' ) }
									value={ params.frame.radius }
									min={ 1 }
									max={ 30 }
									onChange={ ( radius ) =>
										patch( 'frame', { radius } )
									}
								/>
							) }
							{ ( 'painted' === params.frame.style ||
								'tape' === params.frame.style ) && (
								<Slider
									label={ __( 'Variant', 'wunderpaint' ) }
									value={ params.frame.seed }
									min={ 1 }
									max={ 99 }
									onChange={ ( seed ) =>
										patch( 'frame', { seed } )
									}
								/>
							) }
						</Section>

						<Section
							title={ __( 'Date stamp', 'wunderpaint' ) }
							on={ params.stamp.on }
							onToggle={ ( on ) =>
								patch( 'stamp', {
									on,
									...( on && ! params.stamp.text
										? { text: todayStamp() }
										: {} ),
								} )
							}
						>
							<Row label={ __( 'Text', 'wunderpaint' ) }>
								<input
									type="text"
									className="vgn-text"
									value={ params.stamp.text }
									maxLength={ 14 }
									onChange={ ( e ) =>
										patch( 'stamp', {
											text: e.target.value,
										} )
									}
								/>
								<SwatchButton
									color={ params.stamp.color }
									title={ __( 'Color', 'wunderpaint' ) }
									onChange={ ( color ) =>
										patch( 'stamp', { color } )
									}
								/>
							</Row>
							<Slider
								label={ __( 'Size', 'wunderpaint' ) }
								value={ params.stamp.size }
								min={ 2 }
								max={ 10 }
								onChange={ ( size ) =>
									patch( 'stamp', { size } )
								}
							/>
							<Row label={ __( 'Corner', 'wunderpaint' ) }>
								<select
									className="dsm-select sm"
									value={ params.stamp.corner }
									onChange={ ( e ) =>
										patch( 'stamp', {
											corner: e.target.value,
										} )
									}
								>
									<option value="br">
										{ __( 'Bottom right', 'wunderpaint' ) }
									</option>
									<option value="bl">
										{ __( 'Bottom left', 'wunderpaint' ) }
									</option>
									<option value="tr">
										{ __( 'Top right', 'wunderpaint' ) }
									</option>
									<option value="tl">
										{ __( 'Top left', 'wunderpaint' ) }
									</option>
								</select>
							</Row>
						</Section>
					</div>
				</div>

				<div className="dsm-foot">
					<button className="ai-btn secondary" onClick={ onClose }>
						{ __( 'Cancel', 'wunderpaint' ) }
					</button>
					<span style={ { flex: 1 } } />
					<button
						className="ai-btn primary"
						disabled={ busy }
						onClick={ insert }
					>
						{ busy && __( 'Rendering…', 'wunderpaint' ) }
						{ ! busy &&
							editLayer &&
							__( 'Update layer', 'wunderpaint' ) }
						{ ! busy &&
							! editLayer &&
							( adoptLayer
								? __( 'Replace layer', 'wunderpaint' )
								: __( 'Add as layer', 'wunderpaint' ) ) }
					</button>
				</div>
			</div>
		</div>
	);
}
