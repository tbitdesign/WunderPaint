import { parseColor, toHexColor } from './color';
import {
	detachPatchedColorLinks,
	syncColorLinks,
	readColorField,
	colorFieldPatch,
} from './color-links';
import { solveResultColor } from './color-experiments';
import { samplePixel, sharedImageCache } from './raster';

/** Probe the real renderer; masks, groups and the actual backdrop are included. */
export async function measureColorResult( doc, layers, id, field, point ) {
	const layer = layers.find( ( l ) => l.id === id );
	if ( ! layer ) {
		return null;
	}
	const sample = async ( patch ) =>
		samplePixel(
			doc,
			syncColorLinks(
				layers.map( ( l ) =>
					l.id === id
						? { ...l, ...detachPatchedColorLinks( l, patch ) }
						: l
				)
			),
			point.x,
			point.y,
			sharedImageCache
		);
	const normal = {
		zero: await sample( colorFieldPatch( layer, field, '#00000000' ) ),
		black: await sample( colorFieldPatch( layer, field, '#000000' ) ),
		white: await sample( colorFieldPatch( layer, field, '#ffffff' ) ),
	};
	let full = null;
	if ( ( layer.opacity ?? 1 ) < 1 ) {
		full = {
			zero: await sample( { opacity: 0 } ),
			black: await sample( {
				...colorFieldPatch( layer, field, '#000000' ),
				opacity: 1,
			} ),
			white: await sample( {
				...colorFieldPatch( layer, field, '#ffffff' ),
				opacity: 1,
			} ),
		};
	}
	return { normal, full, layer, sample, field };
}

export async function calculateColorResult( measurement, desired ) {
	const { normal, full, layer, sample, field } = measurement;
	let solution = solveResultColor(
		normal,
		desired,
		parseColor( readColorField( layer, field ) ).a
	);
	let patch;
	let opacityKind = 'color';
	if ( solution.error && full && solution.error !== 'transparent' ) {
		solution = solveResultColor( full, desired, layer.opacity ?? 1 );
		if ( ! solution.error ) {
			const c = parseColor( solution.color );
			patch = {
				...colorFieldPatch( layer, field, toHexColor( c.r, c.g, c.b ) ),
				opacity: solution.alpha,
			};
			opacityKind = 'layer';
			solution.needsOpacity = true;
		}
	} else if ( ! solution.error ) {
		patch = colorFieldPatch( layer, field, solution.color );
	}
	if ( solution.error ) {
		return solution;
	}
	const pixel = await sample( patch );
	const want = parseColor( desired );
	// Blend modes, filters, overlap with another carrier, or nonlinear adjustments
	// can break the affine model. Never offer Apply unless the actual pixel agrees.
	if (
		pixel.a < 254 ||
		[ 'r', 'g', 'b' ].some(
			( k ) => Math.abs( want[ k ] - pixel[ k ] ) > 3
		)
	) {
		return { error: 'nonlinear' };
	}
	return { ...solution, patch, opacityKind, pixel };
}
