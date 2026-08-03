/**
 * Collapsible right-panel section (spec 06.2).
 */

import { useState } from '@wordpress/element';

import { I } from '../icons';

export function PanelSection( {
	title,
	defaultOpen = true,
	right,
	wsKey,
	children,
} ) {
	const [ open, setOpen ] = useState( defaultOpen );
	return (
		<div
			className={ `panel-section ${ ! open ? 'collapsed' : '' }` }
			{ ...( wsKey ? { 'data-ws': wsKey } : {} ) }
		>
			<div
				className={ `panel-head ${ ! open ? 'collapsed' : '' }` }
				role="button"
				tabIndex={ 0 }
				aria-expanded={ open }
				onClick={ () => setOpen( ! open ) }
				onKeyDown={ ( e ) =>
					( 'Enter' === e.key || ' ' === e.key ) && setOpen( ! open )
				}
			>
				<span
					style={ {
						display: 'inline-flex',
						alignItems: 'center',
						gap: 6,
					} }
				>
					<span className="chev">{ I.chevDown( { size: 12 } ) }</span>
					{ title }
				</span>
				{ right }
			</div>
			<div className="panel-content">{ children }</div>
		</div>
	);
}

/**
 * A titled cluster INSIDE a panel section (v1.373). The long sections had
 * grown into flat stacks of up to fifteen rows - fill, stroke, geometry,
 * decorations, all in one undifferentiated column, with the most-used
 * controls buried under the rare ones. This is the light structure between
 * "one accordion per topic" (too heavy, and the accordions must stay as
 * they are) and "no structure at all": a hairline plus a small caps label,
 * the exact look the swatch groups in the colour picker already use, so it
 * adds order without adding a second visual language.
 *
 * With no title it renders just the hairline - for separating a trailing
 * action row from the controls above it.
 *
 * @param {Object} props          Component props.
 * @param {string} [props.title]  Group caption (small caps).
 * @param {Object} props.children Rows.
 */
export function PanelGroup( { title, children } ) {
	return (
		<div className="panel-group">
			{ title ? <div className="panel-group-head">{ title }</div> : null }
			{ children }
		</div>
	);
}
