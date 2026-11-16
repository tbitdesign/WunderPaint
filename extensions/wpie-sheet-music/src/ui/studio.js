import { ICONS } from './icons.js';
import { ROOTS } from '../engine/workshop.js';
import { SCALE_LABELS } from '../engine/scales.js';
import { parseChord } from '../engine/chords.js';
import {
	MODE_IDS,
	SECTION_TYPES,
	EXERCISE_TYPES,
	DRUM_LANES,
	DRUM_PATTERNS,
	drumPattern,
	resizeDrums,
	editLyrics,
	songLineChords,
	moveItem,
	clampInt,
} from '../engine/studio.js';

export function buildStudioControls(
	side,
	{ S, ui, t, bridge, onChange, onRebuild }
) {
	const p = S.params,
		mounts = [];
	const sec = ( label, icon ) =>
		ui.section( side, {
			title: t( label ),
			icon: ICONS[ icon ] || ICONS.lesson,
		} );
	const changed = ( rebuild = false ) => {
		S.starter = null;
		onChange();
		if ( rebuild ) onRebuild();
	};
	const select = ( host, label, value, opts, set, rebuild = false ) =>
		ui.select( ui.row( host, t( label ) ), {
			value: String( value ),
			options: opts.map( ( o ) =>
				typeof o === 'string'
					? { value: o, label: t( o ) }
					: { value: String( o.value ), label: t( o.label ) }
			),
			onChange: ( v ) => {
				set( v );
				changed( rebuild );
			},
		} );
	const check = ( host, label, value, set ) =>
		ui.check( host, {
			label: t( label ),
			checked: value,
			onChange: ( v ) => {
				set( v );
				changed();
			},
		} );
	const input = ( host, label, value, set ) => {
		const el = ui.el(
			'input',
			'dsm-input wpiesm-input',
			ui.row( host, t( label ) )
		);
		el.value = value;
		el.setAttribute( 'aria-label', t( label ) );
		el.oninput = () => {
			set( el.value );
			changed();
		};
		return el;
	};
	const number = ( host, label, value, min, max, set ) => {
		const el = input( host, label, value, ( v ) =>
			set( clampInt( v, min, max ) )
		);
		el.type = 'number';
		el.min = min;
		el.max = max;
		return el;
	};
	const button = ( host, label, action ) =>
		ui.btn( host, { label: t( label ), onClick: action } );
	const iconButton = ( host, icon, label, action ) => {
		const b = button( host, '', action );
		b.innerHTML = ICONS[ icon ];
		b.title = t( label );
		b.setAttribute( 'aria-label', t( label ) );
		return b;
	};
	const root = ( host ) =>
		select( host, 'Root', p.root, ROOTS, ( v ) => ( p.root = v ) );
	const tools = {
		S,
		ui,
		t,
		p,
		changed,
		select,
		check,
		input,
		number,
		button,
		iconButton,
	};

	if ( S.card === 'harmony' && p.harmony.topic === 'voice-leading' ) {
		const host = sec( 'Voice leading', 'harmony' );
		check(
			host,
			'Choose smooth inversions',
			p.connections.smooth,
			( v ) => ( p.connections.smooth = v )
		);
		check(
			host,
			'Show notation',
			p.connections.notation,
			( v ) => ( p.connections.notation = v )
		);
	}
	if ( S.card === 'harmony' && p.harmony.topic === 'modes' ) {
		const host = sec( 'Mode comparison', 'scales' ),
			c = p.comparison;
		select(
			host,
			'Reference scale',
			c.baseline,
			MODE_IDS.map( ( value ) => ( {
				value,
				label: SCALE_LABELS[ value ],
			} ) ),
			( v ) => ( c.baseline = v )
		);
		select(
			host,
			'Diagram',
			c.diagram,
			[
				{ value: 'keyboard', label: 'Keyboard' },
				{ value: 'fretboard', label: 'Guitar Maps' },
				{ value: 'none', label: 'Notation only' },
			],
			( v ) => ( c.diagram = v )
		);
		for ( const id of MODE_IDS ) {
			const el = check(
				host,
				SCALE_LABELS[ id ],
				c.modes.includes( id ),
				( v ) => {
					if ( ! v && c.modes.length === 1 ) {
						el.checked = true;
						return;
					}
					c.modes = v
						? MODE_IDS.filter(
								( m ) => m === id || c.modes.includes( m )
						  )
						: c.modes.filter( ( m ) => m !== id );
				}
			);
		}
	}
	if ( S.card === 'rhythm' && p.rhythm.kind === 'graphics' ) {
		const host = sec( 'Rhythm graphics', 'rhythm' ),
			g = p.rhythmGraphic;
		select(
			host,
			'Diagram',
			g.kind,
			[
				{ value: 'tree', label: 'Note-value tree' },
				{ value: 'strips', label: 'Beat strips' },
				{ value: 'poly', label: 'Polyrhythm map' },
			],
			( v ) => ( g.kind = v ),
			true
		);
		if ( g.kind === 'poly' ) {
			number(
				host,
				'Upper rhythm',
				g.upper,
				2,
				9,
				( v ) => ( g.upper = v )
			);
			number(
				host,
				'Lower rhythm',
				g.lower,
				2,
				9,
				( v ) => ( g.lower = v )
			);
		} else {
			if ( g.kind === 'tree' )
				number(
					host,
					'Depth',
					g.levels,
					2,
					5,
					( v ) => ( g.levels = v )
				);
			else
				check(
					host,
					'Dotted rhythms',
					g.dotted,
					( v ) => ( g.dotted = v )
				);
			check( host, 'Rest values', g.rests, ( v ) => ( g.rests = v ) );
		}
	}
	if ( S.card === 'rhythm' && p.rhythm.kind === 'drum-editor' )
		buildDrums( sec( 'Drum Builder', 'rhythm' ), tools );
	if ( S.card === 'worksheet' ) {
		const host = sec( 'Exercise Sheets', 'worksheet' ),
			w = p.worksheet;
		root( host );
		check( host, 'Minor key', w.minor, ( v ) => ( w.minor = v ) );
		select(
			host,
			'Topic',
			w.topic,
			EXERCISE_TYPES,
			( v ) => ( w.topic = v )
		);
		select(
			host,
			'Difficulty',
			w.difficulty,
			[
				{ value: 'beginner', label: 'Foundations' },
				{ value: 'advanced', label: 'Advanced' },
			],
			( v ) => ( w.difficulty = v )
		);
		select(
			host,
			'Clef',
			w.clef,
			[
				{ value: 'treble', label: 'Treble clef' },
				{ value: 'bass', label: 'Bass clef' },
			],
			( v ) => ( w.clef = v )
		);
		number( host, 'Exercises', w.count, 1, 24, ( v ) => ( w.count = v ) );
		number( host, 'Variation', w.seed, 1, 999999, ( v ) => ( w.seed = v ) );
		check( host, 'Show solutions', w.answers, ( v ) => ( w.answers = v ) );
		button( host, 'New variation', () => {
			w.seed = ( w.seed + 7919 ) % 999999 || 1;
			changed( true );
		} );
		ui.el(
			'p',
			'dsm-note',
			host,
			t(
				'Questions and solutions use the same variation. Insert each view separately.'
			)
		);
	}
	if ( S.card === 'roadmap' ) {
		const host = sec( 'Guitar Maps', 'roadmap' ),
			m = p.roadmap;
		root( host );
		select(
			host,
			'Scale',
			p.scale,
			[
				'minor-pentatonic',
				'major-pentatonic',
				'major',
				'natural-minor',
				'dorian',
				'mixolydian',
				'blues',
			].map( ( value ) => ( { value, label: SCALE_LABELS[ value ] } ) ),
			( v ) => ( p.scale = v )
		);
		select(
			host,
			'Tuning',
			p.tuning,
			[
				{ value: 'standard', label: 'Standard' },
				{ value: 'drop-d', label: 'Drop D' },
				{ value: 'dadgad', label: 'DADGAD' },
			],
			( v ) => ( p.tuning = v )
		);
		input( host, 'Highlight chord', m.chord, ( v ) => ( m.chord = v ) );
		number( host, 'First fret', m.start, 0, 17, ( v ) => ( m.start = v ) );
		number( host, 'Position width', m.span, 3, 5, ( v ) => ( m.span = v ) );
		number(
			host,
			'Positions',
			m.positions,
			1,
			5,
			( v ) => ( m.positions = v )
		);
		check( host, 'Practice route', m.route, ( v ) => ( m.route = v ) );
		check( host, 'Finger numbers', m.fingers, ( v ) => ( m.fingers = v ) );
		check(
			host,
			'Left-handed',
			m.leftHanded,
			( v ) => ( m.leftHanded = v )
		);
	}
	if ( S.card === 'song' ) buildSong( sec( 'Song sections', 'song' ), tools );
	if ( [ 'score', 'melody' ].includes( S.card ) ) {
		const host = sec( 'Musical analysis', 'analysis' ),
			items = p.analysis.items;
		ui.el(
			'p',
			'dsm-note',
			host,
			t(
				S.card === 'melody'
					? 'Ranges refer to note numbers, including rests.'
					: 'Ranges refer to the original bar numbers.'
			)
		);
		items.forEach( ( a, i ) => {
			const row = ui.el( 'div', 'wpiesm-edit-block', host ),
				heading = ui.el( 'div', 'wpiesm-block-heading', row );
			ui.el( 'b', '', heading, t( 'Annotation' ) + ' ' + ( i + 1 ) );
			iconButton( heading, 'remove', 'Remove annotation', () => {
				items.splice( i, 1 );
				changed( true );
			} );
			select(
				row,
				'Mark',
				a.kind,
				[
					{ value: 'bracket', label: 'Bracket' },
					{ value: 'phrase', label: 'Phrase arc' },
					{ value: 'callout', label: 'Callout' },
				],
				( v ) => ( a.kind = v )
			);
			input(
				row,
				'Label',
				a.label,
				( v ) => ( a.label = v.slice( 0, 100 ) )
			).maxLength = 100;
			number( row, 'From', a.from, 1, 999, ( v ) => ( a.from = v ) );
			number( row, 'To', a.to, 1, 999, ( v ) => ( a.to = v ) );
			if ( S.card === 'score' )
				number(
					row,
					'Voice (0: all)',
					a.voice || 0,
					0,
					99,
					( v ) => ( a.voice = v )
				);
			if ( bridge.components?.mountColorButton )
				mounts.push(
					bridge.components.mountColorButton(
						ui.el( 'div', '', ui.row( row, t( 'Color' ) ) ),
						{
							color: a.color || p.style.accent,
							title: t( 'Color' ),
							onChange: ( v ) => {
								a.color = v;
								changed();
							},
						}
					)
				);
		} );
		button( host, 'Add annotation', () => {
			if ( items.length >= 24 ) return;
			const selected = S.melodyEditor?.selection || [ 0, 3 ];
			items.push( {
				kind: 'bracket',
				from: Math.max( 1, selected[ 0 ] + 1 ),
				to: Math.max( 1, selected[ 1 ] + 1 ),
				label: '',
				color: p.style.accent,
				voice: 0,
			} );
			changed( true );
		} ).disabled = items.length >= 24;
	}
	return mounts;
}

function buildDrums( host, { S, p, ui, t, select, check, changed, button } ) {
	const d = p.drums;
	const note = ui.el( 'div', 'dsm-note', host );
	const patternSelect = select(
		host,
		'Pattern',
		d.pattern,
		[ { value: '', label: 'Custom' }, ...DRUM_PATTERNS ],
		( v ) => {
			if ( v ) Object.assign( d, drumPattern( v, d.steps, d.bars ) );
			d.pattern = v;
		},
		true
	);
	const resize = ( steps, bars ) => {
		const next = resizeDrums( d, steps, bars );
		if ( next ) {
			Object.assign( d, next );
			changed( true );
		} else
			note.textContent = t(
				'Clear the affected hits before reducing the grid.'
			);
		return !! next;
	};
	const resolution = ui.select( ui.row( host, t( 'Subdivision' ) ), {
		value: String( d.steps ),
		options: [
			{ value: '8', label: t( 'Eighth notes' ) },
			{ value: '16', label: t( 'Sixteenth notes' ) },
		],
		onChange: ( v ) => {
			if ( ! resize( +v, d.bars ) ) resolution.value = String( d.steps );
		},
	} );
	const bars = ui.select( ui.row( host, t( 'Bars' ) ), {
		value: String( d.bars ),
		options: [ 1, 2, 3, 4 ].map( ( n ) => ( {
			value: String( n ),
			label: String( n ),
		} ) ),
		onChange: ( v ) => {
			if ( ! resize( d.steps, +v ) ) bars.value = String( d.bars );
		},
	} );
	let brush = S.drumBrush || 1;
	select(
		host,
		'Hit type',
		brush,
		[
			{ value: 1, label: 'Normal hit' },
			{ value: 2, label: 'Accent' },
			{ value: 3, label: 'Soft hit' },
		],
		( v ) => {
			brush = +v;
			S.drumBrush = brush;
		}
	);
	const scroll = ui.el( 'div', 'wpiesm-grid-scroll', host ),
		grid = ui.el( 'div', 'wpiesm-drum-grid', scroll );
	function draw( focused = '' ) {
		grid.replaceChildren();
		grid.style.gridTemplateColumns = `76px repeat(${ d.steps }, 27px)`;
		for ( let bar = 0; bar < d.bars; bar++ ) {
			ui.el(
				'b',
				'wpiesm-grid-label',
				grid,
				t( 'Bar' ) + ' ' + ( bar + 1 )
			);
			for ( let i = 0; i < d.steps; i++ )
				ui.el(
					'span',
					'wpiesm-grid-count',
					grid,
					i % ( d.steps / 4 ) === 0
						? String( i / ( d.steps / 4 ) + 1 )
						: d.steps === 8
						? '&'
						: [ '', 'e', '&', 'a' ][ i % 4 ]
				);
			DRUM_LANES.forEach( ( lane, l ) => {
				ui.el( 'span', 'wpiesm-grid-label', grid, t( lane.label ) );
				for ( let i = 0; i < d.steps; i++ ) {
					const index = bar * d.steps + i,
						hit = d.hits[ l ][ index ];
					const b = ui.el(
						'button',
						'wpiesm-drum-cell',
						grid,
						[ '·', '●', '>', '○' ][ hit ]
					);
					b.type = 'button';
					b.dataset.cell = l + '-' + index;
					b.setAttribute( 'aria-pressed', String( !! hit ) );
					b.setAttribute(
						'aria-label',
						t( lane.label ) +
							', ' +
							t( 'Bar' ) +
							' ' +
							( bar + 1 ) +
							', ' +
							t( 'Step' ) +
							' ' +
							( i + 1 ) +
							': ' +
							t(
								[ 'Rest', 'Normal hit', 'Accent', 'Soft hit' ][
									hit
								]
							)
					);
					b.onclick = () => {
						d.hits[ l ][ index ] = hit === brush ? 0 : brush;
						d.pattern = '';
						patternSelect.value = '';
						draw( b.dataset.cell );
						changed();
					};
				}
			} );
			ui.el( 'span', 'wpiesm-grid-label', grid, t( 'Sticking' ) );
			for ( let i = 0; i < d.steps; i++ ) {
				const index = bar * d.steps + i,
					b = ui.el(
						'button',
						'wpiesm-drum-cell',
						grid,
						d.sticking[ index ] || '·'
					);
				b.type = 'button';
				b.dataset.cell = 'hand-' + index;
				b.setAttribute(
					'aria-label',
					t( 'Sticking' ) +
						', ' +
						t( 'Step' ) +
						' ' +
						( index + 1 ) +
						': ' +
						( d.sticking[ index ] || t( 'None' ) )
				);
				b.onclick = () => {
					d.sticking[ index ] =
						d.sticking[ index ] === 'R'
							? 'L'
							: d.sticking[ index ] === 'L'
							? ''
							: 'R';
					draw( b.dataset.cell );
					changed();
				};
			}
		}
		if ( focused )
			grid.querySelector( `[data-cell="${ focused }"]` )?.focus( {
				preventScroll: true,
			} );
	}
	draw();
	ui.el(
		'p',
		'dsm-note',
		host,
		t( 'Click to place a hit. Click the same hit again to remove it.' )
	);
	const notationCheck = check( host, 'Show notation', d.notation, ( v ) => {
		d.notation = v;
		if ( ! v ) {
			d.grid = true;
			gridCheck.checked = true;
		}
	} );
	const gridCheck = check( host, 'Show grid', d.grid, ( v ) => {
		d.grid = v;
		if ( ! v ) {
			d.notation = true;
			notationCheck.checked = true;
		}
	} );
	button( host, 'Clear grid', () => {
		d.hits = DRUM_LANES.map( () => Array( d.steps * d.bars ).fill( 0 ) );
		d.sticking.fill( '' );
		d.pattern = '';
		changed( true );
	} );
}

function buildSong( host, tools ) {
	const {
		p,
		ui,
		t,
		changed,
		select,
		check,
		input,
		number,
		button,
		iconButton,
	} = tools;
	check(
		host,
		'Section overview',
		p.song.overview,
		( v ) => ( p.song.overview = v )
	);
	const sections = p.song.sections,
		list = ui.el( 'div', 'wpiesm-block-list', host );
	let selected = 0,
		dragging = null;
	const draw = () => {
		list.replaceChildren();
		sections.forEach( ( section, i ) => {
			const row = ui.el( 'div', 'wpiesm-song-row', list ),
				choose = ui.el(
					'button',
					'dsm-listrow wpiesm-song-select',
					row
				);
			choose.type = 'button';
			choose.draggable = true;
			choose.setAttribute( 'aria-pressed', String( i === selected ) );
			ui.el( 'span', 'wpiesm-drag-handle', choose ).innerHTML =
				ICONS.drag;
			ui.el( 'span', '', choose, section.label || t( section.type ) );
			choose.onclick = () => {
				selected = i;
				draw();
			};
			choose.ondragstart = ( e ) => {
				dragging = i;
				e.dataTransfer.effectAllowed = 'move';
				e.dataTransfer.setData( 'text/plain', String( i ) );
			};
			choose.ondragend = () => {
				dragging = null;
				list.querySelectorAll( '.is-drop' ).forEach( ( el ) =>
					el.classList.remove( 'is-drop' )
				);
			};
			row.ondragover = ( e ) => {
				if ( dragging === null ) return;
				e.preventDefault();
				e.dataTransfer.dropEffect = 'move';
				row.classList.add( 'is-drop' );
			};
			row.ondragleave = () => row.classList.remove( 'is-drop' );
			row.ondrop = ( e ) => {
				e.preventDefault();
				if ( dragging === null ) return;
				moveItem( sections, dragging, i );
				selected = i;
				dragging = null;
				changed();
				draw();
			};
			iconButton( row, 'up', 'Move earlier', () => {
				moveItem( sections, i, i - 1 );
				selected = i - 1;
				changed();
				draw();
			} ).disabled = i === 0;
			iconButton( row, 'down', 'Move later', () => {
				moveItem( sections, i, i + 1 );
				selected = i + 1;
				changed();
				draw();
			} ).disabled = i === sections.length - 1;
		} );
		edit();
	};
	const actions = ui.el( 'div', 'wpiesm-note-tools', host );
	const add = button( actions, 'Add section', () => {
		if ( sections.length >= 24 ) return;
		sections.push( {
			type: 'Verse',
			label: '',
			repeats: 1,
			lines: [ { text: '', chords: [] } ],
		} );
		selected = sections.length - 1;
		changed();
		draw();
	} );
	const copy = iconButton( actions, 'copy', 'Duplicate section', () => {
		if ( ! sections[ selected ] || sections.length >= 24 ) return;
		sections.splice(
			selected + 1,
			0,
			JSON.parse( JSON.stringify( sections[ selected ] ) )
		);
		selected++;
		changed();
		draw();
	} );
	const remove = iconButton( actions, 'remove', 'Remove section', () => {
		sections.splice( selected, 1 );
		selected = Math.max( 0, selected - 1 );
		changed();
		draw();
	} );
	const editor = ui.el( 'div', 'wpiesm-song-editor', host );
	function edit() {
		editor.replaceChildren();
		add.disabled = sections.length >= 24;
		copy.disabled = ! sections.length || sections.length >= 24;
		remove.disabled = ! sections.length;
		const section = sections[ selected ];
		if ( ! section ) return;
		select( editor, 'Section type', section.type, SECTION_TYPES, ( v ) => {
			section.type = v;
			draw();
		} );
		const name = input( editor, 'Label', section.label, ( v ) => {
			section.label = v.slice( 0, 80 );
			const b = list.children[ selected ]?.querySelector(
				'.wpiesm-song-select > span:last-child'
			);
			if ( b ) b.textContent = section.label || t( section.type );
		} );
		name.maxLength = 80;
		number(
			editor,
			'Repeats',
			section.repeats,
			1,
			8,
			( v ) => ( section.repeats = v )
		);
		section.lines.forEach( ( line, lineIndex ) => {
			const block = ui.el( 'div', 'wpiesm-edit-block', editor ),
				title = ui.el( 'div', 'wpiesm-block-heading', block );
			ui.el( 'b', '', title, t( 'Line' ) + ' ' + ( lineIndex + 1 ) );
			iconButton( title, 'up', 'Move earlier', () => {
				moveItem( section.lines, lineIndex, lineIndex - 1 );
				changed();
				edit();
			} ).disabled = lineIndex === 0;
			iconButton( title, 'down', 'Move later', () => {
				moveItem( section.lines, lineIndex, lineIndex + 1 );
				changed();
				edit();
			} ).disabled = lineIndex === section.lines.length - 1;
			iconButton( title, 'remove', 'Remove line', () => {
				section.lines.splice( lineIndex, 1 );
				changed();
				edit();
			} );
			const lyrics = ui.el(
				'textarea',
				'dsm-input wpiesm-lesson-notes',
				block
			);
			lyrics.value = line.text;
			lyrics.maxLength = 400;
			lyrics.setAttribute( 'aria-label', t( 'Lyrics' ) );
			lyrics.placeholder = t( 'Lyrics' );
			let caret = 0;
			const remember = () => {
				caret = lyrics.selectionStart;
			};
			lyrics.onselect = lyrics.onclick = lyrics.onkeyup = remember;
			lyrics.oninput = () => {
				Object.assign( line, editLyrics( line, lyrics.value ) );
				remember();
				drawChords();
				changed();
			};
			const chordRow = ui.el( 'div', 'wpiesm-note-tools', block ),
				chord = ui.el(
					'input',
					'dsm-input wpiesm-chord-input',
					chordRow
				);
			chord.placeholder = 'Cmaj7';
			chord.maxLength = 20;
			chord.setAttribute( 'aria-label', t( 'Chord' ) );
			const message = ui.el( 'div', 'dsm-note', block ),
				chips = ui.el( 'div', 'wpiesm-note-tools', block );
			const addChord = () => {
				const name = chord.value.trim();
				if ( ! parseChord( name ) ) {
					message.textContent = t( 'Unknown chord:' ) + ' ' + name;
					return;
				}
				message.textContent = '';
				if ( line.text && line.autoChords ) {
					line.chords = songLineChords( line ).map(
						( { at, name } ) => ( { at, name } )
					);
					line.autoChords = false;
				}
				const at = line.text
					? caret
					: line.chords.length
					? Math.max( ...line.chords.map( ( c ) => c.at ) ) + 1
					: 0;
				const existing = line.chords.find( ( c ) => c.at === at );
				if ( existing ) existing.name = name;
				else if ( line.chords.length < 32 )
					line.chords.push( { at, name } );
				drawChords();
				changed();
			};
			button( chordRow, 'Place chord', addChord );
			chord.onkeydown = ( e ) => {
				if ( e.key === 'Enter' ) {
					e.preventDefault();
					addChord();
				}
			};
			function drawChords() {
				chips.replaceChildren();
				songLineChords( line ).forEach( ( c ) => {
					const wrap = ui.el( 'span', 'wpiesm-chord-anchor', chips );
					const b = button( wrap, c.name, () => {
						caret = c.at;
						chord.value = c.name;
						lyrics.focus();
						lyrics.setSelectionRange(
							Math.min( caret, lyrics.value.length ),
							Math.min( caret, lyrics.value.length )
						);
					} );
					b.title =
						line.text.slice( c.at, c.at + 24 ) || t( 'Chord' );
					iconButton( wrap, 'remove', 'Remove chord', () => {
						line.chords.splice( c.source, 1 );
						drawChords();
						changed();
					} );
				} );
			}
			drawChords();
		} );
		button( editor, 'Add line', () => {
			if ( section.lines.length >= 24 ) return;
			section.lines.push( { text: '', chords: [] } );
			changed();
			edit();
		} ).disabled = section.lines.length >= 24;
		ui.el(
			'p',
			'dsm-note',
			editor,
			t(
				'Place the cursor in the lyrics, then add a chord. Empty lines collect chords in order.'
			)
		);
	}
	draw();
}
