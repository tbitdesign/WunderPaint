<?php
/**
 * Usage scanner: term meta and user meta.
 *
 * Category and product-category images live in term meta, and WooCommerce puts
 * its category thumbnail there under `thumbnail_id`. User meta occasionally
 * holds a local avatar. Both are small tables, walked in two phases behind one
 * cursor: `t:<meta_id>` for terms, then `u:<meta_id>` for users.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Scans term and user meta.
 */
class Scanner_Terms extends Usage_Scanner {

	/**
	 * Stable key.
	 *
	 * @return string
	 */
	public function key() {
		return 'terms';
	}

	/**
	 * Display name.
	 *
	 * @return string
	 */
	public function label() {
		return __( 'Categories and user profiles', 'wunderpaint' );
	}

	/**
	 * Row count across both tables.
	 *
	 * @return int
	 */
	public function count() {
		global $wpdb;
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- fixed query, progress display only.
		$terms = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->termmeta}" );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- fixed query, progress display only.
		$users = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->usermeta}" );
		return $terms + $users;
	}

	/**
	 * Meta keys that carry a bare attachment id here.
	 *
	 * @param string $key Meta key.
	 * @return bool
	 */
	private function is_id_key( $key ) {
		$exact = (array) apply_filters(
			'wpie_media_usage_term_id_meta_keys',
			array( 'thumbnail_id', 'category_image_id', 'wpie_image_id' )
		);
		if ( in_array( $key, $exact, true ) ) {
			return true;
		}
		foreach ( array( '_image_id', '_thumb_id', '_thumbnail_id', '_logo_id', '_icon_id', '_avatar_id' ) as $end ) {
			if ( strlen( $key ) > strlen( $end ) && substr( $key, -strlen( $end ) ) === $end ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Extract references from a meta row.
	 *
	 * @param string $key   Meta key.
	 * @param string $value Meta value.
	 * @return array|null
	 */
	private function refs_from_row( $key, $value ) {
		if ( '' === $value ) {
			return null;
		}
		if ( $this->is_id_key( $key ) && is_numeric( trim( $value ) ) && (int) $value > 0 ) {
			return array(
				'ids'   => array( (int) $value ),
				'paths' => array(),
			);
		}
		if ( ! $this->mentions_uploads( $value ) ) {
			return null;
		}
		return $this->refs_from_data( $value, self::MODE_LOOSE );
	}

	/**
	 * Walk a slice, terms first and users second.
	 *
	 * @param mixed $cursor Phase cursor.
	 * @param int   $limit  Limit.
	 * @return array
	 */
	public function scan( $cursor, $limit ) {
		global $wpdb;

		$cursor = (string) $cursor;
		$phase  = ( '' === $cursor || '0' === $cursor || 't' === substr( $cursor, 0, 1 ) ) ? 't' : 'u';
		$last   = (int) substr( $cursor, 2 );
		if ( '' === $cursor || '0' === $cursor ) {
			$last = 0;
		}

		$table = 't' === $phase ? $wpdb->termmeta : $wpdb->usermeta;
		$idcol = 't' === $phase ? 'term_id' : 'user_id';
		// The two meta tables do not agree on their primary key name: termmeta
		// uses `meta_id`, usermeta uses `umeta_id`.
		$pk = 't' === $phase ? 'meta_id' : 'umeta_id';
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQL.NotPrepared, PluginCheck.Security.DirectDB.UnescapedDBParameter -- table and column names from a fixed branch, values prepared.
		$rows = $wpdb->get_results( $wpdb->prepare( "SELECT $pk AS pk, $idcol AS obj, meta_key, meta_value FROM $table WHERE $pk > %d ORDER BY $pk ASC LIMIT %d", $last, (int) $limit ) );

		$out = array();
		foreach ( $rows as $row ) {
			$last = (int) $row->pk;
			$refs = $this->refs_from_row( (string) $row->meta_key, (string) $row->meta_value );
			if ( ! $refs ) {
				continue;
			}
			foreach ( $this->hits_from( $refs, (int) $row->obj, '', '', '' ) as $hit ) {
				$out[] = $hit;
			}
		}

		$exhausted = count( $rows ) < $limit;
		if ( $exhausted && 't' === $phase ) {
			// Terms done, hand over to users without reporting completion.
			return $this->slice( $out, 'u:0', count( $rows ), $limit, false );
		}
		return $this->slice( $out, $phase . ':' . $last, count( $rows ), $limit, $exhausted && 'u' === $phase );
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

		$out = array();
		foreach ( array( 'term', 'user' ) as $kind ) {
			$args = array();
			$like = $this->needle_sql( 'meta_value', $needles, $args );
			if ( '' === $like ) {
				continue;
			}
			$table = 'term' === $kind ? $wpdb->termmeta : $wpdb->usermeta;
			$idcol = 'term' === $kind ? 'term_id' : 'user_id';
			$sql   = "SELECT $idcol AS obj, meta_key, meta_value FROM $table WHERE $like LIMIT 100";
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared, PluginCheck.Security.DirectDB.UnescapedDBParameter -- table name from a fixed branch, all values prepared.
			$rows = $wpdb->get_results( $wpdb->prepare( $sql, $args ) );

			foreach ( $rows as $row ) {
				$refs = $this->refs_from_row( (string) $row->meta_key, (string) $row->meta_value );
				if ( ! $refs || ! Media_Usage::refs_match( $refs, $attachment_id, $this->resolver ) ) {
					continue;
				}
				$obj = (int) $row->obj;
				if ( 'term' === $kind ) {
					$term  = get_term( $obj );
					$label = ( $term && ! is_wp_error( $term ) ) ? $term->name : (string) $obj;
					$edit  = ( $term && ! is_wp_error( $term ) ) ? (string) get_edit_term_link( $obj, $term->taxonomy ) : '';
					$ctx   = __( 'Category or term image', 'wunderpaint' );
				} else {
					$user  = get_userdata( $obj );
					$label = $user ? $user->display_name : (string) $obj;
					$edit  = admin_url( 'user-edit.php?user_id=' . $obj );
					$ctx   = __( 'User profile', 'wunderpaint' );
				}
				$out[] = $this->hit( $attachment_id, '', $obj, $label, $edit, $ctx );
			}
		}
		return $out;
	}
}
