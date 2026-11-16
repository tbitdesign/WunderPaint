/** Recognition is read-only. Every operation addresses the original layer IDs/runs. */
import { textRuns, resolveStyle } from '../../../src/lib/rich-text.js';
import {
	colorKey,
	recolor,
	scanColors,
	replaceColorMap,
} from '../../../src/lib/color-replace.js';
import {
	detachPatchedColorLinks,
	syncColorLinks,
} from '../../../src/lib/color-links.js';
import { syncRepeatLayers } from '../../../src/store/repeat-sync.js';
import { layerStylePatch } from '../../../src/lib/layer-style.js';

const stable = ( value ) => {
	if ( Array.isArray( value ) ) {
		return value.map( stable );
	}
	if ( value && typeof value === 'object' ) {
		return Object.fromEntries(
			Object.keys( value )
				.sort()
				.map( ( key ) => [ key, stable( value[ key ] ) ] )
		);
	}
	return value;
};
const keyOf = ( value ) => JSON.stringify( stable( value ) );
const color = ( value ) => {
	const c = colorKey( value );
	return c ? [ c.key, c.alpha ] : value || null;
};
const round = ( value ) => Math.round( ( +value || 0 ) * 100 ) / 100;
export const displaySize = ( layer ) =>
	`${ round( layer.w ) } × ${ round( layer.h ) } px`;

export function footprint( layer ) {
	const w = Math.max( 0, +layer.w || 0 ),
		h = Math.max( 0, +layer.h || 0 );
	const a = ( ( +layer.rot || 0 ) * Math.PI ) / 180;
	const rw = w * Math.abs( Math.cos( a ) ) + h * Math.abs( Math.sin( a ) );
	const rh = h * Math.abs( Math.cos( a ) ) + w * Math.abs( Math.sin( a ) );
	return {
		x: ( +layer.x || 0 ) + ( w - rw ) / 2,
		y: ( +layer.y || 0 ) + ( h - rh ) / 2,
		w: rw,
		h: rh,
	};
}

export function bounds( layers ) {
	if ( ! layers.length ) {
		return null;
	}
	const boxes = layers.map( footprint );
	const x = Math.min( ...boxes.map( ( b ) => b.x ) ),
		y = Math.min( ...boxes.map( ( b ) => b.y ) );
	return {
		x,
		y,
		w: Math.max( ...boxes.map( ( b ) => b.x + b.w ) ) - x,
		h: Math.max( ...boxes.map( ( b ) => b.y + b.h ) ) - y,
	};
}

/** Ancestors remain part of eligibility even when the user scopes to a child. */
export function editableScope( layers, selected = null ) {
	const byId = new Map( layers.map( ( l ) => [ l.id, l ] ) );
	const roots = selected && new Set( selected );
	const skipped = { protected: 0, raster: 0 };
	const eligible = layers.filter( ( layer ) => {
		let current = layer,
			inScope = ! roots,
			blocked = false;
		const seen = new Set();
		while ( current && ! seen.has( current.id ) ) {
			seen.add( current.id );
			inScope ||= !! roots?.has( current.id );
			blocked ||=
				current.locked ||
				current.visible === false ||
				!! current.generator ||
				current.type === 'smart';
			current = byId.get( current.parent );
		}
		if ( current ) {
			blocked = true;
		}
		if ( ! inScope || layer.type === 'group' ) {
			return false;
		}
		if ( blocked ) {
			skipped.protected++;
			return false;
		}
		if (
			! [ 'text', 'shape', 'gradient' ].includes( layer.type ) ||
			layer.useRasterFallback
		) {
			skipped.raster++;
			return false;
		}
		return true;
	} );
	return { eligible, skipped };
}

const appearance = ( l ) => ( {
	opacity: l.opacity ?? 1,
	blend: l.blend || 'normal',
	styles: l.styles || null,
	fillType:
		l.fillType ||
		( l.pattern && l.pattern !== 'none' ? 'pattern' : 'solid' ),
	gradient: l.gradientStops || null,
	gradientKind: l.gradientKind || null,
	pattern: l.pattern || null,
	patternData: l.patternData || null,
	outline: [ color( l.outlineColor ), l.outlineW || 0 ],
	strokeGradient: l.strokeGradient || null,
	shadow: l.shadowOn ? color( l.shadowColor ) : null,
	textFX: l.textFX || null,
	textFit: l.textFit || null,
} );

export function textRecords( layer ) {
	let start = 0;
	return textRuns( layer ).map( ( run ) => {
		const s = resolveStyle( layer, run.s );
		const style = {
			family: s.family,
			size: s.size,
			weight: s.weight,
			italic: s.italic,
			underline: s.underline,
			strike: s.strike,
			color: run.s?.color || layer.color || '#000000',
			ls: s.ls,
			lh: s.lineHeight / s.size,
			mark: s.mark,
		};
		const hit = {
			id: layer.id,
			start,
			end: start + run.text.length,
			text: run.text,
			style,
			ownColor: !! run.s?.color,
		};
		start = hit.end;
		return hit;
	} );
}

export function shapeSignature( l ) {
	return {
		shape: l.shape,
		w: l.w,
		h: l.h,
		radius: l.radius || 0,
		fill: color( l.fill ),
		stroke: color( l.stroke ),
		strokeW: l.strokeW || 0,
		strokeAlign: l.strokeAlign || 'center',
		strokeDash: l.strokeDash || 'solid',
		sides: l.sides,
		params: l.shapeParams,
		path: l.pathD,
		...appearance( l ),
	};
}

const contains = ( b, p ) =>
	p.x >= b.x &&
	p.y >= b.y &&
	p.x + p.w <= b.x + b.w &&
	p.y + p.h <= b.y + b.h;
export const canResize = ( l ) =>
	! l.pathD && ! l.freeform && ! l.mesh && ! l.quad;
const simpleText = ( t ) =>
	! t.rot &&
	! t.quad &&
	! t.binding &&
	! t.textTransform &&
	! t.textPath &&
	! t.shapeBox &&
	! t.curve &&
	! t.textFit &&
	! t.textFX?.warp &&
	! t.mask &&
	! t.spans?.length &&
	! t.lineStyles?.some( Boolean ) &&
	! /\n|\{\{/.test( String( t.text ) );
const plate = ( s ) =>
	s.type === 'shape' &&
	[ 'rect', 'ellipse', 'circle', 'roundrect', 'roundedRect' ].includes(
		s.shape
	) &&
	! s.rot &&
	! s.mask &&
	canResize( s );

/** Conservative relationships: same parent, nearest visible plate, one simple label. */
export function detectElements( layers, eligible ) {
	const allowed = new Set( eligible.map( ( l ) => l.id ) );
	const boxes = new Map( layers.map( ( l ) => [ l.id, footprint( l ) ] ) );
	const plates = layers.filter( ( l ) => allowed.has( l.id ) && plate( l ) );
	if ( ! plates.length ) {
		return [];
	}
	const pairs = [];
	for ( let j = 0; j < layers.length; j++ ) {
		const text = layers[ j ];
		if (
			! allowed.has( text.id ) ||
			text.type !== 'text' ||
			! simpleText( text ) ||
			! String( text.text ).trim() ||
			String( text.text ).length > 80
		) {
			continue;
		}
		const b = boxes.get( text.id ),
			center = { x: b.x + b.w / 2, y: b.y + b.h / 2, w: 0, h: 0 };
		if (
			! plates.some(
				( p ) =>
					p.parent === text.parent && contains( boxes.get( p.id ), b )
			)
		) {
			continue;
		}
		for ( let i = j - 1; i >= 0; i-- ) {
			const shape = layers[ i ];
			if (
				shape.visible === false ||
				shape.type === 'group' ||
				! contains( boxes.get( shape.id ), center )
			) {
				continue;
			}
			if (
				allowed.has( shape.id ) &&
				plate( shape ) &&
				shape.parent === text.parent &&
				contains( boxes.get( shape.id ), b ) &&
				shape.w * shape.h <= Math.max( 1, b.w * b.h ) * 12
			) {
				const occupants = eligible.filter(
					( l ) =>
						l.type === 'text' &&
						l.parent === shape.parent &&
						contains( boxes.get( shape.id ), boxes.get( l.id ) )
				);
				if ( occupants.length === 1 ) {
					pairs.push( { shapeId: shape.id, textId: text.id } );
				}
			}
			break;
		}
	}
	return pairs;
}

export function analyze( layers, doc, selected = null ) {
	const { eligible, skipped } = editableScope( layers, selected );
	const byId = new Map( layers.map( ( l ) => [ l.id, l ] ) );
	const families = [],
		index = new Map(),
		variants = new Map();
	const add = ( kind, name, variantKey, hit, sample ) => {
		const familyKey = kind + ':' + name;
		let family = index.get( familyKey );
		if ( ! family ) {
			family = {
				id: 'f' + families.length,
				kind,
				name,
				variants: [],
				hits: [],
				sample,
			};
			index.set( familyKey, family );
			families.push( family );
		}
		const indexKey = familyKey + ':' + variantKey;
		let variant = variants.get( indexKey );
		if ( ! variant ) {
			variant = {
				id: family.id + 'v' + family.variants.length,
				key: variantKey,
				kind,
				name,
				sample,
				hits: [],
				parentId: family.id,
			};
			family.variants.push( variant );
			variants.set( indexKey, variant );
		}
		variant.hits.push( hit );
		family.hits.push( hit );
	};
	for ( const layer of eligible ) {
		if ( layer.type === 'text' ) {
			if ( ! String( layer.text || '' ).trim() ) {
				continue;
			}
			for ( const hit of textRecords( layer ) ) {
				if ( ! hit.text.length ) {
					continue;
				}
				add(
					'text',
					hit.style.family,
					keyOf( {
						...hit.style,
						color: color( hit.style.color ),
						appearance: appearance( layer ),
					} ),
					hit,
					layer
				);
			}
		} else if ( layer.type === 'shape' ) {
			add(
				'shapes',
				layer.shape || 'rect',
				keyOf( shapeSignature( layer ) ),
				{ id: layer.id },
				layer
			);
		}
	}
	for ( const entry of scanColors( eligible, selected ? null : doc )
		.colors ) {
		const hits = entry.layerIds.map( ( id ) => ( { id } ) );
		if ( entry.kinds.includes( 'background' ) ) {
			hits.push( { id: '@document' } );
		}
		families.push( {
			id: 'c' + entry.key,
			kind: 'colors',
			name: entry.key,
			hits,
			variants: [],
			sample: byId.get( entry.layerIds[ 0 ] ),
			color: entry.key,
			kinds: entry.kinds,
		} );
	}
	const pairs = detectElements( layers, eligible );
	for ( const pair of pairs ) {
		const shape = byId.get( pair.shapeId ),
			text = byId.get( pair.textId );
		add(
			'elements',
			'Labels and backgrounds',
			keyOf( {
				shape: shapeSignature( shape ),
				text: textRecords( text )[ 0 ].style,
			} ),
			{ id: text.id, ...pair },
			text
		);
		// Numeric grids offer a highlight transfer only when ordinary peers agree.
		if (
			! /^\d{1,2}$/.test( text.text.trim() ) ||
			! colorKey( text.color ) ||
			( text.fillType && text.fillType !== 'solid' )
		) {
			continue;
		}
		const sourceStyle = textRecords( text )[ 0 ].style;
		const peers = eligible.filter( ( l ) => {
			if (
				l.type !== 'text' ||
				! simpleText( l ) ||
				l.parent !== text.parent ||
				! /^\d{1,2}$/.test( l.text.trim() ) ||
				layers.indexOf( l ) <= layers.indexOf( shape ) ||
				! colorKey( l.color ) ||
				( l.fillType && l.fillType !== 'solid' )
			) {
				return false;
			}
			const s = textRecords( l )[ 0 ].style;
			return (
				s.family === sourceStyle.family &&
				s.size === sourceStyle.size &&
				s.weight === sourceStyle.weight &&
				s.italic === sourceStyle.italic &&
				Math.abs( l.h - text.h ) <= 2
			);
		} );
		if (
			peers.length < 4 ||
			new Set( peers.map( ( p ) => p.text.trim() ) ).size !== peers.length
		) {
			continue;
		}
		const ordinary = peers.filter( ( p ) => p.id !== text.id );
		const plain = new Set(
			ordinary.map( ( p ) => keyOf( color( p.color ) ) )
		);
		if (
			plain.size !== 1 ||
			keyOf( color( ordinary[ 0 ].color ) ) ===
				keyOf( color( text.color ) )
		) {
			continue;
		}
		// A row/grid, not an arbitrary scatter of unrelated numbers.
		const rows = new Map();
		for ( const p of peers ) {
			const y = Math.round( p.y / Math.max( 2, p.h / 3 ) );
			rows.set( y, ( rows.get( y ) || 0 ) + 1 );
		}
		if ( Math.max( ...rows.values() ) < 3 ) {
			continue;
		}
		families.push( {
			id: 'm' + shape.id,
			kind: 'elements',
			name: 'Highlight',
			variants: [],
			hits: peers.map( ( p ) => ( { id: p.id } ) ),
			sample: text,
			marker: {
				...pair,
				normalColor: ordinary[ 0 ].color,
				foreground: text.color,
				peers: peers.map( ( p ) => p.id ),
			},
		} );
	}
	return {
		families,
		catalog: buildCatalog( families, layers ),
		eligible,
		skipped,
	};
}

/* ------------------------------- the catalog ------------------------------ */
// The catalog is the document the way a designer reads it: text by its role,
// colors as families of lighter and darker tones, shapes by how they look.
// `families` stay the data-level groups (fonts, shape types, single colors)
// that explorations and relations build on; both edit through plan().

export const TEXT_ROLES = [
	'Headlines',
	'Subheadings',
	'Body text',
	'Small text',
];
// More variations than this is a list of objects, not a choice.
const VARIANT_LIMIT = 10;

/** The size most of the reading happens in: the one with the most letters. */
export function bodySize( records ) {
	const letters = new Map();
	for ( const r of records ) {
		const size = Math.round( r.style.size * 2 ) / 2;
		letters.set(
			size,
			( letters.get( size ) || 0 ) + r.text.replace( /\s/g, '' ).length
		);
	}
	let best = null;
	for ( const [ size, n ] of letters ) {
		if ( ! best || n > best.n || ( n === best.n && size < best.size ) ) {
			best = { size, n };
		}
	}
	return best ? best.size : 0;
}

/** A text's role from its size against the body size. */
export function textRole( size, body ) {
	const ratio = body > 0 ? size / body : 1;
	if ( ratio >= 1.6 ) {
		return 'Headlines';
	}
	if ( ratio >= 1.15 ) {
		return 'Subheadings';
	}
	if ( ratio > 0.87 ) {
		return 'Body text';
	}
	return 'Small text';
}

const hexHsl = ( hex ) => {
	const [ r, g, b ] = [ 1, 3, 5 ].map(
		( i ) => parseInt( hex.slice( i, i + 2 ), 16 ) / 255
	);
	const mx = Math.max( r, g, b ),
		mn = Math.min( r, g, b ),
		l = ( mx + mn ) / 2;
	let h = 0,
		s = 0;
	if ( mx !== mn ) {
		const d = mx - mn;
		s = l > 0.5 ? d / ( 2 - mx - mn ) : d / ( mx + mn );
		h =
			mx === r
				? ( g - b ) / d + ( g < b ? 6 : 0 )
				: mx === g
				? ( b - r ) / d + 2
				: ( r - g ) / d + 4;
		h *= 60;
	}
	return [ h, s, l ];
};
const hslHex = ( h, s, l ) => {
	h = ( ( h % 360 ) + 360 ) % 360;
	const c = ( 1 - Math.abs( 2 * l - 1 ) ) * s,
		x = c * ( 1 - Math.abs( ( ( h / 60 ) % 2 ) - 1 ) ),
		m = l - c / 2;
	const [ r, g, b ] =
		h < 60
			? [ c, x, 0 ]
			: h < 120
			? [ x, c, 0 ]
			: h < 180
			? [ 0, c, x ]
			: h < 240
			? [ 0, x, c ]
			: h < 300
			? [ x, 0, c ]
			: [ c, 0, x ];
	return (
		'#' +
		[ r, g, b ]
			.map( ( v ) =>
				Math.round( Math.min( 1, Math.max( 0, v + m ) ) * 255 )
					.toString( 16 )
					.padStart( 2, '0' )
			)
			.join( '' )
	);
};
const solidHex = ( value ) => /^#[0-9a-f]{6}$/i.test( String( value ) );

/**
 * A tone moved along with its family: the family's base color becomes the
 * target, and every other tone keeps its distance in hue, saturation and
 * lightness, so lighter tones stay lighter and darker ones darker.
 *
 * @param {string} tone   This tone (#rrggbb).
 * @param {string} base   The family's base color (#rrggbb).
 * @param {string} target The chosen new base (#rrggbb or #rrggbbaa).
 * @return {string} The tone's new color.
 */
export function shiftTone( tone, base, target ) {
	const alpha = /^#[0-9a-f]{8}$/i.test( String( target ) )
		? target.slice( 7 )
		: '';
	const to = String( target ).slice( 0, 7 );
	if ( tone === base || ! solidHex( tone ) || ! solidHex( base ) ) {
		return to + alpha;
	}
	const [ th, ts, tl ] = hexHsl( tone ),
		[ bh, bs, bl ] = hexHsl( base ),
		[ nh, ns, nl ] = hexHsl( to );
	const s = bs > 0.05 ? ts * ( ns / bs ) : ns;
	return (
		hslHex(
			nh + ( th - bh ),
			Math.min( 1, Math.max( 0, s ) ),
			Math.min( 1, Math.max( 0, nl + ( tl - bl ) ) )
		) + alpha
	);
}

const linear = ( hex ) =>
	[ 1, 3, 5 ].map( ( n ) => {
		const c = parseInt( hex.slice( n, n + 2 ), 16 ) / 255;
		return c <= 0.04045 ? c / 12.92 : ( ( c + 0.055 ) / 1.055 ) ** 2.4;
	} );
const nearColor = ( a, b ) => {
	const x = linear( a ),
		y = linear( b );
	return Math.hypot( ...x.map( ( c, i ) => c - y[ i ] ) ) <= 0.08;
};
const chromatic = ( hex ) => {
	const [ , s, l ] = hexHsl( hex );
	return s >= 0.15 && l > 0.06 && l < 0.96;
};

/** Colors that are tones of one another: one hue, or near-identical greys. */
function toneGroups( colorFamilies ) {
	const groups = [];
	const ordered = [ ...colorFamilies ].sort(
		( a, b ) => b.hits.length - a.hits.length
	);
	for ( const family of ordered ) {
		const hex = family.color;
		const home = solidHex( hex )
			? groups.find( ( g ) => {
					if ( ! solidHex( g.base ) ) {
						return false;
					}
					if ( chromatic( hex ) && chromatic( g.base ) ) {
						const d = Math.abs( hexHsl( hex )[ 0 ] - g.hue );
						return Math.min( d, 360 - d ) <= 15;
					}
					return (
						! chromatic( hex ) &&
						! chromatic( g.base ) &&
						nearColor( hex, g.base )
					);
			  } )
			: null;
		if ( home ) {
			home.members.push( family );
		} else {
			groups.push( {
				base: hex,
				hue: solidHex( hex ) ? hexHsl( hex )[ 0 ] : 0,
				members: [ family ],
			} );
		}
	}
	return groups;
}

/**
 * Build the catalog from an analysis.
 *
 * @param {Array} families The data-level families of analyze().
 * @param {Array} layers   The document's layers.
 * @return {Array} Catalog families, ready for the dialog and for plan().
 */
export function buildCatalog( families, layers ) {
	const byId = new Map( layers.map( ( l ) => [ l.id, l ] ) );
	const out = [];
	const members = ( hits ) => new Set( hits.map( ( h ) => h.id ) ).size;
	// Text styles inside a role are a real choice even one by one; sizes
	// of a shape only when some size repeats, else they are just objects.
	const withVariants = ( family, keyed, needRepeat = false ) => {
		const variants = [ ...keyed.values() ];
		family.variants =
			variants.length > 1 &&
			variants.length <= VARIANT_LIMIT &&
			( ! needRepeat || variants.some( ( v ) => members( v.hits ) > 1 ) )
				? variants.map( ( v, i ) => ( {
						...v,
						id: family.id + 'v' + i,
						parentId: family.id,
				  } ) )
				: [];
		return family;
	};

	// Text by role. Variations are the exact styles inside a role.
	const texts = families.filter( ( f ) => f.kind === 'text' );
	const body = bodySize( texts.flatMap( ( f ) => f.hits ) );
	const roles = new Map();
	for ( const family of texts ) {
		for ( const variant of family.variants ) {
			for ( const hit of variant.hits ) {
				const role = textRole( hit.style.size, body );
				if ( ! roles.has( role ) ) {
					roles.set( role, {
						family: {
							id: 'role:' + role,
							kind: 'text',
							name: role,
							role: true,
							hits: [],
							variants: [],
							sample: variant.sample,
						},
						keyed: new Map(),
					} );
				}
				const entry = roles.get( role );
				entry.family.hits.push( hit );
				if ( ! entry.keyed.has( variant.key ) ) {
					entry.keyed.set( variant.key, {
						key: variant.key,
						kind: 'text',
						name: variant.name,
						sample: variant.sample,
						hits: [],
					} );
				}
				entry.keyed.get( variant.key ).hits.push( hit );
			}
		}
	}
	for ( const role of TEXT_ROLES ) {
		if ( roles.has( role ) ) {
			const { family, keyed } = roles.get( role );
			out.push( withVariants( family, keyed ) );
		}
	}

	// Shapes by how they look; their size is something to change, not a
	// reason to split them up.
	const looks = new Map();
	for ( const family of families.filter( ( f ) => f.kind === 'shapes' ) ) {
		for ( const hit of family.hits ) {
			const layer = byId.get( hit.id );
			if ( ! layer ) {
				continue;
			}
			// Form, corners, whether there is an outline, and effects - not
			// size, color, outline width or opacity: those are what one
			// changes together. Colors have a catalog of their own, and the
			// same cards in three accent colors are still the same cards.
			const look = shapeSignature( layer );
			for ( const key of [
				'w',
				'h',
				'path',
				'params',
				'sides',
				'fill',
				'stroke',
				'gradient',
				'gradientKind',
				'pattern',
				'patternData',
				'strokeGradient',
				'fillType',
				'strokeW',
				'opacity',
			] ) {
				delete look[ key ];
			}
			look.outline = !! ( layer.strokeW && layer.stroke );
			const key = keyOf( look );
			if ( ! looks.has( key ) ) {
				looks.set( key, {
					family: {
						id: 'look:' + looks.size,
						kind: 'shapes',
						name: layer.pathD ? 'path' : layer.shape || 'rect',
						look: true,
						hits: [],
						variants: [],
						sample: layer,
					},
					keyed: new Map(),
				} );
			}
			const entry = looks.get( key );
			entry.family.hits.push( hit );
			const size = `${ round( layer.w ) }x${ round( layer.h ) }`;
			if ( ! entry.keyed.has( size ) ) {
				entry.keyed.set( size, {
					key: size,
					kind: 'shapes',
					name: entry.family.name,
					sample: layer,
					hits: [],
				} );
			}
			entry.keyed.get( size ).hits.push( hit );
		}
	}
	for ( const { family, keyed } of looks.values() ) {
		out.push( withVariants( family, keyed, true ) );
	}

	// Colors as families of tones; each single color stays reachable as a
	// variation.
	toneGroups( families.filter( ( f ) => f.kind === 'colors' ) ).forEach(
		( group, i ) => {
			const tones = [ ...group.members ].sort(
				( a, b ) =>
					( solidHex( b.color ) ? hexHsl( b.color )[ 2 ] : 0 ) -
					( solidHex( a.color ) ? hexHsl( a.color )[ 2 ] : 0 )
			);
			if ( 1 === tones.length ) {
				out.push( tones[ 0 ] );
				return;
			}
			const id = 'tones:' + i;
			out.push( {
				id,
				kind: 'colors',
				name: group.base,
				color: group.base,
				tones: tones.map( ( t ) => ( { ...t, parentId: id } ) ),
				variants: tones.map( ( t ) => ( { ...t, parentId: id } ) ),
				hits: [
					...new Map(
						tones
							.flatMap( ( t ) => t.hits )
							.map( ( h ) => [ h.id, h ] )
					).values(),
				],
				sample: group.members[ 0 ].sample,
				kinds: [
					...new Set( tones.flatMap( ( t ) => t.kinds || [] ) ),
				],
			} );
		}
	);

	// Labels, backgrounds and highlights are already designer-sized.
	out.push( ...families.filter( ( f ) => f.kind === 'elements' ) );
	return out;
}

export function groupIds( group, excluded = new Set() ) {
	return [
		...new Set(
			group.hits.flatMap( ( h ) =>
				excluded.has( h.id )
					? []
					: [ h.id, ...( h.shapeId ? [ h.shapeId ] : [] ) ]
			)
		),
	];
}

const TEXT_KEYS = {
	family: 'fontFamily',
	size: 'fontSize',
	weight: 'weight',
	italic: 'italic',
	underline: 'underline',
	strike: 'strike',
	color: 'color',
	ls: 'letterSpacing',
	lh: 'lineHeight',
};
/** Relative values are evaluated per original member on each preview pass. */
export function changeNumber( value, original ) {
	if ( value && typeof value === 'object' ) {
		if (
			! Number.isFinite( value.value ) ||
			! Number.isFinite( original )
		) {
			return null;
		}
		if ( value.value === 0 ) {
			return null;
		}
		if ( value.mode === 'add' ) {
			return original + value.value;
		}
		if ( value.mode === 'percent' ) {
			return original * ( 1 + value.value / 100 );
		}
		return null;
	}
	return ( typeof value === 'number' ||
		( typeof value === 'string' && value.trim() ) ) &&
		Number.isFinite( +value )
		? +value
		: null;
}

function cleanTextChange( changes, style ) {
	const out = {};
	for ( const [ key, value ] of Object.entries( changes ) ) {
		if ( ! TEXT_KEYS[ key ] ) {
			continue;
		}
		if ( [ 'size', 'weight', 'ls', 'lh' ].includes( key ) ) {
			const next = changeNumber( value, style[ key ] );
			if ( next === null || ! Number.isFinite( next ) ) {
				continue;
			}
			const limits = {
				size: [ 1, 2000 ],
				weight: [ 100, 900 ],
				ls: [ -100, 1000 ],
				lh: [ 0.5, 5 ],
			}[ key ];
			out[ key ] = Math.max( limits[ 0 ], Math.min( limits[ 1 ], next ) );
		} else if ( [ 'italic', 'underline', 'strike' ].includes( key ) ) {
			out[ key ] = !! value;
		} else if (
			key === 'color'
				? !! colorKey( value )
				: typeof value === 'string' && value.trim()
		) {
			out[ key ] = value;
		}
	}
	return out;
}

/** Split at original run boundaries; unrelated mixed formatting survives. */
export function textPatch( layer, hits, changes, whole = false ) {
	const records = textRecords( layer );
	const c = cleanTextChange( changes, records[ 0 ]?.style || {} );
	if ( ! Object.keys( c ).length ) {
		return {};
	}
	const length = String( layer.text || '' ).length;
	const covers =
		whole || hits.reduce( ( n, h ) => n + h.end - h.start, 0 ) === length;
	const plain = ! layer.spans?.length && ! layer.lineStyles?.some( Boolean );
	if ( covers && plain ) {
		return Object.fromEntries(
			Object.entries( c )
				.map( ( [ k, v ] ) => [ TEXT_KEYS[ k ], v ] )
				.concat( 'color' in c ? [ [ 'fillType', 'solid' ] ] : [] )
		);
	}
	let start = 0;
	const spans = [];
	for ( const [ index, run ] of textRuns( layer ).entries() ) {
		const runChanges = cleanTextChange( changes, records[ index ].style );
		const end = start + run.text.length;
		const points = [
			...new Set( [
				start,
				end,
				...hits.flatMap( ( h ) => [
					Math.max( start, Math.min( end, h.start ) ),
					Math.max( start, Math.min( end, h.end ) ),
				] ),
			] ),
		].sort( ( a, b ) => a - b );
		for ( let i = 0; i < points.length - 1; i++ ) {
			const a = points[ i ],
				b = points[ i + 1 ];
			if ( a === b ) {
				continue;
			}
			const selected =
				whole || hits.some( ( h ) => h.start <= a && h.end >= b );
			spans.push( {
				text: run.text.slice( a - start, b - start ),
				s: selected
					? { ...run.s, ...runChanges }
					: run.s && { ...run.s },
			} );
		}
		start = end;
	}
	return { spans, lineStyles: null };
}

/** Apply only the original carrier differences, preserving other staged edits. */
function mergeDifference( before, after, current ) {
	if ( keyOf( before ) === keyOf( after ) ) {
		return current;
	}
	if (
		before &&
		after &&
		typeof before === 'object' &&
		typeof after === 'object' &&
		Array.isArray( before ) === Array.isArray( after )
	) {
		const out = Array.isArray( after )
			? [ ...( current || before ) ]
			: { ...( current || before ) };
		for ( const key of Object.keys( after ) ) {
			if ( keyOf( before[ key ] ) !== keyOf( after[ key ] ) ) {
				out[ key ] = mergeDifference(
					before[ key ],
					after[ key ],
					current?.[ key ]
				);
			}
		}
		return out;
	}
	return after;
}

function colorPatch( original, current, sourcePatch, from, target ) {
	const patch = {};
	for ( const [ key, value ] of Object.entries( sourcePatch ) ) {
		if ( key === 'spans' || key === 'lineStyles' ) {
			continue;
		}
		patch[ key ] = mergeDifference(
			original[ key ],
			value,
			current[ key ]
		);
	}
	if ( current.type !== 'text' ) {
		return patch;
	}
	const hits = textRecords( original ).filter(
		( h ) =>
			( 'color' in sourcePatch || h.ownColor ) &&
			colorKey( h.style.color )?.key === from
	);
	if ( original.text !== current.text ) {
		if (
			hits.reduce( ( n, h ) => n + h.end - h.start, 0 ) ===
				String( original.text ).length &&
			hits.length
		) {
			Object.assign(
				patch,
				textPatch(
					{ ...current, ...patch },
					[],
					{ color: recolor( hits[ 0 ].style.color, target ) },
					true
				)
			);
		}
		return patch;
	}
	for ( const hit of hits ) {
		Object.assign(
			patch,
			textPatch( { ...current, ...patch }, [ hit ], {
				color: recolor( hit.style.color, target ),
			} )
		);
	}
	return patch;
}

/** All preview changes use copied objects and the core's color-link semantics. */
export function plan( baseLayers, baseDoc, operations, measure = null ) {
	operations = operations
		.map( ( op ) => ( {
			...op,
			changes: Object.fromEntries(
				Object.entries( op.changes ).filter(
					( [ key ] ) => ! op.disabled?.has( key )
				)
			),
		} ) )
		.filter( ( op ) => Object.keys( op.changes ).length );
	// Similar-color suggestions retain the original carrier mapping, including
	// multiple source colors on one layer and edits staged in other families.
	operations = operations.flatMap( ( op ) => {
		if ( op.group.colorFamilies ) {
			return op.group.colorFamilies.map( ( group ) => ( {
				...op,
				group,
			} ) );
		}
		// A family of tones: every tone moves with the base and keeps its
		// distance to it.
		if ( op.group.tones && colorKey( op.changes.color ) ) {
			return op.group.tones.map( ( group ) => ( {
				...op,
				group,
				changes: {
					...op.changes,
					color: shiftTone(
						group.color,
						op.group.color,
						op.changes.color
					),
				},
			} ) );
		}
		return [ op ];
	} );
	let layers = [ ...baseLayers ],
		doc = baseDoc;
	const positions = new Map( baseLayers.map( ( l, i ) => [ l.id, i ] ) );
	const get = ( id ) => layers[ positions.get( id ) ];
	const allowed = new Set(
		editableScope( baseLayers ).eligible.map( ( l ) => l.id )
	);
	const put = ( id, patch ) => {
		if ( ! allowed.has( id ) || ! Object.keys( patch ).length ) {
			return;
		}
		const l = get( id );
		if (
			! Object.entries( patch ).some(
				( [ key, v ] ) => keyOf( v ) !== keyOf( l[ key ] )
			)
		) {
			return;
		}
		layers[ positions.get( id ) ] = {
			...l,
			...detachPatchedColorLinks( l, patch ),
		};
	};
	for ( const {
		group,
		changes,
		excluded = new Set(),
		wholeText = false,
		fitPlate = true,
		keepRatio = false,
	} of operations ) {
		const ids = new Set( groupIds( group, excluded ) );
		if ( group.marker ) {
			const m = group.marker,
				target = get( changes.target );
			const source = get( m.textId ),
				shape = get( m.shapeId );
			if (
				! target ||
				! source ||
				! shape ||
				target.id === source.id ||
				! m.peers.includes( target.id ) ||
				! ids.has( target.id ) ||
				! allowed.has( shape.id )
			) {
				continue;
			}
			const saved = shape.smartEditMarker;
			put( source.id, {
				color:
					saved?.textId === source.id
						? saved.originalColor
						: m.normalColor,
			} );
			put( target.id, { color: m.foreground } );
			put( shape.id, {
				x: shape.x + target.x + target.w / 2 - source.x - source.w / 2,
				y: shape.y + target.y + target.h / 2 - source.y - source.h / 2,
				smartEditMarker: {
					textId: target.id,
					originalColor: target.color,
				},
			} );
		} else if ( group.kind === 'colors' ) {
			if ( ! colorKey( changes.color ) ) {
				continue;
			}
			const result = replaceColorMap(
				baseLayers.filter(
					( l ) => ids.has( l.id ) && allowed.has( l.id )
				),
				ids.has( '@document' ) ? baseDoc : null,
				{ [ group.color ]: changes.color }
			);
			for ( const [ id, patch ] of result.patches ) {
				put(
					id,
					colorPatch(
						baseLayers[ positions.get( id ) ],
						get( id ),
						patch,
						group.color,
						changes.color
					)
				);
			}
			if ( result.doc ) {
				doc = { ...doc, ...result.doc };
			}
		} else if ( group.kind === 'text' ) {
			for ( const id of ids ) {
				const l = get( id ),
					original = baseLayers[ positions.get( id ) ];
				const hits = group.hits.filter( ( h ) => h.id === id );
				const contentChanged = l && original.text !== l.text;
				const covered =
					hits.reduce( ( sum, h ) => sum + h.end - h.start, 0 ) ===
					String( original?.text || '' ).length;
				if ( l && ( ! contentChanged || covered || wholeText ) ) {
					const patch = textPatch(
						l,
						hits,
						changes,
						wholeText || ( contentChanged && covered )
					);
					if (
						measure?.height &&
						[
							'family',
							'size',
							'weight',
							'italic',
							'ls',
							'lh',
						].some( ( key ) => key in changes ) &&
						Object.entries( patch ).some(
							( [ key, v ] ) => keyOf( l[ key ] ) !== keyOf( v )
						)
					) {
						patch.h = measure.height( { ...l, ...patch } );
					}
					put( id, patch );
				}
			}
		} else if ( group.kind === 'shapes' ) {
			for ( const id of ids ) {
				const l = get( id );
				if ( ! l ) {
					continue;
				}
				const patch = {
					...layerStylePatch( l, changes.fillPaint ),
					...layerStylePatch( l, changes.strokePaint ),
					...layerStylePatch( l, changes.cornerStyle ),
				};
				for ( const key of [
					'w',
					'h',
					'radius',
					'strokeW',
					'opacity',
				] ) {
					const next = changeNumber(
						changes[ key ],
						l[ key ] ?? ( key === 'opacity' ? 1 : 0 )
					);
					if ( next !== null && Number.isFinite( next ) ) {
						patch[ key ] = Math.max(
							key === 'w' || key === 'h' ? 1 : 0,
							Math.min( key === 'opacity' ? 1 : 20000, next )
						);
					}
				}
				if ( ! canResize( l ) ) {
					delete patch.w;
					delete patch.h;
				} else if ( keepRatio && l.w > 0 && l.h > 0 ) {
					const axis = 'w' in patch ? 'w' : 'h' in patch ? 'h' : null;
					if ( axis ) {
						const factor = Math.max(
							Math.max( 1 / l.w, 1 / l.h ),
							Math.min(
								Math.min( 20000 / l.w, 20000 / l.h ),
								patch[ axis ] / l[ axis ]
							)
						);
						patch.w = l.w * factor;
						patch.h = l.h * factor;
					}
				}
				for ( const key of [ 'fill', 'stroke' ] ) {
					if ( colorKey( changes[ key ] ) ) {
						patch[ key ] = changes[ key ];
						if ( key === 'fill' ) {
							patch.fillType = 'solid';
						} else {
							patch.strokeGradient = null;
							if ( ! l.strokeW && ! ( 'strokeW' in patch ) ) {
								patch.strokeW = 1;
							}
						}
					}
				}
				// Match the color field's default when enabling an absent stroke.
				// Existing colors, transparency and gradient paint remain intact.
				if (
					patch.strokeW > 0 &&
					! ( patch.stroke || l.stroke ) &&
					! changes.strokePaint
				) {
					patch.stroke = '#000000';
				}
				if ( 'w' in patch ) {
					patch.x = l.x + ( l.w - patch.w ) / 2;
				}
				if ( 'h' in patch ) {
					patch.y = l.y + ( l.h - patch.h ) / 2;
				}
				put( id, patch );
			}
		} else if ( group.kind === 'elements' ) {
			for ( const hit of group.hits ) {
				if ( excluded.has( hit.id ) ) {
					continue;
				}
				const text = get( hit.textId ),
					shape = get( hit.shapeId );
				if ( ! text || ! shape ) {
					continue;
				}
				const patch = textPatch(
					text,
					textRecords( text ),
					changes,
					true
				);
				if (
					typeof changes.text === 'string' &&
					group.hits.length === 1
				) {
					patch.text = changes.text.replace( /\r?\n/g, ' ' );
				}
				const next = { ...text, ...patch };
				if ( fitPlate && measure && Object.keys( patch ).length ) {
					const dw = measure( next ) - measure( text );
					const dh = measure.height
						? measure.height( { ...next, fixedWidth: false } ) -
						  measure.height( { ...text, fixedWidth: false } )
						: ( next.fontSize * next.lineHeight || next.fontSize ) -
						  ( text.fontSize * text.lineHeight || text.fontSize );
					if ( Number.isFinite( dw ) && Number.isFinite( dh ) ) {
						patch.w = Math.max( 1, text.w + dw );
						patch.h = Math.max( 1, text.h + dh );
						patch.x = text.x - ( patch.w - text.w ) / 2;
						patch.y = text.y - ( patch.h - text.h ) / 2;
						const w = Math.max( 1, shape.w + patch.w - text.w ),
							h = Math.max( 1, shape.h + patch.h - text.h );
						put( shape.id, {
							w,
							h,
							x: shape.x - ( w - shape.w ) / 2,
							y: shape.y - ( h - shape.h ) / 2,
						} );
					}
				}
				if (
					! ( 'h' in patch ) &&
					measure?.height &&
					Object.keys( patch ).length &&
					[
						'family',
						'size',
						'weight',
						'italic',
						'ls',
						'lh',
						'text',
					].some( ( key ) => key in changes )
				) {
					patch.h = measure.height( next );
				}
				put( text.id, patch );
				if ( colorKey( changes.fill ) ) {
					put( shape.id, { fill: changes.fill, fillType: 'solid' } );
				}
				const radius = changeNumber(
					changes.radius,
					shape.radius || 0
				);
				if ( radius !== null && Number.isFinite( radius ) ) {
					put( shape.id, {
						radius: Math.max( 0, Math.min( 20000, radius ) ),
					} );
				}
			}
		}
	}
	if ( layers.some( ( l, i ) => l !== baseLayers[ i ] ) ) {
		layers = syncRepeatLayers( syncColorLinks( layers ) );
	}
	const patches = new Map();
	layers.forEach( ( l ) => {
		const original = baseLayers[ positions.get( l.id ) ];
		if ( original === l ) {
			return;
		}
		const patch = {};
		for ( const key of Object.keys( l ) ) {
			if (
				l[ key ] !== original[ key ] &&
				keyOf( l[ key ] ) !== keyOf( original[ key ] )
			) {
				patch[ key ] = l[ key ];
			}
		}
		if ( Object.keys( patch ).length ) {
			// The reducer must not mistake propagated colors for manual overrides.
			if ( original.colorLinks ) {
				patch.colorLinks = l.colorLinks || {};
			}
			patches.set( l.id, patch );
		}
	} );
	return {
		layers,
		doc,
		patches,
		docPatch:
			doc === baseDoc || doc.bg === baseDoc.bg ? null : { bg: doc.bg },
	};
}
