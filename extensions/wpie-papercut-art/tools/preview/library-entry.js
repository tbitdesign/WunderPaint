/** Browser-only QA adapter; bundled into the temporary QA stage, never shipped. */
import { PaperEngine } from '../../src/ui/engine.js';
import {
	cleanParams,
	defaultParams,
	defaultLayer,
	defaultObject,
	PRESETS,
} from '../../src/core/model.js';
import {
	EXTRA_WINDOWS,
	EXTRA_TREES,
	EXTRA_PLANTS,
	LANDFORMS,
	DECORATIONS,
} from '../../src/core/library.js';
const engine = new PaperEngine( document.createElement( 'canvas' ) );
const samples = [
	...EXTRA_WINDOWS.map( ( e ) => ( { ...e, kind: 'frame', window: e.id } ) ),
	...EXTRA_TREES.map( ( e ) => ( { ...e, kind: 'trees', species: e.id } ) ),
	...EXTRA_PLANTS.map( ( e ) => ( { ...e, kind: 'plants', species: e.id } ) ),
	...LANDFORMS.map( ( e ) => ( { ...e, kind: 'landform', variant: e.id } ) ),
	...DECORATIONS.map( ( e ) => ( {
		...e,
		kind: 'decoration',
		variant: e.id,
	} ) ),
];
window.__pcaLibrary = {
	samples,
	scenes: PRESETS.filter( ( p ) => p.theme ).map(
		( { id, label, theme } ) => ( { id, label, theme } )
	),
	render( entry, look, width = 360 ) {
		engine.setSize( width, Math.round( ( width * 2 ) / 3 ) );
		const preset = PRESETS.find( ( p ) => p.id === entry.id );
		const layers = [
			defaultLayer( { objects: [ defaultObject( 'backdrop' ) ] } ),
			defaultLayer( {
				objects: [
					defaultObject( entry.kind, {
						...entry,
						id: 'sample',
						x: 0.5,
						y: 0.88,
						scale: entry.kind === 'landform' ? 60 : 67,
						count: 1,
						spread: 0,
						vary: 0,
						stretch: 100,
						seed: 41,
					} ),
				],
			} ),
		];
		const params = cleanParams( {
			...defaultParams(),
			...( preset ? preset.patch() : { layers } ),
			photo: { source: 'none' },
			...( look ? { look } : {} ),
		} );
		engine.build( params );
		engine.render();
		return {
			url: engine.canvas.toDataURL(),
			layers: engine.allLayers().length,
			empty: engine.allLayers().filter( ( l ) => ! l.rings.length )
				.length,
		};
	},
};
