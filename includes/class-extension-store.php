<?php
/**
 * Per-user extension key-value store (v1.273.0 / API 2.10): a small
 * server-backed settings home so extensions stop parking favorites and
 * toggles in localStorage (browser-bound, lost on device switch). One
 * JSON object per extension namespace per user, size-capped.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Extension store REST routes.
 */
class Extension_Store {

	const META_PREFIX    = 'wpie_ext_store_';
	const MAX_BYTES      = 32768;
	const MAX_NAMESPACES = 64;
	const NS_PATTERN     = '[a-z0-9][a-z0-9-]{2,63}';

	/**
	 * Register hooks.
	 */
	public function hooks() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	/**
	 * REST routes.
	 */
	public function register_routes() {
		register_rest_route(
			WPIE_REST_NS,
			'/ext-store/(?P<ns>' . self::NS_PATTERN . ')',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( $this, 'rest_get' ),
					'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'rest_set' ),
					'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
				),
			)
		);
	}

	/**
	 * The namespace of this request, taken from the URL only.
	 *
	 * $request['ns'] walks WP_REST_Request::get_parameter_order(), where
	 * JSON, POST and GET all rank ABOVE URL - so a body field named `ns`
	 * beat the route pattern and the character/length limits were
	 * decoration. Read the URL match directly and re-check it.
	 * (F-L17 / F-I03, 2026-07-25 audit)
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return string Namespace, '' when it does not match the pattern.
	 */
	private static function namespace_of( $request ) {
		$ns = (string) ( $request->get_url_params()['ns'] ?? '' );
		return preg_match( '/^' . self::NS_PATTERN . '$/', $ns ) ? $ns : '';
	}

	/**
	 * GET /ext-store/{ns}: the stored object ({} default).
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function rest_get( $request ) {
		$ns = self::namespace_of( $request );
		if ( '' === $ns ) {
			return new \WP_Error( 'wpie_store_ns', __( 'Invalid storage namespace.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		$value = get_user_meta( get_current_user_id(), self::META_PREFIX . $ns, true );
		return rest_ensure_response(
			array( 'value' => is_array( $value ) ? $value : (object) array() )
		);
	}

	/**
	 * POST /ext-store/{ns} with body { value }: replaces the object.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function rest_set( $request ) {
		$ns = self::namespace_of( $request );
		if ( '' === $ns ) {
			return new \WP_Error( 'wpie_store_ns', __( 'Invalid storage namespace.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		$body  = $request->get_json_params();
		$value = is_array( $body ) && array_key_exists( 'value', $body ) ? $body['value'] : null;
		if ( ! is_array( $value ) ) {
			return new \WP_Error( 'wpie_store_payload', __( 'Expected { value } with a JSON object.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		if ( strlen( (string) wp_json_encode( $value ) ) > self::MAX_BYTES ) {
			return new \WP_Error( 'wpie_store_size', __( 'Stored value exceeds the 32 KB limit.', 'wunderpaint' ), array( 'status' => 413 ) );
		}
		$uid = get_current_user_id();
		$key = self::META_PREFIX . $ns;
		// Each namespace is its own wp_usermeta row and WP loads all of a
		// user's meta on first access, so cap the number of distinct
		// namespaces a caller can create to keep the routes from being used
		// to bloat the table (the per-namespace byte cap alone does not stop
		// spraying thousands of keys). (WPIE-017)
		if ( ! metadata_exists( 'user', $uid, $key ) ) {
			$count = 0;
			foreach ( array_keys( (array) get_user_meta( $uid ) ) as $meta_key ) {
				if ( 0 === strpos( (string) $meta_key, self::META_PREFIX ) ) {
					++$count;
				}
			}
			if ( $count >= self::MAX_NAMESPACES ) {
				return new \WP_Error( 'wpie_store_namespaces', __( 'Too many extension storage namespaces for this account.', 'wunderpaint' ), array( 'status' => 429 ) );
			}
		}
		// Sanitized wholesale: values are extension-defined JSON; strings
		// are cleaned recursively, structure is preserved.
		$clean = self::sanitize_value( $value );
		update_user_meta( $uid, $key, $clean );
		return rest_ensure_response( array( 'value' => empty( $clean ) ? (object) array() : $clean ) );
	}

	/**
	 * Recursive scalar sanitation: strings through sanitize_textarea_field,
	 * numbers/bools pass, everything else drops.
	 *
	 * @param mixed $value Raw decoded JSON.
	 * @param int   $depth Recursion guard.
	 * @return mixed Clean value.
	 */
	private static function sanitize_value( $value, $depth = 0 ) {
		if ( $depth > 8 ) {
			return null;
		}
		if ( is_array( $value ) ) {
			$out = array();
			foreach ( $value as $key => $item ) {
				$clean_key = is_int( $key ) ? $key : sanitize_text_field( (string) $key );
				$clean     = self::sanitize_value( $item, $depth + 1 );
				if ( null !== $clean || null === $item ) {
					$out[ $clean_key ] = $clean;
				}
			}
			return $out;
		}
		if ( is_string( $value ) ) {
			return sanitize_textarea_field( $value );
		}
		if ( is_int( $value ) || is_float( $value ) || is_bool( $value ) || null === $value ) {
			return $value;
		}
		return null;
	}
}
