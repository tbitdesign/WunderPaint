/**
 * A compact QR encoder (byte mode, versions 1-10, error level H) and the
 * halftone renderer that hides a photo inside a WORKING code.
 *
 * Why hand-rolled: the plugin ships nothing it does not own, and level H
 * plus the halftone rule below is all this card needs. Scanners sample
 * the CENTER of every module, so each data module keeps a hard
 * black/white core dot while the rest of its area carries the photo,
 * tone-mapped into the safe dark/light bands. Finder, timing, alignment
 * and format zones stay solid - those the decoder reads geometrically.
 *
 * Pure module, node-testable (the matrix math needs no canvas).
 */

/* ------------------------------ GF(256) tables ----------------------------- */

const EXP = new Uint8Array( 512 );
const LOG = new Uint8Array( 256 );
{
	let x = 1;
	for ( let i = 0; i < 255; i++ ) {
		EXP[ i ] = x;
		LOG[ x ] = i;
		x <<= 1;
		if ( x & 0x100 ) {
			x ^= 0x11d;
		}
	}
	for ( let i = 255; i < 512; i++ ) {
		EXP[ i ] = EXP[ i - 255 ];
	}
}

const gfMul = ( a, b ) => ( a && b ? EXP[ LOG[ a ] + LOG[ b ] ] : 0 );

/** Reed-Solomon EC codewords for a data block. */
export function rsEncode( data, ecLen ) {
	// Generator polynomial prod (x - alpha^i).
	let gen = [ 1 ];
	for ( let i = 0; i < ecLen; i++ ) {
		const next = new Array( gen.length + 1 ).fill( 0 );
		for ( let j = 0; j < gen.length; j++ ) {
			next[ j ] ^= gen[ j ];
			next[ j + 1 ] ^= gfMul( gen[ j ], EXP[ i ] );
		}
		gen = next;
	}
	const res = new Uint8Array( data.length + ecLen );
	res.set( data );
	for ( let i = 0; i < data.length; i++ ) {
		const f = res[ i ];
		if ( ! f ) {
			continue;
		}
		for ( let j = 1; j < gen.length; j++ ) {
			res[ i + j ] ^= gfMul( gen[ j ], f );
		}
	}
	return res.slice( data.length );
}

/* ------------------------------ version tables ----------------------------- */

// Level H, versions 1-10: total data codewords, EC per block, blocks as
// [count, dataCodewordsPerBlock].
const H_TABLE = [
	null,
	[ 9, 17, [ [ 1, 9 ] ] ],
	[ 16, 28, [ [ 1, 16 ] ] ],
	[ 26, 22, [ [ 2, 13 ] ] ],
	[ 36, 16, [ [ 4, 9 ] ] ],
	[
		46,
		22,
		[
			[ 2, 11 ],
			[ 2, 12 ],
		],
	],
	[ 60, 28, [ [ 4, 15 ] ] ],
	[
		66,
		26,
		[
			[ 4, 13 ],
			[ 1, 14 ],
		],
	],
	[
		86,
		26,
		[
			[ 4, 14 ],
			[ 2, 15 ],
		],
	],
	[
		100,
		24,
		[
			[ 4, 12 ],
			[ 4, 13 ],
		],
	],
	[
		122,
		28,
		[
			[ 6, 15 ],
			[ 2, 16 ],
		],
	],
];

const ALIGN = [
	null,
	[],
	[ 6, 18 ],
	[ 6, 22 ],
	[ 6, 26 ],
	[ 6, 30 ],
	[ 6, 34 ],
	[ 6, 22, 38 ],
	[ 6, 24, 42 ],
	[ 6, 26, 46 ],
	[ 6, 28, 50 ],
];

// Precomputed 18-bit version information (Golay), versions 7-10.
const VERSION_INFO = { 7: 0x07c94, 8: 0x085bc, 9: 0x09a99, 10: 0x0a4d3 };

/* --------------------------------- encoding -------------------------------- */

const utf8Bytes = ( text ) => {
	if ( 'undefined' !== typeof TextEncoder ) {
		return new TextEncoder().encode( text );
	}
	const out = [];
	for ( const ch of unescape( encodeURIComponent( text ) ) ) {
		out.push( ch.charCodeAt( 0 ) );
	}
	return Uint8Array.from( out );
};

function dataCodewords( bytes, version ) {
	const total = H_TABLE[ version ][ 0 ];
	const bits = [];
	const push = ( val, len ) => {
		for ( let i = len - 1; i >= 0; i-- ) {
			bits.push( ( val >> i ) & 1 );
		}
	};
	push( 4, 4 ); // byte mode
	push( bytes.length, version >= 10 ? 16 : 8 );
	for ( const b of bytes ) {
		push( b, 8 );
	}
	// Terminator + pad to byte + alternating pad codewords.
	push( 0, Math.min( 4, total * 8 - bits.length ) );
	while ( bits.length % 8 ) {
		bits.push( 0 );
	}
	const cw = [];
	for ( let i = 0; i < bits.length; i += 8 ) {
		let v = 0;
		for ( let j = 0; j < 8; j++ ) {
			v = ( v << 1 ) | bits[ i + j ];
		}
		cw.push( v );
	}
	const pads = [ 0xec, 0x11 ];
	let pi = 0;
	while ( cw.length < total ) {
		cw.push( pads[ pi++ % 2 ] );
	}
	return Uint8Array.from( cw );
}

function interleave( cw, version ) {
	const [ , ecLen, groups ] = H_TABLE[ version ];
	const blocks = [];
	let o = 0;
	for ( const [ count, dlen ] of groups ) {
		for ( let i = 0; i < count; i++ ) {
			const data = cw.slice( o, o + dlen );
			o += dlen;
			blocks.push( { data, ec: rsEncode( data, ecLen ) } );
		}
	}
	const out = [];
	const maxD = Math.max( ...blocks.map( ( b ) => b.data.length ) );
	for ( let i = 0; i < maxD; i++ ) {
		for ( const b of blocks ) {
			if ( i < b.data.length ) {
				out.push( b.data[ i ] );
			}
		}
	}
	for ( let i = 0; i < ecLen; i++ ) {
		for ( const b of blocks ) {
			out.push( b.ec[ i ] );
		}
	}
	return out;
}

/* ---------------------------------- matrix --------------------------------- */

const MASKS = [
	( y, x ) => ( y + x ) % 2 === 0,
	( y ) => y % 2 === 0,
	( y, x ) => x % 3 === 0,
	( y, x ) => ( y + x ) % 3 === 0,
	( y, x ) => ( ( ( y / 2 ) | 0 ) + ( ( x / 3 ) | 0 ) ) % 2 === 0,
	( y, x ) => ( ( y * x ) % 2 ) + ( ( y * x ) % 3 ) === 0,
	( y, x ) => ( ( ( y * x ) % 2 ) + ( ( y * x ) % 3 ) ) % 2 === 0,
	( y, x ) => ( ( ( y * x ) % 3 ) + ( ( y + x ) % 2 ) ) % 2 === 0,
];

function bchFormat( eclMaskBits ) {
	const G = 0x537;
	let d = eclMaskBits << 10;
	const digit = ( v ) => 32 - Math.clz32( v );
	while ( digit( d ) >= digit( G ) ) {
		d ^= G << ( digit( d ) - digit( G ) );
	}
	return ( ( eclMaskBits << 10 ) | d ) ^ 0x5412;
}

function buildMatrix( version, codewords, maskId ) {
	const size = 17 + 4 * version;
	const mod = new Uint8Array( size * size );
	const fun = new Uint8Array( size * size );
	const set = ( x, y, v ) => {
		mod[ y * size + x ] = v ? 1 : 0;
		fun[ y * size + x ] = 1;
	};
	// Finders + separators.
	const finder = ( fx, fy ) => {
		for ( let y = -1; y <= 7; y++ ) {
			for ( let x = -1; x <= 7; x++ ) {
				const px = fx + x;
				const py = fy + y;
				if ( px < 0 || py < 0 || px >= size || py >= size ) {
					continue;
				}
				const inRing =
					x >= 0 &&
					x <= 6 &&
					y >= 0 &&
					y <= 6 &&
					( 0 === x || 6 === x || 0 === y || 6 === y );
				const inCore = x >= 2 && x <= 4 && y >= 2 && y <= 4;
				set( px, py, inRing || inCore );
			}
		}
	};
	finder( 0, 0 );
	finder( size - 7, 0 );
	finder( 0, size - 7 );
	// Timing.
	for ( let i = 8; i < size - 8; i++ ) {
		if ( ! fun[ 6 * size + i ] ) {
			set( i, 6, i % 2 === 0 );
		}
		if ( ! fun[ i * size + 6 ] ) {
			set( 6, i, i % 2 === 0 );
		}
	}
	// Alignment patterns.
	const pos = ALIGN[ version ];
	for ( const cy of pos ) {
		for ( const cx of pos ) {
			if ( fun[ cy * size + cx ] ) {
				continue; // overlaps a finder
			}
			for ( let y = -2; y <= 2; y++ ) {
				for ( let x = -2; x <= 2; x++ ) {
					set(
						cx + x,
						cy + y,
						2 === Math.max( Math.abs( x ), Math.abs( y ) ) ||
							( 0 === x && 0 === y )
					);
				}
			}
		}
	}
	// Reserve format areas (values come later).
	for ( let i = 0; i < 9; i++ ) {
		if ( i < size ) {
			fun[ 8 * size + i ] = 1;
			fun[ i * size + 8 ] = 1;
		}
	}
	for ( let i = 0; i < 8; i++ ) {
		fun[ 8 * size + ( size - 1 - i ) ] = 1;
		fun[ ( size - 1 - i ) * size + 8 ] = 1;
	}
	// Version info (7+).
	if ( version >= 7 ) {
		const bits = VERSION_INFO[ version ];
		for ( let i = 0; i < 18; i++ ) {
			const v = ( bits >> i ) & 1;
			set( ( i / 3 ) | 0, ( i % 3 ) + size - 11, v );
			set( ( i % 3 ) + size - 11, ( i / 3 ) | 0, v );
		}
	}
	// Dark module.
	set( 8, size - 8, 1 );
	// Data, zigzag from the bottom right, masked as we go.
	const mask = MASKS[ maskId ];
	let bitIdx = 0;
	const totalBits = codewords.length * 8;
	const bitAt = ( i ) =>
		i < totalBits ? ( codewords[ i >> 3 ] >> ( 7 - ( i & 7 ) ) ) & 1 : 0;
	let up = true;
	for ( let x = size - 1; x > 0; x -= 2 ) {
		if ( 6 === x ) {
			x--;
		}
		for ( let k = 0; k < size; k++ ) {
			const y = up ? size - 1 - k : k;
			for ( const xx of [ x, x - 1 ] ) {
				if ( fun[ y * size + xx ] ) {
					continue;
				}
				let v = bitAt( bitIdx++ );
				if ( mask( y, xx ) ) {
					v ^= 1;
				}
				mod[ y * size + xx ] = v;
			}
		}
		up = ! up;
	}
	// Format info: ECL H (bits 10) + mask, BCH-protected, two copies.
	const fmt = bchFormat( ( 2 << 3 ) | maskId );
	for ( let i = 0; i < 15; i++ ) {
		const v = ( fmt >> i ) & 1;
		// Vertical copy next to the top-left finder.
		if ( i < 6 ) {
			set( 8, i, v );
		} else if ( i < 8 ) {
			set( 8, i + 1, v );
		} else {
			set( 8, size - 15 + i, v );
		}
		// Horizontal copy.
		if ( i < 8 ) {
			set( size - 1 - i, 8, v );
		} else if ( i < 9 ) {
			set( 7, 8, v );
		} else {
			set( 14 - i, 8, v );
		}
	}
	return { size, mod, fun };
}

function penalty( m ) {
	const { size, mod } = m;
	const at = ( x, y ) => mod[ y * size + x ];
	let score = 0;
	// N1: runs of 5+ same-colored modules.
	for ( let pass = 0; pass < 2; pass++ ) {
		for ( let a = 0; a < size; a++ ) {
			let run = 1;
			let last = -1;
			for ( let b = 0; b < size; b++ ) {
				const v = pass ? at( a, b ) : at( b, a );
				if ( v === last ) {
					run++;
				} else {
					if ( run >= 5 ) {
						score += 3 + run - 5;
					}
					run = 1;
					last = v;
				}
			}
			if ( run >= 5 ) {
				score += 3 + run - 5;
			}
		}
	}
	// N2: 2x2 blocks.
	for ( let y = 0; y < size - 1; y++ ) {
		for ( let x = 0; x < size - 1; x++ ) {
			const v = at( x, y );
			if (
				v === at( x + 1, y ) &&
				v === at( x, y + 1 ) &&
				v === at( x + 1, y + 1 )
			) {
				score += 3;
			}
		}
	}
	// N3: finder-like 1011101 with 4 light modules on a side.
	const pat = [ 1, 0, 1, 1, 1, 0, 1 ];
	const quiet = [ 0, 0, 0, 0 ];
	const checkRun = ( get, len ) => {
		for ( let i = 0; i + 11 <= len; i++ ) {
			let a = true;
			let b = true;
			for ( let k = 0; k < 4; k++ ) {
				if ( get( i + k ) !== quiet[ k ] ) {
					a = false;
				}
				if ( get( i + 7 + k ) !== quiet[ k ] ) {
					b = false;
				}
			}
			if ( a ) {
				for ( let k = 0; k < 7; k++ ) {
					if ( get( i + 4 + k ) !== pat[ k ] ) {
						a = false;
						break;
					}
				}
			}
			if ( b ) {
				for ( let k = 0; k < 7; k++ ) {
					if ( get( i + k ) !== pat[ k ] ) {
						b = false;
						break;
					}
				}
			}
			if ( a || b ) {
				score += 40;
			}
		}
	};
	for ( let y = 0; y < size; y++ ) {
		checkRun( ( i ) => at( i, y ), size );
	}
	for ( let x = 0; x < size; x++ ) {
		checkRun( ( i ) => at( x, i ), size );
	}
	// N4: dark-module balance.
	let darkN = 0;
	for ( let i = 0; i < size * size; i++ ) {
		darkN += mod[ i ];
	}
	score +=
		10 *
		Math.floor( Math.abs( ( darkN * 100 ) / ( size * size ) - 50 ) / 5 );
	return score;
}

/**
 * Encode text as a level-H QR matrix (best of the eight masks).
 *
 * @param {string} text Content (URL or words), UTF-8.
 * @return {Object|null} { size, mod, fun, version } or null when the
 *                       text exceeds version 10 at level H (~119 bytes).
 */
export function encodeQR( text ) {
	const bytes = utf8Bytes( String( text || '' ) );
	if ( ! bytes.length ) {
		return null;
	}
	let version = 0;
	for ( let v = 1; v <= 10; v++ ) {
		const head = 4 + ( v >= 10 ? 16 : 8 );
		if ( bytes.length * 8 + head <= H_TABLE[ v ][ 0 ] * 8 ) {
			version = v;
			break;
		}
	}
	if ( ! version ) {
		return null;
	}
	const cw = interleave( dataCodewords( bytes, version ), version );
	let best = null;
	let bestScore = Infinity;
	for ( let mask = 0; mask < 8; mask++ ) {
		const m = buildMatrix( version, cw, mask );
		const s = penalty( m );
		if ( s < bestScore ) {
			bestScore = s;
			best = m;
		}
	}
	return { ...best, version };
}

/* ------------------------------ halftone render ---------------------------- */

const makeCanvas = ( like, w, h ) => {
	const c =
		'undefined' !== typeof document
			? document.createElement( 'canvas' )
			: new like.constructor( w, h );
	c.width = w;
	c.height = h;
	return c;
};

/**
 * QR portrait: the photo lives in the outer area of every data module,
 * tone-mapped into safe dark/light bands; the module's center third and
 * all function zones stay hard - that is what the scanner reads.
 *
 * @param {Object}            like   Canvas-like.
 * @param {HTMLCanvasElement} source Source canvas (may be null: plain QR).
 * @param {Object}            opts   { text, cell (module px), photo
 *                                     0..100, round }.
 * @return {HTMLCanvasElement|null} null when the text does not fit.
 */
export function renderQrPortrait( like, source, opts = {} ) {
	const q = encodeQR( opts.text || '' );
	if ( ! q ) {
		return null;
	}
	const m = Math.max( 10, Math.min( 30, opts.cell || 18 ) );
	const quiet = 4;
	const { size, mod, fun } = q;
	const W = ( size + 2 * quiet ) * m;
	const c = makeCanvas( like, W, W );
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, W, W );
	const DARK = '#101318';
	// Per-module photo color: the source cover-fitted onto the code area.
	let pix = null;
	const photo = Math.max( 0, Math.min( 100, opts.photo ?? 70 ) ) / 100;
	if ( source && photo > 0 ) {
		const sc = makeCanvas( like, size, size );
		const sg = sc.getContext( '2d' );
		const k = Math.max( size / source.width, size / source.height );
		sg.drawImage(
			source,
			( size - source.width * k ) / 2,
			( size - source.height * k ) / 2,
			source.width * k,
			source.height * k
		);
		pix = sg.getImageData( 0, 0, size, size ).data;
	}
	const toned = ( x, y, dark ) => {
		if ( ! pix ) {
			return dark ? DARK : '#ffffff';
		}
		const i = ( y * size + x ) * 4;
		const r = pix[ i ];
		const gg = pix[ i + 1 ];
		const b = pix[ i + 2 ];
		const lum = ( 0.299 * r + 0.587 * gg + 0.114 * b ) / 255;
		// Tone-map into the safe band for this module color.
		const target = dark ? 0.06 + lum * 0.3 : 0.62 + lum * 0.36;
		const s = lum > 0.02 ? target / lum : target;
		const mix = ( v ) => {
			const banded = Math.max( 0, Math.min( 255, v * s ) );
			const pure = dark ? 16 : 255;
			return ( pure + ( banded - pure ) * photo ) | 0;
		};
		return `rgb(${ mix( r ) },${ mix( gg ) },${ mix( b ) })`;
	};
	for ( let y = 0; y < size; y++ ) {
		for ( let x = 0; x < size; x++ ) {
			const dark = 1 === mod[ y * size + x ];
			const px = ( x + quiet ) * m;
			const py = ( y + quiet ) * m;
			if ( fun[ y * size + x ] ) {
				// Function zones: solid, the decoder's anchors.
				if ( dark ) {
					g.fillStyle = DARK;
					g.fillRect( px, py, m, m );
				}
				continue;
			}
			// Data module: photo tone over the full cell...
			g.fillStyle = toned( x, y, dark );
			g.fillRect( px, py, m, m );
			// ...and the hard core the scanner samples.
			g.fillStyle = dark ? DARK : '#ffffff';
			if ( opts.round ) {
				g.beginPath();
				g.arc( px + m / 2, py + m / 2, m * 0.26, 0, Math.PI * 2 );
				g.fill();
			} else {
				const o = m * 0.3;
				g.fillRect( px + o, py + o, m - 2 * o, m - 2 * o );
			}
		}
	}
	return c;
}
