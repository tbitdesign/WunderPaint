// Whole pieces on the flat stage, in node: the society paints a school
// for a stretch of world time through the CORE paint kit (CPU media; the
// wet islands need a browser), then a contact sheet per school.
// Usage: node tools/proof-flat.mjs <out-dir> [school,school,...] [variants] [seconds]
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = path.dirname( fileURLToPath( import.meta.url ) );
const ext = path.resolve( here, '..' );
const plugin = path.resolve( ext, '..', '..' );
const outDir = process.argv[ 2 ] || path.join( ext, 'dist', 'proof-flat' );
const only = process.argv[ 3 ] ? process.argv[ 3 ].split( ',' ) : null;
const variants = Number( process.argv[ 4 ] || 4 );
const seconds = Number( process.argv[ 5 ] || 90 );
fs.mkdirSync( outDir, { recursive: true } );
const req = createRequire( path.join( plugin, 'node_modules', 'x.js' ) );
const { createCanvas } = req( 'canvas' );

const entry = path.join( outDir, 'entry.mjs' );
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
import { readPixels, pixelsOf } from '${ path.join(
		ext,
		'src/flat/motif.js'
	) }';
import { cutPieces } from '${ path.join( ext, 'src/flat/pieces.js' ) }';
import { effectsKit } from '${ path.join( plugin, 'src/lib/effects-kit.js' ) }';
export { paintKit, setCanvasFactory, FlatSession, SCHOOLS, makePool, readPixels, pixelsOf, cutPieces, effectsKit };`
);
const bundle = path.join( outDir, 'bundle.cjs' );
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
	readPixels,
	pixelsOf,
	cutPieces,
	effectsKit,
} = req( bundle );
setCanvasFactory( ( w, h ) => createCanvas( w, h ) );

// MOTIF=<image path> paints every tile after that picture; READING sets
// how (abstract | underpaint | contours).
let motif = null;
if ( process.env.MOTIF ) {
	const { loadImage } = req( 'canvas' );
	const img = await loadImage( process.env.MOTIF );
	const px = pixelsOf( createCanvas, img, 384 );
	motif = {
		kind: 'image',
		reading: process.env.READING || 'abstract',
		likeness: Number( process.env.LIKENESS || 60 ) / 100,
		image: img,
		maps: null,
		px,
	};
}

const ASPECT = 1.5;
const H = 700;
const TW = 600;
const TH = Math.round( TW / ASPECT );
const schools = only
	? SCHOOLS.filter( ( s ) => only.includes( s.id ) )
	: SCHOOLS;

for ( const school of schools ) {
	const tiles = [];
	for ( let v = 0; v < variants; v++ ) {
		const pool = makePool();
		// Deterministic per tile, so a sheet can be re-rendered.
		for ( let i = 0; i < 40; i++ ) {
			pool.feed(
				( v + 1 ) * 7919 * ( i + 1 ),
				( school.id.length + i ) * 104729,
				( i * 31 + v * 17 ) >>> 0
			);
		}
		const t0 = Date.now();
		const tileMaps = motif
			? readPixels( motif.px, {
					aspect: ASPECT,
					rows: 36,
					rng: () => ( ( ( v + 1 ) * 2654435761 ) % 1000 ) / 1000,
			  } )
			: null;
		const tilePieces = motif
			? cutPieces( createCanvas, motif.image, tileMaps, {
					rng: () => 0.5,
					kind: 'image',
			  } )
			: [];
		const session = new FlatSession( {
			createCanvas,
			kit,
			aspect: ASPECT,
			height: H,
			school,
			params: {
				chaos: 0.5,
				energy: 0.6,
				density: 0.55,
				tempo: 1,
				autoPalette: true,
				autoTemper: true,
				allowRecast: true,
			},
			words: pool.words,
			effects: effectsKit,
			motif: motif
				? {
						...motif,
						maps: tileMaps,
						pieces: tilePieces,
						fine: readPixels( motif.px, {
							aspect: ASPECT,
							rows: 72,
							k: 3,
							rng: () => 0.37,
						} ),
				  }
				: null,
		} );
		session.fastForward( seconds, 1 / 20 );
		const tile = createCanvas( TW, TH );
		session.stage.render(
			tile.getContext( '2d' ),
			TW,
			TH,
			session.finishSpec()
		);
		const w = session.world;
		const g = tile.getContext( '2d' );
		g.fillStyle = 'rgba(0,0,0,0.55)';
		g.fillRect( 0, TH - 22, 360, 22 );
		g.fillStyle = '#fff';
		g.font = '12px sans-serif';
		g.fillText(
			`${ school.id } · ${ w.plan.archetype } · ${ w.plan.valueKey } · ${
				w.phase
			} · ${ session.painted } marks · ${ (
				( Date.now() - t0 ) /
				1000
			).toFixed( 1 ) }s`,
			6,
			TH - 7
		);
		tiles.push( tile );
		process.stderr.write(
			`${ school.id } v${ v } ${ w.plan.archetype } ${
				session.painted
			} marks ${ Date.now() - t0 }ms\n`
		);
	}
	const COLS = 2;
	const rows = Math.ceil( tiles.length / COLS );
	const sheet = createCanvas( COLS * ( TW + 6 ), rows * ( TH + 6 ) );
	const sg = sheet.getContext( '2d' );
	sg.fillStyle = '#222';
	sg.fillRect( 0, 0, sheet.width, sheet.height );
	tiles.forEach( ( t, i ) =>
		sg.drawImage(
			t,
			( i % COLS ) * ( TW + 6 ),
			Math.floor( i / COLS ) * ( TH + 6 )
		)
	);
	fs.writeFileSync(
		path.join( outDir, school.id + '.png' ),
		sheet.toBuffer( 'image/png' )
	);
}
console.log( 'wrote', outDir );
