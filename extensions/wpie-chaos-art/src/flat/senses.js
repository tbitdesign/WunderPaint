/**
 * The picture as a sense, on a flat surface.
 *
 * The painters never look at each other; they look at the picture. The
 * stage hands them a coarse map of it - what is covered, how light it
 * is, which way it leans, where it is empty - and everything a painter
 * "feels" about balance, focus and negative space is read from here.
 * Pure math over a small grid, so it is cheap and fully tested.
 */

/** Perceived lightness of an rgb triple in 0..1. */
export const lum = ( c ) => 0.2126 * c[ 0 ] + 0.7152 * c[ 1 ] + 0.0722 * c[ 2 ];

/** Hue in 0..1 (undefined for grays -> -1) and saturation 0..1. */
export function hueSat( c ) {
	const mx = Math.max( c[ 0 ], c[ 1 ], c[ 2 ] );
	const mn = Math.min( c[ 0 ], c[ 1 ], c[ 2 ] );
	const d = mx - mn;
	const s = mx > 0 ? d / mx : 0;
	if ( d < 0.02 ) {
		return { h: -1, s: 0 };
	}
	let h;
	if ( mx === c[ 0 ] ) {
		h = ( ( c[ 1 ] - c[ 2 ] ) / d + 6 ) % 6;
	} else if ( mx === c[ 1 ] ) {
		h = ( c[ 2 ] - c[ 0 ] ) / d + 2;
	} else {
		h = ( c[ 0 ] - c[ 1 ] ) / d + 4;
	}
	return { h: h / 6, s };
}

/**
 * A sense map: cols x rows cells over a frame of `aspect` x 1.
 * The stage fills `rgb` (Float32Array, 3 per cell) from a downsample and
 * calls `update( groundRgb )`; the painters read the derived maps.
 */
export class SenseMap {
	constructor( aspect, rows = 36 ) {
		this.aspect = aspect;
		this.rows = rows;
		this.cols = Math.max( 4, Math.round( rows * aspect ) );
		const n = this.rows * this.cols;
		this.rgb = new Float32Array( n * 3 );
		this.cover = new Float32Array( n ); // 0 = ground, 1 = fully painted
		this.light = new Float32Array( n );
		this.fresh = new Float32Array( n ); // recent paint, fades in time
		this.edge = new Float32Array( n ); // local contrast
		this.groundMap = null; // per-cell rgb of the untouched ground
		this.marks = 0;
	}

	/** Remember the ground as painted (wash, grain and all) per cell. */
	rememberGround() {
		this.groundMap = new Float32Array( this.rgb );
	}

	index( x, y ) {
		const cx = Math.max(
			0,
			Math.min(
				this.cols - 1,
				Math.floor( ( x / this.aspect ) * this.cols )
			)
		);
		const cy = Math.max(
			0,
			Math.min( this.rows - 1, Math.floor( y * this.rows ) )
		);
		return cy * this.cols + cx;
	}

	cellCenter( i ) {
		const cx = i % this.cols;
		const cy = Math.floor( i / this.cols );
		return [
			( ( cx + 0.5 ) / this.cols ) * this.aspect,
			( cy + 0.5 ) / this.rows,
		];
	}

	/** Derive coverage, lightness and contrast from the rgb sample. */
	update( groundRgb ) {
		const n = this.rows * this.cols;
		const gl = lum( groundRgb );
		for ( let i = 0; i < n; i++ ) {
			const r = this.rgb[ i * 3 ];
			const g = this.rgb[ i * 3 + 1 ];
			const b = this.rgb[ i * 3 + 2 ];
			const gm = this.groundMap;
			const g0 = gm ? gm[ i * 3 ] : groundRgb[ 0 ];
			const g1 = gm ? gm[ i * 3 + 1 ] : groundRgb[ 1 ];
			const g2 = gm ? gm[ i * 3 + 2 ] : groundRgb[ 2 ];
			const d = Math.hypot( r - g0, g - g1, b - g2 );
			this.cover[ i ] = Math.min( 1, d / 0.2 );
			this.light[ i ] = lum( [ r, g, b ] );
		}
		for ( let y = 0; y < this.rows; y++ ) {
			for ( let x = 0; x < this.cols; x++ ) {
				const i = y * this.cols + x;
				const l = this.light[ i ];
				let e = 0;
				if ( x > 0 ) {
					e += Math.abs( l - this.light[ i - 1 ] );
				}
				if ( y > 0 ) {
					e += Math.abs( l - this.light[ i - this.cols ] );
				}
				this.edge[ i ] = e;
			}
		}
		this.groundLight = gl;
	}

	/** A mark landed here; freshness remembers it for a while. */
	note( x, y, radius = 0.02 ) {
		const r = Math.max( 1, Math.round( radius * this.rows ) );
		const cx = ( x / this.aspect ) * this.cols;
		const cy = y * this.rows;
		for ( let yy = Math.floor( cy - r ); yy <= cy + r; yy++ ) {
			for ( let xx = Math.floor( cx - r ); xx <= cx + r; xx++ ) {
				if ( xx < 0 || yy < 0 || xx >= this.cols || yy >= this.rows ) {
					continue;
				}
				const d = Math.hypot( xx + 0.5 - cx, yy + 0.5 - cy );
				if ( d <= r ) {
					this.fresh[ yy * this.cols + xx ] = 1;
				}
			}
		}
		this.marks++;
	}

	/** Time passes; freshness fades. */
	fade( dt ) {
		const f = Math.max( 0, 1 - dt * 0.12 );
		for ( let i = 0; i < this.fresh.length; i++ ) {
			this.fresh[ i ] *= f;
		}
	}

	coverAt( x, y ) {
		return this.cover[ this.index( x, y ) ];
	}

	lightAt( x, y ) {
		return this.light[ this.index( x, y ) ];
	}

	freshAt( x, y ) {
		return this.fresh[ this.index( x, y ) ];
	}

	/** Fraction of the picture that is painted (0..1). */
	coverage() {
		let s = 0;
		for ( let i = 0; i < this.cover.length; i++ ) {
			s += this.cover[ i ];
		}
		return this.cover.length ? s / this.cover.length : 0;
	}

	/** Center of painted mass, and how far it sits from the frame center. */
	centroid() {
		let sx = 0;
		let sy = 0;
		let s = 0;
		for ( let i = 0; i < this.cover.length; i++ ) {
			const c = this.cover[ i ];
			if ( c > 0.02 ) {
				const p = this.cellCenter( i );
				sx += p[ 0 ] * c;
				sy += p[ 1 ] * c;
				s += c;
			}
		}
		if ( s < 1e-6 ) {
			return { x: this.aspect / 2, y: 0.5, weight: 0 };
		}
		return { x: sx / s, y: sy / s, weight: s / this.cover.length };
	}

	/** Coverage per zone of a 3x3 split (row-major, 0..8). */
	zones() {
		const out = new Array( 9 ).fill( 0 );
		const cnt = new Array( 9 ).fill( 0 );
		for ( let y = 0; y < this.rows; y++ ) {
			const zy = Math.min( 2, Math.floor( ( y / this.rows ) * 3 ) );
			for ( let x = 0; x < this.cols; x++ ) {
				const zx = Math.min( 2, Math.floor( ( x / this.cols ) * 3 ) );
				const z = zy * 3 + zx;
				out[ z ] += this.cover[ y * this.cols + x ];
				cnt[ z ]++;
			}
		}
		return out.map( ( v, i ) => ( cnt[ i ] ? v / cnt[ i ] : 0 ) );
	}

	/**
	 * The emptiest place: the center of the least covered window of about
	 * `size` (fraction of height) - where a space-seeker would go.
	 */
	emptiest( size = 0.25 ) {
		const r = Math.max( 1, Math.round( size * this.rows * 0.5 ) );
		let best = Infinity;
		let at = 0;
		for ( let y = r; y < this.rows - r; y++ ) {
			for ( let x = r; x < this.cols - r; x++ ) {
				let s = 0;
				for ( let yy = -r; yy <= r; yy++ ) {
					for ( let xx = -r; xx <= r; xx++ ) {
						s += this.cover[ ( y + yy ) * this.cols + x + xx ];
					}
				}
				if ( s < best ) {
					best = s;
					at = y * this.cols + x;
				}
			}
		}
		const p = this.cellCenter( at );
		return {
			x: p[ 0 ],
			y: p[ 1 ],
			cover: best / ( ( 2 * r + 1 ) * ( 2 * r + 1 ) ),
		};
	}

	/** The busiest place: most contrast in a window. */
	loudest( size = 0.2 ) {
		const r = Math.max( 1, Math.round( size * this.rows * 0.5 ) );
		let best = -1;
		let at = 0;
		for ( let y = r; y < this.rows - r; y++ ) {
			for ( let x = r; x < this.cols - r; x++ ) {
				let s = 0;
				for ( let yy = -r; yy <= r; yy++ ) {
					for ( let xx = -r; xx <= r; xx++ ) {
						s += this.edge[ ( y + yy ) * this.cols + x + xx ];
					}
				}
				if ( s > best ) {
					best = s;
					at = y * this.cols + x;
				}
			}
		}
		const p = this.cellCenter( at );
		return { x: p[ 0 ], y: p[ 1 ], edge: best };
	}

	/** Lightness spread: how far the picture reaches from dark to light. */
	contrast() {
		let mn = 1;
		let mx = 0;
		let s = 0;
		let n = 0;
		for ( let i = 0; i < this.light.length; i++ ) {
			if ( this.cover[ i ] > 0.05 ) {
				const l = this.light[ i ];
				mn = Math.min( mn, l );
				mx = Math.max( mx, l );
				s += l;
				n++;
			}
		}
		if ( ! n ) {
			return {
				min: this.groundLight || 0.5,
				max: this.groundLight || 0.5,
				mean: this.groundLight || 0.5,
				range: 0,
			};
		}
		return { min: mn, max: mx, mean: s / n, range: mx - mn };
	}

	/**
	 * The dominant direction of the painted structure (structure tensor of
	 * the lightness gradients): an angle in radians, and a coherence 0..1.
	 */
	direction() {
		let jxx = 0;
		let jyy = 0;
		let jxy = 0;
		for ( let y = 1; y < this.rows - 1; y++ ) {
			for ( let x = 1; x < this.cols - 1; x++ ) {
				const i = y * this.cols + x;
				const gx = this.light[ i + 1 ] - this.light[ i - 1 ];
				const gy =
					this.light[ i + this.cols ] - this.light[ i - this.cols ];
				jxx += gx * gx;
				jyy += gy * gy;
				jxy += gx * gy;
			}
		}
		const tr = jxx + jyy;
		if ( tr < 1e-9 ) {
			return { angle: 0, coherence: 0 };
		}
		// Gradient orientation; the structure runs perpendicular to it.
		const ang = 0.5 * Math.atan2( 2 * jxy, jxx - jyy );
		const l1 = 0.5 * ( tr + Math.hypot( jxx - jyy, 2 * jxy ) );
		const l2 = 0.5 * ( tr - Math.hypot( jxx - jyy, 2 * jxy ) );
		return {
			angle: ang + Math.PI / 2,
			coherence: ( l1 - l2 ) / ( l1 + l2 + 1e-9 ),
		};
	}

	/** Which side is heavier: -1 left/top, +1 right/bottom, per axis. */
	imbalance() {
		const c = this.centroid();
		return {
			x: c.weight ? ( c.x / this.aspect - 0.5 ) * 2 : 0,
			y: c.weight ? ( c.y - 0.5 ) * 2 : 0,
		};
	}
}
