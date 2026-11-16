import { captureLayerStyle } from '../../../src/lib/layer-style.js';
import { textRecords } from './engine.js';

const FILL_KEYS = [
	'fill',
	'fillType',
	'gradientStops',
	'gradientAngle',
	'gradientKind',
	'pattern',
	'patternData',
];
const TYPOGRAPHY_KEYS = {
	family: 'fontFamily',
	size: 'fontSize',
	weight: 'weight',
	italic: 'italic',
	underline: 'underline',
	ls: 'letterSpacing',
	lh: 'lineHeight',
};

/** Select parts of the core's style snapshot; never copy content or geometry. */
export function sampleChanges( layer, part, record = 0 ) {
	if ( ! layer || ! [ 'shape', 'text' ].includes( layer.type ) ) {
		return {};
	}
	if ( part === 'typography' && layer.type === 'text' ) {
		const style = textRecords( layer )[ record ]?.style;
		if ( ! style ) {
			return {};
		}
		const normalized = { ...layer };
		for ( const [ key, field ] of Object.entries( TYPOGRAPHY_KEYS ) ) {
			normalized[ field ] = style[ key ];
		}
		const clip = captureLayerStyle( normalized );
		return Object.fromEntries(
			Object.entries( TYPOGRAPHY_KEYS ).map( ( [ key, field ] ) => [
				key,
				clip.typed[ field ],
			] )
		);
	}
	if ( layer.type !== 'shape' ) {
		return {};
	}
	const clip = captureLayerStyle( layer );
	const subset = ( keys ) => ( {
		sourceType: clip.sourceType,
		typed: Object.fromEntries(
			keys
				.filter( ( key ) => key in clip.typed )
				.map( ( key ) => [ key, clip.typed[ key ] ] )
		),
	} );
	if ( part === 'fill' ) {
		const paint = subset( FILL_KEYS );
		paint.typed.fillType ||=
			layer.pattern && layer.pattern !== 'none' ? 'pattern' : 'solid';
		return { fillPaint: paint };
	}
	if ( part === 'stroke' ) {
		const paint = subset( [ 'stroke', 'strokeGradient' ] );
		paint.typed.stroke ??= null;
		return { strokePaint: paint, strokeW: clip.typed.strokeW || 0 };
	}
	if ( part === 'radius' ) {
		return typeof layer.radius === 'number' ||
			layer.radius === null ||
			layer.radius === undefined
			? { radius: layer.radius || 0 }
			: { cornerStyle: subset( [ 'radius' ] ) };
	}
	return {};
}
