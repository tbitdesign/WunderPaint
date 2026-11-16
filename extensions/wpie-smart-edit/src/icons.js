const svg = ( path ) =>
	`<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ path }</svg>`;
export const ICONS = {
	link: svg(
		'<path d="m10 13 4-4m-5 7-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 0 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/>'
	),
	sample: svg( '<path d="m15 3 6 6M13 5l6 6M16 8 5 19l-3 1 1-3L14 6"/>' ),
	text: svg( '<path d="M4 5h16M12 5v15M8 20h8M4 5v3m16-3v3"/>' ),
	shapes: svg( '<rect x="3" y="5" width="18" height="14" rx="4"/>' ),
	colors: svg(
		'<circle cx="9" cy="9" r="6"/><circle cx="15" cy="9" r="6"/><circle cx="12" cy="15" r="6"/>'
	),
	elements: svg(
		'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 10h10M9 14h6"/>'
	),
	view: svg(
		'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'
	),
	fit: svg( '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5"/>' ),
	plus: svg( '<path d="M5 12h14M12 5v14"/>' ),
	minus: svg( '<path d="M5 12h14"/>' ),
	undo: svg( '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>' ),
	edit: svg( '<path d="m4 17-1 4 4-1L20 7l-3-3L4 17ZM14 7l3 3"/>' ),
};
