/**
 * Client-side exports that make the 360 spin usable outside the editor:
 * a self-contained HTML viewer (the sprite sheet embedded as a data
 * URL, drag to rotate, gentle auto-spin until the first interaction)
 * and a ZIP of the individual frames for 360 player plugins
 * (WooCommerce 360 viewers and the like expect single images).
 *
 * The ZIP writer stores entries uncompressed (PNGs are already
 * compressed) - that keeps it dependency-free.
 */

/* ---------------------------------- zip ---------------------------------- */

const CRC_TABLE = ( () => {
	const t = new Uint32Array( 256 );
	for ( let n = 0; n < 256; n++ ) {
		let c = n;
		for ( let k = 0; k < 8; k++ ) {
			c = c & 1 ? 0xedb88320 ^ ( c >>> 1 ) : c >>> 1;
		}
		t[ n ] = c >>> 0;
	}
	return t;
} )();

export function crc32( bytes ) {
	let c = 0xffffffff;
	for ( let i = 0; i < bytes.length; i++ ) {
		c = CRC_TABLE[ ( c ^ bytes[ i ] ) & 0xff ] ^ ( c >>> 8 );
	}
	return ( c ^ 0xffffffff ) >>> 0;
}

/**
 * Build a ZIP (method STORE) from `entries` [{ name, data: Uint8Array }].
 *
 * @param {Array} entries Files.
 * @return {Uint8Array} The archive bytes.
 */
export function makeZip( entries ) {
	const enc = new TextEncoder();
	const now = new Date();
	const dosTime =
		( now.getHours() << 11 ) |
		( now.getMinutes() << 5 ) |
		( now.getSeconds() >> 1 );
	const dosDate =
		( ( now.getFullYear() - 1980 ) << 9 ) |
		( ( now.getMonth() + 1 ) << 5 ) |
		now.getDate();
	const locals = [];
	const centrals = [];
	let offset = 0;
	for ( const { name, data } of entries ) {
		const nameB = enc.encode( name );
		const crc = crc32( data );
		const local = new Uint8Array( 30 + nameB.length + data.length );
		const lv = new DataView( local.buffer );
		lv.setUint32( 0, 0x04034b50, true );
		lv.setUint16( 4, 20, true );
		lv.setUint16( 8, 0, true ); // method: store
		lv.setUint16( 10, dosTime, true );
		lv.setUint16( 12, dosDate, true );
		lv.setUint32( 14, crc, true );
		lv.setUint32( 18, data.length, true );
		lv.setUint32( 22, data.length, true );
		lv.setUint16( 26, nameB.length, true );
		local.set( nameB, 30 );
		local.set( data, 30 + nameB.length );
		locals.push( local );

		const central = new Uint8Array( 46 + nameB.length );
		const cv = new DataView( central.buffer );
		cv.setUint32( 0, 0x02014b50, true );
		cv.setUint16( 4, 20, true );
		cv.setUint16( 6, 20, true );
		cv.setUint16( 10, 0, true );
		cv.setUint16( 12, dosTime, true );
		cv.setUint16( 14, dosDate, true );
		cv.setUint32( 16, crc, true );
		cv.setUint32( 20, data.length, true );
		cv.setUint32( 24, data.length, true );
		cv.setUint16( 28, nameB.length, true );
		cv.setUint32( 42, offset, true );
		central.set( nameB, 46 );
		centrals.push( central );
		offset += local.length;
	}
	const cdSize = centrals.reduce( ( s, c ) => s + c.length, 0 );
	const eocd = new Uint8Array( 22 );
	const ev = new DataView( eocd.buffer );
	ev.setUint32( 0, 0x06054b50, true );
	ev.setUint16( 8, entries.length, true );
	ev.setUint16( 10, entries.length, true );
	ev.setUint32( 12, cdSize, true );
	ev.setUint32( 16, offset, true );
	const out = new Uint8Array( offset + cdSize + 22 );
	let p = 0;
	for ( const b of [ ...locals, ...centrals, eocd ] ) {
		out.set( b, p );
		p += b.length;
	}
	return out;
}

/* --------------------------------- frames -------------------------------- */

const dataUrlBytes = ( url ) => {
	const bin = window.atob( url.slice( url.indexOf( ',' ) + 1 ) );
	const bytes = new Uint8Array( bin.length );
	for ( let i = 0; i < bin.length; i++ ) {
		bytes[ i ] = bin.charCodeAt( i );
	}
	return bytes;
};

/**
 * Slice a sprite sheet back into single-frame PNGs.
 *
 * @param {HTMLCanvasElement} sheet  The baked sheet.
 * @param {number}            frames Frame count.
 * @param {number}            cols   Grid columns.
 * @param {number}            cell   Cell size in px.
 * @return {Array} [{ name, data: Uint8Array }]
 */
export function sheetFrames( sheet, frames, cols, cell ) {
	const pad = String( frames ).length;
	const out = [];
	const c = document.createElement( 'canvas' );
	c.width = cell;
	c.height = cell;
	const ctx = c.getContext( '2d' );
	for ( let i = 0; i < frames; i++ ) {
		ctx.clearRect( 0, 0, cell, cell );
		ctx.drawImage(
			sheet,
			( i % cols ) * cell,
			Math.floor( i / cols ) * cell,
			cell,
			cell,
			0,
			0,
			cell,
			cell
		);
		out.push( {
			name:
				'frame-' +
				String( i + 1 ).padStart( pad, '0' ) +
				'.png',
			data: dataUrlBytes( c.toDataURL( 'image/png' ) ),
		} );
	}
	return out;
}

/* --------------------------------- viewer -------------------------------- */

/**
 * A single-file 360 viewer: embed the sheet, step frames on drag (a
 * full canvas width = one revolution), slow auto-spin until the user
 * grabs it. Drop the file on any host or embed it via <iframe>.
 *
 * @param {Object} opts { sheetUrl, frames, cols, cell, title }
 * @return {string} HTML document.
 */
export function viewerHtml( { sheetUrl, frames, cols, cell, title } ) {
	return [
		'<!doctype html>',
		'<html><head><meta charset="utf-8">',
		'<meta name="viewport" content="width=device-width,initial-scale=1">',
		'<title>' + ( title || '360° view' ) + '</title>',
		'<style>',
		'html,body{margin:0;height:100%;background:transparent}',
		'body{display:grid;place-items:center}',
		'#spin{position:relative;width:min(100vw,100vh);aspect-ratio:1;cursor:grab;touch-action:pan-y}',
		'#spin.grabbing{cursor:grabbing}',
		'canvas{width:100%;height:100%;display:block}',
		'#badge{position:absolute;left:50%;bottom:4%;transform:translateX(-50%);padding:4px 12px;font:600 12px/1.6 system-ui,sans-serif;color:#fff;background:rgba(20,22,30,.55);border-radius:999px;pointer-events:none;transition:opacity .4s}',
		'</style></head><body>',
		'<div id="spin"><canvas id="c"></canvas><div id="badge">↻ 360° · drag</div></div>',
		'<script>',
		'var FRAMES=' + frames + ',COLS=' + cols + ',CELL=' + cell + ';',
		'var img=new Image(),f=0,auto=true,px=null;',
		'var c=document.getElementById("c"),x=c.getContext("2d");',
		'var el=document.getElementById("spin"),badge=document.getElementById("badge");',
		'c.width=CELL;c.height=CELL;',
		'function draw(){x.clearRect(0,0,CELL,CELL);x.drawImage(img,(f%COLS)*CELL,Math.floor(f/COLS)*CELL,CELL,CELL,0,0,CELL,CELL);}',
		'function step(d){f=((f+d)%FRAMES+FRAMES)%FRAMES;draw();}',
		'img.onload=draw;img.src="' + sheetUrl + '";',
		'el.addEventListener("pointerdown",function(e){auto=false;badge.style.opacity=0;px=e.clientX;el.classList.add("grabbing");el.setPointerCapture(e.pointerId);});',
		'el.addEventListener("pointermove",function(e){if(px===null)return;var w=Math.max(4,el.clientWidth/FRAMES);while(e.clientX-px>w){px+=w;step(1);}while(px-e.clientX>w){px-=w;step(-1);}});',
		'function up(){px=null;el.classList.remove("grabbing");}',
		'el.addEventListener("pointerup",up);el.addEventListener("pointercancel",up);',
		'setInterval(function(){if(auto&&img.complete){step(1);}},' +
			Math.max( 40, Math.round( 4000 / frames ) ) +
			');',
		'</script></body></html>',
	].join( '\n' );
}

/* -------------------------------- download ------------------------------- */

export function download( name, blob ) {
	const a = document.createElement( 'a' );
	a.href = URL.createObjectURL( blob );
	a.download = name;
	document.body.appendChild( a );
	a.click();
	a.remove();
	// Give the click a tick before the URL is revoked.
	window.setTimeout( () => URL.revokeObjectURL( a.href ), 4000 );
}
