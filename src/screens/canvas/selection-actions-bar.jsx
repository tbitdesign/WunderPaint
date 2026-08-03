/**
 * Floating next-step bar for plain selections (v1.365.0): after a
 * marquee or lasso the marching ants just sat there - this bar names
 * what a selection is FOR and offers the next step in one click. Smart
 * Select keeps its own refine card; this covers every other source.
 */

import { __ } from '@wordpress/i18n';

import { I } from '../../icons';
import * as Ops from '../../store/ops';

export function SelectionActionsBar( { editor, extras } ) {
	const hasActive = !! editor.state.activeId;
	const actions = [
		{
			icon: 'layers',
			label: __( 'Layer via Copy', 'wunderpaint' ),
			run: () => Ops.layerViaCopyOp( editor ),
			when: hasActive,
		},
		{
			icon: 'bucket',
			label: __( 'Fill', 'wunderpaint' ),
			run: () => Ops.fillSelectionOp( editor ),
			when: true,
		},
		{
			icon: null,
			label: __( 'Feather', 'wunderpaint' ),
			run: () => Ops.featherSelectionOp( editor, extras ),
			when: true,
		},
		{
			icon: 'swap',
			label: __( 'Inverse', 'wunderpaint' ),
			run: () => Ops.inverseSelectionOp( editor ),
			when: true,
		},
	];
	return (
		<div
			className="sel-actions"
			role="toolbar"
			aria-label={ __( 'Selection actions', 'wunderpaint' ) }
			onPointerDown={ ( e ) => e.stopPropagation() }
			onMouseDown={ ( e ) => e.stopPropagation() }
			onDoubleClick={ ( e ) => e.stopPropagation() }
		>
			{ actions
				.filter( ( a ) => a.when )
				.map( ( a ) => (
					<button
						key={ a.label }
						className="sel-actions-btn"
						onClick={ a.run }
					>
						{ a.icon && I[ a.icon ]
							? I[ a.icon ]( { size: 13 } )
							: null }
						{ a.label }
					</button>
				) ) }
			<button
				className="sel-actions-btn sel-actions-close"
				title={ __( 'Deselect', 'wunderpaint' ) }
				aria-label={ __( 'Deselect', 'wunderpaint' ) }
				onClick={ () => Ops.deselectOp( editor ) }
			>
				{ I.close ? I.close( { size: 13 } ) : '✕' }
			</button>
		</div>
	);
}
