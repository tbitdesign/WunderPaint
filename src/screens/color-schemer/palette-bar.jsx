/**
 * The palette itself (Color Schemer, v1.432.0): one bar, one field per
 * color. Click a field to edit its color, drag it sideways to reorder,
 * lock it so harmonies and Random leave it alone, remove it with its x.
 * The plus at the end adds a color until the store's limit.
 */

import { __, sprintf } from '@wordpress/i18n';

import { I } from '../../icons';
import { labelColorFor } from '../../lib/color-scheme';
import { useReorder } from '../../components/use-reorder';

export function PaletteBar( {
	slots,
	max,
	onEdit,
	onToggleLock,
	onRemove,
	onAdd,
	onMove,
} ) {
	const reorder = useReorder( { axis: 'x', onMove } );
	const over = reorder.drag?.over;
	const from = reorder.drag?.from;
	const gapAt = over !== undefined && over !== from && over !== from + 1;

	return (
		<div className="csd-bar" data-reorder-list="">
			{ slots.map( ( slot, i ) => {
				const ink = labelColorFor( slot.color );
				return (
					<div
						key={ i }
						data-reorder-index={ i }
						className={ [
							'csd-slot',
							slot.locked && 'is-locked',
							from === i && 'is-dragging',
							gapAt && over === i && 'is-drop-before',
							gapAt &&
								over === slots.length &&
								i === slots.length - 1 &&
								'is-drop-after',
						]
							.filter( Boolean )
							.join( ' ' ) }
						style={ { background: slot.color, color: ink } }
						onPointerDown={ ( e ) => reorder.start( i, e ) }
					>
						<button
							type="button"
							className="csd-slot-pick"
							aria-label={ sprintf(
								/* translators: 1: position in the palette, 2: hex color. */
								__( 'Color %1$d, %2$s', 'wunderpaint' ),
								i + 1,
								slot.color
							) }
							title={ __(
								'Click to change, drag to move',
								'wunderpaint'
							) }
							onClick={ ( e ) => {
								if ( ! reorder.wasDrag() ) {
									onEdit( i, e.currentTarget );
								}
							} }
						/>
						<button
							type="button"
							className="csd-slot-icon csd-slot-lock"
							aria-pressed={ slot.locked }
							aria-label={
								slot.locked
									? __( 'Unlock color', 'wunderpaint' )
									: __( 'Lock color', 'wunderpaint' )
							}
							title={
								slot.locked
									? __( 'Unlock color', 'wunderpaint' )
									: __(
											'Lock color so harmonies and Random keep it',
											'wunderpaint'
									  )
							}
							onClick={ () => onToggleLock( i ) }
						>
							{ ( slot.locked ? I.lock : I.unlock )( {
								size: 13,
							} ) }
						</button>
						{ slots.length > 1 && (
							<button
								type="button"
								className="csd-slot-icon csd-slot-remove"
								aria-label={ __(
									'Remove color',
									'wunderpaint'
								) }
								title={ __( 'Remove color', 'wunderpaint' ) }
								onClick={ () => onRemove( i ) }
							>
								{ I.close( { size: 12 } ) }
							</button>
						) }
						<span className="csd-slot-hex">{ slot.color }</span>
					</div>
				);
			} ) }
			{ slots.length < max && (
				<button
					type="button"
					className="csd-slot-add"
					aria-label={ __( 'Add color', 'wunderpaint' ) }
					title={ __( 'Add color', 'wunderpaint' ) }
					onClick={ onAdd }
				>
					{ I.plus( { size: 16 } ) }
				</button>
			) }
		</div>
	);
}
