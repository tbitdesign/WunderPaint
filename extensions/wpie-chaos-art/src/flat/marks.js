/**
 * Marks: what a command becomes on the surface.
 *
 * Every mark is prepared into STEPS (stamps, lines, dots) that the stage
 * can draw one by one while the world's clock runs - so a stroke is
 * seen being made, at the tempo the timekeeper allows - or all at once
 * when the export replays the log. Each command carries its own seed;
 * the same command always makes the same pixels.
 *
 * Coordinates arrive in frame units (x: 0..aspect, y: 0..1); `S` is
 * pixels per unit. Colors are rgb triples 0..1.
 */

import { makeRng, vnoise } from '../core/rng.js';
import { resample } from './hand.js';
import { css, jitter, shade, mix } from './palette2d.js';

const TAU = Math.PI * 2;

const blendOf = ( b ) =>
	( {
		multiply: 'multiply',
		screen: 'screen',
		overlay: 'overlay',
		darken: 'darken',
		lighten: 'lighten',
		lighter: 'lighter',
	} )[ b ] || 'source-over';

/** A polygon with edge noise - torn paper, ragged brushwork, wash rims. */
function noisyPolygon( pts, amt, rng, freq = 6 ) {
	const s0 = rng() * 100;
	const out = [];
	const n = pts.length;
	for ( let i = 0; i < n; i++ ) {
		const a = pts[ i ];
		const b = pts[ ( i + 1 ) % n ];
		const len = Math.hypot( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ] );
		const segs = Math.max( 1, Math.round( len * freq ) );
		const nx = -( b[ 1 ] - a[ 1 ] ) / ( len || 1 );
		const ny = ( b[ 0 ] - a[ 0 ] ) / ( len || 1 );
		for ( let k = 0; k < segs; k++ ) {
			const t = k / segs;
			const d =
				( vnoise( s0 + i * 7 + t * 5, s0 * 0.3, 0 ) - 0.5 ) * amt +
				( rng() - 0.5 ) * amt * 0.25;
			out.push( [
				a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * t + nx * d,
				a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * t + ny * d,
			] );
		}
	}
	return out;
}

/** Ellipse as polygon points. */
function ellipsePts( cx, cy, rx, ry, angle = 0, n = 28 ) {
	const out = [];
	const cs = Math.cos( angle );
	const sn = Math.sin( angle );
	for ( let i = 0; i < n; i++ ) {
		const a = ( i / n ) * TAU;
		const lx = Math.cos( a ) * rx;
		const ly = Math.sin( a ) * ry;
		out.push( [ cx + lx * cs - ly * sn, cy + lx * sn + ly * cs ] );
	}
	return out;
}

function tracePath( g, pts, S ) {
	g.beginPath();
	pts.forEach( ( p, i ) =>
		i
			? g.lineTo( p[ 0 ] * S, p[ 1 ] * S )
			: g.moveTo( p[ 0 ] * S, p[ 1 ] * S )
	);
	g.closePath();
}

/** Stamp a tinted tip at a point: size in px, rotation, alpha. */
function stamp( g, tips, kind, variant, rgb, x, y, w, len, rot, alpha ) {
	if ( alpha <= 0.003 || w < 0.2 ) {
		return;
	}
	const img = tips.tinted( kind, variant, rgb );
	g.save();
	g.globalAlpha = Math.min( 1, alpha );
	g.translate( x, y );
	g.rotate( rot );
	g.drawImage( img, -len / 2, -w / 2, len, w );
	g.restore();
}

/* ------------------------------- preparers ------------------------------- */

/**
 * A stroke: hand points stamped with a tip.
 * cmd: { pts: [{x,y,w,t,speed,dry}], tip, variant, color, alpha, blend,
 *        dry (0..1 breakup), colorVar (0..1), relief (0..1), stretch }
 */
function prepStroke( cmd, env ) {
	const { S, tips } = env;
	const rng = env.rng;
	const kind = cmd.tip || 'bristle';
	const isRound =
		'round' === kind ||
		'pen' === kind ||
		'chalk' === kind ||
		'splat' === kind;
	const wMin = Math.max( 0.0015, Math.min( ...cmd.pts.map( ( p ) => p.w ) ) );
	const hairy =
		'bristle' === kind ||
		'sumi' === kind ||
		'flat' === kind ||
		'chalk' === kind;
	const spacing = Math.max( 0.0008, wMin * ( hairy ? 0.42 : 0.22 ) );
	const pts = resample( cmd.pts, spacing );
	const n = pts.length;
	const variant =
		cmd.variant === undefined ? Math.floor( rng() * 3 ) : cmd.variant;
	const base = cmd.color;
	const colors = [];
	const cv = cmd.colorVar || 0;
	// Color drifts slowly along the stroke, and per stamp a little.
	let drift = base;
	for ( let i = 0; i < n; i++ ) {
		if ( cv > 0 && i % 9 === 0 ) {
			drift = jitter( base, rng, cv );
		}
		colors.push(
			cv > 0 ? mix( drift, jitter( drift, rng, cv * 0.4 ), 0.5 ) : base
		);
	}
	const s0 = rng() * 100;
	const dry = cmd.dry || 0;
	const stretch = cmd.stretch || ( isRound ? 1 : 1.9 );
	const relief = cmd.relief || 0;
	const lightAng = env.lightAngle === undefined ? -2.2 : env.lightAngle;
	const draw = ( g, i ) => {
		const p = pts[ i ];
		const q = pts[ Math.min( n - 1, i + 1 ) ];
		const r = pts[ Math.max( 0, i - 1 ) ];
		const rot = Math.atan2( q.y - r.y, q.x - r.x );
		const w = p.w * S;
		// Hairy tips stay below full cover per stamp, so the hairs
		// stay visible where stamps overlap instead of fusing to a ribbon.
		let a =
			( cmd.alpha === undefined ? 1 : cmd.alpha ) * ( hairy ? 0.62 : 1 );
		// Dry breakup: the load runs out, bristles skip; noise decides which.
		if ( dry > 0 ) {
			const load = 1 - Math.min( 1, p.dry * dry * 1.3 );
			const holes = vnoise( s0 + i * 0.7, p.t * 4, 0 );
			if ( holes > load + 0.12 ) {
				return;
			}
			a *= 0.55 + 0.45 * load;
		}
		const col = colors[ i ];
		const len = isRound
			? w
			: w * stretch * ( 0.85 + 0.3 * vnoise( s0 + i * 0.3, 2, 0 ) );
		g.globalCompositeOperation = blendOf( cmd.blend );
		if ( relief > 0 && w > 4 ) {
			// Impasto: a lit ridge and a shadow, the paint standing up.
			const ox = Math.cos( lightAng ) * w * 0.07;
			const oy = Math.sin( lightAng ) * w * 0.07;
			stamp(
				g,
				tips,
				kind,
				variant,
				shade( col, 0.35 ),
				p.x * S + ox,
				p.y * S + oy,
				w * 0.95,
				len * 0.95,
				rot,
				a * relief * 0.35
			);
			stamp(
				g,
				tips,
				kind,
				variant,
				shade( col, -0.35 ),
				p.x * S - ox,
				p.y * S - oy,
				w * 0.95,
				len * 0.95,
				rot,
				a * relief * 0.4
			);
		}
		stamp( g, tips, kind, variant, col, p.x * S, p.y * S, w, len, rot, a );
		g.globalCompositeOperation = 'source-over';
	};
	return { steps: n, draw, bounds: pts };
}

/**
 * A wash: translucent pigment pooling with a darker rim (watercolor,
 * ink dilution). cmd: { pts | (cx, cy, rx, ry, angle), color, alpha,
 * rim (0..1), grain (0..1), edge (noise amount) }
 */
function prepWash( cmd, env ) {
	const { S, tips, rng } = env;
	const base =
		cmd.pts ||
		ellipsePts( cmd.cx, cmd.cy, cmd.rx, cmd.ry, cmd.angle || 0, 26 );
	const poly = noisyPolygon(
		base,
		cmd.edge === undefined ? 0.02 : cmd.edge,
		rng,
		7
	);
	const a = cmd.alpha === undefined ? 0.3 : cmd.alpha;
	const rim = cmd.rim === undefined ? 0.6 : cmd.rim;
	const grain = cmd.grain || 0;
	// Layers of the same pool build the depth real washes have.
	const layers = 2 + Math.round( ( cmd.depth || 0 ) * 2 );
	const steps = layers + ( grain > 0 ? 1 : 0 );
	let cx = 0;
	let cy = 0;
	for ( const p of poly ) {
		cx += p[ 0 ];
		cy += p[ 1 ];
	}
	cx /= poly.length;
	cy /= poly.length;
	let rmax = 0;
	for ( const p of poly ) {
		rmax = Math.max( rmax, Math.hypot( p[ 0 ] - cx, p[ 1 ] - cy ) );
	}
	const outlines = [];
	for ( let i = 0; i < layers; i++ ) {
		const grow = 1 + ( i === 0 ? 0.05 : -0.04 * i );
		outlines.push(
			noisyPolygon(
				base.map( ( p ) => [
					cx + ( p[ 0 ] - cx ) * grow,
					cy + ( p[ 1 ] - cy ) * grow,
				] ),
				cmd.edge === undefined ? 0.02 : cmd.edge,
				rng,
				7
			)
		);
	}
	const draw = ( g, i ) => {
		g.globalCompositeOperation = blendOf( cmd.blend || 'multiply' );
		if ( i < layers ) {
			// The first pass is the feathered halo a wet edge leaves; the
			// later ones pool toward the middle and dry darker at the rim.
			tracePath( g, outlines[ i ], S );
			const grad = g.createRadialGradient(
				cx * S,
				cy * S,
				0,
				cx * S,
				cy * S,
				rmax * S * ( i === 0 ? 1.05 : 1 )
			);
			const inner = css(
				shade( cmd.color, 0.1 ),
				a * ( i === 0 ? 0.35 : 0.5 )
			);
			grad.addColorStop( 0, inner );
			grad.addColorStop(
				0.7,
				css( cmd.color, a * ( i === 0 ? 0.4 : 0.6 ) )
			);
			grad.addColorStop(
				0.93,
				css( cmd.color, a * ( 0.6 + rim * 0.5 ) )
			);
			grad.addColorStop(
				1,
				css( cmd.color, a * ( i === 0 ? 0.15 : 0.5 + rim * 0.3 ) )
			);
			g.fillStyle = grad;
			g.fill();
		} else {
			// Granulation: pigment settling in the tooth of the paper.
			g.save();
			tracePath( g, poly, S );
			g.clip();
			const n = Math.round( 60 + grain * 300 * ( rmax * rmax * 40 ) );
			const dark = shade( cmd.color, -0.25 );
			for ( let k = 0; k < Math.min( 900, n ); k++ ) {
				const ang = rng() * TAU;
				const rr = Math.sqrt( rng() ) * rmax;
				const x = ( cx + Math.cos( ang ) * rr ) * S;
				const y = ( cy + Math.sin( ang ) * rr ) * S;
				stamp(
					g,
					tips,
					'chalk',
					1,
					dark,
					x,
					y,
					6 + rng() * 10 * ( S / 1000 ),
					6 + rng() * 10 * ( S / 1000 ),
					rng() * TAU,
					a * grain * 0.5
				);
			}
			g.restore();
		}
		g.globalCompositeOperation = 'source-over';
	};
	return {
		steps,
		draw,
		bounds: poly.map( ( p ) => ( { x: p[ 0 ], y: p[ 1 ], w: 0 } ) ),
	};
}

/** Shape points for the flat geometric kinds. */
function shapePts( cmd, rng ) {
	const { kind, x, y } = cmd;
	const w = cmd.w || 0.1;
	const h = cmd.h || w;
	const ang = cmd.angle || 0;
	const rot = ( px, py ) => {
		const cs = Math.cos( ang );
		const sn = Math.sin( ang );
		return [ x + px * cs - py * sn, y + px * sn + py * cs ];
	};
	switch ( kind ) {
		case 'circle':
			return ellipsePts( x, y, w / 2, h / 2, ang, 48 );
		case 'tri': {
			return [
				rot( -w / 2, h / 2 ),
				rot( w / 2, h / 2 ),
				rot( ( rng() - 0.5 ) * w * 0.6, -h / 2 ),
			];
		}
		case 'wedge': {
			const n = 14;
			const out = [ rot( 0, 0 ) ];
			const a0 = -( cmd.sweep || 0.9 ) / 2;
			for ( let i = 0; i <= n; i++ ) {
				const a = a0 + ( i / n ) * ( cmd.sweep || 0.9 );
				out.push( rot( Math.cos( a ) * w, Math.sin( a ) * w ) );
			}
			return out;
		}
		case 'poly':
			return cmd.pts;
		case 'bar':
		case 'rect':
		default:
			return [
				rot( -w / 2, -h / 2 ),
				rot( w / 2, -h / 2 ),
				rot( w / 2, h / 2 ),
				rot( -w / 2, h / 2 ),
			];
	}
}

/**
 * A flat shape: rect, bar, circle, tri, wedge, poly, ring, arc.
 * cmd: { kind, x, y, w, h, angle, color, alpha, edge: 'crisp'|'ragged'|'print',
 *        stroke: rgb|null, strokeW, inner (ring hole 0..1) }
 */
function prepShape( cmd, env ) {
	const { S, rng } = env;
	const a = cmd.alpha === undefined ? 1 : cmd.alpha;
	const edge = cmd.edge || 'crisp';
	const draw = ( g, i ) => {
		g.globalCompositeOperation = blendOf( cmd.blend );
		if ( 'ring' === cmd.kind || 'arc' === cmd.kind ) {
			const r = ( cmd.w || 0.1 ) / 2;
			const lw = ( cmd.strokeW || r * 0.25 ) * S;
			g.strokeStyle = css( cmd.color, a );
			g.lineWidth = lw;
			g.lineCap = 'butt';
			g.beginPath();
			const a0 = cmd.a0 || 0;
			const a1 =
				'ring' === cmd.kind
					? TAU
					: cmd.a1 === undefined
					? Math.PI
					: cmd.a1;
			g.arc( cmd.x * S, cmd.y * S, r * S, a0, a1 );
			g.stroke();
			g.globalCompositeOperation = 'source-over';
			return;
		}
		let pts = shapePts( cmd, rng );
		if ( 'ragged' === edge ) {
			pts = noisyPolygon( pts, 0.012 + ( cmd.rag || 0 ) * 0.02, rng, 9 );
		}
		if ( 'print' === edge && i === 1 ) {
			// Misregistration: a second, slightly shifted pull of the screen.
			const dx = ( rng() - 0.5 ) * 0.006;
			const dy = ( rng() - 0.5 ) * 0.006;
			pts = pts.map( ( p ) => [ p[ 0 ] + dx, p[ 1 ] + dy ] );
			tracePath( g, pts, S );
			g.fillStyle = css( cmd.color, a * 0.45 );
			g.fill();
			g.globalCompositeOperation = 'source-over';
			return;
		}
		if ( cmd.soft ) {
			// A breathing edge: the shape laid down in expanding veils.
			const k = Math.max( 2, Math.round( cmd.soft ) );
			const cx = cmd.x;
			const cy = cmd.y;
			for ( let j = k - 1; j >= 0; j-- ) {
				const grow = 1 + ( j / k ) * ( cmd.softReach || 0.12 );
				const veil = noisyPolygon(
					pts.map( ( p ) => [
						cx + ( p[ 0 ] - cx ) * grow,
						cy + ( p[ 1 ] - cy ) * grow,
					] ),
					0.01 + ( cmd.softReach || 0.12 ) * 0.25,
					rng,
					8
				);
				tracePath( g, veil, S );
				g.fillStyle = css(
					cmd.color,
					( a / k ) * ( j === 0 ? 1.4 : 0.9 )
				);
				g.fill();
			}
			g.globalCompositeOperation = 'source-over';
			return;
		}
		tracePath( g, pts, S );
		if ( cmd.gradient ) {
			// Facet shading: light falls across the plane.
			const ang = cmd.gradient.angle || 0;
			const cx = cmd.x * S;
			const cy = cmd.y * S;
			const r = Math.max( cmd.w || 0.1, cmd.h || 0.1 ) * S * 0.6;
			const grad = g.createLinearGradient(
				cx - Math.cos( ang ) * r,
				cy - Math.sin( ang ) * r,
				cx + Math.cos( ang ) * r,
				cy + Math.sin( ang ) * r
			);
			grad.addColorStop(
				0,
				css( shade( cmd.color, cmd.gradient.amount || 0.25 ), a )
			);
			grad.addColorStop(
				1,
				css( shade( cmd.color, -( cmd.gradient.amount || 0.25 ) ), a )
			);
			g.fillStyle = grad;
		} else {
			g.fillStyle = css( cmd.color, a * ( 'print' === edge ? 0.9 : 1 ) );
		}
		g.fill();
		if ( cmd.stroke ) {
			g.strokeStyle = css( cmd.stroke, a );
			g.lineWidth = ( cmd.strokeW || 0.003 ) * S;
			g.lineJoin = 'round';
			g.stroke();
		}
		g.globalCompositeOperation = 'source-over';
	};
	return {
		steps: 'print' === edge ? 2 : 1,
		draw,
		bounds: [
			{
				x: cmd.x,
				y: cmd.y,
				w: Math.max( cmd.w || 0.1, cmd.h || 0.1 ) / 2,
			},
		],
	};
}

/**
 * Torn paper: a fibrous edge, a paper texture, a soft shadow.
 * cmd: { pts | (x, y, w, h, angle), color, alpha, paper, shadow (0..1), print }
 */
function prepCut( cmd, env ) {
	const { S, rng, tips } = env;
	const base =
		cmd.pts ||
		shapePts(
			{
				kind: 'rect',
				x: cmd.x,
				y: cmd.y,
				w: cmd.w,
				h: cmd.h,
				angle: cmd.angle,
			},
			rng
		);
	const poly = noisyPolygon(
		base,
		0.008 + ( cmd.tear || 0.5 ) * 0.014,
		rng,
		14
	);
	const shadow = cmd.shadow === undefined ? 0.5 : cmd.shadow;
	const draw = ( g, i ) => {
		if ( i === 0 && shadow > 0 ) {
			g.globalCompositeOperation = 'multiply';
			for ( let k = 3; k >= 1; k-- ) {
				const off = 0.004 * k;
				tracePath(
					g,
					poly.map( ( p ) => [ p[ 0 ] + off, p[ 1 ] + off * 1.2 ] ),
					S
				);
				g.fillStyle = `rgba(20,10,0,${ ( 0.07 * shadow ).toFixed(
					3
				) })`;
				g.fill();
			}
			g.globalCompositeOperation = 'source-over';
			return;
		}
		tracePath( g, poly, S );
		g.fillStyle = css( cmd.color, cmd.alpha === undefined ? 1 : cmd.alpha );
		g.fill();
		if ( cmd.print ) {
			// Printed matter on the paper: rules, halftone, or text-like rows.
			g.save();
			tracePath( g, poly, S );
			g.clip();
			const ink = cmd.ink || [ 0.1, 0.1, 0.1 ];
			g.fillStyle = css( ink, 0.75 );
			g.strokeStyle = css( ink, 0.75 );
			const b = polyBounds( poly );
			if ( 'halftone' === cmd.print ) {
				const step = 0.012 * ( cmd.printScale || 1 );
				for ( let y = b.y0; y < b.y1; y += step ) {
					for ( let x = b.x0; x < b.x1; x += step ) {
						const r =
							step *
							0.5 *
							( 0.35 + 0.6 * vnoise( x * 30, y * 30, 1 ) );
						g.beginPath();
						g.arc( x * S, y * S, r * S, 0, TAU );
						g.fill();
					}
				}
			} else if ( 'stripes' === cmd.print ) {
				const step = 0.02 * ( cmd.printScale || 1 );
				g.lineWidth = step * 0.35 * S;
				for ( let y = b.y0; y < b.y1; y += step ) {
					g.beginPath();
					g.moveTo( b.x0 * S, y * S );
					g.lineTo( b.x1 * S, y * S );
					g.stroke();
				}
			} else {
				// Text: rows of dashes of uneven length.
				const lh = 0.014 * ( cmd.printScale || 1 );
				g.lineWidth = lh * 0.45 * S;
				for ( let y = b.y0 + lh; y < b.y1; y += lh ) {
					let x = b.x0 + 0.004;
					while ( x < b.x1 ) {
						const wlen = 0.01 + rng() * 0.03;
						g.beginPath();
						g.moveTo( x * S, y * S );
						g.lineTo( ( x + wlen ) * S, y * S );
						g.stroke();
						x += wlen + 0.006;
					}
				}
			}
			g.restore();
		}
		// The paper's own fibers, faintly.
		g.save();
		tracePath( g, poly, S );
		g.clip();
		g.globalCompositeOperation = 'multiply';
		g.globalAlpha = 0.35;
		const pat = g.createPattern(
			tips.paper( cmd.paper || 'paper' ),
			'repeat'
		);
		g.fillStyle = pat;
		const b2 = polyBounds( poly );
		g.fillRect(
			b2.x0 * S,
			b2.y0 * S,
			( b2.x1 - b2.x0 ) * S,
			( b2.y1 - b2.y0 ) * S
		);
		g.restore();
	};
	return {
		steps: 2,
		draw,
		bounds: poly.map( ( p ) => ( { x: p[ 0 ], y: p[ 1 ], w: 0 } ) ),
	};
}

function polyBounds( poly ) {
	let x0 = Infinity;
	let y0 = Infinity;
	let x1 = -Infinity;
	let y1 = -Infinity;
	for ( const p of poly ) {
		x0 = Math.min( x0, p[ 0 ] );
		y0 = Math.min( y0, p[ 1 ] );
		x1 = Math.max( x1, p[ 0 ] );
		y1 = Math.max( y1, p[ 1 ] );
	}
	return { x0, y0, x1, y1 };
}

/** A pen or ruled line along hand points. cmd: { pts, color, alpha, width } */
function prepLine( cmd, env ) {
	const { S } = env;
	const pts = cmd.pts;
	const draw = ( g, i ) => {
		if ( i === 0 ) {
			return;
		}
		g.globalCompositeOperation = blendOf( cmd.blend );
		g.strokeStyle = css(
			cmd.color,
			cmd.alpha === undefined ? 1 : cmd.alpha
		);
		g.lineWidth = Math.max( 0.6, ( cmd.width || pts[ i ].w ) * S );
		g.lineCap = 'round';
		g.beginPath();
		g.moveTo( pts[ i - 1 ].x * S, pts[ i - 1 ].y * S );
		g.lineTo( pts[ i ].x * S, pts[ i ].y * S );
		g.stroke();
		g.globalCompositeOperation = 'source-over';
	};
	return { steps: pts.length, draw, bounds: pts };
}

/**
 * Dots and dabs in a region: pointillism, impressionist broken color.
 * cmd: { cx, cy, rx, ry, angle, n, size: [lo, hi], colors: [rgb...],
 *        tip, alpha, along (radians | null: random), spread }
 */
function prepDots( cmd, env ) {
	const { S, tips, rng } = env;
	const n = cmd.n || 40;
	const dots = [];
	for ( let i = 0; i < n; i++ ) {
		const a = rng() * TAU;
		const r = Math.pow(
			rng(),
			cmd.spread === undefined ? 0.7 : cmd.spread
		);
		const lx = Math.cos( a ) * r * cmd.rx;
		const ly = Math.sin( a ) * r * cmd.ry;
		const cs = Math.cos( cmd.angle || 0 );
		const sn = Math.sin( cmd.angle || 0 );
		const size = cmd.size[ 0 ] + rng() * ( cmd.size[ 1 ] - cmd.size[ 0 ] );
		const col =
			cmd.colors[
				Math.floor( rng() * cmd.colors.length ) % cmd.colors.length
			];
		dots.push( {
			x: cmd.cx + lx * cs - ly * sn,
			y: cmd.cy + lx * sn + ly * cs,
			size,
			rot:
				cmd.along === undefined || cmd.along === null
					? rng() * TAU
					: cmd.along + ( rng() - 0.5 ) * ( cmd.alongVar || 0.5 ),
			col: cmd.colorVar ? jitter( col, rng, cmd.colorVar ) : col,
			v: Math.floor( rng() * 3 ),
		} );
	}
	const kind = cmd.tip || 'round';
	const draw = ( g, i ) => {
		const d = dots[ i ];
		g.globalCompositeOperation = blendOf( cmd.blend );
		const w = d.size * S;
		const isRound =
			'round' === kind ||
			'pen' === kind ||
			'chalk' === kind ||
			'splat' === kind;
		stamp(
			g,
			tips,
			kind,
			d.v,
			d.col,
			d.x * S,
			d.y * S,
			w,
			isRound ? w : w * ( cmd.stretch || 1.8 ),
			d.rot,
			cmd.alpha === undefined ? 1 : cmd.alpha
		);
		g.globalCompositeOperation = 'source-over';
	};
	return {
		steps: n,
		draw,
		bounds: dots.map( ( d ) => ( { x: d.x, y: d.y, w: d.size } ) ),
	};
}

/**
 * Splatter: drops flung along a direction, some with tails.
 * cmd: { x, y, angle, n, reach, size: [lo, hi], color, alpha }
 */
function prepSplatter( cmd, env ) {
	const { S, tips, rng } = env;
	const n = cmd.n || 24;
	const drops = [];
	for ( let i = 0; i < n; i++ ) {
		const d = Math.pow( rng(), 0.6 ) * ( cmd.reach || 0.2 );
		const a = ( cmd.angle || 0 ) + ( rng() - 0.5 ) * ( cmd.spread || 0.9 );
		const size =
			( cmd.size[ 0 ] +
				Math.pow( rng(), 2.2 ) * ( cmd.size[ 1 ] - cmd.size[ 0 ] ) ) *
			( 1 - d * 1.5 );
		drops.push( {
			x: cmd.x + Math.cos( a ) * d,
			y: cmd.y + Math.sin( a ) * d,
			size: Math.max( 0.001, size ),
			a,
			tail: rng() < 0.3 ? 2 + rng() * 3 : 1,
			v: Math.floor( rng() * 4 ),
		} );
	}
	const draw = ( g, i ) => {
		const d = drops[ i ];
		g.globalCompositeOperation = blendOf( cmd.blend );
		stamp(
			g,
			tips,
			'splat',
			d.v,
			cmd.color,
			d.x * S,
			d.y * S,
			d.size * S,
			d.size * S * d.tail,
			d.a,
			cmd.alpha === undefined ? 1 : cmd.alpha
		);
		g.globalCompositeOperation = 'source-over';
	};
	return {
		steps: n,
		draw,
		bounds: drops.map( ( d ) => ( { x: d.x, y: d.y, w: d.size } ) ),
	};
}

/** A drip: paint running down, thinning, pooling at the end. cmd: { x, y, len, width, color, alpha } */
function prepDrip( cmd, env ) {
	const { S, rng } = env;
	const segs = Math.max( 4, Math.round( cmd.len * 60 ) );
	const s0 = rng() * 40;
	const pts = [];
	for ( let i = 0; i <= segs; i++ ) {
		const t = i / segs;
		pts.push( {
			x: cmd.x + ( vnoise( s0 + t * 5, 0, 0 ) - 0.5 ) * cmd.width * 1.2,
			y: cmd.y + t * cmd.len,
			w: cmd.width * ( 1 - t * 0.6 ),
		} );
	}
	const draw = ( g, i ) => {
		g.globalCompositeOperation = blendOf( cmd.blend );
		g.strokeStyle = css(
			cmd.color,
			cmd.alpha === undefined ? 0.95 : cmd.alpha
		);
		g.fillStyle = g.strokeStyle;
		g.lineCap = 'round';
		if ( i < segs ) {
			g.lineWidth = Math.max( 0.8, pts[ i ].w * S );
			g.beginPath();
			g.moveTo( pts[ i ].x * S, pts[ i ].y * S );
			g.lineTo( pts[ i + 1 ].x * S, pts[ i + 1 ].y * S );
			g.stroke();
		} else {
			const p = pts[ segs ];
			g.beginPath();
			g.arc( p.x * S, p.y * S, cmd.width * 0.9 * S, 0, TAU );
			g.fill();
		}
		g.globalCompositeOperation = 'source-over';
	};
	return { steps: segs + 1, draw, bounds: pts };
}

/**
 * The knife: drags what is already there along a direction - paint
 * smeared, never removed. cmd: { x, y, angle, len, width, alpha }
 */
function prepScrape( cmd, env ) {
	const { S, rng } = env;
	const steps = Math.max( 3, Math.round( cmd.len * 40 ) );
	const draw = ( g, i ) => {
		const src = g.canvas;
		const step = ( cmd.len / steps ) * S;
		const dx = Math.cos( cmd.angle ) * step;
		const dy = Math.sin( cmd.angle ) * step;
		const w = cmd.width * S;
		g.save();
		g.translate( cmd.x * S + dx * i, cmd.y * S + dy * i );
		g.rotate( cmd.angle );
		g.beginPath();
		g.rect( -step, -w / 2, step * 1.5, w );
		g.clip();
		g.rotate( -cmd.angle );
		g.translate( -( cmd.x * S + dx * i ), -( cmd.y * S + dy * i ) );
		g.globalAlpha =
			( cmd.alpha === undefined ? 0.85 : cmd.alpha ) *
			( 1 - ( i / steps ) * 0.6 );
		g.drawImage(
			src,
			dx * 1.6 + ( rng() - 0.5 ),
			dy * 1.6 + ( rng() - 0.5 )
		);
		g.restore();
	};
	return { steps, draw, bounds: [ { x: cmd.x, y: cmd.y, w: cmd.len } ] };
}

/** A glaze over a region or the whole picture. cmd: { x, y, w, h, color, alpha, blend, soft } */
function prepGlaze( cmd, env ) {
	const { S } = env;
	const draw = ( g ) => {
		g.globalCompositeOperation = blendOf( cmd.blend || 'multiply' );
		const x = ( cmd.x || 0 ) * S;
		const y = ( cmd.y || 0 ) * S;
		const w = ( cmd.w === undefined ? env.aspect : cmd.w ) * S;
		const h = ( cmd.h === undefined ? 1 : cmd.h ) * S;
		if ( cmd.soft ) {
			// Fades out INSIDE the box, so no edge of the box ever shows.
			g.save();
			g.beginPath();
			g.ellipse( x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2 );
			g.clip();
			const grad = g.createRadialGradient(
				x + w / 2,
				y + h / 2,
				0,
				x + w / 2,
				y + h / 2,
				Math.max( w, h ) * 0.5
			);
			grad.addColorStop( 0, css( cmd.color, cmd.alpha ) );
			grad.addColorStop( 0.55, css( cmd.color, cmd.alpha * 0.6 ) );
			grad.addColorStop( 1, css( cmd.color, 0 ) );
			g.fillStyle = grad;
			g.fillRect( x, y, w, h );
			g.restore();
			g.globalCompositeOperation = 'source-over';
			return;
		}
		{
			g.fillStyle = css( cmd.color, cmd.alpha );
		}
		g.fillRect( x, y, w, h );
		g.globalCompositeOperation = 'source-over';
	};
	return { steps: 1, draw, bounds: [] };
}

/** Hatching: parallel short lines. cmd: { x, y, angle, n, spacing, len, width, color, alpha } */
function prepHatch( cmd, env ) {
	const { S, rng } = env;
	const n = cmd.n || 8;
	const cs = Math.cos( cmd.angle );
	const sn = Math.sin( cmd.angle );
	const lines = [];
	for ( let i = 0; i < n; i++ ) {
		const off = ( i - ( n - 1 ) / 2 ) * cmd.spacing;
		const jit = ( rng() - 0.5 ) * cmd.spacing * 0.5;
		const l = cmd.len * ( 0.7 + rng() * 0.6 );
		const cx = cmd.x - sn * off;
		const cy = cmd.y + cs * off;
		lines.push( [
			[ cx - ( cs * l ) / 2 + sn * jit, cy - ( sn * l ) / 2 - cs * jit ],
			[ cx + ( cs * l ) / 2 + sn * jit, cy + ( sn * l ) / 2 - cs * jit ],
		] );
	}
	const draw = ( g, i ) => {
		g.globalCompositeOperation = blendOf( cmd.blend );
		g.strokeStyle = css(
			cmd.color,
			cmd.alpha === undefined ? 0.8 : cmd.alpha
		);
		g.lineWidth = Math.max( 0.6, cmd.width * S );
		g.lineCap = 'round';
		g.beginPath();
		g.moveTo( lines[ i ][ 0 ][ 0 ] * S, lines[ i ][ 0 ][ 1 ] * S );
		g.lineTo( lines[ i ][ 1 ][ 0 ] * S, lines[ i ][ 1 ][ 1 ] * S );
		g.stroke();
		g.globalCompositeOperation = 'source-over';
	};
	return {
		steps: n,
		draw,
		bounds: [ { x: cmd.x, y: cmd.y, w: cmd.len / 2 } ],
	};
}

/** A small star or asterisk. cmd: { x, y, r, color, width, alpha, arms } */
function prepStar( cmd, env ) {
	const { S } = env;
	const arms = cmd.arms || 4;
	const draw = ( g, i ) => {
		g.strokeStyle = css(
			cmd.color,
			cmd.alpha === undefined ? 1 : cmd.alpha
		);
		g.lineWidth = Math.max( 0.6, ( cmd.width || 0.003 ) * S );
		g.lineCap = 'round';
		const a = ( i / arms ) * Math.PI;
		g.beginPath();
		g.moveTo(
			( cmd.x - Math.cos( a ) * cmd.r ) * S,
			( cmd.y - Math.sin( a ) * cmd.r ) * S
		);
		g.lineTo(
			( cmd.x + Math.cos( a ) * cmd.r ) * S,
			( cmd.y + Math.sin( a ) * cmd.r ) * S
		);
		g.stroke();
	};
	return { steps: arms, draw, bounds: [ { x: cmd.x, y: cmd.y, w: cmd.r } ] };
}

/* ------------------------------ spray ------------------------------ */

/** A spray can: a cloud of tiny dots along a path, dense at the middle. */
function prepSpray( cmd, env ) {
	const { S, tips, rng } = env;
	const pts = cmd.pts;
	const n = cmd.n || 320;
	const dots = [];
	for ( let i = 0; i < n; i++ ) {
		const t = rng();
		const k = Math.min(
			pts.length - 1,
			Math.floor( t * ( pts.length - 1 ) )
		);
		const a = pts[ k ];
		const b = pts[ Math.min( pts.length - 1, k + 1 ) ];
		const f = t * ( pts.length - 1 ) - k;
		const x = a.x + ( b.x - a.x ) * f;
		const y = a.y + ( b.y - a.y ) * f;
		// A gaussian-ish spread around the path, wider at the ends.
		const g = ( rng() + rng() + rng() - 1.5 ) * ( cmd.width || 0.04 );
		const ang = rng() * TAU;
		dots.push( {
			x: x + Math.cos( ang ) * g,
			y: y + Math.sin( ang ) * g,
			size: ( cmd.dot || 0.004 ) * ( 0.5 + rng() ),
			a:
				( cmd.alpha === undefined ? 0.8 : cmd.alpha ) *
				( 0.3 + rng() * 0.7 ),
		} );
	}
	const draw = ( g, i ) => {
		const d = dots[ i ];
		stamp(
			g,
			tips,
			'round',
			0,
			cmd.color,
			d.x * S,
			d.y * S,
			d.size * S,
			d.size * S,
			0,
			d.a
		);
	};
	return {
		steps: n,
		draw,
		bounds: dots.map( ( d ) => ( { x: d.x, y: d.y, w: d.size } ) ),
	};
}

/* ----------------------------- halftone ----------------------------- */

/** A screen of dots inside an ellipse, their size a gradient across it. */
function prepHalftone( cmd, env ) {
	const { S, rng } = env;
	const pitch = cmd.pitch || 0.018;
	const cs = Math.cos( cmd.angle || 0 );
	const sn = Math.sin( cmd.angle || 0 );
	const gdir = cmd.gradient === undefined ? rng() * TAU : cmd.gradient;
	const gx = Math.cos( gdir );
	const gy = Math.sin( gdir );
	const dots = [];
	const R = Math.max( cmd.rx, cmd.ry );
	for ( let v = -R; v <= R; v += pitch ) {
		for ( let u = -R; u <= R; u += pitch ) {
			if (
				( u * u ) / ( cmd.rx * cmd.rx ) +
					( v * v ) / ( cmd.ry * cmd.ry ) >
				1
			) {
				continue;
			}
			// The gradient: 0..1 across the ellipse in the gradient direction.
			const t = 0.5 + ( ( u * gx + v * gy ) / R ) * 0.5;
			const rad =
				pitch *
				( ( cmd.minR || 0.12 ) +
					( ( cmd.maxR || 0.5 ) - ( cmd.minR || 0.12 ) ) *
						( cmd.invert ? 1 - t : t ) );
			dots.push( {
				x: cmd.cx + u * cs - v * sn,
				y: cmd.cy + u * sn + v * cs,
				r: rad,
			} );
		}
	}
	const per = 24;
	const steps = Math.max( 1, Math.ceil( dots.length / per ) );
	const draw = ( g, i ) => {
		g.globalCompositeOperation = blendOf( cmd.blend || 'multiply' );
		g.fillStyle = css( cmd.color, cmd.alpha === undefined ? 1 : cmd.alpha );
		g.beginPath();
		for (
			let k = i * per;
			k < Math.min( dots.length, ( i + 1 ) * per );
			k++
		) {
			const d = dots[ k ];
			g.moveTo( ( d.x + d.r ) * S, d.y * S );
			g.arc( d.x * S, d.y * S, d.r * S, 0, TAU );
		}
		g.fill();
		g.globalCompositeOperation = 'source-over';
	};
	return {
		steps,
		draw,
		bounds: [ { x: cmd.cx, y: cmd.cy, w: R } ],
	};
}

/* ----------------------------- tesserae ----------------------------- */

/** A mosaic: little stones in rows that follow the shape, grout between. */
function prepTesserae( cmd, env ) {
	const { S, rng } = env;
	const size = cmd.stone || 0.022;
	const cs = Math.cos( cmd.angle || 0 );
	const sn = Math.sin( cmd.angle || 0 );
	const stones = [];
	const R = Math.max( cmd.rx, cmd.ry );
	let row = 0;
	for ( let v = -R; v <= R; v += size * 1.12 ) {
		const off = row % 2 ? size * 0.5 : 0;
		row++;
		for ( let u = -R + off; u <= R; u += size * 1.12 ) {
			const ju = u + ( rng() - 0.5 ) * size * 0.2;
			const jv = v + ( rng() - 0.5 ) * size * 0.2;
			if (
				( ju * ju ) / ( cmd.rx * cmd.rx ) +
					( jv * jv ) / ( cmd.ry * cmd.ry ) >
				1
			) {
				continue;
			}
			const cols = cmd.colors || [ cmd.color ];
			const col = cols[ Math.floor( rng() * cols.length ) % cols.length ];
			stones.push( {
				x: cmd.cx + ju * cs - jv * sn,
				y: cmd.cy + ju * sn + jv * cs,
				w: size * ( 0.8 + rng() * 0.25 ),
				h: size * ( 0.8 + rng() * 0.25 ),
				rot: ( cmd.angle || 0 ) + ( rng() - 0.5 ) * 0.35,
				col: jitter(
					col,
					rng,
					cmd.colorVar === undefined ? 0.06 : cmd.colorVar
				),
				gold: cmd.gold && rng() < cmd.gold,
			} );
		}
	}
	const per = 16;
	const steps = Math.max( 1, Math.ceil( stones.length / per ) );
	const draw = ( g, i ) => {
		for (
			let k = i * per;
			k < Math.min( stones.length, ( i + 1 ) * per );
			k++
		) {
			const st = stones[ k ];
			g.save();
			g.translate( st.x * S, st.y * S );
			g.rotate( st.rot );
			g.fillStyle = css(
				st.gold ? [ 0.85, 0.68, 0.25 ] : st.col,
				cmd.alpha === undefined ? 1 : cmd.alpha
			);
			g.fillRect(
				( -st.w / 2 ) * S,
				( -st.h / 2 ) * S,
				st.w * S,
				st.h * S
			);
			// A glint on the upper edge, a shade below: a stone, not a pixel.
			g.fillStyle = 'rgba(255,255,255,0.18)';
			g.fillRect(
				( -st.w / 2 ) * S,
				( -st.h / 2 ) * S,
				st.w * S,
				Math.max( 1, st.h * S * 0.12 )
			);
			g.fillStyle = 'rgba(0,0,0,0.16)';
			g.fillRect(
				( -st.w / 2 ) * S,
				( st.h / 2 ) * S - Math.max( 1, st.h * S * 0.12 ),
				st.w * S,
				Math.max( 1, st.h * S * 0.12 )
			);
			g.restore();
		}
	};
	return {
		steps,
		draw,
		bounds: [ { x: cmd.cx, y: cmd.cy, w: R } ],
	};
}

/* ------------------------------- lead ------------------------------- */

/** Clip a convex polygon by the half-plane closer to `a` than to `b`. */
function clipHalfPlane( poly, a, b ) {
	const out = [];
	const nx = b[ 0 ] - a[ 0 ];
	const ny = b[ 1 ] - a[ 1 ];
	const mx = ( a[ 0 ] + b[ 0 ] ) / 2;
	const my = ( a[ 1 ] + b[ 1 ] ) / 2;
	const side = ( p ) => ( p[ 0 ] - mx ) * nx + ( p[ 1 ] - my ) * ny; // <= 0 keeps
	for ( let i = 0; i < poly.length; i++ ) {
		const p = poly[ i ];
		const q = poly[ ( i + 1 ) % poly.length ];
		const sp = side( p );
		const sq = side( q );
		if ( sp <= 0 ) {
			out.push( p );
		}
		if ( sp <= 0 !== sq <= 0 ) {
			const t = sp / ( sp - sq );
			out.push( [
				p[ 0 ] + ( q[ 0 ] - p[ 0 ] ) * t,
				p[ 1 ] + ( q[ 1 ] - p[ 1 ] ) * t,
			] );
		}
	}
	return out;
}

/** Stained glass: a region split into cells by lead, each cell glowing. */
function prepLead( cmd, env ) {
	const { S, rng } = env;
	const n = cmd.cells || 7;
	const seeds = [];
	for ( let i = 0; i < n; i++ ) {
		const a = rng() * TAU;
		const r = 0.15 + Math.sqrt( rng() ) * 0.8;
		seeds.push( [
			cmd.cx + Math.cos( a ) * r * cmd.rx,
			cmd.cy + Math.sin( a ) * r * cmd.ry,
		] );
	}
	// Each cell: the ellipse clipped by the bisectors against every other seed.
	const rim = ellipsePts(
		cmd.cx,
		cmd.cy,
		cmd.rx,
		cmd.ry,
		cmd.angle || 0,
		40
	);
	const cells = seeds.map( ( sd, i ) => {
		let poly = rim;
		seeds.forEach( ( o, j ) => {
			if ( j !== i && poly.length > 2 ) {
				poly = clipHalfPlane( poly, sd, o );
			}
		} );
		return poly;
	} );
	const cols = cmd.colors || [ cmd.color ];
	const draw = ( g, i ) => {
		if ( i < cells.length ) {
			const poly = cells[ i ];
			if ( poly.length < 3 ) {
				return;
			}
			const col = cols[ i % cols.length ];
			g.globalCompositeOperation = blendOf( cmd.blend || 'multiply' );
			tracePath( g, poly, S );
			g.fillStyle = css(
				col,
				cmd.alpha === undefined ? 0.85 : cmd.alpha
			);
			g.fill();
			// The glass is not flat: a lighter breath toward one corner.
			const p0 = poly[ Math.floor( rng() * poly.length ) ];
			const grad = g.createRadialGradient(
				p0[ 0 ] * S,
				p0[ 1 ] * S,
				0,
				p0[ 0 ] * S,
				p0[ 1 ] * S,
				Math.max( cmd.rx, cmd.ry ) * S * 0.9
			);
			grad.addColorStop( 0, 'rgba(255,255,255,0.28)' );
			grad.addColorStop( 1, 'rgba(255,255,255,0)' );
			g.globalCompositeOperation = 'source-over';
			g.fillStyle = grad;
			g.fill();
			return;
		}
		// The lead: every cell outlined, thick and dark, joined round.
		g.globalCompositeOperation = 'source-over';
		g.strokeStyle = css( cmd.lead || [ 0.08, 0.07, 0.07 ], 1 );
		g.lineWidth = ( cmd.leadW || 0.006 ) * S;
		g.lineJoin = 'round';
		g.lineCap = 'round';
		for ( const poly of cells ) {
			if ( poly.length > 2 ) {
				tracePath( g, poly, S );
				g.stroke();
			}
		}
	};
	return {
		steps: cells.length + 1,
		draw,
		bounds: [ { x: cmd.cx, y: cmd.cy, w: Math.max( cmd.rx, cmd.ry ) } ],
	};
}

/* ------------------------------ tendril ------------------------------ */

/** A whiplash curve: a long tapered S that curls into a spiral at the end. */
function prepTendril( cmd, env ) {
	const { S, rng } = env;
	const pts = [];
	const n = 48;
	const len = cmd.len || 0.3;
	let x = cmd.x;
	let y = cmd.y;
	let a = cmd.angle || 0;
	const curl = ( cmd.curl || 1 ) * ( rng() < 0.5 ? 1 : -1 );
	const w0 = cmd.width || 0.01;
	for ( let i = 0; i < n; i++ ) {
		const t = i / ( n - 1 );
		// Straight-ish start, an S in the middle, a tightening spiral at the end.
		const turn =
			Math.sin( t * Math.PI * 2 ) * 0.12 * curl +
			( t > 0.6 ? ( t - 0.6 ) * 1.6 * curl : 0 );
		a += turn;
		const step = ( len / n ) * ( t > 0.6 ? 1 - ( t - 0.6 ) * 1.6 : 1 );
		x += Math.cos( a ) * step;
		y += Math.sin( a ) * step;
		pts.push( {
			x,
			y,
			w: w0 * ( 1 - t * 0.85 ) * ( 0.7 + 0.3 * Math.sin( t * Math.PI ) ),
		} );
	}
	const per = 4;
	const steps = Math.ceil( n / per );
	const draw = ( g, i ) => {
		g.strokeStyle = css(
			cmd.color,
			cmd.alpha === undefined ? 1 : cmd.alpha
		);
		g.lineCap = 'round';
		g.lineJoin = 'round';
		for (
			let k = Math.max( 1, i * per );
			k < Math.min( n, ( i + 1 ) * per + 1 );
			k++
		) {
			g.lineWidth = Math.max( 0.8, pts[ k ].w * S );
			g.beginPath();
			g.moveTo( pts[ k - 1 ].x * S, pts[ k - 1 ].y * S );
			g.lineTo( pts[ k ].x * S, pts[ k ].y * S );
			g.stroke();
		}
	};
	return { steps, draw, bounds: pts };
}

/* ------------------------------- orbit ------------------------------- */

/** Concentric rings of color, an Orphist disc. */
function prepOrbit( cmd, env ) {
	const { S, rng } = env;
	const n = cmd.rings || 5;
	const cols = cmd.colors || [ cmd.color ];
	const ringW = cmd.r / n;
	const draw = ( g, i ) => {
		const k = n - 1 - i; // outside in
		g.globalCompositeOperation = blendOf( cmd.blend || 'multiply' );
		g.fillStyle = css(
			cols[ k % cols.length ],
			cmd.alpha === undefined ? 0.92 : cmd.alpha
		);
		g.beginPath();
		const r = ringW * ( k + 1 );
		if ( cmd.halves ) {
			// Two halves in two colors, a Delaunay disc.
			g.arc(
				cmd.x * S,
				cmd.y * S,
				r * S,
				cmd.angle || 0,
				( cmd.angle || 0 ) + Math.PI
			);
			g.fill();
			g.fillStyle = css(
				cols[ ( k + 1 ) % cols.length ],
				cmd.alpha === undefined ? 0.92 : cmd.alpha
			);
			g.beginPath();
			g.arc(
				cmd.x * S,
				cmd.y * S,
				r * S,
				( cmd.angle || 0 ) + Math.PI,
				( cmd.angle || 0 ) + TAU
			);
			g.fill();
		} else {
			g.arc( cmd.x * S, cmd.y * S, r * S, 0, TAU );
			g.fill();
		}
		g.globalCompositeOperation = 'source-over';
		void rng;
	};
	return {
		steps: n,
		draw,
		bounds: [ { x: cmd.x, y: cmd.y, w: cmd.r } ],
	};
}

/* ------------------------------ sketch ------------------------------ */

/** An underdrawing: charcoal lines, a little unsteady, one per step. */
function prepSketch( cmd, env ) {
	const { S, rng } = env;
	const lines = cmd.lines || [];
	const draw = ( g, i ) => {
		const line = lines[ i ];
		if ( ! line || line.length < 2 ) {
			return;
		}
		g.strokeStyle = css(
			cmd.color,
			cmd.alpha === undefined ? 0.5 : cmd.alpha
		);
		g.lineWidth = ( cmd.width || 0.003 ) * S;
		g.lineCap = 'round';
		g.lineJoin = 'round';
		g.beginPath();
		const wob = ( cmd.wobble || 0.004 ) * S;
		line.forEach( ( p, k ) => {
			const x = p[ 0 ] * S + ( rng() - 0.5 ) * wob;
			const y = p[ 1 ] * S + ( rng() - 0.5 ) * wob;
			if ( k ) {
				g.lineTo( x, y );
			} else {
				g.moveTo( x, y );
			}
		} );
		g.stroke();
	};
	return {
		steps: lines.length,
		draw,
		bounds: lines
			.flat()
			.map( ( p ) => ( { x: p[ 0 ], y: p[ 1 ], w: 0.01 } ) ),
	};
}

/* ------------------------------- piece ------------------------------- */

/** A piece of the motif, placed: paper shadow first, then the piece, torn or cut. */
function prepPiece( cmd, env ) {
	const { S, rng } = env;
	const hw = cmd.w / 2;
	const hh = cmd.h / 2;
	const rect = [
		[ -hw, -hh ],
		[ hw, -hh ],
		[ hw, hh ],
		[ -hw, hh ],
	];
	const outline =
		'torn' === cmd.edge
			? noisyPolygon( rect, 0.006 + Math.min( hw, hh ) * 0.12, rng, 7 )
			: rect;
	const draw = ( g, i ) => {
		g.save();
		g.translate( cmd.x * S, cmd.y * S );
		g.rotate( cmd.angle || 0 );
		if ( 0 === i ) {
			if ( cmd.shadow ) {
				// A paper shadow: three soft offsets, darker toward the sheet.
				for ( let k = 3; k >= 1; k-- ) {
					g.save();
					g.translate( 0.0025 * k * S, 0.0035 * k * S );
					tracePath( g, outline, S );
					g.fillStyle = `rgba(0,0,0,${ (
						( cmd.shadow * 0.16 ) /
						k
					).toFixed( 3 ) })`;
					g.fill();
					g.restore();
				}
			}
			g.restore();
			return;
		}
		g.globalCompositeOperation = blendOf( cmd.blend );
		g.globalAlpha = cmd.alpha === undefined ? 1 : cmd.alpha;
		tracePath( g, outline, S );
		g.clip();
		g.drawImage( cmd.canvas, -hw * S, -hh * S, cmd.w * S, cmd.h * S );
		if ( 'burnt' === cmd.edge ) {
			// A scorched rim: dark along the outline.
			g.strokeStyle = 'rgba(40,20,8,0.55)';
			g.lineWidth = Math.max( 1, 0.004 * S );
			tracePath( g, outline, S );
			g.stroke();
		}
		g.restore();
	};
	return {
		steps: 2,
		draw,
		bounds: [ { x: cmd.x, y: cmd.y, w: Math.max( hw, hh ) } ],
	};
}

const PREP = {
	piece: prepPiece,
	sketch: prepSketch,
	spray: prepSpray,
	halftone: prepHalftone,
	tesserae: prepTesserae,
	lead: prepLead,
	tendril: prepTendril,
	orbit: prepOrbit,
	stroke: prepStroke,
	wash: prepWash,
	shape: prepShape,
	cut: prepCut,
	line: prepLine,
	dots: prepDots,
	splatter: prepSplatter,
	drip: prepDrip,
	scrape: prepScrape,
	glaze: prepGlaze,
	hatch: prepHatch,
	star: prepStar,
};

export const MARK_KINDS = Object.keys( PREP );

/**
 * Prepare a command for drawing.
 *
 * @param {Object} cmd Command ({ type, seed, ... }).
 * @param {Object} env { S, aspect, tips, lightAngle }.
 * @return {Object|null} { steps, draw( ctx, i ), bounds } or null for unknown types.
 */
export function prepareMark( cmd, env ) {
	const prep = PREP[ cmd.type ];
	if ( ! prep ) {
		return null;
	}
	const seed = ( cmd.seed || 1 ) >>> 0;
	const rng = makeRng( [
		seed,
		( seed ^ 0x9e3779b9 ) >>> 0,
		( seed * 2654435761 ) >>> 0,
	] );
	try {
		return prep( cmd, { ...env, rng } );
	} catch ( e ) {
		return null;
	}
}
