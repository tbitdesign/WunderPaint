/**
 * AI Generate dialog (v1.31, illustrations v1.71): describe what you want
 * and the text model proposes gradient presets, text lockups, vector
 * elements or one complete SVG illustration. Preview, insert, regenerate.
 * Cloud feature (any text-capable provider: Anthropic, OpenAI or Gemini,
 * server-side); if no key is set it guides to Settings.
 */

import { useState, useEffect, useReducer } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { I } from '../icons';
import { useEditor } from '../store/editor-context';
import { useEscape } from '../components/use-escape';
import { HelpLink } from './help-dialog';
import {
	generateTemplates,
	generateIllustration,
	insertTemplateItem,
	gradientCss,
	elementSvg,
	kitBrandContext,
} from '../lib/ai-templates';
import { placeSvgLayers } from '../store/ops';
import { renderToCanvas, sharedImageCache } from '../lib/raster';

const KINDS = [
	{
		id: 'gradient',
		label: __( 'Gradient', 'wunderpaint' ),
		icon: 'gradient',
	},
	{ id: 'text', label: __( 'Text', 'wunderpaint' ), icon: 'text' },
	{ id: 'element', label: __( 'Shape', 'wunderpaint' ), icon: 'shape' },
	{
		id: 'illustration',
		label: __( 'Illustration', 'wunderpaint' ),
		icon: 'image',
	},
];

// One-tap prompt starters per kind (the design's suggestion chips).
const CHIPS = () => ( {
	gradient: [
		__( 'Warm sunset', 'wunderpaint' ),
		__( 'Deep ocean', 'wunderpaint' ),
		__( 'Soft pastel', 'wunderpaint' ),
		__( 'Midnight neon', 'wunderpaint' ),
	],
	text: [
		__( 'Bold sale banner', 'wunderpaint' ),
		__( 'Elegant wedding', 'wunderpaint' ),
		__( 'Tech startup', 'wunderpaint' ),
		__( 'Editorial quote', 'wunderpaint' ),
	],
	element: [
		__( 'Lightning bolt', 'wunderpaint' ),
		__( 'Leaf', 'wunderpaint' ),
		__( 'Star burst', 'wunderpaint' ),
		__( 'Speech bubble', 'wunderpaint' ),
	],
	illustration: [
		__( 'Cozy home office', 'wunderpaint' ),
		__( 'Mountain landscape', 'wunderpaint' ),
		__( 'Team high-five', 'wunderpaint' ),
		__( 'Rocket launch', 'wunderpaint' ),
	],
} );

/** A single preview cell for one generated item. */
function Preview( { kind, item } ) {
	if ( 'illustration' === kind ) {
		return (
			<div className="gen-prev gen-prev-illu">
				<img src={ item.preview } alt="" />
			</div>
		);
	}
	if ( 'gradient' === kind ) {
		return (
			<div
				className="gen-prev gen-prev-grad"
				style={ { background: gradientCss( item ) } }
			/>
		);
	}
	if ( 'element' === kind ) {
		return (
			<div
				className="gen-prev gen-prev-el"
				dangerouslySetInnerHTML={ {
					__html: elementSvg( item, 'currentColor' ),
				} }
			/>
		);
	}
	// text
	const maxFs = Math.max( ...item.lines.map( ( l ) => l.fontSize ) );
	const scale = Math.min( 1, 22 / maxFs );
	return (
		<div className="gen-prev gen-prev-text">
			{ item.lines.map( ( l, i ) => (
				<div
					key={ i }
					style={ {
						fontFamily: `'${ l.fontFamily }', sans-serif`,
						fontSize: Math.max(
							8,
							Math.round( l.fontSize * scale )
						),
						fontWeight: l.weight,
						color: l.color,
						fontStyle: l.italic ? 'italic' : 'normal',
						textAlign: l.align,
						letterSpacing: l.letterSpacing * scale,
						lineHeight: 1.15,
						width: '100%',
					} }
				>
					{ l.text }
				</div>
			) ) }
		</div>
	);
}

export function GenerateDialog( {
	onClose,
	initialKind = 'gradient',
	extras,
} ) {
	const editor = useEditor();
	const [ kind, setKind ] = useState(
		KINDS.some( ( k ) => k.id === initialKind ) ? initialKind : 'gradient'
	);
	const [ prompt, setPrompt ] = useState( '' );
	const [ text, setText ] = useState( '' );
	const [ status, setStatus ] = useState( 'idle' ); // idle|loading|done|error
	// Brand kit (v1.90.0): palette, house fonts and company profile steer
	// the generation. Re-render when the kit dialog saves.
	const [ , bumpKits ] = useReducer( ( x ) => x + 1, 0 );
	useEffect( () => {
		window.addEventListener( 'wpie:brand-kits-updated', bumpKits );
		return () =>
			window.removeEventListener( 'wpie:brand-kits-updated', bumpKits );
	}, [] );
	const kits = window.WPIE?.brandKits || [];
	const [ kitId, setKitId ] = useState( () => kits[ 0 ]?.id || '' );
	const kit = kits.find( ( k ) => k.id === kitId ) || null;
	const [ result, setResult ] = useState( null ); // { kind, items }
	const [ errMsg, setErrMsg ] = useState( '' );
	useEscape( 'loading' === status ? () => {} : onClose );

	const canRun =
		'loading' !== status &&
		( prompt.trim() || ( 'text' === kind && text.trim() ) );

	const run = async () => {
		setStatus( 'loading' );
		setErrMsg( '' );
		try {
			if ( 'illustration' === kind ) {
				// One illustration per run (they are big); preview through
				// the real render pipeline = exactly what gets inserted.
				const illu = await generateIllustration( {
					prompt,
					brand: kitBrandContext( kit ),
				} );
				const canvas = await renderToCanvas(
					{ w: illu.width, h: illu.height, bg: 'transparent' },
					illu.layers,
					{
						scale: Math.min(
							1,
							320 / Math.max( illu.width, illu.height )
						),
						cache: sharedImageCache,
					}
				);
				setResult( {
					kind: 'illustration',
					items: [
						{
							name: prompt.trim().slice( 0, 40 ),
							preview: canvas.toDataURL( 'image/png' ),
							illu,
						},
					],
				} );
				setStatus( 'done' );
				return;
			}
			const res = await generateTemplates( {
				kind,
				prompt,
				text,
				n: 4,
				brand: kitBrandContext( kit ),
			} );
			setResult( res );
			setStatus( 'done' );
		} catch ( e ) {
			setErrMsg( ( e && e.message ) || String( e ) );
			setStatus( 'error' );
		}
	};

	const insertOne = ( item ) => {
		if ( 'illustration' === result.kind ) {
			placeSvgLayers(
				editor,
				item.illu,
				item.name || __( 'AI Illustration', 'wunderpaint' ),
				__( 'AI Illustration', 'wunderpaint' )
			);
		} else {
			insertTemplateItem( editor, result.kind, item );
		}
		extras?.toasts?.toast?.( __( 'Added to the canvas.', 'wunderpaint' ) );
	};
	const insertAll = () => {
		result.items.forEach( ( item ) =>
			insertTemplateItem( editor, result.kind, item )
		);
		extras?.toasts?.toast?.(
			__( 'All added to the canvas.', 'wunderpaint' )
		);
		onClose();
	};

	const noKey =
		'error' === status && /key|configured|Settings/i.test( errMsg );

	const chips = CHIPS()[ kind ] || [];

	return (
		<div
			className="modal-backdrop"
			onClick={ 'loading' === status ? undefined : onClose }
			role="presentation"
		>
			<div
				className="dsm"
				style={ { width: 600 } }
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-label={ __( 'Asset Generator', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<div className="dsm-title-row">
							<span className="dsm-title">
								{ __( 'Asset Generator', 'wunderpaint' ) }
							</span>
							<HelpLink
								article="asset-generator"
								extras={ extras }
							/>
						</div>
						<div className="dsm-sub">
							{ __(
								'Creates a new editable layer from a text prompt.',
								'wunderpaint'
							) }
						</div>
					</div>
					<button
						className="dsm-close"
						onClick={ onClose }
						disabled={ 'loading' === status }
						aria-label={ __( 'Close', 'wunderpaint' ) }
					>
						{ I.close( { size: 17 } ) }
					</button>
				</div>

				<div className="dsm-body">
					{ kits.length > 0 && (
						<div className="dsm-sect" style={ { width: '100%' } }>
							<span className="dsm-label">
								{ __( 'Brand Kit', 'wunderpaint' ) }
							</span>
							<div
								style={ {
									display: 'flex',
									gap: 6,
									alignItems: 'center',
									width: '100%',
								} }
							>
								<select
									className="dsm-select"
									value={ kitId }
									disabled={ 'loading' === status }
									onChange={ ( e ) =>
										setKitId( e.target.value )
									}
									style={ { flex: 1, width: '100%' } }
								>
									{ kits.map( ( k ) => (
										<option key={ k.id } value={ k.id }>
											{ k.name }
										</option>
									) ) }
									<option value="">
										{ __( 'No Brand Kit', 'wunderpaint' ) }
									</option>
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
						</div>
					) }
					<div className="dsm-sect">
						<span className="dsm-label">
							{ __( 'Asset Type', 'wunderpaint' ) }
						</span>
						<div
							style={ {
								display: 'grid',
								gridTemplateColumns: 'repeat(4, 1fr)',
								gap: 8,
							} }
							role="tablist"
						>
							{ KINDS.map( ( k ) => (
								<button
									key={ k.id }
									role="tab"
									aria-selected={ kind === k.id }
									className={
										'dsm-tile' +
										( kind === k.id ? ' active' : '' )
									}
									onClick={ () => setKind( k.id ) }
								>
									{ I[ k.icon ]
										? I[ k.icon ]( { size: 20 } )
										: null }
									<span>{ k.label }</span>
								</button>
							) ) }
						</div>
					</div>

					<div className="dsm-sect">
						<div className="dsm-row-head">
							<span className="dsm-label">
								{ __( 'Prompt', 'wunderpaint' ) }
							</span>
							<span className="dsm-count">{ prompt.length }</span>
						</div>
						<textarea
							className="gen-prompt"
							rows={ 3 }
							placeholder={
								'gradient' === kind
									? __(
											'e.g. warm sunset, soft peach to purple',
											'wunderpaint'
									  )
									: 'element' === kind
									? __(
											'e.g. a simple lightning bolt, a leaf, a star burst',
											'wunderpaint'
									  )
									: 'illustration' === kind
									? __(
											'e.g. a cozy home office with plants and a cat, warm flat illustration',
											'wunderpaint'
									  )
									: __(
											'e.g. bold sale banner, elegant wedding, tech startup',
											'wunderpaint'
									  )
							}
							value={ prompt }
							onChange={ ( e ) => setPrompt( e.target.value ) }
						/>
						<div
							style={ {
								display: 'flex',
								flexWrap: 'wrap',
								gap: 7,
							} }
						>
							{ chips.map( ( c ) => (
								<button
									key={ c }
									className="dsm-chip"
									onClick={ () =>
										setPrompt( ( p ) =>
											p
												? `${ p }, ${ c.toLowerCase() }`
												: c
										)
									}
								>
									{ I.plus ? I.plus( { size: 12 } ) : '+' }{ ' ' }
									{ c }
								</button>
							) ) }
						</div>
					</div>

					{ 'text' === kind && (
						<textarea
							className="gen-text"
							rows={ 4 }
							placeholder={ __(
								'Optional: the exact text (one line per headline, bullet or subline)',
								'wunderpaint'
							) }
							value={ text }
							onChange={ ( e ) => setText( e.target.value ) }
						/>
					) }

					{ 'error' === status && (
						<p
							style={ {
								fontSize: 12.5,
								color: 'var(--danger)',
								margin: '10px 0 0',
							} }
						>
							{ errMsg }{ ' ' }
							{ noKey && editor.WPIE?.settingsUrl && (
								<a
									href={ editor.WPIE.settingsUrl }
									target="_blank"
									rel="noreferrer"
								>
									{ __( 'Open Settings', 'wunderpaint' ) }
								</a>
							) }
						</p>
					) }

					{ 'loading' === status && (
						<p
							style={ {
								fontSize: 12.5,
								color: 'var(--ed-text-muted)',
								margin: '12px 0 0',
							} }
						>
							{ 'illustration' === kind
								? __(
										'Drawing the illustration…',
										'wunderpaint'
								  )
								: __(
										'Asking the AI for four options…',
										'wunderpaint'
								  ) }
						</p>
					) }

					{ 'done' === status && result && (
						<>
							<div className="gen-grid">
								{ result.items.map( ( item, i ) => (
									<div key={ i } className="gen-card">
										<Preview
											kind={ result.kind }
											item={ item }
										/>
										<div className="gen-card-foot">
											<span title={ item.name }>
												{ item.name }
											</span>
											<button
												className="ai-btn secondary sm"
												onClick={ () =>
													insertOne( item )
												}
											>
												{ __(
													'Insert',
													'wunderpaint'
												) }
											</button>
										</div>
									</div>
								) ) }
							</div>
							{ 'illustration' !== result.kind && (
								<div className="gen-actions gen-actions-end">
									<button
										className="ai-btn secondary sm"
										onClick={ insertAll }
									>
										{ __( 'Insert all', 'wunderpaint' ) }
									</button>
								</div>
							) }
						</>
					) }
				</div>

				<div className="dsm-foot">
					<div className="dsm-hint">
						{ I.layers ? I.layers( { size: 14 } ) : null }
						{ __( 'Adds as a new layer', 'wunderpaint' ) }
					</div>
					<div className="dsm-actions">
						<button
							className="ai-btn ghost"
							onClick={ onClose }
							disabled={ 'loading' === status }
						>
							{ __( 'Cancel', 'wunderpaint' ) }
						</button>
						<button
							className="ai-btn primary"
							disabled={ ! canRun }
							onClick={ run }
						>
							{ 'loading' === status && (
								<span className="spin" />
							) }
							{ 'loading' === status
								? __( 'Generating…', 'wunderpaint' )
								: 'done' === status
								? __( 'Regenerate', 'wunderpaint' )
								: __( 'Generate', 'wunderpaint' ) }
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
