<?php
/**
 * Decode uploaded blobs → attachment files (+ metadata, thumbnails, versions).
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Save / Save-As handlers.
 */
class Image_Writer {

	/**
	 * Allowed output formats → MIME types.
	 *
	 * @return array<string,string>
	 */
	public static function formats() {
		return array(
			'png'  => 'image/png',
			'jpeg' => 'image/jpeg',
			'jpg'  => 'image/jpeg',
			'webp' => 'image/webp',
			'avif' => 'image/avif',
			'psd'  => 'image/vnd.adobe.photoshop',
			// v1.234: the Pro automation can store a print-ready PDF of the
			// finished design alongside the image.
			'pdf'  => 'application/pdf',
		);
	}

	/**
	 * REST runs on the front controller: pull in the wp-admin includes that
	 * define wp_generate_attachment_metadata() etc. (spec 08.1, required).
	 */
	private static function require_admin_includes() {
		require_once ABSPATH . 'wp-admin/includes/image.php';
		require_once ABSPATH . 'wp-admin/includes/media.php';
		require_once ABSPATH . 'wp-admin/includes/file.php';
	}

	/**
	 * Extract the uploaded image bytes from a request (multipart file or dataUrl).
	 *
	 * @param \WP_REST_Request $request Request.
	 * @param string           $field   File field name.
	 * @return array{bytes:string,ext:string,mime:string}|\WP_Error
	 */
	public static function read_blob( \WP_REST_Request $request, $field = 'file' ) {
		$max   = wp_max_upload_size();
		$bytes = null;

		$files = $request->get_file_params();
		// PHP silently discards uploads above upload_max_filesize (leaving
		// only an error code); report that precisely instead of "no data".
		if ( isset( $files[ $field ]['error'] )
			&& ! in_array( (int) $files[ $field ]['error'], array( UPLOAD_ERR_OK, UPLOAD_ERR_NO_FILE ), true ) ) {
			return new \WP_Error(
				'wpie_too_large',
				sprintf(
					/* translators: %s: server upload limit, e.g. "2 MB". */
					__( 'The image exceeds the server upload limit of %s (upload_max_filesize).', 'wunderpaint' ),
					size_format( wp_max_upload_size() )
				),
				array( 'status' => 413 )
			);
		}
		if ( isset( $files[ $field ]['tmp_name'] ) && is_uploaded_file( $files[ $field ]['tmp_name'] ) ) {
			if ( $files[ $field ]['size'] > $max ) {
				return new \WP_Error( 'wpie_too_large', __( 'The image exceeds the maximum upload size.', 'wunderpaint' ), array( 'status' => 413 ) );
			}
			$bytes = file_get_contents( $files[ $field ]['tmp_name'] ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
		} elseif ( $request->get_param( 'dataUrl' ) ) {
			$data_url = (string) $request->get_param( 'dataUrl' );
			if ( ! preg_match( '#^data:(image/[a-z.+-]+|application/pdf);base64,#i', $data_url, $m ) ) {
				return new \WP_Error( 'wpie_bad_data', __( 'Malformed data URL.', 'wunderpaint' ), array( 'status' => 400 ) );
			}
			$bytes = base64_decode( substr( $data_url, strpos( $data_url, ',' ) + 1 ), true ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode
			if ( false === $bytes || strlen( $bytes ) > $max ) {
				return new \WP_Error( 'wpie_too_large', __( 'The image is invalid or exceeds the maximum upload size.', 'wunderpaint' ), array( 'status' => 413 ) );
			}
		}

		if ( null === $bytes || '' === $bytes ) {
			return new \WP_Error( 'wpie_no_file', __( 'No image data received.', 'wunderpaint' ), array( 'status' => 400 ) );
		}

		$format = strtolower( (string) $request->get_param( 'format' ) );
		if ( ! isset( self::formats()[ $format ] ) ) {
			// No (or unknown) declared format: adopt the sniffed content type
			// below instead of assuming PNG (v1.85.2) — clients may upload a
			// provider's original bytes, which are often JPEG or WebP.
			$format = '';
		}

		// Validate by content, not extension (spec 08.4).
		if ( 'avif' === $format ) {
			// libmagic support for AVIF varies; check the ISO-BMFF ftyp box.
			if ( 'ftyp' !== substr( $bytes, 4, 4 ) || false === strpos( substr( $bytes, 8, 16 ), 'avif' ) ) {
				return new \WP_Error( 'wpie_bad_mime', __( 'The file is not a valid AVIF image.', 'wunderpaint' ), array( 'status' => 415 ) );
			}
			return array(
				'bytes' => $bytes,
				'ext'   => 'avif',
				'mime'  => self::formats()['avif'],
			);
		}
		if ( 'psd' === $format ) {
			if ( 0 !== strpos( $bytes, '8BPS' ) ) {
				return new \WP_Error( 'wpie_bad_mime', __( 'The file is not a valid PSD.', 'wunderpaint' ), array( 'status' => 415 ) );
			}
			return array(
				'bytes' => $bytes,
				'ext'   => 'psd',
				'mime'  => self::formats()['psd'],
			);
		}
		if ( 'pdf' === $format ) {
			if ( 0 !== strpos( $bytes, '%PDF-' ) ) {
				return new \WP_Error( 'wpie_bad_mime', __( 'The file is not a valid PDF.', 'wunderpaint' ), array( 'status' => 415 ) );
			}
			return array(
				'bytes' => $bytes,
				'ext'   => 'pdf',
				'mime'  => self::formats()['pdf'],
			);
		}

		$finfo    = new \finfo( FILEINFO_MIME_TYPE );
		$realmime = (string) $finfo->buffer( $bytes );
		if ( '' === $format ) {
			$format = array_search( $realmime, self::formats(), true );
			if ( false === $format || 'psd' === $format ) {
				return new \WP_Error(
					'wpie_bad_mime',
					sprintf(
						/* translators: %s: detected MIME type. */
						__( 'Unsupported image type (%s).', 'wunderpaint' ),
						$realmime
					),
					array( 'status' => 415 )
				);
			}
		}
		$expected = self::formats()[ $format ];
		if ( $realmime !== $expected ) {
			return new \WP_Error(
				'wpie_bad_mime',
				sprintf(
					/* translators: 1: detected MIME type, 2: expected MIME type. */
					__( 'Image content (%1$s) does not match the declared format (%2$s).', 'wunderpaint' ),
					$realmime,
					$expected
				),
				array( 'status' => 415 )
			);
		}

		return array(
			'bytes' => $bytes,
			'ext'   => 'jpg' === $format ? 'jpg' : $format,
			'mime'  => $expected,
		);
	}

	/**
	 * Replace an attachment's primary file with new bytes (handles extension
	 * change, orphaned intermediate sizes, metadata regeneration).
	 *
	 * @param int    $attachment_id Attachment id.
	 * @param string $bytes         New file contents.
	 * @param string $ext           New extension (png|jpg|jpeg|webp|psd).
	 * @return array|\WP_Error { id, url, sizes, version }
	 */
	public static function replace_attachment_file( $attachment_id, $bytes, $ext ) {
		self::require_admin_includes();

		$old_file = get_attached_file( $attachment_id );
		if ( ! $old_file ) {
			return new \WP_Error( 'wpie_no_file', __( 'Attachment file not found.', 'wunderpaint' ), array( 'status' => 404 ) );
		}

		// 1. Delete existing intermediate sizes (spec 08.1 step 2).
		$old_meta = wp_get_attachment_metadata( $attachment_id );
		$base_dir = trailingslashit( dirname( $old_file ) );
		if ( is_array( $old_meta ) && ! empty( $old_meta['sizes'] ) ) {
			foreach ( $old_meta['sizes'] as $size ) {
				if ( ! empty( $size['file'] ) && file_exists( $base_dir . $size['file'] ) ) {
					unlink( $base_dir . $size['file'] ); // phpcs:ignore WordPress.WP.AlternativeFunctions.unlink_unlink
				}
			}
		}

		// 2. Write the new bytes (same stem, possibly new extension).
		$old_ext  = strtolower( pathinfo( $old_file, PATHINFO_EXTENSION ) );
		$new_ext  = strtolower( $ext );
		$new_file = $old_file;
		if ( $old_ext !== $new_ext ) {
			$stem     = pathinfo( $old_file, PATHINFO_FILENAME );
			$new_name = wp_unique_filename( $base_dir, $stem . '.' . $new_ext );
			$new_file = $base_dir . $new_name;
		}
		if ( false === file_put_contents( $new_file, $bytes ) ) { // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
			return new \WP_Error( 'wpie_write_failed', __( 'Could not write the image file.', 'wunderpaint' ), array( 'status' => 500 ) );
		}
		if ( $new_file !== $old_file && file_exists( $old_file ) ) {
			unlink( $old_file ); // phpcs:ignore WordPress.WP.AlternativeFunctions.unlink_unlink
		}

		// 3. Update pointers + MIME.
		update_attached_file( $attachment_id, $new_file );
		$mime = isset( self::formats()[ $new_ext ] ) ? self::formats()[ $new_ext ] : 'image/' . $new_ext;
		wp_update_post(
			array(
				'ID'             => $attachment_id,
				'post_mime_type' => $mime,
			)
		);

		// 4. Rebuild all thumbnail sizes.
		$meta = wp_generate_attachment_metadata( $attachment_id, $new_file );
		wp_update_attachment_metadata( $attachment_id, $meta );

		$counter = max( 1, (int) get_post_meta( $attachment_id, Versioning::META_COUNTER, true ) );
		$url     = wp_get_attachment_url( $attachment_id );

		return array(
			'id'      => (int) $attachment_id,
			'url'     => add_query_arg( 'v', $counter . '-' . time(), $url ),
			'sizes'   => is_array( $meta ) && isset( $meta['sizes'] ) ? array_keys( $meta['sizes'] ) : array(),
			'version' => $counter,
		);
	}

	/**
	 * Apply the export-dialog metadata set (spec 07.2 / 08.1 step 5).
	 *
	 * @param int              $attachment_id Attachment id.
	 * @param \WP_REST_Request $request       Request.
	 */
	private static function apply_metadata( $attachment_id, \WP_REST_Request $request ) {
		$post_fields = array( 'ID' => $attachment_id );
		if ( null !== $request->get_param( 'title' ) ) {
			$post_fields['post_title'] = sanitize_text_field( (string) $request->get_param( 'title' ) );
		}
		if ( null !== $request->get_param( 'caption' ) ) {
			$post_fields['post_excerpt'] = sanitize_textarea_field( (string) $request->get_param( 'caption' ) );
		}
		if ( null !== $request->get_param( 'description' ) ) {
			$post_fields['post_content'] = sanitize_textarea_field( (string) $request->get_param( 'description' ) );
		}
		if ( count( $post_fields ) > 1 ) {
			wp_update_post( $post_fields );
		}
		if ( null !== $request->get_param( 'alt' ) ) {
			update_post_meta( $attachment_id, '_wp_attachment_image_alt', sanitize_text_field( (string) $request->get_param( 'alt' ) ) );
		}
	}

	/**
	 * Store sidecar project data when provided (spec 08.1 step 6).
	 *
	 * @param int              $attachment_id Attachment id.
	 * @param \WP_REST_Request $request       Request.
	 */
	private static function apply_sidecar( $attachment_id, \WP_REST_Request $request ) {
		$json  = $request->get_param( 'projectJson' );
		$files = $request->get_file_params();
		$psd   = isset( $files['psd']['tmp_name'] ) && is_uploaded_file( $files['psd']['tmp_name'] ) ? $files['psd']['tmp_name'] : null;
		if ( ( null !== $json && '' !== $json ) || $psd ) {
			Versioning::store_sidecar( $attachment_id, is_string( $json ) ? $json : null, $psd );
		}
	}

	/**
	 * POST /save, overwrite an existing attachment (spec 08.1).
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return array|\WP_Error
	 */
	public static function save( \WP_REST_Request $request ) {
		self::require_admin_includes();

		$attachment_id = absint( $request->get_param( 'attachmentId' ) );

		// The /save permission callback keys on `id ?: attachmentId`, but this
		// handler writes `attachmentId`. Re-authorize against the exact object
		// we are about to overwrite so a request cannot pass the check on one
		// attachment (`id`) and clobber another (`attachmentId`). (WPIE-001)
		if ( ! $attachment_id || 'attachment' !== get_post_type( $attachment_id ) ) {
			return new \WP_Error( 'wpie_not_found', __( 'Attachment not found.', 'wunderpaint' ), array( 'status' => 404 ) );
		}
		if ( ! current_user_can( 'edit_post', $attachment_id ) ) {
			return new \WP_Error( 'wpie_forbidden', __( 'You are not allowed to edit this attachment.', 'wunderpaint' ), array( 'status' => rest_authorization_required_code() ) );
		}

		$blob = self::read_blob( $request );
		if ( is_wp_error( $blob ) ) {
			return $blob;
		}

		// 1. Version the current file before overwrite.
		$settings = Helpers::get_settings();
		if ( $settings['versioning'] ) {
			$note = sanitize_text_field( (string) $request->get_param( 'note' ) );
			$snap = Versioning::snapshot( $attachment_id, '' !== $note ? $note : 'Before save' );
			if ( is_wp_error( $snap ) ) {
				return $snap;
			}
		}

		// 2–4. Replace file, regenerate sizes.
		$result = self::replace_attachment_file( $attachment_id, $blob['bytes'], $blob['ext'] );
		if ( is_wp_error( $result ) ) {
			return $result;
		}

		// 5. Metadata + 6. sidecar.
		self::apply_metadata( $attachment_id, $request );
		self::apply_sidecar( $attachment_id, $request );

		/**
		 * Fires after the editor saved an image (v0.4), e.g. CDN pushes.
		 *
		 * @param int    $attachment_id Attachment id.
		 * @param string $file          Absolute path of the written file.
		 * @param string $context       'save' (overwrite) or 'saveAs' (new).
		 */
		do_action( 'wpie_after_save', $attachment_id, get_attached_file( $attachment_id ), 'save' );

		$result['editUrl'] = Media::editor_url( $attachment_id );
		return $result;
	}

	/**
	 * POST /save-as, create a new attachment (spec 08.1).
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return array|\WP_Error
	 */
	public static function save_as( \WP_REST_Request $request ) {
		self::require_admin_includes();

		$blob = self::read_blob( $request );
		if ( is_wp_error( $blob ) ) {
			return $blob;
		}

		$filename = sanitize_file_name( (string) $request->get_param( 'filename' ) );
		if ( '' === $filename ) {
			$filename = 'wpie-image';
		}
		$filename = preg_replace( '/\.[a-z0-9]+$/i', '', $filename ) . '.' . $blob['ext'];

		$upload = wp_upload_bits( $filename, null, $blob['bytes'] );
		if ( ! empty( $upload['error'] ) ) {
			return new \WP_Error( 'wpie_upload_failed', $upload['error'], array( 'status' => 500 ) );
		}

		$attachment_id = wp_insert_attachment(
			array(
				'post_mime_type' => $blob['mime'],
				'post_title'     => sanitize_text_field( (string) ( $request->get_param( 'title' ) ? $request->get_param( 'title' ) : pathinfo( $filename, PATHINFO_FILENAME ) ) ),
				'post_status'    => 'inherit',
			),
			$upload['file']
		);
		if ( is_wp_error( $attachment_id ) || ! $attachment_id ) {
			return new \WP_Error( 'wpie_insert_failed', __( 'Could not create the attachment.', 'wunderpaint' ), array( 'status' => 500 ) );
		}

		$meta = wp_generate_attachment_metadata( $attachment_id, $upload['file'] );
		wp_update_attachment_metadata( $attachment_id, $meta );

		self::apply_metadata( $attachment_id, $request );
		self::apply_sidecar( $attachment_id, $request );

		/** This action is documented in includes/class-image-writer.php */
		do_action( 'wpie_after_save', $attachment_id, $upload['file'], 'saveAs' );

		return array(
			'id'      => (int) $attachment_id,
			'url'     => wp_get_attachment_url( $attachment_id ),
			'sizes'   => is_array( $meta ) && isset( $meta['sizes'] ) ? array_keys( $meta['sizes'] ) : array(),
			'editUrl' => Media::editor_url( $attachment_id ),
		);
	}
}
