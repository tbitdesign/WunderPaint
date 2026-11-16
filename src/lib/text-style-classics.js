/** Complete new compositions for the original built-in style catalog. */
import { __ } from '@wordpress/i18n';
import { TEXT_FX } from './text-fx-defs';
const effects = Object.fromEntries(
	TEXT_FX.map( ( item ) => [ item.id, item.def ] )
);
function recipe( color, configs, stops, outline ) {
	const patch = {
		color,
		textFX: Object.fromEntries(
			configs.map( ( [ key, settings ] ) => [
				key,
				{ ...( effects[ key ] || {} ), ...settings },
			] )
		),
	};
	if ( stops ) {
		patch.fillType = 'gradient';
		patch.gradientKind = 'linear';
		patch.gradientAngle = 90;
		patch.gradientStops = stops.map( ( c, i ) => ( {
			at: i / ( stops.length - 1 ),
			color: c,
		} ) );
	}
	if ( outline ) {
		patch.outlineColor = outline[ 0 ];
		patch.outlineW = outline[ 1 ];
	}
	return patch;
}
export const CLASSIC_TEXT_STYLES = [
	{
		id: 'plain',
		label: __( 'Plain', 'wunderpaint' ),
		group: 'essentials',
		patch: {},
	},
	{
		id: 'sticker',
		label: __( 'Sticker', 'wunderpaint' ),
		group: 'marks',
		patch: recipe(
			'#e89781',
			[
				[
					'candyGel',
					{
						color: '#e8a183',
						color2: '#b55d76',
						depth: 62,
						shine: 80,
					},
				],
				[ 'sticker', { size: 7, color: '#fff3dd', shadow: 40 } ],
			],
			null,
			null
		),
	},
	{
		id: 'comic',
		label: __( 'Comic', 'wunderpaint' ),
		group: 'print',
		patch: recipe(
			'#f6c77b',
			[
				[
					'comicDots',
					{ size: 6, bg: '#ffd993', color: '#923e57', relief: 12 },
				],
				[
					'extrude',
					{
						depth: 8,
						angle: 35,
						color: '#6c3047',
						color2: '#b76a55',
					},
				],
				[
					'rings',
					{ size: 2, count: 2, color: '#362c3e', color2: '#fff0d2' },
				],
			],
			null,
			null
		),
	},
	{
		id: 'gold',
		label: __( 'Gold', 'wunderpaint' ),
		group: 'metal',
		patch: recipe(
			'#e7c378',
			[
				[
					'chrome',
					{
						color: '#ecd197',
						shine: 94,
						contrast: 85,
						relief: 68,
						lightAngle: 118,
					},
				],
				[
					'extrude',
					{
						depth: 5,
						angle: 72,
						color: '#624133',
						color2: '#b9965f',
					},
				],
			],
			null,
			null
		),
	},
	{
		id: 'chrome',
		label: __( 'Chrome', 'wunderpaint' ),
		group: 'metal',
		patch: recipe(
			'#c6e0ef',
			[
				[
					'chrome',
					{ color: '#ccdfec', shine: 95, contrast: 95, relief: 65 },
				],
				[
					'extrude',
					{
						depth: 7,
						angle: 35,
						color: '#23384f',
						color2: '#7791ad',
					},
				],
				[ 'shine', { width: 15, opacity: 28, pos: 32, angle: 116 } ],
			],
			null,
			null
		),
	},
	{
		id: 'neonPink',
		label: __( 'Neon', 'wunderpaint' ),
		group: 'light',
		patch: recipe(
			'#fff1fb',
			[
				[ 'neon', { color: '#ec5dae', size: 25, intensity: 100 } ],
				[ 'bevel', { depth: 2, shine: 90 } ],
			],
			[ '#fff6fb', '#ffc5e5', '#df5ca1' ],
			null
		),
	},
	{
		id: 'fire',
		label: __( 'Fire', 'wunderpaint' ),
		group: 'light',
		patch: recipe(
			'#ffb957',
			[
				[ 'bevel', { depth: 6, shine: 88, lightAngle: 115 } ],
				[ 'shine', { width: 18, opacity: 38, pos: 25, angle: 115 } ],
				[
					'ribbonFlow',
					{
						color: '#ffa038',
						color2: '#b83c55',
						length: 18,
						bend: 10,
						angle: 270,
						count: 24,
					},
				],
				[ 'glow', { color: '#ff7735', size: 18, intensity: 85 } ],
			],
			[ '#fff0a6', '#ffb14c', '#e3614d' ],
			null
		),
	},
	{
		id: 'ice',
		label: __( 'Ice', 'wunderpaint' ),
		group: 'glass',
		patch: recipe(
			'#c6ecf3',
			[
				[
					'frostedCrystal',
					{
						color: '#c5f0f1',
						color2: '#5c9ec3',
						depth: 66,
						scale: 28,
						shine: 90,
					},
				],
				[
					'prismCut',
					{
						color: '#ccebf5',
						color2: '#77adcb',
						slices: 6,
						shift: 3,
						depth: 5,
						angle: 25,
					},
				],
				[ 'glow', { color: '#9bdef6', size: 9, intensity: 30 } ],
			],
			null,
			null
		),
	},
	{
		id: 'retro3d',
		label: __( 'Retro 3D', 'wunderpaint' ),
		group: 'depth',
		patch: recipe(
			'#f4dec0',
			[
				[
					'threeD',
					{
						color: '#fff0cb',
						color2: '#dfb894',
						side: '#326d72',
						border: '#fff8e4',
						depth: 22,
						angle: 135,
						relief: 35,
					},
				],
				[
					'rings',
					{
						size: 1.5,
						count: 2,
						color: '#334c55',
						color2: '#e5c09c',
					},
				],
			],
			null,
			null
		),
	},
	{
		id: 'longShadow',
		label: __( 'Flat shadow', 'wunderpaint' ),
		group: 'depth',
		patch: recipe(
			'#68b7c8',
			[
				[
					'longShadow',
					{ angle: 42, length: 76, color: '#314f68', fade: 86 },
				],
				[ 'bevel', { depth: 4, shine: 35 } ],
			],
			[ '#b7e3dd', '#75b8cd', '#467b9b' ],
			null
		),
	},
	{
		id: 'riso',
		label: __( 'Print offset', 'wunderpaint' ),
		group: 'print',
		patch: recipe(
			'#24444c',
			[
				[
					'offsetPrint',
					{
						offset: 6,
						angle: 28,
						width: 1,
						color: '#dc8b7c',
						grain: 36,
					},
				],
				[
					'dotShadow',
					{ offset: 7, angle: 205, size: 4, color: '#6fa5a3' },
				],
			],
			null,
			null
		),
	},
	{
		id: 'letterpress',
		label: __( 'Letterpress', 'wunderpaint' ),
		group: 'print',
		patch: recipe(
			'#70828a',
			[
				[ 'letterpress', { depth: 6, lightAngle: 125, shine: 55 } ],
				[ 'grunge', { amount: 12, scale: 90, seed: 4 } ],
			],
			[ '#a4b4b4', '#6f8287', '#485b68' ],
			null
		),
	},
	{
		id: 'kids',
		label: __( 'Playful', 'wunderpaint' ),
		group: 'marks',
		patch: recipe(
			'#e9b372',
			[
				[ 'rainbow', { offset: 8, saturation: 65 } ],
				[ 'jitter', { amount: 27, rotation: 85, spread: 35, seed: 5 } ],
				[ 'sticker', { size: 5, color: '#fff1db', shadow: 25 } ],
				[ 'bevel', { depth: 3, shine: 45 } ],
			],
			null,
			null
		),
	},
	{
		id: 'glass',
		label: __( 'Reflection', 'wunderpaint' ),
		group: 'glass',
		patch: recipe(
			'#b0e4e5',
			[
				[
					'liquidLens',
					{
						color: '#bfeee9',
						color2: '#567eaa',
						depth: 75,
						shine: 95,
						scale: 30,
					},
				],
				[ 'reflection', { gap: 2, alpha: 38, fade: 92 } ],
			],
			null,
			null
		),
	},
	{
		id: 'wavy',
		label: __( 'Wave', 'wunderpaint' ),
		group: 'soft',
		patch: recipe(
			'#d5c9e5',
			[
				[
					'satinFold',
					{
						color: '#e4d4e8',
						color2: '#738aab',
						depth: 65,
						scale: 32,
						shine: 85,
					},
				],
				[ 'warp', { type: 'wave', bend: 45 } ],
				[ 'outline', { size: 1, color: '#eeecf4' } ],
			],
			null,
			null
		),
	},
	{
		id: 'glitch',
		label: __( 'Glitch', 'wunderpaint' ),
		group: 'transform',
		patch: recipe(
			'#d7e1ee',
			[
				[ 'glitch', { strength: 10, slices: 12, seed: 8 } ],
				[
					'chromatic',
					{
						offset: 4,
						angle: 2,
						color: '#85e8d5',
						color2: '#e979af',
					},
				],
				[ 'scanlines', { gap: 7, width: 1, opacity: 15 } ],
			],
			[ '#f8e4ef', '#a6c4dc', '#7993c3' ],
			null
		),
	},
	{
		id: 'vhs',
		label: __( 'VHS', 'wunderpaint' ),
		group: 'print',
		patch: recipe(
			'#dde9e1',
			[
				[
					'chromatic',
					{
						offset: 2,
						angle: 0,
						color: '#eb917d',
						color2: '#65d2ce',
					},
				],
				[ 'scanlines', { gap: 3, width: 1, opacity: 42 } ],
				[ 'glow', { color: '#7cbaba', size: 10, intensity: 60 } ],
			],
			[ '#fff4d6', '#ceddd1', '#99bec2' ],
			null
		),
	},
	{
		id: 'stamp',
		label: __( 'Rubber stamp', 'wunderpaint' ),
		group: 'print',
		patch: recipe(
			'#a85a62',
			[
				[ 'grunge', { amount: 42, scale: 82, seed: 7 } ],
				[ 'letterpress', { depth: 2, shine: 20 } ],
				[ 'skew', { x: -5, y: 2 } ],
			],
			null,
			null
		),
	},
	{
		id: 'standing',
		label: __( 'Standing', 'wunderpaint' ),
		group: 'depth',
		patch: recipe(
			'#dfba7e',
			[
				[
					'threeD',
					{
						color: '#f7dfad',
						color2: '#b4775c',
						side: '#65546a',
						border: '#fff1d3',
						depth: 20,
						angle: 35,
						relief: 60,
					},
				],
				[
					'groundShadow',
					{
						squash: 25,
						shear: 30,
						blur: 8,
						opacity: 35,
						fade: 88,
						color: '#213044',
					},
				],
			],
			null,
			null
		),
	},
	{
		id: 'neonSign',
		label: __( 'Neon sign', 'wunderpaint' ),
		group: 'light',
		patch: recipe(
			'#f5d2ab',
			[
				[
					'neonTube',
					{ color: '#efb97f', width: 3, glow: 24, intensity: 100 },
				],
			],
			null,
			null
		),
	},
	{
		id: 'arcade',
		label: __( '8-bit arcade', 'wunderpaint' ),
		group: 'depth',
		patch: recipe(
			'#c9e4c8',
			[
				[ 'pixelate', { size: 5 } ],
				[
					'rings',
					{ size: 2, count: 2, color: '#e9d3ac', color2: '#3e5368' },
				],
				[
					'extrude',
					{
						angle: 90,
						depth: 8,
						color: '#3a5168',
						color2: '#72879b',
					},
				],
			],
			[ '#f2dda4', '#cfe2b4', '#78b5aa' ],
			null
		),
	},
	{
		id: 'slime',
		label: __( 'Slime', 'wunderpaint' ),
		group: 'soft',
		patch: recipe(
			'#a6ca6a',
			[
				[
					'candyGel',
					{
						color: '#e1ed9a',
						color2: '#67944c',
						depth: 80,
						shine: 95,
						scale: 60,
					},
				],
				[
					'drip',
					{
						count: 5,
						length: 40,
						color: '#97bc57',
						shine: 95,
						seed: 6,
					},
				],
				[ 'glow', { color: '#9cbf63', size: 7, intensity: 25 } ],
			],
			null,
			null
		),
	},
	{
		id: 'speed',
		label: __( 'Speed', 'wunderpaint' ),
		group: 'depth',
		patch: recipe(
			'#dfb7a3',
			[
				[
					'satinFold',
					{
						color: '#f7d7bc',
						color2: '#a95871',
						shine: 90,
						depth: 65,
						scale: 45,
					},
				],
				[ 'motionBlur', { length: 58, angle: 180, opacity: 80 } ],
				[ 'skew', { x: -14, y: 0 } ],
			],
			null,
			null
		),
	},
	{
		id: 'highlighted',
		label: __( 'Highlight', 'wunderpaint' ),
		group: 'marks',
		patch: recipe(
			'#35444c',
			[
				[
					'marker',
					{
						style: 1,
						color: '#e5bf77',
						rough: 2,
						opacity: 85,
						seed: 5,
					},
				],
				[
					'scribbleUnder',
					{
						style: 1,
						color: '#bc7866',
						rough: 2,
						opacity: 95,
						seed: 6,
					},
				],
			],
			null,
			null
		),
	},
	{
		id: 'papercut',
		label: __( 'Paper cut', 'wunderpaint' ),
		group: 'cut',
		patch: recipe(
			'#233446',
			[
				[
					'paperCut',
					{
						color: '#e8c9ad',
						depth: 7,
						pad: 18,
						radius: 5,
						opacity: 65,
					},
				],
			],
			null,
			null
		),
	},
	{
		id: 'party',
		label: __( 'Party', 'wunderpaint' ),
		group: 'marks',
		patch: recipe(
			'#d8c6a2',
			[
				[ 'rainbow', { offset: 15, saturation: 68 } ],
				[ 'jitter', { amount: 22, rotation: 70, spread: 35, seed: 7 } ],
				[
					'confetti',
					{
						density: 25,
						size: 5,
						color: '#d8808d',
						color2: '#81c5b6',
						seed: 6,
					},
				],
				[ 'sticker', { size: 4, color: '#fff1df', shadow: 30 } ],
			],
			null,
			null
		),
	},
	{
		id: 'candy',
		label: __( 'Candy', 'wunderpaint' ),
		group: 'soft',
		patch: recipe(
			'#efbfcc',
			[
				[
					'stripesFill',
					{
						width: 8,
						angle: 32,
						color: '#edb4c5',
						color2: '#fff0df',
						color3: '#b45e83',
						relief: 65,
					},
				],
				[ 'bevel', { depth: 4, shine: 85 } ],
				[ 'sticker', { size: 6, color: '#fff1e5', shadow: 30 } ],
			],
			null,
			null
		),
	},
	{
		id: 'vegas',
		label: __( 'Vegas marquee', 'wunderpaint' ),
		group: 'light',
		patch: recipe(
			'#835867',
			[
				[
					'foil',
					{
						color: '#a96b70',
						sparkles: 4,
						relief: 65,
						lightAngle: 130,
					},
				],
				[ 'marquee', { size: 4, gap: 12, color: '#ffddb0', glow: 14 } ],
				[
					'extrude',
					{
						depth: 8,
						angle: 45,
						color: '#382d48',
						color2: '#73506a',
					},
				],
			],
			null,
			null
		),
	},
	{
		id: 'scoreboard',
		label: __( 'Scoreboard', 'wunderpaint' ),
		group: 'light',
		patch: recipe(
			'#202831',
			[
				[
					'dotMatrix',
					{ size: 11, color: '#ffc17f', bg: '#202634', glow: 11 },
				],
				[
					'extrude',
					{
						depth: 5,
						angle: 90,
						color: '#111e2d',
						color2: '#536a7c',
					},
				],
			],
			null,
			[ '#52677c', 1 ]
		),
	},
	{
		id: 'blueprint',
		label: __( 'Blueprint', 'wunderpaint' ),
		group: 'contour',
		patch: recipe(
			'#afdae5',
			[
				[
					'wireframe',
					{ color: '#9dd1e5', width: 1, grid: 12, depth: 17 },
				],
				[ 'glow', { color: '#60a8cf', size: 8, intensity: 32 } ],
			],
			null,
			null
		),
	},
	{
		id: 'varsity',
		label: __( 'Varsity', 'wunderpaint' ),
		group: 'woven',
		patch: recipe(
			'#5a729d',
			[
				[
					'stripesFill',
					{
						width: 2,
						angle: 35,
						color: '#50658b',
						color2: '#667d9f',
						color3: '#596f95',
						relief: 30,
					},
				],
				[ 'inline', { inset: 5, width: 1, color: '#f1dab5' } ],
				[
					'rings',
					{ size: 3, count: 2, color: '#eeddbd', color2: '#965865' },
				],
			],
			null,
			null
		),
	},
	{
		id: 'knockoutBadge',
		label: __( 'Knockout', 'wunderpaint' ),
		group: 'cut',
		patch: recipe(
			'#203c4a',
			[
				[
					'knockout',
					{
						color: '#31505e',
						pad: 18,
						radius: 12,
						shadow: 45,
						relief: 75,
					},
				],
			],
			null,
			null
		),
	},
	{
		id: 'origami',
		label: __( 'Origami', 'wunderpaint' ),
		group: 'cut',
		patch: recipe(
			'#aededa',
			[
				[
					'fold',
					{ bands: 6, strength: 85, angle: 38, relief: 78, seed: 6 },
				],
				[
					'extrude',
					{
						depth: 8,
						angle: 115,
						color: '#426e7c',
						color2: '#8ebbad',
					},
				],
			],
			[ '#d7efe4', '#92c8c9', '#668fa9' ],
			null
		),
	},
	{
		id: 'tvStatic',
		label: __( 'Off air', 'wunderpaint' ),
		group: 'print',
		patch: recipe(
			'#b9d1d6',
			[
				[
					'static',
					{
						scale: 2,
						amount: 90,
						seed: 6,
						color: '#dcdbed',
						color2: '#637fa3',
					},
				],
				[
					'chromatic',
					{
						offset: 3,
						angle: 0,
						color: '#71c6c8',
						color2: '#c277a6',
					},
				],
				[ 'scanlines', { gap: 6, width: 1, opacity: 30 } ],
			],
			null,
			null
		),
	},
	{
		id: 'comicShade',
		label: __( 'Comic shade', 'wunderpaint' ),
		group: 'print',
		patch: recipe(
			'#e7b9a3',
			[
				[
					'halftone',
					{ size: 7, strength: 70, angle: 35, color: '#5b425b' },
				],
				[
					'extrude',
					{
						depth: 10,
						angle: 40,
						color: '#61445c',
						color2: '#a7737e',
					},
				],
			],
			[ '#f5d8b7', '#e3a197', '#c6788b' ],
			[ '#f6e1c5', 1 ]
		),
	},
	{
		id: 'ska',
		label: __( 'Checkerboard', 'wunderpaint' ),
		group: 'print',
		patch: recipe(
			'#f1e4cb',
			[
				[
					'checker',
					{
						size: 11,
						color: '#343d4e',
						color2: '#eadcc5',
						relief: 35,
					},
				],
				[
					'extrude',
					{
						depth: 8,
						angle: 130,
						color: '#273748',
						color2: '#84909c',
					},
				],
				[
					'rings',
					{ size: 2, count: 2, color: '#f3e6d0', color2: '#35404e' },
				],
			],
			null,
			null
		),
	},
	{
		id: 'topo',
		label: __( 'Topography', 'wunderpaint' ),
		group: 'contour',
		patch: recipe(
			'#315755',
			[
				[
					'contour',
					{
						count: 4,
						gap: 6,
						width: 1,
						color: '#b6d9bd',
						color2: '#5b83a0',
					},
				],
				[ 'bevel', { depth: 3, shine: 30 } ],
			],
			[ '#638f82', '#466c68', '#2e4e5b' ],
			null
		),
	},
	{
		id: 'sparkleGold',
		label: __( 'Sparkle gold', 'wunderpaint' ),
		group: 'metal',
		patch: recipe(
			'#e0bb73',
			[
				[
					'foil',
					{ color: '#e1c488', sparkles: 6, seed: 9, relief: 62 },
				],
				[
					'sparkle',
					{ count: 5, size: 14, color: '#fff1ca', glow: 65, seed: 4 },
				],
				[
					'extrude',
					{
						depth: 5,
						angle: 80,
						color: '#765239',
						color2: '#ac895a',
					},
				],
			],
			null,
			null
		),
	},
	{
		id: 'roseGold',
		label: __( 'Rose gold', 'wunderpaint' ),
		group: 'metal',
		patch: recipe(
			'#d2a09b',
			[
				[
					'chrome',
					{
						color: '#e8b6ad',
						shine: 88,
						contrast: 82,
						relief: 70,
						lightAngle: 120,
					},
				],
				[ 'shine', { width: 15, opacity: 35, pos: 26, angle: 112 } ],
				[
					'extrude',
					{
						depth: 4,
						angle: 50,
						color: '#795263',
						color2: '#b08b94',
					},
				],
			],
			null,
			null
		),
	},
	{
		id: 'silver',
		label: __( 'Silver', 'wunderpaint' ),
		group: 'metal',
		patch: recipe(
			'#c7d6e3',
			[
				[
					'chrome',
					{
						color: '#d3e0e9',
						shine: 97,
						contrast: 90,
						relief: 62,
						lightAngle: 138,
					},
				],
				[
					'sparkle',
					{ count: 4, size: 10, color: '#f1f4ee', glow: 40, seed: 8 },
				],
				[
					'extrude',
					{
						depth: 7,
						angle: 65,
						color: '#46556d',
						color2: '#869eb6',
					},
				],
			],
			null,
			null
		),
	},
	{
		id: 'vaporwave',
		label: __( 'Vaporwave', 'wunderpaint' ),
		group: 'light',
		patch: recipe(
			'#d8b2e1',
			[
				[ 'bevel', { depth: 5, shine: 70, lightAngle: 125 } ],
				[ 'scanlines', { gap: 6, width: 1, opacity: 30 } ],
				[
					'chromatic',
					{
						offset: 6,
						angle: 0,
						color: '#85e4df',
						color2: '#e680bf',
					},
				],
				[ 'glow', { color: '#9770c1', size: 10, intensity: 48 } ],
			],
			[ '#ffc9df', '#d597d1', '#82c9df', '#8ee7d6' ],
			null
		),
	},
	{
		id: 'cyberpunk',
		label: __( 'Cyberpunk', 'wunderpaint' ),
		group: 'light',
		patch: recipe(
			'#c7d894',
			[
				[
					'chrome',
					{ color: '#d9e399', contrast: 82, relief: 35, shine: 85 },
				],
				[ 'glitch', { strength: 11, slices: 8, seed: 7 } ],
				[
					'chromatic',
					{
						offset: 4,
						angle: 5,
						color: '#6ad5cf',
						color2: '#c171ae',
					},
				],
				[
					'extrude',
					{
						depth: 5,
						angle: 30,
						color: '#513a6f',
						color2: '#9671a4',
					},
				],
			],
			null,
			null
		),
	},
	{
		id: 'graffiti',
		label: __( 'Graffiti', 'wunderpaint' ),
		group: 'print',
		patch: recipe(
			'#d9927a',
			[
				[ 'spray', { density: 78, grain: 2, color: '#dc9a78' } ],
				[
					'drip',
					{
						count: 4,
						length: 30,
						color: '#ce846b',
						shine: 45,
						seed: 8,
					},
				],
				[ 'sticker', { size: 5, color: '#f0d9ba', shadow: 35 } ],
				[ 'skew', { x: -10, y: 0 } ],
			],
			[ '#f4d5b1', '#dc9a79', '#b76d83' ],
			[ '#3c3d4e', 3 ]
		),
	},
	{
		id: 'western',
		label: __( 'Western', 'wunderpaint' ),
		group: 'metal',
		patch: recipe(
			'#c39a67',
			[
				[
					'foil',
					{ color: '#c6a579', sparkles: 2, relief: 30, seed: 4 },
				],
				[ 'inline', { inset: 4, width: 1, color: '#f2dbb4' } ],
				[
					'extrude',
					{
						depth: 7,
						angle: 90,
						color: '#574538',
						color2: '#956e4e',
					},
				],
			],
			null,
			[ '#655141', 1 ]
		),
	},
	{
		id: 'neonBlue',
		label: __( 'Neon blue', 'wunderpaint' ),
		group: 'light',
		patch: recipe(
			'#b7e1ed',
			[
				[
					'neonTube',
					{ color: '#8dcde8', width: 2, glow: 20, intensity: 100 },
				],
			],
			null,
			null
		),
	},
	{
		id: 'neonMint',
		label: __( 'Neon mint', 'wunderpaint' ),
		group: 'light',
		patch: recipe(
			'#9edacc',
			[
				[
					'neonTube',
					{ color: '#7edac1', width: 4, glow: 28, intensity: 85 },
				],
			],
			null,
			null
		),
	},
	{
		id: 'bubblePop',
		label: __( 'Bubble pop', 'wunderpaint' ),
		group: 'soft',
		patch: recipe(
			'#eab9cd',
			[
				[
					'candyGel',
					{
						color: '#f0c4d4',
						color2: '#bb6f9b',
						depth: 78,
						scale: 60,
						shine: 96,
					},
				],
				[
					'rings',
					{ size: 3, count: 2, color: '#f8e9e4', color2: '#996788' },
				],
				[
					'dotShadow',
					{ offset: 9, angle: 45, color: '#b782a0', size: 5 },
				],
			],
			null,
			null
		),
	},
	{
		id: 'honey',
		label: __( 'Honey', 'wunderpaint' ),
		group: 'soft',
		patch: recipe(
			'#deb879',
			[
				[
					'foil',
					{ color: '#e6be70', sparkles: 3, seed: 2, relief: 35 },
				],
				[ 'bevel', { depth: 5, shine: 88 } ],
				[
					'drip',
					{
						count: 5,
						length: 32,
						color: '#d5a157',
						shine: 95,
						seed: 4,
					},
				],
			],
			null,
			null
		),
	},
	{
		id: 'lava',
		label: __( 'Lava', 'wunderpaint' ),
		group: 'mineral',
		patch: recipe(
			'#ad4c55',
			[
				[ 'bevel', { depth: 7, shine: 60, lightAngle: 125 } ],
				[ 'cracks', { color: '#ffc06a', count: 8, width: 2, seed: 8 } ],
				[ 'glow', { color: '#ed7145', size: 16, intensity: 65 } ],
			],
			[ '#b26f61', '#a34b59', '#652f47' ],
			null
		),
	},
	{
		id: 'newsprint',
		label: __( 'Newsprint', 'wunderpaint' ),
		group: 'print',
		patch: recipe(
			'#364653',
			[
				[
					'offsetPrint',
					{
						offset: 4,
						angle: 20,
						width: 1,
						color: '#bf7e77',
						grain: 42,
					},
				],
				[
					'stackShadow',
					{ count: 1, offset: 3, angle: 190, color: '#bcc5b8' },
				],
			],
			null,
			null
		),
	},
	{
		id: 'stamped',
		label: __( 'Stamped', 'wunderpaint' ),
		group: 'print',
		patch: recipe(
			'#9c5b65',
			[
				[ 'grunge', { amount: 38, scale: 90, seed: 9 } ],
				[ 'letterpress', { depth: 3, shine: 25 } ],
				[
					'dashedOutline',
					{ width: 1, dash: 6, gap: 4, color: '#d9bca2' },
				],
			],
			null,
			null
		),
	},
	{
		id: 'kawaii',
		label: __( 'Kawaii', 'wunderpaint' ),
		group: 'soft',
		patch: recipe(
			'#e8c2d2',
			[
				[
					'candyGel',
					{
						color: '#efd0de',
						color2: '#b58eb5',
						depth: 65,
						shine: 85,
					},
				],
				[ 'sticker', { size: 7, color: '#c1e2d8', shadow: 28 } ],
				[
					'sparkle',
					{ count: 3, size: 12, color: '#fff7e2', glow: 60, seed: 7 },
				],
			],
			null,
			null
		),
	},
	{
		id: 'disco',
		label: __( 'Disco', 'wunderpaint' ),
		group: 'light',
		patch: recipe(
			'#baaad3',
			[
				[
					'chrome',
					{ color: '#c7afdf', contrast: 88, relief: 35, shine: 95 },
				],
				[
					'sparkle',
					{ count: 7, size: 13, color: '#fff1d8', glow: 60, seed: 3 },
				],
				[
					'burst',
					{ count: 16, length: 32, gap: 32, color: '#ab84ba' },
				],
			],
			null,
			null
		),
	},
	{
		id: 'racing',
		label: __( 'Racing', 'wunderpaint' ),
		group: 'depth',
		patch: recipe(
			'#d8d4c7',
			[
				[
					'checker',
					{
						size: 9,
						color: '#384250',
						color2: '#ede2d1',
						relief: 45,
					},
				],
				[
					'extrude',
					{
						depth: 5,
						angle: 90,
						color: '#925c61',
						color2: '#ca8c78',
					},
				],
				[ 'motionBlur', { length: 48, angle: 180, opacity: 60 } ],
				[ 'skew', { x: -15, y: 0 } ],
			],
			null,
			null
		),
	},
	{
		id: 'midnight',
		label: __( 'Midnight', 'wunderpaint' ),
		group: 'metal',
		patch: recipe(
			'#6b86b0',
			[
				[
					'chrome',
					{
						color: '#8d9fc3',
						contrast: 95,
						shine: 70,
						relief: 45,
						lightAngle: 110,
					},
				],
				[ 'glow', { color: '#506fbb', size: 12, intensity: 48 } ],
				[
					'sparkle',
					{
						count: 4,
						size: 10,
						color: '#e6e9ff',
						glow: 65,
						seed: 11,
					},
				],
			],
			null,
			null
		),
	},
	{
		id: 'frost',
		label: __( 'Frost', 'wunderpaint' ),
		group: 'glass',
		patch: recipe(
			'#c3e4e9',
			[
				[
					'frostedCrystal',
					{
						color: '#d6eeee',
						color2: '#85b7cc',
						depth: 65,
						scale: 18,
						shine: 80,
					},
				],
				[
					'sparkle',
					{ count: 4, size: 10, color: '#ffffff', glow: 35, seed: 5 },
				],
				[ 'glow', { color: '#a6d4e8', size: 10, intensity: 28 } ],
			],
			null,
			null
		),
	},
	{
		id: 'sunsetStack',
		label: __( 'Sunset stack', 'wunderpaint' ),
		group: 'depth',
		patch: recipe(
			'#f2c6a4',
			[
				[
					'stackShadow',
					{
						angle: 40,
						offset: 7,
						count: 3,
						color: '#aa6a7b',
						color2: '#875e79',
						color3: '#dfa882',
					},
				],
				[ 'bevel', { depth: 4, shine: 45 } ],
			],
			[ '#f8e1b4', '#eeb295', '#d1838d' ],
			null
		),
	},
	{
		id: 'ocean',
		label: __( 'Ocean', 'wunderpaint' ),
		group: 'mineral',
		patch: recipe(
			'#8dcdd2',
			[
				[
					'waves',
					{
						size: 60,
						amp: 7,
						color: '#b7e6db',
						color2: '#4c84a8',
						relief: 80,
					},
				],
				[ 'shine', { width: 14, opacity: 32, pos: 40, angle: 120 } ],
				[ 'reflection', { gap: 2, alpha: 32, fade: 88 } ],
			],
			null,
			null
		),
	},
	{
		id: 'mermaid',
		label: __( 'Mermaid', 'wunderpaint' ),
		group: 'mineral',
		patch: recipe(
			'#93d1c7',
			[
				[
					'waves',
					{
						size: 38,
						amp: 5,
						color: '#afe9d1',
						color2: '#8d71b2',
						relief: 72,
					},
				],
				[ 'bevel', { depth: 4, shine: 85 } ],
				[
					'sparkle',
					{ count: 4, size: 10, color: '#f8ecd5', glow: 48, seed: 6 },
				],
			],
			null,
			[ '#51848c', 1 ]
		),
	},
	{
		id: 'soda',
		label: __( 'Soda', 'wunderpaint' ),
		group: 'glass',
		patch: recipe(
			'#e6ab78',
			[
				[
					'bubbles',
					{
						count: 30,
						size: 7,
						color: '#ffedca',
						shine: 90,
						seed: 4,
					},
				],
				[ 'bevel', { depth: 5, shine: 80 } ],
				[ 'sticker', { size: 3, color: '#fff0d5', shadow: 22 } ],
			],
			[ '#f6d9a2', '#e9af78', '#cc7c6b' ],
			null
		),
	},
	{
		id: 'champagne',
		label: __( 'Champagne', 'wunderpaint' ),
		group: 'metal',
		patch: recipe(
			'#dbc999',
			[
				[
					'foil',
					{ color: '#e7d49b', sparkles: 5, relief: 42, seed: 3 },
				],
				[
					'bubbles',
					{
						count: 18,
						size: 5,
						color: '#fff5da',
						shine: 92,
						seed: 9,
					},
				],
			],
			null,
			null
		),
	},
	{
		id: 'stone',
		label: __( 'Stone', 'wunderpaint' ),
		group: 'mineral',
		patch: recipe(
			'#9da8ad',
			[
				[ 'bevel', { depth: 6, shine: 28 } ],
				[ 'cracks', { count: 8, width: 1, color: '#3f5262', seed: 5 } ],
				[ 'grunge', { amount: 9, scale: 115, seed: 2 } ],
			],
			[ '#ccd0c7', '#99a5a8', '#6c7b8b' ],
			null
		),
	},
	{
		id: 'iceberg',
		label: __( 'Iceberg', 'wunderpaint' ),
		group: 'glass',
		patch: recipe(
			'#b4dce5',
			[
				[
					'crystalCells',
					{
						color: '#dbf2e9',
						color2: '#719bc3',
						depth: 72,
						scale: 25,
						shine: 96,
					},
				],
				[
					'glassShards',
					{
						color: '#b6e3e7',
						color2: '#6e9dc1',
						amount: 15,
						depth: 16,
						scale: 65,
						angle: 80,
					},
				],
			],
			null,
			null
		),
	},
	{
		id: 'saleSeal',
		label: __( 'Sale seal', 'wunderpaint' ),
		group: 'marks',
		patch: recipe(
			'#fff0d3',
			[
				[
					'seal',
					{
						points: 18,
						pad: 18,
						depth: 10,
						color: '#b8796e',
						color2: '#754d60',
						relief: 75,
					},
				],
				[ 'bevel', { depth: 2, shine: 30 } ],
			],
			null,
			null
		),
	},
	{
		id: 'priceStar',
		label: __( 'Price star', 'wunderpaint' ),
		group: 'marks',
		patch: recipe(
			'#72533f',
			[
				[
					'seal',
					{
						points: 12,
						pad: 18,
						depth: 16,
						color: '#e5c789',
						color2: '#a7825b',
						relief: 65,
					},
				],
				[ 'letterpress', { depth: 3, shine: 45 } ],
			],
			null,
			null
		),
	},
	{
		id: 'editorial',
		label: __( 'Editorial', 'wunderpaint' ),
		group: 'print',
		patch: recipe(
			'#3b4c58',
			[
				[
					'hatchShadow',
					{
						offset: 11,
						angle: 38,
						gap: 4,
						width: 1,
						color: '#8ea8af',
					},
				],
				[ 'inline', { inset: 3, width: 1, color: '#e6d7be' } ],
			],
			null,
			null
		),
	},
	{
		id: 'loveNote',
		label: __( 'Love note', 'wunderpaint' ),
		group: 'print',
		patch: recipe(
			'#dba2ae',
			[
				[
					'motifFill',
					{
						style: 0,
						size: 16,
						color: '#f6ddcc',
						bg: '#bd7d98',
						relief: 40,
					},
				],
				[ 'bevel', { depth: 3, shine: 55 } ],
				[
					'extrude',
					{
						depth: 5,
						angle: 45,
						color: '#865471',
						color2: '#ba8091',
					},
				],
			],
			null,
			null
		),
	},
	{
		id: 'starry',
		label: __( 'Starry', 'wunderpaint' ),
		group: 'print',
		patch: recipe(
			'#58688c',
			[
				[
					'motifFill',
					{
						style: 1,
						size: 17,
						color: '#e7cd91',
						bg: '#495475',
						relief: 30,
					},
				],
				[ 'glow', { color: '#5c78ab', size: 9, intensity: 25 } ],
				[
					'sparkle',
					{ count: 3, size: 9, color: '#fff1c7', glow: 40, seed: 6 },
				],
			],
			null,
			null
		),
	},
	{
		id: 'circuitBoard',
		label: __( 'Circuit', 'wunderpaint' ),
		group: 'woven',
		patch: recipe(
			'#74b6a7',
			[
				[
					'circuit',
					{ size: 22, color: '#96dabb', bg: '#263e4f', relief: 75 },
				],
				[ 'glow', { color: '#72c7b4', size: 11, intensity: 40 } ],
				[
					'extrude',
					{
						depth: 8,
						angle: 35,
						color: '#263948',
						color2: '#56818a',
					},
				],
			],
			null,
			null
		),
	},
	{
		id: 'terminal',
		label: __( 'Terminal', 'wunderpaint' ),
		group: 'light',
		patch: recipe(
			'#8ed8b3',
			[
				[
					'dotMatrix',
					{ size: 6, color: '#b2e3a8', bg: '#233b37', glow: 7 },
				],
				[ 'scanlines', { gap: 7, width: 1, opacity: 18 } ],
			],
			null,
			[ '#5e8c7d', 1 ]
		),
	},
	{
		id: 'army',
		label: __( 'Army', 'wunderpaint' ),
		group: 'mineral',
		patch: recipe(
			'#9ba78b',
			[
				[
					'camo',
					{
						size: 24,
						seed: 8,
						bg: '#9ca58b',
						color: '#617768',
						color2: '#c6bba2',
						color3: '#455b61',
						relief: 42,
					},
				],
				[ 'grunge', { amount: 20, scale: 105, seed: 6 } ],
				[ 'letterpress', { depth: 2, shine: 22 } ],
			],
			null,
			null
		),
	},
	{
		id: 'highland',
		label: __( 'Highland', 'wunderpaint' ),
		group: 'woven',
		patch: recipe(
			'#b18a7e',
			[
				[
					'plaid',
					{
						size: 30,
						bg: '#b88977',
						color: '#495b70',
						color2: '#dfcc9f',
						relief: 65,
					},
				],
				[ 'bevel', { depth: 3, shine: 38 } ],
				[
					'dashedOutline',
					{ width: 1, dash: 5, gap: 4, color: '#e7cf9c' },
				],
			],
			null,
			null
		),
	},
	{
		id: 'gingham',
		label: __( 'Gingham', 'wunderpaint' ),
		group: 'woven',
		patch: recipe(
			'#c8d5cd',
			[
				[
					'plaid',
					{
						size: 18,
						bg: '#e4dfce',
						color: '#819cac',
						color2: '#c3908b',
						relief: 32,
					},
				],
				[ 'bevel', { depth: 2, shine: 30 } ],
				[ 'sticker', { size: 4, color: '#f2e6cc', shadow: 20 } ],
			],
			null,
			null
		),
	},
	{
		id: 'poolside',
		label: __( 'Poolside', 'wunderpaint' ),
		group: 'mineral',
		patch: recipe(
			'#9edbce',
			[
				[
					'waves',
					{
						size: 38,
						amp: 4,
						color: '#b6edd8',
						color2: '#5c9fab',
						relief: 70,
					},
				],
				[ 'shine', { width: 20, opacity: 55, pos: 45, angle: 125 } ],
				[ 'ripple', { amp: 3, size: 65 } ],
				[ 'bevel', { depth: 4, shine: 80 } ],
			],
			null,
			null
		),
	},
	{
		id: 'mirage',
		label: __( 'Mirage', 'wunderpaint' ),
		group: 'transform',
		patch: recipe(
			'#e2b487',
			[
				[ 'ripple', { amp: 6, size: 34 } ],
				[ 'fade', { angle: 90, amount: 48, midpoint: 40 } ],
				[
					'longShadow',
					{ angle: 105, length: 18, color: '#a7776d', fade: 88 },
				],
			],
			[ '#f5dfa9', '#deb083', '#b27d86' ],
			null
		),
	},
	{
		id: 'goldRing',
		label: __( 'Gold ring', 'wunderpaint' ),
		group: 'contour',
		patch: recipe(
			'#33404d',
			[
				[
					'gradientOutline',
					{
						width: 4,
						angle: 90,
						color: '#f2d7a1',
						color2: '#a27f5c',
					},
				],
				[ 'inline', { inset: 3, width: 1, color: '#d9b881' } ],
				[
					'extrude',
					{
						depth: 5,
						angle: 70,
						color: '#4b444c',
						color2: '#96755e',
					},
				],
			],
			null,
			null
		),
	},
	{
		id: 'neonRing',
		label: __( 'Neon ring', 'wunderpaint' ),
		group: 'contour',
		patch: recipe(
			'#34445e',
			[
				[
					'gradientOutline',
					{
						width: 4,
						angle: 35,
						color: '#a1dfd2',
						color2: '#c394cc',
					},
				],
				[ 'glow', { color: '#9575b8', size: 16, intensity: 70 } ],
			],
			null,
			null
		),
	},
	{
		id: 'diner',
		label: __( 'Retro diner', 'wunderpaint' ),
		group: 'depth',
		patch: recipe(
			'#f3dfbd',
			[
				[ 'inline', { inset: 4, width: 1, color: '#a3636d' } ],
				[
					'stackShadow',
					{
						angle: 135,
						offset: 4,
						count: 3,
						color: '#6b9c9c',
						color2: '#b98179',
						color3: '#d5b283',
					},
				],
			],
			null,
			[ '#905e67', 2 ]
		),
	},
	{
		id: 'bumblebee',
		label: __( 'Bumblebee', 'wunderpaint' ),
		group: 'print',
		patch: recipe(
			'#e6c88a',
			[
				[
					'stripesFill',
					{
						width: 10,
						angle: 0,
						color: '#e7ce93',
						color2: '#3d4859',
						color3: '#e7ce93',
						relief: 55,
					},
				],
				[ 'bevel', { depth: 4, shine: 65 } ],
				[ 'sticker', { size: 3, color: '#f5e6ca', shadow: 25 } ],
			],
			null,
			null
		),
	},
	{
		id: 'hazard',
		label: __( 'Hazard', 'wunderpaint' ),
		group: 'depth',
		patch: recipe(
			'#d9b779',
			[
				[
					'stripesFill',
					{
						width: 15,
						angle: 40,
						color: '#dbbd7d',
						color2: '#3c4858',
						color3: '#3c4858',
						relief: 65,
					},
				],
				[
					'extrude',
					{
						depth: 10,
						angle: 100,
						color: '#334456',
						color2: '#8f8878',
					},
				],
			],
			null,
			[ '#293b49', 1 ]
		),
	},
	{
		id: 'peppermint',
		label: __( 'Peppermint', 'wunderpaint' ),
		group: 'soft',
		patch: recipe(
			'#dbaab5',
			[
				[
					'stripesFill',
					{
						width: 7,
						angle: 35,
						color: '#b8778a',
						color2: '#f4e3d3',
						color3: '#d9a7b1',
						relief: 75,
					},
				],
				[ 'bevel', { depth: 4, shine: 92 } ],
				[
					'extrude',
					{
						depth: 5,
						angle: 45,
						color: '#507f79',
						color2: '#9cc1ab',
					},
				],
			],
			null,
			null
		),
	},
	{
		id: 'galaxy',
		label: __( 'Galaxy', 'wunderpaint' ),
		group: 'mineral',
		patch: recipe(
			'#aa94dd',
			[
				[
					'marbleVeins',
					{
						color: '#c3b2e9',
						color2: '#585287',
						depth: 65,
						scale: 36,
						shine: 85,
					},
				],
				[ 'glow', { color: '#9b75ce', size: 12, intensity: 48 } ],
				[
					'sparkle',
					{ count: 9, size: 9, color: '#f5eaf8', glow: 70, seed: 13 },
				],
			],
			null,
			null
		),
	},
	{
		id: 'denim',
		label: __( 'Denim', 'wunderpaint' ),
		group: 'woven',
		patch: recipe(
			'#6883a1',
			[
				[
					'plaid',
					{
						size: 14,
						bg: '#6d86a3',
						color: '#4e678a',
						color2: '#8199b2',
						relief: 55,
					},
				],
				[
					'dashedOutline',
					{ width: 2, dash: 4, gap: 3, color: '#e2bb82' },
				],
				[ 'bevel', { depth: 2, shine: 25 } ],
			],
			null,
			null
		),
	},
	{
		id: 'chalk',
		label: __( 'Chalk', 'wunderpaint' ),
		group: 'print',
		patch: recipe(
			'#dce8d9',
			[
				[ 'grunge', { amount: 58, scale: 65, seed: 8 } ],
				[
					'sketch',
					{
						passes: 2,
						width: 1,
						rough: 2,
						seed: 4,
						color: '#cddfd8',
					},
				],
				[
					'hatchShadow',
					{
						offset: 5,
						angle: 40,
						gap: 3,
						width: 1,
						color: '#5a7579',
					},
				],
			],
			null,
			null
		),
	},
	{
		id: 'horror',
		label: __( 'Horror', 'wunderpaint' ),
		group: 'soft',
		patch: recipe(
			'#ab485b',
			[
				[
					'drip',
					{
						count: 7,
						length: 45,
						color: '#952e46',
						shine: 75,
						seed: 2,
					},
				],
				[ 'bevel', { depth: 5, shine: 55 } ],
				[ 'cracks', { count: 6, width: 1, color: '#34293d', seed: 6 } ],
				[ 'grunge', { amount: 18, scale: 100, seed: 11 } ],
				[ 'glow', { color: '#7c2346', size: 10, intensity: 40 } ],
			],
			[ '#c67676', '#ac425a', '#682a48' ],
			null
		),
	},
	{
		id: 'goldenTicket',
		label: __( 'Golden ticket', 'wunderpaint' ),
		group: 'marks',
		patch: recipe(
			'#715a45',
			[
				[
					'seal',
					{
						points: 24,
						pad: 18,
						depth: 9,
						color: '#d6b780',
						color2: '#997a57',
						relief: 80,
					},
				],
				[ 'bevel', { depth: 3, shine: 55 } ],
				[
					'sparkle',
					{ count: 4, size: 10, color: '#fff1d2', glow: 45, seed: 6 },
				],
			],
			null,
			null
		),
	},
	{
		id: 'boom',
		label: __( 'Boom', 'wunderpaint' ),
		group: 'marks',
		patch: recipe(
			'#e3b88e',
			[
				[
					'comicDots',
					{ size: 5, bg: '#f0d39e', color: '#ae666d', relief: 10 },
				],
				[
					'burst',
					{ count: 22, length: 36, gap: 34, color: '#b47b80' },
				],
				[
					'extrude',
					{
						depth: 8,
						angle: 80,
						color: '#855666',
						color2: '#be8375',
					},
				],
				[ 'skew', { x: -10, y: -3 } ],
			],
			null,
			[ '#414151', 2 ]
		),
	},
];
