/**
 * Layer thumbnail (spec 06.1, real renders since v1.2.1): images show the
 * source; every other visual type (shape, text, raster, stroke, gradient,
 * smart) runs through the mini pipeline render, stroke-only icons,
 * pattern fills and text gradients show up exactly as on canvas.
 */

import { useState, useEffect } from '@wordpress/element';

import { I } from '../icons';
import { renderToCanvas, sharedImageCache } from '../lib/raster';

const thumbCache = new WeakMap();

export function LayerThumb( { layer, doc } ) {
	const [ url, setUrl ] = useState( null );

	const needsRender = [
		'raster',
		'stroke',
		'gradient',
		'smart',
		'shape',
		'text',
	].includes( layer.type );

	useEffect( () => {
		if ( ! needsRender ) {
			return;
		}
		if ( thumbCache.has( layer ) ) {
			setUrl( thumbCache.get( layer ) );
			return;
		}
		let cancelled = false;
		// Text glyphs can overshoot the em box (emoji!), pad the thumb
		// viewport so nothing gets cut off (v1.4).
		const margin =
			'text' === layer.type
				? Math.ceil( ( layer.fontSize || 16 ) * 0.35 )
				: 0;
		const bounds = {
			x: layer.x - margin,
			y: layer.y - margin,
			w: Math.max( 1, layer.w + 2 * margin ),
			h: Math.max( 1, layer.h + 2 * margin ),
		};
		const scale = Math.min( 68 / bounds.w, 52 / bounds.h, 1 );
		renderToCanvas(
			{ ...doc, bg: 'transparent' },
			[ { ...layer, visible: true, parent: null } ],
			{
				viewport: bounds,
				scale,
				cache: sharedImageCache,
			}
		)
			.then( ( canvas ) => {
				if ( ! cancelled && canvas.toDataURL ) {
					const dataUrl = canvas.toDataURL();
					thumbCache.set( layer, dataUrl );
					setUrl( dataUrl );
				}
			} )
			.catch( () => {} );
		return () => {
			cancelled = true;
		};
	}, [ layer, doc, needsRender ] );

	if ( 'image' === layer.type && layer.src ) {
		return <img src={ layer.src } alt="" />;
	}
	if ( 'group' === layer.type ) {
		return I.folder( { size: 14 } );
	}
	if ( 'adjustment' === layer.type ) {
		return I.sliders( { size: 14 } );
	}
	if ( url ) {
		return <img src={ url } alt="" />;
	}
	if ( 'shape' === layer.type ) {
		return ( I.shape || I.image )( { size: 14 } );
	}
	if ( 'text' === layer.type ) {
		return (
			<span
				style={ { fontSize: 9, fontWeight: 800, color: layer.color } }
			>
				T
			</span>
		);
	}
	return I[ 'smart' === layer.type ? 'smart' : 'image' ]( { size: 14 } );
}
