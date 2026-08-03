<?php
/**
 * Uninstall cleanup (spec 03.6).
 *
 * Always removes options + usage metering. When "remove data on uninstall"
 * is enabled, also removes per-attachment meta, version files and sidecars.
 * Multisite: cleaned per site.
 *
 * @package WPImageEditor
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

/**
 * Clean one site.
 */
function wpie_uninstall_site() {
	$settings = get_option( 'wpie_settings', array() );
	$remove   = is_array( $settings ) && ! empty( $settings['remove_on_uninstall'] );

	delete_option( 'wpie_settings' );
	// The shadow copy holds a full duplicate of the settings including the
	// obfuscated API keys (Settings::shadow_before_update). It was never
	// cleaned up, so every uninstalled site kept its secrets in the options
	// table forever. Deleted AFTER wpie_settings so a still-registered
	// delete_option hook cannot write it back. (F-L31, 2026-07-25 audit)
	delete_option( 'wpie_settings_prev' );
	delete_option( 'wpie_usage' );

	if ( ! $remove ) {
		return;
	}

	// "Remove all plugin data" means all of it: the content stores behind
	// the editor (mirrors WPImageEditor\Backup::OPTIONS, minus the two Pro
	// options that wunderpaint-pro/uninstall.php owns).
	foreach ( array( 'wpie_templates', 'wpie_designs', 'wpie_user_library', 'wpie_palettes', 'wpie_3d_models', 'wpie_ai_usage_log', 'wpie_extensions_disabled', 'wpie_content_cache_ver', 'wpie_upload_guard_version' ) as $option ) {
		delete_option( $option );
	}

	global $wpdb;
	// The search index, the colour index and the media-library facets were
	// missing here, so "remove all plugin data" left a row per attachment
	// behind on every uninstall. (2026-07-25 inventory)
	foreach ( array( '_wpie_versions', '_wpie_vdir', '_wpie_vcounter', '_wpie_project', '_wpie_psd', '_wpie_search_vec', '_wpie_colors', '_wpie_area', '_wpie_filesize', '_wpie_orient', '_wpie_auto_result' ) as $key ) {
		$wpdb->delete( $wpdb->postmeta, array( 'meta_key' => $key ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.SlowDBQuery.slow_db_query_meta_key -- one-off uninstall cleanup of the plugin's own postmeta keys.
	}

	// Per-user extension storage (Extension_Store::META_PREFIX): up to 64
	// rows per user, and nothing else ever removes them.
	$wpdb->query( "DELETE FROM {$wpdb->usermeta} WHERE meta_key LIKE 'wpie\\_ext\\_store\\_%'" ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.NotPrepared -- one-off uninstall cleanup of the plugin's own user meta prefix.

	delete_transient( 'wpie_storage_stats' );
	delete_transient( 'wpie_used_att_ids' );

	// Mirrors WPImageEditor\Helpers::upload_dirs(); nested entries ride
	// along with their parent.
	$uploads = trailingslashit( wp_upload_dir( null, false )['basedir'] );
	foreach ( array( 'wpie-versions', 'wpie-fonts', 'wpie-extensions', 'wpie-3d-models', 'wpie-models', 'wpie-runtime', 'wpie-live', 'wpie-content' ) as $name ) {
		wpie_uninstall_rrmdir( $uploads . $name );
	}
}

/**
 * Recursive directory removal.
 *
 * @param string $dir Directory.
 */
function wpie_uninstall_rrmdir( $dir ) {
	if ( ! is_dir( $dir ) ) {
		return;
	}
	foreach ( scandir( $dir ) as $entry ) {
		if ( '.' === $entry || '..' === $entry ) {
			continue;
		}
		$path = $dir . '/' . $entry;
		if ( is_dir( $path ) ) {
			wpie_uninstall_rrmdir( $path );
		} else {
			wp_delete_file( $path );
		}
	}
	rmdir( $dir ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_rmdir -- Removing an already-emptied directory; WP_Filesystem would require credentials on some hosts.
}

if ( is_multisite() ) {
	foreach ( get_sites( array( 'fields' => 'ids' ) ) as $wpie_site_id ) {
		switch_to_blog( $wpie_site_id );
		wpie_uninstall_site();
		restore_current_blog();
	}
} else {
	wpie_uninstall_site();
}
