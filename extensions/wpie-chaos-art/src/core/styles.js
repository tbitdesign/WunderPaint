/**
 * The four styles of round one. A style is a CASTING, not a mode: which
 * actors take the stage, how they are tempered, what the matter looks
 * like and how the light treats it. The society's rules never change.
 */

import {
	Timekeeper,
	Colorist,
	Sculptor,
	Disruptor,
	Cameraman,
	Decayer,
	Restless,
} from './actors.js';
import {
	InkPainter,
	NeonPainter,
	OilPainter,
	CoralPainter,
	ShardPainter,
} from './painters.js';
import {
	Threader,
	Mason,
	HiveBuilder,
	Clockworker,
	Constellator,
	Metronome,
} from './painters-graphic.js';
import { schooledTemperament } from './movements.js';

export const STYLES = [
	{
		id: 'ink',
		label: 'Ink Storm',
		blurb: 'Ribbons of ink riding a storm.',
		ground: '#0e1014',
		fog: 0.0035,
		defaultPalette: 'inkbone',
		cursorMode: 'wind',
		glowBase: 0.15,
		painters: [ 8, 26 ],
		post: { bloom: 0.35, dof: 0.6, grain: 0.5, vignette: 0.55 },
		cast: {
			painter: InkPainter,
			key: 'ink',
			painterT: { rate: 0.5, verve: 0.8, speed: 16, segLen: 2 },
			timekeeper: { rate: 0.22, verve: 0.8 },
			colorist: { rate: 0.3, verve: 0.7 },
			sculptor: { rate: 0.5, verve: 0.9 },
			disruptor: { rate: 0.16, verve: 0.9 },
			cameraman: { rate: 0.14, verve: 0.7 },
			decayer: { rate: 0.5, verve: 0.5 },
		},
	},
	{
		id: 'coral',
		label: 'Coral Garden',
		blurb: 'A reef that grows while you watch.',
		ground: '#06181d',
		fog: 0.005,
		defaultPalette: 'aurora',
		cursorMode: 'attract',
		glowBase: 0.1,
		painters: [ 2, 5 ],
		post: { bloom: 0.3, dof: 0.85, grain: 0.35, vignette: 0.6 },
		cast: {
			painter: CoralPainter,
			key: 'coral',
			painterT: { rate: 0.1, verve: 0.6 },
			timekeeper: { rate: 0.12, verve: 0.6 },
			colorist: { rate: 0.2, verve: 0.5 },
			sculptor: { rate: 0.3, verve: 0.6 },
			disruptor: { rate: 0.06, verve: 0.5 },
			cameraman: { rate: 0.1, verve: 0.6 },
			decayer: { rate: 0.12, verve: 0.3 },
		},
	},
	{
		id: 'neon',
		label: 'Neon Weave',
		blurb: 'Glowing threads weaving a nervous net.',
		ground: '#04050a',
		fog: 0.0028,
		defaultPalette: 'ultraviolet',
		cursorMode: 'attract',
		glowBase: 0.9,
		painters: [ 10, 34 ],
		post: { bloom: 0.95, dof: 0.35, grain: 0.25, vignette: 0.7 },
		cast: {
			painter: NeonPainter,
			key: 'neon',
			painterT: { rate: 0.6, verve: 0.9, speed: 22, segLen: 1.6 },
			timekeeper: { rate: 0.3, verve: 0.9 },
			colorist: { rate: 0.4, verve: 0.8 },
			sculptor: { rate: 0.6, verve: 0.7 },
			disruptor: { rate: 0.2, verve: 0.8 },
			cameraman: { rate: 0.18, verve: 0.9 },
			decayer: { rate: 0.7, verve: 0.6 },
		},
	},
	{
		id: 'oil',
		label: 'Oil Nebula',
		blurb: 'Soft clouds of color, breathing.',
		ground: '#141220',
		fog: 0.002,
		defaultPalette: 'ember',
		cursorMode: 'wind',
		glowBase: 0.25,
		painters: [ 6, 18 ],
		post: { bloom: 0.5, dof: 1, grain: 0.55, vignette: 0.5 },
		cast: {
			painter: OilPainter,
			key: 'oil',
			painterT: { rate: 0.25, verve: 0.5, speed: 6 },
			timekeeper: { rate: 0.14, verve: 0.7 },
			colorist: { rate: 0.25, verve: 0.6 },
			sculptor: { rate: 0.35, verve: 0.8 },
			disruptor: { rate: 0.1, verve: 0.7 },
			cameraman: { rate: 0.12, verve: 0.5 },
			decayer: { rate: 0.25, verve: 0.4 },
		},
	},
	{
		id: 'shatter',
		label: 'Shatter',
		blurb: 'Crystal shards and hard breaks.',
		ground: '#0b0d12',
		fog: 0.003,
		defaultPalette: 'ocean',
		cursorMode: 'repel',
		glowBase: 0.2,
		painters: [ 8, 24 ],
		post: { bloom: 0.45, dof: 0.5, grain: 0.4, vignette: 0.6 },
		cast: {
			painter: ShardPainter,
			key: 'shard',
			painterT: { rate: 0.5, verve: 0.9, speed: 20, segLen: 3 },
			timekeeper: { rate: 0.26, verve: 0.9 },
			colorist: { rate: 0.3, verve: 0.6 },
			sculptor: { rate: 0.5, verve: 0.8 },
			// The lead role: fractures are what this style is about.
			disruptor: { rate: 0.34, verve: 1 },
			cameraman: { rate: 0.16, verve: 0.8 },
			decayer: { rate: 0.4, verve: 0.5 },
		},
	},
	{
		id: 'echo',
		label: 'Echo Chamber',
		blurb: 'The picture feeds back into itself.',
		ground: '#050408',
		fog: 0.0022,
		defaultPalette: 'candy',
		cursorMode: 'wind',
		glowBase: 0.85,
		painters: [ 6, 20 ],
		post: {
			bloom: 0.8,
			dof: 0.25,
			grain: 0.3,
			vignette: 0.75,
			feedback: 0.93,
			fbZoom: 0.014,
			fbTwist: 0.006,
		},
		cast: {
			painter: InkPainter,
			key: 'ink',
			painterT: {
				rate: 0.7,
				verve: 1,
				speed: 34,
				segLen: 1.4,
				store: 'glow',
			},
			timekeeper: { rate: 0.3, verve: 0.9 },
			colorist: { rate: 0.45, verve: 0.9 },
			sculptor: { rate: 0.5, verve: 0.7 },
			disruptor: { rate: 0.18, verve: 0.8 },
			cameraman: { rate: 0.2, verve: 0.9 },
			decayer: { rate: 0.6, verve: 0.6 },
		},
	},
	{
		id: 'ensemble',
		label: 'Ensemble',
		blurb: 'The whole company on one stage - a new cast every time.',
		ground: '#0d0c10',
		fog: 0.003,
		defaultPalette: 'gilded',
		cursorMode: 'wind',
		glowBase: 0.35,
		painters: [ 10, 30 ],
		post: { bloom: 0.55, dof: 0.6, grain: 0.45, vignette: 0.6 },
		cast: {
			mixed: true,
			timekeeper: { rate: 0.24, verve: 0.9 },
			colorist: { rate: 0.35, verve: 0.8 },
			sculptor: { rate: 0.5, verve: 0.8 },
			disruptor: { rate: 0.2, verve: 0.9 },
			cameraman: { rate: 0.16, verve: 0.8 },
			decayer: { rate: 0.45, verve: 0.5 },
		},
	},
	{
		id: 'ringparade',
		label: 'Ring Parade',
		blurb: 'Caravans of rings threaded through space.',
		ground: '#101318',
		fog: 0.003,
		defaultPalette: 'candy',
		cursorMode: 'wind',
		glowBase: 0.25,
		painters: [ 6, 18 ],
		post: { bloom: 0.35, dof: 0.7, grain: 0.35, vignette: 0.5 },
		cast: {
			painter: Threader,
			key: 'thread',
			painterT: { rate: 0.3, verve: 0.6, speed: 10, segLen: 4 },
			timekeeper: { rate: 0.16, verve: 0.7 },
			colorist: { rate: 0.3, verve: 0.7 },
			sculptor: { rate: 0.4, verve: 0.7 },
			disruptor: { rate: 0.1, verve: 0.6 },
			cameraman: { rate: 0.14, verve: 0.7 },
			decayer: { rate: 0.3, verve: 0.4 },
		},
	},
	{
		id: 'tileworks',
		label: 'Tile Works',
		blurb: 'Walls, stairs and floating towns on a hidden grid.',
		ground: '#15171c',
		fog: 0.0028,
		defaultPalette: 'bauhaus',
		cursorMode: 'off',
		glowBase: 0.1,
		painters: [ 4, 12 ],
		post: { bloom: 0.15, dof: 0.55, grain: 0.4, vignette: 0.45 },
		cast: {
			painter: Mason,
			key: 'mason',
			painterT: { rate: 0.2, verve: 0.7, grid: 7 },
			timekeeper: { rate: 0.14, verve: 0.6 },
			colorist: { rate: 0.25, verve: 0.6 },
			sculptor: { rate: 0.3, verve: 0.6 },
			disruptor: { rate: 0.08, verve: 0.6 },
			cameraman: { rate: 0.12, verve: 0.6 },
			decayer: { rate: 0.25, verve: 0.4 },
		},
	},
	{
		id: 'hive',
		label: 'Hive',
		blurb: 'Honeycomb growing cell by cell in tilted planes.',
		ground: '#141008',
		fog: 0.0034,
		defaultPalette: 'gilded',
		cursorMode: 'wind',
		glowBase: 0.3,
		painters: [ 2, 6 ],
		post: { bloom: 0.45, dof: 0.8, grain: 0.4, vignette: 0.6 },
		cast: {
			painter: HiveBuilder,
			key: 'hive',
			painterT: { rate: 0.14, verve: 0.6, cellR: 4.2 },
			timekeeper: { rate: 0.12, verve: 0.6 },
			colorist: { rate: 0.2, verve: 0.5 },
			sculptor: { rate: 0.3, verve: 0.5 },
			disruptor: { rate: 0.06, verve: 0.5 },
			cameraman: { rate: 0.1, verve: 0.6 },
			decayer: { rate: 0.15, verve: 0.3 },
		},
	},
	{
		id: 'clockwork',
		label: 'Clockwork',
		blurb: 'Circles rolling on circles, drawn with a steady hand.',
		ground: '#0a0e14',
		fog: 0.0026,
		defaultPalette: 'ocean',
		cursorMode: 'off',
		glowBase: 0.45,
		painters: [ 3, 10 ],
		post: { bloom: 0.5, dof: 0.4, grain: 0.3, vignette: 0.6 },
		cast: {
			painter: Clockworker,
			key: 'clock',
			painterT: { rate: 0.1, verve: 0.7 },
			timekeeper: { rate: 0.14, verve: 0.7 },
			colorist: { rate: 0.3, verve: 0.7 },
			sculptor: { rate: 0.35, verve: 0.6 },
			disruptor: { rate: 0.08, verve: 0.5 },
			cameraman: { rate: 0.12, verve: 0.7 },
			decayer: { rate: 0.2, verve: 0.4 },
		},
	},
	{
		id: 'constellation',
		label: 'Constellation',
		blurb: 'Stars set one by one and joined with ruled lines.',
		ground: '#030408',
		fog: 0.002,
		defaultPalette: 'mono',
		cursorMode: 'off',
		glowBase: 0.6,
		painters: [ 3, 9 ],
		post: { bloom: 0.35, dof: 0.3, grain: 0.25, vignette: 0.8 },
		cast: {
			painter: Constellator,
			key: 'constel',
			painterT: { rate: 1.4, verve: 0.7 },
			timekeeper: { rate: 0.1, verve: 0.5 },
			colorist: { rate: 0.2, verve: 0.5 },
			sculptor: { rate: 0.3, verve: 0.5 },
			disruptor: { rate: 0.06, verve: 0.5 },
			cameraman: { rate: 0.12, verve: 0.7 },
			decayer: { rate: 0.2, verve: 0.3 },
		},
	},
];

export function styleById( id ) {
	return STYLES.find( ( s ) => s.id === id ) || STYLES[ 0 ];
}

/**
 * Put the cast on stage for one world.
 *
 * @param {Object} world  The world they will share.
 * @param {Object} style  A STYLES entry.
 * @param {number} density 0..1 - how many painters take part.
 * @return {Array} The actors, ready to tick.
 */
export function makeEnsemble( world, style, density, movement = null ) {
	const c = style.cast;
	const d = Number.isFinite( density )
		? Math.min( 1, Math.max( 0, density ) )
		: 0.5;
	const n = Math.max(
		1,
		Math.round(
			( style.painters[ 0 ] +
				( style.painters[ 1 ] - style.painters[ 0 ] ) * d ) *
				( ( movement && movement.countMul ) || 1 )
		)
	);
	const actors = [
		new Timekeeper( world, c.timekeeper ),
		new Colorist( world, c.colorist ),
		new Sculptor( world, c.sculptor ),
		new Disruptor( world, c.disruptor ),
		new Cameraman( world, c.cameraman ),
		new Decayer( world, c.decayer ),
		new Restless( world, { rate: 0.05, verve: 0.7 } ),
	];
	world.stroke.glow = style.glowBase;
	if ( c.mixed ) {
		// The company: random weights over every painter type, drawn from
		// the piece's own entropy - a new cast every start, and nobody
		// knows beforehand who picks up the brush.
		const POOL = [
			{
				P: InkPainter,
				key: 'ink',
				t: { rate: 0.5, verve: 0.8, speed: 16, segLen: 2 },
				max: 1,
			},
			{
				P: NeonPainter,
				key: 'neon',
				t: { rate: 0.6, verve: 0.9, speed: 22, segLen: 1.6 },
				max: 1,
			},
			{
				P: OilPainter,
				key: 'oil',
				t: { rate: 0.25, verve: 0.5, speed: 6 },
				max: 0.6,
			},
			{
				P: ShardPainter,
				key: 'shard',
				t: { rate: 0.5, verve: 0.9, speed: 20, segLen: 3 },
				max: 0.7,
			},
			// Coral and hive grow whole colonies on their own; more than a
			// couple would own the stage instead of sharing it.
			{
				P: CoralPainter,
				key: 'coral',
				t: { rate: 0.1, verve: 0.6 },
				max: 0.15,
				cap: 2,
			},
			{
				P: Threader,
				key: 'thread',
				t: { rate: 0.3, verve: 0.6, speed: 10, segLen: 4 },
				max: 0.7,
			},
			{
				P: Mason,
				key: 'mason',
				t: { rate: 0.2, verve: 0.7, grid: 7 },
				max: 0.5,
			},
			{
				P: HiveBuilder,
				key: 'hive',
				t: { rate: 0.14, verve: 0.6, cellR: 4.2 },
				max: 0.25,
				cap: 2,
			},
			{
				P: Clockworker,
				key: 'clock',
				t: { rate: 0.1, verve: 0.7 },
				max: 0.4,
			},
			{
				P: Constellator,
				key: 'constel',
				t: { rate: 1.4, verve: 0.7 },
				max: 0.5,
			},
			{
				P: Metronome,
				key: 'metro',
				t: { rate: 0.3, verve: 0.7 },
				max: 0.5,
			},
		];
		const weights = POOL.map(
			( p ) =>
				world.rng() *
				p.max *
				( ( movement &&
				movement.weights &&
				movement.weights[ p.key ] !== undefined
					? movement.weights[ p.key ]
					: 1 ) || 0 )
		);
		const sum = weights.reduce( ( a, b ) => a + b, 0 ) || 1;
		let placed = 0;
		POOL.forEach( ( p, i ) => {
			let k = Math.round( ( weights[ i ] / sum ) * n );
			if ( p.cap ) {
				k = Math.min( k, p.cap );
			}
			const t = schooledTemperament( movement, p.key, p.t );
			for ( let j = 0; j < k; j++ ) {
				actors.push( new p.P( world, t ) );
				placed++;
			}
		} );
		if ( ! placed ) {
			actors.push(
				new InkPainter(
					world,
					schooledTemperament( movement, 'ink', POOL[ 0 ].t )
				)
			);
		}
		return staged( world, actors );
	}
	const t = schooledTemperament( movement, c.key || 'ink', c.painterT );
	for ( let i = 0; i < n; i++ ) {
		actors.push( new c.painter( world, t ) );
	}
	return staged( world, actors );
}

const CHARACTERS = 7; // timekeeper..restless, always first in the array

/**
 * Mark the painters, hand out entrance cues (one starts at once), and
 * apply the piece's scale regime - in a mixed hierarchy a few giants
 * live among many small hands.
 */
function staged( world, actors ) {
	for ( let i = CHARACTERS; i < actors.length; i++ ) {
		const a = actors[ i ];
		a.isPainter = true;
		a.entry = i === CHARACTERS ? 0 : world.rng() * 16 * world.rng();
		let mul = world.scaleMul || 1;
		if ( world.mixedScale ) {
			mul *=
				world.rng() < 0.2
					? 2.2 + world.rng() * 1.6
					: 0.55 + world.rng() * 0.5;
		}
		if ( a.widthJitter ) {
			a.widthJitter *= mul;
		}
		if ( a.cellR ) {
			a.cellR *= 0.7 + 0.3 * mul;
		}
	}
	return actors;
}

/**
 * One new painter walks on stage mid-piece (the Restless one's hire).
 * Honors the style's own type, or the whole pool for the ensemble.
 */
export function hireOne( world, style, movement = null ) {
	const c = style.cast;
	let p;
	if ( c.mixed ) {
		const kinds = [
			[
				InkPainter,
				'ink',
				{ rate: 0.5, verve: 0.8, speed: 16, segLen: 2 },
			],
			[
				NeonPainter,
				'neon',
				{ rate: 0.6, verve: 0.9, speed: 22, segLen: 1.6 },
			],
			[ OilPainter, 'oil', { rate: 0.25, verve: 0.5, speed: 6 } ],
			[
				ShardPainter,
				'shard',
				{ rate: 0.5, verve: 0.9, speed: 20, segLen: 3 },
			],
			[
				Threader,
				'thread',
				{ rate: 0.3, verve: 0.6, speed: 10, segLen: 4 },
			],
			[ Mason, 'mason', { rate: 0.2, verve: 0.7, grid: 7 } ],
			[ Clockworker, 'clock', { rate: 0.1, verve: 0.7 } ],
			[ Constellator, 'constel', { rate: 1.4, verve: 0.7 } ],
			[ Metronome, 'metro', { rate: 0.3, verve: 0.7 } ],
		];
		const k =
			kinds[ Math.floor( world.rng() * kinds.length ) % kinds.length ];
		p = new k[ 0 ](
			world,
			schooledTemperament( movement, k[ 1 ], k[ 2 ] )
		);
	} else {
		p = new c.painter(
			world,
			schooledTemperament( movement, c.key || 'ink', c.painterT )
		);
	}
	p.isPainter = true;
	p.entry = 0;
	return p;
}
