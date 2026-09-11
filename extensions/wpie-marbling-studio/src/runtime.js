/**
 * Marble Bath - the embedded bath (v1.4).
 *
 * The Copy-snippet output: a div carrying the bath's history as JSON plus
 * this script. It boots the same engine the studio uses, so the bath on a
 * finished website IS the bath from the preview - replayed as it was
 * made, resting on living water, or open for visitors to marble in.
 *
 * House rules for anything embedded in somebody's article:
 *
 *   THE PAGE MUST STILL SCROLL. The bath never takes the wheel; one
 *   finger scrolls the page (touch-action: pan-y), a tap drops ink.
 *
 *   OFFSCREEN COSTS NOTHING. An IntersectionObserver puts the bath to
 *   sleep when the embed scrolls out of view.
 *
 *   REDUCED MOTION IS RESPECTED. With the OS preference set, the embed
 *   shows the finished bath, still.
 */

import { MarblingEngine } from './engine.js';
import {
	mergeParams,
	replaySchedule,
	ease,
	OP,
	MAX_OPS,
	rng,
} from './marbling.js';

function boot( el ) {
	if ( el.dataset.wpieMbReady ) {
		return;
	}
	el.dataset.wpieMbReady = '1';
	let raw;
	try {
		raw = JSON.parse( el.getAttribute( 'data-wpie-marble' ) || '{}' );
	} catch ( e ) {
		return;
	}
	const params = mergeParams( raw );
	const mode = [ 'replay', 'water', 'interactive' ].includes( raw.mode )
		? raw.mode
		: 'replay';
	const canvas = document.createElement( 'canvas' );
	canvas.style.cssText =
		'display:block;width:100%;height:100%;touch-action:pan-y;';
	if ( ! el.style.position ) {
		el.style.position = 'relative';
	}
	el.appendChild( canvas );

	const engine = new MarblingEngine( canvas );
	const push = () =>
		engine.setState( {
			ops: params.ops,
			inks: params.inks,
			bath: params.bath,
			bathClear: params.bathClear,
			aspect: params.aspect,
			veins: params.veins,
			paper: params.paper,
		} );
	push();
	// The QA harness (and curious integrators) can reach the engine.
	el.__wpieMb = engine;

	const still =
		window.matchMedia &&
		window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;
	const alive = ! engine.cpu && ! still;
	if ( alive ) {
		engine.setSurface( { on: true, sway: 1, sheen: 1, rim: 0.6 } );
	}

	const fit = () => {
		const r = el.getBoundingClientRect();
		engine.resize( Math.max( 40, r.width ), Math.max( 40, r.height ) );
		engine.render();
	};
	fit();
	if ( 'undefined' !== typeof ResizeObserver ) {
		new ResizeObserver( fit ).observe( el );
	}

	let sleeping = false;
	let replay =
		'replay' === mode && alive ? replaySchedule( params.ops ) : null;
	const t0 = performance.now();
	let ripples = [];
	function step( now ) {
		window.requestAnimationFrame( step );
		if ( sleeping || ! alive ) {
			return;
		}
		const t = ( now - t0 ) / 1000;
		if ( replay ) {
			let count = 0;
			let lastT = 1;
			for ( let i = 0; i < params.ops.length; i++ ) {
				if ( t >= replay.starts[ i ] ) {
					count = i + 1;
					lastT = ease(
						( t - replay.starts[ i ] ) /
							Math.max( 0.001, replay.durations[ i ] )
					);
				}
			}
			engine.setPartial( count, lastT );
			if ( t >= replay.total ) {
				engine.setPartial( params.ops.length, 1 );
				replay = null;
			}
		}
		ripples = ripples.filter( ( r ) => now - r.t0 < 2200 );
		engine.setRipples(
			ripples
				.slice( -6 )
				.map( ( r ) => [ r.x, r.y, ( now - r.t0 ) / 1000, r.r ] )
		);
		engine.renderSurface( t );
	}
	if ( alive ) {
		window.requestAnimationFrame( step );
	}

	// Interactive: a tap drops ink, a drag pulls the needle - the same
	// exact ops the studio makes, appended to the history.
	if ( 'interactive' === mode && ! engine.cpu ) {
		const rand = rng( ( params.seed | 0 ) + 101 );
		let gesture = null;
		const toBath = ( e ) => {
			const r = canvas.getBoundingClientRect();
			return {
				x: ( ( e.clientX - r.left ) / r.width ) * params.aspect,
				y: ( e.clientY - r.top ) / r.height,
			};
		};
		const commit = ( op, replaceLast ) => {
			const ops = params.ops.slice( 0, MAX_OPS - 1 );
			if ( replaceLast && ops.length ) {
				ops[ ops.length - 1 ] = op;
			} else {
				ops.push( op );
			}
			params.ops = ops;
			push();
			engine.setPartial( ops.length, 1 );
		};
		canvas.addEventListener( 'pointerdown', ( e ) => {
			if ( replay || ! e.isPrimary ) {
				return;
			}
			const p = toBath( e );
			const ink = Math.floor( rand() * params.inks.length );
			commit( [ OP.DROP, p.x, p.y, 0.035 + rand() * 0.02, ink ] );
			ripples.push( { x: p.x, y: p.y, r: 0.03, t0: performance.now() } );
			gesture = { at: p, ink, live: false };
			try {
				canvas.setPointerCapture( e.pointerId );
			} catch ( err ) {}
		} );
		canvas.addEventListener( 'pointermove', ( e ) => {
			if ( ! gesture || replay ) {
				return;
			}
			const p = toBath( e );
			const dx = p.x - gesture.at.x;
			const dy = p.y - gesture.at.y;
			const L = Math.hypot( dx, dy );
			if ( L < 0.03 ) {
				return;
			}
			const op = [
				OP.TINE,
				gesture.at.x,
				gesture.at.y,
				dx / L,
				dy / L,
				Math.min( 0.45, L * 0.9 ),
				0.014,
			];
			commit( op, gesture.live );
			gesture.live = true;
		} );
		const end = () => {
			gesture = null;
		};
		canvas.addEventListener( 'pointerup', end );
		canvas.addEventListener( 'pointercancel', end );
		canvas.style.cursor = 'crosshair';
	}

	if ( 'undefined' !== typeof IntersectionObserver ) {
		new IntersectionObserver(
			( entries ) => {
				for ( const entry of entries ) {
					sleeping = ! entry.isIntersecting;
				}
			},
			{ rootMargin: '80px' }
		).observe( el );
	}
}

function scan() {
	document
		.querySelectorAll( '[data-wpie-marble]' )
		.forEach( ( el ) => boot( el ) );
}

if ( 'loading' === document.readyState ) {
	document.addEventListener( 'DOMContentLoaded', scan );
} else {
	scan();
}
