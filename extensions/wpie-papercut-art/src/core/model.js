/**
 * The scene model (v2): SHEETS carry OBJECTS.
 *
 * A sheet is one complete piece of paper. An object is a thing on it -
 * a deer, a forest, a moon, a cloud - and it keeps its own identity:
 * it can be picked, dragged, resized, moved to another sheet, deleted.
 * Nothing is ever baked irreversibly into the paper.
 *
 * Every sheet completes itself into a FULL sheet, which is what makes
 * the stack cuttable and what the eye reads as layered paper:
 *
 *   full   - the whole page (the backdrop; cut objects punch holes)
 *   ridge | hills | dunes | waves | city - paper below a profile line
 *   ground - a flat horizon with soft mounds under whatever stands on it
 *   top    - paper hanging from the top edge (cloud banks)
 *   edge   - a border frame that holds corner branches
 *   photo | subject - the photo pipeline's sheets
 */

import {
	GROUND_ANIMALS,
	SKY_ANIMALS,
	WATER_ANIMALS,
} from './generators.js';

let uid = 0;
export const newId = () =>
	'p' + Date.now().toString( 36 ) + ( uid++ ).toString( 36 );

export const FRAMES = [
	'none',
	'circle',
	'heart',
	'arch',
	'oval',
	'hex',
	'letter',
];

/** Sheet bases the user can pick for a landscape sheet. */
export const PROFILES = [ 'ridge', 'hills', 'dunes', 'waves', 'city' ];
export const BASES = PROFILES.concat( [ 'full', 'ground', 'top', 'edge' ] );

export const TREE_SPECIES = [ 'conifer', 'broadleaf', 'birch', 'palm', 'bush' ];
export const PLANT_SPECIES = [ 'grass', 'reeds', 'flowers', 'rocks' ];
export const ORBS = [ 'moon', 'crescent', 'sun' ];
export const CORNERS = [ 'tl', 'tr', 'bl', 'br' ];

export const OBJECT_KINDS = [
	'animal',
	'trees',
	'plants',
	'cloud',
	'orb',
	'flyer',
	'flock',
	'branch',
	'text',
];

/* --------------------------------- looks -------------------------------- */

export const LOOKS = [
	{
		id: 'lightbox',
		label: 'Lightbox',
		front: '#aeb8c8',
		back: '#ffffff',
		bg: [ '#fff9ef', '#ffe9c9' ],
		glow: '#ffd9a0',
	},
	{
		id: 'midnight',
		label: 'Midnight Blue',
		front: '#0a1128',
		back: '#b6cdf0',
		bg: [ '#e6eefb', '#c9d9f2' ],
		glow: '#dce9ff',
	},
	{
		id: 'sunset',
		label: 'Sunset',
		front: '#2b1a3a',
		back: '#ffd0a0',
		bg: [ '#ffedd8', '#ffc98f' ],
		glow: '#ffb36b',
	},
	{
		id: 'night',
		label: 'Night Glow',
		front: '#0b1020',
		back: '#46639a',
		bg: [ '#0e1428', '#20335c' ],
		glow: '#ffcf8a',
	},
	{
		id: 'forest',
		label: 'Forest',
		front: '#0c1f14',
		back: '#c6e6cb',
		bg: [ '#eef8f0', '#cdeccf' ],
		glow: '#e9f7d8',
	},
	{
		id: 'vintage',
		label: 'Vintage Paper',
		front: '#3b2c1d',
		back: '#f2e7cd',
		bg: [ '#f6eeda', '#e9dabd' ],
		glow: '#f3e6c8',
	},
	{
		id: 'noirgold',
		label: 'Noir & Gold',
		front: '#0d0d0f',
		back: '#c9a24a',
		bg: [ '#181510', '#2c2517' ],
		glow: '#e9c56a',
	},
	{
		id: 'rose',
		label: 'Rosé',
		front: '#6e2440',
		back: '#ffd9e4',
		bg: [ '#fff0f5', '#ffdbe7' ],
		glow: '#ffc3d4',
	},
];

const HEX = /^#[0-9a-fA-F]{6}$/;

export function lerpHex( a, b, t ) {
	const pa = parseInt( a.slice( 1 ), 16 );
	const pb = parseInt( b.slice( 1 ), 16 );
	const c = ( sh ) =>
		Math.round(
			( ( pa >> sh ) & 255 ) +
				( ( ( pb >> sh ) & 255 ) - ( ( pa >> sh ) & 255 ) ) * t
		);
	return (
		'#' +
		( ( 1 << 24 ) | ( c( 16 ) << 16 ) | ( c( 8 ) << 8 ) | c( 0 ) )
			.toString( 16 )
			.slice( 1 )
	);
}

/** The look's paper colour for sheet i of n - i=0 is the BACK sheet. */
export function sheetColor( look, i, n ) {
	const t = n <= 1 ? 1 : i / ( n - 1 );
	return lerpHex( look.back, look.front, t );
}

export const lookById = ( id ) =>
	LOOKS.find( ( l ) => l.id === id ) || LOOKS[ 0 ];

/* -------------------------------- factories ------------------------------ */

const seedNow = () => 1 + Math.floor( Math.random() * 99999 );

/** A new object of the given kind, at a sensible default spot. */
export function defaultObject( kind, extra = {} ) {
	const base = {
		id: newId(),
		kind,
		x: 0.5,
		y: 0.8,
		scale: 34,
		flip: false,
		rot: 0,
		seed: seedNow(),
	};
	if ( 'animal' === kind ) {
		return { ...base, species: 'deer', ...extra };
	}
	if ( 'trees' === kind ) {
		return {
			...base,
			species: 'conifer',
			spread: 45,
			count: 7,
			scale: 24,
			...extra,
		};
	}
	if ( 'plants' === kind ) {
		return {
			...base,
			species: 'grass',
			spread: 55,
			count: 14,
			scale: 14,
			y: 0.9,
			...extra,
		};
	}
	if ( 'cloud' === kind ) {
		return { ...base, y: 0.2, scale: 30, ...extra };
	}
	if ( 'orb' === kind ) {
		return {
			...base,
			variant: 'moon',
			x: 0.7,
			y: 0.24,
			scale: 26,
			...extra,
		};
	}
	if ( 'flyer' === kind ) {
		return {
			...base,
			species: 'eagle',
			x: 0.5,
			y: 0.22,
			scale: 20,
			...extra,
		};
	}
	if ( 'flock' === kind ) {
		return {
			...base,
			species: 'gullfly',
			x: 0.5,
			y: 0.18,
			spread: 60,
			count: 5,
			scale: 7,
			...extra,
		};
	}
	if ( 'branch' === kind ) {
		return {
			...base,
			corner: 'tl',
			reach: 55,
			scale: 50,
			x: 0,
			y: 0,
			...extra,
		};
	}
	// text
	return {
		...base,
		value: 'WONDER',
		family: '',
		mode: 'paper',
		x: 0.5,
		y: 0.85,
		scale: 26,
		...extra,
	};
}

/** Objects that punch a hole instead of adding paper. */
export const isCutObject = ( o ) =>
	'orb' === o.kind ||
	'flyer' === o.kind ||
	'flock' === o.kind ||
	( 'text' === o.kind && 'cut' === o.mode );

/** Objects that stand on the ground rather than float. */
export const isStanding = ( o ) =>
	'animal' === o.kind || 'trees' === o.kind || 'plants' === o.kind;

export function defaultSheet( base = 'ground', extra = {} ) {
	return {
		id: newId(),
		base,
		color: '',
		dx: 0,
		dy: 0,
		seed: seedNow(),
		height: 'top' === base ? 55 : 36,
		jag: 60,
		yBase: 'top' === base ? 24 : 78,
		border: 3,
		band: 0,
		objects: [],
		...extra,
	};
}

export function defaultParams() {
	return {
		look: 'lightbox',
		frame: 'none',
		frameLetter: 'A',
		frameInset: 9,
		lightX: 30,
		shadow: 55,
		soft: 60,
		grain: 35,
		glow: 55,
		cutWidth: 30,
		minBridge: 2,
		detail: 50,
		photo: {
			source: 'none',
			layerId: '',
			src: '',
			bands: 4,
			thresholds: [],
			invert: false,
			subject: false,
			blur: 50,
		},
		sheets: [
			defaultSheet( 'full', { yBase: 100 } ),
			defaultSheet( 'hills', { seed: 12, yBase: 74, height: 30 } ),
			defaultSheet( 'ground', { seed: 13, yBase: 92 } ),
		],
	};
}

/* -------------------------------- cleaning ------------------------------- */

const num = ( v, d, lo, hi ) => {
	const n = Number( v );
	if ( ! Number.isFinite( n ) ) {
		return d;
	}
	return Math.max( lo, Math.min( hi, n ) );
};

const ANIMAL_SPECIES = GROUND_ANIMALS.concat( WATER_ANIMALS );

function cleanObject( raw ) {
	if (
		! raw ||
		'object' !== typeof raw ||
		! OBJECT_KINDS.includes( raw.kind )
	) {
		return null;
	}
	const d = defaultObject( raw.kind );
	const o = {
		id: 'string' === typeof raw.id && raw.id ? raw.id : d.id,
		kind: raw.kind,
		x: num( raw.x, d.x, -0.2, 1.2 ),
		y: num( raw.y, d.y, -0.2, 1.2 ),
		scale: num( raw.scale, d.scale, 3, 140 ),
		flip: !! raw.flip,
		rot: num( raw.rot, 0, -180, 180 ),
		seed: Math.max( 1, Math.floor( num( raw.seed, d.seed, 1, 1e9 ) ) ),
	};
	if ( 'animal' === raw.kind ) {
		o.species = ANIMAL_SPECIES.includes( raw.species )
			? raw.species
			: 'deer';
	} else if ( 'trees' === raw.kind ) {
		o.species = TREE_SPECIES.includes( raw.species )
			? raw.species
			: 'conifer';
		o.spread = num( raw.spread, d.spread, 0, 200 );
		o.count = Math.round( num( raw.count, d.count, 1, 40 ) );
	} else if ( 'plants' === raw.kind ) {
		o.species = PLANT_SPECIES.includes( raw.species )
			? raw.species
			: 'grass';
		o.spread = num( raw.spread, d.spread, 0, 200 );
		o.count = Math.round( num( raw.count, d.count, 1, 60 ) );
	} else if ( 'orb' === raw.kind ) {
		o.variant = ORBS.includes( raw.variant ) ? raw.variant : 'moon';
	} else if ( 'flyer' === raw.kind ) {
		o.species = SKY_ANIMALS.includes( raw.species ) ? raw.species : 'eagle';
	} else if ( 'flock' === raw.kind ) {
		o.species = SKY_ANIMALS.includes( raw.species )
			? raw.species
			: 'gullfly';
		o.spread = num( raw.spread, d.spread, 5, 200 );
		o.count = Math.round( num( raw.count, d.count, 1, 20 ) );
	} else if ( 'branch' === raw.kind ) {
		o.corner = CORNERS.includes( raw.corner ) ? raw.corner : 'tl';
		o.reach = num( raw.reach, d.reach, 15, 100 );
	} else if ( 'text' === raw.kind ) {
		o.value = String( raw.value ?? d.value ).slice( 0, 40 );
		o.family = String( raw.family || '' ).slice( 0, 80 );
		o.mode = 'cut' === raw.mode ? 'cut' : 'paper';
	}
	return o;
}

function cleanSheet( raw ) {
	if ( ! raw || 'object' !== typeof raw ) {
		return null;
	}
	const base = BASES.concat( [ 'photo', 'subject' ] ).includes( raw.base )
		? raw.base
		: 'ground';
	const d = defaultSheet( base );
	return {
		id: 'string' === typeof raw.id && raw.id ? raw.id : d.id,
		base,
		color: HEX.test( String( raw.color ) ) ? raw.color : '',
		dx: num( raw.dx, 0, -1, 1 ),
		dy: num( raw.dy, 0, -1, 1 ),
		seed: Math.max( 1, Math.floor( num( raw.seed, d.seed, 1, 1e9 ) ) ),
		height: num( raw.height, d.height, 0, 100 ),
		jag: num( raw.jag, d.jag, 0, 100 ),
		yBase: num( raw.yBase, d.yBase, 2, 100 ),
		border: num( raw.border, d.border, 1, 20 ),
		band: Math.round( num( raw.band, 0, 0, 7 ) ),
		objects: ( Array.isArray( raw.objects ) ? raw.objects : [] )
			.map( cleanObject )
			.filter( Boolean )
			.slice( 0, 24 ),
	};
}

/* ------------------------------- migration ------------------------------- */

/**
 * v1 stored `lagen`, where every element was baked into a layer. Bring
 * those saved scenes over: each old layer becomes a sheet, and every
 * baked element becomes a real object again.
 */
function migrateV1( lagen ) {
	const sheets = [];
	for ( const l of lagen ) {
		if ( ! l || 'object' !== typeof l ) {
			continue;
		}
		const common = {
			color: l.color,
			dx: l.dx,
			dy: l.dy,
			seed: l.seed,
			height: l.height,
			jag: l.jag,
			yBase: l.yBase,
		};
		if ( 'sky' === l.kind ) {
			const s = defaultSheet( 'full', { ...common, yBase: 100 } );
			if ( l.orb ) {
				s.objects.push(
					defaultObject( 'orb', {
						variant: l.orb,
						x: ( l.orbX ?? 70 ) / 100,
						y: ( l.orbY ?? 24 ) / 100,
						scale: l.orbSize ?? 26,
					} )
				);
			}
			if ( l.birds ) {
				s.objects.push(
					defaultObject( 'flock', {
						species: l.birdKind || 'gullfly',
						count: l.birds,
						y: 0.16,
					} )
				);
			}
			if ( l.stamp ) {
				s.objects.push(
					defaultObject( 'flyer', {
						species: l.stamp,
						x: ( l.stampX ?? 55 ) / 100,
						y: ( l.stampY ?? 18 ) / 100,
						scale: l.stampSize ?? 22,
					} )
				);
			}
			sheets.push( s );
		} else if ( 'clouds' === l.kind ) {
			sheets.push( defaultSheet( 'top', { ...common } ) );
		} else if ( 'branch' === l.kind ) {
			const s = defaultSheet( 'edge', { ...common } );
			s.objects.push(
				defaultObject( 'branch', {
					corner: l.corner || 'tl',
					reach: l.reach ?? 55,
					scale: l.leafSize ?? 50,
				} )
			);
			if ( l.corner2 && 'none' !== l.corner2 ) {
				s.objects.push(
					defaultObject( 'branch', {
						corner: l.corner2,
						reach: ( l.reach ?? 55 ) * 0.85,
						scale: l.leafSize ?? 50,
					} )
				);
			}
			sheets.push( s );
		} else if ( 'band' === l.kind ) {
			const s = defaultSheet( l.profile || 'hills', { ...common } );
			const groundY = ( l.yBase ?? 78 ) / 100;
			if ( l.trees ) {
				s.objects.push(
					defaultObject( 'trees', {
						species: l.trees,
						x: 0.5,
						y: groundY,
						spread: 100,
						count: Math.max(
							2,
							Math.round( 2 + ( l.treeDensity ?? 45 ) / 5 )
						),
						scale: ( l.treeSize ?? 30 ) * 0.7,
					} )
				);
			}
			if ( l.detail ) {
				s.objects.push(
					defaultObject( 'plants', {
						species: l.detail,
						x: 0.5,
						y: groundY,
						spread: 100,
						count: Math.max(
							4,
							Math.round( 4 + ( l.detailDensity ?? 50 ) / 3 )
						),
						scale: ( l.detailSize ?? 45 ) * 0.3,
					} )
				);
			}
			for ( const a of l.animals || [] ) {
				s.objects.push(
					defaultObject( 'animal', {
						species: a.kind,
						x: a.x ?? 0.5,
						y: groundY,
						scale: ( a.scale ?? 40 ) * 0.7,
						flip: !! a.flip,
					} )
				);
			}
			sheets.push( s );
		} else if ( 'photoband' === l.kind ) {
			sheets.push( defaultSheet( 'photo', { ...common, band: l.band } ) );
		} else if ( 'subject' === l.kind ) {
			sheets.push( defaultSheet( 'subject', { ...common } ) );
		} else if ( 'text' === l.kind ) {
			const s = defaultSheet( 'ground', {
				...common,
				yBase: Math.min( 98, ( l.y ?? 78 ) + 6 ),
			} );
			s.objects.push(
				defaultObject( 'text', {
					value: l.value,
					family: l.family,
					mode: l.mode,
					x: 0.5,
					y: ( l.y ?? 78 ) / 100,
					scale: l.size ?? 26,
				} )
			);
			sheets.push( s );
		}
	}
	return sheets;
}

export function cleanParams( raw ) {
	const d = defaultParams();
	if ( ! raw || 'object' !== typeof raw ) {
		return d;
	}
	const photo = raw.photo && 'object' === typeof raw.photo ? raw.photo : {};
	let sheets = Array.isArray( raw.sheets )
		? raw.sheets.map( cleanSheet ).filter( Boolean )
		: null;
	if ( ( ! sheets || ! sheets.length ) && Array.isArray( raw.lagen ) ) {
		sheets = migrateV1( raw.lagen ).map( cleanSheet ).filter( Boolean );
	}
	sheets = ( sheets && sheets.length ? sheets : d.sheets ).slice( 0, 12 );
	return {
		look: LOOKS.some( ( l ) => l.id === raw.look ) ? raw.look : d.look,
		frame: FRAMES.includes( raw.frame ) ? raw.frame : 'none',
		frameLetter: String( raw.frameLetter || 'A' ).slice( 0, 2 ),
		frameInset: num( raw.frameInset, d.frameInset, 2, 24 ),
		lightX: num( raw.lightX, d.lightX, -100, 100 ),
		shadow: num( raw.shadow, d.shadow, 0, 100 ),
		soft: num( raw.soft, d.soft, 0, 100 ),
		grain: num( raw.grain, d.grain, 0, 100 ),
		glow: num( raw.glow, d.glow, 0, 100 ),
		cutWidth: num( raw.cutWidth, d.cutWidth, 8, 100 ),
		minBridge: num( raw.minBridge, d.minBridge, 1, 6 ),
		detail: num( raw.detail, d.detail, 0, 100 ),
		photo: {
			source: [ 'none', 'document', 'layer', 'media', 'upload' ].includes(
				photo.source
			)
				? photo.source
				: 'none',
			layerId: String( photo.layerId || '' ),
			src:
				'string' === typeof photo.src &&
				photo.src.startsWith( 'data:image/' )
					? photo.src
					: '',
			bands: Math.round( num( photo.bands, 4, 2, 8 ) ),
			thresholds: Array.isArray( photo.thresholds )
				? photo.thresholds
						.slice( 0, 7 )
						.map( ( t ) => num( t, 0.5, 0.01, 0.99 ) )
				: [],
			invert: !! photo.invert,
			subject: !! photo.subject,
			blur: num( photo.blur, 50, 0, 100 ),
		},
		sheets,
	};
}

/* -------------------------------- presets -------------------------------- */

const S = ( base, extra, objects = [] ) => ( {
	...defaultSheet( base, extra ),
	objects,
} );
const O = defaultObject;

export const PRESETS = [
	{
		id: 'alps',
		label: 'Misty Alps',
		patch: () => ( {
			look: 'lightbox',
			frame: 'none',
			lightX: 30,
			sheets: [
				S( 'full', { yBase: 100 }, [
					O( 'flock', { count: 6, y: 0.14, spread: 70 } ),
				] ),
				S( 'top', { seed: 41, yBase: 22, height: 70 } ),
				S( 'ridge', { seed: 11, yBase: 46, height: 42, jag: 82 } ),
				S( 'ridge', { seed: 12, yBase: 62, height: 40, jag: 62 } ),
				S( 'hills', { seed: 13, yBase: 78, height: 32 }, [
					O( 'trees', {
						species: 'conifer',
						y: 0.78,
						spread: 100,
						count: 11,
						scale: 14,
					} ),
				] ),
				S( 'ground', { seed: 14, yBase: 93 }, [
					O( 'plants', {
						species: 'grass',
						y: 0.93,
						spread: 100,
						count: 22,
						scale: 11,
					} ),
				] ),
			],
		} ),
	},
	{
		id: 'deerwood',
		label: 'Deer Woods',
		patch: () => ( {
			look: 'forest',
			frame: 'circle',
			lightX: -25,
			sheets: [
				S( 'full', { yBase: 100 }, [
					O( 'flock', { species: 'birdfly', count: 4, y: 0.16 } ),
				] ),
				S( 'hills', { seed: 21, yBase: 50, height: 30 }, [
					O( 'trees', {
						species: 'conifer',
						y: 0.5,
						spread: 100,
						count: 14,
						scale: 18,
					} ),
				] ),
				S( 'hills', { seed: 22, yBase: 70, height: 28 }, [
					O( 'trees', {
						species: 'broadleaf',
						y: 0.7,
						spread: 100,
						count: 8,
						scale: 18,
					} ),
				] ),
				S( 'ground', { seed: 23, yBase: 90 }, [
					O( 'animal', { species: 'deer', x: 0.38, y: 0.9, scale: 34 } ),
					O( 'plants', {
						species: 'grass',
						y: 0.92,
						spread: 100,
						count: 20,
						scale: 10,
					} ),
				] ),
			],
		} ),
	},
	{
		id: 'nightwolf',
		label: 'Night Wolf',
		patch: () => ( {
			look: 'night',
			frame: 'circle',
			glow: 82,
			lightX: 10,
			sheets: [
				S( 'full', { yBase: 100 }, [
					O( 'orb', { variant: 'moon', x: 0.62, y: 0.3, scale: 26 } ),
				] ),
				S( 'ridge', { seed: 43, yBase: 62, height: 34, jag: 70 } ),
				S( 'hills', { seed: 44, yBase: 84, height: 26 }, [
					O( 'trees', {
						species: 'conifer',
						x: 0.7,
						y: 0.84,
						spread: 55,
						count: 6,
						scale: 16,
					} ),
					O( 'animal', { species: 'wolf', x: 0.32, y: 0.84, scale: 30 } ),
				] ),
			],
		} ),
	},
	{
		id: 'ocean',
		label: 'Open Water',
		patch: () => ( {
			look: 'midnight',
			frame: 'none',
			lightX: -40,
			sheets: [
				S( 'full', { yBase: 100 }, [
					O( 'flock', { count: 7, y: 0.15, spread: 80 } ),
				] ),
				S( 'top', { seed: 56, yBase: 20, height: 60 } ),
				S( 'waves', { seed: 31, yBase: 48, height: 16, jag: 35 } ),
				S( 'waves', { seed: 32, yBase: 62, height: 18, jag: 55 }, [
					O( 'animal', {
						species: 'dolphin',
						x: 0.62,
						y: 0.62,
						scale: 22,
					} ),
				] ),
				S( 'waves', { seed: 33, yBase: 76, height: 20, jag: 70 } ),
				S( 'waves', { seed: 34, yBase: 92, height: 24, jag: 85 } ),
			],
		} ),
	},
	{
		id: 'whale',
		label: 'Whale Song',
		patch: () => ( {
			look: 'midnight',
			frame: 'circle',
			lightX: 20,
			sheets: [
				S( 'full', { yBase: 100 }, [
					O( 'flyer', {
						species: 'gullfly',
						x: 0.3,
						y: 0.18,
						scale: 12,
					} ),
				] ),
				S( 'waves', { seed: 64, yBase: 54, height: 16, jag: 40 } ),
				S( 'waves', { seed: 65, yBase: 74, height: 20, jag: 60 }, [
					O( 'animal', { species: 'whale', x: 0.46, y: 0.74, scale: 28 } ),
				] ),
				S( 'waves', { seed: 66, yBase: 93, height: 22, jag: 80 } ),
			],
		} ),
	},
	{
		id: 'skyline',
		label: 'City Sunset',
		patch: () => ( {
			look: 'sunset',
			frame: 'none',
			lightX: 45,
			sheets: [
				S( 'full', { yBase: 100 }, [
					O( 'orb', { variant: 'sun', x: 0.3, y: 0.22, scale: 22 } ),
					O( 'flock', { count: 8, y: 0.14, spread: 80 } ),
				] ),
				S( 'city', { seed: 51, yBase: 56, height: 34 } ),
				S( 'city', { seed: 52, yBase: 76, height: 40 } ),
				S( 'city', { seed: 53, yBase: 94, height: 42 } ),
			],
		} ),
	},
	{
		id: 'heartmeadow',
		label: 'Heart Meadow',
		patch: () => ( {
			look: 'rose',
			frame: 'heart',
			lightX: -20,
			sheets: [
				S( 'full', { yBase: 100 }, [
					O( 'flyer', {
						species: 'butterfly',
						x: 0.62,
						y: 0.28,
						scale: 14,
					} ),
				] ),
				S( 'hills', { seed: 72, yBase: 62, height: 28 } ),
				S( 'ground', { seed: 73, yBase: 86 }, [
					O( 'animal', {
						species: 'hare',
						x: 0.6,
						y: 0.86,
						scale: 22,
						flip: true,
					} ),
					O( 'plants', {
						species: 'flowers',
						y: 0.88,
						spread: 100,
						count: 14,
						scale: 12,
					} ),
				] ),
			],
		} ),
	},
	{
		id: 'eagle',
		label: 'Eagle Heights',
		patch: () => ( {
			look: 'vintage',
			frame: 'arch',
			lightX: 35,
			sheets: [
				S( 'full', { yBase: 100 }, [
					O( 'flyer', { species: 'eagle', x: 0.52, y: 0.2, scale: 22 } ),
				] ),
				S( 'ridge', { seed: 82, yBase: 56, height: 42, jag: 90 } ),
				S( 'ridge', { seed: 83, yBase: 80, height: 36, jag: 62 }, [
					O( 'animal', { species: 'ibex', x: 0.26, y: 0.8, scale: 22 } ),
					O( 'trees', {
						species: 'conifer',
						x: 0.72,
						y: 0.8,
						spread: 50,
						count: 5,
						scale: 12,
					} ),
				] ),
			],
		} ),
	},
	{
		id: 'bearwoods',
		label: 'Bear Woods',
		patch: () => ( {
			look: 'noirgold',
			frame: 'hex',
			lightX: -30,
			sheets: [
				S( 'full', { yBase: 100 }, [
					O( 'orb', { variant: 'moon', x: 0.3, y: 0.24, scale: 24 } ),
				] ),
				S( 'hills', { seed: 92, yBase: 54, height: 30 }, [
					O( 'trees', {
						species: 'conifer',
						y: 0.54,
						spread: 100,
						count: 13,
						scale: 18,
					} ),
				] ),
				S( 'ground', { seed: 93, yBase: 86 }, [
					O( 'animal', { species: 'bear', x: 0.5, y: 0.86, scale: 28 } ),
					O( 'plants', {
						species: 'rocks',
						y: 0.88,
						spread: 100,
						count: 6,
						scale: 12,
					} ),
				] ),
			],
		} ),
	},
	{
		id: 'catwindow',
		label: 'Cat & Rooftops',
		patch: () => ( {
			look: 'vintage',
			frame: 'oval',
			lightX: 25,
			sheets: [
				S( 'full', { yBase: 100 }, [
					O( 'orb', {
						variant: 'crescent',
						x: 0.7,
						y: 0.24,
						scale: 22,
					} ),
				] ),
				S( 'city', { seed: 102, yBase: 66, height: 30 } ),
				S( 'ground', { seed: 103, yBase: 92 }, [
					O( 'animal', { species: 'cat', x: 0.56, y: 0.92, scale: 24 } ),
				] ),
			],
		} ),
	},
	{
		id: 'wordscape',
		label: 'Wordscape',
		patch: () => ( {
			look: 'lightbox',
			frame: 'none',
			lightX: -15,
			sheets: [
				S( 'full', { yBase: 100 }, [ O( 'flock', { count: 5, y: 0.15 } ) ] ),
				S( 'ridge', { seed: 112, yBase: 52, height: 38, jag: 74 } ),
				S( 'hills', { seed: 113, yBase: 74, height: 28 }, [
					O( 'trees', {
						species: 'conifer',
						y: 0.74,
						spread: 100,
						count: 9,
						scale: 13,
					} ),
				] ),
				S( 'ground', { seed: 114, yBase: 96 }, [
					O( 'text', {
						value: 'WONDER',
						x: 0.5,
						y: 0.91,
						scale: 20,
						mode: 'paper',
					} ),
				] ),
			],
		} ),
	},
	{
		id: 'oasis',
		label: 'Desert Oasis',
		patch: () => ( {
			look: 'sunset',
			frame: 'none',
			lightX: 55,
			sheets: [
				S( 'full', { yBase: 100 }, [
					O( 'orb', { variant: 'sun', x: 0.66, y: 0.24, scale: 26 } ),
				] ),
				S( 'dunes', { seed: 122, yBase: 60, height: 24, jag: 30 } ),
				S( 'dunes', { seed: 123, yBase: 78, height: 24, jag: 55 }, [
					O( 'trees', {
						species: 'palm',
						x: 0.36,
						y: 0.78,
						spread: 34,
						count: 3,
						scale: 34,
					} ),
				] ),
				S( 'dunes', { seed: 124, yBase: 96, height: 22, jag: 70 } ),
			],
		} ),
	},
	{
		id: 'lakeside',
		label: 'Quiet Lake',
		patch: () => ( {
			look: 'forest',
			frame: 'none',
			lightX: -35,
			sheets: [
				S( 'full', { yBase: 100 }, [
					O( 'flyer', { species: 'heron', x: 0.34, y: 0.2, scale: 14 } ),
				] ),
				S( 'hills', { seed: 132, yBase: 48, height: 26 }, [
					O( 'trees', {
						species: 'conifer',
						y: 0.48,
						spread: 100,
						count: 10,
						scale: 12,
					} ),
				] ),
				S( 'waves', { seed: 133, yBase: 72, height: 14, jag: 45 } ),
				S( 'ground', { seed: 134, yBase: 95 }, [
					O( 'plants', {
						species: 'reeds',
						y: 0.95,
						spread: 100,
						count: 16,
						scale: 18,
					} ),
				] ),
				S( 'edge', { seed: 135, border: 3 }, [
					O( 'branch', { corner: 'tl', reach: 52, scale: 55 } ),
				] ),
			],
		} ),
	},
	{
		id: 'foxfield',
		label: 'Fox in the Field',
		patch: () => ( {
			look: 'sunset',
			frame: 'circle',
			lightX: -20,
			sheets: [
				S( 'full', { yBase: 100 }, [
					O( 'flock', { species: 'birdfly', count: 5, y: 0.18 } ),
				] ),
				S( 'hills', { seed: 142, yBase: 58, height: 26 }, [
					O( 'trees', {
						species: 'broadleaf',
						y: 0.58,
						spread: 100,
						count: 6,
						scale: 18,
					} ),
				] ),
				S( 'ground', { seed: 143, yBase: 88 }, [
					O( 'animal', { species: 'fox', x: 0.4, y: 0.88, scale: 22 } ),
					O( 'plants', {
						species: 'grass',
						y: 0.9,
						spread: 100,
						count: 20,
						scale: 11,
					} ),
				] ),
			],
		} ),
	},
	{
		id: 'owlnight',
		label: 'Owl Hour',
		patch: () => ( {
			look: 'night',
			frame: 'arch',
			glow: 70,
			lightX: 0,
			sheets: [
				S( 'full', { yBase: 100 }, [
					O( 'orb', { variant: 'moon', x: 0.5, y: 0.28, scale: 30 } ),
					O( 'flyer', {
						species: 'owlfly',
						x: 0.74,
						y: 0.44,
						scale: 14,
					} ),
				] ),
				S( 'hills', { seed: 152, yBase: 70, height: 28 }, [
					O( 'trees', {
						species: 'birch',
						y: 0.7,
						spread: 100,
						count: 7,
						scale: 24,
					} ),
				] ),
				S( 'ground', { seed: 153, yBase: 93 }, [
					O( 'animal', { species: 'owl', x: 0.28, y: 0.93, scale: 20 } ),
				] ),
			],
		} ),
	},
	{
		id: 'horsehill',
		label: 'Horses at Dusk',
		patch: () => ( {
			look: 'vintage',
			frame: 'none',
			lightX: 40,
			sheets: [
				S( 'full', { yBase: 100 }, [
					O( 'orb', { variant: 'sun', x: 0.76, y: 0.28, scale: 20 } ),
					O( 'flock', { count: 5, y: 0.16 } ),
				] ),
				S( 'hills', { seed: 162, yBase: 58, height: 24 } ),
				S( 'ground', { seed: 163, yBase: 90 }, [
					O( 'animal', { species: 'horse', x: 0.34, y: 0.9, scale: 26 } ),
					O( 'animal', {
						species: 'horse',
						x: 0.6,
						y: 0.9,
						scale: 20,
						flip: true,
					} ),
					O( 'plants', {
						species: 'grass',
						y: 0.92,
						spread: 100,
						count: 18,
						scale: 10,
					} ),
				] ),
			],
		} ),
	},
];
