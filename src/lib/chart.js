/**
 * Chart engine 2.0 (v1.114.0): nine chart types built as a group of
 * fully editable vector/text layers - multi-series bars (grouped and
 * stacked, vertical and horizontal), smoothed lines and areas, pie,
 * donut with thickness, radar and KPI progress rings. Deterministic
 * geometry (no randomness), so the dialog preview, the inserted layers
 * and the Edit Chart rebuild always agree.
 */

import { __ } from '@wordpress/i18n';

import { makeShape, makeText, makeGroup } from '../store/document';
import { tightenPathLayer } from './path-edit';
import { hueShift, onColor } from './table';

/** Mix two hex colors (t 0..1 toward b). */
const mixHex = ( a, b, t ) => {
	const pa = parseInt( String( a ).replace( '#', '' ), 16 );
	const pb = parseInt( String( b ).replace( '#', '' ), 16 );
	const ch = ( shift ) => {
		const ca = ( pa >> shift ) & 255;
		const cb = ( pb >> shift ) & 255;
		return Math.round( ca + ( cb - ca ) * t );
	};
	return (
		'#' +
		[ 16, 8, 0 ]
			.map( ( s ) => ch( s ).toString( 16 ).padStart( 2, '0' ) )
			.join( '' )
	);
};

export const CHART_COLORS = [
	'#3b66ff',
	'#ff6a00',
	'#00a32a',
	'#d63638',
	'#8e2de2',
	'#00bcd4',
	'#f9d423',
	'#607d8b',
];

export const CHART_TYPES = [
	'bar',
	'barH',
	'barStacked',
	'line',
	'area',
	'pie',
	'donut',
	'radar',
	'rings',
	'scatter',
	'waterfall',
	'funnel',
	'gauge',
	'kpi',
	'combo',
	'lollipop',
	'heatmap',
	'bullet',
	'histogram',
	'pictogram',
	'dumbbell',
	'slope',
	'bump',
	'treemap',
];

const DEFAULT_OPTIONS = {
	rounded: 35, // 0-100 bar corner rounding
	gap: 40, // 0-100 category gap
	smooth: true, // line/area curves
	thickness: 55, // 0-100 donut/ring thickness
	values: 'off', // off | value | percent
	prefix: '',
	suffix: '',
	legend: true,
	axes: true,
	title: '',
	subtitle: '',
	// Studio style options (v1.269).
	card: 'none', // none | soft | dark
	gridLines: null, // null = follow axes
	outline: false,
	labelWeight: 400,
	valueWeight: 600,
	series: [], // per-series {name, color, hidden, dash, markers}
	thousands: false,
	decimals: null,
	groupSep: ',',
	decSep: '.',
};

const lerp = ( a, b, t ) => a + ( b - a ) * t;

const wedgePath = ( cx, cy, r, a0, a1, inner = 0 ) => {
	const steps = Math.max( 2, Math.ceil( ( ( a1 - a0 ) / Math.PI ) * 32 ) );
	const arc = ( radius, from, to, stepsN ) => {
		const pts = [];
		for ( let i = 0; i <= stepsN; i++ ) {
			const a = from + ( ( to - from ) * i ) / stepsN;
			pts.push(
				`${ cx + radius * Math.cos( a ) } ${
					cy + radius * Math.sin( a )
				}`
			);
		}
		return pts;
	};
	const outer = arc( r, a0, a1, steps );
	let d = `M ${ outer[ 0 ] } L ${ outer.slice( 1 ).join( ' L ' ) }`;
	if ( inner > 0 ) {
		const innerArc = arc( inner, a1, a0, steps );
		d += ` L ${ innerArc.join( ' L ' ) } Z`;
	} else {
		d += ` L ${ cx } ${ cy } Z`;
	}
	return d;
};

/** Straight or Catmull-Rom-smoothed path through points. */
const linePath = ( pts, smooth, close = null ) => {
	if ( ! pts.length ) {
		return '';
	}
	let d = `M ${ pts[ 0 ].x } ${ pts[ 0 ].y }`;
	if ( smooth && pts.length > 2 ) {
		for ( let i = 1; i < pts.length; i++ ) {
			const p0 = pts[ Math.max( 0, i - 2 ) ];
			const p1 = pts[ i - 1 ];
			const p2 = pts[ i ];
			const p3 = pts[ Math.min( pts.length - 1, i + 1 ) ];
			const c1x = p1.x + ( p2.x - p0.x ) / 6;
			const c1y = p1.y + ( p2.y - p0.y ) / 6;
			const c2x = p2.x - ( p3.x - p1.x ) / 6;
			const c2y = p2.y - ( p3.y - p1.y ) / 6;
			d += ` C ${ c1x } ${ c1y } ${ c2x } ${ c2y } ${ p2.x } ${ p2.y }`;
		}
	} else {
		for ( let i = 1; i < pts.length; i++ ) {
			d += ` L ${ pts[ i ].x } ${ pts[ i ].y }`;
		}
	}
	if ( close ) {
		d += ` L ${ pts[ pts.length - 1 ].x } ${ close.y } L ${ pts[ 0 ].x } ${
			close.y
		} Z`;
	}
	return d;
};

/** Catmull-Rom sample of the polyline (8 substeps per segment). */
const samplePts = ( pts, smooth ) => {
	if ( ! smooth || pts.length < 3 ) {
		return pts;
	}
	const out = [ pts[ 0 ] ];
	for ( let i = 1; i < pts.length; i++ ) {
		const p0 = pts[ Math.max( 0, i - 2 ) ];
		const p1 = pts[ i - 1 ];
		const p2 = pts[ i ];
		const p3 = pts[ Math.min( pts.length - 1, i + 1 ) ];
		for ( let step = 1; step <= 8; step++ ) {
			const t = step / 8;
			const t2 = t * t;
			const t3 = t2 * t;
			out.push( {
				x:
					0.5 *
					( 2 * p1.x +
						( p2.x - p0.x ) * t +
						( 2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x ) * t2 +
						( 3 * p1.x - p0.x - 3 * p2.x + p3.x ) * t3 ),
				y:
					0.5 *
					( 2 * p1.y +
						( p2.y - p0.y ) * t +
						( 2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y ) * t2 +
						( 3 * p1.y - p0.y - 3 * p2.y + p3.y ) * t3 ),
			} );
		}
	}
	return out;
};

/** Dash the (sampled) polyline into M/L subpaths. */
const dashedPath = ( pts, smooth, dashLen, gapLen ) => {
	const pl = samplePts( pts, smooth );
	if ( ! pl.length ) {
		return '';
	}
	let pen = true;
	let budget = dashLen;
	let cur = pl[ 0 ];
	let d = `M ${ cur.x } ${ cur.y }`;
	for ( let i = 1; i < pl.length; i++ ) {
		const next = pl[ i ];
		let segLen = Math.hypot( next.x - cur.x, next.y - cur.y );
		while ( segLen > budget ) {
			const t = budget / segLen;
			const mid = {
				x: cur.x + ( next.x - cur.x ) * t,
				y: cur.y + ( next.y - cur.y ) * t,
			};
			d += pen ? ` L ${ mid.x } ${ mid.y }` : ` M ${ mid.x } ${ mid.y }`;
			pen = ! pen;
			segLen -= budget;
			budget = pen ? dashLen : gapLen;
			cur = mid;
		}
		budget -= segLen;
		if ( pen ) {
			d += ` L ${ next.x } ${ next.y }`;
		}
		cur = next;
	}
	return d;
};

/** A friendly rounded axis maximum (1/2/2.5/5 x 10^n). */
export function niceMax( value ) {
	const v = Math.max( 1e-9, value );
	const mag = Math.pow( 10, Math.floor( Math.log10( v ) ) );
	for ( const m of [ 1, 2, 2.5, 5, 10 ] ) {
		if ( v <= m * mag ) {
			return m * mag;
		}
	}
	return 10 * mag;
}

/**
 * Value label formatting: prefix + number + suffix. With `thousands` or
 * `decimals` set the number is grouped/fixed (chart-studio column
 * formats); otherwise the legacy compact form (12.3k) is kept.
 *
 * @param {number} v       Value.
 * @param {Object} options {prefix, suffix, thousands, decimals, groupSep, decSep}.
 * @return {string} Display string.
 */
export function fmtValue( v, options = {} ) {
	const o = options;
	const wrap = ( num ) => `${ o.prefix || '' }${ num }${ o.suffix || '' }`;
	if ( o.thousands || Number.isFinite( o.decimals ) ) {
		const dec = Number.isFinite( o.decimals )
			? o.decimals
			: Number.isInteger( v )
			? 0
			: 1;
		const neg = v < 0 ? '-' : '';
		const parts = Math.abs( v ).toFixed( dec ).split( '.' );
		let int = parts[ 0 ];
		if ( o.thousands ) {
			int = int.replace( /\B(?=(\d{3})+(?!\d))/g, o.groupSep || ',' );
		}
		return wrap(
			neg + int + ( parts[ 1 ] ? ( o.decSep || '.' ) + parts[ 1 ] : '' )
		);
	}
	const abs = Math.abs( v );
	let num;
	if ( Number.isInteger( v ) && abs < 10000 ) {
		num = String( v );
	} else if ( abs >= 10000 ) {
		num = Math.round( v / 100 ) / 10 + 'k';
	} else {
		num = String( Math.round( v * 10 ) / 10 );
	}
	return wrap( num );
}

/**
 * Build chart layers.
 *
 * @param {Object} spec { type, labels[], series[{name, values[]}],
 *                        colors[], x, y, w, h, options{} }.
 * @return {{group: Object, layers: Array}} Group + member layers (flat,
 *          double-linked: children carry parent, group lists child ids).
 */
export function buildChart( spec ) {
	let { x, y, w, h } = spec;
	const type = CHART_TYPES.includes( spec.type ) ? spec.type : 'bar';
	const o = { ...DEFAULT_OPTIONS, ...( spec.options || {} ) };
	const labels = ( spec.labels || [] ).map( ( l ) => String( l ?? '' ) );
	const keepNeg = 'waterfall' === type;
	const sOpts = Array.isArray( o.series ) ? o.series : [];
	const series = ( spec.series || [] )
		.map( ( s, i ) => ( {
			name: String( ( sOpts[ i ]?.name ?? s.name ) || '' ),
			color: sOpts[ i ]?.color || null,
			dash: !! sOpts[ i ]?.dash,
			markers: sOpts[ i ]?.markers ?? true,
			hidden: !! sOpts[ i ]?.hidden,
			index: i,
			values: ( s.values || [] ).map( ( v ) =>
				Number.isFinite( v ) ? ( keepNeg ? v : Math.max( 0, v ) ) : 0
			),
		} ) )
		.filter( ( s ) => ! s.hidden && s.values.some( ( v ) => 0 !== v ) );
	const colors = spec.colors?.length ? spec.colors : CHART_COLORS;
	const colorAt = ( i ) => colors[ i % colors.length ];
	const seriesColor = ( s ) => s.color || colorAt( s.index );
	const group = makeGroup( { name: `Chart (${ type })`, x, y, w, h } );
	const layers = [];
	const push = ( layer ) => {
		// Slices, rings, lines and areas are built as doc-space paths in a
		// box that starts at the DOCUMENT origin - depending on where the
		// chart sits that adds hundreds of phantom padding pixels to the
		// selection frame. Shrink to the real path extents (v1.130.0).
		if ( layer.pathD ) {
			layer = tightenPathLayer(
				layer,
				layer.strokeW ? Math.ceil( layer.strokeW / 2 ) : 0
			);
		}
		layer.parent = group.id;
		layers.push( layer );
		return layer;
	};
	if ( ! labels.length || ! series.length ) {
		group.children = [];
		return { group, layers };
	}

	const unit = Math.min( w, h );
	const baseSize = Math.max( 9, Math.round( unit * 0.045 ) );
	const onDarkCard = 'dark' === o.card;
	const gray = onDarkCard ? '#9aa3b2' : '#8a8f98';
	const dark = onDarkCard ? '#f3f4f6' : '#2c3338';
	const gridCol = ( g ) => {
		if ( onDarkCard ) {
			return 0 === g ? '#4a505a' : '#343a43';
		}
		return 0 === g ? '#c6cad1' : '#e8eaee';
	};

	// Background card (soft/dark) behind everything, content padded in.
	if ( 'none' !== o.card ) {
		push(
			makeShape( {
				name: 'Card',
				shape: 'rect',
				x,
				y,
				w,
				h,
				fill: onDarkCard ? '#20242b' : '#ffffff',
				stroke: onDarkCard ? null : '#e6e8ec',
				strokeW: onDarkCard ? 0 : 1,
				radius: Math.round( unit * 0.05 ),
			} )
		);
		const pad = Math.round( unit * 0.06 );
		x += pad;
		y += pad;
		w -= pad * 2;
		h -= pad * 2;
	}

	/* ------------------------------ chrome ----------------------------- */
	let top = y;
	if ( o.title ) {
		const size = Math.round( baseSize * 1.7 );
		push(
			makeText( {
				name: 'Title',
				text: o.title,
				x,
				y: top,
				w,
				h: Math.round( size * 1.3 ),
				fontSize: size,
				align: 'center',
				color: dark,
				weight: 700,
				fixedWidth: true,
			} )
		);
		top += size * 1.5;
	}
	if ( o.subtitle ) {
		const size = Math.round( baseSize * 1.05 );
		push(
			makeText( {
				name: 'Subtitle',
				text: o.subtitle,
				x,
				y: Math.round( top ),
				w,
				h: Math.round( size * 1.3 ),
				fontSize: size,
				align: 'center',
				color: gray,
				weight: 400,
				fixedWidth: true,
			} )
		);
		top += size * 1.7;
	}

	// Legend entries: series names (multi-series), labels (parts/rings).
	const legendItems =
		'pie' === type || 'donut' === type || 'rings' === type
			? labels.map( ( l, i ) => ( { label: l, color: colorAt( i ) } ) )
			: 'waterfall' === type
			? [
					{
						label: __( 'Increase', 'wunderpaint' ),
						color: colorAt( 0 ),
					},
					{
						label: __( 'Decrease', 'wunderpaint' ),
						color: colors[ 1 ] || '#d63638',
					},
					{
						label: __( 'Total', 'wunderpaint' ),
						color: colors[ 2 ] || dark,
					},
			  ]
			: 'bump' === type
			? [] // the series ARE the labelled lines; a legend collides.
			: series.length > 1
			? series.map( ( s ) => ( {
					label: s.name || `Series ${ s.index + 1 }`,
					color: seriesColor( s ),
			  } ) )
			: [];
	const showLegend = o.legend && legendItems.length > 0;
	let bottom = y + h;
	if ( showLegend ) {
		const size = baseSize;
		const sw = Math.round( size * 0.9 );
		const gapX = Math.round( size * 0.7 );
		const widths = legendItems.map(
			( it ) => sw + gapX / 2 + it.label.length * size * 0.58
		);
		const totalW = widths.reduce( ( a, b ) => a + b + gapX, -gapX );
		let lx = x + Math.max( 0, ( w - totalW ) / 2 );
		const ly = y + h - size * 1.2;
		legendItems.forEach( ( it, i ) => {
			push(
				makeShape( {
					name: `Legend ${ it.label }`,
					shape: 'rect',
					x: Math.round( lx ),
					y: Math.round( ly ),
					w: sw,
					h: sw,
					fill: it.color,
					radius: Math.round( sw / 4 ),
				} )
			);
			push(
				makeText( {
					name: `Legend label ${ it.label }`,
					text: it.label,
					x: Math.round( lx + sw + gapX / 2 ),
					y: Math.round( ly - size * 0.15 ),
					w: Math.round( widths[ i ] ),
					h: Math.round( size * 1.3 ),
					fontSize: size,
					align: 'left',
					color: dark,
					weight: 400,
				} )
			);
			lx += widths[ i ] + gapX;
		} );
		bottom -= size * 2;
	}

	const cartesian = [
		'bar',
		'barH',
		'barStacked',
		'line',
		'area',
		'combo',
		'histogram',
	].includes( type );
	const catLabelSpace =
		( cartesian || 'waterfall' === type || 'bump' === type ) &&
		o.axes &&
		'barH' !== type
			? baseSize * 1.8
			: 0;
	// Value-axis max first: the tick labels' width decides the left
	// gutter, so bars never start flush against the numbers (v1.302).
	const maxPerPre = ( i ) =>
		Math.max( ...series.map( ( sr ) => sr.values[ i ] || 0 ) );
	const stackSumPre = ( i ) =>
		series.reduce( ( sum, sr ) => sum + ( sr.values[ i ] || 0 ), 0 );
	const rawMaxPre =
		'barStacked' === type
			? Math.max( ...labels.map( ( _, i ) => stackSumPre( i ) ) )
			: Math.max( ...labels.map( ( _, i ) => maxPerPre( i ) ) );
	const axisMaxPre = o.axes
		? niceMax( rawMaxPre )
		: Math.max( 1e-9, rawMaxPre );
	const yGutter =
		( cartesian || 'scatter' === type || 'combo' === type ) &&
		o.axes &&
		'barH' !== type
			? Math.round(
					Math.min(
						w * 0.2,
						Math.max(
							...[ 1, 2, 3, 4 ].map(
								( gI ) =>
									fmtValue( ( axisMaxPre * gI ) / 4, o )
										.length
							)
						) *
							baseSize *
							0.58 +
							baseSize * 0.6
					)
			  )
			: 0;
	const plot = {
		x: x + yGutter,
		y: Math.round( top ),
		w: w - yGutter,
		h: Math.round( bottom - top - catLabelSpace ),
	};
	if ( 'barH' === type && o.axes ) {
		// Horizontal bars: labels live left of the bars.
		const gutter = Math.round(
			Math.min(
				w * 0.3,
				Math.max( ...labels.map( ( l ) => l.length ) ) * baseSize * 0.6
			)
		);
		plot.x = x + gutter;
		plot.w = w - gutter;
	}

	const maxPer = ( i ) =>
		Math.max( ...series.map( ( s ) => s.values[ i ] || 0 ) );
	const stackSum = ( i ) =>
		series.reduce( ( sum, s ) => sum + ( s.values[ i ] || 0 ), 0 );
	const rawMax =
		'barStacked' === type
			? Math.max( ...labels.map( ( _, i ) => stackSum( i ) ) )
			: Math.max( ...labels.map( ( _, i ) => maxPer( i ) ) );
	const axisMax = o.axes ? niceMax( rawMax ) : Math.max( 1e-9, rawMax );

	const valueText = ( v, total ) =>
		'percent' === o.values
			? Math.round( ( v / Math.max( 1e-9, total ) ) * 100 ) + '%'
			: fmtValue( v, o );

	/* ---------------------------- gridlines ---------------------------- */
	const showGrid = null === o.gridLines ? o.axes : !! o.gridLines;
	if ( cartesian && showGrid && 'barH' !== type ) {
		for ( let g = 0; g <= 4; g++ ) {
			const gy = plot.y + plot.h - ( plot.h * g ) / 4;
			push(
				makeShape( {
					name: `Grid ${ g }`,
					shape: 'rect',
					x: plot.x,
					y: Math.round( gy ),
					w: plot.w,
					h: 1,
					fill: gridCol( g ),
				} )
			);
			if ( g > 0 && o.axes ) {
				push(
					makeText( {
						name: `Tick ${ g }`,
						text: fmtValue( ( axisMax * g ) / 4, o ),
						x,
						y: Math.round( gy - baseSize * 0.55 ),
						w: Math.max(
							10,
							yGutter - Math.round( baseSize * 0.5 )
						),
						h: Math.round( baseSize * 1.2 ),
						fontSize: Math.round( baseSize * 0.85 ),
						align: 'right',
						color: gray,
						weight: 400,
					} )
				);
			}
		}
	}

	/* ------------------------------- bars ------------------------------ */
	const catLabel = ( text, cx2, yTop, wBox ) =>
		push(
			makeText( {
				name: `Label ${ text }`,
				text,
				x: Math.round( cx2 - wBox / 2 ),
				y: Math.round( yTop ),
				w: Math.round( wBox ),
				h: Math.round( baseSize * 1.4 ),
				fontSize: baseSize,
				align: 'center',
				color: gray,
				weight: o.labelWeight,
			} )
		);

	// Bar/segment fill: outline preset, vertical gradient or solid.
	const barFill = ( color, vertical = true ) => {
		if ( o.outline ) {
			return {
				fill: 'transparent',
				stroke: color,
				strokeW: Math.max( 2, Math.round( unit / 120 ) ),
			};
		}
		if ( o.gradient ) {
			return {
				fill: color,
				fillType: 'gradient',
				gradientStops: [
					{ color: hueShift( color, 18 ), at: 0 },
					{ color, at: 1 },
				],
				gradientAngle: vertical ? 180 : 90,
			};
		}
		return { fill: color };
	};

	if ( 'bar' === type || 'barStacked' === type ) {
		const catW = plot.w / labels.length;
		const catGap = catW * lerp( 0.1, 0.6, o.gap / 100 );
		const innerW = catW - catGap;
		const perBar = 'barStacked' === type ? innerW : innerW / series.length;
		labels.forEach( ( label, i ) => {
			const cx0 = plot.x + i * catW + catGap / 2;
			if ( 'barStacked' === type ) {
				let acc = 0;
				series.forEach( ( s ) => {
					const v = s.values[ i ] || 0;
					if ( v <= 0 ) {
						return;
					}
					const bh = ( v / axisMax ) * plot.h;
					const by =
						plot.y + plot.h - ( ( acc + v ) / axisMax ) * plot.h;
					const isTop = acc + v >= stackSum( i ) - 1e-9;
					push(
						makeShape( {
							name: `${ label } / ${ s.name || s.index + 1 }`,
							shape: 'rect',
							x: Math.round( cx0 ),
							y: Math.round( by ),
							w: Math.round( perBar ),
							h: Math.max( 1, Math.round( bh ) ),
							...barFill( seriesColor( s ) ),
							radius: isTop
								? Math.round(
										( o.rounded / 100 ) * ( perBar / 3 )
								  )
								: 0,
						} )
					);
					acc += v;
				} );
				if ( 'off' !== o.values ) {
					push(
						makeText( {
							name: `Value ${ label }`,
							text: valueText( stackSum( i ), rawMax ),
							x: Math.round( cx0 - perBar / 2 ),
							y: Math.round(
								plot.y +
									plot.h -
									( stackSum( i ) / axisMax ) * plot.h -
									baseSize * 1.3
							),
							w: Math.round( perBar * 2 ),
							h: Math.round( baseSize * 1.2 ),
							fontSize: Math.round( baseSize * 0.9 ),
							align: 'center',
							color: dark,
							weight: o.valueWeight,
						} )
					);
				}
			} else {
				series.forEach( ( s, si ) => {
					const v = s.values[ i ] || 0;
					const bh = Math.max( 1, ( v / axisMax ) * plot.h );
					const bx = cx0 + si * perBar;
					push(
						makeShape( {
							name: `${ label }${
								series.length > 1
									? ' / ' + ( s.name || s.index + 1 )
									: ''
							}`,
							shape: 'rect',
							x: Math.round( bx ),
							y: Math.round( plot.y + plot.h - bh ),
							w: Math.max( 1, Math.round( perBar - 2 ) ),
							h: Math.round( bh ),
							...barFill( seriesColor( s ) ),
							radius: Math.round(
								( o.rounded / 100 ) * ( perBar / 3 )
							),
						} )
					);
					if ( 'off' !== o.values ) {
						push(
							makeText( {
								name: `Value ${ label } ${ si }`,
								text: valueText( v, rawMax ),
								x: Math.round( bx - perBar / 2 ),
								y: Math.round(
									plot.y + plot.h - bh - baseSize * 1.3
								),
								w: Math.round( perBar * 2 ),
								h: Math.round( baseSize * 1.2 ),
								fontSize: Math.round( baseSize * 0.85 ),
								align: 'center',
								color: dark,
								weight: o.valueWeight,
							} )
						);
					}
				} );
			}
			if ( o.axes ) {
				catLabel(
					label,
					cx0 + innerW / 2,
					plot.y + plot.h + baseSize * 0.5,
					catW
				);
			}
		} );
	}

	if ( 'barH' === type ) {
		const catH = plot.h / labels.length;
		const catGap = catH * lerp( 0.1, 0.6, o.gap / 100 );
		const innerH = catH - catGap;
		const perBar = innerH / series.length;
		labels.forEach( ( label, i ) => {
			const cy0 = plot.y + i * catH + catGap / 2;
			series.forEach( ( s, si ) => {
				const v = s.values[ i ] || 0;
				const bw = Math.max( 1, ( v / axisMax ) * plot.w * 0.94 );
				const by = cy0 + si * perBar;
				push(
					makeShape( {
						name: `${ label }${
							series.length > 1
								? ' / ' + ( s.name || s.index + 1 )
								: ''
						}`,
						shape: 'rect',
						x: Math.round( plot.x ),
						y: Math.round( by ),
						w: Math.round( bw ),
						h: Math.max( 1, Math.round( perBar - 2 ) ),
						...barFill( seriesColor( s ), false ),
						radius: Math.round(
							( o.rounded / 100 ) * ( perBar / 3 )
						),
					} )
				);
				if ( 'off' !== o.values ) {
					push(
						makeText( {
							name: `Value ${ label } ${ si }`,
							text: valueText( v, rawMax ),
							x: Math.round( plot.x + bw + baseSize * 0.4 ),
							y: Math.round( by + perBar / 2 - baseSize * 0.65 ),
							w: Math.round( w * 0.2 ),
							h: Math.round( baseSize * 1.2 ),
							fontSize: Math.round( baseSize * 0.85 ),
							align: 'left',
							color: dark,
							weight: o.valueWeight,
						} )
					);
				}
			} );
			if ( o.axes ) {
				push(
					makeText( {
						name: `Label ${ label }`,
						text: label,
						x,
						y: Math.round( cy0 + innerH / 2 - baseSize * 0.65 ),
						w: Math.max(
							10,
							Math.round( plot.x - x - baseSize * 0.5 )
						),
						h: Math.round( baseSize * 1.3 ),
						fontSize: baseSize,
						align: 'right',
						color: gray,
						weight: o.labelWeight,
					} )
				);
			}
		} );
	}

	/* ---------------------------- line / area -------------------------- */
	if ( 'line' === type || 'area' === type ) {
		const stepX = labels.length > 1 ? plot.w / ( labels.length - 1 ) : 0;
		series.forEach( ( s ) => {
			const pts = labels.map( ( _, i ) => ( {
				x: Math.round( plot.x + i * stepX ),
				y: Math.round(
					plot.y +
						plot.h -
						( ( s.values[ i ] || 0 ) / axisMax ) * plot.h
				),
			} ) );
			if ( 'area' === type ) {
				push(
					Object.assign(
						makeShape( {
							name: `Area ${ s.name || s.index + 1 }`,
							x: 0,
							y: 0,
							w: Math.round( x + w ),
							h: Math.round( y + h ),
							pathD: linePath( pts, o.smooth, {
								y: plot.y + plot.h,
							} ),
							...( o.gradient
								? barFill( seriesColor( s ) )
								: { fill: seriesColor( s ) } ),
						} ),
						{ opacity: 0.45 }
					)
				);
			}
			push(
				makeShape( {
					name: `Line ${ s.name || s.index + 1 }`,
					x: 0,
					y: 0,
					w: Math.round( x + w ),
					h: Math.round( y + h ),
					pathD: s.dash
						? dashedPath(
								pts,
								o.smooth,
								Math.max( 6, unit / 24 ),
								Math.max( 4, unit / 40 )
						  )
						: linePath( pts, o.smooth ),
					fill: 'transparent',
					stroke: seriesColor( s ),
					strokeW: Math.max( 2, Math.round( unit / 90 ) ),
				} )
			);
			if ( 'line' === type && s.markers ) {
				const r = Math.max( 3, Math.round( unit / 70 ) );
				pts.forEach( ( p, i ) =>
					push(
						makeShape( {
							name: `${ labels[ i ] } ${ s.name || '' }`.trim(),
							shape: 'ellipse',
							x: p.x - r,
							y: p.y - r,
							w: r * 2,
							h: r * 2,
							fill: seriesColor( s ),
						} )
					)
				);
			}
		} );
		if ( o.axes ) {
			labels.forEach( ( label, i ) =>
				catLabel(
					label,
					plot.x + i * stepX,
					plot.y + plot.h + baseSize * 0.5,
					stepX || plot.w
				)
			);
		}
	}

	/* ----------------------------- pie / donut ------------------------- */
	if ( 'pie' === type || 'donut' === type ) {
		const values = labels.map( ( _, i ) => series[ 0 ].values[ i ] || 0 );
		const total = values.reduce( ( a, b ) => a + b, 0 ) || 1;
		const cx = x + w / 2;
		const cy = plot.y + ( bottom - top ) / 2;
		const r = Math.min( w, bottom - top ) / 2 - baseSize;
		const inner =
			'donut' === type ? r * lerp( 0.85, 0.35, o.thickness / 100 ) : 0;
		let angle = -Math.PI / 2;
		values.forEach( ( v, i ) => {
			if ( v <= 0 ) {
				return;
			}
			const sweep = ( v / total ) * 2 * Math.PI;
			push(
				makeShape( {
					name: labels[ i ] || `Slice ${ i + 1 }`,
					x: 0,
					y: 0,
					w: Math.round( x + w ),
					h: Math.round( y + h ),
					pathD: wedgePath( cx, cy, r, angle, angle + sweep, inner ),
					fill: colorAt( i ),
				} )
			);
			if ( 'off' !== o.values && sweep > 0.25 ) {
				const mid = angle + sweep / 2;
				const lr = inner ? ( r + inner ) / 2 : r * 0.66;
				push(
					makeText( {
						name: `Value ${ labels[ i ] }`,
						text: valueText( v, total ),
						x: Math.round( cx + lr * Math.cos( mid ) - 40 ),
						y: Math.round(
							cy + lr * Math.sin( mid ) - baseSize * 0.7
						),
						w: 80,
						h: Math.round( baseSize * 1.4 ),
						fontSize: baseSize,
						align: 'center',
						color: '#ffffff',
						weight: o.valueWeight,
					} )
				);
			}
			angle += sweep;
		} );
	}

	/* ------------------------------- radar ----------------------------- */
	if ( 'radar' === type ) {
		const n = labels.length;
		const cx = x + w / 2;
		const cy = plot.y + ( bottom - top ) / 2;
		const r = Math.min( w, bottom - top ) / 2 - baseSize * 2;
		const spoke = ( i, radius ) => ( {
			x: cx + radius * Math.cos( ( i / n ) * 2 * Math.PI - Math.PI / 2 ),
			y: cy + radius * Math.sin( ( i / n ) * 2 * Math.PI - Math.PI / 2 ),
		} );
		for ( let ring = 1; ring <= 4; ring++ ) {
			const rr = ( r * ring ) / 4;
			const pts = labels.map( ( _, i ) => spoke( i, rr ) );
			push(
				makeShape( {
					name: `Grid ring ${ ring }`,
					x: 0,
					y: 0,
					w: Math.round( x + w ),
					h: Math.round( y + h ),
					pathD:
						linePath( pts, false ) +
						` L ${ pts[ 0 ].x } ${ pts[ 0 ].y } Z`,
					fill: 'transparent',
					stroke: '#dfe2e8',
					strokeW: 1,
				} )
			);
		}
		series.forEach( ( s ) => {
			const pts = labels.map( ( _, i ) =>
				spoke( i, ( ( s.values[ i ] || 0 ) / axisMax ) * r )
			);
			push(
				Object.assign(
					makeShape( {
						name: `Radar ${ s.name || s.index + 1 }`,
						x: 0,
						y: 0,
						w: Math.round( x + w ),
						h: Math.round( y + h ),
						pathD:
							linePath( pts, false ) +
							` L ${ pts[ 0 ].x } ${ pts[ 0 ].y } Z`,
						fill: seriesColor( s ),
						stroke: seriesColor( s ),
						strokeW: 2,
					} ),
					{ opacity: 0.5 }
				)
			);
		} );
		labels.forEach( ( label, i ) => {
			const p = spoke( i, r + baseSize );
			push(
				makeText( {
					name: `Label ${ label }`,
					text: label,
					x: Math.round( p.x - 60 ),
					y: Math.round( p.y - baseSize * 0.7 ),
					w: 120,
					h: Math.round( baseSize * 1.4 ),
					fontSize: baseSize,
					align: 'center',
					color: gray,
					weight: o.labelWeight,
				} )
			);
		} );
	}

	/* ------------------------------- rings ----------------------------- */
	if ( 'rings' === type ) {
		const values = labels.map( ( _, i ) => series[ 0 ].values[ i ] || 0 );
		// Values up to 100 read as percentages, otherwise relative to max.
		const base = values.every( ( v ) => v <= 100 )
			? 100
			: Math.max( ...values );
		const count = values.length;
		const cols = Math.min( count, count > 4 ? 3 : count > 2 ? 2 : count );
		const rows = Math.ceil( count / cols );
		const cellW = w / cols;
		const cellH = ( bottom - top ) / rows;
		const r = Math.min( cellW, cellH ) / 2 - baseSize * 2;
		const thick = Math.max( 3, r * lerp( 0.12, 0.5, o.thickness / 100 ) );
		values.forEach( ( v, i ) => {
			const cx = x + ( i % cols ) * cellW + cellW / 2;
			const cy =
				top + Math.floor( i / cols ) * cellH + cellH / 2 - baseSize;
			const pct = Math.min( 1, v / base );
			push(
				Object.assign(
					makeShape( {
						name: `Ring bg ${ labels[ i ] }`,
						x: 0,
						y: 0,
						w: Math.round( x + w ),
						h: Math.round( y + h ),
						pathD: wedgePath(
							cx,
							cy,
							r,
							-Math.PI / 2,
							( 3 * Math.PI ) / 2 - 1e-4,
							r - thick
						),
						fill: colorAt( i ),
					} ),
					{ opacity: 0.15 }
				)
			);
			if ( pct > 0 ) {
				push(
					makeShape( {
						name: `Ring ${ labels[ i ] }`,
						x: 0,
						y: 0,
						w: Math.round( x + w ),
						h: Math.round( y + h ),
						pathD: wedgePath(
							cx,
							cy,
							r,
							-Math.PI / 2,
							-Math.PI / 2 + pct * 2 * Math.PI - 1e-4,
							r - thick
						),
						fill: colorAt( i ),
					} )
				);
			}
			push(
				makeText( {
					name: `Ring value ${ labels[ i ] }`,
					text:
						'value' === o.values
							? fmtValue( v, o )
							: Math.round( pct * 100 ) + '%',
					x: Math.round( cx - r ),
					y: Math.round( cy - baseSize * 0.8 ),
					w: Math.round( r * 2 ),
					h: Math.round( baseSize * 1.6 ),
					fontSize: Math.round( baseSize * 1.3 ),
					align: 'center',
					color: dark,
					weight: 700,
				} )
			);
			push(
				makeText( {
					name: `Ring label ${ labels[ i ] }`,
					text: labels[ i ],
					x: Math.round( cx - cellW / 2 ),
					y: Math.round( cy + r + baseSize * 0.4 ),
					w: Math.round( cellW ),
					h: Math.round( baseSize * 1.4 ),
					fontSize: baseSize,
					align: 'center',
					color: gray,
					weight: o.labelWeight,
				} )
			);
		} );
	}

	/* ------------------------------ scatter ---------------------------- */
	if ( 'scatter' === type ) {
		const xs = series[ 0 ]?.values || [];
		const ys = ( series[ 1 ] || series[ 0 ] ).values;
		const sizes = series[ 2 ]?.values || null;
		const maxX = niceMax( Math.max( ...xs, 1e-9 ) );
		const maxY = niceMax( Math.max( ...ys, 1e-9 ) );
		if ( showGrid ) {
			for ( let g = 0; g <= 4; g++ ) {
				const gy = plot.y + plot.h - ( plot.h * g ) / 4;
				push(
					makeShape( {
						name: `Grid ${ g }`,
						shape: 'rect',
						x: plot.x,
						y: Math.round( gy ),
						w: plot.w,
						h: 1,
						fill: gridCol( g ),
					} )
				);
				if ( g > 0 && o.axes ) {
					push(
						makeText( {
							name: `Tick ${ g }`,
							text: fmtValue( ( maxY * g ) / 4, o ),
							x,
							y: Math.round( gy - baseSize * 0.55 ),
							w: Math.max(
								10,
								yGutter - Math.round( baseSize * 0.5 )
							),
							h: Math.round( baseSize * 1.2 ),
							fontSize: Math.round( baseSize * 0.85 ),
							align: 'right',
							color: gray,
							weight: 400,
						} )
					);
				}
			}
		}
		const maxSize = sizes ? Math.max( ...sizes, 1e-9 ) : 1;
		labels.forEach( ( label, i ) => {
			const px = plot.x + ( ( xs[ i ] || 0 ) / maxX ) * plot.w;
			const py = plot.y + plot.h - ( ( ys[ i ] || 0 ) / maxY ) * plot.h;
			const r = sizes
				? Math.round(
						lerp(
							unit / 90,
							unit / 16,
							( sizes[ i ] || 0 ) / maxSize
						)
				  )
				: Math.max( 4, Math.round( unit / 50 ) );
			push(
				makeShape( {
					name: label || `Point ${ i + 1 }`,
					shape: 'ellipse',
					x: Math.round( px - r ),
					y: Math.round( py - r ),
					w: r * 2,
					h: r * 2,
					fill: colorAt( i ),
				} )
			);
			push(
				makeText( {
					name: `Label ${ label }`,
					text: label,
					x: Math.round( px + r + 3 ),
					y: Math.round( py - baseSize * 0.65 ),
					w: Math.round( w * 0.3 ),
					h: Math.round( baseSize * 1.3 ),
					fontSize: Math.round( baseSize * 0.9 ),
					align: 'left',
					color: gray,
					weight: o.labelWeight,
				} )
			);
		} );
	}

	/* ----------------------------- waterfall --------------------------- */
	if ( 'waterfall' === type ) {
		const vals = labels.map( ( _, i ) => series[ 0 ].values[ i ] || 0 );
		const steps = [];
		let run = 0;
		vals.forEach( ( v ) => {
			steps.push( { from: run, to: run + v } );
			run += v;
		} );
		const hi = Math.max(
			run,
			0,
			...steps.map( ( t ) => Math.max( t.from, t.to ) )
		);
		const lo = Math.min(
			0,
			...steps.map( ( t ) => Math.min( t.from, t.to ) )
		);
		const range = niceMax( hi - lo );
		const yFor = ( v ) => plot.y + plot.h - ( ( v - lo ) / range ) * plot.h;
		const n = labels.length + 1;
		const catW = plot.w / n;
		const catGap = catW * lerp( 0.1, 0.6, o.gap / 100 );
		const barW = catW - catGap;
		const posC = colorAt( 0 );
		const negC = colors[ 1 ] || '#d63638';
		const totC = colors[ 2 ] || dark;
		push(
			makeShape( {
				name: 'Zero line',
				shape: 'rect',
				x: plot.x,
				y: Math.round( yFor( 0 ) ),
				w: plot.w,
				h: 1,
				fill: gridCol( 0 ),
			} )
		);
		steps.forEach( ( t, i ) => {
			const up = t.to >= t.from;
			const bx = plot.x + i * catW + catGap / 2;
			const y0 = yFor( Math.max( t.from, t.to ) );
			const y1 = yFor( Math.min( t.from, t.to ) );
			push(
				makeShape( {
					name: labels[ i ],
					shape: 'rect',
					x: Math.round( bx ),
					y: Math.round( y0 ),
					w: Math.round( barW ),
					h: Math.max( 2, Math.round( y1 - y0 ) ),
					...barFill( up ? posC : negC ),
					radius: Math.round( ( o.rounded / 100 ) * ( barW / 4 ) ),
				} )
			);
			push(
				makeShape( {
					name: `Connector ${ i + 1 }`,
					shape: 'rect',
					x: Math.round( bx + barW ),
					y: Math.round( yFor( t.to ) ),
					w: Math.max( 1, Math.round( catGap ) ),
					h: 1,
					fill: gridCol( 1 ),
				} )
			);
			if ( 'off' !== o.values ) {
				push(
					makeText( {
						name: `Value ${ labels[ i ] }`,
						text:
							( vals[ i ] > 0 ? '+' : '' ) +
							fmtValue( vals[ i ], o ),
						x: Math.round( bx - barW / 2 ),
						y: Math.round( y0 - baseSize * 1.3 ),
						w: Math.round( barW * 2 ),
						h: Math.round( baseSize * 1.2 ),
						fontSize: Math.round( baseSize * 0.85 ),
						align: 'center',
						color: dark,
						weight: o.valueWeight,
					} )
				);
			}
			if ( o.axes ) {
				catLabel(
					labels[ i ],
					bx + barW / 2,
					plot.y + plot.h + baseSize * 0.5,
					catW
				);
			}
		} );
		const tx = plot.x + labels.length * catW + catGap / 2;
		const tName = __( 'Total', 'wunderpaint' );
		push(
			makeShape( {
				name: 'Total',
				shape: 'rect',
				x: Math.round( tx ),
				y: Math.round( yFor( Math.max( run, 0 ) ) ),
				w: Math.round( barW ),
				h: Math.max(
					2,
					Math.round( Math.abs( yFor( 0 ) - yFor( run ) ) )
				),
				fill: totC,
				radius: Math.round( ( o.rounded / 100 ) * ( barW / 4 ) ),
			} )
		);
		if ( 'off' !== o.values ) {
			push(
				makeText( {
					name: 'Value Total',
					text: fmtValue( run, o ),
					x: Math.round( tx - barW / 2 ),
					y: Math.round(
						yFor( Math.max( run, 0 ) ) - baseSize * 1.3
					),
					w: Math.round( barW * 2 ),
					h: Math.round( baseSize * 1.2 ),
					fontSize: Math.round( baseSize * 0.85 ),
					align: 'center',
					color: dark,
					weight: o.valueWeight,
				} )
			);
		}
		if ( o.axes ) {
			catLabel(
				tName,
				tx + barW / 2,
				plot.y + plot.h + baseSize * 0.5,
				catW
			);
		}
	}

	/* ------------------------------ funnel ----------------------------- */
	if ( 'funnel' === type ) {
		const vals = labels.map( ( _, i ) => series[ 0 ].values[ i ] || 0 );
		const maxV = Math.max( ...vals, 1e-9 );
		const zone = bottom - top;
		const rowH = zone / labels.length;
		const gapY = rowH * 0.1;
		const cx = x + w / 2;
		// A segment never gets narrower than its label needs (v1.302).
		const minW = ( i ) =>
			Math.min(
				w * 0.9,
				labels[ i ].length * baseSize * 0.62 + baseSize * 1.6
			);
		const segW = ( i ) =>
			Math.max( ( ( vals[ i ] || 0 ) / maxV ) * w * 0.9, minW( i ) );
		vals.forEach( ( v, i ) => {
			const wTop = segW( i );
			const wBot = i + 1 < vals.length ? segW( i + 1 ) : wTop;
			const y0 = top + i * rowH;
			const y1 = y0 + rowH - gapY;
			push(
				makeShape( {
					name: `Segment ${ labels[ i ] }`,
					x: 0,
					y: 0,
					w: Math.round( x + w ),
					h: Math.round( y + h ),
					pathD: `M ${ cx - wTop / 2 } ${ y0 } L ${
						cx + wTop / 2
					} ${ y0 } L ${ cx + wBot / 2 } ${ y1 } L ${
						cx - wBot / 2
					} ${ y1 } Z`,
					...barFill( colorAt( i ) ),
				} )
			);
			push(
				makeText( {
					name: `Label ${ labels[ i ] }`,
					text: labels[ i ],
					x: Math.round( cx - Math.max( wTop, baseSize * 6 ) / 2 ),
					y: Math.round( ( y0 + y1 ) / 2 - baseSize * 0.7 ),
					w: Math.round( Math.max( wTop, baseSize * 6 ) ),
					h: Math.round( baseSize * 1.4 ),
					fontSize: baseSize,
					align: 'center',
					color: '#ffffff',
					weight: 600,
				} )
			);
			if ( 'off' !== o.values ) {
				push(
					makeText( {
						name: `Value ${ labels[ i ] }`,
						text:
							'percent' === o.values
								? Math.round(
										( v / ( vals[ 0 ] || 1 ) ) * 100
								  ) + '%'
								: fmtValue( v, o ),
						x: Math.round( x + w - w * 0.18 ),
						y: Math.round( ( y0 + y1 ) / 2 - baseSize * 0.7 ),
						w: Math.round( w * 0.18 ),
						h: Math.round( baseSize * 1.4 ),
						fontSize: baseSize,
						align: 'right',
						color: gray,
						weight: o.valueWeight,
					} )
				);
			}
		} );
	}

	/* ------------------------------- gauge ----------------------------- */
	if ( 'gauge' === type ) {
		const v = series[ 0 ].values[ 0 ] || 0;
		const maxV = v <= 100 ? 100 : niceMax( v );
		const pct = Math.min( 1, v / maxV );
		const cx = x + w / 2;
		const zone = bottom - top;
		const r = Math.min( w * 0.42, zone * 0.72 );
		const cy = top + zone * 0.62 + r * 0.2;
		const thick = Math.max( 6, r * lerp( 0.12, 0.5, o.thickness / 100 ) );
		push(
			Object.assign(
				makeShape( {
					name: 'Gauge bg',
					x: 0,
					y: 0,
					w: Math.round( x + w ),
					h: Math.round( y + h ),
					pathD: wedgePath(
						cx,
						cy,
						r,
						Math.PI,
						2 * Math.PI - 1e-4,
						r - thick
					),
					fill: colorAt( 0 ),
				} ),
				{ opacity: 0.15 }
			)
		);
		if ( pct > 0 ) {
			push(
				makeShape( {
					name: `Gauge ${ labels[ 0 ] }`,
					x: 0,
					y: 0,
					w: Math.round( x + w ),
					h: Math.round( y + h ),
					pathD: wedgePath(
						cx,
						cy,
						r,
						Math.PI,
						Math.PI + pct * Math.PI - 1e-4,
						r - thick
					),
					fill: colorAt( 0 ),
				} )
			);
		}
		push(
			makeText( {
				name: 'Gauge value',
				text:
					'value' === o.values
						? fmtValue( v, o )
						: Math.round( pct * 100 ) + '%',
				x: Math.round( cx - r ),
				y: Math.round( cy - baseSize * 2.6 ),
				w: Math.round( r * 2 ),
				h: Math.round( baseSize * 2.6 ),
				fontSize: Math.round( baseSize * 2.2 ),
				align: 'center',
				color: dark,
				weight: 800,
			} )
		);
		push(
			makeText( {
				name: `Gauge label ${ labels[ 0 ] }`,
				text: labels[ 0 ],
				x: Math.round( cx - r ),
				y: Math.round( cy + baseSize * 0.4 ),
				w: Math.round( r * 2 ),
				h: Math.round( baseSize * 1.4 ),
				fontSize: baseSize,
				align: 'center',
				color: gray,
				weight: o.labelWeight,
			} )
		);
		if ( o.axes ) {
			push(
				makeText( {
					name: 'Gauge min',
					text: fmtValue( 0, o ),
					x: Math.round( cx - r ),
					y: Math.round( cy + baseSize * 0.3 ),
					w: Math.round( thick * 2 ),
					h: Math.round( baseSize * 1.2 ),
					fontSize: Math.round( baseSize * 0.85 ),
					align: 'center',
					color: gray,
					weight: 400,
				} )
			);
			push(
				makeText( {
					name: 'Gauge max',
					text: fmtValue( maxV, o ),
					x: Math.round( cx + r - thick * 2 ),
					y: Math.round( cy + baseSize * 0.3 ),
					w: Math.round( thick * 2 ),
					h: Math.round( baseSize * 1.2 ),
					fontSize: Math.round( baseSize * 0.85 ),
					align: 'center',
					color: gray,
					weight: 400,
				} )
			);
		}
	}

	/* -------------------------------- kpi ------------------------------ */
	if ( 'kpi' === type ) {
		const vals = labels.map( ( _, i ) => series[ 0 ].values[ i ] || 0 );
		const last = vals[ vals.length - 1 ];
		const prev = vals.length > 1 ? vals[ vals.length - 2 ] : null;
		const zone = bottom - top;
		push(
			makeText( {
				name: 'KPI value',
				text: fmtValue( last, o ),
				x,
				y: Math.round( top + zone * 0.08 ),
				w,
				h: Math.round( zone * 0.34 ),
				fontSize: Math.round( Math.min( w * 0.18, zone * 0.3 ) ),
				align: 'center',
				color: dark,
				weight: 800,
				fixedWidth: true,
			} )
		);
		push(
			makeText( {
				name: 'KPI label',
				text: series[ 0 ].name || labels[ labels.length - 1 ],
				x,
				y: Math.round( top + zone * 0.44 ),
				w,
				h: Math.round( baseSize * 1.5 ),
				fontSize: Math.round( baseSize * 1.1 ),
				align: 'center',
				color: gray,
				weight: o.labelWeight,
			} )
		);
		if ( null !== prev && 0 !== prev ) {
			const d = ( ( last - prev ) / Math.abs( prev ) ) * 100;
			push(
				makeText( {
					name: 'Delta',
					text:
						( d >= 0 ? '▲ ' : '▼ ' ) +
						Math.abs( Math.round( d * 10 ) / 10 ) +
						'%',
					x,
					y: Math.round( top + zone * 0.55 ),
					w,
					h: Math.round( baseSize * 1.6 ),
					fontSize: Math.round( baseSize * 1.15 ),
					align: 'center',
					color: d >= 0 ? '#00a32a' : '#d63638',
					weight: 700,
				} )
			);
		}
		if ( vals.length > 1 ) {
			const sTop = top + zone * 0.72;
			const sH = zone * 0.24;
			const maxV = Math.max( ...vals, 1e-9 );
			const stepX = w / ( vals.length - 1 );
			const pts = vals.map( ( vv, i ) => ( {
				x: Math.round( x + i * stepX ),
				y: Math.round( sTop + sH - ( vv / maxV ) * sH ),
			} ) );
			push(
				Object.assign(
					makeShape( {
						name: 'Sparkline fill',
						x: 0,
						y: 0,
						w: Math.round( x + w ),
						h: Math.round( y + h ),
						pathD: linePath( pts, o.smooth, { y: sTop + sH } ),
						fill: colorAt( 0 ),
					} ),
					{ opacity: 0.15 }
				)
			);
			push(
				makeShape( {
					name: 'Sparkline',
					x: 0,
					y: 0,
					w: Math.round( x + w ),
					h: Math.round( y + h ),
					pathD: linePath( pts, o.smooth ),
					fill: 'transparent',
					stroke: colorAt( 0 ),
					strokeW: Math.max( 2, Math.round( unit / 110 ) ),
				} )
			);
		}
	}

	/* ------------------------------- combo ----------------------------- */
	if ( 'combo' === type ) {
		const asOf = ( s, i ) =>
			sOpts[ s.index ]?.as ||
			( i === series.length - 1 && series.length > 1 ? 'line' : 'bar' );
		const barsSer = series.filter( ( s, i ) => 'line' !== asOf( s, i ) );
		const lineSer = series.filter( ( s, i ) => 'line' === asOf( s, i ) );
		const catW = plot.w / labels.length;
		const catGap = catW * lerp( 0.1, 0.6, o.gap / 100 );
		const innerW = catW - catGap;
		const perBar = innerW / Math.max( 1, barsSer.length );
		labels.forEach( ( label, i ) => {
			const cx0 = plot.x + i * catW + catGap / 2;
			barsSer.forEach( ( s, si ) => {
				const v = s.values[ i ] || 0;
				const bh = Math.max( 1, ( v / axisMax ) * plot.h );
				push(
					makeShape( {
						name: `${ label } / ${ s.name || s.index + 1 }`,
						shape: 'rect',
						x: Math.round( cx0 + si * perBar ),
						y: Math.round( plot.y + plot.h - bh ),
						w: Math.max( 1, Math.round( perBar - 2 ) ),
						h: Math.round( bh ),
						...barFill( seriesColor( s ) ),
						radius: Math.round(
							( o.rounded / 100 ) * ( perBar / 3 )
						),
					} )
				);
			} );
			if ( o.axes ) {
				catLabel(
					label,
					cx0 + innerW / 2,
					plot.y + plot.h + baseSize * 0.5,
					catW
				);
			}
		} );
		lineSer.forEach( ( s ) => {
			const pts = labels.map( ( _, i ) => ( {
				x: Math.round( plot.x + i * catW + catGap / 2 + innerW / 2 ),
				y: Math.round(
					plot.y +
						plot.h -
						( ( s.values[ i ] || 0 ) / axisMax ) * plot.h
				),
			} ) );
			push(
				makeShape( {
					name: `Line ${ s.name || s.index + 1 }`,
					x: 0,
					y: 0,
					w: Math.round( x + w ),
					h: Math.round( y + h ),
					pathD: s.dash
						? dashedPath(
								pts,
								o.smooth,
								Math.max( 6, unit / 24 ),
								Math.max( 4, unit / 40 )
						  )
						: linePath( pts, o.smooth ),
					fill: 'transparent',
					stroke: seriesColor( s ),
					strokeW: Math.max( 2, Math.round( unit / 90 ) ),
				} )
			);
			if ( s.markers ) {
				const r = Math.max( 3, Math.round( unit / 70 ) );
				pts.forEach( ( p, i ) =>
					push(
						makeShape( {
							name: `${ labels[ i ] } ${ s.name || '' }`.trim(),
							shape: 'ellipse',
							x: p.x - r,
							y: p.y - r,
							w: r * 2,
							h: r * 2,
							fill: seriesColor( s ),
						} )
					)
				);
			}
		} );
	}

	/* ----------------------- horizontal row helpers -------------------- */
	const rowGutter = () =>
		Math.round(
			Math.min(
				w * 0.3,
				Math.max( ...labels.map( ( l ) => l.length ), 1 ) *
					baseSize *
					0.6
			)
		);
	const rowLabel = ( label, cy ) =>
		push(
			makeText( {
				name: `Label ${ label }`,
				text: label,
				x,
				y: Math.round( cy - baseSize * 0.65 ),
				w: Math.max( 10, rowGutter() - Math.round( baseSize * 0.5 ) ),
				h: Math.round( baseSize * 1.3 ),
				fontSize: baseSize,
				align: 'right',
				color: gray,
				weight: o.labelWeight,
			} )
		);
	const rowValue = ( label, v, px, cy ) =>
		'off' !== o.values &&
		push(
			makeText( {
				name: `Value ${ label }`,
				text: fmtValue( v, o ),
				x: Math.round( px + baseSize * 0.4 ),
				y: Math.round( cy - baseSize * 0.65 ),
				w: Math.round( w * 0.2 ),
				h: Math.round( baseSize * 1.2 ),
				fontSize: Math.round( baseSize * 0.85 ),
				align: 'left',
				color: dark,
				weight: o.valueWeight,
			} )
		);

	/* ------------------------------ lollipop --------------------------- */
	if ( 'lollipop' === type ) {
		const vals = labels.map( ( _, i ) => series[ 0 ].values[ i ] || 0 );
		const maxV = niceMax( Math.max( ...vals, 1e-9 ) );
		const rowH = ( bottom - top ) / labels.length;
		const px0 = x + rowGutter();
		const pw = w - rowGutter() - baseSize * 3;
		labels.forEach( ( label, i ) => {
			const cy = top + i * rowH + rowH / 2;
			const len = ( vals[ i ] / maxV ) * pw;
			push(
				makeShape( {
					name: `Stem ${ label }`,
					shape: 'rect',
					x: Math.round( px0 ),
					y: Math.round( cy - 1.5 ),
					w: Math.max( 1, Math.round( len ) ),
					h: 3,
					fill: mixHex( colorAt( i ), gray, 0.35 ),
				} )
			);
			const r = Math.max( 5, Math.round( unit / 40 ) );
			push(
				makeShape( {
					name: `Head ${ label }`,
					shape: 'ellipse',
					x: Math.round( px0 + len - r ),
					y: Math.round( cy - r ),
					w: r * 2,
					h: r * 2,
					fill: colorAt( i ),
				} )
			);
			if ( o.axes ) {
				rowLabel( label, cy );
			}
			rowValue( label, vals[ i ], px0 + len + baseSize * 0.6, cy );
		} );
	}

	/* ------------------------------ heatmap ---------------------------- */
	if ( 'heatmap' === type ) {
		const maxV = Math.max( 1e-9, ...series.flatMap( ( s ) => s.values ) );
		const gutter = rowGutter();
		const hx = x + gutter;
		const hw = w - gutter;
		const headH = baseSize * 1.6;
		const hy = top + headH;
		const hh = bottom - top - headH;
		const cw = hw / series.length;
		const ch = hh / labels.length;
		const base = onDarkCard ? '#20242b' : '#ffffff';
		series.forEach( ( s, ci ) =>
			push(
				makeText( {
					name: `Col ${ s.name || ci + 1 }`,
					text: s.name || String( ci + 1 ),
					x: Math.round( hx + ci * cw ),
					y: Math.round( top ),
					w: Math.round( cw ),
					h: Math.round( baseSize * 1.3 ),
					fontSize: Math.round( baseSize * 0.9 ),
					align: 'center',
					color: gray,
					weight: o.labelWeight,
				} )
			)
		);
		labels.forEach( ( label, ri ) => {
			rowLabel( label, hy + ri * ch + ch / 2 );
			series.forEach( ( s, ci ) => {
				const v = s.values[ ri ] || 0;
				const fill = mixHex(
					base,
					colorAt( 0 ),
					0.12 + 0.88 * ( v / maxV )
				);
				push(
					makeShape( {
						name: `Cell ${ label }-${ s.name || ci + 1 }`,
						shape: 'rect',
						x: Math.round( hx + ci * cw + 1 ),
						y: Math.round( hy + ri * ch + 1 ),
						w: Math.max( 1, Math.round( cw - 2 ) ),
						h: Math.max( 1, Math.round( ch - 2 ) ),
						fill,
						radius: 2,
					} )
				);
				if ( 'off' !== o.values ) {
					push(
						makeText( {
							name: `Value ${ label }-${ s.name || ci + 1 }`,
							text: fmtValue( v, o ),
							x: Math.round( hx + ci * cw ),
							y: Math.round(
								hy + ri * ch + ch / 2 - baseSize * 0.6
							),
							w: Math.round( cw ),
							h: Math.round( baseSize * 1.2 ),
							fontSize: Math.round( baseSize * 0.85 ),
							align: 'center',
							color: onColor( fill ),
							weight: o.valueWeight,
						} )
					);
				}
			} );
		} );
	}

	/* ------------------------------- bullet ---------------------------- */
	if ( 'bullet' === type ) {
		const actual = series[ 0 ]?.values || [];
		const target = ( series[ 1 ] || series[ 0 ] ).values;
		const maxes = series[ 2 ]?.values || null;
		const rowH = ( bottom - top ) / labels.length;
		const px0 = x + rowGutter();
		const pw = w - rowGutter() - baseSize * 3;
		labels.forEach( ( label, i ) => {
			const mx =
				( maxes && maxes[ i ] ) ||
				niceMax( Math.max( actual[ i ] || 0, target[ i ] || 0, 1e-9 ) );
			const cy = top + i * rowH + rowH / 2;
			const bandH = Math.min( rowH * 0.6, baseSize * 1.7 );
			push(
				makeShape( {
					name: `Band ${ label }`,
					shape: 'rect',
					x: Math.round( px0 ),
					y: Math.round( cy - bandH / 2 ),
					w: Math.round( pw ),
					h: Math.round( bandH ),
					fill: mixHex(
						onDarkCard ? '#20242b' : '#ffffff',
						gray,
						0.25
					),
					radius: 3,
				} )
			);
			push(
				makeShape( {
					name: `Measure ${ label }`,
					shape: 'rect',
					x: Math.round( px0 ),
					y: Math.round( cy - bandH * 0.22 ),
					w: Math.max(
						1,
						Math.round( ( ( actual[ i ] || 0 ) / mx ) * pw )
					),
					h: Math.round( bandH * 0.44 ),
					fill: colorAt( 0 ),
					radius: 2,
				} )
			);
			push(
				makeShape( {
					name: `Target ${ label }`,
					shape: 'rect',
					x: Math.round(
						px0 + ( ( target[ i ] || 0 ) / mx ) * pw - 1.5
					),
					y: Math.round( cy - bandH * 0.62 ),
					w: 3,
					h: Math.round( bandH * 1.24 ),
					fill: dark,
				} )
			);
			if ( o.axes ) {
				rowLabel( label, cy );
			}
			rowValue( label, actual[ i ] || 0, px0 + pw, cy );
		} );
	}

	/* ----------------------------- histogram --------------------------- */
	if ( 'histogram' === type ) {
		const vals = series[ 0 ].values;
		const binMax = niceMax( Math.max( ...vals, 1e-9 ) );
		const bins = 8;
		const step = binMax / bins;
		const counts = Array( bins ).fill( 0 );
		vals.forEach( ( v ) => {
			counts[ Math.min( bins - 1, Math.floor( v / step ) ) ]++;
		} );
		const maxC = Math.max( ...counts, 1 );
		const bw = plot.w / bins;
		counts.forEach( ( c, i ) => {
			const bh = ( c / maxC ) * plot.h;
			push(
				makeShape( {
					name: `Bin ${ fmtValue( i * step, o ) }-${ fmtValue(
						( i + 1 ) * step,
						o
					) }`,
					shape: 'rect',
					x: Math.round( plot.x + i * bw + 1 ),
					y: Math.round( plot.y + plot.h - bh ),
					w: Math.max( 1, Math.round( bw - 2 ) ),
					h: Math.max( 1, Math.round( bh ) ),
					...barFill( colorAt( 0 ) ),
					radius: Math.round( ( o.rounded / 100 ) * ( bw / 6 ) ),
				} )
			);
			if ( o.axes ) {
				catLabel(
					fmtValue( i * step, o ),
					plot.x + i * bw,
					plot.y + plot.h + baseSize * 0.5,
					bw
				);
			}
			if ( 'off' !== o.values && c > 0 ) {
				push(
					makeText( {
						name: `Value bin ${ i + 1 }`,
						text: String( c ),
						x: Math.round( plot.x + i * bw ),
						y: Math.round( plot.y + plot.h - bh - baseSize * 1.3 ),
						w: Math.round( bw ),
						h: Math.round( baseSize * 1.2 ),
						fontSize: Math.round( baseSize * 0.85 ),
						align: 'center',
						color: dark,
						weight: o.valueWeight,
					} )
				);
			}
		} );
	}

	/* ----------------------------- pictogram --------------------------- */
	if ( 'pictogram' === type ) {
		const vals = labels.map( ( _, i ) => series[ 0 ].values[ i ] || 0 );
		const unitVal = niceMax( Math.max( ...vals, 1e-9 ) ) / 10;
		const rowH = ( bottom - top ) / labels.length;
		const px0 = x + rowGutter();
		labels.forEach( ( label, i ) => {
			const cy = top + i * rowH + rowH / 2;
			const r = Math.max( 3, Math.min( rowH * 0.28, baseSize * 0.8 ) );
			const n = vals[ i ] / unitVal;
			const full = Math.floor( n + 1e-9 );
			const part = n - full;
			for ( let k = 0; k < full; k++ ) {
				push(
					makeShape( {
						name: `Dot ${ label } ${ k + 1 }`,
						shape: 'ellipse',
						x: Math.round( px0 + k * r * 2.4 ),
						y: Math.round( cy - r ),
						w: Math.round( r * 2 ),
						h: Math.round( r * 2 ),
						fill: colorAt( i ),
					} )
				);
			}
			if ( part > 0.05 ) {
				const cx = px0 + full * r * 2.4 + r;
				push(
					makeShape( {
						name: `Dot ${ label } part`,
						x: 0,
						y: 0,
						w: Math.round( x + w ),
						h: Math.round( y + h ),
						pathD: wedgePath(
							cx,
							cy,
							r,
							-Math.PI / 2,
							-Math.PI / 2 + part * 2 * Math.PI - 1e-4
						),
						fill: colorAt( i ),
					} )
				);
			}
			if ( o.axes ) {
				rowLabel( label, cy );
			}
			rowValue( label, vals[ i ], px0 + ( full + 1 ) * r * 2.4, cy );
		} );
	}

	/* ------------------------------ dumbbell --------------------------- */
	if ( 'dumbbell' === type ) {
		const from = series[ 0 ]?.values || [];
		const to = ( series[ 1 ] || series[ 0 ] ).values;
		// Scale over the data range (v1.302): from-zero scales pushed
		// similar values onto the same pixel.
		const loV = Math.min( ...from, ...to );
		const hiV = Math.max( ...from, ...to, loV + 1e-9 );
		const padV = Math.max( ( hiV - loV ) * 0.18, hiV * 0.04 );
		const v0 = Math.max( 0, loV - padV );
		const v1 = hiV + padV;
		const rowH = ( bottom - top ) / labels.length;
		const px0 = x + rowGutter();
		const pw = w - rowGutter() - baseSize * 3;
		const r = Math.max( 4, Math.round( unit / 50 ) );
		labels.forEach( ( label, i ) => {
			const cy = top + i * rowH + rowH / 2;
			const x1 = px0 + ( ( ( from[ i ] || 0 ) - v0 ) / ( v1 - v0 ) ) * pw;
			const x2 = px0 + ( ( ( to[ i ] || 0 ) - v0 ) / ( v1 - v0 ) ) * pw;
			push(
				makeShape( {
					name: `Span ${ label }`,
					shape: 'rect',
					x: Math.round( Math.min( x1, x2 ) ),
					y: Math.round( cy - 1.5 ),
					w: Math.max( 1, Math.round( Math.abs( x2 - x1 ) ) ),
					h: 3,
					fill: mixHex( gray, dark, 0.2 ),
				} )
			);
			push(
				makeShape( {
					name: `From ${ label }`,
					shape: 'ellipse',
					x: Math.round( x1 - r ),
					y: Math.round( cy - r ),
					w: r * 2,
					h: r * 2,
					fill: seriesColor( series[ 0 ] ),
				} )
			);
			push(
				makeShape( {
					name: `To ${ label }`,
					shape: 'ellipse',
					x: Math.round( x2 - r ),
					y: Math.round( cy - r ),
					w: r * 2,
					h: r * 2,
					fill: seriesColor( series[ 1 ] || series[ 0 ] ),
				} )
			);
			if ( o.axes ) {
				rowLabel( label, cy );
			}
			rowValue( label, to[ i ] || 0, Math.max( x1, x2 ) + r, cy );
		} );
	}

	/* ------------------------------- slope ----------------------------- */
	if ( 'slope' === type ) {
		const leftV = series[ 0 ]?.values || [];
		const rightV = ( series[ 1 ] || series[ 0 ] ).values;
		// Range-based scale (v1.302): similar values kept collapsing onto
		// one line on the from-zero axis.
		const loV = Math.min( ...leftV, ...rightV );
		const hiV = Math.max( ...leftV, ...rightV, loV + 1e-9 );
		const padV = Math.max( ( hiV - loV ) * 0.16, hiV * 0.04 );
		const v0 = Math.max( 0, loV - padV );
		const v1 = hiV + padV;
		const lx = x + w * 0.24;
		const rx = x + w * 0.76;
		const py = ( v ) =>
			top +
			baseSize +
			( 1 - ( v - v0 ) / ( v1 - v0 ) ) * ( bottom - top - baseSize * 3 );
		for ( const [ name2, ax ] of [
			[ 'Axis left', lx ],
			[ 'Axis right', rx ],
		] ) {
			push(
				makeShape( {
					name: name2,
					shape: 'rect',
					x: Math.round( ax ),
					y: Math.round( top + baseSize ),
					w: 1,
					h: Math.round( bottom - top - baseSize * 3 ),
					fill: gridCol( 1 ),
				} )
			);
		}
		labels.forEach( ( label, i ) => {
			const y1 = py( leftV[ i ] || 0 );
			const y2 = py( rightV[ i ] || 0 );
			push(
				makeShape( {
					name: `Slope ${ label }`,
					x: 0,
					y: 0,
					w: Math.round( x + w ),
					h: Math.round( y + h ),
					pathD: `M ${ lx } ${ y1 } L ${ rx } ${ y2 }`,
					fill: 'transparent',
					stroke: colorAt( i ),
					strokeW: Math.max( 2, Math.round( unit / 100 ) ),
				} )
			);
			push(
				makeText( {
					name: `Label ${ label }`,
					text: label,
					x: Math.round( x ),
					y: Math.round( y1 - baseSize * 0.6 ),
					w: Math.max( 10, Math.round( lx - x - baseSize * 0.5 ) ),
					h: Math.round( baseSize * 1.2 ),
					fontSize: Math.round( baseSize * 0.9 ),
					align: 'right',
					color: gray,
					weight: o.labelWeight,
				} )
			);
			if ( 'off' !== o.values ) {
				push(
					makeText( {
						name: `Value ${ label }`,
						text: fmtValue( rightV[ i ] || 0, o ),
						x: Math.round( rx + baseSize * 0.5 ),
						y: Math.round( y2 - baseSize * 0.6 ),
						w: Math.round( w * 0.2 ),
						h: Math.round( baseSize * 1.2 ),
						fontSize: Math.round( baseSize * 0.9 ),
						align: 'left',
						color: dark,
						weight: o.valueWeight,
					} )
				);
			}
		} );
		if ( o.axes && series.length > 1 ) {
			for ( const [ s, ax, align ] of [
				[ series[ 0 ], lx, 'right' ],
				[ series[ 1 ], rx, 'left' ],
			] ) {
				push(
					makeText( {
						name: `Axis label ${ s.name || '' }`.trim(),
						text: s.name || '',
						x: Math.round( 'right' === align ? ax - w * 0.2 : ax ),
						y: Math.round( bottom - baseSize * 1.6 ),
						w: Math.round( w * 0.2 ),
						h: Math.round( baseSize * 1.3 ),
						fontSize: baseSize,
						align,
						color: gray,
						weight: o.labelWeight,
					} )
				);
			}
		}
	}

	/* -------------------------------- bump ----------------------------- */
	if ( 'bump' === type ) {
		const rounds = series.length;
		const maxRank = Math.max(
			...series.flatMap( ( s ) => s.values ),
			labels.length,
			2
		);
		const labelSpace = Math.round( w * 0.16 );
		const stepX = ( plot.w - labelSpace ) / Math.max( 1, rounds - 1 );
		labels.forEach( ( label, ri ) => {
			const pts = series.map( ( s, ci ) => ( {
				x: Math.round( plot.x + ci * stepX ),
				y: Math.round(
					plot.y +
						( ( ( s.values[ ri ] || maxRank ) - 1 ) /
							( maxRank - 1 ) ) *
							plot.h
				),
			} ) );
			push(
				makeShape( {
					name: `Bump ${ label }`,
					x: 0,
					y: 0,
					w: Math.round( x + w ),
					h: Math.round( y + h ),
					pathD: linePath( pts, o.smooth ),
					fill: 'transparent',
					stroke: colorAt( ri ),
					strokeW: Math.max( 2, Math.round( unit / 90 ) ),
				} )
			);
			const r = Math.max( 3, Math.round( unit / 80 ) );
			pts.forEach( ( p, ci ) =>
				push(
					makeShape( {
						name: `Point ${ label } ${ ci + 1 }`,
						shape: 'ellipse',
						x: p.x - r,
						y: p.y - r,
						w: r * 2,
						h: r * 2,
						fill: colorAt( ri ),
					} )
				)
			);
			push(
				makeText( {
					name: `Label ${ label }`,
					text: label,
					x: Math.round( pts[ pts.length - 1 ].x + r + 3 ),
					y: Math.round( pts[ pts.length - 1 ].y - baseSize * 0.6 ),
					w: Math.round( w * 0.25 ),
					h: Math.round( baseSize * 1.2 ),
					fontSize: Math.round( baseSize * 0.9 ),
					align: 'left',
					color: gray,
					weight: o.labelWeight,
				} )
			);
		} );
		if ( o.axes ) {
			series.forEach( ( s, ci ) =>
				catLabel(
					s.name || String( ci + 1 ),
					plot.x + ci * stepX,
					plot.y + plot.h + baseSize * 0.5,
					stepX || plot.w
				)
			);
		}
	}

	/* ------------------------------ treemap ---------------------------- */
	if ( 'treemap' === type ) {
		const items = labels
			.map( ( l, i ) => ( {
				label: l,
				v: series[ 0 ].values[ i ] || 0,
				i,
			} ) )
			.filter( ( t ) => t.v > 0 )
			.sort( ( a, b ) => b.v - a.v );
		const tiles = [];
		const layout = ( list, rx, ry, rw, rh, horiz ) => {
			if ( ! list.length || rw <= 0 || rh <= 0 ) {
				return;
			}
			if ( 1 === list.length ) {
				tiles.push( { ...list[ 0 ], x: rx, y: ry, w: rw, h: rh } );
				return;
			}
			const sum = list.reduce( ( a, b ) => a + b.v, 0 ) || 1;
			const f = list[ 0 ].v / sum;
			if ( horiz ) {
				const wA = rw * f;
				tiles.push( { ...list[ 0 ], x: rx, y: ry, w: wA, h: rh } );
				layout( list.slice( 1 ), rx + wA, ry, rw - wA, rh, ! horiz );
			} else {
				const hA = rh * f;
				tiles.push( { ...list[ 0 ], x: rx, y: ry, w: rw, h: hA } );
				layout( list.slice( 1 ), rx, ry + hA, rw, rh - hA, ! horiz );
			}
		};
		layout( items, x, top, w, bottom - top, true );
		for ( const t of tiles ) {
			const fill = colorAt( t.i );
			push(
				makeShape( {
					name: `Tile ${ t.label }`,
					shape: 'rect',
					x: Math.round( t.x + 1 ),
					y: Math.round( t.y + 1 ),
					w: Math.max( 1, Math.round( t.w - 2 ) ),
					h: Math.max( 1, Math.round( t.h - 2 ) ),
					fill,
					radius: Math.round( ( o.rounded / 100 ) * 10 ),
				} )
			);
			if ( t.w > baseSize * 4 && t.h > baseSize * 2.6 ) {
				push(
					makeText( {
						name: `Tile label ${ t.label }`,
						text: t.label,
						x: Math.round( t.x + baseSize * 0.5 ),
						y: Math.round( t.y + baseSize * 0.4 ),
						w: Math.round( t.w - baseSize ),
						h: Math.round( baseSize * 1.3 ),
						fontSize: baseSize,
						align: 'left',
						color: onColor( fill ),
						weight: 600,
					} )
				);
				if ( 'off' !== o.values ) {
					push(
						makeText( {
							name: `Tile value ${ t.label }`,
							text: fmtValue( t.v, o ),
							x: Math.round( t.x + baseSize * 0.5 ),
							y: Math.round( t.y + baseSize * 1.8 ),
							w: Math.round( t.w - baseSize ),
							h: Math.round( baseSize * 1.2 ),
							fontSize: Math.round( baseSize * 0.85 ),
							align: 'left',
							color: onColor( fill ),
							weight: 400,
						} )
					);
				}
			}
		}
	}

	// One post-pass instead of threading the family through every
	// makeText: charts carry a single typeface (v1.269.2).
	if ( o.fontFamily ) {
		for ( const l of layers ) {
			if ( 'text' === l.type ) {
				l.fontFamily = o.fontFamily;
			}
		}
	}

	group.children = layers.map( ( l ) => l.id );
	return { group, layers };
}
