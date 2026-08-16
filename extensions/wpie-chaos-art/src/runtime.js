/**
 * The Chaos Art embed: the piece paints itself, live, on somebody's
 * website - and every page load is a new original, because the entropy
 * pool is charged on the visitor's machine and never travels.
 *
 * Same manners as the family's other runtimes: nothing boots until the
 * element comes near the viewport, offscreen embeds sleep, the page
 * keeps its scroll wheel until the visitor takes hold, and reduced
 * motion gets a finished still instead of an animation - a unique one,
 * painted in fast-forward inside a single task.
 *
 * The visitor is part of it: the pointer stirs the paint, a tap sends
 * an impulse through the space, dragging borrows the camera.
 */

import { ChaosEngine } from './engine.js';
import { STYLES, styleById } from './core/styles.js';
import { MOVEMENTS, movementById } from './core/movements.js';
import { resolveMedium } from './core/media.js';
import { PALETTES, generatePalette } from './core/palette.js';
import { makePool, makeRng } from './core/rng.js';

function boot( el ) {
	if ( el.__wpieChaos ) {
		return;
	}
	el.__wpieChaos = true;
	let p;
	try {
		p = JSON.parse( el.getAttribute( 'data-wpie-chaos' ) || '{}' );
	} catch ( e ) {
		return;
	}
	// Whatever the snippet leaves open, the visitor's own entropy
	// decides: style, school, colors, temperament - a new original in
	// every dimension the author left to the society.
	const pool0 = makePool();
	const r = makeRng( pool0.words );
	const dial = ( v, fallback ) =>
		Number.isFinite( v )
			? Math.min( 300, Math.max( 0, v ) ) / 100
			: fallback;
	const makeSettings = () => {
		const style2 =
			! p.styleId || 'auto' === p.styleId
				? STYLES[ Math.floor( r() * STYLES.length ) ]
				: styleById( p.styleId );
		const movement2 =
			'auto' === p.movementId
				? MOVEMENTS[ Math.floor( r() * MOVEMENTS.length ) ]
				: movementById( p.movementId );
		return buildSettings( style2, movement2 );
	};
	const buildSettings = ( style3, movement3 ) => {
		const settings = {
			style: style3,
			movement: movement3,
			movementAuto: 'auto' === p.movementId,
			mediumAuto: ! p.mediumId || 'auto' === p.mediumId,
			medium: resolveMedium( p.mediumId, movement3 ),
			params: {
				chaos: dial( p.chaos, 0.2 + r() * 0.65 ),
				energy: dial( p.energy, 0.25 + r() * 0.6 ),
				density: dial( p.density, 0.2 + r() * 0.6 ),
				tempo: dial( p.tempo, 0.7 + r() * 0.9 ),
				autoPalette: ! (
					Array.isArray( p.colors ) && p.colors.length > 1
				),
				autoTemper: ! Number.isFinite( p.chaos ),
				allowRecast: 'ensemble' === style3.id || 'auto' === p.styleId,
				colors:
					Array.isArray( p.colors ) && p.colors.length > 1
						? p.colors.slice( 0, 8 )
						: null,
			},
			cursorMode: p.cursorMode || style3.cursorMode,
			ground:
				p.ground ||
				movement3.ground ||
				( r() < 0.3 ? 'palette' : 'style' ),
			fx: {
				bloom: dial( p.fx && p.fx.bloom, 1 ),
				dof: dial( p.fx && p.fx.dof, 1 ),
				grain: dial( p.fx && p.fx.grain, 1 ),
				vignette: dial( p.fx && p.fx.vignette, 1 ),
			},
		};
		if ( 'palette' === settings.ground ) {
			settings.ground = 'style'; // resolved below, once colors exist
			settings.groundFromPalette = true;
		}
		if ( ! settings.params.colors ) {
			if ( movement3.paletteId && r() < 0.55 ) {
				const pp = PALETTES.find(
					( x ) => x.id === movement3.paletteId
				);
				settings.params.colors = ( pp || PALETTES[ 0 ] ).colors.slice();
			} else if ( r() < 0.55 ) {
				settings.params.colors = generatePalette( r );
			} else {
				const pal =
					PALETTES.find( ( x ) => x.id === style3.defaultPalette ) ||
					PALETTES[ 0 ];
				settings.params.colors = pal.colors.slice();
			}
		}

		if ( settings.groundFromPalette ) {
			const lum = ( hx ) => parseInt( hx.slice( 1 ), 16 );
			const sorted = settings.params.colors
				.slice()
				.sort( ( a, b ) => lum( a ) - lum( b ) );
			settings.ground =
				r() < 0.65 ? sorted[ 0 ] : sorted[ sorted.length - 1 ];
		}
		return settings;
	};
	const settings = makeSettings();
	el.style.overflow = 'hidden';
	el.style.display = 'flex';
	el.style.alignItems = 'center';
	el.style.justifyContent = 'center';

	const aspect =
		Array.isArray( p.aspect ) && p.aspect[ 0 ] > 0 && p.aspect[ 1 ] > 0
			? p.aspect[ 0 ] / p.aspect[ 1 ]
			: ( el.clientWidth || 16 ) / Math.max( 1, el.clientHeight || 9 );

	const engine = new ChaosEngine( { embed: true } );
	engine.mount( el, aspect );

	const pool = makePool();
	el.addEventListener( 'pointermove', ( e ) => {
		pool.feed(
			Math.round( e.clientX * 31 ),
			Math.round( e.clientY * 37 ),
			( 'undefined' !== typeof performance ? performance.now() : 1 ) >>> 0
		);
	} );

	engine.newWorld( settings, pool );

	const reduced =
		window.matchMedia &&
		window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;
	if ( reduced ) {
		// A finished, still original: the society lives a stretch of time
		// inside one task and the visitor sees only where it arrived. The
		// render loop then goes to sleep - the canvas keeps its last frame.
		engine.fastForward( 22 );
		engine.sleep();
		el.__wpieChaosEngine = engine;
		return;
	}

	engine.start();

	// THE GALLERY: an embedded piece completes itself after a while,
	// rests on its final state, then a NEW original begins - the page
	// repaints for as long as anyone cares to watch. p.cycle (seconds)
	// overrides the pace; 0 turns the cycle off.
	const cycleSec = Number.isFinite( p.cycle ) ? p.cycle : 100 + r() * 60;
	let pieceSeq = 0;
	const nextPiece = () => {
		if ( cycleSec <= 0 ) {
			return;
		}
		window.setTimeout( () => {
			// Wind down: the world's own tempo sinks toward stillness.
			const wind = window.setInterval( () => {
				if ( engine.world ) {
					engine.world.params.tempo *= 0.8;
				}
			}, 400 );
			window.setTimeout(
				() => {
					window.clearInterval( wind );
					// Stir the pool, or a visitor who never moves the
					// pointer would watch the SAME piece repaint itself.
					pieceSeq++;
					pool.feed(
						( 'undefined' !== typeof performance
							? performance.now()
							: pieceSeq ) >>> 0,
						( pieceSeq * 2654435761 ) >>> 0,
						( pieceSeq * 40503 + 7 ) >>> 0
					);
					engine.newWorld( makeSettings(), pool );
					engine.start();
					nextPiece();
				},
				Math.min( 9000, cycleSec * 90 )
			);
		}, cycleSec * 1000 );
	};
	nextPiece();

	if ( 'undefined' !== typeof IntersectionObserver ) {
		new IntersectionObserver(
			( entries ) => {
				for ( const en of entries ) {
					if ( en.isIntersecting ) {
						engine.wake();
					} else {
						engine.sleep();
					}
				}
			},
			{ rootMargin: '100px' }
		).observe( el );
	}
	el.__wpieChaosEngine = engine;
}

function bootAll() {
	for ( const el of document.querySelectorAll( '[data-wpie-chaos]' ) ) {
		if ( 'undefined' === typeof IntersectionObserver ) {
			boot( el );
			continue;
		}
		const io = new IntersectionObserver(
			( entries ) => {
				for ( const en of entries ) {
					if ( en.isIntersecting ) {
						io.disconnect();
						boot( el );
					}
				}
			},
			{ rootMargin: '300px' }
		);
		io.observe( el );
	}
}

if ( 'loading' === document.readyState ) {
	document.addEventListener( 'DOMContentLoaded', bootAll );
} else {
	bootAll();
}
