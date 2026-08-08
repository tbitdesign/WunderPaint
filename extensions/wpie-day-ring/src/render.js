/**
 * The canvas renderer: a 24-hour dial with each time block drawn as a
 * proportional arc, overlapping blocks nested on concentric rings, hour ticks
 * and numbers, a centre title and an optional legend. Pure drawing from params.
 */
import { assignLanes, arcAngles, duration, fmtTime, fmtDur } from './blocks.js';
import { paletteColor } from './palette.js';

const SANS =
	"'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const TAU = Math.PI * 2;

function theme( dark ) {
	return dark
		? {
				title: '#ffffff',
				sub: 'rgba(255,255,255,0.62)',
				track: 'rgba(255,255,255,0.09)',
				tick: 'rgba(255,255,255,0.28)',
				tickMajor: 'rgba(255,255,255,0.5)',
				num: 'rgba(255,255,255,0.62)',
				legText: '#eef1f6',
				legTime: 'rgba(255,255,255,0.55)',
				arcTrack: 'rgba(255,255,255,0.05)',
		  }
		: {
				title: '#171a24',
				sub: 'rgba(23,26,36,0.55)',
				track: 'rgba(23,26,36,0.07)',
				tick: 'rgba(23,26,36,0.28)',
				tickMajor: 'rgba(23,26,36,0.5)',
				num: 'rgba(23,26,36,0.6)',
				legText: '#171a24',
				legTime: 'rgba(23,26,36,0.5)',
				arcTrack: 'rgba(23,26,36,0.04)',
		  };
}

function colorOf( block, i, palette ) {
	return block.color || paletteColor( palette, i );
}

function paintBg( g, W, H, bg ) {
	bg = bg || { mode: 'solid', color: '#141726' };
	if ( 'transparent' === bg.mode ) {
		return;
	}
	if ( 'gradient' === bg.mode ) {
		const grad = g.createLinearGradient( 0, 0, W, H );
		grad.addColorStop( 0, bg.color || '#1a1f3a' );
		grad.addColorStop( 1, bg.color2 || '#2b1055' );
		g.fillStyle = grad;
	} else {
		g.fillStyle = bg.color || '#141726';
	}
	g.fillRect( 0, 0, W, H );
}

/**
 * @param {Object} p    Day Ring params.
 * @param {number} W    Output width (device px).
 * @param {number} H    Output height (device px).
 * @param {Object} deps { tabler } - the editor's Tabler icon map, or null.
 * @return {HTMLCanvasElement}
 */
export function renderRing( p, W, H, deps ) {
	p = p || {};
	const tabler = ( deps && deps.tabler ) || null;
	const dark = false !== p.dark;
	const th = theme( dark );
	const blocks = Array.isArray( p.blocks ) ? p.blocks : [];
	const palette = p.palette || 'vivid';
	const showLegend = false !== p.legend && blocks.length > 0;

	const c = document.createElement( 'canvas' );
	c.width = Math.max( 2, Math.round( W ) );
	c.height = Math.max( 2, Math.round( H ) );
	W = c.width;
	H = c.height;
	const g = c.getContext( '2d' );
	paintBg( g, W, H, p.bg );

	const pad = Math.round( Math.min( W, H ) * 0.05 );
	const landscape = W > H * 1.15;

	// Reserve room for the legend (right column when wide, bottom otherwise).
	let ring = { x: pad, y: pad, w: W - 2 * pad, h: H - 2 * pad };
	let legend = null;
	if ( showLegend ) {
		if ( landscape ) {
			const lw = Math.round( W * 0.34 );
			ring = { x: pad, y: pad, w: W - lw - 2 * pad, h: H - 2 * pad };
			legend = {
				x: W - lw,
				y: pad,
				w: lw - pad,
				h: H - 2 * pad,
				cols: 1,
			};
		} else {
			const rowH = Math.max( 22, Math.round( Math.min( W, H ) * 0.045 ) );
			const cols = W > H * 0.9 ? 2 : 1;
			const rows = Math.ceil( blocks.length / cols );
			const lh = Math.min( H * 0.4, rows * rowH + pad );
			ring = { x: pad, y: pad, w: W - 2 * pad, h: H - lh - pad };
			legend = {
				x: pad,
				y: H - lh,
				w: W - 2 * pad,
				h: lh - pad,
				cols,
				rowH,
			};
		}
	}

	const cx = ring.x + ring.w / 2,
		cy = ring.y + ring.h / 2;
	const R =
		Math.min( ring.w, ring.h ) / 2 - Math.round( Math.min( W, H ) * 0.02 );

	if ( false !== p.dayNight ) {
		drawDayNight( g, cx, cy, R, dark );
	}
	drawDial( g, cx, cy, R, th, p );
	drawArcs( g, cx, cy, R, th, blocks, palette, p );
	drawCentre( g, cx, cy, R, th, p );
	if ( legend ) {
		drawLegend( g, legend, th, blocks, palette, p, tabler );
	}

	return c;
}

function drawDial( g, cx, cy, R, th, p ) {
	const rOuter = R * 0.94;
	// faint outer track
	g.beginPath();
	g.arc( cx, cy, rOuter, 0, TAU );
	g.lineWidth = Math.max( 1, R * 0.004 );
	g.strokeStyle = th.track;
	g.stroke();

	if ( false !== p.ticks ) {
		for ( let h = 0; h < 24; h++ ) {
			const a = -Math.PI / 2 + ( h / 24 ) * TAU;
			const major = h % 6 === 0;
			const t0 = rOuter,
				t1 = rOuter + R * ( major ? 0.028 : 0.016 );
			g.beginPath();
			g.moveTo( cx + Math.cos( a ) * t0, cy + Math.sin( a ) * t0 );
			g.lineTo( cx + Math.cos( a ) * t1, cy + Math.sin( a ) * t1 );
			g.lineWidth = Math.max( 1, R * ( major ? 0.008 : 0.004 ) );
			g.strokeStyle = major ? th.tickMajor : th.tick;
			g.stroke();
		}
	}
	if ( false !== p.hourNumbers ) {
		g.fillStyle = th.num;
		g.font = '600 ' + Math.round( R * 0.052 ) + 'px ' + SANS;
		g.textAlign = 'center';
		g.textBaseline = 'middle';
		const rNum = rOuter + R * 0.075;
		for ( let h = 0; h < 24; h += 3 ) {
			const a = -Math.PI / 2 + ( h / 24 ) * TAU;
			g.fillText(
				String( h ),
				cx + Math.cos( a ) * rNum,
				cy + Math.sin( a ) * rNum
			);
		}
	}
}

function laneGeom( R, lanes, p ) {
	const rOuter = R * 0.9;
	const rInnerMin = R * 0.4;
	const per = ( rOuter - rInnerMin ) / Math.max( 1, lanes );
	const gapFrac =
		p.ring && 'number' === typeof p.ring.gap ? p.ring.gap : 0.24;
	const thickBase = p.ring && p.ring.thickness ? p.ring.thickness : 1;
	let t = Math.min( R * 0.12 * thickBase, per * ( 1 - gapFrac ) );
	t = Math.max( R * 0.02, t );
	return { rOuter, per, t };
}

function drawArcs( g, cx, cy, R, th, blocks, palette, p ) {
	if ( ! blocks.length ) {
		return;
	}
	const { laneOf, lanes } = assignLanes( blocks );
	const { rOuter, per, t } = laneGeom( R, lanes, p );
	const rounded = false !== ( p.ring && p.ring.rounded );

	// faint full-circle tracks behind each lane
	for ( let L = 0; L < lanes; L++ ) {
		const r = rOuter - L * per - t / 2;
		g.beginPath();
		g.arc( cx, cy, r, 0, TAU );
		g.lineWidth = t;
		g.strokeStyle = th.arcTrack;
		g.lineCap = 'butt';
		g.stroke();
	}

	const geom = blocks.map( ( b, i ) => {
		const r = rOuter - laneOf[ i ] * per - t / 2;
		return { r, ...arcAngles( b.start, b.end ) };
	} );
	// Arcs first...
	blocks.forEach( ( b, i ) => {
		const { r, a0, a1, dur } = geom[ i ];
		const roundCap = rounded && dur < 1400;
		let s0 = a0,
			s1 = a1;
		// Round caps overhang each end by ~t/2, so two blocks that merely touch
		// in time (e.g. 12-13 and 13-14) would visually overlap on the same
		// lane. Inset every arc by that overhang plus a hairline, so segments
		// sit cleanly side by side without forcing the user to shrink thickness.
		if ( dur < 1439 ) {
			const inset = Math.min(
				( roundCap ? t / 2 : 0 ) / r + ( t * 0.16 ) / r,
				( a1 - a0 ) * 0.5 - 0.004
			);
			if ( inset > 0 ) {
				s0 = a0 + inset;
				s1 = a1 - inset;
			}
		}
		g.beginPath();
		g.arc( cx, cy, r, s0, s1 );
		g.lineWidth = t;
		g.strokeStyle = arcStroke(
			g,
			cx,
			cy,
			r,
			t,
			colorOf( b, i, palette ),
			false !== p.depth
		);
		g.lineCap = roundCap ? 'round' : 'butt';
		g.stroke();
	} );
	// ...labels on top, so an inner lane never covers an outer label.
	if ( false !== p.ringLabels ) {
		blocks.forEach( ( b, i ) => {
			const { r, a0, a1 } = geom[ i ];
			drawArcLabel(
				g,
				cx,
				cy,
				r,
				( a0 + a1 ) / 2,
				a1 - a0,
				b,
				i,
				palette,
				t
			);
		} );
	}
}

function drawArcLabel( g, cx, cy, r, mid, sweep, b, i, palette, t ) {
	if ( sweep < 0.18 ) {
		return;
	} // arc too small; the legend carries it
	const fs = Math.max( 9, Math.round( t * 0.42 ) );
	const font = '700 ' + fs + 'px ' + SANS;
	g.font = font;
	let name = ( b.label || '' ).trim();
	if ( ! name ) {
		return;
	}
	// Ellipsize so the label fits within the arc's own angular span.
	const maxAng = sweep * 0.92;
	if ( g.measureText( name ).width / r > maxAng ) {
		while (
			name.length > 1 &&
			g.measureText( name + '…' ).width / r > maxAng
		) {
			name = name.slice( 0, -1 );
		}
		name += '…';
	}
	const onDark = luminance( colorOf( b, i, palette ) ) < 0.58;
	drawTextArc( g, cx, cy, r, mid, name, {
		font,
		size: fs,
		color: onDark ? '#ffffff' : '#15181f',
		halo: onDark ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.6)',
		inward: Math.sin( mid ) > 0.02,
	} );
}

/**
 * Draw text along a circular arc, centred at canvas angle `mid`. Text on the
 * lower half is flipped so it stays upright and readable on both halves.
 */
function drawTextArc( g, cx, cy, r, mid, text, opts ) {
	const chars = [ ...String( text ) ];
	if ( ! chars.length || r <= 0 ) {
		return;
	}
	g.save();
	g.font = opts.font;
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	g.lineJoin = 'round';
	g.lineWidth = Math.max( 1, ( opts.size || 12 ) * 0.16 );
	const inward = !! opts.inward,
		dir = inward ? -1 : 1;
	const widths = chars.map( ( ch ) => g.measureText( ch ).width );
	const totalAng = widths.reduce( ( a, w ) => a + w, 0 ) / r;
	let phi = mid - ( dir * totalAng ) / 2;
	for ( let i = 0; i < chars.length; i++ ) {
		const wAng = widths[ i ] / r;
		phi += ( dir * wAng ) / 2;
		g.save();
		g.translate( cx + Math.cos( phi ) * r, cy + Math.sin( phi ) * r );
		g.rotate( phi + Math.PI / 2 + ( inward ? Math.PI : 0 ) );
		if ( opts.halo ) {
			g.strokeStyle = opts.halo;
			g.strokeText( chars[ i ], 0, 0 );
		}
		g.fillStyle = opts.color;
		g.fillText( chars[ i ], 0, 0 );
		g.restore();
		phi += ( dir * wAng ) / 2;
	}
	g.restore();
}

function luminance( hex ) {
	const h = String( hex || '' ).replace( '#', '' );
	const n =
		h.length === 3
			? h
					.split( '' )
					.map( ( c ) => c + c )
					.join( '' )
			: h;
	const r = parseInt( n.slice( 0, 2 ), 16 ) / 255;
	const gg = parseInt( n.slice( 2, 4 ), 16 ) / 255;
	const b = parseInt( n.slice( 4, 6 ), 16 ) / 255;
	return 0.2126 * r + 0.7152 * gg + 0.0722 * b;
}

function tint( hex, k ) {
	const h = String( hex || '' ).replace( '#', '' );
	const n =
		h.length === 3
			? h
					.split( '' )
					.map( ( c ) => c + c )
					.join( '' )
			: h;
	const r = parseInt( n.slice( 0, 2 ), 16 ),
		gg = parseInt( n.slice( 2, 4 ), 16 ),
		b = parseInt( n.slice( 4, 6 ), 16 );
	if (
		! Number.isFinite( r ) ||
		! Number.isFinite( gg ) ||
		! Number.isFinite( b )
	) {
		return hex;
	}
	const f = ( v ) =>
		Math.max(
			0,
			Math.min(
				255,
				Math.round( k >= 0 ? v + ( 255 - v ) * k : v * ( 1 + k ) )
			)
		);
	return 'rgb(' + f( r ) + ',' + f( gg ) + ',' + f( b ) + ')';
}

/** A radial gradient across the arc thickness gives each arc a rounded, tube-like depth. */
function arcStroke( g, cx, cy, r, t, color, depth ) {
	if ( ! depth ) {
		return color;
	}
	const grad = g.createRadialGradient(
		cx,
		cy,
		Math.max( 0, r - t / 2 ),
		cx,
		cy,
		r + t / 2
	);
	grad.addColorStop( 0, tint( color, -0.16 ) );
	grad.addColorStop( 0.5, color );
	grad.addColorStop( 1, tint( color, 0.2 ) );
	return grad;
}

function drawCentre( g, cx, cy, R, th, p ) {
	const title = ( p.title || '' ).trim();
	const sub = ( p.subtitle || '' ).trim();
	const emoji = ( p.centerIcon || '' ).trim();
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	const lines = title ? title.split( /\n/ ).slice( 0, 3 ) : [];
	let tSize = Math.round( R * ( lines.length > 1 ? 0.1 : 0.12 ) );
	if ( lines.length ) {
		g.font = '700 ' + tSize + 'px ' + SANS;
		const widest = Math.max(
			1,
			...lines.map( ( ln ) => g.measureText( ln ).width )
		);
		if ( widest > R * 0.72 ) {
			tSize = Math.max( 10, Math.floor( ( tSize * R * 0.72 ) / widest ) );
		}
	}
	const lh = tSize * 1.12;
	const subSize = Math.round( R * 0.055 );
	const emSize = emoji ? Math.round( R * 0.15 ) : 0;
	const blockH =
		( emoji ? emSize * 1.05 : 0 ) +
		lines.length * lh +
		( sub ? subSize * 1.5 : 0 );
	let y = cy - blockH / 2;
	if ( emoji ) {
		y += emSize / 2;
		g.font = emSize + 'px ' + SANS;
		g.fillText( emoji, cx, y );
		y += emSize / 2 + lh * 0.5;
	} else {
		y += lh / 2;
	}
	g.fillStyle = th.title;
	g.font = '700 ' + tSize + 'px ' + SANS;
	for ( const ln of lines ) {
		g.fillText( ln, cx, y );
		y += lh;
	}
	if ( sub ) {
		g.fillStyle = th.sub;
		g.font = '500 ' + subSize + 'px ' + SANS;
		g.fillText( sub, cx, y + subSize * 0.2 );
	}
}

/** A soft night band (21:00 -> 06:00, wrapping the top) for gentle depth. */
function drawDayNight( g, cx, cy, R, dark ) {
	const a0 = -Math.PI / 2 + ( ( 21 * 60 ) / 1440 ) * TAU;
	const a1 = a0 + ( ( 9 * 60 ) / 1440 ) * TAU;
	g.save();
	g.beginPath();
	g.arc( cx, cy, R * 0.66, a0, a1 );
	g.lineWidth = R * 0.52;
	g.lineCap = 'butt';
	g.strokeStyle = dark ? 'rgba(0,0,0,0.13)' : 'rgba(40,55,110,0.05)';
	g.stroke();
	g.restore();
}

/** Stroke a Tabler icon (24 grid) at the given baseline-centre. */
function drawLegendIcon( g, pathD, x, yCentre, size, color ) {
	if ( ! pathD ) {
		return;
	}
	const s = size / 24;
	g.save();
	g.translate( x, yCentre - size / 2 );
	g.scale( s, s );
	g.lineWidth = 1.9;
	g.lineCap = 'round';
	g.lineJoin = 'round';
	g.strokeStyle = color;
	g.fillStyle = 'transparent';
	try {
		g.stroke( new Path2D( pathD ) );
	} catch ( e ) {
		/* older engines: skip */
	}
	g.restore();
}

function drawLegend( g, box, th, blocks, palette, p, tabler ) {
	const cols = box.cols || 1;
	const colW = box.w / cols;
	const rowH =
		box.rowH ||
		Math.max(
			20,
			box.h / Math.max( 1, Math.ceil( blocks.length / cols ) )
		);
	const dot = Math.max( 8, Math.round( rowH * 0.34 ) );
	const fs = Math.max( 10, Math.round( rowH * 0.36 ) );
	g.textBaseline = 'middle';
	blocks.forEach( ( b, i ) => {
		const col = i % cols,
			row = Math.floor( i / cols );
		const x = box.x + col * colW;
		const y = box.y + row * rowH + rowH / 2;
		if ( y + rowH / 2 > box.y + box.h + 2 ) {
			return;
		} // clip overflow
		// colour dot
		g.beginPath();
		roundRect( g, x, y - dot / 2, dot, dot, dot * 0.32 );
		g.fillStyle = colorOf( b, i, palette );
		g.fill();
		const tx = x + dot + Math.round( dot * 0.7 );
		const time =
			fmtTime( b.start ) +
			'–' +
			fmtTime( b.end ) +
			( p && p.durations
				? '  ' + fmtDur( duration( b.start, b.end ) )
				: '' );
		g.textAlign = 'left';
		g.font = '600 ' + fs + 'px ' + SANS;
		g.fillStyle = th.legText;
		const emoji = ( b.emoji || '' ).trim();
		const iconPath = b.icon && tabler ? tabler[ b.icon ] : null;
		let nameX = tx;
		if ( iconPath ) {
			drawLegendIcon( g, iconPath, tx, y, fs, th.legText );
			nameX = tx + fs + Math.round( fs * 0.3 );
		}
		g.fillStyle = th.legText;
		g.textAlign = 'left';
		g.font = '600 ' + fs + 'px ' + SANS;
		const name =
			( ! iconPath && emoji ? emoji + ' ' : '' ) +
				( b.label || '' ).trim() || time;
		const maxNameW =
			colW - ( nameX - x ) - dot - g.measureText( '  ' + time ).width;
		g.fillText( ellipsize( g, name, maxNameW ), nameX, y );
		g.font = '500 ' + Math.round( fs * 0.86 ) + 'px ' + SANS;
		g.fillStyle = th.legTime;
		g.textAlign = 'right';
		g.fillText(
			time,
			box.x + col * colW + colW - Math.round( dot * 0.6 ),
			y
		);
	} );
}

function ellipsize( g, text, maxW ) {
	if ( g.measureText( text ).width <= maxW ) {
		return text;
	}
	let s = text;
	while ( s.length > 1 && g.measureText( s + '…' ).width > maxW ) {
		s = s.slice( 0, -1 );
	}
	return s + '…';
}

function roundRect( g, x, y, w, h, r ) {
	r = Math.min( r, w / 2, h / 2 );
	g.beginPath();
	g.moveTo( x + r, y );
	g.arcTo( x + w, y, x + w, y + h, r );
	g.arcTo( x + w, y + h, x, y + h, r );
	g.arcTo( x, y + h, x, y, r );
	g.arcTo( x, y, x + w, y, r );
	g.closePath();
}

export { colorOf, duration };
