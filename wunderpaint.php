<?php
/**
 * Plugin Name:       WunderPaint
 * Plugin URI:        https://wp-image-editor.com
 * Description:       Design graphics, edit photos and automate your images.
 * Version:           1.430.0
 * Requires at least: 6.4
 * Requires PHP:      7.4
 * Author:            TBIT DESIGN - Thomas Breher
 * Author URI:        https://tbitdesign.com
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       wunderpaint
 *
 * Copyright (C) 2026 TBIT DESIGN, Thomas Breher.
 *
 * @package WPImageEditor
 */

defined( 'ABSPATH' ) || exit;

define( 'WPIE_VERSION', '1.430.0' );
define( 'WPIE_FILE', __FILE__ );
define( 'WPIE_DIR', plugin_dir_path( __FILE__ ) );
define( 'WPIE_URL', plugin_dir_url( __FILE__ ) );
define( 'WPIE_SLUG', 'wpie-editor' );
define( 'WPIE_SETTINGS_SLUG', 'wpie-settings' );
define( 'WPIE_OPTION', 'wpie_settings' );
define( 'WPIE_REST_NS', 'wpie/v1' );

require_once WPIE_DIR . 'includes/helpers.php';
require_once WPIE_DIR . 'includes/class-settings.php';
require_once WPIE_DIR . 'includes/class-media.php';
require_once WPIE_DIR . 'includes/class-editor-page.php';
require_once WPIE_DIR . 'includes/class-assets.php';
require_once WPIE_DIR . 'includes/class-versioning.php';
require_once WPIE_DIR . 'includes/class-image-writer.php';
require_once WPIE_DIR . 'includes/class-rest-controller.php';
require_once WPIE_DIR . 'includes/class-models-3d.php';
require_once WPIE_DIR . 'includes/class-meshy.php';
require_once WPIE_DIR . 'includes/class-json-repair.php';
require_once WPIE_DIR . 'includes/class-ai-core.php';
require_once WPIE_DIR . 'includes/class-ai-provider.php';
require_once WPIE_DIR . 'includes/class-templates.php';
require_once WPIE_DIR . 'includes/class-projects.php';
require_once WPIE_DIR . 'includes/class-stock.php';
require_once WPIE_DIR . 'includes/class-ml-models.php';
require_once WPIE_DIR . 'includes/class-user-library.php';
require_once WPIE_DIR . 'includes/class-palettes.php';
require_once WPIE_DIR . 'includes/class-extension-store.php';
require_once WPIE_DIR . 'includes/class-backup.php';
require_once WPIE_DIR . 'includes/class-post-data.php';
require_once WPIE_DIR . 'includes/class-extensions.php';
require_once WPIE_DIR . 'includes/class-search-index.php';
require_once WPIE_DIR . 'includes/class-media-library.php';
require_once WPIE_DIR . 'includes/class-media-usage.php';
require_once WPIE_DIR . 'includes/class-media-quarantine.php';
require_once WPIE_DIR . 'includes/class-media-orphans.php';
require_once WPIE_DIR . 'includes/class-media-replace.php';
require_once WPIE_DIR . 'includes/class-media-recrop.php';
require_once WPIE_DIR . 'includes/class-media-oversize.php';
require_once WPIE_DIR . 'includes/class-media-credits.php';
require_once WPIE_DIR . 'includes/class-media-metadata.php';
require_once WPIE_DIR . 'includes/class-fonts.php';
require_once WPIE_DIR . 'includes/class-content-cache.php';
require_once WPIE_DIR . 'includes/class-geo.php';
require_once WPIE_DIR . 'includes/class-elementor.php';
require_once WPIE_DIR . 'includes/class-assistant.php';
require_once WPIE_DIR . 'includes/class-locale.php';
\WPImageEditor\Editor_Locale::hooks();
require_once WPIE_DIR . 'includes/class-plugin.php';

/**
 * Version files live outside guessable URLs; base dir under uploads.
 * Defined lazily because wp_upload_dir() needs WP loaded past plugin bootstrap.
 */
function wpie_versions_dir() {
	if ( ! defined( 'WPIE_VERSIONS_DIR' ) ) {
		$uploads = wp_upload_dir( null, false );
		define( 'WPIE_VERSIONS_DIR', trailingslashit( $uploads['basedir'] ) . 'wpie-versions' );
	}
	return WPIE_VERSIONS_DIR;
}

/**
 * Gzip-at-rest for the JSON sidecars (v1.282): projects, designs and
 * templates compress on write and sniff on read, so pixel-heavy design
 * JSONs stop eating disk while every EXISTING plain file stays readable
 * forever. Deliberately app-level: no webserver config, no host
 * dependency - the bytes on disk are ours in both directions.
 *
 * @param string $path Absolute file path.
 * @param string $json JSON string.
 * @return bool Whether the write succeeded.
 */
function wpie_write_json_file( $path, $json ) {
	$data = function_exists( 'gzencode' ) ? gzencode( (string) $json, 6 ) : (string) $json;
	if ( false === $data ) {
		$data = (string) $json;
	}
	// Stage beside the target, then rename. A full disk or a killed request
	// used to leave a truncated sidecar under the real name and report it as
	// a success, and the next open found a corrupt design with no way back.
	// rename() is atomic on the same filesystem, so the old file stays whole
	// until the new one is complete - and a short write is a failure.
	$tmp     = $path . '.' . uniqid( '', true ) . '.incoming';
	$written = @file_put_contents( $tmp, $data ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents, WordPress.PHP.NoSilencedErrors.Discouraged
	if ( strlen( $data ) !== $written ) {
		if ( file_exists( $tmp ) ) {
			wp_delete_file( $tmp );
		}
		return false;
	}
	if ( file_exists( $path ) ) {
		@chmod( $tmp, fileperms( $path ) & 0777 ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_chmod, WordPress.PHP.NoSilencedErrors.Discouraged
	}
	if ( ! @rename( $tmp, $path ) ) { // phpcs:ignore WordPress.WP.AlternativeFunctions.rename_rename, WordPress.PHP.NoSilencedErrors.Discouraged
		wp_delete_file( $tmp );
		return false;
	}
	return true;
}

/**
 * Read a JSON sidecar written by wpie_write_json_file() OR any older
 * plain file: the gzip magic bytes decide, and a failed inflate is a read
 * failure, not a licence to hand back the compressed bytes.
 *
 * @param string $path Absolute file path.
 * @return string|false JSON string, or false when unreadable.
 */
function wpie_read_json_file( $path ) {
	// A sidecar that was never written is the normal case, not an incident:
	// asking first keeps the error log free of the warning file_get_contents
	// raises for every missing file.
	if ( ! is_file( $path ) || ! is_readable( $path ) ) {
		return false;
	}
	$raw = file_get_contents( $path ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
	if ( false === $raw ) {
		return false;
	}
	if ( "\x1f\x8b" === substr( $raw, 0, 2 ) ) {
		// The magic bytes say gzip, so the caller must not be handed the
		// compressed bytes as if they were JSON. That fallback used to look
		// harmless - json_decode() simply returns null - but the usage
		// scanner searches the string for a file name, and searching binary
		// rubbish finds nothing, which reads as "this image is not used".
		// A file that says it is gzipped and will not inflate is unreadable.
		$out = function_exists( 'gzdecode' ) ? @gzdecode( $raw ) : false; // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		return false === $out ? false : $out;
	}
	return $raw;
}

register_activation_hook( __FILE__, array( \WPImageEditor\Plugin::class, 'activate' ) );
register_deactivation_hook( __FILE__, array( \WPImageEditor\Plugin::class, 'deactivate' ) );

add_action( 'plugins_loaded', array( \WPImageEditor\Plugin::class, 'instance' ) );
