/** Seamless Patterns: layered, deterministic pattern recipes using the editor kit. */
import {
	MOTIFS,
	GLYPH_SETS,
	PALETTES,
	palOf,
	bgColor,
	glyphPool,
	cellElements,
	elementsInTile,
	cellPointAtTile,
	wrapCellPoint,
	expandPlaces,
	toSvgTile,
} from './pattern-core.js';
import { renderTile, ensureStamps } from './render.js';
import { DEFAULTS, MOTIF_PARAMS } from './settings.js';
import { PRESETS, CATEGORIES } from './presets.js';
import { makeDesign, cleanLayer } from './design.js';
import { history, clone } from './distribution.js';
import { randomizeDesign } from './randomize.js';
import { ICONS, SECTION_ICONS } from './icons.js';
import { wrap, clamp } from './geometry.js';
import { t } from './i18n.js';
const GEN_ID = 'wpie-pattern-generator/pattern',
	NS = 'wpie-pattern-generator';
const el = ( tag, cls, parent, text ) => {
	const e = document.createElement( tag );
	if ( cls ) e.className = cls;
	if ( text !== undefined ) e.textContent = text;
	if ( parent ) parent.appendChild( e );
	return e;
};
const button = ( parent, label, fn, cls = 'ai-btn secondary' ) => {
	const b = el( 'button', cls, parent, t( label ) );
	b.type = 'button';
	b.onclick = fn;
	return b;
};
const iconButton = ( parent, label, icon, fn, cls ) => {
	const b = button( parent, label, fn, cls ),
		mark = el( 'span', 'wpiepg-action-icon' );
	mark.innerHTML = icon;
	mark.setAttribute( 'aria-hidden', 'true' );
	b.prepend( mark );
	return b;
};
const layerIcon = ( parent, label, icon, fn ) => {
	const b = button( parent, '', fn, 'icon-btn wpiepg-layericon' );
	b.innerHTML = icon;
	b.setAttribute( 'aria-label', t( label ) );
	b.title = t( label );
	return b;
};
const row = ( parent, label ) => {
	const r = el( 'div', 'wpiepg-row', parent );
	el( 'span', 'dsm-rowline-label', r, t( label ) );
	return r;
};
const choose = ( parent, label, options, value, change ) => {
	const r = row( parent, label ),
		s = el( 'select', 'dsm-select', r );
	s.setAttribute( 'aria-label', t( label ) );
	for ( const [ v, l ] of options ) {
		const o = el( 'option', '', s, t( l ) );
		o.value = v;
	}
	s.value = value;
	s.onchange = () => change( s.value );
	return s;
};
const textField = ( parent, label, value, change ) => {
	const r = row( parent, label ),
		input = el( 'input', 'dsm-input', r );
	input.value = value;
	input.maxLength = 60;
	input.setAttribute( 'aria-label', t( label ) );
	input.onchange = () => change( input.value );
	return input;
};

async function openStudio( { editor, layer } ) {
	const bridge = window.WPIE.bridge,
		ui = bridge.ui,
		editing = layer?.generator?.id === GEN_ID;
	let design = makeDesign(
			editing
				? layer.generator.params
				: PRESETS.find( ( p ) => p.name === 'Indigo Fern' ).p
		),
		active = 0,
		selected = null,
		closed = false,
		busy = false;
	let tab = 'pattern',
		zoom = 1,
		frame = false,
		single = false,
		raf = 0,
		dirty = true,
		tile = null,
		paintInfo = null;
	let colorHandles = [],
		thumbObserver = null,
		previewEpoch = 0,
		resize = null,
		onOutside = null,
		onKey = null;
	const locks = { colors: false, motifs: false, layout: false };
	const stateHistory = history(
		() => ( { design, active } ),
		( s ) => {
			design = s.design;
			active = Math.min( s.active, design.layers.length - 1 );
			selected = null;
			sync();
		}
	);
	const modal = ui.dialog( {
		title: 'Seamless Patterns',
		subtitle: t( 'Build seamless patterns from motifs, layers and color.' ),
		width: 1520,
		onClose: dispose,
	} );
	modal.dialog.classList.add( 'wpiepg-dialog' );
	ui.badge( modal.head );
	modal.body.className = 'wpiepg-body';
	const left = el( 'div', 'dsm-col start wpiepg-left', modal.body ),
		view = el( 'div', 'wpiepg-view', modal.body ),
		side = el( 'div', 'dsm-col end wpiepg-side', modal.body );
	const canvas = el( 'canvas', 'wpiepg-canvas', view );
	canvas.setAttribute( 'aria-label', t( 'Pattern preview' ) );
	canvas.tabIndex = 0;
	const toolbar = el( 'div', 'dsm-card wpiepg-toolbar', view );
	const randomPattern = iconButton(
		toolbar,
		'Random pattern',
		ICONS.dice,
		() => randomize( 'pattern' ),
		'ai-btn primary'
	);
	randomPattern.disabled = true;
	const undoBtn = button( toolbar, 'Undo', () => {
			if ( stateHistory.undo() ) updateHistory();
		} ),
		redoBtn = button( toolbar, 'Redo', () => {
			if ( stateHistory.redo() ) updateHistory();
		} );
	const singleBtn = button( toolbar, 'Single tile', () => {
		single = ! single;
		singleBtn.setAttribute( 'aria-pressed', String( single ) );
		queue();
	} );
	singleBtn.setAttribute( 'aria-pressed', 'false' );
	const frameBtn = button( toolbar, 'Tile frame', () => {
		frame = ! frame;
		frameBtn.setAttribute( 'aria-pressed', String( frame ) );
		queue();
	} );
	frameBtn.setAttribute( 'aria-pressed', 'false' );
	button( toolbar, '−', () => {
		zoom = clamp( zoom / 1.2, 0.3, 4 );
		queue();
	} ).setAttribute( 'aria-label', t( 'Zoom out' ) );
	const zoomText = el( 'span', 'wpiepg-zoom', toolbar, '100%' );
	button( toolbar, '+', () => {
		zoom = clamp( zoom * 1.2, 0.3, 4 );
		queue();
	} ).setAttribute( 'aria-label', t( 'Zoom in' ) );
	const hint = el(
		'div',
		'dsm-note wpiepg-previewhint',
		view,
		t( 'Select an element to move, rotate or recolor it.' )
	);
	const footHint = el(
		'div',
		'dsm-hint',
		modal.foot,
		t( 'Inserts the pattern as an editable fill layer in document size.' )
	);
	const actions = el( 'div', 'dsm-actions', modal.foot );
	button( actions, 'Cancel', close );
	const applyBtn = button(
		actions,
		editing ? 'Update pattern' : 'Insert pattern',
		insert,
		'ai-btn primary'
	);
	const status = ( msg ) => {
		if ( ! closed ) footHint.textContent = t( msg );
	};
	const current = () => design.layers[ active ];
	const checkpoint = ( key ) => {
		stateHistory.checkpoint( key );
		updateHistory();
	};
	function updateHistory() {
		undoBtn.disabled = ! stateHistory.canUndo;
		redoBtn.disabled = ! stateHistory.canRedo;
	}
	function change( fn, key = '', rebuild = false ) {
		checkpoint( key );
		fn();
		dirty = true;
		if ( rebuild ) sync();
		else queue();
	}
	function clearColorHandles() {
		for ( const h of colorHandles ) h.unmount?.();
		colorHandles = [];
	}
	function color( parent, label, value, onChange ) {
		const r = row( parent, label ),
			host = el( 'div', 'wpiepg-colorhost', r );
		const h = bridge.components.mountColorButton( host, {
			color: value,
			title: t( label ),
			field: true,
			onChange: ( next ) => {
				if (
					/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(
						next
					)
				) {
					const value =
						next.length < 6
							? '#' +
							  next
									.slice( 1 )
									.split( '' )
									.map( ( c ) => c + c )
									.join( '' )
							: next;
					onChange( value );
				}
			},
		} );
		colorHandles.push( h );
		h.row = r;
		return h;
	}
	function range( parent, label, min, max, value, onChange, key, step = 1 ) {
		const h = ui.slider( parent, {
			label: t( label ),
			min,
			max,
			value,
			step,
			onInput: ( v ) => change( () => onChange( v ), key ),
		} );
		h.input.setAttribute( 'aria-label', t( label ) );
		return h;
	}
	function check( parent, label, value, onChange ) {
		return ui.check( parent, {
			label: t( label ),
			checked: value,
			onChange,
		} );
	}
	const card = ( parent, title ) =>
		ui.section( parent, {
			title: t( title ),
			icon: SECTION_ICONS[ title ] || ICONS.pattern,
		} );
	function queue() {
		if ( closed || raf ) return;
		raf = requestAnimationFrame( () => {
			raf = 0;
			paint();
		} );
	}
	function paint() {
		if ( closed ) return;
		const w = view.clientWidth,
			h = view.clientHeight;
		if ( ! w || ! h ) return;
		const dpr = Math.min( 2, window.devicePixelRatio || 1 );
		if (
			canvas.width !== Math.round( w * dpr ) ||
			canvas.height !== Math.round( h * dpr )
		) {
			canvas.width = Math.round( w * dpr );
			canvas.height = Math.round( h * dpr );
		}
		if ( dirty || ! tile ) {
			tile = renderTile( design, 256 );
			dirty = false;
		}
		const ctx = canvas.getContext( '2d' );
		ctx.setTransform( dpr, 0, 0, dpr, 0, 0 );
		ctx.clearRect( 0, 0, w, h );
		const { cols, rows } = expandPlaces( design.repeat );
		let unit = 150 * zoom;
		if ( single )
			unit =
				Math.min(
					( w - 70 ) / ( cols * design.aspect ),
					( h - 100 ) / rows
				) * Math.min( zoom, 2 );
		const x = single ? ( w - cols * unit * design.aspect ) / 2 : 0,
			y = single ? ( h - rows * unit ) / 2 : 0;
		paintInfo = { unit, x, y, cols, rows };
		ctx.save();
		ctx.translate( x, y );
		if ( single )
			ctx.drawImage(
				tile,
				0,
				0,
				cols * unit * design.aspect,
				rows * unit
			);
		else {
			const sx = ( cols * unit * design.aspect ) / tile.width,
				sy = ( rows * unit ) / tile.height;
			ctx.scale( sx, sy );
			ctx.fillStyle = ctx.createPattern( tile, 'repeat' );
			ctx.fillRect( 0, 0, w / sx, h / sy );
		}
		ctx.restore();
		if ( frame || single ) {
			ctx.strokeStyle = '#668aff';
			ctx.lineWidth = 1.2;
			ctx.setLineDash( [ 5, 4 ] );
			ctx.strokeRect(
				x + 0.5,
				y + 0.5,
				cols * unit * design.aspect,
				rows * unit
			);
			ctx.setLineDash( [] );
		}
		if ( selected !== null ) {
			const copies = elementsInTile( {
				...current(),
				repeat: design.repeat,
			} ).filter( ( e ) => e.i === selected );
			ctx.strokeStyle = '#668aff';
			ctx.lineWidth = 1.5;
			for ( const e of copies )
				for (
					let ox = single ? 0 : -cols;
					ox <= ( single ? 0 : w / ( unit * design.aspect ) + cols );
					ox += cols
				)
					for (
						let oy = single ? 0 : -rows;
						oy <= ( single ? 0 : h / unit + rows );
						oy += rows
					) {
						const cx = x + ( e.x + ox ) * unit * design.aspect,
							cy = y + ( e.y + oy ) * unit,
							r = Math.max( 9, e.s * unit * 0.7 );
						if (
							cx + r < 0 ||
							cy + r < 0 ||
							cx - r > w ||
							cy - r > h
						)
							continue;
						ctx.setLineDash( e.locked ? [ 3, 3 ] : [] );
						ctx.strokeRect(
							cx - r * design.aspect,
							cy - r,
							r * 2 * design.aspect,
							r * 2
						);
					}
			ctx.setLineDash( [] );
		}
		zoomText.textContent = Math.round( zoom * 100 ) + '%';
	}
	async function applyDesign( next ) {
		const epoch = ++previewEpoch;
		checkpoint();
		design = makeDesign( next );
		active = 0;
		selected = null;
		await ensureStamps( design );
		if ( closed || epoch !== previewEpoch ) return;
		sync();
	}

	// A searchable gallery. Thumbnails are rendered only when they enter the panel.
	const presetBody = card( left, 'Presets' );
	const search = el( 'input', 'dsm-input wpiepg-search', presetBody );
	search.type = 'search';
	search.placeholder = t( 'Search presets' );
	search.setAttribute( 'aria-label', t( 'Search presets' ) );
	let category = 'All',
		favoritesOnly = false,
		store = { favs: [] };
	const categorySelect = choose(
		presetBody,
		'Category',
		CATEGORIES.map( ( c ) => [ c, c ] ),
		category,
		( v ) => {
			category = v;
			renderGallery();
		}
	);
	check( presetBody, 'Favorites', false, ( v ) => {
		favoritesOnly = v;
		renderGallery();
	} );
	const galleryCount = el( 'div', 'dsm-note', presetBody ),
		presetGrid = el( 'div', 'wpiepg-presets', presetBody );
	const favoritesBody = card( left, 'Save as favorite' );
	const favoriteName = textField(
		favoritesBody,
		'Name',
		editing ? layer.name : t( 'My pattern' ),
		() => {}
	);
	const saveFavorite = button(
		favoritesBody,
		'Save as favorite',
		async () => {
			if ( design.layers.some( ( l ) => l.set === 'stamp' ) ) {
				status(
					'Save image-stamp patterns in the document or pattern library.'
				);
				return;
			}
			const entry = {
				id: 'saved-' + Date.now(),
				name: favoriteName.value.trim() || t( 'My pattern' ),
				category: 'Favorites',
				p: clone( design ),
			};
			const next = { ...store, favs: [ ...( store.favs || [] ), entry ] };
			if (
				new TextEncoder().encode( JSON.stringify( next ) ).length >
				31000
			) {
				status(
					'Favorites are full. Remove a favorite before saving another.'
				);
				return;
			}
			saveFavorite.disabled = true;
			try {
				await bridge.storage.set( NS, next );
				store = next;
				renderGallery();
				status( 'Favorite saved.' );
			} catch {
				status( 'Could not save the pattern.' );
			} finally {
				saveFavorite.disabled = false;
			}
		}
	);
	try {
		store = ( await bridge.storage.get( NS ) ) || { favs: [] };
	} catch {
		store = { favs: [] };
	}
	if ( closed ) return;
	if ( ! Array.isArray( store.favs ) ) store.favs = [];
	store.favs = store.favs.map( ( f, i ) =>
		f.p
			? f
			: {
					id: 'legacy-' + i,
					name: t( 'Favorite' ) + ' ' + ( i + 1 ),
					category: 'Favorites',
					p: f,
			  }
	);
	search.oninput = renderGallery;
	function mini( P, size = 112 ) {
		const d = makeDesign( P ),
			c = document.createElement( 'canvas' );
		c.width = c.height = size;
		const ctx = c.getContext( '2d' ),
			tiled = renderTile( d, size / 2 );
		if ( ! bgColor( d ) ) {
			ctx.fillStyle = '#f0f0f0';
			ctx.fillRect( 0, 0, size, size );
		}
		ctx.fillStyle = ctx.createPattern( tiled, 'repeat' );
		ctx.fillRect( 0, 0, size, size );
		return c;
	}
	function renderGallery() {
		thumbObserver?.disconnect();
		presetGrid.replaceChildren();
		const query = search.value.toLocaleLowerCase().trim(),
			list = (
				favoritesOnly ? store.favs : PRESETS.concat( store.favs )
			).filter(
				( p ) =>
					( category === 'All' || p.category === category ) &&
					( ! query ||
						[
							p.name,
							p.category,
							t( p.name ),
							t( p.category ),
							...( p.p.layers || [ p.p ] ).flatMap( ( l ) => {
								const motif =
										MOTIFS.find( ( m ) => m.id === l.motif )
											?.label || '',
									sets = [ l.set, l.set2 ].map(
										( id ) =>
											GLYPH_SETS.find(
												( s ) => s.id === id
											)?.label || ''
									);
								return [
									l.motif,
									l.set,
									l.set2,
									motif,
									t( motif ),
									...sets,
									...sets.map( ( s ) => t( s ) ),
								];
							} ),
						]
							.join( ' ' )
							.toLocaleLowerCase()
							.includes( query ) )
			);
		galleryCount.textContent = list.length + ' ' + t( 'Presets' );
		thumbObserver = new IntersectionObserver(
			( entries ) => {
				for ( const e of entries )
					if ( e.isIntersecting ) {
						const b = e.target,
							p = list[ +b.dataset.index ];
						b.prepend( mini( p.p ) );
						thumbObserver.unobserve( b );
					}
			},
			{ root: left, rootMargin: '180px' }
		);
		for ( const [ i, p ] of list.entries() ) {
			const item = el( 'div', 'wpiepg-presetitem', presetGrid ),
				b = button(
					item,
					p.name,
					() => applyDesign( p.p ),
					'dsm-pick wpiepg-preset'
				);
			b.dataset.index = i;
			b.dataset.preset = p.id;
			b.title = t( p.name );
			thumbObserver.observe( b );
			if (
				String( p.id ).startsWith( 'saved-' ) ||
				String( p.id ).startsWith( 'legacy-' )
			)
				button(
					item,
					'×',
					async () => {
						const next = {
							...store,
							favs: store.favs.filter( ( f ) => f.id !== p.id ),
						};
						try {
							await bridge.storage.set( NS, next );
							store = next;
							renderGallery();
						} catch {
							status( 'Could not save the pattern.' );
						}
					},
					'wpiepg-fav-del'
				).setAttribute(
					'aria-label',
					t( 'Remove favorite' ) + ' ' + p.name
				);
		}
	}

	const layerBody = card( side, 'Pattern layers' ),
		layerList = el( 'div', 'wpiepg-layers', layerBody ),
		layerActions = el( 'div', 'wpiepg-layeractions', layerBody );
	layerList.setAttribute( 'role', 'list' );
	layerList.setAttribute( 'aria-label', t( 'Pattern layers' ) );
	const addLayer = iconButton(
		layerActions,
		'Add layer',
		ICONS.plus,
		() => {
			if ( design.layers.length >= 4 ) return;
			change(
				() => {
					design.layers.push(
						cleanLayer( {
							...DEFAULTS,
							motif: 'scatter',
							set: 'wildflowers',
							count: 12,
							seed: current().seed + 17,
							name:
								t( 'Pattern layer' ) +
								' ' +
								( design.layers.length + 1 ),
						} )
					);
					active = design.layers.length - 1;
					selected = null;
				},
				'',
				true
			);
		},
		'wpiepg-layeradd'
	);
	const duplicateLayer = layerIcon(
		layerActions,
		'Duplicate',
		ICONS.duplicate,
		() => {
			if ( design.layers.length >= 4 ) return;
			change(
				() => {
					design.layers.splice( active + 1, 0, clone( current() ) );
					active++;
					selected = null;
				},
				'',
				true
			);
		}
	);
	const layerOrder = el( 'div', 'wpiepg-layerorder', layerActions );
	const moveLayer = ( direction ) => {
		const next = active + direction;
		if ( next < 0 || next >= design.layers.length ) return;
		change(
			() => {
				[ design.layers[ active ], design.layers[ next ] ] = [
					design.layers[ next ],
					design.layers[ active ],
				];
				active = next;
				selected = null;
			},
			'',
			true
		);
	};
	const layerUp = layerIcon( layerOrder, 'Move layer up', ICONS.up, () =>
		moveLayer( 1 )
	);
	const layerDown = layerIcon(
		layerOrder,
		'Move layer down',
		ICONS.down,
		() => moveLayer( -1 )
	);
	const removeLayer = layerIcon(
		layerOrder,
		'Remove layer',
		ICONS.trash,
		() => {
			if ( design.layers.length === 1 ) return;
			change(
				() => {
					design.layers.splice( active, 1 );
					active = Math.min( active, design.layers.length - 1 );
					selected = null;
				},
				'',
				true
			);
		}
	);
	const variationBody = card( side, 'Variations' ),
		variationActions = el( 'div', 'wpiepg-compact-actions', variationBody );
	const randomLayer = iconButton(
			variationActions,
			'Random layer',
			ICONS.layers,
			() => randomize( 'layer' )
		),
		randomColors = iconButton(
			variationActions,
			'Random colors',
			ICONS.color,
			() => randomize( 'colors' )
		);
	for ( const [ key, label ] of [
		[ 'colors', 'Keep colors' ],
		[ 'motifs', 'Keep motifs' ],
		[ 'layout', 'Keep arrangement' ],
	] )
		check( variationBody, label, locks[ key ], ( value ) => {
			locks[ key ] = value;
			updateRandomControls();
		} );
	const newSeed = iconButton( variationBody, 'New seed', ICONS.dice, () =>
		change(
			() => {
				const p = current();
				preserveLocked( p );
				p.seed =
					1 +
					( ( p.seed + Math.floor( Math.random() * 999998 ) ) %
						999999 );
			},
			'',
			true
		)
	);
	function updateRandomControls() {
		randomPattern.disabled = randomLayer.disabled =
			locks.colors && locks.motifs && locks.layout;
		randomColors.disabled = locks.colors;
		newSeed.disabled = locks.layout;
	}
	const tabbar = el( 'div', 'wpiepg-tabs', side ),
		tabs = {};
	for ( const [ id, label ] of [
		[ 'pattern', 'Pattern' ],
		[ 'colors', 'Colors' ],
		[ 'layout', 'Rapport' ],
		[ 'elements', 'Elements' ],
	] ) {
		tabs[ id ] = button(
			tabbar,
			label,
			() => {
				tab = id;
				renderControls();
			},
			'dsm-mini'
		);
		tabs[ id ].setAttribute( 'role', 'tab' );
	}
	tabbar.setAttribute( 'role', 'tablist' );
	const controls = el( 'div', 'wpiepg-controls', side );
	function renderLayers() {
		// Keep keyboard focus when selection or visibility rebuilds a row.
		const focused = layerList.contains( document.activeElement )
			? document.activeElement.dataset.layerFocus
			: null;
		layerList.replaceChildren();
		addLayer.disabled = duplicateLayer.disabled = design.layers.length >= 4;
		layerUp.disabled = active === design.layers.length - 1;
		layerDown.disabled = active === 0;
		removeLayer.disabled = design.layers.length === 1;
		design.layers
			.map( ( l, i ) => ( { l, i } ) )
			.reverse()
			.forEach( ( { l, i } ) => {
				const r = el( 'div', 'wpiepg-layerrow', layerList ),
					visible = l.visible !== false,
					visibilityLabel = visible ? 'Hide layer' : 'Show layer';
				r.setAttribute( 'role', 'listitem' );
				r.dataset.active = String( i === active );
				r.dataset.visible = String( visible );
				const visibility = layerIcon(
					r,
					t( visibilityLabel ) + ' ' + ( i + 1 ),
					visible ? ICONS.eye : ICONS.eyeOff,
					() =>
						change(
							() => {
								l.visible = ! visible;
							},
							'',
							true
						)
				);
				visibility.dataset.layerFocus = 'visibility-' + i;
				visibility.title = t( visibilityLabel ) + ': ' + t( l.name );
				const select = button(
					r,
					l.name,
					() => {
						active = i;
						selected = null;
						renderLayers();
						renderControls();
						queue();
					},
					'wpiepg-layerselect'
				);
				select.setAttribute( 'aria-current', String( i === active ) );
				select.dataset.layerFocus = 'select-' + i;
				select.title = t( l.name );
			} );
		if ( focused )
			layerList
				.querySelector( '[data-layer-focus="' + focused + '"]' )
				?.focus( { preventScroll: true } );
	}
	function resetEdits( p ) {
		p.moved = [];
		p.added = [];
		p.removed = [];
		selected = null;
	}
	function renderControls() {
		clearColorHandles();
		controls.replaceChildren();
		for ( const id in tabs ) {
			tabs[ id ].setAttribute( 'aria-selected', String( id === tab ) );
			tabs[ id ].classList.toggle( 'is-active', id === tab );
		}
		if ( tab === 'pattern' ) patternControls();
		if ( tab === 'colors' ) colorControls();
		if ( tab === 'layout' ) layoutControls();
		if ( tab === 'elements' ) elementControls();
	}
	function patternControls() {
		const p = current(),
			body = card( controls, 'Pattern' );
		textField( body, 'Layer name', p.name, ( v ) =>
			change( () => {
				p.name = v;
				renderLayers();
			} )
		);
		choose(
			body,
			'Motif',
			MOTIFS.map( ( m ) => [ m.id, m.label ] ),
			p.motif,
			( v ) =>
				change(
					() => {
						p.motif = v;
						resetEdits( p );
						design.layers[ active ] = cleanLayer( p );
					},
					'',
					true
				)
		);
		if ( [ 'scatter', 'gitter', 'raute' ].includes( p.motif ) ) {
			choose(
				body,
				'Doodle set',
				GLYPH_SETS.map( ( s ) => [ s.id, s.label ] ).concat( [
					[ 'stamp', 'Own layer (stamp)' ],
				] ),
				p.set,
				( v ) =>
					change(
						() => {
							p.set = v;
							p.glyphWeights = [];
							resetEdits( p );
						},
						'',
						true
					)
			);
			if ( p.set !== 'stamp' )
				choose(
					body,
					'Second set',
					[
						[ '', 'Off' ],
						...GLYPH_SETS.map( ( s ) => [ s.id, s.label ] ),
					],
					p.set2,
					( v ) =>
						change(
							() => {
								p.set2 = v;
								p.glyphWeights = [];
								resetEdits( p );
							},
							'',
							true
						)
				);
			else stampControls( body, p );
		}
		for ( const [ key, label, min, max ] of MOTIF_PARAMS[ p.motif ] )
			range(
				body,
				label,
				min,
				max,
				p[ key ],
				( v ) => {
					p[ key ] = v;
				},
				'dial-' + active + '-' + key
			);
		if ( p.motif === 'streifen' )
			choose(
				body,
				'Direction',
				[
					[ '0', 'Horizontal' ],
					[ '1', 'Vertical' ],
					[ '2', 'Diagonal down' ],
					[ '3', 'Diagonal up' ],
				],
				String( p.dir ),
				( v ) =>
					change( () => {
						p.dir = +v;
					} )
			);
		range(
			body,
			'Opacity',
			5,
			100,
			p.alpha,
			( v ) => {
				p.alpha = v;
			},
			'alpha-' + active
		);
		if ( p.motif === 'scatter' || p.motif === 'terrazzo' ) {
			const dist = card( controls, 'Distribution' );
			choose(
				dist,
				'Arrangement',
				[
					[ 'jitter', 'Jittered' ],
					[ 'spaced', 'Even spacing' ],
					[ 'cluster', 'Clusters' ],
					[ 'hero', 'Large and small' ],
				],
				p.distribution,
				( v ) =>
					change(
						() => {
							p.distribution = v;
							resetEdits( p );
						},
						'',
						true
					)
			);
			range(
				dist,
				'Spacing',
				0,
				100,
				p.spacing,
				( v ) => {
					p.spacing = v;
				},
				'spacing-' + active
			);
		}
		if (
			p.motif === 'scatter' ||
			p.motif === 'gitter' ||
			p.motif === 'raute'
		) {
			const weights = card( controls, 'Motif frequency' ),
				pool = glyphPool( p ),
				items = pool || p.stamps;
			if ( items?.length ) {
				const grid = el( 'div', 'wpiepg-glyphs', weights );
				items.forEach( ( g, i ) => {
					const item = el( 'div', 'wpiepg-glyphitem', grid );
					item.appendChild( glyphThumb( p, i ) );
					const input = el( 'input', 'dsm-input', item );
					input.type = 'number';
					input.min = 0;
					input.max = 100;
					input.value = p.glyphWeights[ i ] ?? 50;
					input.setAttribute(
						'aria-label',
						t( 'Motif frequency' ) + ' ' + ( i + 1 )
					);
					input.onchange = () =>
						change( () => {
							if ( ! p.glyphWeights.length )
								p.glyphWeights = Array( items.length ).fill(
									50
								);
							p.glyphWeights[ i ] = clamp( +input.value, 0, 100 );
							resetEdits( p );
							input.value = p.glyphWeights[ i ];
						} );
				} );
			}
		}
		const fx = card( controls, 'Effects' );
		range(
			fx,
			'Offset print',
			0,
			100,
			p.riso,
			( v ) => {
				p.riso = v;
			},
			'riso-' + active
		);
		choose(
			fx,
			'Line style',
			[
				[ '', 'Solid' ],
				[ 'dash', 'Dashed' ],
				[ 'dot', 'Dotted' ],
			],
			p.dash,
			( v ) =>
				change( () => {
					p.dash = v;
				} )
		);
	}
	function glyphThumb( p, index ) {
		const c = el( 'canvas' );
		c.width = 72;
		c.height = 64;
		const ctx = c.getContext( '2d' );
		ctx.fillStyle = '#f2f0eb';
		ctx.fillRect( 0, 0, 72, 64 );
		const pool = glyphPool( p ),
			g = pool?.[ index % pool.length ];
		if ( g ) {
			const colors = palOf( p ).colors;
			ctx.lineCap = ctx.lineJoin = 'round';
			for ( const prim of g ) {
				ctx.beginPath();
				prim.pts.forEach( ( [ x, y ], i ) => {
					if ( i ) ctx.lineTo( 36 + x * 56, 32 + y * 56 );
					else ctx.moveTo( 36 + x * 56, 32 + y * 56 );
				} );
				if ( prim.closed || prim.fill ) ctx.closePath();
				ctx.fillStyle = ctx.strokeStyle =
					colors[
						( prim.tone || 0 ) % Math.max( 1, colors.length - 1 )
					];
				ctx.lineWidth = Math.max( 0.7, ( prim.w || 0.022 ) * 56 );
				if ( prim.fill ) ctx.fill();
				else ctx.stroke();
			}
		} else {
			const img = new Image();
			img.onload = () => {
				if ( closed ) return;
				const scale = Math.min( 58 / img.width, 52 / img.height );
				ctx.drawImage(
					img,
					( 72 - img.width * scale ) / 2,
					( 64 - img.height * scale ) / 2,
					img.width * scale,
					img.height * scale
				);
			};
			img.src = p.stamps?.[ index ]?.data || p.stampData;
		}
		return c;
	}
	function colorControls() {
		const p = current(),
			body = card( controls, 'Colors' ),
			kits = (
				bridge.brand?.kits?.() ||
				window.WPIE.brandKits ||
				[]
			).filter( ( k ) => k?.name && k.colors?.length > 1 );
		let baseHandle = null;
		const inkHandles = [];
		const paletteSelect = choose(
			body,
			'Palette',
			PALETTES.map( ( p ) => [ p.id, p.label ] ).concat(
				[
					[ 'custom', 'Custom (brand color)' ],
					[ 'edited', 'Edited palette' ],
				],
				kits.map( ( k, i ) => [ 'kit:' + i, k.name ] )
			),
			p.paletteColors.length
				? 'edited'
				: p.palette === 'kit'
				? 'edited'
				: p.palette,
			( v ) =>
				change(
					() => {
						if ( v === 'edited' ) {
							const colors = palOf( p ).colors.slice();
							p.paletteColors = p.reverse
								? colors.reverse()
								: colors;
						} else if ( v.startsWith( 'kit:' ) ) {
							const k = kits[ +v.slice( 4 ) ];
							p.palette = 'kit';
							p.kitColors = k.colors
								.filter( ( c ) => /^#[0-9a-f]{6}$/i.test( c ) )
								.slice( 0, 8 );
							p.kitName = k.name;
							p.paletteColors = [];
						} else {
							p.palette = v;
							p.paletteColors = [];
						}
						p.colorWeights = [];
					},
					'',
					true
				)
		);
		if ( p.palette === 'custom' && ! p.paletteColors.length )
			baseHandle = color( body, 'Base color', p.customBase, ( v ) =>
				change( () => {
					p.customBase = v;
					inkHandles.forEach( ( h, i ) =>
						h.set( palOf( p ).colors[ i ] )
					);
				}, 'base-color' )
			);
		const ink = card( controls, 'Palette colors' );
		palOf( p ).colors.forEach( ( c, i ) => {
			const r = el( 'div', 'wpiepg-inkrow', ink );
			const inkHandle = color(
				r,
				t( 'Color' ) + ' ' + ( i + 1 ),
				c,
				( v ) =>
					change(
						() => {
							const colors = palOf( p ).colors.slice();
							colors[ i ] = v;
							p.paletteColors = p.reverse
								? colors.reverse()
								: colors;
							paletteSelect.value = 'edited';
							if ( baseHandle ) baseHandle.row.hidden = true;
						},
						'ink-' + active + '-' + i
					)
			);
			inkHandles.push( inkHandle );
			range(
				r,
				'Share',
				0,
				100,
				p.colorWeights[ i ] ?? 50,
				( v ) => {
					if ( ! p.colorWeights.length )
						p.colorWeights = palOf( p ).colors.map( () => 50 );
					p.colorWeights[ i ] = v;
				},
				'share-' + active + '-' + i
			);
		} );
		button( body, 'New colorway', () =>
			change( () => {
				p.colorway = ( p.colorway + 1 ) % palOf( p ).colors.length;
			} )
		);
		check( body, 'Reverse order', !! p.reverse, ( v ) =>
			change(
				() => {
					p.reverse = v ? 1 : 0;
				},
				'',
				true
			)
		);
		const bg = card( controls, 'Background' );
		check( bg, 'Transparent', ! design.bg, ( v ) =>
			change(
				() => {
					design.bg = v ? '' : 'custom';
				},
				'',
				true
			)
		);
		if ( design.bg )
			color( bg, 'Background color', design.bgCustom, ( v ) =>
				change( () => {
					design.bgCustom = v;
				}, 'background' )
			);
	}
	function layoutControls() {
		const body = card( controls, 'Rapport' );
		choose(
			body,
			'Repeat',
			[
				[ 'straight', 'Straight' ],
				[ 'halfdrop', 'Half-drop' ],
				[ 'brick', 'Brick' ],
				[ 'mirror', 'Mirror' ],
				[ 'third', 'Third-drop' ],
				[ 'quarter', 'Quarter-drop' ],
				[ 'rotate', 'Quarter turns' ],
				[ 'halfturn', 'Half turns' ],
			],
			design.repeat,
			( v ) =>
				change( () => {
					design.repeat = v;
					selected = null;
				} )
		);
		range(
			body,
			'Cell aspect',
			0.5,
			2,
			design.aspect,
			( v ) => {
				design.aspect = v;
			},
			'aspect',
			0.05
		);
		choose(
			body,
			'Tile size',
			[ 128, 256, 384, 512, 768, 1024 ].map( ( n ) => [
				String( n ),
				n + ' px',
			] ),
			String( design.cellPx ),
			( v ) =>
				change( () => {
					design.cellPx = +v;
				} )
		);
		const p = current();
		range(
			body,
			'Offset X',
			-50,
			50,
			Math.round( p.shift.x * 100 ),
			( v ) => {
				p.shift.x = v / 100;
			},
			'offset-x-' + active
		);
		range(
			body,
			'Offset Y',
			-50,
			50,
			Math.round( p.shift.y * 100 ),
			( v ) => {
				p.shift.y = v / 100;
			},
			'offset-y-' + active
		);
		const lib = card( controls, 'Pattern library' );
		const name = textField( lib, 'Name', favoriteName.value, () => {} );
		button( lib, 'Save as fill pattern', async () => {
			if ( busy ) return;
			setBusy( true );
			try {
				const tile = await outputTile();
				await window.wp.apiFetch( {
					url:
						String( window.WPIE.restUrl || '' ).replace(
							/\/$/,
							''
						) + '/library/pattern',
					method: 'POST',
					data: {
						item: {
							name: ( name.value || 'Pattern' ).slice( 0, 24 ),
							dataUrl: tile.toDataURL( 'image/png' ),
						},
					},
				} );
				status(
					'Saved. The tile is now available as a pattern fill for shapes and text.'
				);
			} catch {
				status( 'Could not save the pattern.' );
			} finally {
				setBusy( false );
			}
		} );
		button( lib, 'Download PNG tile', () => download( 'png' ) );
		button( lib, 'Download SVG tile', () => download( 'svg' ) );
	}
	function selectedElement() {
		return cellElements( current() ).find( ( e ) => e.i === selected );
	}
	function patchElement( p, id, patch ) {
		const e = p.moved.find( ( m ) => m.i === id );
		if ( e ) Object.assign( e, patch );
		else p.moved.push( { i: id, ...patch } );
	}
	function elementControls() {
		const p = current(),
			body = card( controls, 'Elements' );
		if ( ! [ 'scatter', 'terrazzo' ].includes( p.motif ) ) {
			el(
				'div',
				'dsm-note',
				body,
				t( 'Use Scatter or Terrazzo to edit individual elements.' )
			);
			return;
		}
		const elements = cellElements( p ),
			grid = el( 'div', 'wpiepg-elements', body );
		for ( const e of elements ) {
			const b = button(
				grid,
				String( e.i >= 100000 ? elements.indexOf( e ) + 1 : e.i + 1 ),
				() => {
					selected = e.i;
					renderControls();
					queue();
				},
				'dsm-pick wpiepg-element'
			);
			b.dataset.element = e.i;
			b.setAttribute(
				'aria-label',
				t( 'Element' ) + ' ' + ( elements.indexOf( e ) + 1 )
			);
			b.setAttribute( 'aria-pressed', String( selected === e.i ) );
			b.prepend( glyphThumb( p, e.g ) );
			if ( e.locked ) b.title = t( 'Locked' );
		}
		const e = selectedElement();
		if ( e ) {
			const info = card( controls, 'Selected element' );
			check( info, 'Locked', !! e.locked, ( v ) =>
				change(
					() => {
						patchElement( p, e.i, { locked: v } );
					},
					'',
					true
				)
			);
			range(
				info,
				'Size',
				1,
				100,
				e.s * 100,
				( v ) => {
					if ( ! e.locked ) patchElement( p, e.i, { s: v / 100 } );
				},
				'element-size-' + e.i
			).input.disabled = !! e.locked;
			range(
				info,
				'Rotation',
				-180,
				180,
				( e.rot * 180 ) / Math.PI,
				( v ) => {
					if ( ! e.locked )
						patchElement( p, e.i, { rot: ( v * Math.PI ) / 180 } );
				},
				'element-rot-' + e.i
			).input.disabled = !! e.locked;
			if ( p.set !== 'stamp' && ! e.locked )
				color(
					info,
					'Element color',
					e.color ||
						palOf( p ).colors[ e.c % palOf( p ).colors.length ],
					( v ) => {
						if ( ! e.locked )
							change(
								() => patchElement( p, e.i, { color: v } ),
								'element-color-' + e.i
							);
					}
				);
			button( info, 'Duplicate element', () =>
				change(
					() => {
						const id =
							Math.max(
								-1,
								...p.added.map( ( a, i ) => a.id ?? i )
							) + 1;
						p.added.push( {
							...e,
							id,
							...wrapCellPoint( design, {
								x: e.x + 0.06,
								y: e.y + 0.06,
							} ),
							locked: false,
						} );
						selected = 100000 + id;
					},
					'',
					true
				)
			);
			const remove = button( info, 'Remove element', removeSelected );
			remove.disabled = !! e.locked;
		}
		button( body, 'Add element', () => addElement( 0.5, 0.5 ) );
		button( body, 'Reset edits', () =>
			change(
				() => {
					resetEdits( p );
				},
				'',
				true
			)
		);
	}
	function removeSelected() {
		const p = current(),
			e = selectedElement();
		if ( ! e || e.locked ) return;
		change(
			() => {
				if ( e.i >= 100000 ) {
					p.added = p.added
						.map( ( a, i ) => ( { ...a, id: a.id ?? i } ) )
						.filter( ( a ) => a.id !== e.i - 100000 );
				} else p.removed.push( e.i );
				p.moved = p.moved.filter( ( m ) => m.i !== e.i );
				selected = null;
			},
			'',
			true
		);
	}
	function addElement( x, y ) {
		const p = current();
		if ( p.added.length >= 100 ) return;
		change(
			() => {
				const pool = glyphPool( p ) || p.stamps || [ 0 ],
					id =
						Math.max(
							-1,
							...p.added.map( ( a, i ) => a.id ?? i )
						) + 1;
				p.added.push( {
					id,
					...wrapCellPoint( design, { x, y } ),
					s: 0.17,
					g: Math.floor( Math.random() * Math.max( 1, pool.length ) ),
					rot: 0,
					c: Math.floor( Math.random() * palOf( p ).colors.length ),
				} );
				selected = 100000 + id;
				tab = 'elements';
			},
			'',
			true
		);
	}
	function preserveLocked( p ) {
		const locked = cellElements( p ).filter( ( e ) => e.locked );
		p.moved = locked.map( ( e ) => ( { ...e } ) );
		p.added = p.added.filter( ( a ) =>
			locked.some( ( e ) => e.i === 100000 + a.id )
		);
		p.removed = [];
	}
	function randomize( mode = 'pattern' ) {
		change(
			() => {
				design = randomizeDesign( design, { mode, active, locks } );
				active = Math.min( active, design.layers.length - 1 );
				selected = null;
			},
			'',
			true
		);
	}
	function stampControls( body, p ) {
		const eligible = ( editor.state.layers || [] ).filter(
				( l ) => l.id !== layer?.id && l.visible !== false
			),
			sources = eligible.map( ( l ) => [ l.id, l.name || l.type ] );
		const select = choose(
			body,
			'Source layer',
			[ [ '', 'Choose a layer' ], ...sources ],
			sources.some( ( [ id ] ) => id === editor.state.activeId )
				? editor.state.activeId
				: '',
			() => {}
		);
		const capture = button( body, 'Add layer stamp', async () => {
			if ( ! select.value || p.stamps.length >= 6 ) return;
			capture.disabled = true;
			try {
				const all = editor.state.layers || [],
					source = all.find( ( l ) => l.id === select.value ),
					ids = new Set( [ source.id ] );
				let grew = true;
				while ( grew ) {
					grew = false;
					for ( const l of all )
						if (
							l.parent &&
							ids.has( l.parent ) &&
							! ids.has( l.id )
						) {
							ids.add( l.id );
							grew = true;
						}
				}
				const members = all.filter( ( l ) => ids.has( l.id ) ),
					bounds = members
						.filter(
							( l ) =>
								l.type !== 'group' &&
								Number.isFinite( l.x ) &&
								Number.isFinite( l.y ) &&
								Number.isFinite( l.w ) &&
								Number.isFinite( l.h )
						)
						.map( ( l ) => {
							const a = ( ( l.rot || 0 ) * Math.PI ) / 180,
								w =
									Math.abs( Math.cos( a ) * l.w ) +
									Math.abs( Math.sin( a ) * l.h ),
								h =
									Math.abs( Math.sin( a ) * l.w ) +
									Math.abs( Math.cos( a ) * l.h );
							return {
								x: l.x + l.w / 2 - w / 2,
								y: l.y + l.h / 2 - h / 2,
								w,
								h,
							};
						} );
				if ( ! bounds.length ) throw Error( 'bounds' );
				const x = Math.min( ...bounds.map( ( b ) => b.x ) ),
					y = Math.min( ...bounds.map( ( b ) => b.y ) ),
					w = Math.max(
						2,
						Math.max( ...bounds.map( ( b ) => b.x + b.w ) ) - x
					),
					h = Math.max(
						2,
						Math.max( ...bounds.map( ( b ) => b.y + b.h ) ) - y
					);
				const canvas = await bridge.raster.renderToCanvas(
					editor.state.doc,
					members,
					{
						viewport: { x, y, w, h },
						scale: Math.min( 4, 512 / Math.max( w, h ) ),
						cache: bridge.raster.sharedImageCache,
					}
				);
				if ( closed || ! design.layers.includes( p ) ) return;
				checkpoint();
				p.stamps.push( {
					name: source.name || t( 'Stamp' ),
					data: canvas.toDataURL( 'image/png' ),
					aspect: canvas.height / canvas.width,
				} );
				p.stampData = '';
				p.glyphWeights = [];
				resetEdits( p );
				await ensureStamps( design );
				sync();
			} catch {
				status( 'Could not capture the selected layer.' );
			} finally {
				capture.disabled = false;
			}
		} );
		capture.disabled = p.stamps.length >= 6;
		p.stamps.forEach( ( s, i ) => {
			const r = el( 'div', 'wpiepg-stamprow', body ),
				img = el( 'img', 'wpiepg-stampthumb', r );
			img.src = s.data;
			img.alt = s.name;
			el( 'span', '', r, s.name );
			button(
				r,
				'×',
				() =>
					change(
						() => {
							p.stamps.splice( i, 1 );
							p.glyphWeights = [];
							resetEdits( p );
						},
						'',
						true
					),
				'dsm-mini'
			).setAttribute(
				'aria-label',
				t( 'Remove stamp' ) + ' ' + ( i + 1 )
			);
		} );
		if ( ! p.stamps.length && ! p.stampData )
			el(
				'div',
				'dsm-note',
				body,
				t( 'Add up to six source layers and adjust their frequency.' )
			);
	}

	// Coordinates and hit testing share the repeat transforms with the renderer.
	const position = ( e ) => {
		const rect = canvas.getBoundingClientRect();
		return {
			x:
				( e.clientX - rect.left - paintInfo.x ) /
				( paintInfo.unit * design.aspect ),
			y: ( e.clientY - rect.top - paintInfo.y ) / paintInfo.unit,
		};
	};
	function nearest( pos ) {
		const { cols, rows } = paintInfo;
		let best = null,
			distance = Infinity;
		for ( const e of elementsInTile( {
			...current(),
			repeat: design.repeat,
		} ) ) {
			const dx = Math.abs( wrap( pos.x / cols ) * cols - e.x ),
				dy = Math.abs( wrap( pos.y / rows ) * rows - e.y ),
				d = Math.hypot(
					Math.min( dx, cols - dx ),
					Math.min( dy, rows - dy )
				);
			if ( d < Math.max( 0.055, e.s * 0.65 ) && d < distance ) {
				best = e;
				distance = d;
			}
		}
		return best;
	}
	let drag = null;
	canvas.onpointerdown = ( e ) => {
		if ( e.button !== 0 || ! paintInfo ) return;
		const pos = position( e ),
			p = current();
		if (
			single &&
			( pos.x < 0 ||
				pos.y < 0 ||
				pos.x >= paintInfo.cols ||
				pos.y >= paintInfo.rows )
		)
			return;
		if ( [ 'scatter', 'terrazzo' ].includes( p.motif ) ) {
			const hit = nearest( pos );
			selected = hit?.i ?? null;
			if ( hit ) {
				tab = 'elements';
				renderControls();
				const base = selectedElement();
				if ( ! base.locked ) {
					checkpoint();
					drag = { pos, base: clone( base ), hit };
				}
			}
			queue();
		} else {
			checkpoint();
			drag = { pos, shift: clone( p.shift ) };
		}
		if ( drag ) {
			canvas.setPointerCapture( e.pointerId );
			canvas.style.cursor = 'grabbing';
		}
	};
	canvas.onpointermove = ( e ) => {
		if ( ! drag ) return;
		const pos = position( e ),
			p = current(),
			dx = pos.x - drag.pos.x,
			dy = pos.y - drag.pos.y;
		if ( drag.base ) {
			const a = drag.hit.angle || 0,
				rx =
					( dx * Math.cos( a ) + dy * Math.sin( a ) ) *
					( drag.hit.fx ? -1 : 1 ),
				ry =
					( -dx * Math.sin( a ) + dy * Math.cos( a ) ) *
					( drag.hit.fy ? -1 : 1 );
			patchElement(
				p,
				drag.base.i,
				wrapCellPoint( design, {
					x: drag.base.x + rx,
					y: drag.base.y + ry,
				} )
			);
		} else
			p.shift = {
				x: wrap( drag.shift.x + dx + 0.5 ) - 0.5,
				y: wrap( drag.shift.y + dy + 0.5 ) - 0.5,
			};
		dirty = true;
		queue();
	};
	const endDrag = () => {
		drag = null;
		canvas.style.cursor = 'grab';
	};
	canvas.onpointerup = endDrag;
	canvas.onpointercancel = endDrag;
	canvas.addEventListener(
		'wheel',
		( e ) => {
			e.preventDefault();
			zoom = clamp( zoom * ( e.deltaY < 0 ? 1.08 : 1 / 1.08 ), 0.3, 4 );
			queue();
		},
		{ passive: false }
	);
	const menu = el( 'div', 'wpiepg-menu', view );
	menu.hidden = true;
	button( menu, 'Add element', () => {
		const p = cellPointAtTile(
			{ ...current(), repeat: design.repeat },
			menu._pos
		);
		addElement( p.x, p.y );
		menu.hidden = true;
	} );
	button( menu, 'Remove element', () => {
		removeSelected();
		menu.hidden = true;
	} );
	canvas.oncontextmenu = ( e ) => {
		e.preventDefault();
		if ( ! [ 'scatter', 'terrazzo' ].includes( current().motif ) ) return;
		menu._pos = position( e );
		selected = nearest( menu._pos )?.i ?? null;
		const b = view.getBoundingClientRect();
		menu.style.left = Math.min( e.clientX - b.left, b.width - 205 ) + 'px';
		menu.style.top = Math.min( e.clientY - b.top, b.height - 90 ) + 'px';
		menu.hidden = false;
		queue();
	};
	onOutside = ( e ) => {
		if ( ! menu.contains( e.target ) ) menu.hidden = true;
	};
	document.addEventListener( 'pointerdown', onOutside );
	onKey = ( e ) => {
		if (
			closed ||
			! modal.dialog.contains( e.target ) ||
			e.target.closest( 'input,select,textarea,[contenteditable="true"]' )
		)
			return;
		if ( ( e.ctrlKey || e.metaKey ) && e.key.toLowerCase() === 'z' ) {
			e.preventDefault();
			e.stopPropagation();
			if ( e.shiftKey ) stateHistory.redo();
			else stateHistory.undo();
			updateHistory();
		} else if ( e.key === 'Delete' || e.key === 'Backspace' ) {
			e.preventDefault();
			removeSelected();
		}
	};
	modal.dialog.addEventListener( 'keydown', onKey );
	resize = new ResizeObserver( queue );
	resize.observe( view );
	function sync() {
		if ( closed ) return;
		dirty = true;
		renderLayers();
		renderControls();
		updateHistory();
		updateRandomControls();
		queue();
	}
	function setBusy( value ) {
		busy = value;
		applyBtn.disabled = value;
	}
	async function outputTile() {
		await ensureStamps( design );
		return renderTile( design, design.cellPx );
	}
	async function download( format ) {
		if ( busy ) return;
		setBusy( true );
		try {
			await ensureStamps( design );
			const blob =
				format === 'svg'
					? new Blob( [ toSvgTile( design, design.cellPx ) ], {
							type: 'image/svg+xml',
					  } )
					: await new Promise( ( resolve ) =>
							renderTile( design, design.cellPx ).toBlob(
								resolve,
								'image/png'
							)
					  );
			if ( ! blob ) throw Error( 'empty' );
			const href = URL.createObjectURL( blob ),
				a = document.createElement( 'a' );
			a.href = href;
			a.download = 'seamless-pattern.' + format;
			a.click();
			setTimeout( () => URL.revokeObjectURL( href ), 4000 );
		} catch {
			status( 'Could not export the pattern.' );
		} finally {
			setBusy( false );
		}
	}
	async function insert() {
		if ( busy ) return;
		setBusy( true );
		try {
			const output = await outputTile(),
				url = output.toDataURL( 'image/png' );
			await bridge.raster.registerUserTile?.( url );
			if ( closed ) return;
			const generator = { id: GEN_ID, params: clone( design ) },
				name = ( favoriteName.value || 'Seamless Patterns' ).slice(
					0,
					60
				);
			if ( editing ) {
				editor.dispatch( {
					type: 'UPDATE_LAYER',
					id: layer.id,
					patch: {
						patternData: url,
						pattern: 'custom',
						fillType: 'pattern',
						generator,
					},
				} );
				editor.commit( t( 'Update pattern' ) );
			} else {
				const added = bridge.documents.makeShape( {
					name,
					shape: 'rect',
					x: 0,
					y: 0,
					w: editor.state.doc.w,
					h: editor.state.doc.h,
					fill: '#ffffff',
					fillType: 'pattern',
					pattern: 'custom',
					patternData: url,
				} );
				added.generator = generator;
				editor.dispatch( { type: 'ADD_LAYER', layer: added } );
				editor.commit( 'Seamless Patterns' );
			}
			close();
		} catch {
			status( 'Could not insert the pattern.' );
		} finally {
			setBusy( false );
		}
	}
	function dispose() {
		if ( closed ) return;
		closed = true;
		previewEpoch++;
		if ( raf ) cancelAnimationFrame( raf );
		thumbObserver?.disconnect();
		clearColorHandles();
		resize?.disconnect();
		document.removeEventListener( 'pointerdown', onOutside );
		modal.dialog.removeEventListener( 'keydown', onKey );
		if ( window.__wpiePattern?.canvas === canvas )
			delete window.__wpiePattern;
	}
	function close() {
		dispose();
		modal.close();
	}
	renderGallery();
	await ensureStamps( design );
	if ( closed ) return;
	sync();
	if ( window.__wpieQA )
		window.__wpiePattern = {
			params: () => clone( design ),
			preview: () => ( { ...paintInfo } ),
			active: () => active,
			selectLayer: ( i ) => {
				active = i;
				sync();
			},
			apply: applyDesign,
			canvas,
			tile: outputTile,
			svg: () => toSvgTile( design, design.cellPx ),
			busy: () => busy,
		};
}
function register( api ) {
	api.registerGenerator( {
		id: GEN_ID,
		label: 'Seamless Patterns',
		run: openStudio,
		edit: openStudio,
	} );
}
if ( window.WPIE?.api ) register( window.WPIE.api );
else
	window.wp.hooks.addAction(
		'wpie.ready',
		'wpie-pattern-generator',
		register
	);
