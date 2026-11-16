// Pictures painted to songs, in node: per school one column, the same
// entropy (fixed words, not the crypto pool) in every row, a first row
// without a song and one row per song -
// so whatever differs between the rows, the song did it. The society paints
// through the CORE paint kit (CPU media) for exactly as long as the song
// lasts; the song clock follows the engine's pace, as in the dialog.
// The songs are analyses from tools/song-json.mjs.
//
// Usage: node tools/proof-music.mjs <out-dir> <school,school,...> <song.json> [...]
// Mechanical evidence only: what looks right is decided in the editor.
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = path.dirname( fileURLToPath( import.meta.url ) );
const ext = path.resolve( here, '..' );
const plugin = path.resolve( ext, '..', '..' );
const outDir = path.resolve(
	process.argv[ 2 ] || path.join( ext, 'dist', 'proof-music' )
);
const schoolIds = ( process.argv[ 3 ] || 'expressionism' ).split( ',' );
const songFiles = process.argv.slice( 4 );
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
import { effectsKit } from '${ path.join( plugin, 'src/lib/effects-kit.js' ) }';
export { paintKit, setCanvasFactory, FlatSession, SCHOOLS, effectsKit };`
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
	effectsKit,
} = req( bundle );
setCanvasFactory( ( w, h ) => createCanvas( w, h ) );

const PACE = 5; // as in flat-engine.js
const STEP = 1 / 20; // wall seconds per step, as the proofs take them
const ASPECT = 1.5;
const H = 700;
const TW = 480;
const TH = Math.round( TW / ASPECT );

/** Sixteen entropy words from a seed, the way the tests fill the pool. */
function seedWords( seed ) {
	const w = new Uint32Array( 16 );
	let x = seed >>> 0;
	for ( let i = 0; i < 16; i++ ) {
		x = Math.imul( x ^ ( x >>> 15 ), 2246822519 ) >>> 0;
		x = Math.imul( x ^ ( x >>> 13 ), 3266489917 ) >>> 0;
		w[ i ] = x;
	}
	return w;
}

/** A song from JSON: the curves become typed arrays again. */
function readSong( file ) {
	const s = JSON.parse( fs.readFileSync( file, 'utf8' ) );
	for ( const k of [ 'loud', 'low', 'air', 'bright', 'busy' ] ) {
		s[ k ] = Float32Array.from( s[ k ] );
	}
	s.accents = {
		t: Float32Array.from( s.accents.t ),
		s: Float32Array.from( s.accents.s ),
	};
	return s;
}

const songs = songFiles.map( readSong );
const rows = [ null, ...songs ];
const schools = schoolIds.map( ( id ) => SCHOOLS.find( ( s ) => s.id === id ) );
const sheet = createCanvas(
	schools.length * ( TW + 6 ) + 6,
	rows.length * ( TH + 6 ) + 6
);
const sg = sheet.getContext( '2d' );
sg.fillStyle = '#1b1b1b';
sg.fillRect( 0, 0, sheet.width, sheet.height );
const report = [];

schools.forEach( ( school, col ) => {
	rows.forEach( ( song, row ) => {
		// The same entropy down the column - makePool() would start from
		// crypto randomness - so plan, masses and the palette's base are
		// the same in every row: whatever differs, the song did.
		const words = seedWords( ( col + 1 ) * 7919 + school.id.length );
		const t0 = Date.now();
		const session = new FlatSession( {
			createCanvas,
			kit,
			aspect: ASPECT,
			height: H,
			school,
			params: {
				chaos: 0.55,
				energy: 0.55,
				density: 0.5,
				tempo: 1,
				autoPalette: true,
				autoTemper: true,
				allowRecast: true,
			},
			words,
			effects: effectsKit,
			song,
			pace: PACE,
		} );
		const timeline = [];
		if ( song ) {
			let guard = Math.ceil( ( song.duration * PACE ) / STEP ) + 200;
			let phase = '';
			let sitting = 1;
			while ( ! session.world.music.ended && guard-- > 0 ) {
				session.step( STEP );
				const w = session.world;
				if ( w.phase !== phase || w.sitting !== sitting ) {
					phase = w.phase;
					sitting = w.sitting;
					timeline.push(
						`${ phase }${
							sitting > 1 ? '#' + sitting : ''
						}@${ Math.round( session.songTime ) }s`
					);
				}
			}
			session.stage.settle();
		} else {
			// Without a song: a sitting of the usual length.
			session.fastForward( 60 * PACE, STEP );
		}
		const tile = createCanvas( TW, TH );
		session.stage.render(
			tile.getContext( '2d' ),
			TW,
			TH,
			session.finishSpec()
		);
		const w = session.world;
		const g = tile.getContext( '2d' );
		g.fillStyle = 'rgba(0,0,0,0.6)';
		g.fillRect( 0, TH - 34, TW, 34 );
		g.fillStyle = '#fff';
		g.font = '12px sans-serif';
		const name = song ? song.title : 'ohne Song';
		const ch = song ? song.character : null;
		g.fillText(
			`${ school.id } · ${ name } · ${ session.painted } marks · ${ w.phase }`,
			6,
			TH - 20
		);
		g.fillText(
			ch
				? `perc ${ ch.percussive.toFixed(
						2
				  ) } · full ${ ch.full.toFixed(
						2
				  ) } · bright ${ ch.bright.toFixed( 2 ) } · beat ${
						ch.tempo ? Math.round( ch.tempo ) : '-'
				  } · finish ${ w.signature.finish }`
				: `finish ${ w.signature.finish }`,
			6,
			TH - 6
		);
		sg.drawImage( tile, 6 + col * ( TW + 6 ), 6 + row * ( TH + 6 ) );
		const line = `${ school.id } / ${ name }: ${
			session.painted
		} marks, phase ${ w.phase }, ${ ( ( Date.now() - t0 ) / 1000 ).toFixed(
			1
		) } s${ timeline.length ? ' | ' + timeline.join( ' ' ) : '' }`;
		report.push( line );
		process.stderr.write( line + '\n' );
	} );
} );
const out = path.join( outDir, 'proof-music.png' );
fs.writeFileSync( out, sheet.toBuffer( 'image/png' ) );
fs.writeFileSync(
	path.join( outDir, 'proof-music.txt' ),
	report.join( '\n' ) + '\n'
);
console.log( 'wrote', out );
