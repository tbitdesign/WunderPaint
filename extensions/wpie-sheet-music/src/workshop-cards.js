/** Finished music graphics. Uses the existing engraving, chord and SVG engines. */
import { svgDoc, textEl, r } from './engine/svg.js';
import { svgPiano, svgFretboard, svgChordDiagram } from './engine/fretboard.js';
import { INSTRUMENTS } from './engine/voicings.js';
import { pitchClass, keyPreference } from './engine/chords.js';
import { SCALE_LABELS } from './engine/scales.js';
import { scaleAbc, CIRCLE_MAJORS, CIRCLE_MINORS } from './engine/notation.js';
import { isStudioCard, renderStudio } from './studio-cards.js';
import {
	melodyAbc,
	rhythmAbc,
	rhythmBars,
	scaleNotes,
	noteToAbc,
	diatonicChords,
	chordNotes,
	intervalNotes,
	INTERVAL_NAMES,
	selectedGrip,
} from './engine/workshop.js';

const tx = (
	x,
	y,
	text,
	style,
	size = 24,
	accent = false,
	anchor = 'start',
	weight = 400
) =>
	textEl( x, y, text, {
		size,
		font: style.fonts.text,
		fill: accent ? style.accent : style.ink,
		anchor,
		weight,
	} );
const doc = ( width, height, children ) =>
	svgDoc( { width, height, children } );
const line = ( x1, y1, x2, y2, color, weight = 1 ) =>
	`<line x1="${ r( x1 ) }" y1="${ r( y1 ) }" x2="${ r( x2 ) }" y2="${ r(
		y2
	) }" stroke="${ color }" stroke-width="${ weight }"/>`;
const rect = ( x, y, w, h, color, opacity = 1, radius = 0 ) =>
	`<rect x="${ r( x ) }" y="${ r( y ) }" width="${ r( w ) }" height="${ r(
		h
	) }" rx="${ radius }" fill="${ color }" opacity="${ opacity }"/>`;

function inset( svg, api, x, y, maxW, maxH = Infinity ) {
	const { w, h, inner } = api.stripSvg( svg );
	const scale = Math.min( maxW / ( w || 1 ), maxH / ( h || 1 ) );
	return {
		svg: `<g transform="translate(${ r( x ) } ${ r( y ) }) scale(${ r(
			scale
		) })">${ inner }</g>`,
		height: h * scale,
	};
}
async function notation( abc, ctx, width, scale = 1.5, extra = {} ) {
	const out = await ctx.env.renderScore( abc, {
		width,
		scale,
		margin: 8,
		fonts: ctx.style.fonts,
		ink: ctx.style.ink,
		accent: ctx.style.accent,
		...extra,
	} );
	ctx.warnings.push( ...( out.warnings || [] ) );
	return doc( out.width, out.height, [
		`<g transform="scale(${ scale })">${
			ctx.api.stripSvg( out.svg ).inner
		}</g>`,
	] );
}
function noteChordAbc( notes, asChord = true ) {
	const pitches = notes.map( ( n ) => noteToAbc( n ) );
	return `X:1\nM:none\nL:1/4\nK:C\n${
		asChord ? '[' + pitches.join( '' ) + ']4' : pitches.join( ' ' )
	} |]`;
}
function keyboard( notes, width, style ) {
	const min =
		Math.floor( Math.min( ...notes.map( ( n ) => n.midi ) ) / 12 ) * 12;
	const max =
		Math.floor( Math.max( ...notes.map( ( n ) => n.midi ) ) / 12 ) * 12 +
		12;
	const keys = [];
	for ( let midi = min; midi <= max; midi++ ) {
		const n = notes.find( ( note ) => note.midi === midi );
		keys.push( {
			midi,
			pc: midi % 12,
			black: [ 1, 3, 6, 8, 10 ].includes( midi % 12 ),
			on: !! n,
			root: n === notes[ 0 ],
			label: n ? n.name : '',
		} );
	}
	return svgPiano( keys, {
		width,
		ink: style.ink,
		accent: style.accent,
		font: style.fonts.text,
	} );
}
function labeled( svg, label, ctx, size = 24 ) {
	const { w, h, inner } = ctx.api.stripSvg( svg );
	return doc( w, h + 50, [
		tx( 0, 28, label, ctx.style, size, true, 'start', 700 ),
		`<g transform="translate(0 50)">${ inner }</g>`,
	] );
}

export async function renderWorkshop( params, env, api ) {
	const frame = api.frameFor( params, env.docW, env.docH );
	const style = api.styleFor( params, env.kits );
	const width = Math.max( 200, frame.width - 2 * params.layout.margin );
	const ctx = {
		params,
		env,
		api,
		frame,
		style,
		width,
		t: env.t || ( ( s ) => s ),
		warnings: [],
	};
	const renderers = {
		melody: renderMelody,
		rhythm: renderRhythm,
		harmony: renderHarmony,
		lesson: renderLesson,
	};
	const blocks = await ( isStudioCard( params )
		? renderStudio( ctx, {
				tx,
				doc,
				line,
				rect,
				inset,
				notation,
				keyboard,
				labeled,
				noteChordAbc,
		  } )
		: renderers[ params.card ]( ctx ) );
	return api.compose( {
		frame,
		style,
		margin: params.layout.margin,
		title: params.text.title || ctx.title,
		blocks: blocks.map( ( svg ) =>
			typeof svg === 'string' ? { svg, gap: 30 } : { ...svg, gap: 30 }
		),
		warnings: ctx.warnings,
		t: ctx.t,
	} );
}

async function renderMelody( ctx ) {
	const { params: p, width, t } = ctx;
	ctx.title = t( 'Melody Builder' );
	const model = melodyAbc( p.melody ),
		scale = p.layout.scale;
	const result = await ctx.env.renderScore( model.abc, {
		width,
		margin: 8,
		scale,
		fonts: ctx.style.fonts,
		ink: ctx.style.ink,
		accent: ctx.style.accent,
		noteRanges: model.ranges,
		clef: p.melody.clef,
		annotations: p.analysis.items,
	} );
	ctx.warnings.push( ...( result.warnings || [] ) );
	return [
		{
			svg: doc( result.width, result.height, [
				`<g transform="scale(${ scale })">${
					ctx.api.stripSvg( result.svg ).inner
				}</g>`,
			] ),
			geometry: result.geometry,
		},
	];
}

async function renderRhythm( ctx ) {
	const { params: p, width, style, t } = ctx;
	const o = p.rhythm;
	ctx.title =
		o.kind === 'strum'
			? t( 'Strumming patterns' )
			: o.kind === 'picking'
			? t( 'Fingerpicking patterns' )
			: o.kind === 'drums'
			? t( 'Drum grooves' )
			: t( 'Rhythm Workshop' );
	const blocks = [];
	const rows = Math.max( 1, Math.min( 6, o.rows ) );
	for ( let row = 0; row < rows; row++ ) {
		if ( o.kind === 'clap' ) {
			blocks.push(
				labeled(
					await notation(
						rhythmAbc( o, row ),
						ctx,
						width,
						p.layout.scale
					),
					`${ t( 'Exercise' ) } ${ row + 1 }`,
					ctx
				)
			);
		} else if ( o.kind === 'drums' ) {
			const steps = 8;
			const unit = Math.min( 90, ( width - 185 ) / steps );
			const start = 170;
			const sounds = [ t( 'Hi-hat' ), t( 'Snare' ), t( 'Kick' ) ];
			const patterns =
				o.pattern === 'half-time'
					? [ [ 0, 1, 2, 3, 4, 5, 6, 7 ], [ 4 ], [ 0, 3 ] ]
					: o.pattern === 'offbeat'
					? [
							[ 1, 3, 5, 7 ],
							[ 2, 6 ],
							[ 0, 3, 4, 7 ],
					  ]
					: [
							[ 0, 1, 2, 3, 4, 5, 6, 7 ],
							[ 2, 6 ],
							[ 0, 4 ],
					  ];
			const shapes = [
				tx(
					0,
					26,
					`${ t( 'Drum grooves' ) } · ${ row + 1 }`,
					style,
					24,
					true,
					'start',
					700
				),
			];
			for ( let s = 0; s < sounds.length; s++ ) {
				const y = 88 + s * 70;
				shapes.push(
					tx( 0, y + 8, sounds[ s ], style, 22 ),
					line( start, y, start + steps * unit, y, style.ink )
				);
				for ( let step = 0; step < steps; step++ ) {
					const x = start + ( step + 0.5 ) * unit;
					const active =
						patterns[ s ].includes( step ) ||
						( row % 2 === 1 && s === 2 && step === 3 );
					if ( active )
						shapes.push(
							s === 0
								? `<path d="M${ x - 8 } ${
										y - 8
								  }l16 16m-16 0l16-16" stroke="${
										style.accent
								  }" stroke-width="3" fill="none"/>`
								: `<ellipse cx="${ x }" cy="${ y }" rx="10" ry="7" fill="${ style.accent }"/>`
						);
					if ( o.counts && s === 2 )
						shapes.push(
							tx(
								x,
								y + 44,
								step % 2 ? '&' : String( step / 2 + 1 ),
								style,
								20,
								false,
								'middle'
							)
						);
				}
			}
			blocks.push( doc( width, 300, shapes ) );
			continue;
		} else {
			const events = rhythmBars(
				{
					...o,
					bars: 1,
					rests: false,
					level: o.kind === 'picking' ? 'eighths' : o.level,
				},
				row
			)[ 0 ];
			const total = events.reduce( ( s, e ) => s + e.ticks, 0 );
			const shapes = [
				tx(
					0,
					28,
					`${ ctx.title } · ${ row + 1 }`,
					style,
					24,
					true,
					'start',
					700
				),
			];
			let pos = 0;
			const picking =
				o.pattern === 'rolling'
					? [ 'p', 'i', 'm', 'a', 'm', 'i' ]
					: [ 'p', 'i', 'm', 'i' ];
			events.forEach( ( e, i ) => {
				const x =
					32 + ( ( pos + e.ticks / 2 ) / total ) * ( width - 64 );
				if ( o.kind === 'picking' )
					shapes.push(
						tx(
							x,
							106,
							picking[ ( i + row ) % picking.length ],
							style,
							42,
							true,
							'middle',
							700
						)
					);
				else {
					const up = o.pattern !== 'down' && i % 2 === 1;
					shapes.push(
						`<path d="M${ r( x ) } ${ up ? 115 : 65 }v${
							up ? -50 : 50
						}m-12 ${ up ? 12 : -12 }l12 ${ up ? -12 : 12 } 12 ${
							up ? 12 : -12
						}" stroke="${
							style.accent
						}" stroke-width="4" fill="none" stroke-linecap="round"/>`
					);
				}
				if ( o.counts )
					shapes.push(
						tx( x, 158, e.count, style, 22, false, 'middle' )
					);
				pos += e.ticks;
			} );
			blocks.push( doc( width, 184, shapes ) );
		}
		if ( o.blanks && o.kind === 'clap' )
			blocks.push(
				doc( width, 46, [
					tx( 0, 25, t( 'Complete the empty bars.' ), style, 20 ),
				] )
			);
	}
	if ( o.kind === 'picking' )
		blocks.push(
			doc( width, 60, [
				tx(
					0,
					28,
					t( 'p: thumb · i: index · m: middle · a: ring' ),
					style,
					22
				),
			] )
		);
	return blocks;
}

function circleOfFifths( ctx ) {
	const { width, style, params: p, t } = ctx;
	const size = Math.min( width, 1120 ),
		cx = width / 2,
		cy = size / 2;
	const outer = size * 0.45,
		inner = size * 0.24;
	const point = ( rad, a ) => [
		cx + Math.sin( a ) * rad,
		cy - Math.cos( a ) * rad,
	];
	const path = ( a, b ) => {
		const [ x1, y1 ] = point( outer, a ),
			[ x2, y2 ] = point( outer, b ),
			[ x3, y3 ] = point( inner, b ),
			[ x4, y4 ] = point( inner, a );
		return `M${ x1 } ${ y1 }A${ outer } ${ outer } 0 0 1 ${ x2 } ${ y2 }L${ x3 } ${ y3 }A${ inner } ${ inner } 0 0 0 ${ x4 } ${ y4 }Z`;
	};
	const pieces = [];
	const minors = CIRCLE_MINORS.map( ( n, i ) => ( i === 6 ? 'D#' : n ) );
	const active = ( p.harmony.minor ? minors : CIRCLE_MAJORS ).findIndex(
		( n ) => pitchClass( n.replace( /m$/, '' ) ) === pitchClass( p.root )
	);
	for ( let i = 0; i < 12; i++ ) {
		const a = ( i * Math.PI ) / 6;
		const selected = i === active;
		const near = ( i + 1 ) % 12 === active || ( i + 11 ) % 12 === active;
		pieces.push(
			`<path d="${ path(
				a - Math.PI / 12 + 0.012,
				a + Math.PI / 12 - 0.012
			) }" fill="${ style.accent }" fill-opacity="${
				selected ? 0.24 : near ? 0.12 : 0.045
			}" stroke="${ style.accent }" stroke-opacity="${
				selected ? 0.85 : 0.25
			}" stroke-width="${ selected ? 3 : 1 }"/>`
		);
		const [ mx, my ] = point( size * 0.385, a ),
			[ rx, ry ] = point( size * 0.29, a ),
			[ sx, sy ] = point( size * 0.49, a );
		pieces.push(
			tx(
				mx,
				my + 10,
				CIRCLE_MAJORS[ i ],
				style,
				size * 0.033,
				selected,
				'middle',
				700
			)
		);
		pieces.push(
			tx(
				rx,
				ry + 8,
				minors[ i ] + 'm',
				style,
				size * 0.023,
				selected,
				'middle'
			)
		);
		const sig = i === 0 ? '0' : i <= 6 ? i + '♯' : 12 - i + '♭';
		pieces.push(
			tx( sx, sy + 6, sig, style, size * 0.017, false, 'middle' )
		);
	}
	pieces.push(
		tx(
			cx,
			cy - 5,
			p.root + ( p.harmony.minor ? 'm' : '' ),
			style,
			size * 0.075,
			true,
			'middle',
			700
		)
	);
	pieces.push(
		tx(
			cx,
			cy + size * 0.04,
			p.harmony.minor ? t( 'Minor' ) : t( 'Major' ),
			style,
			size * 0.026,
			false,
			'middle'
		)
	);
	return doc( width, size + 24, pieces );
}

async function renderHarmony( ctx ) {
	const { params: p, width, style, t, api } = ctx;
	const h = p.harmony;
	ctx.title = t( 'Harmony Atlas' );
	if ( h.topic === 'circle' ) {
		ctx.title = t( 'Circle of fifths' );
		return [ circleOfFifths( ctx ) ];
	}
	if ( h.topic === 'intervals' ) {
		const notes = intervalNotes( p.root, h.interval );
		ctx.title = `${ p.root } · ${ t(
			INTERVAL_NAMES[ h.interval ] || 'Unison'
		) }`;
		return [
			await notation(
				noteChordAbc( notes, false ),
				ctx,
				width,
				p.layout.scale * 1.25
			),
			keyboard( notes, width, style ),
			doc( width, 70, [
				tx(
					width / 2,
					38,
					notes.map( ( n ) => n.name ).join( '  →  ' ) +
						'   ·   ' +
						h.interval +
						' ' +
						t( 'Half steps' ),
					style,
					28,
					true,
					'middle',
					700
				),
			] ),
		];
	}
	if ( h.topic === 'progression' ) {
		ctx.title = t( 'Chord progression' );
		const chords = diatonicChords( p.root, h.minor, h.sevenths );
		const indices = String( h.progression )
			.split( /[\s,;]+/ )
			.map( Number )
			.filter( ( n ) => Number.isInteger( n ) && n >= 1 && n <= 7 )
			.slice( 0, 16 );
		if ( ! indices.length ) {
			ctx.warnings.push( t( 'Enter scale degrees from 1 to 7.' ) );
			return [];
		}
		return [
			await chordGallery(
				indices.map( ( i ) => chords[ i - 1 ] ),
				ctx
			),
		];
	}
	const notes = chordNotes( p.root, h.quality );
	ctx.title =
		p.root +
		h.quality +
		' · ' +
		( h.topic === 'inversions'
			? t( 'Chord inversions' )
			: t( 'Chord anatomy' ) );
	const blocks = [];
	const n = h.topic === 'inversions' ? notes.length : 1;
	for ( let i = 0; i < n; i++ ) {
		const chord = chordNotes( p.root, h.quality, i );
		const label =
			i === 0 ? t( 'Root position' ) : t( 'Inversion' ) + ' ' + i;
		const score = await notation(
			noteChordAbc( chord ),
			ctx,
			width * 0.32,
			p.layout.scale * 1.4
		);
		const keys = keyboard( chord, width * 0.6, style );
		const left = inset( score, api, 0, 45, width * 0.33, 300 );
		const right = inset( keys, api, width * 0.38, 45, width * 0.6, 300 );
		const height = Math.max( left.height, right.height ) + 100;
		blocks.push(
			doc( width, height, [
				tx( 0, 28, label, style, 24, true, 'start', 700 ),
				left.svg,
				right.svg,
				tx(
					width * 0.38,
					height - 12,
					chord.map( ( n ) => n.name ).join( ' · ' ),
					style,
					24
				),
			] )
		);
	}
	return blocks;
}

async function chordGallery( chords, ctx ) {
	const { width, params: p, style, api } = ctx;
	const columns = width < 800 ? 3 : 4;
	const gap = 22,
		tileW = ( width - ( columns - 1 ) * gap ) / columns,
		tileH = tileW * 1.46;
	const parts = [];
	for ( let i = 0; i < chords.length; i++ ) {
		const c = chords[ i ],
			x = ( i % columns ) * ( tileW + gap ),
			y = Math.floor( i / columns ) * ( tileH + gap );
		parts.push(
			rect( x, y, tileW, tileH, style.accent, 0.045, 8 ),
			tx( x + tileW / 2, y + 32, c.roman, style, 24, true, 'middle', 700 )
		);
		let svg;
		if ( p.instrument === 'piano' ) {
			svg = keyboard( c.notes, tileW - 24, style );
			parts.push(
				tx(
					x + tileW / 2,
					y + 68,
					c.name,
					style,
					25,
					false,
					'middle',
					700
				)
			);
		} else {
			const shape = selectedGrip( c.name, p );
			if ( shape )
				svg = svgChordDiagram( shape, {
					name: c.name,
					size: tileW - 24,
					ink: style.ink,
					accent: style.accent,
					font: style.fonts.text,
					leftHanded: p.grip.leftHanded,
				} );
		}
		if ( svg )
			parts.push(
				inset(
					svg,
					api,
					x + 12,
					y + ( p.instrument === 'piano' ? 85 : 46 ),
					tileW - 24,
					tileH - 62
				).svg
			);
		else
			parts.push(
				tx(
					x + tileW / 2,
					y + tileH * 0.5,
					c.name,
					style,
					28,
					false,
					'middle',
					700
				)
			);
	}
	return doc(
		width,
		Math.ceil( chords.length / columns ) * ( tileH + gap ) - gap,
		parts
	);
}

async function renderLesson( ctx ) {
	const { params: p, width, style, t } = ctx;
	const base = scaleNotes( p.root, p.scale );
	const octaves = p.scales.octaves === 2 ? 2 : 1;
	const shift = p.scales.fingering === 'left' ? -24 : 0;
	const notes = Array.from( { length: octaves }, ( _, octave ) =>
		base.map( ( n ) => ( { ...n, midi: n.midi + octave * 12 + shift } ) )
	).flat();
	notes.push( { ...base[ 0 ], midi: base[ 0 ].midi + octaves * 12 + shift } );
	ctx.title = p.root + ' · ' + t( SCALE_LABELS[ p.scale ] || p.scale );
	const options = {
		root: p.root,
		scale: p.scale,
		direction: p.scales.direction,
		octaves: p.scales.octaves,
		fingering: p.scales.fingering === 'tab' ? 'none' : p.scales.fingering,
		clef: p.scales.fingering === 'left' ? 'bass' : 'treble',
		prefer: keyPreference(
			p.root + ( p.scale === 'natural-minor' ? 'm' : '' )
		),
	};
	const generated = scaleAbc( options );
	const abc = typeof generated === 'string' ? generated : generated.abc;
	const tab =
		p.scales.fingering === 'tab'
			? {
					tuning:
						ctx.api.tabTuning( p.instrument, p.tuning ) ||
						ctx.api.tabTuning( 'guitar', 'standard' ),
			  }
			: null;
	const blocks = [
		labeled(
			await notation( abc, ctx, width, p.layout.scale, { tab } ),
			t( 'Notation' ),
			ctx
		),
	];
	if ( p.lesson.keyboard )
		blocks.push(
			labeled( keyboard( notes, width, style ), t( 'Keyboard' ), ctx )
		);
	if ( p.lesson.fretboard ) {
		const inst = INSTRUMENTS[ p.instrument ]?.strings
			? INSTRUMENTS[ p.instrument ]
			: INSTRUMENTS.guitar;
		blocks.push(
			labeled(
				svgFretboard(
					base.map( ( n, i ) => ( {
						pc: n.midi % 12,
						root: i === 0,
						label: p.labels === 'names' ? n.name : undefined,
					} ) ),
					{
						tuning:
							inst.tunings[ p.tuning ] || inst.tunings.standard,
						from: p.fretFrom,
						to: p.fretTo,
						labels: p.labels,
						rootPc: pitchClass( p.root ),
						scaleOrder: base.map( ( n ) => n.midi % 12 ),
						ink: style.ink,
						accent: style.accent,
						font: style.fonts.text,
						width,
						leftHanded: p.grip.leftHanded,
						prefer: keyPreference( p.root ),
					}
				),
				t( 'Fretboard and Keys' ),
				ctx
			)
		);
	}
	if ( p.lesson.chords && [ 'major', 'natural-minor' ].includes( p.scale ) )
		blocks.push(
			labeled(
				await chordGallery(
					diatonicChords(
						p.root,
						p.scale === 'natural-minor',
						p.harmony.sevenths
					),
					ctx
				),
				t( 'Diatonic chords' ),
				ctx
			)
		);
	if ( p.lesson.explanation ) {
		const words = String( p.lesson.explanation )
				.slice( 0, 2000 )
				.split( /\s+/ ),
			lines = [];
		let lineText = '';
		for ( const word of words ) {
			const next = ( lineText ? lineText + ' ' : '' ) + word;
			if (
				lineText &&
				ctx.env.measure( next, 24, style.fonts.text ) > width - 16
			) {
				lines.push( lineText );
				lineText = word;
			} else lineText = next;
		}
		if ( lineText ) lines.push( lineText );
		blocks.push(
			doc(
				width,
				lines.length * 36 + 20,
				lines.map( ( s, i ) => tx( 0, 30 + i * 36, s, style, 24 ) )
			)
		);
	}
	return blocks;
}

export async function renderLearningCards( p, env, api ) {
	const frame = api.frameFor( p, env.docW, env.docH ),
		style = api.styleFor( p, env.kits ),
		t = env.t || ( ( s ) => s );
	const width = frame.width - 2 * p.layout.margin,
		columns = +p.flash.columns === 4 ? 4 : 3,
		gap = 18,
		tileW = ( width - gap * ( columns - 1 ) ) / columns,
		tileH = tileW * 0.8;
	const ctx = { params: p, env, api, frame, style, width, t, warnings: [] };
	const topic = p.flash.topic,
		back = p.flash.side === 'back';
	const entries = [];
	if ( topic === 'intervals' )
		for ( let i = 1; i <= 12; i++ )
			entries.push( {
				abc: noteChordAbc( intervalNotes( p.root, i ), false ),
				answer: t( INTERVAL_NAMES[ i ] ),
			} );
	if ( topic === 'chords' )
		for ( const quality of [
			'',
			'm',
			'dim',
			'aug',
			'sus2',
			'sus4',
			'7',
			'maj7',
			'm7',
			'dim7',
			'm7b5',
			'add9',
		] )
			entries.push( {
				abc: noteChordAbc( chordNotes( p.root, quality ) ),
				answer: p.root + quality,
			} );
	if ( topic === 'signatures' )
		for ( const root of CIRCLE_MAJORS )
			entries.push( {
				abc: `X:1\nM:none\nL:1/1\nK:${ root }\nx |`,
				answer: root + ' ' + t( 'Major' ),
			} );
	if ( topic === 'rhythms' )
		for ( let i = 0; i < 12; i++ )
			entries.push( {
				abc: rhythmAbc(
					{ ...p.rhythm, bars: 1, blanks: false, counts: false },
					i,
					false
				),
				solution: rhythmAbc(
					{ ...p.rhythm, bars: 1, blanks: false },
					i,
					true
				),
				answer: '',
			} );
	const blocks = [];
	for ( let offset = 0; offset < entries.length; offset += columns ) {
		const row = entries.slice( offset, offset + columns ),
			shapes = [];
		for ( let i = 0; i < row.length; i++ ) {
			const entry = row[ i ],
				column = back ? columns - 1 - i : i,
				x = column * ( tileW + gap );
			shapes.push(
				`<rect x="${ r( x ) }" y="0" width="${ r(
					tileW
				) }" height="${ r( tileH ) }" rx="8" fill="none" stroke="${
					style.ink
				}" stroke-opacity=".28"/>`,
				tx(
					x + 18,
					28,
					String( offset + i + 1 ).padStart( 2, '0' ),
					style,
					16,
					true
				)
			);
			if ( back && ! entry.solution ) {
				const size = Math.min(
					32,
					( ( tileW - 36 ) / Math.max( 4, entry.answer.length ) ) *
						1.6
				);
				shapes.push(
					tx(
						x + tileW / 2,
						tileH * 0.56,
						entry.answer,
						style,
						size,
						false,
						'middle',
						700
					)
				);
			} else {
				const svg = await notation(
					back ? entry.solution : entry.abc,
					ctx,
					tileW - 30,
					1.6
				);
				const piece = inset(
					svg,
					api,
					x + 15,
					45,
					tileW - 30,
					tileH - 65
				);
				shapes.push( piece.svg );
			}
		}
		blocks.push( { svg: doc( width, tileH, shapes ), gap } );
	}
	return api.compose( {
		frame,
		style,
		margin: p.layout.margin,
		title: p.text.title,
		blocks,
		warnings: ctx.warnings,
		t,
	} );
}
