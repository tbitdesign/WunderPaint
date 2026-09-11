import { nearestFree } from './obstacles.js';
/**
 * Smooth only the obstacle relief. The original mask still decides collisions
 * and color coverage, so a thin painted wall cannot disappear or become leaky.
 * Recompute when the wall changes, rather than blurring it every fluid frame.
 */
export class ObstacleSurface {
	constructor( width, height ) {
		this.width = width;
		this.height = height;
		this.source = new Float32Array( width * height );
		this.scratch = new Float32Array( width * height );
		this.relief = new Float32Array( width * height );
	}
	/** Optical continuation only: the collision/transport fields stay untouched. */
	extend( field, stride = 1 ) {
		if ( ! this.nearest ) {
			return;
		}
		for ( let i = 0; i < this.source.length; i++ ) {
			const j = this.nearest[ i ];
			if ( this.source[ i ] <= 0.5 || j < 0 ) {
				continue;
			}
			for ( let c = 0; c < stride; c++ ) {
				field[ i * stride + c ] = field[ j * stride + c ];
			}
		}
	}
	update( wall ) {
		if ( wall.every( ( value, i ) => value === this.source[ i ] ) ) {
			return false;
		}
		this.source.set( wall );
		this.nearest = nearestFree( wall, this.width, this.height );
		const w = this.width,
			h = this.height;
		const weights = [ 1, 4, 6, 4, 1 ];
		for ( let y = 0; y < h; y++ ) {
			for ( let x = 0; x < w; x++ ) {
				let value = 0;
				for ( let k = -2; k <= 2; k++ ) {
					value +=
						weights[ k + 2 ] *
						wall[ y * w + Math.max( 0, Math.min( w - 1, x + k ) ) ];
				}
				this.scratch[ y * w + x ] = value / 16;
			}
		}
		for ( let y = 0; y < h; y++ ) {
			for ( let x = 0; x < w; x++ ) {
				let value = 0;
				for ( let k = -2; k <= 2; k++ ) {
					value +=
						weights[ k + 2 ] *
						this.scratch[
							Math.max( 0, Math.min( h - 1, y + k ) ) * w + x
						];
				}
				this.relief[ y * w + x ] = value / 16;
			}
		}
		return true;
	}
}

/** Unit cylinder profile with rounded lips, revolved by the 3D renderer. */
export function roundedObstacleProfile() {
	const bevel = 0.08,
		points = [ [ 0, -0.5 ] ];
	for ( let i = 0; i <= 8; i++ ) {
		const angle = -Math.PI / 2 + ( i * Math.PI ) / 16;
		points.push( [
			1 - bevel + bevel * Math.cos( angle ),
			-0.5 + bevel + bevel * Math.sin( angle ),
		] );
	}
	for ( let i = 0; i <= 8; i++ ) {
		const angle = ( i * Math.PI ) / 16;
		points.push( [
			1 - bevel + bevel * Math.cos( angle ),
			0.5 - bevel + bevel * Math.sin( angle ),
		] );
	}
	points.push( [ 0, 0.5 ] );
	return points;
}
