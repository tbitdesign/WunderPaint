<?php
/**
 * Usage scanner: our own data.
 *
 * The gap that made this whole engine worth building. Saved designs, templates,
 * the asset library and brand kits all reference attachments, and none of them
 * live anywhere a generic scanner would look: the indexes sit in options while
 * the documents themselves are JSON sidecars under `uploads/wpie-versions`,
 * gzipped at rest since v1.282.
 *
 * Without this scanner, deleting an "unused" image would quietly break a saved
 * project, and the user would only find out on opening it.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Scans WunderPaint's own stores.
 */
class Scanner_Wunderpaint extends Usage_Scanner {

	/**
	 * Stable key.
	 *
	 * @return string
	 */
	public function key() {
		return 'wunderpaint';
	}

	/**
	 * Display name.
	 *
	 * @return string
	 */
	public function label() {
		return __( 'Saved designs and templates', 'wunderpaint' );
	}

	/**
	 * Sidecar documents are read from disk, so keep the slices small.
	 *
	 * @return int
	 */
	public function max_chunk() {
		return 40;
	}

	/**
	 * Documents on disk plus one step for the option stores.
	 *
	 * @return int
	 */
	public function count() {
		return count( $this->documents() ) + 1;
	}

	/**
	 * Every design and template sidecar, sorted so the cursor stays stable.
	 *
	 * @return array[] Records with path, label and kind.
	 */
	private function documents() {
		static $docs = null;
		if ( null !== $docs ) {
			return $docs;
		}
		$docs = array();
		foreach ( array(
			'design'   => Projects::dir(),
			'template' => Templates::dir(),
		) as $kind => $dir ) {
			if ( ! is_dir( $dir ) ) {
				continue;
			}
			$found = glob( trailingslashit( $dir ) . '*.json*' );
			if ( ! $found ) {
				continue;
			}
			sort( $found );
			foreach ( $found as $path ) {
				$docs[] = array(
					'path' => $path,
					'kind' => $kind,
				);
			}
		}
		return $docs;
	}

	/**
	 * Option stores that can name an attachment.
	 *
	 * @return array<string,string> Option name => label.
	 */
	private function stores() {
		return array(
			Projects::OPTION     => __( 'Saved designs', 'wunderpaint' ),
			Templates::OPTION    => __( 'Templates', 'wunderpaint' ),
			User_Library::OPTION => __( 'Asset library', 'wunderpaint' ),
			Palettes::OPTION     => __( 'Palettes', 'wunderpaint' ),
			WPIE_OPTION          => __( 'Brand kits and settings', 'wunderpaint' ),
		);
	}

	/**
	 * References inside one document or store value.
	 *
	 * Layers carry their image as a `src` URL, which the loose walk already
	 * finds. The extra regex covers records that only keep the attachment id,
	 * which cannot be inferred from structure because our own layer objects
	 * have an `id` of their own that means something else entirely.
	 *
	 * @param string $raw Raw JSON.
	 * @return array
	 */
	private function refs_from_json( $raw ) {
		$refs = $this->refs_from_data( $raw, self::MODE_LOOSE );
		if ( preg_match_all( '/"(?:attachmentId|attachment_id|mediaId|sourceId)"\s*:\s*(\d+)/', $raw, $m ) ) {
			foreach ( $m[1] as $id ) {
				if ( (int) $id > 0 ) {
					$refs['ids'][] = (int) $id;
				}
			}
		}
		return $refs;
	}

	/**
	 * Walk a slice: the option stores first, then the documents on disk.
	 *
	 * @param mixed $cursor Phase cursor.
	 * @param int   $limit  Limit.
	 * @return array
	 */
	public function scan( $cursor, $limit ) {
		$cursor = (string) $cursor;

		if ( '' === $cursor || '0' === $cursor ) {
			$out = array();
			foreach ( $this->stores() as $name => $label ) {
				$value = get_option( $name, '' );
				if ( ! $value ) {
					continue;
				}
				$refs = $this->refs_from_json( is_scalar( $value ) ? (string) $value : (string) wp_json_encode( $value ) );
				foreach ( $this->hits_from( $refs, 0, $label, '', '' ) as $hit ) {
					$out[] = $hit;
				}
			}
			return $this->slice( $out, 'f:0', 1, $limit, false );
		}

		$start = (int) substr( $cursor, 2 );
		$docs  = $this->documents();
		$slice = array_slice( $docs, $start, $limit );

		$out = array();
		foreach ( $slice as $doc ) {
			$raw = (string) \wpie_read_json_file( $doc['path'] );
			if ( '' === $raw ) {
				continue;
			}
			foreach ( $this->hits_from( $this->refs_from_json( $raw ), 0, wp_basename( $doc['path'] ), '', '' ) as $hit ) {
				$out[] = $hit;
			}
		}

		$next = $start + count( $slice );
		return $this->slice( $out, 'f:' . $next, count( $slice ), $limit, $next >= count( $docs ) );
	}

	/**
	 * Find references to one attachment.
	 *
	 * @param int      $attachment_id Attachment.
	 * @param string[] $needles       Prefilter fragments.
	 * @return array[]
	 */
	public function find_for( $attachment_id, $needles ) {
		$out = array();

		foreach ( $this->stores() as $name => $label ) {
			$value = get_option( $name, '' );
			if ( ! $value ) {
				continue;
			}
			$raw = is_scalar( $value ) ? (string) $value : (string) wp_json_encode( $value );
			if ( ! $this->has_needle( $raw, $needles ) ) {
				continue;
			}
			if ( Media_Usage::refs_match( $this->refs_from_json( $raw ), $attachment_id, $this->resolver ) ) {
				$out[] = $this->hit( $attachment_id, '', 0, $label, '', __( 'WunderPaint data', 'wunderpaint' ) );
			}
		}

		foreach ( $this->documents() as $doc ) {
			$raw = (string) \wpie_read_json_file( $doc['path'] );
			if ( '' === $raw || ! $this->has_needle( $raw, $needles ) ) {
				continue;
			}
			if ( ! Media_Usage::refs_match( $this->refs_from_json( $raw ), $attachment_id, $this->resolver ) ) {
				continue;
			}
			$title = $this->title_for( $doc );
			$ctx   = 'design' === $doc['kind'] ? __( 'Saved design', 'wunderpaint' ) : __( 'Template', 'wunderpaint' );
			$out[] = $this->hit( $attachment_id, '', 0, $title, '', $ctx );
		}
		return $out;
	}

	/**
	 * Cheap prefilter for file contents.
	 *
	 * @param string   $raw     Haystack.
	 * @param string[] $needles Fragments.
	 * @return bool
	 */
	private function has_needle( $raw, $needles ) {
		foreach ( $needles as $needle ) {
			if ( '' !== (string) $needle && false !== strpos( $raw, (string) $needle ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Readable name for a document, from the index when we can find it.
	 *
	 * @param array $doc Document record.
	 * @return string
	 */
	private function title_for( $doc ) {
		$base  = wp_basename( $doc['path'] );
		$id    = preg_replace( '/\.json(\.gz)?$/', '', $base );
		$index = 'design' === $doc['kind'] ? Projects::index() : (array) get_option( Templates::OPTION, array() );
		foreach ( $index as $record ) {
			if ( is_array( $record ) && ( $record['id'] ?? '' ) === $id ) {
				return (string) ( $record['name'] ?? $record['title'] ?? $id );
			}
		}
		return $id;
	}
}
