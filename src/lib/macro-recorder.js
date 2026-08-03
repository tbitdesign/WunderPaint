/**
 * Macro recorder (v0.4), a tiny dependency-free sink. Recordable ops
 * (effects, filters, adjustments, document geometry) push steps here while
 * recording is active. Kept separate from macros.js so instrumented op
 * modules never create an import cycle.
 */

const state = {
	active: false,
	steps: [],
};

const listeners = new Set();
const notify = () => listeners.forEach( ( cb ) => cb() );

/**
 * Watch recorder state (Actions panel).
 *
 * @param {Function} cb Change callback.
 * @return {Function} Unsubscribe.
 */
export function subscribeRecorder( cb ) {
	listeners.add( cb );
	return () => listeners.delete( cb );
}

export const isRecording = () => state.active;
export const recordedSteps = () => [ ...state.steps ];

export function startRecording() {
	state.active = true;
	state.steps = [];
	notify();
}

/** @return {Array} The recorded steps. */
export function stopRecording() {
	state.active = false;
	notify();
	return [ ...state.steps ];
}

/**
 * Record one step (no-op unless recording). Params must be JSON-safe.
 *
 * @param {string} op     Op id from MACRO_OPS.
 * @param {Object} params Op params.
 */
export function recordStep( op, params = {} ) {
	if ( ! state.active ) {
		return;
	}
	// Adjacent duplicate adjustments collapse (slider drags commit often).
	const last = state.steps[ state.steps.length - 1 ];
	if ( last && 'setAdjustments' === op && 'setAdjustments' === last.op ) {
		last.params = params;
	} else {
		state.steps.push( { op, params } );
	}
	notify();
}
