/** Shared value math for React controls and the framework-free extension UI. */
export function numberSpec( input ) {
	const range = input.type === 'range';
	return {
		min: input.min === '' ? ( range ? 0 : -Infinity ) : Number( input.min ),
		max:
			input.max === '' ? ( range ? 100 : Infinity ) : Number( input.max ),
		step: input.step === 'any' ? 0 : Number( input.step ) || 1,
	};
}

export function normalizeNumber(
	value,
	{ min = -Infinity, max = Infinity, step = 1 }
) {
	if ( ! Number.isFinite( value ) ) {
		return null;
	}
	const base = Number.isFinite( min ) ? min : 0;
	const rounded =
		step > 0 ? base + Math.round( ( value - base ) / step ) * step : value;
	return Number( Math.max( min, Math.min( max, rounded ) ).toFixed( 10 ) );
}

/** A narrow, step-capped magnet; it must never grow to dozens of units. */
export function snapValue( value, min, max, detents, step = 1, width = 200 ) {
	const tolerance = Math.min(
		( ( max - min ) * 3 ) / Math.max( 1, width ),
		( step || 0.01 ) * 1.25
	);
	let distance = Infinity;
	let result = value;
	for ( const point of detents ) {
		const delta = Math.abs( value - point );
		if (
			point >= min &&
			point <= max &&
			delta <= tolerance &&
			delta < distance
		) {
			result = point;
			distance = delta;
		}
	}
	return result;
}

export function angleDetents( min, max ) {
	const points = [];
	for (
		let n = Math.ceil( min / 45 ) * 45;
		n <= max && points.length < 33;
		n += 45
	) {
		points.push( n );
	}
	return points;
}

/** Incremental movement preserves precision when a modifier changes mid-drag. */
export function dragNumber(
	current,
	dx,
	{ min, max, step },
	{ fine = false, fast = false, rangeWidth = 0 } = {}
) {
	const quantum = step || 0.01;
	const speed = fine
		? quantum / 4
		: rangeWidth
		? ( max - min ) / rangeWidth
		: quantum;
	return Math.max(
		min,
		Math.min( max, current + dx * speed * ( fast && ! fine ? 10 : 1 ) )
	);
}

export function parseNumberText( text ) {
	const clean = String( text )
		.trim()
		.replace( '\u2212', '-' )
		.replace( ',', '.' );
	return /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test( clean ) &&
		Number.isFinite( Number( clean ) )
		? Number( clean )
		: null;
}

/** Numeric affixes are display, not part of the value users have to type. */
export function splitNumberText( text ) {
	const match = String( text )
		.trim()
		.match( /^([+\-\u2212]?(?:\d+(?:[.,]\d+)?|[.,]\d+))\s*([^\d]*)$/ );
	return match
		? { value: parseNumberText( match[ 1 ] ), suffix: match[ 2 ].trim() }
		: null;
}

/**
 * ui.slider already accepts format(). Recognize only verified linear numeric
 * displays (50% from .5, 1.5x from 15). Non-numeric/discrete labels retain their
 * raw numeric domain; a custom parse/format pair can describe other mappings.
 */
export function numberDisplay( format, min, max, explicitScale ) {
	if ( Number.isFinite( explicitScale ) && explicitScale > 0 ) {
		return { scale: explicitScale, offset: 0 };
	}
	if (
		! format ||
		! Number.isFinite( min ) ||
		! Number.isFinite( max ) ||
		min === max
	) {
		return { scale: 1, offset: 0 };
	}
	let samples;
	try {
		samples = [ 0, 0.25, 0.5, 0.75, 1 ]
			.map( ( f ) => {
				const raw = min + ( max - min ) * f;
				return { raw, display: splitNumberText( format( raw ) ) };
			} )
			.filter( ( x ) => x.display );
	} catch {
		// A discrete formatter may only accept actual integer choices. Probing
		// its intermediate values must never break the existing control.
		return { scale: 1, offset: 0 };
	}
	if ( samples.length < 3 ) {
		return { scale: 1, offset: 0 };
	}
	const first = samples[ 0 ];
	const last = samples[ samples.length - 1 ];
	const scale =
		( last.display.value - first.display.value ) / ( last.raw - first.raw );
	const offset = first.display.value - first.raw * scale;
	// Integer displays can round by half a displayed unit. Reject arbitrary
	// fitted slopes: all current unit conversions have one of these scales.
	const known = [ 1, 100, 0.1, 0.01, 0.001, 1000, 180 / Math.PI ];
	const exact = known.find( ( n ) => Math.abs( scale - n ) < 1e-8 );
	if (
		exact &&
		Math.abs( offset ) < 1e-8 &&
		samples.every(
			( x ) =>
				Math.abs( x.display.value - x.raw * exact ) <= 0.50000001 &&
				x.display.suffix === first.display.suffix
		)
	) {
		return { scale: exact, offset: 0 };
	}
	return { scale: 1, offset: 0 };
}
