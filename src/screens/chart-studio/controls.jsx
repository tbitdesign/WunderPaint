/**
 * Chart & Table Studio primitives (v1.269.0): the studios' CI - always
 * open settings cards with a Tabler icon head (like 3D Gallery Studio's
 * wpiegal-card), compact property rows (label left, control right) and
 * the brand-kit color source moved verbatim from the old chart-dialog.
 */

import { __ } from '@wordpress/i18n';

/** Inline Tabler stroke icon (the studios ship path data, not fonts). */
const SIcon = ( { d, size = 15 } ) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width={ size }
		height={ size }
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<path d={ d } />
	</svg>
);

export const SICONS = {
	// Tabler: palette
	design: (
		<SIcon d="M12 21a9 9 0 0 1 0 -18c4.97 0 9 3.582 9 8c0 1.06 -.474 2.078 -1.318 2.828c-.844 .75 -1.989 1.172 -3.182 1.172h-2.5a2 2 0 0 0 -1 3.75a1.3 1.3 0 0 1 -1 2.25 M7.5 10.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M11.5 7.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M15.5 10.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
	),
	// Tabler: color-swatch
	colors: (
		<SIcon d="M19 3h-4a2 2 0 0 0 -2 2v12a4 4 0 0 0 8 0v-12a2 2 0 0 0 -2 -2 M13 7.35l-2 -2a2 2 0 0 0 -2.828 0l-2.828 2.828a2 2 0 0 0 0 2.829l9.656 9.656 M7.3 13h-2.3a2 2 0 0 0 -2 2v4a2 2 0 0 0 2 2h12 M17 17v.01" />
	),
	// Tabler: chart-line
	series: <SIcon d="M4 19l16 0 M4 15l4 -6l4 2l4 -5l4 4" />,
	// Tabler: adjustments-horizontal
	options: (
		<SIcon d="M12 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M4 6l8 0 M16 6l4 0 M6 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M4 12l2 0 M10 12l10 0 M15 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M4 18l11 0 M19 18l1 0" />
	),
	// Tabler: typography
	labels: (
		<SIcon d="M4 20l3 0 M14 20l7 0 M6.9 15l6.9 0 M10.2 6.3l5.8 13.7 M5 20l6 -16l2 0l7 16" />
	),
};

/** Settings card with an icon header (the studios' CI). */
export function Card( { icon, title, children } ) {
	return (
		<div className="chs-card">
			<div className="chs-card-head">
				{ icon }
				<span>{ title }</span>
			</div>
			<div className="chs-card-body">{ children }</div>
		</div>
	);
}

/** Property row: fixed label left, control right. */
export function Row( { label, children } ) {
	return (
		/*
		 * The label WRAPS its control: `children` is a single field at
		 * every call site. The rule cannot see that statically and asks
		 * for an htmlFor pointing at something this component does not
		 * know. Checked by hand rather than configured away (v1.348.0).
		 */
		// eslint-disable-next-line jsx-a11y/label-has-associated-control
		<label className="chs-prow">
			<span className="chs-lbl">{ label }</span>
			{ children }
		</label>
	);
}

export function Slider( { label, value, min, max, onChange } ) {
	return (
		<div className="chs-prow">
			<span className="chs-lbl">{ label }</span>
			<input
				type="range"
				min={ min }
				max={ max }
				value={ value }
				onChange={ ( e ) => onChange( +e.target.value ) }
			/>
			<span className="chs-val">{ value }</span>
		</div>
	);
}

export function CheckRow( { label, checked, onChange } ) {
	return (
		<label className="chs-prow">
			<span className="chs-lbl">{ label }</span>
			<input
				type="checkbox"
				checked={ checked }
				onChange={ ( e ) => onChange( e.target.checked ) }
			/>
			<span style={ { flex: 1 } } />
		</label>
	);
}

export function ColorsFrom( { value = '', onApply } ) {
	const kits = ( window.WPIE?.brandKits || [] ).filter(
		( k ) => k?.name && ( k.colors || [] ).length > 1
	);
	const sets = ( window.WPIE?.palettes || [] ).filter(
		( p ) => ( p.colors || [] ).length > 1
	);
	if ( ! kits.length && ! sets.length ) {
		return null;
	}
	// Controlled: the dialog remembers the picked source, so the choice
	// survives type switches instead of snapping back to the placeholder
	// (v1.272.5). onApply receives ( colors, sourceKey ).
	return (
		<select
			className="dsm-select"
			value={ value }
			onChange={ ( e ) => {
				const key = e.target.value;
				const [ kind, id ] = key.split( ':' );
				const source =
					'kit' === kind
						? kits.find( ( k ) => String( k.id ) === String( id ) )
						: sets.find( ( s ) => String( s.id ) === String( id ) );
				if ( source?.colors?.length > 1 ) {
					onApply( source.colors.slice( 0, 8 ), key );
				}
			} }
		>
			<option value="">{ __( 'Colors from…', 'wunderpaint' ) }</option>
			{ kits.map( ( k ) => (
				<option key={ k.id } value={ 'kit:' + k.id }>
					{ __( 'Brand Kit', 'wunderpaint' ) + ': ' + k.name }
				</option>
			) ) }
			{ sets.map( ( s ) => (
				<option key={ s.id } value={ 'set:' + s.id }>
					{ __( 'Swatch set', 'wunderpaint' ) + ': ' + s.name }
				</option>
			) ) }
		</select>
	);
}
