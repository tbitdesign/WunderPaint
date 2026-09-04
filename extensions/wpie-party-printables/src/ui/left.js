/** Left column: the chosen item with a picker, and the starters filtered by occasion. */
import { ITEMS, ITEM_GROUPS } from '../items.js';
import { STARTERS } from '../starters.js';
import { OCCASIONS } from '../engine/theme.js';
import { ICONS } from './icons.js';

export function buildLeft( left, { S, ui, t, modal, onItem, onStarter } ) {
	const itemCard = ui.section( left, {
		icon: ICONS.item,
		title: t( 'Item' ),
	} );
	const current = ui.el( 'div', 'wpiepp-current', itemCard );
	const pickBtn = ui.btn( itemCard, {
		label: t( 'Choose item' ),
		onClick: () => togglePicker(),
	} );
	pickBtn.classList.add( 'wpiepp-pick' );

	const startersCard = ui.section( left, {
		icon: ICONS.starters,
		title: t( 'Starters' ),
	} );
	const filterHost = ui.el( 'div', 'wpiepp-filter', startersCard );
	ui.select( filterHost, {
		options: [
			{ value: 'all', label: t( 'All occasions' ) },
			...OCCASIONS.map( ( o ) => ( {
				value: o.id,
				label: t( o.label ),
			} ) ),
		],
		value: S.filter || 'all',
		onChange: ( v ) => {
			S.filter = v;
			renderStarters();
		},
	} );
	const starters = ui.el( 'div', 'wpiepp-starters', startersCard );

	/* ------------------------------ picker ------------------------------ */
	let picker = null;
	let onDown = null;
	let onKey = null;
	function ensurePicker() {
		if ( picker ) {
			return;
		}
		picker = document.createElement( 'div' );
		picker.className = 'wpiepp-picker';
		picker.hidden = true;
		for ( const g of ITEM_GROUPS ) {
			const members = Object.entries( ITEMS ).filter(
				( [ , def ] ) => def.group === g.id
			);
			if ( ! members.length ) {
				continue;
			}
			const head = ui.el( 'div', 'dsm-card-head', picker );
			head.innerHTML = '<span></span>';
			head.querySelector( 'span' ).textContent = t( g.label );
			const grid = ui.el( 'div', 'wpiepp-grid', picker );
			for ( const [ type, def ] of members ) {
				const b = ui.el( 'button', 'wpiepp-tile', grid );
				b.type = 'button';
				b.dataset.type = type;
				b.title = t( def.hint );
				b.innerHTML =
					'<span class="wpiepp-tile-ic">' +
					( ICONS[ type ] || ICONS.item ) +
					'</span><span class="wpiepp-tile-name"></span>';
				b.querySelector( '.wpiepp-tile-name' ).textContent = t(
					def.label
				);
				b.onclick = () => {
					closePicker();
					onItem( type );
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
		const r = pickBtn.getBoundingClientRect();
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
			if ( ! picker.contains( e.target ) && e.target !== pickBtn ) {
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

	function renderCurrent() {
		const def = ITEMS[ S.params.item.type ] || ITEMS.bunting;
		current.innerHTML = '';
		const ic = ui.el( 'span', 'wpiepp-current-ic', current );
		ic.innerHTML = ICONS[ def.id ] || ICONS.item;
		const main = ui.el( 'div', 'wpiepp-current-main', current );
		ui.el( 'b', null, main, t( def.label ) );
		ui.el( 'small', null, main, t( def.hint ) );
	}

	function renderStarters() {
		starters.innerHTML = '';
		const f = S.filter || 'all';
		for ( const s of STARTERS ) {
			const occ = s.params.theme && s.params.theme.occasion;
			if ( 'all' !== f && occ !== f ) {
				continue;
			}
			const b = ui.el( 'button', 'wpiepp-starter', starters );
			b.type = 'button';
			b.dataset.id = s.id;
			b.classList.toggle( 'is-on', S.starter === s.id );
			b.innerHTML = '<b></b><small></small>';
			b.querySelector( 'b' ).textContent = s.name;
			b.querySelector( 'small' ).textContent = s.subtitle;
			b.onclick = () => onStarter( s.id );
		}
	}

	function refresh() {
		renderCurrent();
		renderStarters();
	}

	return { refresh, closePicker };
}
