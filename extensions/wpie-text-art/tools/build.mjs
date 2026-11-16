import { build } from 'esbuild';
import {
	readFileSync,
	writeFileSync,
	mkdirSync,
	readdirSync,
	unlinkSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(
	path.dirname( fileURLToPath( import.meta.url ) ),
	'..'
);
await build( {
	entryPoints: [ path.join( root, 'src/main.js' ) ],
	outfile: path.join( root, 'extension.js' ),
	bundle: true,
	format: 'iife',
	minify: true,
	legalComments: 'eof',
} );
// Keep release versions unchanged during dev iterations. Entry and stylesheet
// get content hashes so the editor cannot serve stale UI after a local deploy.
const assets = path.join( root, 'assets' );
mkdirSync( assets, { recursive: true } );
for ( const name of readdirSync( assets ) ) {
	if ( /^(entry\.[a-f0-9]{12}\.js|panel\.[a-f0-9]{12}\.css)$/.test( name ) )
		unlinkSync( path.join( assets, name ) );
}
const manifestPath = path.join( root, 'manifest.json' );
const manifest = JSON.parse( readFileSync( manifestPath ) );
for ( const [ from, prefix, ext, key ] of [
	[ 'extension.js', 'entry', 'js', 'main' ],
	[ 'style.css', 'panel', 'css', 'style' ],
] ) {
	const bytes = readFileSync( path.join( root, from ) );
	const hash = createHash( 'sha256' )
		.update( bytes )
		.digest( 'hex' )
		.slice( 0, 12 );
	const name = prefix + '.' + hash + '.' + ext;
	writeFileSync( path.join( assets, name ), bytes );
	manifest[ key ] = 'assets/' + name;
}
writeFileSync( manifestPath, JSON.stringify( manifest, null, '\t' ) + '\n' );
console.log(
	'Built Text Art ' + manifest.version + ' (' + manifest.main + ')'
);
