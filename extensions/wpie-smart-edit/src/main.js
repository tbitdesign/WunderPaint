import {
	analyze,
	groupIds,
	textRecords,
	displaySize,
	plan,
	canResize,
} from './engine.js';
import { applyPlan, isCurrent } from './transaction.js';
import { createView } from './view.js';
import { relatedFamilies } from './relations.js';
import { sampleChanges } from './sample.js';
import { ICONS } from './icons.js';
import { t } from './i18n.js';
import {
	measureTextWidth,
	textCommitHeight,
} from '../../../src/lib/raster/text-metrics.js';

const CATEGORIES = {
	text: 'Text styles',
	shapes: 'Shapes',
	colors: 'Colors',
	elements: 'Related elements',
};
const CHANGE_LABELS = {
	family: 'Font',
	size: 'Font size',
	weight: 'Weight',
	italic: 'Style',
	underline: 'Underline',
	strike: 'Style',
	ls: 'Letter spacing',
	lh: 'Line height',
	color: 'Color',
	fill: 'Fill',
	stroke: 'Stroke',
	strokeW: 'Stroke width',
	w: 'Width',
	h: 'Height',
	radius: 'Corner radius',
	opacity: 'Opacity',
	text: 'Text',
	target: 'Move highlight',
	fillPaint: 'Fill',
	strokePaint: 'Stroke',
	cornerStyle: 'Corner radius',
};
let activeDialog = null;

export function openSmartEdit( { editor, extras, explore = null } ) {
	activeDialog?.();
	editor = editor.live || editor;
	const bridge = window.WPIE?.bridge,
		ui = bridge?.ui;
	if ( ! ui?.picks || ! bridge.raster?.renderToCanvas ) {
		return;
	}
	const notify = ( message ) => extras?.toasts?.error?.( message );
	let base = { layers: editor.state.layers, doc: editor.state.doc };
	let selection = editor.state.selectedIds?.length
		? [ ...editor.state.selectedIds ]
		: editor.state.activeId
		? [ editor.state.activeId ]
		: [];
	let analysis = null,
		similarity = 'close',
		sample = null,
		sampleRecord = 0,
		pickingSample = false,
		exampleId = null,
		related = [],
		category = 'text',
		showSingles = false,
		selected = null,
		hovered = null,
		result = null;
	let baseImage = null,
		resultImage = null,
		disposed = false,
		busy = false,
		epoch = 0,
		timer = null;
	let controlsLayers = base.layers;
	let watcher = null,
		observer = null,
		thumbQueue = [],
		thumbFrame = null;
	let rendering = false,
		queuedRender = null,
		selectButton = null;
	const measure = ( layer ) => measureTextWidth( layer );
	measure.height = textCommitHeight;
	const edits = new Map(),
		mounts = [],
		thumbnails = [],
		cardNodes = new Map(),
		memberNodes = new Map();
	const modal = ui.dialog( {
		title: 'Smart Edit',
		subtitle: t(
			'See what belongs together. Shape your design as a whole.'
		),
		width: 1450,
		onClose: dispose,
	} );
	modal.dialog.classList.add( 'wpiese-dialog' );
	ui.badge( modal );
	modal.body.classList.add( 'wpiese-body' );
	const left = ui.el( 'div', 'wpiese-left', modal.body );
	const middle = ui.el( 'div', 'wpiese-mid', modal.body );
	const right = ui.el( 'div', 'wpiese-side', modal.body );
	const scopeSection = ui.section( left, {
		icon: ICONS.view,
		title: t( 'Explore' ),
	} );
	const scope = ui.select( scopeSection, {
		options: [
			{ value: 'all', label: t( 'Whole Document' ) },
			{ value: 'selection', label: t( 'Selection' ) },
		],
		value: 'all',
		onChange: refresh,
	} );
	scope.setAttribute( 'aria-label', t( 'Explore' ) );
	scope.options[ 1 ].disabled = ! selection.length;
	const exploreSelection = ui.btn( scopeSection, {
		label: t( 'Explore active object' ),
		onClick: () => exploreObject( editor.state.activeId || selection[ 0 ] ),
	} );
	const categoryHost = ui.opts( scopeSection, { cols: 2 } );
	categoryHost.classList.add( 'wpiese-categories' );
	const categoryNodes = new Map();
	for ( const [ id, label ] of Object.entries( CATEGORIES ) ) {
		const b = ui.opt( categoryHost, {
			label: t( label ),
			icon: ICONS[ id ],
			onClick: () => {
				category = id;
				renderFamilies();
			},
		} );
		categoryNodes.set( id, b );
	}
	const catalog = ui.section( left, {
		icon: ICONS.elements,
		title: t( 'Design families' ),
	} );
	const familyList = ui.el( 'div', 'wpiese-families', catalog );
	const example = ui.el( 'div', 'wpiese-example', null );
	const exampleName = ui.note( example, '' );
	const similarityLabel = ui.el(
		'label',
		'wpiese-similarity-label',
		example,
		t( 'Similarity' )
	);
	const similaritySelect = ui.select( example, {
		options: [
			{ value: 'close', label: t( 'Close matches' ) },
			{ value: 'broad', label: t( 'Broader matches' ) },
		],
		value: similarity,
		onChange: ( value ) => {
			similarity = value;
			const previous = selected;
			related = relatedFamilies( analysis, exampleId, similarity );
			selected =
				related.find( ( g ) => g.id === previous?.id ) ||
				related.find(
					( g ) =>
						g.kind === previous?.kind &&
						g.relation === previous?.relation
				) ||
				null;
			renderFamilies();
		},
	} );
	similaritySelect.id = 'wpiese-similarity';
	similarityLabel.htmlFor = similaritySelect.id;
	ui.note( example, t( 'Existing changes keep their original matches.' ) );
	ui.btn( example, {
		label: t( 'Show all families' ),
		onClick: () => {
			exampleId = null;
			related = [];
			renderFamilies();
		},
	} );
	catalog.insertBefore( example, familyList );
	example.hidden = true;
	const scopeNote = ui.note( left, '' );
	const changesCard = ui.section( left, {
		icon: ICONS.edit,
		title: t( 'Changes' ),
	} );
	const changesList = ui.el( 'div', 'wpiese-changes', changesCard );
	const changesPanel = changesCard.parentElement;
	left.insertBefore( changesPanel, catalog.parentElement );
	const notice = ui.el( 'div', 'wpiese-notice', middle );
	notice.hidden = true;
	ui.note(
		notice,
		t( 'The document changed. Refresh the analysis before applying.' )
	);
	ui.btn( notice, { label: t( 'Refresh analysis' ), onClick: refresh } );
	const view = createView( middle, {
		ui,
		t,
		onPick: pickObject,
		onExplore: exploreObject,
		onSample: selectSample,
	} );
	const status = ui.el(
		'div',
		'dsm-hint wpiese-status',
		modal.foot,
		t( 'Analyzing your design' )
	);
	status.setAttribute( 'aria-live', 'polite' );
	const actions = ui.el( 'div', 'dsm-actions', modal.foot );
	ui.btn( actions, { label: t( 'Cancel' ), onClick: close } );
	const apply = ui.btn( actions, {
		label: t( 'Apply changes' ),
		primary: true,
		onClick: applyChanges,
	} );
	apply.disabled = true;
	activeDialog = close;
	watcher = setInterval( () => {
		if ( disposed ) {
			return;
		}
		if ( ! isCurrent( editor, base ) ) {
			notice.hidden = false;
			apply.disabled = true;
		}
	}, 400 );
	refresh();
	// Opened from an object: start with what belongs to it.
	if ( explore ) {
		exploreObject( explore );
	}

	function dispose() {
		if ( disposed ) {
			return;
		}
		disposed = true;
		epoch++;
		clearTimeout( timer );
		clearInterval( watcher );
		observer?.disconnect();
		cancelAnimationFrame( thumbFrame );
		while ( mounts.length ) {
			mounts.pop().unmount?.();
		}
		view.close();
		activeDialog = null;
	}
	function close() {
		dispose();
		modal.close();
	}
	function config( group = selected ) {
		if ( ! group ) {
			return null;
		}
		if ( ! edits.has( group.id ) ) {
			edits.set( group.id, {
				group,
				changes: {},
				excluded: new Set(),
				wholeText: false,
				fitPlate: true,
				modes: {},
				disabled: new Set(),
				keepRatio: false,
				sizeAxis: null,
			} );
		}
		return edits.get( group.id );
	}
	function operations() {
		return [ ...edits.values() ].filter(
			( op ) => Object.keys( op.changes ).length
		);
	}
	function changed( key, value ) {
		const op = config();
		if ( ! op ) {
			return;
		}
		op.changes[ key ] = value;
		op.disabled.delete( key );
		const conflicts = {
			fill: 'fillPaint',
			fillPaint: 'fill',
			stroke: 'strokePaint',
			strokePaint: 'stroke',
			radius: 'cornerStyle',
			cornerStyle: 'radius',
		};
		if ( conflicts[ key ] ) {
			delete op.changes[ conflicts[ key ] ];
			op.disabled.delete( conflicts[ key ] );
		}
		if ( key === 'w' || key === 'h' ) {
			op.sizeAxis = key;
			if ( op.keepRatio ) {
				const other = key === 'w' ? 'h' : 'w';
				delete op.changes[ other ];
				op.disabled.delete( other );
			}
		}
		// The last user edit wins when different visual families overlap.
		edits.delete( selected.id );
		edits.set( selected.id, op );
		queuePreview();
	}
	function renderChanges() {
		changesList.replaceChildren();
		const pending = operations();
		changesPanel.hidden = ! pending.length;
		for ( const op of pending ) {
			const group = ui.el( 'div', 'wpiese-change-group', changesList );
			const caption = ui.btn( group, {
				label: groupLabel( op.group ),
				onClick: () => {
					exampleId = null;
					related = [];
					category = op.group.kind;
					renderFamilies();
					choose( op.group );
				},
			} );
			caption.classList.add( 'wpiese-change-family' );
			if ( op.group.similarity ) {
				ui.note(
					group,
					t(
						op.group.similarity === 'broad'
							? 'Broader matches'
							: 'Close matches'
					)
				);
			}
			for ( const [ key, value ] of Object.entries( op.changes ) ) {
				const row = ui.el( 'div', 'wpiese-change', group );
				row.dataset.property = key;
				row.dataset.familyId = op.group.id;
				let detail = value;
				if ( value && typeof value === 'object' ) {
					detail = value.sourceType
						? t( 'From example: {name}', {
								name: value.sourceName || '',
						  } )
						: `${ value.value > 0 ? '+' : '' }${ Number(
								value.value.toFixed( 2 )
						  ) }${ value.mode === 'percent' ? '%' : '' }`;
				} else if ( typeof value === 'boolean' ) {
					detail = t( value ? 'On' : 'Off' );
				} else if ( typeof value === 'number' ) {
					detail = Number( value.toFixed( 2 ) );
				} else if ( key === 'target' ) {
					const target = base.layers.find( ( l ) => l.id === value );
					detail = target?.name || target?.text || '';
				}
				const label = `${ t( CHANGE_LABELS[ key ] ) }: ${ detail }${
					op.keepRatio && [ 'w', 'h' ].includes( key )
						? ' · ' + t( 'Keep proportions' )
						: ''
				}`;
				ui.check( row, {
					label,
					checked: ! op.disabled.has( key ),
					onChange: ( on ) => {
						if ( on ) {
							op.disabled.delete( key );
						} else {
							op.disabled.add( key );
						}
						result = null;
						renderSettings();
						queuePreview();
					},
				} );
				ui.mini( row, {
					icon: ICONS.undo,
					title: t( 'Remove change' ),
					onClick: () => {
						delete op.changes[ key ];
						op.disabled.delete( key );
						result = null;
						renderSettings();
						queuePreview();
					},
				} );
				row.onmouseenter = () =>
					view.highlight( groupIds( op.group, op.excluded ) );
				row.onmouseleave = highlight;
			}
		}
	}
	function updateStatus() {
		const count =
			( result?.patches.size || 0 ) + ( result?.docPatch ? 1 : 0 );
		apply.disabled = busy || ! count || ! isCurrent( editor, base );
		updateSelectButton();
		scope.disabled = operations().length > 0;
		status.textContent = busy
			? t( 'Preparing preview' )
			: count
			? t( '{count} objects will change', { count } )
			: t( 'Choose a visual family to begin' );
	}
	function selectedLayers( group = selected ) {
		const ids = new Set( group ? groupIds( group ) : [] );
		return base.layers.filter( ( l ) => ids.has( l.id ) );
	}
	function highlight() {
		const group = hovered || selected;
		if ( ! group ) {
			view.highlight( [] );
			return;
		}
		const op = edits.get( group.id ),
			omit = new Set( op?.excluded || [] );
		for ( const hit of group.hits ) {
			if ( omit.has( hit.id ) && hit.shapeId ) {
				omit.add( hit.shapeId );
			}
		}
		const ids = groupIds( group );
		if ( ! hovered && result ) {
			for ( const id of result.patches.keys() ) {
				if ( ! ids.includes( id ) ) {
					ids.push( id );
				}
			}
		}
		view.highlight( ids, omit );
	}
	function pickObject( id ) {
		if ( ! selected ) {
			return;
		}
		if ( selected.marker ) {
			changed( 'target', id );
			updateMembers();
			return;
		}
		const hit = selected.hits.find(
			( h ) => h.id === id || h.shapeId === id
		);
		if ( hit ) {
			toggleObject( hit.id );
		}
	}
	function exploreObject( id ) {
		const layer = analysis.eligible.find( ( l ) => l.id === id );
		if ( ! layer ) {
			return;
		}
		related = relatedFamilies( analysis, id, similarity );
		if ( ! related.length ) {
			return;
		}
		exampleId = id;
		category =
			layer.type === 'text'
				? 'text'
				: layer.type === 'shape'
				? 'shapes'
				: 'colors';
		selected = null;
		renderFamilies();
		left.scrollTop = 0;
	}
	function toggleObject( id ) {
		const op = config();
		if ( ! op ) {
			return;
		}
		if ( op.excluded.has( id ) ) {
			op.excluded.delete( id );
		} else {
			op.excluded.add( id );
		}
		updateMembers();
		highlight();
		queuePreview();
	}
	function choose( group ) {
		pickingSample = false;
		view.sampleMode();
		selected = group;
		hovered = null;
		config();
		view.markerMode( !! group.marker );
		for ( const [ node, id ] of cardNodes ) {
			ui.pressed( node, id === group.id || id === group.parentId );
		}
		renderSettings();
		highlight();
	}
	function memberCount( group ) {
		return new Set( group.hits.map( ( h ) => h.id ) ).size;
	}
	function summary( group ) {
		const count = memberCount( group );
		if ( group.marker ) {
			return t( 'Move the highlight by clicking a number' );
		}
		if ( group.kind === 'text' ) {
			const styles = group.hits.map( ( h ) => h.style ),
				first = styles[ 0 ];
			const same = ( key ) =>
				styles.every( ( s ) => s[ key ] === first[ key ] );
			return [
				same( 'family' ) ? first.family : t( 'Font variants' ),
				same( 'size' ) ? first.size + ' px' : t( 'Size variants' ),
				same( 'weight' ) ? first.weight : t( 'Weight variants' ),
				same( 'italic' ) && first.italic ? t( 'Italic' ) : '',
				t( '{count} objects', { count } ),
			]
				.filter( Boolean )
				.join( ' · ' );
		}
		if ( group.kind === 'shapes' ) {
			const sizes = new Set(
				group.hits.map( ( h ) => {
					const l = base.layers.find( ( x ) => x.id === h.id );
					return l ? displaySize( l ) : '';
				} )
			);
			return (
				( group.variants?.length > 1
					? t( '{count} variations', {
							count: group.variants.length,
					  } )
					: sizes.size > 1
					? t( '{count} sizes', { count: sizes.size } )
					: displaySize( group.sample ) ) +
				' · ' +
				t( '{count} objects', { count } )
			);
		}
		if ( group.tones ) {
			return (
				t( '{count} tones', { count: group.tones.length } ) +
				' · ' +
				t( '{count} objects', { count } )
			);
		}
		return t( '{count} objects', { count } );
	}
	function groupLabel( group ) {
		if ( group.relation ) {
			return t( group.relation );
		}
		if ( group.role ) {
			return t( group.name );
		}
		if ( group.kind === 'shapes' ) {
			return t(
				{
					rect: 'Rectangles',
					ellipse: 'Ellipses',
					circle: 'Circles',
					line: 'Lines',
					polygon: 'Polygons',
					star: 'Stars',
				}[ group.name ] || 'Shapes'
			);
		}
		return group.kind === 'elements' ? t( group.name ) : group.name;
	}
	function crop( parent, group, cls = '' ) {
		const thumb = ui.el( 'canvas', 'wpiese-thumb', null );
		thumb.width = 240;
		thumb.height = 88;
		const card = ui.pick( parent, {
			label: groupLabel( group ),
			thumb,
			cls: 'wpiese-family ' + cls,
			on: selected?.id === group.id,
			onClick: () => choose( group ),
		} );
		if ( group.kind === 'colors' ) {
			// A family of tones shows them all, lightest first.
			for ( const tone of [ ...( group.tones || [ group ] ) ]
				.slice( 0, 6 )
				.reverse() ) {
				const swatch = ui.el( 'span', 'wpiese-color' );
				swatch.style.background = tone.color;
				card.label.prepend( swatch );
			}
		} else if ( group.look && typeof group.sample?.fill === 'string' ) {
			const swatch = ui.el( 'span', 'wpiese-color' );
			swatch.style.background = group.sample.fill;
			card.label.prepend( swatch );
		}
		ui.el( 'small', 'wpiese-subtitle', card.label, summary( group ) );
		card.node.onmouseenter = card.node.onfocus = () => {
			hovered = group;
			highlight();
		};
		card.node.onmouseleave = card.node.onblur = () => {
			hovered = null;
			highlight();
		};
		cardNodes.set( card.node, group.id );
		card.node.dataset.familyId = group.id;
		const job = { thumb, group };
		thumbnails.push( job );
		if ( observer && left.contains( parent ) ) {
			thumb._wpieseJob = job;
			observer.observe( thumb );
		} else {
			scheduleThumb( job );
		}
		return card;
	}
	function scheduleThumb( job ) {
		thumbQueue.push( job );
		if ( thumbFrame ) {
			return;
		}
		thumbFrame = requestAnimationFrame( function next() {
			thumbFrame = null;
			if ( disposed ) {
				return;
			}
			for ( let n = 0; n < 5 && thumbQueue.length; n++ ) {
				const task = thumbQueue.shift();
				if ( task.thumb.isConnected ) {
					view.thumbnail(
						task.thumb,
						task.group,
						base.layers,
						baseImage
					);
				}
			}
			if ( thumbQueue.length ) {
				thumbFrame = requestAnimationFrame( next );
			}
		} );
	}
	function renderFamilies() {
		pickingSample = false;
		view.sampleMode();
		observer?.disconnect();
		thumbnails.length = 0;
		thumbQueue = [];
		cardNodes.clear();
		familyList.replaceChildren();
		if ( typeof IntersectionObserver !== 'undefined' ) {
			observer = new IntersectionObserver(
				( entries ) => {
					for ( const entry of entries ) {
						if ( entry.isIntersecting ) {
							observer.unobserve( entry.target );
							scheduleThumb( entry.target._wpieseJob );
						}
					}
				},
				{ root: left, rootMargin: '120px' }
			);
		}
		for ( const [ id, button ] of categoryNodes ) {
			ui.pressed( button, id === category );
		}
		example.hidden = ! exampleId;
		if ( exampleId ) {
			const layer = analysis.eligible.find( ( l ) => l.id === exampleId );
			exampleName.textContent = t( 'Related to: {name}', {
				name: layer?.name || layer?.text || t( 'Shapes' ),
			} );
		}
		const groups = ( exampleId ? related : analysis.catalog ).filter(
			( g ) => g.kind === category
		);
		// Text keeps its reading order (headlines first); everything else
		// leads with what repeats most.
		if ( ! exampleId && category !== 'text' ) {
			groups.sort( ( a, b ) => memberCount( b ) - memberCount( a ) );
		}
		if ( ! groups.length ) {
			ui.el(
				'p',
				'wpiese-empty',
				familyList,
				t( 'No editable families in this category.' )
			);
		}
		// A family of one object is nothing to change together: those wait
		// folded away below what really repeats.
		const repeated = exampleId
			? groups
			: groups.filter( ( g ) => memberCount( g ) > 1 );
		const singles = exampleId
			? []
			: groups.filter( ( g ) => memberCount( g ) < 2 );
		const shown = repeated.length ? repeated : singles;
		for ( const group of shown ) {
			crop( familyList, group );
		}
		if ( repeated.length && singles.length ) {
			if (
				singles.some(
					( g ) =>
						selected?.id === g.id || selected?.parentId === g.id
				)
			) {
				showSingles = true;
			}
			const toggle = ui.btn( familyList, {
				label: t( 'Single objects ({count})', {
					count: singles.length,
				} ),
				onClick: () => {
					showSingles = ! showSingles;
					renderFamilies();
				},
			} );
			toggle.classList.add( 'wpiese-singles' );
			toggle.setAttribute( 'aria-expanded', String( showSingles ) );
			if ( showSingles ) {
				for ( const group of singles ) {
					crop( familyList, group );
				}
			}
		}
		// A family picked while exploring stays picked back in the catalog,
		// where it may not be listed: its tools and staged work remain.
		if (
			groups.length &&
			( ! selected || selected.kind !== category ) &&
			! groups.some(
				( g ) => selected?.id === g.id || selected?.parentId === g.id
			)
		) {
			choose( shown[ 0 ] );
		} else if ( ! groups.length ) {
			selected = null;
			renderSettings();
			highlight();
		} else if ( selected ) {
			renderSettings();
			highlight();
		}
	}
	function refresh() {
		epoch++;
		clearTimeout( timer );
		result = null;
		baseImage = null;
		resultImage = null;
		edits.clear();
		base = { layers: editor.state.layers, doc: editor.state.doc };
		selection = editor.state.selectedIds?.length
			? [ ...editor.state.selectedIds ]
			: editor.state.activeId
			? [ editor.state.activeId ]
			: [];
		scope.options[ 1 ].disabled = ! selection.length;
		if ( scope.value === 'selection' && ! selection.length ) {
			scope.value = 'all';
		}
		analysis = analyze(
			base.layers,
			base.doc,
			scope.value === 'all' ? null : selection
		);
		selected = null;
		hovered = null;
		exampleId = null;
		related = [];
		sample = null;
		sampleRecord = 0;
		pickingSample = false;
		view.sampleMode();
		view.pickable( analysis.eligible.map( ( l ) => l.id ) );
		exploreSelection.disabled = ! analysis.eligible.some(
			( l ) => l.id === ( editor.state.activeId || selection[ 0 ] )
		);
		notice.hidden = true;
		if ( ! analysis.catalog.some( ( g ) => g.kind === category ) ) {
			category = analysis.catalog[ 0 ]?.kind || 'text';
		}
		showSingles = false;
		scopeNote.textContent =
			analysis.skipped.protected || analysis.skipped.raster
				? t(
						'Locked objects, images and studio-generated content keep their own editing tools.'
				  )
				: '';
		renderFamilies();
		queuePreview();
	}
	function queuePreview() {
		clearTimeout( timer );
		const token = ++epoch;
		result = null;
		busy = true;
		updateStatus();
		renderChanges();
		timer = setTimeout( () => renderPreview( token ), 90 );
	}
	async function renderPreview( token ) {
		if ( rendering ) {
			queuedRender = token;
			return;
		}
		rendering = true;
		try {
			if ( disposed || token !== epoch ) {
				return;
			}
			const ops = operations(),
				draft = plan( base.layers, base.doc, ops );
			await bridge.fonts.ensureFontsForLayers( draft.layers );
			if ( disposed || token !== epoch ) {
				return;
			}
			const next = plan( base.layers, base.doc, ops, measure );
			const opts = {
				scale: Math.min(
					1,
					1800 / Math.max( 1, base.doc.w, base.doc.h )
				),
				cache: bridge.raster.sharedImageCache,
			};
			if ( ! baseImage ) {
				const image = await bridge.raster.renderToCanvas(
					base.doc,
					base.layers,
					opts
				);
				if ( disposed || token !== epoch ) {
					return;
				}
				baseImage = image;
			}
			const image =
				next.patches.size || next.docPatch
					? await bridge.raster.renderToCanvas(
							next.doc,
							next.layers,
							opts
					  )
					: baseImage;
			if ( disposed || token !== epoch ) {
				return;
			}
			result = next;
			resultImage = image;
			view.set( baseImage, resultImage, next.doc, next.layers );
			updateLinkedDimensions();
			highlight();
			for ( const job of thumbnails ) {
				scheduleThumb( job );
			}
			busy = false;
			updateStatus();
		} catch ( error ) {
			if ( disposed || token !== epoch ) {
				return;
			}
			busy = false;
			result = null;
			updateStatus();
			status.textContent = t(
				'The preview could not be rendered. Try refreshing the analysis.'
			);
			ui.btn( right, {
				label: t( 'Refresh analysis' ),
				onClick: refresh,
			} );
		} finally {
			rendering = false;
			const waiting = queuedRender;
			queuedRender = null;
			if ( ! disposed && waiting === epoch ) {
				renderPreview( waiting );
			}
		}
	}
	function field( parent, title ) {
		const wrap = ui.el( 'div', 'wpiese-field', parent );
		const caption = ui.el( 'label', null, wrap, t( title ) );
		return { wrap, caption };
	}
	function values( key ) {
		if ( selected.kind === 'text' ) {
			return selected.hits.flatMap( ( h ) => {
				const l = controlsLayers.find( ( layer ) => layer.id === h.id );
				return l
					? textRecords( l )
							.filter(
								( r ) => r.start < h.end && r.end > h.start
							)
							.map( ( r ) => r.style[ key ] )
					: [ h.style[ key ] ];
			} );
		}
		if ( selected.kind === 'elements' ) {
			return selected.hits.map( ( h ) => {
				const l = controlsLayers.find(
					( item ) =>
						item.id ===
						( [ 'fill', 'radius' ].includes( key )
							? h.shapeId
							: h.id )
				);
				return l?.type === 'text' &&
					key in ( textRecords( l )[ 0 ]?.style || {} )
					? textRecords( l )[ 0 ].style[ key ]
					: l?.[ key ];
			} );
		}
		const ids = new Set( groupIds( selected ) );
		return controlsLayers
			.filter( ( l ) => ids.has( l.id ) )
			.map( ( l ) => l[ key ] );
	}
	function fieldValue( key, fallback = '' ) {
		if ( key in config().changes ) {
			return config().changes[ key ];
		}
		const list = values( key );
		return list.length &&
			list.every(
				( v ) => JSON.stringify( v ) === JSON.stringify( list[ 0 ] )
			)
			? list[ 0 ] ?? fallback
			: null;
	}
	function numeric( parent, title, key, min, max, step = 1, fallback = 0 ) {
		const f = field( parent, title ),
			row = ui.el( 'div', 'wpiese-number', f.wrap );
		const op = config();
		const mode = op.modes[ key ] || 'set';
		const selectMode = ui.select( row, {
			options: [
				{ value: 'set', label: t( 'Set to' ) },
				{ value: 'add', label: t( 'Add' ) },
				{ value: 'percent', label: t( 'Change %' ) },
			],
			value: mode,
			onChange: ( next ) => {
				op.modes[ key ] = next;
				delete op.changes[ key ];
				result = null;
				renderSettings();
				queuePreview();
				right.querySelector( '#wpiese-' + key )?.focus();
			},
		} );
		selectMode.id = 'wpiese-' + key + '-mode';
		selectMode.setAttribute(
			'aria-label',
			t( '{property}: change mode', { property: t( title ) } )
		);
		const input = ui.el( 'input', 'dsm-input', row );
		const lower = mode === 'percent' ? -100 : mode === 'add' ? -max : min;
		const upper = mode === 'percent' ? 1000 : max;
		const increment = mode === 'percent' ? 1 : step;
		input.type = 'number';
		input.min = lower;
		input.max = upper;
		input.step = increment;
		const v =
			mode === 'set'
				? fieldValue( key, fallback )
				: op.changes[ key ]?.value ?? 0;
		// Format dimensions for display only; untouched values retain precision.
		input.value =
			typeof v === 'number'
				? key === 'w' || key === 'h'
					? Number( v.toFixed( 2 ) )
					: v
				: '';
		input.placeholder = t( 'Mixed' );
		input.id = 'wpiese-' + key;
		f.caption.htmlFor = input.id;
		input.oninput = () => {
			if ( ! input.value ) {
				delete op.changes[ key ];
				queuePreview();
			} else if ( Number.isFinite( input.valueAsNumber ) ) {
				const n = Math.max(
					lower,
					Math.min( upper, input.valueAsNumber )
				);
				if ( mode !== 'set' && n === 0 ) {
					delete op.changes[ key ];
					queuePreview();
				} else {
					changed( key, mode === 'set' ? n : { mode, value: n } );
				}
			}
		};
		ui.numeric( input, {
			min: lower,
			max: upper,
			step: increment,
			labelElement: f.caption,
		} );
	}
	function select( parent, title, key, options, fallback ) {
		const f = field( parent, title );
		const v = fieldValue( key, fallback );
		const input = ui.select( f.wrap, {
			options: [
				...( v === null
					? [ { value: 'mixed', label: t( 'Mixed' ) } ]
					: [] ),
				...options,
			],
			value: v === null ? 'mixed' : String( v ),
			onChange: ( chosen ) => {
				if ( chosen !== 'mixed' ) {
					changed(
						key,
						chosen === 'true'
							? true
							: chosen === 'false'
							? false
							: chosen
					);
				}
			},
		} );
		input.id = 'wpiese-' + key;
		f.caption.htmlFor = input.id;
	}
	function colorField( parent, title, key, fallback ) {
		const f = field( parent, title );
		const v =
			selected.kind === 'colors'
				? config().changes.color || selected.color
				: fieldValue( key, fallback );
		const host = ui.el( 'div', null, f.wrap );
		mounts.push(
			bridge.components.mountColorButton( host, {
				color: v || fallback || '#000000',
				field: true,
				title: t( title ),
				onChange: ( c ) => changed( key, c ),
			} )
		);
		if ( v === null ) {
			ui.note( f.wrap, t( 'Mixed' ) );
		}
	}
	function textControls( parent ) {
		const f = field( parent, 'Font' );
		const host = ui.el( 'div', null, f.wrap );
		const font = fieldValue( 'family', 'Inter' );
		mounts.push(
			bridge.components.mountFontPicker( host, {
				value: font || '',
				onChange: ( family ) => changed( 'family', family ),
			} )
		);
		if ( font === null ) {
			ui.note( f.wrap, t( 'Mixed' ) );
		}
		numeric( parent, 'Font size', 'size', 1, 2000, 0.5, 16 );
		select(
			parent,
			'Weight',
			'weight',
			[ 100, 200, 300, 400, 500, 600, 700, 800, 900 ].map( ( n ) => ( {
				value: n,
				label: String( n ),
			} ) ),
			400
		);
		select(
			parent,
			'Style',
			'italic',
			[
				{ value: 'false', label: t( 'Normal' ) },
				{ value: 'true', label: t( 'Italic' ) },
			],
			false
		);
		colorField( parent, 'Text color', 'color', '#000000' );
		numeric( parent, 'Letter spacing', 'ls', -100, 1000, 0.1, 0 );
		numeric( parent, 'Line height', 'lh', 0.5, 5, 0.05, 1.05 );
		select(
			parent,
			'Underline',
			'underline',
			[
				{ value: 'false', label: t( 'Off' ) },
				{ value: 'true', label: t( 'On' ) },
			],
			false
		);
	}
	function updateLinkedDimensions() {
		if ( ! selected || ! result ) {
			return;
		}
		controlsLayers = result.layers;
		const op = config();
		if ( ! op.keepRatio || ! op.sizeAxis ) {
			return;
		}
		const other = op.sizeAxis === 'w' ? 'h' : 'w';
		const input = right.querySelector( '#wpiese-' + other );
		if ( input && input !== input.ownerDocument.activeElement ) {
			const v =
				( op.modes[ other ] || 'set' ) === 'set'
					? fieldValue( other )
					: 0;
			input.value = typeof v === 'number' ? Number( v.toFixed( 2 ) ) : '';
		}
	}
	function selectSample( id ) {
		const type =
			selected?.kind === 'text'
				? 'text'
				: selected?.kind === 'shapes'
				? 'shape'
				: null;
		if (
			! type ||
			! analysis.eligible.some( ( l ) => l.id === id && l.type === type )
		) {
			return;
		}
		const layers =
			result?.layers ||
			plan( base.layers, base.doc, operations(), measure ).layers;
		sample = layers.find( ( l ) => l.id === id );
		sampleRecord = 0;
		pickingSample = false;
		view.sampleMode();
		renderSettings();
	}
	function renderSampleControls() {
		const type =
			selected.kind === 'text'
				? 'text'
				: selected.kind === 'shapes'
				? 'shape'
				: null;
		if ( ! type ) {
			return;
		}
		const sources = analysis.eligible.filter( ( l ) => l.type === type );
		if ( ! sample || sample.type !== type ) {
			sample =
				controlsLayers.find(
					( l ) => l.id === exampleId && l.type === type
				) ||
				controlsLayers.find( ( l ) => l.id === selected.hits[ 0 ].id );
			sampleRecord = 0;
		}
		const card = ui.section( right, {
			icon: ICONS.sample,
			title: t( 'Copy from example' ),
		} );
		card.classList.add( 'wpiese-sample' );
		const source = ui.select( card, {
			options: sources.map( ( l ) => ( {
				value: l.id,
				label: l.name || l.text || t( 'Shapes' ),
			} ) ),
			value: sample?.id,
			onChange: selectSample,
		} );
		source.setAttribute( 'aria-label', t( 'Example object' ) );
		source.classList.add( 'wpiese-sample-source' );
		ui.btn( card, {
			label: t(
				pickingSample
					? 'Cancel example selection'
					: 'Pick example on canvas'
			),
			onClick: () => {
				pickingSample = ! pickingSample;
				view.sampleMode(
					pickingSample ? sources.map( ( l ) => l.id ) : null
				);
				renderSettings();
			},
		} );
		if ( ! sample ) {
			return;
		}
		if ( type === 'text' ) {
			const records = textRecords( sample );
			if ( records.length > 1 ) {
				const passage = ui.select( card, {
					options: records.map( ( r, index ) => ( {
						value: String( index ),
						label: `${ r.text.slice( 0, 24 ) } · ${
							r.style.family
						} · ${ Number( r.style.size.toFixed( 2 ) ) } px`,
					} ) ),
					value: String( sampleRecord ),
					onChange: ( value ) => {
						sampleRecord = Number( value );
					},
				} );
				passage.setAttribute( 'aria-label', t( 'Text passage' ) );
			}
		}
		const parts =
			type === 'text'
				? [ [ 'typography', 'Typography' ] ]
				: [
						[ 'fill', 'Fill' ],
						[ 'stroke', 'Stroke' ],
						...( selectedLayers().every( ( l ) =>
							[ 'rect', 'roundrect', 'roundedRect' ].includes(
								l.shape
							)
						)
							? [ [ 'radius', 'Corner radius' ] ]
							: [] ),
				  ];
		const buttons = ui.el( 'div', 'wpiese-sample-parts', card );
		for ( const [ part, label ] of parts ) {
			ui.btn( buttons, {
				label: t( label ),
				onClick: () => {
					const changes = sampleChanges( sample, part, sampleRecord );
					for ( const [ key, value ] of Object.entries( changes ) ) {
						if ( value?.sourceType ) {
							value.sourceName =
								sample.name || sample.text || t( 'Shapes' );
						}
						config().modes[ key ] = 'set';
						changed( key, value );
					}
					pickingSample = false;
					view.sampleMode();
					renderSettings();
				},
			} );
		}
	}
	function renderSettings() {
		while ( mounts.length ) {
			mounts.pop().unmount?.();
		}
		right.replaceChildren();
		for ( const node of cardNodes.keys() ) {
			if ( ! node.isConnected ) {
				cardNodes.delete( node );
			}
		}
		memberNodes.clear();
		for ( let i = thumbnails.length - 1; i >= 0; i-- ) {
			if ( ! thumbnails[ i ].thumb.isConnected ) {
				thumbnails.splice( i, 1 );
			}
		}
		controlsLayers =
			result?.layers ||
			plan( base.layers, base.doc, operations(), measure ).layers;
		if ( ! selected ) {
			ui.el(
				'p',
				'wpiese-empty',
				right,
				t( 'Select a family to see its editing tools.' )
			);
			return;
		}
		const op = config();
		const card = ui.section( right, {
			icon: ICONS[ selected.kind ],
			title: groupLabel( selected ),
		} );
		ui.note( card, summary( selected ) );
		if ( selected.relation === 'Same typography' ) {
			ui.note(
				card,
				t( 'Matching typography across different colors and effects.' )
			);
		}
		if ( selected.relation === 'Similar typography' ) {
			ui.note(
				card,
				t(
					'Matching typography with small size differences. Review the highlighted objects.'
				)
			);
		}
		if ( selected.relation === 'Same shape appearance' ) {
			ui.note(
				card,
				t( 'Matching shape appearance across different dimensions.' )
			);
		}
		if ( selected.tones ) {
			const swatches = ui.el( 'div', 'wpiese-swatches', card );
			for ( const tone of selected.tones ) {
				const swatch = ui.el( 'span', 'wpiese-color', swatches );
				swatch.style.background = tone.color;
				swatch.title = tone.color;
			}
			ui.note(
				card,
				t(
					'Lighter and darker tones keep their distance to the chosen color.'
				)
			);
		}
		if ( selected.colors ) {
			const swatches = ui.el( 'div', 'wpiese-swatches', card );
			for ( const color of selected.colors ) {
				const swatch = ui.el( 'span', 'wpiese-color', swatches );
				swatch.style.background = color;
				swatch.title = color;
			}
			ui.note(
				card,
				t(
					'These nearby colors will share the chosen color. Transparency is preserved.'
				)
			);
		}
		const parent =
			[ ...analysis.catalog, ...analysis.families ].find(
				( g ) => g.id === selected.parentId
			) || selected;
		if ( parent.variants?.length > 1 ) {
			const vCard = ui.section( right, {
				icon: ICONS.elements,
				title: t( 'Variations' ),
			} );
			ui.btn( vCard, {
				label: t( 'All variations' ),
				onClick: () => choose( parent ),
			} );
			const variants = ui.el( 'div', 'wpiese-variants', vCard );
			for ( const variant of parent.variants ) {
				crop( variants, variant );
			}
		}
		const controls = ui.section( right, {
			icon: ICONS.edit,
			title: t( 'Modify together' ),
		} );
		if ( selected.marker ) {
			ui.note(
				controls,
				t(
					'Choose the new number in the preview or below. The marker and text colors move together.'
				)
			);
		} else if ( selected.kind === 'text' ) {
			textControls( controls );
			if (
				selectedLayers().some(
					( l ) => l.spans?.length || l.lineStyles?.some( Boolean )
				)
			) {
				ui.check( controls, {
					label: t( 'Apply to whole text layers' ),
					checked: op.wholeText,
					onChange: ( on ) => {
						op.wholeText = on;
						queuePreview();
					},
				} );
			}
			if ( selectedLayers().some( ( l ) => l.textFit ) ) {
				ui.note(
					controls,
					t(
						'Automatic text fitting can determine the displayed size.'
					)
				);
			}
		} else if ( selected.kind === 'shapes' ) {
			colorField( controls, 'Fill', 'fill', '#3b66ff' );
			colorField( controls, 'Stroke', 'stroke', '#000000' );
			numeric( controls, 'Stroke width', 'strokeW', 0, 1000 );
			if ( selectedLayers().every( canResize ) ) {
				const ratio = ui.btn( controls, {
					icon: ICONS.link,
					label: t( 'Keep proportions' ),
					onClick: () => {
						op.keepRatio = ! op.keepRatio;
						if ( op.keepRatio && op.sizeAxis ) {
							const other = op.sizeAxis === 'w' ? 'h' : 'w';
							delete op.changes[ other ];
							op.disabled.delete( other );
						}
						result = null;
						renderSettings();
						queuePreview();
					},
				} );
				ratio.classList.add( 'wpiese-ratio' );
				const chain = ui.el( 'span', 'wpiese-ratio-icon', null );
				chain.innerHTML = ICONS.link;
				ratio.prepend( chain );
				ui.pressed( ratio, op.keepRatio );
				numeric( controls, 'Width', 'w', 1, 20000 );
				numeric( controls, 'Height', 'h', 1, 20000 );
			}
			if (
				selectedLayers().every( ( l ) =>
					[ 'rect', 'roundrect', 'roundedRect' ].includes( l.shape )
				)
			) {
				numeric( controls, 'Corner radius', 'radius', 0, 20000 );
			}
			numeric( controls, 'Opacity', 'opacity', 0, 1, 0.01, 1 );
		} else if ( selected.kind === 'colors' ) {
			colorField( controls, 'Color', 'color', selected.color );
		} else if ( selected.kind === 'elements' ) {
			if ( selected.hits.length === 1 ) {
				const f = field( controls, 'Text' ),
					input = ui.el( 'input', 'dsm-input', f.wrap );
				input.type = 'text';
				input.value = op.changes.text ?? selected.sample.text;
				input.id = 'wpiese-label-text';
				f.caption.htmlFor = input.id;
				input.oninput = () => changed( 'text', input.value );
			}
			textControls( controls );
			colorField( controls, 'Background', 'fill', '#3b66ff' );
			numeric( controls, 'Corner radius', 'radius', 0, 20000 );
			ui.check( controls, {
				label: t( 'Fit the background to its label' ),
				checked: op.fitPlate,
				onChange: ( on ) => {
					op.fitPlate = on;
					queuePreview();
				},
			} );
		}
		ui.btn( controls, {
			label: t( 'Reset this family' ),
			onClick: () => {
				edits.delete( selected.id );
				for ( const variant of selected.variants || [] ) {
					edits.delete( variant.id );
				}
				result = null;
				renderSettings();
				queuePreview();
			},
		} );
		renderSampleControls();
		const members = ui.section( right, {
			icon: ICONS.view,
			title: t( 'Affected objects' ),
		} );
		ui.btn( members, {
			icon: ICONS.fit,
			label: t( 'Zoom to matches' ),
			onClick: () =>
				view.focus( groupIds( selected, config().excluded ) ),
		} );
		// Hand the family to the editor: its members, without the excluded
		// ones, become the selection for the usual tools.
		selectButton = ui.btn( members, {
			label: t( 'Select in document' ),
			onClick: selectInDocument,
		} );
		updateSelectButton();
		const list = ui.el( 'div', 'wpiese-members', members );
		const unique = [
			...new Map( selected.hits.map( ( h ) => [ h.id, h ] ) ).values(),
		];
		for ( const hit of unique ) {
			const layer = base.layers.find( ( l ) => l.id === hit.id );
			const thumb = ui.el( 'canvas', 'wpiese-thumb', null );
			thumb.width = 120;
			thumb.height = 70;
			const row = ui.el( 'div', 'wpiese-member-row', list );
			const b = ui.pickrow( row, {
				title: layer?.name || layer?.text || t( 'Document background' ),
				thumb,
				cls: 'wpiese-member',
				onClick: () =>
					selected.marker
						? ( changed( 'target', hit.id ), updateMembers() )
						: toggleObject( hit.id ),
			} );
			ui.mini( row, {
				icon: ICONS.fit,
				title: t( 'Zoom to object' ),
				onClick: () =>
					view.focus( [ hit.id, hit.shapeId ].filter( Boolean ) ),
			} );
			b.node.onmouseenter = () =>
				view.highlight( [ hit.id, hit.shapeId ].filter( Boolean ) );
			b.node.onmouseleave = highlight;
			memberNodes.set( hit.id, b.node );
			const job = { thumb, group: { hits: [ hit ] } };
			thumbnails.push( job );
			scheduleThumb( job );
		}
		updateMembers();
		ui.btn( right, {
			label: t( 'Reset all changes' ),
			onClick: () => {
				edits.clear();
				result = null;
				renderSettings();
				queuePreview();
			},
		} );
	}
	function updateSelectButton() {
		if ( ! selectButton?.isConnected ) {
			return;
		}
		const pending = operations().length > 0;
		selectButton.disabled = pending;
		selectButton.title = pending
			? t( 'Apply or reset the changes before selecting.' )
			: '';
	}
	function selectInDocument() {
		if ( ! selected || operations().length ) {
			return;
		}
		const ids = groupIds( selected, config().excluded ).filter( ( id ) =>
			base.layers.some( ( l ) => l.id === id )
		);
		if ( ! ids.length ) {
			return;
		}
		editor.dispatch( { type: 'SET_SELECTED', ids } );
		close();
	}
	function updateMembers() {
		if ( ! selected ) {
			return;
		}
		const op = config();
		for ( const [ id, node ] of memberNodes ) {
			ui.pressed(
				node,
				selected.marker
					? id === ( op.changes.target || selected.marker.textId )
					: ! op.excluded.has( id )
			);
		}
	}
	function applyChanges() {
		if ( busy || ! result ) {
			return;
		}
		try {
			const outcome = applyPlan(
				editor,
				base,
				result,
				t( 'Smart Edit' )
			);
			if ( outcome === 'stale' ) {
				notice.hidden = false;
				apply.disabled = true;
				return;
			}
			if ( outcome === 'applied' ) {
				close();
			}
		} catch ( error ) {
			notify( t( 'The changes could not be applied.' ) );
		}
	}
}

// The editor's active object, if Smart Edit can work with it.
const editableActive = ( editor ) => {
	const state = ( editor.live || editor ).state;
	const id = state.activeId;
	return id &&
		analyze( state.layers, state.doc ).eligible.some( ( l ) => l.id === id )
		? id
		: null;
};

function register( api ) {
	api.registerMenuItem( 'extensions', {
		id: 'wpie-smart-edit/studio',
		label: 'Smart Edit',
		category: 'data',
		run: openSmartEdit,
		when: ( { editor } ) => !! editor.state.doc,
	} );
	// From the object itself: this layer, and everything that belongs to it.
	api.registerMenuItem( 'layer', {
		id: 'wpie-smart-edit/related',
		label: t( 'Smart Edit: Related Objects' ),
		run: ( { editor, extras } ) =>
			openSmartEdit( {
				editor,
				extras,
				explore: editableActive( editor ),
			} ),
		when: ( { editor } ) => !! editor.state.activeId,
	} );
}
if ( window.WPIE?.api ) {
	register( window.WPIE.api );
} else {
	window.wp.hooks.addAction( 'wpie.ready', 'wpie-smart-edit', register );
}
