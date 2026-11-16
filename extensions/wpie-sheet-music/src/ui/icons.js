/** Brand mark (shared house icon) and small stroke icons for tiles and sections. */
const stroke = ( d, size = 16 ) =>
	`<svg width="${ size }" height="${ size }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ d }</svg>`;

export const ICONS = {
	song: stroke(
		'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 17h7m-3-3 3 3-3 3"/>'
	),
	worksheet: stroke(
		'<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 7h8M8 12h4m-4 5h4m2-2 2 2 4-4"/>'
	),
	roadmap: stroke(
		'<path d="M3 4v16m6-16v16m6-16v16m6-16v16M3 7h18M3 12h18M3 17h18m-18 0 6-5 6 5 6-10"/>'
	),
	analysis: stroke(
		'<path d="M3 13h18M3 17h18M5 8V4h14v4M8 11v10m8-10v10"/>'
	),
	up: stroke( '<path d="m6 15 6-6 6 6"/>' ),
	down: stroke( '<path d="m6 9 6 6 6-6"/>' ),
	remove: stroke( '<path d="M6 6l12 12M6 18 18 6"/>' ),
	copy: stroke(
		'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>'
	),
	drag: stroke( '<path d="M8 5h1m6 0h1M8 12h1m6 0h1M8 19h1m6 0h1"/>' ),
	melody: stroke(
		'<path d="M3 5h18v14H3zM7 5v9h3V5m4 0v9h3V5M8 14v5m8-5v5"/>'
	),
	rhythm: stroke(
		'<path d="M3 16h18M6 15V5m6 10V5m6 10V5"/><circle cx="4" cy="16" r="2"/><circle cx="10" cy="16" r="2"/><circle cx="16" cy="16" r="2"/>'
	),
	harmony: stroke(
		'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v5m0 8v5M3 12h5m8 0h5M6 6l3 3m6 6l3 3M6 18l3-3m6-6l3-3"/>'
	),
	lesson: stroke(
		'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M6 7h12M6 10h12M6 14h5v4H6zm9 0h3m-3 4h3"/>'
	),
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
