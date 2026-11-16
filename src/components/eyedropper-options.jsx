import { __, _x } from '@wordpress/i18n';
import { canPickScreenColor } from '../lib/screen-color-picker';
import { beginColorPick } from '../lib/color-pick-session';

/** Canvas samples stay editable; screen capture is a separate, explicit action. */
export function EyedropperOptions( {
	editor,
	compact = false,
	disabled = false,
	children,
	keepTarget = false,
	onScreen,
	screenOnly = false,
} ) {
	const opts = editor.state.toolOpts.eyedropper || {};
	return (
		<div
			className={
				compact ? 'eyedropper-options is-compact' : 'eyedropper-options'
			}
		>
			{ ! screenOnly && (
				<div className="eyedropper-sample">
					<span>{ __( 'Sample', 'wunderpaint' ) }</span>
					<div
						className={ compact ? 'seg' : 'dsm-seg' }
						role="group"
						aria-label={ __( 'Sample size', 'wunderpaint' ) }
					>
						{ [
							[ 1, _x( 'Point', 'color sample', 'wunderpaint' ) ],
							[ 3, '3×3' ],
							[ 5, '5×5' ],
						].map( ( [ n, label ] ) => (
							<button
								key={ n }
								type="button"
								className={
									n === ( opts.sample || 1 ) ? 'active' : ''
								}
								aria-pressed={ n === ( opts.sample || 1 ) }
								onClick={ () =>
									editor.dispatch( {
										type: 'SET_TOOL_OPTS',
										tool: 'eyedropper',
										patch: { sample: n },
									} )
								}
							>
								{ label }
							</button>
						) ) }
					</div>
				</div>
			) }
			{ ! screenOnly && children }
			{ canPickScreenColor() && (
				<button
					type="button"
					className="ai-btn secondary sm eyedropper-screen"
					disabled={ disabled }
					onClick={ ( event ) =>
						(
							onScreen ||
							( ( options ) => beginColorPick( editor, options ) )
						)( {
							keepTarget,
							screen: true,
							background: event.altKey,
						} )
					}
				>
					{ __( 'Pick on screen', 'wunderpaint' ) }
				</button>
			) }
		</div>
	);
}
