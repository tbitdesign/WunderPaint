<?php
/**
 * Replace an image in place.
 *
 * New bytes, same attachment id, so every reference on the site keeps working.
 * Two modes, and the difference matters:
 *
 *   keep  the filename stays, so no URL anywhere has to change. Caches will
 *         happily serve the old picture though, which is why the attachment
 *         gets a version stamp that our own URLs append as `?ver=`.
 *
 *   new   the filename changes, and only the places the usage engine actually
 *         found get rewritten. Deliberately not a global search and replace:
 *         that fixes the database and leaves every JSON and CSS file under
 *         uploads pointing at a file that no longer exists.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Swap the file behind an attachment.
 */
class Media_Replace {

	/** Bumped on every replace, used as a cache buster. */
	const VER_META = '_wpie_replaced';

	/**
	 * Register hooks.
	 */
	public function hooks() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	/**
	 * Replace the file behind an attachment with an uploaded one.
	 *
	 * @param int    $target Attachment to replace.
	 * @param int    $source Attachment holding the new file. It is consumed.
	 * @param string $mode   'keep' or 'new'.
	 * @return array|\WP_Error
	 */
	public static function replace( $target, $source, $mode = 'keep' ) {
		$target = (int) $target;
		$source = (int) $source;

		if ( 'attachment' !== get_post_type( $target ) || 'attachment' !== get_post_type( $source ) ) {
			return new \WP_Error( 'wpie_bad_target', __( 'Both images must exist in the library.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		if ( ! current_user_can( 'edit_post', $target ) ) {
			return new \WP_Error( 'wpie_denied', __( 'You cannot edit this image.', 'wunderpaint' ), array( 'status' => 403 ) );
		}

		$old_file = get_attached_file( $target );
		$new_file = get_attached_file( $source );
		if ( ! $old_file || ! $new_file || ! file_exists( $new_file ) ) {
			return new \WP_Error( 'wpie_no_file', __( 'The replacement file is missing.', 'wunderpaint' ), array( 'status' => 400 ) );
		}

		require_once ABSPATH . 'wp-admin/includes/image.php';

		$resolver = Media_Usage::resolver();
		$old_rel  = (string) get_post_meta( $target, '_wp_attached_file', true );
		$old_url  = wp_get_attachment_url( $target );

		// Sweep the generated sizes of the old file before anything moves, or
		// they linger as orphans forever.
		self::delete_sizes( $target );

		if ( 'new' === $mode ) {
			$dest = trailingslashit( dirname( $old_file ) ) . wp_unique_filename( dirname( $old_file ), wp_basename( $new_file ) );
		} else {
			// "Keep the filename" has to mean the whole filename. Swapping a
			// JPEG for a PNG and keeping only the stem would rename foo.jpg to
			// foo.png, which changes every URL and breaks exactly the promise
			// this mode makes. The client converts to the original format
			// before uploading; if something else calls this, refuse rather
			// than quietly break the site.
			$old_ext = strtolower( (string) pathinfo( $old_file, PATHINFO_EXTENSION ) );
			$new_ext = strtolower( (string) pathinfo( $new_file, PATHINFO_EXTENSION ) );
			if ( ! self::same_format( $old_ext, $new_ext ) ) {
				wp_delete_attachment( $source, true );
				return new \WP_Error(
					'wpie_format_mismatch',
					sprintf(
						/* translators: 1: current file extension, 2: new file extension. */
						__( 'Keeping the filename needs the same format: this image is %1$s and the new file is %2$s. Convert it first, or choose the new filename instead.', 'wunderpaint' ),
						strtoupper( $old_ext ),
						strtoupper( $new_ext )
					),
					array( 'status' => 400 )
				);
			}
			$stem = pathinfo( $old_file, PATHINFO_FILENAME );
			$dest = trailingslashit( dirname( $old_file ) ) . $stem . '.' . $old_ext;
			if ( file_exists( $dest ) && $dest !== $old_file ) {
				wp_delete_file( $dest );
			}
		}

		if ( ! @copy( $new_file, $dest ) ) { // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.copy_copy -- reported to the caller.
			return new \WP_Error( 'wpie_copy_failed', __( 'The file could not be written.', 'wunderpaint' ), array( 'status' => 500 ) );
		}
		if ( $old_file !== $dest && file_exists( $old_file ) ) {
			wp_delete_file( $old_file );
		}

		$uploads = wp_get_upload_dir();
		$new_rel = ltrim( str_replace( trailingslashit( $uploads['basedir'] ), '', $dest ), '/' );
		update_post_meta( $target, '_wp_attached_file', $new_rel );
		wp_update_attachment_metadata( $target, wp_generate_attachment_metadata( $target, $dest ) );
		wp_update_post(
			array(
				'ID'             => $target,
				'post_mime_type' => (string) get_post_mime_type( $source ),
			)
		);
		update_post_meta( $target, self::VER_META, time() );

		// The replacement carrier has done its job.
		wp_delete_attachment( $source, true );

		$rewritten = 0;
		if ( 'new' === $mode && $old_rel !== $new_rel ) {
			$rewritten = self::rewrite_references( $target, $old_url, (string) $old_rel, $resolver );
			if ( is_wp_error( $rewritten ) ) {
				// The new file is already in place; what failed is pointing the
				// old references at it. Saying so beats reporting success and
				// leaving posts on a file the user believes was replaced.
				Media_Usage::mark_dirty();
				return $rewritten;
			}
		}

		Media_Usage::mark_dirty();

		return array(
			'ok'        => true,
			'id'        => $target,
			'url'       => wp_get_attachment_url( $target ),
			'mode'      => $mode,
			'rewritten' => $rewritten,
		);
	}

	/**
	 * Do two extensions describe the same image format?
	 *
	 * `jpg` and `jpeg` are the same file, and treating them as different would
	 * block a perfectly ordinary replacement.
	 *
	 * @param string $a First extension, lower case.
	 * @param string $b Second extension, lower case.
	 * @return bool
	 */
	private static function same_format( $a, $b ) {
		$norm = static function ( $ext ) {
			return in_array( $ext, array( 'jpeg', 'jpe' ), true ) ? 'jpg' : $ext;
		};
		return $norm( $a ) === $norm( $b );
	}

	/**
	 * Remove the generated sizes of an attachment, leaving the original alone.
	 *
	 * @param int $id Attachment.
	 * @return void
	 */
	private static function delete_sizes( $id ) {
		$meta = wp_get_attachment_metadata( $id );
		if ( ! is_array( $meta ) || empty( $meta['sizes'] ) ) {
			return;
		}
		$dir = dirname( (string) get_attached_file( $id ) );
		foreach ( $meta['sizes'] as $size ) {
			if ( empty( $size['file'] ) ) {
				continue;
			}
			$path = trailingslashit( $dir ) . $size['file'];
			if ( file_exists( $path ) ) {
				wp_delete_file( $path );
			}
		}
	}

	/**
	 * Point the places that referenced the old filename at the new one.
	 *
	 * Only the objects the usage engine reports are touched, and only in their
	 * own content or meta. Nothing else on the site is rewritten.
	 *
	 * @param int            $id       Attachment.
	 * @param string         $old_url  Previous URL.
	 * @param string         $old_rel  Previous uploads-relative path.
	 * @param Usage_Resolver $resolver Resolver.
	 * @return int|\WP_Error Number of rows changed, or an error when a write
	 *                       failed and the count would overstate the result.
	 */
	private static function rewrite_references( $id, $old_url, $old_rel, $resolver ) {
		global $wpdb;

		$new_url = (string) wp_get_attachment_url( $id );
		$new_rel = (string) get_post_meta( $id, '_wp_attached_file', true );
		if ( '' === $old_rel || $old_rel === $new_rel ) {
			return 0;
		}

		$old_base = wp_basename( $old_rel );
		$new_base = wp_basename( $new_rel );
		$changed = 0;
		$failed  = array();

		// The places the engine knows about, as post ids.
		$posts = array();
		foreach ( Media_Usage::find_for( $id ) as $place ) {
			if ( ! empty( $place['obj'] ) && in_array( $place['src'], array( 'content', 'postmeta' ), true ) ) {
				$posts[ (int) $place['obj'] ] = true;
			}
		}
		if ( ! $posts ) {
			return 0;
		}

		foreach ( array_keys( $posts ) as $post_id ) {
			$post = get_post( $post_id );
			if ( ! $post ) {
				continue;
			}
			$content = str_replace( array( $old_url, $old_rel, $old_base ), array( $new_url, $new_rel, $new_base ), $post->post_content );
			if ( $content !== $post->post_content ) {
				// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- wp_update_post would run the content through kses and reformat builder markup.
				$written = $wpdb->update( $wpdb->posts, array( 'post_content' => $content ), array( 'ID' => $post_id ) );
				// A write that quietly did nothing must not be counted as a
				// replacement, otherwise the report says the old file is no
				// longer referenced anywhere while it still is.
				if ( false === $written ) {
					$failed[] = $post_id;
				} else {
					clean_post_cache( $post_id );
					++$changed;
				}
			}

			foreach ( get_post_meta( $post_id ) as $key => $values ) {
				if ( '_wp_attached_file' === $key || '_wp_attachment_metadata' === $key ) {
					continue;
				}
				foreach ( (array) $values as $raw ) {
					if ( ! is_string( $raw ) || false === strpos( $raw, $old_base ) ) {
						continue;
					}
					// Slash-escaped JSON needs the escaped form replaced too.
					$updated = str_replace(
						array( $old_url, str_replace( '/', '\\/', $old_url ), $old_rel, $old_base ),
						array( $new_url, str_replace( '/', '\\/', $new_url ), $new_rel, $new_base ),
						$raw
					);
					if ( $updated !== $raw ) {
						update_post_meta( $post_id, $key, $updated, $raw );
						++$changed;
					}
				}
			}
		}
		if ( $failed ) {
			// The caller reports how many places were rewritten. Silently
			// dropping the ones that failed would turn a partial rewrite into
			// a clean bill of health.
			return new \WP_Error(
				'wpie_replace_incomplete',
				sprintf(
					/* translators: %d: number of posts. */
					_n(
						'The reference in %d post could not be rewritten.',
						'The references in %d posts could not be rewritten.',
						count( $failed ),
						'wunderpaint'
					),
					count( $failed )
				),
				array(
					'status'  => 500,
					'changed' => $changed,
					'posts'   => $failed,
				)
			);
		}

		return $changed;
	}

	/**
	 * REST route.
	 */
	public function register_routes() {
		register_rest_route(
			WPIE_REST_NS,
			'/media-replace',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'rest_replace' ),
				'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
			)
		);
	}

	/**
	 * POST /media-replace
	 *
	 * @param \WP_REST_Request $req Request.
	 * @return array|\WP_Error
	 */
	public function rest_replace( \WP_REST_Request $req ) {
		$mode = 'new' === $req->get_param( 'mode' ) ? 'new' : 'keep';
		return self::replace( (int) $req->get_param( 'id' ), (int) $req->get_param( 'source' ), $mode );
	}
}
