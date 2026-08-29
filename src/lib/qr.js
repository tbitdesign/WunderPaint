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
	if (
		style.logoUrl &&
		( ! style.logoMode || 'center' === style.logoMode ) &&
		( style.logoScale || 0.2 ) > 0.26
	) {
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
 * Module-grid sampler over an artwork: what the image wants a module
 * to be (dark/light plus a confidence weight), and the raw tint for
 * painting. One rasterization per grid size, cached.
 *
 * @param {Object} art  Loaded image.
 * @param {number} frac Artwork size as a fraction of the grid.
 * @return {Object} { sample, tint }.
 */
function makeArtSampler( art, frac ) {
	let cache = null;
	// Supersampled: 3x3 taps per module, alpha-weighted - single-tap
	// sampling stair-stepped every edge (Thomas: "zu pixelig").
	const grid = ( n ) => {
		if ( ! cache || cache.n !== n ) {
			const sub = 3 * n;
			const c = createCanvas( sub, sub );
			const g = c.getContext( '2d' );
			const lw = art.naturalWidth || art.width;
			const lh = art.naturalHeight || art.height;
			const fit = Math.min( ( sub * frac ) / lw, ( sub * frac ) / lh );
			g.drawImage(
				art,
				( sub - lw * fit ) / 2,
				( sub - lh * fit ) / 2,
				lw * fit,
				lh * fit
			);
			const px = g.getImageData( 0, 0, sub, sub ).data;
			const mods = new Float32Array( n * n * 4 );
			for ( let row = 0; row < n; row++ ) {
				for ( let col = 0; col < n; col++ ) {
					let r = 0;
					let gg = 0;
					let b = 0;
					let a = 0;
					for ( let sy = 0; sy < 3; sy++ ) {
						for ( let sx = 0; sx < 3; sx++ ) {
							const i =
								( ( row * 3 + sy ) * sub + ( col * 3 + sx ) ) *
								4;
							const al = px[ i + 3 ] / 255;
							r += px[ i ] * al;
							gg += px[ i + 1 ] * al;
							b += px[ i + 2 ] * al;
							a += al;
						}
					}
					const o = ( row * n + col ) * 4;
					mods[ o ] = a > 0 ? r / a : 0;
					mods[ o + 1 ] = a > 0 ? gg / a : 0;
					mods[ o + 2 ] = a > 0 ? b / a : 0;
					mods[ o + 3 ] = a / 9;
				}
			}
			cache = { n, mods };
		}
		return cache.mods;
	};
	return {
		frac,
		sample( row, col, n ) {
			const mods = grid( n );
			const o = ( row * n + col ) * 4;
			const a = mods[ o + 3 ];
			if ( a < 0.08 ) {
				// Outside the motif: faint random wishes keep the frame
				// looking like QR noise instead of a checkerboard.
				return {
					has: true,
					dark: Math.random() < 0.5 ? 1 : 0,
					weight: 0.03,
				};
			}
			// Composite on white; the more decided the tone, the
			// heavier the wish.
			const l =
				( 0.2126 * mods[ o ] +
					0.7152 * mods[ o + 1 ] +
					0.0722 * mods[ o + 2 ] ) *
					a +
				255 * ( 1 - a );
			return {
				has: true,
				dark: l < 140 ? 1 : 0,
				weight: 0.2 + Math.min( 1, Math.abs( l - 140 ) / 110 ) * 0.8,
			};
		},
		tint( row, col, n ) {
			const mods = grid( n );
			const o = ( row * n + col ) * 4;
			if ( mods[ o + 3 ] < 0.08 ) {
				return null;
			}
			return [ mods[ o ], mods[ o + 1 ], mods[ o + 2 ] ];
		},
		// The artwork's own dark tone, for the modules OUTSIDE the
		// motif and the finder eyes - the whole code wears the brand.
		dominant( n ) {
			const mods = grid( n );
			let r = 0;
			let g = 0;
			let b = 0;
			let count = 0;
			for ( let i = 0; i < n * n; i++ ) {
				const o = i * 4;
				if ( mods[ o + 3 ] < 0.5 ) {
					continue;
				}
				const l =
					0.2126 * mods[ o ] +
					0.7152 * mods[ o + 1 ] +
					0.0722 * mods[ o + 2 ];
				if ( l < 170 ) {
					r += mods[ o ];
					g += mods[ o + 1 ];
					b += mods[ o + 2 ];
					count++;
				}
			}
			if ( ! count ) {
				return null;
			}
			return clampDark( [ r / count, g / count, b / count ] );
		},
	};
}

const tintLuma = ( c ) => 0.2126 * c[ 0 ] + 0.7152 * c[ 1 ] + 0.0722 * c[ 2 ];

// Dark modules stay decidedly dark, light ones decidedly light, in the
// artwork's own hue - people see color, scanners see contrast.
function clampDark( c ) {
	const l = Math.max( 1, tintLuma( c ) );
	const f = Math.min( 1, 95 / l );
	return [ c[ 0 ] * f, c[ 1 ] * f, c[ 2 ] * f ].map( Math.round );
}

function clampLight( c ) {
	const l = tintLuma( c );
	if ( l >= 190 ) {
		return c;
	}
	const t = ( 190 - l ) / ( 255 - l );
	return c.map( ( v ) => Math.round( v + ( 255 - v ) * t ) );
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
	// Woven artwork keeps every module's center truthful; both art modes
	// leverage the H level's 30% recovery headroom.
	const halftone = 'halftone' === style.logoMode && style.logoUrl;
	// QArt: the padding and error-correction freedom is SOLVED so the
	// data modules themselves form the artwork - no overlay, no
	// intentional errors (see lib/qart.js).
	const qartMode = 'qart' === style.logoMode && style.logoUrl;
	// A center logo destroys up to ~9% of the modules; H recovers 30%.
	const ecl = style.logoUrl ? 'H' : style.ecl || 'M';
	let qartArt = null;
	let qartSampler = null;
	let code = null;
	if ( qartMode ) {
		try {
			qartArt = await loadImage( style.logoUrl, 'anonymous' );
		} catch ( e ) {
			qartArt = null; // Render a plain code rather than failing.
		}
		if ( qartArt ) {
			const { buildQartMatrix } = await import(
				/* webpackChunkName: "qrcode" */ './qart'
			);
			qartSampler = makeArtSampler(
				qartArt,
				Math.max( 0.3, Math.min( 1, style.artScale || 0.85 ) )
			);
			const built = buildQartMatrix( payload, qartSampler.sample, {
				// More modules = more detail; short payloads boost far.
				minFreeRatio: 0.62,
				maxVersion: 20,
			} );
			code = { modules: built };
		}
	}
	if ( ! code ) {
		code = QRCode.create( payload, { errorCorrectionLevel: ecl } );
	}
	const n = code.modules.size;
	const data = code.modules.data;
	const reserved = code.modules.reservedBit || null;
	const margin = Number.isFinite( style.margin )
		? Math.max( 0, Math.min( 8, Math.round( style.margin ) ) )
		: 2;
	const target = style.size || 1024;
	let cell = Math.max( 6, Math.floor( target / ( n + 2 * margin ) ) );
	if ( halftone ) {
		// Subcell grid: every module splits into 3x3, so the cell must
		// divide cleanly or the truth pixel drifts off center.
		cell = Math.max( 9, 3 * Math.floor( cell / 3 ) );
	}
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

	// Woven artwork (halftone): each data module becomes a 3x3 block.
	// The CENTER subcell always tells the module's truth - that is the
	// spot decoders sample - while the 8 border subcells show the
	// artwork. Function patterns (finder, timing, alignment, format)
	// stay untouched, they are how a scanner finds the grid at all.
	let woven = false;
	if ( halftone ) {
		let art = null;
		try {
			art = await loadImage( style.logoUrl, 'anonymous' );
		} catch ( e ) {
			art = null; // Render a plain code rather than failing.
		}
		if ( art ) {
			const sub = 3 * n;
			const sample = createCanvas( sub, sub );
			const sctx = sample.getContext( '2d' );
			const frac = Math.max( 0.3, Math.min( 1, style.artScale || 0.85 ) );
			const lw = art.naturalWidth || art.width;
			const lh = art.naturalHeight || art.height;
			const fit = Math.min( ( sub * frac ) / lw, ( sub * frac ) / lh );
			sctx.drawImage(
				art,
				( sub - lw * fit ) / 2,
				( sub - lh * fit ) / 2,
				lw * fit,
				lh * fit
			);
			const px = sctx.getImageData( 0, 0, sub, sub ).data;
			const subCell = cell / 3;
			for ( let row = 0; row < n; row++ ) {
				for ( let col = 0; col < n; col++ ) {
					if ( isEyeModule( n, col, row ) ) {
						continue;
					}
					const i = row * n + col;
					const dark = !! data[ i ];
					const x = off + col * cell;
					const y = off + row * cell;
					if ( reserved && reserved[ i ] ) {
						if ( dark ) {
							ctx.fillStyle = fg;
							ctx.fillRect(
								x - 0.25,
								y - 0.25,
								cell + 0.5,
								cell + 0.5
							);
						}
						continue;
					}
					for ( let sy = 0; sy < 3; sy++ ) {
						for ( let sx = 0; sx < 3; sx++ ) {
							const cx = x + sx * subCell;
							const cy = y + sy * subCell;
							if ( 1 === sx && 1 === sy ) {
								if ( dark ) {
									ctx.fillStyle = fg;
									ctx.fillRect( cx, cy, subCell, subCell );
								}
								continue;
							}
							const pi =
								( ( row * 3 + sy ) * sub + ( col * 3 + sx ) ) *
								4;
							const a = px[ pi + 3 ];
							if ( a > 16 ) {
								ctx.fillStyle =
									'rgba(' +
									px[ pi ] +
									',' +
									px[ pi + 1 ] +
									',' +
									px[ pi + 2 ] +
									',' +
									a / 255 +
									')';
								ctx.fillRect(
									cx,
									cy,
									subCell + 0.3,
									subCell + 0.3
								);
							} else if ( dark ) {
								ctx.fillStyle = fg;
								ctx.fillRect(
									cx,
									cy,
									subCell + 0.3,
									subCell + 0.3
								);
							}
						}
					}
				}
			}
			woven = true;
		}
	}

	// QArt painting: every module is a DISCRETE rounded dot with a
	// visible gap - the dots form the motif, nothing reads as an
	// overlay. Inside the motif they wear the artwork's hue (contrast-
	// clamped), outside they wear the artwork's dominant dark tone.
	let qartDominant = null;
	if ( qartSampler && ! woven ) {
		const dom = qartSampler.dominant( n );
		qartDominant = dom
			? 'rgb(' + dom[ 0 ] + ',' + dom[ 1 ] + ',' + dom[ 2 ] + ')'
			: null;
		const s = 0.9 * cell;
		const inset = ( cell - s ) / 2;
		const r = 0.3 * s;
		const dot = ( x, y ) => {
			ctx.beginPath();
			addRound( ctx, x + inset, y + inset, s, s, r );
			ctx.fill();
		};
		for ( let row = 0; row < n; row++ ) {
			for ( let col = 0; col < n; col++ ) {
				if ( isEyeModule( n, col, row ) ) {
					continue;
				}
				const dark = !! data[ row * n + col ];
				const t = qartSampler.tint( row, col, n );
				const x = off + col * cell;
				const y = off + row * cell;
				if ( reserved && reserved[ row * n + col ] ) {
					// Function patterns (timing, alignment, format) stay
					// SOLID - decoders lean on them to find the grid.
					if ( dark ) {
						ctx.fillStyle = qartDominant || fg;
						ctx.fillRect(
							x - 0.25,
							y - 0.25,
							cell + 0.5,
							cell + 0.5
						);
					}
					continue;
				}
				if ( t ) {
					const rgb = dark ? clampDark( t ) : clampLight( t );
					ctx.fillStyle =
						'rgb(' +
						rgb[ 0 ] +
						',' +
						rgb[ 1 ] +
						',' +
						rgb[ 2 ] +
						')';
					dot( x, y );
				} else if ( dark ) {
					ctx.fillStyle = qartDominant || fg;
					dot( x, y );
				}
			}
		}
		woven = true;
	}

	ctx.fillStyle = fg;
	if ( ! woven ) {
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
	}

	const eyeStyle = style.eyeStyle || 'square';
	// In QArt mode the whole code wears the artwork's tone, eyes too.
	const eyeColor = style.eyeColor || qartDominant || fg;
	drawEye( ctx, off, off, cell, eyeStyle, eyeColor );
	drawEye( ctx, off + ( n - 7 ) * cell, off, cell, eyeStyle, eyeColor );
	drawEye( ctx, off, off + ( n - 7 ) * cell, cell, eyeStyle, eyeColor );

	if ( style.logoUrl && ! woven ) {
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

/* ------------------------------- SVG export ---------------------------- */

// Rounded-rect path string (evenodd punches eye and frame windows).
function roundPath( x, y, w, h, r ) {
	const rr = Math.max( 0, Math.min( r, w / 2, h / 2 ) );
	if ( rr < 0.01 ) {
		return 'M' + x + ' ' + y + 'h' + w + 'v' + h + 'h' + -w + 'Z';
	}
	return (
		'M' +
		( x + rr ) +
		' ' +
		y +
		'h' +
		( w - 2 * rr ) +
		'a' +
		rr +
		' ' +
		rr +
		' 0 0 1 ' +
		rr +
		' ' +
		rr +
		'v' +
		( h - 2 * rr ) +
		'a' +
		rr +
		' ' +
		rr +
		' 0 0 1 ' +
		-rr +
		' ' +
		rr +
		'h' +
		( 2 * rr - w ) +
		'a' +
		rr +
		' ' +
		rr +
		' 0 0 1 ' +
		-rr +
		' ' +
		-rr +
		'v' +
		( 2 * rr - h ) +
		'a' +
		rr +
		' ' +
		rr +
		' 0 0 1 ' +
		rr +
		' ' +
		-rr +
		'Z'
	);
}

const esc = ( s ) =>
	String( s )
		.replace( /&/g, '&amp;' )
		.replace( /</g, '&lt;' )
		.replace( />/g, '&gt;' )
		.replace( /"/g, '&quot;' );

/**
 * The styled code as a standalone SVG string - vector modules and
 * eyes, scalable without loss for print. Mirrors renderQr's modes:
 * plain, center badge, woven halftone and QArt dots.
 *
 * @param {string} payload Encoded payload (see qrPayload).
 * @param {Object} style   Same style object renderQr takes.
 * @return {Promise<string>} SVG markup.
 */
export async function qrSvg( payload, style = {} ) {
	const QRCode = ( await import( /* webpackChunkName: "qrcode" */ 'qrcode' ) )
		.default;
	const halftone = 'halftone' === style.logoMode && style.logoUrl;
	const qartMode = 'qart' === style.logoMode && style.logoUrl;
	const ecl = style.logoUrl ? 'H' : style.ecl || 'M';
	let art = null;
	if ( style.logoUrl ) {
		try {
			art = await loadImage( style.logoUrl, 'anonymous' );
		} catch ( e ) {
			art = null;
		}
	}
	let qartSampler = null;
	let code = null;
	if ( qartMode && art ) {
		const { buildQartMatrix } = await import(
			/* webpackChunkName: "qrcode" */ './qart'
		);
		qartSampler = makeArtSampler(
			art,
			Math.max( 0.3, Math.min( 1, style.artScale || 0.85 ) )
		);
		code = {
			modules: buildQartMatrix( payload, qartSampler.sample, {
				minFreeRatio: 0.62,
				maxVersion: 20,
			} ),
		};
	}
	if ( ! code ) {
		code = QRCode.create( payload, { errorCorrectionLevel: ecl } );
	}
	const n = code.modules.size;
	const data = code.modules.data;
	const reserved = code.modules.reservedBit || null;
	const margin = Number.isFinite( style.margin )
		? Math.max( 0, Math.min( 8, Math.round( style.margin ) ) )
		: 2;
	const u = 10; // SVG units per module
	const span = ( n + 2 * margin ) * u;
	const off = margin * u;
	const fg = style.fg || '#000000';
	const bg = style.bg || '#ffffff';
	const moduleStyle = style.moduleStyle || 'square';
	const parts = [];
	const rgbCss = ( c ) =>
		'rgb(' +
		Math.round( c[ 0 ] ) +
		',' +
		Math.round( c[ 1 ] ) +
		',' +
		Math.round( c[ 2 ] ) +
		')';

	if ( ! style.transparentBg ) {
		parts.push(
			'<rect width="' +
				span +
				'" height="' +
				span +
				'" fill="' +
				esc( bg ) +
				'"/>'
		);
	}

	const moduleShape = ( x, y, fill ) => {
		if ( 'dots' === moduleStyle ) {
			return (
				'<circle cx="' +
				( x + u / 2 ) +
				'" cy="' +
				( y + u / 2 ) +
				'" r="' +
				0.44 * u +
				'" fill="' +
				fill +
				'"/>'
			);
		}
		if ( 'rounded' === moduleStyle ) {
			return (
				'<rect x="' +
				x +
				'" y="' +
				y +
				'" width="' +
				u +
				'" height="' +
				u +
				'" rx="' +
				0.32 * u +
				'" fill="' +
				fill +
				'"/>'
			);
		}
		return (
			'<rect x="' +
			( x - 0.03 * u ) +
			'" y="' +
			( y - 0.03 * u ) +
			'" width="' +
			1.06 * u +
			'" height="' +
			1.06 * u +
			'" fill="' +
			fill +
			'"/>'
		);
	};

	let qartDominant = null;
	if ( qartSampler ) {
		const dom = qartSampler.dominant( n );
		qartDominant = dom ? rgbCss( dom ) : null;
		const s = 0.9 * u;
		const inset = ( u - s ) / 2;
		for ( let row = 0; row < n; row++ ) {
			for ( let col = 0; col < n; col++ ) {
				if ( isEyeModule( n, col, row ) ) {
					continue;
				}
				const dark = !! data[ row * n + col ];
				const x = off + col * u;
				const y = off + row * u;
				if ( reserved && reserved[ row * n + col ] ) {
					if ( dark ) {
						parts.push(
							'<rect x="' +
								x +
								'" y="' +
								y +
								'" width="' +
								u +
								'" height="' +
								u +
								'" fill="' +
								( qartDominant || esc( fg ) ) +
								'"/>'
						);
					}
					continue;
				}
				const t = qartSampler.tint( row, col, n );
				let fill = null;
				if ( t ) {
					fill = rgbCss( dark ? clampDark( t ) : clampLight( t ) );
				} else if ( dark ) {
					fill = qartDominant || esc( fg );
				}
				if ( fill ) {
					parts.push(
						'<rect x="' +
							( x + inset ) +
							'" y="' +
							( y + inset ) +
							'" width="' +
							s +
							'" height="' +
							s +
							'" rx="' +
							0.3 * s +
							'" fill="' +
							fill +
							'"/>'
					);
				}
			}
		}
	} else if ( halftone && art ) {
		// Subcell grid, exactly like the canvas renderer: truthful
		// centers, artwork on the borders.
		const sub = 3 * n;
		const sample = createCanvas( sub, sub );
		const sctx = sample.getContext( '2d' );
		const frac = Math.max( 0.3, Math.min( 1, style.artScale || 0.85 ) );
		const lw = art.naturalWidth || art.width;
		const lh = art.naturalHeight || art.height;
		const fit = Math.min( ( sub * frac ) / lw, ( sub * frac ) / lh );
		sctx.drawImage(
			art,
			( sub - lw * fit ) / 2,
			( sub - lh * fit ) / 2,
			lw * fit,
			lh * fit
		);
		const px = sctx.getImageData( 0, 0, sub, sub ).data;
		const sc = u / 3;
		for ( let row = 0; row < n; row++ ) {
			for ( let col = 0; col < n; col++ ) {
				if ( isEyeModule( n, col, row ) ) {
					continue;
				}
				const i = row * n + col;
				const dark = !! data[ i ];
				const x = off + col * u;
				const y = off + row * u;
				if ( reserved && reserved[ i ] ) {
					if ( dark ) {
						parts.push(
							'<rect x="' +
								x +
								'" y="' +
								y +
								'" width="' +
								u +
								'" height="' +
								u +
								'" fill="' +
								esc( fg ) +
								'"/>'
						);
					}
					continue;
				}
				for ( let sy = 0; sy < 3; sy++ ) {
					for ( let sx = 0; sx < 3; sx++ ) {
						const cx = x + sx * sc;
						const cy = y + sy * sc;
						if ( 1 === sx && 1 === sy ) {
							if ( dark ) {
								parts.push(
									'<rect x="' +
										cx +
										'" y="' +
										cy +
										'" width="' +
										sc +
										'" height="' +
										sc +
										'" fill="' +
										esc( fg ) +
										'"/>'
								);
							}
							continue;
						}
						const pi =
							( ( row * 3 + sy ) * sub + ( col * 3 + sx ) ) * 4;
						const a = px[ pi + 3 ];
						if ( a > 16 ) {
							parts.push(
								'<rect x="' +
									cx +
									'" y="' +
									cy +
									'" width="' +
									1.03 * sc +
									'" height="' +
									1.03 * sc +
									'" fill="rgba(' +
									px[ pi ] +
									',' +
									px[ pi + 1 ] +
									',' +
									px[ pi + 2 ] +
									',' +
									( a / 255 ).toFixed( 3 ) +
									')"/>'
							);
						} else if ( dark ) {
							parts.push(
								'<rect x="' +
									cx +
									'" y="' +
									cy +
									'" width="' +
									1.03 * sc +
									'" height="' +
									1.03 * sc +
									'" fill="' +
									esc( fg ) +
									'"/>'
							);
						}
					}
				}
			}
		}
	} else {
		for ( let row = 0; row < n; row++ ) {
			for ( let col = 0; col < n; col++ ) {
				if ( ! data[ row * n + col ] || isEyeModule( n, col, row ) ) {
					continue;
				}
				parts.push(
					moduleShape( off + col * u, off + row * u, esc( fg ) )
				);
			}
		}
	}

	// The three finder eyes: ring (evenodd window) plus pupil.
	const eyeStyle = style.eyeStyle || 'square';
	const eyeColor = style.eyeColor || qartDominant || fg;
	const eyeRound = 'rounded' === eyeStyle;
	const eye = ( ex, ey ) => {
		const ring =
			roundPath( ex, ey, 7 * u, 7 * u, eyeRound ? 2.2 * u : 0 ) +
			roundPath( ex + u, ey + u, 5 * u, 5 * u, eyeRound ? 1.5 * u : 0 );
		const pupil = roundPath(
			ex + 2 * u,
			ey + 2 * u,
			3 * u,
			3 * u,
			eyeRound ? 1.1 * u : 0
		);
		parts.push(
			'<path d="' +
				ring +
				'" fill-rule="evenodd" fill="' +
				esc( eyeColor ) +
				'"/>' +
				'<path d="' +
				pupil +
				'" fill="' +
				esc( eyeColor ) +
				'"/>'
		);
	};
	eye( off, off );
	eye( off + ( n - 7 ) * u, off );
	eye( off, off + ( n - 7 ) * u );

	// Center badge: punched window plus the artwork as embedded image.
	if ( art && ! halftone && ! qartMode ) {
		const frac = Math.max( 0.12, Math.min( 0.3, style.logoScale || 0.2 ) );
		const box = span * frac;
		const bx = ( span - box ) / 2;
		const r = box * 0.14;
		if ( ! style.transparentBg ) {
			parts.push(
				'<path d="' +
					roundPath( bx, bx, box, box, r ) +
					'" fill="' +
					esc( bg ) +
					'"/>'
			);
		}
		const lw = art.naturalWidth || art.width;
		const lh = art.naturalHeight || art.height;
		const pad = box * 0.1;
		const s = Math.min( ( box - 2 * pad ) / lw, ( box - 2 * pad ) / lh );
		const dw = lw * s;
		const dh = lh * s;
		const buf = createCanvas( lw, lh );
		buf.getContext( '2d' ).drawImage( art, 0, 0 );
		parts.push(
			'<image x="' +
				( span - dw ) / 2 +
				'" y="' +
				( span - dh ) / 2 +
				'" width="' +
				dw +
				'" height="' +
				dh +
				'" href="' +
				buf.toDataURL( 'image/png' ) +
				'"/>'
		);
	}

	let width = span;
	let height = span;
	let body = parts.join( '' );

	// "Scan me" frame: surround, window and caption - same geometry as
	// the canvas route, sized in module units.
	if ( style.frame && style.frame.text ) {
		const fr = style.frame;
		const pad = span * 0.055;
		const bar = Math.max( 4.4 * u, span * 0.16 );
		const radius = span * 0.07;
		width = span + 2 * pad;
		height = span + 2 * pad + bar;
		const frameColor = fr.color || '#111111';
		const dark = lum( parseColor( frameColor ) ) < 140;
		const inner = style.transparentBg
			? ''
			: '<rect x="' +
			  pad +
			  '" y="' +
			  pad +
			  '" width="' +
			  span +
			  '" height="' +
			  span +
			  '" fill="' +
			  esc( bg ) +
			  '"/>';
		const px = bar * 0.5;
		body =
			'<path d="' +
			roundPath( 0, 0, width, height, radius ) +
			roundPath( pad, pad, span, span, 0 ) +
			'" fill-rule="evenodd" fill="' +
			esc( frameColor ) +
			'"/>' +
			inner +
			'<g transform="translate(' +
			pad +
			' ' +
			pad +
			')">' +
			body +
			'</g>' +
			'<text x="' +
			width / 2 +
			'" y="' +
			( span + 2 * pad + bar * 0.52 ) +
			'" font-family="-apple-system, \'Segoe UI\', Roboto, sans-serif"' +
			' font-weight="700" font-size="' +
			px +
			'" text-anchor="middle" dominant-baseline="middle" fill="' +
			( dark ? '#ffffff' : '#111111' ) +
			'">' +
			esc( fr.text ) +
			'</text>';
	}

	const out = style.size || 1024;
	return (
		'<svg xmlns="http://www.w3.org/2000/svg" width="' +
		Math.round( ( out * width ) / span ) +
		'" height="' +
		Math.round( ( out * height ) / span ) +
		'" viewBox="0 0 ' +
		width +
		' ' +
		height +
		'">' +
		body +
		'</svg>'
	);
}
