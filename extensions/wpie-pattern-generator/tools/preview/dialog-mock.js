/* Minimal WPIE mock for the Pattern Generator dialog: generator
   registration hook, shape-layer factory, dispatch capture. Loaded
   BEFORE extension.js. */
( function () {
	const LOCALE_Q =
		new URLSearchParams( window.location.search ).get( 'locale' ) ||
		'en_US';

	window.__dispatched = [];

	// Fake "active layer" render: a bold logo-ish mark with alpha.
	const makeStamp = () => {
		const c = document.createElement( 'canvas' );
		c.width = 384;
		c.height = 300;
		const g = c.getContext( '2d' );
		g.fillStyle = '#1d3557';
		g.beginPath();
		g.arc( 192, 130, 105, 0, Math.PI * 2 );
		g.fill();
		g.fillStyle = '#e63946';
		g.beginPath();
		g.moveTo( 192, 40 );
		g.lineTo( 292, 220 );
		g.lineTo( 92, 220 );
		g.closePath();
		g.fill();
		g.fillStyle = '#f4f1de';
		g.font = '900 90px sans-serif';
		g.textAlign = 'center';
		g.fillText( 'T', 192, 262 );
		return c;
	};

	window.WPIE = {
		locale: LOCALE_Q,
		brandKits: [
			{
				name: 'TBIT DESIGN',
				colors: [ '#0f1e2e', '#1d4e89', '#3b66ff', '#7d9bff', '#f5f0e6' ],
			},
			{
				name: 'Client Cafe',
				colors: [ '#3e2723', '#795548', '#d7a86e', '#f3e5d8' ],
			},
		],
		restUrl: 'https://example.test/wp-json/wpie/v1',
		nonce: 'mock',
		extensions: [],
		bridge: {
			documents: {
				makeShape: ( d ) => ( { id: 's1', type: 'shape', ...d } ),
			},
			raster: {
				sharedImageCache: { warm: async () => {} },
				renderToCanvas: async () => makeStamp(),
			},
			components: null,
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
						doc: { w: 1400, h: 900 },
						layers: [
							{
								id: 'logo',
								type: 'shape',
								x: 200,
								y: 150,
								w: 300,
								h: 240,
								rot: 0,
							},
						],
						activeId: 'logo',
					},
					dispatch: ( a ) => window.__dispatched.push( a ),
					commit: () => {},
				},
				extras: {},
				layer: null,
			} )
			.then( () => {
				setTimeout( () => {
					window.__dialogReady = true;
				}, 400 );
			} );
	} );
} )();
