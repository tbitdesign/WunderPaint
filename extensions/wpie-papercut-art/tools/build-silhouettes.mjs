/**
 * Silhouette kitchen for Papercut Art - reproducible, CC0 only.
 *
 * Phase A (candidates): pull every CC0 PhyloPic silhouette for the
 * wanted species (public-domain dedication, no attribution required),
 * save the 512px rasters and compose labeled contact sheets so a human
 * picks the best pose per slot.
 *
 *   node tools/build-silhouettes.mjs candidates
 *
 * Phase B (bake): with the chosen image UUID per slot (PICKS below),
 * trace each raster through the extension's own marching-squares
 * pipeline and write src/core/silhouettes.js as a generated module -
 * polygons only, nothing phones home at runtime.
 *
 *   node tools/build-silhouettes.mjs bake
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname( fileURLToPath( import.meta.url ) );
const root = path.resolve( here, '..' );
const SRC = path.join( here, 'silhouette-src' );
const API = 'https://api.phylopic.org';

// Slot -> candidate species (first hit wins the candidate list order).
const SPECIES = {
	deer: [ 'Cervus elaphus', 'Dama dama', 'Odocoileus virginianus' ],
	moose: [ 'Alces alces' ],
	fox: [ 'Vulpes vulpes' ],
	hare: [ 'Lepus europaeus', 'Oryctolagus cuniculus', 'Lepus' ],
	bear: [ 'Ursus arctos', 'Ursus americanus' ],
	wolf: [ 'Canis lupus' ],
	cat: [ 'Felis catus', 'Felis silvestris' ],
	dog: [ 'Canis lupus familiaris' ],
	owl: [ 'Bubo bubo', 'Strix aluco', 'Tyto alba', 'Athene noctua' ],
	horse: [ 'Equus ferus caballus', 'Equus ferus', 'Equus caballus' ],
	squirrel: [ 'Sciurus vulgaris', 'Sciurus carolinensis' ],
	heron: [ 'Ardea cinerea', 'Ardea herodias', 'Grus grus' ],
	eagle: [ 'Aquila chrysaetos', 'Haliaeetus leucocephalus', 'Buteo buteo' ],
	butterfly: [ 'Papilio machaon', 'Danaus plexippus', 'Papilionidae' ],
	bird: [ 'Turdus merula', 'Erithacus rubecula', 'Passer domesticus' ],
	boar: [ 'Sus scrofa' ],
	ibex: [ 'Capra ibex', 'Rupicapra rupicapra' ],
	whale: [ 'Megaptera novaeangliae', 'Balaenoptera musculus' ],
	dolphin: [ 'Tursiops truncatus', 'Delphinus delphis' ],
	gull: [ 'Larus argentatus', 'Larus' ],
	pine: [ 'Pinus sylvestris', 'Pinus' ],
	spruce: [ 'Picea abies', 'Abies alba' ],
	oak: [ 'Quercus robur', 'Quercus' ],
	birch: [ 'Betula pendula', 'Betula' ],
	palm: [ 'Cocos nucifera', 'Arecaceae' ],
};

// Phase B: slot -> chosen image UUID (filled after looking at sheets).
const PICKS = {};
try {
	Object.assign(
		PICKS,
		JSON.parse( fs.readFileSync( path.join( SRC, 'picks.json' ), 'utf8' ) )
	);
} catch ( e ) {}

const j = async ( url ) => {
	const res = await fetch( url );
	if ( ! res.ok ) {
		throw new Error( `${ res.status } ${ url }` );
	}
	return res.json();
};

async function build() {
	return ( await j( `${ API }/` ) ).build;
}

async function cc0Images( build, name, limit = 8 ) {
	const q = encodeURIComponent( name.toLowerCase() );
	const base = `${ API }/images?build=${ build }&filter_name=${ q }&filter_license_by=false&filter_license_nc=false&filter_license_sa=false`;
	const head = await j( base );
	if ( ! head.totalItems ) {
		return [];
	}
	const page = await j( `${ base }&page=0` );
	return ( page._links.items || [] ).slice( 0, limit );
}

async function phaseCandidates() {
	const b = await build();
	fs.mkdirSync( SRC, { recursive: true } );
	const index = {};
	for ( const [ slot, names ] of Object.entries( SPECIES ) ) {
		const dir = path.join( SRC, 'candidates', slot );
		fs.mkdirSync( dir, { recursive: true } );
		index[ slot ] = [];
		for ( const name of names ) {
			let items = [];
			try {
				items = await cc0Images( b, name );
			} catch ( e ) {
				console.log( slot, name, 'ERR', e.message );
			}
			for ( const it of items ) {
				const uuid = it.href.split( '?' )[ 0 ].split( '/' ).pop();
				if ( index[ slot ].some( ( x ) => x.uuid === uuid ) ) {
					continue;
				}
				try {
					const item = await j( `${ API }${ it.href }` );
					const rasters = item._links.rasterFiles || [];
					const small =
						rasters[ rasters.length - 1 ] || rasters[ 0 ];
					if ( ! small ) {
						continue;
					}
					const png = await fetch( small.href );
					const buf = Buffer.from( await png.arrayBuffer() );
					fs.writeFileSync(
						path.join( dir, `${ uuid }.png` ),
						buf
					);
					index[ slot ].push( {
						uuid,
						title: it.title,
						license: item._links.license.href,
						attribution: item.attribution || '',
					} );
				} catch ( e ) {
					console.log( slot, uuid, 'ERR', e.message );
				}
			}
			if ( index[ slot ].length >= 8 ) {
				break;
			}
		}
		console.log(
			slot.padEnd( 10 ),
			index[ slot ].length,
			'candidates'
		);
	}
	fs.writeFileSync(
		path.join( SRC, 'candidates.json' ),
		JSON.stringify( index, null, '\t' )
	);
	await contactSheets( index );
}

async function contactSheets( index ) {
	const GEN = path.resolve( root, '..', '..' );
	const req = createRequire(
		path.join( GEN, 'node_modules', 'x.js' )
	);
	const { chromium } = req( 'playwright' );
	const browser = await chromium.launch( { args: [ '--no-sandbox' ] } );
	const page = await browser.newPage( {
		viewport: { width: 1400, height: 2000 },
	} );
	const slots = Object.keys( index );
	const CHUNK = 5;
	for ( let s = 0; s < slots.length; s += CHUNK ) {
		const part = slots.slice( s, s + CHUNK );
		const tiles = [];
		for ( const slot of part ) {
			for ( const c of index[ slot ] ) {
				const file = path.join(
					SRC,
					'candidates',
					slot,
					`${ c.uuid }.png`
				);
				tiles.push( {
					slot,
					uuid: c.uuid.slice( 0, 8 ),
					data:
						'data:image/png;base64,' +
						fs.readFileSync( file ).toString( 'base64' ),
				} );
			}
		}
		await page.setContent( `
			<style>body{margin:12px;font:11px monospace;background:#f5f2ea}
			.t{display:inline-block;width:160px;margin:4px;text-align:center;vertical-align:top}
			.t img{width:150px;height:110px;object-fit:contain;background:#fff;border:1px solid #ccc}
			</style>
			${ tiles
				.map(
					( t ) =>
						`<div class="t"><img src="${ t.data }"><br>${ t.slot } ${ t.uuid }</div>`
				)
				.join( '' ) }
		` );
		await page.waitForTimeout( 300 );
		await page.screenshot( {
			path: path.join( SRC, `sheet-${ s / CHUNK }.png` ),
			fullPage: true,
		} );
		console.log( 'sheet', s / CHUNK, part.join( ',' ) );
	}
	await browser.close();
}

/* ------------------------------- phase B --------------------------------- */

async function phaseBake() {
	const { trace } = await import( '../src/core/mask.js' );
	const { simplify, smoothRing } = await import( '../src/core/geom.js' );
	const index = JSON.parse(
		fs.readFileSync( path.join( SRC, 'candidates.json' ), 'utf8' )
	);
	const GEN = path.resolve( root, '..', '..' );
	const req = createRequire( path.join( GEN, 'node_modules', 'x.js' ) );
	const { chromium } = req( 'playwright' );
	const browser = await chromium.launch( { args: [ '--no-sandbox' ] } );
	const page = await browser.newPage();
	const out = {};
	const prov = {};
	for ( const [ slot, pick ] of Object.entries( PICKS ) ) {
		// A slot may borrow from another candidate folder (the flying
		// gull lives under 'gull', the perched robin under 'bird').
		const folder = pick.from || slot;
		const meta = ( index[ folder ] || [] ).find( ( c ) =>
			c.uuid.startsWith( pick.uuid )
		);
		if ( ! meta ) {
			console.log( slot, 'PICK NOT FOUND', pick.uuid );
			continue;
		}
		const file = path.join(
			SRC,
			'candidates',
			folder,
			`${ meta.uuid }.png`
		);
		const data =
			'data:image/png;base64,' +
			fs.readFileSync( file ).toString( 'base64' );
		const mask = await page.evaluate( async ( src ) => {
			const img = new Image();
			await new Promise( ( ok, bad ) => {
				img.onload = ok;
				img.onerror = bad;
				img.src = src;
			} );
			const W = 460;
			const s = Math.min( W / img.width, W / img.height );
			const w = Math.round( img.width * s );
			const h = Math.round( img.height * s );
			const c = document.createElement( 'canvas' );
			c.width = w;
			c.height = h;
			const g = c.getContext( '2d' );
			g.drawImage( img, 0, 0, w, h );
			const d = g.getImageData( 0, 0, w, h ).data;
			const bits = [];
			for ( let i = 0; i < w * h; i++ ) {
				bits.push( d[ i * 4 + 3 ] > 100 ? 1 : 0 );
			}
			return { w, h, bits };
		}, data );
		const grid = {
			w: mask.w,
			h: mask.h,
			data: Uint8Array.from( mask.bits ),
		};
		let rings = trace( grid )
			.map( ( ring ) =>
				simplify(
					smoothRing(
						ring,
						Math.min( 3, Math.max( 1, Math.floor( ring.length / 64 ) ) )
					),
					0.9,
					true
				)
			)
			.filter( ( r ) => r.length >= 6 );
		// Drop specks below 0.4% of the body area.
		const area = ( r ) =>
			Math.abs(
				r.reduce(
					( a, p, i ) =>
						a +
						p[ 0 ] * r[ ( i + 1 ) % r.length ][ 1 ] -
						r[ ( i + 1 ) % r.length ][ 0 ] * p[ 1 ],
					0
				) / 2
			);
		const maxA = Math.max( ...rings.map( area ) );
		rings = rings.filter( ( r ) => area( r ) > maxA * 0.004 );
		// Normalize: unit height, ground at y=1, centered x.
		let x0 = 1e9;
		let y0 = 1e9;
		let x1 = -1e9;
		let y1 = -1e9;
		for ( const r of rings ) {
			for ( const [ x, y ] of r ) {
				x0 = Math.min( x0, x );
				y0 = Math.min( y0, y );
				x1 = Math.max( x1, x );
				y1 = Math.max( y1, y );
			}
		}
		const hgt = y1 - y0 || 1;
		const wid = x1 - x0 || 1;
		const flip = !! pick.flip;
		const polys = rings.map( ( r ) =>
			r.map( ( [ x, y ] ) => {
				let nx = ( x - x0 ) / wid;
				if ( flip ) {
					nx = 1 - nx;
				}
				return [
					Number( nx.toFixed( 4 ) ),
					Number( ( ( y - y0 ) / hgt ).toFixed( 4 ) ),
				];
			} )
		);
		out[ slot ] = { w: Number( ( wid / hgt ).toFixed( 3 ) ), polys };
		prov[ slot ] = {
			uuid: meta.uuid,
			title: meta.title,
			license: meta.license,
			attribution: meta.attribution,
		};
		console.log(
			slot.padEnd( 10 ),
			meta.title.padEnd( 26 ),
			polys.length,
			'rings',
			polys.reduce( ( a, p ) => a + p.length, 0 ),
			'pts'
		);
	}
	await browser.close();
	const header = `/**
 * GENERATED by tools/build-silhouettes.mjs - do not edit by hand.
 *
 * Traced from PhyloPic silhouettes, every one under the CC0 1.0
 * public-domain dedication (no attribution required; provenance in
 * tools/silhouette-src/provenance.json). Unit box, ground at y=1,
 * facing left; w = width/height ratio.
 */
`;
	fs.writeFileSync(
		path.join( root, 'src', 'core', 'silhouettes.js' ),
		header +
			'export const SILHOUETTES = ' +
			JSON.stringify( out ) +
			';\n'
	);
	fs.writeFileSync(
		path.join( SRC, 'provenance.json' ),
		JSON.stringify( prov, null, '\t' )
	);
	console.log( 'baked', Object.keys( out ).length, 'silhouettes' );
}

const mode = process.argv[ 2 ] || 'candidates';
if ( 'bake' === mode ) {
	await phaseBake();
} else {
	await phaseCandidates();
}
