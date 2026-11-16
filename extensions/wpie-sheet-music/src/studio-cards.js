import { textEl, r } from './engine/svg.js';
import { SCALE_LABELS, intervalLabel } from './engine/scales.js';
import { svgPiano, svgFretboard } from './engine/fretboard.js';
import { INSTRUMENTS } from './engine/voicings.js';
import {
	parseChord,
	chordPitches,
	pitchClass,
	spell,
	keyPreference,
} from './engine/chords.js';
import { noteToAbc, INTERVAL_NAMES } from './engine/workshop.js';
import { layoutLeadsheet } from './engine/leadsheet.js';
import { transposeSong } from './engine/chordpro.js';
import {
	voiceLeading,
	compareModes,
	DRUM_LANES,
	drumAbc,
	exerciseSet,
	exerciseAbc,
	guitarPositions,
	songModel,
} from './engine/studio.js';

export function isStudioCard( p ) {
	return (
		[ 'song', 'worksheet', 'roadmap' ].includes( p.card ) ||
		( p.card === 'harmony' &&
			[ 'voice-leading', 'modes' ].includes( p.harmony.topic ) ) ||
		( p.card === 'rhythm' &&
			[ 'drum-editor', 'graphics' ].includes( p.rhythm.kind ) )
	);
}
export async function renderStudio( ctx, kit ) {
	const factor =
		Math.max( 0.3, Math.min( 2, ctx.params.layout.scale || 1.5 ) ) / 1.5;
	const inner = {
		...ctx,
		k: kit,
		width: ctx.width / factor,
		params: { ...ctx.params, layout: { ...ctx.params.layout, scale: 1.5 } },
	};
	const card = inner.params.card;
	const render =
		card === 'song'
			? renderSong
			: card === 'worksheet'
			? renderExercises
			: card === 'roadmap'
			? renderRoadmap
			: card === 'harmony'
			? inner.params.harmony.topic === 'modes'
				? renderModes
				: renderConnections
			: inner.params.rhythm.kind === 'drum-editor'
			? renderDrums
			: renderRhythmGraphic;
	const blocks = await render( inner );
	ctx.title = inner.title;
	return blocks.map( ( svg ) => {
		const b = ctx.api.stripSvg( svg );
		return kit.doc( b.w * factor, b.h * factor, [
			`<g transform="scale(${ factor })">${ b.inner }</g>`,
		] );
	} );
}

function words( text, width, style, size, measure ) {
	const result = [];
	let line = '';
	for ( const word of String( text ).split( /\s+/ ) ) {
		const next = line ? line + ' ' + word : word;
		if (
			line &&
			( measure
				? measure( next, size, style.fonts.text )
				: next.length * size * 0.55 ) > width
		) {
			result.push( line );
			line = word;
		} else line = next;
	}
	if ( line ) result.push( line );
	return result;
}
const pitchLabel = ( n ) =>
	n.name + ( Math.floor( ( n.midi - ( n.accidental || 0 ) ) / 12 ) - 1 );
const circle = ( x, y, radius, color, opacity = 1 ) =>
	`<circle cx="${ r( x ) }" cy="${ r( y ) }" r="${ r(
		radius
	) }" fill="${ color }" fill-opacity="${ opacity }"/>`;

async function renderConnections( ctx ) {
	const { params: p, width, style, t, k } = ctx;
	ctx.title = t( 'Voice leading' );
	const progression = voiceLeading( p.root, p.harmony, p.connections.smooth );
	if ( ! progression.length ) {
		ctx.warnings.push( t( 'Enter scale degrees from 1 to 7.' ) );
		return [];
	}
	const blocks = [];
	const columns = width < 900 ? 3 : 4;
	for ( let first = 0; first < progression.length; first += columns - 1 ) {
		const chords = progression.slice( first, first + columns );
		if ( first && chords.length < 2 ) break;
		const all = chords.flatMap( ( c ) => c.notes ),
			min = Math.min( ...all.map( ( n ) => n.midi ) ) - 1,
			max = Math.max( ...all.map( ( n ) => n.midi ) ) + 1;
		const h = Math.max( 280, ( max - min ) * 23 ),
			left = 45,
			step = ( width - 90 ) / Math.max( 1, chords.length - 1 );
		const py = ( midi ) => 82 + ( ( max - midi ) / ( max - min ) ) * h;
		const shapes = [];
		for ( let midi = min; midi <= max; midi++ )
			if ( midi % 12 === 0 )
				shapes.push(
					`<g opacity=".2">${ k.line(
						left,
						py( midi ),
						width - left,
						py( midi ),
						style.ink
					) }</g>`
				);
		chords.forEach( ( chord, i ) => {
			const x = chords.length === 1 ? width / 2 : left + i * step;
			shapes.push(
				k.tx( x, 28, chord.roman, style, 23, true, 'middle', 700 ),
				k.tx( x, 55, chord.name, style, 21, false, 'middle' )
			);
			chord.notes.forEach( ( n, voice ) => {
				const y = py( n.midi ),
					color = voice % 2 ? style.ink : style.accent;
				if ( i ) {
					const previous = chords[ i - 1 ].notes[ voice ],
						same = previous.midi === n.midi;
					shapes.push(
						`<path d="M${ x - step + 9 } ${ py( previous.midi ) }C${
							x - step * 0.55
						} ${ py( previous.midi ) } ${
							x - step * 0.45
						} ${ y } ${
							x - 9
						} ${ y }" fill="none" stroke="${ color }" stroke-opacity="${
							same ? 0.95 : 0.48
						}" stroke-width="${ same ? 4 : 2 }"${
							same ? '' : ' stroke-dasharray="6 4"'
						}/>`
					);
				}
				shapes.push(
					circle( x, y, 6, color ),
					textEl( x, y - 11, pitchLabel( n ), {
						size: 16,
						font: style.fonts.text,
						fill: color,
						anchor: 'middle',
						weight: 700,
					} )
				);
			} );
		} );
		shapes.push(
			k.tx(
				0,
				h + 122,
				t( 'Solid lines: common tones · dashed lines: moving voices' ),
				style,
				Math.min( 18, width / 37 )
			)
		);
		blocks.push( k.doc( width, h + 145, shapes ) );
		if ( p.connections.notation ) {
			const abc =
				'X:1\nM:4/4\nL:1/1\nK:C\n' +
				chords
					.map(
						( c ) =>
							`"${ c.name }"[${ c.notes
								.map( ( n ) => noteToAbc( n ) )
								.join( '' ) }] |`
					)
					.join( ' ' );
			blocks.push( await k.notation( abc, ctx, width, p.layout.scale ) );
		}
	}
	return blocks;
}

async function renderModes( ctx ) {
	const { params: p, width, style, t, k } = ctx;
	ctx.title = p.root + ' · ' + t( 'Mode comparison' );
	const rows = compareModes(
		p.root,
		p.comparison.modes,
		p.comparison.baseline
	);
	const blocks = [
		k.doc( width, 36, [
			k.tx(
				0,
				24,
				t( 'Reference scale' ) +
					': ' +
					t( SCALE_LABELS[ p.comparison.baseline ] ),
				style,
				21
			),
		] ),
	];
	for ( const row of rows ) {
		const abc =
			'X:1\nM:none\nL:1/4\nK:C\n' +
			row.notes.map( ( n ) => noteToAbc( n ) ).join( ' ' ) +
			' |]';
		const score = await k.notation( abc, ctx, width, p.layout.scale, {
			highlightIndices: row.notes
				.map( ( n, i ) => ( n.changed ? i : -1 ) )
				.filter( ( i ) => i >= 0 ),
		} );
		blocks.push( k.labeled( score, t( SCALE_LABELS[ row.id ] ), ctx ) );
		const labels = row.notes.map( ( n, i ) => {
			const x = ( ( i + 0.5 ) * width ) / 7;
			return (
				k.rect(
					( i * width ) / 7 + 3,
					0,
					width / 7 - 6,
					58,
					n.changed ? style.accent : style.ink,
					n.changed ? 0.14 : 0.04,
					5
				) +
				k.tx( x, 24, n.name, style, 20, n.changed, 'middle', 700 ) +
				k.tx(
					x,
					47,
					intervalLabel( n.midi - row.notes[ 0 ].midi ),
					style,
					16,
					n.changed,
					'middle'
				)
			);
		} );
		blocks.push( k.doc( width, 58, labels ) );
		if ( p.comparison.diagram === 'keyboard' ) {
			const min = Math.floor( row.notes[ 0 ].midi / 12 ) * 12,
				max = Math.floor( row.notes.at( -1 ).midi / 12 ) * 12 + 12;
			const keys = Array.from( { length: max - min + 1 }, ( _, i ) => {
				const midi = min + i,
					note = row.notes.find( ( n ) => n.midi === midi ),
					black = [ 1, 3, 6, 8, 10 ].includes( midi % 12 );
				return {
					midi,
					pc: midi % 12,
					black,
					on: !! note,
					color: note
						? note.changed
							? style.accent
							: black
							? '#747e8a'
							: '#d3d9df'
						: undefined,
					label: note?.name || '',
				};
			} );
			blocks.push(
				svgPiano( keys, {
					width: Math.min( width, 850 ),
					font: style.fonts.text,
					ink: style.ink,
					accent: style.accent,
				} )
			);
		} else if ( p.comparison.diagram === 'fretboard' )
			blocks.push(
				svgFretboard(
					row.notes.map( ( n ) => ( {
						pc: ( n.midi + 12 ) % 12,
						root: n.changed,
						label: n.name,
					} ) ),
					{
						width,
						tuning: INSTRUMENTS.guitar.tunings.standard,
						from: 0,
						to: 12,
						ink: style.ink,
						accent: style.accent,
						font: style.fonts.text,
					}
				)
			);
	}
	const legend = words(
		t( 'Accent color marks tones that differ from the reference.' ),
		width,
		style,
		20,
		ctx.env.measure
	);
	blocks.push(
		k.doc(
			width,
			legend.length * 27 + 8,
			legend.map( ( text, i ) => k.tx( 0, 24 + i * 27, text, style, 20 ) )
		)
	);
	return blocks;
}

async function renderRhythmGraphic( ctx ) {
	const { params: p, width, style, t, k, api } = ctx;
	const o = p.rhythmGraphic;
	ctx.title = t(
		o.kind === 'poly'
			? 'Polyrhythm map'
			: o.kind === 'strips'
			? 'Beat strips'
			: 'Note-value tree'
	);
	const shapes = [];
	if ( o.kind === 'poly' ) {
		const a = Math.max( 2, Math.min( 9, +o.upper || 3 ) ),
			b = Math.max( 2, Math.min( 9, +o.lower || 2 ) );
		const left = 55,
			span = width - 110;
		for ( let step = 0; step <= a * b; step++ ) {
			const same = step % a === 0 && step % b === 0;
			if ( step % a === 0 || step % b === 0 )
				shapes.push(
					`<line x1="${
						left + ( span * step ) / ( a * b )
					}" y1="85" x2="${
						left + ( span * step ) / ( a * b )
					}" y2="285" stroke="${
						same ? style.accent : style.ink
					}" stroke-width="${ same ? 3 : 1 }" stroke-opacity="${
						same ? 0.8 : 0.15
					}"/>`
				);
		}
		[ a, b ].forEach( ( count, row ) => {
			const y = 110 + row * 145;
			shapes.push(
				k.tx(
					0,
					y + 7,
					String( count ),
					style,
					26,
					true,
					'start',
					700
				),
				k.line( left, y, width - left, y, style.ink, 2 )
			);
			for ( let i = 0; i < count; i++ ) {
				const x = left + ( span * i ) / count;
				shapes.push(
					circle( x, y, 10, style.accent ),
					k.tx(
						x,
						y + 39,
						String( i + 1 ),
						style,
						20,
						false,
						'middle'
					)
				);
			}
		} );
		shapes.push(
			k.tx(
				width / 2,
				36,
				`${ a } : ${ b }`,
				style,
				34,
				true,
				'middle',
				700
			),
			k.tx(
				width / 2,
				346,
				t( 'Both rows span the same duration.' ),
				style,
				Math.min( 22, width / 23 ),
				false,
				'middle'
			)
		);
		return [ k.doc( width, 375, shapes ) ];
	}
	const rows =
		o.kind === 'tree'
			? [ 48, 24, 12, 6, 3 ]
					.slice( 0, Math.max( 2, Math.min( 5, o.levels ) ) )
					.map( ( n ) => Array( 48 / n ).fill( n ) )
			: [
					[ 12, 12, 12, 12 ],
					Array( 8 ).fill( 6 ),
					...( o.dotted ? [ [ 18, 18, 12 ] ] : [] ),
					Array( 12 ).fill( 4 ),
			  ];
	for ( let row = 0; row < rows.length; row++ ) {
		const values = rows[ row ],
			y = row * 135 + 15,
			left = 100,
			span = width - left - 8;
		const ticks = values[ 0 ];
		const symbol = await k.notation(
			`X:1\nM:none\nL:1/8\nK:C clef=none stafflines=0\n${
				ticks === 4 ? '(3' : ''
			}${ o.rests ? 'z' : 'B' }${
				ticks === 4 ? '' : ticks === 3 ? '/2' : ticks / 6
			}${ ticks === 4 ? 'xx' : '' }`,
			ctx,
			100,
			1.25
		);
		shapes.push( k.inset( symbol, api, 0, y + 18, 80, 55 ).svg );
		let offset = 0;
		values.forEach( ( n, i ) => {
			const x = left + ( offset / 48 ) * span,
				w = ( n / 48 ) * span;
			if ( row && o.kind === 'tree' ) {
				const parent =
					left +
					( ( Math.floor( i / 2 ) + 0.5 ) * span ) /
						( values.length / 2 );
				shapes.push(
					k.line( parent, y - 50, x + w / 2, y, style.accent, 1.5 )
				);
			}
			shapes.push(
				k.rect(
					x + 2,
					y,
					w - 4,
					82,
					style.accent,
					0.08 + row * 0.025,
					4
				),
				k.line( x + 3, y, x + w - 3, y, style.accent, 3 ),
				k.tx(
					x + w / 2,
					y + 40,
					n === 4
						? '⅓'
						: n / 12 === 0.5
						? '½'
						: n / 12 === 0.25
						? '¼'
						: String( n / 12 ),
					style,
					Math.min( 24, w * 0.5 ),
					false,
					'middle',
					700
				)
			);
			offset += n;
		} );
	}
	shapes.push(
		k.tx(
			100,
			rows.length * 135 + 5,
			t( 'Values are measured in quarter-note beats.' ),
			style,
			Math.min( 20, ( width - 110 ) / 29 )
		)
	);
	return [ k.doc( width, rows.length * 135 + 32, shapes ) ];
}

async function renderDrums( ctx ) {
	const { params: p, width, style, t, k } = ctx,
		d = p.drums,
		blocks = [];
	ctx.title = t( 'Drum Builder' );
	for ( let bar = 0; bar < d.bars; bar++ ) {
		if ( d.grid ) {
			const labelWidth = Math.min( 140, width * 0.2 ),
				cell = ( width - labelWidth - 5 ) / d.steps,
				shapes = [];
			shapes.push(
				k.tx(
					0,
					25,
					t( 'Bar' ) + ' ' + ( bar + 1 ),
					style,
					23,
					true,
					'start',
					700
				)
			);
			DRUM_LANES.forEach( ( lane, l ) => {
				const y = 67 + l * 55;
				shapes.push( k.tx( 0, y + 8, t( lane.label ), style, 19 ) );
				for ( let i = 0; i < d.steps; i++ ) {
					const x = labelWidth + ( i + 0.5 ) * cell,
						hit = d.hits[ l ][ bar * d.steps + i ],
						size = Math.min( 11, cell * 0.23 );
					shapes.push(
						k.rect(
							labelWidth + i * cell + 2,
							y - 18,
							cell - 4,
							38,
							style.ink,
							i % ( d.steps / 4 ) === 0 ? 0.1 : 0.035,
							2
						)
					);
					if ( hit ) {
						if ( lane.cross )
							shapes.push(
								`<path d="M${ x - size } ${ y - size }l${
									size * 2
								} ${ size * 2 }m-${ size * 2 } 0l${
									size * 2
								} -${ size * 2 }" stroke="${
									style.accent
								}" stroke-width="2" fill="none"/>`
							);
						else
							shapes.push(
								circle(
									x,
									y,
									size,
									style.accent,
									hit === 3 ? 0.4 : 1
								)
							);
						if ( hit === 2 )
							shapes.push(
								k.tx(
									x,
									y - 19,
									'>',
									style,
									19,
									true,
									'middle'
								)
							);
						if ( hit === 3 )
							shapes.push(
								k.tx(
									x,
									y + 6,
									'( )',
									style,
									size * 2.5,
									false,
									'middle'
								)
							);
					}
				}
			} );
			for ( let i = 0; i < d.steps; i++ ) {
				const x = labelWidth + ( i + 0.5 ) * cell,
					count =
						i % ( d.steps / 4 ) === 0
							? String( i / ( d.steps / 4 ) + 1 )
							: d.steps === 8
							? '&'
							: [ '', 'e', '&', 'a' ][ i % 4 ];
				shapes.push(
					k.tx( x, 298, count, style, 17, false, 'middle' ),
					k.tx(
						x,
						326,
						d.sticking[ bar * d.steps + i ],
						style,
						17,
						true,
						'middle',
						700
					)
				);
			}
			blocks.push( k.doc( width, 342, shapes ) );
		}
		if ( d.notation )
			blocks.push(
				await k.notation(
					drumAbc( d, bar ),
					ctx,
					width,
					p.layout.scale,
					{ ghostNotes: true }
				)
			);
	}
	blocks.push(
		k.doc( width, 50, [
			k.tx(
				0,
				26,
				t( 'R: right hand · L: left hand · ( ): soft hit' ),
				style,
				Math.min( 21, width / 29 )
			),
		] )
	);
	return blocks;
}

async function renderExercises( ctx ) {
	const { params: p, width, style, t, k, env } = ctx,
		o = p.worksheet;
	ctx.title = t( o.answers ? 'Solution sheet' : 'Exercise Sheets' );
	const blocks = [],
		exercises = exerciseSet( o, p.root );
	const scaleName = p.root + ' ' + t( o.minor ? 'Natural minor' : 'Major' );
	blocks.push(
		k.doc( width, 45, [
			k.tx(
				0,
				26,
				scaleName + ' · ' + t( 'Variation' ) + ' ' + o.seed,
				style,
				22,
				true
			),
		] )
	);
	for ( let index = 0; index < exercises.length; index++ ) {
		const e = exercises[ index ];
		const instruction =
			e.type === 'note'
				? t( 'Complete the ascending scale.' )
				: e.type === 'rest'
				? t( 'Fill the gap with one rest.' )
				: e.type === 'interval'
				? t( 'Write the upper note of the interval.' ) +
				  ' ' +
				  t( INTERVAL_NAMES[ e.semitones ] )
				: e.type === 'accidental'
				? t( 'Add the accidentals for this scale.' )
				: t( 'Find and correct the altered note.' );
		const lines = words(
			`${ index + 1 }. ${ instruction }`,
			width - 36,
			style,
			22,
			env.measure
		);
		const score = await k.notation(
			exerciseAbc( e, o.answers ),
			ctx,
			width - 36,
			p.layout.scale
		);
		const scoreSize = ctx.api.stripSvg( score );
		let y = 20 + lines.length * 30;
		const shapes = [
			k.line( 0, 0, width, 0, style.accent, 1.5 ),
			...lines.map( ( line, i ) =>
				k.tx( 12, 34 + i * 30, line, style, 22, true, 'start', 600 )
			),
			`<g transform="translate(18 ${ y })">${ scoreSize.inner }</g>`,
		];
		y += scoreSize.h;
		if ( o.answers ) {
			const answer =
				e.type === 'note' || e.type === 'error'
					? t( 'Note' ) +
					  ' ' +
					  ( e.index + 1 ) +
					  ': ' +
					  pitchLabel( e.answer )
					: e.type === 'interval'
					? pitchLabel( e.notes[ 1 ] )
					: e.type === 'rest'
					? t( 'Rest' ) +
					  ': ' +
					  e.missing / 12 +
					  ' ' +
					  t( 'Quarter beats' )
					: e.notes.map( ( n ) => n.name ).join( ' · ' );
			shapes.push(
				k.tx( 18, y + 25, answer, style, 22, true, 'start', 700 )
			);
			y += 42;
		} else {
			shapes.push(
				k.line( 18, y + 24, width - 18, y + 24, style.ink, 0.7 )
			);
			y += 50;
		}
		blocks.push( k.doc( width, y + 8, shapes ) );
	}
	return blocks;
}

function renderRoadmap( ctx ) {
	const { params: p, width, style, t, k } = ctx,
		o = p.roadmap;
	ctx.title = p.root + ' · ' + t( 'Guitar Maps' );
	const parsed = parseChord( o.chord ),
		chord = parsed ? chordPitches( parsed ) : [];
	if ( ! parsed ) ctx.warnings.push( t( 'Unknown chord:' ) + ' ' + o.chord );
	const positions = guitarPositions( p.root, p.scale, o, p.tuning ),
		blocks = [];
	blocks.push(
		k.doc( width, 40, [
			k.tx(
				0,
				26,
				t( SCALE_LABELS[ p.scale ] ) + ' · ' + o.chord,
				style,
				24,
				true
			),
		] )
	);
	positions.forEach( ( pos, index ) => {
		const left = 55,
			right = width - 24,
			top = 74,
			row = Math.max( 38, Math.min( 62, width / 22 ) ),
			cell = ( right - left ) / ( pos.to - pos.from + 1 );
		const px = ( fret ) =>
			o.leftHanded
				? right - ( fret - pos.from + 0.5 ) * cell
				: left + ( fret - pos.from + 0.5 ) * cell;
		const py = ( string ) => top + ( 5 - string ) * row;
		const shapes = [
			k.tx(
				0,
				26,
				t( 'Position' ) +
					' ' +
					( index + 1 ) +
					' · ' +
					t( 'Frets' ) +
					' ' +
					pos.from +
					'–' +
					pos.to,
				style,
				24,
				true,
				'start',
				700
			),
		];
		for ( let f = pos.from; f <= pos.to; f++ ) {
			shapes.push(
				k.rect(
					px( f ) - cell / 2 + 1,
					top - row / 2,
					cell - 2,
					row * 6,
					style.accent,
					index > 0 && f <= positions[ index - 1 ].to ? 0.1 : 0.025
				),
				k.tx(
					px( f ),
					top + row * 5.9,
					String( f ),
					style,
					19,
					false,
					'middle'
				)
			);
		}
		pos.strings.forEach( ( name, i ) =>
			shapes.push(
				k.line(
					left,
					py( i ),
					right,
					py( i ),
					style.ink,
					i < 3 ? 1.7 : 1
				),
				k.tx( 0, py( i ) + 6, name, style, 17 )
			)
		);
		if ( o.route ) {
			const path = pos.route
				.map(
					( n, i ) =>
						`${ i ? 'L' : 'M' }${ px( n.fret ) } ${ py(
							n.string
						) }`
				)
				.join( ' ' );
			shapes.push(
				`<path d="${ path }" fill="none" stroke="${ style.accent }" stroke-width="2.5" stroke-opacity=".45"/>`
			);
		}
		pos.notes.forEach( ( n ) => {
			const tone = chord.includes( n.pc ),
				x = px( n.fret ),
				y = py( n.string ),
				root = n.pc === pitchClass( p.root );
			shapes.push(
				circle( x, y, row * 0.32, style.bg || '#ffffff' ),
				`<circle cx="${ x }" cy="${ y }" r="${ row * 0.32 }" fill="${
					tone ? style.accent : style.ink
				}" fill-opacity="${ tone ? 0.18 : 0.05 }" stroke="${
					tone ? style.accent : style.ink
				}" stroke-width="${ root ? 3 : 1 }"/>`,
				k.tx(
					x,
					y + 5,
					o.fingers
						? String( n.finger )
						: spell( n.pc, keyPreference( p.root ) ),
					style,
					Math.min( 17, row * 0.29 ),
					tone,
					'middle',
					root ? 700 : 400
				)
			);
		} );
		let h = top + row * 6.35;
		if ( o.route ) {
			const routeText = pos.route
				.map( ( n ) => `${ 6 - n.string }/${ n.fret }` )
				.join( ' → ' );
			const lines = words(
				t( 'Route (string/fret)' ) + ': ' + routeText,
				width,
				style,
				18,
				ctx.env.measure
			);
			for ( const label of lines ) {
				shapes.push( k.tx( 0, h + 24, label, style, 18 ) );
				h += 28;
			}
		}
		blocks.push( k.doc( width, h + 16, shapes ) );
	} );
	const legend = [
		t( 'Accent: chord tones · bold outline: root' ),
		t( 'Shaded frets connect neighboring positions.' ),
	];
	if ( o.fingers )
		legend.push(
			t(
				'Finger numbers are suggested positions; 0 means an open string.'
			)
		);
	const lines = legend.flatMap( ( l ) =>
		words( l, width, style, 20, ctx.env.measure )
	);
	blocks.push(
		k.doc(
			width,
			lines.length * 28 + 10,
			lines.map( ( l, i ) => k.tx( 0, 24 + i * 28, l, style, 20 ) )
		)
	);
	return blocks;
}

function renderSong( ctx ) {
	const { params: p, width, style, t, k, env } = ctx;
	ctx.title = t( 'Song Builder' );
	const song = transposeSong(
		songModel( p.song, p.text, t ),
		( p.transpose || 0 ) - ( p.capo || 0 )
	);
	song.title = '';
	const blocks = [];
	if ( p.song.overview ) {
		const cols = Math.max( 1, Math.floor( width / 220 ) ),
			gap = 16,
			w = ( width - gap * ( cols - 1 ) ) / cols;
		const pieces = p.song.sections.map( ( section, i ) => {
			const x = ( i % cols ) * ( w + gap ),
				y = Math.floor( i / cols ) * 94;
			const label = section.label || t( section.type );
			const lines = words( label, w - 24, style, 21, env.measure );
			return (
				k.rect( x, y, w, 80, style.accent, 0.08, 5 ) +
				k.tx(
					x + 12,
					y + 22,
					String( i + 1 ).padStart( 2, '0' ) +
						( section.repeats > 1 ? ' · ×' + section.repeats : '' ),
					style,
					16,
					true,
					'start',
					700
				) +
				lines
					.slice( 0, 2 )
					.map( ( l, j ) =>
						k.tx( x + 12, y + 48 + j * 23, l, style, 21 )
					)
					.join( '' )
			);
		} );
		blocks.push(
			k.doc(
				width,
				Math.ceil( p.song.sections.length / cols ) * 94,
				pieces
			)
		);
	}
	const s = p.layout.scale;
	const sheet = layoutLeadsheet(
		song,
		{
			width,
			margin: 12,
			columns: p.layout.columns,
			fonts: style.fonts,
			sizes: {
				title: 40 * s,
				subtitle: 21 * s,
				text: 22 * s,
				chord: 20 * s,
				label: 19 * s,
			},
			ink: style.ink,
			chordColor: style.chordColor,
			keyLabel: t( 'Key' ),
			capoLabel: p.capo ? t( 'Capo' ) + ' ' + p.capo : '',
		},
		env.measure
	);
	blocks.push( sheet.svg );
	return blocks;
}
