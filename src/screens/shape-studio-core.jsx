/**
 * Everything the Shape Studio knows, in one place.
 *
 * TWO surfaces render this: the floating shape panel, which is where a
 * shape is dialed day to day (panels/shape-panel.jsx), and the big studio
 * modal, which is the same thing with room to breathe
 * (shape-studio-dialog.jsx). Neither of them owns the catalog, the dial
 * stack, the preview or the translation between a config and a real
 * layer, because two copies of that is two answers to "what does Burst's
 * Depth dial do" - and the panel exists precisely so nobody has to open
 * the modal to find out.
 *
 * A "cfg" here is one flat object describing a shape that does not exist
 * yet, or the shape of a layer that does. It is deliberately NOT state:
 * the panel derives it from the tool options or from the selected layer
 * on every render, so the options bar and the panel can never disagree.
 * Only the modal keeps one of its own, because a modal is allowed to
 * collect changes and hand them over at the end.
 */

import { useEffect, useRef } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { SnapSlider } from '../components/snap-slider';
import { SwatchButton } from '../components/color-popover';
import { makeShape } from '../store/document';
import { drawShape } from '../lib/raster/shapes';
import { shapeToPathD } from '../lib/shape-path';
import { scalePathD } from '../lib/path';
import { ROUNDABLE_SHAPES } from '../lib/corner-geometry';
import { SHAPE_CHOICES } from '../components/shape-picker';
import {
	DYNAMIC_SHAPE_MAP,
	dynamicDefaults,
	pathPolygonRings,
	resolvedParams,
} from '../lib/shape-dynamics';

/** Every pickable shape except the line (no area, nothing to dial). */
export const STUDIO_SHAPES = SHAPE_CHOICES.filter( ( s ) => 'line' !== s.id );

/**
 * The studio shows ONLY shapes with real dials (Thomas: "fill oder
 * stroke ist keine Aenderung"), grouped by theme. Statics without any
 * dial (pill, note, the fixed badge) live in the picker and the asset
 * library, not here.
 */
const GROUP_IDS = [
	[
		() => __( 'Basics', 'wunderpaint' ),
		// prettier-ignore
		[ 'rect', 'ellipse', 'squircle', 'triangle', 'diamond', 'polygon', 'star', 'heart', 'blob' ],
	],
	[
		() => __( 'Arrows', 'wunderpaint' ),
		[ 'arrow', 'arcarrow', 'chevrons' ],
	],
	[
		() => __( 'Banners', 'wunderpaint' ),
		// prettier-ignore
		[ 'ribbon', 'label', 'flag', 'bookmark', 'chevron', 'cornerband', 'stamp', 'ticket', 'wave', 'tag' ],
	],
	[
		() => __( 'Badges', 'wunderpaint' ),
		[
			'burst',
			'seal',
			'medal',
			'gear',
			'gearpair',
			'ring',
			'frame',
			'target',
		],
	],
	[ () => __( 'Speech', 'wunderpaint' ), [ 'speech', 'thought', 'shout' ] ],
	[
		() => __( 'Symbols', 'wunderpaint' ),
		// prettier-ignore
		[ 'cross', 'check', 'xmark', 'bolt', 'crown', 'shield', 'drop', 'gem' ],
	],
	[
		() => __( 'Nature', 'wunderpaint' ),
		// prettier-ignore
		[ 'cloud', 'moon', 'crescent', 'sun', 'leaf', 'pine', 'mountain', 'clover', 'flower', 'shooting' ],
	],
	[
		() => __( 'Curves', 'wunderpaint' ),
		// prettier-ignore
		[ 'superform', 'rose', 'lissajous', 'harmonograph', 'guilloche', 'epitrochoid', 'butterfly', 'heartcurve', 'spiral', 'galaxy', 'chladni' ],
	],
	[
		() => __( 'Fractals', 'wunderpaint' ),
		// prettier-ignore
		[ 'fractal', 'sierpinski', 'dragon', 'hilbert', 'branch', 'skyline', 'tornstrip' ],
	],
	[
		() => __( 'Patterns', 'wunderpaint' ),
		// prettier-ignore
		[ 'truchet', 'maze', 'honeycomb', 'argyle', 'startile', 'herringbone', 'scales', 'moire', 'interference', 'halftone', 'stripes', 'datablocks', 'gridwarp', 'scatter', 'packing', 'filmstrip', 'isoblocks' ],
	],
	[
		() => __( 'Organic & art', 'wunderpaint' ),
		// prettier-ignore
		[ 'blobgen', 'metaball', 'voronoi', 'delaunay', 'flowfield', 'hatching', 'treerings', 'stroke', 'splat', 'shard', 'divider', 'mandala', 'phyllotaxis', 'constellation', 'rays', 'starpoly' ],
	],
	[
		() => __( 'Geometry', 'wunderpaint' ),
		// prettier-ignore
		[ 'parallelogram', 'trapezoid', 'rhombus', 'kite', 'stairs', 'lshape', 'grid', 'arch', 'layers', 'cube', 'hourglass', 'funnel', 'bars' ],
	],
];

export const STUDIO_GROUPS = GROUP_IDS.map( ( [ label, ids ], gi ) => ( {
	id: 'g' + gi,
	label,
	entries: ids
		.map( ( id ) => STUDIO_SHAPES.find( ( s ) => s.id === id ) )
		.filter( Boolean )
		.map( ( s ) => ( {
			key: 'core:' + s.id,
			name: s.name,
			shape: s.id,
		} ) ),
} ) );

/* ------------------------------- pieces --------------------------------- */

/**
 * One compact labelled slider. `def` makes it snap to the shape's own
 * default on the way past and reset on a double-click, and `onCommit`
 * fires when the drag ends - which is what lets the panel write straight
 * into a live layer without filling the history with one entry per pixel.
 */
export function Dial( {
	label,
	min,
	max,
	step = 1,
	value,
	def = 0,
	suffix = '',
	onChange,
	onCommit,
} ) {
	return (
		<label className="ssd-dial">
			<span className="dsm-label">{ label }</span>
			<span className="ssd-dial-val">
				{ value }
				{ suffix }
			</span>
			<SnapSlider
				min={ min }
				max={ max }
				step={ step }
				value={ value }
				def={ def }
				ariaLabel={ label }
				onChange={ onChange }
				onCommit={ onCommit }
			/>
		</label>
	);
}

/** A shape tile: the real geometry at thumb size, like the quick picker. */
export function Thumb( { entry, size = 30 } ) {
	const inner = size - 6;
	const item = entry.item;
	const d = item?.pathD
		? scalePathD( item.pathD, inner / 100, inner / 100 )
		: shapeToPathD( {
				type: 'shape',
				shape: item ? item.shape : entry.shape,
				w: inner,
				h: inner,
				sides:
					item?.sides ||
					( 'star' === ( item ? item.shape : entry.shape ) ? 5 : 6 ),
				...( item?.shapeParams
					? { shapeParams: item.shapeParams }
					: {} ),
				...( item?.innerRatio ? { innerRatio: item.innerRatio } : {} ),
				...( item?.radius
					? { radius: ( item.radius * inner ) / 100 }
					: {} ),
		  } );
	return (
		<svg
			width={ size }
			height={ size }
			viewBox={ `0 0 ${ size } ${ size }` }
		>
			<g transform="translate(3 3)">
				<path d={ d || '' } fill="currentColor" />
			</g>
		</svg>
	);
}

/**
 * The tile grid. Callers decide WHICH groups to hand over - the modal
 * gives all twelve, the panel gives the one you picked - and a query
 * always searches across whatever it was given.
 */
export function ShapeGrid( {
	groups,
	query,
	entryKey,
	onPick,
	tile = 30,
	heads = true,
	className = 'ssd-grid',
} ) {
	return (
		<div className={ className }>
			{ groups.map( ( group ) => {
				const entries = group.entries.filter(
					( entry ) =>
						! query || entry.name().toLowerCase().includes( query )
				);
				if ( ! entries.length ) {
					return null;
				}
				return [
					heads ? (
						<div
							key={ group.id + ':label' }
							className="dsm-label ssd-grid-head"
						>
							{ group.label() }
						</div>
					) : null,
					...entries.map( ( entry ) => {
						const on = entry.key === entryKey;
						return (
							<button
								key={ entry.key }
								type="button"
								title={ entry.name() }
								aria-pressed={ on }
								className={
									'ssd-tile' + ( on ? ' is-on' : '' )
								}
								onClick={ () => onPick( entry ) }
							>
								<Thumb entry={ entry } size={ tile } />
							</button>
						);
					} ),
				];
			} ) }
		</div>
	);
}

/**
 * The live preview. It renders the EXACT layer that Insert/Apply
 * produces, so a corner radius is true to the pixel rather than to some
 * preview scale.
 */
export function ShapePreview( { cfg, box, area = 340, className } ) {
	const canvasRef = useRef( null );
	useEffect( () => {
		const canvas = canvasRef.current;
		if ( ! canvas ) {
			return;
		}
		const scale = Math.min( area / box.w, area / box.h, 1 );
		const dpr = window.devicePixelRatio || 1;
		const cw = Math.max( 1, Math.round( box.w * scale ) );
		const ch = Math.max( 1, Math.round( box.h * scale ) );
		canvas.width = Math.round( cw * dpr );
		canvas.height = Math.round( ch * dpr );
		canvas.style.width = cw + 'px';
		canvas.style.height = ch + 'px';
		const ctx = canvas.getContext( '2d' );
		if ( ! ctx ) {
			return; // jsdom (tests) has no 2d context.
		}
		ctx.clearRect( 0, 0, canvas.width, canvas.height );
		ctx.save();
		ctx.scale( scale * dpr, scale * dpr );
		try {
			drawShape( ctx, previewLayer( cfg, box.w, box.h ) );
		} catch ( e ) {
			// A degenerate dial combination must not take the panel down.
		}
		ctx.restore();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ JSON.stringify( cfg ), box.w, box.h, area ] );
	return <canvas ref={ canvasRef } className={ className } />;
}

/** What to call this shape in a heading. */
export function shapeLabel( cfg ) {
	if ( cfg.pathD ) {
		return cfg.name || __( 'Custom path', 'wunderpaint' );
	}
	return (
		cfg.name ||
		STUDIO_SHAPES.find( ( s ) => s.id === cfg.shape )?.name() ||
		__( 'Shape', 'wunderpaint' )
	);
}

/**
 * What KIND of shape this is, ignoring whatever the layer happens to be
 * called. The panel's own head already says which layer you are on, so
 * its dial stack answers the other question.
 */
export function catalogLabel( cfg ) {
	if ( cfg.pathD ) {
		return cfg.name || __( 'Custom path', 'wunderpaint' );
	}
	return (
		STUDIO_SHAPES.find( ( s ) => s.id === cfg.shape )?.name() ||
		cfg.name ||
		__( 'Shape', 'wunderpaint' )
	);
}

/**
 * The dial stack: presets, the shape's own registry dials, the corner
 * engine, fill and stroke. `patch` merges into the cfg, `onCommit` marks
 * the end of a gesture - the panel turns that into a history entry, the
 * modal has nothing to commit until you press its button and passes
 * nothing at all.
 */
export function ShapeDials( { cfg, patch, box, onCommit, heading } ) {
	const def = cfg.pathD ? null : DYNAMIC_SHAPE_MAP[ cfg.shape ];
	const params = resolvedParams( cfg.shape, cfg.shapeParams );
	const rings = cfg.pathD ? pathPolygonRings( cfg.pathD ) : null;
	// A generator with a seed gets a shuffle button: it writes a NEW
	// stored seed number, it does not randomise the drawing itself.
	const hasSeed = ( def?.params || [] ).some( ( prm ) => 'seed' === prm.key );
	const roundable = cfg.pathD
		? !! rings
		: ROUNDABLE_SHAPES.includes( cfg.shape ) || !! def?.corners;
	const maxRadius = Math.round( Math.min( box.w, box.h ) / 2 );
	// A discrete change (a preset, a swatch, a shuffle) is one gesture and
	// one history entry, so it commits itself. A DIAL does not: it commits
	// when the drag ends, or a slider would write one entry per pixel.
	const atOnce = ( p ) => {
		patch( p );
		onCommit?.();
	};

	const pctDial = ( prm ) => {
		const isPct = ! prm.deg && prm.step < 1;
		const scale = isPct ? 100 : 1;
		return (
			<Dial
				key={ prm.key }
				label={ prm.label() }
				min={ Math.round( prm.min * scale ) }
				max={ Math.round( prm.max * scale ) }
				def={ Math.round( prm.def * scale ) }
				value={ Math.round( params[ prm.key ] * scale ) }
				suffix={ isPct ? '%' : prm.deg ? '°' : '' }
				onChange={ ( v ) =>
					patch( {
						shapeParams: {
							...cfg.shapeParams,
							[ prm.key ]: v / scale,
						},
					} )
				}
				onCommit={ onCommit }
			/>
		);
	};

	return (
		<>
			<div className="ssd-name">{ heading ?? shapeLabel( cfg ) }</div>

			{ cfg.pathD && ! rings && (
				<div className="dsm-hint">
					<span>
						{ __(
							'A free-form path has no dials - reshape it any time with the anchor editor (double-click it on the canvas).',
							'wunderpaint'
						) }
					</span>
				</div>
			) }
			{ ! cfg.pathD && [ 'polygon', 'star' ].includes( cfg.shape ) && (
				<Dial
					label={
						'star' === cfg.shape
							? __( 'Points', 'wunderpaint' )
							: __( 'Sides', 'wunderpaint' )
					}
					min={ 3 }
					max={ 24 }
					def={ 'star' === cfg.shape ? 5 : 6 }
					value={ cfg.sides }
					onChange={ ( v ) => patch( { sides: v } ) }
					onCommit={ onCommit }
				/>
			) }
			{ 'star' === cfg.shape && (
				<Dial
					label={ __( 'Waist', 'wunderpaint' ) }
					min={ 5 }
					max={ 95 }
					def={ 45 }
					value={ Math.round( cfg.innerRatio * 100 ) }
					suffix="%"
					onChange={ ( v ) => patch( { innerRatio: v / 100 } ) }
					onCommit={ onCommit }
				/>
			) }
			{ /* Style presets: named dial sets, because raw superformula
			     exponents are impossible to aim at by hand. */ }
			{ !! def?.presets?.length && (
				<div className="ssd-presets">
					{ def.presets.map( ( ps ) => (
						<button
							key={ ps.name() }
							type="button"
							className="ai-btn secondary"
							onClick={ () =>
								atOnce( {
									shapeParams: {
										...dynamicDefaults( cfg.shape ),
										...ps.params,
									},
								} )
							}
						>
							{ ps.name() }
						</button>
					) ) }
				</div>
			) }
			{ ( def?.params || [] ).map( pctDial ) }
			{ hasSeed && (
				<button
					type="button"
					className="ai-btn secondary ssd-shuffle"
					onClick={ () =>
						atOnce( {
							shapeParams: {
								...params,
								seed: 1 + Math.floor( Math.random() * 999 ),
							},
						} )
					}
				>
					{ __( 'Shuffle', 'wunderpaint' ) }
				</button>
			) }
			{ roundable && (
				<Dial
					label={ __( 'Radius', 'wunderpaint' ) }
					min={ 0 }
					max={ maxRadius }
					def={ 0 }
					value={ Math.min( cfg.radius, maxRadius ) }
					suffix="px"
					onChange={ ( v ) => patch( { radius: v } ) }
					onCommit={ onCommit }
				/>
			) }
			{ roundable && cfg.radius > 0 && (
				<Dial
					label={ __( 'Smoothing', 'wunderpaint' ) }
					min={ 0 }
					max={ 100 }
					def={ 0 }
					value={ Math.round( cfg.cornerSmoothing * 100 ) }
					suffix="%"
					onChange={ ( v ) => patch( { cornerSmoothing: v / 100 } ) }
					onCommit={ onCommit }
				/>
			) }

			<div className="ssd-paint">
				<label>
					<span className="dsm-label">
						{ __( 'Fill', 'wunderpaint' ) }
					</span>
					<SwatchButton
						color={ cfg.fill }
						size={ 26 }
						title={ __( 'Fill', 'wunderpaint' ) }
						onChange={ ( c ) => atOnce( { fill: c } ) }
					/>
				</label>
				<label>
					<span className="dsm-label">
						{ __( 'Stroke', 'wunderpaint' ) }
					</span>
					<SwatchButton
						color={ cfg.stroke || 'transparent' }
						size={ 26 }
						title={ __( 'Stroke', 'wunderpaint' ) }
						onChange={ ( c ) =>
							atOnce( {
								stroke: c,
								strokeW: cfg.strokeW || 2,
							} )
						}
					/>
				</label>
				{ !! cfg.stroke && (
					<label>
						<span className="dsm-label">
							{ __( 'Width', 'wunderpaint' ) }
						</span>
						<input
							type="number"
							min={ 0 }
							max={ 80 }
							value={ cfg.strokeW }
							onChange={ ( e ) =>
								patch( {
									strokeW: Math.max(
										0,
										+e.target.value || 0
									),
								} )
							}
							onBlur={ () => onCommit?.() }
						/>
					</label>
				) }
			</div>
		</>
	);
}

/* ------------------------- configs and layers ---------------------------- */

/** The cfg of an existing shape layer. */
export function cfgFromLayer( layer, fallbackFill ) {
	return {
		entryKey: layer.pathD ? null : 'core:' + ( layer.shape || 'rect' ),
		name: layer.name || '',
		shape: layer.shape || 'rect',
		// An existing path layer is already layer-local (pathScale 0), a
		// catalog pick is in the 100 box.
		pathD: layer.pathD || null,
		pathScale: 0,
		shapeParams: layer.shapeParams || null,
		radius: Array.isArray( layer.radius )
			? Math.round( layer.radius[ 0 ] || 0 )
			: layer.radius || 0,
		cornerSmoothing: layer.cornerSmoothing || 0,
		sides: layer.sides || ( 'star' === layer.shape ? 5 : 6 ),
		innerRatio: layer.innerRatio ?? 0.45,
		fill: layer.fill || fallbackFill || '#000000',
		stroke: layer.stroke || null,
		strokeW: layer.strokeW || 0,
	};
}

/**
 * The cfg of the shape that does not exist yet: the tool's own options,
 * plus the foreground colour, because that is the fill the drag uses.
 * The line has no area to dial, so it stands in as a rectangle.
 */
export function cfgFromToolOpts( toolOpts, fgColor ) {
	const opts = toolOpts || {};
	const shape =
		'line' === ( opts.shape || 'rect' ) ? 'rect' : opts.shape || 'rect';
	return {
		entryKey: 'core:' + shape,
		name: '',
		shape,
		pathD: null,
		pathScale: 0,
		shapeParams: opts.shapeParams || null,
		radius: opts.radius || 0,
		cornerSmoothing: opts.cornerSmoothing || 0,
		sides: opts.sides || 6,
		innerRatio: opts.innerRatio ?? 0.45,
		fill: fgColor,
		stroke: opts.stroke || null,
		strokeW: opts.strokeW || 0,
	};
}

/** What picking a tile does to the cfg. */
export function pickPatch( entry ) {
	const item = entry.item;
	return item
		? {
				entryKey: entry.key,
				name: item.name,
				shape: item.shape || 'rect',
				pathD: item.pathD || null,
				pathScale: 100,
				shapeParams: item.shapeParams || null,
				sides: item.sides || 6,
				innerRatio: item.innerRatio ?? 0.45,
				radius: item.radius || 0,
		  }
		: {
				entryKey: entry.key,
				name: '',
				shape: entry.shape,
				pathD: null,
				shapeParams: null,
		  };
}

/**
 * How big the shape is: an edited layer's own box, or a sensible slice of
 * the document at the shape's own aspect.
 */
export function shapeBox( cfg, doc, editLayer ) {
	if ( editLayer ) {
		return { w: editLayer.w, h: editLayer.h };
	}
	const aspect = ( cfg.pathD ? null : DYNAMIC_SHAPE_MAP[ cfg.shape ] )
		?.aspect;
	const ratio = aspect || 1;
	const base = Math.max(
		96,
		Math.min( 640, Math.round( Math.min( doc.w, doc.h ) * 0.45 ) )
	);
	const w = Math.min( Math.round( base * ratio ), doc.w );
	return { w, h: Math.round( w / ratio ) };
}

/**
 * The catalog authors its paths in a 100 unit box; an edited layer's path
 * is already layer-local (pathScale 0 = use as is).
 */
export function localPathD( cfg, w, h ) {
	return cfg.pathD && cfg.pathScale
		? scalePathD( cfg.pathD, w / cfg.pathScale, h / cfg.pathScale )
		: cfg.pathD;
}

/** A throwaway layer for the preview canvas. */
export function previewLayer( cfg, w, h ) {
	return {
		type: 'shape',
		shape: cfg.shape,
		w,
		h,
		...( cfg.pathD ? { pathD: localPathD( cfg, w, h ) } : {} ),
		...( cfg.shapeParams ? { shapeParams: cfg.shapeParams } : {} ),
		radius: cfg.radius,
		cornerSmoothing: cfg.cornerSmoothing,
		sides: cfg.sides,
		innerRatio: cfg.innerRatio,
		fill: cfg.fill,
		stroke: cfg.stroke,
		strokeW: cfg.strokeW,
	};
}

/** The UPDATE_LAYER patch that makes an existing layer match the cfg. */
export function layerPatch( cfg, w, h ) {
	return {
		shape: cfg.shape,
		// Switching from a path entry to a core shape (or the other way)
		// must clear/set the path explicitly.
		pathD: cfg.pathD ? localPathD( cfg, w, h ) : null,
		shapeParams: cfg.shapeParams,
		radius: cfg.radius,
		cornerSmoothing: cfg.cornerSmoothing,
		sides: cfg.sides,
		innerRatio: cfg.innerRatio,
		fill: cfg.fill,
		stroke: cfg.stroke,
		strokeW: cfg.strokeW,
	};
}

/** A brand new shape layer, centred in the document. */
export function newShapeLayer( cfg, box, doc ) {
	const layer = makeShape( {
		name: shapeLabel( cfg ),
		x: Math.round( doc.w / 2 - box.w / 2 ),
		y: Math.round( doc.h / 2 - box.h / 2 ),
		w: box.w,
		h: box.h,
		shape: cfg.shape,
		...( cfg.pathD ? { pathD: localPathD( cfg, box.w, box.h ) } : {} ),
		shapeParams: cfg.shapeParams,
		radius: cfg.radius,
		sides: cfg.sides,
		fill: cfg.fill,
		stroke: cfg.stroke,
		strokeW: cfg.strokeW,
	} );
	if ( cfg.cornerSmoothing ) {
		layer.cornerSmoothing = cfg.cornerSmoothing;
	}
	if ( 0.45 !== cfg.innerRatio ) {
		layer.innerRatio = cfg.innerRatio;
	}
	return layer;
}

/**
 * What the shape TOOL has to remember so the next drag draws what the
 * panel shows. A path entry has no drag twin, so it leaves the tool
 * options alone.
 */
export function toolOptsPatch( cfg ) {
	return {
		shape: cfg.shape,
		shapeParams: cfg.shapeParams,
		radius: cfg.radius,
		cornerSmoothing: cfg.cornerSmoothing,
		sides: cfg.sides,
		innerRatio: cfg.innerRatio,
		stroke: cfg.stroke,
		strokeW: cfg.strokeW,
	};
}
