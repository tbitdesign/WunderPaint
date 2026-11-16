/**
 * Screenshot Beautifier (v1.106.0, extended in v1.433.0): wraps the
 * active image layer in a rounded card with shadow, optional browser /
 * window / app window / phone / tablet chrome, a glass rim or generative
 * deco frames, lays it out (centered, rising from the bottom edge,
 * running into a corner, tilted), grows the canvas (padding + aspect
 * presets) and drops a backdrop behind it: a Background-Studio style or
 * look, a blurred copy of the shot, a solid color or nothing. Everything lands as
 * editable layers in a "Screenshot" group; the backdrop keeps its
 * params, so Edit Background still works on it.
 */

import { useEffect, useRef, useState } from '@wordpress/element';
import { __, _x, sprintf } from '@wordpress/i18n';

import { I } from '../icons';
import { useEditor } from '../store/editor-context';
import { useEscape } from '../components/use-escape';
import { HelpLink } from './help-dialog';
import { SwatchButton } from '../components/color-popover';
import {
	createBlankDoc,
	makeGroup,
	makeImage,
	makeShape,
	makeText,
} from '../store/document';
import {
	BEAUTIFY_DEFAULTS,
	BEAUTIFY_GENERATOR_ID,
	beautifySpec,
	placeBeautify,
} from '../lib/beautify';
import {
	BG_DEFAULTS,
	encodeBackground,
	renderBackground,
	soft,
} from '../lib/backgrounds';
import { encodeCanvas } from '../lib/canvas-encode';
import { BACKGROUND_LOOKS, lookParams } from '../lib/background-looks';
import { buildScheme, randomSchemeInput } from '../lib/color-scheme';
import { renderToCanvas, sharedImageCache } from '../lib/raster';

const SOURCE_TYPES = [ 'image', 'raster', 'smart' ];

function Slider( { label, value, min, max, onChange } ) {
	return (
		<div className="dsm-sliderrow">
			<div className="dsm-sliderrow-head">
				<span data-number-label>{ label }</span>
				<span className="dsm-sliderrow-val" data-number-value>
					{ value }
				</span>
			</div>
			<input
				type="range"
				className="dsm-range"
				min={ min }
				max={ max }
				value={ value }
				aria-label={ label }
				onChange={ ( e ) => onChange( +e.target.value ) }
			/>
		</div>
	);
}

function Seg( { options, value, onChange } ) {
	return (
		<div className="seg-row" style={ { display: 'flex' } }>
			{ options.map( ( [ key, label ] ) => (
				<button
					key={ key }
					className={ value === key ? 'active' : '' }
					onClick={ () => onChange( key ) }
				>
					{ label }
				</button>
			) ) }
		</div>
	);
}

function ColorsFrom( { onApply } ) {
	const kits = ( window.WPIE?.brandKits || [] ).filter(
		( k ) => k?.name && ( k.colors || [] ).length > 1
	);
	const sets = ( window.WPIE?.palettes || [] ).filter(
		( p ) => ( p.colors || [] ).length > 1
	);
	if ( ! kits.length && ! sets.length ) {
		return null;
	}
	return (
		<select
			className="dsm-select"
			value=""
			onChange={ ( e ) => {
				const [ kind, id ] = e.target.value.split( ':' );
				const source =
					'kit' === kind
						? kits.find( ( k ) => k.id === id )
						: sets.find( ( s ) => s.id === id );
				if ( source?.colors?.length > 1 ) {
					onApply( source.colors.slice( 0, 5 ) );
				}
			} }
		>
			<option value="">{ __( 'Colors from…', 'wunderpaint' ) }</option>
			{ kits.map( ( k ) => (
				<option key={ k.id } value={ 'kit:' + k.id }>
					{ __( 'Brand Kit', 'wunderpaint' ) + ': ' + k.name }
				</option>
			) ) }
			{ sets.map( ( s ) => (
				<option key={ s.id } value={ 'set:' + s.id }>
					{ __( 'Swatch set', 'wunderpaint' ) + ': ' + s.name }
				</option>
			) ) }
		</select>
	);
}

/** Backdrop looks that sit calmly behind a screenshot. */
const CALM_LOOKS = [
	'pastel',
	'golden',
	'northern',
	'city',
	'sunset',
	'spotlight',
	'candy',
];

function makeCanvas( w, h ) {
	const c = document.createElement( 'canvas' );
	c.width = Math.max( 1, Math.round( w ) );
	c.height = Math.max( 1, Math.round( h ) );
	return c;
}

/**
 * Average color of a canvas. Halved step by step to a few pixels and then
 * averaged: one big draw down to a single pixel only samples a handful of
 * pixels around the middle, and a bright spot there reads as a light
 * picture.
 *
 * @param {HTMLCanvasElement} source Picture.
 * @return {Object} { r, g, b }, white for a see-through picture.
 */
function averageRgb( source ) {
	let cur = source;
	while ( cur.width > 16 || cur.height > 16 ) {
		const next = makeCanvas(
			Math.ceil( cur.width / 2 ),
			Math.ceil( cur.height / 2 )
		);
		next.getContext( '2d' ).drawImage( cur, 0, 0, next.width, next.height );
		cur = next;
	}
	const data = cur
		.getContext( '2d' )
		.getImageData( 0, 0, cur.width, cur.height ).data;
	let r = 0;
	let g = 0;
	let b = 0;
	let a = 0;
	for ( let i = 0; i < data.length; i += 4 ) {
		const w = data[ i + 3 ];
		r += data[ i ] * w;
		g += data[ i + 1 ] * w;
		b += data[ i + 2 ] * w;
		a += w;
	}
	return a ? { r: r / a, g: g / a, b: b / a } : { r: 255, g: 255, b: 255 };
}

/**
 * A blurred, dimmed copy of the shot covering the whole canvas; see
 * through areas of the shot fill with its average color first.
 *
 * @param {HTMLCanvasElement} pic  Small render of the shot.
 * @param {number}            w    Width.
 * @param {number}            h    Height.
 * @param {Object}            blur { amount, dim } 0-100.
 * @return {HTMLCanvasElement} The backdrop.
 */
function blurBackdrop( pic, w, h, blur ) {
	const out = makeCanvas( w, h );
	const ctx = out.getContext( '2d' );
	const avg = averageRgb( pic );
	const base = `rgb(${ avg.r },${ avg.g },${ avg.b })`;
	ctx.fillStyle = base;
	ctx.fillRect( 0, 0, out.width, out.height );
	const factor = 1 / ( 10 + ( ( blur.amount ?? 60 ) / 100 ) * 50 );
	soft( ctx, out.width, out.height, factor, ( sctx ) => {
		sctx.fillStyle = base;
		sctx.fillRect( 0, 0, out.width, out.height );
		const k =
			Math.max( out.width / pic.width, out.height / pic.height ) * 1.08;
		sctx.drawImage(
			pic,
			( out.width - pic.width * k ) / 2,
			( out.height - pic.height * k ) / 2,
			pic.width * k,
			pic.height * k
		);
	} );
	const dim = ( blur.dim ?? 25 ) / 100;
	if ( dim > 0 ) {
		ctx.fillStyle = `rgba(0,0,0,${ dim * 0.7 })`;
		ctx.fillRect( 0, 0, out.width, out.height );
	}
	return out;
}

/** Spec object -> real layer. */
function specToLayer( spec ) {
	const { kind, clipped, styles, rot, ...props } = spec;
	const layer = 'text' === kind ? makeText( props ) : makeShape( props );
	if ( clipped ) {
		layer.clipped = true;
	}
	if ( styles ) {
		layer.styles = styles;
	}
	if ( rot ) {
		layer.rot = rot;
	}
	return layer;
}

export function BeautifyDialog( { onClose, extras, layerId = null } ) {
	useEscape( onClose );
	const editor = useEditor();
	const { state, dispatch, commit } = editor;

	// Edit (20.10.2026): a framed screenshot keeps its recipe on its group;
	// the shot inside it, at the size it was framed at, is the source again.
	const editGroup = layerId
		? state.layers.find(
				( l ) =>
					l.id === layerId &&
					l.generator?.id === BEAUTIFY_GENERATOR_ID
		  ) || null
		: null;
	const recipe = editGroup?.generator?.params || null;
	const editShot = editGroup
		? state.layers.find(
				( l ) => l.parent === editGroup.id && l.beautifyShot
		  ) || null
		: null;
	// A backdrop changed with Edit Background since is the one to keep.
	const editBackdrop = editGroup
		? state.layers.find( ( l ) => l.beautifyOf === editGroup.id && l.bg ) ||
		  null
		: null;

	// Source: the active image-ish layer, else the bottom-most one; or
	// the WHOLE document flattened (v1.107, user request).
	const candidates = state.layers.filter(
		( l ) => SOURCE_TYPES.includes( l.type ) && l.visible !== false
	);
	const active = state.layers.find( ( l ) => l.id === state.activeId );
	let source =
		active && SOURCE_TYPES.includes( active.type )
			? active
			: candidates[ 0 ] || null;
	if ( editShot ) {
		source = {
			...editShot,
			w: recipe?.shot?.w || editShot.w,
			h: recipe?.shot?.h || editShot.h,
			rot: 0,
			clipped: false,
			parent: null,
		};
	}
	const [ sourceMode, setSourceMode ] = useState( () =>
		source ? 'layer' : 'doc'
	);
	// Flattened document as a data URL, rendered once (the document does
	// not change while the dialog is open).
	const [ docShot, setDocShot ] = useState( null ); // {src, naturalW, naturalH}
	useEffect( () => {
		if ( 'doc' !== sourceMode || docShot || ! state.layers.length ) {
			return;
		}
		let live = true;
		const scale = Math.min(
			1,
			2000 / Math.max( state.doc.w, state.doc.h )
		);
		renderToCanvas( state.doc, state.layers, {
			scale,
			cache: sharedImageCache,
		} )
			.then( ( canvas ) => {
				if ( live ) {
					setDocShot( {
						src: canvas.toDataURL( 'image/png' ),
						naturalW: canvas.width,
						naturalH: canvas.height,
						canvas,
					} );
				}
			} )
			.catch( () => {} );
		return () => {
			live = false;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ sourceMode ] );

	// A small render of the shot, for the blurred backdrop and its tone.
	const [ pic, setPic ] = useState( null );
	useEffect( () => {
		let live = true;
		const small = ( canvas ) => {
			const k = Math.min(
				1,
				480 / Math.max( canvas.width, canvas.height )
			);
			const c = makeCanvas( canvas.width * k, canvas.height * k );
			c.getContext( '2d' ).drawImage( canvas, 0, 0, c.width, c.height );
			return c;
		};
		if ( 'doc' === sourceMode ) {
			setPic( docShot?.canvas ? small( docShot.canvas ) : null );
		} else if ( source ) {
			renderToCanvas(
				{
					...state.doc,
					w: source.w,
					h: source.h,
					bg: 'transparent',
				},
				[
					{
						...source,
						x: 0,
						y: 0,
						rot: 0,
						parent: null,
						clipped: false,
						visible: true,
					},
				],
				{
					scale: Math.min(
						1,
						480 / Math.max( source.w || 1, source.h || 1 )
					),
					cache: sharedImageCache,
				}
			)
				.then( ( canvas ) => live && setPic( canvas ) )
				.catch( () => {} );
		}
		return () => {
			live = false;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ sourceMode, docShot ] );

	const shotSize =
		'doc' === sourceMode
			? { w: state.doc.w, h: state.doc.h }
			: { w: source?.w || 0, h: source?.h || 0 };
	const sourceReady = 'doc' === sourceMode ? !! docShot : !! source;

	const kitColors = ( window.WPIE?.brand?.colors || [] ).slice( 0, 2 );
	const [ params, setParams ] = useState( () =>
		recipe?.params
			? { ...BEAUTIFY_DEFAULTS, ...recipe.params }
			: {
					...BEAUTIFY_DEFAULTS,
					colors:
						kitColors.length > 1
							? kitColors
							: BEAUTIFY_DEFAULTS.colors,
			  }
	);
	// studio|blur|solid|none
	const [ bgMode, setBgMode ] = useState( recipe?.bgMode || 'studio' );
	const [ blur, setBlur ] = useState(
		recipe?.blur || { amount: 60, dim: 25 }
	);
	const [ bgParams, setBgParams ] = useState( () => {
		const kept = editBackdrop?.bg || recipe?.bgParams;
		if ( kept ) {
			return { ...BG_DEFAULTS, ...kept };
		}
		return {
			...BG_DEFAULTS,
			style: 'mesh',
			colors:
				( window.WPIE?.brand?.colors || [] ).length > 1
					? window.WPIE.brand.colors.slice( 0, 4 )
					: BG_DEFAULTS.colors,
			seed: 1 + Math.floor( Math.random() * 1e9 ),
		};
	} );
	const [ solidColor, setSolidColor ] = useState(
		recipe?.solidColor || '#e9ebf0'
	);
	const [ preview, setPreview ] = useState( null );
	const [ busy, setBusy ] = useState( false );

	const patch = ( changes ) => setParams( ( p ) => ( { ...p, ...changes } ) );
	const patchDeco = ( changes ) =>
		setParams( ( p ) => ( { ...p, deco: { ...p.deco, ...changes } } ) );

	/**
	 * The backdrop picture at a size (Background Studio or blur).
	 *
	 * @param {number} w      Width.
	 * @param {number} h      Height.
	 * @param {string} format Image type.
	 * @return {string|null} Data URL.
	 */
	const backdropSrc = ( w, h, format ) => {
		if ( 'studio' === bgMode ) {
			return renderBackground( bgParams, w, h ).toDataURL( format );
		}
		if ( 'blur' === bgMode && pic ) {
			return blurBackdrop( pic, w, h, blur ).toDataURL(
				'image/jpeg',
				0.92
			);
		}
		return null;
	};

	/**
	 * Build the composition layers (shared by preview and apply).
	 *
	 * @param {string|null} bgSrc Pre-rendered background data URL (or null).
	 * @param {Object}      spec  beautifySpec result.
	 * @return {Array} Flat layer list, bottom to top, ungrouped.
	 */
	const buildLayers = ( bgSrc, spec ) => {
		const layers = [];
		if ( 'solid' === bgMode ) {
			layers.push(
				makeShape( {
					name: __( 'Background', 'wunderpaint' ),
					x: 0,
					y: 0,
					w: spec.doc.w,
					h: spec.doc.h,
					fill: solidColor,
				} )
			);
		} else if ( 'blur' === bgMode && bgSrc ) {
			layers.push(
				makeImage( {
					name: sprintf(
						/* translators: %s: background style name. */
						__( 'Background: %s', 'wunderpaint' ),
						__( 'Blur', 'wunderpaint' )
					),
					x: 0,
					y: 0,
					w: spec.doc.w,
					h: spec.doc.h,
					src: bgSrc,
				} )
			);
		} else if ( 'studio' === bgMode && bgSrc ) {
			layers.push( {
				...makeImage( {
					name: sprintf(
						/* translators: %s: background style name. */
						__( 'Background: %s', 'wunderpaint' ),
						__( 'Gradient', 'wunderpaint' )
					),
					x: 0,
					y: 0,
					w: spec.doc.w,
					h: spec.doc.h,
					src: bgSrc,
				} ),
				bg: { ...bgParams },
			} );
		}
		const shotLayer =
			'doc' === sourceMode
				? {
						...makeImage( {
							name: __( 'Screenshot', 'wunderpaint' ),
							x: spec.shotRect.x,
							y: spec.shotRect.y,
							w: spec.shotRect.w,
							h: spec.shotRect.h,
							src: docShot?.src || '',
							naturalW: docShot?.naturalW,
							naturalH: docShot?.naturalH,
						} ),
						clipped: true,
				  }
				: {
						...source,
						x: spec.shotRect.x,
						y: spec.shotRect.y,
						w: spec.shotRect.w,
						h: spec.shotRect.h,
						rot: 0,
						clipped: true,
						parent: null,
				  };
		// Tilt turns the shot with its frame.
		shotLayer.rot = spec.shotRect.rot || 0;
		// The shot is what Edit frames again.
		shotLayer.beautifyShot = true;
		// Devices and glass clip the shot to a rounded screen of its own.
		const parts = [
			...spec.below.map( specToLayer ),
			specToLayer( spec.card ),
			...spec.bezel.map( specToLayer ),
			...( spec.screen ? [ specToLayer( spec.screen ) ] : [] ),
			shotLayer,
			...spec.overlays.map( specToLayer ),
		];
		return { layers, parts };
	};

	const paramsKey = JSON.stringify( {
		params,
		bgMode,
		bgParams,
		solidColor,
		blur,
		pic: !! pic,
	} );
	useEffect( () => {
		if ( ! sourceReady ) {
			return;
		}
		let live = true;
		const t = setTimeout( async () => {
			try {
				const spec = beautifySpec( shotSize, params );
				const scale = Math.min(
					1,
					460 / Math.max( spec.doc.w, spec.doc.h )
				);
				const bgSrc = backdropSrc(
					Math.round( spec.doc.w * scale ),
					Math.round( spec.doc.h * scale ),
					'image/png'
				);
				const { layers, parts } = buildLayers( bgSrc, spec );
				const canvas = await renderToCanvas(
					{ ...state.doc, w: spec.doc.w, h: spec.doc.h },
					[ ...layers, ...parts ],
					{ scale, cache: sharedImageCache }
				);
				if ( live ) {
					setPreview( canvas.toDataURL() );
				}
			} catch ( e ) {
				if ( live ) {
					setPreview( null );
				}
			}
		}, 200 );
		return () => {
			live = false;
			clearTimeout( t );
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ paramsKey, sourceReady, docShot, pic ] );

	// The full-size backdrop used to be painted and stored as a PNG in one
	// go on the main thread - a gradient with grain froze the editor and
	// weighed megabytes. It is encoded off the main thread now, and stored
	// the way Background Studio stores it (19.10.2026).
	const mounted = useRef( true );
	useEffect(
		() => () => {
			mounted.current = false;
		},
		[]
	);
	const fullBackdrop = async ( w, h ) => {
		if ( 'studio' === bgMode ) {
			return encodeBackground(
				renderBackground( bgParams, w, h ),
				bgParams
			);
		}
		if ( 'blur' === bgMode && pic ) {
			return encodeCanvas(
				blurBackdrop( pic, w, h, blur ),
				'image/jpeg',
				0.92
			);
		}
		return null;
	};

	const apply = async () => {
		if ( ! sourceReady || busy ) {
			return;
		}
		setBusy( true );
		await new Promise( ( resolve ) =>
			requestAnimationFrame( () => setTimeout( resolve, 0 ) )
		);
		try {
			const spec = beautifySpec( shotSize, params );
			const bgSrc = await fullBackdrop( spec.doc.w, spec.doc.h );
			if ( ! mounted.current ) {
				return;
			}
			const { layers, parts } = buildLayers( bgSrc, spec );
			// The shot is a fresh copy in a fresh document, never the live
			// layer object of the current one.
			const shotIdx =
				spec.below.length +
				1 +
				spec.bezel.length +
				( spec.screen ? 1 : 0 );
			parts[ shotIdx ] = { ...parts[ shotIdx ] };
			const group = makeGroup( {
				name: __( 'Screenshot', 'wunderpaint' ),
			} );
			group.generator = {
				id: BEAUTIFY_GENERATOR_ID,
				params: {
					params,
					bgMode,
					blur,
					bgParams,
					solidColor,
					shot: { w: shotSize.w, h: shotSize.h },
				},
			};
			if ( editGroup ) {
				group.id = editGroup.id;
				group.name = editGroup.name || group.name;
				group.parent = editGroup.parent || null;
				group.visible = editGroup.visible;
				group.locked = editGroup.locked;
			}
			// Groups are double-linked: children point at the group AND the
			// group lists the child ids - the panel and the renderer walk
			// group.children, parent alone leaves the group empty (v1.106.2).
			for ( const part of parts ) {
				part.parent = group.id;
			}
			group.children = parts.map( ( p ) => p.id );
			// The backdrop belongs to this frame, so Edit replaces it too.
			for ( const layer of layers ) {
				layer.beautifyOf = group.id;
			}
			if ( editGroup ) {
				// In place: the frame and its backdrop, at the size the new
				// recipe needs; every other layer stays where it is.
				if (
					spec.doc.w !== state.doc.w ||
					spec.doc.h !== state.doc.h
				) {
					dispatch( {
						type: 'SET_DOC',
						doc: { w: spec.doc.w, h: spec.doc.h },
					} );
				}
				dispatch( {
					type: 'SET_LAYERS',
					layers: placeBeautify( state.layers, layers, parts, group ),
				} );
				dispatch( { type: 'SET_ACTIVE', id: group.id } );
				commit( __( 'Edit screenshot frame', 'wunderpaint' ) );
				extras?.toasts?.success?.(
					__( 'Screenshot frame updated.', 'wunderpaint' )
				);
				onClose();
				return;
			}
			// The framed result has its own size, so it becomes its own
			// document - in a new tab, the current work stays put (v1.107).
			const doc = createBlankDoc( {
				name: 'screenshot',
				w: spec.doc.w,
				h: spec.doc.h,
				bg: 'transparent',
			} );
			const newLayers = [ ...layers, ...parts, group ];
			if ( ! extras?.openDocInNewTab?.( { doc, layers: newLayers } ) ) {
				dispatch( {
					type: 'LOAD_DOCUMENT',
					doc,
					layers: newLayers,
					label: __( 'Beautify screenshot', 'wunderpaint' ),
				} );
			}
			extras?.toasts?.success?.(
				__( 'Framed as editable layers.', 'wunderpaint' )
			);
			onClose();
		} catch ( e ) {
			extras?.toasts?.error?.(
				__( 'The screenshot could not be framed.', 'wunderpaint' )
			);
		} finally {
			if ( mounted.current ) {
				setBusy( false );
			}
		}
	};

	const deco = params.deco;

	return (
		<div className="modal-backdrop" onClick={ onClose } role="presentation">
			<div
				className="stock-dialog"
				style={ {
					width: 'min(1120px, 96vw)',
					height: 'auto',
					maxHeight: '92vh',
					gridTemplateRows: 'auto 1fr auto',
				} }
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-modal="true"
				aria-label={ __( 'Screenshot Beautifier', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<div className="dsm-title-row">
							<span className="dsm-title">
								{ __( 'Screenshot Beautifier', 'wunderpaint' ) }
							</span>
							<HelpLink
								article="design-tools"
								extras={ extras }
							/>
						</div>
						<div className="dsm-sub">
							{ __(
								'Card, shadow, frame and backdrop around your screenshot, all editable.',
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

				<div
					style={ {
						display: 'flex',
						gap: 16,
						padding: 16,
						overflow: 'hidden',
						minHeight: 0,
					} }
				>
					{ /* ------------------------- controls ------------------------ */ }
					<div
						style={ {
							flex: 1,
							minWidth: 0,
							display: 'grid',
							gap: 12,
							overflowY: 'auto',
							paddingRight: 4,
							alignContent: 'start',
						} }
					>
						<div
							style={ {
								display: 'flex',
								gap: 16,
								alignItems: 'flex-start',
								flexWrap: 'wrap',
							} }
						>
							{ ! editGroup && (
								<div style={ { display: 'grid', gap: 6 } }>
									<span className="dsm-label">
										{ __( 'Source', 'wunderpaint' ) }
									</span>
									<Seg
										options={ [
											...( source
												? [
														[
															'layer',
															__(
																'Selected image layer',
																'wunderpaint'
															),
														],
												  ]
												: [] ),
											...( state.layers.length
												? [
														[
															'doc',
															__(
																'Whole document (flattened)',
																'wunderpaint'
															),
														],
												  ]
												: [] ),
										] }
										value={ sourceMode }
										onChange={ setSourceMode }
									/>
									{ ! source && ! state.layers.length && (
										<div
											style={ {
												fontSize: 12,
												color: 'var(--ed-warn, #f5a623)',
											} }
										>
											{ __(
												'Add or select an image layer first, the beautifier wraps it.',
												'wunderpaint'
											) }
										</div>
									) }
									{ 'doc' === sourceMode &&
										! docShot &&
										state.layers.length > 0 && (
											<div
												style={ {
													fontSize: 12,
													color: 'var(--ed-text-muted)',
												} }
											>
												{ __(
													'Flattening the document…',
													'wunderpaint'
												) }
											</div>
										) }
								</div>
							) }

							<label
								style={ {
									display: 'grid',
									gap: 4,
									fontSize: 12,
									maxWidth: 220,
								} }
							>
								<span className="dsm-label">
									{ __( 'Canvas format', 'wunderpaint' ) }
								</span>
								<select
									className="dsm-select"
									value={ params.aspect }
									onChange={ ( e ) =>
										patch( { aspect: e.target.value } )
									}
								>
									<option value="original">
										{ __(
											'Original + padding',
											'wunderpaint'
										) }
									</option>
									<option value="16:9">16:9</option>
									<option value="4:3">4:3</option>
									<option value="1:1">1:1</option>
									<option value="4:5">4:5</option>
									<option value="9:16">9:16</option>
									<option value="og">
										{ __(
											'OG / social card (1.91:1)',
											'wunderpaint'
										) }
									</option>
								</select>
							</label>
						</div>

						<div style={ { display: 'grid', gap: 6 } }>
							<span className="dsm-label">
								{ __( 'Frame', 'wunderpaint' ) }
							</span>
							<Seg
								options={ [
									[ 'none', __( 'None', 'wunderpaint' ) ],
									[
										'browser',
										__( 'Browser', 'wunderpaint' ),
									],
									[ 'window', __( 'Window', 'wunderpaint' ) ],
									[
										'app',
										__( 'App window', 'wunderpaint' ),
									],
									[ 'phone', __( 'Phone', 'wunderpaint' ) ],
									[ 'tablet', __( 'Tablet', 'wunderpaint' ) ],
									[ 'glass', __( 'Glass', 'wunderpaint' ) ],
									[ 'deco', __( 'Deco', 'wunderpaint' ) ],
								] }
								value={ params.frame }
								onChange={ ( v ) => patch( { frame: v } ) }
							/>
						</div>

						{ [ 'browser', 'window', 'app', 'glass' ].includes(
							params.frame
						) && (
							<div
								style={ {
									display: 'flex',
									gap: 14,
									alignItems: 'center',
									flexWrap: 'wrap',
								} }
							>
								<label
									style={ {
										display: 'flex',
										gap: 8,
										alignItems: 'center',
										fontSize: 12,
									} }
								>
									<input
										type="checkbox"
										checked={ params.dark }
										onChange={ ( e ) =>
											patch( { dark: e.target.checked } )
										}
									/>
									{ __( 'Dark chrome', 'wunderpaint' ) }
								</label>
								{ 'browser' === params.frame && (
									<input
										type="text"
										value={ params.url }
										placeholder="wp-image-editor.com"
										aria-label={ __(
											'Address bar text',
											'wunderpaint'
										) }
										onChange={ ( e ) =>
											patch( { url: e.target.value } )
										}
										style={ {
											flex: 1,
											minWidth: 140,
											padding: '5px 8px',
											border: '1px solid var(--ed-border-strong)',
											borderRadius: 4,
											background: 'var(--ed-panel-alt)',
											color: 'var(--ed-text)',
											fontSize: 12,
										} }
									/>
								) }
							</div>
						) }

						{ 'deco' === params.frame && (
							<div style={ { display: 'grid', gap: 10 } }>
								<Seg
									options={ [
										[
											'offset',
											__( 'Offset panes', 'wunderpaint' ),
										],
										[ 'ring', __( 'Ring', 'wunderpaint' ) ],
										[
											'corners',
											__( 'Corners', 'wunderpaint' ),
										],
									] }
									value={ deco.variant }
									onChange={ ( v ) =>
										patchDeco( { variant: v } )
									}
								/>
								<div
									style={ {
										display: 'grid',
										gridTemplateColumns: '1fr 1fr',
										gap: 12,
									} }
								>
									<Slider
										label={ __(
											'Strength',
											'wunderpaint'
										) }
										value={ deco.width }
										min={ 0 }
										max={ 100 }
										onChange={ ( v ) =>
											patchDeco( { width: v } )
										}
									/>
									{ 'offset' === deco.variant && (
										<Slider
											label={ __(
												'Angle',
												'wunderpaint'
											) }
											value={ deco.angle }
											min={ 0 }
											max={ 20 }
											onChange={ ( v ) =>
												patchDeco( { angle: v } )
											}
										/>
									) }
								</div>
								<div
									style={ {
										display: 'flex',
										gap: 6,
										alignItems: 'center',
										flexWrap: 'wrap',
									} }
								>
									{ params.colors.map( ( c, i ) => (
										<SwatchButton
											key={ i }
											color={ c }
											size={ 26 }
											title={ __(
												'Color',
												'wunderpaint'
											) }
											onChange={ ( v ) =>
												patch( {
													colors: params.colors.map(
														( cc, j ) =>
															j === i ? v : cc
													),
												} )
											}
										/>
									) ) }
									<ColorsFrom
										onApply={ ( colors ) =>
											patch( {
												colors: colors.slice( 0, 2 ),
											} )
										}
									/>
									<button
										className="ai-btn secondary"
										onClick={ () => {
											patch( {
												colors: buildScheme(
													randomSchemeInput()
												).slice( 1, 3 ),
											} );
											patchDeco( {
												seed:
													1 +
													Math.floor(
														Math.random() * 1e9
													),
											} );
										} }
									>
										{ __( 'Randomize', 'wunderpaint' ) }
									</button>
								</div>
							</div>
						) }

						<div
							style={ {
								display: 'grid',
								gridTemplateColumns:
									'repeat(4, minmax(0, 1fr))',
								gap: '8px 14px',
							} }
						>
							<Slider
								label={ __( 'Padding', 'wunderpaint' ) }
								value={ params.padding }
								min={ 0 }
								max={ 40 }
								onChange={ ( v ) => patch( { padding: v } ) }
							/>
							<Slider
								label={ __( 'Corner radius', 'wunderpaint' ) }
								value={ params.radius }
								min={ 0 }
								max={ 100 }
								onChange={ ( v ) => patch( { radius: v } ) }
							/>
							<Slider
								label={ __( 'Shadow', 'wunderpaint' ) }
								value={ params.shadow }
								min={ 0 }
								max={ 100 }
								onChange={ ( v ) => patch( { shadow: v } ) }
							/>
							<Slider
								label={ __( 'Card border', 'wunderpaint' ) }
								value={ params.border }
								min={ 0 }
								max={ 100 }
								onChange={ ( v ) => patch( { border: v } ) }
							/>
						</div>

						<div
							style={ {
								display: 'grid',
								gridTemplateColumns: 'auto minmax(0, 1fr)',
								gap: 16,
								alignItems: 'end',
							} }
						>
							<div style={ { display: 'grid', gap: 6 } }>
								<span className="dsm-label">
									{ __( 'Layout', 'wunderpaint' ) }
								</span>
								<Seg
									options={ [
										[
											'center',
											__( 'Centered', 'wunderpaint' ),
										],
										[
											'rise',
											_x(
												'Rising',
												'screenshot layout',
												'wunderpaint'
											),
										],
										[
											'corner',
											__( 'Corner', 'wunderpaint' ),
										],
									] }
									value={ params.layout }
									onChange={ ( v ) => patch( { layout: v } ) }
								/>
							</div>
							<Slider
								label={ __( 'Tilt', 'wunderpaint' ) }
								value={ params.tilt }
								min={ -20 }
								max={ 20 }
								onChange={ ( v ) => patch( { tilt: v } ) }
							/>
						</div>

						<div style={ { display: 'grid', gap: 8 } }>
							<span className="dsm-label">
								{ __( 'Backdrop', 'wunderpaint' ) }
							</span>
							<Seg
								options={ [
									[
										'studio',
										__( 'Gradient', 'wunderpaint' ),
									],
									[
										'solid',
										__( 'Solid color', 'wunderpaint' ),
									],
									[ 'blur', __( 'Blur', 'wunderpaint' ) ],
									[
										'none',
										__( 'Transparent', 'wunderpaint' ),
									],
								] }
								value={ bgMode }
								onChange={ setBgMode }
							/>
							{ 'studio' === bgMode && (
								<div
									style={ {
										display: 'flex',
										gap: 6,
										alignItems: 'center',
										flexWrap: 'wrap',
									} }
								>
									<select
										className="dsm-select"
										value={ bgParams.style }
										onChange={ ( e ) =>
											setBgParams( ( b ) => ( {
												...b,
												style: e.target.value,
											} ) )
										}
									>
										<option value="mesh">
											{ __(
												'Mesh Gradient',
												'wunderpaint'
											) }
										</option>
										<option value="organic">
											{ __( 'Organic', 'wunderpaint' ) }
										</option>
										<option value="geo">
											{ __( 'Geometric', 'wunderpaint' ) }
										</option>
										<option value="poly">
											{ __( 'Low-Poly', 'wunderpaint' ) }
										</option>
										<option value="topo">
											{ __(
												'Topographic',
												'wunderpaint'
											) }
										</option>
										<option value="halftone">
											{ __( 'Halftone', 'wunderpaint' ) }
										</option>
										<option value="rings">
											{ __( 'Rings', 'wunderpaint' ) }
										</option>
										<option value="confetti">
											{ __( 'Confetti', 'wunderpaint' ) }
										</option>
										<option value="gradient">
											{ __( 'Gradient', 'wunderpaint' ) }
										</option>
										<option value="glow">
											{ __( 'Glow', 'wunderpaint' ) }
										</option>
										<option value="aurora">
											{ __( 'Aurora', 'wunderpaint' ) }
										</option>
										<option value="bokeh">
											{ __( 'Bokeh', 'wunderpaint' ) }
										</option>
										<option value="stars">
											{ __( 'Starfield', 'wunderpaint' ) }
										</option>
										<option value="terrazzo">
											{ __( 'Terrazzo', 'wunderpaint' ) }
										</option>
										<option value="plaid">
											{ __( 'Plaid', 'wunderpaint' ) }
										</option>
										<option value="scales">
											{ __( 'Scales', 'wunderpaint' ) }
										</option>
									</select>
									{ bgParams.colors
										.slice( 0, 4 )
										.map( ( c, i ) => (
											<SwatchButton
												key={ i }
												color={ c }
												size={ 26 }
												title={ __(
													'Color',
													'wunderpaint'
												) }
												onChange={ ( v ) =>
													setBgParams( ( b ) => ( {
														...b,
														colors: b.colors.map(
															( cc, j ) =>
																j === i ? v : cc
														),
													} ) )
												}
											/>
										) ) }
									<ColorsFrom
										onApply={ ( colors ) =>
											setBgParams( ( b ) => ( {
												...b,
												colors,
											} ) )
										}
									/>
									<button
										className="ai-btn secondary"
										style={ {
											display: 'flex',
											gap: 6,
											alignItems: 'center',
										} }
										onClick={ () =>
											setBgParams( ( b ) => ( {
												...b,
												seed:
													1 +
													Math.floor(
														Math.random() * 1e9
													),
											} ) )
										}
									>
										{ I.rotateCw( { size: 13 } ) }
										{ __( 'New variation', 'wunderpaint' ) }
									</button>
								</div>
							) }
							{ 'studio' === bgMode && (
								<div
									style={ {
										display: 'flex',
										gap: 6,
										alignItems: 'center',
										flexWrap: 'wrap',
									} }
								>
									{ BACKGROUND_LOOKS()
										.filter( ( l ) =>
											CALM_LOOKS.includes( l.id )
										)
										.map( ( look ) => (
											<button
												key={ look.id }
												className="ai-btn secondary"
												style={ {
													padding: '3px 9px',
													fontSize: 11,
												} }
												onClick={ () =>
													setBgParams(
														lookParams( look )
													)
												}
											>
												{ look.label }
											</button>
										) ) }
								</div>
							) }
							{ 'blur' === bgMode && (
								<div
									style={ {
										display: 'grid',
										gridTemplateColumns: '1fr 1fr',
										gap: 12,
									} }
								>
									<Slider
										label={ __( 'Blur', 'wunderpaint' ) }
										value={ blur.amount }
										min={ 0 }
										max={ 100 }
										onChange={ ( v ) =>
											setBlur( ( b ) => ( {
												...b,
												amount: v,
											} ) )
										}
									/>
									<Slider
										label={ __( 'Dim', 'wunderpaint' ) }
										value={ blur.dim }
										min={ 0 }
										max={ 80 }
										onChange={ ( v ) =>
											setBlur( ( b ) => ( {
												...b,
												dim: v,
											} ) )
										}
									/>
								</div>
							) }
							{ 'solid' === bgMode && (
								<SwatchButton
									color={ solidColor }
									size={ 26 }
									title={ __(
										'Background color',
										'wunderpaint'
									) }
									onChange={ ( v ) => setSolidColor( v ) }
								/>
							) }
						</div>
					</div>

					{ /* ------------------------- preview ------------------------- */ }
					<div
						style={ {
							width: 380,
							display: 'grid',
							gap: 8,
							alignContent: 'start',
						} }
					>
						<div
							style={ {
								width: 380,
								borderRadius: 8,
								border: '1px solid var(--ed-border-strong)',
								overflow: 'hidden',
								minHeight: 180,
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								background:
									'repeating-conic-gradient(#c9cdd3 0% 25%, #f2f3f5 0% 50%) 0 0 / 16px 16px',
							} }
						>
							{ preview && (
								<img
									src={ preview }
									alt={ __( 'Preview', 'wunderpaint' ) }
									style={ {
										width: '100%',
										display: 'block',
									} }
								/>
							) }
						</div>
						<div
							style={ {
								fontSize: 11,
								color: 'var(--ed-text-muted)',
							} }
						>
							{ __(
								'Opens as a new document in its own tab; your current work stays untouched.',
								'wunderpaint'
							) }
						</div>
					</div>
				</div>

				<div className="dsm-foot">
					<div className="dsm-hint">
						{ I.layers ? I.layers( { size: 14 } ) : null }
						{ editGroup
							? __(
									'Replaces the frame and its background in this document',
									'wunderpaint'
							  )
							: __(
									'Opens in a new tab, all layers editable',
									'wunderpaint'
							  ) }
					</div>
					<div style={ { display: 'flex', gap: 8 } }>
						<button
							className="ai-btn secondary"
							onClick={ onClose }
						>
							{ __( 'Cancel', 'wunderpaint' ) }
						</button>
						<button
							className="ai-btn primary"
							disabled={ ! sourceReady || busy }
							onClick={ apply }
						>
							{ busy && __( 'Rendering…', 'wunderpaint' ) }
							{ ! busy &&
								( editGroup
									? __( 'Update frame', 'wunderpaint' )
									: __(
											'Beautify screenshot',
											'wunderpaint'
									  ) ) }
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
