<?php
/**
 * Usage scanner: post meta.
 *
 * The source that matters most in practice. On a builder site the page content
 * is often an empty shell and everything real lives in `_elementor_data`, in
 * ACF fields or in WooCommerce gallery lists.
 *
 * Two things here are load bearing:
 *
 * 1. Meta rows belonging to revisions are excluded via a join. Elementor keeps
 *    a full `_elementor_data` copy on every revision, so without the join an
 *    image dropped from a page three months ago still counts as used forever.
 *
 * 2. `_wp_attachment_metadata` and `_wp_attached_file` are on the deny list.
 *    They contain the attachment's own filename. Scanning them would make
 *    every image in the library a reference to itself, and nothing would ever
 *    be reported as unused.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Scans post meta.
 */
class Scanner_Postmeta extends Usage_Scanner {

	/**
	 * ACF image-ish field names, discovered once per request.
	 *
	 * @var array<string,bool>|null
	 */
	private $acf_fields = null;

	/**
	 * Stable key.
	 *
	 * @return string
	 */
	public function key() {
		return 'postmeta';
	}

	/**
	 * Display name.
	 *
	 * @return string
	 */
	public function label() {
		return __( 'Custom fields and builder data', 'wunderpaint' );
	}

	/**
	 * Meta keys that must never be scanned.
	 *
	 * @return array<string,bool>
	 */
	private function denied() {
		static $deny = null;
		if ( null !== $deny ) {
			return $deny;
		}
		$keys = array(
			// The attachment's own bookkeeping. Scanning these would make every
			// image reference itself.
			'_wp_attached_file',
			'_wp_attachment_metadata',
			'_wp_attachment_backup_sizes',
			'_wp_attachment_image_alt',
			// Generated caches. A reference that only exists here is derived
			// from something else, not a real use.
			'_elementor_css',
			'_elementor_element_cache',
			'_elementor_inspector_data',
			'_oembed_response',
			// Editor bookkeeping.
			'_edit_lock',
			'_edit_last',
			// Our own fields, including the ones this engine writes.
			'_wpie_usage',
			'_wpie_usage_count',
			'_wpie_area',
			'_wpie_filesize',
			'_wpie_orient',
			'_wpie_colors',
			'_wpie_quarantine',
		);
		/**
		 * Meta keys the usage engine must skip.
		 *
		 * @param string[] $keys Meta keys.
		 */
		$keys = (array) apply_filters( 'wpie_media_usage_denied_meta', $keys );
		$deny = array_fill_keys( $keys, true );
		return $deny;
	}

	/**
	 * Does this meta key hold a bare attachment id?
	 *
	 * @param string $key Meta key.
	 * @return bool
	 */
	private function is_id_key( $key ) {
		static $exact = null;
		static $suffix = null;
		if ( null === $exact ) {
			$exact = array_fill_keys(
				(array) apply_filters(
					'wpie_media_usage_id_meta_keys',
					array(
						'_thumbnail_id',
						'_product_image_gallery',
						'rank_math_facebook_image_id',
						'rank_math_twitter_image_id',
						'_yoast_wpseo_opengraph-image-id',
						'_yoast_wpseo_twitter-image-id',
					)
				),
				true
			);
			$suffix = array(
				'_image_id',
				'_img_id',
				'_logo_id',
				'_icon_id',
				'_photo_id',
				'_media_id',
				'_attachment_id',
				'_thumb_id',
				'_avatar_id',
				'_banner_id',
				'_background_id',
				'_cover_id',
				'_poster_id',
			);
		}
		if ( isset( $exact[ $key ] ) ) {
			return true;
		}
		foreach ( $suffix as $end ) {
			if ( strlen( $key ) > strlen( $end ) && substr( $key, -strlen( $end ) ) === $end ) {
				return true;
			}
		}
		return isset( $this->acf_image_fields()[ $key ] );
	}

	/**
	 * ACF fields whose type stores an attachment id.
	 *
	 * Read straight from the field definitions rather than through the ACF API,
	 * so this works whether or not ACF is loaded. Guessing from the value alone
	 * is not good enough: a plain number field would make attachment 5 look
	 * used on every site that stores a quantity of five.
	 *
	 * @return array<string,bool>
	 */
	private function acf_image_fields() {
		if ( null !== $this->acf_fields ) {
			return $this->acf_fields;
		}
		global $wpdb;
		$this->acf_fields = array();

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- one bounded read per request, memoised on the instance.
		$rows = $wpdb->get_results( "SELECT post_excerpt, post_content FROM {$wpdb->posts} WHERE post_type = 'acf-field' LIMIT 2000" );
		foreach ( $rows as $row ) {
			$name = trim( (string) $row->post_excerpt );
			if ( '' === $name ) {
				continue;
			}
			$conf = maybe_unserialize( $row->post_content );
			$type = is_array( $conf ) && isset( $conf['type'] ) ? (string) $conf['type'] : '';
			if ( 'image' === $type || 'gallery' === $type || 'file' === $type ) {
				$this->acf_fields[ $name ] = true;
			}
		}
		return $this->acf_fields;
	}

	/**
	 * Row count.
	 *
	 * @return int
	 */
	public function count() {
		global $wpdb;
		// Counted through the same join the sweep uses. Without it the total is
		// wildly off, because on a site with revision history roughly half of
		// postmeta belongs to revisions and is never read.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- fixed query, progress display only.
		return (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->postmeta} m INNER JOIN {$wpdb->posts} p ON p.ID = m.post_id WHERE p.post_type <> 'revision'" );
	}

	/**
	 * Walk a slice.
	 *
	 * @param int $cursor Last meta_id seen.
	 * @param int $limit  Limit.
	 * @return array
	 */
	public function scan( $cursor, $limit ) {
		global $wpdb;
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- keyset paginated sweep, values prepared.
		$rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT m.meta_id, m.post_id, m.meta_key, m.meta_value
				 FROM {$wpdb->postmeta} m
				 INNER JOIN {$wpdb->posts} p ON p.ID = m.post_id
				 WHERE m.meta_id > %d AND p.post_type <> 'revision'
				 ORDER BY m.meta_id ASC LIMIT %d",
				(int) $cursor,
				(int) $limit
			)
		);

		$out  = array();
		$last = (int) $cursor;
		foreach ( $rows as $row ) {
			$last = (int) $row->meta_id;
			$refs = $this->refs_from_row( (string) $row->meta_key, (string) $row->meta_value );
			if ( ! $refs ) {
				continue;
			}
			foreach ( $this->hits_from( $refs, (int) $row->post_id, '', '', '' ) as $hit ) {
				$out[] = $hit;
			}
		}
		return $this->slice( $out, $last, count( $rows ), $limit );
	}

	/**
	 * Extract references from one meta row.
	 *
	 * @param string $key   Meta key.
	 * @param string $value Meta value.
	 * @return array|null Refs, or null when the row is not worth parsing.
	 */
	private function refs_from_row( $key, $value ) {
		if ( '' === $value || isset( $this->denied()[ $key ] ) ) {
			return null;
		}

		if ( $this->is_id_key( $key ) ) {
			$ids = array();
			foreach ( $this->ids_in_value( $value ) as $id ) {
				$ids[] = $id;
			}
			if ( $ids ) {
				return array(
					'ids'   => $ids,
					'paths' => array(),
				);
			}
		}

		// Everything else only counts when it carries a real uploads URL, so
		// skip the expensive walk when the row cannot possibly contain one.
		if ( ! $this->mentions_uploads( $value ) ) {
			return null;
		}
		return $this->refs_from_data( $value, self::MODE_LOOSE );
	}

	/**
	 * Read attachment ids out of a value that is known to hold them.
	 *
	 * Covers the three shapes in the wild: a single id, a comma separated list
	 * the way WooCommerce stores product galleries, and a serialized array the
	 * way ACF stores a gallery.
	 *
	 * @param string $value Meta value.
	 * @return int[]
	 */
	private function ids_in_value( $value ) {
		$value = trim( $value );
		if ( is_numeric( $value ) ) {
			return (int) $value > 0 ? array( (int) $value ) : array();
		}
		if ( preg_match( '/^\d+(\s*,\s*\d+)*$/', $value ) ) {
			$out = array();
			foreach ( explode( ',', $value ) as $part ) {
				$id = (int) trim( $part );
				if ( $id > 0 ) {
					$out[] = $id;
				}
			}
			return $out;
		}
		if ( is_serialized( $value ) ) {
			$un  = maybe_unserialize( $value );
			$out = array();
			if ( is_array( $un ) ) {
				array_walk_recursive(
					$un,
					function ( $v ) use ( &$out ) {
						if ( is_numeric( $v ) && (int) $v > 0 ) {
							$out[] = (int) $v;
						}
					}
				);
			}
			return $out;
		}
		return array();
	}

	/**
	 * Find references to one attachment.
	 *
	 * @param int      $attachment_id Attachment.
	 * @param string[] $needles       Prefilter fragments.
	 * @return array[]
	 */
	public function find_for( $attachment_id, $needles ) {
		global $wpdb;

		$args = array();
		$like = $this->needle_sql( 'm.meta_value', $needles, $args );
		if ( '' === $like ) {
			return array();
		}
		$sql = "SELECT m.post_id, m.meta_key, m.meta_value, p.post_title, p.post_type
				FROM {$wpdb->postmeta} m
				INNER JOIN {$wpdb->posts} p ON p.ID = m.post_id
				WHERE p.post_type <> 'revision' AND $like
				LIMIT 400";
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared, PluginCheck.Security.DirectDB.UnescapedDBParameter -- assembled from fixed fragments, all values prepared.
		$rows = $wpdb->get_results( $wpdb->prepare( $sql, $args ) );

		$out  = array();
		$seen = array();
		foreach ( $rows as $row ) {
			$refs = $this->refs_from_row( (string) $row->meta_key, (string) $row->meta_value );
			if ( ! $refs || ! Media_Usage::refs_match( $refs, $attachment_id, $this->resolver ) ) {
				continue;
			}
			$post_id = (int) $row->post_id;
			if ( isset( $seen[ $post_id . '|' . $row->meta_key ] ) ) {
				continue;
			}
			$seen[ $post_id . '|' . $row->meta_key ] = true;

			$out[] = $this->hit(
				$attachment_id,
				'',
				$post_id,
				$row->post_title ? $row->post_title : __( '(no title)', 'wunderpaint' ),
				(string) get_edit_post_link( $post_id, 'raw' ),
				$this->context_for( (string) $row->meta_key )
			);
		}
		return $out;
	}

	/**
	 * Readable context for a meta key.
	 *
	 * @param string $key Meta key.
	 * @return string
	 */
	private function context_for( $key ) {
		$known = array(
			'_thumbnail_id'           => __( 'Featured image', 'wunderpaint' ),
			'_elementor_data'         => __( 'Elementor layout', 'wunderpaint' ),
			'_product_image_gallery'  => __( 'Product gallery', 'wunderpaint' ),
		);
		if ( isset( $known[ $key ] ) ) {
			return $known[ $key ];
		}
		if ( 0 === strpos( $key, 'rank_math_' ) || 0 === strpos( $key, '_yoast_' ) ) {
			return __( 'SEO social image', 'wunderpaint' );
		}
		/* translators: %s: custom field name. */
		return sprintf( __( 'Custom field %s', 'wunderpaint' ), $key );
	}
}
