/**
 * Dialog QA for Soundwave Art.
 *
 * The shared baseline opens the studio, nudges every control in the
 * panel and reports the ones that change nothing, then presses the
 * primary button and checks that what reaches the editor holds together.
 *
 * That is deliberately the same set of questions for every studio,
 * because the defects that reached users this week were the same set of
 * mistakes: a control wired to nothing, a group listing a child twice, a
 * layer filed under a parent that was not there.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStage, launchQA } from '../../shared/qa-kit/stage.mjs';
import { baseline } from '../../shared/qa-kit/baseline.mjs';

const root = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..' );
const stage = await buildStage( { root } );
const qa = await launchQA( { stage, shotDir: path.join( root, 'dist' ) } );

const { page, check } = qa;

// v2.5: a fresh studio opens on the example sound, never on an empty
// frame - so it is checked before the baseline nudges anything.
await page.waitForFunction(
	() => /Beispielklang/.test( document.querySelector( '.wpiesnd-coords' )?.textContent || '' ),
	null,
	{ timeout: 20000 }
);
const ink = () =>
	page.evaluate( () => {
		const c = document.querySelector( '.wpiesnd-view canvas' );
		const d = c.getContext( '2d' ).getImageData( 0, 0, c.width, c.height ).data;
		let on = 0;
		for ( let i = 3; i < d.length; i += 4 * 13 ) {
			if ( d[ i ] > 8 ) {
				on++;
			}
		}
		return on;
	} );
const fingerprint = () =>
	page.evaluate( () => document.querySelector( '.wpiesnd-view canvas' ).toDataURL().length );
check( ( await ink() ) > 200, 'the studio opens on a wave, not an empty frame' );
check(
	( await page.locator( '.wpiesnd-shape' ).count() ) >= 14,
	'the spectrogram and the mandala are offered'
);
const before = await fingerprint();
for ( const name of [ 'Spektrogramm', 'Klang-Mandala' ] ) {
	await page.locator( `.wpiesnd-shape[aria-label="${ name }"]` ).click();
	await page.waitForTimeout( 500 );
	check( ( await fingerprint() ) !== before, `${ name } draws something of its own` );
	check( ( await ink() ) > 200, `and ${ name } is not empty` );
}
await page.locator( '.wpiesnd-shape[aria-label="Balken"]' ).click();
check(
	( await page.locator( '.wpiesnd-record' ).count() ) === 1,
	'the microphone is offered as a source'
);

await baseline( qa, {
	insert: true,
	settle: 700,
	allowInert: 0,
	// The microphone needs a person and a permission prompt.
	skip: [ 'mit dem mikrofon aufnehmen' ],
} );
await qa.shot( 'qa-dialog.png' );

process.exit( await qa.finish() );
