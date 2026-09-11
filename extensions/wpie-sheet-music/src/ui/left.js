/** Left column: the seven sheet types, the starters of the active one, the material. */
import { CARDS } from '../cards.js';
import { STARTERS } from '../starters.js';
import { ICONS } from './icons.js';
import { NOTE_NAMES_SHARP } from '../engine/chords.js';
import { SCALES, ARPEGGIOS, SCALE_LABELS } from '../engine/scales.js';
import { FLASH_CLEFS, FLASH_RANGES, NAME_SYSTEMS } from '../engine/notation.js';

export function buildLeft(
	left,
	{ S, ui, bridge, t, onCard, onStarter, onChange, onImport }
) {
	// The seven sheet types (v0.3): a section of cards with the hint in
	// the card, the way the starters read - seven tiles in a four-wide
	// grid always left a hole.
	const typeCard = ui.section( left, {
		icon: ICONS.score,
		title: t( 'Sheet type' ),
	} );
	const list0 = ui.el( 'div', 'wpiesm-cards', typeCard );
	const tiles = new Map();
	for ( const c of CARDS ) {
		const b = ui.el( 'button', 'dsm-pickrow wpiesm-card', list0 );
		b.type = 'button';
		b.dataset.card = c.id;
		const ic = ui.el( 'span', 'dsm-pickrow-icon wpiesm-card-ic', b );
		ic.innerHTML = ICONS[ c.id ];
		const main = ui.el( 'span', 'dsm-pickrow-text wpiesm-card-main', b );
		ui.el( 'b', null, main, t( c.label ) );
		ui.el( 'small', null, main, t( c.hint ) );
		b.onclick = () => onCard( c.id );
		tiles.set( c.id, b );
	}
	const startersCard = ui.section( left, {
		icon: ICONS.starters,
		title: t( 'Starters' ),
	} );
	const list = ui.el( 'div', 'wpiesm-starters', startersCard );
	const materialCard = ui.section( left, {
		icon: ICONS.material,
		title: t( 'Material' ),
	} );
	const material = ui.el( 'div', 'wpiesm-material', materialCard );
	let textarea = null;
	const mounts = [];

	function refresh() {
		for ( const [ id, b ] of tiles ) {
			b.classList.toggle( 'is-on', id === S.card );
		}
		list.innerHTML = '';
		for ( const s of STARTERS.filter( ( x ) => x.card === S.card ) ) {
			const b = ui.el( 'button', 'dsm-listrow wpiesm-starter', list );
			b.type = 'button';
			b.dataset.id = s.id;
			b.classList.toggle( 'is-on', S.starter === s.id );
			b.innerHTML = '<b></b><small></small>';
			b.querySelector( 'b' ).textContent = s.name;
			b.querySelector( 'small' ).textContent = s.subtitle;
			b.onclick = () => onStarter( s.id );
		}
		buildMaterial();
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
				options: NOTE_NAMES_SHARP.map( ( n ) => ( {
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

	return { refresh, setText, unmountAll };
}
