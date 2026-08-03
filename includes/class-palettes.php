<?php
/**
 * Saved swatch sets (v1.103.0): named color palettes created in the
 * Color Schemer, stored site-wide so they appear in every color picker
 * and travel with backups. Any editor user may read and save them.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Palette storage + REST routes.
 */
class Palettes {

	const OPTION   = 'wpie_palettes';
	const MAX_SETS = 50;

	/**
	 * Register hooks.
	 */
	public function hooks() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	/**
	 * All stored palettes.
	 *
	 * @return array[] [{id, name, colors[]}]
	 */
	public static function all() {
		$sets = get_option( self::OPTION, array() );
		return is_array( $sets ) ? array_values( $sets ) : array();
	}

	/**
	 * REST routes.
	 */
	public function register_routes() {
		register_rest_route(
			WPIE_REST_NS,
			'/palettes',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( $this, 'rest_get' ),
					'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'rest_save' ),
					'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
				),
			)
		);
	}

	/**
	 * GET /palettes.
	 *
	 * @return \WP_REST_Response
	 */
	public function rest_get() {
		return rest_ensure_response( self::all() );
	}

	/**
	 * POST /palettes: the dialog always sends the full list, but the set stays
	 * shared, so this merges instead of blindly replacing. Palettes the caller
	 * may not manage (another editor's sets, and legacy ownerless sets for
	 * non-admins) are preserved untouched, so a trimmed or empty array can no
	 * longer wipe or overwrite everyone's palettes site-wide. Each saved set
	 * carries an owner; admins manage all. (WPIE-011)
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function rest_save( $request ) {
		$raw = $request->get_json_params();
		if ( ! is_array( $raw ) ) {
			return new \WP_Error( 'wpie_palettes_payload', __( 'Expected a list of palettes.', 'wunderpaint' ), array( 'status' => 400 ) );
		}

		$existing = self::all();
		$by_id    = array();
		foreach ( $existing as $set ) {
			if ( isset( $set['id'] ) ) {
				$by_id[ $set['id'] ] = $set;
			}
		}
		// Sets the caller cannot manage survive verbatim.
		$clean = array();
		foreach ( $existing as $set ) {
			if ( ! Helpers::can_manage_owned( $set ) ) {
				$clean[] = $set;
			}
		}

		$uid = get_current_user_id();
		foreach ( array_values( $raw ) as $i => $set ) {
			if ( count( $clean ) >= self::MAX_SETS ) {
				break;
			}
			if ( ! is_array( $set ) ) {
				continue;
			}
			$id = strtolower( preg_replace( '/[^a-zA-Z0-9]/', '', (string) ( $set['id'] ?? '' ) ) );
			// Refuse to touch an existing set the caller may not manage; its
			// original is already preserved above.
			if ( '' !== $id && isset( $by_id[ $id ] ) && ! Helpers::can_manage_owned( $by_id[ $id ] ) ) {
				continue;
			}
			$colors = array();
			foreach ( array_slice( (array) ( $set['colors'] ?? array() ), 0, 12 ) as $color ) {
				$hex = sanitize_hex_color( (string) $color );
				if ( ! $hex ) {
					continue;
				}
				if ( 4 === strlen( $hex ) ) {
					// #abc -> #aabbcc, input[type=color] needs six digits.
					$hex = '#' . $hex[1] . $hex[1] . $hex[2] . $hex[2] . $hex[3] . $hex[3];
				}
				$colors[] = strtolower( $hex );
			}
			if ( ! $colors ) {
				continue;
			}
			// Updating a set in place keeps its original owner; new sets belong
			// to the caller.
			$owner   = ( '' !== $id && isset( $by_id[ $id ]['owner'] ) ) ? (int) $by_id[ $id ]['owner'] : $uid;
			$clean[] = array(
				'id'     => '' !== $id ? $id : substr( md5( wp_json_encode( $colors ) . microtime() ), 0, 12 ),
				'name'   => sanitize_text_field( (string) ( $set['name'] ?? '' ) ) ?: sprintf(
					/* translators: %d: palette number. */
					__( 'Palette %d', 'wunderpaint' ),
					$i + 1
				),
				'colors' => $colors,
				'owner'  => $owner,
			);
		}
		update_option( self::OPTION, $clean, false );
		return rest_ensure_response( self::all() );
	}
}
