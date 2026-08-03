<?php
/**
 * Usage scanner: post content.
 *
 * Walks `post_content` for every post type except revisions. Revisions are
 * excluded on purpose. Every past version of a page would otherwise count as a
 * live reference and almost nothing would ever look unused.
 *
 * Trashed posts DO count as used, with the context saying so. A trashed page
 * can be restored, and keeping one image too many is cheap while deleting a
 * live one is not.
 *
 * Note on `post_parent`: an attachment uploaded through the post editor keeps
 * that post as its parent forever, whether or not it was ever inserted. That
 * makes parentage useless as a usage signal, so it is reported as context in
 * the UI and never as a reference.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Scans post content.
 */
class Scanner_Content extends Usage_Scanner {

	/**
	 * Stable key.
	 *
	 * @return string
	 */
	public function key() {
		return 'content';
	}

	/**
	 * Display name.
	 *
	 * @return string
	 */
	public function label() {
		return __( 'Post content', 'wunderpaint' );
	}

	/**
	 * SQL condition shared by count and scan.
	 *
	 * @return string
	 */
	private function where() {
		return "post_type NOT IN ('revision','attachment') AND post_status <> 'auto-draft' AND post_content <> ''";
	}

	/**
	 * Row count.
	 *
	 * @return int
	 */
	public function count() {
		global $wpdb;
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQL.NotPrepared, PluginCheck.Security.DirectDB.UnescapedDBParameter -- fixed condition string, no user input.
		return (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->posts} WHERE " . $this->where() );
	}

	/**
	 * Content rows are the fattest source, so they move in smaller slices.
	 *
	 * @return int
	 */
	public function max_chunk() {
		return 60;
	}

	/**
	 * Walk a slice.
	 *
	 * @param int $cursor Last post id seen.
	 * @param int $limit  Limit.
	 * @return array
	 */
	public function scan( $cursor, $limit ) {
		global $wpdb;
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQL.NotPrepared, PluginCheck.Security.DirectDB.UnescapedDBParameter -- fixed condition string, cursor and limit prepared.
		$rows = $wpdb->get_results( $wpdb->prepare( "SELECT ID, post_content FROM {$wpdb->posts} WHERE ID > %d AND " . $this->where() . ' ORDER BY ID ASC LIMIT %d', (int) $cursor, (int) $limit ) );

		$out  = array();
		$last = (int) $cursor;
		foreach ( $rows as $row ) {
			$last = (int) $row->ID;
			$refs = $this->refs_from_text( $row->post_content );
			foreach ( $this->hits_from( $refs, (int) $row->ID, '', '', '' ) as $hit ) {
				$out[] = $hit;
			}
		}
		return $this->slice( $out, $last, count( $rows ), $limit );
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
		$like = $this->needle_sql( 'post_content', $needles, $args );
		if ( '' === $like ) {
			return array();
		}
		$sql = "SELECT ID, post_title, post_type, post_status, post_content FROM {$wpdb->posts} WHERE " . $this->where() . " AND $like ORDER BY ID ASC LIMIT 200";
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared, PluginCheck.Security.DirectDB.UnescapedDBParameter -- assembled from fixed fragments, all values prepared.
		$rows = $wpdb->get_results( $wpdb->prepare( $sql, $args ) );

		$out = array();
		foreach ( $rows as $row ) {
			$refs = $this->refs_from_text( $row->post_content );
			if ( ! Media_Usage::refs_match( $refs, $attachment_id, $this->resolver ) ) {
				continue;
			}
			$obj = get_post_type_object( $row->post_type );
			$ctx = $obj && ! empty( $obj->labels->singular_name ) ? $obj->labels->singular_name : $row->post_type;
			if ( 'trash' === $row->post_status ) {
				/* translators: %s: post type name. */
				$ctx = sprintf( __( '%s (in the trash)', 'wunderpaint' ), $ctx );
			} elseif ( 'publish' !== $row->post_status ) {
				$status = get_post_status_object( $row->post_status );
				if ( $status && ! empty( $status->label ) ) {
					/* translators: 1: post type name, 2: post status. */
					$ctx = sprintf( __( '%1$s (%2$s)', 'wunderpaint' ), $ctx, $status->label );
				}
			}
			$out[] = $this->hit(
				$attachment_id,
				'',
				(int) $row->ID,
				$row->post_title ? $row->post_title : __( '(no title)', 'wunderpaint' ),
				(string) get_edit_post_link( (int) $row->ID, 'raw' ),
				$ctx
			);
		}
		return $out;
	}
}
