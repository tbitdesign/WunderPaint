/**
 * Repeat layers (v1.431): defaults and access.
 *
 * A Repeat layer points at its source through `sourceId` and carries the
 * rule and the progression; its box is derived (see store/repeat-sync.js).
 * Everything that needs "the Repeat layer we are working on" asks here, so
 * the panel, the overlay, the tool and the menus agree on what that is: the
 * active layer when it IS a Repeat layer, else the Repeat layer whose
 * source is the active layer.
 */
import { unitFor } from './selection-units';

export const REPEAT_MODES = [ 'row', 'grid', 'circle', 'path' ];
export const PROGRESSION_KEYS = [ 'size', 'opacity', 'rotation', 'color' ];

/** A layer that may be repeated: anything but a Repeat or adjustment layer. */
export function isRepeatSource( layer ) {
	return (
		!! layer &&
		'repeat' !== layer.type &&
		'adjustment' !== layer.type &&
		! layer.clipped
	);
}

/**
 * The rule a fresh Repeat layer starts with: a row of three, one box plus a
 * small gap apart, so the first thing you see is three copies side by side.
 * Every other mode carries sensible numbers too, so switching modes never
 * shows an empty canvas.
 *
 * @param {Object} unitBox Footprint of the source unit {x,y,w,h}.
 * @return {Object} rule
 */
/**
 * The path frame a fresh path starts with: it begins at the layer's centre
 * and runs to the right, so the first copy sits on the layer and the rest
 * walk away from it. Kept inside the document when a size is known, so a
 * layer near the right edge does not get a frame off the canvas.
 *
 * @param {Object} unitBox Footprint of the source unit.
 * @param {Object} [doc]   Document { w, h }.
 * @return {Object} { frame, anchor }
 */
export function defaultPathFrame( unitBox, doc = null ) {
	const w = Math.max( 1, unitBox?.w || 100 );
	const h = Math.max( 1, unitBox?.h || 100 );
	const x = unitBox?.x || 0;
	const y = unitBox?.y || 0;
	const cx = x + w / 2;
	const cy = y + h / 2;
	let fw = Math.max( 300, 4 * w );
	let fh = Math.max( 160, 2 * h );
	if ( doc?.w > 0 && doc?.h > 0 ) {
		fw = Math.min( fw, doc.w );
		fh = Math.min( fh, doc.h );
	}
	let fx = cx;
	let fy = cy - fh / 2;
	if ( doc?.w > 0 && doc?.h > 0 ) {
		fx = Math.min( fx, doc.w - fw );
		fy = Math.min( Math.max( 0, fy ), doc.h - fh );
		fx = Math.max( 0, fx );
	}
	return {
		frame: {
			x: Math.round( fx ),
			y: Math.round( fy ),
			w: Math.round( fw ),
			h: Math.round( fh ),
			rot: 0,
		},
		anchor: { x: Math.round( cx ), y: Math.round( cy ) },
	};
}

export function defaultRule( unitBox, doc = null ) {
	const w = Math.max( 1, unitBox?.w || 100 );
	const h = Math.max( 1, unitBox?.h || 100 );
	const { frame, anchor } = defaultPathFrame( unitBox, doc );
	return {
		mode: 'row',
		count: 3,
		dx: Math.round( w + 20 ),
		dy: 0,
		cols: 3,
		rows: 2,
		gapX: 20,
		gapY: 20,
		center: { dx: 0, dy: -Math.round( h + 40 ) },
		span: 360,
		turn: true,
		path: {
			points: [
				{ x: 0, y: 0.5 },
				{ x: 1, y: 0.5 },
			],
			// `anchor` is the centre the frame was placed for - the sync moves
			// the frame along when the layer moves (v1.431).
			frame,
			anchor,
			tangent: true,
		},
	};
}

/** Every progression target off, with the end values a first click reveals. */
export function defaultProgression() {
	return {
		size: { on: false, end: 50, curve: null },
		opacity: { on: false, end: 0, curve: null },
		rotation: { on: false, end: 90, curve: null },
		color: { on: false, end: '#000000', curve: null },
	};
}

/** The Repeat layer that repeats `sourceId`, or null. */
export function repeatOfSource( layers, sourceId ) {
	return (
		( layers || [] ).find(
			( l ) => 'repeat' === l.type && l.sourceId === sourceId
		) || null
	);
}

/** The source of a Repeat layer, or null when it is gone. */
export function sourceOf( layers, repeatLayer ) {
	if ( ! repeatLayer || ! repeatLayer.sourceId ) {
		return null;
	}
	return (
		( layers || [] ).find( ( l ) => l.id === repeatLayer.sourceId ) || null
	);
}

/**
 * The Repeat layer the editor is working on, or null.
 *
 * @param {Object} state Editor state ({ layers, activeId, selectedIds }).
 * @return {Object|null}
 */
export function repeatLayerOf( state ) {
	if ( ! state || ( state.selectedIds || [] ).length > 1 ) {
		return null;
	}
	const active = ( state.layers || [] ).find(
		( l ) => l.id === state.activeId
	);
	if ( ! active ) {
		return null;
	}
	if ( 'repeat' === active.type ) {
		return active;
	}
	return repeatOfSource( state.layers, active.id );
}

/** Footprint of a layer or group as the units code sees it. */
export function unitBoxOf( layers, layer ) {
	if ( ! layer ) {
		return null;
	}
	return unitFor( layers, layer ).box;
}
