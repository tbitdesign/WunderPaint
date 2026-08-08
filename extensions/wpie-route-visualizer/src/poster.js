/**
 * Route poster rendering: the square map/route area. Everything draws
 * through the Map Posters engine's exact WebMercator projector, so the
 * GPX line and the optional OSM street scene line up pixel-perfectly.
 * Typography around the square stays in main.js (inserted as real text
 * layers, Map Posters pattern).
 */

import {
	makeProjector,
	mixHex,
	paletteFor,
	drawScene,
	haversineM,
} from './map-engine.js';

const mercN = ( lat ) =>
	Math.log( Math.tan( Math.PI / 4 + ( ( lat * Math.PI ) / 180 ) / 2 ) );
const invMercN = ( y ) =>
	( ( 2 * Math.atan( Math.exp( y ) ) - Math.PI / 2 ) * 180 ) / Math.PI;

/**
 * Square WebMercator bbox around the route with a margin: the shorter
 * mercator axis is expanded so x and y spans match (drawScene then
 * fills a square without distortion).
 *
 * @param {Array}  segments Route segments.
 * @param {number} margin   Extra space as a fraction of the span.
 * @return {Object} { south, west, north, east }
 */
export function routeBBox( segments, margin = 0.14 ) {
	let west = Infinity;
	let east = -Infinity;
	let yMin = Infinity;
	let yMax = -Infinity;
	for ( const seg of segments ) {
		for ( const p of seg ) {
			west = Math.min( west, p.lon );
			east = Math.max( east, p.lon );
			const y = mercN( p.lat );
			yMin = Math.min( yMin, y );
			yMax = Math.max( yMax, y );
		}
	}
	// Mercator x span in "degree" units for comparability.
	const rad = Math.PI / 180;
	let xSpan = ( east - west ) * rad;
	let ySpan = yMax - yMin;
	const size = Math.max( xSpan, ySpan, 1e-5 ) * ( 1 + margin * 2 );
	const cx = ( ( west + east ) / 2 ) * rad;
	const cy = ( yMin + yMax ) / 2;
	return {
		west: ( cx - size / 2 ) / rad,
		east: ( cx + size / 2 ) / rad,
		south: invMercN( cy - size / 2 ),
		north: invMercN( cy + size / 2 ),
	};
}

/**
 * Three-stop color ramps for the data color modes. Pace: slow red to
 * fast green; heart rate: calm green to red; elevation: low blue to
 * high red.
 */
export const RAMPS = {
	pace: [ '#ef4444', '#eab308', '#22c55e' ],
	hr: [ '#22c55e', '#eab308', '#ef4444' ],
	ele: [ '#3b82f6', '#8b5cf6', '#ef4444' ],
};

/** Ramp color at t in [0,1]. */
export function rampColor( ramp, tt ) {
	const t = Math.max( 0, Math.min( 1, tt ) );
	return t < 0.5
		? mixHex( ramp[ 0 ], ramp[ 1 ], t * 2 )
		: mixHex( ramp[ 1 ], ramp[ 2 ], ( t - 0.5 ) * 2 );
}

/**
 * Draw the poster square: theme background (or the street scene when
 * map data is present), the route line with halo, start/finish
 * markers and the optional elevation strip.
 *
 * @param {CanvasRenderingContext2D} ctx  Target (already translated).
 * @param {number}                   size Square size in px.
 * @param {Object}                   o    Options.
 */
export function drawRoutePoster( ctx, size, o ) {
	const {
		segments,
		bbox,
		theme,
		scene = null,
		show = {},
		routeColor,
		lineScale = 1,
		markers = true,
		elevation = false,
		elePoints = null,
		colorMode = 'solid',
		series = null,
		kmStep = 0,
		legend = null,
	} = o;
	const pal = paletteFor( theme, {} );
	const color = routeColor || pal.pin;
	const S = ( size / 1000 ) * lineScale;

	ctx.save();
	ctx.beginPath();
	ctx.rect( 0, 0, size, size );
	ctx.clip();
	if ( scene ) {
		drawScene( ctx, size, size, scene, {
			bbox,
			theme,
			show,
			lineScale: 1,
			mask: 'none',
			pins: [],
		} );
	} else {
		ctx.fillStyle = pal.bg;
		ctx.fillRect( 0, 0, size, size );
	}

	const project = makeProjector( bbox, size, size );
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';

	const trace = () => {
		ctx.beginPath();
		for ( const seg of segments ) {
			for ( let i = 0; i < seg.length; i++ ) {
				const [ x, y ] = project( seg[ i ].lat, seg[ i ].lon );
				if ( 0 === i ) {
					ctx.moveTo( x, y );
				} else {
					ctx.lineTo( x, y );
				}
			}
		}
	};
	// Halo first: keeps the line readable over busy streets.
	if ( scene ) {
		trace();
		ctx.strokeStyle = pal.bg;
		ctx.globalAlpha = 0.75;
		ctx.lineWidth = 16 * S;
		ctx.stroke();
		ctx.globalAlpha = 1;
	}
	const graded = 'solid' !== colorMode && series && RAMPS[ colorMode ];
	if ( graded ) {
		// Per-pair strokes with round caps read as one continuous
		// gradient line.
		const ramp = RAMPS[ colorMode ];
		const span = series.max - series.min || 1e-9;
		ctx.lineWidth = 7 * S;
		segments.forEach( ( seg, si ) => {
			const vals = series.values[ si ] || [];
			for ( let i = 1; i < seg.length; i++ ) {
				const a = project( seg[ i - 1 ].lat, seg[ i - 1 ].lon );
				const b = project( seg[ i ].lat, seg[ i ].lon );
				const v =
					( ( vals[ i - 1 ] ?? series.min ) +
						( vals[ i ] ?? series.min ) ) /
					2;
				ctx.beginPath();
				ctx.moveTo( a[ 0 ], a[ 1 ] );
				ctx.lineTo( b[ 0 ], b[ 1 ] );
				ctx.strokeStyle = rampColor(
					ramp,
					( v - series.min ) / span
				);
				ctx.stroke();
			}
		} );
	} else {
		trace();
		ctx.strokeStyle = color;
		ctx.lineWidth = 7 * S;
		ctx.stroke();
	}

	// Kilometer markers: a numbered dot every kmStep kilometers.
	if ( kmStep > 0 ) {
		let dist = 0;
		let next = kmStep * 1000;
		let k = kmStep;
		const r = 13 * S;
		ctx.font = `700 ${ Math.max( 8, 13 * S ) }px Inter, sans-serif`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		for ( const seg of segments ) {
			for ( let i = 1; i < seg.length; i++ ) {
				const stepM = haversineM( seg[ i - 1 ], seg[ i ] );
				while ( dist + stepM >= next ) {
					const u = ( next - dist ) / ( stepM || 1e-9 );
					const lat =
						seg[ i - 1 ].lat +
						( seg[ i ].lat - seg[ i - 1 ].lat ) * u;
					const lon =
						seg[ i - 1 ].lon +
						( seg[ i ].lon - seg[ i - 1 ].lon ) * u;
					const [ x, y ] = project( lat, lon );
					ctx.beginPath();
					ctx.arc( x, y, r, 0, Math.PI * 2 );
					ctx.fillStyle = pal.bg;
					ctx.fill();
					ctx.lineWidth = 2.5 * S;
					ctx.strokeStyle = graded ? pal.text : color;
					ctx.stroke();
					ctx.fillStyle = pal.text;
					ctx.fillText( String( k ), x, y + 0.5 * S );
					next += kmStep * 1000;
					k += kmStep;
				}
				dist += stepM;
			}
		}
	}

	if ( markers && segments.length ) {
		const first = segments[ 0 ][ 0 ];
		const lastSeg = segments[ segments.length - 1 ];
		const last = lastSeg[ lastSeg.length - 1 ];
		const dot = ( p, hollow ) => {
			const [ x, y ] = project( p.lat, p.lon );
			ctx.beginPath();
			ctx.arc( x, y, 11 * S, 0, Math.PI * 2 );
			ctx.fillStyle = hollow ? pal.bg : color;
			ctx.fill();
			ctx.lineWidth = 4.5 * S;
			ctx.strokeStyle = hollow ? color : pal.bg;
			ctx.stroke();
		};
		// Finish first so an identical loop point keeps the start on top.
		dot( last, true );
		dot( first, false );
	}

	if ( elevation && elePoints && elePoints.length > 1 ) {
		drawElevation( ctx, size, S, elePoints, graded ? pal.text : color, pal );
	}

	// Legend for the data color modes: a small gradient bar with the
	// min/max labels, on a quiet backdrop plate.
	if ( graded && legend ) {
		const ramp = RAMPS[ colorMode ];
		const w = size * 0.24;
		const h = size * 0.012;
		const pad = size * 0.045;
		const x = 'tl' === legend.pos ? pad : size - pad - w;
		const y = pad;
		const platePad = size * 0.018;
		const fs = Math.max( 8, size * 0.02 );
		ctx.save();
		ctx.globalAlpha = 0.8;
		ctx.fillStyle = pal.bg;
		const plateH = h + fs * 1.6 + platePad * 2.4;
		roundRect(
			ctx,
			x - platePad,
			y - platePad,
			w + platePad * 2,
			plateH,
			size * 0.012
		);
		ctx.fill();
		ctx.globalAlpha = 1;
		const grad = ctx.createLinearGradient( x, 0, x + w, 0 );
		grad.addColorStop( 0, ramp[ 0 ] );
		grad.addColorStop( 0.5, ramp[ 1 ] );
		grad.addColorStop( 1, ramp[ 2 ] );
		ctx.fillStyle = grad;
		roundRect( ctx, x, y, w, h, h / 2 );
		ctx.fill();
		ctx.fillStyle = pal.text;
		ctx.font = `500 ${ fs }px Inter, sans-serif`;
		ctx.textBaseline = 'top';
		ctx.textAlign = 'left';
		ctx.fillText( legend.min, x, y + h + fs * 0.45 );
		ctx.textAlign = 'right';
		ctx.fillText( legend.max, x + w, y + h + fs * 0.45 );
		ctx.restore();
	}
	ctx.restore();
}

function roundRect( ctx, x, y, w, h, r ) {
	if ( 'function' === typeof ctx.roundRect ) {
		ctx.beginPath();
		ctx.roundRect( x, y, w, h, r );
		return;
	}
	ctx.beginPath();
	ctx.rect( x, y, w, h );
}

/**
 * Cumulative-distance elevation samples for the profile strip.
 *
 * @param {Array} segments Segments with ele.
 * @return {Array} [{ d, ele }] or null when the track has no elevation.
 */
export function elevationSeries( segments ) {
	const out = [];
	let d = 0;
	let has = false;
	for ( const seg of segments ) {
		for ( let i = 0; i < seg.length; i++ ) {
			if ( i > 0 ) {
				d += segDist( seg[ i - 1 ], seg[ i ] );
			}
			const ele =
				'number' === typeof seg[ i ].ele ? seg[ i ].ele : null;
			if ( null !== ele ) {
				has = true;
			}
			out.push( { d, ele } );
		}
	}
	if ( ! has ) {
		return null;
	}
	// Fill gaps with the previous value so the area stays continuous.
	let prev = out.find( ( p ) => null !== p.ele );
	prev = prev ? prev.ele : 0;
	for ( const p of out ) {
		if ( null === p.ele ) {
			p.ele = prev;
		} else {
			prev = p.ele;
		}
	}
	return out;
}

const segDist = ( a, b ) => {
	// Equirectangular approximation is plenty for profile spacing.
	const rad = Math.PI / 180;
	const x =
		( b.lon - a.lon ) * rad * Math.cos( ( ( a.lat + b.lat ) / 2 ) * rad );
	const y = ( b.lat - a.lat ) * rad;
	return Math.sqrt( x * x + y * y ) * 6371000;
};

/** The translucent area chart across the bottom of the square. */
function drawElevation( ctx, size, S, pts, color, pal ) {
	const h = size * 0.16;
	const top = size - h - size * 0.03;
	const left = size * 0.05;
	const w = size * 0.9;
	let min = Infinity;
	let max = -Infinity;
	for ( const p of pts ) {
		min = Math.min( min, p.ele );
		max = Math.max( max, p.ele );
	}
	const span = Math.max( max - min, 10 );
	const total = pts[ pts.length - 1 ].d || 1;
	const X = ( p ) => left + ( p.d / total ) * w;
	const Y = ( p ) => top + h - ( ( p.ele - min ) / span ) * h;

	ctx.save();
	ctx.beginPath();
	ctx.moveTo( left, top + h );
	for ( const p of pts ) {
		ctx.lineTo( X( p ), Y( p ) );
	}
	ctx.lineTo( left + w, top + h );
	ctx.closePath();
	ctx.globalAlpha = 0.22;
	ctx.fillStyle = color;
	ctx.fill();
	ctx.globalAlpha = 1;
	ctx.beginPath();
	for ( let i = 0; i < pts.length; i++ ) {
		const x = X( pts[ i ] );
		const y = Y( pts[ i ] );
		if ( 0 === i ) {
			ctx.moveTo( x, y );
		} else {
			ctx.lineTo( x, y );
		}
	}
	ctx.strokeStyle = color;
	ctx.lineWidth = 3.5 * S;
	ctx.lineJoin = 'round';
	ctx.stroke();
	// Baseline in the theme's text tone, very quiet.
	ctx.globalAlpha = 0.3;
	ctx.beginPath();
	ctx.moveTo( left, top + h );
	ctx.lineTo( left + w, top + h );
	ctx.strokeStyle = pal.text;
	ctx.lineWidth = 1.5 * S;
	ctx.stroke();
	ctx.restore();
}

export { mixHex };
