/** Visual access to the existing built-in and site pattern libraries. */
import { useEffect, useRef, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { patternOptions } from '../../components/pattern-select';
import {
	listPatterns,
	ensurePatterns,
	onPatternsChange,
} from '../../lib/user-patterns';
import {
	patternTile,
	registerUserTile,
	userTile,
	scaledTile,
} from '../../lib/raster/patterns';
import { ToolSetting } from './tool-setting';

export function useColorPatterns( {
	targetKey,
	enabled,
	onChange,
	onCommit,
	disabled,
} ) {
	const [ own, setOwn ] = useState( listPatterns );
	const [ busy, setBusy ] = useState( false );
	const [ error, setError ] = useState( '' );
	const latest = useRef();
	latest.current = { targetKey, onChange, onCommit, disabled };
	const sequence = useRef( { value: 0 } );
	useEffect( () => {
		if ( ! enabled ) {
			return undefined;
		}
		let mounted = true;
		const refresh = () => {
			if ( mounted ) {
				setOwn( listPatterns() );
			}
		};
		const off = onPatternsChange( refresh );
		ensurePatterns().then( refresh );
		return () => {
			mounted = false;
			off();
		};
	}, [ enabled ] );
	useEffect( () => {
		setBusy( false );
		setError( '' );
		const ticket = sequence.current;
		return () => {
			ticket.value++;
		};
	}, [ targetKey ] );
	const choose = async ( pattern, patternData = null ) => {
		if ( latest.current.disabled ) {
			return;
		}
		latest.current.onCommit();
		const key = latest.current.targetKey;
		const ticket = ++sequence.current.value;
		setError( '' );
		if ( pattern === 'custom' ) {
			setBusy( true );
			await registerUserTile( patternData );
			// A decoded tile must never land in another layer, dialog or paint target.
			if (
				ticket !== sequence.current.value ||
				key !== latest.current.targetKey
			) {
				return;
			}
			setBusy( false );
			if ( ! userTile( patternData ) ) {
				setError( __( 'Could not read the image.', 'wunderpaint' ) );
				return;
			}
		}
		if ( latest.current.disabled ) {
			return;
		}
		latest.current.onChange( { type: 'pattern', pattern, patternData } );
		latest.current.onCommit();
	};
	return { own, busy, error, choose };
}

export function PatternPreview( {
	pattern,
	patternData,
	color = '#687484',
	scale = 1,
} ) {
	const canvas = useRef();
	useEffect( () => {
		let cancelled = false;
		const draw = () => {
			if ( cancelled || ! canvas.current ) {
				return;
			}
			const el = canvas.current,
				ctx = el.getContext( '2d' );
			const box = el.getBoundingClientRect(),
				dpr = window.devicePixelRatio || 1;
			el.width = Math.max( 1, Math.round( box.width * dpr ) );
			el.height = Math.max( 1, Math.round( box.height * dpr ) );
			ctx.scale( dpr, dpr );
			const tile =
				pattern === 'custom'
					? userTile( patternData )
					: patternTile( pattern, color );
			if ( ! tile ) {
				return;
			}
			const fill = ctx.createPattern(
				scaledTile( tile, scale ),
				'repeat'
			);
			if ( fill ) {
				ctx.fillStyle = fill;
				ctx.fillRect( 0, 0, el.width, el.height );
			}
		};
		if ( pattern === 'custom' ) {
			registerUserTile( patternData ).then( draw );
		} else {
			draw();
		}
		const observer = new ResizeObserver( draw );
		observer.observe( canvas.current );
		return () => {
			observer.disconnect();
			cancelled = true;
		};
	}, [ pattern, patternData, color, scale ] );
	return (
		<canvas ref={ canvas } width={ 96 } height={ 64 } aria-hidden="true" />
	);
}

export function PatternLibrary( { layer, patterns, onManage, disabled } ) {
	const [ query, setQuery ] = useState( '' );
	const match = ( name ) =>
		name.toLocaleLowerCase().includes( query.toLocaleLowerCase().trim() );
	const entries = patternOptions().filter( ( [ , name ] ) => match( name ) );
	const own = patterns.own.filter( ( p ) => match( p.name ) );
	const card = ( id, name, pattern, data ) => (
		<button
			type="button"
			key={ id }
			className="color-pattern-card"
			title={ name }
			aria-label={ name }
			disabled={ disabled || patterns.busy }
			aria-pressed={
				layer.pattern === pattern &&
				( pattern !== 'custom' || layer.patternData === data )
			}
			onClick={ () => patterns.choose( pattern, data ) }
		>
			<span className="color-pattern-tile">
				<PatternPreview pattern={ pattern } patternData={ data } />
			</span>
			<span className="color-panel-sr">{ name }</span>
		</button>
	);
	return (
		<div className="color-editor-library color-pattern-library">
			<strong className="color-panel-label">
				{ __( 'Patterns', 'wunderpaint' ) }
			</strong>
			<input
				type="search"
				aria-label={ __( 'Search patterns', 'wunderpaint' ) }
				placeholder={ __( 'Search', 'wunderpaint' ) }
				value={ query }
				onChange={ ( e ) => setQuery( e.target.value ) }
			/>
			<div className="color-library-scroll">
				<div className="color-pattern-grid">
					{ entries.map( ( [ id, name ] ) => card( id, name, id ) ) }
				</div>
				{ !! own.length && (
					<>
						<strong className="color-pattern-heading">
							{ __( 'My patterns', 'wunderpaint' ) }
						</strong>
						<div className="color-pattern-grid">
							{ own.map( ( p ) =>
								card( p.name, p.name, 'custom', p.dataUrl )
							) }
						</div>
					</>
				) }
				{ ! entries.length && ! own.length && (
					<p className="color-panel-note">
						{ __(
							'No results. Try another search term.',
							'wunderpaint'
						) }
					</p>
				) }
			</div>
			{ onManage && (
				<button
					type="button"
					className="ai-btn secondary sm"
					onClick={ onManage }
				>
					{ __( 'Manage patterns', 'wunderpaint' ) }
				</button>
			) }
		</div>
	);
}

export function PatternControls( {
	layer,
	patterns,
	color,
	onChange,
	onCommit,
} ) {
	const selected =
		layer.pattern === 'custom'
			? 'custom:' +
			  ( patterns.own.find( ( p ) => p.dataUrl === layer.patternData )
					?.name || '' )
			: layer.pattern || 'dots';
	return (
		<section className="color-editor-pattern color-editor-section">
			<div className="color-value-heading">
				<strong>{ __( 'Pattern', 'wunderpaint' ) }</strong>
				<select
					aria-label={ __( 'Pattern', 'wunderpaint' ) }
					value={ selected }
					disabled={ patterns.busy }
					onChange={ ( e ) => {
						const v = e.target.value;
						if ( v.startsWith( 'custom:' ) ) {
							const pattern = patterns.own.find(
								( p ) => p.name === v.slice( 7 )
							);
							if ( pattern ) {
								patterns.choose( 'custom', pattern.dataUrl );
							}
						} else {
							patterns.choose( v );
						}
					} }
				>
					{ patternOptions().map( ( [ id, name ] ) => (
						<option key={ id } value={ id }>
							{ name }
						</option>
					) ) }
					{ layer.pattern === 'custom' &&
						! patterns.own.some(
							( p ) => p.dataUrl === layer.patternData
						) && (
							<option value="custom:">
								{ __( 'Custom', 'wunderpaint' ) }
							</option>
						) }
					{ !! patterns.own.length && (
						<optgroup label={ __( 'My patterns', 'wunderpaint' ) }>
							{ patterns.own.map( ( p ) => (
								<option
									key={ p.name }
									value={ 'custom:' + p.name }
								>
									{ p.name }
								</option>
							) ) }
						</optgroup>
					) }
				</select>
			</div>
			<div className="color-pattern-preview">
				<PatternPreview
					pattern={ layer.pattern || 'dots' }
					patternData={ layer.patternData }
					color={ color }
					scale={ layer.patternScale || 1 }
				/>
			</div>
			<ToolSetting
				label={ __( 'Scale', 'wunderpaint' ) }
				suffix="%"
				min={ 10 }
				max={ 400 }
				value={ Math.round( ( layer.patternScale || 1 ) * 100 ) }
				onChange={ ( value ) =>
					onChange( { patternScale: value / 100 } )
				}
				onCommit={ onCommit }
			/>
			{ patterns.error && (
				<p className="color-panel-note" role="alert">
					{ patterns.error }
				</p>
			) }
		</section>
	);
}
