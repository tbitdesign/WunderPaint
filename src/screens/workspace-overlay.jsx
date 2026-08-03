/**
 * Interactive Workspace picker (v1.184.0): hover a main-UI region and click
 * to hide or show it. While it runs, the hiding stylesheet is paused (the
 * `wpie-ws-picking` class), so every region stays visible and clickable;
 * already-hidden regions are marked with a dashed outline so a click brings
 * them back. Hold Alt to target the parent region instead of the innermost.
 */

import { useEffect, useRef, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { useEscape } from '../components/use-escape';
import {
	setPicking,
	markHiddenRegions,
	isKeyHidden,
	toggleKey,
} from '../lib/workspace';
import { workspaceCatalog } from '../lib/workspace-registry';

export function WorkspaceOverlay( { onClose } ) {
	useEscape( onClose );
	const [ box, setBox ] = useState( null );
	const labels = useRef( {} );

	useEffect( () => {
		labels.current = Object.fromEntries(
			workspaceCatalog().map( ( e ) => [ e.key, e.label ] )
		);

		setPicking( true );
		markHiddenRegions( true );

		const root = document.getElementById( 'wpie-root' );

		// Walk from the hovered element up to the nearest annotated region;
		// with Alt held, step one region further out.
		const targetFrom = ( el, alt ) => {
			const chain = [];
			let node = el;
			while ( node && node !== root && node !== document.body ) {
				if ( node.hasAttribute && node.hasAttribute( 'data-ws' ) ) {
					chain.push( node );
				}
				node = node.parentElement;
			}
			if ( ! chain.length ) {
				return null;
			}
			return alt && chain[ 1 ] ? chain[ 1 ] : chain[ 0 ];
		};

		const describe = ( e ) => {
			const el = document.elementFromPoint( e.clientX, e.clientY );
			const t = el && targetFrom( el, e.altKey );
			if ( ! t ) {
				setBox( null );
				return;
			}
			const r = t.getBoundingClientRect();
			const k = t.getAttribute( 'data-ws' );
			setBox( {
				x: r.left,
				y: r.top,
				w: r.width,
				h: r.height,
				hidden: isKeyHidden( k ),
				label: labels.current[ k ] || k,
			} );
		};

		const onMove = ( e ) => describe( e );
		const onClick = ( e ) => {
			const el = document.elementFromPoint( e.clientX, e.clientY );
			const t = el && targetFrom( el, e.altKey );
			if ( ! t ) {
				return; // let clicks on the picker bar / outside pass through
			}
			e.preventDefault();
			e.stopPropagation();
			toggleKey( t.getAttribute( 'data-ws' ) );
			markHiddenRegions( true );
			describe( e );
		};

		document.addEventListener( 'mousemove', onMove, true );
		document.addEventListener( 'click', onClick, true );
		return () => {
			document.removeEventListener( 'mousemove', onMove, true );
			document.removeEventListener( 'click', onClick, true );
			markHiddenRegions( false );
			setPicking( false );
		};
	}, [] );

	return (
		<>
			{ box && (
				<div
					className="wpie-ws-hl"
					style={ {
						left: box.x,
						top: box.y,
						width: box.w,
						height: box.h,
					} }
				>
					<span className="wpie-ws-hl-label">
						{ ( box.hidden
							? __( 'Show:', 'wunderpaint' )
							: __( 'Hide:', 'wunderpaint' ) ) +
							' ' +
							box.label }
					</span>
				</div>
			) }
			<div
				className="wpie-ws-pickbar"
				role="dialog"
				aria-label={ __( 'Customize workspace', 'wunderpaint' ) }
			>
				<span>
					{ __(
						'Click a region to hide or show it, or use the Workspace list for anything not on screen. Hold Alt to target the parent.',
						'wunderpaint'
					) }
				</span>
				<button className="ai-btn primary" onClick={ onClose }>
					{ __( 'Done', 'wunderpaint' ) }
				</button>
			</div>
		</>
	);
}
