/**
 * Text Art render engine: the image emerges from characters - ASCII
 * ramps, emoji, packed words, readable text flows (rows, diagonal,
 * waves, spiral) and text inside a silhouette. The picture is built
 * ONLY from the glyphs themselves (color, size, density per glyph on
 * a solid ground - never an overlay). Pure module, node-testable
 * (emoji color measurement degrades gracefully where color fonts are
 * unavailable).
 */

const makeCanvas = ( like, w, h ) => {
	const c =
		'undefined' !== typeof document
			? document.createElement( 'canvas' )
			: new like.constructor( w, h );
	c.width = w;
	c.height = h;
	return c;
};

/* ------------------------------ shared color ------------------------------ */

const BG = { dark: '#0e1013', light: '#ffffff' };

export const CHARSETS = {
	classic: ' .:-=+*#%@',
	blocks: ' ░▒▓█',
	braille: ' ⠁⠃⠉⠛⠟⠿⡿⣿',
	binary: ' 01',
	// Density-ordered katakana/digit ramp (the film look).
	matrix: ' ･:ｰｲｸﾃ048ﾎﾒ',
	// The classic typewriter-portrait ramp.
	typewriter: ' .,:;i1tfLG08@',
};

function makeSampler( like, source, w, h ) {
	const c = makeCanvas( like, w, h );
	c.getContext( '2d' ).drawImage( source, 0, 0, w, h );
	const d = c.getContext( '2d' ).getImageData( 0, 0, w, h ).data;
	return {
		w,
		h,
		data: d,
		pix( x, y ) {
			const xi = Math.max( 0, Math.min( w - 1, x | 0 ) );
			const yi = Math.max( 0, Math.min( h - 1, y | 0 ) );
			const i = ( yi * w + xi ) * 4;
			return [ d[ i ], d[ i + 1 ], d[ i + 2 ], d[ i + 3 ] ];
		},
	};
}

const lumOf = ( p ) => 0.299 * p[ 0 ] + 0.587 * p[ 1 ] + 0.114 * p[ 2 ];

// Intensity: how strongly a glyph should appear at this spot. On a
// dark ground bright zones glow; on a light ground dark zones print.
const intensityOf = ( p, background, contrast = 1 ) => {
	const li = lumOf( p ) / 255;
	const raw = 'light' === background ? 1 - li : li;
	return Math.max( 0, Math.min( 1, Math.pow( raw, 1 / contrast ) ) );
};

const clamp255 = ( v ) => Math.max( 0, Math.min( 255, v ) );
const hexToRgb = ( hex ) => [
	parseInt( hex.slice( 1, 3 ), 16 ),
	parseInt( hex.slice( 3, 5 ), 16 ),
	parseInt( hex.slice( 5, 7 ), 16 ),
];

// Saturation-boosted image color so glyphs stay lively at small sizes.
function boostColor( p, background ) {
	const m = ( p[ 0 ] + p[ 1 ] + p[ 2 ] ) / 3;
	const f = 'light' === background ? 0.8 : 1.15;
	const lift = 'light' === background ? 0 : 36;
	const bb = ( v ) =>
		clamp255( ( m + ( v - m ) * 1.55 ) * f + lift * ( 1 - m / 255 ) );
	return [ bb( p[ 0 ] ), bb( p[ 1 ] ), bb( p[ 2 ] ) ];
}

/**
 * Glyph color for a sample point.
 *
 * @param {Array}  p    Sampled pixel.
 * @param {number} u    0..1 position across the sheet (gradient axis).
 * @param {Object} opts { colorMode 'image'|'mono'|'gradient', colors
 *                        (hex list), background }.
 * @return {string} CSS color.
 */
export function glyphColor( p, u, opts ) {
	const mode = opts.colorMode || 'image';
	if ( 'mono' === mode ) {
		const c = hexToRgb( ( opts.colors && opts.colors[ 0 ] ) || '#3b66ff' );
		return `rgb(${ c[ 0 ] },${ c[ 1 ] },${ c[ 2 ] })`;
	}
	if ( 'gradient' === mode ) {
		const a = hexToRgb( ( opts.colors && opts.colors[ 0 ] ) || '#3b66ff' );
		const b = hexToRgb(
			( opts.colors && opts.colors[ 1 ] ) ||
				( opts.colors && opts.colors[ 0 ] ) ||
				'#c2427b'
		);
		const t = Math.max( 0, Math.min( 1, u ) );
		return `rgb(${ ( a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * t ) | 0 },${
			( a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * t ) | 0
		},${ ( a[ 2 ] + ( b[ 2 ] - a[ 2 ] ) * t ) | 0 })`;
	}
	const c = boostColor( p, opts.background );
	return `rgb(${ c[ 0 ] | 0 },${ c[ 1 ] | 0 },${ c[ 2 ] | 0 })`;
}

const famFor = ( font ) => ( font ? `"${ font }", sans-serif` : 'sans-serif' );

/* -------------------------------- ASCII art ------------------------------- */

/**
 * ASCII art: a density ramp of characters, colored per cell.
 *
 * @param {Object}            like   Canvas-like.
 * @param {HTMLCanvasElement} source Source canvas.
 * @param {Object}            opts   { cell (5..16 px column width),
 *   charset (CHARSETS key or 'custom'), customChars, colorMode,
 *   colors, background 'dark'|'light', bold, contrast (0.5..2) }.
 * @return {HTMLCanvasElement}
 */
export function renderAscii( like, source, opts = {} ) {
	const CW = Math.max( 5, Math.min( 16, opts.cell || 7 ) );
	const CH = Math.round( CW * 1.7 );
	const ramp =
		'custom' === opts.charset && opts.customChars
			? ' ' + String( opts.customChars ).replace( /\s+/g, '' )
			: CHARSETS[ opts.charset ] || CHARSETS.classic;
	const background = 'light' === opts.background ? 'light' : 'dark';
	const cols = Math.max( 16, Math.round( 560 / CW ) );
	const rows = Math.max(
		8,
		Math.round( ( cols * CW * ( source.height / source.width ) ) / CH )
	);
	const smp = makeSampler( like, source, cols, rows );
	const c = makeCanvas( like, cols * CW, rows * CH );
	const g = c.getContext( '2d' );
	g.fillStyle = BG[ background ];
	g.fillRect( 0, 0, c.width, c.height );
	g.font = `${ opts.bold ? 700 : 400 } ${ CW + 4 }px monospace`;
	g.textBaseline = 'top';
	g.textAlign = 'left';
	for ( let r = 0; r < rows; r++ ) {
		for ( let q = 0; q < cols; q++ ) {
			const p = smp.pix( q, r );
			const it = intensityOf( p, background, opts.contrast || 1 );
			const idx = Math.min(
				ramp.length - 1,
				Math.round( it * ( ramp.length - 1 ) )
			);
			const ch = ramp[ idx ];
			if ( ' ' === ch ) {
				continue;
			}
			g.fillStyle = glyphColor(
				p,
				( q + r * 0.6 ) / ( cols + rows * 0.6 ),
				{
					...opts,
					background,
				}
			);
			g.fillText( ch, q * CW, r * CH + 1 );
		}
	}
	return c;
}

/* -------------------------------- emoji art ------------------------------- */

/**
 * Measure emoji tiles: average color + coverage (sparse emoji read
 * lighter). In environments without a color emoji font the coverage
 * collapses and the emoji is dropped.
 *
 * @param {Object} like Canvas-like.
 * @param {string} list Space/character separated emoji string.
 * @return {Array} [ { e, avg, cov } ]
 */
export function measureEmojis( like, list ) {
	const chars = Array.from(
		new Set(
			String( list || '' )
				.split( /\s+/ )
				.filter( Boolean )
		)
	).slice( 0, 400 );
	const P = 32;
	const c = makeCanvas( like, P, P );
	const g =
		c.getContext( '2d', { willReadFrequently: true } ) ||
		c.getContext( '2d' );
	const out = [];
	for ( const e of chars ) {
		g.clearRect( 0, 0, P, P );
		g.font = `${ P - 4 }px sans-serif`;
		g.textBaseline = 'top';
		g.fillText( e, 0, 2 );
		const d = g.getImageData( 0, 0, P, P ).data;
		let r = 0;
		let gg = 0;
		let b = 0;
		let a = 0;
		for ( let i = 0; i < d.length; i += 4 ) {
			const w = d[ i + 3 ] / 255;
			r += d[ i ] * w;
			gg += d[ i + 1 ] * w;
			b += d[ i + 2 ] * w;
			a += w;
		}
		if ( a > 30 ) {
			out.push( {
				e,
				avg: [ r / a, gg / a, b / a ],
				cov: a / ( P * P ),
			} );
		}
	}
	return out;
}

/**
 * Emoji art: color-matched emoji per cell (coverage-weighted against
 * the ground), neighbour repeats penalized.
 *
 * @param {Object}            like   Canvas-like.
 * @param {HTMLCanvasElement} source Source canvas.
 * @param {Array}             tiles  From measureEmojis.
 * @param {Object}            opts   { cell (12..30), background }.
 * @return {HTMLCanvasElement|null} null if fewer than 3 usable tiles.
 */
export function renderEmojiArt( like, source, tiles, opts = {} ) {
	if ( ! tiles || tiles.length < 3 ) {
		return null;
	}
	const CELL = Math.max( 12, Math.min( 30, opts.cell || 17 ) );
	const background = 'light' === opts.background ? 'light' : 'dark';
	const ground = 'light' === background ? 255 : 14;
	const cols = Math.max( 12, Math.round( 760 / CELL ) );
	const rows = Math.max(
		6,
		Math.round( cols * ( source.height / source.width ) )
	);
	const smp = makeSampler( like, source, cols, rows );
	const c = makeCanvas( like, cols * CELL, rows * CELL );
	const g = c.getContext( '2d' );
	g.fillStyle = BG[ background ];
	g.fillRect( 0, 0, c.width, c.height );
	g.font = `${ CELL - 2 }px sans-serif`;
	g.textBaseline = 'top';
	const eff = tiles.map( ( t ) =>
		t.avg.map( ( v ) => v * t.cov + ground * ( 1 - t.cov ) )
	);
	const lastRow = new Int32Array( cols ).fill( -1 );
	for ( let r = 0; r < rows; r++ ) {
		let prev = -1;
		for ( let q = 0; q < cols; q++ ) {
			const p = smp.pix( q, r );
			let bi = 0;
			let bs = Infinity;
			for ( let k = 0; k < tiles.length; k++ ) {
				const e = eff[ k ];
				let s =
					( e[ 0 ] - p[ 0 ] ) ** 2 * 0.6 +
					( e[ 1 ] - p[ 1 ] ) ** 2 +
					( e[ 2 ] - p[ 2 ] ) ** 2 * 0.4;
				if ( k === prev || k === lastRow[ q ] ) {
					s += 900;
				}
				if ( s < bs ) {
					bs = s;
					bi = k;
				}
			}
			prev = bi;
			lastRow[ q ] = bi;
			g.fillText( tiles[ bi ].e, q * CELL, r * CELL + 1 );
		}
	}
	return c;
}

/* ------------------------------ word portrait ----------------------------- */

const mulberry = ( seed ) => {
	let a = seed >>> 0 || 1;
	return () => {
		a |= 0;
		a = ( a + 0x6d2b79f5 ) | 0;
		let t = Math.imul( a ^ ( a >>> 15 ), 1 | a );
		t = ( t + Math.imul( t ^ ( t >>> 7 ), 61 | t ) ) ^ t;
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;
	};
};

/**
 * Word portrait: words packed line by line; SIZE and WEIGHT follow the
 * image (the dynamics range is adjustable), optional per-word rotation.
 *
 * @param {Object}            like   Canvas-like.
 * @param {HTMLCanvasElement} source Source canvas.
 * @param {Object}            opts   { words (array), font, sizeMin
 *   (5..14), sizeMax (10..40), rotation 'none'|'slight'|'wild',
 *   colorMode, colors, background, contrast, seed }.
 * @return {HTMLCanvasElement}
 */
export function renderWordArt( like, source, opts = {} ) {
	const words = ( opts.words || [] )
		.map( ( w ) => String( w ).trim() )
		.filter( Boolean );
	if ( ! words.length ) {
		words.push( 'LOVE' );
	}
	const background = 'light' === opts.background ? 'light' : 'dark';
	const sMin = Math.max( 5, Math.min( 14, opts.sizeMin || 7 ) );
	const sMax = Math.max( sMin + 4, Math.min( 40, opts.sizeMax || 24 ) );
	const rot =
		'wild' === opts.rotation ? 0.5 : 'slight' === opts.rotation ? 0.14 : 0;
	const rand = mulberry( opts.seed || 7 );
	const W = 620;
	const H = Math.round( ( W * source.height ) / source.width );
	const smp = makeSampler( like, source, W, H );
	const c = makeCanvas( like, W, H );
	const g = c.getContext( '2d' );
	g.fillStyle = BG[ background ];
	g.fillRect( 0, 0, W, H );
	g.textBaseline = 'alphabetic';
	let wi = 0;
	let y = sMin + 4;
	while ( y < H - 2 ) {
		let x = 2;
		let lineH = sMin;
		while ( x < W - 6 ) {
			const p = smp.pix( x + 10, y );
			const it = intensityOf( p, background, opts.contrast || 1 );
			const size = sMin + it * ( sMax - sMin );
			const wgt = it > 0.62 ? 800 : it > 0.34 ? 600 : 400;
			g.font = `${ wgt } ${ size | 0 }px ${ famFor( opts.font ) }`;
			const word = words[ wi++ % words.length ];
			const wpx = g.measureText( word ).width;
			g.fillStyle = glyphColor( p, ( x + y * 0.5 ) / ( W + H * 0.5 ), {
				...opts,
				background,
			} );
			g.globalAlpha = 0.35 + it * 0.65;
			if ( rot > 0 ) {
				const a = ( rand() - 0.5 ) * 2 * rot;
				g.save();
				g.translate( x + wpx / 2, y );
				g.rotate( a );
				g.fillText( word, -wpx / 2, 0 );
				g.restore();
			} else {
				g.fillText( word, x, y );
			}
			x += wpx + 4;
			lineH = Math.max( lineH, size );
		}
		y += lineH * 0.92 + 2;
	}
	g.globalAlpha = 1;
	return c;
}

/* -------------------------------- text flow ------------------------------- */

/**
 * Text flow (lyrics, poems, post content): the text stays READABLE in
 * order; each glyph is tinted (and optionally sized) by the image.
 * Layouts: rows, diagonal, waves, spiral.
 *
 * @param {Object}            like   Canvas-like.
 * @param {HTMLCanvasElement} source Source canvas.
 * @param {Object}            opts   { text, font, size (9..22),
 *   layout 'rows'|'diagonal'|'waves'|'spiral', dynamicSize (bool),
 *   colorMode, colors, background, contrast }.
 * @return {HTMLCanvasElement}
 */
export function renderTextFlow( like, source, opts = {} ) {
	const raw = String( opts.text || 'TEXT ART ' ).replace( /\s+/g, ' ' );
	const text = raw.length < 40 ? ( raw + ' ' ).repeat( 20 ) : raw + ' ';
	const background = 'light' === opts.background ? 'light' : 'dark';
	const size = Math.max( 9, Math.min( 22, opts.size || 13 ) );
	const layout = opts.layout || 'rows';
	const W = 620;
	const H = Math.round( ( W * source.height ) / source.width );
	const smp = makeSampler( like, source, W, H );
	const c = makeCanvas( like, W, H );
	const g = c.getContext( '2d' );
	g.fillStyle = BG[ background ];
	g.fillRect( 0, 0, W, H );
	g.textBaseline = 'middle';
	let ti = 0;
	const put = ( x, y, ang ) => {
		if ( x < -size || y < -size || x > W + size || y > H + size ) {
			ti++;
			return size * 0.55;
		}
		const p = smp.pix( x, y );
		const it = intensityOf( p, background, opts.contrast || 1 );
		const fs = opts.dynamicSize
			? Math.max( 6, size * ( 0.6 + it * 0.85 ) )
			: size;
		g.font = `600 ${ fs | 0 }px ${ famFor( opts.font ) }`;
		const chr = text[ ti++ % text.length ];
		const wpx = g.measureText( chr ).width || fs * 0.4;
		g.globalAlpha = Math.max( 0.07, Math.pow( it, 1.25 ) );
		g.fillStyle = glyphColor( p, ( x + y * 0.5 ) / ( W + H * 0.5 ), {
			...opts,
			background,
		} );
		if ( ang ) {
			g.save();
			g.translate( x, y );
			g.rotate( ang );
			g.fillText( chr, 0, 0 );
			g.restore();
		} else {
			g.fillText( chr, x, y );
		}
		return wpx;
	};
	if ( 'spiral' === layout ) {
		const cx = W / 2;
		const cy = H / 2;
		const gap = size * 1.15;
		const b = gap / ( 2 * Math.PI );
		let theta = 2.2;
		const maxR = Math.hypot( W, H ) / 2 + size;
		while ( b * theta < maxR ) {
			const rr = b * theta;
			const x = cx + Math.cos( theta ) * rr;
			const y = cy + Math.sin( theta ) * rr;
			const wpx = put( x, y, theta + Math.PI / 2 );
			theta += Math.max( 0.012, ( wpx + 1 ) / Math.max( rr, 6 ) );
		}
	} else if ( 'diagonal' === layout ) {
		const ang = -Math.PI / 7.5; // ~-24 deg
		const cos = Math.cos( ang );
		const sin = Math.sin( ang );
		const lh = size * 1.18;
		const D = Math.hypot( W, H );
		for ( let v = -D; v < D; v += lh ) {
			for ( let u = -D; u < D;  ) {
				const x = W / 2 + u * cos - v * sin;
				const y = H / 2 + u * sin + v * cos;
				u += put( x, y, ang ) + 0.5;
			}
		}
	} else if ( 'waves' === layout ) {
		const lh = size * 1.3;
		for ( let y = size; y < H + lh; y += lh ) {
			for ( let x = 3; x < W - 4;  ) {
				const yy = y + Math.sin( ( x / W ) * Math.PI * 2.2 ) * lh * 0.8;
				x += put( x, yy, 0 ) + 0.4;
			}
		}
	} else {
		const lh = size * 1.18;
		for ( let y = size * 0.8; y < H - 2; y += lh ) {
			for ( let x = 3; x < W - 4;  ) {
				x += put( x, y, 0 ) + 0.3;
			}
		}
	}
	g.globalAlpha = 1;
	return c;
}

/* ----------------------------- silhouette text ---------------------------- */

/**
 * Silhouette text: the text fills ONLY the subject shape. Mask comes
 * from the source alpha channel when present (cut-out layers!), else
 * from a luminance threshold (with invert).
 *
 * @param {Object}            like   Canvas-like.
 * @param {HTMLCanvasElement} source Source canvas WITH alpha (pass the
 *                                   unflattened render for cut-outs).
 * @param {Object}            opts   { text, font, size, threshold
 *   (0..100), invert, colorMode, colors, background, contrast }.
 * @return {HTMLCanvasElement}
 */
export function renderSilhouetteText( like, source, opts = {} ) {
	const raw = String( opts.text || 'TEXT ' ).replace( /\s+/g, ' ' );
	const text = raw.length < 30 ? ( raw + ' ' ).repeat( 30 ) : raw + ' ';
	const background = 'light' === opts.background ? 'light' : 'dark';
	const size = Math.max( 8, Math.min( 22, opts.size || 12 ) );
	const W = 620;
	const H = Math.round( ( W * source.height ) / source.width );
	const smp = makeSampler( like, source, W, H );
	// Alpha mask when the source has real transparency, else threshold.
	let alphaCount = 0;
	for ( let i = 3; i < smp.data.length; i += 4 ) {
		if ( smp.data[ i ] < 128 ) {
			alphaCount++;
		}
	}
	const useAlpha = alphaCount > W * H * 0.05;
	const thr = 255 * ( ( opts.threshold ?? 50 ) / 100 );
	const inMask = ( x, y ) => {
		const p = smp.pix( x, y );
		let inside;
		if ( useAlpha ) {
			inside = p[ 3 ] >= 128;
		} else {
			inside = lumOf( p ) <= thr;
		}
		return opts.invert ? ! inside : inside;
	};
	const c = makeCanvas( like, W, H );
	const g = c.getContext( '2d' );
	g.fillStyle = BG[ background ];
	g.fillRect( 0, 0, W, H );
	g.textBaseline = 'middle';
	g.font = `700 ${ size }px ${ famFor( opts.font ) }`;
	let ti = 0;
	const lh = size * 1.12;
	for ( let y = size; y < H - 2; y += lh ) {
		for ( let x = 3; x < W - 4;  ) {
			const chr = text[ ti % text.length ];
			const wpx = g.measureText( chr ).width || size * 0.4;
			if ( inMask( x + wpx / 2, y ) ) {
				const p = smp.pix( x + wpx / 2, y );
				const it = Math.max(
					0.3,
					intensityOf( p, background, opts.contrast || 1 )
				);
				g.globalAlpha = it;
				g.fillStyle = glyphColor(
					p,
					( x + y * 0.5 ) / ( W + H * 0.5 ),
					{ ...opts, background }
				);
				g.fillText( chr, x, y );
				ti++;
			}
			x += wpx + 0.3;
		}
	}
	g.globalAlpha = 1;
	return c;
}

/* -------------------------------- brick art ------------------------------- */

// Classic toy-brick palette (LEGO-adjacent hues, no trademarked names).
export const BRICK_COLORS = [
	'#f4f4f4',
	'#e4cd9e',
	'#d09168',
	'#a3a2a4',
	'#635f61',
	'#05131d',
	'#c91a09',
	'#720e0f',
	'#fe8a18',
	'#f2cd37',
	'#bbe90b',
	'#4b9f4a',
	'#184632',
	'#a0bcac',
	'#36aebf',
	'#5a93db',
	'#0055bf',
	'#0a3463',
	'#3f3691',
	'#923978',
	'#fc97ac',
	'#e4adc8',
	'#582a12',
	'#ff698f',
].map( ( hex ) => [
	parseInt( hex.slice( 1, 3 ), 16 ),
	parseInt( hex.slice( 3, 5 ), 16 ),
	parseInt( hex.slice( 5, 7 ), 16 ),
] );

const nearestBrick = ( p ) => {
	let best = 0;
	let bs = Infinity;
	for ( let i = 0; i < BRICK_COLORS.length; i++ ) {
		const b = BRICK_COLORS[ i ];
		// Redmean distance: luma-weighted metrics desaturate (a vivid
		// blue sky snapped to gray), this keeps hues honest.
		const rm = ( p[ 0 ] + b[ 0 ] ) / 2;
		const s =
			( 2 + rm / 256 ) * ( p[ 0 ] - b[ 0 ] ) ** 2 +
			4 * ( p[ 1 ] - b[ 1 ] ) ** 2 +
			( 2 + ( 255 - rm ) / 256 ) * ( p[ 2 ] - b[ 2 ] ) ** 2;
		if ( s < bs ) {
			bs = s;
			best = i;
		}
	}
	return BRICK_COLORS[ best ];
};

/**
 * Brick art: the image rebuilt from studded toy bricks. Colors snap to
 * the classic brick palette (or stay original), every cell gets a base
 * bevel, a seam and the round stud with highlight/shadow.
 *
 * @param {Object}            like   Canvas-like.
 * @param {HTMLCanvasElement} source Source canvas.
 * @param {Object}            opts   { cell 10..40 px, originalColors,
 *   contrast (unused, reserved) }.
 * @return {HTMLCanvasElement}
 */
export function renderBrickArt( like, source, opts = {} ) {
	const cell = Math.max( 10, Math.min( 40, opts.cell || 18 ) );
	const cols = Math.max( 8, Math.round( source.width / ( cell / 3 ) / 3 ) );
	const rows = Math.max(
		8,
		Math.round( ( cols * source.height ) / source.width )
	);
	const smp = makeSampler( like, source, cols, rows );
	const c = makeCanvas( like, cols * cell, rows * cell );
	const g = c.getContext( '2d' );
	for ( let y = 0; y < rows; y++ ) {
		for ( let x = 0; x < cols; x++ ) {
			const p = smp.pix( x, y );
			const col = opts.originalColors
				? [ p[ 0 ], p[ 1 ], p[ 2 ] ]
				: nearestBrick( p );
			const rgb = `rgb(${ col[ 0 ] },${ col[ 1 ] },${ col[ 2 ] })`;
			const bx = x * cell;
			const by = y * cell;
			// Base plate.
			g.fillStyle = rgb;
			g.fillRect( bx, by, cell, cell );
			// Bevel: light top/left, dark bottom/right.
			g.fillStyle = 'rgba(255,255,255,0.16)';
			g.fillRect( bx, by, cell, 1.5 );
			g.fillRect( bx, by, 1.5, cell );
			g.fillStyle = 'rgba(0,0,0,0.22)';
			g.fillRect( bx, by + cell - 1.5, cell, 1.5 );
			g.fillRect( bx + cell - 1.5, by, 1.5, cell );
			// Stud with 3D shading.
			const cx = bx + cell / 2;
			const cy = by + cell / 2;
			const r = cell * 0.31;
			// Drop shadow under the stud.
			g.fillStyle = 'rgba(0,0,0,0.18)';
			g.beginPath();
			g.arc( cx + r * 0.14, cy + r * 0.2, r, 0, Math.PI * 2 );
			g.fill();
			g.fillStyle = rgb;
			g.beginPath();
			g.arc( cx, cy, r, 0, Math.PI * 2 );
			g.fill();
			// Rim light and core shade.
			g.strokeStyle = 'rgba(255,255,255,0.35)';
			g.lineWidth = Math.max( 1, cell * 0.05 );
			g.beginPath();
			g.arc( cx, cy, r * 0.86, Math.PI * 0.8, Math.PI * 1.7 );
			g.stroke();
			g.strokeStyle = 'rgba(0,0,0,0.24)';
			g.beginPath();
			g.arc( cx, cy, r * 0.86, Math.PI * -0.2, Math.PI * 0.7 );
			g.stroke();
		}
	}
	return c;
}

/* --------------------------- cell-mosaic family --------------------------- */

// Shared grid for the object-mosaic types (~1120px sheet width).
const gridFor = ( source, cell ) => {
	const cols = Math.max( 8, Math.round( 1120 / cell ) );
	const rows = Math.max(
		8,
		Math.round( ( cols * source.height ) / source.width )
	);
	return { cols, rows };
};

// Deterministic per-cell jitter.
const cellRand = ( x, y, k ) => {
	const n = Math.sin( x * 127.1 + y * 311.7 + k * 74.7 ) * 43758.5453;
	return n - Math.floor( n );
};

const redmean = ( p, b ) => {
	const rm = ( p[ 0 ] + b[ 0 ] ) / 2;
	return (
		( 2 + rm / 256 ) * ( p[ 0 ] - b[ 0 ] ) ** 2 +
		4 * ( p[ 1 ] - b[ 1 ] ) ** 2 +
		( 2 + ( 255 - rm ) / 256 ) * ( p[ 2 ] - b[ 2 ] ) ** 2
	);
};

const nearestOf = ( p, palette ) => {
	let best = 0;
	let bs = Infinity;
	for ( let i = 0; i < palette.length; i++ ) {
		const s = redmean( p, palette[ i ] );
		if ( s < bs ) {
			bs = s;
			best = i;
		}
	}
	return palette[ best ];
};

const roundedRect = ( g, x, y, w, h, r ) => {
	g.beginPath();
	g.moveTo( x + r, y );
	g.arcTo( x + w, y, x + w, y + h, r );
	g.arcTo( x + w, y + h, x, y + h, r );
	g.arcTo( x, y + h, x, y, r );
	g.arcTo( x, y, x + w, y, r );
	g.closePath();
};

/* --------------------------------- dice art ------------------------------- */

const PIPS = {
	1: [ [ 0.5, 0.5 ] ],
	2: [
		[ 0.28, 0.28 ],
		[ 0.72, 0.72 ],
	],
	3: [
		[ 0.26, 0.26 ],
		[ 0.5, 0.5 ],
		[ 0.74, 0.74 ],
	],
	4: [
		[ 0.28, 0.28 ],
		[ 0.72, 0.28 ],
		[ 0.28, 0.72 ],
		[ 0.72, 0.72 ],
	],
	5: [
		[ 0.26, 0.26 ],
		[ 0.74, 0.26 ],
		[ 0.5, 0.5 ],
		[ 0.26, 0.74 ],
		[ 0.74, 0.74 ],
	],
	6: [
		[ 0.28, 0.24 ],
		[ 0.72, 0.24 ],
		[ 0.28, 0.5 ],
		[ 0.72, 0.5 ],
		[ 0.28, 0.76 ],
		[ 0.72, 0.76 ],
	],
};

/**
 * Dice art: brightness becomes pip counts on white and black dice
 * (12 gray levels with the mixed set, 6 with a single color).
 *
 * @param {Object}            like   Canvas-like.
 * @param {HTMLCanvasElement} source Source canvas.
 * @param {Object}            opts   { cell, mix 'both'|'white'|'black',
 *                                     background }.
 * @return {HTMLCanvasElement}
 */
export function renderDiceArt( like, source, opts = {} ) {
	const cell = Math.max( 14, Math.min( 44, opts.cell || 24 ) );
	const { cols, rows } = gridFor( source, cell );
	const smp = makeSampler( like, source, cols, rows );
	const c = makeCanvas( like, cols * cell, rows * cell );
	const g = c.getContext( '2d' );
	g.fillStyle = BG[ 'light' === opts.background ? 'light' : 'dark' ];
	g.fillRect( 0, 0, c.width, c.height );
	const mix = opts.mix || 'both';
	for ( let y = 0; y < rows; y++ ) {
		for ( let x = 0; x < cols; x++ ) {
			const lum = lumOf( smp.pix( x, y ) ) / 255;
			let white = true;
			let pips = 1;
			if ( 'both' === mix ) {
				// Bright -> white die few pips ... dark -> black die few pips.
				const lv = Math.min( 11, ( ( 1 - lum ) * 12 ) | 0 );
				white = lv < 6;
				pips = white ? lv + 1 : 6 - ( lv - 6 );
			} else {
				white = 'white' === mix;
				const lv = Math.min( 5, ( ( white ? 1 - lum : lum ) * 6 ) | 0 );
				pips = lv + 1;
			}
			const pad = cell * 0.06;
			const size = cell - 2 * pad;
			const bx = x * cell + pad;
			const by = y * cell + pad;
			g.fillStyle = white ? '#f1f1ee' : '#17181d';
			roundedRect( g, bx, by, size, size, size * 0.2 );
			g.fill();
			g.strokeStyle = white
				? 'rgba(0,0,0,0.25)'
				: 'rgba(255,255,255,0.14)';
			g.lineWidth = Math.max( 1, cell * 0.03 );
			g.stroke();
			g.fillStyle = white ? '#22242a' : '#e9e9e4';
			const pr = size * 0.09;
			for ( const [ px, py ] of PIPS[ pips ] ) {
				g.beginPath();
				g.arc( bx + px * size, by + py * size, pr, 0, Math.PI * 2 );
				g.fill();
			}
		}
	}
	return c;
}

/* --------------------------------- cube art ------------------------------- */

const CUBE_COLORS = [
	[ 255, 255, 255 ],
	[ 255, 213, 0 ],
	[ 183, 18, 52 ],
	[ 255, 88, 0 ],
	[ 0, 155, 72 ],
	[ 0, 70, 173 ],
];

/**
 * Magic-cube mosaic: every cell is one sticker (6 face colors), a bold
 * black grid separates the 3x3 cube faces.
 *
 * @param {Object}            like   Canvas-like.
 * @param {HTMLCanvasElement} source Source canvas.
 * @param {Object}            opts   { cell (sticker px) }.
 * @return {HTMLCanvasElement}
 */
export function renderCubeArt( like, source, opts = {} ) {
	const cell = Math.max( 8, Math.min( 26, opts.cell || 14 ) );
	let { cols, rows } = gridFor( source, cell );
	cols = Math.max( 9, Math.round( cols / 3 ) * 3 );
	rows = Math.max( 9, Math.round( rows / 3 ) * 3 );
	const smp = makeSampler( like, source, cols, rows );
	const c = makeCanvas( like, cols * cell, rows * cell );
	const g = c.getContext( '2d' );
	g.fillStyle = '#0b0b0d';
	g.fillRect( 0, 0, c.width, c.height );
	for ( let y = 0; y < rows; y++ ) {
		for ( let x = 0; x < cols; x++ ) {
			const col = nearestOf( smp.pix( x, y ), CUBE_COLORS );
			const pad = cell * 0.07;
			g.fillStyle = `rgb(${ col[ 0 ] },${ col[ 1 ] },${ col[ 2 ] })`;
			roundedRect(
				g,
				x * cell + pad,
				y * cell + pad,
				cell - 2 * pad,
				cell - 2 * pad,
				cell * 0.16
			);
			g.fill();
			g.fillStyle = 'rgba(255,255,255,0.18)';
			roundedRect(
				g,
				x * cell + pad,
				y * cell + pad,
				cell - 2 * pad,
				( cell - 2 * pad ) * 0.28,
				cell * 0.14
			);
			g.fill();
		}
	}
	// Face separators.
	g.strokeStyle = '#0b0b0d';
	g.lineWidth = Math.max( 2, cell * 0.22 );
	for ( let x = 0; x <= cols; x += 3 ) {
		g.beginPath();
		g.moveTo( x * cell, 0 );
		g.lineTo( x * cell, c.height );
		g.stroke();
	}
	for ( let y = 0; y <= rows; y += 3 ) {
		g.beginPath();
		g.moveTo( 0, y * cell );
		g.lineTo( c.width, y * cell );
		g.stroke();
	}
	return c;
}

/* ------------------------------- sticky notes ------------------------------ */

const NOTE_COLORS = [
	[ 255, 233, 77 ],
	[ 255, 179, 46 ],
	[ 255, 138, 92 ],
	[ 255, 126, 179 ],
	[ 199, 139, 250 ],
	[ 124, 198, 254 ],
	[ 74, 144, 217 ],
	[ 94, 230, 168 ],
	[ 201, 242, 77 ],
	[ 244, 244, 240 ],
	[ 74, 78, 87 ],
];

/**
 * Sticky-note wall: square notes in neon pastels, seeded rotation and
 * a soft drop shadow - the office-window mural look.
 *
 * @param {Object}            like   Canvas-like.
 * @param {HTMLCanvasElement} source Source canvas.
 * @param {Object}            opts   { cell, background }.
 * @return {HTMLCanvasElement}
 */
export function renderStickyNotes( like, source, opts = {} ) {
	const cell = Math.max( 14, Math.min( 48, opts.cell || 26 ) );
	const { cols, rows } = gridFor( source, cell );
	const smp = makeSampler( like, source, cols, rows );
	const c = makeCanvas( like, cols * cell, rows * cell );
	const g = c.getContext( '2d' );
	g.fillStyle = 'light' === opts.background ? '#e8e6e1' : '#272a30';
	g.fillRect( 0, 0, c.width, c.height );
	for ( let y = 0; y < rows; y++ ) {
		for ( let x = 0; x < cols; x++ ) {
			const col = nearestOf( smp.pix( x, y ), NOTE_COLORS );
			const shade = 0.92 + cellRand( x, y, 3 ) * 0.14;
			const rot = ( cellRand( x, y, 7 ) - 0.5 ) * 0.16;
			const size = cell * 0.94;
			g.save();
			g.translate( x * cell + cell / 2, y * cell + cell / 2 );
			g.rotate( rot );
			g.shadowColor = 'rgba(0,0,0,0.3)';
			g.shadowBlur = cell * 0.14;
			g.shadowOffsetY = cell * 0.07;
			g.fillStyle = `rgb(${ ( col[ 0 ] * shade ) | 0 },${
				( col[ 1 ] * shade ) | 0
			},${ ( col[ 2 ] * shade ) | 0 })`;
			g.fillRect( -size / 2, -size / 2, size, size );
			g.shadowColor = 'transparent';
			// Slightly lighter top strip (the glue edge).
			g.fillStyle = 'rgba(255,255,255,0.16)';
			g.fillRect( -size / 2, -size / 2, size, size * 0.16 );
			g.restore();
		}
	}
	return c;
}

/* -------------------------------- dot matrix ------------------------------- */

const BAYER4 = [ 0.2, 0.8, 0.6, 0.4 ];

/**
 * Retro display dots: LED wall (glowing color), flip-dot (two-level
 * discs with ordered dithering) or pegboard (translucent bright pegs).
 *
 * @param {Object}            like   Canvas-like.
 * @param {HTMLCanvasElement} source Source canvas.
 * @param {Object}            opts   { cell, style 'led'|'flip'|'peg',
 *                                     contrast }.
 * @return {HTMLCanvasElement}
 */
export function renderDotMatrix( like, source, opts = {} ) {
	const cell = Math.max( 10, Math.min( 30, opts.cell || 16 ) );
	const { cols, rows } = gridFor( source, cell );
	const smp = makeSampler( like, source, cols, rows );
	const c = makeCanvas( like, cols * cell, rows * cell );
	const g = c.getContext( '2d' );
	const style = opts.style || 'led';
	g.fillStyle = 'flip' === style ? '#101010' : '#0a0c10';
	g.fillRect( 0, 0, c.width, c.height );
	for ( let y = 0; y < rows; y++ ) {
		for ( let x = 0; x < cols; x++ ) {
			const p = smp.pix( x, y );
			const lum = lumOf( p ) / 255;
			const cx = x * cell + cell / 2;
			const cy = y * cell + cell / 2;
			if ( 'flip' === style ) {
				const on = lum > BAYER4[ ( y % 2 ) * 2 + ( x % 2 ) ];
				g.fillStyle = on ? '#ffd23f' : '#1d1d1f';
				g.beginPath();
				g.arc( cx, cy, cell * 0.42, 0, Math.PI * 2 );
				g.fill();
				g.strokeStyle = on
					? 'rgba(0,0,0,0.25)'
					: 'rgba(255,255,255,0.06)';
				g.lineWidth = 1;
				g.stroke();
				continue;
			}
			const col = boostColor( p, 'dark' );
			if ( 'peg' === style ) {
				// Empty hole.
				g.fillStyle = '#060709';
				g.beginPath();
				g.arc( cx, cy, cell * 0.3, 0, Math.PI * 2 );
				g.fill();
				if ( lum < 0.1 ) {
					continue;
				}
				g.fillStyle = `rgba(${ col[ 0 ] | 0 },${ col[ 1 ] | 0 },${
					col[ 2 ] | 0
				},${ 0.45 + lum * 0.55 })`;
				g.beginPath();
				g.arc( cx, cy, cell * 0.34, 0, Math.PI * 2 );
				g.fill();
				g.fillStyle = 'rgba(255,255,255,0.55)';
				g.beginPath();
				g.arc(
					cx - cell * 0.1,
					cy - cell * 0.1,
					cell * 0.07,
					0,
					Math.PI * 2
				);
				g.fill();
				continue;
			}
			// LED.
			g.fillStyle = '#14171c';
			g.beginPath();
			g.arc( cx, cy, cell * 0.4, 0, Math.PI * 2 );
			g.fill();
			const a = 0.2 + lum * 0.8;
			g.shadowColor = `rgb(${ col[ 0 ] | 0 },${ col[ 1 ] | 0 },${
				col[ 2 ] | 0
			})`;
			g.shadowBlur = cell * 0.8 * lum;
			g.fillStyle = `rgba(${ col[ 0 ] | 0 },${ col[ 1 ] | 0 },${
				col[ 2 ] | 0
			},${ a })`;
			g.beginPath();
			g.arc( cx, cy, cell * 0.32, 0, Math.PI * 2 );
			g.fill();
			g.shadowBlur = 0;
		}
	}
	return c;
}

/* ------------------------------ ceramic mosaic ----------------------------- */

/**
 * Ceramic mosaic: irregularly cut tiles with grout between them, the
 * sampled color slightly varied per tile.
 *
 * @param {Object}            like   Canvas-like.
 * @param {HTMLCanvasElement} source Source canvas.
 * @param {Object}            opts   { cell, background }.
 * @return {HTMLCanvasElement}
 */
export function renderCeramicMosaic( like, source, opts = {} ) {
	const cell = Math.max( 12, Math.min( 40, opts.cell || 24 ) );
	const { cols, rows } = gridFor( source, cell );
	const smp = makeSampler( like, source, cols, rows );
	const c = makeCanvas( like, cols * cell, rows * cell );
	const g = c.getContext( '2d' );
	g.fillStyle = 'light' === opts.background ? '#cfc8bc' : '#33363c';
	g.fillRect( 0, 0, c.width, c.height );
	// Shared jittered lattice so neighbouring tiles stay parallel.
	const jx = ( x, y ) =>
		x * cell + ( cellRand( x, y, 11 ) - 0.5 ) * cell * 0.24;
	const jy = ( x, y ) =>
		y * cell + ( cellRand( x, y, 23 ) - 0.5 ) * cell * 0.24;
	for ( let y = 0; y < rows; y++ ) {
		for ( let x = 0; x < cols; x++ ) {
			const p = smp.pix( x, y );
			const v = 0.92 + cellRand( x, y, 5 ) * 0.16;
			const corners = [
				[ jx( x, y ), jy( x, y ) ],
				[ jx( x + 1, y ), jy( x + 1, y ) ],
				[ jx( x + 1, y + 1 ), jy( x + 1, y + 1 ) ],
				[ jx( x, y + 1 ), jy( x, y + 1 ) ],
			];
			// Inset toward the centroid = grout width.
			const mx =
				( corners[ 0 ][ 0 ] +
					corners[ 1 ][ 0 ] +
					corners[ 2 ][ 0 ] +
					corners[ 3 ][ 0 ] ) /
				4;
			const my =
				( corners[ 0 ][ 1 ] +
					corners[ 1 ][ 1 ] +
					corners[ 2 ][ 1 ] +
					corners[ 3 ][ 1 ] ) /
				4;
			g.beginPath();
			corners.forEach( ( [ px, py ], i ) => {
				const ix = mx + ( px - mx ) * 0.88;
				const iy = my + ( py - my ) * 0.88;
				if ( i ) {
					g.lineTo( ix, iy );
				} else {
					g.moveTo( ix, iy );
				}
			} );
			g.closePath();
			g.fillStyle = `rgb(${ clamp255( p[ 0 ] * v ) | 0 },${
				clamp255( p[ 1 ] * v ) | 0
			},${ clamp255( p[ 2 ] * v ) | 0 })`;
			g.fill();
			g.strokeStyle = 'rgba(255,255,255,0.18)';
			g.lineWidth = 1;
			g.stroke();
		}
	}
	return c;
}

/* ------------------------------- marquee wall ------------------------------ */

/**
 * Marquee lights: warm carnival bulbs on a dark metal panel, brightness
 * follows the image - the fairground-sign look the LED wall is too
 * modern for.
 *
 * @param {Object}            like   Canvas-like.
 * @param {HTMLCanvasElement} source Source canvas.
 * @param {Object}            opts   { cell, style 'warm'|'color' }.
 * @return {HTMLCanvasElement}
 */
export function renderMarquee( like, source, opts = {} ) {
	const cell = Math.max( 12, Math.min( 36, opts.cell || 20 ) );
	const { cols, rows } = gridFor( source, cell );
	const smp = makeSampler( like, source, cols, rows );
	const c = makeCanvas( like, cols * cell, rows * cell );
	const g = c.getContext( '2d' );
	g.fillStyle = '#17130f';
	g.fillRect( 0, 0, c.width, c.height );
	for ( let y = 0; y < rows; y++ ) {
		for ( let x = 0; x < cols; x++ ) {
			const p = smp.pix( x, y );
			const lum = lumOf( p ) / 255;
			const cx = x * cell + cell / 2;
			const cy = y * cell + cell / 2;
			// Socket ring, always there.
			g.strokeStyle = '#2e2519';
			g.lineWidth = Math.max( 1, cell * 0.06 );
			g.beginPath();
			g.arc( cx, cy, cell * 0.37, 0, Math.PI * 2 );
			g.stroke();
			let col;
			if ( 'color' === opts.style ) {
				col = boostColor( p, 'dark' );
			} else {
				// Warm ramp: dim amber glass to white-hot.
				col = [ 90 + lum * 165, 60 + lum * 158, 30 + lum * 120 ];
			}
			const a = 0.16 + lum * 0.84;
			g.shadowColor = `rgb(${ col[ 0 ] | 0 },${ col[ 1 ] | 0 },${
				col[ 2 ] | 0
			})`;
			g.shadowBlur = cell * 0.9 * lum;
			g.fillStyle = `rgba(${ col[ 0 ] | 0 },${ col[ 1 ] | 0 },${
				col[ 2 ] | 0
			},${ a })`;
			g.beginPath();
			g.arc( cx, cy, cell * 0.3, 0, Math.PI * 2 );
			g.fill();
			g.shadowBlur = 0;
			// White-hot core on bright bulbs.
			if ( lum > 0.45 ) {
				g.fillStyle = `rgba(255,250,235,${ ( lum - 0.45 ) * 1.4 })`;
				g.beginPath();
				g.arc( cx, cy, cell * 0.13, 0, Math.PI * 2 );
				g.fill();
			}
		}
	}
	return c;
}

/* -------------------------------- stamp wall ------------------------------- */

/**
 * Stamp wall: every cell is a perforated postage stamp carrying its own
 * crop of the picture - a vintage collage that still reads as the image.
 *
 * @param {Object}            like   Canvas-like.
 * @param {HTMLCanvasElement} source Source canvas.
 * @param {Object}            opts   { cell, background }.
 * @return {HTMLCanvasElement}
 */
export function renderStampWall( like, source, opts = {} ) {
	const cell = Math.max( 22, Math.min( 56, opts.cell || 34 ) );
	const { cols, rows } = gridFor( source, cell );
	const c = makeCanvas( like, cols * cell, rows * cell );
	const g = c.getContext( '2d' );
	const wall = 'light' === opts.background ? '#e9e4da' : '#23262c';
	g.fillStyle = wall;
	g.fillRect( 0, 0, c.width, c.height );
	const sw = source.width / cols;
	const sh = source.height / rows;
	for ( let y = 0; y < rows; y++ ) {
		for ( let x = 0; x < cols; x++ ) {
			const rot = ( cellRand( x, y, 13 ) - 0.5 ) * 0.09;
			const size = cell * 0.92;
			g.save();
			g.translate( x * cell + cell / 2, y * cell + cell / 2 );
			g.rotate( rot );
			// Paper with a soft shadow.
			g.shadowColor = 'rgba(0,0,0,0.28)';
			g.shadowBlur = cell * 0.1;
			g.shadowOffsetY = cell * 0.05;
			g.fillStyle = '#f7f4ec';
			g.fillRect( -size / 2, -size / 2, size, size );
			g.shadowColor = 'transparent';
			// Perforation: wall-colored punch holes along the edges.
			g.fillStyle = wall;
			const holes = 6;
			const hr = size * 0.045;
			for ( let k = 0; k <= holes; k++ ) {
				const o = -size / 2 + ( size * k ) / holes;
				for ( const [ hx, hy ] of [
					[ o, -size / 2 ],
					[ o, size / 2 ],
					[ -size / 2, o ],
					[ size / 2, o ],
				] ) {
					g.beginPath();
					g.arc( hx, hy, hr, 0, Math.PI * 2 );
					g.fill();
				}
			}
			// The picture crop inside the frame.
			const inset = size * 0.12;
			const inner = size - 2 * inset;
			g.drawImage(
				source,
				x * sw,
				y * sh,
				sw,
				sh,
				-size / 2 + inset,
				-size / 2 + inset,
				inner,
				inner
			);
			g.restore();
		}
	}
	return c;
}

/* -------------------------------- bottle caps ------------------------------ */

/**
 * Bottle-cap mosaic: crimped caps in the image colors with a glossy
 * highlight - the bar-wall look.
 *
 * @param {Object}            like   Canvas-like.
 * @param {HTMLCanvasElement} source Source canvas.
 * @param {Object}            opts   { cell, background }.
 * @return {HTMLCanvasElement}
 */
export function renderBottleCaps( like, source, opts = {} ) {
	const cell = Math.max( 18, Math.min( 48, opts.cell || 28 ) );
	const { cols, rows } = gridFor( source, cell );
	const smp = makeSampler( like, source, cols, rows );
	const c = makeCanvas( like, cols * cell, rows * cell );
	const g = c.getContext( '2d' );
	g.fillStyle = 'light' === opts.background ? '#ded5c6' : '#241c14';
	g.fillRect( 0, 0, c.width, c.height );
	for ( let y = 0; y < rows; y++ ) {
		for ( let x = 0; x < cols; x++ ) {
			const p = smp.pix( x, y );
			const col = boostColor( p, 'dark' );
			const cx = x * cell + cell / 2;
			const cy = y * cell + cell / 2;
			const r = cell * 0.44;
			const rot = cellRand( x, y, 17 ) * Math.PI;
			g.save();
			g.translate( cx, cy );
			g.rotate( rot );
			g.shadowColor = 'rgba(0,0,0,0.35)';
			g.shadowBlur = cell * 0.08;
			g.shadowOffsetY = cell * 0.04;
			// Crimped rim: alternating radius polygon.
			g.beginPath();
			const teeth = 21;
			for ( let k = 0; k < teeth * 2; k++ ) {
				const rad = k % 2 ? r : r * 0.9;
				const a = ( k * Math.PI ) / teeth;
				const px = Math.cos( a ) * rad;
				const py = Math.sin( a ) * rad;
				if ( k ) {
					g.lineTo( px, py );
				} else {
					g.moveTo( px, py );
				}
			}
			g.closePath();
			g.fillStyle = `rgb(${ clamp255( col[ 0 ] * 0.7 ) | 0 },${
				clamp255( col[ 1 ] * 0.7 ) | 0
			},${ clamp255( col[ 2 ] * 0.7 ) | 0 })`;
			g.fill();
			g.shadowColor = 'transparent';
			// Cap face.
			g.fillStyle = `rgb(${ col[ 0 ] | 0 },${ col[ 1 ] | 0 },${
				col[ 2 ] | 0
			})`;
			g.beginPath();
			g.arc( 0, 0, r * 0.78, 0, Math.PI * 2 );
			g.fill();
			// Gloss.
			g.strokeStyle = 'rgba(255,255,255,0.5)';
			g.lineWidth = Math.max( 1, cell * 0.05 );
			g.beginPath();
			g.arc( 0, 0, r * 0.6, Math.PI * 0.9, Math.PI * 1.55 );
			g.stroke();
			g.fillStyle = 'rgba(255,255,255,0.55)';
			g.beginPath();
			g.arc( -r * 0.3, -r * 0.3, r * 0.09, 0, Math.PI * 2 );
			g.fill();
			g.restore();
		}
	}
	return c;
}

/* -------------------------------- coin mosaic ------------------------------ */

// Six coin finishes, dark to bright: bronze, silver, gold in two shades.
const COIN_TONES = [
	[ 96, 62, 38 ],
	[ 138, 97, 61 ],
	[ 132, 138, 146 ],
	[ 186, 193, 200 ],
	[ 190, 148, 60 ],
	[ 230, 193, 94 ],
];

/**
 * Coin mosaic: brightness picks the metal - bronze in the shadows,
 * silver in the mids, gold in the lights - each coin with rim, reeding
 * and an embossed highlight.
 *
 * @param {Object}            like   Canvas-like.
 * @param {HTMLCanvasElement} source Source canvas.
 * @param {Object}            opts   { cell, background }.
 * @return {HTMLCanvasElement}
 */
export function renderCoinMosaic( like, source, opts = {} ) {
	const cell = Math.max( 16, Math.min( 40, opts.cell || 24 ) );
	const { cols, rows } = gridFor( source, cell );
	const smp = makeSampler( like, source, cols, rows );
	const c = makeCanvas( like, cols * cell, rows * cell );
	const g = c.getContext( '2d' );
	g.fillStyle = 'light' === opts.background ? '#e7e2d2' : '#1d2a20';
	g.fillRect( 0, 0, c.width, c.height );
	for ( let y = 0; y < rows; y++ ) {
		for ( let x = 0; x < cols; x++ ) {
			const lum = lumOf( smp.pix( x, y ) ) / 255;
			const tone =
				COIN_TONES[
					Math.min( COIN_TONES.length - 1, ( lum * 6 ) | 0 )
				];
			const cx = x * cell + cell / 2;
			const cy = y * cell + cell / 2;
			const r = cell * 0.44;
			g.shadowColor = 'rgba(0,0,0,0.3)';
			g.shadowBlur = cell * 0.07;
			g.shadowOffsetY = cell * 0.04;
			g.fillStyle = `rgb(${ tone[ 0 ] },${ tone[ 1 ] },${ tone[ 2 ] })`;
			g.beginPath();
			g.arc( cx, cy, r, 0, Math.PI * 2 );
			g.fill();
			g.shadowColor = 'transparent';
			// Reeded edge.
			g.strokeStyle = `rgba(0,0,0,0.3)`;
			g.lineWidth = Math.max( 1, cell * 0.035 );
			g.setLineDash( [ cell * 0.05, cell * 0.05 ] );
			g.beginPath();
			g.arc( cx, cy, r * 0.94, 0, Math.PI * 2 );
			g.stroke();
			g.setLineDash( [] );
			// Inner relief ring + emboss light.
			g.strokeStyle = 'rgba(0,0,0,0.22)';
			g.lineWidth = Math.max( 1, cell * 0.03 );
			g.beginPath();
			g.arc( cx, cy, r * 0.68, 0, Math.PI * 2 );
			g.stroke();
			g.strokeStyle = 'rgba(255,255,255,0.4)';
			g.beginPath();
			g.arc( cx, cy, r * 0.8, Math.PI * 0.85, Math.PI * 1.6 );
			g.stroke();
		}
	}
	return c;
}

/* ------------------------------- button mosaic ----------------------------- */

/**
 * Button mosaic: sewing buttons in softened image colors, four holes
 * and a thread cross, on fabric.
 *
 * @param {Object}            like   Canvas-like.
 * @param {HTMLCanvasElement} source Source canvas.
 * @param {Object}            opts   { cell, background }.
 * @return {HTMLCanvasElement}
 */
export function renderButtonMosaic( like, source, opts = {} ) {
	const cell = Math.max( 16, Math.min( 44, opts.cell || 26 ) );
	const { cols, rows } = gridFor( source, cell );
	const smp = makeSampler( like, source, cols, rows );
	const c = makeCanvas( like, cols * cell, rows * cell );
	const g = c.getContext( '2d' );
	g.fillStyle = 'light' === opts.background ? '#efe9df' : '#2a2d33';
	g.fillRect( 0, 0, c.width, c.height );
	for ( let y = 0; y < rows; y++ ) {
		for ( let x = 0; x < cols; x++ ) {
			const p = smp.pix( x, y );
			const m = ( p[ 0 ] + p[ 1 ] + p[ 2 ] ) / 3;
			const col = p
				.slice( 0, 3 )
				.map( ( v ) => clamp255( m + ( v - m ) * 0.85 ) | 0 );
			const cx = x * cell + cell / 2;
			const cy = y * cell + cell / 2;
			const r = cell * 0.43;
			g.shadowColor = 'rgba(0,0,0,0.25)';
			g.shadowBlur = cell * 0.07;
			g.shadowOffsetY = cell * 0.04;
			g.fillStyle = `rgb(${ col[ 0 ] },${ col[ 1 ] },${ col[ 2 ] })`;
			g.beginPath();
			g.arc( cx, cy, r, 0, Math.PI * 2 );
			g.fill();
			g.shadowColor = 'transparent';
			// Recessed center.
			g.strokeStyle = 'rgba(0,0,0,0.2)';
			g.lineWidth = Math.max( 1, cell * 0.04 );
			g.beginPath();
			g.arc( cx, cy, r * 0.68, 0, Math.PI * 2 );
			g.stroke();
			g.strokeStyle = 'rgba(255,255,255,0.35)';
			g.beginPath();
			g.arc( cx, cy, r * 0.86, Math.PI * 0.85, Math.PI * 1.6 );
			g.stroke();
			// Four holes + thread.
			const ho = r * 0.26;
			const holes = [
				[ -ho, -ho ],
				[ ho, -ho ],
				[ -ho, ho ],
				[ ho, ho ],
			];
			g.fillStyle = 'rgba(0,0,0,0.45)';
			for ( const [ hx, hy ] of holes ) {
				g.beginPath();
				g.arc( cx + hx, cy + hy, r * 0.09, 0, Math.PI * 2 );
				g.fill();
			}
			const lum = lumOf( col );
			g.strokeStyle =
				lum > 150 ? 'rgba(60,55,48,0.6)' : 'rgba(240,236,226,0.6)';
			g.lineWidth = Math.max( 1, cell * 0.05 );
			if ( cellRand( x, y, 29 ) > 0.5 ) {
				g.beginPath();
				g.moveTo( cx - ho, cy - ho );
				g.lineTo( cx + ho, cy + ho );
				g.moveTo( cx + ho, cy - ho );
				g.lineTo( cx - ho, cy + ho );
				g.stroke();
			} else {
				g.beginPath();
				g.moveTo( cx - ho, cy - ho );
				g.lineTo( cx + ho, cy - ho );
				g.moveTo( cx - ho, cy + ho );
				g.lineTo( cx + ho, cy + ho );
				g.stroke();
			}
		}
	}
	return c;
}

/* -------------------------------- domino art ------------------------------- */

const PIPS7 = { 0: [], ...PIPS };

/**
 * Domino art: 2x1 stones in a running bond, each half carrying 0-6 pips
 * for its brightness - the domino-day mosaic look.
 *
 * @param {Object}            like   Canvas-like.
 * @param {HTMLCanvasElement} source Source canvas.
 * @param {Object}            opts   { cell (half size), stoneStyle
 *                                     'black'|'white'|'both', background }.
 * @return {HTMLCanvasElement}
 */
export function renderDominoArt( like, source, opts = {} ) {
	const cell = Math.max( 14, Math.min( 40, opts.cell || 22 ) );
	let { cols, rows } = gridFor( source, cell );
	cols = Math.max( 8, Math.round( cols / 2 ) * 2 );
	rows = Math.max( 8, rows );
	const smp = makeSampler( like, source, cols, rows );
	const c = makeCanvas( like, cols * cell, rows * cell );
	const g = c.getContext( '2d' );
	g.fillStyle = 'light' === opts.background ? '#ddd6c8' : '#101216';
	g.fillRect( 0, 0, c.width, c.height );
	const style = opts.stoneStyle || 'black';
	const halfPips = ( lum, white ) =>
		Math.max( 0, Math.min( 6, ( ( white ? lum : 1 - lum ) * 7 ) | 0 ) );
	for ( let y = 0; y < rows; y++ ) {
		// Running bond: odd rows shift by one half stone.
		const off = y % 2 ? -1 : 0;
		for ( let sx = off; sx < cols; sx += 2 ) {
			const lumA = lumOf( smp.pix( Math.max( 0, sx ), y ) ) / 255;
			const lumB =
				lumOf( smp.pix( Math.min( cols - 1, sx + 1 ), y ) ) / 255;
			let white = 'white' === style;
			if ( 'both' === style ) {
				white = ( lumA + lumB ) / 2 > 0.5;
			}
			const bx = sx * cell;
			const by = y * cell;
			const pad = cell * 0.05;
			const w = cell * 2 - 2 * pad;
			const h = cell - 2 * pad;
			g.fillStyle = white ? '#f1efe8' : '#191a1f';
			roundedRect( g, bx + pad, by + pad, w, h, cell * 0.16 );
			g.fill();
			g.strokeStyle = white
				? 'rgba(0,0,0,0.28)'
				: 'rgba(255,255,255,0.14)';
			g.lineWidth = Math.max( 1, cell * 0.04 );
			g.stroke();
			// Divider.
			g.beginPath();
			g.moveTo( bx + cell, by + pad + h * 0.12 );
			g.lineTo( bx + cell, by + pad + h * 0.88 );
			g.stroke();
			// Pips per half - inner-range quantization when mixed.
			let pa = halfPips( lumA, white );
			let pb = halfPips( lumB, white );
			if ( 'both' === style ) {
				pa = Math.max(
					0,
					Math.min(
						6,
						( ( white ? lumA - 0.5 : 0.5 - lumA ) * 14 ) | 0
					)
				);
				pb = Math.max(
					0,
					Math.min(
						6,
						( ( white ? lumB - 0.5 : 0.5 - lumB ) * 14 ) | 0
					)
				);
			}
			g.fillStyle = white ? '#20222a' : '#e9e8e2';
			const pr = h * 0.09;
			for ( const [ half, pips ] of [
				[ 0, pa ],
				[ 1, pb ],
			] ) {
				for ( const [ px, py ] of PIPS7[ pips ] ) {
					g.beginPath();
					g.arc(
						bx + pad + half * cell + px * ( cell - 2 * pad ),
						by + pad + py * h,
						pr,
						0,
						Math.PI * 2
					);
					g.fill();
				}
			}
		}
	}
	return c;
}

/* -------------------------------- tile mosaic ------------------------------ */

/**
 * Your own tile: any layer of the document (a logo!) becomes the mosaic
 * stone, tinted per cell toward the image color. Tinting happens on a
 * scratch canvas per cell - compositing only, no per-cell readbacks.
 *
 * @param {Object}            like   Canvas-like.
 * @param {HTMLCanvasElement} source Source canvas.
 * @param {HTMLCanvasElement} tile   The tile artwork (cropped, small).
 * @param {Object}            opts   { cell, tint 0..100, jitter,
 *                                     background }.
 * @return {HTMLCanvasElement|null}
 */
export function renderTileMosaic( like, source, tile, opts = {} ) {
	if ( ! tile || ! tile.width || ! tile.height ) {
		return null;
	}
	const cell = Math.max( 12, Math.min( 48, opts.cell || 24 ) );
	const { cols, rows } = gridFor( source, cell );
	const smp = makeSampler( like, source, cols, rows );
	const c = makeCanvas( like, cols * cell, rows * cell );
	const g = c.getContext( '2d' );
	g.fillStyle = 'light' === opts.background ? '#f2efe9' : '#14161a';
	g.fillRect( 0, 0, c.width, c.height );
	const tint = Math.max( 0, Math.min( 100, opts.tint ?? 65 ) ) / 100;
	// The tile once, scaled to cell size (aspect kept).
	const k = Math.min( ( cell - 2 ) / tile.width, ( cell - 2 ) / tile.height );
	const tw = Math.max( 1, Math.round( tile.width * k ) );
	const th = Math.max( 1, Math.round( tile.height * k ) );
	const scratch = makeCanvas( like, cell, cell );
	const sg = scratch.getContext( '2d' );
	for ( let y = 0; y < rows; y++ ) {
		for ( let x = 0; x < cols; x++ ) {
			const p = smp.pix( x, y );
			sg.clearRect( 0, 0, cell, cell );
			sg.globalCompositeOperation = 'source-over';
			sg.drawImage( tile, ( cell - tw ) / 2, ( cell - th ) / 2, tw, th );
			if ( tint > 0 ) {
				sg.globalCompositeOperation = 'source-atop';
				sg.fillStyle = `rgba(${ p[ 0 ] },${ p[ 1 ] },${ p[ 2 ] },${ tint })`;
				sg.fillRect( 0, 0, cell, cell );
			}
			if ( opts.jitter ) {
				const rot = ( cellRand( x, y, 19 ) - 0.5 ) * 0.3;
				g.save();
				g.translate( x * cell + cell / 2, y * cell + cell / 2 );
				g.rotate( rot );
				g.drawImage( scratch, -cell / 2, -cell / 2 );
				g.restore();
			} else {
				g.drawImage( scratch, x * cell, y * cell );
			}
		}
	}
	return c;
}

/* -------------------------------- keycap art ------------------------------- */

/**
 * Keycap art: every cell is a keyboard cap in the image color, the
 * legend letters cycle through the user text (or a seeded A-Z).
 *
 * @param {Object}            like   Canvas-like.
 * @param {HTMLCanvasElement} source Source canvas.
 * @param {Object}            opts   { cell, text }.
 * @return {HTMLCanvasElement}
 */
export function renderKeycapArt( like, source, opts = {} ) {
	const cell = Math.max( 18, Math.min( 48, opts.cell || 28 ) );
	const { cols, rows } = gridFor( source, cell );
	const smp = makeSampler( like, source, cols, rows );
	const c = makeCanvas( like, cols * cell, rows * cell );
	const g = c.getContext( '2d' );
	g.fillStyle = '#191b20';
	g.fillRect( 0, 0, c.width, c.height );
	const legend = String( opts.text || '' )
		.replace( /\s+/g, '' )
		.toUpperCase();
	const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
	let li = 0;
	for ( let y = 0; y < rows; y++ ) {
		for ( let x = 0; x < cols; x++ ) {
			const p = smp.pix( x, y );
			// Mildly desaturated cap color.
			const m = ( p[ 0 ] + p[ 1 ] + p[ 2 ] ) / 3;
			const col = p.map( ( v ) => ( m + ( v - m ) * 0.8 ) | 0 );
			const pad = cell * 0.05;
			const size = cell - 2 * pad;
			const bx = x * cell + pad;
			const by = y * cell + pad;
			g.fillStyle = `rgb(${ clamp255( col[ 0 ] * 0.72 ) | 0 },${
				clamp255( col[ 1 ] * 0.72 ) | 0
			},${ clamp255( col[ 2 ] * 0.72 ) | 0 })`;
			roundedRect( g, bx, by, size, size, size * 0.18 );
			g.fill();
			// Top surface, shifted up like a real cap.
			g.fillStyle = `rgb(${ col[ 0 ] },${ col[ 1 ] },${ col[ 2 ] })`;
			roundedRect(
				g,
				bx + size * 0.12,
				by + size * 0.08,
				size * 0.76,
				size * 0.72,
				size * 0.14
			);
			g.fill();
			const lum = lumOf( col );
			g.fillStyle =
				lum > 128 ? 'rgba(20,22,28,0.85)' : 'rgba(240,242,246,0.9)';
			g.font = `700 ${ Math.round(
				size * 0.36
			) }px system-ui, sans-serif`;
			g.textAlign = 'center';
			g.textBaseline = 'middle';
			const ch = legend
				? legend[ li++ % legend.length ]
				: AZ[ ( cellRand( x, y, 31 ) * 26 ) | 0 ];
			g.fillText( ch, bx + size * 0.5, by + size * 0.46 );
		}
	}
	return c;
}
