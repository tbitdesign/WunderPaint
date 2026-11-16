import { DEFAULTS, MOTIF_PARAMS } from './settings.js';
import { MOTIFS, GLYPH_SETS, bgColor } from './pattern-core.js';
import { clone } from './distribution.js';
import { clamp } from './geometry.js';
export const REPEATS = [
	'straight',
	'halfdrop',
	'brick',
	'mirror',
	'third',
	'quarter',
	'rotate',
	'halfturn',
];
const list = ( value ) => ( Array.isArray( value ) ? value : [] );
const hex = ( c ) => /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test( c || '' );
const data = ( c ) =>
	/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test( c || '' ) &&
	c.length < 3000000;
export function cleanLayer( raw = {} ) {
	const p = { ...clone( DEFAULTS ), ...clone( raw ) };
	delete p.layers;
	p.motif = MOTIFS.some( ( m ) => m.id === p.motif ) ? p.motif : 'scatter';
	p.set =
		GLYPH_SETS.some( ( s ) => s.id === p.set ) || p.set === 'stamp'
			? p.set
			: 'geo';
	p.kitColors = list( p.kitColors ).filter( hex ).slice( 0, 8 );
	p.set2 = GLYPH_SETS.some( ( s ) => s.id === p.set2 ) ? p.set2 : '';
	for ( const [ key, , min, max ] of MOTIF_PARAMS[ p.motif ] )
		p[ key ] = clamp( p[ key ], min, max );
	p.alpha = clamp( p.alpha, 5, 100 );
	p.seed = Math.round( clamp( p.seed, 1, 999999 ) );
	p.riso = clamp( p.riso, 0, 100 );
	p.spacing = clamp( p.spacing, 0, 100 );
	p.name = String( p.name || 'Pattern layer' ).slice( 0, 60 );
	p.distribution = [ 'jitter', 'spaced', 'cluster', 'hero' ].includes(
		p.distribution
	)
		? p.distribution
		: 'jitter';
	p.shift = {
		x: clamp( p.shift?.x || 0, -1, 1 ),
		y: clamp( p.shift?.y || 0, -1, 1 ),
	};
	p.paletteColors = list( p.paletteColors ).filter( hex ).slice( 0, 8 );
	if ( p.paletteColors.length < 2 ) p.paletteColors = [];
	p.stamps = list( p.stamps )
		.filter( ( s ) => s && data( s.data ) )
		.slice( 0, 6 )
		.map( ( s ) => ( {
			...s,
			aspect: clamp( s.aspect, 0.05, 20 ),
			name: String( s.name || 'Stamp' ).slice( 0, 60 ),
		} ) );
	p.stampData = data( p.stampData ) ? p.stampData : '';
	p.moved = list( p.moved )
		.filter( ( e ) => e && Number.isFinite( e.i ) )
		.slice( 0, 300 )
		.map( ( e ) => ( {
			...e,
			x: e.x === undefined ? undefined : clamp( e.x, -8, 8 ),
			y: e.y === undefined ? undefined : clamp( e.y, -8, 8 ),
			s: e.s === undefined ? undefined : clamp( e.s, 0.01, 1 ),
			rot:
				e.rot === undefined
					? undefined
					: clamp( e.rot, -Math.PI * 2, Math.PI * 2 ),
			color: hex( e.color ) ? e.color : undefined,
		} ) );
	p.added = list( p.added )
		.filter(
			( e ) => e && Number.isFinite( e.x ) && Number.isFinite( e.y )
		)
		.slice( 0, 100 )
		.map( ( e, i ) => ( {
			...e,
			x: clamp( e.x, -8, 8 ),
			y: clamp( e.y, -8, 8 ),
			id: Number.isFinite( e.id ) ? e.id : i,
			s: clamp( e.s, 0.01, 1 ),
			rot: clamp( e.rot || 0, -Math.PI * 2, Math.PI * 2 ),
			g: Math.max( 0, Math.round( e.g || 0 ) ),
			c: Math.max( 0, Math.round( e.c || 0 ) ),
		} ) );
	p.removed = list( p.removed ).filter( Number.isFinite ).slice( 0, 300 );
	p.glyphWeights = list( p.glyphWeights )
		.slice( 0, 40 )
		.map( ( w ) => clamp( w, 0, 100 ) );
	p.colorWeights = list( p.colorWeights )
		.slice( 0, 8 )
		.map( ( w ) => clamp( w, 0, 100 ) );
	return p;
}
export function makeDesign( raw = {} ) {
	const p = { ...DEFAULTS, ...clone( raw ) };
	p.paletteColors = list( p.paletteColors ).filter( hex );
	p.kitColors = list( p.kitColors ).filter( hex );
	return {
		version: 3,
		repeat: REPEATS.includes( p.repeat ) ? p.repeat : 'straight',
		aspect: clamp( p.aspect || 1, 0.5, 2 ),
		cellPx: [ 128, 256, 384, 512, 768, 1024 ].includes( +p.cellPx )
			? +p.cellPx
			: 256,
		bg: p.bg ? 'custom' : '',
		// A transparent background still remembers its color for later toggles and locks.
		bgCustom:
			bgColor( p ) || ( hex( p.bgCustom ) ? p.bgCustom : '#f4ebd9' ),
		layers: ( Array.isArray( p.layers ) && p.layers.length
			? p.layers
			: [ p ]
		)
			.slice( 0, 4 )
			.map( cleanLayer ),
	};
}
