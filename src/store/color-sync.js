import { syncColorLinks } from '../lib/color-links';
import { previewLayers } from '../lib/color-replace';

/** Preview state never enters document layers, history, clipboard or exports. */
export function withColorSync( reducer ) {
	return ( state, action ) => {
		if ( action.type === 'SET_COLOR_PREVIEW' ) {
			if (
				action.baseLayers !== state.layers ||
				action.baseDoc !== state.doc ||
				( action.scope === 'effects' &&
					( action.baseState?.activeId !== state.activeId ||
						action.baseState?.selectedIds !== state.selectedIds ||
						action.baseState?.tool !== state.tool ||
						action.baseState?.history !== state.history ||
						action.baseState?.rightTab !== state.rightTab ) )
			) {
				return state;
			}
			const patches = action.patches || new Map();
			return {
				...state,
				colorPreview: {
					owner: action.owner,
					scope: action.scope || 'color',
					layers: syncColorLinks(
						previewLayers( state.layers, patches )
					),
					doc: action.doc
						? { ...state.doc, ...action.doc }
						: state.doc,
				},
			};
		}
		if ( action.type === 'CLEAR_COLOR_PREVIEW' ) {
			return state.colorPreview &&
				( ! action.owner || state.colorPreview.owner === action.owner )
				? { ...state, colorPreview: null }
				: state;
		}
		let next = reducer( state, action );
		if ( next.layers !== state.layers ) {
			const layers = syncColorLinks( next.layers );
			if ( layers !== next.layers ) {
				next = { ...next, layers };
			}
		}
		if (
			next.colorPreview &&
			( next.layers !== state.layers ||
				next.doc !== state.doc ||
				next.activeId !== state.activeId ||
				next.selectedIds !== state.selectedIds ||
				next.tool !== state.tool ||
				( next.colorPreview.scope === 'color' &&
					! next.showColorPanel ) ||
				( next.colorPreview.scope === 'effects' &&
					next.rightTab !== state.rightTab ) ||
				action.type === 'COMMIT' ||
				action.type === 'UNDO' ||
				action.type === 'REDO' )
		) {
			next = { ...next, colorPreview: null };
		}
		return next;
	};
}
