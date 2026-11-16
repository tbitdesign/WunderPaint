/** Frozen clone sources live only in the current editor, outside document history. */
import { createCanvas } from './raster';
import { setLayerToDocTransform } from '../screens/canvas/paint-commit';

export const CLONE_HISTORY_LIMIT = 10;
let sourceSequence = 0;

/** Copy native pixels once. Later strokes and previews only read this snapshot. */
export function captureCloneSource( layer, pixels, at, size = 40 ) {
	const canvas = createCanvas( pixels.width, pixels.height );
	canvas.getContext( '2d' ).drawImage( pixels, 0, 0 );
	const source = {
		id: `clone-${ ++sourceSequence }`,
		x: at.x,
		y: at.y,
		name: layer.name,
		layer: {
			x: layer.x,
			y: layer.y,
			w: layer.w,
			h: layer.h,
			rot: layer.rot,
			flipX: layer.flipX,
			flipY: layer.flipY,
			canvas,
		},
	};
	const thumb = createCanvas( 80, 80 );
	const ctx = thumb.getContext( '2d' );
	const span = Math.max( 40, size ) * 1.5;
	const crop = createCanvas( Math.ceil( span ), Math.ceil( span ) );
	const cropCtx = crop.getContext( '2d' );
	setLayerToDocTransform(
		cropCtx,
		source.layer,
		at.x - span / 2,
		at.y - span / 2
	);
	cropCtx.drawImage( canvas, 0, 0 );
	ctx.drawImage( crop, 0, 0, 80, 80 );
	source.thumbnail = thumb.toDataURL();
	return source;
}

/** Same pixels and circular alpha for the cursor preview and the actual dab. */
export function drawCloneDab( canvas, source, at, size, hardness = 80 ) {
	const diameter = Math.max( 1, Math.round( size ) );
	if ( canvas.width !== diameter || canvas.height !== diameter ) {
		canvas.width = diameter;
		canvas.height = diameter;
	}
	const ctx = canvas.getContext( '2d' );
	ctx.setTransform( 1, 0, 0, 1, 0, 0 );
	ctx.clearRect( 0, 0, diameter, diameter );
	ctx.save();
	const radius = diameter / 2;
	setLayerToDocTransform( ctx, source.layer, at.x - radius, at.y - radius );
	ctx.drawImage( source.layer.canvas, 0, 0 );
	ctx.setTransform( 1, 0, 0, 1, 0, 0 );
	const inner = Math.max(
		0,
		Math.min( radius - 0.5, ( radius * hardness ) / 100 )
	);
	const grad = ctx.createRadialGradient(
		radius,
		radius,
		inner,
		radius,
		radius,
		radius
	);
	grad.addColorStop( 0, 'rgba(0,0,0,1)' );
	grad.addColorStop( 1, 'rgba(0,0,0,0)' );
	ctx.globalCompositeOperation = 'destination-in';
	ctx.fillStyle = grad;
	ctx.fillRect( 0, 0, diameter, diameter );
	ctx.restore();
	return canvas;
}
