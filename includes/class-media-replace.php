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

		// The source is consumed, even on some error paths. Authorize it
		// independently before touching either attachment.
		if ( $target === $source ) {
			return new \WP_Error( 'wpie_same_image', __( 'Choose a different replacement image.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		if ( ! current_user_can( 'edit_post', $source ) || ! current_user_can( 'delete_post', $source ) ) {
			return new \WP_Error( 'wpie_denied', __( 'You cannot use this replacement image.', 'wunderpaint' ), array( 'status' => 403 ) );
		}

		$old_file = get_attached_file( $target );
		$new_file = get_attached_file( $source );
		if ( ! $old_file || ! $new_file || ! file_exists( $new_file ) ) {
			return new \WP_Error( 'wpie_no_file', __( 'The replacement file is missing.', 'wunderpaint' ), array( 'status' => 400 ) );
		}

		require_once ABSPATH . 'wp-admin/includes/image.php';

		$old_rel = (string) get_post_meta( $target, '_wp_attached_file', true );
		$old_url = (string) wp_get_attachment_url( $target );
		// The generated sizes of the OLD file, read while the metadata still
		// describes it. rewrite_references() needs them: a post that embeds
		// foto-300x200.jpg does not contain the string foto.jpg, and every
		// one of those files is deleted further down. The rewrite used to
		// know only the full-size name, so a published image came back as a
		// broken one after a perfectly ordinary replacement (Codex C06).
		// WordPress' retained original (foto.jpg beside foto-scaled.jpg)
		// rides along under a key of its own.
		$old_meta  = wp_get_attachment_metadata( $target );
		$old_sizes = is_array( $old_meta ) ? (array) ( $old_meta['sizes'] ?? array() ) : array();
		if ( is_array( $old_meta ) && ! empty( $old_meta['original_image'] ) ) {
			$old_sizes['wpie_original'] = array( 'file' => (string) $old_meta['original_image'] );
		}

		/*
		 * PHASE 1: decide everything while the old file is still intact.
		 *
		 * The old order did the opposite. It deleted the generated sizes
		 * first, THEN checked the format, THEN copied, and looked up who
		 * references the image LAST. Every one of those steps could fail
		 * after the previous one had already destroyed something, and the
		 * reference lookup ran against the new filename, so it could not find
		 * the places that still carried the old one. Nothing below this block
		 * destroys; nothing above it writes.
		 */
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
				// The carrier STAYS. The message tells the person they can
				// "choose the new filename instead" - and that needs exactly
				// the upload that was being deleted here, so the advice cost
				// them a second upload. The permission failure further down
				// already leaves the source alone; this path did not.
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
			// The extension is compared in lower case and then REUSED as the
			// new name, and that is the bug: WordPress only lower-cases
			// extensions since 5.8, so an older upload or an import is called
			// Foto.JPG, and "keep the filename" renamed it to Foto.jpg and
			// deleted the original. On a case-sensitive filesystem every
			// reference to Foto.JPG then pointed at nothing - and in this mode
			// rewrite_references() deliberately never runs, so nothing was
			// pointed anywhere. The one mode whose entire promise is "the URL
			// does not change" was the one that changed it.
			$stem     = pathinfo( $old_file, PATHINFO_FILENAME );
			$keep_ext = (string) pathinfo( $old_file, PATHINFO_EXTENSION );
			$dest     = trailingslashit( dirname( $old_file ) ) . $stem . '.' . $keep_ext;
		}

		/*
		 * Only a RENAME makes references stale, and only a rename therefore
		 * has any business writing into somebody else's post: in `keep` mode
		 * `_wp_attached_file` does not change, rewrite_references() bails out
		 * at its first line and no foreign row is touched at all.
		 *
		 * So the authorization question belongs here, and only here. It is
		 * asked per POST, not as one blanket capability: `edit_post` on each
		 * affected object is the exact authority WordPress defines for
		 * changing it, and it lets an author who owns everything the image
		 * appears in keep working. If a single object is out of reach the
		 * whole replacement is refused BEFORE anything moves - a partial
		 * rewrite would leave posts pointing at a file that no longer exists.
		 */
		$targets = array();
		if ( 'new' === $mode ) {
			$targets = self::reference_targets( $target );
			if ( is_wp_error( $targets ) ) {
				// The replacement image stays. The refusal tells the user to
				// keep the filename instead, and that retry needs exactly this
				// file - consuming it would make our own advice impossible.
				return $targets;
			}
		}

		// The old bytes and the layer project that describes them are kept as
		// a restorable version before they stop existing. Without this the
		// active _wpie_project still described the OLD picture, and the next
		// save in the editor would write that design back over the new file.
		$kept = Versioning::snapshot( $target, __( 'Before replacing the file', 'wunderpaint' ) );
		if ( is_wp_error( $kept ) ) {
			// Nothing has changed yet and the retry needs the carrier.
			return $kept;
		}

		/*
		 * PHASE 2: write the new bytes first, destroy the old ones after.
		 *
		 * Into a neighbour file, verified by length, then renamed into place.
		 * rename() replaces the target in one step on the same filesystem, so
		 * there is no moment in which the URL points at nothing - and a
		 * failure at any point here leaves the old image exactly as it was.
		 */
		/*
		 * A name of this run's own, not a fixed one.
		 *
		 * `$dest . '.wpie-incoming'` is the same string for the same target,
		 * so two replacements of one attachment wrote into the SAME file: A
		 * copies, B copies over it, A compares the lengths, and if they happen
		 * to match A renames B's bytes into place, reports success and deletes
		 * B's carrier. The wrong picture goes live and nothing says so. When
		 * the lengths differ, A deletes the file B is writing and both end in
		 * a 500. The comment above promises "a failure at any point here
		 * leaves the old image exactly as it was", and under concurrency that
		 * was not true.
		 *
		 * Both in-house precedents use a unique name: wpie_write_json_file()
		 * (uniqid) and Image_Writer::replace_attachment_file() (wp_tempnam).
		 * The leftover also mattered: `<public-name>.wpie-incoming` sat in a
		 * web-reachable uploads folder, nothing ever swept it, and
		 * Media_Orphans::EXT does not know the extension, so the orphan scan
		 * never saw it either.
		 */
		$tmp = $dest . '.' . uniqid( '', true ) . '.wpie-incoming';
		if ( ! @copy( $new_file, $tmp ) ) { // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.copy_copy -- reported to the caller.
			return new \WP_Error( 'wpie_copy_failed', __( 'The file could not be written.', 'wunderpaint' ), array( 'status' => 500 ) );
		}
		clearstatcache( true, $tmp );
		if ( filesize( $tmp ) !== filesize( $new_file ) ) {
			wp_delete_file( $tmp );
			return new \WP_Error( 'wpie_copy_failed', __( 'The file could not be written completely.', 'wunderpaint' ), array( 'status' => 500 ) );
		}
		if ( ! @rename( $tmp, $dest ) ) { // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.rename_rename -- reported to the caller.
			wp_delete_file( $tmp );
			return new \WP_Error( 'wpie_copy_failed', __( 'The file could not be put in place.', 'wunderpaint' ), array( 'status' => 500 ) );
		}
		// Now, and only now, the old derivatives may go. Their names come from
		// the still-unchanged attachment metadata.
		self::delete_sizes( $target );
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

		// The layer project and the PSD sidecar described the bytes that are
		// now gone. Both were just preserved as a version, so the work is not
		// lost - but they must stop being the ACTIVE content of this
		// attachment, or the editor would keep opening the old design and the
		// next save would write it back over the replacement.
		delete_post_meta( $target, Versioning::META_PROJECT );
		delete_post_meta( $target, Versioning::META_PSD );

		// The replacement carrier has done its job.
		wp_delete_attachment( $source, true );

		$rewritten = 0;
		$posts     = array();
		if ( 'new' === $mode && $old_rel !== $new_rel && $targets ) {
			$done = self::rewrite_references( $targets, $old_url, (string) $old_rel, $target, $old_sizes );
			if ( is_wp_error( $done ) ) {
				// The new file is already in place; what failed is pointing the
				// old references at it. Saying so beats reporting success and
				// leaving posts on a file the user believes was replaced.
				Media_Usage::mark_dirty();
				return $done;
			}
			$rewritten = $done['changed'];
			$posts     = $done['posts'];
		}

		Media_Usage::mark_dirty();

		return array(
			'ok'        => true,
			'id'        => $target,
			'url'       => wp_get_attachment_url( $target ),
			'mode'      => $mode,
			'rewritten' => $rewritten,
			// Which objects were changed, so the caller can say so. A rename
			// edits other people's posts without leaving a revision behind;
			// the least it can do is name them.
			'posts'     => array_values( $posts ),
			// The version the previous image was kept as, so the client can
			// offer "put the old one back" instead of only apologising.
			'version'   => (int) $kept,
		);
	}

	/**
	 * The posts a rename would have to rewrite, once it is established that
	 * the current user may rewrite every one of them.
	 *
	 * Must be called while `_wp_attached_file` still holds the OLD path: the
	 * usage engine derives its search terms from it, so asking afterwards asks
	 * for the new name and finds nothing.
	 *
	 * Fails CLOSED and as a whole. Rewriting only the reachable half would
	 * leave the rest pointing at a file this call is about to delete, and the
	 * write goes straight to the posts table on purpose (kses would reformat
	 * builder markup), so there is no revision to undo it with.
	 *
	 * @param int $id Attachment about to be renamed.
	 * @return int[]|\WP_Error Post ids, or an error naming what is out of reach.
	 */
	private static function reference_targets( $id ) {
		$posts  = array();
		$denied = array();
		// The batch contract, not the display helper. Media_Usage::find_for()
		// turns a failed or cut-off query into whatever was found so far, and
		// for a list on screen that is the right answer. Here it read as "no
		// references", and the rename went ahead with the references unknown -
		// the old URL stayed in every post while its file was deleted (Codex
		// C08). A rename that cannot know what it would break does not
		// happen; the message says so, and the replacement image stays.
		$found = Media_Usage::find_for_many( array( (int) $id ) );
		if ( is_wp_error( $found ) ) {
			return new \WP_Error(
				'wpie_replace_unknown',
				sprintf(
					/* translators: %s: the reason the reference search failed. */
					__( 'The places this image is used could not be determined (%s), so its filename was not changed. Try again, or keep the filename.', 'wunderpaint' ),
					$found->get_error_message()
				),
				array(
					'status' => 500,
					'cause'  => $found->get_error_code(),
				)
			);
		}
		foreach ( (array) ( $found[ (int) $id ] ?? array() ) as $place ) {
			if ( empty( $place['obj'] ) || ! in_array( $place['src'], array( 'content', 'postmeta' ), true ) ) {
				continue;
			}
			$post_id = (int) $place['obj'];
			if ( isset( $posts[ $post_id ] ) || isset( $denied[ $post_id ] ) ) {
				continue;
			}
			if ( ! get_post( $post_id ) ) {
				continue;
			}
			if ( current_user_can( 'edit_post', $post_id ) ) {
				$posts[ $post_id ] = $post_id;
			} else {
				$denied[ $post_id ] = $post_id;
			}
		}
		if ( $denied ) {
			return new \WP_Error(
				'wpie_replace_forbidden',
				sprintf(
					/* translators: %d: number of posts the user may not edit. */
					_n(
						'This image is used in %d entry you are not allowed to edit, so its filename cannot be changed. Keep the filename instead, or ask someone who may edit it.',
						'This image is used in %d entries you are not allowed to edit, so its filename cannot be changed. Keep the filename instead, or ask someone who may edit them.',
						count( $denied ),
						'wunderpaint'
					),
					count( $denied )
				),
				array(
					'status' => rest_authorization_required_code(),
					'posts'  => array_values( $denied ),
				)
			);
		}
		return array_values( $posts );
	}

	/**
	 * Replace strings anywhere inside a decoded meta value.
	 *
	 * Objects are left alone on purpose: an unserialized meta can carry a
	 * class this plugin knows nothing about, and quietly reaching into one is
	 * worse than missing a reference in it.
	 *
	 * @param mixed    $value   Decoded value.
	 * @param string[] $search  Needles.
	 * @param string[] $replace Replacements.
	 * @param int      $depth   Recursion guard.
	 * @return mixed Value with its string leaves rewritten.
	 */
	private static function replace_deep( $value, $map, $depth = 0 ) {
		if ( $depth > 8 ) {
			return $value;
		}
		if ( is_string( $value ) ) {
			return strtr( $value, $map );
		}
		if ( is_array( $value ) ) {
			$out = array();
			foreach ( $value as $key => $item ) {
				$out[ $key ] = self::replace_deep( $item, $map, $depth + 1 );
			}
			return $out;
		}
		return $value;
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
	 * Only the objects the usage engine reported are touched, and only in
	 * their own content or meta. Nothing else on the site is rewritten.
	 *
	 * The list is passed IN rather than looked up here, and that is the whole
	 * point: this runs after the rename, when `_wp_attached_file` already
	 * holds the new path. The usage engine builds its search terms from that
	 * value, so asking it now would ask for the new name - and every entry
	 * that still carries the old one, the ones this function exists for,
	 * would come back empty. reference_targets() asks beforehand, and has
	 * already established that the current user may edit every one of them.
	 *
	 * @param int[]  $posts     Post ids to rewrite, pre-authorized.
	 * @param string $old_url   Previous URL.
	 * @param string $old_rel   Previous uploads-relative path.
	 * @param int    $id        Attachment.
	 * @param array  $old_sizes The `sizes` of the previous metadata (name =>
	 *                          array with `file`), read before they were
	 *                          deleted.
	 * @return array{changed:int,posts:int[]}|\WP_Error Counts, or an error
	 *                       when a write failed and the count would overstate
	 *                       the result.
	 */
	private static function rewrite_references( $posts, $old_url, $old_rel, $id, $old_sizes = array() ) {
		global $wpdb;

		$new_url = (string) wp_get_attachment_url( $id );
		$new_rel = (string) get_post_meta( $id, '_wp_attached_file', true );
		$empty   = array(
			'changed' => 0,
			'posts'   => array(),
		);
		if ( '' === $old_rel || $old_rel === $new_rel || ! $posts ) {
			return $empty;
		}

		$old_base = wp_basename( $old_rel );
		$new_base = wp_basename( $new_rel );
		$changed  = 0;
		$failed   = array();

		// The generated sizes, by size name: foto-300x200.jpg becomes
		// neu-300x200.jpg where the new image has that size, and the new full
		// image where it does not (a smaller replacement has fewer sizes, and
		// a URL pointing at a deleted file helps nobody). The directory never
		// changes - the new file is written beside the old one - so the bare
		// file name is the form that matches every URL, path and JSON string
		// at once. These go FIRST: they are the longer, more specific names.
		$new_meta   = wp_get_attachment_metadata( $id );
		$new_sizes  = is_array( $new_meta ) ? (array) ( $new_meta['sizes'] ?? array() ) : array();
		$size_old   = array();
		$size_new   = array();
		foreach ( (array) $old_sizes as $name => $size ) {
			$of = (string) ( $size['file'] ?? '' );
			if ( '' === $of || $of === $old_base ) {
				continue;
			}
			$nf = 'wpie_original' === $name
				? (string) ( $new_meta['original_image'] ?? '' )
				: (string) ( $new_sizes[ $name ]['file'] ?? '' );
			if ( '' === $nf ) {
				$nf = $new_base;
			}
			if ( $of === $nf || in_array( $of, $size_old, true ) ) {
				continue;
			}
			$size_old[] = $of;
			$size_new[] = $nf;
		}

		// Every form the old file can appear in, including the slash-escaped
		// one that JSON payloads such as _elementor_data are stored in.
		//
		// ONE map, applied in ONE pass with strtr(): str_replace() with two
		// arrays walks the pairs one after another over the text, and the
		// later, shorter pair `foto.jpg` then found its own earlier result
		// `neu-foto.jpg` and made it `neu-neu-foto.jpg`, a file that does
		// not exist (Codex N01, the same evening the size pairs came in).
		// strtr() tries the longest key first and never looks at replaced
		// text again.
		$map = array();
		foreach ( $size_old as $i => $of ) {
			$map[ $of ] = $size_new[ $i ];
		}
		$map[ $old_url ]                               = $new_url;
		$map[ str_replace( '/', '\\/', $old_url ) ] = str_replace( '/', '\\/', $new_url );
		$map[ $old_rel ]                               = $new_rel;
		$map[ $old_base ]                              = $new_base;
		unset( $map[''] );
		$touched = array();

		foreach ( $posts as $post_id ) {
			$post = get_post( $post_id );
			if ( ! $post ) {
				continue;
			}
			$content = strtr( $post->post_content, $map );
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
					$touched[ $post_id ] = $post_id;
				}
			}

			/*
			 * Meta is read PER KEY, so WordPress hands over the decoded value
			 * instead of the raw row. Reading them all at once
			 * (`get_post_meta( $post_id )`) returns the raw database strings:
			 * a serialized array arrives as serialized TEXT, and str_replace
			 * on that shifts the payload without touching the `s:NN:` length
			 * in front of it - the value is corrupt from that moment on. The
			 * same call then wrote the raw string back through
			 * update_post_meta(), which unslashes it, and _elementor_data is
			 * stored slash-escaped: one pass stripped every backslash out of
			 * the JSON and the page layout was gone. Both were silent.
			 */
			foreach ( array_keys( get_post_meta( $post_id ) ) as $key ) {
				if ( '_wp_attached_file' === $key || '_wp_attachment_metadata' === $key ) {
					continue;
				}
				// Each distinct value once. update_post_meta() with a previous
				// value updates EVERY row that holds it, so two identical rows
				// under one key (a gallery meta repeating an image id is the
				// normal case) were handled on the first pass and the second
				// pass then found nothing to change: $wpdb->update returned 0,
				// update_metadata answered false, and the whole replacement
				// reported wpie_replace_incomplete with HTTP 500 - after
				// rewriting every reference correctly.
				$seen_values = array();
				foreach ( (array) get_post_meta( $post_id, $key, false ) as $value ) {
					$fingerprint = md5( (string) maybe_serialize( $value ) );
					if ( isset( $seen_values[ $fingerprint ] ) ) {
						continue;
					}
					$seen_values[ $fingerprint ] = true;
					$updated                     = self::replace_deep( $value, $map );
					if ( $updated === $value ) {
						continue;
					}
					// wp_slash() because update_metadata() unslashes, and the
					// previous value goes in unserialized so that WordPress
					// serializes it back into exactly the stored form when it
					// builds the WHERE clause.
					if ( false === update_post_meta( $post_id, $key, wp_slash( $updated ), $value ) ) {
						$failed[] = $post_id;
					} else {
						++$changed;
						$touched[ $post_id ] = $post_id;
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

		return array(
			'changed' => $changed,
			'posts'   => array_values( $touched ),
		);
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
