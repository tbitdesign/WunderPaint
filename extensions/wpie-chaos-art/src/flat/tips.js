/**
 * Tips and papers: the matter marks are made of.
 *
 * A tip is a small mask (white on transparent) the marks stamp along
 * their paths - bristles, a soft round, a flat, chalk, a split sumi
 * brush, a knife, a splat. Papers are tiles that multiply over the
 * ground and the finished picture. All procedural, all from a SEEDED
 * generator, because the export replays the command log on a fresh
 * surface and must arrive at the same pixels.
 *
 * `createCanvas( w, h )` is injected: the browser's document or
 * node-canvas, so this renders in tests and proof sheets too.
 */

import { makeRng } from '../core/rng.js';

const T = 128;

function withCanvas( createCanvas, w, h, draw ) {
	const c = createCanvas( w, h );
	const g = c.getContext( '2d' );
	draw( g, c );
	return c;
}

const drawers = {
	/** Soft to hard round dab. */
	round( g, rng, v ) {
		const hard = [ 0.25, 0.55, 0.9 ][ v % 3 ];
		const grad = g.createRadialGradient(
			T / 2,
			T / 2,
			0,
			T / 2,
			T / 2,
			T / 2
		);
		grad.addColorStop( 0, 'rgba(255,255,255,1)' );
		grad.addColorStop( hard, 'rgba(255,255,255,1)' );
		grad.addColorStop( 1, 'rgba(255,255,255,0)' );
		g.fillStyle = grad;
		g.fillRect( 0, 0, T, T );
	},
	/** Bristles: many streaks along x, ragged ends. */
	bristle( g, rng, v ) {
		const n = 34 + Math.floor( rng() * 22 );
		for ( let i = 0; i < n; i++ ) {
			const y = T * 0.12 + rng() * T * 0.76;
			const x0 = T * ( 0.04 + rng() * 0.18 );
			const x1 = T * ( 0.78 + rng() * 0.18 );
			g.strokeStyle = `rgba(255,255,255,${ ( 0.3 + rng() * 0.6 ).toFixed(
				2
			) })`;
			g.lineWidth = 1.2 + rng() * ( 3 + v );
			g.lineCap = 'round';
			g.beginPath();
			g.moveTo( x0, y );
			g.bezierCurveTo(
				T * 0.35,
				y + ( rng() - 0.5 ) * 5,
				T * 0.65,
				y + ( rng() - 0.5 ) * 5,
				x1,
				y + ( rng() - 0.5 ) * 4
			);
			g.stroke();
		}
	},
	/** A flat brush: a block with frayed ends and faint streaks. */
	flat( g, rng, v ) {
		g.fillStyle = 'rgba(255,255,255,0.92)';
		g.beginPath();
		g.moveTo( T * 0.1, T * 0.2 );
		for ( let i = 0; i <= 8; i++ ) {
			g.lineTo(
				T * 0.1 + ( rng() - 0.5 ) * 6,
				T * 0.2 + ( i / 8 ) * T * 0.6
			);
		}
		for ( let i = 8; i >= 0; i-- ) {
			g.lineTo(
				T * 0.9 + ( rng() - 0.5 ) * 6,
				T * 0.2 + ( i / 8 ) * T * 0.6
			);
		}
		g.closePath();
		g.fill();
		g.globalCompositeOperation = 'destination-out';
		for ( let i = 0; i < 6 + v * 3; i++ ) {
			const y = T * 0.2 + rng() * T * 0.6;
			g.strokeStyle = `rgba(0,0,0,${ ( 0.2 + rng() * 0.5 ).toFixed(
				2
			) })`;
			g.lineWidth = 0.8 + rng() * 1.6;
			g.beginPath();
			g.moveTo( T * 0.08, y );
			g.lineTo( T * 0.92, y + ( rng() - 0.5 ) * 3 );
			g.stroke();
		}
		g.globalCompositeOperation = 'source-over';
	},
	/** Chalk, pastel, charcoal: powder catching on tooth. */
	chalk( g, rng, v ) {
		const n = 2600 + v * 600;
		for ( let i = 0; i < n; i++ ) {
			const x = rng() * T;
			const y = rng() * T;
			const d = Math.hypot( x - T / 2, y - T / 2 ) / ( T / 2 );
			if ( d > 1 || rng() < d * d * 0.9 ) {
				continue;
			}
			g.fillStyle = `rgba(255,255,255,${ ( 0.35 + rng() * 0.6 ).toFixed(
				2
			) })`;
			const s = 1 + rng() * 2.6;
			g.fillRect( x, y, s, s );
		}
	},
	/** Sumi brush: few thick bristles, split ends, gaps between. */
	sumi( g, rng, v ) {
		const n = 7 + Math.floor( rng() * 6 ) + v;
		for ( let i = 0; i < n; i++ ) {
			const y = T * 0.15 + ( i / n ) * T * 0.7 + ( rng() - 0.5 ) * 6;
			const x1 = T * ( 0.7 + rng() * 0.28 );
			g.strokeStyle = `rgba(255,255,255,${ ( 0.6 + rng() * 0.4 ).toFixed(
				2
			) })`;
			g.lineWidth = 3 + rng() * 6;
			g.lineCap = 'round';
			g.beginPath();
			g.moveTo( T * 0.05, y );
			g.lineTo( x1, y + ( rng() - 0.5 ) * 8 );
			g.stroke();
		}
	},
	/** A hard round: pens and ruled lines. */
	pen( g ) {
		g.fillStyle = '#fff';
		g.beginPath();
		g.arc( T / 2, T / 2, T * 0.47, 0, Math.PI * 2 );
		g.fill();
	},
	/** The knife: a hard edge, a faint gradient across the blade. */
	knife( g, rng, v ) {
		const grad = g.createLinearGradient( 0, 0, 0, T );
		grad.addColorStop( 0, 'rgba(255,255,255,0.15)' );
		grad.addColorStop( 0.5 + v * 0.1, 'rgba(255,255,255,1)' );
		grad.addColorStop( 1, 'rgba(255,255,255,0.7)' );
		g.fillStyle = grad;
		g.fillRect( T * 0.02, T * 0.3, T * 0.96, T * 0.4 );
	},
	/** A splat: an irregular drop. */
	splat( g, rng, v ) {
		g.fillStyle = '#fff';
		g.beginPath();
		const n = 18;
		for ( let i = 0; i <= n; i++ ) {
			const a = ( i / n ) * Math.PI * 2;
			const r =
				T *
				( 0.3 +
					0.12 * Math.sin( a * ( 3 + v ) + rng() * 4 ) +
					rng() * 0.06 );
			const x = T / 2 + Math.cos( a ) * r;
			const y = T / 2 + Math.sin( a ) * r * 0.9;
			if ( i ) {
				g.lineTo( x, y );
			} else {
				g.moveTo( x, y );
			}
		}
		g.closePath();
		g.fill();
	},
};

export const TIP_KINDS = Object.keys( drawers );

/**
 * A set of tips and papers for one surface.
 *
 * @param {Function} createCanvas ( w, h ) → canvas.
 * @param {number}   seed         Deterministic seed.
 * @return {Object} { tip( kind, variant ), tinted( kind, variant, rgb ), paper( kind ) }.
 */
export function makeTips( createCanvas, seed = 7 ) {
	const rng = makeRng( [
		seed >>> 0,
		( seed * 2654435761 ) >>> 0,
		0x1234567,
	] );
	const masks = new Map();
	const tinted = new Map();
	const papers = new Map();
	const tip = ( kind, variant = 0 ) => {
		const key = kind + ':' + variant;
		if ( ! masks.has( key ) ) {
			const d = drawers[ kind ] || drawers.round;
			masks.set(
				key,
				withCanvas( createCanvas, T, T, ( g ) => d( g, rng, variant ) )
			);
		}
		return masks.get( key );
	};
	return {
		size: T,
		tip,
		/** The mask colored - cached per quantized color. */
		tinted( kind, variant, rgb ) {
			const q = ( v ) =>
				Math.round( Math.max( 0, Math.min( 1, v ) ) * 40 );
			const key =
				kind +
				':' +
				variant +
				':' +
				q( rgb[ 0 ] ) +
				',' +
				q( rgb[ 1 ] ) +
				',' +
				q( rgb[ 2 ] );
			let c = tinted.get( key );
			if ( ! c ) {
				const m = tip( kind, variant );
				c = withCanvas( createCanvas, T, T, ( g ) => {
					g.drawImage( m, 0, 0 );
					g.globalCompositeOperation = 'source-in';
					g.fillStyle = `rgb(${ Math.round(
						q( rgb[ 0 ] ) * 6.375
					) },${ Math.round( q( rgb[ 1 ] ) * 6.375 ) },${ Math.round(
						q( rgb[ 2 ] ) * 6.375
					) })`;
					g.fillRect( 0, 0, T, T );
				} );
				if ( tinted.size > 700 ) {
					tinted.delete( tinted.keys().next().value );
				}
				tinted.set( key, c );
			}
			return c;
		},
		/** A paper tile: fibers, weave, or mottle. Gray on white, for multiply. */
		paper( kind = 'paper' ) {
			if ( papers.has( kind ) ) {
				return papers.get( kind );
			}
			const P = 256;
			const prng = makeRng( [ seed + 11, 0x9e3779b9, kind.length ] );
			const c = withCanvas( createCanvas, P, P, ( g ) => {
				g.fillStyle = '#fff';
				g.fillRect( 0, 0, P, P );
				if ( 'canvas' === kind ) {
					// A weave: two families of faint lines.
					for ( let i = 0; i < P; i += 3 ) {
						g.fillStyle = `rgba(0,0,0,${ (
							0.04 +
							prng() * 0.06
						).toFixed( 3 ) })`;
						g.fillRect( 0, i, P, 1 );
						g.fillRect( i, 0, 1, P );
					}
					for ( let i = 0; i < 1400; i++ ) {
						g.fillStyle = `rgba(0,0,0,${ (
							0.03 +
							prng() * 0.07
						).toFixed( 3 ) })`;
						g.fillRect( prng() * P, prng() * P, 2, 2 );
					}
				} else if ( 'panel' === kind ) {
					// A mottled ground: broad soft blotches.
					for ( let i = 0; i < 60; i++ ) {
						const x = prng() * P;
						const y = prng() * P;
						const r = 20 + prng() * 50;
						const grad = g.createRadialGradient( x, y, 0, x, y, r );
						grad.addColorStop(
							0,
							`rgba(0,0,0,${ ( prng() * 0.05 ).toFixed( 3 ) })`
						);
						grad.addColorStop( 1, 'rgba(0,0,0,0)' );
						g.fillStyle = grad;
						g.fillRect( x - r, y - r, r * 2, r * 2 );
					}
				} else {
					// Paper: speckle plus short fibers; kraft is coarser.
					// Fine tooth: many faint specks, few and faint fibers.
					const fibers = 'kraft' === kind ? 700 : 260;
					for ( let i = 0; i < 9000; i++ ) {
						g.fillStyle = `rgba(0,0,0,${ (
							0.015 +
							prng() * 0.045
						).toFixed( 3 ) })`;
						g.fillRect( prng() * P, prng() * P, 1, 1 );
					}
					for ( let i = 0; i < fibers; i++ ) {
						const x = prng() * P;
						const y = prng() * P;
						const a = prng() * Math.PI;
						const l = 2 + prng() * ( 'kraft' === kind ? 12 : 6 );
						g.strokeStyle = `rgba(0,0,0,${ (
							0.02 +
							prng() * 0.04
						).toFixed( 3 ) })`;
						g.lineWidth = 0.5 + prng() * 0.6;
						g.beginPath();
						g.moveTo( x, y );
						g.lineTo(
							x + Math.cos( a ) * l,
							y + Math.sin( a ) * l
						);
						g.stroke();
					}
				}
			} );
			papers.set( kind, c );
			return c;
		},
	};
}
