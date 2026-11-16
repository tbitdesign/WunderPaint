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
	 * Website colors (v1.432.0): what the site itself declares, for the
	 * Color panel and the Color Schemer. The theme palette and colors added
	 * under Styles (theme.json origins "custom" and "theme"; WordPress'
	 * own default palette is left out, it says nothing about this site),
	 * then Elementor's Global Colors of the active kit. Read only; values
	 * that are not plain hex or rgb() colors (var(), names) are skipped.
	 *
	 * @return array[] [{name, color}]
	 */
	public static function site_colors() {
		$out  = array();
		$seen = array();
		$add  = static function ( $name, $color ) use ( &$out, &$seen ) {
			$color = strtolower( trim( (string) $color ) );
			// The same forms the editor's parseColor() reads.
			if ( ! preg_match( '/^(#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(,\s*[\d.]+\s*)?\))$/', $color ) || isset( $seen[ $color ] ) ) {
				return;
			}
			$seen[ $color ] = true;
			$out[]          = array(
				'name'  => sanitize_text_field( (string) $name ),
				'color' => $color,
			);
		};

		if ( function_exists( 'wp_get_global_settings' ) ) {
			$palette = wp_get_global_settings( array( 'color', 'palette' ) );
			$palette = is_array( $palette ) ? $palette : array();
			// Older shapes return one flat list instead of origins.
			$origins = isset( $palette[0] ) ? array( 'theme' => $palette ) : $palette;
			foreach ( array( 'custom', 'theme' ) as $origin ) {
				foreach ( (array) ( $origins[ $origin ] ?? array() ) as $entry ) {
					if ( is_array( $entry ) ) {
						$add( $entry['name'] ?? '', $entry['color'] ?? '' );
					}
				}
			}
		}

		$kit = (int) get_option( 'elementor_active_kit' );
		if ( $kit && defined( 'ELEMENTOR_VERSION' ) ) {
			$settings = get_post_meta( $kit, '_elementor_page_settings', true );
			foreach ( array( 'system_colors', 'custom_colors' ) as $key ) {
				foreach ( (array) ( is_array( $settings ) ? ( $settings[ $key ] ?? array() ) : array() ) as $entry ) {
					if ( is_array( $entry ) ) {
						$add( $entry['title'] ?? '', $entry['color'] ?? '' );
					}
				}
			}
		}

		/**
		 * Filter the website colors offered in the Color panel and the Color
		 * Schemer, for builders and themes that keep their palette elsewhere.
		 *
		 * @param array[] $colors [{name, color}], hex or rgb() values.
		 */
		$colors = apply_filters( 'wpie_site_colors', $out );
		return is_array( $colors ) ? array_values( array_slice( $colors, 0, 48 ) ) : array();
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
			// to the caller. An administrator's undo of a delete sends the set
			// back with its owner, which only an administrator may name
			// (anyone else would hand a set to a stranger).
			if ( '' !== $id && isset( $by_id[ $id ]['owner'] ) ) {
				$owner = (int) $by_id[ $id ]['owner'];
			} elseif ( ! empty( $set['owner'] ) && current_user_can( 'manage_options' ) && get_userdata( (int) $set['owner'] ) ) {
				$owner = (int) $set['owner'];
			} else {
				$owner = $uid;
			}
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
