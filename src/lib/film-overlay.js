/**
 * Vignette & Film overlay painter (v1.256.0): renders ONE transparent
 * overlay canvas - vignette plus optional film grain, dust and
 * scratches - fully deterministic from its params (seeded LCG, no
 * Math.random), so a generator layer re-renders identically and adapts
 * to any document size (params are relative percentages).
 *
 * Pure: no editor state, canvases come from the raster factory, so the
 * same code runs in the dialog, the resolve pipeline, headless renders
 * and node tests.
 */

import { createCanvas } from './raster';

/** Deterministic PRNG (the effects.js LCG pattern). */
const lcg = ( seed ) => {
	let s = seed >>> 0 || 1;
	return () => {
		s = ( s * 1664525 + 1013904223 ) >>> 0;
		return s / 4294967296;
	};
};

export const DEFAULT_FILM_PARAMS = {
	vignette: {
		on: true,
		shape: 'oval',
		color: '#000000',
		strength: 55,
		size: 60,
		feather: 60,
		cx: 50,
		cy: 50,
	},
	grain: { on: false, amount: 30, size: 2, seed: 7 },
	dust: { on: false, density: 30, size: 30, light: true, seed: 11 },
	scratches: { on: false, count: 8, strength: 40, light: true, seed: 5 },
	leaks: {
		on: false,
		strength: 55,
		size: 55,
		count: 2,
		color: '#ff9a3c',
		seed: 3,
	},
	frame: {
		on: false,
		style: 'photo',
		color: '#ffffff',
		size: 5,
		radius: 6,
		seed: 5,
	},
	stamp: { on: false, text: '', color: '#ff9d2e', size: 4, corner: 'br' },
};

/** Deep-merged params so partial descriptors stay valid. */
export const normalizeFilmParams = ( params ) => {
	const merged = {};
	for ( const key of Object.keys( DEFAULT_FILM_PARAMS ) ) {
		merged[ key ] = {
			...DEFAULT_FILM_PARAMS[ key ],
			...( params?.[ key ] || {} ),
		};
	}
	return merged;
};

const hexRgb = ( hex ) => {
	const m = /^#?([0-9a-f]{6})/i.exec( String( hex || '' ) );
	if ( ! m ) {
		return { r: 0, g: 0, b: 0 };
	}
	return {
		r: parseInt( m[ 1 ].slice( 0, 2 ), 16 ),
		g: parseInt( m[ 1 ].slice( 2, 4 ), 16 ),
		b: parseInt( m[ 1 ].slice( 4, 6 ), 16 ),
	};
};

/** #rrggbb or rgb()/rgba() to {r,g,b,a}, null otherwise. */
const cssColor = ( str ) => {
	const s = String( str || '' ).trim();
	if ( /^#?[0-9a-f]{6}$/i.test( s ) ) {
		return { ...hexRgb( s ), a: 1 };
	}
	const m =
		/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(
			s
		);
	if ( ! m ) {
		return null;
	}
	return {
		r: +m[ 1 ],
		g: +m[ 2 ],
		b: +m[ 3 ],
		a: m[ 4 ] === undefined ? 1 : +m[ 4 ],
	};
};

/**
 * Approximate film params from a radial gradient layer - the vignettes
 * the starter templates ship as plain gradient layers (v1.256.2). The
 * studio opens seeded with these and REPLACES the layer on insert.
 *
 * @param {Object} layer A layer (any type; non-radial-gradients yield null).
 * @return {Object|null} Normalized film params, or null if not adoptable.
 */
export function filmParamsFromGradient( layer ) {
	if (
		! layer ||
		'gradient' !== layer.type ||
		'radial' !== ( layer.kind || '' )
	) {
		return null;
	}
	const stops = [ ...( layer.stops || [] ) ].sort(
		( a, b ) => ( a.at ?? 0 ) - ( b.at ?? 0 )
	);
	if ( ! stops.length ) {
		return null;
	}
	const outer = cssColor( stops[ stops.length - 1 ].color ) || {
		r: 0,
		g: 0,
		b: 0,
		a: 0.5,
	};
	const w = layer.w || 1;
	const h = layer.h || 1;
	const fx = layer.from?.x ?? layer.x + w / 2;
	const fy = layer.from?.y ?? layer.y + h / 2;
	const tx = layer.to?.x ?? layer.x + w;
	const ty = layer.to?.y ?? fy;
	const r = Math.max( 1, Math.hypot( tx - fx, ty - fy ) );
	const maxR = Math.hypot( w, h ) / 2;
	const size = Math.round(
		Math.min( 100, Math.max( 2, ( ( r / maxR - 0.35 ) / 1.15 ) * 100 ) )
	);
	const feather = Math.round(
		Math.min( 95, Math.max( 5, ( 1 - ( stops[ 0 ].at ?? 0 ) ) * 100 ) )
	);
	const toHex = ( v ) =>
		Math.max( 0, Math.min( 255, Math.round( v ) ) )
			.toString( 16 )
			.padStart( 2, '0' );
	return normalizeFilmParams( {
		vignette: {
			on: true,
			shape: 'oval',
			color: '#' + toHex( outer.r ) + toHex( outer.g ) + toHex( outer.b ),
			strength: Math.round(
				Math.min( 100, Math.max( 0, outer.a * 100 ) )
			),
			size,
			feather,
			cx: Math.round( ( ( fx - layer.x ) / w ) * 100 ),
			cy: Math.round( ( ( fy - layer.y ) / h ) * 100 ),
		},
	} );
}

function paintVignette( ctx, v, w, h ) {
	const { r, g, b } = hexRgb( v.color );
	const rgba = ( a ) => `rgba(${ r },${ g },${ b },${ a })`;
	const alpha = Math.max( 0, Math.min( 1, v.strength / 100 ) );
	const edgeShade = ( x0, y0, x1, y1, a ) => {
		const grad = ctx.createLinearGradient( x0, y0, x1, y1 );
		grad.addColorStop( 0, rgba( a ) );
		grad.addColorStop( 1, rgba( 0 ) );
		ctx.fillStyle = grad;
		ctx.fillRect( 0, 0, w, h );
	};
	if ( 'top' === v.shape || 'bottom' === v.shape ) {
		const reach = Math.max( 0.02, v.size / 100 ) * h;
		const from = 'top' === v.shape ? 0 : h;
		const to = 'top' === v.shape ? reach : h - reach;
		edgeShade( 0, from, 0, to, alpha );
		return;
	}
	if ( 'left' === v.shape || 'right' === v.shape ) {
		const reach = Math.max( 0.02, v.size / 100 ) * w;
		const from = 'left' === v.shape ? 0 : w;
		const to = 'left' === v.shape ? reach : w - reach;
		edgeShade( from, 0, to, 0, alpha );
		return;
	}
	if ( 'letterbox' === v.shape ) {
		const reach = Math.max( 0.02, ( v.size / 100 ) * 0.6 ) * h;
		edgeShade( 0, 0, 0, reach, alpha );
		edgeShade( 0, h, 0, h - reach, alpha );
		return;
	}
	if ( 'pillar' === v.shape ) {
		const reach = Math.max( 0.02, ( v.size / 100 ) * 0.6 ) * w;
		edgeShade( 0, 0, reach, 0, alpha );
		edgeShade( w, 0, w - reach, 0, alpha );
		return;
	}
	if ( 'corners' === v.shape ) {
		// Only the corners fall off, like an old lens.
		const reach = Math.hypot( w, h ) * ( 0.2 + ( v.size / 100 ) * 0.5 );
		for ( const [ cornX, cornY ] of [
			[ 0, 0 ],
			[ w, 0 ],
			[ 0, h ],
			[ w, h ],
		] ) {
			const grad = ctx.createRadialGradient(
				cornX,
				cornY,
				0,
				cornX,
				cornY,
				reach
			);
			grad.addColorStop( 0, rgba( alpha * 0.85 ) );
			grad.addColorStop( 0.55, rgba( alpha * 0.28 ) );
			grad.addColorStop( 1, rgba( 0 ) );
			ctx.fillStyle = grad;
			ctx.fillRect( 0, 0, w, h );
		}
		return;
	}
	if ( 'rect' === v.shape ) {
		// Four edge ramps; the corners overlap and darken naturally.
		const reach = Math.max( 0.02, v.size / 100 ) * ( Math.min( w, h ) / 2 );
		const edges = [
			[ 0, 0, 0, reach ],
			[ 0, h, 0, h - reach ],
			[ 0, 0, reach, 0 ],
			[ w, 0, w - reach, 0 ],
		];
		for ( const [ x0, y0, x1, y1 ] of edges ) {
			const grad = ctx.createLinearGradient( x0, y0, x1, y1 );
			grad.addColorStop( 0, rgba( alpha * 0.72 ) );
			grad.addColorStop( 1, rgba( 0 ) );
			ctx.fillStyle = grad;
			ctx.fillRect( 0, 0, w, h );
		}
		return;
	}
	// Oval (default): radial falloff around an adjustable center. The
	// radius derives from the DIAGONAL, so the look survives any format
	// (the lesson from the portrait-tuned template vignettes). The circle
	// variant keys its radius to the short side instead - a true round
	// spotlight regardless of format.
	const cx = ( v.cx / 100 ) * w;
	const cy = ( v.cy / 100 ) * h;
	const maxR =
		'circle' === v.shape
			? ( Math.min( w, h ) / 2 ) * 1.25
			: Math.hypot( w, h ) / 2;
	const outer = maxR * ( 0.35 + ( v.size / 100 ) * 1.15 );
	const inner = outer * Math.max( 0, 1 - v.feather / 100 );
	const grad = ctx.createRadialGradient( cx, cy, inner, cx, cy, outer );
	// Eased ramp - a linear two-stop gradient shows its inner radius as
	// a visible ring, the midpoint stop hides the entry.
	grad.addColorStop( 0, rgba( 0 ) );
	grad.addColorStop( 0.55, rgba( alpha * 0.32 ) );
	grad.addColorStop( 1, rgba( alpha ) );
	ctx.fillStyle = grad;
	ctx.fillRect( 0, 0, w, h );
}

function paintGrain( ctx, gConf, w, h ) {
	const cell = Math.max( 1, Math.min( 6, Math.round( gConf.size ) ) );
	const gw = Math.ceil( w / cell );
	const gh = Math.ceil( h / cell );
	const tiny = createCanvas( gw, gh );
	const tctx = tiny.getContext( '2d' );
	const img = tctx.createImageData( gw, gh );
	const rnd = lcg( ( gConf.seed || 7 ) * 7919 );
	const amount = Math.max( 0, Math.min( 100, gConf.amount ) ) / 100;
	for ( let i = 0; i < img.data.length; i += 4 ) {
		const v = rnd() * 2 - 1;
		// Sparse speckle, not a full mosaic: most cells stay clear, only
		// the outliers become visible grains.
		const mag = Math.abs( v );
		if ( mag < 0.6 ) {
			continue;
		}
		const light = v > 0;
		img.data[ i ] = light ? 255 : 0;
		img.data[ i + 1 ] = light ? 255 : 0;
		img.data[ i + 2 ] = light ? 255 : 0;
		img.data[ i + 3 ] = Math.round(
			( ( mag - 0.6 ) / 0.4 ) * amount * 150
		);
	}
	tctx.putImageData( img, 0, 0 );
	ctx.save();
	ctx.imageSmoothingEnabled = false;
	ctx.drawImage( tiny, 0, 0, gw, gh, 0, 0, gw * cell, gh * cell );
	ctx.restore();
}

function paintDust( ctx, dConf, w, h ) {
	const rnd = lcg( ( dConf.seed || 11 ) * 104729 );
	const count = Math.round(
		( ( w * h ) / 1000000 ) *
			Math.max( 0, Math.min( 100, dConf.density ) ) *
			3.2
	);
	const scale = 0.4 + ( dConf.size / 100 ) * 2.4;
	ctx.save();
	ctx.strokeStyle = ctx.fillStyle = dConf.light ? '#ffffff' : '#000000';
	ctx.lineCap = 'round';
	for ( let i = 0; i < count; i++ ) {
		const x = rnd() * w;
		const y = rnd() * h;
		ctx.globalAlpha = 0.12 + rnd() * 0.45;
		if ( rnd() < 0.16 ) {
			// A curled fiber instead of a speck.
			const len = ( 3 + rnd() * 9 ) * scale;
			ctx.lineWidth = Math.max( 0.6, 0.5 * scale );
			ctx.beginPath();
			ctx.moveTo( x, y );
			ctx.quadraticCurveTo(
				x + ( rnd() - 0.5 ) * len * 2,
				y + ( rnd() - 0.5 ) * len * 2,
				x + ( rnd() - 0.5 ) * len,
				y + ( rnd() - 0.5 ) * len
			);
			ctx.stroke();
		} else {
			const radius = ( 0.4 + rnd() * 1.1 ) * scale;
			ctx.beginPath();
			ctx.arc( x, y, radius, 0, Math.PI * 2 );
			ctx.fill();
		}
	}
	ctx.restore();
}

function paintLeaks( ctx, lConf, w, h ) {
	const rnd = lcg( ( lConf.seed || 3 ) * 292331 );
	const count = Math.max( 1, Math.min( 3, Math.round( lConf.count ) ) );
	const { r, g, b } = hexRgb( lConf.color || '#ff9a3c' );
	const strength = Math.max( 0, Math.min( 100, lConf.strength ) ) / 100;
	const reach = Math.max( w, h ) * ( 0.3 + ( lConf.size / 100 ) * 0.9 );
	ctx.save();
	// Overlapping leaks add up like light does.
	ctx.globalCompositeOperation = 'lighter';
	for ( let i = 0; i < count; i++ ) {
		// Anchored on an edge, biased to the top half like real leaks.
		const edge = rnd();
		let x;
		let y;
		if ( edge < 0.4 ) {
			x = rnd() * w;
			y = -reach * 0.15;
		} else if ( edge < 0.7 ) {
			x = w + reach * 0.15;
			y = rnd() * h * 0.7;
		} else {
			x = -reach * 0.15;
			y = rnd() * h * 0.7;
		}
		const radius = reach * ( 0.6 + rnd() * 0.6 );
		const alpha = strength * ( 0.35 + rnd() * 0.4 );
		// A warm core inside a soft haze; hue drifts a little per blob.
		const drift = ( rnd() - 0.5 ) * 60;
		const cr = Math.max( 0, Math.min( 255, r + drift ) );
		const cb = Math.max( 0, Math.min( 255, b - drift * 0.6 ) );
		const grad = ctx.createRadialGradient( x, y, 0, x, y, radius );
		grad.addColorStop( 0, `rgba(${ cr },${ g },${ cb },${ alpha })` );
		grad.addColorStop(
			0.55,
			`rgba(${ cr },${ g * 0.8 },${ cb },${ alpha * 0.45 })`
		);
		grad.addColorStop( 1, `rgba(${ cr },${ g * 0.6 },${ cb },0)` );
		ctx.fillStyle = grad;
		// Stretch some blobs into streaks.
		const stretch = 1 + rnd() * 1.6;
		ctx.save();
		ctx.translate( x, y );
		ctx.rotate( ( rnd() - 0.5 ) * 0.9 );
		ctx.scale( 1, stretch );
		ctx.translate( -x, -y );
		ctx.beginPath();
		ctx.arc( x, y, radius, 0, Math.PI * 2 );
		ctx.fill();
		ctx.restore();
	}
	ctx.restore();
}

function paintFrame( ctx, fConf, w, h ) {
	const minSide = Math.min( w, h );
	const size = Math.max( 0.5, Math.min( 20, fConf.size ) );
	const color = fConf.color || '#ffffff';
	const rnd = lcg( ( fConf.seed || 5 ) * 48611 );
	ctx.save();
	if ( 'solid' === fConf.style ) {
		// Even border on all four sides.
		const t = ( size / 100 ) * minSide;
		ctx.fillStyle = color;
		ctx.fillRect( 0, 0, w, t );
		ctx.fillRect( 0, h - t, w, t );
		ctx.fillRect( 0, 0, t, h );
		ctx.fillRect( w - t, 0, t, h );
	} else if ( 'double' === fConf.style ) {
		// Elegant double keyline.
		const inset = ( size / 100 ) * minSide;
		const lw = Math.max( 2, minSide * 0.006 );
		ctx.strokeStyle = color;
		ctx.lineWidth = lw;
		ctx.strokeRect( inset, inset, w - inset * 2, h - inset * 2 );
		ctx.lineWidth = Math.max( 1, lw * 0.5 );
		const inner = inset + lw * 3;
		ctx.strokeRect( inner, inner, w - inner * 2, h - inner * 2 );
	} else if ( 'slide' === fConf.style ) {
		// 35mm slide mount: thick mount, rounded window.
		const t = ( size / 100 ) * minSide * 2.2;
		const radius = Math.max( 3, t * 0.22 );
		ctx.fillStyle = color;
		ctx.beginPath();
		ctx.rect( 0, 0, w, h );
		if ( ctx.roundRect ) {
			ctx.roundRect( t, t, w - t * 2, h - t * 2, radius );
		} else {
			ctx.rect( t, t, w - t * 2, h - t * 2 );
		}
		ctx.fill( 'evenodd' );
	} else if ( 'painted' === fConf.style ) {
		// Hand-painted border: each edge is a band whose inner side
		// wobbles like a loaded brush.
		const t = Math.max( 4, ( size / 100 ) * minSide );
		const wob = () => ( rnd() - 0.5 ) * t * 0.7;
		ctx.fillStyle = color;
		const band = ( points ) => {
			ctx.beginPath();
			points.forEach( ( [ px, py ], i ) =>
				0 === i ? ctx.moveTo( px, py ) : ctx.lineTo( px, py )
			);
			ctx.closePath();
			ctx.fill();
		};
		const inner = ( len, fixed, horizontal, fromEdge ) => {
			const steps = Math.max( 6, Math.round( len / ( t * 2 ) ) );
			const pts = [];
			for ( let i = steps; i >= 0; i-- ) {
				const along = ( i / steps ) * len;
				const depth = fromEdge ? fixed + t + wob() : fixed - t - wob();
				pts.push( horizontal ? [ along, depth ] : [ depth, along ] );
			}
			return pts;
		};
		band( [ [ 0, 0 ], [ w, 0 ], ...inner( w, 0, true, true ) ] );
		band( [ [ 0, h ], [ w, h ], ...inner( w, h, true, false ) ] );
		band( [
			[ 0, 0 ],
			[ 0, h ],
			...inner( h, 0, false, true ).map( ( pt ) => pt ),
		] );
		band( [ [ w, 0 ], [ w, h ], ...inner( h, w, false, false ) ] );
	} else if ( 'tape' === fConf.style ) {
		// Photo-album tape strips across the corners - inset along the
		// diagonal so the strip actually lies ON the canvas (centered on
		// the corner point, half of it fell outside).
		const len = minSide * ( 0.16 + ( size / 100 ) * 1.4 );
		const thick = len * 0.34;
		const inset = len * 0.28;
		const corners = [
			[ inset, inset, -Math.PI / 4 ],
			[ w - inset, inset, Math.PI / 4 ],
			[ inset, h - inset, Math.PI / 4 ],
			[ w - inset, h - inset, -Math.PI / 4 ],
		];
		for ( const [ cornX, cornY, angle ] of corners ) {
			ctx.save();
			ctx.translate( cornX, cornY );
			ctx.rotate( angle + ( rnd() - 0.5 ) * 0.14 );
			ctx.globalAlpha = 0.55;
			ctx.fillStyle = color;
			ctx.fillRect( -len / 2, -thick / 2, len, thick );
			ctx.globalAlpha = 0.25;
			ctx.fillRect( -len / 2, -thick / 2, len, thick * 0.25 );
			ctx.restore();
		}
	} else if ( 'mounts' === fConf.style ) {
		// Classic photo-corner mounts: one triangle pocket per corner.
		const leg = minSide * ( 0.08 + ( size / 100 ) * 0.9 );
		ctx.fillStyle = color;
		const tri = ( cornX, cornY, dx, dy ) => {
			ctx.beginPath();
			ctx.moveTo( cornX, cornY );
			ctx.lineTo( cornX + leg * dx, cornY );
			ctx.lineTo( cornX, cornY + leg * dy );
			ctx.closePath();
			ctx.fill();
		};
		tri( 0, 0, 1, 1 );
		tri( w, 0, -1, 1 );
		tri( 0, h, 1, -1 );
		tri( w, h, -1, -1 );
	} else if ( 'thin' === fConf.style ) {
		const inset = ( size / 100 ) * minSide;
		ctx.strokeStyle = color;
		ctx.lineWidth = Math.max( 2, minSide * 0.004 );
		ctx.strokeRect( inset, inset, w - inset * 2, h - inset * 2 );
	} else if ( 'film' === fConf.style ) {
		// Filmstrip: bars top and bottom, perforation holes punched out.
		const bar = Math.max( 10, ( size / 100 ) * h * 1.6 );
		ctx.fillStyle = color;
		ctx.fillRect( 0, 0, w, bar );
		ctx.fillRect( 0, h - bar, w, bar );
		const hole = bar * 0.42;
		const gap = hole * 1.9;
		ctx.globalCompositeOperation = 'destination-out';
		for ( let x = gap / 2; x < w; x += gap ) {
			for ( const y of [
				( bar - hole ) / 2,
				h - bar + ( bar - hole ) / 2,
			] ) {
				ctx.beginPath();
				if ( ctx.roundRect ) {
					ctx.roundRect( x, y, hole * 0.8, hole, hole * 0.2 );
				} else {
					ctx.rect( x, y, hole * 0.8, hole );
				}
				ctx.fill();
			}
		}
	} else if ( 'rounded' === fConf.style ) {
		// A matte with a rounded window: everything outside the radius
		// takes the frame color.
		const radius = Math.max( 2, ( ( fConf.radius ?? 6 ) / 100 ) * minSide );
		const inset = ( size / 100 ) * minSide * 0.5;
		ctx.fillStyle = color;
		ctx.beginPath();
		ctx.rect( 0, 0, w, h );
		const rx = inset;
		const ry = inset;
		const rw = w - inset * 2;
		const rh = h - inset * 2;
		if ( ctx.roundRect ) {
			ctx.roundRect( rx, ry, rw, rh, radius );
		} else {
			ctx.rect( rx, ry, rw, rh );
		}
		ctx.fill( 'evenodd' );
	} else {
		// Instant photo: even border, heavier chin at the bottom.
		const side = ( size / 100 ) * minSide;
		const chin = side * 2.6;
		ctx.fillStyle = color;
		ctx.fillRect( 0, 0, w, side );
		ctx.fillRect( 0, 0, side, h );
		ctx.fillRect( w - side, 0, side, h );
		ctx.fillRect( 0, h - chin, w, chin );
	}
	ctx.restore();
}

/* 7-segment date stamp: drawn as strokes, no font involved, so the
   resolve pipeline renders it identically headless. */
const SEGMENTS = {
	0: 'abcdef',
	1: 'bc',
	2: 'abdeg',
	3: 'abcdg',
	4: 'bcfg',
	5: 'acdfg',
	6: 'acdefg',
	7: 'abc',
	8: 'abcdefg',
	9: 'abcdfg',
};

function paintStamp( ctx, sConf, w, h ) {
	const text = String( sConf.text || '' );
	if ( ! text ) {
		return;
	}
	const minSide = Math.min( w, h );
	const dh = Math.max( 10, ( Math.max( 1, sConf.size ) / 100 ) * minSide );
	const dw = dh * 0.58;
	const lw = Math.max( 1.5, dh * 0.13 );
	const advance = dw + dh * 0.28;
	const width =
		Array.from( text ).reduce(
			( n, ch ) =>
				n + ( ' ' === ch ? 0.55 : "'" === ch || '.' === ch ? 0.4 : 1 ),
			0
		) * advance;
	const margin = minSide * 0.045;
	const corner = sConf.corner || 'br';
	const x0 = corner.includes( 'l' ) ? margin : w - margin - width;
	const y0 = corner.includes( 't' ) ? margin : h - margin - dh;
	ctx.save();
	// The classic camera-date glow.
	ctx.strokeStyle = ctx.fillStyle = sConf.color || '#ff9d2e';
	ctx.lineWidth = lw;
	ctx.lineCap = 'round';
	ctx.shadowColor = sConf.color || '#ff9d2e';
	ctx.shadowBlur = dh * 0.35;
	// Slight italic lean; the e-term re-centers the shear at the stamp's
	// own baseline (coordinates below already include x0).
	ctx.transform( 1, 0, -0.08, 1, y0 * 0.08, 0 );
	let x = x0;
	const seg = ( x1, y1, x2, y2 ) => {
		ctx.beginPath();
		ctx.moveTo( x1, y1 );
		ctx.lineTo( x2, y2 );
		ctx.stroke();
	};
	for ( const ch of text ) {
		if ( ' ' === ch ) {
			x += advance * 0.55;
			continue;
		}
		if ( "'" === ch ) {
			seg( x + dw * 0.3, y0, x + dw * 0.18, y0 + dh * 0.22 );
			x += advance * 0.4;
			continue;
		}
		if ( '.' === ch ) {
			ctx.beginPath();
			ctx.arc( x + dw * 0.2, y0 + dh, lw * 0.7, 0, Math.PI * 2 );
			ctx.fill();
			x += advance * 0.4;
			continue;
		}
		if ( '-' === ch || ! SEGMENTS[ ch ] ) {
			seg( x + dw * 0.15, y0 + dh / 2, x + dw * 0.85, y0 + dh / 2 );
			x += advance;
			continue;
		}
		const on = SEGMENTS[ ch ];
		const pad = lw * 0.7;
		if ( on.includes( 'a' ) ) {
			seg( x + pad, y0, x + dw - pad, y0 );
		}
		if ( on.includes( 'b' ) ) {
			seg( x + dw, y0 + pad, x + dw, y0 + dh / 2 - pad );
		}
		if ( on.includes( 'c' ) ) {
			seg( x + dw, y0 + dh / 2 + pad, x + dw, y0 + dh - pad );
		}
		if ( on.includes( 'd' ) ) {
			seg( x + pad, y0 + dh, x + dw - pad, y0 + dh );
		}
		if ( on.includes( 'e' ) ) {
			seg( x, y0 + dh / 2 + pad, x, y0 + dh - pad );
		}
		if ( on.includes( 'f' ) ) {
			seg( x, y0 + pad, x, y0 + dh / 2 - pad );
		}
		if ( on.includes( 'g' ) ) {
			seg( x + pad, y0 + dh / 2, x + dw - pad, y0 + dh / 2 );
		}
		x += advance;
	}
	ctx.restore();
}

function paintScratches( ctx, sConf, w, h ) {
	const rnd = lcg( ( sConf.seed || 5 ) * 15485863 );
	const count = Math.max( 0, Math.min( 40, Math.round( sConf.count ) ) );
	const strength = Math.max( 0, Math.min( 100, sConf.strength ) ) / 100;
	ctx.save();
	ctx.strokeStyle = sConf.light ? '#ffffff' : '#000000';
	ctx.lineCap = 'round';
	for ( let i = 0; i < count; i++ ) {
		const x = rnd() * w;
		const drift = ( rnd() - 0.5 ) * w * 0.04;
		const len = h * ( 0.3 + rnd() * 0.7 );
		const y0 = rnd() * ( h - len );
		const segs = 3 + Math.round( rnd() * 3 );
		ctx.globalAlpha = ( 0.08 + rnd() * 0.3 ) * strength;
		ctx.lineWidth = 0.5 + rnd() * 0.9;
		ctx.beginPath();
		ctx.moveTo( x, y0 );
		for ( let sIdx = 1; sIdx <= segs; sIdx++ ) {
			const t = sIdx / segs;
			ctx.lineTo( x + drift * t + ( rnd() - 0.5 ) * 1.5, y0 + len * t );
		}
		ctx.stroke();
	}
	ctx.restore();
}

/**
 * Render the overlay.
 *
 * @param {Object} params Film params (see DEFAULT_FILM_PARAMS).
 * @param {number} w      Target width in pixels.
 * @param {number} h      Target height in pixels.
 * @return {HTMLCanvasElement} Transparent overlay canvas.
 */
export function renderFilmOverlay( params, w, h ) {
	const p = normalizeFilmParams( params );
	const width = Math.max( 1, Math.round( w ) );
	const height = Math.max( 1, Math.round( h ) );
	const canvas = createCanvas( width, height );
	const ctx = canvas.getContext( '2d' );
	if ( p.vignette.on ) {
		paintVignette( ctx, p.vignette, width, height );
	}
	if ( p.leaks.on ) {
		paintLeaks( ctx, p.leaks, width, height );
	}
	if ( p.grain.on ) {
		paintGrain( ctx, p.grain, width, height );
	}
	if ( p.dust.on ) {
		paintDust( ctx, p.dust, width, height );
	}
	if ( p.scratches.on ) {
		paintScratches( ctx, p.scratches, width, height );
	}
	// Frame and stamp sit ON TOP of everything.
	if ( p.frame.on ) {
		paintFrame( ctx, p.frame, width, height );
	}
	if ( p.stamp.on ) {
		paintStamp( ctx, p.stamp, width, height );
	}
	return canvas;
}

/**
 * Curated looks for the dialog's preset row. `blend` (optional) is
 * the layer blend mode the preset suggests.
 */
export const FILM_PRESETS = [
	{
		id: 'subtle',
		label: 'Subtle',
		params: {
			vignette: {
				on: true,
				shape: 'oval',
				strength: 32,
				size: 72,
				feather: 75,
			},
		},
	},
	{
		id: 'classic',
		label: 'Classic',
		params: {
			vignette: {
				on: true,
				shape: 'oval',
				strength: 60,
				size: 58,
				feather: 55,
			},
		},
	},
	{
		id: 'noir',
		label: 'Film Noir',
		blend: 'multiply',
		params: {
			vignette: {
				on: true,
				shape: 'oval',
				strength: 78,
				size: 48,
				feather: 48,
			},
			grain: { on: true, amount: 30, size: 2, seed: 3 },
		},
	},
	{
		id: 'cinema',
		label: 'Cinema',
		params: {
			vignette: { on: true, shape: 'top', strength: 55, size: 42 },
			grain: { on: true, amount: 22, size: 2, seed: 7 },
		},
	},
	{
		id: 'retro',
		label: 'Retro Film',
		params: {
			vignette: {
				on: true,
				shape: 'oval',
				strength: 62,
				size: 55,
				feather: 50,
			},
			grain: { on: true, amount: 38, size: 2, seed: 9 },
			scratches: {
				on: true,
				count: 10,
				strength: 45,
				light: true,
				seed: 5,
			},
			leaks: {
				on: true,
				strength: 40,
				size: 45,
				count: 1,
				color: '#ff9a3c',
				seed: 6,
			},
		},
	},
	{
		id: 'golden-leak',
		label: 'Golden Leak',
		params: {
			vignette: {
				on: true,
				shape: 'oval',
				strength: 30,
				size: 70,
				feather: 70,
			},
			leaks: {
				on: true,
				strength: 70,
				size: 65,
				count: 2,
				color: '#ffb054',
				seed: 4,
			},
		},
	},
	{
		id: 'old-photo',
		label: 'Old Photo',
		params: {
			vignette: {
				on: true,
				shape: 'oval',
				color: '#2a1a0a',
				strength: 70,
				size: 50,
				feather: 45,
			},
			grain: { on: true, amount: 45, size: 2, seed: 4 },
			dust: { on: true, density: 45, size: 40, light: false, seed: 13 },
		},
	},
	{
		id: 'polaroid',
		label: 'Instant Photo',
		params: {
			vignette: {
				on: true,
				shape: 'oval',
				strength: 34,
				size: 66,
				feather: 65,
			},
			grain: { on: true, amount: 20, size: 2, seed: 8 },
			frame: { on: true, style: 'photo', color: '#f6f2ea', size: 5 },
		},
	},
	{
		id: 'filmstrip',
		label: 'Filmstrip',
		params: {
			vignette: {
				on: true,
				shape: 'oval',
				strength: 40,
				size: 60,
				feather: 60,
			},
			grain: { on: true, amount: 32, size: 2, seed: 11 },
			scratches: {
				on: true,
				count: 7,
				strength: 35,
				light: true,
				seed: 9,
			},
			frame: { on: true, style: 'film', color: '#0d0d0f', size: 6 },
		},
	},
	{
		id: 'snapshot',
		label: '90s Snapshot',
		params: {
			vignette: {
				on: true,
				shape: 'oval',
				strength: 36,
				size: 62,
				feather: 62,
			},
			grain: { on: true, amount: 30, size: 2, seed: 14 },
			leaks: {
				on: true,
				strength: 35,
				size: 40,
				count: 1,
				color: '#ff7d5c',
				seed: 9,
			},
			stamp: { on: true, color: '#ff9d2e', size: 4, corner: 'br' },
		},
	},
	{
		id: 'rounded-matte',
		label: 'Rounded Matte',
		params: {
			vignette: {
				on: true,
				shape: 'oval',
				strength: 28,
				size: 70,
				feather: 70,
			},
			frame: {
				on: true,
				style: 'rounded',
				color: '#101114',
				size: 2,
				radius: 7,
			},
		},
	},
	{
		id: 'dusty',
		label: 'Dusty Print',
		params: {
			vignette: { on: true, shape: 'rect', strength: 40, size: 46 },
			dust: { on: true, density: 55, size: 35, light: true, seed: 21 },
			scratches: {
				on: true,
				count: 5,
				strength: 30,
				light: true,
				seed: 8,
			},
		},
	},
];
