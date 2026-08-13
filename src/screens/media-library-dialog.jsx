/**
 * Media Library Manager (v1.190.0): a full-screen, two-column manager for the
 * WordPress media library, free (no extension). Left rail: real folders (a
 * hierarchical taxonomy), tags, smart folders (saved filters + saved semantic
 * searches), an AI folder-suggestion pass and a duplicate finder. Main: a
 * filterable, sortable, multi-select image grid with hover metadata, a
 * per-image editor (shared with the Alt Text Assistant) and a bulk bar to
 * move, tag, AI auto-tag, set as featured image, insert into the current
 * design, download or delete.
 *
 * The strong search combines the SigLIP semantic ranking with structured
 * filters (folder, tag, color bucket, type, orientation, size) and sorts by
 * date, title, dimensions or file size. Colors and dimensions are precomputed
 * (color during the local index pass, dimensions via a server backfill).
 */

import { useState, useEffect, useRef } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { I } from '../icons';
import { useEditor } from '../store/editor-context';
import { useEscape } from '../components/use-escape';
import { HelpLink } from './help-dialog';
import { isModelInstalled } from '../lib/ml';
import { setFeaturedImage, updateMedia, ai } from '../lib/api';
import { loadImage, makeImage } from '../store/document';
import { confirmDialog, promptDialog } from '../lib/dialogs';
import { toDataUrl } from '../lib/caption-fields';
import {
	mediaLib,
	clusterLibrary,
	findDuplicates,
	findSimilar,
	indexColors,
} from '../lib/media-library';
import { COLOR_BUCKETS, COLOR_SWATCH } from '../lib/image-colors';
import { checkDuplicate, importOne } from '../lib/smart-upload';
import { VarButton } from '../components/var-picker';
import { affixBindingGroups, expandTokens } from '../lib/dynamic-content';
import {
	searchMediaLibrary,
	searchModelInstalled,
	runIndexer,
	fetchIndexStatus,
	subscribeIndexer,
	invalidateVectorCache,
} from '../lib/image-search';
import { MetaEditor } from './meta-editor';
import { CleanupDialog } from './cleanup-dialog';
import { PostPickerDialog } from './post-picker-dialog';

/** Sort options for the toolbar. */
const SORTS = [
	{
		key: '',
		label: __( 'Newest', 'wunderpaint' ),
		orderby: '',
		order: 'DESC',
	},
	{
		key: 'oldest',
		label: __( 'Oldest', 'wunderpaint' ),
		orderby: 'date',
		order: 'ASC',
	},
	{
		key: 'title',
		label: __( 'Title A-Z', 'wunderpaint' ),
		orderby: 'title',
		order: 'ASC',
	},
	{
		key: 'largest',
		label: __( 'Largest', 'wunderpaint' ),
		orderby: 'area',
		order: 'DESC',
	},
	{
		key: 'smallest',
		label: __( 'Smallest', 'wunderpaint' ),
		orderby: 'area',
		order: 'ASC',
	},
	{
		key: 'heaviest',
		label: __( 'Biggest file', 'wunderpaint' ),
		orderby: 'filesize',
		order: 'DESC',
	},
];

/** Fixed smart folders that need no storage. */
const BUILTIN_SMART = [
	{
		id: '_missingAlt',
		name: __( 'Missing alt text', 'wunderpaint' ),
		kind: 'filter',
		params: { missingAlt: true },
		icon: 'alert',
	},
	{
		id: '_unused',
		name: __( 'Unused', 'wunderpaint' ),
		kind: 'filter',
		params: { usage: 'unused' },
		icon: 'unlink',
	},
	{
		id: '_reclaim',
		name: __( 'Reclaim space', 'wunderpaint' ),
		kind: 'reclaim',
		icon: 'trash',
	},
];

/** How many tags the sidebar shows before the "Show all" toggle. */
const TAG_PREVIEW = 6;

/** Human-readable byte size. */
const fmtSize = ( b ) => {
	if ( ! b ) {
		return '';
	}
	if ( b >= 1048576 ) {
		return ( b / 1048576 ).toFixed( 1 ) + ' MB';
	}
	if ( b >= 1024 ) {
		return Math.round( b / 1024 ) + ' KB';
	}
	return b + ' B';
};

export function MediaLibraryDialog( { onClose, extras, pick = null } ) {
	const editor = useEditor();
	const { WPIE, state, dispatch, commit } = editor;
	const providers = WPIE.providers || {};
	// Deleting hands images to the holding room rather than to
	// wp_delete_attachment, so the confirm can name the real grace period
	// instead of promising a restore a stock install cannot do.
	const quarantineDays =
		Number( window.WPIE?.quarantineDays ?? WPIE.quarantineDays ) || 30;
	const captionInstalled = isModelInstalled( 'caption' );
	const defaultEngine = captionInstalled
		? 'local'
		: providers.anthropic
		? 'anthropic'
		: providers.openai
		? 'openai'
		: providers.gemini
		? 'gemini'
		: 'local';

	const [ folders, setFolders ] = useState( [] );
	const [ tags, setTags ] = useState( [] );
	const [ smart, setSmart ] = useState( [] );
	const [ view, setView ] = useState( {
		type: 'all',
		name: __( 'All images', 'wunderpaint' ),
	} );

	const [ items, setItems ] = useState( [] );
	const [ page, setPage ] = useState( 1 );
	const [ pages, setPages ] = useState( 1 );
	const [ total, setTotal ] = useState( 0 );
	const [ loading, setLoading ] = useState( false );
	const [ semantic, setSemantic ] = useState( false );

	const [ selected, setSelected ] = useState( () => new Set() );
	const lastClicked = useRef( null );
	const dragItems = useRef( [] );
	const [ dropId, setDropId ] = useState( null );

	const [ editId, setEditId ] = useState( null );
	const [ postPickFor, setPostPickFor ] = useState( null );
	const [ query, setQuery ] = useState( '' );
	const [ indexInfo, setIndexInfo ] = useState( null );
	const [ clusterOpen, setClusterOpen ] = useState( false );
	const [ clusters, setClusters ] = useState( null );
	const [ clusterBusy, setClusterBusy ] = useState( false );
	const [ clusterNaming, setClusterNaming ] = useState( false );
	const [ busy, setBusy ] = useState( false );

	const [ filters, setFilters ] = useState( {
		orderby: '',
		order: 'DESC',
		// Pick mode starts on the host's media type: full library for an
		// unrestricted "Add Media", videos/audio for those blocks, images
		// everywhere else (and in normal manager use). A mime-mix array
		// with anything beyond images (e.g. image + PDF) starts wide so
		// the extra files are visible (v1.333).
		type:
			( pick &&
				( Array.isArray( pick.types )
					? pick.types.every(
							( w ) => 0 === String( w ).indexOf( 'image' )
					  )
						? 'images'
						: 'all'
					: { all: 'all', video: 'videos', audio: 'audio' }[
							pick.types
					  ] ) ) ||
			'images',
		mime: '',
		orient: '',
		size: '',
		color: '',
		author: 0,
		month: '',
	} );
	const [ sortKey, setSortKey ] = useState( '' );
	// Grid or list presentation (v1.244), remembered across sessions.
	const [ viewMode, setViewMode ] = useState( () => {
		try {
			return 'list' ===
				window.localStorage.getItem( 'wpie-mlm-view-mode' )
				? 'list'
				: 'grid';
		} catch ( e ) {
			return 'grid';
		}
	} );
	const switchViewMode = ( mode ) => {
		setViewMode( mode );
		try {
			window.localStorage.setItem( 'wpie-mlm-view-mode', mode );
		} catch ( e ) {}
	};
	// Filter facets (authors, upload months), sent along with page 1.
	const [ facets, setFacets ] = useState( { authors: [], months: [] } );
	// Inline playback (v1.244): one file at a time, straight in the tile
	// or row - no modal. Videos play their own element, audio shares one.
	const [ playingId, setPlayingId ] = useState( 0 );
	const audioRef = useRef( null );
	const playingVideoRef = useRef( null );
	const stopPlayback = () => {
		if ( audioRef.current ) {
			audioRef.current.pause();
		}
		if ( playingVideoRef.current ) {
			playingVideoRef.current.pause();
			playingVideoRef.current = null;
		}
		setPlayingId( 0 );
	};
	const togglePlay = ( item, videoEl ) => {
		const wasPlaying = playingId === item.id;
		stopPlayback();
		if ( wasPlaying ) {
			return;
		}
		if ( 'video' === item.kind && videoEl ) {
			videoEl.muted = false;
			videoEl.play().catch( () => {} );
			playingVideoRef.current = videoEl;
			setPlayingId( item.id );
		} else if ( 'audio' === item.kind ) {
			if ( ! audioRef.current ) {
				audioRef.current = new window.Audio();
				audioRef.current.addEventListener( 'ended', () =>
					setPlayingId( 0 )
				);
			}
			audioRef.current.src = item.url;
			audioRef.current.play().catch( () => {} );
			setPlayingId( item.id );
		}
	};
	// Never keep playing behind a closed dialog.
	useEffect(
		() => () => {
			if ( audioRef.current ) {
				audioRef.current.pause();
			}
		},
		[]
	);
	const copyUrl = ( item ) => {
		window.navigator.clipboard?.writeText( item.url ).then(
			() =>
				extras.toasts.success(
					__( 'File URL copied.', 'wunderpaint' )
				),
			() => {}
		);
	};
	// Large preview (v1.244.1): a slim lightbox over the manager. Arrow
	// keys / buttons step through the current result list.
	const [ previewId, setPreviewId ] = useState( 0 );
	const openPreview = ( id ) => {
		stopPlayback();
		setPreviewId( id );
	};
	const previewIndex = items.findIndex( ( i ) => i.id === previewId );
	const previewItem = -1 === previewIndex ? null : items[ previewIndex ];
	useEffect( () => {
		if ( ! previewId ) {
			return undefined;
		}
		const onKey = ( e ) => {
			if ( 'Escape' === e.key ) {
				e.stopPropagation();
				e.preventDefault();
				setPreviewId( 0 );
			} else if ( 'ArrowRight' === e.key || 'ArrowLeft' === e.key ) {
				e.stopPropagation();
				e.preventDefault();
				const at = items.findIndex( ( i ) => i.id === previewId );
				const next = items[ at + ( 'ArrowRight' === e.key ? 1 : -1 ) ];
				if ( next ) {
					setPreviewId( next.id );
				}
			}
		};
		document.addEventListener( 'keydown', onKey, true );
		return () => document.removeEventListener( 'keydown', onKey, true );
	}, [ previewId, items ] );
	const [ dupOpen, setDupOpen ] = useState( false );
	const [ dups, setDups ] = useState( null );
	const [ dupBusy, setDupBusy ] = useState( false );
	const [ dupTrash, setDupTrash ] = useState( () => new Set() );
	const [ tagProgress, setTagProgress ] = useState( null );
	const [ prepping, setPrepping ] = useState( false );
	const [ uploadQueue, setUploadQueue ] = useState( null ); // null | [{ file, name, preview, dup, checking, skip }]
	const [ uploadOpts, setUploadOpts ] = useState( {
		optimize: true,
		describe: false,
		folder: 0,
	} );
	const [ uploading, setUploading ] = useState( false );
	const [ uploadProg, setUploadProg ] = useState( null );
	const [ tagsAll, setTagsAll ] = useState( false );
	const [ tagCloud, setTagCloud ] = useState( false );
	const [ toolsOpen, setToolsOpen ] = useState( false );
	const [ cleanupOpen, setCleanupOpen ] = useState( false );
	const toolsLeaveTimer = useRef( 0 );
	const toolsEnter = () => window.clearTimeout( toolsLeaveTimer.current );
	const toolsLeave = () => {
		window.clearTimeout( toolsLeaveTimer.current );
		toolsLeaveTimer.current = window.setTimeout(
			() => setToolsOpen( false ),
			200
		);
	};
	const [ renameOpen, setRenameOpen ] = useState( false );
	const [ renamePattern, setRenamePattern ] = useState( '' );
	const searchTimer = useRef( null );
	// Monotonic token so an out-of-order async search result never overwrites
	// a newer query (v1.227.0). Bumped when a search/similar run starts.
	const searchSeq = useRef( 0 );
	const renameRef = useRef( null );

	const cloudEngine = providers.anthropic
		? 'anthropic'
		: providers.openai
		? 'openai'
		: providers.gemini
		? 'gemini'
		: '';
	const describeEngine = cloudEngine || ( captionInstalled ? 'local' : '' );
	// window.WPIE first: the context copy misses kits saved after boot.
	const kits = window.WPIE?.brandKits || WPIE.brandKits || [];
	const kit =
		kits.find( ( k ) => k.id === editor.state?.doc?.brandKitId ) ||
		kits[ 0 ] ||
		null;
	const affixGroups = affixBindingGroups( kit );

	useEscape(
		() =>
			! editId &&
			! postPickFor &&
			! uploadQueue &&
			! renameOpen &&
			! previewId &&
			onClose()
	);

	/* ------------------------------ loaders ---------------------------- */

	const refreshFolders = () =>
		mediaLib.folders
			.list()
			.then( ( r ) => setFolders( r.items || [] ) )
			.catch( () => {} );
	const refreshTags = () =>
		mediaLib.tags
			.list()
			.then( ( r ) => setTags( r.items || [] ) )
			.catch( () => {} );
	const refreshSmart = () =>
		mediaLib.smart
			.list()
			.then( ( r ) => setSmart( r.items || [] ) )
			.catch( () => {} );

	useEffect( () => {
		refreshFolders();
		refreshTags();
		refreshSmart();
		fetchIndexStatus()
			.then( setIndexInfo )
			.catch( () => {} );
		const unsub = subscribeIndexer( ( st ) =>
			setIndexInfo( ( prev ) => ( {
				...prev,
				running: st.running,
				done: st.done,
				pending: st.total,
			} ) )
		);

		return unsub;
	}, [] );

	const filterParams = ( flt ) => {
		const o = {};
		if ( flt.orderby ) {
			o.orderby = flt.orderby;
		}
		if ( flt.order ) {
			o.order = flt.order;
		}
		if ( flt.type && 'images' !== flt.type ) {
			o.type = flt.type;
		}
		if ( flt.mime ) {
			o.mime = flt.mime;
		}
		if ( flt.orient ) {
			o.orient = flt.orient;
		}
		if ( flt.size ) {
			o.size = flt.size;
		}
		if ( flt.color ) {
			o.color = flt.color;
		}
		if ( flt.author ) {
			o.author = flt.author;
		}
		if ( flt.month ) {
			o.month = flt.month;
		}
		return o;
	};

	const paramsFor = ( v, p, flt ) => {
		const base = { page: p, per: 60, ...filterParams( flt || filters ) };
		if ( 'folder' === v.type ) {
			base.folder = v.id;
		} else if ( 'tag' === v.type ) {
			base.tag = v.id;
		} else if ( 'smart' === v.type && 'filter' === v.kind ) {
			Object.assign( base, v.params || {} );
		}
		return base;
	};

	const loadItems = async ( v, p, append, flt ) => {
		setLoading( true );
		try {
			const res = await mediaLib.items( paramsFor( v, p, flt ) );
			setItems( ( prev ) =>
				append ? [ ...prev, ...res.items ] : res.items
			);
			setPages( res.pages );
			setTotal( res.total );
			setPage( res.page );
			setSemantic( false );
			if ( res.authors || res.months ) {
				setFacets( {
					authors: res.authors || [],
					months: res.months || [],
				} );
			}
		} catch ( e ) {
			extras.toasts.error( e.message );
		}
		setLoading( false );
	};

	// Shared result renderer for ranked id lists (semantic search + similar).
	const showRanked = async ( hitIds, name, flt, token ) => {
		const myId = token ?? ++searchSeq.current;
		setLoading( true );
		setSelected( new Set() );
		try {
			let list = [];
			if ( hitIds.length ) {
				// Re-fetch full shapes in ranked order and apply the active
				// structured filters, so ranked views compose with them.
				const res = await mediaLib.items( {
					ids: hitIds,
					per: hitIds.length,
					...filterParams( flt || filters ),
				} );
				// A newer search started while this one was fetching: drop the
				// stale result so it never overwrites the latest query.
				if ( myId !== searchSeq.current ) {
					return;
				}
				const rank = new Map( hitIds.map( ( id, i ) => [ id, i ] ) );
				list = ( res.items || [] ).sort(
					( a, b ) =>
						( rank.get( a.id ) ?? 0 ) - ( rank.get( b.id ) ?? 0 )
				);
			} else if ( myId !== searchSeq.current ) {
				return;
			}
			setItems( list );
			setSemantic( true );
			setPages( 1 );
			setTotal( list.length );
			setPage( 1 );
			setView( { type: 'search', name } );
		} catch ( e ) {
			extras.toasts.error( e.message );
		} finally {
			setLoading( false );
		}
	};

	const runSemantic = async ( q, flt ) => {
		const text = ( q || '' ).trim();
		if ( ! text ) {
			return selectView( {
				type: 'all',
				name: __( 'All images', 'wunderpaint' ),
			} );
		}
		if ( ! searchModelInstalled() ) {
			extras.toasts.error(
				__(
					'Semantic search needs the image search model. Install it under Settings.',
					'wunderpaint'
				)
			);
			return;
		}
		const myId = ++searchSeq.current;
		try {
			const hits = await searchMediaLibrary( text, {
				limit: 120,
				minScore: 0.02,
			} );
			if ( myId !== searchSeq.current ) {
				return;
			}
			await showRanked(
				hits.map( ( h ) => h.id ),
				text,
				flt,
				myId
			);
		} catch ( e ) {
			extras.toasts.error( e.message );
		}
	};

	const openSimilar = async ( id ) => {
		if ( ! searchModelInstalled() ) {
			extras.toasts.error(
				__(
					'Similar images need the image search model. Install it under Settings.',
					'wunderpaint'
				)
			);
			return;
		}
		const myId = ++searchSeq.current;
		try {
			const ids = await findSimilar( id );
			if ( myId !== searchSeq.current ) {
				return;
			}
			if ( ! ids.length ) {
				extras.toasts.error(
					__(
						'No similar images found. Index the library first.',
						'wunderpaint'
					)
				);
				return;
			}
			await showRanked(
				ids,
				__( 'Similar images', 'wunderpaint' ),
				undefined,
				myId
			);
		} catch ( e ) {
			extras.toasts.error( e.message );
		}
	};

	const viewQuery = ( v ) => {
		if ( 'search' === v.type ) {
			return v.name;
		}
		if ( 'smart' === v.type && 'semantic' === v.kind ) {
			return v.params?.q || '';
		}
		return '';
	};

	const reloadWith = ( next ) => {
		const qtext = viewQuery( view );
		if ( qtext ) {
			runSemantic( qtext, next );
		} else {
			loadItems( view, 1, false, next );
		}
	};

	const changeFilter = ( patch ) => {
		const next = { ...filters, ...patch };
		setFilters( next );
		reloadWith( next );
	};

	const changeSort = ( key ) => {
		const s = SORTS.find( ( x ) => x.key === key ) || SORTS[ 0 ];
		setSortKey( key );
		changeFilter( { orderby: s.orderby, order: s.order } );
	};

	const selectView = ( v ) => {
		setSelected( new Set() );
		lastClicked.current = null;
		setView( v );
		if ( 'smart' === v.type && 'semantic' === v.kind ) {
			setQuery( v.params?.q || '' );
			runSemantic( v.params?.q || '' );
		} else if ( 'smart' === v.type && 'reclaim' === v.kind ) {
			// Reclaim space: biggest files first so the space hogs are on top.
			const next = { ...filters, orderby: 'filesize', order: 'DESC' };
			setFilters( next );
			setSortKey( 'heaviest' );
			loadItems( v, 1, false, next );
		} else {
			loadItems( v, 1, false );
		}
	};

	const reclaimView = 'smart' === view.type && 'reclaim' === view.kind;

	// Live search: debounce while typing (semantic runs need the model, so
	// only schedule when it is installed; Enter still works either way).
	const onSearchChange = ( v ) => {
		setQuery( v );
		if ( searchTimer.current ) {
			clearTimeout( searchTimer.current );
			searchTimer.current = null;
		}
		const t = v.trim();
		if ( ! t ) {
			selectView( {
				type: 'all',
				name: __( 'All images', 'wunderpaint' ),
			} );
			return;
		}
		if ( t.length < 2 || ! searchModelInstalled() ) {
			return;
		}
		searchTimer.current = setTimeout( () => runSemantic( t ), 450 );
	};

	// Initial load + background prep so filters work: numeric sort meta
	// (server) and dominant colors (browser canvas, no model needed).
	useEffect( () => {
		loadItems( view, 1, false );
		// Demo installs ship pre-prepared; the prep writes would only
		// bounce off the read-only guard (v1.307).
		if ( window.WPIE?.demo ) {
			return undefined;
		}
		let cancelled = false;
		( async () => {
			setPrepping( true );
			for ( let i = 0; i < 60 && ! cancelled; i++ ) {
				try {
					const r = await mediaLib.backfill( 150 );
					if ( ! r || ! r.remaining ) {
						break;
					}
				} catch ( e ) {
					break;
				}
			}
			if ( ! cancelled ) {
				try {
					await indexColors();
				} catch ( e ) {}
			}
			if ( ! cancelled ) {
				setPrepping( false );
			}
		} )();
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [] );

	const onGridScroll = ( e ) => {
		if ( semantic || loading || page >= pages ) {
			return;
		}
		const el = e.currentTarget;
		if ( el.scrollHeight - el.scrollTop - el.clientHeight < 320 ) {
			loadItems( view, page + 1, true );
		}
	};

	/* ---------------------------- selection ---------------------------- */

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

	const onTileClick = ( e, id ) => {
		if ( e.shiftKey && null !== lastClicked.current ) {
			const order = items.map( ( i ) => i.id );
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

	const selectAll = () =>
		setSelected( new Set( items.map( ( i ) => i.id ) ) );
	const clearSel = () => setSelected( new Set() );

	const applySaved = ( id, vals ) =>
		setItems( ( prev ) =>
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

	/* ------------------------------ bulk ------------------------------- */

	const ids = () => [ ...selected ];

	const afterMutation = async ( { reload = true } = {} ) => {
		await Promise.all( [ refreshFolders(), refreshTags() ] );
		if ( reload && ! semantic ) {
			await loadItems( view, 1, false );
		}
		setSelected( new Set() );
	};

	const moveToFolder = async ( folderId ) => {
		if ( ! selected.size ) {
			return;
		}
		setBusy( true );
		try {
			await mediaLib.assign( { ids: ids(), folder: folderId } );
			// Leaving the current folder view: drop moved items locally too.
			await afterMutation();
		} catch ( e ) {
			extras.toasts.error( e.message );
		}
		setBusy( false );
	};

	const applyTag = async ( tagId, remove ) => {
		if ( ! selected.size || ! tagId ) {
			return;
		}
		setBusy( true );
		try {
			await mediaLib.assign(
				remove
					? { ids: ids(), removeTags: [ tagId ] }
					: { ids: ids(), addTags: [ tagId ] }
			);
			await afterMutation( { reload: 'tag' === view.type } );
		} catch ( e ) {
			extras.toasts.error( e.message );
		}
		setBusy( false );
	};

	const deleteSelected = async () => {
		if ( ! selected.size ) {
			return;
		}
		const ok = await confirmDialog( {
			title: __( 'Move to trash', 'wunderpaint' ),
			message: sprintf(
				/* translators: 1: count, 2: retention period in days. */
				__(
					'Move %1$d image(s) to the trash? The files stay put for %2$d days and you can bring them back under "Clean up the library".',
					'wunderpaint'
				),
				selected.size,
				quarantineDays
			),
			confirmLabel: __( 'Move to trash', 'wunderpaint' ),
			danger: true,
		} );
		if ( ! ok ) {
			return;
		}
		setBusy( true );
		try {
			const res = await mediaLib.remove( ids(), false );
			const gone = new Set( res.deleted || [] );
			setItems( ( prev ) => prev.filter( ( i ) => ! gone.has( i.id ) ) );
			invalidateVectorCache();
			await Promise.all( [ refreshFolders(), refreshTags() ] );
			setSelected( new Set() );
			extras.toasts.success(
				sprintf(
					/* translators: %d: count. */
					__( 'Moved %d image(s) to the trash.', 'wunderpaint' ),
					( res.deleted || [] ).length
				)
			);
		} catch ( e ) {
			extras.toasts.error( e.message );
		}
		setBusy( false );
	};

	const setFeatured = ( att, post ) =>
		setFeaturedImage( post.id, att )
			.then( () =>
				extras.toasts.success(
					sprintf(
						/* translators: %s: post title. */
						__( 'Set as featured image of "%s".', 'wunderpaint' ),
						post.title
					)
				)
			)
			.catch( ( e ) => extras.toasts.error( e.message ) );

	const insertItems = async ( chosen ) => {
		if ( ! chosen.length ) {
			return;
		}
		setBusy( true );
		let added = 0;
		for ( const item of chosen ) {
			try {
				const img = await loadImage( item.url || item.thumb );
				const scale = Math.min(
					1,
					( state.doc.w * 0.8 ) / img.naturalWidth,
					( state.doc.h * 0.8 ) / img.naturalHeight
				);
				const w = Math.max( 1, Math.round( img.naturalWidth * scale ) );
				const h = Math.max(
					1,
					Math.round( img.naturalHeight * scale )
				);
				const layer = makeImage( {
					name: item.title || __( 'Image', 'wunderpaint' ),
					x: Math.round( ( state.doc.w - w ) / 2 ) + added * 16,
					y: Math.round( ( state.doc.h - h ) / 2 ) + added * 16,
					w,
					h,
					src: item.url || item.thumb,
					naturalW: img.naturalWidth,
					naturalH: img.naturalHeight,
				} );
				dispatch( { type: 'ADD_LAYER', layer } );
				added++;
			} catch ( e ) {
				extras.toasts.error(
					__( 'Could not load an image.', 'wunderpaint' )
				);
			}
		}
		if ( added ) {
			commit( __( 'Insert Image', 'wunderpaint' ) );
			onClose();
		}
		setBusy( false );
	};

	const insertIntoDesign = () =>
		insertItems(
			items.filter(
				( i ) =>
					selected.has( i.id ) && 'image' === ( i.kind || 'image' )
			)
		);

	const downloadSelected = () => {
		items
			.filter( ( i ) => selected.has( i.id ) )
			.forEach( ( item ) => {
				const a = document.createElement( 'a' );
				a.href = item.url || item.thumb;
				a.download = ( item.title || 'image' ).replace(
					/[^\w.-]+/g,
					'-'
				);
				document.body.appendChild( a );
				a.click();
				a.remove();
			} );
	};

	/* --------------------------- folders/tags -------------------------- */

	// Whether this user may create, rename or delete the SHARED media folders
	// and tags. The routes check the same capability (Media_Library, WPIE-010
	// and v1.404.0); hiding these buttons is not the protection, it only
	// avoids offering an action that would come back as a refusal. Filing
	// media into an existing folder is a different thing and stays open to
	// everybody who may use the editor.
	const canTerms = !! window.WPIE?.canManageTerms;

	const addFolder = async ( parent = 0 ) => {
		const name = await promptDialog( {
			title: __( 'New folder', 'wunderpaint' ),
			label: __( 'Folder name', 'wunderpaint' ),
		} );
		if ( ! name ) {
			return;
		}
		try {
			await mediaLib.folders.create( name, parent );
			refreshFolders();
		} catch ( e ) {
			extras.toasts.error( e.message );
		}
	};

	const renameFolder = async ( f ) => {
		const name = await promptDialog( {
			title: __( 'Rename folder', 'wunderpaint' ),
			label: __( 'Folder name', 'wunderpaint' ),
			defaultValue: f.name,
		} );
		if ( ! name || name === f.name ) {
			return;
		}
		try {
			await mediaLib.folders.update( f.id, { name } );
			refreshFolders();
		} catch ( e ) {
			extras.toasts.error( e.message );
		}
	};

	const deleteFolder = async ( f ) => {
		const ok = await confirmDialog( {
			title: __( 'Delete folder', 'wunderpaint' ),
			message: __(
				'Delete this folder? The images stay in your library.',
				'wunderpaint'
			),
			confirmLabel: __( 'Delete', 'wunderpaint' ),
			danger: true,
		} );
		if ( ! ok ) {
			return;
		}
		try {
			await mediaLib.folders.remove( f.id );
			if ( 'folder' === view.type && view.id === f.id ) {
				selectView( {
					type: 'all',
					name: __( 'All images', 'wunderpaint' ),
				} );
			}
			refreshFolders();
		} catch ( e ) {
			extras.toasts.error( e.message );
		}
	};

	const addTagTerm = async () => {
		const name = await promptDialog( {
			title: __( 'New tag', 'wunderpaint' ),
			label: __( 'Tag name', 'wunderpaint' ),
		} );
		if ( ! name ) {
			return;
		}
		try {
			await mediaLib.tags.create( name );
			refreshTags();
		} catch ( e ) {
			extras.toasts.error( e.message );
		}
	};

	const deleteTagTerm = async ( t ) => {
		const ok = await confirmDialog( {
			title: __( 'Delete tag', 'wunderpaint' ),
			message: __(
				'Delete this tag? The images stay in your library.',
				'wunderpaint'
			),
			confirmLabel: __( 'Delete', 'wunderpaint' ),
			danger: true,
		} );
		if ( ! ok ) {
			return;
		}
		try {
			await mediaLib.tags.remove( t.id );
			if ( 'tag' === view.type && view.id === t.id ) {
				selectView( {
					type: 'all',
					name: __( 'All images', 'wunderpaint' ),
				} );
			}
			refreshTags();
		} catch ( e ) {
			extras.toasts.error( e.message );
		}
	};

	const saveSmart = async () => {
		if ( ! semantic ) {
			return;
		}
		const name = await promptDialog( {
			title: __( 'Save smart folder', 'wunderpaint' ),
			label: __( 'Name', 'wunderpaint' ),
			defaultValue: view.name,
		} );
		if ( ! name ) {
			return;
		}
		try {
			await mediaLib.smart.create( {
				name,
				kind: 'semantic',
				params: { q: view.name },
			} );
			refreshSmart();
		} catch ( e ) {
			extras.toasts.error( e.message );
		}
	};

	const deleteSmart = async ( s ) => {
		try {
			await mediaLib.smart.remove( s.id );
			refreshSmart();
		} catch ( e ) {
			extras.toasts.error( e.message );
		}
	};

	/* ------------------------------ index ------------------------------ */

	const runIndex = async () => {
		await runIndexer();
		fetchIndexStatus()
			.then( setIndexInfo )
			.catch( () => {} );
	};

	/* ----------------------------- clusters ---------------------------- */

	const suggestClusters = async () => {
		setClusterOpen( true );
		setClusterBusy( true );
		setClusters( null );
		try {
			const groups = await clusterLibrary( { minSize: 3 } );
			setClusters( groups.map( ( g ) => ( { ...g, name: '' } ) ) );
		} catch ( e ) {
			extras.toasts.error( e.message );
		}
		setClusterBusy( false );
	};

	// Auto-organize: name each unnamed cluster from a quick caption of its
	// representative image (cloud), then let the user create them in one go.
	const autoNameClusters = async () => {
		if ( ! cloudEngine || ! clusters ) {
			return;
		}
		setClusterNaming( true );
		for ( let i = 0; i < clusters.length; i++ ) {
			const cl = clusters[ i ];
			if ( cl.name && cl.name.trim() ) {
				continue;
			}
			try {
				const dataUrl = await toDataUrl( cl.thumb );

				const res = await ai.caption( {
					image: dataUrl,
					provider: cloudEngine,
					lang: '',
				} );
				const raw = ( res.tags && res.tags[ 0 ] ) || res.title || '';
				const name = raw
					? raw.charAt( 0 ).toUpperCase() + raw.slice( 1 )
					: '';
				if ( name ) {
					setClusters( ( prev ) =>
						prev.map( ( c, idx ) =>
							idx === i ? { ...c, name } : c
						)
					);
				}
			} catch ( e ) {
				// leave this cluster unnamed
			}
		}
		setClusterNaming( false );
	};

	const createAllClusters = async () => {
		const named = ( clusters || [] ).filter(
			( c ) => c.name && c.name.trim()
		);
		if ( ! named.length ) {
			return;
		}
		for ( const cl of named ) {
			try {
				const folder = await mediaLib.folders.create(
					cl.name.trim(),
					0
				);

				await mediaLib.assign( { ids: cl.ids, folder: folder.id } );
			} catch ( e ) {
				// skip a cluster that failed
			}
		}
		setClusters( ( prev ) =>
			prev.filter( ( c ) => ! ( c.name && c.name.trim() ) )
		);
		refreshFolders();
		extras.toasts.success(
			sprintf(
				/* translators: %d: count. */
				__( 'Created %d folder(s).', 'wunderpaint' ),
				named.length
			)
		);
	};

	const createFromCluster = async ( cl, idx ) => {
		const name = ( cl.name || '' ).trim();
		if ( ! name ) {
			extras.toasts.error(
				__( 'Please name the folder first.', 'wunderpaint' )
			);
			return;
		}
		try {
			const folder = await mediaLib.folders.create( name, 0 );
			await mediaLib.assign( { ids: cl.ids, folder: folder.id } );
			setClusters( ( prev ) => prev.filter( ( _, i ) => i !== idx ) );
			refreshFolders();
			extras.toasts.success(
				sprintf(
					/* translators: 1: count, 2: folder name. */
					__( 'Created "%2$s" with %1$d images.', 'wunderpaint' ),
					cl.ids.length,
					name
				)
			);
		} catch ( e ) {
			extras.toasts.error( e.message );
		}
	};

	/* --------------------------- drag & drop --------------------------- */

	const onTileDragStart = ( id ) => {
		dragItems.current = selected.has( id ) ? [ ...selected ] : [ id ];
	};
	const onFolderDrop = async ( folderId ) => {
		setDropId( null );
		const drag = dragItems.current;
		dragItems.current = [];
		if ( ! drag.length ) {
			return;
		}
		setBusy( true );
		try {
			await mediaLib.assign( { ids: drag, folder: folderId } );
			await afterMutation();
		} catch ( e ) {
			extras.toasts.error( e.message );
		}
		setBusy( false );
	};

	/* --------------------------- AI auto-tag --------------------------- */

	/**
	 * Ensure tag terms exist for the given names, creating the missing ones.
	 * `known` is a live name->id map kept across a whole run so the same tag is
	 * never created twice, even before React state catches up.
	 */
	const ensureTags = async ( names, known ) => {
		const out = [];
		for ( const raw of names ) {
			const name = ( raw || '' ).trim();
			const key = name.toLowerCase();
			if ( ! name ) {
				continue;
			}
			if ( known.has( key ) ) {
				out.push( known.get( key ) );
				continue;
			}
			try {
				const t = await mediaLib.tags.create( name );
				known.set( key, t.id );
				out.push( t.id );
			} catch ( e ) {
				// ignore a tag we could not create
			}
		}
		return out;
	};

	const aiAutoTag = async () => {
		if ( ! cloudEngine || ! selected.size ) {
			return;
		}
		const chosen = items.filter( ( i ) => selected.has( i.id ) );
		setBusy( true );
		setTagProgress( { done: 0, total: chosen.length } );
		const known = new Map(
			tags.map( ( t ) => [ t.name.toLowerCase(), t.id ] )
		);
		let tagged = 0;
		for ( const item of chosen ) {
			try {
				const dataUrl = await toDataUrl( item.url || item.thumb );

				const res = await ai.caption( {
					image: dataUrl,
					provider: cloudEngine,
					lang: '',
				} );
				const names = [ ...( res.tags || [] ) ];
				if ( res.mood ) {
					names.push( res.mood );
				}

				const tagIds = await ensureTags( names, known );
				if ( tagIds.length ) {
					await mediaLib.assign( {
						ids: [ item.id ],
						addTags: tagIds,
					} );
				}
				const patch = {};
				if ( ! item.alt && res.altText ) {
					patch.alt = res.altText;
				}
				if ( res.caption ) {
					patch.caption = res.caption;
				}
				if ( res.description ) {
					patch.description = res.description;
				}
				if ( Object.keys( patch ).length ) {
					await updateMedia( item.id, patch );
					applySaved( item.id, patch );
				}
				tagged++;
			} catch ( e ) {
				// keep going; one failure should not stop the batch
			}
			setTagProgress( ( p ) => ( { ...p, done: ( p?.done || 0 ) + 1 } ) );
		}
		await refreshTags();
		setSelected( new Set() );
		setTagProgress( null );
		setBusy( false );
		extras.toasts.success(
			sprintf(
				/* translators: %d: count. */
				__( 'Auto-tagged %d image(s) with AI.', 'wunderpaint' ),
				tagged
			)
		);
	};

	/* ---------------------------- duplicates --------------------------- */

	const findDups = async () => {
		setDupOpen( true );
		setDupBusy( true );
		setDups( null );
		try {
			const groups = await findDuplicates();
			setDups( groups );
			// Sensible default: keep the first of each group, pre-mark the
			// rest for trashing. The user can flip any image before acting.
			const t = new Set();
			groups.forEach( ( g ) =>
				g.items.slice( 1 ).forEach( ( it ) => t.add( it.id ) )
			);
			setDupTrash( t );
		} catch ( e ) {
			extras.toasts.error( e.message );
		}
		setDupBusy( false );
	};

	const toggleDupTrash = ( id ) =>
		setDupTrash( ( prev ) => {
			const n = new Set( prev );
			if ( n.has( id ) ) {
				n.delete( id );
			} else {
				n.add( id );
			}
			return n;
		} );

	const trashDupGroup = async ( group ) => {
		const marked = group.items
			.filter( ( it ) => dupTrash.has( it.id ) )
			.map( ( it ) => it.id );
		if ( ! marked.length ) {
			return;
		}
		const ok = await confirmDialog( {
			title: __( 'Move to trash', 'wunderpaint' ),
			message: sprintf(
				/* translators: 1: count, 2: retention period in days. */
				__(
					'Move %1$d selected image(s) to the trash? The files stay put for %2$d days.',
					'wunderpaint'
				),
				marked.length,
				quarantineDays
			),
			confirmLabel: __( 'Move to trash', 'wunderpaint' ),
			danger: true,
		} );
		if ( ! ok ) {
			return;
		}
		try {
			await mediaLib.remove( marked, false );
			invalidateVectorCache();
			const gone = new Set( marked );
			setItems( ( prev ) => prev.filter( ( i ) => ! gone.has( i.id ) ) );
			setDupTrash( ( prev ) => {
				const n = new Set( prev );
				marked.forEach( ( id ) => n.delete( id ) );
				return n;
			} );
			// Drop the group (or its removed members); groups under 2 vanish.
			setDups( ( prev ) =>
				prev
					.map( ( g ) =>
						g === group
							? {
									...g,
									items: g.items.filter(
										( it ) => ! gone.has( it.id )
									),
									size: g.items.filter(
										( it ) => ! gone.has( it.id )
									).length,
							  }
							: g
					)
					.filter( ( g ) => g.items.length > 1 )
			);
		} catch ( e ) {
			extras.toasts.error( e.message );
		}
	};

	/* ------------------------------ upload ----------------------------- */

	const addFiles = ( fileList ) => {
		// Images plus PDFs (v1.332); everything else stays out.
		const files = [ ...( fileList || [] ) ].filter(
			( f ) =>
				f.type &&
				( f.type.startsWith( 'image/' ) ||
					'application/pdf' === f.type )
		);
		if ( ! files.length ) {
			return;
		}
		const entries = files.map( ( file ) => ( {
			file,
			name: file.name,
			pdf: 'application/pdf' === file.type,
			preview: URL.createObjectURL( file ),
			dup: null,
			checking: searchModelInstalled() && 'application/pdf' !== file.type,
			skip: false,
		} ) );
		setUploadOpts( ( o ) => ( {
			...o,
			folder: 'folder' === view.type ? view.id : 0,
		} ) );
		setUploadQueue( entries );
		if ( searchModelInstalled() ) {
			entries
				.filter( ( e ) => ! e.pdf )
				.forEach( async ( entry ) => {
					const dup = await checkDuplicate( entry.file );
					setUploadQueue( ( prev ) =>
						prev
							? prev.map( ( e ) =>
									e.preview === entry.preview
										? { ...e, dup, checking: false }
										: e
							  )
							: prev
					);
				} );
		}
	};

	const closeUpload = () => {
		( uploadQueue || [] ).forEach( ( e ) =>
			URL.revokeObjectURL( e.preview )
		);
		setUploadQueue( null );
	};

	const toggleSkip = ( preview ) =>
		setUploadQueue( ( prev ) =>
			prev.map( ( e ) =>
				e.preview === preview ? { ...e, skip: ! e.skip } : e
			)
		);

	const doImport = async () => {
		const q = ( uploadQueue || [] ).filter( ( e ) => ! e.skip );
		if ( ! q.length ) {
			return;
		}
		setUploading( true );
		setUploadProg( { done: 0, total: q.length } );
		let ok = 0;
		for ( const entry of q ) {
			try {
				await importOne( entry.file, {
					folder: uploadOpts.folder,
					optimize: uploadOpts.optimize,
					describe: uploadOpts.describe,
					engine: describeEngine,
					lang: '',
				} );
				ok++;
			} catch ( e ) {
				extras.toasts.error( e.message );
			}
			setUploadProg( ( p ) => ( { ...p, done: ( p?.done || 0 ) + 1 } ) );
		}
		( uploadQueue || [] ).forEach( ( e ) =>
			URL.revokeObjectURL( e.preview )
		);
		invalidateVectorCache();
		await Promise.all( [ refreshFolders(), refreshTags() ] );
		// Imported PDFs would be invisible behind the default Images
		// filter - widen it so the user sees what just arrived.
		if ( q.some( ( e ) => e.pdf ) && 'images' === filters.type ) {
			changeFilter( { type: 'all' } );
		} else {
			await loadItems( view, 1, false );
		}
		setUploadQueue( null );
		setUploadProg( null );
		setUploading( false );
		extras.toasts.success(
			sprintf(
				/* translators: %d: count */ __(
					'Imported %d file(s).',
					'wunderpaint'
				),
				ok
			)
		);
	};

	/* --------------------------- library tools ------------------------- */

	const renameCtxFor = ( item ) => ( {
		siteName: WPIE.siteName || '',
		siteUrl: WPIE.siteUrl || '',
		siteTagline: WPIE.siteTagline || '',
		brand: kit || undefined,
		image: {
			width: item?.width,
			height: item?.height,
			filename: item?.filename,
			mime: item?.mime,
		},
	} );

	const renameTitle = ( pattern, item, index ) => {
		const pad = ( pattern.match( /#+/ ) || [ '' ] )[ 0 ].length;
		let t = expandTokens( pattern, renameCtxFor( item ) );
		if ( pad ) {
			t = t.replace( /#+/, String( index ).padStart( pad, '0' ) );
		}
		return t.trim();
	};

	// Hand the selection over to Batch Watermark (v1.241): the manager
	// items already match the watermark dialog's target shape.
	const addWatermarks = () => {
		if ( ! selected.size ) {
			extras.toasts.error(
				__( 'Select images first, then run this tool.', 'wunderpaint' )
			);
			return;
		}
		extras.openBatchWatermark(
			items.filter(
				( i ) =>
					selected.has( i.id ) &&
					( ! i.mime || 0 === i.mime.indexOf( 'image/' ) )
			)
		);
	};

	// Does a mime fit the pick scope? `types` is 'image'|'video'|'audio'|
	// 'all' or an array mixing prefixes and exact mimes (v1.333):
	// ['image','application/pdf'] takes every image plus PDFs.
	const typeTakes = ( types, mime ) => {
		const list = Array.isArray( types ) ? types : [ types || 'image' ];
		if ( list.includes( 'all' ) ) {
			return true;
		}
		// Rows without a mime are legacy image rows.
		const m = mime || 'image/unknown';
		return list.some( ( w ) =>
			-1 === w.indexOf( '/' ) ? 0 === m.indexOf( w + '/' ) : m === w
		);
	};

	// Does this item fit the pick scope? (An image pick never leaks
	// other types; 'all' takes every file.)
	const pickAccepts = ( item ) =>
		typeTakes( ( pick && pick.types ) || 'image', item.mime );

	// Single picks confirm on the FIRST click (v1.245.2): choosing one
	// image is the common case, a second "Use image" click was friction.
	// Galleries and other multi hosts keep the select-then-confirm flow.
	const pickSingle = ( item ) => {
		if ( ! pickAccepts( item ) ) {
			return;
		}
		setSelected( new Set( [ item.id ] ) );
		pick.onConfirm( [ item ] );
	};

	// Pick mode (v1.241): resolve the shared picker with the selection in
	// click order. An image pick never leaks other types; an unrestricted
	// host ("Add Media", pick.types 'all') takes every file (v1.243).
	const confirmPick = () => {
		if ( ! pick || ! selected.size ) {
			return;
		}
		const want = pick.types || 'image';
		const byId = new Map( items.map( ( i ) => [ i.id, i ] ) );
		const chosen = [ ...selected ]
			.map( ( id ) => byId.get( id ) )
			.filter( ( i ) => i && typeTakes( want, i.mime ) );
		if ( ! chosen.length ) {
			return;
		}
		pick.onConfirm(
			pick.multiple ? chosen : [ chosen[ chosen.length - 1 ] ]
		);
	};

	const runRegenThumbs = async () => {
		if ( ! selected.size ) {
			extras.toasts.error(
				__( 'Select images first, then run this tool.', 'wunderpaint' )
			);
			return;
		}
		setBusy( true );
		try {
			const r = await mediaLib.regenerate( [ ...selected ] );
			await loadItems( view, 1, false );
			extras.toasts.success(
				sprintf(
					/* translators: %d: count */ __(
						'Regenerated thumbnails for %d image(s).',
						'wunderpaint'
					),
					r.done || 0
				)
			);
		} catch ( e ) {
			extras.toasts.error( e.message );
		}
		setBusy( false );
	};

	const findBroken = async () => {
		setBusy( true );
		try {
			const r = await mediaLib.broken();
			if ( ! ( r.ids || [] ).length ) {
				extras.toasts.success(
					__( 'No broken files found.', 'wunderpaint' )
				);
			} else {
				await showRanked( r.ids, __( 'Broken files', 'wunderpaint' ) );
			}
		} catch ( e ) {
			extras.toasts.error( e.message );
		}
		setBusy( false );
	};

	const openRename = () => {
		if ( ! selected.size ) {
			extras.toasts.error(
				__( 'Select images first, then run this tool.', 'wunderpaint' )
			);
			return;
		}
		setRenameOpen( true );
	};

	const doRename = async () => {
		const chosenIds = [ ...selected ];
		const pat = renamePattern.trim();
		if ( ! pat ) {
			return;
		}
		setBusy( true );
		let n = 0;
		let done = 0;
		for ( const id of chosenIds ) {
			n++;
			try {
				const item = items.find( ( i ) => i.id === id ) || {};
				const title = renameTitle( pat, item, n );
				if ( title ) {
					await updateMedia( id, { title } );
					applySaved( id, { title } );
					done++;
				}
			} catch ( e ) {}
		}
		setBusy( false );
		setRenameOpen( false );
		extras.toasts.success(
			sprintf(
				/* translators: %d: count */ __(
					'Renamed %d image(s).',
					'wunderpaint'
				),
				done
			)
		);
		loadItems( view, 1, false );
	};

	/* ------------------------------ render ----------------------------- */

	const childrenOf = ( parent ) =>
		folders.filter( ( f ) => ( f.parent || 0 ) === parent );

	const renderFolderRows = ( parent, depth ) =>
		childrenOf( parent ).map( ( f ) => (
			<div key={ f.id }>
				<div
					className={
						'wpie-mlm-row' +
						( 'folder' === view.type && view.id === f.id
							? ' active'
							: '' ) +
						( dropId === f.id ? ' drop' : '' )
					}
					style={ { paddingLeft: 8 + depth * 14 } }
					onClick={ () =>
						selectView( { type: 'folder', id: f.id, name: f.name } )
					}
					onDragOver={ ( e ) => {
						e.preventDefault();
						setDropId( f.id );
					} }
					onDragLeave={ ( e ) => {
						// Child elements fire dragleave too; only a real
						// exit clears the highlight (v1.364.0).
						if (
							e.relatedTarget &&
							e.currentTarget.contains( e.relatedTarget )
						) {
							return;
						}
						setDropId( ( d ) => ( d === f.id ? null : d ) );
					} }
					onDrop={ () => onFolderDrop( f.id ) }
					role="button"
					tabIndex={ 0 }
					onKeyDown={ ( e ) =>
						'Enter' === e.key &&
						selectView( { type: 'folder', id: f.id, name: f.name } )
					}
				>
					<span className="ico">{ I.folder( { size: 15 } ) }</span>
					<span className="nm">{ f.name }</span>
					<span className="ct">{ f.count }</span>
					{ canTerms && (
						<span className="acts">
							<button
								title={ __( 'New subfolder', 'wunderpaint' ) }
								onClick={ ( e ) => {
									e.stopPropagation();
									addFolder( f.id );
								} }
							>
								{ I.plus( { size: 12 } ) }
							</button>
							<button
								title={ __( 'Rename', 'wunderpaint' ) }
								onClick={ ( e ) => {
									e.stopPropagation();
									renameFolder( f );
								} }
							>
								{ I.pencil( { size: 12 } ) }
							</button>
							<button
								title={ __( 'Delete', 'wunderpaint' ) }
								onClick={ ( e ) => {
									e.stopPropagation();
									deleteFolder( f );
								} }
							>
								{ I.trash( { size: 12 } ) }
							</button>
						</span>
					) }
				</div>
				{ renderFolderRows( f.id, depth + 1 ) }
			</div>
		) );

	const savedSmart = smart || [];
	const tagMax = tags.reduce( ( m, t ) => Math.max( m, t.count || 0 ), 1 );
	const shownTags = tagsAll ? tags : tags.slice( 0, TAG_PREVIEW );
	const tagsHidden = tags.length - shownTags.length;

	return (
		<div
			className="modal-backdrop"
			onClick={ busy ? undefined : onClose }
			role="presentation"
		>
			<div
				className="wpie-mlm-dialog"
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-label={ __( 'Media Library Manager', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<span className="dsm-title">
							{ __( 'Media Library Manager', 'wunderpaint' ) }
						</span>
						<HelpLink article="media-library" extras={ extras } />
						<div className="dsm-sub">
							{ __(
								'Organize your media with folders, tags and search.',
								'wunderpaint'
							) }
						</div>
					</div>
					<div className="wpie-mlm-searchwrap">
						<span className="ico">
							{ I.search( { size: 15 } ) }
						</span>
						<input
							className="wpie-mlm-search"
							placeholder={ __(
								'Search images by what they show',
								'wunderpaint'
							) }
							value={ query }
							onChange={ ( e ) =>
								onSearchChange( e.target.value )
							}
							onKeyDown={ ( e ) => {
								if ( 'Enter' === e.key ) {
									if ( searchTimer.current ) {
										clearTimeout( searchTimer.current );
									}
									runSemantic( query );
								}
							} }
						/>
						{ query && (
							<button
								className="clr"
								onClick={ () => {
									setQuery( '' );
									selectView( {
										type: 'all',
										name: __( 'All images', 'wunderpaint' ),
									} );
								} }
								aria-label={ __( 'Clear', 'wunderpaint' ) }
							>
								{ I.close( { size: 13 } ) }
							</button>
						) }
					</div>
					<button
						className="dsm-close"
						onClick={ onClose }
						aria-label={ __( 'Close', 'wunderpaint' ) }
						disabled={ busy }
					>
						{ I.close( { size: 17 } ) }
					</button>
				</div>

				{ /* Demo mode: the manager stays fully browsable, only the
				   write actions answer with the read-only note (v1.307).
				   The standalone studio (v1.309) is NOT read-only - its
				   library lives in the visitor's browser and says so. */ }
				{ window.WPIE?.demo && (
					<div className="wpie-mlm-demo-note">
						{ window.WPIE?.standalone
							? __(
									'Your local library: images you add here stay in this browser only - nothing is uploaded anywhere.',
									'wunderpaint'
							  )
							: __(
									'Demo library: browse, search and explore freely - changes (upload, move, rename, delete) are switched off here.',
									'wunderpaint'
							  ) }
					</div>
				) }

				<div className="wpie-mlm-body">
					{ /* -------- left rail -------- */ }
					<aside className="wpie-mlm-side">
						<div className="wpie-mlm-sec">
							<div
								className={
									'wpie-mlm-row' +
									( 'all' === view.type ? ' active' : '' ) +
									( dropId === 0 ? ' drop' : '' )
								}
								onClick={ () =>
									selectView( {
										type: 'all',
										name: __( 'All images', 'wunderpaint' ),
									} )
								}
								onDragOver={ ( e ) => {
									e.preventDefault();
									setDropId( 0 );
								} }
								onDragLeave={ ( e ) => {
									// Only a real exit clears (v1.364.0).
									if (
										e.relatedTarget &&
										e.currentTarget.contains(
											e.relatedTarget
										)
									) {
										return;
									}
									setDropId( ( d ) =>
										0 === d ? null : d
									);
								} }
								onDrop={ () => onFolderDrop( 0 ) }
								role="button"
								tabIndex={ 0 }
								onKeyDown={ ( e ) =>
									'Enter' === e.key &&
									selectView( {
										type: 'all',
										name: __( 'All images', 'wunderpaint' ),
									} )
								}
								title={ __(
									'Drop here to remove from folders',
									'wunderpaint'
								) }
							>
								<span className="ico">
									{ I.grid( { size: 15 } ) }
								</span>
								<span className="nm">
									{ __( 'All images', 'wunderpaint' ) }
								</span>
							</div>
						</div>

						<div className="wpie-mlm-sec">
							<div className="wpie-mlm-sechead">
								<span>{ __( 'Folders', 'wunderpaint' ) }</span>
								{ canTerms && (
									<button
										title={ __(
											'New folder',
											'wunderpaint'
										) }
										onClick={ () => addFolder( 0 ) }
									>
										{ I.plus( { size: 14 } ) }
									</button>
								) }
							</div>
							{ folders.length ? (
								renderFolderRows( 0, 0 )
							) : (
								<div className="wpie-mlm-empty">
									{ __( 'No folders yet.', 'wunderpaint' ) }
								</div>
							) }
						</div>

						<div className="wpie-mlm-sec">
							<div className="wpie-mlm-sechead">
								<span className="wpie-mlm-sectitle">
									{ __( 'Tags', 'wunderpaint' ) }
								</span>
								<span className="acts">
									<button
										title={
											tagCloud
												? __(
														'List view',
														'wunderpaint'
												  )
												: __(
														'Cloud view',
														'wunderpaint'
												  )
										}
										onClick={ () =>
											setTagCloud( ( v ) => ! v )
										}
									>
										{ tagCloud
											? I.list( { size: 14 } )
											: I.grid( { size: 13 } ) }
									</button>
									{ canTerms && (
										<button
											title={ __(
												'New tag',
												'wunderpaint'
											) }
											onClick={ addTagTerm }
										>
											{ I.plus( { size: 14 } ) }
										</button>
									) }
								</span>
							</div>
							{ tagCloud ? (
								<div className="wpie-mlm-tagcloud">
									{ shownTags.map( ( t ) => (
										<button
											key={ t.id }
											className={
												'cl' +
												( 'tag' === view.type &&
												view.id === t.id
													? ' active'
													: '' )
											}
											style={ {
												fontSize:
													11 +
													Math.round(
														8 *
															( ( t.count || 0 ) /
																tagMax )
													),
											} }
											title={ sprintf(
												/* translators: %d: count */ __(
													'%d images',
													'wunderpaint'
												),
												t.count || 0
											) }
											onClick={ () =>
												selectView( {
													type: 'tag',
													id: t.id,
													name: t.name,
												} )
											}
										>
											{ t.name }
										</button>
									) ) }
									{ ! tags.length && (
										<div className="wpie-mlm-empty">
											{ __(
												'No tags yet.',
												'wunderpaint'
											) }
										</div>
									) }
								</div>
							) : (
								<div className="wpie-mlm-tags">
									{ shownTags.map( ( t ) => (
										<span
											key={ t.id }
											className={
												'wpie-mlm-chip' +
												( 'tag' === view.type &&
												view.id === t.id
													? ' active'
													: '' )
											}
										>
											<button
												className="lbl"
												onClick={ () =>
													selectView( {
														type: 'tag',
														id: t.id,
														name: t.name,
													} )
												}
											>
												<span className="nm">
													{ t.name }
												</span>
												<b>{ t.count }</b>
											</button>
											{ canTerms && (
												<button
													className="x"
													title={ __(
														'Delete tag',
														'wunderpaint'
													) }
													onClick={ () =>
														deleteTagTerm( t )
													}
												>
													{ I.close( { size: 11 } ) }
												</button>
											) }
										</span>
									) ) }
									{ ! tags.length && (
										<div className="wpie-mlm-empty">
											{ __(
												'No tags yet.',
												'wunderpaint'
											) }
										</div>
									) }
								</div>
							) }
							{ ( tagsHidden > 0 || tagsAll ) &&
								tags.length > TAG_PREVIEW && (
									<button
										className="wpie-mlm-tagmore"
										onClick={ () =>
											setTagsAll( ( v ) => ! v )
										}
									>
										<span className="chev">
											{ tagsAll ? '▴' : '▾' }
										</span>
										{ tagsAll
											? __(
													'Show fewer tags',
													'wunderpaint'
											  )
											: sprintf(
													/* translators: %d: count */ __(
														'Show all %d tags',
														'wunderpaint'
													),
													tags.length
											  ) }
									</button>
								) }
						</div>

						<div className="wpie-mlm-sec">
							<div className="wpie-mlm-sechead">
								<span>
									{ __( 'Smart folders', 'wunderpaint' ) }
								</span>
							</div>
							{ BUILTIN_SMART.map( ( s ) => (
								<div
									key={ s.id }
									className={
										'wpie-mlm-row' +
										( 'smart' === view.type &&
										view.id === s.id
											? ' active'
											: '' )
									}
									onClick={ () =>
										selectView( {
											type: 'smart',
											id: s.id,
											name: s.name,
											kind: s.kind,
											params: s.params,
										} )
									}
									role="button"
									tabIndex={ 0 }
									onKeyDown={ ( e ) =>
										'Enter' === e.key &&
										selectView( {
											type: 'smart',
											id: s.id,
											name: s.name,
											kind: s.kind,
											params: s.params,
										} )
									}
								>
									<span className="ico">
										{ ( I[ s.icon ] || I.sparkles )( {
											size: 15,
										} ) }
									</span>
									<span className="nm">{ s.name }</span>
								</div>
							) ) }
							{ savedSmart.map( ( s ) => (
								<div
									key={ s.id }
									className={
										'wpie-mlm-row' +
										( 'smart' === view.type &&
										view.id === s.id
											? ' active'
											: '' )
									}
									onClick={ () =>
										selectView( {
											type: 'smart',
											id: s.id,
											name: s.name,
											kind: s.kind,
											params: s.params,
										} )
									}
									role="button"
									tabIndex={ 0 }
									onKeyDown={ ( e ) =>
										'Enter' === e.key &&
										selectView( {
											type: 'smart',
											id: s.id,
											name: s.name,
											kind: s.kind,
											params: s.params,
										} )
									}
								>
									<span className="ico">
										{ 'semantic' === s.kind
											? I.search( { size: 13 } )
											: I.sparkles( { size: 14 } ) }
									</span>
									<span className="nm">{ s.name }</span>
									<span className="acts">
										<button
											title={ __(
												'Delete',
												'wunderpaint'
											) }
											onClick={ ( e ) => {
												e.stopPropagation();
												deleteSmart( s );
											} }
										>
											{ I.trash( { size: 12 } ) }
										</button>
									</span>
								</div>
							) ) }
						</div>

						<div className="wpie-mlm-side-foot">
							{ indexInfo &&
								indexInfo.pending > 0 &&
								! window.WPIE?.demo && (
									<div className="wpie-mlm-index">
										{ indexInfo.running ? (
											<span>
												{ sprintf(
													/* translators: 1: done 2: total */ __(
														'Indexing %1$d / %2$d',
														'wunderpaint'
													),
													indexInfo.done || 0,
													indexInfo.pending
												) }{ ' ' }
												<span className="spin" />
											</span>
										) : (
											<>
												<span>
													{ sprintf(
														/* translators: %d: count */ __(
															'%d images not searchable yet',
															'wunderpaint'
														),
														indexInfo.pending
													) }
												</span>
												<button onClick={ runIndex }>
													{ __(
														'Index now',
														'wunderpaint'
													) }
												</button>
											</>
										) }
									</div>
								) }
						</div>
					</aside>

					{ /* -------- main -------- */ }
					<main
						className="wpie-mlm-main"
						onDragOver={ ( e ) => {
							if ( e.dataTransfer?.types?.includes( 'Files' ) ) {
								e.preventDefault();
							}
						} }
						onDrop={ ( e ) => {
							if ( e.dataTransfer?.files?.length ) {
								e.preventDefault();
								addFiles( e.dataTransfer.files );
							}
						} }
					>
						<div className="wpie-mlm-tools">
							<span className="wpie-mlm-viewname">
								{ view.name }
							</span>
							<span className="wpie-mlm-count">
								{ semantic
									? sprintf(
											/* translators: %d: count */ __(
												'%d results',
												'wunderpaint'
											),
											items.length
									  )
									: sprintf(
											/* translators: %d: count */ __(
												'%d images',
												'wunderpaint'
											),
											total
									  ) }
							</span>
							{ reclaimView && (
								<span className="wpie-mlm-count">
									{ sprintf(
										/* translators: %s: size */ __(
											'%s shown',
											'wunderpaint'
										),
										fmtSize(
											items.reduce(
												( s, i ) =>
													s + ( i.filesize || 0 ),
												0
											)
										)
									) }
								</span>
							) }
							{ semantic && (
								<button
									className="ai-btn secondary sm"
									onClick={ saveSmart }
								>
									{ __(
										'Save as smart folder',
										'wunderpaint'
									) }
								</button>
							) }
							{ '_missingAlt' === view.id && ! pick && (
								<button
									className="ai-btn secondary sm"
									onClick={ () =>
										extras.openAltText( 'noalt' )
									}
								>
									{ __(
										'Fill with Metadata Assistant',
										'wunderpaint'
									) }
								</button>
							) }
							<span className="wpie-mlm-spacer" />
							{ ( ! window.WPIE?.demo ||
								window.WPIE?.standalone ) && (
								<label
									className="ai-btn primary sm"
									style={ { cursor: 'pointer' } }
								>
									{ __( 'Upload', 'wunderpaint' ) }
									<input
										type="file"
										accept="image/*,application/pdf"
										multiple
										style={ { display: 'none' } }
										onChange={ ( e ) => {
											addFiles( e.target.files );
											e.target.value = '';
										} }
									/>
								</label>
							) }
							<button
								className="ai-btn secondary sm"
								onClick={ selectAll }
								disabled={ ! items.length }
							>
								{ __( 'Select all', 'wunderpaint' ) }
							</button>
							<button
								className="ai-btn secondary sm"
								onClick={ clearSel }
								disabled={ ! selected.size }
							>
								{ __( 'Clear', 'wunderpaint' ) }
							</button>
							{ pick && (
								<>
									<button
										className="ai-btn secondary sm"
										onClick={ pick.onClassic }
									>
										{ __(
											'WordPress Media Library',
											'wunderpaint'
										) }
									</button>
									{ pick.multiple && (
										<button
											className="ai-btn primary sm"
											onClick={ confirmPick }
											disabled={ ! selected.size }
										>
											{ sprintf(
												/* translators: %d: selected count */ __(
													'Use selection (%d)',
													'wunderpaint'
												),
												selected.size
											) }
										</button>
									) }
								</>
							) }
						</div>

						<div className="wpie-mlm-filters">
							<span className="wpie-mlm-viewtoggle">
								<button
									type="button"
									className={
										'grid' === viewMode ? 'on' : ''
									}
									onClick={ () => switchViewMode( 'grid' ) }
									title={ __( 'Grid view', 'wunderpaint' ) }
									aria-label={ __(
										'Grid view',
										'wunderpaint'
									) }
								>
									{ I.grid( { size: 13 } ) }
								</button>
								<button
									type="button"
									className={
										'list' === viewMode ? 'on' : ''
									}
									onClick={ () => switchViewMode( 'list' ) }
									title={ __( 'List view', 'wunderpaint' ) }
									aria-label={ __(
										'List view',
										'wunderpaint'
									) }
								>
									{ I.list( { size: 13 } ) }
								</button>
							</span>
							<span className="wpie-mlm-spacer" />
							<div className="wpie-mlm-swatches">
								{ COLOR_BUCKETS.map( ( c ) => (
									<button
										key={ c }
										type="button"
										className={
											'sw' +
											( filters.color === c
												? ' active'
												: '' )
										}
										style={ {
											background: COLOR_SWATCH[ c ],
										} }
										title={ c }
										aria-label={ c }
										onClick={ () =>
											changeFilter( {
												color:
													filters.color === c
														? ''
														: c,
											} )
										}
									/>
								) ) }
							</div>
							{ ( filters.color ||
								filters.mime ||
								filters.orient ||
								filters.size ||
								filters.author ||
								filters.month ||
								'images' !== filters.type ||
								sortKey ) && (
								<button
									className="ai-btn secondary sm"
									onClick={ () => {
										setSortKey( '' );
										const next = {
											orderby: '',
											order: 'DESC',
											type: 'images',
											mime: '',
											orient: '',
											size: '',
											color: '',
											author: 0,
											month: '',
										};
										setFilters( next );
										reloadWith( next );
									} }
								>
									{ __( 'Reset', 'wunderpaint' ) }
								</button>
							) }
						</div>

						<div className="wpie-mlm-filterrow">
							<select
								className="dsm-select sm"
								value={ sortKey }
								onChange={ ( e ) =>
									changeSort( e.target.value )
								}
								title={ __( 'Sort', 'wunderpaint' ) }
							>
								{ SORTS.map( ( s ) => (
									<option
										key={ s.key || 'newest' }
										value={ s.key }
									>
										{ s.label }
									</option>
								) ) }
							</select>
							<select
								className="dsm-select sm"
								value={ filters.type }
								onChange={ ( e ) =>
									changeFilter( {
										type: e.target.value,
										mime: '',
									} )
								}
								title={ __( 'Media type', 'wunderpaint' ) }
							>
								<option value="images">
									{ __( 'Images', 'wunderpaint' ) }
								</option>
								<option value="videos">
									{ __( 'Videos', 'wunderpaint' ) }
								</option>
								<option value="audio">
									{ __( 'Audio', 'wunderpaint' ) }
								</option>
								<option value="docs">
									{ __( 'Documents', 'wunderpaint' ) }
								</option>
								<option value="all">
									{ __( 'All media', 'wunderpaint' ) }
								</option>
							</select>
							<select
								className="dsm-select sm"
								value={ filters.mime }
								onChange={ ( e ) =>
									changeFilter( { mime: e.target.value } )
								}
								title={ __( 'File type', 'wunderpaint' ) }
							>
								<option value="">
									{ __( 'Any file type', 'wunderpaint' ) }
								</option>
								<option value="image/jpeg">JPEG</option>
								<option value="image/png">PNG</option>
								<option value="image/webp">WebP</option>
								<option value="image/gif">GIF</option>
								<option value="image/svg+xml">SVG</option>
								<option value="application/pdf">PDF</option>
							</select>
							<select
								className="dsm-select sm"
								value={ filters.orient }
								onChange={ ( e ) =>
									changeFilter( { orient: e.target.value } )
								}
								title={ __( 'Orientation', 'wunderpaint' ) }
							>
								<option value="">
									{ __( 'Any shape', 'wunderpaint' ) }
								</option>
								<option value="l">
									{ __( 'Landscape', 'wunderpaint' ) }
								</option>
								<option value="p">
									{ __( 'Portrait', 'wunderpaint' ) }
								</option>
								<option value="s">
									{ __( 'Square', 'wunderpaint' ) }
								</option>
							</select>
							<select
								className="dsm-select sm"
								value={ filters.size }
								onChange={ ( e ) =>
									changeFilter( { size: e.target.value } )
								}
								title={ __( 'Size', 'wunderpaint' ) }
							>
								<option value="">
									{ __( 'Any size', 'wunderpaint' ) }
								</option>
								<option value="small">
									{ __( 'Small', 'wunderpaint' ) }
								</option>
								<option value="medium">
									{ __( 'Medium', 'wunderpaint' ) }
								</option>
								<option value="large">
									{ __( 'Large', 'wunderpaint' ) }
								</option>
								<option value="huge">
									{ __( 'Huge', 'wunderpaint' ) }
								</option>
							</select>
							<select
								className="dsm-select sm"
								value={ filters.author }
								onChange={ ( e ) =>
									changeFilter( {
										author: Number( e.target.value ) || 0,
									} )
								}
								title={ __( 'Author', 'wunderpaint' ) }
							>
								<option value={ 0 }>
									{ __( 'Any author', 'wunderpaint' ) }
								</option>
								{ facets.authors.map( ( a ) => (
									<option key={ a.id } value={ a.id }>
										{ a.name }
									</option>
								) ) }
							</select>
							<select
								className="dsm-select sm"
								value={ filters.month }
								onChange={ ( e ) =>
									changeFilter( { month: e.target.value } )
								}
								title={ __( 'Upload month', 'wunderpaint' ) }
							>
								<option value="">
									{ __( 'Any date', 'wunderpaint' ) }
								</option>
								{ facets.months.map( ( m ) => (
									<option key={ m } value={ m }>
										{ m }
									</option>
								) ) }
							</select>
						</div>

						<div
							className={
								'grid' === viewMode
									? 'wpie-mlm-grid'
									: 'wpie-mlm-grid wpie-mlm-listwrap'
							}
							onScroll={ onGridScroll }
						>
							{ 'list' === viewMode && items.length > 0 && (
								<div className="wpie-mlm-listhead">
									<span />
									<span>
										{ __( 'Title', 'wunderpaint' ) }
									</span>
									<span>{ __( 'Type', 'wunderpaint' ) }</span>
									<span>
										{ __( 'Dimensions', 'wunderpaint' ) }
									</span>
									<span>{ __( 'Size', 'wunderpaint' ) }</span>
									<span>{ __( 'Date', 'wunderpaint' ) }</span>
									<span>
										{ __( 'Author', 'wunderpaint' ) }
									</span>
									<span />
								</div>
							) }
							{ items.map( ( item ) => {
								const on = selected.has( item.id );
								const kind = item.kind || 'image';
								if ( 'list' === viewMode ) {
									return (
										<div
											key={ item.id }
											className={
												'wpie-mlm-lrow' +
												( on ? ' sel' : '' )
											}
											role="button"
											tabIndex={ 0 }
											draggable
											onDragStart={ () =>
												onTileDragStart( item.id )
											}
											onClick={ ( e ) =>
												pick && ! pick.multiple
													? pickSingle( item )
													: onTileClick( e, item.id )
											}
											onDoubleClick={ () =>
												openPreview( item.id )
											}
											onKeyDown={ ( e ) =>
												( 'Enter' === e.key ||
													' ' === e.key ) &&
												( pick && ! pick.multiple
													? pickSingle( item )
													: onTileClick(
															e,
															item.id
													  ) )
											}
										>
											<span className="rthumb">
												{ 'video' === kind &&
												! item.thumb ? (
													<video
														src={ item.url }
														preload="metadata"
														muted
														playsInline
													/>
												) : item.thumb ||
												  'image' === kind ? (
													<img
														src={
															item.thumb ||
															item.url
														}
														alt=""
														loading="lazy"
													/>
												) : (
													<img
														className="ricon"
														src={ item.icon }
														alt=""
														loading="lazy"
													/>
												) }
											</span>
											<span className="rtitle">
												<b>
													{ item.title ||
														item.filename ||
														__(
															'(no title)',
															'wunderpaint'
														) }
												</b>
												<small>
													{ item.filename || '' }
												</small>
											</span>
											<span className="rcol">
												{ ( item.mime || '' )
													.split( '/' )
													.pop()
													.toUpperCase()
													.slice( 0, 8 ) }
											</span>
											<span className="rcol">
												{ item.width && item.height
													? `${ item.width } × ${ item.height }`
													: '' }
											</span>
											<span className="rcol">
												{ item.filesize
													? fmtSize( item.filesize )
													: '' }
											</span>
											<span className="rcol">
												{ item.date || '' }
											</span>
											<span className="rcol">
												{ item.author || '' }
											</span>
											<span
												className="racts"
												onClick={ ( e ) =>
													e.stopPropagation()
												}
												onKeyDown={ ( e ) =>
													e.stopPropagation()
												}
												role="presentation"
											>
												<button
													type="button"
													title={ __(
														'Preview',
														'wunderpaint'
													) }
													onClick={ () =>
														openPreview( item.id )
													}
												>
													{ I.eye( { size: 13 } ) }
												</button>
												{ ( 'video' === kind ||
													'audio' === kind ) && (
													<button
														type="button"
														title={
															playingId ===
															item.id
																? __(
																		'Stop',
																		'wunderpaint'
																  )
																: __(
																		'Play',
																		'wunderpaint'
																  )
														}
														onClick={ ( e ) =>
															togglePlay(
																item,
																e.currentTarget
																	.closest(
																		'.wpie-mlm-lrow'
																	)
																	?.querySelector(
																		'video'
																	)
															)
														}
													>
														{ playingId === item.id
															? I.stopIcon( {
																	size: 12,
															  } )
															: I.chevRight( {
																	size: 13,
															  } ) }
													</button>
												) }
												<button
													type="button"
													title={ __(
														'Copy file URL',
														'wunderpaint'
													) }
													onClick={ () =>
														copyUrl( item )
													}
												>
													{ I.link( { size: 12 } ) }
												</button>
												<button
													type="button"
													title={ __(
														'Edit metadata',
														'wunderpaint'
													) }
													onClick={ () =>
														setEditId( item.id )
													}
												>
													{ I.pencil( { size: 12 } ) }
												</button>
											</span>
										</div>
									);
								}
								return (
									<div
										key={ item.id }
										className={
											'wpie-mlm-tile' +
											( on ? ' sel' : '' )
										}
										role="button"
										tabIndex={ 0 }
										draggable
										onDragStart={ () =>
											onTileDragStart( item.id )
										}
										onClick={ ( e ) =>
											pick && ! pick.multiple
												? pickSingle( item )
												: onTileClick( e, item.id )
										}
										onDoubleClick={ () =>
											openPreview( item.id )
										}
										onKeyDown={ ( e ) =>
											( 'Enter' === e.key ||
												' ' === e.key ) &&
											( pick && ! pick.multiple
												? pickSingle( item )
												: onTileClick( e, item.id ) )
										}
									>
										{ 'video' === kind && ! item.thumb ? (
											<video
												src={ item.url }
												preload="metadata"
												muted
												playsInline
											/>
										) : item.thumb || 'image' === kind ? (
											<img
												src={ item.thumb || item.url }
												alt=""
												loading="lazy"
											/>
										) : (
											<span className="wpie-mlm-filetile">
												{ item.icon ? (
													<img
														src={ item.icon }
														alt=""
														loading="lazy"
													/>
												) : null }
												<b>
													{ ( item.mime || '' )
														.split( '/' )
														.pop()
														.toUpperCase()
														.slice( 0, 8 ) }
												</b>
											</span>
										) }
										{ ( 'video' === kind ||
											'audio' === kind ) && (
											<button
												type="button"
												className="wpie-mlm-playbtn"
												title={
													playingId === item.id
														? __(
																'Stop',
																'wunderpaint'
														  )
														: __(
																'Play',
																'wunderpaint'
														  )
												}
												onClick={ ( e ) => {
													e.stopPropagation();
													togglePlay(
														item,
														e.currentTarget.parentElement.querySelector(
															'video'
														)
													);
												} }
											>
												{ playingId === item.id
													? I.stopIcon( { size: 12 } )
													: I.chevRight( {
															size: 13,
													  } ) }
											</button>
										) }
										<span className="tick">
											{ on
												? I.check( { size: 12 } )
												: '' }
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
											{ I.pencil( { size: 12 } ) }
										</button>
										<button
											className="copy"
											title={ __(
												'Copy file URL',
												'wunderpaint'
											) }
											onClick={ ( e ) => {
												e.stopPropagation();
												copyUrl( item );
											} }
										>
											{ I.link( { size: 12 } ) }
										</button>
										<button
											className="view"
											title={ __(
												'Preview',
												'wunderpaint'
											) }
											onClick={ ( e ) => {
												e.stopPropagation();
												openPreview( item.id );
											} }
										>
											{ I.eye( { size: 12 } ) }
										</button>
										{ ! item.alt &&
											'image' ===
												( item.kind || 'image' ) &&
											! semantic &&
											! reclaimView && (
												<span className="badge">
													{ __(
														'no alt',
														'wunderpaint'
													) }
												</span>
											) }
										{ reclaimView && item.filesize > 0 && (
											<span className="badge size">
												{ fmtSize( item.filesize ) }
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
												{ 'image' ===
												( item.kind || 'image' )
													? item.alt ||
													  __(
															'(no alt text)',
															'wunderpaint'
													  )
													: item.filename ||
													  item.mime }
											</span>
										</span>
									</div>
								);
							} ) }
							{ ! items.length && ! loading && (
								<div className="wpie-mlm-noitems">
									{ __( 'No files here.', 'wunderpaint' ) }
								</div>
							) }
							{ loading && (
								<div
									className="wpie-mlm-noitems"
									style={ {
										display: 'flex',
										gap: 8,
										alignItems: 'center',
										justifyContent: 'center',
									} }
								>
									<span className="spin" />
									{ items.length
										? __( 'Loading more…', 'wunderpaint' )
										: __( 'Loading…', 'wunderpaint' ) }
								</div>
							) }
						</div>

						{ selected.size > 0 && (
							<div className="wpie-mlm-bulk">
								<span className="cnt">
									{ sprintf(
										/* translators: %d: count */ __(
											'%d selected',
											'wunderpaint'
										),
										selected.size
									) }
								</span>
								<span className="wpie-mlm-spacer" />

								<label className="wpie-mlm-act">
									<select
										className="dsm-select sm"
										value=""
										onChange={ ( e ) => {
											const v = e.target.value;
											e.target.value = '';
											moveToFolder(
												'0' === v ? 0 : Number( v )
											);
										} }
										disabled={ busy }
									>
										<option value="">
											{ __(
												'Move to folder',
												'wunderpaint'
											) }
										</option>
										<option value="0">
											{ __( 'No folder', 'wunderpaint' ) }
										</option>
										{ folders.map( ( f ) => (
											<option key={ f.id } value={ f.id }>
												{ f.name }
											</option>
										) ) }
									</select>
								</label>

								<label className="wpie-mlm-act">
									<select
										className="dsm-select sm"
										value=""
										onChange={ ( e ) => {
											const v = e.target.value;
											e.target.value = '';
											if ( v ) {
												applyTag( Number( v ), false );
											}
										} }
										disabled={ busy || ! tags.length }
									>
										<option value="">
											{ __( 'Add tag', 'wunderpaint' ) }
										</option>
										{ tags.map( ( t ) => (
											<option key={ t.id } value={ t.id }>
												{ t.name }
											</option>
										) ) }
									</select>
								</label>

								<label className="wpie-mlm-act">
									<select
										className="dsm-select sm"
										value=""
										onChange={ ( e ) => {
											const v = e.target.value;
											e.target.value = '';
											if ( v ) {
												applyTag( Number( v ), true );
											}
										} }
										disabled={ busy || ! tags.length }
									>
										<option value="">
											{ __(
												'Remove tag',
												'wunderpaint'
											) }
										</option>
										{ tags.map( ( t ) => (
											<option key={ t.id } value={ t.id }>
												{ t.name }
											</option>
										) ) }
									</select>
								</label>

								{ cloudEngine && (
									<button
										className="ai-btn secondary sm"
										onClick={ aiAutoTag }
										disabled={ busy }
										title={ __(
											'Generate tags, mood and text automatically',
											'wunderpaint'
										) }
									>
										{ I.wand( { size: 13 } ) }{ ' ' }
										{ tagProgress
											? sprintf(
													/* translators: 1: done 2: total */ __(
														'Tagging %1$d/%2$d',
														'wunderpaint'
													),
													tagProgress.done,
													tagProgress.total
											  )
											: __( 'Auto-tag', 'wunderpaint' ) }
									</button>
								) }
								{ 1 === selected.size &&
									searchModelInstalled() && (
										<button
											className="ai-btn secondary sm"
											onClick={ () =>
												openSimilar(
													[ ...selected ][ 0 ]
												)
											}
											disabled={ busy }
										>
											{ __(
												'Find similar',
												'wunderpaint'
											) }
										</button>
									) }
								<button
									className="ai-btn secondary sm"
									onClick={ () => {
										const one = [ ...selected ][ 0 ];
										setPostPickFor( one );
									} }
									disabled={ busy || 1 !== selected.size }
									title={
										1 !== selected.size
											? __(
													'Select exactly one image.',
													'wunderpaint'
											  )
											: undefined
									}
								>
									{ __( 'Featured image', 'wunderpaint' ) }
								</button>
								{ ! pick && (
									<button
										className="ai-btn secondary sm"
										onClick={ insertIntoDesign }
										disabled={ busy }
									>
										{ __(
											'Insert into design',
											'wunderpaint'
										) }
									</button>
								) }
								<button
									className="ai-btn secondary sm"
									onClick={ downloadSelected }
									disabled={ busy }
								>
									{ I.download( { size: 13 } ) }
								</button>
								<button
									className="ai-btn danger sm"
									onClick={ deleteSelected }
									disabled={ busy }
									title={ __( 'Delete', 'wunderpaint' ) }
									aria-label={ __( 'Delete', 'wunderpaint' ) }
								>
									{ I.trash( { size: 13 } ) }
								</button>
							</div>
						) }
					</main>
				</div>

				<div className="dsm-foot">
					<div className="wpie-mlm-footleft">
						<div
							className="wpie-mlm-toolswrap"
							onMouseEnter={ toolsEnter }
							onMouseLeave={ toolsLeave }
						>
							{ /* Invisible sizer (v1.250.2): the wrap - and with
							   it button and menu, which both fill it - takes
							   the width of the longest menu entry, so labels
							   never wrap (the v1.245.4 button-width menu did). */ }
							<div
								className="wpie-mlm-tools-sizer"
								aria-hidden="true"
							>
								{ [
									__( 'Suggest folders', 'wunderpaint' ),
									__( 'Find duplicates', 'wunderpaint' ),
									__(
										'Regenerate thumbnails',
										'wunderpaint'
									),
									__( 'Rename by pattern', 'wunderpaint' ),
									...( pick
										? []
										: [
												__(
													'Add Watermarks',
													'wunderpaint'
												),
												__(
													'Generate Metadata',
													'wunderpaint'
												),
												__(
													'Optimize images',
													'wunderpaint'
												),
										  ] ),
									__( 'Find broken files', 'wunderpaint' ),
								].map( ( l ) => (
									<span key={ l }>{ l }</span>
								) ) }
							</div>
							{ toolsOpen && (
								<div className="wpie-mlm-tools-menu">
									<button
										className="wpie-mlm-link-btn"
										onClick={ () => {
											setToolsOpen( false );
											suggestClusters();
										} }
										disabled={ ! searchModelInstalled() }
										title={
											! searchModelInstalled()
												? __(
														'Needs the image search model.',
														'wunderpaint'
												  )
												: undefined
										}
									>
										{ I.wand( { size: 14 } ) }{ ' ' }
										{ __(
											'Suggest folders',
											'wunderpaint'
										) }
									</button>
									<button
										className="wpie-mlm-link-btn"
										onClick={ () => {
											setToolsOpen( false );
											findDups();
										} }
										disabled={ ! searchModelInstalled() }
										title={
											! searchModelInstalled()
												? __(
														'Needs the image search model.',
														'wunderpaint'
												  )
												: undefined
										}
									>
										{ I.layers( { size: 14 } ) }{ ' ' }
										{ __(
											'Find duplicates',
											'wunderpaint'
										) }
									</button>
									<button
										className="wpie-mlm-link-btn"
										onClick={ () => {
											setToolsOpen( false );
											runRegenThumbs();
										} }
									>
										{ I.image( { size: 14 } ) }{ ' ' }
										{ __(
											'Regenerate thumbnails',
											'wunderpaint'
										) }
									</button>
									<button
										className="wpie-mlm-link-btn"
										onClick={ () => {
											setToolsOpen( false );
											openRename();
										} }
									>
										{ I.pencil( { size: 14 } ) }{ ' ' }
										{ __(
											'Rename by pattern',
											'wunderpaint'
										) }
									</button>
									{ ! pick && (
										<button
											className="wpie-mlm-link-btn"
											onClick={ () => {
												setToolsOpen( false );
												addWatermarks();
											} }
										>
											{ I.stamp( { size: 14 } ) }{ ' ' }
											{ __(
												'Add Watermarks',
												'wunderpaint'
											) }
										</button>
									) }
									<button
										className="wpie-mlm-link-btn"
										onClick={ () => {
											setToolsOpen( false );
											findBroken();
										} }
									>
										{ I.search( { size: 14 } ) }{ ' ' }
										{ __(
											'Find broken files',
											'wunderpaint'
										) }
									</button>
									{ ! pick && (
										<button
											className="wpie-mlm-link-btn"
											onClick={ () => {
												setToolsOpen( false );
												setCleanupOpen( true );
											} }
										>
											{ I.trash( { size: 14 } ) }{ ' ' }
											{ __(
												'Clean up the library',
												'wunderpaint'
											) }
										</button>
									) }
									{ ! pick && (
										<button
											className="wpie-mlm-link-btn"
											onClick={ () => {
												setToolsOpen( false );
												extras.openAltText( 'all', [
													...selected,
												] );
											} }
										>
											{ I.text( { size: 14 } ) }{ ' ' }
											{ __(
												'Generate Metadata',
												'wunderpaint'
											) }
										</button>
									) }
									{ ! pick && extras?.openBatch && (
										<button
											className="wpie-mlm-link-btn"
											title={
												selected.size
													? undefined
													: __(
															'Opens the Image Processor in Optimize mode; select images first to preload them.',
															'wunderpaint'
													  )
											}
											onClick={ () => {
												setToolsOpen( false );
												extras.openBatch( {
													initialIds: [ ...selected ],
													initialFormat: 'auto',
												} );
											} }
										>
											{ I.sliders( { size: 14 } ) }{ ' ' }
											{ __(
												'Optimize images',
												'wunderpaint'
											) }
										</button>
									) }
								</div>
							) }
							<button
								className={
									'wpie-mlm-toolsbtn' +
									( toolsOpen ? ' open' : '' )
								}
								onClick={ () => setToolsOpen( ( v ) => ! v ) }
							>
								{ I.settings( { size: 15 } ) }{ ' ' }
								{ __( 'Media Library Tools', 'wunderpaint' ) }
							</button>
						</div>
						{ prepping && (
							<span className="dsm-mono">
								{ __(
									'Preparing colors and sizes in the background',
									'wunderpaint'
								) }{ ' ' }
								<span className="spin" />
							</span>
						) }
					</div>
					<div className="dsm-actions">
						<button
							className="ai-btn ghost"
							onClick={ onClose }
							disabled={ busy }
						>
							{ __( 'Close', 'wunderpaint' ) }
						</button>
					</div>
				</div>

				{ clusterOpen && (
					<div
						className="wpie-alt-editwrap"
						onClick={ () => setClusterOpen( false ) }
						role="presentation"
					>
						<div
							className="wpie-mlm-cluster-panel"
							onClick={ ( e ) => e.stopPropagation() }
							role="dialog"
						>
							<div className="dsm-head">
								<span className="dsm-badge">
									{ I.wand( { size: 24 } ) }
								</span>
								<div className="dsm-titles">
									<span className="dsm-title">
										{ __(
											'Suggested folders',
											'wunderpaint'
										) }
									</span>
									<div className="dsm-sub">
										{ __(
											'Groups of visually similar images. Name a group to turn it into a folder.',
											'wunderpaint'
										) }
									</div>
								</div>
								<button
									className="dsm-close"
									onClick={ () => setClusterOpen( false ) }
									aria-label={ __( 'Close', 'wunderpaint' ) }
								>
									{ I.close( { size: 17 } ) }
								</button>
							</div>
							<div className="sub wpie-mlm-clhead">
								<span className="acts">
									{ cloudEngine && (
										<button
											className="ai-btn secondary sm"
											onClick={ autoNameClusters }
											disabled={
												clusterNaming || clusterBusy
											}
										>
											{ clusterNaming && (
												<span className="spin" />
											) }{ ' ' }
											{ __( 'Auto-name', 'wunderpaint' ) }
										</button>
									) }
									<button
										className="ai-btn primary sm"
										onClick={ createAllClusters }
										disabled={
											! clusters ||
											! clusters.some(
												( c ) => c.name && c.name.trim()
											)
										}
									>
										{ __( 'Create all', 'wunderpaint' ) }
									</button>
								</span>
							</div>
							<div className="list">
								{ clusterBusy && <span className="spin" /> }
								{ clusters && ! clusters.length && (
									<div className="wpie-mlm-empty">
										{ __(
											'No clear groups found. Index more images first.',
											'wunderpaint'
										) }
									</div>
								) }
								{ ( clusters || [] ).map( ( cl, idx ) => (
									<div key={ idx } className="wpie-mlm-cl">
										<img src={ cl.thumb } alt="" />
										<div className="body">
											<div className="n">
												{ sprintf(
													/* translators: %d: count */ __(
														'%d images',
														'wunderpaint'
													),
													cl.size
												) }
											</div>
											<div className="row">
												<input
													placeholder={ __(
														'Folder name',
														'wunderpaint'
													) }
													value={ cl.name }
													onChange={ ( e ) => {
														const v =
															e.target.value;
														setClusters( ( prev ) =>
															prev.map(
																( c, i ) =>
																	i === idx
																		? {
																				...c,
																				name: v,
																		  }
																		: c
															)
														);
													} }
												/>
												<button
													className="ai-btn primary sm"
													onClick={ () =>
														createFromCluster(
															cl,
															idx
														)
													}
												>
													{ __(
														'Create',
														'wunderpaint'
													) }
												</button>
											</div>
										</div>
									</div>
								) ) }
							</div>
						</div>
					</div>
				) }

				{ dupOpen && (
					<div
						className="wpie-alt-editwrap"
						onClick={ () => setDupOpen( false ) }
						role="presentation"
					>
						<div
							className="wpie-mlm-cluster-panel wide"
							onClick={ ( e ) => e.stopPropagation() }
							role="dialog"
						>
							<div className="dsm-head">
								<span className="dsm-badge">
									{ I.layers( { size: 24 } ) }
								</span>
								<div className="dsm-titles">
									<span className="dsm-title">
										{ __(
											'Duplicate images',
											'wunderpaint'
										) }
									</span>
									<div className="dsm-sub">
										{ __(
											'Near-identical images, grouped. Click an image to keep or trash it, then move the marked ones to the trash.',
											'wunderpaint'
										) }
									</div>
								</div>
								<button
									className="dsm-close"
									onClick={ () => setDupOpen( false ) }
									aria-label={ __( 'Close', 'wunderpaint' ) }
								>
									{ I.close( { size: 16 } ) }
								</button>
							</div>
							<div className="list">
								{ dupBusy && <span className="spin" /> }
								{ dups && ! dups.length && (
									<div className="wpie-mlm-empty">
										{ __(
											'No duplicates found.',
											'wunderpaint'
										) }
									</div>
								) }
								{ ( dups || [] ).map( ( g, idx ) => {
									const marked = g.items.filter( ( it ) =>
										dupTrash.has( it.id )
									).length;
									return (
										<div
											key={ idx }
											className="wpie-mlm-dup"
										>
											<div className="thumbs">
												{ g.items.map( ( it ) => {
													const del = dupTrash.has(
														it.id
													);
													return (
														<button
															key={ it.id }
															type="button"
															className={
																'dth' +
																( del
																	? ' del'
																	: ' keep' )
															}
															onClick={ () =>
																toggleDupTrash(
																	it.id
																)
															}
															title={
																del
																	? __(
																			'Marked for trash. Click to keep.',
																			'wunderpaint'
																	  )
																	: __(
																			'Kept. Click to mark for trash.',
																			'wunderpaint'
																	  )
															}
														>
															<img
																src={ it.thumb }
																alt=""
															/>
															<span className="mark">
																{ del
																	? I.trash( {
																			size: 15,
																	  } )
																	: I.check( {
																			size: 15,
																	  } ) }
															</span>
														</button>
													);
												} ) }
											</div>
											<div className="row">
												<span className="n">
													{ sprintf(
														/* translators: 1: total, 2: marked */ __(
															'%1$d copies, %2$d marked',
															'wunderpaint'
														),
														g.items.length,
														marked
													) }
												</span>
												<button
													className="ai-btn danger sm"
													disabled={ ! marked }
													onClick={ () =>
														trashDupGroup( g )
													}
												>
													{ I.trash( { size: 13 } ) }{ ' ' }
													{ sprintf(
														/* translators: %d: count */ __(
															'Trash %d',
															'wunderpaint'
														),
														marked
													) }
												</button>
											</div>
										</div>
									);
								} ) }
							</div>
						</div>
					</div>
				) }

				{ uploadQueue && (
					<div
						className="wpie-alt-editwrap"
						onClick={ uploading ? undefined : closeUpload }
						role="presentation"
					>
						<div
							className="wpie-mlm-cluster-panel wide"
							onClick={ ( e ) => e.stopPropagation() }
							role="dialog"
						>
							<div className="dsm-head">
								<span className="dsm-badge">
									{ I.upload( { size: 24 } ) }
								</span>
								<div className="dsm-titles">
									<span className="dsm-title">
										{ sprintf(
											/* translators: %d: count */ __(
												'Import %d file(s)',
												'wunderpaint'
											),
											uploadQueue.length
										) }
									</span>
									<div className="dsm-sub">
										{ __(
											'Check the list, choose where they land, then import.',
											'wunderpaint'
										) }
									</div>
								</div>
								<button
									className="dsm-close"
									onClick={ closeUpload }
									disabled={ uploading }
									aria-label={ __( 'Close', 'wunderpaint' ) }
								>
									{ I.close( { size: 17 } ) }
								</button>
							</div>
							<div className="wpie-mlm-uploadopts">
								<label className="wpie-mlm-act">
									{ I.move( { size: 13 } ) }
									<select
										className="dsm-select sm"
										value={ uploadOpts.folder }
										onChange={ ( e ) =>
											setUploadOpts( ( o ) => ( {
												...o,
												folder: Number(
													e.target.value
												),
											} ) )
										}
									>
										<option value="0">
											{ __( 'No folder', 'wunderpaint' ) }
										</option>
										{ folders.map( ( f ) => (
											<option key={ f.id } value={ f.id }>
												{ f.name }
											</option>
										) ) }
									</select>
								</label>
								<label className="wpie-mlm-check">
									<input
										type="checkbox"
										checked={ uploadOpts.optimize }
										onChange={ ( e ) =>
											setUploadOpts( ( o ) => ( {
												...o,
												optimize: e.target.checked,
											} ) )
										}
									/>
									{ __(
										'Optimize (max 2048px, WebP)',
										'wunderpaint'
									) }
								</label>
								<label
									className="wpie-mlm-check"
									style={ {
										opacity: describeEngine ? 1 : 0.5,
									} }
									title={
										! describeEngine
											? __(
													'Needs a caption model or a provider.',
													'wunderpaint'
											  )
											: undefined
									}
								>
									<input
										type="checkbox"
										checked={
											uploadOpts.describe &&
											!! describeEngine
										}
										disabled={ ! describeEngine }
										onChange={ ( e ) =>
											setUploadOpts( ( o ) => ( {
												...o,
												describe: e.target.checked,
											} ) )
										}
									/>
									{ __(
										'Describe on import (alt, caption, tags)',
										'wunderpaint'
									) }
								</label>
							</div>
							<div className="list">
								{ uploadQueue.map( ( e ) => (
									<div
										key={ e.preview }
										className={
											'wpie-mlm-uprow' +
											( e.skip ? ' skip' : '' )
										}
									>
										{ e.pdf ? (
											<span className="ph">PDF</span>
										) : (
											<img src={ e.preview } alt="" />
										) }
										<div className="body">
											<div className="n">{ e.name }</div>
											{ e.checking && (
												<div className="hint">
													<span className="spin" />{ ' ' }
													{ __(
														'Checking for duplicates',
														'wunderpaint'
													) }
												</div>
											) }
											{ e.dup && (
												<div className="dup">
													{ sprintf(
														/* translators: %d: id */ __(
															'Looks like #%d already exists',
															'wunderpaint'
														),
														e.dup.id
													) }
												</div>
											) }
										</div>
										<button
											className="ai-btn secondary sm"
											onClick={ () =>
												toggleSkip( e.preview )
											}
											disabled={ uploading }
										>
											{ e.skip
												? __( 'Include', 'wunderpaint' )
												: __( 'Skip', 'wunderpaint' ) }
										</button>
									</div>
								) ) }
							</div>
							<div className="dsm-foot">
								<span className="dsm-mono">
									{ uploadProg
										? sprintf(
												/* translators: 1: done 2: total */ __(
													'Importing %1$d / %2$d',
													'wunderpaint'
												),
												uploadProg.done,
												uploadProg.total
										  )
										: uploadOpts.describe && cloudEngine
										? __(
												'Describing uses your cloud provider (costs apply).',
												'wunderpaint'
										  )
										: '' }
								</span>
								<div className="dsm-actions">
									<button
										className="ai-btn ghost"
										onClick={ closeUpload }
										disabled={ uploading }
									>
										{ __( 'Cancel', 'wunderpaint' ) }
									</button>
									<button
										className="ai-btn primary"
										onClick={ doImport }
										disabled={
											uploading ||
											! uploadQueue.some(
												( e ) => ! e.skip
											)
										}
									>
										{ uploading && (
											<span className="spin" />
										) }
										{ sprintf(
											/* translators: %d: count */ __(
												'Import %d',
												'wunderpaint'
											),
											uploadQueue.filter(
												( e ) => ! e.skip
											).length
										) }
									</button>
								</div>
							</div>
						</div>
					</div>
				) }

				{ renameOpen && (
					<div
						className="wpie-alt-editwrap"
						onClick={
							busy ? undefined : () => setRenameOpen( false )
						}
						role="presentation"
					>
						<div
							className="wpie-mlm-cluster-panel"
							onClick={ ( e ) => e.stopPropagation() }
							role="dialog"
						>
							<div className="dsm-head">
								<span className="dsm-badge">
									{ I.pencil( { size: 24 } ) }
								</span>
								<div className="dsm-titles">
									<span className="dsm-title">
										{ __(
											'Rename by pattern',
											'wunderpaint'
										) }
									</span>
									<div className="dsm-sub">
										{ __(
											'Set the title of the selected images from a pattern. Use ### for a counter and the { } button for variables.',
											'wunderpaint'
										) }
									</div>
								</div>
								<button
									className="dsm-close"
									onClick={ () => setRenameOpen( false ) }
									disabled={ busy }
									aria-label={ __( 'Close', 'wunderpaint' ) }
								>
									{ I.close( { size: 16 } ) }
								</button>
							</div>
							<div className="wpie-mlm-renamerow">
								<input
									ref={ renameRef }
									value={ renamePattern }
									placeholder="{{brand.company}} ###"
									onChange={ ( e ) =>
										setRenamePattern( e.target.value )
									}
								/>
								<VarButton
									value={ renamePattern }
									onChange={ setRenamePattern }
									inputRef={ renameRef }
									groups={ affixGroups }
								/>
							</div>
							<div className="list">
								{ [ ...selected ]
									.slice( 0, 6 )
									.map( ( id, i ) => {
										const item =
											items.find(
												( x ) => x.id === id
											) || {};
										return (
											<div
												key={ id }
												className="wpie-mlm-renameprev"
											>
												<span className="old">
													{ item.title || '#' + id }
												</span>
												<span className="arr">→</span>
												<span className="new">
													{ renamePattern.trim()
														? renameTitle(
																renamePattern,
																item,
																i + 1
														  )
														: '' }
												</span>
											</div>
										);
									} ) }
							</div>
							<div className="dsm-foot">
								<span className="dsm-mono">
									{ sprintf(
										/* translators: %d: count */ __(
											'%d selected',
											'wunderpaint'
										),
										selected.size
									) }
								</span>
								<div className="dsm-actions">
									<button
										className="ai-btn ghost"
										onClick={ () => setRenameOpen( false ) }
										disabled={ busy }
									>
										{ __( 'Cancel', 'wunderpaint' ) }
									</button>
									<button
										className="ai-btn primary"
										onClick={ doRename }
										disabled={
											busy || ! renamePattern.trim()
										}
									>
										{ busy && <span className="spin" /> }{ ' ' }
										{ __( 'Rename', 'wunderpaint' ) }
									</button>
								</div>
							</div>
						</div>
					</div>
				) }

				{ editId && (
					<MetaEditor
						id={ editId }
						engine={ defaultEngine }
						lang=""
						toasts={ extras.toasts }
						onClose={ () => setEditId( null ) }
						onReplaced={ () => reloadWith( filters ) }
						onSaved={ applySaved }
						onTagsChanged={ refreshTags }
					/>
				) }

				{ postPickFor && (
					<PostPickerDialog
						extras={ extras }
						heading={ __( 'Set as featured image', 'wunderpaint' ) }
						subheading={ __(
							'Choose the post or page.',
							'wunderpaint'
						) }
						onPick={ ( post ) => {
							setFeatured( postPickFor, post );
							setPostPickFor( null );
						} }
						onClose={ () => setPostPickFor( null ) }
					/>
				) }
			</div>
			{ previewItem && (
				<div
					className="wpie-mlm-preview"
					role="presentation"
					onClick={ ( e ) => {
						e.stopPropagation();
						setPreviewId( 0 );
					} }
				>
					<div
						className="inner"
						role="dialog"
						aria-modal="true"
						onClick={ ( e ) => e.stopPropagation() }
					>
						<div className="stage">
							{ 'image' === ( previewItem.kind || 'image' ) && (
								<img
									src={ previewItem.url || previewItem.thumb }
									alt={ previewItem.alt || '' }
								/>
							) }
							{ 'video' === previewItem.kind && (
								<video
									src={ previewItem.url }
									controls
									autoPlay
								/>
							) }
							{ 'audio' === previewItem.kind && (
								<div className="audiobox">
									{ previewItem.icon ? (
										<img src={ previewItem.icon } alt="" />
									) : null }
									{  }
									<audio
										src={ previewItem.url }
										controls
										autoPlay
									/>
								</div>
							) }
							{ 'doc' === previewItem.kind &&
								( 'application/pdf' === previewItem.mime ? (
									<iframe
										title={
											previewItem.title ||
											previewItem.filename ||
											'PDF'
										}
										src={ previewItem.url }
									/>
								) : (
									<div className="docbox">
										{ previewItem.icon ? (
											<img
												src={ previewItem.icon }
												alt=""
											/>
										) : null }
										<b>
											{ previewItem.filename ||
												previewItem.title }
										</b>
										<a
											className="ai-btn secondary sm"
											href={ previewItem.url }
											target="_blank"
											rel="noreferrer"
										>
											{ __( 'Open file', 'wunderpaint' ) }
										</a>
									</div>
								) ) }
						</div>
						<div className="bar">
							<span className="info">
								<b>
									{ previewItem.title ||
										previewItem.filename ||
										__( '(no title)', 'wunderpaint' ) }
								</b>
								<span>
									{ [
										previewItem.filename,
										previewItem.width && previewItem.height
											? `${ previewItem.width } × ${ previewItem.height }`
											: '',
										previewItem.filesize
											? fmtSize( previewItem.filesize )
											: '',
										previewItem.date,
										previewItem.author,
									]
										.filter( Boolean )
										.join( ' · ' ) }
								</span>
							</span>
							{ ! pick &&
								'image' === ( previewItem.kind || 'image' ) && (
									<button
										type="button"
										className="ai-btn primary sm"
										onClick={ () => {
											setPreviewId( 0 );
											insertItems( [ previewItem ] );
										} }
									>
										{ __(
											'Insert into design',
											'wunderpaint'
										) }
									</button>
								) }
							<button
								type="button"
								className="ai-btn secondary sm"
								onClick={ () => copyUrl( previewItem ) }
							>
								{ __( 'Copy file URL', 'wunderpaint' ) }
							</button>
							{ /* A plain link, not a fetch-and-blob dance: the
							     file is on this very site, so the browser's own
							     download attribute does the right thing and
							     costs no memory for a large original. */ }
							<a
								className="ai-btn secondary sm"
								href={ previewItem.url }
								download={ previewItem.filename || undefined }
							>
								{ __( 'Download', 'wunderpaint' ) }
							</a>
							<button
								type="button"
								className="ai-btn secondary sm"
								onClick={ () => {
									setPreviewId( 0 );
									setEditId( previewItem.id );
								} }
							>
								{ __( 'Edit metadata', 'wunderpaint' ) }
							</button>
							<button
								type="button"
								className="ai-btn ghost sm"
								onClick={ () => setPreviewId( 0 ) }
							>
								{ __( 'Close', 'wunderpaint' ) }
							</button>
						</div>
					</div>
					{ /* The arrows sit on the OVERLAY, not inside .inner
					     (v1.402.0). Anchored to the box they moved with every
					     image, because the box is as wide as its picture - so
					     stepping through a folder meant re-aiming for every
					     single click, and a full-width image pushed them off
					     screen entirely. */ }
					{ previewIndex > 0 && (
						<button
							type="button"
							className="nav prev"
							aria-label={ __( 'Previous', 'wunderpaint' ) }
							onClick={ ( e ) => {
								e.stopPropagation();
								setPreviewId( items[ previewIndex - 1 ].id );
							} }
						>
							{ I.chevRight( { size: 18 } ) }
						</button>
					) }
					{ previewIndex < items.length - 1 && (
						<button
							type="button"
							className="nav next"
							aria-label={ __( 'Next', 'wunderpaint' ) }
							onClick={ ( e ) => {
								e.stopPropagation();
								setPreviewId( items[ previewIndex + 1 ].id );
							} }
						>
							{ I.chevRight( { size: 18 } ) }
						</button>
					) }
				</div>
			) }
			{ cleanupOpen && (
				<CleanupDialog
					extras={ extras }
					onClose={ () => setCleanupOpen( false ) }
					onChanged={ () => reloadWith( filters ) }
				/>
			) }
		</div>
	);
}
