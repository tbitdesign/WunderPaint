/**
 * QR code studio (v1.102.0, was a bare URL prompt): content types (URL,
 * text, email, phone, SMS, Wi-Fi, vCard), styled modules/eyes, brand-kit
 * colors + center logo, live preview with scannability warnings. The
 * parameters are stored on the layer so the code stays editable later.
 */

import { useEffect, useReducer, useRef, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { I } from '../icons';
import { useEditor } from '../store/editor-context';
import { useEscape } from '../components/use-escape';
import { HelpLink } from './help-dialog';
import { SwatchButton } from '../components/color-popover';
import { VarButton } from '../components/var-picker';
import { makeImage } from '../store/document';
import { assignBrandKitOp } from '../store/ops';
import { parseColor } from '../lib/color';
import { hasTokens } from '../lib/dynamic-content';
import {
	qrLayerName,
	qrPayload,
	qrPayloadReady,
	qrWarnings,
	renderQr,
} from '../lib/qr';

const KINDS = [
	[ 'url', __( 'Link (URL)', 'wunderpaint' ) ],
	[ 'text', __( 'Text', 'wunderpaint' ) ],
	[ 'email', __( 'Email', 'wunderpaint' ) ],
	[ 'tel', __( 'Phone call', 'wunderpaint' ) ],
	[ 'sms', __( 'SMS', 'wunderpaint' ) ],
	[ 'wifi', __( 'Wi-Fi access', 'wunderpaint' ) ],
	[ 'vcard', __( 'Contact (vCard)', 'wunderpaint' ) ],
	[ 'payment', __( 'Payment (Girocode)', 'wunderpaint' ) ],
	[ 'event', __( 'Calendar event', 'wunderpaint' ) ],
];

const DEFAULT_CONTENT = { kind: 'url', url: 'https://wp-image-editor.com' };
const DEFAULT_STYLE = {
	fg: '#000000',
	bg: '#ffffff',
	transparentBg: false,
	moduleStyle: 'square',
	eyeStyle: 'square',
	eyeColor: '',
	margin: 2,
	ecl: 'M',
	logoUrl: '',
	logoScale: 0.2,
};

const lum = ( c ) => {
	const { r, g, b } = parseColor( c );
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const inputStyle = {
	width: '100%',
	padding: '6px 8px',
	border: '1px solid var(--ed-border-strong)',
	borderRadius: 4,
	background: 'var(--ed-panel-alt)',
	color: 'var(--ed-text)',
	fontSize: 12,
};

function Field( { label, children } ) {
	return (
		/*
		 * The label WRAPS its control: `children` is a single field at
		 * every call site. The rule cannot see that statically and asks
		 * for an htmlFor pointing at something this component does not
		 * know. Checked by hand rather than configured away (v1.348.0).
		 */
		// eslint-disable-next-line jsx-a11y/label-has-associated-control
		<label style={ { display: 'grid', gap: 4, fontSize: 12 } }>
			<span className="dsm-label">{ label }</span>
			{ children }
		</label>
	);
}

// Every content field takes dynamic-variable tokens ({{post.url}} …):
// the VarButton inserts them, the template pipelines resolve them per
// post at bake time.
function TextInput( {
	label,
	value,
	onChange,
	placeholder,
	type = 'text',
	kit,
	onKitChange,
} ) {
	const ref = useRef( null );
	return (
		<Field label={ label }>
			<div style={ { display: 'flex', gap: 6, alignItems: 'center' } }>
				<input
					ref={ ref }
					type={ type }
					style={ { ...inputStyle, flex: 1, minWidth: 0 } }
					value={ value || '' }
					placeholder={ placeholder }
					onChange={ ( e ) => onChange( e.target.value ) }
				/>
				<VarButton
					value={ value || '' }
					onChange={ onChange }
					inputRef={ ref }
					kit={ kit }
					onKitChange={ onKitChange }
				/>
			</div>
		</Field>
	);
}

function Seg( { options, value, onChange } ) {
	return (
		<div className="seg-row" style={ { display: 'flex' } }>
			{ options.map( ( [ key, label ] ) => (
				<button
					key={ key }
					className={ value === key ? 'active' : '' }
					onClick={ () => onChange( key ) }
				>
					{ label }
				</button>
			) ) }
		</div>
	);
}

export function QrDialog( { onClose, extras, layerId = null } ) {
	useEscape( onClose );
	const editor = useEditor();
	const { state, dispatch, commit } = editor;
	const editLayer = layerId
		? state.layers.find( ( l ) => l.id === layerId ) || null
		: null;

	const [ content, setContent ] = useState( () => ( {
		...DEFAULT_CONTENT,
		...( editLayer?.qr?.content || {} ),
	} ) );
	const [ style, setStyle ] = useState( () => ( {
		...DEFAULT_STYLE,
		...( editLayer?.qr?.style || {} ),
	} ) );
	const [ preview, setPreview ] = useState( null );
	const [ scan, setScan ] = useState( null );
	const [ renderError, setRenderError ] = useState( '' );
	const [ busy, setBusy ] = useState( false );

	// Re-read window.WPIE.brandKits when the kit dialog saves (v1.89.0).
	const [ , bumpKits ] = useReducer( ( x ) => x + 1, 0 );
	useEffect( () => {
		window.addEventListener( 'wpie:brand-kits-updated', bumpKits );
		return () =>
			window.removeEventListener( 'wpie:brand-kits-updated', bumpKits );
	}, [] );
	const kits = ( window.WPIE?.brandKits || [] ).filter( ( k ) => k?.name );
	const [ kitId, setKitId ] = useState( '' );
	const kit = kits.find( ( k ) => k.id === kitId ) || null;
	// The variable pickers list the DOCUMENT's kit (v1.251.0) - the
	// styling-kit select above only feeds colors. Switching in the picker
	// updates the document assignment like everywhere else.
	const varKit =
		kits.find( ( k ) => k.id === state.doc.brandKitId ) ||
		kits[ 0 ] ||
		null;
	const changeKit = ( id ) =>
		assignBrandKitOp( { state, dispatch, commit }, id );

	const patchContent = ( patch ) =>
		setContent( ( c ) => ( { ...c, ...patch } ) );
	const patchStyle = ( patch ) => setStyle( ( s ) => ( { ...s, ...patch } ) );
	const textRef = useRef( null );
	const tokensUsed = Object.values( content ).some(
		( v ) => 'string' === typeof v && hasTokens( v )
	);

	const applyKit = ( id ) => {
		setKitId( id );
		const k = kits.find( ( kk ) => kk.id === id );
		if ( ! k ) {
			return;
		}
		// Darkest kit color scans best as the code color; a second dark
		// color becomes the eye accent. Light colors stay out of the code.
		const sorted = ( k.colors || [] )
			.filter( Boolean )
			.sort( ( a, b ) => lum( a ) - lum( b ) );
		const patch = {};
		if ( sorted.length ) {
			patch.fg = sorted[ 0 ];
		}
		patch.eyeColor =
			sorted.length > 1 && lum( sorted[ 1 ] ) < 140 ? sorted[ 1 ] : '';
		if ( k.logoUrl ) {
			patch.logoUrl = k.logoUrl;
		}
		patchStyle( patch );
	};

	const ready = qrPayloadReady( content );
	const warnings = qrWarnings( style );

	const contentKey = JSON.stringify( content );
	const styleKey = JSON.stringify( style );
	useEffect( () => {
		if ( ! ready ) {
			setPreview( null );
			setRenderError( '' );
			setScan( null );
			return;
		}
		let live = true;
		const t = setTimeout( async () => {
			try {
				const payload = qrPayload( content );
				const { canvas } = await renderQr( payload, {
					...style,
					size: 480,
				} );
				if ( live ) {
					setPreview( canvas.toDataURL( 'image/png' ) );
					setRenderError( '' );
				}
				// The REAL scan check (v1.374): decode the rendered pixels
				// with an actual reader instead of guessing from heuristics.
				// Composited onto white first - that is what a print or a
				// light page puts behind a transparent code.
				try {
					const { default: jsQR } = await import(
						/* webpackChunkName: "jsqr" */ 'jsqr'
					);
					const flat = document.createElement( 'canvas' );
					flat.width = canvas.width;
					flat.height = canvas.height;
					const fctx = flat.getContext( '2d' );
					fctx.fillStyle = '#ffffff';
					fctx.fillRect( 0, 0, flat.width, flat.height );
					fctx.drawImage( canvas, 0, 0 );
					const img = fctx.getImageData(
						0,
						0,
						flat.width,
						flat.height
					);
					const hit = jsQR( img.data, img.width, img.height );
					if ( live ) {
						setScan( hit && hit.data === payload ? 'ok' : 'fail' );
					}
				} catch ( e ) {
					if ( live ) {
						setScan( null ); // decoder unavailable: stay silent
					}
				}
			} catch ( e ) {
				if ( live ) {
					setPreview( null );
					setRenderError(
						__(
							'This content is too long for a QR code. Shorten it or lower the error correction.',
							'wunderpaint'
						)
					);
				}
			}
		}, 250 );
		return () => {
			live = false;
			clearTimeout( t );
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ contentKey, styleKey, ready ] );

	const pickLogoFile = ( file ) => {
		if ( ! file ) {
			return;
		}
		const reader = new FileReader();
		reader.onload = () =>
			patchStyle( { logoUrl: String( reader.result ) } );
		reader.readAsDataURL( file );
	};

	const submit = async () => {
		setBusy( true );
		try {
			const { canvas } = await renderQr( qrPayload( content ), {
				...style,
				size: 1024,
			} );
			const dataUrl = canvas.toDataURL( 'image/png' );
			const qrMeta = { content: { ...content }, style: { ...style } };
			// A frame makes the render taller than wide; the layer box has
			// to follow or the code inside would squash and stop scanning.
			const aspect = canvas.height / canvas.width;
			if ( editLayer ) {
				dispatch( {
					type: 'UPDATE_LAYER',
					id: editLayer.id,
					patch: {
						src: dataUrl,
						naturalW: canvas.width,
						naturalH: canvas.height,
						...( Math.abs( editLayer.h / editLayer.w - aspect ) >
						0.01
							? {
									h: Math.round( editLayer.w * aspect ),
							  }
							: {} ),
						qr: qrMeta,
						// Auto names follow the content, manual renames stay.
						...( /^QR\b/.test( editLayer.name || '' )
							? { name: qrLayerName( content ) }
							: {} ),
					},
				} );
				commit( __( 'Edit QR code', 'wunderpaint' ) );
			} else {
				const size = Math.max(
					96,
					Math.min(
						512,
						Math.round( Math.min( state.doc.w, state.doc.h ) * 0.3 )
					)
				);
				const layer = {
					...makeImage( {
						name: qrLayerName( content ),
						x: Math.round( state.doc.w / 2 - size / 2 ),
						y: Math.round(
							state.doc.h / 2 - ( size * aspect ) / 2
						),
						w: size,
						h: Math.round( size * aspect ),
						src: dataUrl,
						naturalW: canvas.width,
						naturalH: canvas.height,
					} ),
					qr: qrMeta,
				};
				dispatch( { type: 'ADD_LAYER', layer } );
				commit( __( 'Insert QR code', 'wunderpaint' ) );
			}
			onClose();
		} catch ( e ) {
			extras?.toasts?.error?.(
				__( 'The QR code could not be generated.', 'wunderpaint' )
			);
		} finally {
			setBusy( false );
		}
	};

	const kind = content.kind || 'url';

	return (
		<div className="modal-backdrop" onClick={ onClose } role="presentation">
			<div
				className="stock-dialog"
				style={ {
					width: 'min(700px, 94vw)',
					height: 'auto',
					maxHeight: '88vh',
					gridTemplateRows: 'auto 1fr auto',
				} }
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-label={ __( 'QR Code', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<div className="dsm-title-row">
							<span className="dsm-title">
								{ editLayer
									? __( 'Edit QR Code', 'wunderpaint' )
									: __( 'Insert QR Code', 'wunderpaint' ) }
							</span>
							<HelpLink article="stock" extras={ extras } />
						</div>
						<div className="dsm-sub">
							{ __(
								'Links, Wi-Fi access, contacts and more, styled to match your brand.',
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
						display: 'flex',
						gap: 16,
						padding: 16,
						overflow: 'hidden',
						minHeight: 0,
					} }
				>
					{ /* ------------------------- controls ------------------------ */ }
					<div
						style={ {
							flex: 1,
							minWidth: 0,
							display: 'grid',
							gap: 12,
							overflowY: 'auto',
							paddingRight: 4,
							alignContent: 'start',
						} }
					>
						<Field label={ __( 'Content', 'wunderpaint' ) }>
							<select
								className="dsm-select"
								style={ { width: '100%' } }
								value={ kind }
								onChange={ ( e ) =>
									patchContent( { kind: e.target.value } )
								}
							>
								{ KINDS.map( ( [ key, label ] ) => (
									<option key={ key } value={ key }>
										{ label }
									</option>
								) ) }
							</select>
						</Field>

						{ 'url' === kind && (
							<TextInput
								kit={ varKit }
								onKitChange={ changeKit }
								label={ __( 'Link (URL)', 'wunderpaint' ) }
								value={ content.url }
								placeholder="https://wp-image-editor.com"
								onChange={ ( v ) => patchContent( { url: v } ) }
							/>
						) }
						{ 'text' === kind && (
							<Field label={ __( 'Text', 'wunderpaint' ) }>
								<div
									style={ {
										display: 'flex',
										gap: 6,
										alignItems: 'flex-start',
									} }
								>
									<textarea
										ref={ textRef }
										rows={ 3 }
										style={ {
											...inputStyle,
											resize: 'vertical',
											flex: 1,
											minWidth: 0,
										} }
										value={ content.text || '' }
										onChange={ ( e ) =>
											patchContent( {
												text: e.target.value,
											} )
										}
									/>
									<VarButton
										value={ content.text || '' }
										onChange={ ( v ) =>
											patchContent( { text: v } )
										}
										inputRef={ textRef }
										kit={ varKit }
										onKitChange={ changeKit }
									/>
								</div>
							</Field>
						) }
						{ 'email' === kind && (
							<div style={ { display: 'grid', gap: 10 } }>
								<TextInput
									kit={ varKit }
									onKitChange={ changeKit }
									label={ __(
										'Email address',
										'wunderpaint'
									) }
									value={ content.email }
									placeholder="hello@example.com"
									onChange={ ( v ) =>
										patchContent( { email: v } )
									}
								/>
								<TextInput
									kit={ varKit }
									onKitChange={ changeKit }
									label={ __(
										'Subject (optional)',
										'wunderpaint'
									) }
									value={ content.subject }
									onChange={ ( v ) =>
										patchContent( { subject: v } )
									}
								/>
								<TextInput
									kit={ varKit }
									onKitChange={ changeKit }
									label={ __(
										'Message (optional)',
										'wunderpaint'
									) }
									value={ content.message }
									onChange={ ( v ) =>
										patchContent( { message: v } )
									}
								/>
							</div>
						) }
						{ ( 'tel' === kind || 'sms' === kind ) && (
							<div style={ { display: 'grid', gap: 10 } }>
								<TextInput
									kit={ varKit }
									onKitChange={ changeKit }
									label={ __(
										'Phone number',
										'wunderpaint'
									) }
									value={ content.phone }
									placeholder="+49 151 1234567"
									onChange={ ( v ) =>
										patchContent( { phone: v } )
									}
								/>
								{ 'sms' === kind && (
									<TextInput
										kit={ varKit }
										onKitChange={ changeKit }
										label={ __(
											'Message (optional)',
											'wunderpaint'
										) }
										value={ content.message }
										onChange={ ( v ) =>
											patchContent( { message: v } )
										}
									/>
								) }
							</div>
						) }
						{ 'wifi' === kind && (
							<div style={ { display: 'grid', gap: 10 } }>
								<TextInput
									kit={ varKit }
									onKitChange={ changeKit }
									label={ __(
										'Network name (SSID)',
										'wunderpaint'
									) }
									value={ content.ssid }
									onChange={ ( v ) =>
										patchContent( { ssid: v } )
									}
								/>
								<div
									style={ {
										display: 'grid',
										gridTemplateColumns: '1fr 1fr',
										gap: 10,
									} }
								>
									<TextInput
										kit={ varKit }
										onKitChange={ changeKit }
										label={ __(
											'Password',
											'wunderpaint'
										) }
										value={ content.password }
										onChange={ ( v ) =>
											patchContent( { password: v } )
										}
									/>
									<Field
										label={ __(
											'Security',
											'wunderpaint'
										) }
									>
										<select
											className="dsm-select"
											style={ { width: '100%' } }
											value={
												content.encryption || 'WPA'
											}
											onChange={ ( e ) =>
												patchContent( {
													encryption: e.target.value,
												} )
											}
										>
											<option value="WPA">
												WPA/WPA2/WPA3
											</option>
											<option value="WEP">WEP</option>
											<option value="nopass">
												{ __(
													'Open (no password)',
													'wunderpaint'
												) }
											</option>
										</select>
									</Field>
								</div>
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
										checked={ !! content.hidden }
										onChange={ ( e ) =>
											patchContent( {
												hidden: e.target.checked,
											} )
										}
									/>
									{ __( 'Hidden network', 'wunderpaint' ) }
								</label>
							</div>
						) }
						{ 'vcard' === kind && (
							<div style={ { display: 'grid', gap: 10 } }>
								<div
									style={ {
										display: 'grid',
										gridTemplateColumns: '1fr 1fr',
										gap: 10,
									} }
								>
									<TextInput
										kit={ varKit }
										onKitChange={ changeKit }
										label={ __(
											'First name',
											'wunderpaint'
										) }
										value={ content.firstName }
										onChange={ ( v ) =>
											patchContent( { firstName: v } )
										}
									/>
									<TextInput
										kit={ varKit }
										onKitChange={ changeKit }
										label={ __(
											'Last name',
											'wunderpaint'
										) }
										value={ content.lastName }
										onChange={ ( v ) =>
											patchContent( { lastName: v } )
										}
									/>
								</div>
								<TextInput
									kit={ varKit }
									onKitChange={ changeKit }
									label={ __(
										'Company (optional)',
										'wunderpaint'
									) }
									value={ content.org }
									onChange={ ( v ) =>
										patchContent( { org: v } )
									}
								/>
								<div
									style={ {
										display: 'grid',
										gridTemplateColumns: '1fr 1fr',
										gap: 10,
									} }
								>
									<TextInput
										kit={ varKit }
										onKitChange={ changeKit }
										label={ __(
											'Phone number',
											'wunderpaint'
										) }
										value={ content.phone }
										onChange={ ( v ) =>
											patchContent( { phone: v } )
										}
									/>
									<TextInput
										kit={ varKit }
										onKitChange={ changeKit }
										label={ __(
											'Email address',
											'wunderpaint'
										) }
										value={ content.email }
										onChange={ ( v ) =>
											patchContent( { email: v } )
										}
									/>
								</div>
								<TextInput
									kit={ varKit }
									onKitChange={ changeKit }
									label={ __(
										'Website (optional)',
										'wunderpaint'
									) }
									value={ content.url }
									onChange={ ( v ) =>
										patchContent( { url: v } )
									}
								/>
							</div>
						) }

						{ 'payment' === kind && (
							<div>
								<TextInput
									kit={ varKit }
									onKitChange={ changeKit }
									label={ __( 'Recipient', 'wunderpaint' ) }
									value={ content.name }
									onChange={ ( v ) =>
										patchContent( { name: v } )
									}
								/>
								<TextInput
									kit={ varKit }
									onKitChange={ changeKit }
									label="IBAN"
									value={ content.iban }
									placeholder="DE89 3704 0044 0532 0130 00"
									onChange={ ( v ) =>
										patchContent( { iban: v } )
									}
								/>
								<TextInput
									kit={ varKit }
									onKitChange={ changeKit }
									label={ __(
										'BIC (optional)',
										'wunderpaint'
									) }
									value={ content.bic }
									onChange={ ( v ) =>
										patchContent( { bic: v } )
									}
								/>
								<TextInput
									kit={ varKit }
									onKitChange={ changeKit }
									label={ __(
										'Amount (EUR)',
										'wunderpaint'
									) }
									value={ content.amount }
									placeholder="49,90"
									onChange={ ( v ) =>
										patchContent( { amount: v } )
									}
								/>
								<TextInput
									kit={ varKit }
									onKitChange={ changeKit }
									label={ __( 'Purpose', 'wunderpaint' ) }
									value={ content.reference }
									onChange={ ( v ) =>
										patchContent( { reference: v } )
									}
								/>
								<div className="dsm-hint">
									<span>
										{ __(
											'Banking apps open a pre-filled SEPA transfer from this code. Leave the amount empty to let the payer choose it.',
											'wunderpaint'
										) }
									</span>
								</div>
							</div>
						) }
						{ 'event' === kind && (
							<div>
								<TextInput
									kit={ varKit }
									onKitChange={ changeKit }
									label={ __( 'Title', 'wunderpaint' ) }
									value={ content.title }
									onChange={ ( v ) =>
										patchContent( { title: v } )
									}
								/>
								<Field label={ __( 'Starts', 'wunderpaint' ) }>
									<input
										type="datetime-local"
										style={ inputStyle }
										value={ content.start || '' }
										onChange={ ( e ) =>
											patchContent( {
												start: e.target.value,
											} )
										}
									/>
								</Field>
								<Field label={ __( 'Ends', 'wunderpaint' ) }>
									<input
										type="datetime-local"
										style={ inputStyle }
										value={ content.end || '' }
										onChange={ ( e ) =>
											patchContent( {
												end: e.target.value,
											} )
										}
									/>
								</Field>
								<TextInput
									kit={ varKit }
									onKitChange={ changeKit }
									label={ __( 'Location', 'wunderpaint' ) }
									value={ content.location }
									onChange={ ( v ) =>
										patchContent( { location: v } )
									}
								/>
							</div>
						) }

						{ tokensUsed && (
							<div className="dsm-hint">
								<span>
									{ /* All three surfaces the old wording named
								      live in Pro. In the free plugin the
								      tokens still resolve, on export and
								      under View, Preview with Post. */ }
									{ window.WPIE?.pro?.active
										? __(
												'Variables resolve per post wherever this design runs as a dynamic template (Featured Images, dynamic image block or shortcode). The preview here keeps the placeholder text.',
												'wunderpaint'
										  )
										: __(
												'Variables resolve against a real post on export and under View, Preview with Post. The preview here keeps the placeholder text. Running the design over many posts, or embedding it as a block or shortcode, comes with Pro.',
												'wunderpaint'
										  ) }
								</span>
							</div>
						) }

						{ kits.length > 0 && (
							<Field label={ __( 'Brand Kit', 'wunderpaint' ) }>
								<div
									style={ {
										display: 'flex',
										gap: 6,
										alignItems: 'center',
									} }
								>
									<select
										className="dsm-select"
										style={ { flex: 1, width: '100%' } }
										value={ kitId }
										onChange={ ( e ) =>
											applyKit( e.target.value )
										}
									>
										<option value="">
											{ __(
												'No Brand Kit',
												'wunderpaint'
											) }
										</option>
										{ kits.map( ( k ) => (
											<option key={ k.id } value={ k.id }>
												{ k.name }
											</option>
										) ) }
									</select>
									{ !! window.WPIE?.openBrandKits && (
										<button
											type="button"
											className="dsm-close"
											onClick={ () =>
												window.WPIE.openBrandKits()
											}
											title={ __(
												'Edit Brand Kits',
												'wunderpaint'
											) }
											aria-label={ __(
												'Edit Brand Kits',
												'wunderpaint'
											) }
										>
											{ I.pencil( { size: 14 } ) }
										</button>
									) }
								</div>
							</Field>
						) }

						<div
							style={ {
								display: 'flex',
								gap: 16,
								flexWrap: 'wrap',
								alignItems: 'end',
							} }
						>
							<Field label={ __( 'Code color', 'wunderpaint' ) }>
								<SwatchButton
									color={ style.fg }
									size={ 26 }
									title={ __( 'Code color', 'wunderpaint' ) }
									onChange={ ( v ) =>
										patchStyle( { fg: v.slice( 0, 7 ) } )
									}
								/>
							</Field>
							<Field label={ __( 'Background', 'wunderpaint' ) }>
								<span
									style={
										style.transparentBg
											? {
													opacity: 0.4,
													pointerEvents: 'none',
											  }
											: undefined
									}
								>
									<SwatchButton
										color={ style.bg }
										size={ 26 }
										title={ __(
											'Background',
											'wunderpaint'
										) }
										onChange={ ( v ) =>
											patchStyle( {
												bg: v.slice( 0, 7 ),
											} )
										}
									/>
								</span>
							</Field>
							<label
								style={ {
									display: 'flex',
									gap: 8,
									alignItems: 'center',
									fontSize: 12,
									paddingBottom: 6,
								} }
							>
								<input
									type="checkbox"
									checked={ style.transparentBg }
									onChange={ ( e ) =>
										patchStyle( {
											transparentBg: e.target.checked,
										} )
									}
								/>
								{ __(
									'Transparent background',
									'wunderpaint'
								) }
							</label>
						</div>

						<Field label={ __( 'Module style', 'wunderpaint' ) }>
							<Seg
								options={ [
									[ 'square', __( 'Square', 'wunderpaint' ) ],
									[
										'rounded',
										__( 'Rounded', 'wunderpaint' ),
									],
									[ 'dots', __( 'Dots', 'wunderpaint' ) ],
								] }
								value={ style.moduleStyle }
								onChange={ ( v ) =>
									patchStyle( { moduleStyle: v } )
								}
							/>
						</Field>

						<div
							style={ {
								display: 'flex',
								gap: 16,
								flexWrap: 'wrap',
								alignItems: 'end',
							} }
						>
							<Field label={ __( 'Eye style', 'wunderpaint' ) }>
								<Seg
									options={ [
										[
											'square',
											__( 'Square', 'wunderpaint' ),
										],
										[
											'rounded',
											__( 'Rounded', 'wunderpaint' ),
										],
									] }
									value={ style.eyeStyle }
									onChange={ ( v ) =>
										patchStyle( { eyeStyle: v } )
									}
								/>
							</Field>
							<Field label={ __( 'Eye color', 'wunderpaint' ) }>
								<div
									style={ {
										display: 'flex',
										gap: 6,
										alignItems: 'center',
									} }
								>
									<SwatchButton
										color={ style.eyeColor || style.fg }
										size={ 26 }
										title={ __(
											'Eye color',
											'wunderpaint'
										) }
										onChange={ ( v ) =>
											patchStyle( {
												eyeColor: v.slice( 0, 7 ),
											} )
										}
									/>
									{ !! style.eyeColor && (
										<button
											type="button"
											className="ai-btn secondary"
											style={ {
												padding: '3px 8px',
												fontSize: 11,
											} }
											onClick={ () =>
												patchStyle( { eyeColor: '' } )
											}
										>
											{ __(
												'Match code color',
												'wunderpaint'
											) }
										</button>
									) }
								</div>
							</Field>
						</div>

						<Field label={ __( 'Center logo', 'wunderpaint' ) }>
							<div style={ { display: 'grid', gap: 8 } }>
								<div
									style={ {
										display: 'flex',
										gap: 6,
										flexWrap: 'wrap',
									} }
								>
									{ !! kit?.logoUrl && (
										<button
											type="button"
											className="ai-btn secondary"
											style={ {
												padding: '4px 10px',
												fontSize: 12,
											} }
											onClick={ () =>
												patchStyle( {
													logoUrl: kit.logoUrl,
												} )
											}
										>
											{ __(
												'Use kit logo',
												'wunderpaint'
											) }
										</button>
									) }
									<label
										className="ai-btn secondary"
										style={ {
											padding: '4px 10px',
											fontSize: 12,
											cursor: 'pointer',
										} }
									>
										{ __( 'Choose image…', 'wunderpaint' ) }
										<input
											type="file"
											accept="image/*"
											style={ { display: 'none' } }
											onChange={ ( e ) =>
												pickLogoFile(
													e.target.files?.[ 0 ]
												)
											}
										/>
									</label>
									{ !! style.logoUrl && (
										<button
											type="button"
											className="ai-btn secondary"
											style={ {
												padding: '4px 10px',
												fontSize: 12,
											} }
											onClick={ () =>
												patchStyle( { logoUrl: '' } )
											}
										>
											{ __(
												'Remove logo',
												'wunderpaint'
											) }
										</button>
									) }
								</div>
								{ !! style.logoUrl && (
									<label
										style={ {
											display: 'grid',
											gap: 4,
											fontSize: 12,
										} }
									>
										<span className="dsm-label">
											{ __( 'Logo size', 'wunderpaint' ) }{ ' ' }
											{ Math.round(
												( style.logoScale || 0.2 ) * 100
											) }
											%
										</span>
										<input
											type="range"
											min={ 12 }
											max={ 30 }
											value={ Math.round(
												( style.logoScale || 0.2 ) * 100
											) }
											onChange={ ( e ) =>
												patchStyle( {
													logoScale:
														e.target.value / 100,
												} )
											}
										/>
									</label>
								) }
							</div>
						</Field>

						<div
							style={ {
								display: 'flex',
								gap: 16,
								flexWrap: 'wrap',
								alignItems: 'end',
							} }
						>
							<Field
								label={ __(
									'Error correction',
									'wunderpaint'
								) }
							>
								<select
									className="dsm-select"
									value={ style.logoUrl ? 'H' : style.ecl }
									disabled={ !! style.logoUrl }
									title={
										style.logoUrl
											? __(
													'Fixed to H (30%) while a logo covers part of the code.',
													'wunderpaint'
											  )
											: undefined
									}
									onChange={ ( e ) =>
										patchStyle( { ecl: e.target.value } )
									}
								>
									<option value="L">
										{ __(
											'L (7%, smallest code)',
											'wunderpaint'
										) }
									</option>
									<option value="M">
										{ __(
											'M (15%, default)',
											'wunderpaint'
										) }
									</option>
									<option value="Q">
										{ __( 'Q (25%)', 'wunderpaint' ) }
									</option>
									<option value="H">
										{ __(
											'H (30%, most robust)',
											'wunderpaint'
										) }
									</option>
								</select>
							</Field>
							<Field label={ __( 'Quiet zone', 'wunderpaint' ) }>
								<select
									className="dsm-select"
									value={ String( style.margin ) }
									onChange={ ( e ) =>
										patchStyle( {
											margin: +e.target.value,
										} )
									}
								>
									<option value="0">
										{ __( 'None', 'wunderpaint' ) }
									</option>
									<option value="1">
										{ __( 'Narrow', 'wunderpaint' ) }
									</option>
									<option value="2">
										{ __( 'Standard', 'wunderpaint' ) }
									</option>
									<option value="4">
										{ __( 'Wide', 'wunderpaint' ) }
									</option>
								</select>
							</Field>
							<Field label={ __( 'Frame', 'wunderpaint' ) }>
								<div
									style={ {
										display: 'flex',
										gap: 6,
										alignItems: 'center',
									} }
								>
									<input
										type="checkbox"
										checked={ !! style.frame }
										aria-label={ __(
											'Frame',
											'wunderpaint'
										) }
										onChange={ ( e ) =>
											patchStyle( {
												frame: e.target.checked
													? {
															text: __(
																'SCAN ME',
																'wunderpaint'
															),
															color: '#111111',
													  }
													: null,
											} )
										}
									/>
									{ !! style.frame && (
										<input
											type="text"
											style={ {
												...inputStyle,
												flex: 1,
												minWidth: 0,
											} }
											value={ style.frame.text }
											onChange={ ( e ) =>
												patchStyle( {
													frame: {
														...style.frame,
														text: e.target.value,
													},
												} )
											}
										/>
									) }
									{ !! style.frame && (
										<SwatchButton
											color={ style.frame.color }
											title={ __(
												'Frame color',
												'wunderpaint'
											) }
											onChange={ ( c ) =>
												patchStyle( {
													frame: {
														...style.frame,
														color: c,
													},
												} )
											}
										/>
									) }
								</div>
							</Field>
						</div>
					</div>

					{ /* ------------------------- preview ------------------------- */ }
					<div
						style={ {
							width: 216,
							display: 'grid',
							gap: 10,
							alignContent: 'start',
						} }
					>
						<div
							style={ {
								width: 216,
								height: 216,
								borderRadius: 6,
								border: '1px solid var(--ed-border-strong)',
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								background:
									'repeating-conic-gradient(#c9cdd3 0% 25%, #f2f3f5 0% 50%) 0 0 / 16px 16px',
							} }
						>
							{ preview ? (
								<img
									src={ preview }
									alt={ __(
										'QR code preview',
										'wunderpaint'
									) }
									style={ {
										width: 200,
										height: 200,
										imageRendering: 'pixelated',
									} }
								/>
							) : (
								<span
									style={ {
										fontSize: 11,
										color: '#5c6470',
										padding: 12,
										textAlign: 'center',
									} }
								>
									{ renderError ||
										__(
											'Fill in the content to see a preview.',
											'wunderpaint'
										) }
								</span>
							) }
						</div>
						{ ( renderError ? [ renderError ] : warnings ).map(
							( w, i ) => (
								<div
									key={ i }
									style={ {
										fontSize: 11,
										lineHeight: 1.45,
										color: 'var(--ed-warn, #f5a623)',
										display: 'flex',
										gap: 6,
									} }
								>
									<span style={ { flexShrink: 0 } }>
										{ I.alert
											? I.alert( { size: 13 } )
											: '!' }
									</span>
									<span>{ w }</span>
								</div>
							)
						) }
						{ ! renderError && !! preview && 'ok' === scan && (
							<div
								style={ {
									fontSize: 11,
									lineHeight: 1.45,
									color: 'var(--ed-ok, #3fb27f)',
									display: 'flex',
									gap: 6,
								} }
							>
								<span style={ { flexShrink: 0 } }>
									{ I.check ? I.check( { size: 13 } ) : '✓' }
								</span>
								<span>
									{ __(
										'Scan check: a reader decodes this code.',
										'wunderpaint'
									) }
								</span>
							</div>
						) }
						{ ! renderError && !! preview && 'fail' === scan && (
							<div
								style={ {
									fontSize: 11,
									lineHeight: 1.45,
									color: 'var(--ed-danger, #e5534b)',
									display: 'flex',
									gap: 6,
								} }
							>
								<span style={ { flexShrink: 0 } }>
									{ I.alert ? I.alert( { size: 13 } ) : '!' }
								</span>
								<span>
									{ __(
										'Scan check failed: a reader could not decode this. Adjust colors, logo or frame.',
										'wunderpaint'
									) }
								</span>
							</div>
						) }
						{ ! renderError &&
							! warnings.length &&
							!! preview &&
							null === scan && (
								<div
									style={ {
										fontSize: 11,
										color: 'var(--ed-text-muted)',
									} }
								>
									{ __(
										'Always test the finished code with a phone camera.',
										'wunderpaint'
									) }
								</div>
							) }
					</div>
				</div>

				<div className="dsm-foot">
					<div className="dsm-hint">
						{ I.layers ? I.layers( { size: 14 } ) : null }
						{ __(
							'Lands as an image layer, editable any time via Edit QR Code.',
							'wunderpaint'
						) }
					</div>
					<div style={ { display: 'flex', gap: 8 } }>
						<button
							className="ai-btn secondary"
							onClick={ onClose }
						>
							{ __( 'Cancel', 'wunderpaint' ) }
						</button>
						<button
							className="ai-btn primary"
							disabled={ ! ready || busy || !! renderError }
							onClick={ submit }
						>
							{ editLayer
								? __( 'Update QR code', 'wunderpaint' )
								: __( 'Insert QR code', 'wunderpaint' ) }
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
