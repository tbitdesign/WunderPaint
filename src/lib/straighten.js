/**
 * Straighten (20.10.2026): level a tilted photo while cropping.
 *
 * Only the photo layer turns (Thomas' choice): text, logos and shapes on top
 * stay as they are. The photo turns about the centre of the crop, the way a
 * print turns under a fixed frame, and the crop shrinks just enough that no
 * empty corner shows. Turning back grows it again, up to the rectangle the
 * user had drawn. A crop that already reached past the photo (a collage,
 * where the photo fills one part of the frame) is not shrunk at all.
 *
 * The angle is the deviation from the nearest right angle, -45 to +45
 * degrees, so a photo that sits at 90 degrees straightens the same way.
 *
 * Every released slider drag or drawn line is one history step. Cancel in
 * the crop tool puts the photo back where it was before the crop started;
 * Apply keeps it. What Cancel needs, and the rectangle to grow back to,
 * live in `state.cropStraighten`, which the store drops together with the
 * crop.
 */

import { __ } from '@wordpress/i18n';
import { cropBase } from './crop-geometry';
import { colorLayerLocked } from './color-links';

export const STRAIGHTEN_MAX = 45;

const clamp = ( v, lo, hi ) => Math.min( hi, Math.max( lo, v ) );
const round2 = ( v ) => Math.round( v * 100 ) / 100 || 0;

/**
 * The deviation of a rotation from its nearest right angle.
 *
 * @param {number} rot Degrees.
 * @return {number} -45 .. 45.
 */
export function straightenOffset( rot ) {
	const r = +rot || 0;
	return round2( r - 90 * Math.round( r / 90 ) );
}

/**
 * How far a drawn line leans from its nearest axis, in degrees, clockwise
 * positive (screen coordinates, y down). Direction does not matter.
 *
 * @param {{x:number,y:number}} a Start.
 * @param {{x:number,y:number}} b End.
 * @return {number} -45 .. 45.
 */
export function lineDeviation( a, b ) {
	const deg = ( Math.atan2( b.y - a.y, b.x - a.x ) * 180 ) / Math.PI;
	return deg - 90 * Math.round( deg / 90 );
}

/**
 * Where a layer's box goes when its centre turns about a pivot.
 *
 * @param {Object} layer { x, y, w, h }.
 * @param {Object} pivot { x, y }.
 * @param {number} deg   Degrees, clockwise positive.
 * @return {{x:number,y:number}} New top-left corner.
 */
export function orbit( layer, pivot, deg ) {
	const t = ( deg * Math.PI ) / 180;
	const c = Math.cos( t ),
		s = Math.sin( t );
	const dx = layer.x + layer.w / 2 - pivot.x;
	const dy = layer.y + layer.h / 2 - pivot.y;
	return {
		x: pivot.x + dx * c - dy * s - layer.w / 2,
		y: pivot.y + dx * s + dy * c - layer.h / 2,
	};
}

/**
 * The largest factor a rectangle can be scaled by about its own centre and
 * still lie inside a turned layer (turned about the layer's centre, as the
 * renderer does). Negative when even its centre is outside.
 *
 * @param {Object} rect   { x, y, w, h }.
 * @param {Object} layer  { x, y, w, h, rot }.
 * @param {number} margin Pixels kept free along the layer's edges; negative
 *                        values allow that much overlap.
 * @return {number} Scale.
 */
export function maxFitScale( rect, layer, margin = 1 ) {
	const t = ( ( layer.rot || 0 ) * Math.PI ) / 180;
	const c = Math.abs( Math.cos( t ) ),
		s = Math.abs( Math.sin( t ) );
	const dx = rect.x + rect.w / 2 - ( layer.x + layer.w / 2 );
	const dy = rect.y + rect.h / 2 - ( layer.y + layer.h / 2 );
	// The centre offset in the layer's own (unturned) frame.
	const ct = Math.cos( t ),
		st = Math.sin( t );
	const lx = Math.abs( dx * ct + dy * st );
	const ly = Math.abs( -dx * st + dy * ct );
	const a = rect.w / 2,
		b = rect.h / 2;
	const ex = a * c + b * s;
	const ey = a * s + b * c;
	const sx = ex > 0 ? ( layer.w / 2 - margin - lx ) / ex : Infinity;
	const sy = ey > 0 ? ( layer.h / 2 - margin - ly ) / ey : Infinity;
	return Math.min( sx, sy );
}

/**
 * The photo that straightening turns: the selected layer when it is a
 * photo, otherwise the largest photo in the document. A photo is an image
 * or pixel layer that is visible, not locked (also through a group) and
 * not distorted by a perspective quad.
 *
 * @param {Object} state { layers, activeId }.
 * @return {Object|null} Layer.
 */
export function straightenTarget( state ) {
	const layers = state?.layers || [];
	const ok = ( l ) =>
		!! l &&
		( 'image' === l.type || 'raster' === l.type ) &&
		! l.quad &&
		false !== l.visible &&
		l.w > 0 &&
		l.h > 0 &&
		! colorLayerLocked( layers, l );
	const active = layers.find( ( l ) => l.id === state.activeId );
	if ( ok( active ) ) {
		return active;
	}
	let best = null;
	for ( const l of layers ) {
		if ( ok( l ) && ( ! best || l.w * l.h > best.w * best.h ) ) {
			best = l;
		}
	}
	return best;
}

const sameRect = ( a, b ) =>
	!! a &&
	!! b &&
	[ 'x', 'y', 'w', 'h' ].every( ( k ) => Math.abs( a[ k ] - b[ k ] ) < 0.75 );

/**
 * Turn the photo to `value` degrees off its nearest right angle and fit the
 * crop. Live: no history step (see endStraighten).
 *
 * @param {Object} editor { state, dispatch }.
 * @param {number} value  -45 .. 45.
 * @return {boolean} Whether there was a photo to turn.
 */
export function applyStraighten( editor, value ) {
	const { state, dispatch } = editor;
	const target = straightenTarget( state );
	if ( ! target ) {
		return false;
	}
	const prev = state.cropStraighten || null;
	const snap = { ...( prev?.snap || {} ) };
	if ( ! snap[ target.id ] ) {
		snap[ target.id ] = {
			x: target.x,
			y: target.y,
			rot: target.rot || 0,
		};
	}
	const crop = cropBase( state );
	// Still the rectangle this tool fitted last time: keep working from the
	// user's own one, so turning back can grow the crop again. Anything else
	// is a crop the user changed, and that is now the rectangle to fit.
	const keep = prev && prev.id === target.id && sameRect( prev.fitted, crop );
	const user = keep ? prev.user : { ...crop };
	const fit = keep ? prev.fit : maxFitScale( user, target, -1 ) >= 1;

	const rot0 = target.rot || 0;
	const rot = round2(
		90 * Math.round( rot0 / 90 ) +
			clamp( +value || 0, -STRAIGHTEN_MAX, STRAIGHTEN_MAX )
	);
	const pivot = { x: user.x + user.w / 2, y: user.y + user.h / 2 };
	const pos = orbit( target, pivot, rot - rot0 );
	const turned = { ...target, ...pos, rot };

	let fitted = user;
	if ( fit ) {
		// A pixel of margin keeps rounding from showing a sliver of empty
		// corner, but only once there is a corner to keep out: an untilted
		// photo gives the user's rectangle back unchanged.
		const k =
			maxFitScale( user, turned, 0 ) >= 1 - 1e-9
				? 1
				: maxFitScale( user, turned, 1 );
		if ( k > 0 ) {
			const w = Math.max( 1, user.w * k ),
				h = Math.max( 1, user.h * k );
			fitted = { x: pivot.x - w / 2, y: pivot.y - h / 2, w, h };
		}
	}

	dispatch( { type: 'UPDATE_LAYER', id: target.id, patch: { ...pos, rot } } );
	dispatch( { type: 'SET_CROP', crop: fitted } );
	dispatch( {
		type: 'SET_CROP_STRAIGHTEN',
		value: { id: target.id, user, fitted, fit, snap, live: true },
	} );
	return true;
}

/**
 * Close a slider drag: one history step.
 *
 * @param {Object} editor { state, dispatch, commit }.
 */
export function endStraighten( editor ) {
	const st = editor.state.cropStraighten;
	if ( ! st ) {
		return;
	}
	editor.dispatch( {
		type: 'SET_CROP_STRAIGHTEN',
		value: { ...st, live: false },
	} );
	editor.commit( __( 'Straighten', 'wunderpaint' ) );
}

/**
 * Level the photo along a line drawn on it (Ctrl/Cmd + drag in the crop
 * tool): the line ends up horizontal or vertical, whichever it was closer
 * to.
 *
 * @param {Object} editor { state, dispatch, commit }.
 * @param {Object} a      Start, document pixels.
 * @param {Object} b      End, document pixels.
 * @return {boolean} Whether the photo turned.
 */
export function straightenLine( editor, a, b ) {
	const target = straightenTarget( editor.state );
	if ( ! target ) {
		return false;
	}
	const value = straightenOffset( target.rot || 0 ) - lineDeviation( a, b );
	if ( ! applyStraighten( editor, value ) ) {
		return false;
	}
	endStraighten( editor );
	return true;
}

/**
 * Cancel the crop. A photo straightened during this crop goes back to where
 * it was, as its own history step; without straightening, Cancel only
 * drops the crop as before.
 *
 * @param {Object} editor { state, dispatch, commit }.
 */
export function cancelCrop( editor ) {
	const { state, dispatch } = editor;
	const snap = state.cropStraighten?.snap || {};
	let restored = false;
	for ( const [ id, was ] of Object.entries( snap ) ) {
		const l = state.layers.find( ( x ) => x.id === id );
		if (
			l &&
			( l.x !== was.x || l.y !== was.y || ( l.rot || 0 ) !== was.rot )
		) {
			dispatch( { type: 'UPDATE_LAYER', id, patch: was } );
			restored = true;
		}
	}
	dispatch( { type: 'SET_CROP', crop: null } );
	if ( restored ) {
		editor.commit( __( 'Cancel Straighten', 'wunderpaint' ) );
	}
}
