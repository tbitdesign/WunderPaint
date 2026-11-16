/**
 * Dialog QA for Map Posters.
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

/* ------------------- v2.1: the poster types all draw ------------------- */

// Every type card must repaint the poster, and none may throw. Several
// places must take a second place, the lettering starts from the place
// name, the directions sketch sets a pin.
const preview = `( () => {
	const cs = [ ...document.querySelectorAll( '.wpiemap-view canvas' ) ];
	const c = cs.sort( ( a, b ) => b.width * b.height - a.width * a.height )[ 0 ];
	if ( ! c ) return 'none';
	const d = c.getContext( '2d' ).getImageData( 0, 0, c.width, c.height ).data;
	let h = 0;
	for ( let i = 0; i + 3 < d.length; i += 41 ) h = ( h * 31 + d[ i ] + d[ i + 1 ] * 7 + d[ i + 2 ] * 3 + d[ i + 3 ] * 11 ) >>> 0;
	return h;
} )()`;
await qa.page.waitForTimeout( 1500 );
let last = await qa.page.evaluate( preview );
for ( const type of [ 'figure', 'water', 'compass', 'antique', 'directions', 'lettering', 'places', 'classic' ] ) {
	const card = qa.page.locator( `[data-type="${ type }"]` );
	qa.check( ( await card.count() ) === 1, `the ${ type } card is offered` );
	if ( ! ( await card.count() ) ) {
		continue;
	}
	await card.click();
	await qa.page.waitForTimeout( 1200 );
	qa.check(
		( await qa.page.locator( `[data-type="${ type }"].is-on` ).count() ) === 1,
		`the ${ type } card is marked`
	);
	const now = await qa.page.evaluate( preview );
	qa.check( now !== last, `the ${ type } type repaints the poster` );
	last = now;
	if ( 'lettering' === type ) {
		const letters = await qa.page.locator( '.wpiemap-side input[type="text"]' ).first().inputValue();
		qa.check( letters.length > 0 && letters === letters.toUpperCase(), `the lettering starts from the place name (${ letters })` );
	}
	if ( 'directions' === type ) {
		qa.check( ( await qa.page.locator( '.wpiemap-pin' ).count() ) >= 1, 'the directions sketch sets a pin' );
	}
	if ( 'places' === type ) {
		await qa.page.locator( '.wpiemap-places + .wpiemap-addpin' ).click();
		await qa.page.waitForTimeout( 1200 );
		qa.check( ( await qa.page.locator( '.wpiemap-place' ).count() ) === 2, 'a second place joins the poster' );
		qa.check(
			( await qa.page.locator( '.wpiemap-place.is-on' ).count() ) === 1 &&
				( await qa.page.locator( '.wpiemap-place' ).nth( 1 ).evaluate( ( n ) => n.classList.contains( 'is-on' ) ) ),
			'the new place is the one being edited'
		);
	}
}

await baseline( qa, {
	insert: true,
	settle: 700,
	allowInert: 0,
} );
await qa.shot( 'qa-dialog.png' );

process.exit( await qa.finish() );
