/** Pixelstorm physics and drawing, carried over from the approved sling prototype. */

export function createPixelstorm( {
	canvas,
	source,
	erasePaint,
	poster,
	brandShapes,
	onClose,
} ) {
	const ctx = canvas.getContext( '2d' );
	const reduced = window.matchMedia(
		'(prefers-reduced-motion: reduce)'
	).matches;
	const erased = document.createElement( 'canvas' ),
		trail = document.createElement( 'canvas' );
	const sc = source.getContext( '2d', { willReadFrequently: true } );
	const ic = erased.getContext( '2d' ),
		tc = trail.getContext( '2d' );
	let spriteSheet = null,
		spriteRevision = 0,
		disposed = false,
		closing = false,
		raf = 0;
	const controller = new AbortController();
	const listen = ( target, type, fn, options = {} ) =>
		target.addEventListener( type, fn, {
			...options,
			signal: controller.signal,
		} );
	const glow = document.createElement( 'canvas' );
	glow.width = glow.height = 64;
	const gc = glow.getContext( '2d' ),
		gg = gc.createRadialGradient( 32, 32, 0, 32, 32, 32 );
	gg.addColorStop( 0, '#ffdab0a0' );
	gg.addColorStop( 0.18, '#ffb27b45' );
	gg.addColorStop( 1, '#ff8d6000' );
	gc.fillStyle = gg;
	gc.fillRect( 0, 0, 64, 64 );
	const W = source.width,
		H = source.height;
	// Rasterize the large, static halo once. Rebuilding a full-screen radial
	// gradient per frame is expensive on software and mobile canvas renderers.
	const halo = document.createElement( 'canvas' );
	halo.width = W;
	halo.height = H;
	const hc = halo.getContext( '2d' );
	const haloGradient = hc.createRadialGradient(
		W * 0.28,
		H * 0.47,
		0,
		W * 0.28,
		H * 0.47,
		Math.min( 360, W * 0.4 )
	);
	haloGradient.addColorStop( 0, '#3b66ff12' );
	haloGradient.addColorStop( 1, '#3b66ff00' );
	hc.fillStyle = haloGradient;
	hc.fillRect( 0, 0, W, H );
	let DPR = 1,
		CELL = 8,
		cols = 0,
		rows = 0,
		grid = [],
		particles = [],
		active = [],
		waves = [];
	let holding = false,
		returning = false,
		holdTime = 0,
		time = 0,
		last = 0;
	const showTrails = ! reduced;
	let pointerId = null;
	let phase = 'idle',
		releasedAt = 0,
		formationAt = 0,
		logoAt = 0,
		sceneDim = 0,
		links = [],
		interactionCount = 0;
	let logoBox = { x: 0, y: 0, w: 0, h: 0 };
	const LOGO_WAIT = 10;
	const bag = {
		x: 0,
		y: 0,
		vx: 0,
		vy: 0,
		angle: 0,
		omega: 0,
		radius: 40,
		ax: 0,
		ay: 0,
		lag: 0,
		energy: 0,
		count: 0,
	};
	let shedCount = 0,
		shedBudget = 0,
		lastRelease = null;
	const logoMask = document.createElement( 'canvas' );
	const lc = logoMask.getContext( '2d', { willReadFrequently: true } );

	const pointer = {
		x: 0,
		y: 0,
		visible: false,
		vx: 0,
		vy: 0,
		previousX: 0,
		previousY: 0,
		turn: 0,
	};
	const rand = ( lo, hi ) => lo + Math.random() * ( hi - lo );
	const clamp = ( v, lo, hi ) => Math.max( lo, Math.min( hi, v ) );

	function buildScene() {
		for ( const c of [ erased, trail ] ) {
			c.width = W;
			c.height = H;
		}
		ic.clearRect( 0, 0, W, H );
		tc.clearRect( 0, 0, W, H );
		// An immutable bitmap keeps thousands of sprite draws on the fast image path.
		// The source canvas remains available for sampling and exact reconstruction.
		const revision = ++spriteRevision;
		const previous = spriteSheet;
		spriteSheet = null;
		if ( previous ) {
			previous.close();
		}
		if ( window.createImageBitmap ) {
			createImageBitmap( source )
				.then( ( bitmap ) => {
					if ( revision === spriteRevision ) {
						spriteSheet = bitmap;
					} else {
						bitmap.close();
					}
				} )
				.catch( () => {} );
		}
		CELL = Math.max(
			W < 620 ? 6 : 8,
			Math.ceil( Math.sqrt( ( W * H ) / 16000 ) )
		);
		cols = Math.ceil( W / CELL );
		rows = Math.ceil( H / CELL );
		grid = new Array( cols * rows );
		particles = [];
		active = [];
		waves = [];
		phase = 'idle';
		sceneDim = 0;
		links = [];
		interactionCount = 0;
		shedCount = 0;
		shedBudget = 0;
		lastRelease = null;
		const image = sc.getImageData( 0, 0, source.width, source.height ),
			pixels = image.data;
		for ( let gy = 0; gy < rows; gy++ ) {
			for ( let gx = 0; gx < cols; gx++ ) {
				const sx = gx * CELL,
					sy = gy * CELL,
					sw = Math.min( CELL, source.width - sx ),
					sh = Math.min( CELL, source.height - sy );
				let n = 0,
					r = 0,
					g = 0,
					b = 0;
				for ( let yy = 0; yy < sh; yy += 2 ) {
					for ( let xx = 0; xx < sw; xx += 2 ) {
						const at = ( ( sy + yy ) * source.width + sx + xx ) * 4;
						if ( pixels[ at + 3 ] > 35 ) {
							n++;
							r += pixels[ at ];
							g += pixels[ at + 1 ];
							b += pixels[ at + 2 ];
						}
					}
				}
				if ( ! n ) {
					continue;
				}
				const p = {
					id: particles.length,
					logoMix: 0,
					flash: 0,
					escapedAt: -100,
					caughtAt: 0,
					sx,
					sy,
					sw,
					sh,
					hx: sx + sw / 2,
					hy: sy + sh / 2,
					x: sx + sw / 2,
					y: sy + sh / 2,
					vx: 0,
					vy: 0,
					phase: rand( 0, Math.PI * 2 ),
					orbit: Math.sqrt( Math.random() ),
					spin: rand( -3, 3 ),
					angle: 0,
					state: 0,
					seed: Math.random(),
					rgb: [
						Math.round( r / n ),
						Math.round( g / n ),
						Math.round( b / n ),
					],
					color: `rgb(${ Math.round( r / n ) },${ Math.round(
						g / n
					) },${ Math.round( b / n ) })`,
					size: 1,
				};
				grid[ gy * cols + gx ] = p;
				particles.push( p );
			}
		}
		pointer.x = poster.x + poster.w * 0.5;
		pointer.y = poster.y + poster.h * 0.48;
		pointer.previousX = pointer.x;
		pointer.previousY = pointer.y;
		pointer.vx = pointer.vy = pointer.turn = 0;
		Object.assign( bag, {
			x: pointer.x,
			y: pointer.y + 22,
			vx: 0,
			vy: 0,
			angle: 0,
			omega: 0,
			radius: 40,
			ax: 0,
			ay: 0,
			lag: 0,
			energy: 0,
			count: 0,
		} );
	}

	function grab() {
		holding = true;
		returning = false;
		holdTime = 0;
		phase = 'gather';
		links = [];
		shedBudget = 0;
		pointer.visible = true;
		pointer.previousX = pointer.x;
		pointer.previousY = pointer.y;
		pointer.vx = pointer.vy = pointer.turn = 0;
		// Pick up a nearby cloud at its current position, keeping its momentum.
		const near = active.filter(
			( p ) => Math.hypot( p.x - pointer.x, p.y - pointer.y ) < 125
		);
		for ( const p of active ) {
			p.state = 2;
			p.escapedAt = -100;
		}
		Object.assign( bag, {
			x: pointer.x,
			y: pointer.y + 22,
			vx: 0,
			vy: 0,
			omega: 0,
			ax: 0,
			ay: 0,
			lag: 0,
			energy: 0,
			count: 0,
		} );
		if ( near.length ) {
			bag.x = near.reduce( ( n, p ) => n + p.x, 0 ) / near.length;
			bag.y = near.reduce( ( n, p ) => n + p.y, 0 ) / near.length;
			bag.vx = near.reduce( ( n, p ) => n + p.vx, 0 ) / near.length;
			bag.vy = near.reduce( ( n, p ) => n + p.vy, 0 ) / near.length;
			for ( const p of near ) {
				p.state = 1;
				p.caughtAt = time;
			}
		}
	}
	function detach( p ) {
		p.state = 1;
		p.x = p.hx;
		p.y = p.hy;
		p.vx = rand( -20, 20 );
		p.vy = rand( -20, 20 );
		p.angle = 0;
		p.size = 1;
		p.logoMix = 0;
		p.flash = 0;
		p.caughtAt = time;
		p.escapedAt = -100;
		active.push( p );
		ic.drawImage(
			erasePaint,
			p.sx,
			p.sy,
			p.sw,
			p.sh,
			p.sx,
			p.sy,
			p.sw,
			p.sh
		);
	}
	function collect( dt ) {
		const radius = 55 + Math.min( holdTime, 2.5 ) * 15;
		const x0 = clamp(
				Math.floor( ( pointer.x - radius ) / CELL ),
				0,
				cols - 1
			),
			x1 = clamp(
				Math.ceil( ( pointer.x + radius ) / CELL ),
				0,
				cols - 1
			);
		const y0 = clamp(
				Math.floor( ( pointer.y - radius ) / CELL ),
				0,
				rows - 1
			),
			y1 = clamp(
				Math.ceil( ( pointer.y + radius ) / CELL ),
				0,
				rows - 1
			);
		let quota = Math.max( 10, Math.ceil( 1500 * dt ) );
		for ( let y = y0; y <= y1; y++ ) {
			for ( let x = x0; x <= x1; x++ ) {
				const p = grid[ y * cols + x ];
				if ( ! p || p.state !== 0 ) {
					continue;
				}
				if (
					( p.hx - pointer.x ) ** 2 + ( p.hy - pointer.y ) ** 2 <
						radius * radius &&
					quota > 0
				) {
					detach( p );
					quota--;
				}
			}
		}
		// A thrown pixel remains free for a moment before it can be caught again.
		for ( const p of active ) {
			if (
				p.state === 2 &&
				time - p.escapedAt > 1.25 &&
				Math.hypot( p.x - pointer.x, p.y - pointer.y ) < radius * 0.9
			) {
				p.state = 1;
				p.caughtAt = time;
			}
		}
	}
	function release() {
		if ( ! holding ) {
			return;
		}
		holding = false;
		if ( active.length ) {
			phase = 'swarm';
			releasedAt = time;
			links = [];
			let vx = 0,
				vy = 0,
				n = 0,
				speed = 0;
			for ( const p of active ) {
				if ( p.state === 1 ) {
					vx += p.vx;
					vy += p.vy;
					speed += Math.hypot( p.vx, p.vy );
					n++;
				}
				p.state = 2;
			}
			// Letting go releases the actual velocity. No synthetic radial explosion.
			lastRelease = {
				vx: n ? vx / n : 0,
				vy: n ? vy / n : 0,
				speed: n ? speed / n : 0,
				count: n,
			};
			if ( lastRelease.speed > 220 ) {
				waves.push( {
					x: bag.x,
					y: bag.y,
					t: 0,
					energy: clamp( lastRelease.speed / 1100, 0, 1 ),
				} );
			}
		} else {
			phase = 'idle';
		}
	}
	function moveBag( dt ) {
		bag.count = active.reduce(
			( n, p ) => n + ( p.state === 1 ? 1 : 0 ),
			0
		);
		const mass = 1 + Math.min( 2, bag.count / 1350 ),
			spring = 38 / mass,
			drag = 4.3 / Math.sqrt( mass );
		bag.ax = ( pointer.x - bag.x ) * spring - bag.vx * drag;
		bag.ay = ( pointer.y + 22 - bag.y ) * spring - bag.vy * drag + 105;
		const force = Math.hypot( bag.ax, bag.ay );
		if ( force > 7000 ) {
			bag.ax *= 7000 / force;
			bag.ay *= 7000 / force;
		}
		bag.vx += bag.ax * dt;
		bag.vy += bag.ay * dt;
		const speed = Math.hypot( bag.vx, bag.vy );
		if ( speed > 2100 ) {
			bag.vx *= 2100 / speed;
			bag.vy *= 2100 / speed;
		}
		bag.x += bag.vx * dt;
		bag.y += bag.vy * dt;
		if ( bag.x < 12 ) {
			bag.x = 12;
			bag.vx = Math.abs( bag.vx ) * 0.45;
		} else if ( bag.x > W - 12 ) {
			bag.x = W - 12;
			bag.vx = -Math.abs( bag.vx ) * 0.45;
		}
		if ( bag.y < 12 ) {
			bag.y = 12;
			bag.vy = Math.abs( bag.vy ) * 0.45;
		} else if ( bag.y > H - 12 ) {
			bag.y = H - 12;
			bag.vy = -Math.abs( bag.vy ) * 0.45;
		}
		const dx = pointer.x - bag.x,
			dy = pointer.y - bag.y;
		const torque =
			( dx * ( pointer.vy - bag.vy ) - dy * ( pointer.vx - bag.vx ) ) /
			( dx * dx + dy * dy + 3600 );
		if ( Math.hypot( pointer.vx, pointer.vy ) > 70 ) {
			const drive = clamp( pointer.turn * 0.55 + torque * 0.6, -11, 11 );
			bag.omega += ( drive - bag.omega ) * ( 1 - Math.exp( -dt * 3 ) );
		} else {
			bag.omega *= Math.exp( -dt * 1.3 );
		}
		bag.angle += bag.omega * dt;
		const radius = Math.min(
			132,
			W * 0.23,
			23 + Math.sqrt( bag.count ) * 1.85
		);
		bag.radius += ( radius - bag.radius ) * ( 1 - Math.exp( -dt * 4 ) );
		bag.lag = Math.hypot( dx, dy );
		const energy = clamp(
			( Math.abs( bag.omega ) * bag.radius +
				Math.hypot( bag.vx, bag.vy ) * 0.3 ) /
				820,
			0,
			1
		);
		bag.energy += ( energy - bag.energy ) * ( 1 - Math.exp( -dt * 5 ) );
		shedBudget =
			bag.energy > 0.2
				? Math.min( 3, shedBudget + dt * ( 7 + bag.energy * 44 ) )
				: 0;
	}
	function slingPixel( p, dt ) {
		p.logoMix = Math.max( 0, p.logoMix - dt * 2.5 );
		const angle = p.phase + bag.angle,
			r = 10 + p.orbit * bag.radius,
			dx = pointer.x - bag.x,
			dy = pointer.y - bag.y;
		const len = Math.max( 1, Math.hypot( dx, dy ) ),
			nx = dx / len,
			ny = dy / len,
			stretch = clamp( bag.lag / 230, 0, 0.72 );
		let rx = Math.cos( angle ) * r,
			ry = Math.sin( angle ) * r * 0.82;
		const along = rx * nx + ry * ny;
		rx += nx * along * stretch;
		ry += ny * along * stretch;
		const targetX = bag.x + rx,
			targetY = bag.y + ry;
		const spring = ( 25 + ( 1 - p.orbit ) * 30 ) * ( 0.85 + p.seed * 0.3 ),
			drag = 3.4 + ( 1 - p.orbit ) * 1.4;
		p.vx +=
			( ( targetX - p.x ) * spring -
				( p.vx - bag.vx ) * drag +
				p.fx * 0.35 ) *
			dt;
		p.vy +=
			( ( targetY - p.y ) * spring -
				( p.vy - bag.vy ) * drag +
				p.fy * 0.35 ) *
			dt;
		const speed = Math.hypot( p.vx, p.vy );
		if ( speed > 2400 ) {
			p.vx *= 2400 / speed;
			p.vy *= 2400 / speed;
		}
		p.x += p.vx * dt;
		p.y += p.vy * dt;
		p.angle += ( bag.omega * 0.5 + p.spin * 0.08 ) * dt;
		p.size +=
			( 0.64 + p.orbit * 0.09 - p.size ) * ( 1 - Math.exp( -dt * 3 ) );
		const radial = Math.hypot( p.x - bag.x, p.y - bag.y );
		const load =
			bag.omega * bag.omega * r +
			Math.hypot( bag.ax, bag.ay ) * p.orbit * 0.3 +
			Math.max( 0, radial - bag.radius * 1.25 ) * 16;
		const binding = 1050 + p.seed * 1600 + ( 1 - p.orbit ) * 2600;
		if (
			p.orbit > 0.58 &&
			bag.count > 28 &&
			time - p.caughtAt > 0.45 &&
			shedBudget >= 1 &&
			load > binding
		) {
			const offsetX = p.x - bag.x,
				offsetY = p.y - bag.y;
			p.vx = p.vx * 0.8 + ( bag.vx - bag.omega * offsetY ) * 0.2;
			p.vy = p.vy * 0.8 + ( bag.vy + bag.omega * offsetX ) * 0.2;
			p.state = 2;
			p.escapedAt = time;
			p.flash = 1;
			shedCount++;
			shedBudget--;
			bag.count--;
		}
	}
	function restore() {
		holding = false;
		pointerId = null;
		links = [];
		if ( ! active.length ) {
			if ( closing ) {
				onClose();
			}
			return;
		}
		returning = true;
		phase = 'returning';
		waves = [];
		for ( const p of active ) {
			p.state = 3;
			p.fromX = p.x;
			p.fromY = p.y;
			p.fromAngle = p.angle;
			p.fromMix = p.logoMix || 0;
			p.start = time + p.seed * 0.32;
			p.duration = ( reduced ? 0.55 : 1.35 ) + p.seed * 0.5;
			p.curve = ( p.seed - 0.5 ) * ( reduced ? 30 : 200 );
		}
	}
	// The final silhouette is sampled from the actual WunderPaint vector logo.
	// Every original tile gets one destination. No network, font or image dependency.
	function assignLogo() {
		const width = Math.min( 850, W - ( W < 620 ? 52 : 120 ) ),
			height = ( width * 18.83 ) / 96.03;
		logoBox = {
			x: ( W - width ) / 2,
			y: H * 0.47 - height / 2,
			w: width,
			h: height,
		};
		logoMask.width = Math.ceil( width );
		logoMask.height = Math.ceil( height );
		lc.setTransform( width / 96.03, 0, 0, height / 18.83, 0, 0 );
		for ( const shape of brandShapes ) {
			lc.fillStyle = shape.color;
			if ( shape.path ) {
				lc.fill( shape.path );
			} else {
				lc.beginPath();
				lc.arc( ...shape.circle, 0, Math.PI * 2 );
				lc.fill();
			}
		}
		const raw = lc.getImageData( 0, 0, logoMask.width, logoMask.height );
		let area = 0;
		for ( let i = 3; i < raw.data.length; i += 4 ) {
			if ( raw.data[ i ] > 155 ) {
				area++;
			}
		}
		// Use a regular pixel grid. Sampling a flattened list produces diagonal bands.
		const spacing = Math.max(
				0.7,
				Math.sqrt( area / particles.length ) * 0.98
			),
			points = [];
		for ( let x = spacing / 2; x < raw.width; x += spacing ) {
			for ( let y = spacing / 2; y < raw.height; y += spacing ) {
				const at =
					( Math.floor( y ) * raw.width + Math.floor( x ) ) * 4;
				if ( raw.data[ at + 3 ] > 155 ) {
					points.push( {
						x,
						y,
						rgb: [
							raw.data[ at ],
							raw.data[ at + 1 ],
							raw.data[ at + 2 ],
						],
						color: `rgb(${ raw.data[ at ] },${
							raw.data[ at + 1 ]
						},${ raw.data[ at + 2 ] })`,
					} );
				}
			}
		}
		const ordered = [ ...particles ].sort(
			( a, b ) => a.hx - b.hx || a.hy - b.hy
		);
		ordered.forEach( ( p, i ) => {
			const target =
				points[
					Math.min(
						points.length - 1,
						Math.floor(
							( ( i + 0.5 ) * points.length ) / ordered.length
						)
					)
				];
			p.lx = logoBox.x + target.x;
			p.ly = logoBox.y + target.y;
			p.lcolor = target.color;
			p.lrgb = target.rgb;
			p.lsize = spacing * 0.94;
		} );
	}
	function formLogo() {
		if ( ! particles.length ) {
			return;
		}

		assignLogo();
		holding = false;
		returning = false;
		pointerId = null;
		phase = 'forming';
		formationAt = time;
		links = [];
		// Remaining pieces join the finale, so even a short gesture produces a clear logo.
		for ( const p of particles ) {
			if ( p.state === 0 ) {
				detach( p );
			}
			p.state = 4;
			p.formDelay =
				p.seed * 0.55 + ( Math.abs( p.hx - W / 2 ) / W ) * 0.4;
			p.fromAngle = p.angle;
			p.logoMix = 0;
		}
	}
	// A bounded spatial neighbor search keeps the swarm interactive. Nearby pixels
	// align, attract at medium distance and repel when they come too close.
	function interact() {
		const buckets = new Map(),
			span = 44,
			byWidth = Math.ceil( W / span ) + 4;
		links = [];
		for ( const p of active ) {
			p.fx = 0;
			p.fy = 0;
			const key =
				Math.floor( p.x / span ) +
				1 +
				( Math.floor( p.y / span ) + 1 ) * byWidth;
			let bucket = buckets.get( key );
			if ( ! bucket ) {
				bucket = [];
				buckets.set( key, bucket );
			}
			bucket.push( p );
		}
		const elapsed = time - releasedAt,
			forceGain = holding ? 0 : clamp( ( elapsed - 1.2 ) / 3.5, 0, 1 );
		for ( const p of active ) {
			const cellX = Math.floor( p.x / span ) + 1,
				cellY = Math.floor( p.y / span ) + 1;
			let n = 0,
				sx = 0,
				sy = 0,
				svx = 0,
				svy = 0,
				checks = 0;
			for ( let cy = -1; cy <= 1; cy++ ) {
				for ( let cx = -1; cx <= 1; cx++ ) {
					const bucket = buckets.get(
						cellX + cx + ( cellY + cy ) * byWidth
					);
					if ( ! bucket ) {
						continue;
					}
					// Rotate the starting index to avoid favoring the same neighbors in dense cells.
					const start = p.id % bucket.length;
					for (
						let j = 0;
						j < Math.min( bucket.length, 24 ) &&
						checks < 96 &&
						n < 28;
						j++
					) {
						const q = bucket[ ( start + j ) % bucket.length ];
						if ( q === p ) {
							continue;
						}
						checks++;
						const dx = q.x - p.x,
							dy = q.y - p.y,
							d2 = dx * dx + dy * dy;
						if ( d2 >= span * span || d2 < 0.01 ) {
							continue;
						}
						const d = Math.sqrt( d2 );
						n++;
						sx += q.x;
						sy += q.y;
						svx += q.vx;
						svy += q.vy;
						const collision =
							( p.sw + q.sw ) * ( holding ? 0.25 : 0.38 );
						if ( d < collision + 7 ) {
							const repulsion =
								( 1 - d / ( collision + 7 ) ) *
								( holding ? 145 : 320 );
							p.fx -= ( dx / d ) * repulsion;
							p.fy -= ( dy / d ) * repulsion;
							const closingSpeed =
								( ( q.vx - p.vx ) * dx +
									( q.vy - p.vy ) * dy ) /
								d;
							if ( d < collision && closingSpeed < 0 ) {
								p.fx += ( dx / d ) * closingSpeed * 3;
								p.fy += ( dy / d ) * closingSpeed * 3;
								p.flash = 1;
								interactionCount++;
							}
						}
						if (
							p.id < q.id &&
							d < 28 &&
							links.length < 150 &&
							( p.id + q.id ) % 9 === 0
						) {
							links.push( {
								a: p,
								b: q,
								alpha: ( 1 - d / 32 ) * 0.23,
							} );
						}
					}
				}
			}
			if ( n ) {
				const cohesion = holding ? 0.2 : 0.9,
					alignment = holding ? 0.22 : 0.6;
				p.fx +=
					( sx / n - p.x ) * cohesion +
					( svx / n - p.vx ) * alignment;
				p.fy +=
					( sy / n - p.y ) * cohesion +
					( svy / n - p.vy ) * alignment;
			}
			const group = p.id % 3,
				angle = time * 0.22 + ( group * Math.PI * 2 ) / 3;
			const cx = W / 2 + Math.cos( angle ) * Math.min( 190, W * 0.18 ),
				cy = H * 0.49 + Math.sin( angle ) * Math.min( 100, H * 0.16 );
			const dx = cx - p.x,
				dy = cy - p.y;
			p.fx += ( dx * 0.5 - dy * 0.3 ) * forceGain;
			p.fy += ( dy * 0.5 + dx * 0.3 ) * forceGain;
			const strength = Math.hypot( p.fx, p.fy );
			if ( strength > 620 ) {
				p.fx *= 620 / strength;
				p.fy *= 620 / strength;
			}
		}
	}

	function update( dt ) {
		let pvx = ( pointer.x - pointer.previousX ) / Math.max( dt, 0.001 ),
			pvy = ( pointer.y - pointer.previousY ) / Math.max( dt, 0.001 );
		const rawSpeed = Math.hypot( pvx, pvy );
		if ( rawSpeed > 3600 ) {
			pvx *= 3600 / rawSpeed;
			pvy *= 3600 / rawSpeed;
		}
		const oldVX = pointer.vx,
			oldVY = pointer.vy,
			blend = 1 - Math.exp( -dt * 18 );
		pointer.vx += ( pvx - pointer.vx ) * blend;
		pointer.vy += ( pvy - pointer.vy ) * blend;
		const turn =
			( oldVX * pointer.vy - oldVY * pointer.vx ) /
			( Math.max( dt, 0.001 ) *
				( pointer.vx * pointer.vx + pointer.vy * pointer.vy + 16000 ) );
		pointer.turn +=
			( clamp( turn, -15, 15 ) - pointer.turn ) *
			( 1 - Math.exp( -dt * 9 ) );
		pointer.previousX = pointer.x;
		pointer.previousY = pointer.y;
		if ( holding ) {
			holdTime += dt;
			collect( dt );
			moveBag( dt );
		}
		if ( phase === 'logo' && time - logoAt > 10 ) {
			closing = true;
			restore();
		}
		if ( phase === 'swarm' && time - releasedAt > LOGO_WAIT ) {
			formLogo();
		}
		if ( ( holding || phase === 'swarm' ) && active.length ) {
			interact();
		} else {
			links = [];
		}
		const desiredDim = phase === 'forming' || phase === 'logo' ? 0.94 : 0;
		sceneDim += ( desiredDim - sceneDim ) * ( 1 - Math.exp( -dt * 2.8 ) );
		if ( phase === 'idle' ) {
			sceneDim = 0;
		}
		if ( showTrails ) {
			tc.globalCompositeOperation = 'destination-out';
			tc.fillStyle = `rgba(0,0,0,${
				1 - Math.exp( -dt * ( phase === 'logo' ? 12 : 5 ) )
			})`;
			tc.fillRect( 0, 0, W, H );
			tc.globalCompositeOperation = 'source-over';
		} else {
			tc.clearRect( 0, 0, W, H );
		}
		for ( const p of active ) {
			const ox = p.x,
				oy = p.y;
			p.flash = Math.max( 0, p.flash - dt * 4 );
			if ( holding && p.state === 1 ) {
				slingPixel( p, dt );
			} else if ( p.state === 2 ) {
				p.logoMix = Math.max( 0, p.logoMix - dt * 2 );
				const damp = Math.exp( -dt * ( holding ? 0.22 : 0.14 ) );
				p.vx = ( p.vx + p.fx * dt ) * damp;
				p.vy = ( p.vy + ( p.fy + ( holding ? 65 : 12 ) ) * dt ) * damp;
				const speed = Math.hypot( p.vx, p.vy );
				if ( speed > 2400 ) {
					p.vx *= 2400 / speed;
					p.vy *= 2400 / speed;
				}
				p.x += p.vx * dt;
				p.y += p.vy * dt;
				p.angle += p.spin * dt * 0.6;
				p.size += ( 0.82 - p.size ) * dt;
				if ( p.x < 5 ) {
					p.x = 5;
					p.vx = Math.abs( p.vx ) * 0.7;
				} else if ( p.x > W - 5 ) {
					p.x = W - 5;
					p.vx = -Math.abs( p.vx ) * 0.7;
				}
				if ( p.y < 5 ) {
					p.y = 5;
					p.vy = Math.abs( p.vy ) * 0.7;
				} else if ( p.y > H - 5 ) {
					p.y = H - 5;
					p.vy = -Math.abs( p.vy ) * 0.7;
				}
			} else if ( p.state === 3 ) {
				const t = clamp( ( time - p.start ) / p.duration, 0, 1 ),
					ease = t * t * ( 3 - 2 * t ),
					arc = Math.sin( t * Math.PI ) * p.curve;
				const dx = p.hx - p.fromX,
					dy = p.hy - p.fromY,
					d = Math.max( 1, Math.hypot( dx, dy ) );
				p.x = p.fromX + dx * ease - ( dy / d ) * arc;
				p.y = p.fromY + dy * ease + ( dx / d ) * arc;
				p.angle = p.fromAngle * ( 1 - ease );
				p.size = 0.82 + 0.18 * ease;
				p.logoMix = p.fromMix * ( 1 - ease );
				if ( t >= 1 ) {
					p.state = 0;
					p.x = p.hx;
					p.y = p.hy;
					p.angle = 0;
					p.logoMix = 0;
					ic.clearRect( p.sx, p.sy, p.sw, p.sh );
				}
			} else if ( p.state === 4 ) {
				const age = time - formationAt - p.formDelay;
				if ( age >= 0 ) {
					const progress = clamp(
							age / ( reduced ? 1.8 : 4.8 ),
							0,
							1
						),
						ease = progress * progress * ( 3 - 2 * progress );
					const spring = 9 + ease * 30,
						damp = Math.exp( -dt * ( 4.8 + ease * 5 ) );
					const sway = reduced
						? 0
						: ( 1 - ease ) * Math.sin( age * 2 + p.phase ) * 60;
					p.vx =
						( p.vx + ( p.lx + sway - p.x ) * spring * dt ) * damp;
					p.vy = ( p.vy + ( p.ly - p.y ) * spring * dt ) * damp;
					p.x += p.vx * dt;
					p.y += p.vy * dt;
					p.angle = p.fromAngle * ( 1 - ease );
					p.logoMix = ease;
					p.size += ( 0.75 - p.size ) * dt * 2;
				}
			} else if ( p.state === 5 ) {
				p.x = p.lx;
				p.y = p.ly;
				p.angle = 0;
				p.logoMix = 1;
			}
			if (
				showTrails &&
				p.state &&
				p.seed > 0.65 &&
				Math.hypot( p.x - ox, p.y - oy ) > 1
			) {
				tc.globalAlpha =
					p.state === 2 && holding ? 0.52 : holding ? 0.25 : 0.35;
				tc.strokeStyle = p.logoMix > 0.6 ? p.lcolor : p.color;
				tc.lineWidth = p.seed > 0.93 ? 2 : 1;
				tc.beginPath();
				tc.moveTo( ox, oy );
				tc.lineTo( p.x, p.y );
				tc.stroke();
			}
		}
		tc.globalAlpha = 1;
		if ( returning ) {
			active = active.filter( ( p ) => p.state !== 0 );
			if ( ! active.length ) {
				returning = false;
				phase = 'idle';
				sceneDim = 0;
				tc.clearRect( 0, 0, W, H );

				if ( closing ) {
					onClose();
				}
			}
		}
		if (
			phase === 'forming' &&
			time - formationAt > ( reduced ? 3.8 : 8 )
		) {
			phase = 'logo';
			logoAt = time;
			for ( const p of active ) {
				p.state = 5;
				p.x = p.lx;
				p.y = p.ly;
				p.vx = 0;
				p.vy = 0;
				p.angle = 0;
				p.logoMix = 1;
			}
			tc.clearRect( 0, 0, W, H );
		}
		for ( const w of waves ) {
			w.t += dt;
		}
		waves = waves.filter( ( w ) => w.t < 1.25 );
	}
	function render() {
		ctx.setTransform( DPR, 0, 0, DPR, 0, 0 );
		ctx.globalAlpha = 1;
		ctx.globalCompositeOperation = 'source-over';
		ctx.clearRect( 0, 0, W, H );
		ctx.drawImage( erased, 0, 0 );
		if ( sceneDim > 0.001 ) {
			ctx.fillStyle = `rgba(10,14,22,${ sceneDim })`;
			ctx.fillRect( 0, 0, W, H );
		}
		if ( phase === 'forming' || phase === 'logo' ) {
			const a =
				phase === 'logo'
					? 1
					: clamp( ( time - formationAt - 1.2 ) / 2.8, 0, 1 );
			ctx.save();
			ctx.globalAlpha = a;
			ctx.drawImage( halo, 0, 0 );

			ctx.restore();
		}
		if ( links.length && showTrails ) {
			ctx.save();
			ctx.globalCompositeOperation = 'screen';
			ctx.strokeStyle = '#afc9ff';
			ctx.lineWidth = 0.7;
			for ( const edge of links ) {
				ctx.globalAlpha = edge.alpha;
				ctx.beginPath();
				ctx.moveTo( edge.a.x, edge.a.y );
				ctx.lineTo( edge.b.x, edge.b.y );
				ctx.stroke();
			}
			ctx.restore();
		}
		if ( showTrails ) {
			ctx.globalCompositeOperation = 'screen';
			ctx.drawImage( trail, 0, 0 );
			ctx.globalCompositeOperation = 'source-over';
		}
		if ( holding && bag.count ) {
			const radius = bag.radius + 24,
				dx = bag.x - pointer.x,
				dy = bag.y - pointer.y,
				len = Math.max( 1, Math.hypot( dx, dy ) ),
				bend = clamp( bag.omega * 5, -35, 35 );
			ctx.save();
			ctx.strokeStyle = `rgba(255,198,142,${ 0.2 + bag.energy * 0.36 })`;
			ctx.lineWidth = 1 + bag.energy * 0.6;
			ctx.beginPath();
			ctx.moveTo( pointer.x, pointer.y );
			ctx.quadraticCurveTo(
				( pointer.x + bag.x ) / 2 - ( dy / len ) * bend,
				( pointer.y + bag.y ) / 2 + ( dx / len ) * bend,
				bag.x,
				bag.y
			);
			ctx.stroke();
			ctx.globalCompositeOperation = 'screen';
			ctx.globalAlpha = 0.2 + bag.energy * 0.16;
			ctx.drawImage(
				glow,
				bag.x - radius,
				bag.y - radius,
				radius * 2,
				radius * 2
			);
			ctx.restore();
		}
		// Draw glows in one pass, avoiding a compositing-mode switch per particle.
		if ( showTrails && phase !== 'logo' ) {
			ctx.globalCompositeOperation = 'screen';
			for ( const p of active ) {
				if ( p.seed > 0.97 && ( p.logoMix || 0 ) < 0.8 ) {
					ctx.globalAlpha = 0.27 * ( 1 - ( p.logoMix || 0 ) );
					ctx.drawImage( glow, p.x - 15, p.y - 15, 30, 30 );
				}
			}
			ctx.globalAlpha = 1;
			ctx.globalCompositeOperation = 'source-over';
		}
		for ( const p of active ) {
			const ca = Math.cos( p.angle ) * DPR,
				sa = Math.sin( p.angle ) * DPR;
			ctx.setTransform( ca, sa, -sa, ca, p.x * DPR, p.y * DPR );
			const mix = p.logoMix || 0,
				size = p.size;
			if ( p.state === 4 || p.state === 5 || mix > 0.01 ) {
				const dot = p.sw * size * ( 1 - mix ) + p.lsize * mix;
				const red = Math.round(
						p.rgb[ 0 ] * ( 1 - mix ) + p.lrgb[ 0 ] * mix
					),
					green = Math.round(
						p.rgb[ 1 ] * ( 1 - mix ) + p.lrgb[ 1 ] * mix
					),
					blue = Math.round(
						p.rgb[ 2 ] * ( 1 - mix ) + p.lrgb[ 2 ] * mix
					);
				ctx.fillStyle = `rgb(${ red },${ green },${ blue })`;
				ctx.fillRect( -dot / 2, -dot / 2, dot, dot );
			} else {
				ctx.drawImage(
					spriteSheet || source,
					p.sx,
					p.sy,
					p.sw,
					p.sh,
					( -p.sw * size ) / 2,
					( -p.sh * size ) / 2,
					p.sw * size,
					p.sh * size
				);
			}
			if (
				p.flash > 0 &&
				showTrails &&
				( phase === 'swarm' || holding )
			) {
				ctx.globalAlpha = p.flash * 0.65;
				ctx.fillStyle = '#f5e4cc';
				ctx.fillRect( -1, -1, 2, 2 );
				ctx.globalAlpha = 1;
			}
		}
		ctx.setTransform( DPR, 0, 0, DPR, 0, 0 );
		for ( const wave of waves ) {
			const t = wave.t / 1.25,
				radius = 18 + ( 1 - ( 1 - t ) ** 3 ) * ( reduced ? 110 : 420 );
			ctx.save();
			ctx.globalCompositeOperation = 'screen';
			ctx.globalAlpha = ( 1 - t ) ** 2 * 0.6;
			ctx.strokeStyle = '#ffca9b';
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.arc( wave.x, wave.y, radius, 0, Math.PI * 2 );
			ctx.stroke();
			ctx.globalAlpha = ( 1 - t ) ** 3 * 0.27;
			ctx.lineWidth = 14 * ( 1 - t );
			ctx.beginPath();
			ctx.arc( wave.x, wave.y, radius * 0.98, 0, Math.PI * 2 );
			ctx.stroke();
			ctx.restore();
		}
		if ( pointer.visible ) {
			ctx.save();
			ctx.translate( pointer.x, pointer.y );
			const r = holding ? 16 + Math.sin( time * 3 ) * 1.5 : 12;
			ctx.strokeStyle = holding ? '#ffd7af' : '#ffe1c6';
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.arc( 0, 0, r, 0, Math.PI * 2 );
			ctx.stroke();
			ctx.strokeStyle = '#ffc89350';
			ctx.beginPath();
			ctx.arc( 0, 0, r + 5, 0, Math.PI * 2 );
			ctx.stroke();
			if ( holding ) {
				ctx.strokeStyle = '#ffc89390';
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.arc(
					0,
					0,
					r + 8,
					-Math.PI / 2,
					-Math.PI / 2 + Math.PI * 2 * bag.energy
				);
				ctx.stroke();
			} else {
				ctx.strokeStyle = '#ffffffa0';
				ctx.beginPath();
				ctx.moveTo( -3, 0 );
				ctx.lineTo( 3, 0 );
				ctx.moveTo( 0, -3 );
				ctx.lineTo( 0, 3 );
				ctx.stroke();
			}
			ctx.restore();
		}
	}

	function movePointer( e ) {
		const r = canvas.getBoundingClientRect();
		pointer.x = clamp( e.clientX - r.left, 0, W );
		pointer.y = clamp( e.clientY - r.top, 0, H );
		pointer.visible = true;
	}
	listen( canvas, 'pointerdown', ( e ) => {
		if ( closing || e.button !== 0 || pointerId !== null ) {
			return;
		}
		e.preventDefault();

		movePointer( e );
		pointerId = e.pointerId;
		canvas.setPointerCapture( e.pointerId );
		grab();
	} );
	listen( canvas, 'pointermove', ( e ) => {
		if ( closing ) {
			return;
		}
		if ( pointerId !== null && e.pointerId !== pointerId ) {
			return;
		}
		movePointer( e );
	} );
	listen( canvas, 'pointerup', ( e ) => {
		if ( e.pointerId !== pointerId ) {
			return;
		}
		movePointer( e );
		release();
		pointerId = null;
		if ( canvas.hasPointerCapture( e.pointerId ) ) {
			canvas.releasePointerCapture( e.pointerId );
		}
		if ( e.pointerType === 'touch' ) {
			pointer.visible = false;
		}
	} );
	listen( canvas, 'pointercancel', () => {
		pointerId = null;
		release();
		pointer.visible = false;
	} );
	listen( canvas, 'lostpointercapture', () => {
		if ( holding ) {
			release();
		}
		pointerId = null;
	} );
	listen( canvas, 'pointerleave', () => {
		if ( ! holding ) {
			pointer.visible = false;
		}
	} );
	listen( canvas, 'contextmenu', ( e ) => e.preventDefault() );
	listen( window, 'blur', () => {
		release();
		pointerId = null;
		pointer.visible = false;
	} );
	listen( document, 'visibilitychange', () => {
		if ( document.hidden ) {
			release();
			pointerId = null;
		}
		last = performance.now() / 1000;
	} );
	function frame( nowMs ) {
		if ( disposed ) {
			return;
		}
		const now = nowMs / 1000,
			elapsed = Math.max( 0, now - ( last || now ) ),
			dt = Math.min( 0.035, Math.max( 0.001, elapsed ) );
		last = now;
		if ( ! document.hidden ) {
			// Choreography uses visible elapsed time, forces use a bounded step.
			// A stalled frame must not stretch the 10-second invitation to play.
			time += elapsed;

			update( dt );
			if ( disposed ) {
				return;
			}
			render();
		}
		raf = requestAnimationFrame( frame );
	}
	DPR = Math.min( window.devicePixelRatio || 1, 1.5 );
	canvas.width = Math.round( W * DPR );
	canvas.height = Math.round( H * DPR );
	buildScene();

	render();
	raf = requestAnimationFrame( frame );
	return {
		close() {
			if ( closing ) {
				onClose();
				return;
			}
			closing = true;
			pointer.visible = false;
			restore();
		},
		destroy() {
			if ( disposed ) {
				return;
			}
			disposed = true;
			controller.abort();
			cancelAnimationFrame( raf );
			spriteRevision++;
			spriteSheet?.close();
			spriteSheet = null;
			for ( const c of [
				canvas,
				source,
				erasePaint,
				erased,
				trail,
				logoMask,
				halo,
				glow,
			] ) {
				c.width = c.height = 0;
			}
		},
		inspect: () => ( {
			total: particles.length,
			active: active.length,
			holding,
			returning,
			phase,
			atHome: particles.every( ( p ) => p.state === 0 ),
			poster: { ...poster },
			bag: { ...bag },
			shedCount,
			attached: active.filter( ( p ) => p.state === 1 ).length,
			loose: active.filter( ( p ) => p.state === 2 ).length,
			lastRelease,
			logoWait: LOGO_WAIT,
			clock: time,
			interactionCount,
			logoBox: { ...logoBox },
			finite: active.every(
				( p ) =>
					Number.isFinite( p.x ) &&
					Number.isFinite( p.y ) &&
					Number.isFinite( p.vx ) &&
					Number.isFinite( p.vy )
			),
		} ),
	};
}
