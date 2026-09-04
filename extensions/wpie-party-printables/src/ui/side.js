/**
 * Right column: Sheet (format, marks, copies, page), Theme (occasion,
 * palette, pattern, motif, fonts), Event (the shared data), Item (size
 * and the item's own options). Rebuilt when the item or occasion changes.
 */
import { ICONS } from './icons.js';
import { ITEMS } from '../items.js';
import { FORMAT_OPTIONS, MARK_OPTIONS } from '../model.js';
import { OCCASIONS, PALETTES } from '../engine/theme.js';
import { PATTERN_IDS } from '../engine/patterns.js';
import { MOTIF_IDS } from '../engine/motifs.js';
import { TAG_SHAPES } from '../items/tags.js';
import { TOPPER_SHAPES } from '../items/toppers.js';
import { STICKER_SHAPES } from '../items/stickers.js';
import { SIGN_DIRECTIONS } from '../items/cards/signpost.js';
import { TICKET_MODES } from '../items/cards/tickets.js';
import { COASTER_SHAPES } from '../items/gifts/coasters.js';
import { JAR_SHAPES } from '../items/gifts/jamlabels.js';
import { GARLAND_SHAPES } from '../items/decor/garland.js';
import { TOPPER_PLAQUES } from '../items/decor/caketopper.js';
import { LANTERN_WINDOWS } from '../items/decor/lantern.js';
import { COUNTDOWN_SHAPES } from '../items/decor/countdown.js';
import { CONFETTI_SHAPES } from '../items/decor/confetti.js';
import { BINGO_MODES } from '../items/games/bingo.js';
import { SIDE_OPTIONS } from '../items/games/memory.js';
import { BOARD_TYPES } from '../items/games/chess.js';
import { SPORTS } from '../items/games/tactics.js';
import { DICE_MODES } from '../items/games/dice.js';
import { BRACKET_SIZES } from '../items/games/bracket.js';
import { MAZE_LEVELS } from '../items/games/maze.js';
import { SUDOKU_SIZES, SUDOKU_LEVELS } from '../items/games/sudoku.js';

/* Which select each item's shape-like option uses. */
const SHAPE_LISTS = {
	tags: [ 'shape', TAG_SHAPES ],
	toppers: [ 'shape', TOPPER_SHAPES ],
	stickers: [ 'shape', STICKER_SHAPES ],
	coasters: [ 'shape', COASTER_SHAPES ],
	jamlabels: [ 'shape', JAR_SHAPES ],
	garland: [ 'shape', GARLAND_SHAPES ],
	caketopper: [ 'shape', TOPPER_PLAQUES ],
	countdown: [ 'shape', COUNTDOWN_SHAPES ],
	confetti: [ 'shape', CONFETTI_SHAPES ],
	lantern: [ 'window', LANTERN_WINDOWS ],
};

export const PENNANT_SHAPES = [
	{ value: 'triangle', label: 'Triangle' },
	{ value: 'swallowtail', label: 'Swallowtail' },
	{ value: 'flag', label: 'Flag' },
	{ value: 'scallop', label: 'Scalloped' },
];
export const PATTERN_LABELS = {
	none: 'No pattern',
	confetti: 'Confetti',
	stripes: 'Stripes',
	dots: 'Dots',
	stars: 'Stars',
	hearts: 'Hearts',
	check: 'Check',
	chevron: 'Chevron',
	leaves: 'Leaves',
	snowflakes: 'Snowflakes',
	pumpkins: 'Pumpkins',
	eggs: 'Eggs',
	rings: 'Rings',
	blooms: 'Blooms',
	waves: 'Waves',
	diamonds: 'Diamonds',
};

export function buildSide( side, { S, ui, bridge, t, onChange, onRebuild } ) {
	const mounts = [];
	let pageRow = null;

	const opts = ( list ) =>
		list.map( ( o ) => ( { value: o.value, label: t( o.label ) } ) );
	const colorFor = ( parent, label, key, get, set ) => {
		const host = ui.row( parent, label );
		const node = ui.el( 'div', 'wpiepp-color', host );
		node.dataset.key = key;
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
	const numberFor = (
		parent,
		label,
		key,
		get,
		set,
		{ min = 1, max = 1000, step = 1 } = {}
	) => {
		const host = ui.row( parent, label );
		const input = ui.el( 'input', 'wpiepp-input', host );
		input.type = 'number';
		input.min = String( min );
		input.max = String( max );
		input.step = String( step );
		input.dataset.key = key;
		input.value = String( get() );
		input.oninput = () => {
			const n = parseFloat( input.value );
			if ( Number.isFinite( n ) ) {
				set( Math.min( max, Math.max( min, n ) ) );
				onChange();
			}
		};
		return input;
	};
	const textFor = ( parent, label, key, get, set ) => {
		const host = ui.row( parent, label );
		const input = ui.el( 'input', 'wpiepp-input', host );
		input.type = 'text';
		input.dataset.key = key;
		input.value = get() || '';
		input.oninput = () => {
			set( input.value );
			onChange();
		};
		return input;
	};
	const selectFor = ( parent, label, key, o ) => {
		const sel = ui.select( ui.row( parent, label ), o );
		sel.dataset.key = key;
		return sel;
	};
	const checkFor = ( parent, key, o ) => {
		const c = ui.check( parent, o );
		c.dataset.key = key;
		return c;
	};
	const sliderFor = ( parent, key, o ) => {
		const s = ui.slider( parent, o );
		if ( s && s.input ) {
			s.input.dataset.key = key;
		}
		return s;
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
		const sheet = p.sheet;
		const theme = p.theme;
		const item = p.item;
		const def = ITEMS[ item.type ] || ITEMS.bunting;

		/* Sheet */
		const sh = ui.section( side, {
			icon: ICONS.sheet,
			title: t( 'Sheet' ),
		} );
		selectFor( sh, t( 'Format' ), 'format', {
			options: opts( FORMAT_OPTIONS ),
			value: sheet.format,
			onChange: ( v ) => {
				sheet.format = v;
				onRebuild();
			},
		} );
		if ( 'custom' === sheet.format ) {
			numberFor(
				sh,
				t( 'Width (mm)' ),
				'sheet-w',
				() => sheet.w,
				( v ) => ( sheet.w = v ),
				{ min: 50, max: 1000 }
			);
			numberFor(
				sh,
				t( 'Height (mm)' ),
				'sheet-h',
				() => sheet.h,
				( v ) => ( sheet.h = v ),
				{ min: 50, max: 1000 }
			);
		}
		checkFor( sh, 'landscape', {
			label: t( 'Landscape' ),
			checked: sheet.landscape,
			onChange: ( v ) => {
				sheet.landscape = v;
				onChange();
			},
		} );
		selectFor( sh, t( 'Marks' ), 'marks', {
			options: opts( MARK_OPTIONS ),
			value: sheet.marks,
			onChange: ( v ) => {
				sheet.marks = v;
				onChange();
			},
		} );
		sliderFor( sh, 'margin', {
			label: t( 'Margin' ),
			min: 0,
			max: 25,
			step: 1,
			value: sheet.margin,
			format: ( v ) => v + ' mm',
			onInput: ( v ) => {
				sheet.margin = v;
				onChange();
			},
		} );
		sliderFor( sh, 'gap', {
			label: t( 'Gap between pieces' ),
			min: 0,
			max: 20,
			step: 1,
			value: sheet.gap,
			format: ( v ) => v + ' mm',
			onInput: ( v ) => {
				sheet.gap = v;
				onChange();
			},
		} );
		if (
			'function' === typeof def.repeat
				? def.repeat( item, p.event )
				: def.repeat
		) {
			const fitHost = ui.row( sh, t( 'Copies per sheet' ) );
			const fitIn = ui.el( 'input', 'wpiepp-input', fitHost );
			fitIn.type = 'text';
			fitIn.dataset.key = 'fit';
			fitIn.placeholder = t( 'as many as fit' );
			fitIn.value = 'auto' === sheet.fit ? '' : String( sheet.fit );
			fitIn.oninput = () => {
				const n = parseInt( fitIn.value, 10 );
				sheet.fit = Number.isFinite( n ) && n > 0 ? n : 'auto';
				onChange();
			};
		}
		pageRow = ui.el( 'div', 'wpiepp-pages', sh );
		pageRow.hidden = true;
		checkFor( sh, 'setdoc', {
			label: t( 'Set the document to the sheet size on insert' ),
			checked: S.setDoc,
			onChange: ( v ) => ( S.setDoc = v ),
		} );

		/* Theme */
		const th = ui.section( side, {
			icon: ICONS.theme,
			title: t( 'Theme' ),
		} );
		selectFor( th, t( 'Occasion' ), 'occasion', {
			options: OCCASIONS.map( ( o ) => ( {
				value: o.id,
				label: t( o.label ),
			} ) ),
			value: theme.occasion,
			onChange: ( v ) => {
				theme.occasion = v;
				theme.palette = '';
				theme.pattern = { id: '', scale: 1, opacity: 0.35 };
				theme.motif = '';
				theme.displayFont = '';
				theme.textFont = '';
				onRebuild();
			},
		} );
		const occ =
			OCCASIONS.find( ( o ) => o.id === theme.occasion ) ||
			OCCASIONS[ 0 ];
		const paletteValue =
			'brand' === theme.palette
				? 'brand'
				: 'object' === typeof theme.palette
				? 'custom'
				: theme.palette || occ.palette;
		selectFor( th, t( 'Palette' ), 'palette', {
			options: [
				...PALETTES.map( ( pl ) => ( {
					value: pl.id,
					label: t( pl.label ),
				} ) ),
				{ value: 'brand', label: t( 'Brand kit' ) },
				{ value: 'custom', label: t( 'Custom colors' ) },
			],
			value: paletteValue,
			onChange: ( v ) => {
				if ( 'custom' === v ) {
					const base =
						PALETTES.find(
							( pl ) => pl.id === ( theme.palette || occ.palette )
						) || PALETTES[ 0 ];
					theme.palette = {
						bg: base.bg,
						primary: base.primary,
						secondary: base.secondary,
						accent: base.accent,
						ink: base.ink,
					};
				} else {
					theme.palette = v;
				}
				onRebuild();
			},
		} );
		if ( 'object' === typeof theme.palette ) {
			for ( const [ key, label ] of [
				[ 'bg', t( 'Paper' ) ],
				[ 'primary', t( 'Primary' ) ],
				[ 'secondary', t( 'Secondary' ) ],
				[ 'accent', t( 'Accent' ) ],
				[ 'ink', t( 'Ink' ) ],
			] ) {
				colorFor(
					th,
					label,
					'color-' + key,
					() => theme.palette[ key ],
					( c ) => ( theme.palette[ key ] = c )
				);
			}
		}
		selectFor( th, t( 'Pattern' ), 'pattern', {
			options: PATTERN_IDS.map( ( id ) => ( {
				value: id,
				label: t( PATTERN_LABELS[ id ] || id ),
			} ) ),
			value: theme.pattern.id || occ.pattern,
			onChange: ( v ) => {
				theme.pattern.id = v;
				onChange();
			},
		} );
		sliderFor( th, 'pattern-scale', {
			label: t( 'Pattern size' ),
			min: 0.4,
			max: 2.5,
			step: 0.05,
			value: theme.pattern.scale || 1,
			format: ( v ) => Math.round( v * 100 ) + '%',
			onInput: ( v ) => {
				theme.pattern.scale = v;
				onChange();
			},
		} );
		sliderFor( th, 'pattern-opacity', {
			label: t( 'Pattern strength' ),
			min: 0.05,
			max: 1,
			step: 0.05,
			value: theme.pattern.opacity,
			format: ( v ) => Math.round( v * 100 ) + '%',
			onInput: ( v ) => {
				theme.pattern.opacity = v;
				onChange();
			},
		} );
		selectFor( th, t( 'Motif' ), 'motif', {
			options: [
				{ value: 'none', label: t( 'No motif' ) },
				...MOTIF_IDS.map( ( id ) => ( {
					value: id,
					label: id.charAt( 0 ).toUpperCase() + id.slice( 1 ),
				} ) ),
			],
			value: theme.motif || occ.motif,
			onChange: ( v ) => {
				theme.motif = v;
				onChange();
			},
		} );
		for ( const [ key, label ] of [
			[ 'displayFont', t( 'Display font' ) ],
			[ 'textFont', t( 'Text font' ) ],
		] ) {
			const host = ui.row( th, label );
			const node = ui.el( 'div', 'wpiepp-font', host );
			node.dataset.key = key;
			if ( bridge.components && bridge.components.mountFontPicker ) {
				mounts.push(
					bridge.components.mountFontPicker( node, {
						value: theme[ key ] || occ[ key ],
						onChange: ( f ) => {
							theme[ key ] = f;
							onChange();
						},
					} )
				);
			}
		}

		/* Event */
		const ev = ui.section( side, {
			icon: ICONS.event,
			title: t( 'Event' ),
		} );
		textFor(
			ev,
			t( 'Title' ),
			'event-title',
			() => p.event.title,
			( v ) => ( p.event.title = v )
		);
		textFor(
			ev,
			t( 'Subtitle' ),
			'event-subtitle',
			() => p.event.subtitle,
			( v ) => ( p.event.subtitle = v )
		);
		textFor(
			ev,
			t( 'Date' ),
			'event-date',
			() => p.event.date,
			( v ) => ( p.event.date = v )
		);
		textFor(
			ev,
			t( 'Time' ),
			'event-time',
			() => p.event.time,
			( v ) => ( p.event.time = v )
		);
		textFor(
			ev,
			t( 'Place' ),
			'event-place',
			() => p.event.place,
			( v ) => ( p.event.place = v )
		);
		textFor(
			ev,
			t( 'Host' ),
			'event-host',
			() => p.event.host,
			( v ) => ( p.event.host = v )
		);

		/* Item */
		const it = ui.section( side, {
			icon: ICONS[ def.id ] || ICONS.item,
			title: t( 'Item' ) + ': ' + t( def.label ),
		} );
		if ( def.sizes && def.sizes.length ) {
			const key = Object.keys( def.sizes[ 0 ] ).filter(
				( k ) => 'label' !== k
			);
			const cur = def.sizes.findIndex( ( s ) =>
				key.every( ( k ) => s[ k ] === item[ k ] )
			);
			selectFor( it, t( 'Size' ), 'size', {
				options: [
					...def.sizes.map( ( s, i ) => ( {
						value: String( i ),
						label: t( s.label ),
					} ) ),
					{ value: 'custom', label: t( 'Custom size' ) },
				],
				value: cur >= 0 ? String( cur ) : 'custom',
				onChange: ( v ) => {
					if ( 'custom' !== v ) {
						Object.assign(
							item,
							Object.fromEntries(
								key.map( ( k ) => [ k, def.sizes[ +v ][ k ] ] )
							)
						);
					} else {
						item[ key[ 0 ] ] = item[ key[ 0 ] ] + 1;
					}
					onRebuild();
				},
			} );
			if ( cur < 0 ) {
				for ( const k of key.filter(
					( kk ) => 'number' === typeof item[ kk ]
				) ) {
					numberFor(
						it,
						k + ' (mm)',
						'item-' + k,
						() => item[ k ],
						( v ) => ( item[ k ] = v ),
						{ min: 1, max: 600 }
					);
				}
			}
		}
		const repeats =
			'function' === typeof def.repeat
				? def.repeat( item, p.event )
				: def.repeat;
		if ( ! repeats && 'count' in item && 'bingo' !== item.type ) {
			numberFor(
				it,
				t( 'Count' ),
				'count',
				() => item.count,
				( v ) => ( item.count = v ),
				{ min: 1, max: 200 }
			);
		}
		if ( 'bunting' === item.type ) {
			selectFor( it, t( 'Pennant' ), 'shape', {
				options: opts( PENNANT_SHAPES ),
				value: item.shape,
				onChange: ( v ) => {
					item.shape = v;
					onChange();
				},
			} );
		}
		if ( SHAPE_LISTS[ item.type ] ) {
			const [ k, list ] = SHAPE_LISTS[ item.type ];
			selectFor( it, t( 'Shape' ), k, {
				options: opts( list ),
				value: item[ k ],
				onChange: ( v ) => {
					item[ k ] = v;
					onChange();
				},
			} );
		}
		if ( 'title' in item ) {
			textFor(
				it,
				t( 'Title' ),
				'item-title',
				() => item.title,
				( v ) => ( item.title = v )
			);
		}
		if ( 'start' in item ) {
			numberFor(
				it,
				t( 'First number' ),
				'start',
				() => item.start,
				( v ) => ( item.start = v ),
				{ min: 0, max: 100000 }
			);
		}
		if ( 'by' in item ) {
			textFor(
				it,
				t( 'Reply by' ),
				'by',
				() => item.by,
				( v ) => ( item.by = v )
			);
		}
		if ( 'caption' in item ) {
			textFor(
				it,
				t( 'Caption' ),
				'caption',
				() => item.caption,
				( v ) => ( item.caption = v )
			);
		}
		if ( 'signpost' === item.type ) {
			selectFor( it, t( 'Direction' ), 'direction', {
				options: opts( SIGN_DIRECTIONS ),
				value: item.direction,
				onChange: ( v ) => {
					item.direction = v;
					onChange();
				},
			} );
		}
		if ( 'tickets' === item.type ) {
			selectFor( it, t( 'Kind' ), 'mode', {
				options: opts( TICKET_MODES ),
				value: item.mode,
				onChange: ( v ) => {
					item.mode = v;
					onChange();
				},
			} );
		}
		if ( 'seating' === item.type ) {
			numberFor(
				it,
				t( 'Columns (0 = automatic)' ),
				'cols',
				() => item.cols || 0,
				( v ) => ( item.cols = v ),
				{ min: 0, max: 4 }
			);
		}
		if ( 'wrapping' === item.type ) {
			checkFor( it, 'dark', {
				label: t( 'Dark paper' ),
				checked: !! item.dark,
				onChange: ( v ) => {
					item.dark = v;
					onChange();
				},
			} );
		}
		if ( 'invitation' === item.type ) {
			checkFor( it, 'frame', {
				label: t( 'Thin frame' ),
				checked: false !== item.frame,
				onChange: ( v ) => {
					item.frame = v;
					onChange();
				},
			} );
		}
		if ( 'countdown' === item.type ) {
			numberFor(
				it,
				t( 'From' ),
				'from',
				() => item.from,
				( v ) => ( item.from = v ),
				{ min: 0, max: 999 }
			);
			numberFor(
				it,
				t( 'To' ),
				'to',
				() => item.to,
				( v ) => ( item.to = v ),
				{ min: 0, max: 999 }
			);
		}
		if ( 'bingo' === item.type ) {
			selectFor( it, t( 'Kind' ), 'mode', {
				options: opts( BINGO_MODES ),
				value: item.mode,
				onChange: ( v ) => {
					item.mode = v;
					onRebuild();
				},
			} );
			if ( 'numbers' !== item.mode ) {
				numberFor(
					it,
					t( 'Grid' ),
					'grid',
					() => item.grid,
					( v ) => ( item.grid = v ),
					{ min: 3, max: 5 }
				);
			}
			numberFor(
				it,
				t( 'Cards' ),
				'count',
				() => item.count,
				( v ) => ( item.count = v ),
				{ min: 1, max: 60 }
			);
			numberFor(
				it,
				t( 'Seed' ),
				'seed',
				() => item.seed,
				( v ) => ( item.seed = v ),
				{ min: 1, max: 99999 }
			);
		}
		if ( 'memory' === item.type || 'deck' === item.type ) {
			selectFor( it, t( 'Side' ), 'side', {
				options: opts( SIDE_OPTIONS ),
				value: item.side,
				onChange: ( v ) => {
					item.side = v;
					S.params.sheet.page = 1;
					onChange();
				},
			} );
		}
		if ( 'memory' === item.type ) {
			numberFor(
				it,
				t( 'Pairs' ),
				'pairs',
				() => item.pairs,
				( v ) => ( item.pairs = v ),
				{ min: 2, max: 40 }
			);
		}
		if ( 'scoreboard' === item.type ) {
			numberFor(
				it,
				t( 'Rounds' ),
				'rounds',
				() => item.rounds,
				( v ) => ( item.rounds = v ),
				{ min: 1, max: 30 }
			);
		}
		if ( 'chess' === item.type ) {
			selectFor( it, t( 'Board' ), 'board', {
				options: opts( BOARD_TYPES ),
				value: item.board,
				onChange: ( v ) => {
					item.board = v;
					onRebuild();
				},
			} );
			if ( 'go' === item.board ) {
				numberFor(
					it,
					t( 'Lines' ),
					'lines',
					() => item.lines,
					( v ) => ( item.lines = v ),
					{ min: 5, max: 19 }
				);
			}
			checkFor( it, 'coords', {
				label: t( 'Coordinates' ),
				checked: false !== item.coords,
				onChange: ( v ) => {
					item.coords = v;
					onChange();
				},
			} );
		}
		if ( 'dice' === item.type ) {
			selectFor( it, t( 'Faces' ), 'mode', {
				options: opts( DICE_MODES ),
				value: item.mode,
				onChange: ( v ) => {
					item.mode = v;
					onChange();
				},
			} );
		}
		if ( 'bracket' === item.type ) {
			selectFor( it, t( 'Players' ), 'slots', {
				options: BRACKET_SIZES.map( ( o ) => ( {
					value: String( o.value ),
					label: t( o.label ),
				} ) ),
				value: String( item.slots ),
				onChange: ( v ) => {
					item.slots = +v;
					onChange();
				},
			} );
		}
		if ( 'maze' === item.type ) {
			selectFor( it, t( 'Level' ), 'level', {
				options: opts( MAZE_LEVELS ),
				value: item.level,
				onChange: ( v ) => {
					item.level = v;
					onChange();
				},
			} );
		}
		if ( 'sudoku' === item.type ) {
			selectFor( it, t( 'Grid' ), 'n', {
				options: SUDOKU_SIZES.map( ( o ) => ( {
					value: String( o.value ),
					label: t( o.label ),
				} ) ),
				value: String( item.n ),
				onChange: ( v ) => {
					item.n = +v;
					onChange();
				},
			} );
			selectFor( it, t( 'Level' ), 'level', {
				options: opts( SUDOKU_LEVELS ),
				value: item.level,
				onChange: ( v ) => {
					item.level = v;
					onChange();
				},
			} );
		}
		if ( 'wordsearch' === item.type ) {
			numberFor(
				it,
				t( 'Grid' ),
				'grid',
				() => item.grid,
				( v ) => ( item.grid = v ),
				{ min: 6, max: 20 }
			);
		}
		if ( 'copies' in item ) {
			numberFor(
				it,
				t( 'Copies of each' ),
				'copies',
				() => item.copies,
				( v ) => ( item.copies = v ),
				{ min: 1, max: 12 }
			);
		}
		if ( 'solution' in item ) {
			checkFor( it, 'solution', {
				label: t( 'Solution sheet' ),
				checked: false !== item.solution,
				onChange: ( v ) => {
					item.solution = v;
					S.params.sheet.page = 1;
					onChange();
				},
			} );
		}
		if ( 'seed' in item && 'bingo' !== item.type ) {
			numberFor(
				it,
				t( 'Seed' ),
				'seed',
				() => item.seed,
				( v ) => ( item.seed = v ),
				{ min: 1, max: 99999 }
			);
		}
		if ( 'tactics' === item.type ) {
			selectFor( it, t( 'Sport' ), 'sport', {
				options: opts( SPORTS ),
				value: item.sport,
				onChange: ( v ) => {
					item.sport = v;
					onChange();
				},
			} );
		}
		if ( 'placecards' === item.type ) {
			checkFor( it, 'tent', {
				label: t( 'Tent fold' ),
				checked: item.tent,
				onChange: ( v ) => {
					item.tent = v;
					onChange();
				},
			} );
		}
		if ( 'cupcakewrap' === item.type ) {
			checkFor( it, 'scallop', {
				label: t( 'Scalloped edge' ),
				checked: item.scallop,
				onChange: ( v ) => {
					item.scallop = v;
					onChange();
				},
			} );
		}
		if ( 'box' === item.type ) {
			checkFor( it, 'ribbon', {
				label: t( 'Ribbon band' ),
				checked: item.ribbon,
				onChange: ( v ) => {
					item.ribbon = v;
					onChange();
				},
			} );
			checkFor( it, 'span', {
				label: t( 'Photo across the whole box' ),
				checked: 'net' === item.span,
				onChange: ( v ) => {
					item.span = v ? 'net' : 'face';
					onChange();
				},
			} );
		}
		if ( 'pattern' in item ) {
			checkFor( it, 'item-pattern', {
				label: t( 'Pattern on the piece' ),
				checked: false !== item.pattern,
				onChange: ( v ) => {
					item.pattern = v;
					onChange();
				},
			} );
		}
		if ( 'motif' in item ) {
			checkFor( it, 'item-motif', {
				label: t( 'Motif on the piece' ),
				checked: false !== item.motif,
				onChange: ( v ) => {
					item.motif = v;
					onChange();
				},
			} );
		}
	}

	function setPages( pages, page ) {
		if ( ! pageRow ) {
			return;
		}
		pageRow.hidden = ! ( pages > 1 );
		if ( pages > 1 ) {
			pageRow.innerHTML = '';
			const prev = ui.btn( pageRow, {
				label: '‹',
				onClick: () => go( -1 ),
			} );
			prev.classList.add( 'wpiepp-page-btn' );
			ui.el(
				'span',
				'wpiepp-page-label',
				pageRow,
				t( 'Sheet' ) + ' ' + page + ' / ' + pages
			);
			const next = ui.btn( pageRow, {
				label: '›',
				onClick: () => go( 1 ),
			} );
			next.classList.add( 'wpiepp-page-btn' );
			prev.disabled = page <= 1;
			next.disabled = page >= pages;
		}
		function go( d ) {
			S.params.sheet.page = Math.max( 1, Math.min( pages, page + d ) );
			onChange();
		}
	}

	return { rebuild, unmountAll, setPages };
}
