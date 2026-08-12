<?php
/**
 * Shared base for the usage scanners.
 *
 * Every scanner walks one kind of source (post content, postmeta, options,
 * term and user meta, our own project data) and reports where an attachment is
 * referenced. Two access shapes, one set of extractors:
 *
 *   scan( offset, limit )   sweep mode, used by the full library run
 *   find_for( id )          single image mode, used by "where is this used?"
 *
 * find_for prefilters its rows with a LIKE on loose needles and then runs the
 * same extractors, so a needle hit only ever costs a parse. The verdict itself
 * is always made by the extractors, never by the prefilter.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Base class for a single usage source.
 */
abstract class Usage_Scanner {

	/**
	 * Trust the numeric `id` / `ids` keys in a structure. Correct for block
	 * attributes, where those keys mean an attachment and nothing else.
	 */
	const MODE_BLOCK = 'block';

	/**
	 * Only trust `{ id, url }` pairs and bare uploads URLs. Correct for
	 * arbitrary plugin meta, where `id` could be anything at all.
	 */
	const MODE_LOOSE = 'loose';

	/**
	 * Image extensions worth resolving.
	 */
	const EXT = 'jpe?g|png|gif|webp|avif|svg|bmp|ico';

	/**
	 * URL resolver.
	 *
	 * @var Usage_Resolver
	 */
	protected $resolver;

	/**
	 * Constructor.
	 *
	 * @param Usage_Resolver $resolver Shared resolver.
	 */
	public function __construct( Usage_Resolver $resolver ) {
		$this->resolver = $resolver;
	}

	/* ------------------------------ contract ------------------------------ */

	/**
	 * Stable key used in progress state and in hit records.
	 *
	 * @return string
	 */
	abstract public function key();

	/**
	 * Human readable name for the progress display.
	 *
	 * @return string
	 */
	abstract public function label();

	/**
	 * Whether the `obj` id in this scanner's hits is a post id.
	 *
	 * The usage answer is filtered per user before it leaves the REST route:
	 * a hit that names a post is only shown to somebody who may read that
	 * post, because the hit carries that post's title and an edit link.
	 * Scanners whose objects are not posts (options, terms) say so here.
	 *
	 * The default is true on purpose. A scanner registered through
	 * `wpie_media_usage_sources` that never thought about this gets the
	 * stricter treatment, and hiding a place is the harmless mistake -
	 * showing the title of somebody else's draft is not.
	 *
	 * @return bool
	 */
	public function objects_are_posts() {
		return true;
	}

	/**
	 * How many rows this scanner has to walk in total.
	 *
	 * @return int
	 */
	abstract public function count();

	/**
	 * Walk one slice of the source.
	 *
	 * Keyset pagination, not OFFSET. A postmeta table with a million rows makes
	 * `LIMIT n OFFSET 900000` crawl, because the database still has to count
	 * its way there. The cursor is the last primary key seen.
	 *
	 * The cursor is opaque to the caller and is stored verbatim in the run
	 * state, so a scanner that walks more than one table can encode its phase
	 * in there (see Scanner_Terms).
	 *
	 * @param mixed $cursor Cursor from the previous call, 0 to start.
	 * @param int   $limit  Row count.
	 * @return array{hits:array[],cursor:mixed,done:bool,rows:int}
	 */
	abstract public function scan( $cursor, $limit );

	/**
	 * Largest slice this scanner wants to be handed.
	 *
	 * @return int
	 */
	public function max_chunk() {
		return 400;
	}

	/**
	 * Shape a scan result.
	 *
	 * @param array[] $hits   Hit records.
	 * @param mixed   $cursor Next cursor.
	 * @param int     $rows   Rows consumed.
	 * @param int     $limit  Slice size that was requested.
	 * @param bool    $done   Force completion, for scanners that know better.
	 * @return array{hits:array[],cursor:mixed,done:bool,rows:int}
	 */
	protected function slice( $hits, $cursor, $rows, $limit, $done = null ) {
		return array(
			'hits'   => $hits,
			'cursor' => $cursor,
			'done'   => null === $done ? $rows < $limit : (bool) $done,
			'rows'   => (int) $rows,
		);
	}

	/**
	 * Find references to one attachment only.
	 *
	 * @param int      $attachment_id Attachment.
	 * @param string[] $needles       Loose prefilter fragments.
	 * @return array[] Hit records.
	 */
	abstract public function find_for( $attachment_id, $needles );

	/* ----------------------------- extractors ----------------------------- */

	/**
	 * Pull attachment references out of a blob of markup.
	 *
	 * Covers the classic editor, the block editor and anything that ends up as
	 * HTML: `wp-image-N` classes, gallery shortcodes, block comment attributes
	 * and plain URLs in src, srcset, href and CSS.
	 *
	 * @param string $text Markup.
	 * @return array{ids:int[],paths:string[]} Direct ids and paths to resolve.
	 */
	protected function refs_from_text( $text ) {
		$ids   = array();
		$paths = array();
		$text  = (string) $text;
		if ( '' === $text ) {
			return array(
				'ids'   => $ids,
				'paths' => $paths,
			);
		}

		// The `wp-image-N` class core puts on inserted images.
		if ( preg_match_all( '/wp-image-(\d+)/', $text, $m ) ) {
			foreach ( $m[1] as $v ) {
				$ids[] = (int) $v;
			}
		}

		// Gallery and playlist shortcodes: [gallery ids="4,5,6"].
		if ( preg_match_all( '/\bids\s*=\s*["\']([\d,\s]+)["\']/', $text, $m ) ) {
			foreach ( $m[1] as $list ) {
				foreach ( preg_split( '/[,\s]+/', $list ) as $v ) {
					if ( '' !== trim( (string) $v ) ) {
						$ids[] = (int) $v;
					}
				}
			}
		}

		// Block comments carry their attributes as JSON. Inside a block those
		// numeric id keys really do mean attachments, so parse them strictly.
		if ( false !== strpos( $text, '<!-- wp:' ) && preg_match_all( '/<!--\s+wp:[a-z0-9\/-]+\s+(\{.*?\})\s+(?:\/)?-->/s', $text, $m ) ) {
			foreach ( $m[1] as $json ) {
				$data = json_decode( $json, true );
				if ( is_array( $data ) ) {
					$this->walk_data( $data, self::MODE_BLOCK, $ids, $paths );
				}
			}
		}

		// Every uploads URL in the blob, whatever attribute it sits in.
		foreach ( $this->urls_in( $text ) as $url ) {
			$paths[] = $url;
		}

		return array(
			'ids'   => $ids,
			'paths' => $paths,
		);
	}

	/**
	 * Pull attachment references out of a structured value.
	 *
	 * Handles serialized meta, JSON strings and nested arrays alike, which is
	 * what page builders and custom field plugins actually store.
	 *
	 * @param mixed  $value Raw value.
	 * @param string $mode  MODE_BLOCK or MODE_LOOSE.
	 * @return array{ids:int[],paths:string[]}
	 */
	protected function refs_from_data( $value, $mode = self::MODE_LOOSE ) {
		$ids   = array();
		$paths = array();
		$this->walk_data( $value, $mode, $ids, $paths );
		return array(
			'ids'   => $ids,
			'paths' => $paths,
		);
	}

	/**
	 * Recursive worker behind refs_from_data.
	 *
	 * @param mixed    $value Node.
	 * @param string   $mode  Strictness.
	 * @param int[]    $ids   Collected ids, by reference.
	 * @param string[] $paths Collected paths, by reference.
	 * @param int      $depth Recursion guard.
	 * @return void
	 */
	private function walk_data( $value, $mode, &$ids, &$paths, $depth = 0 ) {
		if ( $depth > 12 ) {
			return;
		}

		if ( is_string( $value ) ) {
			$trimmed = ltrim( $value );
			// A JSON blob inside a string, which is how Elementor stores a page.
			if ( '' !== $trimmed && ( '{' === $trimmed[0] || '[' === $trimmed[0] ) ) {
				$decoded = json_decode( $value, true );
				if ( is_array( $decoded ) ) {
					$this->walk_data( $decoded, $mode, $ids, $paths, $depth + 1 );
					return;
				}
			}
			// A serialized array inside a string, which is how meta nests.
			if ( is_serialized( $value ) ) {
				$un = maybe_unserialize( $value );
				if ( is_array( $un ) || is_object( $un ) ) {
					$this->walk_data( $un, $mode, $ids, $paths, $depth + 1 );
					return;
				}
			}
			foreach ( $this->urls_in( $value ) as $url ) {
				$paths[] = $url;
			}
			return;
		}

		if ( is_object( $value ) ) {
			$value = get_object_vars( $value );
		}
		if ( ! is_array( $value ) ) {
			return;
		}

		// The `{ id: 123, url: ".../uploads/..." }` shape every image control
		// in every page builder produces. Trustworthy in any mode, because the
		// URL right next to the id proves what the id means.
		if ( isset( $value['id'] ) && isset( $value['url'] ) && is_scalar( $value['url'] ) ) {
			$rel = $this->resolver->to_relative( (string) $value['url'] );
			if ( '' !== $rel && is_numeric( $value['id'] ) && (int) $value['id'] > 0 ) {
				$ids[] = (int) $value['id'];
			} elseif ( '' !== $rel ) {
				$paths[] = (string) $value['url'];
			}
		}

		foreach ( $value as $key => $child ) {
			if ( self::MODE_BLOCK === $mode && is_string( $key ) ) {
				// Block attributes name their attachments plainly.
				if ( ( 'id' === $key || 'mediaId' === $key || 'imageId' === $key || 'backgroundId' === $key ) && is_numeric( $child ) && (int) $child > 0 ) {
					$ids[] = (int) $child;
					continue;
				}
				if ( 'ids' === $key && is_array( $child ) ) {
					foreach ( $child as $v ) {
						if ( is_numeric( $v ) && (int) $v > 0 ) {
							$ids[] = (int) $v;
						}
					}
					continue;
				}
			}
			$this->walk_data( $child, $mode, $ids, $paths, $depth + 1 );
		}
	}

	/**
	 * Could this blob mention an uploaded file at all?
	 *
	 * Used as a cheap gate before the expensive walk. It has to know about JSON
	 * slash escaping: Elementor stores `wp-content\/uploads\/...`, so a plain
	 * strpos for `wp-content/uploads` misses every builder page on the site and
	 * quietly disables the most important source there is.
	 *
	 * @param string $text Haystack.
	 * @return bool
	 */
	protected function mentions_uploads( $text ) {
		$seg = $this->resolver->uploads_segment();
		if ( false !== strpos( $text, $seg ) ) {
			return true;
		}
		return false !== strpos( $text, str_replace( '/', '\\/', $seg ) );
	}

	/**
	 * Every uploads image URL inside a string.
	 *
	 * @param string $text Haystack.
	 * @return string[] Raw URLs.
	 */
	protected function urls_in( $text ) {
		$text = (string) $text;
		if ( false === strpos( $text, '/' ) ) {
			return array();
		}
		// JSON escapes its slashes; normalise before matching.
		if ( false !== strpos( $text, '\\/' ) ) {
			$text = str_replace( '\\/', '/', $text );
		}
		$seg = preg_quote( $this->resolver->uploads_segment(), '#' );
		$re  = '#/' . $seg . '/[^\s"\'<>()\\\\]+?\.(?:' . self::EXT . ')#i';
		if ( ! preg_match_all( $re, $text, $m ) ) {
			return array();
		}
		return array_unique( $m[0] );
	}

	/* ------------------------------- helpers ------------------------------ */

	/**
	 * Build one hit record.
	 *
	 * @param int    $id    Attachment id, or 0 when only a path is known.
	 * @param string $path  Uploads-relative path to resolve later.
	 * @param int    $obj   Object the reference lives in.
	 * @param string $label Human readable object name.
	 * @param string $edit  Edit link, may be empty.
	 * @param string $ctx   Short context label.
	 * @return array
	 */
	protected function hit( $id, $path, $obj, $label, $edit, $ctx ) {
		return array(
			'id'    => (int) $id,
			'path'  => (string) $path,
			'src'   => $this->key(),
			'obj'   => (int) $obj,
			'label' => (string) $label,
			'edit'  => (string) $edit,
			'ctx'   => (string) $ctx,
		);
	}

	/**
	 * Turn an extractor result into hit records.
	 *
	 * @param array  $refs  Result of refs_from_text or refs_from_data.
	 * @param int    $obj   Object id.
	 * @param string $label Object label.
	 * @param string $edit  Edit link.
	 * @param string $ctx   Context label.
	 * @return array[]
	 */
	protected function hits_from( $refs, $obj, $label, $edit, $ctx ) {
		$out = array();
		foreach ( array_unique( $refs['ids'] ) as $id ) {
			$out[] = $this->hit( $id, '', $obj, $label, $edit, $ctx );
		}
		foreach ( array_unique( $refs['paths'] ) as $path ) {
			$out[] = $this->hit( 0, $path, $obj, $label, $edit, $ctx );
		}
		return $out;
	}

	/**
	 * SQL fragment matching any of the needles against a column.
	 *
	 * @param string   $column  Column name, must be a literal.
	 * @param string[] $needles Loose fragments.
	 * @param array    $args    Prepare args, by reference.
	 * @return string SQL, or empty when there is nothing to match.
	 */
	protected function needle_sql( $column, $needles, &$args ) {
		global $wpdb;
		$parts = array();
		foreach ( $needles as $needle ) {
			if ( '' === (string) $needle ) {
				continue;
			}
			$parts[] = "$column LIKE %s";
			$args[]  = '%' . $wpdb->esc_like( (string) $needle ) . '%';
		}
		return $parts ? '(' . implode( ' OR ', $parts ) . ')' : '';
	}
}
