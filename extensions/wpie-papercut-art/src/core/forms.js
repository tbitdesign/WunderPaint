/**
 * The editor's own shapes as paper motifs (v3.8).
 *
 * The shape tool's catalogue reaches extensions through bridge.shapes
 * (API 2.18): a list and path data at any size. Not every entry makes
 * sense cut from paper - grids, mazes and moire fields do not, and the
 * rose curve and the compass are lines rather than areas - so this is the
 * hand-picked part of it, in the order the shelf shows it. What
 * the editor does not list at runtime simply does not appear.
 */
export const FORM_SHAPES = [
	'heart',
	'heartcurve',
	'star',
	'starpoly',
	'flower',
	'clover',
	'leaf',
	'drop',
	'cloud',
	'crescent',
	'moon',
	'sun',
	'burst',
	'shooting',
	'butterfly',
	'mandala',
	'pine',
	'mountain',
	'skyline',
	'crown',
	'gem',
	'medal',
	'seal',
	'shield',
	'ribbon',
	'flag',
	'kite',
	'bolt',
	'gear',
	'hourglass',
	'arrow',
	'speech',
	'thought',
	'shout',
];

/** A shape id the model accepts: what the editor's ids look like. */
export const isFormId = ( id ) =>
	'string' === typeof id && /^[a-z][a-z0-9-]{0,31}$/.test( id );

/**
 * The picked shapes the editor actually offers, with its own (already
 * translated) names.
 *
 * @param {Object} bridge The editor bridge, or nothing.
 * @return {Array<{id:string,name:string}>} In shelf order.
 */
export function formChoices( bridge ) {
	const list =
		bridge && bridge.shapes && 'function' === typeof bridge.shapes.list
			? bridge.shapes.list()
			: [];
	const byId = new Map( list.map( ( s ) => [ s.id, s.name ] ) );
	return FORM_SHAPES.filter( ( id ) => byId.has( id ) ).map( ( id ) => ( {
		id,
		name: byId.get( id ) || id,
	} ) );
}
