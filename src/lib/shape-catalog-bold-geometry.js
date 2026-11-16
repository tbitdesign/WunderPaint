// Approved bold shape constructions. Native catalog integration.
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
const sector = ( outer, inner, a, b, x = 0, y = 0 ) =>
	path(
		poly( [
			...arc( outer, a, b, x, y ),
			...( inner ? arc( inner, b, a, x, y ) : [ [ x, y ] ] ),
		] )
	);
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
const smoothLoop = ( ps ) => {
	let d = 'M' + pt( ps[ 0 ] );
	for ( let i = 0; i < ps.length; i++ ) {
		const a = ps[ ( i + ps.length - 1 ) % ps.length ],
			b = ps[ i ],
			c = ps[ ( i + 1 ) % ps.length ],
			e = ps[ ( i + 2 ) % ps.length ];
		d +=
			'C' +
			pt( [
				b[ 0 ] + ( c[ 0 ] - a[ 0 ] ) / 6,
				b[ 1 ] + ( c[ 1 ] - a[ 1 ] ) / 6,
			] ) +
			' ' +
			pt( [
				c[ 0 ] - ( e[ 0 ] - b[ 0 ] ) / 6,
				c[ 1 ] - ( e[ 1 ] - b[ 1 ] ) / 6,
			] ) +
			' ' +
			pt( c );
	}
	return d + 'Z';
};
const G = {};

// 01–10: Flächen mit genügend zusammenhängendem Platz für Schrift.
G.radiusblock = ( p ) =>
	path( rr( -125, -p.n / 2, 250, p.n, [ p.a, p.b, p.a, p.b ] ) );
G.schraegkapsel = ( p ) =>
	`<g transform="skewX(${ p.a })">${ rect(
		-110,
		-p.n / 2,
		220,
		p.n,
		p.b
	) }</g>`;
G.schulterflaeche = ( p ) => {
	const h = p.n,
		y = -h / 2,
		c = p.a,
		r = p.b;
	return path(
		`M-125,${ y + r }Q-125,${ y } -90,${ y }H${ c - 15 }C${
			c + 65
		},${ y } 125,${ y + r * 0.35 } 125,${ y + r }V${ h / 2 }H-125Z`
	);
};
G.registerflaeche = ( p ) => {
	const h = p.n,
		tw = p.a,
		tx = -100 + ( ( 180 - tw ) * p.b ) / 100,
		t = 34,
		y = -h / 2;
	return path(
		`M-113,${ y }H${ tx }V${ y - t + 10 }Q${ tx },${ y - t } ${ tx + 10 },${
			y - t
		}H${ tx + tw - 10 }Q${ tx + tw },${ y - t } ${ tx + tw },${
			y - t + 10
		}V${ y }H113Q125,${ y } 125,${ y + 12 }V${ h / 2 - 12 }Q125,${
			h / 2
		} 113,${ h / 2 }H-113Q-125,${ h / 2 } -125,${ h / 2 - 12 }V${
			y + 12
		}Q-125,${ y } -113,${ y }Z`
	);
};
G.taillenlabel = ( p ) => {
	const h = p.n / 2,
		d = p.a,
		x = p.b;
	return path(
		`M-125,${ -h }C-55,${ -h } ${ x - 45 },${ -h + d } ${ x },${
			-h + d
		}S65,${ -h } 125,${ -h }V${ h }C65,${ h } ${ x + 45 },${
			h - d
		} ${ x },${ h - d }S-55,${ h } -125,${ h }Z`
	);
};
G.kerbenlabel = ( p ) => {
	const h = p.n / 2,
		k = p.a,
		v = p.b;
	return path(
		`M-125,${ -h }H125V${ -v }L${
			125 - k
		},0 125,${ v }V${ h }H-125V${ v }L${ -125 + k },0 -125,${ -v }Z`
	);
};
G.bogenkeil = ( p ) => {
	const h = p.n,
		s = p.a,
		b = p.b;
	return path(
		`M-120,${ h / 2 }V${ -h / 2 }C${ -120 + s },${ -h / 2 } ${ 60 - b },${
			h / 2 - 60
		} 125,${ h / 2 }C${ 60 - b },${ h / 2 + b * 0.25 } -30,${
			h / 2
		} -120,${ h / 2 }Z`
	);
};
G.doppelkopf = ( p ) => {
	const r = p.n,
		w = p.a,
		c = p.b;
	return path(
		`M-72,${ -r }C-10,${ -r } ${ -c },${ -w } 0,${ -w }S10,${ -r } 72,${ -r }C${
			72 + r * 0.8
		},${ -r } ${
			72 + r * 0.8
		},${ r } 72,${ r }C10,${ r } ${ c },${ w } 0,${ w }S-10,${ r } -72,${ r }C${
			-72 - r * 0.8
		},${ r } ${ -72 - r * 0.8 },${ -r } -72,${ -r }Z`
	);
};
G.schraeglasche = ( p ) => {
	const h = p.n / 2,
		k = p.a,
		t = p.b;
	return path(
		poly( [
			[ -125, -h ],
			[ 125 - k, -h ],
			[ 125, -h + k ],
			[ 125, h + t ],
			[ 125 - k * 1.4, h ],
			[ -125 + k * 0.25, h ],
			[ -125, h - k * 0.25 ],
		] )
	);
};
G.versatzblock = ( p ) => {
	const a = p.a,
		h = p.n;
	return path(
		roundedPolygon(
			[
				[ -110, -h ],
				[ 110 - a, -h ],
				[ 110 - a, 0 ],
				[ 110, 0 ],
				[ 110, h ],
				[ -110 + a, h ],
				[ -110 + a, 0 ],
				[ -110, 0 ],
			],
			p.b
		)
	);
};

// 11–20: Bewusst große negative Flächen. Durchbrüche bleiben transparent.
G.kreisbucht = ( p ) => {
	const r = p.n,
		x = 120 - r,
		y = -120 + r,
		b = p.b;
	return path(
		`M-120,${ -120 + b }Q-120,-120 ${
			-120 + b
		},-120H${ x }A${ r },${ r } 0 0 0 120,${ y }V${ 120 - b }Q120,120 ${
			120 - b
		},120H${ -120 + b }Q-120,120 -120,${ 120 - b }Z`
	);
};
// p.a controls the corner orientation, not a redundant preview rotation.
const kreisbucht = G.kreisbucht;
G.kreisbucht = ( p ) => rot( kreisbucht( p ), p.a * 90 );
// A rotated aperture uses a path assembled from actual transformed coordinates.
const rotatePoints = ( ps, a ) =>
	ps.map( ( [ x, y ] ) => [
		x * Math.cos( a ) - y * Math.sin( a ),
		x * Math.sin( a ) + y * Math.cos( a ),
	] );
const capsulePoints = ( w, h ) => [
	...arc( w / 2, Math.PI, TAU, 0, -h / 2 + w / 2, 16 ),
	...arc( w / 2, 0, Math.PI, 0, h / 2 - w / 2, 16 ),
];
G.schraegschlitz = ( p ) =>
	path(
		rr( -118, -108, 236, 216, p.b ) +
			poly(
				rotatePoints(
					capsulePoints( p.n, 170 ),
					( p.a * Math.PI ) / 180
				)
			),
		true
	);
G.versetztesfenster = ( p ) => {
	const inner = 210 - 2 * p.n;
	return path(
		rr( -120, -120, 240, 240, 34 ) +
			rr( -inner / 2 + p.a, -inner / 2 + p.b, inner, inner, 17 ),
		true
	);
};
G.kerbkreis = ( p ) => {
	const n = p.n,
		spread = ( p.a * Math.PI ) / 180,
		depth = p.b;
	const ps = [];
	for ( let i = 0; i < n; i++ ) {
		const a = ( i * TAU ) / n;
		ps.push(
			...arc(
				120,
				a + spread / 2,
				a + TAU / n - spread / 2,
				0,
				0,
				Math.ceil( 96 / n )
			)
		);
		ps.push( polar( 120 - depth, a + TAU / n ) );
	}
	return path( poly( ps ) );
};
G.fensterkreis = ( p ) =>
	path( diskD( 0, 0, 120 ) + rr( -p.n / 2 + p.a, -90, p.n, 180, p.b ), true );
G.viertelringblock = ( p ) => {
	const w = p.n,
		outer = arc( 240, -Math.PI / 2, 0, -120, 120 ),
		inner = arc( 240 - w, 0, -Math.PI / 2, -120, 120 );
	return (
		rot( path( poly( [ ...outer, ...inner ] ) ), p.a ) +
		rot( rect( 120 - w, 120, w, p.b ), p.a )
	);
};
G.bisskante = ( p ) => {
	const n = p.n,
		r = p.a,
		h = p.b,
		step = 240 / n;
	let d = `M-120,${ -h / 2 }H120V${ h / 2 }`;
	for ( let i = n - 1; i >= 0; i-- ) {
		const x = -120 + ( i + 0.5 ) * step;
		d += `H${ x + r }C${ x + r },${ h / 2 - r * 1.33 } ${ x - r },${
			h / 2 - r * 1.33
		} ${ x - r },${ h / 2 }`;
	}
	return path( d + `H-120Z` );
};
G.bogenpaar = ( p ) => {
	const r = p.n,
		g = p.a,
		v = p.b;
	return (
		move( sector( r, 0, -Math.PI / 2, Math.PI / 2 ), g / 2, v ) +
		move( sector( r, 0, Math.PI / 2, Math.PI * 1.5 ), -g / 2, -v )
	);
};
G.rundschlitz = ( p ) => {
	const r = Math.min( p.n, 112 - p.a / 2 ),
		h = p.a,
		w = p.b;
	return path(
		`M${ 120 - r },-112Q120,-112 120,${ -112 + r }V${ -h / 2 }H${
			120 - w
		}A${ h / 2 },${ h / 2 } 0 0 0 ${ 120 - w },${ h / 2 }H120V${
			112 - r
		}Q120,112 ${ 120 - r },112H${ -120 + r }Q-120,112 -120,${ 112 - r }V${
			-112 + r
		}Q-120,-112 ${ -120 + r },-112Z`
	);
};
G.keilfenster = ( p ) => {
	const r = p.n,
		h = p.a,
		x = p.b;
	return path(
		poly( [
			[ -122, 110 ],
			[ 0, -125 ],
			[ 122, 110 ],
		] ) +
			poly( [
				[ x - r, h ],
				[ x, -h ],
				[ x + r, h ],
			] ),
		true
	);
};

// 21–30: Breite, geschlossene Bänder. Geometrie wächst nicht mit der Ausgabegröße.
G.sband = ( p ) => {
	const w = p.n,
		a = p.a,
		l = p.b;
	return path(
		`M${ -l },${ -100 - w / 2 }H${ a }C${ a + 95 },${ -100 - w / 2 } ${
			a + 95
		},${ w / 2 } 0,${ w / 2 }H${ -a }C${ -a - 36 },${ w / 2 } ${
			-a - 36
		},${ 100 - w / 2 } ${ -a },${ 100 - w / 2 }H${ l }V${
			100 + w / 2
		}H${ -a }C${ -a - 95 },${ 100 + w / 2 } ${ -a - 95 },${ -w / 2 } 0,${
			-w / 2
		}H${ a }C${ a + 36 },${ -w / 2 } ${ a + 36 },${ -100 + w / 2 } ${ a },${
			-100 + w / 2
		}H${ -l }Z`
	);
};
G.knickband = ( p ) => {
	const w = p.n,
		t = p.a,
		x = p.b;
	return path(
		poly( [
			[ -125, -t - w / 2 ],
			[ x, -t - w / 2 ],
			[ x + 65, t - w / 2 ],
			[ 125, t - w / 2 ],
			[ 125, t + w / 2 ],
			[ x + 65 - w * 0.6, t + w / 2 ],
			[ x - w * 0.6, -t + w / 2 ],
			[ -125, -t + w / 2 ],
		] )
	);
};
G.verjuengterbogen = ( p ) => {
	const span = ( p.n * Math.PI ) / 180,
		w = p.a,
		taper = p.b / 100,
		ps = arc( 93, -span / 2, span / 2, 0, 0, 64 );
	return rot(
		ribbon(
			ps,
			ps.map( ( _, i ) => w * ( 1 - ( taper * i ) / ( ps.length - 1 ) ) )
		),
		180
	);
};
G.umlenkung = ( p ) => {
	const w = p.n,
		r = p.a,
		l = p.b;
	return path(
		`M${ -r },${ l }V0A${ r },${ r } 0 0 1 ${ r },0V${ l * 0.58 }H${
			r - w
		}V0A${ r - w },${ r - w } 0 0 0 ${ -r + w },0V${ l }Z`
	);
};
G.gegenwelle = ( p ) => {
	const a = p.n,
		g = p.a,
		h = p.b;
	return (
		path(
			`M-125,${ -h }H125V${ -g / 2 }C45,${ -g / 2 - a } -45,${
				-g / 2 + a
			} -125,${ -g / 2 }Z`
		) +
		path(
			`M-125,${ g / 2 }C-45,${ g / 2 + a } 45,${ g / 2 - a } 125,${
				g / 2
			}V${ h }H-125Z`
		)
	);
};
G.spiralblock = ( p ) => {
	const turns = p.n / 100,
		w = p.a,
		ps = points(
			( t ) =>
				polar(
					p.b + ( 126 - p.b ) * t,
					-Math.PI / 2 + TAU * turns * t
				),
			120
		);
	return (
		ribbon( ps, w ) +
		disk( ps[ 0 ][ 0 ], ps[ 0 ][ 1 ], w / 2 ) +
		disk( ps.at( -1 )[ 0 ], ps.at( -1 )[ 1 ], w / 2 )
	);
};
G.bogenstaffel = ( p ) => {
	let s = '';
	const n = p.n,
		g = p.a,
		w = ( 120 - 24 - ( n - 1 ) * g ) / n,
		span = ( p.b * Math.PI ) / 180;
	for ( let i = 0; i < n; i++ ) {
		const r = 120 - i * ( w + g );
		s += sector(
			r,
			r - w,
			Math.PI + ( Math.PI - span ) / 2,
			TAU - ( Math.PI - span ) / 2
		);
	}
	return s;
};
G.klammerband = ( p ) => {
	const x = p.a / 2,
		m = -x - p.b,
		w = p.n / 2;
	return path(
		`M${ x - w },-120C${ x - w - 65 },-95 ${ x - w + 15 },-45 ${
			m - w + 28
		},-16Q${ m - w },0 ${ m - w + 28 },16C${ x - w + 15 },45 ${
			x - w - 65
		},95 ${ x - w },120H${ x + w }C${ x + w - 65 },95 ${ x + w + 15 },45 ${
			m + w + 28
		},16Q${ m + w },0 ${ m + w + 28 },-16C${ x + w + 15 },-45 ${
			x + w - 65
		},-95 ${ x + w },-120Z`
	);
};
G.knotenband = ( p ) => {
	const r = p.n,
		w = p.a,
		g = p.b;
	const a = rr( -120, -r, 240, r * 2, r );
	const h1 = rr(
		-120 + w,
		-r + w,
		120 - w - g / 2,
		2 * ( r - w ),
		Math.max( 3, r - w )
	);
	const h2 = rr(
		g / 2,
		-r + w,
		120 - w - g / 2,
		2 * ( r - w ),
		Math.max( 3, r - w )
	);
	return rot( path( a + h1 + h2, true ), -25 );
};
G.schwenkband = ( p ) => {
	const w = p.n,
		r = p.a,
		l = p.b;
	return path(
		`M-120,${ -l }H${ -120 + w }V${ 90 - r }Q${ -120 + w },${ 90 - w } ${
			-120 + r
		},${ 90 - w }H120V90H${ -120 + r }Q-120,90 -120,${ 90 - r }Z`
	);
};

// 31–40: Wenige große Bauteile für Zeichen, Akzente und plakative Motive.
G.rotor = ( p ) => {
	let s = '';
	const n = p.n,
		b = p.a,
		w = p.b;
	for ( let i = 0; i < n; i++ ) {
		const d = `M${ 18 },${ -w / 2 }C70,${ -w / 2 - b } 126,${
			-w / 2 - b
		} 120,${ w / 2 - b }C116,${ w / 2 - b + 26 } 58,${ w / 2 } 18,${
			w / 2
		}Z`;
		s += rot( path( d ), ( i * 360 ) / n );
	}
	return s;
};
G.rundstern = ( p ) => {
	let s = '';
	for ( let i = 0; i < p.n; i++ ) {
		s += rot( rect( -p.a / 2, -120, p.a, 140, p.b ), ( i * 360 ) / p.n );
	}
	return s;
};
G.vierboegen = ( p ) => {
	const g = p.n,
		r = p.a,
		s = p.b;
	let out = '';
	for ( let i = 0; i < 4; i++ ) {
		out += rot(
			move( sector( r, 0, 0, Math.PI / 2 ), g / 2, g / 2 + s ),
			i * 90
		);
	}
	return out;
};
G.eckkreuz = ( p ) => {
	const w = p.n,
		g = p.a,
		l = p.b;
	let s = '';
	for ( let i = 0; i < 4; i++ ) {
		s += rot(
			path(
				poly( [
					[ g / 2, g / 2 ],
					[ l, g / 2 ],
					[ l, g / 2 + w ],
					[ g / 2 + w, g / 2 + w ],
					[ g / 2 + w, l ],
					[ g / 2, l ],
				] )
			),
			i * 90
		);
	}
	return s;
};
G.blockfaecher = ( p ) => {
	let s = '';
	const n = p.n,
		span = p.a,
		g = p.b,
		w = ( span - g * ( n - 1 ) ) / n;
	for ( let i = 0; i < n; i++ ) {
		s += sector(
			210,
			40,
			( ( -90 - span / 2 + i * ( w + g ) ) * Math.PI ) / 180,
			( ( -90 - span / 2 + i * ( w + g ) + w ) * Math.PI ) / 180,
			0,
			95
		);
	}
	return s;
};
G.punktverbund = ( p ) => {
	const n = p.n,
		ps = Array.from(
			{
				length: n * 12,
			},
			( _, i ) => {
				const a = ( i * TAU ) / ( n * 12 );
				return polar(
					p.b * 0.65 +
						p.a * 0.9 * ( ( 1 + Math.cos( n * a ) ) / 2 ) ** 0.9,
					a - Math.PI / 2
				);
			}
		);
	return path( smoothLoop( ps ) );
};
G.doppellinse = ( p ) => {
	const h = p.n / 2,
		g = p.a,
		b = p.b;
	const d = `M-120,0C-65,${ -h - b } 65,${ -h + b } 120,0C65,${ h + b } -65,${
		h - b
	} -120,0Z`;
	return (
		move( path( d ), 0, -h * 0.7 - g / 2 ) +
		move( path( d ), 0, h * 0.7 + g / 2 )
	);
};
G.spitzbogenblock = ( p ) => {
	const r = p.n,
		x = p.a,
		g = p.b;
	const d = `M0,${ -r }Q0,0 ${ r },0Q${ x },${ x } 0,${ r }Q0,0 ${ -r },0Q${ -x },${ -x } 0,${ -r }Z`;
	return rot( path( d ), g );
};
G.scheibenversatz = ( p ) => {
	const n = p.n,
		g = p.a,
		offset = p.b,
		R = 115,
		h = ( 2 * R ) / n;
	let s = '';
	for ( let i = 0; i < n; i++ ) {
		const y0 = -R + i * h + g / 2,
			y1 = -R + ( i + 1 ) * h - g / 2,
			x0 = Math.sqrt( R * R - y0 * y0 ),
			x1 = Math.sqrt( R * R - y1 * y1 );
		s += move(
			path(
				`M${ f( -x0 ) },${ f( y0 ) }H${ f(
					x0
				) }A${ R },${ R } 0 0 1 ${ f( x1 ) },${ f( y1 ) }H${ f(
					-x1
				) }A${ R },${ R } 0 0 1 ${ f( -x0 ) },${ f( y0 ) }Z`
			),
			( i - ( n - 1 ) / 2 ) * offset,
			0
		);
	}
	return s;
};
G.faecherrosette = ( p ) => {
	let s = '';
	const n = p.n,
		r = p.a,
		b = p.b;
	for ( let i = 0; i < n; i++ ) {
		const a = ( i * TAU ) / n,
			q = TAU / n;
		const ps = [
			polar( r, a ),
			polar( 120, a + q * 0.12 ),
			polar( 105, a + q * ( 0.55 + b / 300 ) ),
			polar( r, a + q * 0.9 ),
		];
		s += path( poly( ps ) );
	}
	return s;
};

// 41–50: Grobe Muster mit maximal 25 Modulen statt feinem Linienwerk.
G.schachflaeche = ( p ) => {
	let s = '';
	const n = p.n,
		step = 240 / n,
		g = p.a;
	for ( let y = 0; y < n; y++ ) {
		for ( let x = 0; x < n; x++ ) {
			if ( ( x + y ) % 2 === 0 ) {
				s += rect(
					-120 + x * step + g / 2,
					-120 + y * step + g / 2,
					step - g,
					step - g,
					p.b
				);
			}
		}
	}
	return s;
};
G.kapselraster = ( p ) => {
	let s = '';
	const n = p.n,
		h = 220 / n,
		g = p.a;
	for ( let y = 0; y < n; y++ ) {
		const w = ( 240 - g ) / 2,
			shift = ( y % 2 ? 1 : -1 ) * p.b;
		for ( let x = 0; x < 2; x++ ) {
			s += rect(
				-120 + x * ( w + g ) + shift,
				-110 + y * h + g / 2,
				w,
				h - g,
				( h - g ) / 2
			);
		}
	}
	return s;
};
G.bogenkacheln = ( p ) => {
	let s = '';
	const n = p.n,
		step = 240 / n,
		g = p.a,
		r = step - g;
	for ( let y = 0; y < n; y++ ) {
		for ( let x = 0; x < n; x++ ) {
			const a = ( ( x + y + p.b ) % 4 ) * 90;
			s += move(
				rot( sector( r, 0, 0, Math.PI / 2 ), a, r / 2, r / 2 ),
				-120 + x * step + g / 2,
				-120 + y * step + g / 2
			);
		}
	}
	return s;
};
G.halbkreisstaffel = ( p ) => {
	let s = '';
	const n = p.n,
		r = p.a,
		g = p.b;
	for ( let i = 0; i < n; i++ ) {
		s += move(
			sector( r, 0, Math.PI, TAU ),
			( ( i % 2 ) * 2 - 1 ) * r * 0.35,
			( i - ( n - 1 ) / 2 ) * ( r + g )
		);
	}
	return s;
};
G.keilkacheln = ( p ) => {
	let s = '';
	const n = p.n,
		step = 240 / n,
		g = p.a,
		k = p.b / 100;
	for ( let y = 0; y < n; y++ ) {
		for ( let x = 0; x < n; x++ ) {
			const r = step - g,
				d = poly( [
					[ 0, 0 ],
					[ r, 0 ],
					[ r * k, r ],
					[ 0, r ],
				] );
			s += move(
				rot( path( d ), ( x + y ) % 2 ? 180 : 0, r / 2, r / 2 ),
				-120 + x * step + g / 2,
				-120 + y * step + g / 2
			);
		}
	}
	return s;
};
G.blockwelle = ( p ) => {
	let s = '';
	const n = p.n,
		h = 220 / n,
		g = p.a,
		amp = p.b;
	for ( let i = 0; i < n; i++ ) {
		const y = -110 + i * h + g / 2,
			t = h - g;
		s += path(
			`M-120,${ y }C-40,${ y - amp } 40,${ y + amp } 120,${ y }V${
				y + t
			}C40,${ y + t + amp } -40,${ y + t - amp } -120,${ y + t }Z`
		);
	}
	return s;
};
G.diagonalfelder = ( p ) => {
	const n = p.n,
		g = p.a,
		k = p.b / 100,
		step = 240 / n;
	let s = '';
	for ( let i = 0; i < n; i++ ) {
		const x = -120 + i * step + g / 2,
			w = step - g;
		s += path(
			poly( [
				[ x, -120 ],
				[ x + w, -120 ],
				[ x + w + 60 * k, 0 ],
				[ x + w, 120 ],
				[ x, 120 ],
				[ x + 60 * k, 0 ],
			] )
		);
	}
	return s;
};
G.kreissegmente = ( p ) => {
	let s = '';
	const r = p.n,
		g = p.a,
		inner = p.b;
	for ( let i = 0; i < 4; i++ ) {
		const q = move( sector( r, inner, 0, Math.PI / 2 ), g / 2, g / 2 );
		s += rot( q, i * 90 );
	}
	return s;
};
G.kachelversatz = ( p ) => {
	let s = '';
	const n = p.n,
		step = 200 / n,
		g = p.a;
	for ( let i = 0; i < n; i++ ) {
		for ( let j = 0; j < n; j++ ) {
			s += rect(
				-100 + i * step + j * p.b,
				-100 + j * step,
				step - g,
				step - g,
				0
			);
		}
	}
	return s;
};
G.treppenfaecher = ( p ) => {
	const n = p.n,
		w = p.a,
		g = p.b;
	let s = '';
	for ( let i = 0; i < n; i++ ) {
		const x = -120 + i * ( w + g ),
			h = 90 + i * 28;
		s += rect( x, -h / 2, w, h, 0 );
	}
	return rot( s, 35 );
};
export const BOLD_SHAPE_GEOMETRY = G;
