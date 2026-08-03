/**
 * Pixel Blaster - the editor's easter egg.
 *
 * Five quick clicks on the logo and a little ship appears, with classic
 * arcade controls: arrow keys or WASD rotate and thrust (with inertia and
 * screen wrap, Asteroids style), Space or a mouse click fires a rocket
 * straight out of the nose. Whatever the rocket meets on its way - buttons,
 * menus, panels, the artwork - explodes with a flash, a shockwave ring,
 * smoke, sparks and a short screen shake.
 *
 * No screenshots, no html2canvas: the REAL UI destroys itself. Targets are
 * the live DOM elements; a hit only ever touches their inline transform and
 * opacity, so a restore is nothing but removing those styles - the document,
 * the layer stack and the undo history are never involved. The artwork is
 * the one true snapshot: the document canvas is copied once into an
 * offscreen canvas and split into tiles that fly off individually.
 *
 * Escape ends the game at any time and the editor reassembles itself with a
 * spring animation - that is the punchline: the thing is unbreakable.
 * Sounds are synthesized with WebAudio, no assets are shipped.
 */

import { __ } from '@wordpress/i18n';

const Z_BASE = 999990;
const TILE = 48;
const TURN_RATE = 4.4;
const THRUST = 1050;
const DRAG = 1.1;
const MAX_SPEED = 760;
const MUZZLE = 1250;
const FIRE_RATE = 0.22;
const BLAST_RADIUS = 42;
const GRAVITY = 1400;
const MAX_TARGETS = 600;
const MAX_SMOKE = 360;
const ATOMIC = new Set( [
	'BUTTON',
	'INPUT',
	'SELECT',
	'TEXTAREA',
	'IMG',
	'A',
	'LABEL',
	'SVG',
] );

let active = false;

/**
 * Wire the trigger: five clicks within ~2 seconds start the game.
 *
 * @param {Element} el   The logo (or any) element.
 * @param {Object}  opts Passed through to startBlaster().
 * @return {Function} Detach function.
 */
export function attachBlasterTrigger( el, opts = {} ) {
	if ( ! el ) {
		return () => {};
	}
	let clicks = [];
	const onClick = () => {
		const now = performance.now();
		clicks = clicks.filter( ( t ) => now - t < 2200 );
		clicks.push( now );
		if ( clicks.length >= 5 ) {
			clicks = [];
			startBlaster( opts );
		}
	};
	el.addEventListener( 'click', onClick );
	return () => el.removeEventListener( 'click', onClick );
}

/**
 * Start the game. Safe to call repeatedly; only one instance ever runs.
 *
 * @param {Object}  opts      Options.
 * @param {Element} opts.root Editor root; defaults to #wpie-root or body.
 */
export function startBlaster( opts = {} ) {
	if ( active ) {
		return;
	}
	const root =
		opts.root || document.getElementById( 'wpie-root' ) || document.body;
	active = true;

	/* ------------------------------------------------ collect the targets */

	const vw = window.innerWidth,
		vh = window.innerHeight;
	const targets = [];
	const taken = new Set();
	const all = root.querySelectorAll( '*' );
	for ( const el of all ) {
		if ( targets.length >= MAX_TARGETS ) {
			break;
		}
		let p = el.parentElement,
			inTaken = false;
		while ( p ) {
			if ( taken.has( p ) ) {
				inTaken = true;
				break;
			}
			p = p.parentElement;
		}
		if ( inTaken ) {
			continue;
		}
		const tag = el.tagName.toUpperCase();
		if ( tag === 'CANVAS' ) {
			continue; // The artwork gets the tile treatment instead.
		}
		if ( ! ATOMIC.has( tag ) && el.childElementCount !== 0 ) {
			continue;
		}
		const r = el.getBoundingClientRect();
		if ( r.width < 8 || r.height < 8 || r.width > 520 || r.height > 240 ) {
			continue;
		}
		if ( r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh ) {
			continue;
		}
		const cs = window.getComputedStyle( el );
		if ( cs.visibility === 'hidden' || cs.display === 'none' ) {
			continue;
		}
		taken.add( el );
		targets.push( {
			el,
			rect: r,
			alive: true,
			done: false,
			x: 0,
			y: 0,
			vx: 0,
			vy: 0,
			rot: 0,
			spin: 0,
			life: 1,
			saved: {
				transform: el.style.transform,
				opacity: el.style.opacity,
				transition: el.style.transition,
				willChange: el.style.willChange,
				pointerEvents: el.style.pointerEvents,
				visibility: el.style.visibility,
			},
		} );
	}

	/* -------------------------------------------- snapshot the artwork(s) */

	let artCanvas = null,
		artRect = null;
	for ( const c of root.querySelectorAll( 'canvas' ) ) {
		const r = c.getBoundingClientRect();
		if (
			r.width > 40 &&
			r.height > 40 &&
			( ! artRect || r.width * r.height > artRect.width * artRect.height )
		) {
			artCanvas = c;
			artRect = r;
		}
	}
	const tiles = [];
	let snap = null;
	if ( artCanvas && artRect ) {
		snap = document.createElement( 'canvas' );
		snap.width = Math.max( 1, Math.round( artRect.width ) );
		snap.height = Math.max( 1, Math.round( artRect.height ) );
		try {
			snap.getContext( '2d' ).drawImage(
				artCanvas,
				0,
				0,
				snap.width,
				snap.height
			);
		} catch ( e ) {
			snap = null; // Tainted or zero-sized canvas: skip the tiles.
		}
		if ( snap ) {
			for ( let ty = 0; ty < snap.height; ty += TILE ) {
				for ( let tx = 0; tx < snap.width; tx += TILE ) {
					tiles.push( {
						sx: tx,
						sy: ty,
						sw: Math.min( TILE, snap.width - tx ),
						sh: Math.min( TILE, snap.height - ty ),
						alive: true,
						done: false,
						x: 0,
						y: 0,
						vx: 0,
						vy: 0,
						rot: 0,
						spin: 0,
						life: 1,
					} );
				}
			}
			artCanvas.__blasterVis = artCanvas.style.visibility;
			artCanvas.style.visibility = 'hidden';
		}
	}

	/* ----------------------------------------------------- overlay + input */

	const shield = document.createElement( 'div' );
	shield.style.cssText =
		'position:fixed;inset:0;z-index:' +
		Z_BASE +
		';cursor:none;touch-action:none;';
	const cv = document.createElement( 'canvas' );
	cv.style.cssText =
		'position:fixed;inset:0;z-index:' +
		( Z_BASE + 1 ) +
		';pointer-events:none;';
	document.body.appendChild( shield );
	document.body.appendChild( cv );
	const ctx = cv.getContext( '2d' );
	const dpr = Math.min( 2, window.devicePixelRatio || 1 );
	cv.width = Math.round( vw * dpr );
	cv.height = Math.round( vh * dpr );

	/* -------------------------------------------------------------- audio */

	let ac = null;
	try {
		ac = new ( window.AudioContext || window.webkitAudioContext )();
	} catch ( e ) {
		ac = null;
	}
	const noise = ( dur, gainV, fade ) => {
		if ( ! ac ) {
			return;
		}
		const len = Math.round( ac.sampleRate * dur );
		const buf = ac.createBuffer( 1, len, ac.sampleRate );
		const d = buf.getChannelData( 0 );
		for ( let i = 0; i < len; i++ ) {
			d[ i ] =
				( Math.random() * 2 - 1 ) *
				( fade ? 1 - i / len : Math.min( 1, i / ( len * 0.2 ) ) );
		}
		const s = ac.createBufferSource(),
			g = ac.createGain();
		s.buffer = buf;
		g.gain.value = gainV;
		s.connect( g ).connect( ac.destination );
		s.start();
	};
	const whoosh = () => {
		if ( ! ac ) {
			return;
		}
		noise( 0.22, 0.05 );
		const o = ac.createOscillator(),
			g = ac.createGain(),
			t = ac.currentTime;
		o.type = 'sawtooth';
		o.frequency.setValueAtTime( 340, t );
		o.frequency.exponentialRampToValueAtTime( 70, t + 0.24 );
		g.gain.setValueAtTime( 0.035, t );
		g.gain.exponentialRampToValueAtTime( 0.001, t + 0.24 );
		o.connect( g ).connect( ac.destination );
		o.start( t );
		o.stop( t + 0.25 );
	};
	const boomSound = ( big ) => {
		if ( ! ac ) {
			return;
		}
		noise( big ? 0.3 : 0.16, big ? 0.14 : 0.08, true );
		const o = ac.createOscillator(),
			g = ac.createGain(),
			t = ac.currentTime;
		o.type = 'sine';
		o.frequency.setValueAtTime( big ? 130 : 110, t );
		o.frequency.exponentialRampToValueAtTime(
			36,
			t + ( big ? 0.34 : 0.2 )
		);
		g.gain.setValueAtTime( big ? 0.16 : 0.09, t );
		g.gain.exponentialRampToValueAtTime( 0.001, t + ( big ? 0.36 : 0.22 ) );
		o.connect( g ).connect( ac.destination );
		o.start( t );
		o.stop( t + 0.38 );
	};

	/* -------------------------------------------------------------- state */

	const ship = {
		x: vw / 2,
		y: vh * 0.85,
		a: -Math.PI / 2,
		vx: 0,
		vy: 0,
		recoil: 0,
	};
	const keys = { left: false, right: false, up: false, fire: false };
	const rockets = [];
	const parts = [];
	const smoke = [];
	const flashes = [];
	const rings = [];
	const pops = [];
	let score = 0;
	let destroyed = 0;
	let ended = false;
	let fireTimer = 0;
	let mouseFiring = false;
	let hintLife = 5;
	let doneLife = 0;
	let shake = 0;
	const rootSavedTransform = root.style.transform;
	const total = targets.length + tiles.length;
	// Tiny debug handle for the QA probe; removed again in end().
	window.__wpieBlaster = { destroyed: () => destroyed };

	const fire = () => {
		const ca = Math.cos( ship.a ),
			sa = Math.sin( ship.a );
		const side = ( Math.random() - 0.5 ) * 60;
		rockets.push( {
			x: ship.x + ca * 20,
			y: ship.y + sa * 20,
			vx: ship.vx + ca * MUZZLE - sa * side,
			vy: ship.vy + sa * MUZZLE + ca * side,
			trail: 0,
		} );
		ship.recoil = 1;
		ship.vx -= ca * 26;
		ship.vy -= sa * 26;
		whoosh();
	};

	const KEYMAP = {
		ArrowLeft: 'left',
		ArrowRight: 'right',
		ArrowUp: 'up',
		a: 'left',
		d: 'right',
		w: 'up',
		A: 'left',
		D: 'right',
		W: 'up',
		' ': 'fire',
	};
	const onKeyDown = ( e ) => {
		if ( e.key === 'Escape' ) {
			e.preventDefault();
			e.stopPropagation();
			end();
			return;
		}
		const k = KEYMAP[ e.key ];
		if ( k ) {
			e.preventDefault();
			e.stopPropagation();
			keys[ k ] = true;
		}
	};
	const onKeyUp = ( e ) => {
		const k = KEYMAP[ e.key ];
		if ( k ) {
			e.preventDefault();
			keys[ k ] = false;
		}
	};
	const onDown = ( e ) => {
		e.preventDefault();
		mouseFiring = true;
	};
	const onUp = () => {
		mouseFiring = false;
	};
	const block = ( e ) => e.preventDefault();
	shield.addEventListener( 'mousedown', onDown );
	shield.addEventListener( 'mouseup', onUp );
	shield.addEventListener( 'contextmenu', block );
	shield.addEventListener( 'wheel', block, { passive: false } );
	window.addEventListener( 'keydown', onKeyDown, true );
	window.addEventListener( 'keyup', onKeyUp, true );
	window.addEventListener( 'resize', end );

	/* ------------------------------------------------------------ physics */

	const boom = ( x, y ) => {
		let hit = 0;
		const within = ( r ) =>
			x > r.left - BLAST_RADIUS &&
			x < r.right + BLAST_RADIUS &&
			y > r.top - BLAST_RADIUS &&
			y < r.bottom + BLAST_RADIUS;
		for ( const t of targets ) {
			if ( ! t.alive || ! within( t.rect ) ) {
				continue;
			}
			t.alive = false;
			hit++;
			destroyed++;
			const cx = t.rect.left + t.rect.width / 2;
			const cy = t.rect.top + t.rect.height / 2;
			const d = Math.max( 12, Math.hypot( cx - x, cy - y ) );
			t.vx = ( ( cx - x ) / d ) * ( 360 + Math.random() * 300 );
			t.vy = ( ( cy - y ) / d ) * 300 - 280;
			t.spin = ( Math.random() - 0.5 ) * 780;
			t.el.style.transition = 'none';
			t.el.style.willChange = 'transform, opacity';
			t.el.style.pointerEvents = 'none';
		}
		if ( snap ) {
			for ( const t of tiles ) {
				if ( ! t.alive ) {
					continue;
				}
				const r = {
					left: artRect.left + t.sx,
					top: artRect.top + t.sy,
					right: artRect.left + t.sx + t.sw,
					bottom: artRect.top + t.sy + t.sh,
				};
				if ( ! within( r ) ) {
					continue;
				}
				t.alive = false;
				hit++;
				destroyed++;
				const cx = r.left + t.sw / 2,
					cy = r.top + t.sh / 2;
				const d = Math.max( 12, Math.hypot( cx - x, cy - y ) );
				t.vx = ( ( cx - x ) / d ) * ( 380 + Math.random() * 320 );
				t.vy = ( ( cy - y ) / d ) * 300 - 320;
				t.spin = ( Math.random() - 0.5 ) * 960;
			}
		}

		const big = hit >= 4;
		flashes.push( { x, y, life: 0.14, max: 0.14, r: big ? 90 : 60 } );
		rings.push( {
			x,
			y,
			r: 6,
			vr: big ? 900 : 640,
			life: 0.45,
			max: 0.45,
		} );
		for ( let i = 0; i < ( big ? 7 : 4 ); i++ ) {
			if ( smoke.length < MAX_SMOKE ) {
				const a = Math.random() * Math.PI * 2;
				smoke.push( {
					x: x + Math.cos( a ) * 12,
					y: y + Math.sin( a ) * 12,
					vx: Math.cos( a ) * 60,
					vy: Math.sin( a ) * 60 - 40,
					r: 8 + Math.random() * 10,
					life: 0.9 + Math.random() * 0.5,
					max: 1.4,
				} );
			}
		}
		for ( let i = 0; i < 12 + hit * 5; i++ ) {
			const a = Math.random() * Math.PI * 2,
				v = 140 + Math.random() * 440;
			parts.push( {
				x,
				y,
				vx: Math.cos( a ) * v,
				vy: Math.sin( a ) * v - 140,
				life: 0.5 + Math.random() * 0.45,
				max: 0.95,
			} );
		}
		shake = Math.min( 14, shake + 3 + hit * 1.5 );
		if ( hit ) {
			score += hit * 10;
			pops.push( {
				x,
				y: y - 14,
				text: '+' + hit * 10,
				life: 0.9,
				max: 0.9,
			} );
			boomSound( big );
			if ( destroyed >= total && ! doneLife ) {
				doneLife = 2.2;
			}
		} else {
			boomSound( false );
		}
	};

	// Whether a point touches any live target or tile (rocket collision).
	const hitTest = ( x, y ) => {
		for ( const t of targets ) {
			if (
				t.alive &&
				x > t.rect.left - 2 &&
				x < t.rect.right + 2 &&
				y > t.rect.top - 2 &&
				y < t.rect.bottom + 2
			) {
				return true;
			}
		}
		if ( snap ) {
			for ( const t of tiles ) {
				if (
					t.alive &&
					x > artRect.left + t.sx &&
					x < artRect.left + t.sx + t.sw &&
					y > artRect.top + t.sy &&
					y < artRect.top + t.sy + t.sh
				) {
					return true;
				}
			}
		}
		return false;
	};

	const stepFlung = ( t, dt ) => {
		if ( t.alive || t.done ) {
			return;
		}
		t.x += t.vx * dt;
		t.y += t.vy * dt;
		t.vy += GRAVITY * dt;
		t.rot += t.spin * dt;
		t.life -= dt * 0.9;
		if ( t.el ) {
			if ( t.life <= 0 ) {
				t.done = true;
				t.el.style.visibility = 'hidden';
				return;
			}
			t.el.style.transform =
				( t.saved.transform ? t.saved.transform + ' ' : '' ) +
				'translate(' +
				t.x.toFixed( 1 ) +
				'px,' +
				t.y.toFixed( 1 ) +
				'px) rotate(' +
				t.rot.toFixed( 1 ) +
				'deg)';
			t.el.style.opacity = String( Math.max( 0, t.life ) );
		} else if ( t.life <= 0 || t.y > vh + 200 ) {
			t.done = true;
		}
	};

	/* --------------------------------------------------------------- loop */

	let raf = 0,
		last = performance.now();
	const loop = ( now ) => {
		if ( ended ) {
			return;
		}
		const dt = Math.min( 0.033, ( now - last ) / 1000 );
		last = now;

		// Classic controls: rotate, thrust with inertia, wrap at the edges.
		ship.a +=
			TURN_RATE * dt * ( ( keys.right ? 1 : 0 ) - ( keys.left ? 1 : 0 ) );
		if ( keys.up ) {
			ship.vx += Math.cos( ship.a ) * THRUST * dt;
			ship.vy += Math.sin( ship.a ) * THRUST * dt;
		}
		const damp = Math.exp( -DRAG * dt );
		ship.vx *= damp;
		ship.vy *= damp;
		const sp = Math.hypot( ship.vx, ship.vy );
		if ( sp > MAX_SPEED ) {
			ship.vx *= MAX_SPEED / sp;
			ship.vy *= MAX_SPEED / sp;
		}
		ship.x += ship.vx * dt;
		ship.y += ship.vy * dt;
		if ( ship.x < -24 ) {
			ship.x = vw + 24;
		} else if ( ship.x > vw + 24 ) {
			ship.x = -24;
		}
		if ( ship.y < -24 ) {
			ship.y = vh + 24;
		} else if ( ship.y > vh + 24 ) {
			ship.y = -24;
		}
		ship.recoil = Math.max( 0, ship.recoil - dt * 6 );

		fireTimer -= dt;
		if ( ( keys.fire || mouseFiring ) && fireTimer <= 0 ) {
			fireTimer = FIRE_RATE;
			fire();
		}

		for ( let i = rockets.length - 1; i >= 0; i-- ) {
			const rk = rockets[ i ];
			const steps = 3;
			let boomAt = null;
			for ( let s2 = 0; s2 < steps && ! boomAt; s2++ ) {
				rk.x += ( rk.vx * dt ) / steps;
				rk.y += ( rk.vy * dt ) / steps;
				if ( hitTest( rk.x, rk.y ) ) {
					boomAt = { x: rk.x, y: rk.y };
				}
			}
			rk.trail -= dt;
			if ( rk.trail <= 0 && smoke.length < MAX_SMOKE ) {
				rk.trail = 0.016;
				smoke.push( {
					x: rk.x,
					y: rk.y,
					vx: -rk.vx * 0.06 + ( Math.random() - 0.5 ) * 30,
					vy: -rk.vy * 0.06 + ( Math.random() - 0.5 ) * 30,
					r: 3 + Math.random() * 3,
					life: 0.5 + Math.random() * 0.25,
					max: 0.75,
				} );
			}
			if ( boomAt ) {
				rockets.splice( i, 1 );
				boom( boomAt.x, boomAt.y );
			} else if (
				rk.x < -80 ||
				rk.x > vw + 80 ||
				rk.y < -80 ||
				rk.y > vh + 80
			) {
				rockets.splice( i, 1 );
			}
		}

		for ( const t of targets ) {
			stepFlung( t, dt );
		}
		for ( const t of tiles ) {
			stepFlung( t, dt );
		}
		for ( let i = parts.length - 1; i >= 0; i-- ) {
			const p = parts[ i ];
			p.x += p.vx * dt;
			p.y += p.vy * dt;
			p.vy += GRAVITY * 0.6 * dt;
			p.life -= dt;
			if ( p.life <= 0 ) {
				parts.splice( i, 1 );
			}
		}
		for ( let i = smoke.length - 1; i >= 0; i-- ) {
			const s2 = smoke[ i ];
			s2.x += s2.vx * dt;
			s2.y += s2.vy * dt;
			s2.r += dt * 26;
			s2.life -= dt;
			if ( s2.life <= 0 ) {
				smoke.splice( i, 1 );
			}
		}
		for ( let i = flashes.length - 1; i >= 0; i-- ) {
			flashes[ i ].life -= dt;
			if ( flashes[ i ].life <= 0 ) {
				flashes.splice( i, 1 );
			}
		}
		for ( let i = rings.length - 1; i >= 0; i-- ) {
			const r = rings[ i ];
			r.r += r.vr * dt;
			r.life -= dt;
			if ( r.life <= 0 ) {
				rings.splice( i, 1 );
			}
		}
		for ( let i = pops.length - 1; i >= 0; i-- ) {
			const p = pops[ i ];
			p.y -= dt * 34;
			p.life -= dt;
			if ( p.life <= 0 ) {
				pops.splice( i, 1 );
			}
		}

		// A short, decaying shake of the whole editor after every hit.
		shake = Math.max( 0, shake - dt * 26 );
		if ( shake > 0.4 ) {
			root.style.transform =
				'translate(' +
				( ( Math.random() - 0.5 ) * shake ).toFixed( 1 ) +
				'px,' +
				( ( Math.random() - 0.5 ) * shake ).toFixed( 1 ) +
				'px)';
		} else if ( root.style.transform !== rootSavedTransform ) {
			root.style.transform = rootSavedTransform;
		}

		/* ------------------------------------------------------------ draw */

		ctx.setTransform( dpr, 0, 0, dpr, 0, 0 );
		ctx.clearRect( 0, 0, vw, vh );
		ctx.save();
		if ( shake > 0.4 ) {
			ctx.translate(
				( Math.random() - 0.5 ) * shake,
				( Math.random() - 0.5 ) * shake
			);
		}

		if ( snap ) {
			for ( const t of tiles ) {
				if ( t.done ) {
					continue;
				}
				const dx = artRect.left + t.sx,
					dy = artRect.top + t.sy;
				if ( t.alive ) {
					ctx.drawImage(
						snap,
						t.sx,
						t.sy,
						t.sw,
						t.sh,
						dx,
						dy,
						t.sw,
						t.sh
					);
				} else {
					ctx.save();
					ctx.globalAlpha = Math.max( 0, t.life );
					ctx.translate( dx + t.x + t.sw / 2, dy + t.y + t.sh / 2 );
					ctx.rotate( ( t.rot * Math.PI ) / 180 );
					ctx.drawImage(
						snap,
						t.sx,
						t.sy,
						t.sw,
						t.sh,
						-t.sw / 2,
						-t.sh / 2,
						t.sw,
						t.sh
					);
					ctx.restore();
				}
			}
		}

		for ( const s2 of smoke ) {
			ctx.globalAlpha = Math.max( 0, ( s2.life / s2.max ) * 0.32 );
			ctx.fillStyle = '#aab4c8';
			ctx.beginPath();
			ctx.arc( s2.x, s2.y, s2.r, 0, Math.PI * 2 );
			ctx.fill();
		}
		ctx.globalAlpha = 1;

		ctx.fillStyle = '#ffd166';
		for ( const p of parts ) {
			ctx.globalAlpha = Math.max( 0, p.life / p.max );
			ctx.fillRect( p.x - 2, p.y - 2, 4, 4 );
		}
		ctx.globalAlpha = 1;

		for ( const f of flashes ) {
			const a = Math.max( 0, f.life / f.max );
			const g = ctx.createRadialGradient( f.x, f.y, 0, f.x, f.y, f.r );
			g.addColorStop( 0, 'rgba(255,255,255,' + 0.85 * a + ')' );
			g.addColorStop( 0.4, 'rgba(255,209,102,' + 0.5 * a + ')' );
			g.addColorStop( 1, 'rgba(255,120,60,0)' );
			ctx.fillStyle = g;
			ctx.beginPath();
			ctx.arc( f.x, f.y, f.r, 0, Math.PI * 2 );
			ctx.fill();
		}
		for ( const r of rings ) {
			const a = Math.max( 0, r.life / r.max );
			ctx.strokeStyle = 'rgba(124,242,255,' + 0.55 * a + ')';
			ctx.lineWidth = 2.5 * a + 0.5;
			ctx.beginPath();
			ctx.arc( r.x, r.y, r.r, 0, Math.PI * 2 );
			ctx.stroke();
		}

		for ( const rk of rockets ) {
			const ang = Math.atan2( rk.vy, rk.vx );
			ctx.save();
			ctx.translate( rk.x, rk.y );
			ctx.rotate( ang );
			ctx.strokeStyle = '#ff9f43';
			ctx.lineWidth = 3.5;
			ctx.beginPath();
			ctx.moveTo( -8, 0 );
			ctx.lineTo( -15 - Math.random() * 7, 0 );
			ctx.stroke();
			ctx.fillStyle = '#e8ecf4';
			ctx.strokeStyle = '#2b3242';
			ctx.lineWidth = 1.2;
			ctx.beginPath();
			ctx.moveTo( 9, 0 );
			ctx.lineTo( -6, -3.6 );
			ctx.lineTo( -6, 3.6 );
			ctx.closePath();
			ctx.fill();
			ctx.stroke();
			ctx.restore();
		}

		const kick = ship.recoil * 5;
		ctx.save();
		ctx.translate(
			ship.x - Math.cos( ship.a ) * kick,
			ship.y - Math.sin( ship.a ) * kick
		);
		ctx.rotate( ship.a + Math.PI / 2 );
		if ( keys.up ) {
			ctx.fillStyle = '#ff9f43';
			ctx.beginPath();
			ctx.moveTo( 0, 12 + Math.random() * 12 );
			ctx.lineTo( -5, 7 );
			ctx.lineTo( 5, 7 );
			ctx.closePath();
			ctx.fill();
		}
		ctx.fillStyle = '#e8ecf4';
		ctx.strokeStyle = '#2b3242';
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.moveTo( 0, -16 );
		ctx.lineTo( 11, 8 );
		ctx.lineTo( 4, 4 );
		ctx.lineTo( -4, 4 );
		ctx.lineTo( -11, 8 );
		ctx.closePath();
		ctx.fill();
		ctx.stroke();
		ctx.fillStyle = '#7cf2ff';
		ctx.beginPath();
		ctx.arc( 0, -4, 3, 0, Math.PI * 2 );
		ctx.fill();
		ctx.restore();

		ctx.restore(); // shake

		ctx.font =
			'600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
		for ( const p of pops ) {
			ctx.globalAlpha = Math.max( 0, p.life / p.max );
			ctx.fillStyle = '#ffd166';
			ctx.fillText( p.text, p.x + 8, p.y );
		}
		ctx.globalAlpha = 1;

		ctx.fillStyle = 'rgba(255,255,255,0.92)';
		ctx.fillText( String( score ).padStart( 6, '0' ), 16, vh - 40 );
		ctx.fillStyle = 'rgba(255,255,255,0.55)';
		ctx.fillText(
			Math.round( ( destroyed / Math.max( 1, total ) ) * 100 ) + '%',
			16,
			vh - 22
		);
		if ( hintLife > 0 ) {
			hintLife -= dt;
			ctx.globalAlpha = Math.min( 1, hintLife );
			ctx.textAlign = 'center';
			ctx.fillStyle = 'rgba(255,255,255,0.9)';
			ctx.fillText(
				__(
					'Arrows or WASD fly, Space or click shoots. Esc ends the mayhem.',
					'wunderpaint'
				),
				vw / 2,
				vh - 28
			);
			ctx.textAlign = 'left';
			ctx.globalAlpha = 1;
		}
		if ( doneLife > 0 ) {
			doneLife -= dt;
			ctx.textAlign = 'center';
			ctx.font = '700 28px -apple-system, sans-serif';
			ctx.fillStyle = '#fff';
			ctx.fillText( '100%', vw / 2, vh / 2 );
			ctx.textAlign = 'left';
			if ( doneLife <= 0 ) {
				end();
				return;
			}
		}

		raf = requestAnimationFrame( loop );
	};
	raf = requestAnimationFrame( loop );

	/* ------------------------------------------------ restore everything */

	function end() {
		if ( ended ) {
			return;
		}
		ended = true;
		cancelAnimationFrame( raf );
		shield.removeEventListener( 'mousedown', onDown );
		shield.removeEventListener( 'mouseup', onUp );
		shield.removeEventListener( 'contextmenu', block );
		shield.removeEventListener( 'wheel', block );
		window.removeEventListener( 'keydown', onKeyDown, true );
		window.removeEventListener( 'keyup', onKeyUp, true );
		window.removeEventListener( 'resize', end );
		root.style.transform = rootSavedTransform;
		delete window.__wpieBlaster;

		// The artwork snaps back first, the UI springs home staggered.
		if ( artCanvas && snap ) {
			artCanvas.style.visibility = artCanvas.__blasterVis || '';
			delete artCanvas.__blasterVis;
		}
		let i = 0;
		for ( const t of targets ) {
			const el = t.el,
				saved = t.saved;
			if ( t.alive ) {
				restoreEl( el, saved );
				continue;
			}
			el.style.visibility = saved.visibility;
			el.style.transition =
				'transform 0.55s cubic-bezier(0.2, 1.5, 0.4, 1), opacity 0.35s ease';
			i++;
			window.setTimeout(
				() => {
					el.style.transform = saved.transform;
					el.style.opacity = saved.opacity;
				},
				30 + ( i % 40 ) * 12
			);
			window.setTimeout( () => restoreEl( el, saved ), 1300 );
		}
		cv.style.transition = 'opacity 0.4s ease';
		cv.style.opacity = '0';
		window.setTimeout( () => {
			cv.remove();
			shield.remove();
			if ( ac ) {
				ac.close().catch( () => {} );
			}
			active = false;
		}, 450 );
	}

	function restoreEl( el, saved ) {
		el.style.transform = saved.transform;
		el.style.opacity = saved.opacity;
		el.style.transition = saved.transition;
		el.style.willChange = saved.willChange;
		el.style.pointerEvents = saved.pointerEvents;
		el.style.visibility = saved.visibility;
	}
}
