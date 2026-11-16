import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const dir = mkdtempSync( join( tmpdir(), 'wpie-smart-edit-' ) );
try {
	const output = join( dir, 'engine.test.mjs' );
	await build( {
		entryPoints: [ 'tests/engine.test.mjs' ],
		outfile: output,
		bundle: true,
		platform: 'node',
		format: 'esm',
		logLevel: 'silent',
	} );
	await build( {
		entryPoints: [ '../../src/lib/ext-ui.js' ],
		outfile: join( dir, 'ui.js' ),
		bundle: true,
		format: 'iife',
		globalName: 'WPIE_TEST_UI',
		logLevel: 'silent',
	} );
	await build( {
		entryPoints: [ 'src/main.js' ],
		outfile: join( dir, 'extension.js' ),
		bundle: true,
		format: 'iife',
		logLevel: 'silent',
	} );
	const result = spawnSync(
		process.execPath,
		[
			'--test',
			'--test-concurrency=1',
			output,
			resolve( 'tests/dialog.test.mjs' ),
		],
		{
			stdio: 'inherit',
			env: { ...process.env, WPIE_SMART_EDIT_TEST_BUILD: dir },
		}
	);
	process.exitCode = result.status ?? 1;
} finally {
	rmSync( dir, { recursive: true, force: true } );
}
