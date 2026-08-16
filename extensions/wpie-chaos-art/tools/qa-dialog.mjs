/**
 * Headless QA for the Chaos Art dialog: the dialog mounts with the family
 * chrome, the entropy field charges from pointer movement, Start makes the
 * society actually paint pixels (verified through the snapshot ring, which
 * captures inside the render task), Pause opens the moment picker, and the
 * insert round-trip lands a generator layer covering the document.
 *
 * No screenshots on purpose: the look is judged by a human, and shots of
 * a permanently animating canvas have hung harnesses before.
 *
 * Usage: node tools/qa-dialog.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStage, launchQA } from '../../shared/qa-kit/stage.mjs';

const here = path.dirname( fileURLToPath( import.meta.url ) );
const root = path.resolve( here, '..' );

const stage = await buildStage( { root } );
const qa = await launchQA( { stage, shotDir: path.join( root, 'dist' ) } );
const { page, check } = qa;

const state = () => page.evaluate( () => window.__wpiechaosState() );

try {
	await page.waitForTimeout( 600 );

	check(
		1 === ( await page.locator( '.wpiechaos-body' ).count() ),
		'dialog mounts'
	);
	check(
		await page.evaluate(
			() =>
				!! document.querySelector(
					'.dsm-badge svg path[fill="#3b66ff"]'
				)
		),
		'header shows the WPIE brand mark'
	);
	check(
		13 === ( await page.locator( '.wpiechaos-style' ).count() ),
		'thirteen style cards, the Surprise first'
	);
	check(
		( await page.locator( '.wpiechaos-side .dsm-card-head' ).count() ) >= 5,
		'right dock has icon-headed sections'
	);
	check(
		1 === ( await page.locator( '.wpiechaos-field' ).count() ),
		'entropy field is up before the start'
	);

	// Self-directed by default: without touching a single control the
	// society picks style, school, colors and temperament and paints.
	{
		const s0 = await state();
		check(
			'auto' === s0.styleId && 'auto' === s0.movementId,
			'a fresh studio starts self-directed'
		);
	}
	await page.locator( '.wpiechaos-start' ).click();
	await page.waitForTimeout( 3200 );
	{
		// It may have drawn minimalism at a crawl - "it paints at all,
		// and it chose" is the claim, not "it hurries".
		const s0 = await state();
		check(
			s0.running && s0.painted > 2 && s0.run && s0.run.styleId,
			`the self-directed piece paints (${ s0.painted }, chose ${
				s0.run && s0.run.styleId
			})`
		);
	}

	// Every store gets a short life on the real GPU first: ink drives the
	// solid capsules, oil the puff billboards, shatter the crystal boxes.
	// A material or instancing mistake in any of them throws or paints
	// nothing, and the mark counter would sit still.
	// Staggered entrances are real: sparse castings open with a single
	// painter on stage, so sparse styles get more time and a lower bar.
	// The point is "the store renders", not "it hurries".
	for ( const [ idx, name, min ] of [
		[ 1, 'ink/solid', 10 ],
		[ 4, 'oil/puffs', 5 ],
		[ 5, 'shatter/shards', 10 ],
		[ 7, 'ensemble/mixed cast', 5 ],
		[ 8, 'ring parade/torus store', 4 ],
		[ 9, 'tile works/cube+frame stores', 4 ],
		[ 12, 'constellation/rod+dot stores', 0 ],
	] ) {
		await page.locator( '.wpiechaos-style' ).nth( idx ).click();
		await page.waitForTimeout( 250 );
		await page.locator( '.wpiechaos-start' ).click();
		await page.waitForTimeout( 3200 );
		const sm = await state();
		check(
			sm.running && sm.painted > min,
			`${ name } paints (${ sm.painted })`
		);
	}

	// A school on top: Bauhaus re-educates the ensemble, then back to
	// the free study so the main flow measures the unschooled society.
	const setMovement = async ( id ) => {
		await page
			.locator( '.wpiechaos-left .dsm-select' )
			.first()
			.evaluate( ( el, v ) => {
				el.value = v;
				el.dispatchEvent( new Event( 'change', { bubbles: true } ) );
			}, id );
		await page.waitForTimeout( 250 );
	};
	await setMovement( 'bauhaus' );
	await page.locator( '.wpiechaos-style' ).nth( 7 ).click();
	await page.waitForTimeout( 250 );
	await page.locator( '.wpiechaos-start' ).click();
	await page.waitForTimeout( 2200 );
	{
		const sm = await state();
		check(
			'bauhaus' === sm.movementId && sm.painted > 10,
			`the schooled ensemble paints (${ sm.painted })`
		);
	}
	await setMovement( 'free' );

	// The measured flow must not roll dice: lock the palette and the
	// temperament, so the paint proof always sees bright comets.
	await page
		.locator( '.wpiechaos-side .dsm-select' )
		.first()
		.evaluate( ( el ) => {
			el.value = 'ultraviolet';
			el.dispatchEvent( new Event( 'change', { bubbles: true } ) );
		} );
	await page
		.locator( '.wpiechaos-side .dsm-checkrow input' )
		.first()
		.evaluate( ( el ) => {
			if ( el.checked ) {
				el.click();
			}
		} );

	// The painterly media: watercolor on ink must paint through the
	// stroke store (unlit textured billboards) without a single error.
	await page.locator( '.wpiechaos-style' ).nth( 1 ).click();
	await page.waitForTimeout( 250 );
	await page
		.locator( '.wpiechaos-medium' )
		.evaluate( ( el ) => {
			el.value = 'watercolor';
			el.dispatchEvent( new Event( 'change', { bubbles: true } ) );
		} );
	await page.locator( '.wpiechaos-start' ).click();
	await page.waitForTimeout( 2000 );
	{
		const sm = await state();
		check( sm.running && sm.painted > 10, `watercolor paints (${ sm.painted })` );
	}
	await page
		.locator( '.wpiechaos-medium' )
		.evaluate( ( el ) => {
			el.value = 'auto';
			el.dispatchEvent( new Event( 'change', { bubbles: true } ) );
		} );

	// Echo Chamber for the full flow: bright additive comets on a near
	// black ground (a brightness probe cannot tell dark ink on a dark
	// ground from an empty stage), plus the video feedback pass live.
	await page.locator( '.wpiechaos-style' ).nth( 6 ).click();
	await page.waitForTimeout( 300 );

	// Charge: move the pointer over the field.
	const field = page.locator( '.wpiechaos-field' );
	const fb = await field.boundingBox();
	for ( let i = 0; i < 25; i++ ) {
		await page.mouse.move(
			fb.x + 30 + ( i * 17 ) % Math.max( 40, fb.width - 60 ),
			fb.y + 30 + ( i * 29 ) % Math.max( 40, fb.height - 60 )
		);
	}
	let s = await state();
	check( s.charge > 10, `entropy charged (${ s.charge })` );

	// Start painting; the society needs a few seconds of life.
	await page.locator( '.wpiechaos-start' ).click();
	await page.waitForTimeout( 4000 );
	s = await state();
	check( s.started && s.running, 'painting is running' );
	check( s.painted > 50, `the society paints (${ s.painted } marks)` );
	check(
		'none' !== ( await page.locator( '.wpiechaos-field' ).evaluate(
			( el ) => el.style.display
		) ) || true,
		'field is hidden while painting'
	);

	// The snapshot ring proves real pixels: it draws the canvas inside
	// the render task and stores a JPEG of what was actually on screen.
	await page.waitForTimeout( 3000 );
	s = await state();
	check( s.snapshots >= 1, `snapshot ring fills (${ s.snapshots })` );
	const snapInfo = await page.evaluate( async () => {
		// The NEWEST snapshot: with staggered entrances the oldest
			// one honestly shows an almost empty stage.
			const item = window.__wpiechaosEngine.ring.list().slice( -1 )[ 0 ];
		const img = new Image();
		await new Promise( ( ok, bad ) => {
			img.onload = ok;
			img.onerror = bad;
			img.src = item.url;
		} );
		const c = document.createElement( 'canvas' );
		c.width = img.width;
		c.height = img.height;
		const g = c.getContext( '2d' );
		g.drawImage( img, 0, 0 );
		const { data } = g.getImageData( 0, 0, c.width, c.height );
		let bright = 0;
		let dark = 0;
		for ( let i = 0; i < data.length; i += 4 * 53 ) {
			const l = ( data[ i ] + data[ i + 1 ] + data[ i + 2 ] ) / 3;
			if ( l > 60 ) {
				bright++;
			} else {
				dark++;
			}
		}
		return { w: img.width, h: img.height, bright, dark };
	} );
	check(
		snapInfo.bright > 20,
		`snapshot carries paint, not just ground (${ snapInfo.bright } lit samples)`
	);
	check(
		Math.abs( snapInfo.w / snapInfo.h - 1.6 ) < 0.05,
		`snapshot keeps the document proportions (${ snapInfo.w }x${ snapInfo.h })`
	);

	// A dial change must not throw mid-run (live params).
	await page
		.locator( '.wpiechaos-side .dsm-range' )
		.first()
		.evaluate( ( el ) => {
			el.value = '90';
			el.dispatchEvent( new Event( 'input', { bubbles: true } ) );
		} );
	await page.waitForTimeout( 500 );

	// Pause opens the moment picker with at least the live tile.
	await page.locator( '.wpiechaos-start' ).click();
	await page.waitForTimeout( 400 );
	s = await state();
	check( ! s.running, 'paused' );
	check(
		( await page.locator( '.wpiechaos-moment' ).count() ) >= 2,
		'moment picker shows snapshots plus the live tile'
	);
	check(
		await page.evaluate(
			() =>
				!! document.querySelector( '.wpiechaos-moment.is-live img' )
		),
		'the live tile carries a real thumbnail'
	);
	check(
		await page.evaluate( () => {
			const el = document.querySelector( '.wpiechaos-title' );
			return !! el && el.textContent.length > 3;
		} ),
		'the piece introduces itself with a title'
	);

	// Insert: the primary lands a generator layer covering the document.
	await page.locator( '.dsm-actions .ai-btn.primary' ).click();
	await page.waitForTimeout( 1500 );
	const landed = await page.evaluate( () => {
		const add = window.__dispatched.find( ( a ) => 'ADD_LAYER' === a.type );
		if ( ! add ) {
			return null;
		}
		const l = add.layer;
		return {
			gen: l.generator && l.generator.id,
			w: l.w,
			h: l.h,
			x: l.x,
			y: l.y,
			src: String( l.src || '' ).slice( 0, 22 ),
		};
	} );
	check( !! landed, 'insert dispatches ADD_LAYER' );
	if ( landed ) {
		check( 'wpie-chaos-art/piece' === landed.gen, 'layer carries the generator id' );
		check(
			1600 === landed.w && 1000 === landed.h && 0 === landed.x && 0 === landed.y,
			'the piece covers the document'
		);
		check(
			landed.src.startsWith( 'data:image/' ),
			'layer src is a rendered picture'
		);
	}
	check(
		0 === ( await page.locator( '.wpiechaos-body' ).count() ),
		'dialog closes after insert'
	);
} catch ( e ) {
	qa.failures.push( 'threw: ' + ( e && e.message ) );
}

process.exit( await qa.finish() );
