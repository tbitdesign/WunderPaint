/**
 * Starters: one finished figure per entry that the user changes. Names
 * stay untranslated. A starter with one block belongs to that block's
 * group; a starter with several blocks is a "whole figure".
 */
import { BLOCKS, BLOCK_GROUPS } from './blocks.js';

const one = ( id, name, subtitle, type, params ) => ( {
	id,
	name,
	subtitle,
	params: { blocks: [ { type, ...params } ] },
} );

export const STARTERS = [
	/* Formulas */
	one(
		'quadratic',
		'Quadratic formula',
		'The roots of ax² + bx + c',
		'formula',
		{ latex: 'x_{1,2} = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}' }
	),
	one( 'pythagoras', 'Pythagoras', 'a² + b² = c²', 'formula', {
		latex: 'a^2 + b^2 = c^2',
	} ),
	one( 'binomial', 'Binomial formulas', 'Three lines, aligned', 'formula', {
		latex: '\\begin{aligned}(a+b)^2 &= a^2 + 2ab + b^2 \\\\ (a-b)^2 &= a^2 - 2ab + b^2 \\\\ (a+b)(a-b) &= a^2 - b^2\\end{aligned}',
		formulaSize: 44,
	} ),
	one( 'integral', 'Integral', 'Gaussian integral', 'formula', {
		latex: '\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}',
	} ),
	one( 'sum', 'Sum', 'Gauss', 'formula', {
		latex: '\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}',
	} ),
	one( 'matrix', 'Matrix', 'A 2 by 2 determinant', 'formula', {
		latex: '\\det\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} = ad - bc',
	} ),
	one( 'euler', 'Euler', 'The most beautiful equation', 'formula', {
		latex: 'e^{i\\pi} + 1 = 0',
		formulaSize: 72,
		box: true,
	} ),
	one( 'cases', 'Absolute value', 'A case distinction', 'formula', {
		latex: '|x| = \\begin{cases} x & \\text{if } x \\geq 0 \\\\ -x & \\text{if } x < 0 \\end{cases}',
	} ),
	/* Graphs */
	one( 'parabola', 'Parabola', 'f(x) = x² - 2x - 3 with its roots', 'graph', {
		functions:
			'f(x) = x^2 - 2x - 3\npoint (-1, 0) "x₁"\npoint (3, 0) "x₂"\npoint (1, -4) "S"',
		xmin: -4,
		xmax: 6,
		ymin: -5,
		ymax: 6,
		grid: 'major',
	} ),
	one( 'sincos', 'Sine and cosine', 'Ticks in multiples of pi', 'graph', {
		functions: 'f(x) = sin(x)\ng(x) = cos(x)',
		xmin: -6.5,
		xmax: 6.5,
		ymin: -1.5,
		ymax: 1.5,
		ticks: 'pi',
		grid: 'major',
	} ),
	one( 'exp', 'Exponential growth', 'e^x and its reflection', 'graph', {
		functions: 'f(x) = e^x\ng(x) = e^(-x)\nh(x) = ln(x)',
		xmin: -3,
		xmax: 4,
		ymin: -3,
		ymax: 8,
		grid: 'fine',
	} ),
	one( 'hyperbola', 'Hyperbola', '1/x with its pole', 'graph', {
		functions: 'f(x) = 1/x\ng(x) = 1/x^2',
		xmin: -4,
		xmax: 4,
		ymin: -4,
		ymax: 4,
		grid: 'major',
		equal: true,
	} ),
	one(
		'area',
		'Area under a curve',
		'The integral as a shaded region',
		'graph',
		{
			functions: 'f(x) = -x^2/4 + 3\narea f 0..3',
			xmin: -1,
			xmax: 5,
			ymin: -1,
			ymax: 4,
			grid: 'major',
		}
	),
	one( 'circle-param', 'Circle and ellipse', 'Parametric curves', 'graph', {
		functions:
			'param: 2cos(t), 2sin(t), t = 0..2pi "Circle"\nparam: 3cos(t), 1.5sin(t), t = 0..2pi "Ellipse"',
		xmin: -4,
		xmax: 4,
		ymin: -3,
		ymax: 3,
		equal: true,
		grid: 'major',
	} ),
	one( 'cardioid', 'Cardioid', 'A polar curve', 'graph', {
		functions: 'polar: 1 + cos(t)',
		xmin: -1,
		xmax: 2.5,
		ymin: -1.6,
		ymax: 1.6,
		equal: true,
		grid: 'major',
	} ),
	one( 'family', 'Family of lines', 'Slopes and intercepts', 'graph', {
		functions: 'f(x) = 2x + 1\ng(x) = -x + 3\nh(x) = 0.5x - 2',
		xmin: -5,
		xmax: 5,
		ymin: -5,
		ymax: 5,
		grid: 'major',
		equal: true,
	} ),
	/* Geometry */
	one(
		'right-triangle',
		'Right triangle',
		'Pythagoras with 3, 4, 5',
		'geometry',
		{
			geometry:
				'A = (0, 0)\nB = (4, 0)\nC = (0, 3)\npolygon A B C\nsegment A B "a = 4"\nsegment A C "b = 3"\nsegment B C "c = 5"\nangle B A C\nangle A C B "β"\nangle C B A "α"',
		}
	),
	one(
		'triangle-angles',
		'Triangle with angles',
		'Three angles that add up',
		'geometry',
		{
			geometry:
				'A = (0, 0)\nB = (6, 0)\nC = (2, 4)\npolygon A B C\nangle B A C "α"\nangle C B A "β"\nangle A C B "γ"\nsegment A B "c"\nsegment B C "a"\nsegment A C "b"',
		}
	),
	one( 'thales', 'Thales circle', 'A right angle on the circle', 'geometry', {
		geometry:
			'A = (-3, 0)\nB = (3, 0)\nM = (0, 0)\nC = (1.2, 2.75)\ncircle M 3\npolygon A B C\nsegment A B\nangle A C B\nhide M\npoint M = (0, 0) "M"',
	} ),
	one( 'chord', 'Circle with chord', 'Center, radius, chord', 'geometry', {
		geometry:
			'M = (0, 0)\nA = (-2.4, 1.8)\nB = (2.4, 1.8)\nP = (0, 1.8)\ncircle M 3\nsegment A B "s"\nsegment M P "d"\nsegment M A "r"\nangle A P M',
	} ),
	one( 'vectors', 'Vector addition', 'a + b as a parallelogram', 'geometry', {
		geometry:
			'O = (0, 0)\nA = (4, 1)\nB = (1, 3)\nC = (5, 4)\nvector O A "a"\nvector O B "b"\nvector O C "a + b"\nsegment A C\nsegment B C\naxes on\ngrid on\nhide O',
	} ),
	one(
		'square-diag',
		'Square with diagonals',
		'Four right angles',
		'geometry',
		{
			geometry:
				'A = (0, 0)\nB = (4, 0)\nC = (4, 4)\nD = (0, 4)\nM = (2, 2)\npolygon A B C D\nsegment A C\nsegment B D\nangle B A D\nangle A M B',
		}
	),
	/* Number lines */
	one( 'nl-integers', 'Integers', 'From -5 to 5', 'numberline', {
		numberline: 'range -5 5\nstep 1\npoint -3 "a"\npoint 2 "b"',
	} ),
	one(
		'nl-fractions',
		'Fractions',
		'Thirds and halves on the line',
		'numberline',
		{
			numberline:
				'range 0 2\nstep 1\nminor 5\npoint 1/3\npoint 1/2\npoint 4/3\npoint 1 1/2',
		}
	),
	one( 'nl-interval', 'Interval', 'Closed at 2, open at 5', 'numberline', {
		numberline: 'range -1 7\nstep 1\ninterval [2, 5) "2 ≤ x < 5"',
	} ),
	one( 'nl-jumps', 'Addition with jumps', '3 + 4 + 2', 'numberline', {
		numberline:
			'range 0 10\nstep 1\njump 0 -> 3 "+3"\njump 3 -> 7 "+4"\njump 7 -> 9 "+2"\npoint 9',
	} ),
	/* Fractions */
	one( 'fr-circles', 'Fractions as circles', '3/4, 1/2, 5/8', 'fractions', {
		fractions: '3/4, 1/2, 5/8',
		fractionMode: 'circle',
	} ),
	one( 'fr-bars', 'Fractions as bars', 'Comparing 2/3 and 3/4', 'fractions', {
		fractions: '2/3, 3/4, 5/6',
		fractionMode: 'bar',
	} ),
	one(
		'fr-grid',
		'Fractions as grids',
		'Hundredths and tenths',
		'fractions',
		{ fractions: '37/100, 4/10', fractionMode: 'grid' }
	),
	one( 'fr-mixed', 'Mixed number', '1 3/4 as circles', 'fractions', {
		fractions: '1 3/4, 7/4',
		fractionMode: 'circle',
	} ),
	/* Text, steps, tables */
	one(
		'text-intro',
		'Explaining paragraph',
		'Text with inline math and a list',
		'text',
		{
			text: 'A quadratic equation $ax^2 + bx + c = 0$ has **two**, one or no real roots.\n\n- two roots when $b^2 - 4ac > 0$\n- one root when $b^2 - 4ac = 0$\n- no real root when $b^2 - 4ac < 0$',
			align: 'left',
		}
	),
	one(
		'steps-linear',
		'Linear equation',
		'Three steps with explanations',
		'steps',
		{
			steps: '3x + 5 = 20 | the equation\n<=> 3x = 15 | subtract 5 on both sides\n<=> x = 5 | divide by 3',
			numbered: false,
		}
	),
	one( 'values-table', 'Value table', 'Computed from a function', 'table', {
		table: 'values f(x) = x^2 - 1; g(x) = 2x + 1; x = -3..3 step 1',
	} ),
	/* Whole figures */
	{
		id: 'quadratic-explained',
		name: 'Quadratic formula, explained',
		subtitle: 'Marked parts with labels',
		params: {
			head: { title: 'The quadratic formula' },
			blocks: [
				{
					type: 'formula',
					latex: 'x_{1,2} = \\frac{-b \\pm \\sqrt{\\mark{d}{b^2 - 4ac}}}{\\mark{n}{2a}}',
					formulaSize: 60,
					notes: 'd "Discriminant: its sign tells how many roots there are" above\nn "Twice the leading coefficient" below',
				},
			],
			foot: {
				caption:
					'Two real roots when the discriminant is positive, one when it is zero, none when it is negative.',
			},
		},
	},
	{
		id: 'solve-linear',
		name: 'Solving an equation',
		subtitle: 'Worked solution with a check',
		params: {
			head: { title: 'Solving 3x + 5 = 20' },
			blocks: [
				{
					type: 'steps',
					steps: '3x + 5 = 20 | the equation\n<=> 3x = 15 | subtract 5 on both sides\n<=> x = 5 | divide by 3',
					numbered: false,
				},
				{
					type: 'text',
					text: '**Check:** $3 \\cdot 5 + 5 = 20$, so $x = 5$ is the solution.',
				},
			],
		},
	},
	{
		id: 'binomial-steps',
		name: 'Binomial formula, derived',
		subtitle: 'Continuation lines under one equals sign',
		params: {
			head: { title: 'Where (a + b)² comes from' },
			blocks: [
				{
					type: 'steps',
					steps: '(a+b)^2 = (a+b)(a+b)\n= a^2 + ab + ba + b^2 | multiply every term\n= a^2 + 2ab + b^2 | collect the middle terms',
					numbered: true,
				},
			],
		},
	},
	{
		id: 'theorem-card',
		name: 'Theorem card',
		subtitle: 'Title, formula, explanation, caption',
		params: {
			head: { title: 'Pythagorean theorem', subtitle: 'Right triangles' },
			blocks: [
				{
					type: 'formula',
					latex: 'a^2 + b^2 = c^2',
					formulaSize: 64,
					box: true,
					gap: 30,
				},
				{
					type: 'text',
					text: 'In a right triangle the square of the hypotenuse $c$ equals the sum of the squares of the two legs $a$ and $b$.',
					align: 'left',
				},
			],
			foot: {
				caption:
					'Named after Pythagoras of Samos, known long before him in Babylon.',
			},
		},
	},
	{
		id: 'values-parabola',
		name: 'Values and graph',
		subtitle: 'A value table above its parabola',
		params: {
			head: { title: 'f(x) = x² - 1' },
			blocks: [
				{
					type: 'table',
					table: 'values f(x) = x^2 - 1; x = -3..3 step 1',
					gap: 30,
				},
				{
					type: 'graph',
					functions: 'f(x) = x^2 - 1',
					xmin: -3.5,
					xmax: 3.5,
					ymin: -2,
					ymax: 9,
					grid: 'major',
					width: 75,
				},
			],
		},
	},
	{
		id: 'powers-table',
		name: 'Table of powers',
		subtitle: 'A pipe table with math cells',
		params: {
			head: { title: 'Powers of two' },
			blocks: [
				{
					type: 'table',
					table: 'n | $2^n$ | $2^{-n}$\n---\n0 | 1 | 1\n1 | 2 | $\\frac{1}{2}$\n2 | 4 | $\\frac{1}{4}$\n3 | 8 | $\\frac{1}{8}$\n4 | 16 | $\\frac{1}{16}$',
					zebra: true,
				},
			],
		},
	},
	{
		id: 'derivation-chain',
		name: 'Derivation',
		subtitle: 'Text, steps, text',
		params: {
			head: { title: 'The sum of the first n numbers' },
			blocks: [
				{
					type: 'text',
					text: 'Write the sum twice, the second time in reverse, and add the columns:',
					align: 'left',
				},
				{
					type: 'steps',
					steps: 'S = 1 + 2 + \\dots + n\nS = n + (n - 1) + \\dots + 1\n2S = n(n + 1) | every column adds up to n + 1\nS = \\frac{n(n + 1)}{2}',
					numbered: true,
				},
				{
					type: 'text',
					text: '- Gauss is said to have found this as a schoolboy.\n- It holds for every natural number $n$.',
					align: 'left',
				},
			],
		},
	},
	{
		id: 'triangle-sum',
		name: 'Angles of a triangle',
		subtitle: 'Figure, formula, caption',
		params: {
			head: { title: 'The angles of a triangle add up to 180°' },
			blocks: [
				{
					type: 'geometry',
					geometry:
						'A = (0, 0)\nB = (6, 0)\nC = (2, 4)\npolygon A B C\nangle B A C "α"\nangle C B A "β"\nangle A C B "γ"',
					width: 70,
				},
				{
					type: 'formula',
					latex: '\\alpha + \\beta + \\gamma = 180^\\circ',
					formulaSize: 52,
				},
			],
			foot: {
				caption:
					'Cut off the three corners and lay them side by side: they form a straight angle.',
			},
		},
	},
	{
		id: 'fraction-lesson',
		name: 'Fraction lesson',
		subtitle: 'Picture, explanation, caption',
		params: {
			head: { title: 'Comparing fractions' },
			blocks: [
				{
					type: 'fractions',
					fractions: '2/3, 3/4',
					fractionMode: 'bar',
				},
				{
					type: 'text',
					text: 'Both bars have the same length, so the longer shaded part is the larger fraction: $\\frac{3}{4} > \\frac{2}{3}$.',
					align: 'left',
				},
			],
			foot: { caption: 'Same whole, different parts.' },
		},
	},
	/* Primary school */
	one( 'clock-read', 'Read the clock', 'Three times to read', 'clock', {
		clock: '7:35\n12:00\n4:50',
		numbers: 'numbers',
		digital: false,
		hands: true,
	} ),
	one(
		'clock-draw',
		'Draw the time',
		'Empty faces with the time below',
		'clock',
		{
			clock: '8:15\n11:40\n2:05',
			numbers: 'numbers',
			digital: true,
			hands: false,
		}
	),
	one(
		'clock-roman',
		'Roman clock',
		'Roman numerals and a second hand',
		'clock',
		{
			clock: '10:10:30 "Tea time"',
			numbers: 'roman',
			seconds: true,
			digital: true,
			hands: true,
		}
	),
	one( 'hundred-sevens', 'Hundred square', 'The sevens marked', 'hundred', {
		hundred: 'field 100\nmark 7 14 21 28 35 42 49 56 63 70 77 84 91 98',
		numbers: true,
	} ),
	one(
		'hundred-gaps',
		'Hundred square with gaps',
		'Cells to fill in',
		'hundred',
		{ hundred: 'field 100\nhide 13 27 44 58 66 79 85 92', numbers: true }
	),
	one( 'twenty-dots', 'Twenty field', 'Thirteen dots in fives', 'hundred', {
		hundred: 'field 20\ndots 13',
		numbers: true,
	} ),
	one( 'place-4736', 'Place value chart', 'Thousands to ones', 'placevalue', {
		placevalue: '4736\n205\n1050',
		blocks: false,
	} ),
	one(
		'place-blocks',
		'Base-ten blocks',
		'123 as flats, rods and cubes',
		'placevalue',
		{ placevalue: '123', blocks: true }
	),
	one( 'place-decimal', 'Decimals', 'Tenths and hundredths', 'placevalue', {
		placevalue: '3.75\n12.4\n0.09',
		blocks: false,
	} ),
	one(
		'times-table',
		'Multiplication table',
		'One to ten',
		'multiplication',
		{ multiplication: 'table 1..10' }
	),
	one(
		'times-gaps',
		'Table with gaps',
		'Cells to fill in',
		'multiplication',
		{ multiplication: 'table 1..10\nhide 3x4 6x7 8x8 9x6 5x9 7x3' }
	),
	one(
		'times-rows',
		'Rows of seven and eight',
		'Facts side by side, answers open',
		'multiplication',
		{ multiplication: 'rows 7 8\nhide all' }
	),
	one( 'wall-four', 'Number wall', 'Four bricks at the base', 'wall', {
		wall: 'wall 3 5 2 4',
	} ),
	one( 'wall-gaps', 'Number wall with gaps', 'Bricks to fill in', 'wall', {
		wall: 'wall 6 ? 4 3\nhide 2.1 3.2 4.1',
	} ),
	one(
		'triangle-basic',
		'Number triangle',
		'Inner numbers, outer sums',
		'wall',
		{ wall: 'triangle 3 5 2\nhide outer' }
	),
	one( 'ruler-cm', 'Ruler', 'Twelve centimetres', 'ruler', {
		ruler: 'ruler 0..12 cm',
	} ),
	one( 'ruler-measure', 'Measuring', 'A span and a point', 'ruler', {
		ruler: 'ruler 0..12 cm\nmark 2.5..7 "4,5 cm"\nmark 9 "P"',
	} ),
	one( 'ruler-inch', 'Inch ruler', 'Quarters on six inches', 'ruler', {
		ruler: 'ruler 0..6 in\nmark 1.5..4.25 "2 3/4 in"',
	} ),
	{
		id: 'clock-lesson',
		name: 'Telling the time',
		subtitle: 'Title, three clocks, a question',
		params: {
			head: { title: 'What time is it?' },
			blocks: [
				{
					type: 'clock',
					clock: '7:35 "a"\n12:00 "b"\n4:50 "c"',
					numbers: 'numbers',
					hands: true,
					digital: false,
					gap: 30,
				},
				{
					type: 'text',
					text: 'Write the time under each clock. Which clock shows **half past**?',
					align: 'left',
				},
			],
		},
	},
	/* Secondary school */
	one( 'stats-dots', 'Dot plot', 'Six values on a line', 'stats', {
		stats: 'data 3, 5, 5, 7, 8, 12\nlabel "Points"',
		chart: 'dotplot',
		mean: true,
		median: true,
	} ),
	one( 'stats-bars', 'Bar chart', 'Frequencies of categories', 'stats', {
		stats: 'data red red blue green red blue\nlabel "Favourite colour"',
		chart: 'bar',
		counts: true,
	} ),
	one(
		'stats-box',
		'Box plot',
		'Quartiles, whiskers and an outlier',
		'stats',
		{
			stats: 'data 12, 15, 15, 17, 18, 19, 21, 22, 24, 40\nlabel "Minutes"',
			chart: 'boxplot',
		}
	),
	one( 'circle-30', 'Unit circle', 'Sine and cosine of 30°', 'unitcircle', {
		unitcircle: 'angle 30',
		sincos: true,
		special: true,
		units: 'degrees',
	} ),
	one(
		'circle-radians',
		'Radians',
		'Marks in multiples of pi',
		'unitcircle',
		{
			unitcircle: 'angle 2pi/3',
			sincos: true,
			special: true,
			units: 'radians',
		}
	),
	one(
		'circle-tangent',
		'Tangent',
		'The tangent segment at 40°',
		'unitcircle',
		{ unitcircle: 'angle 40', sincos: true, tangent: true, special: false }
	),
	one(
		'sets-intersection',
		'Intersection',
		'A ∩ B with the elements',
		'sets',
		{
			sets: 'A = {1, 2, 3, 4}\nB = {3, 4, 5, 6}\nU = {1..8}\nshade A ∩ B',
			elements: true,
		}
	),
	one( 'sets-difference', 'Difference', 'A without B', 'sets', {
		sets: 'A = {2, 4, 6, 8}\nB = {4, 8, 12}\nU = {1..12}\nshade A \\ B',
		elements: true,
	} ),
	one( 'sets-three', 'Three sets', 'The centre of three circles', 'sets', {
		sets: 'A\nB\nC\nshade A ∩ B ∩ C',
		elements: false,
	} ),
	one( 'tree-two', 'Two draws', 'Red and blue, with replacement', 'tree', {
		tree: 'R 0.3\n  R 0.3\n  B 0.7\nB 0.7\n  R 0.3\n  B 0.7',
		paths: true,
		format: 'typed',
		direction: 'right',
	} ),
	one(
		'tree-fractions',
		'Without replacement',
		'Fractions along the paths',
		'tree',
		{
			tree: 'R 3/10\n  R 2/9\n  B 7/9\nB 7/10\n  R 3/9\n  B 6/9',
			paths: true,
			format: 'typed',
			direction: 'right',
		}
	),
	one( 'tree-down', 'Coin, three times', 'A tree drawn downwards', 'tree', {
		tree: 'H 1/2\n  H 1/2\n    H 1/2\n    T 1/2\n  T 1/2\n    H 1/2\n    T 1/2\nT 1/2\n  H 1/2\n    H 1/2\n    T 1/2\n  T 1/2\n    H 1/2\n    T 1/2',
		paths: true,
		format: 'fraction',
		direction: 'down',
	} ),
	one( 'solids-box', 'Cuboid', 'With its dimensions', 'solids', {
		solids: 'cuboid 5 3 2',
		hidden: true,
		dims: true,
		net: false,
	} ),
	one(
		'solids-round',
		'Round solids',
		'Cylinder, cone and sphere',
		'solids',
		{
			solids: 'cylinder 2 5\ncone 2 5\nsphere 3',
			hidden: true,
			dims: true,
			net: false,
		}
	),
	one( 'solids-net', 'Cube and its net', 'The six faces unfolded', 'solids', {
		solids: 'cube 4',
		hidden: true,
		dims: false,
		net: true,
	} ),
	{
		id: 'probability-lesson',
		name: 'Two draws, explained',
		subtitle: 'Tree, formula, text',
		params: {
			head: { title: 'Drawing twice without replacement' },
			blocks: [
				{
					type: 'text',
					text: 'A bag holds 3 red and 7 blue marbles. Two are drawn without putting the first one back.',
					align: 'left',
				},
				{
					type: 'tree',
					tree: 'R 3/10\n  R 2/9\n  B 7/9\nB 7/10\n  R 3/9\n  B 6/9',
					paths: true,
					format: 'typed',
					direction: 'right',
					align: 'left',
				},
				{
					type: 'formula',
					latex: 'P(\\text{both red}) = \\frac{3}{10} \\cdot \\frac{2}{9} = \\frac{6}{90} = \\frac{1}{15}',
					formulaSize: 44,
				},
			],
			foot: {
				caption: 'Multiply along the branches, add over the paths.',
			},
		},
	},
];

export const STARTER_GROUPS = [
	...BLOCK_GROUPS,
	{ id: 'figures', label: 'Whole figures' },
];

export const groupOf = ( s ) =>
	s.params.blocks.length > 1
		? 'figures'
		: ( BLOCKS[ s.params.blocks[ 0 ].type ] || {} ).group || 'explain';

export const starterById = ( id ) =>
	STARTERS.find( ( s ) => s.id === id ) || null;
