/** Three stable Easy areas over the same editor document and asset tray. */
import { useEffect, useRef, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { I } from '../../icons';
import { useEditor } from '../../store/editor-context';
import { PanelSection } from '../../components/panel-section';
import { ancestorLocked } from '../canvas/tool-handlers';
import { CropPanel } from '../panels/crop-panel';
import {
	FiltersSection,
	EffectsSection,
	TextEffectsSection,
	TextStylesSection,
	TextWarpSection,
} from '../panels/effects-panel';
import {
	DesignBar,
	TextCard,
	ShapeCard,
	ImageCard,
	OpacityRow,
	AiCard,
	LayersCard,
} from './easy-sections';
import { EasyCard, EasyStart, EasyCreative } from './easy-start';
import { EasyPaint, EasyLayout } from './easy-tools';
import { openEasySection } from './easy-actions';
import '../../styles/editor/easy-mode.css';

function EasyLooks( { editor, extras, layer } ) {
	const [ kind, setKind ] = useState(
		layer.type === 'text' ? 'styles' : 'filters'
	);
	const choices = [
		...( layer.type === 'text'
			? [
					[
						'styles',
						__( 'Text Styles', 'wunderpaint' ),
						TextStylesSection,
					],
					[
						'textfx',
						__( 'Text Effects', 'wunderpaint' ),
						TextEffectsSection,
					],
					[
						'warp',
						__( 'Text Warp', 'wunderpaint' ),
						TextWarpSection,
					],
			  ]
			: [] ),
		[ 'filters', __( 'Filters', 'wunderpaint' ), FiltersSection ],
		[ 'effects', __( 'Effects', 'wunderpaint' ), EffectsSection ],
	];
	const current = choices.find( ( [ id ] ) => id === kind ) || choices[ 0 ];
	const Section = current[ 2 ];
	return (
		<>
			<div className="ed-easy-inset">
				<select
					aria-label={ __( 'Looks', 'wunderpaint' ) }
					value={ current[ 0 ] }
					onChange={ ( e ) => setKind( e.target.value ) }
				>
					{ choices.map( ( [ id, label ] ) => (
						<option key={ id } value={ id }>
							{ label }
						</option>
					) ) }
				</select>
			</div>
			{ /* Mount only the requested preview group, rather than hiding its render work. */ }
			<Section
				key={ current[ 0 ] }
				editor={ editor }
				extras={ extras }
				state={ editor.state }
				layer={ layer }
			/>
		</>
	);
}

export function EasyPanel( { extras, navigation } ) {
	const editor = useEditor();
	const { state } = editor;
	const layer =
		state.layers.find( ( item ) => item.id === state.activeId ) || null;
	const { area, section, navigate } = navigation;
	const main = useRef( null );
	const painting = [ 'brush', 'pencil', 'eraser' ].includes( state.tool );
	const cropping = state.tool === 'crop';
	const isImage =
		layer && [ 'image', 'raster', 'smart' ].includes( layer.type );
	const locked =
		!! layer && ( layer.locked || ancestorLocked( state.layers, layer ) );
	const canLook = layer && ! [ 'group', 'adjustment' ].includes( layer.type );
	const generalEdit = area === 'edit' && ! painting && ! cropping;
	useEffect( () => {
		if ( main.current ) {
			main.current.scrollTop = 0;
		}
	}, [ area, section ] );
	const editSection = ( next ) => openEasySection( editor, extras, next );
	const tabs = [
		[ 'start', 'grid', __( 'Start', 'wunderpaint' ) ],
		[ 'edit', 'sliders', __( 'Edit', 'wunderpaint' ) ],
		[ 'elements', 'layers', __( 'Elements', 'wunderpaint' ) ],
	];
	const sections = [
		[ 'basics', 'sliders', __( 'Basics', 'wunderpaint' ) ],
		[ 'looks', 'fx', __( 'Looks', 'wunderpaint' ) ],
		[ 'layout', 'textLayout', __( 'Layout', 'wunderpaint' ) ],
	];
	return (
		<div className="ed-right ed-easy-panel">
			<header className="ed-easy-panel-header">
				{ I.brand( { size: 15 } ) }
				<span>{ __( 'Easy Mode', 'wunderpaint' ) }</span>
			</header>
			<nav
				className="ed-easy-nav"
				aria-label={ __( 'Easy Mode', 'wunderpaint' ) }
			>
				{ tabs.map( ( [ id, icon, label ] ) => (
					<EasyCard
						key={ id }
						icon={ icon }
						label={ label }
						className="ed-easy-nav-card"
						data-easy-area={ id }
						active={ area === id }
						onClick={ () => navigate( id ) }
					/>
				) ) }
			</nav>
			{ generalEdit && ( layer || section !== 'basics' ) && (
				<nav
					className="ed-right-tabs ed-easy-edit-nav"
					aria-label={ __( 'Edit', 'wunderpaint' ) }
				>
					{ sections.map( ( [ id, icon, label ] ) => (
						<button
							key={ id }
							type="button"
							className={
								'ed-easy-edit-tab' +
								( ( section === 'photo'
									? 'basics'
									: section ) === id
									? ' active'
									: '' )
							}
							title={ label }
							data-easy-section={ id }
							aria-pressed={
								( section === 'photo' ? 'basics' : section ) ===
								id
							}
							onClick={ () => navigate( 'edit', id ) }
						>
							{ I[ icon ]( { size: 13 } ) } { label }
						</button>
					) ) }
				</nav>
			) }
			<div
				ref={ main }
				className={
					'ed-easy-body' +
					( area === 'edit' && cropping ? ' ed-easy-crop-body' : '' )
				}
			>
				{ area === 'start' && (
					<EasyStart
						editor={ editor }
						extras={ extras }
						onEdit={ editSection }
						onCreative={ () =>
							openEasySection(
								editor,
								extras,
								'basics',
								'creative'
							)
						}
					/>
				) }
				{ area === 'creative' && (
					<>
						<div className="ed-easy-section-title">
							<h3>{ __( 'Creative & AI', 'wunderpaint' ) }</h3>
						</div>
						<EasyCreative editor={ editor } extras={ extras } />
						<AiCard editor={ editor } extras={ extras } />
					</>
				) }
				{ area === 'elements' && <LayersCard editor={ editor } /> }
				{ area === 'edit' && cropping && (
					<CropPanel editor={ editor } />
				) }
				{ area === 'edit' && painting && (
					<EasyPaint editor={ editor } extras={ extras } />
				) }
				{ generalEdit && (
					<>
						{ locked && (
							<p className="ed-easy-empty">
								{ I.lock( { size: 14 } ) }{ ' ' }
								{ __( 'Layer is locked', 'wunderpaint' ) }
							</p>
						) }
						<fieldset
							className="painting-fieldset"
							disabled={
								locked &&
								section !== 'layout' &&
								( section !== 'photo' || isImage )
							}
						>
							{ section === 'layout' ? (
								<EasyLayout
									editor={ editor }
									layer={ layer }
									locked={ locked }
								/>
							) : section === 'looks' ? (
								canLook ? (
									<EasyLooks
										key={ layer.id }
										editor={ editor }
										extras={ extras }
										layer={ layer }
									/>
								) : (
									<p className="ed-easy-empty">
										{ __(
											'Select an element to explore its looks and effects.',
											'wunderpaint'
										) }
									</p>
								)
							) : section === 'photo' && ! isImage ? (
								<p className="ed-easy-empty">
									{ __(
										'Select an image to adjust its brightness, contrast and color.',
										'wunderpaint'
									) }
								</p>
							) : ! layer ? (
								<p className="ed-easy-empty">
									{ __(
										'Select an element on the canvas or in Elements to edit it.',
										'wunderpaint'
									) }
								</p>
							) : (
								<>
									{ layer.type === 'text' && (
										<TextCard
											editor={ editor }
											extras={ extras }
											layer={ layer }
										/>
									) }
									{ layer.type === 'shape' && (
										<ShapeCard
											editor={ editor }
											extras={ extras }
											layer={ layer }
										/>
									) }
									{ isImage && (
										<ImageCard
											editor={ editor }
											extras={ extras }
											layer={ layer }
										/>
									) }
									{ ! [ 'text', 'shape' ].includes(
										layer.type
									) &&
										! isImage && (
											<PanelSection
												title={ __(
													'Appearance',
													'wunderpaint'
												) }
											>
												<OpacityRow
													editor={ editor }
													layer={ layer }
												/>
											</PanelSection>
										) }
								</>
							) }
						</fieldset>
					</>
				) }
			</div>
			<DesignBar editor={ editor } extras={ extras } />
		</div>
	);
}
