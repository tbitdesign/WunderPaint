import { useId, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { parseColor } from '../../lib/color';
import { contrastRatio } from '../../lib/contrast-check';

const ratioOf = ( text, background ) =>
	contrastRatio( parseColor( text ), parseColor( background ) );

/** Compare opaque palette colors. This does not audit or modify document text. */
export function ContrastMatrix( { colors } ) {
	const [ chosen, setChosen ] = useState( null );
	const [ minimum, setMinimum ] = useState( 4.5 );
	const minimumId = useId();
	const swatches = [ ...new Set( [ ...colors, '#ffffff', '#000000' ] ) ];
	const background = colors[ 0 ] || '#ffffff';
	const fallback = [
		ratioOf( '#000000', background ) >= ratioOf( '#ffffff', background )
			? '#000000'
			: '#ffffff',
		background,
	];
	const pair = chosen?.every( ( c ) => swatches.includes( c ) )
		? chosen
		: fallback;
	const ratio = ratioOf( ...pair );
	const pairLabel = ( text, ground, value ) =>
		sprintf(
			/* translators: 1: text hex color, 2: background hex color, 3: contrast ratio. */
			__( 'Text %1$s on %2$s: %3$s:1', 'wunderpaint' ),
			text,
			ground,
			( Math.floor( value * 100 ) / 100 ).toFixed( 2 )
		);
	return (
		<section className="csd-contrast">
			<div className="csd-scale-heading">
				<span className="csd-stage-title">
					{ __( 'Contrast', 'wunderpaint' ) }
				</span>
				<label className="csd-contrast-minimum" htmlFor={ minimumId }>
					<span className="dsm-label">
						{ __( 'Minimum contrast', 'wunderpaint' ) }
					</span>
					<select
						id={ minimumId }
						className="dsm-select"
						value={ minimum }
						onChange={ ( e ) => setMinimum( +e.target.value ) }
					>
						<option value={ 4.5 }>
							{ __( 'Normal text (4.5:1)', 'wunderpaint' ) }
						</option>
						<option value={ 3 }>
							{ __( 'Large text (3:1)', 'wunderpaint' ) }
						</option>
						<option value={ 7 }>
							{ __( 'Enhanced contrast (7:1)', 'wunderpaint' ) }
						</option>
					</select>
				</label>
			</div>
			<p className="csd-note">
				{ __(
					'Choose a text and background pair. Colored cells meet the selected contrast.',
					'wunderpaint'
				) }
			</p>
			<div className="csd-contrast-scroll">
				<table className="csd-contrast-table">
					<caption>
						{ __(
							'Text in rows, background in columns. White and black are included.',
							'wunderpaint'
						) }
					</caption>
					<thead>
						<tr>
							<th
								scope="col"
								aria-label={ __(
									'Text / Background',
									'wunderpaint'
								) }
							/>
							{ swatches.map( ( color ) => (
								<th
									scope="col"
									key={ color }
									aria-label={ color }
								>
									<span
										className="csd-contrast-key"
										style={ { background: color } }
										title={ color }
									></span>
								</th>
							) ) }
						</tr>
					</thead>
					<tbody>
						{ swatches.map( ( text ) => (
							<tr key={ text }>
								<th scope="row" aria-label={ text }>
									<span
										className="csd-contrast-key"
										style={ { background: text } }
										title={ text }
									></span>
								</th>
								{ swatches.map( ( ground ) => {
									const value = ratioOf( text, ground );
									const pass = value >= minimum;
									const selected =
										text === pair[ 0 ] &&
										ground === pair[ 1 ];
									return (
										<td key={ ground }>
											<button
												type="button"
												className={ `csd-contrast-cell${
													selected
														? ' is-selected'
														: ''
												}` }
												style={
													pass
														? {
																color: text,
																background:
																	ground,
														  }
														: undefined
												}
												aria-pressed={ selected }
												aria-label={ pairLabel(
													text,
													ground,
													value
												) }
												title={ pairLabel(
													text,
													ground,
													value
												) }
												onClick={ () =>
													setChosen( [
														text,
														ground,
													] )
												}
											>
												{ (
													Math.floor( value * 10 ) /
													10
												).toFixed( 1 ) }
											</button>
										</td>
									);
								} ) }
							</tr>
						) ) }
					</tbody>
				</table>
			</div>
			<div
				className="csd-contrast-sample"
				style={ { color: pair[ 0 ], background: pair[ 1 ] } }
			>
				<strong>{ __( 'Color in context', 'wunderpaint' ) }</strong>
				<p>
					{ __(
						'A short line of text to compare readability.',
						'wunderpaint'
					) }
				</p>
			</div>
			<p className="csd-note csd-contrast-result" aria-live="polite">
				<span>{ pairLabel( ...pair, ratio ) }</span>
				<span>
					{ ratio >= minimum
						? __( 'Meets selected contrast', 'wunderpaint' )
						: __( 'Below selected contrast', 'wunderpaint' ) }
				</span>
			</p>
		</section>
	);
}
