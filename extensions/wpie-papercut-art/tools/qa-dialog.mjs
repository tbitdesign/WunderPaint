/**
 * Dialog QA for Papercut Art: the studio opens, the library builds
 * live tiles, presets and elements land in the scene, the sun and the
 * sheets can be dragged, a photo slices into bands, the cut package is
 * a real ZIP and Insert hands the editor a proper group.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStage, launchQA } from '../../shared/qa-kit/stage.mjs';

const root = path.resolve(
	path.dirname( fileURLToPath( import.meta.url ) ),
	'..'
);
const stage = await buildStage( { root } );
const qa = await launchQA( { stage, shotDir: path.join( root, 'dist' ) } );
const { page, check } = qa;

check( ( await page.locator( '.dsm-title' ).count() ) > 0, 'dialog opened' );
check(
	( await page.locator( '.dsm-badge svg' ).count() ) > 0,
	'brand badge is in the head'
);

/* ------------------------------- library -------------------------------- */

const tiles = await page.locator( '.wpiepca-tile' ).count();
check(
	tiles >= 55,
	`library offers scenes, landscape, plants, animals, sky (${ tiles })`
);
await page.waitForTimeout( 3500 );
const thumbed = await page.evaluate(
	() =>
		[ ...document.querySelectorAll( '.wpiepca-tile-thumb' ) ].filter(
			( el ) => el.style.backgroundImage.includes( 'url' )
		).length
);
check( thumbed >= 45, `live thumbnails rendered (${ thumbed })` );

/* ----------------------------- default scene ---------------------------- */

await page.waitForFunction(
	() => window.__pca && window.__pca.engine.allSheets().length > 0
);
const base = await page.evaluate( () => ( {
	sheets: window.__pca.engine.allSheets().length,
	pieces: window.__pca.engine
		.allSheets()
		.filter( ( s ) => s.rings.length )
		.map( ( s ) => s.pieces ),
} ) );
check( base.sheets >= 3, `default scene has sheets (${ base.sheets })` );
check(
	base.pieces.every( ( p ) => 1 === p ),
	'every default sheet is proven one piece'
);
await qa.shot( 'qa-1-default.png' );

/* ------------------------------ preset click ----------------------------- */

await page.evaluate( () => window.__pca.applyPreset( 'nightwolf' ) );
await page.waitForTimeout( 300 );
const preset = await page.evaluate( () => ( {
	look: window.__pca.params.look,
	sheets: window.__pca.params.sheets.length,
	animals: window.__pca.params.sheets
		.flatMap( ( s ) => s.objects )
		.filter( ( o ) => 'animal' === o.kind ).length,
} ) );
check(
	'night' === preset.look && preset.sheets >= 3 && 1 === preset.animals,
	`nightwolf preset applied (${ JSON.stringify( preset ) })`
);
await qa.shot( 'qa-2-nightwolf.png' );

/* ------------------------- add an animal via tile ------------------------ */

await page
	.locator( '.wpiepca-tile', { hasText: 'Fuchs' } )
	.first()
	.click();
await page.waitForTimeout( 350 );
const foxed = await page.evaluate( () => {
	const objs = window.__pca.params.sheets.flatMap( ( s ) => s.objects );
	const fox = objs.find( ( o ) => 'fox' === o.species );
	const sheet = window.__pca.params.sheets.find( ( s ) =>
		s.objects.some( ( o ) => o.id === ( fox && fox.id ) )
	);
	return {
		animals: objs.filter( ( o ) => 'animal' === o.kind ).length,
		ownSheet: !! sheet && 1 === sheet.objects.length,
		selected: window.__pca.selected === ( fox && fox.id ),
	};
} );
check(
	2 === foxed.animals && foxed.ownSheet && foxed.selected,
	`the fox arrived on its own sheet and is selected (${ JSON.stringify(
		foxed
	) })`
);

/* ------------------------------- sun drag -------------------------------- */

const lightBefore = await page.evaluate( () => window.__pca.params.lightX );
const sun = await page.locator( '.wpiepca-sun' ).boundingBox();
await page.mouse.move( sun.x + sun.width / 2, sun.y + sun.height / 2 );
await page.mouse.down();
await page.mouse.move( sun.x + sun.width / 2 + 80, sun.y + sun.height / 2, {
	steps: 4,
} );
await page.mouse.up();
const lightAfter = await page.evaluate( () => window.__pca.params.lightX );
check(
	lightAfter !== lightBefore,
	`the sun moves the light (${ lightBefore } -> ${ Math.round( lightAfter ) })`
);

/* ------------------------------ sheet drag ------------------------------- */

// The heart of the v2 model: grab the animal itself, not its sheet.
const box = await page.locator( '.wpiepca-view canvas' ).boundingBox();
const target = await page.evaluate( () => {
	const o = window.__pca.params.sheets
		.flatMap( ( s ) => s.objects )
		.find( ( x ) => 'animal' === x.kind );
	const shape = window.__pca.engine
		.allSheets()
		.flatMap( ( s ) => s.shapes )
		.find( ( s ) => s.id === o.id );
	return {
		id: o.id,
		x: o.x,
		cx: ( shape.bbox.x0 + shape.bbox.x1 ) / 2 / window.__pca.engine.w,
		cy: ( shape.bbox.y0 + shape.bbox.y1 ) / 2 / window.__pca.engine.h,
	};
} );
await page.mouse.move(
	box.x + target.cx * box.width,
	box.y + target.cy * box.height
);
await page.mouse.down();
await page.mouse.move(
	box.x + target.cx * box.width + 70,
	box.y + target.cy * box.height,
	{ steps: 5 }
);
await page.mouse.up();
await page.waitForTimeout( 500 );
const moved = await page.evaluate( ( id ) => {
	const o = window.__pca.params.sheets
		.flatMap( ( s ) => s.objects )
		.find( ( x ) => x.id === id );
	return {
		x: o.x,
		selected: window.__pca.selected === id,
		sheetsMoved: window.__pca.params.sheets.filter( ( s ) => 0 !== s.dx )
			.length,
	};
}, target.id );
check(
	Math.abs( moved.x - target.x ) > 0.02 &&
		moved.selected &&
		0 === moved.sheetsMoved,
	`the object moves on its own, the sheets stay put (${ target.x.toFixed(
		2
	) } -> ${ moved.x.toFixed( 2 ) })`
);

/* --------------------------- the colour picker --------------------------- */

// The editor's picker renders its popover INSIDE the swatch host. A
// selection that rebuilds the sheet list tears that host out in the
// same tick, and the picker looks broken (reported after the v2
// rework). So: the host must survive both its own click and selecting
// something else, and the colour must actually reach the sheet.
const pickerBefore = await page.evaluate( () =>
	window.__pca.params.sheets.map( ( s ) => s.color ).join( ',' )
);
await page.locator( '.wpiepca-lcolor button' ).first().click();
await page.waitForTimeout( 400 );
const picker = await page.evaluate( () => {
	const host = document.querySelector( '.wpiepca-lcolor button' );
	const rows = document.querySelectorAll( '.wpiepca-lrow' );
	rows[ rows.length > 1 ? 1 : 0 ].click();
	return {
		colors: window.__pca.params.sheets.map( ( s ) => s.color ).join( ',' ),
		painted: window.__pca.engine
			.allSheets()
			.map( ( s ) => s.color )
			.join( ',' ),
		survives: host === document.querySelector( '.wpiepca-lcolor button' ),
	};
} );
check(
	picker.colors !== pickerBefore &&
		picker.painted.includes( picker.colors.split( ',' ).filter( Boolean )[ 0 ] ) &&
		picker.survives,
	`the colour picker paints and its host survives a selection (${ picker.colors })`
);

/* ------------------------------ look chips ------------------------------- */

await page.locator( '.wpiepca-look' ).nth( 2 ).click();
await page.waitForTimeout( 250 );
const look2 = await page.evaluate( () => window.__pca.params.look );
check( 'sunset' === look2, `look chips switch the palette (${ look2 })` );

/* --------------------------------- ampel --------------------------------- */

const ampel = await page.locator( '.wpiepca-ampel' ).textContent();
check(
	ampel.includes( 'one piece' ) || ampel.length > 10,
	`the cutting card reports the proof (${ ampel.slice( 0, 40 ) }…)`
);

/* ------------------------------ photo slicing ---------------------------- */

await page.evaluate( () => {
	window.__editor.state.layers = [
		{
			id: 'design1',
			type: 'shape',
			shape: 'rect',
			x: 0,
			y: 0,
			w: 1600,
			h: 1000,
			fill: '#dfe6f2',
		},
		{
			id: 'design2',
			type: 'shape',
			shape: 'ellipse',
			x: 900,
			y: 550,
			w: 500,
			h: 350,
			fill: '#22262e',
		},
	];
} );
const photoSelect = page
	.locator( '.wpiepca-side select' )
	.filter( { has: page.locator( 'option[value="document"]' ) } )
	.first();
await photoSelect.selectOption( 'document' );
await page.waitForTimeout( 900 );
const sliced = await page.evaluate( () => ( {
	bases: window.__pca.params.sheets.map( ( s ) => s.base ),
	thresholds: window.__pca.params.photo.thresholds.length,
} ) );
check(
	sliced.bases.every( ( b ) => 'photo' === b ) && sliced.thresholds >= 2,
	`the document sliced into photo sheets (${ JSON.stringify( sliced.bases ) })`
);
await qa.shot( 'qa-3-photo.png' );

/* --------------------------- histogram handles --------------------------- */

const thBefore = await page.evaluate( () =>
	window.__pca.params.photo.thresholds.join( ',' )
);
// Raw mouse moves do not auto-scroll the side panel the way a locator
// click would - bring the histogram into view first.
await page.locator( '.wpiepca-hist' ).scrollIntoViewIfNeeded();
const hist = await page.locator( '.wpiepca-hist' ).boundingBox();
await page.mouse.move( hist.x + hist.width * 0.5, hist.y + hist.height / 2 );
await page.mouse.down();
await page.mouse.move( hist.x + hist.width * 0.62, hist.y + hist.height / 2, {
	steps: 3,
} );
await page.mouse.up();
const thAfter = await page.evaluate( () =>
	window.__pca.params.photo.thresholds.join( ',' )
);
check( thBefore !== thAfter, 'histogram handles move the band thresholds' );

/* ------------------------------ cut package ------------------------------ */

await page.evaluate( () => {
	window.__zip = null;
	const orig = URL.createObjectURL.bind( URL );
	URL.createObjectURL = ( blob ) => {
		if ( blob && 'application/zip' === blob.type ) {
			window.__zip = { size: blob.size, type: blob.type };
		}
		return orig( blob );
	};
	// Downloads stay in the page during QA.
	HTMLAnchorElement.prototype.click = function () {};
} );
await page
	.locator( '.dsm-actions .ai-btn', { hasText: 'Schnittpaket' } )
	.click();
await page.waitForTimeout( 800 );
const zip = await page.evaluate( () => window.__zip );
check(
	zip && zip.size > 1200,
	`the cut package is a real ZIP (${ zip && zip.size } bytes)`
);

/* --------------------------------- insert -------------------------------- */

await page.evaluate( () => {
	window.__dispatched.length = 0;
} );
await page.locator( '.dsm-actions .ai-btn.primary' ).click();
await page.waitForTimeout( 1200 );
const inserted = await page.evaluate( () => {
	const acts = window.__dispatched || [];
	const adds = acts.filter( ( a ) => 'ADD_LAYER' === a.type );
	const group = adds.find( ( a ) => a.layer.generator );
	const children = adds.filter(
		( a ) => group && a.layer.parent === group.layer.id
	);
	return {
		group: !! group,
		genId: group && group.layer.generator.id,
		children: children.length,
		images: children.every(
			( a ) => ( a.layer.src || '' ).startsWith( 'data:image' )
		),
		active: acts.some( ( a ) => 'SET_ACTIVE' === a.type ),
	};
} );
check(
	inserted.group && 'wpie-papercut-art/scene' === inserted.genId,
	'insert creates a stamped group'
);
check(
	inserted.children >= 3 && inserted.images,
	`every sheet arrived as its own image layer (${ inserted.children })`
);
check( inserted.active, 'the group becomes the active layer' );

/* ------------------------------ edit roundtrip --------------------------- */

await page.evaluate( () => {
	const acts = window.__dispatched || [];
	const adds = acts.filter( ( a ) => 'ADD_LAYER' === a.type );
	const group = adds.find( ( a ) => a.layer.generator );
	for ( const a of adds ) {
		window.__editor.state.layers.push( a.layer );
	}
	window.__gen.edit( {
		editor: window.__editor,
		extras: {},
		layer: group.layer,
	} );
} );
await page.waitForTimeout( 900 );
const reopened = await page.evaluate( () => ( {
	sheets: window.__pca ? window.__pca.params.sheets.length : 0,
	photo: window.__pca
		? window.__pca.params.sheets.filter( ( s ) => 'photo' === s.base ).length
		: 0,
} ) );
check(
	reopened.sheets > 0 && reopened.photo > 0,
	`edit reopens with the saved scene (${ JSON.stringify( reopened ) })`
);

/* ------------------------- v1 scenes still open -------------------------- */

const migrated = await page.evaluate( () => {
	window.__pca.close();
	window.__gen.edit( {
		editor: window.__editor,
		extras: {},
		layer: {
			id: 'old',
			generator: {
				id: 'wpie-papercut-art/scene',
				params: {
					look: 'forest',
					lagen: [
						{ kind: 'sky', orb: 'moon', birds: 3 },
						{
							kind: 'band',
							profile: 'hills',
							yBase: 82,
							animals: [ { kind: 'bear', x: 0.4, scale: 40 } ],
						},
					],
				},
			},
		},
	} );
	return true;
} );
void migrated;
await page.waitForTimeout( 900 );
const v1 = await page.evaluate( () => ( {
	look: window.__pca.params.look,
	sheets: window.__pca.params.sheets.length,
	kinds: window.__pca.params.sheets
		.flatMap( ( s ) => s.objects )
		.map( ( o ) => o.kind )
		.sort(),
} ) );
check(
	'forest' === v1.look &&
		2 === v1.sheets &&
		v1.kinds.includes( 'animal' ) &&
		v1.kinds.includes( 'orb' ),
	`a v1 scene reopens with its elements as objects (${ JSON.stringify( v1 ) })`
);
await qa.shot( 'qa-4-edit.png' );

process.exit( await qa.finish() );
