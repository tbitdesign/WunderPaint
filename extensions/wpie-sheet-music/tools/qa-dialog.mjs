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
// The MusicXML converter is fetched from the extension folder; on the
// file:// stage that folder is the stage itself.
fs.mkdirSync( path.join( stage, 'assets' ), { recursive: true } );
fs.copyFileSync( path.join( root, 'assets', 'xml2abc.js' ), path.join( stage, 'assets', 'xml2abc.js' ) );
const qa = await launchQA( { stage, shotDir: path.join( root, 'dist' ) } );
const { page, check } = qa;
const state = () => page.evaluate( () => window.__wpiesmState() );
const settled = async ( before ) => {
	await page.waitForFunction( ( n ) => {
		const s = window.__wpiesmState && window.__wpiesmState();
		return s && s.frames > n && ! s.busy;
	}, before, { timeout: 30000 } ).catch( () => {} );
	return state();
};
const frames = async () => ( await state() ).frames;
const canvasSum = () =>
	page.evaluate( () => {
		const c = document.querySelector( '.wpiesm-canvas' );
		const g = document.createElement( 'canvas' ).getContext( '2d' );
		g.canvas.width = 16;
		g.canvas.height = 16;
		g.drawImage( c, 0, 0, 16, 16 );
		const d = g.getImageData( 0, 0, 16, 16 ).data;
		let dark = 0;
		for ( let i = 0; i < d.length; i += 4 ) {
			if ( d[ i ] + d[ i + 1 ] + d[ i + 2 ] < 600 ) {
				dark++;
			}
		}
		return dark;
	} );
const SCORE_XML = '<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><work><work-title>Test Title</work-title></work><identification><creator type="composer">Test Composer</creator></identification><part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type><lyric number="1"><syllabic>single</syllabic><text>La</text></lyric></note><note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note><note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><type>half</type></note></measure></part></score-partwise>';

try {
	await page.waitForFunction( () => window.__wpiesmState && window.__wpiesmState().frames > 0 && ! window.__wpiesmState().busy, null, { timeout: 30000 } );
	await page.waitForTimeout( 400 );
	check( 1 === ( await page.locator( '.wpiesm-body' ).count() ), 'dialog mounts' );
	check( await page.evaluate( () => !! document.querySelector( '.dsm-badge svg path[fill="#3b66ff"]' ) ), 'header shows the brand mark' );
	check( 7 === ( await page.locator( '.wpiesm-card' ).count() ), 'seven sheet-type cards' );
	const tile = await page.locator( '.wpiesm-card' ).first().boundingBox();
	check( !! tile && tile.width > 200 && ( await page.locator( '.wpiesm-card small' ).count() ) === 7, 'cards fill the column and carry their hint (' + ( tile && tile.width.toFixed( 1 ) ) + ')' );
	check( 1 === ( await page.locator( '.wpiesm-left .dsm-card-head' ).first().count() ), 'the sheet types sit in a section' );
	// The dialog keeps ONE size while the cards change (Thomas 04.09.:
	// every tile click made the modal taller or shorter).
	const dialogHeight = async () => ( await page.locator( '.wpiesm-dialog' ).boundingBox() ).height;
	const heights = { score: await dialogHeight() };
	let st = await state();
	check( 'score' === st.card && 'ode-to-joy' === st.starter, 'opens on the Ode to Joy starter' );
	check( !! st.last && st.last.width === 1600 && st.last.height > 200 && 0 === st.last.warnings.length, 'the score renders without warnings (' + ( st.last && st.last.width + 'x' + st.last.height ) + ')' );
	check( ( await canvasSum() ) > 3, 'the paper shows ink' );
	check( /1600/.test( st.status ), 'the status names the size' );
	await qa.shot( 'sheet-music-dialog.png' );

	// Chord sheet.
	let before = await frames();
	await page.locator( '.wpiesm-card[data-card="leadsheet"]' ).click();
	st = await settled( before );
	heights.leadsheet = await dialogHeight();
	check( 'leadsheet' === st.card && /\{title/.test( st.params.chordpro ), 'the Chord Sheet tile loads its first starter' );
	check( st.last && st.last.svg.includes( '>G7<' ) && 0 === st.last.warnings.length, 'chords are drawn as text' );
	before = await frames();
	await page.locator( '.wpiesm-text' ).fill( '{title: Test}\n[C]Hello [G]world' );
	st = await settled( before );
	check( st.last && st.last.svg.includes( '>C<' ) && st.last.svg.includes( '>G<' ) && null === st.starter, 'typing re-renders with the new chords' );

	// Diagrams.
	before = await frames();
	await page.locator( '.wpiesm-card[data-card="diagrams"]' ).click();
	st = await settled( before );
	heights.diagrams = await dialogHeight();
	check( 'diagrams' === st.card && ( st.last.svg.match( /<circle/g ) || [] ).length >= 12, 'chord diagrams render' );
	before = await frames();
	await page.locator( '.wpiesm-material .wpiesm-input' ).fill( 'C G Am F' );
	st = await settled( before );
	check( [ '>C<', '>G<', '>Am<', '>F<' ].every( ( n ) => st.last.svg.includes( n ) ) && 0 === st.last.warnings.length, 'four diagrams for C G Am F' );
	before = await frames();
	await page.locator( '.wpiesm-material .wpiesm-input' ).fill( 'C Xyz' );
	st = await settled( before );
	check( st.last.warnings.length === 1 && /Xyz/.test( st.status ), 'an unknown chord lands in the status' );

	// Fretboard.
	before = await frames();
	await page.locator( '.wpiesm-card[data-card="fretboard"]' ).click();
	st = await settled( before );
	check( 'fretboard' === st.card && ( st.last.svg.match( /<circle/g ) || [] ).length >= 10 && /pentaton/i.test( st.last.svg ), 'the fretboard map renders (' + ( st.last.svg.match( /<circle/g ) || [] ).length + ' circles) ' + st.status );

	heights.fretboard = await dialogHeight();

	// 0.2: manuscript paper, note cards, scale sheets.
	before = await frames();
	await page.locator( '.wpiesm-card[data-card="paper"]' ).click();
	st = await settled( before );
	check( 'paper' === st.card && 'paper-treble' === st.starter && 0 === st.last.warnings.length && st.last.height > 1500, 'manuscript paper renders ten staves on a page (' + st.status + ')' );
	heights.paper = await dialogHeight();
	before = await frames();
	await page.locator( '.wpiesm-card[data-card="flash"]' ).click();
	st = await settled( before );
	check( 'flash' === st.card && 0 === st.last.warnings.length && ( st.last.svg.match( /stroke-dasharray/g ) || [] ).length >= 9, 'nine note cards with cut lines (' + st.status + ')' );
	before = await frames();
	await page.locator( '.wpiesm-starter[data-id="flash-german"]' ).click();
	st = await settled( before );
	check( 'back' === st.params.flash.side && st.last.svg.includes( '>H<' ) && ! st.last.svg.includes( '>B<' ), 'the backs say H for B in German' );
	heights.flash = await dialogHeight();
	before = await frames();
	await page.locator( '.wpiesm-card[data-card="scales"]' ).click();
	st = await settled( before );
	check( 'scales' === st.card && 0 === st.last.warnings.length && st.last.svg.includes( '>1<' ) && st.last.svg.includes( '>5<' ), 'the C major scale carries its fingering (' + st.status + ')' );
	before = await frames();
	await page.locator( '.wpiesm-starter[data-id="scale-majors"]' ).click();
	st = await settled( before );
	check( 'majors' === st.params.scales.mode && 0 === st.last.warnings.length && st.last.height > 1200, 'the twelve majors stack on one sheet (' + st.last.height + ')' );
	heights.scales = await dialogHeight();

	const hs = Object.values( heights );
	check( hs.every( ( h ) => Math.abs( h - hs[ 0 ] ) < 1 ), 'the dialog keeps its height across the cards (' + Object.entries( heights ).map( ( [ k, v ] ) => k + ' ' + Math.round( v ) ).join( ', ' ) + ')' );

	// Side rows follow the card.
	const hiddenCount = await page.evaluate( () => [ ...document.querySelectorAll( '.wpiesm-side .wpiesm-row' ) ].filter( ( r ) => r.hidden ).length );
	check( hiddenCount > 4, 'rows of other cards are hidden (' + hiddenCount + ')' );

	// MusicXML import through xml2abc.
	before = await frames();
	await page.evaluate( ( xml ) => window.__wpiesmProof.importFile( new File( [ xml ], 'test.musicxml', { type: 'application/xml' } ) ), SCORE_XML );
	st = await settled( before );
	check( 'score' === st.card && /^X:1/m.test( st.params.abc ) && ! /Ode to Joy/.test( st.params.abc ), 'MusicXML becomes ABC in the textarea: ' + st.params.abc.split( '\n' ).slice( -2 ).join( ' ' ) + ' | status: ' + st.status );
	check( st.last && 0 === st.last.warnings.length, 'the imported score renders' );
	const abcImported = st.params.abc;

	// Insert as a vector group (the state hook is gone once the dialog
	// closes, so the sheet's SVG travels in from here).
	const sheetSvg = st.last.svg;
	await page.locator( '.wpiesm-insert' ).click();
	await page.waitForTimeout( 1500 );
	const added = await page.evaluate( ( sheet ) => {
		const a = ( window.__dispatched || [] ).filter( ( x ) => 'SET_LAYERS' === x.type ).pop();
		if ( ! a ) {
			return null;
		}
		const group = a.layers.find( ( l ) => l.generator && 'wpie-sheet-music/sheet' === l.generator.id );
		const kids = group ? a.layers.filter( ( l ) => l.parent === group.id ) : [];
		const title = kids.find( ( l ) => 'text' === l.type && /Test Title/.test( l.text ) );
		const texts = kids.filter( ( l ) => 'text' === l.type );
		const maxRight = Math.max( ...texts.map( ( l ) => l.x + ( l.text.length * l.fontSize * 0.55 ) ) );
		const minLeft = Math.min( ...texts.map( ( l ) => l.x ) );
		// Weight and slant travel through the importer (core 04.09.): the
		// sheet's bold texts are the ONLY bold layers, everything else is
		// regular - before the fix makeText's default made every text bold.
		const boldInSvg = ( sheet.match( /font-weight="(bold|[6-9]00)"/g ) || [] ).length;
		const boldLayers = texts.filter( ( l ) => l.weight >= 600 ).length;
		const italicInSvg = ( sheet.match( /font-style="italic"/g ) || [] ).length;
		const italicLayers = texts.filter( ( l ) => l.italic ).length;
		return { group: !! group, kids: kids.length, weights: { boldInSvg, boldLayers, italicInSvg, italicLayers, texts: texts.length, list: texts.map( ( l ) => l.text + ':' + l.weight + ( l.italic ? ':i' : '' ) ) }, types: [ ...new Set( kids.map( ( l ) => l.type + ( l.pathD ? ':path' : '' ) ) ) ], abc: group && group.generator.params.abc, card: group && group.generator.params.card, title: title ? { x: title.x, fontSize: title.fontSize } : null, minLeft, maxRight, doc: window.__editor.state.doc.w };
	}, sheetSvg );
	check( !! added && added.group && added.kids > 5, 'insert adds a group with the layers (' + ( added && added.kids ) + ')' );
	check( !! added && added.types.some( ( x ) => x.startsWith( 'text' ) ) && added.types.some( ( x ) => x.endsWith( ':path' ) ), 'text stays text, notes become paths (' + ( added && added.types.join( ',' ) ) + ')' );
	check( !! added && added.abc === abcImported, 'the group carries the params' );
	// The test score carries a bold title, an italic composer and a regular
	// lyric, so all three weights are on the sheet and must come back as such.
	check( !! added && added.weights.boldLayers === added.weights.boldInSvg && added.weights.italicLayers === added.weights.italicInSvg && added.weights.italicLayers >= 1 && added.weights.boldLayers + added.weights.italicLayers < added.weights.texts, 'bold and italic follow the sheet, regular text stays regular (' + ( added && JSON.stringify( added.weights ) ) + ')' );
	// The imported title was centred in the SVG; the importer reads x as
	// the left edge, so it must have been moved left of the centre.
	check( !! added && added.title && added.title.x < added.doc / 2 - 40 && added.title.x > added.doc * 0.2, 'centred texts keep their place (title x ' + ( added && added.title && added.title.x ) + ' of ' + ( added && added.doc ) + ')' );
	check( !! added && added.minLeft >= 0 && added.maxRight <= added.doc + 2, 'no text runs past the document (' + ( added && Math.round( added.minLeft ) ) + '..' + ( added && Math.round( added.maxRight ) ) + ')' );

	// Reopen the group: the dialog shows the same material.
	await page.evaluate( () => {
		const group = window.__editor.state.layers.find( ( l ) => l.generator && 'wpie-sheet-music/sheet' === l.generator.id );
		window.__gen.edit( { editor: window.__editor, layer: group, extras: {} } );
	} );
	await page.waitForFunction( () => window.__wpiesmState && window.__wpiesmState().frames > 0, null, { timeout: 20000 } ).catch( () => {} );
	st = await settled( 0 );
	check( st.params.abc === abcImported && st.card === added.card, 'edit reopens with the stored ABC (card ' + st.card + ', ' + ( st.params.abc || '' ).slice( 0, 30 ).replace( /\n/g, ' ' ) + ' | ' + st.status + ')' );
	check( 1 === ( await page.locator( '.wpiesm-insert' ).count() ), 'the footer has one action button' );
} catch ( e ) {
	check( false, 'threw: ' + ( ( e && e.stack ) || e ) );
}
process.exit( await qa.finish() );
