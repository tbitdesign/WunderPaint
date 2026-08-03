/**
 * Chart & Table Studio (v1.269.0, was chart-dialog.jsx): three-zone
 * insert dialog - type gallery left, live preview plus spreadsheet grid
 * center, style accordions right. Data lives in a grid (grid-model);
 * legacy groups carrying `data` CSV text are migrated on open. A saved
 * WordPress source enables one-click refresh.
 */

import { useEffect, useRef, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { I } from '../../icons';
import { useEditor } from '../../store/editor-context';
import { useEscape } from '../../components/use-escape';
import { VarButton } from '../../components/var-picker';
import { buildChart, CHART_COLORS } from '../../lib/chart';
import { buildTable, naturalTableHeight, TABLE_TYPES } from '../../lib/table';
import { renderToCanvas, sharedImageCache } from '../../lib/raster';
import {
	gridFromText,
	chartDataFromGrid,
	insertRow,
	insertCol,
	transposeGrid,
	numberSeps,
	normalizeGrid,
	setCell,
	setHeader,
} from '../../lib/grid-model';
import {
	SAMPLES,
	DEFAULT_TIERS,
	DEFAULT_OPTIONS,
	isSampleText,
} from './samples';
import { TypeGallery } from './type-gallery';
import { DataGrid } from './data-grid';
import { StylePanel } from './style-panel';
import { PricingEditor } from './pricing-editor';
import { acceptsFile, readGridFromFile } from './import-csv';
import {
	ImportPostsOverlay,
	fetchSourceGrid,
	fieldLabel,
} from './import-posts';

/** Legacy `data` CSV → grid; everything else passes through. */
export function migrateChart( chart = {} ) {
	return {
		grid: chart.grid
			? normalizeGrid( chart.grid )
			: gridFromText( chart.data || '' ),
		tiers: chart.tiers || DEFAULT_TIERS,
		colors: chart.colors || CHART_COLORS.slice( 0, 4 ),
		options: { ...DEFAULT_OPTIONS, ...( chart.options || {} ) },
		source: chart.source || null,
	};
}

const inputStyle = {
	width: '100%',
	padding: '6px 8px',
	border: '1px solid var(--ed-border-strong)',
	borderRadius: 4,
	background: 'var(--ed-panel-alt)',
	color: 'var(--ed-text)',
	fontSize: 12,
};

export function ChartStudio( { onClose, extras, layerId = null } ) {
	useEscape( onClose );
	const editor = useEditor();
	const { state, dispatch, commit } = editor;
	const editGroup = layerId
		? state.layers.find( ( l ) => l.id === layerId && l.chart ) || null
		: null;
	const initial = migrateChart( editGroup?.chart || {} );

	const [ type, setType ] = useState( editGroup?.chart?.type || 'bar' );
	const [ grid, setGrid ] = useState( () =>
		editGroup ? initial.grid : gridFromText( SAMPLES.bar )
	);
	const [ colors, setColors ] = useState( initial.colors );
	const [ options, setOptions ] = useState( initial.options );
	const [ tiers, setTiers ] = useState( initial.tiers );
	const [ source, setSource ] = useState( initial.source );
	const [ preview, setPreview ] = useState( null );
	const [ busy, setBusy ] = useState( false );
	const [ importing, setImporting ] = useState( null ); // null | 'wp'
	const [ pendingCsv, setPendingCsv ] = useState( null );
	const [ dataOpen, setDataOpen ] = useState( true );
	const focusCell = useRef( { r: 0, c: 0 } ); // last focused grid cell

	const setOpt = ( patch ) => setOptions( ( o ) => ( { ...o, ...patch } ) );
	const isTable = TABLE_TYPES.includes( type );
	const isPricing = 'tablePricing' === type;
	const seps = numberSeps();
	const opts = { ...options, groupSep: seps.group, decSep: seps.dec };
	const parsed = chartDataFromGrid( grid, {
		keepNegative: 'waterfall' === type,
	} );
	const ready = isPricing
		? tiers.some( ( t ) => t.name?.trim() )
		: isTable
		? grid.headers.length > 0 && grid.rows.length > 0
		: parsed.labels.length > 0 && parsed.series.length > 0;

	const seriesNames = parsed.series.map(
		( s, i ) =>
			s.name ||
			sprintf(
				/* translators: %d: series number. */
				__( 'Series %d', 'wunderpaint' ),
				i + 1
			)
	);

	const parsedTiers = tiers.map( ( t ) => ( {
		...t,
		features: String( t.features || '' )
			.split( '\n' )
			.map( ( f ) => f.trim() )
			.filter( Boolean ),
	} ) );

	// One spec used by both the preview and the insert paths.
	const buildSpec = ( rect ) => {
		if ( isPricing ) {
			return buildTable( {
				type,
				tiers: parsedTiers,
				colors,
				...rect,
				options: opts,
			} );
		}
		if ( isTable ) {
			return buildTable( {
				type,
				headers: grid.headers,
				rows: grid.rows,
				cols: grid.cols,
				colors,
				...rect,
				options: opts,
			} );
		}
		return buildChart( {
			type,
			labels: parsed.labels,
			series: parsed.series,
			colors,
			...rect,
			options: opts,
		} );
	};

	// Content-driven height so the box (and its preview) fit the data.
	const tableHeightFor = ( w ) =>
		naturalTableHeight( {
			type,
			headers: grid.headers,
			rows: grid.rows,
			tiers: parsedTiers,
			w,
			options: opts,
		} );

	const pickType = ( t ) => {
		setType( t );
		// Untouched sample data follows the type, custom data stays.
		if ( isSampleText( grid ) && 'tablePricing' !== t ) {
			setGrid( gridFromText( SAMPLES[ t ] || SAMPLES.bar ) );
		}
	};

	/* ----------------------------- imports ----------------------------- */
	const onFile = async ( file ) => {
		if ( ! acceptsFile( file ) ) {
			extras?.toasts?.error?.(
				__( 'Please choose a .csv, .tsv or .txt file.', 'wunderpaint' )
			);
			return;
		}
		try {
			const next = await readGridFromFile( file );
			if ( ! next.headers.length ) {
				extras?.toasts?.error?.(
					__( 'The file appears to be empty.', 'wunderpaint' )
				);
				return;
			}
			if ( isSampleText( grid ) || ! grid.rows.length ) {
				setGrid( next );
				setSource( null );
			} else {
				setPendingCsv( next );
			}
		} catch ( e ) {
			extras?.toasts?.error?.(
				__( 'Could not read the file.', 'wunderpaint' )
			);
		}
	};

	const refresh = async () => {
		setBusy( true );
		try {
			const labels = source.fields.map( fieldLabel );
			const { grid: next } = await fetchSourceGrid( source, labels );
			if ( ! next.rows.length ) {
				extras?.toasts?.error?.(
					__(
						'The saved query returned no entries; data left unchanged.',
						'wunderpaint'
					)
				);
				return;
			}
			setGrid( { ...next, cols: grid.cols } );
			extras?.toasts?.success?.(
				sprintf(
					/* translators: %d: number of imported rows. */
					__( 'Data refreshed: %d rows.', 'wunderpaint' ),
					next.rows.length
				)
			);
		} catch ( e ) {
			extras?.toasts?.error?.(
				e?.message || __( 'Refresh failed.', 'wunderpaint' )
			);
		} finally {
			setBusy( false );
		}
	};

	/* ----------------------------- preview ----------------------------- */
	const previewKey = JSON.stringify( { type, grid, colors, options, tiers } );
	useEffect( () => {
		if ( ! ready ) {
			setPreview( null );
			return;
		}
		let live = true;
		const t = setTimeout( async () => {
			try {
				// Tables size to their content so the preview matches the
				// inserted result; charts keep a fixed frame.
				const pw = 560;
				const ph = isTable
					? Math.max( 120, tableHeightFor( pw - 40 ) )
					: 400;
				const { group, layers } = buildSpec( {
					x: 20,
					y: 16,
					w: pw - 40,
					h: ph,
				} );
				const canvas = await renderToCanvas(
					{
						id: 'chart-preview',
						w: pw,
						h: ph + 32,
						bg: '#ffffff',
					},
					[ ...layers, group ],
					{ cache: sharedImageCache }
				);
				if ( live ) {
					setPreview( canvas.toDataURL() );
				}
			} catch ( e ) {
				if ( live ) {
					setPreview( null );
				}
			}
		}, 250 );
		return () => {
			live = false;
			clearTimeout( t );
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ previewKey, ready ] );

	/* ------------------------------ insert ----------------------------- */
	const insert = () => {
		if ( ! ready || busy ) {
			return;
		}
		setBusy( true );
		try {
			let rect;
			if ( editGroup ) {
				// Rebuild inside the existing chart's bounding box.
				const kids = state.layers.filter(
					( l ) => l.parent === editGroup.id
				);
				const minX = Math.min( ...kids.map( ( l ) => l.x ) );
				const minY = Math.min( ...kids.map( ( l ) => l.y ) );
				const maxX = Math.max( ...kids.map( ( l ) => l.x + l.w ) );
				const maxY = Math.max( ...kids.map( ( l ) => l.y + l.h ) );
				rect = {
					x: minX,
					y: minY,
					w: Math.max( 40, maxX - minX ),
					h: Math.max( 40, maxY - minY ),
				};
			} else if ( isTable ) {
				// Tables: wide, and only as tall as their content.
				const tw = Math.round(
					Math.min( state.doc.w * 0.86, state.doc.w - 40 )
				);
				const th = Math.min(
					Math.round( state.doc.h * 0.94 ),
					tableHeightFor( tw )
				);
				rect = {
					x: Math.round( ( state.doc.w - tw ) / 2 ),
					y: Math.round( ( state.doc.h - th ) / 2 ),
					w: tw,
					h: th,
				};
			} else {
				const cw = Math.round(
					Math.min( state.doc.w, state.doc.h ) * 0.72
				);
				rect = {
					x: Math.round( ( state.doc.w - cw ) / 2 ),
					y: Math.round( ( state.doc.h - cw * 0.75 ) / 2 ),
					w: cw,
					h: Math.round( cw * 0.75 ),
				};
			}
			const { group, layers } = buildSpec( rect );
			group.chart = { type, grid, tiers, colors, options, source };
			if ( editGroup ) {
				const kids = new Set( editGroup.children || [] );
				const next = state.layers.flatMap( ( l ) => {
					if ( l.id === editGroup.id ) {
						return [ ...layers, group ];
					}
					return kids.has( l.id ) ? [] : [ l ];
				} );
				dispatch( { type: 'SET_LAYERS', layers: next } );
				dispatch( { type: 'SET_ACTIVE', id: group.id } );
				commit(
					isTable
						? __( 'Edit table', 'wunderpaint' )
						: __( 'Edit chart', 'wunderpaint' )
				);
			} else {
				dispatch( {
					type: 'SET_LAYERS',
					layers: [ ...state.layers, ...layers, group ],
				} );
				dispatch( { type: 'SET_ACTIVE', id: group.id } );
				commit(
					isTable
						? __( 'Insert table', 'wunderpaint' )
						: __( 'Insert chart', 'wunderpaint' )
				);
				extras?.toasts?.success?.(
					isTable
						? __(
								'Table inserted as an editable group.',
								'wunderpaint'
						  )
						: __(
								'Chart inserted as an editable group.',
								'wunderpaint'
						  )
				);
			}
			onClose();
		} finally {
			setBusy( false );
		}
	};

	return (
		<div className="modal-backdrop" onClick={ onClose } role="presentation">
			<div
				className="stock-dialog chs-dialog"
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-label={ __( 'Chart & Table', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<div className="dsm-title-row">
							<span className="dsm-title">
								{ editGroup
									? isTable
										? __( 'Edit Table', 'wunderpaint' )
										: __( 'Edit Chart', 'wunderpaint' )
									: __( 'Chart & Table', 'wunderpaint' ) }
							</span>
						</div>
						<div className="dsm-sub">
							{ __(
								'Charts and tables from your data, as fully editable layers.',
								'wunderpaint'
							) }
						</div>
					</div>
					<button
						className="dsm-close"
						onClick={ onClose }
						aria-label={ __( 'Close', 'wunderpaint' ) }
					>
						{ I.close( { size: 17 } ) }
					</button>
				</div>

				<div className="chs-body">
					<TypeGallery current={ type } onPick={ pickType } />

					<div
						className={
							'chs-center' + ( dataOpen ? '' : ' data-collapsed' )
						}
					>
						<div className="chs-preview">
							{ preview ? (
								<img
									src={ preview }
									alt={ __( 'Preview', 'wunderpaint' ) }
								/>
							) : (
								<span className="chs-preview-hint">
									{ isTable
										? __(
												'Enter table data to see a preview.',
												'wunderpaint'
										  )
										: __(
												'Enter data with at least one numeric column to see a preview.',
												'wunderpaint'
										  ) }
								</span>
							) }
						</div>
						<div
							className={
								'chs-data' + ( dataOpen ? '' : ' collapsed' )
							}
							onDragOver={ ( e ) => e.preventDefault() }
							onDrop={ ( e ) => {
								e.preventDefault();
								onFile( e.dataTransfer?.files?.[ 0 ] );
							} }
						>
							<div className="chs-data-bar">
								<button
									className="ai-btn secondary"
									onClick={ () => setDataOpen( ! dataOpen ) }
								>
									{ dataOpen
										? __( 'Hide data', 'wunderpaint' )
										: __( 'Data', 'wunderpaint' ) }
								</button>
								{ ! isPricing && (
									<>
										<label
											className="ai-btn secondary"
											style={ { cursor: 'pointer' } }
										>
											{ __(
												'Import CSV',
												'wunderpaint'
											) }
											<input
												type="file"
												accept=".csv,.tsv,.txt,text/*"
												hidden
												onChange={ ( e ) => {
													onFile(
														e.target.files?.[ 0 ]
													);
													e.target.value = '';
												} }
											/>
										</label>
										<button
											className="ai-btn secondary"
											onClick={ () =>
												setImporting( 'wp' )
											}
										>
											{ __(
												'Import from WordPress',
												'wunderpaint'
											) }
										</button>
										{ source && (
											<button
												className="ai-btn secondary"
												disabled={ busy }
												onClick={ refresh }
											>
												{ __(
													'Refresh data',
													'wunderpaint'
												) }
											</button>
										) }
										<span className="spacer" />
										<button
											className="ai-btn secondary"
											onClick={ () =>
												setGrid(
													insertRow(
														grid,
														grid.rows.length
													)
												)
											}
										>
											{ __( '+ Row', 'wunderpaint' ) }
										</button>
										<button
											className="ai-btn secondary"
											onClick={ () =>
												setGrid(
													insertCol(
														grid,
														grid.headers.length
													)
												)
											}
										>
											{ __( '+ Column', 'wunderpaint' ) }
										</button>
										<button
											className="ai-btn secondary"
											onClick={ () =>
												setGrid( transposeGrid( grid ) )
											}
										>
											{ __( 'Transpose', 'wunderpaint' ) }
										</button>
										<button
											className="ai-btn secondary"
											onClick={ () =>
												setGrid(
													gridFromText(
														SAMPLES[ type ] ||
															SAMPLES.bar
													)
												)
											}
										>
											{ __(
												'Sample data',
												'wunderpaint'
											) }
										</button>
										<VarButton
											value={
												focusCell.current.r < 0
													? grid.headers[
															focusCell.current.c
													  ] ?? ''
													: grid.rows[
															focusCell.current.r
													  ]?.[
															focusCell.current.c
													  ] ?? ''
											}
											onChange={ ( v ) => {
												const f = focusCell.current;
												setGrid(
													f.r < 0
														? setHeader(
																grid,
																f.c,
																v
														  )
														: setCell(
																grid,
																f.r,
																f.c,
																v
														  )
												);
											} }
										/>
									</>
								) }
							</div>
							{ pendingCsv && (
								<div className="chs-confirm">
									{ __(
										'Replace the current data with the imported file?',
										'wunderpaint'
									) }
									<button
										className="ai-btn primary"
										style={ { padding: '2px 10px' } }
										onClick={ () => {
											setGrid( pendingCsv );
											setSource( null );
											setPendingCsv( null );
										} }
									>
										{ __( 'Replace', 'wunderpaint' ) }
									</button>
									<button
										className="ai-btn secondary"
										style={ { padding: '2px 10px' } }
										onClick={ () => setPendingCsv( null ) }
									>
										{ __( 'Keep current', 'wunderpaint' ) }
									</button>
								</div>
							) }
							{ dataOpen &&
								( isPricing ? (
									<div style={ { overflowY: 'auto' } }>
										<PricingEditor
											tiers={ tiers }
											setTiers={ setTiers }
											input={ inputStyle }
										/>
									</div>
								) : (
									<DataGrid
										grid={ grid }
										onChange={ ( g ) => setGrid( g ) }
										onFocusCell={ ( r, c ) => {
											focusCell.current = { r, c };
										} }
									/>
								) ) }
						</div>
					</div>

					<StylePanel
						type={ type }
						isTable={ isTable }
						isPricing={ isPricing }
						grid={ grid }
						options={ options }
						colors={ colors }
						setOpt={ setOpt }
						setColors={ setColors }
						seriesNames={ seriesNames }
					/>
				</div>

				<div className="dsm-foot">
					<div className="dsm-hint">
						{ I.layers ? I.layers( { size: 14 } ) : null }
						{ __( 'Lands as editable layers', 'wunderpaint' ) }
					</div>
					<div style={ { display: 'flex', gap: 8 } }>
						<button
							className="ai-btn secondary"
							onClick={ onClose }
						>
							{ __( 'Cancel', 'wunderpaint' ) }
						</button>
						<button
							className="ai-btn primary"
							disabled={ ! ready || busy }
							onClick={ insert }
						>
							{ editGroup
								? isTable
									? __( 'Update table', 'wunderpaint' )
									: __( 'Update chart', 'wunderpaint' )
								: isTable
								? __( 'Insert table', 'wunderpaint' )
								: __( 'Insert chart', 'wunderpaint' ) }
						</button>
					</div>
				</div>

				{ 'wp' === importing && (
					<ImportPostsOverlay
						source={ source }
						onClose={ () => setImporting( null ) }
						onApply={ ( { grid: g, source: s } ) => {
							setGrid( g );
							setSource( s );
							setImporting( null );
						} }
					/>
				) }
			</div>
		</div>
	);
}
