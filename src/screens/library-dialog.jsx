/**
 * Central library (v1.2): one dialog with sections for templates (with
 * previews), icons, emoji, patterns and the brand kit, plus quick links
 * to the other insert sources. Replaces the separate icon/emoji/pattern
 * dialogs.
 */

import { useState, useEffect } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { I } from '../icons';

import { useEditor } from '../store/editor-context';
import { useEscape } from '../components/use-escape';
import { HelpLink } from './help-dialog';

import { COMBO_CATEGORIES } from '../content/combo-categories';

import {
	listExtensionLibrarySections,
	getExtensionLibrarySection,
	subscribeExtensions,
} from '../lib/extensions';

/*
 * The thirteen sections live in ./library/*.jsx since v1.344.0. This file is
 * the shell: two pieces of state, one section rendered at a time. The three
 * open*Document helpers and the two template widgets are re-exported because
 * create-dialog, open-template-dialog and library-tray import them from here
 * and there is no reason to make them chase the move.
 */
import {
	BackgroundsSection,
	BrandSection,
	ElementsSection,
	EmojiSection,
	IconsSection,
	PatternsSection,
	TextCombosSection,
} from './library/content-sections';
import {
	AssetsSection,
	DesignsSection,
	UploadsSection,
} from './library/user-sections';
import { StartersSection, TemplatesSection } from './library/template-sections';
import {
	ExtensionSectionModal,
	GlobalSearchSection,
} from './library/search-section';

export {
	StarterPreview,
	TemplateFilterBar,
	openDesignDocument,
	openStarterDocument,
	openTemplateDocument,
} from './library/template-sections';

/* --------------------------------- shell ------------------------------- */

export function LibraryDialog( { section, onClose, extras } ) {
	useEscape( onClose );
	const editor = useEditor();
	const [ active, setActive ] = useState(
		'text' === section ? 'buttons' : section || 'designs'
	);
	// Extension sections may register after mount (v1.120.1).
	const [ , setExtTick ] = useState( 0 );
	useEffect(
		() => subscribeExtensions( () => setExtTick( ( t ) => t + 1 ) ),
		[]
	);
	// Hero search across ALL asset titles (v1.120.2).
	const [ query, setQuery ] = useState( '' );
	const searching = !! query.trim();

	const sections = [
		{ id: 'designs', label: __( 'My Designs', 'wunderpaint' ) },
		{ id: 'assets', label: __( 'My Assets', 'wunderpaint' ) },
		{ id: 'templates', label: __( 'Dynamic Templates', 'wunderpaint' ) },
		{ id: 'starters', label: __( 'Starter Templates', 'wunderpaint' ) },
		// The text-combo categories are TOP-LEVEL sections (v1.55).
		...COMBO_CATEGORIES,
		{ id: 'elements', label: __( 'Shapes', 'wunderpaint' ) },
		{ id: 'backgrounds', label: __( 'Backgrounds', 'wunderpaint' ) },
		{ id: 'uploads', label: __( 'Media Library', 'wunderpaint' ) },
		{ id: 'icons', label: __( 'Icons', 'wunderpaint' ) },
		{ id: 'emoji', label: __( 'Emoji', 'wunderpaint' ) },
		{ id: 'patterns', label: __( 'Patterns', 'wunderpaint' ) },
		{ id: 'brand', label: __( 'Brand Kits', 'wunderpaint' ) },
		// Extension packs (v1.120.1), same sections as the tray chips.
		...listExtensionLibrarySections().map( ( s ) => ( {
			id: s.id,
			label: s.label,
		} ) ),
	];
	return (
		<div className="modal-backdrop" onClick={ onClose } role="presentation">
			<div
				className="dsm library-dialog"
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-label={ __( 'Asset Library', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<span className="dsm-title">
							{ __( 'Asset Library', 'wunderpaint' ) }
						</span>
						<HelpLink article="stock" extras={ extras } />
						<div className="dsm-sub">
							{ __(
								'Designs, stock and everything you have saved: drop straight onto the canvas.',
								'wunderpaint'
							) }
						</div>
					</div>
					<input
						type="search"
						className="library-global-search"
						placeholder={ __(
							'Search all assets…',
							'wunderpaint'
						) }
						value={ query }
						onChange={ ( e ) => setQuery( e.target.value ) }
						aria-label={ __( 'Search the library', 'wunderpaint' ) }
					/>
					<button
						className="dsm-close"
						onClick={ onClose }
						aria-label={ __( 'Close', 'wunderpaint' ) }
					>
						{ I.close( { size: 17 } ) }
					</button>
				</div>
				<div
					className="library-body"
					style={ { flex: 1, minHeight: 0 } }
				>
					<div className="library-sidebar">
						{ sections.map( ( s ) => (
							<button
								key={ s.id }
								className={
									! searching && active === s.id
										? 'active'
										: ''
								}
								onClick={ () => {
									setQuery( '' );
									setActive( s.id );
								} }
							>
								{ s.label }
							</button>
						) ) }
					</div>
					{ searching && (
						<GlobalSearchSection
							query={ query }
							editor={ editor }
							extras={ extras }
							onClose={ onClose }
						/>
					) }
					{ ! searching && 'designs' === active && (
						<DesignsSection
							editor={ editor }
							extras={ extras }
							onClose={ onClose }
						/>
					) }
					{ ! searching &&
						COMBO_CATEGORIES.some( ( c ) => c.id === active ) && (
							<TextCombosSection
								editor={ editor }
								category={ active }
								onClose={ onClose }
							/>
						) }
					{ ! searching && 'elements' === active && (
						<ElementsSection
							editor={ editor }
							extras={ extras }
							onClose={ onClose }
						/>
					) }
					{ ! searching && 'backgrounds' === active && (
						<BackgroundsSection
							editor={ editor }
							extras={ extras }
							onClose={ onClose }
						/>
					) }
					{ ! searching && 'uploads' === active && (
						<UploadsSection
							editor={ editor }
							extras={ extras }
							onClose={ onClose }
						/>
					) }
					{ ! searching && 'assets' === active && (
						<AssetsSection
							editor={ editor }
							extras={ extras }
							onClose={ onClose }
						/>
					) }
					{ ! searching && 'templates' === active && (
						<TemplatesSection
							editor={ editor }
							extras={ extras }
							onClose={ onClose }
						/>
					) }
					{ ! searching && 'starters' === active && (
						<StartersSection
							editor={ editor }
							extras={ extras }
							onClose={ onClose }
						/>
					) }
					{ ! searching && 'icons' === active && (
						<IconsSection
							editor={ editor }
							extras={ extras }
							onClose={ onClose }
						/>
					) }
					{ ! searching && 'emoji' === active && (
						<EmojiSection
							editor={ editor }
							extras={ extras }
							onClose={ onClose }
						/>
					) }
					{ ! searching && 'patterns' === active && (
						<PatternsSection extras={ extras } />
					) }
					{ ! searching && 'brand' === active && (
						<BrandSection
							editor={ editor }
							extras={ extras }
							onClose={ onClose }
						/>
					) }
					{ ! searching &&
						!! getExtensionLibrarySection( active ) && (
							<ExtensionSectionModal
								section={ getExtensionLibrarySection( active ) }
								editor={ editor }
								extras={ extras }
								onClose={ onClose }
							/>
						) }
				</div>
			</div>
		</div>
	);
}
