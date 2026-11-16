/** Original analog, optical and experimental recipes in the shared Effect workflow. */
import { __ } from '@wordpress/i18n';
import { pixelFrame } from './effect-pixel-utils';
import { paintArt } from './effect-art-kernels';
import {
	paintFilm,
	paintSignal,
	paintBokeh,
	paintOptics,
} from './effect-analog-kernels';
const number = ( label, value, min = 0, max = 100 ) => ( {
	label,
	min,
	max,
	default: value,
} );
const color = ( label, value ) => ( {
	label,
	type: 'color',
	default: value,
} );
const toggle = ( label, value ) => ( {
	label,
	type: 'bool',
	default: value,
} );
const select = ( label, value, options ) => ( {
	label,
	type: 'select',
	default: value,
	options,
} );
const intensity = number( __( 'Intensity', 'wunderpaint' ), 85 );
const scale = number( __( 'Scale', 'wunderpaint' ), 30, 2 );
const seed = number( __( 'Variant', 'wunderpaint' ), 7, 1, 99 );
const angle = number( __( 'Angle', 'wunderpaint' ), 25, 0, 360 );
const paper = color( __( 'Paper', 'wunderpaint' ), '#f4e7cb' );
const ink = color( __( 'Ink', 'wunderpaint' ), '#20374d' );
const count = number( __( 'Count', 'wunderpaint' ), 24, 2, 80 );
const softness = number( __( 'Softness', 'wunderpaint' ), 45 );
const cx = number( __( 'Center X', 'wunderpaint' ), 50 );
const cy = number( __( 'Center Y', 'wunderpaint' ), 50 );
const light = toggle( __( 'Light marks', 'wunderpaint' ), true );
const aperture = select( __( 'Aperture', 'wunderpaint' ), 'hexagon', [
	{
		value: 'circle',
		label: __( 'Circle', 'wunderpaint' ),
	},
	{
		value: 'hexagon',
		label: __( 'Hexagon', 'wunderpaint' ),
	},
	{
		value: 'octagon',
		label: __( 'Octagon', 'wunderpaint' ),
	},
	{
		value: 'star',
		label: __( 'Star', 'wunderpaint' ),
	},
] );
const make = ( mode, label, group, params, kind, id ) => ( {
	mode,
	label,
	group,
	params,
	kind,
	id: id || 'finish-' + mode,
} );
const specs = [
	make(
		'pigment-bloom',
		__( 'Pigment Bloom', 'wunderpaint' ),
		'art',
		{
			intensity,
			scale,
			wetness: number( __( 'Wetness', 'wunderpaint' ), 68 ),
			blooms: number( __( 'Blooms', 'wunderpaint' ), 45 ),
			edge: number( __( 'Drying edges', 'wunderpaint' ), 60 ),
			grain: number( __( 'Granulation', 'wunderpaint' ), 38 ),
			paper,
			seed,
		},
		'art'
	),
	make(
		'reaction-print',
		__( 'Reaction Print', 'wunderpaint' ),
		'art',
		{
			intensity: {
				...intensity,
				default: 100,
			},
			scale,
			growth: number( __( 'Growth', 'wunderpaint' ), 68 ),
			pattern: number( __( 'Pattern balance', 'wunderpaint' ), 45 ),
			ink,
			paper,
			seed,
		},
		'art'
	),
	make(
		'metal-cracks',
		__( 'Metal Cracks', 'wunderpaint' ),
		'art',
		{
			intensity,
			scale: {
				...scale,
				default: 55,
			},
			width: number( __( 'Crack width', 'wunderpaint' ), 30 ),
			relief: number( __( 'Relief', 'wunderpaint' ), 65 ),
			metal: color( __( 'Metal', 'wunderpaint' ), '#eabf65' ),
			angle,
			seed,
		},
		'art'
	),
	make(
		'embroidery',
		__( 'Embroidery', 'wunderpaint' ),
		'art',
		{
			intensity: {
				...intensity,
				default: 100,
			},
			scale: {
				...scale,
				default: 22,
			},
			follow: number( __( 'Follow contours', 'wunderpaint' ), 65 ),
			sheen: number( __( 'Thread sheen', 'wunderpaint' ), 65 ),
			angle,
			paper,
		},
		'art'
	),
	make(
		'oxidation',
		__( 'Patina & Oxidation', 'wunderpaint' ),
		'art',
		{
			intensity,
			scale: {
				...scale,
				default: 55,
			},
			age: number( __( 'Age', 'wunderpaint' ), 65 ),
			texture: number( __( 'Surface texture', 'wunderpaint' ), 65 ),
			metal: color( __( 'Metal', 'wunderpaint' ), '#b97943' ),
			patina: color( __( 'Patina', 'wunderpaint' ), '#3dafa0' ),
			seed,
		},
		'art'
	),
	make(
		'solarization',
		__( 'Solarization', 'wunderpaint' ),
		'art',
		{
			intensity: {
				...intensity,
				default: 100,
			},
			threshold: number( __( 'Threshold', 'wunderpaint' ), 62, 5, 95 ),
			softness,
			mono: toggle( __( 'Monochrome', 'wunderpaint' ), false ),
		},
		'art'
	),
	make(
		'interference-print',
		__( 'Interference Print', 'wunderpaint' ),
		'art',
		{
			intensity,
			scale: {
				...scale,
				default: 15,
			},
			angle,
			crossing: number(
				__( 'Crossing angle', 'wunderpaint' ),
				12,
				1,
				90
			),
			warp: number( __( 'Image influence', 'wunderpaint' ), 48 ),
			ink,
			paper,
		},
		'art'
	),
	make(
		'scanlines',
		__( 'Scanlines', 'wunderpaint' ),
		'video',
		{
			intensity: {
				...intensity,
				default: 65,
			},
			scale,
			width: number( __( 'Line width', 'wunderpaint' ), 42, 5, 95 ),
			angle: {
				...angle,
				default: 0,
			},
		},
		'signal'
	),
	make(
		'analog-tape',
		__( 'Analog Tape', 'wunderpaint' ),
		'video',
		{
			intensity,
			scale,
			bleed: number( __( 'Color bleed', 'wunderpaint' ), 55 ),
			jitter: number( __( 'Jitter', 'wunderpaint' ), 45 ),
			noise: number( __( 'Signal noise', 'wunderpaint' ), 35 ),
			saturation: number(
				__( 'Saturation', 'wunderpaint' ),
				115,
				0,
				180
			),
			seed,
		},
		'signal'
	),
	make(
		'crt-screen',
		__( 'CRT Screen', 'wunderpaint' ),
		'video',
		{
			intensity,
			scale: {
				...scale,
				default: 60,
			},
			mask: number( __( 'Phosphor mask', 'wunderpaint' ), 75 ),
			curvature: number( __( 'Curvature', 'wunderpaint' ), 55 ),
		},
		'signal'
	),
	make(
		'tracking-slip',
		__( 'Tracking Slip', 'wunderpaint' ),
		'video',
		{
			intensity,
			scale,
			position: number( __( 'Position', 'wunderpaint' ), 65 ),
			band: number( __( 'Band height', 'wunderpaint' ), 45 ),
			displacement: number( __( 'Displacement', 'wunderpaint' ), 60 ),
			seed,
		},
		'signal'
	),
	make(
		'signal-dropout',
		__( 'Signal Dropout', 'wunderpaint' ),
		'video',
		{
			intensity,
			scale,
			density: number( __( 'Density', 'wunderpaint' ), 65, 1 ),
			length: number( __( 'Streak length', 'wunderpaint' ), 45, 1 ),
			seed,
		},
		'signal'
	),
	make(
		'chroma-bleed',
		__( 'Chroma Bleed', 'wunderpaint' ),
		'video',
		{
			intensity,
			bleed: number( __( 'Color bleed', 'wunderpaint' ), 70, 1 ),
			saturation: number(
				__( 'Saturation', 'wunderpaint' ),
				135,
				0,
				180
			),
		},
		'signal'
	),
	make(
		'film-dust',
		__( 'Film Dust', 'wunderpaint' ),
		'film',
		{
			intensity,
			density: number( __( 'Density', 'wunderpaint' ), 65, 1 ),
			scale: {
				...scale,
				default: 55,
			},
			light,
			seed,
		},
		'film'
	),
	make(
		'film-scratches',
		__( 'Film Scratches', 'wunderpaint' ),
		'film',
		{
			intensity,
			count: {
				...count,
				default: 16,
				min: 1,
				max: 50,
			},
			width: number( __( 'Scratch strength', 'wunderpaint' ), 65, 1 ),
			light,
			seed,
		},
		'film'
	),
	make(
		'film-hairs',
		__( 'Film Hairs', 'wunderpaint' ),
		'film',
		{
			intensity,
			count: {
				...count,
				default: 16,
				min: 1,
				max: 50,
			},
			scale: {
				...scale,
				default: 55,
			},
			width: number( __( 'Hair width', 'wunderpaint' ), 65, 1 ),
			light,
			seed,
		},
		'film'
	),
	make(
		'film-grain',
		__( 'Film Grain', 'wunderpaint' ),
		'film',
		{
			intensity: {
				...intensity,
				default: 65,
			},
			scale: number( __( 'Grain size', 'wunderpaint' ), 3, 1, 6 ),
			seed,
		},
		'film'
	),
	make(
		'film-burn',
		__( 'Film Burn', 'wunderpaint' ),
		'film',
		{
			intensity,
			scale,
			position: number( __( 'Position', 'wunderpaint' ), 15 ),
			angle,
			color: color( __( 'Burn color', 'wunderpaint' ), '#ff762c' ),
			seed,
		},
		'optics'
	),
	make(
		'highlight-bokeh',
		__( 'Highlight Bokeh', 'wunderpaint' ),
		'optics',
		{
			intensity,
			scale: {
				...scale,
				default: 45,
			},
			count,
			threshold: number(
				__( 'Highlight threshold', 'wunderpaint' ),
				65,
				5,
				95
			),
			shape: aperture,
			softness,
		},
		'bokeh'
	),
	make(
		'bokeh-lights',
		__( 'Bokeh Lights', 'wunderpaint' ),
		'optics',
		{
			intensity,
			scale: {
				...scale,
				default: 50,
			},
			count: {
				...count,
				default: 32,
			},
			shape: aperture,
			softness,
			color: color( __( 'Light color', 'wunderpaint' ), '#efb980' ),
			seed,
		},
		'bokeh'
	),
	make(
		'water-droplets',
		__( 'Water Droplets', 'wunderpaint' ),
		'optics',
		{
			intensity,
			scale: {
				...scale,
				default: 60,
			},
			coverage: number( __( 'Coverage', 'wunderpaint' ), 50, 1 ),
			refraction: number( __( 'Refraction', 'wunderpaint' ), 75 ),
			seed,
		},
		'optics'
	),
	make(
		'prism-window',
		__( 'Prism Window', 'wunderpaint' ),
		'optics',
		{
			intensity,
			scale: {
				...scale,
				default: 55,
			},
			refraction: number( __( 'Refraction', 'wunderpaint' ), 75 ),
			angle,
			cx,
			cy,
		},
		'optics'
	),
	make(
		'dual-ink-print',
		__( 'Two Ink Print', 'wunderpaint' ),
		'print',
		{
			intensity: {
				...intensity,
				default: 100,
			},
			scale: {
				...scale,
				default: 10,
			},
			registration: number(
				__( 'Registration shift', 'wunderpaint' ),
				55
			),
			grain: number( __( 'Ink grain', 'wunderpaint' ), 55 ),
			angle,
			ink,
			ink2: color( __( 'Second ink', 'wunderpaint' ), '#ee5945' ),
			paper,
			seed,
		},
		'art'
	),
	make(
		'triple-ink-print',
		__( 'Three Ink Print', 'wunderpaint' ),
		'print',
		{
			intensity: {
				...intensity,
				default: 100,
			},
			scale: {
				...scale,
				default: 10,
			},
			registration: number(
				__( 'Registration shift', 'wunderpaint' ),
				65
			),
			grain: number( __( 'Ink grain', 'wunderpaint' ), 45 ),
			angle,
			ink: color( __( 'Ink', 'wunderpaint' ), '#344867' ),
			ink2: color( __( 'Second ink', 'wunderpaint' ), '#ef5681' ),
			ink3: color( __( 'Third ink', 'wunderpaint' ), '#24a598' ),
			paper,
			seed,
		},
		'art'
	),
	make(
		'ink-wear',
		__( 'Worn Ink', 'wunderpaint' ),
		'grunge',
		{
			intensity,
			scale,
			wear: number( __( 'Wear', 'wunderpaint' ), 65 ),
			paper,
			seed,
		},
		'art'
	),
	make(
		'grunge',
		__( 'Grunge Surface', 'wunderpaint' ),
		'grunge',
		{
			intensity,
			scale: {
				...scale,
				default: 50,
			},
			dirt: number( __( 'Dirt', 'wunderpaint' ), 55 ),
			scratches: number( __( 'Scratches', 'wunderpaint' ), 35 ),
			angle,
			ink: color( __( 'Stain color', 'wunderpaint' ), '#3b2924' ),
			paper,
			seed,
		},
		'art'
	),
	make(
		'water-stains',
		__( 'Water Stains', 'wunderpaint' ),
		'grunge',
		{
			intensity,
			scale: {
				...scale,
				default: 50,
			},
			coverage: number( __( 'Coverage', 'wunderpaint' ), 55 ),
			edge: number( __( 'Drying edges', 'wunderpaint' ), 75 ),
			ink: color( __( 'Stain color', 'wunderpaint' ), '#765533' ),
			seed,
		},
		'art'
	),
	...[
		[ 'aged-tape', __( 'Aged Tape', 'wunderpaint' ) ],
		[ 'archive-film', __( 'Archive Film', 'wunderpaint' ) ],
		[ 'sunwashed-print', __( 'Sunwashed Print', 'wunderpaint' ) ],
		[ 'night-optics', __( 'Night Optics', 'wunderpaint' ) ],
	].map( ( [ mode, label ] ) =>
		make(
			mode,
			label,
			'composed',
			{
				intensity,
				character: number( __( 'Character', 'wunderpaint' ), 60 ),
				seed,
			},
			'composed'
		)
	),
];
const upgrades = [
	make(
		'vignette',
		__( 'Vignette', 'wunderpaint' ),
		'film',
		{
			amount: number( __( 'Amount', 'wunderpaint' ), 55, -100, 100 ),
			size: number( __( 'Size', 'wunderpaint' ), 50 ),
			softness: {
				...softness,
				default: 65,
				min: 5,
			},
			shape: select( __( 'Shape', 'wunderpaint' ), 'oval', [
				{
					value: 'oval',
					label: __( 'Oval', 'wunderpaint' ),
				},
				{
					value: 'circle',
					label: __( 'Circle', 'wunderpaint' ),
				},
				{
					value: 'rectangle',
					label: __( 'Rectangle', 'wunderpaint' ),
				},
			] ),
			cx,
			cy,
			color: color( __( 'Edge color', 'wunderpaint' ), '#171a25' ),
		},
		'optics',
		'vignette'
	),
	make(
		'highlight-halation',
		__( 'Highlight Halation', 'wunderpaint' ),
		'light',
		{
			intensity,
			scale: {
				...scale,
				default: 45,
			},
			threshold: number(
				__( 'Highlight threshold', 'wunderpaint' ),
				55,
				5,
				95
			),
			color: color( __( 'Halo color', 'wunderpaint' ), '#ff613d' ),
		},
		'optics'
	),
	make(
		'light-leak',
		__( 'Light Leak', 'wunderpaint' ),
		'light',
		{
			intensity,
			scale: {
				...scale,
				default: 65,
			},
			count: number( __( 'Count', 'wunderpaint' ), 2, 1, 3 ),
			color: color( __( 'Light color', 'wunderpaint' ), '#ff983f' ),
			angle: {
				...angle,
				default: 0,
			},
			seed,
		},
		'film'
	),
];
const defaultsFor = ( spec ) =>
	Object.fromEntries(
		Object.entries( spec.params ).map( ( [ key, schema ] ) => [
			key,
			schema.default,
		] )
	);
function applySpec( image, spec, values, helpers ) {
	const p = {
		...defaultsFor( spec ),
		...values,
	};
	for ( const [ key, schema ] of Object.entries( spec.params ) ) {
		if ( schema.min !== undefined ) {
			p[ key ] = Number.isFinite( +p[ key ] )
				? Math.max( schema.min, Math.min( schema.max, +p[ key ] ) )
				: schema.default;
		}
		if (
			schema.type === 'select' &&
			! schema.options.some( ( o ) => o.value === p[ key ] )
		) {
			p[ key ] = schema.default;
		}
	}
	if ( p.intensity === 0 || p.amount === 0 ) {
		return image;
	}
	const f = pixelFrame( image );
	if ( f.empty ) {
		return image;
	}
	if ( spec.kind === 'art' ) {
		return paintArt( f, spec.mode, p );
	}
	if ( spec.kind === 'signal' ) {
		return paintSignal( f, spec.mode, p );
	}
	if ( spec.kind === 'film' ) {
		return paintFilm( f, spec.mode, p );
	}
	if ( spec.kind === 'bokeh' ) {
		return paintBokeh( f, spec.mode, p );
	}
	if ( spec.kind === 'optics' ) {
		return paintOptics( f, spec.mode, p, helpers );
	}
	// Curated compound looks use the very same adjustable models, with one final mix.
	const sequences = {
		'aged-tape': [
			[
				'analog-tape',
				{
					jitter: p.character,
					noise: p.character,
				},
			],
			[
				'film-dust',
				{
					density: p.character,
					intensity: 55,
				},
			],
			[
				'signal-dropout',
				{
					density: p.character,
					intensity: 50,
				},
			],
		],
		'archive-film': [
			[
				'solarization',
				{
					mono: true,
					intensity: 25,
					threshold: 92,
				},
			],
			[
				'film-grain',
				{
					intensity: p.character,
				},
			],
			[
				'film-scratches',
				{
					count: 3 + p.character / 8,
					intensity: 45,
				},
			],
			[
				'vignette',
				{
					amount: p.character * 0.8,
				},
			],
		],
		'sunwashed-print': [
			[
				'dual-ink-print',
				{
					intensity: 92,
				},
			],
			[
				'ink-wear',
				{
					wear: p.character,
					intensity: 80,
				},
			],
			[
				'light-leak',
				{
					color: '#ffc08a',
					intensity: 40,
				},
			],
		],
		'night-optics': [
			[
				'highlight-halation',
				{
					scale: p.character,
					intensity: 100,
				},
			],
			[
				'bokeh-lights',
				{
					color: '#88aee8',
					scale: p.character,
					intensity: 55,
				},
			],
			[
				'vignette',
				{
					amount: 25 + p.character * 0.45,
				},
			],
		],
	};
	const work = {
		width: image.width,
		height: image.height,
		data: new Uint8ClampedArray( image.data ),
	};
	for ( const [ mode, params ] of sequences[ spec.mode ] ) {
		applySpec(
			work,
			[ ...specs, ...upgrades ].find( ( entry ) => entry.mode === mode ),
			{
				...params,
				seed: p.seed,
			},
			helpers
		);
	}
	return f.paint( p.intensity, ( x, y, base, u, v, i ) => [
		work.data[ i ],
		work.data[ i + 1 ],
		work.data[ i + 2 ],
	] );
}
export function extendLayerEffects( existing, helpers ) {
	const entry = ( spec, isNew ) => ( {
		id: spec.id,
		label: spec.label,
		group: spec.group,
		collection: true,
		analogArt: true,
		analogArtNew: isNew,
		keywords: [ 'analog-tape', 'aged-tape' ].includes( spec.mode )
			? 'vhs video tape'
			: '',
		params: spec.params,
		apply: ( image, values ) => applySpec( image, spec, values, helpers ),
	} );
	const updated = new Map(
		upgrades.map( ( spec ) => [ spec.id, entry( spec, false ) ] )
	);
	// Keep the established Essentials prefix, then show the new collection.
	const upgrade = ( effect ) => updated.get( effect.id ) || effect;
	return [
		...existing.filter( ( effect ) => ! effect.collection ).map( upgrade ),
		...specs.map( ( spec ) => entry( spec, true ) ),
		...existing.filter( ( effect ) => effect.collection ).map( upgrade ),
	];
}
