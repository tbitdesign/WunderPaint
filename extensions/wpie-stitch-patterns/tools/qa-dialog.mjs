/**
 * Dialog QA for Stitch Patterns.
 *
 * The shared baseline opens the studio, nudges every control in the
 * panel and reports the ones that change nothing, then presses the
 * primary button and checks that what reaches the editor holds together.
 *
 * That is deliberately the same set of questions for every studio,
 * because the defects that reached users this week were the same set of
 * mistakes: a control wired to nothing, a group listing a child twice, a
 * layer filed under a parent that was not there.
 *
 * A second pass does the same for the string art board (2.8): it winds,
 * tells the thread length, changes with the board shape, hands out the
 * nail template as a PDF and inserts the board with its winding guide.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStage, launchQA } from '../../shared/qa-kit/stage.mjs';
import { baseline } from '../../shared/qa-kit/baseline.mjs';

const root = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..' );
const stage = await buildStage( { root } );
const qa = await launchQA( { stage, shotDir: path.join( root, 'dist' ) } );

await baseline( qa, {
	insert: true,
	settle: 700,
	// Cycling the source lands on the media library, whose picker then
	// sits over the dialog and swallows the insert click. The PDF and the
	// film are files, not changes to the preview; they are checked below.
	skip: [ 'quelle', 'vorlage als pdf', 'wickeln als video' ],
} );
await qa.shot( 'qa-dialog.png' );
let failed = await qa.finish();

const strings = await launchQA( { stage, shotDir: path.join( root, 'dist' ) } );
const { page, check } = strings;
const wound = () =>
	page.waitForFunction(
		() =>
			/\d+ m/.test(
				document.querySelector( '.wpiestp-side .wpiestp-info' )
					?.textContent || ''
			) &&
			! document
				.querySelector( '.wpiestp-status' )
				?.classList.contains( 'on' ),
		{ timeout: 30000 }
	);
// The stand-in document is empty paper; a board needs a picture.
await page.selectOption( 'select[aria-label="Quelle"]', 'media' );
await page.click( '.mock-media-item' );
await page.waitForFunction( () => ! document.querySelector( '.mock-pick' ) );
await page.click( '[data-mode="stringart"]' );
await wound();
const facts = await page.evaluate(
	() => document.querySelector( '.wpiestp-side .wpiestp-info' ).textContent
);
const threads = Number( ( facts.match( /(\d+) Fäden/ ) || [] )[ 1 ] || 0 );
check(
	/cm/.test( facts ) && /[1-9]\d* m/.test( facts ) && threads > 50,
	'String art winds and tells board size and thread length: ' + facts
);
const shot = () =>
	page.evaluate( () => {
		const c = document.querySelector( '.wpiestp-view canvas' );
		return c.toDataURL().length + ':' + c.width + 'x' + c.height;
	} );
const round = await shot();
await page.selectOption(
	'.wpiestp-side select:has(option[value="heart"])',
	'heart'
);
await page.waitForTimeout( 300 );
await wound();
check( ( await shot() ) !== round, 'A heart board winds a different picture' );
const [ download ] = await Promise.all( [
	page.waitForEvent( 'download', { timeout: 30000 } ),
	page.click( 'text=Nagelschablone (PDF)' ),
] );
const file = await download.path();
const { statSync, readFileSync } = await import( 'node:fs' );
check(
	/\.pdf$/.test( download.suggestedFilename() ) &&
		statSync( file ).size > 2000 &&
		readFileSync( file ).subarray( 0, 8 ).toString() === '%PDF-1.4',
	'The nail template downloads as a PDF'
);
/* ---------------------------------- v2.9 ---------------------------------- */

const studio = ( what ) => page.evaluate( ( w ) => window.__stitchStudio[ w ](), what );

// String art in two colours: two threads, wound one after the other.
await page.selectOption( '.wpiestp-side select:has(option[value="3"]):has(option[value="4"])', '2' );
await page.waitForTimeout( 300 );
await wound();
const colourPlan = await studio( 'plan' );
check( colourPlan && 2 === colourPlan.layers, `two thread colours wind two threads (${ JSON.stringify( colourPlan ) })` );

// The winding as a film (a GIF where this browser has no H.264).
const [ film ] = await Promise.all( [
	page.waitForEvent( 'download', { timeout: 240000 } ),
	page.click( 'text=Wickeln als Video' ),
] );
check(
	/\.(gif|mp4)$/.test( film.suggestedFilename() ) && statSync( await film.path() ).size > 40000,
	`the winding comes out as a video (${ film.suggestedFilename() })`
);
await page.selectOption( '.wpiestp-side select:has(option[value="3"]):has(option[value="4"])', '1' );

// Cross-stitch names its threads in DMC, and the pattern prints.
await page.click( '[data-mode="crossstitch"]' );
await page.waitForTimeout( 900 );
const chart = await studio( 'grid' );
check(
	chart && chart.codes && 'DMC' === chart.codes[ 0 ].brand,
	`cross-stitch colours are DMC threads (${ chart && chart.codes ? chart.codes.slice( 0, 3 ).map( ( c ) => c.code ).join( ', ' ) : 'none' })`
);
const [ pattern ] = await Promise.all( [
	page.waitForEvent( 'download', { timeout: 60000 } ),
	page.click( 'text=Vorlage als PDF' ),
] );
const pdf = await pattern.path();
check(
	readFileSync( pdf ).subarray( 0, 8 ).toString() === '%PDF-1.4' && statSync( pdf ).size > 60000,
	`the pattern downloads as a PDF (${ Math.round( statSync( pdf ).size / 1024 ) } KB)`
);

// Knitting as Fair Isle: the floats are counted.
await page.click( '[data-mode="knitting"]' );
await page.waitForTimeout( 600 );
await page.click( 'text=Fair Isle (zwei Farben pro Reihe)' );
await page.waitForTimeout( 900 );
const fair = await studio( 'grid' );
check( fair && 'number' === typeof fair.floats, `Fair Isle marks the long floats (${ fair && fair.floats })` );
await page.click( 'text=Fair Isle (zwei Farben pro Reihe)' );
await page.click( '[data-mode="stringart"]' );
await wound();

/* ---------------------------------- v3.0 ---------------------------------- */

// The crafts from the proof sheet: each draws a sheet of its own.
const ink = () =>
	page.evaluate( () => {
		const c = document.querySelector( '.wpiestp-view canvas' );
		const d = c.getContext( '2d' ).getImageData( 0, 0, c.width, c.height ).data;
		let n = 0;
		for ( let i = 0; i < d.length; i += 4 * 7 ) {
			if ( d[ i ] + d[ i + 1 ] + d[ i + 2 ] < 690 ) {
				n++;
			}
		}
		return n;
	} );
check(
	( await page.locator( '.wpiestp-subhead' ).count() ) === 2,
	'the crafts come in two groups'
);
for ( const id of [ 'beadweave', 'filet', 'blackwork', 'quilt', 'hitomezashi', 'bracelet' ] ) {
	await page.click( `[data-mode="${ id }"]` );
	await page.waitForTimeout( 900 );
	check( ( await ink() ) > 300, `${ id } draws a sheet` );
	check(
		await page.evaluate( () => ! document.querySelector( '.dsm-actions .ai-btn.primary' ).disabled ),
		`and ${ id } can be inserted`
	);
}
await page.selectOption( '.wpiestp-side select:has(option[value="chevron"])', 'chevron' );
await page.waitForTimeout( 700 );
check( ( await ink() ) > 300, 'the chevron bracelet draws its knots' );
await page.click( '[data-mode="beadweave"]' );
await page.selectOption( '.wpiestp-side select:has(option[value="brick"])', 'brick' );
await page.waitForTimeout( 700 );
check( ( await ink() ) > 300, 'brick stitch draws its beads' );
await page.click( '[data-mode="stringart"]' );
await wound();

await strings.shot( 'qa-strings.png' );
await baseline( strings, {
	insert: true,
	// Winding again takes a moment in a software-rendered browser.
	settle: 2500,
	// Paper and the guide sheet only matter for the template and the
	// insert; the preview rightly stays the same.
	// (The thread count may show up as changing nothing: on the heart the
	// test plate is finished before the default count, and winding on
	// would only grey it - the planner stops on its own.)
	skip: [ 'quelle', 'papier', 'anleitungsblatt', 'wickeln als video' ],
} );
failed = ( await strings.finish() ) || failed;

process.exit( failed );
