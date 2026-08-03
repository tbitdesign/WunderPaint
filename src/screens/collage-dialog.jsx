/**
 * Collage & Photo Grid (v1.375.0): pick images from the media library,
 * choose a layout (grid, mosaic, polaroid, filmstrip, contact sheet),
 * tune gaps, corners and frames on a live preview, then insert the whole
 * collage as an editable layer group - every photo stays a normal image
 * layer afterwards.
 */

import { useEffect, useMemo, useRef, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { I } from '../icons';
import { useEditor } from '../store/editor-context';
import { useEscape } from '../components/use-escape';
import { SwatchButton } from '../components/color-popover';
import { HelpLink } from './help-dialog';
import { wpMediaPick } from '../lib/media-pick';
import { collageLayerSpecs, LAYOUTS } from '../lib/collage';
import { makeGroup, makeImage, makeShape, makeText } from '../store/document';

const clamp = ( v, lo, hi ) => Math.min( hi, Math.max( lo, v ) );

/** Trace a rounded rect path (same arcTo recipe the renderer uses). */
function roundedPath( ctx, w, h, r ) {
	const rr = clamp( r || 0, 0, Math.min( w, h ) / 2 );
	ctx.beginPath();
	ctx.moveTo( rr, 0 );
	ctx.arcTo( w, 0, w, h, rr );
	ctx.arcTo( w, h, 0, h, rr );
	ctx.arcTo( 0, h, 0, 0, rr );
	ctx.arcTo( 0, 0, w, 0, rr );
	ctx.closePath();
}

/** Cover-crop draw, centered - mirrors the image layer default. */
function coverDraw( ctx, img, w, h ) {
	const iw = img.naturalWidth || img.width;
	const ih = img.naturalHeight || img.height;
	if ( ! iw || ! ih ) {
		return;
	}
	const s = Math.max( w / iw, h / ih );
	const sw = w / s;
	const sh = h / s;
	ctx.drawImage( img, ( iw - sw ) / 2, ( ih - sh ) / 2, sw, sh, 0, 0, w, h );
}

/** One spec -> one editable layer (kinds map to the layer factories). */
function specToLayer( spec, layout ) {
	const isPolaroid = 'polaroid' === layout;
	if ( 'photo' === spec.kind ) {
		return {
			...makeImage( {
				name: `Photo ${ spec.index + 1 }`,
				src: spec.src,
				naturalW: spec.natW,
				naturalH: spec.natH,
				x: spec.x,
				y: spec.y,
				w: spec.w,
				h: spec.h,
			} ),
			radius: spec.radius || 0,
			rot: spec.rot || 0,
		};
	}
	if ( 'caption' === spec.kind ) {
		return {
			...makeText( {
				name: 'Caption',
				text: spec.text || ' ',
				x: spec.x,
				y: spec.y,
				w: spec.w,
				h: spec.h,
				fontSize: Math.round( clamp( spec.h * 0.45, 10, 30 ) ),
				fontFamily: isPolaroid ? 'Lora' : 'Inter',
				italic: isPolaroid,
				weight: 500,
				color: '#4a4e55',
				align: 'center',
				valign: 'middle',
				fixedWidth: true,
			} ),
			rot: spec.rot || 0,
		};
	}
	// card / strip / holes are shapes.
	const names = {
		card: 'Card',
		strip: 'Film strip',
		holes: 'Perforation',
	};
	return {
		...makeShape( {
			name: names[ spec.kind ] || 'Shape',
			shape: 'rect',
			x: spec.x,
			y: spec.y,
			w: spec.w,
			h: spec.h,
			fill: spec.fill,
			radius: spec.radius || 0,
			...( spec.pathD ? { pathD: spec.pathD } : {} ),
		} ),
		rot: spec.rot || 0,
	};
}

export function CollageDialog( { onClose, extras } ) {
	const editor = useEditor();
	const { state, dispatch, commit } = editor;
	const { doc } = state;
	const [ picks, setPicks ] = useState( [] );
	const [ layout, setLayout ] = useState( 'grid' );
	const [ gap, setGap ] = useState( 16 );
	const [ radius, setRadius ] = useState( 0 );
	const [ frame, setFrame ] = useState( 0 );
	const [ cols, setCols ] = useState( 0 );
	const [ seed, setSeed ] = useState( 1 );
	const [ captions, setCaptions ] = useState( true );
	const [ frameColor, setFrameColor ] = useState( '#ffffff' );
	const [ loadTick, setLoadTick ] = useState( 0 );
	const canvasRef = useRef( null );
	const imgCache = useRef( new Map() );
	useEscape( onClose );

	const specs = useMemo(
		() =>
			collageLayerSpecs( picks, {
				width: doc.w,
				height: doc.h,
				layout,
				gap,
				cols,
				seed,
				frame,
				radius,
				captions,
				frameColor,
			} ),
		[
			picks,
			doc.w,
			doc.h,
			layout,
			gap,
			cols,
			seed,
			frame,
			radius,
			captions,
			frameColor,
		]
	);

	// Warm the preview thumbnails once per pick.
	useEffect( () => {
		picks.forEach( ( p ) => {
			const src = p.preview || p.src;
			if ( imgCache.current.has( src ) ) {
				return;
			}
			const img = new window.Image();
			img.crossOrigin = 'anonymous';
			img.onload = () => setLoadTick( ( t ) => t + 1 );
			img.src = src;
			imgCache.current.set( src, img );
		} );
	}, [ picks ] );

	// Live preview: doc coordinates, scaled into the canvas box.
	useEffect( () => {
		const canvas = canvasRef.current;
		if ( ! canvas ) {
			return;
		}
		const boxW = 560;
		const boxH = 420;
		const scale = Math.min( boxW / doc.w, boxH / doc.h );
		canvas.width = Math.round( doc.w * scale );
		canvas.height = Math.round( doc.h * scale );
		const ctx = canvas.getContext( '2d' );
		ctx.setTransform( scale, 0, 0, scale, 0, 0 );
		ctx.fillStyle = '#eef0f3';
		ctx.fillRect( 0, 0, doc.w, doc.h );
		specs.forEach( ( spec ) => {
			ctx.save();
			ctx.translate( spec.x + spec.w / 2, spec.y + spec.h / 2 );
			ctx.rotate( ( ( spec.rot || 0 ) * Math.PI ) / 180 );
			ctx.translate( -spec.w / 2, -spec.h / 2 );
			if ( 'photo' === spec.kind ) {
				const img = imgCache.current.get(
					( picks[ spec.index ] || {} ).preview || spec.src
				);
				roundedPath( ctx, spec.w, spec.h, spec.radius );
				ctx.clip();
				ctx.fillStyle = '#c9cdd4';
				ctx.fillRect( 0, 0, spec.w, spec.h );
				if ( img && img.complete && img.naturalWidth ) {
					coverDraw( ctx, img, spec.w, spec.h );
				}
			} else if ( 'caption' === spec.kind ) {
				const size = Math.round( clamp( spec.h * 0.45, 10, 30 ) );
				ctx.fillStyle = '#4a4e55';
				ctx.font = `${
					'polaroid' === layout ? 'italic ' : ''
				}500 ${ size }px ${ 'polaroid' === layout ? 'Lora' : 'Inter' }`;
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillText( spec.text, spec.w / 2, spec.h / 2 );
			} else if ( 'holes' === spec.kind ) {
				ctx.fillStyle = spec.fill;
				// Squares only - trace them straight from the path data.
				const nums = ( spec.pathD.match( /[\d.]+/g ) || [] ).map(
					Number
				);
				for ( let i = 0; i + 7 < nums.length; i += 8 ) {
					ctx.fillRect(
						nums[ i ],
						nums[ i + 1 ],
						nums[ i + 2 ] - nums[ i ],
						nums[ i + 5 ] - nums[ i + 1 ]
					);
				}
			} else {
				ctx.fillStyle = spec.fill;
				roundedPath( ctx, spec.w, spec.h, spec.radius );
				ctx.fill();
				if ( 'card' === spec.kind ) {
					ctx.strokeStyle = 'rgba(0,0,0,0.08)';
					ctx.lineWidth = 1;
					ctx.stroke();
				}
			}
			ctx.restore();
		} );
	}, [ specs, picks, doc.w, doc.h, layout, loadTick ] );

	const pick = async () => {
		// The shared entry point routes to the Media Library Manager in
		// pick mode (or the classic modal, per the picker setting) - never
		// call the classic picker directly, the manager IS the picker.
		const picker = window.WPIE?.pickMedia || wpMediaPick;
		const items = await picker( {
			multiple: true,
			types: 'image',
			title: __( 'Pick collage images', 'wunderpaint' ),
			button: __( 'Use images', 'wunderpaint' ),
		} );
		if ( items && items.length ) {
			setPicks(
				items
					// Manager rows carry mime, classic items carry type.
					.filter( ( it ) =>
						it.type
							? 'image' === it.type
							: 0 ===
							  String( it.mime || 'image/' ).indexOf( 'image/' )
					)
					.map( ( it ) => ( {
						id: it.id,
						src: it.url,
						preview:
							it.thumb ||
							( it.sizes &&
								it.sizes.medium &&
								it.sizes.medium.url ) ||
							it.url,
						name: it.filename || it.title || '',
						width: it.width,
						height: it.height,
					} ) )
			);
		}
	};

	const insert = () => {
		if ( ! specs.length ) {
			return;
		}
		const parts = specs.map( ( s ) => specToLayer( s, layout ) );
		const group = makeGroup( { name: 'Collage' } );
		for ( const part of parts ) {
			part.parent = group.id;
		}
		group.children = parts.map( ( p ) => p.id );
		dispatch( {
			type: 'SET_LAYERS',
			layers: [ ...state.layers, ...parts, group ],
		} );
		dispatch( { type: 'SET_ACTIVE', id: group.id } );
		commit( __( 'Insert collage', 'wunderpaint' ) );
		extras?.toasts?.success?.(
			__( 'Collage inserted as an editable group.', 'wunderpaint' )
		);
		onClose();
	};

	const hasCaptions = 'polaroid' === layout || 'contact' === layout;
	const hasCards = 'polaroid' === layout || frame > 0;
	const slider = ( label, value, set, min, max ) => (
		<label style={ { display: 'grid', gap: 4, fontSize: 12 } }>
			<span>
				{ label }
				<span
					style={ {
						color: 'var(--ed-text-muted)',
						marginLeft: 6,
					} }
				>
					{ value }
				</span>
			</span>
			<input
				type="range"
				min={ min }
				max={ max }
				value={ value }
				onChange={ ( e ) => set( Math.round( +e.target.value ) ) }
			/>
		</label>
	);

	return (
		<div className="modal-backdrop" onClick={ onClose } role="presentation">
			<div
				className="stock-dialog"
				style={ {
					width: 860,
					maxWidth: '96vw',
					height: 'auto',
					gridTemplateRows: 'auto 1fr',
				} }
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-label={ __( 'Collage & Photo Grid', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<div className="dsm-title-row">
							<span className="dsm-title">
								{ __( 'Collage & Photo Grid', 'wunderpaint' ) }
							</span>
							<HelpLink article="collage" extras={ extras } />
						</div>
						<div className="dsm-sub">
							{ __(
								'Your photos, arranged - inserted as an editable group.',
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
				<div
					style={ {
						padding: 16,
						display: 'grid',
						gridTemplateColumns: '1fr 240px',
						gap: 16,
					} }
				>
					<div
						style={ {
							display: 'grid',
							placeItems: 'center',
							background: 'var(--ed-panel-2, rgba(0,0,0,0.12))',
							borderRadius: 8,
							minHeight: 320,
							padding: 10,
						} }
					>
						{ picks.length ? (
							<canvas
								ref={ canvasRef }
								style={ {
									maxWidth: '100%',
									maxHeight: 420,
									borderRadius: 4,
								} }
							/>
						) : (
							<div
								style={ {
									display: 'grid',
									gap: 12,
									justifyItems: 'center',
									color: 'var(--ed-text-muted)',
									fontSize: 13,
									textAlign: 'center',
									padding: 24,
								} }
							>
								<div>
									{ __(
										'Pick a handful of photos from your library - the collage builds itself, and every layout stays fully editable after inserting.',
										'wunderpaint'
									) }
								</div>
								<button
									className="ai-btn primary"
									onClick={ pick }
								>
									{ __( 'Choose images…', 'wunderpaint' ) }
								</button>
							</div>
						) }
					</div>
					<div
						style={ {
							display: 'grid',
							gap: 12,
							alignContent: 'start',
						} }
					>
						<div
							style={ {
								display: 'grid',
								gridTemplateColumns: '1fr 1fr',
								gap: 6,
							} }
						>
							{ LAYOUTS.map( ( l ) => (
								<button
									key={ l.id }
									className={
										'ai-btn ' +
										( layout === l.id
											? 'primary'
											: 'secondary' )
									}
									onClick={ () => setLayout( l.id ) }
								>
									{ l.label }
								</button>
							) ) }
							<button
								className="ai-btn secondary"
								disabled={ ! picks.length }
								onClick={ () => setSeed( ( s ) => s + 1 ) }
								title={ __(
									'Re-roll the arrangement',
									'wunderpaint'
								) }
							>
								{ __( 'Shuffle', 'wunderpaint' ) }
							</button>
						</div>
						{ slider(
							__( 'Spacing', 'wunderpaint' ),
							gap,
							setGap,
							0,
							60
						) }
						{ slider(
							__( 'Corner radius', 'wunderpaint' ),
							radius,
							setRadius,
							0,
							40
						) }
						{ 'polaroid' !== layout &&
							slider(
								__( 'Frame', 'wunderpaint' ),
								frame,
								setFrame,
								0,
								30
							) }
						{ ( 'grid' === layout ||
							'contact' === layout ||
							'polaroid' === layout ) &&
							slider(
								__( 'Columns (0 = auto)', 'wunderpaint' ),
								cols,
								setCols,
								0,
								8
							) }
						{ hasCards && (
							<label
								style={ {
									display: 'flex',
									gap: 8,
									alignItems: 'center',
									fontSize: 12,
								} }
							>
								{ __( 'Frame color', 'wunderpaint' ) }
								<SwatchButton
									color={ frameColor }
									size={ 26 }
									title={ __( 'Frame color', 'wunderpaint' ) }
									onChange={ ( v ) =>
										setFrameColor( v.slice( 0, 7 ) )
									}
								/>
							</label>
						) }
						{ hasCaptions && (
							<label
								style={ {
									display: 'flex',
									gap: 8,
									alignItems: 'center',
									fontSize: 12,
								} }
							>
								<input
									type="checkbox"
									checked={ captions }
									onChange={ ( e ) =>
										setCaptions( e.target.checked )
									}
								/>
								{ __(
									'Captions from file names',
									'wunderpaint'
								) }
							</label>
						) }
						<div
							style={ {
								display: 'grid',
								gap: 8,
								marginTop: 6,
							} }
						>
							{ picks.length > 0 && (
								<button
									className="ai-btn secondary"
									onClick={ pick }
								>
									{ sprintf(
										/* translators: %d: number of picked images. */
										__(
											'Change images… (%d picked)',
											'wunderpaint'
										),
										picks.length
									) }
								</button>
							) }
							<button
								className="ai-btn primary"
								disabled={ ! specs.length }
								onClick={ insert }
							>
								{ __( 'Insert collage', 'wunderpaint' ) }
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
