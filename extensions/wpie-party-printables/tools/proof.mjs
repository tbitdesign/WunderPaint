/**
 * Proof: render sheets straight from the engine (no dialog) in ONE headless
 * browser and save PNGs to dist/proof/. The page loads the occasions' web
 * fonts and measures their glyphs once, so the engine fits text with the
 * widths the editor sees; the SVG is inlined into the page (an <img> would
 * not see the fonts).
 *
 * Default: one sheet per item in a few occasions. PROOF_STARTERS=1 renders
 * every starter; PROOF_JOBS='[{"id","params"}]' renders your own.
 * PROOF_CONTACT=1 writes contact sheets (PROOF_TILE px per tile, PROOF_COLS
 * columns, PROOF_PER_PAGE tiles per page -> contact-1.png, contact-2.png ...).
 * PROOF_PREVIEW=1 writes preview.jpg (1280x720, five sheets) for the catalog.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { renderSheet, ITEMS } from '../src/items.js';
import { STARTERS } from '../src/starters.js';
import { normalizeParams } from '../src/model.js';
import { OCCASIONS } from '../src/engine/theme.js';

const here = path.dirname( fileURLToPath( import.meta.url ) );
const root = path.resolve( here, '..' );
const EDITOR = path.resolve( root, '..', '..' );
const req = createRequire( path.join( EDITOR, 'node_modules', 'x.js' ) );
const { chromium } = req( 'playwright' );
const out = path.join( root, 'dist', 'proof' );
fs.mkdirSync( out, { recursive: true } );

const FAMILIES = [ ...new Set( OCCASIONS.flatMap( ( o ) => [ o.displayFont, o.textFont ] ) ) ];
const FONT_CSS = 'https://fonts.googleapis.com/css2?' + FAMILIES.map( ( f ) => 'family=' + encodeURIComponent( f ).replace( /%20/g, '+' ) + ':ital,wght@0,400;0,700;1,400' ).join( '&' ) + '&display=swap';
const CHARS = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~äöüÄÖÜßéèêáàâíóôúñçœæ·–’‘“”…°';

let jobs;
if ( process.env.PROOF_JOBS ) {
	jobs = JSON.parse( process.env.PROOF_JOBS );
} else if ( process.env.PROOF_PREVIEW ) {
	jobs = [ 'wedding-invitation', 'birthday-kids-bingo', 'wedding-placecards', 'easter-stickers', 'christmas-box' ].map( ( id ) => STARTERS.find( ( s ) => s.id === id ) ).map( ( s ) => ( { id: s.id, params: s.params } ) );
} else if ( process.env.PROOF_STARTERS ) {
	jobs = STARTERS.map( ( s ) => ( { id: s.id, params: s.params } ) );
} else {
	jobs = [];
	const occ = OCCASIONS.map( ( o ) => o.id );
	Object.keys( ITEMS ).forEach( ( type, i ) => {
		jobs.push( { id: type + '-' + occ[ i % occ.length ], params: { v: 3, item: { type }, theme: { occasion: occ[ i % occ.length ] }, event: { title: 'Party', subtitle: 'Saturday', names: [ 'Mia', 'Leo', 'Ada' ] }, sheet: { marks: 'cut+fold' } } } );
	} );
}

const browser = await chromium.launch( { args: [ '--enable-unsafe-swiftshader', '--no-sandbox' ] } );
const page = await browser.newPage( { viewport: { width: 1000, height: 1400 } } );
const shell = ( body, w, h ) => `<html><head><link rel="stylesheet" href="${ FONT_CSS }"></head><body style="margin:0;background:#666;${ w ? `width:${ w }px;height:${ h }px;overflow:hidden;` : '' }">${ body }</body></html>`;

/* Glyph widths per family / weight / style at 100 px, measured once in the page. */
await page.setContent( shell( '<canvas id="m"></canvas>' ) );
const widths = await page.evaluate( async ( [ families, chars ] ) => {
	const specs = [];
	for ( const f of families ) {
		for ( const w of [ 400, 700 ] ) {
			for ( const it of [ '', 'italic ' ] ) {
				specs.push( `${ it }${ w } 100px "${ f }"` );
			}
		}
	}
	await Promise.all( specs.map( ( s ) => document.fonts.load( s ).catch( () => null ) ) );
	await document.fonts.ready;
	const g = document.getElementById( 'm' ).getContext( '2d' );
	const table = {};
	for ( const f of families ) {
		table[ f ] = { loaded: document.fonts.check( `400 100px "${ f }"` ) };
		for ( const w of [ 400, 700 ] ) {
			for ( const it of [ false, true ] ) {
				g.font = `${ it ? 'italic ' : '' }${ w } 100px "${ f }", Arial, sans-serif`;
				const row = {};
				for ( const ch of chars ) {
					row[ ch ] = g.measureText( ch ).width;
				}
				row.__avg = g.measureText( 'abcdefghijklmnopqrstuvwxyz' ).width / 26;
				table[ f ][ w + ( it ? 'i' : '' ) ] = row;
			}
		}
	}
	return table;
}, [ FAMILIES, CHARS ] );
const missing = FAMILIES.filter( ( f ) => ! widths[ f ].loaded );
if ( missing.length ) {
	console.log( 'fonts not loaded (fallback metrics):', missing.join( ', ' ) );
}
const measure = ( text, size, font, weight = 400, italic = false ) => {
	const fam = widths[ font ] || widths[ FAMILIES[ 0 ] ];
	const row = fam[ ( weight >= 600 ? 700 : 400 ) + ( italic ? 'i' : '' ) ];
	let w = 0;
	for ( const ch of String( text ) ) {
		w += row[ ch ] || row.__avg;
	}
	return ( w * size ) / 100;
};
const env = { t: ( s ) => s, kits: [], measure };

const inlineSvg = ( svg, w, h ) => svg.replace( /^<svg([^>]*)>/, ( m, attrs ) => {
	const a = attrs.replace( /\swidth="[^"]*"/, '' ).replace( /\sheight="[^"]*"/, '' );
	return `<svg${ a }${ /viewBox=/.test( a ) ? '' : ` viewBox="0 0 ${ w } ${ h }"` } width="${ Math.round( w ) }" height="${ Math.round( h ) }" style="display:block;background:#fff">`;
} );

const tiles = [];
for ( const job of jobs ) {
	const res = await renderSheet( normalizeParams( job.params ), env );
	fs.writeFileSync( path.join( out, job.id + '.svg' ), res.svg );
	const k = 900 / res.width;
	await page.setContent( shell( `<div id="s" style="width:${ Math.round( res.width * k ) }px">${ inlineSvg( res.svg, res.width * k, res.height * k ) }</div>` ) );
	await page.evaluate( () => document.fonts.ready );
	await page.locator( '#s' ).screenshot( { path: path.join( out, job.id + '.png' ) } );
	tiles.push( { id: job.id, svg: res.svg, w: res.width, h: res.height } );
	console.log( job.id.padEnd( 26 ), res.width + 'x' + res.height, 'count', String( res.count ).padStart( 3 ), res.warnings.length ? 'WARN ' + res.warnings.join( ' | ' ) : '' );
}
if ( process.env.PROOF_CONTACT ) {
	const cols = +( process.env.PROOF_COLS || 6 );
	const tw = +( process.env.PROOF_TILE || 300 );
	const per = +( process.env.PROOF_PER_PAGE || tiles.length );
	for ( let p = 0; p * per < tiles.length; p++ ) {
		const slice = tiles.slice( p * per, ( p + 1 ) * per );
		const cells = slice.map( ( tl ) => {
			const k = tw / Math.max( tl.w, tl.h );
			return `<div style="width:${ tw }px;text-align:center;font:11px sans-serif;color:#fff"><div style="display:flex;justify-content:center">${ inlineSvg( tl.svg, tl.w * k, tl.h * k ) }</div><div style="padding:3px 0 8px">${ tl.id }</div></div>`;
		} );
		const rows = Math.ceil( cells.length / cols );
		await page.setViewportSize( { width: cols * ( tw + 10 ) + 10, height: rows * ( tw + 40 ) + 10 } );
		await page.setContent( shell( `<div id="c" style="display:grid;grid-template-columns:repeat(${ cols }, ${ tw }px);gap:10px;padding:5px;background:#555">${ cells.join( '' ) }</div>` ) );
		await page.evaluate( () => document.fonts.ready );
		await page.locator( '#c' ).screenshot( { path: path.join( out, per >= tiles.length ? 'contact.png' : 'contact-' + ( p + 1 ) + '.png' ) } );
	}
}
if ( process.env.PROOF_PREVIEW ) {
	const W = 1280;
	const H = 720;
	const cards = tiles.map( ( tl, i ) => {
		const h = 560;
		const w = Math.round( ( h * tl.w ) / tl.h );
		const x = 60 + i * 235;
		const y = 80 + ( i % 2 ) * 40;
		const rot = ( i - 2 ) * 3;
		return `<div style="position:absolute;left:${ x }px;top:${ y }px;width:${ w }px;height:${ h }px;box-shadow:0 18px 40px rgba(0,0,0,.45);transform:rotate(${ rot }deg);transform-origin:50% 100%">${ inlineSvg( tl.svg, w, h ) }</div>`;
	} );
	await page.setViewportSize( { width: W, height: H } );
	await page.setContent( shell( `<div id="c" style="position:relative;width:${ W }px;height:${ H }px;background:linear-gradient(135deg,#1b1e26,#2a2f3b)">${ cards.join( '' ) }</div>`, W, H ) );
	await page.evaluate( () => document.fonts.ready );
	await page.screenshot( { path: path.join( root, 'preview.jpg' ), type: 'jpeg', quality: 88, clip: { x: 0, y: 0, width: W, height: H } } );
}
await browser.close();
