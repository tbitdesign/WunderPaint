<?php
/**
 * Oversized originals: pixels the site never serves.
 *
 * WordPress generates a set of sizes for every upload and serves those. A 6000
 * pixel original behind a layout that never asks for more than 1536 is dead
 * weight: it costs disk and backup time and nothing else.
 *
 * The claim is kept honest by checking two things rather than one. The width
 * has to exceed every registered image size by a clear margin, AND the original
 * file must not be linked directly anywhere, because a direct link is the one
 * case where those pixels really do reach a visitor. That second half is only
 * possible because the usage engine knows which URL form was used, which is
 * also why no standalone plugin can answer this question.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Finds originals that are larger than anything the site delivers.
 */
class Media_Oversize {

	/**
	 * How much bigger than the largest served size counts as oversized.
	 *
	 * 1.2 means "at least a fifth wider than anything the site delivers", which
	 * is roughly 45 percent of the pixels and worth reclaiming. Higher values
	 * looked safer but made the check useless in practice: core caps uploads at
	 * 2560, so a threshold much above the largest registered size can never be
	 * crossed on a site that has only ever used the media uploader.
	 */
	const FACTOR = 1.2;

	/**
	 * Register hooks.
	 */
	public function hooks() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	/**
	 * The widest image size this site actually generates and serves.
	 *
	 * Deliberately NOT including `big_image_size_threshold`. That is the ceiling
	 * core applies to the stored original on upload, not a size anyone is ever
	 * served: counting it would set the bar at 2560 on a default install and the
	 * check would never find anything, because core already capped every upload
	 * at exactly that number.
	 *
	 * A floor of 1200 keeps a minimal theme that registers nothing above 300
	 * from turning this into a suggestion to shrink everything to a thumbnail.
	 *
	 * @return int Pixels.
	 */
	public static function served_width() {
		$widths = array( 0 );
		foreach ( array( 'thumbnail', 'medium', 'medium_large', 'large' ) as $name ) {
			$widths[] = (int) get_option( $name . '_size_w' );
		}
		if ( function_exists( 'wp_get_additional_image_sizes' ) ) {
			foreach ( wp_get_additional_image_sizes() as $size ) {
				$widths[] = (int) ( $size['width'] ?? 0 );
			}
		}
		$widest = max( $widths );

		/**
		 * The width above which an original counts as oversized.
		 *
		 * @param int $widest Largest registered image size width.
		 */
		return max( 1200, (int) apply_filters( 'wpie_oversize_served_width', $widest ) );
	}

	/**
	 * Candidates, biggest saving first.
	 *
	 * @param int $limit How many to return.
	 * @return array
	 */
	public static function candidates( $limit = 100 ) {
		global $wpdb;

		$served = self::served_width();
		/**
		 * Multiplier deciding when an original counts as oversized.
		 *
		 * @param float $factor Multiplier applied to the served width.
		 */
		$factor = (float) apply_filters( 'wpie_oversize_factor', self::FACTOR );
		$cutoff = (int) round( $served * max( 1.0, $factor ) );
		$limit  = max( 1, min( 500, (int) $limit ) );

		// The stored area meta the manager already backfills is the cheap way
		// in; width itself is only in the serialized metadata.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- bounded by LIMIT, values prepared.
		$ids = $wpdb->get_col(
			$wpdb->prepare(
				"SELECT p.ID FROM {$wpdb->posts} p
				 INNER JOIN {$wpdb->postmeta} f ON f.post_id = p.ID AND f.meta_key = %s
				 WHERE p.post_type = 'attachment' AND p.post_status <> 'trash'
				   AND p.post_mime_type IN ('image/jpeg','image/png','image/webp','image/avif')
				 ORDER BY f.meta_value + 0 DESC
				 LIMIT %d",
				Media_Library::FILESIZE_KEY,
				$limit * 4
			)
		);

		$out = array();
		foreach ( array_map( 'intval', $ids ) as $id ) {
			$meta = wp_get_attachment_metadata( $id );
			if ( ! is_array( $meta ) || empty( $meta['width'] ) ) {
				continue;
			}
			$width = (int) $meta['width'];
			if ( $width <= $cutoff ) {
				continue;
			}

			$out[] = array(
				'id'     => $id,
				'title'  => get_the_title( $id ),
				'thumb'  => (string) wp_get_attachment_image_url( $id, 'thumbnail' ),
				'width'  => $width,
				'height' => (int) ( $meta['height'] ?? 0 ),
				'size'   => (int) get_post_meta( $id, Media_Library::FILESIZE_KEY, true ),
				'target' => $served,
				// A direct link to the original is the one legitimate reason to
				// keep every pixel, so it is checked and reported per image.
				'linked' => self::linked_directly( $id ),
			);
			if ( count( $out ) >= $limit ) {
				break;
			}
		}

		usort(
			$out,
			static function ( $a, $b ) {
				return $b['size'] <=> $a['size'];
			}
		);

		return array(
			'items'  => $out,
			'served' => $served,
			'cutoff' => $cutoff,
		);
	}

	/**
	 * Is the full size file referenced by URL anywhere?
	 *
	 * @param int $id Attachment.
	 * @return bool
	 */
	private static function linked_directly( $id ) {
		global $wpdb;

		$rel = (string) get_post_meta( $id, '_wp_attached_file', true );
		if ( '' === $rel ) {
			return false;
		}
		$base = wp_basename( $rel );
		$like = '%' . $wpdb->esc_like( $base ) . '%';

		$wpdb->last_error = '';
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- one bounded existence check per candidate, value prepared.
		$hit = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type <> 'revision' AND post_content LIKE %s LIMIT 1", $like ) );
		// A count of zero and a broken query look the same. Erring towards
		// "linked" keeps a live image out of the candidate list; erring the
		// other way would put it in.
		if ( '' !== (string) $wpdb->last_error ) {
			return true;
		}
		return $hit > 0;
	}

	/**
	 * REST route.
	 */
	public function register_routes() {
		register_rest_route(
			WPIE_REST_NS,
			'/media-oversize',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'rest_list' ),
				'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
			)
		);
	}

	/**
	 * GET /media-oversize
	 *
	 * @param \WP_REST_Request $req Request.
	 * @return array
	 */
	public function rest_list( \WP_REST_Request $req ) {
		return self::candidates( (int) $req->get_param( 'limit' ) ?: 100 );
	}
}
