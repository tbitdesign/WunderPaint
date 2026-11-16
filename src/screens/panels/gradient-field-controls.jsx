import { useId } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import {
	addFreeformPoint,
	resampleGradientMesh,
} from '../../lib/gradient-fields';
import { GradientDial } from './gradient-controls';

export function GradientFieldControls( {
	colorControls,
	paint,
	index,
	onSelect,
	update,
	finish,
} ) {
	const controlId = useId();
	const mesh = paint.kind === 'mesh',
		field = mesh ? paint.mesh : paint.freeform;
	const key = mesh ? 'mesh' : 'freeform',
		itemsKey = mesh ? 'nodes' : 'points';
	const items = field[ itemsKey ],
		selected = Math.max( 0, Math.min( items.length - 1, index ) ),
		point = items[ selected ];
	const change = ( patch, done = false ) =>
		update( { [ key ]: { ...field, ...patch } }, done );
	const pointChange = ( patch, done = false ) =>
		change(
			{
				[ itemsKey ]: items.map( ( p, i ) =>
					i === selected ? { ...p, ...patch } : p
				),
			},
			done
		);
	return (
		<>
			{ ! mesh && (
				<div
					className="gp-points"
					style={
						mesh
							? {
									gridTemplateColumns: `repeat(${ field.cols }, 1fr)`,
							  }
							: undefined
					}
				>
					{ items.map( ( p, i ) => (
						<button
							type="button"
							key={ i }
							aria-pressed={ i === selected }
							aria-label={ sprintf(
								/* translators: %d: point number. */ __(
									'Color point %d',
									'wunderpaint'
								),
								i + 1
							) }
							onClick={ () => onSelect( i ) }
						>
							<span style={ { background: p.color } } />
							{ i + 1 }
						</button>
					) ) }
				</div>
			) }
			<div className="gp-stop-color">
				{ mesh ? (
					<select
						aria-label={ __( 'Point color', 'wunderpaint' ) }
						value={ selected }
						onChange={ ( e ) => onSelect( +e.target.value ) }
					>
						{ items.map( ( _, i ) => (
							<option value={ i } key={ i }>
								{ sprintf(
									/* translators: %d: point number. */ __(
										'Color point %d',
										'wunderpaint'
									),
									i + 1
								) }
							</option>
						) ) }
					</select>
				) : (
					<span>{ __( 'Point color', 'wunderpaint' ) }</span>
				) }
			</div>
			{ ! mesh && (
				<div className="gp-stop-actions">
					<button
						type="button"
						disabled={ items.length >= 24 }
						onClick={ () => {
							update(
								{ freeform: addFreeformPoint( field ) },
								true
							);
							onSelect( items.length );
						} }
					>
						{ __( 'Add point', 'wunderpaint' ) }
					</button>
					<button
						type="button"
						disabled={ items.length <= 2 }
						onClick={ () => {
							change(
								{
									points: items.filter(
										( _, i ) => i !== selected
									),
								},
								true
							);
							onSelect( Math.max( 0, selected - 1 ) );
						} }
					>
						{ __( 'Remove point', 'wunderpaint' ) }
					</button>
				</div>
			) }
			{ colorControls }
			<details className="color-editor-details gp-field-adjustments">
				<summary>{ __( 'Gradient settings', 'wunderpaint' ) }</summary>
				<div className="color-section-content">
					<div className="gp-dials">
						<GradientDial
							label={ __( 'Position X', 'wunderpaint' ) }
							value={ point.x * 100 }
							onChange={ ( x ) => pointChange( { x: x / 100 } ) }
							onCommit={ finish }
						/>
						<GradientDial
							label={ __( 'Position Y', 'wunderpaint' ) }
							value={ point.y * 100 }
							onChange={ ( y ) => pointChange( { y: y / 100 } ) }
							onCommit={ finish }
						/>

						{ ! mesh && (
							<>
								<GradientDial
									label={ __( 'Influence', 'wunderpaint' ) }
									value={ point.radius * 100 }
									min={ 5 }
									max={ 200 }
									onChange={ ( r ) =>
										pointChange( { radius: r / 100 } )
									}
									onCommit={ finish }
								/>
								<GradientDial
									label={ __( 'Softness', 'wunderpaint' ) }
									value={ field.softness * 100 }
									min={ 10 }
									onChange={ ( softness ) =>
										change( { softness: softness / 100 } )
									}
									onCommit={ finish }
								/>
							</>
						) }
					</div>
					{ mesh ? (
						<>
							<div className="gp-dials">
								{ [
									[ 'rows', __( 'Rows', 'wunderpaint' ) ],
									[ 'cols', __( 'Columns', 'wunderpaint' ) ],
								].map( ( [ property, label ] ) => (
									<label
										className="gp-select"
										key={ property }
										htmlFor={ `${ controlId }-${ property }` }
									>
										{ label }
										<select
											id={ `${ controlId }-${ property }` }
											aria-label={ label }
											value={ field[ property ] }
											onChange={ ( e ) => {
												const next = {
													...field,
													[ property ]:
														+e.target.value,
												};
												update(
													{
														mesh: resampleGradientMesh(
															field,
															next.rows,
															next.cols
														),
													},
													true
												);
												onSelect( 0 );
											} }
										>
											{ [ 2, 3, 4, 5, 6 ].map( ( n ) => (
												<option key={ n } value={ n }>
													{ n }
												</option>
											) ) }
										</select>
									</label>
								) ) }
							</div>
							<div className="gp-stop-actions">
								<button
									type="button"
									onClick={ () =>
										pointChange(
											{
												u: {
													x: 1 / ( field.cols - 1 ),
													y: 0,
												},
												v: {
													x: 0,
													y: 1 / ( field.rows - 1 ),
												},
											},
											true
										)
									}
								>
									{ __( 'Reset handles', 'wunderpaint' ) }
								</button>
							</div>
							<p className="gp-hint">
								{ __(
									'Drag a mesh point to reshape the surface. Drag its handles to bend the grid.',
									'wunderpaint'
								) }
							</p>
						</>
					) : (
						<>
							<p className="gp-hint">
								{ __(
									'Drag color points on the canvas. Double-click with the Gradient tool to add a point.',
									'wunderpaint'
								) }
							</p>
						</>
					) }
				</div>
			</details>
		</>
	);
}
