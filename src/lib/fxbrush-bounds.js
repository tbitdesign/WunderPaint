/** Grow an effect brush's raster without moving its existing pixels. */
import { createCanvas } from './raster';
import { setDocTransform } from '../screens/canvas/paint-commit';

export function growFxBrushLayer( layer, at, size ) {
	if ( ! layer.canvas || layer.quad ) {
		return layer;
	}
	const source = layer.canvas;
	const geometry = {
		...layer,
		w: layer.w ?? source.width,
		h: layer.h ?? source.height,
	};
	const probe = createCanvas( 1, 1 ).getContext( '2d' );
	setDocTransform( probe, geometry, { cw: source.width, ch: source.height } );
	const matrix = probe.getTransform();
	const radius = size / 2 + 2;
	const points = [
		[ -1, -1 ],
		[ 1, -1 ],
		[ -1, 1 ],
		[ 1, 1 ],
	].map( ( [ dx, dy ] ) =>
		matrix.transformPoint( {
			x: at.x + dx * radius,
			y: at.y + dy * radius,
		} )
	);
	const minX = Math.floor( Math.min( ...points.map( ( p ) => p.x ) ) );
	const minY = Math.floor( Math.min( ...points.map( ( p ) => p.y ) ) );
	const maxX = Math.ceil( Math.max( ...points.map( ( p ) => p.x ) ) );
	const maxY = Math.ceil( Math.max( ...points.map( ( p ) => p.y ) ) );
	// An empty click far from the source must not allocate a huge raster.
	if (
		maxX <= 0 ||
		maxY <= 0 ||
		minX >= source.width ||
		minY >= source.height
	) {
		return layer;
	}
	// Grow in blocks so a stroke along an edge does not copy the full layer
	// for every single pixel. The footprint already includes a transparent rim.
	const block = ( value ) => Math.ceil( Math.max( 0, value ) / 32 ) * 32;
	const left = block( -minX );
	const top = block( -minY );
	const right = block( maxX - source.width );
	const bottom = block( maxY - source.height );
	if ( ! ( left || top || right || bottom ) ) {
		return layer;
	}
	const canvas = createCanvas(
		source.width + left + right,
		source.height + top + bottom
	);
	canvas.getContext( '2d' ).drawImage( source, left, top );
	const scaleX = geometry.w / source.width;
	const scaleY = geometry.h / source.height;
	const w = canvas.width * scaleX;
	const h = canvas.height * scaleY;
	// Same center compensation as trimRasterPatch, with negative crop offsets.
	const dx = ( ( ( right - left ) * scaleX ) / 2 ) * ( layer.flipX ? -1 : 1 );
	const dy = ( ( ( bottom - top ) * scaleY ) / 2 ) * ( layer.flipY ? -1 : 1 );
	const rad = ( ( layer.rot || 0 ) * Math.PI ) / 180;
	const x =
		layer.x +
		geometry.w / 2 +
		dx * Math.cos( rad ) -
		dy * Math.sin( rad ) -
		w / 2;
	const y =
		layer.y +
		geometry.h / 2 +
		dx * Math.sin( rad ) +
		dy * Math.cos( rad ) -
		h / 2;
	const grown = { ...layer, canvas, dataUrl: null, x, y, w, h };
	if ( layer.mask?.anchor ) {
		const anchor = layer.mask.anchor;
		grown.mask = {
			...layer.mask,
			anchor: {
				x: anchor.x - ( left * anchor.w ) / source.width,
				y: anchor.y - ( top * anchor.h ) / source.height,
				w: ( anchor.w * canvas.width ) / source.width,
				h: ( anchor.h * canvas.height ) / source.height,
			},
		};
	}
	return grown;
}
