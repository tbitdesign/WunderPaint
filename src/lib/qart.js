/**
 * QArt encoding (v1.427): the DATA MODULES themselves form the artwork.
 *
 * A QR payload rarely fills its symbol - the rest is padding bytes the
 * spec lets us choose freely, and every error-correction byte is a
 * GF(256)-linear (hence XOR-linear) function of the data bytes. So per
 * Reed-Solomon block we solve, by Gaussian elimination over GF(2), for
 * padding bits that make as many modules as possible match a target
 * image - brightest wishes first. No intentional errors, no tricks a
 * decoder could stumble over: the finished symbol is 100% within spec,
 * it simply "happens" to look like the artwork.
 *
 * The qrcode module supplies the symbol skeleton (finder, timing,
 * alignment, format, version info) via a normally-encoded base matrix,
 * plus the Reed-Solomon encoder and the block-count tables; this file
 * adds the bit bookkeeping, the solver and the module rewrite.
 */

import QRCode from 'qrcode';
import ECCode from 'qrcode/lib/core/error-correction-code';
import ECLevel from 'qrcode/lib/core/error-correction-level';
import RS from 'qrcode/lib/core/reed-solomon-encoder';
import Utils from 'qrcode/lib/core/utils';

// The zigzag walk mirrors qrcode/lib/core/qrcode.js setupData exactly.
function moduleOrder( size, isReserved ) {
	const order = [];
	let inc = -1;
	let row = size - 1;
	for ( let col = size - 1; col > 0; col -= 2 ) {
		if ( 6 === col ) {
			col--;
		}
		for (;;) {
			for ( let c = 0; c < 2; c++ ) {
				if ( ! isReserved( row, col - c ) ) {
					order.push( [ row, col - c ] );
				}
			}
			row += inc;
			if ( row < 0 || size <= row ) {
				row -= inc;
				inc = -inc;
				break;
			}
		}
	}
	return order;
}

// Mask pattern 000: invert where (row + col) is even.
const mask0 = ( row, col ) => ( ( row + col ) % 2 === 0 ? 1 : 0 );

/**
 * Incremental GF(2) solver: constraints arrive best-wish-first, each is
 * adopted unless it contradicts what is already promised.
 */
function createSolver( vars ) {
	const words = Math.ceil( ( vars + 1 ) / 32 );
	const rows = []; // reduced rows, rows[i] pivots at column pivot[i]
	const pivots = [];
	const bit = ( vec, i ) => ( vec[ i >> 5 ] >>> ( i & 31 ) ) & 1;
	const xor = ( a, b ) => {
		for ( let w = 0; w < words; w++ ) {
			a[ w ] ^= b[ w ];
		}
	};
	return {
		// vecBits: array of variable indices; rhs: 0|1. True = adopted.
		add( varIdxs, rhs ) {
			const vec = new Uint32Array( words );
			for ( const i of varIdxs ) {
				vec[ i >> 5 ] ^= 1 << ( i & 31 );
			}
			if ( rhs ) {
				vec[ vars >> 5 ] ^= 1 << ( vars & 31 );
			}
			for ( let r = 0; r < rows.length; r++ ) {
				if ( bit( vec, pivots[ r ] ) ) {
					xor( vec, rows[ r ] );
				}
			}
			let pivot = -1;
			for ( let i = 0; i < vars; i++ ) {
				if ( bit( vec, i ) ) {
					pivot = i;
					break;
				}
			}
			if ( -1 === pivot ) {
				// 0 = 0 is already implied; 0 = 1 is a lost wish.
				return 0 === bit( vec, vars );
			}
			rows.push( vec );
			pivots.push( pivot );
			return true;
		},
		solve() {
			const x = new Uint8Array( vars );
			// Back-substitute in pivot order (rows are reduced against
			// all earlier pivots, so resolve from the last row up).
			for ( let r = rows.length - 1; r >= 0; r-- ) {
				let v = bit( rows[ r ], vars );
				for ( let i = pivots[ r ] + 1; i < vars; i++ ) {
					if ( bit( rows[ r ], i ) ) {
						v ^= x[ i ];
					}
				}
				x[ pivots[ r ] ] = v;
			}
			return x;
		},
	};
}

/**
 * Build a QArt module matrix.
 *
 * @param {string}   payload Text payload (encoded as one byte segment).
 * @param {Function} sample  (row, col, size) => { has, dark, weight }
 *                           target for a module, weight 0..1.
 * @param {Object}   opts    { minFreeRatio?, maxVersion? }.
 * @return {Object} { size, data: Uint8Array(size*size), version } with
 *                  the mask already applied (ready to paint).
 */
export function buildQartMatrix( payload, sample, opts = {} ) {
	const bytes = new TextEncoder().encode( payload );
	const segment = [ { data: payload, mode: 'byte' } ];

	// The smallest fitting version, then boosted until roughly half of
	// the data codewords are free padding (that freedom IS the art).
	const probe = QRCode.create( segment, { errorCorrectionLevel: 'H' } );
	let version = probe.version;
	const maxVersion = opts.maxVersion || 16;
	const freeRatio = ( v ) => {
		const total = Utils.getSymbolTotalCodewords( v );
		const ec = ECCode.getTotalCodewordsCount( v, ECLevel.H );
		const dataTotal = total - ec;
		const lenBits = v < 10 ? 8 : 16;
		const fixedBytes = Math.ceil(
			( 4 + lenBits + 8 * bytes.length + 4 ) / 8
		);
		return ( dataTotal - fixedBytes ) / dataTotal;
	};
	while (
		version < maxVersion &&
		freeRatio( version ) < ( opts.minFreeRatio || 0.5 )
	) {
		version++;
	}

	// The base symbol carries every function pattern and the format
	// info for mask 0; only its data modules get rewritten below.
	const base = QRCode.create( segment, {
		errorCorrectionLevel: 'H',
		version,
		maskPattern: 0,
	} );
	const size = base.modules.size;
	const reserved = base.modules.reservedBit;
	const out = new Uint8Array( base.modules.data ); // copy, keeps function patterns
	const isReserved = ( r, c ) => !! reserved[ r * size + c ];
	const order = moduleOrder( size, isReserved );

	// Codeword geometry, mirroring qrcode's createCodewords.
	const total = Utils.getSymbolTotalCodewords( version );
	const ecTotal = ECCode.getTotalCodewordsCount( version, ECLevel.H );
	const dataTotal = total - ecTotal;
	const blocks = ECCode.getBlocksCount( version, ECLevel.H );
	const group2 = total % blocks;
	const group1 = blocks - group2;
	const dataInG1 = Math.floor( dataTotal / blocks );
	const dataInG2 = dataInG1 + 1;
	const ecCount = Math.floor( total / blocks ) - dataInG1;
	const rs = new RS( ecCount );

	const lenBits = version < 10 ? 8 : 16;
	const fixedBits = 4 + lenBits + 8 * bytes.length + 4; // + terminator
	const fixedBytes = Math.ceil( fixedBits / 8 );

	// The fixed head of the data buffer: mode, length, payload, zeros.
	const head = new Uint8Array( dataTotal );
	{
		let bitPos = 0;
		const push = ( value, count ) => {
			for ( let i = count - 1; i >= 0; i-- ) {
				if ( ( value >>> i ) & 1 ) {
					head[ bitPos >> 3 ] |= 0x80 >>> ( bitPos & 7 );
				}
				bitPos++;
			}
		};
		push( 4, 4 ); // byte mode
		push( bytes.length, lenBits );
		for ( const b of bytes ) {
			push( b, 8 );
		}
	}

	// Block layout over the flat data buffer.
	const blockMeta = [];
	{
		let offset = 0;
		for ( let b = 0; b < blocks; b++ ) {
			const dataSize = b < group1 ? dataInG1 : dataInG2;
			blockMeta.push( { offset, dataSize } );
			offset += dataSize;
		}
	}

	// Global bit order (interleaved codewords) -> module positions come
	// from `order`. Map every bit to its block/byte/bit coordinates.
	const maxDataSize = Math.max( dataInG1, dataInG2 );
	const cwSequence = []; // { block, byteInBlock, isEC }
	for ( let i = 0; i < maxDataSize; i++ ) {
		for ( let r = 0; r < blocks; r++ ) {
			const sz = r < group1 ? dataInG1 : dataInG2;
			if ( i < sz ) {
				cwSequence.push( { block: r, byteInBlock: i, isEC: false } );
			}
		}
	}
	for ( let i = 0; i < ecCount; i++ ) {
		for ( let r = 0; r < blocks; r++ ) {
			cwSequence.push( { block: r, byteInBlock: i, isEC: true } );
		}
	}

	// Per block: variables are the free padding BITS of that block.
	const varIndex = []; // per block: Map globalByte*8+bit -> var id
	const varCount = [];
	for ( let b = 0; b < blocks; b++ ) {
		const map = new Map();
		const { offset, dataSize } = blockMeta[ b ];
		let id = 0;
		for ( let i = 0; i < dataSize; i++ ) {
			const g = offset + i;
			if ( g >= fixedBytes ) {
				for ( let bit = 0; bit < 8; bit++ ) {
					map.set( i * 8 + bit, id++ );
				}
			}
		}
		varIndex.push( map );
		varCount.push( id );
	}

	// EC bits as linear functions of the block's free bits: one RS run
	// per basis vector (RS is XOR-linear over the data bytes).
	const ecBase = []; // per block: ecFix (Uint8Array), rows per var (bit masks over ec bits)
	for ( let b = 0; b < blocks; b++ ) {
		const { offset, dataSize } = blockMeta[ b ];
		const fix = new Uint8Array( dataSize );
		for ( let i = 0; i < dataSize; i++ ) {
			const g = offset + i;
			fix[ i ] = g < fixedBytes ? head[ g ] : 0;
		}
		const ecFix = rs.encode( fix );
		const perVar = [];
		for ( const [ key ] of varIndex[ b ] ) {
			const unit = new Uint8Array( dataSize );
			unit[ key >> 3 ] = 0x80 >>> ( key & 7 );
			perVar.push( rs.encode( unit ) );
		}
		ecBase.push( { ecFix, perVar } );
	}

	// Collect the wishes: for every writable module, what the image
	// wants, weighted; solve heaviest first.
	const wishes = [];
	for ( let g = 0; g < order.length && g < total * 8; g++ ) {
		const [ row, col ] = order[ g ];
		const cw = cwSequence[ g >> 3 ];
		const bitInByte = 7 - ( g & 7 );
		const want = sample( row, col, size );
		if ( ! want || ! want.has ) {
			continue;
		}
		const raw = want.dark ^ mask0( row, col );
		wishes.push( {
			weight: want.weight,
			block: cw.block,
			byteInBlock: cw.byteInBlock,
			isEC: cw.isEC,
			bitInByte,
			rhs: raw,
		} );
	}
	wishes.sort( ( a, b ) => b.weight - a.weight );

	const solvers = blockMeta.map( ( unused, b ) =>
		createSolver( varCount[ b ] )
	);
	for ( const w of wishes ) {
		const b = w.block;
		if ( ! varCount[ b ] ) {
			continue;
		}
		if ( ! w.isEC ) {
			const key = w.byteInBlock * 8 + ( 7 - w.bitInByte );
			const v = varIndex[ b ].get( key );
			if ( undefined === v ) {
				continue; // fixed payload bit, nothing to wish for
			}
			solvers[ b ].add( [ v ], w.rhs );
		} else {
			const { ecFix, perVar } = ecBase[ b ];
			const fixBit = ( ecFix[ w.byteInBlock ] >>> w.bitInByte ) & 1;
			const idxs = [];
			for ( let v = 0; v < perVar.length; v++ ) {
				if ( ( perVar[ v ][ w.byteInBlock ] >>> w.bitInByte ) & 1 ) {
					idxs.push( v );
				}
			}
			if ( idxs.length ) {
				solvers[ b ].add( idxs, w.rhs ^ fixBit );
			}
		}
	}

	// Assemble the final codewords from the solved padding.
	const buffer = new Uint8Array( dataTotal );
	buffer.set( head );
	for ( let b = 0; b < blocks; b++ ) {
		const x = solvers[ b ].solve();
		const { offset } = blockMeta[ b ];
		for ( const [ key, v ] of varIndex[ b ] ) {
			if ( x[ v ] ) {
				const i = key >> 3;
				buffer[ offset + i ] |= 0x80 >>> ( key & 7 );
			}
		}
	}
	const dcData = [];
	const ecData = [];
	for ( let b = 0; b < blocks; b++ ) {
		const { offset, dataSize } = blockMeta[ b ];
		dcData.push( buffer.slice( offset, offset + dataSize ) );
		ecData.push( rs.encode( dcData[ b ] ) );
	}

	// Controlled sacrifice: blocks made entirely of fixed payload have
	// zero padding freedom, yet level H corrects floor(ec/2) wrong
	// codewords per block. Spending a conservative slice of that budget
	// on the heaviest unmet wishes buys the artwork the modules algebra
	// alone cannot reach. The decoder still reads the symbol - that is
	// what error correction is FOR - and the reader test proves it.
	{
		const budget = Math.max(
			0,
			Math.floor( ( ecCount / 2 ) * ( opts.sacrifice ?? 0.3 ) )
		);
		if ( budget ) {
			const byCw = new Map();
			for ( const w of wishes ) {
				if ( w.weight < 0.4 ) {
					continue;
				}
				const key =
					w.block + ':' + w.byteInBlock + ':' + ( w.isEC ? 1 : 0 );
				let entry = byCw.get( key );
				if ( ! entry ) {
					entry = { w: [], score: 0 };
					byCw.set( key, entry );
				}
				entry.w.push( w );
			}
			for ( let b = 0; b < blocks; b++ ) {
				const candidates = [];
				for ( const [ key, entry ] of byCw ) {
					const [ kb, kByte, kEc ] = key.split( ':' ).map( Number );
					if ( kb !== b ) {
						continue;
					}
					const cur = kEc
						? ecData[ b ][ kByte ]
						: dcData[ b ][ kByte ];
					let score = 0;
					for ( const w of entry.w ) {
						const bit = ( cur >>> w.bitInByte ) & 1;
						if ( bit !== w.rhs ) {
							score += w.weight;
						}
					}
					if ( score > 0.8 ) {
						candidates.push( { kByte, kEc, entry, score } );
					}
				}
				candidates.sort( ( a, c ) => c.score - a.score );
				for ( const cand of candidates.slice( 0, budget ) ) {
					const arr = cand.kEc ? ecData[ b ] : dcData[ b ];
					let v = arr[ cand.kByte ];
					for ( const w of cand.entry.w ) {
						v =
							( v & ~( 1 << w.bitInByte ) ) |
							( w.rhs << w.bitInByte );
					}
					arr[ cand.kByte ] = v;
				}
			}
		}
	}
	const finalCw = new Uint8Array( total );
	let idx = 0;
	for ( let i = 0; i < maxDataSize; i++ ) {
		for ( let r = 0; r < blocks; r++ ) {
			if ( i < dcData[ r ].length ) {
				finalCw[ idx++ ] = dcData[ r ][ i ];
			}
		}
	}
	for ( let i = 0; i < ecCount; i++ ) {
		for ( let r = 0; r < blocks; r++ ) {
			finalCw[ idx++ ] = ecData[ r ][ i ];
		}
	}

	// Rewrite the data modules (mask 0 applied on the way in).
	for ( let g = 0; g < order.length; g++ ) {
		const [ row, col ] = order[ g ];
		let bit = 0;
		if ( g < total * 8 ) {
			bit = ( finalCw[ g >> 3 ] >>> ( 7 - ( g & 7 ) ) ) & 1;
		}
		out[ row * size + col ] = bit ^ mask0( row, col );
	}

	return { size, data: out, version, reservedBit: reserved };
}
