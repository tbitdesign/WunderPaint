/** Catalog previews are computed once, never while the panel is dragged. */
import { penOutline, penPresetStyle } from './pen-path';
import { penPaintParts, penPaintStops } from './pen-paint';
const SAMPLE = 'M 12 57 C 45 5 86 105 137 38';
export function penPresetPreview( preset ) {
	const raw = penPresetStyle( preset ),
		width = Math.max( 3, Math.min( 16, raw.width * 0.4 ) );
	const style = {
		...raw,
		width,
		parallelGap: ( raw.parallelGap * width ) / raw.width,
	};
	const d = penOutline( SAMPLE, style );
	if ( style.colorMode !== 'path' ) {
		return { d };
	}
	// Standalone SVG images keep hundreds of mesh patches out of the panel DOM.
	const defs = [ `<clipPath id="clip"><path d="${ d }"/></clipPath>` ];
	const body = penPaintParts( SAMPLE, style )
		.map( ( part, i ) => {
			const stops = penPaintStops( part )
				.map(
					( s ) =>
						`<stop offset="${ s.t }" stop-color="${ s.color }"/>`
				)
				.join( '' );
			defs.push(
				`<linearGradient id="g${ i }" gradientUnits="userSpaceOnUse" x1="${ part.from.x }" y1="${ part.from.y }" x2="${ part.to.x }" y2="${ part.to.y }">${ stops }</linearGradient>`
			);
			return `<path d="${ part.d }" fill="url(#g${ i })"/>`;
		} )
		.join( '' );
	return {
		d,
		src:
			'data:image/svg+xml;charset=utf-8,' +
			encodeURIComponent(
				`<svg xmlns="http://www.w3.org/2000/svg" width="150" height="100" viewBox="0 0 150 100"><defs>${ defs.join(
					''
				) }</defs><g clip-path="url(#clip)">${ body }</g></svg>`
			),
	};
}
