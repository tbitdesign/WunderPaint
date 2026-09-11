/**
 * The material panel under the sheet: the item's text, the guest names
 * when the item uses them, the photo source, the item's hint and the
 * warnings of the last render.
 */
import { ITEMS } from '../items.js';
import { PHOTO_SOURCES } from '../model.js';
import { ICONS } from './icons.js';

export function buildMaterial( host, { S, ui, bridge, t, onChange, onPhoto } ) {
	const panel = ui.el( 'div', 'dsm-card wpiepp-material', host );
	const head = ui.el( 'div', 'dsm-card-head wpiepp-material-head', panel );
	const headIcon = ui.el( 'span', 'wpiepp-material-ic', head );
	const headLabel = ui.el( 'b', null, head, '' );
	const headHint = ui.el( 'span', 'dsm-note wpiepp-material-hint', head, '' );
	const body = ui.el( 'div', 'dsm-card-body wpiepp-material-body', panel );
	const errors = ui.el( 'div', 'dsm-note wpiepp-errors', panel, '' );
	errors.hidden = true;
	const mounts = [];

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
		const item = S.params.item;
		const def = ITEMS[ item.type ] || ITEMS.bunting;
		headIcon.innerHTML = ICONS[ def.id ] || ICONS.item;
		headLabel.textContent = t( def.label );
		headHint.textContent = t( def.hint );
		const row = ui.el( 'div', 'wpiepp-material-row', body );
		if ( def.uses.text ) {
			const col = ui.el( 'div', 'wpiepp-material-col', row );
			ui.el(
				'div',
				'dsm-note wpiepp-note',
				col,
				def.textLabel ? t( def.textLabel ) : t( 'Text' )
			);
			const ta = ui.el( 'textarea', 'dsm-input wpiepp-text', col );
			ta.spellcheck = false;
			ta.value = item.text || '';
			ta.placeholder =
				def.placeholder ||
				( 'bunting' === item.type || 'letterbanner' === item.type
					? 'HAPPY BIRTHDAY'
					: t( 'Text on the item' ) );
			ta.classList.toggle( 'is-lines', 'lines' === def.uses.text );
			ta.oninput = () => {
				item.text = ta.value;
				S.starter = null;
				onChange();
			};
			if ( bridge.components && bridge.components.mountVarButton ) {
				const varHost = ui.el( 'div', 'wpiepp-var', col );
				try {
					mounts.push(
						bridge.components.mountVarButton( varHost, {
							getValue: () => ta.value,
							onChange: ( v ) => {
								ta.value = v;
								item.text = v;
								onChange();
							},
							inputEl: ta,
						} )
					);
				} catch ( e ) {
					varHost.remove();
				}
			}
		}
		if ( def.uses.names ) {
			const col = ui.el( 'div', 'wpiepp-material-col', row );
			ui.el(
				'div',
				'dsm-note wpiepp-note',
				col,
				t( 'Guests, one name per line' )
			);
			const ta = ui.el( 'textarea', 'dsm-input wpiepp-names', col );
			ta.spellcheck = false;
			ta.value = ( S.params.event.names || [] ).join( '\n' );
			ta.placeholder = 'Mia\nLeo\nAda';
			ta.oninput = () => {
				S.params.event.names = ta.value
					.split( '\n' )
					.map( ( s ) => s.trim() )
					.filter( Boolean );
				onChange();
			};
			if ( 'optional' === def.uses.names ) {
				ui.check( col, {
					label: t( 'One piece per guest' ),
					checked: 'names' === item.textFrom,
					onChange: ( v ) => {
						item.textFrom = v ? 'names' : 'text';
						onChange();
					},
				} );
			}
		}
		if ( def.uses.photo && 'none' !== def.uses.photo ) {
			const col = ui.el(
				'div',
				'wpiepp-material-col wpiepp-material-photo',
				row
			);
			ui.el( 'div', 'dsm-note wpiepp-note', col, t( 'Photo' ) );
			const photo = S.params.photo;
			const pickHost = ui.el( 'div', 'wpiepp-photo-pick', col );
			const many = 'many' === def.uses.photo;
			const countLine = ui.el(
				'div',
				'dsm-note wpiepp-note wpiepp-photo-count',
				col,
				''
			);
			const showCount = () => {
				countLine.textContent = many
					? ( photo.items || [] ).length +
					  ' ' +
					  t( 'pictures chosen' )
					: '';
				countLine.hidden = ! many || 'media' !== photo.source;
			};
			const pickMedia = () => {
				pickHost.innerHTML = '';
				if (
					! (
						bridge.components && bridge.components.mountMediaPicker
					)
				) {
					return;
				}
				try {
					const picker = bridge.components.mountMediaPicker(
						pickHost,
						{
							label: t( 'Choose image' ),
							selectedIds: many
								? ( photo.items || [] ).map( ( it ) => it.id )
								: null,
							onPick: ( picked ) => {
								const url =
									picked &&
									( picked.fullUrl ||
										picked.url ||
										picked.src );
								if ( ! url ) {
									return;
								}
								photo.source = 'media';
								if ( many ) {
									const list = photo.items || [];
									const at = list.findIndex(
										( it ) => it.id === picked.id
									);
									photo.items =
										at >= 0
											? list.filter(
													( _, k ) => k !== at
											  )
											: [
													...list,
													{ id: picked.id || 0, url },
											  ];
									if ( picker && picker.set ) {
										picker.set(
											photo.items.map( ( it ) => it.id )
										);
									}
									showCount();
								} else {
									photo.id = picked.id || 0;
									photo.url = url;
								}
								onPhoto();
							},
						}
					);
					mounts.push( picker );
				} catch ( e ) {
					// no picker in this host
				}
			};
			ui.select( col, {
				options: PHOTO_SOURCES.filter(
					( o ) => ! many || 'selection' !== o.value
				).map( ( o ) => ( { value: o.value, label: t( o.label ) } ) ),
				value: photo.source,
				onChange: ( v ) => {
					photo.source = v;
					if ( 'media' === v ) {
						pickMedia();
					} else {
						pickHost.innerHTML = '';
					}
					showCount();
					onPhoto();
				},
			} );
			col.appendChild( countLine );
			col.appendChild( pickHost );
			if ( 'media' === photo.source ) {
				pickMedia();
			}
			showCount();
		}
	}

	function setWarnings( list ) {
		errors.textContent = ( list || [] ).join( ' · ' );
		errors.hidden = ! ( list && list.length );
	}

	return { refresh, unmountAll, setWarnings, panel };
}
