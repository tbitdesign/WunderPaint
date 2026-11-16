/**
 * Dialog QA for Puzzle Sheets.
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

await baseline( qa, {
	insert: true,
	settle: 700,
	allowInert: 0,
} );
await qa.shot( 'qa-dialog.png' );

/* ------------------------------ v2.6 checks ------------------------------ */

const { page, check } = qa;
const reopen = async () => {
	await page.evaluate( () => {
		window.__gen.run( {
			editor: window.__editor,
			extras: { toasts: { error: () => {}, success: () => {} } },
			layer: null,
		} );
	} );
	await page.waitForSelector( '.wpiepzl-dialog' );
	await page.waitForTimeout( 700 );
};
if ( ! ( await page.$( '.wpiepzl-dialog' ) ) ) {
	await reopen();
}
// The preview as a number, and its shape.
const sig = () =>
	page.evaluate( () => {
		const c = document.querySelector( '.wpiepzl-view canvas' );
		const d = c.getContext( '2d' ).getImageData( 0, 0, c.width, c.height )
			.data;
		let h = 7;
		for ( let i = 0; i < d.length; i += 40 ) {
			h = ( h * 31 + d[ i ] ) >>> 0;
		}
		return { h, w: c.width, ht: c.height, ratio: c.height / c.width };
	} );
const pickMode = async ( id ) => {
	await page.click( `.wpiepzl-tcard[data-mode="${ id }"]` );
	await page.waitForTimeout( 500 );
};
const setField = ( sel, value ) =>
	page.evaluate(
		( [ s, v ] ) => {
			const el = [ ...document.querySelectorAll( s ) ].find(
				( x ) => x.offsetParent
			);
			el.value = v;
			el.dispatchEvent(
				new Event( 'SELECT' === el.tagName ? 'change' : 'input', {
					bubbles: true,
				} )
			);
			return !! el;
		},
		[ sel, value ]
	);
// The warning line sits under the mode cards (the source section has a
// note with the same class, and it comes first in the column).
const warnText = () =>
	page.evaluate( () => {
		const n = [ ...document.querySelectorAll( '.wpiepzl-info' ) ].find(
			( x ) =>
				x.previousElementSibling &&
				x.previousElementSibling.classList.contains( 'wpiepzl-cards' )
		);
		return n ? n.textContent : 'no warning line';
	} );
const inputByLabel = ( text ) =>
	page.evaluate( ( t ) => {
		const row = [
			...document.querySelectorAll( '.wpiepzl-dialog label' ),
		].find( ( l ) => l.offsetParent && l.textContent.startsWith( t ) );
		const el = row && row.querySelector( 'input, textarea, select' );
		if ( el ) {
			el.dataset.qa = t;
		}
		return !! el;
	}, text );

check(
	!! ( await page.$( '.wpiepzl-tcard[data-mode="picsudoku"]' ) ) &&
		!! ( await page.$( '.wpiepzl-tcard[data-mode="piccross"]' ) ),
	'picture sudoku and picture crossword have their cards'
);

// Word search: the hidden message and the shape reach the sheet.
await pickMode( 'wordsearch' );
const wsPlain = await sig();
check( await inputByLabel( 'Lösungssatz' ), 'the word search offers a hidden message' );
await setField( '[data-qa="Lösungssatz"]', 'Viel Spaß beim Suchen' );
await page.waitForTimeout( 500 );
const wsMsg = await sig();
check( wsMsg.h !== wsPlain.h, 'the hidden message changes the sheet' );
check(
	! /zu lang/.test( await warnText() ),
	`and fits (${ await warnText() })`
);
check( await inputByLabel( 'Form' ), 'the word search offers shapes' );
await setField( '[data-qa="Form"]', 'heart' );
await page.waitForTimeout( 500 );
check( ( await sig() ).h !== wsMsg.h, 'a heart-shaped word search differs' );
await setField( '[data-qa="Form"]', 'square' );
await setField( '[data-qa="Lösungssatz"]', '' );

// Crossword: the solution word adds its boxes.
await pickMode( 'crossword' );
const cwPlain = await sig();
check( await inputByLabel( 'Lösungswort' ), 'the crossword offers a solution word' );
await setField( '[data-qa="Lösungswort"]', 'HOME' );
await page.waitForTimeout( 500 );
const cwWord = await sig();
check(
	cwWord.ratio > cwPlain.ratio,
	`the solution word adds a row of boxes (${ cwPlain.ratio.toFixed(
		3
	) } -> ${ cwWord.ratio.toFixed( 3 ) })`
);
await setField( '[data-qa="Lösungswort"]', 'QXZ' );
await page.waitForTimeout( 400 );
check(
	/QXZ|Q, X, Z/.test( await warnText() ),
	`a word the grid cannot spell is named (${ await warnText() })`
);
await setField( '[data-qa="Lösungswort"]', '' );

// Picture puzzles render and can be inserted.
for ( const id of [ 'picsudoku', 'piccross' ] ) {
	await pickMode( id );
	const s = await sig();
	check( s.w > 50 && s.ht > 50, `${ id } renders a sheet (${ s.w }x${ s.ht })` );
}

// Worksheet: the head adds height, four sudokus share one page.
await pickMode( 'sudoku' );
const sudPlain = await sig();
await page.evaluate( () => {
	const row = [ ...document.querySelectorAll( '.wpiepzl-dialog label' ) ].find(
		( l ) => l.offsetParent && /Name, Klasse/.test( l.textContent )
	);
	row.querySelector( 'input' ).click();
} );
await page.waitForTimeout( 500 );
const sudHead = await sig();
check(
	sudHead.ratio > sudPlain.ratio,
	`the name line adds a head (${ sudPlain.ratio.toFixed( 3 ) } -> ${ sudHead.ratio.toFixed( 3 ) })`
);
check( await inputByLabel( 'Rätsel pro Seite' ), 'sudoku offers several per page' );
await setField( '[data-qa="Rätsel pro Seite"]', '4' );
await page.waitForTimeout( 800 );
check( ( await sig() ).h !== sudHead.h, 'four sudokus make a different page' );
await page.evaluate( () => {
	window.__dispatched.length = 0;
	const btns = [ ...document.querySelectorAll( '.dsm-foot button' ) ];
	btns[ btns.length - 1 ].click();
} );
await page.waitForTimeout( 1200 );
const added = await page.evaluate( () =>
	window.__dispatched
		.filter( ( a ) => 'ADD_LAYER' === a.type )
		.map( ( a ) => a.layer.naturalW )
);
check(
	2 === added.length && 1240 === added[ 0 ],
	`the worksheet and its solution arrive as two page-wide layers (${ JSON.stringify(
		added
	) })`
);

/* ------------------------------ v2.7 checks ------------------------------ */

await reopen();
// The source section lives in the right-hand panel now.
await pickMode( 'jigsaw' );
const srcSide = await page.evaluate( () => {
	const sel = [ ...document.querySelectorAll( '.wpiepzl-dialog select' ) ].find(
		( s ) => [ ...s.options ].some( ( o ) => 'media' === o.value )
	);
	return {
		side: !! ( sel && sel.closest( '.wpiepzl-side' ) ),
		library: !! ( sel && sel.closest( '.wpiepzl-library' ) ),
		visible: !! ( sel && sel.offsetParent ),
	};
} );
check(
	srcSide.side && ! srcSide.library && srcSide.visible,
	`the source section sits in the right panel (${ JSON.stringify( srcSide ) })`
);
for ( const id of [ 'circlemaze', 'arith', 'clock' ] ) {
	check(
		!! ( await page.$( `.wpiepzl-tcard[data-mode="${ id }"]` ) ),
		`${ id } has its card`
	);
	await pickMode( id );
	const s = await sig();
	check( s.w > 50 && s.ht > 50, `${ id } renders a sheet (${ s.w }x${ s.ht })` );
}
// Arithmetic: written columns change the sheet; times tables hide them.
await pickMode( 'arith' );
const arRows = await sig();
check( await inputByLabel( 'Anordnung' ), 'sums offer written columns' );
await setField( '[data-qa="Anordnung"]', 'columns' );
await page.waitForTimeout( 500 );
check( ( await sig() ).h !== arRows.h, 'written columns make a different sheet' );
check( await inputByLabel( 'Aufgaben' ), 'the drill offers its operations' );
await setField( '[data-qa="Aufgaben"]', 'mul' );
await page.waitForTimeout( 400 );
check(
	! ( await inputByLabel( 'Anordnung' ) ),
	'times tables do not offer written columns'
);
// Clocks: drawing the hands differs from reading them.
await pickMode( 'clock' );
const clRead = await sig();
check( await inputByLabel( 'Aufgabe' ), 'the clock sheet offers its task' );
await setField( '[data-qa="Aufgabe"]', 'draw' );
await page.waitForTimeout( 500 );
check( ( await sig() ).h !== clRead.h, 'drawing the hands is a different sheet' );
// 2.8: missing letters, magic squares and the new game sheets.
await pickMode( 'missing' );
const missSig = await sig();
check( missSig.w > 100, 'missing letters draw a sheet' );
check(
	await inputByLabel( 'Ausgelassene Buchstaben' ),
	'missing letters offer how much to leave out'
);
await setField( '[data-qa="Ausgelassene Buchstaben"]', '70' );
await page.waitForTimeout( 600 );
check( ( await sig() ).h !== missSig.h, 'leaving out more letters changes the sheet' );
await pickMode( 'magic' );
const magicSig = await sig();
check( await inputByLabel( 'Zahlen' ), 'magic squares offer number ranges' );
await setField( '[data-qa="Zahlen"]', 'tens' );
await page.waitForTimeout( 600 );
check( ( await sig() ).h !== magicSig.h, 'the number range changes the squares' );
await pickMode( 'games' );
check( await inputByLabel( 'Spiel' ), 'the game sheets offer a game' );
const gameSigs = [];
for ( const game of [ 'hangman', 'tictactoe', 'codebreaker' ] ) {
	await setField( '[data-qa="Spiel"]', game );
	await page.waitForTimeout( 600 );
	gameSigs.push( ( await sig() ).h );
}
check(
	3 === new Set( gameSigs ).size,
	'hangman, tic-tac-toe and the code breaker are three different sheets'
);
// A series of three circle mazes: three sheets and one shared solution.
await pickMode( 'circlemaze' );
check( await inputByLabel( 'Versionen' ), 'the circle maze offers versions' );
await setField( '[data-qa="Versionen"]', '3' );
await page.waitForTimeout( 900 );
await page.evaluate( () => {
	window.__dispatched.length = 0;
	const btns = [ ...document.querySelectorAll( '.dsm-foot button' ) ];
	btns[ btns.length - 1 ].click();
} );
await page.waitForTimeout( 1500 );
const series = await page.evaluate( () =>
	window.__dispatched
		.filter( ( a ) => 'ADD_LAYER' === a.type )
		.map( ( a ) => a.layer.name )
);
check(
	4 === series.length &&
		series.filter( ( n ) => /Kreis-Labyrinth [ABC]$/.test( n ) ).length === 3 &&
		series.some( ( n ) => /^Lösungen A-C$/.test( n ) ),
	`three versions and one shared solution sheet arrive (${ JSON.stringify(
		series
	) })`
);
const sources = await page.evaluate( () =>
	window.__dispatched
		.filter( ( a ) => 'ADD_LAYER' === a.type )
		.slice( 0, 3 )
		.map( ( a ) => a.layer.src.length )
);
check(
	3 === new Set( sources ).size,
	'and the three versions are three different mazes'
);

process.exit( await qa.finish() );
