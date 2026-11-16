/**
 * The paper compositor: rings in, layered paper pictures out.
 *
 * All canvas work lives here - the core stays pure. The engine renders
 * the live preview, bakes stills, and cuts one transparent image per
 * layer for the insert.
 */

import { buildScene } from '../core/scene.js';
import { ringsToPath, scaleRings } from '../core/geom.js';
import {
	lumaOf,
	blurLuma,
	alphaMask,
	depthBands,
	resampleDepth,
} from '../core/photo.js';
import { trace as traceMask } from '../core/mask.js';
import { lookById } from '../core/model.js';
import { paperLight, FINISH_DEFAULTS } from '../core/finishes.js';
import { paintPaperSurface, paperTint } from './paper-material.js';

const SELECT_COLOR = 'rgba(59, 102, 255, 0.95)';
// Handles sit this far outside the shape, in canvas pixels.
const HANDLE_PAD = 4;
// Page-covering objects have no meaningful corner to drag.
const FULL_PAGE_KINDS = [ 'backdrop', 'terrain', 'border', 'frame' ];

export class PaperEngine {
	constructor( canvas ) {
		this.canvas = canvas;
		this.ctx = canvas.getContext( '2d' );
		this.w = 2;
		this.h = 2;
		this.scene = null;
		this.params = null;
		// Photo pixels arrive as canvases; luma caches per size+blur.
		this.photoCanvas = null;
		this.subjectCanvas = null;
		this._lumaCache = null;
		// Per-sheet build cache for the live preview: only what changed
		// is recomputed, which is what makes dragging feel immediate.
		this._cache = new Map();
		// v3.8: the PAINT cache for drags (renderLive). The build cache
		// spared the geometry, but every frame still rasterized every
		// sheet with its soft shadows - 64 ms a step in the median, 144
		// with ten sheets. Now the sheets below and above what changes
		// are kept as two finished images.
		this._live = null;
		this._ringIds = new WeakMap();
		this._ringSeq = 0;
	}

	setSize( w, h ) {
		this.w = Math.max( 2, Math.round( w ) );
		this.h = Math.max( 2, Math.round( h ) );
		this.canvas.width = this.w;
		this.canvas.height = this.h;
		this._lumaCache = null;
		this._cache.clear();
	}

	setPhoto( canvas ) {
		this.photoCanvas = canvas;
		this._lumaCache = null;
		this._depth = null;
		this._bandCache = null;
		this._cache.clear();
		this._photoKey = 'p' + Date.now().toString( 36 );
	}

	/**
	 * Hand in the local depth map for the current photo, or null to go
	 * back to brightness bands.
	 *
	 * @param {Object|null} map `{ w, h, depth }` from bridge.ml.depthMap.
	 */
	setDepth( map ) {
		this._depth = map;
		this._bandCache = null;
		this._cache.clear();
		this._photoKey = 'd' + Date.now().toString( 36 );
	}

	/** Whether a real depth map is available for this picture. */
	hasDepth() {
		return !! this._depth;
	}

	/**
	 * The depth bands at a given grid size, cached: slicing is cheap but
	 * a twenty-layer stack asks for it twenty times per build.
	 *
	 * @param {number} w     Grid width.
	 * @param {number} h     Grid height.
	 * @param {number} count How many bands.
	 * @return {Uint8Array[]|null} Masks, or null without a depth map.
	 */
	bandsAt( w, h, count ) {
		if ( ! this._depth ) {
			return null;
		}
		const key = w + 'x' + h + ':' + count;
		if ( this._bandCache && this._bandCache.key === key ) {
			return this._bandCache.value;
		}
		const value = depthBands( resampleDepth( this._depth, w, h ), count );
		this._bandCache = { key, value };
		return value;
	}

	/**
	 * The average photo colour inside each band - the second colour
	 * source, and the one that makes a photo stack look like the photo.
	 *
	 * @param {Array} bands Masks from bandsAt().
	 * @param {number} w    Grid width.
	 * @param {number} h    Grid height.
	 * @return {string[]} One hex colour per band.
	 */
	bandColors( bands, w, h ) {
		if ( ! this.photoCanvas || ! bands ) {
			return null;
		}
		const c = document.createElement( 'canvas' );
		c.width = w;
		c.height = h;
		const g = c.getContext( '2d' );
		const pw = this.photoCanvas.width;
		const ph = this.photoCanvas.height;
		const s = Math.max( w / pw, h / ph );
		g.drawImage(
			this.photoCanvas,
			( w - pw * s ) / 2,
			( h - ph * s ) / 2,
			pw * s,
			ph * s
		);
		const px = g.getImageData( 0, 0, w, h ).data;
		return bands.map( ( mask, k ) => {
			// Only the ring this band adds, not everything behind it -
			// otherwise every layer averages towards the same grey.
			const inner = k > 0 ? bands[ k - 1 ] : null;
			let r = 0;
			let gg = 0;
			let b = 0;
			let n = 0;
			for ( let i = 0; i < mask.length; i++ ) {
				if ( ! mask[ i ] || ( inner && inner[ i ] ) ) {
					continue;
				}
				r += px[ i * 4 ];
				gg += px[ i * 4 + 1 ];
				b += px[ i * 4 + 2 ];
				n++;
			}
			if ( ! n ) {
				return null;
			}
			const hex = ( v ) =>
				Math.round( v / n )
					.toString( 16 )
					.padStart( 2, '0' );
			return '#' + hex( r ) + hex( gg ) + hex( b );
		} );
	}

	setSubject( canvas ) {
		this.subjectCanvas = canvas;
		this._cache.clear();
		this._photoKey = 's' + Date.now().toString( 36 );
	}

	/** Luminance of the photo, resampled to the given grid size. */
	lumaAt( w, h, blurAmount ) {
		const key = w + 'x' + h + ':' + blurAmount;
		if ( this._lumaCache && this._lumaCache.key === key ) {
			return this._lumaCache.value;
		}
		if ( ! this.photoCanvas ) {
			return null;
		}
		const c = document.createElement( 'canvas' );
		c.width = w;
		c.height = h;
		const g = c.getContext( '2d' );
		// Cover-fit the photo onto the sheet.
		const pw = this.photoCanvas.width;
		const ph = this.photoCanvas.height;
		const s = Math.max( w / pw, h / ph );
		g.drawImage(
			this.photoCanvas,
			( w - pw * s ) / 2,
			( h - ph * s ) / 2,
			pw * s,
			ph * s
		);
		const rgba = g.getImageData( 0, 0, w, h ).data;
		const radius = Math.round( ( blurAmount / 100 ) * ( w / 60 ) );
		const value = {
			luma: blurLuma( lumaOf( rgba, w, h ), w, h, radius ),
			w,
			h,
		};
		this._lumaCache = { key, value };
		return value;
	}

	subjectAt( w, h ) {
		if ( ! this.subjectCanvas ) {
			return null;
		}
		const c = document.createElement( 'canvas' );
		c.width = w;
		c.height = h;
		const g = c.getContext( '2d' );
		const pw = this.subjectCanvas.width;
		const ph = this.subjectCanvas.height;
		const s = Math.max( w / pw, h / ph );
		g.drawImage(
			this.subjectCanvas,
			( w - pw * s ) / 2,
			( h - ph * s ) / 2,
			pw * s,
			ph * s
		);
		return alphaMask( g.getImageData( 0, 0, w, h ).data, w, h, 0.5 );
	}

	/**
	 * Text objects: rasterize the words, then trace them back into
	 * polygons so they behave like every other object (hit-testable,
	 * draggable, part of the cut files).
	 */
	textStamps( obj, w, h ) {
		const c = document.createElement( 'canvas' );
		c.width = w;
		c.height = h;
		const g = c.getContext( '2d' );
		const px = ( obj.scale / 100 ) * h;
		g.font = `700 ${ px }px ${ obj.family || 'Inter, sans-serif' }`;
		g.textAlign = 'center';
		g.textBaseline = 'alphabetic';
		g.fillStyle = '#fff';
		// Several words under each other are one block, not three
		// objects: LOVE / LIVE / HOME punched out of a passepartout has
		// to line up, and lining up three separate things by hand is
		// exactly the fiddling this studio should spare you.
		const lines = String( obj.value || '' ).split( /\r?\n/ );
		const step = px * ( ( obj.lineGap ?? 20 ) / 100 + 1 );
		const top = obj.y * h - ( ( lines.length - 1 ) * step ) / 2;
		lines.forEach( ( line, i ) => {
			g.fillText( line, obj.x * w, top + i * step );
		} );
		const mask = alphaMask( g.getImageData( 0, 0, w, h ).data, w, h, 0.4 );
		const rings = traceMask( { w, h, data: mask } );
		return rings.length ? [ rings ] : [];
	}

	/**
	 * One of the editor's shapes as paper (v3.8): its path data from
	 * bridge.shapes, filled at the object's size into a small canvas
	 * around it and traced like the letters. Rotation is applied to the
	 * traced outline later, the way it is for every object.
	 *
	 * @param {Object} obj Clean form object.
	 * @param {number} w   Target width.
	 * @param {number} h   Target height.
	 * @return {Array} Stamps.
	 */
	formStamps( obj, w, h ) {
		const shapes =
			'undefined' !== typeof window &&
			window.WPIE &&
			window.WPIE.bridge &&
			window.WPIE.bridge.shapes;
		if ( ! shapes || 'function' !== typeof shapes.pathD ) {
			return [];
		}
		const size = Math.max( 4, ( obj.scale / 100 ) * h );
		let d = '';
		try {
			d = shapes.pathD( obj.shape, size, size ) || '';
		} catch ( e ) {
			d = '';
		}
		if ( ! d ) {
			return [];
		}
		const pad = 2;
		const side = Math.ceil( size ) + pad * 2;
		const c = document.createElement( 'canvas' );
		c.width = side;
		c.height = side;
		const g = c.getContext( '2d' );
		g.translate( pad, pad );
		if ( obj.flip ) {
			g.translate( size, 0 );
			g.scale( -1, 1 );
		}
		g.fillStyle = '#fff';
		g.fill( new Path2D( d ), 'evenodd' );
		const mask = alphaMask(
			g.getImageData( 0, 0, side, side ).data,
			side,
			side,
			0.4
		);
		const ox = obj.x * w - size / 2 - pad;
		const oy = obj.y * h - size / 2 - pad;
		const rings = traceMask( { w: side, h: side, data: mask } ).map(
			( ring ) => ring.map( ( [ x, y ] ) => [ x + ox, y + oy ] )
		);
		return rings.length ? [ rings ] : [];
	}

	rasterLetter( letter, w, h ) {
		const c = document.createElement( 'canvas' );
		c.width = w;
		c.height = h;
		const g = c.getContext( '2d' );
		g.font = `800 ${ h * 0.82 }px Inter, sans-serif`;
		g.textAlign = 'center';
		g.textBaseline = 'middle';
		g.fillStyle = '#fff';
		g.fillText( ( letter || 'A' ).slice( 0, 1 ), w / 2, h * 0.54 );
		return alphaMask( g.getImageData( 0, 0, w, h ).data, w, h, 0.4 );
	}

	buildCtx( w, h, params, cache = null ) {
		const live = 'none' !== params.photo.source;
		// Real depth if the model gave us one and the user did not ask for
		// the old way; brightness bands otherwise. Never a hard
		// requirement - a missing model just makes it worse, not broken.
		const bands =
			live && 'luma' !== params.photo.mode
				? this.bandsAt( w, h, params.photo.bands )
				: null;
		return {
			w,
			h,
			cache,
			bands,
			bandColors:
				bands && 'photo' === params.colorSource
					? this.bandColors( bands, w, h )
					: null,
			photoKey:
				( this._photoKey || '' ) +
				( live
					? params.photo.thresholds.join( ',' ) +
					  params.photo.invert +
					  params.photo.blur +
					  params.photo.mode +
					  params.photo.bands +
					  params.colorSource
					: '' ),
			photo: live ? this.lumaAt( w, h, params.photo.blur ) : null,
			subject: params.photo.subject ? this.subjectAt( w, h ) : null,
			textStamps: ( obj, ww, hh ) => this.textStamps( obj, ww, hh ),
			formStamps: ( obj, ww, hh ) => this.formStamps( obj, ww, hh ),
			rasterLetter: ( l, ww, hh ) => this.rasterLetter( l, ww, hh ),
		};
	}

	/** Rebuild the scene at the live size. */
	build( params ) {
		this.params = params;
		this.scene = buildScene(
			params,
			this.buildCtx( this.w, this.h, params, this._cache )
		);
		return this.scene;
	}

	/** All layers back to front, frame last. */
	allLayers( scene = this.scene ) {
		if ( ! scene ) {
			return [];
		}
		return scene.frame ? [ ...scene.layers, scene.frame ] : scene.layers;
	}

	layerPath( sheet, w = this.w, h = this.h, baseW = this.w ) {
		const s = w / baseW;
		const p = new Path2D(
			ringsToPath(
				scaleRings( sheet.rings, s ).map( ( ring ) =>
					ring.map( ( [ x, y ] ) => [
						x + sheet.layer.dx * w,
						y + sheet.layer.dy * h,
					] )
				)
			)
		);
		return p;
	}

	/**
	 * Paint one layer (its paper and the shadow it casts) onto a context.
	 *
	 * Two of the three look axes live here. `edge` decides whether the
	 * layers are separated by a deep, soft shadow (the lightbox) or by a
	 * narrow hard rim (the poster); `paper` decides whether the surface
	 * is flat or has a tooth.
	 *
	 * @param {Object} g          2d context.
	 * @param {Object} layer      Built scene layer.
	 * @param {Object} opts       Target geometry.
	 * @param {number} opts.w     Target width in px.
	 * @param {number} opts.h     Target height in px.
	 * @param {number} opts.baseW Width the rings were built at, for scale.
	 */
	paintLayer(
		g,
		layer,
		{ w = this.w, h = this.h, baseW = this.w, params = this.params } = {}
	) {
		const p = params;
		if ( ! layer.rings.length ) return;
		const path = this.layerPath( layer, w, h, baseW );
		const light = paperLight( p );
		const unit = h / 700;
		const lift = ( layer.layer.elevation ?? 100 ) / 100;
		const strength =
			( p.shadow / 100 ) * ( ( layer.layer.shadow ?? 100 ) / 100 );
		const material = layer.layer.paper || p.paper || 'smooth';
		const index = Math.max(
			0,
			p.layers.findIndex( ( l ) => l.id === layer.layer.id )
		);
		const rim = p.edge === 'rim';
		const distance =
			unit * ( rim ? 2 : 3 + lift * 17 ) * ( 0.3 + p.shadow / 100 );
		g.save();
		g.fillStyle = layer.color;
		if ( strength > 0 ) {
			// A broad cast gives height; the separate short contact shadow anchors the edge.
			g.shadowColor =
				'rgba(10,14,22,' + Math.min( 0.72, strength * 0.57 ) + ')';
			g.shadowBlur = rim
				? 0
				: unit * ( 1 + ( p.soft / 100 ) * ( 7 + lift * 16 ) );
			g.shadowOffsetX = -light.x * distance;
			g.shadowOffsetY = -light.y * distance;
			g.fill( path, 'evenodd' );
			if ( ! rim ) {
				g.shadowColor =
					'rgba(8,12,18,' + Math.min( 0.4, strength * 0.32 ) + ')';
				g.shadowBlur = unit * ( 1.2 + lift * 1.6 );
				g.shadowOffsetX = -light.x * unit * 1.3;
				g.shadowOffsetY = -light.y * unit * 1.3;
				g.fill( path, 'evenodd' );
			}
		}
		g.shadowColor = 'transparent';
		g.shadowBlur = g.shadowOffsetX = g.shadowOffsetY = 0;
		const thickness =
			( p.thickness ?? FINISH_DEFAULTS.thickness ) *
			unit *
			( rim ? 0.028 : 0.078 );
		if ( thickness > 0 ) {
			// Draw the paper core, not a uniform outline around the silhouette.
			const steps = Math.min( 10, Math.max( 1, Math.ceil( thickness ) ) );
			g.fillStyle = paperTint( layer.color, -0.22 );
			for ( let i = steps; i > 0; i-- ) {
				g.save();
				g.translate(
					( -light.nx * thickness * i ) / steps,
					( -light.ny * thickness * i ) / steps
				);
				g.fill( path, 'evenodd' );
				g.restore();
			}
		}
		g.fillStyle = layer.color;
		g.fill( path, 'evenodd' );
		paintPaperSurface( g, path, layer.color, material, p, { w, h, index } );
		g.restore();
	}

	paintBackdrop( g, w, h, params = this.params ) {
		const look = lookById( params.look );
		const grad = g.createLinearGradient( 0, 0, 0, h );
		grad.addColorStop( 0, look.bg[ 0 ] );
		grad.addColorStop( 1, look.bg[ 1 ] );
		g.fillStyle = grad;
		g.fillRect( 0, 0, w, h );
		if ( params.glow > 0 ) {
			const r = Math.max( w, h ) * 0.75;
			const cx = w * ( 0.5 + params.lightX / 400 );
			const cy =
				h * ( 0.5 + ( params.lightY ?? FINISH_DEFAULTS.lightY ) / 400 );
			const rad = g.createRadialGradient( cx, cy, 0, cx, cy, r );
			rad.addColorStop( 0, look.glow );
			rad.addColorStop( 1, look.bg[ 1 ] );
			g.save();
			g.globalAlpha = ( params.glow / 100 ) * 0.85;
			g.fillStyle = rad;
			g.fillRect( 0, 0, w, h );
			g.restore();
		}
	}

	/**
	 * The handle boxes of the selected object, in canvas pixels.
	 *
	 * Four corners resize, one stalk above the top edge turns. Returned
	 * rather than only drawn, so the stage can hit-test exactly what the
	 * eye sees - the lesson from every drag-and-drop round in this family.
	 *
	 * @param {string} objId Selected object id.
	 * @return {Array|null} `[ { id, x, y, r } ]` or null.
	 */
	handlesFor( objId ) {
		const obj = objId ? this.objectPath( objId ) : null;
		if ( ! obj || ! obj.bbox || FULL_PAGE_KINDS.includes( obj.kind ) ) {
			return null;
		}
		const dx = obj.layer.layer.dx * this.w;
		const dy = obj.layer.layer.dy * this.h;
		const x0 = obj.bbox.x0 + dx - HANDLE_PAD;
		const y0 = obj.bbox.y0 + dy - HANDLE_PAD;
		const x1 = obj.bbox.x1 + dx + HANDLE_PAD;
		const y1 = obj.bbox.y1 + dy + HANDLE_PAD;
		const r = Math.max( 5, this.w / 130 );
		return [
			{ id: 'nw', x: x0, y: y0, r },
			{ id: 'ne', x: x1, y: y0, r },
			{ id: 'se', x: x1, y: y1, r },
			{ id: 'sw', x: x0, y: y1, r },
			{ id: 'rot', x: ( x0 + x1 ) / 2, y: y0 - r * 3.4, r },
		];
	}

	/** Draw the whole scene onto the live canvas. */
	render( { selected = null } = {} ) {
		const g = this.ctx;
		const { w, h } = this;
		// A full paint is the truth; any frozen drag images are stale now.
		this._live = null;
		if ( ! this.scene ) {
			return;
		}
		this.paintBackdrop( g, w, h );
		const layers = this.allLayers();
		layers.forEach( ( layer ) => {
			this.paintLayer( g, layer, { w, h, baseW: w } );
		} );
		this.paintSelection( g, selected, layers );
	}

	/** What decides how a built sheet looks, as one comparable string. */
	_paintSig( built, i ) {
		let id = this._ringIds.get( built.rings );
		if ( ! id ) {
			id = ++this._ringSeq;
			this._ringIds.set( built.rings, id );
		}
		const l = built.layer || {};
		return [
			i,
			id,
			built.color,
			l.id,
			l.dx || 0,
			l.dy || 0,
			l.elevation ?? 100,
			l.shadow ?? 100,
			l.paper || '',
			this.params.layers.findIndex( ( x ) => x.id === l.id ),
		].join( '|' );
	}

	/** Everything outside the sheets that changes how they are painted. */
	_globalSig() {
		const rest = { ...this.params };
		delete rest.layers;
		return this.w + 'x' + this.h + JSON.stringify( rest );
	}

	/**
	 * Paint for a drag or a slider (v3.8). Exactly the picture render()
	 * makes - sheets are laid source-over, and the one blend they use
	 * (soft-light grain) stays inside their own opaque paper - but the
	 * sheets below and above the ones that changed are painted once into
	 * two images and reused while only the changed range moves.
	 *
	 * @param {Object} opts
	 * @param {string} opts.selected The selection to outline.
	 */
	renderLive( { selected = null } = {} ) {
		if ( ! this.scene ) {
			return;
		}
		const layers = this.allLayers();
		const sig = layers.map( ( l, i ) => this._paintSig( l, i ) );
		const global = this._globalSig();
		const live = this._live;
		if (
			! live ||
			live.global !== global ||
			live.base.length !== sig.length
		) {
			this.render( { selected } );
			this._live = {
				global,
				base: sig,
				lo: -1,
				hi: -1,
				below: null,
				above: null,
			};
			return;
		}
		let lo = Infinity,
			hi = -1;
		sig.forEach( ( s, i ) => {
			if ( s !== live.base[ i ] ) {
				lo = Math.min( lo, i );
				hi = Math.max( hi, i );
			}
		} );
		if ( hi < 0 ) {
			if ( live.below ) {
				this._composeLive( layers, live, selected );
			} else {
				this.render( { selected } );
				this._live = live;
			}
			return;
		}
		if ( ! live.below || lo < live.lo || hi > live.hi ) {
			const { w, h } = this;
			const make = () => {
				const c = document.createElement( 'canvas' );
				c.width = w;
				c.height = h;
				return c;
			};
			live.lo = lo;
			live.hi = hi;
			live.below = live.below || make();
			live.above = live.above || make();
			const gb = live.below.getContext( '2d' );
			gb.clearRect( 0, 0, w, h );
			this.paintBackdrop( gb, w, h );
			for ( let i = 0; i < lo; i++ ) {
				this.paintLayer( gb, layers[ i ], { w, h, baseW: w } );
			}
			const ga = live.above.getContext( '2d' );
			ga.clearRect( 0, 0, w, h );
			for ( let i = hi + 1; i < layers.length; i++ ) {
				this.paintLayer( ga, layers[ i ], { w, h, baseW: w } );
			}
		}
		this._composeLive( layers, live, selected );
	}

	_composeLive( layers, live, selected ) {
		const g = this.ctx;
		const { w, h } = this;
		g.clearRect( 0, 0, w, h );
		g.drawImage( live.below, 0, 0 );
		for ( let i = live.lo; i <= live.hi; i++ ) {
			this.paintLayer( g, layers[ i ], { w, h, baseW: w } );
		}
		g.drawImage( live.above, 0, 0 );
		this.paintSelection( g, selected, layers );
	}

	/** The dashed outline and handles of what is selected. */
	paintSelection( g, selected, layers ) {
		const { w } = this;
		if ( ! selected ) {
			return;
		}
		const obj = this.objectPath( selected );
		g.save();
		g.strokeStyle = SELECT_COLOR;
		g.lineWidth = Math.max( 1.5, w / 420 );
		g.setLineDash( [ 6, 5 ] );
		if ( ! obj ) {
			const sel = layers.find( ( s ) => s.layer.id === selected );
			if ( sel && sel.rings.length ) {
				g.stroke( this.layerPath( sel ), 'evenodd' );
			}
			g.restore();
			return;
		}
		g.stroke( obj.path );
		const handles = this.handlesFor( selected );
		if ( ! handles ) {
			g.restore();
			return;
		}
		const box = handles.slice( 0, 4 );
		g.setLineDash( [ 2, 4 ] );
		g.globalAlpha = 0.5;
		g.strokeRect(
			box[ 0 ].x,
			box[ 0 ].y,
			box[ 2 ].x - box[ 0 ].x,
			box[ 2 ].y - box[ 0 ].y
		);
		// The stalk to the rotation handle, so it reads as belonging.
		g.globalAlpha = 0.7;
		g.setLineDash( [] );
		const rot = handles[ 4 ];
		g.beginPath();
		g.moveTo( rot.x, box[ 0 ].y );
		g.lineTo( rot.x, rot.y );
		g.stroke();
		g.globalAlpha = 1;
		for ( const hnd of handles ) {
			g.beginPath();
			g.arc( hnd.x, hnd.y, hnd.r, 0, Math.PI * 2 );
			g.fillStyle = 'rot' === hnd.id ? SELECT_COLOR : '#ffffff';
			g.fill();
			g.strokeStyle = 'rot' === hnd.id ? '#ffffff' : SELECT_COLOR;
			g.lineWidth = Math.max( 1.2, w / 600 );
			g.stroke();
		}
		g.restore();
	}

	/**
	 * What is under the pointer: an OBJECT first (its own shape, not
	 * the paper it sits on), otherwise the sheet whose paper covers the
	 * point. This is the whole difference between grabbing the bird and
	 * grabbing the entire layer.
	 *
	 * @param {number} x Canvas x.
	 * @param {number} y Canvas y.
	 * @return {Object|null} `{ type: 'object'|'layer', layer, object }`.
	 */
	hitAt( x, y ) {
		const sheets = this.allLayers();
		for ( let i = sheets.length - 1; i >= 0; i-- ) {
			const s = sheets[ i ];
			if ( '__frame' === s.layer.id ) {
				continue;
			}
			const ox = x - s.layer.dx * this.w;
			const oy = y - s.layer.dy * this.h;
			for ( let k = s.shapes.length - 1; k >= 0; k-- ) {
				const shape = s.shapes[ k ];
				const bb = shape.bbox;
				if (
					! bb ||
					ox < bb.x0 - 4 ||
					ox > bb.x1 + 4 ||
					oy < bb.y0 - 4 ||
					oy > bb.y1 + 4
				) {
					continue;
				}
				const obj = s.layer.objects.find( ( o ) => o.id === shape.id );
				if ( ! obj ) {
					continue;
				}
				// A passepartout is a card with a window cut OUT of it, and
				// the window is punched into the paper after the shape is
				// recorded - so the shape still describes the whole card.
				// Testing it claims the opening too, which is the entire
				// picture, and since the frame sits at the very front every
				// click landed on it instead of on the thing being framed.
				// Ask the paper that is really drawn: it carries the window,
				// whatever cut it, a shape or a letter.
				if ( 'frame' === shape.kind ) {
					if (
						s.rings.length &&
						this.ctx.isPointInPath(
							this.layerPath( s ),
							x,
							y,
							'evenodd'
						)
					) {
						return { type: 'object', layer: s.layer, object: obj };
					}
					continue;
				}
				// Inside the box is enough for small things; big ones
				// test their real outline so a click lands honestly.
				const big = bb.x1 - bb.x0 > this.w * 0.25;
				if ( ! big || this.shapeHit( shape, ox, oy ) ) {
					return { type: 'object', layer: s.layer, object: obj };
				}
			}
		}
		for ( let i = sheets.length - 1; i >= 0; i-- ) {
			const s = sheets[ i ];
			if ( '__frame' === s.layer.id ) {
				continue;
			}
			if (
				s.rings.length &&
				this.ctx.isPointInPath( this.layerPath( s ), x, y, 'evenodd' )
			) {
				return { type: 'layer', layer: s.layer, object: null };
			}
		}
		return null;
	}

	/** Point-in-shape against an object's own stamps. */
	shapeHit( shape, x, y ) {
		const p = new Path2D();
		for ( const stamp of shape.stamps ) {
			for ( const ring of stamp ) {
				p.moveTo( ring[ 0 ][ 0 ], ring[ 0 ][ 1 ] );
				for ( let i = 1; i < ring.length; i++ ) {
					p.lineTo( ring[ i ][ 0 ], ring[ i ][ 1 ] );
				}
				p.closePath();
			}
		}
		return this.ctx.isPointInPath( p, x, y, 'nonzero' );
	}

	/** The outline of one object, for the selection marker. */
	objectPath( objId ) {
		for ( const s of this.allLayers() ) {
			const shape = s.shapes.find( ( x ) => x.id === objId );
			if ( ! shape ) {
				continue;
			}
			const p = new Path2D();
			for ( const stamp of shape.stamps ) {
				for ( const ring of stamp ) {
					p.moveTo(
						ring[ 0 ][ 0 ] + s.layer.dx * this.w,
						ring[ 0 ][ 1 ] + s.layer.dy * this.h
					);
					for ( let i = 1; i < ring.length; i++ ) {
						p.lineTo(
							ring[ i ][ 0 ] + s.layer.dx * this.w,
							ring[ i ][ 1 ] + s.layer.dy * this.h
						);
					}
					p.closePath();
				}
			}
			return { path: p, bbox: shape.bbox, kind: shape.kind, layer: s };
		}
		return null;
	}

	/** High-res still. Rebuilds the scene at the target size. */
	still( w, h, params = this.params ) {
		const scene = buildScene( params, this.buildCtx( w, h, params ) );
		const c = document.createElement( 'canvas' );
		c.width = w;
		c.height = h;
		const g = c.getContext( '2d' );
		this.paintBackdrop( g, w, h, params );
		for ( const sheet of this.allLayers( scene ) ) {
			this.paintLayer( g, sheet, { w, h, baseW: w, params } );
		}
		return c.toDataURL( 'image/png' );
	}

	/**
	 * Per-layer transparent PNGs at document size - the insert gives
	 * every paper layer its own editable editor layer.
	 */
	layerImages( w, h, params = this.params ) {
		const scene = buildScene( params, this.buildCtx( w, h, params ) );
		const out = [];
		for ( const sheet of this.allLayers( scene ) ) {
			const c = document.createElement( 'canvas' );
			c.width = w;
			c.height = h;
			const g = c.getContext( '2d' );
			this.paintLayer( g, sheet, { w, h, baseW: w, params } );
			out.push( {
				layer: sheet,
				src: c.toDataURL( 'image/png' ),
			} );
		}
		return { images: out, scene };
	}
}
