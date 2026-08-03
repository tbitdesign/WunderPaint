/**
 * Status bar (spec 04.4): dimensions · mode · memory · tool · zoom control.
 */

import { useState, useEffect } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { I } from '../icons';
import { TOOLS } from '../store/constants';
import { useEditor } from '../store/editor-context';

export function EditorStatusBar( { onFit } ) {
	const { state, dispatch } = useEditor();
	const { doc, zoom, tool } = state;
	const [ zoomText, setZoomText ] = useState(
		Math.round( zoom * 100 ) + '%'
	);

	useEffect( () => setZoomText( Math.round( zoom * 100 ) + '%' ), [ zoom ] );

	const applyZoomText = () => {
		const parsed = parseFloat( zoomText.replace( '%', '' ) );
		if ( ! Number.isNaN( parsed ) && parsed > 0 ) {
			dispatch( { type: 'SET_ZOOM', zoom: parsed / 100 } );
		} else {
			setZoomText( Math.round( zoom * 100 ) + '%' );
		}
	};

	const toolLabel = TOOLS.find( ( t ) => t.id === tool )?.label || tool;
	const proof = state.proof;

	// Unit toggle px → cm → in (F15, v0.5); print sizes use doc.dpi (72 default).
	const [ unit, setUnit ] = useState( 'px' );
	const dpi = doc.dpi || 72;
	const dims =
		'cm' === unit
			? `${ ( ( doc.w / dpi ) * 2.54 ).toFixed( 1 ) } × ${ (
					( doc.h / dpi ) *
					2.54
			  ).toFixed( 1 ) } cm`
			: 'in' === unit
			? `${ ( doc.w / dpi ).toFixed( 2 ) } × ${ ( doc.h / dpi ).toFixed(
					2
			  ) } in`
			: `${ doc.w } × ${ doc.h } px`;

	return (
		<div className="ed-status">
			{ proof && (
				<span
					className="group"
					style={ { color: 'var(--accent)', fontWeight: 600 } }
					title={ __(
						'View-only color proof is active (View → Proof Colors)',
						'wunderpaint'
					) }
				>
					{ __( 'Proof', 'wunderpaint' ) }: { proof }
				</span>
			) }
			<button
				className="group"
				style={ {
					cursor: 'pointer',
					background: 'none',
					border: 0,
					color: 'inherit',
					font: 'inherit',
				} }
				title={ `${ __(
					'Click to switch units',
					'wunderpaint'
				) } · ${ dpi } DPI` }
				onClick={ () =>
					setUnit(
						'px' === unit ? 'cm' : 'cm' === unit ? 'in' : 'px'
					)
				}
			>
				{ dims }
			</button>
			<div className="group">
				{ 'rgb16' === doc.colorMode
					? 'RGB · 16-bit'
					: 'cmyk8' === doc.colorMode
					? 'CMYK · 8-bit'
					: 'RGB · 8-bit' }
			</div>
			<div className="group">
				~{ ( ( doc.w * doc.h * 4 ) / 1024 / 1024 ).toFixed( 1 ) } MB
			</div>
			<div className="spacer" />
			<div className="group">
				{ __( 'Tool:', 'wunderpaint' ) }{ ' ' }
				<b style={ { color: 'var(--ed-text)' } }>{ toolLabel }</b>
			</div>
			<div className="group zoom-ctl">
				<button
					title={ __(
						'Reveal what lies outside the canvas - parked layers become visible, export is unchanged.',
						'wunderpaint'
					) }
					onClick={ () =>
						dispatch( {
							type: 'SET_PASTEBOARD',
							on: ! state.revealPasteboard,
						} )
					}
				>
					{ state.revealPasteboard
						? I.eye( { size: 14 } )
						: I.eyeOff( { size: 14 } ) }
				</button>
				<button
					onClick={ () =>
						dispatch( { type: 'SET_ZOOM', zoom: zoom / 1.25 } )
					}
					aria-label={ __( 'Zoom out', 'wunderpaint' ) }
				>
					−
				</button>
				<input
					value={ zoomText }
					onChange={ ( e ) => setZoomText( e.target.value ) }
					onBlur={ applyZoomText }
					onKeyDown={ ( e ) => 'Enter' === e.key && applyZoomText() }
					aria-label={ __( 'Zoom level', 'wunderpaint' ) }
				/>
				<button
					onClick={ () =>
						dispatch( { type: 'SET_ZOOM', zoom: zoom * 1.25 } )
					}
					aria-label={ __( 'Zoom in', 'wunderpaint' ) }
				>
					+
				</button>
				<button
					className="zoom-fit"
					onClick={ onFit }
					title={ __( 'Fit to view (⌘0)', 'wunderpaint' ) }
				>
					{ __( 'Fit', 'wunderpaint' ) }
				</button>
			</div>
		</div>
	);
}
