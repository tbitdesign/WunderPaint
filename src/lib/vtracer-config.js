/**
 * VTracer config mapping (v1.128.0). The vtracer-wasm wrapper feeds the
 * config RAW into the visioncortex core, but the core expects different
 * units than the documented CLI options. The official CLI converts in
 * converter.rs; without the same conversion the tracer turns rectangles
 * into trapezoids and simple illustrations into mush:
 *
 *   cornerThreshold  degrees -> RADIANS (60 raw radians = every corner
 *                    counts as smooth and gets shaved off)
 *   spliceThreshold  degrees -> RADIANS
 *   filterSpeckle    side length in px -> AREA (value squared)
 *   colorPrecision   significant bits -> is_same_color_a SHIFT (8 - bits)
 *
 * Public options keep the CLI units, so values match the vtracer docs and
 * the online demo.
 */

const DEFAULTS = {
	binary: false,
	mode: 'spline',
	hierarchical: 'stacked',
	cornerThreshold: 60,
	lengthThreshold: 4,
	maxIterations: 10,
	spliceThreshold: 45,
	filterSpeckle: 4,
	colorPrecision: 6,
	layerDifference: 16,
	pathPrecision: 2,
};

const deg2rad = ( deg ) => ( deg * Math.PI ) / 180;

/**
 * Build the raw wasm config from CLI-unit options.
 *
 * @param {Object} [opts] Overrides in CLI units.
 * @return {Object} Config in core units, all fields present (the wasm
 *                  wrapper panics on missing fields).
 */
export function vtracerConfig( opts = {} ) {
	const config = { ...DEFAULTS, ...opts };
	return {
		...config,
		cornerThreshold: deg2rad( config.cornerThreshold ),
		spliceThreshold: deg2rad( config.spliceThreshold ),
		filterSpeckle: config.filterSpeckle * config.filterSpeckle,
		colorPrecision: Math.max( 0, Math.min( 8, 8 - config.colorPrecision ) ),
	};
}
