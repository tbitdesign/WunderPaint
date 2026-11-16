/**
 * Replace Colors (v1.431.0): Edit → Replace Colors. A table of every solid
 * color on the page - swatch, value, how often it occurs - and next to each
 * one the color it becomes. Several colors can be mapped in one go, the
 * preview shows the whole mapping on the real design, Replace applies it
 * as one undo step. The scan and the replacement are pure
 * (src/lib/color-replace.js); this is the dialog.
 */

import { useState, useEffect, useMemo, useRef } from '@wordpress/element';
import { __, _n, sprintf } from '@wordpress/i18n';

import { I } from '../icons';
import { useEditor } from '../store/editor-context';
import { useEscape } from '../components/use-escape';
import { useColorEditor } from '../components/use-color-editor';
import { HelpLink } from './help-dialog';
import { renderToCanvas, sharedImageCache } from '../lib/raster';
import {
	scanColors,
	replaceColorMap,
	previewLayers,
	colorKey,
	HIT_KINDS,
} from '../lib/color-replace';

/** Longest edge of the preview, in CSS pixels. */
const PREVIEW = 380;

const kindLabel = ( id ) =>
	( {
		fill: __( 'Fills', 'wunderpaint' ),
		stroke: __( 'Strokes', 'wunderpaint' ),
		text: __( 'Text', 'wunderpaint' ),
		'text-outline': __( 'Text outlines', 'wunderpaint' ),
		characters: __( 'Styled characters', 'wunderpaint' ),
		gradient: __( 'Gradient stops', 'wunderpaint' ),
		effects: __( 'Effects', 'wunderpaint' ),
		background: __( 'Background', 'wunderpaint' ),
	} )[ id ] || id;

/**
 * The target cell of a row: empty (a dashed plus) until a color is picked,
 * then the picked swatch. Opens the normal color popover, starting from
 * the row's own color so a small shift is one drag away.
 */
function TargetSwatch( { from, value, onChange } ) {
	const shared = useColorEditor( {
		color: value || from,
		onChange,
		title: __( 'New color', 'wunderpaint' ),
	} );
	return (
		<span className="rc-target-cell">
			<button
				type="button"
				className={ `rc-target${ value ? ' is-set' : '' }` }
				style={ value ? { background: value } : undefined }
				title={ __( 'New color', 'wunderpaint' ) }
				aria-label={ __( 'New color', 'wunderpaint' ) }
				onClick={ ( e ) => shared.show( e.currentTarget ) }
			>
				{ ! value && I.plus( { size: 12 } ) }
			</button>
		</span>
	);
}

export function ReplaceColorsDialog( { onClose, extras } ) {
	const editor = useEditor();
	const { state, dispatch, commit } = editor;
	useEscape( onClose );

	// The scan is taken once: the dialog is modal, the page does not
	// change under it.
	const scan = useMemo(
		() => scanColors( state.layers, state.doc ),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[]
	);
	/** { [fromKey]: target } for the rows that have a new color. */
	const [ mapping, setMapping ] = useState( {} );
	const [ off, setOff ] = useState( () => new Set() );
	const [ side, setSide ] = useState( 'after' );
	const [ shots, setShots ] = useState( { before: null, after: null } );
	const seq = useRef( 0 );

	const mapped = scan.colors.filter( ( c ) => {
		const t = colorKey( mapping[ c.key ] );
		return t && t.key !== c.key;
	} );
	// The kinds on offer: those the mapped colors sit on, or all present
	// while nothing is mapped yet.
	const source = mapped.length ? mapped : scan.colors;
	const kindsPresent = HIT_KINDS.map( ( k ) => k.id ).filter( ( id ) =>
		source.some( ( c ) => c.kinds.includes( id ) )
	);
	const kinds = kindsPresent.filter( ( id ) => ! off.has( id ) );

	const result = useMemo(
		() =>
			mapped.length
				? replaceColorMap( state.layers, state.doc, mapping, { kinds } )
				: null,
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[ mapping, off ]
	);
	const changed = result ? result.changed : 0;
	const layersHit = result ? result.patches.size : 0;

	const setOne = ( key, color ) =>
		setMapping( ( m ) => ( { ...m, [ key ]: color } ) );
	const clearOne = ( key ) =>
		setMapping( ( m ) => {
			const next = { ...m };
			delete next[ key ];
			return next;
		} );

	/* ------------------------------ preview ------------------------------ */

	const scale = Math.min(
		1,
		PREVIEW / Math.max( 1, state.doc.w ),
		PREVIEW / Math.max( 1, state.doc.h )
	);
	const shoot = async ( layers, doc ) => {
		const canvas = await renderToCanvas( doc, layers, {
			scale,
			cache: sharedImageCache,
		} );
		return canvas.toDataURL( 'image/png' );
	};

	useEffect( () => {
		let alive = true;
		shoot( state.layers, state.doc )
			.then(
				( url ) =>
					alive && setShots( ( s ) => ( { ...s, before: url } ) )
			)
			.catch( () => {} );
		return () => {
			alive = false;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [] );

	useEffect( () => {
		if ( ! result ) {
			setShots( ( s ) => ( { ...s, after: null } ) );
			return undefined;
		}
		const mine = ++seq.current;
		const timer = setTimeout( () => {
			const layers = previewLayers( state.layers, result.patches );
			const doc = result.doc
				? { ...state.doc, ...result.doc }
				: state.doc;
			shoot( layers, doc )
				.then( ( url ) => {
					if ( mine === seq.current ) {
						setShots( ( s ) => ( { ...s, after: url } ) );
					}
				} )
				.catch( () => {} );
		}, 120 );
		return () => clearTimeout( timer );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ result ] );

	/* ------------------------------ actions ------------------------------ */

	const selectLayers = ( entry ) => {
		if ( entry.layerIds.length ) {
			dispatch( { type: 'SET_SELECTED', ids: entry.layerIds.slice() } );
		}
	};

	const apply = () => {
		if ( ! result || ! changed ) {
			return;
		}
		if ( result.patches.size ) {
			dispatch( {
				type: 'UPDATE_LAYERS',
				ids: Array.from( result.patches.keys() ),
				patchFor: ( l ) => result.patches.get( l.id ) || {},
			} );
		}
		if ( result.doc ) {
			dispatch( { type: 'SET_DOC', doc: result.doc } );
		}
		commit( __( 'Replace Colors', 'wunderpaint' ) );
		extras?.toasts?.success?.(
			sprintf(
				/* translators: %d: number of color uses changed. */ _n(
					'%d color use replaced.',
					'%d color uses replaced.',
					changed,
					'wunderpaint'
				),
				changed
			)
		);
		onClose();
	};

	const skipped = scan.skipped;
	const skippedTotal =
		skipped.hiddenOrLocked + skipped.generator + skipped.smart;
	const shown =
		'before' === side ? shots.before : shots.after || shots.before;

	return (
		<div className="modal-backdrop" onClick={ onClose } role="presentation">
			<div
				className="stock-dialog replace-colors-dialog"
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-modal="true"
				aria-label={ __( 'Replace Colors', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<div className="dsm-title-row">
							<span className="dsm-title">
								{ __( 'Replace Colors', 'wunderpaint' ) }
							</span>
							<HelpLink article="layers" extras={ extras } />
						</div>
						<div className="dsm-sub">
							{ __(
								'Swap one color for another across fills, strokes, text, gradients and effects, in one step.',
								'wunderpaint'
							) }
						</div>
					</div>
					<button
						className="dsm-close"
						onClick={ onClose }
						aria-label={ __( 'Close', 'wunderpaint' ) }
					>
						{ I.close( { size: 17 } ) }
					</button>
				</div>

				<div className="rc-body">
					<div className="rc-side">
						<div className="rc-head-row">
							<span className="rc-label">
								{ __( 'Colors in this design', 'wunderpaint' ) }
							</span>
							<span className="rc-label rc-label-target">
								{ __( 'Becomes', 'wunderpaint' ) }
							</span>
						</div>
						{ 0 === scan.colors.length && (
							<div className="library-hint">
								{ __(
									'No solid colors found on editable layers.',
									'wunderpaint'
								) }
							</div>
						) }
						<div className="rc-rows">
							{ scan.colors.map( ( c ) => {
								const target = mapping[ c.key ] || '';
								const set =
									!! target &&
									colorKey( target )?.key !== c.key;
								return (
									<div
										key={ c.key }
										className={ `rc-row${
											set ? ' is-set' : ''
										}` }
										title={ c.kinds
											.map( kindLabel )
											.join( ', ' ) }
									>
										<span
											className="rc-swatch"
											style={ { background: c.key } }
										/>
										<span className="rc-hex">
											{ c.key }
										</span>
										<span className="rc-count">
											{ c.count }
										</span>
										<span
											className="rc-arrow"
											aria-hidden="true"
										>
											→
										</span>
										<TargetSwatch
											from={ c.key }
											value={ set ? target : '' }
											onChange={ ( color ) =>
												setOne( c.key, color )
											}
										/>
										<button
											type="button"
											className="rc-icon"
											onClick={ () => clearOne( c.key ) }
											disabled={ ! set }
											title={ __(
												'Keep this color',
												'wunderpaint'
											) }
											aria-label={ __(
												'Keep this color',
												'wunderpaint'
											) }
										>
											{ I.close( { size: 12 } ) }
										</button>
										<button
											type="button"
											className="rc-icon"
											onClick={ () => selectLayers( c ) }
											disabled={ ! c.layerIds.length }
											title={ __(
												'Select layers with this color',
												'wunderpaint'
											) }
											aria-label={ __(
												'Select layers with this color',
												'wunderpaint'
											) }
										>
											{ I.search( { size: 13 } ) }
										</button>
									</div>
								);
							} ) }
						</div>

						{ kindsPresent.length > 0 && (
							<>
								<div className="rc-label">
									{ __( 'Where', 'wunderpaint' ) }
								</div>
								<div className="rc-kinds">
									{ kindsPresent.map( ( id ) => (
										<label key={ id } className="rc-kind">
											<input
												type="checkbox"
												data-checkbox="selection"
												checked={ ! off.has( id ) }
												onChange={ ( e ) => {
													const next = new Set( off );
													if ( e.target.checked ) {
														next.delete( id );
													} else {
														next.add( id );
													}
													setOff( next );
												} }
											/>
											<span>{ kindLabel( id ) }</span>
										</label>
									) ) }
								</div>
							</>
						) }

						{ skippedTotal > 0 && (
							<div className="rc-skipped">
								{ sprintf(
									/* translators: 1: hidden or locked layers, 2: layers in generator groups, 3: smart objects. */ __(
										'Left out: %1$d hidden or locked, %2$d in generator groups, %3$d smart objects.',
										'wunderpaint'
									),
									skipped.hiddenOrLocked,
									skipped.generator,
									skipped.smart
								) }
							</div>
						) }
					</div>

					<div className="rc-preview">
						<div className="rc-preview-tabs">
							<button
								className={ `ai-btn ghost sm${
									'before' === side ? ' active' : ''
								}` }
								onClick={ () => setSide( 'before' ) }
							>
								{ __( 'Before', 'wunderpaint' ) }
							</button>
							<button
								className={ `ai-btn ghost sm${
									'after' === side ? ' active' : ''
								}` }
								onClick={ () => setSide( 'after' ) }
								disabled={ ! result }
							>
								{ __( 'After', 'wunderpaint' ) }
							</button>
						</div>
						<div className="rc-preview-stage">
							{ shown ? (
								<img src={ shown } alt="" />
							) : (
								<span className="spin" />
							) }
						</div>
					</div>
				</div>

				<div className="dsm-foot">
					<span className="dsm-mono">
						{ result
							? sprintf(
									/* translators: 1: number of colors mapped, 2: number of color uses, 3: number of layers. */ __(
										'%1$d colors, %2$d uses on %3$d layers',
										'wunderpaint'
									),
									mapped.length,
									changed,
									layersHit + ( result.doc ? 1 : 0 )
							  )
							: __(
									'Pick a new color in the table to see the change.',
									'wunderpaint'
							  ) }
					</span>
					<div className="dsm-actions">
						<button className="ai-btn ghost" onClick={ onClose }>
							{ __( 'Cancel', 'wunderpaint' ) }
						</button>
						<button
							className="ai-btn primary"
							onClick={ apply }
							disabled={ ! result || ! changed }
						>
							{ __( 'Replace', 'wunderpaint' ) }
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
