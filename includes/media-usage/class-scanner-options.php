<?php
/**
 * Usage scanner: options.
 *
 * Catches the references nobody thinks about until an image disappears: the
 * site icon, the custom logo, header and background images, and every widget
 * that holds media. The options table is small enough to walk completely, so
 * this scanner does not try to guess which options matter.
 *
 * Transients are skipped. They are caches by definition, and a reference that
 * only lives in a cache is not a reason to keep a file. Our own stores are
 * skipped too, because Scanner_Wunderpaint reports those with better labels.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Scans the options table.
 */
class Scanner_Options extends Usage_Scanner {

	/**
	 * Stable key.
	 *
	 * @return string
	 */
	public function key() {
		return 'options';
	}

	/**
	 * Options are site furniture, not posts; hits carry no post id.
	 *
	 * @return bool
	 */
	public function objects_are_posts() {
		return false;
	}

	/**
	 * Display name.
	 *
	 * @return string
	 */
	public function label() {
		return __( 'Site settings and widgets', 'wunderpaint' );
	}

	/**
	 * Options handled elsewhere or not worth reading.
	 *
	 * @return string
	 */
	private function where() {
		$own = array( Projects::OPTION, Templates::OPTION, User_Library::OPTION, Palettes::OPTION, WPIE_OPTION, 'wpie_usage_scan' );
		$out = array( "option_name NOT LIKE '\_transient%'", "option_name NOT LIKE '\_site_transient%'" );
		foreach ( $own as $name ) {
			$out[] = "option_name <> '" . esc_sql( $name ) . "'";
		}
		return implode( ' AND ', $out );
	}

	/**
	 * Row count.
	 *
	 * @return int
	 */
	public function count() {
		global $wpdb;
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQL.NotPrepared, PluginCheck.Security.DirectDB.UnescapedDBParameter -- fixed condition string (option names esc_sql'd), no user input.
		return (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->options} WHERE " . $this->where() );
	}

	/**
	 * Walk a slice.
	 *
	 * @param mixed $cursor Last option_id seen.
	 * @param int   $limit  Limit.
	 * @return array
	 */
	public function scan( $cursor, $limit ) {
		global $wpdb;
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQL.NotPrepared, PluginCheck.Security.DirectDB.UnescapedDBParameter -- fixed condition string (option names esc_sql'd), values prepared.
		$rows = $wpdb->get_results( $wpdb->prepare( "SELECT option_id, option_name, option_value FROM {$wpdb->options} WHERE option_id > %d AND " . $this->where() . ' ORDER BY option_id ASC LIMIT %d', (int) $cursor, (int) $limit ) );

		$out  = array();
		$last = (int) $cursor;
		foreach ( $rows as $row ) {
			$last = (int) $row->option_id;
			$refs = $this->refs_from_option( (string) $row->option_name, (string) $row->option_value );
			if ( ! $refs ) {
				continue;
			}
			foreach ( $this->hits_from( $refs, 0, '', '', '' ) as $hit ) {
				$out[] = $hit;
			}
		}
		return $this->slice( $out, $last, count( $rows ), $limit );
	}

	/**
	 * Extract references from one option.
	 *
	 * @param string $name  Option name.
	 * @param string $value Option value.
	 * @return array|null
	 */
	private function refs_from_option( $name, $value ) {
		if ( '' === $value ) {
			return null;
		}

		// Options that hold a bare attachment id.
		if ( 'site_icon' === $name && is_numeric( $value ) && (int) $value > 0 ) {
			return array(
				'ids'   => array( (int) $value ),
				'paths' => array(),
			);
		}

		// Theme mods keep the logo as an id and the header and background as URLs.
		if ( 0 === strpos( $name, 'theme_mods_' ) ) {
			$mods = maybe_unserialize( $value );
			$ids  = array();
			if ( is_array( $mods ) ) {
				foreach ( array( 'custom_logo', 'site_logo' ) as $key ) {
					if ( ! empty( $mods[ $key ] ) && is_numeric( $mods[ $key ] ) ) {
						$ids[] = (int) $mods[ $key ];
					}
				}
			}
			$refs        = $this->refs_from_data( $mods, self::MODE_LOOSE );
			$refs['ids'] = array_merge( $refs['ids'], $ids );
			return $refs;
		}

		// Media widgets name their attachment plainly.
		if ( 0 === strpos( $name, 'widget_media_' ) ) {
			return $this->refs_from_data( maybe_unserialize( $value ), self::MODE_BLOCK );
		}

		if ( ! $this->mentions_uploads( $value ) ) {
			return null;
		}
		return $this->refs_from_data( $value, self::MODE_LOOSE );
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
		$like = $this->needle_sql( 'option_value', $needles, $args );
		if ( '' === $like ) {
			return array();
		}
		$sql = "SELECT option_name, option_value FROM {$wpdb->options} WHERE " . $this->where() . " AND $like LIMIT 200";
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared, PluginCheck.Security.DirectDB.UnescapedDBParameter -- assembled from fixed fragments, all values prepared.
		$rows = $wpdb->get_results( $wpdb->prepare( $sql, $args ) );

		$out = array();
		foreach ( $rows as $row ) {
			$refs = $this->refs_from_option( (string) $row->option_name, (string) $row->option_value );
			if ( ! $refs || ! Media_Usage::refs_match( $refs, $attachment_id, $this->resolver ) ) {
				continue;
			}
			$out[] = $this->hit(
				$attachment_id,
				'',
				0,
				$this->pretty_name( (string) $row->option_name ),
				$this->link_for( (string) $row->option_name ),
				__( 'Site setting', 'wunderpaint' )
			);
		}
		return $out;
	}

	/**
	 * Readable label for an option.
	 *
	 * @param string $name Option name.
	 * @return string
	 */
	private function pretty_name( $name ) {
		$known = array(
			'site_icon' => __( 'Site icon', 'wunderpaint' ),
		);
		if ( isset( $known[ $name ] ) ) {
			return $known[ $name ];
		}
		if ( 0 === strpos( $name, 'theme_mods_' ) ) {
			return __( 'Theme settings (logo, header, background)', 'wunderpaint' );
		}
		if ( 0 === strpos( $name, 'widget_' ) ) {
			/* translators: %s: widget option name. */
			return sprintf( __( 'Widget: %s', 'wunderpaint' ), substr( $name, 7 ) );
		}
		return $name;
	}

	/**
	 * Where to send someone who wants to change this reference.
	 *
	 * @param string $name Option name.
	 * @return string
	 */
	private function link_for( $name ) {
		if ( 'site_icon' === $name || 0 === strpos( $name, 'theme_mods_' ) ) {
			return admin_url( 'customize.php' );
		}
		if ( 0 === strpos( $name, 'widget_' ) ) {
			return admin_url( 'widgets.php' );
		}
		return '';
	}
}
