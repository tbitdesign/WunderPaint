import { rng } from '../marbling.js';

// Keep the existing seeded generator; each bath has its own gesture stream.
const streams = new WeakMap();
function patternRandom( sim, p ) {
	if ( ! streams.has( sim ) ) {
		streams.set( sim, rng( p.seed ) );
	}
	return streams.get( sim );
}

export const APPLY_TOOLS = [ 'pipette', 'pour', 'spray', 'ring' ];
export const OBSTACLE_TOOLS = [ 'wall', 'draw', 'duplicate', 'erase' ];

export function toolRadius( p ) {
	return p.tool === 'spray'
		? p.spraySpread
		: p.tool === 'ring'
		? p.ringRadius
		: p.radius;
}

/** A bounded burst, shared by clicks and the fixed-rate held gesture. */
export function applyPattern(
	sim,
	p,
	point,
	amount,
	random = patternRandom( sim, p )
) {
	const ring = p.tool === 'ring';
	const spread = ring ? p.ringRadius : p.spraySpread;
	// Resolve individual marks on the grid / particle spacing without changing
	// the solver. Ring thickness stays below its radius so its center is open.
	const minimum = sim.kind === 'volume' ? sim.spacing * 0.55 : 1.3 / sim.h;
	const radius = Math.max(
		minimum,
		Math.min( p.radius * 0.35, spread * 0.3 )
	);
	const count = ring
		? Math.min(
				64,
				Math.max(
					12,
					Math.ceil( ( 2 * Math.PI * spread ) / ( radius * 1.2 ) )
				)
		  )
		: 8;
	for ( let i = 0; i < count; i++ ) {
		const angle = ring
			? ( i * Math.PI * 2 ) / count
			: random() * Math.PI * 2;
		const distance = ring ? spread : Math.sqrt( random() ) * spread;
		const x = point.x + ( Math.cos( angle ) * distance ) / sim.aspect;
		const y = point.y + Math.sin( angle ) * distance;
		// Do not pile clipped samples against the rim through the solver clamp.
		if ( x < 0 || x > 1 || y < 0 || y > 1 ) {
			continue;
		}
		sim.drop(
			x,
			y,
			radius,
			p.material,
			p.colors[ p.material ],
			amount,
			p.reagentStrength,
			p.waxPourTemperature
		);
	}
}

/** Time accumulation keeps a held spray/ring independent of display refresh. */
export function holdPattern(
	sim,
	p,
	gesture,
	dt,
	random = patternRandom( sim, p )
) {
	gesture.patternTime = ( gesture.patternTime || 0 ) + dt;
	while ( gesture.patternTime >= 0.05 - 1e-9 ) {
		gesture.patternTime = Math.max( 0, gesture.patternTime - 0.05 );
		applyPattern( sim, p, gesture.at, p.amount * 0.125, random );
	}
}

/** Tines travel perpendicular to the stroke, measured in bath coordinates. */
export function combStroke( sim, p, from, to ) {
	const dx = to.x - from.x,
		dy = to.y - from.y;
	const distance = Math.hypot( dx * sim.aspect, dy );
	if ( distance < 1e-8 ) {
		return;
	}
	const radius = Math.max(
		1.3 / sim.h,
		Math.min( p.radius * 0.5, p.combSpacing * 0.4 )
	);
	const steps = Math.min( 64, Math.max( 1, Math.ceil( distance / radius ) ) );
	for ( let j = 1; j <= steps; j++ ) {
		for ( let i = 0; i < p.combTeeth; i++ ) {
			const offset = ( i - ( p.combTeeth - 1 ) / 2 ) * p.combSpacing;
			const x =
				from.x +
				( dx * j ) / steps -
				( ( dy / distance ) * offset ) / sim.aspect;
			const y =
				from.y +
				( dy * j ) / steps +
				( ( dx * sim.aspect ) / distance ) * offset;
			if ( x < 0 || x > 1 || y < 0 || y > 1 ) {
				continue;
			}
			sim.impulse(
				x,
				y,
				radius,
				( dx * sim.w * p.force * 6 ) / steps,
				( dy * sim.h * p.force * 6 ) / steps
			);
		}
	}
}
