import { parseGeometry } from '../engine/geometry.js';
import {
	movePoint,
	setPolarPoint,
	renameLabel,
} from '../engine/geometry-edit.js';

export function geometryTools( host, b, { ui, t, onChange } ) {
	const section = ui.el( 'div', 'wpiemf-geometry-tools', host );
	const fig = parseGeometry( b.geometry );
	const names = [ ...fig.points.keys() ],
		editable = names.filter( ( n ) => ! fig.points.get( n ).derived );
	if ( ! editable.length ) return;
	let selected = editable[ 0 ],
		anchor = names.find( ( n ) => n !== selected ) || selected,
		reference = '';
	const select = ( label, values, value, change ) =>
		ui.select( ui.row( section, label ), {
			options: values.map( ( n ) => ( {
				value: n,
				label: n || t( 'Positive x-axis' ),
			} ) ),
			value,
			onChange: change,
		} );
	select( t( 'Point' ), editable, selected, ( v ) => {
		selected = v;
		if ( anchor === v ) {
			anchor = names.find( ( n ) => n !== v ) || v;
			anchorSelect.value = anchor;
		}
		sync();
	} );
	const fields = {};
	const number = ( key, label, change ) => {
		const input = ui.el( 'input', 'dsm-input', ui.row( section, label ) );
		input.type = 'number';
		input.step = 'any';
		input.dataset.geometry = key;
		input.onchange = () => {
			const v = input.valueAsNumber;
			if ( ! Number.isFinite( v ) ) return;
			change( v );
			onChange( true );
			sync();
		};
		fields[ key ] = input;
		return input;
	};
	const pos = () => parseGeometry( b.geometry ).points.get( selected );
	number( 'x', 'x', ( v ) => movePoint( b, selected, v, pos().y ) );
	number( 'y', 'y', ( v ) => movePoint( b, selected, pos().x, v ) );
	const label = ui.el(
		'input',
		'dsm-input',
		ui.row( section, t( 'Label' ) )
	);
	label.onchange = () => {
		renameLabel( b, selected, label.value );
		onChange( true );
	};
	const anchorSelect = select( t( 'From point' ), names, anchor, ( v ) => {
		anchor = v;
		sync();
	} );
	select( t( 'Angle reference' ), [ '', ...names ], '', ( v ) => {
		reference = v;
		sync();
	} );
	number( 'length', t( 'Length' ), ( v ) =>
		setPolarPoint(
			b,
			selected,
			anchor,
			v,
			Number( fields.angle.value ),
			reference
		)
	).min = '0';
	number( 'angle', t( 'Angle in degrees' ), ( v ) =>
		setPolarPoint(
			b,
			selected,
			anchor,
			Number( fields.length.value ),
			v,
			reference
		)
	);
	const buttons = ui.el( 'div', 'dsm-actions', section );
	for ( const [ command, text ] of [
		[ 'segment', t( 'Add segment' ) ],
		[ 'vector', t( 'Add vector' ) ],
		[ 'circle', t( 'Add circle' ) ],
	] )
		ui.btn( buttons, {
			label: text,
			onClick: () => {
				if ( selected === anchor ) return;
				b.geometry += `\n${ command } ${ anchor } ${ selected }`;
				onChange( true );
			},
		} );
	ui.btn( buttons, {
		label: t( 'Fit geometry' ),
		onClick: () => {
			b.viewRange = null;
			onChange( false );
		},
	} );
	ui.el(
		'div',
		'dsm-note',
		section,
		t(
			'Drag points and labels in the preview. Derived points follow their construction.'
		)
	);
	function sync() {
		const current = parseGeometry( b.geometry ),
			p = current.points.get( selected ),
			a = current.points.get( anchor ),
			ref = current.points.get( reference );
		fields.x.value = p.x;
		fields.y.value = p.y;
		fields.length.value = Number(
			Math.hypot( p.x - a.x, p.y - a.y ).toFixed( 6 )
		);
		const baseline = ref ? Math.atan2( ref.y - a.y, ref.x - a.x ) : 0;
		fields.angle.value = Number(
			(
				( ( Math.atan2( p.y - a.y, p.x - a.x ) - baseline ) * 180 ) /
				Math.PI
			).toFixed( 4 )
		);
		fields.length.disabled = fields.angle.disabled = selected === anchor;
		label.value = current.opts.labels.get( selected ) ?? selected;
	}
	sync();
}

/** Accessible handles live beside the preview canvas, not inside the exported SVG. */
export function geometryInteraction( view, { S, ui, t, onChange } ) {
	const layer = ui.el( 'div', 'wpiemf-handles', view.view );
	let enabled = true,
		drag = null;
	const toggle = ui.el(
		'button',
		'dsm-viewbtn wpiemf-edit-points',
		view.view,
		t( 'Edit points and labels' )
	);
	toggle.type = 'button';
	toggle.setAttribute( 'aria-pressed', 'true' );
	toggle.onclick = () => {
		enabled = ! enabled;
		toggle.setAttribute( 'aria-pressed', String( enabled ) );
		refresh();
	};
	function refresh() {
		if ( drag ) return;
		const focused = layer.contains( document.activeElement )
			? { ...document.activeElement.dataset }
			: null;
		layer.replaceChildren();
		const placement = S.last?.placements?.find(
			( p ) => p.id === S.blockId && p.type === 'geometry'
		);
		toggle.hidden = ! placement;
		if ( ! enabled || ! placement ) return;
		const block = S.params.blocks.find( ( b ) => b.id === placement.id );
		const rect = view.canvas.getBoundingClientRect(),
			vr = view.view.getBoundingClientRect();
		const scaleX = rect.width / view.canvas.width,
			scaleY = rect.height / view.canvas.height;
		for ( const handle of placement.handles ) {
			const button = ui.el(
				'button',
				'wpiemf-handle is-' + handle.kind,
				layer
			);
			button.type = 'button';
			button.dataset.point = handle.name;
			button.dataset.kind = handle.kind;
			button.setAttribute(
				'aria-label',
				( handle.kind === 'point' ? t( 'Point' ) : t( 'Label' ) ) +
					' ' +
					handle.name
			);
			button.title = button.getAttribute( 'aria-label' );
			let hx =
				rect.left -
				vr.left +
				( placement.x + handle.x * placement.scale ) * scaleX;
			let hy =
				rect.top -
				vr.top +
				( placement.y + handle.y * placement.scale ) * scaleY;
			if ( handle.kind === 'label' ) {
				const dx =
					( handle.worldX - handle.pointX ) *
					placement.view.unit *
					placement.scale *
					scaleX;
				const dy =
					-( handle.worldY - handle.pointY ) *
					placement.view.unit *
					placement.scale *
					scaleY;
				const distance = Math.hypot( dx, dy );
				// Keep the label grip away from the point at every preview zoom.
				if ( distance < 18 ) {
					hx += ( distance ? dx / distance : 1 ) * ( 18 - distance );
					hy += ( distance ? dy / distance : 0 ) * ( 18 - distance );
				}
			}
			button.style.left = hx + 'px';
			button.style.top = hy + 'px';
			const change = ( dx, dy, snap ) => {
				let x = handle.worldX + dx,
					y = handle.worldY + dy;
				if ( snap > 0 && handle.kind === 'point' ) {
					x = Math.round( x / snap ) * snap;
					y = Math.round( y / snap ) * snap;
				}
				if ( handle.kind === 'point' ) {
					block.viewRange = { ...placement.view };
					movePoint( block, handle.name, x, y );
				} else
					block.labelOffsets = {
						...block.labelOffsets,
						[ handle.name ]: {
							dx: x - handle.pointX,
							dy: y - handle.pointY,
						},
					};
			};
			button.onpointerdown = ( e ) => {
				if ( e.button !== 0 ) return;
				e.preventDefault();
				button.focus();
				drag = {
					x: e.clientX,
					y: e.clientY,
					before: {
						geometry: block.geometry,
						viewRange: block.viewRange,
						labelOffsets: structuredClone( block.labelOffsets ),
					},
				};
				button.setPointerCapture( e.pointerId );
			};
			button.onpointermove = ( e ) => {
				if ( ! drag ) return;
				change(
					( e.clientX - drag.x ) /
						( scaleX * placement.scale * placement.view.unit ),
					-( e.clientY - drag.y ) /
						( scaleY * placement.scale * placement.view.unit ),
					e.altKey ? 0 : block.snap
				);
				button.style.transform = `translate(calc(-50% + ${
					e.clientX - drag.x
				}px), calc(-50% + ${ e.clientY - drag.y }px))`;
				onChange( false );
			};
			const end = ( cancel ) => {
				if ( ! drag ) return;
				if ( cancel ) Object.assign( block, drag.before );
				drag = null;
				onChange( true );
			};
			button.onpointerup = () => end( false );
			button.onpointercancel = () => end( true );
			button.onkeydown = ( e ) => {
				if ( e.key === 'Escape' && drag ) {
					e.preventDefault();
					e.stopPropagation();
					end( true );
					return;
				}
				const dir = {
					ArrowLeft: [ -1, 0 ],
					ArrowRight: [ 1, 0 ],
					ArrowUp: [ 0, 1 ],
					ArrowDown: [ 0, -1 ],
				}[ e.key ];
				if ( ! dir ) return;
				e.preventDefault();
				const step = e.shiftKey ? 1 : block.snap || 0.1;
				change( dir[ 0 ] * step, dir[ 1 ] * step, 0 );
				onChange( true );
			};
		}
		if ( focused ) {
			const next = [ ...layer.children ].find(
				( n ) =>
					n.dataset.point === focused.point &&
					n.dataset.kind === focused.kind
			);
			next?.focus( { preventScroll: true } );
		}
	}
	const observer = new ResizeObserver( refresh );
	observer.observe( view.view );
	return {
		refresh,
		destroy: () => {
			observer.disconnect();
			layer.remove();
			toggle.remove();
		},
	};
}
