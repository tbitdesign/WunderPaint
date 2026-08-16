<?php
/**
 * Orphaned files: bytes in uploads that no attachment claims.
 *
 * The mirror image of the existing "Find broken files" tool, which looks for
 * attachments whose file is gone. This looks for files whose attachment is
 * gone, and on a site that has been through a few imports and plugin migrations
 * that is usually where the disk actually went.
 *
 * The matching is done per directory instead of by building one giant set of
 * every known path: for `2026/07` we ask the database which originals live
 * there, and a file counts as known when its own name is in that set or when
 * stripping the size suffix lands on a name that is. That keeps a 50k library
 * from turning into a 400k element array in memory.
 *
 * Everything WunderPaint generates lives in a directory starting with `wpie-`,
 * and all of those are skipped by prefix rather than by an explicit list, so a
 * directory added next year is protected without anyone remembering to come
 * back here. Deleting the font library because it has no attachment rows would
 * be a spectacular way to fail.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Finds and quarantines files with no attachment.
 */
class Media_Orphans {

	/** Where quarantined files are parked, relative to uploads. */
	const HOLD_DIR = 'wpie-quarantine';

	/** Index of parked files. */
	const HOLD_OPTION = 'wpie_orphan_hold';

	/** Extensions worth reporting. */
	const EXT = array( 'jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'bmp', 'ico', 'pdf', 'mp4', 'webm', 'mov', 'zip', 'psd' );

	/**
	 * Register hooks.
	 */
	public function hooks() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	/**
	 * Directory names that are never scanned.
	 *
	 * @return string[] Lower case names, matched against the first path segment.
	 */
	public static function skip_dirs() {
		$skip = array(
			// Other people's generated content.
			'elementor',
			'cache',
			'woocommerce_uploads',
			'wc-logs',
			'mailpoet',
			'ai1wm-backups',
			'backup',
			'backups',
			'backwpup',
			'updraft',
			'wp-personal-data-exports',
			'sites',
			'et-cache',
			'uag-plugin',
			'essential-addons-elementor',
		);
		/**
		 * Directories inside uploads that the orphan scan must leave alone.
		 *
		 * Anything starting with `wpie-` is skipped regardless of this list.
		 *
		 * @param string[] $skip Directory names.
		 */
		return array_map( 'strtolower', (array) apply_filters( 'wpie_media_orphan_skip_dirs', $skip ) );
	}

	/**
	 * Is this top level directory off limits?
	 *
	 * @param string $name Directory name.
	 * @return bool
	 */
	private static function skipped( $name ) {
		$name = strtolower( $name );
		if ( 0 === strpos( $name, 'wpie-' ) ) {
			return true;
		}
		return in_array( $name, self::skip_dirs(), true );
	}

	/**
	 * Every directory under uploads worth walking, uploads-relative.
	 *
	 * @return string[] Includes '' for the uploads root itself.
	 */
	public static function directories() {
		$base = trailingslashit( wp_get_upload_dir()['basedir'] );
		$out  = array( '' );

		$top = @scandir( $base ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- an unreadable uploads dir is reported as an empty scan, not a fatal.
		if ( ! $top ) {
			return $out;
		}
		foreach ( $top as $entry ) {
			if ( '.' === $entry || '..' === $entry || ! is_dir( $base . $entry ) || self::skipped( $entry ) ) {
				continue;
			}
			$out[] = $entry;
			$sub   = @scandir( $base . $entry ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- same.
			foreach ( (array) $sub as $child ) {
				if ( '.' === $child || '..' === $child || ! is_dir( $base . $entry . '/' . $child ) ) {
					continue;
				}
				$out[] = $entry . '/' . $child;
			}
		}
		sort( $out );
		return $out;
	}

	/**
	 * Scan one directory for files no attachment claims.
	 *
	 * @param string $rel Uploads-relative directory, '' for the root.
	 * @return array{files:array[],capped:bool}
	 */
	public static function scan_dir( $rel ) {
		global $wpdb;

		$base = trailingslashit( wp_get_upload_dir()['basedir'] );
		$dir  = $base . ( '' === $rel ? '' : trailingslashit( $rel ) );
		$out  = array();

		$entries = @scandir( $dir ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- unreadable directories are simply not reported.
		if ( ! $entries ) {
			return array(
				'files'  => $out,
				'capped' => false,
			);
		}

		// Originals the database knows about in exactly this directory.
		$like             = '' === $rel ? '%' : $wpdb->esc_like( $rel . '/' ) . '%';
		$wpdb->last_error = '';
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- bounded to one directory, values prepared.
		$rows = $wpdb->get_col( $wpdb->prepare( "SELECT meta_value FROM {$wpdb->postmeta} WHERE meta_key = '_wp_attached_file' AND meta_value LIKE %s", $like ) );
		// This list is what makes a file NOT an orphan. If the query failed it
		// comes back empty, and every single file in the directory would then
		// be offered as unreferenced. Report nothing rather than everything.
		if ( '' !== (string) $wpdb->last_error ) {
			return array(
				'files'  => array(),
				'capped' => false,
				'error'  => true,
			);
		}
		$known = array();
		foreach ( $rows as $stored ) {
			// A LIKE on `2026/%` also catches `2026/07/x.jpg`, so compare the
			// directory part rather than trusting the pattern.
			if ( ltrim( (string) dirname( '/' . $stored ), '/' ) !== $rel ) {
				continue;
			}
			$known[ strtolower( wp_basename( (string) $stored ) ) ] = true;
		}

		// Files core generated from those originals: every registered size, plus
		// whatever an edit left behind in the backup sizes.
		$resolver = Media_Usage::resolver();
		$capped   = false;
		$seen     = 0;

		foreach ( $entries as $entry ) {
			if ( '.' === $entry || '..' === $entry || is_dir( $dir . $entry ) ) {
				continue;
			}
			if ( '' === $rel && self::skipped( $entry ) ) {
				continue;
			}
			$ext = strtolower( (string) pathinfo( $entry, PATHINFO_EXTENSION ) );
			if ( ! in_array( $ext, self::EXT, true ) ) {
				continue;
			}
			// Index guards and the like are not media.
			if ( 'index.php' === $entry || '.htaccess' === $entry ) {
				continue;
			}

			$lower = strtolower( $entry );
			if ( isset( $known[ $lower ] ) ) {
				continue;
			}
			// A generated size counts as claimed when its original is claimed.
			$stripped = strtolower( wp_basename( $resolver->strip_size( $entry ) ) );
			if ( isset( $known[ $stripped ] ) ) {
				continue;
			}

			++$seen;
			if ( $seen > 2000 ) {
				$capped = true;
				break;
			}

			$path = $dir . $entry;
			$relp = ( '' === $rel ? '' : $rel . '/' ) . $entry;
			// An orphan has no attachment, so there is no thumbnail to ask for.
			// The file itself is still sitting in a public directory though, so
			// the plain uploads URL is the only preview available, and it is
			// enough to recognise what you are about to throw away.
			$out[] = array(
				'path' => $relp,
				'url'  => in_array( $ext, array( 'jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg' ), true )
					? trailingslashit( wp_get_upload_dir()['baseurl'] ) . $relp
					: '',
				'size' => (int) @filesize( $path ), // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- a vanished file reports zero.
				'time' => (int) @filemtime( $path ), // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- same.
			);
		}

		return array(
			'files'  => $out,
			'capped' => $capped,
		);
	}

	/**
	 * Whether an uploads-relative path is an attachment's file, and so NOT an
	 * orphan. Mirrors scan_dir()'s definition exactly: a match is either the
	 * stored original (_wp_attached_file) or a generated size of one (the
	 * size-stripped basename resolves to a known original). Any database error
	 * returns true, so a file is kept rather than moved on incomplete data.
	 *
	 * @param string $rel Uploads-relative path.
	 * @return bool True when the file is referenced (in use).
	 */
	private static function is_referenced( $rel ) {
		global $wpdb;
		$rel = ltrim( str_replace( '\\', '/', (string) $rel ), '/' );
		if ( '' === $rel ) {
			return true;
		}
		$dir = ltrim( (string) dirname( '/' . $rel ), '/' );
		$like             = '' === $dir ? '%' : $wpdb->esc_like( $dir . '/' ) . '%';
		$wpdb->last_error = '';
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- bounded to one directory, value prepared.
		$rows = $wpdb->get_col( $wpdb->prepare( "SELECT meta_value FROM {$wpdb->postmeta} WHERE meta_key = '_wp_attached_file' AND meta_value LIKE %s", $like ) );
		if ( '' !== (string) $wpdb->last_error ) {
			return true; // Fail closed: do not move on an incomplete answer.
		}
		$known = array();
		foreach ( $rows as $stored ) {
			if ( ltrim( (string) dirname( '/' . $stored ), '/' ) !== $dir ) {
				continue;
			}
			$known[ strtolower( wp_basename( (string) $stored ) ) ] = true;
		}
		$entry = wp_basename( $rel );
		if ( isset( $known[ strtolower( $entry ) ] ) ) {
			return true;
		}
		$stripped = strtolower( wp_basename( Media_Usage::resolver()->strip_size( $entry ) ) );
		return isset( $known[ $stripped ] );
	}

	/* ------------------------------ quarantine ----------------------------- */

	/**
	 * Move orphaned files into the holding area.
	 *
	 * Same principle as the attachment quarantine: nothing is destroyed on the
	 * day it is found. The file moves, the move is recorded, and it can be put
	 * back byte for byte.
	 *
	 * @param string[] $paths Uploads-relative paths.
	 * @return array
	 */
	public static function hold( $paths ) {
		$base = trailingslashit( wp_get_upload_dir()['basedir'] );
		$hold = $base . self::HOLD_DIR;
		if ( ! is_dir( $hold ) ) {
			wp_mkdir_p( $hold );
			Helpers::protect_upload_dirs();
		}

		$index = (array) get_option( self::HOLD_OPTION, array() );
		$moved = array();

		foreach ( (array) $paths as $rel ) {
			$rel = ltrim( str_replace( '\\', '/', (string) $rel ), '/' );
			// Refuse anything that tries to climb out of uploads.
			if ( '' === $rel || false !== strpos( $rel, '..' ) || 0 === strpos( $rel, self::HOLD_DIR ) ) {
				continue;
			}
			$src = $base . $rel;
			if ( ! is_file( $src ) ) {
				continue;
			}
			// Only genuine orphans may move, whatever the caller sent. The
			// scan is what decides orphan status, but nothing forced a caller
			// to have run it, so re-check here against the same definition:
			// a file that IS an attachment's original or one of its generated
			// sizes is in use and must stay put. Fails closed on a DB error.
			if ( self::is_referenced( $rel ) ) {
				continue;
			}
			$dst = $hold . '/' . str_replace( '/', '__', $rel );
			if ( ! @rename( $src, $dst ) ) { // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.rename_rename -- a failed move is reported, not fatal.
				continue;
			}
			$index[] = array(
				'rel'  => $rel,
				'file' => wp_basename( $dst ),
				'at'   => time(),
				'size' => (int) @filesize( $dst ), // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- best effort.
			);
			$moved[] = $rel;
		}

		update_option( self::HOLD_OPTION, array_values( $index ), false );
		return array(
			'ok'    => true,
			'moved' => $moved,
			'days'  => Media_Quarantine::days(),
		);
	}

	/**
	 * Put held files back where they came from.
	 *
	 * @param string[] $paths Uploads-relative paths, empty for all.
	 * @return array
	 */
	public static function restore( $paths = array() ) {
		$base  = trailingslashit( wp_get_upload_dir()['basedir'] );
		$hold  = $base . self::HOLD_DIR . '/';
		$index = (array) get_option( self::HOLD_OPTION, array() );
		$want  = array_flip( array_map( 'strval', (array) $paths ) );
		$back  = array();
		$keep  = array();

		foreach ( $index as $rec ) {
			$rel = (string) ( $rec['rel'] ?? '' );
			if ( $want && ! isset( $want[ $rel ] ) ) {
				$keep[] = $rec;
				continue;
			}
			$src = $hold . (string) ( $rec['file'] ?? '' );
			$dst = $base . $rel;
			if ( ! is_file( $src ) ) {
				continue;
			}
			wp_mkdir_p( dirname( $dst ) );
			if ( @rename( $src, $dst ) ) { // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.rename_rename -- reported, not fatal.
				$back[] = $rel;
				continue;
			}
			$keep[] = $rec;
		}

		update_option( self::HOLD_OPTION, array_values( $keep ), false );
		return array(
			'ok'       => true,
			'restored' => $back,
		);
	}

	/**
	 * Files currently held, and which of them are due for release.
	 *
	 * @return array
	 */
	public static function held() {
		$days   = Media_Quarantine::days();
		$cutoff = time() - ( $days * DAY_IN_SECONDS );
		$out    = array();
		foreach ( (array) get_option( self::HOLD_OPTION, array() ) as $rec ) {
			$at    = (int) ( $rec['at'] ?? 0 );
			$out[] = array(
				'rel'     => (string) ( $rec['rel'] ?? '' ),
				'size'    => (int) ( $rec['size'] ?? 0 ),
				'at'      => $at,
				'expires' => $at + ( $days * DAY_IN_SECONDS ),
				'due'     => $at <= $cutoff,
			);
		}
		return $out;
	}

	/**
	 * Delete held files whose retention period is over.
	 *
	 * @return array
	 */
	public static function purge() {
		$base    = trailingslashit( wp_get_upload_dir()['basedir'] );
		$hold    = $base . self::HOLD_DIR . '/';
		$cutoff  = time() - ( Media_Quarantine::days() * DAY_IN_SECONDS );
		$index   = (array) get_option( self::HOLD_OPTION, array() );
		$keep    = array();
		$deleted = 0;

		foreach ( $index as $rec ) {
			if ( (int) ( $rec['at'] ?? 0 ) > $cutoff ) {
				$keep[] = $rec;
				continue;
			}
			$file = $hold . (string) ( $rec['file'] ?? '' );
			if ( is_file( $file ) ) {
				wp_delete_file( $file );
				++$deleted;
			}
		}
		update_option( self::HOLD_OPTION, array_values( $keep ), false );
		return array(
			'ok'      => true,
			'deleted' => $deleted,
		);
	}

	/* --------------------------------- REST -------------------------------- */

	/**
	 * REST routes under wpie/v1/media-orphans/*.
	 */
	/**
	 * Who may run media maintenance. This tool scans the whole uploads tree
	 * and moves files out of it, which is site-wide housekeeping, not
	 * per-attachment editing. Gating it on the editor capability let any
	 * upload_files user (Author and up) hand in the paths of IN-USE files -
	 * a site's logo, another user's images - and have them relocated, then
	 * permanently deleted by the retention cron. It belongs to the site
	 * administrator, like WP's own bulk media deletion.
	 *
	 * @return bool
	 */
	public static function can_manage() {
		return current_user_can( 'manage_options' );
	}

	public function register_routes() {
		$perm = array( self::class, 'can_manage' );

		register_rest_route(
			WPIE_REST_NS,
			'/media-orphans/dirs',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'rest_dirs' ),
				'permission_callback' => $perm,
			)
		);
		register_rest_route(
			WPIE_REST_NS,
			'/media-orphans/scan',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'rest_scan' ),
				'permission_callback' => $perm,
			)
		);
		register_rest_route(
			WPIE_REST_NS,
			'/media-orphans/hold',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'rest_hold' ),
				'permission_callback' => $perm,
			)
		);
		register_rest_route(
			WPIE_REST_NS,
			'/media-orphans/held',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( $this, 'rest_held' ),
					'permission_callback' => $perm,
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'rest_restore' ),
					'permission_callback' => $perm,
				),
			)
		);
	}

	/**
	 * GET /media-orphans/dirs
	 *
	 * @return array
	 */
	public function rest_dirs() {
		return array( 'dirs' => self::directories() );
	}

	/**
	 * POST /media-orphans/scan
	 *
	 * @param \WP_REST_Request $req Request.
	 * @return array
	 */
	public function rest_scan( \WP_REST_Request $req ) {
		$dir = (string) $req->get_param( 'dir' );
		$dir = ltrim( str_replace( array( '\\', '..' ), '', $dir ), '/' );
		return self::scan_dir( $dir );
	}

	/**
	 * POST /media-orphans/hold
	 *
	 * @param \WP_REST_Request $req Request.
	 * @return array|\WP_Error
	 */
	public function rest_hold( \WP_REST_Request $req ) {
		$paths = (array) $req->get_param( 'paths' );
		if ( ! $paths ) {
			return new \WP_Error( 'wpie_no_paths', __( 'No files selected.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		return self::hold( $paths );
	}

	/**
	 * GET /media-orphans/held
	 *
	 * @return array
	 */
	public function rest_held() {
		return array(
			'items' => self::held(),
			'days'  => Media_Quarantine::days(),
		);
	}

	/**
	 * POST /media-orphans/held
	 *
	 * @param \WP_REST_Request $req Request.
	 * @return array
	 */
	public function rest_restore( \WP_REST_Request $req ) {
		if ( $req->get_param( 'purge' ) ) {
			return self::purge();
		}
		return self::restore( (array) $req->get_param( 'paths' ) );
	}
}
