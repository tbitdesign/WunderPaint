/**
 * Spreadsheet-style grid editor (v1.269.0): controlled component over
 * the pure grid-model. Multi-cell paste from Excel/Sheets lands at the
 * focused cell; arrows/Tab/Enter navigate; the column header menu
 * carries sort, align, number format and structure operations.
 */

import { useRef, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import {
	DEFAULT_COL,
	insertRow,
	removeRow,
	insertCol,
	removeCol,
	moveCol,
	setCell,
	setHeader,
	setColMeta,
	sortGrid,
	pasteAt,
	normalizeGrid,
} from '../../lib/grid-model';

function ColMenu( { grid, ci, onChange, onClose } ) {
	const meta = { ...DEFAULT_COL, ...( grid.cols[ ci ] || {} ) };
	const act = ( next ) => {
		onChange( next );
		onClose();
	};
	return (
		<div className="chs-colmenu" onMouseLeave={ onClose }>
			<button onClick={ () => act( sortGrid( grid, ci, 1 ) ) }>
				{ __( 'Sort ascending', 'wunderpaint' ) }
			</button>
			<button onClick={ () => act( sortGrid( grid, ci, -1 ) ) }>
				{ __( 'Sort descending', 'wunderpaint' ) }
			</button>
			<select
				className="dsm-select"
				value={ meta.align }
				onChange={ ( e ) =>
					act( setColMeta( grid, ci, { align: e.target.value } ) )
				}
			>
				<option value="auto">
					{ __( 'Align: auto', 'wunderpaint' ) }
				</option>
				<option value="left">
					{ __( 'Align: left', 'wunderpaint' ) }
				</option>
				<option value="right">
					{ __( 'Align: right', 'wunderpaint' ) }
				</option>
			</select>
			<select
				className="dsm-select"
				value={ meta.format }
				onChange={ ( e ) =>
					act( setColMeta( grid, ci, { format: e.target.value } ) )
				}
			>
				<option value="auto">
					{ __( 'Format: auto', 'wunderpaint' ) }
				</option>
				<option value="text">
					{ __( 'Format: text', 'wunderpaint' ) }
				</option>
				<option value="number">
					{ __( 'Format: number', 'wunderpaint' ) }
				</option>
				<option value="currency">
					{ __( 'Format: currency', 'wunderpaint' ) }
				</option>
				<option value="percent">
					{ __( 'Format: percent', 'wunderpaint' ) }
				</option>
			</select>
			<select
				className="dsm-select"
				value={ null === meta.decimals ? '' : meta.decimals }
				onChange={ ( e ) =>
					act(
						setColMeta( grid, ci, {
							decimals:
								'' === e.target.value ? null : +e.target.value,
						} )
					)
				}
			>
				<option value="">
					{ __( 'Decimals: auto', 'wunderpaint' ) }
				</option>
				{ [ 0, 1, 2, 3 ].map( ( d ) => (
					<option key={ d } value={ d }>
						{ __( 'Decimals', 'wunderpaint' ) + ': ' + d }
					</option>
				) ) }
			</select>
			<button onClick={ () => act( insertCol( grid, ci ) ) }>
				{ __( 'Insert column left', 'wunderpaint' ) }
			</button>
			<button onClick={ () => act( insertCol( grid, ci + 1 ) ) }>
				{ __( 'Insert column right', 'wunderpaint' ) }
			</button>
			<button
				disabled={ 0 === ci }
				onClick={ () => act( moveCol( grid, ci, ci - 1 ) ) }
			>
				{ __( 'Move left', 'wunderpaint' ) }
			</button>
			<button
				disabled={ ci >= grid.headers.length - 1 }
				onClick={ () => act( moveCol( grid, ci, ci + 1 ) ) }
			>
				{ __( 'Move right', 'wunderpaint' ) }
			</button>
			<button
				disabled={ grid.headers.length <= 2 }
				onClick={ () => act( removeCol( grid, ci ) ) }
			>
				{ __( 'Delete column', 'wunderpaint' ) }
			</button>
		</div>
	);
}

export function DataGrid( { grid: rawGrid, onChange, onFocusCell } ) {
	const grid = normalizeGrid( rawGrid );
	const [ menu, setMenu ] = useState( -1 ); // open column menu index
	const wrap = useRef( null );

	// Column resize grip (v1.270): dragging the right TH edge writes
	// cols[ci].width as PERCENT of the table width; double-click = auto.
	const dragRef = useRef( null );
	const onGripDown = ( e, ci ) => {
		e.stopPropagation();
		e.preventDefault();
		const th = e.currentTarget.closest( 'th' );
		const table = e.currentTarget.closest( 'table' );
		dragRef.current = {
			ci,
			startX: e.clientX,
			startW: th.offsetWidth,
			tableW: table.offsetWidth,
			raf: 0,
		};
		e.currentTarget.setPointerCapture( e.pointerId );
	};
	const onGripMove = ( e ) => {
		const d = dragRef.current;
		if ( ! d ) {
			return;
		}
		const px = d.startW + ( e.clientX - d.startX );
		const pct = Math.min(
			80,
			Math.max( 5, Math.round( ( px / d.tableW ) * 100 ) )
		);
		if ( d.raf ) {
			return;
		}
		d.raf = requestAnimationFrame( () => {
			d.raf = 0;
			onChange( setColMeta( grid, d.ci, { width: pct } ) );
		} );
	};
	const onGripUp = () => {
		dragRef.current = null;
	};

	const focusCell = ( r, c ) => {
		const el = wrap.current?.querySelector(
			`[data-cell="${ r }:${ c }"] input`
		);
		el?.focus();
		el?.select?.();
	};
	const onKey = ( e, r, c ) => {
		const rows = grid.rows.length;
		const cols = grid.headers.length;
		const nav = {
			ArrowUp: [ r - 1, c ],
			ArrowDown: [ r + 1, c ],
			Enter: [ r + 1, c ],
			ArrowLeft: 0 === e.target.selectionStart ? [ r, c - 1 ] : null,
			ArrowRight:
				e.target.selectionStart === e.target.value.length
					? [ r, c + 1 ]
					: null,
		}[ e.key ];
		if ( ! nav ) {
			return;
		}
		const [ nr, nc ] = nav;
		if ( 'Enter' === e.key && r === rows - 1 ) {
			e.preventDefault();
			onChange( insertRow( grid, rows ) );
			setTimeout( () => focusCell( rows, c ), 0 );
			return;
		}
		if ( nr < -1 || nr >= rows || nc < 0 || nc >= cols ) {
			return;
		}
		e.preventDefault();
		focusCell( nr, nc );
	};
	const onPaste = ( e, r, c ) => {
		const text = e.clipboardData?.getData( 'text/plain' ) || '';
		if ( ! /[\t\n]/.test( text ) ) {
			return; // single value: default input paste
		}
		e.preventDefault();
		onChange( pasteAt( grid, r, c, text ) );
	};

	return (
		<div className="chs-grid-wrap" ref={ wrap }>
			<table className="chs-grid">
				<colgroup>
					<col style={ { width: 26 } } />
					{ grid.headers.map( ( _, ci ) => (
						<col
							key={ ci }
							style={
								Number.isFinite( grid.cols[ ci ]?.width )
									? {
											width: grid.cols[ ci ].width + '%',
									  }
									: undefined
							}
						/>
					) ) }
				</colgroup>
				<thead>
					<tr>
						<th className="chs-rowhead" />
						{ grid.headers.map( ( hd, ci ) => (
							<th key={ ci } data-cell={ `-1:${ ci }` }>
								<div
									style={ {
										display: 'flex',
										alignItems: 'center',
									} }
								>
									<input
										value={ hd }
										placeholder={ __(
											'Column',
											'wunderpaint'
										) }
										onChange={ ( e ) =>
											onChange(
												setHeader(
													grid,
													ci,
													e.target.value
												)
											)
										}
										onKeyDown={ ( e ) =>
											onKey( e, -1, ci )
										}
										onPaste={ ( e ) =>
											onPaste( e, -1, ci )
										}
										onFocus={ () =>
											onFocusCell?.( -1, ci )
										}
									/>
									<button
										className="chs-rowhead"
										style={ {
											border: 0,
											background: 'transparent',
										} }
										aria-label={ __(
											'Column menu',
											'wunderpaint'
										) }
										onClick={ () =>
											setMenu( menu === ci ? -1 : ci )
										}
									>
										⋮
									</button>
								</div>
								{ menu === ci && (
									<ColMenu
										grid={ grid }
										ci={ ci }
										onChange={ onChange }
										onClose={ () => setMenu( -1 ) }
									/>
								) }
								<span
									className="chs-col-grip"
									role="presentation"
									title={ __(
										'Drag to resize, double-click for auto',
										'wunderpaint'
									) }
									onPointerDown={ ( e ) =>
										onGripDown( e, ci )
									}
									onPointerMove={ onGripMove }
									onPointerUp={ onGripUp }
									onDoubleClick={ () =>
										onChange(
											setColMeta( grid, ci, {
												width: null,
											} )
										)
									}
								/>
							</th>
						) ) }
					</tr>
				</thead>
				<tbody>
					{ grid.rows.map( ( row, r ) => (
						<tr key={ r }>
							<td
								className="chs-rowhead"
								title={ __(
									'Click: insert row below. Alt-click: delete row.',
									'wunderpaint'
								) }
								onClick={ ( e ) =>
									onChange(
										e.altKey && grid.rows.length > 1
											? removeRow( grid, r )
											: insertRow( grid, r + 1 )
									)
								}
							>
								{ r + 1 }
							</td>
							{ row.map( ( cell, c ) => (
								<td key={ c } data-cell={ `${ r }:${ c }` }>
									<input
										value={ cell }
										onChange={ ( e ) =>
											onChange(
												setCell(
													grid,
													r,
													c,
													e.target.value
												)
											)
										}
										onKeyDown={ ( e ) => onKey( e, r, c ) }
										onPaste={ ( e ) => onPaste( e, r, c ) }
										onFocus={ () => onFocusCell?.( r, c ) }
									/>
								</td>
							) ) }
						</tr>
					) ) }
				</tbody>
			</table>
		</div>
	);
}
