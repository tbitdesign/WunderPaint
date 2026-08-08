/**
 * Canonical WPIE bridge mock for extension dialog QA (browser side).
 *
 * ONE mock for all extensions, so a bridge API addition lands here once
 * instead of in eleven drifting per-extension copies (the Diagram Studio
 * harness was silently dead from 1.4 to 1.7 because its private mock
 * lagged behind the 2.10 pickers). `bridge.ui` is NOT mocked at all: the
 * REAL ext-ui module is bundled in - mirror, don't approximate.
 *
 * Usage (per-extension setup.js, loaded after this bundle):
 *   window.__installWpieMock( {
 *       iconClassPrefix: 'wpiedg',       // extension's CSS prefix
 *       doc: { w: 1600, h: 1000 },       // editor doc the dialog sees
 *       readyDelay: 500,                  // ms before __dialogReady
 *       autoRun: true,                    // run the registered generator
 *       patch: ( WPIE ) => { ... },       // extension-specific tweaks
 *   } );
 */
import * as ui from '@ed/lib/ext-ui.js';

/** Six coloured plates with real pixel dimensions, shared by both media mocks. */
function mockMediaItems() {
	const plate = ( i ) => {
		const w = 0 === i % 3 ? 900 : 600;
		const h = 0 === i % 3 ? 600 : 800;
		const hue = i * 47 + 20;
		return (
			'data:image/svg+xml;charset=utf-8,' +
			encodeURIComponent(
				`<svg xmlns="http://www.w3.org/2000/svg" width="${ w }" height="${ h }"><rect width="100%" height="100%" fill="hsl(${ hue },55%,62%)"/><circle cx="${ w / 2 }" cy="${ h / 2 }" r="${ Math.min( w, h ) / 3 }" fill="hsl(${ hue + 40 },60%,80%)"/></svg>`
			)
		);
	};
	return Array.from( { length: 6 }, ( _, i ) => ( {
		id: 100 + i,
		url: plate( i ),
		fullUrl: plate( i ),
		thumb: plate( i ),
		title: `Bild ${ i + 1 }`,
	} ) );
}

window.__installWpieMock = ( opts = {} ) => {
	const locale =
		opts.locale ||
		new URLSearchParams( window.location.search ).get( 'locale' ) ||
		'en_US';
	const iconPrefix = opts.iconClassPrefix || 'wpie';

	window.__dispatched = [];
	let idSeq = 0;
	const uid = () => 'l' + idSeq++;

	// A recognisable stand-in document for show-document / renderToCanvas.
	const docCanvas = () => {
		const c = document.createElement( 'canvas' );
		c.width = 800;
		c.height = 500;
		const g = c.getContext( '2d' );
		g.fillStyle = '#dfe6f2';
		g.fillRect( 0, 0, 800, 500 );
		g.fillStyle = '#b7c6e0';
		g.fillRect( 60, 60, 300, 180 );
		g.fillStyle = '#9db2d6';
		g.fillRect( 440, 260, 300, 180 );
		return c;
	};

	/**
	 * A small renderer for the layer shapes the editor's own one draws.
	 *
	 * Not a replica: enough to tell one picture from another, which is
	 * all a preview needs to prove that a control did something.
	 *
	 * @param {Object} doc    `{ w, h }`.
	 * @param {Array}  layers Tree or flat list.
	 * @param {Object} opts   `{ scale }`.
	 * @return {HTMLCanvasElement} The drawing.
	 */
	const drawLayers = ( doc, layers, opts = {} ) => {
		const scale = opts.scale || 1;
		const c = document.createElement( 'canvas' );
		c.width = Math.max( 1, Math.round( ( ( doc && doc.w ) || 800 ) * scale ) );
		c.height = Math.max( 1, Math.round( ( ( doc && doc.h ) || 500 ) * scale ) );
		const g = c.getContext( '2d' );
		g.scale( scale, scale );
		const list = Array.isArray( layers ) ? layers : [];
		const byId = new Map( list.map( ( l ) => [ l.id, l ] ) );
		const seen = new Set();

		const one = ( l ) => {
			if ( ! l || false === l.visible || seen.has( l ) ) {
				return;
			}
			seen.add( l );
			g.save();
			g.globalAlpha = undefined === l.opacity ? 1 : l.opacity;
			if ( l.rot ) {
				const cx = l.x + l.w / 2;
				const cy = l.y + l.h / 2;
				g.translate( cx, cy );
				g.rotate( ( l.rot * Math.PI ) / 180 );
				g.translate( -cx, -cy );
			}
			if ( 'group' === l.type ) {
				for ( const kid of l.children || [] ) {
					one( 'string' === typeof kid ? byId.get( kid ) : kid );
				}
			} else if ( 'text' === l.type ) {
				g.fillStyle = l.color || '#111';
				g.font = `${ l.weight || 400 } ${ l.fontSize || 16 }px ${
					l.fontFamily || 'Inter'
				}, sans-serif`;
				g.textBaseline = 'top';
				g.fillText( String( l.text || '' ).slice( 0, 120 ), l.x, l.y );
			} else if ( 'image' === l.type || 'raster' === l.type ) {
				const img = imageCache[ l.src ];
				if ( img && img.complete && img.naturalWidth ) {
					g.drawImage( img, l.x, l.y, l.w, l.h );
				} else {
					if ( l.src && ! imageCache[ l.src ] ) {
						const n = new Image();
						n.src = l.src;
						imageCache[ l.src ] = n;
					}
					g.fillStyle = '#b7c6e0';
					g.fillRect( l.x, l.y, l.w, l.h );
				}
			} else {
				if ( l.pathD ) {
					g.save();
					g.translate( l.x, l.y );
					const path = new Path2D( l.pathD );
					if ( l.fill ) {
						g.fillStyle = l.fill;
						g.fill( path );
					}
					if ( l.stroke && l.strokeW ) {
						g.strokeStyle = l.stroke;
						g.lineWidth = l.strokeW;
						g.stroke( path );
					}
					g.restore();
				} else if ( 'ellipse' === l.shape ) {
					g.beginPath();
					g.ellipse(
						l.x + l.w / 2,
						l.y + l.h / 2,
						Math.max( 0.5, l.w / 2 ),
						Math.max( 0.5, l.h / 2 ),
						0,
						0,
						Math.PI * 2
					);
					if ( l.fill ) {
						g.fillStyle = l.fill;
						g.fill();
					}
					if ( l.stroke && l.strokeW ) {
						g.strokeStyle = l.stroke;
						g.lineWidth = l.strokeW;
						g.stroke();
					}
				} else {
					if ( l.fill ) {
						g.fillStyle = l.fill;
						g.fillRect( l.x, l.y, l.w, l.h );
					}
					if ( l.stroke && l.strokeW ) {
						g.strokeStyle = l.stroke;
						g.lineWidth = l.strokeW;
						g.strokeRect( l.x, l.y, l.w, l.h );
					}
				}
			}
			g.restore();
		};

		const roots = list.filter( ( l ) => ! l.parent );
		for ( const l of roots.length ? roots : list ) {
			one( l );
		}
		return c;
	};
	const imageCache = {};

	const storeData = {};

	/**
	 * The fields src/store/document.js gives every layer, whether or not
	 * the caller mentioned them.
	 *
	 * @param {string} type Layer type.
	 * @param {string} name Layer name.
	 * @param {Object} rect Whatever the caller passed.
	 * @return {Object} The base every factory starts from.
	 */
	const mockBase = ( type, name, rect ) => ( {
		id: uid(),
		type,
		name,
		visible: true,
		locked: false,
		opacity: undefined === rect.opacity ? 1 : rect.opacity,
		blend: rect.blend || 'normal',
		x: rect.x || 0,
		y: rect.y || 0,
		w: rect.w || 0,
		h: rect.h || 0,
		rot: rect.rot || 0,
		parent: null,
	} );

	window.WPIE = {
		locale,
		brand: {
			colors: [ '#0f1e2e', '#1d4e89', '#3b66ff', '#7d9bff', '#f5f0e6' ],
		},
		brandKits: [
			{
				id: 'k1',
				name: 'TBIT DESIGN',
				colors: [ '#0f1e2e', '#1d4e89', '#3b66ff' ],
			},
			{
				id: 'k2',
				name: 'Client Cafe',
				colors: [ '#3e2723', '#795548', '#d7a86e' ],
			},
		],
		fonts: [ 'Inter', 'Georgia', 'Playfair Display', 'DM Serif Display' ],
		customFonts: [ { family: 'Brand Sans' } ],
		providers: {},
		extensions: [],
		bridge: {
			ui, // the REAL ext-ui builders - zero drift by construction
			documents: {
				// These mirror src/store/document.js on purpose, defaults
				// and all. A mock that is kinder than the real factory
				// hides bugs until a user finds them: makeShape reads
				// `fill: opts.fill || '#3b66ff'`, so asking for no fill
				// gets you the house blue, and every factory fills in a
				// box, a name and the visible/locked/opacity fields an
				// extension may never mention.
				makeShape: ( d ) => ( {
					...mockBase( 'shape', d.name || 'Shape', d ),
					...d,
					...mockBase( 'shape', d.name || 'Shape', d ),
					shape: d.shape || 'rect',
					fill: d.fill || '#3b66ff',
					stroke: d.stroke ?? null,
					strokeW: d.strokeW || 0,
					...( d.pathD ? { pathD: d.pathD } : {} ),
					...( d.radius ? { radius: d.radius } : {} ),
					...( d.strokeDash ? { strokeDash: d.strokeDash } : {} ),
				} ),
				makeText: ( d ) => ( {
					...d,
					...mockBase( 'text', d.name || d.text || 'Text', {
						w: 300,
						h: 60,
						...d,
					} ),
					text: d.text || 'Text',
					fontSize: d.fontSize || 48,
					fontFamily: d.fontFamily || 'Inter',
					weight: d.weight || 700,
					color: d.color || '#1a1d21',
					align: d.align || 'left',
				} ),
				makeGroup: ( d ) => ( {
					...d,
					...mockBase( 'group', d.name || 'Group', d ),
					children: d.children || [],
					isOpen: false !== d.isOpen,
				} ),
				makeImage: ( d ) => ( {
					...d,
					...mockBase( 'image', d.name || 'Image', d ),
					src: d.src || '',
					naturalW: d.naturalW || d.w || 0,
					naturalH: d.naturalH || d.h || 0,
				} ),
			},
			// brand (API 2.10): kits and THE colour resolution. Without it
			// every studio that offers "use my brand kit colours" gets an
			// empty list and both of its controls look dead.
			brand: {
				kits: () => window.WPIE.brandKits || [],
				kitById: ( id ) =>
					( window.WPIE.brandKits || [] ).find( ( k ) => k.id === id ) || null,
				activeKitColors: ( id ) => {
					const kit = ( window.WPIE.brandKits || [] ).find( ( k ) => k.id === id );
					if ( kit && ( kit.colors || [] ).length > 1 ) {
						return kit.colors;
					}
					const site = ( window.WPIE.brand || {} ).colors || [];
					if ( site.length > 1 ) {
						return site;
					}
					return (
						( window.WPIE.brandKits || [] ).find(
							( k ) => ( k.colors || [] ).length > 1
						) || {}
					).colors || null;
				},
			},
			raster: {
				// The editor's cache warms itself before a render; a bare
				// object here made every studio that asks for it fall into
				// its own error branch and close again without a word.
				sharedImageCache: {
					warm: async () => {},
					get: () => null,
					set: () => {},
					clear: () => {},
				},
				// Draws the layers it is handed. The stand-in used to
				// return the same picture whatever it was given, which
				// meant every studio that previews through this route
				// showed one fixed image and every style control looked
				// dead when it was working perfectly.
				renderToCanvas: async ( doc, layers, opts = {} ) =>
					drawLayers( doc, layers, opts ),
				registerUserTile: async () => {},
			},
			storage: {
				get: async ( ns ) => storeData[ ns ] || {},
				set: async ( ns, value ) => {
					storeData[ ns ] = value;
					return value;
				},
			},
			// Icon + emoji libraries (API 2.8): a few real Tabler paths
			// (with arcs) so path flattening is exercised.
			iconsLib: {
				loadTabler: async () => ( {
					rocket: 'M4 13a8 8 0 0 1 7 7a6 6 0 0 0 3 -5a9 9 0 0 0 6 -8a3 3 0 0 0 -3 -3a9 9 0 0 0 -8 6a6 6 0 0 0 -5 3 M7 14a6 6 0 0 0 -3 6a6 6 0 0 0 6 -3 M14 9a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
					star: 'M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873l-6.158 -3.245',
					bulb: 'M3 12h1m8 -9v1m8 8h1m-15.4 -6.4l.7 .7m12.1 -.7l-.7 .7 M9 16a5 5 0 1 1 6 0a3.5 3.5 0 0 0 -1 3a2 2 0 0 1 -4 0a3.5 3.5 0 0 0 -1 -3 M9.7 17l4.6 0',
					check: 'M5 12l5 5l10 -10',
					target: 'M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M7 12a5 5 0 1 0 10 0a5 5 0 1 0 -10 0 M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0',
				} ),
				loadEmoji: async () => [
					{ c: '🚀', n: 'rocket', g: 'Travel' },
					{ c: '⭐', n: 'star', g: 'Nature' },
					{ c: '💡', n: 'light bulb', g: 'Objects' },
					{ c: '✅', n: 'check mark', g: 'Symbols' },
				],
			},
			fonts: {
				ensureFontsForLayers: async () => {},
				ensureFont: async () => {},
				listFamilies: () => [
					'Inter',
					'Georgia',
					'Playfair Display',
					'DM Serif Display',
					'Roboto',
					'Montserrat',
					'Bebas Neue',
					'Lora',
					'Oswald',
					'Poppins',
				],
			},
			components: {
				mountColorButton: ( node, { color, onChange } ) => {
					const b = document.createElement( 'button' );
					b.type = 'button';
					b.style.cssText =
						'width:26px;height:26px;border-radius:6px;border:1px solid #555;';
					b.style.background = color;
					b.onclick = () => onChange && onChange( '#e63946' );
					node.appendChild( b );
					return {
						set: ( v ) => {
							b.style.background = v;
						},
						unmount: () => b.remove(),
					};
				},
				mountKitPicker: ( node, { value, onChange } ) => {
					const s = document.createElement( 'select' );
					for ( const k of window.WPIE.brandKits ) {
						const o = document.createElement( 'option' );
						o.value = k.id;
						o.textContent = k.name;
						s.appendChild( o );
					}
					if ( value ) {
						s.value = value;
					}
					s.onchange = () => onChange && onChange( s.value );
					node.appendChild( s );
					return {
						set( v ) {
							s.value = v;
						},
						unmount: () => s.remove(),
					};
				},
				// A stand-in for the editor's media chooser. Six coloured
				// plates with real pixel dimensions, so anything that
				// measures what it was handed measures something true.
				mountMediaPicker: ( node, { onPick, height = 240, selectedIds = null } ) => {
					const grid = document.createElement( 'div' );
					grid.className = 'mock-media';
					grid.style.cssText = `display:grid;grid-template-columns:repeat(3,1fr);gap:6px;max-height:${ height }px;overflow:auto;`;
					const items = mockMediaItems();
					const buttons = items.map( ( it ) => {
						const b = document.createElement( 'button' );
						b.type = 'button';
						b.className = 'mock-media-item';
						b.dataset.id = String( it.id );
						b.style.cssText =
							'aspect-ratio:1;border-radius:6px;border:2px solid transparent;background-size:cover;background-position:center;cursor:pointer;';
						b.style.backgroundImage = `url("${ it.url }")`;
						b.onclick = () => onPick && onPick( it );
						grid.appendChild( b );
						return b;
					} );
					const render = ( ids ) => {
						const set = new Set( Array.isArray( ids ) ? ids : [] );
						buttons.forEach( ( b ) => {
							b.style.borderColor = set.has( Number( b.dataset.id ) )
								? '#3b66ff'
								: 'transparent';
							b.classList.toggle( 'is-on', set.has( Number( b.dataset.id ) ) );
						} );
					};
					render( selectedIds );
					node.appendChild( grid );
					return { set: render, unmount: () => grid.remove() };
				},
				mountFontPicker: ( node, { value, onChange } ) => {
					const s = document.createElement( 'select' );
					for ( const f of window.WPIE.bridge.fonts.listFamilies() ) {
						const o = document.createElement( 'option' );
						o.value = f;
						o.textContent = f;
						s.appendChild( o );
					}
					if ( value ) {
						s.value = value;
					}
					s.onchange = () => onChange && onChange( s.value );
					node.appendChild( s );
					return {
						set( v ) {
							s.value = v;
						},
						unmount: () => s.remove(),
					};
				},
				// Faithful mini icon/emoji picker: tab + cell classes carry
				// the extension's prefix, real onPick payloads.
				mountIconPicker: ( node, { onPick } ) => {
					const wrap = document.createElement( 'div' );
					const tabs = document.createElement( 'div' );
					tabs.className = iconPrefix + '-icontabs';
					const grid = document.createElement( 'div' );
					const fill = async ( mode ) => {
						grid.innerHTML = '';
						if ( 'icons' === mode ) {
							const lib =
								await window.WPIE.bridge.iconsLib.loadTabler();
							for ( const name of Object.keys( lib ) ) {
								const c = document.createElement( 'button' );
								c.type = 'button';
								c.className = iconPrefix + '-iconcell';
								c.textContent = name;
								c.onclick = () =>
									onPick && onPick( { type: 'icon', name } );
								grid.appendChild( c );
							}
						} else {
							const lib =
								await window.WPIE.bridge.iconsLib.loadEmoji();
							for ( const e of lib ) {
								const c = document.createElement( 'button' );
								c.type = 'button';
								c.className = iconPrefix + '-emojicell';
								c.textContent = e.c;
								c.onclick = () =>
									onPick &&
									onPick( { type: 'emoji', char: e.c } );
								grid.appendChild( c );
							}
						}
					};
					for ( const [ mode, label ] of [
						[ 'icons', 'Icons' ],
						[ 'emoji', 'Emoji' ],
					] ) {
						const b = document.createElement( 'button' );
						b.type = 'button';
						b.className = iconPrefix + '-tab';
						b.textContent = label;
						b.onclick = () => fill( mode );
						tabs.appendChild( b );
					}
					wrap.appendChild( tabs );
					wrap.appendChild( grid );
					node.appendChild( wrap );
					fill( 'icons' );
					return { unmount: () => wrap.remove() };
				},
			},
			api: {
				// geo (API 2.x): the editor proxies OpenStreetMap for the
				// map and sky studios. Without it they refuse to open at
				// all, so a stand-in with one findable place is the
				// difference between testing them and not.
				geo: {
					search: async ( q ) => [
						{
							name: q || 'Hamburg',
							display: ( q || 'Hamburg' ) + ', Deutschland',
							lat: 53.5511,
							lon: 9.9937,
							south: 53.39,
							west: 9.73,
							north: 53.74,
							east: 10.32,
						},
					],
					// The editor's proxy answers with `{ els: [ { k, c, g } ] }`
					// where g is a flat lat,lon list. Handing back empty
					// arrays in some other shape made every map layer
					// toggle look dead, because there was nothing under
					// them to switch off.
					map: async ( { south = 53.39, west = 9.73, north = 53.74, east = 10.32 } = {} ) => {
						const els = [];
						const lat = ( f ) => south + ( north - south ) * f;
						const lon = ( f ) => west + ( east - west ) * f;
						const line = ( k, c, pts ) =>
							els.push( {
								k,
								c,
								g: pts.flatMap( ( [ a, b ] ) => [ lat( a ), lon( b ) ] ),
							} );
						const area = ( k, pts ) =>
							els.push( {
								k,
								g: pts.flatMap( ( [ a, b ] ) => [ lat( a ), lon( b ) ] ),
							} );
						for ( let i = 0; i <= 8; i++ ) {
							const f = i / 8;
							line( 'road', i % 4 ? 'minor' : 'primary', [ [ f, 0 ], [ f, 1 ] ] );
							line( 'road', i % 3 ? 'secondary' : 'motorway', [ [ 0, f ], [ 1, f ] ] );
						}
						line( 'rail', 'rail', [ [ 0.1, 0.05 ], [ 0.45, 0.5 ], [ 0.9, 0.95 ] ] );
						line( 'road', 'path', [ [ 0.2, 0.8 ], [ 0.5, 0.6 ], [ 0.8, 0.75 ] ] );
						line( 'waterline', 'river', [ [ 0.05, 0.3 ], [ 0.4, 0.35 ], [ 0.95, 0.28 ] ] );
						line( 'waterline', 'stream', [ [ 0.6, 0.1 ], [ 0.75, 0.3 ] ] );
						area( 'water', [ [ 0.05, 0.05 ], [ 0.05, 0.25 ], [ 0.25, 0.25 ], [ 0.25, 0.05 ] ] );
						area( 'green', [ [ 0.6, 0.55 ], [ 0.6, 0.85 ], [ 0.88, 0.85 ], [ 0.88, 0.55 ] ] );
						area( 'sand', [ [ 0.3, 0.7 ], [ 0.3, 0.8 ], [ 0.4, 0.8 ], [ 0.4, 0.7 ] ] );
						for ( let i = 0; i < 14; i++ ) {
							const a = 0.15 + ( i % 7 ) * 0.1;
							const b = 0.2 + Math.floor( i / 7 ) * 0.25;
							area( 'building', [
								[ a, b ],
								[ a + 0.035, b ],
								[ a + 0.035, b + 0.04 ],
								[ a, b + 0.04 ],
							] );
						}
						return { els, truncated: false, bounds: { south, west, north, east } };
					},
				},
				ai: {
					// No provider configured: surface wiring mistakes loudly.
					template: async () => {
						throw new Error(
							'ai.template called without a provider'
						);
					},
					complete: async () => {
						throw new Error(
							'ai.complete called without a provider'
						);
					},
				},
			},
		},
		api: {
			registerGenerator: ( def ) => {
				window.__gen = def;
			},
		},
	};

	const editor = {
		state: {
			doc: { w: opts.doc?.w || 1600, h: opts.doc?.h || 1000 },
			layers: [],
			activeId: null,
		},
		dispatch: ( a ) => {
			window.__dispatched.push( a );
			if ( 'SET_LAYERS' === a.type ) {
				editor.state.layers = a.layers;
			}
		},
		commit: () => {},
	};
	window.__editor = editor;

	// The shared picker (Free 1.241+): resolves an array of picked items.
	// Mocked as an overlay of the same six plates plus a done button, so a
	// QA script clicks plates and confirms the way a user would.
	window.WPIE.pickMedia = ( pickOpts = {} ) =>
		new Promise( ( resolve ) => {
			const wrap = document.createElement( 'div' );
			wrap.className = 'mock-pick';
			wrap.style.cssText =
				'position:fixed;inset:0;z-index:99999;display:grid;place-items:center;background:rgba(0,0,0,.5);';
			const panel = document.createElement( 'div' );
			panel.style.cssText =
				'background:#20242b;padding:14px;border-radius:10px;width:340px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;';
			wrap.appendChild( panel );
			const chosen = [];
			const finish = () => {
				wrap.remove();
				resolve( false === pickOpts.multiple ? chosen[ 0 ] || null : chosen );
			};
			for ( const it of mockMediaItems() ) {
				const b = document.createElement( 'button' );
				b.type = 'button';
				b.className = 'mock-media-item';
				b.dataset.id = String( it.id );
				b.style.cssText =
					'aspect-ratio:1;border-radius:6px;border:2px solid transparent;background-size:cover;background-position:center;cursor:pointer;';
				b.style.backgroundImage = `url("${ it.url }")`;
				b.onclick = () => {
					const at = chosen.indexOf( it );
					if ( at >= 0 ) {
						chosen.splice( at, 1 );
						b.style.borderColor = 'transparent';
						return;
					}
					chosen.push( it );
					b.style.borderColor = '#3b66ff';
					if ( false === pickOpts.multiple ) {
						finish();
					}
				};
				panel.appendChild( b );
			}
			const done = document.createElement( 'button' );
			done.type = 'button';
			done.className = 'mock-pick-done';
			done.textContent = 'Fertig';
			done.style.cssText = 'grid-column:1/-1;padding:8px;cursor:pointer;';
			done.onclick = finish;
			panel.appendChild( done );
			document.body.appendChild( wrap );
		} );

	if ( opts.patch ) {
		opts.patch( window.WPIE, editor );
	}

	if ( false !== opts.autoRun ) {
		window.addEventListener( 'load', () => {
			window.__gen.run( {
				editor,
				extras: {
					toasts: { error: () => {}, success: () => {} },
				},
				layer: null,
			} );
			setTimeout( () => {
				window.__dialogReady = true;
			}, opts.readyDelay || 500 );
		} );
	}

	return window.WPIE;
};
