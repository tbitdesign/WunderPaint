/** Two approved batches of bold, editable shape families. */
import { _x } from '@wordpress/i18n';
export const ADDITIONAL_CATALOG_DEFINITIONS = [
	{
		id: 'catalog-radiusblock',
		source: 'radiusblock',
		name: () => _x( 'Rounded block', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Height', 'shape control', 'wunderpaint' ),
				min: 120,
				max: 240,
				step: 1,
				def: 205,
			},
			{
				key: 'a',
				label: () =>
					_x( 'Large rounding', 'shape control', 'wunderpaint' ),
				min: 40,
				max: 120,
				step: 1,
				def: 100,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Small rounding', 'shape control', 'wunderpaint' ),
				min: 0,
				max: 35,
				step: 1,
				def: 8,
			},
		],
		variants: [
			{
				n: 150,
				a: 65,
				b: 0,
			},
			{
				n: 235,
				a: 115,
				b: 30,
			},
		],
	},
	{
		id: 'catalog-schraegkapsel',
		source: 'schraegkapsel',
		name: () => _x( 'Slanted capsule', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Height', 'shape control', 'wunderpaint' ),
				min: 85,
				max: 220,
				step: 1,
				def: 140,
			},
			{
				key: 'a',
				label: () => _x( 'Shear', 'shape control', 'wunderpaint' ),
				min: -30,
				max: 30,
				step: 1,
				def: -22,
			},
			{
				key: 'b',
				label: () => _x( 'Roundness', 'shape control', 'wunderpaint' ),
				min: 12,
				max: 100,
				step: 1,
				def: 50,
			},
		],
		variants: [
			{
				n: 115,
				a: 25,
				b: 18,
			},
			{
				n: 195,
				a: -15,
				b: 85,
			},
		],
	},
	{
		id: 'catalog-schulterflaeche',
		source: 'schulterflaeche',
		name: () => _x( 'Shoulder panel', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Height', 'shape control', 'wunderpaint' ),
				min: 140,
				max: 230,
				step: 1,
				def: 190,
			},
			{
				key: 'a',
				label: () =>
					_x( 'Shoulder position', 'shape control', 'wunderpaint' ),
				min: -55,
				max: 45,
				step: 1,
				def: 5,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Shoulder depth', 'shape control', 'wunderpaint' ),
				min: 45,
				max: 135,
				step: 1,
				def: 130,
			},
		],
		variants: [
			{
				n: 160,
				a: -50,
				b: 110,
			},
			{
				n: 225,
				a: 35,
				b: 75,
			},
		],
	},
	{
		id: 'catalog-registerflaeche',
		source: 'registerflaeche',
		name: () => _x( 'Tab panel', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Height', 'shape control', 'wunderpaint' ),
				min: 100,
				max: 220,
				step: 1,
				def: 155,
			},
			{
				key: 'a',
				label: () => _x( 'Tab width', 'shape control', 'wunderpaint' ),
				min: 45,
				max: 140,
				step: 1,
				def: 90,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Tab position', 'shape control', 'wunderpaint' ),
				min: 0,
				max: 100,
				step: 1,
				def: 10,
			},
		],
		variants: [
			{
				n: 125,
				a: 65,
				b: 95,
			},
			{
				n: 205,
				a: 135,
				b: 25,
			},
		],
	},
	{
		id: 'catalog-taillenlabel',
		source: 'taillenlabel',
		name: () => _x( 'Waisted label', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Height', 'shape control', 'wunderpaint' ),
				min: 130,
				max: 220,
				step: 1,
				def: 155,
			},
			{
				key: 'a',
				label: () =>
					_x( 'Indentation', 'shape control', 'wunderpaint' ),
				min: 8,
				max: 48,
				step: 1,
				def: 38,
			},
			{
				key: 'b',
				label: () => _x( 'Focus', 'shape control', 'wunderpaint' ),
				min: -45,
				max: 45,
				step: 1,
				def: 0,
			},
		],
		variants: [
			{
				n: 145,
				a: 18,
				b: -35,
			},
			{
				n: 210,
				a: 47,
				b: 30,
			},
		],
	},
	{
		id: 'catalog-kerbenlabel',
		source: 'kerbenlabel',
		name: () => _x( 'Notched label', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Height', 'shape control', 'wunderpaint' ),
				min: 110,
				max: 215,
				step: 1,
				def: 150,
			},
			{
				key: 'a',
				label: () =>
					_x( 'Notch depth', 'shape control', 'wunderpaint' ),
				min: 15,
				max: 65,
				step: 1,
				def: 38,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Notch opening', 'shape control', 'wunderpaint' ),
				min: 15,
				max: 50,
				step: 1,
				def: 40,
			},
		],
		variants: [
			{
				n: 120,
				a: 60,
				b: 25,
			},
			{
				n: 200,
				a: 25,
				b: 48,
			},
		],
	},
	{
		id: 'catalog-bogenkeil',
		source: 'bogenkeil',
		name: () => _x( 'Curved wedge', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Height', 'shape control', 'wunderpaint' ),
				min: 110,
				max: 235,
				step: 1,
				def: 190,
			},
			{
				key: 'a',
				label: () =>
					_x( 'Shoulder width', 'shape control', 'wunderpaint' ),
				min: 20,
				max: 115,
				step: 1,
				def: 75,
			},
			{
				key: 'b',
				label: () => _x( 'Sway', 'shape control', 'wunderpaint' ),
				min: 0,
				max: 80,
				step: 1,
				def: 45,
			},
		],
		variants: [
			{
				n: 140,
				a: 110,
				b: 10,
			},
			{
				n: 225,
				a: 35,
				b: 70,
			},
		],
	},
	{
		id: 'catalog-doppelkopf',
		source: 'doppelkopf',
		name: () => _x( 'Twin lobe', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () =>
					_x( 'Head height', 'shape control', 'wunderpaint' ),
				min: 60,
				max: 100,
				step: 1,
				def: 83,
			},
			{
				key: 'a',
				label: () =>
					_x( 'Waist width', 'shape control', 'wunderpaint' ),
				min: 20,
				max: 55,
				step: 1,
				def: 37,
			},
			{
				key: 'b',
				label: () => _x( 'Transition', 'shape control', 'wunderpaint' ),
				min: 5,
				max: 75,
				step: 1,
				def: 45,
			},
		],
		variants: [
			{
				n: 68,
				a: 23,
				b: 15,
			},
			{
				n: 98,
				a: 53,
				b: 65,
			},
		],
	},
	{
		id: 'catalog-schraeglasche',
		source: 'schraeglasche',
		name: () => _x( 'Angled tab', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Height', 'shape control', 'wunderpaint' ),
				min: 105,
				max: 205,
				step: 1,
				def: 135,
			},
			{
				key: 'a',
				label: () => _x( 'Slant', 'shape control', 'wunderpaint' ),
				min: 20,
				max: 70,
				step: 1,
				def: 47,
			},
			{
				key: 'b',
				label: () => _x( 'Tab length', 'shape control', 'wunderpaint' ),
				min: 12,
				max: 65,
				step: 1,
				def: 37,
			},
		],
		variants: [
			{
				n: 110,
				a: 65,
				b: 55,
			},
			{
				n: 190,
				a: 25,
				b: 20,
			},
		],
	},
	{
		id: 'catalog-versatzblock',
		source: 'versatzblock',
		name: () => _x( 'Offset block', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () =>
					_x( 'Section height', 'shape control', 'wunderpaint' ),
				min: 60,
				max: 120,
				step: 1,
				def: 100,
			},
			{
				key: 'a',
				label: () => _x( 'Offset', 'shape control', 'wunderpaint' ),
				min: 25,
				max: 90,
				step: 1,
				def: 53,
			},
			{
				key: 'b',
				label: () => _x( 'Roundness', 'shape control', 'wunderpaint' ),
				min: 0,
				max: 30,
				step: 1,
				def: 12,
			},
		],
		variants: [
			{
				n: 72,
				a: 80,
				b: 0,
			},
			{
				n: 115,
				a: 35,
				b: 28,
			},
		],
	},
	{
		id: 'catalog-kreisbucht',
		source: 'kreisbucht',
		name: () => _x( 'Circular bite', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () =>
					_x( 'Cutout size', 'shape control', 'wunderpaint' ),
				min: 75,
				max: 180,
				step: 1,
				def: 145,
			},
			{
				key: 'a',
				label: () =>
					_x( 'Open corner', 'shape control', 'wunderpaint' ),
				min: 0,
				max: 3,
				step: 1,
				def: 0,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Outer rounding', 'shape control', 'wunderpaint' ),
				min: 0,
				max: 35,
				step: 1,
				def: 8,
			},
		],
		variants: [
			{
				n: 95,
				a: 1,
				b: 25,
			},
			{
				n: 175,
				a: 0,
				b: 0,
			},
		],
	},
	{
		id: 'catalog-schraegschlitz',
		source: 'schraegschlitz',
		name: () => _x( 'Diagonal slot', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Slot width', 'shape control', 'wunderpaint' ),
				min: 28,
				max: 85,
				step: 1,
				def: 52,
			},
			{
				key: 'a',
				label: () => _x( 'Shear', 'shape control', 'wunderpaint' ),
				min: -45,
				max: 45,
				step: 1,
				def: 35,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Outer rounding', 'shape control', 'wunderpaint' ),
				min: 0,
				max: 65,
				step: 1,
				def: 42,
			},
		],
		variants: [
			{
				n: 35,
				a: -40,
				b: 5,
			},
			{
				n: 80,
				a: 20,
				b: 62,
			},
		],
	},
	{
		id: 'catalog-versetztesfenster',
		source: 'versetztesfenster',
		name: () => _x( 'Offset window', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () =>
					_x( 'Border thickness', 'shape control', 'wunderpaint' ),
				min: 33,
				max: 70,
				step: 1,
				def: 43,
			},
			{
				key: 'a',
				label: () =>
					_x( 'Horizontal offset', 'shape control', 'wunderpaint' ),
				min: -22,
				max: 22,
				step: 1,
				def: 18,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Vertical offset', 'shape control', 'wunderpaint' ),
				min: -22,
				max: 22,
				step: 1,
				def: -16,
			},
		],
		variants: [
			{
				n: 35,
				a: -20,
				b: 20,
			},
			{
				n: 65,
				a: 15,
				b: -15,
			},
		],
	},
	{
		id: 'catalog-kerbkreis',
		source: 'kerbkreis',
		name: () => _x( 'Notched disc', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Notches', 'shape control', 'wunderpaint' ),
				min: 1,
				max: 5,
				step: 1,
				def: 3,
			},
			{
				key: 'a',
				label: () =>
					_x( 'Opening angle', 'shape control', 'wunderpaint' ),
				min: 12,
				max: 45,
				step: 1,
				def: 28,
			},
			{
				key: 'b',
				label: () => _x( 'Depth', 'shape control', 'wunderpaint' ),
				min: 35,
				max: 90,
				step: 1,
				def: 68,
			},
		],
		variants: [
			{
				n: 2,
				a: 40,
				b: 85,
			},
			{
				n: 5,
				a: 20,
				b: 48,
			},
		],
	},
	{
		id: 'catalog-fensterkreis',
		source: 'fensterkreis',
		name: () => _x( 'Window disc', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () =>
					_x( 'Window width', 'shape control', 'wunderpaint' ),
				min: 38,
				max: 95,
				step: 1,
				def: 73,
			},
			{
				key: 'a',
				label: () => _x( 'Offset', 'shape control', 'wunderpaint' ),
				min: -30,
				max: 30,
				step: 1,
				def: 12,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Window rounding', 'shape control', 'wunderpaint' ),
				min: 0,
				max: 47,
				step: 1,
				def: 32,
			},
		],
		variants: [
			{
				n: 45,
				a: -27,
				b: 4,
			},
			{
				n: 94,
				a: 0,
				b: 46,
			},
		],
	},
	{
		id: 'catalog-viertelringblock',
		source: 'viertelringblock',
		name: () => _x( 'Quarter band', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Band width', 'shape control', 'wunderpaint' ),
				min: 38,
				max: 100,
				step: 1,
				def: 65,
			},
			{
				key: 'a',
				label: () => _x( 'Rotation', 'shape control', 'wunderpaint' ),
				min: -45,
				max: 45,
				step: 1,
				def: 0,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Foot length', 'shape control', 'wunderpaint' ),
				min: 20,
				max: 100,
				step: 1,
				def: 70,
			},
		],
		variants: [
			{
				n: 45,
				a: -35,
				b: 30,
			},
			{
				n: 95,
				a: 25,
				b: 95,
			},
		],
	},
	{
		id: 'catalog-bisskante',
		source: 'bisskante',
		name: () => _x( 'Scalloped edge', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Cutouts', 'shape control', 'wunderpaint' ),
				min: 2,
				max: 4,
				step: 1,
				def: 3,
			},
			{
				key: 'a',
				label: () => _x( 'Depth', 'shape control', 'wunderpaint' ),
				min: 12,
				max: 27,
				step: 1,
				def: 25,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Panel height', 'shape control', 'wunderpaint' ),
				min: 105,
				max: 220,
				step: 1,
				def: 160,
			},
		],
		variants: [
			{
				n: 2,
				a: 27,
				b: 130,
			},
			{
				n: 4,
				a: 19,
				b: 205,
			},
		],
	},
	{
		id: 'catalog-bogenpaar',
		source: 'bogenpaar',
		name: () => _x( 'Semicircle pair', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Radius', 'shape control', 'wunderpaint' ),
				min: 70,
				max: 120,
				step: 1,
				def: 102,
			},
			{
				key: 'a',
				label: () => _x( 'Spacing', 'shape control', 'wunderpaint' ),
				min: 8,
				max: 65,
				step: 1,
				def: 28,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Height offset', 'shape control', 'wunderpaint' ),
				min: -50,
				max: 50,
				step: 1,
				def: 23,
			},
		],
		variants: [
			{
				n: 115,
				a: 55,
				b: -38,
			},
			{
				n: 90,
				a: 12,
				b: 10,
			},
		],
	},
	{
		id: 'catalog-rundschlitz',
		source: 'rundschlitz',
		name: () => _x( 'Open slot', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () =>
					_x( 'Outer rounding', 'shape control', 'wunderpaint' ),
				min: 0,
				max: 65,
				step: 1,
				def: 44,
			},
			{
				key: 'a',
				label: () =>
					_x( 'Slot height', 'shape control', 'wunderpaint' ),
				min: 35,
				max: 105,
				step: 1,
				def: 68,
			},
			{
				key: 'b',
				label: () => _x( 'Slot depth', 'shape control', 'wunderpaint' ),
				min: 70,
				max: 150,
				step: 1,
				def: 120,
			},
		],
		variants: [
			{
				n: 8,
				a: 100,
				b: 145,
			},
			{
				n: 62,
				a: 42,
				b: 90,
			},
		],
	},
	{
		id: 'catalog-keilfenster',
		source: 'keilfenster',
		name: () => _x( 'Wedge window', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () =>
					_x( 'Window width', 'shape control', 'wunderpaint' ),
				min: 25,
				max: 54,
				step: 1,
				def: 44,
			},
			{
				key: 'a',
				label: () =>
					_x( 'Window height', 'shape control', 'wunderpaint' ),
				min: 30,
				max: 62,
				step: 1,
				def: 51,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Window offset', 'shape control', 'wunderpaint' ),
				min: -12,
				max: 12,
				step: 1,
				def: 0,
			},
		],
		variants: [
			{
				n: 28,
				a: 58,
				b: -10,
			},
			{
				n: 53,
				a: 40,
				b: 8,
			},
		],
	},
	{
		id: 'catalog-sband',
		source: 'sband',
		name: () => _x( 'S band', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Band width', 'shape control', 'wunderpaint' ),
				min: 30,
				max: 62,
				step: 1,
				def: 48,
			},
			{
				key: 'a',
				label: () => _x( 'Bend width', 'shape control', 'wunderpaint' ),
				min: 12,
				max: 42,
				step: 1,
				def: 24,
			},
			{
				key: 'b',
				label: () => _x( 'End length', 'shape control', 'wunderpaint' ),
				min: 80,
				max: 125,
				step: 1,
				def: 108,
			},
		],
		variants: [
			{
				n: 34,
				a: 38,
				b: 120,
			},
			{
				n: 60,
				a: 14,
				b: 90,
			},
		],
	},
	{
		id: 'catalog-knickband',
		source: 'knickband',
		name: () => _x( 'Elbow band', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Band width', 'shape control', 'wunderpaint' ),
				min: 28,
				max: 78,
				step: 1,
				def: 53,
			},
			{
				key: 'a',
				label: () =>
					_x( 'Step height', 'shape control', 'wunderpaint' ),
				min: 25,
				max: 85,
				step: 1,
				def: 57,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Elbow position', 'shape control', 'wunderpaint' ),
				min: -60,
				max: 10,
				step: 1,
				def: -35,
			},
		],
		variants: [
			{
				n: 33,
				a: 80,
				b: -55,
			},
			{
				n: 75,
				a: 35,
				b: 0,
			},
		],
	},
	{
		id: 'catalog-verjuengterbogen',
		source: 'verjuengterbogen',
		name: () => _x( 'Tapered arc', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Opening', 'shape control', 'wunderpaint' ),
				min: 130,
				max: 300,
				step: 1,
				def: 245,
			},
			{
				key: 'a',
				label: () => _x( 'Band width', 'shape control', 'wunderpaint' ),
				min: 35,
				max: 85,
				step: 1,
				def: 68,
			},
			{
				key: 'b',
				label: () => _x( 'Taper', 'shape control', 'wunderpaint' ),
				min: 15,
				max: 68,
				step: 1,
				def: 52,
			},
		],
		variants: [
			{
				n: 175,
				a: 45,
				b: 25,
			},
			{
				n: 285,
				a: 82,
				b: 65,
			},
		],
	},
	{
		id: 'catalog-umlenkung',
		source: 'umlenkung',
		name: () => _x( 'U bend', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Band width', 'shape control', 'wunderpaint' ),
				min: 28,
				max: 62,
				step: 1,
				def: 49,
			},
			{
				key: 'a',
				label: () =>
					_x( 'Bend radius', 'shape control', 'wunderpaint' ),
				min: 80,
				max: 115,
				step: 1,
				def: 96,
			},
			{
				key: 'b',
				label: () => _x( 'Arm length', 'shape control', 'wunderpaint' ),
				min: 55,
				max: 135,
				step: 1,
				def: 115,
			},
		],
		variants: [
			{
				n: 33,
				a: 110,
				b: 75,
			},
			{
				n: 60,
				a: 85,
				b: 130,
			},
		],
	},
	{
		id: 'catalog-gegenwelle',
		source: 'gegenwelle',
		name: () => _x( 'Counterwave', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Sway', 'shape control', 'wunderpaint' ),
				min: 20,
				max: 90,
				step: 1,
				def: 67,
			},
			{
				key: 'a',
				label: () => _x( 'Spacing', 'shape control', 'wunderpaint' ),
				min: 12,
				max: 55,
				step: 1,
				def: 26,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Panel height', 'shape control', 'wunderpaint' ),
				min: 80,
				max: 120,
				step: 1,
				def: 103,
			},
		],
		variants: [
			{
				n: 35,
				a: 50,
				b: 90,
			},
			{
				n: 85,
				a: 16,
				b: 115,
			},
		],
	},
	{
		id: 'catalog-spiralblock',
		source: 'spiralblock',
		name: () => _x( 'Bold spiral', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Turns (%)', 'shape control', 'wunderpaint' ),
				min: 85,
				max: 145,
				step: 1,
				def: 125,
			},
			{
				key: 'a',
				label: () => _x( 'Band width', 'shape control', 'wunderpaint' ),
				min: 24,
				max: 42,
				step: 1,
				def: 36,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Inner radius', 'shape control', 'wunderpaint' ),
				min: 12,
				max: 48,
				step: 1,
				def: 24,
			},
		],
		variants: [
			{
				n: 90,
				a: 30,
				b: 38,
			},
			{
				n: 140,
				a: 41,
				b: 25,
			},
		],
	},
	{
		id: 'catalog-bogenstaffel',
		source: 'bogenstaffel',
		name: () => _x( 'Arch stack', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Arches', 'shape control', 'wunderpaint' ),
				min: 2,
				max: 4,
				step: 1,
				def: 3,
			},
			{
				key: 'a',
				label: () => _x( 'Spacing', 'shape control', 'wunderpaint' ),
				min: 6,
				max: 14,
				step: 1,
				def: 9,
			},
			{
				key: 'b',
				label: () => _x( 'Opening', 'shape control', 'wunderpaint' ),
				min: 120,
				max: 225,
				step: 1,
				def: 190,
			},
		],
		variants: [
			{
				n: 2,
				a: 14,
				b: 155,
			},
			{
				n: 4,
				a: 6,
				b: 215,
			},
		],
	},
	{
		id: 'catalog-klammerband',
		source: 'klammerband',
		name: () => _x( 'Bold brace', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Band width', 'shape control', 'wunderpaint' ),
				min: 28,
				max: 65,
				step: 1,
				def: 48,
			},
			{
				key: 'a',
				label: () =>
					_x( 'Shoulder span', 'shape control', 'wunderpaint' ),
				min: 45,
				max: 105,
				step: 1,
				def: 85,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Center inset', 'shape control', 'wunderpaint' ),
				min: 12,
				max: 55,
				step: 1,
				def: 35,
			},
		],
		variants: [
			{
				n: 34,
				a: 100,
				b: 50,
			},
			{
				n: 62,
				a: 58,
				b: 18,
			},
		],
	},
	{
		id: 'catalog-knotenband',
		source: 'knotenband',
		name: () => _x( 'Loop link', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () =>
					_x( 'Outer height', 'shape control', 'wunderpaint' ),
				min: 58,
				max: 88,
				step: 1,
				def: 70,
			},
			{
				key: 'a',
				label: () => _x( 'Band width', 'shape control', 'wunderpaint' ),
				min: 18,
				max: 35,
				step: 1,
				def: 27,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Center bridge', 'shape control', 'wunderpaint' ),
				min: 16,
				max: 52,
				step: 1,
				def: 30,
			},
		],
		variants: [
			{
				n: 62,
				a: 20,
				b: 45,
			},
			{
				n: 85,
				a: 34,
				b: 22,
			},
		],
	},
	{
		id: 'catalog-schwenkband',
		source: 'schwenkband',
		name: () => _x( 'Rounded elbow', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Band width', 'shape control', 'wunderpaint' ),
				min: 32,
				max: 78,
				step: 1,
				def: 57,
			},
			{
				key: 'a',
				label: () =>
					_x( 'Corner radius', 'shape control', 'wunderpaint' ),
				min: 85,
				max: 145,
				step: 1,
				def: 102,
			},
			{
				key: 'b',
				label: () => _x( 'Arm length', 'shape control', 'wunderpaint' ),
				min: 60,
				max: 140,
				step: 1,
				def: 110,
			},
		],
		variants: [
			{
				n: 38,
				a: 140,
				b: 75,
			},
			{
				n: 75,
				a: 90,
				b: 135,
			},
		],
	},
	{
		id: 'catalog-rotor',
		source: 'rotor',
		name: () => _x( 'Rotor', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Arms', 'shape control', 'wunderpaint' ),
				min: 3,
				max: 6,
				step: 1,
				def: 4,
			},
			{
				key: 'a',
				label: () => _x( 'Sway', 'shape control', 'wunderpaint' ),
				min: 10,
				max: 65,
				step: 1,
				def: 40,
			},
			{
				key: 'b',
				label: () => _x( 'Arm width', 'shape control', 'wunderpaint' ),
				min: 35,
				max: 75,
				step: 1,
				def: 58,
			},
		],
		variants: [
			{
				n: 3,
				a: 60,
				b: 45,
			},
			{
				n: 5,
				a: 20,
				b: 65,
			},
		],
	},
	{
		id: 'catalog-rundstern',
		source: 'rundstern',
		name: () => _x( 'Rounded star', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Arms', 'shape control', 'wunderpaint' ),
				min: 4,
				max: 8,
				step: 1,
				def: 6,
			},
			{
				key: 'a',
				label: () => _x( 'Arm width', 'shape control', 'wunderpaint' ),
				min: 35,
				max: 76,
				step: 1,
				def: 56,
			},
			{
				key: 'b',
				label: () =>
					_x( 'End rounding', 'shape control', 'wunderpaint' ),
				min: 0,
				max: 38,
				step: 1,
				def: 28,
			},
		],
		variants: [
			{
				n: 5,
				a: 43,
				b: 8,
			},
			{
				n: 7,
				a: 70,
				b: 35,
			},
		],
	},
	{
		id: 'catalog-vierboegen',
		source: 'vierboegen',
		name: () => _x( 'Quarter discs', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () =>
					_x( 'Center spacing', 'shape control', 'wunderpaint' ),
				min: 8,
				max: 45,
				step: 1,
				def: 18,
			},
			{
				key: 'a',
				label: () =>
					_x( 'Module size', 'shape control', 'wunderpaint' ),
				min: 75,
				max: 120,
				step: 1,
				def: 105,
			},
			{
				key: 'b',
				label: () => _x( 'Offset', 'shape control', 'wunderpaint' ),
				min: 0,
				max: 35,
				step: 1,
				def: 7,
			},
		],
		variants: [
			{
				n: 38,
				a: 90,
				b: 25,
			},
			{
				n: 10,
				a: 118,
				b: 2,
			},
		],
	},
	{
		id: 'catalog-eckkreuz',
		source: 'eckkreuz',
		name: () => _x( 'Corner cross', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Arm width', 'shape control', 'wunderpaint' ),
				min: 25,
				max: 55,
				step: 1,
				def: 40,
			},
			{
				key: 'a',
				label: () =>
					_x( 'Center opening', 'shape control', 'wunderpaint' ),
				min: 15,
				max: 55,
				step: 1,
				def: 28,
			},
			{
				key: 'b',
				label: () => _x( 'Arm length', 'shape control', 'wunderpaint' ),
				min: 95,
				max: 130,
				step: 1,
				def: 115,
			},
		],
		variants: [
			{
				n: 28,
				a: 50,
				b: 125,
			},
			{
				n: 52,
				a: 18,
				b: 105,
			},
		],
	},
	{
		id: 'catalog-blockfaecher',
		source: 'blockfaecher',
		name: () => _x( 'Block fan', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Panels', 'shape control', 'wunderpaint' ),
				min: 3,
				max: 6,
				step: 1,
				def: 4,
			},
			{
				key: 'a',
				label: () => _x( 'Opening', 'shape control', 'wunderpaint' ),
				min: 95,
				max: 180,
				step: 1,
				def: 140,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Angular gap', 'shape control', 'wunderpaint' ),
				min: 3,
				max: 9,
				step: 1,
				def: 6,
			},
		],
		variants: [
			{
				n: 3,
				a: 110,
				b: 9,
			},
			{
				n: 5,
				a: 175,
				b: 4,
			},
		],
	},
	{
		id: 'catalog-punktverbund',
		source: 'punktverbund',
		name: () => _x( 'Lobe cluster', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Lobes', 'shape control', 'wunderpaint' ),
				min: 3,
				max: 5,
				step: 1,
				def: 3,
			},
			{
				key: 'a',
				label: () => _x( 'Prominence', 'shape control', 'wunderpaint' ),
				min: 35,
				max: 59,
				step: 1,
				def: 47,
			},
			{
				key: 'b',
				label: () => _x( 'Core width', 'shape control', 'wunderpaint' ),
				min: 58,
				max: 90,
				step: 1,
				def: 76,
			},
		],
		variants: [
			{
				n: 3,
				a: 37,
				b: 88,
			},
			{
				n: 5,
				a: 57,
				b: 60,
			},
		],
	},
	{
		id: 'catalog-doppellinse',
		source: 'doppellinse',
		name: () => _x( 'Double lens', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () =>
					_x( 'Lens height', 'shape control', 'wunderpaint' ),
				min: 90,
				max: 165,
				step: 1,
				def: 128,
			},
			{
				key: 'a',
				label: () => _x( 'Spacing', 'shape control', 'wunderpaint' ),
				min: 10,
				max: 45,
				step: 1,
				def: 23,
			},
			{
				key: 'b',
				label: () => _x( 'Asymmetry', 'shape control', 'wunderpaint' ),
				min: -40,
				max: 40,
				step: 1,
				def: 25,
			},
		],
		variants: [
			{
				n: 100,
				a: 40,
				b: -30,
			},
			{
				n: 160,
				a: 12,
				b: 10,
			},
		],
	},
	{
		id: 'catalog-spitzbogenblock',
		source: 'spitzbogenblock',
		name: () => _x( 'Concave star', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Extent', 'shape control', 'wunderpaint' ),
				min: 90,
				max: 135,
				step: 1,
				def: 120,
			},
			{
				key: 'a',
				label: () => _x( 'Fullness', 'shape control', 'wunderpaint' ),
				min: 12,
				max: 70,
				step: 1,
				def: 34,
			},
			{
				key: 'b',
				label: () => _x( 'Rotation', 'shape control', 'wunderpaint' ),
				min: -45,
				max: 45,
				step: 1,
				def: 0,
			},
		],
		variants: [
			{
				n: 115,
				a: 15,
				b: 35,
			},
			{
				n: 130,
				a: 65,
				b: 0,
			},
		],
	},
	{
		id: 'catalog-scheibenversatz',
		source: 'scheibenversatz',
		name: () => _x( 'Shifted disc', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Segments', 'shape control', 'wunderpaint' ),
				min: 2,
				max: 5,
				step: 1,
				def: 3,
			},
			{
				key: 'a',
				label: () => _x( 'Spacing', 'shape control', 'wunderpaint' ),
				min: 6,
				max: 22,
				step: 1,
				def: 12,
			},
			{
				key: 'b',
				label: () => _x( 'Offset', 'shape control', 'wunderpaint' ),
				min: -38,
				max: 38,
				step: 1,
				def: 26,
			},
		],
		variants: [
			{
				n: 2,
				a: 20,
				b: -30,
			},
			{
				n: 4,
				a: 8,
				b: 18,
			},
		],
	},
	{
		id: 'catalog-faecherrosette',
		source: 'faecherrosette',
		name: () => _x( 'Facet rosette', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Panels', 'shape control', 'wunderpaint' ),
				min: 3,
				max: 7,
				step: 1,
				def: 5,
			},
			{
				key: 'a',
				label: () =>
					_x( 'Center opening', 'shape control', 'wunderpaint' ),
				min: 18,
				max: 55,
				step: 1,
				def: 30,
			},
			{
				key: 'b',
				label: () => _x( 'Twist', 'shape control', 'wunderpaint' ),
				min: 10,
				max: 85,
				step: 1,
				def: 45,
			},
		],
		variants: [
			{
				n: 4,
				a: 50,
				b: 75,
			},
			{
				n: 6,
				a: 22,
				b: 20,
			},
		],
	},
	{
		id: 'catalog-schachflaeche',
		source: 'schachflaeche',
		name: () => _x( 'Checker field', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Grid', 'shape control', 'wunderpaint' ),
				min: 2,
				max: 5,
				step: 1,
				def: 4,
			},
			{
				key: 'a',
				label: () => _x( 'Spacing', 'shape control', 'wunderpaint' ),
				min: 0,
				max: 12,
				step: 1,
				def: 5,
			},
			{
				key: 'b',
				label: () => _x( 'Roundness', 'shape control', 'wunderpaint' ),
				min: 0,
				max: 20,
				step: 1,
				def: 4,
			},
		],
		variants: [
			{
				n: 3,
				a: 12,
				b: 18,
			},
			{
				n: 5,
				a: 1,
				b: 0,
			},
		],
	},
	{
		id: 'catalog-kapselraster',
		source: 'kapselraster',
		name: () => _x( 'Capsule grid', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Rows', 'shape control', 'wunderpaint' ),
				min: 2,
				max: 4,
				step: 1,
				def: 3,
			},
			{
				key: 'a',
				label: () => _x( 'Spacing', 'shape control', 'wunderpaint' ),
				min: 7,
				max: 22,
				step: 1,
				def: 13,
			},
			{
				key: 'b',
				label: () => _x( 'Row offset', 'shape control', 'wunderpaint' ),
				min: 0,
				max: 30,
				step: 1,
				def: 17,
			},
		],
		variants: [
			{
				n: 2,
				a: 20,
				b: 28,
			},
			{
				n: 4,
				a: 8,
				b: 5,
			},
		],
	},
	{
		id: 'catalog-bogenkacheln',
		source: 'bogenkacheln',
		name: () => _x( 'Quarter tiles', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Grid', 'shape control', 'wunderpaint' ),
				min: 2,
				max: 4,
				step: 1,
				def: 3,
			},
			{
				key: 'a',
				label: () => _x( 'Spacing', 'shape control', 'wunderpaint' ),
				min: 0,
				max: 14,
				step: 1,
				def: 5,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Arrangement', 'shape control', 'wunderpaint' ),
				min: 0,
				max: 3,
				step: 1,
				def: 0,
			},
		],
		variants: [
			{
				n: 2,
				a: 12,
				b: 1,
			},
			{
				n: 4,
				a: 2,
				b: 2,
			},
		],
	},
	{
		id: 'catalog-halbkreisstaffel',
		source: 'halbkreisstaffel',
		name: () => _x( 'Semicircle stack', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () =>
					_x( 'Semicircles', 'shape control', 'wunderpaint' ),
				min: 2,
				max: 4,
				step: 1,
				def: 3,
			},
			{
				key: 'a',
				label: () => _x( 'Width', 'shape control', 'wunderpaint' ),
				min: 65,
				max: 115,
				step: 1,
				def: 90,
			},
			{
				key: 'b',
				label: () => _x( 'Spacing', 'shape control', 'wunderpaint' ),
				min: 6,
				max: 30,
				step: 1,
				def: 12,
			},
		],
		variants: [
			{
				n: 2,
				a: 115,
				b: 25,
			},
			{
				n: 4,
				a: 75,
				b: 8,
			},
		],
	},
	{
		id: 'catalog-keilkacheln',
		source: 'keilkacheln',
		name: () => _x( 'Wedge tiles', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Grid', 'shape control', 'wunderpaint' ),
				min: 2,
				max: 4,
				step: 1,
				def: 3,
			},
			{
				key: 'a',
				label: () => _x( 'Spacing', 'shape control', 'wunderpaint' ),
				min: 4,
				max: 17,
				step: 1,
				def: 9,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Wedge width', 'shape control', 'wunderpaint' ),
				min: 15,
				max: 80,
				step: 1,
				def: 38,
			},
		],
		variants: [
			{
				n: 2,
				a: 16,
				b: 20,
			},
			{
				n: 4,
				a: 5,
				b: 65,
			},
		],
	},
	{
		id: 'catalog-blockwelle',
		source: 'blockwelle',
		name: () => _x( 'Wave bands', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Bands', 'shape control', 'wunderpaint' ),
				min: 2,
				max: 5,
				step: 1,
				def: 3,
			},
			{
				key: 'a',
				label: () => _x( 'Spacing', 'shape control', 'wunderpaint' ),
				min: 8,
				max: 22,
				step: 1,
				def: 15,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Wave height', 'shape control', 'wunderpaint' ),
				min: 20,
				max: 95,
				step: 1,
				def: 75,
			},
		],
		variants: [
			{
				n: 2,
				a: 22,
				b: 40,
			},
			{
				n: 4,
				a: 10,
				b: 90,
			},
		],
	},
	{
		id: 'catalog-diagonalfelder',
		source: 'diagonalfelder',
		name: () => _x( 'Elbow strips', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Panels', 'shape control', 'wunderpaint' ),
				min: 2,
				max: 5,
				step: 1,
				def: 4,
			},
			{
				key: 'a',
				label: () => _x( 'Spacing', 'shape control', 'wunderpaint' ),
				min: 7,
				max: 22,
				step: 1,
				def: 12,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Elbow depth', 'shape control', 'wunderpaint' ),
				min: -100,
				max: 100,
				step: 1,
				def: 75,
			},
		],
		variants: [
			{
				n: 3,
				a: 20,
				b: -85,
			},
			{
				n: 5,
				a: 8,
				b: 45,
			},
		],
	},
	{
		id: 'catalog-kreissegmente',
		source: 'kreissegmente',
		name: () => _x( 'Quarter rings', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () =>
					_x( 'Module size', 'shape control', 'wunderpaint' ),
				min: 85,
				max: 125,
				step: 1,
				def: 110,
			},
			{
				key: 'a',
				label: () => _x( 'Spacing', 'shape control', 'wunderpaint' ),
				min: 8,
				max: 45,
				step: 1,
				def: 20,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Inner radius', 'shape control', 'wunderpaint' ),
				min: 20,
				max: 60,
				step: 1,
				def: 45,
			},
		],
		variants: [
			{
				n: 95,
				a: 40,
				b: 55,
			},
			{
				n: 120,
				a: 10,
				b: 30,
			},
		],
	},
	{
		id: 'catalog-kachelversatz',
		source: 'kachelversatz',
		name: () => _x( 'Offset tiles', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Grid', 'shape control', 'wunderpaint' ),
				min: 2,
				max: 4,
				step: 1,
				def: 3,
			},
			{
				key: 'a',
				label: () => _x( 'Spacing', 'shape control', 'wunderpaint' ),
				min: 5,
				max: 20,
				step: 1,
				def: 9,
			},
			{
				key: 'b',
				label: () => _x( 'Row shift', 'shape control', 'wunderpaint' ),
				min: -30,
				max: 30,
				step: 1,
				def: 22,
			},
		],
		variants: [
			{
				n: 2,
				a: 18,
				b: -28,
			},
			{
				n: 4,
				a: 6,
				b: 12,
			},
		],
	},
	{
		id: 'catalog-treppenfaecher',
		source: 'treppenfaecher',
		name: () => _x( 'Stepped fan', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Steps', 'shape control', 'wunderpaint' ),
				min: 3,
				max: 5,
				step: 1,
				def: 4,
			},
			{
				key: 'a',
				label: () => _x( 'Bar width', 'shape control', 'wunderpaint' ),
				min: 30,
				max: 60,
				step: 1,
				def: 43,
			},
			{
				key: 'b',
				label: () => _x( 'Spacing', 'shape control', 'wunderpaint' ),
				min: 6,
				max: 18,
				step: 1,
				def: 10,
			},
		],
		variants: [
			{
				n: 3,
				a: 58,
				b: 16,
			},
			{
				n: 5,
				a: 35,
				b: 7,
			},
		],
	},
	{
		id: 'catalog-absatzblock',
		source: 'absatzblock',
		name: () => _x( 'Paragraph block', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Lines', 'shape control', 'wunderpaint' ),
				min: 3,
				max: 5,
				step: 1,
				def: 4,
			},
			{
				key: 'a',
				label: () =>
					_x( 'Length variation', 'shape control', 'wunderpaint' ),
				min: 25,
				max: 95,
				step: 1,
				def: 65,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Corner rounding', 'shape control', 'wunderpaint' ),
				min: 0,
				max: 18,
				step: 1,
				def: 9,
			},
		],
		variants: [
			{
				n: 3,
				a: 90,
				b: 0,
			},
			{
				n: 5,
				a: 40,
				b: 15,
			},
		],
	},
	{
		id: 'catalog-zitatpaar',
		source: 'zitatpaar',
		name: () => _x( 'Quotation pair', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Mark width', 'shape control', 'wunderpaint' ),
				min: 50,
				max: 95,
				step: 1,
				def: 70,
			},
			{
				key: 'a',
				label: () =>
					_x( 'Mark height', 'shape control', 'wunderpaint' ),
				min: 110,
				max: 180,
				step: 1,
				def: 150,
			},
			{
				key: 'b',
				label: () => _x( 'Spacing', 'shape control', 'wunderpaint' ),
				min: 15,
				max: 60,
				step: 1,
				def: 32,
			},
		],
		variants: [
			{
				n: 55,
				a: 175,
				b: 52,
			},
			{
				n: 90,
				a: 125,
				b: 20,
			},
		],
	},
	{
		id: 'catalog-bogenlabel',
		source: 'bogenlabel',
		name: () => _x( 'Arched label', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Height', 'shape control', 'wunderpaint' ),
				min: 115,
				max: 200,
				step: 1,
				def: 145,
			},
			{
				key: 'a',
				label: () => _x( 'Bulge', 'shape control', 'wunderpaint' ),
				min: 15,
				max: 52,
				step: 1,
				def: 40,
			},
			{
				key: 'b',
				label: () => _x( 'Focus', 'shape control', 'wunderpaint' ),
				min: -50,
				max: 50,
				step: 1,
				def: 25,
			},
		],
		variants: [
			{
				n: 120,
				a: 20,
				b: -40,
			},
			{
				n: 185,
				a: 50,
				b: 35,
			},
		],
	},
	{
		id: 'catalog-scherflaeche',
		source: 'scherflaeche',
		name: () => _x( 'Sheared panel', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Height', 'shape control', 'wunderpaint' ),
				min: 125,
				max: 220,
				step: 1,
				def: 165,
			},
			{
				key: 'a',
				label: () => _x( 'Sway', 'shape control', 'wunderpaint' ),
				min: 15,
				max: 80,
				step: 1,
				def: 55,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Side offset', 'shape control', 'wunderpaint' ),
				min: 10,
				max: 55,
				step: 1,
				def: 30,
			},
		],
		variants: [
			{
				n: 140,
				a: 25,
				b: 50,
			},
			{
				n: 210,
				a: 75,
				b: 15,
			},
		],
	},
	{
		id: 'catalog-trapezbauch',
		source: 'trapezbauch',
		name: () => _x( 'Rounded trapezoid', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Height', 'shape control', 'wunderpaint' ),
				min: 145,
				max: 235,
				step: 1,
				def: 205,
			},
			{
				key: 'a',
				label: () =>
					_x( 'Shoulder inset', 'shape control', 'wunderpaint' ),
				min: 15,
				max: 65,
				step: 1,
				def: 38,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Foot rounding', 'shape control', 'wunderpaint' ),
				min: 35,
				max: 110,
				step: 1,
				def: 80,
			},
		],
		variants: [
			{
				n: 155,
				a: 55,
				b: 45,
			},
			{
				n: 225,
				a: 20,
				b: 105,
			},
		],
	},
	{
		id: 'catalog-seitenbucht',
		source: 'seitenbucht',
		name: () => _x( 'Side notch', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Height', 'shape control', 'wunderpaint' ),
				min: 190,
				max: 240,
				step: 1,
				def: 200,
			},
			{
				key: 'a',
				label: () => _x( 'Notch size', 'shape control', 'wunderpaint' ),
				min: 28,
				max: 65,
				step: 1,
				def: 46,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Height offset', 'shape control', 'wunderpaint' ),
				min: -25,
				max: 25,
				step: 1,
				def: 0,
			},
		],
		variants: [
			{
				n: 200,
				a: 60,
				b: 22,
			},
			{
				n: 230,
				a: 35,
				b: -20,
			},
		],
	},
	{
		id: 'catalog-stufenetikett',
		source: 'stufenetikett',
		name: () => _x( 'Stepped label', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Height', 'shape control', 'wunderpaint' ),
				min: 110,
				max: 205,
				step: 1,
				def: 145,
			},
			{
				key: 'a',
				label: () =>
					_x( 'Indentation', 'shape control', 'wunderpaint' ),
				min: 20,
				max: 65,
				step: 1,
				def: 40,
			},
			{
				key: 'b',
				label: () => _x( 'Roundness', 'shape control', 'wunderpaint' ),
				min: 0,
				max: 16,
				step: 1,
				def: 8,
			},
		],
		variants: [
			{
				n: 120,
				a: 60,
				b: 0,
			},
			{
				n: 185,
				a: 25,
				b: 15,
			},
		],
	},
	{
		id: 'catalog-ueberhang',
		source: 'ueberhang',
		name: () => _x( 'Overhang panel', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Height', 'shape control', 'wunderpaint' ),
				min: 145,
				max: 235,
				step: 1,
				def: 190,
			},
			{
				key: 'a',
				label: () =>
					_x( 'Head rounding', 'shape control', 'wunderpaint' ),
				min: 12,
				max: 60,
				step: 1,
				def: 35,
			},
			{
				key: 'b',
				label: () => _x( 'Foot inset', 'shape control', 'wunderpaint' ),
				min: 25,
				max: 75,
				step: 1,
				def: 52,
			},
		],
		variants: [
			{
				n: 160,
				a: 18,
				b: 70,
			},
			{
				n: 225,
				a: 55,
				b: 30,
			},
		],
	},
	{
		id: 'catalog-doppelschnitt',
		source: 'doppelschnitt',
		name: () => _x( 'Double cut', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Height', 'shape control', 'wunderpaint' ),
				min: 160,
				max: 235,
				step: 1,
				def: 190,
			},
			{
				key: 'a',
				label: () => _x( 'Cut depth', 'shape control', 'wunderpaint' ),
				min: 40,
				max: 95,
				step: 1,
				def: 72,
			},
			{
				key: 'b',
				label: () => _x( 'Spacing', 'shape control', 'wunderpaint' ),
				min: 20,
				max: 55,
				step: 1,
				def: 33,
			},
		],
		variants: [
			{
				n: 175,
				a: 90,
				b: 48,
			},
			{
				n: 225,
				a: 45,
				b: 25,
			},
		],
	},
	{
		id: 'catalog-woelbkachel',
		source: 'woelbkachel',
		name: () => _x( 'Bowed tile', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () =>
					_x( 'Corner inset', 'shape control', 'wunderpaint' ),
				min: 10,
				max: 50,
				step: 1,
				def: 24,
			},
			{
				key: 'a',
				label: () =>
					_x( 'Vertical bulge', 'shape control', 'wunderpaint' ),
				min: -35,
				max: 60,
				step: 1,
				def: 40,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Horizontal bulge', 'shape control', 'wunderpaint' ),
				min: -30,
				max: 55,
				step: 1,
				def: 35,
			},
		],
		variants: [
			{
				n: 15,
				a: -25,
				b: 45,
			},
			{
				n: 45,
				a: 55,
				b: -20,
			},
		],
	},
	{
		id: 'catalog-titelrahmen',
		source: 'titelrahmen',
		name: () => _x( 'Title frame', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () =>
					_x( 'Frame width', 'shape control', 'wunderpaint' ),
				min: 20,
				max: 42,
				step: 1,
				def: 29,
			},
			{
				key: 'a',
				label: () => _x( 'Title gap', 'shape control', 'wunderpaint' ),
				min: 45,
				max: 135,
				step: 1,
				def: 100,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Position (%)', 'shape control', 'wunderpaint' ),
				min: -100,
				max: 100,
				step: 1,
				def: -20,
			},
		],
		variants: [
			{
				n: 22,
				a: 125,
				b: 45,
			},
			{
				n: 40,
				a: 65,
				b: -55,
			},
		],
	},
	{
		id: 'catalog-doppelklammer',
		source: 'doppelklammer',
		name: () => _x( 'Bracket pair', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Band width', 'shape control', 'wunderpaint' ),
				min: 22,
				max: 43,
				step: 1,
				def: 32,
			},
			{
				key: 'a',
				label: () => _x( 'Arm length', 'shape control', 'wunderpaint' ),
				min: 50,
				max: 85,
				step: 1,
				def: 55,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Inner space', 'shape control', 'wunderpaint' ),
				min: 55,
				max: 125,
				step: 1,
				def: 90,
			},
		],
		variants: [
			{
				n: 24,
				a: 78,
				b: 120,
			},
			{
				n: 41,
				a: 55,
				b: 65,
			},
		],
	},
	{
		id: 'catalog-schraegfenster',
		source: 'schraegfenster',
		name: () => _x( 'Slanted window', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () =>
					_x( 'Frame width', 'shape control', 'wunderpaint' ),
				min: 28,
				max: 47,
				step: 1,
				def: 35,
			},
			{
				key: 'a',
				label: () => _x( 'Side slant', 'shape control', 'wunderpaint' ),
				min: 10,
				max: 50,
				step: 1,
				def: 34,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Window offset', 'shape control', 'wunderpaint' ),
				min: -12,
				max: 12,
				step: 1,
				def: 10,
			},
		],
		variants: [
			{
				n: 30,
				a: 48,
				b: -10,
			},
			{
				n: 45,
				a: 15,
				b: 10,
			},
		],
	},
	{
		id: 'catalog-ringklammer',
		source: 'ringklammer',
		name: () => _x( 'Ring brackets', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Band width', 'shape control', 'wunderpaint' ),
				min: 26,
				max: 56,
				step: 1,
				def: 39,
			},
			{
				key: 'a',
				label: () => _x( 'Opening', 'shape control', 'wunderpaint' ),
				min: 30,
				max: 75,
				step: 1,
				def: 45,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Rotation offset', 'shape control', 'wunderpaint' ),
				min: -10,
				max: 10,
				step: 1,
				def: 8,
			},
		],
		variants: [
			{
				n: 28,
				a: 70,
				b: -8,
			},
			{
				n: 52,
				a: 35,
				b: 8,
			},
		],
	},
	{
		id: 'catalog-eckdurchbruch',
		source: 'eckdurchbruch',
		name: () => _x( 'Open corner', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () =>
					_x( 'Frame width', 'shape control', 'wunderpaint' ),
				min: 24,
				max: 47,
				step: 1,
				def: 35,
			},
			{
				key: 'a',
				label: () =>
					_x( 'Corner opening', 'shape control', 'wunderpaint' ),
				min: 52,
				max: 100,
				step: 1,
				def: 70,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Corner rounding', 'shape control', 'wunderpaint' ),
				min: 0,
				max: 16,
				step: 1,
				def: 8,
			},
		],
		variants: [
			{
				n: 26,
				a: 95,
				b: 0,
			},
			{
				n: 45,
				a: 58,
				b: 15,
			},
		],
	},
	{
		id: 'catalog-brueckenrahmen',
		source: 'brueckenrahmen',
		name: () => _x( 'Bridge frame', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Openings', 'shape control', 'wunderpaint' ),
				min: 2,
				max: 4,
				step: 1,
				def: 3,
			},
			{
				key: 'a',
				label: () => _x( 'Height', 'shape control', 'wunderpaint' ),
				min: 145,
				max: 220,
				step: 1,
				def: 180,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Bridge width', 'shape control', 'wunderpaint' ),
				min: 18,
				max: 30,
				step: 1,
				def: 27,
			},
		],
		variants: [
			{
				n: 2,
				a: 165,
				b: 20,
			},
			{
				n: 4,
				a: 205,
				b: 29,
			},
		],
	},
	{
		id: 'catalog-linsenfenster',
		source: 'linsenfenster',
		name: () => _x( 'Lens window', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () =>
					_x( 'Lens height', 'shape control', 'wunderpaint' ),
				min: 100,
				max: 135,
				step: 1,
				def: 113,
			},
			{
				key: 'a',
				label: () =>
					_x( 'Window size', 'shape control', 'wunderpaint' ),
				min: 30,
				max: 61,
				step: 1,
				def: 51,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Window offset', 'shape control', 'wunderpaint' ),
				min: -25,
				max: 25,
				step: 1,
				def: 15,
			},
		],
		variants: [
			{
				n: 105,
				a: 58,
				b: -22,
			},
			{
				n: 130,
				a: 36,
				b: 20,
			},
		],
	},
	{
		id: 'catalog-bildpaar',
		source: 'bildpaar',
		name: () => _x( 'Frame pair', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () =>
					_x( 'Frame width', 'shape control', 'wunderpaint' ),
				min: 17,
				max: 30,
				step: 1,
				def: 23,
			},
			{
				key: 'a',
				label: () => _x( 'Spacing', 'shape control', 'wunderpaint' ),
				min: 8,
				max: 40,
				step: 1,
				def: 18,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Right height', 'shape control', 'wunderpaint' ),
				min: 110,
				max: 210,
				step: 1,
				def: 150,
			},
		],
		variants: [
			{
				n: 18,
				a: 35,
				b: 125,
			},
			{
				n: 29,
				a: 10,
				b: 195,
			},
		],
	},
	{
		id: 'catalog-faecherrahmen',
		source: 'faecherrahmen',
		name: () => _x( 'Fan frame', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () =>
					_x( 'Frame width', 'shape control', 'wunderpaint' ),
				min: 22,
				max: 42,
				step: 1,
				def: 30,
			},
			{
				key: 'a',
				label: () =>
					_x( 'Opening angle', 'shape control', 'wunderpaint' ),
				min: 75,
				max: 135,
				step: 1,
				def: 105,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Arch height', 'shape control', 'wunderpaint' ),
				min: 175,
				max: 240,
				step: 1,
				def: 220,
			},
		],
		variants: [
			{
				n: 24,
				a: 130,
				b: 205,
			},
			{
				n: 40,
				a: 85,
				b: 235,
			},
		],
	},
	{
		id: 'catalog-labyrinthblock',
		source: 'labyrinthblock',
		name: () => _x( 'Block spiral', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Band width', 'shape control', 'wunderpaint' ),
				min: 23,
				max: 36,
				step: 1,
				def: 30,
			},
			{
				key: 'a',
				label: () => _x( 'Spacing', 'shape control', 'wunderpaint' ),
				min: 14,
				max: 27,
				step: 1,
				def: 20,
			},
			{
				key: 'b',
				label: () => _x( 'Rotation', 'shape control', 'wunderpaint' ),
				min: -30,
				max: 30,
				step: 1,
				def: 0,
			},
		],
		variants: [
			{
				n: 25,
				a: 25,
				b: -20,
			},
			{
				n: 35,
				a: 16,
				b: 20,
			},
		],
	},
	{
		id: 'catalog-gabelband',
		source: 'gabelband',
		name: () => _x( 'Forked band', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Band width', 'shape control', 'wunderpaint' ),
				min: 32,
				max: 66,
				step: 1,
				def: 48,
			},
			{
				key: 'a',
				label: () => _x( 'Opening', 'shape control', 'wunderpaint' ),
				min: 65,
				max: 115,
				step: 1,
				def: 95,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Junction position', 'shape control', 'wunderpaint' ),
				min: -25,
				max: 45,
				step: 1,
				def: 5,
			},
		],
		variants: [
			{
				n: 35,
				a: 110,
				b: 35,
			},
			{
				n: 63,
				a: 75,
				b: -15,
			},
		],
	},
	{
		id: 'catalog-bumerang',
		source: 'bumerang',
		name: () => _x( 'Boomerang', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () =>
					_x( 'Arch height', 'shape control', 'wunderpaint' ),
				min: 55,
				max: 115,
				step: 1,
				def: 85,
			},
			{
				key: 'a',
				label: () => _x( 'Focus', 'shape control', 'wunderpaint' ),
				min: -40,
				max: 40,
				step: 1,
				def: 15,
			},
			{
				key: 'b',
				label: () => _x( 'Fullness', 'shape control', 'wunderpaint' ),
				min: 38,
				max: 90,
				step: 1,
				def: 63,
			},
		],
		variants: [
			{
				n: 105,
				a: -30,
				b: 45,
			},
			{
				n: 65,
				a: 30,
				b: 85,
			},
		],
	},
	{
		id: 'catalog-hakenband',
		source: 'hakenband',
		name: () => _x( 'Hook band', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Band width', 'shape control', 'wunderpaint' ),
				min: 30,
				max: 60,
				step: 1,
				def: 46,
			},
			{
				key: 'a',
				label: () =>
					_x( 'Bend radius', 'shape control', 'wunderpaint' ),
				min: 72,
				max: 110,
				step: 1,
				def: 87,
			},
			{
				key: 'b',
				label: () => _x( 'Arm length', 'shape control', 'wunderpaint' ),
				min: 80,
				max: 145,
				step: 1,
				def: 120,
			},
		],
		variants: [
			{
				n: 33,
				a: 105,
				b: 90,
			},
			{
				n: 58,
				a: 78,
				b: 140,
			},
		],
	},
	{
		id: 'catalog-kreuzschwung',
		source: 'kreuzschwung',
		name: () => _x( 'Crossing curves', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Band width', 'shape control', 'wunderpaint' ),
				min: 35,
				max: 68,
				step: 1,
				def: 50,
			},
			{
				key: 'a',
				label: () =>
					_x( 'Curve tension', 'shape control', 'wunderpaint' ),
				min: 0,
				max: 60,
				step: 1,
				def: 25,
			},
			{
				key: 'b',
				label: () => _x( 'Opening', 'shape control', 'wunderpaint' ),
				min: 8,
				max: 35,
				step: 1,
				def: 18,
			},
		],
		variants: [
			{
				n: 38,
				a: 55,
				b: 30,
			},
			{
				n: 65,
				a: 10,
				b: 12,
			},
		],
	},
	{
		id: 'catalog-doppelimpuls',
		source: 'doppelimpuls',
		name: () => _x( 'Double chevron', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Band width', 'shape control', 'wunderpaint' ),
				min: 32,
				max: 65,
				step: 1,
				def: 46,
			},
			{
				key: 'a',
				label: () => _x( 'Height', 'shape control', 'wunderpaint' ),
				min: 65,
				max: 120,
				step: 1,
				def: 92,
			},
			{
				key: 'b',
				label: () => _x( 'Spacing', 'shape control', 'wunderpaint' ),
				min: 8,
				max: 40,
				step: 1,
				def: 17,
			},
		],
		variants: [
			{
				n: 35,
				a: 110,
				b: 35,
			},
			{
				n: 62,
				a: 75,
				b: 12,
			},
		],
	},
	{
		id: 'catalog-spannband',
		source: 'spannband',
		name: () => _x( 'Swept band', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Band width', 'shape control', 'wunderpaint' ),
				min: 38,
				max: 85,
				step: 1,
				def: 62,
			},
			{
				key: 'a',
				label: () => _x( 'Left bend', 'shape control', 'wunderpaint' ),
				min: 25,
				max: 110,
				step: 1,
				def: 85,
			},
			{
				key: 'b',
				label: () => _x( 'Right bend', 'shape control', 'wunderpaint' ),
				min: -50,
				max: 80,
				step: 1,
				def: 40,
			},
		],
		variants: [
			{
				n: 42,
				a: 105,
				b: -35,
			},
			{
				n: 80,
				a: 40,
				b: 65,
			},
		],
	},
	{
		id: 'catalog-negativpfeil',
		source: 'negativpfeil',
		name: () => _x( 'Arrow cutout', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () =>
					_x( 'Shaft width', 'shape control', 'wunderpaint' ),
				min: 30,
				max: 65,
				step: 1,
				def: 47,
			},
			{
				key: 'a',
				label: () => _x( 'Tip height', 'shape control', 'wunderpaint' ),
				min: 58,
				max: 85,
				step: 1,
				def: 73,
			},
			{
				key: 'b',
				label: () => _x( 'Tip start', 'shape control', 'wunderpaint' ),
				min: 0,
				max: 40,
				step: 1,
				def: 22,
			},
		],
		variants: [
			{
				n: 33,
				a: 82,
				b: 5,
			},
			{
				n: 62,
				a: 65,
				b: 35,
			},
		],
	},
	{
		id: 'catalog-bahnteiler',
		source: 'bahnteiler',
		name: () => _x( 'Split band', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Band width', 'shape control', 'wunderpaint' ),
				min: 28,
				max: 57,
				step: 1,
				def: 43,
			},
			{
				key: 'a',
				label: () => _x( 'Splay', 'shape control', 'wunderpaint' ),
				min: 50,
				max: 100,
				step: 1,
				def: 77,
			},
			{
				key: 'b',
				label: () => _x( 'Transition', 'shape control', 'wunderpaint' ),
				min: 10,
				max: 75,
				step: 1,
				def: 30,
			},
		],
		variants: [
			{
				n: 31,
				a: 95,
				b: 60,
			},
			{
				n: 54,
				a: 55,
				b: 15,
			},
		],
	},
	{
		id: 'catalog-schlaufenbogen',
		source: 'schlaufenbogen',
		name: () => _x( 'Loop tail', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Band width', 'shape control', 'wunderpaint' ),
				min: 25,
				max: 45,
				step: 1,
				def: 33,
			},
			{
				key: 'a',
				label: () => _x( 'Loop size', 'shape control', 'wunderpaint' ),
				min: 78,
				max: 108,
				step: 1,
				def: 87,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Foot offset', 'shape control', 'wunderpaint' ),
				min: 35,
				max: 85,
				step: 1,
				def: 58,
			},
		],
		variants: [
			{
				n: 27,
				a: 103,
				b: 80,
			},
			{
				n: 43,
				a: 83,
				b: 40,
			},
		],
	},
	{
		id: 'catalog-faltwinkel',
		source: 'faltwinkel',
		name: () => _x( 'Folded elbow', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Band width', 'shape control', 'wunderpaint' ),
				min: 35,
				max: 70,
				step: 1,
				def: 52,
			},
			{
				key: 'a',
				label: () => _x( 'Slope', 'shape control', 'wunderpaint' ),
				min: 80,
				max: 120,
				step: 1,
				def: 98,
			},
			{
				key: 'b',
				label: () => _x( 'Gap width', 'shape control', 'wunderpaint' ),
				min: 5,
				max: 15,
				step: 1,
				def: 8,
			},
		],
		variants: [
			{
				n: 38,
				a: 118,
				b: 13,
			},
			{
				n: 66,
				a: 85,
				b: 6,
			},
		],
	},
	{
		id: 'catalog-orbitalblock',
		source: 'orbitalblock',
		name: () => _x( 'Orbital core', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Core size', 'shape control', 'wunderpaint' ),
				min: 43,
				max: 75,
				step: 1,
				def: 60,
			},
			{
				key: 'a',
				label: () => _x( 'Ring width', 'shape control', 'wunderpaint' ),
				min: 16,
				max: 33,
				step: 1,
				def: 24,
			},
			{
				key: 'b',
				label: () => _x( 'Tilt', 'shape control', 'wunderpaint' ),
				min: -55,
				max: 15,
				step: 1,
				def: -28,
			},
		],
		variants: [
			{
				n: 48,
				a: 18,
				b: -48,
			},
			{
				n: 72,
				a: 30,
				b: 5,
			},
		],
	},
	{
		id: 'catalog-tangramflaeche',
		source: 'tangramflaeche',
		name: () => _x( 'Tangram field', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Gap width', 'shape control', 'wunderpaint' ),
				min: 5,
				max: 17,
				step: 1,
				def: 9,
			},
			{
				key: 'a',
				label: () =>
					_x( 'Horizontal split', 'shape control', 'wunderpaint' ),
				min: -40,
				max: 35,
				step: 1,
				def: -10,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Vertical split', 'shape control', 'wunderpaint' ),
				min: -35,
				max: 45,
				step: 1,
				def: 15,
			},
		],
		variants: [
			{
				n: 15,
				a: -35,
				b: -25,
			},
			{
				n: 6,
				a: 25,
				b: 35,
			},
		],
	},
	{
		id: 'catalog-kreislinsen',
		source: 'kreislinsen',
		name: () => _x( 'Lens wreath', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Lenses', 'shape control', 'wunderpaint' ),
				min: 3,
				max: 5,
				step: 1,
				def: 3,
			},
			{
				key: 'a',
				label: () =>
					_x( 'Lens fullness', 'shape control', 'wunderpaint' ),
				min: 60,
				max: 115,
				step: 1,
				def: 85,
			},
			{
				key: 'b',
				label: () => _x( 'Spread', 'shape control', 'wunderpaint' ),
				min: 25,
				max: 60,
				step: 1,
				def: 43,
			},
		],
		variants: [
			{
				n: 4,
				a: 70,
				b: 58,
			},
			{
				n: 3,
				a: 105,
				b: 30,
			},
		],
	},
	{
		id: 'catalog-eckfaecher',
		source: 'eckfaecher',
		name: () => _x( 'Corner stack', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Corners', 'shape control', 'wunderpaint' ),
				min: 2,
				max: 4,
				step: 1,
				def: 3,
			},
			{
				key: 'a',
				label: () => _x( 'Spacing', 'shape control', 'wunderpaint' ),
				min: 9,
				max: 18,
				step: 1,
				def: 13,
			},
			{
				key: 'b',
				label: () => _x( 'Band width', 'shape control', 'wunderpaint' ),
				min: 25,
				max: 34,
				step: 1,
				def: 34,
			},
		],
		variants: [
			{
				n: 2,
				a: 18,
				b: 28,
			},
			{
				n: 4,
				a: 10,
				b: 32,
			},
		],
	},
	{
		id: 'catalog-bogendreieck',
		source: 'bogendreieck',
		name: () => _x( 'Curved triangle', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Bulge', 'shape control', 'wunderpaint' ),
				min: 25,
				max: 110,
				step: 1,
				def: 70,
			},
			{
				key: 'a',
				label: () => _x( 'Asymmetry', 'shape control', 'wunderpaint' ),
				min: -25,
				max: 25,
				step: 1,
				def: 12,
			},
			{
				key: 'b',
				label: () => _x( 'Rotation', 'shape control', 'wunderpaint' ),
				min: -35,
				max: 35,
				step: 1,
				def: 0,
			},
		],
		variants: [
			{
				n: 35,
				a: -20,
				b: -25,
			},
			{
				n: 100,
				a: 18,
				b: 25,
			},
		],
	},
	{
		id: 'catalog-klammerrosette',
		source: 'klammerrosette',
		name: () => _x( 'Bracket rosette', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Modules', 'shape control', 'wunderpaint' ),
				min: 3,
				max: 5,
				step: 1,
				def: 3,
			},
			{
				key: 'a',
				label: () => _x( 'Band width', 'shape control', 'wunderpaint' ),
				min: 22,
				max: 37,
				step: 1,
				def: 29,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Opening angle', 'shape control', 'wunderpaint' ),
				min: 45,
				max: 90,
				step: 1,
				def: 62,
			},
		],
		variants: [
			{
				n: 4,
				a: 23,
				b: 85,
			},
			{
				n: 3,
				a: 36,
				b: 48,
			},
		],
	},
	{
		id: 'catalog-zwillingsbogen',
		source: 'zwillingsbogen',
		name: () => _x( 'Twin arches', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Band width', 'shape control', 'wunderpaint' ),
				min: 22,
				max: 43,
				step: 1,
				def: 31,
			},
			{
				key: 'a',
				label: () =>
					_x( 'Bend radius', 'shape control', 'wunderpaint' ),
				min: 58,
				max: 85,
				step: 1,
				def: 69,
			},
			{
				key: 'b',
				label: () => _x( 'Arm length', 'shape control', 'wunderpaint' ),
				min: 45,
				max: 110,
				step: 1,
				def: 78,
			},
		],
		variants: [
			{
				n: 24,
				a: 80,
				b: 100,
			},
			{
				n: 40,
				a: 62,
				b: 55,
			},
		],
	},
	{
		id: 'catalog-plattenstern',
		source: 'plattenstern',
		name: () => _x( 'Split plates', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Gap width', 'shape control', 'wunderpaint' ),
				min: 6,
				max: 25,
				step: 1,
				def: 12,
			},
			{
				key: 'a',
				label: () =>
					_x( 'Corner offset', 'shape control', 'wunderpaint' ),
				min: 15,
				max: 65,
				step: 1,
				def: 37,
			},
			{
				key: 'b',
				label: () => _x( 'Side inset', 'shape control', 'wunderpaint' ),
				min: 20,
				max: 70,
				step: 1,
				def: 48,
			},
		],
		variants: [
			{
				n: 22,
				a: 60,
				b: 25,
			},
			{
				n: 8,
				a: 25,
				b: 65,
			},
		],
	},
	{
		id: 'catalog-omegablock',
		source: 'omegablock',
		name: () => _x( 'Omega block', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Band width', 'shape control', 'wunderpaint' ),
				min: 28,
				max: 54,
				step: 1,
				def: 40,
			},
			{
				key: 'a',
				label: () =>
					_x( 'Bottom opening', 'shape control', 'wunderpaint' ),
				min: 48,
				max: 75,
				step: 1,
				def: 58,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Foot length', 'shape control', 'wunderpaint' ),
				min: 40,
				max: 85,
				step: 1,
				def: 62,
			},
		],
		variants: [
			{
				n: 31,
				a: 72,
				b: 80,
			},
			{
				n: 51,
				a: 52,
				b: 45,
			},
		],
	},
	{
		id: 'catalog-schnittkreis',
		source: 'schnittkreis',
		name: () => _x( 'Cut disc', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Cut height', 'shape control', 'wunderpaint' ),
				min: 40,
				max: 95,
				step: 1,
				def: 65,
			},
			{
				key: 'a',
				label: () => _x( 'Cut depth', 'shape control', 'wunderpaint' ),
				min: -65,
				max: 35,
				step: 1,
				def: -22,
			},
			{
				key: 'b',
				label: () => _x( 'Direction', 'shape control', 'wunderpaint' ),
				min: -45,
				max: 70,
				step: 1,
				def: 25,
			},
		],
		variants: [
			{
				n: 45,
				a: -55,
				b: -30,
			},
			{
				n: 88,
				a: 20,
				b: 60,
			},
		],
	},
	{
		id: 'catalog-wellenkacheln',
		source: 'wellenkacheln',
		name: () => _x( 'Wavy tiles', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Grid', 'shape control', 'wunderpaint' ),
				min: 2,
				max: 4,
				step: 1,
				def: 3,
			},
			{
				key: 'a',
				label: () => _x( 'Spacing', 'shape control', 'wunderpaint' ),
				min: 5,
				max: 18,
				step: 1,
				def: 10,
			},
			{
				key: 'b',
				label: () => _x( 'Bulge', 'shape control', 'wunderpaint' ),
				min: 25,
				max: 85,
				step: 1,
				def: 58,
			},
		],
		variants: [
			{
				n: 2,
				a: 16,
				b: 80,
			},
			{
				n: 4,
				a: 6,
				b: 35,
			},
		],
	},
	{
		id: 'catalog-bogenriegel',
		source: 'bogenriegel',
		name: () => _x( 'Arched bars', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Bars', 'shape control', 'wunderpaint' ),
				min: 2,
				max: 4,
				step: 1,
				def: 3,
			},
			{
				key: 'a',
				label: () => _x( 'Spacing', 'shape control', 'wunderpaint' ),
				min: 8,
				max: 24,
				step: 1,
				def: 14,
			},
			{
				key: 'b',
				label: () => _x( 'Focus', 'shape control', 'wunderpaint' ),
				min: -70,
				max: 70,
				step: 1,
				def: 15,
			},
		],
		variants: [
			{
				n: 2,
				a: 22,
				b: -55,
			},
			{
				n: 4,
				a: 9,
				b: 55,
			},
		],
	},
	{
		id: 'catalog-linsenraster',
		source: 'linsenraster',
		name: () => _x( 'Lens grid', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Grid', 'shape control', 'wunderpaint' ),
				min: 2,
				max: 4,
				step: 1,
				def: 3,
			},
			{
				key: 'a',
				label: () => _x( 'Spacing', 'shape control', 'wunderpaint' ),
				min: 6,
				max: 20,
				step: 1,
				def: 11,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Lens fullness', 'shape control', 'wunderpaint' ),
				min: 40,
				max: 90,
				step: 1,
				def: 60,
			},
		],
		variants: [
			{
				n: 2,
				a: 18,
				b: 45,
			},
			{
				n: 4,
				a: 7,
				b: 80,
			},
		],
	},
	{
		id: 'catalog-lozengenfeld',
		source: 'lozengenfeld',
		name: () => _x( 'Lozenge field', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Grid', 'shape control', 'wunderpaint' ),
				min: 2,
				max: 4,
				step: 1,
				def: 3,
			},
			{
				key: 'a',
				label: () => _x( 'Spacing', 'shape control', 'wunderpaint' ),
				min: 4,
				max: 17,
				step: 1,
				def: 8,
			},
			{
				key: 'b',
				label: () => _x( 'Roundness', 'shape control', 'wunderpaint' ),
				min: 2,
				max: 20,
				step: 1,
				def: 11,
			},
		],
		variants: [
			{
				n: 2,
				a: 15,
				b: 18,
			},
			{
				n: 4,
				a: 5,
				b: 5,
			},
		],
	},
	{
		id: 'catalog-mosaikbloecke',
		source: 'mosaikbloecke',
		name: () => _x( 'Mosaic blocks', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Gap width', 'shape control', 'wunderpaint' ),
				min: 6,
				max: 20,
				step: 1,
				def: 12,
			},
			{
				key: 'a',
				label: () =>
					_x( 'Horizontal split', 'shape control', 'wunderpaint' ),
				min: -25,
				max: 35,
				step: 1,
				def: 8,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Vertical split', 'shape control', 'wunderpaint' ),
				min: -15,
				max: 35,
				step: 1,
				def: 10,
			},
		],
		variants: [
			{
				n: 18,
				a: -20,
				b: -12,
			},
			{
				n: 8,
				a: 30,
				b: 28,
			},
		],
	},
	{
		id: 'catalog-ringkacheln',
		source: 'ringkacheln',
		name: () => _x( 'Open ring grid', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Grid', 'shape control', 'wunderpaint' ),
				min: 2,
				max: 4,
				step: 1,
				def: 3,
			},
			{
				key: 'a',
				label: () => _x( 'Spacing', 'shape control', 'wunderpaint' ),
				min: 5,
				max: 17,
				step: 1,
				def: 10,
			},
			{
				key: 'b',
				label: () => _x( 'Band ratio', 'shape control', 'wunderpaint' ),
				min: 35,
				max: 65,
				step: 1,
				def: 48,
			},
		],
		variants: [
			{
				n: 2,
				a: 16,
				b: 40,
			},
			{
				n: 4,
				a: 6,
				b: 60,
			},
		],
	},
	{
		id: 'catalog-wellenzaun',
		source: 'wellenzaun',
		name: () => _x( 'Capsule bars', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Columns', 'shape control', 'wunderpaint' ),
				min: 3,
				max: 5,
				step: 1,
				def: 4,
			},
			{
				key: 'a',
				label: () => _x( 'Spacing', 'shape control', 'wunderpaint' ),
				min: 6,
				max: 14,
				step: 1,
				def: 11,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Height offset', 'shape control', 'wunderpaint' ),
				min: 20,
				max: 70,
				step: 1,
				def: 45,
			},
		],
		variants: [
			{
				n: 3,
				a: 14,
				b: 65,
			},
			{
				n: 5,
				a: 7,
				b: 30,
			},
		],
	},
	{
		id: 'catalog-treppendreiecke',
		source: 'treppendreiecke',
		name: () => _x( 'Stepped triangles', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Grid', 'shape control', 'wunderpaint' ),
				min: 2,
				max: 4,
				step: 1,
				def: 3,
			},
			{
				key: 'a',
				label: () => _x( 'Spacing', 'shape control', 'wunderpaint' ),
				min: 4,
				max: 16,
				step: 1,
				def: 9,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Arrangement', 'shape control', 'wunderpaint' ),
				min: 0,
				max: 3,
				step: 1,
				def: 1,
			},
		],
		variants: [
			{
				n: 2,
				a: 14,
				b: 2,
			},
			{
				n: 4,
				a: 5,
				b: 0,
			},
		],
	},
	{
		id: 'catalog-dreieckstakt',
		source: 'dreieckstakt',
		name: () => _x( 'Triangle rhythm', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Triangles', 'shape control', 'wunderpaint' ),
				min: 3,
				max: 4,
				step: 1,
				def: 4,
			},
			{
				key: 'a',
				label: () => _x( 'Spacing', 'shape control', 'wunderpaint' ),
				min: 5,
				max: 14,
				step: 1,
				def: 9,
			},
			{
				key: 'b',
				label: () => _x( 'Height', 'shape control', 'wunderpaint' ),
				min: 85,
				max: 155,
				step: 1,
				def: 135,
			},
		],
		variants: [
			{
				n: 3,
				a: 12,
				b: 110,
			},
			{
				n: 4,
				a: 6,
				b: 155,
			},
		],
	},
	{
		id: 'catalog-rautenwirbel',
		source: 'rautenwirbel',
		name: () => _x( 'Diamond swirl', 'shape name', 'wunderpaint' ),
		params: [
			{
				key: 'n',
				label: () => _x( 'Diamonds', 'shape control', 'wunderpaint' ),
				min: 4,
				max: 7,
				step: 1,
				def: 5,
			},
			{
				key: 'a',
				label: () =>
					_x( 'Center spacing', 'shape control', 'wunderpaint' ),
				min: 50,
				max: 90,
				step: 1,
				def: 68,
			},
			{
				key: 'b',
				label: () =>
					_x( 'Diamond width', 'shape control', 'wunderpaint' ),
				min: 23,
				max: 44,
				step: 1,
				def: 32,
			},
		],
		variants: [
			{
				n: 4,
				a: 85,
				b: 26,
			},
			{
				n: 6,
				a: 55,
				b: 40,
			},
		],
	},
];
