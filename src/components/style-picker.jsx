/**
 * StyleButton (v1.164.0): a small palette button for AI prompt fields
 * that applies curated visual style presets ("Watercolor", "Cyberpunk",
 * "3D Animation", …) - one click appends a battle-tested style
 * descriptor to the user's prompt, clicking another style REPLACES it,
 * clicking the active one removes it. Global sibling of the VarButton:
 * same controlled-input contract ({ value | getValue, onChange }), so
 * any prompt textarea can adopt it.
 */

import { useEffect, useRef, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { I } from '../icons';
import { useTip } from './use-tip';
import {
	stylePresetGroups,
	allStylePresets,
	applyStylePrompt,
	activeStylePreset,
	moodPresetGroups,
	allMoodPresets,
	applyMoodPrompt,
	activeMoodPreset,
} from '../lib/style-presets';
import { STYLE_ICON_PATHS } from '../lib/style-icons';

/** Tabler outline icon for a preset tile (24px stroke path). */
const TileIcon = ( { id } ) => (
	<svg
		className="wpie-style-icon"
		viewBox="0 0 24 24"
		width="15"
		height="15"
		fill="none"
		stroke="currentColor"
		strokeWidth="1.75"
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
	>
		<path d={ STYLE_ICON_PATHS[ id ] || STYLE_ICON_PATHS.minimalist } />
	</svg>
);

const POP_W = 316;
const POP_MAX_H = 380;

/** Popover position next to the button; flips above when space runs out. */
const popStyle = ( btn ) => {
	const r = btn.getBoundingClientRect();
	const below = window.innerHeight - r.bottom;
	const style = {
		position: 'fixed',
		zIndex: 4000,
		width: POP_W,
		maxHeight: POP_MAX_H,
		left: Math.max(
			8,
			Math.min( r.right - POP_W, window.innerWidth - POP_W - 8 )
		),
	};
	if ( below < POP_MAX_H + 12 && r.top > below ) {
		style.bottom = window.innerHeight - r.top + 4;
	} else {
		style.top = r.bottom + 4;
	}
	return style;
};

export function StyleButton( { value, onChange, getValue, compact = false } ) {
	const [ open, setOpen ] = useState( false );
	const [ query, setQuery ] = useState( '' );
	const wrapRef = useRef( null );
	const btnRef = useRef( null );
	// CI tooltip bubble (the Quick Actions pattern); z beats the popover.
	const { tipFor, tipNode, hideTip } = useTip( { z: 4600 } );

	useEffect( () => {
		// Opening covers the button, closing removes hovered tiles: the
		// bubble must never outlive its anchor.
		hideTip();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ open ] );

	useEffect( () => {
		if ( ! open ) {
			return;
		}
		const away = ( e ) => {
			if ( ! wrapRef.current?.contains( e.target ) ) {
				setOpen( false );
			}
		};
		const key = ( e ) => {
			if ( 'Escape' === e.key ) {
				e.stopPropagation();
				setOpen( false );
			}
		};
		document.addEventListener( 'mousedown', away );
		document.addEventListener( 'keydown', key, true );
		return () => {
			document.removeEventListener( 'mousedown', away );
			document.removeEventListener( 'keydown', key, true );
		};
	}, [ open ] );

	const current = () => String( ( getValue ? getValue() : value ) || '' );
	const active = activeStylePreset( current(), allStylePresets() );
	const activeMood = activeMoodPreset( current(), allMoodPresets() );

	const pick = ( preset ) => {
		// Re-picking the active style clears it (toggle).
		const next = applyStylePrompt(
			current(),
			active?.id === preset.id ? null : preset
		);
		onChange( next );
		setOpen( false );
		setQuery( '' );
	};
	const pickMood = ( preset ) => {
		const next = applyMoodPrompt(
			current(),
			activeMood?.id === preset.id ? null : preset
		);
		onChange( next );
		setOpen( false );
		setQuery( '' );
	};

	const q = query.trim().toLowerCase();
	const matches = ( s ) =>
		! q || s.label.toLowerCase().includes( q ) || s.id.includes( q );
	const groups = stylePresetGroups()
		.map( ( group ) => ( {
			...group,
			items: group.items.filter( matches ),
		} ) )
		.filter( ( group ) => group.items.length );
	// Moods lead: "make this cool" is the door most beginners walk
	// through; a mood combines with any style below.
	const moodGroups = moodPresetGroups()
		.map( ( group ) => ( {
			...group,
			items: group.items.filter( matches ),
		} ) )
		.filter( ( group ) => group.items.length );

	return (
		<span
			ref={ wrapRef }
			style={ {
				position: 'relative',
				display: 'inline-flex',
				flexShrink: 0,
			} }
		>
			<button
				type="button"
				ref={ btnRef }
				className={
					'wpie-style-btn' +
					( active || activeMood ? ' has-style' : '' )
				}
				{ ...tipFor( __( 'Style presets', 'wunderpaint' ) ) }
				aria-label={ __( 'Style presets', 'wunderpaint' ) }
				aria-expanded={ open }
				onClick={ () => setOpen( ( o ) => ! o ) }
			>
				{ I.palette( { size: 13 } ) }
				{ ! compact && (
					<span className="wpie-style-btn-label">
						{ [ active?.label, activeMood?.label ]
							.filter( Boolean )
							.join( ' · ' ) || __( 'Style', 'wunderpaint' ) }
					</span>
				) }
			</button>
			{ open && (
				<div
					className="wpie-var-pop wpie-style-pop"
					style={ popStyle( btnRef.current ) }
					role="listbox"
				>
					<input
						type="text"
						className="dsm-input"
						style={ { margin: 6, width: 'calc(100% - 12px)' } }
						placeholder={ __( 'Search styles…', 'wunderpaint' ) }
						value={ query }
						/* eslint-disable-next-line jsx-a11y/no-autofocus -- search box of a just-opened picker */
						autoFocus
						onChange={ ( e ) => setQuery( e.target.value ) }
					/>
					<div className="wpie-var-list">
						{ ( active || activeMood ) && ! q && (
							<button
								type="button"
								className="wpie-style-clear"
								onClick={ () => {
									onChange(
										applyMoodPrompt(
											applyStylePrompt( current(), null ),
											null
										)
									);
									setOpen( false );
								} }
							>
								{ __( 'Remove style & mood', 'wunderpaint' ) }
							</button>
						) }
						{ moodGroups.map( ( group ) => (
							<div key={ group.label }>
								<div className="wpie-var-group">
									{ group.label }
								</div>
								<div className="wpie-style-grid">
									{ group.items.map( ( s ) => (
										<button
											type="button"
											key={ s.id }
											className={
												'wpie-style-item' +
												( activeMood?.id === s.id
													? ' active'
													: '' )
											}
											{ ...tipFor( s.prompt ) }
											onClick={ () => pickMood( s ) }
										>
											<TileIcon id={ s.id } />
											<span>{ s.label }</span>
										</button>
									) ) }
								</div>
							</div>
						) ) }
						{ groups.map( ( group ) => (
							<div key={ group.label }>
								<div className="wpie-var-group">
									{ group.label }
								</div>
								<div className="wpie-style-grid">
									{ group.items.map( ( s ) => (
										<button
											type="button"
											key={ s.id }
											className={
												'wpie-style-item' +
												( active?.id === s.id
													? ' active'
													: '' )
											}
											{ ...tipFor( s.prompt ) }
											onClick={ () => pick( s ) }
										>
											<TileIcon id={ s.id } />
											<span>{ s.label }</span>
										</button>
									) ) }
								</div>
							</div>
						) ) }
						{ ! groups.length && (
							<div className="wpie-var-group">
								{ __( 'No matching style.', 'wunderpaint' ) }
							</div>
						) }
					</div>
				</div>
			) }
			{ tipNode }
		</span>
	);
}
