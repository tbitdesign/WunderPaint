/**
 * The finished piece: the chart as it looks once it is made - crosses of
 * floss on Aida, knitted Vs, crochet blocks, a shaggy latch-hook pile,
 * faceted drills, ironed beads. This is the picture a pattern post shows
 * next to its chart. Same grid, same colours, same cell size as the
 * chart, so both can sit side by side.
 *
 * Pure module apart from the 2d context handed in; seeded, so the same
 * chart always gives the same piece.
 */

const rgb = ( p, a = 1 ) =>
	1 === a
		? `rgb(${ p[ 0 ] | 0 },${ p[ 1 ] | 0 },${ p[ 2 ] | 0 })`
		: `rgba(${ p[ 0 ] | 0 },${ p[ 1 ] | 0 },${ p[ 2 ] | 0 },${ a })`;
const shade = ( p, f ) =>
	p.map( ( v ) => Math.max( 0, Math.min( 255, v * f ) ) );
const lift = ( p, f ) => p.map( ( v ) => v + ( 255 - v ) * f );
const lum = ( p ) => ( 0.299 * p[ 0 ] + 0.587 * p[ 1 ] + 0.114 * p[ 2 ] ) / 255;
const sat = ( p ) => {
	const mx = Math.max( ...p );
	return mx ? ( mx - Math.min( ...p ) ) / mx : 0;
};

/** A rounded rectangle path, without relying on ctx.roundRect. */
function rrect( g, x, y, w, h, r ) {
	const k = Math.min( r, w / 2, h / 2 );
	g.beginPath();
	g.moveTo( x + k, y );
	g.arcTo( x + w, y, x + w, y + h, k );
	g.arcTo( x + w, y + h, x, y + h, k );
	g.arcTo( x, y + h, x, y, k );
	g.arcTo( x, y, x + w, y, k );
	g.closePath();
}

function rng( seed ) {
	let a = seed >>> 0 || 1;
	return () => {
		a |= 0;
		a = ( a + 0x6d2b79f5 ) | 0;
		let t = Math.imul( a ^ ( a >>> 15 ), 1 | a );
		t = ( t + Math.imul( t ^ ( t >>> 7 ), 61 | t ) ) ^ t;
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;
	};
}

export const FINISHED_MODES = [
	'crossstitch',
	'diamond',
	'beads',
	'knitting',
	'c2c',
	'latchhook',
];

const AIDA = [ 243, 239, 228 ];

/** A near-white yarn on Aida is the fabric itself: it stays unstitched. */
const isFabric = ( p ) => lum( p ) > 0.93 && sat( p ) < 0.08;

function crossStitch( g, grid, cols, rows, c, ox, oy, rand ) {
	const W = cols * c;
	const H = rows * c;
	g.fillStyle = rgb( AIDA );
	g.fillRect( ox, oy, W, H );
	// The weave: little raised blocks between the holes.
	for ( let r = 0; r < rows; r++ ) {
		for ( let q = 0; q < cols; q++ ) {
			const x = ox + q * c;
			const y = oy + r * c;
			g.fillStyle = rgb( lift( AIDA, 0.35 + rand() * 0.15 ) );
			g.fillRect( x + c * 0.14, y + c * 0.14, c * 0.72, c * 0.72 );
			g.fillStyle = 'rgba(120,108,86,0.33)';
			g.beginPath();
			g.arc( x, y, c * 0.1, 0, Math.PI * 2 );
			g.fill();
		}
	}
	// Two strands of floss, not quite reaching the holes.
	const w = c * 0.4;
	const i0 = c * 0.11;
	const leg = ( p, x0, y0, x1, y1, lw, shadow ) => {
		g.lineCap = 'round';
		if ( shadow ) {
			g.strokeStyle = 'rgba(40,30,20,0.18)';
			g.lineWidth = lw * 1.06;
			g.beginPath();
			g.moveTo( x0 + lw * 0.1, y0 + lw * 0.16 );
			g.lineTo( x1 + lw * 0.1, y1 + lw * 0.16 );
			g.stroke();
		}
		g.strokeStyle = rgb( shade( p, 0.72 ) );
		g.lineWidth = lw;
		g.beginPath();
		g.moveTo( x0, y0 );
		g.lineTo( x1, y1 );
		g.stroke();
		g.strokeStyle = rgb( p );
		g.lineWidth = lw * 0.72;
		g.stroke();
		// The twist of the floss: short darker strokes across the leg.
		const dx = x1 - x0;
		const dy = y1 - y0;
		const len = Math.hypot( dx, dy );
		const ux = dx / len;
		const uy = dy / len;
		g.strokeStyle = rgb( shade( p, 0.62 ), 0.55 );
		g.lineWidth = Math.max( 0.6, lw * 0.1 );
		for ( let k = 1; k < 4; k++ ) {
			const t = ( k / 4 ) * len;
			const mx = x0 + ux * t;
			const my = y0 + uy * t;
			g.beginPath();
			g.moveTo(
				mx - uy * lw * 0.3 - ux * lw * 0.18,
				my + ux * lw * 0.3 - uy * lw * 0.18
			);
			g.lineTo(
				mx + uy * lw * 0.3 + ux * lw * 0.18,
				my - ux * lw * 0.3 + uy * lw * 0.18
			);
			g.stroke();
		}
		g.strokeStyle = rgb( lift( p, 0.42 ), 0.7 );
		g.lineWidth = lw * 0.18;
		g.beginPath();
		g.moveTo( x0 - uy * lw * 0.16, y0 + ux * lw * 0.16 );
		g.lineTo( x1 - uy * lw * 0.16, y1 + ux * lw * 0.16 );
		g.stroke();
	};
	const { palette, idx } = grid;
	// Row by row, all the bottom legs first and then every top leg across
	// them - the way a row of cross-stitch is worked, and the reason the
	// top legs all lie the same way.
	const legs = [];
	for ( let r = 0; r < rows; r++ ) {
		for ( let q = 0; q < cols; q++ ) {
			const p = palette[ idx[ r * cols + q ] ];
			if ( isFabric( p ) ) {
				continue;
			}
			const x = ox + q * c;
			const y = oy + r * c;
			const j = () => ( rand() - 0.5 ) * c * 0.04;
			legs.push( {
				p,
				bottom: [
					x + i0 + j(),
					y + c - i0 + j(),
					x + c - i0 + j(),
					y + i0 + j(),
				],
				top: [
					x + i0 + j(),
					y + i0 + j(),
					x + c - i0 + j(),
					y + c - i0 + j(),
				],
			} );
		}
	}
	for ( const { p, bottom } of legs ) {
		leg( p, ...bottom, w * 0.92, false );
	}
	for ( const { p, top } of legs ) {
		leg( p, ...top, w, true );
	}
}

function knitting( g, grid, cols, rows, c, h, ox, oy, rand ) {
	const { palette, idx } = grid;
	for ( let r = 0; r < rows; r++ ) {
		for ( let q = 0; q < cols; q++ ) {
			g.fillStyle = rgb( shade( palette[ idx[ r * cols + q ] ], 0.5 ) );
			g.fillRect( ox + q * c, oy + r * h, c, h );
		}
	}
	// Bottom row first: every stitch tucks its top under the one above.
	for ( let r = rows - 1; r >= 0; r-- ) {
		for ( let q = 0; q < cols; q++ ) {
			const p = palette[ idx[ r * cols + q ] ];
			const x = ox + q * c;
			const y = oy + r * h;
			for ( const side of [ -1, 1 ] ) {
				const cx = x + c / 2 + side * c * 0.2;
				const cy = y + h * 0.42;
				g.save();
				g.translate( cx, cy );
				g.rotate( side * ( 0.5 + ( rand() - 0.5 ) * 0.08 ) );
				const rx = c * 0.25;
				const ry = h * 0.72;
				const fill = g.createRadialGradient(
					-rx * 0.3,
					-ry * 0.3,
					rx * 0.1,
					0,
					0,
					ry
				);
				fill.addColorStop( 0, rgb( lift( p, 0.28 ) ) );
				fill.addColorStop( 0.6, rgb( p ) );
				fill.addColorStop( 1, rgb( shade( p, 0.66 ) ) );
				g.fillStyle = fill;
				g.beginPath();
				g.ellipse( 0, 0, rx, ry, 0, 0, Math.PI * 2 );
				g.fill();
				g.strokeStyle = rgb( shade( p, 0.45 ), 0.6 );
				g.lineWidth = Math.max( 0.5, c * 0.035 );
				g.stroke();
				// Fibres along the loop.
				g.strokeStyle = rgb( lift( p, 0.2 ), 0.35 );
				g.lineWidth = Math.max( 0.4, c * 0.02 );
				g.beginPath();
				g.ellipse( 0, 0, rx * 0.5, ry * 0.78, 0, -1.2, 1.2 );
				g.stroke();
				g.restore();
			}
		}
	}
}

function crochet( g, grid, cols, rows, c, ox, oy, rand ) {
	const { palette, idx } = grid;
	for ( let r = 0; r < rows; r++ ) {
		for ( let q = 0; q < cols; q++ ) {
			const p = palette[ idx[ r * cols + q ] ];
			const x = ox + q * c;
			const y = oy + r * c;
			g.fillStyle = rgb( shade( p, 0.48 ) );
			g.fillRect( x, y, c, c );
			g.save();
			g.beginPath();
			g.rect( x + c * 0.02, y + c * 0.02, c * 0.96, c * 0.96 );
			g.clip();
			// Three double crochets per tile, running across its diagonal
			// row; the rows alternate as the work turns.
			const dir = ( q - r ) & 1 ? 1 : -1;
			g.translate( x + c / 2, y + c / 2 );
			g.rotate( dir * Math.PI * 0.25 );
			for ( let k = -1; k <= 1; k++ ) {
				const px = k * c * 0.33 + ( rand() - 0.5 ) * c * 0.03;
				const w = c * 0.27;
				const len = c * 1.42;
				const fill = g.createLinearGradient(
					px - w / 2,
					0,
					px + w / 2,
					0
				);
				fill.addColorStop( 0, rgb( shade( p, 0.7 ) ) );
				fill.addColorStop( 0.45, rgb( lift( p, 0.22 ) ) );
				fill.addColorStop( 1, rgb( shade( p, 0.75 ) ) );
				g.fillStyle = fill;
				rrect( g, px - w / 2, -len / 2, w, len, w / 2 );
				g.fill();
				// The wraps of the double crochet.
				g.strokeStyle = rgb( shade( p, 0.55 ), 0.6 );
				g.lineWidth = Math.max( 0.5, c * 0.03 );
				for ( let t = -1; t <= 1; t += 2 ) {
					g.beginPath();
					g.moveTo( px - w / 2, t * c * 0.18 - w * 0.2 );
					g.lineTo( px + w / 2, t * c * 0.18 + w * 0.2 );
					g.stroke();
				}
			}
			g.restore();
		}
	}
}

function latchHook( g, grid, cols, rows, c, ox, oy, rand ) {
	const { palette, idx } = grid;
	for ( let r = 0; r < rows; r++ ) {
		for ( let q = 0; q < cols; q++ ) {
			g.fillStyle = rgb( shade( palette[ idx[ r * cols + q ] ], 0.42 ) );
			g.fillRect( ox + q * c, oy + r * c, c, c );
		}
	}
	g.lineCap = 'round';
	// Every knot is a little tuft of strands lying in all directions; they
	// spill over their square like a real pile does.
	for ( let r = 0; r < rows; r++ ) {
		for ( let q = 0; q < cols; q++ ) {
			const p = palette[ idx[ r * cols + q ] ];
			const cx = ox + q * c + c / 2;
			const cy = oy + r * c + c / 2;
			for ( let k = 0; k < 9; k++ ) {
				const a = rand() * Math.PI * 2;
				const len = c * ( 0.45 + rand() * 0.4 );
				const sx = cx + ( rand() - 0.5 ) * c * 0.4;
				const sy = cy + ( rand() - 0.5 ) * c * 0.4;
				const ex = sx + Math.cos( a ) * len;
				const ey = sy + Math.sin( a ) * len;
				const bend = ( rand() - 0.5 ) * c * 0.5;
				const f = 0.82 + rand() * 0.32;
				g.strokeStyle = rgb( shade( p, f ) );
				g.lineWidth = c * ( 0.16 + rand() * 0.08 );
				g.beginPath();
				g.moveTo( sx, sy );
				g.quadraticCurveTo(
					( sx + ex ) / 2 - Math.sin( a ) * bend,
					( sy + ey ) / 2 + Math.cos( a ) * bend,
					ex,
					ey
				);
				g.stroke();
				g.strokeStyle = rgb( lift( p, 0.25 ), 0.45 );
				g.lineWidth = c * 0.05;
				g.stroke();
			}
		}
	}
}

function drills( g, grid, cols, rows, c, ox, oy, rand, round ) {
	const { palette, idx } = grid;
	for ( let r = 0; r < rows; r++ ) {
		for ( let q = 0; q < cols; q++ ) {
			const p = palette[ idx[ r * cols + q ] ];
			const x = ox + q * c;
			const y = oy + r * c;
			if ( round ) {
				// Round drills leave a little of the printed canvas between
				// them.
				g.fillStyle = rgb( lift( p, 0.45 ) );
				g.fillRect( x, y, c, c );
				const fill = g.createRadialGradient(
					x + c * 0.38,
					y + c * 0.36,
					c * 0.05,
					x + c / 2,
					y + c / 2,
					c * 0.5
				);
				fill.addColorStop( 0, rgb( lift( p, 0.5 ) ) );
				fill.addColorStop( 0.55, rgb( p ) );
				fill.addColorStop( 1, rgb( shade( p, 0.6 ) ) );
				g.fillStyle = fill;
				g.beginPath();
				g.arc( x + c / 2, y + c / 2, c * 0.46, 0, Math.PI * 2 );
				g.fill();
			} else {
				const gap = Math.max( 0.5, c * 0.04 );
				const a = x + gap / 2;
				const b = y + gap / 2;
				const s = c - gap;
				g.fillStyle = 'rgba(30,26,22,0.6)';
				g.fillRect( x, y, c, c );
				g.fillStyle = rgb( p );
				g.fillRect( a, b, s, s );
				// Facets: the light from the top left breaks on them.
				const facet = ( pts, color ) => {
					g.fillStyle = color;
					g.beginPath();
					g.moveTo( pts[ 0 ][ 0 ], pts[ 0 ][ 1 ] );
					for ( const pt of pts.slice( 1 ) ) {
						g.lineTo( pt[ 0 ], pt[ 1 ] );
					}
					g.closePath();
					g.fill();
				};
				const i0 = s * 0.22;
				const tl = [ a, b ];
				const tr = [ a + s, b ];
				const br = [ a + s, b + s ];
				const bl = [ a, b + s ];
				const itl = [ a + i0, b + i0 ];
				const itr = [ a + s - i0, b + i0 ];
				const ibr = [ a + s - i0, b + s - i0 ];
				const ibl = [ a + i0, b + s - i0 ];
				facet( [ tl, tr, itr, itl ], 'rgba(255,255,255,0.32)' );
				facet( [ tl, itl, ibl, bl ], 'rgba(255,255,255,0.14)' );
				facet( [ bl, ibl, ibr, br ], 'rgba(0,0,0,0.22)' );
				facet( [ tr, br, ibr, itr ], 'rgba(0,0,0,0.12)' );
				facet( [ itl, itr, ibr, ibl ], rgb( lift( p, 0.08 ), 0.9 ) );
			}
			// Here and there a drill catches the light.
			if ( rand() < 0.07 ) {
				const sx = x + c * ( 0.3 + rand() * 0.4 );
				const sy = y + c * ( 0.3 + rand() * 0.4 );
				const k = c * ( 0.18 + rand() * 0.12 );
				g.fillStyle = 'rgba(255,255,255,0.9)';
				g.beginPath();
				g.moveTo( sx, sy - k );
				g.lineTo( sx + k * 0.2, sy - k * 0.2 );
				g.lineTo( sx + k, sy );
				g.lineTo( sx + k * 0.2, sy + k * 0.2 );
				g.lineTo( sx, sy + k );
				g.lineTo( sx - k * 0.2, sy + k * 0.2 );
				g.lineTo( sx - k, sy );
				g.lineTo( sx - k * 0.2, sy - k * 0.2 );
				g.closePath();
				g.fill();
			}
		}
	}
}

function ironedBeads( g, grid, cols, rows, c, ox, oy, rand ) {
	const { palette, idx } = grid;
	g.fillStyle = '#ecebe7';
	g.fillRect( ox, oy, cols * c, rows * c );
	for ( let r = 0; r < rows; r++ ) {
		for ( let q = 0; q < cols; q++ ) {
			const p = palette[ idx[ r * cols + q ] ];
			const x = ox + q * c;
			const y = oy + r * c;
			// Ironed beads melt into their neighbours and their holes
			// close up to a small dimple.
			const m = c * 0.02;
			const fill = g.createLinearGradient( x, y, x + c, y + c );
			fill.addColorStop( 0, rgb( lift( p, 0.22 ) ) );
			fill.addColorStop( 0.5, rgb( p ) );
			fill.addColorStop( 1, rgb( shade( p, 0.8 ) ) );
			g.fillStyle = fill;
			rrect( g, x + m, y + m, c - 2 * m, c - 2 * m, c * 0.3 );
			g.fill();
			const hole = c * ( 0.12 + rand() * 0.04 );
			g.fillStyle = rgb( shade( p, 0.5 ) );
			g.beginPath();
			g.arc( x + c / 2, y + c / 2, hole, 0, Math.PI * 2 );
			g.fill();
			g.strokeStyle = 'rgba(255,255,255,0.35)';
			g.lineWidth = Math.max( 0.5, c * 0.05 );
			g.beginPath();
			g.arc(
				x + c / 2,
				y + c / 2,
				c * 0.3,
				Math.PI * 1.05,
				Math.PI * 1.5
			);
			g.stroke();
		}
	}
}

/**
 * Draw the finished piece.
 *
 * @param {CanvasRenderingContext2D} g    Target.
 * @param {Object}                   grid { palette, idx }.
 * @param {number}                   cols Grid columns.
 * @param {number}                   rows Grid rows.
 * @param {Object}                   opts { mode, cell, cellH, x, y, drill, seed }.
 */
export function renderFinished( g, grid, cols, rows, opts = {} ) {
	const {
		mode = 'crossstitch',
		cell = 12,
		cellH = 0,
		x = 0,
		y = 0,
		drill = 'square',
		seed = 7,
	} = opts;
	const rand = rng( seed );
	g.save();
	if ( 'knitting' === mode ) {
		knitting(
			g,
			grid,
			cols,
			rows,
			cell,
			cellH || Math.round( cell * 0.75 ),
			x,
			y,
			rand
		);
	} else if ( 'c2c' === mode ) {
		crochet( g, grid, cols, rows, cell, x, y, rand );
	} else if ( 'latchhook' === mode ) {
		latchHook( g, grid, cols, rows, cell, x, y, rand );
	} else if ( 'diamond' === mode ) {
		drills( g, grid, cols, rows, cell, x, y, rand, 'round' === drill );
	} else if ( 'beads' === mode ) {
		ironedBeads( g, grid, cols, rows, cell, x, y, rand );
	} else {
		crossStitch( g, grid, cols, rows, cell, x, y, rand );
	}
	g.restore();
}
