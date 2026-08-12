/**
 * "What is inside this file?" (v1.401.0)
 *
 * The fourth tab of the per-image detail editor, next to Details, Usage and
 * Origin. Details describes the image, this describes the FILE: the camera
 * that took it, the software that touched it, and the spot on earth it was
 * taken at.
 *
 * The inspector is the point of the feature. A location tag is invisible in
 * every WordPress screen, sits in the original file the library serves under a
 * public URL, and nobody cleans what nobody can see. The two removal buttons
 * are the small half that follows from looking.
 *
 * Coordinates are resolved to a place name against the bundled gazetteer, the
 * same index the map studios use. No geocoding service is asked and no
 * coordinate leaves the site.
 */

import { useState, useEffect, useRef } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { I } from '../icons';
import { fileMeta, fmtBytes } from '../lib/media-usage';
import { load as loadGazetteer, nearest } from '../lib/gazetteer';
import { confirmDialog } from '../lib/dialogs';

/** Section headings, in the order they are shown. */
const GROUPS = () => [
	[ 'capture', __( 'Capture', 'wunderpaint' ) ],
	[ 'identity', __( 'Device identity', 'wunderpaint' ) ],
	[ 'software', __( 'Software and rights', 'wunderpaint' ) ],
];

/** Wording per embedded block, so the summary line names real things. */
const BLOCK_TEXT = () => ( {
	exif: __( 'Camera data (EXIF)', 'wunderpaint' ),
	gps: __( 'Location', 'wunderpaint' ),
	iptc: __( 'Captions and rights (IPTC)', 'wunderpaint' ),
	xmp: __( 'XMP', 'wunderpaint' ),
	text: __( 'Text notes', 'wunderpaint' ),
} );

export function MetadataPanel( { id, bare } ) {
	const [ state, setState ] = useState( { loading: true } );
	const [ place, setPlace ] = useState( null );
	const [ busy, setBusy ] = useState( '' );
	const [ done, setDone ] = useState( null );
	const seq = useRef( 0 );

	useEffect( () => {
		if ( ! id ) {
			return undefined;
		}
		// Sequence guard: clicking through images fast must not let an older
		// answer paint over a newer one.
		const mine = ++seq.current;
		setState( { loading: true } );
		setPlace( null );
		setDone( null );
		fileMeta
			.get( id )
			.then( ( res ) => {
				if ( mine === seq.current ) {
					setState( { loading: false, data: res } );
				}
			} )
			.catch( () => {
				if ( mine === seq.current ) {
					setState( { loading: false, error: true } );
				}
			} );
		return undefined;
	}, [ id ] );

	// Resolve the coordinates once the report has them. The index is ~1.6 MB
	// and shared with the map studios, so this is free after the first use and
	// deliberately does not block the rest of the panel from painting.
	const gps = state.data?.gps;
	useEffect( () => {
		if ( ! gps ) {
			setPlace( null );
			return undefined;
		}
		let alive = true;
		loadGazetteer()
			.then( ( data ) => {
				const hit = data ? nearest( data, gps.lat, gps.lon ) : null;
				if ( alive ) {
					setPlace( hit );
				}
			} )
			.catch( () => {} );
		return () => {
			alive = false;
		};
	}, [ gps?.lat, gps?.lon ] );

	const run = ( what ) => {
		confirmDialog( {
			title:
				'location' === what
					? __( 'Remove location', 'wunderpaint' )
					: __( 'Remove all metadata', 'wunderpaint' ),
			message:
				'location' === what
					? __(
							'The location is removed from this image and from every size generated from it. The current files are kept as a version you can restore.',
							'wunderpaint'
					  )
					: __(
							'Every embedded block is removed from this image and from every size generated from it. The current files are kept as a version you can restore.',
							'wunderpaint'
					  ),
			confirmLabel: __( 'Remove', 'wunderpaint' ),
			danger: true,
		} ).then( ( ok ) => {
			if ( ! ok ) {
				return;
			}
			setBusy( what );
			fileMeta
				.strip( id, what )
				.then( ( res ) => {
					setBusy( '' );
					setDone( res );
					if ( res?.read ) {
						setState( { loading: false, data: res.read } );
					}
				} )
				.catch( () => setBusy( '' ) );
		} );
	};

	if ( state.loading ) {
		return (
			<div className={ 'wpie-usage' + ( bare ? ' bare' : '' ) }>
				<span className="spin" />
			</div>
		);
	}

	const data = state.data;
	if ( state.error || ! data ) {
		return (
			<div className={ 'wpie-usage' + ( bare ? ' bare' : '' ) }>
				<div className="wpie-usage-verdict muted">
					{ __( 'This file could not be read.', 'wunderpaint' ) }
				</div>
			</div>
		);
	}

	const blockText = BLOCK_TEXT();
	const blocks = ( data.blocks || [] )
		.map( ( b ) => blockText[ b ] || b )
		.filter( Boolean );
	const fields = data.fields || [];

	return (
		<div className={ 'wpie-usage wpie-filemeta' + ( bare ? ' bare' : '' ) }>
			{ ! bare && (
				<div className="wpie-usage-head">
					{ __( 'Embedded file data', 'wunderpaint' ) }
				</div>
			) }

			{ ! data.supported && (
				<div className="wpie-usage-verdict muted">
					{ __(
						'This file type carries no readable metadata.',
						'wunderpaint'
					) }
				</div>
			) }

			{ data.supported && ! blocks.length && (
				<div className="wpie-usage-verdict ok">
					{ I.check( { size: 14 } ) }
					<span>
						{ __(
							'This file carries no embedded data.',
							'wunderpaint'
						) }
					</span>
				</div>
			) }

			{ !! blocks.length && (
				<div className="wpie-usage-verdict muted">
					<span>{ blocks.join( ' · ' ) }</span>
				</div>
			) }

			{ !! gps && (
				<div className="wpie-usage-verdict warn">
					{ I.alert( { size: 14 } ) }
					<span>
						{ place
							? sprintf(
									/* translators: 1: place name, 2: distance in km. */
									__(
										'Taken near %1$s, about %2$d km away.',
										'wunderpaint'
									),
									place.display,
									place.km
							  )
							: __(
									'This image records where it was taken.',
									'wunderpaint'
							  ) }
						<br />
						<span className="wpie-filemeta-coords">
							{ gps.lat }, { gps.lon }
							{ null !== gps.alt &&
								undefined !== gps.alt &&
								' · ' +
									sprintf(
										/* translators: %d: altitude in meters. */
										__( '%d m', 'wunderpaint' ),
										gps.alt
									) }
						</span>
					</span>
				</div>
			) }

			{ GROUPS().map( ( [ key, label ] ) => {
				const rows = fields.filter( ( f ) => f.group === key );
				if ( ! rows.length ) {
					return null;
				}
				return (
					<div key={ key } className="wpie-filemeta-group">
						<div className="wpie-filemeta-label">{ label }</div>
						<dl className="wpie-me-details">
							{ rows.map( ( f ) => (
								<div className="wpie-me-row" key={ f.key }>
									<dt>{ f.label }</dt>
									<dd>{ f.value }</dd>
								</div>
							) ) }
						</dl>
					</div>
				);
			} ) }

			{ !! done && (
				<div className="wpie-usage-verdict ok">
					{ I.check( { size: 14 } ) }
					<span>
						{ /* Removing only the location overwrites bytes in
						     place rather than dropping them, so that run
						     legitimately frees nothing and must not report
						     "0 B smaller". */ }
						{ ! done.files &&
							__(
								'There was nothing to remove.',
								'wunderpaint'
							) }
						{ !! done.files &&
							! done.bytes &&
							sprintf(
								/* translators: %d: number of files. */
								__( 'Cleaned %d file(s).', 'wunderpaint' ),
								done.files
							) }
						{ !! done.files &&
							!! done.bytes &&
							sprintf(
								/* translators: 1: number of files, 2: size freed. */
								__(
									'Cleaned %1$d file(s), %2$s smaller.',
									'wunderpaint'
								),
								done.files,
								fmtBytes( done.bytes )
							) }
					</span>
				</div>
			) }

			{ data.supported && !! blocks.length && (
				<div className="wpie-filemeta-actions">
					{ !! gps && (
						<button
							className="ai-btn secondary sm"
							disabled={ !! busy }
							onClick={ () => run( 'location' ) }
						>
							{ 'location' === busy && <span className="spin" /> }
							{ __( 'Remove location', 'wunderpaint' ) }
						</button>
					) }
					<button
						className="ai-btn secondary sm"
						disabled={ !! busy }
						onClick={ () => run( 'all' ) }
					>
						{ 'all' === busy && <span className="spin" /> }
						{ __( 'Remove all metadata', 'wunderpaint' ) }
					</button>
				</div>
			) }
		</div>
	);
}
