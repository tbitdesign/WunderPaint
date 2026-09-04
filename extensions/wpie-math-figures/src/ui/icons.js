/** Brand mark (shared house icon) and small stroke icons for tiles and sections. */
export const ICON_BRAND =
	'<svg width="24" height="24" viewBox="0 0 18.83 18.83" aria-hidden="true" focusable="false"><path fill="currentColor" d="M13.84,18.83H3.62c-2,0-3.62-1.62-3.62-3.62V3.52h1.72c.7,0,1.28.57,1.28,1.28v10.43c0,.34.28.62.62.62h8.94c.71,0,1.29.58,1.29,1.29v1.71Z"/><path fill="#3b66ff" d="M18.83,14.02h-1.71c-.71,0-1.29-.58-1.29-1.29V3.62c0-.34-.28-.62-.62-.62H4.82c-.7,0-1.28-.57-1.28-1.28V0h11.67c2,0,3.62,1.62,3.62,3.62v10.4Z"/><circle fill="currentColor" cx="17.33" cy="17.33" r="1.5"/><path fill="#3b66ff" d="M9.51,5.71l.91,2.45c.03.08.09.14.17.17l2.45.91c.07.03.07.13,0,.16l-2.45.91c-.08.03-.14.09-.17.17l-.91,2.45c-.03.07-.13.07-.16,0l-.91-2.45c-.03-.08-.09-.14-.17-.17l-2.45-.91c-.07-.03-.07-.13,0-.16l2.45-.91c.08-.03.14-.09.17-.17l.91-2.45c.03-.07.13-.07.16,0Z"/></svg>';

const stroke = ( d, size = 16 ) =>
	`<svg width="${ size }" height="${ size }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ d }</svg>`;

export const ICONS = {
	formula: stroke(
		'<path d="M4 18h3l4-12h9"/><path d="M12 12l4 6M16 12l-4 6"/>'
	),
	graph: stroke(
		'<path d="M3 20V4M3 20h18"/><path d="M5 17c3-8 6-10 8-6s4 6 7-4"/>'
	),
	geometry: stroke(
		'<path d="M4 19h16L12 5z"/><path d="M12 5v14"/><path d="M9 19a3 3 0 0 0 3-3"/>'
	),
	numberline: stroke(
		'<path d="M2 12h20"/><path d="M6 9v6M12 9v6M18 9v6"/><circle cx="12" cy="12" r="2" fill="currentColor"/>'
	),
	fractions: stroke(
		'<circle cx="12" cy="12" r="8"/><path d="M12 4v8l6 5" fill="currentColor" opacity="0.4"/><path d="M12 12h8M12 12l-6 5"/>'
	),
	layout: stroke(
		'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/>'
	),
	style: stroke(
		'<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-2 0-3 3 0 4-1a9 9 0 0 0-6-12z"/><circle cx="8" cy="10" r="1.2" fill="currentColor"/><circle cx="12" cy="7" r="1.2" fill="currentColor"/><circle cx="16" cy="10" r="1.2" fill="currentColor"/>'
	),
	axes: stroke( '<path d="M4 20V4M4 20h16"/><path d="M4 12h16M12 4v16"/>' ),
	text: stroke( '<path d="M5 6h14M12 6v14M9 20h6"/>' ),
	starters: stroke(
		'<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z"/>'
	),
	material: stroke(
		'<path d="M4 4h11l5 5v11H4z"/><path d="M15 4v5h5M8 13h8M8 17h8"/>'
	),
	eye: stroke(
		'<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
		14
	),
	steps: stroke(
		'<path d="M4 7h6M4 12h6M4 17h6"/><path d="M14 9h6M14 15h6"/>'
	),
	table: stroke(
		'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16M15 4v16"/>'
	),
	blocks: stroke(
		'<rect x="4" y="3" width="16" height="5" rx="1.5"/><rect x="4" y="10" width="16" height="5" rx="1.5"/><rect x="4" y="17" width="16" height="4" rx="1.5"/>'
	),
	figure: stroke(
		'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/>'
	),
	typo: stroke(
		'<path d="M4 19l5-14 5 14M6.5 14h5"/><path d="M15 19l2.5-7 2.5 7M16 16.5h3"/>'
	),
	up: stroke( '<path d="M6 14l6-6 6 6"/>', 14 ),
	down: stroke( '<path d="M6 10l6 6 6-6"/>', 14 ),
	remove: stroke( '<path d="M7 7l10 10M17 7L7 17"/>', 14 ),
	add: stroke( '<path d="M12 5v14M5 12h14"/>', 14 ),
	clock: stroke( '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' ),
	hundred: stroke(
		'<rect x="3" y="3" width="18" height="18" rx="1.5"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>'
	),
	placevalue: stroke(
		'<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 10h18M9 4v16M15 4v16"/><path d="M6 15v2M12 14v3M18 15v2"/>'
	),
	multiplication: stroke(
		'<path d="M7 7l10 10M17 7L7 17"/><rect x="3" y="3" width="18" height="18" rx="2"/>'
	),
	wall: stroke(
		'<rect x="9" y="4" width="6" height="5" rx="1"/><rect x="5" y="10" width="6" height="5" rx="1"/><rect x="13" y="10" width="6" height="5" rx="1"/><rect x="2" y="16" width="6" height="5" rx="1"/><rect x="9" y="16" width="6" height="5" rx="1"/><rect x="16" y="16" width="6" height="5" rx="1"/>'
	),
	stats: stroke(
		'<path d="M3 20h18M3 20V4"/><rect x="6" y="11" width="3" height="9"/><rect x="11" y="7" width="3" height="13"/><rect x="16" y="13" width="3" height="7"/>'
	),
	unitcircle: stroke(
		'<circle cx="12" cy="12" r="8"/><path d="M12 12h8M12 12l5.7-5.7M17.7 12v-5.7"/>'
	),
	sets: stroke(
		'<circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/>'
	),
	tree: stroke(
		'<path d="M3 12h5M8 12l6-6M8 12l6 6M14 6h6M14 18h6"/><circle cx="3" cy="12" r="1.5" fill="currentColor"/>'
	),
	solids: stroke(
		'<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>'
	),
	ruler: stroke(
		'<rect x="2" y="8" width="20" height="8" rx="1.5"/><path d="M6 8v3M10 8v4M14 8v3M18 8v4"/>'
	),
};
