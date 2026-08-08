/**
 * Astrological glyphs as procedural vector strokes. System fonts are
 * unreliable for these code points, so every planet and sign symbol is
 * drawn with canvas primitives in a unit box: each painter receives a
 * context already translated to the glyph centre and scaled so the glyph
 * spans roughly -0.5..0.5. Stroke width and color are set by drawGlyph.
 */

const TAU = Math.PI * 2;

/* Planet glyph painters. */
const PLANETS = {
	sun( ctx ) {
		ctx.beginPath();
		ctx.arc( 0, 0, 0.4, 0, TAU );
		ctx.stroke();
		ctx.beginPath();
		ctx.arc( 0, 0, 0.085, 0, TAU );
		ctx.fill();
	},
	moon( ctx ) {
		ctx.beginPath();
		ctx.arc( -0.06, 0, 0.42, -1.25, 1.25 );
		ctx.arc( 0.22, 0, 0.34, 1.05, -1.05, true );
		ctx.closePath();
		ctx.stroke();
	},
	mercury( ctx ) {
		ctx.beginPath();
		ctx.arc( 0, -0.02, 0.24, 0, TAU );
		ctx.stroke();
		ctx.beginPath();
		ctx.arc( 0, -0.44, 0.19, 0.25, Math.PI - 0.25 );
		ctx.stroke();
		line( ctx, 0, 0.22, 0, 0.5 );
		line( ctx, -0.15, 0.36, 0.15, 0.36 );
	},
	venus( ctx ) {
		ctx.beginPath();
		ctx.arc( 0, -0.14, 0.28, 0, TAU );
		ctx.stroke();
		line( ctx, 0, 0.14, 0, 0.5 );
		line( ctx, -0.16, 0.32, 0.16, 0.32 );
	},
	mars( ctx ) {
		ctx.beginPath();
		ctx.arc( -0.09, 0.09, 0.28, 0, TAU );
		ctx.stroke();
		line( ctx, 0.11, -0.11, 0.42, -0.42 );
		line( ctx, 0.14, -0.42, 0.42, -0.42 );
		line( ctx, 0.42, -0.42, 0.42, -0.14 );
	},
	jupiter( ctx ) {
		ctx.beginPath();
		ctx.moveTo( -0.34, -0.2 );
		ctx.quadraticCurveTo( -0.12, -0.56, 0.06, -0.24 );
		ctx.quadraticCurveTo( 0.16, -0.04, -0.34, 0.16 );
		ctx.stroke();
		line( ctx, -0.36, 0.16, 0.36, 0.16 );
		line( ctx, 0.16, -0.12, 0.16, 0.48 );
	},
	saturn( ctx ) {
		line( ctx, -0.2, -0.48, -0.2, 0.26 );
		line( ctx, -0.34, -0.3, -0.06, -0.3 );
		ctx.beginPath();
		ctx.moveTo( -0.2, 0.02 );
		ctx.quadraticCurveTo( 0.18, -0.22, 0.18, 0.12 );
		ctx.quadraticCurveTo( 0.18, 0.34, 0.02, 0.42 );
		ctx.quadraticCurveTo( -0.06, 0.46, 0.02, 0.52 );
		ctx.stroke();
	},
	uranus( ctx ) {
		line( ctx, -0.24, -0.46, -0.24, 0.08 );
		line( ctx, 0.24, -0.46, 0.24, 0.08 );
		line( ctx, -0.24, -0.19, 0.24, -0.19 );
		line( ctx, 0, -0.19, 0, 0.2 );
		ctx.beginPath();
		ctx.arc( 0, 0.33, 0.13, 0, TAU );
		ctx.stroke();
		ctx.beginPath();
		ctx.arc( 0, 0.33, 0.04, 0, TAU );
		ctx.fill();
	},
	neptune( ctx ) {
		ctx.beginPath();
		ctx.arc( 0, -0.2, 0.26, Math.PI, 0, true );
		ctx.stroke();
		line( ctx, -0.26, -0.46, -0.26, -0.2 );
		line( ctx, 0.26, -0.46, 0.26, -0.2 );
		line( ctx, 0, -0.48, 0, 0.5 );
		line( ctx, -0.16, 0.28, 0.16, 0.28 );
	},
	pluto( ctx ) {
		ctx.beginPath();
		ctx.arc( 0, -0.32, 0.11, 0, TAU );
		ctx.stroke();
		ctx.beginPath();
		ctx.arc( 0, -0.3, 0.24, Math.PI, 0, true );
		ctx.stroke();
		line( ctx, 0, -0.06, 0, 0.48 );
		line( ctx, -0.15, 0.24, 0.15, 0.24 );
	},
};

/* Sign glyph painters, order Aries..Pisces. */
const SIGNS = {
	aries( ctx ) {
		ctx.beginPath();
		ctx.moveTo( 0, 0.5 );
		ctx.lineTo( 0, -0.05 );
		ctx.quadraticCurveTo( -0.04, -0.4, -0.26, -0.42 );
		ctx.quadraticCurveTo( -0.46, -0.44, -0.44, -0.16 );
		ctx.stroke();
		ctx.beginPath();
		ctx.moveTo( 0, -0.05 );
		ctx.quadraticCurveTo( 0.04, -0.4, 0.26, -0.42 );
		ctx.quadraticCurveTo( 0.46, -0.44, 0.44, -0.16 );
		ctx.stroke();
	},
	taurus( ctx ) {
		ctx.beginPath();
		ctx.arc( 0, 0.14, 0.3, 0, TAU );
		ctx.stroke();
		ctx.beginPath();
		ctx.arc( 0, -0.44, 0.27, 0, Math.PI );
		ctx.stroke();
	},
	gemini( ctx ) {
		curve( ctx, -0.34, -0.34, 0, -0.52, 0.34, -0.34 );
		curve( ctx, -0.34, 0.34, 0, 0.52, 0.34, 0.34 );
		line( ctx, -0.14, -0.38, -0.14, 0.38 );
		line( ctx, 0.14, -0.38, 0.14, 0.38 );
	},
	cancer( ctx ) {
		ctx.beginPath();
		ctx.arc( -0.26, -0.1, 0.12, 0, TAU );
		ctx.stroke();
		ctx.beginPath();
		ctx.arc( 0.26, 0.1, 0.12, 0, TAU );
		ctx.stroke();
		// Flat tails: the "69 lying down" look of the crab.
		curve( ctx, -0.15, -0.16, 0.12, -0.34, 0.42, -0.14 );
		curve( ctx, 0.15, 0.16, -0.12, 0.34, -0.42, 0.14 );
	},
	leo( ctx ) {
		ctx.beginPath();
		ctx.arc( -0.22, 0.26, 0.13, 0, TAU );
		ctx.stroke();
		ctx.beginPath();
		ctx.moveTo( -0.13, 0.17 );
		ctx.quadraticCurveTo( -0.26, -0.3, 0, -0.4 );
		ctx.quadraticCurveTo( 0.26, -0.5, 0.24, -0.16 );
		ctx.quadraticCurveTo( 0.22, 0.06, 0.16, 0.26 );
		ctx.quadraticCurveTo( 0.12, 0.44, 0.32, 0.42 );
		ctx.stroke();
	},
	virgo( ctx ) {
		mLegs( ctx );
		ctx.beginPath();
		ctx.moveTo( 0.16, -0.12 );
		ctx.quadraticCurveTo( 0.2, 0.28, 0.02, 0.34 );
		ctx.quadraticCurveTo( 0.34, 0.36, 0.36, 0.5 );
		ctx.stroke();
	},
	libra( ctx ) {
		line( ctx, -0.42, 0.38, 0.42, 0.38 );
		line( ctx, -0.42, 0.12, -0.2, 0.12 );
		line( ctx, 0.2, 0.12, 0.42, 0.12 );
		ctx.beginPath();
		ctx.arc( 0, 0.12, 0.2, Math.PI, 0 );
		ctx.stroke();
	},
	scorpio( ctx ) {
		mLegs( ctx );
		line( ctx, 0.16, -0.12, 0.16, 0.3 );
		ctx.beginPath();
		ctx.moveTo( 0.16, 0.3 );
		ctx.quadraticCurveTo( 0.2, 0.44, 0.4, 0.38 );
		ctx.stroke();
		line( ctx, 0.4, 0.38, 0.28, 0.3 );
		line( ctx, 0.4, 0.38, 0.34, 0.5 );
	},
	sagittarius( ctx ) {
		line( ctx, -0.36, 0.36, 0.36, -0.36 );
		line( ctx, 0.08, -0.38, 0.38, -0.38 );
		line( ctx, 0.38, -0.38, 0.38, -0.08 );
		line( ctx, -0.24, -0.06, 0.06, 0.24 );
	},
	capricorn( ctx ) {
		ctx.beginPath();
		ctx.moveTo( -0.46, -0.28 );
		ctx.lineTo( -0.28, 0.06 );
		ctx.lineTo( -0.12, -0.32 );
		ctx.quadraticCurveTo( -0.02, -0.52, 0.04, -0.2 );
		ctx.lineTo( 0.08, 0.1 );
		ctx.stroke();
		ctx.beginPath();
		ctx.arc( 0.2, 0.22, 0.16, -1.4, 4.2 );
		ctx.stroke();
	},
	aquarius( ctx ) {
		wave( ctx, -0.16 );
		wave( ctx, 0.18 );
	},
	pisces( ctx ) {
		// Two outward-bowed verticals, clearly apart, tied by the bar.
		ctx.beginPath();
		ctx.arc( 0.13, 0, 0.4, Math.PI - 0.95, Math.PI + 0.95 );
		ctx.stroke();
		ctx.beginPath();
		ctx.arc( -0.13, 0, 0.4, -0.95, 0.95 );
		ctx.stroke();
		line( ctx, -0.27, 0, 0.27, 0 );
	},
};

function line( ctx, x1, y1, x2, y2 ) {
	ctx.beginPath();
	ctx.moveTo( x1, y1 );
	ctx.lineTo( x2, y2 );
	ctx.stroke();
}

function curve( ctx, x1, y1, cx, cy, x2, y2 ) {
	ctx.beginPath();
	ctx.moveTo( x1, y1 );
	ctx.quadraticCurveTo( cx, cy, x2, y2 );
	ctx.stroke();
}

/** The shared "m" of Virgo and Scorpio. */
function mLegs( ctx ) {
	ctx.beginPath();
	ctx.moveTo( -0.44, 0.34 );
	ctx.lineTo( -0.44, -0.16 );
	ctx.quadraticCurveTo( -0.42, -0.4, -0.3, -0.28 );
	ctx.quadraticCurveTo( -0.16, -0.4, -0.14, -0.16 );
	ctx.lineTo( -0.14, 0.34 );
	ctx.stroke();
	ctx.beginPath();
	ctx.moveTo( -0.14, -0.16 );
	ctx.quadraticCurveTo( -0.12, -0.4, 0.02, -0.28 );
	ctx.quadraticCurveTo( 0.14, -0.38, 0.16, -0.12 );
	ctx.stroke();
}

function wave( ctx, y ) {
	ctx.beginPath();
	ctx.moveTo( -0.42, y + 0.1 );
	ctx.lineTo( -0.21, y - 0.1 );
	ctx.lineTo( 0, y + 0.1 );
	ctx.lineTo( 0.21, y - 0.1 );
	ctx.lineTo( 0.42, y + 0.1 );
	ctx.stroke();
}

export const PLANET_KEYS = Object.keys( PLANETS );
export const SIGN_KEYS = Object.keys( SIGNS );

/**
 * Draw one glyph centred on (x, y) with height ~size.
 *
 * @param {CanvasRenderingContext2D} ctx   Target context.
 * @param {string}                   key   Planet or sign key.
 * @param {number}                   x     Centre x.
 * @param {number}                   y     Centre y.
 * @param {number}                   size  Em size in pixels.
 * @param {string}                   color Stroke/fill style.
 * @return {boolean} False when the key is unknown.
 */
export function drawGlyph( ctx, key, x, y, size, color ) {
	const painter = PLANETS[ key ] || SIGNS[ key ];
	if ( ! painter ) {
		return false;
	}
	ctx.save();
	ctx.translate( x, y );
	ctx.scale( size, size );
	ctx.lineWidth = 0.085;
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	ctx.strokeStyle = color;
	ctx.fillStyle = color;
	painter( ctx );
	ctx.restore();
	return true;
}
