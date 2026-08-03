/**
 * Brand Kits dialog (v1.89.0): manage kits without leaving the editor.
 * Left: kit list; right: form (colors, fonts, logo, company profile,
 * custom variables). Edits are local until "Save kits" posts the whole
 * array to /brand-kits; the response refreshes window.WPIE.brandKits and
 * a `wpie:brand-kits-updated` window event tells open dialogs to re-read.
 */

import { useState, useEffect } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { I } from '../icons';
import { request, uploadMediaFile } from '../lib/api';
import { MediaPicker } from '../components/media-picker';
import { SwatchButton } from '../components/color-popover';
import { ALL_FONT_FAMILIES } from '../lib/font-manager';
import { useEscape } from '../components/use-escape';
import { HelpLink } from './help-dialog';

// Server default; a site can raise it with the wpie_max_brand_kits filter,
// and then the bootstrap carries the real number (v1.353.0). Hardcoding it on
// both sides meant a raised limit still stopped at the dialog. Kept in step
// with Settings::max_kits(), which went from 8 to 50 in v1.384.2.
const MAX_KITS = 50;
const MAX_COLORS = 12;
const MAX_FONTS = 3;
const MAX_VARS = 24;

const PROFILE_FIELDS = () => [
	[ 'company', __( 'Company', 'wunderpaint' ) ],
	[ 'contactName', __( 'Contact person', 'wunderpaint' ) ],
	[ 'email', __( 'Email', 'wunderpaint' ) ],
	[ 'website', __( 'Website', 'wunderpaint' ) ],
	[ 'street', __( 'Street', 'wunderpaint' ) ],
	[ 'zip', __( 'ZIP', 'wunderpaint' ) ],
	[ 'city', __( 'City', 'wunderpaint' ) ],
	[ 'industry', __( 'Industry', 'wunderpaint' ) ],
];

const blankKit = ( n ) => ( {
	id: `kit${ Date.now().toString( 36 ) }`,
	/* translators: %d: brand kit number. */
	name: sprintf( __( 'Brand Kit %d', 'wunderpaint' ), n ),
	colors: [ '#3b66ff' ],
	fonts: [],
	logoId: 0,
	logoUrl: '',
	company: '',
	contactName: '',
	email: '',
	website: '',
	street: '',
	zip: '',
	city: '',
	industry: '',
	description: '',
	vars: [],
} );

export function BrandKitsDialog( { onClose, extras } ) {
	const [ kits, setKits ] = useState( null ); // null = loading
	const [ index, setIndex ] = useState( 0 );
	const [ busy, setBusy ] = useState( false );
	const [ error, setError ] = useState( '' );
	const [ confirmDelete, setConfirmDelete ] = useState( false );
	const [ pickerOpen, setPickerOpen ] = useState( false );
	useEscape( onClose );

	const pro = !! window.WPIE?.pro?.active;
	const maxKits = pro ? Number( window.WPIE?.maxBrandKits ) || MAX_KITS : 1;

	useEffect( () => {
		request( { path: '/brand-kits', method: 'GET' } )
			.then( ( res ) =>
				setKits( res?.kits?.length ? res.kits : [ blankKit( 1 ) ] )
			)
			.catch( ( e ) => {
				setKits( [ blankKit( 1 ) ] );
				setError( e.message );
			} );
	}, [] );

	const kit = kits?.[ index ] || null;

	const patch = ( changes ) =>
		setKits( ( prev ) =>
			prev.map( ( k, i ) => ( i === index ? { ...k, ...changes } : k ) )
		);

	const openPicker = () => setPickerOpen( ( open ) => ! open );

	const addKit = () => {
		if ( kits.length >= maxKits ) {
			if ( ! pro ) {
				window.WPIE?.toasts?.error(
					__(
						'Multiple Brand Kits are a Pro feature.',
						'wunderpaint'
					)
				);
			}
			return;
		}
		setKits( ( prev ) => [ ...prev, blankKit( prev.length + 1 ) ] );
		setIndex( kits.length );
		setConfirmDelete( false );
	};

	const removeKit = () => {
		if ( ! confirmDelete ) {
			setConfirmDelete( true );
			return;
		}
		setConfirmDelete( false );
		setKits( ( prev ) => {
			const next = prev.filter( ( _, i ) => i !== index );
			return next.length ? next : [ blankKit( 1 ) ];
		} );
		setIndex( 0 );
	};

	const save = async () => {
		if ( busy || ! kits ) {
			return;
		}
		setBusy( true );
		setError( '' );
		try {
			const res = await request( {
				path: '/brand-kits',
				method: 'POST',
				data: { kits },
			} );
			const saved = res?.kits || [];
			setKits( saved.length ? saved : [ blankKit( 1 ) ] );
			setIndex( ( i ) => Math.min( i, Math.max( 0, saved.length - 1 ) ) );
			// Refresh the bootstrap so pickers and open dialogs see the
			// new kits without an editor reload.
			if ( window.WPIE ) {
				window.WPIE.brandKits = saved;
				window.WPIE.brand = saved[ 0 ] || {
					colors: [],
					fonts: [],
					logoId: 0,
					logoUrl: '',
				};
			}
			window.dispatchEvent(
				new CustomEvent( 'wpie:brand-kits-updated', {
					detail: { kits: saved },
				} )
			);
			window.WPIE?.toasts?.success(
				__( 'Brand Kits saved.', 'wunderpaint' )
			);
		} catch ( e ) {
			setError( e.message );
		}
		setBusy( false );
	};

	const label = ( text ) => (
		<span
			className="dsm-label"
			style={ { display: 'block', marginBottom: 6 } }
		>
			{ text }
		</span>
	);

	const input = ( key, props = {} ) => (
		<input
			className="dsm-input"
			type="text"
			value={ kit?.[ key ] ?? '' }
			onChange={ ( e ) => patch( { [ key ]: e.target.value } ) }
			{ ...props }
			style={ { width: '100%', ...( props.style || {} ) } }
		/>
	);

	const section = ( title, children, gap = 10 ) => (
		<div
			style={ {
				display: 'flex',
				flexDirection: 'column',
				gap,
				paddingTop: 12,
				borderTop: '1px solid var(--border-hairline)',
			} }
		>
			{ label( title ) }
			{ children }
		</div>
	);

	return (
		<div
			className="modal-backdrop"
			style={ { zIndex: 180 } }
			onClick={ onClose }
			role="presentation"
		>
			<div
				className="dsm"
				style={ {
					width: 'min(880px, 94vw)',
					height: 'min(700px, 92vh)',
				} }
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-modal="true"
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<span className="dsm-title">
							{ __( 'Brand Kits', 'wunderpaint' ) }
						</span>
						<HelpLink article="brand-kits" extras={ extras } />
						<div className="dsm-sub">
							{ __(
								'Colors, fonts, logo and company profile: the source for quick picks, templates and AI content.',
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

				<div style={ { display: 'flex', flex: 1, minHeight: 0 } }>
					{ /* Kit list */ }
					<div
						style={ {
							display: 'flex',
							flexDirection: 'column',
							flex: 'none',
							width: 230,
							minHeight: 0,
							borderRight: '1px solid var(--border-hairline)',
						} }
					>
						<div
							style={ {
								flex: 1,
								minHeight: 0,
								overflowY: 'auto',
								padding: 10,
							} }
						>
							{ null === kits && (
								<div className="post-picker-empty">
									{ __( 'Loading…', 'wunderpaint' ) }
								</div>
							) }
							{ ( kits || [] ).map( ( k, i ) => (
								<button
									key={ k.id || i }
									type="button"
									className={
										'dsm-postrow' +
										( i === index ? ' active' : '' )
									}
									style={ { width: '100%' } }
									onClick={ () => {
										setIndex( i );
										setConfirmDelete( false );
									} }
								>
									<span className="meta">
										<strong>{ k.name }</strong>
										<small>
											{ ( k.colors || [] )
												.slice( 0, 6 )
												.map( ( c, ci ) => (
													<span
														key={ ci }
														style={ {
															display:
																'inline-block',
															width: 10,
															height: 10,
															marginRight: 4,
															background: c,
															borderRadius: 3,
															border: '1px solid var(--border-hairline)',
															verticalAlign:
																'middle',
														} }
													/>
												) ) }
										</small>
									</span>
								</button>
							) ) }
						</div>
						<div
							style={ {
								flex: 'none',
								padding: 10,
								borderTop: '1px solid var(--border-hairline)',
							} }
						>
							<button
								className="ai-btn secondary sm"
								style={ { width: '100%' } }
								onClick={ addKit }
							>
								{ __( '+ New kit', 'wunderpaint' ) }
								{ ! pro && ( kits || [] ).length >= 1 && (
									<span className="menu-chip-pro">PRO</span>
								) }
							</button>
						</div>
					</div>

					{ /* Form */ }
					<div
						style={ {
							display: 'flex',
							flex: 1,
							flexDirection: 'column',
							gap: 14,
							minWidth: 0,
							minHeight: 0,
							padding: 16,
							overflowY: 'auto',
						} }
					>
						{ kit && (
							<>
								<div>
									{ label( __( 'Name', 'wunderpaint' ) ) }
									{ input( 'name' ) }
								</div>

								{ section(
									__( 'Colors', 'wunderpaint' ),
									<>
										<div
											style={ {
												display: 'flex',
												flexWrap: 'wrap',
												gap: 8,
											} }
										>
											{ ( kit.colors || [] ).map(
												( c, ci ) => (
													<span
														key={ ci }
														style={ {
															display:
																'inline-flex',
															gap: 4,
															alignItems:
																'center',
															padding: 4,
															border: '1px solid var(--border-hairline)',
															borderRadius: 8,
														} }
													>
														<SwatchButton
															color={
																/^#[0-9a-f]{6}$/i.test(
																	c
																)
																	? c
																	: '#000000'
															}
															size={ 28 }
															title={ __(
																'Color',
																'wunderpaint'
															) }
															onChange={ ( v ) =>
																patch( {
																	colors: kit.colors.map(
																		(
																			cc,
																			j
																		) =>
																			j ===
																			ci
																				? v
																				: cc
																	),
																} )
															}
														/>
														<button
															type="button"
															className="dsm-close"
															style={ {
																width: 20,
																height: 20,
															} }
															onClick={ () =>
																patch( {
																	colors: kit.colors.filter(
																		(
																			_,
																			j
																		) =>
																			j !==
																			ci
																	),
																} )
															}
															aria-label={ __(
																'Remove color',
																'wunderpaint'
															) }
														>
															{ I.close( {
																size: 11,
															} ) }
														</button>
													</span>
												)
											) }
											{ ( kit.colors || [] ).length <
												MAX_COLORS && (
												<button
													className="ai-btn ghost sm"
													onClick={ () =>
														patch( {
															colors: [
																...( kit.colors ||
																	[] ),
																'#3b66ff',
															],
														} )
													}
												>
													{ __(
														'+ Color',
														'wunderpaint'
													) }
												</button>
											) }
										</div>
										<div
											style={ {
												fontSize: 12,
												color: 'var(--text-muted)',
											} }
										>
											{ __(
												'The first three colors are the primary, secondary and accent color for templates and AI prompts.',
												'wunderpaint'
											) }
										</div>
									</>
								) }

								{ section(
									__( 'Fonts', 'wunderpaint' ),
									<div
										style={ {
											display: 'grid',
											gridTemplateColumns:
												'repeat(3, 1fr)',
											gap: 10,
										} }
									>
										{ Array.from( {
											length: MAX_FONTS,
										} ).map( ( _, fi ) => (
											<select
												key={ fi }
												className="dsm-select"
												style={ { width: '100%' } }
												value={
													kit.fonts?.[ fi ] || ''
												}
												onChange={ ( e ) => {
													const fonts = [
														...( kit.fonts || [] ),
													];
													fonts[ fi ] =
														e.target.value;
													patch( {
														fonts: fonts.filter(
															( f ) => '' !== f
														),
													} );
												} }
											>
												<option value="">
													{ 0 === fi
														? __(
																'Primary font…',
																'wunderpaint'
														  )
														: __(
																'Optional…',
																'wunderpaint'
														  ) }
												</option>
												{ ALL_FONT_FAMILIES.map(
													( f ) => (
														<option
															key={ f }
															value={ f }
														>
															{ f }
														</option>
													)
												) }
											</select>
										) ) }
									</div>
								) }

								{ section(
									__( 'Logo', 'wunderpaint' ),
									<>
										<div
											style={ {
												display: 'flex',
												gap: 10,
												alignItems: 'center',
											} }
										>
											{ kit.logoUrl ? (
												<img
													src={ kit.logoUrl }
													alt=""
													style={ {
														width: 56,
														height: 56,
														objectFit: 'contain',
														background:
															'var(--surface-input)',
														border: '1px solid var(--border-hairline)',
														borderRadius: 8,
													} }
												/>
											) : (
												<span
													style={ {
														fontSize: 12,
														color: 'var(--text-muted)',
													} }
												>
													{ __(
														'No logo selected.',
														'wunderpaint'
													) }
												</span>
											) }
											<button
												className="ai-btn secondary sm"
												onClick={ openPicker }
											>
												{ __(
													'Choose from library',
													'wunderpaint'
												) }
											</button>
											{ !! kit.logoId && (
												<button
													className="ai-btn ghost sm"
													onClick={ () =>
														patch( {
															logoId: 0,
															logoUrl: '',
														} )
													}
												>
													{ __(
														'Remove',
														'wunderpaint'
													) }
												</button>
											) }
										</div>
										{ pickerOpen && (
											<MediaPicker
												height={ 180 }
												onPick={ ( m ) => {
													patch( {
														logoId: m.id,
														logoUrl:
															m.fullUrl || m.url,
													} );
													setPickerOpen( false );
												} }
											/>
										) }
									</>
								) }

								{ section(
									__( 'Watermark', 'wunderpaint' ),
									<div
										style={ {
											display: 'flex',
											gap: 10,
											alignItems: 'center',
										} }
									>
										{ kit.watermarkUrl ? (
											<img
												src={ kit.watermarkUrl }
												alt=""
												style={ {
													width: 56,
													height: 56,
													objectFit: 'contain',
													background:
														'var(--surface-input)',
													border: '1px solid var(--border-hairline)',
													borderRadius: 8,
												} }
											/>
										) : (
											<span
												style={ {
													fontSize: 12,
													color: 'var(--text-muted)',
												} }
											>
												{ __(
													'No watermark uploaded.',
													'wunderpaint'
												) }
											</span>
										) }
										<label
											className="ai-btn secondary sm"
											style={ { cursor: 'pointer' } }
										>
											{ __(
												'Upload image',
												'wunderpaint'
											) }
											<input
												type="file"
												accept="image/png,image/webp,image/jpeg,image/svg+xml"
												style={ { display: 'none' } }
												onChange={ async ( e ) => {
													const file =
														e.target.files?.[ 0 ];
													e.target.value = '';
													if ( ! file ) {
														return;
													}
													try {
														const up =
															await uploadMediaFile(
																file
															);
														patch( {
															watermarkId: up.id,
															watermarkUrl:
																up.url,
														} );
													} catch ( err ) {
														setError( err.message );
													}
												} }
											/>
										</label>
										{ !! kit.watermarkId && (
											<button
												className="ai-btn ghost sm"
												onClick={ () =>
													patch( {
														watermarkId: 0,
														watermarkUrl: '',
													} )
												}
											>
												{ __(
													'Remove',
													'wunderpaint'
												) }
											</button>
										) }
									</div>
								) }

								{ section(
									__( 'Company profile', 'wunderpaint' ),
									<>
										<div
											style={ {
												display: 'grid',
												gridTemplateColumns: '1fr 1fr',
												gap: 10,
											} }
										>
											{ PROFILE_FIELDS().map(
												( [ key, text ] ) => (
													<div
														key={ key }
														style={ {
															minWidth: 0,
														} }
													>
														{ label( text ) }
														{ input( key ) }
													</div>
												)
											) }
										</div>
										<div>
											{ label(
												__(
													'Description',
													'wunderpaint'
												)
											) }
											<textarea
												className="gen-prompt"
												rows={ 4 }
												value={ kit.description || '' }
												onChange={ ( e ) =>
													patch( {
														description:
															e.target.value,
													} )
												}
											/>
										</div>
									</>
								) }

								{ section(
									__( 'Custom variables', 'wunderpaint' ),
									<>
										{ ( kit.vars || [] ).map( ( v, vi ) => (
											<div
												key={ vi }
												style={ {
													display: 'flex',
													gap: 8,
												} }
											>
												<input
													className="dsm-input"
													type="text"
													placeholder={ __(
														'key, e.g. tone',
														'wunderpaint'
													) }
													value={ v.key || '' }
													onChange={ ( e ) =>
														patch( {
															vars: kit.vars.map(
																( vv, j ) =>
																	j === vi
																		? {
																				...vv,
																				key: e.target.value
																					.toLowerCase()
																					.replace(
																						/[^a-z0-9_]/g,
																						''
																					),
																		  }
																		: vv
															),
														} )
													}
													style={ {
														width: 180,
														fontFamily:
															'var(--font-mono, monospace)',
													} }
												/>
												<input
													className="dsm-input"
													type="text"
													placeholder={ __(
														'Value',
														'wunderpaint'
													) }
													value={ v.value || '' }
													onChange={ ( e ) =>
														patch( {
															vars: kit.vars.map(
																( vv, j ) =>
																	j === vi
																		? {
																				...vv,
																				value: e
																					.target
																					.value,
																		  }
																		: vv
															),
														} )
													}
													style={ { flex: 1 } }
												/>
												<button
													type="button"
													className="dsm-close"
													onClick={ () =>
														patch( {
															vars: kit.vars.filter(
																( _, j ) =>
																	j !== vi
															),
														} )
													}
													aria-label={ __(
														'Remove variable',
														'wunderpaint'
													) }
												>
													{ I.trash( { size: 14 } ) }
												</button>
											</div>
										) ) }
										{ ( kit.vars || [] ).length <
											MAX_VARS && (
											<div>
												<button
													className="ai-btn ghost sm"
													onClick={ () =>
														patch( {
															vars: [
																...( kit.vars ||
																	[] ),
																{
																	key: '',
																	value: '',
																},
															],
														} )
													}
												>
													{ __(
														'+ Variable',
														'wunderpaint'
													) }
												</button>
											</div>
										) }
										<div
											style={ {
												fontSize: 12,
												color: 'var(--text-muted)',
											} }
										>
											{ __(
												'Available as {key} placeholders in content templates, e.g. {tone} or {target_audience}.',
												'wunderpaint'
											) }
										</div>
									</>
								) }
							</>
						) }
					</div>
				</div>

				<div className="dsm-foot">
					<div
						className="dsm-hint"
						style={ {
							fontSize: 12,
							color: 'var(--text-secondary)',
						} }
					>
						{ error ? (
							<span
								style={ {
									color: 'var(--status-error, #e5484d)',
								} }
							>
								{ error }
							</span>
						) : (
							__( 'Changes apply when you save.', 'wunderpaint' )
						) }
					</div>
					<div className="dsm-actions">
						{ ( kits || [] ).length > 0 && kit && (
							<button
								className="ai-btn ghost"
								disabled={ busy }
								onClick={ removeKit }
							>
								{ confirmDelete
									? __( 'Really delete?', 'wunderpaint' )
									: __( 'Delete kit', 'wunderpaint' ) }
							</button>
						) }
						<button className="ai-btn ghost" onClick={ onClose }>
							{ __( 'Close', 'wunderpaint' ) }
						</button>
						<button
							className="ai-btn primary"
							disabled={ busy || ! kits }
							onClick={ save }
						>
							{ busy
								? __( 'Saving…', 'wunderpaint' )
								: __( 'Save kits', 'wunderpaint' ) }
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
