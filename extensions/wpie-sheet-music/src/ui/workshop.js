import { ICONS } from './icons.js';
import { buildStudioControls } from './studio.js';
import { transformPhrase, spliceAnnotations } from '../engine/studio.js';
import {
	DURATIONS,
	ROOTS,
	THEMES,
	INTERVAL_NAMES,
	gripChoices,
	gripKey,
	selectedGrip,
	meterTicks,
} from '../engine/workshop.js';
import { INSTRUMENTS } from '../engine/voicings.js';
import { KEY_OPTIONS } from '../engine/notation.js';
import {
	NOTE_NAMES_SHARP,
	NOTE_NAMES_FLAT,
	parseChord,
} from '../engine/chords.js';

export function buildWorkshopControls(
	side,
	{ S, ui, t, bridge, onChange, onRebuild }
) {
	const p = S.params,
		card = S.card;
	const sec = ( title, icon = 'music' ) =>
		ui.section( side, { title: t( title ), icon: ICONS[ icon ] } );
	const select = ( host, label, value, options, set, rebuild = false ) =>
		ui.select( ui.row( host, t( label ) ), {
			value: String( value ),
			options: options.map( ( o ) =>
				typeof o === 'string'
					? { value: o, label: t( o ) }
					: { value: String( o.value ), label: t( o.label ) }
			),
			onChange: ( v ) => {
				set( v );
				onChange();
				if ( rebuild ) onRebuild();
			},
		} );
	const check = ( host, label, value, set, rebuild = false ) =>
		ui.check( host, {
			label: t( label ),
			checked: value,
			onChange: ( v ) => {
				set( v );
				onChange();
				if ( rebuild ) onRebuild();
			},
		} );
	const slider = ( host, label, value, min, max, set ) =>
		ui.slider( host, {
			label: t( label ),
			value,
			min,
			max,
			step: 1,
			onInput: ( v ) => {
				set( v );
				onChange();
			},
		} );
	const text = ( host, label, value, set ) => {
		const input = ui.el(
			'input',
			'dsm-input wpiesm-input',
			ui.row( host, t( label ) )
		);
		input.value = value;
		input.oninput = () => {
			set( input.value );
			onChange();
		};
		return input;
	};
	if ( card === 'melody' )
		buildMelody( sec( 'Melody Builder', 'melody' ), {
			S,
			ui,
			t,
			onChange,
			onRebuild,
			select,
			check,
		} );
	if (
		card === 'harmony' ||
		card === 'lesson' ||
		( card === 'flash' && p.flash.topic !== 'notes' )
	) {
		const host = sec(
			card === 'lesson'
				? 'Lesson Sheet'
				: card === 'harmony'
				? 'Harmony Atlas'
				: 'Study cards',
			card === 'lesson' ? 'lesson' : 'harmony'
		);
		if (
			card !== 'flash' ||
			p.flash.topic === 'chords' ||
			p.flash.topic === 'intervals'
		)
			select(
				host,
				'Root',
				p.root,
				[
					...new Set( [
						...ROOTS,
						'C#',
						'D#',
						'Gb',
						'G#',
						'A#',
						'Cb',
					] ),
				],
				( v ) => ( p.root = v )
			);
		if ( card === 'harmony' ) {
			select(
				host,
				'Topic',
				p.harmony.topic,
				[
					{ value: 'circle', label: 'Circle of fifths' },
					{ value: 'intervals', label: 'Intervals' },
					{ value: 'chord', label: 'Chord anatomy' },
					{ value: 'inversions', label: 'Chord inversions' },
					{ value: 'progression', label: 'Chord progression' },
					{ value: 'voice-leading', label: 'Voice leading' },
					{ value: 'modes', label: 'Mode comparison' },
				],
				( v ) => ( p.harmony.topic = v ),
				true
			);
			if (
				[ 'circle', 'progression', 'voice-leading' ].includes(
					p.harmony.topic
				)
			)
				check(
					host,
					'Minor key',
					p.harmony.minor,
					( v ) => ( p.harmony.minor = v )
				);
			if ( p.harmony.topic === 'intervals' )
				select(
					host,
					'Interval',
					p.harmony.interval,
					INTERVAL_NAMES.map( ( name, i ) => ( {
						value: i,
						label: name,
					} ) ),
					( v ) => ( p.harmony.interval = +v )
				);
			if ( [ 'chord', 'inversions' ].includes( p.harmony.topic ) )
				select(
					host,
					'Chord quality',
					p.harmony.quality,
					[
						{ value: '', label: 'Major' },
						{ value: 'm', label: 'Minor' },
						...[
							'7',
							'maj7',
							'm7',
							'dim',
							'dim7',
							'aug',
							'sus2',
							'sus4',
							'm7b5',
							'add9',
						].map( ( v ) => ( { value: v, label: v } ) ),
					],
					( v ) => ( p.harmony.quality = v )
				);
			if (
				[ 'progression', 'voice-leading' ].includes( p.harmony.topic )
			) {
				text(
					host,
					'Scale degrees',
					p.harmony.progression,
					( v ) => ( p.harmony.progression = v )
				);
				ui.el(
					'p',
					'dsm-note',
					host,
					t( 'Enter scale degrees from 1 to 7.' )
				);
				check(
					host,
					'Seventh chords',
					p.harmony.sevenths,
					( v ) => ( p.harmony.sevenths = v )
				);
			}
		}
		if ( card === 'lesson' ) {
			select(
				host,
				'Scale',
				p.scale,
				[
					{ value: 'major', label: 'Major' },
					{ value: 'natural-minor', label: 'Natural minor' },
				],
				( v ) => ( p.scale = v )
			);
			check(
				host,
				'Keyboard',
				p.lesson.keyboard,
				( v ) => ( p.lesson.keyboard = v )
			);
			check(
				host,
				'Fretboard and Keys',
				p.lesson.fretboard,
				( v ) => ( p.lesson.fretboard = v )
			);
			check(
				host,
				'Diatonic chords',
				p.lesson.chords,
				( v ) => ( p.lesson.chords = v )
			);
			check(
				host,
				'Seventh chords',
				p.harmony.sevenths,
				( v ) => ( p.harmony.sevenths = v )
			);
			ui.el( 'label', 'dsm-note', host, t( 'Lesson notes' ) );
			const note = ui.el(
				'textarea',
				'dsm-input wpiesm-lesson-notes',
				host
			);
			note.value = p.lesson.explanation;
			note.maxLength = 2000;
			note.setAttribute( 'aria-label', t( 'Lesson notes' ) );
			note.oninput = () => {
				p.lesson.explanation = note.value;
				onChange();
			};
		}
	}
	if (
		card === 'rhythm' ||
		( card === 'flash' && p.flash.topic === 'rhythms' )
	) {
		const host = sec( 'Rhythm Workshop', 'rhythm' ),
			o = p.rhythm;
		if ( card === 'rhythm' )
			select(
				host,
				'Pattern type',
				o.kind,
				[
					{ value: 'clap', label: 'Clapping rhythms' },
					{ value: 'strum', label: 'Strumming patterns' },
					{ value: 'picking', label: 'Fingerpicking patterns' },
					{ value: 'drums', label: 'Drum grooves' },
					{ value: 'drum-editor', label: 'Drum Builder' },
					{ value: 'graphics', label: 'Rhythm graphics' },
				],
				( v ) => ( o.kind = v ),
				true
			);
		if (
			card === 'flash' ||
			! [ 'drum-editor', 'graphics' ].includes( o.kind )
		) {
			if ( o.kind !== 'drums' || card === 'flash' ) {
				select(
					host,
					'Meter',
					o.meter,
					[ '4/4', '3/4', '2/4', '6/8', '9/8', '5/4', '7/8' ],
					( v ) => ( o.meter = v )
				);
				select(
					host,
					'Note values',
					o.level,
					[
						{ value: 'quarters', label: 'Quarter notes' },
						{ value: 'eighths', label: 'Eighth notes' },
						{ value: 'sixteenths', label: 'Sixteenth notes' },
						{ value: 'triplets', label: 'Triplets' },
					],
					( v ) => ( o.level = v )
				);
			}
			if ( card === 'rhythm' ) {
				if ( o.kind === 'clap' )
					slider(
						host,
						'Bars per line',
						o.bars,
						1,
						8,
						( v ) => ( o.bars = v )
					);
				slider(
					host,
					'Exercises',
					o.rows,
					1,
					6,
					( v ) => ( o.rows = v )
				);
				check(
					host,
					'Show counting',
					o.counts,
					( v ) => ( o.counts = v )
				);
			}
			if ( o.kind === 'clap' || card === 'flash' ) {
				check(
					host,
					'Include rests',
					o.rests,
					( v ) => ( o.rests = v )
				);
				check(
					host,
					'Accent the first beat',
					o.accents,
					( v ) => ( o.accents = v )
				);
				if ( card === 'rhythm' )
					check(
						host,
						'Leave bars to complete',
						o.blanks,
						( v ) => ( o.blanks = v )
					);
			}
			if ( o.kind !== 'clap' && card === 'rhythm' ) {
				const opts =
					o.kind === 'drums'
						? [
								{ value: 'backbeat', label: 'Backbeat' },
								{
									value: 'half-time',
									label: 'Half-time groove',
								},
								{ value: 'offbeat', label: 'Offbeat groove' },
						  ]
						: o.kind === 'picking'
						? [
								{
									value: 'rolling',
									label: 'Rolling fingerpicking',
								},
								{
									value: 'return',
									label: 'Returning fingerpicking',
								},
						  ]
						: [
								{
									value: 'down-up',
									label: 'Alternating strum',
								},
								{ value: 'down', label: 'Downstroke pulse' },
						  ];
				select(
					host,
					'Pattern',
					opts.some( ( x ) => x.value === o.pattern )
						? o.pattern
						: opts[ 0 ].value,
					opts,
					( v ) => ( o.pattern = v )
				);
			}
			if ( o.kind !== 'drums' || card === 'flash' )
				ui.btn( host, {
					label: t( 'New variation' ),
					onClick: () => {
						o.seed = ( o.seed + 7919 ) >>> 0;
						onChange();
					},
				} );
		}
	}
	if (
		[ 'diagrams', 'fretboard', 'lesson' ].includes( card ) ||
		( card === 'harmony' &&
			! [ 'voice-leading', 'modes' ].includes( p.harmony.topic ) )
	) {
		const host = sec( 'Instrument diagrams', 'diagrams' );
		check(
			host,
			'Left-handed',
			p.grip.leftHanded,
			( v ) => ( p.grip.leftHanded = v ),
			card === 'diagrams'
		);
		if ( card === 'diagrams' && INSTRUMENTS[ p.instrument ]?.strings ) {
			const compare = check(
				host,
				'Compare positions',
				p.grip.compare,
				( v ) => ( p.grip.compare = v )
			);
			check(
				host,
				'Finger numbers',
				p.grip.fingers,
				( v ) => ( p.grip.fingers = v )
			);
			buildGripEditor( host, {
				S,
				ui,
				t,
				onChange,
				onCustom: () => {
					compare.checked = false;
				},
			} );
		}
	}
	if ( card === 'score' ) {
		const host = sec( 'Excerpt and emphasis', 'score' ),
			ex = p.excerpt;
		const number = ( label, value, min, set ) => {
			const input = text( host, label, value, ( v ) =>
				set( Math.max( min, Math.min( 999, parseInt( v, 10 ) || 0 ) ) )
			);
			input.type = 'number';
			input.min = min;
			input.max = 999;
		};
		number( 'First bar', ex.from, 1, ( v ) => ( ex.from = v ) );
		number( 'Last bar (0: all)', ex.to, 0, ( v ) => ( ex.to = v ) );
		number( 'Voice (0: all)', ex.voice, 0, ( v ) => ( ex.voice = v ) );
		number(
			'Highlight from bar',
			ex.highlightFrom,
			0,
			( v ) => ( ex.highlightFrom = v )
		);
		number(
			'Highlight to bar',
			ex.highlightTo,
			0,
			( v ) => ( ex.highlightTo = v )
		);
		number(
			'Highlight voice',
			ex.highlightVoice,
			0,
			( v ) => ( ex.highlightVoice = v )
		);
		ui.el(
			'p',
			'dsm-note',
			host,
			t(
				'Bars are counted from the start, including a pickup. Zero disables emphasis.'
			)
		);
	}
	const mounts = buildStudioControls( side, {
		S,
		ui,
		t,
		bridge,
		onChange,
		onRebuild,
	} );
	const themes = sec( 'Design presets', 'style' );
	const currentTheme = THEMES.find( ( theme ) =>
		[
			'paper',
			'ink',
			'accent',
			'titleFont',
			'textFont',
			'decoration',
		].every( ( key ) => theme[ key ] === p.style[ key ] )
	);
	select(
		themes,
		'Look',
		currentTheme?.id || '',
		[
			{ value: '', label: 'Custom' },
			...THEMES.map( ( s ) => ( { value: s.id, label: s.label } ) ),
		],
		( id ) => {
			const theme = THEMES.find( ( s ) => s.id === id );
			if ( theme ) {
				const style = { ...theme };
				delete style.id;
				delete style.label;
				p.style = { ...p.style, ...style, chordColor: style.accent };
			}
		},
		true
	);
	select(
		themes,
		'Decoration',
		p.style.decoration,
		[
			{ value: 'none', label: 'None' },
			{ value: 'rule', label: 'Title rule' },
			{ value: 'band', label: 'Accent band' },
			{ value: 'frame', label: 'Fine border' },
		],
		( v ) => ( p.style.decoration = v )
	);
	check(
		themes,
		'Fit content to page',
		p.layout.fit !== false,
		( v ) => ( p.layout.fit = v )
	);
	return mounts;
}

function buildMelody( host, { S, ui, t, onChange, onRebuild, select, check } ) {
	const m = S.params.melody;
	select(
		host,
		'Meter',
		m.meter,
		[ '4/4', '3/4', '2/4', '6/8', '5/4', '7/8' ],
		( v ) => ( m.meter = v )
	);
	select( host, 'Key', m.key, KEY_OPTIONS, ( v ) => ( m.key = v ) );
	select(
		host,
		'Clef',
		m.clef,
		[
			{ value: 'treble', label: 'Treble clef' },
			{ value: 'bass', label: 'Bass clef' },
			{ value: 'alto', label: 'Alto clef' },
		],
		( v ) => ( m.clef = v )
	);
	select(
		host,
		'Pickup beats',
		m.pickup,
		[ 0, 1, 2, 3 ].map( ( v ) => ( { value: v, label: String( v ) } ) ),
		( v ) => ( m.pickup = +v )
	);
	const state = S.melodyState?.params === S.params ? S.melodyState : {};
	let selected = state.selected ?? -1,
		anchor = state.anchor ?? -1,
		duration = state.duration || 12,
		octave = state.octave || 4,
		flats = state.flats || false;
	let accidental = state.accidental || 'key';
	select(
		host,
		'Staff accidentals',
		accidental,
		[
			{ value: 'key', label: 'Follow key signature' },
			{ value: 'natural', label: 'Natural' },
			{ value: 'sharp', label: 'Sharp' },
			{ value: 'flat', label: 'Flat' },
		],
		( v ) => ( accidental = v )
	);
	const durationSel = select(
		host,
		'Note value',
		duration,
		DURATIONS,
		( v ) => {
			duration = +v;
			if ( selected >= 0 ) {
				m.notes[ selected ].ticks = duration;
				changed();
			}
		}
	);
	select(
		host,
		'Octave',
		octave,
		[ 2, 3, 4, 5, 6 ].map( ( v ) => ( { value: v, label: String( v ) } ) ),
		( v ) => {
			octave = +v;
			drawKeys();
		}
	);
	check( host, 'Flat note names', flats, ( v ) => {
		flats = v;
		drawKeys();
	} );
	const keys = ui.el( 'div', 'wpiesm-keyboard', host );
	const tools = ui.el( 'div', 'wpiesm-note-tools', host );
	const append = ui.btn( tools, {
		label: t( 'Append' ),
		onClick: () => {
			selected = anchor = -1;
			drawEvents();
		},
	} );
	ui.btn( tools, { label: t( 'Rest' ), onClick: () => write( null ) } );
	const remove = ui.btn( tools, {
		label: t( 'Delete note' ),
		onClick: () => {
			if ( selected >= 0 ) {
				const [ from, to ] = selection();
				S.params.analysis.items = spliceAnnotations(
					S.params.analysis.items,
					from,
					to - from + 1,
					0
				);
				m.notes.splice( from, to - from + 1 );
				selected = anchor = -1;
				changed( true );
			}
		},
	} );
	const moves = ui.el( 'div', 'wpiesm-note-tools', host );
	const prev = ui.btn( moves, { label: '←', onClick: () => move( -1 ) } );
	prev.title = t( 'Move earlier' );
	prev.setAttribute( 'aria-label', t( 'Move earlier' ) );
	const next = ui.btn( moves, { label: '→', onClick: () => move( 1 ) } );
	next.title = t( 'Move later' );
	next.setAttribute( 'aria-label', t( 'Move later' ) );
	const tie = ui.btn( moves, {
		label: t( 'Tie' ),
		onClick: () => toggle( 'tie' ),
	} );
	const start = ui.btn( moves, {
		label: t( 'Start slur' ),
		onClick: () => toggle( 'slurStart' ),
	} );
	const end = ui.btn( moves, {
		label: t( 'End slur' ),
		onClick: () => toggle( 'slurEnd' ),
	} );
	const events = ui.el( 'div', 'wpiesm-note-sequence', host );
	const status = ui.el( 'div', 'dsm-note', host );
	const phraseTools = ui.el( 'div', 'wpiesm-note-tools', host );
	const transformButtons = [];
	for ( const [ label, action, amount ] of [
		[ 'Repeat phrase', 'repeat', 1 ],
		[ 'Reverse phrase', 'reverse', 1 ],
		[ 'Pitch up', 'transpose', 1 ],
		[ 'Pitch down', 'transpose', -1 ],
		[ 'Double duration', 'duration', 2 ],
		[ 'Halve duration', 'duration', 0.5 ],
	] ) {
		transformButtons.push(
			ui.btn( phraseTools, {
				label: t( label ),
				onClick: () => {
					const [ from, to ] = selection();
					const result = transformPhrase(
						m.notes,
						from,
						to,
						action,
						amount,
						flats
					);
					if ( result.error ) {
						status.textContent = t( result.error );
						return;
					}
					if ( action === 'repeat' )
						S.params.analysis.items = spliceAnnotations(
							S.params.analysis.items,
							to + 1,
							0,
							to - from + 1
						);
					m.notes = result.notes;
					anchor = result.from;
					selected = result.to;
					changed( action === 'repeat' );
				},
			} )
		);
	}
	ui.el(
		'p',
		'dsm-note',
		host,
		t(
			'Shift-click to select a phrase. Edit notes directly in the preview.'
		)
	);
	ui.el(
		'p',
		'dsm-note',
		host,
		t(
			'Click a note to replace it. Append adds a new note. Ties connect equal pitches.'
		)
	);
	function changed( structure = false ) {
		drawEvents();
		S.starter = null;
		onChange();
		if ( structure ) onRebuild();
	}
	function selection() {
		return selected < 0
			? [ -1, -1 ]
			: [
					Math.min( anchor < 0 ? selected : anchor, selected ),
					Math.max( anchor, selected ),
			  ];
	}
	function selectNote( index, extend = false ) {
		if ( ! extend || anchor < 0 ) anchor = index;
		selected = index;
		if ( m.notes[ index ] ) {
			duration = m.notes[ index ].ticks;
			durationSel.value = String( duration );
		}
		drawEvents();
	}
	function write( pitch ) {
		if ( selected >= 0 )
			m.notes[ selected ] = {
				...m.notes[ selected ],
				pitch,
				ticks: duration,
			};
		else if ( m.notes.length < 256 )
			m.notes.push( { pitch, ticks: duration } );
		changed();
	}
	function move( d ) {
		const to = selected + d;
		if ( selected >= 0 && to >= 0 && to < m.notes.length ) {
			[ m.notes[ selected ], m.notes[ to ] ] = [
				m.notes[ to ],
				m.notes[ selected ],
			];
			selected = to;
			anchor = to;
			changed();
		}
	}
	function toggle( key ) {
		if ( selected >= 0 ) {
			m.notes[ selected ][ key ] = ! m.notes[ selected ][ key ];
			changed();
		}
	}
	function drawKeys() {
		keys.replaceChildren();
		const names = flats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
		let white = 0;
		for ( let pc = 0; pc < 12; pc++ ) {
			const black = [ 1, 3, 6, 8, 10 ].includes( pc ),
				key = ui.el(
					'button',
					black ? 'wpiesm-key is-black' : 'wpiesm-key',
					keys,
					names[ pc ]
				);
			key.type = 'button';
			key.setAttribute( 'aria-label', names[ pc ] + octave );
			key.title = names[ pc ] + octave;
			if ( black )
				key.style.left = `${ ( ( white - 0.33 ) * 100 ) / 7 }%`;
			else {
				key.style.left = `${ ( white * 100 ) / 7 }%`;
				white++;
			}
			key.onclick = () => write( names[ pc ] + octave );
		}
	}
	function drawEvents() {
		S.melodyState = {
			params: S.params,
			selected,
			anchor,
			duration,
			octave,
			flats,
			accidental,
		};
		events.replaceChildren();
		m.notes.forEach( ( n, i ) => {
			const d = DURATIONS.find( ( v ) => v.value === n.ticks );
			const b = ui.el(
				'button',
				'dsm-btn wpiesm-note-chip',
				events,
				( n.pitch || t( 'Rest' ) ) +
					' ' +
					( d?.symbol || '♩' ) +
					( n.tie ? ' ⌒' : '' )
			);
			b.type = 'button';
			const [ from, to ] = selection();
			b.setAttribute( 'aria-pressed', String( i >= from && i <= to ) );
			b.onclick = ( event ) => selectNote( i, event.shiftKey );
		} );
		append.setAttribute( 'aria-pressed', String( selected < 0 ) );
		remove.disabled = selected < 0;
		for ( const b of transformButtons ) b.disabled = selected < 0;
		S.updateSelection?.( ...selection() );
		prev.disabled = selected <= 0;
		next.disabled = selected < 0 || selected >= m.notes.length - 1;
		for ( const [ b, key ] of [
			[ tie, 'tie' ],
			[ start, 'slurStart' ],
			[ end, 'slurEnd' ],
		] ) {
			b.disabled = selected < 0 || ! m.notes[ selected ]?.pitch;
			b.setAttribute(
				'aria-pressed',
				String( !! m.notes[ selected ]?.[ key ] )
			);
		}
		const sum = m.notes.reduce( ( s, n ) => s + n.ticks, 0 ),
			bar = meterTicks( m.meter );
		status.textContent =
			t( 'Length' ) +
			': ' +
			Math.round( ( sum / 12 ) * 100 ) / 100 +
			' ' +
			t( 'Quarter beats' ) +
			' · ' +
			Math.ceil( sum / bar ) +
			' ' +
			t( 'Bars' );
	}
	S.selectMelodyNote = selectNote;
	S.melodyEditor = {
		get selection() {
			return selection();
		},
		get accidental() {
			return accidental;
		},
		get key() {
			return m.key;
		},
		select: selectNote,
		setPitch: ( index, pitch ) => {
			if ( m.notes[ index ] ) {
				m.notes[ index ].pitch = pitch;
				changed();
			}
		},
		insert: ( index, pitch ) => {
			if ( m.notes.length >= 256 ) {
				status.textContent = t(
					'The melody can contain up to 256 notes.'
				);
				return;
			}
			S.params.analysis.items = spliceAnnotations(
				S.params.analysis.items,
				index,
				0,
				1
			);
			m.notes.splice( index, 0, { pitch, ticks: duration } );
			selectNote( index );
			changed( true );
		},
	};
	drawKeys();
	drawEvents();
}

function buildGripEditor( host, { S, ui, t, onChange, onCustom } ) {
	const p = S.params,
		names = [
			...new Set(
				String( p.chords )
					.split( /[\s,;]+/ )
					.filter( ( n ) => parseChord( n ) )
			),
		];
	if ( ! names.length ) return;
	let name = names[ 0 ],
		base = 1,
		finger = 1;
	const content = ui.el( 'div', 'wpiesm-grip-editor', host );
	ui.select( ui.row( content, t( 'Edit chord' ) ), {
		value: name,
		options: names,
		onChange: ( v ) => {
			name = v;
			draw();
		},
	} );
	const editor = ui.el( 'div', 'wpiesm-grip-content', content );
	function draw() {
		editor.replaceChildren();
		const choices = gripChoices( name, p.instrument, p.tuning ),
			key = gripKey( name, p ),
			shape = selectedGrip( name, p ),
			inst = INSTRUMENTS[ p.instrument ];
		if ( ! shape ) return;
		ui.select( ui.row( editor, t( 'Finger numbers' ) ), {
			value: String( finger ),
			options: [
				{ value: '0', label: t( 'None' ) },
				...[ 1, 2, 3, 4 ].map( ( v ) => ( {
					value: String( v ),
					label: String( v ),
				} ) ),
			],
			onChange: ( v ) => {
				finger = +v;
			},
		} );
		ui.select( ui.row( editor, t( 'Position' ) ), {
			value: String( p.grip.variants[ key ] || 0 ),
			options: choices.map( ( s, i ) => ( {
				value: String( i ),
				label: s.frets
					.map( ( f ) => ( f < 0 ? '×' : f ) )
					.join( ' · ' ),
			} ) ),
			onChange: ( v ) => {
				p.grip.variants[ key ] = +v;
				delete p.grip.custom[ key ];
				draw();
				onChange();
			},
		} );
		base = Math.max(
			1,
			Math.min( ...shape.frets.filter( ( f ) => f > 0 ) ) || 1
		);
		if ( ! Number.isFinite( base ) ) base = 1;
		const nav = ui.el( 'div', 'wpiesm-note-tools', editor );
		const label = ui.el( 'span', 'dsm-note', nav );
		ui.btn( nav, {
			label: '−',
			onClick: () => {
				base = Math.max( 1, base - 1 );
				grid();
			},
		} ).setAttribute( 'aria-label', t( 'Lower frets' ) );
		ui.btn( nav, {
			label: '+',
			onClick: () => {
				base = Math.min( inst.frets - 4, base + 1 );
				grid();
			},
		} ).setAttribute( 'aria-label', t( 'Higher frets' ) );
		const board = ui.el( 'div', 'wpiesm-grip-grid', editor );
		function grid() {
			label.textContent = t( 'Frets' ) + ' ' + base + '–' + ( base + 4 );
			board.replaceChildren();
			board.style.gridTemplateColumns = `repeat(${ inst.strings },1fr)`;
			const current = selectedGrip( name, p );
			for ( let row = 0; row < 6; row++ )
				for ( let column = 0; column < inst.strings; column++ ) {
					const string = p.grip.leftHanded
							? inst.strings - 1 - column
							: column,
						fret = row === 0 ? 0 : base + row - 1,
						actual = current.frets[ string ];
					const b = ui.el(
						'button',
						'wpiesm-fret',
						board,
						row === 0
							? actual === -1
								? '×'
								: '○'
							: actual === fret
							? '●'
							: '·'
					);
					b.type = 'button';
					b.setAttribute( 'aria-pressed', String( actual === fret ) );
					b.setAttribute(
						'aria-label',
						t( 'String' ) +
							' ' +
							( string + 1 ) +
							', ' +
							t( 'Fret' ) +
							' ' +
							fret
					);
					b.onclick = () => {
						const copy = {
							frets: [ ...current.frets ],
							fingers: [
								...( current.fingers ||
									current.frets.map( () => 0 ) ),
							],
							barre: null,
						};
						copy.frets[ string ] =
							row === 0
								? actual === 0
									? -1
									: 0
								: actual === fret
								? 0
								: fret;
						copy.fingers[ string ] =
							copy.frets[ string ] > 0 ? finger : 0;
						p.grip.custom[ key ] = copy;
						p.grip.compare = false;
						onCustom();
						grid();
						onChange();
					};
				}
		}
		grid();
		ui.el(
			'p',
			'dsm-note',
			editor,
			t(
				'Click a fret to place a finger. The top row switches open and muted strings.'
			)
		);
		ui.btn( editor, {
			label: t( 'Reset fingering' ),
			onClick: () => {
				delete p.grip.custom[ key ];
				draw();
				onChange();
			},
		} );
	}
	draw();
}
