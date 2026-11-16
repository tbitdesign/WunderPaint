import { PaintSwatch } from '../../components/paint-controls';
import { useId } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { Dial, Choice } from './pen-controls';
import { SwatchButton } from '../../components/color-popover';
import { penColorAt } from '../../lib/pen-creative';
function Check( { label, checked, onChange } ) {
	const id = useId();
	return (
		<label className="pp-check" htmlFor={ id }>
			<input
				id={ id }
				type="checkbox"
				checked={ checked }
				onChange={ ( e ) => onChange( e.target.checked ) }
			/>
			{ label }
		</label>
	);
}
export function PenCreativeOptions( {
	tab,
	style,
	patch,
	commit,
	opts,
	setOpt,
	layer,
	doc,
	onEdit,
	editMode,
	disabled,
	color: baseColor,
	onColor,
	onPaint,
} ) {
	const dial = ( key, label, min = 0, max = 100, step = 1, suffix = '' ) => (
		<Dial
			key={ key }
			label={ label }
			value={ style[ key ] }
			min={ min }
			max={ max }
			step={ step }
			suffix={ suffix }
			onChange={ ( v ) => patch( { [ key ]: v } ) }
			onCommit={ commit }
		/>
	);
	const shapeStyle = style.kind !== 'fill';
	return (
		<>
			{ tab === 'width' && (
				<>
					<div className="pp-section pp-color-section">
						{ shapeStyle ? (
							<Choice
								label={ __( 'Color', 'wunderpaint' ) }
								value={ style.colorMode }
								choices={ [
									[ 'solid', __( 'Fill', 'wunderpaint' ) ],
									[
										'path',
										__( 'Along path', 'wunderpaint' ),
									],
								] }
								onChange={ ( v ) =>
									patch(
										{
											colorMode: v,
											colors:
												style.colors.length > 1
													? style.colors
													: [
															{
																t: 0,
																color:
																	baseColor ||
																	'#245d55',
															},
															{
																t: 1,
																color: '#f39c49',
															},
													  ],
										},
										true
									)
								}
							/>
						) : (
							<span className="bp-sect-head">
								{ __( 'Fill color', 'wunderpaint' ) }
							</span>
						) }
						{ ( ! shapeStyle || style.colorMode !== 'path' ) && (
							<div className="pp-color-value">
								{ layer ? (
									<>
										<span>
											{ __( 'Fill', 'wunderpaint' ) }
										</span>
										<PaintSwatch
											layer={ layer }
											title={ __(
												'Fill',
												'wunderpaint'
											) }
											onChange={ onPaint }
											onCommit={ commit }
										/>
										<span>
											{ __( 'Stroke', 'wunderpaint' ) }
										</span>
										<PaintSwatch
											layer={ layer }
											target="stroke"
											title={ __(
												'Stroke',
												'wunderpaint'
											) }
											onChange={ onPaint }
											onCommit={ commit }
										/>
									</>
								) : (
									<SwatchButton
										color={ baseColor }
										title={ __( 'Color', 'wunderpaint' ) }
										size={ 26 }
										onChange={ onColor }
									/>
								) }
							</div>
						) }
						{ shapeStyle && style.colorMode === 'path' && (
							<>
								<div className="pp-color-stops">
									{ style.colors.map( ( stop, i ) => (
										<div
											className="pp-color-stop"
											key={ i }
										>
											<SwatchButton
												color={ stop.color }
												size={ 24 }
												title={ __(
													'Path color',
													'wunderpaint'
												) }
												onChange={ ( color ) =>
													patch(
														{
															colors: style.colors.map(
																( c, j ) =>
																	i === j
																		? {
																				...c,
																				color,
																		  }
																		: c
															),
														},
														true
													)
												}
											/>
											<Dial
												label={ __(
													'Position',
													'wunderpaint'
												) }
												value={ stop.t * 100 }
												min={
													i
														? style.colors[ i - 1 ]
																.t *
																100 +
														  0.5
														: 0
												}
												max={
													i < style.colors.length - 1
														? style.colors[ i + 1 ]
																.t *
																100 -
														  0.5
														: 100
												}
												step={ 0.5 }
												suffix="%"
												onChange={ ( v ) =>
													patch( {
														colors: style.colors.map(
															( c, j ) =>
																i === j
																	? {
																			...c,
																			t:
																				v /
																				100,
																	  }
																	: c
														),
													} )
												}
												onCommit={ commit }
											/>
											<button
												className="pp-link"
												disabled={
													style.colors.length <= 2
												}
												aria-label={ __(
													'Remove color',
													'wunderpaint'
												) }
												onClick={ () =>
													patch(
														{
															colors: style.colors.filter(
																( _, j ) =>
																	i !== j
															),
														},
														true
													)
												}
											>
												×
											</button>
										</div>
									) ) }
								</div>
								<div className="pp-actions">
									<button
										disabled={ style.colors.length >= 12 }
										onClick={ () => {
											let best = { span: -1, t: 0.5 };
											for (
												let i = 1;
												i < style.colors.length;
												i++
											) {
												const span =
													style.colors[ i ].t -
													style.colors[ i - 1 ].t;
												if ( span > best.span ) {
													best = {
														span,
														t:
															( style.colors[ i ]
																.t +
																style.colors[
																	i - 1
																].t ) /
															2,
													};
												}
											}
											patch(
												{
													colors: [
														...style.colors,
														{
															t: best.t,
															color: penColorAt(
																style.colors,
																best.t
															),
														},
													],
												},
												true
											);
										} }
									>
										{ __( 'Add color', 'wunderpaint' ) }
									</button>
									<button
										disabled={ disabled }
										aria-pressed={ editMode === 'colors' }
										className={
											editMode === 'colors'
												? 'active'
												: ''
										}
										onClick={ () => onEdit( 'colors' ) }
									>
										{ __( 'Drag colors', 'wunderpaint' ) }
									</button>
								</div>
							</>
						) }
					</div>
					{ shapeStyle && (
						<details className="pp-section">
							<summary>
								{ __( 'Calligraphy', 'wunderpaint' ) }
							</summary>
							<Check
								label={ __( 'Use a flat nib', 'wunderpaint' ) }
								checked={ style.nib }
								onChange={ ( v ) => patch( { nib: v }, true ) }
							/>
							{ style.nib && (
								<div className="pp-dials">
									{ dial(
										'nibAngle',
										__( 'Nib angle', 'wunderpaint' ),
										0,
										180,
										1,
										'°'
									) }
									{ dial(
										'nibRoundness',
										__( 'Roundness', 'wunderpaint' ),
										5,
										100,
										1,
										'%'
									) }
								</div>
							) }
						</details>
					) }
					{ shapeStyle && (
						<details className="pp-section">
							<summary>
								{ __( 'Stroke dynamics', 'wunderpaint' ) }
							</summary>
							<Choice
								label={ __( 'Source', 'wunderpaint' ) }
								value={ style.dynamics }
								choices={ [
									[ 'none', __( 'Constant', 'wunderpaint' ) ],
									[
										'pressure',
										__( 'Pen pressure', 'wunderpaint' ),
									],
									[
										'speed',
										__( 'Drawing speed', 'wunderpaint' ),
									],
								] }
								onChange={ ( v ) =>
									patch( { dynamics: v }, true )
								}
							/>
							{ style.dynamics !== 'none' && (
								<>
									<div className="pp-dials">
										{ dial(
											'motionStrength',
											__( 'Strength', 'wunderpaint' ),
											0,
											100,
											1,
											'%'
										) }
										{ dial(
											'motionMin',
											__(
												'Minimum width',
												'wunderpaint'
											),
											1,
											100,
											1,
											'%'
										) }
									</div>
									<p className="pp-hint">
										{ __(
											'Recorded while drawing freehand.',
											'wunderpaint'
										) }
									</p>
								</>
							) }
						</details>
					) }
					{ [ 'dashed', 'dotted' ].includes( style.kind ) && (
						<Check
							label={ __( 'Fit pattern to path', 'wunderpaint' ) }
							checked={ style.patternFit }
							onChange={ ( v ) =>
								patch( { patternFit: v }, true )
							}
						/>
					) }
				</>
			) }
			{ tab === 'ends' && shapeStyle && (
				<details className="pp-section" open>
					<summary>
						{ __( 'Visible section', 'wunderpaint' ) }
					</summary>
					<div className="pp-dials">
						{ dial(
							'trimStart',
							__( 'From', 'wunderpaint' ),
							0,
							style.trimEnd - 0.1,
							0.1,
							'%'
						) }
						{ dial(
							'trimEnd',
							__( 'To', 'wunderpaint' ),
							style.trimStart + 0.1,
							100,
							0.1,
							'%'
						) }
					</div>
					<div className="pp-actions">
						<button
							disabled={ disabled }
							aria-pressed={ editMode === 'trim' }
							className={ editMode === 'trim' ? 'active' : '' }
							onClick={ () => onEdit( 'trim' ) }
						>
							{ __( 'Trim path', 'wunderpaint' ) }
						</button>
						<button
							disabled={
								style.trimStart === 0 && style.trimEnd === 100
							}
							onClick={ () =>
								patch( { trimStart: 0, trimEnd: 100 }, true )
							}
						>
							{ __( 'Show entire path', 'wunderpaint' ) }
						</button>
					</div>
				</details>
			) }
			{ tab === 'points' && (
				<>
					<details className="pp-section">
						<summary>{ __( 'Symmetry', 'wunderpaint' ) }</summary>
						<Choice
							label={ __( 'Mirror', 'wunderpaint' ) }
							value={ style.symmetry }
							choices={ [
								[ 'off', __( 'Off', 'wunderpaint' ) ],
								[ 'vertical', __( 'Vertical', 'wunderpaint' ) ],
								[
									'horizontal',
									__( 'Horizontal', 'wunderpaint' ),
								],
								[ 'both', __( 'Both axes', 'wunderpaint' ) ],
								[ 'radial', __( 'Radial', 'wunderpaint' ) ],
								[
									'kaleido',
									__( 'Kaleidoscope', 'wunderpaint' ),
								],
							] }
							onChange={ ( v ) => {
								const box = layer
									? { w: layer.penPath.w, h: layer.penPath.h }
									: { w: doc.w, h: doc.h };
								// Radial modes turn around the middle of
								// the path (or of the document while drawing).
								patch(
									{
										symmetry: v,
										symmetryAxis:
											( v === 'vertical'
												? box.w
												: box.h ) / 2,
										symmetryX: box.w / 2,
										symmetryY: box.h / 2,
									},
									true
								);
							} }
						/>
						{ [ 'vertical', 'horizontal' ].includes(
							style.symmetry
						) &&
							dial(
								'symmetryAxis',
								__( 'Axis position', 'wunderpaint' ),
								-( layer
									? layer.penPath[
											style.symmetry === 'vertical'
												? 'w'
												: 'h'
									  ]
									: doc[
											style.symmetry === 'vertical'
												? 'w'
												: 'h'
									  ] ),
								2 *
									( layer
										? layer.penPath[
												style.symmetry === 'vertical'
													? 'w'
													: 'h'
										  ]
										: doc[
												style.symmetry === 'vertical'
													? 'w'
													: 'h'
										  ] ),
								1,
								' px'
							) }
						{ [ 'radial', 'kaleido' ].includes( style.symmetry ) &&
							dial(
								'symmetryCount',
								__( 'Copies', 'wunderpaint' ),
								2,
								16
							) }
						{ [ 'both', 'radial', 'kaleido' ].includes(
							style.symmetry
						) && (
							<>
								{ dial(
									'symmetryX',
									__( 'Center X', 'wunderpaint' ),
									-( layer ? layer.penPath.w : doc.w ),
									2 * ( layer ? layer.penPath.w : doc.w ),
									1,
									' px'
								) }
								{ dial(
									'symmetryY',
									__( 'Center Y', 'wunderpaint' ),
									-( layer ? layer.penPath.h : doc.h ),
									2 * ( layer ? layer.penPath.h : doc.h ),
									1,
									' px'
								) }
							</>
						) }
					</details>
					<Check
						label={ __( 'Preview next curve', 'wunderpaint' ) }
						checked={ opts.preview !== false }
						onChange={ ( v ) => setOpt( 'preview', v ) }
					/>
					{ editMode === 'sculpt' && (
						<div className="pp-section">
							<Choice
								label={ __( 'Sculpt', 'wunderpaint' ) }
								value={ opts.sculptMode || 'push' }
								choices={ [
									[ 'push', __( 'Push', 'wunderpaint' ) ],
									[
										'inflate',
										__( 'Expand', 'wunderpaint' ),
									],
									[
										'pinch',
										__( 'Contract', 'wunderpaint' ),
									],
								] }
								onChange={ ( v ) => setOpt( 'sculptMode', v ) }
							/>
							<div className="pp-dials">
								<Dial
									label={ __( 'Radius', 'wunderpaint' ) }
									value={ opts.sculptRadius ?? 70 }
									min={ 12 }
									max={ 180 }
									suffix=" px"
									onChange={ ( v ) =>
										setOpt( 'sculptRadius', v )
									}
								/>
								<Dial
									label={ __( 'Strength', 'wunderpaint' ) }
									value={ opts.sculptStrength ?? 70 }
									onChange={ ( v ) =>
										setOpt( 'sculptStrength', v )
									}
								/>
							</div>
						</div>
					) }
				</>
			) }
		</>
	);
}
