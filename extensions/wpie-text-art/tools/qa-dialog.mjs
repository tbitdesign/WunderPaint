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


/* ------------------------------- 3.5 ----------------------------------- */

// The shelf stands in four groups, and every card is in one of them.
await page.evaluate( () => {
	window.__dispatched.length = 0;
	window.__gen.run( { editor: window.__editor, extras: { toasts: { error: () => {}, success: () => {} } }, layer: null } );
} );
await page.waitForTimeout( 1500 );
const shelf = await page.evaluate( () => ( {
	groups: document.querySelectorAll( '.wpieta-subhead' ).length,
	cards: document.querySelectorAll( '.wpieta-tcard' ).length,
} ) );
check( 4 === shelf.groups && shelf.cards >= 34, `the shelf stands in four groups (${ shelf.groups } groups, ${ shelf.cards } cards)` );

// The four new cards draw from the picture.
await srcSel.selectOption( 'media' ).catch( () => {} );
await page.waitForSelector( '.mock-pick', { timeout: 8000 } ).catch( () => {} );
await page.locator( '.mock-pick .mock-media-item' ).first().click().catch( () => {} );
await page.waitForTimeout( 1500 );
const fresh = {};
for ( const mode of [ 'string', 'morse', 'cards', 'pins' ] ) {
	await page.evaluate( ( m ) => window.__ta.pick( m ), mode );
	await page.waitForTimeout( 2500 );
	fresh[ mode ] = await shot();
	check( fresh[ mode ].ink > fresh[ mode ].px * 0.01, `${ mode } draws (${ Math.round( ( fresh[ mode ].ink / fresh[ mode ].px ) * 100 ) }%)` );
}
check( new Set( Object.values( fresh ).map( ( d ) => d.sig ) ).size === 4, 'each new card draws its own picture' );
await qa.shot( 'qa-new-cards.png' );

/* ------------------------------- 3.6 ----------------------------------- */

// Several thread colours: the board is wound in colour, the mono board
// carries none, and pinned colours are the threads.
const tint = async () => page.evaluate( () => {
	const c = window.__ta.canvas;
	const d = c.getContext( '2d' ).getImageData( 0, 0, c.width, c.height ).data;
	let red = 0, sat = 0;
	for ( let i = 0; i < d.length; i += 4 ) {
		const hi = Math.max( d[ i ], d[ i + 1 ], d[ i + 2 ] ), lo = Math.min( d[ i ], d[ i + 1 ], d[ i + 2 ] );
		if ( hi - lo > 50 ) {
			sat++;
		}
		if ( d[ i ] > d[ i + 1 ] + 70 && d[ i ] > d[ i + 2 ] + 70 ) {
			red++;
		}
	}
	return { sat, red };
} );
await page.evaluate( () => window.__ta.pick( 'string' ) );
await page.waitForTimeout( 2500 );
const mono = await tint();
const colorsRow = await page.evaluate( () =>
	[ ...document.querySelectorAll( '.wpieta-row' ) ].some( ( r ) => r.offsetParent && /Fadenfarben|Thread colors/.test( r.textContent ) )
);
check( colorsRow, 'string art offers its thread colors' );
await page.evaluate( () => {
	window.__ta.params.stringColors = 3;
	window.__ta.pick( 'string' );
} );
await page.waitForTimeout( 5000 );
const multi = await tint();
check( multi.sat > mono.sat * 4 + 200, `several threads wind in color (${ mono.sat } -> ${ multi.sat } colored pixels)` );
await qa.shot( 'qa-string-auto.png' );
await page.evaluate( () => {
	window.__ta.params.stringColors = 2;
	window.__ta.params.customColors = [ '#1a1a1a', '#e01020' ];
	window.__ta.pick( 'string' );
} );
await page.waitForTimeout( 5000 );
const pinned = await tint();
check( pinned.red > 200, `a pinned red is a red thread (${ pinned.red } red pixels)` );
await qa.shot( 'qa-string-colors.png' );
await page.evaluate( () => {
	window.__ta.params.stringColors = 1;
	window.__ta.params.customColors = [];
} );

// The cards fill in one after the other, and all of them do - from a
// picture: on the mock's blank page the ink drawings rightly draw nothing.
await page.waitForTimeout( 2500 );
// Painted means the card's own ground is on it: what it shows depends on
// the picture (silhouette text finds no dark shape in a bright plate).
const unpainted = await page.evaluate( () =>
	[ ...document.querySelectorAll( '.wpieta-tcard' ) ]
		.filter( ( card ) => {
			const c = card.querySelector( 'canvas' );
			return 0 === c.getContext( '2d' ).getImageData( 1, 1, 1, 1 ).data[ 3 ];
		} )
		.map( ( card ) => card.dataset.mode )
);
check( 0 === unpainted.length, `every card shows its preview (${ unpainted.join( ', ' ) || 'all' })` );


// A quick card follows a moving control before the pause.
await page.evaluate( () => window.__ta.pick( 'dice' ) );
await page.waitForTimeout( 1800 );
const quick = await page.evaluate( () => window.__ta.lastBakeMs() );
const still = ( await shot() ).sig;
await page.evaluate( () => {
	window.__ta.params.diceCell = 40;
	window.__ta.pick( 'dice' );
} );
await page.waitForTimeout( 90 );
check( quick < 160 && ( await shot() ).sig !== still, `the preview follows the hand (${ Math.round( quick ) } ms a frame)` );

// The glow is the shadow it replaced: in Chrome itself, one bulb wall drawn
// both ways.
const glowDiff = await page.evaluate( () => {
	const W = 320, H = 200, cell = 16;
	const make = () => {
		const c = document.createElement( 'canvas' );
		c.width = W;
		c.height = H;
		const g = c.getContext( '2d' );
		g.fillStyle = '#0a0c10';
		g.fillRect( 0, 0, W, H );
		return { c, g };
	};
	const a = make(), b = make();
	for ( let y = 0; y < H / cell; y++ ) {
		for ( let x = 0; x < W / cell; x++ ) {
			const lum = ( x / ( W / cell ) + y / ( H / cell ) ) / 2;
			const col = [ 255 * lum, 200 * lum + 40, 120 ];
			const cx = x * cell + cell / 2, cy = y * cell + cell / 2, alpha = 0.2 + lum * 0.8;
			for ( const { g } of [ a, b ] ) {
				g.fillStyle = '#14171c';
				g.beginPath();
				g.arc( cx, cy, cell * 0.4, 0, Math.PI * 2 );
				g.fill();
			}
			a.g.shadowColor = `rgb(${ col[ 0 ] | 0 },${ col[ 1 ] | 0 },${ col[ 2 ] | 0 })`;
			a.g.shadowBlur = cell * 0.8 * lum;
			window.__ta.glow( b.g, cx, cy, cell * 0.32, cell * 0.8 * lum, col, alpha );
			for ( const { g } of [ a, b ] ) {
				g.fillStyle = `rgba(${ col[ 0 ] | 0 },${ col[ 1 ] | 0 },${ col[ 2 ] | 0 },${ alpha })`;
				g.beginPath();
				g.arc( cx, cy, cell * 0.32, 0, Math.PI * 2 );
				g.fill();
			}
			a.g.shadowBlur = 0;
		}
	}
	const da = a.g.getImageData( 0, 0, W, H ).data, db = b.g.getImageData( 0, 0, W, H ).data;
	let sum = 0, off = 0;
	for ( let i = 0; i < da.length; i += 4 ) {
		const d = Math.max( Math.abs( da[ i ] - db[ i ] ), Math.abs( da[ i + 1 ] - db[ i + 1 ] ), Math.abs( da[ i + 2 ] - db[ i + 2 ] ) );
		sum += d;
		if ( d > 24 ) off++;
	}
	return { mean: sum / ( W * H ), off: off / ( W * H ) };
} );
check( glowDiff.mean < 4 && glowDiff.off < 0.02, `the glow matches the browser's own shadow (mean ${ glowDiff.mean.toFixed( 2 ) }, ${ ( glowDiff.off * 100 ).toFixed( 2 ) }% off)` );

// Inserted at the size the layer takes: an ASCII card is about 560 pixels
// at work, and used to be stretched to the document.
await page.evaluate( () => {
	window.__dispatched.length = 0;
	window.__editor.state.doc = { w: 2400, h: 1600 };
	window.__ta.pick( 'ascii' );
} );
await page.waitForTimeout( 1500 );
await page.locator( '.dsm-actions .ai-btn.primary' ).click();
await page.waitForFunction( () => ( window.__dispatched || [] ).some( ( a ) => 'ADD_LAYER' === a.type ), null, { timeout: 60000 } ).catch( () => {} );
const sharp = await page.evaluate( () => {
	const add = ( window.__dispatched || [] ).find( ( a ) => 'ADD_LAYER' === a.type );
	const l = add && add.layer;
	return l ? { natural: l.naturalW, w: l.w } : null;
} );
check( !! sharp && sharp.natural >= sharp.w * 0.95, `the layer is drawn at its own size (${ sharp && sharp.natural } px for ${ sharp && sharp.w } px)` );

// The reveal leaves as a video file.
await page.evaluate( () => {
	window.__gen.run( { editor: window.__editor, extras: { toasts: { error: () => {}, success: () => {} } }, layer: null } );
} );
await page.waitForTimeout( 1500 );
await page.evaluate( () => {
	window.__ta.params.animSecs = 2;
	window.__ta.pick( 'dice' );
} );
await page.waitForTimeout( 1500 );
const [ download ] = await Promise.all( [
	page.waitForEvent( 'download', { timeout: 90000 } ).catch( () => null ),
	page.locator( '.wpieta-btnrow .ai-btn' ).first().click(),
] );
const film = download ? download.suggestedFilename() : '';
check( /\.(mp4|webm)$/.test( film ), `the reveal downloads as a video (${ film || 'nothing' })` );

process.exit( await qa.finish() );
