/**
 * QR code engine (v1.102.0): payload builders for the common content
 * types (URL, text, email, phone, SMS, Wi-Fi, vCard) plus a canvas
 * renderer on top of the qrcode module matrix - styled modules and
 * finder eyes, transparent background and a center logo. With a logo
 * the error correction is forced to H so the code stays scannable.
 */

import { __ } from '@wordpress/i18n';

import { parseColor } from './color';
import { contrastRatio } from './contrast-check';
import { createCanvas } from './raster';
import { loadImage } from '../store/document';

/* ------------------------------ payloads ------------------------------ */

// WIFI: escapes backslash, semicolon, comma, colon and quotes.
const wifiEscape = ( s ) => String( s || '' ).replace( /([\\;,:"])/g, '\\$1' );

// vCard 3.0 escapes backslash, comma, semicolon and newlines.
const vcardEscape = ( s ) =>
	String( s || '' )
		.replace( /([\\,;])/g, '\\$1' )
		.replace( /\r?\n/g, '\\n' );

const digits = ( s ) => String( s || '' ).replace( /[^\d+]/g, '' );

/**
 * Encoded QR payload for a content descriptor.
 *
 * @param {Object} content { kind, ...fields }.
 * @return {string} Payload text.
 */
export function qrPayload( content = {} ) {
	const c = content;
	switch ( c.kind ) {
		case 'text':
			return String( c.text || '' ).trim();
		case 'email': {
			const params = [];
			if ( c.subject ) {
				params.push( 'subject=' + encodeURIComponent( c.subject ) );
			}
			if ( c.message ) {
				params.push( 'body=' + encodeURIComponent( c.message ) );
			}
			return (
				'mailto:' +
				String( c.email || '' ).trim() +
				( params.length ? '?' + params.join( '&' ) : '' )
			);
		}
		case 'tel':
			return 'tel:' + digits( c.phone );
		case 'sms':
			// SMSTO (zxing convention) is what phone cameras expect.
			return (
				'SMSTO:' + digits( c.phone ) + ':' + String( c.message || '' )
			);
		case 'wifi': {
			const enc =
				'nopass' === c.encryption
					? 'nopass'
					: 'WEP' === c.encryption
					? 'WEP'
					: 'WPA';
			return (
				'WIFI:T:' +
				enc +
				';S:' +
				wifiEscape( c.ssid ) +
				( 'nopass' === enc ? '' : ';P:' + wifiEscape( c.password ) ) +
				( c.hidden ? ';H:true' : '' ) +
				';;'
			);
		}
		case 'vcard': {
			const first = vcardEscape( c.firstName );
			const last = vcardEscape( c.lastName );
			const lines = [
				'BEGIN:VCARD',
				'VERSION:3.0',
				'N:' + last + ';' + first + ';;;',
				'FN:' + [ first, last ].filter( Boolean ).join( ' ' ),
			];
			if ( c.org ) {
				lines.push( 'ORG:' + vcardEscape( c.org ) );
			}
			if ( c.phone ) {
				lines.push( 'TEL;TYPE=WORK,VOICE:' + vcardEscape( c.phone ) );
			}
			if ( c.email ) {
				lines.push( 'EMAIL:' + vcardEscape( c.email ) );
			}
			if ( c.url ) {
				lines.push( 'URL:' + vcardEscape( c.url ) );
			}
			lines.push( 'END:VCARD' );
			return lines.join( '\n' );
		}
		case 'payment': {
			// EPC QR ("Girocode", EPC069-12 v2): twelve fixed lines, UTF-8,
			// SEPA credit transfer. Banking apps open a pre-filled transfer.
			// Version 002 makes the BIC optional; trailing empty lines are
			// dropped as the spec allows.
			const iban = String( c.iban || '' )
				.replace( /\s+/g, '' )
				.toUpperCase();
			const lines = [
				'BCD',
				'002',
				'1',
				'SCT',
				String( c.bic || '' )
					.replace( /\s+/g, '' )
					.toUpperCase(),
				String( c.name || '' )
					.trim()
					.slice( 0, 70 ),
				iban,
				epcAmount( c.amount ),
				'', // purpose code
				'', // structured reference (unstructured text is used)
				String( c.reference || '' )
					.trim()
					.slice( 0, 140 ),
			];
			while ( lines.length && '' === lines[ lines.length - 1 ] ) {
				lines.pop();
			}
			return lines.join( '\n' );
		}
		case 'event': {
			// VCALENDAR wrapper, not a bare VEVENT: iOS refuses the bare
			// form. Times stay floating local time, which is what a poster
			// means ("19:00" is 19:00 wherever it hangs).
			const lines = [
				'BEGIN:VCALENDAR',
				'VERSION:2.0',
				'BEGIN:VEVENT',
				'SUMMARY:' + icsEscape( c.title ),
				'DTSTART:' + icsDate( c.start ),
			];
			if ( c.end ) {
				lines.push( 'DTEND:' + icsDate( c.end ) );
			}
			if ( c.location ) {
				lines.push( 'LOCATION:' + icsEscape( c.location ) );
			}
			lines.push( 'END:VEVENT', 'END:VCALENDAR' );
			return lines.join( '\n' );
		}
		case 'url':
		default:
			return String( c.url || '' ).trim();
	}
}

/**
 * EPC amount line: "EUR12.34", or an empty line when no amount is set (the
 * payer types it in the banking app). Accepts a decimal comma, because the
 * audience that scans Girocodes writes 12,34.
 *
 * @param {string|number} v Raw amount input.
 * @return {string} EPC amount line content.
 */
export function epcAmount( v ) {
	const raw = String( v ?? '' )
		.trim()
		.replace( ',', '.' );
	if ( ! raw ) {
		return '';
	}
	const num = Number( raw );
	if ( ! Number.isFinite( num ) || num < 0.01 || num > 999999999.99 ) {
		return '';
	}
	return 'EUR' + num.toFixed( 2 );
}

/**
 * iCalendar text escaping: backslash, semicolon, comma and newlines.
 *
 * @param {string} s Raw text.
 * @return {string} Escaped text.
 */
function icsEscape( s ) {
	return String( s || '' )
		.replace( /\\/g, '\\\\' )
		.replace( /;/g, '\\;' )
		.replace( /,/g, '\\,' )
		.replace( /\r?\n/g, '\\n' );
}

/**
 * datetime-local value ("2026-08-01T19:00") to iCal basic format
 * ("20260801T190000"). Anything unparseable passes through stripped, so a
 * {{token}} in the field survives to the dynamic pipeline.
 *
 * @param {string} v Input value.
 * @return {string} iCal date-time.
 */
function icsDate( v ) {
	const flat = String( v || '' ).replace( /[-:]/g, '' );
	if ( /^\d{8}T\d{4}$/.test( flat ) ) {
		return flat + '00';
	}
	return flat;
}

/**
 * Whether the content has enough input to encode.
 *
 * @param {Object} content Content descriptor.
 * @return {boolean} Ready.
 */
export function qrPayloadReady( content = {} ) {
	const c = content;
	switch ( c.kind ) {
		case 'text':
			return '' !== String( c.text || '' ).trim();
		case 'email':
			return String( c.email || '' ).includes( '@' );
		case 'tel':
		case 'sms':
			return digits( c.phone ).length >= 3;
		case 'wifi':
			return '' !== String( c.ssid || '' ).trim();
		case 'vcard':
			return (
				'' !==
				(
					String( c.firstName || '' ) +
					String( c.lastName || '' ) +
					String( c.org || '' )
				).trim()
			);
		case 'payment': {
			const iban = String( c.iban || '' ).replace( /\s+/g, '' );
			return (
				'' !== String( c.name || '' ).trim() &&
				( /^[A-Z]{2}[0-9]{2}/i.test( iban )
					? iban.length >= 15
					: hasTokenText( iban ) )
			);
		}
		case 'event':
			return (
				'' !== String( c.title || '' ).trim() &&
				'' !== String( c.start || '' ).trim()
			);
		case 'url':
		default: {
			const url = String( c.url || '' ).trim();
			return '' !== url && 'https://' !== url && 'http://' !== url;
		}
	}
}

/** A field that holds a {{token}} counts as filled at design time. */
const hasTokenText = ( s ) => /{{[^}]+}}/.test( String( s || '' ) );

/**
 * Layer name for a QR content descriptor.
 *
 * @param {Object} content Content descriptor.
 * @return {string} Name.
 */
export function qrLayerName( content = {} ) {
	const c = content;
	const short = ( s ) => String( s || '' ).slice( 0, 40 );
	switch ( c.kind ) {
		case 'text':
			return 'QR: ' + short( c.text );
		case 'email':
			return 'QR: ' + short( c.email );
		case 'tel':
			return 'QR: ' + short( c.phone );
		case 'sms':
			return 'QR: SMS ' + short( c.phone );
		case 'wifi':
			return 'QR: Wi-Fi ' + short( c.ssid );
		case 'vcard':
			return (
				'QR: ' +
				short(
					[ c.firstName, c.lastName ].filter( Boolean ).join( ' ' ) ||
						c.org
				)
			);
		case 'payment':
			return 'QR: ' + ( short( c.name ) || short( c.iban ) );
		case 'event':
			return 'QR: ' + short( c.title );
		case 'url':
		default:
			return (
				'QR: ' +
				short(
					String( c.url || '' )
						.trim()
						.replace( /^https?:\/\//, '' )
				)
			);
	}
}

/* ------------------------------ warnings ------------------------------ */

const lum = ( { r, g, b } ) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * Human-readable scannability warnings for a style.
 *
 * @param {Object} style Render style.
 * @return {string[]} Warnings (empty when fine).
 */
export function qrWarnings( style = {} ) {
	const out = [];
	const fg = parseColor( style.fg || '#000000' );
	const bg = parseColor( style.bg || '#ffffff' );
	if ( ! style.transparentBg ) {
		if ( contrastRatio( fg, bg ) < 2.5 ) {
			out.push(
				__(
					'Low contrast between code and background, many scanners will fail.',
					'wunderpaint'
				)
			);
		} else if ( lum( fg ) > lum( bg ) ) {
			out.push(
				__(
					'Light code on a dark background: some scanners cannot read inverted QR codes.',
					'wunderpaint'
				)
			);
		}
	} else if ( lum( fg ) > 160 ) {
		out.push(
			__(
				'A light QR color needs a dark area behind the layer to stay scannable.',
				'wunderpaint'
			)
		);
	}
	if ( style.logoUrl && ( style.logoScale || 0.2 ) > 0.26 ) {
		out.push(
			__(
				'The logo covers a lot of the code. Keep it below about 25% and test the scan.',
				'wunderpaint'
			)
		);
	}
	return out;
}

/* ------------------------------ rendering ----------------------------- */

/**
 * Whether a module belongs to one of the three finder eyes.
 *
 * @param {number} n   Matrix size.
 * @param {number} col Column.
 * @param {number} row Row.
 * @return {boolean} Is eye module.
 */
export function isEyeModule( n, col, row ) {
	return (
		( col < 7 && row < 7 ) ||
		( col >= n - 7 && row < 7 ) ||
		( col < 7 && row >= n - 7 )
	);
}

// Rounded-rect path (ctx.roundRect is missing in node-canvas/older Safari).
function addRound( ctx, x, y, w, h, r ) {
	const rr = Math.max( 0, Math.min( r, w / 2, h / 2 ) );
	if ( rr < 0.5 ) {
		ctx.rect( x, y, w, h );
		return;
	}
	ctx.moveTo( x + rr, y );
	ctx.arcTo( x + w, y, x + w, y + h, rr );
	ctx.arcTo( x + w, y + h, x, y + h, rr );
	ctx.arcTo( x, y + h, x, y, rr );
	ctx.arcTo( x, y, x + w, y, rr );
	ctx.closePath();
}

function drawModule( ctx, x, y, cell, styleName ) {
	if ( 'dots' === styleName ) {
		ctx.beginPath();
		ctx.arc( x + cell / 2, y + cell / 2, cell * 0.44, 0, 2 * Math.PI );
		ctx.fill();
	} else if ( 'rounded' === styleName ) {
		ctx.beginPath();
		addRound( ctx, x, y, cell, cell, cell * 0.32 );
		ctx.fill();
	} else {
		// Overdraw a hair to avoid antialiasing seams between modules.
		ctx.fillRect( x - 0.25, y - 0.25, cell + 0.5, cell + 0.5 );
	}
}

function drawEye( ctx, x, y, cell, styleName, color ) {
	const round = 'rounded' === styleName;
	ctx.fillStyle = color;
	// Outer 7x7 ring, one module thick (even-odd punches the hole, which
	// keeps transparent backgrounds truly transparent inside the eye).
	ctx.beginPath();
	addRound( ctx, x, y, 7 * cell, 7 * cell, round ? 2.2 * cell : 0 );
	addRound(
		ctx,
		x + cell,
		y + cell,
		5 * cell,
		5 * cell,
		round ? 1.5 * cell : 0
	);
	ctx.fill( 'evenodd' );
	// Inner 3x3 pupil.
	ctx.beginPath();
	addRound(
		ctx,
		x + 2 * cell,
		y + 2 * cell,
		3 * cell,
		3 * cell,
		round ? 1.1 * cell : 0
	);
	ctx.fill();
}

/**
 * Render a styled QR code to a canvas.
 *
 * @param {string} payload Encoded payload (see qrPayload).
 * @param {Object} style   { size?, margin?, ecl?, fg?, bg?, transparentBg?,
 *                           moduleStyle?, eyeStyle?, eyeColor?, logoUrl?,
 *                           logoScale? }.
 * @return {Promise<{canvas: HTMLCanvasElement, modules: number, ecl: string}>} Result.
 */
export async function renderQr( payload, style = {} ) {
	const QRCode = ( await import( /* webpackChunkName: "qrcode" */ 'qrcode' ) )
		.default;
	// A center logo destroys up to ~9% of the modules; H recovers 30%.
	const ecl = style.logoUrl ? 'H' : style.ecl || 'M';
	const code = QRCode.create( payload, { errorCorrectionLevel: ecl } );
	const n = code.modules.size;
	const data = code.modules.data;
	const margin = Number.isFinite( style.margin )
		? Math.max( 0, Math.min( 8, Math.round( style.margin ) ) )
		: 2;
	const target = style.size || 1024;
	const cell = Math.max( 6, Math.floor( target / ( n + 2 * margin ) ) );
	const size = cell * ( n + 2 * margin );
	const canvas = createCanvas( size, size );
	const ctx = canvas.getContext( '2d' );
	const fg = style.fg || '#000000';
	const bg = style.bg || '#ffffff';
	if ( ! style.transparentBg ) {
		ctx.fillStyle = bg;
		ctx.fillRect( 0, 0, size, size );
	}

	const off = margin * cell;
	const moduleStyle = style.moduleStyle || 'square';
	ctx.fillStyle = fg;
	for ( let row = 0; row < n; row++ ) {
		for ( let col = 0; col < n; col++ ) {
			if ( ! data[ row * n + col ] || isEyeModule( n, col, row ) ) {
				continue;
			}
			drawModule(
				ctx,
				off + col * cell,
				off + row * cell,
				cell,
				moduleStyle
			);
		}
	}

	const eyeStyle = style.eyeStyle || 'square';
	const eyeColor = style.eyeColor || fg;
	drawEye( ctx, off, off, cell, eyeStyle, eyeColor );
	drawEye( ctx, off + ( n - 7 ) * cell, off, cell, eyeStyle, eyeColor );
	drawEye( ctx, off, off + ( n - 7 ) * cell, cell, eyeStyle, eyeColor );

	if ( style.logoUrl ) {
		let logo = null;
		try {
			logo = await loadImage( style.logoUrl, 'anonymous' );
		} catch ( e ) {
			logo = null; // Render without the logo rather than failing.
		}
		if ( logo ) {
			const frac = Math.max(
				0.12,
				Math.min( 0.3, style.logoScale || 0.2 )
			);
			const box = Math.round( ( size * frac ) / 2 ) * 2;
			const bx = ( size - box ) / 2;
			const r = box * 0.14;
			if ( style.transparentBg ) {
				ctx.save();
				ctx.globalCompositeOperation = 'destination-out';
				ctx.beginPath();
				addRound( ctx, bx, bx, box, box, r );
				ctx.fill();
				ctx.restore();
			} else {
				ctx.fillStyle = bg;
				ctx.beginPath();
				addRound( ctx, bx, bx, box, box, r );
				ctx.fill();
			}
			const pad = box * 0.1;
			const lw = logo.naturalWidth || logo.width;
			const lh = logo.naturalHeight || logo.height;
			const s = Math.min(
				( box - 2 * pad ) / lw,
				( box - 2 * pad ) / lh
			);
			const dw = lw * s;
			const dh = lh * s;
			ctx.drawImage( logo, ( size - dw ) / 2, ( size - dh ) / 2, dw, dh );
		}
	}
	// "Scan me" frame (v1.374): a rounded surround in the frame colour
	// with a caption bar below. Drawn OUTSIDE the finished code, so the
	// quiet zone, the eyes and the logo maths above stay untouched and the
	// scan window inside the frame is exactly the unframed code.
	if ( style.frame && style.frame.text ) {
		const fr = style.frame;
		const pad = Math.round( size * 0.055 );
		const bar = Math.max( 44, Math.round( size * 0.16 ) );
		const radius = Math.round( size * 0.07 );
		const outer = createCanvas( size + 2 * pad, size + 2 * pad + bar );
		const octx = outer.getContext( '2d' );
		const frameColor = fr.color || '#111111';
		octx.fillStyle = frameColor;
		octx.beginPath();
		addRound( octx, 0, 0, outer.width, outer.height, radius );
		octx.fill();
		// The code keeps its own background inside the window; with a
		// transparent style the window is punched out of the frame.
		if ( style.transparentBg ) {
			octx.save();
			octx.globalCompositeOperation = 'destination-out';
			octx.fillRect( pad, pad, size, size );
			octx.restore();
		} else {
			octx.fillStyle = bg;
			octx.fillRect( pad, pad, size, size );
		}
		octx.drawImage( canvas, pad, pad );
		// Caption: bold, centred in the bar, shrunk to fit, and readable
		// on the frame colour by luma rather than by hope.
		const dark = lum( parseColor( frameColor ) ) < 140;
		octx.fillStyle = dark ? '#ffffff' : '#111111';
		let px = Math.round( bar * 0.52 );
		const text = String( fr.text );
		do {
			octx.font =
				'700 ' +
				px +
				'px -apple-system, "Segoe UI", Roboto, sans-serif';
			px -= 2;
		} while (
			px > 8 &&
			octx.measureText( text ).width > outer.width * 0.82
		);
		octx.textAlign = 'center';
		octx.textBaseline = 'middle';
		octx.fillText( text, outer.width / 2, size + 2 * pad + bar * 0.52 );
		return { canvas: outer, modules: n, ecl };
	}
	return { canvas, modules: n, ecl };
}
