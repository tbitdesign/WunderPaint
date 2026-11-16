/**
 * Poster frames: crisp vector borders in the accent (or foil) color,
 * drawn over the backdrop. Every frame reports how far the content has
 * to stay inside it, so the layout never lets art or text touch the
 * ornament.
 */

import { drawGlyph, SIGN_KEYS } from './glyphs.js';
import { foilStyle, rgba, star4 } from './themes.js';

export const FRAMES = [
	'none',
	'line',
	'double',
	'deco',
	'stars',
	'moons',
	'zodiac',
	'arch',
	'celestial',
];

const TAU = Math.PI * 2;

/**
 * Where the frame line sits and where content may start, in px.
 *
 * @param {string} style Frame key.
 * @param {number} w     Sheet width.
 * @param {number} h     Sheet height.
 * @return {{ line: number, inset: number, top: number, bottom: number }}
 *   line = distance of the frame line from the edge, inset = content
 *   inset on every side, top/bottom = inset at top and bottom (the arch
 *   and the moon row need more room there).
 */
export function frameMetrics( style, w, h ) {
	const u = Math.min( w, h );
	const line = u * 0.045;
	if ( 'none' === style || ! FRAMES.includes( style ) ) {
		const m = u * 0.07;
		return { line: 0, inset: m, top: m, bottom: m };
	}
	let inset = line + u * 0.05;
	let top = inset;
	let bottom = inset;
	if ( 'deco' === style || 'celestial' === style ) {
		inset = line + u * 0.07;
		top = inset;
		bottom = inset;
	}
	if ( 'moons' === style ) {
		top = line + u * 0.08;
		bottom = top;
	}
	if ( 'zodiac' === style ) {
		inset = line + u * 0.065;
		top = inset;
		bottom = inset;
	}
	if ( 'arch' === style ) {
		const r = Math.min( ( w - 2 * line ) / 2, h * 0.36 );
		top = line + r * 0.42 + u * 0.03;
	}
	return { line, inset, top, bottom };
}

/**
 * Draw with round gaps: everything `draw` strokes stays outside the
 * given circles (even-odd clip against the whole sheet).
 *
 * @param {CanvasRenderingContext2D} ctx   Context.
 * @param {number}   w     Sheet width.
 * @param {number}   h     Sheet height.
 * @param {Array}    holes [ [ x, y, r ] ].
 * @param {Function} draw  Strokes to clip.
 */
function withHoles( ctx, w, h, holes, draw ) {
	ctx.save();
	ctx.beginPath();
	ctx.rect( 0, 0, w, h );
	for ( const [ x, y, r ] of holes ) {
		ctx.moveTo( x + r, y );
		ctx.arc( x, y, r, 0, TAU );
	}
	ctx.clip( 'evenodd' );
	draw();
	ctx.restore();
}

function rectPath( ctx, x, y, w, h ) {
	ctx.beginPath();
	ctx.rect( x, y, w, h );
}

/** A tiny vector moon phase icon (0..360, 0 = new). */
export function phaseIcon( ctx, x, y, r, angle, color ) {
	const a = r * Math.cos( ( angle * Math.PI ) / 180 );
	const waxing = angle < 180;
	ctx.save();
	ctx.strokeStyle = color;
	ctx.fillStyle = color;
	ctx.lineWidth = Math.max( 0.8, r * 0.12 );
	ctx.beginPath();
	ctx.arc( x, y, r, 0, TAU );
	ctx.stroke();
	// Lit part: the outer half-disc on the lit side plus the terminator
	// ellipse (bulging in for crescents, out for gibbous).
	ctx.translate( x, y );
	ctx.scale( waxing ? 1 : -1, 1 );
	ctx.beginPath();
	ctx.arc( 0, 0, r, -Math.PI / 2, Math.PI / 2 );
	ctx.ellipse(
		0,
		0,
		Math.max( 0.001, Math.abs( a ) ),
		r,
		0,
		Math.PI / 2,
		-Math.PI / 2,
		a < 0
	);
	ctx.closePath();
	ctx.fill();
	ctx.restore();
}

/** Art-deco corner: stepped brackets and a small fan. */
function decoCorner( ctx, x, y, sx, sy, u, stroke ) {
	const s = u * 0.05;
	ctx.strokeStyle = stroke;
	ctx.beginPath();
	for ( let i = 1; i <= 3; i++ ) {
		const d = s * i * 0.55;
		ctx.moveTo( x + sx * d, y );
		ctx.lineTo( x + sx * d, y + sy * ( s * 1.9 - d ) );
		ctx.lineTo( x, y + sy * ( s * 1.9 - d ) );
	}
	ctx.stroke();
	// Fan rays from the inner corner.
	const fx = x + sx * s * 1.9;
	const fy = y + sy * s * 1.9;
	ctx.beginPath();
	for ( let k = 0; k <= 4; k++ ) {
		const a = ( k / 4 ) * ( Math.PI / 2 );
		ctx.moveTo( fx, fy );
		ctx.lineTo(
			fx + sx * Math.cos( a ) * s * 0.9,
			fy + sy * Math.sin( a ) * s * 0.9
		);
	}
	ctx.stroke();
}

/** A sun with rays: a ring and alternating long and short beams. */
function sunMotif( ctx, x, y, r, stroke, fill ) {
	ctx.strokeStyle = stroke;
	ctx.fillStyle = fill;
	ctx.beginPath();
	ctx.arc( x, y, r, 0, TAU );
	ctx.fill();
	ctx.beginPath();
	for ( let i = 0; i < 16; i++ ) {
		const a = ( i / 16 ) * TAU;
		const r2 = r * ( 0 === i % 2 ? 2.1 : 1.6 );
		ctx.moveTo( x + Math.cos( a ) * r * 1.3, y + Math.sin( a ) * r * 1.3 );
		ctx.lineTo( x + Math.cos( a ) * r2, y + Math.sin( a ) * r2 );
	}
	ctx.stroke();
}

/** A crescent: a disc with an offset disc cut out. */
function crescentMotif( ctx, x, y, r, fill ) {
	ctx.save();
	ctx.fillStyle = fill;
	ctx.beginPath();
	ctx.arc( x, y, r, 0, TAU );
	ctx.arc( x + r * 0.42, y - r * 0.18, r * 0.84, 0, TAU, true );
	ctx.fill( 'evenodd' );
	ctx.restore();
}

/**
 * Paint a frame over the backdrop.
 *
 * @param {CanvasRenderingContext2D} ctx   Context.
 * @param {number} w     Sheet width.
 * @param {number} h     Sheet height.
 * @param {Object} theme Resolved theme.
 * @param {string} style Frame key.
 */
export function paintFrame( ctx, w, h, theme, style ) {
	if ( 'none' === style || ! FRAMES.includes( style ) ) {
		return;
	}
	const u = Math.min( w, h );
	const { line } = frameMetrics( style, w, h );
	const stroke = foilStyle( ctx, w, h, theme );
	const thin = Math.max( 1, u * 0.0016 );
	const main = Math.max( 1.2, u * 0.0026 );
	const x0 = line;
	const y0 = line;
	const W = w - 2 * line;
	const H = h - 2 * line;
	ctx.save();
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	ctx.strokeStyle = stroke;
	ctx.fillStyle = stroke;

	if ( 'line' === style ) {
		ctx.lineWidth = main;
		rectPath( ctx, x0, y0, W, H );
		ctx.stroke();
	} else if ( 'double' === style ) {
		ctx.lineWidth = main * 1.4;
		rectPath( ctx, x0, y0, W, H );
		ctx.stroke();
		const d = u * 0.012;
		ctx.lineWidth = thin;
		rectPath( ctx, x0 + d, y0 + d, W - 2 * d, H - 2 * d );
		ctx.stroke();
	} else if ( 'deco' === style ) {
		ctx.lineWidth = main;
		rectPath( ctx, x0, y0, W, H );
		ctx.stroke();
		const d = u * 0.014;
		ctx.lineWidth = thin;
		rectPath( ctx, x0 + d, y0 + d, W - 2 * d, H - 2 * d );
		ctx.stroke();
		const c = u * 0.012;
		decoCorner( ctx, x0 + d + c, y0 + d + c, 1, 1, u, stroke );
		decoCorner( ctx, x0 + W - d - c, y0 + d + c, -1, 1, u, stroke );
		decoCorner( ctx, x0 + d + c, y0 + H - d - c, 1, -1, u, stroke );
		decoCorner( ctx, x0 + W - d - c, y0 + H - d - c, -1, -1, u, stroke );
		// Diamonds in the middle of every edge.
		const dm = u * 0.012;
		for ( const [ x, y ] of [
			[ w / 2, y0 ],
			[ w / 2, y0 + H ],
			[ x0, h / 2 ],
			[ x0 + W, h / 2 ],
		] ) {
			ctx.beginPath();
			ctx.moveTo( x, y - dm );
			ctx.lineTo( x + dm, y );
			ctx.lineTo( x, y + dm );
			ctx.lineTo( x - dm, y );
			ctx.closePath();
			ctx.fill();
		}
	} else if ( 'stars' === style ) {
		ctx.lineWidth = thin;
		rectPath( ctx, x0, y0, W, H );
		ctx.stroke();
		const step = u * 0.055;
		const s = u * 0.0085;
		const along = ( ax, ay, bx, by ) => {
			const len = Math.hypot( bx - ax, by - ay );
			const n = Math.max( 2, Math.round( len / step ) );
			for ( let i = 1; i < n; i++ ) {
				const t = i / n;
				star4( ctx, ax + ( bx - ax ) * t, ay + ( by - ay ) * t, s );
			}
		};
		along( x0, y0, x0 + W, y0 );
		along( x0, y0 + H, x0 + W, y0 + H );
		along( x0, y0, x0, y0 + H );
		along( x0 + W, y0, x0 + W, y0 + H );
		for ( const [ x, y ] of [
			[ x0, y0 ],
			[ x0 + W, y0 ],
			[ x0, y0 + H ],
			[ x0 + W, y0 + H ],
		] ) {
			star4( ctx, x, y, s * 2.4 );
		}
	} else if ( 'moons' === style ) {
		ctx.lineWidth = thin;
		const r = u * 0.017;
		const gap = r * 3.2;
		const n = 7;
		const rowW = ( n - 1 ) * gap;
		// Lines stop short of the moon rows.
		const cut = rowW / 2 + gap;
		ctx.beginPath();
		ctx.moveTo( w / 2 - cut, y0 );
		ctx.lineTo( x0, y0 );
		ctx.lineTo( x0, y0 + H );
		ctx.lineTo( w / 2 - cut, y0 + H );
		ctx.moveTo( w / 2 + cut, y0 );
		ctx.lineTo( x0 + W, y0 );
		ctx.lineTo( x0 + W, y0 + H );
		ctx.lineTo( w / 2 + cut, y0 + H );
		ctx.stroke();
		for ( const y of [ y0, y0 + H ] ) {
			for ( let i = 0; i < n; i++ ) {
				const angle = 45 + ( i / ( n - 1 ) ) * 270;
				phaseIcon(
					ctx,
					w / 2 - rowW / 2 + i * gap,
					y,
					3 === i ? r * 1.25 : r,
					y === y0 ? angle : 360 - angle,
					theme.accent
				);
			}
		}
	} else if ( 'zodiac' === style ) {
		// Three signs on every edge, in order round the sheet.
		const spots = [];
		for ( let i = 1; i <= 3; i++ ) {
			spots.push( [ x0 + ( W * i ) / 4, y0 ] );
		}
		for ( let i = 1; i <= 3; i++ ) {
			spots.push( [ x0 + W, y0 + ( H * i ) / 4 ] );
		}
		for ( let i = 3; i >= 1; i-- ) {
			spots.push( [ x0 + ( W * i ) / 4, y0 + H ] );
		}
		for ( let i = 3; i >= 1; i-- ) {
			spots.push( [ x0, y0 + ( H * i ) / 4 ] );
		}
		const r = u * 0.024;
		// The line stops at every sign: cut out, not painted over, so any
		// backdrop shows through the gap.
		withHoles(
			ctx,
			w,
			h,
			spots.map( ( [ x, y ] ) => [ x, y, r ] ),
			() => {
				ctx.lineWidth = thin;
				rectPath( ctx, x0, y0, W, H );
				ctx.stroke();
			}
		);
		spots.forEach( ( [ x, y ], i ) => {
			ctx.beginPath();
			ctx.arc( x, y, r, 0, TAU );
			ctx.strokeStyle = stroke;
			ctx.lineWidth = thin;
			ctx.stroke();
			drawGlyph( ctx, SIGN_KEYS[ i ], x, y, r * 1.05, theme.accent );
		} );
	} else if ( 'arch' === style ) {
		const r = Math.min( W / 2, h * 0.36 );
		const top = y0 + r;
		const draw = ( inset ) => {
			const rr = r - inset;
			ctx.beginPath();
			ctx.moveTo( x0 + inset, y0 + H - inset );
			ctx.lineTo( x0 + inset, top );
			ctx.ellipse( w / 2, top, W / 2 - inset, rr, 0, Math.PI, 0 );
			ctx.lineTo( x0 + W - inset, y0 + H - inset );
			ctx.closePath();
			ctx.stroke();
		};
		ctx.lineWidth = main * 1.2;
		draw( 0 );
		ctx.lineWidth = thin;
		draw( u * 0.014 );
		ctx.fillStyle = theme.accent;
		star4( ctx, w / 2, y0 - u * 0.001, u * 0.022 );
		star4( ctx, w / 2 - u * 0.05, y0 + u * 0.018, u * 0.008 );
		star4( ctx, w / 2 + u * 0.05, y0 + u * 0.018, u * 0.008 );
	} else if ( 'celestial' === style ) {
		const d = u * 0.012;
		const sr = u * 0.018;
		// Sun at the top, crescent at the bottom, each in a gap of the
		// double line.
		withHoles(
			ctx,
			w,
			h,
			[
				[ w / 2, y0 + d / 2, sr * 2.6 ],
				[ w / 2, y0 + H - d / 2, sr * 2.2 ],
			],
			() => {
				ctx.lineWidth = thin;
				rectPath( ctx, x0, y0, W, H );
				ctx.stroke();
				rectPath( ctx, x0 + d, y0 + d, W - 2 * d, H - 2 * d );
				ctx.stroke();
			}
		);
		// Corner arcs with a star each.
		const cr = u * 0.07;
		ctx.lineWidth = main;
		for ( const [ cx, cy, a0 ] of [
			[ x0 + d, y0 + d, 0 ],
			[ x0 + W - d, y0 + d, Math.PI / 2 ],
			[ x0 + W - d, y0 + H - d, Math.PI ],
			[ x0 + d, y0 + H - d, ( 3 * Math.PI ) / 2 ],
		] ) {
			ctx.beginPath();
			ctx.arc( cx, cy, cr, a0, a0 + Math.PI / 2 );
			ctx.stroke();
			ctx.fillStyle = theme.accent;
			star4(
				ctx,
				cx + Math.cos( a0 + Math.PI / 4 ) * cr * 0.55,
				cy + Math.sin( a0 + Math.PI / 4 ) * cr * 0.55,
				u * 0.011
			);
		}
		ctx.lineWidth = thin;
		sunMotif( ctx, w / 2, y0 + d / 2, sr, stroke, theme.accent );
		crescentMotif( ctx, w / 2, y0 + H - d / 2, sr * 1.3, theme.accent );
		ctx.fillStyle = rgba( theme.accent, 0.9 );
	}
	ctx.restore();
}
