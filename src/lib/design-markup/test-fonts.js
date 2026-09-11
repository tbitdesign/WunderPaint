/**
 * Die ausgelieferten Schriften bei node-canvas anmelden, damit ein
 * Jest-Lauf mit DENSELBEN Gesichtern misst, die der Editor und der
 * Kontaktbogen malen.
 *
 * Ohne das misst node-canvas jede Familie mit der Systemschrift, und jede
 * Zeilenzahl, jede gemalte Größe und damit jedes `lines`- und
 * `min-size`-Urteil gehört zu einer Schrift, die niemand bestellt hat -
 * genau der Befund, an dem die Abnahme von Stufe 1 hing (B1: "das Gate ist
 * grün, weil es mit der falschen Schrift misst"). Ein Fixture, das man auf
 * solche Zahlen einstellt, ist auf eine Fiktion eingestellt.
 *
 * Quelle sind die `.woff`-Dateien der `@fontsource`-Pakete (Dev-Abhängig-
 * keiten, dieselben Schnitte wie `assets/fonts/*.woff2`; woff2 kann
 * node-canvas gar nicht lesen).
 *
 * ABER: `registerFont()` misst eine .woff-Datei falsch. "Midnight Run
 * Collection" in Anton 400 bei 100 px ist nach den Vorschubbreiten der
 * Schrift 947,6 px breit; node-canvas meldet für dieselbe Datei 1809 px,
 * für Bebas Neue das Doppelte, für Playfair das 1,6-fache - nur Inter
 * stimmt zufällig. Dieselben Tabellen als gewöhnliche sfnt-Datei
 * (`.ttf`) misst es exakt richtig (947,6). Deshalb packt dieses Modul
 * jede WOFF einmal in eine sfnt-Datei im Temp-Verzeichnis um und meldet
 * die an. Umpacken heißt: Tabellen entpacken (zlib), Verzeichnis neu
 * schreiben, auf 4 Bytes ausrichten - die Glyphen und ihre Metriken
 * bleiben Byte für Byte dieselben.
 *
 * Nur für Tests. `src/` steht in `.distignore`, diese Datei verlässt den
 * Baum nie, und kein Anwendungscode importiert sie.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { registerFont } from 'canvas';
import SHIPPED_FONTS from '../fonts-shipped.json';

/*
 * Nur die aufrechten Schnitte. Meldet man die Kursiven mit an, verliert
 * node-canvas die Zuordnung Familie/Schnitt. Ein kursiv betontes Wort
 * (arch-photo) misst dadurch mit einer schräg gestellten Aufrechten statt
 * mit der echten Kursiven; das ist die kleinere Ungenauigkeit.
 */
const FILE = /^(.+)-latin-(\d{3})-normal\.woff$/;
const CACHE = path.join( os.tmpdir(), 'wpie-design-markup-fonts' );

/**
 * WOFF -> sfnt. Kopf und Tabellenverzeichnis neu, Tabellen entpackt und
 * auf 4 Bytes ausgerichtet; Prüfsummen und Reihenfolge (nach Tag) wie im
 * Original.
 *
 * @param {Buffer} woff Inhalt einer .woff-Datei.
 * @return {Buffer} Dieselben Tabellen als sfnt.
 */
function woffToSfnt( woff ) {
	if ( 'wOFF' !== woff.subarray( 0, 4 ).toString( 'latin1' ) ) {
		throw new Error( 'not a woff file' );
	}
	const flavor = woff.readUInt32BE( 4 );
	const count = woff.readUInt16BE( 12 );
	const tables = [];
	for ( let i = 0; i < count; i++ ) {
		const at = 44 + i * 20;
		const tag = woff.subarray( at, at + 4 );
		const offset = woff.readUInt32BE( at + 4 );
		const compLength = woff.readUInt32BE( at + 8 );
		const origLength = woff.readUInt32BE( at + 12 );
		const checksum = woff.readUInt32BE( at + 16 );
		const raw = woff.subarray( offset, offset + compLength );
		tables.push( {
			tag,
			checksum,
			data: compLength === origLength ? raw : zlib.inflateSync( raw ),
		} );
	}
	tables.sort( ( a, b ) => a.tag.compare( b.tag ) );
	let pow = 1;
	while ( pow * 2 <= tables.length ) {
		pow *= 2;
	}
	const head = Buffer.alloc( 12 );
	head.writeUInt32BE( flavor, 0 );
	head.writeUInt16BE( tables.length, 4 );
	head.writeUInt16BE( pow * 16, 6 );
	head.writeUInt16BE( Math.log2( pow ), 8 );
	head.writeUInt16BE( tables.length * 16 - pow * 16, 10 );
	const dir = Buffer.alloc( tables.length * 16 );
	const body = [];
	let at = 12 + tables.length * 16;
	tables.forEach( ( t, i ) => {
		t.tag.copy( dir, i * 16 );
		dir.writeUInt32BE( t.checksum, i * 16 + 4 );
		dir.writeUInt32BE( at, i * 16 + 8 );
		dir.writeUInt32BE( t.data.length, i * 16 + 12 );
		const pad = ( 4 - ( t.data.length % 4 ) ) % 4;
		body.push( t.data, Buffer.alloc( pad ) );
		at += t.data.length + pad;
	} );
	return Buffer.concat( [ head, dir, ...body ] );
}

let done = false;

/**
 * Meldet jeden lateinischen aufrechten Schnitt jeder ausgelieferten
 * Familie an. Mehrfachaufrufe sind harmlos (der erste zählt); node-canvas
 * will die Anmeldung vor der ersten Leinwand sehen, deshalb rufen die
 * Suiten sie beim Laden des Moduls auf, nicht in einem Test. Fehlt ein
 * `@fontsource`-Paket oder lässt sich eine Datei nicht umpacken, bleibt es
 * für dieses Gesicht beim Rückfall - eine Messung ohne echte Schrift ist
 * ärgerlich, ein abgebrochener Testlauf wäre schlimmer.
 *
 * @return {number} Zahl der angemeldeten Schnitte.
 */
export function registerShippedFonts() {
	if ( done ) {
		return 0;
	}
	done = true;
	let n = 0;
	try {
		fs.mkdirSync( CACHE, { recursive: true } );
	} catch ( e ) {
		return 0;
	}
	for ( const family of SHIPPED_FONTS ) {
		const slug = family.toLowerCase().replace( / /g, '-' );
		const dir = path.join(
			__dirname,
			'..',
			'..',
			'..',
			'node_modules',
			'@fontsource',
			slug,
			'files'
		);
		let entries = [];
		try {
			entries = fs.readdirSync( dir );
		} catch ( e ) {
			continue;
		}
		for ( const entry of entries ) {
			const m = FILE.exec( entry );
			if ( ! m ) {
				continue;
			}
			const sfnt = path.join( CACHE, `${ slug }-${ m[ 2 ] }.ttf` );
			try {
				if ( ! fs.existsSync( sfnt ) ) {
					fs.writeFileSync(
						sfnt,
						woffToSfnt( fs.readFileSync( path.join( dir, entry ) ) )
					);
				}
				registerFont( sfnt, {
					family,
					weight: m[ 2 ],
					style: 'normal',
				} );
				n++;
			} catch ( e ) {
				// A face that will not repack or parse is one measurement
				// back on the fallback, not a reason to fail the suite.
			}
		}
	}
	return n;
}
