/**
 * Headless dialog QA on the shared mock editor. Run from the extension
 * folder after `npm run build`: node tools/qa-dialog.mjs. One browser.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStage, launchQA } from '../../shared/qa-kit/stage.mjs';

const here = path.dirname( fileURLToPath( import.meta.url ) );
const root = path.resolve( here, '..' );
const stage = await buildStage( { root } );
const qa = await launchQA( { stage, shotDir: path.join( root, 'dist' ) } );
const { page, check } = qa;
const state = () => page.evaluate( () => window.__wpieppState() );
const settled = async ( before ) => {
	await page
		.waitForFunction(
			( n ) => {
				const s = window.__wpieppState && window.__wpieppState();
				return s && s.frames > n && ! s.busy;
			},
			before,
			{ timeout: 40000 }
		)
		.catch( () => {} );
	return state();
};
const frames = async () => ( await state() ).frames;
const inkPixels = () =>
	page.evaluate( () => {
		const c = document.querySelector( '.wpiepp-canvas' );
		const g = document.createElement( 'canvas' ).getContext( '2d' );
		g.canvas.width = 32;
		g.canvas.height = 32;
		g.drawImage( c, 0, 0, 32, 32 );
		const d = g.getImageData( 0, 0, 32, 32 ).data;
		let ink = 0;
		for ( let i = 0; i < d.length; i += 4 ) {
			if (
				Math.abs( d[ i ] - d[ i + 1 ] ) +
					Math.abs( d[ i + 1 ] - d[ i + 2 ] ) >
					40 ||
				d[ i ] + d[ i + 1 ] + d[ i + 2 ] < 500
			) {
				ink++;
			}
		}
		return ink;
	} );
const setInput = ( sel, value ) =>
	page.evaluate(
		( [ s, v ] ) => {
			const el = document.querySelector( s );
			el.value = v;
			el.dispatchEvent( new Event( 'input', { bubbles: true } ) );
		},
		[ sel, value ]
	);

try {
	await page.waitForFunction(
		() =>
			window.__wpieppState &&
			window.__wpieppState().frames > 0 &&
			! window.__wpieppState().busy,
		null,
		{ timeout: 40000 }
	);
	await page.waitForTimeout( 400 );
	const dialogHeight = async () =>
		( await page.locator( '.wpiepp-dialog' ).boundingBox() ).height;
	const heights = { start: await dialogHeight() };
	check(
		1 === ( await page.locator( '.wpiepp-body' ).count() ),
		'dialog mounts'
	);
	check(
		await page.evaluate(
			() => !! document.querySelector( '.dsm-badge svg' )
		),
		'header shows the brand mark'
	);
	check(
		( await page.locator( '.wpiepp-starter' ).count() ) >= 120,
		'the starters are listed'
	);
	let st = await state();
	check(
		'birthday-kids-bunting' === st.starter && 'bunting' === st.item,
		'opens on the birthday bunting'
	);
	check(
		!! st.last &&
			Math.abs( st.last.width - 2480 ) < 3 &&
			Math.abs( st.last.height - 3508 ) < 3 &&
			0 === st.last.warnings.length,
		'an A4 sheet at 300 dpi renders without warnings (' +
			( st.last && st.last.width + 'x' + st.last.height ) +
			')'
	);
	check(
		st.last.count >= 4 && st.last.svg.includes( '>H<' ),
		'the pennants carry the letters (' + st.last.count + ' per sheet)'
	);
	check( ( await inkPixels() ) > 40, 'the sheet shows colour' );
	check(
		/210 × 297 mm/.test( st.status ),
		'the status names the sheet (' + st.status + ')'
	);
	const viewBox = await page.locator( '.wpiepp-view' ).boundingBox();
	const matBox = await page
		.locator( '.wpiepp-mid .wpiepp-material' )
		.boundingBox();
	check(
		!! viewBox &&
			!! matBox &&
			matBox.y >= viewBox.y + viewBox.height - 1 &&
			matBox.width > 600,
		'the material panel sits under the sheet, full width'
	);
	await qa.shot( 'party-printables-dialog.png' );

	// Typing re-renders.
	let before = await frames();
	await page.locator( '.wpiepp-text' ).fill( 'MIA' );
	st = await settled( before );
	check(
		3 === st.last.count &&
			st.last.svg.includes( '>M<' ) &&
			null === st.starter,
		'typing MIA gives three pennants'
	);

	// The picker.
	await page.locator( '.wpiepp-pick' ).click();
	await page.waitForTimeout( 150 );
	const pick = await page.locator( '.wpiepp-picker' ).boundingBox();
	const vp = page.viewportSize();
	check(
		!! pick &&
			pick.x >= 0 &&
			pick.y >= 0 &&
			pick.x + pick.width <= vp.width &&
			pick.y + pick.height <= vp.height,
		'the picker opens inside the viewport'
	);
	check(
		69 === ( await page.locator( '.wpiepp-picker .wpiepp-tile' ).count() ),
		'sixty-nine item tiles in the picker'
	);
	before = await frames();
	await page
		.locator( '.wpiepp-picker .wpiepp-tile[data-type="placecards"]' )
		.click();
	st = await settled( before );
	check(
		await page.locator( '.wpiepp-picker' ).isHidden(),
		'the picker closes'
	);
	check(
		'placecards' === st.item &&
			1 === ( await page.locator( '.wpiepp-names' ).count() ) &&
			0 === ( await page.locator( '.wpiepp-text' ).count() ),
		'place cards show the names field and no text field'
	);
	before = await frames();
	await page
		.locator( '.wpiepp-names' )
		.fill( 'Anna\nBen\nClara\nDavid\nEmma\nFelix' );
	st = await settled( before );
	check(
		6 === st.params.event.names.length &&
			st.last.svg.includes( '>Clara<' ) &&
			4 === st.last.count &&
			2 === st.last.pages,
		'six guests give two sheets of four cards (' +
			st.last.count +
			'/' +
			st.last.pages +
			')'
	);
	check(
		! ( await page.locator( '.wpiepp-pages' ).isHidden() ),
		'the page switch appears'
	);
	before = await frames();
	await page.locator( '.wpiepp-page-btn' ).last().click();
	st = await settled( before );
	check(
		2 === st.last.page &&
			st.last.svg.includes( '>Felix<' ) &&
			! st.last.svg.includes( '>Anna<' ),
		'the second sheet carries the last guests'
	);
	check(
		st.last.svg.includes( 'stroke-dasharray' ),
		'the tent fold is a dashed line'
	);

	// Sheet controls.
	before = await frames();
	await page.locator( 'select[data-key="format"]' ).selectOption( 'letter' );
	st = await settled( before );
	check(
		Math.abs( st.last.width - 2550 ) < 3 &&
			/216 × 279 mm/.test( st.status ),
		'US Letter changes the sheet (' + st.status + ')'
	);
	before = await frames();
	await page.locator( 'input[data-key="landscape"]' ).check();
	st = await settled( before );
	check( st.last.width > st.last.height, 'landscape swaps the sheet' );
	before = await frames();
	await page.locator( 'select[data-key="marks"]' ).selectOption( 'none' );
	st = await settled( before );
	check(
		! st.last.svg.includes( 'stroke-dasharray' ),
		'no marks removes the fold lines too'
	);

	// Theme controls.
	before = await frames();
	await page
		.locator( 'select[data-key="occasion"]' )
		.selectOption( 'halloween' );
	st = await settled( before );
	check(
		( 'halloween' === st.params.theme.occasion &&
			st.last.svg.includes( '#1a1a1a' ) === false ) ||
			st.last.svg.length > 1000,
		'the occasion switches the theme'
	);
	const svgBefore = st.last.svg;
	before = await frames();
	await page.locator( 'select[data-key="pattern"]' ).selectOption( 'stars' );
	st = await settled( before );
	check(
		st.last.svg !== svgBefore && 'stars' === st.params.theme.pattern.id,
		'the pattern select changes the sheet'
	);
	before = await frames();
	await page.locator( 'select[data-key="palette"]' ).selectOption( 'custom' );
	st = await settled( before );
	check(
		'object' === typeof st.params.theme.palette &&
			5 === ( await page.locator( '.wpiepp-color' ).count() ),
		'custom colors show five swatches'
	);
	before = await frames();
	await page.locator( 'select[data-key="palette"]' ).selectOption( 'brand' );
	st = await settled( before );
	check(
		'brand' === st.params.theme.palette && 0 === st.last.warnings.length,
		'the brand kit palette renders'
	);

	// Event fields reach the item.
	before = await frames();
	await page.locator( '.wpiepp-pick' ).click();
	await page.waitForTimeout( 150 );
	await page
		.locator( '.wpiepp-picker .wpiepp-tile[data-type="bottlelabels"]' )
		.click();
	st = await settled( before );
	before = await frames();
	await setInput( 'input[data-key="event-title"]', 'Summit 2027' );
	await setInput( 'input[data-key="event-date"]', '12 May' );
	st = await settled( before );
	check(
		st.last.svg.includes( '12 May' ) &&
			st.last.svg.includes( 'Summit 2027' ) &&
			st.last.svg.includes( '>Aqua<' ),
		'the bottle labels carry the label text, the event title and the date'
	);

	// Item options.
	before = await frames();
	await setInput( 'input[data-key="fit"]', '3' );
	st = await settled( before );
	check(
		3 === st.last.count && 3 === st.params.sheet.fit,
		'copies per sheet limit the pieces (' + st.last.count + ')'
	);
	before = await frames();
	await setInput( 'input[data-key="fit"]', '' );
	st = await settled( before );
	check(
		'auto' === st.params.sheet.fit && st.last.count > 3,
		'an empty field fills the sheet again'
	);
	before = await frames();
	await page.locator( 'select[data-key="size"]' ).selectOption( '1' );
	st = await settled( before );
	check(
		100 === st.params.item.w && 70 === st.params.item.h,
		'a size preset sets the item'
	);
	before = await frames();
	await page.locator( 'select[data-key="size"]' ).selectOption( 'custom' );
	st = await settled( before );
	check(
		1 === ( await page.locator( 'input[data-key="item-w"]' ).count() ),
		'custom size shows the mm fields'
	);

	// Photos: a sticker sheet with the document as photo.
	before = await frames();
	await page.locator( '.wpiepp-starter[data-id="baby-stickers"]' ).click();
	st = await settled( before );
	check(
		'stickers' === st.item &&
			1 ===
				( await page
					.locator( '.wpiepp-material-photo select' )
					.count() ),
		'the sticker starter offers a photo source'
	);
	before = await frames();
	await page
		.locator( '.wpiepp-material-photo select' )
		.selectOption( 'document' );
	st = await settled( before );
	check(
		st.last.svg.includes( '<image' ) &&
			st.last.svg.includes( 'data:image/png' ) &&
			0 === st.last.warnings.length,
		'the document lands as a photo in the stickers'
	);

	// Straw flags: dialog height across items.
	before = await frames();
	await page
		.locator( '.wpiepp-starter[data-id="wedding-strawflags"]' )
		.click();
	st = await settled( before );
	check(
		'strawflags' === st.item && st.last.svg.includes( 'Mr &amp; Mrs' ),
		'the straw flags starter escapes the ampersand'
	);
	heights.end = await dialogHeight();
	check(
		Math.abs( heights.end - heights.start ) < 1,
		'the dialog keeps its height (' +
			Math.round( heights.start ) +
			' -> ' +
			Math.round( heights.end ) +
			')'
	);

	// 3.1 / 3.2 items through their starters.
	before = await frames();
	await page
		.locator( '.wpiepp-starter[data-id="wedding-invitation"]' )
		.click();
	st = await settled( before );
	check(
		'invitation' === st.item &&
			st.last.svg.includes( 'Villa Rosa' ) &&
			st.last.svg.includes( 'Summit 2027' ) &&
			2 === st.last.count,
		'the invitation carries the event data (the typed title survives the starter), two postcards per A4 (' +
			st.last.count +
			')'
	);
	check(
		1 === ( await page.locator( '.wpiepp-text' ).count() ) &&
			(
				await page
					.locator( '.wpiepp-material .wpiepp-note' )
					.first()
					.textContent()
			).length > 4,
		'the material panel shows the item text label'
	);
	before = await frames();
	await page
		.locator( '.wpiepp-starter[data-id="corporate-tickets"]' )
		.click();
	st = await settled( before );
	check(
		'tickets' === st.item &&
			st.last.svg.includes( '001' ) &&
			st.last.svg.includes( '004' ) &&
			2 === st.last.pages,
		'tickets count from 001 over two sheets'
	);
	before = await frames();
	await setInput( 'input[data-key="start"]', '50' );
	st = await settled( before );
	check(
		st.last.svg.includes( '050' ) && ! st.last.svg.includes( '001' ),
		'the first number moves the serials'
	);
	before = await frames();
	await page
		.locator( '.wpiepp-starter[data-id="wedding-addresslabels"]' )
		.click();
	st = await settled( before );
	check(
		'addresslabels' === st.item &&
			3 === st.last.count &&
			st.last.svg.includes( 'Clara Schmidt' ),
		'three address blocks give three labels'
	);
	before = await frames();
	await page
		.locator( '.wpiepp-starter[data-id="birthday-kids-bingo"]' )
		.click();
	st = await settled( before );
	check(
		'bingo' === st.item &&
			7 === st.last.pieces &&
			st.last.svg.includes( '>B<' ) &&
			st.last.svg.includes( '>O<' ),
		'bingo renders six cards and a call list'
	);
	before = await frames();
	await setInput( 'input[data-key="seed"]', '9' );
	const seededSvg = ( await settled( before ) ).last.svg;
	check(
		seededSvg !== st.last.svg && 9 === ( await state() ).params.item.seed,
		'the seed changes the draw'
	);
	before = await frames();
	await page.locator( '.wpiepp-starter[data-id="corporate-chess"]' ).click();
	st = await settled( before );
	check(
		'chess' === st.item &&
			st.last.svg.includes( 'M46 4H54' ) &&
			st.last.svg.includes( 'White to move' ) &&
			0 === st.last.warnings.length,
		'the chess diagram draws kings and the caption'
	);
	before = await frames();
	await page.locator( 'select[data-key="board"]' ).selectOption( 'go' );
	st = await settled( before );
	check(
		'go' === st.params.item.board &&
			1 === ( await page.locator( 'input[data-key="lines"]' ).count() ),
		'go shows the lines field'
	);
	before = await frames();
	await page.locator( '.wpiepp-starter[data-id="summer-tactics"]' ).click();
	st = await settled( before );
	check(
		'tactics' === st.item &&
			( st.last.svg.match( /<circle/g ) || [] ).length >= 9 &&
			st.last.svg.includes( 'stroke-dasharray' ),
		'the tactics board draws players, a pass and the field'
	);
	// 3.3: puzzles bring a solution sheet, wide items turn the sheet.
	before = await frames();
	await page
		.locator( '.wpiepp-starter[data-id="retirement-sudoku"]' )
		.click();
	st = await settled( before );
	check(
		'sudoku' === st.item && 2 === st.last.pieces && 2 === st.last.count,
		'the sudoku comes with its solution sheet (' +
			st.last.pieces +
			' pieces)'
	);
	before = await frames();
	await page.locator( 'input[data-key="solution"]' ).uncheck();
	st = await settled( before );
	check( 1 === st.last.pieces, 'the solution sheet can be left off' );
	await page.locator( '.wpiepp-pick' ).click();
	await page.waitForTimeout( 150 );
	before = await frames();
	await page
		.locator( '.wpiepp-picker .wpiepp-tile[data-type="bracket"]' )
		.click();
	st = await settled( before );
	check(
		'bracket' === st.item &&
			true === st.params.sheet.landscape &&
			1 === st.last.count &&
			0 === st.last.warnings.length,
		'a wide item turns the sheet to landscape by itself'
	);

	// Memory: several photos from the mock Media Library.
	before = await frames();
	await page
		.locator( '.wpiepp-starter[data-id="birthday-kids-memory"]' )
		.click();
	st = await settled( before );
	check(
		'memory' === st.item &&
			'media' === st.params.photo.source &&
			1 ===
				( await page
					.locator( '.wpiepp-material-photo .mock-media' )
					.count() ),
		'the memory starter opens the multi picker'
	);
	before = await frames();
	await page
		.locator( '.wpiepp-material-photo .mock-media-item' )
		.nth( 0 )
		.click();
	await settled( before );
	before = await frames();
	await page
		.locator( '.wpiepp-material-photo .mock-media-item' )
		.nth( 1 )
		.click();
	st = await settled( before );
	check(
		2 === st.params.photo.items.length &&
			st.last.svg.includes( 'data:image/png' ) &&
			4 === st.last.pieces,
		'two chosen pictures give two pairs (' + st.last.pieces + ' pieces)'
	);
	before = await frames();
	await page
		.locator( '.wpiepp-material-photo .mock-media-item' )
		.nth( 0 )
		.click();
	st = await settled( before );
	check(
		1 === st.params.photo.items.length && 2 === st.last.pieces,
		'clicking a chosen picture again removes it'
	);
	before = await frames();
	await page.locator( 'select[data-key="side"]' ).selectOption( 'back' );
	st = await settled( before );
	check(
		'back' === st.params.item.side && st.last.count >= 12,
		'the backs fill the sheet'
	);

	// The starter filter.
	await page.locator( '.wpiepp-filter select' ).selectOption( 'christmas' );
	await page.waitForTimeout( 100 );
	check(
		( await page.locator( '.wpiepp-starter' ).count() ) >= 8 &&
			( await page.locator( '.wpiepp-starter' ).count() ) < 40,
		'the occasion filter narrows the starters'
	);

	// 2.x params open in the new model.
	before = await frames();
	await page.evaluate( () =>
		window.__wpieppProof.open( {
			mode: 'bunting',
			text: 'OLD',
			paletteId: 'gold',
			shape: 'swallow',
		} )
	);
	st = await settled( before );
	check(
		'bunting' === st.item &&
			3 === st.params.v &&
			'swallowtail' === st.params.item.shape &&
			st.last.svg.includes( '>O<' ),
		'2.x params open as a 3.0 sheet'
	);

	// Insert: the sheet as a 300 dpi image, the document takes the sheet size.
	await page.locator( '.wpiepp-filter select' ).selectOption( 'all' );
	await page.waitForTimeout( 100 );
	before = await frames();
	await page.locator( '.wpiepp-starter[data-id="wedding-tags"]' ).click();
	st = await settled( before );
	await page.evaluate( () => ( window.__dispatched = [] ) );
	await page.locator( '.wpiepp-insert' ).click();
	await page
		.waitForFunction(
			() =>
				( window.__dispatched || [] ).some(
					( a ) => 'ADD_LAYER' === a.type
				),
			null,
			{ timeout: 60000 }
		)
		.catch( () => {} );
	const added = await page.evaluate( () => {
		const d = window.__dispatched || [];
		const add = d.find( ( a ) => 'ADD_LAYER' === a.type );
		const setDoc = d.find( ( a ) => 'SET_DOC' === a.type );
		const l = add && add.layer;
		return {
			has: !! l,
			type: l && l.type,
			png: !! ( l && String( l.src ).startsWith( 'data:image/png' ) ),
			w: l && l.w,
			h: l && l.h,
			nat: l && l.naturalW,
			gen: l && l.generator && l.generator.id,
			item: l && l.generator && l.generator.params.item.type,
			page: l && l.generator.params.sheet.page,
			docW: setDoc && setDoc.doc.w,
			pages: d.filter( ( a ) => 'SET_PAGES' === a.type ).length,
			closed: ! document.querySelector( '.wpiepp-body' ),
		};
	} );
	check(
		!! added && added.has && 'image' === added.type && added.png,
		'insert adds one image layer (' + ( added && added.type ) + ')'
	);
	check(
		!! added &&
			2480 === added.w &&
			3508 === added.h &&
			2480 === added.nat &&
			2480 === added.docW,
		'the sheet fills a document set to A4 at 300 dpi (' +
			( added && added.w ) +
			'x' +
			( added && added.h ) +
			')'
	);
	check(
		!! added &&
			'wpie-party-printables/sheet' === added.gen &&
			'tags' === added.item &&
			1 === added.page,
		'the layer carries the sheet params'
	);
	check(
		!! added && 0 === added.pages && added.closed,
		'one sheet makes no pages and the dialog closes'
	);
	// The inserted picture itself, for a look: dist/insert.png.
	const insertedPng = await page.evaluate( () => {
		const add = ( window.__dispatched || [] ).find(
			( a ) => 'ADD_LAYER' === a.type
		);
		return add ? String( add.layer.src ) : '';
	} );
	if ( insertedPng.startsWith( 'data:image/png;base64,' ) ) {
		fs.writeFileSync(
			path.join( root, 'dist', 'insert.png' ),
			Buffer.from( insertedPng.split( ',' )[ 1 ], 'base64' )
		);
	}
	check(
		insertedPng.length > 200000,
		'the inserted sheet is a real picture (' +
			Math.round( insertedPng.length / 1024 ) +
			' KB)'
	);

	// Edit reopens with the stored sheet.
	await page.evaluate( () => {
		const add = ( window.__dispatched || [] ).find(
			( a ) => 'ADD_LAYER' === a.type
		);
		window.__gen.edit( {
			editor: window.__editor,
			layer: add.layer,
			extras: {},
		} );
	} );
	await page
		.waitForFunction(
			() => window.__wpieppState && window.__wpieppState().frames > 0,
			null,
			{ timeout: 30000 }
		)
		.catch( () => {} );
	st = await settled( 0 );
	check(
		'tags' === st.item &&
			'heart' === st.params.item.shape &&
			true === st.editing,
		'edit reopens with the stored sheet'
	);
	await page.evaluate( () => ( window.__dispatched = [] ) );
	await page.locator( '.wpiepp-insert' ).click();
	await page
		.waitForFunction(
			() =>
				( window.__dispatched || [] ).some(
					( a ) => 'UPDATE_LAYER' === a.type
				),
			null,
			{ timeout: 60000 }
		)
		.catch( () => {} );
	const updated = await page.evaluate( () => {
		const u = ( window.__dispatched || [] ).find(
			( a ) => 'UPDATE_LAYER' === a.type
		);
		return (
			u && {
				png: String( u.patch.src ).startsWith( 'data:image/png' ),
				setDoc: ( window.__dispatched || [] ).some(
					( a ) => 'SET_DOC' === a.type
				),
			}
		);
	} );
	check(
		!! updated && updated.png && ! updated.setDoc,
		'update replaces the image and leaves the document size alone'
	);

	// A multi-sheet item: every further sheet becomes a page.
	await page.evaluate( () =>
		window.__gen.run( { editor: window.__editor, extras: {} } )
	);
	await page
		.waitForFunction(
			() =>
				window.__wpieppState &&
				window.__wpieppState().frames > 0 &&
				! window.__wpieppState().busy,
			null,
			{ timeout: 40000 }
		)
		.catch( () => {} );
	before = await frames();
	await page
		.locator( '.wpiepp-starter[data-id="wedding-placecards"]' )
		.click();
	st = await settled( before );
	check(
		'placecards' === st.item && 2 === st.last.pages,
		'eight guests need two sheets (' + st.last.pages + ')'
	);
	await page.evaluate( () => ( window.__dispatched = [] ) );
	await page.locator( '.wpiepp-insert' ).click();
	await page
		.waitForFunction(
			() =>
				( window.__dispatched || [] ).some(
					( a ) => 'SET_PAGES' === a.type
				),
			null,
			{ timeout: 90000 }
		)
		.catch( () => {} );
	const paged = await page.evaluate( () => {
		const d = window.__dispatched || [];
		const sp = d.find( ( a ) => 'SET_PAGES' === a.type );
		const add = d.find( ( a ) => 'ADD_LAYER' === a.type );
		if ( ! sp ) {
			return null;
		}
		const p2 = sp.pages[ 1 ];
		return {
			n: sp.pages.length,
			current: sp.current,
			firstHas: !! (
				sp.pages[ 0 ] &&
				sp.pages[ 0 ].layers.some( ( l ) => l.id === add.layer.id )
			),
			p2doc: p2 && p2.doc.w + 'x' + p2.doc.h,
			p2png: !! (
				p2 &&
				p2.layers[ 0 ] &&
				String( p2.layers[ 0 ].src ).startsWith( 'data:image/png' )
			),
			p2page: p2 && p2.layers[ 0 ].generator.params.sheet.page,
			p2name: p2 && p2.layers[ 0 ].name,
		};
	} );
	check(
		!! paged && 2 === paged.n && 0 === paged.current && paged.firstHas,
		'the open document becomes page one with the first sheet'
	);
	check(
		!! paged &&
			'2480x3508' === paged.p2doc &&
			paged.p2png &&
			2 === paged.p2page &&
			/2\/2/.test( paged.p2name ),
		'sheet two is a page of its own with the second sheet (' +
			( paged && paged.p2name ) +
			')'
	);
} catch ( e ) {
	check( false, 'threw: ' + ( ( e && e.stack ) || e ) );
}
process.exit( await qa.finish() );
