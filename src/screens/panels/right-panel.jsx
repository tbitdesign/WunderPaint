/**
 * Right panel tab host (spec 06): Layers · Props · Adjust · History · AI,
 * plus extension panels (v0.4).
 */

import { __ } from '@wordpress/i18n';
import { useRef, useEffect, useState } from '@wordpress/element';

import { I } from '../../icons';
import { useEditor } from '../../store/editor-context';
import { listExtensionPanels, subscribeExtensions } from '../../lib/extensions';
import { LayersPanel } from './layers-panel';
import { PropertiesPanel } from './properties-panel';
import { AdjustPanel } from './adjust-panel';
import { EffectsPanel } from './effects-panel';
import { HistoryPanel } from './history-panel';
import { AIPanel } from './ai-panel';
import { FloatPanel } from './float-panel';
import { loadFloats, saveFloats, clampFloat } from '../../lib/panel-floats';

const TABS = [
	{ id: 'layers', label: __( 'Layers', 'wunderpaint' ), icon: 'layers' },
	{ id: 'props', label: __( 'Properties', 'wunderpaint' ), icon: 'sliders' },
	{ id: 'adjust', label: __( 'Adjust', 'wunderpaint' ), icon: 'adjust' },
	{ id: 'effects', label: __( 'Effects', 'wunderpaint' ), icon: 'fx' },
	{ id: 'history', label: __( 'History', 'wunderpaint' ), icon: 'history' },
	{ id: 'ai', label: __( 'AI Studio', 'wunderpaint' ), icon: 'sparkles' },
];

/** Framework-free host: extensions render into a plain DOM node. */
function ExtensionPanelHost( { panel, extras } ) {
	const editor = useEditor();
	const ref = useRef( null );
	useEffect( () => {
		const el = ref.current;
		el.innerHTML = '';
		let cleanup;
		try {
			cleanup = panel.render( el, { editor, extras } );
		} catch ( e ) {
			// eslint-disable-next-line no-console
			console.warn( 'WPIE extension panel failed:', panel.id, e );
		}
		return () => {
			if ( 'function' === typeof cleanup ) {
				cleanup();
			}
			el.innerHTML = '';
		};
		// Re-render when the document changes so panels can reflect state.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ panel, editor.state.layers, editor.state.activeId ] );
	return <div ref={ ref } style={ { height: '100%', overflowY: 'auto' } } />;
}

// Panel width (v1.78.6): a CSS variable on the app grid. Longer
// translations (de "Ebenen-Kompositionen", …) overflowed the fixed 312px
// into horizontal scrollbars, so the panel auto-grows to fit its content;
// the left edge stays draggable and the width persists.
const MIN_W = 312;
const MAX_W = 520;

const applyWidth = ( w, persist ) => {
	const clamped = Math.min( MAX_W, Math.max( MIN_W, Math.round( w ) ) );
	document
		.getElementById( 'wpie-root' )
		?.style.setProperty( '--wpie-right-w', clamped + 'px' );
	if ( persist ) {
		try {
			window.localStorage.setItem( 'wpie-right-w', String( clamped ) );
		} catch ( e ) {}
	}
	return clamped;
};

export function RightPanel( { extras } ) {
	const { state, dispatch } = useEditor();
	const [ , setTick ] = useState( 0 );
	useEffect(
		() => subscribeExtensions( () => setTick( ( t ) => t + 1 ) ),
		[]
	);
	const bodyRef = useRef( null );

	useEffect( () => {
		const stored = parseInt(
			window.localStorage?.getItem( 'wpie-right-w' ),
			10
		);
		if ( Number.isFinite( stored ) ) {
			applyWidth( stored, false );
		}
	}, [] );

	// Auto-grow: whenever the current tab's content is wider than the
	// panel, widen just enough that nothing scrolls horizontally.
	useEffect( () => {
		const el = bodyRef.current;
		if ( ! el ) {
			return undefined;
		}
		const id = window.requestAnimationFrame( () => {
			const overflow = el.scrollWidth - el.clientWidth;
			if ( overflow > 1 ) {
				applyWidth(
					el.getBoundingClientRect().width + overflow + 2,
					true
				);
			}
		} );
		return () => window.cancelAnimationFrame( id );
	} );

	const startResize = ( e ) => {
		e.preventDefault();
		const startX = e.clientX;
		const startW =
			e.currentTarget.parentElement.getBoundingClientRect().width;
		let w = startW;
		const move = ( ev ) => {
			w = applyWidth( startW + ( startX - ev.clientX ), false );
		};
		const up = () => {
			window.removeEventListener( 'pointermove', move );
			window.removeEventListener( 'pointerup', up );
			applyWidth( w, true );
		};
		window.addEventListener( 'pointermove', move );
		window.addEventListener( 'pointerup', up );
	};

	// Detached panels (v1.265): a tab can float as its own little window so
	// two panels are usable at once. Floats persist across reloads and only
	// leave via their dock button - never by clicking elsewhere.
	const [ floats, setFloats ] = useState( () => loadFloats() );
	useEffect( () => saveFloats( floats ), [ floats ] );

	const extensionPanels = listExtensionPanels();
	const allTabs = [
		...TABS,
		...extensionPanels.map( ( p ) => ( {
			id: 'ext:' + p.id,
			label: p.title,
			icon: 'sliders',
		} ) ),
	];
	const renderPanel = ( id ) => {
		if ( 'layers' === id ) {
			return <LayersPanel extras={ extras } />;
		}
		if ( 'props' === id ) {
			return <PropertiesPanel extras={ extras } />;
		}
		if ( 'adjust' === id ) {
			return <AdjustPanel extras={ extras } />;
		}
		if ( 'effects' === id ) {
			return <EffectsPanel extras={ extras } />;
		}
		if ( 'history' === id ) {
			return <HistoryPanel extras={ extras } />;
		}
		if ( 'ai' === id ) {
			return <AIPanel extras={ extras } />;
		}
		const ext = extensionPanels.find( ( p ) => id === 'ext:' + p.id );
		return ext ? (
			<ExtensionPanelHost panel={ ext } extras={ extras } />
		) : null;
	};
	const dockBack = ( id ) => {
		setFloats( ( f ) => {
			const next = { ...f };
			delete next[ id ];
			return next;
		} );
		dispatch( { type: 'SET_RIGHT_TAB', tab: id } );
	};
	// Dragging a tab detaches its panel right at the pointer (v1.265.1 -
	// the extra strip row wasted panel height); a plain click keeps its
	// old meaning: switch tab, or dock a floating panel back.
	const tabPointerDown = ( tab ) => ( e ) => {
		if ( 0 !== e.button ) {
			return;
		}
		const startX = e.clientX;
		const startY = e.clientY;
		const wasFloating = !! floats[ tab.id ];
		let dragging = false;
		const place = ( ev ) =>
			setFloats( ( f ) => ( {
				...f,
				[ tab.id ]: clampFloat( {
					x: ev.clientX - 60,
					y: ev.clientY - 14,
				} ),
			} ) );
		const move = ( ev ) => {
			if (
				! dragging &&
				( Math.abs( ev.clientX - startX ) > 8 ||
					Math.abs( ev.clientY - startY ) > 8 )
			) {
				dragging = true;
				if ( ! wasFloating && state.rightTab === tab.id ) {
					const next = allTabs.find(
						( t ) => t.id !== tab.id && ! floats[ t.id ]
					);
					if ( next ) {
						dispatch( { type: 'SET_RIGHT_TAB', tab: next.id } );
					}
				}
			}
			if ( dragging ) {
				place( ev );
			}
		};
		const up = () => {
			window.removeEventListener( 'pointermove', move );
			window.removeEventListener( 'pointerup', up );
			if ( dragging ) {
				return;
			}
			if ( wasFloating ) {
				dockBack( tab.id );
			} else {
				dispatch( { type: 'SET_RIGHT_TAB', tab: tab.id } );
			}
		};
		window.addEventListener( 'pointermove', move );
		window.addEventListener( 'pointerup', up );
	};
	const activeFloating = !! floats[ state.rightTab ];

	return (
		<div className="ed-right">
			<div
				className="ed-right-resize"
				role="presentation"
				title={ __( 'Drag to resize the panel', 'wunderpaint' ) }
				onPointerDown={ startResize }
			/>
			<div className="ed-right-tabs" role="tablist">
				{ allTabs.map( ( tab ) => (
					<button
						key={ tab.id }
						role="tab"
						aria-selected={ state.rightTab === tab.id }
						className={
							( state.rightTab === tab.id ? 'active' : '' ) +
							( floats[ tab.id ] ? ' is-floating' : '' )
						}
						title={
							floats[ tab.id ]
								? __(
										'Floating - click to dock back',
										'wunderpaint'
								  )
								: __(
										'Drag out to float this panel',
										'wunderpaint'
								  )
						}
						{ ...( tab.id.startsWith( 'ext:' )
							? {}
							: { 'data-ws': 'panel.' + tab.id } ) }
						onPointerDown={ tabPointerDown( tab ) }
					>
						{ I[ tab.icon ]( { size: 13 } ) } { tab.label }
					</button>
				) ) }
			</div>
			<div className="ed-right-body" ref={ bodyRef }>
				{ activeFloating ? (
					<div className="ed-right-floatnote">
						{ __(
							'This panel floats in its own window. Click its tab to dock it back.',
							'wunderpaint'
						) }
					</div>
				) : (
					renderPanel( state.rightTab )
				) }
			</div>
			{ Object.entries( floats ).map( ( [ id, pos ] ) => {
				const tab = allTabs.find( ( t ) => t.id === id );
				if ( ! tab ) {
					return null;
				}
				return (
					<FloatPanel
						key={ id }
						title={ tab.label }
						pos={ pos }
						onMove={ ( p ) =>
							setFloats( ( f ) => ( { ...f, [ id ]: p } ) )
						}
						onDock={ () => dockBack( id ) }
						onFront={ () =>
							setFloats( ( f ) => {
								const { [ id ]: me, ...rest } = f;
								return { ...rest, [ id ]: me };
							} )
						}
					>
						{ renderPanel( id ) }
					</FloatPanel>
				);
			} ) }
		</div>
	);
}
