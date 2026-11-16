import { __ } from '@wordpress/i18n';
import { useEffect, useState, useRef } from '@wordpress/element';
import { I } from '../../icons';
import { makeText } from '../../store/document';
import {
	CharacterSection,
	TransformSection,
	AlignSection,
	DynamicSection,
	BlendingOptionsSection,
	STYLE_LABELS,
} from './properties-panel';
import {
	ActiveFxSection,
	TextStylesSection,
	TextEffectsSection,
	TextWarpSection,
} from './effects-panel';
import { LayoutPopover } from '../canvas/layout-popover';
import { TextFxPopover } from '../canvas/text-fx-popover';
import { ancestorLocked } from '../canvas/tool-handlers';
import { canTextLook } from '../../lib/text-fit-ops';
import '../../styles/editor/text-panel.css';

export function TextPanel( { editor, extras, fxId, onCloseFx } ) {
	const { state } = editor;
	const [ tab, setTab ] = useState( 'font' );
	const main = useRef( null );
	const [ settingsTarget, setSettingsTarget ] = useState( null );
	const active = state.layers.find(
		( l ) => l.id === state.activeId && l.type === 'text'
	);
	const layer = active || {
		...makeText( state.toolOpts.text ),
		id: 'text-tool-defaults',
		color: state.fgColor,
	};
	const currentTab = active ? tab : 'font';
	useEffect( () => {
		if ( fxId ) {
			setTab( 'effects' );
		}
	}, [ fxId ] );
	useEffect( () => {
		if ( main.current ) {
			main.current.scrollTop = 0;
		}
	}, [ currentTab, fxId, active?.id ] );
	useEffect( () => {
		if ( ! settingsTarget || settingsTarget.layerId !== active?.id ) {
			return;
		}
		const scroller = main.current;
		const target = scroller?.querySelector( settingsTarget.selector );
		if ( ! target ) {
			return;
		}
		// Scroll only this panel; focusing a setting must not move the canvas.
		scroller.scrollTop +=
			target.getBoundingClientRect().top -
			scroller.getBoundingClientRect().top -
			10;
		const control = target.matches( 'input, select, button' )
			? target
			: target.querySelector( 'input, select, button' );
		control?.focus( { preventScroll: true } );
	}, [ currentTab, settingsTarget, active?.id ] );
	useEffect( () => {
		const onInsert = () => {
			setTab( 'font' );
			onCloseFx?.();
		};
		window.addEventListener( 'wpie-insert-text', onInsert );
		return () => window.removeEventListener( 'wpie-insert-text', onInsert );
	}, [ onCloseFx ] );
	const openSetting = ( nextTab, selector ) => {
		onCloseFx?.();
		setTab( nextTab );
		setSettingsTarget( { layerId: layer.id, selector } );
	};
	const openTextEffect = ( id ) => {
		setSettingsTarget( null );
		setTab( 'effects' );
		if ( main.current ) {
			main.current.scrollTop = 0;
		}
		window.dispatchEvent(
			new CustomEvent( 'wpie-fx-settings', { detail: { id } } )
		);
	};
	const removeEffect = ( patch ) => {
		editor.dispatch( { type: 'UPDATE_LAYER', id: layer.id, patch } );
		editor.commit( __( 'Remove effect', 'wunderpaint' ) );
	};
	// Use stored effects only, never the native-stroke projection in Properties.
	const activeStyles = Object.entries( STYLE_LABELS )
		.filter( ( [ kind ] ) => layer.styles?.[ kind ] )
		.map( ( [ kind, label ] ) => ( {
			key: `style-${ kind }`,
			label,
			title: `${ __( 'Blending Options', 'wunderpaint' ) }: ${ label }`,
			open: () =>
				kind === 'stroke'
					? openSetting( 'appearance', '.paint-stroke-row' )
					: openSetting( 'blending', `[data-style="${ kind }"]` ),
			remove: () =>
				removeEffect( {
					styles: { ...layer.styles, [ kind ]: null },
				} ),
		} ) );
	if ( layer.shadowOn ) {
		activeStyles.push( {
			key: 'text-shadow',
			label: __( 'Text shadow', 'wunderpaint' ),
			open: () =>
				openSetting( 'appearance', '[data-text-setting="shadow"]' ),
			remove: () => removeEffect( { shadowOn: false } ),
		} );
	}
	const tabs = [
		[ 'font', __( 'Font', 'wunderpaint' ), 'text' ],
		[ 'layout', __( 'Layout', 'wunderpaint' ), 'alignL' ],
		[ 'appearance', __( 'Appearance', 'wunderpaint' ), 'palette' ],
		[ 'blending', __( 'Blending Options', 'wunderpaint' ), 'fx' ],
		[ 'styles', __( 'Styles', 'wunderpaint' ), 'textLayout' ],
		[ 'effects', __( 'Effects', 'wunderpaint' ), 'sparkles' ],
		[ 'content', __( 'Dynamic content', 'wunderpaint' ), 'layers' ],
	];
	const locked =
		active && ( active.locked || ancestorLocked( state.layers, active ) );
	return (
		<div className="text-tool-panel">
			<nav
				className="text-panel-nav"
				aria-label={ __( 'Text settings', 'wunderpaint' ) }
			>
				{ tabs.map( ( [ id, label, icon ] ) => (
					<button
						key={ id }
						type="button"
						className="ai-tile ai-tile-compact"
						aria-pressed={ currentTab === id }
						disabled={ ! active && id !== 'font' }
						onClick={ () => {
							setSettingsTarget( null );
							setTab( id );
						} }
					>
						<span className="ai-tile-icon">
							{ I[ icon ]?.( { size: 18 } ) }
						</span>
						<span className="ai-tile-name">{ label }</span>
					</button>
				) ) }
			</nav>
			<div className="text-panel-main" ref={ main }>
				{ ! active && (
					<p className="painting-hint">
						{ __(
							'Choose a font, then click the canvas or drag a text frame.',
							'wunderpaint'
						) }
					</p>
				) }
				{ locked && (
					<p className="painting-hint">
						{ __( 'Layer is locked', 'wunderpaint' ) }
					</p>
				) }
				<fieldset disabled={ !! locked } className="painting-fieldset">
					{ active && (
						<ActiveFxSection
							editor={ editor }
							layer={ layer }
							extraItems={ activeStyles }
							onOpenTextEffect={ openTextEffect }
							wsKey="text.active"
							title={ __( 'Active effects', 'wunderpaint' ) }
							collapsible={ false }
						/>
					) }
					{ [ 'font', 'layout', 'appearance' ].includes(
						currentTab
					) && (
						<div className="text-character">
							<CharacterSection
								layer={ layer }
								extras={ extras }
								part={ currentTab }
								draft={ ! active }
							/>
						</div>
					) }
					{ currentTab === 'blending' && (
						<div className="text-panel-blending">
							<BlendingOptionsSection
								layer={ layer }
								extras={ extras }
								includeStroke={ false }
								embedded
							/>
						</div>
					) }
					{ currentTab === 'layout' && (
						<>
							<div className="text-panel-transform">
								<TransformSection
									layer={ layer }
									collapsible={ false }
									showReset={ false }
								/>
							</div>
							<AlignSection collapsible={ false } />
						</>
					) }
					{ currentTab === 'styles' && (
						<>
							<TextStylesSection
								editor={ editor }
								state={ state }
								layer={ layer }
							/>
							{ canTextLook( layer ) && (
								<LayoutPopover
									editor={ editor }
									extras={ extras }
									embedded
									anchor={ { left: 0, top: 0 } }
									onClose={ () => {} }
								/>
							) }
						</>
					) }
					{ currentTab === 'effects' && (
						<>
							{ fxId && (
								<TextFxPopover
									editor={ editor }
									layer={ layer }
									fxId={ fxId }
									onClose={ onCloseFx }
									embedded
								/>
							) }
							<TextEffectsSection
								editor={ editor }
								state={ state }
								layer={ layer }
							/>
							<TextWarpSection
								editor={ editor }
								state={ state }
								layer={ layer }
							/>
						</>
					) }
					{ currentTab === 'content' && (
						<DynamicSection layer={ layer } />
					) }
				</fieldset>
			</div>
		</div>
	);
}
