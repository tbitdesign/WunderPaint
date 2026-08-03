/**
 * Style panel (v1.269.0): the right-hand column in the studios' CI -
 * always open settings cards with icon heads (design presets, colors,
 * per-series control, type-dependent options, labels), compact
 * label-left property rows. All state lives in the dialog; this panel
 * only renders and patches.
 */

import { useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { SwatchButton } from '../../components/color-popover';
import { FontPicker } from '../../components/font-picker';
import { useEditorMaybe } from '../../store/editor-context';
import { activeKitColors } from '../../lib/brand-kits';
import { VarButton } from '../../components/var-picker';
import { buildScheme, randomSchemeInput } from '../../lib/color-scheme';
import {
	CHART_STYLES,
	styleOptions as chartStyleOptions,
	randomChartStyle,
} from '../../lib/chart-styles';
import {
	TABLE_STYLES,
	styleOptions as tableStyleOptions,
	randomTableStyle,
	buildTable,
} from '../../lib/table';
import { buildChart } from '../../lib/chart';
import { gridFromText, chartDataFromGrid } from '../../lib/grid-model';
import { Card, Row, Slider, CheckRow, ColorsFrom, SICONS } from './controls';
import { DesignCards } from './design-cards';
import { STYLE_SAMPLE, SAMPLES } from './samples';

const nextSeeds = ( seeds ) =>
	seeds.map( ( v ) => ( v * 1103515245 + 12345 ) & 0x7fffffff );

const inputStyle = {
	width: '100%',
	padding: '6px 8px',
	border: '1px solid var(--ed-border-strong)',
	borderRadius: 4,
	background: 'var(--ed-panel-alt)',
	color: 'var(--ed-text)',
	fontSize: 12,
};

export function StylePanel( {
	type,
	isTable,
	isPricing,
	grid,
	options,
	colors,
	setOpt,
	setColors,
	seriesNames,
} ) {
	const [ seeds, setSeeds ] = useState( [ 11, 23, 37, 52 ] );
	const accent = colors[ 0 ] || '#3b66ff';
	const isBars = [ 'bar', 'barH', 'barStacked', 'waterfall' ].includes(
		type
	);
	const isLines = [ 'line', 'area' ].includes( type );
	// An explicitly chosen palette ("Use brand colors" or a picked
	// kit/swatch set) is locked: designs and shuffle change geometry and
	// typography only, never the colors (v1.272.5).
	const paletteLocked = !! ( options.useBrand || options.colorsFrom );

	const items = isTable
		? [
				...TABLE_STYLES.map( ( s ) => ( {
					key: s.id,
					id: s.id,
					label: s.label,
					style: tableStyleOptions( s.id ),
				} ) ),
				...seeds.map( ( seed ) => {
					const r = randomTableStyle( seed, accent );
					return {
						key: 'r' + seed,
						id: 'custom',
						label: __( 'Random', 'wunderpaint' ),
						style: r,
						colors: r.colors,
					};
				} ),
		  ]
		: [
				...CHART_STYLES.map( ( s ) => {
					const st = chartStyleOptions( s.id, accent );
					return {
						key: s.id,
						id: s.id,
						label: s.label,
						style: st,
						colors: st.colors,
					};
				} ),
				...seeds.map( ( seed ) => {
					const r = randomChartStyle( seed, accent );
					return {
						key: 'r' + seed,
						id: 'custom',
						label: __( 'Random', 'wunderpaint' ),
						style: r,
						colors: r.colors,
					};
				} ),
		  ];

	// Locked palette: tiles preview in the user's colors, not their own.
	const tileColors = ( it ) =>
		paletteLocked ? colors : it.colors || colors;

	const renderSpec = ( it ) => {
		if ( isTable ) {
			const sample = STYLE_SAMPLE[ type ] || STYLE_SAMPLE.tableData;
			return buildTable( {
				type,
				headers: sample.headers,
				rows: sample.rows,
				tiers: sample.tiers,
				colors: tileColors( it ),
				x: 8,
				y: 6,
				w: 224,
				h: 138,
				options: {
					...it.style,
					highlightCol: 'tableComparison' === type ? 2 : -1,
				},
			} );
		}
		const { labels, series } = chartDataFromGrid(
			gridFromText( SAMPLES[ type ] || SAMPLES.bar ),
			{ keepNegative: 'waterfall' === type }
		);
		return buildChart( {
			type,
			labels,
			series,
			colors: tileColors( it ),
			x: 8,
			y: 6,
			w: 224,
			h: 138,
			options: {
				...options,
				...it.style,
				series: [],
				legend: false,
				title: '',
				subtitle: '',
			},
		} );
	};

	const applyDesign = ( it ) => {
		const { colors: styleColors, preset, ...style } = it.style;
		setOpt( { ...style, preset: it.id } );
		const applied = paletteLocked ? null : it.colors || styleColors;
		if ( applied ) {
			setColors( ( c ) =>
				[ ...applied, ...c.slice( applied.length ) ].slice( 0, 8 )
			);
		}
	};

	const patchSeries = ( i, p ) => {
		const s = [ ...( options.series || [] ) ];
		s[ i ] = { ...( s[ i ] || {} ), ...p };
		setOpt( { series: s } );
	};

	// Brand palette: the DOCUMENT's active kit first (the kit switcher in
	// the var picker sets doc.brandKitId), then the site kit, then the
	// first kit with colors - the shared resolver since v1.273.0.
	const ed = useEditorMaybe();
	const brandColors = activeKitColors( ed?.state?.doc?.brandKitId || '' );

	return (
		<div className="chs-side">
			{ ! isPricing && (
				<Card
					icon={ SICONS.design }
					title={ __( 'Design', 'wunderpaint' ) }
				>
					<DesignCards
						items={ items }
						current={ options.preset }
						onApply={ applyDesign }
						renderSpec={ renderSpec }
						renderKey={ [
							type,
							paletteLocked ? 'locked' : '',
							colors.join( ',' ),
						].join( '|' ) }
						onShuffle={ () => setSeeds( nextSeeds ) }
					/>
				</Card>
			) }

			<Card
				icon={ SICONS.colors }
				title={ __( 'Colors', 'wunderpaint' ) }
			>
				{ brandColors && (
					<CheckRow
						label={ __( 'Use brand colors', 'wunderpaint' ) }
						checked={ !! options.useBrand }
						onChange={ ( v ) => {
							setOpt( { useBrand: v, colorsFrom: '' } );
							if ( v ) {
								setColors( brandColors.slice( 0, 8 ) );
							}
						} }
					/>
				) }
				<div
					style={ {
						display: options.useBrand ? 'none' : 'flex',
						gap: 6,
						alignItems: 'center',
						flexWrap: 'wrap',
					} }
				>
					{ colors.map( ( c, i ) => (
						<SwatchButton
							key={ i }
							color={ c }
							size={ 26 }
							title={ __( 'Color', 'wunderpaint' ) }
							onChange={ ( v ) => {
								setColors(
									colors.map( ( cc, j ) =>
										j === i ? v : cc
									)
								);
								setOpt( { colorsFrom: '' } );
							} }
						/>
					) ) }
					<button
						className="ai-btn secondary"
						style={ { padding: '3px 9px' } }
						disabled={ colors.length >= 8 }
						onClick={ () => setColors( [ ...colors, '#8a8f98' ] ) }
					>
						+
					</button>
					<button
						className="ai-btn secondary"
						style={ { padding: '3px 9px' } }
						disabled={ colors.length <= 2 }
						onClick={ () => setColors( colors.slice( 0, -1 ) ) }
					>
						−
					</button>
				</div>
				<div
					style={ {
						display: 'flex',
						gap: 6,
						alignItems: 'center',
						flexWrap: 'wrap',
					} }
				>
					<ColorsFrom
						value={ options.colorsFrom || '' }
						onApply={ ( cols, key ) => {
							setColors( cols );
							setOpt( { colorsFrom: key, useBrand: false } );
						} }
					/>
					<button
						className="ai-btn secondary"
						onClick={ () => {
							setColors(
								buildScheme( randomSchemeInput() ).slice( 0, 5 )
							);
							setOpt( { colorsFrom: '' } );
						} }
					>
						{ __( 'Random colors', 'wunderpaint' ) }
					</button>
				</div>
			</Card>

			{ ! isTable && ! isPricing && seriesNames.length > 0 && (
				<Card
					icon={ SICONS.series }
					title={ __( 'Series', 'wunderpaint' ) }
				>
					{ seriesNames.map( ( name, i ) => {
						const s = ( options.series || [] )[ i ] || {};
						return (
							<div
								key={ i }
								style={ {
									display: 'flex',
									gap: 6,
									alignItems: 'center',
								} }
							>
								<SwatchButton
									color={
										s.color || colors[ i % colors.length ]
									}
									size={ 22 }
									title={ __(
										'Series color',
										'wunderpaint'
									) }
									onChange={ ( v ) =>
										patchSeries( i, { color: v } )
									}
								/>
								<input
									type="text"
									style={ {
										...inputStyle,
										flex: 1,
										minWidth: 0,
									} }
									value={ s.name ?? name }
									onChange={ ( e ) =>
										patchSeries( i, {
											name: e.target.value,
										} )
									}
								/>
								{ isLines && (
									<button
										className="ai-btn secondary"
										style={ { padding: '2px 7px' } }
										title={ __(
											'Dashed line',
											'wunderpaint'
										) }
										onClick={ () =>
											patchSeries( i, {
												dash: ! s.dash,
											} )
										}
									>
										{ s.dash ? '╌' : '—' }
									</button>
								) }
								<button
									className="ai-btn secondary"
									style={ {
										padding: '2px 7px',
										opacity: s.hidden ? 0.45 : 1,
									} }
									title={ __(
										'Show/hide series',
										'wunderpaint'
									) }
									onClick={ () =>
										patchSeries( i, {
											hidden: ! s.hidden,
										} )
									}
								>
									👁
								</button>
							</div>
						);
					} ) }
				</Card>
			) }

			<Card
				icon={ SICONS.options }
				title={ __( 'Options', 'wunderpaint' ) }
			>
				{ ! isTable && ! isPricing && (
					<>
						{ isBars && (
							<>
								<Slider
									label={ __(
										'Corner rounding',
										'wunderpaint'
									) }
									value={ options.rounded }
									min={ 0 }
									max={ 100 }
									onChange={ ( v ) =>
										setOpt( { rounded: v } )
									}
								/>
								<Slider
									label={ __( 'Spacing', 'wunderpaint' ) }
									value={ options.gap }
									min={ 0 }
									max={ 100 }
									onChange={ ( v ) => setOpt( { gap: v } ) }
								/>
							</>
						) }
						{ [ 'donut', 'rings', 'gauge' ].includes( type ) && (
							<Slider
								label={ __( 'Thickness', 'wunderpaint' ) }
								value={ options.thickness }
								min={ 0 }
								max={ 100 }
								onChange={ ( v ) => setOpt( { thickness: v } ) }
							/>
						) }
						<Row label={ __( 'Value labels', 'wunderpaint' ) }>
							<select
								className="dsm-select"
								value={ options.values }
								onChange={ ( e ) =>
									setOpt( { values: e.target.value } )
								}
							>
								<option value="off">
									{ __( 'Off', 'wunderpaint' ) }
								</option>
								<option value="value">
									{ __( 'Values', 'wunderpaint' ) }
								</option>
								<option value="percent">
									{ __( 'Percent', 'wunderpaint' ) }
								</option>
							</select>
						</Row>
						{ ( isLines || 'kpi' === type ) && (
							<CheckRow
								label={ __( 'Smooth curves', 'wunderpaint' ) }
								checked={ !! options.smooth }
								onChange={ ( v ) => setOpt( { smooth: v } ) }
							/>
						) }
						{ ( isBars ||
							isLines ||
							[ 'scatter', 'combo', 'histogram' ].includes(
								type
							) ) && (
							<CheckRow
								label={ __( 'Axes & grid', 'wunderpaint' ) }
								checked={ !! options.axes }
								onChange={ ( v ) => setOpt( { axes: v } ) }
							/>
						) }
						<CheckRow
							label={ __( 'Legend', 'wunderpaint' ) }
							checked={ !! options.legend }
							onChange={ ( v ) => setOpt( { legend: v } ) }
						/>
						<CheckRow
							label={ __( 'Thousands separator', 'wunderpaint' ) }
							checked={ !! options.thousands }
							onChange={ ( v ) => setOpt( { thousands: v } ) }
						/>
					</>
				) }

				{ isTable && (
					<>
						<Slider
							label={ __( 'Text size', 'wunderpaint' ) }
							value={ Math.round(
								( options.textScale || 1 ) * 100
							) }
							min={ 60 }
							max={ 150 }
							onChange={ ( v ) =>
								setOpt( { textScale: v / 100 } )
							}
						/>
						<Slider
							label={ __( 'Row height', 'wunderpaint' ) }
							value={ Math.round(
								( options.rowScale || 1 ) * 100
							) }
							min={ 70 }
							max={ 200 }
							onChange={ ( v ) =>
								setOpt( { rowScale: v / 100 } )
							}
						/>
						<Slider
							label={ __( 'Cell padding', 'wunderpaint' ) }
							value={ Math.round(
								( options.cellPad ?? 1 ) * 100
							) }
							min={ 0 }
							max={ 200 }
							onChange={ ( v ) => setOpt( { cellPad: v / 100 } ) }
						/>
						<Slider
							label={ __( 'Outer padding', 'wunderpaint' ) }
							value={ Math.round(
								( options.outerPad ?? 1 ) * 100
							) }
							min={ 0 }
							max={ 200 }
							onChange={ ( v ) =>
								setOpt( { outerPad: v / 100 } )
							}
						/>
						<Slider
							label={ __( 'Header height', 'wunderpaint' ) }
							value={ Math.round(
								( options.headerScale || 1 ) * 100
							) }
							min={ 70 }
							max={ 160 }
							onChange={ ( v ) =>
								setOpt( { headerScale: v / 100 } )
							}
						/>
						<CheckRow
							label={ __( 'Wrap text', 'wunderpaint' ) }
							checked={ false !== options.wrap }
							onChange={ ( v ) => setOpt( { wrap: v } ) }
						/>
						<Row label={ __( 'Max lines', 'wunderpaint' ) }>
							<select
								className="dsm-select"
								value={ options.maxLines ?? 4 }
								onChange={ ( e ) =>
									setOpt( { maxLines: +e.target.value } )
								}
							>
								{ [ 1, 2, 3, 4, 5, 6 ].map( ( n ) => (
									<option key={ n } value={ n }>
										{ n }
									</option>
								) ) }
							</select>
						</Row>
						<Row label={ __( 'Header', 'wunderpaint' ) }>
							<select
								className="dsm-select"
								value={ options.header }
								onChange={ ( e ) =>
									setOpt( {
										header: e.target.value,
										gradient:
											'gradient' === e.target.value ||
											options.gradient,
									} )
								}
							>
								<option value="solid">
									{ __( 'Solid', 'wunderpaint' ) }
								</option>
								<option value="gradient">
									{ __( 'Gradient', 'wunderpaint' ) }
								</option>
								<option value="underline">
									{ __( 'Underline', 'wunderpaint' ) }
								</option>
								<option value="none">
									{ __( 'None', 'wunderpaint' ) }
								</option>
							</select>
						</Row>
						<Row label={ __( 'Rows', 'wunderpaint' ) }>
							<select
								className="dsm-select"
								value={ options.rows }
								onChange={ ( e ) =>
									setOpt( { rows: e.target.value } )
								}
							>
								<option value="zebra">
									{ __( 'Zebra', 'wunderpaint' ) }
								</option>
								<option value="lines">
									{ __( 'Lines', 'wunderpaint' ) }
								</option>
								<option value="plain">
									{ __( 'Plain', 'wunderpaint' ) }
								</option>
								<option value="cards">
									{ __( 'Cards', 'wunderpaint' ) }
								</option>
							</select>
						</Row>
						<Row label={ __( 'Frame', 'wunderpaint' ) }>
							<select
								className="dsm-select"
								value={ options.container }
								onChange={ ( e ) =>
									setOpt( { container: e.target.value } )
								}
							>
								<option value="none">
									{ __( 'None', 'wunderpaint' ) }
								</option>
								<option value="outline">
									{ __( 'Outline', 'wunderpaint' ) }
								</option>
								<option value="soft">
									{ __( 'Soft', 'wunderpaint' ) }
								</option>
								<option value="dark">
									{ __( 'Dark', 'wunderpaint' ) }
								</option>
							</select>
						</Row>
						<Row label={ __( 'Density', 'wunderpaint' ) }>
							<select
								className="dsm-select"
								value={ options.density }
								onChange={ ( e ) =>
									setOpt( { density: e.target.value } )
								}
							>
								<option value="compact">
									{ __( 'Compact', 'wunderpaint' ) }
								</option>
								<option value="normal">
									{ __( 'Normal', 'wunderpaint' ) }
								</option>
								<option value="roomy">
									{ __( 'Roomy', 'wunderpaint' ) }
								</option>
							</select>
						</Row>
						<Row label={ __( 'Marks', 'wunderpaint' ) }>
							<select
								className="dsm-select"
								value={ options.mark }
								onChange={ ( e ) =>
									setOpt( { mark: e.target.value } )
								}
							>
								<option value="check">
									{ __( 'Check', 'wunderpaint' ) }
								</option>
								<option value="badge">
									{ __( 'Badge', 'wunderpaint' ) }
								</option>
								<option value="dot">
									{ __( 'Dot', 'wunderpaint' ) }
								</option>
							</select>
						</Row>
						<Slider
							label={ __( 'Corners', 'wunderpaint' ) }
							value={ options.radius }
							min={ 0 }
							max={ 28 }
							onChange={ ( v ) => setOpt( { radius: v } ) }
						/>
						{ 'tableComparison' === type && (
							<Row
								label={ __(
									'Highlight column',
									'wunderpaint'
								) }
							>
								<select
									className="dsm-select"
									value={ options.highlightCol }
									onChange={ ( e ) =>
										setOpt( {
											highlightCol: +e.target.value,
										} )
									}
								>
									<option value={ -1 }>
										{ __( 'None', 'wunderpaint' ) }
									</option>
									{ ( grid?.headers || [] )
										.slice( 1 )
										.map( ( hd, i ) => (
											<option key={ i } value={ i + 1 }>
												{ hd ||
													sprintf(
														/* translators: %d: column number. */
														__(
															'Column %d',
															'wunderpaint'
														),
														i + 2
													) }
											</option>
										) ) }
								</select>
							</Row>
						) }
					</>
				) }
			</Card>

			<Card
				icon={ SICONS.labels }
				title={ __( 'Labels', 'wunderpaint' ) }
			>
				<Row label={ __( 'Font', 'wunderpaint' ) }>
					<FontPicker
						value={ options.fontFamily || 'Inter' }
						onChange={ ( f ) => setOpt( { fontFamily: f } ) }
					/>
				</Row>
				<Row label={ __( 'Title (optional)', 'wunderpaint' ) }>
					<input
						type="text"
						style={ inputStyle }
						value={ options.title }
						onChange={ ( e ) =>
							setOpt( { title: e.target.value } )
						}
					/>
					<VarButton
						value={ options.title }
						onChange={ ( v ) => setOpt( { title: v } ) }
					/>
				</Row>
				<Row label={ __( 'Subtitle (optional)', 'wunderpaint' ) }>
					<input
						type="text"
						style={ inputStyle }
						value={ options.subtitle }
						onChange={ ( e ) =>
							setOpt( { subtitle: e.target.value } )
						}
					/>
					<VarButton
						value={ options.subtitle }
						onChange={ ( v ) => setOpt( { subtitle: v } ) }
					/>
				</Row>
				{ ! isTable && ! isPricing && (
					<>
						<Row label={ __( 'Prefix', 'wunderpaint' ) }>
							<input
								type="text"
								style={ inputStyle }
								value={ options.prefix }
								placeholder="€"
								onChange={ ( e ) =>
									setOpt( { prefix: e.target.value } )
								}
							/>
						</Row>
						<Row label={ __( 'Suffix', 'wunderpaint' ) }>
							<input
								type="text"
								style={ inputStyle }
								value={ options.suffix }
								placeholder="%"
								onChange={ ( e ) =>
									setOpt( { suffix: e.target.value } )
								}
							/>
						</Row>
					</>
				) }
			</Card>
		</div>
	);
}
