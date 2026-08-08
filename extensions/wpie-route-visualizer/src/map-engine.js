/**
 * Map Posters render engine: compact OSM elements (from the editor's geo
 * proxy, see docs/extending.md "bridge.api.geo") to a poster-style canvas.
 *
 * Pure module: projection, themes, coastline-to-sea stitching, drawing.
 * No DOM globals beyond the 2d context handed in, so the whole engine is
 * unit-testable in jsdom/node-canvas.
 */

/* ------------------------------ geo helpers ------------------------------ */

const R_EARTH = 6371000;

/** Great-circle distance in meters. */
export function haversineM( a, b ) {
	const rad = ( d ) => ( d * Math.PI ) / 180;
	const dLat = rad( b.lat - a.lat );
	const dLon = rad( b.lon - a.lon );
	const s =
		Math.sin( dLat / 2 ) ** 2 +
		Math.cos( rad( a.lat ) ) *
			Math.cos( rad( b.lat ) ) *
			Math.sin( dLon / 2 ) ** 2;
	return 2 * R_EARTH * Math.asin( Math.sqrt( s ) );
}

/** "1.8 km" / "850 m" (poster label, no locale grouping). */
export function formatDistance( m ) {
	if ( m < 1000 ) {
		return `${ Math.round( m ) } m`;
	}
	const km = m / 1000;
	return `${ km >= 100 ? Math.round( km ) : km.toFixed( 1 ) } km`;
}

/** "53.5440° N / 9.9870° E" - the classic poster coordinates line. */
export function formatCoords( lat, lon ) {
	const f = ( v, pos, neg ) =>
		`${ Math.abs( v ).toFixed( 4 ) }° ${ v >= 0 ? pos : neg }`;
	return `${ f( lat, 'N', 'S' ) } / ${ f( lon, 'E', 'W' ) }`;
}

/**
 * Square-ish viewport bbox around a center.
 *
 * @param {Object} center   { lat, lon }.
 * @param {number} radiusM  Half the edge length in meters.
 * @param {number} [aspect] Width / height (default 1).
 * @return {Object} { south, west, north, east }
 */
export function viewportBBox( center, radiusM, aspect = 1 ) {
	const latSpan = ( radiusM * 2 ) / 111320;
	const lonSpan =
		( latSpan * Math.max( aspect, 0.01 ) ) /
		Math.max( 0.05, Math.cos( ( center.lat * Math.PI ) / 180 ) );
	return {
		south: center.lat - latSpan / 2,
		north: center.lat + latSpan / 2,
		west: center.lon - lonSpan / 2,
		east: center.lon + lonSpan / 2,
	};
}

/** Proxy detail level for a viewport radius. */
export function detailForRadius( radiusM ) {
	if ( radiusM <= 3000 ) {
		return 3;
	}
	return radiusM <= 24000 ? 2 : 1;
}

/** Building footprints are only available close up (proxy span cap). */
export const buildingsAvailable = ( radiusM ) => radiusM <= 2500;

/* -------------------------------- themes --------------------------------- */

/**
 * Curated poster palettes. `road` fades from motorway (strongest) to
 * path (faintest); `text` doubles as the default color for the inserted
 * text layers and pins unless the theme sets `pin`.
 */
export const THEMES = [
	{
		id: 'minimal',
		label: 'Minimal',
		bg: '#ffffff',
		water: '#dce5ee',
		green: '#e9efe4',
		sand: '#f3ead8',
		building: '#efefef',
		rail: '#b7bcc4',
		road: {
			motorway: '#0f172a',
			primary: '#1f2937',
			secondary: '#4b5563',
			minor: '#8b939e',
			path: '#c3c9d1',
		},
		text: '#0f172a',
		pin: '#0f172a',
	},
	{
		id: 'midnight',
		label: 'Midnight',
		bg: '#0b1220',
		water: '#182742',
		green: '#0f1d31',
		sand: '#1c2a44',
		building: '#111e33',
		rail: '#33415c',
		road: {
			motorway: '#f8fafc',
			primary: '#cbd5e1',
			secondary: '#8ea3bd',
			minor: '#46587a',
			path: '#293a5c',
		},
		text: '#f8fafc',
		pin: '#38bdf8',
	},
	{
		id: 'blueprint',
		label: 'Blueprint',
		bg: '#15418f',
		water: '#0e2f6e',
		green: '#1a4a9c',
		sand: '#1d4d9f',
		building: '#1c4796',
		rail: '#7f9be0',
		road: {
			motorway: '#ffffff',
			primary: '#dbe6ff',
			secondary: '#aec4f2',
			minor: '#7391d1',
			path: '#4a6cb0',
		},
		text: '#ffffff',
		pin: '#ffd166',
	},
	{
		id: 'terracotta',
		label: 'Terracotta',
		bg: '#f6ede3',
		water: '#cfe0dd',
		green: '#e6e9d4',
		sand: '#f0dfc0',
		building: '#eadfd2',
		rail: '#c49a83',
		road: {
			motorway: '#5e2f1f',
			primary: '#7a3f2a',
			secondary: '#a05a3d',
			minor: '#c98d70',
			path: '#e3c0ae',
		},
		text: '#5e2f1f',
		pin: '#c25e40',
	},
	{
		id: 'forest',
		label: 'Forest',
		bg: '#10251a',
		water: '#0d3229',
		green: '#16331f',
		sand: '#233b28',
		building: '#17301f',
		rail: '#3c5a44',
		road: {
			motorway: '#f2f7e8',
			primary: '#cfe3c0',
			secondary: '#9bc08d',
			minor: '#4f7c57',
			path: '#2e5239',
		},
		text: '#f2f7e8',
		pin: '#ffd166',
	},
	{
		id: 'neon',
		label: 'Neon',
		bg: '#0d0221',
		water: '#150a3a',
		green: '#160f3e',
		sand: '#1d1447',
		building: '#130b36',
		rail: '#4c3a8f',
		road: {
			motorway: '#00fff7',
			primary: '#ff2bd6',
			secondary: '#8b5cf6',
			minor: '#43307f',
			path: '#271c55',
		},
		text: '#00fff7',
		pin: '#ff2bd6',
	},
	{
		id: 'vintage',
		label: 'Vintage',
		bg: '#f4ecd8',
		water: '#b9c8bd',
		green: '#dcd8b8',
		sand: '#ead9b0',
		building: '#e6dcc4',
		rail: '#9b8a70',
		road: {
			motorway: '#3b2f21',
			primary: '#4a3b2a',
			secondary: '#71604a',
			minor: '#a4937a',
			path: '#cfc2ab',
		},
		text: '#3b2f21',
		pin: '#7d2e2e',
	},
	{
		id: 'golden',
		label: 'Golden',
		bg: '#101010',
		water: '#181d24',
		green: '#141a12',
		sand: '#1d1a12',
		building: '#161616',
		rail: '#4a3d24',
		road: {
			motorway: '#f5c76b',
			primary: '#d9a84e',
			secondary: '#a97f3a',
			minor: '#63512a',
			path: '#3a311d',
		},
		text: '#f5c76b',
		pin: '#f5c76b',
	},
	{
		id: 'rose',
		label: 'Rose',
		bg: '#fdf2f4',
		water: '#d8e6ee',
		green: '#e9ecd9',
		sand: '#f4e6d1',
		building: '#f3e3e7',
		rail: '#cf9dab',
		road: {
			motorway: '#6d2136',
			primary: '#8c2f45',
			secondary: '#b25a6e',
			minor: '#d99aa8',
			path: '#eccad2',
		},
		text: '#6d2136',
		pin: '#c94f6d',
	},
	{
		id: 'ocean',
		label: 'Ocean',
		bg: '#eef6f9',
		water: '#a7cede',
		green: '#d9e8d6',
		sand: '#f2e3c1',
		building: '#e2edf1',
		rail: '#8fb0bb',
		road: {
			motorway: '#0a3540',
			primary: '#0f4c5c',
			secondary: '#3d7d8c',
			minor: '#8fb9c2',
			path: '#c9dfe5',
		},
		text: '#0a3540',
		pin: '#e76f51',
	},
];

/** Hex color lerp for the custom "one road color" override. */
export function mixHex( a, b, t ) {
	const pa = /^#?([0-9a-f]{6})$/i.exec( a );
	const pb = /^#?([0-9a-f]{6})$/i.exec( b );
	if ( ! pa || ! pb ) {
		return a;
	}
	const na = parseInt( pa[ 1 ], 16 );
	const nb = parseInt( pb[ 1 ], 16 );
	const ch = ( sh ) => {
		const va = ( na >> sh ) & 255;
		const vb = ( nb >> sh ) & 255;
		return Math.round( va + ( vb - va ) * t );
	};
	return `#${ ( ( ch( 16 ) << 16 ) | ( ch( 8 ) << 8 ) | ch( 0 ) )
		.toString( 16 )
		.padStart( 6, '0' ) }`;
}

/**
 * Effective palette: theme + user overrides. A single `road` override
 * spreads across all classes by fading toward the background, so one
 * swatch still yields a coherent hierarchy.
 *
 * @param {Object} theme     Theme entry.
 * @param {Object} overrides { bg?, water?, green?, road? }.
 * @return {Object} Same shape as a theme.
 */
export function paletteFor( theme, overrides = {} ) {
	const bg = overrides.bg || theme.bg;
	const road = overrides.road
		? {
				motorway: overrides.road,
				primary: mixHex( overrides.road, bg, 0.12 ),
				secondary: mixHex( overrides.road, bg, 0.32 ),
				minor: mixHex( overrides.road, bg, 0.55 ),
				path: mixHex( overrides.road, bg, 0.75 ),
		  }
		: theme.road;
	return {
		...theme,
		bg,
		water: overrides.water || theme.water,
		green: overrides.green || theme.green,
		road,
		rail: overrides.road ? mixHex( overrides.road, bg, 0.6 ) : theme.rail,
	};
}

/* ------------------------------- projection ------------------------------ */

const mercN = ( lat ) =>
	Math.log( Math.tan( Math.PI / 4 + ( lat * Math.PI ) / 360 ) );

/**
 * WebMercator projector for a bbox onto a w×h canvas (fills exactly).
 *
 * @param {Object} bbox { south, west, north, east }.
 * @param {number} w    Canvas width.
 * @param {number} h    Canvas height.
 * @return {Function} ( lat, lon ) → [x, y]
 */
export function makeProjector( bbox, w, h ) {
	const yN = mercN( bbox.north );
	const yS = mercN( bbox.south );
	const xSpan = bbox.east - bbox.west;
	const ySpan = yN - yS || 1e-9;
	return ( lat, lon ) => [
		( ( lon - bbox.west ) / ( xSpan || 1e-9 ) ) * w,
		( ( yN - mercN( lat ) ) / ySpan ) * h,
	];
}

/**
 * Inverse of makeProjector: canvas pixels back to [lat, lon] (exact
 * WebMercator inverse, used for dragging pins on the preview).
 *
 * @param {Object} bbox { south, west, north, east }.
 * @param {number} w    Canvas width.
 * @param {number} h    Canvas height.
 * @return {Function} ( x, y ) → [lat, lon]
 */
export function makeUnprojector( bbox, w, h ) {
	const yN = mercN( bbox.north );
	const yS = mercN( bbox.south );
	const xSpan = bbox.east - bbox.west;
	return ( x, y ) => {
		const m = yN - ( y / ( h || 1 ) ) * ( yN - yS );
		return [
			( Math.atan( Math.exp( m ) ) * 360 ) / Math.PI - 90,
			bbox.west + ( x / ( w || 1 ) ) * xSpan,
		];
	};
}

/* --------------------------- coastline stitching -------------------------- */

const EPS = 1e-6;
const keyOf = ( lat, lon ) =>
	`${ Math.round( lat / EPS ) }:${ Math.round( lon / EPS ) }`;

/** Flat [lat,lon,…] → [ [lat,lon], … ]. */
const unflatten = ( g ) => {
	const pts = [];
	for ( let i = 0; i + 1 < g.length; i += 2 ) {
		pts.push( [ g[ i ], g[ i + 1 ] ] );
	}
	return pts;
};

/** Join coast ways end-to-start into chains (OSM coastlines are directed). */
export function stitchChains( ways ) {
	const chains = ways.map( unflatten ).filter( ( c ) => c.length > 1 );
	const byStart = new Map();
	chains.forEach( ( c ) =>
		byStart.set( keyOf( c[ 0 ][ 0 ], c[ 0 ][ 1 ] ), c )
	);
	const used = new Set();
	const out = [];
	for ( const chain of chains ) {
		if ( used.has( chain ) ) {
			continue;
		}
		used.add( chain );
		const merged = chain.slice();
		for (;;) {
			const last = merged[ merged.length - 1 ];
			const next = byStart.get( keyOf( last[ 0 ], last[ 1 ] ) );
			if ( ! next || used.has( next ) || next === chain ) {
				break;
			}
			used.add( next );
			merged.push( ...next.slice( 1 ) );
		}
		out.push( merged );
	}
	return out;
}

const inBox = ( p, b ) =>
	p[ 0 ] >= b.south - EPS &&
	p[ 0 ] <= b.north + EPS &&
	p[ 1 ] >= b.west - EPS &&
	p[ 1 ] <= b.east + EPS;

/** Intersections of segment a→b with the bbox border, as sorted ts. */
function edgeTs( a, b, box ) {
	const ts = [];
	const dLat = b[ 0 ] - a[ 0 ];
	const dLon = b[ 1 ] - a[ 1 ];
	const consider = ( t ) => {
		if ( t > EPS && t < 1 - EPS ) {
			ts.push( t );
		}
	};
	if ( dLat ) {
		consider( ( box.south - a[ 0 ] ) / dLat );
		consider( ( box.north - a[ 0 ] ) / dLat );
	}
	if ( dLon ) {
		consider( ( box.west - a[ 1 ] ) / dLon );
		consider( ( box.east - a[ 1 ] ) / dLon );
	}
	return ts
		.filter( ( t ) => {
			const p = [ a[ 0 ] + dLat * t, a[ 1 ] + dLon * t ];
			return inBox( p, box );
		} )
		.sort( ( x, y ) => x - y );
}

/** Clip a chain to the bbox: list of sub-chains fully inside. */
export function clipChain( chain, box ) {
	const out = [];
	let cur = null;
	const push = ( p ) => {
		if ( ! cur ) {
			cur = [];
			out.push( cur );
		}
		cur.push( p );
	};
	for ( let i = 0; i < chain.length - 1; i++ ) {
		const a = chain[ i ];
		const b = chain[ i + 1 ];
		const aIn = inBox( a, box );
		const cuts = edgeTs( a, b, box ).map( ( t ) => [
			a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * t,
			a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * t,
		] );
		if ( aIn ) {
			push( a );
		}
		let inside = aIn;
		for ( const p of cuts ) {
			if ( inside ) {
				push( p );
				cur = null; // left the box: close this sub-chain
			} else {
				push( p ); // entered the box
			}
			inside = ! inside;
		}
	}
	const last = chain[ chain.length - 1 ];
	if ( inBox( last, box ) ) {
		push( last );
	}
	return out.filter( ( c ) => c.length > 1 );
}

/** Clockwise border parameter (0..4) of a point on/near the bbox edge. */
function borderParam( p, b ) {
	const latSpan = b.north - b.south || 1e-9;
	const lonSpan = b.east - b.west || 1e-9;
	const dTop = Math.abs( p[ 0 ] - b.north ) / latSpan;
	const dBottom = Math.abs( p[ 0 ] - b.south ) / latSpan;
	const dLeft = Math.abs( p[ 1 ] - b.west ) / lonSpan;
	const dRight = Math.abs( p[ 1 ] - b.east ) / lonSpan;
	const min = Math.min( dTop, dBottom, dLeft, dRight );
	if ( min === dTop ) {
		return ( p[ 1 ] - b.west ) / lonSpan; // top: W→E is 0..1
	}
	if ( min === dRight ) {
		return 1 + ( b.north - p[ 0 ] ) / latSpan; // right: N→S is 1..2
	}
	if ( min === dBottom ) {
		return 2 + ( b.east - p[ 1 ] ) / lonSpan; // bottom: E→W is 2..3
	}
	return 3 + ( p[ 0 ] - b.south ) / latSpan; // left: S→N is 3..4
}

/** Point on the border for a clockwise parameter. */
function borderPoint( t, b ) {
	const u = ( ( t % 4 ) + 4 ) % 4;
	if ( u < 1 ) {
		return [ b.north, b.west + u * ( b.east - b.west ) ];
	}
	if ( u < 2 ) {
		return [ b.north - ( u - 1 ) * ( b.north - b.south ), b.east ];
	}
	if ( u < 3 ) {
		return [ b.south, b.east - ( u - 2 ) * ( b.east - b.west ) ];
	}
	return [ b.south + ( u - 3 ) * ( b.north - b.south ), b.west ];
}

/**
 * Sea polygons from coastline elements. OSM coastlines keep the water on
 * the RIGHT of the way direction, so closing each clipped chain
 * clockwise along the bbox border enclosing the right-hand side yields
 * the sea. Closed island rings become holes (drawn with evenodd).
 *
 * @param {Array}  coastEls Elements of kind 'coast' ({ g }).
 * @param {Object} bbox     { south, west, north, east }.
 * @return {Array} Polygons as point lists [ [lat,lon], … ]; the first
 *                 group are sea outers, closed rings are appended for
 *                 evenodd hole punching.
 */
export function seaPolygons( coastEls, bbox ) {
	if ( ! coastEls.length ) {
		return [];
	}
	const chains = stitchChains( coastEls.map( ( e ) => e.g ) );
	const tol =
		Math.max( bbox.north - bbox.south, bbox.east - bbox.west ) * 1e-6;
	const onBorder = ( p ) =>
		Math.abs( p[ 0 ] - bbox.south ) < tol ||
		Math.abs( p[ 0 ] - bbox.north ) < tol ||
		Math.abs( p[ 1 ] - bbox.west ) < tol ||
		Math.abs( p[ 1 ] - bbox.east ) < tol;
	const open = [];
	const rings = [];
	for ( const chain of chains ) {
		const first = chain[ 0 ];
		const last = chain[ chain.length - 1 ];
		const closed =
			Math.abs( first[ 0 ] - last[ 0 ] ) < EPS &&
			Math.abs( first[ 1 ] - last[ 1 ] ) < EPS;
		for ( const part of clipChain( chain, bbox ) ) {
			const pFirst = part[ 0 ];
			const pLast = part[ part.length - 1 ];
			const partClosed =
				closed &&
				Math.abs( pFirst[ 0 ] - pLast[ 0 ] ) < EPS &&
				Math.abs( pFirst[ 1 ] - pLast[ 1 ] ) < EPS;
			if ( partClosed ) {
				rings.push( part );
			} else if ( onBorder( pFirst ) && onBorder( pLast ) ) {
				open.push( {
					pts: part,
					entry: borderParam( pFirst, bbox ),
					exit: borderParam( pLast, bbox ),
					used: false,
				} );
			}
			// Fragments that end mid-water (harbor moles, cut data) cannot
			// anchor the border walk: skipping them beats a wrong sea wedge.
		}
	}

	const polys = [];
	for ( const start of open ) {
		if ( start.used ) {
			continue;
		}
		const poly = [];
		let cur = start;
		for ( let guard = 0; guard <= open.length; guard++ ) {
			cur.used = true;
			poly.push( ...cur.pts );
			// Walk the border clockwise from this exit to the nearest entry.
			let best = null;
			let bestDelta = Infinity;
			for ( const cand of open ) {
				if ( cand.used && cand !== start ) {
					continue;
				}
				let delta = cand.entry - cur.exit;
				while ( delta <= EPS ) {
					delta += 4;
				}
				if ( delta < bestDelta ) {
					bestDelta = delta;
					best = cand;
				}
			}
			if ( ! best ) {
				break;
			}
			// Corners passed on the way.
			for (
				let corner = Math.ceil( cur.exit + EPS );
				corner < cur.exit + bestDelta - EPS;
				corner++
			) {
				poly.push( borderPoint( corner, bbox ) );
			}
			if ( best === start ) {
				break;
			}
			cur = best;
		}
		if ( poly.length > 2 ) {
			polys.push( poly );
		}
	}

	// No open chains at all but closed rings exist: islands in open sea -
	// the sea is the whole bbox, rings punch the land out.
	if ( ! polys.length && rings.length ) {
		polys.push( [
			[ bbox.north, bbox.west ],
			[ bbox.north, bbox.east ],
			[ bbox.south, bbox.east ],
			[ bbox.south, bbox.west ],
		] );
	}
	return polys.concat( rings );
}

/* -------------------------------- drawing -------------------------------- */

/** Mask outline path in a w×h box (no fill/stroke here). */
export function maskPathOn( ctx, mask, w, h ) {
	const cx = w / 2;
	const cy = h / 2;
	const r = Math.min( w, h ) / 2;
	ctx.beginPath();
	if ( 'circle' === mask ) {
		ctx.arc( cx, cy, r, 0, Math.PI * 2 );
	} else if ( 'heart' === mask ) {
		// Classic two-lobe icon heart: dip between the lobes at the top,
		// single point at the bottom, centered in the short side.
		const s = Math.min( w, h );
		const X = ( u ) => cx - s / 2 + u * s;
		const Y = ( v ) => cy - s / 2 + v * s;
		ctx.moveTo( X( 0.5 ), Y( 0.91 ) );
		ctx.bezierCurveTo(
			X( 0.24 ),
			Y( 0.66 ),
			X( 0.1 ),
			Y( 0.52 ),
			X( 0.1 ),
			Y( 0.36 )
		);
		ctx.bezierCurveTo(
			X( 0.1 ),
			Y( 0.23 ),
			X( 0.2 ),
			Y( 0.13 ),
			X( 0.33 ),
			Y( 0.13 )
		);
		ctx.bezierCurveTo(
			X( 0.41 ),
			Y( 0.13 ),
			X( 0.47 ),
			Y( 0.17 ),
			X( 0.5 ),
			Y( 0.25 )
		);
		ctx.bezierCurveTo(
			X( 0.53 ),
			Y( 0.17 ),
			X( 0.59 ),
			Y( 0.13 ),
			X( 0.67 ),
			Y( 0.13 )
		);
		ctx.bezierCurveTo(
			X( 0.8 ),
			Y( 0.13 ),
			X( 0.9 ),
			Y( 0.23 ),
			X( 0.9 ),
			Y( 0.36 )
		);
		ctx.bezierCurveTo(
			X( 0.9 ),
			Y( 0.52 ),
			X( 0.76 ),
			Y( 0.66 ),
			X( 0.5 ),
			Y( 0.91 )
		);
		ctx.closePath();
	} else if ( 'hex' === mask ) {
		for ( let i = 0; i < 6; i++ ) {
			const a = ( Math.PI / 3 ) * i - Math.PI / 2;
			const x = cx + r * Math.cos( a );
			const y = cy + r * Math.sin( a );
			if ( i ) {
				ctx.lineTo( x, y );
			} else {
				ctx.moveTo( x, y );
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

const ROAD_ORDER = [ 'path', 'minor', 'secondary', 'primary', 'motorway' ];
const ROAD_W = {
	motorway: 5.4,
	primary: 3.8,
	secondary: 2.5,
	minor: 1.5,
	path: 0.7,
};

/* ------------------------------ retained scene --------------------------- */

const HAS_PATH2D = 'undefined' !== typeof Path2D;

/**
 * Retained path: a native Path2D in the browser (replaying it per frame
 * is what makes pan/zoom cheap), a recorded op list where Path2D is
 * missing (node-canvas in the test runner).
 */
function newPath() {
	return HAS_PATH2D
		? { p2d: new Path2D(), ops: null, n: 0 }
		: { p2d: null, ops: [], n: 0 };
}

function pathMove( path, x, y ) {
	path.n++;
	if ( path.p2d ) {
		path.p2d.moveTo( x, y );
	} else {
		path.ops.push( 0, x, y );
	}
}

function pathLine( path, x, y ) {
	path.n++;
	if ( path.p2d ) {
		path.p2d.lineTo( x, y );
	} else {
		path.ops.push( 1, x, y );
	}
}

function pathClose( path ) {
	if ( path.p2d ) {
		path.p2d.closePath();
	} else {
		path.ops.push( 2, 0, 0 );
	}
}

function replayOps( ctx, ops ) {
	ctx.beginPath();
	for ( let i = 0; i < ops.length; i += 3 ) {
		if ( 0 === ops[ i ] ) {
			ctx.moveTo( ops[ i + 1 ], ops[ i + 2 ] );
		} else if ( 1 === ops[ i ] ) {
			ctx.lineTo( ops[ i + 1 ], ops[ i + 2 ] );
		} else {
			ctx.closePath();
		}
	}
}

function fillPath( ctx, path, color ) {
	if ( ! path.n ) {
		return;
	}
	ctx.fillStyle = color;
	if ( path.p2d ) {
		ctx.fill( path.p2d, 'evenodd' );
	} else {
		replayOps( ctx, path.ops );
		ctx.fill( 'evenodd' );
	}
}

function strokePath( ctx, path, color, width ) {
	if ( ! path.n || width <= 0 ) {
		return;
	}
	ctx.strokeStyle = color;
	ctx.lineWidth = width;
	if ( path.p2d ) {
		ctx.stroke( path.p2d );
	} else {
		replayOps( ctx, path.ops );
		ctx.stroke();
	}
}

// World coordinates: WebMercator (conformal, so x/y scales match
// locally and stroke widths stay round). Y grows downward like canvas.
const worldX = ( lon ) => ( lon * Math.PI ) / 180;
const worldY = ( lat ) => -mercN( lat );

function traceFlat( path, g, close ) {
	for ( let i = 0; i + 1 < g.length; i += 2 ) {
		const x = worldX( g[ i + 1 ] );
		const y = worldY( g[ i ] );
		if ( i ) {
			pathLine( path, x, y );
		} else {
			pathMove( path, x, y );
		}
	}
	if ( close ) {
		pathClose( path );
	}
}

/**
 * Build the retained scene for a data payload once; drawScene() then
 * replays it per frame. Rebuild only when the DATA changes - pan, zoom,
 * theme, toggles and mask changes just redraw.
 *
 * @param {Object} data { els } from the geo proxy.
 * @return {Object} Scene of retained paths.
 */
export function buildScene( data ) {
	const scene = {
		water: newPath(),
		green: newPath(),
		sand: newPath(),
		building: newPath(),
		river: newPath(),
		stream: newPath(),
		rail: newPath(),
		roads: {
			motorway: newPath(),
			primary: newPath(),
			secondary: newPath(),
			minor: newPath(),
			path: newPath(),
		},
		coast: [],
		n: 0,
	};
	for ( const e of ( data && data.els ) || [] ) {
		scene.n++;
		if ( 'road' === e.k ) {
			traceFlat( scene.roads[ e.c ] || scene.roads.minor, e.g );
		} else if ( 'rail' === e.k ) {
			traceFlat( scene.rail, e.g );
		} else if ( 'waterline' === e.k ) {
			traceFlat( 'stream' === e.c ? scene.stream : scene.river, e.g );
		} else if ( 'coast' === e.k ) {
			scene.coast.push( e );
		} else if ( scene[ e.k ] ) {
			if ( e.rings ) {
				for ( const ring of e.rings ) {
					traceFlat( scene[ e.k ], ring.g, true );
				}
			} else {
				traceFlat( scene[ e.k ], e.g, true );
			}
		}
	}
	return scene;
}

/**
 * The Tabler "map-pin-filled" shape (matching the editor's icon set),
 * built from arcs so it renders identically in the browser and in
 * node-canvas: a circle of radius 9 around (12, 11) in the icon's
 * 24-unit box, two tangents meeting in the tip at (12, 22), and a
 * punched-out core. The tip lands exactly on (x, y).
 */
export function drawPin( ctx, x, y, size, color, coreColor ) {
	const k = ( size * 2.2 ) / 22;
	const cx = x;
	const cy = y - 11 * k;
	const r = 9 * k;
	// Tangent points of the tip: cos(beta) = r / distance(tip, center).
	const beta = Math.acos( 9 / 11 );
	ctx.beginPath();
	ctx.moveTo( x, y );
	// Right tangent point, then the long way around the top lobe.
	ctx.arc( cx, cy, r, Math.PI / 2 - beta, Math.PI / 2 + beta, true );
	ctx.closePath();
	ctx.fillStyle = color;
	ctx.fill();
	ctx.beginPath();
	ctx.arc( cx, cy, 3.2 * k, 0, Math.PI * 2 );
	ctx.fillStyle = coreColor;
	ctx.fill();
}

/**
 * Draw a full frame from a retained scene.
 *
 * @param {CanvasRenderingContext2D} ctx   Target context.
 * @param {number}                   w     Width in px.
 * @param {number}                   h     Height in px.
 * @param {Object}                   scene From buildScene().
 * @param {Object}                   opts  Same options as renderMap minus `data`.
 */
export function drawScene( ctx, w, h, scene, opts ) {
	const {
		bbox,
		theme,
		overrides = {},
		show = {},
		lineScale = 1,
		mask = 'none',
		pins = [],
		route = 'none',
		showDistance = false,
		pinScale = 1,
	} = opts;
	const pal = paletteFor( theme, overrides );
	const S = ( Math.min( w, h ) / 1000 ) * lineScale;

	const x0 = worldX( bbox.west );
	const y0 = worldY( bbox.north );
	const sx = w / ( worldX( bbox.east ) - x0 || 1e-12 );
	const sy = h / ( worldY( bbox.south ) - y0 || 1e-12 );
	const sAvg = ( sx + sy ) / 2;
	const toWorld = ( devicePx ) => devicePx / sAvg;

	ctx.save();
	maskPathOn( ctx, mask, w, h );
	ctx.clip();
	ctx.fillStyle = pal.bg;
	ctx.fillRect( 0, 0, w, h );
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';

	ctx.save();
	ctx.transform( sx, 0, 0, sy, -x0 * sx, -y0 * sy );

	if ( false !== show.water ) {
		if ( scene.coast.length ) {
			// Sea polygons depend on the viewport border: rebuilt per draw,
			// but coastlines are few (stitching is cheap next to the roads).
			const sea = newPath();
			for ( const poly of seaPolygons( scene.coast, bbox ) ) {
				poly.forEach( ( p, i ) => {
					const x = worldX( p[ 1 ] );
					const y = worldY( p[ 0 ] );
					if ( i ) {
						pathLine( sea, x, y );
					} else {
						pathMove( sea, x, y );
					}
				} );
				pathClose( sea );
			}
			fillPath( ctx, sea, pal.water );
		}
		fillPath( ctx, scene.water, pal.water );
	}
	if ( false !== show.green ) {
		fillPath( ctx, scene.green, pal.green );
		fillPath( ctx, scene.sand, pal.sand );
	}
	if ( show.buildings ) {
		fillPath( ctx, scene.building, pal.building );
	}
	if ( false !== show.water ) {
		strokePath( ctx, scene.river, pal.water, toWorld( 4.5 * S ) );
		strokePath( ctx, scene.stream, pal.water, toWorld( 1.6 * S ) );
	}
	if ( false !== show.rail ) {
		strokePath( ctx, scene.rail, pal.rail, toWorld( 1.4 * S ) );
		// Cross-tie dashes in the background color: instant "railway" read.
		ctx.save();
		ctx.setLineDash( [ toWorld( 5 * S ), toWorld( 5 * S ) ] );
		strokePath( ctx, scene.rail, pal.bg, toWorld( 0.8 * S ) );
		ctx.restore();
	}
	for ( const cls of ROAD_ORDER ) {
		if ( 'path' === cls && false === show.paths ) {
			continue;
		}
		strokePath(
			ctx,
			scene.roads[ cls ],
			pal.road[ cls ],
			toWorld( ROAD_W[ cls ] * S )
		);
	}
	ctx.restore();

	// Route and pins in pixel space, on top.
	const project = makeProjector( bbox, w, h );
	const pts = pins.map( ( p ) => project( p.lat, p.lon ) );
	if ( 'none' !== route && pts.length > 1 ) {
		ctx.save();
		ctx.strokeStyle = pal.pin || pal.text;
		ctx.lineWidth = 2.6 * S;
		ctx.setLineDash( [ 7 * S, 6 * S ] );
		ctx.beginPath();
		ctx.moveTo( pts[ 0 ][ 0 ], pts[ 0 ][ 1 ] );
		for ( let i = 1; i < pts.length; i++ ) {
			const [ ax, ay ] = pts[ i - 1 ];
			const [ bx, by ] = pts[ i ];
			if ( 'arc' === route ) {
				const mx = ( ax + bx ) / 2;
				const my = ( ay + by ) / 2;
				const dx = bx - ax;
				const dy = by - ay;
				ctx.quadraticCurveTo( mx - dy * 0.18, my + dx * 0.18, bx, by );
			} else {
				ctx.lineTo( bx, by );
			}
		}
		ctx.stroke();
		ctx.restore();

		if ( showDistance ) {
			let total = 0;
			for ( let i = 1; i < pins.length; i++ ) {
				total += haversineM( pins[ i - 1 ], pins[ i ] );
			}
			const label = formatDistance( total );
			// Pill at the midpoint of the longest segment.
			let seg = 0;
			let best = -1;
			for ( let i = 1; i < pts.length; i++ ) {
				const d =
					( pts[ i ][ 0 ] - pts[ i - 1 ][ 0 ] ) ** 2 +
					( pts[ i ][ 1 ] - pts[ i - 1 ][ 1 ] ) ** 2;
				if ( d > best ) {
					best = d;
					seg = i;
				}
			}
			const mx = ( pts[ seg - 1 ][ 0 ] + pts[ seg ][ 0 ] ) / 2;
			const my = ( pts[ seg - 1 ][ 1 ] + pts[ seg ][ 1 ] ) / 2;
			const fs = Math.max( 10, 15 * S );
			ctx.font = `600 ${ fs }px Inter, sans-serif`;
			const tw = ctx.measureText( label ).width;
			const padX = fs * 0.6;
			ctx.fillStyle = pal.bg;
			ctx.beginPath();
			if ( 'function' === typeof ctx.roundRect ) {
				ctx.roundRect(
					mx - tw / 2 - padX,
					my - fs * 0.95,
					tw + padX * 2,
					fs * 1.7,
					fs
				);
			} else {
				ctx.rect(
					mx - tw / 2 - padX,
					my - fs * 0.95,
					tw + padX * 2,
					fs * 1.7
				);
			}
			ctx.fill();
			ctx.fillStyle = pal.pin || pal.text;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText( label, mx, my - fs * 0.08 );
		}
	}

	const pinSize = Math.max( 7, 16 * S ) * pinScale;
	pins.forEach( ( p, i ) => {
		const [ x, y ] = pts[ i ];
		drawPin( ctx, x, y, pinSize, pal.pin || pal.text, pal.bg );
		if ( p.label ) {
			const fs = Math.max( 10, 14 * S ) * pinScale;
			ctx.font = `600 ${ fs }px Inter, sans-serif`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'top';
			ctx.lineWidth = fs * 0.28;
			ctx.strokeStyle = pal.bg;
			ctx.strokeText( p.label, x, y + fs * 0.35 );
			ctx.fillStyle = pal.text;
			ctx.fillText( p.label, x, y + fs * 0.35 );
		}
	} );

	ctx.restore();
}

/**
 * Render a full map frame from raw proxy data (one-shot path: tests,
 * contact sheets, bakes). The dialog uses buildScene + drawScene so
 * pan/zoom does not re-trace half a million points per frame.
 *
 * @param {CanvasRenderingContext2D} ctx  Target context.
 * @param {number}                   w    Width in px.
 * @param {number}                   h    Height in px.
 * @param {Object}                   opts renderMap options (see drawScene, plus `data`).
 */
export function renderMap( ctx, w, h, opts ) {
	drawScene( ctx, w, h, buildScene( opts.data ), opts );
}
