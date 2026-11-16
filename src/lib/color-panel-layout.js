import { layerPaint } from './layer-paint';

/** Presentation only: all views keep the same color binding and edit operations. */
export function colorEditorPresentation(
	binding,
	{ fullVisible = false, modal = false } = {}
) {
	if ( fullVisible && ! modal ) {
		return 'panel';
	}
	const paint = binding.layer
		? layerPaint( binding.layer, binding.side )
		: binding.paint;
	return binding.ramp || [ 'gradient', 'pattern' ].includes( paint?.type )
		? 'panel'
		: 'picker';
}

/** Shared UI transition for the tab, swatches, gradient tool and legacy callers. */
export function colorPanelState( state, action = {} ) {
	const show = action.show ?? ! state.showColorPanel;
	const mode = action.mode || 'panel';
	return {
		showColorPanel: show,
		colorPanelMode: mode,
		rightTab: action.preserveTab
			? state.rightTab
			: show && mode === 'panel' && ! state.colorPanelDetached
			? 'color'
			: ! show && state.rightTab === 'color'
			? 'layers'
			: state.rightTab,
		colorPanelReveal: ( state.colorPanelReveal || 0 ) + ( show ? 1 : 0 ),
		colorPanelCommand:
			( state.colorPanelCommand || 0 ) +
			( show && ! action.fromSwatch ? 1 : 0 ),
	};
}
