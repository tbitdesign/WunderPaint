/**
 * The palette on the user's own design (Color Schemer, v1.432.0): one
 * small render of the page per variant, side by side, the chosen one
 * framed. Renders run one after another behind a short pause, so a
 * dragged slider does not queue dozens of them; a newer palette discards
 * the older run (sequence number). Holding Original shows the page as it
 * is in every tile.
 */

import { useEffect, useRef, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { previewLayers } from '../../lib/color-replace';
import { renderToCanvas, sharedImageCache } from '../../lib/raster';

/** Longest edge of a variant render, in pixels. */
const RENDER = 360;

const captionOf = ( v ) => {
	if ( v.inverted ) {
		return v.turn
			? __( 'Swapped, other accents', 'wunderpaint' )
			: __( 'Light and dark swapped', 'wunderpaint' );
	}
	return v.turn
		? __( 'Other accents', 'wunderpaint' )
		: __( 'Like your design', 'wunderpaint' );
};

export function DesignVariants( {
	doc,
	layers,
	variants,
	results,
	selected,
	onSelect,
	paletteKey,
} ) {
	const [ shots, setShots ] = useState( {} );
	const [ original, setOriginal ] = useState( null );
	const [ comparing, setComparing ] = useState( false );
	const seq = useRef( 0 );
	const scale = Math.min(
		1,
		RENDER / Math.max( 1, doc.w ),
		RENDER / Math.max( 1, doc.h )
	);
	const shoot = async ( nextLayers, nextDoc ) => {
		const canvas = await renderToCanvas( nextDoc, nextLayers, {
			scale,
			cache: sharedImageCache,
		} );
		return canvas.toDataURL( 'image/png' );
	};

	// The page as it is, once: the dialog is modal, nothing changes under it.
	useEffect( () => {
		let alive = true;
		shoot( layers, doc )
			.then( ( url ) => alive && setOriginal( url ) )
			.catch( () => {} );
		return () => {
			alive = false;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [] );

	useEffect( () => {
		const mine = ++seq.current;
		const timer = window.setTimeout( async () => {
			for ( let i = 0; i < results.length; i++ ) {
				if ( mine !== seq.current ) {
					return;
				}
				const result = results[ i ];
				try {
					const url = await shoot(
						previewLayers( layers, result.patches ),
						result.doc ? { ...doc, ...result.doc } : doc
					);
					if ( mine === seq.current ) {
						setShots( ( s ) => {
							const next = { ...s, [ i ]: url };
							for ( const k of Object.keys( next ) ) {
								if ( +k >= results.length ) {
									delete next[ k ];
								}
							}
							return next;
						} );
					}
				} catch ( e ) {}
			}
		}, 160 );
		return () => window.clearTimeout( timer );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ paletteKey ] );

	const ratio = `${ Math.max( 1, doc.w ) } / ${ Math.max( 1, doc.h ) }`;

	return (
		<div className="csd-variants-wrap">
			<div className="csd-stage-head">
				<span className="csd-stage-title">
					{ __( 'On your design', 'wunderpaint' ) }
				</span>
				<span className="csd-note">
					{ __(
						'Photos stay as they are. Linked colors follow their sources.',
						'wunderpaint'
					) }
				</span>
				<button
					type="button"
					className={ `ai-btn ghost sm${
						comparing ? ' active' : ''
					}` }
					title={ __(
						'Hold to see the design as it is',
						'wunderpaint'
					) }
					onPointerDown={ () => setComparing( true ) }
					onPointerUp={ () => setComparing( false ) }
					onPointerLeave={ () => setComparing( false ) }
					onPointerCancel={ () => setComparing( false ) }
					onKeyDown={ ( e ) =>
						( ' ' === e.key || 'Enter' === e.key ) &&
						setComparing( true )
					}
					onKeyUp={ () => setComparing( false ) }
					onBlur={ () => setComparing( false ) }
				>
					{ __( 'Original', 'wunderpaint' ) }
				</button>
			</div>
			<div className="csd-variants">
				{ variants.map( ( v, i ) => {
					const url = comparing ? original : shots[ i ];
					return (
						<button
							key={ i }
							type="button"
							className={ `csd-variant${
								i === selected ? ' is-on' : ''
							}` }
							aria-pressed={ i === selected }
							aria-label={ sprintf(
								/* translators: 1: variant number, 2: short description. */
								__( 'Variant %1$d: %2$s', 'wunderpaint' ),
								i + 1,
								captionOf( v )
							) }
							onClick={ () => onSelect( i ) }
						>
							<span
								className="csd-variant-img"
								style={ { aspectRatio: ratio } }
							>
								{ url ? (
									<img src={ url } alt="" />
								) : (
									<span className="spin" />
								) }
							</span>
							<span className="csd-variant-cap">
								{ captionOf( v ) }
							</span>
						</button>
					);
				} ) }
			</div>
		</div>
	);
}
