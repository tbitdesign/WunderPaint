/**
 * WPIE extension: Photo Mosaic (free mini).
 *
 * The main image (whole document, any layer or a media pick) is
 * rebuilt from MANY media-library photos - the textbook photomosaic
 * pipeline: sub-block matching so the tiles' internal structure forms
 * the contours, color adjustment as a per-channel offset of the tile
 * pixels (never an overlay), and a repeat lock. Everything is
 * computed locally.
 */

import { MIN_TILES, analyzeTile, mosaicSteps } from './mosaic-engine.js';

const GEN_ID = 'wpie-photo-mosaic/mosaic';

const DEFAULTS = {
	image: null, // { id, url, title } for media main-image picks
	source: 'doc', // 'doc' | 'layer:<id>' | 'media'
	tiles: [], // [ { id, url } ]
	cols: 48,
	colorAdjust: 60, // 0..100 (%)
};

import { t } from './i18n.js';

const tn = ( s, n ) => t( s ).replace( '%d', String( n ) );

/* -------------------------------- helpers -------------------------------- */

function el( tag, cls, parent, text ) {
	const node = document.createElement( tag );
	if ( cls ) {
		node.className = cls;
	}
	if ( parent ) {
		parent.appendChild( node );
	}
	if ( undefined !== text ) {
		node.textContent = text;
	}
	return node;
}

// The WPIE brand mark for the dialog head (shared across studios).
const ICON_BRAND =
	'<svg width="24" height="24" viewBox="0 0 18.83 18.83" aria-hidden="true" focusable="false"><path fill="currentColor" d="M13.84,18.83H3.62c-2,0-3.62-1.62-3.62-3.62V3.52h1.72c.7,0,1.28.57,1.28,1.28v10.43c0,.34.28.62.62.62h8.94c.71,0,1.29.58,1.29,1.29v1.71Z"/><path fill="#3b66ff" d="M18.83,14.02h-1.71c-.71,0-1.29-.58-1.29-1.29V3.62c0-.34-.28-.62-.62-.62H4.82c-.7,0-1.28-.57-1.28-1.28V0h11.67c2,0,3.62,1.62,3.62,3.62v10.4Z"/><circle fill="currentColor" cx="17.33" cy="17.33" r="1.5"/><path fill="#3b66ff" d="M9.51,5.71l.91,2.45c.03.08.09.14.17.17l2.45.91c.07.03.07.13,0,.16l-2.45.91c-.08.03-.14.09-.17.17l-.91,2.45c-.03.07-.13.07-.16,0l-.91-2.45c-.03-.08-.09-.14-.17-.17l-2.45-.91c-.07-.03-.07-.13,0-.16l2.45-.91c.08-.03.14-.09.17-.17l.91-2.45c.03-.07.13-.07.16,0Z"/></svg>';

const tabIcon = ( d, size = 15 ) =>
	'<svg xmlns="http://www.w3.org/2000/svg" width="' +
	size +
	'" height="' +
	size +
	'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="' +
	d +
	'"/></svg>';

const ICONS = {
	source: tabIcon(
		'M15 8h.01 M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12 M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5 M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3'
	),
	tiles: tabIcon( 'M4 4h6v6h-6z M14 4h6v6h-6z M4 14h6v6h-6z M14 14h6v6h-6z' ),
	settings: tabIcon(
		'M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065 M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0'
	),
};

/* --------------------------------- studio -------------------------------- */

function openStudio( ctx ) {
	const { editor, extras, layer } = ctx;
	const bridge = window.WPIE && window.WPIE.bridge;
	if ( ! bridge || ! bridge.documents ) {
		return;
	}
	const editing = !! ( layer && layer.generator );
	const params = {
		...DEFAULTS,
		...( editing ? layer.generator.params : {} ),
	};
	params.tiles = ( params.tiles || [] ).slice( 0, 600 );

	let srcCanvas = null;
	let srcToken = 0;
	let tileData = [];
	let tileToken = 0;

	const host = document.getElementById( 'wpie-root' ) || document.body;
	const backdrop = el( 'div', 'modal-backdrop', host );
	const dialog = el( 'div', 'dsm wpiemos-dialog', backdrop );
	dialog.onclick = ( e ) => e.stopPropagation();
	const head = el( 'div', 'dsm-head', dialog );
	const badge = el( 'span', 'dsm-badge', head );
	badge.innerHTML = ICON_BRAND;
	const titles = el( 'div', 'dsm-titles', head );
	el( 'span', 'dsm-title', titles, 'Photo Mosaic' );
	el(
		'div',
		'dsm-sub',
		titles,
		t( 'Your image, rebuilt from many photos - as an editable layer.' )
	);
	const closeBtn = el( 'button', 'dsm-x', head );
	closeBtn.innerHTML = '&times;';
	closeBtn.setAttribute( 'aria-label', t( 'Close' ) );

	const body = el( 'div', 'wpiemos-body', dialog );
	const view = el( 'div', 'wpiemos-view', body );
	const canvas = el( 'canvas', null, view );
	const side = el( 'div', 'wpiemos-side', body );
	const status = el( 'div', 'wpiemos-status', view );
	const setStatus = ( msg, isErr ) => {
		status.textContent = msg || '';
		status.classList.toggle( 'on', !! msg );
		status.classList.toggle( 'err', !! isErr );
	};

	const section = ( parent, icon, label ) => {
		const card = el( 'div', 'wpiemos-card', parent );
		const h = el( 'div', 'wpiemos-card-head', card );
		h.innerHTML = icon + '<span>' + label + '</span>';
		return el( 'div', 'wpiemos-card-body', card );
	};

	/* ----------------------------- main image ----------------------------- */

	const srcSec = section( side, ICONS.source, t( 'Main image' ) );
	const srcSel = el( 'select', 'dsm-select wpiemos-wide', srcSec );
	const srcNote = el( 'div', 'wpiemos-info', srcSec );

	function fillSourceOptions() {
		srcSel.innerHTML = '';
		const add = ( v, label ) => {
			const o = el( 'option', null, srcSel );
			o.value = v;
			o.textContent = label;
		};
		add( 'doc', t( 'Whole document' ) );
		const walk = ( layers, depth ) => {
			for ( const l of layers || [] ) {
				if ( 'group' === l.type ) {
					walk( l.children, depth + 1 );
					continue;
				}
				add(
					'layer:' + l.id,
					' '.repeat( depth * 2 ) + ( l.name || l.type )
				);
			}
		};
		walk( editor.state.layers, 0 );
		add( 'media', t( 'Media library…' ) );
	}
	fillSourceOptions();
	srcSel.value =
		[ 'doc', 'media' ].includes( params.source ) ||
		srcSel.querySelector( `option[value="${ params.source }"]` )
			? params.source
			: 'doc';
	params.source = srcSel.value;

	function mediaFrame( title, button, multiple ) {
		return new Promise( ( resolve ) => {
			if ( ! window.wp || ! window.wp.media ) {
				resolve( null );
				return;
			}
			const frame = window.wp.media( {
				title,
				library: { type: 'image' },
				multiple,
				button: { text: button },
			} );
			frame.on( 'select', () => {
				const items = frame
					.state()
					.get( 'selection' )
					.toJSON()
					.map( ( item ) => ( {
						id: item.id,
						url:
							( item.sizes &&
								( ( item.sizes.thumbnail &&
									item.sizes.thumbnail.url ) ||
									( item.sizes.medium &&
										item.sizes.medium.url ) ||
									( item.sizes.large &&
										item.sizes.large.url ) ) ) ||
							item.url,
						full:
							( item.sizes &&
								item.sizes.large &&
								item.sizes.large.url ) ||
							item.url,
						title: item.title || item.filename || '',
					} ) );
				resolve( items );
			} );
			frame.on( 'close', () => resolve( undefined ) );
			frame.open();
		} );
	}

	async function urlToCanvas( url, max ) {
		const img = new window.Image();
		img.crossOrigin = 'anonymous';
		img.decoding = 'async';
		img.src = url;
		// decode() keeps the (potentially huge) JPEG decode off the main
		// thread - drawImage on an undecoded image freezes the tab.
		if ( img.decode ) {
			await img.decode();
		} else {
			await new Promise( ( res, rej ) => {
				img.onload = res;
				img.onerror = rej;
			} );
		}
		const iw = img.naturalWidth || img.width;
		const ih = img.naturalHeight || img.height;
		const scale = Math.min( 1, max / iw );
		const w = Math.max( 1, Math.round( iw * scale ) );
		const h = Math.max( 1, Math.round( ih * scale ) );
		let src = img;
		if ( window.createImageBitmap && scale < 1 ) {
			// Off-main-thread downscale of oversized sources.
			try {
				src = await window.createImageBitmap( img, {
					resizeWidth: w,
					resizeHeight: h,
					resizeQuality: 'medium',
				} );
			} catch ( e ) {}
		}
		const c = document.createElement( 'canvas' );
		c.width = w;
		c.height = h;
		c.getContext( '2d' ).drawImage( src, 0, 0, w, h );
		if ( src !== img && src.close ) {
			src.close();
		}
		return c;
	}

	// renderToCanvas returns transparency for empty areas - flatten
	// every source onto white before analyzing.
	function flattenWhite( c ) {
		if ( ! c ) {
			return c;
		}
		const w = document.createElement( 'canvas' );
		w.width = c.width;
		w.height = c.height;
		const g2 = w.getContext( '2d' );
		g2.fillStyle = '#ffffff';
		g2.fillRect( 0, 0, w.width, w.height );
		g2.drawImage( c, 0, 0 );
		return w;
	}

	async function loadSource() {
		const token = ++srcToken;
		const desc = params.source;
		srcNote.textContent = '';
		try {
			let c = null;
			if ( 'media' === desc ) {
				if ( params.image && params.image.url ) {
					c = await urlToCanvas( params.image.url, 900 );
					srcNote.textContent = params.image.title || '';
				}
			} else if ( 'doc' === desc ) {
				c = await bridge.raster.renderToCanvas(
					editor.state.doc,
					editor.state.layers,
					{ scale: Math.min( 1, 900 / editor.state.doc.w ) }
				);
			} else if ( desc.startsWith( 'layer:' ) ) {
				const id = desc.slice( 6 );
				const find = ( layers ) => {
					for ( const l of layers || [] ) {
						if ( String( l.id ) === id ) {
							return l;
						}
						const hit = l.children && find( l.children );
						if ( hit ) {
							return hit;
						}
					}
					return null;
				};
				const target = find( editor.state.layers );
				if ( target ) {
					c = await bridge.raster.renderToCanvas(
						editor.state.doc,
						[ target ],
						{ scale: Math.min( 1, 900 / editor.state.doc.w ) }
					);
					srcNote.textContent = target.name || '';
				}
			}
			c = flattenWhite( c );
			if ( token === srcToken ) {
				srcCanvas = c;
				schedule();
			}
		} catch ( e ) {
			if ( token === srcToken ) {
				srcCanvas = null;
				setStatus( t( 'Could not load the image.' ), true );
				schedule();
			}
		}
	}

	srcSel.onchange = async () => {
		if ( 'media' === srcSel.value ) {
			const picked = await mediaFrame(
				t( 'Choose image' ),
				t( 'Use image' ),
				false
			);
			if ( picked && picked.length ) {
				params.image = {
					id: picked[ 0 ].id,
					url: picked[ 0 ].full,
					title: picked[ 0 ].title,
				};
				params.source = 'media';
			} else if ( undefined === picked && params.image ) {
				params.source = 'media';
			} else {
				srcSel.value = params.source;
				return;
			}
		} else {
			params.source = srcSel.value;
		}
		loadSource();
	};

	/* -------------------------------- tiles ------------------------------- */

	const tileSec = section( side, ICONS.tiles, t( 'Tiles' ) );
	const tileRow = el( 'div', 'wpiemos-tilebtns', tileSec );
	const pickTilesBtn = el( 'button', 'ai-btn secondary', tileRow );
	pickTilesBtn.type = 'button';
	pickTilesBtn.textContent = t( 'Pick tile photos…' );
	const clearBtn = el( 'button', 'wpiemos-reset', tileRow );
	clearBtn.type = 'button';
	clearBtn.textContent = t( 'Clear' );
	const tileInfo = el( 'div', 'wpiemos-info', tileSec );
	const tileStrip = el( 'div', 'wpiemos-strip', tileSec );

	function syncTileInfo() {
		tileInfo.textContent =
			tileData.length >= MIN_TILES
				? tn( '%d photos loaded', tileData.length )
				: tn(
						'Add at least %d photos - the more, the better the mosaic.',
						MIN_TILES
				  );
		tileStrip.innerHTML = '';
		for ( const td of tileData.slice( 0, 24 ) ) {
			const th = el( 'canvas', 'wpiemos-thumb', tileStrip );
			th.width = 28;
			th.height = 28;
			th.getContext( '2d' ).drawImage( td.canvas, 0, 0, 28, 28 );
		}
		if ( tileData.length > 24 ) {
			el(
				'span',
				'wpiemos-more',
				tileStrip,
				`+${ tileData.length - 24 }`
			);
		}
	}

	async function loadTiles() {
		const token = ++tileToken;
		tileData = [];
		syncTileInfo();
		const list = params.tiles || [];
		for ( let i = 0; i < list.length; i++ ) {
			if ( token !== tileToken ) {
				return;
			}
			setStatus(
				`${ t( 'Loading tiles…' ) } ${ i + 1 }/${ list.length }`
			);
			try {
				const c = await urlToCanvas( list[ i ].url, 200 );
				tileData.push( analyzeTile( c, c ) );
			} catch ( e ) {}
			if ( 0 === i % 8 ) {
				syncTileInfo();
			}
		}
		if ( token !== tileToken ) {
			return;
		}
		setStatus( '' );
		syncTileInfo();
		schedule();
	}

	pickTilesBtn.onclick = async () => {
		const picked = await mediaFrame(
			t( 'Pick tile photos…' ),
			t( 'Use photos' ),
			true
		);
		if ( picked && picked.length ) {
			// Merge, de-dup by attachment id.
			const seen = new Set( params.tiles.map( ( x ) => x.id ) );
			for ( const p of picked ) {
				if ( ! seen.has( p.id ) ) {
					params.tiles.push( { id: p.id, url: p.url } );
					seen.add( p.id );
				}
			}
			params.tiles = params.tiles.slice( 0, 600 );
			loadTiles();
		}
	};
	clearBtn.onclick = () => {
		params.tiles = [];
		tileData = [];
		syncTileInfo();
		schedule();
	};

	/* ------------------------------ settings ------------------------------ */

	const setSec = section( side, ICONS.settings, t( 'Settings' ) );
	function sliderRowIn( parent, label, min, max, get, set, unit ) {
		const row = el( 'label', 'wpiemos-row', parent );
		el( 'span', null, row ).textContent = label;
		const input = el( 'input', null, row );
		input.type = 'range';
		input.min = String( min );
		input.max = String( max );
		input.value = String( get() );
		const out = el( 'output', null, row );
		const suffix = unit || '';
		out.textContent = String( get() ) + suffix;
		input.oninput = () => {
			set( parseInt( input.value, 10 ) );
			out.textContent = input.value + suffix;
			schedule();
		};
		return row;
	}
	sliderRowIn(
		setSec,
		t( 'Columns' ),
		24,
		72,
		() => params.cols,
		( v ) => ( params.cols = v )
	);
	sliderRowIn(
		setSec,
		t( 'Color match' ),
		0,
		100,
		() => params.colorAdjust,
		( v ) => ( params.colorAdjust = v ),
		'%'
	);
	el( 'div', 'wpiemos-info', setSec, t( '0% = pure tile matching only' ) );

	/* ------------------------------- footer ------------------------------- */

	const foot = el( 'div', 'dsm-foot', dialog );
	el(
		'div',
		'dsm-hint',
		foot,
		t( 'Everything is computed locally in your browser.' )
	);
	const actions = el( 'div', 'dsm-actions', foot );
	const cancelBtn = el( 'button', 'ai-btn secondary', actions );
	cancelBtn.textContent = t( 'Cancel' );
	const apply = el( 'button', 'ai-btn primary', actions );
	apply.textContent = editing ? t( 'Update mosaic' ) : t( 'Insert mosaic' );
	apply.disabled = true;

	/* ------------------------------- painting ----------------------------- */

	let timer = 0;
	let bakeToken = 0;

	// Chunked build: run the generator in ~24ms slices, yield to the event
	// loop in between (progress stays visible, the tab stays responsive)
	// and abort mid-build the moment a newer bake supersedes this one.
	async function bake( full, tk ) {
		if ( ! srcCanvas || tileData.length < MIN_TILES ) {
			return null;
		}
		const it = mosaicSteps( srcCanvas, srcCanvas, tileData, {
			cols: params.cols,
			colorAdjust: params.colorAdjust / 100,
			cell: full ? 44 : 26,
		} );
		let sliceEnd = Date.now() + 24;
		for (;;) {
			const step = it.next();
			if ( step.done ) {
				return step.value ? step.value.canvas : null;
			}
			if ( tk !== bakeToken ) {
				return null;
			}
			if ( Date.now() > sliceEnd ) {
				setStatus(
					`${ t( 'Rendering the mosaic' ) } ${ step.value.row }/${
						step.value.rows
					}`
				);
				await new Promise( ( res ) => window.setTimeout( res, 0 ) );
				sliceEnd = Date.now() + 24;
			}
		}
	}
	function drawBaked( baked ) {
		const maxW = Math.max( 200, view.clientWidth - 36 );
		const maxH = Math.max( 200, view.clientHeight - 36 );
		const sc = Math.min( maxW / baked.width, maxH / baked.height, 1 );
		canvas.width = Math.round( baked.width * sc );
		canvas.height = Math.round( baked.height * sc );
		const g = canvas.getContext( '2d' );
		g.imageSmoothingEnabled = true;
		g.drawImage( baked, 0, 0, canvas.width, canvas.height );
	}
	function paintNow() {
		if ( ! srcCanvas || tileData.length < MIN_TILES ) {
			apply.disabled = true;
			canvas.width = 10;
			canvas.height = 10;
			return;
		}
		// The mosaic takes a moment - show the status, then compute off
		// the current frame so it actually renders first.
		const tk = ++bakeToken;
		setStatus( t( 'Rendering the mosaic' ) );
		window.setTimeout( async () => {
			if ( tk !== bakeToken ) {
				return;
			}
			const baked = await bake( false, tk );
			if ( tk !== bakeToken ) {
				return;
			}
			apply.disabled = ! baked;
			if ( baked ) {
				drawBaked( baked );
			}
			setStatus( '' );
		}, 40 );
	}
	function schedule() {
		window.clearTimeout( timer );
		timer = window.setTimeout( paintNow, 250 );
	}

	/* ------------------------------ lifecycle ----------------------------- */

	const onResize = () => schedule();
	const viewRO =
		'function' === typeof window.ResizeObserver
			? new window.ResizeObserver( () => schedule() )
			: null;
	const onKey = ( e ) => {
		if ( 'Escape' === e.key ) {
			close();
		}
	};
	function close() {
		window.clearTimeout( timer );
		bakeToken++;
		tileToken++;
		window.removeEventListener( 'resize', onResize );
		if ( viewRO ) {
			viewRO.disconnect();
		}
		document.removeEventListener( 'keydown', onKey );
		backdrop.remove();
	}
	window.addEventListener( 'resize', onResize );
	if ( viewRO ) {
		viewRO.observe( view );
	}
	document.addEventListener( 'keydown', onKey );
	closeBtn.onclick = close;
	cancelBtn.onclick = close;
	backdrop.onclick = ( e ) => {
		if ( e.target === backdrop ) {
			close();
		}
	};

	/* -------------------------------- insert ------------------------------ */

	apply.onclick = async () => {
		apply.disabled = true;
		setStatus( t( 'Rendering the mosaic' ) );
		try {
			const baked = await bake( true, ++bakeToken );
			if ( ! baked ) {
				throw new Error( t( 'Could not insert the mosaic.' ) );
			}
			const url = baked.toDataURL( 'image/png' );
			const doc = editor.state.doc;
			const fit = Math.min(
				( doc.w * 0.92 ) / baked.width,
				( doc.h * 0.92 ) / baked.height
			);
			const w = Math.round( baked.width * fit );
			const h = Math.round( baked.height * fit );
			const stored = { ...params };
			if ( editing ) {
				editor.dispatch( {
					type: 'UPDATE_LAYER',
					id: layer.id,
					patch: {
						src: url,
						naturalW: baked.width,
						naturalH: baked.height,
						generator: { id: GEN_ID, params: stored },
					},
				} );
				editor.commit( t( 'Update mosaic' ) );
				setStatus( t( 'Mosaic updated.' ) );
			} else {
				const imgLayer = bridge.documents.makeImage( {
					name: t( 'Photo Mosaic' ),
					x: Math.round( ( doc.w - w ) / 2 ),
					y: Math.round( ( doc.h - h ) / 2 ),
					w,
					h,
					src: url,
					naturalW: baked.width,
					naturalH: baked.height,
				} );
				imgLayer.generator = { id: GEN_ID, params: stored };
				editor.dispatch( { type: 'ADD_LAYER', layer: imgLayer } );
				editor.dispatch( { type: 'SET_ACTIVE', id: imgLayer.id } );
				editor.commit( t( 'Insert mosaic' ) );
				setStatus( t( 'Inserted.' ) );
			}
			close();
		} catch ( e ) {
			setStatus(
				e && e.message
					? e.message
					: t( 'Could not insert the mosaic.' ),
				true
			);
			apply.disabled = false;
		}
	};

	/* --------------------------------- boot ------------------------------- */

	void extras;
	requestAnimationFrame( () => {
		syncTileInfo();
		loadSource();
		if ( params.tiles.length ) {
			loadTiles();
		}
	} );
}

/* -------------------------------- register ------------------------------- */

function register( api ) {
	api.registerGenerator( {
		id: GEN_ID,
		label: 'Photo Mosaic',
		run: ( ctx ) => openStudio( ctx ),
		edit: ( ctx ) => openStudio( ctx ),
	} );
}

if ( window.WPIE && window.WPIE.api ) {
	register( window.WPIE.api );
} else {
	window.wp.hooks.addAction( 'wpie.ready', 'wpie-photo-mosaic', register );
}
