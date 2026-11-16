/** The manual overview follows the current editor mode without changing it. */
import { __ } from '@wordpress/i18n';

export function onboardingSteps( easyMode ) {
	const tools = {
		selector: '.ed-toolbar',
		title: __( 'Tools', 'wunderpaint' ),
		body: easyMode
			? __(
					'Choose a tool on the left. Creative opens cards for the available creative tools and extensions.',
					'wunderpaint'
			  )
			: __(
					'Choose a tool on the left to select, draw, retouch or add text and shapes. Hover over an icon to see its name and shortcut.',
					'wunderpaint'
			  ),
	};
	const canvas = {
		selector: '.ed-canvas-area',
		title: __( 'Canvas', 'wunderpaint' ),
		body: __(
			'Work on your design here. Hold Space to pan and use the zoom controls below the canvas. Your elements stay on separate layers.',
			'wunderpaint'
		),
	};
	const library = {
		selector: '.library-tray',
		title: __( 'Asset Library tray', 'wunderpaint' ),
		body: __(
			'Quick access under the canvas: text lockups, shapes, icons, photos, brand-kit logos, dynamic and starter templates. Click or drag onto the canvas.',
			'wunderpaint'
		),
	};
	const saving = {
		selector: '.ed-titlebar button.primary',
		title: __( 'Saving', 'wunderpaint' ),
		body: __(
			'This is the main action for your current document. Its label tells you whether it saves to the Media Library, updates a template, applies your changes or downloads an image.',
			'wunderpaint'
		),
	};
	const help = {
		selector: '[data-menu="help"]',
		title: __( 'Help', 'wunderpaint' ),
		body: __(
			'Open the Handbook here for detailed instructions. Help → Show Tour starts this overview when you want it; it never starts automatically.',
			'wunderpaint'
		),
	};
	if ( easyMode ) {
		return [
			tools,
			canvas,
			{
				selector: '.ed-easy-nav',
				title: __( 'Easy Mode', 'wunderpaint' ),
				body: __(
					'Start offers quick ways to add content. Edit shows settings for your selection or tool. Elements lists your layers and groups.',
					'wunderpaint'
				),
			},
			{
				selector: '.ed-easy-edit-nav',
				title: __( 'Edit', 'wunderpaint' ),
				body: __(
					'Select an element, then choose Edit. Use its tabs for main settings, looks and alignment. The pencil in a section header opens its full editor.',
					'wunderpaint'
				),
			},
			{
				selector: '.ed-easy-designbar',
				title: __( 'Design', 'wunderpaint' ),
				body: __(
					'The bottom row keeps the background color and document size in reach. Change Size opens the existing size dialog with format presets.',
					'wunderpaint'
				),
			},
			library,
			saving,
			help,
		];
	}
	return [
		tools,
		{
			selector: '.ed-tool-opts',
			title: __( 'Tool options', 'wunderpaint' ),
			body: __(
				'The options follow your active tool. For tools with a panel, the sliders icon at the end opens its full settings.',
				'wunderpaint'
			),
		},
		canvas,
		{
			selector: '.ed-right-tabs',
			title: __( 'Panels', 'wunderpaint' ),
			body: __(
				'The right sidebar contains Layers, Properties, Color, Adjust, Effects and AI Studio. Drag a tab out to float its panel. Open History separately from View.',
				'wunderpaint'
			),
		},
		{
			selector: '[data-menu="view"]',
			title: __( 'Tool Panels', 'wunderpaint' ),
			body: __(
				'View → Tool Panels contains the tool settings, Color and Themes. Move panels by their headers, collapse them with a click, or pin them to keep them open when switching tools.',
				'wunderpaint'
			),
		},
		{
			selector: '[data-menu="assets"]',
			title: __( 'Assets', 'wunderpaint' ),
			body: __(
				'Open Assets for content and design tools. Dynamic templates can fill text and images with data from posts or products.',
				'wunderpaint'
			),
		},
		library,
		{
			selector: '[data-menu="extensions"]',
			title: __( 'Extensions', 'wunderpaint' ),
			body: __(
				'Installed extensions are grouped here. View → Tool Panels → Themes also offers shortcuts grouped by task.',
				'wunderpaint'
			),
		},
		{
			selector: '[data-menu="automation"]',
			title: __( 'Automation', 'wunderpaint' ),
			body: __(
				'This menu collects actions for processing multiple images and automating recurring work. The available commands depend on the features enabled on this site.',
				'wunderpaint'
			),
		},
		saving,
		help,
	];
}
