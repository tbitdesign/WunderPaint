<?php
/**
 * Media Library entry points: attachment button, row action, media-button JS.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Adds "Edit Image" / "New Image" affordances.
 */
class Media {

	/**
	 * Register hooks.
	 */
	public function hooks() {
		add_filter( 'attachment_fields_to_edit', array( $this, 'attachment_field' ), 10, 2 );
		add_filter( 'media_row_actions', array( $this, 'row_action' ), 10, 2 );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue' ) );
		add_action( 'enqueue_block_editor_assets', array( $this, 'enqueue_block_editor' ) );
		// Front-end page builders (Bricks, Divi, …) run their editor on the
		// front end and open the standard wp.media picker; light up the same
		// "Edit Image" button there (v1.182.0).
		add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_builder_frontend' ) );
	}

	/**
	 * Block-editor toolbar button for core/image (v0.2).
	 */
	public function enqueue_block_editor() {
		if ( ! self::user_can_use_editor() ) {
			return;
		}
		$asset_file = WPIE_DIR . 'build/block-editor.asset.php';
		$asset      = file_exists( $asset_file ) ? require $asset_file : array(
			'dependencies' => array(),
			'version'      => WPIE_VERSION,
		);
		wp_enqueue_script(
			'wpie-block-editor',
			WPIE_URL . 'build/block-editor.js',
			$asset['dependencies'],
			$asset['version'],
			true
		);
		wp_localize_script(
			'wpie-block-editor',
			'WPIEBlock',
			array(
				'editorBase' => admin_url( 'upload.php?page=' . WPIE_SLUG ),
				// v1.245: the editor.MediaUpload filter swaps Gutenberg's
				// picker for the Media Library Manager when this is on.
				'pickerManager' => ! empty( Helpers::get_settings()['media_picker_manager'] ),
				'loading'    => __( 'Loading Media Library Manager…', 'wunderpaint' ),
				'title'      => __( 'WunderPaint', 'wunderpaint' ),
			)
		);
		wp_set_script_translations( 'wpie-block-editor', 'wunderpaint', WPIE_DIR . 'languages' );
	}

	/**
	 * Editor URL for an attachment (or a new document).
	 *
	 * @param int $attachment_id Attachment id, 0 for a new document.
	 * @return string
	 */
	public static function editor_url( $attachment_id = 0 ) {
		$args = $attachment_id > 0
			? array( 'attachment' => (int) $attachment_id )
			: array( 'new' => 1 );
		return add_query_arg( $args, admin_url( 'upload.php?page=' . WPIE_SLUG ) );
	}

	/**
	 * Whether the current user may use the editor at all.
	 *
	 * @return bool
	 */
	public static function user_can_use_editor() {
		$settings = Helpers::get_settings();
		return current_user_can( $settings['editor_cap'] );
	}

	/**
	 * "Edit Image" button in the attachment modal + edit screen.
	 *
	 * @param array    $fields Form fields.
	 * @param \WP_Post $post   Attachment post.
	 * @return array
	 */
	public function attachment_field( $fields, $post ) {
		if ( ! $post || ! wp_attachment_is_image( $post->ID ) || ! self::user_can_use_editor() || ! current_user_can( 'edit_post', $post->ID ) ) {
			return $fields;
		}

		$url  = self::editor_url( $post->ID );
		$html = sprintf(
			'<a href="%s" class="wpie-edit-button" style="display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 14px;border-radius:4px;background:#3b66ff;color:#fff;font-weight:600;text-decoration:none;">%s</a>',
			esc_url( $url ),
			esc_html__( 'Edit Image', 'wunderpaint' )
		);

		$fields['wpie_edit_with'] = array(
			'label'         => __( 'WunderPaint', 'wunderpaint' ),
			'input'         => 'html',
			'html'          => $html,
			// Present in both the media modal and the attachment edit screen.
			// The media-button JS upgrades this button to open in place (overlay)
			// whenever it is clicked inside a wp.media modal (v1.182.0).
			'show_in_modal' => true,
			'show_in_edit'  => true,
		);
		return $fields;
	}

	/**
	 * "Edit Image" row action in upload.php list mode.
	 *
	 * @param array    $actions Row actions.
	 * @param \WP_Post $post    Attachment post.
	 * @return array
	 */
	public function row_action( $actions, $post ) {
		if ( $post && wp_attachment_is_image( $post->ID ) && self::user_can_use_editor() && current_user_can( 'edit_post', $post->ID ) ) {
			$actions['wpie_edit'] = sprintf(
				'<a href="%s">%s</a>',
				esc_url( self::editor_url( $post->ID ) ),
				esc_html__( 'Edit Image', 'wunderpaint' )
			);
		}
		return $actions;
	}

	/**
	 * Enqueue the media-button script on media screens.
	 *
	 * @param string $hook Current admin page hook.
	 */
	public function enqueue( $hook ) {
		if ( ! in_array( $hook, array( 'upload.php', 'post.php', 'post-new.php' ), true ) || ! self::user_can_use_editor() ) {
			return;
		}
		self::register_media_button();
	}

	/**
	 * Enqueue the media button on a front-end page-builder edit session, so its
	 * wp.media picker gets the same "Edit Image" affordance.
	 */
	public function enqueue_builder_frontend() {
		if ( self::user_can_use_editor() && self::builder_edit_mode() ) {
			self::register_media_button();
		}
	}

	/**
	 * Whether a supported front-end builder is currently in edit mode. Guarded
	 * by the builders' own public functions, so it is a no-op when they are not
	 * installed; other builders can opt in via the `wpie_builder_edit_mode`
	 * filter.
	 *
	 * @return bool
	 */
	private static function builder_edit_mode() {
		$active =
			( function_exists( 'bricks_is_builder' ) && bricks_is_builder() ) ||
			( function_exists( 'et_core_is_fb_enabled' ) && et_core_is_fb_enabled() );
		return (bool) apply_filters( 'wpie_builder_edit_mode', $active );
	}

	/**
	 * Register + localize the media-button script (shared by the admin,
	 * front-end-builder and Elementor-editor enqueues).
	 */
	public static function register_media_button() {
		$asset_file = WPIE_DIR . 'build/media-button.asset.php';
		$asset      = file_exists( $asset_file ) ? require $asset_file : array(
			'dependencies' => array(),
			'version'      => WPIE_VERSION,
		);
		wp_enqueue_script(
			'wpie-media-button',
			WPIE_URL . 'build/media-button.js',
			// media-views guarantees wp.media.view exists BEFORE this
			// script runs; the picker takeover patches Modal at boot
			// (v1.242.1 - without it the script could print first and the
			// takeover never installed).
			array_merge( $asset['dependencies'], array( 'media-views' ) ),
			$asset['version'],
			true
		);
		wp_localize_script(
			'wpie-media-button',
			'WPIEMedia',
			array(
				'editorBase' => admin_url( 'upload.php?page=' . WPIE_SLUG ),
				'createNew'  => self::editor_url(),
				'label'      => __( 'Edit Image', 'wunderpaint' ),
				'editShort'  => __( 'Edit', 'wunderpaint' ),
				// "New Image" everywhere a blank canvas starts (v1.180.2):
				// same word as the Media submenu and the "+ New" bar entry.
				'createLbl'  => __( 'New Image', 'wunderpaint' ),
				// Overlay chrome for the in-place edit flow (v1.182.0).
				'loading'    => __( 'Loading editor…', 'wunderpaint' ),
				'close'      => __( 'Close', 'wunderpaint' ),
				'title'      => __( 'WunderPaint', 'wunderpaint' ),
				// wp.media picker takeover (v1.242): every media modal gets
				// a "Media Library Manager" button when the setting is on.
				'pickerManager' => ! empty( Helpers::get_settings()['media_picker_manager'] ),
				'managerLbl' => __( 'Media Library Manager', 'wunderpaint' ),
				'managerLoading' => __( 'Loading Media Library Manager…', 'wunderpaint' ),
			)
		);
	}

	/**
	 * GET /media/usage?attachmentId=<id> : best-effort count of OTHER
	 * places that use an attachment - content references (image URL or
	 * the wp-image-<id> class) plus featured-image assignments. Informs
	 * the "overwrite the original?" choice in the apply flow; a quick
	 * LIKE scan, not an exhaustive audit (builder metas are not walked).
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response
	 */
	public static function usage( \WP_REST_Request $request ) {
		global $wpdb;
		$id   = absint( $request->get_param( 'attachmentId' ) );
		// The permission callback resolves `id ?: attachmentId`, this handler
		// reads attachmentId only, so the two can point at different objects.
		// Re-authorize against the object actually processed, exactly like
		// Image_Writer::save() does since WPIE-001. (F-L01, 2026-07-25 audit)
		if ( ! $id || 'attachment' !== get_post_type( $id ) || ! current_user_can( 'edit_post', $id ) ) {
			return new \WP_Error(
				'wpie_forbidden',
				__( 'You are not allowed to access this attachment.', 'wunderpaint' ),
				array( 'status' => rest_authorization_required_code() )
			);
		}
		$file = (string) get_post_meta( $id, '_wp_attached_file', true );
		// The name stem also matches -300x200 size variants of the file.
		$stem  = $file ? preg_replace( '/\.[a-z0-9]+$/i', '', wp_basename( $file ) ) : '';
		$likes = array( '%' . $wpdb->esc_like( 'wp-image-' . $id ) . '%' );
		if ( '' !== $stem ) {
			$likes[] = '%' . $wpdb->esc_like( $stem ) . '%';
		}
		$where = implode( ' OR ', array_fill( 0, count( $likes ), 'post_content LIKE %s' ) );
		// Cleared here so the check after both counts speaks about these two
		// queries and not about whatever ran before them.
		$wpdb->last_error = '';
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared,WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- admin-only usage count for one attachment; inherently dynamic, not worth caching.
		$content = (int) $wpdb->get_var(
			$wpdb->prepare(
				"SELECT COUNT(DISTINCT ID) FROM {$wpdb->posts} WHERE post_type NOT IN ('revision','attachment') AND post_status NOT IN ('trash','auto-draft','inherit') AND ID != %d AND ( {$where} )", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				array_merge( array( $id ), $likes )
			)
		);
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- admin-only usage count for one attachment; inherently dynamic, not worth caching.
		$featured = (int) $wpdb->get_var(
			$wpdb->prepare(
				"SELECT COUNT(DISTINCT post_id) FROM {$wpdb->postmeta} WHERE meta_key = '_thumbnail_id' AND meta_value = %d",
				$id
			)
		);
		// Both counts are null-on-error, so zero would be a confident "nowhere"
		// for an image that may well be in use.
		if ( '' !== (string) $wpdb->last_error ) {
			return new \WP_Error(
				'wpie_usage_query_failed',
				__( 'The usage count could not be determined.', 'wunderpaint' ),
				array( 'status' => 500 )
			);
		}
		return rest_ensure_response(
			array( 'count' => $content + $featured )
		);
	}
}
