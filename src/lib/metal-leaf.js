/**
 * METAL, as metallic paint and small leaf lays it, shared by the GPU and
 * the CPU painter.
 *
 * Metal does not shade like paint. Paint scatters light, so its
 * brightness follows the angle to the lamp; a metal MIRRORS its
 * surroundings, and all of its look is in what it reflects: a piece tilted
 * towards the window flares white-gold, one tilted towards the room goes
 * deep brown-gold, and between the two there is almost nothing. The first
 * model lit the metal like a glossy paint (Lambert plus a Phong spot) and
 * read as plastic. This one reflects a small studio: a big soft window, a
 * hard little lamp and a dark room around them.
 *
 * What the reflection shows is decided by the SURFACE, and it is SMALL:
 *  - PLATES: the metal lies as small irregular platelets, a dozen pixels
 *    or so and never much over twenty, each at its own slight tilt, so a
 *    metal stroke is a lively patchwork of brightness at the scale of the
 *    pigment. Whole leaves of a hundred and more pixels read as tiles, not
 *    as gold (Thomas, 23.09.2026); they do not grow with the brush either
 *    - pigment is pigment.
 *  - GRAIN: inside every platelet two-pixel grains sit at their own tiny
 *    tilt, the fine sparkle metallic paint has.
 *  - SWELL: over it all a broad, low swell carries the big soft light and
 *    dark zones across a stroke.
 *  - FLAKES (the Metal Flakes brush): smaller, stronger-tilted pieces,
 *    folded once, a few standing up to flash, some missing.
 *  - WEAR: rubbed metal shows the red bole in small patches along the rub.
 *
 * Every laying (one wash) is turned and shifted as a whole, so metal laid
 * over metal is a new layer, not the old one recoloured; within a wash
 * everything is fixed in the document, so nothing swims while a stroke
 * grows or bakes.
 *
 * The colour picked in the editor is the metal's MIDTONE: a flat piece
 * reflecting the plain room renders exactly that colour. Any colour
 * works; gold, silver, copper and rose gold are just the common ones.
 */

const OFF = 1048576; // keeps negative document coordinates positive

function ihash( x, y, s ) {
	let n =
		Math.imul( ( x + OFF ) | 0, 374761393 ) ^
		Math.imul( ( y + OFF ) | 0, 668265263 ) ^
		s;
	n = Math.imul( n ^ ( n >>> 13 ), 1274126177 );
	return ( ( n ^ ( n >>> 16 ) ) >>> 0 ) / 4294967296;
}

function gnoise( x, y, s ) {
	const ix = Math.floor( x );
	const iy = Math.floor( y );
	const fx = x - ix;
	const fy = y - iy;
	const ux = fx * fx * ( 3 - 2 * fx );
	const uy = fy * fy * ( 3 - 2 * fy );
	const g = ( gx, gy, dx, dy ) => {
		const a = ihash( gx, gy, s ) * 6.283185307;
		return Math.cos( a ) * dx + Math.sin( a ) * dy;
	};
	const a = g( ix, iy, fx, fy );
	const b = g( ix + 1, iy, fx - 1, fy );
	const c = g( ix, iy + 1, fx, fy - 1 );
	const d = g( ix + 1, iy + 1, fx - 1, fy - 1 );
	const ab = a + ( b - a ) * ux;
	const cd = c + ( d - c ) * ux;
	return 1.4 * ( ab + ( cd - ab ) * uy );
}

const clamp01 = ( v ) => ( v < 0 ? 0 : v > 1 ? 1 : v );
const smooth = ( a, b, x ) => {
	const t = clamp01( ( x - a ) / ( b - a ) );
	return t * t * ( 3 - 2 * t );
};

/**
 * The SWELL: the ground under the metal is never quite flat. Broad and
 * low, it carries the big light and dark zones of the reflection; a
 * stronger, finer swell read as molten chrome.
 */
function leafSwell( x, y ) {
	return (
		0.7 * gnoise( x / 150, y / 150, 11 ) +
		0.3 * gnoise( x / 64, y / 64, 12 )
	);
}

/**
 * The platelet size a brush lays: the tip's own, kept small - pigment is
 * pigment, whatever the brush. Plates around 13 px (never much over 20),
 * flakes around 6.
 *
 * @param {Object|null} material The tip's material ({ piece, flakes }).
 * @return {number} Platelet cell size, document px.
 */
export function leafPieceFor( material ) {
	return Math.min( 20, Math.max( 3, material?.piece ?? 13 ) );
}

/**
 * The turn and shift of one laying, from its seed (0..1): a few degrees
 * either way and a large offset into the pattern.
 *
 * @param {number} seed Per-wash random, 0..1.
 * @return {number[]} [cos, sin, offsetX, offsetY].
 */
export function leafTurn( seed ) {
	const frac = ( v ) => v - Math.floor( v );
	const ang = ( frac( seed * 7.13 ) - 0.5 ) * 0.4;
	return [
		Math.cos( ang ),
		Math.sin( ang ),
		Math.floor( frac( seed * 13.71 ) * 4096 ),
		Math.floor( frac( seed * 29.37 ) * 4096 ),
	];
}

/**
 * Which platelet a pixel belongs to, and how it lies: Voronoi cells
 * `piece` px apart, so sizes vary from about half to one and a half of
 * it. Returns [tiltX, tiltY, rimShadow, hole, fold, cell].
 */
function leafPlate( x, y, piece, flakes, thinSize, tex ) {
	const cx = Math.floor( x / piece );
	const cy = Math.floor( y / piece );
	let d1 = 9e9;
	let d2 = 9e9;
	let ix = 0;
	let iy = 0;
	let fx = 0;
	let fy = 0;
	for ( let j = -1; j <= 1; j++ ) {
		for ( let i = -1; i <= 1; i++ ) {
			const gx = cx + i;
			const gy = cy + j;
			const px = ( gx + ihash( gx, gy, 51 ) ) * piece;
			const py = ( gy + ihash( gx, gy, 52 ) ) * piece;
			const d = Math.hypot( x - px, y - py );
			if ( d < d1 ) {
				d2 = d1;
				d1 = d;
				ix = gx;
				iy = gy;
				fx = px;
				fy = py;
			} else if ( d < d2 ) {
				d2 = d;
			}
		}
	}
	const edge = d2 - d1;
	if ( ! flakes ) {
		// Plates lie nearly flat, a slight tilt each; where two meet, a
		// hairline of shade.
		const spread = 0.1 + 0.08 * tex;
		return [
			( ihash( ix, iy, 53 ) - 0.5 ) * spread,
			( ihash( ix, iy, 54 ) - 0.5 ) * spread,
			Math.exp( -( edge * edge ) / 0.5 ) * 0.1,
			0,
			0,
			ihash( ix, iy, 45 ),
		];
	}
	// Flakes: most lie nearly flat and show the metal; a few stand up and
	// flash. Each is folded once across its middle.
	const up = ihash( ix, iy, 55 ) > 0.8 ? 3.2 : 1;
	const fa = ihash( ix, iy, 56 ) * Math.PI;
	const side = ( x - fx ) * Math.cos( fa ) + ( y - fy ) * Math.sin( fa );
	const half = side > 0 ? 0.1 : -0.1;
	return [
		( ihash( ix, iy, 53 ) - 0.5 ) * 0.24 * up + half * Math.cos( fa ),
		( ihash( ix, iy, 54 ) - 0.5 ) * 0.24 * up + half * Math.sin( fa ),
		Math.exp( -( edge * edge ) / 0.6 ) * 0.3,
		// Flakes that did not take, more where the size is thin.
		ihash( ix, iy, 57 ) < 0.05 + 0.2 * thinSize ? 1 : 0,
		Math.exp( -( side * side ) / 0.5 ) * 0.6,
		ihash( ix, iy, 45 ),
	];
}

/**
 * The small studio the metal mirrors, by reflected direction (x, y): a
 * soft fill straight ahead, a big window up and left, a hard little lamp
 * to the right, a dark room around them. A flat piece sees mostly the
 * fill, which is set so it shows the picked colour.
 */
function studio( ux, uy ) {
	const f = ( ux + 0.05 ) * ( ux + 0.05 ) + ( uy + 0.08 ) * ( uy + 0.08 );
	const w1 = ( ux + 0.2 ) * ( ux + 0.2 ) + ( uy + 0.28 ) * ( uy + 0.28 );
	const w2 = ( ux - 0.24 ) * ( ux - 0.24 ) + ( uy + 0.06 ) * ( uy + 0.06 );
	let e =
		0.8 +
		0.35 * Math.exp( -f / ( 2 * 0.12 * 0.12 ) ) +
		1.25 * Math.exp( -w1 / ( 2 * 0.085 * 0.085 ) ) +
		2 * Math.exp( -w2 / ( 2 * 0.028 * 0.028 ) );
	e *= 1 - 0.55 * smooth( 0.2, 0.6, Math.hypot( ux, uy ) );
	e *= 1 - 0.18 * uy;
	return Math.max( 0, e );
}

/**
 * The metal at one document pixel.
 *
 * @param {number}   docX   Document x.
 * @param {number}   docY   Document y.
 * @param {number[]} f0     Metal midtone, straight RGB 0..1.
 * @param {number}   amount Size (glue) laid here; the metal holds where
 *                          there is enough of it.
 * @param {Object}   o      { piece, flakes, tex, sheen, wear, seed }.
 * @return {number[]} Premultiplied RGBA.
 */
export function leafPixel( docX, docY, f0, amount, o ) {
	const tex = o.tex ?? 0.35;
	const sheen = o.sheen ?? 0.8;
	const wear = o.wear ?? 0;
	const piece = o.piece || 13;
	const flakes = !! o.flakes;
	// Every laying is its own: the whole pattern is shifted and turned a
	// little per laying (o.seed, one per wash), so gold laid over gold is
	// a new layer, not the old one recoloured.
	const [ ca, sa, offX, offY ] = leafTurn( o.seed ?? 0 );
	const to = ( px, py ) => [
		px * ca - py * sa + offX,
		px * sa + py * ca + offY,
	];
	const [ x, y ] = to( docX, docY );
	const thinSize = 1 - smooth( 1.2, 2.4, amount );
	const [ tx, ty, shadow, hole, fold, cell ] = leafPlate(
		x,
		y,
		piece,
		flakes,
		thinSize,
		tex
	);
	// Torn edges: where the size runs thin the metal breaks raggedly, and
	// along its platelets - a whole piece holds or goes.
	const rag =
		0.5 +
		0.22 * gnoise( x / 5, y / 5, 61 ) +
		0.13 * gnoise( x / 2.2, y / 2.2, 62 ) +
		0.3 * ( cell - 0.5 );
	const hold = amount * ( 0.55 + 0.9 * rag * ( 0.6 + 0.8 * tex ) );
	let leaf = smooth( 0.32, 0.42, hold );
	let bole = 0;
	let thin = 1;
	if ( wear > 0 ) {
		// Rubbing takes the metal off the high spots and the margins first,
		// in small patches drawn out the way the cloth went, and thins it
		// before it breaks through.
		const ra = 0.6 + 0.35 * gnoise( x / 400, y / 400, 73 );
		const rc = Math.cos( ra );
		const rs = Math.sin( ra );
		const u = x * rc + y * rs;
		const v = y * rc - x * rs;
		const rub =
			0.5 +
			0.3 * gnoise( u / 16, v / 9, 71 ) +
			0.2 * gnoise( u / 5, v / 3, 72 ) -
			Math.max( 0, 1.5 - amount ) * 0.15;
		const w = wear * 0.55;
		leaf *= smooth( w - 0.04, w + 0.04, rub );
		thin = smooth( w - 0.02, w + 0.2, rub );
		bole = smooth( 0.2, 0.3, amount );
	}
	if ( leaf <= 0 && bole <= 0 ) {
		return [ 0, 0, 0, 0 ];
	}
	// The grain: two-pixel pigment at its own tiny tilt - the sparkle.
	const gx = Math.floor( x / 2 );
	const gy = Math.floor( y / 2 );
	const grain = 0.05 + 0.06 * tex;
	// The swell, differentiated along the DOCUMENT axes (the light is the
	// document's, however the laying is turned).
	const s0 = leafSwell( x, y );
	let nx =
		-( leafSwell( ...to( docX + 1, docY ) ) - s0 ) * 6 +
		tx +
		( ihash( gx, gy, 81 ) - 0.5 ) * grain;
	let ny =
		-( leafSwell( ...to( docX, docY + 1 ) ) - s0 ) * 6 +
		ty +
		( ihash( gx, gy, 82 ) - 0.5 ) * grain;
	const nl = Math.hypot( nx, ny, 1 );
	nx /= nl;
	ny /= nl;
	const nz = 1 / nl;
	let e = studio( 2 * nx * nz, 2 * ny * nz );
	e *= 1 - shadow - 0.35 * fold;
	// Shine 0 is matte metal: an even colour, no reflections.
	e = 1 + ( e - 1 ) * sheen;
	// A flake that did not take leaves the ground bare.
	leaf *= 1 - hole;
	const hot = smooth( 1.35, 2.6, e );
	const BOLE = [ 0.45, 0.2, 0.12 ];
	const out = [ 0, 0, 0, 0 ];
	for ( let c = 0; c < 3; c++ ) {
		const m = Math.max( 0.001, f0[ c ] );
		let v =
			e < 1
				? Math.pow( m, 1 + ( 1 - e ) * 1.3 ) * e
				: Math.min( 1, m * e );
		v +=
			( [ 1, 0.985, 0.95 ][ c ] * Math.min( 1, e / 1.6 ) - v ) *
			hot *
			0.55;
		// Rubbed thin, the metal lets the bole's warmth through.
		v = BOLE[ c ] + ( clamp01( v ) - BOLE[ c ] ) * ( 0.45 + 0.55 * thin );
		out[ c ] = clamp01( v );
	}
	// Premultiplied: metal over bole over nothing.
	const a = leaf + bole * ( 1 - leaf );
	for ( let c = 0; c < 3; c++ ) {
		out[ c ] = out[ c ] * leaf + BOLE[ c ] * bole * ( 1 - leaf );
	}
	out[ 3 ] = a;
	return out;
}

export const LEAF_GLSL = `
float leafHash( ivec2 q, int s ) {
	uint n = ( uint( q.x + ${ OFF } ) * 374761393u ) ^ ( uint( q.y + ${ OFF } ) * 668265263u ) ^ uint( s );
	n = ( n ^ ( n >> 13u ) ) * 1274126177u;
	return float( n ^ ( n >> 16u ) ) / 4294967296.0;
}
float leafNoise( vec2 p, int s ) {
	vec2 i = floor( p );
	vec2 f = p - i;
	vec2 u = f * f * ( 3.0 - 2.0 * f );
	ivec2 q = ivec2( i );
	float a0 = leafHash( q, s ) * 6.283185307;
	float a1 = leafHash( q + ivec2( 1, 0 ), s ) * 6.283185307;
	float a2 = leafHash( q + ivec2( 0, 1 ), s ) * 6.283185307;
	float a3 = leafHash( q + ivec2( 1, 1 ), s ) * 6.283185307;
	float a = cos( a0 ) * f.x + sin( a0 ) * f.y;
	float b = cos( a1 ) * ( f.x - 1.0 ) + sin( a1 ) * f.y;
	float c = cos( a2 ) * f.x + sin( a2 ) * ( f.y - 1.0 );
	float d = cos( a3 ) * ( f.x - 1.0 ) + sin( a3 ) * ( f.y - 1.0 );
	float ab = a + ( b - a ) * u.x;
	float cd = c + ( d - c ) * u.x;
	return 1.4 * ( ab + ( cd - ab ) * u.y );
}
float leafSwell( vec2 p ) {
	return 0.7 * leafNoise( p / 150.0, 11 ) + 0.3 * leafNoise( p / 64.0, 12 );
}
vec2 leafTo( vec2 p, vec4 xf ) {
	return vec2( p.x * xf.x - p.y * xf.y + xf.z, p.x * xf.y + p.y * xf.x + xf.w );
}
// pa = tilt.xy, rim shadow, hole; pb = fold, cell.
void leafPlate( vec2 p, float piece, bool flakes, float thinSize, float tex, out vec4 pa, out vec2 pb ) {
	ivec2 c = ivec2( floor( p / piece ) );
	float d1 = 9e9;
	float d2 = 9e9;
	ivec2 id = ivec2( 0 );
	vec2 f = vec2( 0.0 );
	for ( int j = -1; j <= 1; j++ ) {
		for ( int i = -1; i <= 1; i++ ) {
			ivec2 g = c + ivec2( i, j );
			vec2 fp = ( vec2( g ) + vec2( leafHash( g, 51 ), leafHash( g, 52 ) ) ) * piece;
			float d = length( p - fp );
			if ( d < d1 ) {
				d2 = d1;
				d1 = d;
				id = g;
				f = fp;
			} else if ( d < d2 ) {
				d2 = d;
			}
		}
	}
	float edge = d2 - d1;
	if ( ! flakes ) {
		float spread = 0.1 + 0.08 * tex;
		pa = vec4(
			( leafHash( id, 53 ) - 0.5 ) * spread,
			( leafHash( id, 54 ) - 0.5 ) * spread,
			exp( -( edge * edge ) / 0.5 ) * 0.1,
			0.0
		);
		pb = vec2( 0.0, leafHash( id, 45 ) );
		return;
	}
	float up = leafHash( id, 55 ) > 0.8 ? 3.2 : 1.0;
	float fa = leafHash( id, 56 ) * 3.141592654;
	float side = ( p.x - f.x ) * cos( fa ) + ( p.y - f.y ) * sin( fa );
	float hf = side > 0.0 ? 0.1 : -0.1;
	pa = vec4(
		( leafHash( id, 53 ) - 0.5 ) * 0.24 * up + hf * cos( fa ),
		( leafHash( id, 54 ) - 0.5 ) * 0.24 * up + hf * sin( fa ),
		exp( -( edge * edge ) / 0.6 ) * 0.3,
		leafHash( id, 57 ) < 0.05 + 0.2 * thinSize ? 1.0 : 0.0
	);
	pb = vec2( exp( -( side * side ) / 0.5 ) * 0.6, leafHash( id, 45 ) );
}
float leafStudio( vec2 u ) {
	vec2 f = u + vec2( 0.05, 0.08 );
	vec2 a = u + vec2( 0.2, 0.28 );
	vec2 b = u - vec2( 0.24, -0.06 );
	float e = 0.8
		+ 0.35 * exp( -dot( f, f ) / ( 2.0 * 0.12 * 0.12 ) )
		+ 1.25 * exp( -dot( a, a ) / ( 2.0 * 0.085 * 0.085 ) )
		+ 2.0 * exp( -dot( b, b ) / ( 2.0 * 0.028 * 0.028 ) );
	e *= 1.0 - 0.55 * smoothstep( 0.2, 0.6, length( u ) );
	e *= 1.0 - 0.18 * u.y;
	return max( 0.0, e );
}
vec4 leafPixel( vec2 dp, vec3 f0, float amount, float piece, bool flakes, float tex, float sheen, float wear, vec4 xf ) {
	vec2 p = leafTo( dp, xf );
	float thinSize = 1.0 - smoothstep( 1.2, 2.4, amount );
	vec4 pa;
	vec2 pb;
	leafPlate( p, piece, flakes, thinSize, tex, pa, pb );
	float rag = 0.5 + 0.22 * leafNoise( p / 5.0, 61 ) + 0.13 * leafNoise( p / 2.2, 62 ) + 0.3 * ( pb.y - 0.5 );
	float hold = amount * ( 0.55 + 0.9 * rag * ( 0.6 + 0.8 * tex ) );
	float leaf = smoothstep( 0.32, 0.42, hold );
	float bole = 0.0;
	float thin = 1.0;
	if ( wear > 0.0 ) {
		float ra = 0.6 + 0.35 * leafNoise( p / 400.0, 73 );
		float rc = cos( ra );
		float rs = sin( ra );
		vec2 uv = vec2( p.x * rc + p.y * rs, p.y * rc - p.x * rs );
		float rub = 0.5 + 0.3 * leafNoise( uv / vec2( 16.0, 9.0 ), 71 ) + 0.2 * leafNoise( uv / vec2( 5.0, 3.0 ), 72 ) - max( 0.0, 1.5 - amount ) * 0.15;
		float w = wear * 0.55;
		leaf *= smoothstep( w - 0.04, w + 0.04, rub );
		thin = smoothstep( w - 0.02, w + 0.2, rub );
		bole = smoothstep( 0.2, 0.3, amount );
	}
	if ( leaf <= 0.0 && bole <= 0.0 ) {
		return vec4( 0.0 );
	}
	ivec2 gq = ivec2( floor( p / 2.0 ) );
	float grain = 0.05 + 0.06 * tex;
	float s0 = leafSwell( p );
	vec3 n = normalize( vec3(
		-( leafSwell( leafTo( dp + vec2( 1.0, 0.0 ), xf ) ) - s0 ) * 6.0 + pa.x + ( leafHash( gq, 81 ) - 0.5 ) * grain,
		-( leafSwell( leafTo( dp + vec2( 0.0, 1.0 ), xf ) ) - s0 ) * 6.0 + pa.y + ( leafHash( gq, 82 ) - 0.5 ) * grain,
		1.0
	) );
	float e = leafStudio( 2.0 * n.xy * n.z );
	e *= 1.0 - pa.z - 0.35 * pb.x;
	e = 1.0 + ( e - 1.0 ) * sheen;
	leaf *= 1.0 - pa.w;
	float hot = smoothstep( 1.35, 2.6, e );
	vec3 boleC = vec3( 0.45, 0.2, 0.12 );
	vec3 m = max( f0, vec3( 0.001 ) );
	vec3 v = e < 1.0 ? pow( m, vec3( 1.0 + ( 1.0 - e ) * 1.3 ) ) * e : min( vec3( 1.0 ), m * e );
	v += ( vec3( 1.0, 0.985, 0.95 ) * min( 1.0, e / 1.6 ) - v ) * hot * 0.55;
	v = clamp( v, 0.0, 1.0 );
	v = clamp( boleC + ( v - boleC ) * ( 0.45 + 0.55 * thin ), 0.0, 1.0 );
	float a = leaf + bole * ( 1.0 - leaf );
	return vec4( v * leaf + boleC * bole * ( 1.0 - leaf ), a );
}
`;
