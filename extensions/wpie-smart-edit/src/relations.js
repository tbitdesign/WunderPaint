import { textRecords, groupIds, shapeSignature } from './engine.js';

const keyOf = ( value ) => JSON.stringify( value );
const typography = ( style, withSize = true ) => [
	style.family,
	...( withSize ? [ style.size ] : [] ),
	style.weight,
	style.italic,
	style.underline,
	style.strike,
	style.ls,
	style.lh,
];
const closeSize = ( a, b, factor = 1 ) =>
	Number.isFinite( a ) &&
	Number.isFinite( b ) &&
	Math.abs( a - b ) <= Math.max( 0.5, Math.abs( b ) * 0.02 ) * factor;

// Compare nearby solid colors in linear RGB, keeping both hue and brightness
// close. All matches are relative to the picked color, never a chained cluster.
const linearColor = ( hex ) =>
	[ 1, 3, 5 ].map( ( n ) => {
		const c = parseInt( hex.slice( n, n + 2 ), 16 ) / 255;
		return c <= 0.04045 ? c / 12.92 : ( ( c + 0.055 ) / 1.055 ) ** 2.4;
	} );
function closeColor( a, b, factor = 1 ) {
	const x = linearColor( a ),
		y = linearColor( b );
	return Math.hypot( ...x.map( ( c, i ) => c - y[ i ] ) ) <= 0.08 * factor;
}

/** Visual suggestions are derived from the original, scoped analysis. */
export function relatedFamilies( analysis, id, similarity = 'close' ) {
	const factor = similarity === 'broad' ? 3 : 1;
	const sample = analysis.eligible.find( ( layer ) => layer.id === id );
	if ( ! sample ) {
		return [];
	}
	const groups = [],
		seen = new Set();
	const add = ( group, relation ) => {
		const members = group.hits
			.map( ( h ) => [ h.id, h.start, h.end, h.shapeId ] )
			.sort( ( a, b ) => keyOf( a ).localeCompare( keyOf( b ) ) );
		const membership = keyOf( [
			group.kind,
			!! group.marker,
			group.colors || group.color,
			members,
		] );
		if ( ! group.hits.length || seen.has( membership ) ) {
			return;
		}
		seen.add( membership );
		groups.push( { ...group, relation } );
	};
	const derived = ( kind, relation, signature, hits ) =>
		add(
			{
				id:
					'related:' +
					kind +
					':' +
					relation +
					':' +
					signature +
					( relation.startsWith( 'Similar' )
						? ':' + similarity
						: '' ),
				similarity: relation.startsWith( 'Similar' )
					? similarity
					: null,
				kind,
				name: sample.type === 'text' ? sample.fontFamily : sample.shape,
				hits,
				variants: [],
				sample,
			},
			relation
		);
	const matching = analysis.families.filter( ( g ) =>
		groupIds( g ).includes( id )
	);
	for ( const family of matching ) {
		if ( ! [ 'text', 'shapes' ].includes( family.kind ) ) {
			continue;
		}
		for ( const variant of family.variants ) {
			if ( groupIds( variant ).includes( id ) ) {
				add(
					variant,
					family.kind === 'text'
						? 'Same text style'
						: 'Same shape style and size'
				);
			}
		}
	}
	if ( sample.type === 'text' ) {
		const records = analysis.eligible
			.filter( ( l ) => l.type === 'text' )
			.flatMap( textRecords );
		for ( const hit of textRecords( sample ) ) {
			const signature = keyOf( typography( hit.style ) );
			derived(
				'text',
				'Same typography',
				signature,
				records.filter(
					( h ) => keyOf( typography( h.style ) ) === signature
				)
			);
			const loose = keyOf( typography( hit.style, false ) );
			derived(
				'text',
				'Similar typography',
				signature,
				records.filter(
					( h ) =>
						keyOf( typography( h.style, false ) ) === loose &&
						closeSize( h.style.size, hit.style.size, factor )
				)
			);
			derived(
				'text',
				'Same font size',
				String( hit.style.size ),
				records.filter( ( h ) => h.style.size === hit.style.size )
			);
		}
	} else if ( sample.type === 'shape' ) {
		const appearance = ( layer ) => {
			const s = shapeSignature( layer );
			delete s.w;
			delete s.h;
			return keyOf( s );
		};
		const signature = appearance( sample );
		const peers = analysis.eligible.filter(
			( l ) => l.type === 'shape' && l.shape === sample.shape
		);
		derived(
			'shapes',
			'Same shape appearance',
			signature,
			peers
				.filter( ( l ) => appearance( l ) === signature )
				.map( ( l ) => ( { id: l.id } ) )
		);
		derived(
			'shapes',
			'Similar dimensions',
			keyOf( [ sample.shape, sample.w, sample.h ] ),
			peers
				.filter(
					( l ) =>
						closeSize( l.w, sample.w, factor ) &&
						closeSize( l.h, sample.h, factor )
				)
				.map( ( l ) => ( { id: l.id } ) )
		);
	}
	for ( const family of matching ) {
		add(
			family,
			{
				text: 'Same font',
				shapes: 'Same shape type',
				colors: 'Same color',
				elements: 'Related elements',
			}[ family.kind ]
		);
		if ( family.kind !== 'colors' ) {
			continue;
		}
		const colors = analysis.families.filter(
			( g ) =>
				g.kind === 'colors' &&
				closeColor(
					g.color,
					family.color,
					similarity === 'broad' ? 2 : 1
				)
		);
		if ( colors.length < 2 ) {
			continue;
		}
		const sources = colors.map( ( g ) => g.color ).sort();
		add(
			{
				id: 'related:colors:' + sources.join( ':' ),
				kind: 'colors',
				similarity,
				name: family.color,
				color: family.color,
				colors: sources,
				colorFamilies: colors,
				variants: [],
				sample,
				hits: [
					...new Map(
						colors
							.flatMap( ( g ) => g.hits )
							.map( ( h ) => [ h.id, h ] )
					).values(),
				],
			},
			'Similar colors'
		);
	}
	return groups;
}

/** Respect visible stacking: protected content must not reveal a layer below. */
export function objectAtPoint( layers, eligible, point ) {
	const byId = new Map( layers.map( ( l ) => [ l.id, l ] ) );
	for ( let i = layers.length - 1; i >= 0; i-- ) {
		const l = layers[ i ];
		if ( l.type === 'group' ) {
			continue;
		}
		let parent = l,
			hidden = false;
		const seen = new Set();
		while ( parent && ! seen.has( parent.id ) ) {
			seen.add( parent.id );
			hidden ||= parent.visible === false;
			parent = byId.get( parent.parent );
		}
		if ( hidden || parent ) {
			continue;
		}
		const angle = -( ( l.rot || 0 ) * Math.PI ) / 180;
		const dx = point.x - ( l.x + l.w / 2 ),
			dy = point.y - ( l.y + l.h / 2 );
		const x = dx * Math.cos( angle ) - dy * Math.sin( angle ),
			y = dx * Math.sin( angle ) + dy * Math.cos( angle );
		if ( ! ( Math.abs( x ) <= l.w / 2 && Math.abs( y ) <= l.h / 2 ) ) {
			continue;
		}
		if (
			[ 'ellipse', 'circle' ].includes( l.shape ) &&
			( x / ( l.w / 2 ) ) ** 2 + ( y / ( l.h / 2 ) ) ** 2 > 1
		) {
			continue;
		}
		return eligible.has( l.id ) ? l.id : null;
	}
	return null;
}
