/**
 * WordPress data import (v1.269.0): pick a post type, filter, choose
 * binding fields as columns, preview, apply. The query is saved on the
 * chart group as `source`, the grid toolbar then offers Refresh - one
 * request via /posts/table, resolved by the shared binding resolver.
 */

import { useEffect, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { request } from '../../lib/api';
import { gridFromPostsTable } from '../../lib/grid-model';
import { buildTableQuery } from '../../lib/chart-refresh';
import { I } from '../../icons';

// The query serialiser moved to lib/chart-refresh (v1.271) so the
// dynamic pipeline shares it; re-exported for existing consumers.
export { buildTableQuery };

/** Text-kind binding fields, grouped, from the bootstrap payload. */
export function fieldCatalog() {
	const groups = window.WPIE?.bindings || [];
	const out = [];
	for ( const g of groups ) {
		const items = ( g.items || [] ).filter( ( i ) => 'text' === i.kind );
		if ( items.length ) {
			out.push( { label: g.label, items } );
		}
	}
	return out.length
		? out
		: [
				{
					label: __( 'Post', 'wunderpaint' ),
					items: [
						{
							id: 'post.title',
							label: __( 'Post title', 'wunderpaint' ),
						},
						{
							id: 'post.date',
							label: __( 'Publish date', 'wunderpaint' ),
						},
						{
							id: 'post.category',
							label: __( 'Category', 'wunderpaint' ),
						},
					],
				},
		  ];
}

/** Resolve a field id to its catalog label. */
export function fieldLabel( id ) {
	return (
		fieldCatalog()
			.flatMap( ( g ) => g.items )
			.find( ( i ) => i.id === id )?.label || id
	);
}

export async function fetchSourceGrid( source, labels ) {
	const res = await request( {
		path: buildTableQuery( source ),
		method: 'GET',
	} );
	return {
		grid: gridFromPostsTable( res?.fields || [], labels, res?.rows || [] ),
		total: res?.total || 0,
	};
}

export function ImportPostsOverlay( { source: initial, onApply, onClose } ) {
	const [ types, setTypes ] = useState( [
		{ id: 'post', label: __( 'Post', 'wunderpaint' ) },
	] );
	const [ cats, setCats ] = useState( [] );
	const [ source, setSource ] = useState( () => ( {
		postType: 'post',
		cat: 0,
		search: '',
		orderby: 'date',
		order: 'desc',
		count: 10,
		fields: [ 'post.title', 'post.date' ],
		...( initial || {} ),
	} ) );
	const [ preview, setPreview ] = useState( null );
	const [ error, setError ] = useState( '' );
	const [ busy, setBusy ] = useState( false );
	const [ moreOpen, setMoreOpen ] = useState( false );
	const patch = ( p ) => setSource( ( s ) => ( { ...s, ...p } ) );
	const moveField = ( i, dir ) => {
		const fields = [ ...source.fields ];
		const j = i + dir;
		if ( j < 0 || j >= fields.length ) {
			return;
		}
		[ fields[ i ], fields[ j ] ] = [ fields[ j ], fields[ i ] ];
		patch( { fields } );
	};

	useEffect( () => {
		request( { path: '/posts/types', method: 'GET' } )
			.then( ( r ) => setTypes( r?.items?.length ? r.items : types ) )
			.catch( () => {} );
		request( { path: '/posts/categories', method: 'GET' } )
			.then( ( r ) => setCats( r?.items || [] ) )
			.catch( () => {} );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [] );

	// Debounced live preview of the current query.
	const sig = JSON.stringify( source );
	useEffect( () => {
		if ( ! source.fields.length ) {
			setPreview( null );
			return;
		}
		let live = true;
		const t = setTimeout( () => {
			setBusy( true );
			fetchSourceGrid( source, source.fields.map( fieldLabel ) )
				.then( ( r ) => {
					if ( live ) {
						setPreview( r );
						setError(
							r.grid.rows.length
								? ''
								: __( 'No matching entries.', 'wunderpaint' )
						);
					}
				} )
				.catch(
					( e ) =>
						live &&
						setError(
							e?.message || __( 'Import failed.', 'wunderpaint' )
						)
				)
				.finally( () => live && setBusy( false ) );
		}, 350 );
		return () => {
			live = false;
			clearTimeout( t );
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ sig ] );

	const toggleField = ( id ) =>
		patch( {
			fields: source.fields.includes( id )
				? source.fields.filter( ( f ) => f !== id )
				: [ ...source.fields, id ].slice( 0, 12 ),
		} );

	return (
		<div className="chs-import-overlay">
			<div className="chs-import-head">
				{ I.brand( { size: 18 } ) }
				{ __( 'Import from WordPress', 'wunderpaint' ) }
				<span style={ { flex: 1 } } />
				<button
					className="dsm-close"
					onClick={ onClose }
					aria-label={ __( 'Close', 'wunderpaint' ) }
				>
					{ I.close( { size: 15 } ) }
				</button>
			</div>
			<div className="chs-import-body">
				<div className="chs-import-side">
					<label className="chs-field">
						<span className="dsm-label">
							{ __( 'Post type', 'wunderpaint' ) }
						</span>
						<select
							className="dsm-select"
							value={ source.postType }
							onChange={ ( e ) =>
								patch( { postType: e.target.value, cat: 0 } )
							}
						>
							{ types.map( ( t ) => (
								<option key={ t.id } value={ t.id }>
									{ t.label }
								</option>
							) ) }
						</select>
					</label>
					{ 'post' === source.postType && cats.length > 0 && (
						<label className="chs-field">
							<span className="dsm-label">
								{ __( 'Category', 'wunderpaint' ) }
							</span>
							<select
								className="dsm-select"
								value={ source.cat }
								onChange={ ( e ) =>
									patch( { cat: +e.target.value } )
								}
							>
								<option value={ 0 }>
									{ __( 'All', 'wunderpaint' ) }
								</option>
								{ cats.map( ( c ) => (
									<option key={ c.id } value={ c.id }>
										{ c.name }
									</option>
								) ) }
							</select>
						</label>
					) }
					<label className="chs-field">
						<span className="dsm-label">
							{ __( 'Search', 'wunderpaint' ) }
						</span>
						<input
							type="text"
							className="dsm-select"
							value={ source.search }
							onChange={ ( e ) =>
								patch( { search: e.target.value } )
							}
						/>
					</label>
					<div style={ { display: 'flex', gap: 8 } }>
						<label className="chs-field" style={ { flex: 1 } }>
							<span className="dsm-label">
								{ __( 'Sort by', 'wunderpaint' ) }
							</span>
							<select
								className="dsm-select"
								value={ source.orderby + ':' + source.order }
								onChange={ ( e ) => {
									const [ orderby, order ] =
										e.target.value.split( ':' );
									patch( { orderby, order } );
								} }
							>
								<option value="date:desc">
									{ __( 'Newest first', 'wunderpaint' ) }
								</option>
								<option value="date:asc">
									{ __( 'Oldest first', 'wunderpaint' ) }
								</option>
								<option value="title:asc">
									{ __( 'Title A-Z', 'wunderpaint' ) }
								</option>
								<option value="modified:desc">
									{ __( 'Recently updated', 'wunderpaint' ) }
								</option>
							</select>
						</label>
						<label className="chs-field" style={ { width: 74 } }>
							<span className="dsm-label">
								{ __( 'Rows', 'wunderpaint' ) }
							</span>
							<input
								type="number"
								className="dsm-select"
								min={ 1 }
								max={ 50 }
								value={ source.count }
								onChange={ ( e ) =>
									patch( {
										count: Math.min(
											50,
											Math.max( 1, +e.target.value || 10 )
										),
									} )
								}
							/>
						</label>
					</div>
					<button
						className="ai-btn secondary"
						style={ { justifySelf: 'start' } }
						onClick={ () => setMoreOpen( ! moreOpen ) }
					>
						{ moreOpen
							? __( 'Fewer filters', 'wunderpaint' )
							: __( 'More filters', 'wunderpaint' ) }
					</button>
					{ moreOpen && (
						<>
							<div style={ { display: 'flex', gap: 8 } }>
								<label
									className="chs-field"
									style={ { flex: 1 } }
								>
									<span className="dsm-label">
										{ __( 'Date from', 'wunderpaint' ) }
									</span>
									<input
										type="date"
										className="dsm-select"
										value={ source.dateAfter || '' }
										onChange={ ( e ) =>
											patch( {
												dateAfter: e.target.value,
											} )
										}
									/>
								</label>
								<label
									className="chs-field"
									style={ { flex: 1 } }
								>
									<span className="dsm-label">
										{ __( 'Date to', 'wunderpaint' ) }
									</span>
									<input
										type="date"
										className="dsm-select"
										value={ source.dateBefore || '' }
										onChange={ ( e ) =>
											patch( {
												dateBefore: e.target.value,
											} )
										}
									/>
								</label>
							</div>
							<div style={ { display: 'flex', gap: 8 } }>
								<label
									className="chs-field"
									style={ { flex: 1 } }
								>
									<span className="dsm-label">
										{ __( 'Author ID', 'wunderpaint' ) }
									</span>
									<input
										type="number"
										className="dsm-select"
										min={ 0 }
										value={ source.author || '' }
										onChange={ ( e ) =>
											patch( {
												author: +e.target.value || 0,
											} )
										}
									/>
								</label>
								<label
									className="chs-field"
									style={ { flex: 1 } }
								>
									<span className="dsm-label">
										{ __( 'Offset', 'wunderpaint' ) }
									</span>
									<input
										type="number"
										className="dsm-select"
										min={ 0 }
										max={ 500 }
										value={ source.offset || '' }
										onChange={ ( e ) =>
											patch( {
												offset: +e.target.value || 0,
											} )
										}
									/>
								</label>
							</div>
							<div style={ { display: 'flex', gap: 8 } }>
								<label
									className="chs-field"
									style={ { flex: 1 } }
								>
									<span className="dsm-label">
										{ __( 'Taxonomy', 'wunderpaint' ) }
									</span>
									<input
										type="text"
										className="dsm-select"
										placeholder="product_cat"
										value={ source.tax || '' }
										onChange={ ( e ) =>
											patch( { tax: e.target.value } )
										}
									/>
								</label>
								<label
									className="chs-field"
									style={ { width: 90 } }
								>
									<span className="dsm-label">
										{ __( 'Term ID', 'wunderpaint' ) }
									</span>
									<input
										type="number"
										className="dsm-select"
										min={ 0 }
										value={ source.term || '' }
										onChange={ ( e ) =>
											patch( {
												term: +e.target.value || 0,
											} )
										}
									/>
								</label>
							</div>
							<div style={ { display: 'flex', gap: 8 } }>
								<label
									className="chs-field"
									style={ { flex: 1 } }
								>
									<span className="dsm-label">
										{ __( 'Meta key', 'wunderpaint' ) }
									</span>
									<input
										type="text"
										className="dsm-select"
										value={ source.metaKey || '' }
										onChange={ ( e ) =>
											patch( {
												metaKey: e.target.value,
											} )
										}
									/>
								</label>
								<label
									className="chs-field"
									style={ { width: 70 } }
								>
									<span className="dsm-label">
										{ __( 'Compare', 'wunderpaint' ) }
									</span>
									<select
										className="dsm-select"
										value={ source.metaCompare || '=' }
										onChange={ ( e ) =>
											patch( {
												metaCompare: e.target.value,
											} )
										}
									>
										{ [
											'=',
											'!=',
											'>',
											'>=',
											'<',
											'<=',
											'LIKE',
										].map( ( c ) => (
											<option key={ c } value={ c }>
												{ c }
											</option>
										) ) }
									</select>
								</label>
								<label
									className="chs-field"
									style={ { flex: 1 } }
								>
									<span className="dsm-label">
										{ __( 'Meta value', 'wunderpaint' ) }
									</span>
									<input
										type="text"
										className="dsm-select"
										value={ source.metaValue || '' }
										onChange={ ( e ) =>
											patch( {
												metaValue: e.target.value,
											} )
										}
									/>
								</label>
							</div>
						</>
					) }
					{ source.fields.length > 0 && (
						<div className="chs-field">
							<span className="dsm-label">
								{ __(
									'Selected columns (order)',
									'wunderpaint'
								) }
							</span>
							{ source.fields.map( ( f, i ) => (
								<div
									key={ f }
									style={ {
										display: 'flex',
										gap: 4,
										alignItems: 'center',
										fontSize: 12,
									} }
								>
									<span
										style={ {
											flex: 1,
											overflow: 'hidden',
											textOverflow: 'ellipsis',
											whiteSpace: 'nowrap',
										} }
									>
										{ fieldLabel( f ) }
									</span>
									<button
										className="ai-btn secondary"
										style={ { padding: '0 6px' } }
										disabled={ 0 === i }
										aria-label={ __(
											'Move up',
											'wunderpaint'
										) }
										onClick={ () => moveField( i, -1 ) }
									>
										▲
									</button>
									<button
										className="ai-btn secondary"
										style={ { padding: '0 6px' } }
										disabled={
											i === source.fields.length - 1
										}
										aria-label={ __(
											'Move down',
											'wunderpaint'
										) }
										onClick={ () => moveField( i, 1 ) }
									>
										▼
									</button>
								</div>
							) ) }
						</div>
					) }
					<div className="chs-field">
						<span className="dsm-label">
							{ __( 'Add columns', 'wunderpaint' ) }
						</span>
						<div className="chs-fieldlist">
							{ fieldCatalog().map( ( g ) => (
								<div key={ g.label }>
									<span
										className="dsm-label"
										style={ { opacity: 0.7 } }
									>
										{ g.label }
									</span>
									{ g.items.map( ( item ) => (
										<label key={ item.id }>
											<input
												type="checkbox"
												checked={ source.fields.includes(
													item.id
												) }
												onChange={ () =>
													toggleField( item.id )
												}
											/>
											{ item.label }
										</label>
									) ) }
								</div>
							) ) }
						</div>
					</div>
				</div>
				<div className="chs-import-main">
					{ error && (
						<p
							style={ {
								color: 'var(--ed-danger, #d63638)',
								fontSize: 12,
							} }
						>
							{ error }
						</p>
					) }
					{ preview?.grid?.rows?.length > 0 && (
						<table className="chs-grid">
							<thead>
								<tr>
									{ preview.grid.headers.map( ( hd, i ) => (
										<th
											key={ i }
											style={ { padding: '5px 7px' } }
										>
											{ hd }
										</th>
									) ) }
								</tr>
							</thead>
							<tbody>
								{ preview.grid.rows.map( ( row, r ) => (
									<tr key={ r }>
										{ row.map( ( c, i ) => (
											<td
												key={ i }
												style={ {
													padding: '5px 7px',
												} }
											>
												{ c }
											</td>
										) ) }
									</tr>
								) ) }
							</tbody>
						</table>
					) }
				</div>
			</div>
			<div className="chs-import-foot">
				<span className="dsm-hint" style={ { flex: 1 } }>
					{ preview
						? sprintf(
								/* translators: %d: total matching entries. */
								__( '%d matching entries.', 'wunderpaint' ),
								preview.total
						  )
						: '' }
				</span>
				<button className="ai-btn secondary" onClick={ onClose }>
					{ __( 'Cancel', 'wunderpaint' ) }
				</button>
				<button
					className="ai-btn primary"
					disabled={ busy || ! preview?.grid?.rows?.length }
					onClick={ () => onApply( { grid: preview.grid, source } ) }
				>
					{ __( 'Use data', 'wunderpaint' ) }
				</button>
			</div>
		</div>
	);
}
