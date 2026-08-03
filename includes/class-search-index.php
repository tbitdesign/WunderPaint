<?php
/**
 * Semantic image search index (v1.131.0): stores one SigLIP embedding per
 * media-library image as attachment meta. The vectors are computed in the
 * BROWSER (self-hosted model, nothing leaves the site) and are tiny -
 * 768 int8 values (~1 KB base64) per image - so post meta is a perfect,
 * portable home: survives browsers, users and exports.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * REST routes for the browser-side indexer and the search lookup.
 */
class Search_Index {

	const META_KEY = '_wpie_search_vec';

	/** Dominant color buckets, computed in the browser alongside the vector. */
	const COLORS_KEY = '_wpie_colors';

	/**
	 * Embedding revision: model + preprocessing. Bump to re-index after a
	 * model change (old vectors are ignored, not deleted).
	 */
	const REV = 'siglip-b16-q8-1';

	/**
	 * Register hooks.
	 */
	public function hooks() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	/**
	 * REST routes.
	 */
	public function register_routes() {
		register_rest_route(
			WPIE_REST_NS,
			'/search-index/pending',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'pending' ),
				'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
			)
		);
		register_rest_route(
			WPIE_REST_NS,
			'/search-index/(?P<id>\d+)',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'save' ),
				'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
			)
		);
		register_rest_route(
			WPIE_REST_NS,
			'/search-index/vectors',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'vectors' ),
				'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
			)
		);
	}

	/**
	 * Base query args for library images (the editor's supported inputs).
	 *
	 * @return array
	 */
	private static function image_query_args() {
		return array(
			'post_type'      => 'attachment',
			'post_status'    => 'inherit',
			'post_mime_type' => array( 'image/jpeg', 'image/png', 'image/webp', 'image/avif' ),
			'orderby'        => 'ID',
			'order'          => 'DESC',
			'fields'         => 'ids',
		);
	}

	/**
	 * Images that still need an embedding for the current revision.
	 * Returns a page of work items plus the totals for progress display.
	 *
	 * @param \WP_REST_Request $req Request.
	 * @return array
	 */
	public function pending( \WP_REST_Request $req ) {
		$per  = min( 20, max( 1, (int) ( $req->get_param( 'per' ) ?: 8 ) ) );
		$args = self::image_query_args();

		$total_q = new \WP_Query( array_merge( $args, array( 'posts_per_page' => 1 ) ) );
		$total   = (int) $total_q->found_posts;

		$pending_q = new \WP_Query(
			array_merge(
				$args,
				array(
					'posts_per_page' => $per,
					// phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- bounded page, editor-triggered.
					'meta_query'     => array(
						'relation' => 'OR',
						array(
							'key'     => self::META_KEY,
							'compare' => 'NOT EXISTS',
						),
						array(
							'key'     => self::META_KEY,
							'value'   => '"' . self::REV . '"',
							'compare' => 'NOT LIKE',
						),
					),
				)
			)
		);

		$items = array();
		foreach ( $pending_q->posts as $id ) {
			$src = wp_get_attachment_image_src( $id, 'medium' );
			if ( ! $src ) {
				// Unreadable file: store a tombstone so it never blocks the queue.
				// save() checks edit_post (WPIE-012); this GET handler wrote
				// without any object check. A GET should not write at all, and
				// certainly not on foreign objects. (F-L33)
				if ( current_user_can( 'edit_post', (int) $id ) ) {
					update_post_meta( $id, self::META_KEY, array( 'rev' => self::REV, 'vec' => '' ) );
				}
				continue;
			}
			$items[] = array(
				'id'  => $id,
				'src' => $src[0],
			);
		}

		return array(
			'items'   => $items,
			'pending' => (int) $pending_q->found_posts,
			'total'   => $total,
			'rev'     => self::REV,
		);
	}

	/**
	 * Store one embedding (base64 int8, computed in the browser).
	 *
	 * @param \WP_REST_Request $req Request.
	 * @return array|\WP_Error
	 */
	public function save( \WP_REST_Request $req ) {
		$id  = (int) $req['id'];
		$vec = (string) $req->get_param( 'vec' );
		if ( 'attachment' !== get_post_type( $id ) ) {
			return new \WP_Error( 'wpie_bad_attachment', __( 'Unknown attachment.', 'wunderpaint' ), array( 'status' => 404 ) );
		}
		// Writing search metadata onto an attachment requires edit rights on it,
		// matching the /save and /versions routes; otherwise any editor could
		// poison the shared search ranking of images they cannot edit. (WPIE-012)
		if ( ! current_user_can( 'edit_post', $id ) ) {
			return new \WP_Error( 'wpie_forbidden', __( 'You are not allowed to edit this attachment.', 'wunderpaint' ), array( 'status' => rest_authorization_required_code() ) );
		}
		// 768 int8 values in base64 = 1024 chars; reject anything unexpected.
		if ( strlen( $vec ) > 4096 || ! preg_match( '#^[A-Za-z0-9+/=]*$#', $vec ) ) {
			return new \WP_Error( 'wpie_bad_vector', __( 'Malformed vector.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		update_post_meta( $id, self::META_KEY, array( 'rev' => self::REV, 'vec' => $vec ) );

		// Optional dominant-color buckets (same browser pass as the vector).
		$colors = $req->get_param( 'colors' );
		if ( is_array( $colors ) ) {
			$clean = array();
			foreach ( array_slice( $colors, 0, 4 ) as $c ) {
				$c = sanitize_key( (string) $c );
				if ( '' !== $c ) {
					$clean[] = $c;
				}
			}
			update_post_meta( $id, self::COLORS_KEY, $clean );
		}
		return array( 'ok' => true );
	}

	/**
	 * All current-revision vectors with what the search UI needs to render
	 * results (thumb + title), paged.
	 *
	 * @param \WP_REST_Request $req Request.
	 * @return array
	 */
	public function vectors( \WP_REST_Request $req ) {
		$per   = min( 500, max( 1, (int) ( $req->get_param( 'per' ) ?: 400 ) ) );
		$paged = max( 1, (int) ( $req->get_param( 'page' ) ?: 1 ) );

		$q = new \WP_Query(
			array_merge(
				self::image_query_args(),
				array(
					'posts_per_page' => $per,
					'paged'          => $paged,
					// phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- paged, editor-triggered.
					'meta_query'     => array(
						array(
							'key'     => self::META_KEY,
							'value'   => '"' . self::REV . '"',
							'compare' => 'LIKE',
						),
					),
				)
			)
		);

		$items = array();
		foreach ( $q->posts as $id ) {
			$meta = get_post_meta( $id, self::META_KEY, true );
			if ( ! is_array( $meta ) || self::REV !== ( $meta['rev'] ?? '' ) || empty( $meta['vec'] ) ) {
				continue;
			}
			$thumb = wp_get_attachment_image_src( $id, 'medium' );
			$full  = wp_get_attachment_image_src( $id, 'full' );
			$items[] = array(
				'id'    => $id,
				'vec'   => $meta['vec'],
				'thumb' => $thumb ? $thumb[0] : '',
				'url'   => $full ? $full[0] : '',
				'title' => get_the_title( $id ),
			);
		}

		return array(
			'items' => $items,
			'pages' => (int) $q->max_num_pages,
			'page'  => $paged,
		);
	}
}
