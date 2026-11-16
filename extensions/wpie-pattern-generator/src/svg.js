import { tileShapes, bgColor } from './pattern-core.js';
import { shapeBounds, wrapOffsets } from './tile-geometry.js';
const f = ( n ) => Number( n.toFixed( 4 ) );
const safeData = ( s ) =>
	/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test( s || '' );
export function toSvgTile( P, cellPx = 256, legacyStamp = null ) {
	const { shapes, cols, rows } = tileShapes( P ),
		aspect =
			Math.max( 2, Math.round( cols * cellPx * ( P.aspect || 1 ) ) ) /
			( cols * cellPx ),
		W = Math.max( 2, Math.round( cols * cellPx * ( P.aspect || 1 ) ) ),
		H = rows * cellPx;
	const parts = [
		`<svg xmlns="http://www.w3.org/2000/svg" width="${ W }" height="${ H }" viewBox="0 0 ${ W } ${ H }"><defs><clipPath id="tile"><rect width="${ W }" height="${ H }"/></clipPath>`,
	];
	const stamps = new Map();
	for ( const s of shapes )
		if ( s.kind === 'img' ) {
			const href = s.href || legacyStamp?.href;
			if ( safeData( href ) && ! stamps.has( href ) )
				stamps.set( href, {
					id:
						legacyStamp && href === legacyStamp.href
							? 'pgstamp'
							: 'pgstamp' + stamps.size,
					aspect: s.href ? s.aspect : legacyStamp.aspect,
				} );
		}
	for ( const [ href, item ] of stamps )
		parts.push(
			`<image id="${ item.id }" href="${ href }" x="-0.5" y="${ f(
				-item.aspect / 2
			) }" width="1" height="${ f(
				item.aspect
			) }" preserveAspectRatio="none"/>`
		);
	parts.push( '</defs>' );
	const bg = bgColor( P );
	if ( bg )
		parts.push( `<rect width="${ W }" height="${ H }" fill="${ bg }"/>` );
	parts.push(
		`<g clip-path="url(#tile)"><g transform="scale(${ aspect } 1)">`
	);
	for ( const s of shapes ) {
		const item =
			s.kind === 'img' ? stamps.get( s.href || legacyStamp?.href ) : null;
		if ( s.kind === 'img' && ! item ) continue;
		for ( const [ ox, oy ] of wrapOffsets(
			shapeBounds( s, item?.aspect ),
			cols,
			rows
		) ) {
			if ( item ) {
				parts.push(
					`<use href="#${ item.id }" transform="translate(${ f(
						( s.x + ox ) * cellPx
					) } ${ f( ( s.y + oy ) * cellPx ) }) rotate(${ f(
						( ( s.rot || 0 ) * 180 ) / Math.PI
					) }) scale(${ f( s.s * cellPx * ( s.fx ? -1 : 1 ) ) } ${ f(
						s.s * cellPx * ( s.fy ? -1 : 1 )
					) })" opacity="${ f( s.opacity ) }"/>`
				);
				continue;
			}
			const d =
				s.points
					.map(
						( p, i ) =>
							( i ? 'L' : 'M' ) +
							f( ( p.x + ox ) * cellPx ) +
							' ' +
							f( ( p.y + oy ) * cellPx )
					)
					.join( '' ) + ( s.closed ? 'Z' : '' );
			const lw = s.width * cellPx,
				dash =
					s.dash === 'dash'
						? `${ f( lw * 3.2 ) } ${ f( lw * 2.4 ) }`
						: s.dash === 'dot'
						? `0.5 ${ f( lw * 2.6 ) }`
						: '';
			parts.push(
				`<path d="${ d }" fill="${ s.fill || 'none' }"${
					s.fill
						? ''
						: ` stroke="${ s.color }" stroke-width="${ f(
								lw
						  ) }" stroke-linecap="round" stroke-linejoin="round"${
								dash ? ` stroke-dasharray="${ dash }"` : ''
						  }`
				} opacity="${ f( s.opacity ) }"/>`
			);
		}
	}
	parts.push( '</g></g></svg>' );
	return parts.join( '' );
}
