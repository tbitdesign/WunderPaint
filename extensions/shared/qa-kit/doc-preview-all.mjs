/**
 * "Show document" QA for every studio, in both cases:
 *
 *   node extensions/shared/qa-kit/doc-preview-all.mjs           all studios
 *   node extensions/shared/qa-kit/doc-preview-all.mjs solar mockup
 *
 * Runs doc-preview-qa.mjs once for an EDITED layer and once for a NEW one
 * (`new`: the editor inserts above the selected background, so the box
 * above must still be in front). One run after the other, never two
 * browsers at once, each with its own time limit. Exits non-zero when any
 * run failed and prints the failed runs' check lines at the end.
 *
 * Why it exists (20.10.2026): Solar's preview dropped the layers above a
 * NEW image. doc-preview-qa.mjs had the `new` case all along, but it was
 * only ever run for the editing case, so the regression shipped. One
 * command for all of it is what makes the second case actually run.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname( fileURLToPath( import.meta.url ) );
const qa = path.join( here, 'doc-preview-qa.mjs' );

// The keys doc-preview-qa.mjs knows (mockup, solar and its GENERIC table).
const ALL = [
	'mockup',
	'solar',
	'earth',
	'effects',
	'gallery',
	'objects',
	'pose',
	'text',
	'city',
	'molecule',
	'marbling',
	'dayring',
	'synth',
	'particles',
	'strokes',
	'typeflow',
	'math',
	'sheet',
	'party',
];
const keys = process.argv.slice( 2 ).length ? process.argv.slice( 2 ) : ALL;
const unknown = keys.filter( ( k ) => ! ALL.includes( k ) );
if ( unknown.length ) {
	console.error( 'unknown studio key: ' + unknown.join( ', ' ) );
	process.exit( 2 );
}

const results = [];
for ( const key of keys ) {
	for ( const mode of [ 'edit', 'new' ] ) {
		const args = [ qa, key ].concat( 'new' === mode ? [ 'new' ] : [] );
		const started = Date.now();
		const run = spawnSync( process.execPath, args, {
			encoding: 'utf8',
			timeout: 240000,
			maxBuffer: 32 * 1024 * 1024,
		} );
		const out = ( run.stdout || '' ) + ( run.stderr || '' );
		const checks = out
			.split( '\n' )
			.filter( ( line ) => /^(ok|FAIL|fail)\b/.test( line.trim() ) );
		const timedOut = run.error && 'ETIMEDOUT' === run.error.code;
		const ok = 0 === run.status && ! timedOut && checks.length > 0;
		const why = timedOut
			? 'timeout'
			: run.status !== 0 && ! checks.some( ( l ) => /^FAIL/i.test( l.trim() ) )
				? ( out.match( /\w*Error: [^\n]*|[^\n]*Timeout \d+ms exceeded[^\n]*/ ) || [ 'exit ' + run.status ] )[ 0 ].trim()
				: '';
		results.push( { key, mode, ok, checks, why } );
		const secs = Math.round( ( Date.now() - started ) / 1000 );
		console.log(
			( ok ? 'ok  ' : 'FAIL' ) +
				' ' +
				( key + ' ' + mode ).padEnd( 16 ) +
				String( secs ).padStart( 4 ) +
				' s' +
				( why ? '  ' + why.slice( 0, 160 ) : '' )
		);
	}
}

const failed = results.filter( ( r ) => ! r.ok );
console.log(
	'\n' + ( results.length - failed.length ) + ' of ' + results.length + ' runs green'
);
for ( const r of failed ) {
	console.log( '\n--- ' + r.key + ' ' + r.mode + ( r.why ? ' (' + r.why.slice( 0, 160 ) + ')' : '' ) );
	r.checks.forEach( ( line ) => console.log( '  ' + line.trim() ) );
}
process.exit( failed.length ? 1 : 0 );
