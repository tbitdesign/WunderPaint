/** Brand mark (shared house icon) and small stroke icons for tiles and sections. */
export const ICON_BRAND =
	'<svg width="24" height="24" viewBox="0 0 18.83 18.83" aria-hidden="true" focusable="false"><path fill="currentColor" d="M13.84,18.83H3.62c-2,0-3.62-1.62-3.62-3.62V4.99C0,2.99,1.62,1.37,3.62,1.37h10.22c2,0,3.62,1.62,3.62,3.62v10.22c0,2-1.62,3.62-3.62,3.62ZM3.62,2.87c-1.17,0-2.12.95-2.12,2.12v10.22c0,1.17.95,2.12,2.12,2.12h10.22c1.17,0,2.12-.95,2.12-2.12V4.99c0-1.17-.95-2.12-2.12-2.12H3.62Z"/><path fill="#3b66ff" d="M13.21,7.17h-1.71v-1.71c0-.41-.34-.75-.75-.75s-.75.34-.75.75v1.71h-1.71c-.41,0-.75.34-.75.75s.34.75.75.75h1.71v1.71c0,.41.34.75.75.75s.75-.34.75-.75v-1.71h1.71c.41,0,.75-.34.75-.75s-.34-.75-.75-.75Z"/><path fill="currentColor" d="M18.08,18.83c-.41,0-.75-.34-.75-.75V.75c0-.41.34-.75.75-.75s.75.34.75.75v17.33c0,.41-.34.75-.75.75Z"/></svg>';

const stroke = ( d, size = 16 ) =>
	`<svg width="${ size }" height="${ size }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ d }</svg>`;

export const ICONS = {
	bunting: stroke(
		'<path d="M2 6c6 4 14 4 20 0"/><path d="M5 7l3 6 3-6M13 7l3 6 3-6"/>'
	),
	letterbanner: stroke(
		'<path d="M6 3h12v12l-6 6-6-6z"/><path d="M12 8v6"/>'
	),
	box: stroke(
		'<path d="M3 9l9-5 9 5v10l-9 5-9-5z"/><path d="M3 9l9 5 9-5M12 14v10"/>'
	),
	tags: stroke(
		'<path d="M3 12l9-9h9v9l-9 9z"/><circle cx="16" cy="8" r="1.5"/>'
	),
	toppers: stroke( '<circle cx="12" cy="8" r="6"/><path d="M12 14v8"/>' ),
	cupcakewrap: stroke(
		'<path d="M4 8c4 3 12 3 16 0l-2 12H6z"/><path d="M8 20l-1-8M16 20l1-8"/>'
	),
	placecards: stroke(
		'<path d="M3 16l9-8 9 8v4H3z"/><path d="M8 20v-3M16 20v-3"/>'
	),
	strawflags: stroke( '<path d="M6 3v18"/><path d="M6 4h12l-3 4 3 4H6"/>' ),
	partyhat: stroke(
		'<path d="M12 3l8 17H4z"/><circle cx="12" cy="3" r="1.5"/>'
	),
	props: stroke(
		'<path d="M4 9c3-2 5 0 8 0s5-2 8 0c-3 2-5 4-8 3s-5-1-8-3z"/><path d="M12 12v9"/>'
	),
	bottlelabels: stroke(
		'<path d="M9 3h6v4c2 1 3 3 3 5v9H6v-9c0-2 1-4 3-5z"/><path d="M8 14h8"/>'
	),
	stickers: stroke(
		'<circle cx="8" cy="8" r="4"/><circle cx="16" cy="8" r="4"/><circle cx="8" cy="16" r="4"/><circle cx="16" cy="16" r="4"/>'
	),
	invitation: stroke( '<path d="M3 5h18v14H3z"/><path d="M3 5l9 7 9-7"/>' ),
	savethedate: stroke(
		'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M9 15l2 2 4-4"/>'
	),
	thankyou: stroke(
		'<path d="M4 4h16v12H9l-5 4z"/><path d="M12 7c-2-2-5 0-3 2l3 3 3-3c2-2-1-4-3-2z"/>'
	),
	reply: stroke(
		'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M6 9h3v3H6zM11 10h7M6 15h3v3H6zM11 16h7"/>'
	),
	menu: stroke(
		'<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M8 8h8M8 12h8M8 16h5"/>'
	),
	drinks: stroke(
		'<path d="M6 4h12l-5 7v7h3v2H8v-2h3v-7z"/><path d="M8 7h8"/>'
	),
	program: stroke(
		'<circle cx="8" cy="7" r="2"/><circle cx="8" cy="17" r="2"/><path d="M13 7h7M13 17h7M8 9v6"/>'
	),
	tablenumbers: stroke(
		'<path d="M4 20l8-14 8 14z"/><path d="M12 6v14"/><path d="M11 13h2"/>'
	),
	seating: stroke(
		'<rect x="3" y="4" width="8" height="7" rx="1"/><rect x="13" y="4" width="8" height="7" rx="1"/><rect x="3" y="13" width="8" height="7" rx="1"/><rect x="13" y="13" width="8" height="7" rx="1"/>'
	),
	welcome: stroke(
		'<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 9l2 4 2-4 2 4 2-4M8 16h8"/>'
	),
	signpost: stroke( '<path d="M3 8h13l4 4-4 4H3z"/><path d="M8 12h5"/>' ),
	voucher: stroke(
		'<path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z"/><path d="M9 10v4M13 10v4"/>'
	),
	tickets: stroke(
		'<path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z"/><path d="M15 7v10" stroke-dasharray="2 2"/>'
	),
	addresslabels: stroke(
		'<rect x="3" y="4" width="8" height="5"/><rect x="13" y="4" width="8" height="5"/><rect x="3" y="11" width="8" height="5"/><rect x="13" y="11" width="8" height="5"/><rect x="3" y="18" width="8" height="3"/><rect x="13" y="18" width="8" height="3"/>'
	),
	envelope: stroke(
		'<path d="M3 7h18v12H3z"/><path d="M3 7l9 7 9-7M3 19l7-6M21 19l-7-6"/>'
	),
	wrapping: stroke(
		'<rect x="3" y="3" width="18" height="18"/><circle cx="8" cy="8" r="1.5"/><circle cx="16" cy="8" r="1.5"/><circle cx="8" cy="16" r="1.5"/><circle cx="16" cy="16" r="1.5"/><circle cx="12" cy="12" r="1.5"/>'
	),
	glassmarkers: stroke(
		'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 15v5"/>'
	),
	napkinrings: stroke(
		'<rect x="3" y="8" width="18" height="8" rx="1"/><path d="M9 8v8M15 8v8"/>'
	),
	coasters: stroke(
		'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/>'
	),
	bagtoppers: stroke(
		'<rect x="4" y="3" width="16" height="8" rx="1"/><path d="M4 11l2 10h12l2-10M8 6v2M16 6v2"/>'
	),
	chocolate: stroke(
		'<rect x="3" y="6" width="18" height="12" rx="1"/><path d="M9 6v12M15 6v12M3 12h18"/>'
	),
	jamlabels: stroke(
		'<path d="M7 3h10v3H7zM6 8h12l1 12H5z"/><path d="M9 13h6"/>'
	),
	candlewrap: stroke(
		'<rect x="6" y="9" width="12" height="12" rx="1"/><path d="M12 9V5"/><path d="M12 5c-1-1-1-2 0-3 1 1 1 2 0 3z"/>'
	),
	garland: stroke(
		'<path d="M2 6c6 4 14 4 20 0"/><circle cx="6" cy="10" r="2.5"/><circle cx="12" cy="11" r="2.5"/><circle cx="18" cy="10" r="2.5"/>'
	),
	fan: stroke(
		'<path d="M12 20L4 6M12 20L8 4M12 20l4-16M12 20l8-14"/><path d="M6 8c4-2 8-2 12 0"/>'
	),
	photoframe: stroke(
		'<rect x="3" y="3" width="18" height="18"/><rect x="7" y="6" width="10" height="10"/><path d="M8 19h8"/>'
	),
	crown: stroke(
		'<path d="M3 18l2-11 5 5 2-7 2 7 5-5 2 11z"/><path d="M3 18h18v2H3z"/>'
	),
	caketopper: stroke(
		'<path d="M4 4h16v8l-4-2-4 2-4-2-4 2z"/><path d="M12 12v9"/>'
	),
	lantern: stroke(
		'<rect x="6" y="4" width="12" height="16" rx="1"/><path d="M12 8l1.5 3h3l-2.5 2 1 3-3-2-3 2 1-3-2.5-2h3z"/>'
	),
	doorhanger: stroke(
		'<rect x="7" y="2" width="10" height="20" rx="3"/><circle cx="12" cy="7" r="2.5"/><path d="M9 14h6M9 17h6"/>'
	),
	countdown: stroke(
		'<circle cx="8" cy="8" r="4"/><circle cx="16" cy="8" r="4"/><circle cx="8" cy="16" r="4"/><circle cx="16" cy="16" r="4"/><path d="M8 6v4M15 6h2v4"/>'
	),
	confetti: stroke(
		'<circle cx="6" cy="6" r="2"/><circle cx="14" cy="5" r="2"/><circle cx="19" cy="11" r="2"/><circle cx="9" cy="13" r="2"/><circle cx="15" cy="18" r="2"/><circle cx="5" cy="18" r="2"/>'
	),
	bingo: stroke(
		'<rect x="3" y="3" width="18" height="18"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>'
	),
	scavenger: stroke(
		'<circle cx="10" cy="10" r="6"/><path d="M14.5 14.5L20 20"/><path d="M8 10l1.5 1.5L12 8"/>'
	),
	questions: stroke(
		'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M10 9a2 2 0 1 1 3 1.7c-.7.4-1 .8-1 1.5"/><path d="M12 15.5v.5"/>'
	),
	headbands: stroke(
		'<rect x="4" y="6" width="16" height="12" rx="2"/><path d="M8 12h8"/><path d="M12 6V3"/>'
	),
	memory: stroke(
		'<rect x="3" y="4" width="8" height="10" rx="1"/><rect x="13" y="4" width="8" height="10" rx="1"/><path d="M5 20h14"/><circle cx="7" cy="9" r="1.5"/><circle cx="17" cy="9" r="1.5"/>'
	),
	quartet: stroke(
		'<rect x="4" y="3" width="12" height="16" rx="1"/><path d="M8 21h12V7"/><path d="M7 7h6v5H7z"/>'
	),
	deck: stroke(
		'<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M12 8c-1.5-1.5-4 0-2 2l2 2 2-2c2-2-.5-3.5-2-2z"/>'
	),
	scoreboard: stroke(
		'<rect x="3" y="4" width="18" height="16"/><path d="M3 9h18M9 4v16M15 4v16"/>'
	),
	chess: stroke(
		'<rect x="3" y="3" width="18" height="18"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/><path d="M6 6h3v3H6zM12 12h3v3h-3z" fill="currentColor"/>'
	),
	tactics: stroke(
		'<rect x="3" y="5" width="18" height="14"/><path d="M12 5v14"/><circle cx="12" cy="12" r="2.5"/><path d="M3 9h3v6H3zM18 9h3v6h-3z"/>'
	),
	boardgame: stroke(
		'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v6M15 9v6M9 15v6"/>'
	),
	dice: stroke(
		'<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.3"/><circle cx="15" cy="15" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="15" cy="9" r="1.3"/><circle cx="9" cy="15" r="1.3"/>'
	),
	domino: stroke(
		'<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M7 12h10"/><circle cx="12" cy="7" r="1.3"/><circle cx="10" cy="16" r="1.2"/><circle cx="14" cy="18" r="1.2"/>'
	),
	secretcode: stroke(
		'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h2M11 9l2 3-2 3M15 15h3"/>'
	),
	fortuneteller: stroke(
		'<path d="M3 3h18v18H3z"/><path d="M3 3l18 18M21 3L3 21M12 3v18M3 12h18"/>'
	),
	bracket: stroke(
		'<path d="M3 5h5v4H3M3 15h5v4H3M8 7h4v10H8M12 12h5v0M17 10h4v4h-4"/>'
	),
	guessphoto: stroke(
		'<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M8 17c1-2 7-2 8 0"/><path d="M15 5h3" stroke-width="2.4"/>'
	),
	wordsearch: stroke(
		'<rect x="3" y="3" width="18" height="18"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/><path d="M5 5l14 14" stroke-width="2.4" opacity=".6"/>'
	),
	maze: stroke(
		'<rect x="3" y="3" width="18" height="18"/><path d="M8 3v8h5M21 8h-5v5M3 16h8v5M13 21v-4h4v-4"/>'
	),
	sudoku: stroke(
		'<rect x="3" y="3" width="18" height="18"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/><path d="M6 6v1M12 12v1M18 18v1" stroke-width="2.4"/>'
	),
	coloring: stroke(
		'<path d="M12 3c5 0 8 4 8 8s-3 5-5 5-2 2-2 3-1 2-1 2c-5 0-8-4-8-9s3-9 8-9z"/><circle cx="9" cy="9" r="1.2"/><circle cx="14" cy="7" r="1.2"/><circle cx="8" cy="14" r="1.2"/>'
	),
	placemat: stroke(
		'<rect x="2" y="5" width="20" height="14" rx="1"/><path d="M5 8h5v5H5zM13 8h6M13 11h6M13 14h4"/>'
	),
	playmoney: stroke(
		'<rect x="2" y="6" width="20" height="12" rx="1"/><circle cx="12" cy="12" r="3"/><path d="M5 9v1M19 14v1"/>'
	),
	certificate: stroke(
		'<rect x="3" y="4" width="18" height="14" rx="1"/><path d="M7 9h10M8 12h8"/><circle cx="12" cy="19" r="2"/><path d="M10 21l2-2 2 2"/>'
	),
	medals: stroke(
		'<circle cx="12" cy="14" r="6"/><path d="M9 3l3 5 3-5"/><path d="M12 12v4M11 16h2"/>'
	),
	item: stroke(
		'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'
	),
	sheet: stroke(
		'<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M5 7h14M5 17h14"/>'
	),
	theme: stroke(
		'<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-2 0-3 3 0 4-1a9 9 0 0 0-6-12z"/><circle cx="8" cy="10" r="1.2" fill="currentColor"/><circle cx="12" cy="7" r="1.2" fill="currentColor"/><circle cx="16" cy="10" r="1.2" fill="currentColor"/>'
	),
	event: stroke(
		'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'
	),
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
	photo: stroke(
		'<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-6-5-8 8"/>'
	),
	up: stroke( '<path d="M6 14l6-6 6 6"/>', 14 ),
	down: stroke( '<path d="M6 10l6 6 6-6"/>', 14 ),
	left: stroke( '<path d="M14 6l-6 6 6 6"/>', 14 ),
	right: stroke( '<path d="M10 6l6 6-6 6"/>', 14 ),
};
