import { COORDINATE_TYPES } from '../figure.js';
import { geometryTools } from './geometry-tools.js';

export function sourceControl( host, b, { S, ui, t, onChange, refresh } ) {
	if ( ! [ 'graph', 'analysis', 'formula', 'table' ].includes( b.type ) )
		return;
	const options = [ { value: '', label: t( 'Own material' ) } ];
	if ( b.type === 'graph' )
		options.push( { value: '*', label: t( 'All shared functions' ) } );
	for ( const f of S.params.math.definitions )
		options.push( {
			value: f.name,
			label: `${ f.name }(x) = ${ f.expression }`,
		} );
	if ( b.source && ! options.some( ( o ) => o.value === b.source ) )
		options.push( { value: b.source, label: b.source + ' (?)' } );
	const select = ui.select( ui.row( host, t( 'Function source' ) ), {
		options,
		value: b.source,
		onChange: ( v ) => {
			if ( [ 'graph', 'analysis' ].includes( b.type ) ) {
				if ( ! b.source && v ) {
					b.ownMaterial = b.functions;
					b.functions = '';
				} else if ( b.source && ! v ) {
					b.functions = b.ownMaterial || b.functions;
				}
			}
			b.source = v;
			onChange( true );
			refresh();
		},
	} );
	select.dataset.key = 'source';
	if ( b.source && [ 'graph', 'analysis' ].includes( b.type ) )
		ui.el(
			'div',
			'dsm-note',
			host,
			t(
				'The shared definition is linked. The material field adds optional commands.'
			)
		);
}
export function premiumControls( host, { S, ui, t, onChange } ) {
	const p = S.params,
		b = p.blocks.find( ( v ) => v.id === S.blockId ) || p.blocks[ 0 ];
	const row = ( label ) => ui.row( host, label );
	const number = ( key, label, min, max, step = 'any' ) => {
		const input = ui.el( 'input', 'dsm-input', row( label ) );
		input.type = 'number';
		input.step = step;
		input.value = b[ key ];
		input.dataset.key = key;
		if ( min !== undefined ) input.min = min;
		if ( max !== undefined ) input.max = max;
		input.oninput = () => {
			if ( ! Number.isFinite( input.valueAsNumber ) ) return;
			b[ key ] = Math.max(
				min ?? -Infinity,
				Math.min( max ?? Infinity, input.valueAsNumber )
			);
			onChange();
		};
	};
	const check = ( key, label ) => {
		const c = ui.check( host, {
			label,
			checked: b[ key ],
			onChange: ( v ) => {
				b[ key ] = v;
				onChange();
			},
		} );
		c.dataset.key = key;
	};
	if ( b.type === 'geometry' ) {
		geometryTools( host, b, { ui, t, onChange } );
		number( 'snap', t( 'Snap step (0 = free)' ), 0, 10 );
	}
	if ( b.type === 'analysis' ) {
		number( 'from', t( 'Interval from' ) );
		number( 'to', t( 'Interval to' ) );
		number( 'at', t( 'Tangent position' ) );
		const options = [
			{ value: '', label: t( 'Second entered function or zero' ) },
			...p.math.definitions.map( ( f ) => ( {
				value: f.name,
				label: f.name + '(x)',
			} ) ),
		];
		const select = ui.select( row( t( 'Second function' ) ), {
			options,
			value: b.other,
			onChange: ( v ) => {
				b.other = v;
				onChange();
			},
		} );
		select.dataset.key = 'other';
		check( 'roots', t( 'Roots' ) );
		check( 'extrema', t( 'Extrema' ) );
		check( 'intersections', t( 'Intersections' ) );
		check( 'tangent', t( 'Tangent' ) );
		check( 'normal', t( 'Normal' ) );
		check( 'area', t( 'Area between curves' ) );
	}
	if ( b.type === 'table' && b.source ) {
		number( 'tableFrom', t( 'x from' ) );
		number( 'tableTo', t( 'x to' ) );
		number( 'tableStep', t( 'Step' ), 0.000001 );
	}
	if ( [ 'implicit', 'inequality', 'contours' ].includes( b.type ) )
		number( 'resolution', t( 'Curve detail' ), 24, 100, 8 );
	if ( [ 'slopefield', 'vectorfield' ].includes( b.type ) )
		number( 'density', t( 'Field density' ), 7, 27, 2 );
	if ( b.type === 'vectorfield' )
		check( 'normalize', t( 'Equal arrow lengths' ) );
	if ( b.type === 'complex' )
		check( 'measurements', t( 'Modulus and argument' ) );
	if ( b.type === 'contours' ) {
		const input = ui.el(
			'input',
			'dsm-input',
			row( t( 'Contour levels' ) )
		);
		input.value = b.levels;
		input.dataset.key = 'levels';
		input.oninput = () => {
			b.levels = input.value;
			onChange();
		};
	}
	if ( COORDINATE_TYPES.includes( b.type ) && p.figure.sharedAxes )
		ui.el(
			'div',
			'dsm-note',
			host,
			t( 'The figure uses a common coordinate range for all diagrams.' )
		);
}
export function layoutControls( host, p, { ui, t, onChange } ) {
	const f = p.figure;
	const select = ui.select( ui.row( host, t( 'Columns' ) ), {
		options: [ 1, 2, 3 ].map( ( n ) => ( {
			value: String( n ),
			label: String( n ),
		} ) ),
		value: String( f.columns ),
		onChange: ( v ) => {
			f.columns = Number( v );
			onChange();
		},
	} );
	select.dataset.key = 'columns';
	ui.slider( host, {
		label: t( 'Column gap' ),
		min: 0,
		max: 100,
		step: 4,
		value: f.gutter,
		onInput: ( v ) => {
			f.gutter = v;
			onChange();
		},
	} );
	for ( const [ key, label ] of [
		[ 'panels', t( 'Frame each panel' ) ],
		[ 'sharedAxes', t( 'Shared axes' ) ],
	] ) {
		const c = ui.check( host, {
			label,
			checked: f[ key ],
			onChange: ( v ) => {
				f[ key ] = v;
				if ( key === 'sharedAxes' ) ranges.hidden = ! v;
				onChange();
			},
		} );
		c.dataset.key = key;
	}
	const ranges = ui.el( 'div', 'wpiemf-common-range', host );
	ranges.hidden = ! f.sharedAxes;
	for ( const [ key, label ] of [
		[ 'xmin', t( 'Common x from' ) ],
		[ 'xmax', t( 'Common x to' ) ],
		[ 'ymin', t( 'Common y from' ) ],
		[ 'ymax', t( 'Common y to' ) ],
	] ) {
		const input = ui.el( 'input', 'dsm-input', ui.row( ranges, label ) );
		input.type = 'number';
		input.step = 'any';
		input.value = f[ key ];
		input.dataset.key = 'common-' + key;
		input.oninput = () => {
			if ( Number.isFinite( input.valueAsNumber ) ) {
				f[ key ] = input.valueAsNumber;
				onChange();
			}
		};
	}
}
export function sharedControls(
	host,
	{ S, ui, t, onChange, onStructure, colorFor }
) {
	const details = ui.el( 'details', 'dsm-card wpiemf-shared', host );
	ui.el( 'summary', 'dsm-card-head', details, t( 'Shared functions' ) );
	const body = ui.el( 'div', 'dsm-card-body', details ),
		math = S.params.math;
	ui.el(
		'p',
		'dsm-note',
		body,
		t(
			'Define once, link graphs, formulas and tables. Use [[f]] or [[f(2)]] in text and captions.'
		)
	);
	for ( const [ i, f ] of math.definitions.entries() ) {
		const item = ui.el( 'div', 'wpiemf-definition', body );
		for ( const [ key, label ] of [
			[ 'name', t( 'Name' ) ],
			[ 'expression', t( 'Expression' ) ],
		] ) {
			const input = ui.el( 'input', 'dsm-input', ui.row( item, label ) );
			input.value = f[ key ];
			input.dataset.shared = key;
			input.dataset.index = String( i );
			input.spellcheck = false;
			input.oninput = () => {
				f[ key ] = input.value;
				onChange();
			};
			input.onchange = () => onStructure();
		}
		colorFor(
			item,
			t( 'Color' ),
			() => f.color,
			( v ) => {
				f.color = v;
			}
		);
		ui.btn( item, {
			label: t( 'Remove function' ),
			onClick: () => {
				math.definitions.splice( i, 1 );
				onStructure( true );
				onChange();
			},
		} );
	}
	ui.btn( body, {
		label: t( 'Add function' ),
		onClick: () => {
			if ( math.definitions.length >= 24 ) return;
			let name = 'f';
			let i = 1;
			while ( math.definitions.some( ( f ) => f.name === name ) )
				name = 'f' + i++;
			math.definitions.push( {
				name,
				expression: 'x',
				color: '#16a34a',
			} );
			onStructure( true );
			onChange();
		},
	} );
	for ( const k of [ 'a', 'b', 'c' ] ) {
		const input = ui.el( 'input', 'dsm-input', ui.row( body, k ) );
		input.type = 'number';
		input.step = 'any';
		input.value = math[ k ];
		input.dataset.shared = k;
		input.oninput = () => {
			if ( Number.isFinite( input.valueAsNumber ) ) {
				math[ k ] = input.valueAsNumber;
				onChange();
			}
		};
	}
}
