/**
 * Icon & emoji picker (v1.273.0): search + tabs over the editor's bundled
 * Tabler ({ name: pathD }, 24 grid, stroke) and emoji ([{ c, n, g }])
 * libraries - the picker UI extensions had to build themselves although
 * the DATA is bridged since API 2.8. Inline panel (no popover chrome);
 * hosts wrap it in their own popover when needed.
 */

import { useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

const CAP = 120;

export function IconPicker( {
	onPick,
	icons = true,
	emoji = true,
	height = 240,
} ) {
	const [ tab, setTab ] = useState( icons ? 'icons' : 'emoji' );
	const [ query, setQuery ] = useState( '' );
	const [ tabler, setTabler ] = useState( null );
	const [ emojiList, setEmojiList ] = useState( null );

	useEffect( () => {
		let live = true;
		if ( icons ) {
			import(
				/* webpackChunkName: "icons-lib" */ '../icons-lib/tabler.json'
			).then( ( m ) => live && setTabler( m.default || m ) );
		}
		if ( emoji ) {
			import(
				/* webpackChunkName: "emoji-lib" */ '../icons-lib/emoji.json'
			).then( ( m ) => live && setEmojiList( m.default || m ) );
		}
		return () => {
			live = false;
		};
	}, [ icons, emoji ] );

	const q = query.trim().toLowerCase();
	const iconHits =
		'icons' === tab && tabler
			? Object.keys( tabler )
					.filter( ( name ) => ! q || name.includes( q ) )
					.slice( 0, CAP )
			: [];
	const emojiHits =
		'emoji' === tab && emojiList
			? emojiList
					.filter(
						( e ) =>
							! q ||
							( e.n || '' ).toLowerCase().includes( q ) ||
							( e.g || '' ).toLowerCase().includes( q )
					)
					.slice( 0, CAP )
			: [];
	const loading =
		( 'icons' === tab && ! tabler ) || ( 'emoji' === tab && ! emojiList );

	return (
		<div className="icon-picker">
			<div className="icon-picker-top">
				<input
					type="text"
					value={ query }
					placeholder={ __( 'Search…', 'wunderpaint' ) }
					onChange={ ( e ) => setQuery( e.target.value ) }
				/>
				{ icons && emoji && (
					<div className="icon-picker-tabs" role="tablist">
						<button
							type="button"
							className={ 'icons' === tab ? 'active' : '' }
							onClick={ () => setTab( 'icons' ) }
						>
							{ __( 'Icons', 'wunderpaint' ) }
						</button>
						<button
							type="button"
							className={ 'emoji' === tab ? 'active' : '' }
							onClick={ () => setTab( 'emoji' ) }
						>
							{ __( 'Emoji', 'wunderpaint' ) }
						</button>
					</div>
				) }
			</div>
			<div className="icon-picker-grid" style={ { maxHeight: height } }>
				{ loading && <span className="spin" /> }
				{ ! loading &&
					'icons' === tab &&
					iconHits.map( ( name ) => (
						<button
							type="button"
							key={ name }
							title={ name }
							onClick={ () =>
								onPick( {
									type: 'icon',
									name,
									path: tabler[ name ],
								} )
							}
						>
							<svg
								viewBox="0 0 24 24"
								width="20"
								height="20"
								aria-hidden="true"
							>
								<path
									d={ tabler[ name ] }
									fill="none"
									stroke="currentColor"
									strokeWidth="1.7"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
							</svg>
						</button>
					) ) }
				{ ! loading &&
					'emoji' === tab &&
					emojiHits.map( ( e ) => (
						<button
							type="button"
							key={ e.c }
							title={ e.n }
							onClick={ () =>
								onPick( {
									type: 'emoji',
									char: e.c,
									name: e.n,
								} )
							}
						>
							<span className="icon-picker-emoji">{ e.c }</span>
						</button>
					) ) }
				{ ! loading && ! iconHits.length && ! emojiHits.length && (
					<div className="icon-picker-empty">
						{ __( 'No matches.', 'wunderpaint' ) }
					</div>
				) }
			</div>
		</div>
	);
}
