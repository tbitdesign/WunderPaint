/* Offline QA harness: renders the poster square + typography exactly
   like the dialog does, from a synthetic GPX and (optionally) fake map
   data, without any network. */

import {
	THEMES,
	paletteFor,
	buildScene,
} from '../../src/map-engine.js';
import { parseGpx, simplifyTrack } from '../../src/gpx.js';
import {
	routeStats,
	fmtDistance,
	fmtGain,
	fmtDuration,
	fmtDate,
} from '../../src/route-stats.js';
import {
	routeBBox,
	drawRoutePoster,
	elevationSeries,
} from '../../src/poster.js';

/** Synthetic 8 km loop around Oldenburg with two hills + timestamps. */
export function demoGpx() {
	const pts = [];
	const n = 700;
	for ( let i = 0; i <= n; i++ ) {
		const a = ( i / n ) * Math.PI * 2;
		// A wobbly loop, slightly squashed.
		const r =
			0.012 +
			0.003 * Math.sin( a * 3 + 1 ) +
			0.0015 * Math.sin( a * 7 );
		const lat = 53.143 + Math.sin( a ) * r * 0.75;
		const lon = 8.214 + Math.cos( a ) * r * 1.4;
		const ele =
			12 +
			22 * Math.exp( -( ( a - 1.8 ) ** 2 ) * 3 ) +
			34 * Math.exp( -( ( a - 4.4 ) ** 2 ) * 5 ) +
			Math.sin( a * 11 ) * 1.2;
		const time = new Date(
			Date.UTC( 2026, 4, 12, 8, 0, 0 ) + i * 4100
		).toISOString();
		pts.push(
			`<trkpt lat="${ lat.toFixed( 6 ) }" lon="${ lon.toFixed(
				6
			) }"><ele>${ ele.toFixed( 1 ) }</ele><time>${ time }</time></trkpt>`
		);
	}
	return (
		'<gpx><trk><name>Oldenburg Loop</name><trkseg>' +
		pts.join( '' ) +
		'</trkseg></trk></gpx>'
	);
}

/** Fake OSM data covering a bbox: street grid, a river, a park. */
function fakeMapData( bbox ) {
	const els = [];
	const lerp = ( a, b, u ) => a + ( b - a ) * u;
	const road = ( c, g ) => els.push( { k: 'road', c, g } );
	// Grid of minor roads.
	for ( let i = 1; i < 9; i++ ) {
		const u = i / 9;
		road( 'minor', [
			lerp( bbox.south, bbox.north, u ),
			bbox.west,
			lerp( bbox.south, bbox.north, u ),
			bbox.east,
		] );
		road( 'minor', [
			bbox.south,
			lerp( bbox.west, bbox.east, u ),
			bbox.north,
			lerp( bbox.west, bbox.east, u ),
		] );
	}
	// Two primaries + a motorway diagonal.
	road( 'primary', [
		lerp( bbox.south, bbox.north, 0.42 ),
		bbox.west,
		lerp( bbox.south, bbox.north, 0.55 ),
		bbox.east,
	] );
	road( 'primary', [
		bbox.south,
		lerp( bbox.west, bbox.east, 0.62 ),
		bbox.north,
		lerp( bbox.west, bbox.east, 0.5 ),
	] );
	road( 'motorway', [
		bbox.south,
		bbox.west,
		bbox.north,
		bbox.east,
	] );
	// A river band.
	els.push( {
		k: 'waterline',
		c: 'river',
		g: [
			lerp( bbox.south, bbox.north, 0.2 ),
			bbox.west,
			lerp( bbox.south, bbox.north, 0.33 ),
			lerp( bbox.west, bbox.east, 0.5 ),
			lerp( bbox.south, bbox.north, 0.24 ),
			bbox.east,
		],
	} );
	// A park polygon.
	const p = ( su, wu ) => [
		lerp( bbox.south, bbox.north, su ),
		lerp( bbox.west, bbox.east, wu ),
	];
	els.push( {
		k: 'green',
		g: [
			...p( 0.6, 0.6 ),
			...p( 0.6, 0.82 ),
			...p( 0.8, 0.82 ),
			...p( 0.8, 0.6 ),
			...p( 0.6, 0.6 ),
		],
	} );
	return { els, n: els.length, truncated: false };
}

/**
 * Render poster variants side by side.
 * views: [{ theme, mapBg, elevation, markers, lineScale, routeColor,
 *           layout, label }]
 */
window.renderPosters = ( views, size ) => {
	const gpx = parseGpx( demoGpx() );
	const segments = simplifyTrack( gpx.segments );
	const stats = routeStats( gpx.segments );
	const bbox = routeBBox( segments );
	const out = document.createElement( 'canvas' );
	out.width = size * views.length;
	out.height = Math.round( size * 1.35 );
	const ctx = out.getContext( '2d' );
	views.forEach( ( v, i ) => {
		const theme =
			THEMES.find( ( th ) => th.id === ( v.theme || 'minimal' ) ) ||
			THEMES[ 0 ];
		const pal = paletteFor( theme, {} );
		const docW = size;
		const docH = Math.round( size * 1.35 );
		const x0 = i * size;
		ctx.fillStyle = pal.bg;
		ctx.fillRect( x0, 0, docW, docH );
		const mapSize = Math.round( docW * 0.86 );
		const mapX = x0 + Math.round( ( docW - mapSize ) / 2 );
		const mapY = Math.round( docH * 0.06 );
		const square = document.createElement( 'canvas' );
		square.width = mapSize;
		square.height = mapSize;
		drawRoutePoster( square.getContext( '2d' ), mapSize, {
			segments,
			bbox,
			theme,
			scene: v.mapBg ? buildScene( fakeMapData( bbox ) ) : null,
			routeColor: v.routeColor || pal.pin,
			lineScale: v.lineScale || 1,
			markers: v.markers !== false,
			elevation: v.elevation !== false,
			elePoints:
				v.elevation !== false ? elevationSeries( segments ) : null,
		} );
		ctx.drawImage( square, mapX, mapY );
		// Simple classic text block for the strip.
		const color = pal.text;
		ctx.fillStyle = color;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'top';
		let y = mapY + mapSize + Math.round( docH * 0.03 );
		ctx.font = `700 ${ Math.round( docW * 0.06 ) }px sans-serif`;
		ctx.fillText( 'OLDENBURG LOOP', x0 + docW / 2, y );
		y += Math.round( docW * 0.085 );
		ctx.fillStyle = v.routeColor || pal.pin;
		ctx.fillRect( x0 + docW / 2 - docW * 0.05, y, docW * 0.1, 4 );
		y += Math.round( docW * 0.03 );
		ctx.fillStyle = color;
		ctx.font = `600 ${ Math.round( docW * 0.024 ) }px sans-serif`;
		ctx.fillText(
			[
				fmtDistance( stats.distM ),
				fmtGain( stats.gainM ),
				fmtDuration( stats.durS ),
			]
				.join( '   ·   ' )
				.toUpperCase(),
			x0 + docW / 2,
			y
		);
		y += Math.round( docW * 0.036 );
		ctx.globalAlpha = 0.8;
		ctx.font = `400 ${ Math.round( docW * 0.017 ) }px sans-serif`;
		ctx.fillText( fmtDate( stats.startMs, 'de' ), x0 + docW / 2, y );
		ctx.globalAlpha = 1;
		// Label.
		ctx.fillStyle = '#e5484d';
		ctx.textAlign = 'left';
		ctx.font = '600 16px sans-serif';
		ctx.fillText( v.label || '', x0 + 12, 8 );
	} );
	return out.toDataURL( 'image/png' );
};

window.__ready = true;
