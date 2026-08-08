/**
 * Soundwave Art render engine: audio peaks to a poster-style
 * waveform. Pure module (no Web Audio API here - the dialog decodes and
 * hands in channel data), unit-testable in node-canvas.
 *
 * v2.0: color modes (solid / gradient presets incl. metallic foils /
 * spectral coloring from zero-crossing brightness), neon glow passes,
 * mirror reflection, stereo split, and the new styles ridgeline,
 * spiral, sunburst plus waves along a heart or hexagon contour.
 */

/* -------------------------------- themes --------------------------------- */

// Same family ids as Map/Star Map Posters, so the poster trio matches.
export const THEMES = [
	{
		id: 'midnight',
		label: 'Midnight',
		bg: '#0b1220',
		wave: '#f8fafc',
		text: '#f8fafc',
	},
	{
		id: 'black',
		label: 'Black',
		bg: '#050608',
		wave: '#ffffff',
		text: '#ffffff',
	},
	{
		id: 'violet',
		label: 'Violet',
		bg: '#150a2e',
		wave: '#c4b0f2',
		text: '#f1e9ff',
	},
	{
		id: 'forest',
		label: 'Forest',
		bg: '#0c1f16',
		wave: '#9bc08d',
		text: '#eef7e9',
	},
	{
		id: 'ocean',
		label: 'Ocean',
		bg: '#08222e',
		wave: '#7fc4d8',
		text: '#dff2fa',
	},
	{
		id: 'golden',
		label: 'Golden',
		bg: '#101010',
		wave: '#f5c76b',
		text: '#f5c76b',
	},
	{
		id: 'paper',
		label: 'Paper',
		bg: '#f7f3ea',
		wave: '#1a1d21',
		text: '#1a1d21',
	},
	{
		id: 'blush',
		label: 'Blush',
		bg: '#fdf2f4',
		wave: '#c94f6d',
		text: '#6d2136',
	},
];

/**
 * Effective palette: theme + user overrides (bg, wave).
 *
 * @param {Object} theme     Theme entry.
 * @param {Object} overrides { bg?, wave? }.
 * @return {Object} Same shape as a theme.
 */
export function wavePalette( theme, overrides = {} ) {
	return {
		...theme,
		bg: overrides.bg || theme.bg,
		wave: overrides.wave || theme.wave,
	};
}

/* ------------------------------- gradients -------------------------------- */

/**
 * Curated wave gradients. `metallic` entries fake a foil: dark rim, hot
 * gloss band, dark rim - printed they read as gold/copper/chrome.
 */
export const GRADIENTS = [
	{ id: 'sunset', label: 'Sunset', stops: [ '#ffd27a', '#ff7e5f', '#c2427b' ] },
	{ id: 'aurora', label: 'Aurora', stops: [ '#5ef7c3', '#38bdf8', '#a78bfa' ] },
	{ id: 'ocean', label: 'Ocean', stops: [ '#7fd8f0', '#38bdf8', '#4f46e5' ] },
	{ id: 'candy', label: 'Candy', stops: [ '#f9a8d4', '#e879f9', '#818cf8' ] },
	{ id: 'ember', label: 'Ember', stops: [ '#fde68a', '#fb923c', '#ef4444' ] },
	{ id: 'lime', label: 'Lime', stops: [ '#d9f99d', '#4ade80', '#22d3ee' ] },
	{ id: 'spectrum', label: 'Spectrum', stops: [ '#f87171', '#facc15', '#4ade80', '#38bdf8', '#a78bfa' ] },
	{ id: 'goldfoil', label: 'Gold foil', metallic: true, stops: [ '#7a4a12', '#d9a441', '#fff3d0', '#e3b34c', '#8a5a1c' ] },
	{ id: 'copper', label: 'Copper', metallic: true, stops: [ '#4f2513', '#b9743f', '#ffd9b8', '#c07f4b', '#5e2f18' ] },
	{ id: 'chrome', label: 'Chrome', metallic: true, stops: [ '#5c6670', '#eef3f8', '#7e8ea0', '#ffffff', '#4c565f' ] },
];

export const gradientById = ( id ) =>
	GRADIENTS.find( ( g ) => g.id === id ) || GRADIENTS[ 0 ];

const hexRgb = ( hex ) => {
	const h = String( hex ).replace( '#', '' );
	return [
		parseInt( h.slice( 0, 2 ), 16 ) || 0,
		parseInt( h.slice( 2, 4 ), 16 ) || 0,
		parseInt( h.slice( 4, 6 ), 16 ) || 0,
	];
};

const rgba = ( hex, a ) => {
	const [ r, g, b ] = hexRgb( hex );
	return `rgba(${ r },${ g },${ b },${ a })`;
};

const mixHex = ( a, b, u ) => {
	const A = hexRgb( a );
	const B = hexRgb( b );
	const c = A.map( ( v, i ) => Math.round( v + ( B[ i ] - v ) * u ) );
	return `rgb(${ c[ 0 ] },${ c[ 1 ] },${ c[ 2 ] })`;
};

/** Piecewise-linear color along a stop list, u in 0..1. */
export function stopColor( stops, u ) {
	if ( ! stops || ! stops.length ) {
		return '#ffffff';
	}
	if ( 1 === stops.length ) {
		return stops[ 0 ];
	}
	const v = Math.max( 0, Math.min( 1, u ) ) * ( stops.length - 1 );
	const i = Math.min( stops.length - 2, Math.floor( v ) );
	return mixHex( stops[ i ], stops[ i + 1 ], v - i );
}

/* --------------------------------- peaks --------------------------------- */

/**
 * Downsample decoded audio into per-bucket peak amplitudes (0..1).
 *
 * @param {Object} buffer    AudioBuffer-like: { length,
 *                           numberOfChannels, getChannelData( i ) }.
 * @param {number} buckets   Bucket count (one bar per bucket).
 * @param {number} [start]   Trim start as a 0..1 fraction.
 * @param {number} [end]     Trim end as a 0..1 fraction.
 * @param {number} [channel] Restrict to one channel (stereo split);
 *                           omit for the max across all channels.
 * @return {Float32Array} Peaks, normalized so the loudest bucket is 1.
 */
export function computePeaks( buffer, buckets, start = 0, end = 1, channel ) {
	const from = Math.max(
		0,
		Math.floor( buffer.length * Math.min( start, end ) )
	);
	const to = Math.min(
		buffer.length,
		Math.ceil( buffer.length * Math.max( start, end ) )
	);
	const span = Math.max( 1, to - from );
	const peaks = new Float32Array( buckets );
	const channels = [];
	if ( 'number' === typeof channel ) {
		if ( channel < buffer.numberOfChannels ) {
			channels.push( buffer.getChannelData( channel ) );
		}
	} else {
		for ( let c = 0; c < buffer.numberOfChannels; c++ ) {
			channels.push( buffer.getChannelData( c ) );
		}
	}
	if ( ! channels.length ) {
		return peaks;
	}
	for ( let b = 0; b < buckets; b++ ) {
		const s0 = from + Math.floor( ( span * b ) / buckets );
		const s1 =
			from +
			Math.max( s0 + 1, Math.floor( ( span * ( b + 1 ) ) / buckets ) );
		let peak = 0;
		// Sample large buckets sparsely: visually identical, 20x faster.
		const step = Math.max( 1, Math.floor( ( s1 - s0 ) / 500 ) );
		for ( const data of channels ) {
			for ( let i = s0; i < s1; i += step ) {
				const v = Math.abs( data[ i ] || 0 );
				if ( v > peak ) {
					peak = v;
				}
			}
		}
		peaks[ b ] = peak;
	}
	let max = 0;
	for ( let b = 0; b < buckets; b++ ) {
		if ( peaks[ b ] > max ) {
			max = peaks[ b ];
		}
	}
	if ( max > 0 ) {
		for ( let b = 0; b < buckets; b++ ) {
			peaks[ b ] /= max;
		}
	}
	return peaks;
}

/**
 * Per-bucket "brightness" of the sound: zero-crossing rate, spread to
 * 0..1 across the track. High values = trebly/harsh, low = bassy/soft.
 * Drives the spectral color mode, so the COLOR encodes the sound.
 *
 * @param {Object} buffer  AudioBuffer-like (see computePeaks).
 * @param {number} buckets Bucket count.
 * @param {number} [start] Trim start 0..1.
 * @param {number} [end]   Trim end 0..1.
 * @return {Float32Array} Brightness per bucket, 0..1.
 */
export function computeBrights( buffer, buckets, start = 0, end = 1 ) {
	const out = new Float32Array( buckets );
	if ( ! buffer.numberOfChannels ) {
		return out;
	}
	const data = buffer.getChannelData( 0 );
	const from = Math.max(
		0,
		Math.floor( buffer.length * Math.min( start, end ) )
	);
	const to = Math.min(
		buffer.length,
		Math.ceil( buffer.length * Math.max( start, end ) )
	);
	const span = Math.max( 1, to - from );
	for ( let b = 0; b < buckets; b++ ) {
		const s0 = from + Math.floor( ( span * b ) / buckets );
		const s1 =
			from +
			Math.max( s0 + 2, Math.floor( ( span * ( b + 1 ) ) / buckets ) );
		const step = Math.max( 1, Math.floor( ( s1 - s0 ) / 700 ) );
		let crossings = 0;
		let visited = 0;
		let prev = data[ s0 ] || 0;
		for ( let i = s0 + step; i < s1; i += step ) {
			const v = data[ i ] || 0;
			if ( ( v > 0 && prev <= 0 ) || ( v < 0 && prev >= 0 ) ) {
				crossings++;
			}
			prev = v;
			visited++;
		}
		out[ b ] = visited ? crossings / visited : 0;
	}
	// Percentile spread beats a plain max: one cymbal crash should not
	// flatten the whole song into the bass color.
	const sorted = Array.from( out ).sort( ( a, b ) => a - b );
	const lo = sorted[ Math.floor( sorted.length * 0.08 ) ] || 0;
	const hi = sorted[ Math.floor( sorted.length * 0.92 ) ] || 1;
	const range = Math.max( 1e-6, hi - lo );
	for ( let b = 0; b < buckets; b++ ) {
		out[ b ] = Math.max( 0, Math.min( 1, ( out[ b ] - lo ) / range ) );
	}
	// Gentle 3-tap smoothing so neighbours do not flicker.
	const sm = new Float32Array( buckets );
	for ( let b = 0; b < buckets; b++ ) {
		const a = out[ Math.max( 0, b - 1 ) ];
		const c = out[ Math.min( buckets - 1, b + 1 ) ];
		sm[ b ] = ( a + out[ b ] * 2 + c ) / 4;
	}
	return sm;
}

/* --------------------------------- masks ---------------------------------- */

// The heart as cubic segments in unit space - shared by the clip mask
// and the wave-on-contour sampler.
const HEART_SEGS = [
	[ [ 0.5, 0.91 ], [ 0.24, 0.66 ], [ 0.1, 0.52 ], [ 0.1, 0.36 ] ],
	[ [ 0.1, 0.36 ], [ 0.1, 0.23 ], [ 0.2, 0.13 ], [ 0.33, 0.13 ] ],
	[ [ 0.33, 0.13 ], [ 0.41, 0.13 ], [ 0.47, 0.17 ], [ 0.5, 0.25 ] ],
	[ [ 0.5, 0.25 ], [ 0.53, 0.17 ], [ 0.59, 0.13 ], [ 0.67, 0.13 ] ],
	[ [ 0.67, 0.13 ], [ 0.8, 0.13 ], [ 0.9, 0.23 ], [ 0.9, 0.36 ] ],
	[ [ 0.9, 0.36 ], [ 0.9, 0.52 ], [ 0.76, 0.66 ], [ 0.5, 0.91 ] ],
];

/** Mask outline path in a w×h box (same family as the sibling packs). */
export function maskPathOn( ctx, mask, w, h ) {
	const cx = w / 2;
	const cy = h / 2;
	const r = Math.min( w, h ) / 2;
	ctx.beginPath();
	if ( 'circle' === mask ) {
		ctx.arc( cx, cy, r, 0, Math.PI * 2 );
	} else if ( 'heart' === mask ) {
		const s = Math.min( w, h );
		const X = ( u ) => cx - s / 2 + u * s;
		const Y = ( v ) => cy - s / 2 + v * s;
		ctx.moveTo( X( HEART_SEGS[ 0 ][ 0 ][ 0 ] ), Y( HEART_SEGS[ 0 ][ 0 ][ 1 ] ) );
		for ( const [ , c1, c2, p1 ] of HEART_SEGS ) {
			ctx.bezierCurveTo(
				X( c1[ 0 ] ),
				Y( c1[ 1 ] ),
				X( c2[ 0 ] ),
				Y( c2[ 1 ] ),
				X( p1[ 0 ] ),
				Y( p1[ 1 ] )
			);
		}
		ctx.closePath();
	} else if ( 'hex' === mask ) {
		for ( let i = 0; i < 6; i++ ) {
			const a = ( Math.PI / 3 ) * i - Math.PI / 2;
			if ( i ) {
				ctx.lineTo( cx + r * Math.cos( a ), cy + r * Math.sin( a ) );
			} else {
				ctx.moveTo( cx + r * Math.cos( a ), cy + r * Math.sin( a ) );
			}
		}
		ctx.closePath();
	} else if ( 'squircle' === mask ) {
		const rad = Math.min( w, h ) * 0.18;
		if ( 'function' === typeof ctx.roundRect ) {
			ctx.roundRect( 0, 0, w, h, rad );
		} else {
			ctx.moveTo( rad, 0 );
			ctx.arcTo( w, 0, w, h, rad );
			ctx.arcTo( w, h, 0, h, rad );
			ctx.arcTo( 0, h, 0, 0, rad );
			ctx.arcTo( 0, 0, w, 0, rad );
			ctx.closePath();
		}
	} else {
		ctx.rect( 0, 0, w, h );
	}
}

/* ----------------------------- contour sampling --------------------------- */

/**
 * Sample a closed unit-space contour into N points with outward
 * normals. Kind: 'heart' | 'hex'.
 */
function sampleContour( kind, N ) {
	const raw = [];
	if ( 'heart' === kind ) {
		const STEPS = 64;
		for ( const [ p0, c1, c2, p1 ] of HEART_SEGS ) {
			for ( let s = 0; s < STEPS; s++ ) {
				const u = s / STEPS;
				const v = 1 - u;
				const x =
					v * v * v * p0[ 0 ] +
					3 * v * v * u * c1[ 0 ] +
					3 * v * u * u * c2[ 0 ] +
					u * u * u * p1[ 0 ];
				const y =
					v * v * v * p0[ 1 ] +
					3 * v * v * u * c1[ 1 ] +
					3 * v * u * u * c2[ 1 ] +
					u * u * u * p1[ 1 ];
				const tx =
					3 * v * v * ( c1[ 0 ] - p0[ 0 ] ) +
					6 * v * u * ( c2[ 0 ] - c1[ 0 ] ) +
					3 * u * u * ( p1[ 0 ] - c2[ 0 ] );
				const ty =
					3 * v * v * ( c1[ 1 ] - p0[ 1 ] ) +
					6 * v * u * ( c2[ 1 ] - c1[ 1 ] ) +
					3 * u * u * ( p1[ 1 ] - c2[ 1 ] );
				raw.push( { x, y, tx, ty } );
			}
		}
	} else {
		// Hexagon around (0.5, 0.5), radius 0.5.
		const pts = [];
		for ( let i = 0; i < 6; i++ ) {
			const a = ( Math.PI / 3 ) * i - Math.PI / 2;
			pts.push( [ 0.5 + 0.5 * Math.cos( a ), 0.5 + 0.5 * Math.sin( a ) ] );
		}
		const PER = 40;
		for ( let i = 0; i < 6; i++ ) {
			const a = pts[ i ];
			const b = pts[ ( i + 1 ) % 6 ];
			for ( let s = 0; s < PER; s++ ) {
				const u = s / PER;
				raw.push( {
					x: a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * u,
					y: a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * u,
					tx: b[ 0 ] - a[ 0 ],
					ty: b[ 1 ] - a[ 1 ],
				} );
			}
		}
	}
	// Arc-length table, then N uniform samples.
	const cum = [ 0 ];
	for ( let i = 1; i <= raw.length; i++ ) {
		const a = raw[ i - 1 ];
		const b = raw[ i % raw.length ];
		cum.push( cum[ i - 1 ] + Math.hypot( b.x - a.x, b.y - a.y ) );
	}
	const total = cum[ cum.length - 1 ];
	// The centroid decides which perpendicular is "outward".
	let mx = 0;
	let my = 0;
	for ( const p of raw ) {
		mx += p.x;
		my += p.y;
	}
	mx /= raw.length;
	my /= raw.length;
	const out = [];
	let j = 0;
	for ( let i = 0; i < N; i++ ) {
		const target = ( total * i ) / N;
		while ( j < raw.length - 1 && cum[ j + 1 ] < target ) {
			j++;
		}
		const p = raw[ j ];
		const tl = Math.hypot( p.tx, p.ty ) || 1;
		let nx = -p.ty / tl;
		let ny = p.tx / tl;
		if ( nx * ( p.x - mx ) + ny * ( p.y - my ) < 0 ) {
			nx = -nx;
			ny = -ny;
		}
		out.push( { x: p.x, y: p.y, nx, ny } );
	}
	return out;
}

/* -------------------------------- drawing -------------------------------- */

const LINEAR_STYLES = [ 'bars', 'line', 'fill', 'dots', 'pulse', 'led' ];

/**
 * Render the waveform.
 *
 * @param {CanvasRenderingContext2D} ctx  Target context.
 * @param {number}                   w    Width in px.
 * @param {number}                   h    Height in px.
 * @param {Object}                   opts Options:
 *   peaks     Float32Array from computePeaks (its length = bar count).
 *   style     'bars' | 'line' | 'fill' | 'dots' | 'pulse' | 'led' |
 *             'circle' | 'ridgeline' | 'spiral' | 'sunburst' |
 *             'heart' | 'hexagon'.
 *   theme     Theme entry (see THEMES).
 *   overrides { bg?, wave?, waveB? }.
 *   amp       Amplitude multiplier (default 1).
 *   rounded   Rounded bar caps (default true).
 *   transparentBg Skip the background fill (poster sits on the doc).
 *   mask      'none' (default) | 'squircle' | 'circle' | 'heart' | 'hex'.
 *   colorMode 'solid' (default) | 'gradient' | 'spectral'.
 *   gradientId Gradient preset id (see GRADIENTS).
 *   gradientMap 'x' (along the wave, default) | 'amp' (by loudness).
 *   glow      0..1 neon glow strength (default 0).
 *   reflect   Mirror reflection below the wave (linear styles).
 *   peaksB    Second channel peaks - stereo split (linear styles).
 *   brights   Float32Array 0..1 per bucket for 'spectral'.
 *   peaksFull High-res peaks for ridgeline (falls back to peaks).
 *   rows      Ridgeline row count (default 24).
 *   createCanvas Optional (w,h)=>canvas for node rendering.
 */
export function drawWave( ctx, w, h, opts ) {
	const {
		peaks,
		style = 'bars',
		theme = THEMES[ 0 ],
		overrides = {},
		amp = 1,
		rounded = true,
		transparentBg = false,
		mask = 'none',
		colorMode = 'solid',
		gradientId = 'sunset',
		gradientMap = 'x',
		glow = 0,
		reflect = false,
		peaksB = null,
		brights = null,
		peaksFull = null,
		rows = 0,
	} = opts;
	const pal = wavePalette( theme, overrides );
	const grad = gradientById( gradientId );
	const stops = 'solid' === colorMode ? [ pal.wave ] : grad.stops;
	const n = peaks ? peaks.length : 0;

	ctx.save();
	maskPathOn( ctx, mask, w, h );
	ctx.clip();
	if ( ! transparentBg ) {
		ctx.fillStyle = pal.bg;
		ctx.fillRect( 0, 0, w, h );
	}
	if ( ! n ) {
		ctx.restore();
		return;
	}

	/* --------------------- reflection: composite path ------------------- */
	if ( reflect && LINEAR_STYLES.includes( style ) ) {
		const waveH = Math.max( 8, Math.round( h * 0.66 ) );
		const offW = Math.max( 8, Math.round( w ) );
		const off = opts.createCanvas
			? opts.createCanvas( offW, waveH )
			: ( () => {
					const c = document.createElement( 'canvas' );
					c.width = offW;
					c.height = waveH;
					return c;
			  } )();
		drawWave( off.getContext( '2d' ), offW, waveH, {
			...opts,
			reflect: false,
			transparentBg: true,
			mask: 'none',
		} );
		ctx.drawImage( off, 0, 0, w, waveH );
		ctx.save();
		ctx.translate( 0, waveH * 2 );
		ctx.scale( 1, -1 );
		ctx.globalAlpha = 0.34;
		ctx.drawImage( off, 0, 0, w, waveH );
		ctx.restore();
		const fadeTop = waveH;
		const fade = ctx.createLinearGradient( 0, fadeTop, 0, h );
		if ( transparentBg ) {
			ctx.save();
			ctx.beginPath();
			ctx.rect( 0, fadeTop, w, h - fadeTop );
			ctx.clip();
			ctx.globalCompositeOperation = 'destination-out';
			fade.addColorStop( 0, 'rgba(0,0,0,0.4)' );
			fade.addColorStop( 1, 'rgba(0,0,0,1)' );
			ctx.fillStyle = fade;
			ctx.fillRect( 0, fadeTop, w, h - fadeTop );
			ctx.restore();
		} else {
			fade.addColorStop( 0, rgba( pal.bg, 0.4 ) );
			fade.addColorStop( 1, rgba( pal.bg, 1 ) );
			ctx.fillStyle = fade;
			ctx.fillRect( 0, fadeTop, w, h - fadeTop );
		}
		ctx.restore();
		return;
	}

	/* ------------------------- paint resolution ------------------------- */

	const isRound = [ 'circle', 'spiral', 'sunburst', 'heart', 'hexagon' ].includes( style );
	// One canvas gradient where it works; per-element colors elsewhere.
	const xGradient = () => {
		const g = ctx.createLinearGradient( 0, 0, w, 0 );
		stops.forEach( ( s, i ) =>
			g.addColorStop( i / Math.max( 1, stops.length - 1 ), s )
		);
		return g;
	};
	const ampGradient = ( height ) => {
		// Quiet center in the first stop, loud extremes in the last.
		const g = ctx.createLinearGradient( 0, 0, 0, height );
		const last = stops[ stops.length - 1 ];
		g.addColorStop( 0, last );
		g.addColorStop( 0.5, stops[ 0 ] );
		g.addColorStop( 1, last );
		return g;
	};
	const spectralGradient = () => {
		const g = ctx.createLinearGradient( 0, 0, w, 0 );
		const S = Math.min( 48, n );
		for ( let i = 0; i < S; i++ ) {
			const idx = Math.floor( ( i / Math.max( 1, S - 1 ) ) * ( n - 1 ) );
			const u = brights ? brights[ idx ] : i / Math.max( 1, S - 1 );
			g.addColorStop( i / Math.max( 1, S - 1 ), stopColor( stops, u ) );
		}
		return g;
	};
	// Per-element color (bars, dots, radial styles).
	const colorAt = ( i, peakVal ) => {
		if ( 'spectral' === colorMode ) {
			return stopColor( stops, brights ? brights[ i ] : i / n );
		}
		if ( 'gradient' === colorMode ) {
			if ( 'amp' === gradientMap ) {
				return stopColor( stops, Math.min( 1, peakVal * amp ) );
			}
			return null; // caller uses pathPaint / per-position color
		}
		return pal.wave;
	};
	// Whole-path paint (line, fill, pulse).
	const pathPaint = ( height ) => {
		if ( 'spectral' === colorMode ) {
			return spectralGradient();
		}
		if ( 'gradient' === colorMode ) {
			return 'amp' === gradientMap ? ampGradient( height ) : xGradient();
		}
		return pal.wave;
	};
	const waveBColor =
		overrides.waveB ||
		( 'solid' === colorMode
			? mixHex( pal.wave, pal.bg, 0.45 )
			: stops[ stops.length - 1 ] );

	const mid = h / 2;
	const half = ( h / 2 ) * 0.92;
	const capStyle = rounded ? 'round' : 'butt';
	const lim = ( v ) => Math.min( 1, v * amp );

	/* --------------------------- style renderers ------------------------ */

	const renderers = {
		circle() {
			const cx = w / 2;
			const cy = h / 2;
			const rMax = ( Math.min( w, h ) / 2 ) * 0.92;
			const r0 = rMax * 0.45;
			const barW = ( 2 * Math.PI * r0 ) / n / 1.7;
			ctx.lineWidth = Math.max( 1, barW );
			ctx.lineCap = capStyle;
			for ( let i = 0; i < n; i++ ) {
				const a = ( i / n ) * Math.PI * 2 - Math.PI / 2;
				const len = Math.max( barW / 2, lim( peaks[ i ] ) * ( rMax - r0 ) );
				const col = colorAt( i, peaks[ i ] );
				ctx.strokeStyle = col || stopColor( stops, i / n );
				ctx.beginPath();
				ctx.moveTo( cx + Math.cos( a ) * r0, cy + Math.sin( a ) * r0 );
				ctx.lineTo(
					cx + Math.cos( a ) * ( r0 + len ),
					cy + Math.sin( a ) * ( r0 + len )
				);
				ctx.stroke();
			}
		},

		line() {
			ctx.lineWidth = Math.max( 1.2, h * 0.008 );
			ctx.lineJoin = 'round';
			ctx.lineCap = 'round';
			ctx.strokeStyle = pathPaint( h );
			const lower = peaksB || peaks;
			ctx.beginPath();
			for ( let i = 0; i < n; i++ ) {
				const x = ( ( i + 0.5 ) / n ) * w;
				const y = mid - lim( peaks[ i ] ) * half;
				if ( i ) {
					ctx.lineTo( x, y );
				} else {
					ctx.moveTo( x, y );
				}
			}
			for ( let i = n - 1; i >= 0; i-- ) {
				const x = ( ( i + 0.5 ) / n ) * w;
				ctx.lineTo( x, mid + lim( lower[ i ] ) * half );
			}
			ctx.closePath();
			ctx.stroke();
		},

		fill() {
			ctx.fillStyle = pathPaint( h );
			const lower = peaksB || peaks;
			ctx.beginPath();
			ctx.moveTo( 0, mid );
			for ( let i = 0; i < n; i++ ) {
				const x = ( ( i + 0.5 ) / n ) * w;
				ctx.lineTo( x, mid - lim( peaks[ i ] ) * half );
			}
			ctx.lineTo( w, mid );
			for ( let i = n - 1; i >= 0; i-- ) {
				const x = ( ( i + 0.5 ) / n ) * w;
				ctx.lineTo( x, mid + lim( lower[ i ] ) * half );
			}
			ctx.closePath();
			ctx.fill();
		},

		dots() {
			const slot = w / n;
			const r = Math.max( 1, slot * 0.28 );
			const lower = peaksB || peaks;
			for ( let i = 0; i < n; i++ ) {
				const x = ( i + 0.5 ) * slot;
				const up = lim( peaks[ i ] ) * half;
				const dn = lim( lower[ i ] ) * half;
				const col = colorAt( i, peaks[ i ] );
				ctx.fillStyle = col || xStopAt( i );
				ctx.beginPath();
				ctx.arc( x, mid - up, r, 0, Math.PI * 2 );
				ctx.fill();
				if ( dn > r ) {
					ctx.fillStyle = peaksB
						? waveBColor
						: col || xStopAt( i );
					ctx.beginPath();
					ctx.arc( x, mid + dn, r, 0, Math.PI * 2 );
					ctx.fill();
				}
			}
		},

		pulse() {
			ctx.lineWidth = Math.max( 1.2, h * 0.01 );
			ctx.lineJoin = 'round';
			ctx.lineCap = 'round';
			ctx.strokeStyle = pathPaint( h );
			const lower = peaksB || peaks;
			ctx.beginPath();
			ctx.moveTo( 0, mid );
			for ( let i = 0; i < n; i++ ) {
				const x = ( ( i + 0.5 ) / n ) * w;
				const dir = i % 2 ? 1 : -1;
				const src = dir > 0 ? lower : peaks;
				ctx.lineTo( x, mid + dir * lim( src[ i ] ) * half );
			}
			ctx.lineTo( w, mid );
			ctx.stroke();
		},

		led() {
			const slot = w / n;
			const barW = Math.max( 1, slot * 0.62 );
			const segs = 12;
			const cellH = half / segs;
			const gap = cellH * 0.38;
			const bh = Math.max( 1, cellH - gap );
			const lower = peaksB || peaks;
			for ( let i = 0; i < n; i++ ) {
				const x = i * slot + ( slot - barW ) / 2;
				const col = colorAt( i, peaks[ i ] );
				const litUp = Math.round( lim( peaks[ i ] ) * segs );
				const litDn = Math.round( lim( lower[ i ] ) * segs );
				for ( let k = 0; k < litUp; k++ ) {
					ctx.fillStyle =
						col ||
						( 'gradient' === colorMode && 'amp' === gradientMap
							? stopColor( stops, ( k + 1 ) / segs )
							: xStopAt( i ) );
					ctx.fillRect( x, mid - ( k + 1 ) * cellH + gap / 2, barW, bh );
				}
				for ( let k = 0; k < litDn; k++ ) {
					ctx.fillStyle = peaksB
						? waveBColor
						: col ||
						  ( 'gradient' === colorMode && 'amp' === gradientMap
								? stopColor( stops, ( k + 1 ) / segs )
								: xStopAt( i ) );
					ctx.fillRect( x, mid + k * cellH + gap / 2, barW, bh );
				}
			}
		},

		bars() {
			const slot = w / n;
			const barW = Math.max( 1, slot * 0.62 );
			const radius = rounded ? barW / 2 : 0;
			const lower = peaksB || null;
			for ( let i = 0; i < n; i++ ) {
				const x = i * slot + ( slot - barW ) / 2;
				const col = colorAt( i, peaks[ i ] );
				const drawBar = ( y, bh, fill ) => {
					ctx.fillStyle = fill;
					ctx.beginPath();
					if ( radius && 'function' === typeof ctx.roundRect ) {
						ctx.roundRect( x, y, barW, bh, radius );
					} else {
						ctx.rect( x, y, barW, bh );
					}
					ctx.fill();
				};
				if ( lower ) {
					const up = Math.max( barW / 2, lim( peaks[ i ] ) * half );
					const dn = Math.max( barW / 2, lim( lower[ i ] ) * half );
					drawBar( mid - up, up, col || xStopAt( i ) );
					drawBar( mid, dn, peaksB ? waveBColor : col || xStopAt( i ) );
				} else {
					const bh = Math.max( barW, lim( peaks[ i ] ) * half * 2 );
					drawBar( mid - bh / 2, bh, col || xStopAt( i ) );
				}
			}
		},

		ridgeline( glowPass ) {
			// The song as stacked mountain lines (the record-sleeve look):
			// row r takes the r-th slice of the track, drawn back to front
			// with each ridge occluding the ones behind it. On transparent
			// output the occlusion must ERASE - that would punch holes into
			// whatever was composited below (the video tile paints its own
			// backdrop first), so the transparent path renders offscreen
			// and is composited as one image.
			const src = peaksFull && peaksFull.length > n ? peaksFull : peaks;
			const R = Math.max( 8, Math.min( 44, rows || 24 ) );
			const cols = Math.max( 24, Math.min( 130, Math.floor( src.length / R ) ) );
			const cell = ( r, c ) => {
				const i0 = Math.floor( ( ( r * cols + c ) / ( R * cols ) ) * src.length );
				const i1 = Math.max(
					i0 + 1,
					Math.floor( ( ( r * cols + c + 1 ) / ( R * cols ) ) * src.length )
				);
				let m = 0;
				for ( let i = i0; i < i1 && i < src.length; i++ ) {
					if ( src[ i ] > m ) {
						m = src[ i ];
					}
				}
				return m;
			};
			const x0 = w * 0.07;
			const x1 = w * 0.93;
			const yTop = h * 0.14;
			const yBot = h * 0.9;
			const dy = ( yBot - yTop ) / Math.max( 1, R - 1 );
			const reach = dy * 3.0;
			const strokeFor = ( g, r ) => {
				g.strokeStyle =
					'solid' === colorMode
						? pal.wave
						: 'spectral' === colorMode
						? stopColor( stops, r / Math.max( 1, R - 1 ) )
						: 'amp' === gradientMap
						? stopColor( stops, r / Math.max( 1, R - 1 ) )
						: xGradient();
			};
			const drawRows = ( g, occlude, erase ) => {
				g.lineWidth = Math.max( 1.1, h * 0.0035 );
				g.lineJoin = 'round';
				g.lineCap = 'round';
				for ( let r = 0; r < R; r++ ) {
					const yBase = yTop + r * dy;
					const pts = [];
					for ( let c = 0; c < cols; c++ ) {
						const x = x0 + ( c / ( cols - 1 ) ) * ( x1 - x0 );
						// Ease the ridge ends down so every line starts
						// and ends on its baseline.
						const edge = Math.min( 1, ( Math.min( c, cols - 1 - c ) / cols ) * 6 );
						const v = Math.min( 1.55, cell( r, c ) * amp ) * edge;
						pts.push( [ x, yBase - v * reach ] );
					}
					const trace = () => {
						g.beginPath();
						g.moveTo( x0, yBase );
						for ( let c = 0; c < cols - 1; c++ ) {
							const xc = ( pts[ c ][ 0 ] + pts[ c + 1 ][ 0 ] ) / 2;
							const yc = ( pts[ c ][ 1 ] + pts[ c + 1 ][ 1 ] ) / 2;
							g.quadraticCurveTo( pts[ c ][ 0 ], pts[ c ][ 1 ], xc, yc );
						}
						g.lineTo( x1, yBase );
					};
					if ( occlude ) {
						trace();
						g.closePath();
						if ( erase ) {
							g.save();
							g.globalCompositeOperation = 'destination-out';
							g.fillStyle = '#000';
							g.fill();
							g.restore();
						} else {
							g.fillStyle = pal.bg;
							g.fill();
						}
					}
					strokeFor( g, r );
					trace();
					g.stroke();
				}
			};
			if ( glowPass ) {
				// Glow passes only add halo strokes; the occlusion happens
				// in the final pass.
				drawRows( ctx, false, false );
			} else if ( ! transparentBg ) {
				drawRows( ctx, true, false );
			} else {
				const offW = Math.max( 8, Math.round( w ) );
				const offH = Math.max( 8, Math.round( h ) );
				const off = opts.createCanvas
					? opts.createCanvas( offW, offH )
					: ( () => {
							const c = document.createElement( 'canvas' );
							c.width = offW;
							c.height = offH;
							return c;
					  } )();
				drawRows( off.getContext( '2d' ), true, true );
				ctx.drawImage( off, 0, 0, w, h );
			}
		},

		spiral() {
			// The whole song wound into an archimedean spiral.
			const cx = w / 2;
			const cy = h / 2;
			const rMax = ( Math.min( w, h ) / 2 ) * 0.9;
			const r0 = rMax * 0.16;
			const T = Math.max( 3, Math.min( 6, Math.round( n / 64 ) ) );
			const gap = ( rMax - r0 ) / T;
			const circAvg = Math.PI * ( r0 + rMax );
			ctx.lineWidth = Math.max( 0.8, ( ( circAvg * T ) / n ) * 0.5 );
			ctx.lineCap = capStyle;
			for ( let i = 0; i < n; i++ ) {
				const u = i / Math.max( 1, n - 1 );
				const a = T * Math.PI * 2 * u - Math.PI / 2;
				const r = r0 + ( rMax - r0 - gap * 0.55 ) * u;
				// Taper toward the center: the inner windings are short on
				// circumference, full-length bars would fuse into a blob.
				const taper = 0.3 + 0.7 * Math.min( 1, r / ( rMax * 0.55 ) );
				const len = Math.max(
					ctx.lineWidth * 0.6,
					lim( peaks[ i ] ) * gap * 0.78 * taper
				);
				const col = colorAt( i, peaks[ i ] );
				ctx.strokeStyle = col || stopColor( stops, u );
				ctx.beginPath();
				ctx.moveTo(
					cx + Math.cos( a ) * ( r - len / 2 ),
					cy + Math.sin( a ) * ( r - len / 2 )
				);
				ctx.lineTo(
					cx + Math.cos( a ) * ( r + len / 2 ),
					cy + Math.sin( a ) * ( r + len / 2 )
				);
				ctx.stroke();
			}
		},

		sunburst() {
			// Two or three concentric rings, each carrying a slice of the
			// song - the vinyl-label look with room for a title inside.
			const cx = w / 2;
			const cy = h / 2;
			const rMax = ( Math.min( w, h ) / 2 ) * 0.92;
			const R = n >= 150 ? 3 : 2;
			const per = Math.floor( n / R );
			const band = ( rMax * ( 3 === R ? 0.62 : 0.5 ) ) / R;
			ctx.lineCap = capStyle;
			for ( let k = 0; k < R; k++ ) {
				const rBase = rMax - ( R - k ) * band - rMax * 0.02;
				const ringN = k === R - 1 ? n - per * ( R - 1 ) : per;
				const start = per * k;
				ctx.lineWidth = Math.max(
					1,
					( ( 2 * Math.PI * rBase ) / ringN ) * 0.5
				);
				for ( let i = 0; i < ringN; i++ ) {
					const a = ( i / ringN ) * Math.PI * 2 - Math.PI / 2;
					const p = peaks[ start + i ];
					const len = Math.max(
						ctx.lineWidth * 0.6,
						lim( p ) * band * 0.88
					);
					const col = colorAt( start + i, p );
					ctx.strokeStyle =
						col ||
						stopColor( stops, R > 1 ? k / ( R - 1 ) : 0.5 );
					ctx.beginPath();
					ctx.moveTo(
						cx + Math.cos( a ) * rBase,
						cy + Math.sin( a ) * rBase
					);
					ctx.lineTo(
						cx + Math.cos( a ) * ( rBase + len ),
						cy + Math.sin( a ) * ( rBase + len )
					);
					ctx.stroke();
				}
			}
		},

		heart() {
			contourWave( 'heart' );
		},

		hexagon() {
			contourWave( 'hex' );
		},
	};

	// Bars along a closed contour: the heartbeat around the heart.
	function contourWave( kind ) {
		const side = Math.min( w, h );
		const inner = side * 0.62;
		const ox = ( w - inner ) / 2;
		const oy = ( h - inner ) / 2;
		const pts = sampleContour( kind, n );
		const perim = 'heart' === kind ? inner * 2.6 : inner * 3;
		ctx.lineWidth = Math.max( 0.9, ( perim / n ) * 0.52 );
		ctx.lineCap = capStyle;
		// A quiet baseline of the shape itself.
		ctx.save();
		ctx.globalAlpha *= 0.3;
		ctx.strokeStyle =
			'solid' === colorMode ? pal.wave : stopColor( stops, 0.5 );
		ctx.beginPath();
		pts.forEach( ( p, i ) => {
			const x = ox + p.x * inner;
			const y = oy + p.y * inner;
			if ( i ) {
				ctx.lineTo( x, y );
			} else {
				ctx.moveTo( x, y );
			}
		} );
		ctx.closePath();
		ctx.lineWidth = Math.max( 1, side * 0.004 );
		ctx.stroke();
		ctx.restore();
		ctx.lineWidth = Math.max( 0.9, ( perim / n ) * 0.52 );
		const maxLen = side * 0.155;
		for ( let i = 0; i < n; i++ ) {
			const p = pts[ i ];
			const x = ox + p.x * inner;
			const y = oy + p.y * inner;
			const len = Math.max(
				ctx.lineWidth * 0.6,
				lim( peaks[ i ] ) * maxLen
			);
			const col = colorAt( i, peaks[ i ] );
			ctx.strokeStyle = col || stopColor( stops, i / n );
			ctx.beginPath();
			ctx.moveTo( x - p.nx * len * 0.32, y - p.ny * len * 0.32 );
			ctx.lineTo( x + p.nx * len * 0.68, y + p.ny * len * 0.68 );
			ctx.stroke();
		}
	}

	// 'gradient' + map 'x' on per-element styles: color by position.
	function xStopAt( i ) {
		if ( 'gradient' === colorMode && 'x' === gradientMap ) {
			return stopColor( stops, i / Math.max( 1, n - 1 ) );
		}
		return pal.wave;
	}

	const renderStyle = ( glowPass ) =>
		( renderers[ style ] || renderers.bars )( glowPass );

	/* ----------------------------- glow passes -------------------------- */

	const glowAmt = Math.max( 0, Math.min( 1, glow ) );
	if ( glowAmt > 0.01 ) {
		const gcol =
			'solid' === colorMode
				? pal.wave
				: stops[ Math.floor( stops.length / 2 ) ];
		const passes = [
			{ blur: Math.max( 6, ( isRound ? Math.min( w, h ) : h ) * 0.1 ) * glowAmt, alpha: 0.5 * glowAmt },
			{ blur: Math.max( 3, ( isRound ? Math.min( w, h ) : h ) * 0.035 ) * glowAmt, alpha: 0.65 * glowAmt },
		];
		for ( const p of passes ) {
			ctx.save();
			ctx.shadowColor = gcol;
			ctx.shadowBlur = p.blur;
			ctx.globalAlpha = p.alpha;
			renderStyle( true );
			ctx.restore();
		}
	}
	renderStyle( false );
	ctx.restore();
}
