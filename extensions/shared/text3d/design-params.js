/** Serializable design controls. Content and animation settings are independent. */
export const SHAPES = {
	solid: 'Solid type',
	contour: 'Contour Flow',
	ribbon: 'Ribbon Type',
	slices: 'Sliced Type',
	stack: 'Layered Type',
	pillow: 'Pillow Type',
	shell: 'Hollow Type',
	tube: 'Tube Type',
	glass: 'Glass Interior',
};

export const PROFILES = {
	classic: 'Classic bevel',
	round: 'Rounded edge',
	facet: 'Cut facet',
	steps: 'Stepped edge',
	inset: 'Recessed face',
};
export const DEFORMATIONS = {
	none: 'None',
	wave: 'Wave',
	scurve: 'S-curve',
	fan: 'Fan',
	taper: 'Taper',
	twist: 'Twist',
};
export const SURFACES = {
	smooth: 'Smooth',
	fluted: 'Ribbed sides',
	machined: 'Front grooves',
	engraved: 'Contour channels',
};
export const LIGHT_RIGS = {
	studio: 'Studio',
	softbox: 'Large softboxes',
	strips: 'Light strips',
	rim: 'Rim light',
	split: 'Color split',
	gallery: 'Gallery light',
};

export const DESIGN_DEFAULTS = Object.freeze( {
	shape: 'solid',
	copies: 12,
	gap: 40,
	spread: 18,
	stackTwist: 0,
	wall: 14,
	inflate: 70,
	seam: 0,
	profile: 'classic',
	edgeSize: 55,
	faceDepth: 22,
	edgeDepth: 8,
	faceMaterial: 'ceramic',
	edgeMaterial: 'gold',
	edgeColor: '#dcb16a',
	layerColor: '#f3e6d3',
	stackRepeat: 1,
	interior: 'core',
	fillLevel: 62,
	coreColor: '#d765bd',
	coreMaterial: 'gloss',
	deform: 'none',
	bendAmount: 35,
	bendCycles: 1,
	surface: 'smooth',
	grooveSpacing: 40,
	grooveDepth: 35,
	grooveAngle: 0,
	textureScale: 45,
	textureStrength: 60,
	lightRig: 'studio',
	lightWidth: 50,
	lightAngle: 0,
	lightTint: '#b8cbff',
	rimStrength: 55,
} );

const ranges = {
	copies: [ 3, 28 ],
	gap: [ 0, 85 ],
	spread: [ -60, 60 ],
	stackTwist: [ -100, 100 ],
	wall: [ 3, 40 ],
	inflate: [ 0, 100 ],
	seam: [ 0, 100 ],
	edgeSize: [ 0, 100 ],
	faceDepth: [ 5, 60 ],
	edgeDepth: [ 2, 30 ],
	stackRepeat: [ 1, 6 ],
	fillLevel: [ 0, 100 ],
	bendAmount: [ -100, 100 ],
	bendCycles: [ 1, 4 ],
	grooveSpacing: [ 5, 100 ],
	grooveDepth: [ 0, 100 ],
	grooveAngle: [ -180, 180 ],
	textureScale: [ 5, 100 ],
	textureStrength: [ 0, 100 ],
	lightWidth: [ 5, 100 ],
	lightAngle: [ -180, 180 ],
	rimStrength: [ 0, 100 ],
};
const enums = {
	shape: SHAPES,
	profile: PROFILES,
	deform: DEFORMATIONS,
	surface: SURFACES,
	lightRig: LIGHT_RIGS,
	interior: { core: 1, layers: 1, liquid: 1 },
};
const materialKeys = new Set( [
	'gold',
	'chrome',
	'copper',
	'steel',
	'glass',
	'frosted',
	'neon',
	'gloss',
	'matte',
	'candy',
	'hologram',
	'gradient',
	'rosegold',
	'bronze',
	'satin',
	'ceramic',
	'rubber',
	'pearl',
	'jelly',
	'opal',
	'travertine',
	'concrete',
	'cork',
	'wood',
	'brushed',
	'enamel',
	'fabric',
	'paper',
] );

/** Bounds apply at UI, reopen and automation boundaries, including old documents. */
export function normalizeDesign( params = {} ) {
	const out = { ...DESIGN_DEFAULTS };
	for ( const key of Object.keys( out ) ) {
		const value = params[ key ];
		if ( ranges[ key ] ) {
			const n = Number( value );
			if (
				value !== null &&
				value !== '' &&
				value !== undefined &&
				Number.isFinite( n )
			) {
				out[ key ] = Math.round(
					Math.max(
						ranges[ key ][ 0 ],
						Math.min( ranges[ key ][ 1 ], n )
					)
				);
			}
		} else if ( enums[ key ] ) {
			if ( Object.hasOwn( enums[ key ], value ) ) {
				out[ key ] = value;
			}
		} else if ( key.endsWith( 'Color' ) || key === 'lightTint' ) {
			if (
				typeof value === 'string' &&
				/^#[0-9a-f]{6}$/i.test( value )
			) {
				out[ key ] = value;
			}
		} else if ( materialKeys.has( value ) ) {
			out[ key ] = value;
		}
	}
	return out;
}

/**
 * A bounded amount of repeated geometry even on long dynamic titles /
 * complex SVGs. `fine` is the bake (v1.22): twice the curve detail, so a
 * letter that fills the picture shows no polygon edge.
 */
export function designQuality( complexity = 1, fine = false ) {
	const load = Math.max( 1, complexity );
	const curves = load > 50 ? 3 : load > 20 ? 5 : 8;
	return {
		fine: !! fine,
		curves: fine ? Math.min( 16, curves * 2 ) : curves,
		ringSteps: load > 50 ? 72 : load > 20 ? 112 : 176,
		maxCopies: Math.max( 3, Math.min( 28, Math.floor( 320 / load ) ) ),
		faceStep: load > 50 ? 7 : load > 20 ? 5 : 3.2,
		maxTriangles: Math.max( 2000, Math.floor( 80000 / load ) ),
	};
}
