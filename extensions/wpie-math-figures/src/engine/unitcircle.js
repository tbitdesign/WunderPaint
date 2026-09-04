/**
 * The unit circle: one angle per line (`angle 30`, `angle pi/6`, `angle
 * 1.57 rad`, with an optional "label"), drawn with its arc, radius and
 * point, the sine and cosine segments with exact values at the special
 * angles, an optional tangent, and marks at the multiples of 30 degrees
 * in degrees or radians.
 */
import { textEl, r } from './svg.js';

const COS_COLOR = '#1f6feb';

export function parseUnitCircle( text ) {
	const spec = { angles: [] };
	const errors = [];
	String( text || '' )
		.split( '\n' )
		.forEach( ( raw, i ) => {
			let line = raw.trim();
			if ( ! line ) {
				return;
			}
			let label = '';
			line = line.replace( /\s*"([^"]*)"\s*$/, ( m, l ) => {
				label = l;
				return '';
			} );
			const m = /^angle\s+(.+)$/i.exec( line );
			const body = ( m ? m[ 1 ] : line )
				.trim()
				.toLowerCase()
				.replace( /\s+/g, '' );
			let deg = null;
			let mm;
			if (
				( mm =
					/^(-?\d*(?:\.\d+)?)\*?(?:pi|π)(?:\/(\d+(?:\.\d+)?))?$/.exec(
						body
					) )
			) {
				const a =
					'' === mm[ 1 ] || '-' === mm[ 1 ]
						? '-' === mm[ 1 ]
							? -1
							: 1
						: parseFloat( mm[ 1 ] );
				deg = ( a * 180 ) / ( mm[ 2 ] ? parseFloat( mm[ 2 ] ) : 1 );
			} else if ( ( mm = /^(-?\d+(?:\.\d+)?)rad$/.exec( body ) ) ) {
				deg = ( parseFloat( mm[ 1 ] ) * 180 ) / Math.PI;
			} else if (
				( mm = /^(-?\d+(?:\.\d+)?)(?:°|deg)?$/.exec( body ) )
			) {
				deg = parseFloat( mm[ 1 ] );
			}
			if ( null === deg || ! Number.isFinite( deg ) ) {
				errors.push( {
					line: i + 1,
					message: 'Expected an angle like 30, 30°, pi/6 or 1.57 rad',
				} );
				return;
			}
			spec.angles.push( { deg, label } );
		} );
	return { spec, errors };
}

const EXACT = {
	0: [ '0', '1' ],
	30: [ '1/2', '√3/2' ],
	45: [ '√2/2', '√2/2' ],
	60: [ '√3/2', '1/2' ],
	90: [ '1', '0' ],
};
const signed = ( s, neg ) => ( '0' === s ? '0' : ( neg ? '-' : '' ) + s );

export function exactSinCos( deg ) {
	const d = ( ( deg % 360 ) + 360 ) % 360;
	const ref = d <= 90 ? d : d <= 180 ? 180 - d : d <= 270 ? d - 180 : 360 - d;
	const key = Math.round( ref * 1000 ) / 1000;
	if ( ! ( key in EXACT ) ) {
		return null;
	}
	const [ s, c ] = EXACT[ key ];
	const sinNeg = d > 180 && d < 360;
	const cosNeg = d > 90 && d < 270;
	return { sin: signed( s, sinNeg ), cos: signed( c, cosNeg ) };
}

const RAD_LABELS = {
	0: '0',
	30: 'π/6',
	60: 'π/3',
	90: 'π/2',
	120: '2π/3',
	150: '5π/6',
	180: 'π',
	210: '7π/6',
	240: '4π/3',
	270: '3π/2',
	300: '5π/3',
	330: '11π/6',
};
const fmt = ( n ) => String( Math.round( n * 100 ) / 100 );

export function renderUnitCircle( spec, o ) {
	const scale = o.scale || 1;
	const width = o.width || 800;
	const ink = o.ink || '#000';
	const accent = o.accent || ink;
	const muted = o.muted || ink;
	const bg = o.bg || '#ffffff';
	const font = o.font || 'Arial';
	const fs = ( o.size || 22 ) * 0.85;
	const t = o.t || ( ( s ) => s );
	const S = Math.min( width, 560 * scale );
	const R = S * 0.36;
	const cx = S / 2;
	const cy = S / 2;
	const X = ( v ) => cx + v * R;
	const Y = ( v ) => cy - v * R;
	const parts = [];
	// Axes.
	for ( const [ x1, y1, x2, y2 ] of [
		[ cx - R * 1.3, cy, cx + R * 1.3, cy ],
		[ cx, cy + R * 1.3, cx, cy - R * 1.3 ],
	] ) {
		parts.push(
			`<line x1="${ r( x1 ) }" y1="${ r( y1 ) }" x2="${ r(
				x2
			) }" y2="${ r( y2 ) }" stroke="${ ink }" stroke-width="${ r(
				1.4 * scale
			) }"/>`
		);
	}
	parts.push(
		textEl( X( 1 ) + fs * 0.3, cy + fs * 1.1, '1', {
			size: r( fs * 0.8 ),
			font,
			fill: muted,
		} )
	);
	parts.push(
		textEl( X( -1 ) - fs * 0.3, cy + fs * 1.1, '-1', {
			size: r( fs * 0.8 ),
			font,
			fill: muted,
			anchor: 'end',
		} )
	);
	parts.push(
		textEl( cx - fs * 0.5, Y( 1 ) - fs * 0.3, '1', {
			size: r( fs * 0.8 ),
			font,
			fill: muted,
			anchor: 'end',
		} )
	);
	parts.push(
		textEl( cx - fs * 0.5, Y( -1 ) + fs * 0.9, '-1', {
			size: r( fs * 0.8 ),
			font,
			fill: muted,
			anchor: 'end',
		} )
	);
	parts.push(
		`<circle cx="${ r( cx ) }" cy="${ r( cy ) }" r="${ r(
			R
		) }" fill="none" stroke="${ ink }" stroke-width="${ r( 2 * scale ) }"/>`
	);
	if ( o.special ) {
		for ( let d = 0; d < 360; d += 30 ) {
			const a = ( d * Math.PI ) / 180;
			const ux = Math.cos( a );
			const uy = Math.sin( a );
			parts.push(
				`<line x1="${ r( X( ux * 0.94 ) ) }" y1="${ r(
					Y( uy * 0.94 )
				) }" x2="${ r( X( ux ) ) }" y2="${ r(
					Y( uy )
				) }" stroke="${ ink }" stroke-width="${ r( 1.5 * scale ) }"/>`
			);
			const label = 'radians' === o.units ? RAD_LABELS[ d ] : d + '°';
			parts.push(
				textEl(
					X( ux * 1.14 ),
					Y( uy * 1.14 ) +
						fs * 0.3 -
						( 0 === d || 180 === d ? fs * 0.75 : 0 ),
					label,
					{
						size: r( fs * 0.75 ),
						font,
						fill: muted,
						anchor: 'middle',
					}
				)
			);
		}
	}
	spec.angles.forEach( ( ang, i ) => {
		const a = ( ang.deg * Math.PI ) / 180;
		const px = Math.cos( a );
		const py = Math.sin( a );
		// Arc from the x axis to the angle.
		const arcR = R * ( 0.22 + i * 0.06 );
		const large = Math.abs( ang.deg ) > 180 ? 1 : 0;
		const sweep = ang.deg >= 0 ? 0 : 1;
		parts.push(
			`<path d="M${ r( cx + arcR ) } ${ r( cy ) }A${ r( arcR ) } ${ r(
				arcR
			) } 0 ${ large } ${ sweep } ${ r( cx + arcR * px ) } ${ r(
				cy - arcR * py
			) }" fill="none" stroke="${ accent }" stroke-width="${ r(
				1.8 * scale
			) }"/>`
		);
		const mid = a / 2;
		const angLabel =
			ang.label ||
			( 'radians' === o.units &&
			RAD_LABELS[ ( ( Math.round( ang.deg ) % 360 ) + 360 ) % 360 ]
				? RAD_LABELS[ ( ( Math.round( ang.deg ) % 360 ) + 360 ) % 360 ]
				: fmt( ang.deg ) + '°' );
		parts.push(
			textEl(
				cx + ( arcR + fs * 0.9 ) * Math.cos( mid ),
				cy - ( arcR + fs * 0.9 ) * Math.sin( mid ) + fs * 0.3,
				angLabel,
				{ size: r( fs * 0.85 ), font, fill: accent, anchor: 'middle' }
			)
		);
		// Radius and point.
		parts.push(
			`<line x1="${ r( cx ) }" y1="${ r( cy ) }" x2="${ r(
				X( px )
			) }" y2="${ r( Y( py ) ) }" stroke="${ ink }" stroke-width="${ r(
				2 * scale
			) }"/>`
		);
		if ( false !== o.sincos ) {
			const ex = exactSinCos( ang.deg );
			const sinLabel = ex ? ex.sin : fmt( py );
			const cosLabel = ex ? ex.cos : fmt( px );
			parts.push(
				`<line x1="${ r( X( px ) ) }" y1="${ r( cy ) }" x2="${ r(
					X( px )
				) }" y2="${ r(
					Y( py )
				) }" stroke="${ accent }" stroke-width="${ r( 3 * scale ) }"/>`
			);
			parts.push(
				`<line x1="${ r( cx ) }" y1="${ r( cy ) }" x2="${ r(
					X( px )
				) }" y2="${ r(
					cy
				) }" stroke="${ COS_COLOR }" stroke-width="${ r(
					3 * scale
				) }"/>`
			);
			parts.push(
				textEl(
					X( px ) + ( px >= 0 ? 1 : -1 ) * fs * 0.4,
					Y( py / 2 ) + fs * 0.3,
					sinLabel,
					{
						size: r( fs * 0.85 ),
						font,
						fill: accent,
						anchor: px >= 0 ? 'start' : 'end',
					}
				)
			);
			parts.push(
				textEl(
					X( px / 2 ),
					cy + ( py >= 0 ? 1 : -1 ) * fs * 1.05,
					cosLabel,
					{
						size: r( fs * 0.85 ),
						font,
						fill: COS_COLOR,
						anchor: 'middle',
					}
				)
			);
		}
		if ( o.tangent && Math.abs( px ) > 0.05 ) {
			const tv = Math.max( -3, Math.min( 3, py / px ) );
			const side = px >= 0 ? 1 : -1;
			parts.push(
				`<line x1="${ r( X( side ) ) }" y1="${ r(
					cy + R * 1.25
				) }" x2="${ r( X( side ) ) }" y2="${ r(
					cy - R * 1.25
				) }" stroke="${ muted }" stroke-width="1" stroke-dasharray="4 4"/>`
			);
			parts.push(
				`<line x1="${ r( cx ) }" y1="${ r( cy ) }" x2="${ r(
					X( side )
				) }" y2="${ r(
					Y( side * tv )
				) }" stroke="${ muted }" stroke-width="1" stroke-dasharray="4 4"/>`
			);
			parts.push(
				`<line x1="${ r( X( side ) ) }" y1="${ r( cy ) }" x2="${ r(
					X( side )
				) }" y2="${ r(
					Y( side * tv )
				) }" stroke="#2e8b57" stroke-width="${ r( 3 * scale ) }"/>`
			);
			parts.push(
				textEl(
					X( side ) + side * fs * 0.4,
					Y( ( side * tv ) / 2 ) + fs * 0.3,
					fmt( py / px ),
					{
						size: r( fs * 0.85 ),
						font,
						fill: '#2e8b57',
						anchor: side > 0 ? 'start' : 'end',
					}
				)
			);
		}
		parts.push(
			`<circle cx="${ r( X( px ) ) }" cy="${ r( Y( py ) ) }" r="${ r(
				fs * 0.28
			) }" fill="${ accent }"/>`
		);
		parts.push(
			textEl(
				X( px * 1.1 ) + ( px >= 0 ? fs * 0.3 : -fs * 0.3 ),
				Y( py * 1.1 ) - fs * 0.3,
				'P' + ( spec.angles.length > 1 ? i + 1 : '' ),
				{
					size: r( fs * 0.85 ),
					font,
					fill: ink,
					anchor: px >= 0 ? 'start' : 'end',
				}
			)
		);
	} );
	void bg;
	void t;
	return { inner: parts.join( '' ), w: r( S ), h: r( S ), warnings: [] };
}
