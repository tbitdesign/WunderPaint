/**
 * Left rail of the extensions manager: the library (installed, updates)
 * and the catalog by category. Counts come precomputed from
 * groupCounts(); rows with a zero count simply do not render.
 */
import { __ } from '@wordpress/i18n';

import { I } from '../../icons';
import { CATEGORIES } from './labels';

function Item( { icon, label, count, on, badge, onClick } ) {
	return (
		<button
			className={ 'ext-side-item' + ( on ? ' on' : '' ) }
			onClick={ onClick }
		>
			{ I[ icon ] ? I[ icon ]( { size: 14 } ) : null }
			<span className="n">{ label }</span>
			{ badge ? (
				<span className="badge">{ count }</span>
			) : (
				<span className="c">{ count }</span>
			) }
		</button>
	);
}

export function ExtensionsSidebar( { counts, view, onView } ) {
	const is = ( kind, category = null ) =>
		view.kind === kind && view.category === category;
	return (
		<div className="ext-side">
			<div className="ext-side-head">
				{ I.puzzle( { size: 13 } ) }
				{ __( 'Library', 'wunderpaint' ) }
			</div>
			<Item
				icon="check"
				label={ __( 'Installed', 'wunderpaint' ) }
				count={ counts.installed }
				on={ is( 'installed' ) }
				onClick={ () =>
					onView( { kind: 'installed', category: null } )
				}
			/>
			{ counts.updates > 0 && (
				<Item
					icon="download"
					label={ __( 'Updates', 'wunderpaint' ) }
					count={ counts.updates }
					badge
					on={ is( 'updates' ) }
					onClick={ () =>
						onView( { kind: 'updates', category: null } )
					}
				/>
			) }
			<div className="ext-side-head">
				{ I.search( { size: 13 } ) }
				{ __( 'Discover', 'wunderpaint' ) }
			</div>
			<Item
				icon="grid"
				label={ __( 'All', 'wunderpaint' ) }
				count={ counts.all }
				on={ is( 'browse' ) }
				onClick={ () => onView( { kind: 'browse', category: null } ) }
			/>
			{ CATEGORIES.filter(
				( c ) => ( counts.categories[ c.key ] || 0 ) > 0
			).map( ( c ) => (
				<Item
					key={ c.key }
					icon={ c.icon }
					label={ c.label }
					count={ counts.categories[ c.key ] }
					on={ is( 'browse', c.key ) }
					onClick={ () =>
						onView( { kind: 'browse', category: c.key } )
					}
				/>
			) ) }
		</div>
	);
}
