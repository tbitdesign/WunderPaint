<?php
/**
 * Media Library Manager (v1.189.0): real folders + tags on attachments plus
 * the REST endpoints the manager modal needs (listing, folder/tag CRUD, bulk
 * assign, bulk delete and per-user smart folders).
 *
 * Folders and tags are ordinary WordPress taxonomies registered on the
 * `attachment` post type, so they are native, queryable, survive plugin
 * deactivation as data and are exposed through core REST as a bonus. The
 * manager keeps its own richer endpoints for the two-column UI.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Taxonomies + REST for the Media Library Manager.
 */
class Media_Library {

	const FOLDER_TAX = 'wpie_folder';
	const TAG_TAX     = 'wpie_tag';
	const SMART_META  = 'wpie_smart_folders';

	/** Image types the manager shows and operates on. */
	const MIMES = array(
		'image/jpeg',
		'image/png',
		'image/webp',
		'image/avif',
		'image/gif',
		'image/svg+xml',
	);

	/** Video types the manager can also list (type=videos|all). */
	const VIDEO_MIMES = array(
		'video/mp4',
		'video/webm',
		'video/ogg',
		'video/quicktime',
	);

	/** Numeric sort/filter meta backfilled from attachment metadata. */
	const AREA_KEY     = '_wpie_area';
	const FILESIZE_KEY = '_wpie_filesize';
	const ORIENT_KEY   = '_wpie_orient';
	const COLORS_KEY   = '_wpie_colors';

	/** Area thresholds for the size buckets (pixels). */
	const SIZE_BUCKETS = array(
		'small'  => array( 0, 40000 ),
		'medium' => array( 40000, 640000 ),
		'large'  => array( 640000, 3686400 ),
		'huge'   => array( 3686400, PHP_INT_MAX ),
	);

	/**
	 * Register hooks.
	 */
	public function hooks() {
		add_action( 'init', array( $this, 'register_taxonomies' ) );
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
		// Keep the numeric sort meta fresh for new uploads and edits.
		add_filter( 'wp_generate_attachment_metadata', array( $this, 'stamp_on_generate' ), 10, 2 );
	}

	/**
	 * Two taxonomies on attachments: hierarchical folders and flat tags.
	 * `_update_generic_term_count` is required so counts include attachments
	 * (post_status 'inherit'), which the default post count callback skips.
	 */
	public function register_taxonomies() {
		register_taxonomy(
			self::FOLDER_TAX,
			'attachment',
			array(
				'labels'                => array(
					'name'          => __( 'Media Folders', 'wunderpaint' ),
					'singular_name' => __( 'Media Folder', 'wunderpaint' ),
				),
				'hierarchical'          => true,
				'public'                => false,
				'show_ui'               => false,
				'show_admin_column'     => false,
				'show_in_rest'          => true,
				'rest_base'             => self::FOLDER_TAX,
				'rewrite'               => false,
				'update_count_callback' => '_update_generic_term_count',
			)
		);
		register_taxonomy(
			self::TAG_TAX,
			'attachment',
			array(
				'labels'                => array(
					'name'          => __( 'Media Tags', 'wunderpaint' ),
					'singular_name' => __( 'Media Tag', 'wunderpaint' ),
				),
				'hierarchical'          => false,
				'public'                => false,
				'show_ui'               => false,
				'show_admin_column'     => false,
				'show_in_rest'          => true,
				'rest_base'             => self::TAG_TAX,
				'rewrite'               => false,
				'update_count_callback' => '_update_generic_term_count',
			)
		);
	}

	/**
	 * REST routes under wpie/v1/media-library/*.
	 */
	public function register_routes() {
		$perm      = array( REST_Controller::class, 'can_use_editor' );
		$namespace = WPIE_REST_NS;

		register_rest_route(
			$namespace,
			'/media-library/items',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'items' ),
				'permission_callback' => $perm,
			)
		);
		register_rest_route(
			$namespace,
			'/media-library/backfill',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'backfill' ),
				'permission_callback' => $perm,
			)
		);
		register_rest_route(
			$namespace,
			'/media-library/color-pending',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'color_pending' ),
				'permission_callback' => $perm,
			)
		);
		register_rest_route(
			$namespace,
			'/media-library/colors/(?P<id>\d+)',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'save_colors' ),
				'permission_callback' => $perm,
			)
		);
		register_rest_route(
			$namespace,
			'/media-library/regenerate',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'regenerate' ),
				'permission_callback' => $perm,
			)
		);
		register_rest_route(
			$namespace,
			'/media-library/broken',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'broken' ),
				'permission_callback' => $perm,
			)
		);

		register_rest_route(
			$namespace,
			'/media-library/folders',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( $this, 'list_folders' ),
					'permission_callback' => $perm,
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'create_folder' ),
					'permission_callback' => $perm,
				),
			)
		);
		register_rest_route(
			$namespace,
			'/media-library/folders/(?P<id>\d+)',
			array(
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'update_folder' ),
					'permission_callback' => $perm,
				),
				array(
					'methods'             => 'DELETE',
					'callback'            => array( $this, 'delete_folder' ),
					'permission_callback' => $perm,
				),
			)
		);

		register_rest_route(
			$namespace,
			'/media-library/tags',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( $this, 'list_tags' ),
					'permission_callback' => $perm,
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'create_tag' ),
					'permission_callback' => $perm,
				),
			)
		);
		register_rest_route(
			$namespace,
			'/media-library/tags/(?P<id>\d+)',
			array(
				'methods'             => 'DELETE',
				'callback'            => array( $this, 'delete_tag' ),
				'permission_callback' => $perm,
			)
		);

		register_rest_route(
			$namespace,
			'/media-library/assign',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'assign' ),
				'permission_callback' => $perm,
			)
		);
		register_rest_route(
			$namespace,
			'/media-library/delete',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'bulk_delete' ),
				'permission_callback' => $perm,
			)
		);

		register_rest_route(
			$namespace,
			'/media-library/smart',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( $this, 'list_smart' ),
					'permission_callback' => $perm,
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'create_smart' ),
					'permission_callback' => $perm,
				),
			)
		);
		register_rest_route(
			$namespace,
			'/media-library/smart/(?P<id>[A-Za-z0-9]+)',
			array(
				'methods'             => 'DELETE',
				'callback'            => array( $this, 'delete_smart' ),
				'permission_callback' => $perm,
			)
		);
	}

	/* --------------------------------- items ------------------------------ */

	/**
	 * A filtered, paged page of library images with everything the grid and
	 * the per-image editor need.
	 *
	 * @param \WP_REST_Request $req Request.
	 * @return array
	 */
	public function items( \WP_REST_Request $req ) {
		$per  = min( 200, max( 1, (int) ( $req->get_param( 'per' ) ?: 60 ) ) );
		$page = max( 1, (int) ( $req->get_param( 'page' ) ?: 1 ) );

		// Media type scope (v1.243): images (default), videos, audio,
		// documents, or truly everything the library holds. WP_Query
		// treats bare types ('audio', 'application') as prefix wildcards.
		$type = (string) $req->get_param( 'type' );
		if ( 'videos' === $type ) {
			$mimes = self::VIDEO_MIMES;
		} elseif ( 'audio' === $type ) {
			$mimes = array( 'audio' );
		} elseif ( 'docs' === $type ) {
			$mimes = array( 'application', 'text' );
		} elseif ( 'all' === $type ) {
			$mimes = null; // no mime clause = every attachment.
		} else {
			$mimes = self::MIMES;
		}
		// A single exact mime narrows it further.
		$mime = (string) $req->get_param( 'mime' );
		if ( $mime && preg_match( '#^[a-z]+/[a-z0-9.+-]+$#', $mime ) ) {
			$mimes = array( $mime );
		}

		$args = array(
			'post_type'      => 'attachment',
			'post_status'    => 'inherit',
			'posts_per_page' => $per,
			'paged'          => $page,
		);
		if ( null !== $mimes ) {
			$args['post_mime_type'] = $mimes;
		}

		// Taxonomy filters (folder + tag).
		$tax    = array();
		$folder = (int) $req->get_param( 'folder' );
		if ( $folder ) {
			$tax[] = array(
				'taxonomy' => self::FOLDER_TAX,
				'field'    => 'term_id',
				'terms'    => $folder,
			);
		}
		$tag = (int) $req->get_param( 'tag' );
		if ( $tag ) {
			$tax[] = array(
				'taxonomy' => self::TAG_TAX,
				'field'    => 'term_id',
				'terms'    => $tag,
			);
		}
		if ( $tax ) {
			$args['tax_query'] = $tax; // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_tax_query -- editor-triggered, bounded page.
		}

		$q = trim( (string) $req->get_param( 'q' ) );
		if ( '' !== $q ) {
			$args['s'] = sanitize_text_field( $q );
		}

		// Author + upload-month filters (v1.244), same facets the native
		// library offers.
		$author = (int) $req->get_param( 'author' );
		if ( $author ) {
			$args['author'] = $author;
		}
		$month = (string) $req->get_param( 'month' );
		if ( preg_match( '/^\d{4}-\d{2}$/', $month ) ) {
			$args['date_query'] = array(
				array(
					'year'  => (int) substr( $month, 0, 4 ),
					'month' => (int) substr( $month, 5, 2 ),
				),
			);
		}

		// Meta filters (missing alt, size bucket, orientation, color) collected
		// into one AND meta_query so they compose.
		$meta = array();
		if ( $req->get_param( 'missingAlt' ) ) {
			$meta[] = array(
				'relation' => 'OR',
				array(
					'key'     => '_wp_attachment_image_alt',
					'compare' => 'NOT EXISTS',
				),
				array(
					'key'     => '_wp_attachment_image_alt',
					'value'   => '',
					'compare' => '=',
				),
			);
		}
		$size = (string) $req->get_param( 'size' );
		if ( isset( self::SIZE_BUCKETS[ $size ] ) ) {
			list( $lo, $hi ) = self::SIZE_BUCKETS[ $size ];
			$meta['size_clause'] = array(
				'key'     => self::AREA_KEY,
				'value'   => array( $lo, $hi ),
				'type'    => 'NUMERIC',
				'compare' => 'BETWEEN',
			);
		}
		$orient = (string) $req->get_param( 'orient' );
		if ( in_array( $orient, array( 'l', 'p', 's' ), true ) ) {
			$meta[] = array(
				'key'   => self::ORIENT_KEY,
				'value' => $orient,
			);
		}
		$color = sanitize_key( (string) $req->get_param( 'color' ) );
		if ( $color ) {
			$meta[] = array(
				'key'     => self::COLORS_KEY,
				'value'   => '"' . $color . '"',
				'compare' => 'LIKE',
			);
		}

		// Sorting. area/filesize sort on the backfilled numeric meta via a
		// named order clause; everything else is a native column.
		$order   = 'ASC' === strtoupper( (string) $req->get_param( 'order' ) ) ? 'ASC' : 'DESC';
		$orderby = (string) $req->get_param( 'orderby' );
		if ( 'area' === $orderby || 'filesize' === $orderby ) {
			$meta['order_clause'] = array(
				'key'  => 'area' === $orderby ? self::AREA_KEY : self::FILESIZE_KEY,
				'type' => 'NUMERIC',
			);
			$args['orderby'] = array( 'order_clause' => $order );
		} elseif ( 'title' === $orderby ) {
			$args['orderby'] = 'title';
			$args['order']   = $order;
		} elseif ( 'modified' === $orderby ) {
			$args['orderby'] = 'modified';
			$args['order']   = $order;
		} else {
			$args['orderby'] = 'date';
			$args['order']   = $order;
		}

		if ( $meta ) {
			$meta['relation'] = 'AND';
			$args['meta_query'] = $meta; // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- bounded page, editor-triggered.
		}

		// Explicit id set (e.g. semantic hits) keeps its given order unless a
		// sort is requested.
		$ids = $req->get_param( 'ids' );
		if ( $ids ) {
			$ids = array_values( array_filter( array_map( 'intval', explode( ',', (string) $ids ) ) ) );
			$args['post__in'] = $ids ?: array( 0 );
			if ( ! $orderby ) {
				$args['orderby'] = 'post__in';
			}
		} elseif ( $req->get_param( 'usage' ) ) {
			// Verdict from the usage engine (v1.351.0). Replaces the old
			// `unused` flag, which diffed a featured-image list against a regex
			// over 500 posts and had no idea page builders existed.
			$verdict = (string) $req->get_param( 'usage' );
			foreach ( Media_Usage::query_args( $verdict ) as $key => $value ) {
				if ( 'meta_query' === $key && ! empty( $args['meta_query'] ) ) {
					$args['meta_query'] = array_merge( $args['meta_query'], $value ); // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- merging the caller's own filters.
					continue;
				}
				$args[ $key ] = $value;
			}
		} elseif ( $req->get_param( 'unused' ) ) {
			foreach ( Media_Usage::query_args( 'unused' ) as $key => $value ) {
				$args[ $key ] = $value;
			}
		}

		$query = new \WP_Query( $args );
		$items = array();
		foreach ( $query->posts as $post ) {
			$items[] = $this->item_shape( $post );
		}

		$out = array(
			'items' => $items,
			'total' => (int) $query->found_posts,
			'pages' => (int) $query->max_num_pages,
			'page'  => $page,
		);
		// Filter facets ride along on the first page only; later pages of
		// the same view never need them again.
		if ( 1 === $page ) {
			$out['authors'] = $this->author_facet();
			$out['months']  = $this->month_facet();
		}
		return $out;
	}

	/**
	 * Distinct attachment authors, busiest first (author filter facet).
	 *
	 * @return array[] [{ id, name }]
	 */
	private function author_facet() {
		global $wpdb;
		$rows = $wpdb->get_results( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- one indexed GROUP BY per dialog open.
			"SELECT post_author AS id, COUNT(*) AS n FROM {$wpdb->posts} WHERE post_type = 'attachment' AND post_status = 'inherit' GROUP BY post_author ORDER BY n DESC LIMIT 50"
		);
		$out = array();
		foreach ( is_array( $rows ) ? $rows : array() as $row ) {
			$user = get_userdata( (int) $row->id );
			if ( $user ) {
				$out[] = array(
					'id'   => (int) $row->id,
					'name' => $user->display_name,
				);
			}
		}
		return $out;
	}

	/**
	 * Distinct upload months, newest first (month filter facet).
	 *
	 * @return string[] ['2026-07', ...]
	 */
	private function month_facet() {
		global $wpdb;
		$rows = $wpdb->get_col( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- one indexed DISTINCT per dialog open.
			"SELECT DISTINCT DATE_FORMAT(post_date, '%Y-%m') FROM {$wpdb->posts} WHERE post_type = 'attachment' AND post_status = 'inherit' ORDER BY 1 DESC LIMIT 120"
		);
		return array_values( array_filter( array_map( 'strval', is_array( $rows ) ? $rows : array() ) ) );
	}

	/**
	 * Public render shape for one attachment.
	 *
	 * @param \WP_Post $post Attachment.
	 * @return array
	 */
	private function item_shape( $post ) {
		$id       = $post->ID;
		$thumb    = wp_get_attachment_image_src( $id, 'medium' );
		$full     = wp_get_attachment_image_src( $id, 'full' );
		$colors   = get_post_meta( $id, self::COLORS_KEY, true );
		$mime     = (string) $post->post_mime_type;
		$is_video = 0 === strpos( $mime, 'video/' );
		$dims     = self::attachment_dims( $id );
		// Coarse kind for the grid (v1.243): PDFs with a generated preview
		// still count as docs, they just get a real thumbnail.
		if ( 0 === strpos( $mime, 'image/' ) ) {
			$kind = 'image';
		} elseif ( $is_video ) {
			$kind = 'video';
		} elseif ( 0 === strpos( $mime, 'audio/' ) ) {
			$kind = 'audio';
		} else {
			$kind = 'doc';
		}
		return array(
			'id'          => $id,
			'thumb'       => $thumb ? $thumb[0] : ( $full ? $full[0] : '' ),
			// Non-image files need their direct file URL (players,
			// downloads, wp.media handoff); images keep the full-size src.
			'url'         => $full ? $full[0] : (string) wp_get_attachment_url( $id ),
			'kind'        => $kind,
			'icon'        => 'image' === $kind ? '' : (string) wp_mime_type_icon( $id ),
			'filename'    => wp_basename( (string) get_attached_file( $id ) ),
			'author'      => get_the_author_meta( 'display_name', (int) $post->post_author ),
			'authorId'    => (int) $post->post_author,
			'title'       => $post->post_title,
			'alt'         => (string) get_post_meta( $id, '_wp_attachment_image_alt', true ),
			'caption'     => $post->post_excerpt,
			'date'        => get_the_date( '', $post ),
			'description' => $post->post_content,
			'mime'        => $post->post_mime_type,
			'isVideo'     => $is_video,
			'width'       => $dims['w'],
			'height'      => $dims['h'],
			'filesize'    => $dims['bytes'],
			'colors'      => is_array( $colors ) ? $colors : array(),
			'folders'     => wp_get_object_terms( $id, self::FOLDER_TAX, array( 'fields' => 'ids' ) ),
			'tags'        => wp_get_object_terms( $id, self::TAG_TAX, array( 'fields' => 'ids' ) ),
		);
	}

	/* ------------------------- dimensions / backfill ---------------------- */

	/**
	 * Width, height and byte size of an attachment, from its metadata (with a
	 * filesystem fallback for the byte size on older WordPress).
	 *
	 * @param int $id Attachment id.
	 * @return array{w:int,h:int,bytes:int}
	 */
	private static function attachment_dims( $id ) {
		$meta  = wp_get_attachment_metadata( $id );
		$w     = isset( $meta['width'] ) ? (int) $meta['width'] : 0;
		$h     = isset( $meta['height'] ) ? (int) $meta['height'] : 0;
		$bytes = isset( $meta['filesize'] ) ? (int) $meta['filesize'] : 0;
		if ( ! $bytes ) {
			$file = get_attached_file( $id );
			if ( $file && file_exists( $file ) ) {
				$bytes = (int) filesize( $file );
			}
		}
		return array(
			'w'     => $w,
			'h'     => $h,
			'bytes' => $bytes,
		);
	}

	/**
	 * Store the numeric sort/filter meta (area, filesize, orientation) for one
	 * attachment. Idempotent.
	 *
	 * @param int $id Attachment id.
	 */
	private function ensure_sort_meta( $id ) {
		$d      = self::attachment_dims( $id );
		$area   = $d['w'] * $d['h'];
		$orient = $d['w'] && $d['h']
			? ( $d['w'] > $d['h'] ? 'l' : ( $d['w'] < $d['h'] ? 'p' : 's' ) )
			: 's';
		update_post_meta( $id, self::AREA_KEY, $area );
		update_post_meta( $id, self::FILESIZE_KEY, $d['bytes'] );
		update_post_meta( $id, self::ORIENT_KEY, $orient );
	}

	/**
	 * Keep the sort meta fresh whenever WordPress (re)generates attachment
	 * metadata (new upload, "regenerate thumbnails", editor save).
	 *
	 * @param array $metadata Generated metadata (passed through untouched).
	 * @param int   $id       Attachment id.
	 * @return array
	 */
	public function stamp_on_generate( $metadata, $id ) {
		$this->ensure_sort_meta( (int) $id );
		return $metadata;
	}

	/**
	 * Backfill the numeric sort meta for a batch of attachments that still
	 * lack it. The manager calls this in a loop on first open, so sorting by
	 * size works without a migration step.
	 *
	 * @param \WP_REST_Request $req Request.
	 * @return array
	 */
	public function backfill( \WP_REST_Request $req ) {
		$per = min( 200, max( 1, (int) ( $req->get_param( 'per' ) ?: 100 ) ) );
		$q   = new \WP_Query(
			array(
				'post_type'      => 'attachment',
				'post_status'    => 'inherit',
				'post_mime_type' => array_merge( self::MIMES, self::VIDEO_MIMES ),
				'posts_per_page' => $per,
				'fields'         => 'ids',
				// phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- bounded batch, editor-triggered.
				'meta_query'     => array(
					array(
						'key'     => self::AREA_KEY,
						'compare' => 'NOT EXISTS',
					),
				),
			)
		);
		foreach ( $q->posts as $id ) {
			// Per-object capability, like save_colors() does. (F-L06)
			if ( ! current_user_can( 'edit_post', (int) $id ) ) {
				continue;
			}
			$this->ensure_sort_meta( (int) $id );
		}
		return array(
			'done'      => count( $q->posts ),
			'remaining' => max( 0, (int) $q->found_posts - count( $q->posts ) ),
		);
	}

	/**
	 * A page of images that still need dominant-color extraction. Colors are
	 * computed in the browser (canvas, no model), so this pass works even
	 * without the semantic search model installed.
	 *
	 * @param \WP_REST_Request $req Request.
	 * @return array
	 */
	public function color_pending( \WP_REST_Request $req ) {
		$per = min( 40, max( 1, (int) ( $req->get_param( 'per' ) ?: 12 ) ) );
		$q   = new \WP_Query(
			array(
				'post_type'      => 'attachment',
				'post_status'    => 'inherit',
				// SVG has no meaningful raster colors; skip it here.
				'post_mime_type' => array( 'image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif' ),
				'posts_per_page' => $per,
				'fields'         => 'ids',
				// phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- bounded batch, editor-triggered.
				'meta_query'     => array(
					array(
						'key'     => self::COLORS_KEY,
						'compare' => 'NOT EXISTS',
					),
				),
			)
		);
		$items = array();
		foreach ( $q->posts as $id ) {
			$src = wp_get_attachment_image_src( $id, 'medium' );
			if ( $src ) {
				$items[] = array(
					'id'  => $id,
					'src' => $src[0],
				);
			} else {
				// Unreadable: tombstone with empty colors so it stops recurring.
				// Do not stamp a tombstone onto somebody else's attachment;
				// save_colors() checks edit_post, this route did not. (F-L05)
				if ( current_user_can( 'edit_post', (int) $id ) ) {
					update_post_meta( $id, self::COLORS_KEY, array() );
				}
			}
		}
		return array(
			'items'     => $items,
			'remaining' => max( 0, (int) $q->found_posts - count( $q->posts ) ),
		);
	}

	/**
	 * Store the dominant-color buckets for one attachment (browser computed).
	 *
	 * @param \WP_REST_Request $req Request.
	 * @return array|\WP_Error
	 */
	public function save_colors( \WP_REST_Request $req ) {
		$id = (int) $req['id'];
		if ( 'attachment' !== get_post_type( $id ) || ! current_user_can( 'edit_post', $id ) ) {
			return new \WP_Error( 'wpie_bad_attachment', __( 'Unknown attachment.', 'wunderpaint' ), array( 'status' => 404 ) );
		}
		$colors = $req->get_param( 'colors' );
		$clean  = array();
		if ( is_array( $colors ) ) {
			foreach ( array_slice( $colors, 0, 4 ) as $c ) {
				$c = sanitize_key( (string) $c );
				if ( '' !== $c ) {
					$clean[] = $c;
				}
			}
		}
		update_post_meta( $id, self::COLORS_KEY, $clean );
		return array( 'ok' => true );
	}

	/**
	 * Regenerate thumbnails + attachment metadata for the given ids.
	 *
	 * @param \WP_REST_Request $req Request.
	 * @return array|\WP_Error
	 */
	public function regenerate( \WP_REST_Request $req ) {
		$ids = array_values( array_filter( array_map( 'intval', (array) $req->get_param( 'ids' ) ) ) );
		if ( ! $ids ) {
			return new \WP_Error( 'wpie_no_ids', __( 'No images selected.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		require_once ABSPATH . 'wp-admin/includes/image.php';
		$done = 0;
		foreach ( $ids as $id ) {
			if ( 'attachment' !== get_post_type( $id ) || ! current_user_can( 'edit_post', $id ) ) {
				continue;
			}
			$file = get_attached_file( $id );
			if ( ! $file || ! file_exists( $file ) ) {
				continue;
			}
			$meta = wp_generate_attachment_metadata( $id, $file );
			if ( ! is_wp_error( $meta ) && $meta ) {
				wp_update_attachment_metadata( $id, $meta );
				$this->ensure_sort_meta( $id );
				$done++;
			}
		}
		return array(
			'ok'   => true,
			'done' => $done,
		);
	}

	/**
	 * Image attachments whose underlying file is missing on disk (capped).
	 *
	 * @return array
	 */
	public function broken() {
		$out = array();
		foreach ( $this->all_image_ids() as $id ) {
			$file = get_attached_file( $id );
			if ( ! $file || ! file_exists( $file ) ) {
				$out[] = $id;
				if ( count( $out ) >= 500 ) {
					break;
				}
			}
		}
		return array( 'ids' => $out );
	}

	/** Every image attachment id (ids-only query, used by the broken-file check). */
	private function all_image_ids() {
		$q = new \WP_Query(
			array(
				'post_type'      => 'attachment',
				'post_status'    => 'inherit',
				'post_mime_type' => self::MIMES,
				'posts_per_page' => -1,
				'fields'         => 'ids',
				'no_found_rows'  => true,
			)
		);
		return array_map( 'intval', $q->posts );
	}

	/* -------------------------------- folders ----------------------------- */

	/**
	 * Folder tree with counts.
	 *
	 * @return array
	 */
	public function list_folders() {
		return array( 'items' => $this->terms( self::FOLDER_TAX, true ) );
	}

	/**
	 * Tag list with counts.
	 *
	 * @return array
	 */
	public function list_tags() {
		return array( 'items' => $this->terms( self::TAG_TAX, false ) );
	}

	/**
	 * Serialize the terms of a taxonomy for the UI.
	 *
	 * @param string $taxonomy    Taxonomy.
	 * @param bool   $with_parent Include the parent id (folders).
	 * @return array
	 */
	private function terms( $taxonomy, $with_parent ) {
		$terms = get_terms(
			array(
				'taxonomy'   => $taxonomy,
				'hide_empty' => false,
				'orderby'    => 'name',
			)
		);
		if ( is_wp_error( $terms ) ) {
			return array();
		}
		$out = array();
		foreach ( $terms as $t ) {
			$row = array(
				'id'    => $t->term_id,
				'name'  => $t->name,
				'count' => (int) $t->count,
			);
			if ( $with_parent ) {
				$row['parent'] = (int) $t->parent;
			}
			$out[] = $row;
		}
		return $out;
	}

	/**
	 * Create a folder.
	 *
	 * @param \WP_REST_Request $req Request.
	 * @return array|\WP_Error
	 */
	public function create_folder( \WP_REST_Request $req ) {
		return $this->create_term( self::FOLDER_TAX, $req, true );
	}

	/**
	 * Create a tag.
	 *
	 * @param \WP_REST_Request $req Request.
	 * @return array|\WP_Error
	 */
	public function create_tag( \WP_REST_Request $req ) {
		return $this->create_term( self::TAG_TAX, $req, false );
	}

	/**
	 * Shared term creator.
	 *
	 * @param string           $taxonomy    Taxonomy.
	 * @param \WP_REST_Request $req         Request.
	 * @param bool             $with_parent Honor a parent id (folders).
	 * @return array|\WP_Error
	 */
	private function create_term( $taxonomy, $req, $with_parent ) {
		$name = sanitize_text_field( (string) $req->get_param( 'name' ) );
		if ( '' === $name ) {
			return new \WP_Error( 'wpie_bad_name', __( 'A name is required.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		$args = array();
		if ( $with_parent ) {
			$args['parent'] = max( 0, (int) $req->get_param( 'parent' ) );
		}
		$res = wp_insert_term( $name, $taxonomy, $args );
		if ( is_wp_error( $res ) ) {
			// A duplicate name is not an error here: return the existing term
			// so AI auto-tagging can reuse it instead of failing.
			$existing = $res->get_error_data( 'term_exists' );
			if ( $existing ) {
				$res = array( 'term_id' => (int) $existing );
			} else {
				return new \WP_Error( 'wpie_term_failed', $res->get_error_message(), array( 'status' => 400 ) );
			}
		}
		$term = get_term( $res['term_id'], $taxonomy );
		$row  = array(
			'id'    => (int) $res['term_id'],
			'name'  => $term ? $term->name : $name,
			'count' => 0,
		);
		if ( $with_parent ) {
			$row['parent'] = $term ? (int) $term->parent : 0;
		}
		return $row;
	}

	/**
	 * Rename / move a folder.
	 *
	 * @param \WP_REST_Request $req Request.
	 * @return array|\WP_Error
	 */
	public function update_folder( \WP_REST_Request $req ) {
		// Folders/tags are a shared taxonomy: renaming or moving one reshapes
		// every editor's media organisation, so limit it to users who may
		// manage taxonomies (editor+). wp_update_term itself checks no
		// capability, this callback is the only gate. (WPIE-010)
		if ( ! current_user_can( 'manage_categories' ) ) {
			return new \WP_Error( 'wpie_forbidden', __( 'You are not allowed to change shared folders.', 'wunderpaint' ), array( 'status' => rest_authorization_required_code() ) );
		}
		$id   = (int) $req['id'];
		$args = array();
		$name = $req->get_param( 'name' );
		if ( null !== $name ) {
			$args['name'] = sanitize_text_field( (string) $name );
		}
		if ( null !== $req->get_param( 'parent' ) ) {
			$parent = max( 0, (int) $req->get_param( 'parent' ) );
			if ( $parent === $id ) {
				return new \WP_Error( 'wpie_bad_parent', __( 'A folder cannot be its own parent.', 'wunderpaint' ), array( 'status' => 400 ) );
			}
			$args['parent'] = $parent;
		}
		if ( ! $args ) {
			return new \WP_Error( 'wpie_noop', __( 'Nothing to update.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		$res = wp_update_term( $id, self::FOLDER_TAX, $args );
		if ( is_wp_error( $res ) ) {
			return new \WP_Error( 'wpie_term_failed', $res->get_error_message(), array( 'status' => 400 ) );
		}
		return array( 'ok' => true );
	}

	/**
	 * Delete a folder (attachments keep, only the assignment is removed).
	 *
	 * @param \WP_REST_Request $req Request.
	 * @return array|\WP_Error
	 */
	public function delete_folder( \WP_REST_Request $req ) {
		return $this->delete_term( self::FOLDER_TAX, (int) $req['id'] );
	}

	/**
	 * Delete a tag.
	 *
	 * @param \WP_REST_Request $req Request.
	 * @return array|\WP_Error
	 */
	public function delete_tag( \WP_REST_Request $req ) {
		return $this->delete_term( self::TAG_TAX, (int) $req['id'] );
	}

	/**
	 * Shared term deleter.
	 *
	 * @param string $taxonomy Taxonomy.
	 * @param int    $id       Term id.
	 * @return array|\WP_Error
	 */
	private function delete_term( $taxonomy, $id ) {
		// Shared taxonomy: deleting a folder/tag removes it for the whole team,
		// so gate it on the taxonomy-management capability (WPIE-010).
		if ( ! current_user_can( 'manage_categories' ) ) {
			return new \WP_Error( 'wpie_forbidden', __( 'You are not allowed to delete shared folders or tags.', 'wunderpaint' ), array( 'status' => rest_authorization_required_code() ) );
		}
		$res = wp_delete_term( $id, $taxonomy );
		if ( is_wp_error( $res ) || ! $res ) {
			return new \WP_Error( 'wpie_term_failed', __( 'Could not delete.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		return array( 'ok' => true );
	}

	/* -------------------------------- assign ------------------------------ */

	/**
	 * Bulk folder / tag assignment. `folder` is single-valued (a move):
	 * pass a term id to place, 0 to remove from every folder; omit the key
	 * to leave folders untouched. Tags are additive via add/remove lists.
	 *
	 * @param \WP_REST_Request $req Request.
	 * @return array|\WP_Error
	 */
	public function assign( \WP_REST_Request $req ) {
		$ids = array_map( 'intval', (array) $req->get_param( 'ids' ) );
		$ids = array_values( array_filter( $ids ) );
		if ( ! $ids ) {
			return new \WP_Error( 'wpie_no_ids', __( 'No images selected.', 'wunderpaint' ), array( 'status' => 400 ) );
		}

		$has_folder  = null !== $req->get_param( 'folder' );
		$folder      = (int) $req->get_param( 'folder' );
		$add_tags    = array_values( array_filter( array_map( 'intval', (array) $req->get_param( 'addTags' ) ) ) );
		$remove_tags = array_values( array_filter( array_map( 'intval', (array) $req->get_param( 'removeTags' ) ) ) );

		$done = 0;
		foreach ( $ids as $id ) {
			if ( 'attachment' !== get_post_type( $id ) ) {
				continue;
			}
			if ( ! current_user_can( 'edit_post', $id ) ) {
				continue;
			}
			if ( $has_folder ) {
				wp_set_object_terms( $id, $folder ? array( $folder ) : array(), self::FOLDER_TAX, false );
			}
			if ( $add_tags ) {
				wp_set_object_terms( $id, $add_tags, self::TAG_TAX, true );
			}
			if ( $remove_tags ) {
				wp_remove_object_terms( $id, $remove_tags, self::TAG_TAX );
			}
			$done++;
		}
		return array(
			'ok'      => true,
			'updated' => $done,
			'folders' => $this->terms( self::FOLDER_TAX, true ),
			'tags'    => $this->terms( self::TAG_TAX, false ),
		);
	}

	/* -------------------------------- delete ------------------------------ */

	/**
	 * Trash or permanently delete attachments (per-item capability checked).
	 *
	 * @param \WP_REST_Request $req Request.
	 * @return array|\WP_Error
	 */
	public function bulk_delete( \WP_REST_Request $req ) {
		$ids   = array_values( array_filter( array_map( 'intval', (array) $req->get_param( 'ids' ) ) ) );
		$force = (bool) $req->get_param( 'force' );
		if ( ! $ids ) {
			return new \WP_Error( 'wpie_no_ids', __( 'No images selected.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		if ( ! $force ) {
			// This used to be wp_delete_attachment( $id, false ), which only
			// trashes when a site sets MEDIA_TRASH - and WordPress leaves that
			// off. On a stock install the attachment and its file were gone
			// for good while the dialog promised a restore. The holding room
			// keeps the same gesture honest: wp_trash_post works everywhere,
			// the file stays, and there is a UI to put it back (v1.353.0).
			// force=true here because the user picked these images by hand;
			// the in-use check belongs to the cleanup scan, not to a manual
			// delete that would otherwise refuse without saying why.
			$held = Media_Quarantine::hold( $ids, true );
			return array(
				'ok'      => true,
				'deleted' => $held['moved'],
				'held'    => true,
				'days'    => $held['days'],
			);
		}
		$deleted = array();
		foreach ( $ids as $id ) {
			if ( 'attachment' !== get_post_type( $id ) || ! current_user_can( 'delete_post', $id ) ) {
				continue;
			}
			if ( wp_delete_attachment( $id, true ) ) {
				$deleted[] = $id;
			}
		}
		return array(
			'ok'      => true,
			'deleted' => $deleted,
			'held'    => false,
		);
	}

	/* ---------------------------- smart folders --------------------------- */

	/**
	 * The current user's saved smart folders.
	 *
	 * @return array
	 */
	public function list_smart() {
		return array( 'items' => $this->smart_all() );
	}

	/** Raw smart-folder array for the current user. */
	private function smart_all() {
		$val = get_user_meta( get_current_user_id(), self::SMART_META, true );
		return is_array( $val ) ? array_values( $val ) : array();
	}

	/**
	 * Save a smart folder (a named query: semantic text or a filter flag).
	 *
	 * @param \WP_REST_Request $req Request.
	 * @return array|\WP_Error
	 */
	public function create_smart( \WP_REST_Request $req ) {
		$name = sanitize_text_field( (string) $req->get_param( 'name' ) );
		$kind = (string) $req->get_param( 'kind' );
		if ( '' === $name || ! in_array( $kind, array( 'semantic', 'filter' ), true ) ) {
			return new \WP_Error( 'wpie_bad_smart', __( 'A name and a valid kind are required.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		$params = $req->get_param( 'params' );
		$params = is_array( $params ) ? $this->sanitize_smart_params( $params ) : array();
		$item   = array(
			'id'     => substr( md5( $name . wp_json_encode( $params ) . uniqid( '', true ) ), 0, 12 ),
			'name'   => $name,
			'kind'   => $kind,
			'params' => $params,
		);
		$all   = $this->smart_all();
		$all[] = $item;
		update_user_meta( get_current_user_id(), self::SMART_META, $all );
		return $item;
	}

	/**
	 * Whitelist smart-folder params (semantic query text, filter flags).
	 *
	 * @param array $params Raw params.
	 * @return array
	 */
	private function sanitize_smart_params( $params ) {
		$out = array();
		if ( isset( $params['q'] ) ) {
			$out['q'] = sanitize_text_field( (string) $params['q'] );
		}
		foreach ( array( 'missingAlt', 'unused' ) as $flag ) {
			if ( ! empty( $params[ $flag ] ) ) {
				$out[ $flag ] = true;
			}
		}
		if ( isset( $params['mime'] ) ) {
			$out['mime'] = sanitize_text_field( (string) $params['mime'] );
		}
		return $out;
	}

	/**
	 * Delete a saved smart folder.
	 *
	 * @param \WP_REST_Request $req Request.
	 * @return array
	 */
	public function delete_smart( \WP_REST_Request $req ) {
		$id  = (string) $req['id'];
		$all = array_values(
			array_filter(
				$this->smart_all(),
				static function ( $s ) use ( $id ) {
					return ( $s['id'] ?? '' ) !== $id;
				}
			)
		);
		update_user_meta( get_current_user_id(), self::SMART_META, $all );
		return array( 'ok' => true );
	}
}
