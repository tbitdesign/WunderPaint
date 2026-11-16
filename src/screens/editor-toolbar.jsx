/**
 * Left tool rail + fg/bg color widget (spec 04.3).
 */

import { __ } from '@wordpress/i18n';
import { beginColorPick } from '../lib/color-pick-session';
import { useEffect, useState } from '@wordpress/element';

import { I } from '../icons';
import { TOOLS, TOOLBAR_GROUPS } from '../store/constants';
import { useEditor } from '../store/editor-context';
import { PaintTargets } from '../components/paint-controls';
import { isPaintLayer } from '../lib/layer-paint';
import { useColorEditor } from '../components/use-color-editor';
import { listExtensionTools } from '../lib/extensions';
import { isKeyHidden, subscribeWorkspace } from '../lib/workspace';

const toolById = ( id ) => TOOLS.find( ( t ) => t.id === id );

function FgBgWidget() {
	const { state, dispatch } = useEditor();
	const layer =
		state.selectedIds.length === 1 &&
		state.layers.find( ( l ) => l.id === state.activeId );
	const fillEditor = useColorEditor( {
		layer,
		side: 'fill',
		documentTarget: true,
	} );
	const strokeEditor = useColorEditor( {
		layer,
		side: 'stroke',
		documentTarget: true,
	} );
	const foreground = useColorEditor( {
		color: state.fgColor,
		title: __( 'Foreground', 'wunderpaint' ),
		onChange: ( color ) => dispatch( { type: 'SET_FG', color } ),
	} );
	const background = useColorEditor( {
		color: state.bgColor,
		title: __( 'Background', 'wunderpaint' ),
		onChange: ( color ) => dispatch( { type: 'SET_BG', color } ),
	} );
	if ( isPaintLayer( layer ) ) {
		return (
			<div data-ws="tool.colors">
				<PaintTargets
					compact
					layer={ layer }
					target={ state.paintTarget }
					onSelect={ ( target, event ) =>
						( target === 'stroke'
							? strokeEditor
							: fillEditor
						).show( event.currentTarget )
					}
				/>
			</div>
		);
	}

	return (
		<div
			className="color-block"
			data-ws="tool.colors"
			style={ { padding: '10px 0 6px' } }
		>
			<div
				className="color-fg-bg"
				style={ { margin: '0 auto 4px', width: 40, height: 40 } }
			>
				<button
					className="sw fg"
					style={ {
						background: state.fgColor,
						width: 26,
						height: 26,
					} }
					title={ __( 'Foreground color', 'wunderpaint' ) }
					onClick={ ( event ) =>
						foreground.show( event.currentTarget )
					}
				/>
				<button
					className="sw bg"
					style={ {
						background: state.bgColor,
						width: 26,
						height: 26,
					} }
					title={ __( 'Background color', 'wunderpaint' ) }
					onClick={ ( event ) =>
						background.show( event.currentTarget )
					}
				/>
				<button
					className="swap"
					title={ __( 'Swap colors (X)', 'wunderpaint' ) }
					onClick={ () => dispatch( { type: 'SWAP_COLORS' } ) }
				>
					{ I.swap( { size: 10 } ) }
				</button>
				<button
					title={ __( 'Reset to black/white', 'wunderpaint' ) }
					style={ {
						position: 'absolute',
						left: -4,
						bottom: -2,
						width: 14,
						height: 14,
						display: 'grid',
						placeItems: 'center',
					} }
					onClick={ () => {
						dispatch( { type: 'SET_FG', color: '#000000' } );
						dispatch( { type: 'SET_BG', color: '#ffffff' } );
					} }
				>
					<span
						style={ {
							display: 'inline-block',
							width: 9,
							height: 9,
							background:
								'linear-gradient(135deg,#000 50%,#fff 50%)',
							border: '1px solid var(--ed-border-strong)',
						} }
					/>
				</button>
			</div>
		</div>
	);
}

export function EditorToolbar() {
	const editor = useEditor();
	const { state, dispatch } = editor;
	const [ , setWorkspaceTick ] = useState( 0 );
	useEffect(
		() =>
			subscribeWorkspace( () =>
				setWorkspaceTick( ( tick ) => tick + 1 )
			),
		[]
	);
	const firstVisibleGroup = TOOLBAR_GROUPS.find( ( group ) =>
		group.some( ( id ) => ! isKeyHidden( 'tool.' + id ) )
	);
	const extensionTools = listExtensionTools();

	// Clicking the Text tool drops a ready-to-type, centered text box right
	// away (handled in the canvas) instead of arming a draw-a-box tool - the
	// one-click ease beginners expect. Power users still get the draw/click
	// tool via the T shortcut (v1.179.0).
	const activate = ( id, event ) => {
		if ( 'eyedropper' === id ) {
			beginColorPick( editor, { background: !! event?.altKey } );
			return;
		}
		if ( 'text' === id ) {
			window.dispatchEvent( new CustomEvent( 'wpie-insert-text' ) );
			return;
		}
		dispatch( { type: 'SET_TOOL', tool: id } );
	};

	const [ tip, setTip ] = useState( null ); // {label, x, y}, fixed pos (v1.0.3)
	const showTip = ( label ) => ( e ) => {
		const r = e.currentTarget.getBoundingClientRect();
		const rail = e.currentTarget
			.closest( '.ed-toolbar' )
			.getBoundingClientRect();
		setTip( { label, x: rail.right + 8, y: r.top + r.height / 2 } );
	};
	const hideTip = () => setTip( null );

	return (
		<div className="ed-toolbar">
			{ TOOLBAR_GROUPS.map( ( group, gi ) => (
				<div
					key={ gi }
					className="ed-tool-group"
					data-ws-empty={
						group.every( ( id ) => isKeyHidden( 'tool.' + id ) ) ||
						undefined
					}
					data-ws-first={ group === firstVisibleGroup || undefined }
				>
					{ group.map( ( id ) => {
						const tool = toolById( id );
						const label =
							id === 'eyedropper'
								? `${ __( 'Color panel', 'wunderpaint' ) } / ${
										tool.label
								  } (${ tool.kbd })`
								: `${ tool.label } (${ tool.kbd })`;
						return (
							<div
								key={ id }
								data-ws={ 'tool.' + id }
								className={ `ed-tool ${
									state.tool === id ? 'active' : ''
								}` }
								role="button"
								tabIndex={ 0 }
								aria-label={ label }
								aria-expanded={
									id === 'eyedropper'
										? !! state.showColorPanel
										: undefined
								}
								onPointerDown={
									id === 'eyedropper'
										? ( e ) => e.preventDefault()
										: undefined
								}
								onClick={ ( e ) => activate( id, e ) }
								onKeyDown={ ( e ) => {
									if ( e.key !== 'Enter' && e.key !== ' ' ) {
										return;
									}
									if ( id === 'eyedropper' ) {
										e.preventDefault();
										e.stopPropagation();
									}
									activate( id, e );
								} }
								onMouseEnter={ showTip( label ) }
								onMouseLeave={ hideTip }
								onFocus={ showTip( label ) }
								onBlur={ hideTip }
							>
								{ I[ tool.icon ]( { size: 18 } ) }
								<span className="kbd">{ tool.kbd }</span>
							</div>
						);
					} ) }
				</div>
			) ) }
			{ extensionTools.length > 0 && (
				<div
					className="ed-tool-group"
					data-ws-first={ ! firstVisibleGroup || undefined }
				>
					{ extensionTools.map( ( tool ) => (
						<div
							key={ tool.id }
							className={ `ed-tool ${
								state.tool === tool.id ? 'active' : ''
							}` }
							role="button"
							tabIndex={ 0 }
							aria-label={ tool.label }
							onClick={ () =>
								dispatch( { type: 'SET_TOOL', tool: tool.id } )
							}
							onKeyDown={ ( e ) =>
								( 'Enter' === e.key || ' ' === e.key ) &&
								dispatch( { type: 'SET_TOOL', tool: tool.id } )
							}
							onMouseEnter={ showTip( tool.label ) }
							onMouseLeave={ hideTip }
							onFocus={ showTip( tool.label ) }
							onBlur={ hideTip }
						>
							{ tool.icon ? (
								<span
									style={ {
										display: 'inline-flex',
										width: 18,
										height: 18,
									} }
									dangerouslySetInnerHTML={ {
										__html: tool.icon,
									} }
								/>
							) : (
								<span style={ { fontSize: 14 } }>⨁</span>
							) }
						</div>
					) ) }
				</div>
			) }
			<div className="ed-toolbar-spacer" />
			<FgBgWidget />
			{ tip && (
				<div
					className="ed-rail-tip"
					style={ { left: tip.x, top: tip.y } }
				>
					{ tip.label }
				</div>
			) }
		</div>
	);
}
