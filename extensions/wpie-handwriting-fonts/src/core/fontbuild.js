/**
 * Writing the OpenType file, byte by byte.
 *
 * The extension writes its own tables rather than pulling in a font
 * library, for three reasons. The file has to carry a private table
 * with the drawing in it, and no library exposes that. The metrics have
 * to be exactly the ones the drawing surface showed, not a library's
 * idea of sensible defaults. And a font writer for one narrow case is a
 * few hundred lines of arithmetic that can be tested to the byte, which
 * is cheaper to own than to depend on.
 *
 * The tests read the result back with an independent parser, because
 * the only interesting question about a font file is whether something
 * else can read it.
 */

/** Private table carrying the project, so the font can be reopened. */
export const PROJECT_TAG = 'WPIE';

class Writer {
	constructor() {
		this.bytes = [];
	}
	u8( v ) {
		this.bytes.push( v & 0xff );
		return this;
	}
	u16( v ) {
		return this.u8( v >> 8 ).u8( v );
	}
	i16( v ) {
		return this.u16( v < 0 ? v + 0x10000 : v );
	}
	u32( v ) {
		return this.u16( ( v >>> 16 ) & 0xffff ).u16( v & 0xffff );
	}
	tag( s ) {
		for ( let i = 0; i < 4; i++ ) {
			this.u8( s.charCodeAt( i ) );
		}
		return this;
	}
	raw( arr ) {
		for ( let i = 0; i < arr.length; i++ ) {
			this.bytes.push( arr[ i ] & 0xff );
		}
		return this;
	}
	get length() {
		return this.bytes.length;
	}
	done() {
		return Uint8Array.from( this.bytes );
	}
}

const pad4 = ( arr ) => {
	const rest = arr.length % 4;
	if ( ! rest ) {
		return arr;
	}
	const out = new Uint8Array( arr.length + ( 4 - rest ) );
	out.set( arr );
	return out;
};

function checksum( arr ) {
	const p = pad4( arr );
	let sum = 0;
	for ( let i = 0; i < p.length; i += 4 ) {
		sum =
			( sum +
				( ( ( p[ i ] << 24 ) | ( p[ i + 1 ] << 16 ) | ( p[ i + 2 ] << 8 ) | p[ i + 3 ] ) >>> 0 ) ) >>>
			0;
	}
	return sum >>> 0;
}

/** Rotate a contour so it begins on the curve, which keeps glyf simple. */
function startOnCurve( ring ) {
	const i = ring.findIndex( ( p ) => p.on );
	if ( i <= 0 ) {
		return ring;
	}
	return ring.slice( i ).concat( ring.slice( 0, i ) );
}

/**
 * One glyph's `glyf` entry. Empty glyphs write nothing at all, which is
 * how a space is expressed.
 *
 * @param {Array} contours Integer contours of `{ x, y, on }`.
 * @return {Uint8Array} Glyph data.
 */
export function glyfEntry( contours ) {
	const rings = ( contours || [] )
		.map( startOnCurve )
		.filter( ( r ) => r.length >= 3 );
	if ( ! rings.length ) {
		return new Uint8Array( 0 );
	}
	const pts = [];
	const ends = [];
	for ( const ring of rings ) {
		for ( const p of ring ) {
			pts.push( p );
		}
		ends.push( pts.length - 1 );
	}
	let xMin = Infinity;
	let yMin = Infinity;
	let xMax = -Infinity;
	let yMax = -Infinity;
	for ( const p of pts ) {
		xMin = Math.min( xMin, p.x );
		yMin = Math.min( yMin, p.y );
		xMax = Math.max( xMax, p.x );
		yMax = Math.max( yMax, p.y );
	}

	const flags = [];
	const xs = [];
	const ys = [];
	let px = 0;
	let py = 0;
	for ( const p of pts ) {
		const dx = p.x - px;
		const dy = p.y - py;
		px = p.x;
		py = p.y;
		let f = p.on ? 0x01 : 0x00;
		if ( 0 === dx ) {
			f |= 0x10;
		} else if ( dx >= -255 && dx <= 255 ) {
			f |= 0x02;
			if ( dx > 0 ) {
				f |= 0x10;
			}
			xs.push( Math.abs( dx ) );
		} else {
			xs.push( dx );
		}
		if ( 0 === dy ) {
			f |= 0x20;
		} else if ( dy >= -255 && dy <= 255 ) {
			f |= 0x04;
			if ( dy > 0 ) {
				f |= 0x20;
			}
			ys.push( Math.abs( dy ) );
		} else {
			ys.push( dy );
		}
		flags.push( f );
	}

	const w = new Writer();
	w.i16( rings.length ).i16( xMin ).i16( yMin ).i16( xMax ).i16( yMax );
	for ( const e of ends ) {
		w.u16( e );
	}
	w.u16( 0 ); // No hinting instructions; the shapes are what they are.

	for ( let i = 0; i < flags.length; ) {
		const f = flags[ i ];
		let run = 1;
		while ( i + run < flags.length && flags[ i + run ] === f && run < 255 ) {
			run++;
		}
		if ( run > 1 ) {
			w.u8( f | 0x08 ).u8( run - 1 );
		} else {
			w.u8( f );
		}
		i += run;
	}
	let xi = 0;
	for ( let i = 0; i < flags.length; i++ ) {
		const f = flags[ i ];
		if ( f & 0x02 ) {
			w.u8( xs[ xi++ ] );
		} else if ( ! ( f & 0x10 ) ) {
			w.i16( xs[ xi++ ] );
		}
	}
	let yi = 0;
	for ( let i = 0; i < flags.length; i++ ) {
		const f = flags[ i ];
		if ( f & 0x04 ) {
			w.u8( ys[ yi++ ] );
		} else if ( ! ( f & 0x20 ) ) {
			w.i16( ys[ yi++ ] );
		}
	}
	return w.done();
}

/** The visible box drawn for characters the font does not have. */
function notdefContours( metrics ) {
	const top = Math.round( ( metrics.capHeight || 700 ) * 0.9 );
	const w = Math.round( ( metrics.unitsPerEm || 1000 ) * 0.42 );
	const t = Math.max( 8, Math.round( ( metrics.unitsPerEm || 1000 ) * 0.045 ) );
	const box = ( x0, y0, x1, y1, cw ) =>
		cw
			? [
					{ x: x0, y: y0, on: true },
					{ x: x0, y: y1, on: true },
					{ x: x1, y: y1, on: true },
					{ x: x1, y: y0, on: true },
			  ]
			: [
					{ x: x0, y: y0, on: true },
					{ x: x1, y: y0, on: true },
					{ x: x1, y: y1, on: true },
					{ x: x0, y: y1, on: true },
			  ];
	return [
		box( t, 0, w - t, top, true ),
		box( t * 2, t, w - t * 2, top - t, false ),
	];
}

function utf16be( s ) {
	const out = [];
	for ( const ch of String( s ) ) {
		const cp = ch.codePointAt( 0 );
		if ( cp > 0xffff ) {
			const v = cp - 0x10000;
			out.push( 0xd8 | ( v >> 18 ), ( v >> 10 ) & 0xff, 0xdc | ( ( v >> 8 ) & 0x03 ), v & 0xff );
		} else {
			out.push( cp >> 8, cp & 0xff );
		}
	}
	return out;
}

const ascii = ( s ) =>
	Array.from( String( s ) ).map( ( c ) => {
		const v = c.codePointAt( 0 );
		return v < 128 ? v : 63;
	} );

function nameTable( names ) {
	const records = [];
	const strings = [];
	let offset = 0;
	const add = ( platform, encoding, language, nameId, bytes ) => {
		records.push( { platform, encoding, language, nameId, len: bytes.length, offset } );
		strings.push( bytes );
		offset += bytes.length;
	};
	const ids = Object.keys( names )
		.map( Number )
		.sort( ( a, b ) => a - b );
	for ( const id of ids ) {
		add( 1, 0, 0, id, ascii( names[ id ] ) );
	}
	for ( const id of ids ) {
		add( 3, 1, 0x409, id, utf16be( names[ id ] ) );
	}
	const w = new Writer();
	w.u16( 0 ).u16( records.length ).u16( 6 + records.length * 12 );
	for ( const r of records ) {
		w.u16( r.platform ).u16( r.encoding ).u16( r.language ).u16( r.nameId );
		w.u16( r.len ).u16( r.offset );
	}
	for ( const s of strings ) {
		w.raw( s );
	}
	return w.done();
}

function cmapTable( pairs ) {
	const sorted = pairs.slice().sort( ( a, b ) => a.cp - b.cp );
	const segs = [];
	for ( const { cp, gid } of sorted ) {
		const last = segs[ segs.length - 1 ];
		if ( last && cp === last.end + 1 && gid === last.startGid + ( cp - last.start ) ) {
			last.end = cp;
		} else {
			segs.push( { start: cp, end: cp, startGid: gid } );
		}
	}
	segs.push( { start: 0xffff, end: 0xffff, startGid: 0 } );

	const segCount = segs.length;
	const sub = new Writer();
	const len = 16 + segCount * 8;
	sub.u16( 4 ).u16( len ).u16( 0 );
	sub.u16( segCount * 2 );
	const p2 = Math.pow( 2, Math.floor( Math.log2( segCount ) ) );
	sub.u16( p2 * 2 ).u16( Math.log2( p2 ) ).u16( segCount * 2 - p2 * 2 );
	for ( const s of segs ) {
		sub.u16( s.end );
	}
	sub.u16( 0 );
	for ( const s of segs ) {
		sub.u16( s.start );
	}
	for ( const s of segs ) {
		// idDelta is applied modulo 65536, so the unsigned representation
		// is what belongs in the file. The closing segment maps 0xFFFF to
		// glyph 0, which a delta of one does exactly.
		const delta = 0xffff === s.start ? 1 : s.startGid - s.start;
		sub.u16( ( ( delta % 0x10000 ) + 0x10000 ) % 0x10000 );
	}
	for ( let i = 0; i < segCount; i++ ) {
		sub.u16( 0 );
	}
	const subBytes = sub.done();

	const w = new Writer();
	w.u16( 0 ).u16( 2 );
	w.u16( 0 ).u16( 3 ).u32( 20 );
	w.u16( 3 ).u16( 1 ).u32( 20 );
	w.raw( subBytes );
	return w.done();
}

function kernTable( pairs ) {
	if ( ! pairs.length ) {
		return null;
	}
	const sorted = pairs
		.slice()
		.sort( ( a, b ) => a[ 0 ] - b[ 0 ] || a[ 1 ] - b[ 1 ] )
		.slice( 0, 9000 );
	const n = sorted.length;
	const w = new Writer();
	w.u16( 0 ).u16( 1 );
	w.u16( 0 ).u16( 14 + n * 6 ).u16( 0x0001 );
	const p2 = Math.pow( 2, Math.floor( Math.log2( n ) ) );
	w.u16( n ).u16( p2 * 6 ).u16( Math.log2( p2 ) ).u16( ( n - p2 ) * 6 );
	for ( const [ l, r, v ] of sorted ) {
		w.u16( l ).u16( r ).i16( v );
	}
	return w.done();
}

/**
 * Build a complete font file.
 *
 * @param {Object} spec Font specification.
 * @param {Object} spec.metrics  Font metrics.
 * @param {Array}  spec.glyphs   `{ codepoint, contours, advance, lsb }`,
 *                               in glyph order; index 0 is replaced by
 *                               the built-in notdef.
 * @param {Array}  spec.kerning  `[ leftGid, rightGid, value ]` triples.
 * @param {Object} spec.names    Name-table strings keyed by name id.
 * @param {number} spec.weight   usWeightClass.
 * @param {number} spec.italicAngle Negative for a right lean.
 * @param {Uint8Array} spec.project Bytes for the private table.
 * @return {Uint8Array} The font file.
 */
export function buildFont( spec ) {
	const metrics = spec.metrics;
	const upm = metrics.unitsPerEm;
	const glyphs = [
		{ codepoint: null, contours: notdefContours( metrics ), advance: Math.round( upm * 0.5 ), lsb: 0 },
	].concat( spec.glyphs );

	const glyfParts = glyphs.map( ( g ) => glyfEntry( g.contours ) );
	const loca = [];
	let total = 0;
	for ( const part of glyfParts ) {
		loca.push( total );
		total += pad4( part ).length;
	}
	loca.push( total );

	const glyf = new Writer();
	for ( const part of glyfParts ) {
		glyf.raw( pad4( part ) );
	}

	const locaW = new Writer();
	for ( const o of loca ) {
		locaW.u32( o );
	}

	let xMin = 0;
	let yMin = 0;
	let xMax = 0;
	let yMax = 0;
	let advanceMax = 0;
	let minLsb = 0;
	let maxPoints = 0;
	let maxContours = 0;
	for ( let i = 0; i < glyphs.length; i++ ) {
		const g = glyphs[ i ];
		advanceMax = Math.max( advanceMax, g.advance );
		minLsb = Math.min( minLsb, g.lsb || 0 );
		let points = 0;
		for ( const ring of g.contours || [] ) {
			points += ring.length;
			for ( const p of ring ) {
				xMin = Math.min( xMin, p.x );
				yMin = Math.min( yMin, p.y );
				xMax = Math.max( xMax, p.x );
				yMax = Math.max( yMax, p.y );
			}
		}
		maxPoints = Math.max( maxPoints, points );
		maxContours = Math.max( maxContours, ( g.contours || [] ).length );
	}

	const hmtx = new Writer();
	for ( const g of glyphs ) {
		hmtx.u16( Math.max( 0, Math.round( g.advance ) ) ).i16( Math.round( g.lsb || 0 ) );
	}

	const head = new Writer();
	head.u32( 0x00010000 ).u32( 0x00010000 ).u32( 0 ).u32( 0x5f0f3cf5 );
	head.u16( 0x000b ).u16( upm );
	head.u32( 0 ).u32( 0x9f5a0000 ).u32( 0 ).u32( 0x9f5a0000 );
	head.i16( xMin ).i16( yMin ).i16( xMax ).i16( yMax );
	head.u16( spec.italicAngle ? 0x0002 : 0 ).u16( 8 ).i16( 2 ).i16( 1 ).i16( 0 );

	const hhea = new Writer();
	hhea.u32( 0x00010000 );
	hhea.i16( metrics.ascender ).i16( metrics.descender ).i16( metrics.lineGap || 0 );
	hhea.u16( advanceMax ).i16( minLsb ).i16( 0 ).i16( xMax );
	hhea.i16( 1 ).i16( 0 ).i16( 0 );
	hhea.i16( 0 ).i16( 0 ).i16( 0 ).i16( 0 );
	hhea.i16( 0 ).u16( glyphs.length );

	const maxp = new Writer();
	maxp.u32( 0x00010000 ).u16( glyphs.length );
	maxp.u16( maxPoints ).u16( maxContours ).u16( 0 ).u16( 0 ).u16( 2 );
	maxp.u16( 0 ).u16( 0 ).u16( 0 ).u16( 0 ).u16( 0 ).u16( 0 ).u16( 0 ).u16( 0 );

	const codepoints = [];
	glyphs.forEach( ( g, gid ) => {
		if ( null !== g.codepoint && undefined !== g.codepoint ) {
			codepoints.push( { cp: g.codepoint, gid } );
		}
	} );
	const cmap = cmapTable( codepoints );
	const cps = codepoints.map( ( c ) => c.cp );

	const os2 = new Writer();
	const avg = Math.round(
		glyphs.reduce( ( s, g ) => s + g.advance, 0 ) / Math.max( 1, glyphs.length )
	);
	os2.u16( 4 ).i16( avg ).u16( spec.weight || 400 ).u16( 5 ).u16( 0 );
	os2.i16( Math.round( upm * 0.65 ) ).i16( Math.round( upm * 0.6 ) ).i16( 0 ).i16( Math.round( upm * 0.075 ) );
	os2.i16( Math.round( upm * 0.65 ) ).i16( Math.round( upm * 0.6 ) ).i16( 0 ).i16( Math.round( upm * 0.48 ) );
	os2.i16( Math.round( upm * 0.05 ) ).i16( Math.round( metrics.xHeight * 0.5 ) );
	os2.u16( 0 );
	os2.raw( [ 2, 0, ( spec.weight || 400 ) >= 700 ? 8 : 5, 9, 0, 0, 0, 0, 0, 0 ] );
	os2.u32( 0x00000003 ).u32( 0 ).u32( 0 ).u32( 0 );
	os2.tag( 'TBIT' );
	let fsSelection = 0;
	if ( spec.italicAngle ) {
		fsSelection |= 0x0001;
	}
	if ( ( spec.weight || 400 ) >= 700 ) {
		fsSelection |= 0x0020;
	}
	if ( ! fsSelection ) {
		fsSelection |= 0x0040;
	}
	fsSelection |= 0x0080; // Use the typographic metrics below.
	os2.u16( fsSelection );
	os2.u16( cps.length ? Math.min( ...cps ) : 0 ).u16( cps.length ? Math.min( 0xffff, Math.max( ...cps ) ) : 0 );
	os2.i16( metrics.ascender ).i16( metrics.descender ).i16( metrics.lineGap || 0 );
	os2.u16( Math.max( metrics.ascender, yMax ) ).u16( Math.abs( Math.min( metrics.descender, yMin ) ) );
	os2.u32( 0x0000009f ).u32( 0 );
	os2.i16( metrics.xHeight ).i16( metrics.capHeight );
	os2.u16( 32 ).u16( 32 ).u16( 2 );

	const post = new Writer();
	post.u32( 0x00030000 );
	post.i16( Math.round( spec.italicAngle || 0 ) ).u16( 0 );
	post.i16( Math.round( -upm * 0.1 ) ).u16( Math.round( upm * 0.05 ) );
	post.u32( 0 ).u32( 0 ).u32( 0 ).u32( 0 ).u32( 0 );

	const tables = {
		'OS/2': os2.done(),
		cmap,
		glyf: glyf.done(),
		head: head.done(),
		hhea: hhea.done(),
		hmtx: hmtx.done(),
		loca: locaW.done(),
		maxp: maxp.done(),
		name: nameTable( spec.names ),
		post: post.done(),
	};
	const kern = kernTable( spec.kerning || [] );
	if ( kern ) {
		tables.kern = kern;
	}
	if ( spec.project && spec.project.length ) {
		tables[ PROJECT_TAG ] = spec.project;
	}

	return assemble( tables );
}

/**
 * Lay the tables out, fill in the directory and settle the checksums.
 *
 * @param {Object} tables Tag to bytes.
 * @return {Uint8Array} The font file.
 */
export function assemble( tables ) {
	const tags = Object.keys( tables ).sort();
	const numTables = tags.length;
	const p2 = Math.pow( 2, Math.floor( Math.log2( numTables ) ) );

	const dir = new Writer();
	dir.u32( 0x00010000 ).u16( numTables );
	dir.u16( p2 * 16 ).u16( Math.log2( p2 ) ).u16( numTables * 16 - p2 * 16 );

	let offset = 12 + numTables * 16;
	const records = [];
	for ( const tag of tags ) {
		const data = tables[ tag ];
		records.push( { tag, offset, length: data.length, sum: checksum( data ) } );
		offset += pad4( data ).length;
	}
	for ( const r of records ) {
		dir.tag( r.tag ).u32( r.sum ).u32( r.offset ).u32( r.length );
	}

	const file = new Uint8Array( offset );
	file.set( dir.done(), 0 );
	for ( let i = 0; i < tags.length; i++ ) {
		file.set( pad4( tables[ tags[ i ] ] ), records[ i ].offset );
	}

	// The head checksum can only be known once the whole file exists.
	const headRec = records[ tags.indexOf( 'head' ) ];
	const adjust = ( 0xb1b0afba - checksum( file ) ) >>> 0;
	const at = headRec.offset + 8;
	file[ at ] = ( adjust >>> 24 ) & 0xff;
	file[ at + 1 ] = ( adjust >>> 16 ) & 0xff;
	file[ at + 2 ] = ( adjust >>> 8 ) & 0xff;
	file[ at + 3 ] = adjust & 0xff;
	return file;
}
