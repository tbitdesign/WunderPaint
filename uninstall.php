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
	global $wpdb;

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
	// the editor (mirrors WPImageEditor\Backup::OPTIONS). The two Pro options
	// (wpie_content_templates, wpie_automation_settings) are cleaned here too:
	// Pro ships no uninstall.php of its own, so without this they survived
	// every uninstall. This only runs on an explicit "remove all data", and
	// Pro cannot run without the free plugin anyway. (2026-08-16 hygiene)
	//
	// RAHMEN-05 of the 10.09.2026 audit named five options and was marked as
	// fixed; the commit added exactly one of them. The four below were still
	// here on 11.09.: wpie_usage_scan is literally the "complete scan state of
	// the usage check" the finding talks about, and wpie_orphan_hold is the
	// index of the quarantine - the only mapping from a held file back to its
	// original path. The reason it could slip is one line further down: the
	// coverage suite walked the postmeta list and nothing else. It checks the
	// option list now too.
	//
	// The Pro rows are here for the same reason as the two above them: Pro
	// ships no uninstall.php, and its own cleanup hangs on a Freemius hook
	// that never registers when the SDK is missing or the dev mode is on.
	foreach ( array( 'wpie_templates', 'wpie_designs', 'wpie_user_library', 'wpie_palettes', 'wpie_3d_models', 'wpie_ai_usage_log', 'wpie_extensions_disabled', 'wpie_content_cache_ver', 'wpie_upload_guard_version', 'wpie_quarantine_rescued', 'wpie_usage_scan', 'wpie_usage_last', 'wpie_usage_dirty', 'wpie_orphan_hold', 'wpie_content_templates', 'wpie_automation_settings', 'wpie_pro_blocks', 'wpie_pro_elementor', 'wpie_dyn_bake_queue', 'wpie_s3_last', 'wpie_pro_catalog_generated' ) as $option ) {
		delete_option( $option );
	}

	// The search index, the colour index and the media-library facets were
	// missing here, so "remove all plugin data" left a row per attachment
	// behind on every uninstall. (2026-07-25 inventory)
	//
	// Ten more were missing until 2026-09-10 - the same class again, because
	// the list is hand-kept and the code grew past it. Among them _wpie_usage,
	// _wpie_usage_count and _wpie_usage_run, which the usage engine can put on
	// EVERY attachment. tests/php/uninstall-cover.php now walks includes/ and
	// fails when a _wpie_ key exists in the code but not in this list, so the
	// next one cannot be forgotten quietly.
	// _wpie_automation, _wpie_auto_bg, _wpie_auto_result and
	// _wpie_dynamic_images belong to Pro and are here for the same reason its
	// options are. Free used to delete _wpie_auto_result and leave the other
	// two automation markers standing, while wunderpaint-pro.php said all
	// three stay on purpose - one of the two files had to be wrong. Resolved
	// towards the person who asked: Pro keeping them is right for ITS own
	// uninstall, but "Remove all plugin data" is an explicit request, and
	// these are plugin data. The comment in Pro says so now too.
	foreach ( array( '_wpie_versions', '_wpie_vdir', '_wpie_vcounter', '_wpie_project', '_wpie_psd', '_wpie_search_vec', '_wpie_colors', '_wpie_area', '_wpie_filesize', '_wpie_orient', '_wpie_auto_result', '_wpie_quarantine', '_wpie_recrop', '_wpie_replaced', '_wpie_usage', '_wpie_usage_count', '_wpie_usage_run', '_wpie_credit_author', '_wpie_credit_expires', '_wpie_credit_licence', '_wpie_credit_source', '_wpie_automation', '_wpie_auto_bg', '_wpie_dynamic_images' ) as $key ) {
		$wpdb->delete( $wpdb->postmeta, array( 'meta_key' => $key ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.SlowDBQuery.slow_db_query_meta_key -- one-off uninstall cleanup of the plugin's own postmeta keys.
	}

	// Per-user extension storage (Extension_Store::META_PREFIX): up to 64
	// rows per user, and nothing else ever removes them.
	$wpdb->query( "DELETE FROM {$wpdb->usermeta} WHERE meta_key LIKE 'wpie\\_ext\\_store\\_%'" ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.NotPrepared -- one-off uninstall cleanup of the plugin's own user meta prefix.

	// Pro's automation jobs are prefix-keyed (_wpie_auto_job_<id>), so a fixed
	// list can never reach them - the same shape as the extension store above.
	$wpdb->query( "DELETE FROM {$wpdb->postmeta} WHERE meta_key LIKE 'wpie\\_auto\\_job\\_%' OR meta_key LIKE '\\_wpie\\_auto\\_job\\_%'" ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.NotPrepared -- one-off uninstall cleanup of the plugin's own postmeta prefix.

	// Transienten mit fest bekanntem Namen. Die berechneten (wpie_geo_*,
	// wpie_stock_<md5>, wpie_feed_json_<md5>) laufen ab und werden per LIKE
	// unten geraeumt; diese hier haben Namen, also gehoeren sie in eine Liste.
	foreach ( array(
		'wpie_storage_stats',
		'wpie_usage_counts',
		'wpie_usage_chunk_lock',
		'wpie_usage_restart_lock',
		'wpie_usage_reset_lock',
	) as $wpie_transient ) {
		delete_transient( $wpie_transient );
	}
	// The editor language is one row per user who ever picked one; the smart
	// folders of the media library are one more, and Pro's dismissed health
	// notice is a third.
	delete_metadata( 'user', 0, 'wpie_editor_locale', '', true );
	delete_metadata( 'user', 0, 'wpie_smart_folders', '', true );
	delete_metadata( 'user', 0, 'wpie_health_dismissed', '', true );

	// Pro schedules two cron events of its own and, without its Freemius hook,
	// never unschedules them: they would keep firing for a plugin that is gone.
	foreach ( array( 'wpie_s3_backup', 'wpie_dyn_rebake' ) as $wpie_pro_cron ) {
		$wpie_ts = wp_next_scheduled( $wpie_pro_cron );
		while ( $wpie_ts ) {
			wp_unschedule_event( $wpie_ts, $wpie_pro_cron );
			$wpie_ts = wp_next_scheduled( $wpie_pro_cron );
		}
	}
	// Our two taxonomies (folders and tags of the media library): a
	// term_relationships row per filed image, a term per folder. The plugin is
	// not loaded here, so the taxonomies are not registered and wp_delete_term
	// cannot be used; the three tables are cleaned directly.
	// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- one-off uninstall cleanup of the plugin's own taxonomies.
	$wpie_tt = $wpdb->get_col( "SELECT term_taxonomy_id FROM {$wpdb->term_taxonomy} WHERE taxonomy IN ('wpie_folder','wpie_tag')" );
	if ( $wpie_tt ) {
		$wpie_tt_list = implode( ',', array_map( 'intval', $wpie_tt ) );
		$wpie_terms   = $wpdb->get_col( "SELECT term_id FROM {$wpdb->term_taxonomy} WHERE term_taxonomy_id IN ($wpie_tt_list)" );
		$wpdb->query( "DELETE FROM {$wpdb->term_relationships} WHERE term_taxonomy_id IN ($wpie_tt_list)" );
		$wpdb->query( "DELETE FROM {$wpdb->term_taxonomy} WHERE term_taxonomy_id IN ($wpie_tt_list)" );
		if ( $wpie_terms ) {
			$wpdb->query( "DELETE FROM {$wpdb->terms} WHERE term_id IN (" . implode( ',', array_map( 'intval', $wpie_terms ) ) . ')' );
		}
	}
	// phpcs:enable
	// The daily sweep stays scheduled for a plugin that is gone otherwise.
	wp_clear_scheduled_hook( 'wpie_quarantine_sweep' );
	// The geo caches are one transient per query and per tile source, so they
	// cannot be named one by one.
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- one-off uninstall cleanup of our own transient prefixes.
	$wpdb->query( "DELETE FROM {$wpdb->options} WHERE option_name LIKE '\\_transient\\_wpie\\_geo\\_%' OR option_name LIKE '\\_transient\\_timeout\\_wpie\\_geo\\_%'" );

	// Mirrors WPImageEditor\Helpers::upload_dirs(); nested entries ride
	// along with their parent.
	$uploads = trailingslashit( wp_upload_dir( null, false )['basedir'] );
	// NOT wpie-quarantine. Media_Orphans::hold() MOVES files there, so they
	// exist nowhere else and restore() puts them back byte for byte. Deleting
	// it destroys the user's own media, and includes/helpers.php says in so
	// many words that uninstall leaves it alone - this list simply did not.
	foreach ( array( 'wpie-versions', 'wpie-fonts', 'wpie-extensions', 'wpie-3d-models', 'wpie-models', 'wpie-runtime', 'wpie-live', 'wpie-content', 'wpie-ai-tmp' ) as $name ) {
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
	// get_sites() answers with at most 100 sites unless told otherwise
	// (WP_Site_Query defaults 'number' to 100). On a bigger network every
	// site past the hundredth kept its data - including wpie_settings_prev,
	// which holds a full copy of the obfuscated API keys.
	foreach ( get_sites( array( 'fields' => 'ids', 'number' => 0 ) ) as $wpie_site_id ) {
		switch_to_blog( $wpie_site_id );
		wpie_uninstall_site();
		restore_current_blog();
	}
} else {
	wpie_uninstall_site();
}
