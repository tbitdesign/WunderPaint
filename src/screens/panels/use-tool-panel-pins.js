import { useEffect, useLayoutEffect, useState } from '@wordpress/element';

import { clampFloat } from '../../lib/panel-floats';

const PAINT_TOOLS = [ 'brush', 'pencil', 'eraser' ];
const SELECTION_TOOLS = [ 'marquee', 'lasso', 'wand', 'smartselect' ];

/** Pins belong to this open editor; closing a panel also releases its pin. */
export function useToolPanelPins( tool, positions, easyMode = false ) {
	// The toolbar can be one or two columns wide. Keep the existing 36 px
	// gap to its measured right edge, including saved old x=96 positions.
	// This is a display offset, like pin staggering, not a storage rewrite.
	const [ toolbarRight, setToolbarRight ] = useState( 60 );
	useLayoutEffect( () => {
		// Easy and full mode mount different toolbar nodes. Reattach on a mode change.
		const rail = document.querySelector( '#wpie-root .ed-toolbar' );
		if ( ! rail ) {
			return undefined;
		}
		const read = () => {
			const rect = rail.getBoundingClientRect();
			setToolbarRight( rect.width ? Math.round( rect.right ) : 0 );
		};
		read();
		const observer = window.ResizeObserver
			? new window.ResizeObserver( read )
			: null;
		observer?.observe( rail );
		const editorRoot = rail.closest( '.editor-root' );
		if ( editorRoot ) {
			observer?.observe( editorRoot );
		}
		window.addEventListener( 'resize', read );
		return () => {
			observer?.disconnect();
			window.removeEventListener( 'resize', read );
		};
	}, [ easyMode ] );
	const [ pins, setPins ] = useState( {} );
	const [ front, setFront ] = useState( '' );
	const [ lastPaintTool, setLastPaintTool ] = useState(
		PAINT_TOOLS.includes( tool ) ? tool : 'brush'
	);
	const currentPanel = PAINT_TOOLS.includes( tool )
		? 'brush'
		: SELECTION_TOOLS.includes( tool )
		? 'selection'
		: [ 'eyedropper', 'gradient' ].includes( tool )
		? 'color'
		: tool;
	useEffect( () => {
		setFront( currentPanel );
		if ( PAINT_TOOLS.includes( tool ) ) {
			setLastPaintTool( tool );
		}
	}, [ tool, currentPanel ] );

	const unpin = ( id ) =>
		setPins( ( previous ) => {
			const next = { ...previous };
			delete next[ id ];
			return next;
		} );
	const toggle = ( id ) =>
		setPins( ( previous ) => {
			const next = { ...previous };
			if ( next[ id ] ) {
				delete next[ id ];
			} else {
				next[ id ] = true;
			}
			return next;
		} );

	// Stagger coincident headers only around pinned panels. These display
	// offsets are not saved; the existing onMove still saves actual drags.
	const clearIds = Object.keys( positions ).filter(
		( id ) => positions[ id ]?.keepClear
	);
	const order = [
		...clearIds,
		...Object.keys( pins ).filter( ( id ) => ! clearIds.includes( id ) ),
		...Object.keys( positions ).filter(
			( id ) => ! pins[ id ] && ! clearIds.includes( id )
		),
	];
	const layout = {};
	const blockers = [];
	for ( const id of order ) {
		// The Color panel owns its resizable right-side position itself.
		if ( ! positions[ id ] ) {
			continue;
		}
		const { pos, width, height = 480, keepClear } = positions[ id ];
		let at = clampFloat( {
			...pos,
			x: Math.max( pos.x, toolbarRight + 36 ),
		} );
		for ( let pass = 0; pass < blockers.length; pass++ ) {
			const hit = blockers.find(
				( other ) =>
					at.x < other.x + other.width &&
					at.x + width > other.x &&
					( other.keepClear
						? at.y < other.y + other.height &&
						  at.y + height > other.y
						: Math.abs( at.y - other.y ) < 42 )
			);
			if ( ! hit ) {
				break;
			}
			// A theme is a launcher: leave its cards accessible beside the
			// settings it opens. On small screens use the usual header stagger.
			const beside = hit.x + hit.width + 12;
			at = clampFloat(
				hit.keepClear && beside + width <= window.innerWidth - 12
					? { x: beside, y: at.y }
					: { x: hit.x + 36, y: hit.y + 42 }
			);
		}
		layout[ id ] = at;
		if ( pins[ id ] || keepClear ) {
			blockers.push( { ...at, width, height, keepClear } );
		}
	}

	return {
		pins,
		unpin,
		brushTool: PAINT_TOOLS.includes( tool ) ? tool : lastPaintTool,
		panelProps: ( id ) => ( {
			pinned: !! pins[ id ],
			onPin: () => toggle( id ),
			onFront: () => setFront( id ),
			zIndex: front === id ? 91 : 90,
			pos: layout[ id ],
		} ),
	};
}
