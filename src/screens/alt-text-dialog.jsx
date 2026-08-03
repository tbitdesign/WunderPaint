/**
 * Alt Text Assistant (v1.191.0): a two-column media-metadata tool. Left: the
 * engine (local model or any configured AI provider), an output language, the
 * fields to fill (title, alt, caption, description and tags), optional
 * prefix/suffix affixes with saved presets, and a rough cost estimate. Right:
 * a scrollable, searchable media grid with multi-select, current-metadata on
 * hover, and a per-image editor. A batch run generates suggestions for the
 * selection in one request per image (including tags and mood) and shows them
 * for review and editing before they are written.
 *
 * The per-image editor and the caption helpers live in shared modules
 * (meta-editor.jsx, lib/caption-fields.js) so the Media Library Manager reuses
 * the exact same behaviour, and tag writing is unified through ensureTagIds.
 */

import { useState, useRef, useEffect } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { I } from '../icons';
import { useEditor } from '../store/editor-context';
import { useEscape } from '../components/use-escape';
import { HelpLink } from './help-dialog';
import { listMediaPage, updateMedia } from '../lib/api';
import { isModelInstalled } from '../lib/ml';
import { promptDialog } from '../lib/dialogs';
import { mediaLib, ensureTagIds } from '../lib/media-library';
import { VarButton } from '../components/var-picker';
import { affixBindingGroups, expandTokens } from '../lib/dynamic-content';
import {
	LANGS,
	COST_PER_IMG,
	FIELD_DEFS,
	toDataUrl,
	captionOne,
} from '../lib/caption-fields';
import { MetaEditor } from './meta-editor';

/** Fields that accept an optional prefix/suffix affix. */
const AFFIX_KEYS = [ 'title', 'alt', 'caption', 'description' ];

const readLS = ( key, fallback ) => {
	try {
		const v = JSON.parse( window.localStorage.getItem( key ) );
		return v ?? fallback;
	} catch ( e ) {
		return fallback;
	}
};

const sleep = ( ms ) => new Promise( ( r ) => setTimeout( r, ms ) );

/**
 * Reject if a promise has not settled in `ms`, so a stalled server request
 *  (a saturated FPM pool after a big batch) surfaces as a catchable error
 *  instead of wedging the loop - and with it the whole dialog - forever.
 */
const withTimeout = ( promise, ms, label ) =>
	Promise.race( [
		promise,
		new Promise( ( resolve, reject ) =>
			setTimeout( () => reject( new Error( label || 'Timed out' ) ), ms )
		),
	] );

/** Whether an error is a provider rate-limit (HTTP 429). */
const is429 = ( err ) =>
	!! (
		err &&
		( err.isQuota ||
			429 === err.status ||
			/429|too many|rate limit/i.test( err.message || '' ) )
	);

export function AltTextDialog( {
	onClose,
	extras,
	initialFilter = 'all',
	initialIds = [],
} ) {
	const editor = useEditor();
	const { WPIE } = editor;
	const providers = WPIE.providers || {};
	// window.WPIE first: the context copy misses kits saved after boot.
	const kits = window.WPIE?.brandKits || WPIE.brandKits || [];
	const kit =
		kits.find( ( k ) => k.id === editor.state?.doc?.brandKitId ) ||
		kits[ 0 ] ||
		null;
	const affixGroups = affixBindingGroups( kit );
	const captionInstalled = isModelInstalled( 'caption' );

	const engines = [
		captionInstalled && {
			id: 'local',
			label: __( 'Local model', 'wunderpaint' ),
			desc: __( 'Free, on device', 'wunderpaint' ),
		},
		providers.anthropic && {
			id: 'anthropic',
			label: 'Anthropic (Claude)',
			desc: __( 'Cloud, all fields', 'wunderpaint' ),
		},
		providers.openai && {
			id: 'openai',
			label: 'OpenAI',
			desc: __( 'Cloud, all fields', 'wunderpaint' ),
		},
		providers.gemini && {
			id: 'gemini',
			label: 'Google Gemini',
			desc: __( 'Cloud, cheapest', 'wunderpaint' ),
		},
	].filter( Boolean );

	const [ engine, setEngine ] = useState( engines[ 0 ]?.id || 'local' );
	const isLocal = 'local' === engine;
	const [ lang, setLang ] = useState( '' );
	const [ fields, setFields ] = useState( {
		title: true,
		alt: true,
		caption: true,
		description: true,
		tags: true,
	} );
	const [ affixes, setAffixes ] = useState( () =>
		readLS( 'wpie-alt-affixes', {} )
	);
	const [ presets, setPresets ] = useState( () =>
		readLS( 'wpie-alt-affix-presets', [] )
	);
	const [ showAffix, setShowAffix ] = useState( false );
	const [ images, setImages ] = useState( [] );
	const [ page, setPage ] = useState( 0 );
	const [ hasMore, setHasMore ] = useState( false );
	const [ loading, setLoading ] = useState( false );
	const [ query, setQuery ] = useState( '' );
	const [ filter, setFilter ] = useState(
		'noalt' === initialFilter ? 'noalt' : 'all'
	);
	const [ selected, setSelected ] = useState( () => new Set() );
	const [ view, setView ] = useState( 'browse' );
	const [ results, setResults ] = useState( {} );
	const [ justSaved, setJustSaved ] = useState( false ); // saved, no edits since
	const [ progress, setProgress ] = useState( {} );
	const [ running, setRunning ] = useState( false );
	const [ statusLine, setStatusLine ] = useState( '' ); // footer progress text
	const [ runTotal, setRunTotal ] = useState( 0 ); // images in the current run
	const [ editId, setEditId ] = useState( null );
	const cancelled = useRef( false );
	const affixRefs = useRef( {} );
	const lastClicked = useRef( null );
	// The single reliable escape hatch: stop any in-flight batch AND unlock
	// the dialog. The generate/save loops check cancelled.current and skip
	// further state writes, so a late-settling request cannot revive the run
	// or re-lock the UI. (v1.290.3: the dialog could wedge with only a dead
	// Cancel button after a batch stalled.)
	const stopRun = () => {
		cancelled.current = true;
		setRunning( false );
	};
	// Escape always works now - if a run is going it stops it, then closes.
	useEscape( () => {
		if ( editId ) {
			return;
		}
		stopRun();
		onClose();
	} );

	const activeFields = FIELD_DEFS.filter(
		( f ) => fields[ f.key ] && ! ( f.aiOnly && isLocal )
	).map( ( f ) => f.key );
	const tagsActive = fields.tags && ! isLocal;

	useEffect( () => {
		try {
			window.localStorage.setItem(
				'wpie-alt-affixes',
				JSON.stringify( affixes )
			);
		} catch ( e ) {}
	}, [ affixes ] );

	const affixCtx = {
		siteName: WPIE.siteName || '',
		siteUrl: WPIE.siteUrl || '',
		siteTagline: WPIE.siteTagline || '',
		brand: kit || undefined,
	};
	const refFor = ( key ) => {
		if ( ! affixRefs.current[ key ] ) {
			affixRefs.current[ key ] = { current: null };
		}
		return affixRefs.current[ key ];
	};
	const applyAffix = ( key, value, image ) => {
		const a = affixes[ key ];
		if ( ! value || ! a ) {
			return value;
		}
		const ctx = { ...affixCtx, image };
		return `${ expandTokens(
			a.prefix || '',
			ctx
		) }${ value }${ expandTokens( a.suffix || '', ctx ) }`;
	};
	const setAffix = ( key, part, val ) =>
		setAffixes( ( prev ) => ( {
			...prev,
			[ key ]: { ...prev[ key ], [ part ]: val },
		} ) );

	const savePreset = async () => {
		const raw = await promptDialog( {
			title: __( 'Save affix preset', 'wunderpaint' ),
			label: __( 'Preset name', 'wunderpaint' ),
		} );
		const name = ( raw || '' ).trim();
		if ( ! name ) {
			return;
		}
		const next = [
			...presets.filter( ( p ) => p.name !== name ),
			{ name, affixes },
		];
		setPresets( next );
		try {
			window.localStorage.setItem(
				'wpie-alt-affix-presets',
				JSON.stringify( next )
			);
		} catch ( e ) {}
	};
	const applyPreset = ( name ) => {
		const p = presets.find( ( x ) => x.name === name );
		if ( p ) {
			setAffixes( p.affixes || {} );
		}
	};
	const deletePreset = ( name ) => {
		const next = presets.filter( ( p ) => p.name !== name );
		setPresets( next );
		try {
			window.localStorage.setItem(
				'wpie-alt-affix-presets',
				JSON.stringify( next )
			);
		} catch ( e ) {}
	};

	const loadPage = async ( p ) => {
		setLoading( true );
		try {
			const res = await listMediaPage( p );
			setImages( ( prev ) =>
				1 === p ? res.items : [ ...prev, ...res.items ]
			);
			setHasMore( res.hasMore );
			setPage( p );
		} catch ( err ) {
			extras.toasts.error( err.message );
		}
		setLoading( false );
	};
	useEffect( () => {
		// Opened from a selection (e.g. Media Library Tools -> Generate
		// Metadata): preload exactly those images and pre-select them, so the
		// selection carries over just like the Image Processor does.
		if ( initialIds && initialIds.length ) {
			( async () => {
				setLoading( true );
				try {
					const res = await mediaLib.items( {
						ids: initialIds,
						per: initialIds.length,
					} );
					const list = res.items || [];
					setImages( list );
					setHasMore( false );
					setSelected( new Set( list.map( ( i ) => i.id ) ) );
				} catch ( err ) {
					extras.toasts.error( err.message );
				}
				setLoading( false );
			} )();
		} else {
			loadPage( 1 );
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [] );

	const shown = images.filter(
		( i ) =>
			( 'all' === filter || ! i.alt ) &&
			( ! query ||
				( i.title || '' )
					.toLowerCase()
					.includes( query.toLowerCase() ) )
	);
	const toggle = ( id ) =>
		setSelected( ( prev ) => {
			const n = new Set( prev );
			if ( n.has( id ) ) {
				n.delete( id );
			} else {
				n.add( id );
			}
			return n;
		} );

	// Click selection with shift-range over the currently shown order.
	const onTileClick = ( e, id ) => {
		if ( e.shiftKey && null !== lastClicked.current ) {
			const order = shown.map( ( i ) => i.id );
			const a = order.indexOf( lastClicked.current );
			const b = order.indexOf( id );
			if ( a >= 0 && b >= 0 ) {
				const [ lo, hi ] = a < b ? [ a, b ] : [ b, a ];
				setSelected( ( prev ) => {
					const n = new Set( prev );
					for ( let i = lo; i <= hi; i++ ) {
						n.add( order[ i ] );
					}
					return n;
				} );
			}
		} else {
			toggle( id );
		}
		lastClicked.current = id;
	};

	const applySaved = ( id, vals ) =>
		setImages( ( prev ) =>
			prev.map( ( i ) =>
				i.id === id
					? {
							...i,
							alt: vals.alt ?? i.alt,
							title: vals.title ?? i.title,
					  }
					: i
			)
		);

	const costEst =
		! isLocal && selected.size
			? selected.size * ( COST_PER_IMG[ engine ] || 0 )
			: 0;

	const generate = async () => {
		const ids = [ ...selected ];
		if ( ! ids.length || ( ! activeFields.length && ! tagsActive ) ) {
			return;
		}
		setView( 'review' );
		setResults( {} );
		setProgress( {} );
		setJustSaved( false );
		setRunning( true );
		setRunTotal( ids.length );
		cancelled.current = false;
		const cloud = ! isLocal;
		let pace = 400;
		let consecutiveFails = 0;
		let warnedLimit = false;
		const genLabel = ( n ) =>
			sprintf(
				/* translators: 1: current, 2: total. */
				__( 'Generating metadata… %1$d of %2$d', 'wunderpaint' ),
				n,
				ids.length
			);
		for ( let idx = 0; idx < ids.length; idx++ ) {
			const id = ids[ idx ];
			if ( cancelled.current ) {
				break;
			}
			setStatusLine( genLabel( idx + 1 ) );
			setProgress( ( p ) => ( { ...p, [ id ]: 'working' } ) );
			const item = images.find( ( i ) => i.id === id );
			let attempt = 0;
			let ok = false;
			// Option A: on a rate limit, wait it out and keep going (slower)
			// rather than aborting the run and stranding the rest.
			for ( ; ! cancelled.current;  ) {
				try {
					const r = await captionOne(
						await toDataUrl( item.url ),
						engine,
						lang
					);
					if ( cancelled.current ) {
						break;
					}
					const merged = { ...r, tags: [ ...( r.tags || [] ) ] };
					if (
						merged.mood &&
						! merged.tags.some(
							( t ) =>
								t.toLowerCase() === merged.mood.toLowerCase()
						)
					) {
						merged.tags.push( merged.mood );
					}
					const image = {
						width: item.width,
						height: item.height,
						filename: item.filename,
						mime: item.mime,
					};
					AFFIX_KEYS.forEach( ( k ) => {
						merged[ k ] = applyAffix( k, merged[ k ], image );
					} );
					setResults( ( prev ) => ( { ...prev, [ id ]: merged } ) );
					setProgress( ( p ) => ( { ...p, [ id ]: 'done' } ) );
					ok = true;
					break;
				} catch ( err ) {
					if ( is429( err ) ) {
						attempt++;
						// Slow the rest so we stop tripping the limit, and count
						// down so the wait is visible instead of looking hung.
						pace = Math.max( pace, 5000 );
						if ( ! warnedLimit ) {
							warnedLimit = true;
							extras.toasts.error(
								__(
									'AI rate limit reached - the run keeps going, slower. Raise “AI requests per 5 minutes” in Settings to speed it up.',
									'wunderpaint'
								)
							);
						}
						if ( attempt > 15 ) {
							setProgress( ( p ) => ( {
								...p,
								[ id ]:
									'error:' +
									__( 'Rate limit', 'wunderpaint' ),
							} ) );
							break;
						}
						const wait = Math.min( 5000 + 3000 * attempt, 30000 );
						for (
							let s = Math.round( wait / 1000 );
							s > 0 && ! cancelled.current;
							s--
						) {
							setStatusLine(
								sprintf(
									/* translators: 1: seconds, 2: done, 3: total. */
									__(
										'Rate limit — waiting %1$ds… (%2$d of %3$d done)',
										'wunderpaint'
									),
									s,
									idx,
									ids.length
								)
							);
							await sleep( 1000 );
						}
						continue;
					}
					setProgress( ( p ) => ( {
						...p,
						[ id ]: 'error:' + err.message,
					} ) );
					break;
				}
			}
			consecutiveFails = ok ? 0 : consecutiveFails + 1;
			// A run of hard failures means the provider will not serve this
			// batch now (e.g. a daily quota) - stop rather than grind forever.
			if ( consecutiveFails >= 8 && ! cancelled.current ) {
				extras.toasts.error(
					__(
						'The AI provider keeps refusing (a daily quota may be reached). Stopped - try the rest later.',
						'wunderpaint'
					)
				);
				break;
			}
			if ( cloud && idx < ids.length - 1 && ! cancelled.current ) {
				await sleep( pace );
			}
		}
		setStatusLine( '' );
		setRunning( false );
	};

	const save = async () => {
		const ids = Object.keys( results ).map( Number );
		setRunning( true );
		setRunTotal( ids.length );
		cancelled.current = false; // fresh run: a prior Cancel must not abort this
		const timeoutMsg = __( 'Saving timed out', 'wunderpaint' );

		// Resolve every tag ONCE up front. Creating a term per image was part of
		// what made saving slow, and creating the same term from the parallel
		// writes below would race - so those writes only assign, never create.
		const tagCache = new Map();
		if ( tagsActive ) {
			const firstSeen = new Map(); // lowercase -> original casing
			ids.forEach( ( id ) =>
				( results[ id ]?.tags || [] ).forEach( ( t ) => {
					const key = ( t || '' ).trim().toLowerCase();
					if ( key && ! firstSeen.has( key ) ) {
						firstSeen.set( key, ( t || '' ).trim() );
					}
				} )
			);
			try {
				await ensureTagIds( [ ...firstSeen.values() ], tagCache );
			} catch ( e ) {}
		}

		let done = 0;
		let failed = 0;
		const tick = () =>
			setStatusLine(
				sprintf(
					/* translators: 1: current, 2: total. */
					__( 'Saving metadata… %1$d of %2$d', 'wunderpaint' ),
					Math.min( ids.length, done + failed + 1 ),
					ids.length
				)
			);
		tick();

		const saveOne = async ( id ) => {
			if ( cancelled.current ) {
				return;
			}
			setProgress( ( p ) => ( { ...p, [ id ]: 'saving' } ) );
			try {
				const r = results[ id ];
				const patch = {};
				activeFields.forEach( ( k ) => {
					if ( r[ k ] ) {
						patch[ k ] = r[ k ];
					}
				} );
				if ( Object.keys( patch ).length ) {
					await withTimeout(
						updateMedia( id, patch ),
						30000,
						timeoutMsg
					);
					applySaved( id, patch );
				}
				if ( tagsActive && ( r.tags || [] ).length ) {
					const tagIds = ( r.tags || [] )
						.map( ( t ) =>
							tagCache.get( ( t || '' ).trim().toLowerCase() )
						)
						.filter( Boolean );
					if ( tagIds.length ) {
						await withTimeout(
							mediaLib.assign( { ids: [ id ], addTags: tagIds } ),
							30000,
							timeoutMsg
						);
					}
				}
				done++;
				setProgress( ( p ) => ( { ...p, [ id ]: 'saved' } ) );
			} catch ( err ) {
				failed++;
				setProgress( ( p ) => ( {
					...p,
					[ id ]: 'error:' + err.message,
				} ) );
			}
			tick();
		};

		// A small worker pool so the slow per-attachment writes (each fires the
		// site's save_post hooks) overlap instead of running one at a time.
		let cursor = 0;
		const worker = async () => {
			while ( ! cancelled.current && cursor < ids.length ) {
				await saveOne( ids[ cursor++ ] );
			}
		};
		await Promise.all(
			Array.from( { length: Math.min( 5, ids.length ) }, worker )
		);

		setRunning( false );
		const summary = sprintf(
			/* translators: 1: saved count, 2: failed count. */
			__(
				'Saved metadata for %1$d image(s), %2$d failed.',
				'wunderpaint'
			),
			done,
			failed
		);
		// Keep the result in the footer status too - a toast can hide behind
		// the dialog, the footer line does not.
		setStatusLine( cancelled.current ? '' : summary );
		// Everything saved with nothing left to do: reflect that on the button
		// instead of still inviting a "Save" click.
		setJustSaved( ! cancelled.current && 0 === failed );
		if ( ! cancelled.current ) {
			extras.toasts.success( summary );
		}
	};

	const statusMark = ( id ) => {
		const s = progress[ id ] || '';
		if ( 'working' === s || 'saving' === s ) {
			return <span className="spin" />;
		}
		if ( 'done' === s || 'saved' === s ) {
			return <span style={ { color: 'var(--ok, #00a32a)' } }>✓</span>;
		}
		if ( s.startsWith( 'error:' ) ) {
			return (
				<span
					style={ { color: 'var(--danger, #d63638)' } }
					title={ s.slice( 6 ) }
				>
					!
				</span>
			);
		}
		return null;
	};

	const runDone = Object.values( progress ).filter(
		( v ) =>
			'done' === v ||
			'saved' === v ||
			( 'string' === typeof v && v.startsWith( 'error:' ) )
	).length;
	const runPct = runTotal
		? Math.min( 100, Math.round( ( runDone / runTotal ) * 100 ) )
		: 0;

	return (
		<div
			className="modal-backdrop"
			onClick={ running ? undefined : onClose }
			role="presentation"
		>
			<div
				className="wpie-alt-dialog"
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-label={ __( 'Metadata Assistant', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<span className="dsm-title">
							{ __( 'Metadata Assistant', 'wunderpaint' ) }
						</span>
						<HelpLink article="metadata" extras={ extras } />
						<div className="dsm-sub">
							{ __(
								'Titles, alt text, captions, descriptions and tags for your media library.',
								'wunderpaint'
							) }
						</div>
					</div>
					<button
						className="dsm-close"
						onClick={ () => {
							stopRun();
							onClose();
						} }
						aria-label={ __( 'Close', 'wunderpaint' ) }
					>
						{ I.close( { size: 17 } ) }
					</button>
				</div>

				{ 'browse' === view && (
					<div className="wpie-alt-body">
						{ /* -------- left controls -------- */ }
						<div className="wpie-alt-side">
							<div>
								<span className="wpie-alt-lbl">
									{ __( 'Engine', 'wunderpaint' ) }
								</span>
								<div
									className="wpie-alt-engines"
									style={ { marginTop: 6 } }
								>
									{ engines.length === 0 && (
										<div
											style={ {
												fontSize: 12,
												color: 'var(--danger, #d63638)',
											} }
										>
											{ __(
												'No engine. Add a model or a provider key.',
												'wunderpaint'
											) }{ ' ' }
											<a
												href={ WPIE.settingsUrl }
												target="_blank"
												rel="noreferrer"
											>
												{ __(
													'Settings',
													'wunderpaint'
												) }
											</a>
										</div>
									) }
									{ engines.map( ( e ) => (
										<button
											key={ e.id }
											className={
												'wpie-alt-engine' +
												( engine === e.id
													? ' active'
													: '' )
											}
											onClick={ () => setEngine( e.id ) }
										>
											<span className="name">
												{ e.label }
											</span>
											<span className="desc">
												{ e.desc }
											</span>
										</button>
									) ) }
								</div>
							</div>

							{ ! isLocal && (
								<div>
									<span className="wpie-alt-lbl">
										{ __( 'Language', 'wunderpaint' ) }
									</span>
									<select
										className="dsm-select"
										style={ { marginTop: 6 } }
										value={ lang }
										onChange={ ( e ) =>
											setLang( e.target.value )
										}
									>
										<option value="">
											{ __(
												'English (default)',
												'wunderpaint'
											) }
										</option>
										{ LANGS.filter(
											( l ) => 'English' !== l
										).map( ( l ) => (
											<option key={ l } value={ l }>
												{ l }
											</option>
										) ) }
									</select>
								</div>
							) }

							<div>
								<span className="wpie-alt-lbl">
									{ __( 'Fill', 'wunderpaint' ) }
								</span>
								<div style={ { marginTop: 4 } }>
									{ FIELD_DEFS.map( ( f ) => {
										const disabled = f.aiOnly && isLocal;
										return (
											<label
												key={ f.key }
												className="wpie-alt-check"
												style={ {
													opacity: disabled ? 0.5 : 1,
												} }
												title={
													disabled
														? __(
																'The local model does not write a title.',
																'wunderpaint'
														  )
														: undefined
												}
											>
												<input
													type="checkbox"
													checked={
														!! fields[ f.key ] &&
														! disabled
													}
													disabled={ disabled }
													onChange={ ( ev ) =>
														setFields( ( p ) => ( {
															...p,
															[ f.key ]:
																ev.target
																	.checked,
														} ) )
													}
												/>
												{ f.label }
											</label>
										);
									} ) }
									<label
										className="wpie-alt-check"
										style={ { opacity: isLocal ? 0.5 : 1 } }
										title={
											isLocal
												? __(
														'The local model does not produce tags.',
														'wunderpaint'
												  )
												: undefined
										}
									>
										<input
											type="checkbox"
											checked={ fields.tags && ! isLocal }
											disabled={ isLocal }
											onChange={ ( ev ) =>
												setFields( ( p ) => ( {
													...p,
													tags: ev.target.checked,
												} ) )
											}
										/>
										{ __( 'Tags', 'wunderpaint' ) }
									</label>
								</div>
							</div>

							<div>
								<button
									type="button"
									className="wpie-alt-affix-toggle"
									onClick={ () =>
										setShowAffix( ( v ) => ! v )
									}
								>
									<span className="wpie-alt-lbl">
										{ __(
											'Prefix / suffix',
											'wunderpaint'
										) }
									</span>
									<span>{ showAffix ? '▾' : '▸' }</span>
								</button>
								{ showAffix && (
									<div className="wpie-alt-affix">
										<div className="hint">
											{ __(
												'Wrap each field, e.g. prefix "Acme | ". Use the { } button to insert variables like site name, brand or the date.',
												'wunderpaint'
											) }
										</div>
										{ presets.length > 0 && (
											<select
												className="dsm-select"
												value=""
												onChange={ ( e ) => {
													if ( e.target.value ) {
														applyPreset(
															e.target.value
														);
													}
												} }
											>
												<option value="">
													{ __(
														'Load preset',
														'wunderpaint'
													) }
												</option>
												{ presets.map( ( p ) => (
													<option
														key={ p.name }
														value={ p.name }
													>
														{ p.name }
													</option>
												) ) }
											</select>
										) }
										{ AFFIX_KEYS.map( ( k ) => {
											const def = FIELD_DEFS.find(
												( f ) => f.key === k
											);
											return (
												<div key={ k } className="row">
													<span>{ def.label }</span>
													<div className="pair">
														{ [
															'prefix',
															'suffix',
														].map( ( part ) => (
															<div
																key={ part }
																className="affix-in"
															>
																<input
																	ref={ refFor(
																		k +
																			'.' +
																			part
																	) }
																	className="wpie-alt-search"
																	placeholder={
																		'prefix' ===
																		part
																			? __(
																					'Prefix',
																					'wunderpaint'
																			  )
																			: __(
																					'Suffix',
																					'wunderpaint'
																			  )
																	}
																	value={
																		affixes[
																			k
																		]?.[
																			part
																		] || ''
																	}
																	onChange={ (
																		e
																	) =>
																		setAffix(
																			k,
																			part,
																			e
																				.target
																				.value
																		)
																	}
																/>
																<VarButton
																	value={
																		affixes[
																			k
																		]?.[
																			part
																		] || ''
																	}
																	onChange={ (
																		v
																	) =>
																		setAffix(
																			k,
																			part,
																			v
																		)
																	}
																	inputRef={ refFor(
																		k +
																			'.' +
																			part
																	) }
																	groups={
																		affixGroups
																	}
																/>
															</div>
														) ) }
													</div>
												</div>
											);
										} ) }
										<div className="acts">
											<button
												className="ai-btn secondary"
												style={ {
													fontSize: 12,
													padding: '3px 8px',
												} }
												onClick={ savePreset }
											>
												{ __(
													'Save preset',
													'wunderpaint'
												) }
											</button>
											{ presets.length > 0 && (
												<select
													className="dsm-select"
													style={ { width: 'auto' } }
													value=""
													onChange={ ( e ) => {
														if ( e.target.value ) {
															deletePreset(
																e.target.value
															);
														}
													} }
												>
													<option value="">
														{ __(
															'Delete preset',
															'wunderpaint'
														) }
													</option>
													{ presets.map( ( p ) => (
														<option
															key={ p.name }
															value={ p.name }
														>
															{ p.name }
														</option>
													) ) }
												</select>
											) }
										</div>
									</div>
								) }
							</div>

							{ costEst > 0 && (
								<div className="wpie-alt-cost">
									{ sprintf(
										/* translators: 1: count, 2: dollar estimate. */
										__(
											'Estimated cost for %1$d images: ~$%2$s',
											'wunderpaint'
										),
										selected.size,
										costEst < 0.1
											? costEst.toFixed( 4 )
											: costEst.toFixed( 2 )
									) }
								</div>
							) }

							<div style={ { marginTop: 'auto' } }>
								<button
									className="ai-btn primary"
									style={ { width: '100%' } }
									disabled={
										! selected.size ||
										! activeFields.length ||
										! engines.length
									}
									onClick={ generate }
								>
									{ sprintf(
										/* translators: %d: count. */
										__( 'Generate for %d', 'wunderpaint' ),
										selected.size
									) }
								</button>
							</div>
						</div>

						{ /* -------- right media -------- */ }
						<div className="wpie-alt-main">
							<div className="wpie-alt-tools">
								<input
									className="wpie-alt-search"
									style={ { flex: 1, minWidth: 120 } }
									placeholder={ __(
										'Search by title',
										'wunderpaint'
									) }
									value={ query }
									onChange={ ( e ) =>
										setQuery( e.target.value )
									}
								/>
								<select
									className="dsm-select"
									style={ { width: 'auto' } }
									value={ filter }
									onChange={ ( e ) =>
										setFilter( e.target.value )
									}
								>
									<option value="all">
										{ __( 'All images', 'wunderpaint' ) }
									</option>
									<option value="noalt">
										{ __(
											'Missing alt text',
											'wunderpaint'
										) }
									</option>
								</select>
								<button
									className="ai-btn secondary"
									style={ {
										padding: '3px 8px',
										fontSize: 12,
									} }
									onClick={ () =>
										setSelected(
											new Set(
												shown.map( ( i ) => i.id )
											)
										)
									}
								>
									{ __( 'Select all', 'wunderpaint' ) }
								</button>
								<button
									className="ai-btn secondary"
									style={ {
										padding: '3px 8px',
										fontSize: 12,
									} }
									onClick={ () => setSelected( new Set() ) }
								>
									{ __( 'Clear', 'wunderpaint' ) }
								</button>
								<span
									style={ {
										fontSize: 12,
										color: 'var(--text-secondary)',
									} }
								>
									{ sprintf(
										/* translators: %d: count. */
										__( '%d selected', 'wunderpaint' ),
										selected.size
									) }
								</span>
							</div>

							<div className="wpie-alt-grid">
								{ shown.map( ( item ) => {
									const on = selected.has( item.id );
									return (
										<div
											key={ item.id }
											className={
												'wpie-alt-tile' +
												( on ? ' sel' : '' )
											}
											role="button"
											tabIndex={ 0 }
											onClick={ ( e ) =>
												onTileClick( e, item.id )
											}
											onKeyDown={ ( e ) =>
												( 'Enter' === e.key ||
													' ' === e.key ) &&
												onTileClick( e, item.id )
											}
										>
											<img
												src={ item.url }
												alt=""
												loading="lazy"
											/>
											<span className="tick">
												{ on ? '✓' : '' }
											</span>
											<button
												className="edit"
												title={ __(
													'Edit metadata',
													'wunderpaint'
												) }
												onClick={ ( e ) => {
													e.stopPropagation();
													setEditId( item.id );
												} }
											>
												{ I.pencil
													? I.pencil( { size: 12 } )
													: '✎' }
											</button>
											{ ! item.alt && (
												<span className="badge">
													{ __(
														'no alt',
														'wunderpaint'
													) }
												</span>
											) }
											<span className="meta">
												<span>
													<b>
														{ item.title ||
															__(
																'(no title)',
																'wunderpaint'
															) }
													</b>
												</span>
												<span>
													{ item.alt ||
														__(
															'(no alt text)',
															'wunderpaint'
														) }
												</span>
											</span>
										</div>
									);
								} ) }
								{ ! shown.length && ! loading && (
									<div
										style={ {
											gridColumn: '1/-1',
											fontSize: 12,
											color: 'var(--text-secondary)',
											padding: 12,
										} }
									>
										{ __( 'No images.', 'wunderpaint' ) }
									</div>
								) }
								{ hasMore && (
									<button
										className="ai-btn secondary"
										style={ { gridColumn: '1/-1' } }
										onClick={ () => loadPage( page + 1 ) }
										disabled={ loading }
									>
										{ loading && <span className="spin" /> }
										{ __( 'Load more', 'wunderpaint' ) }
									</button>
								) }
							</div>
						</div>
					</div>
				) }

				{ 'review' === view && (
					<div
						style={ {
							padding: 14,
							overflowY: 'auto',
							display: 'grid',
							gap: 10,
							alignContent: 'start',
						} }
						onInput={ () => {
							if ( justSaved ) {
								setJustSaved( false );
							}
						} }
					>
						<div
							style={ {
								fontSize: 12,
								color: 'var(--text-secondary)',
							} }
						>
							{ __(
								'Review and edit, then save. Empty fields are skipped.',
								'wunderpaint'
							) }
						</div>
						{ [ ...selected ].map( ( id ) => {
							const item = images.find( ( i ) => i.id === id );
							const r = results[ id ];
							return (
								<div key={ id } className="wpie-alt-row">
									<img src={ item?.url } alt="" />
									<div
										style={ {
											flex: 1,
											display: 'grid',
											gap: 6,
											minWidth: 0,
										} }
									>
										<div
											style={ {
												fontSize: 11,
												color: 'var(--text-secondary)',
												display: 'flex',
												gap: 6,
												alignItems: 'center',
											} }
										>
											#{ id } { statusMark( id ) }
										</div>
										{ ! r ? (
											'working' === progress[ id ] ? (
												<span className="spin" />
											) : (
												<span
													style={ {
														fontSize: 11,
														color: 'var(--text-secondary)',
													} }
												>
													{ (
														progress[ id ] || ''
													).startsWith( 'error:' )
														? progress[ id ].slice(
																6
														  )
														: running
														? __(
																'Queued…',
																'wunderpaint'
														  )
														: __(
																'Not processed',
																'wunderpaint'
														  ) }
												</span>
											)
										) : (
											<>
												{ activeFields.map( ( key ) => {
													const def = FIELD_DEFS.find(
														( f ) => f.key === key
													);
													return (
														<label
															key={ key }
															className="wpie-alt-field"
														>
															<span>
																{ def.label }
															</span>
															{ 'description' ===
															key ? (
																<textarea
																	rows={ 2 }
																	value={
																		r[ key ]
																	}
																	onChange={ (
																		ev
																	) =>
																		setResults(
																			(
																				prev
																			) => ( {
																				...prev,
																				[ id ]: {
																					...prev[
																						id
																					],
																					[ key ]:
																						ev
																							.target
																							.value,
																				},
																			} )
																		)
																	}
																/>
															) : (
																<input
																	value={
																		r[ key ]
																	}
																	onChange={ (
																		ev
																	) =>
																		setResults(
																			(
																				prev
																			) => ( {
																				...prev,
																				[ id ]: {
																					...prev[
																						id
																					],
																					[ key ]:
																						ev
																							.target
																							.value,
																				},
																			} )
																		)
																	}
																/>
															) }
														</label>
													);
												} ) }
												{ tagsActive && (
													<label className="wpie-alt-field">
														<span>
															{ __(
																'Tags',
																'wunderpaint'
															) }
														</span>
														<input
															value={ (
																r.tags || []
															).join( ', ' ) }
															onChange={ ( ev ) =>
																setResults(
																	(
																		prev
																	) => ( {
																		...prev,
																		[ id ]: {
																			...prev[
																				id
																			],
																			tags: ev.target.value
																				.split(
																					','
																				)
																				.map(
																					(
																						s
																					) =>
																						s.trim()
																				)
																				.filter(
																					Boolean
																				),
																		},
																	} )
																)
															}
														/>
													</label>
												) }
											</>
										) }
									</div>
								</div>
							);
						} ) }
					</div>
				) }

				<div
					className="dsm-foot"
					style={ {
						display: 'flex',
						gap: 8,
						alignItems: 'center',
						justifyContent: 'space-between',
					} }
				>
					<div
						style={ {
							display: 'flex',
							alignItems: 'center',
							gap: 8,
							minWidth: 0,
							flex: '1 1 auto',
						} }
					>
						{ running && <span className="spin" /> }
						{ statusLine && (
							<span
								style={ {
									fontSize: 12,
									color: 'var(--text-secondary)',
									overflow: 'hidden',
									textOverflow: 'ellipsis',
									whiteSpace: 'nowrap',
								} }
							>
								{ statusLine }
							</span>
						) }
						{ running && runTotal > 0 && (
							<div
								style={ {
									flex: '0 0 120px',
									height: 6,
									borderRadius: 3,
									background: 'var(--surface-input)',
									overflow: 'hidden',
								} }
							>
								<span
									style={ {
										display: 'block',
										height: '100%',
										width: runPct + '%',
										background: 'var(--accent)',
										transition: 'width .3s',
									} }
								/>
							</div>
						) }
					</div>
					<div
						style={ {
							display: 'flex',
							gap: 8,
							flex: '0 0 auto',
						} }
					>
						{ running ? (
							<button
								className="ai-btn secondary"
								onClick={ stopRun }
							>
								{ __( 'Cancel', 'wunderpaint' ) }
							</button>
						) : 'review' === view ? (
							<>
								<button
									className="ai-btn secondary"
									onClick={ () => setView( 'browse' ) }
								>
									{ __( 'Back', 'wunderpaint' ) }
								</button>
								<button
									className="ai-btn primary"
									onClick={ save }
									disabled={
										justSaved ||
										! Object.keys( results ).length
									}
								>
									{ justSaved
										? __( 'Saved ✓', 'wunderpaint' )
										: sprintf(
												/* translators: %d: count. */
												__(
													'Save metadata (%d)',
													'wunderpaint'
												),
												Object.keys( results ).length
										  ) }
								</button>
							</>
						) : (
							<button
								className="ai-btn secondary"
								onClick={ onClose }
							>
								{ __( 'Close', 'wunderpaint' ) }
							</button>
						) }
					</div>
				</div>

				{ editId && (
					<MetaEditor
						id={ editId }
						engine={ engine }
						lang={ lang }
						toasts={ extras.toasts }
						onClose={ () => setEditId( null ) }
						onSaved={ applySaved }
					/>
				) }
			</div>
		</div>
	);
}
