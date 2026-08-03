/**
 * Provider-friendly aspect ratios. Leaf module (no imports) so pipelines
 * like the automation runner can use it without pulling in the local-AI
 * loader chain that ai-actions.js carries.
 */

/** Nearest provider-friendly aspect-ratio label for a w×h region. */
export function nearestAspect( w, h ) {
	const ASPECTS = [
		[ '1:1', 1 ],
		[ '5:4', 1.25 ],
		[ '4:3', 4 / 3 ],
		[ '3:2', 1.5 ],
		[ '16:9', 16 / 9 ],
		[ '21:9', 21 / 9 ],
		[ '4:5', 0.8 ],
		[ '3:4', 0.75 ],
		[ '2:3', 2 / 3 ],
		[ '9:16', 9 / 16 ],
	];
	const ratio = w / h;
	let best = '1:1';
	let diff = Infinity;
	for ( const [ label, value ] of ASPECTS ) {
		const delta = Math.abs( Math.log( ratio / value ) );
		if ( delta < diff ) {
			diff = delta;
			best = label;
		}
	}
	return best;
}
