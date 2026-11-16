/**
 * Effects panel (v1.25.0): everything that ADDS to a layer, gathered from the
 * old Adjust + Props tabs into one place —
 *   • Filters     , preset CSS looks, live-previewed on the real layer.
 *   • Effects     , pixel effects, each with a rendered thumbnail preview.
 *   • Layer Styles, the Blending Options (shadow/glow/stroke/…), reused from
 *                    the properties panel.
 * Adjust keeps the tonal sliders + colour; Props keeps intrinsic geometry.
 */

import {
	useState,
	useEffect,
	useRef,
	useCallback,
	useMemo,
	useId,
	Fragment,
} from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import {
	renderToCanvas,
	createCanvas,
	contentBounds,
	sharedImageCache,
	measureTextWidth,
	measureTextHeight,
	textFxReach,
} from '../../lib/raster';
import { I } from '../../icons';
import { TEXT_STYLES } from '../../lib/text-styles';
import { TEXT_FX, TEXT_FX_CATALOG } from '../../lib/text-fx-defs';
import { activateTextEffect } from '../../lib/text-effects-collection';
import { SnapSlider } from '../../components/snap-slider';
import { FILTER_COLLECTION_GROUPS } from '../../lib/filter-collection';
import { hasColorGrade } from '../../lib/filter-grades';
import { LAYER_EFFECT_GROUPS } from '../../lib/layer-effects-collection';
import { TextCatalog } from './text-catalog';
import { useCatalogSource } from './use-catalog-source';
import { useEffectPreview } from './use-effect-preview';
import { trimTransparent } from '../../lib/mockup';
import { FILTERS } from '../../store/constants';
import { defaultAdjustments } from '../../store/document';
import {
	EFFECTS,
	defaultParamsFor,
	applyEffectToCanvas,
} from '../../lib/effects';
import { listExtensionEffects } from '../../lib/extensions';
import {
	useEditor,
	activeLayerOf,
	withDescendants,
} from '../../store/editor-context';
import { applyEffectToLayer } from '../../store/effect-ops';
import { applyPresetFilterOp } from '../../store/ops';
import { PanelSection } from '../../components/panel-section';

const isRenderable = ( layer ) => layer && 'adjustment' !== layer.type;

// Adaptive preview background (v1.176.0): pick a light or dark neutral by
// the content's brightness so a black shape / white text is never lost
// against a same-tone tile.
const PREVIEW_LIGHT = '#eef0f2';
const PREVIEW_DARK = '#2b2e33';
const relLuminance = ( hex ) => {
	const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(
		String( hex || '' )
	);
	if ( ! m ) {
		return null;
	}
	const [ r, g, b ] = [ 1, 2, 3 ].map(
		( i ) => parseInt( m[ i ], 16 ) / 255
	);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const previewBg = ( layer ) => {
	let c = null;
	if ( 'text' === layer?.type ) {
		c = layer.color;
	} else if ( 'shape' === layer?.type && 'string' === typeof layer.fill ) {
		c = layer.fill;
	}
	const lum = relLuminance( c );
	if ( null === lum ) {
		return PREVIEW_LIGHT; // images / gradients / unknown
	}
	return lum > 0.62 ? PREVIEW_DARK : PREVIEW_LIGHT;
};

const previewBounds = ( layer ) => {
	const margin =
		'text' === layer.type
			? Math.ceil( ( layer.fontSize || 16 ) * 0.35 )
			: 0;
	return {
		x: layer.x - margin,
		y: layer.y - margin,
		w: Math.max( 1, layer.w + 2 * margin ),
		h: Math.max( 1, layer.h + 2 * margin ),
	};
};

/* ----------------------- group preview plumbing ------------------------ */

/** Descendant layers of a group (without the group itself). */
const descLayersOf = ( state, layer ) => {
	if ( layer?.type === 'repeat' ) {
		const ids = withDescendants( state.layers, [ layer.sourceId ] );
		return state.layers.filter( ( l ) => ids.has( l.id ) );
	}
	if ( 'group' !== layer?.type ) {
		return null;
	}
	const ids = withDescendants( state.layers, [ layer.id ] );
	return state.layers.filter( ( l ) => ids.has( l.id ) && l.id !== layer.id );
};

/**
 * Keep the array identity stable while its elements are unchanged, so a
 * child edit (new layer object) refreshes group previews and everything
 * else stays cached.
 */
function useStableList( list ) {
	const ref = useRef( list );
	const prev = ref.current;
	const same =
		prev === list ||
		( !! prev &&
			!! list &&
			prev.length === list.length &&
			prev.every( ( v, i ) => v === list[ i ] ) );
	if ( ! same ) {
		ref.current = list;
	}
	return ref.current;
}

/** Paint list for a preview: the layer alone, or the group + children. */
const paintListFor = ( layer, desc, overrides ) =>
	desc && layer.type !== 'repeat'
		? [ { ...layer, ...overrides, parent: null }, ...desc ]
		: [ { ...layer, ...overrides, parent: null } ];

/** Preview viewport: leaf-union bounds for groups, layer bounds else. */
const boundsFor = ( layer, desc ) => {
	if ( layer.type === 'repeat' && desc ) {
		return contentBounds( [ layer, ...desc ], { roots: [ layer ] } );
	}
	if ( ! desc ) {
		return previewBounds( layer );
	}
	const leaves = desc.filter(
		( l ) =>
			'group' !== l.type && 'adjustment' !== l.type && false !== l.visible
	);
	if ( ! leaves.length ) {
		return previewBounds( layer );
	}
	const x1 = Math.min( ...leaves.map( ( l ) => l.x ) );
	const y1 = Math.min( ...leaves.map( ( l ) => l.y ) );
	return {
		x: x1,
		y: y1,
		w: Math.max( 1, Math.max( ...leaves.map( ( l ) => l.x + l.w ) ) - x1 ),
		h: Math.max( 1, Math.max( ...leaves.map( ( l ) => l.y + l.h ) ) - y1 ),
	};
};

/* ------------------------------- Filters ------------------------------- */

// Exported since v1.166.0: the Easy Mode panel reuses the exact same
// one-click filter chips, so filter changes land in both shells.
/* ------------------------------ active fx ------------------------------ */

/**
 * "Active on This Layer" (v1.247): every NON-DESTRUCTIVE thing currently
 * applied, as removable pills - filter preset, adjustments, text effects
 * (incl. warp) and smart filters. Clicking a text-effect pill re-opens
 * its settings card. Baked pixel effects cannot be listed (they are
 * destructive by design), text styles patch plain properties and leave
 * no marker either.
 */
export function ActiveFxSection( {
	editor,
	layer,
	extraItems = [],
	onOpenTextEffect,
	wsKey = 'effects.active',
	title = __( 'Active on This Layer', 'wunderpaint' ),
	collapsible = true,
} ) {
	const { dispatch, commit } = editor;
	const fx = layer.textFX || {};
	const patchFx = ( key, label ) => {
		const next = { ...fx };
		delete next[ key ];
		dispatch( {
			type: 'UPDATE_LAYER',
			id: layer.id,
			patch: { textFX: next },
		} );
		commit( label );
	};
	const openSettings = ( id ) => {
		if ( onOpenTextEffect ) {
			onOpenTextEffect( id );
			return;
		}
		window.dispatchEvent(
			new CustomEvent( 'wpie-fx-settings', { detail: { id } } )
		);
	};

	const items = [];
	if ( layer.filter && 'none' !== layer.filter ) {
		const preset = FILTERS.find( ( f ) => f.id === layer.filter );
		items.push( {
			key: 'filter',
			label: sprintf(
				/* translators: %s: filter name. */
				__( 'Filter: %s', 'wunderpaint' ),
				preset?.label || layer.filter
			),
			remove: () => applyPresetFilterOp( editor, 'none' ),
		} );
	}
	if ( Object.values( layer.adjust || {} ).some( ( v ) => v ) ) {
		items.push( {
			key: 'adjust',
			label: __( 'Adjustments', 'wunderpaint' ),
			remove: () => {
				dispatch( {
					type: 'UPDATE_LAYER',
					id: layer.id,
					patch: { adjust: defaultAdjustments() },
				} );
				commit( __( 'Reset adjustments', 'wunderpaint' ) );
			},
		} );
	}
	for ( const t of TEXT_FX ) {
		if ( fx[ t.id ] ) {
			items.push( {
				key: `fx-${ t.id }`,
				label: t.label,
				open: () => openSettings( t.id ),
				remove: () =>
					patchFx( t.id, __( 'Remove text effect', 'wunderpaint' ) ),
			} );
		}
	}
	if ( fx.warp?.type ) {
		items.push( {
			key: 'fx-warp',
			label: __( 'Warp', 'wunderpaint' ),
			open: () => openSettings( 'warp' ),
			remove: () => patchFx( 'warp', __( 'Remove warp', 'wunderpaint' ) ),
		} );
	}
	for ( const sf of layer.smartFilters || [] ) {
		const effect = EFFECTS.find( ( e ) => e.id === sf.id );
		items.push( {
			key: `sf-${ sf.uid }`,
			label: effect?.label || sf.id,
			dim: ! sf.enabled,
			toggle: () => {
				dispatch( {
					type: 'UPDATE_LAYER',
					id: layer.id,
					patch: {
						smartFilters: ( layer.smartFilters || [] ).map(
							( f ) =>
								f.uid === sf.uid
									? { ...f, enabled: ! f.enabled }
									: f
						),
					},
				} );
				commit( __( 'Toggle smart filter', 'wunderpaint' ) );
			},
			remove: () => {
				dispatch( {
					type: 'UPDATE_LAYER',
					id: layer.id,
					patch: {
						smartFilters: ( layer.smartFilters || [] ).filter(
							( f ) => f.uid !== sf.uid
						),
					},
				} );
				commit( __( 'Remove smart filter', 'wunderpaint' ) );
			},
		} );
	}

	items.push( ...extraItems );
	if ( ! items.length ) {
		return null;
	}
	return (
		<PanelSection
			wsKey={ wsKey }
			title={ title }
			collapsible={ collapsible }
		>
			<div className="active-fx-row">
				{ items.map( ( item ) => (
					<span
						key={ item.key }
						data-effect={ item.key }
						className={ `active-fx-pill${
							item.dim ? ' dim' : ''
						}` }
					>
						<button
							type="button"
							className="name"
							title={
								item.title ||
								( item.open
									? __( 'Open settings', 'wunderpaint' )
									: undefined )
							}
							onClick={ item.open || undefined }
						>
							{ item.label }
						</button>
						{ item.toggle && (
							<button
								type="button"
								className="act"
								title={
									item.dim
										? __( 'Enable', 'wunderpaint' )
										: __( 'Disable', 'wunderpaint' )
								}
								onClick={ item.toggle }
							>
								{ item.dim
									? I.eyeOff( { size: 12 } )
									: I.eye( { size: 12 } ) }
							</button>
						) }
						<button
							type="button"
							className="act"
							title={ __( 'Remove', 'wunderpaint' ) }
							aria-label={ `${ __( 'Remove', 'wunderpaint' ) }: ${
								item.label
							}` }
							onClick={ item.remove }
						>
							{ I.close( { size: 11 } ) }
						</button>
					</span>
				) ) }
			</div>
		</PanelSection>
	);
}

/** Layer looks and pixel effects use the same lazy card grid as the text catalogs. */
export function FiltersSection( { editor, layer, state } ) {
	const canvasPreview = useEffectPreview( editor, layer, ( filter ) => ( {
		filter: filter.id,
		filterAmount: 100,
	} ) );
	const intensityId = useId();
	const source = useCatalogSource( layer, state );
	const stableDesc = useStableList( descLayersOf( state, layer ) );
	const renderPreview = useCallback(
		async ( filter ) => {
			if ( ! isRenderable( source ) ) {
				return null;
			}
			const subj = previewSubject( source, stableDesc, false );
			if ( source.type === 'repeat' ) {
				await sharedImageCache.warm( stableDesc || [] );
			}
			const canvas = await renderToCanvas(
				{ ...state.doc, ...subj.doc, bg: 'transparent' },
				subj.make( {
					visible: true,
					filter: filter.id,
					filterAmount: 100,
					adjust: null,
					previewEffect: null,
				} ),
				{
					viewport: subj.vp,
					scale: Math.min( 160 / subj.vp.w, 130 / subj.vp.h, 1 ),
					cache: sharedImageCache,
					allLayers:
						source.type === 'repeat'
							? [ source, ...( stableDesc || [] ) ]
							: undefined,
				}
			);
			return ( trimTransparent( canvas, 3 ) || canvas ).toDataURL();
		},
		[ source, stableDesc, state.doc ]
	);
	const filters = [
		{ ...FILTERS[ 0 ], group: 'essentials' },
		...FILTERS.filter( ( f ) => f.collection ),
		...FILTERS.slice( 1 )
			.filter( ( f ) => ! f.collection )
			.map( ( f ) => ( { ...f, group: 'essentials' } ) ),
	];
	return (
		<PanelSection
			wsKey="effects.filters"
			title={ __( 'Filters', 'wunderpaint' ) }
		>
			{ hasColorGrade( layer?.filter ) && (
				<div className="slider-row">
					<label htmlFor={ intensityId }>
						{ __( 'Intensity', 'wunderpaint' ) }
					</label>
					<SnapSlider
						id={ intensityId }
						min={ 0 }
						max={ 100 }
						value={ layer.filterAmount ?? 100 }
						def={ 100 }
						ariaLabel={ __( 'Filter intensity', 'wunderpaint' ) }
						onChange={ ( value ) => {
							editor.dispatch( {
								type: 'UPDATE_LAYER',
								id: layer.id,
								patch: { filterAmount: value },
							} );
							editor.commit(
								__( 'Filter intensity', 'wunderpaint' )
							);
						} }
					/>
					<output className="wpie-number-output">
						{ layer.filterAmount ?? 100 }
					</output>
				</div>
			) }
			<TextCatalog
				previewScope={ layer?.id }
				items={ filters }
				kind="filters"
				canvasPreview={ canvasPreview }
				categoryGroups={ FILTER_COLLECTION_GROUPS }
				searchLabel={ __( 'Search filters', 'wunderpaint' ) }
				emptyLabel={ __( 'No matching filters', 'wunderpaint' ) }
				renderPreview={ renderPreview }
				choose={ ( filter ) =>
					layer && applyPresetFilterOp( editor, filter.id )
				}
				active={ { [ layer?.filter || 'none' ]: true } }
				background={ previewBg( layer ) }
			/>
		</PanelSection>
	);
}

export function EffectsSection( { editor, layer, state, extras } ) {
	const canvasPreview = useEffectPreview( editor, layer, ( effect ) => ( {
		previewEffect: {
			id: effect.id,
			params: defaultParamsFor( effect.id ),
		},
	} ) );
	const effects = [
		...EFFECTS.filter( ( e ) => e.collection ),
		...EFFECTS.filter( ( e ) => ! e.collection ).map( ( e ) => ( {
			...e,
			group: 'essentials',
		} ) ),
		...listExtensionEffects().map( ( e ) => ( {
			...e,
			group: 'essentials',
		} ) ),
	].filter( ( e ) => ! e.hidden );
	const source = useCatalogSource( layer, state );
	const stableDesc = useStableList( descLayersOf( state, layer ) );
	const renderPreview = useMemo( () => {
		let base;
		const renderBase = async () => {
			if ( ! isRenderable( source ) ) {
				return null;
			}
			const subj = previewSubject( source, stableDesc, false );
			if ( source.type === 'repeat' ) {
				await sharedImageCache.warm( stableDesc || [] );
			}
			const canvas = await renderToCanvas(
				{ ...state.doc, ...subj.doc, bg: 'transparent' },
				subj.make( {
					visible: true,
					filter: null,
					adjust: null,
					previewEffect: null,
				} ),
				{
					viewport: subj.vp,
					scale: Math.min( 160 / subj.vp.w, 130 / subj.vp.h, 1 ),
					cache: sharedImageCache,
					allLayers:
						source.type === 'repeat'
							? [ source, ...( stableDesc || [] ) ]
							: undefined,
				}
			);
			return canvas;
		};
		return async ( effect ) => {
			if ( ! base ) {
				base = renderBase().catch( ( error ) => {
					base = null;
					throw error;
				} );
			}
			const original = await base;
			if ( ! original ) {
				return null;
			}
			const canvas = createCanvas( original.width, original.height );
			canvas.getContext( '2d' ).drawImage( original, 0, 0 );

			// Render at card size before processing pixels: full-resolution source
			// canvases must never be filtered separately for every thumbnail.
			applyEffectToCanvas(
				canvas,
				effect.id,
				defaultParamsFor( effect.id )
			);
			return ( trimTransparent( canvas, 3 ) || canvas ).toDataURL();
		};
	}, [ source, stableDesc, state.doc ] );
	const run = ( effect ) => {
		if ( ! layer ) {
			return;
		}
		if ( Object.keys( effect.params || {} ).length ) {
			extras.openEffect( effect.id );
		} else {
			applyEffectToLayer( editor, effect.id ).catch( () =>
				extras.toasts.error(
					__( 'Could not apply the effect.', 'wunderpaint' )
				)
			);
		}
	};
	return (
		<PanelSection
			wsKey="effects.effects"
			title={ __( 'Effects', 'wunderpaint' ) }
		>
			<TextCatalog
				previewScope={ layer?.id }
				items={ effects }
				kind="layer-effects"
				canvasPreview={ canvasPreview }
				categoryGroups={ LAYER_EFFECT_GROUPS }
				searchLabel={ __( 'Search effects', 'wunderpaint' ) }
				renderPreview={ renderPreview }
				choose={ run }
				background={ previewBg( layer ) }
			/>
			{ 'smart' === layer?.type && (
				<p className="text-catalog-empty">
					{ __(
						'Applied as non-destructive Smart Filters.',
						'wunderpaint'
					) }
				</p>
			) }
		</PanelSection>
	);
}

/* ----------------------------- text effects ---------------------------- */

// Small generated sunset texture for the image-fill preview tile.
let fillPreviewUrl = null;
function fillPreviewSrc() {
	if ( ! fillPreviewUrl ) {
		const c = document.createElement( 'canvas' );
		c.width = 96;
		c.height = 64;
		const g = c.getContext( '2d' );
		const grad = g.createLinearGradient( 0, 0, 0, 64 );
		grad.addColorStop( 0, '#ffd36e' );
		grad.addColorStop( 0.55, '#ff8a5c' );
		grad.addColorStop( 1, '#7b4397' );
		g.fillStyle = grad;
		g.fillRect( 0, 0, 96, 64 );
		g.fillStyle = 'rgba(255,255,255,0.85)';
		g.beginPath();
		g.arc( 66, 22, 10, 0, Math.PI * 2 );
		g.fill();
		fillPreviewUrl = c.toDataURL();
	}
	return fillPreviewUrl;
}

/**
 * A single-glyph preview subject (v1.176.0): renders one big letter tight
 * in the tile, so a wide box or small/centered text no longer produces an
 * almost-empty preview. Keeps the layer's font/colour, drops the box
 * geometry, spans and pill. Returns { pv, vp } for renderToCanvas.
 *
 * @param {Object}  layer     The text layer.
 * @param {?Object} previewFX textFX to preview (or null).
 * @param {boolean} tall      Effect extends downward (reflection/drip).
 * @return {{pv: Object, vp: Object}} Preview layer + padded viewport.
 */
function glyphPreview( layer, previewFX, tall ) {
	const letters = Array.from( String( layer.text || '' ).trim() );
	const word =
		previewFX?.rainbow ||
		previewFX?.jitter ||
		previewFX?.marker ||
		previewFX?.circleMark ||
		previewFX?.scribbleUnder ||
		previewFX?.strikeFx;
	const sample =
		letters.slice( 0, word ? 3 : 1 ).join( '' ) || ( word ? 'Abc' : 'A' );
	const size = 128;
	const pv = {
		...layer,
		parent: null,
		filter: null,
		adjust: null,
		text: sample,
		fontSize: size,
		textFit: null,
		textLook: null,
		visible: true,
		opacity: 1,
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
		textFX: previewFX,
	};
	const measured = { ...pv, textFX: null, w: size * 3, h: size * 2 };
	const gw = Math.max( 12, measureTextWidth( measured ) );
	const gh = Math.max( 12, measureTextHeight( { ...measured, w: gw } ) );
	pv.w = gw;
	pv.h = gh;
	const pad =
		Math.ceil(
			Math.max( size * 0.2, textFxReach( pv ), ( pv.outlineW || 0 ) * 2 )
		) + 4;
	pv.x = pad;
	pv.y = pad;
	return {
		pv,
		vp: {
			x: 0,
			y: 0,
			w: gw + pad * 2,
			h: gh + ( tall ? gh * 0.7 : 0 ) + pad * 2,
		},
	};
}

/**
 * Preview subject for filters/effects (v1.176.1): a single big glyph for a
 * plain text layer (so wide/small/centered text is never lost), otherwise
 * the whole layer or group as before.
 *
 * @param {Object}  layer The active layer.
 * @param {?Array}  desc  Group descendants (or null).
 * @param {boolean} tall  Effect extends downward.
 * @return {{vp: Object, make: Function}} Viewport + a paint-list builder.
 */
function previewSubject( layer, desc, tall ) {
	if ( 'text' === layer?.type && ! desc ) {
		const { pv, vp } = glyphPreview( layer, layer.textFX, tall );
		return {
			vp,
			doc: { w: vp.w, h: vp.h },
			make: ( overrides ) => [ { ...pv, ...overrides } ],
		};
	}
	return {
		vp: boundsFor( layer, desc ),
		make: ( overrides ) => paintListFor( layer, desc, overrides ),
	};
}

/**
 * Non-destructive text effects with preview tiles (each its own toggle); the
 *  text stays fully editable.
 */
export function TextEffectsSection( { editor, layer, state } ) {
	const { dispatch, commit } = editor;
	const fx = layer.textFX || {};
	const canvasPreview = useEffectPreview(
		editor,
		layer,
		( item, current ) => {
			const effects = current.textFX || {};
			// The image-fill thumbnail has a sample texture; the user's canvas
			// may only preview their own chosen source.
			if ( item.id === 'imageFill' && ! effects.imageFill?.src ) {
				return null;
			}
			return {
				textFX: effects[ item.id ]
					? effects
					: activateTextEffect( effects, item ),
			};
		}
	);
	const renderPreview = useCallback(
		async ( item ) => {
			const { pv, vp } = glyphPreview(
				layer,
				item.fillPrev
					? { imageFill: { ...item.def, src: fillPreviewSrc() } }
					: item.prev,
				item.tall
			);
			const scale = 1;
			const canvas = await renderToCanvas(
				{ ...state.doc, w: vp.w, h: vp.h, bg: 'transparent' },
				[ pv ],
				{ viewport: vp, scale, cache: sharedImageCache }
			);
			const thumb = trimTransparent( canvas, 4 );
			return thumb?.toDataURL ? thumb.toDataURL() : null;
			// Preview geometry drops the current effect stack; editing a slider must not regenerate the entire gallery.
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[
			layer.id,
			layer.text,
			layer.fontFamily,
			layer.fontSize,
			layer.weight,
			layer.italic,
			layer.color,
			layer.fillType,
			layer.gradientStops,
			layer.gradientAngle,
			layer.gradientKind,
			layer.pattern,
			layer.outlineW,
			layer.outlineColor,
			layer.strokeGradient,
			layer.styles,
			state.doc,
		]
	);
	const choose = ( item ) => {
		if ( ! fx[ item.id ] ) {
			dispatch( {
				type: 'UPDATE_LAYER',
				id: layer.id,
				patch: { textFX: activateTextEffect( fx, item ) },
			} );
			commit( __( 'Text effect', 'wunderpaint' ) );
		}
		window.dispatchEvent(
			new CustomEvent( 'wpie-fx-settings', { detail: { id: item.id } } )
		);
	};
	return (
		<PanelSection
			wsKey="effects.textfx"
			title={ __( 'Text Effects', 'wunderpaint' ) }
		>
			<TextCatalog
				previewScope={ layer?.id }
				items={ TEXT_FX_CATALOG }
				kind="effects"
				canvasPreview={ canvasPreview }
				renderPreview={ renderPreview }
				choose={ choose }
				active={ fx }
				background={ previewBg( layer ) }
			/>
		</PanelSection>
	);
}

/**
 * One-click style presets: tiles rendered with the layer's own text so the
 *  preview IS the result. Applying patches fill/outline/textFX in one go.
 */
export function TextStylesSection( { editor, layer, state } ) {
	const { dispatch, commit } = editor;
	const canvasPreview = useEffectPreview(
		editor,
		layer,
		( item ) => item.patch
	);
	const renderPreview = useCallback(
		async ( item ) => {
			const tall =
				!! item.patch.textFX?.groundShadow ||
				!! item.patch.textFX?.reflection;
			const { pv, vp } = glyphPreview( layer, item.patch.textFX, tall );
			const scale = 1;
			const canvas = await renderToCanvas(
				{ ...state.doc, w: vp.w, h: vp.h, bg: 'transparent' },
				[ { ...pv, ...item.patch } ],
				{ viewport: vp, scale, cache: sharedImageCache }
			);
			const thumb = trimTransparent( canvas, 4 );
			return thumb?.toDataURL ? thumb.toDataURL() : null;
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[
			layer.id,
			layer.text,
			layer.fontFamily,
			layer.fontSize,
			layer.weight,
			layer.italic,
			layer.color,
			layer.fillType,
			layer.gradientStops,
			layer.gradientAngle,
			layer.gradientKind,
			layer.pattern,
			layer.outlineW,
			layer.outlineColor,
			layer.strokeGradient,
			layer.styles,
			state.doc,
		]
	);
	const choose = ( item ) => {
		dispatch( { type: 'UPDATE_LAYER', id: layer.id, patch: item.patch } );
		commit( __( 'Text style', 'wunderpaint' ) );
	};
	return (
		<PanelSection
			wsKey="effects.textstyles"
			title={ __( 'Text Styles', 'wunderpaint' ) }
		>
			<TextCatalog
				previewScope={ layer?.id }
				items={ TEXT_STYLES }
				kind="styles"
				canvasPreview={ canvasPreview }
				renderPreview={ renderPreview }
				choose={ choose }
				background={ ( item ) =>
					previewBg( { ...layer, ...item.patch } )
				}
			/>
		</PanelSection>
	);
}

const TEXT_WARPS_UI = [
	{ id: 'none', label: __( 'None', 'wunderpaint' ), type: null },
	{ id: 'arc', label: __( 'Arc', 'wunderpaint' ), type: 'arc' },
	{ id: 'arch', label: __( 'Arch', 'wunderpaint' ), type: 'arch' },
	{
		id: 'arcLower',
		label: __( 'Arc Lower', 'wunderpaint' ),
		type: 'arcLower',
	},
	{ id: 'bulge', label: __( 'Bulge', 'wunderpaint' ), type: 'bulge' },
	{ id: 'squeeze', label: __( 'Squeeze', 'wunderpaint' ), type: 'squeeze' },
	{ id: 'flag', label: __( 'Flag', 'wunderpaint' ), type: 'flag' },
	{ id: 'wave', label: __( 'Wave', 'wunderpaint' ), type: 'wave' },
	{ id: 'rise', label: __( 'Rise', 'wunderpaint' ), type: 'rise' },
	{ id: 'fisheye', label: __( 'Fisheye', 'wunderpaint' ), type: 'fisheye' },
	{ id: 'twist', label: __( 'Twist', 'wunderpaint' ), type: 'twist' },
	{ id: 'cone', label: __( 'Cone', 'wunderpaint' ), type: 'cone' },
	{ id: 'fish', label: __( 'Fish', 'wunderpaint' ), type: 'fish' },
	{ id: 'bounce', label: __( 'Bounce', 'wunderpaint' ), type: 'bounce' },
	{ id: 'ripple', label: __( 'Ripple', 'wunderpaint' ), type: 'ripple' },
	{ id: 'melt', label: __( 'Melt', 'wunderpaint' ), type: 'melt' },
	{ id: 'persp', label: __( 'Perspective', 'wunderpaint' ), type: 'persp' },
	{ id: 'pinch', label: __( 'Pinch', 'wunderpaint' ), type: 'pinch' },
];

/**
 * Warp a text layer along a preset shape (arc, arch, bulge, flag, wave). The
 *  text stays editable — the warp is a render-time mesh distortion.
 */
export function TextWarpSection( { editor, layer, state } ) {
	const { dispatch, commit } = editor;
	const fx = layer.textFX || {};
	const warp = fx.warp || {};
	const activeType = warp.type || null;
	const bend = warp.bend ?? 50;
	const canvasPreview = useEffectPreview(
		editor,
		layer,
		( item, current ) => ( {
			textFX: {
				...current.textFX,
				warp: item.type
					? {
							type: item.type,
							bend: current.textFX?.warp?.bend ?? 50,
					  }
					: null,
			},
		} )
	);
	const [ previews, setPreviews ] = useState( {} );

	useEffect( () => {
		let cancelled = false;
		Promise.all(
			TEXT_WARPS_UI.map( async ( t ) => {
				try {
					const { pv, vp } = glyphPreview(
						layer,
						t.type ? { warp: { type: t.type, bend: 60 } } : null,
						false
					);
					const scale = 1;
					const canvas = await renderToCanvas(
						{ ...state.doc, w: vp.w, h: vp.h, bg: 'transparent' },
						[ pv ],
						{ viewport: vp, scale, cache: sharedImageCache }
					);
					return [
						t.id,
						canvas?.toDataURL
							? trimTransparent( canvas, 4 ).toDataURL()
							: null,
					];
				} catch ( e ) {
					return [ t.id, null ];
				}
			} )
		).then( ( pairs ) => {
			if ( ! cancelled ) {
				setPreviews(
					Object.fromEntries( pairs.filter( ( p ) => p[ 1 ] ) )
				);
			}
		} );
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		layer.id,
		layer.text,
		layer.fontFamily,
		layer.fontSize,
		layer.color,
		state.doc,
	] );

	const apply = ( nextWarp ) => {
		dispatch( {
			type: 'UPDATE_LAYER',
			id: layer.id,
			patch: { textFX: { ...fx, warp: nextWarp } },
		} );
		commit( __( 'Text warp', 'wunderpaint' ) );
	};
	// Like the other text effects, the Bend control lives in the floating
	// settings card over the canvas - not inline below 6 tiles (v1.174.1).
	const openSettings = () =>
		window.dispatchEvent(
			new CustomEvent( 'wpie-fx-settings', { detail: { id: 'warp' } } )
		);
	const pick = ( t ) => {
		if ( t.type ) {
			apply( { type: t.type, bend } );
			openSettings();
		} else {
			apply( null );
		}
	};

	return (
		<PanelSection
			wsKey="effects.warp"
			title={ __( 'Warp', 'wunderpaint' ) }
		>
			<div className="effect-grid">
				{ TEXT_WARPS_UI.map( ( t ) => {
					const on = t.type ? activeType === t.type : ! activeType;
					return (
						<button
							key={ t.id }
							className={
								'effect-chip' + ( on ? ' active' : '' )
							}
							title={ t.label }
							aria-pressed={ on }
							{ ...canvasPreview.forItem( t ) }
							onClick={ () => {
								canvasPreview.stop();
								pick( t );
							} }
						>
							<span
								className="effect-thumb"
								style={ { background: previewBg( layer ) } }
							>
								{ previews[ t.id ] ? (
									<img src={ previews[ t.id ] } alt="" />
								) : (
									<span className="effect-thumb-fallback" />
								) }
							</span>
							<span className="effect-label">{ t.label }</span>
						</button>
					);
				} ) }
			</div>
		</PanelSection>
	);
}

/* -------------------------------- panel -------------------------------- */

export function EffectsPanel( { extras } ) {
	const editor = useEditor();
	const { state } = editor;
	const layer = activeLayerOf( state );

	if ( ! layer ) {
		return (
			<div
				style={ {
					padding: 20,
					color: 'var(--ed-text-muted)',
					fontSize: 12,
					textAlign: 'center',
				} }
			>
				{ __(
					'Select a layer to apply filters and effects.',
					'wunderpaint'
				) }
			</div>
		);
	}

	return (
		<Fragment>
			<ActiveFxSection editor={ editor } layer={ layer } />
			{ 'text' === layer.type && (
				<Fragment>
					<TextStylesSection
						editor={ editor }
						layer={ layer }
						state={ state }
					/>
					<TextEffectsSection
						editor={ editor }
						layer={ layer }
						state={ state }
					/>
					<TextWarpSection
						editor={ editor }
						layer={ layer }
						state={ state }
					/>
				</Fragment>
			) }
			<FiltersSection editor={ editor } layer={ layer } state={ state } />
			<EffectsSection
				editor={ editor }
				layer={ layer }
				state={ state }
				extras={ extras }
			/>
		</Fragment>
	);
}
