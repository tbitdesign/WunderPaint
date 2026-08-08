/**
 * Dialog QA for Marble Bath.
 *
 * The claims the studio makes, asserted as numbers:
 *
 *   the bath opens with a marbled start   (ink on the canvas)
 *   every recipe draws its own picture    (hash + ink per recipe)
 *   the dice re-roll the same recipe      (new seed, new bath)
 *   determinism                           (same state, same pixels)
 *   a real pointer DROP grows ink         (hold = growth)
 *   a real pointer COMB bends the bath    (drag through, picture changes)
 *   undo forgets exactly the last move
 *   clear water has real alpha            (transparent overlay claim)
 *   brand colours land in the ink wells and recolour the bath
 *   the replay prefix renders             (partial history = valid picture)
 *   insert dispatches a reopenable generator layer with a real PNG
 *
 * Insert closes the studio, so the live checks run first and the shared
 * baseline gets a fresh dialog at the end.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStage, launchQA } from '../../shared/qa-kit/stage.mjs';
import { baseline } from '../../shared/qa-kit/baseline.mjs';

const root = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..' );
const stage = await buildStage( { root } );
const qa = await launchQA( { stage, shotDir: path.join( root, 'dist' ) } );
const { page, check } = qa;

await page.waitForSelector( '.wpiemb-dialog' );
await page.waitForTimeout( 600 );

check(
	await page.evaluate( () => 'function' === typeof window.__wpiembState ),
	'the studio says what it is doing'
);
const state = () => page.evaluate( () => window.__wpiembState() );
let now = await state();
check( now.ready, 'it renders on opening' );
check( ! now.cpu, 'WebGL2 carries the bath' );
check( now.ops > 20, `it opens marbled (${ now.ops } moves)` );
check( 'stone' === now.recipe, 'the opening pattern is Stone' );

/** A still, hashed - "did the picture change" as a fact. */
const sig = () =>
	page.evaluate( () => {
		const c = window.__marblingStudio.still( 240, 180 );
		const d = c.getContext( '2d' ).getImageData( 0, 0, 240, 180 ).data;
		let h = 0;
		let ink = 0;
		let clear = 0;
		for ( let i = 0; i < d.length; i += 4 ) {
			h = ( h * 31 + d[ i ] + d[ i + 1 ] + d[ i + 2 ] ) | 0;
			if ( d[ i + 3 ] > 10 ) {
				ink++;
			} else {
				clear++;
			}
		}
		return { h, ink, clear };
	} );

const first = await sig();
check( first.ink > 20000, `the bath is painted (${ first.ink } px)` );
await qa.shot( 'qa-open.png' );

// Every recipe draws, and draws something different.
const recipes = await page.evaluate( () =>
	[ ...document.querySelectorAll( '.wpiemb-card-btn' ) ].map(
		( b ) => b.textContent
	)
);
check( recipes.length >= 7, `all recipes listed (${ recipes.length })` );
const seen = new Map();
for ( const label of recipes ) {
	await page
		.locator( '.wpiemb-card-btn', { hasText: label } )
		.first()
		.click();
	await page.waitForTimeout( 120 );
	const s = await sig();
	check( s.ink > 15000, `recipe "${ label }" paints (${ s.ink })` );
	check( ! seen.has( s.h ), `recipe "${ label }" is its own picture` );
	seen.set( s.h, label );
}
await qa.shot( 'qa-recipes.png' );

// Determinism, and the dice re-marble the current recipe.
await page.evaluate( () =>
	window.__marblingStudio.set( { seed: 4242, recipe: '' } )
);
await page.evaluate( () => window.__marblingStudio.recipe( 'bouquet' ) );
const a = await sig();
const b = await sig();
check( a.h === b.h, 'the same state gives the same picture back' );
const beforeDice = ( await state() ).ops;
await page.locator( '.wpiemb-seedrow .wpiemb-chip' ).first().click();
await page.waitForTimeout( 120 );
const c = await sig();
check( a.h !== c.h, 'the dice re-marble the bath' );
check(
	'bouquet' === ( await state() ).recipe && ( await state() ).ops > 20,
	`the recipe survives the dice (${ beforeDice } -> ${ ( await state() ).ops } moves)`
);

// A real pointer gesture: hold a drop, watch it grow.
const dropGrown = await page.evaluate( async () => {
	window.__marblingStudio.set( { tool: 'drop', rings: 1 } );
	const cv = document.querySelector( '.wpiemb-canvas' );
	const r = cv.getBoundingClientRect();
	const fire = ( type, x, y ) =>
		cv.dispatchEvent(
			new PointerEvent( type, {
				bubbles: true,
				clientX: x,
				clientY: y,
				pointerId: 7,
				pointerType: 'mouse',
				isPrimary: true,
			} )
		);
	const n0 = window.__wpiembState().ops;
	fire( 'pointerdown', r.left + r.width * 0.3, r.top + r.height * 0.3 );
	await new Promise( ( res ) => setTimeout( res, 450 ) );
	const rGrowing = window.__marblingStudio
		.getState()
		.ops.slice( -1 )[ 0 ][ 3 ];
	fire( 'pointerup', r.left + r.width * 0.3, r.top + r.height * 0.3 );
	return {
		added: window.__wpiembState().ops - n0,
		radius: rGrowing,
	};
} );
check( 1 === dropGrown.added, 'a click drops one drop' );
check(
	dropGrown.radius > 0.02,
	`holding grew the drop (r ${ dropGrown.radius.toFixed( 3 ) })`
);

// A real pointer comb stroke: the bath bends, one move is added.
const beforeComb = await sig();
const combed = await page.evaluate( async () => {
	window.__marblingStudio.set( { tool: 'comb' } );
	const cv = document.querySelector( '.wpiemb-canvas' );
	const r = cv.getBoundingClientRect();
	const fire = ( type, x, y ) =>
		cv.dispatchEvent(
			new PointerEvent( type, {
				bubbles: true,
				clientX: x,
				clientY: y,
				pointerId: 8,
				pointerType: 'mouse',
				isPrimary: true,
			} )
		);
	const n0 = window.__wpiembState().ops;
	fire( 'pointerdown', r.left + r.width * 0.5, r.top + r.height * 0.15 );
	for ( let k = 1; k <= 8; k++ ) {
		fire(
			'pointermove',
			r.left + r.width * 0.5,
			r.top + r.height * ( 0.15 + k * 0.09 )
		);
		await new Promise( ( res ) => setTimeout( res, 25 ) );
	}
	fire( 'pointerup', r.left + r.width * 0.5, r.top + r.height * 0.87 );
	return window.__wpiembState().ops - n0;
} );
check( 1 === combed, 'a comb stroke is one move' );
const afterComb = await sig();
check( beforeComb.h !== afterComb.h, 'the comb bent the bath' );
await qa.shot( 'qa-combed.png' );

// Undo forgets exactly the last move.
const undoBase = ( await state() ).ops;
await page.locator( '.wpiemb-action' ).nth( 1 ).click();
await page.waitForTimeout( 100 );
check(
	( await state() ).ops === undoBase - 1,
	'undo forgets exactly one move'
);
const afterUndo = await sig();
check( afterUndo.h === beforeComb.h, 'undo restores the earlier picture' );

// Sprinkle adds drops; clear empties after arming (no popup anywhere).
await page.locator( '.wpiemb-action' ).nth( 0 ).click();
await page.waitForTimeout( 100 );
check( ( await state() ).ops > undoBase, 'sprinkle scatters drops' );
await page.locator( '.wpiemb-action' ).nth( 2 ).click();
await page.waitForTimeout( 80 );
check( ( await state() ).ops > 0, 'the first press only arms the emptying' );
await page.locator( '.wpiemb-action' ).nth( 2 ).click();
await page.waitForTimeout( 80 );
check( 0 === ( await state() ).ops, 'the second press empties the bath' );

// The meisterklasse round: flower, gall, arc, splatter, pigment.
await page.evaluate( () => window.__marblingStudio.recipe( 'stone' ) );
const beforeFlower = await sig();
const flower = await page.evaluate( async () => {
	window.__marblingStudio.set( { tool: 'flower', flowerKind: 'tulip' } );
	const cv = document.querySelector( '.wpiemb-canvas' );
	const r = cv.getBoundingClientRect();
	const fire = ( type, x, y ) =>
		cv.dispatchEvent(
			new PointerEvent( type, {
				bubbles: true,
				clientX: x,
				clientY: y,
				pointerId: 9,
				pointerType: 'mouse',
				isPrimary: true,
			} )
		);
	const n0 = window.__wpiembState().ops;
	fire( 'pointerdown', r.left + r.width * 0.55, r.top + r.height * 0.4 );
	fire( 'pointerup', r.left + r.width * 0.55, r.top + r.height * 0.4 );
	const st = window.__marblingStudio.getState();
	return {
		added: st.ops.length - n0,
		lastGroup: st.groups[ st.groups.length - 1 ],
	};
} );
check(
	flower.added >= 8,
	`a click plants a whole flower (${ flower.added } ops)`
);
check(
	flower.lastGroup === flower.added,
	'the flower is ONE move in the history'
);
const afterFlower = await sig();
check( beforeFlower.h !== afterFlower.h, 'the flower is in the picture' );
await qa.shot( 'qa-flower.png' );
await page.locator( '.wpiemb-action' ).nth( 1 ).click();
await page.waitForTimeout( 120 );
const undoneFlower = await sig();
check(
	undoneFlower.h === beforeFlower.h,
	'undo lifts the whole flower out again'
);

// The gall drop: pushed colours aside, water in the middle.
const gall = await page.evaluate( () => {
	window.__marblingStudio.addOp( [ 'd', 0.66, 0.5, 0.16, -1 ] );
	const c = window.__marblingStudio.still( 240, 180 );
	const d = c
		.getContext( '2d' )
		.getImageData( Math.round( ( 0.66 / ( 4 / 3 ) ) * 240 ), 90, 1, 1 )
		.data;
	return { r: d[ 0 ], g: d[ 1 ], b: d[ 2 ] };
} );
check(
	gall.r > 220 && gall.g > 200 && gall.b > 180,
	`inside the gall drop lies bath water (rgb ${ gall.r },${ gall.g },${ gall.b })`
);

// An arc stroke: centre + drag = one curved move.
const beforeArc = await sig();
const arcAdded = await page.evaluate( async () => {
	window.__marblingStudio.set( { tool: 'ringcomb' } );
	const cv = document.querySelector( '.wpiemb-canvas' );
	const r = cv.getBoundingClientRect();
	const fire = ( type, x, y ) =>
		cv.dispatchEvent(
			new PointerEvent( type, {
				bubbles: true,
				clientX: x,
				clientY: y,
				pointerId: 10,
				pointerType: 'mouse',
				isPrimary: true,
			} )
		);
	const n0 = window.__wpiembState().ops;
	fire( 'pointerdown', r.left + r.width * 0.5, r.top + r.height * 0.5 );
	for ( let k = 1; k <= 6; k++ ) {
		fire(
			'pointermove',
			r.left + r.width * ( 0.5 + k * 0.05 ),
			r.top + r.height * 0.5
		);
		await new Promise( ( res ) => setTimeout( res, 20 ) );
	}
	fire( 'pointerup', r.left + r.width * 0.8, r.top + r.height * 0.5 );
	return window.__wpiembState().ops - n0;
} );
check( 1 === arcAdded, 'a ring-comb stroke is one move' );
const afterArc = await sig();
check( beforeArc.h !== afterArc.h, 'the ring comb turned the bath' );

// A splatter flick: many droplets, ONE move.
const splat = await page.evaluate( async () => {
	window.__marblingStudio.set( { tool: 'splatter' } );
	const cv = document.querySelector( '.wpiemb-canvas' );
	const r = cv.getBoundingClientRect();
	const fire = ( type, x, y ) =>
		cv.dispatchEvent(
			new PointerEvent( type, {
				bubbles: true,
				clientX: x,
				clientY: y,
				pointerId: 11,
				pointerType: 'mouse',
				isPrimary: true,
			} )
		);
	const n0 = window.__wpiembState().ops;
	fire( 'pointerdown', r.left + r.width * 0.2, r.top + r.height * 0.7 );
	for ( let k = 1; k <= 5; k++ ) {
		fire(
			'pointermove',
			r.left + r.width * ( 0.2 + k * 0.12 ),
			r.top + r.height * ( 0.7 - k * 0.04 )
		);
		await new Promise( ( res ) => setTimeout( res, 15 ) );
	}
	fire( 'pointerup', r.left + r.width * 0.8, r.top + r.height * 0.5 );
	const st = window.__marblingStudio.getState();
	return {
		added: st.ops.length - n0,
		lastGroup: st.groups[ st.groups.length - 1 ],
	};
} );
check(
	splat.added >= 6,
	`the flick sprayed droplets (${ splat.added })`
);
check( splat.lastGroup === splat.added, 'the whole flick is ONE move' );

// Pigment: the veins dial changes the rendered ink.
const veinsOff = await page.evaluate( () => {
	window.__marblingStudio.set( { veins: 0, paper: 0 } );
	return true;
} );
void veinsOff;
const sigPlain = await sig();
await page.evaluate( () =>
	window.__marblingStudio.set( { veins: 0.9, paper: 0.6 } )
);
const sigVeins = await sig();
check(
	sigPlain.h !== sigVeins.h,
	'pigment rim, clouds and paper grain reach the pixels'
);
await page.evaluate( () =>
	window.__marblingStudio.set( { veins: 0.45, paper: 0.22 } )
);

// Leave an empty bath behind - the clear-water check reads exact pixels.
await page.evaluate( () =>
	window.__marblingStudio.set( { ops: [], recipe: '' } )
);

// Clear water: real alpha for the overlay claim.
await page.evaluate( () => {
	window.__marblingStudio.set( { bathClear: true } );
	window.__marblingStudio.addOp( [ 'd', 0.6, 0.5, 0.12, 1 ] );
} );
const clearSig = await sig();
check(
	clearSig.clear > 20000 && clearSig.ink > 300,
	`clear water is transparent around the ink (${ clearSig.clear } clear, ${ clearSig.ink } ink)`
);
await page.evaluate( () =>
	window.__marblingStudio.set( { bathClear: false } )
);

// Brand colours land in the wells and recolour the existing bath.
await page.evaluate( () => window.__marblingStudio.recipe( 'stone' ) );
const beforeBrand = await sig();
const brand = await page.evaluate( () => {
	const btns = [ ...document.querySelectorAll( '.wpiemb-chip' ) ];
	const btn = btns.find( ( x ) =>
		/Marken|brand/i.test( x.textContent || '' )
	);
	if ( ! btn ) {
		return null;
	}
	btn.click();
	return {
		kit: ( window.WPIE.brandKits[ 0 ].colors || [] )[ 0 ],
		ink: window.__marblingStudio.getState().inks[ 0 ],
	};
} );
check( !! brand, 'the brand button is offered' );
check(
	brand && brand.kit && brand.ink === brand.kit,
	`the first well carries the first brand colour (${ brand && brand.ink })`
);
const afterBrand = await sig();
check(
	beforeBrand.h !== afterBrand.h,
	'recolouring the wells recolours the finished bath'
);
await qa.shot( 'qa-brand.png' );

// A replay prefix is a valid picture (the film's foundation).
const partial = await page.evaluate( () => {
	const eng = window.__marblingStudio.engine;
	const n = window.__wpiembState().ops;
	eng.setPartial( Math.max( 1, Math.floor( n / 2 ) ), 0.5 );
	const c = window.__marblingStudio.still( 200, 150 );
	eng.setPartial( n, 1 );
	const d = c.getContext( '2d' ).getImageData( 0, 0, 200, 150 ).data;
	let ink = 0;
	for ( let i = 3; i < d.length; i += 4 ) {
		if ( d[ i ] > 10 ) {
			ink++;
		}
	}
	return ink;
} );
check( partial > 5000, `half the history is a valid picture (${ partial })` );

// Insert: a generator layer with a real PNG, through the real button.
const inserted = await page.evaluate( () => {
	window.__dispatched.length = 0;
	const btns = [ ...document.querySelectorAll( '.dsm-foot button' ) ];
	btns[ btns.length - 1 ].click();
	const add = window.__dispatched.find( ( x ) => 'ADD_LAYER' === x.type );
	if ( ! add ) {
		return null;
	}
	return {
		gen: add.layer.generator && add.layer.generator.id,
		ops:
			add.layer.generator &&
			add.layer.generator.params.ops &&
			add.layer.generator.params.ops.length,
		png: String( add.layer.src || '' ).slice( 0, 22 ),
		w: add.layer.naturalW,
		h: add.layer.naturalH,
		closed: ! document.querySelector( '.wpiemb-dialog' ),
	};
} );
check( !! inserted, 'insert dispatches a layer' );
check(
	inserted && 'wpie-marbling-studio/marbling' === inserted.gen,
	'the layer is a reopenable generator'
);
check(
	inserted && inserted.ops > 0,
	`the full history travels with the layer (${ inserted && inserted.ops } moves)`
);
check(
	inserted && inserted.png.startsWith( 'data:image/png' ),
	'the still is a real PNG'
);
check(
	inserted && inserted.w % 2 === 0 && inserted.h % 2 === 0,
	`even output size (${ inserted && inserted.w }x${ inserted && inserted.h })`
);
check( inserted && inserted.closed, 'insert closes the studio' );

// A fresh dialog for the shared baseline - its own primary press ends it.
await page.evaluate( () => {
	window.__gen.run( {
		editor: window.__editor,
		extras: { toasts: { error: () => {}, success: () => {} } },
		layer: null,
	} );
} );
await page.waitForSelector( '.wpiemb-dialog' );
await baseline( qa, { insert: true, settle: 350, allowInert: 0 } );

process.exit( await qa.finish() );
