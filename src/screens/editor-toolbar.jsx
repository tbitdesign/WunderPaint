/**
 * Left tool rail + fg/bg color widget (spec 04.3).
 */

import { __ } from '@wordpress/i18n';
import { useState } from '@wordpress/element';

import { I } from '../icons';
import { TOOLS, TOOLBAR_GROUPS } from '../store/constants';
import { useEditor } from '../store/editor-context';
import { ColorPopover } from '../components/color-popover';
import { listExtensionTools } from '../lib/extensions';

const toolById = ( id ) => TOOLS.find( ( t ) => t.id === id );

function FgBgWidget() {
	const { state, dispatch } = useEditor();
	const [ editing, setEditing ] = useState( null ); // 'fg' | 'bg' | null

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
					onClick={ () =>
						setEditing( 'fg' === editing ? null : 'fg' )
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
					onClick={ () =>
						setEditing( 'bg' === editing ? null : 'bg' )
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
			{ editing && (
				<ColorPopover
					color={ 'fg' === editing ? state.fgColor : state.bgColor }
					onChange={ ( c ) =>
						dispatch( {
							type: 'fg' === editing ? 'SET_FG' : 'SET_BG',
							color: c,
						} )
					}
					onClose={ () => setEditing( null ) }
					style={ { left: 50, bottom: 0 } }
				/>
			) }
		</div>
	);
}

export function EditorToolbar() {
	const { state, dispatch } = useEditor();

	// Clicking the Text tool drops a ready-to-type, centered text box right
	// away (handled in the canvas) instead of arming a draw-a-box tool - the
	// one-click ease beginners expect. Power users still get the draw/click
	// tool via the T shortcut (v1.179.0).
	const activate = ( id ) => {
		if ( 'text' === id ) {
			window.dispatchEvent( new CustomEvent( 'wpie-insert-text' ) );
			return;
		}
		dispatch( { type: 'SET_TOOL', tool: id } );
	};

	const [ tip, setTip ] = useState( null ); // {label, x, y}, fixed pos (v1.0.3)
	const showTip = ( label ) => ( e ) => {
		const r = e.currentTarget.getBoundingClientRect();
		setTip( { label, x: r.right + 8, y: r.top + r.height / 2 } );
	};
	const hideTip = () => setTip( null );

	return (
		<div className="ed-toolbar">
			{ TOOLBAR_GROUPS.map( ( group, gi ) => (
				<div key={ gi } style={ { display: 'contents' } }>
					{ gi > 0 && <div className="ed-tool-sep" /> }
					{ group.map( ( id ) => {
						const tool = toolById( id );
						return (
							<div
								key={ id }
								data-ws={ 'tool.' + id }
								className={ `ed-tool ${
									state.tool === id ? 'active' : ''
								}` }
								role="button"
								tabIndex={ 0 }
								aria-label={ `${ tool.label } (${ tool.kbd })` }
								onClick={ () => activate( id ) }
								onKeyDown={ ( e ) =>
									( 'Enter' === e.key || ' ' === e.key ) &&
									activate( id )
								}
								onMouseEnter={ showTip(
									`${ tool.label } (${ tool.kbd })`
								) }
								onMouseLeave={ hideTip }
								onFocus={ showTip(
									`${ tool.label } (${ tool.kbd })`
								) }
								onBlur={ hideTip }
							>
								{ I[ tool.icon ]( { size: 18 } ) }
								<span className="kbd">{ tool.kbd }</span>
							</div>
						);
					} ) }
				</div>
			) ) }
			<div className="ed-tool-sep" />
			<div
				className="ed-tool"
				data-ws="tool.aigen"
				role="button"
				tabIndex={ 0 }
				aria-label={ __( 'AI Generate', 'wunderpaint' ) + ' (A)' }
				onClick={ () =>
					dispatch( { type: 'SET_RIGHT_TAB', tab: 'ai' } )
				}
				onKeyDown={ ( e ) =>
					'Enter' === e.key &&
					dispatch( { type: 'SET_RIGHT_TAB', tab: 'ai' } )
				}
				onMouseEnter={ showTip(
					__( 'AI Generate', 'wunderpaint' ) + ' (A)'
				) }
				onMouseLeave={ hideTip }
				onFocus={ showTip(
					__( 'AI Generate', 'wunderpaint' ) + ' (A)'
				) }
				onBlur={ hideTip }
			>
				{ I.sparkAI( { size: 18 } ) }
				<span className="kbd">A</span>
			</div>
			{ listExtensionTools().length > 0 && (
				<div style={ { display: 'contents' } }>
					<div className="ed-tool-sep" />
					{ listExtensionTools().map( ( tool ) => (
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
			<div style={ { flex: 1 } } />
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
