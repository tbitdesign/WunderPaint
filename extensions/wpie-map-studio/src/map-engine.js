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

/* ------------------------------- gradients ------------------------------- */

/**
 * Curated road gradients (v2.0) - the poster-family vocabulary shared
 * with Soundwave Art and Star Map Posters. `metallic` entries fake a
 * foil: dark rim, hot gloss band, dark rim (gold streets on black).
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
	GRADIENTS.find( ( g ) => g.id === id ) || null;

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

// Where each road class sits on a gradient: main arteries take the
// strongest color, alleys fade out - instant depth from one preset.
const CLASS_POS = {
	motorway: 1,
	primary: 0.78,
	secondary: 0.55,
	minor: 0.32,
	path: 0.14,
};

// Metallic foils run dark rim -> hot gloss -> dark rim, so the classes
// map differently: arteries get the gloss center, alleys sink into the
// rim - otherwise the hierarchy reads inverted.
const CLASS_POS_METAL = {
	motorway: 0.5,
	primary: 0.63,
	secondary: 0.75,
	minor: 0.87,
	path: 0.97,
};

const classPos = ( grad, cls ) =>
	( grad && grad.metallic ? CLASS_POS_METAL : CLASS_POS )[ cls ];

// Hierarchy alphas when one shared spatial gradient paints all classes.
const CLASS_ALPHA = {
	motorway: 1,
	primary: 0.9,
	secondary: 0.7,
	minor: 0.45,
	path: 0.28,
};

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
	} else if ( 'diamond' === mask ) {
		ctx.moveTo( cx, 0 );
		ctx.lineTo( w, cy );
		ctx.lineTo( cx, h );
		ctx.lineTo( 0, cy );
		ctx.closePath();
	} else if ( 'triangle' === mask ) {
		ctx.moveTo( cx, 0 );
		ctx.lineTo( w, h );
		ctx.lineTo( 0, h );
		ctx.closePath();
	} else if ( 'arch' === mask ) {
		const top = Math.min( cx, cy );
		ctx.moveTo( 0, h );
		ctx.lineTo( 0, top );
		ctx.arc( cx, top, cx, Math.PI, 0, false );
		ctx.lineTo( w, h );
		ctx.closePath();
	} else if ( 'star' === mask ) {
		const spikes = 5;
		const outer = r;
		const inner = r * 0.42;
		let rot = -Math.PI / 2;
		ctx.moveTo( cx + Math.cos( rot ) * outer, cy + Math.sin( rot ) * outer );
		for ( let i = 0; i < spikes; i++ ) {
			rot += Math.PI / spikes;
			ctx.lineTo( cx + Math.cos( rot ) * inner, cy + Math.sin( rot ) * inner );
			rot += Math.PI / spikes;
			ctx.lineTo( cx + Math.cos( rot ) * outer, cy + Math.sin( rot ) * outer );
		}
		ctx.closePath();
	} else if ( 'pentagon' === mask ) {
		for ( let i = 0; i < 5; i++ ) {
			const a = ( Math.PI * 2 * i ) / 5 - Math.PI / 2;
			const x = cx + r * Math.cos( a );
			const y = cy + r * Math.sin( a );
			if ( i ) {
				ctx.lineTo( x, y );
			} else {
				ctx.moveTo( x, y );
			}
		}
		ctx.closePath();
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
		// v2.1: the raw road geometry, split by bearing only when the
		// street-compass kind first asks for it (see orientOf).
		roadEls: [],
		n: 0,
	};
	for ( const e of ( data && data.els ) || [] ) {
		scene.n++;
		if ( 'road' === e.k ) {
			traceFlat( scene.roads[ e.c ] || scene.roads.minor, e.g );
			scene.roadEls.push( e );
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

/* -------------------------- v2.1 poster kinds ---------------------------- */

/**
 * What the map is drawn as (v2.1). 'classic' is the street poster every
 * version so far made; the others read the same data differently:
 * figure = buildings as solid ink, streets as the white between them;
 * water = only rivers, lakes and the sea; compass = every street colored
 * by the direction it runs; antique = an old engraved map; directions =
 * a clean way-finding sketch with cased main roads.
 */
export const MAP_KINDS = [
	'classic',
	'figure',
	'water',
	'compass',
	'antique',
	'directions',
];

/** #rrggbb + alpha → rgba(). */
function hexA( hex, a ) {
	const m = /^#?([0-9a-f]{6})$/i.exec( String( hex || '' ) );
	if ( ! m ) {
		return `rgba(0,0,0,${ a })`;
	}
	const n = parseInt( m[ 1 ], 16 );
	return `rgba(${ ( n >> 16 ) & 255 },${ ( n >> 8 ) & 255 },${ n & 255 },${ a })`;
}

/** Is a #rrggbb color dark (relative luminance under ~0.4)? */
export function isDarkHex( hex ) {
	const m = /^#?([0-9a-f]{6})$/i.exec( String( hex || '' ) );
	if ( ! m ) {
		return false;
	}
	const n = parseInt( m[ 1 ], 16 );
	return (
		0.2126 * ( ( n >> 16 ) & 255 ) +
			0.7152 * ( ( n >> 8 ) & 255 ) +
			0.0722 * ( n & 255 ) <
		110
	);
}

/** Has a #rrggbb color (almost) no hue? */
export function isGreyHex( hex ) {
	const m = /^#?([0-9a-f]{6})$/i.exec( String( hex || '' ) );
	if ( ! m ) {
		return true;
	}
	const n = parseInt( m[ 1 ], 16 );
	const r = ( n >> 16 ) & 255;
	const g = ( n >> 8 ) & 255;
	const b = n & 255;
	return Math.max( r, g, b ) - Math.min( r, g, b ) < 40;
}

/** HSL (deg, %, %) → #rrggbb. */
export function hslHex( h, s, l ) {
	const S = s / 100;
	const L = l / 100;
	const k = ( n ) => ( n + h / 30 ) % 12;
	const a = S * Math.min( L, 1 - L );
	const f = ( n ) =>
		Math.round(
			255 *
				( L - a * Math.max( -1, Math.min( k( n ) - 3, Math.min( 9 - k( n ), 1 ) ) ) )
		);
	return (
		'#' +
		[ f( 0 ), f( 8 ), f( 4 ) ]
			.map( ( v ) => v.toString( 16 ).padStart( 2, '0' ) )
			.join( '' )
	);
}

export const BEARING_BINS = 18; // ten degrees each over the half circle

/**
 * Bearing bin of a world-space segment: north is 0, east lies in the
 * middle, and a street has no direction (north and south are one bin).
 *
 * @param {number} dx World x step (east positive).
 * @param {number} dy World y step (south positive).
 * @return {number} 0 .. BEARING_BINS - 1.
 */
export function bearingBin( dx, dy ) {
	let a = ( Math.atan2( dx, -dy ) * 180 ) / Math.PI;
	a = ( ( a % 180 ) + 180 ) % 180;
	return Math.min(
		BEARING_BINS - 1,
		Math.floor( a / ( 180 / BEARING_BINS ) )
	);
}

/**
 * The scene's roads split by class AND bearing, plus a segment table
 * (midpoint, length, bin) for the rose. Built once per scene, the first
 * time the compass kind is drawn.
 */
function orientOf( scene ) {
	if ( scene.orient ) {
		return scene.orient;
	}
	const paths = {};
	for ( const cls of ROAD_ORDER ) {
		paths[ cls ] = Array.from( { length: BEARING_BINS }, newPath );
	}
	const segs = [];
	for ( const e of scene.roadEls || [] ) {
		const byBin = paths[ e.c ] || paths.minor;
		const g = e.g;
		let cur = -1;
		for ( let i = 2; i + 1 < g.length; i += 2 ) {
			const x1 = worldX( g[ i - 1 ] );
			const y1 = worldY( g[ i - 2 ] );
			const x2 = worldX( g[ i + 1 ] );
			const y2 = worldY( g[ i ] );
			const dx = x2 - x1;
			const dy = y2 - y1;
			const len = Math.hypot( dx, dy );
			if ( ! len ) {
				continue;
			}
			const bin = bearingBin( dx, dy );
			if ( bin !== cur ) {
				pathMove( byBin[ bin ], x1, y1 );
				cur = bin;
			}
			pathLine( byBin[ bin ], x2, y2 );
			segs.push( ( x1 + x2 ) / 2, ( y1 + y2 ) / 2, len, bin );
		}
	}
	scene.orient = { paths, segs: Float64Array.from( segs ), hist: null };
	return scene.orient;
}

/**
 * Street length per bearing bin inside a bbox (the rose's data).
 *
 * @param {Object} scene From buildScene().
 * @param {Object} bbox  { south, west, north, east }.
 * @return {Array} BEARING_BINS lengths (world units).
 */
export function bearingHistogram( scene, bbox ) {
	const o = orientOf( scene );
	const key = [ bbox.south, bbox.west, bbox.north, bbox.east ].join( '|' );
	if ( o.hist && o.hist.key === key ) {
		return o.hist.values;
	}
	const x0 = worldX( bbox.west );
	const x1 = worldX( bbox.east );
	const y0 = worldY( bbox.north );
	const y1 = worldY( bbox.south );
	const values = new Array( BEARING_BINS ).fill( 0 );
	const s = o.segs;
	for ( let i = 0; i < s.length; i += 4 ) {
		if ( s[ i ] >= x0 && s[ i ] <= x1 && s[ i + 1 ] >= y0 && s[ i + 1 ] <= y1 ) {
			values[ s[ i + 3 ] ] += s[ i + 2 ];
		}
	}
	o.hist = { key, values };
	return values;
}

/** The color of a bearing bin: a hue wheel, or a road gradient ping-pong. */
function bearingColor( bin, grad, dark ) {
	const u = ( bin + 0.5 ) / BEARING_BINS;
	if ( grad ) {
		return stopColor( grad.stops, 1 - Math.abs( 2 * u - 1 ) );
	}
	return hslHex( u * 360, 72, dark ? 64 : 44 );
}

/** A round distance at or below `m` meters (scale bars, rings). */
export function niceDistance( m ) {
	const steps = [
		10, 20, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000,
		25000, 50000, 100000, 200000,
	];
	let best = steps[ 0 ];
	for ( const v of steps ) {
		if ( v <= m ) {
			best = v;
		}
	}
	return best;
}

/** "500 m" / "2 km" / "2.5 km" for round values. */
export function distanceLabel( m ) {
	if ( m < 1000 ) {
		return `${ m } m`;
	}
	const km = m / 1000;
	return `${ Number.isInteger( km ) ? km : km.toFixed( 1 ) } km`;
}

/** Meters per pixel across the middle of the bbox. */
function metersPerPx( bbox, w ) {
	const lat = ( bbox.north + bbox.south ) / 2;
	return (
		haversineM( { lat, lon: bbox.west }, { lat, lon: bbox.east } ) /
		Math.max( 1, w )
	);
}

/** Seeded random 0..1 (paper grain stays the same between frames). */
function seeded( seed ) {
	let v = seed % 2147483647 || 1;
	return () => {
		v = ( v * 16807 ) % 2147483647;
		return v / 2147483647;
	};
}

/** Old paper: soft stains and a fine grain in the ink color. */
function paperGrain( ctx, w, h, ink ) {
	const rnd = seeded( 911 );
	const m = Math.min( w, h );
	ctx.save();
	for ( let i = 0; i < 8; i++ ) {
		const x = rnd() * w;
		const y = rnd() * h;
		const r = ( 0.08 + rnd() * 0.2 ) * m;
		const g = ctx.createRadialGradient( x, y, 0, x, y, r );
		g.addColorStop( 0, hexA( ink, 0.06 ) );
		g.addColorStop( 1, hexA( ink, 0 ) );
		ctx.fillStyle = g;
		ctx.fillRect( x - r, y - r, r * 2, r * 2 );
	}
	ctx.fillStyle = ink;
	const n = Math.round( ( w * h ) / 900 );
	const dot = Math.max( 1, m / 1000 );
	for ( let i = 0; i < n; i++ ) {
		ctx.globalAlpha = 0.025 + rnd() * 0.06;
		const d = ( 0.4 + rnd() * 0.9 ) * dot;
		ctx.fillRect( rnd() * w, rnd() * h, d, d );
	}
	ctx.restore();
}

/** Darkened edges, the way old paper ages from the rim inward. */
function vignette( ctx, w, h, ink ) {
	const g = ctx.createRadialGradient(
		w / 2,
		h / 2,
		Math.min( w, h ) * 0.35,
		w / 2,
		h / 2,
		Math.hypot( w, h ) * 0.55
	);
	g.addColorStop( 0, hexA( ink, 0 ) );
	g.addColorStop( 1, hexA( ink, 0.2 ) );
	ctx.save();
	ctx.fillStyle = g;
	ctx.fillRect( 0, 0, w, h );
	ctx.restore();
}

/**
 * An engraved compass rose: eight points (long cardinal, short
 * intercardinal), each split into an ink half and a paper half, inside
 * a double ring, with the N above.
 */
export function drawCompassRose( ctx, cx, cy, R, ink, paper, serif ) {
	ctx.save();
	ctx.lineWidth = Math.max( 1, R * 0.025 );
	ctx.strokeStyle = ink;
	ctx.fillStyle = paper;
	ctx.beginPath();
	ctx.arc( cx, cy, R * 0.66, 0, Math.PI * 2 );
	ctx.fill();
	ctx.stroke();
	ctx.beginPath();
	ctx.arc( cx, cy, R * 0.58, 0, Math.PI * 2 );
	ctx.stroke();
	for ( let k = 7; k >= 0; k-- ) {
		const a = ( k * Math.PI ) / 4 - Math.PI / 2;
		const len = 0 === k % 2 ? R : R * 0.62;
		const half = 0 === k % 2 ? R * 0.15 : R * 0.1;
		const tx = cx + Math.cos( a ) * len;
		const ty = cy + Math.sin( a ) * len;
		const lx = cx + Math.cos( a - Math.PI / 2 ) * half;
		const ly = cy + Math.sin( a - Math.PI / 2 ) * half;
		const rx = cx + Math.cos( a + Math.PI / 2 ) * half;
		const ry = cy + Math.sin( a + Math.PI / 2 ) * half;
		ctx.beginPath();
		ctx.moveTo( cx, cy );
		ctx.lineTo( lx, ly );
		ctx.lineTo( tx, ty );
		ctx.closePath();
		ctx.fillStyle = ink;
		ctx.fill();
		ctx.stroke();
		ctx.beginPath();
		ctx.moveTo( cx, cy );
		ctx.lineTo( rx, ry );
		ctx.lineTo( tx, ty );
		ctx.closePath();
		ctx.fillStyle = paper;
		ctx.fill();
		ctx.stroke();
	}
	ctx.fillStyle = ink;
	ctx.font = `700 ${ Math.round( R * 0.34 ) }px ${ serif ? 'Georgia, serif' : 'Inter, sans-serif' }`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'bottom';
	ctx.fillText( 'N', cx, cy - R * 1.02 );
	ctx.restore();
}

/** A north arrow: split dart, ink half and outlined half, N above. */
export function drawNorthArrow( ctx, x, y, size, ink, bg ) {
	ctx.save();
	ctx.lineJoin = 'round';
	ctx.lineWidth = Math.max( 1, size * 0.05 );
	ctx.strokeStyle = ink;
	const top = y - size * 0.5;
	const foot = y + size * 0.5;
	const notch = y + size * 0.26;
	ctx.beginPath();
	ctx.moveTo( x, top );
	ctx.lineTo( x - size * 0.3, foot );
	ctx.lineTo( x, notch );
	ctx.closePath();
	ctx.fillStyle = bg;
	ctx.fill();
	ctx.stroke();
	ctx.beginPath();
	ctx.moveTo( x, top );
	ctx.lineTo( x + size * 0.3, foot );
	ctx.lineTo( x, notch );
	ctx.closePath();
	ctx.fillStyle = ink;
	ctx.fill();
	ctx.stroke();
	ctx.font = `700 ${ Math.round( size * 0.42 ) }px Inter, sans-serif`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'bottom';
	ctx.lineWidth = size * 0.12;
	ctx.strokeStyle = bg;
	ctx.strokeText( 'N', x, top - size * 0.06 );
	ctx.fillText( 'N', x, top - size * 0.06 );
	ctx.restore();
}

/** A two-tone scale bar with its round distance, left edge at x. */
function drawScaleBar( ctx, x, y, maxW, mPerPx, ink, bg, S, centered ) {
	const meters = niceDistance( maxW * mPerPx );
	const bw = meters / mPerPx;
	const bh = Math.max( 3, 5 * S );
	const left = centered ? x - bw / 2 : x;
	ctx.save();
	ctx.lineWidth = Math.max( 1, 1.1 * S );
	ctx.strokeStyle = ink;
	ctx.fillStyle = bg;
	ctx.fillRect( left, y - bh, bw, bh );
	ctx.fillStyle = ink;
	ctx.fillRect( left, y - bh, bw / 2, bh );
	ctx.strokeRect( left, y - bh, bw, bh );
	const fs = Math.max( 9, 13 * S );
	ctx.font = `600 ${ fs }px Inter, sans-serif`;
	ctx.textAlign = centered ? 'center' : 'left';
	ctx.textBaseline = 'bottom';
	ctx.lineWidth = fs * 0.3;
	ctx.strokeStyle = bg;
	const label = distanceLabel( meters );
	const lx = centered ? x : left;
	ctx.strokeText( label, lx, y - bh - fs * 0.25 );
	ctx.fillText( label, lx, y - bh - fs * 0.25 );
	ctx.restore();
	return meters;
}

/** Degrees as 53°10′ (whole minutes) for the edge ticks. */
function dm( v, pos, neg ) {
	const a = Math.abs( v );
	let d = Math.floor( a );
	let m = Math.round( ( a - d ) * 60 );
	if ( 60 === m ) {
		d++;
		m = 0;
	}
	return `${ d }°${ String( m ).padStart( 2, '0' ) }′${ v >= 0 ? pos : neg }`;
}

/** Graticule ticks on the four edges, labelled in degrees and minutes. */
function drawTicks( ctx, w, h, bbox, ink, bg, S ) {
	const project = makeProjector( bbox, w, h );
	const steps = [ 1, 0.5, 0.25, 1 / 6, 0.1, 1 / 12, 1 / 20, 1 / 30, 1 / 60, 1 / 120 ];
	const pick = ( span ) => steps.find( ( st ) => span / st >= 3 ) || steps[ steps.length - 1 ];
	const latStep = pick( bbox.north - bbox.south );
	const lonStep = pick( bbox.east - bbox.west );
	const L = Math.min( w, h ) * 0.018;
	const fs = Math.max( 8, 10 * S );
	ctx.save();
	ctx.strokeStyle = ink;
	ctx.fillStyle = ink;
	ctx.lineWidth = Math.max( 1, 1.1 * S );
	ctx.font = `500 ${ fs }px Inter, sans-serif`;
	const label = ( text, x, y, align, base ) => {
		ctx.textAlign = align;
		ctx.textBaseline = base;
		ctx.lineWidth = fs * 0.3;
		ctx.strokeStyle = bg;
		ctx.strokeText( text, x, y );
		ctx.fillText( text, x, y );
		ctx.lineWidth = Math.max( 1, 1.1 * S );
		ctx.strokeStyle = ink;
	};
	for ( let lon = Math.ceil( bbox.west / lonStep ) * lonStep; lon < bbox.east; lon += lonStep ) {
		const [ x ] = project( bbox.south, lon );
		ctx.beginPath();
		ctx.moveTo( x, 0 );
		ctx.lineTo( x, L );
		ctx.moveTo( x, h );
		ctx.lineTo( x, h - L );
		ctx.stroke();
		label( dm( lon, 'E', 'W' ), x, L + fs * 0.2, 'center', 'top' );
	}
	for ( let lat = Math.ceil( bbox.south / latStep ) * latStep; lat < bbox.north; lat += latStep ) {
		const [ , y ] = project( lat, bbox.west );
		ctx.beginPath();
		ctx.moveTo( 0, y );
		ctx.lineTo( L, y );
		ctx.moveTo( w, y );
		ctx.lineTo( w - L, y );
		ctx.stroke();
		label( dm( lat, 'N', 'S' ), L + fs * 0.3, y, 'left', 'middle' );
	}
	ctx.restore();
}

/** Dashed distance rings around a point, each labelled at its top. */
function drawRings( ctx, cx, cy, halfMeters, mPerPx, ink, bg, S ) {
	const step = niceDistance( halfMeters * 0.32 );
	const fs = Math.max( 9, 12 * S );
	ctx.save();
	ctx.font = `600 ${ fs }px Inter, sans-serif`;
	for ( let k = 1; k <= 4 && k * step <= halfMeters * 0.98; k++ ) {
		const r = ( k * step ) / mPerPx;
		ctx.setLineDash( [ 6 * S, 5 * S ] );
		ctx.lineWidth = Math.max( 1, 1.4 * S );
		ctx.strokeStyle = hexA( ink, 0.6 );
		ctx.beginPath();
		ctx.arc( cx, cy, r, 0, Math.PI * 2 );
		ctx.stroke();
		ctx.setLineDash( [] );
		const label = distanceLabel( k * step );
		const tw = ctx.measureText( label ).width;
		const pad = fs * 0.45;
		ctx.fillStyle = bg;
		ctx.fillRect( cx - tw / 2 - pad, cy - r - fs * 0.7, tw + pad * 2, fs * 1.4 );
		ctx.fillStyle = ink;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText( label, cx, cy - r );
	}
	ctx.restore();
}

/**
 * The street-direction rose: street length per bearing as petals (both
 * ways, area-true), colored like the streets, on a soft disc.
 */
function drawRose( ctx, cx, cy, R, hist, colorOf, ink, bg ) {
	const max = Math.max( ...hist ) || 1;
	const step = Math.PI / BEARING_BINS;
	ctx.save();
	ctx.beginPath();
	ctx.arc( cx, cy, R * 1.1, 0, Math.PI * 2 );
	ctx.fillStyle = hexA( bg, 0.88 );
	ctx.fill();
	ctx.strokeStyle = hexA( ink, 0.25 );
	ctx.lineWidth = Math.max( 1, R * 0.012 );
	for ( const k of [ 0.5, 1 ] ) {
		ctx.beginPath();
		ctx.arc( cx, cy, R * k, 0, Math.PI * 2 );
		ctx.stroke();
	}
	for ( let b = 0; b < BEARING_BINS; b++ ) {
		const r = Math.sqrt( hist[ b ] / max ) * R;
		if ( r < 0.5 ) {
			continue;
		}
		ctx.fillStyle = colorOf( b );
		for ( const turn of [ 0, Math.PI ] ) {
			const a0 = b * step + turn - Math.PI / 2;
			ctx.beginPath();
			ctx.moveTo( cx, cy );
			ctx.arc( cx, cy, r, a0, a0 + step );
			ctx.closePath();
			ctx.fill();
		}
	}
	ctx.fillStyle = ink;
	ctx.font = `700 ${ Math.round( R * 0.2 ) }px Inter, sans-serif`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'bottom';
	ctx.fillText( 'N', cx, cy - R * 1.12 );
	ctx.restore();
}

/** An old map's border: two rules with a checkered minute band between. */
function drawAntiqueFrame( ctx, w, h, ink, paper ) {
	const m = Math.min( w, h );
	const B = m * 0.026;
	const lw = Math.max( 1, m * 0.0016 );
	ctx.save();
	ctx.fillStyle = paper;
	ctx.fillRect( 0, 0, w, B );
	ctx.fillRect( 0, h - B, w, B );
	ctx.fillRect( 0, 0, B, h );
	ctx.fillRect( w - B, 0, B, h );
	ctx.strokeStyle = ink;
	ctx.lineWidth = lw * 2;
	ctx.strokeRect( lw, lw, w - lw * 2, h - lw * 2 );
	ctx.lineWidth = lw;
	ctx.strokeRect( B, B, w - B * 2, h - B * 2 );
	const band = B * 0.32;
	const mid = B * 0.5;
	ctx.fillStyle = ink;
	const run = ( len, draw ) => {
		const n = Math.max( 8, Math.round( len / ( m * 0.045 ) ) );
		const seg = len / n;
		for ( let i = 0; i < n; i += 2 ) {
			draw( i * seg, seg );
		}
	};
	run( w - B * 2, ( o, sg ) => {
		ctx.fillRect( B + o, mid - band / 2, sg, band );
		ctx.fillRect( B + o, h - mid - band / 2, sg, band );
	} );
	run( h - B * 2, ( o, sg ) => {
		ctx.fillRect( mid - band / 2, B + o, band, sg );
		ctx.fillRect( w - mid - band / 2, B + o, band, sg );
	} );
	ctx.lineWidth = lw;
	ctx.strokeRect( mid - band / 2, mid - band / 2, w - mid * 2 + band, h - mid * 2 + band );
	ctx.restore();
}

/** Clip to a retained path (evenodd, like its fill). */
function clipPath( ctx, path ) {
	if ( path.p2d ) {
		ctx.clip( path.p2d, 'evenodd' );
	} else {
		replayOps( ctx, path.ops );
		ctx.clip( 'evenodd' );
	}
}

/**
 * Engraved shore lines: inside every water body, a few lines follow the
 * shore at growing distance (the old way of drawing water).
 */
function shoreLines( ctx, path, toWorld, S, waterColor, lineColor ) {
	if ( ! path.n ) {
		return;
	}
	ctx.save();
	clipPath( ctx, path );
	const gap = 3.4 * S;
	const lw = 0.9 * S;
	for ( let k = 3; k >= 1; k-- ) {
		strokePath( ctx, path, lineColor, toWorld( 2 * k * gap ) );
		strokePath( ctx, path, waterColor, toWorld( 2 * k * gap - 2 * lw ) );
	}
	ctx.restore();
}

/** Default offscreen canvas (browser, worker, jsdom). */
function defaultCanvas( w, h ) {
	let c = null;
	if ( 'undefined' !== typeof document && document.createElement ) {
		c = document.createElement( 'canvas' );
	} else if ( 'undefined' !== typeof OffscreenCanvas ) {
		c = new OffscreenCanvas( w, h );
	}
	if ( c ) {
		c.width = Math.max( 1, Math.round( w ) );
		c.height = Math.max( 1, Math.round( h ) );
	}
	return c;
}

/** Font string for the lettering. */
const letterFont = ( L, size ) =>
	`${ L.weight || 400 } ${ size }px "${ L.font || 'Bebas Neue' }", Impact, sans-serif`;

/**
 * Where and how big the lettering sits in a w×h box: as large as fits
 * with a small margin, centered on its real ink bounds.
 *
 * @param {CanvasRenderingContext2D} ctx Any 2d context (for measuring).
 * @param {Object} L { text, font, weight }.
 * @param {number} w Box width.
 * @param {number} h Box height.
 * @return {Object} { text, font, size, x, y } (x, y = left baseline).
 */
export function fitLetters( ctx, L, w, h ) {
	const text = String( L.text || '' ).trim();
	ctx.font = letterFont( L, 100 );
	const m = ctx.measureText( text );
	const left = m.actualBoundingBoxLeft || 0;
	const right = m.actualBoundingBoxRight || m.width;
	const asc = m.actualBoundingBoxAscent || 72;
	const desc = m.actualBoundingBoxDescent || 0;
	const tw = Math.max( 1, left + right );
	const th = Math.max( 1, asc + desc );
	const k = Math.min( ( w * 0.94 ) / tw, ( h * 0.9 ) / th );
	const size = 100 * k;
	return {
		text,
		size,
		font: letterFont( L, size ),
		x: w / 2 - ( tw * k ) / 2 + left * k,
		y: h / 2 + ( ( asc - desc ) / 2 ) * k,
	};
}

/**
 * Width / height of the lettering's ink at any size: the studio sizes
 * the map to it so the letters fill the poster, not a band of it.
 */
export function letterAspect( ctx, L ) {
	const f = fitLetters( ctx, L, 10000, 10000 );
	ctx.font = f.font;
	const m = ctx.measureText( f.text );
	const tw = ( m.actualBoundingBoxLeft || 0 ) + ( m.actualBoundingBoxRight || m.width );
	const th = ( m.actualBoundingBoxAscent || f.size * 0.72 ) + ( m.actualBoundingBoxDescent || 0 );
	return Math.max( 0.3, tw / Math.max( 1, th ) );
}

/**
 * The map seen only through big letters (v2.1): the map is drawn on its
 * own canvas, kept where the letters are, and laid onto the target; a
 * fine outline in the road ink holds the letters together where the map
 * runs thin.
 */
function drawLettered( ctx, w, h, scene, opts ) {
	const make = opts.makeCanvas || defaultCanvas;
	const L = opts.letters;
	const mapCv = make( w, h );
	const maskCv = make( w, h );
	if ( ! mapCv || ! maskCv ) {
		drawScene( ctx, w, h, scene, { ...opts, letters: null } );
		return;
	}
	drawScene( mapCv.getContext( '2d' ), w, h, scene, {
		...opts,
		letters: null,
		mask: 'none',
		north: false,
		scale: false,
		ticks: false,
		rose: false,
	} );
	const m = maskCv.getContext( '2d' );
	const fit = fitLetters( m, L, w, h );
	m.font = fit.font;
	m.textAlign = 'left';
	m.textBaseline = 'alphabetic';
	m.fillStyle = '#000';
	m.fillText( fit.text, fit.x, fit.y );
	m.globalCompositeOperation = 'source-in';
	m.drawImage( mapCv, 0, 0 );
	ctx.drawImage( maskCv, 0, 0 );
	if ( false !== L.outline ) {
		const pal = paletteFor( opts.theme, opts.overrides || {} );
		const grad = gradientById( opts.roadGradientId || '' );
		ctx.save();
		ctx.font = fit.font;
		ctx.textAlign = 'left';
		ctx.textBaseline = 'alphabetic';
		ctx.lineJoin = 'round';
		ctx.lineWidth = Math.max( 1, Math.min( w, h ) * 0.004 * ( opts.lineScale || 1 ) );
		if ( grad ) {
			const g = ctx.createLinearGradient( 0, 0, w, h );
			grad.stops.forEach( ( s2, i ) =>
				g.addColorStop( i / Math.max( 1, grad.stops.length - 1 ), s2 )
			);
			ctx.strokeStyle = g;
		} else {
			ctx.strokeStyle = pal.road.motorway;
		}
		ctx.strokeText( fit.text, fit.x, fit.y );
		ctx.restore();
	}
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
	if ( opts.letters && String( opts.letters.text || '' ).trim() ) {
		drawLettered( ctx, w, h, scene, opts );
		return;
	}
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
		roadGradientId = '',
		roadMap = 'class', // 'class' = by road class | 'x' = across the map
		glow = 0,
		// v2.1: what the map is drawn as, and the cartographic details.
		kind = 'classic',
		north = false,
		scale = false,
		ticks = false,
		numbered = false,
		rings = false,
		rose = false,
	} = opts;
	const K = MAP_KINDS.includes( kind ) ? kind : 'classic';
	const pal = paletteFor( theme, overrides );
	const S = ( Math.min( w, h ) / 1000 ) * lineScale;
	const grad = gradientById( roadGradientId );
	const glowAmt = Math.max( 0, Math.min( 1, glow ) );
	const glowColor = grad
		? grad.stops[ Math.floor( grad.stops.length / 2 ) ]
		: pal.road.motorway;
	// The poster's ink for the reduced kinds, the rings and the frame.
	const ink = pal.road.motorway;
	const dark = isDarkHex( pal.bg );

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
	if ( 'antique' === K ) {
		paperGrain( ctx, w, h, ink );
	}

	// Shaped maps mirror the star chart layout: shape edge, a margin of
	// plain background, then the inset contour with the map inside.
	const shaped = 'none' !== mask;
	const INSET = 0.92;
	const cxp = w / 2;
	const cyp = h / 2;
	const innerPath = () => {
		ctx.save();
		ctx.translate( cxp, cyp );
		ctx.scale( INSET, INSET );
		ctx.translate( -cxp, -cyp );
		maskPathOn( ctx, mask, w, h );
		ctx.restore();
	};
	if ( shaped ) {
		ctx.save();
		innerPath();
		ctx.clip();
	}

	ctx.save();
	ctx.transform( sx, 0, 0, sy, -x0 * sx, -y0 * sy );

	// The sea depends on the viewport border: rebuilt per draw, but
	// coastlines are few (stitching is cheap next to the roads).
	const seaOf = () => {
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
		return sea;
	};
	const worldGradFor = () => {
		const g = ctx.createLinearGradient(
			x0,
			y0,
			worldX( bbox.east ),
			worldY( bbox.south )
		);
		grad.stops.forEach( ( s, i ) =>
			g.addColorStop( i / Math.max( 1, grad.stops.length - 1 ), s )
		);
		return g;
	};

	if ( 'figure' === K || 'water' === K ) {
		// The reduced kinds: one subject in the ink, everything else is
		// the paper. A figure-ground plan without buildings in the data
		// (zoomed out) shows the streets faintly instead of nothing.
		const paint = grad
			? 'x' === roadMap
				? worldGradFor()
				: stopColor( grad.stops, classPos( grad, 'motorway' ) )
			: ink;
		if ( 'figure' === K ) {
			if ( false !== show.water ) {
				const waterTone = mixHex( pal.bg, pal.water, 0.7 );
				if ( scene.coast.length ) {
					fillPath( ctx, seaOf(), waterTone );
				}
				fillPath( ctx, scene.water, waterTone );
			}
			if ( scene.building.n ) {
				fillPath( ctx, scene.building, paint );
			} else {
				ctx.globalAlpha = 0.3;
				for ( const cls of ROAD_ORDER ) {
					strokePath( ctx, scene.roads[ cls ], paint, toWorld( ROAD_W[ cls ] * 0.8 * S ) );
				}
				ctx.globalAlpha = 1;
			}
		} else {
			ctx.globalAlpha = 0.92;
			if ( scene.coast.length ) {
				fillPath( ctx, seaOf(), paint );
			}
			fillPath( ctx, scene.water, paint );
			ctx.globalAlpha = 1;
			if ( glowAmt > 0.01 ) {
				ctx.save();
				ctx.shadowColor = glowColor;
				ctx.shadowBlur = Math.min( w, h ) * 0.02 * glowAmt;
				ctx.globalAlpha = 0.6 * glowAmt;
				strokePath( ctx, scene.river, paint, toWorld( 3.6 * S ) );
				ctx.restore();
			}
			strokePath( ctx, scene.river, paint, toWorld( 3.6 * S ) );
			strokePath( ctx, scene.stream, paint, toWorld( 1.2 * S ) );
		}
		ctx.restore();
	} else {
		// Classic and the kinds that keep the full map underneath.
		const quiet =
			'compass' === K ? 0.45 : 'directions' === K ? 0.7 : 1;
		if ( false !== show.water ) {
			const sea = scene.coast.length ? seaOf() : null;
			ctx.globalAlpha = quiet;
			if ( sea ) {
				fillPath( ctx, sea, pal.water );
			}
			fillPath( ctx, scene.water, pal.water );
			ctx.globalAlpha = 1;
			if ( 'antique' === K ) {
				const lines = mixHex( pal.water, ink, 0.5 );
				if ( sea ) {
					shoreLines( ctx, sea, toWorld, S, pal.water, lines );
				}
				shoreLines( ctx, scene.water, toWorld, S, pal.water, lines );
			}
		}
		if ( false !== show.green ) {
			ctx.globalAlpha = 'antique' === K ? 0.75 : quiet;
			fillPath( ctx, scene.green, pal.green );
			fillPath( ctx, scene.sand, pal.sand );
			ctx.globalAlpha = 1;
		}
		if ( show.buildings ) {
			fillPath( ctx, scene.building, pal.building );
		}
		if ( false !== show.water ) {
			ctx.globalAlpha = quiet;
			strokePath( ctx, scene.river, pal.water, toWorld( 4.5 * S ) );
			strokePath( ctx, scene.stream, pal.water, toWorld( 1.6 * S ) );
			ctx.globalAlpha = 1;
		}
		if ( false !== show.rail && 'compass' !== K ) {
			strokePath( ctx, scene.rail, pal.rail, toWorld( 1.4 * S ) );
			// Cross-tie dashes in the background color: instant "railway" read.
			ctx.save();
			ctx.setLineDash( [ toWorld( 5 * S ), toWorld( 5 * S ) ] );
			strokePath( ctx, scene.rail, pal.bg, toWorld( 0.8 * S ) );
			ctx.restore();
		}
		if ( 'compass' === K ) {
			// Every street in the color of its direction.
			const orient = orientOf( scene );
			const colorOf = ( b ) => bearingColor( b, grad, dark );
			for ( const cls of ROAD_ORDER ) {
				if ( 'path' === cls && false === show.paths ) {
					continue;
				}
				const lw = toWorld( ROAD_W[ cls ] * S );
				for ( let b = 0; b < BEARING_BINS; b++ ) {
					if ( glowAmt > 0.01 && 'path' !== cls && 'minor' !== cls ) {
						ctx.save();
						ctx.shadowColor = colorOf( b );
						ctx.shadowBlur = Math.min( w, h ) * 0.015 * glowAmt;
						strokePath( ctx, orient.paths[ cls ][ b ], colorOf( b ), lw );
						ctx.restore();
					} else {
						strokePath( ctx, orient.paths[ cls ][ b ], colorOf( b ), lw );
					}
				}
			}
		} else if ( 'antique' === K ) {
			// Engraved roads: the big ones as double lines, the small ones
			// single, footpaths dotted.
			for ( const cls of ROAD_ORDER ) {
				const W = ROAD_W[ cls ] * S;
				if ( 'path' === cls ) {
					if ( false === show.paths ) {
						continue;
					}
					ctx.save();
					ctx.setLineDash( [ toWorld( 1.2 * S ), toWorld( 3 * S ) ] );
					strokePath( ctx, scene.roads.path, ink, toWorld( 0.9 * S ) );
					ctx.restore();
				} else if ( 'minor' === cls ) {
					strokePath( ctx, scene.roads.minor, ink, toWorld( W * 0.8 ) );
				} else {
					strokePath( ctx, scene.roads[ cls ], ink, toWorld( W * 1.2 ) );
					strokePath( ctx, scene.roads[ cls ], pal.bg, toWorld( W * 0.55 ) );
				}
			}
		} else if ( 'directions' === K ) {
			// Way-finding: main roads cased (an ink edge around a light
			// inside), the arteries in the pin color, no footpaths.
			const inside = dark ? mixHex( pal.bg, pal.text, 0.22 ) : '#ffffff';
			// Arteries in the theme's pin color; a grey pin (Minimal) would
			// make them grey too, so those get the road-map amber instead.
			const pinHue = pal.pin || pal.text;
			const artery = isGreyHex( pinHue )
				? mixHex( '#f2b43c', pal.bg, dark ? 0.2 : 0.05 )
				: mixHex( pinHue, pal.bg, 0.4 );
			const casing = [ 'minor', 'secondary', 'primary', 'motorway' ];
			const width = ( cls ) => Math.max( 1.6, ROAD_W[ cls ] * 1.5 ) * S;
			for ( const cls of casing ) {
				ctx.globalAlpha = 'minor' === cls ? 0.55 : 1;
				strokePath( ctx, scene.roads[ cls ], ink, toWorld( width( cls ) + 2.2 * S ) );
			}
			ctx.globalAlpha = 1;
			for ( const cls of casing ) {
				strokePath(
					ctx,
					scene.roads[ cls ],
					'primary' === cls || 'motorway' === cls ? artery : inside,
					toWorld( width( cls ) )
				);
			}
		} else {
			// Road paint: theme colors, per-class gradient stops (main
			// arteries take the hot band), or one spatial gradient across
			// the whole map.
			const worldGrad = grad && 'x' === roadMap ? worldGradFor() : null;
			const roadPaint = ( cls ) => {
				if ( ! grad ) {
					return pal.road[ cls ];
				}
				return worldGrad || stopColor( grad.stops, classPos( grad, cls ) );
			};
			if ( glowAmt > 0.01 ) {
				// Halo pass under the crisp strokes - main roads only, so the
				// glow reads as city lights instead of fog. Shadow blur is in
				// device pixels (unaffected by the world transform).
				ctx.save();
				ctx.shadowColor = glowColor;
				ctx.shadowBlur = Math.min( w, h ) * 0.02 * glowAmt;
				ctx.globalAlpha = 0.55 * glowAmt;
				for ( const cls of [ 'secondary', 'primary', 'motorway' ] ) {
					strokePath(
						ctx,
						scene.roads[ cls ],
						grad ? stopColor( grad.stops, classPos( grad, cls ) ) : pal.road[ cls ],
						toWorld( ROAD_W[ cls ] * S )
					);
				}
				ctx.restore();
			}
			for ( const cls of ROAD_ORDER ) {
				if ( 'path' === cls && false === show.paths ) {
					continue;
				}
				if ( worldGrad ) {
					ctx.globalAlpha = CLASS_ALPHA[ cls ];
				}
				strokePath(
					ctx,
					scene.roads[ cls ],
					roadPaint( cls ),
					toWorld( ROAD_W[ cls ] * S )
				);
			}
			ctx.globalAlpha = 1;
		}
		ctx.restore();
	}

	// Route, rings and pins in pixel space, on top.
	const project = makeProjector( bbox, w, h );
	const pts = pins.map( ( p ) => project( p.lat, p.lon ) );
	const mpp = metersPerPx( bbox, w );
	if ( rings || 'directions' === K ) {
		const c = pts[ 0 ] || [ w / 2, h / 2 ];
		drawRings( ctx, c[ 0 ], c[ 1 ], ( w / 2 ) * mpp, mpp, pal.text, pal.bg, S );
	}
	if ( 'none' !== route && pts.length > 1 ) {
		ctx.save();
		ctx.strokeStyle = pal.pin || pal.text;
		ctx.lineWidth = 2.6 * S;
		if ( glowAmt > 0.01 ) {
			ctx.shadowColor = pal.pin || pal.text;
			ctx.shadowBlur = Math.min( w, h ) * 0.015 * glowAmt;
		}
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
	const pinColor = pal.pin || pal.text;
	pins.forEach( ( p, i ) => {
		const [ x, y ] = pts[ i ];
		if ( numbered ) {
			// A numbered pin: no hole, the number in the head; its label
			// lives in the poster's legend instead of on the map.
			const size = pinSize * 1.25;
			drawPin( ctx, x, y, size, pinColor, pinColor );
			const k = ( size * 2.2 ) / 22;
			ctx.save();
			ctx.fillStyle = pal.bg;
			ctx.font = `700 ${ Math.round( 9.5 * k ) }px Inter, sans-serif`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText( String( i + 1 ), x, y - 11 * k + 0.5 * k );
			ctx.restore();
			return;
		}
		drawPin( ctx, x, y, pinSize, pinColor, pal.bg );
		if ( p.label ) {
			const fs = Math.max( 10, 14 * S ) * pinScale;
			ctx.font = `600 ${ fs }px ${ 'antique' === K ? 'Georgia, serif' : 'Inter, sans-serif' }`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'top';
			ctx.lineWidth = fs * 0.28;
			ctx.strokeStyle = pal.bg;
			ctx.strokeText( p.label, x, y + fs * 0.35 );
			ctx.fillStyle = pal.text;
			ctx.fillText( p.label, x, y + fs * 0.35 );
		}
	} );

	// The cartographic details. Square-ish maps use the corners; shaped
	// ones stack them at the bottom middle, where every shape has room.
	const m = Math.min( w, h );
	const corner = 'none' === mask || 'squircle' === mask;
	if ( 'compass' === K && rose ) {
		const R = m * 0.1;
		const hist = bearingHistogram( scene, bbox );
		drawRose(
			ctx,
			corner ? w - R * 1.45 : w / 2,
			corner ? h - R * 1.45 : h * 0.74,
			R,
			hist,
			( b ) => bearingColor( b, grad, dark ),
			pal.text,
			pal.bg
		);
	}
	if ( ticks && 'none' === mask ) {
		drawTicks( ctx, w, h, bbox, pal.text, pal.bg, S );
	}
	if ( 'antique' === K ) {
		vignette( ctx, w, h, ink );
		const R = m * 0.075;
		const inset = 'none' === mask ? m * 0.026 : 0;
		drawCompassRose(
			ctx,
			corner ? inset + R * 1.7 : w / 2,
			corner ? inset + R * 1.9 : h * 0.2,
			R,
			ink,
			pal.bg,
			true
		);
	} else if ( north ) {
		const size = m * 0.055;
		drawNorthArrow(
			ctx,
			corner ? w - size * 1.1 : w / 2,
			corner ? size * 1.35 : h * ( 'compass' === K && rose ? 0.58 : 0.76 ),
			size,
			pal.text,
			pal.bg
		);
	}
	if ( scale ) {
		const pad = corner ? m * 0.045 : 0;
		drawScaleBar(
			ctx,
			corner ? pad + ( 'antique' === K ? m * 0.026 : 0 ) : w / 2,
			corner ? h - pad - ( 'antique' === K ? m * 0.026 : 0 ) : h * 0.88,
			w * 0.24,
			mpp,
			pal.text,
			pal.bg,
			S,
			! corner
		);
	}
	if ( 'antique' === K && 'none' === mask ) {
		drawAntiqueFrame( ctx, w, h, ink, pal.bg );
	}

	if ( shaped ) {
		// Release the inner content clip, then stroke the inset contour
		// (fully visible inside the margin) - the heart gets its heart
		// line, matching Star Map Posters.
		ctx.restore();
		const edgePaint = ( () => {
			if ( ! grad ) {
				return pal.road.motorway;
			}
			const g = ctx.createLinearGradient( 0, 0, w, h );
			grad.stops.forEach( ( s2, i ) =>
				g.addColorStop( i / Math.max( 1, grad.stops.length - 1 ), s2 )
			);
			return g;
		} )();
		ctx.save();
		ctx.setLineDash( [] );
		if ( glowAmt > 0.01 ) {
			ctx.shadowColor = glowColor;
			ctx.shadowBlur = Math.min( w, h ) * 0.02 * glowAmt;
			ctx.strokeStyle = glowColor;
			ctx.globalAlpha = 0.5 * glowAmt;
			ctx.lineWidth = 2.2 * S;
			innerPath();
			ctx.stroke();
			ctx.shadowBlur = 0;
			ctx.globalAlpha = 1;
		}
		ctx.strokeStyle = edgePaint;
		ctx.lineWidth = 2.2 * S;
		innerPath();
		ctx.stroke();
		ctx.restore();
	}

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
