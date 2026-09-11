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
	/**
	 * Bytes one namespace may hold.
	 *
	 * Raised from 32 KB in v1.395: a studio that saves whole brushes -
	 * sliders, curves, colour ramp and its drawn tips - wants room for
	 * dozens of them, and 32 KB was about thirty.
	 *
	 * It is NOT raised to a megabyte, and the reason is two lines below
	 * this one: every namespace is a wp_usermeta row, and WordPress loads
	 * ALL of a user's meta on first access. With MAX_NAMESPACES at 64, a
	 * megabyte apiece would mean up to 64 MB read into memory on any
	 * request that so much as asks for a user's nickname. 128 KB keeps the
	 * theoretical ceiling at 8 MB and the realistic one - a person with a
	 * handful of well-used studios - well under one.
	 *
	 * Sites that know what they are doing can raise it through the filter
	 * `wpie_ext_store_max_bytes`.
	 */
	const MAX_BYTES      = 131072;
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
		/**
		 * Filter the per-namespace byte cap of the extension store.
		 *
		 * @param int    $max Bytes allowed for one namespace.
		 * @param string $ns  The namespace being written.
		 */
		$max = (int) apply_filters( 'wpie_ext_store_max_bytes', self::MAX_BYTES, $ns );
		// Measured AFTER the cleaning: sanitizing can grow a string (`<` to
		// `&lt;`), so a value under the cap on the way in could be four
		// times it in the row.
		$clean = self::sanitize_value( $value );
		if ( strlen( (string) wp_json_encode( $clean ) ) > $max ) {
			return new \WP_Error(
				'wpie_store_size',
				sprintf(
					/* translators: %d: size limit in kilobytes. */
					__( 'Stored value exceeds the %d KB limit.', 'wunderpaint' ),
					(int) round( $max / 1024 )
				),
				array( 'status' => 413 )
			);
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
		// Sanitized wholesale above: values are extension-defined JSON;
		// strings are cleaned recursively, structure is preserved.
		//
		// wp_slash() because update_metadata() runs wp_unslash() on whatever it
		// is given, and REST parameters are not slashed. Without it every
		// backslash in the value disappeared on the way in, and the next save
		// ate the next one: a Windows path, a regular expression or a literal
		// \n lost a level per round trip, silently.
		update_user_meta( $uid, $key, wp_slash( $clean ) );
		return rest_ensure_response( array( 'value' => empty( $clean ) ? (object) array() : $clean ) );
	}

	/**
	 * The store's own cleaning, for a caller that writes a value by another
	 * road than the REST route (the backup restore, F17).
	 *
	 * @param mixed $value Raw decoded JSON.
	 * @return mixed Clean value.
	 */
	public static function clean( $value ) {
		return self::sanitize_value( $value );
	}

	/**
	 * Byte cap of one namespace, filterable per namespace.
	 *
	 * @param string $ns Namespace.
	 * @return int
	 */
	public static function max_bytes( $ns ) {
		return (int) apply_filters( 'wpie_ext_store_max_bytes', self::MAX_BYTES, $ns );
	}

	/**
	 * Recursive scalar sanitation: strings kept as text (valid UTF-8, no
	 * control characters), numbers/bools pass, everything else drops.
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
			/*
			 * NOT sanitize_textarea_field(). This store holds what a studio
			 * saves for its user - and for Type Flow that is the user's own
			 * text. sanitize_textarea_field() strips tags, turns `<` into
			 * `&lt;` and removes percent sequences, so "Sale < 50 %" came back
			 * as "Sale &lt;50" after one round trip. Silent damage to the one
			 * thing the user typed, and it needed no attacker.
			 *
			 * EXTPHP-08 of the 10.09.2026 audit was closed by writing the
			 * behaviour down in docs/extending.md rather than changing it, on
			 * the grounds that no caller stored such text. The same report
			 * names one two pages later (EXTZUSTAND-05, Type Flow).
			 *
			 * What is needed here is storage safety, not display safety: this
			 * value goes into user meta and comes back out as JSON, and every
			 * consumer escapes at the point of use. So: valid UTF-8, no
			 * control characters that break JSON, and a ceiling. The overall
			 * byte cap per namespace stays where it is (MAX_BYTES).
			 */
			$clean = wp_check_invalid_utf8( $value, true );
			// Strip C0 control characters except tab, newline and carriage
			// return, plus the C1 range: none of them can be typed on purpose
			// and each is a way to make stored text unreadable later.
			$clean = (string) preg_replace( '/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/u', '', $clean );
			return $clean;
		}
		if ( is_int( $value ) || is_float( $value ) || is_bool( $value ) || null === $value ) {
			return $value;
		}
		return null;
	}
}
