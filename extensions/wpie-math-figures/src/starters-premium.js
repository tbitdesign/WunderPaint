/** Deliberately composed teaching and publication figures, not cosmetic duplicates. */
const diagram = ( id, name, type, content, extra = {} ) => ( {
	id,
	name,
	subtitle: name,
	params: { head: { title: name }, blocks: [ { type, content, ...extra } ] },
} );
const def = ( name, expression, color = '#2563eb' ) => ( {
	name,
	expression,
	color,
} );
const linked = ( id, name, definitions, blocks, options = {} ) => ( {
	id,
	name,
	subtitle: 'Linked mathematical figure',
	params: {
		math: { definitions },
		head: { title: name },
		figure: { columns: 2, gutter: 36, panels: true, ...options },
		blocks,
	},
} );
const graph = ( source, heading, extra = {} ) => ( {
	type: 'graph',
	source,
	heading,
	functions: '',
	xmin: -4,
	xmax: 4,
	ymin: -5,
	ymax: 5,
	...extra,
} );
export const PREMIUM_STARTERS = [
	diagram(
		'implicit-circle',
		'Circle as an implicit curve',
		'implicit',
		'x^2+y^2=9',
		{ xmin: -4, xmax: 4, ymin: -4, ymax: 4 }
	),
	diagram(
		'implicit-ellipse',
		'Ellipse and hyperbola',
		'implicit',
		'x^2/9+y^2/4=1\nx^2/4-y^2=1'
	),
	diagram(
		'implicit-lemniscate',
		'Lemniscate',
		'implicit',
		'(x^2+y^2)^2=8(x^2-y^2)',
		{ xmin: -3.5, xmax: 3.5, ymin: -2.5, ymax: 2.5 }
	),
	diagram( 'implicit-cubic', 'Cubic curve', 'implicit', 'y^2=x^3-x+1', {
		xmin: -3,
		xmax: 4,
		ymin: -4,
		ymax: 4,
	} ),
	diagram(
		'region-parabolic',
		'A parabolic solution region',
		'inequality',
		'y >= x^2\ny <= 4',
		{ xmin: -3, xmax: 3, ymin: -1, ymax: 5 }
	),
	diagram(
		'region-linear',
		'Linear constraints',
		'inequality',
		'x >= 0\ny >= 0\nx+y <= 6\n2x+y < 8',
		{ xmin: -1, xmax: 7, ymin: -1, ymax: 7 }
	),
	diagram(
		'region-annulus',
		'An annular region',
		'inequality',
		'x^2+y^2 >= 2\nx^2+y^2 <= 9',
		{ xmin: -4, xmax: 4, ymin: -4, ymax: 4 }
	),
	diagram(
		'field-rotation',
		'Rotational vector field',
		'vectorfield',
		'-y; x'
	),
	diagram(
		'field-source',
		'Source and radial strength',
		'vectorfield',
		'x; y'
	),
	diagram( 'field-saddle', 'Saddle vector field', 'vectorfield', 'x; -y' ),
	diagram(
		'field-damped',
		'Damped rotation',
		'vectorfield',
		'-0.35x-y; x-0.35y'
	),
	diagram(
		'slope-linear',
		'A first-order differential equation',
		'slopefield',
		'x-y'
	),
	diagram(
		'slope-logistic',
		'Logistic direction field',
		'slopefield',
		'y*(1-y)',
		{ xmin: -3, xmax: 3, ymin: -0.5, ymax: 1.5, equal: false }
	),
	diagram(
		'slope-separable',
		'Separable direction field',
		'slopefield',
		'sin(x)*cos(y)',
		{ xmin: -4, xmax: 4, ymin: -3, ymax: 3 }
	),
	diagram( 'contour-bowl', 'Elliptic contour map', 'contours', 'x^2+2y^2', {
		levels: '1,2,4,8,12,20',
	} ),
	diagram( 'contour-saddle', 'Saddle contour map', 'contours', 'x^2-y^2', {
		levels: '-8,-4,-1,0,1,4,8',
	} ),
	diagram(
		'contour-waves',
		'Periodic level curves',
		'contours',
		'sin(x)+cos(y)',
		{
			levels: '-1.5,-1,-0.5,0,0.5,1,1.5',
			xmin: -6,
			xmax: 6,
			ymin: -4,
			ymax: 4,
		}
	),
	diagram(
		'complex-conjugate',
		'Complex conjugates',
		'complex',
		'z = (2, 1)\nconjugate w z',
		{ xmin: -1, xmax: 4, ymin: -3, ymax: 3 }
	),
	diagram(
		'complex-polar',
		'Polar coordinates in the complex plane',
		'complex',
		'polar z 3 40\npolar w 2 135',
		{ xmin: -4, xmax: 4, ymin: -1, ymax: 4 }
	),
	diagram( 'complex-roots', 'Fifth roots of unity', 'complex', 'roots 5', {
		xmin: -1.6,
		xmax: 1.6,
		ymin: -1.6,
		ymax: 1.6,
	} ),
	{
		id: 'analysis-parabola',
		name: 'Quadratic function study',
		subtitle: 'Roots, vertex, tangent and normal',
		params: {
			head: { title: 'Quadratic function study' },
			math: { definitions: [ def( 'f', 'x^2-2x-3' ) ] },
			blocks: [
				{
					type: 'analysis',
					source: 'f',
					functions: '',
					xmin: -3,
					xmax: 5,
					ymin: -5,
					ymax: 6,
					from: -3,
					to: 5,
					at: 2,
					tangent: true,
					normal: true,
				},
			],
		},
	},
	{
		id: 'analysis-area',
		name: 'Area between two curves',
		subtitle: 'Intersections and geometric area',
		params: {
			math: {
				definitions: [
					def( 'f', '4-x^2' ),
					def( 'g', 'x+2', '#dc2626' ),
				],
			},
			head: { title: 'Area between two curves' },
			blocks: [
				{
					type: 'analysis',
					source: 'f',
					other: 'g',
					functions: '',
					xmin: -3,
					xmax: 3,
					ymin: -1,
					ymax: 6,
					from: -2,
					to: 1,
					roots: false,
					extrema: false,
					intersections: true,
					area: true,
				},
			],
		},
	},
	linked(
		'linked-function-sheet',
		'One function, three views',
		[ def( 'f', 'a*x^2+b*x+c' ) ],
		[
			{ type: 'formula', source: 'f', span: 2, formulaSize: 44 },
			graph( 'f', 'Function graph', {
				xmin: -3,
				xmax: 3,
				ymin: -2,
				ymax: 10,
			} ),
			{
				type: 'table',
				source: 'f',
				heading: 'Computed values',
				tableFrom: -3,
				tableTo: 3,
				tableStep: 1,
				zebra: true,
			},
			{
				type: 'text',
				span: 2,
				text: 'The expression [[f]] supplies both views. With a = [[a]], b = [[b]] and c = [[c]], the value at x = 2 is [[f(2)]]. Change a, b and c in Shared functions to update the entire figure.',
			},
		]
	),
	linked(
		'linked-comparison',
		'Growth rates on shared axes',
		[
			def( 'f', 'x' ),
			def( 'g', 'x^2', '#dc2626' ),
			def( 'h', '2^x', '#16a34a' ),
		],
		[
			graph( 'f', 'Linear growth' ),
			graph( 'g', 'Quadratic growth' ),
			graph( 'h', 'Exponential growth' ),
			{ type: 'formula', source: 'f', formulaSize: 36 },
			{ type: 'formula', source: 'g', formulaSize: 36 },
			{ type: 'formula', source: 'h', formulaSize: 36 },
		],
		{ columns: 3, sharedAxes: true, xmin: -1, xmax: 4, ymin: -1, ymax: 17 }
	),
	linked(
		'linked-symmetry',
		'Even and odd functions',
		[ def( 'f', 'cos(x)' ), def( 'g', 'sin(x)', '#dc2626' ) ],
		[
			graph( 'f', 'Even: reflection about the y-axis', { ticks: 'pi' } ),
			graph( 'g', 'Odd: symmetry about the origin', { ticks: 'pi' } ),
			{ type: 'formula', latex: 'f(-x)=f(x)', formulaSize: 38 },
			{ type: 'formula', latex: 'g(-x)=-g(x)', formulaSize: 38 },
		],
		{ sharedAxes: true, xmin: -6.5, xmax: 6.5, ymin: -1.5, ymax: 1.5 }
	),
	linked(
		'linked-derivative',
		'A function and its derivative',
		[ def( 'f', 'x^3-3x' ), def( 'g', '3x^2-3', '#dc2626' ) ],
		[
			graph( 'f', 'f(x) = x³ − 3x' ),
			graph( 'g', 'Derivative: 3x² − 3' ),
			{
				type: 'text',
				span: 2,
				text: 'The stationary points of f occur where its derivative crosses zero. The derivative is a separate shared definition in this comparison.',
			},
		],
		{ sharedAxes: true, xmin: -2.5, xmax: 2.5, ymin: -6, ymax: 6 }
	),
	{
		id: 'geometry-workbench',
		name: 'Editable triangle construction',
		subtitle: 'Points, midpoint, lengths and angles',
		params: {
			head: { title: 'Triangle construction' },
			blocks: [
				{
					type: 'geometry',
					geometry:
						'A = (0, 0)\nB = (5, 0)\nC = (1.5, 3)\nmidpoint M A B\npolygon A B C\nsegment C M\nangle B A C\nangle A B C\nangle A C B\ngrid on',
					heading: 'Drag A, B or C to explore the construction',
				},
			],
		},
	},
	{
		id: 'geometry-two-triangles',
		name: 'Triangle comparison',
		subtitle: 'Matched panels for geometric reasoning',
		params: {
			head: { title: 'Two triangles, one base' },
			figure: { columns: 2, panels: true },
			blocks: [
				{
					type: 'geometry',
					heading: 'Right triangle',
					geometry:
						'A = (0, 0)\nB = (4, 0)\nC = (0, 3)\npolygon A B C\nangle B A C\nrange -1 5 -1 4',
				},
				{
					type: 'geometry',
					heading: 'Equal area',
					geometry:
						'A = (0, 0)\nB = (4, 0)\nC = (2, 3)\npolygon A B C\nrange -1 5 -1 4',
				},
				{
					type: 'formula',
					latex: 'A=\\frac{1}{2}bh=6',
					span: 2,
					formulaSize: 44,
				},
			],
		},
	},
];
