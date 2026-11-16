import { clamp, wrap, TAU } from './geometry.js';

export function weightedIndex( weights, length, r ) {
	const w = Array.from( { length }, ( _, i ) =>
		clamp( weights?.[ i ] ?? 1, 0, 100 )
	);
	const sum = w.reduce( ( a, b ) => a + b, 0 );
	if ( ! sum ) return Math.min( length - 1, Math.floor( r * length ) );
	let target = r * sum;
	for ( let i = 0; i < w.length; i++ ) {
		target -= w[ i ];
		if ( target < 0 ) return i;
	}
	return length - 1;
}

/** Best-candidate placement measures distances across all repeat boundaries. */
export function distribute( P, elements, random, glyphCount ) {
	const n = elements.length,
		mode = P.distribution || 'jitter',
		spacing = clamp( P.spacing || 0, 0, 100 ) / 100;
	const centers = Array.from( { length: 3 }, () => ( {
		x: random(),
		y: random(),
	} ) );
	const placed = [];
	for ( let i = 0; i < n; i++ ) {
		const e = { ...elements[ i ] };
		if ( P.glyphWeights?.length )
			e.g = weightedIndex( P.glyphWeights, glyphCount, random() );
		if ( mode === 'cluster' ) {
			const c = centers[ i % 3 ],
				a = random() * TAU,
				r = Math.sqrt( random() ) * 0.22;
			e.x = wrap( c.x + Math.cos( a ) * r );
			e.y = wrap( c.y + Math.sin( a ) * r );
		}
		if ( mode === 'hero' ) {
			e.s *= i % 5 === 0 ? 1.7 : 0.55;
		}
		if ( spacing || mode === 'spaced' ) {
			let best = { x: e.x, y: e.y },
				bestD = -1;
			const required =
				( ( mode === 'spaced' ? Math.max( 0.65, spacing ) : spacing ) *
					0.8 ) /
				Math.sqrt( n );
			for ( let attempt = 0; attempt < 48; attempt++ ) {
				const candidate = attempt ? { x: random(), y: random() } : e;
				let d = Infinity;
				for ( const other of placed ) {
					const dx = Math.abs( candidate.x - other.x ),
						dy = Math.abs( candidate.y - other.y );
					d = Math.min(
						d,
						Math.hypot(
							Math.min( dx, 1 - dx ),
							Math.min( dy, 1 - dy )
						)
					);
				}
				if ( d > bestD ) {
					bestD = d;
					best = candidate;
				}
				if ( d >= required ) break;
			}
			e.x = best.x;
			e.y = best.y;
		}
		placed.push( e );
	}
	return placed;
}

export const clone = ( value ) =>
	Array.isArray( value )
		? value.map( clone )
		: value && typeof value === 'object'
		? Object.fromEntries(
				Object.entries( value ).map( ( [ k, v ] ) => [ k, clone( v ) ] )
		  )
		: value;

export function history( read, write, limit = 40 ) {
	const past = [],
		future = [];
	let lastKey = '',
		lastTime = 0;
	return {
		checkpoint( key = '' ) {
			const now = Date.now();
			if ( ! key || key !== lastKey || now - lastTime > 700 ) {
				past.push( clone( read() ) );
				if ( past.length > limit ) past.shift();
			}
			lastKey = key;
			lastTime = now;
			future.length = 0;
		},
		undo() {
			if ( ! past.length ) return false;
			future.push( clone( read() ) );
			write( past.pop() );
			lastKey = '';
			return true;
		},
		redo() {
			if ( ! future.length ) return false;
			past.push( clone( read() ) );
			write( future.pop() );
			lastKey = '';
			return true;
		},
		get canUndo() {
			return past.length > 0;
		},
		get canRedo() {
			return future.length > 0;
		},
	};
}
