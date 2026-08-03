/**
 * Floating right-panel state (v1.265): which panels are detached and where
 * their windows sit. Persisted per browser so a workspace survives reloads.
 */

const KEY = 'wpie-panel-floats';

const MARGIN = 70; // px of a float that must stay reachable

export function clampFloat( pos, vw, vh ) {
	const w = 'number' === typeof vw ? vw : window.innerWidth;
	const h = 'number' === typeof vh ? vh : window.innerHeight;
	return {
		x: Math.min(
			Math.max( Math.round( pos.x ) || 0, 0 ),
			Math.max( 0, w - MARGIN )
		),
		y: Math.min(
			Math.max( Math.round( pos.y ) || 0, 0 ),
			Math.max( 0, h - MARGIN )
		),
	};
}

export function loadFloats() {
	try {
		const raw = JSON.parse( window.localStorage.getItem( KEY ) || '{}' );
		const out = {};
		for ( const [ id, pos ] of Object.entries( raw ) ) {
			if (
				pos &&
				'number' === typeof pos.x &&
				'number' === typeof pos.y
			) {
				out[ id ] = clampFloat( pos );
			}
		}
		return out;
	} catch ( e ) {
		return {};
	}
}

export function saveFloats( floats ) {
	try {
		window.localStorage.setItem( KEY, JSON.stringify( floats ) );
	} catch ( e ) {}
}
