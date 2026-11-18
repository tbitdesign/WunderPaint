import { __ } from '@wordpress/i18n';
import { TOOLS } from '../store/constants';
import { siteStorage } from './local-storage';

const tool = ( id ) => ( { tool: id } );
const core = ( id ) => ( { core: id } );
const studio = ( id, icon ) => ( { studio: id, icon } );
const group = ( id, label, items ) => ( { id, label, items } );

// Curated launchers only. Studios stay in the existing extension registry;
// selecting a theme does not load them or change the document/workspace.
// A theme named like an Extensions-menu category shows exactly that
// category's studios (v1.433; editor-themes.test.js holds it against the
// manifests), so the 3D studios live in the 3D theme only. The other
// themes gather studios freely around one kind of work.
export const EDITOR_THEMES = [
	{
		id: 'art',
		label: () => __( 'Art & Painting', 'wunderpaint' ),
		description: () =>
			__( 'Draw, experiment and transform.', 'wunderpaint' ),
		groups: [
			group( 'paint', () => __( 'Painting tools', 'wunderpaint' ), [
				tool( 'brush' ),
				tool( 'pencil' ),
				tool( 'eraser' ),
				tool( 'bucket' ),
				tool( 'gradient' ),
				core( 'color' ),
			] ),
			group( 'create', () => __( 'Create artwork', 'wunderpaint' ), [
				studio( 'wpie-chaos-art/piece', 'sparkles' ),
				studio( 'wpie-particle-strokes/strokes', 'brush' ),
				studio( 'wpie-marbling-studio/marbling', 'palette' ),
				studio( 'wpie-light-lab/scene', 'sun' ),
				studio( 'wpie-performance-art/block', 'camera' ),
				studio( 'wpie-papercut-art/scene', 'layers' ),
			] ),
			group( 'transform', () => __( 'Transform images', 'wunderpaint' ), [
				studio( 'wpie-image-synth/chain', 'fx' ),
				studio( 'wpie-growth-decay/sim', 'refresh' ),
				studio( 'wpie-image-matter/scene', 'grid' ),
				studio( 'wpie-darkroom/print', 'moon' ),
				studio( 'wpie-photo-mosaic/mosaic', 'image' ),
			] ),
		],
	},
	{
		id: 'vector',
		label: () => __( 'Vector & Shapes', 'wunderpaint' ),
		description: () =>
			__( 'Draw paths, build shapes and arrange.', 'wunderpaint' ),
		groups: [
			group( 'draw', () => __( 'Drawing tools', 'wunderpaint' ), [
				tool( 'pen' ),
				tool( 'shape' ),
				tool( 'repeat' ),
				tool( 'gradient' ),
			] ),
			group( 'arrange', () => __( 'Arrange', 'wunderpaint' ), [
				tool( 'move' ),
				tool( 'select' ),
				core( 'guides' ),
				core( 'layers' ),
			] ),
			group( 'create', () => __( 'Create artwork', 'wunderpaint' ), [
				studio( 'wpie-contour-studio/contour', 'pen' ),
				studio( 'wpie-generative-studio/art', 'sparkles' ),
				studio( 'wpie-drawing-templates/sheet', 'pencil' ),
				core( 'icons' ),
			] ),
		],
	},
	{
		id: 'photo',
		label: () => __( 'Photo & Retouch', 'wunderpaint' ),
		description: () =>
			__( 'Refine details, isolate and finish.', 'wunderpaint' ),
		groups: [
			group( 'retouch', () => __( 'Retouch', 'wunderpaint' ), [
				tool( 'fxbrush' ),
				tool( 'stamp' ),
				tool( 'eraser' ),
				tool( 'crop' ),
			] ),
			group( 'isolate', () => __( 'Select & Mask', 'wunderpaint' ), [
				tool( 'marquee' ),
				tool( 'wand' ),
				tool( 'smartselect' ),
				core( 'mask' ),
			] ),
			group( 'finish', () => __( 'Finish', 'wunderpaint' ), [
				core( 'adjust' ),
				core( 'effects' ),
				core( 'color' ),
				core( 'vignette' ),
			] ),
		],
	},
	{
		id: 'type',
		label: () => __( 'Text & Typography', 'wunderpaint' ),
		description: () =>
			__( 'Set type and turn words into artwork.', 'wunderpaint' ),
		groups: [
			group( 'edit', () => __( 'Text styling', 'wunderpaint' ), [
				tool( 'text' ),
				core( 'color' ),
				core( 'properties' ),
				core( 'effects' ),
			] ),
			group( 'lettering', () => __( 'Lettering', 'wunderpaint' ), [
				studio( 'wpie-type-flow-studio/flow', 'textCurve' ),
				studio( 'wpie-text-art/sheet', 'text' ),
				studio( 'wpie-handwriting-fonts/studio', 'pencil' ),
				studio( 'wpie-font-finder/open', 'search' ),
			] ),
			group( 'resources', () => __( 'Resources', 'wunderpaint' ), [
				core( 'library' ),
				core( 'icons' ),
				core( 'contrast' ),
				core( 'brand' ),
			] ),
		],
	},
	{
		id: 'patterns',
		label: () => __( 'Patterns & Backgrounds', 'wunderpaint' ),
		description: () =>
			__( 'Build repeats, textures and surfaces.', 'wunderpaint' ),
		groups: [
			group( 'tools', () => __( 'Surface tools', 'wunderpaint' ), [
				tool( 'gradient' ),
				tool( 'bucket' ),
				tool( 'repeat' ),
				core( 'color' ),
			] ),
			group( 'create', () => __( 'Create patterns', 'wunderpaint' ), [
				core( 'background' ),
				studio( 'wpie-pattern-generator/pattern', 'grid' ),
				studio( 'wpie-generative-studio/art', 'sparkles' ),
				studio( 'wpie-marbling-studio/marbling', 'palette' ),
			] ),
			group( 'explore', () => __( 'Explore variations', 'wunderpaint' ), [
				studio( 'wpie-image-synth/chain', 'fx' ),
				studio( 'wpie-growth-decay/sim', 'refresh' ),
				core( 'patterns' ),
				core( 'schemes' ),
			] ),
		],
	},
	{
		id: 'layout',
		label: () => __( 'Layout & Branding', 'wunderpaint' ),
		description: () =>
			__( 'Compose layouts and present your brand.', 'wunderpaint' ),
		groups: [
			group( 'layout', () => __( 'Layout tools', 'wunderpaint' ), [
				tool( 'move' ),
				tool( 'shape' ),
				tool( 'text' ),
				tool( 'crop' ),
			] ),
			group( 'compose', () => __( 'Compose', 'wunderpaint' ), [
				core( 'background' ),
				core( 'collage' ),
				core( 'mockup' ),
				core( 'beautify' ),
			] ),
			group( 'brand', () => __( 'Brand & Assets', 'wunderpaint' ), [
				core( 'brand' ),
				core( 'schemes' ),
				studio( 'wpie-banner-studio/studio', 'image' ),
				core( 'library' ),
			] ),
		],
	},
	{
		id: '3d',
		label: () => __( '3D & Scenes', 'wunderpaint' ),
		description: () =>
			__( 'Build objects, worlds and presentations.', 'wunderpaint' ),
		groups: [
			group(
				'objects',
				() => __( 'Objects & Characters', 'wunderpaint' ),
				[
					studio( 'wpie-3d-objects-studio/object', 'smart' ),
					studio( 'wpie-3d-pose-studio/pose', 'move' ),
					studio( 'wpie-molecule-studio/molecule', 'link' ),
					studio( 'wpie-3d-text-studio/text', 'text' ),
				]
			),
			group( 'worlds', () => __( 'Worlds & Scenes', 'wunderpaint' ), [
				studio( 'wpie-3d-earth-studio/earth', 'rotateCw' ),
				studio( 'wpie-solar-system-studio/orrery', 'sun' ),
				studio( 'wpie-particle-studio/particles', 'sparkles' ),
			] ),
			group( 'present', () => __( 'Present', 'wunderpaint' ), [
				// The package intentionally registers under its older prefix.
				studio( 'wpie-3d-mockups/studio', 'smart' ),
				studio( 'wpie-3d-gallery-studio/gallery', 'image' ),
				studio( 'wpie-flipbook/book', 'layers' ),
				studio( 'wpie-textile-studio/textile', 'shape' ),
			] ),
		],
	},
	{
		id: 'motion',
		label: () => __( 'Motion & Video', 'wunderpaint' ),
		description: () =>
			__( 'Animate images and create moving scenes.', 'wunderpaint' ),
		groups: [
			group( 'prepare', () => __( 'Prepare', 'wunderpaint' ), [
				core( 'color' ),
				core( 'background' ),
				core( 'panorama' ),
				core( 'timeline' ),
			] ),
			group( 'animate', () => __( 'Animate', 'wunderpaint' ), [
				studio( 'wpie-3d-animation-studio/animation', 'move' ),
				studio( 'wpie-3d-effects-studio/effects', 'fx' ),
				studio( 'wpie-fx-studio/fx', 'image' ),
			] ),
		],
	},
	{
		id: 'posters',
		label: () => __( 'Maps & Posters', 'wunderpaint' ),
		description: () =>
			__( 'Turn places, skies and songs into posters.', 'wunderpaint' ),
		groups: [
			group( 'places', () => __( 'Places', 'wunderpaint' ), [
				studio( 'wpie-map-studio/map', 'image' ),
				studio( 'wpie-city-diorama/scene', 'grid' ),
				studio( 'wpie-route-visualizer/route', 'pen' ),
			] ),
			group( 'moments', () => __( 'Moments', 'wunderpaint' ), [
				studio( 'wpie-star-map/sky', 'sparkles' ),
				studio( 'wpie-soundwave/wave', 'fx' ),
				studio( 'wpie-mystic-studio/card', 'moon' ),
			] ),
		],
	},
	{
		id: 'print',
		label: () => __( 'Print & Craft', 'wunderpaint' ),
		description: () =>
			__( 'Make activity sheets, printables and crafts.', 'wunderpaint' ),
		groups: [
			group( 'craft', () => __( 'Craft', 'wunderpaint' ), [
				studio( 'wpie-origami/studio', 'shape' ),
				studio( 'wpie-stitch-patterns/chart', 'grid' ),
				studio( 'wpie-drawing-templates/sheet', 'pencil' ),
				studio( 'wpie-papercut-art/scene', 'layers' ),
			] ),
			group(
				'activities',
				() => __( 'Activities & Gifts', 'wunderpaint' ),
				[
					studio( 'wpie-puzzle-sheets/sheet', 'puzzle' ),
					studio( 'wpie-party-printables/sheet', 'sparkles' ),
				]
			),
		],
	},
	{
		id: 'data',
		label: () => __( 'Data & Diagrams', 'wunderpaint' ),
		description: () =>
			__( 'Explain information with clear visuals.', 'wunderpaint' ),
		groups: [
			group( 'explain', () => __( 'Explain', 'wunderpaint' ), [
				core( 'chart' ),
				studio( 'wpie-diagram-studio/diagram2', 'link' ),
				studio( 'wpie-math-figures/figure', 'shape' ),
				studio( 'wpie-sheet-music/sheet', 'list' ),
			] ),
			group( 'organize', () => __( 'Plan & Document', 'wunderpaint' ), [
				studio( 'wpie-smart-edit/studio', 'shape' ),
				studio( 'wpie-calendar/calendar', 'grid' ),
				studio( 'wpie-day-ring/ring', 'history' ),
				studio( 'wpie-step-guides/guide', 'arrDown' ),
			] ),
			group( 'codes', () => __( 'Code & QR', 'wunderpaint' ), [
				studio( 'wpie-code-shot/code', 'text' ),
				core( 'qr' ),
			] ),
		],
	},
	{
		id: 'content',
		label: () => __( 'Content & Automation', 'wunderpaint' ),
		description: () =>
			__( 'Connect designs to content and reuse them.', 'wunderpaint' ),
		groups: [
			group( 'templates', () => __( 'Dynamic designs', 'wunderpaint' ), [
				core( 'templates' ),
				core( 'post-preview' ),
				studio( 'wpie-showcase-studio/showcase', 'layers' ),
				studio( 'wpie-format-pack/formats', 'crop' ),
			] ),
			group( 'generate', () => __( 'Generate', 'wunderpaint' ), [
				core( 'design' ),
				core( 'ai' ),
				core( 'create-content' ),
				core( 'content-templates' ),
			] ),
			group( 'automate', () => __( 'Automate', 'wunderpaint' ), [
				core( 'featured' ),
				core( 'batch' ),
				core( 'csv' ),
				core( 'actions' ),
			] ),
		],
	},
];

const opener = ( label, icon, open, options = {} ) => ( {
	label,
	icon,
	open,
	...options,
} );
const tab = ( label, icon, rightTab ) => ( { label, icon, rightTab } );
export const THEME_CORE_ACTIONS = {
	color: {
		label: () => __( 'Color', 'wunderpaint' ),
		icon: 'palette',
		command: 'color',
	},
	mask: {
		label: () => __( 'Mask', 'wunderpaint' ),
		icon: 'mask',
		command: 'mask',
	},
	timeline: {
		label: () => __( 'Timeline', 'wunderpaint' ),
		icon: 'history',
		command: 'timeline',
	},
	layers: tab( () => __( 'Layers', 'wunderpaint' ), 'layers', 'layers' ),
	properties: tab(
		() => __( 'Properties', 'wunderpaint' ),
		'sliders',
		'props'
	),
	adjust: tab( () => __( 'Adjust', 'wunderpaint' ), 'adjust', 'adjust' ),
	effects: tab( () => __( 'Effects', 'wunderpaint' ), 'fx', 'effects' ),
	ai: tab( () => __( 'AI Studio', 'wunderpaint' ), 'sparkles', 'ai' ),
	guides: opener(
		() => __( 'Guides & Grid', 'wunderpaint' ),
		'grid',
		'openGuides'
	),
	icons: opener( () => __( 'Icons', 'wunderpaint' ), 'shape', 'openIcons' ),
	vignette: opener(
		() => __( 'Vignette & Film', 'wunderpaint' ),
		'camera',
		'openVignette'
	),
	library: opener(
		() => __( 'Asset Library', 'wunderpaint' ),
		'folder',
		'openLibrary'
	),
	contrast: opener(
		() => __( 'Check Contrast', 'wunderpaint' ),
		'eye',
		'openContrast'
	),
	brand: opener(
		() => __( 'Brand Kits', 'wunderpaint' ),
		'palette',
		'openBrandKits',
		{ permission: 'canManageKits' }
	),
	background: opener(
		() => __( 'Background Studio', 'wunderpaint' ),
		'gradient',
		'openBackgroundStudio'
	),
	patterns: opener(
		() => __( 'Patterns', 'wunderpaint' ),
		'grid',
		'openPatterns'
	),
	schemes: opener(
		() => __( 'Color Schemer', 'wunderpaint' ),
		'palette',
		'openColorSchemer'
	),
	collage: opener(
		() => __( 'Collage & Photo Grid', 'wunderpaint' ),
		'grid',
		'openCollage'
	),
	mockup: opener(
		() => __( 'Mockup Generator', 'wunderpaint' ),
		'smart',
		'openMockup'
	),
	beautify: opener(
		() => __( 'Screenshot Beautifier', 'wunderpaint' ),
		'image',
		'openBeautify'
	),
	panorama: opener(
		() => __( '360° Panorama', 'wunderpaint' ),
		'rotateCw',
		'openPanorama'
	),
	chart: opener(
		() => __( 'Chart & Table', 'wunderpaint' ),
		'grid',
		'openChart'
	),
	qr: opener( () => __( 'QR Code', 'wunderpaint' ), 'qr', 'openQr' ),
	templates: opener(
		() => __( 'Dynamic Templates', 'wunderpaint' ),
		'layers',
		'openTemplatePicker'
	),
	'post-preview': opener(
		() => __( 'Preview with Post', 'wunderpaint' ),
		'eye',
		'openPostPreview'
	),
	design: opener(
		() => __( 'Design Generator', 'wunderpaint' ),
		'sparkAI',
		'openDesignAssistant'
	),
	'create-content': opener(
		() => __( 'Generate Content', 'wunderpaint' ),
		'text',
		'openCreatePost',
		{ feature: 'content', proOpen: 'createPost' }
	),
	'content-templates': opener(
		() => __( 'Content Templates', 'wunderpaint' ),
		'layers',
		'openContentTemplates',
		{ feature: 'content', proOpen: 'contentTemplates' }
	),
	featured: opener(
		() => __( 'Featured Images', 'wunderpaint' ),
		'image',
		'openAutomate',
		{ feature: 'automate', proOpen: 'automate' }
	),
	batch: opener(
		() => __( 'Image Processor', 'wunderpaint' ),
		'image',
		'openBatch',
		{ feature: 'batch', proOpen: 'batch' }
	),
	csv: opener(
		() => __( 'Generate from CSV', 'wunderpaint' ),
		'grid',
		'openMerge',
		{ feature: 'merge', proOpen: 'merge' }
	),
	actions: opener(
		() => __( 'Manage Actions', 'wunderpaint' ),
		'history',
		'openActions'
	),
};

export const THEME_TOOL_PANELS = {
	brush: 'TOGGLE_BRUSH_PANEL',
	pencil: 'TOGGLE_BRUSH_PANEL',
	eraser: 'TOGGLE_BRUSH_PANEL',
	bucket: 'TOGGLE_BUCKET_PANEL',
	gradient: 'TOGGLE_GRADIENT_PANEL',
	stamp: 'TOGGLE_STAMP_PANEL',
	fxbrush: 'TOGGLE_FXBRUSH_PANEL',
	text: 'TOGGLE_TEXT_PANEL',
	shape: 'TOGGLE_SHAPE_PANEL',
	pen: 'TOGGLE_PEN_PANEL',
	repeat: 'TOGGLE_REPEAT_PANEL',
	crop: 'TOGGLE_CROP_PANEL',
	marquee: 'TOGGLE_SELECTION_PANEL',
	wand: 'TOGGLE_SELECTION_PANEL',
	smartselect: 'TOGGLE_SELECTION_PANEL',
};

export function loadEditorTheme() {
	const id = siteStorage.getItem( 'wpie-panel-theme' );
	return EDITOR_THEMES.some( ( theme ) => theme.id === id ) ? id : 'art';
}

export function saveEditorTheme( id ) {
	if ( EDITOR_THEMES.some( ( theme ) => theme.id === id ) ) {
		siteStorage.setItem( 'wpie-panel-theme', id );
	}
}

/** Resolve only installed/available actions. No network or bundle loading. */
export function resolveThemeGroups(
	theme,
	{ generators, menuItems, editor, extras, bootstrap = {} }
) {
	const registry = new Map(
		[ ...menuItems, ...generators ]
			.filter( ( item ) => item.id )
			.map( ( item ) => [ item.id, item ] )
	);
	return theme.groups
		.map( ( section ) => ( {
			...section,
			items: section.items
				.map( ( item ) => {
					if ( item.tool ) {
						const found = TOOLS.find( ( t ) => t.id === item.tool );
						if ( ! found ) {
							return null;
						}
						const label =
							item.tool === 'fxbrush'
								? __( 'Effect Brush', 'wunderpaint' )
								: item.tool === 'marquee'
								? __( 'Selection', 'wunderpaint' )
								: found.label;
						return {
							...item,
							id: 'tool:' + item.tool,
							label,
							icon: found.icon,
							title: `${ found.label } (${ found.kbd })`,
							active: editor.state.tool === item.tool,
						};
					}
					if ( item.studio ) {
						const target = registry.get( item.studio );
						return target
							? {
									...item,
									id: item.studio,
									label: target.label,
									target,
									disabled: target.when
										? ! target.when( { editor } )
										: false,
							  }
							: null;
					}
					const action = THEME_CORE_ACTIONS[ item.core ];
					if (
						! action ||
						( action.open &&
							typeof extras[ action.open ] !== 'function' ) ||
						( action.permission &&
							! bootstrap[ action.permission ] ) ||
						( action.feature &&
							( ! bootstrap.pro?.features?.includes(
								action.feature
							) ||
								typeof bootstrap.proOpen?.[ action.proOpen ] !==
									'function' ) )
					) {
						return null;
					}
					const hasMask = !! editor.state.layers.find(
						( l ) => l.id === editor.state.activeId
					)?.mask;
					return {
						...action,
						...item,
						id: 'core:' + item.core,
						label: action.label(),
						disabled: item.core === 'mask' && ! hasMask,
						title:
							item.core === 'mask' && ! hasMask
								? __(
										'Select a layer with a mask.',
										'wunderpaint'
								  )
								: undefined,
						active: action.rightTab
							? editor.state.rightTab === action.rightTab
							: item.core === 'color'
							? !! editor.state.showColorPanel
							: item.core === 'mask'
							? !! (
									editor.state.showMaskPanel &&
									editor.state.maskEditId
							  )
							: item.core === 'timeline'
							? !! editor.state.timeline?.on
							: undefined,
					};
				} )
				.filter( Boolean ),
		} ) )
		.filter( ( section ) => section.items.length );
}
