<?php
/**
 * Turns image URLs found in content into attachment ids.
 *
 * Deliberately batch shaped: the scanners collect uploads-relative paths while
 * they walk their rows and hand the whole basket over at the end of a chunk,
 * so a run costs a couple of IN() lookups instead of one query per hit. There
 * is no in-memory basename map on purpose. Building one for a 50k library and
 * pushing it through a transient is exactly the shape that took the site down
 * on 2026-07-11.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * URL to attachment id resolution for the usage engine.
 */
class Usage_Resolver {

	/**
	 * Uploads directory relative to the WordPress root, e.g. `wp-content/uploads`.
	 *
	 * @var string
	 */
	private $uploads_rel = '';

	/**
	 * Resolved paths from this request, keyed by relative path.
	 *
	 * @var array<string,int>
	 */
	private $memo = array();

	/**
	 * Read the uploads location once.
	 */
	public function __construct() {
		$dir = wp_get_upload_dir();
		$rel = '';
		if ( ! empty( $dir['baseurl'] ) ) {
			$parts = wp_parse_url( $dir['baseurl'] );
			$rel   = isset( $parts['path'] ) ? trim( $parts['path'], '/' ) : '';
		}
		$this->uploads_rel = $rel ? $rel : 'wp-content/uploads';
	}

	/**
	 * The uploads path segment used to recognise our own URLs.
	 *
	 * @return string
	 */
	public function uploads_segment() {
		return $this->uploads_rel;
	}

	/**
	 * Reduce any image URL to a path relative to the uploads directory.
	 *
	 * Domain agnostic by design. Comparing hosts breaks on every migration,
	 * which is how 410 fonts died on 2026-07-27, and it also misses protocol
	 * relative and root relative references that are perfectly common.
	 *
	 * @param string $url Candidate URL or path.
	 * @return string Relative path like `2026/07/photo.jpg`, empty if not ours.
	 */
	public function to_relative( $url ) {
		$url = trim( (string) $url );
		if ( '' === $url ) {
			return '';
		}

		// Drop query and fragment, decode entities that survive in markup.
		$url = html_entity_decode( $url, ENT_QUOTES, 'UTF-8' );
		$url = preg_replace( '/[?#].*$/', '', $url );
		$url = str_replace( '\\/', '/', $url );

		$needle = '/' . $this->uploads_rel . '/';
		$at     = strpos( $url, $needle );
		if ( false === $at ) {
			// Bare relative path such as `2026/07/photo.jpg`.
			if ( preg_match( '#^\d{4}/\d{2}/[^/]+$#', $url ) ) {
				return $url;
			}
			return '';
		}

		$rel = substr( $url, $at + strlen( $needle ) );
		$rel = ltrim( $rel, '/' );

		// A trailing slash or a directory reference is not a file.
		if ( '' === $rel || '/' === substr( $rel, -1 ) ) {
			return '';
		}
		return $rel;
	}

	/**
	 * Strip the generated size suffix so `photo-300x200.jpg` points at `photo.jpg`.
	 *
	 * Also folds the `-scaled` and `-rotated` variants core creates for large
	 * uploads, since those are the attachment's own file under another name.
	 *
	 * @param string $rel Uploads-relative path.
	 * @return string Path of the original file.
	 */
	public function strip_size( $rel ) {
		$rel = preg_replace( '/-\d+x\d+(?=\.[A-Za-z0-9]+$)/', '', (string) $rel );
		$rel = preg_replace( '/-(?:scaled|rotated)(?=\.[A-Za-z0-9]+$)/', '', $rel );
		return $rel;
	}

	/**
	 * Resolve a basket of uploads-relative paths to attachment ids.
	 *
	 * Two passes: an exact match on `_wp_attached_file`, then a basename match
	 * for whatever is left over. The second pass catches references that point
	 * at a different year folder than the attachment currently lives in, which
	 * happens after imports and after `wp media regenerate`.
	 *
	 * @param string[] $paths Uploads-relative paths, size suffixes still allowed.
	 * @return array<string,int> Original path => attachment id. Misses are omitted.
	 */
	public function resolve_paths( array $paths ) {
		global $wpdb;

		$out   = array();
		$want  = array();
		foreach ( $paths as $raw ) {
			$rel = $this->strip_size( $this->to_relative( $raw ) );
			if ( '' === $rel ) {
				continue;
			}
			if ( isset( $this->memo[ $rel ] ) ) {
				$out[ $raw ] = $this->memo[ $rel ];
				continue;
			}
			$want[ $rel ][] = $raw;
		}
		if ( ! $want ) {
			return $out;
		}

		$keys = array_keys( $want );

		// Pass one: exact stored path.
		$chunks = array_chunk( $keys, 200 );
		foreach ( $chunks as $chunk ) {
			$ph = implode( ',', array_fill( 0, count( $chunk ), '%s' ) );
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare, PluginCheck.Security.DirectDB.UnescapedDBParameter -- $ph is a list of %s placeholders built from a counted array, values passed through prepare below.
			$rows = $wpdb->get_results( $wpdb->prepare( "SELECT post_id, meta_value FROM {$wpdb->postmeta} WHERE meta_key = '_wp_attached_file' AND meta_value IN ($ph)", $chunk ) );
			foreach ( $rows as $row ) {
				$rel = (string) $row->meta_value;
				if ( ! isset( $want[ $rel ] ) ) {
					continue;
				}
				$this->memo[ $rel ] = (int) $row->post_id;
				foreach ( $want[ $rel ] as $raw ) {
					$out[ $raw ] = (int) $row->post_id;
				}
				unset( $want[ $rel ] );
			}
		}
		if ( ! $want ) {
			return $out;
		}

		// Pass two: basename only, for references that moved folders.
		$left = array_keys( $want );
		foreach ( array_chunk( $left, 100 ) as $chunk ) {
			$where = array();
			$args  = array();
			foreach ( $chunk as $rel ) {
				$where[] = '(meta_value = %s OR meta_value LIKE %s)';
				$args[]  = wp_basename( $rel );
				$args[]  = '%/' . $wpdb->esc_like( wp_basename( $rel ) );
			}
			$sql = "SELECT post_id, meta_value FROM {$wpdb->postmeta} WHERE meta_key = '_wp_attached_file' AND (" . implode( ' OR ', $where ) . ')';
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared, PluginCheck.Security.DirectDB.UnescapedDBParameter -- $sql is assembled from fixed fragments, all values go through prepare.
			$rows = $wpdb->get_results( $wpdb->prepare( $sql, $args ) );

			// A basename can belong to several attachments in different year
			// folders. Every candidate counts as used: keeping one image too
			// many is a cosmetic problem, deleting a live one is not.
			foreach ( $rows as $row ) {
				$base = wp_basename( (string) $row->meta_value );
				foreach ( $chunk as $rel ) {
					if ( wp_basename( $rel ) !== $base || ! isset( $want[ $rel ] ) ) {
						continue;
					}
					foreach ( $want[ $rel ] as $raw ) {
						$out[ $raw ] = (int) $row->post_id;
					}
				}
			}
		}

		return $out;
	}

	/**
	 * Resolve a single URL. Convenience for the per-image lookup.
	 *
	 * @param string $url Candidate URL.
	 * @return int Attachment id, 0 when unknown.
	 */
	public function resolve_url( $url ) {
		$hit = $this->resolve_paths( array( $url ) );
		return $hit ? (int) reset( $hit ) : 0;
	}

	/**
	 * Search fragments that a row must contain to be worth parsing for one image.
	 *
	 * Used to prefilter rows in the single-image lookup. These are deliberately
	 * loose: a hit here only means "parse this row", the exact decision is made
	 * by the extractors. False positives cost a parse, never a wrong verdict.
	 *
	 * @param int $attachment_id Attachment.
	 * @return string[] Needles, already unescaped.
	 */
	public function needles_for( $attachment_id ) {
		$attachment_id = (int) $attachment_id;
		$needles       = array( (string) $attachment_id );

		$file = get_post_meta( $attachment_id, '_wp_attached_file', true );
		if ( $file ) {
			$base = wp_basename( $this->strip_size( (string) $file ) );
			$dot  = strrpos( $base, '.' );
			$stem = false === $dot ? $base : substr( $base, 0, $dot );
			if ( strlen( $stem ) > 2 ) {
				$needles[] = $stem;
			}
		}
		return array_values( array_unique( array_filter( $needles ) ) );
	}
}
