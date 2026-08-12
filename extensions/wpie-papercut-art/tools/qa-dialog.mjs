/**
 * Dialog QA for Papercut Art: the studio opens, the library builds live
 * tiles, scenes and elements land in the picture, the sun and the layers
 * can be dragged, a photo slices into depth layers, and Insert hands the
 * editor a proper group.
 *
 * The check that matters most is the LIVE one: the picture has to follow
 * the hand DURING a drag, not after it. That is what was broken, and a
 * test that only looks after pointerup cannot see it.
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
	() => window.__pca && window.__pca.engine.allLayers().length > 0
);
const base = await page.evaluate( () => ( {
	layers: window.__pca.engine.allLayers().length,
	painted: window.__pca.engine
		.allLayers()
		.filter( ( s ) => s.rings.length ).length,
} ) );
check( base.layers >= 3, `default scene has layers (${ base.layers })` );
check(
	base.painted === base.layers,
	`every default layer carries paper (${ base.painted }/${ base.layers })`
);
await qa.shot( 'qa-1-default.png' );

/* ------------------------------ preset click ----------------------------- */

await page.evaluate( () => window.__pca.applyPreset( 'nightwolf' ) );
await page.waitForTimeout( 300 );
const preset = await page.evaluate( () => ( {
	look: window.__pca.params.look,
	layers: window.__pca.params.layers.length,
	animals: window.__pca.params.layers
		.flatMap( ( s ) => s.objects )
		.filter( ( o ) => 'animal' === o.kind ).length,
} ) );
check(
	'night' === preset.look && preset.layers >= 3 && 1 === preset.animals,
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
	const objs = window.__pca.params.layers.flatMap( ( s ) => s.objects );
	const fox = objs.find( ( o ) => 'fox' === o.species );
	const host = window.__pca.params.layers.find( ( s ) =>
		s.objects.some( ( o ) => o.id === ( fox && fox.id ) )
	);
	return {
		animals: objs.filter( ( o ) => 'animal' === o.kind ).length,
		ownLayer: !! host && 1 === host.objects.length,
		selected: window.__pca.selected === ( fox && fox.id ),
	};
} );
check(
	2 === foxed.animals && foxed.ownLayer && foxed.selected,
	`the fox arrived on its own layer and is selected (${ JSON.stringify(
		foxed
	) })`
);

/* --------------------- a new sky object is VISIBLE ----------------------- */

// Thomas, 9 August: "füge ich aus Sky die Sun ein, man sieht die Umrisse
// aber mehr auch nicht". A new object lands on a layer of its own, and a
// punching object on an empty layer cut a hole into nothing.
const beforeSun = await page.evaluate(
	() => window.__pca.engine.allLayers().filter( ( s ) => s.rings.length ).length
);
await page.locator( '.wpiepca-tile', { hasText: 'Sonne' } ).first().click();
await page.waitForTimeout( 400 );
const sunAdded = await page.evaluate( () => {
	const o = window.__pca.params.layers
		.flatMap( ( s ) => s.objects )
		.find( ( x ) => 'orb' === x.kind );
	const built = window.__pca.engine
		.allLayers()
		.find( ( s ) => s.layer.objects.some( ( x ) => x.id === ( o && o.id ) ) );
	return {
		cut: !! ( o && o.cut ),
		rings: built ? built.rings.length : 0,
		painted: window.__pca.engine
			.allLayers()
			.filter( ( s ) => s.rings.length ).length,
	};
} );
check( ! sunAdded.cut, 'a fresh sun arrives as paper, not as a hole' );
check(
	sunAdded.rings > 0 && sunAdded.painted > beforeSun,
	`and it is actually drawn (${ sunAdded.rings } rings)`
);

/* ---------------------- reordering by dragging a row --------------------- */

// A SHORT stack for this one, on purpose. Raw mouse gestures do not
// scroll, and scrolling one end of a long list into view moves the other
// end out from under the coordinates already measured - which is exactly
// how this check reported "nothing moved" while the code was fine.
await page.evaluate( () => {
	const p = window.__pca.params;
	p.layers = p.layers.slice( -3 );
	window.__pca.engine.build( p );
	window.__pca.rerender();
} );
await page.waitForTimeout( 300 );
const stackBefore = await page.evaluate( () =>
	[ ...document.querySelectorAll( '.wpiepca-lname' ) ].map(
		( el ) => el.textContent
	)
);
const grips = page.locator( '.wpiepca-grip' );
const firstGrip = await grips.first().boundingBox();
const backEdge = await page.locator( '.wpiepca-edge.is-tail' ).boundingBox();
await page.mouse.move(
	firstGrip.x + firstGrip.width / 2,
	firstGrip.y + firstGrip.height / 2
);
await page.mouse.down();
await page.mouse.move(
	backEdge.x + backEdge.width / 2,
	backEdge.y + backEdge.height / 2,
	{ steps: 10 }
);
await page.mouse.up();
await page.waitForTimeout( 400 );
const stackAfter = await page.evaluate( () =>
	[ ...document.querySelectorAll( '.wpiepca-lname' ) ].map(
		( el ) => el.textContent
	)
);
check(
	stackBefore.length === stackAfter.length &&
		stackBefore[ 0 ] !== stackAfter[ 0 ] &&
		stackAfter[ stackAfter.length - 1 ] === stackBefore[ 0 ],
	`dragging the front thing to the back reorders the stack (${ stackBefore[ 0 ] })`
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

/* ------------------------------ object drag ------------------------------ */

// A hash of the live canvas, for asking whether the picture changed.
const sig = () =>
	page.evaluate( () => {
		const c = document.querySelector( '.wpiepca-view canvas' );
		const s = document.createElement( 'canvas' );
		s.width = 72;
		s.height = 72;
		const g = s.getContext( '2d' );
		g.drawImage( c, 0, 0, 72, 72 );
		const d = g.getImageData( 0, 0, 72, 72 ).data;
		let h = 7;
		for ( let i = 0; i < d.length; i += 16 ) {
			h = ( Math.imul( h, 31 ) + d[ i ] + d[ i + 1 ] ) | 0;
		}
		return h;
	} );

// A passepartout in front covers the stage, and then the signature
// cannot see the silhouette move behind it. The frame gets its own
// checks further down; here it would only hide the thing under test.
await page.evaluate( () => {
	const p = window.__pca.params;
	p.layers = p.layers.filter(
		( l ) => ! l.objects.some( ( o ) => 'frame' === o.kind )
	);
	window.__pca.engine.build( p );
	window.__pca.engine.render( {} );
} );
const box = await page.locator( '.wpiepca-view canvas' ).boundingBox();
const target = await page.evaluate( () => {
	const o = window.__pca.params.layers
		.flatMap( ( s ) => s.objects )
		.find( ( x ) => 'animal' === x.kind );
	const shape = window.__pca.engine
		.allLayers()
		.flatMap( ( s ) => s.shapes )
		.find( ( s ) => s.id === o.id );
	return {
		id: o.id,
		x: o.x,
		y: o.y,
		cx: ( shape.bbox.x0 + shape.bbox.x1 ) / 2 / window.__pca.engine.w,
		cy: ( shape.bbox.y0 + shape.bbox.y1 ) / 2 / window.__pca.engine.h,
	};
} );
await page.mouse.move(
	box.x + target.cx * box.width,
	box.y + target.cy * box.height
);
await page.mouse.down();
// Whatever is TOPMOST at that point is what the hand grabbed, and that
// need not be the first animal in the stack.
const grabbed = await page.evaluate( () => {
	const id = window.__pca.selected;
	const o = window.__pca.params.layers
		.flatMap( ( s ) => s.objects )
		.find( ( x ) => x.id === id );
	return { id, x: o.x, y: o.y };
} );
const beforeMove = await sig();
// STILL HELD DOWN. This is the check the old build could not pass: the
// rebuild sat behind a 120ms debounce that a continuous drag reset on
// every move, so nothing was drawn until the hand stopped.
await page.mouse.move(
	box.x + target.cx * box.width + 70,
	box.y + target.cy * box.height - 40,
	{ steps: 8 }
);
const duringMove = await sig();
check(
	beforeMove !== duringMove,
	'the picture follows the hand DURING the drag, not after it'
);
await page.mouse.up();
await page.waitForTimeout( 400 );
const moved = await page.evaluate( ( id ) => {
	const o = window.__pca.params.layers
		.flatMap( ( s ) => s.objects )
		.find( ( x ) => x.id === id );
	return {
		x: o.x,
		y: o.y,
		selected: window.__pca.selected === id,
		layersMoved: window.__pca.params.layers.filter( ( s ) => 0 !== s.dx )
			.length,
	};
}, grabbed.id );
check(
	Math.abs( moved.x - grabbed.x ) > 0.02 &&
		moved.selected &&
		0 === moved.layersMoved,
	`the object moves on its own, the layers stay put (${ grabbed.x.toFixed(
		2
	) } -> ${ moved.x.toFixed( 2 ) })`
);
check(
	Math.abs( moved.y - grabbed.y ) > 0.02,
	`and it takes the pointer's y too (${ grabbed.y.toFixed(
		2
	) } -> ${ moved.y.toFixed( 2 ) })`
);

/* ------------------------------- keyboard -------------------------------- */

const beforeKeys = await page.evaluate( () => {
	const o = window.__pca.params.layers
		.flatMap( ( s ) => s.objects )
		.find( ( x ) => 'animal' === x.kind );
	return { id: o.id, x: o.x, objects: window.__pca.params.layers
		.reduce( ( a, s ) => a + s.objects.length, 0 ) };
} );
await page.locator( '.wpiepca-view canvas' ).click( { position: { x: 2, y: 2 } } );
await page.evaluate( ( id ) => window.__pca.pick( id ), beforeKeys.id );
await page.keyboard.press( 'ArrowRight' );
await page.keyboard.press( 'ArrowRight' );
await page.waitForTimeout( 250 );
const nudged = await page.evaluate(
	( id ) =>
		window.__pca.params.layers
			.flatMap( ( s ) => s.objects )
			.find( ( x ) => x.id === id ).x,
	beforeKeys.id
);
check( nudged > beforeKeys.x, 'the arrow keys nudge the selection' );

await page.keyboard.press( 'Delete' );
await page.waitForTimeout( 250 );
const afterDelete = await page.evaluate( () =>
	window.__pca.params.layers.reduce( ( a, s ) => a + s.objects.length, 0 )
);
check(
	afterDelete === beforeKeys.objects - 1,
	`Delete removes the selection (${ beforeKeys.objects } -> ${ afterDelete })`
);

await page.keyboard.press( 'Control+z' );
await page.waitForTimeout( 300 );
const afterUndo = await page.evaluate( () =>
	window.__pca.params.layers.reduce( ( a, s ) => a + s.objects.length, 0 )
);
check(
	afterUndo === beforeKeys.objects,
	`and Ctrl+Z brings it back (${ afterDelete } -> ${ afterUndo })`
);

/* ------------------------- passepartout on top --------------------------- */

// The frame used to be a SETTING that always sat in front and could
// carry nothing. It is an object now, so it has to land at the very
// front by itself and let a bird share its sheet.
//
// Start from a picture WITHOUT one: a preset may bring its own, and
// picking a window then REPLACES it where it stands (deliberately - if
// somebody dragged their passepartout to the back, a window change must
// not quietly haul it forward again).
await page.evaluate( () => {
	const p = window.__pca.params;
	p.layers = p.layers.filter(
		( l ) => ! l.objects.some( ( o ) => 'frame' === o.kind )
	);
	window.__pca.engine.build( p );
} );
await page.locator( '.wpiepca-tile', { hasText: 'Stern' } ).first().click();
await page.waitForTimeout( 450 );
const framed = await page.evaluate( () => {
	const layers = window.__pca.params.layers;
	const at = layers.findIndex( ( l ) =>
		l.objects.some( ( o ) => 'frame' === o.kind )
	);
	const built = window.__pca.engine
		.allLayers()
		.find( ( s ) => s.layer.objects.some( ( o ) => 'frame' === o.kind ) );
	return {
		front: at === layers.length - 1,
		rings: built ? built.rings.length : 0,
		selected:
			window.__pca.selected ===
			layers[ at ].objects.find( ( o ) => 'frame' === o.kind ).id,
	};
} );
check( framed.front, 'the passepartout lands at the very front' );
check(
	framed.rings >= 2,
	`and is a full sheet with a window in it (${ framed.rings } rings)`
);
check( framed.selected, 'and is selected, so its dials are right there' );

// Its dials reach the shape.
const beforePoints = await page.evaluate( () => {
	const f = window.__pca.params.layers
		.flatMap( ( l ) => l.objects )
		.find( ( o ) => 'frame' === o.kind );
	const built = window.__pca.engine
		.allLayers()
		.find( ( s ) => s.layer.objects.some( ( o ) => o.id === f.id ) );
	return built.rings.reduce( ( a, r ) => a + r.length, 0 );
} );
await page.evaluate( () => {
	const f = window.__pca.params.layers
		.flatMap( ( l ) => l.objects )
		.find( ( o ) => 'frame' === o.kind );
	f.points = 17;
	f.sharp = 90;
	window.__pca.engine.build( window.__pca.params );
} );
const afterPoints = await page.evaluate( () => {
	const f = window.__pca.params.layers
		.flatMap( ( l ) => l.objects )
		.find( ( o ) => 'frame' === o.kind );
	const built = window.__pca.engine
		.allLayers()
		.find( ( s ) => s.layer.objects.some( ( o ) => o.id === f.id ) );
	return built.rings.reduce( ( a, r ) => a + r.length, 0 );
} );
check(
	beforePoints !== afterPoints,
	`the star dials reshape the window (${ beforePoints } -> ${ afterPoints })`
);

/* --------------------------- the colour picker --------------------------- */

// The editor's picker renders its popover INSIDE the swatch host. A
// selection that rebuilds the sheet list tears that host out in the
// same tick, and the picker looks broken (reported after the v2
// rework). So: the host must survive both its own click and selecting
// something else, and the colour must actually reach the sheet.
const pickerBefore = await page.evaluate( () =>
	window.__pca.params.layers.map( ( s ) => s.color ).join( ',' )
);
await page.locator( '.wpiepca-lcolor button' ).first().click();
await page.waitForTimeout( 400 );
const picker = await page.evaluate( () => {
	const host = document.querySelector( '.wpiepca-lcolor button' );
	const rows = document.querySelectorAll( '.wpiepca-lrow' );
	rows[ rows.length > 1 ? 1 : 0 ].click();
	return {
		colors: window.__pca.params.layers.map( ( s ) => s.color ).join( ',' ),
		painted: window.__pca.engine
			.allLayers()
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
	// Things, not layers: the word "layer" left this studio with the
	// nested stack it belonged to.
	/\d/.test( ampel ) && ! /Ebene|layer/i.test( ampel ),
	`the status line counts things, not layers (${ ampel.slice( 0, 40 ) }…)`
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
	sources: window.__pca.params.layers.map( ( s ) => s.source ),
	thresholds: window.__pca.params.photo.thresholds.length,
} ) );
check(
	sliced.sources.filter( ( b ) => 'photo' === b ).length >= 2 &&
		sliced.thresholds >= 2,
	`the document sliced into depth layers (${ JSON.stringify(
		sliced.sources
	) })`
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

// Downloads would leave the page during QA.
await page.evaluate( () => {
	HTMLAnchorElement.prototype.click = function () {};
} );

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
	`every layer arrived as its own image layer (${ inserted.children })`
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
	layers: window.__pca ? window.__pca.params.layers.length : 0,
	photo: window.__pca
		? window.__pca.params.layers.filter( ( s ) => 'photo' === s.source ).length
		: 0,
} ) );
check(
	reopened.layers > 0 && reopened.photo > 0,
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
	layers: window.__pca.params.layers.length,
	kinds: window.__pca.params.layers
		.flatMap( ( s ) => s.objects )
		.map( ( o ) => o.kind )
		.sort(),
} ) );
check(
	'forest' === v1.look &&
		2 === v1.layers &&
		v1.kinds.includes( 'animal' ) &&
		v1.kinds.includes( 'orb' ),
	`a v1 scene reopens with its elements as objects (${ JSON.stringify( v1 ) })`
);
await qa.shot( 'qa-4-edit.png' );

/* -------------------------- picking through a frame ---------------------- */

// A passepartout is a card with a window cut out of it, and it sits on the
// frontmost sheet. Its recorded shape is the card BEFORE the cut, so the
// hit test used to claim the whole picture - every click landed on the
// frame and dragging it moved what looks like the entire top layer.
// Reported by Thomas, 11.08.2026.
await page.evaluate( () => window.__pca.applyPreset( 'deerwood' ) );
await page.waitForTimeout( 500 );

const thruFrame = await page.evaluate( () => {
	const { engine } = window.__pca;
	const sheets = engine.allLayers();
	const at = ( fx, fy ) => {
		const h = engine.hitAt( engine.w * fx, engine.h * fy );
		return h ? h.type + ( h.object ? ':' + h.object.kind : '' ) : 'nothing';
	};
	// Every object at the point the eye would aim at.
	const missed = [];
	for ( const s of sheets ) {
		for ( const obj of s.layer.objects || [] ) {
			const op = engine.objectPath( obj.id );
			if ( ! op || ! op.bbox ) {
				continue;
			}
			if ( 'animal' !== obj.kind && 'orb' !== obj.kind ) {
				continue;
			}
			const hit = engine.hitAt(
				( op.bbox.x0 + op.bbox.x1 ) / 2 + s.layer.dx * engine.w,
				( op.bbox.y0 + op.bbox.y1 ) / 2 + s.layer.dy * engine.h
			);
			if ( ! hit || ! hit.object || hit.object.id !== obj.id ) {
				missed.push( obj.kind );
			}
		}
	}
	return {
		middle: at( 0.5, 0.5 ),
		upper: at( 0.5, 0.28 ),
		matTop: at( 0.5, 0.01 ),
		matLeft: at( 0.01, 0.5 ),
		missed,
	};
} );

check(
	'object:frame' !== thruFrame.middle && 'object:frame' !== thruFrame.upper,
	`the frame does not claim its own window (middle ${ thruFrame.middle }, upper ${ thruFrame.upper })`
);
check(
	'object:frame' === thruFrame.matTop && 'object:frame' === thruFrame.matLeft,
	`the frame is still grabbable on the mat itself (${ thruFrame.matTop } / ${ thruFrame.matLeft })`
);
check(
	0 === thruFrame.missed.length,
	`animals and orbs answer their own click through a frame (missed: ${
		thruFrame.missed.join( ', ' ) || 'none'
	})`
);

// And the gesture itself, because a hit test that answers correctly and a
// drag that moves the right thing are two different claims.
const deer = await page.evaluate( () => {
	const { engine } = window.__pca;
	for ( const s of engine.allLayers() ) {
		const obj = ( s.layer.objects || [] ).find(
			( o ) => 'animal' === o.kind
		);
		if ( ! obj ) {
			continue;
		}
		const op = engine.objectPath( obj.id );
		return {
			id: obj.id,
			x: obj.x,
			y: obj.y,
			cx: ( op.bbox.x0 + op.bbox.x1 ) / 2 + s.layer.dx * engine.w,
			cy: ( op.bbox.y0 + op.bbox.y1 ) / 2 + s.layer.dy * engine.h,
			w: engine.w,
			h: engine.h,
		};
	}
	return null;
} );
const view = await page.locator( '.wpiepca-view canvas' ).boundingBox();
const frameBefore = await page.evaluate(
	() =>
		window.__pca.params.layers
			.flatMap( ( s ) => s.objects )
			.find( ( o ) => 'frame' === o.kind ).x
);
await page.mouse.move(
	view.x + ( deer.cx / deer.w ) * view.width,
	view.y + ( deer.cy / deer.h ) * view.height
);
await page.mouse.down();
await page.mouse.move(
	view.x + ( deer.cx / deer.w ) * view.width + 60,
	view.y + ( deer.cy / deer.h ) * view.height - 25,
	{ steps: 8 }
);
await page.mouse.up();
await page.waitForTimeout( 250 );
const dragged = await page.evaluate( ( id ) => {
	const objs = window.__pca.params.layers.flatMap( ( s ) => s.objects );
	const a = objs.find( ( o ) => o.id === id );
	return {
		selected: window.__pca.selected === id,
		x: a.x,
		y: a.y,
		frameX: objs.find( ( o ) => 'frame' === o.kind ).x,
	};
}, deer.id );
check(
	dragged.selected && dragged.x !== deer.x && dragged.y !== deer.y,
	`dragging the deer moves the DEER (${ deer.x.toFixed(
		3
	) } -> ${ dragged.x.toFixed( 3 ) })`
);
check(
	dragged.frameX === frameBefore,
	'and leaves the passepartout where it was'
);

process.exit( await qa.finish() );
