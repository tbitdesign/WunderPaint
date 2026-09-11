import {
	builtinLoops,
	distanceGrid,
	sampleGrid,
	cleanObstacleState,
	bounded,
	MAX_OBSTACLES,
} from './obstacle-shapes.js';
const builtinGrids = new Map();
const emptyFields = new Map();
export function nearestFree( wall, w, h ) {
	const nearest = new Int32Array( w * h ).fill( -1 ),
		queue = new Int32Array( w * h );
	let head = 0,
		tail = 0;
	for ( let i = 0; i < wall.length; i++ ) {
		if ( wall[ i ] <= 0.5 ) {
			nearest[ i ] = i;
			queue[ tail++ ] = i;
		}
	}
	while ( head < tail ) {
		const i = queue[ head++ ],
			x = i % w,
			y = Math.floor( i / w );
		for ( const j of [
			x ? i - 1 : -1,
			x < w - 1 ? i + 1 : -1,
			y ? i - w : -1,
			y < h - 1 ? i + w : -1,
		] ) {
			if ( j >= 0 && nearest[ j ] < 0 ) {
				nearest[ j ] = nearest[ i ];
				queue[ tail++ ] = j;
			}
		}
	}
	return nearest;
}
/** Immutable source contours, separately movable instances, and a cached union. */
export class Obstacles {
	constructor( sim, raw ) {
		this.sim = sim;
		Object.assign( this, cleanObstacleState( raw, sim.n || 0 ) );
		this.grids = new Map();
		this.revision = 0;
		this.w = Math.round( 384 * sim.aspect );
		this.h = 384;
		if ( ! emptyFields.has( this.w ) ) {
			emptyFields.set( this.w, {
				rgba: new Uint8Array( this.w * this.h * 4 ),
				distance: new Float32Array( this.w * this.h ).fill( 1 ),
			} );
		}
		Object.assign( this, emptyFields.get( this.w ) );
		this.sharedFields = true;
		this.rebuild( false );
	}
	loops( shape ) {
		return (
			this.assets.find( ( a ) => a.id === shape )?.loops ||
			builtinLoops( shape )
		);
	}
	grid( shape ) {
		const target = shape.startsWith( 'layer-' ) ? this.grids : builtinGrids;
		if ( ! target.has( shape ) ) {
			target.set( shape, distanceGrid( this.loops( shape ) ) );
		}
		return target.get( shape );
	}
	add( options ) {
		return this.addMany( [ options ] )[ 0 ] || null;
	}
	addMany( options ) {
		const id = Math.max( 0, ...this.items.map( ( o ) => o.id ) ) + 1;
		const items = options
			.slice( 0, MAX_OBSTACLES - this.items.length )
			.map( ( o, i ) => ( {
				shape: 'circle',
				color: '#647884',
				x: 0.5,
				y: 0.5,
				size: 0.2,
				angle: 0,
				...o,
				id: id + i,
			} ) );
		if ( ! items.length ) {
			return [];
		}
		const clean = cleanObstacleState( {
			version: 1,
			items,
			assets: this.assets,
		} ).items;
		if ( this.sim.wall && ! this.baseWall ) {
			this.baseWall = this.sim.wall.slice();
		}
		const previous = this.items;
		this.items = [ ...previous, ...clean ];
		try {
			this.rebuild();
		} catch ( e ) {
			this.items = previous;
			this.rebuild( false );
			throw e;
		}
		return clean;
	}
	update( id, patch ) {
		const index = this.items.findIndex( ( o ) => o.id === id );
		if ( index < 0 ) {
			return;
		}
		const item = cleanObstacleState( {
			version: 1,
			items: [ { ...this.items[ index ], ...patch, id } ],
			assets: this.assets,
		} ).items[ 0 ];
		const previous = this.items[ index ];
		this.items[ index ] = item;
		try {
			this.rebuild();
		} catch ( e ) {
			this.items[ index ] = previous;
			this.rebuild( false );
			throw e;
		}
	}
	remove( id ) {
		this.items = this.items.filter( ( o ) => o.id !== id );
		this.rebuild();
	}
	addAsset( name, loops ) {
		const id =
			'layer-' +
			( Math.max(
				0,
				...this.assets.map( ( a ) => Number( a.id.slice( 6 ) ) )
			) +
				1 );
		const candidate = [ ...this.assets, { id, name, loops } ];
		this.assets = cleanObstacleState( {
			version: 1,
			items: this.items,
			assets: candidate,
		} ).assets;
		return id;
	}
	at( x, y ) {
		for ( let i = this.items.length - 1; i >= 0; i-- ) {
			const o = this.items[ i ];
			if ( this.localDistance( o, x, y ) <= 0.012 ) {
				return o;
			}
		}
		return null;
	}
	localDistance( o, x, y ) {
		const a = ( o.angle * Math.PI ) / 180,
			c = Math.cos( a ),
			s = Math.sin( a ),
			dx = ( x - o.x ) * this.sim.aspect,
			dy = y - o.y;
		return (
			sampleGrid(
				this.grid( o.shape ),
				( dx * c + dy * s ) / o.size,
				( -dx * s + dy * c ) / o.size
			) * o.size
		);
	}
	sample( x, y ) {
		const xx = bounded( x * ( this.w - 1 ), 0, this.w - 1, 0 ),
			yy = bounded( y * ( this.h - 1 ), 0, this.h - 1, 0 ),
			ix = Math.min( this.w - 2, Math.floor( xx ) ),
			iy = Math.min( this.h - 2, Math.floor( yy ) ),
			fx = xx - ix,
			fy = yy - iy,
			d = this.distance,
			w = this.w;
		return (
			( d[ iy * w + ix ] * ( 1 - fx ) + d[ iy * w + ix + 1 ] * fx ) *
				( 1 - fy ) +
			( d[ ( iy + 1 ) * w + ix ] * ( 1 - fx ) +
				d[ ( iy + 1 ) * w + ix + 1 ] * fx ) *
				fy
		);
	}
	project( i ) {
		const sim = this.sim,
			r = sim.spacing * 0.45;
		if (
			! this.items.length ||
			sim.z[ i ] > 0.65 + r ||
			sim.x[ i ] < 0 ||
			sim.x[ i ] > sim.aspect ||
			sim.y[ i ] < 0 ||
			sim.y[ i ] > 1
		) {
			return;
		}
		for ( let k = 0; k < 8; k++ ) {
			const x = sim.x[ i ] / sim.aspect,
				y = sim.y[ i ],
				d = this.sample( x, y );
			if ( d >= r ) {
				break;
			}
			// The top is a collision face too, so particles can flow over a form.
			if ( sim.z[ i ] > 0.65 && 0.65 + r - sim.z[ i ] < r - d ) {
				sim.z[ i ] = 0.65 + r;
				break;
			}
			const e = 1 / 384;
			let dx =
					this.sample( x + e / sim.aspect, y ) -
					this.sample( x - e / sim.aspect, y ),
				dy = this.sample( x, y + e ) - this.sample( x, y - e ),
				length = Math.hypot( dx, dy );
			if ( length < 1e-7 ) {
				dx = 1;
				dy = 0;
				length = 1;
			}
			sim.x[ i ] += ( dx / length ) * ( r - d + 0.0003 );
			sim.y[ i ] += ( dy / length ) * ( r - d + 0.0003 );
		}
		if (
			sim.z[ i ] < 0.65 + r &&
			( this.sample( sim.x[ i ] / sim.aspect, sim.y[ i ] ) < r - 0.001 ||
				( sim.settings.boundary !== 'open' &&
					( sim.x[ i ] < r ||
						sim.x[ i ] > sim.aspect - r ||
						sim.y[ i ] < r ||
						sim.y[ i ] > 1 - r ) ) )
		) {
			const free = this.nearestAllowed( sim.x[ i ], sim.y[ i ], r );
			if ( free ) {
				sim.x[ i ] = free.x;
				sim.y[ i ] = free.y;
			}
		}
	}
	nearestAllowed( x, y, r ) {
		const closed = this.sim.settings.boundary !== 'open',
			key = this.revision + ':' + closed + ':' + r;
		if ( this.allowedKey !== key ) {
			const mask = new Uint8Array( this.w * this.h );
			for ( let i = 0; i < mask.length; i++ ) {
				const px =
						( ( i % this.w ) / ( this.w - 1 ) ) * this.sim.aspect,
					py = Math.floor( i / this.w ) / ( this.h - 1 );
				mask[ i ] =
					this.distance[ i ] < r + 0.001 ||
					( closed &&
						( px < r ||
							px > this.sim.aspect - r ||
							py < r ||
							py > 1 - r ) )
						? 1
						: 0;
			}
			this.allowed = nearestFree( mask, this.w, this.h );
			this.allowedKey = key;
		}
		const ix = Math.round(
				bounded( x / this.sim.aspect, 0, 1, 0.5 ) * ( this.w - 1 )
			),
			iy = Math.round( bounded( y, 0, 1, 0.5 ) * ( this.h - 1 ) ),
			j = this.allowed[ iy * this.w + ix ];
		return j < 0
			? null
			: {
					x: ( ( j % this.w ) / ( this.w - 1 ) ) * this.sim.aspect,
					y: Math.floor( j / this.w ) / ( this.h - 1 ),
			  };
	}

	rebuild( displace = true ) {
		const { sim, w, h } = this,
			aa = 1 / h;
		if (
			( this.items.length || sim.obstacles?.length ) &&
			this.sharedFields
		) {
			this.distance = new Float32Array( w * h );
			this.rgba = new Uint8Array( w * h * 4 );
			this.sharedFields = false;
		}
		if ( ! this.sharedFields ) {
			this.distance.fill( 1 );
			this.rgba.fill( 0 );
		}
		for ( const o of this.items ) {
			const radius = o.size * 0.72 + 0.05,
				x0 = Math.max(
					0,
					Math.floor( ( o.x - radius / sim.aspect ) * w )
				),
				x1 = Math.min(
					w - 1,
					Math.ceil( ( o.x + radius / sim.aspect ) * w )
				),
				y0 = Math.max( 0, Math.floor( ( o.y - radius ) * h ) ),
				y1 = Math.min( h - 1, Math.ceil( ( o.y + radius ) * h ) );
			const color = [ 1, 3, 5 ].map( ( n ) =>
				parseInt( o.color.slice( n, n + 2 ), 16 )
			);
			for ( let y = y0; y <= y1; y++ ) {
				for ( let x = x0; x <= x1; x++ ) {
					const i = y * w + x,
						d = this.localDistance(
							o,
							x / ( w - 1 ),
							y / ( h - 1 )
						);
					this.distance[ i ] = Math.min( this.distance[ i ], d );
					const cover = bounded( 0.5 - d / aa, 0, 1, 0 );
					if ( cover > 0 ) {
						const prev = this.rgba[ i * 4 + 3 ] / 255,
							total = cover + prev * ( 1 - cover );
						for ( let k = 0; k < 3; k++ ) {
							this.rgba[ i * 4 + k ] =
								( color[ k ] * cover +
									this.rgba[ i * 4 + k ] *
										prev *
										( 1 - cover ) ) /
								total;
						}
						this.rgba[ i * 4 + 3 ] = total * 255;
					} else if ( d < 0.025 && this.rgba[ i * 4 + 3 ] === 0 ) {
						// Keep straight-alpha interpolation from introducing a dark rim.
						for ( let k = 0; k < 3; k++ ) {
							this.rgba[ i * 4 + k ] = color[ k ];
						}
					}
				}
			}
		}
		if ( sim.kind === 'volume' ) {
			for ( const o of sim.obstacles ) {
				const margin = o.radius + 0.06;
				for (
					let y = Math.max( 0, Math.floor( ( o.y - margin ) * h ) );
					y < Math.min( h, Math.ceil( ( o.y + margin ) * h ) );
					y++
				) {
					for (
						let x = Math.max(
							0,
							Math.floor( ( o.x - margin / sim.aspect ) * w )
						);
						x <
						Math.min(
							w,
							Math.ceil( ( o.x + margin / sim.aspect ) * w )
						);
						x++
					) {
						const i = y * w + x,
							d =
								Math.hypot(
									( x / ( w - 1 ) - o.x ) * sim.aspect,
									y / ( h - 1 ) - o.y
								) - o.radius;
						this.distance[ i ] = Math.min( this.distance[ i ], d );
					}
				}
			}
			if (
				displace &&
				this.items.length &&
				sim.settings?.boundary !== 'open'
			) {
				const r = sim.spacing * 0.45;
				const free = this.distance.some(
					( d, i ) =>
						d >= r + 0.001 &&
						( ( i % w ) / ( w - 1 ) ) * sim.aspect >= r &&
						( ( i % w ) / ( w - 1 ) ) * sim.aspect <=
							sim.aspect - r &&
						Math.floor( i / w ) / ( h - 1 ) >= r &&
						Math.floor( i / w ) / ( h - 1 ) <= 1 - r
				);
				if ( ! free ) {
					throw Error( 'Obstacle covers the entire bath' );
				}
			}
		}
		this.revision++;
		if ( sim.wall && this.baseWall ) {
			const next = new Float32Array( sim.n );
			for ( let i = 0; i < sim.n; i++ ) {
				next[ i ] = Math.max(
					this.baseWall[ i ],
					bounded(
						0.5 -
							this.sample(
								( i % sim.w ) / ( sim.w - 1 ),
								Math.floor( i / sim.w ) / ( sim.h - 1 )
							) *
								sim.h,
						0,
						1,
						0
					)
				);
			}
			// A fully blocked bath has no displacement destination. Refuse the edit.
			if ( next.every( ( v ) => v > 0.5 ) ) {
				throw Error( 'Obstacle covers the entire bath' );
			}
			const nearest = nearestFree( next, sim.w, sim.h );
			if ( displace ) {
				sim.displaceObstacles( next, nearest );
			}
			sim.wall.set( next );
		}
		if ( displace && sim.kind === 'volume' ) {
			for ( let i = 0; i < sim.count; i++ ) {
				this.project( i );
			}
		}
	}
	snapshot() {
		return {
			version: 1,
			items: this.items.map( ( o ) => ( { ...o } ) ),
			assets: this.assets.map( ( a ) => ( {
				...a,
				loops: a.loops.map( ( loop ) => loop.map( ( p ) => [ ...p ] ) ),
			} ) ),
			baseWall: this.baseWall ? Array.from( this.baseWall ) : null,
		};
	}
}
