/**
 * Dialog QA for Text Art.
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

// The sweep is NOT allowed to press Insert here. Moving every control
// includes setting the source to an image, which opens the media picker -
// and its overlay then eats the click on the primary button, so the check
// timed out rather than failing, and the studio looked green from a
// distance. The insert is checked below, with the picker put away first.
await baseline( qa, {
	insert: false,
	settle: 700,
	allowInert: 0,
} );
await qa.shot( 'qa-dialog.png' );

/* ------------------------- drawn with lines ---------------------------- */

const { page, check } = qa;
// The sweep above may have opened the media picker and left it standing;
// its overlay eats every click that follows.
if ( await page.locator( '.mock-pick-done' ).count() ) {
	await page.locator( '.mock-pick-done' ).click();
	await page.waitForTimeout( 400 );
}
const shot = async () => page.evaluate( () => {
	const c = window.__ta.canvas;
	const g = c.getContext( '2d' );
	const d = g.getImageData( 0, 0, c.width, c.height ).data;
	// Ink is what DIFFERS from the paper, not what is dark: on a dark
	// ground every empty pixel counted as ink and an empty drawing
	// reported ninety-seven per cent.
	const paper = [ d[ 0 ], d[ 1 ], d[ 2 ] ];
	let ink = 0;
	for ( let i = 0; i < d.length; i += 4 ) {
		if ( Math.abs( d[ i ] - paper[ 0 ] ) + Math.abs( d[ i + 1 ] - paper[ 1 ] ) + Math.abs( d[ i + 2 ] - paper[ 2 ] ) > 90 ) {
			ink++;
		}
	}
	return { sig: c.toDataURL().slice( -140 ), ink, px: c.width * c.height };
} );

// A drawing needs a picture with tone in it. The mock document flattens
// to white, and on white there is nothing to draw - so the harness picks
// one of the library plates, exactly the way a user would.
await page.selectOption( '.wpieta-row select', { index: 1 } ).catch( () => {} );
const srcSel = page.locator( 'select' ).first();
await srcSel.selectOption( 'media' ).catch( () => {} );
await page.waitForSelector( '.mock-pick', { timeout: 8000 } ).catch( () => {} );
await page.locator( '.mock-pick .mock-media-item' ).first().click().catch( () => {} );
await page.waitForTimeout( 1500 );
const hasTone = await page.evaluate( () => {
	const p = window.__ta.probe( 'contour' );
	return 'string' === typeof p ? { lo: 1, hi: 1 } : p;
} );
check( hasTone.hi - hasTone.lo > 0.05, `the studio is drawing from a picture with tone in it (${ hasTone.lo } to ${ hasTone.hi })` );

const drawings = {};
for ( const mode of [ 'engrave', 'contour', 'stipple', 'oneline' ] ) {
	await page.evaluate( ( m ) => window.__ta.pick( m ), mode );
	await page.waitForTimeout( 1800 );
	drawings[ mode ] = await shot();
	check( drawings[ mode ].ink > drawings[ mode ].px * 0.01, `${ mode } puts ink on the paper (${ Math.round( ( drawings[ mode ].ink / drawings[ mode ].px ) * 100 ) }%)` );
}
check(
	new Set( Object.values( drawings ).map( ( d ) => d.sig ) ).size === 4,
	'each pen draws its own picture from the same photo'
);
await qa.shot( 'qa-lines.png' );

// A dial has to move the drawing.
await page.evaluate( () => window.__ta.pick( 'engrave' ) );
await page.waitForTimeout( 1500 );
const before = ( await shot() ).sig;
await page.evaluate( () => {
	window.__ta.params.lineSpacing = 12;
	window.__ta.pick( 'engrave' );
} );
await page.waitForTimeout( 1500 );
check( before !== ( await shot() ).sig, 'the line spacing changes the engraving' );

// And the ink can leave as paths instead of pixels. The document is set to
// the proportions of the source first: a drawing OF the canvas must arrive
// covering it, which is exactly what the 0.92 fit used to get wrong.
await page.evaluate( () => {
	window.__dispatched.length = 0;
	const s = window.__ta.srcSize();
	window.__editor.state.doc = { w: 1600, h: Math.round( ( 1600 * s.h ) / s.w ) };
	window.__ta.params.lineVector = true;
	window.__ta.pick( 'contour' );
} );
await page.waitForTimeout( 1800 );
await page.locator( '.dsm-actions .ai-btn.primary' ).click();
await page.waitForFunction( () => ( window.__dispatched || [] ).some( ( a ) => 'ADD_LAYER' === a.type ), null, { timeout: 60000 } ).catch( () => {} );
const vector = await page.evaluate( () => {
	const add = ( window.__dispatched || [] ).find( ( a ) => 'ADD_LAYER' === a.type );
	const l = add && add.layer;
	return {
		type: l && l.type,
		shape: l && l.shape,
		moves: l && l.pathD ? ( l.pathD.match( /M/g ) || [] ).length : 0,
		gen: l && l.generator && l.generator.id,
		mode: l && l.generator && l.generator.params && l.generator.params.mode,
		cover: l ? ( l.w * l.h ) / ( window.__editor.state.doc.w * window.__editor.state.doc.h ) : 0,
	};
} );
check( 'shape' === vector.type && 'path' === vector.shape && vector.moves > 4, `the ink leaves as one vector path (${ vector.moves } subpaths)` );
check( 'wpie-text-art/sheet' === vector.gen && 'contour' === vector.mode, 'stamped with its own recipe' );
// A drawing of the canvas has the canvas' proportions, so it must arrive
// covering it - not fit inside with a margin.
check( vector.cover > 0.98, `it arrives at canvas size (${ Math.round( vector.cover * 100 ) }% of the document)` );

// And a glyph card still leaves as pixels, the way all twenty-five do.
// Inserting closed the studio, so it is opened again the way the editor
// opens it.
await page.evaluate( () => {
	window.__dispatched.length = 0;
	window.__gen.run( { editor: window.__editor, extras: { toasts: { error: () => {}, success: () => {} } }, layer: null } );
} );
await page.waitForTimeout( 1500 );
await page.evaluate( () => window.__ta.pick( 'ascii' ) );
await page.waitForTimeout( 1500 );
await page.locator( '.dsm-actions .ai-btn.primary' ).click();
await page.waitForFunction( () => ( window.__dispatched || [] ).some( ( a ) => 'ADD_LAYER' === a.type ), null, { timeout: 60000 } ).catch( () => {} );
const pixels = await page.evaluate( () => {
	const add = ( window.__dispatched || [] ).find( ( a ) => 'ADD_LAYER' === a.type );
	const l = add && add.layer;
	return { type: l && l.type, png: !! ( l && l.src && 0 === l.src.indexOf( 'data:image/png' ) ) };
} );
check( 'image' === pixels.type && pixels.png, 'a glyph card still arrives as an image layer' );

process.exit( await qa.finish() );
