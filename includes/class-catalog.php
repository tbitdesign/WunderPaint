<?php
/**
 * Extension catalog proxy (Phase 3): fetches catalog.json from the delivery
 * host server-side and hands it to the editor, cached in a transient so the
 * browser never talks to the delivery host directly (no CORS) and a fetch
 * failure never blocks the editor.
 *
 * Only metadata is fetched here; installing extension code from a remote
 * host stays out of the free plugin (wp.org rule) and lives in the Pro
 * plugin.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Catalog REST proxy.
 */
class Catalog {

	const TRANSIENT = 'wpie_ext_catalog';
	const TTL       = HOUR_IN_SECONDS;

	/**
	 * Register hooks.
	 */
	public function hooks() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	/**
	 * REST route: GET /catalog.
	 */
	public function register_routes() {
		register_rest_route(
			WPIE_REST_NS,
			'/catalog',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'rest_get' ),
				'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
			)
		);
	}

	/**
	 * The delivery base URL: WPIE_DELIVERY_URL constant, filterable, with a
	 * production default.
	 *
	 * @return string
	 */
	public static function delivery_url() {
		$base = defined( 'WPIE_DELIVERY_URL' ) ? WPIE_DELIVERY_URL : 'https://delivery.wp-image-editor.com';
		return (string) apply_filters( 'wpie_delivery_url', $base );
	}

	/**
	 * GET /catalog: the cached catalog, refreshing it from the delivery host
	 * when the transient is cold. On a fetch failure returns the last good
	 * cache, or an empty list, never an error.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response
	 */
	public function rest_get( $request ) {
		$cached = get_transient( self::TRANSIENT );
		if ( is_array( $cached ) ) {
			return rest_ensure_response( $cached );
		}
		$data = $this->fetch();
		if ( null !== $data ) {
			set_transient( self::TRANSIENT, $data, self::TTL );
			return rest_ensure_response( $data );
		}
		return rest_ensure_response( array( 'extensions' => array() ) );
	}

	/**
	 * Fetch and validate catalog.json. Returns null on any failure.
	 *
	 * @return array|null
	 */
	private function fetch() {
		$url = rtrim( self::delivery_url(), '/' ) . '/catalog.json';
		$res = wp_remote_get( $url, array( 'timeout' => 8 ) );
		if ( is_wp_error( $res ) || 200 !== (int) wp_remote_retrieve_response_code( $res ) ) {
			return null;
		}
		$data = json_decode( wp_remote_retrieve_body( $res ), true );
		if ( ! is_array( $data ) || ! isset( $data['extensions'] ) || ! is_array( $data['extensions'] ) ) {
			return null;
		}
		return array(
			'extensions' => $data['extensions'],
			'generated'  => $data['generated'] ?? null,
		);
	}
}
