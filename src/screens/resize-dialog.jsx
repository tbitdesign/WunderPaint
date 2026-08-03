/**
 * Image Size / Canvas Size dialogs (v1.1.1), Photoshop-style: separate
 * width/height fields with an aspect-ratio chain, px/% units; Canvas Size
 * adds the classic 3×3 anchor grid and a "relative" mode.
 */

import { useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { I } from '../icons';
import { useEditor } from '../store/editor-context';
import { useEscape } from '../components/use-escape';
import { HelpLink } from './help-dialog';
import { scaleDoc, resizeCanvasDoc } from '../store/doc-ops';

const ANCHORS = [
	[ 'tl', 't', 'tr' ],
	[ 'l', 'center', 'r' ],
	[ 'bl', 'b', 'br' ],
];

const ARROWS = {
	tl: '↖',
	t: '↑',
	tr: '↗',
	l: '←',
	center: '·',
	r: '→',
	bl: '↙',
	b: '↓',
	br: '↘',
};

export function ResizeDialog( { mode, onClose, extras } ) {
	const editor = useEditor();
	const { doc } = editor.state;
	const isCanvas = 'canvas' === mode;
	const [ unit, setUnit ] = useState( 'px' );
	const [ linked, setLinked ] = useState( true );
	const [ relative, setRelative ] = useState( false );
	const [ anchor, setAnchor ] = useState( 'center' );
	const [ w, setW ] = useState( doc.w );
	const [ h, setH ] = useState( doc.h );
	useEscape( onClose );

	const ratio = doc.w / doc.h;

	// Current fields → absolute pixels.
	const toPx = ( value, base ) =>
		'%' === unit
			? Math.round( ( value / 100 ) * base )
			: Math.round( value );
	const finalW = relative ? doc.w + toPx( w, doc.w ) : toPx( w, doc.w );
	const finalH = relative ? doc.h + toPx( h, doc.h ) : toPx( h, doc.h );
	const valid =
		finalW >= 1 && finalH >= 1 && finalW <= 12000 && finalH <= 12000;

	const switchUnit = ( next ) => {
		if ( next === unit ) {
			return;
		}
		if ( relative ) {
			setW( 0 );
			setH( 0 );
		} else if ( '%' === next ) {
			setW( Math.round( ( toPx( w, doc.w ) / doc.w ) * 100 ) );
			setH( Math.round( ( toPx( h, doc.h ) / doc.h ) * 100 ) );
		} else {
			setW( toPx( w, doc.w ) );
			setH( toPx( h, doc.h ) );
		}
		setUnit( next );
	};

	const setWidth = ( value ) => {
		setW( value );
		if ( linked && ! relative && ! isCanvas ) {
			setH(
				'%' === unit
					? value
					: Math.max( 1, Math.round( value / ratio ) )
			);
		}
	};
	const setHeight = ( value ) => {
		setH( value );
		if ( linked && ! relative && ! isCanvas ) {
			setW(
				'%' === unit
					? value
					: Math.max( 1, Math.round( value * ratio ) )
			);
		}
	};

	const apply = () => {
		if ( ! valid ) {
			return;
		}
		if ( isCanvas ) {
			resizeCanvasDoc( editor, finalW, finalH, anchor );
		} else {
			if ( finalW * finalH > 24000000 ) {
				extras.toasts.error(
					__(
						'That exceeds 24 megapixels, choose a smaller size.',
						'wunderpaint'
					)
				);
				return;
			}
			scaleDoc( editor, finalW, finalH );
		}
		onClose();
	};

	const field = ( label, value, onChange, ariaLabel ) => (
		<label style={ { display: 'grid', gap: 4, fontSize: 12 } }>
			{ label }
			<div style={ { display: 'flex', gap: 4, alignItems: 'center' } }>
				<input
					type="number"
					value={ value }
					style={ { width: 90 } }
					aria-label={ ariaLabel }
					onKeyDown={ ( e ) => 'Enter' === e.key && apply() }
					onChange={ ( e ) =>
						onChange( Math.round( +e.target.value || 0 ) )
					}
				/>
				<span style={ { color: 'var(--ed-text-muted)' } }>
					{ unit }
				</span>
			</div>
		</label>
	);

	return (
		<div className="modal-backdrop" onClick={ onClose } role="presentation">
			<div
				className="stock-dialog"
				style={ {
					width: 400,
					height: 'auto',
					gridTemplateRows: 'auto 1fr',
				} }
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-label={
					isCanvas
						? __( 'Canvas Size', 'wunderpaint' )
						: __( 'Image Size', 'wunderpaint' )
				}
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<div className="dsm-title-row">
							<span className="dsm-title">
								{ isCanvas
									? __( 'Canvas Size', 'wunderpaint' )
									: __( 'Image Size', 'wunderpaint' ) }
							</span>
							<HelpLink article="resize" extras={ extras } />
						</div>
						<div className="dsm-sub">
							{ __(
								'Change the pixel dimensions.',
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
				<div style={ { padding: 16, display: 'grid', gap: 14 } }>
					<div
						style={ {
							fontSize: 12,
							color: 'var(--ed-text-muted)',
						} }
					>
						{ sprintf(
							/* translators: 1: width, 2: height. */
							__( 'Current size: %1$d × %2$d px', 'wunderpaint' ),
							doc.w,
							doc.h
						) }
					</div>
					<div
						style={ {
							display: 'flex',
							gap: 14,
							alignItems: 'center',
						} }
					>
						{ field(
							__( 'Width', 'wunderpaint' ),
							w,
							setWidth,
							__( 'Width', 'wunderpaint' )
						) }
						{ ! isCanvas && (
							<button
								className={ `resize-link${
									linked ? ' active' : ''
								}` }
								title={
									linked
										? __(
												'Unlink aspect ratio',
												'wunderpaint'
										  )
										: __(
												'Link aspect ratio',
												'wunderpaint'
										  )
								}
								aria-pressed={ linked }
								onClick={ () => setLinked( ! linked ) }
							>
								{ linked ? '🔗' : '⛓️‍💥' }
							</button>
						) }
						{ field(
							__( 'Height', 'wunderpaint' ),
							h,
							setHeight,
							__( 'Height', 'wunderpaint' )
						) }
						<div
							className="seg-row"
							style={ { display: 'flex', alignSelf: 'end' } }
						>
							{ [ 'px', '%' ].map( ( u ) => (
								<button
									key={ u }
									className={ unit === u ? 'active' : '' }
									onClick={ () => switchUnit( u ) }
								>
									{ u }
								</button>
							) ) }
						</div>
					</div>
					{ isCanvas && (
						<div
							style={ {
								display: 'flex',
								gap: 18,
								alignItems: 'flex-start',
							} }
						>
							<label
								style={ {
									display: 'flex',
									gap: 6,
									alignItems: 'center',
									fontSize: 12,
									marginTop: 4,
								} }
							>
								<input
									type="checkbox"
									checked={ relative }
									onChange={ ( e ) => {
										setRelative( e.target.checked );
										setW( e.target.checked ? 0 : doc.w );
										setH( e.target.checked ? 0 : doc.h );
									} }
								/>
								{ __( 'Relative', 'wunderpaint' ) }
							</label>
							<div>
								<div
									style={ {
										fontSize: 11,
										color: 'var(--ed-text-muted)',
										textTransform: 'uppercase',
										letterSpacing: 0.5,
										marginBottom: 4,
									} }
								>
									{ __( 'Anchor', 'wunderpaint' ) }
								</div>
								<div
									className="anchor-grid"
									role="radiogroup"
									aria-label={ __( 'Anchor', 'wunderpaint' ) }
								>
									{ ANCHORS.flat().map( ( a ) => (
										<button
											key={ a }
											role="radio"
											aria-checked={ anchor === a }
											aria-label={ a }
											className={
												anchor === a ? 'active' : ''
											}
											onClick={ () => setAnchor( a ) }
										>
											{ ARROWS[ a ] }
										</button>
									) ) }
								</div>
							</div>
						</div>
					) }
					<div
						style={ {
							fontSize: 12,
							color: valid
								? 'var(--ed-text-dim)'
								: 'var(--danger, #d63638)',
						} }
					>
						{ valid
							? sprintf(
									/* translators: 1: width, 2: height. */
									__(
										'New size: %1$d × %2$d px',
										'wunderpaint'
									),
									finalW,
									finalH
							  )
							: __(
									'Enter a size between 1 and 12000 px.',
									'wunderpaint'
							  ) }
					</div>
					<div
						style={ {
							display: 'flex',
							gap: 8,
							justifyContent: 'flex-end',
						} }
					>
						<button
							className="ai-btn secondary"
							onClick={ onClose }
						>
							{ __( 'Cancel', 'wunderpaint' ) }
						</button>
						<button
							className="ai-btn primary"
							disabled={ ! valid }
							onClick={ apply }
						>
							{ __( 'Apply', 'wunderpaint' ) }
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
