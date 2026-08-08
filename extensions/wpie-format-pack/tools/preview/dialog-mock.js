/* Minimal WPIE mock: a tiny layer painter standing in for the real
   renderer, plus a representative design (background, accent shape,
   logo, headline, subline), so the Reformat dialog and its
   re-layout previews can be screenshotted headless. */
( function () {
	const LOCALE_Q =
		new URLSearchParams( window.location.search ).get( 'locale' ) ||
		'en_US';

	const paint = ( ctx, layer, s, all ) => {
		if ( layer.hidden ) {
			return;
		}
		if ( 'group' === layer.type ) {
			( layer.children || [] )
				.map( ( id ) => all.find( ( l ) => l.id === id ) )
				.filter( Boolean )
				.forEach( ( c ) => paint( ctx, c, s, all ) );
			return;
		}
		const x = layer.x * s;
		const y = layer.y * s;
		const w = layer.w * s;
		const h = layer.h * s;
		if ( 'text' === layer.type ) {
			ctx.fillStyle = layer.color || '#fff';
			ctx.font = `${ layer.weight || 400 } ${
				( layer.fontSize || 16 ) * s
			}px sans-serif`;
			ctx.textBaseline = 'top';
			ctx.textAlign = layer.align || 'left';
			const tx =
				'center' === layer.align
					? x + w / 2
					: 'right' === layer.align
					? x + w
					: x;
			ctx.fillText( layer.text || '', tx, y );
			return;
		}
		if ( 'image' === layer.type ) {
			const g = ctx.createLinearGradient( x, y, x + w, y + h );
			g.addColorStop( 0, '#f0bf4c' );
			g.addColorStop( 1, '#e8455f' );
			ctx.fillStyle = g;
			ctx.beginPath();
			ctx.arc( x + w / 2, y + h / 2, Math.min( w, h ) / 2, 0, 7 );
			ctx.fill();
			return;
		}
		ctx.fillStyle = layer.fill || '#888';
		if ( layer.radius ) {
			ctx.beginPath();
			ctx.roundRect( x, y, w, h, layer.radius * s );
			ctx.fill();
		} else {
			ctx.fillRect( x, y, w, h );
		}
	};

	window.WPIE = {
		locale: LOCALE_Q,
		restUrl: 'https://example.test/wp-json/wpie/v1',
		nonce: 'mock',
		extensions: [],
		bridge: {
			raster: {
				sharedImageCache: { warm: async () => {} },
				renderToCanvas: async ( doc, layers, o ) => {
					const s = ( o && o.scale ) || 1;
					const c = document.createElement( 'canvas' );
					c.width = Math.max( 2, Math.round( doc.w * s ) );
					c.height = Math.max( 2, Math.round( doc.h * s ) );
					const ctx = c.getContext( '2d' );
					if ( doc.bg && 'transparent' !== doc.bg ) {
						ctx.fillStyle = doc.bg;
						ctx.fillRect( 0, 0, c.width, c.height );
					}
					layers
						.filter( ( l ) => ! l.parent )
						.forEach( ( l ) => paint( ctx, l, s, layers ) );
					return c;
				},
			},
		},
		api: {
			registerGenerator: ( def ) => {
				window.__gen = def;
			},
			registerMenuItem: ( menuId, def ) => {
				window.__menu = def;
			},
		},
	};

	window.addEventListener( 'load', () => {
		( window.__gen || window.__menu )
			.run( {
				editor: {
					state: {
						doc: { w: 1600, h: 900, bg: '#101826' },
						layers: [
							{
								id: 'bg',
								type: 'shape',
								name: 'Background',
								x: 0,
								y: 0,
								w: 1600,
								h: 900,
								fill: '#16233a',
								parent: null,
							},
							{
								id: 'accent',
								type: 'shape',
								name: 'Accent',
								x: 940,
								y: 90,
								w: 620,
								h: 720,
								fill: '#3b66ff',
								radius: 44,
								parent: null,
							},
							{
								id: 'logo',
								type: 'image',
								name: 'Logo',
								x: 64,
								y: 64,
								w: 140,
								h: 140,
								parent: null,
							},
							{
								id: 'title',
								type: 'text',
								name: 'Title',
								x: 64,
								y: 540,
								w: 820,
								h: 120,
								text: 'BIG SUMMER SALE',
								fontSize: 84,
								weight: 800,
								color: '#ffffff',
								align: 'left',
								parent: null,
							},
							{
								id: 'sub',
								type: 'text',
								name: 'Subline',
								x: 64,
								y: 680,
								w: 760,
								h: 60,
								text: 'Up to 50% off everything',
								fontSize: 40,
								weight: 400,
								color: '#9fb3d9',
								align: 'left',
								parent: null,
							},
							{
								id: 'badge',
								type: 'group',
								name: 'Badge',
								children: [ 'pill', 'pilltext' ],
								parent: null,
							},
							{
								id: 'pill',
								type: 'shape',
								name: 'Pill',
								x: 1290,
								y: 760,
								w: 250,
								h: 84,
								fill: '#f0bf4c',
								radius: 42,
								parent: 'badge',
							},
							{
								id: 'pilltext',
								type: 'text',
								name: 'PillText',
								x: 1330,
								y: 782,
								w: 180,
								h: 44,
								text: '-50%',
								fontSize: 44,
								weight: 800,
								color: '#16233a',
								align: 'left',
								parent: 'badge',
							},
						],
						activeId: null,
					},
				},
				extras: {
					toasts: { error: ( m ) => console.error( 'TOAST', m ) },
				},
			} )
			.then( () => {
				setTimeout( () => {
					window.__dialogReady = true;
				}, 900 );
			} );
	} );
} )();
