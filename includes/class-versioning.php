<?php
/**
 * Per-attachment version store + sidecar project files.
 *
 * Version files are prior copies of possibly-private images. They live in a
 * randomized per-attachment subdirectory and are ONLY served through the
 * capability-gated REST route, never at guessable uploads URLs (spec 08.3).
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Version store.
 */
class Versioning {

	const META_VERSIONS = '_wpie_versions';
	const META_SUBDIR   = '_wpie_vdir';
	const META_COUNTER  = '_wpie_vcounter';
	const META_PROJECT  = '_wpie_project';
	const META_PSD      = '_wpie_psd';

	/**
	 * Randomized storage directory for an attachment (created on demand).
	 *
	 * @param int $attachment_id Attachment id.
	 * @return string Absolute path, no trailing slash.
	 */
	public static function dir_for( $attachment_id ) {
		$sub = get_post_meta( $attachment_id, self::META_SUBDIR, true );
		// The stored value is concatenated into a path below. It is generated
		// here as plain alphanumerics, but a restored backup could have written
		// anything into this meta key, and a traversing value pointed the whole
		// version store outside the uploads directory. Normalise defensively so
		// records from older imports are disarmed too. (F-M08, 2026-07-25 audit)
		$clean = preg_replace( '/[^a-zA-Z0-9]/', '', (string) $sub );
		if ( $clean !== (string) $sub ) {
			$sub = $clean;
			if ( '' !== $sub ) {
				update_post_meta( $attachment_id, self::META_SUBDIR, $sub );
			}
		}
		if ( ! $sub ) {
			$sub = wp_generate_password( 16, false, false );
			update_post_meta( $attachment_id, self::META_SUBDIR, $sub );
		}
		$dir = trailingslashit( \wpie_versions_dir() ) . $attachment_id . '-' . $sub;
		if ( ! is_dir( $dir ) ) {
			wp_mkdir_p( $dir );
			Helpers::protect_dir( \wpie_versions_dir() );
			file_put_contents( $dir . '/index.php', "<?php // Silence is golden.\n" ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		}
		return $dir;
	}

	/**
	 * Stored version records (newest last).
	 *
	 * @param int $attachment_id Attachment id.
	 * @return array[]
	 */
	public static function records( $attachment_id ) {
		$records = get_post_meta( $attachment_id, self::META_VERSIONS, true );
		return is_array( $records ) ? $records : array();
	}

	/**
	 * Copy the attachment's current file into the store as the next version.
	 *
	 * @param int    $attachment_id Attachment id.
	 * @param string $note          Optional note.
	 * @return int|\WP_Error New version number.
	 */
	public static function snapshot( $attachment_id, $note = '' ) {
		$file = get_attached_file( $attachment_id );
		if ( ! $file || ! file_exists( $file ) ) {
			return new \WP_Error( 'wpie_no_file', __( 'Attachment file not found.', 'wunderpaint' ), array( 'status' => 404 ) );
		}

		$counter = max( 1, (int) get_post_meta( $attachment_id, self::META_COUNTER, true ) );
		$n       = $counter;
		$ext     = strtolower( pathinfo( $file, PATHINFO_EXTENSION ) );
		$dir     = self::dir_for( $attachment_id );
		$name    = 'v' . $n . '.' . $ext;

		if ( ! copy( $file, $dir . '/' . $name ) ) {
			return new \WP_Error( 'wpie_copy_failed', __( 'Could not store the previous version.', 'wunderpaint' ), array( 'status' => 500 ) );
		}

		$records   = self::records( $attachment_id );
		$records[] = array(
			'v'        => $n,
			'file'     => $name,
			'savedAt'  => time(),
			'byteSize' => (int) filesize( $dir . '/' . $name ),
			'note'     => (string) $note,
		);
		update_post_meta( $attachment_id, self::META_VERSIONS, $records );
		update_post_meta( $attachment_id, self::META_COUNTER, $counter + 1 );
		self::prune( $attachment_id );

		return $n;
	}

	/**
	 * Prune to the configured number of kept versions.
	 *
	 * @param int $attachment_id Attachment id.
	 */
	public static function prune( $attachment_id ) {
		$settings = Helpers::get_settings();
		$keep     = (int) $settings['versions_to_keep'];
		$records  = self::records( $attachment_id );
		if ( count( $records ) <= $keep ) {
			return;
		}
		$dir     = self::dir_for( $attachment_id );
		$dropped = array_splice( $records, 0, count( $records ) - $keep );
		foreach ( $dropped as $record ) {
			$path = $dir . '/' . basename( $record['file'] );
			if ( file_exists( $path ) ) {
				wp_delete_file( $path );
			}
		}
		update_post_meta( $attachment_id, self::META_VERSIONS, $records );
	}

	/**
	 * REST payload for the versions list (opaque REST URLs only).
	 *
	 * @param int $attachment_id Attachment id.
	 * @return array{current:int,versions:array[]}
	 */
	public static function list_versions( $attachment_id ) {
		$versions = array();
		foreach ( self::records( $attachment_id ) as $record ) {
			$url        = rest_url( WPIE_REST_NS . '/versions/' . $attachment_id . '/' . $record['v'] . '/file' );
			$versions[] = array(
				'v'        => (int) $record['v'],
				'url'      => $url,
				'thumb'    => $url, // Same gated stream; the client scales it.
				'savedAt'  => (int) $record['savedAt'],
				'byteSize' => (int) $record['byteSize'],
				'note'     => isset( $record['note'] ) ? (string) $record['note'] : '',
			);
		}
		return array(
			'current'  => max( 1, (int) get_post_meta( $attachment_id, self::META_COUNTER, true ) ),
			'versions' => $versions,
		);
	}

	/**
	 * Absolute path of a stored version file.
	 *
	 * @param int $attachment_id Attachment id.
	 * @param int $v             Version number.
	 * @return string|\WP_Error
	 */
	public static function version_path( $attachment_id, $v ) {
		foreach ( self::records( $attachment_id ) as $record ) {
			if ( (int) $record['v'] === (int) $v ) {
				$path = self::dir_for( $attachment_id ) . '/' . basename( $record['file'] );
				if ( file_exists( $path ) ) {
					return $path;
				}
			}
		}
		return new \WP_Error( 'wpie_version_missing', __( 'Version not found.', 'wunderpaint' ), array( 'status' => 404 ) );
	}

	/**
	 * Restore a stored version as the current attachment file.
	 * The replaced current file is snapshotted first (spec 08.1).
	 *
	 * @param int $attachment_id Attachment id.
	 * @param int $v             Version number.
	 * @return array|\WP_Error Save-like response payload.
	 */
	public static function restore( $attachment_id, $v ) {
		$path = self::version_path( $attachment_id, $v );
		if ( is_wp_error( $path ) ) {
			return $path;
		}

		$settings = Helpers::get_settings();
		if ( $settings['versioning'] ) {
			$snap = self::snapshot( $attachment_id, 'Replaced by restore of v' . $v );
			if ( is_wp_error( $snap ) ) {
				return $snap;
			}
		}

		$ext    = strtolower( pathinfo( $path, PATHINFO_EXTENSION ) );
		$result = Image_Writer::replace_attachment_file( $attachment_id, file_get_contents( $path ), $ext ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		$result['restored'] = (int) $v;
		return $result;
	}

	/**
	 * Store sidecar project files (JSON and/or PSD) + meta pointers.
	 *
	 * @param int         $attachment_id Attachment id.
	 * @param string|null $json          Project JSON string, or null.
	 * @param string|null $psd_tmp       Temp file path of an uploaded PSD, or null.
	 */
	public static function store_sidecar( $attachment_id, $json = null, $psd_tmp = null ) {
		$dir = self::dir_for( $attachment_id );
		if ( null !== $json && '' !== $json ) {
			\wpie_write_json_file( $dir . '/project.json', $json );
			update_post_meta( $attachment_id, self::META_PROJECT, 'project.json' );
		}
		if ( null !== $psd_tmp && file_exists( $psd_tmp ) ) {
			copy( $psd_tmp, $dir . '/project.psd' );
			update_post_meta( $attachment_id, self::META_PSD, 'project.psd' );
		}
	}

	/**
	 * Absolute path of a sidecar file.
	 *
	 * @param int    $attachment_id Attachment id.
	 * @param string $kind          'json' or 'psd'.
	 * @return string|\WP_Error
	 */
	public static function sidecar_path( $attachment_id, $kind ) {
		$meta = get_post_meta( $attachment_id, 'json' === $kind ? self::META_PROJECT : self::META_PSD, true );
		if ( $meta ) {
			$path = self::dir_for( $attachment_id ) . '/' . basename( $meta );
			if ( file_exists( $path ) ) {
				return $path;
			}
		}
		return new \WP_Error( 'wpie_sidecar_missing', __( 'No stored project file.', 'wunderpaint' ), array( 'status' => 404 ) );
	}

	/**
	 * Delete the whole store + meta for one attachment.
	 *
	 * @param int $attachment_id Attachment id.
	 */
	public static function purge( $attachment_id ) {
		$sub = get_post_meta( $attachment_id, self::META_SUBDIR, true );
		if ( $sub ) {
			self::rrmdir( trailingslashit( \wpie_versions_dir() ) . $attachment_id . '-' . $sub );
		}
		foreach ( array( self::META_VERSIONS, self::META_SUBDIR, self::META_COUNTER, self::META_PROJECT, self::META_PSD ) as $key ) {
			delete_post_meta( $attachment_id, $key );
		}
	}

	/**
	 * Delete the entire version store and all plugin post meta (uninstall).
	 */
	public static function purge_all() {
		global $wpdb;
		$keys = array( self::META_VERSIONS, self::META_SUBDIR, self::META_COUNTER, self::META_PROJECT, self::META_PSD );
		foreach ( $keys as $key ) {
			$wpdb->delete( $wpdb->postmeta, array( 'meta_key' => $key ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.SlowDBQuery.slow_db_query_meta_key -- one-off bulk cleanup of the plugin's own postmeta keys.
		}
		self::rrmdir( \wpie_versions_dir() );
	}

	/**
	 * Recursive directory removal.
	 *
	 * @param string $dir Directory path.
	 */
	private static function rrmdir( $dir ) {
		if ( ! is_dir( $dir ) ) {
			return;
		}
		foreach ( scandir( $dir ) as $entry ) {
			if ( '.' === $entry || '..' === $entry ) {
				continue;
			}
			$path = $dir . '/' . $entry;
			if ( is_dir( $path ) ) {
				self::rrmdir( $path );
			} else {
				wp_delete_file( $path );
			}
		}
		rmdir( $dir ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_rmdir -- Removing an already-emptied directory; WP_Filesystem would require credentials on some hosts.
	}
}
