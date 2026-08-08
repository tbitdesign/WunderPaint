/**
 * Shared stage builder + browser launcher for extension dialog QA.
 *
 * Replaces the per-extension copies of "rm/mkdir stage, copy css + bundle
 * + mock, write index.html, launch chromium, wire pageerror" - the parts
 * of every qa-dialog.mjs that were identical. The checks themselves stay
 * in the extension.
 *
 *   import { buildStage, launchQA } from '../../shared/qa-kit/stage.mjs';
 *   const stage = await buildStage( { root } );          // uses tools/preview/setup.js
 *   const qa = await launchQA( stage, { locale } );      // { page, check, shot, ... }
 *   ...checks...
 *   process.exit( await qa.finish() );
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname( fileURLToPath( import.meta.url ) );
export const EDITOR = path.resolve( here, '..', '..', '..' );
const GEN = path.join( EDITOR, 'tools', 'template-generator' );

/**
 * Build the QA stage for an extension.
 *
 * @param {Object} o       Options.
 * @param {string} o.root  Extension root (contains extension.js, style.css).
 * @param {string} [o.setup] Path to the per-extension setup script that
 *                           calls window.__installWpieMock (default
 *                           tools/preview/setup.js under root).
 * @param {string} [o.out]   Stage dir (default <root>/dist/qa-stage).
 * @return {Promise<string>} The stage directory.
 */
export async function buildStage( { root, setup, out } ) {
	const stage = out || path.join( root, 'dist', 'qa-stage' );
	const setupFile = setup || path.join( root, 'tools', 'preview', 'setup.js' );
	fs.rmSync( stage, { recursive: true, force: true } );
	fs.mkdirSync( stage, { recursive: true } );

	const esbuild = (
		await import(
			path.join( GEN, 'node_modules', 'esbuild', 'lib', 'main.js' )
		)
	).default;
	await esbuild.build( {
		entryPoints: [ path.join( here, 'mock-entry.js' ) ],
		bundle: true,
		format: 'iife',
		outfile: path.join( stage, 'mock.js' ),
		logLevel: 'warning',
		alias: {
			'@ed': path.join( EDITOR, 'src' ),
			'@wordpress/i18n': path.join( GEN, 'tools', 'stubs', 'i18n.js' ),
			'@wordpress/hooks': path.join( GEN, 'tools', 'stubs', 'noop.js' ),
			'@wordpress/element': path.join( GEN, 'tools', 'stubs', 'noop.js' ),
		},
		nodePaths: [ path.join( EDITOR, 'node_modules' ) ],
		loader: { '.json': 'json' },
	} );

	fs.copyFileSync(
		path.join( EDITOR, 'build', 'index.css' ),
		path.join( stage, 'editor.css' )
	);
	fs.copyFileSync(
		path.join( root, 'style.css' ),
		path.join( stage, 'style.css' )
	);
	fs.copyFileSync(
		path.join( root, 'extension.js' ),
		path.join( stage, 'extension.js' )
	);
	fs.copyFileSync( setupFile, path.join( stage, 'setup.js' ) );

	fs.writeFileSync(
		path.join( stage, 'index.html' ),
		[
			'<!doctype html>',
			'<html data-theme="dark"><head><meta charset="utf-8">',
			'<link rel="stylesheet" href="editor.css">',
			'<link rel="stylesheet" href="style.css">',
			'<style>html,body{height:100%;margin:0}#wpie-root{position:fixed;inset:0}</style>',
			'</head><body>',
			'<div id="wpie-root" data-theme="dark"></div>',
			'<script src="mock.js"></script>',
			'<script src="setup.js"></script>',
			'<script src="extension.js"></script>',
			'</body></html>',
		].join( '\n' )
	);
	return stage;
}

/**
 * Launch Chromium on a built stage and wire the usual QA plumbing.
 *
 * @param {Object} o            Options.
 * @param {string} o.stage      Stage dir from buildStage().
 * @param {string} [o.locale]   Locale query (default WPIE_LOCALE or de_DE).
 * @param {Object} [o.viewport] Viewport (default 1500x1000).
 * @param {string} [o.shotDir]  Where shot() writes PNGs (default stage/../).
 * @return {Promise<Object>} { browser, page, check, shot, failures, finish }.
 */
export async function launchQA( {
	stage,
	locale = process.env.WPIE_LOCALE || 'de_DE',
	viewport = { width: 1500, height: 1000 },
	shotDir,
	// Extra Chromium flags. The Earth studio ships image ASSETS and the
	// stage runs from file://, where images count as cross-origin and a
	// WebGL upload is refused - it passes --allow-file-access-from-files.
	args = [],
} ) {
	const req = createRequire( path.join( EDITOR, 'node_modules', 'x.js' ) );
	const { chromium } = req( 'playwright' );
	const browser = await chromium.launch( {
		args: [ '--enable-unsafe-swiftshader', '--no-sandbox', ...args ],
	} );
	const page = await browser.newPage( { viewport } );
	let failures = 0;
	page.on( 'pageerror', ( e ) => {
		process.stderr.write( 'PAGEERROR: ' + e.message + '\n' );
		failures++;
	} );
	page.on( 'console', ( m ) => {
		if ( 'error' === m.type() ) {
			process.stderr.write( 'CONSOLE: ' + m.text() + '\n' );
		}
	} );
	await page.goto(
		'file://' + path.join( stage, 'index.html' ) + '?locale=' + locale
	);
	await page.waitForFunction( 'window.__dialogReady === true', {
		timeout: 20000,
	} );

	const outDir = shotDir || path.resolve( stage, '..' );
	return {
		browser,
		page,
		// Information the run should carry but that is not a verdict.
		note: ( msg ) => process.stdout.write( 'info ' + msg + '\n' ),
		check: ( cond, msg ) => {
			process.stdout.write( ( cond ? 'ok   ' : 'FAIL ' ) + msg + '\n' );
			if ( ! cond ) {
				failures++;
			}
		},
		shot: ( name ) =>
			page.screenshot( { path: path.join( outDir, name ) } ),
		failures: () => failures,
		finish: async () => {
			await browser.close();
			return failures ? 1 : 0;
		},
	};
}
