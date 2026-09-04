/** Right column: Layout, Style, Music, Text. Rows carry data-cards and hide per card. */
import { ICONS } from './icons.js';
import { FORMATS, PAPER_OPTIONS, LABEL_OPTIONS } from '../cards.js';
import { INSTRUMENTS, TUNING_LABELS } from '../engine/voicings.js';
import {
	CLEF_OPTIONS,
	KEY_OPTIONS,
	METER_OPTIONS,
	SIDE_OPTIONS,
	SCALE_MODES,
	DIRECTIONS,
	FINGERING_OPTIONS,
} from '../engine/notation.js';

export function buildSide( side, { S, ui, bridge, t, onChange } ) {
	const mounts = [];
	const rows = [];
	const sections = [];
	const p = () => S.params;

	const sec = ( icon, title ) => {
		const card = ui.section( side, { icon, title } );
		sections.push( card.parentNode );
		return card;
	};
	/** A row wrapper tagged with the cards it belongs to. */
	const rowFor = ( parent, cards, label ) => {
		const wrap = ui.el( 'div', 'wpiesm-row', parent );
		wrap.dataset.cards = cards;
		rows.push( wrap );
		return label ? ui.row( wrap, label ) : wrap;
	};
	const sliderFor = ( parent, cards, o ) => {
		const wrap = rowFor( parent, cards, null );
		return ui.slider( wrap, o );
	};
	const checkFor = ( parent, cards, o ) => {
		const wrap = rowFor( parent, cards, null );
		return ui.check( wrap, o );
	};
	const colorFor = ( parent, cards, label, get, set ) => {
		const host = rowFor( parent, cards, label );
		const node = ui.el( 'div', 'wpiesm-color', host );
		if ( bridge.components && bridge.components.mountColorButton ) {
			mounts.push(
				bridge.components.mountColorButton( node, {
					color: get(),
					onChange: ( c ) => {
						set( c );
						onChange();
					},
					title: label,
				} )
			);
		}
	};
	const fontFor = ( parent, cards, label, get, set ) => {
		const host = rowFor( parent, cards, label );
		const node = ui.el( 'div', 'wpiesm-font', host );
		if ( bridge.components && bridge.components.mountFontPicker ) {
			mounts.push(
				bridge.components.mountFontPicker( node, {
					value: get(),
					onChange: ( f ) => {
						set( f );
						onChange();
					},
				} )
			);
		}
	};
	const textFor = ( parent, cards, label, get, set ) => {
		const host = rowFor( parent, cards, label );
		const input = ui.el( 'input', 'wpiesm-input', host );
		input.type = 'text';
		input.value = get() || '';
		input.oninput = () => {
			set( input.value );
			onChange();
		};
		return input;
	};

	/* Layout */
	const layout = sec( ICONS.layout, t( 'Layout' ) );
	ui.select(
		rowFor(
			layout,
			'score leadsheet diagrams fretboard paper flash scales',
			t( 'Format' )
		),
		{
			options: FORMATS.map( ( f ) => ( {
				value: f.value,
				label: t( f.label ),
			} ) ),
			value: p().layout.format,
			onChange: ( v ) => {
				p().layout.format = v;
				onChange();
			},
		}
	);
	sliderFor(
		layout,
		'score leadsheet diagrams fretboard paper flash scales',
		{
			label: t( 'Size' ),
			min: 0.5,
			max: 2,
			step: 0.05,
			value: p().layout.scale,
			format: ( v ) => Math.round( v * 100 ) + '%',
			onInput: ( v ) => {
				p().layout.scale = v;
				onChange();
			},
		}
	);
	sliderFor(
		layout,
		'score leadsheet diagrams fretboard paper flash scales',
		{
			label: t( 'Margin' ),
			min: 0,
			max: 160,
			step: 4,
			value: p().layout.margin,
			format: ( v ) => v + ' px',
			onInput: ( v ) => {
				p().layout.margin = v;
				onChange();
			},
		}
	);
	ui.select( rowFor( layout, 'leadsheet', t( 'Columns' ) ), {
		options: [
			{ value: '1', label: t( 'One column' ) },
			{ value: '2', label: t( 'Two columns' ) },
		],
		value: String( p().layout.columns ),
		onChange: ( v ) => {
			p().layout.columns = parseInt( v, 10 );
			onChange();
		},
	} );
	sliderFor( layout, 'paper', {
		label: t( 'Staves' ),
		min: 1,
		max: 20,
		step: 1,
		value: p().paper.staves,
		onInput: ( v ) => {
			p().paper.staves = v;
			onChange();
		},
	} );
	sliderFor( layout, 'paper', {
		label: t( 'Bars per line' ),
		min: 0,
		max: 8,
		step: 1,
		value: p().paper.bars,
		format: ( v ) => ( v ? String( v ) : t( 'none' ) ),
		onInput: ( v ) => {
			p().paper.bars = v;
			onChange();
		},
	} );
	sliderFor( layout, 'paper', {
		label: t( 'Staff spacing' ),
		min: 50,
		max: 180,
		step: 5,
		value: p().paper.sep,
		onInput: ( v ) => {
			p().paper.sep = v;
			onChange();
		},
	} );
	sliderFor( layout, 'paper', {
		label: t( 'Chord grids' ),
		min: 0,
		max: 12,
		step: 1,
		value: p().paper.grids,
		onInput: ( v ) => {
			p().paper.grids = v;
			onChange();
		},
	} );
	ui.select( rowFor( layout, 'flash', t( 'Cards per row' ) ), {
		options: [
			{ value: '3', label: '3' },
			{ value: '4', label: '4' },
		],
		value: String( p().flash.columns ),
		onChange: ( v ) => {
			p().flash.columns = parseInt( v, 10 );
			onChange();
		},
	} );
	ui.select( rowFor( layout, 'flash', t( 'Side' ) ), {
		options: SIDE_OPTIONS.map( ( o ) => ( {
			value: o.value,
			label: t( o.label ),
		} ) ),
		value: p().flash.side,
		onChange: ( v ) => {
			p().flash.side = v;
			onChange();
		},
	} );
	ui.select( rowFor( layout, 'scales', t( 'Sheet' ) ), {
		options: SCALE_MODES.map( ( o ) => ( {
			value: o.value,
			label: t( o.label ),
		} ) ),
		value: p().scales.mode,
		onChange: ( v ) => {
			p().scales.mode = v;
			onChange();
		},
	} );
	ui.select( rowFor( layout, 'scales', t( 'Direction' ) ), {
		options: DIRECTIONS.map( ( o ) => ( {
			value: o.value,
			label: t( o.label ),
		} ) ),
		value: p().scales.direction,
		onChange: ( v ) => {
			p().scales.direction = v;
			onChange();
		},
	} );
	sliderFor( layout, 'scales', {
		label: t( 'Octaves' ),
		min: 1,
		max: 2,
		step: 1,
		value: p().scales.octaves,
		onInput: ( v ) => {
			p().scales.octaves = v;
			onChange();
		},
	} );
	const fromS = sliderFor( layout, 'fretboard', {
		label: t( 'Frets from' ),
		min: 0,
		max: 20,
		step: 1,
		value: p().fretFrom,
		onInput: ( v ) => {
			p().fretFrom = v;
			if ( p().fretTo < v + 3 ) {
				p().fretTo = v + 3;
				toS.set( p().fretTo );
			}
			onChange();
		},
	} );
	const toS = sliderFor( layout, 'fretboard', {
		label: t( 'Frets to' ),
		min: 3,
		max: 24,
		step: 1,
		value: p().fretTo,
		onInput: ( v ) => {
			p().fretTo = v;
			if ( p().fretFrom > v - 3 ) {
				p().fretFrom = Math.max( 0, v - 3 );
				fromS.set( p().fretFrom );
			}
			onChange();
		},
	} );
	sliderFor( layout, 'fretboard', {
		label: t( 'Octaves' ),
		min: 1,
		max: 4,
		step: 1,
		value: p().octaves,
		onInput: ( v ) => {
			p().octaves = v;
			onChange();
		},
	} );

	/* Style */
	const style = sec( ICONS.style, t( 'Style' ) );
	ui.select(
		rowFor(
			style,
			'score leadsheet diagrams fretboard paper flash scales',
			t( 'Paper' )
		),
		{
			options: PAPER_OPTIONS.map( ( o ) => ( {
				value: o.value,
				label: t( o.label ),
			} ) ),
			value: p().style.paper,
			onChange: ( v ) => {
				p().style.paper = v;
				onChange();
			},
		}
	);
	colorFor(
		style,
		'score leadsheet diagrams fretboard paper flash scales',
		t( 'Ink' ),
		() => p().style.ink,
		( c ) => ( p().style.ink = c )
	);
	colorFor(
		style,
		'diagrams fretboard flash',
		t( 'Accent' ),
		() => p().style.accent,
		( c ) => ( p().style.accent = c )
	);
	colorFor(
		style,
		'score leadsheet',
		t( 'Chord color' ),
		() => p().style.chordColor,
		( c ) => ( p().style.chordColor = c )
	);
	fontFor(
		style,
		'score leadsheet diagrams fretboard paper flash scales',
		t( 'Title font' ),
		() => p().style.titleFont,
		( f ) => ( p().style.titleFont = f )
	);
	fontFor(
		style,
		'score leadsheet diagrams fretboard paper flash scales',
		t( 'Text font' ),
		() => p().style.textFont,
		( f ) => ( p().style.textFont = f )
	);

	/* Music */
	const music = sec( ICONS.music, t( 'Music' ) );
	const instSel = ui.select(
		rowFor(
			music,
			'score leadsheet diagrams fretboard paper scales',
			t( 'Instrument' )
		),
		{
			options: Object.keys( INSTRUMENTS ).map( ( id ) => ( {
				value: id,
				label: t( INSTRUMENTS[ id ].label ),
			} ) ),
			value: p().instrument,
			onChange: ( v ) => {
				p().instrument = v;
				p().tuning = 'standard';
				fillTunings();
				onChange();
			},
		}
	);
	const tuningRow = rowFor(
		music,
		'score leadsheet diagrams fretboard paper scales',
		t( 'Tuning' )
	);
	const tuningSel = ui.select( tuningRow, {
		options: [],
		value: p().tuning,
		onChange: ( v ) => {
			p().tuning = v;
			onChange();
		},
	} );
	function fillTunings() {
		const inst = INSTRUMENTS[ p().instrument ];
		const ids = inst ? Object.keys( inst.tunings ) : [];
		tuningSel.innerHTML = '';
		for ( const id of ids ) {
			const o = document.createElement( 'option' );
			o.value = id;
			o.textContent = t( TUNING_LABELS[ id ] || id );
			tuningSel.appendChild( o );
		}
		tuningSel.value = ids.includes( p().tuning )
			? p().tuning
			: ids[ 0 ] || '';
		tuningRow.parentNode.dataset.hide = ids.length > 1 ? '' : '1';
	}
	fillTunings();
	sliderFor( music, 'score leadsheet', {
		label: t( 'Transpose' ),
		min: -12,
		max: 12,
		step: 1,
		value: p().transpose,
		format: ( v ) => ( v > 0 ? '+' + v : String( v ) ),
		onInput: ( v ) => {
			p().transpose = v;
			onChange();
		},
	} );
	sliderFor( music, 'score leadsheet', {
		label: t( 'Capo' ),
		min: 0,
		max: 7,
		step: 1,
		value: p().capo,
		onInput: ( v ) => {
			p().capo = v;
			onChange();
		},
	} );
	ui.select( rowFor( music, 'paper', t( 'Clef' ) ), {
		options: CLEF_OPTIONS.map( ( o ) => ( {
			value: o.value,
			label: t( o.label ),
		} ) ),
		value: p().paper.clef,
		onChange: ( v ) => {
			p().paper.clef = v;
			onChange();
		},
	} );
	ui.select( rowFor( music, 'paper', t( 'Key' ) ), {
		options: KEY_OPTIONS.map( ( o ) => ( {
			value: o.value,
			label: o.label,
		} ) ),
		value: p().paper.key,
		onChange: ( v ) => {
			p().paper.key = v;
			onChange();
		},
	} );
	ui.select( rowFor( music, 'paper', t( 'Meter' ) ), {
		options: METER_OPTIONS.map( ( o ) => ( {
			value: o.value,
			label: 'none' === o.value ? t( o.label ) : o.label,
		} ) ),
		value: p().paper.meter,
		onChange: ( v ) => {
			p().paper.meter = v;
			onChange();
		},
	} );
	checkFor( music, 'paper', {
		label: t( 'TAB staff under each staff' ),
		checked: p().paper.tab,
		onChange: ( v ) => {
			p().paper.tab = v;
			onChange();
		},
	} );
	ui.select( rowFor( music, 'scales', t( 'Fingering' ) ), {
		options: FINGERING_OPTIONS.map( ( o ) => ( {
			value: o.value,
			label: t( o.label ),
		} ) ),
		value: p().scales.fingering,
		onChange: ( v ) => {
			p().scales.fingering = v;
			onChange();
		},
	} );
	checkFor( music, 'score', {
		label: t( 'Tablature under the staff' ),
		checked: p().tab,
		onChange: ( v ) => {
			p().tab = v;
			onChange();
		},
	} );
	checkFor( music, 'leadsheet', {
		label: t( 'Chord diagrams row' ),
		checked: p().diagramRow,
		onChange: ( v ) => {
			p().diagramRow = v;
			onChange();
		},
	} );
	ui.select( rowFor( music, 'fretboard', t( 'Labels' ) ), {
		options: LABEL_OPTIONS.map( ( o ) => ( {
			value: o.value,
			label: t( o.label ),
		} ) ),
		value: p().labels,
		onChange: ( v ) => {
			p().labels = v;
			onChange();
		},
	} );

	/* Text */
	const text = sec( ICONS.text, t( 'Text' ) );
	textFor(
		text,
		'score leadsheet diagrams fretboard paper flash scales',
		t( 'Title' ),
		() => p().text.title,
		( v ) => ( p().text.title = v )
	);
	textFor(
		text,
		'score leadsheet diagrams',
		t( 'Subtitle' ),
		() => p().text.subtitle,
		( v ) => ( p().text.subtitle = v )
	);
	textFor(
		text,
		'score leadsheet',
		t( 'Composer or artist' ),
		() => p().text.composer,
		( v ) => ( p().text.composer = v )
	);

	/** Show only the rows of the active card; a section with nothing left hides too. */
	function applyVisibility() {
		for ( const r of rows ) {
			r.hidden =
				! r.dataset.cards.split( ' ' ).includes( S.card ) ||
				'1' === r.dataset.hide;
		}
		for ( const s of sections ) {
			s.hidden = ! [ ...s.querySelectorAll( '.wpiesm-row' ) ].some(
				( r ) => ! r.hidden
			);
		}
	}
	applyVisibility();

	function unmountAll() {
		while ( mounts.length ) {
			const m = mounts.pop();
			try {
				if ( m && m.unmount ) {
					m.unmount();
				}
			} catch ( e ) {
				// nothing to release
			}
		}
	}

	return { applyVisibility, unmountAll, instSel };
}
