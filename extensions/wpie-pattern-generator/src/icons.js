// The same small, currentColor SVG vocabulary used by the editor's studio kit.
const svg = ( body, strokeWidth = 2 ) =>
	'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' +
	strokeWidth +
	'" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
	body +
	'</svg>';
// The active editor icons from src/ui-icons.json, as markup for this DOM panel.
const editorIcon = ( paths ) =>
	svg( paths.map( ( d ) => '<path d="' + d + '"/>' ).join( '' ), 1.8 );
export const ICONS = {
	presets: svg(
		'<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>'
	),
	layers: svg(
		'<path d="M12 3 2 8l10 5 10-5-10-5zM2 12l10 5 10-5M2 16l10 5 10-5"/>'
	),
	eye: editorIcon( [
		'M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0',
		'M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6',
	] ),
	eyeOff: editorIcon( [
		'M10.585 10.587a2 2 0 0 0 2.829 2.828',
		'M16.681 16.673a8.717 8.717 0 0 1 -4.681 1.327c-3.6 0 -6.6 -2 -9 -6c1.272 -2.12 2.712 -3.678 4.32 -4.674m2.86 -1.146a9.055 9.055 0 0 1 1.82 -.18c3.6 0 6.6 2 9 6c-.666 1.11 -1.379 2.067 -2.138 2.87',
		'M3 3l18 18',
	] ),
	plus: editorIcon( [ 'M12 5l0 14', 'M5 12l14 0' ] ),
	duplicate: editorIcon( [
		'M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666',
		'M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1',
	] ),
	up: editorIcon( [ 'M12 5l0 14', 'M16 9l-4 -4', 'M8 9l4 -4' ] ),
	down: editorIcon( [ 'M12 5l0 14', 'M16 15l-4 4', 'M8 15l4 4' ] ),
	trash: editorIcon( [
		'M4 7l16 0',
		'M10 11l0 6',
		'M14 11l0 6',
		'M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12',
		'M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3',
	] ),
	dice: svg(
		'<rect x="3" y="3" width="18" height="18" rx="4"/><g fill="currentColor" stroke="none"><circle cx="8.5" cy="8.5" r="1.4"/><circle cx="15.5" cy="15.5" r="1.4"/><circle cx="15.5" cy="8.5" r="1.4"/><circle cx="8.5" cy="15.5" r="1.4"/></g>'
	),
	pattern: svg(
		'<path d="M3 7c3-5 6 5 9 0s6 5 9 0M3 12c3-5 6 5 9 0s6 5 9 0M3 17c3-5 6 5 9 0s6 5 9 0"/>'
	),
	color: svg(
		'<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/>'
	),
	star: svg(
		'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z"/>'
	),
	distribution: svg(
		'<circle cx="5" cy="5" r="2"/><circle cx="18" cy="7" r="2"/><circle cx="10" cy="13" r="2"/><circle cx="5" cy="20" r="2"/><circle cx="19" cy="19" r="2"/>'
	),
	frequency: svg(
		'<path d="M5 20V10M12 20V4M19 20v-7"/><circle cx="5" cy="7" r="2"/><circle cx="12" cy="9" r="2"/><circle cx="19" cy="10" r="2"/>'
	),
	repeat: svg(
		'<path d="m16 3 4 4-4 4M20 7H8a4 4 0 0 0-4 4m4 10-4-4 4-4M4 17h12a4 4 0 0 0 4-4"/>'
	),
	effects: svg(
		'<path d="m14 3 1.8 5.2L21 10l-5.2 1.8L14 17l-1.8-5.2L7 10l5.2-1.8zM5 15v6M2 18h6"/>'
	),
	element: svg( '<path d="M4 15C4 7 12 2 20 4c2 8-3 16-11 16M7 17l8-8"/>' ),
	background: svg(
		'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m4 16 6-6 5 5 3-3 3 3"/><circle cx="16" cy="7" r="1"/>'
	),
};
export const SECTION_ICONS = {
	Presets: ICONS.presets,
	'Save as favorite': ICONS.star,
	'Pattern layers': ICONS.layers,
	Variations: ICONS.dice,
	Pattern: ICONS.pattern,
	Distribution: ICONS.distribution,
	'Motif frequency': ICONS.frequency,
	Effects: ICONS.effects,
	Colors: ICONS.color,
	'Palette colors': ICONS.color,
	Background: ICONS.background,
	Rapport: ICONS.repeat,
	'Pattern library': ICONS.presets,
	Elements: ICONS.element,
	'Selected element': ICONS.element,
};
