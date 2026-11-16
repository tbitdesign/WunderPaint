import { useEffect, useRef, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { I } from '../../icons';
import {
	listExtensionGenerators,
	listExtensionMenuItems,
	subscribeExtensions,
} from '../../lib/extensions';
import {
	EDITOR_THEMES,
	THEME_TOOL_PANELS,
	loadEditorTheme,
	saveEditorTheme,
	resolveThemeGroups,
} from '../../lib/editor-themes';
import { setKeyHidden } from '../../lib/workspace';
import { FloatPanel } from './float-panel';
import '../../styles/editor/theme-panel.css';

function ThemeCard( { entry, busy, onClick } ) {
	return (
		<button
			type="button"
			className="ai-tile ai-tile-compact theme-panel-card"
			data-theme-action={ entry.id }
			aria-pressed={ entry.active }
			aria-busy={ busy || undefined }
			disabled={ entry.disabled || busy }
			title={ entry.title || entry.label }
			onClick={ onClick }
		>
			<span className="ai-tile-icon" aria-hidden="true">
				{ I[ entry.icon ]( { size: 19 } ) }
			</span>
			<span className="ai-tile-name">{ entry.label }</span>
		</button>
	);
}

export function ThemePanel( { editor, extras, ...floatProps } ) {
	const { state, dispatch } = editor;
	const { pinned, onClose } = floatProps;
	const [ themeId, setThemeId ] = useState( loadEditorTheme );
	const [ , refresh ] = useState( 0 );
	const [ busy, setBusy ] = useState( null );
	const running = useRef( false );
	const content = useRef( null );
	const previousTool = useRef( state.tool );
	useEffect(
		() => subscribeExtensions( () => refresh( ( n ) => n + 1 ) ),
		[]
	);
	useEffect( () => {
		const changed = previousTool.current !== state.tool;
		previousTool.current = state.tool;
		if ( changed && ! pinned ) {
			onClose();
		}
	}, [ state.tool, pinned, onClose ] );
	useEffect( () => {
		if ( content.current ) {
			content.current.scrollTop = 0;
		}
	}, [ themeId ] );

	const theme = EDITOR_THEMES.find( ( item ) => item.id === themeId );
	const groups = resolveThemeGroups( theme, {
		generators: listExtensionGenerators(),
		menuItems: listExtensionMenuItems(),
		editor,
		extras,
		bootstrap: window.WPIE || {},
	} );

	const activate = async ( entry ) => {
		if ( entry.disabled || running.current ) {
			return;
		}
		if ( entry.tool ) {
			// Own cards keep the launcher open; outside tool changes use Pin.
			// The existing text insertion switches to Move while typing.
			previousTool.current = entry.tool === 'text' ? 'move' : entry.tool;
			const panelAction = THEME_TOOL_PANELS[ entry.tool ];
			if ( panelAction ) {
				dispatch( { type: panelAction, show: true } );
			}
			if ( entry.tool === 'text' ) {
				// Same ready-to-type insertion as the toolbar's Text icon.
				window.dispatchEvent( new CustomEvent( 'wpie-insert-text' ) );
			} else {
				dispatch( { type: 'SET_TOOL', tool: entry.tool } );
			}
			return;
		}
		if ( entry.rightTab ) {
			// Explicitly opening a panel may reveal that one hidden tab. A
			// theme change itself never alters workspace visibility.
			setKeyHidden( 'panel.' + entry.rightTab, false );
			dispatch( { type: 'SET_RIGHT_TAB', tab: entry.rightTab } );
			return;
		}
		if ( entry.command === 'color' ) {
			dispatch( { type: 'TOGGLE_COLOR_PANEL', show: true } );
			return;
		}
		if ( entry.command === 'mask' ) {
			dispatch( { type: 'SET_MASK_EDIT', id: state.activeId } );
			return;
		}
		if ( entry.command === 'timeline' ) {
			if ( ! state.timeline.on ) {
				dispatch( { type: 'TOGGLE_TIMELINE' } );
			}
			return;
		}

		running.current = true;
		setBusy( entry.id );
		try {
			if ( entry.target ) {
				await entry.target.run( { editor, extras } );
			} else {
				await extras[ entry.open ]();
			}
		} catch ( error ) {
			extras.toasts?.error(
				sprintf(
					/* translators: %s: name of the studio. */
					__(
						'%s could not be loaded. Check your connection and try again.',
						'wunderpaint'
					),
					entry.label
				)
			);
		} finally {
			running.current = false;
			setBusy( null );
		}
	};

	return (
		<FloatPanel
			{ ...floatProps }
			title={ __( 'Themes', 'wunderpaint' ) }
			icon={ I.brand( { size: 15 } ) }
			className="theme-panel-window"
			modal={ false }
			revealKey={ state.themePanelReveal }
		>
			<div className="theme-panel-intro">
				<select
					aria-label={ __( 'Theme', 'wunderpaint' ) }
					value={ themeId }
					onChange={ ( event ) => {
						setThemeId( event.target.value );
						saveEditorTheme( event.target.value );
					} }
				>
					{ EDITOR_THEMES.map( ( item ) => (
						<option key={ item.id } value={ item.id }>
							{ item.label() }
						</option>
					) ) }
				</select>
				<p>{ theme.description() }</p>
			</div>
			<div className="theme-panel-content" ref={ content }>
				{ groups.map( ( section ) => (
					<section
						key={ section.id }
						aria-labelledby={ `wpie-theme-${ theme.id }-${ section.id }` }
					>
						<h3 id={ `wpie-theme-${ theme.id }-${ section.id }` }>
							{ section.label() }
						</h3>
						<div className="ai-tiles theme-panel-grid">
							{ section.items.map( ( entry ) => (
								<ThemeCard
									key={ entry.id }
									entry={ entry }
									busy={ busy === entry.id }
									onClick={ () => activate( entry ) }
								/>
							) ) }
						</div>
					</section>
				) ) }
				{ ! groups.length && (
					<div className="theme-panel-empty">
						<p>
							{ __(
								'No studios are enabled for this theme yet.',
								'wunderpaint'
							) }
						</p>
						{ extras.openExtensions && (
							<button
								type="button"
								className="ai-btn"
								onClick={ () => extras.openExtensions() }
							>
								{ __( 'Extensions', 'wunderpaint' ) }
							</button>
						) }
					</div>
				) }
			</div>
			<footer className="theme-panel-footer">
				{ __( 'Tools open with their settings.', 'wunderpaint' ) }
			</footer>
		</FloatPanel>
	);
}
