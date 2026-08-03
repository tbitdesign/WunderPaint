/**
 * Quick-insert palette (v1.11, Canva's "/" menu): type to filter, Enter
 * inserts or opens the matching source.
 */

import { useState, useEffect, useRef } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { useEditor } from '../store/editor-context';
import { makeText, makeShape } from '../store/document';
import * as Ops from '../store/ops';

export function QuickInsert( { onClose, extras } ) {
	const editor = useEditor();
	const { state, dispatch, commit } = editor;
	const [ query, setQuery ] = useState( '' );
	const [ index, setIndex ] = useState( 0 );
	const inputRef = useRef( null );

	useEffect( () => {
		inputRef.current?.focus();
	}, [] );

	const center = ( w, h ) => ( {
		x: Math.round( ( state.doc.w - w ) / 2 ),
		y: Math.round( ( state.doc.h - h ) / 2 ),
		w,
		h,
	} );
	const addLayer = ( layer, label ) => {
		dispatch( { type: 'ADD_LAYER', layer } );
		commit( label );
	};
	const size = Math.round( Math.min( state.doc.w, state.doc.h ) * 0.3 );

	const commands = [
		{
			label: __( 'Text', 'wunderpaint' ),
			hint: __( 'Insert a text layer', 'wunderpaint' ),
			run: () =>
				addLayer(
					makeText( {
						text: __( 'Text', 'wunderpaint' ),
						...center( size * 2, Math.round( size / 2 ) ),
						fontSize: Math.round( size / 3 ),
						color: state.fgColor || '#1a1d21',
					} ),
					__( 'Insert Text', 'wunderpaint' )
				),
		},
		{
			label: __( 'Rectangle', 'wunderpaint' ),
			hint: __( 'Insert a rectangle', 'wunderpaint' ),
			run: () =>
				addLayer(
					makeShape( {
						...center( size, size ),
						fill: state.fgColor || '#3b66ff',
					} ),
					__( 'Insert Shape', 'wunderpaint' )
				),
		},
		{
			label: __( 'Ellipse', 'wunderpaint' ),
			hint: __( 'Insert an ellipse', 'wunderpaint' ),
			run: () =>
				addLayer(
					makeShape( {
						...center( size, size ),
						shape: 'ellipse',
						fill: state.fgColor || '#3b66ff',
					} ),
					__( 'Insert Shape', 'wunderpaint' )
				),
		},
		{
			label: __( 'Frame: Circle', 'wunderpaint' ),
			hint: __( 'Photo frame', 'wunderpaint' ),
			run: () => Ops.insertFrameOp( editor, 'circle' ),
		},
		{
			label: __( 'Icon…', 'wunderpaint' ),
			hint: __( 'Open the icon library', 'wunderpaint' ),
			run: () => extras.openIcons(),
		},
		{
			label: __( 'Emoji…', 'wunderpaint' ),
			hint: __( 'Open the emoji library', 'wunderpaint' ),
			run: () => extras.openEmoji(),
		},
		{
			label: __( 'Text combination…', 'wunderpaint' ),
			hint: __( 'Styled headline groups', 'wunderpaint' ),
			run: () => extras.openLibrary( 'text' ),
		},
		{
			label: __( 'Elements…', 'wunderpaint' ),
			hint: __( 'Arrows, blobs, badges…', 'wunderpaint' ),
			run: () => extras.openLibrary( 'elements' ),
		},
		{
			label: __( 'Background…', 'wunderpaint' ),
			hint: __( 'Gradients, patterns, colors', 'wunderpaint' ),
			run: () => extras.openLibrary( 'backgrounds' ),
		},
		{
			label: __( 'Image…', 'wunderpaint' ),
			hint: __( 'From the media library', 'wunderpaint' ),
			run: () => extras.openLibrary( 'uploads' ),
		},
		{
			label: __( 'Stock photo…', 'wunderpaint' ),
			hint: 'Pexels · Pixabay · Unsplash',
			run: () => extras.openStock(),
		},
		{
			label: __( 'Collage…', 'wunderpaint' ),
			hint: __( 'Photo grid, polaroid, filmstrip', 'wunderpaint' ),
			run: () => extras.openCollage?.(),
		},
		{
			label: __( 'Chart…', 'wunderpaint' ),
			hint: __( 'Bar, line, pie, donut', 'wunderpaint' ),
			run: () => extras.openChart(),
		},
		{
			label: __( 'QR code…', 'wunderpaint' ),
			hint: __( 'Link, Wi-Fi, vCard…', 'wunderpaint' ),
			run: () => Ops.insertQrOp( editor, extras ),
		},
		{
			label: __( 'Generate with AI…', 'wunderpaint' ),
			hint: __( 'Text to image', 'wunderpaint' ),
			run: () => dispatch( { type: 'SET_RIGHT_TAB', tab: 'ai' } ),
		},
		{
			label: __( 'Design Generator…', 'wunderpaint' ),
			hint: __( 'A whole design from a brief', 'wunderpaint' ),
			run: () => extras.openDesignAssistant(),
		},
	];

	const q = query.trim().toLowerCase();
	const matches = commands.filter(
		( c ) =>
			! q ||
			c.label.toLowerCase().includes( q ) ||
			c.hint.toLowerCase().includes( q )
	);
	const run = ( command ) => {
		onClose();
		command.run();
	};

	return (
		<div
			className="modal-backdrop quick-insert-backdrop"
			onClick={ onClose }
			role="presentation"
		>
			<div
				className="quick-insert"
				role="dialog"
				aria-label={ __( 'Quick insert', 'wunderpaint' ) }
				onClick={ ( e ) => e.stopPropagation() }
			>
				<input
					ref={ inputRef }
					type="text"
					placeholder={ __(
						'Insert… (type to filter)',
						'wunderpaint'
					) }
					value={ query }
					onChange={ ( e ) => {
						setQuery( e.target.value );
						setIndex( 0 );
					} }
					onKeyDown={ ( e ) => {
						e.stopPropagation();
						if ( 'Escape' === e.key ) {
							onClose();
						} else if ( 'ArrowDown' === e.key ) {
							e.preventDefault();
							setIndex( ( i ) =>
								Math.min( i + 1, matches.length - 1 )
							);
						} else if ( 'ArrowUp' === e.key ) {
							e.preventDefault();
							setIndex( ( i ) => Math.max( i - 1, 0 ) );
						} else if ( 'Enter' === e.key && matches[ index ] ) {
							run( matches[ index ] );
						}
					} }
				/>
				<div className="quick-insert-list">
					{ matches.map( ( command, i ) => (
						<button
							key={ command.label }
							className={ i === index ? 'active' : '' }
							onMouseEnter={ () => setIndex( i ) }
							onClick={ () => run( command ) }
						>
							<span>{ command.label }</span>
							<span className="quick-insert-hint">
								{ command.hint }
							</span>
						</button>
					) ) }
					{ ! matches.length && (
						<div
							className="quick-insert-hint"
							style={ { padding: 8 } }
						>
							{ __( 'No match.', 'wunderpaint' ) }
						</div>
					) }
				</div>
			</div>
		</div>
	);
}
