/**
 * Curated colour palettes for auto-colouring blocks, plus a helper to pick a
 * colour by index. A block's own colour always wins; the palette fills the rest.
 */
export const PALETTES = {
	vivid: [
		'#ff6b6b',
		'#ffa94d',
		'#ffd43b',
		'#51cf66',
		'#22b8cf',
		'#4dabf7',
		'#9775fa',
		'#f783ac',
	],
	sunset: [
		'#f9c74f',
		'#f8961e',
		'#f3722c',
		'#f94144',
		'#c9184a',
		'#9d4edd',
		'#5a189a',
		'#3a0ca3',
	],
	ocean: [
		'#89f0ff',
		'#4cc9f0',
		'#4895ef',
		'#4361ee',
		'#3f37c9',
		'#3a0ca3',
		'#480ca8',
		'#7209b7',
	],
	forest: [
		'#d8f3dc',
		'#95d5b2',
		'#52b788',
		'#40916c',
		'#2d6a4f',
		'#1b4332',
		'#b7e4c7',
		'#74c69d',
	],
	pastel: [
		'#ffadad',
		'#ffd6a5',
		'#fdffb6',
		'#caffbf',
		'#9bf6ff',
		'#a0c4ff',
		'#bdb2ff',
		'#ffc6ff',
	],
	candy: [
		'#ff70a6',
		'#ff9770',
		'#ffd670',
		'#e9ff70',
		'#70d6ff',
		'#7b8cff',
		'#c77dff',
		'#ff70e9',
	],
	mono: [
		'#e9ecef',
		'#ced4da',
		'#adb5bd',
		'#868e96',
		'#6c757d',
		'#495057',
		'#343a40',
		'#212529',
	],
};

export const PALETTE_LIST = Object.keys( PALETTES ).map( ( id ) => ( {
	id,
	label: id.charAt( 0 ).toUpperCase() + id.slice( 1 ),
} ) );

export function paletteColor( name, i ) {
	const p = PALETTES[ name ] || PALETTES.vivid;
	return p[ ( ( i % p.length ) + p.length ) % p.length ];
}
