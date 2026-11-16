// Songs into analyses, the way the dialog reads them: ONE headless
// Chromium decodes each file through extensions/shared/audio/decode.js and
// reads it through song.js, and the analysis is written as JSON next to
// the output for tools/proof-music.mjs. Nothing is uploaded anywhere; the
// files are served from a local port for the browser's own decoder.
//
// Usage: node tools/song-json.mjs <out-dir> <audio file> [<audio file> ...]
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = path.dirname( fileURLToPath( import.meta.url ) );
const ext = path.resolve( here, '..' );
const plugin = path.resolve( ext, '..', '..' );
const outDir = path.resolve(
	process.argv[ 2 ] || path.join( ext, 'dist', 'songs' )
);
const files = process.argv.slice( 3 ).map( ( f ) => path.resolve( f ) );
if ( ! files.length ) {
	console.error(
		'Usage: node tools/song-json.mjs <out-dir> <audio file> ...'
	);
	process.exit( 1 );
}
fs.mkdirSync( outDir, { recursive: true } );
const req = createRequire( path.join( plugin, 'node_modules', 'x.js' ) );
const { chromium } = req( 'playwright' );

const shared = path.resolve( ext, '..', 'shared', 'audio' );
const entry = path.join( outDir, 'song-entry.js' );
fs.writeFileSync(
	entry,
	`import { decodeSong } from ${ JSON.stringify(
		path.join( shared, 'decode.js' )
	) };
import { analyzeSongAsync } from ${ JSON.stringify(
		path.join( shared, 'song.js' )
	) };
window.__music = { decodeSong, analyzeSongAsync };`
);
await build( {
	entryPoints: [ entry ],
	bundle: true,
	format: 'iife',
	outfile: path.join( outDir, 'song-bundle.js' ),
	logLevel: 'error',
} );
fs.writeFileSync(
	path.join( outDir, 'song.html' ),
	'<!doctype html><meta charset="utf-8"><script src="song-bundle.js"></script>'
);

// The audio files and the page, from one local port.
const served = new Map(
	files.map( ( f, i ) => [ `/song-${ i }${ path.extname( f ) }`, f ] )
);
const server = http.createServer( ( rq, rs ) => {
	const url = decodeURIComponent( rq.url.split( '?' )[ 0 ] );
	const file = served.get( url ) || path.join( outDir, path.basename( url ) );
	if ( ! fs.existsSync( file ) ) {
		rs.writeHead( 404 );
		rs.end();
		return;
	}
	rs.writeHead( 200 );
	fs.createReadStream( file ).pipe( rs );
} );
await new Promise( ( r ) => server.listen( 0, '127.0.0.1', r ) );
const port = server.address().port;
const browser = await chromium.launch( { headless: true } );
try {
	const page = await browser.newPage();
	const errors = [];
	page.on( 'pageerror', ( e ) => errors.push( String( e ) ) );
	await page.goto( `http://127.0.0.1:${ port }/song.html` );
	for ( const [ url, file ] of served ) {
		const song = await page.evaluate( async ( u ) => {
			const d = await window.__music.decodeSong( u, { maxSeconds: 600 } );
			const s = await window.__music.analyzeSongAsync(
				d.samples,
				d.sampleRate
			);
			const arr = ( x ) =>
				Array.from( x, ( v ) => Math.round( v * 1e4 ) / 1e4 );
			return {
				...s,
				loud: arr( s.loud ),
				low: arr( s.low ),
				air: arr( s.air ),
				bright: arr( s.bright ),
				busy: arr( s.busy ),
				accents: { t: arr( s.accents.t ), s: arr( s.accents.s ) },
			};
		}, url );
		song.title = path.basename( file, path.extname( file ) );
		const out = path.join( outDir, song.title + '.json' );
		fs.writeFileSync( out, JSON.stringify( song ) );
		const c = song.character;
		console.log(
			`${ song.title }: ${ song.duration.toFixed( 1 ) } s, ${
				song.accents.t.length
			} accents, ${
				song.sections.length
			} sections, beat ${ song.beat.bpm.toFixed(
				1
			) } (${ song.beat.confidence.toFixed( 2 ) }) | ${ Object.entries(
				c
			)
				.map( ( [ k, v ] ) => k + ' ' + Math.round( v * 100 ) / 100 )
				.join( ', ' ) }`
		);
	}
	if ( errors.length ) {
		console.error( 'page errors:', errors );
		process.exitCode = 1;
	}
} finally {
	await browser.close();
	server.close();
}
