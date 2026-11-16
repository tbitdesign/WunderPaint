// Approved layout shape constructions. Native catalog integration.
// Ausschließlich gefüllte Vektorgeometrie; keine Texturen, Filter oder Animationen.
const TAU = Math.PI * 2;
const f = ( v ) => Number( v.toFixed( 3 ) );
const pt = ( [ x, y ] ) => `${ f( x ) },${ f( y ) }`;
const path = ( d, holes = false ) =>
	`<path${ holes ? ' fill-rule="evenodd"' : '' } d="${ d }"/>`;
const poly = ( points ) => `M${ points.map( pt ).join( 'L' ) }Z`;
const points = ( fn, n = 48 ) =>
	Array.from(
		{
			length: n + 1,
		},
		( _, i ) => fn( i / n )
	);
const polar = ( r, a, x = 0, y = 0 ) => [
	x + r * Math.cos( a ),
	y + r * Math.sin( a ),
];
const arc = ( r, a, b, x = 0, y = 0, n = 28 ) =>
	points( ( t ) => polar( r, a + ( b - a ) * t, x, y ), n );
const diskD = ( x, y, r ) =>
	`M${ f( x - r ) },${ f( y ) }a${ f( r ) },${ f( r ) } 0 1 0 ${ f(
		2 * r
	) },0a${ f( r ) },${ f( r ) } 0 1 0 ${ f( -2 * r ) },0Z`;
const disk = ( x, y, r ) =>
	`<circle cx="${ f( x ) }" cy="${ f( y ) }" r="${ f( r ) }"/>`;
const rr = ( x, y, w, h, r = 0 ) => {
	const rs = ( Array.isArray( r ) ? r : [ r, r, r, r ] ).map( ( v ) =>
			Math.min( w / 2, h / 2, Math.max( 0, v ) )
		),
		[ a, b, c, d ] = rs;
	return `M${ f( x + a ) },${ f( y ) }H${ f( x + w - b ) }Q${ f(
		x + w
	) },${ f( y ) } ${ f( x + w ) },${ f( y + b ) }V${ f( y + h - c ) }Q${ f(
		x + w
	) },${ f( y + h ) } ${ f( x + w - c ) },${ f( y + h ) }H${ f(
		x + d
	) }Q${ f( x ) },${ f( y + h ) } ${ f( x ) },${ f( y + h - d ) }V${ f(
		y + a
	) }Q${ f( x ) },${ f( y ) } ${ f( x + a ) },${ f( y ) }Z`;
};
const rect = ( x, y, w, h, r = 0 ) => path( rr( x, y, w, h, r ) );
const rot = ( s, a, x = 0, y = 0 ) =>
	`<g transform="rotate(${ f( a ) } ${ f( x ) } ${ f( y ) })">${ s }</g>`;
const move = ( s, x, y ) =>
	`<g transform="translate(${ f( x ) } ${ f( y ) })">${ s }</g>`;
const ribbon = ( pts, widths ) => {
	const left = [],
		right = [];
	for ( let i = 0; i < pts.length; i++ ) {
		const a = pts[ Math.max( 0, i - 1 ) ],
			b = pts[ Math.min( pts.length - 1, i + 1 ) ],
			dx = b[ 0 ] - a[ 0 ],
			dy = b[ 1 ] - a[ 1 ],
			len = Math.hypot( dx, dy ) || 1;
		const w = typeof widths === 'number' ? widths / 2 : widths[ i ] / 2;
		left.push( [
			pts[ i ][ 0 ] - ( dy / len ) * w,
			pts[ i ][ 1 ] + ( dx / len ) * w,
		] );
		right.push( [
			pts[ i ][ 0 ] + ( dy / len ) * w,
			pts[ i ][ 1 ] - ( dx / len ) * w,
		] );
	}
	return path( poly( [ ...left, ...right.reverse() ] ) );
};
const roundedPolygon = ( ps, r ) => {
	const corners = ps.map( ( v, i ) => {
		const prev = ps[ ( i + ps.length - 1 ) % ps.length ],
			next = ps[ ( i + 1 ) % ps.length ],
			a = Math.hypot( prev[ 0 ] - v[ 0 ], prev[ 1 ] - v[ 1 ] ),
			b = Math.hypot( next[ 0 ] - v[ 0 ], next[ 1 ] - v[ 1 ] ),
			d = Math.min( r, a * 0.45, b * 0.45 );
		return {
			v,
			entry: [
				v[ 0 ] + ( ( prev[ 0 ] - v[ 0 ] ) * d ) / a,
				v[ 1 ] + ( ( prev[ 1 ] - v[ 1 ] ) * d ) / a,
			],
			exit: [
				v[ 0 ] + ( ( next[ 0 ] - v[ 0 ] ) * d ) / b,
				v[ 1 ] + ( ( next[ 1 ] - v[ 1 ] ) * d ) / b,
			],
		};
	} );
	return (
		'M' +
		pt( corners.at( -1 ).exit ) +
		corners
			.map(
				( c ) =>
					'L' + pt( c.entry ) + 'Q' + pt( c.v ) + ' ' + pt( c.exit )
			)
			.join( '' ) +
		'Z'
	);
};
const G = {};
const rad = ( d ) => ( d * Math.PI ) / 180;
const capsule = ( a, b, w ) => {
	const dx = b[ 0 ] - a[ 0 ],
		dy = b[ 1 ] - a[ 1 ],
		l = Math.hypot( dx, dy );
	return move(
		rot(
			rect( -w / 2, -w / 2, l + w, w, w / 2 ),
			( Math.atan2( dy, dx ) * 180 ) / Math.PI
		),
		...a
	);
};
const cubic = ( a, b, c, d, t ) =>
	[ 0, 1 ].map(
		( k ) =>
			( 1 - t ) ** 3 * a[ k ] +
			3 * ( 1 - t ) ** 2 * t * b[ k ] +
			3 * ( 1 - t ) * t * t * c[ k ] +
			t ** 3 * d[ k ]
	);
const sectorD = ( ro, ri, a, b ) => {
	const A = polar( ro, a ),
		B = polar( ro, b ),
		C = polar( ri, b ),
		D = polar( ri, a ),
		large = b - a > Math.PI ? 1 : 0;
	return `M${ pt( A ) }A${ ro },${ ro } 0 ${ large } 1 ${ pt( B ) }L${ pt(
		C
	) }A${ ri },${ ri } 0 ${ large } 0 ${ pt( D ) }Z`;
};
const ringpart = ( ro, ri, a, b ) => path( sectorD( ro, ri, a, b ) );
const rectRing = ( x, y, w, h, t, r ) =>
	path(
		rr( x, y, w, h, r ) +
			rr( x + t, y + t, w - 2 * t, h - 2 * t, Math.max( 0, r - t ) ),
		true
	);

// Textflächen: große zusammenhängende Innenräume.
G.absatzblock = ( p ) => {
	const n = p.n,
		h = 220 / n,
		ps = [ [ -120, -110 ] ];
	const widths = Array.from(
		{
			length: n,
		},
		( _, i ) => 240 - p.a * [ 0, 0.8, 0.3, 1, 0.5 ][ i ]
	);
	for ( let i = 0; i < n; i++ ) {
		ps.push(
			[ -120 + widths[ i ], -110 + i * h ],
			[ -120 + widths[ i ], -110 + ( i + 1 ) * h ]
		);
	}
	ps.push( [ -120, 110 ] );
	return path( roundedPolygon( ps, p.b ) );
};
G.zitatpaar = ( p ) => {
	const w = p.n,
		h = p.a,
		g = p.b;
	const q = path(
		`M${ -w / 2 },${ -h / 2 }H${ w / 2 }V${ h * 0.08 }Q${ w / 2 },${
			h * 0.52
		} ${ -w * 0.35 },${ h * 0.65 }L${ -w * 0.48 },${ h * 0.4 }Q${
			w * 0.1
		},${ h * 0.25 } ${ w * 0.08 },${ h * 0.08 }H${ -w / 2 }Z`
	);
	return move( q, -( w + g ) / 2, 0 ) + move( q, ( w + g ) / 2, 0 );
};
G.bogenlabel = ( p ) => {
	const h = p.n / 2,
		k = p.a,
		x = p.b;
	return path(
		`M-125,${ -h + k }Q${ x },${ -h - k } 125,${ -h + k }V${
			h - k
		}Q${ -x },${ h + k } -125,${ h - k }Z`
	);
};
G.scherflaeche = ( p ) => {
	const h = p.n / 2,
		b = p.a,
		k = p.b;
	return path(
		`M-120,${ -h }C-25,${ -h + b } 30,${ -h - b } 120,${ -h + k }L${
			120 - k
		},${ h }C30,${ h - b } -35,${ h + b } -120,${ h - k }Z`
	);
};
G.trapezbauch = ( p ) => {
	const h = p.n / 2,
		k = p.a,
		b = p.b;
	return path(
		`M${ -120 + k },${ -h }H${ 120 - k }L120,${
			h - b
		}Q125,${ h } 0,${ h }Q-125,${ h } -120,${ h - b }Z`
	);
};
G.seitenbucht = ( p ) => {
	const h = p.n / 2,
		r = p.a,
		y = p.b;
	return path(
		`M-108,${ -h }H75V${ y - r }C${ 75 + r * 1.33 },${ y - r } ${
			75 + r * 1.33
		},${ y + r } 75,${ y + r }V${ h }H-108V${ y + r }C${
			-108 + r * 1.33
		},${ y + r } ${ -108 + r * 1.33 },${ y - r } -108,${ y - r }Z`
	);
};
G.stufenetikett = ( p ) => {
	const h = p.n / 2,
		k = p.a,
		r = p.b;
	return path(
		roundedPolygon(
			[
				[ -120, -h ],
				[ -62, -h ],
				[ -62, -h - 28 ],
				[ 75, -h - 28 ],
				[ 75, -h ],
				[ 120, -h ],
				[ 120, h - 28 ],
				[ 120 - k, h - 28 ],
				[ 120 - k, h ],
				[ -120 + k * 0.5, h ],
				[ -120 + k * 0.5, h - 28 ],
				[ -120, h - 28 ],
			],
			r
		)
	);
};
G.ueberhang = ( p ) => {
	const h = p.n / 2,
		r = p.a,
		k = p.b;
	return path(
		`M-120,${ -h + r }Q-120,${ -h } ${ -120 + r },${ -h }H${
			120 - r
		}Q120,${ -h } 120,${ -h + r }V${ -h + 65 }H${ 120 - k }V${ h }H${
			-120 + k
		}V${ -h + 65 }H-120Z`
	);
};
G.doppelschnitt = ( p ) => {
	const h = p.n / 2,
		d = p.a,
		g = p.b;
	return path(
		poly( [
			[ -120, -h ],
			[ 120, -h ],
			[ 120, -g - 15 ],
			[ 120 - d, -g - 15 ],
			[ 120 - d - 22, -g + 8 ],
			[ 120, -g + 8 ],
			[ 120, h ],
			[ -120, h ],
			[ -120, g + 15 ],
			[ -120 + d, g + 15 ],
			[ -120 + d + 22, g - 8 ],
			[ -120, g - 8 ],
		] )
	);
};
G.woelbkachel = ( p ) => {
	const k = p.n,
		b = p.a,
		q = p.b;
	return path(
		`M${ -120 + k },-110Q0,${ -110 - b } ${ 120 - k },-110Q${ 120 + q },0 ${
			120 - k
		},110Q0,${ 110 + b } ${ -120 + k },110Q${ -120 - q },0 ${
			-120 + k
		},-110Z`
	);
};

// Offene Rahmen: echte freie Innenräume statt überdeckender Hintergrundflächen.
G.titelrahmen = ( p ) => {
	const t = p.n,
		g = p.a,
		x = ( p.b / 100 ) * ( 120 - t - g / 2 );
	return path(
		poly( [
			[ x + g / 2, -108 ],
			[ 120, -108 ],
			[ 120, 108 ],
			[ -120, 108 ],
			[ -120, -108 ],
			[ x - g / 2, -108 ],
			[ x - g / 2, -108 + t ],
			[ -120 + t, -108 + t ],
			[ -120 + t, 108 - t ],
			[ 120 - t, 108 - t ],
			[ 120 - t, -108 + t ],
			[ x + g / 2, -108 + t ],
		] )
	);
};
G.doppelklammer = ( p ) => {
	const t = p.n,
		l = p.a,
		g = p.b;
	const d = poly( [
		[ -g / 2 - l, -110 ],
		[ -g / 2, -110 ],
		[ -g / 2, -110 + t ],
		[ -g / 2 - l + t, -110 + t ],
		[ -g / 2 - l + t, 110 - t ],
		[ -g / 2, 110 - t ],
		[ -g / 2, 110 ],
		[ -g / 2 - l, 110 ],
	] );
	return path( d ) + rot( path( d ), 180 );
};
G.schraegfenster = ( p ) => {
	const t = p.n,
		k = p.a,
		b = p.b;
	return path(
		poly( [
			[ -115, -105 ],
			[ 115, -105 ],
			[ 115 - k, 105 ],
			[ -115 + k, 105 ],
		] ) +
			poly( [
				[ -115 + t, -105 + t ],
				[ 115 - t, -105 + t ],
				[ 115 - k - t + b, 105 - t ],
				[ -115 + k + t + b, 105 - t ],
			] ),
		true
	);
};
G.ringklammer = ( p ) => {
	const t = p.n,
		g = rad( p.a ),
		offset = rad( p.b );
	return (
		ringpart( 120, 120 - t, g / 2 + offset, Math.PI - g / 2 + offset ) +
		ringpart( 120, 120 - t, Math.PI + g / 2 - offset, TAU - g / 2 - offset )
	);
};
G.eckdurchbruch = ( p ) => {
	const t = p.n,
		g = p.a,
		r = p.b;
	const d = roundedPolygon(
		[
			[ -120, -110 ],
			[ 120 - g, -110 ],
			[ 120 - g, -110 + t ],
			[ -120 + t, -110 + t ],
			[ -120 + t, 110 - t ],
			[ 120 - t, 110 - t ],
			[ 120 - t, -110 + g ],
			[ 120, -110 + g ],
			[ 120, 110 ],
			[ -120, 110 ],
		],
		r
	);
	return path( d );
};
G.brueckenrahmen = ( p ) => {
	const n = p.n,
		h = p.a,
		t = p.b,
		step = 240 / n,
		w = step - t;
	let d = `M-120,${ -h / 2 }H120V${ h / 2 }`;
	for ( let i = n - 1; i >= 0; i-- ) {
		const x = -120 + i * step + t / 2;
		const spring = -h / 2 + t + w / 2;
		d += `H${ x + w }V${ spring }A${ w / 2 },${
			w / 2
		} 0 0 0 ${ x },${ spring }V${ h / 2 }`;
	}
	return path( d + 'H-120Z' );
};
G.linsenfenster = ( p ) => {
	const h = p.n,
		r = p.a,
		x = p.b;
	return path(
		`M-130,0Q0,${ -h * 1.8 } 130,0Q0,${ h * 1.8 } -130,0Z` +
			diskD( x, 0, r ),
		true
	);
};
G.bildpaar = ( p ) => {
	const t = p.n,
		g = p.a,
		h = p.b;
	return (
		rectRing( -122, -105, 114, 210, t, 12 ) +
		rectRing( 8 + g, -h / 2, 114, h, t, 12 )
	);
};
G.faecherrahmen = ( p ) => {
	const t = p.n,
		span = rad( p.a ),
		r = p.b,
		a = -Math.PI / 2 - span / 2,
		b = -Math.PI / 2 + span / 2;
	const outer = [ ...arc( r, a, b, 0, 70, 48 ), [ 0, 70 ] ],
		inner = [
			...arc( r - t, a + 0.15, b - 0.15, 0, 70, 40 ),
			[ 0, 70 - t * 1.8 ],
		];
	return path( poly( outer ) + poly( inner ), true );
};
G.labyrinthblock = ( p ) => {
	const w = p.n,
		q = w + p.a,
		ps = [
			[ -120, -105 ],
			[ 105, -105 ],
			[ 105, 105 ],
			[ -105, 105 ],
			[ -105, -105 + q ],
			[ 105 - q, -105 + q ],
			[ 105 - q, 105 - q ],
			[ -105 + q, 105 - q ],
			[ -105 + q, -105 + 2 * q ],
			[ 105 - 2 * q, -105 + 2 * q ],
		];
	let d = '';
	for ( let i = 1; i < ps.length; i++ ) {
		const a = ps[ i - 1 ],
			b = ps[ i ];
		d += rr(
			Math.min( a[ 0 ], b[ 0 ] ) - w / 2,
			Math.min( a[ 1 ], b[ 1 ] ) - w / 2,
			Math.abs( b[ 0 ] - a[ 0 ] ) + w,
			Math.abs( b[ 1 ] - a[ 1 ] ) + w,
			0
		);
	}
	return rot( path( d ), p.b );
};

// Breite Richtungs- und Verbindungsformen.
G.gabelband = ( p ) => {
	const w = p.n,
		a = p.a,
		b = p.b;
	return (
		capsule( [ 0, 115 ], [ 0, b ], w ) +
		capsule( [ 0, b ], [ -a, -105 ], w ) +
		capsule( [ 0, b ], [ a, -105 ], w )
	);
};
G.bumerang = ( p ) => {
	const h = p.n,
		k = p.a,
		w = p.b;
	return path(
		`M-120,${ h }Q${ -k },${ -h - w } 120,${ h * 0.25 }Q${ k },${
			-h + w
		} -120,${ h }Z`
	);
};
G.hakenband = ( p ) => {
	const w = p.n,
		r = p.a,
		l = p.b;
	return path(
		`M${ r - w },${ -l }H${ r }V25A${ r },${ r } 0 0 1 ${ -r },25V${
			25 - w
		}H${ -r + w }V25A${ r - w },${ r - w } 0 0 0 ${ r - w },25Z`
	);
};
G.kreuzschwung = ( p ) => {
	const ps = points(
			( t ) =>
				cubic(
					[ -120, -95 ],
					[ p.a, -95 ],
					[ -p.a, 95 ],
					[ 120, 95 ],
					t
				),
			70
		),
		band = ribbon( ps, p.n );
	return rot( band, p.b ) + rot( band, 180 - p.b );
};
G.doppelimpuls = ( p ) => {
	const w = p.n,
		h = p.a,
		g = p.b;
	const d = poly( [
		[ -w / 2, -h ],
		[ -w / 2 + 70, 0 ],
		[ -w / 2, h ],
		[ w / 2, h ],
		[ w / 2 + 70, 0 ],
		[ w / 2, -h ],
	] );
	return (
		move( path( d ), -60 - g / 2, -18 ) + move( path( d ), 60 + g / 2, 18 )
	);
};
G.spannband = ( p ) => {
	const w = p.n,
		a = p.a,
		b = p.b;
	return path(
		`M-125,${ -w / 2 }C-65,${ -w / 2 - a } 25,${ -w / 2 + b } 125,${
			-w / 2
		}V${ w / 2 }C25,${ w / 2 + b } -65,${ w / 2 - a } -125,${ w / 2 }Z`
	);
};
G.negativpfeil = ( p ) => {
	const w = p.n,
		h = p.a,
		k = p.b;
	return path(
		rr( -120, -110, 240, 220, 25 ) +
			poly( [
				[ -85, -w / 2 ],
				[ k, -w / 2 ],
				[ k, -h ],
				[ 90, 0 ],
				[ k, h ],
				[ k, w / 2 ],
				[ -85, w / 2 ],
			] ),
		true
	);
};
G.bahnteiler = ( p ) => {
	const w = p.n,
		a = p.a,
		b = p.b;
	const top = points(
		( t ) => cubic( [ -125, 0 ], [ -b, 0 ], [ b, -a ], [ 125, -a ], t ),
		48
	);
	const bottom = points(
		( t ) => cubic( [ -125, 0 ], [ -b, 0 ], [ b, a ], [ 125, a ], t ),
		48
	);
	return ribbon( top, w ) + ribbon( bottom, w );
};
G.schlaufenbogen = ( p ) => {
	const t = p.n,
		r = p.a,
		k = p.b;
	const outer = `M0,${ -r }C${ r * 1.4 },${ -r } ${ r * 1.4 },${
		r * 0.8
	} 0,${ r }L${ -k },${ r + 70 }L${ -k - t },${ r + 48 }L${ -t },${
		r * 0.65
	}C${ -r * 1.25 },${ r * 0.6 } ${ -r * 1.25 },${ -r } 0,${ -r }Z`;
	return path( outer + diskD( 0, -r * 0.05, r - t ), true );
};
G.faltwinkel = ( p ) => {
	const w = p.n,
		h = p.a,
		g = p.b;
	return (
		path(
			poly( [
				[ -120, -h ],
				[ -30, -h + 55 ],
				[ -30, -h + 55 + w ],
				[ -120, -h + w ],
			] )
		) +
		path(
			poly( [
				[ -30 + g, -h + 55 ],
				[ 65 - g, h - 55 ],
				[ 65 - g, h - 55 + w ],
				[ -30 + g, -h + 55 + w ],
			] )
		) +
		path(
			poly( [
				[ 65, h - 55 ],
				[ 120, h - 90 ],
				[ 120, h - 90 + w ],
				[ 65, h - 55 + w ],
			] )
		)
	);
};

// Kompositionselemente mit wenigen großen Bestandteilen.
G.orbitalblock = ( p ) => {
	const r = p.n,
		t = p.a,
		k = p.b;
	const oval = path(
		`M-130,0C-130,-72 130,-72 130,0C130,72 -130,72 -130,0Z M${
			-130 + t
		},0C${ -130 + t },${ -72 + t } ${ 130 - t },${ -72 + t } ${
			130 - t
		},0C${ 130 - t },${ 72 - t } ${ -130 + t },${ 72 - t } ${
			-130 + t
		},0Z`,
		true
	);
	return disk( 0, 0, r ) + rot( oval, k );
};
G.tangramflaeche = ( p ) => {
	const g = p.n,
		x = p.a,
		y = p.b;
	const regions = [
		[
			[ -120, -120 ],
			[ x, -120 ],
			[ x, y ],
		],
		[
			[ -120, -120 ],
			[ x, y ],
			[ -120, 120 ],
		],
		[
			[ x + g, -120 ],
			[ 120, -120 ],
			[ 120, y ],
		],
		[
			[ x + g, -120 ],
			[ 120, y ],
			[ x + g, y ],
		],
		[
			[ x, y + g ],
			[ 120, y + g ],
			[ 120, 120 ],
		],
		[
			[ x, y + g ],
			[ 120, 120 ],
			[ -120, 120 ],
		],
	];
	return regions
		.map( ( ps ) => {
			const cx = ps.reduce( ( v, q ) => v + q[ 0 ], 0 ) / 3,
				cy = ps.reduce( ( v, q ) => v + q[ 1 ], 0 ) / 3;
			return path(
				poly(
					ps.map( ( q ) => [
						cx + ( q[ 0 ] - cx ) * ( 1 - g / 150 ),
						cy + ( q[ 1 ] - cy ) * ( 1 - g / 150 ),
					] )
				)
			);
		} )
		.join( '' );
};
G.kreislinsen = ( p ) => {
	const n = p.n,
		h = p.a,
		g = p.b - 20;
	let s = '';
	const d = `M${ g },0C${ g + 20 },${ -h / 2 } 110,${ -h / 2 } 145,0C110,${
		h / 2
	} ${ g + 20 },${ h / 2 } ${ g },0Z`;
	for ( let i = 0; i < n; i++ ) {
		s += rot( path( d ), ( i * 360 ) / n );
	}
	return s;
};
G.eckfaecher = ( p ) => {
	let s = '';
	const n = p.n,
		g = p.a,
		w = p.b;
	for ( let i = 0; i < n; i++ ) {
		const c = -115 + i * ( w + g );
		s += path(
			poly( [
				[ c, 115 ],
				[ c, c ],
				[ 115, c ],
				[ 115, c + w ],
				[ c + w, c + w ],
				[ c + w, 115 ],
			] )
		);
	}
	return s;
};
G.bogendreieck = ( p ) => {
	const k = p.n,
		b = p.a,
		r = p.b,
		ps = Array.from(
			{
				length: 3,
			},
			( _, i ) => polar( 130, rad( -90 + i * 120 ) )
		);
	let d = 'M' + pt( ps[ 0 ] );
	for ( let i = 0; i < 3; i++ ) {
		const a = ps[ i ],
			c = ps[ ( i + 1 ) % 3 ],
			mx = ( a[ 0 ] + c[ 0 ] ) / 2,
			my = ( a[ 1 ] + c[ 1 ] ) / 2;
		d +=
			'Q' +
			pt( [
				mx * ( 1 + k / 100 ) + b * ( i === 0 ? 1 : -0.5 ),
				my * ( 1 + k / 100 ),
			] ) +
			' ' +
			pt( c );
	}
	return rot( path( d + 'Z' ), r );
};
G.klammerrosette = ( p ) => {
	let s = '';
	for ( let i = 0; i < p.n; i++ ) {
		s += rot(
			move(
				ringpart( 55, 55 - p.a, rad( p.b ), TAU - rad( p.b ) ),
				63 / Math.sin( Math.PI / p.n ),
				0
			),
			( i * 360 ) / p.n
		);
	}
	return s;
};
G.zwillingsbogen = ( p ) => {
	const w = p.n,
		r = p.a,
		g = p.b;
	const q = path(
		`M${ -r },0A${ r },${ r } 0 0 1 ${ r },0V${ g }H${ r - w }V0A${
			r - w
		},${ r - w } 0 0 0 ${ -r + w },0V${ g }H${ -r }Z`
	);
	return (
		move( q, -r - w / 4, -g / 2 ) +
		rot( move( q, -r - w / 4, -g / 2 ), 180 )
	);
};
G.plattenstern = ( p ) => {
	const g = p.n,
		k = p.a,
		b = p.b;
	let s = '';
	for ( let i = 0; i < 4; i++ ) {
		s += rot(
			path(
				poly( [
					[ g, g ],
					[ 120, g ],
					[ 120 - k, 120 ],
					[ g, 120 - b ],
				] )
			),
			i * 90
		);
	}
	return s;
};
G.omegablock = ( p ) => {
	const w = p.n,
		g = p.a,
		l = p.b,
		ang = Math.asin( g / 120 ),
		a = Math.PI / 2 + ang,
		b = Math.PI * 2.5 - ang;
	const y = Math.sqrt( 120 * 120 - g * g ),
		overlap = ( g * w ) / 120 + 1;
	return (
		ringpart( 120, 120 - w, a, b ) +
		rect( -g - l, y - w, l + overlap, w ) +
		rect( g - overlap, y - w, l + overlap, w )
	);
};
G.schnittkreis = ( p ) => {
	const w = p.n,
		k = p.a,
		b = p.b;
	const R = 120,
		y = -w / 2,
		x = Math.sqrt( R * R - y * y );
	const d = `M${ x },${ y }A120,120 0 1 0 ${ x },${ -y }H${ k }V${ y }Z`;
	return rot( path( d ), b );
};

// Grobe Strukturflächen. Dichte bewusst begrenzt.
G.wellenkacheln = ( p ) => {
	const n = p.n,
		g = p.a,
		h = p.b,
		step = 240 / n;
	let s = '';
	for ( let y = 0; y < n; y++ ) {
		for ( let x = 0; x < n; x++ ) {
			const w = step - g,
				a = ( h / 100 ) * w * 0.45,
				d = `M0,${ w * 0.2 }Q${ w * 0.5 },${ w * 0.2 - a } ${ w },${
					w * 0.2
				}V${ w * 0.8 }Q${ w * 0.5 },${ w * 0.8 + a } 0,${ w * 0.8 }Z`;
			s += move(
				rot( path( d ), ( ( x + y ) % 2 ) * 90, w / 2, w / 2 ),
				-120 + x * step + g / 2,
				-120 + y * step + g / 2
			);
		}
	}
	return s;
};
G.bogenriegel = ( p ) => {
	const n = p.n,
		g = p.a,
		k = p.b,
		step = 240 / n;
	let s = '';
	for ( let y = 0; y < n; y++ ) {
		const yy = -120 + y * step,
			h = step - g,
			d = `M-120,${ yy }H120V${ yy + h }Q${ k },${
				yy + h - step * 0.6
			} -120,${ yy + h }Z`;
		s += path( d );
	}
	return s;
};
G.linsenraster = ( p ) => {
	const n = p.n,
		g = p.a,
		b = p.b,
		step = 240 / n;
	let s = '';
	for ( let y = 0; y < n; y++ ) {
		for ( let x = 0; x < n; x++ ) {
			const w = step - g,
				h = ( w * b ) / 100,
				d = `M${ -w / 2 },0Q0,${ -h } ${ w / 2 },0Q0,${ h } ${
					-w / 2
				},0Z`;
			s += move(
				rot( path( d ), ( ( x + y ) % 2 ) * 90 ),
				-120 + ( x + 0.5 ) * step,
				-120 + ( y + 0.5 ) * step
			);
		}
	}
	return s;
};
G.lozengenfeld = ( p ) => {
	const n = p.n,
		g = p.a,
		r = p.b,
		step = 240 / n;
	let s = '';
	for ( let y = 0; y < n; y++ ) {
		for ( let x = 0; x < n; x++ ) {
			const a = ( step - g ) / 2;
			s += move(
				path(
					roundedPolygon(
						[
							[ 0, -a ],
							[ a, 0 ],
							[ 0, a ],
							[ -a, 0 ],
						],
						r
					)
				),
				-120 + ( x + 0.5 ) * step,
				-120 + ( y + 0.5 ) * step
			);
		}
	}
	return s;
};
G.mosaikbloecke = ( p ) => {
	const g = p.n,
		x = p.a,
		y = p.b;
	const rects = [
		[ -120, -120, 120 + x - g, 120 + y - g ],
		[ x, -120, 120 - x, 60 + y - g ],
		[ x, -60 + y, 120 - x, 60 - g ],
		[ -120, y, 70 + x - g, 120 - y ],
		[ -50 + x, y, 170 - x, 120 - y ],
	];
	return rects
		.map( ( [ rx, ry, w, h ] ) => rect( rx, ry, w, h, 0 ) )
		.join( '' );
};
G.ringkacheln = ( p ) => {
	const n = p.n,
		g = p.a,
		t = p.b,
		step = 240 / n;
	let s = '';
	for ( let y = 0; y < n; y++ ) {
		for ( let x = 0; x < n; x++ ) {
			const r = ( step - g ) / 2;
			s += move(
				rot(
					ringpart( r, r * ( 1 - t / 100 ), rad( 35 ), rad( 325 ) ),
					( ( x + y ) % 4 ) * 90
				),
				-120 + ( x + 0.5 ) * step,
				-120 + ( y + 0.5 ) * step
			);
		}
	}
	return s;
};
G.wellenzaun = ( p ) => {
	const n = p.n,
		g = p.a,
		h = p.b,
		step = 240 / n;
	let s = '';
	for ( let i = 0; i < n; i++ ) {
		const w = step - g,
			y = -85 + ( i % 2 ) * h;
		s += rect( -120 + i * step + g / 2, y, w, 160 - ( i % 2 ) * h, w / 2 );
	}
	return s;
};
G.treppendreiecke = ( p ) => {
	const n = p.n,
		g = p.a,
		k = p.b,
		step = 240 / n;
	let s = '';
	for ( let y = 0; y < n; y++ ) {
		for ( let x = 0; x < n; x++ ) {
			const w = step - g,
				ps = [
					[ 0, 0 ],
					[ w, 0 ],
					[ w, w * 0.35 ],
					[ w * 0.65, w * 0.35 ],
					[ w * 0.65, w * 0.68 ],
					[ w * 0.32, w * 0.68 ],
					[ w * 0.32, w ],
					[ 0, w ],
				];
			s += move(
				rot(
					path( poly( ps ) ),
					( ( x + y + k ) % 4 ) * 90,
					w / 2,
					w / 2
				),
				-120 + x * step + g / 2,
				-120 + y * step + g / 2
			);
		}
	}
	return s;
};
G.dreieckstakt = ( p ) => {
	const n = p.n,
		g = p.a,
		h = p.b,
		step = 240 / n;
	let s = '';
	for ( let i = 0; i < n; i++ ) {
		const w = step - g;
		s += path(
			poly( [
				[ -120 + i * step, 100 ],
				[ -120 + i * step + w / 2, 100 - h * ( i % 2 ? 0.65 : 1 ) ],
				[ -120 + i * step + w, 100 ],
			] )
		);
	}
	return s;
};
G.rautenwirbel = ( p ) => {
	const n = p.n,
		g = p.a,
		w = Math.min( g * 0.4, p.b * 0.65 ),
		h = g * Math.sin( Math.PI / n ) * 0.78;
	let s = '';
	const tile = rot(
		path(
			roundedPolygon(
				[
					[ 0, -h ],
					[ w, 0 ],
					[ 0, h ],
					[ -w, 0 ],
				],
				5
			)
		),
		15
	);
	for ( let i = 0; i < n; i++ ) {
		s += rot( move( tile, g, 0 ), ( i * 360 ) / n );
	}
	return s;
};
export const LAYOUT_SHAPE_GEOMETRY = G;
