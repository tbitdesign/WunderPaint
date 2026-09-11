import { createElement, createRoot } from '@wordpress/element';
import { ColorWheel } from '../components/color-wheel';

/**
 * Mount the Brush panel's color wheel into a framework-free extension.
 *
 * @param {Element}  node             Host node.
 * @param {Object}   options          Mount settings.
 * @param {string}   options.color    Initial RGB hex color.
 * @param {Function} options.onChange Callback receiving the selected hex color.
 * @param {number}   options.size     Maximum wheel size in CSS pixels.
 * @return {Object} Self-updating handle with set(color) and unmount().
 */
export function mountColorWheel( node, { color, onChange, size = 176 } ) {
	const root = createRoot( node );
	const render = ( value ) =>
		root.render(
			createElement( ColorWheel, {
				color: value,
				size,
				onChange: ( next ) => {
					render( next );
					onChange?.( next );
				},
			} )
		);
	render( color );
	return { set: render, unmount: () => root.unmount() };
}
