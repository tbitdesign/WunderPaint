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
import { markShare, splitOutside, CALM } from './clear.js';
import { makePainter } from './paint.js';
import { SenseMap } from './senses.js';
import { css } from './palette2d.js';

const TIP_SEED = 7;
// A broad stroke is styled in one piece of work (flat/paint.js). In the
// dialog at most one of them runs in a frame, and after it the next waits
// at least as long as it took (up to REST_MAX), so a normal frame always
// comes in between: the dialog keeps answering, the sheet keeps moving.
const REST_MAX = 250; // ms
const now = () =>
	'undefined' !== typeof performance ? performance.now() : Date.now();

// The soft edge of a reserved zone, in frame units (sheet heights).
const RESERVE_FEATHER = 0.035;

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
		// Set by the dialog: broad strokes wait their turn between frames.
		// Off (proof sheets, tests) they are styled the moment they are
		// needed, exactly as before.
		this.realtime = false;
		this.broad = [];
		this.restUntil = 0;
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
		this.paintGround( this.ctx, spec );
		this.log.length = 0;
		this.pending.length = 0;
		this.broad.length = 0;
		this.marks = 0;
		this.senses = new SenseMap( this.aspect, this.senses.rows );
		// A new ground keeps the page's text zones (flat/clear.js).
		this.senses.blocked = this.clear || [];
		this.calmLayer = null;
		this.sampleSenses();
		this.senses.rememberGround();
		this.senses.update( this.groundRgb );
	}

	/** The ground itself onto any context of the sheet's size. */
	paintGround( g, spec ) {
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
	}

	/**
	 * The page's text, reserved (flat/clear.js) the way a watercolorist
	 * reserves the white of the paper: from now on the zones show the
	 * sheet as it stands - ground and the softened underpainting - with
	 * a soft edge, whatever lands there later. Every mark type, wet paint
	 * included, on the stage, in every still and in the painters' senses.
	 * `fromGround` reserves the bare ground instead (zones switched on in
	 * the middle of a piece). No zones, no reserve.
	 */
	reserve( fromGround = false ) {
		const zones = this.clear && this.clear.length ? this.clear : null;
		if ( ! zones ) {
			this.calmLayer = null;
			return;
		}
		const ref = this.createCanvas( this.W, this.H );
		const rg = ref.getContext( '2d' );
		if ( fromGround && this.ground ) {
			this.paintGround( rg, this.ground );
		} else {
			rg.drawImage( this.canvas, 0, 0 );
			this.painter.overlays( rg, 1, 1 );
		}
		const c = this.createCanvas( this.W, this.H );
		const g = c.getContext( '2d' );
		// The mask: the zones, their edge blurred inward (a shadow cast
		// from a rectangle drawn off the canvas - portable everywhere).
		const f = Math.max( 2, RESERVE_FEATHER * this.S );
		const off = this.W * 2 + f * 4;
		g.save();
		g.shadowColor = '#000';
		g.shadowBlur = f;
		g.shadowOffsetX = off;
		g.fillStyle = '#000';
		for ( const z of zones ) {
			const x0 = z.x0 * this.S + f * 0.6;
			const y0 = z.y0 * this.S + f * 0.6;
			const x1 = z.x1 * this.S - f * 0.6;
			const y1 = z.y1 * this.S - f * 0.6;
			if ( x1 > x0 && y1 > y0 ) {
				g.fillRect( x0 - off, y0, x1 - x0, y1 - y0 );
			}
		}
		g.restore();
		g.globalCompositeOperation = 'source-in';
		g.drawImage( ref, 0, 0 );
		this.calmLayer = c;
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
	 * progressively from `at`; without, at once.
	 */
	push( cmd, at = 0 ) {
		const zones = this.clear && this.clear.length ? this.clear : null;
		// The page's text (flat/clear.js): a path that crosses it is cut
		// there - its outside runs land, each running out at the cut.
		// Underpainting (calm) may cross, softened, and is not cut.
		if ( zones && ! cmd.calm ) {
			if ( Array.isArray( cmd.pts ) && cmd.pts.length > 1 ) {
				const runs = splitOutside( cmd.pts, zones );
				if ( runs.length !== 1 || runs[ 0 ] !== cmd.pts ) {
					let any = false;
					for ( const run of runs ) {
						any = this._land( { ...cmd, pts: run }, at ) || any;
					}
					return any;
				}
			} else if ( Array.isArray( cmd.lines ) && cmd.lines.length ) {
				const lines = cmd.lines.flatMap( ( l ) =>
					splitOutside( l, zones )
				);
				if (
					lines.length !== cmd.lines.length ||
					lines.some( ( l, i ) => l !== cmd.lines[ i ] )
				) {
					return lines.length
						? this._land( { ...cmd, lines }, at )
						: false;
				}
			}
		}
		return this._land( cmd, at );
	}

	/** One mark onto the sheet (push does the cutting). */
	_land( cmd, at ) {
		const zones = this.clear && this.clear.length ? this.clear : null;
		// A brush stroke is judged by its points BEFORE it is prepared -
		// preparing claims wet paper.
		if (
			zones &&
			'brush' === cmd.type &&
			markShare( cmd.pts, zones ) > 0.5
		) {
			if ( ! cmd.calm ) {
				return false;
			}
			cmd.opacity =
				( cmd.opacity === undefined ? 1 : cmd.opacity ) * CALM;
		}
		let prep =
			'brush' === cmd.type
				? this.painter.prepare( cmd )
				: prepareMark( cmd, this.env() );
		if ( ! prep ) {
			return false;
		}
		// Any other mark by the ground it covers (preparing it is pure).
		if (
			zones &&
			'brush' !== cmd.type &&
			markShare( prep.bounds, zones ) > 0.5
		) {
			if ( ! cmd.calm ) {
				return false;
			}
			cmd.alpha = ( cmd.alpha === undefined ? 1 : cmd.alpha ) * CALM;
			prep = prepareMark( cmd, this.env() );
			if ( ! prep ) {
				return false;
			}
		}
		this.log.push( cmd );
		this.marks++;
		for ( const b of prep.bounds || [] ) {
			this.senses.note( b.x, b.y, Math.max( 0.01, b.w || 0.01 ) );
		}
		if ( prep.heavy && this.realtime && ! prep.ready() ) {
			// Its turn comes between frames; its reveal starts then.
			const entry = {
				prep,
				done: 0,
				start: at,
				duration: Math.max( cmd.duration || 0, 0.001 ),
				waiting: true,
			};
			this.pending.push( entry );
			this.broad.push( entry );
		} else if ( cmd.duration > 0 && prep.steps > 1 ) {
			this.pending.push( {
				prep,
				done: 0,
				start: at,
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

	/** Broad strokes still waiting to be styled. */
	backlog() {
		return this.broad.length;
	}

	/** At most one broad stroke per frame, and a rest after it. */
	styleNext( at ) {
		if ( ! this.broad.length || now() < this.restUntil ) {
			return;
		}
		const p = this.broad.shift();
		const t0 = now();
		p.prep.run();
		const took = now() - t0;
		this.restUntil = now() + Math.min( REST_MAX, took );
		p.waiting = false;
		p.start = at;
	}

	/** Draw whatever the clock allows. Returns true when something was drawn. */
	advance( at ) {
		this.styleNext( at );
		let drew = false;
		for ( let k = this.pending.length - 1; k >= 0; k-- ) {
			const p = this.pending[ k ];
			if ( p.waiting ) {
				continue;
			}
			const frac = Math.min(
				1,
				Math.max( 0, ( at - p.start ) / p.duration )
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
			p.waiting = false;
			while ( p.done < p.prep.steps ) {
				p.prep.draw( this.ctx, p.done );
				p.done++;
			}
		}
		this.pending.length = 0;
		this.broad.length = 0;
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
		if ( this.calmLayer ) {
			g.drawImage( this.calmLayer, 0, 0, s.cols, s.rows );
		}
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
		if ( this.calmLayer ) {
			g.drawImage( this.calmLayer, 0, 0, w, h );
		}
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
