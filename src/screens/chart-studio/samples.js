/**
 * Chart & Table Studio shared data (v1.269.0): the type catalog for the
 * gallery, per-type sample data, default options and pricing tiers -
 * moved out of the old chart-dialog so gallery, grid and panel share
 * one source.
 */

import { __ } from '@wordpress/i18n';

import { gridToText } from '../../lib/grid-model';

export const TYPE_GROUPS = () => [
	{
		id: 'charts',
		label: __( 'Charts', 'wunderpaint' ),
		items: [
			{ id: 'bar', label: __( 'Bars', 'wunderpaint' ) },
			{ id: 'barH', label: __( 'Bars (horizontal)', 'wunderpaint' ) },
			{
				id: 'barStacked',
				label: __( 'Stacked bars', 'wunderpaint' ),
			},
			{ id: 'line', label: __( 'Line', 'wunderpaint' ) },
			{ id: 'area', label: __( 'Area', 'wunderpaint' ) },
			{ id: 'pie', label: __( 'Pie', 'wunderpaint' ) },
			{ id: 'donut', label: __( 'Donut', 'wunderpaint' ) },
			{ id: 'radar', label: __( 'Radar', 'wunderpaint' ) },
			{ id: 'rings', label: __( 'Progress rings', 'wunderpaint' ) },
			{ id: 'scatter', label: __( 'Scatter', 'wunderpaint' ) },
			{ id: 'waterfall', label: __( 'Waterfall', 'wunderpaint' ) },
			{ id: 'funnel', label: __( 'Funnel', 'wunderpaint' ) },
			{ id: 'gauge', label: __( 'Gauge', 'wunderpaint' ) },
			{ id: 'kpi', label: __( 'KPI tile', 'wunderpaint' ) },
			{ id: 'combo', label: __( 'Combo', 'wunderpaint' ) },
			{ id: 'lollipop', label: __( 'Lollipop', 'wunderpaint' ) },
			{ id: 'heatmap', label: __( 'Heatmap', 'wunderpaint' ) },
			{ id: 'bullet', label: __( 'Bullet', 'wunderpaint' ) },
			{ id: 'histogram', label: __( 'Histogram', 'wunderpaint' ) },
			{ id: 'pictogram', label: __( 'Pictogram', 'wunderpaint' ) },
			{ id: 'dumbbell', label: __( 'Dumbbell', 'wunderpaint' ) },
			{ id: 'slope', label: __( 'Slope', 'wunderpaint' ) },
			{ id: 'bump', label: __( 'Bump ranking', 'wunderpaint' ) },
			{ id: 'treemap', label: __( 'Treemap', 'wunderpaint' ) },
		],
	},
	{
		id: 'tables',
		label: __( 'Tables', 'wunderpaint' ),
		items: [
			{ id: 'tableData', label: __( 'Data table', 'wunderpaint' ) },
			{
				id: 'tableComparison',
				label: __( 'Comparison table', 'wunderpaint' ),
			},
			{
				id: 'tablePricing',
				label: __( 'Pricing table', 'wunderpaint' ),
			},
			{
				id: 'tableRanking',
				label: __( 'Ranking', 'wunderpaint' ),
			},
			{
				id: 'tableSchedule',
				label: __( 'Schedule', 'wunderpaint' ),
			},
			{
				id: 'tableChecklist',
				label: __( 'Checklist', 'wunderpaint' ),
			},
			{
				id: 'tableMenu',
				label: __( 'Menu / price list', 'wunderpaint' ),
			},
			{ id: 'tableSpec', label: __( 'Spec sheet', 'wunderpaint' ) },
			{
				id: 'tableScorecard',
				label: __( 'Scorecard', 'wunderpaint' ),
			},
			{
				id: 'tableCalendar',
				label: __( 'Calendar month', 'wunderpaint' ),
			},
			{
				id: 'tableStandings',
				label: __( 'Standings', 'wunderpaint' ),
			},
		],
	},
];

export const SAMPLES = {
	bar: 'Month, Revenue\nJan, 42\nFeb, 58\nMar, 51\nApr, 69',
	barH: 'Channel, Visits\nSearch, 620\nSocial, 410\nDirect, 280\nMail, 150',
	barStacked:
		'Quarter, Product A, Product B\nQ1, 30, 22\nQ2, 38, 25\nQ3, 33, 31\nQ4, 45, 34',
	line: 'Month, Revenue, Costs\nJan, 42, 30\nFeb, 58, 33\nMar, 51, 35\nApr, 69, 38\nMay, 74, 40',
	area: 'Month, Revenue, Costs\nJan, 42, 30\nFeb, 58, 33\nMar, 51, 35\nApr, 69, 38\nMay, 74, 40',
	pie: 'Segment, Share\nOrganic, 44\nAds, 26\nSocial, 18\nOther, 12',
	donut: 'Segment, Share\nOrganic, 44\nAds, 26\nSocial, 18\nOther, 12',
	radar: 'Skill, Team A, Team B\nSpeed, 80, 65\nQuality, 72, 88\nCost, 60, 70\nSupport, 85, 75\nInnovation, 70, 82',
	rings: 'Goal, Progress\nRevenue, 72',
	scatter:
		'Campaign, Spend, Leads\nSearch, 12, 48\nSocial, 8, 22\nMail, 5, 19\nDisplay, 15, 30',
	waterfall:
		'Step, Change\nStart, 40\nSales, 25\nUpsell, 12\nCosts, -18\nRefunds, -7',
	funnel: 'Stage, Users\nVisits, 1200\nSignups, 480\nTrials, 190\nCustomers, 60',
	gauge: 'Goal, Progress\nRevenue, 72',
	kpi: 'Month, Revenue\nJan, 42\nFeb, 58\nMar, 51\nApr, 69\nMay, 74\nJun, 81',
	combo: 'Month, Revenue, Trend\nJan, 42, 40\nFeb, 58, 50\nMar, 51, 55\nApr, 69, 62',
	lollipop: 'Channel, Score\nSearch, 82\nSocial, 64\nMail, 47\nDirect, 31',
	heatmap:
		'Day, Morning, Noon, Evening\nMon, 12, 30, 22\nTue, 18, 34, 25\nWed, 9, 28, 31\nThu, 14, 36, 20\nFri, 22, 41, 35',
	bullet: 'KPI, Actual, Target, Max\nRevenue, 68, 80, 100\nLeads, 45, 40, 100\nNPS, 72, 75, 100',
	histogram:
		'Order value\n12\n18\n22\n25\n27\n31\n33\n38\n41\n44\n52\n58\n61\n67\n74\n82',
	pictogram: 'Team, Members\nBerlin, 8\nHamburg, 5\nRemote, 12',
	dumbbell: 'Product, 2025, 2026\nBasic, 20, 34\nPro, 45, 61\nSuite, 30, 42',
	slope: 'Country, 2025, 2026\nDE, 34, 42\nAT, 28, 25\nCH, 22, 30',
	bump: 'Team, Q1, Q2, Q3, Q4\nAlpha, 1, 2, 2, 1\nBeta, 2, 1, 3, 3\nGamma, 3, 3, 1, 2',
	treemap:
		'Segment, Share\nOrganic, 44\nAds, 26\nSocial, 18\nReferral, 8\nOther, 4',
	tableData:
		'Month, Revenue, Region\nJanuary, 42000, North\nFebruary, 58500, South\nMarch, 51200, East\nApril, 69900, West',
	tableComparison:
		'Feature, Free, Pro, Business\nImage editor, yes, yes, yes\nBackground removal, no, yes, yes\nBatch export, no, yes, yes\nAutomation, no, no, yes\nSupport, -, Email, Priority',
	tableRanking:
		'Name, Points, Trend\nAlpha Team, 94, +1\nBeta Crew, 89, -1\nGamma Five, 81, 0\nDelta Squad, 76, +2',
	tableSchedule:
		'Time, Session, Room\n09:00, Registration & Coffee, Foyer\n10:00, Opening Keynote, Hall A\n11:30, Workshop Design Systems, Lab 2\n13:00, Lunch Break, Garden\n14:30, Panel: AI in Production, Hall B',
	tableChecklist:
		'Task, Done\nBrand kit uploaded, yes\nTemplates reviewed, yes\nLaunch post scheduled, no\nAnalytics connected, no',
	tableMenu:
		'Dish, Description, Price\nBruschetta, Grilled bread with tomatoes and basil, 6.50\nSpaghetti Carbonara, Guanciale and pecorino romano, 12.90\nTiramisu, Espresso-soaked ladyfingers, 5.90',
	tableSpec:
		'Property, Value\nDisplay,\nSize, 6.1 inch\nResolution, 2556 x 1179\nBattery,\nCapacity, 3349 mAh\nWireless charging, yes',
	tableScorecard:
		'KPI, Value, Delta\nRevenue, 48.2k, +12%\nOrders, 1204, +8%\nAOV, 40.03, -2%\nReturning, 31%, +4%',
	tableCalendar:
		'Date, Event\n2026-07-03, Team offsite\n2026-07-14, Release v2\n2026-07-21, Webinar\n2026-07-28, Board review',
	tableStandings:
		'Team, W, D, L, Points\nAlpha, 10, 2, 1, 32\nBeta, 9, 1, 3, 28\nGamma, 7, 4, 2, 25\nDelta, 6, 3, 4, 21',
};

/** True when the grid still equals one of the bundled samples. */
export function isSampleText( grid ) {
	const text = gridToText( grid );
	return Object.values( SAMPLES ).some( ( s ) => s === text );
}

export const DEFAULT_TIERS = [
	{
		name: 'Starter',
		price: '€9',
		period: 'per month',
		features: 'One user\n10 projects\nEmail support',
		highlight: false,
		cta: 'Choose',
	},
	{
		name: 'Pro',
		price: '€29',
		period: 'per month',
		features:
			'Five users\nUnlimited projects\nPriority support\nAutomation',
		highlight: true,
		cta: 'Choose',
	},
	{
		name: 'Business',
		price: '€79',
		period: 'per month',
		features: 'Your team\nSSO\nSLA\nOnboarding',
		highlight: false,
		cta: 'Contact us',
	},
];

// Canned sample data so the design thumbnails show the STYLE, not the
// user's live data (they stay stable while the user types).
export const STYLE_SAMPLE = {
	tableData: {
		headers: [ 'Item', 'Value', 'Note' ],
		rows: [
			[ 'Alpha', '42', 'North' ],
			[ 'Beta', '58', 'South' ],
			[ 'Gamma', '51', 'East' ],
		],
	},
	tableComparison: {
		headers: [ 'Feature', 'Free', 'Pro' ],
		rows: [
			[ 'Editor', 'yes', 'yes' ],
			[ 'AI tools', 'no', 'yes' ],
			[ 'Automation', 'no', 'yes' ],
		],
	},
	tablePricing: {
		tiers: [
			{
				name: 'Starter',
				price: '€9',
				features: [ 'One', 'Two' ],
				cta: 'Go',
			},
			{
				name: 'Pro',
				price: '€29',
				features: [ 'One', 'Two', 'Three' ],
				highlight: true,
				cta: 'Go',
			},
		],
	},
};

export const DEFAULT_OPTIONS = {
	rounded: 35,
	gap: 40,
	smooth: true,
	thickness: 55,
	values: 'off',
	prefix: '',
	suffix: '',
	legend: true,
	axes: true,
	title: '',
	subtitle: '',
	// Table style (see src/lib/table.js STYLE_DEFAULTS).
	preset: 'classic',
	header: 'solid',
	rows: 'zebra',
	container: 'outline',
	radius: 6,
	density: 'normal',
	mark: 'check',
	marksMode: 'both',
	gradient: false,
	gradientAngle: 90,
	badge: true,
	headerWeight: 700,
	textScale: 1,
	highlightCol: -1,
	// Studio style options (v1.269, see src/lib/chart.js).
	card: 'none',
	gridLines: null,
	outline: false,
	labelWeight: 400,
	valueWeight: 600,
	series: [],
	thousands: false,
	decimals: null,
	fontFamily: 'Inter',
	useBrand: false,
	// Remembered "Colors from…" source ('kit:ID' | 'set:ID' | '');
	// a non-empty value locks the palette like useBrand (v1.272.5).
	colorsFrom: '',
	// Table geometry knobs (v1.270, see src/lib/table.js).
	wrap: true,
	maxLines: 4,
	rowScale: 1,
	cellPad: 1,
	outerPad: 1,
	headerScale: 1,
};
