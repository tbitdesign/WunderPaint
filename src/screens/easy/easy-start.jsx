import { useEffect, useRef, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { I } from '../../icons';
import {
	listExtensionGenerators,
	listExtensionMenuItems,
	subscribeExtensions,
} from '../../lib/extensions';
import { EDITOR_THEMES, resolveThemeGroups } from '../../lib/editor-themes';
import { activateEasyTool } from './easy-actions';

export function EasyCard( {
	id,
	icon,
	label,
	onClick,
	disabled,
	active,
	busy,
	className = '',
	...props
} ) {
	return (
		<button
			type="button"
			className={ `ai-tile ai-tile-compact ed-easy-card ${ className }` }
			data-easy-action={ id }
			aria-pressed={ active }
			aria-busy={ busy || undefined }
			disabled={ disabled || busy }
			onClick={ onClick }
			{ ...props }
		>
			<span className="ai-tile-icon" aria-hidden="true">
				{ ( I[ icon ] || I.puzzle )( { size: 21 } ) }
			</span>
			<span className="ai-tile-name">{ label }</span>
		</button>
	);
}

export function EasyStart( { editor, extras, onEdit, onCreative } ) {
	const cards = [
		[
			'text',
			'text',
			__( 'Text', 'wunderpaint' ),
			() => activateEasyTool( editor, 'text', extras ),
		],
		[
			'shapes',
			'shape',
			__( 'Shapes', 'wunderpaint' ),
			() => {
				activateEasyTool( editor, 'move', extras );
				extras.openShapeStudioModal();
			},
		],
		[
			'photo',
			'image',
			__( 'Improve photo', 'wunderpaint' ),
			() => onEdit( 'photo' ),
		],
		[
			'draw',
			'brush',
			__( 'Draw', 'wunderpaint' ),
			() => activateEasyTool( editor, 'brush', extras ),
		],
	];
	return (
		<>
			<div className="ed-easy-start">
				<div className="ai-tiles ed-easy-grid">
					{ cards.map( ( [ id, icon, label, onClick ] ) => (
						<EasyCard
							key={ id }
							{ ...{ id, icon, label, onClick } }
						/>
					) ) }
				</div>
				<div className="ed-easy-section-title">
					<h3>{ __( 'Creative & AI', 'wunderpaint' ) }</h3>
					<button
						type="button"
						className="icon-btn"
						title={ __( 'Show all', 'wunderpaint' ) }
						aria-label={ __( 'Show all', 'wunderpaint' ) }
						data-easy-action="creative"
						onClick={ onCreative }
					>
						{ I.chevRight( { size: 15 } ) }
					</button>
				</div>
			</div>
			<EasyCreative editor={ editor } extras={ extras } preview />
		</>
	);
}

const RECOMMENDED = {
	id: 'recommended',
	label: () => __( 'Recommended', 'wunderpaint' ),
	groups: [
		{
			id: 'recommended',
			label: () => __( 'Recommended', 'wunderpaint' ),
			items: [
				{ studio: 'wpie-text-art/sheet', icon: 'text' },
				{ studio: 'wpie-3d-text-studio/text', icon: 'smart' },
				{ studio: 'wpie-banner-studio/studio', icon: 'image' },
				{ studio: 'wpie-pattern-generator/pattern', icon: 'grid' },
				{ studio: 'wpie-chaos-art/piece', icon: 'sparkles' },
				{ studio: 'wpie-marbling-studio/marbling', icon: 'palette' },
				{ core: 'background' },
				{ core: 'qr' },
			],
		},
	],
};

// Reuse the theme catalogue and both extension registries, including lazy
// menu-only extensions. Opening this browser must not load any extension bundle.
const CREATIVE_THEMES = [
	RECOMMENDED,
	...EDITOR_THEMES.map( ( theme ) => ( {
		...theme,
		groups: theme.groups
			.map( ( group ) => ( {
				...group,
				items: group.items.filter( ( item ) => item.studio ),
			} ) )
			.filter( ( group ) => group.items.length ),
	} ) ).filter( ( theme ) => theme.groups.length ),
];

export function EasyCreative( { editor, extras, preview = false } ) {
	const [ themeId, setThemeId ] = useState( 'recommended' );
	const [ , refresh ] = useState( 0 );
	const [ busy, setBusy ] = useState( null );
	const running = useRef( false );
	useEffect(
		() => subscribeExtensions( () => refresh( ( n ) => n + 1 ) ),
		[]
	);
	const theme = CREATIVE_THEMES.find( ( item ) => item.id === themeId );
	const groups = resolveThemeGroups( theme, {
		generators: listExtensionGenerators(),
		menuItems: listExtensionMenuItems(),
		editor,
		extras,
		bootstrap: window.WPIE || {},
	} );
	const entries = groups.flatMap( ( group ) => group.items );
	const activate = async ( entry ) => {
		if ( running.current || entry.disabled ) {
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
					/* translators: %s: name of the tool or extension. */
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
		<section
			className="ed-easy-creative"
			aria-label={ __( 'Creative', 'wunderpaint' ) }
		>
			{ ! preview && (
				<select
					aria-label={ __( 'Theme', 'wunderpaint' ) }
					value={ themeId }
					onChange={ ( e ) => setThemeId( e.target.value ) }
				>
					{ CREATIVE_THEMES.map( ( item ) => (
						<option key={ item.id } value={ item.id }>
							{ item.label() }
						</option>
					) ) }
				</select>
			) }
			<div className="ai-tiles ed-easy-grid">
				{ entries.map( ( entry ) => (
					<EasyCard
						key={ entry.id }
						{ ...entry }
						busy={ busy === entry.id }
						onClick={ () => activate( entry ) }
					/>
				) ) }
			</div>
			{ ! entries.length && (
				<p className="ed-easy-hint-text">
					{ __( 'No items found.', 'wunderpaint' ) }
				</p>
			) }
		</section>
	);
}
