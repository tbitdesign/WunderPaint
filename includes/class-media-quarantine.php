<?php
/**
 * Quarantine: deleting an image without betting the site on it.
 *
 * Nothing here deletes anything on the day it is asked to. An image goes to
 * the WordPress trash, its file stays exactly where it was, and a dated record
 * is written. If the verdict was wrong the site keeps working, because the URL
 * still resolves. Only after the retention period does a cron job look again,
 * and only if the image is still unreferenced does it actually go.
 *
 * Two details carry the whole design:
 *
 * 1. Every image is re-checked live against the usage engine at the moment it
 *    is quarantined, not trusted from the stored verdict. The list in the UI
 *    is a proposal; the action re-proves it.
 *
 * 2. `wp_scheduled_delete()` empties the trash after EMPTY_TRASH_DAYS and would
 *    walk right past the retention period. A targeted `pre_delete_post` filter
 *    blocks that instead of changing EMPTY_TRASH_DAYS, which would silently
 *    alter behaviour for the whole site.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Reversible deletion for the media library.
 */
class Media_Quarantine {

	/** Record of when and why something was quarantined. */
	const META = '_wpie_quarantine';

	/** Daily re-check. */
	const CRON = 'wpie_quarantine_sweep';

	/** Default retention in days. */
	const DAYS = 30;

	/**
	 * Register hooks.
	 */
	public function hooks() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
		add_action( self::CRON, array( __CLASS__, 'sweep' ) );
		add_filter( 'pre_delete_post', array( __CLASS__, 'hold_during_retention' ), 10, 3 );
		add_action( 'init', array( __CLASS__, 'schedule' ) );
	}

	/**
	 * Make sure the daily re-check exists.
	 *
	 * @return void
	 */
	public static function schedule() {
		if ( ! wp_next_scheduled( self::CRON ) ) {
			wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', self::CRON );
		}
	}

	/**
	 * Retention period in days.
	 *
	 * @return int
	 */
	public static function days() {
		return max( 1, (int) apply_filters( 'wpie_quarantine_days', self::DAYS ) );
	}

	/**
	 * Stop WordPress emptying the trash out from under us.
	 *
	 * @param bool|null $check  Short-circuit value.
	 * @param \WP_Post  $post   Post being deleted.
	 * @param bool      $force  Whether this bypasses the trash.
	 * @return bool|null False to block, otherwise the value we were given.
	 */
	public static function hold_during_retention( $check, $post, $force ) {
		if ( ! $post || 'attachment' !== $post->post_type ) {
			return $check;
		}
		$rec = get_post_meta( $post->ID, self::META, true );
		if ( ! is_array( $rec ) || empty( $rec['at'] ) ) {
			return $check;
		}
		// Our own sweep sets this flag when the period really is over.
		if ( ! empty( $GLOBALS['wpie_quarantine_releasing'] ) ) {
			return $check;
		}
		if ( time() < (int) $rec['at'] + ( self::days() * DAY_IN_SECONDS ) ) {
			return false;
		}
		return $check;
	}

	/* ------------------------------- actions ------------------------------ */

	/**
	 * Move images to quarantine, re-checking each one first.
	 *
	 * @param int[] $ids   Attachment ids.
	 * @param bool  $force Skip the re-check. Only for images the user picked by
	 *                     hand while looking at their usage list.
	 * @return array Result with the ids that moved and the ones that were kept.
	 */
	public static function hold( $ids, $force = false ) {
		$moved  = array();
		$kept   = array();
		$denied = array();

		foreach ( array_map( 'intval', (array) $ids ) as $id ) {
			if ( $id <= 0 || 'attachment' !== get_post_type( $id ) ) {
				continue;
			}
			if ( ! current_user_can( 'delete_post', $id ) ) {
				$denied[] = $id;
				continue;
			}

			// The list may be minutes or weeks old. Prove it again, now.
			$places = Media_Usage::find_for( $id );
			if ( $places && ! $force ) {
				$kept[] = array(
					'id'     => $id,
					'places' => count( $places ),
					'first'  => $places[0]['label'] ?? '',
				);
				continue;
			}

			update_post_meta(
				$id,
				self::META,
				array(
					'at'     => time(),
					'places' => count( $places ),
					'by'     => get_current_user_id(),
				)
			);
			if ( wp_trash_post( $id ) ) {
				$moved[] = $id;
			} else {
				delete_post_meta( $id, self::META );
			}
		}

		return array(
			'ok'     => true,
			'moved'  => $moved,
			'kept'   => $kept,
			'denied' => $denied,
			'days'   => self::days(),
		);
	}

	/**
	 * Put images back.
	 *
	 * @param int[] $ids Attachment ids.
	 * @return array
	 */
	public static function restore( $ids ) {
		$back = array();
		foreach ( array_map( 'intval', (array) $ids ) as $id ) {
			if ( $id <= 0 || ! current_user_can( 'delete_post', $id ) ) {
				continue;
			}
			if ( wp_untrash_post( $id ) ) {
				// Untrashing can leave an attachment in 'draft' depending on
				// what core remembers; attachments belong in 'inherit'.
				wp_update_post(
					array(
						'ID'          => $id,
						'post_status' => 'inherit',
					)
				);
				delete_post_meta( $id, self::META );
				$back[] = $id;
			}
		}
		return array(
			'ok'       => true,
			'restored' => $back,
		);
	}

	/**
	 * Everything currently held, newest first.
	 *
	 * @return array[]
	 */
	public static function items() {
		$q = new \WP_Query(
			array(
				'post_type'      => 'attachment',
				'post_status'    => 'trash',
				'posts_per_page' => 300,
				'orderby'        => 'modified',
				'order'          => 'DESC',
				'no_found_rows'  => true,
				'meta_query'     => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- bounded to the trash, which is small by nature.
					array(
						'key'     => self::META,
						'compare' => 'EXISTS',
					),
				),
			)
		);

		$days = self::days();
		$out  = array();
		foreach ( $q->posts as $post ) {
			$rec = get_post_meta( $post->ID, self::META, true );
			$at  = is_array( $rec ) ? (int) ( $rec['at'] ?? 0 ) : 0;
			$out[] = array(
				'id'      => (int) $post->ID,
				'title'   => $post->post_title,
				'thumb'   => (string) wp_get_attachment_image_url( $post->ID, 'thumbnail' ),
				'at'      => $at,
				'expires' => $at + ( $days * DAY_IN_SECONDS ),
				'size'    => (int) get_post_meta( $post->ID, Media_Library::FILESIZE_KEY, true ),
			);
		}
		return $out;
	}

	/**
	 * Daily: release what is due, rescue what turned out to be in use.
	 *
	 * @return array Counts, for the REST caller and for tests.
	 */
	public static function sweep() {
		$deleted = 0;
		$rescued = array();
		$cutoff  = time() - ( self::days() * DAY_IN_SECONDS );

		foreach ( self::items() as $item ) {
			if ( $item['at'] > $cutoff ) {
				continue;
			}

			// The second look. Something may have started using this image
			// while it sat in the trash, and a restored page is exactly the
			// kind of thing that does it.
			if ( Media_Usage::find_for( $item['id'] ) ) {
				self::restore( array( $item['id'] ) );
				$rescued[] = $item['id'];
				continue;
			}

			$GLOBALS['wpie_quarantine_releasing'] = true;
			delete_post_meta( $item['id'], self::META );
			if ( wp_delete_attachment( $item['id'], true ) ) {
				++$deleted;
			}
			unset( $GLOBALS['wpie_quarantine_releasing'] );
		}

		if ( $rescued ) {
			update_option( 'wpie_quarantine_rescued', $rescued, false );
		}

		// Orphaned files sit in their own holding area but share this period.
		$files = Media_Orphans::purge();

		return array(
			'deleted' => $deleted,
			'rescued' => $rescued,
			'files'   => (int) $files['deleted'],
		);
	}

	/* --------------------------------- REST -------------------------------- */

	/**
	 * REST routes under wpie/v1/media-quarantine/*.
	 */
	public function register_routes() {
		$perm = array( REST_Controller::class, 'can_use_editor' );

		register_rest_route(
			WPIE_REST_NS,
			'/media-quarantine',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( $this, 'rest_list' ),
					'permission_callback' => $perm,
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'rest_hold' ),
					'permission_callback' => $perm,
				),
			)
		);
		register_rest_route(
			WPIE_REST_NS,
			'/media-quarantine/restore',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'rest_restore' ),
				'permission_callback' => $perm,
			)
		);
		register_rest_route(
			WPIE_REST_NS,
			'/media-quarantine/purge',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'rest_purge' ),
				'permission_callback' => $perm,
			)
		);
	}

	/**
	 * GET /media-quarantine
	 *
	 * @return array
	 */
	public function rest_list() {
		$rescued = (array) get_option( 'wpie_quarantine_rescued', array() );
		if ( $rescued ) {
			delete_option( 'wpie_quarantine_rescued' );
		}
		return array(
			'items'   => self::items(),
			'days'    => self::days(),
			'rescued' => array_values( array_map( 'intval', $rescued ) ),
		);
	}

	/**
	 * POST /media-quarantine
	 *
	 * @param \WP_REST_Request $req Request.
	 * @return array|\WP_Error
	 */
	public function rest_hold( \WP_REST_Request $req ) {
		$ids = (array) $req->get_param( 'ids' );
		if ( ! $ids ) {
			return new \WP_Error( 'wpie_no_ids', __( 'No images selected.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		return self::hold( $ids, (bool) $req->get_param( 'force' ) );
	}

	/**
	 * POST /media-quarantine/restore
	 *
	 * @param \WP_REST_Request $req Request.
	 * @return array
	 */
	public function rest_restore( \WP_REST_Request $req ) {
		return self::restore( (array) $req->get_param( 'ids' ) );
	}

	/**
	 * POST /media-quarantine/purge
	 *
	 * Run the retention check by hand. Only releases what is actually due.
	 *
	 * @return array
	 */
	public function rest_purge() {
		return self::sweep();
	}
}
