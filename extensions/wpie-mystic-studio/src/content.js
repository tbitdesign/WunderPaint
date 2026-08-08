/**
 * Language-independent chart facts, keyed by stable indices (sign index
 * 0..11 = Aries..Pisces). Everything a translator touches lives in
 * i18n.js as index-keyed arrays NEXT TO the dictionary - never keyed by
 * translated strings.
 */

/** Element index per sign: 0 fire, 1 earth, 2 air, 3 water. */
export const SIGN_ELEMENT = [ 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3 ];

/** Modality index per sign: 0 cardinal, 1 fixed, 2 mutable. */
export const SIGN_MODALITY = [ 0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2 ];

/** Traditional ruling planet per sign, as a body key of astro.BODIES. */
export const SIGN_RULER = [
	'mars',
	'venus',
	'mercury',
	'moon',
	'sun',
	'mercury',
	'venus',
	'pluto',
	'jupiter',
	'saturn',
	'uranus',
	'neptune',
];

/** Tropical date spans per sign, [ [month, day] from, [month, day] to ]. */
export const SIGN_DATES = [
	[
		[ 3, 21 ],
		[ 4, 19 ],
	],
	[
		[ 4, 20 ],
		[ 5, 20 ],
	],
	[
		[ 5, 21 ],
		[ 6, 20 ],
	],
	[
		[ 6, 21 ],
		[ 7, 22 ],
	],
	[
		[ 7, 23 ],
		[ 8, 22 ],
	],
	[
		[ 8, 23 ],
		[ 9, 22 ],
	],
	[
		[ 9, 23 ],
		[ 10, 22 ],
	],
	[
		[ 10, 23 ],
		[ 11, 21 ],
	],
	[
		[ 11, 22 ],
		[ 12, 21 ],
	],
	[
		[ 12, 22 ],
		[ 1, 19 ],
	],
	[
		[ 1, 20 ],
		[ 2, 18 ],
	],
	[
		[ 2, 19 ],
		[ 3, 20 ],
	],
];
