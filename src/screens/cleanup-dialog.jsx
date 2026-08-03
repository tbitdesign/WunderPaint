/**
 * Library cleanup (v1.351.0).
 *
 * Four tabs over one idea: show what the usage engine actually knows, say
 * plainly what it does not, and never delete on the spot.
 *
 *   Unused    images with no reference anywhere, the only ones offered for
 *             cleanup, and even those are re-checked server side on the way out
 *   Files     bytes in uploads that no attachment claims
 *   Oversize  originals larger than anything the site serves
 *   Held      what is waiting out its retention period, with a way back
 *
 * The counts deliberately show "recently uploaded" and "not checked" as their
 * own numbers instead of folding them into "unused". On a site built last month
 * that is most of the library, and hiding it would be the fastest way to lose
 * the trust this whole feature runs on.
 */

import { useState, useEffect, useRef, useCallback } from '@wordpress/element';
import { __, sprintf, _n } from '@wordpress/i18n';

import { I } from '../icons';
import { useEscape } from '../components/use-escape';
import { HelpLink } from './help-dialog';
import { mediaLib } from '../lib/media-library';
import {
	mediaUsage,
	quarantine,
	orphans,
	oversize,
	runSweep,
	fmtBytes,
	fmtWhen,
} from '../lib/media-usage';

const TABS = () => [
	{ id: 'unused', label: __( 'Unused images', 'wunderpaint' ) },
	{ id: 'files', label: __( 'Orphaned files', 'wunderpaint' ) },
	{ id: 'oversize', label: __( 'Oversized originals', 'wunderpaint' ) },
	{ id: 'held', label: __( 'Waiting to be deleted', 'wunderpaint' ) },
];

export function CleanupDialog( { onClose, onChanged, extras } ) {
	const [ tab, setTab ] = useState( 'unused' );
	const [ status, setStatus ] = useState( null );
	const [ busy, setBusy ] = useState( '' );
	const [ note, setNote ] = useState( '' );
	const cancel = useRef( { cancelled: false } );

	useEscape( onClose );

	const loadStatus = useCallback( () => {
		mediaUsage
			.status()
			.then( setStatus )
			.catch( () => setStatus( null ) );
	}, [] );

	useEffect( () => {
		loadStatus();
	}, [ loadStatus ] );

	const scan = async () => {
		cancel.current = { cancelled: false };
		setBusy( 'scan' );
		setNote( '' );
		try {
			const final = await runSweep( setStatus, cancel.current );
			setStatus( final );
			if ( final?.errors?.length ) {
				setNote(
					__(
						'Some sources could not be read, so nothing is offered for cleanup from this run.',
						'wunderpaint'
					)
				);
			}
			onChanged?.();
		} catch ( e ) {
			setNote( __( 'The scan stopped with an error.', 'wunderpaint' ) );
		}
		setBusy( '' );
	};

	const counts = status?.counts || {};
	const scanned = !! status?.last;

	return (
		<div
			className="wpie-alt-editwrap"
			onClick={ 'scan' === busy ? undefined : onClose }
			role="presentation"
		>
			<div
				className="wpie-mlm-cluster-panel wide wpie-cleanup"
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-label={ __( 'Clean up the library', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.trash( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<div className="dsm-title-row">
							<span className="dsm-title">
								{ __( 'Clean up the library', 'wunderpaint' ) }
							</span>
							<HelpLink
								article="library-cleanup"
								extras={ extras }
							/>
						</div>
						<div className="dsm-sub">
							{ __(
								'Find what nothing points at, and remove it with a way back.',
								'wunderpaint'
							) }
						</div>
					</div>
					<button
						className="dsm-close"
						onClick={ onClose }
						disabled={ 'scan' === busy }
						aria-label={ __( 'Close', 'wunderpaint' ) }
					>
						{ I.close( { size: 17 } ) }
					</button>
				</div>

				<ScanBar
					status={ status }
					busy={ 'scan' === busy }
					onScan={ scan }
					onCancel={ () => {
						cancel.current.cancelled = true;
					} }
				/>

				{ note && <div className="wpie-cleanup-note">{ note }</div> }

				{ counts?.error && (
					<div className="wpie-cleanup-note">
						{ __(
							'The tally could not be read from the database, so these numbers are not trustworthy. Nothing here should be deleted until a scan completes without errors.',
							'wunderpaint'
						) }
					</div>
				) }

				{ scanned && ! counts?.error && (
					<div className="wpie-cleanup-counts">
						<Count
							n={ counts.used }
							label={ __( 'in use', 'wunderpaint' ) }
							tone="ok"
						/>
						<Count
							n={ counts.unused }
							label={ __( 'unused', 'wunderpaint' ) }
							tone="warn"
						/>
						<Count
							n={ counts.fresh }
							label={ sprintf(
								/* translators: %d: grace period in days. */
								__(
									'uploaded in the last %d days',
									'wunderpaint'
								),
								status?.grace || 14
							) }
							tone="muted"
						/>
						<Count
							n={ counts.unknown }
							label={ __( 'not checked', 'wunderpaint' ) }
							tone="muted"
						/>
					</div>
				) }

				<div className="wpie-cleanup-tabs">
					{ TABS().map( ( t ) => (
						<button
							key={ t.id }
							className={
								'wpie-cleanup-tab' +
								( tab === t.id ? ' active' : '' )
							}
							onClick={ () => setTab( t.id ) }
						>
							{ t.label }
						</button>
					) ) }
				</div>

				<div className="wpie-cleanup-body">
					{ 'unused' === tab && (
						<UnusedTab
							status={ status }
							onChanged={ () => {
								loadStatus();
								onChanged?.();
							} }
						/>
					) }
					{ 'files' === tab && <FilesTab /> }
					{ 'oversize' === tab && (
						<OversizeTab extras={ extras } onClose={ onClose } />
					) }
					{ 'held' === tab && <HeldTab onChanged={ onChanged } /> }
				</div>

				<div className="dsm-foot">
					<span className="dsm-mono">
						{ counts.total
							? sprintf(
									/* translators: %d: number of images. */
									_n(
										'%d image',
										'%d images',
										counts.total,
										'wunderpaint'
									),
									counts.total
							  )
							: '' }
					</span>
					<div className="dsm-actions">
						<button
							className="ai-btn ghost"
							onClick={ onClose }
							disabled={ 'scan' === busy }
						>
							{ __( 'Close', 'wunderpaint' ) }
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

/** One number plus its caption. */
function Count( { n, label, tone } ) {
	return (
		<div className={ 'wpie-cleanup-count ' + ( tone || '' ) }>
			<strong>{ Number( n || 0 ).toLocaleString() }</strong>
			<span>{ label }</span>
		</div>
	);
}

/** Scan state, progress and the button that starts it. */
function ScanBar( { status, busy, onScan, onCancel } ) {
	const total = Number( status?.total || 0 );
	const done = Number( status?.done || 0 );
	const pct = total
		? Math.min( 100, Math.round( ( done / total ) * 100 ) )
		: 0;

	return (
		<div className="wpie-cleanup-scan">
			<div className="wpie-cleanup-scanrow">
				<div>
					{ status?.last ? (
						<span>
							{ sprintf(
								/* translators: %s: date of the last scan. */
								__( 'Last checked %s', 'wunderpaint' ),
								fmtWhen( status.last )
							) }
							{ status.stale
								? ' · ' +
								  __(
										'content has changed since',
										'wunderpaint'
								  )
								: '' }
						</span>
					) : (
						<span>
							{ __(
								'The library has not been checked yet.',
								'wunderpaint'
							) }
						</span>
					) }
				</div>
				{ busy ? (
					<button
						className="ai-btn secondary sm"
						onClick={ onCancel }
					>
						{ __( 'Stop', 'wunderpaint' ) }
					</button>
				) : (
					<button
						className={
							'ai-btn sm ' +
							( status?.last ? 'secondary' : 'primary' )
						}
						onClick={ onScan }
					>
						{ status?.last
							? __( 'Check again', 'wunderpaint' )
							: __( 'Check the library', 'wunderpaint' ) }
					</button>
				) }
			</div>

			{ busy && (
				<div className="wpie-cleanup-progress">
					<div className="wpie-cleanup-bar">
						<span style={ { width: pct + '%' } } />
					</div>
					<em>
						{ status?.stage
							? sprintf(
									/* translators: 1: source name, 2: rows done, 3: rows total. */
									__(
										'Reading %1$s — %2$s of %3$s',
										'wunderpaint'
									),
									status.stage,
									done.toLocaleString(),
									total.toLocaleString()
							  )
							: __( 'Starting…', 'wunderpaint' ) }
					</em>
				</div>
			) }
		</div>
	);
}

/** Images with no reference anywhere. */
function UnusedTab( { status, onChanged } ) {
	const [ items, setItems ] = useState( null );
	const [ sel, setSel ] = useState( () => new Set() );
	const [ busy, setBusy ] = useState( false );
	const [ kept, setKept ] = useState( [] );

	const load = useCallback( () => {
		mediaLib
			.items( {
				usage: 'unused',
				per: 200,
				orderby: 'size',
				order: 'desc',
			} )
			.then( ( r ) => setItems( r?.items || [] ) )
			.catch( () => setItems( [] ) );
	}, [] );

	useEffect( () => {
		load();
	}, [ load, status?.last ] );

	if ( ! status?.last ) {
		return (
			<p className="wpie-cleanup-empty">
				{ __(
					'Run the check first. Until then there is nothing honest to show here.',
					'wunderpaint'
				) }
			</p>
		);
	}
	if ( null === items ) {
		return (
			<p className="wpie-cleanup-empty">
				{ __( 'Loading…', 'wunderpaint' ) }
			</p>
		);
	}
	if ( ! items.length ) {
		return (
			<p className="wpie-cleanup-empty">
				{ __(
					'Nothing to clean up: every image older than the grace period is referenced somewhere.',
					'wunderpaint'
				) }
			</p>
		);
	}

	const toggle = ( id ) => {
		const next = new Set( sel );
		if ( next.has( id ) ) {
			next.delete( id );
		} else {
			next.add( id );
		}
		setSel( next );
	};

	const hold = async () => {
		setBusy( true );
		setKept( [] );
		try {
			const res = await quarantine.hold( [ ...sel ] );
			setKept( res?.kept || [] );
			setSel( new Set() );
			load();
			onChanged?.();
		} catch ( e ) {
			// The server refuses rather than guesses; nothing to undo here.
		}
		setBusy( false );
	};

	const bytes = items
		.filter( ( it ) => sel.has( it.id ) )
		.reduce( ( a, it ) => a + Number( it.filesize || 0 ), 0 );

	return (
		<>
			<div className="wpie-cleanup-actions">
				<label>
					<input
						type="checkbox"
						checked={
							sel.size === items.length && items.length > 0
						}
						onChange={ ( e ) =>
							setSel(
								e.target.checked
									? new Set( items.map( ( i ) => i.id ) )
									: new Set()
							)
						}
					/>
					{ sprintf(
						/* translators: %d: number of images. */
						_n(
							'%d image with no references',
							'%d images with no references',
							items.length,
							'wunderpaint'
						),
						items.length
					) }
				</label>
				<button
					className="ai-btn primary sm"
					disabled={ ! sel.size || busy }
					onClick={ hold }
				>
					{ sel.size
						? sprintf(
								/* translators: 1: number of images, 2: size freed. */
								__(
									'Move %1$d to the holding area (%2$s)',
									'wunderpaint'
								),
								sel.size,
								fmtBytes( bytes )
						  )
						: __( 'Move to the holding area', 'wunderpaint' ) }
				</button>
			</div>

			{ kept.length > 0 && (
				<div className="wpie-cleanup-note">
					{ sprintf(
						/* translators: %d: number of images that were kept. */
						_n(
							'%d image was kept: the re-check found it in use after all.',
							'%d images were kept: the re-check found them in use after all.',
							kept.length,
							'wunderpaint'
						),
						kept.length
					) }
				</div>
			) }

			<div className="wpie-cleanup-grid">
				{ items.map( ( it ) => (
					<button
						key={ it.id }
						className={
							'wpie-cleanup-tile' +
							( sel.has( it.id ) ? ' sel' : '' )
						}
						onClick={ () => toggle( it.id ) }
					>
						<img src={ it.thumb || it.url } alt="" loading="lazy" />
						<span className="wpie-cleanup-tilemeta">
							{ fmtBytes( it.filesize ) }
						</span>
					</button>
				) ) }
			</div>
		</>
	);
}

/** Files in uploads that no attachment claims. */
function FilesTab() {
	const [ dirs, setDirs ] = useState( null );
	const [ found, setFound ] = useState( [] );
	const [ busy, setBusy ] = useState( false );
	const [ done, setDone ] = useState( 0 );
	const [ sel, setSel ] = useState( () => new Set() );

	useEffect( () => {
		orphans
			.dirs()
			.then( ( r ) => setDirs( r?.dirs || [] ) )
			.catch( () => setDirs( [] ) );
	}, [] );

	const scan = async () => {
		setBusy( true );
		setFound( [] );
		setDone( 0 );
		const all = [];
		for ( let i = 0; i < ( dirs?.length || 0 ); i++ ) {
			try {
				const res = await orphans.scan( dirs[ i ] );
				( res?.files || [] ).forEach( ( f ) => all.push( f ) );
			} catch ( e ) {
				// An unreadable directory is skipped, not fatal.
			}
			setDone( i + 1 );
			setFound( [ ...all ] );
		}
		setBusy( false );
	};

	const hold = async () => {
		await orphans.hold( [ ...sel ] );
		setFound( found.filter( ( f ) => ! sel.has( f.path ) ) );
		setSel( new Set() );
	};

	const bytes = found
		.filter( ( f ) => sel.has( f.path ) )
		.reduce( ( a, f ) => a + Number( f.size || 0 ), 0 );

	return (
		<>
			<p className="wpie-cleanup-lead">
				{ __(
					'Files sitting in the uploads folder that no entry in the library points at. WunderPaint’s own folders are always skipped.',
					'wunderpaint'
				) }
			</p>
			<div className="wpie-cleanup-actions">
				<button
					className={
						'ai-btn sm ' +
						( found.length ? 'secondary' : 'primary' )
					}
					onClick={ scan }
					disabled={ busy }
				>
					{ busy
						? sprintf(
								/* translators: 1: directories done, 2: total. */
								__( 'Scanning %1$d of %2$d…', 'wunderpaint' ),
								done,
								dirs?.length || 0
						  )
						: __( 'Scan the uploads folder', 'wunderpaint' ) }
				</button>
				{ found.length > 0 && (
					<button
						className="ai-btn primary sm"
						disabled={ ! sel.size }
						onClick={ hold }
					>
						{ sel.size
							? sprintf(
									/* translators: 1: number of files, 2: size. */
									__(
										'Hold %1$d files (%2$s)',
										'wunderpaint'
									),
									sel.size,
									fmtBytes( bytes )
							  )
							: __(
									'Move selected to the holding area',
									'wunderpaint'
							  ) }
					</button>
				) }
			</div>

			{ found.length > 0 && (
				<ul className="wpie-cleanup-files">
					{ found.slice( 0, 500 ).map( ( f ) => (
						<li key={ f.path }>
							<label>
								<input
									type="checkbox"
									checked={ sel.has( f.path ) }
									onChange={ () => {
										const next = new Set( sel );
										if ( next.has( f.path ) ) {
											next.delete( f.path );
										} else {
											next.add( f.path );
										}
										setSel( next );
									} }
								/>
								{ f.url ? (
									<img
										src={ f.url }
										alt=""
										loading="lazy"
										className="wpie-cleanup-orphanthumb"
									/>
								) : (
									<span className="wpie-cleanup-orphanthumb none">
										{ I.list( { size: 14 } ) }
									</span>
								) }
								<code>{ f.path }</code>
								<em>{ fmtBytes( f.size ) }</em>
							</label>
						</li>
					) ) }
				</ul>
			) }
			{ ! busy && done > 0 && ! found.length && (
				<p className="wpie-cleanup-empty">
					{ __( 'No orphaned files found.', 'wunderpaint' ) }
				</p>
			) }
		</>
	);
}

/** Originals wider than anything the site delivers. */
function OversizeTab( { extras, onClose } ) {
	const [ data, setData ] = useState( null );
	const [ sel, setSel ] = useState( () => new Set() );

	useEffect( () => {
		oversize
			.list( 100 )
			.then( setData )
			.catch( () => setData( { items: [] } ) );
	}, [] );

	if ( ! data ) {
		return (
			<p className="wpie-cleanup-empty">
				{ __( 'Loading…', 'wunderpaint' ) }
			</p>
		);
	}
	if ( ! data.items?.length ) {
		return (
			<p className="wpie-cleanup-empty">
				{ __( 'No oversized originals found.', 'wunderpaint' ) }
			</p>
		);
	}

	const toggle = ( id ) => {
		const next = new Set( sel );
		if ( next.has( id ) ) {
			next.delete( id );
		} else {
			next.add( id );
		}
		setSel( next );
	};

	// Everything the check found is a candidate, so pre-select the ones that
	// are not linked at full size anywhere. Those are the safe majority.
	const safe = data.items.filter( ( it ) => ! it.linked );
	const chosen = sel.size ? [ ...sel ] : safe.map( ( it ) => it.id );
	const saving = data.items
		.filter( ( it ) => chosen.includes( it.id ) )
		.reduce( ( a, it ) => a + Number( it.size || 0 ), 0 );

	const shrink = () => {
		if ( ! chosen.length || ! extras?.openBatch ) {
			return;
		}
		// Hand over the width the check already worked out, plus overwrite,
		// because reclaiming the space is the entire point.
		extras.openBatch( {
			initialIds: chosen,
			initialFormat: 'auto',
			initialMaxDim: data.served,
			initialDestination: 'overwrite',
		} );
		onClose?.();
	};

	return (
		<>
			<p className="wpie-cleanup-lead">
				{ sprintf(
					/* translators: %d: width in pixels. */
					__(
						'The largest size this site generates is %d pixels wide. These originals are considerably bigger, so those extra pixels are never delivered to a visitor.',
						'wunderpaint'
					),
					data.served
				) }
			</p>

			{ extras?.openBatch && (
				<div className="wpie-cleanup-actions">
					<span>
						{ sprintf(
							/* translators: 1: number of images, 2: total size. */
							__(
								'%1$d selected, %2$s of originals',
								'wunderpaint'
							),
							chosen.length,
							fmtBytes( saving )
						) }
					</span>
					<button
						className="ai-btn primary sm"
						disabled={ ! chosen.length }
						onClick={ shrink }
					>
						{ sprintf(
							/* translators: %d: target width in pixels. */
							__(
								'Shrink to %d px in the Image Processor',
								'wunderpaint'
							),
							data.served
						) }
					</button>
				</div>
			) }

			<ul className="wpie-cleanup-files">
				{ data.items.map( ( it ) => (
					<li key={ it.id }>
						<label>
							<input
								type="checkbox"
								checked={ chosen.includes( it.id ) }
								onChange={ () => {
									// First interaction turns the implicit
									// pre-selection into an explicit one.
									if ( ! sel.size ) {
										const start = new Set(
											safe.map( ( s ) => s.id )
										);
										if ( start.has( it.id ) ) {
											start.delete( it.id );
										} else {
											start.add( it.id );
										}
										setSel( start );
										return;
									}
									toggle( it.id );
								} }
							/>
							<img src={ it.thumb } alt="" loading="lazy" />
							<code>{ it.title }</code>
							<em>
								{ it.width }&times;{ it.height } ·{ ' ' }
								{ fmtBytes( it.size ) }
								{ it.linked
									? ' · ' +
									  __(
											'linked at full size somewhere',
											'wunderpaint'
									  )
									: '' }
							</em>
						</label>
					</li>
				) ) }
			</ul>
		</>
	);
}

/** The holding area, with a way back. */
function HeldTab( { onChanged } ) {
	const [ data, setData ] = useState( null );
	const [ files, setFiles ] = useState( null );

	const load = useCallback( () => {
		quarantine
			.list()
			.then( setData )
			.catch( () => setData( { items: [] } ) );
		orphans
			.held()
			.then( setFiles )
			.catch( () => setFiles( { items: [] } ) );
	}, [] );

	useEffect( () => {
		load();
	}, [ load ] );

	if ( ! data ) {
		return (
			<p className="wpie-cleanup-empty">
				{ __( 'Loading…', 'wunderpaint' ) }
			</p>
		);
	}

	const restore = async ( id ) => {
		await quarantine.restore( [ id ] );
		load();
		onChanged?.();
	};

	const restoreFile = async ( rel ) => {
		await orphans.restore( [ rel ] );
		load();
	};

	const nothing = ! data.items?.length && ! files?.items?.length;

	return (
		<>
			<p className="wpie-cleanup-lead">
				{ sprintf(
					/* translators: %d: retention period in days. */
					__(
						'Nothing here is gone yet. After %d days each entry is checked once more, and anything that turns out to be in use goes back by itself.',
						'wunderpaint'
					),
					data.days || 30
				) }
			</p>

			{ data.rescued?.length > 0 && (
				<div className="wpie-cleanup-note">
					{ sprintf(
						/* translators: %d: number of images. */
						_n(
							'%d image was put back automatically: it was in use again by the time its period ran out.',
							'%d images were put back automatically: they were in use again by the time their period ran out.',
							data.rescued.length,
							'wunderpaint'
						),
						data.rescued.length
					) }
				</div>
			) }

			{ nothing && (
				<p className="wpie-cleanup-empty">
					{ __( 'The holding area is empty.', 'wunderpaint' ) }
				</p>
			) }

			{ data.items?.length > 0 && (
				<ul className="wpie-cleanup-files">
					{ data.items.map( ( it ) => (
						<li key={ it.id }>
							<label>
								{ it.thumb && (
									<img
										src={ it.thumb }
										alt=""
										loading="lazy"
									/>
								) }
								<code>{ it.title }</code>
								<em>
									{ sprintf(
										/* translators: %s: date. */
										__( 'deleted on %s', 'wunderpaint' ),
										fmtWhen( it.at )
									) }
								</em>
							</label>
							<button
								className="wpie-mlm-link-btn"
								onClick={ () => restore( it.id ) }
							>
								{ __( 'Put back', 'wunderpaint' ) }
							</button>
						</li>
					) ) }
				</ul>
			) }

			{ files?.items?.length > 0 && (
				<ul className="wpie-cleanup-files">
					{ files.items.map( ( f ) => (
						<li key={ f.rel }>
							<label>
								<code>{ f.rel }</code>
								<em>{ fmtBytes( f.size ) }</em>
							</label>
							<button
								className="wpie-mlm-link-btn"
								onClick={ () => restoreFile( f.rel ) }
							>
								{ __( 'Put back', 'wunderpaint' ) }
							</button>
						</li>
					) ) }
				</ul>
			) }
		</>
	);
}
