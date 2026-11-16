/** Shared style snapshots for clipboard commands and preview-only tools. */

// Applied to ANY paste target regardless of its type.
const UNIVERSAL_STYLE_KEYS = [
	'opacity',
	'blend',
	'filter',
	'adjust',
	'styles',
];
// Applied only when the target shares the source layer's type, so text
// character styling never lands on an image, etc.
const TYPE_STYLE_KEYS = {
	text: [
		'fontFamily',
		'weight',
		'fontSize',
		'color',
		'italic',
		'underline',
		'letterSpacing',
		'lineHeight',
		'curve',
		// The whole Text Effects set (warp, arc, 3D, neon, …) travels with the
		// styles so Copy/Paste Styles reproduces the look, not just the paint.
		'textFX',
		'align',
		'valign',
		'outlineColor',
		'outlineW',
		'strokeGradient',
		'gradientKind',
		'shadowOn',
		'shadowColor',
		'bgColor',
		'bgRadius',
		'fillType',
		'gradientStops',
		'gradientAngle',
		'pattern',
		'patternData',
	],
	shape: [
		'fill',
		'stroke',
		'strokeW',
		'strokeGradient',
		'radius',
		'fillType',
		'gradientStops',
		'gradientAngle',
		'gradientKind',
		'pattern',
		'patternData',
	],
};

const cloneStyleVal = ( v ) =>
	v && 'object' === typeof v ? JSON.parse( JSON.stringify( v ) ) : v;

const pickStyle = ( layer, keys ) => {
	const out = {};
	for ( const k of keys ) {
		if ( k === 'strokeGradient' && ! ( k in layer ) ) {
			out[ k ] = null;
		}
		if ( k in layer ) {
			out[ k ] = cloneStyleVal( layer[ k ] );
		}
	}
	return out;
};

const cloneStyleMap = ( map ) => {
	const out = {};
	for ( const k of Object.keys( map ) ) {
		out[ k ] = cloneStyleVal( map[ k ] );
	}
	return out;
};

/** Capture appearance without changing the editor or shared clipboard. */
export function captureLayerStyle( layer ) {
	return {
		sourceType: layer.type,
		universal: pickStyle( layer, UNIVERSAL_STYLE_KEYS ),
		typed: pickStyle( layer, TYPE_STYLE_KEYS[ layer.type ] || [] ),
	};
}

/** Each target receives independent copies of the captured style values. */
export function layerStylePatch( layer, clip ) {
	if ( ! clip ) {
		return {};
	}
	return {
		...cloneStyleMap( clip.universal || {} ),
		...( layer.type === clip.sourceType
			? cloneStyleMap( clip.typed || {} )
			: {} ),
	};
}
