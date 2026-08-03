/**
 * Easy Mode tool rail (v1.166.0): the handful of things a beginner
 * actually does. Shapes, photos, templates and emoji all deep-link
 * into the bottom asset tray (the surface people use); CI tooltips
 * explain each tool, including the drop-a-photo-onto-a-shape trick.
 * The pro rail with its 20 tools stays untouched for the full editor.
 */

import { __ } from '@wordpress/i18n';

import { I } from '../../icons';
import { useTip } from '../../components/use-tip';
import { useEditor } from '../../store/editor-context';
import { makeText } from '../../store/document';

export function EasyToolbar() {
	const editor = useEditor();
	const { state, dispatch, commit } = editor;
	const { tipFor, tipNode } = useTip();

	const size = Math.round( Math.min( state.doc.w, state.doc.h ) * 0.3 );
	const center = ( w, h ) => ( {
		x: Math.round( ( state.doc.w - w ) / 2 ),
		y: Math.round( ( state.doc.h - h ) / 2 ),
		w,
		h,
	} );

	const addText = () => {
		dispatch( {
			type: 'ADD_LAYER',
			layer: makeText( {
				text: __( 'Your text', 'wunderpaint' ),
				...center( size * 2, Math.round( size / 2 ) ),
				fontSize: Math.round( size / 3 ),
				align: 'center',
				color: state.fgColor || '#1a1d21',
			} ),
		} );
		commit( __( 'Insert Text', 'wunderpaint' ) );
		dispatch( { type: 'SET_TOOL', tool: 'move' } );
	};

	// Shapes, photos, templates and emoji live in the bottom tray.
	// Unhide it first; the event fires a tick later so a freshly
	// mounted tray catches it.
	const openTray = ( sectionId ) => {
		if ( state.libraryHidden ) {
			dispatch( { type: 'TOGGLE_LIBRARY' } );
		}
		window.setTimeout( () => {
			window.dispatchEvent(
				new CustomEvent( 'wpie:tray-open', {
					detail: { section: sectionId },
				} )
			);
		}, 50 );
	};

	const tools = [
		{
			id: 'move',
			icon: 'cursor',
			label: __( 'Select', 'wunderpaint' ),
			tip: __(
				'Move and arrange the elements on your canvas.',
				'wunderpaint'
			),
			run: () => dispatch( { type: 'SET_TOOL', tool: 'move' } ),
			active: 'move' === state.tool || 'select' === state.tool,
		},
		{
			id: 'text',
			icon: 'text',
			label: __( 'Text', 'wunderpaint' ),
			tip: __(
				'Adds a text to the middle, double-click it to type.',
				'wunderpaint'
			),
			run: addText,
		},
		{
			id: 'shape',
			icon: 'shape',
			label: __( 'Shape', 'wunderpaint' ),
			tip: __(
				'Shapes from the library. Tip: drop a photo onto a shape and it fills the shape.',
				'wunderpaint'
			),
			run: () => openTray( 'elements' ),
		},
		{
			id: 'photo',
			icon: 'image',
			label: __( 'Photos', 'wunderpaint' ),
			tip: __(
				'Free stock photos. Drag one onto the canvas, or onto a shape to fill it.',
				'wunderpaint'
			),
			run: () => openTray( 'photos' ),
		},
		{
			id: 'templates',
			icon: 'textLayout',
			label: __( 'Templates', 'wunderpaint' ),
			tip: __(
				'Beautifully styled text combinations, one click inserts them.',
				'wunderpaint'
			),
			run: () => openTray( 'headlines' ),
		},
		{
			id: 'emoji',
			icon: 'sun',
			label: __( 'Emoji', 'wunderpaint' ),
			tip: __( 'Emoji as design elements.', 'wunderpaint' ),
			run: () => openTray( 'emoji' ),
		},
		{
			id: 'brush',
			icon: 'brush',
			label: __( 'Draw', 'wunderpaint' ),
			tip: __(
				'Paint freehand - then let AI Magic turn your sketch into a real picture.',
				'wunderpaint'
			),
			run: () => dispatch( { type: 'SET_TOOL', tool: 'brush' } ),
			active: 'brush' === state.tool,
		},
		{
			id: 'crop',
			icon: 'crop',
			label: __( 'Crop', 'wunderpaint' ),
			tip: __( 'Trim your design to a new size.', 'wunderpaint' ),
			run: () => dispatch( { type: 'SET_TOOL', tool: 'crop' } ),
			active: 'crop' === state.tool,
		},
	];

	return (
		<div className="ed-toolbar ed-easy-toolbar">
			{ tools.map( ( t ) => (
				<button
					key={ t.id }
					className={ 'ed-easy-tool' + ( t.active ? ' active' : '' ) }
					{ ...tipFor( t.tip ) }
					aria-label={ t.label }
					onClick={ t.run }
				>
					{ I[ t.icon ] ? I[ t.icon ]( { size: 40 } ) : null }
					<span>{ t.label }</span>
				</button>
			) ) }
			{ tipNode }
		</div>
	);
}
