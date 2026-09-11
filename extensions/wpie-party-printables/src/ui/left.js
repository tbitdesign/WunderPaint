/** Left column: the chosen item with a picker, and the starters filtered by occasion. */
import { ITEMS, ITEM_GROUPS } from '../items.js';
import { STARTERS } from '../starters.js';
import { OCCASIONS } from '../engine/theme.js';
import { ICONS } from './icons.js';

export function buildLeft( left, { S, ui, t, onItem, onStarter } ) {
	// The item catalog (v3.4): group chips over cards with a subtitle in
	// the column, the chosen one lit - the way the starters already read.
	// The popover picker this replaces was a second surface for one job.
	const itemCard = ui.section( left, {
		icon: ICONS.item,
		title: t( 'Items' ),
	} );
	const chips = ui.el( 'div', 'dsm-pills wpiepp-chips', itemCard );
	const chipEls = {};
	for ( const g of [ { id: 'all', label: 'All items' }, ...ITEM_GROUPS ] ) {
		const chip = ui.el( 'button', 'dsm-pill wpiepp-chip', chips, t( g.label ) );
		chip.type = 'button';
		chip.dataset.group = g.id;
		chip.onclick = () => {
			S.itemFilter = g.id;
			renderItems();
		};
		chipEls[ g.id ] = chip;
	}
	const items = ui.el( 'div', 'wpiepp-items', itemCard );

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

	function renderItems() {
		const f = S.itemFilter || 'all';
		const chosen = ( ITEMS[ S.params.item.type ] || ITEMS.bunting ).id;
		for ( const id of Object.keys( chipEls ) ) {
			chipEls[ id ].classList.toggle( 'is-active', id === f );
		}
		items.innerHTML = '';
		for ( const [ type, def ] of Object.entries( ITEMS ) ) {
			if ( 'all' !== f && def.group !== f ) {
				continue;
			}
			const b = ui.el( 'button', 'dsm-pickrow wpiepp-item', items );
			b.type = 'button';
			b.dataset.type = type;
			b.classList.toggle( 'is-on', type === chosen );
			const ic = ui.el( 'span', 'dsm-pickrow-icon wpiepp-item-ic', b );
			ic.innerHTML = ICONS[ def.id ] || ICONS.item;
			const main = ui.el( 'div', 'dsm-pickrow-text wpiepp-item-main', b );
			ui.el( 'b', null, main, t( def.label ) );
			ui.el( 'small', null, main, t( def.hint ) );
			b.onclick = () => onItem( type );
		}
	}

	function renderStarters() {
		starters.innerHTML = '';
		const f = S.filter || 'all';
		for ( const s of STARTERS ) {
			const occ = s.params.theme && s.params.theme.occasion;
			if ( 'all' !== f && occ !== f ) {
				continue;
			}
			const b = ui.el( 'button', 'dsm-listrow wpiepp-starter', starters );
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
		renderItems();
		renderStarters();
	}

	return { refresh };
}
