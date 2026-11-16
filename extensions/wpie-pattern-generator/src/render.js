/** Canvas rendering and bounded decoded-stamp cache. No rendering while idle. */
import { tileShapes, expandPlaces, bgColor } from './pattern-core.js';
import { shapeBounds, wrapOffsets } from './tile-geometry.js';
const cache = new Map(),
	pending = new Map();
export const stampImage = ( data ) => cache.get( data ) || null;
export function ensureStamp( data ) {
	if ( ! data ) return Promise.resolve( null );
	if ( cache.has( data ) ) return Promise.resolve( cache.get( data ) );
	if ( pending.has( data ) ) return pending.get( data );
	const promise = new Promise( ( resolve ) => {
		const img = new Image();
		img.onload = () => {
			cache.set( data, img );
			while ( cache.size > 48 ) cache.delete( cache.keys().next().value );
			pending.delete( data );
			resolve( img );
		};
		img.onerror = () => {
			pending.delete( data );
			resolve( null );
		};
		img.src = data;
	} );
	pending.set( data, promise );
	return promise;
}
export async function ensureStamps( P ) {
	const layers = P.layers || [ P ],
		sources = new Set();
	for ( const l of layers ) {
		if ( l.stampData ) sources.add( l.stampData );
		for ( const s of l.stamps || [] ) if ( s.data ) sources.add( s.data );
	}
	const images = await Promise.all( [ ...sources ].map( ensureStamp ) );
	for ( const l of layers )
		if ( l.stampData && ! l.stamps?.length ) {
			const img = stampImage( l.stampData );
			if ( img ) {
				l.stamps = [
					{
						name: 'Stamp',
						data: l.stampData,
						aspect: img.height / Math.max( 1, img.width ),
					},
				];
				l.stampData = '';
			}
		}
	return images;
}
export function paintTile( ctx, P, cellPx ) {
	const { shapes, cols, rows } = tileShapes( P ),
		aspect =
			Math.max( 2, Math.round( cols * cellPx * ( P.aspect || 1 ) ) ) /
			( cols * cellPx );
	ctx.clearRect( 0, 0, cols * cellPx * aspect, rows * cellPx );
	const bg = bgColor( P );
	if ( bg ) {
		ctx.fillStyle = bg;
		ctx.fillRect( 0, 0, cols * cellPx * aspect, rows * cellPx );
	}
	ctx.save();
	ctx.scale( aspect, 1 );
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	for ( const s of shapes ) {
		const img =
			s.kind === 'img'
				? stampImage( s.href || s.legacyHref || P.stampData )
				: null;
		if ( s.kind === 'img' && ! img ) continue;
		const ratio = img ? img.height / Math.max( 1, img.width ) : 1;
		const bounds = shapeBounds( s, ratio );
		ctx.globalAlpha = s.opacity;
		let outline;
		if ( ! img ) {
			outline = new Path2D();
			s.points.forEach( ( p, i ) => {
				if ( i ) outline.lineTo( p.x * cellPx, p.y * cellPx );
				else outline.moveTo( p.x * cellPx, p.y * cellPx );
			} );
			if ( s.closed ) outline.closePath();
		}
		for ( const [ ox, oy ] of wrapOffsets( bounds, cols, rows ) ) {
			ctx.save();
			ctx.translate( ox * cellPx, oy * cellPx );
			if ( img ) {
				ctx.translate( s.x * cellPx, s.y * cellPx );
				ctx.rotate( s.rot || 0 );
				ctx.scale( s.fx ? -1 : 1, s.fy ? -1 : 1 );
				const w = s.s * cellPx;
				ctx.drawImage( img, -w / 2, ( -w * ratio ) / 2, w, w * ratio );
			} else if ( s.fill ) {
				ctx.fillStyle = s.fill;
				ctx.fill( outline );
			} else {
				const lw = s.width * cellPx;
				ctx.strokeStyle = s.color;
				ctx.lineWidth = lw;
				ctx.setLineDash(
					s.dash === 'dash'
						? [ lw * 3.2, lw * 2.4 ]
						: s.dash === 'dot'
						? [ 0.5, lw * 2.6 ]
						: []
				);
				ctx.stroke( outline );
			}
			ctx.restore();
		}
	}
	ctx.restore();
}
export function renderTile( P, cellPx ) {
	const { cols, rows } = expandPlaces( P.repeat );
	const c = document.createElement( 'canvas' );
	c.width = Math.max( 2, Math.round( cols * cellPx * ( P.aspect || 1 ) ) );
	c.height = Math.max( 2, Math.round( rows * cellPx ) );
	paintTile( c.getContext( '2d' ), P, cellPx );
	return c;
}
