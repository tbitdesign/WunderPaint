/**
 * "Where is this image used?" (v1.351.0)
 *
 * Sits in the left column of the per-image detail editor and answers the one
 * question that stops people cleaning up their library: can I delete this?
 *
 * Always asks the server live rather than reading a stored verdict, because
 * the honest answer changes the moment somebody edits a page, and a stale yes
 * is worse than a slow one.
 */

import { useState, useEffect, useRef } from '@wordpress/element';
import { __, sprintf, _n } from '@wordpress/i18n';

import { I } from '../icons';
import { mediaUsage, credits as creditsApi } from '../lib/media-usage';

/**
 * Wording for each verdict, kept in one place so the panel and the cleanup
 * dialog cannot drift apart.
 */
export const VERDICT_TEXT = () => ( {
	used: {
		label: __( 'In use', 'wunderpaint' ),
		tone: 'ok',
	},
	unused: {
		label: __( 'Not used anywhere', 'wunderpaint' ),
		tone: 'warn',
	},
	fresh: {
		label: __( 'Recently uploaded', 'wunderpaint' ),
		tone: 'muted',
	},
	unknown: {
		label: __( 'Not checked yet', 'wunderpaint' ),
		tone: 'muted',
	},
} );

/** Icon per source, so a long list stays scannable. */
function srcIcon( src ) {
	switch ( src ) {
		case 'content':
			return I.list( { size: 13 } );
		case 'postmeta':
			return I.sliders( { size: 13 } );
		case 'options':
			return I.settings( { size: 13 } );
		case 'terms':
			return I.folder( { size: 13 } );
		case 'wunderpaint':
			return I.layers( { size: 13 } );
		default:
			return I.list( { size: 13 } );
	}
}

export function UsagePanel( { id, bare } ) {
	const [ state, setState ] = useState( { loading: true } );
	const [ open, setOpen ] = useState( false );
	const seq = useRef( 0 );

	useEffect( () => {
		if ( ! id ) {
			return undefined;
		}
		// Sequence guard: switching images fast must not let an older answer
		// paint over a newer one.
		const mine = ++seq.current;
		setState( { loading: true } );

		mediaUsage
			.for( id )
			.then( ( res ) => {
				if ( mine !== seq.current ) {
					return;
				}
				setState( {
					loading: false,
					places: res?.places || [],
					verdict: res?.verdict || 'unknown',
				} );
			} )
			.catch( () => {
				if ( mine === seq.current ) {
					setState( { loading: false, error: true } );
				}
			} );

		return () => {
			seq.current++;
		};
	}, [ id ] );

	if ( ! id ) {
		return null;
	}

	if ( state.loading ) {
		return (
			<div className={ 'wpie-usage' + ( bare ? ' bare' : '' ) }>
				{ ! bare && (
					<div className="wpie-usage-head">
						{ __( 'Usage', 'wunderpaint' ) }
					</div>
				) }
				<div className="wpie-usage-muted">
					{ __(
						'Checking where this image is used…',
						'wunderpaint'
					) }
				</div>
			</div>
		);
	}

	if ( state.error ) {
		return (
			<div className={ 'wpie-usage' + ( bare ? ' bare' : '' ) }>
				{ ! bare && (
					<div className="wpie-usage-head">
						{ __( 'Usage', 'wunderpaint' ) }
					</div>
				) }
				<div className="wpie-usage-muted">
					{ __( 'The usage check could not run.', 'wunderpaint' ) }
				</div>
			</div>
		);
	}

	const places = state.places || [];
	const shown = open ? places : places.slice( 0, 5 );

	return (
		<div className={ 'wpie-usage' + ( bare ? ' bare' : '' ) }>
			{ ! bare && (
				<div className="wpie-usage-head">
					{ __( 'Usage', 'wunderpaint' ) }
				</div>
			) }

			{ places.length === 0 ? (
				<div className="wpie-usage-verdict warn">
					{ I.alert( { size: 14 } ) }
					<span>
						{ __(
							'No references found anywhere on this site.',
							'wunderpaint'
						) }
					</span>
				</div>
			) : (
				<div className="wpie-usage-verdict ok">
					{ I.check( { size: 14 } ) }
					<span>
						{ sprintf(
							/* translators: %d: number of places. */
							_n(
								'Used in %d place',
								'Used in %d places',
								places.length,
								'wunderpaint'
							),
							places.length
						) }
					</span>
				</div>
			) }

			{ places.length > 0 && (
				<ul className="wpie-usage-list">
					{ shown.map( ( p, i ) => (
						<li key={ `${ p.src }-${ p.obj }-${ i }` }>
							<span className="wpie-usage-icon">
								{ srcIcon( p.src ) }
							</span>
							<span className="wpie-usage-where">
								{ p.edit ? (
									<a
										href={ p.edit }
										target="_blank"
										rel="noreferrer"
									>
										{ p.label }
									</a>
								) : (
									<span>{ p.label }</span>
								) }
								<em>{ p.ctx }</em>
							</span>
						</li>
					) ) }
				</ul>
			) }

			{ places.length > 5 && (
				<button
					className="wpie-mlm-link-btn"
					onClick={ () => setOpen( ! open ) }
				>
					{ open
						? __( 'Show less', 'wunderpaint' )
						: sprintf(
								/* translators: %d: number of further places. */
								__( 'Show %d more', 'wunderpaint' ),
								places.length - 5
						  ) }
				</button>
			) }

			{ places.length === 0 && (
				<p className="wpie-usage-note">
					{ __(
						'Checked post content, custom fields and page builder data, site settings, categories, and saved WunderPaint designs. A plugin that keeps image ids somewhere else could still be using it.',
						'wunderpaint'
					) }
				</p>
			) }
		</div>
	);
}

/**
 * Provenance and licence fields for the same detail pane.
 */
export function CreditsPanel( { id, bare } ) {
	const [ rec, setRec ] = useState( null );
	const [ dirty, setDirty ] = useState( false );
	const seq = useRef( 0 );

	useEffect( () => {
		if ( ! id ) {
			return undefined;
		}
		const mine = ++seq.current;
		creditsApi
			.get( id )
			.then( ( res ) => {
				if ( mine === seq.current ) {
					setRec( res );
					setDirty( false );
				}
			} )
			.catch( () => {} );
		return () => {
			seq.current++;
		};
	}, [ id ] );

	if ( ! rec ) {
		return null;
	}

	const set = ( key, value ) => {
		setRec( { ...rec, [ key ]: value } );
		setDirty( true );
	};

	const save = () => {
		creditsApi
			.set( id, {
				source: rec.source || '',
				author: rec.author || '',
				licence: rec.licence || '',
				expires: rec.expires || '',
			} )
			.then( ( res ) => {
				setRec( res );
				setDirty( false );
			} )
			.catch( () => {} );
	};

	const fields = [
		[ 'source', __( 'Source', 'wunderpaint' ) ],
		[ 'author', __( 'Creator', 'wunderpaint' ) ],
		[ 'licence', __( 'Licence', 'wunderpaint' ) ],
	];

	return (
		<div className={ 'wpie-usage wpie-credits' + ( bare ? ' bare' : '' ) }>
			{ ! bare && (
				<div className="wpie-usage-head">
					{ __( 'Origin and licence', 'wunderpaint' ) }
				</div>
			) }

			{ rec.expired && (
				<div className="wpie-usage-verdict warn">
					{ I.alert( { size: 14 } ) }
					<span>
						{ __( 'This licence has expired.', 'wunderpaint' ) }
					</span>
				</div>
			) }
			{ rec.expiring && (
				<div className="wpie-usage-verdict warn">
					{ I.alert( { size: 14 } ) }
					<span>
						{ __( 'This licence runs out soon.', 'wunderpaint' ) }
					</span>
				</div>
			) }

			{ fields.map( ( [ key, label ] ) => (
				<label key={ key } className="wpie-alt-field">
					<span>{ label }</span>
					<input
						type="text"
						value={ rec[ key ] || '' }
						onChange={ ( e ) => set( key, e.target.value ) }
					/>
				</label>
			) ) }
			<label className="wpie-alt-field">
				<span>{ __( 'Licence expires', 'wunderpaint' ) }</span>
				<input
					type="date"
					value={ rec.expires || '' }
					onChange={ ( e ) => set( 'expires', e.target.value ) }
				/>
			</label>

			{ dirty && (
				<button className="ai-btn secondary sm" onClick={ save }>
					{ __( 'Save licence details', 'wunderpaint' ) }
				</button>
			) }
		</div>
	);
}
