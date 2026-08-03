/**
 * Fonts (v1.316): fonts-data.json is the full CATALOG (every family → its
 * available weights, read from @fontsource) consumed by font-manager, but
 * only the SHIPPED families' woff2 are copied into assets/fonts/ and written
 * to assets/fonts.css. The rest are fetched on demand (server download to
 * uploads/wpie-fonts, or the opt-in Google Fonts CDN). src/lib/fonts-shipped.json
 * lists the bundled families. No CDN at build time.
 *
 *   node tools/build-fonts.js
 */
const fs = require( 'fs' );
const path = require( 'path' );

const ROOT = path.join( __dirname, '..' );
const OUT_DIR = path.join( ROOT, 'assets', 'fonts' );

// Display name → @fontsource package slug is derived automatically; override
// only where they differ.
const OVERRIDE = {};

const slugOf = ( family ) =>
	OVERRIDE[ family ] ||
	family
		.toLowerCase()
		.replace( /[^a-z0-9]+/g, '-' )
		.replace( /^-|-$/g, '' );

// The curated family list. Serif / sans / display / handwriting / mono.
const FAMILIES = [
	// Sans
	'Inter',
	'Roboto',
	'Open Sans',
	'Lato',
	'Montserrat',
	'Poppins',
	'Raleway',
	'Raleway Dots',
	'Nunito',
	'Nunito Sans',
	'Work Sans',
	'Rubik',
	'Karla',
	'Mulish',
	'Cabin',
	'DM Sans',
	'Fira Sans',
	'Barlow',
	'Barlow Condensed',
	'Archivo',
	'Oswald',
	'Big Shoulders Display',
	'Josefin Sans',
	'Quicksand',
	'Comfortaa',
	'Fredoka',
	'Exo 2',
	'Space Grotesk',
	'Manrope',
	'Sora',
	'Outfit',
	'Figtree',
	'Plus Jakarta Sans',
	'Red Hat Display',
	'IBM Plex Sans',
	'Kanit',
	'Teko',
	'Anton',
	'Bebas Neue',
	'Righteous',
	'Abel',
	// Serif
	'Playfair Display',
	'DM Serif Display',
	'Merriweather',
	'Lora',
	'PT Serif',
	'Roboto Slab',
	'Bitter',
	'Zilla Slab',
	'Source Serif 4',
	'Crimson Text',
	'Libre Baskerville',
	'Cormorant Garamond',
	'EB Garamond',
	'Cinzel',
	'Abril Fatface',
	'IBM Plex Serif',
	// Mono
	'Inconsolata',
	'IBM Plex Mono',
	'JetBrains Mono',
	'Space Mono',
	// Display / script / handwriting
	'Lobster',
	'Pacifico',
	'Oleo Script',
	'Dancing Script',
	'Caveat',
	'Amatic SC',
	'Bangers',
	'Great Vibes',
	'Indie Flower',
	'Permanent Marker',
	'Sacramento',
	'Satisfy',
	'Shadows Into Light',
	'Playball',

	/*
	 * Word Art wave (v1.270): display faces for type lockups. The set above
	 * is built for reading - a lockup is built for looking, and Inter or
	 * Bebas cannot carry one. Display faces ship a single weight, so these
	 * cost one file each, and font-manager loads a family only when it is
	 * used (ensureFont), so a longer list costs ZIP size and nothing else.
	 */
	// Heavy display / poster
	'Bungee',
	'Bungee Shade',
	'Bungee Inline',
	'Bungee Outline',
	'Alfa Slab One',
	'Titan One',
	'Luckiest Guy',
	'Bowlby One SC',
	'Passion One',
	'Sigmar One',
	'Fugaz One',
	'Lilita One',
	'Ultra',
	'Rye',
	'Shrikhand',
	'Modak',
	// Rubik Mono One has ÄÖÜäöü but no ß: the only Latin-1 hole in the
	// set. Kept anyway. The market is global, a display face is picked
	// for its shape, and the gap only shows in text the user types.
	'Rubik Mono One',
	'Monoton',
	'Black Ops One',
	'Faster One',
	'Bevan',
	'Staatliches',
	'Archivo Black',
	'Bagel Fat One',
	// Fun / comic
	'Chewy',
	'Creepster',
	'Freckle Face',
	'Rampart One',
	// Retro / tech
	'Audiowide',
	'Orbitron',
	'Michroma',
	'Poiret One',
	'Megrim',
	'Silkscreen',
	'Press Start 2P',
	// Elegant display
	'Yeseva One',
	'Marcellus',
	'Italiana',
	'Prata',
	'Bodoni Moda',
	'Gilda Display',
	// Script
	'Yellowtail',
	'Kaushan Script',
	'Courgette',
	'Grand Hotel',
	'Parisienne',
	'Allura',
	'Lobster Two',
	'Berkshire Swash',
	// Marker / hand
	'Caveat Brush',
	'Rock Salt',
	'Just Another Hand',
	'Gloria Hallelujah',
];

// Of the catalog above, only these 10 ship as woff2 in the plugin (~1.3 MB).
// The rest are fetched on demand: the one-time server download to
// uploads/wpie-fonts, or the opt-in Google Fonts CDN (v1.316). Keep in sync
// with the emitted src/lib/fonts-shipped.json.
const SHIPPED = [
	'Roboto',
	'Open Sans',
	'Inter',
	'Montserrat',
	'Poppins',
	'Oswald',
	'Bebas Neue',
	'Anton',
	'Playfair Display',
	'Lora',
];
const SHIP = new Set( SHIPPED );

/*
 * Every family here comes from @fontsource, which carries its own licence.
 * A vendored tier (Velvetyne, The League) was built and dropped in v1.270:
 * the faces are artistically interesting but the usable range is already
 * covered better by the Google display list above, and vendoring costs a
 * per-font licence trail forever. If that tier ever returns, note the one
 * finding worth keeping: velvetyne/lack ships no licence anywhere in its
 * repo while the binary says "All rights reserved" - not shippable.
 */

const cssName = ( family ) =>
	/\s/.test( family ) ? `"${ family }"` : family;

const rules = [];
const data = {};
const missing = [];

if ( ! fs.existsSync( OUT_DIR ) ) {
	fs.mkdirSync( OUT_DIR, { recursive: true } );
}

for ( const family of FAMILIES ) {
	const slug = slugOf( family );
	const dir = path.join( ROOT, 'node_modules', '@fontsource', slug, 'files' );
	if ( ! fs.existsSync( dir ) ) {
		missing.push( `${ family } (@fontsource/${ slug })` );
		continue;
	}
	const files = fs.readdirSync( dir );
	const weights = [];
	for ( const w of [ 100, 200, 300, 400, 500, 600, 700, 800, 900 ] ) {
		const src = `${ slug }-latin-${ w }-normal.woff2`;
		if ( ! files.includes( src ) ) {
			continue;
		}
		// Record the weight for the catalog regardless; only SHIPPED
		// families get their woff2 copied + an @font-face rule.
		weights.push( w );
		if ( ! SHIP.has( family ) ) {
			continue;
		}
		const dest = `${ slug }-${ w }.woff2`;
		fs.copyFileSync( path.join( dir, src ), path.join( OUT_DIR, dest ) );
		rules.push(
			`@font-face {\n\tfont-family: ${ cssName(
				family
			) };\n\tfont-style: normal;\n\tfont-weight: ${ w };\n\tfont-display: swap;\n\tsrc: url(fonts/${ dest }) format("woff2");\n}`
		);
	}
	if ( weights.length ) {
		data[ family ] = weights;
	} else {
		missing.push( `${ family } (no latin woff2)` );
	}
}

/*
 * Drop woff2 that no longer belongs to any family. The script only ever
 * copied, so removing a family from the list above left its files behind:
 * fonts-data.json stopped listing them, fonts.css stopped referencing them,
 * and they shipped in the ZIP anyway, invisible. Diff against what this run
 * actually generated, and touch nothing but .woff2 (OFL.txt lives here too).
 */
const keep = new Set(
	Object.entries( data )
		.filter( ( [ family ] ) => SHIP.has( family ) )
		.flatMap( ( [ family, weights ] ) =>
			weights.map( ( w ) => `${ slugOf( family ) }-${ w }.woff2` )
		)
);
const orphans = fs
	.readdirSync( OUT_DIR )
	.filter( ( f ) => f.endsWith( '.woff2' ) && ! keep.has( f ) );
for ( const f of orphans ) {
	fs.unlinkSync( path.join( OUT_DIR, f ) );
}

fs.writeFileSync(
	path.join( ROOT, 'assets', 'fonts.css' ),
	rules.join( '\n\n' ) + '\n'
);
fs.writeFileSync(
	path.join( ROOT, 'src', 'lib', 'fonts-data.json' ),
	JSON.stringify( data, null, '\t' ) + '\n'
);
fs.writeFileSync(
	path.join( ROOT, 'src', 'lib', 'fonts-shipped.json' ),
	JSON.stringify( SHIPPED, null, '\t' ) + '\n'
);
// PHP-readable copy (ships in the dist; src/ does not): the server-side font
// download reads shipped + catalog weights from here to build css2 requests.
fs.writeFileSync(
	path.join( ROOT, 'assets', 'fonts-manifest.json' ),
	JSON.stringify( { shipped: SHIPPED, catalog: data }, null, '\t' ) + '\n'
);

// eslint-disable-next-line no-console
console.log(
	`Catalog ${ Object.keys( data ).length } families; bundled ${
		SHIPPED.length
	} (${ rules.length } faces).` +
		( orphans.length ? ` Pruned ${ orphans.length } orphaned woff2.` : '' )
);
if ( missing.length ) {
	// eslint-disable-next-line no-console
	console.log( 'MISSING:\n  ' + missing.join( '\n  ' ) );
}
