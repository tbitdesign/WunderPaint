/**
 * System Status (v1.132.0, Help menu): one visual overview of everything
 * that makes up this installation - extensions, local AI models, the
 * semantic search index (with the manage button), content counts, system
 * facts - plus the debug log with a one-click JSON export, so a support
 * case is a single file instead of twenty questions.
 */

import { useState, useEffect, useMemo } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { I } from '../icons';
import { useEscape } from '../components/use-escape';
import { HelpLink } from './help-dialog';
import { useEditor } from '../store/editor-context';
import { request } from '../lib/api';
import { FILTERS, FONT_LIST } from '../store/constants';
import { EFFECTS } from '../lib/effects';
import {
	listExtensionEffects,
	listExtensionFilterPresets,
	listExtensionIssues,
} from '../lib/extensions';
import { useTemplates, useCombos, useElements } from '../content/use-content';
import {
	searchModelInstalled,
	fetchIndexStatus,
	runIndexer,
	subscribeIndexer,
	indexerStatus,
} from '../lib/image-search';
import { preferredDevice } from '../lib/ml';
import {
	customFamilies,
	googleEnabled,
	GOOGLE_FONTS,
} from '../lib/font-manager';
import {
	getLog,
	subscribeLog,
	clearLog,
	exportLogBlob,
} from '../lib/debug-log';
import { collectClientInfo } from '../lib/client-info';
import { downloadBlob } from '../lib/download';

const MODEL_LABELS = {
	'smart-select': 'Smart Select (SlimSAM)',
	depth: 'Depth Blur (Depth Anything V2)',
	// Florence-2 replaced ViT-GPT2 in v1.138.0; keep this label in sync.
	caption: 'Alt Text (Florence-2)',
	'caption-translate': 'Alt Text Translation (Opus-MT)',
	salience: 'Layout (MiniLM)',
	'image-search': 'Image Search (SigLIP)',
};

/** Human size (GB above 1 GB, else MB/KB), values stay text tokens. */
const fmtBytes = ( n ) => {
	if ( ! Number.isFinite( n ) || n < 0 ) {
		return '–';
	}
	if ( n >= 1024 ** 3 ) {
		return ( n / 1024 ** 3 ).toFixed( n >= 10 * 1024 ** 3 ? 0 : 1 ) + ' GB';
	}
	if ( n >= 1024 ** 2 ) {
		return Math.round( n / 1024 ** 2 ) + ' MB';
	}
	return Math.max( 1, Math.round( n / 1024 ) ) + ' KB';
};

/**
 * Aggregated disk usage (v1.235, admins only): a stacked bar over the whole
 * disk - editor buckets, the rest of the media library, other server data,
 * free - with every number listed as text below (color only aids scanning).
 * Segment colors are editor hues validated CVD-safe against the dark panel
 * surface in this adjacency order; the two "other" segments are deliberate
 * neutrals.
 */
function StorageSection() {
	const [ stats, setStats ] = useState( null );
	useEffect( () => {
		request( { path: '/storage-stats' } )
			.then( setStats )
			.catch( () => setStats( false ) );
	}, [] );
	if ( false === stats ) {
		return null;
	}
	const buckets = [
		{
			id: 'versions',
			label: __( 'Versions & project files', 'wunderpaint' ),
			color: '#3b66ff',
		},
		{
			id: 'models',
			label: __( 'Local AI models', 'wunderpaint' ),
			color: '#d97706',
		},
		{
			id: 'extensions',
			label: __( 'Extensions', 'wunderpaint' ),
			color: '#8b5cf6',
		},
		{
			id: 'editor',
			label: __( 'Fonts & editor runtime', 'wunderpaint' ),
			color: '#16a34a',
		},
	];
	const b = stats?.buckets || {};
	const hasDisk =
		!! stats &&
		null !== stats.diskTotal &&
		null !== stats.diskFree &&
		stats.diskTotal > 0;
	const total = hasDisk
		? stats.diskTotal
		: Math.max( 1, stats?.uploads || 0 );
	const otherUsed = hasDisk
		? Math.max( 0, stats.diskTotal - stats.diskFree - stats.uploads )
		: 0;
	const segs = [
		...buckets.map( ( def ) => ( { ...def, bytes: b[ def.id ] || 0 } ) ),
		{
			id: 'media',
			label: __( 'Media library (other files)', 'wunderpaint' ),
			color: '#5c6470',
			bytes: stats?.media || 0,
		},
		...( hasDisk
			? [
					{
						id: 'other',
						label: __( 'Other server data', 'wunderpaint' ),
						color: '#3a3f47',
						bytes: otherUsed,
					},
			  ]
			: [] ),
	];
	const pct = ( n ) => Math.max( 0, ( n / total ) * 100 );
	return (
		<div className="status-section">
			<div className="library-subhead">
				{ __( 'Storage', 'wunderpaint' ) }
			</div>
			{ ! stats && (
				<div className="status-row">
					<span className="spin" />
				</div>
			) }
			{ !! stats && (
				<div>
					<div
						style={ {
							display: 'flex',
							gap: 2,
							height: 16,
							borderRadius: 4,
							background: 'var(--ed-panel-alt)',
							border: '1px solid var(--ed-border)',
							padding: 2,
							margin: '6px 0 8px',
						} }
					>
						{ segs
							.filter( ( s ) => s.bytes > 0 )
							.map( ( s ) => (
								<span
									key={ s.id }
									title={ `${ s.label }: ${ fmtBytes(
										s.bytes
									) }` }
									style={ {
										width: pct( s.bytes ) + '%',
										minWidth: 3,
										background: s.color,
										borderRadius: 2,
									} }
								/>
							) ) }
					</div>
					{ segs.map( ( s ) => (
						<div key={ s.id } className="status-row">
							<span
								style={ {
									width: 9,
									height: 9,
									borderRadius: 2,
									background: s.color,
									flexShrink: 0,
								} }
							/>
							{ s.label }
							<span
								className="status-muted"
								style={ {
									marginLeft: 'auto',
									fontVariantNumeric: 'tabular-nums',
								} }
							>
								{ fmtBytes( s.bytes ) }
							</span>
						</div>
					) ) }
					{ hasDisk && (
						<div className="status-row">
							<span
								style={ {
									width: 9,
									height: 9,
									borderRadius: 2,
									background: 'var(--ed-panel-alt)',
									border: '1px solid var(--ed-border-strong)',
									flexShrink: 0,
								} }
							/>
							{ __( 'Free disk space', 'wunderpaint' ) }
							<span
								className="status-muted"
								style={ {
									marginLeft: 'auto',
									fontVariantNumeric: 'tabular-nums',
								} }
							>
								{ sprintf(
									/* translators: 1: free space, 2: total disk size. */
									__( '%1$s of %2$s', 'wunderpaint' ),
									fmtBytes( stats.diskFree ),
									fmtBytes( stats.diskTotal )
								) }
							</span>
						</div>
					) }
				</div>
			) }
		</div>
	);
}

function Stat( { icon, value, label } ) {
	return (
		<div className="status-card">
			<span className="status-card-ic">
				{ I[ icon ] ? I[ icon ]( { size: 18 } ) : null }
			</span>
			<span className="status-card-value">{ value }</span>
			<span className="status-card-label">{ label }</span>
		</div>
	);
}

export function StatusDialog( { onClose, extras } ) {
	useEscape( onClose );
	const { WPIE } = useEditor();
	const templates = useTemplates();
	const combos = useCombos();
	const elements = useElements();

	// Live pieces: index status, installed server version, debug log.
	const [ indexInfo, setIndexInfo ] = useState( null );
	const [ idx, setIdx ] = useState( indexerStatus );
	const [ installedVersion, setInstalledVersion ] = useState( null );
	const [ , setLogTick ] = useState( 0 );
	useEffect( () => subscribeIndexer( setIdx ), [] );
	useEffect( () => subscribeLog( () => setLogTick( ( t ) => t + 1 ) ), [] );
	useEffect( () => {
		if ( searchModelInstalled() && ! idx.running ) {
			fetchIndexStatus()
				.then( setIndexInfo )
				.catch( () => {} );
		}
	}, [ idx.running ] );
	useEffect( () => {
		request( { path: '/version', method: 'GET' } )
			.then( ( r ) => setInstalledVersion( r?.version || null ) )
			.catch( () => setInstalledVersion( false ) );
	}, [] );

	const extensions = window.WPIE?.extensions || [];
	const extActive = extensions.filter( ( e ) => e.enabled ).length;
	const issues = listExtensionIssues();
	const models = Object.entries( window.WPIE?.mlInstalled || {} );
	const modelsInstalled = models.filter( ( [ , on ] ) => on ).length;
	const providers = Object.entries( window.WPIE?.providers || {} ).filter(
		( [ , on ] ) => on
	);
	const filterCount =
		FILTERS.length - 1 + listExtensionFilterPresets().length;
	const effectCount =
		EFFECTS.filter( ( e ) => ! e.hidden ).length +
		listExtensionEffects().filter( ( e ) => ! e.hidden ).length;
	const elementCount = elements.reduce( ( n, s ) => n + s.items.length, 0 );
	const brandKits = ( window.WPIE?.brandKits || [] ).length;
	const stock = Object.entries( window.WPIE?.stock || {} );
	const stockOn = stock.filter( ( [ , on ] ) => on ).length;
	const log = getLog();
	const client = useMemo( collectClientInfo, [] );

	const statusSnapshot = useMemo(
		() => ( {
			loadedVersion: WPIE?.version,
			installedVersion,
			extensions: extensions.map( ( e ) => ( {
				slug: e.slug,
				version: e.version,
				enabled: !! e.enabled,
			} ) ),
			models: Object.fromEntries( models ),
			providers: providers.map( ( [ k ] ) => k ),
			searchIndex: indexInfo,
			counts: {
				templates: templates.length,
				combos: combos.length,
				elements: elementCount,
				filters: filterCount,
				effects: effectCount,
				fonts:
					FONT_LIST.length +
					customFamilies().length +
					( googleEnabled() ? GOOGLE_FONTS.length : 0 ),
			},
			brandKits,
			stockProviders: stock
				.filter( ( [ , on ] ) => on )
				.map( ( [ k ] ) => k ),
			device: preferredDevice(),
			client,
		} ),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[ installedVersion, indexInfo, extensions.length ]
	);

	const levelColor = {
		error: 'var(--danger)',
		warn: 'var(--warning, #dba617)',
	};
	const fmtTime = ( t ) => new Date( t ).toLocaleTimeString();

	return (
		<div className="modal-backdrop" onClick={ onClose } role="presentation">
			<div
				className="export-dialog status-dialog"
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-label={ __( 'System Status', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<span className="dsm-title">
							{ __( 'System Status', 'wunderpaint' ) }
						</span>
						<HelpLink article="status" extras={ extras } />
						<div className="dsm-sub">
							{ __(
								'Everything installed, indexed and loaded, plus the debug log for support.',
								'wunderpaint'
							) }
						</div>
					</div>
					<button
						className="dsm-close"
						onClick={ onClose }
						aria-label={ __( 'Close', 'wunderpaint' ) }
					>
						{ I.close ? I.close( { size: 17 } ) : '✕' }
					</button>
				</div>
				<div
					className="export-body"
					style={ { maxHeight: 520, overflowY: 'auto' } }
				>
					<div className="status-grid">
						<Stat
							icon="puzzle"
							value={ `${ extActive } / ${ extensions.length }` }
							label={ __( 'Extensions active', 'wunderpaint' ) }
						/>
						<Stat
							icon="sparkles"
							value={ `${ modelsInstalled } / ${ models.length }` }
							label={ __( 'Local AI models', 'wunderpaint' ) }
						/>
						<Stat
							icon="image"
							value={ indexInfo ? indexInfo.total : '…' }
							label={ __(
								'Media library images',
								'wunderpaint'
							) }
						/>
						<Stat
							icon="grid"
							value={ templates.length }
							label={ __( 'Starter templates', 'wunderpaint' ) }
						/>
						<Stat
							icon="text"
							value={ combos.length }
							label={ __( 'Text combos', 'wunderpaint' ) }
						/>
						<Stat
							icon="shape"
							value={ elementCount }
							label={ __( 'Shapes', 'wunderpaint' ) }
						/>
						<Stat
							icon="fx"
							value={ `${ filterCount } + ${ effectCount }` }
							label={ __( 'Filters + effects', 'wunderpaint' ) }
						/>
						<Stat
							icon="text"
							value={
								FONT_LIST.length +
								customFamilies().length +
								( googleEnabled() ? GOOGLE_FONTS.length : 0 )
							}
							label={ __( 'Fonts', 'wunderpaint' ) }
						/>
						<Stat
							icon="palette"
							value={ brandKits }
							label={ __( 'Brand Kits', 'wunderpaint' ) }
						/>
						<Stat
							icon="camera"
							value={ `${ stockOn } / ${ stock.length }` }
							label={ __( 'Stock providers', 'wunderpaint' ) }
						/>
					</div>

					<div className="status-section">
						<div className="library-subhead">
							{ __( 'Semantic image search', 'wunderpaint' ) }
						</div>
						{ ! searchModelInstalled() && (
							<div className="status-row">
								{ __(
									'Model not installed. Download it under Settings → AI Models to search images by describing them.',
									'wunderpaint'
								) }
							</div>
						) }
						{ searchModelInstalled() && idx.running && (
							<div className="status-row">
								<span className="spin" />
								{ sprintf(
									/* translators: 1: done count, 2: total count. */
									__(
										'Indexing… %1$d / %2$d',
										'wunderpaint'
									),
									idx.done,
									idx.total
								) }
							</div>
						) }
						{ searchModelInstalled() &&
							! idx.running &&
							indexInfo && (
								<div className="status-row">
									{ sprintf(
										/* translators: 1: indexed count, 2: total count. */
										__(
											'%1$d of %2$d images indexed.',
											'wunderpaint'
										),
										Math.max(
											0,
											indexInfo.total - indexInfo.pending
										),
										indexInfo.total
									) }
									{ indexInfo.pending > 0 && (
										<button
											className="ai-btn sm primary"
											onClick={ () => runIndexer() }
										>
											{ __( 'Index now', 'wunderpaint' ) }
										</button>
									) }
								</div>
							) }
					</div>

					<div className="status-section">
						<div className="library-subhead">
							{ __( 'Local AI models', 'wunderpaint' ) }
						</div>
						{ models.map( ( [ id, on ] ) => (
							<div key={ id } className="status-row">
								<span
									className={
										on ? 'status-dot on' : 'status-dot'
									}
								/>
								{ MODEL_LABELS[ id ] || id }
								<span className="status-muted">
									{ on
										? __( 'installed', 'wunderpaint' )
										: __( 'not installed', 'wunderpaint' ) }
								</span>
							</div>
						) ) }
						<div className="status-row">
							{ /* A device is always available (WASM at minimum), so the
							   dot stays on; the text says which and whether it is
							   GPU-accelerated. */ }
							<span className="status-dot on" />
							{ __( 'Inference device', 'wunderpaint' ) }
							<span className="status-muted">
								{ 'webgpu' === preferredDevice()
									? 'WebGPU (GPU)'
									: 'WASM (CPU)' }
							</span>
						</div>
					</div>

					<div className="status-section">
						<div className="library-subhead">
							{ __( 'System', 'wunderpaint' ) }
						</div>
						<div className="status-row">
							{ __( 'Plugin version', 'wunderpaint' ) }
							<span className="status-muted">
								{ WPIE?.version }
								{ installedVersion &&
									installedVersion !== WPIE?.version &&
									' → ' +
										sprintf(
											/* translators: %s: version number. */
											__(
												'%s installed, reload the editor',
												'wunderpaint'
											),
											installedVersion
										) }
								{ false === installedVersion &&
									' · ' +
										__(
											'REST unreachable!',
											'wunderpaint'
										) }
							</span>
						</div>
						<div className="status-row">
							{ __( 'AI providers configured', 'wunderpaint' ) }
							<span className="status-muted">
								{ providers.length
									? providers
											.map( ( [ k ] ) => k )
											.join( ', ' )
									: __( 'none', 'wunderpaint' ) }
							</span>
						</div>
						{ issues.length > 0 && (
							<div
								className="status-row"
								style={ { color: 'var(--danger)' } }
							>
								{ sprintf(
									/* translators: %d: issue count. */
									__(
										'%d extension issue(s), see the log below.',
										'wunderpaint'
									),
									issues.length
								) }
							</div>
						) }
					</div>

					<div className="status-section">
						<div className="library-subhead">
							{ __( 'Device & graphics', 'wunderpaint' ) }
						</div>
						<div className="status-row">
							{ __( 'Browser', 'wunderpaint' ) }
							<span className="status-muted">
								{ client.browser || client.userAgent }
							</span>
						</div>
						<div className="status-row">
							{ __( 'Operating system', 'wunderpaint' ) }
							<span className="status-muted">
								{ client.platform || '—' }
							</span>
						</div>
						<div className="status-row">
							{ __( 'Display', 'wunderpaint' ) }
							<span className="status-muted">
								{ client.screen } @{ client.dpr }x
								{ client.touch ? ' · Touch' : '' }
							</span>
						</div>
						<div className="status-row">
							{ __( 'CPU cores / memory', 'wunderpaint' ) }
							<span className="status-muted">
								{ client.cores || '—' }
								{ client.memoryGb
									? ` / ≥${ client.memoryGb } GB`
									: '' }
							</span>
						</div>
						<div className="status-row">
							<span
								className={
									'webgl2' === client.webgl &&
									! client.glSoftware
										? 'status-dot on'
										: 'status-dot'
								}
							/>
							{ __( 'Graphics (WebGL)', 'wunderpaint' ) }
							<span
								className="status-muted"
								style={
									'webgl2' !== client.webgl ||
									client.glSoftware
										? { color: 'var(--warning, #dba617)' }
										: undefined
								}
							>
								{ 'none' === client.webgl
									? __(
											'not available - the 3D studios cannot run',
											'wunderpaint'
									  )
									: 'webgl' === client.webgl
									? `WebGL1 · ${ __(
											'no WebGL2 - the 3D studios cannot run here',
											'wunderpaint'
									  ) }`
									: `WebGL2 · ${
											client.glSoftware
												? __(
														'software rendering, no hardware acceleration - 3D will be slow',
														'wunderpaint'
												  )
												: __(
														'hardware accelerated',
														'wunderpaint'
												  )
									  }` }
								{ client.glRenderer
									? ` · ${ client.glRenderer }`
									: '' }
							</span>
						</div>
						<div className="status-row">
							{ 'WebGPU' }
							<span className="status-muted">
								{ client.webgpu
									? __( 'available', 'wunderpaint' )
									: __( 'not available', 'wunderpaint' ) }
							</span>
						</div>
					</div>

					{ !! window.WPIE?.canManage && <StorageSection /> }

					<div className="status-section">
						<div
							className="library-subhead"
							style={ {
								display: 'flex',
								gap: 8,
								alignItems: 'center',
							} }
						>
							{ __( 'Debug log', 'wunderpaint' ) }
							<span className="status-muted">{ log.length }</span>
							<span style={ { flex: 1 } } />
							<button
								className="ai-btn sm primary"
								onClick={ () =>
									downloadBlob(
										exportLogBlob( statusSnapshot ),
										`wpie-status-${ new Date()
											.toISOString()
											.slice( 0, 10 ) }.json`
									)
								}
							>
								{ __( 'Export log', 'wunderpaint' ) }
							</button>
							<button className="ai-btn sm" onClick={ clearLog }>
								{ __( 'Clear', 'wunderpaint' ) }
							</button>
						</div>
						<div className="status-log">
							{ ! log.length && (
								<div className="status-muted">
									{ __(
										'No events recorded in this session.',
										'wunderpaint'
									) }
								</div>
							) }
							{ [ ...log ].reverse().map( ( e, i ) => (
								<div
									key={ i }
									className="status-log-row"
									style={ { color: levelColor[ e.level ] } }
								>
									<span className="status-log-time">
										{ fmtTime( e.t ) }
									</span>
									<span className="status-log-src">
										{ e.source }
									</span>
									<span>
										{ e.message }
										{ e.detail ? ` · ${ e.detail }` : '' }
									</span>
								</div>
							) ) }
						</div>
						<div
							className="status-muted"
							style={ { marginTop: 6 } }
						>
							{ __(
								'The export contains status counts and this log only - no document content, no images, no API keys.',
								'wunderpaint'
							) }
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
