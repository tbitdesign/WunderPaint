/** Left column: the sheet types, the starters of the active one, the material. */
import { CARDS } from '../cards.js';
import { STARTERS } from '../starters.js';
import { ICONS } from './icons.js';
import { NOTE_NAMES_SHARP } from '../engine/chords.js';
import { SCALES, ARPEGGIOS, SCALE_LABELS } from '../engine/scales.js';
import { FLASH_CLEFS, FLASH_RANGES, NAME_SYSTEMS } from '../engine/notation.js';
import { ROOTS } from '../engine/workshop.js';

export function buildLeft(
	left,
	{
		S,
		ui,
		bridge,
		t,
		onCard,
		onStarter,
		onChange,
		onImport,
		materialParent,
		previewStarter,
		onRebuild,
	}
) {
	// Use the shared type cards, as in Math Figures, with visible descriptions.
	const typeCard = ui.section( left, {
		icon: ICONS.score,
		title: t( 'Sheet type' ),
	} );
	const list0 = ui.picklist( typeCard, 'wpiesm-cards' );
	const tiles = new Map();
	for ( const c of CARDS ) {
		const card = ui.pickrow( list0, {
			title: t( c.label ),
			text: t( c.hint ),
			icon: ICONS[ c.id ],
			cls: 'wpiesm-card',
			onClick: () => onCard( c.id ),
		} );
		card.node.dataset.card = c.id;
		tiles.set( c.id, card.node );
	}
	const startersCard = ui.section( left, {
		icon: ICONS.starters,
		title: t( 'Starters' ),
	} );
	const list = ui.el( 'div', 'wpiesm-starters', startersCard );
	const search = ui.el( 'input', 'dsm-input wpiesm-search', startersCard );
	search.type = 'search';
	search.placeholder = t( 'Search presets' );
	search.setAttribute( 'aria-label', t( 'Search presets' ) );
	startersCard.insertBefore( search, list );
	const categories = ui.select( startersCard, {
		options: [ { value: '', label: t( 'All categories' ) } ],
		value: '',
	} );
	startersCard.insertBefore( categories, list );
	search.oninput = () => fillStarters();
	categories.onchange = () => fillStarters();
	let observer = null,
		generation = 0;
	const materialCard = ui.section( materialParent || left, {
		icon: ICONS.material,
		title: t( 'Material' ),
	} );
	const material = ui.el( 'div', 'wpiesm-material', materialCard );
	let textarea = null;
	const mounts = [];

	function refresh() {
		for ( const [ id, b ] of tiles ) {
			ui.pressed( b, id === S.card );
		}
		categories.replaceChildren();
		for ( const value of [
			'',
			...new Set( STARTERS.map( ( s ) => s.category || 'Classics' ) ),
		] ) {
			const o = ui.el(
				'option',
				null,
				categories,
				value ? t( value ) : t( 'All categories' )
			);
			o.value = value;
		}
		fillStarters();
		buildMaterial();
	}

	function fillStarters() {
		observer?.disconnect();
		const my = ++generation;
		list.innerHTML = '';
		const query = search.value.trim().toLocaleLowerCase();
		const matches = STARTERS.filter(
			( s ) =>
				( query || s.card === S.card ) &&
				( ! categories.value ||
					( s.category || 'Classics' ) === categories.value ) &&
				( ! query ||
					[ t( s.name ), t( s.subtitle ), s.name, s.category ]
						.join( ' ' )
						.toLocaleLowerCase()
						.includes( query ) )
		);
		let chain = Promise.resolve();
		const schedule = ( img, id ) => {
			chain = chain.then( async () => {
				if ( my !== generation ) return;
				await new Promise( ( ok ) => setTimeout( ok, 24 ) );
				if ( my !== generation ) return;
				try {
					const src = await previewStarter( id );
					if ( my === generation && src ) img.src = src;
				} catch ( e ) {
					img.remove();
				}
			} );
		};
		if ( typeof IntersectionObserver !== 'undefined' )
			observer = new IntersectionObserver(
				( entries ) => {
					for ( const entry of entries )
						if ( entry.isIntersecting ) {
							observer.unobserve( entry.target );
							schedule(
								entry.target,
								entry.target.dataset.starter
							);
						}
				},
				{ root: left, rootMargin: '150px' }
			);
		for ( const s of matches ) {
			const b = ui.el( 'button', 'dsm-listrow wpiesm-starter', list );
			b.type = 'button';
			b.dataset.id = s.id;
			b.classList.toggle( 'is-on', S.starter === s.id );
			b.setAttribute( 'aria-pressed', String( S.starter === s.id ) );
			const image = ui.el( 'img', 'wpiesm-thumb', b );
			image.alt = '';
			image.dataset.starter = s.id;
			image.decoding = 'async';
			ui.el( 'b', null, b, t( s.name ) );
			ui.el( 'small', null, b, t( s.subtitle ) );
			b.onclick = () => onStarter( s.id );
			if ( previewStarter ) {
				if ( observer ) observer.observe( image );
				else schedule( image, s.id );
			}
		}
		if ( ! matches.length )
			ui.el( 'p', 'dsm-note', list, t( 'No matching presets.' ) );
	}

	function unmountAll() {
		while ( mounts.length ) {
			const m = mounts.pop();
			try {
				if ( m.unmount ) {
					m.unmount();
				}
			} catch ( e ) {
				// nothing to release
			}
		}
	}

	function buildMaterial() {
		unmountAll();
		material.innerHTML = '';
		textarea = null;
		const p = S.params;
		materialCard.parentNode.hidden = [
			'melody',
			'rhythm',
			'harmony',
			'lesson',
			'song',
			'worksheet',
			'roadmap',
		].includes( S.card );
		if ( materialCard.parentNode.hidden ) return;
		if ( 'score' === S.card || 'leadsheet' === S.card ) {
			const key = 'score' === S.card ? 'abc' : 'chordpro';
			textarea = ui.el( 'textarea', 'dsm-input wpiesm-text', material );
			textarea.spellcheck = false;
			textarea.value = p[ key ] || '';
			textarea.placeholder =
				'score' === S.card
					? 'X:1\nT:Title\nM:4/4\nL:1/4\nK:C\nC D E F | G2 G2 |'
					: '{title: Song}\n[C]Lyrics with [G]chords';
			textarea.oninput = () => {
				p[ key ] = textarea.value;
				S.starter = null;
				onChange();
			};
			ui.el(
				'div',
				'dsm-note wpiesm-note',
				material,
				'score' === S.card
					? t(
							'ABC notation, or import a MusicXML file from MuseScore.'
					  )
					: t( 'ChordPro, or the chords above the words.' )
			);
			const tools = ui.el( 'div', 'wpiesm-tools', material );
			if ( 'score' === S.card ) {
				ui.btn( tools, {
					label: t( 'Import file' ),
					onClick: () => pickFile(),
				} );
			}
			mountVar(
				tools,
				() => textarea.value,
				( v ) => {
					textarea.value = v;
					p[ key ] = v;
					onChange();
				},
				textarea
			);
		} else if ( 'diagrams' === S.card ) {
			const input = ui.el( 'input', 'dsm-input wpiesm-input', material );
			input.type = 'text';
			input.value = p.chords || '';
			input.placeholder = 'C G Am F';
			input.oninput = () => {
				p.chords = input.value;
				S.starter = null;
				onChange();
			};
			ui.el(
				'div',
				'dsm-note wpiesm-note',
				material,
				t(
					'Chord names separated by spaces, for example C G Am F or Cmaj7 Dm7/G.'
				)
			);
			const tools = ui.el( 'div', 'wpiesm-tools', material );
			mountVar(
				tools,
				() => input.value,
				( v ) => {
					input.value = v;
					p.chords = v;
					onChange();
				},
				input
			);
		} else if ( 'paper' === S.card ) {
			ui.el(
				'div',
				'dsm-note wpiesm-note',
				material,
				t(
					'Clef, key, meter and TAB sit in the Music card; staves, bars and chord grids in the Layout card.'
				)
			);
		} else if ( 'flash' === S.card ) {
			ui.select( ui.row( material, t( 'Topic' ) ), {
				value: p.flash.topic,
				options: [
					{ value: 'notes', label: t( 'Note names' ) },
					{ value: 'intervals', label: t( 'Intervals' ) },
					{ value: 'chords', label: t( 'Chord cards' ) },
					{ value: 'signatures', label: t( 'Key signature cards' ) },
					{ value: 'rhythms', label: t( 'Rhythm cards' ) },
				],
				onChange: ( v ) => {
					p.flash.topic = v;
					buildMaterial();
					onRebuild();
					onChange();
				},
			} );
			if ( p.flash.topic !== 'notes' ) return;
			const sel = ( label, key, opts ) => {
				ui.select( ui.row( material, label ), {
					options: opts.map( ( o ) => ( {
						value: o.value,
						label: t( o.label ),
					} ) ),
					value: p.flash[ key ],
					onChange: ( v ) => {
						p.flash[ key ] = v;
						S.starter = null;
						onChange();
					},
				} );
			};
			sel( t( 'Clef' ), 'clef', FLASH_CLEFS );
			sel( t( 'Range' ), 'range', FLASH_RANGES );
			sel( t( 'Names' ), 'names', NAME_SYSTEMS );
			ui.el(
				'div',
				'dsm-note wpiesm-note',
				material,
				t(
					'Print the fronts, then the backs on the other side; the backs are mirrored per row.'
				)
			);
		} else {
			ui.select( ui.row( material, t( 'Root' ) ), {
				options: [
					...new Set( [ ...ROOTS, ...NOTE_NAMES_SHARP ] ),
				].map( ( n ) => ( {
					value: n,
					label: n,
				} ) ),
				value: p.root,
				onChange: ( v ) => {
					p.root = v;
					S.starter = null;
					onChange();
				},
			} );
			ui.select( ui.row( material, t( 'Scale' ) ), {
				options: [
					...Object.keys( SCALES ),
					...Object.keys( ARPEGGIOS ),
				].map( ( id ) => ( {
					value: id,
					label: t( SCALE_LABELS[ id ] ),
				} ) ),
				value: p.scale,
				onChange: ( v ) => {
					p.scale = v;
					S.starter = null;
					onChange();
				},
			} );
		}
	}

	function mountVar( host, getValue, set, inputEl ) {
		if ( ! ( bridge.components && bridge.components.mountVarButton ) ) {
			return;
		}
		const varHost = ui.el( 'div', 'wpiesm-var', host );
		try {
			mounts.push(
				bridge.components.mountVarButton( varHost, {
					getValue,
					onChange: set,
					inputEl,
				} )
			);
		} catch ( e ) {
			varHost.remove();
		}
	}

	function pickFile() {
		const input = document.createElement( 'input' );
		input.type = 'file';
		input.accept =
			'.abc,.xml,.musicxml,.mxl,text/xml,application/xml,application/vnd.recordare.musicxml,application/vnd.recordare.musicxml+xml';
		input.onchange = () => {
			const f = input.files && input.files[ 0 ];
			if ( f ) {
				onImport( f );
			}
		};
		input.click();
	}

	/** Called after an import wrote params.abc. */
	function setText( v ) {
		if ( textarea ) {
			textarea.value = v;
		}
	}

	return {
		refresh,
		setText,
		unmountAll,
		dispose: () => {
			generation++;
			observer?.disconnect();
			unmountAll();
		},
	};
}
