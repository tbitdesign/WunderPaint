/** Brand mark (shared house icon) and small stroke icons for tiles and sections. */
const stroke = ( d, size = 16 ) =>
	`<svg width="${ size }" height="${ size }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ d }</svg>`;

export const ICONS = {
	score: stroke(
		'<path d="M3 6h18M3 10h18M3 14h18M3 18h18"/><circle cx="8" cy="15" r="2" fill="currentColor"/><path d="M10 15V5l5 2"/>'
	),
	leadsheet: stroke(
		'<path d="M4 5h9M4 10h16M4 15h12M4 20h14"/><path d="M15 3l2 2 4-4" stroke-width="1.4"/>'
	),
	diagrams: stroke(
		'<path d="M6 4v16M10 4v16M14 4v16M18 4v16M5 8h14M5 13h14M5 18h14"/><circle cx="10" cy="10.5" r="1.8" fill="currentColor"/><circle cx="14" cy="15.5" r="1.8" fill="currentColor"/>'
	),
	fretboard: stroke(
		'<rect x="2" y="7" width="20" height="10" rx="1"/><path d="M7 7v10M12 7v10M17 7v10"/><circle cx="9.5" cy="12" r="1.6" fill="currentColor"/><circle cx="14.5" cy="12" r="1.6" fill="currentColor"/>'
	),
	paper: stroke(
		'<path d="M3 5h18M3 8h18M3 11h18M3 14h18M3 17h18M3 20h18"/>'
	),
	flash: stroke(
		'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M6 9h12M6 12h12M6 15h12"/><circle cx="14" cy="12" r="1.8" fill="currentColor"/>'
	),
	scales: stroke(
		'<path d="M3 20h18"/><circle cx="5" cy="18" r="1.6" fill="currentColor"/><circle cx="9" cy="15" r="1.6" fill="currentColor"/><circle cx="13" cy="12" r="1.6" fill="currentColor"/><circle cx="17" cy="9" r="1.6" fill="currentColor"/><circle cx="21" cy="6" r="1.6" fill="currentColor"/>'
	),
	layout: stroke(
		'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/>'
	),
	style: stroke(
		'<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-2 0-3 3 0 4-1a9 9 0 0 0-6-12z"/><circle cx="8" cy="10" r="1.2" fill="currentColor"/><circle cx="12" cy="7" r="1.2" fill="currentColor"/><circle cx="16" cy="10" r="1.2" fill="currentColor"/>'
	),
	music: stroke(
		'<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'
	),
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
};
