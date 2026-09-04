/**
 * Motifs: hand-drawn vector shapes in a 100 x 100 box, each path with a
 * colour role (primary, secondary, accent, ink, bg). Drawn at any size
 * through a transform the editor's importer flattens. No third-party art.
 */
import { r } from './units.js';

const P = ( d, role, extra = '' ) => ( { d, role, extra } );
const ellipse = ( cx, cy, rx, ry ) =>
	`M${ cx - rx } ${ cy }A${ rx } ${ ry } 0 1 0 ${
		cx + rx
	} ${ cy }A${ rx } ${ ry } 0 1 0 ${ cx - rx } ${ cy }Z`;
const circle = ( cx, cy, rad ) => ellipse( cx, cy, rad, rad );
const starPath = ( cx, cy, R, n = 5 ) => {
	let d = '';
	for ( let i = 0; i < n * 2; i++ ) {
		const a = ( i * Math.PI ) / n - Math.PI / 2;
		const rad = i % 2 ? R * 0.42 : R;
		d +=
			( i ? 'L' : 'M' ) +
			r( cx + Math.cos( a ) * rad ) +
			' ' +
			r( cy + Math.sin( a ) * rad );
	}
	return d + 'Z';
};
const heartPath = ( cx, cy, s ) =>
	`M${ cx } ${ cy + s * 0.55 }C${ cx - s } ${ cy - s * 0.1 } ${
		cx - s * 0.65
	} ${ cy - s * 0.75 } ${ cx } ${ cy - s * 0.3 }C${ cx + s * 0.65 } ${
		cy - s * 0.75
	} ${ cx + s } ${ cy - s * 0.1 } ${ cx } ${ cy + s * 0.55 }Z`;

export const MOTIFS = {
	balloon: [
		P( ellipse( 50, 40, 26, 32 ), 'primary' ),
		P( 'M46 72L54 72L50 78Z', 'primary' ),
		P( 'M50 78C44 86 56 92 50 100', 'ink', 'fill="none" stroke-width="2"' ),
		P( ellipse( 40, 30, 6, 9 ), 'bg' ),
	],
	balloons: [
		P( ellipse( 30, 36, 18, 22 ), 'primary' ),
		P( ellipse( 62, 30, 18, 22 ), 'secondary' ),
		P( ellipse( 48, 52, 16, 20 ), 'accent' ),
		P(
			'M30 58L50 95M62 52L50 95M48 72L50 95',
			'ink',
			'fill="none" stroke-width="2"'
		),
	],
	cake: [
		P( 'M14 62H86V90H14Z', 'primary' ),
		P( 'M20 46H80V62H20Z', 'secondary' ),
		P( 'M26 32H74V46H26Z', 'primary' ),
		P( 'M48 12H52V32H48Z', 'accent' ),
		P( ellipse( 50, 8, 4, 6 ), 'accent' ),
		P(
			'M14 62C24 56 34 68 44 62C54 56 64 68 74 62C80 58 86 62 86 62',
			'bg',
			'fill="none" stroke-width="3"'
		),
	],
	candle: [
		P( 'M40 34H60V92H40Z', 'primary' ),
		P( 'M48 20H52V34H48Z', 'ink' ),
		P( ellipse( 50, 14, 5, 9 ), 'accent' ),
		P( 'M40 46H60V52H40Z', 'secondary' ),
	],
	crown: [
		P( 'M12 82L12 34L34 54L50 22L66 54L88 34L88 82Z', 'primary' ),
		P( 'M12 82H88V92H12Z', 'secondary' ),
		P( circle( 50, 20, 5 ), 'accent' ),
		P( circle( 12, 32, 4 ), 'accent' ),
		P( circle( 88, 32, 4 ), 'accent' ),
	],
	star: [ P( starPath( 50, 52, 46 ), 'accent' ) ],
	heart: [ P( heartPath( 50, 52, 44 ), 'primary' ) ],
	bow: [
		P( 'M50 50C30 20 6 28 12 50C6 72 30 80 50 50Z', 'primary' ),
		P( 'M50 50C70 20 94 28 88 50C94 72 70 80 50 50Z', 'primary' ),
		P( 'M42 42H58V58H42Z', 'secondary' ),
		P( 'M44 58L32 92L42 92L50 66L58 92L68 92L56 58Z', 'primary' ),
	],
	gift: [
		P( 'M16 40H84V90H16Z', 'primary' ),
		P( 'M12 30H88V44H12Z', 'secondary' ),
		P( 'M44 30H56V90H44Z', 'accent' ),
		P(
			'M50 30C36 30 30 16 40 12C48 10 50 24 50 30C50 24 52 10 60 12C70 16 64 30 50 30Z',
			'accent'
		),
	],
	flower: [
		P( circle( 50, 26, 13 ), 'primary' ),
		P( circle( 73, 43, 13 ), 'primary' ),
		P( circle( 64, 70, 13 ), 'primary' ),
		P( circle( 36, 70, 13 ), 'primary' ),
		P( circle( 27, 43, 13 ), 'primary' ),
		P( circle( 50, 50, 11 ), 'accent' ),
	],
	leaf: [
		P( 'M50 6C20 30 14 70 50 94C86 70 80 30 50 6Z', 'secondary' ),
		P( 'M50 14V90', 'ink', 'fill="none" stroke-width="2"' ),
	],
	branch: [
		P( 'M12 88C40 60 60 40 90 12', 'ink', 'fill="none" stroke-width="3"' ),
		P( 'M34 66C30 52 40 44 50 50C44 58 40 64 34 66Z', 'secondary' ),
		P( 'M56 44C52 30 62 22 72 28C66 36 62 42 56 44Z', 'secondary' ),
		P( 'M46 56C56 52 66 58 64 68C56 66 50 62 46 56Z', 'secondary' ),
	],
	rings: [
		P( circle( 38, 56, 24 ), 'accent', 'fill="none" stroke-width="6"' ),
		P( circle( 62, 56, 24 ), 'accent', 'fill="none" stroke-width="6"' ),
		P( 'M38 26L44 34H32Z', 'secondary' ),
	],
	bell: [
		P(
			'M50 12C34 12 30 26 30 40V62C30 70 24 74 22 78H78C76 74 70 70 70 62V40C70 26 66 12 50 12Z',
			'primary'
		),
		P( 'M20 78H80V84H20Z', 'secondary' ),
		P( circle( 50, 90, 6 ), 'ink' ),
		P( circle( 50, 10, 4 ), 'ink' ),
	],
	champagne: [
		P( 'M34 8H66L62 44C60 56 40 56 38 44Z', 'bg', 'stroke-width="2"' ),
		P( 'M37 30H63L62 44C60 56 40 56 38 44Z', 'accent' ),
		P( 'M48 56H52V84H48Z', 'ink' ),
		P( 'M34 84H66V90H34Z', 'ink' ),
		P( circle( 44, 36, 2 ), 'bg' ),
		P( circle( 54, 40, 2 ), 'bg' ),
	],
	snowflake: [
		P(
			'M50 6V94M12 28L88 72M12 72L88 28',
			'primary',
			'fill="none" stroke-width="5" stroke-linecap="round"'
		),
		P(
			'M50 22L40 12M50 22L60 12M50 78L40 88M50 78L60 88M26 36L14 34M26 36L24 24M74 64L86 66M74 64L76 76M26 64L14 66M26 64L24 76M74 36L86 34M74 36L76 24',
			'primary',
			'fill="none" stroke-width="4" stroke-linecap="round"'
		),
	],
	tree: [
		P( 'M50 8L74 40H58L80 66H62L88 88H12L38 66H20L42 40H26Z', 'secondary' ),
		P( 'M44 88H56V98H44Z', 'ink' ),
		P( starPath( 50, 8, 8 ), 'accent' ),
	],
	pumpkin: [
		P( ellipse( 50, 58, 40, 34 ), 'primary' ),
		P( 'M46 24H54V34H46Z', 'secondary' ),
		P(
			ellipse( 32, 58, 12, 32 ),
			'primary',
			'fill="none" stroke-width="2" stroke-opacity="0.5"'
		),
		P(
			ellipse( 68, 58, 12, 32 ),
			'primary',
			'fill="none" stroke-width="2" stroke-opacity="0.5"'
		),
		P(
			'M34 50L44 56L34 60ZM66 50L56 56L66 60ZM36 70C44 80 56 80 64 70L60 74L54 70L50 76L46 70L40 74Z',
			'ink'
		),
	],
	bat: [
		P(
			'M50 46C44 30 30 26 8 30C20 38 22 46 18 54C30 50 40 56 44 66C46 60 54 60 56 66C60 56 70 50 82 54C78 46 80 38 92 30C70 26 56 30 50 46Z',
			'ink'
		),
		P( circle( 47, 46, 2 ), 'bg' ),
		P( circle( 53, 46, 2 ), 'bg' ),
	],
	ghost: [
		P(
			'M50 8C26 8 20 30 20 48V88L30 78L40 88L50 78L60 88L70 78L80 88V48C80 30 74 8 50 8Z',
			'bg',
			'stroke-width="2"'
		),
		P( circle( 40, 40, 5 ), 'ink' ),
		P( circle( 60, 40, 5 ), 'ink' ),
		P( ellipse( 50, 56, 5, 7 ), 'ink' ),
	],
	egg: [
		P(
			'M50 6C74 6 80 40 80 60C80 80 66 94 50 94C34 94 20 80 20 60C20 40 26 6 50 6Z',
			'primary'
		),
		P( 'M22 48C40 40 60 56 78 48L79 58C60 66 40 50 21 58Z', 'accent' ),
		P(
			'M24 70C40 64 60 78 76 70',
			'secondary',
			'fill="none" stroke-width="4"'
		),
	],
	bunny: [
		P( ellipse( 36, 24, 8, 22 ), 'secondary' ),
		P( ellipse( 64, 24, 8, 22 ), 'secondary' ),
		P( ellipse( 36, 24, 4, 14 ), 'primary' ),
		P( ellipse( 64, 24, 4, 14 ), 'primary' ),
		P( circle( 50, 58, 30 ), 'secondary' ),
		P( circle( 40, 54, 3 ), 'ink' ),
		P( circle( 60, 54, 3 ), 'ink' ),
		P( 'M46 64H54L50 69Z', 'primary' ),
	],
	chick: [
		P( circle( 50, 58, 32 ), 'accent' ),
		P( circle( 42, 50, 3 ), 'ink' ),
		P( 'M58 52L74 58L58 64Z', 'primary' ),
		P(
			'M40 90L36 98M50 90V98M60 90L64 98',
			'primary',
			'fill="none" stroke-width="3"'
		),
	],
	anchor: [
		P( circle( 50, 16, 9 ), 'ink', 'fill="none" stroke-width="6"' ),
		P( 'M47 25H53V88H47Z', 'ink' ),
		P( 'M30 40H70V46H30Z', 'ink' ),
		P(
			'M50 90C30 90 18 74 16 60L28 62C30 72 40 80 50 80C60 80 70 72 72 62L84 60C82 74 70 90 50 90Z',
			'ink'
		),
	],
	butterfly: [
		P( 'M50 50C40 20 10 14 10 40C10 56 30 56 50 50Z', 'primary' ),
		P( 'M50 50C60 20 90 14 90 40C90 56 70 56 50 50Z', 'primary' ),
		P( 'M50 52C36 60 16 62 18 80C22 92 40 82 50 52Z', 'secondary' ),
		P( 'M50 52C64 60 84 62 82 80C78 92 60 82 50 52Z', 'secondary' ),
		P( ellipse( 50, 52, 4, 20 ), 'ink' ),
	],
	sun: [
		P( circle( 50, 50, 22 ), 'accent' ),
		P(
			'M50 6V20M50 80V94M6 50H20M80 50H94M19 19L29 29M71 71L81 81M19 81L29 71M71 29L81 19',
			'accent',
			'fill="none" stroke-width="6" stroke-linecap="round"'
		),
	],
	rainbow: [
		P(
			'M8 86A42 42 0 0 1 92 86',
			'primary',
			'fill="none" stroke-width="10"'
		),
		P(
			'M20 86A30 30 0 0 1 80 86',
			'accent',
			'fill="none" stroke-width="10"'
		),
		P(
			'M32 86A18 18 0 0 1 68 86',
			'secondary',
			'fill="none" stroke-width="10"'
		),
	],
	popper: [
		P( 'M14 86L34 44L56 66Z', 'primary' ),
		P( 'M34 44L56 66', 'secondary', 'fill="none" stroke-width="4"' ),
		P( starPath( 70, 26, 8 ), 'accent' ),
		P( circle( 82, 44, 5 ), 'secondary' ),
		P(
			'M60 30L64 18',
			'accent',
			'fill="none" stroke-width="4" stroke-linecap="round"'
		),
		P(
			'M78 62L90 66',
			'primary',
			'fill="none" stroke-width="4" stroke-linecap="round"'
		),
	],
	hat: [
		P( 'M50 10L82 90H18Z', 'primary' ),
		P( 'M42 30L74 90H60L36 44Z', 'secondary' ),
		P( circle( 50, 10, 8 ), 'accent' ),
		P( 'M18 90H82V96H18Z', 'accent' ),
	],
	icecream: [
		P( 'M30 46H70L50 96Z', 'secondary' ),
		P( circle( 50, 36, 22 ), 'primary' ),
		P( circle( 40, 26, 12 ), 'accent' ),
		P(
			'M34 56H66M38 68H62',
			'ink',
			'fill="none" stroke-width="2" stroke-opacity="0.4"'
		),
	],
	garland: [
		P( 'M4 20C30 60 70 60 96 20', 'ink', 'fill="none" stroke-width="2"' ),
		P( 'M14 32L26 50L34 30Z', 'primary' ),
		P( 'M36 44L48 62L58 42Z', 'secondary' ),
		P( 'M60 44L70 60L80 38Z', 'accent' ),
	],
	schoolcone: [
		P( 'M50 96L26 22H74Z', 'primary' ),
		P(
			'M22 24C30 12 40 30 50 18C60 30 70 12 78 24C70 30 60 28 50 30C40 28 30 30 22 24Z',
			'secondary'
		),
		P( 'M36 44L50 60L64 44', 'accent', 'fill="none" stroke-width="4"' ),
	],
	rattle: [
		P( circle( 50, 34, 24 ), 'primary' ),
		P( 'M46 56H54V90H46Z', 'secondary' ),
		P( circle( 50, 92, 7 ), 'accent' ),
		P( ellipse( 42, 26, 6, 8 ), 'bg' ),
	],
	pram: [
		P( 'M16 56C16 36 30 24 52 24V56Z', 'primary' ),
		P( 'M16 56H84C84 70 74 78 62 78H36C24 78 16 70 16 56Z', 'secondary' ),
		P( circle( 34, 88, 8 ), 'ink' ),
		P( circle( 66, 88, 8 ), 'ink' ),
		P(
			'M84 56L94 40',
			'ink',
			'fill="none" stroke-width="4" stroke-linecap="round"'
		),
	],
	dove: [
		P(
			'M20 56C30 40 50 40 60 52C70 44 84 44 92 50C80 52 72 58 70 68C56 72 40 70 30 62L14 66Z',
			'bg',
			'stroke-width="2"'
		),
		P(
			'M54 46C60 30 74 26 84 30C72 34 66 42 62 52Z',
			'bg',
			'stroke-width="2"'
		),
		P( circle( 82, 49, 2 ), 'ink' ),
		P( 'M92 50L98 52L92 54Z', 'accent' ),
	],
	mortarboard: [
		P( 'M50 22L94 42L50 62L6 42Z', 'ink' ),
		P(
			'M28 52V70C36 80 64 80 72 70V52',
			'ink',
			'fill="none" stroke-width="6"'
		),
		P( 'M94 42V66', 'accent', 'fill="none" stroke-width="3"' ),
		P( circle( 94, 70, 5 ), 'accent' ),
	],
	clock: [
		P( circle( 50, 50, 42 ), 'bg', 'stroke-width="5"' ),
		P(
			'M50 50V22M50 50L70 62',
			'ink',
			'fill="none" stroke-width="5" stroke-linecap="round"'
		),
		P( circle( 50, 50, 4 ), 'accent' ),
	],
	compass: [
		P( circle( 50, 50, 42 ), 'bg', 'stroke-width="5"' ),
		P( 'M50 14L60 50L50 86L40 50Z', 'accent' ),
		P( 'M50 14L60 50H40Z', 'primary' ),
		P( circle( 50, 50, 5 ), 'ink' ),
	],
	feather: [
		P(
			'M50 6C30 30 22 60 24 94C40 70 60 50 78 14C64 20 56 26 50 6Z',
			'secondary'
		),
		P( 'M28 90C40 64 52 44 70 20', 'ink', 'fill="none" stroke-width="2"' ),
	],
	diamond: [
		P( 'M20 36L36 18H64L80 36L50 86Z', 'accent' ),
		P(
			'M20 36H80L50 86ZM36 18L44 36M64 18L56 36',
			'bg',
			'fill="none" stroke-width="2"'
		),
	],
	moon: [
		P(
			'M62 8C34 12 18 34 20 58C24 84 52 96 76 88C50 84 36 66 40 44C42 28 52 16 62 8Z',
			'accent'
		),
		P( starPath( 78, 26, 7 ), 'accent' ),
	],
};

export const MOTIF_IDS = Object.keys( MOTIFS );

/** A motif of `size` (its box) at x, y in the caller's unit; colours by role. */
export function motif( id, o ) {
	const parts = MOTIFS[ id ];
	if ( ! parts ) {
		return '';
	}
	const k = ( o.size || 20 ) / 100;
	const c = o.colors || {};
	const inner = parts
		.map( ( p ) => {
			const fill = c[ p.role ] || '#000000';
			const extra = p.extra || '';
			const stroked =
				extra.includes( 'fill="none"' ) ||
				( 'bg' === p.role && extra.includes( 'stroke-width' ) );
			const paint = stroked
				? extra.includes( 'fill="none"' )
					? ` stroke="${ fill }"`
					: ` fill="${ fill }" stroke="${ c.ink || '#000' }"`
				: ` fill="${ fill }"`;
			return `<path d="${ p.d }"${ paint }${
				extra ? ' ' + extra : ''
			}/>`;
		} )
		.join( '' );
	const t = [ `translate(${ r( o.x || 0 ) } ${ r( o.y || 0 ) })` ];
	if ( o.rotate ) {
		t.push(
			`rotate(${ r( o.rotate ) } ${ r( 50 * k ) } ${ r( 50 * k ) })`
		);
	}
	t.push( `scale(${ r( ( o.flip ? -1 : 1 ) * k ) } ${ r( k ) })` );
	if ( o.flip ) {
		t.push( 'translate(-100 0)' );
	}
	return `<g transform="${ t.join( ' ' ) }">${ inner }</g>`;
}
