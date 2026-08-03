/**
 * First-run tour (F14, v0.5): a spotlight walk over the real UI, one
 * step per STEPS entry.
 * Shown once (localStorage), restartable via Help → Show Tour.
 */

import { useState, useEffect } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

const STEPS = [
	{
		selector: '.ed-toolbar',
		title: __( 'Tools', 'wunderpaint' ),
		body: __(
			'20 tools with keyboard shortcuts (V, B, T …). The options bar above the canvas adapts to the active tool.',
			'wunderpaint'
		),
	},
	{
		selector: '.ed-canvas-area',
		title: __( 'Canvas', 'wunderpaint' ),
		body: __(
			'Hold Space to pan, ⌘+/− to zoom. Everything you paint lands on layers, nothing touches your original until you save.',
			'wunderpaint'
		),
	},
	{
		selector: '.ed-right-tabs',
		title: __( 'Panels', 'wunderpaint' ),
		body: __(
			'Layers, properties, adjustments, effects, history and the AI Studio with its one-click image actions live here.',
			'wunderpaint'
		),
	},
	{
		selector: '.ed-menubar',
		title: __( 'Menus', 'wunderpaint' ),
		body: __(
			'Photoshop-style menus: Image, Layer, Select and Filter work on your document; View holds proofing, guides and the post preview.',
			'wunderpaint'
		),
	},
	{
		selector: '[data-menu="assets"]',
		title: __( 'Assets', 'wunderpaint' ),
		body: __(
			'Everything you design with: the Asset Library, stock photos, the Asset Generator, your Brand Kits and the Media Library Manager.',
			'wunderpaint'
		),
	},
	{
		selector: '.library-tray',
		title: __( 'Asset Library tray', 'wunderpaint' ),
		body: __(
			'Quick access under the canvas: text lockups, shapes, icons, photos, brand-kit logos, dynamic and starter templates. Click or drag onto the canvas.',
			'wunderpaint'
		),
	},
	{
		selector: '[data-menu="automation"]',
		title: __( 'Automation', 'wunderpaint' ),
		// The tour runs once, on first contact, and three of the four tools
		// this used to promise are removed from the menu entirely without a
		// Pro licence (proHas in editor-menubar.jsx). Describe what the
		// reader will actually find behind the highlighted menu.
		body: () =>
			window.WPIE?.pro?.active
				? __(
						'Generate Content writes complete draft posts, Featured Images fills whole archives with branded thumbnails, the Design Generator turns a brief into a design, and the Image Processor batch-edits your library.',
						'wunderpaint'
				  )
				: __(
						'The Design Generator turns a brief into a finished design, Batch Watermark stamps many images in one run, and the Metadata Assistant fills in alt text across your library. Pro adds the bulk runs on top: featured images across a whole archive, draft posts, CSV series and the Image Processor.',
						'wunderpaint'
				  ),
	},
	{
		selector: '.ed-titlebar button.primary',
		title: __( 'Saving', 'wunderpaint' ),
		body: __(
			'Save to Media Library keeps versions of the original (restorable in History). Save as New Image creates a fresh attachment; editable work lives in Designs.',
			'wunderpaint'
		),
	},
	{
		selector: '[data-menu="help"]',
		title: __( 'Help', 'wunderpaint' ),
		body: __(
			'The Handbook explains every part of the editor with step-by-step articles, and the "?" in any dialog jumps straight to the right one. Replay this tour anytime via Help → Show Tour.',
			'wunderpaint'
		),
	},
];

export const tourDone = () => {
	try {
		return '1' === window.localStorage?.getItem( 'wpie-tour-done' );
	} catch ( e ) {
		return true;
	}
};

/** Generic spotlight tour (v0.8), used by onboarding and help guides. */
export function SpotlightTour( { steps, onClose, editor, extras, doneLabel } ) {
	const [ step, setStep ] = useState( 0 );
	const [ rect, setRect ] = useState( null );

	useEffect( () => {
		try {
			steps[ step ].before?.( editor, extras );
		} catch ( e ) {}
		// Wait a tick so `before` UI changes (tab switches) settle.
		const timer = setTimeout( () => {
			const el = document.querySelector( steps[ step ].selector );
			if ( el ) {
				const r = el.getBoundingClientRect();
				setRect( { x: r.left, y: r.top, w: r.width, h: r.height } );
			} else {
				setRect( null );
			}
		}, 120 );
		return () => clearTimeout( timer );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ step ] );

	const finish = onClose;

	const current = steps[ step ];
	const boxTop = rect
		? Math.min( window.innerHeight - 180, rect.y + rect.h / 2 )
		: 200;
	const boxLeft = rect
		? Math.max(
				16,
				Math.min( window.innerWidth - 336, rect.x + rect.w + 16 )
		  )
		: window.innerWidth / 2 - 160;

	return (
		<div
			className="wpie-tour"
			role="dialog"
			aria-label={ __( 'Editor tour', 'wunderpaint' ) }
		>
			{ ! rect && <div className="wpie-tour-veil" /> }
			{ rect && (
				<div
					className="wpie-tour-spot"
					style={ {
						left: rect.x - 6,
						top: rect.y - 6,
						width: rect.w + 12,
						height: rect.h + 12,
					} }
				/>
			) }
			<div
				className="wpie-tour-box"
				style={ { left: boxLeft, top: boxTop } }
			>
				<div className="wpie-tour-step">
					{ step + 1 } / { steps.length }
				</div>
				<div className="wpie-tour-title">{ current.title }</div>
				{ /* A step may compute its text (licence-dependent wording). */ }
				<div className="wpie-tour-body">
					{ 'function' === typeof current.body
						? current.body()
						: current.body }
				</div>
				<div className="wpie-tour-buttons">
					<button className="ai-btn secondary" onClick={ finish }>
						{ __( 'Skip', 'wunderpaint' ) }
					</button>
					{ step < steps.length - 1 ? (
						<button
							className="ai-btn primary"
							onClick={ () => setStep( step + 1 ) }
						>
							{ __( 'Next', 'wunderpaint' ) }
						</button>
					) : (
						<button className="ai-btn primary" onClick={ finish }>
							{ doneLabel ||
								__( 'Start editing', 'wunderpaint' ) }
						</button>
					) }
				</div>
			</div>
		</div>
	);
}

export function OnboardingTour( { onClose } ) {
	return (
		<SpotlightTour
			steps={ STEPS }
			onClose={ () => {
				try {
					window.localStorage?.setItem( 'wpie-tour-done', '1' );
				} catch ( e ) {}
				onClose();
			} }
		/>
	);
}
