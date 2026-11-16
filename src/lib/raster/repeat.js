/**
 * Rendering a Repeat layer (v1.431): one source buffer, many stamps.
 *
 * The source is rendered ONCE through the ordinary layer pipeline (effects,
 * mask, styles included) into a buffer that is never clipped by the
 * viewport - the copies may be on screen while the source is not - and then
 * stamped per placement with translate / rotate / scale about the copy's
 * centre, the placement's opacity and, for the colour progression, a
 * tinted variant of the buffer. Tint amounts are quantised to sixteen
 * steps so ninety-nine copies of a photo do not build ninety-nine buffers.
 *
 * The placements come from lib/repeat-layout.js, the same ones Bake and the
 * SVG export expand into real layers.
 */
import { createCanvas } from './env';
import { repeatPlacements } from '../repeat-layout';
import { unitBoxOf } from '../../store/repeat-sync';
import { parseColor } from '../color';

const TINT_STEPS = 16;
const rad = ( d ) => ( d * Math.PI ) / 180;

/** The four corners of the buffer rectangle after a placement's transform, in doc space. */
function stampedCorners( buffer, centre, c, p ) {
	const cos = Math.cos( rad( p.rot ) );
	const sin = Math.sin( rad( p.rot ) );
	const pts = [
		[ buffer.x, buffer.y ],
		[ buffer.x + buffer.w, buffer.y ],
		[ buffer.x + buffer.w, buffer.y + buffer.h ],
		[ buffer.x, buffer.y + buffer.h ],
	];
	return pts.map( ( [ x, y ] ) => {
		const lx = ( x - centre.x ) * p.scale;
		const ly = ( y - centre.y ) * p.scale;
		return {
			x: c.x + lx * cos - ly * sin,
			y: c.y + lx * sin + ly * cos,
		};
	} );
}

/** Source viewport and placements shared by measuring and painting. */
function repeatSetup( layer, env, boundsFor ) {
	const layers = env.layers || [];
	const source = layers.find( ( l ) => l.id === layer.sourceId );
	if (
		! source ||
		( ! source.visible && ! env.includeHidden ) ||
		'repeat' === source.type
	) {
		return null;
	}
	const box = unitBoxOf( layers, source );
	const placements = repeatPlacements( box, layer.rule, layer.progression );
	if ( ! placements.length || ! box.w || ! box.h ) {
		return null;
	}
	// Use the complete source extents, also for small shapes with large effects.
	const bounds = boundsFor( source, {
		...env,
		unclipped: true,
		tight: false,
		viewport: { x: 0, y: 0, w: 0, h: 0 },
	} );
	if ( ! bounds ) {
		return null;
	}
	const viewport = {
		x: bounds.x / env.scale,
		y: bounds.y / env.scale,
		w: Math.ceil( bounds.w ) / env.scale,
		h: Math.ceil( bounds.h ) / env.scale,
	};
	return {
		source,
		placements,
		viewport,
		centre: { x: box.x + box.w / 2, y: box.y + box.h / 2 },
	};
}

/** Union of the transformed, padded source buffer, clipped only at the viewport. */
function stampedDeviceBounds( buffer, centre, placements, env ) {
	const scale = env.scale;
	// Union of every stamp in device space, clipped to the device viewport.
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for ( const p of placements ) {
		const c = { x: centre.x + p.dx, y: centre.y + p.dy };
		for ( const q of stampedCorners( buffer, centre, c, p ) ) {
			minX = Math.min( minX, q.x );
			minY = Math.min( minY, q.y );
			maxX = Math.max( maxX, q.x );
			maxY = Math.max( maxY, q.y );
		}
	}
	const vw = env.viewport.w * scale;
	const vh = env.viewport.h * scale;
	const x0 = Math.max(
		env.unclipped ? -Infinity : 0,
		Math.floor( ( minX - env.viewport.x ) * scale )
	);
	const y0 = Math.max(
		env.unclipped ? -Infinity : 0,
		Math.floor( ( minY - env.viewport.y ) * scale )
	);
	const x1 = Math.min(
		env.unclipped ? Infinity : vw,
		Math.ceil( ( maxX - env.viewport.x ) * scale )
	);
	const y1 = Math.min(
		env.unclipped ? Infinity : vh,
		Math.ceil( ( maxY - env.viewport.y ) * scale )
	);
	if ( x1 <= x0 || y1 <= y0 ) {
		return null;
	}
	return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Measure a Repeat without rendering another source canvas. Parent groups must
 * contain the painted copies, including stroke/style/effect overhang, rather
 * than the geometric Repeat box used for spacing and selection handles.
 *
 * @param {Object} layer The Repeat layer.
 * @param {Object} env Render environment.
 * @param {Function} boundsFor Source layer/group bounds, passed in to avoid a cycle.
 * @return {Object|null} Device-space { x, y, w, h }.
 */
export function repeatDeviceBounds( layer, env, boundsFor ) {
	const setup = repeatSetup( layer, env, boundsFor );
	if ( ! setup ) {
		return null;
	}
	const { source, viewport, centre, placements } = setup;
	const bounds = boundsFor( source, { ...env, viewport, tight: false } );
	if ( ! bounds ) {
		return null;
	}
	const buffer = {
		x: viewport.x + bounds.x / env.scale,
		y: viewport.y + bounds.y / env.scale,
		// createCanvas rounds scratch dimensions up to whole device pixels.
		w: Math.ceil( bounds.w ) / env.scale,
		h: Math.ceil( bounds.h ) / env.scale,
	};
	return stampedDeviceBounds( buffer, centre, placements, env );
}

function tintedBuffer( cache, source, color, amount, replace = false ) {
	const step = Math.round( amount * TINT_STEPS );
	if ( step <= 0 ) {
		return source;
	}
	const key = replace ? color : step;
	if ( cache.has( key ) ) {
		return cache.get( key );
	}
	const canvas = createCanvas( source.width, source.height );
	const ctx = canvas.getContext( '2d' );
	ctx.drawImage( source, 0, 0 );
	ctx.globalCompositeOperation = replace ? 'source-in' : 'source-atop';
	const rgb = parseColor( color ) || { r: 0, g: 0, b: 0 };
	ctx.fillStyle = `rgba(${ rgb.r }, ${ rgb.g }, ${ rgb.b }, ${
		replace ? rgb.a ?? 1 : step / TINT_STEPS
	})`;
	ctx.fillRect( 0, 0, canvas.width, canvas.height );
	cache.set( key, canvas );
	if ( replace && cache.size > 8 ) {
		cache.delete( cache.keys().next().value );
	}
	return canvas;
}

/**
 * Render a Repeat layer to device space.
 *
 * @param {Object}   layer       The Repeat layer.
 * @param {Object}   env         Render env ({ layers, scale, viewport, cache, ... }).
 * @param {Function} renderLayer renderLayerToDevice, passed in to avoid a cycle.
 * @return {Object|null} { canvas, x, y } or null when nothing is visible.
 */
export function renderRepeatToDevice( layer, env, renderLayer, boundsFor ) {
	const setup = repeatSetup( layer, env, boundsFor );
	if ( ! setup ) {
		return null;
	}
	const { source, viewport: vp, centre, placements } = setup;
	const rendered = renderLayer( source, { ...env, viewport: vp } );
	if ( ! rendered || ! rendered.canvas.width || ! rendered.canvas.height ) {
		return null;
	}
	const scale = env.scale;
	const buffer = {
		x: vp.x + rendered.x / scale,
		y: vp.y + rendered.y / scale,
		w: rendered.canvas.width / scale,
		h: rendered.canvas.height / scale,
	};
	const bounds = stampedDeviceBounds( buffer, centre, placements, env );
	if ( ! bounds ) {
		return null;
	}
	const { x: x0, y: y0, w, h } = bounds;
	const canvas = createCanvas( w, h );
	const ctx = canvas.getContext( '2d' );
	const tints = new Map();
	const colorOn = !! layer.progression?.color?.on;
	const color = layer.progression?.color?.end || '#000000';
	for ( const p of placements ) {
		if ( p.opacity <= 0 || p.scale <= 0 ) {
			continue;
		}
		const c = { x: centre.x + p.dx, y: centre.y + p.dy };
		ctx.setTransform( 1, 0, 0, 1, 0, 0 );
		ctx.translate( -x0, -y0 );
		ctx.scale( scale, scale );
		ctx.translate( -env.viewport.x, -env.viewport.y );
		ctx.translate( c.x, c.y );
		if ( p.rot ) {
			ctx.rotate( rad( p.rot ) );
		}
		if ( 1 !== p.scale ) {
			ctx.scale( p.scale, p.scale );
		}
		ctx.translate( -centre.x, -centre.y );
		ctx.globalAlpha = p.opacity;
		const img = p.paintColor
			? tintedBuffer( tints, rendered.canvas, p.paintColor, 1, true )
			: colorOn && p.tint > 0
			? tintedBuffer( tints, rendered.canvas, color, p.tint )
			: rendered.canvas;
		ctx.drawImage( img, buffer.x, buffer.y, buffer.w, buffer.h );
	}
	ctx.setTransform( 1, 0, 0, 1, 0, 0 );
	ctx.globalAlpha = 1;
	return { canvas, x: x0, y: y0 };
}
