/**
 * Compute the exact fetch box the studio requests on a fresh open at the
 * default place (Oldenburg, radius 4500, square viewport), mirroring
 * fetchPlan() in src/main.js. The printed JSON is combined with the
 * server's map payload into oldenburg.json - see README "Bundled seed".
 *
 *   node tools/build-seed.mjs
 */

import { viewportBBox, detailForRadius } from '../src/map-engine.js';

const CENTER = { lat: 53.1435, lon: 8.2146 };
const RADIUS = 4500;
const SPAN_CAPS = { 1: 4.0, 2: 0.55, 3: 0.06 };

const vp = viewportBBox( CENTER, RADIUS, 1 );
const detail = detailForRadius( RADIUS );
const latSpan = vp.north - vp.south;
const lonSpan = vp.east - vp.west;
const midCos = Math.max(
	0.05,
	Math.cos( ( ( ( vp.south + vp.north ) / 2 ) * Math.PI ) / 180 )
);
const cap = SPAN_CAPS[ detail ] * 0.98;
const halfLat = Math.min( latSpan * 1.6, cap ) / 2;
const halfLon = Math.min( lonSpan * 1.6, cap / midCos ) / 2;
let cLat = CENTER.lat;
let cLon = CENTER.lon;
if ( halfLat > latSpan * 0.62 ) {
	const grid = latSpan / 4;
	cLat = Math.round( cLat / grid ) * grid;
	cLon = Math.round( cLon / ( grid / midCos ) ) * ( grid / midCos );
}
let bbox = {
	south: cLat - halfLat,
	north: cLat + halfLat,
	west: cLon - halfLon,
	east: cLon + halfLon,
};
const contains = ( o, v ) =>
	v.south >= o.south - 1e-9 &&
	v.north <= o.north + 1e-9 &&
	v.west >= o.west - 1e-9 &&
	v.east <= o.east + 1e-9;
if ( ! contains( bbox, vp ) ) {
	bbox = {
		south: CENTER.lat - halfLat,
		north: CENTER.lat + halfLat,
		west: CENTER.lon - halfLon,
		east: CENTER.lon + halfLon,
	};
}
process.stdout.write( JSON.stringify( { bbox, detail } ) );
