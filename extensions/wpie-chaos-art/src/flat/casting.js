/**
 * Casting for the flat stage: who takes the stage for a school.
 *
 * The characters are always there (timekeeper, colorist, disruptor,
 * restless); the painters come by role, their number from the school
 * and the density dial. The opener starts at once, the finisher arrives
 * late, everyone else on a staggered cue.
 */

import { Timekeeper } from '../core/actors.js';
import { Painter, Colorist, Disruptor, Restless, Critic } from './actors.js';
import { SCHOOLS } from './schools.js';
import { familyOf } from './signature.js';

/** For a mixed society: a school for one painter, mostly of the anchor's family. */
export function mixedVoice( world, anchor ) {
	const fam = familyOf( anchor.id );
	const schools = world.ensembleSchools?.length
		? world.ensembleSchools
		: SCHOOLS;
	const kin = schools.filter(
		( s ) => s.id !== anchor.id && familyOf( s.id ) === fam
	);
	const pool =
		kin.length && world.rng() < 0.7
			? kin
			: schools.filter( ( s ) => s.id !== anchor.id );
	return pool[ Math.floor( world.rng() * pool.length ) % pool.length ];
}

export const CHARACTERS = 5;

export function makeCast( world, school, density ) {
	const d = Number.isFinite( density )
		? Math.min( 1, Math.max( 0, density ) )
		: 0.5;
	const [ lo, hi ] = school.tempo.painters || [ 3, 8 ];
	const n = Math.max(
		world.ensembleSchools?.length || 1,
		Math.round( lo + ( hi - lo ) * d )
	);
	const chaos = world.params.chaos || 0.5;
	const actors = [
		new Timekeeper( world, {
			rate: 0.12 + chaos * 0.15,
			verve: 0.5 + chaos * 0.5,
		} ),
		new Colorist( world, { rate: 0.2, verve: 0.6 } ),
		new Disruptor( world, { rate: 0.05 + chaos * 0.12, verve: 0.6 } ),
		new Restless( world, { rate: 0.05, verve: 0.7 } ),
		new Critic( world, { rate: 0.35, verve: 0.5 } ),
	];
	const roles = [ 'opener' ];
	for ( let i = 1; i < n; i++ ) {
		const r = world.rng();
		roles.push(
			r < 0.45
				? 'builder'
				: r < 0.65
				? 'responder'
				: r < 0.8
				? 'wanderer'
				: r < 0.92
				? 'accentor'
				: 'finisher'
		);
	}
	if ( n > 2 && ! roles.includes( 'finisher' ) ) {
		roles[ n - 1 ] = 'finisher';
	}
	if ( n > 3 && ! roles.includes( 'accentor' ) ) {
		roles[ n - 2 ] = 'accentor';
	}
	roles.forEach( ( role, i ) => {
		const p = new Painter( world, {
			role,
			sizeMul: world.mixedScale && world.rng() < 0.2 ? 1.8 : 1,
			// In an ensemble every second painter speaks another school.
			voice:
				world.ensembleSchools?.[ i ] ||
				( world.mixed && world.rng() < 0.6
					? mixedVoice( world, school )
					: null ),
		} );
		p.entry =
			i === 0
				? 0
				: 'finisher' === role
				? 12 + world.rng() * 20
				: world.rng() * 10 * world.rng();
		actors.push( p );
	} );
	// The guest: one painter from another school, a wanderer or an
	// accentor, in late and at a lower rate - an accent, not a takeover.
	const guest = world.signature && world.signature.guest;
	if ( guest ) {
		const g = new Painter( world, {
			role: world.rng() < 0.5 ? 'wanderer' : 'accentor',
			voice: guest,
			rate: 0.55,
		} );
		g.entry = 6 + world.rng() * 12;
		actors.push( g );
	}
	return actors;
}

/** One more painter mid-piece, for the restless one's hire. */
export function hireOne( world ) {
	const r = world.rng();
	const p = new Painter( world, {
		role: r < 0.5 ? 'builder' : r < 0.8 ? 'responder' : 'wanderer',
		voice:
			world.mixed && world.rng() < 0.6
				? mixedVoice( world, world.voice || world.school )
				: null,
	} );
	p.entry = 0;
	return p;
}
