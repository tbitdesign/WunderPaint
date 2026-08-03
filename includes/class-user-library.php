<?php
/**
 * User library (v1.34): Elements, Text combinations and Backgrounds the user
 * saves from "Save to Library". Stored server-side in a single (non-autoloaded)
 * option so they persist across browsers/devices. The saved items are the same
 * small content-io descriptors the built-in library uses.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Storage + REST routes under /library/{kind}.
 */
class User_Library {

	const OPTION = 'wpie_user_library';
	const KINDS  = array( 'element', 'combo', 'background', 'asset', 'pattern' );
	const CAP    = 300;
	const MAX    = 250000;

	// Pattern tiles are real PNGs (grainy backgrounds compress badly),
	// they need far more room than the small item descriptors (v1.110.1).
	const MAX_PATTERN = 2000000;

	/**
	 * Register hooks.
	 */
	public function hooks() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	/**
	 * Full store, normalised to { element:[], combo:[], background:[] }.
	 *
	 * @return array
	 */
	private static function all() {
		$data = get_option( self::OPTION, array() );
		if ( ! is_array( $data ) ) {
			$data = array();
		}
		foreach ( self::KINDS as $k ) {
			if ( ! isset( $data[ $k ] ) || ! is_array( $data[ $k ] ) ) {
				$data[ $k ] = array();
			}
		}
		if ( ! isset( $data['categories'] ) || ! is_array( $data['categories'] ) ) {
			$data['categories'] = array();
		}
		return $data;
	}

	/**
	 * REST routes.
	 */
	public function register_routes() {
		register_rest_route(
			WPIE_REST_NS,
			'/library/(?P<kind>element|combo|background|asset|pattern)',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( $this, 'list_items' ),
					'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'create_item' ),
					'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
				),
			)
		);
		register_rest_route(
			WPIE_REST_NS,
			'/library/categories',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( $this, 'list_categories' ),
					'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'mutate_categories' ),
					'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
				),
			)
		);
		register_rest_route(
			WPIE_REST_NS,
			'/library/(?P<kind>element|combo|background|asset|pattern)/(?P<id>[A-Za-z0-9._-]+)',
			array(
				'methods'             => 'DELETE',
				'callback'            => array( $this, 'delete_item' ),
				'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
			)
		);
	}

	/**
	 * GET /library/categories (v1.74): the user's asset categories.
	 *
	 * @return array
	 */
	public function list_categories() {
		$data = self::all();
		return array_values( $data['categories'] );
	}

	/**
	 * POST /library/categories: { action: add|rename|delete, name, to }.
	 * Renaming moves the assets in the category along; deleting a category
	 * keeps its assets and clears their category ("Unsorted").
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return array|\WP_Error
	 */
	public function mutate_categories( \WP_REST_Request $request ) {
		$action = sanitize_key( (string) $request->get_param( 'action' ) );
		$name   = sanitize_text_field( (string) $request->get_param( 'name' ) );
		$to     = sanitize_text_field( (string) $request->get_param( 'to' ) );
		$data   = self::all();
		if ( '' === $name ) {
			return new \WP_Error( 'wpie_bad_category', __( 'A category needs a name.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		// Categories are shared labels: anyone may add one, but renaming or
		// deleting one relabels every editor's assets, so limit those to users
		// who may manage taxonomies (editor+). (WPIE-003)
		if ( in_array( $action, array( 'rename', 'delete' ), true ) && ! current_user_can( 'manage_categories' ) ) {
			return new \WP_Error( 'wpie_forbidden', __( 'You are not allowed to rename or delete shared categories.', 'wunderpaint' ), array( 'status' => rest_authorization_required_code() ) );
		}
		if ( 'add' === $action ) {
			if ( ! in_array( $name, $data['categories'], true ) && count( $data['categories'] ) < 50 ) {
				$data['categories'][] = $name;
			}
		} elseif ( 'rename' === $action && '' !== $to ) {
			$data['categories'] = array_values( array_unique( array_map(
				fn( $c ) => $c === $name ? $to : $c,
				$data['categories']
			) ) );
			foreach ( $data['asset'] as &$item ) {
				if ( isset( $item['category'] ) && $item['category'] === $name ) {
					$item['category'] = $to;
				}
			}
			unset( $item );
		} elseif ( 'delete' === $action ) {
			$data['categories'] = array_values( array_diff( $data['categories'], array( $name ) ) );
			foreach ( $data['asset'] as &$item ) {
				if ( isset( $item['category'] ) && $item['category'] === $name ) {
					$item['category'] = '';
				}
			}
			unset( $item );
		} else {
			return new \WP_Error( 'wpie_bad_action', __( 'Unknown category action.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		update_option( self::OPTION, $data, false );
		return array( 'categories' => array_values( $data['categories'] ) );
	}

	/**
	 * GET /library/{kind}.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return array
	 */
	public function list_items( \WP_REST_Request $request ) {
		$kind = sanitize_key( $request['kind'] );
		$data = self::all();
		return array_values( isset( $data[ $kind ] ) ? $data[ $kind ] : array() );
	}

	/**
	 * POST /library/{kind} with body { item: <content-io descriptor> }.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return array|\WP_Error
	 */
	public function create_item( \WP_REST_Request $request ) {
		$kind = sanitize_key( $request['kind'] );
		if ( ! in_array( $kind, self::KINDS, true ) ) {
			return new \WP_Error( 'wpie_bad_kind', __( 'Unknown library kind.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		$item = $request->get_param( 'item' );
		if ( is_string( $item ) ) {
			$item = json_decode( $item, true );
		}
		if ( ! is_array( $item ) ) {
			return new \WP_Error( 'wpie_bad_item', __( 'Invalid library item.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		$max = 'pattern' === $kind ? self::MAX_PATTERN : self::MAX;
		if ( strlen( (string) wp_json_encode( $item ) ) > $max ) {
			return new \WP_Error( 'wpie_too_big', __( 'This item is too large to save.', 'wunderpaint' ), array( 'status' => 400 ) );
		}

		$id = isset( $item['id'] ) ? sanitize_text_field( (string) $item['id'] ) : '';
		if ( '' === $id ) {
			$id = $kind . '-' . strtolower( wp_generate_password( 10, false, false ) );
		}
		$item['id'] = $id;

		$data = self::all();
		// Same id updates IN PLACE (v1.266): renaming an asset must not
		// reshuffle it to the "newest" end of the library.
		$found = false;
		foreach ( $data[ $kind ] as $i => $x ) {
			if ( ( isset( $x['id'] ) ? $x['id'] : '' ) === $id ) {
				// Shared store stays readable team-wide, but overwriting an item
				// another editor saved is limited to its owner or an admin so a
				// client-chosen id collision cannot clobber someone else's entry.
				// (WPIE-003)
				if ( ! Helpers::can_manage_owned( $x ) ) {
					return new \WP_Error( 'wpie_forbidden', __( 'You are not allowed to change this library item.', 'wunderpaint' ), array( 'status' => rest_authorization_required_code() ) );
				}
				$item['owner']       = isset( $x['owner'] ) ? (int) $x['owner'] : get_current_user_id();
				$data[ $kind ][ $i ] = $item;
				$found               = true;
				break;
			}
		}
		if ( ! $found ) {
			$item['owner']   = get_current_user_id();
			$data[ $kind ][] = $item;
		}
		// Trim the store, but only at the caller's own expense. Slicing blindly
		// dropped the OLDEST rows, which belong to other people, and thereby
		// undid the ownership check that every single DELETE enforces: 300
		// harmless POSTs wiped the whole team's library. (F-M03, 2026-07-25)
		if ( count( $data[ $kind ] ) > self::CAP ) {
			$over = count( $data[ $kind ] ) - self::CAP;
			$me   = get_current_user_id();
			foreach ( $data[ $kind ] as $i => $row ) {
				if ( $over <= 0 ) {
					break;
				}
				if ( ( isset( $row['id'] ) ? $row['id'] : '' ) === $id ) {
					continue; // Never evict the item just written.
				}
				if ( $me && (int) ( $row['owner'] ?? 0 ) === $me ) {
					unset( $data[ $kind ][ $i ] );
					--$over;
				}
			}
			$data[ $kind ] = array_values( $data[ $kind ] );
			if ( $over > 0 ) {
				return new \WP_Error(
					'wpie_library_full',
					__( 'The library is full. Delete some of your own items first.', 'wunderpaint' ),
					array( 'status' => 409 )
				);
			}
		}
		update_option( self::OPTION, $data, false );

		return $item;
	}

	/**
	 * DELETE /library/{kind}/{id}.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return array
	 */
	public function delete_item( \WP_REST_Request $request ) {
		$kind = sanitize_key( $request['kind'] );
		$id   = sanitize_text_field( (string) $request['id'] );
		$data = self::all();
		if ( ! isset( $data[ $kind ] ) ) {
			return array( 'deleted' => $id );
		}
		$kept    = array();
		$removed = false;
		foreach ( $data[ $kind ] as $x ) {
			if ( ( isset( $x['id'] ) ? $x['id'] : '' ) !== $id ) {
				$kept[] = $x;
				continue;
			}
			// Only the item's owner or an admin may delete it (WPIE-003).
			if ( ! Helpers::can_manage_owned( $x ) ) {
				return new \WP_Error( 'wpie_forbidden', __( 'You are not allowed to delete this library item.', 'wunderpaint' ), array( 'status' => rest_authorization_required_code() ) );
			}
			$removed = true;
		}
		if ( $removed ) {
			$data[ $kind ] = array_values( $kept );
			update_option( self::OPTION, $data, false );
		}
		return array( 'deleted' => $id );
	}
}
