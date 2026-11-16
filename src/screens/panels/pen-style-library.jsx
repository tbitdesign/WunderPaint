import { useState, useRef, useMemo } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { I } from '../../icons';
import { siteStorage } from '../../lib/local-storage';
import { penOutline } from '../../lib/pen-path';
import {
	cleanPenStyleSet,
	penStyleSet,
	portablePenStyle,
} from '../../lib/pen-style-library';
const KEY = 'wpie-pen-styles';
const SAMPLE = 'M12 55C45 5 85 105 137 38';
function load() {
	try {
		const current = siteStorage.getItem( KEY );
		if ( current ) {
			return cleanPenStyleSet( JSON.parse( current ) );
		}
		const old = JSON.parse(
			siteStorage.getItem( 'wpie-pen-style' ) || 'null'
		);
		return old
			? [
					{
						id: 'legacy',
						name: __( 'Saved style', 'wunderpaint' ),
						favorite: false,
						style: portablePenStyle( old ),
					},
			  ]
			: [];
	} catch ( e ) {
		return [];
	}
}
function Thumb( { style } ) {
	const d = useMemo(
		() =>
			penOutline( SAMPLE, {
				...style,
				symmetry: 'off',
				parallelCount: 0,
				width: Math.min( 18, Math.max( 4, style.width * 0.4 ) ),
			} ),
		[ style ]
	);
	return (
		<svg viewBox="0 0 150 90" aria-hidden="true">
			<path d={ d } fill="currentColor" />
		</svg>
	);
}
export function PenStyleLibrary( { style, onApply, disabled } ) {
	const [ styles, setStyles ] = useState( load ),
		[ name, setName ] = useState( '' ),
		[ error, setError ] = useState( '' ),
		[ onlyFavorites, setOnlyFavorites ] = useState( false ),
		input = useRef( null );
	const save = ( next ) => {
		try {
			siteStorage.setItem( KEY, JSON.stringify( penStyleSet( next ) ) );
			setStyles( next );
			setError( '' );
		} catch ( e ) {
			setError( __( 'Styles could not be saved.', 'wunderpaint' ) );
		}
	};
	const items = styles.filter( ( item ) => ! onlyFavorites || item.favorite );
	return (
		<>
			<div className="pp-presets pp-user-presets">
				<button
					className="pp-favorite-filter"
					aria-pressed={ onlyFavorites }
					onClick={ () => setOnlyFavorites( ! onlyFavorites ) }
				>
					{ __( 'Favorites', 'wunderpaint' ) }
				</button>
				{ items.map( ( item ) => (
					<div className="pp-user-style" key={ item.id }>
						<button
							className="pp-style-pick"
							title={ item.name }
							aria-label={ item.name }
							disabled={ disabled }
							onClick={ () => onApply( item.style ) }
						>
							<Thumb style={ item.style } />
							<span>{ item.name }</span>
						</button>
						<div className="pp-style-tools">
							<button
								aria-pressed={ item.favorite }
								aria-label={ __( 'Favorite', 'wunderpaint' ) }
								title={ __( 'Favorite', 'wunderpaint' ) }
								onClick={ () =>
									save(
										styles.map( ( s ) =>
											s.id === item.id
												? {
														...s,
														favorite: ! s.favorite,
												  }
												: s
										)
									)
								}
							>
								{ item.favorite ? '★' : '☆' }
							</button>
							<button
								aria-label={ __(
									'Remove style',
									'wunderpaint'
								) }
								title={ __( 'Remove style', 'wunderpaint' ) }
								onClick={ () =>
									save(
										styles.filter(
											( s ) => s.id !== item.id
										)
									)
								}
							>
								{ I.close( { size: 12 } ) }
							</button>
						</div>
					</div>
				) ) }
				{ ! items.length && (
					<p className="pp-hint">
						{ __( 'No saved styles yet.', 'wunderpaint' ) }
					</p>
				) }
			</div>
			<div className="pp-saved">
				<input
					className="pp-style-name"
					aria-label={ __( 'Style name', 'wunderpaint' ) }
					placeholder={ __( 'Style name', 'wunderpaint' ) }
					value={ name }
					maxLength={ 80 }
					onChange={ ( e ) => setName( e.target.value ) }
				/>
				<div className="pp-actions">
					<button
						disabled={ styles.length >= 100 }
						onClick={ () => {
							const id = `pen-${ Date.now().toString(
								36
							) }-${ Math.random()
								.toString( 36 )
								.slice( 2, 8 ) }`;
							save( [
								...styles,
								{
									id,
									name:
										name.trim() ||
										sprintf(
											/* translators: %d: saved style number. */ __(
												'Style %d',
												'wunderpaint'
											),
											styles.length + 1
										),
									favorite: false,
									style: portablePenStyle( style ),
								},
							] );
							setName( '' );
						} }
					>
						{ __( 'Save style', 'wunderpaint' ) }
					</button>
				</div>
				<div className="pp-actions">
					<button onClick={ () => input.current?.click() }>
						{ __( 'Import', 'wunderpaint' ) }
					</button>
					<button
						disabled={ ! styles.length }
						onClick={ () => {
							const url = URL.createObjectURL(
								new Blob(
									[
										JSON.stringify(
											penStyleSet( styles ),
											null,
											2
										),
									],
									{ type: 'application/json' }
								)
							);
							const a = document.createElement( 'a' );
							a.href = url;
							a.download = 'wunderpaint-pen-styles.json';
							a.click();
							setTimeout(
								() => URL.revokeObjectURL( url ),
								1000
							);
						} }
					>
						{ __( 'Export', 'wunderpaint' ) }
					</button>
				</div>
				<input
					ref={ input }
					type="file"
					accept=".json,application/json"
					hidden
					onChange={ async ( e ) => {
						const file = e.target.files?.[ 0 ];
						e.target.value = '';
						if ( ! file ) {
							return;
						}
						try {
							if ( file.size > 1000000 ) {
								throw new Error( 'Too large' );
							}
							const imported = cleanPenStyleSet(
								JSON.parse( await file.text() )
							);
							if ( styles.length + imported.length > 100 ) {
								throw new Error( 'Too many' );
							}
							save( [
								...styles,
								...imported.map( ( item, i ) => ( {
									...item,
									id: `import-${ Date.now() }-${ i }`,
								} ) ),
							] );
						} catch ( err ) {
							setError(
								__(
									'This file is not a valid pen style set (up to 100 styles).',
									'wunderpaint'
								)
							);
						}
					} }
				/>
				{ error && (
					<p className="pp-hint" role="alert">
						{ error }
					</p>
				) }
			</div>
		</>
	);
}
