/**
 * Text Art typography renderers - the source-free types: periodic-
 * element tiles, hidden-word letter grids and crossing letter tiles,
 * plus shape masks that let the image-driven types run without a
 * photo. Pure module, node-testable.
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

const BG = { dark: '#0e1013', light: '#ffffff' };
const famFor = ( font ) => ( font ? `"${ font }", sans-serif` : 'sans-serif' );

// Deterministic RNG (same contract as the other minis).
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

/* ------------------------------ element tiles ----------------------------- */

// Symbol -> [ atomic number, English name ]. All 118.
export const ELEMENTS = {
	H: [ 1, 'Hydrogen' ],
	He: [ 2, 'Helium' ],
	Li: [ 3, 'Lithium' ],
	Be: [ 4, 'Beryllium' ],
	B: [ 5, 'Boron' ],
	C: [ 6, 'Carbon' ],
	N: [ 7, 'Nitrogen' ],
	O: [ 8, 'Oxygen' ],
	F: [ 9, 'Fluorine' ],
	Ne: [ 10, 'Neon' ],
	Na: [ 11, 'Sodium' ],
	Mg: [ 12, 'Magnesium' ],
	Al: [ 13, 'Aluminium' ],
	Si: [ 14, 'Silicon' ],
	P: [ 15, 'Phosphorus' ],
	S: [ 16, 'Sulfur' ],
	Cl: [ 17, 'Chlorine' ],
	Ar: [ 18, 'Argon' ],
	K: [ 19, 'Potassium' ],
	Ca: [ 20, 'Calcium' ],
	Sc: [ 21, 'Scandium' ],
	Ti: [ 22, 'Titanium' ],
	V: [ 23, 'Vanadium' ],
	Cr: [ 24, 'Chromium' ],
	Mn: [ 25, 'Manganese' ],
	Fe: [ 26, 'Iron' ],
	Co: [ 27, 'Cobalt' ],
	Ni: [ 28, 'Nickel' ],
	Cu: [ 29, 'Copper' ],
	Zn: [ 30, 'Zinc' ],
	Ga: [ 31, 'Gallium' ],
	Ge: [ 32, 'Germanium' ],
	As: [ 33, 'Arsenic' ],
	Se: [ 34, 'Selenium' ],
	Br: [ 35, 'Bromine' ],
	Kr: [ 36, 'Krypton' ],
	Rb: [ 37, 'Rubidium' ],
	Sr: [ 38, 'Strontium' ],
	Y: [ 39, 'Yttrium' ],
	Zr: [ 40, 'Zirconium' ],
	Nb: [ 41, 'Niobium' ],
	Mo: [ 42, 'Molybdenum' ],
	Tc: [ 43, 'Technetium' ],
	Ru: [ 44, 'Ruthenium' ],
	Rh: [ 45, 'Rhodium' ],
	Pd: [ 46, 'Palladium' ],
	Ag: [ 47, 'Silver' ],
	Cd: [ 48, 'Cadmium' ],
	In: [ 49, 'Indium' ],
	Sn: [ 50, 'Tin' ],
	Sb: [ 51, 'Antimony' ],
	Te: [ 52, 'Tellurium' ],
	I: [ 53, 'Iodine' ],
	Xe: [ 54, 'Xenon' ],
	Cs: [ 55, 'Caesium' ],
	Ba: [ 56, 'Barium' ],
	La: [ 57, 'Lanthanum' ],
	Ce: [ 58, 'Cerium' ],
	Pr: [ 59, 'Praseodymium' ],
	Nd: [ 60, 'Neodymium' ],
	Pm: [ 61, 'Promethium' ],
	Sm: [ 62, 'Samarium' ],
	Eu: [ 63, 'Europium' ],
	Gd: [ 64, 'Gadolinium' ],
	Tb: [ 65, 'Terbium' ],
	Dy: [ 66, 'Dysprosium' ],
	Ho: [ 67, 'Holmium' ],
	Er: [ 68, 'Erbium' ],
	Tm: [ 69, 'Thulium' ],
	Yb: [ 70, 'Ytterbium' ],
	Lu: [ 71, 'Lutetium' ],
	Hf: [ 72, 'Hafnium' ],
	Ta: [ 73, 'Tantalum' ],
	W: [ 74, 'Tungsten' ],
	Re: [ 75, 'Rhenium' ],
	Os: [ 76, 'Osmium' ],
	Ir: [ 77, 'Iridium' ],
	Pt: [ 78, 'Platinum' ],
	Au: [ 79, 'Gold' ],
	Hg: [ 80, 'Mercury' ],
	Tl: [ 81, 'Thallium' ],
	Pb: [ 82, 'Lead' ],
	Bi: [ 83, 'Bismuth' ],
	Po: [ 84, 'Polonium' ],
	At: [ 85, 'Astatine' ],
	Rn: [ 86, 'Radon' ],
	Fr: [ 87, 'Francium' ],
	Ra: [ 88, 'Radium' ],
	Ac: [ 89, 'Actinium' ],
	Th: [ 90, 'Thorium' ],
	Pa: [ 91, 'Protactinium' ],
	U: [ 92, 'Uranium' ],
	Np: [ 93, 'Neptunium' ],
	Pu: [ 94, 'Plutonium' ],
	Am: [ 95, 'Americium' ],
	Cm: [ 96, 'Curium' ],
	Bk: [ 97, 'Berkelium' ],
	Cf: [ 98, 'Californium' ],
	Es: [ 99, 'Einsteinium' ],
	Fm: [ 100, 'Fermium' ],
	Md: [ 101, 'Mendelevium' ],
	No: [ 102, 'Nobelium' ],
	Lr: [ 103, 'Lawrencium' ],
	Rf: [ 104, 'Rutherfordium' ],
	Db: [ 105, 'Dubnium' ],
	Sg: [ 106, 'Seaborgium' ],
	Bh: [ 107, 'Bohrium' ],
	Hs: [ 108, 'Hassium' ],
	Mt: [ 109, 'Meitnerium' ],
	Ds: [ 110, 'Darmstadtium' ],
	Rg: [ 111, 'Roentgenium' ],
	Cn: [ 112, 'Copernicium' ],
	Nh: [ 113, 'Nihonium' ],
	Fl: [ 114, 'Flerovium' ],
	Mc: [ 115, 'Moscovium' ],
	Lv: [ 116, 'Livermorium' ],
	Ts: [ 117, 'Tennessine' ],
	Og: [ 118, 'Oganesson' ],
};

const SYM_BY_LOWER = ( () => {
	const m = {};
	for ( const s of Object.keys( ELEMENTS ) ) {
		m[ s.toLowerCase() ] = s;
	}
	return m;
} )();

/**
 * Split a word into periodic-element tiles ("BaCoN" style): dynamic
 * programming that minimizes fallback letters (letters no symbol
 * covers become plain tiles).
 *
 * @param {string} word Input word (letters only are matched).
 * @return {Array} [ { text, sym?, num? } ] in order.
 */
export function elementize( word ) {
	const s = String( word || '' );
	const n = s.length;
	// best[i] = [ cost from i to end, step ]; cost = fallbacks * 1000 +
	// tiles, so fewest fallbacks win and, on ties, fewer/longer tiles
	// ("BaCoN", not "B-Ac-O-N").
	const best = new Array( n + 1 );
	best[ n ] = [ 0, null ];
	for ( let i = n - 1; i >= 0; i-- ) {
		// Fallback single letter.
		let cost = 1001 + best[ i + 1 ][ 0 ];
		let step = { len: 1, sym: null };
		const one = SYM_BY_LOWER[ s[ i ].toLowerCase() ];
		if ( one && 1 + best[ i + 1 ][ 0 ] < cost ) {
			cost = 1 + best[ i + 1 ][ 0 ];
			step = { len: 1, sym: one };
		}
		if ( i + 2 <= n ) {
			const two = SYM_BY_LOWER[ s.slice( i, i + 2 ).toLowerCase() ];
			if ( two && 1 + best[ i + 2 ][ 0 ] < cost ) {
				cost = 1 + best[ i + 2 ][ 0 ];
				step = { len: 2, sym: two };
			}
		}
		best[ i ] = [ cost, step ];
	}
	const out = [];
	for ( let i = 0; i < n;  ) {
		const step = best[ i ][ 1 ];
		const text = s.slice( i, i + step.len );
		if ( step.sym ) {
			out.push( {
				text: step.sym,
				sym: step.sym,
				num: ELEMENTS[ step.sym ][ 0 ],
				name: ELEMENTS[ step.sym ][ 1 ],
			} );
		} else {
			out.push( { text } );
		}
		i += step.len;
	}
	return out;
}

/**
 * Periodic-element tiles, one word per row.
 *
 * @param {Object} like Canvas-like.
 * @param {Object} opts { width, height, words, colors, background,
 *   font, tileStyle 'classic'|'neon'|'chalk', showNames }.
 * @return {HTMLCanvasElement}
 */
export function renderElementWords( like, opts = {} ) {
	const W = opts.width || 1200;
	const H = opts.height || 900;
	const words = ( opts.words || [] ).slice( 0, 8 );
	if ( ! words.length ) {
		return null;
	}
	const colors =
		opts.colors && opts.colors.length ? opts.colors : [ '#3b66ff' ];
	const style = opts.tileStyle || 'classic';
	const dark = 'light' !== opts.background;
	const out = makeCanvas( like, W, H );
	const g = out.getContext( '2d' );
	g.fillStyle = 'chalk' === style ? '#233329' : BG[ dark ? 'dark' : 'light' ];
	g.fillRect( 0, 0, W, H );

	const rows = words.map( ( w ) => elementize( w ) );
	const maxTiles = Math.max( ...rows.map( ( r ) => r.length ) );
	const pad = Math.round( W * 0.06 );
	const gap = 0.12; // fraction of tile
	let tile = Math.min(
		( W - 2 * pad ) / ( maxTiles + ( maxTiles - 1 ) * gap ),
		( H - 2 * pad ) /
			( rows.length * ( 1 + 0.45 * gap ) + ( rows.length - 1 ) * gap * 2 )
	);
	tile = Math.max( 26, tile );
	const stepX = tile * ( 1 + gap );
	const stepY = tile * ( 1 + gap * 2 );
	const totalH = rows.length * stepY - tile * gap * 2;
	let y = ( H - totalH ) / 2;
	let ci = 0;
	for ( const row of rows ) {
		const totalW = row.length * stepX - tile * gap;
		let x = ( W - totalW ) / 2;
		for ( const cell of row ) {
			const col = colors[ ci % colors.length ];
			if ( cell.sym ) {
				ci++;
			}
			drawElementTile( g, x, y, tile, cell, col, style, dark, opts );
			x += stepX;
		}
		y += stepY;
	}
	return out;
}

function drawElementTile( g, x, y, size, cell, color, style, dark, opts ) {
	const r = size * 0.12;
	g.save();
	g.beginPath();
	g.moveTo( x + r, y );
	g.arcTo( x + size, y, x + size, y + size, r );
	g.arcTo( x + size, y + size, x, y + size, r );
	g.arcTo( x, y + size, x, y, r );
	g.arcTo( x, y, x + size, y, r );
	g.closePath();
	const isFallback = ! cell.sym;
	if ( 'chalk' === style ) {
		g.strokeStyle = isFallback
			? 'rgba(255,255,255,0.28)'
			: 'rgba(255,255,255,0.85)';
		g.lineWidth = Math.max( 1.5, size * 0.02 );
		g.stroke();
	} else if ( 'neon' === style ) {
		g.fillStyle = dark ? '#12151b' : '#f3f4f8';
		g.fill();
		g.shadowColor = isFallback ? 'transparent' : color;
		g.shadowBlur = size * 0.22;
		g.strokeStyle = isFallback ? ( dark ? '#3a3f48' : '#c6cad2' ) : color;
		g.lineWidth = Math.max( 2, size * 0.035 );
		g.stroke();
		g.shadowBlur = 0;
	} else {
		g.fillStyle = dark ? '#181c23' : '#f6f7f9';
		g.fill();
		g.strokeStyle = isFallback ? ( dark ? '#343943' : '#d3d7dd' ) : color;
		g.lineWidth = Math.max( 2, size * 0.04 );
		g.stroke();
	}
	const ink =
		'chalk' === style
			? 'rgba(255,255,255,0.92)'
			: isFallback
			? dark
				? '#7d848f'
				: '#9aa1ab'
			: dark
			? '#f2f4f7'
			: '#20242b';
	g.restore();
	g.save();
	const fam = famFor( opts.font );
	// Symbol.
	g.fillStyle = 'neon' === style && ! isFallback ? color : ink;
	if ( 'neon' === style && ! isFallback ) {
		g.shadowColor = color;
		g.shadowBlur = size * 0.3;
	}
	g.font = `700 ${ Math.round( size * 0.44 ) }px ${ fam }`;
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	const symY = opts.showNames && cell.sym ? y + size * 0.44 : y + size * 0.52;
	g.fillText( cell.text, x + size / 2, symY );
	g.shadowBlur = 0;
	// Atomic number.
	if ( cell.num ) {
		g.font = `600 ${ Math.round( size * 0.14 ) }px ${ fam }`;
		g.textAlign = 'left';
		g.textBaseline = 'top';
		g.fillStyle = ink;
		g.fillText( String( cell.num ), x + size * 0.09, y + size * 0.08 );
	}
	// Name.
	if ( opts.showNames && cell.name ) {
		g.font = `500 ${ Math.round( size * 0.105 ) }px ${ fam }`;
		g.textAlign = 'center';
		g.textBaseline = 'alphabetic';
		g.fillStyle = ink;
		g.fillText( cell.name, x + size / 2, y + size * 0.88, size * 0.9 );
	}
	g.restore();
}

/* ------------------------------ hidden words ------------------------------ */

/**
 * Build the letter grid with the words hidden inside.
 *
 * @param {Function} rng       Seeded RNG.
 * @param {Array}    words     Uppercased words.
 * @param {number}   cols      Grid columns.
 * @param {number}   rows      Grid rows.
 * @param {boolean}  diagonals Allow diagonal placement.
 * @return {Object} { grid (rows arrays), placed: Set of "x,y", ok }
 */
export function buildLetterGrid( rng, words, cols, rows, diagonals ) {
	const grid = Array.from( { length: rows }, () =>
		new Array( cols ).fill( '' )
	);
	const placed = new Set();
	const dirs = [
		[ 1, 0 ],
		[ 0, 1 ],
	].concat(
		diagonals
			? [
					[ 1, 1 ],
					[ 1, -1 ],
			  ]
			: []
	);
	let ok = true;
	for ( const word of words ) {
		let done = false;
		for ( let tryN = 0; tryN < 260 && ! done; tryN++ ) {
			const [ dx, dy ] = dirs[ ( rng() * dirs.length ) | 0 ];
			const maxX = cols - ( dx ? word.length : 1 );
			const maxY =
				dy > 0 ? rows - word.length : dy < 0 ? rows - 1 : rows - 1;
			const minY = dy < 0 ? word.length - 1 : 0;
			if ( maxX < 0 || maxY < minY ) {
				break;
			}
			const x0 = ( rng() * ( maxX + 1 ) ) | 0;
			const y0 = minY + ( ( rng() * ( maxY - minY + 1 ) ) | 0 );
			let fits = true;
			for ( let k = 0; k < word.length && fits; k++ ) {
				const cur = grid[ y0 + dy * k ][ x0 + dx * k ];
				fits = ! cur || cur === word[ k ];
			}
			if ( ! fits ) {
				continue;
			}
			for ( let k = 0; k < word.length; k++ ) {
				grid[ y0 + dy * k ][ x0 + dx * k ] = word[ k ];
				placed.add( `${ x0 + dx * k },${ y0 + dy * k }` );
			}
			done = true;
		}
		ok = ok && done;
	}
	const FILL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
	for ( let yy = 0; yy < rows; yy++ ) {
		for ( let xx = 0; xx < cols; xx++ ) {
			if ( ! grid[ yy ][ xx ] ) {
				grid[ yy ][ xx ] = FILL[ ( rng() * 26 ) | 0 ];
			}
		}
	}
	return { grid, placed, ok };
}

/**
 * Hidden-words letter grid poster (word-clock look).
 *
 * @param {Object} like Canvas-like.
 * @param {Object} opts { width, height, words, colors, background,
 *   font, density 0..100, diagonals, dim 0..100, seed }.
 * @return {HTMLCanvasElement}
 */
export function renderLetterGrid( like, opts = {} ) {
	const W = opts.width || 1200;
	const H = opts.height || 900;
	const words = ( opts.words || [] )
		.map( ( w ) => w.toUpperCase().replace( /[^A-ZÄÖÜ0-9]/g, '' ) )
		.filter( ( w ) => w.length >= 2 )
		.slice( 0, 12 );
	if ( ! words.length ) {
		return null;
	}
	const colors =
		opts.colors && opts.colors.length ? opts.colors : [ '#3b66ff' ];
	const dark = 'light' !== opts.background;
	const density = Math.max( 0, Math.min( 100, opts.density ?? 40 ) );
	const longest = Math.max( ...words.map( ( w ) => w.length ) );
	const cols = Math.max(
		longest + 1,
		Math.round( 9 + ( density / 100 ) * 13 )
	);
	const rows = Math.max(
		Math.max( longest + 1, words.length + 2 ),
		Math.round( cols * ( H / W ) )
	);
	const rng = mulberry( ( opts.seed || 7 ) * 7919 + cols );
	const { grid, placed } = buildLetterGrid(
		rng,
		words,
		cols,
		rows,
		!! opts.diagonals
	);
	// Word -> color, in placement order (re-walk for coloring).
	const colorAt = new Map();
	{
		const rng2 = mulberry( ( opts.seed || 7 ) * 7919 + cols );
		const marker = buildLetterGrid(
			rng2,
			words,
			cols,
			rows,
			!! opts.diagonals
		);
		void marker;
	}
	// Simpler: color highlights by word index via a second pass - store
	// per-word cells by re-running placement deterministically is
	// fragile; instead tint all placed cells cycling through the
	// palette by scan order runs.
	let runIdx = 0;
	let lastHit = false;
	for ( let yy = 0; yy < rows; yy++ ) {
		for ( let xx = 0; xx < cols; xx++ ) {
			const hit = placed.has( `${ xx },${ yy }` );
			if ( hit && ! lastHit ) {
				runIdx++;
			}
			if ( hit ) {
				colorAt.set(
					`${ xx },${ yy }`,
					colors[ runIdx % colors.length ]
				);
			}
			lastHit = hit;
		}
	}
	const out = makeCanvas( like, W, H );
	const g = out.getContext( '2d' );
	g.fillStyle = BG[ dark ? 'dark' : 'light' ];
	g.fillRect( 0, 0, W, H );
	const pad = Math.round( W * 0.07 );
	const cw = ( W - 2 * pad ) / cols;
	const ch = ( H - 2 * pad ) / rows;
	const size = Math.min( cw, ch ) * 0.62;
	const dim = Math.max( 0, Math.min( 100, opts.dim ?? 78 ) ) / 100;
	const mutedA = ( 1 - dim ) * 0.85 + 0.12;
	g.font = `600 ${ Math.round( size ) }px ${ famFor( opts.font ) }`;
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	for ( let yy = 0; yy < rows; yy++ ) {
		for ( let xx = 0; xx < cols; xx++ ) {
			const cx = pad + cw * ( xx + 0.5 );
			const cy = pad + ch * ( yy + 0.5 );
			const key = `${ xx },${ yy }`;
			if ( placed.has( key ) ) {
				const col = colorAt.get( key );
				if ( opts.glow ) {
					g.shadowColor = col;
					g.shadowBlur = size * 0.7;
				}
				g.fillStyle = col;
				g.font = `800 ${ Math.round( size ) }px ${ famFor(
					opts.font
				) }`;
				g.fillText( grid[ yy ][ xx ], cx, cy );
				g.shadowBlur = 0;
			} else {
				g.fillStyle = dark
					? `rgba(214,220,228,${ mutedA })`
					: `rgba(40,46,56,${ mutedA })`;
				g.font = `500 ${ Math.round( size ) }px ${ famFor(
					opts.font
				) }`;
				g.fillText( grid[ yy ][ xx ], cx, cy );
			}
		}
	}
	return out;
}

/* ------------------------------- letter tiles ----------------------------- */

const TILE_POINTS = {
	A: 1,
	B: 3,
	C: 3,
	D: 2,
	E: 1,
	F: 4,
	G: 2,
	H: 4,
	I: 1,
	J: 8,
	K: 5,
	L: 1,
	M: 3,
	N: 1,
	O: 1,
	P: 3,
	Q: 10,
	R: 1,
	S: 1,
	T: 1,
	U: 1,
	V: 4,
	W: 4,
	X: 8,
	Y: 4,
	Z: 10,
};

/**
 * Crossing tile placement: word 0 horizontal, later words cross an
 * existing letter, alternating orientation where possible.
 *
 * @param {Array} words Uppercased words.
 * @return {Object} { cells: [{ch,x,y}], minX, minY, maxX, maxY }
 */
export function buildScrabble( words ) {
	const cells = new Map(); // "x,y" -> ch
	const put = ( ch, x, y ) => cells.set( `${ x },${ y }`, ch );
	const list = words
		.map( ( w ) => w.toUpperCase().replace( /[^A-ZÄÖÜ]/g, '' ) )
		.filter( ( w ) => w.length >= 2 )
		.slice( 0, 8 );
	if ( ! list.length ) {
		return null;
	}
	// First word horizontal at 0,0.
	for ( let i = 0; i < list[ 0 ].length; i++ ) {
		put( list[ 0 ][ i ], i, 0 );
	}
	let fallbackY = 2;
	for ( let wi = 1; wi < list.length; wi++ ) {
		const word = list[ wi ];
		let placed = false;
		// Try to cross any existing cell.
		for ( const [ key, ch ] of cells ) {
			if ( placed ) {
				break;
			}
			const [ cx, cy ] = key.split( ',' ).map( Number );
			for ( let k = 0; k < word.length && ! placed; k++ ) {
				if ( word[ k ] !== ch ) {
					continue;
				}
				// Vertical through (cx, cy).
				let okV = true;
				for ( let j = 0; j < word.length && okV; j++ ) {
					const yy = cy - k + j;
					const cur = cells.get( `${ cx },${ yy }` );
					okV = j === k ? true : ! cur;
					// Reject touching parallel neighbours.
					if ( okV && j !== k ) {
						okV =
							! cells.has( `${ cx - 1 },${ yy }` ) &&
							! cells.has( `${ cx + 1 },${ yy }` );
					}
				}
				if ( okV ) {
					for ( let j = 0; j < word.length; j++ ) {
						put( word[ j ], cx, cy - k + j );
					}
					placed = true;
					break;
				}
				// Horizontal through (cx, cy).
				let okH = true;
				for ( let j = 0; j < word.length && okH; j++ ) {
					const xx = cx - k + j;
					const cur = cells.get( `${ xx },${ cy }` );
					okH = j === k ? true : ! cur;
					if ( okH && j !== k ) {
						okH =
							! cells.has( `${ xx },${ cy - 1 }` ) &&
							! cells.has( `${ xx },${ cy + 1 }` );
					}
				}
				if ( okH ) {
					for ( let j = 0; j < word.length; j++ ) {
						put( word[ j ], cx - k + j, cy );
					}
					placed = true;
				}
			}
		}
		if ( ! placed ) {
			for ( let i = 0; i < word.length; i++ ) {
				put( word[ i ], i, fallbackY );
			}
			fallbackY += 2;
		}
	}
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	const outCells = [];
	for ( const [ key, ch ] of cells ) {
		const [ x, y ] = key.split( ',' ).map( Number );
		outCells.push( { ch, x, y } );
		minX = Math.min( minX, x );
		minY = Math.min( minY, y );
		maxX = Math.max( maxX, x );
		maxY = Math.max( maxY, y );
	}
	return { cells: outCells, minX, minY, maxX, maxY };
}

/**
 * Letter-tile poster (crossing wooden tiles).
 *
 * @param {Object} like Canvas-like.
 * @param {Object} opts { width, height, words, background, tileStyle
 *   'wood'|'ivory'|'dark', showPoints }.
 * @return {HTMLCanvasElement}
 */
export function renderScrabble( like, opts = {} ) {
	const W = opts.width || 1200;
	const H = opts.height || 900;
	const built = buildScrabble( opts.words || [] );
	if ( ! built ) {
		return null;
	}
	const dark = 'light' !== opts.background;
	const out = makeCanvas( like, W, H );
	const g = out.getContext( '2d' );
	g.fillStyle = BG[ dark ? 'dark' : 'light' ];
	g.fillRect( 0, 0, W, H );
	const cols = built.maxX - built.minX + 1;
	const rows = built.maxY - built.minY + 1;
	const pad = Math.round( Math.min( W, H ) * 0.08 );
	const tile = Math.min( ( W - 2 * pad ) / cols, ( H - 2 * pad ) / rows );
	const originX = ( W - tile * cols ) / 2;
	const originY = ( H - tile * rows ) / 2;
	const style = opts.tileStyle || 'wood';
	for ( const cell of built.cells ) {
		const x = originX + ( cell.x - built.minX ) * tile;
		const y = originY + ( cell.y - built.minY ) * tile;
		drawTile( g, x, y, tile * 0.94, cell.ch, style, opts.showPoints );
	}
	return out;
}

function drawTile( g, x, y, size, ch, style, showPoints ) {
	const r = size * 0.12;
	g.save();
	// Drop shadow.
	g.shadowColor = 'rgba(0,0,0,0.35)';
	g.shadowBlur = size * 0.12;
	g.shadowOffsetY = size * 0.05;
	const grad = g.createLinearGradient( x, y, x, y + size );
	if ( 'ivory' === style ) {
		grad.addColorStop( 0, '#faf6ea' );
		grad.addColorStop( 1, '#e8e0cb' );
	} else if ( 'dark' === style ) {
		grad.addColorStop( 0, '#2e323a' );
		grad.addColorStop( 1, '#22252b' );
	} else {
		grad.addColorStop( 0, '#eccf97' );
		grad.addColorStop( 1, '#d3a763' );
	}
	g.fillStyle = grad;
	g.beginPath();
	g.moveTo( x + r, y );
	g.arcTo( x + size, y, x + size, y + size, r );
	g.arcTo( x + size, y + size, x, y + size, r );
	g.arcTo( x, y + size, x, y, r );
	g.arcTo( x, y, x + size, y, r );
	g.closePath();
	g.fill();
	g.shadowColor = 'transparent';
	g.strokeStyle =
		'dark' === style ? 'rgba(0,0,0,0.5)' : 'rgba(120,84,32,0.35)';
	g.lineWidth = Math.max( 1, size * 0.02 );
	g.stroke();
	const ink = 'dark' === style ? '#e8ecf2' : '#4a3417';
	g.fillStyle = ink;
	g.font = `700 ${ Math.round( size * 0.52 ) }px Georgia, serif`;
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	g.fillText( ch, x + size / 2, y + size * 0.52 );
	if ( showPoints ) {
		const pts = TILE_POINTS[ ch ] || 4;
		g.font = `600 ${ Math.round( size * 0.17 ) }px Georgia, serif`;
		g.textAlign = 'right';
		g.textBaseline = 'alphabetic';
		g.fillText( String( pts ), x + size * 0.88, y + size * 0.9 );
	}
	g.restore();
}

/* -------------------------------- ransom note ----------------------------- */

// Web-safe font pool: every letter looks cut from a different magazine
// without loading a single font.
const RANSOM_FONTS = [
	'Georgia, serif',
	'"Courier New", monospace',
	'"Arial Black", Arial, sans-serif',
	'Impact, "Arial Black", sans-serif',
	'"Times New Roman", serif',
	'Verdana, sans-serif',
	'"Comic Sans MS", "Comic Sans", cursive',
	'Palatino, "Palatino Linotype", serif',
	'"Trebuchet MS", sans-serif',
];

/**
 * Ransom note: every letter cut from a different magazine - its own
 * font, paper snippet, tilt and shadow. By hand this is per-letter
 * fiddling; here it is one seed.
 *
 * @param {Object} like Canvas-like.
 * @param {Object} opts { width, height, lines (array), colors,
 *   background, paperStyle 'color'|'news', tilt 0..100, seed }.
 * @return {HTMLCanvasElement|null}
 */
export function renderRansomNote( like, opts = {} ) {
	const W = opts.width || 1200;
	const H = opts.height || 900;
	const lines = ( opts.lines || [] )
		.map( ( l ) => String( l ).trim() )
		.filter( Boolean )
		.slice( 0, 6 );
	if ( ! lines.length ) {
		return null;
	}
	const rng = mulberry( ( opts.seed || 7 ) * 2654435761 );
	const dark = 'light' !== opts.background;
	const colors =
		opts.colors && opts.colors.length
			? opts.colors
			: [ '#f94144', '#f9c74f', '#43aa8b', '#577590' ];
	const news = 'news' === opts.paperStyle;
	const tilt =
		( Math.max( 0, Math.min( 100, opts.tilt ?? 55 ) ) / 100 ) * 0.2;
	const out = makeCanvas( like, W, H );
	const g = out.getContext( '2d' );
	g.fillStyle = BG[ dark ? 'dark' : 'light' ];
	g.fillRect( 0, 0, W, H );
	// Letter size from the longest line and the line count.
	const maxChars = Math.max( ...lines.map( ( l ) => l.length ) );
	const size = Math.max(
		18,
		Math.min(
			( ( W * 0.88 ) / Math.max( 4, maxChars ) ) * 1.05,
			( H * 0.8 ) / ( lines.length * 1.45 )
		)
	);
	const stepY = size * 1.42;
	let y = ( H - stepY * lines.length ) / 2 + stepY * 0.62;
	const papers = news ? [ '#f6f2e6', '#efe9da', '#fbf8f0', '#e8e2d2' ] : null;
	for ( const line of lines ) {
		// Measure the line with per-letter padding for centering.
		const widths = [];
		let total = 0;
		for ( const ch of line ) {
			if ( ' ' === ch ) {
				widths.push( size * 0.5 );
				total += size * 0.5;
				continue;
			}
			g.font = `700 ${ Math.round( size ) }px Georgia, serif`;
			const w = Math.max( size * 0.5, g.measureText( ch ).width );
			const pw = w + size * 0.34;
			widths.push( pw );
			total += pw + size * 0.06;
		}
		let x = ( W - total ) / 2;
		for ( let i = 0; i < line.length; i++ ) {
			const ch = line[ i ];
			const pw = widths[ i ];
			if ( ' ' === ch ) {
				x += pw;
				continue;
			}
			const fam = RANSOM_FONTS[ ( rng() * RANSOM_FONTS.length ) | 0 ];
			const rot = ( rng() - 0.5 ) * 2 * tilt;
			const ph = size * ( 1.14 + rng() * 0.16 );
			const paper = news
				? papers[ ( rng() * papers.length ) | 0 ]
				: rng() < 0.35
				? '#f6f3ea'
				: colors[ ( rng() * colors.length ) | 0 ];
			// Ink must contrast the paper.
			const pc = [
				parseInt( paper.slice( 1, 3 ), 16 ),
				parseInt( paper.slice( 3, 5 ), 16 ),
				parseInt( paper.slice( 5, 7 ), 16 ),
			];
			const paperLum =
				0.299 * pc[ 0 ] + 0.587 * pc[ 1 ] + 0.114 * pc[ 2 ];
			const ink = paperLum > 140 ? '#1c1d21' : '#f4f1e8';
			g.save();
			g.translate( x + pw / 2, y - size * 0.36 );
			g.rotate( rot );
			g.shadowColor = 'rgba(0,0,0,0.35)';
			g.shadowBlur = size * 0.1;
			g.shadowOffsetY = size * 0.06;
			g.fillStyle = paper;
			// Slightly irregular snippet quad.
			const jx = () => ( rng() - 0.5 ) * size * 0.08;
			g.beginPath();
			g.moveTo( -pw / 2 + jx(), -ph / 2 + jx() );
			g.lineTo( pw / 2 + jx(), -ph / 2 + jx() );
			g.lineTo( pw / 2 + jx(), ph / 2 + jx() );
			g.lineTo( -pw / 2 + jx(), ph / 2 + jx() );
			g.closePath();
			g.fill();
			g.shadowColor = 'transparent';
			g.fillStyle = ink;
			const upper = rng() < 0.6;
			g.font = `${ rng() < 0.5 ? 700 : 400 } ${ Math.round(
				size * ( 0.82 + rng() * 0.2 )
			) }px ${ fam }`;
			g.textAlign = 'center';
			g.textBaseline = 'middle';
			g.fillText( upper ? ch.toUpperCase() : ch, 0, size * 0.02 );
			g.restore();
			x += pw + size * 0.06;
		}
		y += stepY;
	}
	return out;
}

/* -------------------------------- word cloud ------------------------------- */

// Small bilingual stopword list - enough to keep "the/und/der" out of a
// post-driven cloud without shipping a linguistics package.
const STOPWORDS = new Set(
	(
		'the a an and or but if then else when at by for with about into ' +
		'through of to in on is are was were be been being have has had do ' +
		'does did will would can could this that these those it its as from ' +
		'not no you your we our they their he she his her i my me us them ' +
		'der die das und oder aber wenn dann als bei mit ohne für von zu im ' +
		'in auf ist sind war waren sein bin bist hat habe haben wird werden ' +
		'kann könnte nicht kein eine einen einem einer eines es sie er wir ' +
		'ihr ich du man auch noch nur schon so wie was wer dass sich dem den ' +
		'des am um an aus nach über unter vor'
	).split( /\s+/ )
);

/**
 * Word frequencies from running text, stopwords removed.
 *
 * @param {string} text Source text.
 * @param {number} max  Maximum entries.
 * @return {Array} [ { word, weight } ] sorted by weight desc.
 */
export function tokenizeCloud( text, max = 42 ) {
	const counts = new Map();
	for ( const raw of String( text || '' )
		.toLowerCase()
		.split( /[^\p{L}\p{N}']+/u ) ) {
		const w = raw.replace( /^'+|'+$/g, '' );
		if ( w.length < 3 || STOPWORDS.has( w ) || /^\d+$/.test( w ) ) {
			continue;
		}
		counts.set( w, ( counts.get( w ) || 0 ) + 1 );
	}
	return [ ...counts.entries() ]
		.sort( ( a, b ) => b[ 1 ] - a[ 1 ] )
		.slice( 0, max )
		.map( ( [ word, weight ] ) => ( { word, weight } ) );
}

/**
 * Word cloud: words packed on an archimedean spiral against a coarse
 * occupancy grid, sizes by weight, optional shape mask. The frequency
 * layout is exactly the part you cannot do by hand.
 *
 * @param {Object} like Canvas-like.
 * @param {Object} opts { width, height, entries [{word,weight}], colors,
 *   background, font, seed, mask (canvas|null) }.
 * @return {HTMLCanvasElement|null}
 */
export function renderWordCloud( like, opts = {} ) {
	const W = opts.width || 1200;
	const H = opts.height || 900;
	const entries = ( opts.entries || [] )
		.filter( ( e ) => e && e.word )
		.slice( 0, 60 );
	if ( ! entries.length ) {
		return null;
	}
	const dark = 'light' !== opts.background;
	const colors =
		opts.colors && opts.colors.length ? opts.colors : [ '#3b66ff' ];
	const rng = mulberry( ( opts.seed || 7 ) * 48271 );
	const out = makeCanvas( like, W, H );
	const g = out.getContext( '2d' );
	g.fillStyle = BG[ dark ? 'dark' : 'light' ];
	g.fillRect( 0, 0, W, H );
	// Occupancy grid, 6px cells; a mask blocks the outside.
	const RES = 6;
	const gw = Math.ceil( W / RES );
	const gh = Math.ceil( H / RES );
	const grid = new Uint8Array( gw * gh );
	if ( opts.mask ) {
		const mc = makeCanvas( like, gw, gh );
		const mg = mc.getContext( '2d' );
		mg.drawImage( opts.mask, 0, 0, gw, gh );
		const md = mg.getImageData( 0, 0, gw, gh ).data;
		for ( let i = 0; i < gw * gh; i++ ) {
			if ( md[ i * 4 + 3 ] < 128 ) {
				grid[ i ] = 1;
			}
		}
	}
	const free = ( x0, y0, x1, y1 ) => {
		const gx0 = Math.max( 0, ( x0 / RES ) | 0 );
		const gy0 = Math.max( 0, ( y0 / RES ) | 0 );
		const gx1 = Math.min( gw - 1, ( x1 / RES ) | 0 );
		const gy1 = Math.min( gh - 1, ( y1 / RES ) | 0 );
		if ( x0 < 0 || y0 < 0 || x1 > W || y1 > H || gx1 < gx0 || gy1 < gy0 ) {
			return false;
		}
		for ( let yy = gy0; yy <= gy1; yy++ ) {
			for ( let xx = gx0; xx <= gx1; xx++ ) {
				if ( grid[ yy * gw + xx ] ) {
					return false;
				}
			}
		}
		return true;
	};
	const mark = ( x0, y0, x1, y1 ) => {
		const gx0 = Math.max( 0, ( x0 / RES ) | 0 );
		const gy0 = Math.max( 0, ( y0 / RES ) | 0 );
		const gx1 = Math.min( gw - 1, ( x1 / RES ) | 0 );
		const gy1 = Math.min( gh - 1, ( y1 / RES ) | 0 );
		for ( let yy = gy0; yy <= gy1; yy++ ) {
			for ( let xx = gx0; xx <= gx1; xx++ ) {
				grid[ yy * gw + xx ] = 1;
			}
		}
	};
	const sorted = [ ...entries ].sort(
		( a, b ) => ( b.weight || 1 ) - ( a.weight || 1 )
	);
	const maxW = Math.max( 1, sorted[ 0 ].weight || 1 );
	const maxS = Math.min( W, H ) * ( opts.mask ? 0.14 : 0.2 );
	const minS = Math.max( 11, maxS * 0.14 );
	let placedCount = 0;
	sorted.forEach( ( e, i ) => {
		const k = Math.pow( ( e.weight || 1 ) / maxW, 0.72 );
		const size = Math.round( minS + k * ( maxS - minS ) );
		const vertical = i > 0 && rng() < 0.26;
		g.font = `700 ${ size }px ${ famFor( opts.font ) }`;
		const tw = g.measureText( e.word ).width;
		const th = size * 1.08;
		const bw = vertical ? th : tw;
		const bh = vertical ? tw : th;
		// Archimedean spiral from a jittered start.
		const a0 = rng() * Math.PI * 2;
		let placed = false;
		for ( let s = 0; s < 900 && ! placed; s++ ) {
			const theta = a0 + s * 0.32;
			const rr = 2 + s * 0.62;
			const cx = W / 2 + Math.cos( theta ) * rr;
			const cy = H / 2 + Math.sin( theta ) * rr * ( H / W );
			const x0 = cx - bw / 2 - 3;
			const y0 = cy - bh / 2 - 3;
			const x1 = cx + bw / 2 + 3;
			const y1 = cy + bh / 2 + 3;
			if ( ! free( x0, y0, x1, y1 ) ) {
				continue;
			}
			mark( x0, y0, x1, y1 );
			g.save();
			g.translate( cx, cy );
			if ( vertical ) {
				g.rotate( -Math.PI / 2 );
			}
			g.fillStyle = colors[ ( i + ( placedCount % 2 ) ) % colors.length ];
			g.textAlign = 'center';
			g.textBaseline = 'middle';
			g.fillText( e.word, 0, 0 );
			g.restore();
			placed = true;
			placedCount++;
		}
	} );
	return placedCount ? out : null;
}

/* -------------------------------- shape masks ----------------------------- */

/**
 * Alpha shape mask so image-driven types can run without a photo:
 * opaque shape on transparent ground.
 *
 * @param {Object} like  Canvas-like.
 * @param {number} w     Width.
 * @param {number} h     Height.
 * @param {string} shape 'heart'|'star'|'circle'|'diamond'|'letter'|'emoji'.
 * @param {string} text  Letter/emoji for the glyph shapes.
 * @param {string} font  Font family for letter shapes.
 * @return {HTMLCanvasElement}
 */
export function makeShapeMask( like, w, h, shape, text, font ) {
	const c = makeCanvas( like, w, h );
	const g = c.getContext( '2d' );
	const cx = w / 2;
	const cy = h / 2;
	const s = Math.min( w, h ) * 0.42;
	g.fillStyle = '#000';
	if ( 'letter' === shape || 'emoji' === shape ) {
		const glyph = ( text || 'A' ).trim() || 'A';
		g.font = `900 ${ Math.round( Math.min( w, h ) * 0.86 ) }px ${ famFor(
			font
		) }`;
		g.textAlign = 'center';
		g.textBaseline = 'middle';
		g.fillText( glyph, cx, cy + Math.min( w, h ) * 0.03 );
	} else if ( 'star' === shape ) {
		g.beginPath();
		for ( let i = 0; i < 10; i++ ) {
			const rad = i % 2 ? s * 0.45 : s;
			const a = -Math.PI / 2 + ( i * Math.PI ) / 5;
			const px = cx + Math.cos( a ) * rad;
			const py = cy + Math.sin( a ) * rad;
			if ( i ) {
				g.lineTo( px, py );
			} else {
				g.moveTo( px, py );
			}
		}
		g.closePath();
		g.fill();
	} else if ( 'circle' === shape ) {
		g.beginPath();
		g.arc( cx, cy, s, 0, Math.PI * 2 );
		g.fill();
	} else if ( 'diamond' === shape ) {
		g.beginPath();
		g.moveTo( cx, cy - s );
		g.lineTo( cx + s * 0.78, cy );
		g.lineTo( cx, cy + s );
		g.lineTo( cx - s * 0.78, cy );
		g.closePath();
		g.fill();
	} else {
		// Heart.
		const t = s / 16;
		g.beginPath();
		g.moveTo( cx, cy + 11 * t );
		g.bezierCurveTo(
			cx - 14 * t,
			cy + 1 * t,
			cx - 10 * t,
			cy - 10 * t,
			cx,
			cy - 4 * t
		);
		g.bezierCurveTo(
			cx + 10 * t,
			cy - 10 * t,
			cx + 14 * t,
			cy + 1 * t,
			cx,
			cy + 11 * t
		);
		g.closePath();
		g.fill();
	}
	return c;
}
