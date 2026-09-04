/** Left column: the figure's blocks, the starters, the selected block's material. */
import { BLOCKS, BLOCK_GROUPS, blockSnippet } from '../blocks.js';
import { STARTERS, STARTER_GROUPS, groupOf } from '../starters.js';
import { ICONS } from './icons.js';

export function buildLeft(
	left,
	{ S, ui, t, modal, onSelect, onAdd, onRemove, onMove, onStarter }
) {
	const figCard = ui.section( left, {
		icon: ICONS.blocks,
		title: t( 'Figure' ),
	} );
	const list = ui.el( 'div', 'wpiemf-blocks', figCard );
	const addBtn = ui.btn( figCard, {
		label: t( 'Add block' ),
		onClick: () => togglePicker(),
	} );
	addBtn.classList.add( 'wpiemf-add' );

	const startersCard = ui.section( left, {
		icon: ICONS.starters,
		title: t( 'Starters' ),
	} );
	const filterHost = ui.el( 'div', 'wpiemf-filter', startersCard );
	ui.select( filterHost, {
		options: [
			{ value: 'all', label: t( 'All starters' ) },
			...STARTER_GROUPS.map( ( g ) => ( {
				value: g.id,
				label: t( g.label ),
			} ) ),
		],
		value: S.filter || 'all',
		onChange: ( v ) => {
			S.filter = v;
			renderStarters();
		},
	} );
	const starters = ui.el( 'div', 'wpiemf-starters', startersCard );

	const selected = () =>
		S.params.blocks.find( ( b ) => b.id === S.blockId ) ||
		S.params.blocks[ 0 ];

	/* ------------------------------ picker ------------------------------ */
	let picker = null;
	let onDown = null;
	let onKey = null;
	function ensurePicker() {
		if ( picker ) {
			return;
		}
		picker = document.createElement( 'div' );
		picker.className = 'wpiemf-picker';
		picker.hidden = true;
		for ( const g of BLOCK_GROUPS ) {
			const head = ui.el( 'div', 'dsm-card-head', picker );
			head.innerHTML = '<span></span>';
			head.querySelector( 'span' ).textContent = t( g.label );
			const grid = ui.el( 'div', 'wpiemf-grid', picker );
			for ( const [ type, def ] of Object.entries( BLOCKS ) ) {
				if ( def.group !== g.id ) {
					continue;
				}
				const b = ui.el( 'button', 'wpiemf-tile', grid );
				b.type = 'button';
				b.dataset.type = type;
				b.title = t( def.hint );
				b.innerHTML =
					'<span class="wpiemf-tile-ic">' +
					( ICONS[ type ] || ICONS.formula ) +
					'</span><span class="wpiemf-tile-name"></span>';
				b.querySelector( '.wpiemf-tile-name' ).textContent = t(
					def.label
				);
				b.onclick = () => {
					closePicker();
					onAdd( type );
				};
			}
		}
		( modal.backdrop || document.body ).appendChild( picker );
	}
	function togglePicker() {
		ensurePicker();
		if ( ! picker.hidden ) {
			closePicker();
			return;
		}
		picker.hidden = false;
		const r = addBtn.getBoundingClientRect();
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const pw = picker.offsetWidth;
		const ph = picker.offsetHeight;
		let top = r.bottom + 6;
		if ( top + ph > vh - 8 ) {
			top = Math.max( 8, r.top - ph - 6 );
		}
		picker.style.left =
			Math.max( 8, Math.min( r.left, vw - pw - 8 ) ) + 'px';
		picker.style.top = top + 'px';
		onDown = ( e ) => {
			if ( ! picker.contains( e.target ) && e.target !== addBtn ) {
				closePicker();
			}
		};
		onKey = ( e ) => {
			if ( 'Escape' === e.key ) {
				e.stopImmediatePropagation();
				closePicker();
			}
		};
		document.addEventListener( 'pointerdown', onDown, true );
		document.addEventListener( 'keydown', onKey, true );
	}
	function closePicker() {
		if ( ! picker || picker.hidden ) {
			return;
		}
		picker.hidden = true;
		document.removeEventListener( 'pointerdown', onDown, true );
		document.removeEventListener( 'keydown', onKey, true );
	}

	/* ---------------------------- block list ---------------------------- */
	function renderBlocks() {
		list.innerHTML = '';
		const blocks = S.params.blocks;
		blocks.forEach( ( b, i ) => {
			const def = BLOCKS[ b.type ];
			const row = ui.el( 'div', 'wpiemf-block', list );
			row.dataset.id = b.id;
			row.classList.toggle( 'is-on', b.id === selected().id );
			const ic = ui.el( 'span', 'wpiemf-block-ic', row );
			ic.innerHTML = ICONS[ b.type ] || ICONS.formula;
			const main = ui.el( 'div', 'wpiemf-block-main', row );
			ui.el( 'b', null, main, t( def.label ) );
			ui.el( 'small', null, main, blockSnippet( b ) || t( def.hint ) );
			const acts = ui.el( 'div', 'wpiemf-block-acts', row );
			const act = ( key, icon, title, disabled, fn ) => {
				const btn = ui.el( 'button', 'wpiemf-block-btn', acts );
				btn.type = 'button';
				btn.dataset.act = key;
				btn.title = title;
				btn.innerHTML = icon;
				btn.disabled = disabled;
				btn.onclick = ( e ) => {
					e.stopPropagation();
					fn();
				};
			};
			act( 'up', ICONS.up, t( 'Move up' ), 0 === i, () =>
				onMove( b.id, -1 )
			);
			act(
				'down',
				ICONS.down,
				t( 'Move down' ),
				i === blocks.length - 1,
				() => onMove( b.id, 1 )
			);
			act(
				'remove',
				ICONS.remove,
				t( 'Remove block' ),
				blocks.length <= 1,
				() => onRemove( b.id )
			);
			row.onclick = () => onSelect( b.id );
		} );
	}

	/* ----------------------------- starters ----------------------------- */
	function renderStarters() {
		starters.innerHTML = '';
		const f = S.filter || 'all';
		for ( const s of STARTERS ) {
			if ( 'all' !== f && groupOf( s ) !== f ) {
				continue;
			}
			const b = ui.el( 'button', 'wpiemf-starter', starters );
			b.type = 'button';
			b.dataset.id = s.id;
			b.classList.toggle( 'is-on', S.starter === s.id );
			b.innerHTML = '<b></b><small></small>';
			b.querySelector( 'b' ).textContent = s.name;
			b.querySelector( 'small' ).textContent = s.subtitle;
			b.onclick = () => onStarter( s.id );
		}
	}

	function unmountAll() {}

	function refresh() {
		renderBlocks();
		renderStarters();
	}

	return { refresh, renderBlocks, unmountAll, closePicker };
}
