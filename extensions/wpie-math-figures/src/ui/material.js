/**
 * The material panel under the picture: the selected block's own text
 * (LaTeX, functions, commands, times ...), its hint, a second field for
 * the notes of a formula, the a b c parameters of a graph, the dynamic
 * content button, and the warnings of the last render right where the
 * user types.
 */
import { BLOCKS } from '../blocks.js';
import { blockFields } from '../figure.js';
import { ICONS } from './icons.js';

export function buildMaterial( host, { S, ui, bridge, t, onChange } ) {
	const panel = ui.el( 'div', 'dsm-card wpiemf-material', host );
	const head = ui.el( 'div', 'dsm-card-head wpiemf-material-head', panel );
	const headIcon = ui.el( 'span', 'wpiemf-material-ic', head );
	const headLabel = ui.el( 'b', null, head, '' );
	const headHint = ui.el( 'span', 'dsm-note wpiemf-material-hint', head, '' );
	const body = ui.el( 'div', 'dsm-card-body wpiemf-material-body', panel );
	const errors = ui.el( 'div', 'dsm-note wpiemf-errors', panel, '' );
	const mounts = [];

	const selected = () =>
		S.params.blocks.find( ( b ) => b.id === S.blockId ) ||
		S.params.blocks[ 0 ];

	function unmountAll() {
		while ( mounts.length ) {
			const m = mounts.pop();
			try {
				if ( m && m.unmount ) {
					m.unmount();
				}
			} catch ( e ) {
				// nothing to release
			}
		}
	}

	function refresh() {
		unmountAll();
		body.innerHTML = '';
		const b = selected();
		const def = BLOCKS[ b.type ];
		const key = blockFields( b.type )[ 0 ];
		headIcon.innerHTML = ICONS[ b.type ] || ICONS.formula;
		headLabel.textContent = t( def.label );
		headHint.textContent = t( def.note );
		const row = ui.el( 'div', 'wpiemf-material-row', body );
		const main = ui.el( 'div', 'wpiemf-material-main', row );
		const textarea = ui.el( 'textarea', 'dsm-input wpiemf-text', main );
		textarea.spellcheck = false;
		textarea.value = b[ key ] || '';
		textarea.placeholder = def.placeholder;
		textarea.oninput = () => {
			b[ key ] = textarea.value;
			S.starter = null;
			onChange( true );
		};
		if ( 'formula' === b.type ) {
			const aside = ui.el( 'div', 'wpiemf-material-aside', row );
			const notes = ui.el( 'textarea', 'dsm-input wpiemf-notes', aside );
			notes.spellcheck = false;
			notes.value = b.notes || '';
			notes.placeholder =
				'd "Discriminant" below\nn "Numerator" above #e08a00';
			notes.oninput = () => {
				b.notes = notes.value;
				onChange( false );
			};
			ui.el(
				'div',
				'dsm-note wpiemf-note',
				aside,
				t(
					'Notes: one line per mark, key "label" above or below, an optional color.'
				)
			);
		}
		if ( 'graph' === b.type ) {
			const aside = ui.el( 'div', 'wpiemf-material-aside', row );
			const fields = ui.el( 'div', 'wpiemf-fields', aside );
			for ( const [ k, label ] of [
				[ 'pa', 'a' ],
				[ 'pb', 'b' ],
				[ 'pc', 'c' ],
			] ) {
				const line = ui.row( fields, label );
				const input = ui.el( 'input', 'dsm-input wpiemf-input', line );
				input.type = 'number';
				input.step = '0.1';
				input.value = String( b[ k ] );
				input.oninput = () => {
					b[ k ] = parseFloat( input.value ) || 0;
					onChange( false );
				};
			}
			ui.el(
				'div',
				'dsm-note wpiemf-note',
				aside,
				t(
					'Parameters a, b and c for use in the functions, for example a x^2 + b x + c.'
				)
			);
		}
		const tools = ui.el( 'div', 'wpiemf-tools', main );
		if ( bridge.components && bridge.components.mountVarButton ) {
			const varHost = ui.el( 'div', 'wpiemf-var', tools );
			try {
				mounts.push(
					bridge.components.mountVarButton( varHost, {
						getValue: () => textarea.value,
						onChange: ( v ) => {
							textarea.value = v;
							b[ key ] = v;
							onChange( true );
						},
						inputEl: textarea,
					} )
				);
			} catch ( e ) {
				varHost.remove();
			}
		}
	}

	function setWarnings( list ) {
		errors.textContent = ( list || [] ).join( ' · ' );
		errors.hidden = ! ( list && list.length );
	}

	return { refresh, unmountAll, setWarnings, panel };
}
