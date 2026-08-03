/**
 * Aggregate individual bundled-content JSON files (templates, text
 * combinations, elements, backgrounds) into one array module per kind, so the
 * matching content-pack chunk imports a single file. Runs in the production
 * build (see package.json).
 *
 * Authoring workflow: design in the editor, use File → Export for Library →
 * "Export as …", drop the downloaded *.json into the matching
 * src/content/bundled-<kind>/ folder, and rebuild.
 */
const fs = require( 'fs' );
const path = require( 'path' );
const zlib = require( 'zlib' );

const base = path.join( __dirname, '..', 'src', 'content' );
// Big packs are shipped as fetched assets rather than webpack chunks, so
// they can travel pre-compressed (see src/lib/fetch-pack.js).
const shipped = path.join( __dirname, '..', 'assets', 'content' );

const KINDS = [
	{
		dir: 'bundled-templates',
		out: 'bundled-templates.json',
		// ~4 MB raw: ship it compressed and fetch it on demand.
		ship: true,
		// Strict (v1.254.0): a template that opens as an empty or broken
		// document must fail the build, not scroll by as a warning.
		// category (v1.255.0) feeds the gallery filter chips; ids are
		// validated against TEMPLATE_CATEGORIES by a Jest test.
		ok: ( d ) =>
			'wpie-template@1' === d.format &&
			'string' === typeof d.name &&
			d.name &&
			'string' === typeof d.category &&
			d.category &&
			d.doc &&
			d.doc.w > 0 &&
			d.doc.h > 0 &&
			Array.isArray( d.layers ) &&
			d.layers.length > 0,
	},
	{
		dir: 'bundled-combos',
		out: 'bundled-combos.json',
		// ~2 MB raw: same treatment as the templates.
		ship: true,
		ok: ( d ) => Array.isArray( d.layers ) && d.label,
	},
	{
		dir: 'bundled-elements',
		out: 'bundled-elements.json',
		ok: ( d ) => d.name && ( d.pathD || d.shape ),
	},
	{
		dir: 'bundled-backgrounds',
		out: 'bundled-backgrounds.json',
		ok: ( d ) => d.name && d.kind,
	},
];

// Every skipped file is a lost asset, so any skip fails the build
// (v1.254.0) - before, the warnings scrolled by and npm run build ended
// green while a template silently vanished from the aggregate.
let skipped = 0;

for ( const kind of KINDS ) {
	const dir = path.join( base, kind.dir );
	const files = fs.existsSync( dir )
		? fs
				.readdirSync( dir )
				.filter( ( f ) => f.endsWith( '.json' ) )
				.sort()
		: [];
	const items = [];
	const seen = new Set();
	for ( const file of files ) {
		let raw;
		let d;
		try {
			raw = fs.readFileSync( path.join( dir, file ), 'utf8' );
			d = JSON.parse( raw );
		} catch ( e ) {
			// eslint-disable-next-line no-console
			console.error(
				`[build-content] invalid JSON, skipping: ${ file }`
			);
			skipped++;
			continue;
		}
		if ( ! d || ! kind.ok( d ) ) {
			// eslint-disable-next-line no-console
			console.error(
				`[build-content] not a valid ${ kind.dir } item, skipping: ${ file }`
			);
			skipped++;
			continue;
		}
		if ( ! d.id ) {
			d.id = `${ kind.dir }-${ path.basename( file, '.json' ) }`;
		}
		if ( seen.has( d.id ) ) {
			// eslint-disable-next-line no-console
			console.error(
				`[build-content] duplicate id ${ d.id }, skipping the newcomer: ${ file }`
			);
			skipped++;
			continue;
		}
		// Embedded rasters bloat the shipped bundle; tolerated for legacy
		// files but called out loudly so new ones don't sneak in.
		const embedded = raw.match( /data:image/g );
		if ( embedded ) {
			// eslint-disable-next-line no-console
			console.warn(
				`[build-content] ${ file }: ${ embedded.length } embedded raster(s), ` +
					`${ Math.round(
						raw.length / 1024
					) } KB file - prefer native layers`
			);
		}
		seen.add( d.id );
		items.push( d );
	}
	const json = JSON.stringify( items );
	if ( ! kind.ship ) {
		fs.writeFileSync( path.join( base, kind.out ), json + '\n' );
		// eslint-disable-next-line no-console
		console.log(
			`[build-content] ${ kind.dir }: ${ items.length } → ${ kind.out }`
		);
		continue;
	}
	// Shipped as an asset: the plain file is the fallback, the .gz is what
	// browsers actually download. gzip level 9 with mtime 0 so an unchanged
	// pack produces an identical file and git stays quiet.
	fs.mkdirSync( shipped, { recursive: true } );
	fs.writeFileSync( path.join( shipped, kind.out ), json + '\n' );
	const packed = zlib.gzipSync( Buffer.from( json + '\n' ), {
		level: 9,
		mtime: 0,
	} );
	fs.writeFileSync( path.join( shipped, kind.out + '.gz' ), packed );
	const mb = ( n ) => ( n / 1048576 ).toFixed( 2 );
	// eslint-disable-next-line no-console
	console.log(
		`[build-content] ${ kind.dir }: ${ items.length } → assets/content/${
			kind.out
		} (${ mb( json.length ) } MB → ${ mb( packed.length ) } MB gz)`
	);
}

if ( skipped ) {
	// eslint-disable-next-line no-console
	console.error( `[build-content] FAILED: ${ skipped } file(s) skipped` );
	process.exitCode = 1;
}
