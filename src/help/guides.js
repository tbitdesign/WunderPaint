/**
 * Interactive how-to guides (v0.8): spotlight steps over the live UI.
 * `before( editor, extras )` prepares the UI for a step (tab, tool …).
 */

import { __ } from '@wordpress/i18n';

export const HELP_GUIDES = [
	{
		id: 'add-text',
		title: __( 'Add and style text', 'wunderpaint' ),
		steps: [
			{
				selector: '[data-ws="tool.text"]',
				title: __( 'Pick the Text tool (T)', 'wunderpaint' ),
				body: __(
					'Choose Text in the tool rail or press T.',
					'wunderpaint'
				),
				before: ( editor ) =>
					editor.dispatch( { type: 'SET_TOOL', tool: 'text' } ),
			},
			{
				selector: '.ed-canvas-area',
				title: __( 'Click and type', 'wunderpaint' ),
				body: __(
					'Click on the canvas for point text or drag a box for area text, then just type. A floating bar above the layer offers color, alignment and quick actions.',
					'wunderpaint'
				),
			},
			{
				selector: '[data-ws="panel.props"]',
				title: __( 'Character settings', 'wunderpaint' ),
				body: __(
					'Font, size, spacing, alignment and text color live in Properties → Character; the toolbar above the canvas has the essentials too.',
					'wunderpaint'
				),
				before: ( editor ) =>
					editor.dispatch( { type: 'SET_RIGHT_TAB', tab: 'props' } ),
			},
			{
				selector: '[data-ws="panel.effects"]',
				title: __( 'Styles & text effects', 'wunderpaint' ),
				body: __(
					'The Effects tab adds one-click looks, text effects like circles, markers and outlines, and warp. The STYLE presets in the text toolbar combine them with live previews.',
					'wunderpaint'
				),
				before: ( editor ) =>
					editor.dispatch( {
						type: 'SET_RIGHT_TAB',
						tab: 'effects',
					} ),
			},
		],
	},
	{
		id: 'dynamic-template',
		title: __( 'Build a dynamic template', 'wunderpaint' ),
		steps: [
			{
				selector: '[data-ws="panel.props"]',
				title: __( 'Dynamic content', 'wunderpaint' ),
				body: __(
					'Select a text or image layer and open Properties → Dynamic content: bind the layer to a post field (title, excerpt, featured image …) or mix {{variables}} into the text with the {…} button.',
					'wunderpaint'
				),
				before: ( editor ) =>
					editor.dispatch( { type: 'SET_RIGHT_TAB', tab: 'props' } ),
			},
			{
				selector: '.ed-menubar',
				title: __( 'Preview with a real post', 'wunderpaint' ),
				body: __(
					'View → Preview with Post fills every binding and variable with a real post - and lets you pick the Brand Kit that resolves brand variables.',
					'wunderpaint'
				),
			},
			{
				selector: '[data-menu="automation"]',
				title: __( 'Use it in automation', 'wunderpaint' ),
				body: () =>
					window.WPIE?.pro?.active
						? __(
								'Save the design as a template (File → Save as Dynamic Template), then Automation → Images → Featured Images generates branded images for many posts at once.',
								'wunderpaint'
						  )
						: __(
								'Save the design as a template (File → Save as Dynamic Template). You can then bind it to any single post and set the result as its featured image. Running it across many posts at once is what Automation → Images → Featured Images does, and that entry arrives with WunderPaint Pro.',
								'wunderpaint'
						  ),
			},
		],
	},
	{
		id: 'remove-bg',
		title: __( 'Remove a background', 'wunderpaint' ),
		steps: [
			{
				// Attribute selector (v1.229): tab positions shift as panels
				// are added, the data-ws hook is stable.
				selector: '[data-ws="panel.ai"]',
				title: __( 'Open AI Studio', 'wunderpaint' ),
				body: __(
					'The AI Studio tab collects all one-click image actions.',
					'wunderpaint'
				),
				before: ( editor ) =>
					editor.dispatch( { type: 'SET_RIGHT_TAB', tab: 'ai' } ),
			},
			{
				selector: '.ed-right',
				title: __( '“Remove BG”', 'wunderpaint' ),
				body: __(
					'Select your image layer, then click “Remove BG”. It runs locally in your browser, no API key needed. The background becomes transparent.',
					'wunderpaint'
				),
			},
			{
				selector: '.ed-titlebar button.primary',
				title: __( 'Save', 'wunderpaint' ),
				body: __(
					'Export as PNG (or save to the library) to keep the transparency.',
					'wunderpaint'
				),
			},
		],
	},
	{
		id: 'crop',
		title: __( 'Crop an image', 'wunderpaint' ),
		steps: [
			{
				selector: '.ed-toolbar',
				title: __( 'Pick the Crop tool (C)', 'wunderpaint' ),
				body: __(
					'Choose Crop in the tool rail or press C.',
					'wunderpaint'
				),
				before: ( editor ) =>
					editor.dispatch( { type: 'SET_TOOL', tool: 'crop' } ),
			},
			{
				selector: '.ed-menubar',
				title: __( 'Ratio & safe zones', 'wunderpaint' ),
				body: __(
					'The options bar offers fixed ratios, the social presets even show title-safe zones for Stories, posts and thumbnails.',
					'wunderpaint'
				),
			},
			{
				selector: '.ed-canvas-area',
				title: __( 'Drag, then confirm', 'wunderpaint' ),
				body: __(
					'Drag the crop area on the canvas, adjust the handles, then press Enter to apply (Esc cancels).',
					'wunderpaint'
				),
			},
		],
	},
	{
		id: 'auto-fix',
		title: __( 'Auto-fix a photo', 'wunderpaint' ),
		steps: [
			{
				selector: '[data-ws="panel.adjust"]',
				title: __( 'Open Adjust', 'wunderpaint' ),
				body: __(
					'Filters, effects and manual sliders live in the Adjust tab.',
					'wunderpaint'
				),
				before: ( editor ) =>
					editor.dispatch( { type: 'SET_RIGHT_TAB', tab: 'adjust' } ),
			},
			{
				selector: '.ed-right',
				title: __( 'One-click corrections', 'wunderpaint' ),
				body: __(
					'Auto Levels fixes flat tones, Auto Contrast punches up dull photos, Auto Color removes color casts. Select the image layer first, then try the preset filter thumbnails too.',
					'wunderpaint'
				),
			},
			{
				selector: '[data-ws="panel.history"]',
				title: __( 'Undo anytime', 'wunderpaint' ),
				body: __(
					'Every step lands in the History panel, click any entry to travel back.',
					'wunderpaint'
				),
			},
		],
	},
];
