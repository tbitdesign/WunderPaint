<?php
/**
 * Provenance and licence for library images.
 *
 * Four fields per image: where it came from, who made it, under what licence
 * and until when. Agencies and shops need to answer that question years after
 * the fact, and the answer is usually lost the moment the download folder is
 * cleared.
 *
 * On upload the fields are prefilled from the file's own IPTC block, which is
 * where stock photos and most cameras already put the creator and the copyright
 * notice. Done with PHP's built-in `iptcparse`, so it works on stock hosting
 * with nothing installed.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Licence bookkeeping for attachments.
 */
class Media_Credits {

	/** Meta keys, one per field. */
	const FIELDS = array(
		'source'  => '_wpie_credit_source',
		'author'  => '_wpie_credit_author',
		'licence' => '_wpie_credit_licence',
		'expires' => '_wpie_credit_expires',
	);

	/** Warn this many days before a licence runs out. */
	const WARN_DAYS = 30;

	/**
	 * Register hooks.
	 */
	public function hooks() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
		add_filter( 'wp_generate_attachment_metadata', array( __CLASS__, 'prefill_from_iptc' ), 10, 2 );
	}

	/**
	 * Read creator and copyright out of the file on upload.
	 *
	 * @param array $metadata Attachment metadata, passed through untouched.
	 * @param int   $id       Attachment id.
	 * @return array
	 */
	public static function prefill_from_iptc( $metadata, $id ) {
		$file = get_attached_file( $id );
		if ( ! $file || ! file_exists( $file ) || ! function_exists( 'iptcparse' ) ) {
			return $metadata;
		}
		// Only the formats that can carry an APP13 block at all.
		$type = strtolower( (string) pathinfo( $file, PATHINFO_EXTENSION ) );
		if ( ! in_array( $type, array( 'jpg', 'jpeg', 'tif', 'tiff' ), true ) ) {
			return $metadata;
		}

		$info = array();
		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- a malformed file must not break the upload.
		if ( ! @getimagesize( $file, $info ) || empty( $info['APP13'] ) ) {
			return $metadata;
		}
		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- same.
		$iptc = @iptcparse( $info['APP13'] );
		if ( ! is_array( $iptc ) ) {
			return $metadata;
		}

		$pick = static function ( $key ) use ( $iptc ) {
			if ( empty( $iptc[ $key ][0] ) ) {
				return '';
			}
			return sanitize_text_field( (string) $iptc[ $key ][0] );
		};

		// 2#080 by-line (creator), 2#116 copyright notice, 2#115 source.
		$author = $pick( '2#080' );
		$rights = $pick( '2#116' );
		$source = $pick( '2#115' );

		if ( $author && ! get_post_meta( $id, self::FIELDS['author'], true ) ) {
			update_post_meta( $id, self::FIELDS['author'], $author );
		}
		if ( $rights && ! get_post_meta( $id, self::FIELDS['licence'], true ) ) {
			update_post_meta( $id, self::FIELDS['licence'], $rights );
		}
		if ( $source && ! get_post_meta( $id, self::FIELDS['source'], true ) ) {
			update_post_meta( $id, self::FIELDS['source'], $source );
		}

		return $metadata;
	}

	/**
	 * The stored credit for one image.
	 *
	 * @param int $id Attachment.
	 * @return array
	 */
	public static function get( $id ) {
		$id  = (int) $id;
		$out = array();
		foreach ( self::FIELDS as $name => $key ) {
			$out[ $name ] = (string) get_post_meta( $id, $key, true );
		}

		$out['expiring'] = false;
		$out['expired']  = false;
		if ( $out['expires'] ) {
			$when = strtotime( $out['expires'] . ' 23:59:59' );
			if ( $when ) {
				$out['expired']  = $when < time();
				$out['expiring'] = ! $out['expired'] && $when < time() + ( self::WARN_DAYS * DAY_IN_SECONDS );
			}
		}
		$out['complete'] = ( '' !== $out['source'] || '' !== $out['author'] ) && '' !== $out['licence'];
		return $out;
	}

	/**
	 * Store the credit for one image.
	 *
	 * @param int   $id     Attachment.
	 * @param array $values Field values.
	 * @return array The stored record.
	 */
	public static function set( $id, $values ) {
		$id = (int) $id;
		foreach ( self::FIELDS as $name => $key ) {
			if ( ! array_key_exists( $name, $values ) ) {
				continue;
			}
			$value = sanitize_text_field( (string) $values[ $name ] );
			if ( 'expires' === $name && '' !== $value ) {
				// Keep it a plain date so it sorts and compares predictably.
				$stamp = strtotime( $value );
				$value = $stamp ? gmdate( 'Y-m-d', $stamp ) : '';
			}
			if ( '' === $value ) {
				delete_post_meta( $id, $key );
				continue;
			}
			update_post_meta( $id, $key, $value );
		}
		return self::get( $id );
	}

	/**
	 * Images with no licence recorded, and images whose licence is running out.
	 *
	 * @return array
	 */
	public static function overview() {
		global $wpdb;

		$mimes            = "'" . implode( "','", array_map( 'esc_sql', Media_Library::MIMES ) ) . "'";
		$wpdb->last_error = '';
		// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQL.NotPrepared, PluginCheck.Security.DirectDB.UnescapedDBParameter -- $mimes is a list of esc_sql'd values from the Media_Library::MIMES class constant; the meta key is bound through prepare().
		$missing = (int) $wpdb->get_var(
			$wpdb->prepare(
				"SELECT COUNT(*) FROM {$wpdb->posts} p
				 LEFT JOIN {$wpdb->postmeta} m ON m.post_id = p.ID AND m.meta_key = %s
				 WHERE p.post_type = 'attachment' AND p.post_status <> 'trash'
				   AND p.post_mime_type IN ($mimes) AND ( m.meta_id IS NULL OR m.meta_value = '' )",
				self::FIELDS['licence']
			)
		);
		// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQL.NotPrepared, PluginCheck.Security.DirectDB.UnescapedDBParameter

		// Zero missing licences is an all clear. A broken query produces the
		// same zero, so say "unknown" instead of sounding the all clear.
		$licence_unknown = '' !== (string) $wpdb->last_error;

		$soon = get_posts(
			array(
				'post_type'      => 'attachment',
				'post_status'    => 'inherit',
				'posts_per_page' => 100,
				'fields'         => 'ids',
				'meta_query'     => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- date strings compare fine and the set is small.
					array(
						'key'     => self::FIELDS['expires'],
						'value'   => gmdate( 'Y-m-d', time() + ( self::WARN_DAYS * DAY_IN_SECONDS ) ),
						'compare' => '<=',
						'type'    => 'DATE',
					),
				),
			)
		);

		$items = array();
		foreach ( $soon as $id ) {
			$rec     = self::get( $id );
			$items[] = array(
				'id'      => (int) $id,
				'title'   => get_the_title( $id ),
				'thumb'   => (string) wp_get_attachment_image_url( $id, 'thumbnail' ),
				'expires' => $rec['expires'],
				'expired' => $rec['expired'],
			);
		}

		return array(
			'missing'        => $missing,
			'missingUnknown' => $licence_unknown,
			'expiring'       => $items,
			'warnDays'       => self::WARN_DAYS,
		);
	}

	/**
	 * REST routes.
	 */
	public function register_routes() {
		$perm = array( REST_Controller::class, 'can_use_editor' );

		register_rest_route(
			WPIE_REST_NS,
			'/media-credits/(?P<id>\d+)',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( $this, 'rest_get' ),
					'permission_callback' => $perm,
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'rest_set' ),
					'permission_callback' => $perm,
				),
			)
		);
		register_rest_route(
			WPIE_REST_NS,
			'/media-credits',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'rest_overview' ),
				'permission_callback' => $perm,
			)
		);
	}

	/**
	 * GET /media-credits/<id>
	 *
	 * @param \WP_REST_Request $req Request.
	 * @return array
	 */
	public function rest_get( \WP_REST_Request $req ) {
		return self::get( (int) $req->get_param( 'id' ) );
	}

	/**
	 * POST /media-credits/<id>
	 *
	 * @param \WP_REST_Request $req Request.
	 * @return array|\WP_Error
	 */
	public function rest_set( \WP_REST_Request $req ) {
		$id = (int) $req->get_param( 'id' );
		if ( ! current_user_can( 'edit_post', $id ) ) {
			return new \WP_Error( 'wpie_denied', __( 'You cannot edit this image.', 'wunderpaint' ), array( 'status' => 403 ) );
		}
		return self::set( $id, (array) $req->get_json_params() );
	}

	/**
	 * GET /media-credits
	 *
	 * @return array|\WP_Error
	 */
	public function rest_overview() {
		$out = self::overview();
		// "0 images without a licence" is an all clear. A query that fell over
		// produces the same zero, so a caller must not be handed one.
		if ( ! empty( $out['missingUnknown'] ) ) {
			return new \WP_Error(
				'wpie_credits_query_failed',
				__( 'The licence overview could not be read.', 'wunderpaint' ),
				array( 'status' => 500 )
			);
		}
		unset( $out['missingUnknown'] );
		return $out;
	}
}
