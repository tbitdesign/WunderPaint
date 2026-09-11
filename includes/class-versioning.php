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
			Helpers::protect_dir( \wpie_versions_dir(), array(), true );
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
	 * @param bool   $prune         Enforce retention now; restore defers it until success.
	 * @return int|\WP_Error New version number.
	 */
	public static function snapshot( $attachment_id, $note = '', $prune = true ) {
		$file = get_attached_file( $attachment_id );
		if ( ! $file || ! file_exists( $file ) ) {
			return new \WP_Error( 'wpie_no_file', __( 'Attachment file not found.', 'wunderpaint' ), array( 'status' => 404 ) );
		}

		$counter = max( 1, (int) get_post_meta( $attachment_id, self::META_COUNTER, true ) );
		$n       = $counter;
		$ext     = strtolower( pathinfo( $file, PATHINFO_EXTENSION ) );
		$dir     = self::dir_for( $attachment_id );
		// The counter is meta and can fall behind the files (a restored
		// backup, a counter reset); the next number used to overwrite an
		// existing version in place. Skip ahead to a name nobody has.
		while ( glob( $dir . '/v' . $n . '.*' ) ) {
			$n++;
		}
		$counter = $n;
		$name    = 'v' . $n . '.' . $ext;

		if ( ! copy( $file, $dir . '/' . $name ) ) {
			return new \WP_Error( 'wpie_copy_failed', __( 'Could not store the previous version.', 'wunderpaint' ), array( 'status' => 500 ) );
		}

		// Keep the exact sidecars with the rendered image. JSON is already
		// compressed at rest and is copied verbatim, just like a PSD.
		$sidecars = array();
		foreach ( array( 'project' => self::META_PROJECT, 'psd' => self::META_PSD ) as $kind => $key ) {
			$active = get_post_meta( $attachment_id, $key, true );
			if ( ! $active ) {
				continue;
			}
			$source = $dir . '/' . basename( $active );
			if ( ! is_file( $source ) ) {
				// Stale pointer, the sidecar itself is gone (a moved site, a
				// partial backup import): nothing to preserve, and a missing
				// file must not block every save of this image.
				continue;
			}
			$target = 'v' . $n . '-project.' . ( 'project' === $kind ? 'json' : 'psd' );
			if ( ! self::copy_complete( $source, $dir . '/' . $target ) ) {
				foreach ( array_merge( array( $name ), array_values( $sidecars ) ) as $written ) {
					wp_delete_file( $dir . '/' . $written );
				}
				return new \WP_Error( 'wpie_copy_failed', __( 'Could not store the previous version.', 'wunderpaint' ), array( 'status' => 500 ) );
			}
			$sidecars[ $kind ] = $target;
		}

		$records   = self::records( $attachment_id );
		$records[] = array_merge( array(
			'v'        => $n,
			'file'     => $name,
			'savedAt'  => time(),
			'byteSize' => (int) filesize( $dir . '/' . $name ),
			'note'     => (string) $note,
		), $sidecars );
		// wp_slash(): update_metadata() unslashes the WHOLE array, so without
		// it every save stripped one backslash level from every note already
		// in the list, not just from the new one.
		update_post_meta( $attachment_id, self::META_VERSIONS, wp_slash( $records ) );
		update_post_meta( $attachment_id, self::META_COUNTER, $counter + 1 );
		if ( $prune ) {
			self::prune( $attachment_id );
		}

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
			foreach ( array( 'file', 'project', 'psd' ) as $key ) {
				if ( ! empty( $record[ $key ] ) ) {
					wp_delete_file( $dir . '/' . basename( $record[ $key ] ) );
				}
			}
		}
		// wp_slash(): update_metadata() unslashes the WHOLE array, so without
		// it every save stripped one backslash level from every note already
		// in the list, not just from the new one.
		update_post_meta( $attachment_id, self::META_VERSIONS, wp_slash( $records ) );
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
		$bytes = file_get_contents( $path ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
		if ( false === $bytes || '' === $bytes ) {
			return new \WP_Error( 'wpie_version_unreadable', __( 'The stored version could not be read.', 'wunderpaint' ), array( 'status' => 500 ) );
		}

		$record = array();
		foreach ( self::records( $attachment_id ) as $candidate ) {
			if ( (int) $candidate['v'] === (int) $v ) {
				$record = $candidate;
				break;
			}
		}
		$dir    = self::dir_for( $attachment_id );
		$staged = array();
		$keys   = array( 'project' => self::META_PROJECT, 'psd' => self::META_PSD );
		try {
			// Fresh files become the active sidecars only AFTER the image was
			// written. They do not belong to the version being pruned below.
			foreach ( $keys as $kind => $key ) {
				if ( empty( $record[ $kind ] ) ) {
					continue;
				}
				$filename = 'project-' . wp_generate_password( 16, false, false ) . '.' . ( 'project' === $kind ? 'json' : 'psd' );
				if ( ! self::copy_complete( $dir . '/' . basename( $record[ $kind ] ), $dir . '/' . $filename ) ) {
					return new \WP_Error( 'wpie_version_unreadable', __( 'The stored version could not be read.', 'wunderpaint' ), array( 'status' => 500 ) );
				}
				$staged[ $key ] = $filename;
			}

			$settings = Helpers::get_settings();
			if ( $settings['versioning'] ) {
				// Retain every recovery source until the restore succeeds.
				$snap = self::snapshot( $attachment_id, 'Replaced by restore of v' . $v, false );
				if ( is_wp_error( $snap ) ) {
					return $snap;
				}
			}
			$ext    = strtolower( pathinfo( $path, PATHINFO_EXTENSION ) );
			$result = Image_Writer::replace_attachment_file( $attachment_id, $bytes, $ext );
			if ( is_wp_error( $result ) ) {
				return $result;
			}

			foreach ( $keys as $key ) {
				$old = get_post_meta( $attachment_id, $key, true );
				if ( isset( $staged[ $key ] ) ) {
					update_post_meta( $attachment_id, $key, $staged[ $key ] );
				} else {
					// Legacy versions had no project. Reopen their flat image,
					// never the newer sidecar that would undo the restoration.
					delete_post_meta( $attachment_id, $key );
				}
				self::remove_active_sidecar( $dir, $old );
			}
			$staged = array(); // These files are now active, not temporary.
			self::prune( $attachment_id );
			$result['restored'] = (int) $v;
			return $result;
		} finally {
			foreach ( $staged as $filename ) {
				wp_delete_file( $dir . '/' . $filename );
			}
		}
	}

	/** Copy a whole sidecar or leave no partial destination behind. */
	private static function copy_complete( $source, $target ) {
		if ( ! is_file( $source ) || ! is_readable( $source ) || ! copy( $source, $target ) ) {
			wp_delete_file( $target );
			return false;
		}
		clearstatcache( true, $target );
		if ( filesize( $source ) !== filesize( $target ) ) {
			wp_delete_file( $target );
			return false;
		}
		return true;
	}

	/** Remove only our active project files, never an immutable version. */
	private static function remove_active_sidecar( $dir, $filename ) {
		if ( is_string( $filename ) && preg_match( '/^project(?:-[a-zA-Z0-9]+)?\.(json|psd)$/D', $filename ) ) {
			wp_delete_file( $dir . '/' . $filename );
		}
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
			if ( \wpie_write_json_file( $dir . '/project.json', $json ) ) {
				$old = get_post_meta( $attachment_id, self::META_PROJECT, true );
				update_post_meta( $attachment_id, self::META_PROJECT, 'project.json' );
				if ( 'project.json' !== $old ) {
					self::remove_active_sidecar( $dir, $old );
				}
			}
		}
		if ( null !== $psd_tmp && file_exists( $psd_tmp ) ) {
			if ( self::copy_complete( $psd_tmp, $dir . '/project.psd' ) ) {
				$old = get_post_meta( $attachment_id, self::META_PSD, true );
				update_post_meta( $attachment_id, self::META_PSD, 'project.psd' );
				if ( 'project.psd' !== $old ) {
					self::remove_active_sidecar( $dir, $old );
				}
			}
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
		$sub = (string) get_post_meta( $attachment_id, self::META_SUBDIR, true );
		// The same rule as dir_for(): the meta is a path segment, and a value
		// from an imported archive could traverse. Only plain alphanumerics
		// name a store; anything else is not ours to delete.
		if ( '' !== $sub && preg_match( '/^[a-zA-Z0-9]+$/', $sub ) ) {
			self::rrmdir( trailingslashit( \wpie_versions_dir() ) . (int) $attachment_id . '-' . $sub );
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
		// Never outside the version store, whatever the caller was handed.
		$real = realpath( $dir );
		$root = realpath( \wpie_versions_dir() );
		if ( ! $real || ! $root || 0 !== strpos( $real, $root ) ) {
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
