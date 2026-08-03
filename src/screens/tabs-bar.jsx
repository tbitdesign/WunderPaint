/**
 * Document tabs (v1.107.3), collapsed since v1.268.x: the always-open
 * strip fought with the tool options for the one menu row - two open
 * documents already pushed text controls out on 1920px. The tabs now
 * live behind ONE square button at the row's right end; a click slides
 * the strip out as a floating panel, picking a document switches to it
 * and the strip collapses again. The panel pins to viewport coordinates
 * read from the button (v1.248.1 lesson: toolbars clip absolute
 * children). Name only (size sits in the titlebar and the tooltip). No
 * + button: tabs open implicitly via File > New, templates, Asset
 * Library and the Screenshot Beautifier, capped at 10. Closing a dirty
 * tab asks once (inline, no native popup) and keeps the panel open.
 */

import { useState, useEffect, useRef } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { I } from '../icons';

export function TabsBar( {
	tabs,
	active,
	onSelect,
	onClose,
	getActivePreview,
} ) {
	// Two-step close: first click arms the tab, second click closes.
	const [ armed, setArmed ] = useState( null );
	const [ anchor, setAnchor ] = useState( null );
	// Fresh render of the ACTIVE document, made when the flyout opens;
	// parked tabs carry their preview from park time (tab.preview).
	const [ activePreview, setActivePreview ] = useState( null );
	const open = !! anchor;
	const ref = useRef( null );

	useEffect( () => {
		if ( ! open ) {
			return undefined;
		}
		const onDown = ( e ) => {
			if ( ref.current && ! ref.current.contains( e.target ) ) {
				setAnchor( null );
				setArmed( null );
			}
		};
		const onKey = ( e ) => {
			if ( 'Escape' === e.key ) {
				e.stopPropagation();
				setAnchor( null );
			}
		};
		document.addEventListener( 'pointerdown', onDown, true );
		document.addEventListener( 'keydown', onKey, true );
		return () => {
			document.removeEventListener( 'pointerdown', onDown, true );
			document.removeEventListener( 'keydown', onKey, true );
		};
	}, [ open ] );

	// A single document needs no tab UI at all (v1.107.5).
	if ( tabs.length < 2 ) {
		return null;
	}

	return (
		<div className="ed-tabsfly" ref={ ref }>
			<button
				className={ 'ed-tabsfly-btn' + ( open ? ' open' : '' ) }
				title={ __( 'Open documents', 'wunderpaint' ) }
				aria-label={ __( 'Open documents', 'wunderpaint' ) }
				aria-expanded={ open }
				onClick={ ( e ) => {
					if ( anchor ) {
						setAnchor( null );
						return;
					}
					const r = e.currentTarget.getBoundingClientRect();
					setAnchor( {
						right: Math.max( 8, window.innerWidth - r.right ),
						top: r.bottom + 6,
					} );
					setActivePreview( null );
					getActivePreview?.().then(
						( p ) => p && setActivePreview( p )
					);
				} }
			>
				{ I.tabsFlyout( { size: 14 } ) }
				<span className="ed-tabsfly-count">{ tabs.length }</span>
			</button>
			{ open && (
				<div
					className="ed-tabsfly-panel"
					style={ { right: anchor.right, top: anchor.top } }
					role="tablist"
					aria-label={ __( 'Open documents', 'wunderpaint' ) }
				>
					{ tabs.map( ( tab ) => {
						const isActive = tab.id === active;
						const isArmed = armed === tab.id;
						const src = isActive
							? activePreview || tab.preview
							: tab.preview;
						return (
							<div
								key={ tab.id }
								className={
									'ed-tabcard' + ( isActive ? ' active' : '' )
								}
								role="tab"
								aria-selected={ isActive }
							>
								<button
									className="ed-tabcard-open"
									title={
										tab.name +
										( tab.dims ? ' · ' + tab.dims : '' )
									}
									onClick={ () => {
										setArmed( null );
										setAnchor( null );
										onSelect( tab.id );
									} }
								>
									<span className="ed-tabcard-preview">
										{ src ? (
											<img
												src={ src }
												alt=""
												draggable={ false }
											/>
										) : (
											I.image( { size: 18 } )
										) }
									</span>
									<span className="ed-tabcard-name">
										{ tab.dirty && (
											<span className="ed-tab-dot" />
										) }
										<span className="ed-tabcard-title">
											{ tab.name ||
												__(
													'untitled',
													'wunderpaint'
												) }
										</span>
									</span>
								</button>
								<button
									className={
										'ed-tabcard-close' +
										( isArmed ? ' armed' : '' )
									}
									title={
										isArmed
											? __(
													'Click again to discard and close',
													'wunderpaint'
											  )
											: __( 'Close tab', 'wunderpaint' )
									}
									aria-label={ __(
										'Close tab',
										'wunderpaint'
									) }
									onClick={ () => {
										if ( tab.dirty && ! isArmed ) {
											setArmed( tab.id );
											return;
										}
										setArmed( null );
										onClose( tab.id );
									} }
									onBlur={ () => isArmed && setArmed( null ) }
								>
									{ I.close( { size: 11 } ) }
								</button>
							</div>
						);
					} ) }
				</div>
			) }
		</div>
	);
}
