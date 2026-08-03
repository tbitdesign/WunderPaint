/**
 * Design preset cards (v1.269.0): the generalised TableDesigns - a grid
 * of rendered style thumbnails plus a shuffle button. What each tile
 * renders comes from the caller via renderSpec, so charts and tables
 * share one component.
 */

import { useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { renderToCanvas, sharedImageCache } from '../../lib/raster';

export function DesignCards( {
	items,
	current,
	onApply,
	renderSpec,
	onShuffle,
	renderKey = '',
} ) {
	const [ thumbs, setThumbs ] = useState( {} );
	// Everything the tiles render from must be in the signature: the
	// caller's context (type, palette) via renderKey plus every item's
	// own colors - keying on items[0] alone left the thumbnails stale
	// on type switches and palette changes (v1.272.5).
	const sig =
		renderKey +
		JSON.stringify( items.map( ( it ) => [ it.key, it.colors || 0 ] ) );
	useEffect( () => {
		let live = true;
		( async () => {
			const next = {};
			for ( const it of items ) {
				try {
					const { group, layers } = renderSpec( it );
					const canvas = await renderToCanvas(
						{ id: 'chs-style', w: 240, h: 150, bg: '#ffffff' },
						[ ...layers, group ],
						{ cache: sharedImageCache }
					);
					if ( ! live ) {
						return;
					}
					next[ it.key ] = canvas.toDataURL();
					setThumbs( ( p ) => ( { ...p, ...next } ) );
				} catch ( e ) {
					// blank tile
				}
			}
		} )();
		return () => {
			live = false;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ sig ] );
	return (
		<div style={ { display: 'grid', gap: 6 } }>
			<div style={ { display: 'flex', justifyContent: 'flex-end' } }>
				<button
					className="ai-btn secondary"
					style={ { padding: '3px 10px', fontSize: 11 } }
					onClick={ onShuffle }
				>
					{ __( 'Shuffle designs', 'wunderpaint' ) }
				</button>
			</div>
			<div
				style={ {
					display: 'grid',
					gridTemplateColumns: 'repeat(2, 1fr)',
					gap: 6,
					maxHeight: 260,
					overflowY: 'auto',
					paddingRight: 2,
				} }
			>
				{ items.map( ( it ) => (
					<button
						key={ it.key }
						title={ it.label }
						onClick={ () => onApply( it ) }
						style={ {
							padding: 0,
							border:
								current === it.id && 'custom' !== it.id
									? '2px solid var(--accent)'
									: '1px solid var(--ed-border-strong)',
							borderRadius: 6,
							overflow: 'hidden',
							cursor: 'pointer',
							background: '#fff',
							lineHeight: 0,
							aspectRatio: '8 / 5',
						} }
					>
						{ thumbs[ it.key ] ? (
							<img
								src={ thumbs[ it.key ] }
								alt={ it.label }
								style={ { width: '100%', display: 'block' } }
							/>
						) : (
							<span
								style={ {
									fontSize: 10,
									color: '#9aa1ab',
									lineHeight: '60px',
								} }
							>
								…
							</span>
						) }
					</button>
				) ) }
			</div>
		</div>
	);
}
