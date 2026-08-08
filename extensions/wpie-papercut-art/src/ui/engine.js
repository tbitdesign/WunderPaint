/**
 * The paper compositor: proven rings in, layered-lightbox pictures out.
 *
 * All canvas work lives here - the core stays pure. The engine renders
 * the live preview, bakes stills and per-sheet images for the insert,
 * writes the cutting SVGs and records the reveal video.
 */

import { buildScene } from '../core/scene.js';
import { ringsToPath, scaleRings, rng } from '../core/geom.js';
import { lumaOf, blurLuma, alphaMask } from '../core/photo.js';
import { trace as traceMask } from '../core/mask.js';
import { lookById } from '../core/model.js';

const clamp01 = ( v ) => Math.max( 0, Math.min( 1, v ) );

/** Deterministic paper-grain tile, generated once. */
function grainTile() {
	const c = document.createElement( 'canvas' );
	c.width = 128;
	c.height = 128;
	const g = c.getContext( '2d' );
	const img = g.createImageData( 128, 128 );
	const r = rng( 4711 );
	for ( let i = 0; i < 128 * 128; i++ ) {
		const v = 118 + Math.floor( r() * 20 );
		img.data[ i * 4 ] = v;
		img.data[ i * 4 + 1 ] = v;
		img.data[ i * 4 + 2 ] = v;
		img.data[ i * 4 + 3 ] = 255;
	}
	g.putImageData( img, 0, 0 );
	return c;
}

export class PaperEngine {
	constructor( canvas ) {
		this.canvas = canvas;
		this.ctx = canvas.getContext( '2d' );
		this.w = 2;
		this.h = 2;
		this.grain = grainTile();
		this.scene = null;
		this.params = null;
		// Photo pixels arrive as canvases; luma caches per size+blur.
		this.photoCanvas = null;
		this.subjectCanvas = null;
		this._lumaCache = null;
		// Per-sheet build cache for the live preview: only what changed
		// is recomputed, which is what makes dragging feel immediate.
		this._cache = new Map();
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
		this._cache.clear();
		this._photoKey = 'p' + Date.now().toString( 36 );
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
		g.fillText( obj.value || '', obj.x * w, obj.y * h );
		const mask = alphaMask( g.getImageData( 0, 0, w, h ).data, w, h, 0.4 );
		const rings = traceMask( { w, h, data: mask } );
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
		return {
			w,
			h,
			cache,
			photoKey:
				( this._photoKey || '' ) +
				( 'none' === params.photo.source
					? ''
					: params.photo.thresholds.join( ',' ) +
					  params.photo.invert +
					  params.photo.blur ),
			photo:
				'none' !== params.photo.source
					? this.lumaAt( w, h, params.photo.blur )
					: null,
			subject: params.photo.subject ? this.subjectAt( w, h ) : null,
			textStamps: ( obj, ww, hh ) => this.textStamps( obj, ww, hh ),
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

	/** All sheets back to front, frame last. */
	allSheets( scene = this.scene ) {
		if ( ! scene ) {
			return [];
		}
		return scene.frame ? [ ...scene.sheets, scene.frame ] : scene.sheets;
	}

	sheetPath( sheet, w = this.w, h = this.h, baseW = this.w ) {
		const s = w / baseW;
		const p = new Path2D(
			ringsToPath(
				scaleRings( sheet.rings, s ).map( ( ring ) =>
					ring.map( ( [ x, y ] ) => [
						x + sheet.sheet.dx * w,
						y + sheet.sheet.dy * h,
					] )
				)
			)
		);
		return p;
	}

	/**
	 * Paint one sheet (its paper + its drop shadow) onto a context.
	 *
	 * @param {Object} g       2d context.
	 * @param {Object} sheet   Scene sheet.
	 * @param {Object} opts    `{ w, h, baseW, reveal }` reveal 0..1 slides in.
	 */
	paintSheet( g, sheet, { w, h, baseW, reveal = 1 } = {} ) {
		const p = this.params;
		if ( ! sheet.rings.length || reveal <= 0 ) {
			return;
		}
		const path = this.sheetPath( sheet, w, h, baseW );
		const slide = ( 1 - reveal ) * h * 0.1;
		g.save();
		g.globalAlpha = Math.min( 1, reveal * 1.4 );
		g.translate( 0, slide );
		const depth = 1 + ( p.shadow / 100 ) * h * 0.028;
		g.shadowColor = `rgba(10, 12, 20, ${ 0.16 + ( p.shadow / 100 ) * 0.3 })`;
		g.shadowBlur = 1 + ( p.soft / 100 ) * h * 0.02;
		g.shadowOffsetX = -( p.lightX / 100 ) * depth;
		g.shadowOffsetY = depth * 0.85;
		g.fillStyle = sheet.color;
		g.fill( path, 'evenodd' );
		g.shadowColor = 'transparent';
		// Paper grain, clipped to the sheet.
		if ( p.grain > 0 ) {
			g.clip( path, 'evenodd' );
			g.globalAlpha = ( p.grain / 100 ) * 0.16 * Math.min( 1, reveal );
			g.globalCompositeOperation = 'overlay';
			const pat = g.createPattern( this.grain, 'repeat' );
			g.fillStyle = pat;
			g.fillRect( 0, -slide - h * 0.1, w, h * 1.3 );
		}
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
			const cy = h * 0.34;
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

	/** Draw the whole scene onto the live canvas. */
	render( { reveals = null, selected = null } = {} ) {
		const g = this.ctx;
		const { w, h } = this;
		if ( ! this.scene ) {
			return;
		}
		this.paintBackdrop( g, w, h );
		const sheets = this.allSheets();
		sheets.forEach( ( sheet, i ) => {
			this.paintSheet( g, sheet, {
				w,
				h,
				baseW: w,
				reveal: reveals ? reveals[ i ] : 1,
			} );
		} );
		if ( selected ) {
			const obj = this.objectPath( selected );
			g.save();
			g.strokeStyle = 'rgba(59, 102, 255, 0.95)';
			g.lineWidth = Math.max( 1.5, w / 420 );
			g.setLineDash( [ 6, 5 ] );
			if ( obj ) {
				g.stroke( obj.path );
				if ( obj.bbox ) {
					// A light box around the object as a grab hint.
					g.setLineDash( [ 2, 4 ] );
					g.globalAlpha = 0.5;
					g.strokeRect(
						obj.bbox.x0 + obj.sheet.sheet.dx * w - 4,
						obj.bbox.y0 + obj.sheet.sheet.dy * h - 4,
						obj.bbox.x1 - obj.bbox.x0 + 8,
						obj.bbox.y1 - obj.bbox.y0 + 8
					);
				}
			} else {
				const sel = sheets.find( ( s ) => s.sheet.id === selected );
				if ( sel && sel.rings.length ) {
					g.stroke( this.sheetPath( sel ), 'evenodd' );
				}
			}
			g.restore();
		}
	}

	/**
	 * What is under the pointer: an OBJECT first (its own shape, not
	 * the paper it sits on), otherwise the sheet whose paper covers the
	 * point. This is the whole difference between grabbing the bird and
	 * grabbing the entire sheet.
	 *
	 * @param {number} x Canvas x.
	 * @param {number} y Canvas y.
	 * @return {Object|null} `{ type: 'object'|'sheet', sheet, object }`.
	 */
	hitAt( x, y ) {
		const sheets = this.allSheets();
		for ( let i = sheets.length - 1; i >= 0; i-- ) {
			const s = sheets[ i ];
			if ( '__frame' === s.sheet.id ) {
				continue;
			}
			const ox = x - s.sheet.dx * this.w;
			const oy = y - s.sheet.dy * this.h;
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
				const obj = s.sheet.objects.find( ( o ) => o.id === shape.id );
				if ( ! obj ) {
					continue;
				}
				// Inside the box is enough for small things; big ones
				// test their real outline so a click lands honestly.
				const big = bb.x1 - bb.x0 > this.w * 0.25;
				if ( ! big || this.shapeHit( shape, ox, oy ) ) {
					return { type: 'object', sheet: s.sheet, object: obj };
				}
			}
		}
		for ( let i = sheets.length - 1; i >= 0; i-- ) {
			const s = sheets[ i ];
			if ( '__frame' === s.sheet.id ) {
				continue;
			}
			if (
				s.rings.length &&
				this.ctx.isPointInPath( this.sheetPath( s ), x, y, 'evenodd' )
			) {
				return { type: 'sheet', sheet: s.sheet, object: null };
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
		for ( const s of this.allSheets() ) {
			const shape = s.shapes.find( ( x ) => x.id === objId );
			if ( ! shape ) {
				continue;
			}
			const p = new Path2D();
			for ( const stamp of shape.stamps ) {
				for ( const ring of stamp ) {
					p.moveTo(
						ring[ 0 ][ 0 ] + s.sheet.dx * this.w,
						ring[ 0 ][ 1 ] + s.sheet.dy * this.h
					);
					for ( let i = 1; i < ring.length; i++ ) {
						p.lineTo(
							ring[ i ][ 0 ] + s.sheet.dx * this.w,
							ring[ i ][ 1 ] + s.sheet.dy * this.h
						);
					}
					p.closePath();
				}
			}
			return { path: p, bbox: shape.bbox, sheet: s };
		}
		return null;
	}

	/**
	 * High-res still. Rebuilds the scene at the target size so the
	 * millimeter guarantees hold at print resolution too.
	 */
	still( w, h, params = this.params ) {
		const scene = buildScene( params, this.buildCtx( w, h, params ) );
		const c = document.createElement( 'canvas' );
		c.width = w;
		c.height = h;
		const g = c.getContext( '2d' );
		this.paintBackdrop( g, w, h, params );
		for ( const sheet of this.allSheets( scene ) ) {
			this.paintSheet( g, sheet, { w, h, baseW: w } );
		}
		return c.toDataURL( 'image/png' );
	}

	/**
	 * Per-sheet transparent PNGs at document size - the insert gives
	 * every paper layer its own editable editor layer.
	 */
	sheetImages( w, h, params = this.params ) {
		const scene = buildScene( params, this.buildCtx( w, h, params ) );
		const out = [];
		for ( const sheet of this.allSheets( scene ) ) {
			const c = document.createElement( 'canvas' );
			c.width = w;
			c.height = h;
			const g = c.getContext( '2d' );
			this.paintSheet( g, sheet, { w, h, baseW: w } );
			out.push( {
				sheet,
				src: c.toDataURL( 'image/png' ),
			} );
		}
		return { images: out, scene };
	}

	/**
	 * Cutting SVGs, one per sheet, real-world sized: the viewBox is in
	 * millimeters of the chosen cut width.
	 */
	cutSvgs( params = this.params, res = 1600 ) {
		const w = res;
		const h = Math.round( ( res * this.h ) / this.w );
		const scene = buildScene( params, this.buildCtx( w, h, params ) );
		const mmW = params.cutWidth * 10;
		const mmH = ( mmW * h ) / w;
		const files = [];
		const sheets = this.allSheets( scene );
		sheets.forEach( ( sheet, i ) => {
			if ( ! sheet.rings.length ) {
				return;
			}
			const rings = scaleRings( sheet.rings, mmW / w );
			const d = ringsToPath( rings, 2 );
			files.push( {
				name: `layer-${ String( i + 1 ).padStart( 2, '0' ) }-${ sheet.sheet.base }.svg`,
				data:
					`<svg xmlns="http://www.w3.org/2000/svg" width="${ mmW }mm" height="${ mmH.toFixed( 1 ) }mm" viewBox="0 0 ${ mmW } ${ mmH.toFixed( 1 ) }">\n` +
					`<path d="${ d }" fill="${ sheet.color }" fill-rule="evenodd" stroke="none"/>\n` +
					`</svg>\n`,
				color: sheet.color,
				kind: sheet.sheet.base,
				pieces: sheet.pieces,
			} );
		} );
		return { files, mmW, mmH, sheets };
	}

	/**
	 * Record the reveal: sheets slide in back to front, then hold.
	 *
	 * @param {Object} bridgeVideo `bridge.video`.
	 * @return {Promise<Blob>} The recording.
	 */
	recordReveal( bridgeVideo ) {
		const sheets = this.allSheets();
		const per = 0.55;
		const total = 1.2 + sheets.length * per;
		const rec = bridgeVideo.recordCanvas( this.canvas, { fps: 30 } );
		return new Promise( ( resolve, reject ) => {
			const t0 = performance.now();
			const step = () => {
				const t = ( performance.now() - t0 ) / 1000;
				const reveals = sheets.map( ( s, i ) => {
					const local = ( t - i * per * 0.7 ) / per;
					const e = clamp01( local );
					return 1 - Math.pow( 1 - e, 3 );
				} );
				this.render( { reveals } );
				if ( t < total ) {
					requestAnimationFrame( step );
				} else {
					this.render();
					setTimeout( () => {
						rec.stop();
						rec.blob.then( resolve, reject );
					}, 400 );
				}
			};
			requestAnimationFrame( step );
		} );
	}
}
