/**
 * The shape panel: the whole Shape Studio in reach while you work.
 *
 * It follows the brush panel exactly, because a shape IS a brush in the
 * way that matters - something you hold, tune and use over and over, not
 * something you configure once in a dialog. So: it appears when the shape
 * tool is active, it floats over the canvas, it is remembered per browser,
 * and it has no OK button. What you turn is what you get.
 *
 * TWO MODES, and the panel picks between them by itself:
 *
 *   nothing selected   the dials ARE the tool's options. The next drag on
 *                      the canvas draws exactly what the preview shows.
 *                      One button in the foot drops it in the middle for
 *                      when you do not feel like dragging.
 *   a shape selected   the dials are THAT layer's. They write as you turn
 *                      and land in the history when you let go, the same
 *                      contract the properties panel uses. No button, and
 *                      deliberately so: a button called Insert next to a
 *                      shape you are editing reads as Apply, and then you
 *                      press it and get a second shape.
 *
 * THE LAYOUT IS THE POINT, same as the brush panel, and two rules carry
 * it. The right-hand side is a FIXED 160px - preview, dials, one button -
 * so widening the panel gives you more SHAPES and never wider sliders.
 * And nothing in here may resize itself: the preview is a fixed square
 * and the panel a fixed height, because a window that hops every time you
 * click another shape is a window you stop clicking in.
 */

import { __ } from '@wordpress/i18n';
import { useState } from '@wordpress/element';

import { activeLayerOf } from '../../store/editor-context';
import {
	ShapeDials,
	ShapeGrid,
	ShapePreview,
	STUDIO_GROUPS,
	catalogLabel,
	cfgFromLayer,
	cfgFromToolOpts,
	layerPatch,
	newShapeLayer,
	pickPatch,
	shapeBox,
	toolOptsPatch,
} from '../shape-studio-core';

export function ShapePanel( { editor } ) {
	const { state, dispatch, commit } = editor;
	const active = activeLayerOf( state );
	const editLayer = active && 'shape' === active.type ? active : null;

	// NOT state. The cfg is read back out of the store on every render, so
	// the panel, the options bar and the layer can never drift apart - the
	// bug you get for free the moment a panel keeps its own copy.
	const cfg = editLayer
		? cfgFromLayer( editLayer, state.fgColor )
		: cfgFromToolOpts( state.toolOpts?.shape, state.fgColor );
	const box = shapeBox( cfg, state.doc, editLayer );

	const patch = ( p ) => {
		const next = { ...cfg, ...p };
		if ( editLayer ) {
			dispatch( {
				type: 'UPDATE_LAYER',
				id: editLayer.id,
				patch: layerPatch( next, editLayer.w, editLayer.h ),
			} );
			return;
		}
		// The shape tool paints with the foreground colour, so the fill
		// swatch IS the foreground swatch - exactly as in the brush panel.
		if ( undefined !== p.fill ) {
			dispatch( { type: 'SET_FG', color: p.fill } );
		}
		dispatch( {
			type: 'SET_TOOL_OPTS',
			tool: 'shape',
			patch: toolOptsPatch( next ),
		} );
	};

	// Tool options are not undoable, so only a live layer has anything to
	// put in the history - and only when the gesture ends.
	const onCommit = editLayer
		? () => commit( __( 'Edit shape', 'wunderpaint' ) )
		: undefined;

	const [ query, setQuery ] = useState( '' );

	const pick = ( entry ) => {
		patch( pickPatch( entry ) );
		onCommit?.();
	};

	const insert = () => {
		dispatch( {
			type: 'ADD_LAYER',
			layer: newShapeLayer( cfg, box, state.doc ),
		} );
		commit( __( 'Insert shape', 'wunderpaint' ) );
	};

	return (
		<div className="sp">
			<input
				type="search"
				className="ssd-search sp-search"
				placeholder={ __( 'Search shapes…', 'wunderpaint' ) }
				value={ query }
				onChange={ ( e ) => setQuery( e.target.value.toLowerCase() ) }
			/>

			<div className="sp-cols">
				{ /* All twelve groups in one roll with sticky headings, the
				     way the modal shows them. A dropdown was quicker to
				     build and slower to USE: you cannot see what you are
				     looking for while it is behind a menu (Thomas). */ }
				<ShapeGrid
					groups={ STUDIO_GROUPS }
					query={ query }
					entryKey={ cfg.entryKey }
					onPick={ pick }
					className="ssd-grid sp-grid"
				/>

				<div className="sp-side">
					<div className="sp-stage">
						<ShapePreview cfg={ cfg } box={ box } area={ 138 } />
					</div>
					<div className="sp-dials">
						<ShapeDials
							cfg={ cfg }
							patch={ patch }
							box={ box }
							onCommit={ onCommit }
							heading={ catalogLabel( cfg ) }
						/>
					</div>
					<div className="sp-foot">
						{ editLayer ? (
							<span className="sp-live">
								{ __(
									'Changes apply as you turn',
									'wunderpaint'
								) }
							</span>
						) : (
							<button
								className="ai-btn primary"
								onClick={ insert }
							>
								{ __( 'Insert shape', 'wunderpaint' ) }
							</button>
						) }
					</div>
				</div>
			</div>
		</div>
	);
}
