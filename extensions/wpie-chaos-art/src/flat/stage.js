/**
 * The flat stage: the surface the society paints on.
 *
 * Marks arrive as commands and are drawn step by step while the world's
 * warped clock runs, so the live view shows strokes being made. Brush
 * commands go through the editor's own engine (flat/paint.js); the own
 * marks (flat/marks.js) cover what no brush does - geometry, torn paper,
 * op lines. The surface is painted at picture resolution, so it IS the
 * export; the log only remembers what happened.
 *
 * `createCanvas( w, h )` is injected: the browser or node-canvas.
 */

import { makeTips } from './tips.js';
import { prepareMark } from './marks.js';
import { makePainter } from './paint.js';
import { SenseMap } from './senses.js';
import { css } from './palette2d.js';

const TIP_SEED = 7;

export class FlatStage {
	constructor( {
		createCanvas,
		aspect = 1.5,
		height = 1100,
		width,
		kit = null,
	} ) {
		this.createCanvas = createCanvas;
		this.kit = kit;
		this.aspect = aspect;
		this.H = Math.max( 1, Math.round( height ) );
		this.W = Math.max( 1, Math.round( width ?? height * aspect ) );
		this.S = this.H;
		this.canvas = createCanvas( this.W, this.H );
		this.ctx = this.canvas.getContext( '2d' );
		this.tips = makeTips( createCanvas, TIP_SEED );
		this.log = [];
		this.pending = [];
		this.ground = null;
		this.groundRgb = [ 0.95, 0.94, 0.9 ];
		this.senses = new SenseMap( aspect, 36 );
		this.sampler = createCanvas( this.senses.cols, this.senses.rows );
		this.lightAngle = -2.2;
		this.marks = 0;
		this.dirtySince = 0;
		// The editor's brush engine, when the host hands it over: brush
		// and wet commands go through it, everything else is own marks.
		this.painter = makePainter( {
			kit,
			createCanvas,
			surface: this.canvas,
			S: this.S,
			aspect,
		} );
	}

	/** Paint the ground: a tone, a paper, an optional soft wash. */
	setGround( spec ) {
		this.ground = spec;
		this.groundRgb = spec.color.slice();
		const g = this.ctx;
		g.globalCompositeOperation = 'source-over';
		g.globalAlpha = 1;
		g.fillStyle = css( spec.color );
		g.fillRect( 0, 0, this.W, this.H );
		if ( spec.posterPixels ) {
			// A tiny picture of the planes, scaled up soft: the poster.
			const pp = spec.posterPixels;
			const small = this.createCanvas( pp.width, pp.height );
			const sg = small.getContext( '2d' );
			const img = sg.createImageData( pp.width, pp.height );
			img.data.set( pp.data );
			sg.putImageData( img, 0, 0 );
			const k = Math.max( this.W / pp.width, this.H / pp.height );
			g.save();
			g.imageSmoothingEnabled = true;
			g.imageSmoothingQuality = 'high';
			g.globalAlpha =
				spec.imageAlpha === undefined ? 0.7 : spec.imageAlpha;
			g.drawImage(
				small,
				( this.W - pp.width * k ) / 2,
				( this.H - pp.height * k ) / 2,
				pp.width * k,
				pp.height * k
			);
			g.restore();
		}
		if ( spec.image ) {
			// The motif as underpainting: covering the sheet, quietened
			// toward the ground color so the marks still carry the picture.
			const im = spec.image;
			const iw = im.naturalWidth || im.width;
			const ih = im.naturalHeight || im.height;
			const k = Math.max( this.W / iw, this.H / ih );
			const dw = iw * k;
			const dh = ih * k;
			g.save();
			g.globalAlpha =
				spec.imageAlpha === undefined ? 0.75 : spec.imageAlpha;
			g.drawImage( im, ( this.W - dw ) / 2, ( this.H - dh ) / 2, dw, dh );
			g.restore();
		}
		if ( spec.wash ) {
			// A soft gradient across the ground: a sky, a dyed canvas.
			const a = spec.wash.angle || Math.PI / 2;
			const cx = this.W / 2;
			const cy = this.H / 2;
			const r = Math.max( this.W, this.H ) * 0.6;
			const grad = g.createLinearGradient(
				cx - Math.cos( a ) * r,
				cy - Math.sin( a ) * r,
				cx + Math.cos( a ) * r,
				cy + Math.sin( a ) * r
			);
			grad.addColorStop(
				0,
				css( spec.wash.from, spec.wash.alpha || 0.5 )
			);
			grad.addColorStop( 1, css( spec.wash.to, spec.wash.alpha || 0.5 ) );
			g.fillStyle = grad;
			g.fillRect( 0, 0, this.W, this.H );
		}
		if ( spec.grain ) {
			g.save();
			g.globalCompositeOperation = 'multiply';
			g.globalAlpha = Math.min( 1, spec.grain );
			g.fillStyle = g.createPattern(
				this.tips.paper( spec.paper || 'paper' ),
				'repeat'
			);
			g.fillRect( 0, 0, this.W, this.H );
			g.restore();
		}
		this.log.length = 0;
		this.pending.length = 0;
		this.marks = 0;
		this.senses = new SenseMap( this.aspect, this.senses.rows );
		this.sampleSenses();
		this.senses.rememberGround();
		this.senses.update( this.groundRgb );
	}

	env() {
		return {
			S: this.S,
			aspect: this.aspect,
			tips: this.tips,
			lightAngle: this.lightAngle,
		};
	}

	/**
	 * Accept a command. With a duration (world seconds) it is drawn
	 * progressively from `now`; without, at once.
	 */
	push( cmd, now = 0 ) {
		const prep =
			'brush' === cmd.type
				? this.painter.prepare( cmd )
				: prepareMark( cmd, this.env() );
		if ( ! prep ) {
			return false;
		}
		this.log.push( cmd );
		this.marks++;
		for ( const b of prep.bounds || [] ) {
			this.senses.note( b.x, b.y, Math.max( 0.01, b.w || 0.01 ) );
		}
		if ( cmd.duration > 0 && prep.steps > 1 ) {
			this.pending.push( {
				prep,
				done: 0,
				start: now,
				duration: cmd.duration,
			} );
		} else {
			for ( let i = 0; i < prep.steps; i++ ) {
				prep.draw( this.ctx, i );
			}
		}
		this.dirtySince++;
		return true;
	}

	/** Draw whatever the clock allows. Returns true when something was drawn. */
	advance( now ) {
		let drew = false;
		for ( let k = this.pending.length - 1; k >= 0; k-- ) {
			const p = this.pending[ k ];
			const frac = Math.min(
				1,
				Math.max( 0, ( now - p.start ) / p.duration )
			);
			const target = Math.min(
				p.prep.steps,
				Math.ceil( frac * p.prep.steps )
			);
			while ( p.done < target ) {
				p.prep.draw( this.ctx, p.done );
				p.done++;
				drew = true;
			}
			if ( p.done >= p.prep.steps ) {
				this.pending.splice( k, 1 );
			}
		}
		return drew;
	}

	/** Every pending stroke, finished now. */
	finishAll() {
		for ( const p of this.pending ) {
			while ( p.done < p.prep.steps ) {
				p.prep.draw( this.ctx, p.done );
				p.done++;
			}
		}
		this.pending.length = 0;
	}

	/** Wall time passes: wet paint flows, dries and bakes in. */
	tick( dtMs, speed = 1 ) {
		this.painter.tick( dtMs, speed );
	}

	/** Refresh the sense map from the surface (cheap: a tiny downsample). */
	sampleSenses() {
		const s = this.senses;
		const g = this.sampler.getContext( '2d' );
		g.drawImage( this.canvas, 0, 0, s.cols, s.rows );
		this.painter.overlays( g, s.cols / this.W, s.rows / this.H );
		const data = g.getImageData( 0, 0, s.cols, s.rows ).data;
		for ( let i = 0; i < s.cols * s.rows; i++ ) {
			s.rgb[ i * 3 ] = data[ i * 4 ] / 255;
			s.rgb[ i * 3 + 1 ] = data[ i * 4 + 1 ] / 255;
			s.rgb[ i * 3 + 2 ] = data[ i * 4 + 2 ] / 255;
		}
		s.update( this.groundRgb );
		this.dirtySince = 0;
		return s;
	}

	/** The finish over a target context of size w x h: paper, vignette. */
	finish( g, w, h, spec ) {
		if ( ! spec ) {
			return;
		}
		if ( spec.paper ) {
			g.save();
			g.globalCompositeOperation = 'multiply';
			g.globalAlpha = spec.paper;
			g.fillStyle = g.createPattern(
				this.tips.paper(
					spec.paperKind ||
						( this.ground && this.ground.paper ) ||
						'paper'
				),
				'repeat'
			);
			g.fillRect( 0, 0, w, h );
			g.restore();
		}
		if ( spec.vignette ) {
			g.save();
			g.globalCompositeOperation = 'multiply';
			const grad = g.createRadialGradient(
				w / 2,
				h / 2,
				Math.min( w, h ) * 0.35,
				w / 2,
				h / 2,
				Math.max( w, h ) * 0.75
			);
			grad.addColorStop( 0, 'rgba(0,0,0,0)' );
			grad.addColorStop(
				1,
				`rgba(0,0,0,${ Math.min( 0.6, spec.vignette ).toFixed( 3 ) })`
			);
			g.fillStyle = grad;
			g.fillRect( 0, 0, w, h );
			g.restore();
		}
	}

	/**
	 * The surface finishes that are drawn, not blended: varnish gloss,
	 * craquelure, dust and a deckle edge. Built once per size and spec
	 * into an overlay, so nothing flickers from frame to frame.
	 */
	finishOverlay( w, h, spec ) {
		const key = [
			w,
			h,
			spec.seed,
			spec.gloss,
			spec.craquelure,
			spec.dust,
			spec.deckle,
		].join( '|' );
		if ( this._finishKey === key ) {
			return this._finishCanvas;
		}
		const c = this.createCanvas( w, h );
		const g = c.getContext( '2d' );
		let seed = ( spec.seed || 1 ) >>> 0;
		const rng = () => {
			seed = ( Math.imul( seed, 1664525 ) + 1013904223 ) >>> 0;
			return seed / 4294967296;
		};
		if ( spec.gloss ) {
			// Varnish: a soft diagonal sheen, as a window would lay it.
			const a = -0.6 + rng() * 0.4;
			const grad = g.createLinearGradient(
				0,
				0,
				w * Math.cos( a ) * 1.2,
				h + w * Math.sin( a )
			);
			grad.addColorStop( 0, 'rgba(255,255,255,0)' );
			grad.addColorStop(
				0.35 + rng() * 0.2,
				`rgba(255,255,255,${ ( 0.12 * spec.gloss ).toFixed( 3 ) })`
			);
			grad.addColorStop( 0.55 + rng() * 0.2, 'rgba(255,255,255,0)' );
			g.fillStyle = grad;
			g.fillRect( 0, 0, w, h );
		}
		if ( spec.craquelure ) {
			// Cracks: random walks that branch, dark and thin.
			const n = Math.round( 40 + spec.craquelure * 80 );
			g.strokeStyle = `rgba(20,14,10,${ (
				0.1 +
				spec.craquelure * 0.12
			).toFixed( 3 ) })`;
			g.lineWidth = Math.max( 0.6, w / 1400 );
			g.lineCap = 'round';
			const walk = ( x, y, ang, len ) => {
				g.beginPath();
				g.moveTo( x, y );
				for ( let k = 0; k < len; k++ ) {
					ang += ( rng() - 0.5 ) * 1.1;
					x += Math.cos( ang ) * ( w / 120 );
					y += Math.sin( ang ) * ( w / 120 );
					g.lineTo( x, y );
					if ( rng() < 0.08 && len > 6 ) {
						walk(
							x,
							y,
							ang + ( rng() < 0.5 ? 1 : -1 ) * ( 0.8 + rng() ),
							Math.floor( len / 2 )
						);
						g.moveTo( x, y );
					}
				}
				g.stroke();
			};
			for ( let i = 0; i < n; i++ ) {
				walk(
					rng() * w,
					rng() * h,
					rng() * Math.PI * 2,
					6 + Math.floor( rng() * 16 )
				);
			}
		}
		if ( spec.dust ) {
			const n = Math.round( 200 + spec.dust * 500 );
			for ( let i = 0; i < n; i++ ) {
				const light = rng() < 0.7;
				g.fillStyle = light
					? `rgba(255,255,250,${ ( 0.25 + rng() * 0.35 ).toFixed(
							2
					  ) })`
					: `rgba(30,25,20,${ ( 0.15 + rng() * 0.25 ).toFixed(
							2
					  ) })`;
				const r = 0.4 + rng() * ( w / 900 );
				g.beginPath();
				g.arc( rng() * w, rng() * h, r, 0, Math.PI * 2 );
				g.fill();
			}
		}
		if ( spec.deckle ) {
			// A torn edge: the rim outside a noisy polygon shows the paper.
			const m = ( 0.012 + spec.deckle * 0.02 ) * Math.min( w, h );
			const pts = [];
			const steps = 90;
			for ( let i = 0; i < steps; i++ ) {
				const t = i / steps;
				let x;
				let y;
				if ( t < 0.25 ) {
					x = ( t / 0.25 ) * w;
					y = 0;
				} else if ( t < 0.5 ) {
					x = w;
					y = ( ( t - 0.25 ) / 0.25 ) * h;
				} else if ( t < 0.75 ) {
					x = w - ( ( t - 0.5 ) / 0.25 ) * w;
					y = h;
				} else {
					x = 0;
					y = h - ( ( t - 0.75 ) / 0.25 ) * h;
				}
				const inward = m * ( 0.4 + rng() * 0.9 );
				const dx = w / 2 - x;
				const dy = h / 2 - y;
				const L = Math.hypot( dx, dy ) || 1;
				pts.push( [
					x + ( dx / L ) * inward,
					y + ( dy / L ) * inward,
				] );
			}
			g.save();
			g.beginPath();
			g.rect( 0, 0, w, h );
			g.moveTo( pts[ 0 ][ 0 ], pts[ 0 ][ 1 ] );
			for ( let i = pts.length - 1; i >= 0; i-- ) {
				g.lineTo( pts[ i ][ 0 ], pts[ i ][ 1 ] );
			}
			g.closePath();
			g.fillStyle = css(
				this.groundRgb
					? this.groundRgb.map( ( v ) =>
							Math.min( 1, v * 0.9 + 0.08 )
					  )
					: [ 0.94, 0.93, 0.9 ]
			);
			g.fill( 'evenodd' );
			g.restore();
		}
		this._finishKey = key;
		this._finishCanvas = c;
		return c;
	}

	/** Draw the surface into a target (display, thumbnail), wet paint and finish included. */
	render( g, w, h, finishSpec = null ) {
		g.drawImage( this.canvas, 0, 0, w, h );
		this.painter.overlays( g, w / this.W, h / this.H );
		if ( finishSpec ) {
			this.finish( g, w, h, finishSpec );
			if (
				finishSpec.gloss ||
				finishSpec.craquelure ||
				finishSpec.dust ||
				finishSpec.deckle
			) {
				g.drawImage( this.finishOverlay( w, h, finishSpec ), 0, 0 );
			}
		}
	}

	/** Everything pending and wet, settled into the surface now. */
	settle() {
		this.finishAll();
		this.painter.settle();
	}

	dispose() {
		this.painter.dispose();
	}
}
