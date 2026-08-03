/**
 * React hooks over the lazy content packs (v1.16). Each returns its pack
 * once the chunk resolves, an empty array until then, and starts the
 * fetch on first mount. Because each library section calls only the hook
 * it needs, opening (say) the gradient picker pulls the gradients chunk
 * and nothing else.
 */

import { useState, useEffect } from '@wordpress/element';

import {
	loadTemplates,
	loadCombos,
	loadElements,
	loadGradients,
	getTemplates,
	getCombos,
	getElements,
	getGradients,
} from './index';

// Stable empty reference so consumers can useMemo/deps on it safely.
const EMPTY = [];

const useLazyPack = ( loader, peek ) => {
	// Lazy init: reuse an already-resolved pack so re-mounts don't flash empty.
	const [ pack, setPack ] = useState( peek );
	useEffect( () => {
		if ( pack ) {
			return undefined;
		}
		let live = true;
		loader().then( ( resolved ) => {
			if ( live ) {
				setPack( resolved );
			}
		} );
		return () => {
			live = false;
		};
	}, [ pack, loader ] );
	return pack || EMPTY;
};

export const useTemplates = () => useLazyPack( loadTemplates, getTemplates );
export const useCombos = () => useLazyPack( loadCombos, getCombos );
export const useElements = () => useLazyPack( loadElements, getElements );
export const useGradients = () => useLazyPack( loadGradients, getGradients );
