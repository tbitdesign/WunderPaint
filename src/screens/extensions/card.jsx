/**
 * One card for every surface of the extensions manager: catalog entries
 * and installed packages share the same look. The whole card opens the
 * detail view; the only inline action is the enable switch on installed
 * cards, so the frequent flip stays a single click.
 */
import { __ } from '@wordpress/i18n';

export function ExtensionCard( {
	card,
	busy,
	canManage,
	needsReload,
	hasIssues,
	onOpen,
	onToggle,
} ) {
	const open = () => onOpen( card );
	return (
		<div
			className={ `ext-card ext-card-${ card.state }` }
			role="button"
			tabIndex={ 0 }
			onClick={ open }
			onKeyDown={ ( e ) => {
				if ( 'Enter' === e.key || ' ' === e.key ) {
					e.preventDefault();
					open();
				}
			} }
		>
			<div className="ext-card-body">
				<div className="ext-card-title">
					<strong>{ card.name }</strong>
					{ 'pro' === card.tier && (
						<span className="ext-chip ext-chip-pro">
							{ __( 'Pro', 'wunderpaint' ) }
						</span>
					) }
					{ 'free' === card.tier && (
						<span className="ext-chip">
							{ __( 'Free', 'wunderpaint' ) }
						</span>
					) }
				</div>
				<div className="ext-card-flags">
					{ card.installed && ! card.apiBlocked && (
						<span className="ext-chip ext-chip-ok">
							{ __( 'Installed', 'wunderpaint' ) }
						</span>
					) }
					{ 'update' === card.state && (
						<span className="ext-chip ext-chip-update">
							{ __( 'Update available', 'wunderpaint' ) }
						</span>
					) }
					{ false === card.enabled && (
						<span className="ext-chip ext-chip-off">
							{ __( 'Disabled', 'wunderpaint' ) }
						</span>
					) }
					{ needsReload && (
						<span className="ext-chip">
							{ __( 'Reload needed', 'wunderpaint' ) }
						</span>
					) }
					{ ( card.apiBlocked || hasIssues ) && (
						<span className="ext-chip ext-chip-off">
							{ __( 'Error', 'wunderpaint' ) }
						</span>
					) }
				</div>
				{ !! card.description && (
					<div className="ext-card-desc">{ card.description }</div>
				) }
			</div>
			{ card.installed && canManage && (
				<div className="ext-card-foot">
					<span className="t">
						{ card.enabled
							? __( 'Enabled', 'wunderpaint' )
							: __( 'Disabled', 'wunderpaint' ) }
					</span>
					<button
						className={
							'dsm-toggle' + ( card.enabled ? ' on' : '' )
						}
						role="switch"
						aria-checked={ !! card.enabled }
						aria-label={ card.name }
						disabled={ busy }
						onClick={ ( e ) => {
							e.stopPropagation();
							onToggle( card );
						} }
					>
						<span className="knob" />
					</button>
				</div>
			) }
		</div>
	);
}
