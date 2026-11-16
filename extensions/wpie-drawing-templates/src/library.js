import { ALL_MODES, PRESETS } from './practice-catalog.js';
import { MOTIFS } from './motifs.js';

const svg = ( path ) =>
	`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${ path }"/></svg>`;
const ICONS = {
	Foundations: 'M3 18Q8 2 12 12T21 6 M3 21h18',
	'Tone and texture':
		'M4 4h16v16H4z M4 12l8-8 M4 18L18 4 M10 20L20 10 M16 20l4-4',
	'Lettering and ornament': 'M4 20L11 4h2l7 16 M7 14h10',
	Observation:
		'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12 M9 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0',
	'Color and codes': 'M5 3v18 M13 3v18 M2 8h15 M2 16h15 M19 14l3 3-3 3',
	Woodland: 'M4 7l2-5 5 4h2l5-4 2 5-2 11-6 4-6-4z M8 11h1 M15 11h1 M10 16h4',
	'Ocean life': 'M3 12c5-9 12-9 15 0-3 9-10 9-15 0z M18 12l4-5v10z M7 11h.1',
	'Birds and insects':
		'M12 20V6 M12 12C0 0 0 17 12 15 0 24 2 9 12 12 M12 12C24 0 24 17 12 15 24 24 22 9 12 12',
	Botanical: 'M5 21L18 4 M7 18C0 8 8 2 21 3c0 13-6 19-14 15z',
	Garden: 'M5 13c-6-12 9-12 7-1 3-9 15-10 8 4-5 11-8 2-10 5-2 1-4-2-5-8 M12 9V3l5-1',
	'Little buildings': 'M3 11l9-8 9 8 M5 10v11h14V10 M10 21v-7h4v7',
	Journeys: 'M3 15V9l4-5h10l4 5v6H3z M6 15v4 M18 15v4 M6 11h.1 M18 11h.1',
	Seasons: 'M12 2v20 M3 7l18 10 M3 17L21 7 M8 4l4 4 4-4 M8 20l4-4 4 4',
	'Farm animals':
		'M4 10l3-4 3 3h4l3-3 3 4v6a5 5 0 0 1-5 5h-6a5 5 0 0 1-5-5z M9 16h6',
	Safari: 'M3 20h18 M6 20V9 M4 9h4 M14 20l1-6h3l1 6 M16 14V6 M14 6h4 M15 4h2',
	Pets: 'M12 21c-4 0-7-3-6-7 1-3 4-3 6-1 2-2 5-2 6 1 1 4-2 7-6 7z M7 8a1.5 1.5 0 1 0 0.1 0 M17 8a1.5 1.5 0 1 0 0.1 0 M10 5a1.5 1.5 0 1 0 0.1 0 M14 5a1.5 1.5 0 1 0 0.1 0',
	Dinosaurs:
		'M3 18q3-1 5-5l2-6q2-3 5-2l3 2-3 2v4l3 5 M9 18v3 M14 18v3 M3 18h15',
	Treats: 'M6 11a6 6 0 0 1 12 0z M7 11l2 10h6l2-10 M12 5V3',
	'At home': 'M5 21V11h14v10 M8 11V7a4 4 0 0 1 8 0v4 M5 15h14',
	Space: 'M12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0 M2 14c4 3 16 3 20-4',
	'Music and play':
		'M9 18V5l11-2v13 M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3z M20 16a3 3 0 1 1-3-3 3 3 0 0 1 3 3z',
};

export function mountLibrary( { parent, ui, t, asset, params, choose } ) {
	const el = ( tag, cls, host, value ) => {
		const node = document.createElement( tag );
		node.className = cls || '';
		if ( value !== undefined ) node.textContent = value;
		host.appendChild( node );
		return node;
	};
	const tabs = el( 'div', 'wpiedrw-tabs', parent );
	tabs.setAttribute( 'role', 'group' );
	tabs.setAttribute( 'aria-label', t( 'Library' ) );
	const bar = el( 'div', 'wpiedrw-library-tools', parent );
	const search = el( 'input', 'dsm-input', bar );
	search.type = 'search';
	search.placeholder = t( 'Search templates and motifs' );
	search.setAttribute( 'aria-label', search.placeholder );
	const category = el( 'select', 'dsm-select', bar );
	category.setAttribute( 'aria-label', t( 'Category' ) );
	const random = el(
		'button',
		'ai-btn secondary',
		bar,
		t( 'Random in category' )
	);
	random.type = 'button';
	const result = el( 'div', 'dsm-note', bar );
	result.setAttribute( 'role', 'status' );
	const content = el( 'div', 'wpiedrw-library-content', parent );
	let tab = 'templates',
		selectedPreset = '',
		visible = [],
		cards = [];
	const data = () =>
		tab === 'motifs' ? MOTIFS : tab === 'presets' ? PRESETS : ALL_MODES;
	const tabButtons = new Map();
	const apply = ( entry ) => {
		selectedPreset = tab === 'presets' ? entry.id : '';
		choose(
			tab === 'motifs'
				? {
						source: 'motif',
						motif: entry.id,
						...( ! ALL_MODES.find( ( m ) => m.id === params.mode )
							?.source && params.mode !== 'construction'
							? { mode: 'coloring' }
							: {} ),
				  }
				: tab === 'presets'
				? entry.params
				: {
						mode: entry.id,
						practiceVariant: 0,
						...( entry.id === 'construction'
							? { source: 'motif' }
							: {} ),
				  }
		);
		sync();
	};
	function sync() {
		for ( const [ id, button ] of tabButtons )
			button.setAttribute( 'aria-pressed', String( tab === id ) );
		for ( const [ entry, card ] of cards )
			ui.pressed(
				card,
				tab === 'motifs'
					? params.source === 'motif' && params.motif === entry.id
					: tab === 'presets'
					? selectedPreset === entry.id && params.mode === entry.mode
					: params.mode === entry.id
			);
	}
	function render() {
		content.replaceChildren();
		cards = [];
		const query = search.value.trim().toLocaleLowerCase();
		visible = data().filter(
			( m ) =>
				( ! category.value || m.category === category.value ) &&
				( t( m.label ) + ' ' + t( m.category ) )
					.toLocaleLowerCase()
					.includes( query )
		);
		result.textContent = `${ visible.length } / ${ data().length }`;
		random.disabled = ! visible.length;
		if ( ! visible.length )
			el(
				'div',
				'dsm-note wpiedrw-no-results',
				content,
				t( 'No matching entries.' )
			);
		for ( const name of [
			...new Set( visible.map( ( m ) => m.category ) ),
		] ) {
			const body = ui.section( content, {
				title: t( name ),
				icon: svg( ICONS[ name ] || ICONS.Foundations ),
			} );
			const grid = ui.picks( body, { cell: 110, cls: 'wpiedrw-cards' } );
			for ( const entry of visible.filter(
				( m ) => m.category === name
			) ) {
				const thumb = document.createElement( 'img' );
				thumb.src = asset( `${ tab }/${ entry.id }.png` );
				thumb.alt = '';
				thumb.loading = 'lazy';
				thumb.width = 264;
				thumb.height = 184;
				const { node } = ui.pick( grid, {
					label: t( entry.label ),
					thumb,
					cls: 'wpiedrw-tcard',
					onClick: () => apply( entry ),
				} );
				node.dataset[
					tab === 'templates'
						? 'mode'
						: tab === 'motifs'
						? 'motif'
						: 'preset'
				] = entry.id;
				cards.push( [ entry, node ] );
			}
		}
		sync();
	}
	function open( id ) {
		tab = id;
		search.value = '';
		category.replaceChildren();
		el( 'option', '', category, t( 'All categories' ) ).value = '';
		for ( const name of [
			...new Set( data().map( ( m ) => m.category ) ),
		] )
			el( 'option', '', category, t( name ) ).value = name;
		render();
	}
	for ( const [ id, label ] of [
		[ 'templates', 'Templates' ],
		[ 'presets', 'Presets' ],
		[ 'motifs', 'Motifs' ],
	] ) {
		const button = el( 'button', 'ai-btn secondary', tabs, t( label ) );
		button.type = 'button';
		button.onclick = () => open( id );
		tabButtons.set( id, button );
	}
	search.oninput = render;
	category.onchange = render;
	random.onclick = () => {
		const candidates = visible.filter( ( m ) =>
			tab === 'motifs'
				? m.id !== params.motif
				: tab === 'templates'
				? m.id !== params.mode
				: m.id !== selectedPreset
		);
		const pool = candidates.length ? candidates : visible;
		if ( pool.length )
			apply( pool[ Math.floor( Math.random() * pool.length ) ] );
	};
	open( 'templates' );
	return { sync, open };
}
