/* Minimal WPIE mock: enough bridge for openStudio to run standalone
   (incl. a fake geo proxy and a demo GPX), so the dialog can be
   screenshotted headless. Loaded BEFORE extension.js. */
( function () {
	// ?locale=de_DE renders the dialog in that language (i18n QA).
	const LOCALE_Q =
		new URLSearchParams( window.location.search ).get( 'locale' ) ||
		'en_US';

	// Demo GPX: wobbly 8.5 km loop with two hills and timestamps.
	const pts = [];
	const n = 700;
	let tMs = Date.UTC( 2026, 4, 12, 8, 0, 0 );
	for ( let i = 0; i <= n; i++ ) {
		const a = ( i / n ) * Math.PI * 2;
		const r =
			0.012 +
			0.003 * Math.sin( a * 3 + 1 ) +
			0.0015 * Math.sin( a * 7 );
		const lat = 53.143 + Math.sin( a ) * r * 0.75;
		const lon = 8.214 + Math.cos( a ) * r * 1.4;
		const ele =
			12 +
			22 * Math.exp( -( ( a - 1.8 ) ** 2 ) * 3 ) +
			34 * Math.exp( -( ( a - 4.4 ) ** 2 ) * 5 );
		tMs += 3400 + 1400 * Math.sin( a * 2 );
		const time = new Date( tMs ).toISOString();
		const hr = Math.round( 128 + 30 * Math.sin( a * 2 + 1 ) );
		pts.push(
			'<trkpt lat="' + lat.toFixed( 6 ) + '" lon="' +
			lon.toFixed( 6 ) + '"><ele>' + ele.toFixed( 1 ) +
			'</ele><time>' + time + '</time>' +
			'<extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>' + hr +
			'</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>'
		);
	}
	if ( ! new URLSearchParams( window.location.search ).get( 'nodemo' ) ) {
		window.WPIE_ROUTE_DEMO_GPX =
			'<gpx><trk><name>Oldenburg Loop</name><trkseg>' +
			pts.join( '' ) +
			'</trkseg></trk></gpx>';
	}

	const fakeMap = ( q ) => {
		const els = [];
		const lerp = ( a, b, u ) => a + ( b - a ) * u;
		for ( let i = 1; i < 9; i++ ) {
			const u = i / 9;
			els.push( { k: 'road', c: 'minor', g: [
				lerp( q.south, q.north, u ), q.west,
				lerp( q.south, q.north, u ), q.east ] } );
			els.push( { k: 'road', c: 'minor', g: [
				q.south, lerp( q.west, q.east, u ),
				q.north, lerp( q.west, q.east, u ) ] } );
		}
		els.push( { k: 'road', c: 'primary', g: [
			lerp( q.south, q.north, 0.42 ), q.west,
			lerp( q.south, q.north, 0.58 ), q.east ] } );
		return { els, n: els.length, truncated: false };
	};

	window.WPIE = {
		locale: LOCALE_Q,
		extensions: [],
		bridge: {
			documents: {
				makeImage: ( d ) => ( { id: 'i', type: 'image', ...d } ),
				makeText: ( d ) => ( { id: 't', type: 'text', ...d } ),
				makeShape: ( d ) => ( { id: 's', type: 'shape', ...d } ),
				makeGroup: ( d ) => ( { id: 'g', type: 'group', ...d } ),
			},
			fonts: { ensureFontsForLayers: async () => {} },
			components: null,
			api: {
				geo: {
					map: async ( q ) => fakeMap( q ),
					search: async () => ( { results: [] } ),
				},
			},
		},
		api: {
			registerGenerator: ( def ) => {
				window.__gen = def;
			},
		},
	};

	window.addEventListener( 'load', () => {
		window.__gen
			.run( {
				editor: {
					state: {
						doc: { w: 1200, h: 1650 },
						layers: [],
						activeId: null,
					},
					dispatch: () => {},
					commit: () => {},
				},
				extras: {
					toasts: { error: ( m ) => console.error( 'TOAST', m ) },
				},
				layer: null,
			} )
			.then( () => {
				setTimeout( () => {
					window.__dialogReady = true;
				}, 700 );
			} );
	} );
} )();
