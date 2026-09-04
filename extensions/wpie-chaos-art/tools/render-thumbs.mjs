// Thumbnails for the style tiles: one small piece per school, painted
// in node through the core paint kit (CPU media), square, 60 world
// seconds, written to thumbs/<school>.jpg. The 3D styles are shot in a
// browser (tools/studio-check.mjs with THUMBS=1), not here.
// Usage: node tools/render-thumbs.mjs [school,...]
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = path.dirname( fileURLToPath( import.meta.url ) );
const ext = path.resolve( here, '..' );
const plugin = path.resolve( ext, '..', '..' );
const only = process.argv[ 2 ] ? process.argv[ 2 ].split( ',' ) : null;
const outDir = path.join( ext, 'thumbs' );
const work = path.join( ext, 'dist', 'thumbs' );
fs.mkdirSync( outDir, { recursive: true } );
fs.mkdirSync( work, { recursive: true } );
const req = createRequire( path.join( plugin, 'node_modules', 'x.js' ) );
const { createCanvas } = req( 'canvas' );

const entry = path.join( work, 'entry.mjs' );
fs.writeFileSync(
	entry,
	`import { paintKit } from '${ path.join(
		plugin,
		'src/lib/paint-kit.js'
	) }';
import { setCanvasFactory } from '${ path.join(
		plugin,
		'src/lib/raster/env.js'
	) }';
import { FlatSession } from '${ path.join( ext, 'src/flat/session.js' ) }';
import { SCHOOLS } from '${ path.join( ext, 'src/flat/schools.js' ) }';
import { makePool } from '${ path.join( ext, 'src/core/rng.js' ) }';
export { paintKit, setCanvasFactory, FlatSession, SCHOOLS, makePool };`
);
const bundle = path.join( work, 'bundle.cjs' );
await build( {
	entryPoints: [ entry ],
	bundle: true,
	platform: 'node',
	format: 'cjs',
	outfile: bundle,
	external: [ 'canvas' ],
	logLevel: 'error',
	define: { 'process.env.NODE_ENV': '"production"' },
} );
const {
	paintKit: kit,
	setCanvasFactory,
	FlatSession,
	SCHOOLS,
	makePool,
} = req( bundle );
setCanvasFactory( ( w, h ) => createCanvas( w, h ) );

const H = 360;
const T = 176; // 88 px tile at 2x
for ( const school of SCHOOLS ) {
	if ( only && ! only.includes( school.id ) ) {
		continue;
	}
	// A fixed pool per school: the thumbnail is the same on every build.
	const pool = makePool();
	for ( let i = 0; i < 40; i++ ) {
		pool.feed(
			7919 * ( i + 1 ),
			( school.id.length * 31 + i ) * 104729,
			( i * 17 + 3 ) >>> 0
		);
	}
	const t0 = Date.now();
	const session = new FlatSession( {
		createCanvas,
		kit,
		aspect: 1,
		height: H,
		school,
		params: {
			chaos: 0.45,
			energy: 0.6,
			density: 0.6,
			tempo: 1,
			autoPalette: true,
			autoTemper: false,
			allowRecast: false,
		},
		words: pool.words,
	} );
	session.fastForward( 70, 1 / 20 );
	const c = createCanvas( T, T );
	session.stage.render( c.getContext( '2d' ), T, T, session.finishSpec() );
	fs.writeFileSync(
		path.join( outDir, school.id + '.jpg' ),
		c.toBuffer( 'image/jpeg', { quality: 0.82 } )
	);
	process.stderr.write(
		`${ school.id } ${ session.painted } marks ${ Date.now() - t0 }ms\n`
	);
}
console.log( 'wrote', outDir );
