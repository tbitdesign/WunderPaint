/**
 * Headless QA for painting to a song (1.12), mechanical only - the look is
 * judged in the editor: the music card sits under the motif on the sheet,
 * a picked song is read in the browser, the self-directing checkbox steps
 * aside while a song is chosen and comes back without one, Start waits for
 * the song, Their choice stays on the sheet, the society paints to the
 * song's clock, the last note finishes the piece (moments up, Start says
 * finished), the piece's bio names the song, and the insert still lands
 * the generator layer. Since 1.12.2: the card says in words what the
 * painters heard, and each moment in the strip carries its song time.
 *
 * The song is synthetic - kicks at 120 BPM for six seconds - and reaches
 * the picker as a blob URL: the stage runs from file://, where fetch fails.
 *
 * Usage: node tools/qa-music.mjs
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildStage, launchQA } from '../../shared/qa-kit/stage.mjs';

const here = path.dirname( fileURLToPath( import.meta.url ) );
const root = path.resolve( here, '..' );

/** A mono 16-bit WAV: a kick every half second, a little noise between. */
function kickWav( seconds = 6, sr = 22050 ) {
	const n = Math.round( seconds * sr );
	const pcm = new Int16Array( n );
	let s = 7;
	for ( let i = 0; i < n; i++ ) {
		s = ( Math.imul( s, 1103515245 ) + 12345 ) & 0x7fffffff;
		const t = i / sr;
		const k = ( t % 0.5 ) * sr;
		const kick =
			k < sr * 0.12
				? 0.7 *
				  Math.exp( -k / ( sr * 0.03 ) ) *
				  Math.sin( ( 2 * Math.PI * 60 * k ) / sr )
				: 0;
		const v = kick + ( ( s / 0x7fffffff ) * 2 - 1 ) * 0.01;
		pcm[ i ] = Math.max( -32767, Math.min( 32767, Math.round( v * 32767 ) ) );
	}
	const head = Buffer.alloc( 44 );
	head.write( 'RIFF', 0 );
	head.writeUInt32LE( 36 + n * 2, 4 );
	head.write( 'WAVEfmt ', 8 );
	head.writeUInt32LE( 16, 16 );
	head.writeUInt16LE( 1, 20 );
	head.writeUInt16LE( 1, 22 );
	head.writeUInt32LE( sr, 24 );
	head.writeUInt32LE( sr * 2, 28 );
	head.writeUInt16LE( 2, 32 );
	head.writeUInt16LE( 16, 34 );
	head.write( 'data', 36 );
	head.writeUInt32LE( n * 2, 40 );
	return Buffer.concat( [ head, Buffer.from( pcm.buffer ) ] );
}

const stage = await buildStage( {
	root,
	out: path.join( root, 'dist', 'qa-music-stage' ),
} );
fs.cpSync( path.join( root, 'thumbs' ), path.join( stage, 'thumbs' ), {
	recursive: true,
} );
const qa = await launchQA( { stage, shotDir: path.join( root, 'dist' ) } );
const { page, check } = qa;
const state = () => page.evaluate( () => window.__wpiechaosState() );
const heads = () =>
	page.locator( '.wpiechaos-side .dsm-card-head' ).allTextContents();
const selfDial = () =>
	page
		.locator( '.wpiechaos-side .dsm-checkrow', {
			hasText: 'Sie stellen die Regler selbst',
		} )
		.count();
const songButton = ( label ) =>
	page.locator( '.wpiechaos-side .ai-btn', { hasText: label } );

try {
	await page.waitForTimeout( 600 );
	const h = await heads();
	check(
		4 === h.length && /Musik/.test( h[ 1 ] ),
		`the music card sits under the motif (${ h.join( ' | ' ) })`
	);
	check( 1 === ( await selfDial() ), 'without a song they set the dials' );

	// The song, as the picker would hand it over.
	await page.evaluate( ( b64 ) => {
		const bytes = Uint8Array.from( atob( b64 ), ( c ) => c.charCodeAt( 0 ) );
		const url = URL.createObjectURL(
			new Blob( [ bytes ], { type: 'audio/wav' } )
		);
		window.WPIE.pickMedia = () =>
			Promise.resolve( [ { id: 77, url, title: 'qa-song' } ] );
	}, kickWav().toString( 'base64' ) );

	// Charge the field.
	const field = page.locator( '.wpiechaos-field' );
	const fb = await field.boundingBox();
	for ( let i = 0; i < 260; i++ ) {
		await page.mouse.move(
			fb.x + 30 + ( ( i * 23 ) % Math.max( 40, fb.width - 60 ) ),
			fb.y + 30 + ( ( i * 31 ) % Math.max( 40, fb.height - 60 ) )
		);
	}

	await songButton( 'Song wählen' ).click();
	await page.waitForFunction(
		() => 'ready' === window.__wpiechaosState().music.status,
		null,
		{ timeout: 20000 }
	);
	let s = await state();
	check( 'qa-song' === s.music.title, 'the picked song is read' );
	const heard =
		( await page
			.locator( '.wpiechaos-side .wpiechaos-heard' )
			.allTextContents() )[ 0 ] || '';
	check(
		/^Die Maler hören: \S/.test( heard ) && /fester Beat/.test( heard ),
		`the card says what the painters heard (${ heard })`
	);
	check(
		0 === ( await selfDial() ),
		'with a song the self-directing checkbox steps aside'
	);
	check(
		! ( await page
			.locator( '.wpiechaos-start' )
			.evaluate( ( el ) => el.disabled ) ),
		'charged and the song read: Start is open'
	);

	// Remove and choose again: the checkbox comes back in between.
	await songButton( 'Song entfernen' ).click();
	await page.waitForTimeout( 200 );
	check( 1 === ( await selfDial() ), 'without the song the checkbox is back' );
	await songButton( 'Song wählen' ).click();
	await page.waitForFunction(
		() => 'ready' === window.__wpiechaosState().music.status,
		null,
		{ timeout: 20000 }
	);

	await page.locator( '.wpiechaos-start' ).click();
	await page.waitForTimeout( 1200 );
	s = await state();
	check( s.started && s.running, 'the society paints' );
	check( s.music.conducted, 'painting to the song' );
	check( 'flat' === s.family, 'their choice stays on the sheet with a song' );

	await page.waitForFunction(
		() => window.__wpiechaosState().music.ended,
		null,
		{ timeout: 20000 }
	);
	await page.waitForTimeout( 600 );
	s = await state();
	check( ! s.running, 'the last note stops the painters' );
	check( s.painted > 0, `the song left paint (${ s.painted } marks)` );
	check(
		await page
			.locator( '.wpiechaos-start' )
			.evaluate( ( el ) => el.disabled ),
		'Start says the piece is finished'
	);
	check(
		( await page.locator( '.wpiechaos-moment' ).count() ) >= 1,
		'the moments come up'
	);
	const times = await page
		.locator( '.wpiechaos-moment .wpiechaos-moment-time' )
		.allTextContents();
	check(
		times.length >= 1 && times.every( ( x ) => /^0:0\d$/.test( x ) ),
		`each moment carries its song time (${ times.join( ' ' ) })`
	);
	const bio = await page.evaluate( () => {
		const el = document.querySelector( '.wpiechaos-bio' );
		return el ? el.textContent : '(no bio)';
	} );
	check( /qa-song/.test( bio ), `the bio names the song (${ bio })` );

	await page.locator( '.dsm-actions .ai-btn.primary' ).click();
	await page.waitForTimeout( 2500 );
	const landed = await page.evaluate( () => {
		const add = window.__dispatched.find( ( a ) => 'ADD_LAYER' === a.type );
		return add && add.layer.generator ? add.layer.generator.id : null;
	} );
	check(
		'wpie-chaos-art/piece' === landed,
		'insert lands the generator layer'
	);
} catch ( e ) {
	check( false, 'threw: ' + ( e && e.message ) );
}

process.exit( await qa.finish() );
