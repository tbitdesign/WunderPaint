<?php
/**
 * Reusable project templates (v0.2): layered projects saved as JSON files
 * (with a PNG preview) in the protected version store, listed in the
 * Create dialog.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Template storage + REST routes.
 */
class Templates {

	const OPTION = 'wpie_templates';

	/**
	 * Register hooks.
	 */
	public function hooks() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	/**
	 * Storage directory (inside the guarded version store).
	 *
	 * @return string
	 */
	public static function dir() {
		$dir = trailingslashit( \wpie_versions_dir() ) . 'templates';
		if ( ! is_dir( $dir ) ) {
			wp_mkdir_p( $dir );
			file_put_contents( $dir . '/index.php', "<?php // Silence is golden.\n" ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		}
		return $dir;
	}

	/**
	 * Stored template index.
	 *
	 * @return array[]
	 */
	public static function index() {
		$index = get_option( self::OPTION, array() );
		return is_array( $index ) ? $index : array();
	}

	/**
	 * The index record for a template id, or null.
	 *
	 * @param string $id Template id.
	 * @return array|null
	 */
	public static function record( $id ) {
		foreach ( self::index() as $record ) {
			if ( ( $record['id'] ?? '' ) === $id ) {
				return $record;
			}
		}
		return null;
	}

	/**
	 * REST routes.
	 */
	public function register_routes() {
		register_rest_route(
			WPIE_REST_NS,
			'/templates',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( $this, 'list_templates' ),
					'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'create_template' ),
					'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
				),
			)
		);
		register_rest_route(
			WPIE_REST_NS,
			'/templates/(?P<id>[a-z0-9]+)',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( $this, 'get_template' ),
					'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'update_template' ),
					'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
				),
				array(
					'methods'             => 'DELETE',
					'callback'            => array( $this, 'delete_template' ),
					'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
				),
			)
		);
		register_rest_route(
			WPIE_REST_NS,
			'/templates/(?P<id>[a-z0-9]+)/preview',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'preview' ),
				'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
			)
		);
	}

	/**
	 * GET /templates, list with gated preview URLs.
	 */
	public function list_templates() {
		$out = array();
		foreach ( self::index() as $record ) {
			$out[] = array(
				'id'      => $record['id'],
				'name'    => $record['name'],
				'created' => $record['created'],
				'preview' => file_exists( self::dir() . '/' . $record['id'] . '.png' )
					? self::preview_url( $record['id'] )
					: null,
			);
		}
		return $out;
	}

	/**
	 * POST /templates, save the current project as a template.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return array|\WP_Error
	 */
	public function create_template( \WP_REST_Request $request ) {
		$name    = sanitize_text_field( (string) $request->get_param( 'name' ) );
		$project = (string) $request->get_param( 'projectJson' );
		if ( '' === $name || '' === $project ) {
			return new \WP_Error( 'wpie_bad_template', __( 'A template needs a name and project data.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		$decoded = json_decode( $project, true );
		if ( ! is_array( $decoded ) || empty( $decoded['doc'] ) || ! isset( $decoded['layers'] ) ) {
			return new \WP_Error( 'wpie_bad_template', __( 'Malformed project data.', 'wunderpaint' ), array( 'status' => 400 ) );
		}

		$id = strtolower( wp_generate_password( 12, false, false ) );
		if ( ! \wpie_write_json_file( self::dir() . '/' . $id . '.json', $project ) ) {
			return new \WP_Error( 'wpie_write_failed', __( 'Could not store the template.', 'wunderpaint' ), array( 'status' => 500 ) );
		}

		// Optional PNG preview (small data URL).
		$preview = (string) $request->get_param( 'preview' );
		if ( preg_match( '#^data:image/(png|jpeg);base64,#', $preview ) && strlen( $preview ) < 300000 ) {
			$bytes = base64_decode( substr( $preview, strpos( $preview, ',' ) + 1 ), true ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode
			if ( false !== $bytes ) {
				file_put_contents( self::dir() . '/' . $id . '.png', $bytes ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
			}
		}

		$index   = self::index();
		$index[] = array(
			'id'       => $id,
			'name'     => $name,
			'created'  => time(),
			// Owner (WPIE-004): templates stay listed/readable team-wide, but
			// overwriting or deleting one is limited to its owner or an admin.
			'owner'    => get_current_user_id(),
			// Kit assignment (v1.91.0): rides in the index so pickers can
			// group/filter templates per client kit without loading them.
			'brandKit' => sanitize_key( (string) ( $decoded['doc']['brandKitId'] ?? '' ) ),
		);
		update_option( self::OPTION, $index, false );

		return array(
			'id'   => $id,
			'name' => $name,
		);
	}

	/**
	 * POST /templates/{id}, update an existing template in place (v1.69.3):
	 * new project data + preview, optional rename. Same validation as create.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return array|\WP_Error
	 */
	public function update_template( \WP_REST_Request $request ) {
		$id   = sanitize_key( $request['id'] );
		$path = self::dir() . '/' . $id . '.json';
		if ( ! file_exists( $path ) ) {
			return new \WP_Error( 'wpie_not_found', __( 'Template not found.', 'wunderpaint' ), array( 'status' => 404 ) );
		}
		// Only the template's owner or an admin may overwrite it (WPIE-004).
		if ( ! Helpers::can_manage_owned( self::record( $id ) ) ) {
			return new \WP_Error( 'wpie_forbidden', __( 'You are not allowed to change this template.', 'wunderpaint' ), array( 'status' => rest_authorization_required_code() ) );
		}
		$project = (string) $request->get_param( 'projectJson' );
		$decoded = json_decode( $project, true );
		if ( ! is_array( $decoded ) || empty( $decoded['doc'] ) || ! isset( $decoded['layers'] ) ) {
			return new \WP_Error( 'wpie_bad_template', __( 'Malformed project data.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		if ( ! \wpie_write_json_file( $path, $project ) ) {
			return new \WP_Error( 'wpie_write_failed', __( 'Could not store the template.', 'wunderpaint' ), array( 'status' => 500 ) );
		}

		$preview = (string) $request->get_param( 'preview' );
		if ( preg_match( '#^data:image/(png|jpeg);base64,#', $preview ) && strlen( $preview ) < 300000 ) {
			$bytes = base64_decode( substr( $preview, strpos( $preview, ',' ) + 1 ), true ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode
			if ( false !== $bytes ) {
				file_put_contents( self::dir() . '/' . $id . '.png', $bytes ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
			}
		}

		$name    = sanitize_text_field( (string) $request->get_param( 'name' ) );
		$updated = '';
		$index   = array_map(
			function ( $record ) use ( $id, $name, $decoded, &$updated ) {
				if ( $record['id'] === $id ) {
					if ( '' !== $name ) {
						$record['name'] = $name;
					}
					$record['brandKit'] = sanitize_key( (string) ( $decoded['doc']['brandKitId'] ?? '' ) );
					$updated            = $record['name'];
				}
				return $record;
			},
			self::index()
		);
		update_option( self::OPTION, $index, false );

		return array(
			'id'   => $id,
			'name' => $updated,
		);
	}

	/**
	 * GET /templates/{id}, the stored project JSON.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return array|\WP_Error
	 */
	public function get_template( \WP_REST_Request $request ) {
		$id   = sanitize_key( $request['id'] );
		$path = self::dir() . '/' . $id . '.json';
		if ( ! file_exists( $path ) ) {
			return new \WP_Error( 'wpie_not_found', __( 'Template not found.', 'wunderpaint' ), array( 'status' => 404 ) );
		}
		$data = json_decode( (string) \wpie_read_json_file( $path ), true );
		return is_array( $data ) ? $data : new \WP_Error( 'wpie_corrupt', __( 'Template file is corrupt.', 'wunderpaint' ), array( 'status' => 500 ) );
	}

	/**
	 * DELETE /templates/{id}.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return array
	 */
	public function delete_template( \WP_REST_Request $request ) {
		$id = sanitize_key( $request['id'] );
		// Only the template's owner or an admin may delete it (WPIE-004).
		if ( ! Helpers::can_manage_owned( self::record( $id ) ) ) {
			return new \WP_Error( 'wpie_forbidden', __( 'You are not allowed to delete this template.', 'wunderpaint' ), array( 'status' => rest_authorization_required_code() ) );
		}
		foreach ( array( '.json', '.png' ) as $ext ) {
			$path = self::dir() . '/' . $id . $ext;
			if ( file_exists( $path ) ) {
				unlink( $path ); // phpcs:ignore WordPress.WP.AlternativeFunctions.unlink_unlink
			}
		}
		update_option(
			self::OPTION,
			array_values( array_filter( self::index(), fn( $record ) => $record['id'] !== $id ) ),
			false
		);
		return array( 'deleted' => $id );
	}

	/**
	 * Preview URL with a REST nonce, <img> requests send cookies but no
	 * nonce header, so cookie auth would treat them as logged out.
	 * (add_query_arg would re-encode plain-permalink rest_route values.)
	 *
	 * @param string $id Template id.
	 * @return string URL.
	 */
	public static function preview_url( $id ) {
		$url = rest_url( WPIE_REST_NS . '/templates/' . $id . '/preview' );
		return $url . ( false !== strpos( $url, '?' ) ? '&' : '?' ) . '_wpnonce=' . wp_create_nonce( 'wp_rest' );
	}

	/**
	 * GET /templates/{id}/preview, stream the PNG (capability-gated).
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_Error|void
	 */
	public function preview( \WP_REST_Request $request ) {
		$id   = sanitize_key( $request['id'] );
		$path = self::dir() . '/' . $id . '.png';
		if ( ! file_exists( $path ) ) {
			return new \WP_Error( 'wpie_not_found', __( 'No preview.', 'wunderpaint' ), array( 'status' => 404 ) );
		}
		nocache_headers();
		header( 'Content-Type: image/png' );
		header( 'Content-Length: ' . filesize( $path ) );
		readfile( $path ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_readfile
		exit;
	}
}
