/**
 * The flat engine: the society on a picture, in the browser.
 *
 * Same contract as the stage in space (engine.js) so the dialog can
 * hold either: mount / newWorld / start / stop / resume / impulse /
 * recast / applyLook / ring / captureNext / thumbUrl / renderStill /
 * painted / running / world / onFrame / dispose. Underneath, a
 * FlatSession (world, cast, stage) steps once per frame; the surface is
 * painted at picture resolution through the editor's brush engine
 * (bridge.paint) and shown scaled in the host.
 */

import { FlatSession } from './flat/session.js';
import { makeRing } from './core/ring.js';
import { makeCast, mixedVoice } from './flat/casting.js';

const SNAP_EVERY = 2.5; // wall seconds
const SNAP_EDGE = 1280;
const ART_HEIGHT = 1400; // px, the surface is the picture
// The society's clock against the wall clock. Thomas on the first
// evening (02.09.): the old 300 % should be the new normal, nobody
// wants to wait for a picture - so a sitting of a hundred world seconds
// takes about twenty seconds to watch. The tempo dial multiplies on top.
const PACE = 5;

// The last pieces per school: their anlage and palette are not drawn
// again next time while there is a choice. Per browser, never sent.
const RECENT_KEY = 'wpie-chaos-recent';
const RECENT_KEEP = 3;

function readRecent( schoolId ) {
	try {
		const all = JSON.parse( localStorage.getItem( RECENT_KEY ) || '{}' );
		const list = Array.isArray( all[ schoolId ] ) ? all[ schoolId ] : [];
		return {
			archetypes: list.map( ( r ) => r.a ).filter( Boolean ),
			palettes: list.map( ( r ) => r.p ).filter( Boolean ),
		};
	} catch ( e ) {
		return null;
	}
}

function writeRecent( schoolId, rec ) {
	try {
		const all = JSON.parse( localStorage.getItem( RECENT_KEY ) || '{}' );
		const list = Array.isArray( all[ schoolId ] ) ? all[ schoolId ] : [];
		list.push( rec );
		all[ schoolId ] = list.slice( -RECENT_KEEP );
		localStorage.setItem( RECENT_KEY, JSON.stringify( all ) );
	} catch ( e ) {}
}

const createCanvas = ( w, h ) => {
	const c = document.createElement( 'canvas' );
	c.width = Math.max( 1, Math.ceil( w ) );
	c.height = Math.max( 1, Math.ceil( h ) );
	return c;
};

export class FlatEngine {
	constructor( { kit = null, effects = null } = {} ) {
		this.kit = kit;
		this.effects = effects;
		this.session = null;
		this.world = null;
		this.running = false;
		this.ring = makeRing( 48 );
		this.onFrame = null;
		this.aspect = 1.5;
		this.canvas = null;
		this.host = null;
		this._raf = 0;
		this._last = 0;
		this._snapAcc = 0;
		this._capNext = null;
		this.snapCanvas = createCanvas( 2, 2 );
		this.finishSpec = null;
		this.settings = null;
		this._pool = null;
		// What the visitor did, for the overlay: the hand's halo, a burst
		// ring, the trace of a drawn stroke. Wall-clocked.
		this.fx = { burst: null, trace: null };
		this.calls = 0;
	}

	mount( host, aspect ) {
		this.host = host;
		this.aspect = aspect || 1.5;
		this.canvas = createCanvas( 2, 2 );
		this.canvas.className = 'wpiechaos-flat';
		this.canvas.style.display = 'block';
		this.canvas.style.width = '100%';
		this.canvas.style.height = '100%';
		host.appendChild( this.canvas );
		this._ro =
			'undefined' !== typeof ResizeObserver
				? new ResizeObserver( () => this.resize() )
				: null;
		if ( this._ro ) {
			this._ro.observe( host );
		}
		this.resize();
		this.bindPointer();
		this._last = performance.now();
		this.loop();
	}

	resize() {
		if ( ! this.host || ! this.canvas ) {
			return;
		}
		const r = this.host.getBoundingClientRect();
		const dpr = Math.min( window.devicePixelRatio || 1, 2 );
		let w = Math.max( 2, Math.floor( r.width ) );
		let h = Math.max( 2, Math.floor( w / this.aspect ) );
		if ( h > r.height && r.height > 2 ) {
			h = Math.floor( r.height );
			w = Math.floor( h * this.aspect );
		}
		this.canvas.style.width = w + 'px';
		this.canvas.style.height = h + 'px';
		this.canvas.width = Math.round( w * dpr );
		this.canvas.height = Math.round( h * dpr );
		this.dirty = true;
	}

	/** A new piece: the entropy pool draws its world, the surface starts blank. */
	newWorld( settings, pool ) {
		this.settings = settings;
		this._pool = pool;
		if ( this.session ) {
			this.session.stage.dispose();
		}
		this.session = new FlatSession( {
			createCanvas,
			kit: this.kit,
			effects: this.effects,
			aspect: this.aspect,
			height: ART_HEIGHT,
			school: settings.school,
			params: settings.params,
			words: pool.words,
			recent: readRecent( settings.school.id ),
			motif: settings.motif || null,
			mixed: !! settings.mixed,
			colors:
				settings.params.colors &&
				settings.params.colors.length > 1 &&
				! settings.params.autoPalette
					? settings.params.colors
					: null,
		} );
		this.world = this.session.world;
		this.world.cursor.mode = 'attract';
		writeRecent( settings.school.id, {
			a: this.world.plan.archetype,
			p: this.world.paletteMode,
		} );
		this.finishSpec = this.session.finishSpec();
		this.ring.clear();
		this._snapAcc = 0;
		this.dirty = true;
	}

	/**
	 * Change the language mid-piece: the painters speak `school` from
	 * the next mark on, plan, palette and ground stay. With `mixed`
	 * every second painter takes a school of their own instead.
	 */
	switchSchool( school, { mixed = false } = {} ) {
		const w = this.world;
		if ( ! w || ! this.session ) {
			return false;
		}
		w.mixed = mixed;
		if ( school ) {
			w.voice = school;
		}
		for ( const a of this.session.actors ) {
			if ( a.isPainter ) {
				a.voice = mixed ? mixedVoice( w, school || w.school ) : null;
				if ( mixed && w.rng() < 0.4 ) {
					a.voice = null;
				}
			}
		}
		w.chronicle.push( {
			e: 'school',
			t: w.time,
			id: mixed ? 'all' : ( school || w.school ).id,
		} );
		// A change of mind wakes the piece and opens a new sitting's worth of marks.
		w.phaseFloorUntil = Math.max( w.phaseFloorUntil, w.time + 8 );
		return true;
	}

	/** The look dials of the stage in space have no meaning here; the finish is the school's. */
	applyLook() {}

	start() {
		if ( ! this.session ) {
			return;
		}
		this.running = true;
	}

	stop() {
		this.running = false;
	}

	resume() {
		if ( this.session ) {
			this.running = true;
		}
	}

	/** A jolt through the piece: an impulse the next gestures feel. */
	impulse() {
		const w = this.world;
		if ( ! w ) {
			return;
		}
		// The button: a burst of color somewhere on the sheet.
		const at = w.burstAt( [
			0.1 + w.rng() * ( w.aspect - 0.2 ),
			0.1 + w.rng() * 0.8,
		] );
		this.fx.burst = { p: at, t0: performance.now() };
	}

	/** The density dial moved: the cast follows on the next beat. */
	recast() {
		const s = this.session;
		if ( ! s ) {
			return;
		}
		const painters = s.actors.filter( ( a ) => a.isPainter );
		const want = makeCast(
			s.world,
			s.school,
			s.world.params.density
		).filter( ( a ) => a.isPainter ).length;
		if ( want > painters.length ) {
			s.world.casting.push(
				...new Array( want - painters.length ).fill( { type: 'hire' } )
			);
		} else if ( want < painters.length ) {
			s.world.casting.push(
				...new Array( painters.length - want ).fill( {
					type: 'retire',
				} )
			);
		}
	}

	loop() {
		this._raf = requestAnimationFrame( () => this.loop() );
		const now = performance.now();
		const dt = Math.min( 0.1, ( now - this._last ) / 1000 );
		this._last = now;
		let needSnap = false;
		if ( this.session && this.running ) {
			this.session.step( dt * PACE );
			this.dirty = true;
			this._snapAcc += dt;
			if ( this._snapAcc >= SNAP_EVERY ) {
				this._snapAcc = 0;
				needSnap = true;
			}
		} else if ( this.session && this.session.stage.painter.hasWet() ) {
			// Paused, but the wet paint keeps drying on the sheet.
			this.session.stage.tick( dt * 1000, 1 );
			this.dirty = true;
		}
		if ( this.dirty && this.canvas ) {
			this.present();
			this.dirty = false;
		}
		if ( needSnap ) {
			this.snapshot();
		}
		if ( this._capNext ) {
			const cb = this._capNext;
			this._capNext = null;
			cb( this.thumbUrl( 640 ) );
		}
		if ( this.onFrame ) {
			this.onFrame();
		}
	}

	present() {
		const g = this.canvas.getContext( '2d' );
		if ( ! this.session ) {
			g.fillStyle = '#1c1d22';
			g.fillRect( 0, 0, this.canvas.width, this.canvas.height );
			return;
		}
		g.setTransform( 1, 0, 0, 1, 0, 0 );
		g.imageSmoothingEnabled = true;
		g.imageSmoothingQuality = 'high';
		this.session.stage.render(
			g,
			this.canvas.width,
			this.canvas.height,
			this.finishSpec
		);
		this.drawGestures( g );
	}

	/** The visitor's gestures, drawn over the picture, never into it. */
	drawGestures( g ) {
		const w = this.world;
		const W = this.canvas.width;
		const H = this.canvas.height;
		const sx = W / w.aspect;
		const now = performance.now();
		g.save();
		g.lineCap = 'round';
		g.lineJoin = 'round';
		if ( w.cursor.active && this.running ) {
			// The hand: a soft halo where the painters gather.
			const x = w.cursor.point[ 0 ] * sx;
			const y = w.cursor.point[ 1 ] * H;
			const r = 0.09 * H;
			const grad = g.createRadialGradient( x, y, r * 0.2, x, y, r );
			grad.addColorStop( 0, 'rgba(255,255,255,0.16)' );
			grad.addColorStop( 1, 'rgba(255,255,255,0)' );
			g.fillStyle = grad;
			g.beginPath();
			g.arc( x, y, r, 0, Math.PI * 2 );
			g.fill();
			g.strokeStyle = 'rgba(255,255,255,0.45)';
			g.lineWidth = 1.5;
			g.beginPath();
			g.arc( x, y, r * 0.55, 0, Math.PI * 2 );
			g.stroke();
		}
		const b = this.fx.burst;
		if ( b ) {
			// A burst: a ring that grows and fades over 1.6 s.
			const t = ( now - b.t0 ) / 1600;
			if ( t >= 1 ) {
				this.fx.burst = null;
			} else {
				const x = b.p[ 0 ] * sx;
				const y = b.p[ 1 ] * H;
				const r = ( 0.02 + t * 0.14 ) * H;
				g.strokeStyle = `rgba(255,255,255,${ (
					0.7 *
					( 1 - t )
				).toFixed( 3 ) })`;
				g.lineWidth = 3 * ( 1 - t ) + 1;
				g.beginPath();
				g.arc( x, y, r, 0, Math.PI * 2 );
				g.stroke();
			}
		}
		const tr = this.fx.trace;
		if ( tr ) {
			// A drawn stroke: its trace, fading while the painters answer it.
			const t = Math.max( 0, ( now - tr.t0 ) / 2800 );
			if ( t >= 1 ) {
				this.fx.trace = null;
			} else {
				g.strokeStyle = `rgba(255,255,255,${ (
					0.75 *
					( 1 - t )
				).toFixed( 3 ) })`;
				g.lineWidth = 4 * ( 1 - t ) + 1;
				g.beginPath();
				tr.pts.forEach( ( p, i ) => {
					if ( i ) {
						g.lineTo( p[ 0 ] * sx, p[ 1 ] * H );
					} else {
						g.moveTo( p[ 0 ] * sx, p[ 1 ] * H );
					}
				} );
				g.stroke();
			}
		}
		g.restore();
	}

	/* ------------------------------ pointer ------------------------------- */

	bindPointer() {
		const c = this.canvas;
		const toFrame = ( e ) => {
			const r = c.getBoundingClientRect();
			return [
				( ( e.clientX - r.left ) / Math.max( 1, r.width ) ) *
					this.aspect,
				( e.clientY - r.top ) / Math.max( 1, r.height ),
			];
		};
		c.addEventListener( 'pointermove', ( e ) => {
			if ( this.world ) {
				this.world.cursor.active = true;
				this.world.cursor.point = toFrame( e );
			}
		} );
		c.addEventListener( 'pointerleave', () => {
			if ( this.world ) {
				this.world.cursor.active = false;
			}
		} );
		// A press: a click is an impulse, a drag is a call the society
		// answers in its own words.
		let path = null;
		c.addEventListener( 'pointerdown', ( e ) => {
			if ( ! this.world ) {
				return;
			}
			path = [ toFrame( e ) ];
			if ( c.setPointerCapture ) {
				try {
					c.setPointerCapture( e.pointerId );
				} catch ( err ) {}
			}
		} );
		c.addEventListener( 'pointermove', ( e ) => {
			if ( path && this.world ) {
				path.push( toFrame( e ) );
				// While dragging the trace stays fully visible.
				this.fx.trace = { pts: path, t0: performance.now() + 2800 };
			}
		} );
		const release = ( e ) => {
			if ( ! path || ! this.world ) {
				path = null;
				return;
			}
			const pts = path;
			path = null;
			if ( pts.length >= 6 && this.world.answerCall ) {
				const m = this.world.answerCall( pts );
				if ( m ) {
					this.calls++;
					this.fx.trace = { pts, t0: performance.now() };
					return;
				}
			}
			// A click: a burst of color right here.
			const at = this.world.burstAt( toFrame( e ) );
			this.fx.burst = { p: at, t0: performance.now() };
		};
		c.addEventListener( 'pointerup', release );
		c.addEventListener( 'pointercancel', () => {
			path = null;
		} );
	}

	/* ------------------------------ snapshots ----------------------------- */

	captureNext( cb ) {
		this._capNext = cb;
	}

	/** The picture as it stands, composed at up to `edge` px, as a JPEG. */
	thumbUrl( edge ) {
		if ( ! this.session ) {
			return '';
		}
		const st = this.session.stage;
		const k = Math.min( 1, edge / Math.max( st.W, st.H ) );
		const c = this.snapCanvas;
		c.width = Math.max( 2, Math.round( st.W * k ) );
		c.height = Math.max( 2, Math.round( st.H * k ) );
		st.render( c.getContext( '2d' ), c.width, c.height, this.finishSpec );
		return c.toDataURL( 'image/jpeg', 0.86 );
	}

	snapshot() {
		if ( ! this.session ) {
			return;
		}
		const url = this.thumbUrl( SNAP_EDGE );
		this.ring.push( {
			url,
			w: this.snapCanvas.width,
			h: this.snapCanvas.height,
			wall: this.world ? this.world.wall : 0,
		} );
	}

	/** The picture at its own resolution: everything wet settled first. */
	renderStill() {
		if ( ! this.session ) {
			return { url: '', w: 0, h: 0 };
		}
		const st = this.session.stage;
		st.settle();
		const c = createCanvas( st.W, st.H );
		st.render( c.getContext( '2d' ), st.W, st.H, this.finishSpec );
		return { url: c.toDataURL( 'image/png' ), w: st.W, h: st.H };
	}

	painted() {
		return this.session ? this.session.painted : 0;
	}

	dispose() {
		cancelAnimationFrame( this._raf );
		this.running = false;
		if ( this._ro ) {
			this._ro.disconnect();
		}
		if ( this.session ) {
			this.session.stage.dispose();
		}
		if ( this.canvas && this.canvas.parentNode ) {
			this.canvas.parentNode.removeChild( this.canvas );
		}
		this.session = null;
		this.world = null;
	}
}
