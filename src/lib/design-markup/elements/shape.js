import { makeShape } from '../../../store/document';
import { dynamicDefaults, dynamicShapeIds } from '../../shape-dynamics';
import { roleColor, applyCommon } from './common';

export function buildShape( el, rect, ctx ) {
	const palette = ctx.tokens.palette;
	const dynamic = dynamicShapeIds().includes( el.family );
	const layer = makeShape( {
		name: el.name,
		...rect,
		shape: el.family,
		fill: roleColor( el.fill, palette ),
		stroke: el.stroke ? roleColor( el.stroke, palette ) : null,
		strokeW: Math.round( el.strokeW * ctx.tokens.docMin ),
		radius: Math.round( ( el.corner * Math.min( rect.w, rect.h ) ) / 2 ),
		...( dynamic
			? { shapeParams: { ...dynamicDefaults( el.family ), ...el.params } }
			: {} ),
	} );
	applyCommon( layer, el, 'main', ctx );
	return { layers: [ layer ], parts: { main: layer.id } };
}
