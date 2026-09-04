/**
 * Headless QA for the Chaos Art dialog: the dialog mounts with the family
 * chrome, Start stays locked until the entropy field is fully charged,
 * the self-directed society paints, every family paints (schools on the
 * flat sheet, the stage in space), Pause opens the moment picker, and the
 * insert round-trip lands a generator layer covering the document.
 *
 * The mock editor has no brush engine (bridge.paint), so the sheet paints
 * through the painter's plain road here; the media themselves are proven
 * against the real core in the editor.
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
// Since 1.8 a tile picked mid-piece changes the voice, not the piece. A
// fresh piece in the picked school is Start over while one runs or rests,
// and Start when nothing has begun yet.
const startFresh = async () => {
	const st = await state();
	await page
		.locator( st.started ? '.wpiechaos-over' : '.wpiechaos-start' )
		.click();
};
const startDisabled = () =>
	page.locator( '.wpiechaos-start' ).evaluate( ( el ) => el.disabled );
const tile = ( i ) => page.locator( '.wpiechaos-style' ).nth( i );
// Tiles: 0 Surprise, then the schools, then the twelve styles in space.
import { SCHOOLS } from '../src/flat/schools.js';
// Surprise, the ensemble on the sheet, the schools, then space (ensemble first).
const SPACE0 = 2 + SCHOOLS.length;
const at = ( id ) => 2 + SCHOOLS.findIndex( ( s ) => s.id === id );
const SCHOOL = {
	impressionism: at( 'impressionism' ),
	expressionism: at( 'expressionism' ),
	destijl: at( 'destijl' ),
	action: at( 'action' ),
	opart: at( 'opart' ),
	sumi: at( 'sumi' ),
	collage: at( 'collage' ),
};

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
		SPACE0 + 12 === ( await page.locator( '.wpiechaos-style' ).count() ),
		`${ SPACE0 + 12 } cards: Surprise, Ensemble, ${
			SCHOOLS.length
		} schools, twelve styles in space`
	);
	check(
		2 === ( await page.locator( '.wpiechaos-family' ).count() ),
		'the two families are labeled'
	);
	check(
		3 ===
			( await page.locator( '.wpiechaos-side .dsm-card-head' ).count() ),
		'on the sheet the right dock holds motif, temperament and colors'
	);
	check(
		'none' ===
			( await page
				.locator( '.wpiechaos-left .dsm-card' )
				.first()
				.evaluate( ( el ) => el.style.display ) ),
		'the art movement card is hidden on the sheet'
	);
	check(
		1 === ( await page.locator( '.wpiechaos-field' ).count() ),
		'entropy field is up before the start'
	);
	check( await startDisabled(), 'Start is locked before the charge' );

	// Charge: move the pointer over the field until the bar is full.
	const field = page.locator( '.wpiechaos-field' );
	const fb = await field.boundingBox();
	for ( let i = 0; i < 90; i++ ) {
		await page.mouse.move(
			fb.x + 30 + ( ( i * 17 ) % Math.max( 40, fb.width - 60 ) ),
			fb.y + 30 + ( ( i * 29 ) % Math.max( 40, fb.height - 60 ) )
		);
	}
	check(
		await startDisabled(),
		'Start stays locked while the bar is not full'
	);
	for ( let i = 0; i < 130; i++ ) {
		await page.mouse.move(
			fb.x + 40 + ( ( i * 23 ) % Math.max( 40, fb.width - 80 ) ),
			fb.y + 40 + ( ( i * 31 ) % Math.max( 40, fb.height - 80 ) )
		);
	}
	{
		const s = await state();
		check( s.charge >= 200, `entropy charged (${ s.charge })` );
	}
	check( ! ( await startDisabled() ), 'a full bar unlocks Start' );

	// Self-directed by default: without touching a single control the
	// society picks the school, colors and temperament and paints.
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
		const s0 = await state();
		check(
			s0.running && s0.painted >= 1 && s0.run && s0.run.styleId,
			`the self-directed piece paints (${ s0.painted }, chose ${
				s0.run && s0.run.styleId
			} in ${ s0.family })`
		);
	}

	// Every school gets a short life: a vocabulary or a mark kind that
	// throws would stall the counter.
	for ( const id of [
		'popart',
		'streetart',
		'mosaic',
		'stainedglass',
		'artnouveau',
	] ) {
		SCHOOL[ id ] = at( id );
	}
	for ( const [ id, idx ] of Object.entries( SCHOOL ) ) {
		await tile( idx ).click();
		await page.waitForTimeout( 250 );
		check(
			! ( await startDisabled() ),
			`${ id }: the charge survives the change of school`
		);
		await startFresh();
		// The slow schools (De Stijl: two painters at half tempo) set their
		// first mark after a few seconds; wait for it, up to eight.
		await page
			.waitForFunction(
				() => window.__wpiechaosState().painted >= 1,
				null,
				{ timeout: 8000 }
			)
			.catch( () => {} );
		const sm = await state();
		check(
			sm.running && 'flat' === sm.family && sm.painted >= 1,
			`${ id } paints on the sheet (${ sm.painted })`
		);
	}

	// A motif: a text read as a mask; the society paints inside it. The
	// canvas of the mock is empty, so that source refuses to start.
	const setMotif = async ( v ) => {
		await page
			.locator( '.wpiechaos-side .dsm-select' )
			.first()
			.evaluate( ( el, val ) => {
				el.value = val;
				el.dispatchEvent( new Event( 'change', { bubbles: true } ) );
			}, v );
		await page.waitForTimeout( 250 );
	};
	await tile( SCHOOL.sumi ).click();
	await page.waitForTimeout( 250 );
	await setMotif( 'canvas' );
	await page.locator( '.wpiechaos-start' ).click();
	await page.waitForTimeout( 1200 );
	{
		const sm = await state();
		check(
			! sm.started && ! sm.running,
			'an empty canvas refuses to be a motif'
		);
	}
	await setMotif( 'text' );
	await page.locator( '.wpiechaos-text' ).fill( 'CHAOS' );
	await page.locator( '.wpiechaos-start' ).click();
	await page.waitForTimeout( 3500 );
	{
		const sm = await state();
		check(
			sm.running && 'text' === sm.motif && sm.painted >= 1,
			`a text motif paints (${ sm.painted })`
		);
	}
	await setMotif( 'none' );
	await page.waitForTimeout( 250 );

	// Into space: the family swaps the engine, the look dials appear,
	// the schooled ensemble paints.
	await tile( SPACE0 + 1 ).click();
	await page.waitForTimeout( 400 );
	check(
		( await page.locator( '.wpiechaos-side .dsm-card-head' ).count() ) >= 4,
		'in space the right dock grows the look section'
	);
	check(
		'' ===
			( await page
				.locator( '.wpiechaos-left .dsm-card' )
				.first()
				.evaluate( ( el ) => el.style.display ) ),
		'the art movement card shows in space'
	);
	await page.locator( '.wpiechaos-start' ).click();
	await page.waitForTimeout( 3200 );
	{
		const sm = await state();
		check(
			sm.running && 'space' === sm.family && sm.painted > 5,
			`ink paints in space (${ sm.painted })`
		);
	}
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
	await tile( SPACE0 ).click();
	await page.waitForTimeout( 250 );
	await page.locator( '.wpiechaos-start' ).click();
	// Staggered entrances on a software GPU: the claim is "it paints".
	await page.waitForTimeout( 4000 );
	{
		const sm = await state();
		check(
			'bauhaus' === sm.movementId &&
				'space' === sm.family &&
				sm.painted > 1,
			`the schooled ensemble paints in space (${ sm.painted })`
		);
	}
	await setMovement( 'free' );

	// Back to the sheet for the full flow: action painting, the loudest.
	await tile( SCHOOL.action ).click();
	await page.waitForTimeout( 400 );
	check(
		3 ===
			( await page.locator( '.wpiechaos-side .dsm-card-head' ).count() ),
		'back on the sheet the look and pointer sections are gone again'
	);
	await page.locator( '.wpiechaos-start' ).click();
	await page.waitForTimeout( 4000 );
	let s = await state();
	check(
		s.started && s.running && 'flat' === s.family,
		'painting is running'
	);
	check( s.painted > 4, `the society paints (${ s.painted } marks)` );

	// A school picked while painting changes the language, not the piece.
	{
		await tile( SCHOOL.action ).click();
		await page.waitForTimeout( 250 );
		await startFresh();
		await page.waitForTimeout( 1500 );
		const before = await state();
		await tile( SCHOOL.impressionism ).click();
		await page.waitForTimeout( 300 );
		const after = await state();
		check(
			after.started &&
				after.running &&
				'impressionism' === after.voice &&
				before.painted <= after.painted,
			`a school picked mid-piece switches the voice (${ after.voice }, ${ after.painted } marks kept)`
		);
		await tile( 1 ).click();
		await page.waitForTimeout( 300 );
		const mixed = await state();
		check(
			mixed.started && mixed.mixed,
			'the ensemble on the sheet mixes mid-piece'
		);
		await tile( SCHOOL.action ).click();
		await page.waitForTimeout( 300 );
	}

	// A click on the sheet is a burst of colour there; a drag is a call.
	{
		const sheet = page.locator( '.wpiechaos-flat' ).first();
		const bb = await sheet.boundingBox();
		await page.mouse.click( bb.x + bb.width * 0.5, bb.y + bb.height * 0.5 );
		// The burst overlay lives 1.6 s; give the click's frame time to land.
		await page
			.waitForFunction( () => !! window.__wpiechaosState().burst, null, {
				timeout: 1500,
			} )
			.catch( () => {} );
		const sb = await state();
		check( sb.burst, 'a click on the sheet bursts color there' );
		await page.mouse.move( bb.x + bb.width * 0.2, bb.y + bb.height * 0.7 );
		await page.mouse.down();
		for ( let i = 1; i <= 12; i++ ) {
			await page.mouse.move(
				bb.x + bb.width * ( 0.2 + i * 0.05 ),
				bb.y + bb.height * ( 0.7 - i * 0.02 )
			);
		}
		await page.mouse.up();
		await page.waitForTimeout( 150 );
		const sc = await state();
		check( sc.calls >= 1, `a drawn stroke is a call (${ sc.calls })` );
	}

	// The snapshot ring proves real pixels: it draws the sheet and stores
	// a JPEG of what was actually on screen.
	await page.waitForTimeout( 3000 );
	s = await state();
	check( s.snapshots >= 1, `snapshot ring fills (${ s.snapshots })` );
	const snapInfo = await page.evaluate( async () => {
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
		let n = 0;
		let sum = 0;
		let sq = 0;
		for ( let i = 0; i < data.length; i += 4 * 53 ) {
			const l = ( data[ i ] + data[ i + 1 ] + data[ i + 2 ] ) / 3;
			n++;
			sum += l;
			sq += l * l;
		}
		const mean = sum / n;
		return {
			w: img.width,
			h: img.height,
			spread: Math.sqrt( Math.max( 0, sq / n - mean * mean ) ),
		};
	} );
	check(
		snapInfo.spread > 8,
		`snapshot carries paint, not just ground (spread ${ snapInfo.spread.toFixed(
			1
		) })`
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
			() => !! document.querySelector( '.wpiechaos-moment.is-live img' )
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
	{
		const bio = await page.evaluate( () => {
			const el = document.querySelector( '.wpiechaos-bio' );
			return el ? el.textContent : '(no bio)';
		} );
		check(
			/Action [Pp]ainting/.test( bio ),
			`the bio names the school (${ bio })`
		);
	}

	// Insert: the primary lands a generator layer covering the document.
	await page.locator( '.dsm-actions .ai-btn.primary' ).click();
	await page.waitForTimeout( 2500 );
	const landed = await page.evaluate( () => {
		const add = window.__dispatched.find( ( a ) => 'ADD_LAYER' === a.type );
		if ( ! add ) {
			return null;
		}
		const l = add.layer;
		return {
			gen: l.generator && l.generator.id,
			styleId:
				l.generator && l.generator.params && l.generator.params.styleId,
			w: l.w,
			h: l.h,
			x: l.x,
			y: l.y,
			nw: l.naturalW,
			nh: l.naturalH,
			src: String( l.src || '' ).slice( 0, 22 ),
		};
	} );
	check( !! landed, 'insert dispatches ADD_LAYER' );
	if ( landed ) {
		check(
			'wpie-chaos-art/piece' === landed.gen,
			'layer carries the generator id'
		);
		check( 'action' === landed.styleId, 'the params remember the school' );
		check(
			1600 === landed.w &&
				1000 === landed.h &&
				0 === landed.x &&
				0 === landed.y,
			'the piece covers the document'
		);
		check(
			landed.nh >= 1000 && Math.abs( landed.nw / landed.nh - 1.6 ) < 0.02,
			`the still is painted at picture resolution (${ landed.nw }x${ landed.nh })`
		);
		check(
			landed.src.startsWith( 'data:image/png' ),
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
