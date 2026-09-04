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
fs.mkdirSync( path.join( stage, 'assets' ), { recursive: true } );
fs.copyFileSync( path.join( root, 'assets', 'mathjax.js' ), path.join( stage, 'assets', 'mathjax.js' ) );
const qa = await launchQA( { stage, shotDir: path.join( root, 'dist' ) } );
const { page, check } = qa;
const state = () => page.evaluate( () => window.__wpiemfState() );
const settled = async ( before ) => {
	await page.waitForFunction( ( n ) => {
		const s = window.__wpiemfState && window.__wpiemfState();
		return s && s.frames > n && ! s.busy;
	}, before, { timeout: 40000 } ).catch( () => {} );
	return state();
};
const frames = async () => ( await state() ).frames;
const darkPixels = () =>
	page.evaluate( () => {
		const c = document.querySelector( '.wpiemf-canvas' );
		const g = document.createElement( 'canvas' ).getContext( '2d' );
		g.canvas.width = 24;
		g.canvas.height = 24;
		g.drawImage( c, 0, 0, 24, 24 );
		const d = g.getImageData( 0, 0, 24, 24 ).data;
		let dark = 0;
		for ( let i = 0; i < d.length; i += 4 ) {
			if ( d[ i ] + d[ i + 1 ] + d[ i + 2 ] < 600 ) {
				dark++;
			}
		}
		return dark;
	} );

try {
	await page.waitForFunction( () => window.__wpiemfState && window.__wpiemfState().frames > 0 && ! window.__wpiemfState().busy, null, { timeout: 40000 } );
	await page.waitForTimeout( 400 );
	const dialogHeight = async () => ( await page.locator( '.wpiemf-dialog' ).boundingBox() ).height;
	const heights = { start: await dialogHeight() };
	check( 1 === ( await page.locator( '.wpiemf-body' ).count() ), 'dialog mounts' );
	check( await page.evaluate( () => !! document.querySelector( '.dsm-badge svg path[fill="#3b66ff"]' ) ), 'header shows the brand mark' );
	check( 1 === ( await page.locator( '.wpiemf-block' ).count() ), 'the figure starts with one block' );
	check( ( await page.locator( '.wpiemf-starter' ).count() ) >= 38, 'the starters are listed' );
	let st = await state();
	check( 'quadratic' === st.starter && 1 === st.blocks.length && 'formula' === st.blocks[ 0 ], 'opens on the quadratic formula' );
	check( !! st.last && 1600 === st.last.width && st.last.height > 100 && 0 === st.last.warnings.length, 'the figure renders without warnings (' + ( st.last && st.last.width + 'x' + st.last.height ) + ')' );
	check( ( await darkPixels() ) > 3, 'the paper shows ink' );
	check( /1600/.test( st.status ), 'the status names the size' );
	const viewBox = await page.locator( '.wpiemf-view' ).boundingBox();
	const matBox = await page.locator( '.wpiemf-mid .wpiemf-material' ).boundingBox();
	check( !! viewBox && !! matBox && matBox.y >= viewBox.y + viewBox.height - 1 && matBox.width > 600 && matBox.x >= viewBox.x - 1, 'the material panel sits under the picture, full width (' + ( matBox && Math.round( matBox.width ) ) + ' px)' );
	check( 0 === ( await page.locator( '.wpiemf-left .wpiemf-text' ).count() ), 'the left column has no text field any more' );
	await qa.shot( 'math-figures-dialog.png' );

	// Add a text block through the picker.
	await page.locator( '.wpiemf-add' ).click();
	await page.waitForTimeout( 150 );
	const pick = await page.locator( '.wpiemf-picker' ).boundingBox();
	const vp = page.viewportSize();
	check( !! pick && pick.x >= 0 && pick.y >= 0 && pick.x + pick.width <= vp.width && pick.y + pick.height <= vp.height, 'the picker opens inside the viewport (' + ( pick && Math.round( pick.x ) + ',' + Math.round( pick.y ) ) + ')' );
	check( ( await page.locator( '.wpiemf-picker .wpiemf-tile' ).count() ) === 19, 'nineteen block tiles in the picker' );
	let before = await frames();
	await page.locator( '.wpiemf-picker .wpiemf-tile[data-type="text"]' ).click();
	st = await settled( before );
	check( await page.locator( '.wpiemf-picker' ).isHidden(), 'the picker closes' );
	check( 2 === ( await page.locator( '.wpiemf-block' ).count() ) && 'text' === st.blocks[ 1 ], 'a text block joins the figure' );
	check( ( await page.locator( '.wpiemf-block.is-on' ).getAttribute( 'data-id' ) ) === st.blockId && 'text' === st.params.blocks.find( ( b ) => b.id === st.blockId ).type, 'the new block is selected' );
	check( st.last.svg.includes( 'quadratic' ), 'the new block starts with its starter text' );

	// Typing into the material re-renders.
	before = await frames();
	await page.locator( '.wpiemf-text' ).fill( 'Hello **world** and $x^2$' );
	st = await settled( before );
	check( st.last.svg.includes( '>world<' ) && st.last.svg.includes( 'font-weight="700"' ) && null === st.starter, 'typing re-renders with bold text' );

	// Typography: a title with its own size.
	before = await frames();
	await page.locator( 'input[data-key="head-title"]' ).fill( 'My title' );
	st = await settled( before );
	check( st.last.svg.includes( '>My title<' ) && st.last.svg.includes( 'font-size="40"' ), 'the title appears at 40 px' );
	before = await frames();
	await page.evaluate( () => {
		const el = document.querySelector( 'input[data-key="typo-size"]' );
		el.value = '64';
		el.dispatchEvent( new Event( 'input', { bubbles: true } ) );
	} );
	st = await settled( before );
	check( st.last.svg.includes( 'font-size="64"' ) && 64 === st.params.typo.title.size, 'the size slider changes the title' );

	// A worked solution block.
	await page.locator( '.wpiemf-add' ).click();
	await page.waitForTimeout( 150 );
	before = await frames();
	await page.locator( '.wpiemf-picker .wpiemf-tile[data-type="steps"]' ).click();
	st = await settled( before );
	check( 3 === st.blocks.length && 'steps' === st.blocks[ 2 ] && st.last.svg.includes( '>subtract 5 on both sides<' ), 'a steps block with its starter' );
	before = await frames();
	await page.locator( '.wpiemf-text' ).fill( '2x = 4 | halve' );
	st = await settled( before );
	check( st.last.svg.includes( '>halve<' ) && 0 === st.last.warnings.length, 'steps re-render with the note' );

	// Marks on the formula block.
	before = await frames();
	await page.locator( '.wpiemf-block' ).first().click();
	await page.waitForTimeout( 100 );
	await page.locator( '.wpiemf-text' ).fill( 'x = \\mark{a}{2a}' );
	await page.locator( '.wpiemf-notes' ).fill( 'a "denominator" below' );
	st = await settled( before );
	check( st.last.svg.includes( '>denominator<' ) && st.last.svg.includes( 'fill-opacity="0.25"' ) && 0 === st.last.warnings.length, 'a mark gets its highlight and label (' + st.status + ')' );

	// A primary school block: the clock.
	await page.locator( '.wpiemf-add' ).click();
	await page.waitForTimeout( 150 );
	before = await frames();
	await page.locator( '.wpiemf-picker .wpiemf-tile[data-type="clock"]' ).click();
	st = await settled( before );
	check( 'clock' === st.blocks[ st.blocks.length - 1 ] && st.last.svg.includes( '<circle' ) && st.last.svg.includes( 'stroke-linecap="round"' ) && 0 === st.last.warnings.length, 'a clock block renders faces and hands (' + st.status + ')' );
	before = await frames();
	await page.locator( 'input[data-key="digital"]' ).click();
	st = await settled( before );
	check( st.last.svg.includes( '>07:35<' ), 'the digital readout follows the checkbox' );
	before = await frames();
	await page.locator( '.wpiemf-text' ).fill( '7:35\n8:00\n9:15\n10:30' );
	st = await settled( before );
	check( 4 === ( st.last.svg.match( /stroke-linecap="round"/g ) || [] ).length / 2 && 0 === st.last.warnings.length, 'typing times into the material draws four clocks (' + st.status + ' | stored: ' + JSON.stringify( st.params.blocks[ st.params.blocks.length - 1 ].clock ) + ' | faces: ' + ( st.last.svg.match( /<circle[^>]*stroke-width="3"/g ) || [] ).length + ' | hands: ' + ( st.last.svg.match( /stroke-linecap="round"/g ) || [] ).length + ' | textarea: ' + JSON.stringify( await page.locator( '.wpiemf-text' ).inputValue() ) + ')' );
	before = await frames();
	await page.locator( '.wpiemf-text' ).fill( '7.35 Uhr\n8 Uhr\n9:15\n10h30' );
	st = await settled( before );
	check( 4 === ( st.last.svg.match( /stroke-linecap="round"/g ) || [] ).length / 2 && 0 === st.last.warnings.length, 'everyday spellings of the time are accepted (' + st.status + ')' );
	before = await frames();
	await page.locator( '.wpiemf-text' ).fill( '7:35\nhalf past' );
	st = await settled( before );
	check( ( await page.locator( '.wpiemf-errors' ).isVisible() ) && /2/.test( await page.locator( '.wpiemf-errors' ).textContent() ), 'a bad line shows its error under the field (' + ( await page.locator( '.wpiemf-errors' ).textContent() ) + ')' );
	before = await frames();
	await page.locator( '.wpiemf-text' ).fill( '7:35' );
	st = await settled( before );
	check( await page.locator( '.wpiemf-errors' ).isHidden(), 'the error line hides again' );
	before = await frames();
	await page.locator( '.wpiemf-block.is-on .wpiemf-block-btn[data-act="remove"]' ).click();
	st = await settled( before );

	// A secondary school block: statistics as a bar chart.
	await page.locator( '.wpiemf-add' ).click();
	await page.waitForTimeout( 150 );
	before = await frames();
	await page.locator( '.wpiemf-picker .wpiemf-tile[data-type="stats"]' ).click();
	st = await settled( before );
	check( 'stats' === st.blocks[ st.blocks.length - 1 ] && 0 === st.last.warnings.length && st.last.svg.includes( '<circle' ), 'a statistics block renders its dot plot (' + st.status + ')' );
	before = await frames();
	await page.locator( 'select[data-key="chart"]' ).selectOption( 'bar' );
	st = await settled( before );
	check( ( st.last.svg.match( /fill-opacity="0.75"/g ) || [] ).length >= 5, 'the chart select switches to bars' );
	before = await frames();
	await page.locator( '.wpiemf-block.is-on .wpiemf-block-btn[data-act="remove"]' ).click();
	st = await settled( before );

	// Move and remove (the formula block first, so "down" is enabled).
	await page.locator( '.wpiemf-block' ).first().click();
	await page.waitForTimeout( 100 );
	before = await frames();
	await page.locator( '.wpiemf-block.is-on .wpiemf-block-btn[data-act="down"]' ).click();
	st = await settled( before );
	check( 'text' === st.blocks[ 0 ] && 'formula' === st.blocks[ 1 ], 'move down reorders (' + st.blocks.join( ',' ) + ')' );
	before = await frames();
	await page.locator( '.wpiemf-block.is-on .wpiemf-block-btn[data-act="remove"]' ).click();
	st = await settled( before );
	before = await frames();
	await page.locator( '.wpiemf-block.is-on .wpiemf-block-btn[data-act="remove"]' ).click();
	st = await settled( before );
	check( 1 === st.blocks.length && ( await page.locator( '.wpiemf-block-btn[data-act="remove"]' ).isDisabled() ), 'remove keeps one block and then disables (' + st.blocks.join( ',' ) + ')' );
	heights.end = await dialogHeight();
	check( Math.abs( heights.end - heights.start ) < 1, 'the dialog keeps its height (' + Math.round( heights.start ) + ' -> ' + Math.round( heights.end ) + ')' );

	// A whole-figure starter and a 0.1 group.
	before = await frames();
	await page.locator( '.wpiemf-starter[data-id="theorem-card"]' ).click();
	st = await settled( before );
	check( 2 === st.blocks.length && st.last.svg.includes( '>Pythagorean theorem<' ) && 0 === st.last.warnings.length, 'a whole-figure starter loads its blocks' );
	before = await frames();
	await page.evaluate( () => window.__wpiemfProof.open( { card: 'graph', functions: 'f(x) = x', xmin: -2, xmax: 2, text: { title: 'Old group' } } ) );
	st = await settled( before );
	check( 1 === st.blocks.length && 'graph' === st.blocks[ 0 ] && 2 === st.params.v && st.last.svg.includes( '>Old group<' ), '0.1 params open as a one-block figure' );

	// Insert, then edit.
	before = await frames();
	await page.locator( '.wpiemf-starter[data-id="theorem-card"]' ).click();
	st = await settled( before );
	await page.locator( '.wpiemf-insert' ).click();
	await page.waitForTimeout( 1500 );
	const added = await page.evaluate( () => {
		const a = ( window.__dispatched || [] ).filter( ( x ) => 'SET_LAYERS' === x.type ).pop();
		if ( ! a ) {
			return null;
		}
		const group = a.layers.find( ( l ) => l.generator && 'wpie-math-figures/figure' === l.generator.id );
		const kids = group ? a.layers.filter( ( l ) => l.parent === group.id ) : [];
		return { group: !! group, kids: kids.length, paths: kids.filter( ( l ) => l.pathD ).length, texts: kids.filter( ( l ) => 'text' === l.type ).length, v: group && group.generator.params.v, blocks: group ? group.generator.params.blocks.map( ( b ) => b.type ) : [], doc: window.__editor.state.doc.w, minX: Math.min( ...kids.map( ( l ) => l.x ) ), maxX: Math.max( ...kids.map( ( l ) => l.x + l.w ) ), bold: kids.filter( ( l ) => 'text' === l.type && l.weight >= 600 ).length };
	} );
	check( !! added && added.group && added.paths >= 5 && added.texts >= 3, 'insert adds a group of paths and texts (' + ( added && added.kids ) + ' layers)' );
	check( !! added && 2 === added.v && 'formula,text' === added.blocks.join( ',' ), 'the group carries the figure params' );
	check( !! added && added.bold >= 1 && added.bold < added.texts, 'the title is bold, the text is not' );
	check( !! added && added.minX >= 0 && added.maxX <= added.doc + 2, 'inside the document (' + ( added && added.minX ) + '..' + ( added && added.maxX ) + ')' );
	await page.evaluate( () => {
		const group = window.__editor.state.layers.find( ( l ) => l.generator && 'wpie-math-figures/figure' === l.generator.id );
		window.__gen.edit( { editor: window.__editor, layer: group, extras: {} } );
	} );
	await page.waitForFunction( () => window.__wpiemfState && window.__wpiemfState().frames > 0, null, { timeout: 30000 } ).catch( () => {} );
	st = await settled( 0 );
	check( 2 === st.blocks.length && 'Pythagorean theorem' === st.params.head.title && 2 === ( await page.locator( '.wpiemf-block' ).count() ), 'edit reopens with the stored figure' );
} catch ( e ) {
	check( false, 'threw: ' + ( ( e && e.stack ) || e ) );
}
process.exit( await qa.finish() );
