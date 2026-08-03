/**
 * Dynamic chart refresh (v1.271.0): tables/charts carrying a saved
 * WordPress source or {{binding}} tokens rebuild themselves inside the
 * dynamic pipeline - the same two-phase pattern as generator layers.
 * `prepareChartLayers` (async) fetches fresh rows and memoises a full
 * rebuild per group+context; a registered resolve pass swaps the
 * group's children at paint time (N:M, children counts may change).
 * Fetch errors keep the stale group - stale beats empty.
 */

import { buildChart } from './chart';
import { buildTable, TABLE_TYPES } from './table';
import {
	chartDataFromGrid,
	gridFromPostsTable,
	normalizeGrid,
	numberSeps,
} from './grid-model';
import {
	expandTokens,
	hasTokens,
	registerResolvePass,
} from './dynamic-content';
import { request } from './api';

/** Serialise a saved source into the /posts/table query (UI + refresh). */
export function buildTableQuery( source ) {
	const p = new URLSearchParams();
	p.set( 'type', source.postType || 'post' );
	if ( source.cat ) {
		p.set( 'cat', String( source.cat ) );
	}
	if ( source.search ) {
		p.set( 'search', source.search );
	}
	// Extended filters (v1.271); only set when present.
	if ( source.dateAfter ) {
		p.set( 'date_after', source.dateAfter );
	}
	if ( source.dateBefore ) {
		p.set( 'date_before', source.dateBefore );
	}
	if ( source.author ) {
		p.set( 'author', String( source.author ) );
	}
	if ( source.tax && source.term ) {
		p.set( 'tax', source.tax );
		p.set( 'term', String( source.term ) );
	}
	if ( source.metaKey ) {
		p.set( 'meta_key', source.metaKey );
		if ( undefined !== source.metaValue && '' !== source.metaValue ) {
			p.set( 'meta_value', String( source.metaValue ) );
			p.set( 'meta_compare', source.metaCompare || '=' );
		}
	}
	if ( source.offset ) {
		p.set( 'offset', String( source.offset ) );
	}
	p.set( 'orderby', source.orderby || 'date' );
	p.set( 'order', source.order || 'desc' );
	p.set( 'count', String( source.count || 10 ) );
	p.set( 'fields', ( source.fields || [] ).join( ',' ) );
	return '/posts/table?' + p.toString();
}

const gridHasTokens = ( grid ) => {
	if ( ! grid ) {
		return false;
	}
	return (
		( grid.headers || [] ).some( ( hd ) => hasTokens( hd ) ) ||
		( grid.rows || [] ).some( ( row ) =>
			( row || [] ).some( ( c ) => hasTokens( c ) )
		)
	);
};

/** A chart group the dynamic pipeline should rebuild. */
export function chartNeedsRefresh( layer ) {
	const chart = layer?.chart;
	if ( ! chart ) {
		return false;
	}
	return !! (
		chart.source ||
		gridHasTokens( chart.grid ) ||
		hasTokens( chart.options?.title ) ||
		hasTokens( chart.options?.subtitle )
	);
}

// group.id → { ctx, group, children } (paint-time swap material).
const chartMemo = new Map();

const expandGrid = ( grid, ctx ) => {
	const g = normalizeGrid( grid );
	return {
		headers: g.headers.map( ( hd ) => expandTokens( hd, ctx ) ),
		rows: g.rows.map( ( row ) =>
			row.map( ( c ) => ( hasTokens( c ) ? expandTokens( c, ctx ) : c ) )
		),
		cols: g.cols,
	};
};

/**
 * Async prepare pass: fetch sourced rows, expand tokens and memoise a
 * rebuilt layer group per context. Runs inside prepareGeneratorLayers,
 * so export, batch and preview-with-post all share it.
 *
 * @param {Array}    layers          Flat layer list (top-level groups).
 * @param {Object}   ctx             Post/site context.
 * @param {Object}   opts            Options.
 * @param {Function} opts.fetchTable Injectable source fetcher (tests).
 * @return {Promise<{refreshed: number, failed: number}>} Stats.
 */
export async function prepareChartLayers( layers, ctx, opts = {} ) {
	const out = { refreshed: 0, failed: 0 };
	if ( ! ctx || ! Array.isArray( layers ) ) {
		return out;
	}
	const fetchTable =
		opts.fetchTable ||
		( ( source ) =>
			request( { path: buildTableQuery( source ), method: 'GET' } ) );
	const groups = layers.filter(
		( l ) => chartNeedsRefresh( l ) && chartMemo.get( l.id )?.ctx !== ctx
	);
	for ( const group of groups ) {
		try {
			const chart = group.chart;
			let grid = normalizeGrid( chart.grid );
			if ( chart.source ) {
				const res = await fetchTable( chart.source );
				const rows = res?.rows || [];
				if ( ! rows.length ) {
					throw new Error( 'empty result' );
				}
				const fresh = gridFromPostsTable(
					res.fields || [],
					// Keep the user's (possibly renamed) headers when the
					// column count still matches.
					grid.headers.length === ( res.fields || [] ).length
						? grid.headers
						: [],
					rows
				);
				grid = { ...fresh, cols: grid.cols };
			}
			grid = expandGrid( grid, ctx );
			const seps = numberSeps();
			const options = {
				...( chart.options || {} ),
				title: expandTokens( chart.options?.title || '', ctx ),
				subtitle: expandTokens( chart.options?.subtitle || '', ctx ),
				groupSep: seps.group,
				decSep: seps.dec,
			};
			// Rebuild inside the group's current bounding box, exactly
			// like Edit in the dialog does.
			const kids = layers.filter( ( l ) => l.parent === group.id );
			if ( ! kids.length ) {
				continue;
			}
			const minX = Math.min( ...kids.map( ( l ) => l.x ) );
			const minY = Math.min( ...kids.map( ( l ) => l.y ) );
			const maxX = Math.max( ...kids.map( ( l ) => l.x + l.w ) );
			const maxY = Math.max( ...kids.map( ( l ) => l.y + l.h ) );
			const rect = {
				x: minX,
				y: minY,
				w: Math.max( 40, maxX - minX ),
				h: Math.max( 40, maxY - minY ),
			};
			const type = chart.type || 'bar';
			const built = TABLE_TYPES.includes( type )
				? buildTable( {
						type,
						headers: grid.headers,
						rows: grid.rows,
						cols: grid.cols,
						colors: chart.colors,
						...rect,
						options,
				  } )
				: buildChart( {
						type,
						...chartDataFromGrid( grid, {
							keepNegative: 'waterfall' === type,
						} ),
						colors: chart.colors,
						...rect,
						options,
				  } );
			built.group.chart = { ...chart, grid };
			chartMemo.set( group.id, {
				ctx,
				group: built.group,
				children: built.layers,
			} );
			out.refreshed++;
		} catch ( e ) {
			chartMemo.delete( group.id );
			out.failed++;
		}
	}
	return out;
}

/**
 * Sync paint-time swap (registered as a resolveBindings pass): a group
 * with a memo for this context is replaced - old children dropped, the
 * rebuilt children spliced in at the group's position.
 *
 * @param {Array}  layers Resolved layer list.
 * @param {Object} ctx    Context.
 * @return {Array} Layers with refreshed chart groups.
 */
export function applyChartMemos( layers, ctx ) {
	const dropIds = new Set();
	let any = false;
	for ( const l of layers ) {
		const m = l.chart && chartMemo.get( l.id );
		if ( m && m.ctx === ctx ) {
			any = true;
			( l.children || [] ).forEach( ( id ) => dropIds.add( id ) );
		}
	}
	if ( ! any ) {
		return layers;
	}
	const out = [];
	for ( const l of layers ) {
		if ( dropIds.has( l.id ) ) {
			continue;
		}
		const m = l.chart && chartMemo.get( l.id );
		if ( m && m.ctx === ctx ) {
			out.push( ...m.children, m.group );
		} else {
			out.push( l );
		}
	}
	return out;
}

registerResolvePass( applyChartMemos );
