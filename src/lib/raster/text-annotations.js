/**
 * Deterministic pen, pencil and chisel-ink marks in text-local coordinates.
 * Paths and pigment fibers scale with the type, not with viewport pixels.
 * No image textures, pixel reads or destructive compositing are needed.
 */
const TAU = Math.PI * 2;
const clamp = ( value, low, high ) => Math.max( low, Math.min( high, value ) );
const mix = ( a, b, t ) => a + ( b - a ) * t;
const unit = ( value, fallback ) => clamp( value ?? fallback, 0, 100 ) / 100;
const randomFor = ( seed ) => {
	let value = ( Math.round( seed ) || 1 ) >>> 0;
	return () => {
		value = ( Math.imul( value, 1664525 ) + 1013904223 ) >>> 0;
		return value / 4294967296;
	};
};
const sample = ( count, point ) =>
	Array.from( { length: count + 1 }, ( _, i ) => point( i / count ) );
const stepsFor = ( length, size ) =>
	clamp( Math.ceil( length / Math.max( 1, size * 0.07 ) ), 20, 260 );

function line( x0, y0, x1, y1, size, rough, seed, bow = 0 ) {
	const rnd = randomFor( seed ),
		phase = rnd() * TAU,
		bend = ( rnd() - 0.5 ) * size * 0.016 * rough + bow,
		length = Math.hypot( x1 - x0, y1 - y0 ) || 1,
		nx = -( y1 - y0 ) / length,
		ny = ( x1 - x0 ) / length;
	return sample( stepsFor( length, size ), ( t ) => {
		const drift =
			Math.sin( t * Math.PI ) *
			( bend +
				size * rough * 0.0035 * Math.sin( t * TAU * 1.6 + phase ) );
		return {
			x: mix( x0, x1, t ) + nx * drift,
			y: mix( y0, y1, t ) + ny * drift,
		};
	} );
}

/** One continuous pressure envelope; fiber ribbons deposit additional ink. */
function inkStroke( ctx, points, conf, size, width, seed, options = {} ) {
	if ( points.length < 2 || width <= 0 ) {
		return;
	}
	const rnd = randomFor( seed ),
		material = conf.material || 'ink',
		pencil = material === 'pencil',
		chisel = !! options.chisel,
		texture = unit( conf.texture, pencil ? 68 : chisel ? 28 : 22 ),
		pressure = unit( conf.pressure, 62 ),
		phase = rnd() * TAU,
		phase2 = rnd() * TAU,
		alpha = ctx.globalAlpha * ( options.alpha ?? 1 ),
		color = conf.color || '#c64c43';
	const stroke = points.map( ( p, i ) => {
		const t = i / ( points.length - 1 ),
			prev = points[ Math.max( 0, i - 1 ) ],
			next = points[ Math.min( points.length - 1, i + 1 ) ],
			length = Math.hypot( next.x - prev.x, next.y - prev.y ) || 1,
			body =
				0.76 +
				0.2 * Math.sin( Math.PI * t ) +
				0.14 * Math.sin( t * TAU * 1.3 + phase ) +
				0.06 * Math.sin( t * TAU * 3.2 + phase2 ),
			entry = Math.min( 1, t / ( chisel ? 0.025 : 0.09 ) ),
			exit = Math.min( 1, ( 1 - t ) / ( chisel ? 0.035 : 0.18 ) ),
			taper = chisel
				? mix(
						0.86 - ( options.roundness || 0 ) * 0.4,
						1,
						Math.min( entry, exit )
				  )
				: mix(
						1 - pressure * 0.92,
						1,
						Math.pow( Math.min( entry, exit ), 0.65 )
				  ),
			half =
				width *
				0.5 *
				mix( 1, body, pressure ) *
				taper *
				( 1 - ( options.taper || 0 ) * t );
		return {
			...p,
			nx: -( next.y - prev.y ) / length,
			ny: ( next.x - prev.x ) / length,
			half,
			t,
		};
	} );
	const edge = ( p, side ) => {
		const tooth =
				texture *
				0.035 *
				( Math.sin( p.t * 97 + phase ) +
					Math.sin( p.t * 173 + phase2 ) ),
			d = p.half * ( side + tooth );
		return {
			x: p.x + p.nx * d + ( chisel ? d * 0.22 : 0 ),
			y: p.y + p.ny * d,
		};
	};
	const ribbon = ( a, b, start = 0, end = stroke.length - 1 ) => {
		if ( end <= start ) {
			return;
		}
		ctx.beginPath();
		for ( let i = start; i <= end; i++ ) {
			const p = edge( stroke[ i ], a );
			if ( i === start ) {
				ctx.moveTo( p.x, p.y );
			} else {
				ctx.lineTo( p.x, p.y );
			}
		}
		for ( let i = end; i >= start; i-- ) {
			const p = edge( stroke[ i ], b );
			ctx.lineTo( p.x, p.y );
		}
		ctx.closePath();
		ctx.fill();
	};
	ctx.save();
	ctx.fillStyle = color;
	ctx.globalAlpha =
		alpha *
		( pencil ? 0.43 : chisel ? 0.6 - texture * 0.4 : 0.82 ) *
		( 1 - texture * 0.22 );
	ribbon( -1, 1 );
	// Long pigment streaks are clipped by geometry, so other marks underneath
	// remain intact. High texture means more gaps, never opaque white speckles.
	const fibers = chisel ? 28 : pencil ? 16 : 9;
	for ( let i = 0; i < fibers; i++ ) {
		const center = -0.94 + ( ( i + rnd() * 0.7 ) / fibers ) * 1.88,
			fiberWidth = ( 1.6 / fibers ) * ( 0.35 + rnd() * 0.95 ),
			start = Math.floor( rnd() * texture * stroke.length * 0.15 ),
			end =
				stroke.length -
				1 -
				Math.floor( rnd() * texture * stroke.length * 0.28 );
		ctx.globalAlpha =
			alpha *
			( pencil ? 0.64 : chisel ? 0.3 : 0.21 ) *
			( 0.45 + rnd() * 0.55 );
		ribbon( center - fiberWidth / 2, center + fiberWidth / 2, start, end );
	}
	// Denser ink along the nib edges and at the point where it first meets paper.
	if ( ! pencil ) {
		ctx.globalAlpha = alpha * ( chisel ? 0.18 : 0.12 );
		ribbon( -1, -0.9 );
		ribbon( 0.88, 1 );
		if ( chisel ) {
			ctx.globalAlpha = alpha * 0.12;
			ribbon(
				-0.95,
				0.95,
				0,
				Math.max( 1, Math.floor( stroke.length * 0.025 ) )
			);
		}
	}
	if ( texture > 0 ) {
		const count = Math.min(
			220,
			Math.ceil( points.length * ( pencil ? 1.1 : 0.55 ) )
		);
		for ( let i = 0; i < count; i++ ) {
			const p = stroke[ Math.floor( rnd() * stroke.length ) ],
				grain =
					Math.max( size * 0.002, size * 0.008 * rnd() ) * texture,
				d = ( rnd() * 2 - 1 ) * p.half * 0.95;
			ctx.globalAlpha =
				alpha * texture * ( pencil ? 0.65 : 0.13 ) * rnd();
			ctx.fillRect(
				p.x + p.nx * d,
				p.y + p.ny * d,
				grain,
				grain * ( 0.4 + rnd() )
			);
		}
	}
	ctx.restore();
}

function marker( ctx, rect, conf, seed, highlight = false ) {
	const { x, baseline, width, size } = rect,
		rough = clamp( conf.rough ?? 3, 0, 10 ),
		style = clamp( Math.round( conf.style || 0 ), 0, 3 ),
		thickness = mix( 0.55, 1.3, unit( conf.thickness, 60 ) ),
		pad = highlight ? clamp( conf.pad ?? 11, 0, 40 ) : 0,
		over = size * ( highlight ? 0.12 : 0.2 ) + pad * 0.4,
		mid = baseline - size * ( highlight ? 0.3 : 0.32 ),
		ink = { ...conf, color: conf.color || '#f1d04c' };
	const band = ( left, right, y0, y1, height, offset, options ) =>
		inkStroke(
			ctx,
			line( left, y0, right, y1, size, rough, seed + offset ),
			ink,
			size,
			height * thickness,
			seed + offset,
			options
		);
	if ( highlight ) {
		band(
			x - over,
			x + width + over,
			mid,
			mid + size * 0.015,
			size * 0.9 + pad * 0.5,
			4,
			{
				chisel: true,
				roundness: clamp( conf.radius ?? 5, 0, 60 ) / 60,
				alpha: 0.95,
			}
		);
	} else if ( style === 1 ) {
		band(
			x - over * 1.3,
			x + width + over,
			mid + size * 0.1,
			mid - size * 0.03,
			size * 1.05,
			9,
			{ chisel: true, taper: 0.28, alpha: 0.92 }
		);
	} else if ( style === 2 ) {
		band(
			x - over,
			x + width + over * 0.5,
			mid - size * 0.19,
			mid - size * 0.12,
			size * 0.57,
			17,
			{ chisel: true, taper: 0.13, alpha: 0.82 }
		);
		band(
			x - over * 0.55,
			x + width + over,
			mid + size * 0.19,
			mid + size * 0.11,
			size * 0.56,
			27,
			{ chisel: true, taper: 0.09, alpha: 0.85 }
		);
	} else if ( style === 3 ) {
		const turns = clamp( width / ( size * 0.39 ), 2, 70 ),
			points = sample(
				clamp( Math.ceil( turns * 12 ), 30, 560 ),
				( t ) => ( {
					x:
						x -
						over * 0.6 +
						( width + over ) * t +
						size * 0.06 * Math.sin( t * turns * TAU ),
					y:
						mid +
						size * 0.38 * Math.cos( t * turns * Math.PI ) +
						size * 0.025 * Math.sin( t * 31 + seed ),
				} )
			);
		inkStroke( ctx, points, ink, size, size * 0.2 * thickness, seed, {
			alpha: 0.85,
		} );
	} else {
		band(
			x - over,
			x + width + over * 0.8,
			mid,
			mid + size * 0.025,
			size * 0.97,
			1,
			{ chisel: true, taper: 0.05 }
		);
	}
}

function circle( ctx, rect, conf, seed ) {
	const { x, baseline, width, size } = rect,
		rough = clamp( conf.rough ?? 3, 0, 10 ),
		style = clamp( Math.round( conf.style || 0 ), 0, 2 ),
		weight = size * mix( 0.017, 0.087, unit( conf.thickness, 42 ) ),
		rnd = randomFor( seed ),
		phase = rnd() * TAU;
	if ( style === 2 ) {
		const left = x - size * 0.23,
			right = x + width + size * 0.23,
			top = baseline - size * 0.9,
			bottom = baseline + size * 0.19,
			over = size * 0.085;
		for ( const [ i, ends ] of [
			[ left - over, top, right + over, top + size * 0.022 ],
			[ right, top - over, right - size * 0.018, bottom + over ],
			[ right + over, bottom, left - over, bottom - size * 0.01 ],
			[ left, bottom + over, left + size * 0.017, top - over ],
		].entries() ) {
			inkStroke(
				ctx,
				line( ...ends, size, rough, seed + i * 43 ),
				conf,
				size,
				weight * ( i % 2 ? 0.82 : 1 ),
				seed + i * 43
			);
		}
		return;
	}
	const turns = style === 1 ? 2 : 1,
		rx = width / 2 + size * 0.27,
		ry = size * 0.61,
		cx = x + width / 2,
		cy = baseline - size * 0.34,
		start = Math.PI * ( 0.88 + rnd() * 0.2 ),
		points = sample(
			clamp(
				Math.ceil( ( ( width + size * 3 ) / size ) * 36 * turns ),
				140,
				640
			),
			( t ) => {
				const angle = start + t * ( TAU * turns + 0.34 ),
					breath = Math.sin( angle * 0.53 + phase ),
					lap = style === 1 ? 1 + t * 0.05 : 1;
				return {
					x:
						cx +
						Math.cos( angle ) *
							rx *
							( lap + rough * 0.002 * breath ) +
						size *
							( 0.05 + rough * 0.01 ) *
							Math.sin( angle * 2 + phase ) +
						( style === 1 ? size * t * 0.13 : 0 ),
					y:
						cy +
						Math.sin( angle ) *
							ry *
							( 1 +
								rough *
									0.007 *
									Math.cos( angle * 0.7 + phase ) +
								( style === 1 ? t * 0.16 : 0 ) ) +
						size * 0.07 * Math.cos( angle ) +
						size * rough * 0.006 * Math.sin( angle * 3 + phase ),
				};
			}
		);
	inkStroke( ctx, points, conf, size, weight, seed );
}

function underline( ctx, rect, conf, seed, decorative = false ) {
	const { x, baseline, width, size } = rect,
		style = clamp( Math.round( conf.style || 0 ), 0, 3 ),
		rough = clamp( conf.rough ?? 3, 0, 10 ),
		y =
			baseline +
			size *
				( decorative
					? 0.16 + clamp( conf.offset ?? 8, 0, 40 ) / 100
					: 0.25 ),
		weight = decorative
			? ( size * clamp( conf.thickness ?? 7, 1, 20 ) ) / 100
			: size * mix( 0.025, 0.105, unit( conf.thickness, 48 ) ),
		over = size * 0.08;
	const stroke = ( yy, scale, left, right, offset ) =>
		inkStroke(
			ctx,
			line(
				left,
				yy,
				right,
				yy - size * 0.015,
				size,
				rough,
				seed + offset,
				size * 0.045 * Math.min( 1, ( right - left ) / ( size * 2 ) )
			),
			conf,
			size,
			weight * scale,
			seed + offset
		);
	if ( decorative && conf.dashed && style === 0 ) {
		const count = clamp( Math.round( width / ( size * 0.32 ) ), 2, 100 ),
			span = width / count;
		for ( let i = 0; i < count; i++ ) {
			stroke(
				y + size * 0.013 * Math.sin( i + seed ),
				0.95,
				x + span * i,
				x + span * ( i + 0.64 ),
				i * 13
			);
		}
	} else if ( style === 1 ) {
		stroke( y, 1, x - over, x + width + over, 1 );
		stroke(
			y + weight * 2.1,
			0.72,
			x + width * 0.03,
			x + width * 0.96 + over,
			17
		);
	} else if ( decorative && style === 2 ) {
		const waves = clamp( width / ( size * 0.64 ), 1, 90 );
		inkStroke(
			ctx,
			sample( clamp( Math.ceil( waves * 18 ), 40, 560 ), ( t ) => ( {
				x: x - over + ( width + over * 2 ) * t,
				y:
					y +
					weight *
						0.86 *
						Math.sin( t * waves * TAU ) *
						( 0.85 + 0.15 * Math.sin( t * 8 + seed ) ),
			} ) ),
			conf,
			size,
			weight * 0.8,
			seed
		);
	} else if ( style === 2 || ( decorative && style === 3 ) ) {
		const count = clamp( Math.round( width / ( size * 0.22 ) ), 3, 140 ),
			points = [];
		for ( let i = 0; i <= count; i++ ) {
			points.push( {
				x: x - over + ( ( width + over * 2 ) * i ) / count,
				y:
					y +
					( i % 2 ? size * 0.11 : 0 ) +
					size * rough * 0.003 * Math.sin( i * 1.7 + seed ),
			} );
		}
		inkStroke( ctx, points, conf, size, weight * 0.8, seed );
	} else if ( style === 3 ) {
		const loops = clamp( width / ( size * 0.43 ), 1, 70 );
		inkStroke(
			ctx,
			sample( clamp( Math.ceil( loops * 25 ), 50, 600 ), ( t ) => {
				const a = t * loops * TAU;
				return {
					x: x + width * t + size * 0.12 * Math.sin( a ),
					y:
						y +
						size * 0.15 * ( 1 - Math.cos( a ) ) +
						size * 0.02 * Math.sin( a * 0.33 + seed ),
				};
			} ),
			conf,
			size,
			weight * 0.7,
			seed
		);
	} else {
		stroke( y, 1, x - over, x + width + over, 0 );
	}
}

function strike( ctx, rect, conf, seed ) {
	const { x, baseline, width, size } = rect,
		style = clamp( Math.round( conf.style || 0 ), 0, 2 ),
		rough = clamp( conf.rough ?? 3, 0, 10 ),
		weight = size * mix( 0.023, 0.095, unit( conf.thickness, 44 ) ),
		over = size * 0.14,
		middle = baseline - size * 0.31;
	const stroke = ( y0, y1, offset, scale = 1 ) =>
		inkStroke(
			ctx,
			line(
				x - over,
				y0,
				x + width + over,
				y1,
				size,
				rough,
				seed + offset
			),
			conf,
			size,
			weight * scale,
			seed + offset
		);
	if ( style === 2 ) {
		stroke( baseline - size * 0.75, baseline + size * 0.07, 0 );
		stroke( baseline + size * 0.06, baseline - size * 0.73, 37, 0.82 );
	} else if ( style === 1 ) {
		stroke( middle - size * 0.085, middle - size * 0.055, 0 );
		stroke( middle + size * 0.115, middle + size * 0.08, 41, 0.78 );
	} else {
		stroke( middle + size * 0.03, middle - size * 0.025, 0 );
	}
}

/** Shared by plain text, rich text and word-level span markers. */
export function drawLineHighlights( ctx, fx, rects, phase = 'all' ) {
	if ( ! fx ) {
		return;
	}
	for ( const [ kind, painter ] of [
		[
			'highlight',
			( c, r, config, seed ) => marker( c, r, config, seed, true ),
		],
		[ 'marker', marker ],
		[ 'circleMark', circle ],
		[ 'scribbleUnder', underline ],
		[
			'underlineFx',
			( c, r, config, seed ) => underline( c, r, config, seed, true ),
		],
		[ 'strikeFx', strike ],
	] ) {
		const conf = fx[ kind ];
		if (
			! conf ||
			( phase === 'behind' && kind === 'strikeFx' ) ||
			( phase === 'front' && kind !== 'strikeFx' )
		) {
			continue;
		}
		ctx.save();
		try {
			ctx.globalAlpha *= unit( conf.opacity, 100 );
			ctx.setLineDash( [] );
			if ( ctx.globalAlpha <= 0 ) {
				continue;
			}
			rects.forEach( ( rect, index ) => {
				if (
					! Number.isFinite( rect.width ) ||
					rect.width <= 0 ||
					! Number.isFinite( rect.size ) ||
					rect.size <= 0
				) {
					return;
				}
				painter(
					ctx,
					rect,
					conf,
					( conf.seed || 1 ) * 4241 + index * 1009
				);
			} );
		} finally {
			ctx.restore();
		}
	}
}
