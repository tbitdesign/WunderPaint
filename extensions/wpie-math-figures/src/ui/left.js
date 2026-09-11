/** Left column: the figure's blocks, the starters, the selected block's material. */
import { BLOCKS, BLOCK_GROUPS, blockSnippet } from '../blocks.js';
import { STARTERS, STARTER_GROUPS, groupOf } from '../starters.js';
import { ICONS } from './icons.js';

export function buildLeft(
	left,
	{ S, ui, t, onSelect, onAdd, onRemove, onMove, onStarter }
) {
	const figCard = ui.section( left, {
		icon: ICONS.blocks,
		title: t( 'Figure' ),
	} );
	const list = ui.el( 'div', 'wpiemf-blocks', figCard );

	// The block catalog (v0.5): cards with a subtitle in the column, the
	// way the starters already read - a click adds the block. The popover
	// picker this replaces was a second surface to learn for one job.
	const typesCard = ui.section( left, {
		icon: ICONS.add,
		title: t( 'Blocks' ),
	} );
	// The kit draws the filter pills and the cards (bridge.ui, API 2.23);
	// the wpiemf- classes stay on as hooks for this pack's own selectors.
	const typeChips = ui.pills( typesCard, 'wpiemf-chips' );
	const chipEls = {};
	for ( const g of [ { id: 'all', label: 'All blocks' }, ...BLOCK_GROUPS ] ) {
		const chip = ui.pill( typeChips, {
			label: t( g.label ),
			cls: 'wpiemf-chip',
			onClick: () => {
				S.blockFilter = g.id;
				renderTypes();
			},
		} );
		chip.dataset.group = g.id;
		chipEls[ g.id ] = chip;
	}
	const types = ui.picklist( typesCard, 'wpiemf-types' );
	function renderTypes() {
		const f = S.blockFilter || 'all';
		for ( const id of Object.keys( chipEls ) ) {
			ui.pressed( chipEls[ id ], id === f );
		}
		types.innerHTML = '';
		for ( const [ type, def ] of Object.entries( BLOCKS ) ) {
			if ( 'all' !== f && def.group !== f ) {
				continue;
			}
			const card = ui.pickrow( types, {
				title: t( def.label ),
				text: t( def.hint ),
				icon: ICONS[ type ] || ICONS.formula,
				cls: 'wpiemf-type',
				onClick: () => onAdd( type ),
			} );
			card.node.dataset.type = type;
		}
	}
	renderTypes();

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

	/* ---------------------------- block list ---------------------------- */
	function renderBlocks() {
		list.innerHTML = '';
		const blocks = S.params.blocks;
		blocks.forEach( ( b, i ) => {
			const def = BLOCKS[ b.type ];
			const row = ui.el( 'div', 'dsm-listrow wpiemf-block', list );
			row.dataset.id = b.id;
			row.classList.toggle( 'is-on', b.id === selected().id );
			const ic = ui.el( 'span', 'wpiemf-block-ic', row );
			ic.innerHTML = ICONS[ b.type ] || ICONS.formula;
			const main = ui.el( 'div', 'wpiemf-block-main', row );
			ui.el( 'b', null, main, t( def.label ) );
			ui.el( 'small', null, main, blockSnippet( b ) || t( def.hint ) );
			const acts = ui.el( 'div', 'wpiemf-block-acts', row );
			const act = ( key, icon, title, disabled, fn ) => {
				const btn = ui.el( 'button', 'dsm-mini wpiemf-block-btn', acts );
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
			const b = ui.el( 'button', 'dsm-listrow wpiemf-starter', starters );
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

	return { refresh, renderBlocks, unmountAll };
}
