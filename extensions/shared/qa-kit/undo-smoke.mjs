/**
 * Mechanical smoke test for Ctrl+Z in the studios (shared/studio-undo.js):
 * real bundle, real keys, numbers only. For each studio: move a slider,
 * press Ctrl+Z, the slider is back and the studio still open; Ctrl+Shift+Z
 * brings the move back. It judges nothing about looks. One browser at a
 * time; build first.
 *
 *   node shared/qa-kit/undo-smoke.mjs wpie-solar-system-studio [...]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildStage, launchQA } from './stage.mjs';

const here = path.dirname( fileURLToPath( import.meta.url ) );
const extDir = path.resolve( here, '..', '..' );
if (
	execFileSync( 'ps', [ '-eo', 'comm=' ], { encoding: 'utf8' } )
		.split( '\n' )
		.some( ( n ) => /^\s*(chrome|chromium)/.test( n ) )
) {
	throw new Error( 'Another browser is running.' );
}

let failed = 0;
const results = [];
for ( const slug of process.argv.slice( 2 ) ) {
	const root = path.join( extDir, slug );
	const out = fs.mkdtempSync( path.join( os.tmpdir(), 'wpie-undo-' ) );
	let qa = null,
		verdict = 'FAIL',
		info = '';
	try {
		const stage = await buildStage( { root, out: path.join( out, 'stage' ) } );
		for ( const dir of [ 'assets', 'textures', 'thumbs', 'models' ] ) {
			if ( fs.existsSync( path.join( root, dir ) ) ) {
				fs.cpSync( path.join( root, dir ), path.join( stage, dir ), {
					recursive: true,
				} );
			}
		}
		qa = await launchQA( {
			stage,
			locale: 'en_US',
			shotDir: out,
			args: [ '--allow-file-access-from-files' ],
		} );
		const { page } = qa;
		page.setDefaultTimeout( 15000 );
		await page.waitForTimeout( 1500 );
		// Candidate sliders: visible ranges in the studio's own box.
		const count = await page.evaluate( () => {
			const box = [ ...document.querySelectorAll( '.modal-backdrop > .dsm' ) ].pop();
			const visible = ( sel ) =>
				box
					? [ ...box.querySelectorAll( sel ) ].filter(
							( n ) => n.offsetParent && ! n.disabled
					  )
					: [];
			// Sliders first; selects when no slider is a setting (a fold
			// progress or a zoom is the view, not a step).
			const ranges = visible( 'input[type=range]' ),
				selects = visible( 'select' );
			ranges.forEach( ( n, i ) => ( n.__undoPlace = i ) );
			selects.forEach( ( n, i ) => ( n.__undoPlace = i ) );
			window.__undoRanges = [
				...ranges.slice( 0, 4 ),
				...selects.filter( ( n ) => n.options.length > 1 ).slice( 0, 3 ),
			];
			return window.__undoRanges.length;
		} );
		if ( ! count ) {
			throw new Error( 'no slider found' );
		}
		let done = false;
		for ( let i = 0; i < count && ! done; i++ ) {
			// Press, move to the far end, release: one user gesture.
			const moved = await page.evaluate( ( i ) => {
				const n = window.__undoRanges[ i ];
				if ( ! n.isConnected ) return null;
				const before = n.value;
				const fire = ( type, Ctor = Event ) =>
					n.dispatchEvent( new Ctor( type, { bubbles: true } ) );
				fire( 'pointerdown', PointerEvent );
				if ( 'SELECT' === n.tagName ) {
					n.selectedIndex = ( n.selectedIndex + 1 ) % n.options.length;
				} else {
					n.value = String( +n.value === +n.max ? n.min : n.max );
				}
				fire( 'input' );
				fire( 'change' );
				fire( 'pointerup', PointerEvent );
				n.focus();
				return { before, after: n.value, label: n.closest( '[class*=row]' )?.textContent?.trim().slice( 0, 40 ) || '' };
			}, i );
			if ( ! moved || moved.before === moved.after ) continue;
			await page.waitForTimeout( 700 );
			await page.keyboard.press( 'Control+z' );
			await page.waitForTimeout( 700 );
			const back = await page.evaluate( ( i ) => {
				const box = [ ...document.querySelectorAll( '.modal-backdrop > .dsm' ) ].pop();
				// The panel may have been rebuilt: the same slider by place.
				// The panel may have been rebuilt: the same control by place.
				const was = window.__undoRanges[ i ];
				const kind = 'SELECT' === was.tagName ? 'select' : 'input[type=range]';
				const now = box ? [ ...box.querySelectorAll( kind ) ].filter( ( n ) => n.offsetParent ) : [];
				const n = was.isConnected ? was : now[ was.__undoPlace ];
				return { open: !! box, value: n ? n.value : null };
			}, i );
			if ( back.value !== moved.before ) {
				info += ' slider ' + i + ' (' + moved.label + ') stayed ' + back.value + ';';
				continue;
			}
			await page.keyboard.press( 'Control+Shift+z' );
			await page.waitForTimeout( 700 );
			const fwd = await page.evaluate( ( i ) => {
				const box = [ ...document.querySelectorAll( '.modal-backdrop > .dsm' ) ].pop();
				// The panel may have been rebuilt: the same control by place.
				const was = window.__undoRanges[ i ];
				const kind = 'SELECT' === was.tagName ? 'select' : 'input[type=range]';
				const now = box ? [ ...box.querySelectorAll( kind ) ].filter( ( n ) => n.offsetParent ) : [];
				const n = was.isConnected ? was : now[ was.__undoPlace ];
				return { open: !! box, value: n ? n.value : null };
			}, i );
			done = true;
			const ok = back.open && fwd.open && fwd.value === moved.after && ! qa.failures();
			verdict = ok ? 'ok' : 'FAIL';
			info += ' "' + moved.label + '" ' + moved.before + ' -> ' + moved.after + ', undo ' + back.value + ', redo ' + fwd.value + ( qa.failures() ? ', page errors' : '' );
		}
		if ( ! done ) {
			info += ' no slider went back';
		}
	} catch ( e ) {
		info += ' ' + e.message;
	} finally {
		await qa?.browser.close();
		fs.rmSync( out, { recursive: true, force: true } );
	}
	if ( 'ok' !== verdict ) failed++;
	results.push( verdict.padEnd( 5 ) + slug + ' ' + info.trim() );
	console.log( results.at( -1 ) );
}
console.log( '\n' + ( results.length - failed ) + '/' + results.length + ' studios passed' );
process.exit( failed ? 1 : 0 );
