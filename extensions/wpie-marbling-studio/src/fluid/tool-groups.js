/**
 * The Fluid Lab tool deck's groups: id, label, tools, group icon. Plain data,
 * so the browser QA can count the tools in node (21.10.2026); the deck itself
 * is built in tool-deck.js.
 */
export const TOOL_GROUPS = [
	[ 'apply', 'Apply liquid', [ 'pipette', 'pour', 'spray', 'ring' ], 'drop' ],
	[ 'flow', 'Flow', [ 'stir', 'air', 'vortex', 'comb' ], 'wave' ],
	[
		'sources',
		'Sources',
		[ 'heat', 'cool', 'magnet', 'rotor', 'jet', 'removeSource' ],
		'magnet',
	],
	[
		'obstacles',
		'Obstacles',
		[ 'wall', 'draw', 'duplicate', 'erase' ],
		'comb',
	],
	[ 'depth', 'Depth', [ 'lift', 'drain' ], 'wave' ],
];
