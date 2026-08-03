/**
 * Type gallery (v1.269.0): 17 cards with rendered thumbnails - the same
 * engines render card, preview and inserted layers, so what you pick is
 * what you get. Thumbnails render once per session (module cache).
 */

import { useEffect, useState } from '@wordpress/element';

import { buildChart, CHART_COLORS } from '../../lib/chart';
import { buildTable, TABLE_TYPES } from '../../lib/table';
import { renderToCanvas, sharedImageCache } from '../../lib/raster';
import { gridFromText, chartDataFromGrid } from '../../lib/grid-model';
import { TYPE_GROUPS, SAMPLES, DEFAULT_TIERS } from './samples';

const THUMBS = new Map(); // type → dataURL, module-level session cache

async function thumbFor( type ) {
	if ( THUMBS.has( type ) ) {
		return THUMBS.get( type );
	}
	const rect = { x: 10, y: 8, w: 220, h: 130 };
	let built;
	if ( TABLE_TYPES.includes( type ) ) {
		const grid = gridFromText( SAMPLES[ type ] || SAMPLES.tableData );
		built = buildTable( {
			type,
			headers: grid.headers,
			rows: grid.rows,
			tiers: DEFAULT_TIERS.map( ( t ) => ( {
				...t,
				features: t.features.split( '\n' ),
			} ) ),
			colors: CHART_COLORS.slice( 0, 4 ),
			...rect,
			options: {},
		} );
	} else {
		const { labels, series } = chartDataFromGrid(
			gridFromText( SAMPLES[ type ] ),
			{ keepNegative: 'waterfall' === type }
		);
		built = buildChart( {
			type,
			labels,
			series,
			colors: CHART_COLORS.slice( 0, 4 ),
			...rect,
			options: { legend: false },
		} );
	}
	const canvas = await renderToCanvas(
		{ id: 'chs-thumb', w: 240, h: 146, bg: '#ffffff' },
		[ ...built.layers, built.group ],
		{ cache: sharedImageCache }
	);
	const url = canvas.toDataURL();
	THUMBS.set( type, url );
	return url;
}

export function TypeGallery( { current, onPick } ) {
	const [ thumbs, setThumbs ] = useState( () =>
		Object.fromEntries( THUMBS )
	);
	useEffect( () => {
		let live = true;
		( async () => {
			for ( const group of TYPE_GROUPS() ) {
				for ( const item of group.items ) {
					try {
						const url = await thumbFor( item.id );
						if ( ! live ) {
							return;
						}
						setThumbs( ( p ) =>
							p[ item.id ] ? p : { ...p, [ item.id ]: url }
						);
					} catch ( e ) {
						// A failed thumbnail just stays blank.
					}
				}
			}
		} )();
		return () => {
			live = false;
		};
	}, [] );
	return (
		<div className="chs-gallery">
			{ TYPE_GROUPS().map( ( group ) => (
				<div key={ group.id }>
					<h4>{ group.label }</h4>
					<div className="chs-type-grid">
						{ group.items.map( ( item ) => (
							<button
								key={ item.id }
								className={
									'chs-type-card' +
									( current === item.id ? ' active' : '' )
								}
								onClick={ () => onPick( item.id ) }
								title={ item.label }
							>
								{ thumbs[ item.id ] ? (
									<img
										src={ thumbs[ item.id ] }
										alt={ item.label }
									/>
								) : (
									<span className="chs-type-blank" />
								) }
								<span className="chs-type-label">
									{ item.label }
								</span>
							</button>
						) ) }
					</div>
				</div>
			) ) }
		</div>
	);
}
