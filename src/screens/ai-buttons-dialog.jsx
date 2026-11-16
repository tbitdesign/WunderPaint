/**
 * AI Studio Buttons (spec 2026-09-16): View > AI Studio Buttons.
 *
 * Admins shape the AI Studio panel for everyone on the site: hide built-in
 * buttons, put them in their own order, and add buttons of their own with
 * a prompt, a reference image from the Media Library, a choice of input
 * (active layer, whole document, text layer, prompt only) and a result
 * kind. Left: the two sections of the panel as sortable rows. Right: the
 * form of the own button being edited. Edits are local until Save posts
 * the whole config to /ai-buttons, exactly like the Brand Kits dialog;
 * the response refreshes window.WPIE.aiButtons and a
 * `wpie:ai-buttons-updated` window event tells the panel to re-render.
 *
 * Deliberately not part of the Workspace dialog (Thomas, 16.09.2026).
 */

import { useState, useEffect, useRef } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { I } from '../icons';
import { aiButtons as api } from '../lib/api';
import { wpMediaPick } from '../lib/media-pick';
import { useEscape } from '../components/use-escape';
import { HelpLink } from './help-dialog';
import {
	OUTPUTS_FOR,
	listAiButtons,
	duplicateOf,
	blankButton,
	starterAiPresets,
	presetFromStarter,
} from '../lib/ai-buttons';

/**
 * True when a preset points at a reference image that is not there any
 * more: the id is stored, but the server (or the studio host) could not
 * resolve it to a picture. The preset still runs, just without its
 * reference, so the dialog says so rather than showing an empty frame.
 *
 * @param {Object} button An own preset.
 * @return {boolean} Whether its reference image is gone.
 */
export function referenceGone( button ) {
	return (
		!! button &&
		!! button.refImageId &&
		! button.refImageUrl &&
		! button.refThumbUrl
	);
}

const EMPTY = () => ( {
	custom: [],
	hidden: [],
	order: { local: [], cloud: [] },
} );

/** A working copy of the boot config, defaults filled in. */
function loadConfig() {
	const raw = window.WPIE?.aiButtons;
	const base = EMPTY();
	if ( ! raw || 'object' !== typeof raw ) {
		return base;
	}
	return {
		custom: Array.isArray( raw.custom )
			? raw.custom.map( ( c ) => ( { ...c } ) )
			: [],
		hidden: Array.isArray( raw.hidden ) ? [ ...raw.hidden ] : [],
		order: {
			local: Array.isArray( raw.order?.local )
				? [ ...raw.order.local ]
				: [],
			cloud: Array.isArray( raw.order?.cloud )
				? [ ...raw.order.cloud ]
				: [],
		},
	};
}

function inputCards() {
	return [
		{
			id: 'layer',
			label: __( 'Active layer', 'wunderpaint' ),
			desc: __(
				'Sends the active layer on its own. For looks and repairs on one picture.',
				'wunderpaint'
			),
		},
		{
			id: 'document',
			label: __( 'Whole document', 'wunderpaint' ),
			desc: __(
				'Flattens everything visible into one picture. The result lands on a new layer on top.',
				'wunderpaint'
			),
		},
		{
			id: 'text',
			label: __( 'Text layer', 'wunderpaint' ),
			desc: __(
				'Sends only the words of the active text layer, no picture.',
				'wunderpaint'
			),
		},
		{
			id: 'none',
			label: __( 'Prompt only', 'wunderpaint' ),
			desc: __(
				'Makes a new picture from the prompt and the reference image, in the document’s format.',
				'wunderpaint'
			),
		},
	];
}

function outputCards() {
	return {
		replace: {
			label: __( 'Replace the layer', 'wunderpaint' ),
			desc: __(
				'The result takes the place of the layer’s pixels; undo brings them back.',
				'wunderpaint'
			),
		},
		newLayer: {
			label: __( 'New layer on top', 'wunderpaint' ),
			desc: __(
				'The original stays, the result lands above it.',
				'wunderpaint'
			),
		},
		replaceText: {
			label: __( 'Replace the text', 'wunderpaint' ),
			desc: __(
				'The rewritten text goes straight into the layer.',
				'wunderpaint'
			),
		},
		alternatives: {
			label: __( 'Show five alternatives', 'wunderpaint' ),
			desc: __(
				'Pick one of five rewrites; the chosen one replaces the text.',
				'wunderpaint'
			),
		},
	};
}

const STARTER_ICON = {
	comic: 'M4 4h16v16H4zM4 12h16M12 4v16',
	lineart: 'M3 20c4-10 8-14 18-16M8 20c3-6 6-9 12-11',
	product: 'M5 8h14l-1 12H6zM9 8V5a3 3 0 0 1 6 0v3',
	poster: 'M5 3h14v18H5zM8 8h8M8 12h8M8 16h5',
	placeholder: 'M4 7h16M4 12h10M4 17h13',
	headline: 'M4 18V6M4 12h8M12 18V6M17 9l3-3v12',
};

const StarterIcon = ( { id } ) => (
	<svg
		width="20"
		height="20"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="1.8"
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
	>
		<path d={ STARTER_ICON[ id ] || STARTER_ICON.comic } />
	</svg>
);

const Chevron = ( { up } ) => (
	<svg
		width="14"
		height="14"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2.2"
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
	>
		<path d={ up ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6' } />
	</svg>
);

const Grip = () => (
	<svg
		width="12"
		height="14"
		viewBox="0 0 12 14"
		fill="currentColor"
		aria-hidden="true"
	>
		<circle cx="3.5" cy="2.5" r="1.4" />
		<circle cx="8.5" cy="2.5" r="1.4" />
		<circle cx="3.5" cy="7" r="1.4" />
		<circle cx="8.5" cy="7" r="1.4" />
		<circle cx="3.5" cy="11.5" r="1.4" />
		<circle cx="8.5" cy="11.5" r="1.4" />
	</svg>
);

export function AiButtonsDialog( { extras, onClose } ) {
	const [ config, setConfig ] = useState( loadConfig );
	const [ selectedId, setSelectedId ] = useState( null );
	const [ dirty, setDirty ] = useState( false );
	const [ busy, setBusy ] = useState( false );
	const [ error, setError ] = useState( '' );
	const [ confirmClose, setConfirmClose ] = useState( false );
	const [ confirmDelete, setConfirmDelete ] = useState( false );
	const drag = useRef( null );

	const sections = listAiButtons( config );
	const selected = config.custom.find( ( c ) => c.id === selectedId ) || null;

	const change = ( next ) => {
		setConfig( next );
		setDirty( true );
		setError( '' );
		setConfirmClose( false );
	};

	// Escape and the backdrop go through the same guard as the Close
	// button; a ref so the handler always sees the current dirty state.
	const closeRef = useRef( null );
	closeRef.current = () => {
		if ( dirty && ! confirmClose ) {
			setConfirmClose( true );
			return;
		}
		onClose();
	};
	useEscape( () => closeRef.current() );
	useEffect( () => {
		setConfirmDelete( false );
	}, [ selectedId ] );

	/* ------------------------------ the list ------------------------------ */

	const idsOf = ( section ) => sections[ section ].map( ( r ) => r.id );

	const setOrder = ( section, ids ) =>
		change( { ...config, order: { ...config.order, [ section ]: ids } } );

	const move = ( section, id, delta ) => {
		const ids = idsOf( section );
		const i = ids.indexOf( id );
		const j = i + delta;
		if ( i < 0 || j < 0 || j >= ids.length ) {
			return;
		}
		ids.splice( i, 1 );
		ids.splice( j, 0, id );
		setOrder( section, ids );
	};

	const dropBefore = ( section, fromId, toId ) => {
		if ( fromId === toId ) {
			return;
		}
		const ids = idsOf( section ).filter( ( x ) => x !== fromId );
		const at = ids.indexOf( toId );
		ids.splice( at < 0 ? ids.length : at, 0, fromId );
		setOrder( section, ids );
	};

	const toggleHidden = ( id ) => {
		const hidden = config.hidden.includes( id )
			? config.hidden.filter( ( x ) => x !== id )
			: [ ...config.hidden, id ];
		change( { ...config, hidden } );
	};

	const showAll = () => change( { ...config, hidden: [] } );

	const addButton = () => {
		const b = blankButton();
		change( {
			...config,
			custom: [ ...config.custom, b ],
			order: { ...config.order, cloud: [ b.id, ...idsOf( 'cloud' ) ] },
		} );
		setSelectedId( b.id );
	};

	const addStarter = ( starter ) => {
		const b = presetFromStarter( starter );
		change( {
			...config,
			custom: [ ...config.custom, b ],
			order: { ...config.order, cloud: [ b.id, ...idsOf( 'cloud' ) ] },
		} );
		setSelectedId( b.id );
	};

	const duplicate = ( row ) => {
		const b = duplicateOf( row );
		const ids = idsOf( 'cloud' );
		ids.splice( ids.indexOf( row.id ) + 1, 0, b.id );
		change( {
			...config,
			custom: [ ...config.custom, b ],
			order: { ...config.order, cloud: ids },
		} );
		setSelectedId( b.id );
	};

	const remove = ( id ) => {
		change( {
			...config,
			custom: config.custom.filter( ( c ) => c.id !== id ),
			hidden: config.hidden.filter( ( x ) => x !== id ),
			order: {
				local: config.order.local.filter( ( x ) => x !== id ),
				cloud: config.order.cloud.filter( ( x ) => x !== id ),
			},
		} );
		if ( selectedId === id ) {
			setSelectedId( null );
		}
		setConfirmDelete( false );
	};

	/* ------------------------------ the form ------------------------------ */

	const patch = ( fields ) => {
		if ( ! selected ) {
			return;
		}
		let next = { ...selected, ...fields };
		if (
			fields.input &&
			! OUTPUTS_FOR[ next.input ].includes( next.output )
		) {
			next.output = OUTPUTS_FOR[ next.input ][ 0 ];
		}
		if ( 'text' === next.input ) {
			next = { ...next, refImageId: 0, refImageUrl: '', refThumbUrl: '' };
		}
		change( {
			...config,
			custom: config.custom.map( ( c ) =>
				c.id === selected.id ? next : c
			),
		} );
	};

	// The reference image comes from the Media Library Manager (or the
	// classic wp.media modal where the manager is not the picker): the
	// one shared picker every dialog uses, never a picker of its own
	// (Thomas, 16.09.2026).
	const pickReference = async () => {
		const picker = window.WPIE?.pickMedia || wpMediaPick;
		const items = await picker( { multiple: false, types: 'image' } );
		const item = Array.isArray( items ) ? items[ 0 ] : null;
		if ( item && item.id ) {
			patch( {
				refImageId: item.id,
				refImageUrl: item.url || item.thumb || '',
				refThumbUrl: item.thumb || item.url || '',
			} );
		}
	};

	const save = async () => {
		if ( busy ) {
			return;
		}
		const bad = config.custom.find(
			( c ) => ! String( c.title ).trim() || ! String( c.prompt ).trim()
		);
		if ( bad ) {
			setSelectedId( bad.id );
			setError(
				__(
					'Every own preset needs a title and a prompt.',
					'wunderpaint'
				)
			);
			return;
		}
		setBusy( true );
		setError( '' );
		try {
			const res = await api.save( config );
			const fresh = res && 'object' === typeof res ? res : EMPTY();
			setConfig( {
				custom: Array.isArray( fresh.custom ) ? fresh.custom : [],
				hidden: Array.isArray( fresh.hidden ) ? fresh.hidden : [],
				order: {
					local: fresh.order?.local || [],
					cloud: fresh.order?.cloud || [],
				},
			} );
			setDirty( false );
			setConfirmClose( false );
			if ( window.WPIE ) {
				window.WPIE.aiButtons = fresh;
			}
			window.dispatchEvent(
				new CustomEvent( 'wpie:ai-buttons-updated', { detail: fresh } )
			);
			extras?.toasts?.success?.(
				__( 'AI Presets saved.', 'wunderpaint' )
			);
		} catch ( e ) {
			setError( e?.message || __( 'Saving failed.', 'wunderpaint' ) );
		}
		setBusy( false );
	};

	/* ------------------------------ rendering ------------------------------ */

	const kindLabel = {
		custom: __( 'Own', 'wunderpaint' ),
		prompt: __( 'Built-in', 'wunderpaint' ),
		code: __( 'Built-in', 'wunderpaint' ),
		local: __( 'Local', 'wunderpaint' ),
	};

	const row = ( section, r, i, n ) => {
		const canDup = 'custom' === r.kind || 'prompt' === r.kind;
		const own = 'custom' === r.kind;
		return (
			<div
				key={ r.id }
				className={
					'wpie-aib-row' +
					( r.hidden ? ' is-hidden' : '' ) +
					( r.id === selectedId ? ' is-selected' : '' )
				}
				data-id={ r.id }
				draggable
				onDragStart={ ( e ) => {
					drag.current = { section, id: r.id };
					e.dataTransfer.effectAllowed = 'move';
				} }
				onDragOver={ ( e ) => {
					if ( drag.current && drag.current.section === section ) {
						e.preventDefault();
					}
				} }
				onDrop={ ( e ) => {
					e.preventDefault();
					if ( drag.current && drag.current.section === section ) {
						dropBefore( section, drag.current.id, r.id );
					}
					drag.current = null;
				} }
				onDragEnd={ () => {
					drag.current = null;
				} }
			>
				<span
					className="wpie-aib-grip"
					title={ __( 'Drag to reorder', 'wunderpaint' ) }
				>
					<Grip />
				</span>
				{ own ? (
					<button
						type="button"
						className="wpie-aib-name is-own"
						title={ r.title }
						onClick={ () => setSelectedId( r.id ) }
					>
						{ r.label || __( 'Untitled preset', 'wunderpaint' ) }
					</button>
				) : (
					<span className="wpie-aib-name" title={ r.title }>
						{ r.label }
					</span>
				) }
				{ referenceGone( r.custom ) && (
					<span
						className="wpie-aib-warnmark"
						data-warn="ref"
						title={ __(
							'The reference image is gone',
							'wunderpaint'
						) }
					>
						{ I.alert( { size: 13 } ) }
					</span>
				) }
				<span className="wpie-aib-kind">{ kindLabel[ r.kind ] }</span>
				<button
					type="button"
					className="wpie-aib-icon"
					data-act="hide"
					aria-pressed={ ! r.hidden }
					title={
						r.hidden
							? __( 'Show in the panel', 'wunderpaint' )
							: __( 'Hide from the panel', 'wunderpaint' )
					}
					onClick={ () => toggleHidden( r.id ) }
				>
					{ r.hidden
						? I.eyeOff( { size: 15 } )
						: I.eye( { size: 15 } ) }
				</button>
				<button
					type="button"
					className="wpie-aib-icon"
					data-act="dup"
					title={ __( 'Duplicate as an own preset', 'wunderpaint' ) }
					disabled={ ! canDup }
					onClick={ () => duplicate( r ) }
				>
					{ I.duplicate( { size: 15 } ) }
				</button>
				<button
					type="button"
					className="wpie-aib-icon"
					data-act="up"
					title={ __( 'Move up', 'wunderpaint' ) }
					disabled={ 0 === i }
					onClick={ () => move( section, r.id, -1 ) }
				>
					<Chevron up />
				</button>
				<button
					type="button"
					className="wpie-aib-icon"
					data-act="down"
					title={ __( 'Move down', 'wunderpaint' ) }
					disabled={ i === n - 1 }
					onClick={ () => move( section, r.id, 1 ) }
				>
					<Chevron />
				</button>
			</div>
		);
	};

	const section = ( key, title ) => (
		<div className="wpie-aib-sect" key={ key }>
			<div className="wpie-aib-sect-head">{ title }</div>
			<div className="wpie-aib-rows">
				{ sections[ key ].map( ( r, i ) =>
					row( key, r, i, sections[ key ].length )
				) }
			</div>
		</div>
	);

	const cards = outputCards();
	const outputs = selected ? OUTPUTS_FOR[ selected.input ] || [] : [];

	return (
		<div
			className="modal-backdrop"
			onClick={ () => closeRef.current() }
			role="presentation"
		>
			<div
				className="dsm wpie-aib-dialog"
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-modal="true"
				aria-label={ __( 'AI Presets', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<div className="dsm-title-row">
							<span className="dsm-title">
								{ __( 'AI Presets', 'wunderpaint' ) }
							</span>
							<HelpLink
								article="ai-studio-buttons"
								extras={ extras }
							/>
						</div>
						<div className="dsm-sub">
							{ window.WPIE?.standalone
								? __(
										'Which presets the AI Studio shows, in which order, and the ones you add yourself. Saved in this browser.',
										'wunderpaint'
								  )
								: __(
										'Which presets the AI Studio shows, in which order, and the ones you add yourself. Everyone on the site sees the same panel.',
										'wunderpaint'
								  ) }
						</div>
					</div>
					<button
						className="dsm-close"
						onClick={ () => closeRef.current() }
						aria-label={ __( 'Close', 'wunderpaint' ) }
					>
						{ I.close( { size: 17 } ) }
					</button>
				</div>

				<div className="wpie-aib-body">
					<div className="wpie-aib-side">
						{ section(
							'cloud',
							__( 'Provider actions', 'wunderpaint' )
						) }
						{ section(
							'local',
							__( 'Local tools', 'wunderpaint' )
						) }
					</div>

					<div className="wpie-aib-main">
						{ ! selected && (
							<div className="wpie-aib-start">
								<div className="wpie-aib-start-head">
									{ __(
										'Start from an example',
										'wunderpaint'
									) }
								</div>
								<div className="dgs-presets wpie-aib-starters">
									{ starterAiPresets().map( ( st ) => (
										<button
											key={ st.id }
											type="button"
											className="dgs-preset"
											data-starter={ st.id }
											title={ st.description }
											onClick={ () => addStarter( st ) }
										>
											<StarterIcon id={ st.id } />
											<span>{ st.title }</span>
										</button>
									) ) }
								</div>
								<div className="wpie-aib-start-note">
									{ __(
										'Each example becomes an own preset with a finished prompt you can reword. Or add a blank one below. Built-in presets on the left can be hidden, moved and duplicated.',
										'wunderpaint'
									) }
								</div>
							</div>
						) }

						{ selected && (
							<>
								<div className="wpie-aib-field">
									<label
										className="dsm-fieldlabel"
										htmlFor="wpie-aib-title"
									>
										{ __( 'Title', 'wunderpaint' ) }
									</label>
									<input
										id="wpie-aib-title"
										className="dsm-input"
										type="text"
										maxLength={ 60 }
										value={ selected.title }
										placeholder={ __(
											'e.g. Comic Art',
											'wunderpaint'
										) }
										onChange={ ( e ) =>
											patch( { title: e.target.value } )
										}
									/>
								</div>
								<div className="wpie-aib-field">
									<label
										className="dsm-fieldlabel"
										htmlFor="wpie-aib-desc"
									>
										{ __(
											'Tooltip (optional)',
											'wunderpaint'
										) }
									</label>
									<input
										id="wpie-aib-desc"
										className="dsm-input"
										type="text"
										maxLength={ 200 }
										value={ selected.description || '' }
										placeholder={ __(
											'One sentence that says what the preset does.',
											'wunderpaint'
										) }
										onChange={ ( e ) =>
											patch( {
												description: e.target.value,
											} )
										}
									/>
								</div>

								<div className="wpie-aib-field">
									<span className="dsm-fieldlabel">
										{ __(
											'What it works on',
											'wunderpaint'
										) }
									</span>
									<div className="wpie-aib-cards">
										{ inputCards().map( ( c ) => (
											<button
												key={ c.id }
												type="button"
												className="dsm-pickrow"
												data-input={ c.id }
												aria-pressed={
													selected.input === c.id
												}
												onClick={ () =>
													patch( { input: c.id } )
												}
											>
												<span className="dsm-pickrow-text">
													<b>{ c.label }</b>
													<small>{ c.desc }</small>
												</span>
											</button>
										) ) }
									</div>
								</div>

								<div className="wpie-aib-field">
									<label
										className="dsm-fieldlabel"
										htmlFor="wpie-aib-prompt"
									>
										{ __( 'Prompt', 'wunderpaint' ) }
									</label>
									<textarea
										id="wpie-aib-prompt"
										className="dsm-input"
										rows={ 6 }
										maxLength={ 2000 }
										value={ selected.prompt }
										placeholder={
											'text' === selected.input
												? __(
														'e.g. Rewrite this as a short, punchy headline.',
														'wunderpaint'
												  )
												: __(
														'e.g. Redraw this image as bold comic art with ink outlines and halftone shading. Keep the subject, pose and composition.',
														'wunderpaint'
												  )
										}
										onChange={ ( e ) =>
											patch( { prompt: e.target.value } )
										}
									/>
									<div className="wpie-aib-note">
										{ __(
											'Goes to the provider as written. English instructions tend to work best with image models.',
											'wunderpaint'
										) }
									</div>
								</div>

								{ 'text' !== selected.input && (
									<div className="wpie-aib-field">
										<span className="dsm-fieldlabel">
											{ __(
												'Reference image (optional)',
												'wunderpaint'
											) }
										</span>
										<div className="wpie-aib-ref">
											<span
												className={
													'wpie-aib-ref-thumb' +
													( referenceGone( selected )
														? ' is-gone'
														: '' )
												}
											>
												{ selected.refThumbUrl ||
												selected.refImageUrl ? (
													<img
														src={
															selected.refThumbUrl ||
															selected.refImageUrl
														}
														alt=""
													/>
												) : referenceGone(
														selected
												  ) ? (
													I.alert( { size: 18 } )
												) : (
													I.image( { size: 18 } )
												) }
											</span>
											<button
												type="button"
												className="ai-btn secondary sm"
												data-act="pick"
												onClick={ pickReference }
											>
												{ __(
													'Choose from Media Library',
													'wunderpaint'
												) }
											</button>
											{ !! selected.refImageId && (
												<button
													type="button"
													className="ai-btn ghost sm"
													onClick={ () =>
														patch( {
															refImageId: 0,
															refImageUrl: '',
															refThumbUrl: '',
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
										<div
											className={
												referenceGone( selected )
													? 'wpie-aib-note is-warn'
													: 'wpie-aib-note'
											}
											data-warn={
												referenceGone( selected )
													? 'ref'
													: undefined
											}
										>
											{ referenceGone( selected )
												? __(
														'This reference image is gone from the Media Library. Pick a new one, or save and the preset runs without a reference.',
														'wunderpaint'
												  )
												: __(
														'A style example the model sees next to your picture, e.g. one drawing in the look you want.',
														'wunderpaint'
												  ) }
										</div>
									</div>
								) }

								<div className="wpie-aib-field">
									<span className="dsm-fieldlabel">
										{ __(
											'Where the result goes',
											'wunderpaint'
										) }
									</span>
									<div className="wpie-aib-cards">
										{ outputs.map( ( o ) => (
											<button
												key={ o }
												type="button"
												className="dsm-pickrow"
												data-output={ o }
												aria-pressed={
													selected.output === o
												}
												onClick={ () =>
													patch( { output: o } )
												}
											>
												<span className="dsm-pickrow-text">
													<b>{ cards[ o ].label }</b>
													<small>
														{ cards[ o ].desc }
													</small>
												</span>
											</button>
										) ) }
									</div>
								</div>

								<div className="wpie-aib-danger">
									<button
										type="button"
										className="ai-btn ghost sm"
										data-act="del"
										onClick={ () =>
											confirmDelete
												? remove( selected.id )
												: setConfirmDelete( true )
										}
									>
										{ I.trash( { size: 14 } ) }{ ' ' }
										{ confirmDelete
											? __(
													'Really delete this preset?',
													'wunderpaint'
											  )
											: __(
													'Delete this preset',
													'wunderpaint'
											  ) }
									</button>
								</div>
							</>
						) }
					</div>
				</div>

				<div className="dsm-foot">
					<div className="dsm-hint wpie-aib-hint">
						{ error ? (
							<span className="wpie-aib-error">{ error }</span>
						) : (
							__( 'Changes apply when you save.', 'wunderpaint' )
						) }
					</div>
					<div className="dsm-actions">
						{ config.hidden.length > 0 && (
							<button
								type="button"
								className="ai-btn ghost"
								onClick={ showAll }
							>
								{ __( 'Show all', 'wunderpaint' ) }
							</button>
						) }
						<button
							type="button"
							className="ai-btn secondary"
							data-act="add"
							onClick={ addButton }
						>
							{ I.plus( { size: 14 } ) }{ ' ' }
							{ __( 'Add preset', 'wunderpaint' ) }
						</button>
						<button
							type="button"
							className="ai-btn secondary"
							onClick={ () => closeRef.current() }
						>
							{ confirmClose
								? __( 'Discard changes?', 'wunderpaint' )
								: __( 'Close', 'wunderpaint' ) }
						</button>
						<button
							type="button"
							className="ai-btn"
							data-act="save"
							disabled={ busy || ! dirty }
							onClick={ save }
						>
							{ busy
								? __( 'Saving…', 'wunderpaint' )
								: __( 'Save', 'wunderpaint' ) }
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
