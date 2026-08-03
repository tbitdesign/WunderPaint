/**
 * DOM/SVG interaction overlays above the single canvas (spec 05.2):
 * selection box + handles, marching ants, crop overlay, pen anchors,
 * grid, smart guides, rulers, tip box. Never pixel-composited.
 */

import { Fragment, useState, useEffect } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { I } from '../../icons';
import { docToScreen, rulerStep } from './use-viewport';
import { selectionBounds } from '../../store/selection';
import { maskContours } from '../../lib/mask-contour';
import { createCanvas } from '../../lib/raster';
import { layerFootprint } from '../../lib/selection-units';
import { CORNERS, cornerRadii } from '../../lib/corner-radii';
import { polygonVertices, tangentInset } from '../../lib/corner-geometry';
import {
	hasGradientFill,
	gradientAxis,
	gradientStopPoints,
} from '../../lib/gradient-axis';
import { pivotLocal, hasPivot } from '../../lib/pivot';
import { textGrips } from '../../lib/text-grips';

/* ----------------------------- SelectionBox ----------------------------- */

const HANDLES = [ 'nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w' ];

// Corner-radius grips (v1.367). They sit INSIDE the frame at the radius
// they set, the way Figma and Illustrator place theirs, so the drag reads
// as "pull the corner in". Two numbers keep them usable:
//   - RADIUS_GRIP_MIN: at radius 0 a grip would sit exactly under the
//     resize handle it shares a corner with, and the resize handle (drawn
//     later, on top) would swallow every click. This inset keeps it clear.
//   - RADIUS_GRIP_ROOM: below this the box is too small for four extra
//     grips to be anything but clutter, so they stay away.
const RADIUS_GRIP_MIN = 14;
const RADIUS_GRIP_ROOM = 56;

// A shadow sitting at distance 0 has nowhere to put its grip; this is how
// far out it waits instead, in screen pixels.
const MIN_SHADOW_REACH = 26;

/** Which layers offer the four BOX corner grips: things shaped like a box. */
function roundableLayer( layer ) {
	if ( ! layer || layer.pathD ) {
		return false;
	}
	return (
		'image' === layer.type ||
		( 'shape' === layer.type &&
			( ! layer.shape || 'rect' === layer.shape ) )
	);
}

/** A polygon or star, whose corners sit on a ring rather than on the box. */
function ringLayer( layer ) {
	return (
		!! layer &&
		! layer.pathD &&
		'shape' === layer.type &&
		( 'polygon' === layer.shape || 'star' === layer.shape )
	);
}

/**
 * Grips for a polygon or a star: one that rounds every corner at once, and
 * on a star a second one that pulls the waist in or out.
 *
 * A polygon's corners are not the box corners, so the four box grips make
 * no sense here. The radius grip instead sits ON the first edge, exactly
 * where the rounding starts eating into it - drag it along the edge and
 * the corner opens up. That is the same promise the box grips make: the
 * thing you hold is the thing you are setting.
 *
 * @param {Object} layer The single selected layer.
 * @param {Object} box   Selection box in doc space.
 * @param {number} zoom  Current zoom.
 * @return {Object[]|null} [ { kind, left, top } ] or null.
 */
export function ringGrips( layer, box, zoom ) {
	if (
		! ringLayer( layer ) ||
		box.w * zoom < RADIUS_GRIP_ROOM ||
		box.h * zoom < RADIUS_GRIP_ROOM
	) {
		return null;
	}
	const pts = polygonVertices(
		layer.shape,
		box.w,
		box.h,
		layer.sides || ( 'star' === layer.shape ? 5 : 6 ),
		layer.innerRatio
	);
	const out = [];
	const v0 = pts[ 0 ];
	const v1 = pts[ 1 % pts.length ];
	const edge = Math.hypot( v1.x - v0.x, v1.y - v0.y ) || 1;
	const d = Math.min(
		Math.max(
			tangentInset( pts, 0, layer.radius ),
			RADIUS_GRIP_MIN / zoom
		),
		edge / 2
	);
	out.push( {
		kind: 'ringRadius',
		cls: 'ring-radius',
		left: ( v0.x + ( ( v1.x - v0.x ) / edge ) * d ) * zoom,
		top: ( v0.y + ( ( v1.y - v0.y ) / edge ) * d ) * zoom,
	} );
	if ( 'star' === layer.shape && pts.length > 1 ) {
		out.push( {
			kind: 'starWaist',
			cls: 'star-waist',
			left: pts[ 1 ].x * zoom,
			top: pts[ 1 ].y * zoom,
		} );
	}
	return out;
}

/**
 * Screen offsets for the four grips inside a selection frame.
 *
 * @param {Object} layer The single selected layer.
 * @param {Object} box   Selection box in doc space.
 * @param {number} zoom  Current zoom.
 * @return {Object[]|null} [ { corner, left, top, radius } ] or null.
 */
export function radiusGrips( layer, box, zoom ) {
	if (
		! roundableLayer( layer ) ||
		box.w * zoom < RADIUS_GRIP_ROOM ||
		box.h * zoom < RADIUS_GRIP_ROOM
	) {
		return null;
	}
	const radii = cornerRadii( layer.radius, box.w, box.h );
	// Never past the middle of the frame: on a small box four grips at the
	// minimum inset would otherwise cross and swap sides.
	const limit = Math.min( box.w * zoom, box.h * zoom ) / 2 - 2;
	return CORNERS.map( ( corner, i ) => {
		const inset = Math.min(
			Math.max( radii[ i ] * zoom, RADIUS_GRIP_MIN ),
			limit
		);
		return {
			corner,
			radius: radii[ i ],
			left:
				'tl' === corner || 'bl' === corner
					? inset
					: box.w * zoom - inset,
			top:
				'tl' === corner || 'tr' === corner
					? inset
					: box.h * zoom - inset,
		};
	} );
}

/**
 * Layer styles that are placed by an angle and a distance. All three share
 * the same two numbers, so one grip serves whichever is switched on; the
 * drop shadow wins when several are, because it is the one people move.
 */
const THROWN_STYLES = [ 'dropShadow', 'innerShadow', 'gradientOverlay' ];

/**
 * The style a shadow grip would control, or null.
 *
 * @param {Object} layer Any layer.
 * @return {?Object} { key, angle, distance }.
 */
export function thrownStyle( layer ) {
	const st = layer && layer.styles;
	if ( ! st ) {
		return null;
	}
	for ( const key of THROWN_STYLES ) {
		const v = st[ key ];
		if ( v && ( undefined !== v.angle || undefined !== v.distance ) ) {
			return {
				key,
				angle: v.angle ?? ( 'gradientOverlay' === key ? 90 : 120 ),
				distance: v.distance || 0,
			};
		}
	}
	return null;
}

/**
 * Where the shadow grip sits: at the shadow's own offset from the layer
 * centre, which is exactly where the shadow is. Drag it and the shadow
 * follows the pointer, instead of being typed as an angle and a distance
 * in two number fields that give no hint which way 120 degrees points.
 *
 * @param {Object} layer The single selected layer.
 * @param {Object} box   Selection box in doc space.
 * @param {number} zoom  Current zoom.
 * @return {?Object} { left, top, key } or null.
 */
export function shadowGrip( layer, box, zoom ) {
	const st = thrownStyle( layer );
	if ( ! st ) {
		return null;
	}
	const rad = ( st.angle * Math.PI ) / 180;
	// A shadow at distance 0 would hide under the centre of the layer, so
	// the grip keeps a minimum reach and simply reports 0 back.
	const reach = Math.max( st.distance, MIN_SHADOW_REACH / zoom );
	return {
		key: st.key,
		left: ( box.w / 2 + Math.cos( rad ) * reach ) * zoom,
		top: ( box.h / 2 + Math.sin( rad ) * reach ) * zoom,
	};
}

/**
 * The gradient's axis drawn on the artwork: a line from start to end, a
 * grip at the end that swings the angle, and one dot per colour stop that
 * slides along it. Lives INSIDE the rotated selection frame, so a rotated
 * layer's gradient handles rotate with it without any maths of their own.
 *
 * @param {Object}   props              Component props.
 * @param {Object}   props.layer        The gradient-filled layer.
 * @param {number}   props.zoom         Current zoom.
 * @param {Function} props.onHandleDown Starts a handle gesture.
 */
function GradientHandles( { layer, zoom, onHandleDown } ) {
	const { a, b, radial } = gradientAxis( layer );
	const stops = gradientStopPoints( layer );
	const w = ( layer.w || 1 ) * zoom;
	const h = ( layer.h || 1 ) * zoom;
	return (
		<>
			<svg
				className="grad-axis"
				width={ w }
				height={ h }
				viewBox={ `0 0 ${ w } ${ h }` }
			>
				<line
					x1={ a.x * zoom }
					y1={ a.y * zoom }
					x2={ b.x * zoom }
					y2={ b.y * zoom }
					stroke="#fff"
					strokeWidth="3"
					strokeOpacity="0.55"
				/>
				<line
					x1={ a.x * zoom }
					y1={ a.y * zoom }
					x2={ b.x * zoom }
					y2={ b.y * zoom }
					stroke="currentColor"
					strokeWidth="1.5"
				/>
			</svg>
			{ stops.map( ( s ) => (
				<div
					key={ s.index }
					className="layer-handle grad-stop"
					style={ {
						left: s.x * zoom,
						top: s.y * zoom,
						background: s.color,
					} }
					title={ __(
						'Drag along the axis to move this colour stop',
						'wunderpaint'
					) }
					onPointerDown={ ( e ) => e.stopPropagation() }
					onMouseDown={ ( e ) => {
						e.stopPropagation();
						onHandleDown( layer, 'gradStop', String( s.index ), e );
					} }
				/>
			) ) }
			<div
				className="layer-handle grad-angle"
				style={ { left: b.x * zoom, top: b.y * zoom } }
				title={
					radial
						? __(
								'Drag to turn the gradient - Shift snaps to 15°',
								'wunderpaint'
						  )
						: __(
								'Drag to aim the gradient - Shift snaps to 15°',
								'wunderpaint'
						  )
				}
				onPointerDown={ ( e ) => e.stopPropagation() }
				onMouseDown={ ( e ) => {
					e.stopPropagation();
					onHandleDown( layer, 'gradAngle', 'grad', e );
				} }
			/>
		</>
	);
}

// Resize cursors follow the ROTATED box (v1.130.0): on a 90°-rotated
// layer the handle that visually sits right used to show the up/down
// cursor. Base axis angle per handle + layer rotation, bucketed to 45°.
const RESIZE_CURSORS = [
	'ew-resize',
	'nwse-resize',
	'ns-resize',
	'nesw-resize',
];
const HANDLE_BASE = {
	e: 0,
	w: 0,
	se: 45,
	nw: 45,
	s: 90,
	n: 90,
	sw: 135,
	ne: 135,
};
const handleCursor = ( handle, rot ) =>
	RESIZE_CURSORS[
		Math.round(
			( ( ( ( HANDLE_BASE[ handle ] + rot ) % 180 ) + 180 ) % 180 ) / 45
		) % 4
	];

// Resolve a group to its non-group leaf layers (recursively).
const leavesOf = ( layers, group ) => {
	const out = [];
	const walk = ( g ) =>
		( g.children || [] ).forEach( ( id ) => {
			const child = layers.find( ( l ) => l.id === id );
			if ( ! child ) {
				return;
			}
			if ( 'group' === child.type ) {
				walk( child );
			} else {
				out.push( child );
			}
		} );
	walk( group );
	return out;
};

/**
 * Selection box in document coords. A single non-group layer keeps its
 * rotation; a group or multi-selection is the axis-aligned union of leaves.
 *
 * @param {Array} layers All layers.
 * @param {Array} ids    Selected layer ids.
 * @return {Object|null} { x, y, w, h, rot, single } or null when empty.
 */
export function selectionBox( layers, ids ) {
	const selectedRoots = layers.filter( ( l ) => ids.includes( l.id ) );
	const selected = selectedRoots.flatMap( ( l ) =>
		'group' === l.type ? leavesOf( layers, l ) : [ l ]
	);
	if ( ! selected.length ) {
		return null;
	}
	const single =
		1 === selected.length && ids.includes( selected[ 0 ].id )
			? selected[ 0 ]
			: null;
	if ( single ) {
		return {
			x: single.x,
			y: single.y,
			w: single.w,
			h: single.h,
			rot: single.rot || 0,
			single,
			groupSingle: null,
		};
	}
	// Union over FOOTPRINTS (v1.130.0): rotated leaves cover more canvas
	// than their stored box - raw boxes put the frame beside the artwork.
	const boxes = selected.map( layerFootprint );
	const minX = Math.min( ...boxes.map( ( b ) => b.x ) );
	const minY = Math.min( ...boxes.map( ( b ) => b.y ) );
	return {
		x: minX,
		y: minY,
		w: Math.max( ...boxes.map( ( b ) => b.x + b.w ) ) - minX,
		h: Math.max( ...boxes.map( ( b ) => b.y + b.h ) ) - minY,
		rot: 0,
		single: null,
		// A single selected GROUP gets corner handles: dragging them scales
		// the whole unit uniformly (v1.66.2).
		groupSingle:
			1 === selectedRoots.length &&
			'group' === selectedRoots[ 0 ].type &&
			! selectedRoots[ 0 ].locked
				? selectedRoots[ 0 ]
				: null,
	};
}

/**
 * The four canvas-edge gap measurements (left/right/top/bottom) for a box —
 * shown while moving a layer so you can read its distance to each edge.
 *
 * @param {Object} box  { x, y, w, h }.
 * @param {number} docW Document width.
 * @param {number} docH Document height.
 * @return {Array} DistanceLabels rects.
 */
export function canvasEdgeRects( box, docW, docH ) {
	const cx = box.x + box.w / 2;
	const cy = box.y + box.h / 2;
	return [
		{ line: { x1: 0, y1: cy, x2: box.x, y2: cy }, value: box.x },
		{
			line: { x1: box.x + box.w, y1: cy, x2: docW, y2: cy },
			value: docW - box.x - box.w,
		},
		{ line: { x1: cx, y1: 0, x2: cx, y2: box.y }, value: box.y },
		{
			line: { x1: cx, y1: box.y + box.h, x2: cx, y2: docH },
			value: docH - box.y - box.h,
		},
	];
}

export function SelectionBox( {
	layers,
	ids,
	zoom,
	pan,
	onHandleDown,
	rotating,
} ) {
	const box = selectionBox( layers, ids );
	if ( ! box ) {
		return null;
	}
	const single = box.single;
	const screen = docToScreen( box, pan, zoom );
	// A line shape gets its two endpoint handles instead of the eight
	// resize handles (v1.299): dragging an end re-aims the line directly.
	const isLine = single && 'shape' === single.type && 'line' === single.shape;
	const lineEnds = isLine
		? {
				p1: single.lineFlip
					? { x: 0, y: box.h * zoom }
					: { x: 0, y: 0 },
				p2: single.lineFlip
					? { x: box.w * zoom, y: 0 }
					: { x: box.w * zoom, y: box.h * zoom },
		  }
		: null;
	// The size badge lives in SCREEN space below the rotated box's
	// footprint: inside the rotated frame its counter-rotated pill swung
	// over the rotate handle at ~90° and blocked it (v1.299 fix).
	const rad = ( ( box.rot || 0 ) * Math.PI ) / 180;
	const halfH =
		( ( Math.abs( Math.sin( rad ) ) * box.w +
			Math.abs( Math.cos( rad ) ) * box.h ) /
			2 ) *
		zoom;
	const badge = {
		left: screen.x + ( box.w * zoom ) / 2,
		top: screen.y + ( box.h * zoom ) / 2 + halfH + 34,
	};
	return (
		<>
			<div
				className="layer-selection"
				style={ {
					left: screen.x,
					top: screen.y,
					width: box.w * zoom,
					height: box.h * zoom,
					transform: `rotate(${ box.rot }deg)`,
					transformOrigin: 'center',
				} }
			>
				{ single &&
					! isLine &&
					HANDLES.map( ( handle ) => (
						<div
							key={ handle }
							className={ `layer-handle ${ handle }` }
							style={
								box.rot
									? {
											cursor: handleCursor(
												handle,
												box.rot
											),
									  }
									: undefined
							}
							onPointerDown={ ( e ) => e.stopPropagation() }
							onMouseDown={ ( e ) => {
								e.stopPropagation();
								onHandleDown( single, 'resize', handle, e );
							} }
						/>
					) ) }
				{ single &&
					! isLine &&
					( radiusGrips( single, box, zoom ) || [] ).map( ( g ) => (
						<div
							key={ g.corner }
							className="layer-handle radius-grip"
							style={ { left: g.left, top: g.top } }
							title={ __(
								'Drag to round the corners · Alt = this corner only',
								'wunderpaint'
							) }
							onPointerDown={ ( e ) => e.stopPropagation() }
							onMouseDown={ ( e ) => {
								e.stopPropagation();
								onHandleDown( single, 'radius', g.corner, e );
							} }
						/>
					) ) }
				{ single &&
					( textGrips( single, zoom ) || [] ).map( ( g ) => (
						<div
							key={ g.kind }
							className={ `layer-handle text-grip ${ g.cls }` }
							style={ {
								left: g.x * zoom,
								top: g.y * zoom,
								cursor: g.cursor,
							} }
							title={
								'textWidth' === g.kind
									? __(
											'Drag to set the line width - the type keeps its size and the lines wrap',
											'wunderpaint'
									  )
									: 'textLeading' === g.kind
									? __(
											'Drag down for more space between lines',
											'wunderpaint'
									  )
									: __(
											'Drag right to space the letters out',
											'wunderpaint'
									  )
							}
							onPointerDown={ ( e ) => e.stopPropagation() }
							onMouseDown={ ( e ) => {
								e.stopPropagation();
								onHandleDown( single, g.kind, g.kind, e );
							} }
						>
							{ I[ g.icon ]
								? I[ g.icon ]( { size: 14, sw: 2.6 } )
								: null }
						</div>
					) ) }
				{ single &&
					( () => {
						const p = pivotLocal( single );
						return (
							<div
								className={ `layer-handle pivot-grip${
									hasPivot( single ) ? ' is-set' : ''
								}` }
								style={ {
									left: p.x * zoom,
									top: p.y * zoom,
								} }
								title={ __(
									'Drag to move the point this layer turns around · double-click to centre it',
									'wunderpaint'
								) }
								onPointerDown={ ( e ) => e.stopPropagation() }
								onDoubleClick={ ( e ) => {
									e.stopPropagation();
									onHandleDown(
										single,
										'pivotReset',
										'pivot',
										e
									);
								} }
								onMouseDown={ ( e ) => {
									e.stopPropagation();
									onHandleDown( single, 'pivot', 'pivot', e );
								} }
							/>
						);
					} )() }
				{ single &&
					( () => {
						const g = shadowGrip( single, box, zoom );
						return g ? (
							<div
								className="layer-handle shadow-grip"
								style={ { left: g.left, top: g.top } }
								title={ __(
									'Drag to throw the shadow - Shift snaps to 15°',
									'wunderpaint'
								) }
								onPointerDown={ ( e ) => e.stopPropagation() }
								onMouseDown={ ( e ) => {
									e.stopPropagation();
									onHandleDown( single, 'shadow', g.key, e );
								} }
							/>
						) : null;
					} )() }
				{ single && hasGradientFill( single ) && (
					<GradientHandles
						layer={ single }
						zoom={ zoom }
						onHandleDown={ onHandleDown }
					/>
				) }
				{ single &&
					! isLine &&
					( ringGrips( single, box, zoom ) || [] ).map( ( g ) => (
						<div
							key={ g.kind }
							className={ `layer-handle radius-grip ${ g.cls }` }
							style={ { left: g.left, top: g.top } }
							title={
								'starWaist' === g.kind
									? __(
											'Drag to set how deep the star is cut',
											'wunderpaint'
									  )
									: __(
											'Drag along the edge to round every corner',
											'wunderpaint'
									  )
							}
							onPointerDown={ ( e ) => e.stopPropagation() }
							onMouseDown={ ( e ) => {
								e.stopPropagation();
								onHandleDown( single, g.kind, g.kind, e );
							} }
						/>
					) ) }
				{ box.groupSingle &&
					[ 'nw', 'ne', 'se', 'sw' ].map( ( handle ) => (
						<div
							key={ handle }
							className={ `layer-handle ${ handle }` }
							title={ __(
								'Drag to scale the group',
								'wunderpaint'
							) }
							onPointerDown={ ( e ) => e.stopPropagation() }
							onMouseDown={ ( e ) => {
								e.stopPropagation();
								onHandleDown(
									box.groupSingle,
									'resize',
									handle,
									e
								);
							} }
						/>
					) ) }
				{ isLine &&
					[ 'p1', 'p2' ].map( ( end ) => (
						<div
							key={ end }
							className="layer-handle line-end"
							style={ {
								left: lineEnds[ end ].x,
								top: lineEnds[ end ].y,
							} }
							title={ __(
								'Drag to move this line end · Shift snaps to 45°',
								'wunderpaint'
							) }
							onPointerDown={ ( e ) => e.stopPropagation() }
							onMouseDown={ ( e ) => {
								e.stopPropagation();
								onHandleDown( single, 'lineEnd', end, e );
							} }
						/>
					) ) }
				{ single && (
					<div
						className="layer-rotate"
						title={ __(
							'Drag to rotate · snaps to 15° steps · Alt = free',
							'wunderpaint'
						) }
						onPointerDown={ ( e ) => e.stopPropagation() }
						onMouseDown={ ( e ) => {
							e.stopPropagation();
							onHandleDown( single, 'rotate', 'rot', e );
						} }
					/>
				) }
				{ box.groupSingle && (
					<div
						className="layer-rotate"
						title={ __(
							'Drag to rotate the group · snaps to 15° steps · Alt = free',
							'wunderpaint'
						) }
						onPointerDown={ ( e ) => e.stopPropagation() }
						onMouseDown={ ( e ) => {
							e.stopPropagation();
							onHandleDown( box.groupSingle, 'rotate', 'rot', e );
						} }
					/>
				) }
			</div>
			{ /* Live size readout (v1.19), e.g. "80 × 26 px" — in screen
		     space below the rotated footprint since v1.299. */ }
			<div
				className="sel-size"
				style={ {
					left: badge.left,
					top: badge.top,
					transform: 'translateX(-50%)',
				} }
			>
				{ rotating
					? `${ Math.round( ( ( box.rot % 360 ) + 360 ) % 360 ) }°`
					: `${ Math.round( box.w ) } × ${ Math.round( box.h ) } px` }
			</div>
		</>
	);
}

/* ---------------------------- Marching ants ----------------------------- */

// Red highlight over the selected pixels (v1.127.0) - the classic mask
// tint, cached per mask canvas since toDataURL is not free.
const tintCache = new WeakMap();
const maskTintUrl = ( canvas ) => {
	if ( ! canvas ) {
		return '';
	}
	let url = tintCache.get( canvas );
	if ( ! url ) {
		const tinted = createCanvas( canvas.width, canvas.height );
		const ctx = tinted.getContext( '2d' );
		ctx.drawImage( canvas, 0, 0 );
		ctx.globalCompositeOperation = 'source-in';
		ctx.fillStyle = '#ff2d55';
		ctx.fillRect( 0, 0, tinted.width, tinted.height );
		url = tinted.toDataURL ? tinted.toDataURL() : '';
		tintCache.set( canvas, url );
	}
	return url;
};

const selectionToSvgShapes = ( sel, toScreen, tint ) => {
	if ( ! sel ) {
		return [];
	}
	if ( 'rect' === sel.kind ) {
		const a = toScreen( { x: sel.x, y: sel.y } );
		return [ { type: 'rect', x: a.x, y: a.y, w: sel.w, h: sel.h } ];
	}
	if ( 'poly' === sel.kind ) {
		return [ { type: 'poly', points: sel.points.map( toScreen ) } ];
	}
	if ( 'mask' === sel.kind ) {
		// Real outline along the mask edge (v1.127.0): before, a mask
		// selection showed only its bounding RECTANGLE - a circle got a
		// square - plus a barely visible white overlay.
		const loops = maskContours( sel.canvas );
		const shapes = loops.map( ( pts ) => ( {
			type: 'poly',
			points: pts.map( toScreen ),
		} ) );
		if ( ! shapes.length ) {
			const b = sel.bounds || { x: 0, y: 0, w: 0, h: 0 };
			const a = toScreen( b );
			shapes.push( { type: 'rect', x: a.x, y: a.y, w: b.w, h: b.h } );
		}
		if ( tint ) {
			shapes.unshift( {
				type: 'tint',
				canvas: sel.canvas,
				at: toScreen( { x: 0, y: 0 } ),
			} );
		}
		return shapes;
	}
	if ( 'combo' === sel.kind ) {
		return sel.ops.flatMap( ( { sel: part, op } ) =>
			selectionToSvgShapes( part, toScreen, tint ).map( ( s ) => ( {
				...s,
				subtract: 'subtract' === op,
			} ) )
		);
	}
	return [];
};

/**
 * Faint frame around the unit a click would select right now
 * (v1.365.0): the pixel-accurate hit test is invisible until you click
 * without it. Renders the unit's union box (groups included).
 */
export function HoverOutline( { layers, id, zoom, pan } ) {
	const box = selectionBox( layers, [ id ] );
	if ( ! box ) {
		return null;
	}
	const screen = docToScreen( box, pan, zoom );
	return (
		<div
			className="hover-outline"
			style={ {
				left: screen.x,
				top: screen.y,
				width: box.w * zoom,
				height: box.h * zoom,
				transform: `rotate(${ box.rot || 0 }deg)`,
				transformOrigin: 'center',
			} }
		/>
	);
}

/**
 * Dashed frame around the layer a dragged file will replace or fill
 * (v1.363.0), so the target is visible BEFORE letting go.
 */
export function DropHint( { layer, zoom, pan } ) {
	const screen = docToScreen( layer, pan, zoom );
	return (
		<div
			className="drop-hint"
			style={ {
				left: screen.x,
				top: screen.y,
				width: layer.w * zoom,
				height: layer.h * zoom,
				transform: `rotate(${ layer.rot || 0 }deg)`,
				transformOrigin: 'center',
			} }
		/>
	);
}

export function MarchingAnts( { selection, draft, zoom, pan, tint } ) {
	const toScreen = ( p ) => docToScreen( p, pan, zoom );
	const shapes = selectionToSvgShapes( selection, toScreen, tint );

	// In-progress marquee/lasso drafts get ants too.
	if ( draft && 'marquee' === draft.kind && draft.rect.w > 1 ) {
		const a = toScreen( draft.rect );
		shapes.push( {
			type: 'rect',
			x: a.x,
			y: a.y,
			w: draft.rect.w,
			h: draft.rect.h,
			draft: true,
		} );
	}
	if ( draft && 'lasso' === draft.kind && draft.points.length > 1 ) {
		shapes.push( {
			type: 'poly',
			points: draft.points.map( toScreen ),
			draft: true,
		} );
	}
	if ( ! shapes.length ) {
		return null;
	}

	return (
		<svg className="ed-overlay ants" width="100%" height="100%">
			{ shapes.map( ( shape, i ) => {
				// Two passes: a solid light underlay + dark moving dashes —
				// the classic alternating ants stay visible on any background.
				const common = {
					className: 'ants-dash',
					style: shape.subtract
						? { stroke: 'var(--danger)' }
						: undefined,
				};
				const under = { className: 'ants-under' };
				if ( 'tint' === shape.type ) {
					return (
						<image
							key={ i }
							href={ maskTintUrl( shape.canvas ) }
							x={ shape.at.x }
							y={ shape.at.y }
							width={ ( shape.canvas?.width || 0 ) * zoom }
							height={ ( shape.canvas?.height || 0 ) * zoom }
							opacity="0.25"
							style={ { pointerEvents: 'none' } }
						/>
					);
				}
				if ( 'rect' === shape.type ) {
					const box = {
						x: shape.x,
						y: shape.y,
						width: shape.w * zoom,
						height: shape.h * zoom,
					};
					return (
						<g key={ i }>
							<rect { ...under } { ...box } />
							<rect { ...common } { ...box } />
						</g>
					);
				}
				const points = shape.points
					.map( ( p ) => `${ p.x },${ p.y }` )
					.join( ' ' );
				return (
					<g key={ i }>
						<polygon { ...under } points={ points } />
						<polygon { ...common } points={ points } />
					</g>
				);
			} ) }
		</svg>
	);
}

/* --------------------------- Smart Select points ------------------------ */

// The clicked seed points while refining a Smart Select mask (v1.27), so you
// can see where you've placed points. Stored on the selection in doc coords.
export function SmartPoints( { selection, tool, zoom, pan } ) {
	if (
		'smartselect' !== tool ||
		'smart' !== selection?.source ||
		! selection.points?.length
	) {
		return null;
	}
	return (
		<svg
			className="ed-overlay"
			width="100%"
			height="100%"
			style={ { pointerEvents: 'none' } }
		>
			{ selection.points.map( ( pt, i ) => {
				const s = docToScreen( pt, pan, zoom );
				const neg = 0 === pt.label;
				const color = neg ? 'var(--danger)' : 'var(--accent)';
				return (
					<g key={ i }>
						<circle
							cx={ s.x }
							cy={ s.y }
							r={ 6 }
							fill="#fff"
							stroke={ color }
							strokeWidth={ 2 }
						/>
						<line
							x1={ s.x - 3 }
							y1={ s.y }
							x2={ s.x + 3 }
							y2={ s.y }
							stroke={ color }
							strokeWidth={ 2 }
						/>
						{ ! neg && (
							<line
								x1={ s.x }
								y1={ s.y - 3 }
								x2={ s.x }
								y2={ s.y + 3 }
								stroke={ color }
								strokeWidth={ 2 }
							/>
						) }
					</g>
				);
			} ) }
		</svg>
	);
}

/* ------------------------------ Crop overlay ---------------------------- */

export function CropOverlay( {
	crop,
	zoom,
	pan,
	areaW,
	areaH,
	onHandleDown,
	onRectDown,
	onRectDblClick,
} ) {
	if ( ! crop || crop.w < 1 || crop.h < 1 ) {
		return null;
	}
	const a = docToScreen( crop, pan, zoom );
	const w = crop.w * zoom;
	const h = crop.h * zoom;
	return (
		<div className="crop-overlay">
			{ /* Darkened outside (4 shades). */ }
			<div
				className="crop-shade"
				style={ {
					left: 0,
					top: 0,
					width: areaW,
					height: Math.max( 0, a.y ),
				} }
			/>
			<div
				className="crop-shade"
				style={ {
					left: 0,
					top: a.y + h,
					width: areaW,
					height: Math.max( 0, areaH - a.y - h ),
				} }
			/>
			<div
				className="crop-shade"
				style={ {
					left: 0,
					top: a.y,
					width: Math.max( 0, a.x ),
					height: h,
				} }
			/>
			<div
				className="crop-shade"
				style={ {
					left: a.x + w,
					top: a.y,
					width: Math.max( 0, areaW - a.x - w ),
					height: h,
				} }
			/>
			<div
				className="crop-rect"
				style={ { left: a.x, top: a.y, width: w, height: h } }
				onPointerDown={ ( e ) => {
					// The canvas listens on pointerdown, stop it here or a
					// new crop draft starts instead of moving this one.
					e.stopPropagation();
					onRectDown?.( e );
				} }
				onMouseDown={ ( e ) => e.stopPropagation() }
				onDoubleClick={ ( e ) => {
					e.stopPropagation();
					onRectDblClick?.();
				} }
			>
				{ /* Rule of thirds. */ }
				<div
					className="third"
					style={ { top: '33.33%', left: 0, right: 0, height: 1 } }
				/>
				<div
					className="third"
					style={ { top: '66.66%', left: 0, right: 0, height: 1 } }
				/>
				<div
					className="third"
					style={ { left: '33.33%', top: 0, bottom: 0, width: 1 } }
				/>
				<div
					className="third"
					style={ { left: '66.66%', top: 0, bottom: 0, width: 1 } }
				/>
				{ [ 'nw', 'ne', 'se', 'sw' ].map( ( corner ) => (
					<div
						key={ corner }
						className="crop-handle"
						style={ {
							left: corner.includes( 'w' ) ? -5 : undefined,
							right: corner.includes( 'e' ) ? -5 : undefined,
							top: corner.includes( 'n' ) ? -5 : undefined,
							bottom: corner.includes( 's' ) ? -5 : undefined,
							cursor:
								'nw' === corner || 'se' === corner
									? 'nwse-resize'
									: 'nesw-resize',
						} }
						onPointerDown={ ( e ) => {
							e.stopPropagation();
							onHandleDown( corner, e );
						} }
						onMouseDown={ ( e ) => e.stopPropagation() }
					/>
				) ) }
			</div>
		</div>
	);
}

/* ------------------------------ Pen overlay ----------------------------- */

export function PenOverlay( { draft, zoom, pan, onFinalize } ) {
	if ( ! draft || 'pen' !== draft.kind || ! draft.anchors.length ) {
		return null;
	}
	const toScreen = ( p ) => docToScreen( p, pan, zoom );
	const points = draft.anchors.map( toScreen );
	let d = `M ${ points[ 0 ].x } ${ points[ 0 ].y }`;
	for ( let i = 1; i < draft.anchors.length; i++ ) {
		const prev = draft.anchors[ i - 1 ];
		const cur = draft.anchors[ i ];
		if ( prev.hOut || cur.hIn ) {
			const c1 = toScreen( prev.hOut || prev );
			const c2 = toScreen( cur.hIn || cur );
			const cp = toScreen( cur );
			d += ` C ${ c1.x } ${ c1.y } ${ c2.x } ${ c2.y } ${ cp.x } ${ cp.y }`;
		} else {
			const cp = toScreen( cur );
			d += ` L ${ cp.x } ${ cp.y }`;
		}
	}
	const last = points[ points.length - 1 ];

	return (
		<Fragment>
			<svg className="ed-overlay" width="100%" height="100%">
				<path className="pen-path" d={ d } />
				{ draft.anchors.map( ( anchor, i ) => {
					const p = points[ i ];
					return (
						<Fragment key={ i }>
							{ anchor.hOut && (
								<line
									className="pen-handle-line"
									x1={ p.x }
									y1={ p.y }
									x2={ toScreen( anchor.hOut ).x }
									y2={ toScreen( anchor.hOut ).y }
								/>
							) }
							{ anchor.hIn && (
								<line
									className="pen-handle-line"
									x1={ p.x }
									y1={ p.y }
									x2={ toScreen( anchor.hIn ).x }
									y2={ toScreen( anchor.hIn ).y }
								/>
							) }
							{ anchor.hOut && (
								<circle
									className="pen-handle"
									cx={ toScreen( anchor.hOut ).x }
									cy={ toScreen( anchor.hOut ).y }
									r={ 3 }
								/>
							) }
							{ anchor.hIn && (
								<circle
									className="pen-handle"
									cx={ toScreen( anchor.hIn ).x }
									cy={ toScreen( anchor.hIn ).y }
									r={ 3 }
								/>
							) }
							<rect
								className="pen-anchor"
								x={ p.x - 3.5 }
								y={ p.y - 3.5 }
								width={ 7 }
								height={ 7 }
							/>
						</Fragment>
					);
				} ) }
			</svg>
			{ draft.finalizing && (
				<div
					className="ctx-menu"
					style={ {
						left: last.x + 10,
						top: last.y + 10,
						pointerEvents: 'auto',
					} }
					onPointerDown={ ( e ) => e.stopPropagation() }
					onMouseDown={ ( e ) => e.stopPropagation() }
				>
					<button onClick={ () => onFinalize( 'stroke' ) }>
						{ I.pen( { size: 13 } ) }{ ' ' }
						{ __( 'Stroke Path', 'wunderpaint' ) }
					</button>
					<button onClick={ () => onFinalize( 'fill' ) }>
						{ I.bucket( { size: 13 } ) }{ ' ' }
						{ __( 'Fill Path', 'wunderpaint' ) }
					</button>
					<div className="divider" />
					<button onClick={ () => onFinalize( null ) }>
						{ __( 'Cancel', 'wunderpaint' ) }
					</button>
				</div>
			) }
		</Fragment>
	);
}

/* ------------------------------ Grid + guides --------------------------- */

export function GridOverlay( { doc, zoom, pan, size = 50 } ) {
	const origin = docToScreen( { x: 0, y: 0 }, pan, zoom );
	const lines = [];
	// Minor lines at 1/5 spacing, skipped when they would be <4px apart.
	const minor = Math.max( 1, Math.round( size / 5 ) );
	const step = minor * zoom >= 4 ? minor : size;
	for ( let gx = 0; gx <= doc.w; gx += step ) {
		lines.push(
			<line
				key={ 'v' + gx }
				x1={ origin.x + gx * zoom }
				y1={ origin.y }
				x2={ origin.x + gx * zoom }
				y2={ origin.y + doc.h * zoom }
				stroke={
					gx % size === 0 ? 'var(--accent)' : 'var(--ed-border)'
				}
				strokeOpacity={ gx % size === 0 ? 0.35 : 0.25 }
				strokeWidth={ 1 }
			/>
		);
	}
	for ( let gy = 0; gy <= doc.h; gy += step ) {
		lines.push(
			<line
				key={ 'h' + gy }
				x1={ origin.x }
				y1={ origin.y + gy * zoom }
				x2={ origin.x + doc.w * zoom }
				y2={ origin.y + gy * zoom }
				stroke={
					gy % size === 0 ? 'var(--accent)' : 'var(--ed-border)'
				}
				strokeOpacity={ gy % size === 0 ? 0.35 : 0.25 }
				strokeWidth={ 1 }
			/>
		);
	}
	return (
		<svg className="ed-overlay grid-overlay" width="100%" height="100%">
			{ lines }
		</svg>
	);
}

export function SmartGuides( { guides, zoom, pan, areaW, areaH } ) {
	return (
		<Fragment>
			{ guides.map( ( guide, i ) =>
				'v' === guide.axis ? (
					<div
						key={ i }
						className="smart-guide"
						style={ {
							left: guide.pos * zoom + pan.x,
							top: 0,
							width: 1,
							height: areaH,
						} }
					/>
				) : (
					<div
						key={ i }
						className="smart-guide"
						style={ {
							top: guide.pos * zoom + pan.y,
							left: 0,
							height: 1,
							width: areaW,
						} }
					/>
				)
			) }
		</Fragment>
	);
}

export function GuidesOverlay( { guides, zoom, pan, areaW, areaH } ) {
	return (
		<Fragment>
			{ ( guides || [] ).map( ( guide, i ) =>
				'v' === guide.axis ? (
					<div
						key={ i }
						style={ {
							position: 'absolute',
							left: guide.pos * zoom + pan.x,
							top: 0,
							width: 1,
							height: areaH,
							background: '#06b6d4',
							opacity: 0.8,
							pointerEvents: 'none',
						} }
					/>
				) : (
					<div
						key={ i }
						style={ {
							position: 'absolute',
							top: guide.pos * zoom + pan.y,
							left: 0,
							height: 1,
							width: areaW,
							background: '#06b6d4',
							opacity: 0.8,
							pointerEvents: 'none',
						} }
					/>
				)
			) }
		</Fragment>
	);
}

/* --------------------------------- Rulers ------------------------------- */

export function Rulers( { doc, zoom, pan, cursor, onStartGuide } ) {
	const step = rulerStep( zoom );
	const hTicks = [];
	const vTicks = [];
	for ( let i = 0; i <= doc.w; i += step ) {
		hTicks.push(
			<div
				key={ i }
				style={ {
					position: 'absolute',
					left: i * zoom + pan.x - 16,
					top: 2,
					pointerEvents: 'none',
				} }
			>
				{ i }
			</div>
		);
	}
	for ( let i = 0; i <= doc.h; i += step ) {
		vTicks.push(
			<div
				key={ i }
				style={ {
					position: 'absolute',
					top: i * zoom + pan.y - 16,
					left: 2,
					pointerEvents: 'none',
					writingMode: 'vertical-rl',
					transform: 'rotate(180deg)',
				} }
			>
				{ i }
			</div>
		);
	}
	return (
		<Fragment>
			<div className="ed-ruler-corner" />
			<div
				className="ed-ruler h"
				role="presentation"
				style={ { cursor: 'row-resize' } }
				onMouseDown={ ( e ) => onStartGuide?.( 'h', e ) }
			>
				{ hTicks }
				{ cursor && (
					<div
						style={ {
							position: 'absolute',
							left: cursor.x,
							top: 0,
							bottom: 0,
							width: 1,
							background: 'var(--accent)',
						} }
					/>
				) }
			</div>
			<div
				className="ed-ruler v"
				role="presentation"
				style={ { cursor: 'col-resize' } }
				onMouseDown={ ( e ) => onStartGuide?.( 'v', e ) }
			>
				{ vTicks }
				{ cursor && (
					<div
						style={ {
							position: 'absolute',
							top: cursor.y,
							left: 0,
							right: 0,
							height: 1,
							background: 'var(--accent)',
						} }
					/>
				) }
			</div>
		</Fragment>
	);
}

/* --------------------------------- Tip box ------------------------------ */

export function TipBox( { tool, opts, fg, selection } ) {
	const tips = {
		move: __(
			'Click any layer to select · drag to move · hold Space to pan',
			'wunderpaint'
		),
		select: __(
			'Click picks the exact element, even inside groups · drag to move it',
			'wunderpaint'
		),
		smartselect: __(
			'Click an object and AI selects it · more clicks add, Alt-click removes · Esc starts over',
			'wunderpaint'
		),
		brush: `${ __( 'Drag to paint', 'wunderpaint' ) } · ${
			opts.size || 24
		}px · ${ fg }`,
		pencil: `${ __( 'Drag to draw', 'wunderpaint' ) } · ${
			opts.size || 2
		}px`,
		eraser: `${ __( 'Drag to erase to transparency', 'wunderpaint' ) } · ${
			opts.size || 32
		}px`,
		text: __(
			'Click to add text · drag for a fixed-width box',
			'wunderpaint'
		),
		shape: `${ __( 'Drag to draw', 'wunderpaint' ) } · ${
			opts.shape || 'rect'
		} · ${ __( 'Shift = constrain · Alt = from center', 'wunderpaint' ) }`,
		pen: __(
			'Click to add anchors · drag for curves · Enter/double-click to finish · Esc cancels',
			'wunderpaint'
		),
		eyedropper: __(
			'Click to sample the composited color (Alt → background)',
			'wunderpaint'
		),
		bucket: __(
			'Click: recolor shape/text, flood-fill pixels, or add a fill layer',
			'wunderpaint'
		),
		gradient: __(
			'Drag to define the gradient · Shift = 45° steps',
			'wunderpaint'
		),
		stamp: __(
			'Alt-click: set source · drag: clone from the marked point',
			'wunderpaint'
		),
		zoom: __(
			'Click zoom in · Alt-click zoom out · drag = marquee zoom',
			'wunderpaint'
		),
		hand: __( 'Drag to pan the canvas', 'wunderpaint' ),
		crop: __(
			'Drag to define crop · Enter/double-click applies · Esc cancels',
			'wunderpaint'
		),
		marquee: __(
			'Drag to select · Shift adds · Alt subtracts',
			'wunderpaint'
		),
		wand: __(
			'Click to select by color · tolerance & contiguous in the options bar',
			'wunderpaint'
		),
		fxbrush: __(
			'Drag to blur or sharpen locally · mode in the options bar',
			'wunderpaint'
		),
		lasso: __(
			'Drag a freeform selection · Shift adds · Alt subtracts',
			'wunderpaint'
		),
	};
	// Auto-hide after a few seconds so the hint never covers the image (B8).
	const [ visible, setVisible ] = useState( true );
	useEffect( () => {
		setVisible( true );
		const timer = setTimeout( () => setVisible( false ), 6000 );
		return () => clearTimeout( timer );
	}, [ tool ] );

	let tip = tips[ tool ] || tool;
	if (
		selection &&
		[ 'brush', 'pencil', 'eraser', 'bucket', 'gradient' ].includes( tool )
	) {
		tip += ' · ' + __( 'clipped to selection', 'wunderpaint' );
	}
	if ( ! visible ) {
		return null;
	}
	return (
		<div
			className="fab-hint"
			style={ {
				left: 24,
				bottom: 40,
				display: 'flex',
				alignItems: 'center',
				gap: 6,
				maxWidth: 460,
			} }
		>
			{ I.sparkAI( { size: 12 } ) } { tip }
		</div>
	);
}

export { selectionBounds };

/** Measurement overlay (v0.7): edge distances in px (Alt held). */
export function DistanceLabels( { rects, zoom, pan } ) {
	const items = [];
	for ( const { line, value } of rects ) {
		if ( ! line || ! value ) {
			continue;
		}
		items.push( { line, value } );
	}
	return (
		<Fragment>
			{ items.map( ( { line, value }, i ) => {
				const x1 = line.x1 * zoom + pan.x;
				const y1 = line.y1 * zoom + pan.y;
				const x2 = line.x2 * zoom + pan.x;
				const y2 = line.y2 * zoom + pan.y;
				return (
					<Fragment key={ i }>
						<div
							style={ {
								position: 'absolute',
								left: Math.min( x1, x2 ),
								top: Math.min( y1, y2 ),
								width: Math.max( 1, Math.abs( x2 - x1 ) ),
								height: Math.max( 1, Math.abs( y2 - y1 ) ),
								background: 'var(--accent)',
								pointerEvents: 'none',
								zIndex: 46,
							} }
						/>
						<span
							style={ {
								position: 'absolute',
								left: ( x1 + x2 ) / 2 + 4,
								top: ( y1 + y2 ) / 2 - 18,
								fontSize: 10,
								fontFamily: 'var(--font-mono)',
								background: 'var(--accent)',
								color: '#fff',
								borderRadius: 3,
								padding: '1px 4px',
								pointerEvents: 'none',
								zIndex: 46,
							} }
						>
							{ Math.round( value ) }px
						</span>
					</Fragment>
				);
			} ) }
		</Fragment>
	);
}
