/**
 * The media: WHAT the society paints with.
 *
 * The third axis, next to style (who paints) and school (what they
 * learned). A medium never changes a single decision - the same
 * commands flow out of the core - it changes what MATTER the engine
 * makes of them: sculpted 3D bodies, or flat, textured strokes that
 * follow the gesture, sit on paper and fade into bright air the way
 * paint does. Impressionist dabs floating in deep space is the whole
 * point of the exercise.
 *
 * tex indexes tiles in the engine's procedural stroke atlas (4x2).
 */

export const MEDIA = [
	{ id: 'sculpt', label: 'Sculpted', paint: false },
	{
		id: 'brush',
		label: 'Brush strokes',
		paint: true,
		tex: [ 0, 4 ],
		alpha: [ 0.8, 1 ],
		stretch: 2.6,
		wmul: 1.7,
		paper: 0.55,
		air: 1.6,
		ground: '#e9e3d5',
		post: { bloom: 0.15, dof: 0.35 },
	},
	{
		id: 'watercolor',
		label: 'Watercolor',
		paint: true,
		tex: [ 1, 5 ],
		alpha: [ 0.22, 0.45 ],
		stretch: 1.7,
		wmul: 2.8,
		paper: 0.75,
		air: 2.2,
		ground: '#f2ecdf',
		post: { bloom: 0, dof: 0.25 },
	},
	{
		id: 'pastel',
		label: 'Pastel',
		paint: true,
		tex: [ 2, 6 ],
		alpha: [ 0.65, 0.9 ],
		stretch: 1.9,
		wmul: 2.3,
		paper: 0.95,
		air: 1.8,
		ground: '#e6dfd2',
		post: { bloom: 0.05, dof: 0.3, grain: 1.5 },
	},
	{
		id: 'sketch',
		label: 'Ink sketch',
		paint: true,
		tex: [ 3 ],
		alpha: [ 0.5, 0.85 ],
		stretch: 2.4,
		wmul: 1.5,
		paper: 0.6,
		air: 1.4,
		ground: '#efeae0',
		post: { bloom: 0, dof: 0.3 },
	},
	{
		id: 'splash',
		label: 'Splash',
		paint: true,
		tex: [ 7 ],
		alpha: [ 0.75, 0.95 ],
		stretch: 1.2,
		wmul: 2.5,
		paper: 0.5,
		air: 1.2,
		ground: '#e9e6de',
		post: { bloom: 0.2, dof: 0.4 },
	},
];

export function mediumById( id ) {
	return MEDIA.find( ( m ) => m.id === id ) || MEDIA[ 0 ];
}

/**
 * The medium a piece actually paints with: an explicit choice wins,
 * otherwise the school brings its own, otherwise matter stays 3D.
 */
export function resolveMedium( mediumId, movement ) {
	if ( mediumId && 'auto' !== mediumId ) {
		return mediumById( mediumId );
	}
	if ( movement && movement.medium ) {
		return mediumById( movement.medium );
	}
	return MEDIA[ 0 ];
}
