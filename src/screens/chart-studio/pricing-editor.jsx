/**
 * Pricing tier editor (v1.269.0, moved verbatim from chart-dialog.jsx):
 * accordion list of tiers with name/price/period, one feature per line,
 * optional CTA and a featured flag.
 */

import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

export function PricingEditor( { tiers, setTiers, input } ) {
	const patch = ( i, p ) =>
		setTiers( tiers.map( ( t, j ) => ( j === i ? { ...t, ...p } : t ) ) );
	const remove = ( i ) => setTiers( tiers.filter( ( _, j ) => j !== i ) );
	const add = () =>
		setTiers( [
			...tiers,
			{
				name: __( 'New tier', 'wunderpaint' ),
				price: '€0',
				period: __( 'per month', 'wunderpaint' ),
				features: __( 'Feature', 'wunderpaint' ),
				highlight: false,
				cta: __( 'Choose', 'wunderpaint' ),
			},
		] );
	const [ open, setOpen ] = useState( 0 );
	const row = { ...input, flex: 1, minWidth: 0 };
	return (
		<div style={ { display: 'grid', gap: 6 } }>
			<span className="dsm-label">{ __( 'Tiers', 'wunderpaint' ) }</span>
			{ tiers.map( ( t, i ) => (
				<div
					key={ i }
					style={ {
						border: '1px solid var(--ed-border-strong)',
						borderRadius: 6,
						overflow: 'hidden',
					} }
				>
					<div
						role="button"
						tabIndex={ 0 }
						onClick={ () => setOpen( open === i ? -1 : i ) }
						onKeyDown={ ( e ) =>
							'Enter' === e.key && setOpen( open === i ? -1 : i )
						}
						style={ {
							display: 'flex',
							alignItems: 'center',
							gap: 8,
							padding: '6px 8px',
							cursor: 'pointer',
							background: 'var(--ed-panel-alt)',
							fontSize: 12,
						} }
					>
						<span
							style={ {
								color: 'var(--ed-text-muted)',
								transform:
									open === i ? 'rotate(90deg)' : 'none',
								transition: 'transform .12s',
							} }
						>
							▸
						</span>
						<strong
							style={ {
								flex: 1,
								overflow: 'hidden',
								whiteSpace: 'nowrap',
								textOverflow: 'ellipsis',
							} }
						>
							{ t.name || __( 'Tier', 'wunderpaint' ) }
						</strong>
						<span style={ { color: 'var(--ed-text-muted)' } }>
							{ t.price }
						</span>
						{ t.highlight && (
							<span
								style={ {
									fontSize: 10,
									color: 'var(--accent)',
								} }
							>
								★
							</span>
						) }
						<button
							className="ai-btn secondary"
							style={ { padding: '1px 8px' } }
							disabled={ tiers.length <= 1 }
							onClick={ ( e ) => {
								e.stopPropagation();
								remove( i );
								setOpen( 0 );
							} }
						>
							−
						</button>
					</div>
					{ open === i && (
						<div style={ { display: 'grid', gap: 6, padding: 8 } }>
							<div style={ { display: 'flex', gap: 6 } }>
								<input
									type="text"
									style={ { ...row, flex: 2 } }
									value={ t.name }
									placeholder={ __( 'Name', 'wunderpaint' ) }
									onChange={ ( e ) =>
										patch( i, { name: e.target.value } )
									}
								/>
								<input
									type="text"
									style={ row }
									value={ t.price }
									placeholder={ __( 'Price', 'wunderpaint' ) }
									onChange={ ( e ) =>
										patch( i, { price: e.target.value } )
									}
								/>
								<input
									type="text"
									style={ row }
									value={ t.period }
									placeholder={ __(
										'Period',
										'wunderpaint'
									) }
									onChange={ ( e ) =>
										patch( i, { period: e.target.value } )
									}
								/>
							</div>
							<textarea
								rows={ 3 }
								spellCheck={ false }
								style={ {
									...input,
									resize: 'vertical',
									fontFamily: 'var(--font-mono)',
								} }
								value={ t.features }
								placeholder={ __(
									'One feature per line',
									'wunderpaint'
								) }
								onChange={ ( e ) =>
									patch( i, { features: e.target.value } )
								}
							/>
							<div
								style={ {
									display: 'flex',
									gap: 8,
									alignItems: 'center',
								} }
							>
								<input
									type="text"
									style={ row }
									value={ t.cta }
									placeholder={ __(
										'Button (optional)',
										'wunderpaint'
									) }
									onChange={ ( e ) =>
										patch( i, { cta: e.target.value } )
									}
								/>
								<label
									style={ {
										display: 'flex',
										gap: 6,
										alignItems: 'center',
										fontSize: 12,
										whiteSpace: 'nowrap',
									} }
								>
									<input
										type="checkbox"
										checked={ !! t.highlight }
										onChange={ ( e ) =>
											patch( i, {
												highlight: e.target.checked,
											} )
										}
									/>
									{ __( 'Featured', 'wunderpaint' ) }
								</label>
							</div>
						</div>
					) }
				</div>
			) ) }
			<button
				className="ai-btn secondary"
				style={ {
					padding: '4px 10px',
					fontSize: 11,
					justifySelf: 'start',
				} }
				disabled={ tiers.length >= 5 }
				onClick={ () => {
					add();
					setOpen( tiers.length );
				} }
			>
				{ __( 'Add tier', 'wunderpaint' ) }
			</button>
		</div>
	);
}
