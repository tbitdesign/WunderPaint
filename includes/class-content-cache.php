<?php
/**
 * Content pack cache.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Gzip the bundled content packs into uploads at runtime (v1.319.0).
 *
 * wordpress.org does not allow compressed files inside a plugin ZIP, so the
 * template/combo packs ship as plain .json only. To keep the ~11:1 transfer
 * win they had as pre-built .json.gz, we gzip them once into
 * uploads/wpie-content/ and let the editor fetch those (fetch-pack.js inflates
 * client-side and falls back to the plain .json when the cache is missing).
 * Mirrors the gzip-at-rest approach already used for the JSON sidecars.
 */
class Content_Cache {

	/**
	 * Packs that ship as plain .json in assets/content/ and get gzipped here.
	 *
	 * @var string[]
	 */
	const PACKS = array( 'bundled-templates', 'bundled-combos', 'growth-pack' );

	/**
	 * Absolute path of the uploads cache directory.
	 *
	 * @return string
	 */
	public static function dir() {
		$uploads = wp_upload_dir( null, false );
		return trailingslashit( $uploads['basedir'] ) . 'wpie-content';
	}

	/**
	 * Public URL base of the uploads cache directory.
	 *
	 * @return string
	 */
	public static function url() {
		$uploads = wp_upload_dir( null, false );
		return trailingslashit( $uploads['baseurl'] ) . 'wpie-content';
	}

	/**
	 * Whether every pack has a .gz in the cache.
	 *
	 * @return bool
	 */
	public static function is_ready() {
		foreach ( self::PACKS as $name ) {
			if ( ! file_exists( self::dir() . '/' . $name . '.json.gz' ) ) {
				return false;
			}
		}
		return true;
	}

	/**
	 * URL base the editor should use for the gzipped packs, or '' when the
	 * cache is not ready (the editor then serves the plain .json).
	 *
	 * @return string
	 */
	public static function ready_url() {
		return self::is_ready() ? self::url() : '';
	}

	/**
	 * Gzip the bundled plain packs into the uploads cache.
	 *
	 * Version-gated, so it is a cheap no-op after the first run per plugin
	 * version. Silently does nothing when gzip or a writable uploads dir is
	 * unavailable; the editor then falls back to the plain .json.
	 *
	 * @return void
	 */
	public static function ensure() {
		if ( ! function_exists( 'gzencode' ) ) {
			return;
		}
		if ( get_option( 'wpie_content_cache_ver' ) === WPIE_VERSION && self::is_ready() ) {
			return;
		}
		$dir = self::dir();
		if ( ! wp_mkdir_p( $dir ) ) {
			return;
		}

		$ok = true;
		foreach ( self::PACKS as $name ) {
			$src = WPIE_DIR . 'assets/content/' . $name . '.json';
			if ( ! file_exists( $src ) ) {
				continue;
			}
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- reading a bundled plugin asset.
			$json = file_get_contents( $src );
			if ( false === $json ) {
				$ok = false;
				continue;
			}
			$gz = gzencode( $json, 6 );
			if ( false === $gz ) {
				$ok = false;
				continue;
			}
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- writing to a plugin-owned uploads cache.
			if ( false === file_put_contents( $dir . '/' . $name . '.json.gz', $gz ) ) {
				$ok = false;
			}
		}

		$guard = $dir . '/index.php';
		if ( ! file_exists( $guard ) ) {
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- directory browse guard.
			file_put_contents( $guard, "<?php // Silence is golden.\n" );
		}

		if ( $ok ) {
			update_option( 'wpie_content_cache_ver', WPIE_VERSION, false );
		}
	}
}
