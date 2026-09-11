/**
 * Right column: Figure (frame, paper, fonts), Text (title, subtitle,
 * caption, footnote), Typography (one element at a time), Block (the
 * selected block's own settings). Rebuilt whenever the selected block
 * changes, so every control shows the values of what is selected.
 */
import { ICONS } from './icons.js';
import {
	BLOCKS,
	GRID_OPTIONS,
	TICK_OPTIONS,
	FRACTION_MODES,
	CLOCK_NUMBERS,
	STATS_CHARTS,
	ANGLE_UNITS,
	TREE_FORMATS,
	TREE_DIRECTIONS,
} from '../blocks.js';
import {
	FORMATS,
	PAPER_OPTIONS,
	ALIGN_OPTIONS,
	TYPO_ELEMENTS,
	WIDE,
} from '../figure.js';

export function buildSide( side, { S, ui, bridge, t, onChange } ) {
	const mounts = [];
	let typoEl = 'title';

	const selected = () =>
		S.params.blocks.find( ( b ) => b.id === S.blockId ) ||
		S.params.blocks[ 0 ];
	const opts = ( list ) =>
		list.map( ( o ) => ( { value: o.value, label: t( o.label ) } ) );

	const colorFor = ( parent, label, get, set, reset ) => {
		const host = ui.row( parent, label );
		const wrap = ui.el( 'div', 'wpiemf-colorrow', host );
		const node = ui.el( 'div', 'wpiemf-color', wrap );
		let mount = null;
		if ( bridge.components && bridge.components.mountColorButton ) {
			mount = bridge.components.mountColorButton( node, {
				color: get(),
				onChange: ( c ) => {
					set( c );
					onChange();
				},
				title: label,
			} );
			mounts.push( mount );
		}
		if ( reset ) {
			const b = ui.btn( wrap, {
				label: t( 'Ink' ),
				onClick: () => {
					reset();
					if ( mount && mount.set ) {
						mount.set( get() );
					}
					onChange();
				},
			} );
			b.classList.add( 'wpiemf-reset' );
			b.title = t( 'Use the ink color' );
		}
	};
	const numberFor = (
		parent,
		label,
		get,
		set,
		{ allowEmpty = false } = {}
	) => {
		const host = ui.row( parent, label );
		const input = ui.el( 'input', 'dsm-input wpiemf-input', host );
		input.type = 'text';
		input.inputMode = 'decimal';
		const cur = get();
		input.value = null === cur || undefined === cur ? '' : String( cur );
		input.placeholder = allowEmpty ? t( 'auto' ) : '';
		input.oninput = () => {
			const v = input.value.trim().replace( ',', '.' );
			if ( '' === v && allowEmpty ) {
				set( null );
			} else {
				const n = parseFloat( v );
				if ( ! Number.isFinite( n ) ) {
					return;
				}
				set( n );
			}
			onChange();
		};
		return input;
	};
	const textFor = ( parent, label, key, get, set ) => {
		const host = ui.row( parent, label );
		const input = ui.el( 'input', 'dsm-input wpiemf-input', host );
		input.type = 'text';
		input.dataset.key = key;
		input.value = get() || '';
		input.oninput = () => {
			set( input.value );
			onChange();
		};
		return input;
	};
	const sliderFor = ( parent, key, o ) => {
		const s = ui.slider( parent, o );
		s.input.dataset.key = key;
		return s;
	};
	const checkFor = ( parent, key, o ) => {
		const c = ui.check( parent, o );
		c.dataset.key = key;
		return c;
	};
	const selectFor = ( parent, label, key, o ) => {
		const sel = ui.select( ui.row( parent, label ), o );
		sel.dataset.key = key;
		return sel;
	};

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

	function rebuild() {
		unmountAll();
		side.innerHTML = '';
		const p = S.params;
		const fig = p.figure;
		const block = selected();
		const def = BLOCKS[ block.type ];

		/* Figure */
		const figure = ui.section( side, {
			icon: ICONS.figure,
			title: t( 'Figure' ),
		} );
		selectFor( figure, t( 'Format' ), 'format', {
			options: opts( FORMATS ),
			value: fig.format,
			onChange: ( v ) => {
				fig.format = v;
				onChange();
			},
		} );
		sliderFor( figure, 'scale', {
			label: t( 'Size' ),
			min: 0.5,
			max: 2.5,
			step: 0.05,
			value: fig.scale,
			format: ( v ) => Math.round( v * 100 ) + '%',
			onInput: ( v ) => {
				fig.scale = v;
				onChange();
			},
		} );
		sliderFor( figure, 'margin', {
			label: t( 'Margin' ),
			min: 0,
			max: 160,
			step: 4,
			value: fig.margin,
			format: ( v ) => v + ' px',
			onInput: ( v ) => {
				fig.margin = v;
				onChange();
			},
		} );
		selectFor( figure, t( 'Paper' ), 'paper', {
			options: opts( PAPER_OPTIONS ),
			value: fig.paper,
			onChange: ( v ) => {
				fig.paper = v;
				onChange();
			},
		} );
		colorFor(
			figure,
			t( 'Ink' ),
			() => fig.ink,
			( c ) => ( fig.ink = c )
		);
		colorFor(
			figure,
			t( 'Accent' ),
			() => fig.accent,
			( c ) => ( fig.accent = c )
		);
		for ( const [ key, label ] of [
			[ 'titleFont', t( 'Title font' ) ],
			[ 'textFont', t( 'Text font' ) ],
		] ) {
			const host = ui.row( figure, label );
			const node = ui.el( 'div', 'wpiemf-font', host );
			if ( bridge.components && bridge.components.mountFontPicker ) {
				mounts.push(
					bridge.components.mountFontPicker( node, {
						value: fig[ key ],
						onChange: ( f ) => {
							fig[ key ] = f;
							onChange();
						},
					} )
				);
			}
		}
		checkFor( figure, 'numbering', {
			label: t( 'Number the formulas' ),
			checked: p.numbering,
			onChange: ( v ) => {
				p.numbering = v;
				onChange();
			},
		} );

		/* Text */
		const text = ui.section( side, {
			icon: ICONS.text,
			title: t( 'Text' ),
		} );
		textFor(
			text,
			t( 'Title' ),
			'head-title',
			() => p.head.title,
			( v ) => ( p.head.title = v )
		);
		textFor(
			text,
			t( 'Subtitle' ),
			'head-subtitle',
			() => p.head.subtitle,
			( v ) => ( p.head.subtitle = v )
		);
		textFor(
			text,
			t( 'Caption' ),
			'foot-caption',
			() => p.foot.caption,
			( v ) => ( p.foot.caption = v )
		);
		textFor(
			text,
			t( 'Footnote' ),
			'foot-note',
			() => p.foot.note,
			( v ) => ( p.foot.note = v )
		);

		/* Typography */
		const typo = ui.section( side, {
			icon: ICONS.typo,
			title: t( 'Typography' ),
		} );
		selectFor( typo, t( 'Element' ), 'typo-el', {
			options: opts( TYPO_ELEMENTS ),
			value: typoEl,
			onChange: ( v ) => {
				typoEl = v;
				rebuild();
			},
		} );
		const ty = p.typo[ typoEl ];
		sliderFor( typo, 'typo-size', {
			label: t( 'Size' ),
			min: 10,
			max: 120,
			step: 1,
			value: ty.size,
			format: ( v ) => v + ' px',
			onInput: ( v ) => {
				ty.size = v;
				onChange();
			},
		} );
		colorFor(
			typo,
			t( 'Color' ),
			() => ty.color || fig.ink,
			( c ) => ( ty.color = c ),
			() => ( ty.color = '' )
		);
		checkFor( typo, 'typo-bold', {
			label: t( 'Bold' ),
			checked: ty.weight >= 600,
			onChange: ( v ) => {
				ty.weight = v ? 700 : 400;
				onChange();
			},
		} );
		checkFor( typo, 'typo-italic', {
			label: t( 'Italic' ),
			checked: ty.italic,
			onChange: ( v ) => {
				ty.italic = v;
				onChange();
			},
		} );
		selectFor( typo, t( 'Alignment' ), 'typo-align', {
			options: opts( ALIGN_OPTIONS ),
			value: ty.align,
			onChange: ( v ) => {
				ty.align = v;
				onChange();
			},
		} );
		sliderFor( typo, 'typo-gap', {
			label: t( 'Space after' ),
			min: 0,
			max: 120,
			step: 2,
			value: ty.gap,
			format: ( v ) => v + ' px',
			onInput: ( v ) => {
				ty.gap = v;
				onChange();
			},
		} );

		/* Block */
		const bl = ui.section( side, {
			icon: ICONS[ block.type ] || ICONS.formula,
			title: t( 'Block' ) + ': ' + t( def.label ),
		} );
		selectFor( bl, t( 'Alignment' ), 'block-align', {
			options: opts( ALIGN_OPTIONS ),
			value: block.align,
			onChange: ( v ) => {
				block.align = v;
				onChange();
			},
		} );
		sliderFor( bl, 'block-gap', {
			label: t( 'Space after' ),
			min: 0,
			max: 160,
			step: 2,
			value: block.gap,
			format: ( v ) => v + ' px',
			onInput: ( v ) => {
				block.gap = v;
				onChange();
			},
		} );
		if ( WIDE.has( block.type ) ) {
			sliderFor( bl, 'block-width', {
				label: t( 'Width' ),
				min: 30,
				max: 100,
				step: 5,
				value: block.width,
				format: ( v ) => v + '%',
				onInput: ( v ) => {
					block.width = v;
					onChange();
				},
			} );
		}
		if ( 'formula' === block.type || 'steps' === block.type ) {
			sliderFor( bl, 'formulaSize', {
				label: t( 'Formula size' ),
				min: 20,
				max: 160,
				step: 2,
				value: block.formulaSize,
				format: ( v ) => v + ' px',
				onInput: ( v ) => {
					block.formulaSize = v;
					onChange();
				},
			} );
		}
		if ( 'formula' === block.type ) {
			checkFor( bl, 'box', {
				label: t( 'Frame around the formula' ),
				checked: block.box,
				onChange: ( v ) => {
					block.box = v;
					onChange();
				},
			} );
		}
		if ( 'steps' === block.type ) {
			checkFor( bl, 'numbered', {
				label: t( 'Number the steps' ),
				checked: block.numbered,
				onChange: ( v ) => {
					block.numbered = v;
					onChange();
				},
			} );
			checkFor( bl, 'arrows', {
				label: t( 'Arrows between the steps' ),
				checked: block.arrows,
				onChange: ( v ) => {
					block.arrows = v;
					onChange();
				},
			} );
		}
		if ( 'table' === block.type ) {
			checkFor( bl, 'header', {
				label: t( 'Header row' ),
				checked: block.header,
				onChange: ( v ) => {
					block.header = v;
					onChange();
				},
			} );
			checkFor( bl, 'zebra', {
				label: t( 'Zebra rows' ),
				checked: block.zebra,
				onChange: ( v ) => {
					block.zebra = v;
					onChange();
				},
			} );
			checkFor( bl, 'border', {
				label: t( 'Borders' ),
				checked: block.border,
				onChange: ( v ) => {
					block.border = v;
					onChange();
				},
			} );
		}
		if ( 'fractions' === block.type ) {
			selectFor( bl, t( 'Picture' ), 'fractionMode', {
				options: opts( FRACTION_MODES ),
				value: block.fractionMode,
				onChange: ( v ) => {
					block.fractionMode = v;
					onChange();
				},
			} );
		}
		if ( 'clock' === block.type ) {
			selectFor( bl, t( 'Numbers' ), 'numbers', {
				options: opts( CLOCK_NUMBERS ),
				value: block.numbers,
				onChange: ( v ) => {
					block.numbers = v;
					onChange();
				},
			} );
			checkFor( bl, 'hands', {
				label: t( 'Show the hands' ),
				checked: block.hands,
				onChange: ( v ) => {
					block.hands = v;
					onChange();
				},
			} );
			checkFor( bl, 'seconds', {
				label: t( 'Second hand' ),
				checked: block.seconds,
				onChange: ( v ) => {
					block.seconds = v;
					onChange();
				},
			} );
			checkFor( bl, 'digital', {
				label: t( 'Digital readout' ),
				checked: block.digital,
				onChange: ( v ) => {
					block.digital = v;
					onChange();
				},
			} );
		}
		if ( 'hundred' === block.type ) {
			checkFor( bl, 'numbers', {
				label: t( 'Show the numbers' ),
				checked: block.numbers,
				onChange: ( v ) => {
					block.numbers = v;
					onChange();
				},
			} );
		}
		if ( 'placevalue' === block.type ) {
			checkFor( bl, 'blocks', {
				label: t( 'Base-ten blocks' ),
				checked: block.blocks,
				onChange: ( v ) => {
					block.blocks = v;
					onChange();
				},
			} );
		}
		if ( 'stats' === block.type ) {
			selectFor( bl, t( 'Chart' ), 'chart', {
				options: opts( STATS_CHARTS ),
				value: block.chart,
				onChange: ( v ) => {
					block.chart = v;
					onChange();
				},
			} );
			sliderFor( bl, 'bins', {
				label: t( 'Histogram bins (0 = automatic)' ),
				min: 0,
				max: 20,
				step: 1,
				value: block.bins,
				format: ( v ) => String( v ),
				onInput: ( v ) => {
					block.bins = v;
					onChange();
				},
			} );
			checkFor( bl, 'counts', {
				label: t( 'Counts on the bars' ),
				checked: block.counts,
				onChange: ( v ) => {
					block.counts = v;
					onChange();
				},
			} );
			checkFor( bl, 'mean', {
				label: t( 'Mean marker' ),
				checked: block.mean,
				onChange: ( v ) => {
					block.mean = v;
					onChange();
				},
			} );
			checkFor( bl, 'median', {
				label: t( 'Median marker' ),
				checked: block.median,
				onChange: ( v ) => {
					block.median = v;
					onChange();
				},
			} );
		}
		if ( 'unitcircle' === block.type ) {
			selectFor( bl, t( 'Units' ), 'units', {
				options: opts( ANGLE_UNITS ),
				value: block.units,
				onChange: ( v ) => {
					block.units = v;
					onChange();
				},
			} );
			checkFor( bl, 'sincos', {
				label: t( 'Sine and cosine' ),
				checked: block.sincos,
				onChange: ( v ) => {
					block.sincos = v;
					onChange();
				},
			} );
			checkFor( bl, 'tangent', {
				label: t( 'Tangent' ),
				checked: block.tangent,
				onChange: ( v ) => {
					block.tangent = v;
					onChange();
				},
			} );
			checkFor( bl, 'special', {
				label: t( 'Marks at the special angles' ),
				checked: block.special,
				onChange: ( v ) => {
					block.special = v;
					onChange();
				},
			} );
		}
		if ( 'sets' === block.type ) {
			checkFor( bl, 'elements', {
				label: t( 'List the elements' ),
				checked: block.elements,
				onChange: ( v ) => {
					block.elements = v;
					onChange();
				},
			} );
		}
		if ( 'tree' === block.type ) {
			selectFor( bl, t( 'Probabilities' ), 'format', {
				options: opts( TREE_FORMATS ),
				value: block.format,
				onChange: ( v ) => {
					block.format = v;
					onChange();
				},
			} );
			selectFor( bl, t( 'Direction' ), 'direction', {
				options: opts( TREE_DIRECTIONS ),
				value: block.direction,
				onChange: ( v ) => {
					block.direction = v;
					onChange();
				},
			} );
			checkFor( bl, 'paths', {
				label: t( 'Path probabilities' ),
				checked: block.paths,
				onChange: ( v ) => {
					block.paths = v;
					onChange();
				},
			} );
		}
		if ( 'solids' === block.type ) {
			checkFor( bl, 'hidden', {
				label: t( 'Hidden edges dashed' ),
				checked: block.hidden,
				onChange: ( v ) => {
					block.hidden = v;
					onChange();
				},
			} );
			checkFor( bl, 'dims', {
				label: t( 'Dimension labels' ),
				checked: block.dims,
				onChange: ( v ) => {
					block.dims = v;
					onChange();
				},
			} );
			checkFor( bl, 'net', {
				label: t( 'Net beside a cube or cuboid' ),
				checked: block.net,
				onChange: ( v ) => {
					block.net = v;
					onChange();
				},
			} );
		}
		if ( 'graph' === block.type ) {
			numberFor(
				bl,
				t( 'x from' ),
				() => block.xmin,
				( v ) => ( block.xmin = v )
			);
			numberFor(
				bl,
				t( 'x to' ),
				() => block.xmax,
				( v ) => ( block.xmax = v )
			);
			numberFor(
				bl,
				t( 'y from' ),
				() => block.ymin,
				( v ) => ( block.ymin = v ),
				{ allowEmpty: true }
			);
			numberFor(
				bl,
				t( 'y to' ),
				() => block.ymax,
				( v ) => ( block.ymax = v ),
				{ allowEmpty: true }
			);
			checkFor( bl, 'equal', {
				label: t( 'Same scale on both axes' ),
				checked: block.equal,
				onChange: ( v ) => {
					block.equal = v;
					onChange();
				},
			} );
			selectFor( bl, t( 'Grid' ), 'grid', {
				options: opts( GRID_OPTIONS ),
				value: block.grid,
				onChange: ( v ) => {
					block.grid = v;
					onChange();
				},
			} );
			selectFor( bl, t( 'Ticks' ), 'ticks', {
				options: opts( TICK_OPTIONS ),
				value: block.ticks,
				onChange: ( v ) => {
					block.ticks = v;
					onChange();
				},
			} );
			checkFor( bl, 'legend', {
				label: t( 'Legend' ),
				checked: block.legend,
				onChange: ( v ) => {
					block.legend = v;
					onChange();
				},
			} );
			textFor(
				bl,
				t( 'Axis labels' ),
				'axis-labels',
				() => block.xLabel + ' ' + block.yLabel,
				( v ) => {
					const parts = v.trim().split( /\s+/ );
					block.xLabel = parts[ 0 ] || 'x';
					block.yLabel = parts[ 1 ] || 'y';
				}
			);
		}
	}

	rebuild();
	return { rebuild, unmountAll };
}
