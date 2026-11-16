import { useCallback, useState } from '@wordpress/element';
import { loadFloats, saveFloats, clampFloat } from '../../lib/panel-floats';

export function useToolPanelPosition( name ) {
	const [ pos, setPos ] = useState( () =>
		clampFloat( loadFloats()[ name ] || { x: 96, y: 120 } )
	);
	const move = useCallback(
		( value ) => {
			const at = clampFloat( value );
			setPos( at );
			saveFloats( { ...loadFloats(), [ name ]: at } );
		},
		[ name ]
	);
	return [ pos, move ];
}
