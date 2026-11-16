import { makeDesign, cleanLayer } from './design.js';
import { PRESETS } from './presets.js';
import { PALETTES, cellElements } from './pattern-core.js';
import { MOTIF_PARAMS } from './settings.js';
import { clone } from './distribution.js';
import { clamp } from './geometry.js';

const geometryKeys = [
	'count',
	'size',
	'weight',
	'amp',
	'freqI',
	'phase',
	'rot',
	'variety',
	'jitter',
	'distribution',
	'spacing',
	'dir',
	'shift',
	'riso',
	'dash',
];
const pick = ( items, random ) =>
	items[
		Math.min( items.length - 1, Math.floor( random() * items.length ) )
	];
const lockedElements = ( layer ) =>
	cellElements( layer ).filter( ( e ) => e.locked );
const hasStamp = ( layer ) =>
	layer.set === 'stamp' && ( layer.stamps?.length || layer.stampData );
const reseed = ( layer, random ) => {
	const held = lockedElements( layer );
	layer.moved = held.map( ( e ) => ( { ...e } ) );
	layer.added = layer.added.filter( ( a ) =>
		held.some( ( e ) => e.i === 100000 + a.id )
	);
	layer.removed = [];
	layer.seed =
		1 + ( ( layer.seed + Math.floor( random() * 999998 ) ) % 999999 );
};
const vary = ( layer, random ) => {
	for ( const [ key, , lo, hi ] of MOTIF_PARAMS[ layer.motif ] )
		layer[ key ] = Math.round(
			clamp(
				layer[ key ] + ( random() - 0.5 ) * ( hi - lo ) * 0.28,
				lo,
				hi
			)
		);
};
const recolor = ( layer, palette, random ) =>
	Object.assign( layer, {
		palette: palette.id,
		paletteColors: [],
		colorWeights: [],
		reverse: 0,
		colorway: Math.floor( random() * 5 ),
	} );
function background( design, palette ) {
	if ( ! design.bg ) return;
	const hex = design.bgCustom.slice( 1, 7 ),
		luma =
			parseInt( hex.slice( 0, 2 ), 16 ) * 0.2126 +
			parseInt( hex.slice( 2, 4 ), 16 ) * 0.7152 +
			parseInt( hex.slice( 4, 6 ), 16 ) * 0.0722;
	design.bgCustom =
		palette.colors[ luma < 100 ? 0 : palette.colors.length - 1 ];
}

/** Pure recipe operation. Existing stamps and locked objects remain editable. */
export function randomizeDesign(
	raw,
	{ mode = 'pattern', active = 0, locks = {} } = {},
	random = Math.random
) {
	const design = makeDesign( raw );
	if (
		locks.colors &&
		( mode === 'colors' || ( locks.motifs && locks.layout ) )
	)
		return design;
	active = Math.max( 0, Math.min( design.layers.length - 1, active ) );
	const palette = pick(
		PALETTES.filter(
			( p ) => ! design.layers.some( ( l ) => l.palette === p.id )
		),
		random
	);
	if ( mode === 'colors' ) {
		design.layers.forEach( ( l ) => recolor( l, palette, random ) );
		background( design, palette );
		return design;
	}
	const candidates = PRESETS.filter(
			( p ) => ! p.p.layers?.some( ( l ) => l.set === 'stamp' )
		),
		chosen = makeDesign( pick( candidates, random ).p );
	const protectedDesign = design.layers.some(
		( l ) => hasStamp( l ) || lockedElements( l ).length
	);
	if (
		mode === 'pattern' &&
		! locks.colors &&
		! locks.motifs &&
		! locks.layout &&
		! protectedDesign
	) {
		chosen.cellPx = design.cellPx;
		// Preserve an intentionally transparent background while generating a new composition.
		if ( ! design.bg ) chosen.bg = '';
		chosen.layers.forEach( ( l ) => {
			vary( l, random );
			reseed( l, random );
		} );
		return chosen;
	}
	const indices =
		mode === 'layer' ? [ active ] : design.layers.map( ( _, i ) => i );
	for ( const index of indices ) {
		const layer = design.layers[ index ],
			held = lockedElements( layer ),
			protectedMotifs = locks.motifs || held.length || hasStamp( layer );
		let next = clone( chosen.layers[ index % chosen.layers.length ] );
		if ( protectedMotifs || locks.layout ) {
			const matching = PRESETS.flatMap(
				( p ) => p.p.layers || [ p.p ]
			).filter( ( l ) => l.motif === layer.motif );
			if ( matching.length )
				next = cleanLayer( pick( matching, random ) );
		}
		if ( ! protectedMotifs ) {
			if ( ! locks.layout ) layer.motif = next.motif;
			layer.set = next.set;
			layer.set2 = next.set2;
			if ( ! locks.layout ) layer.glyphWeights = [];
		}
		if ( ! locks.layout ) {
			if ( ! held.length ) {
				for ( const key of geometryKeys )
					layer[ key ] = clone( next[ key ] );
				vary( layer, random );
			}
			reseed( layer, random );
		}
		if ( ! locks.colors ) recolor( layer, palette, random );
		design.layers[ index ] = cleanLayer( layer );
	}
	// A layer-only roll never changes the common repeat, background or other layers.
	if ( mode === 'pattern' ) {
		if ( ! locks.layout && ! protectedDesign ) {
			design.repeat = chosen.repeat;
			design.aspect = chosen.aspect;
		}
		if ( ! locks.colors ) background( design, palette );
	}
	return design;
}
