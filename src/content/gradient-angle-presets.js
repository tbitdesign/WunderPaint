/** Closed color ramps for a full turn, loaded with the existing preset pack. */
import { __ } from '@wordpress/i18n';

export function anglePresets() {
	const palettes = [
		[
			__( 'Spectrum sweep', 'wunderpaint' ),
			[
				'#e94057',
				'#f3a536',
				'#e8df55',
				'#39b998',
				'#327bc7',
				'#8754b5',
				'#e94057',
			],
		],
		[
			__( 'Copper sweep', 'wunderpaint' ),
			[
				'#52261c',
				'#ba6841',
				'#f8d3a0',
				'#a85532',
				'#3b231f',
				'#c88155',
				'#ffe3b5',
				'#52261c',
			],
		],
		[
			__( 'Steel sweep', 'wunderpaint' ),
			[
				'#303c4b',
				'#a4b4c6',
				'#f0f5fa',
				'#61758a',
				'#263445',
				'#c2d2e1',
				'#ffffff',
				'#303c4b',
			],
		],
		[
			__( 'Pearl sweep', 'wunderpaint' ),
			[
				'#b7b4d4',
				'#f9e7ee',
				'#fff6df',
				'#c6e5df',
				'#e6e3f6',
				'#f4d9e5',
				'#b7b4d4',
			],
		],
		[
			__( 'Sunset sweep', 'wunderpaint' ),
			[
				'#433060',
				'#a64679',
				'#ec7965',
				'#ffd09a',
				'#da735f',
				'#743d74',
				'#433060',
			],
		],
		[
			__( 'Aurora sweep', 'wunderpaint' ),
			[
				'#152e56',
				'#27779a',
				'#57d5b0',
				'#b1eed0',
				'#8265bf',
				'#504277',
				'#152e56',
			],
		],
		[
			__( 'Prism wheel', 'wunderpaint' ),
			[
				'#6444a7',
				'#ee70ab',
				'#ffc57e',
				'#fff0af',
				'#6dd6cc',
				'#629dde',
				'#6444a7',
			],
		],
		[
			__( 'Soft pinwheel', 'wunderpaint' ),
			[
				'#4a667d',
				'#d6e8e2',
				'#789b9e',
				'#e8dce9',
				'#89749b',
				'#f6e6cc',
				'#4a667d',
			],
		],
	];
	return palettes.map( ( [ name, colors ] ) => ( {
		name,
		kind: 'angle',
		stops: colors.map( ( color, i ) => ( {
			at: i / ( colors.length - 1 ),
			color,
		} ) ),
	} ) );
}
