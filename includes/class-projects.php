<?php
/**
 * "My Designs" (v1.10): editable working documents saved server-side as
 * layered project JSON + PNG preview, Canva-style design storage, fully
 * separate from templates and from flattened media-library exports.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Design storage + REST routes under /designs.
 */
class Projects {

	const OPTION = 'wpie_designs';

	/**
	 * Register hooks.
	 */
	public function hooks() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
		add_action( 'template_redirect', array( $this, 'render_share_page' ) );
	}

	/**
	 * Storage directory (inside the guarded version store).
	 *
	 * @return string
	 */
	public static function dir() {
		$dir = trailingslashit( \wpie_versions_dir() ) . 'designs';
		if ( ! is_dir( $dir ) ) {
			wp_mkdir_p( $dir );
			file_put_contents( $dir . '/index.php', "<?php // Silence is golden.\n" ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		}
		return $dir;
	}

	/**
	 * Stored design index.
	 *
	 * @return array[]
	 */
	public static function index() {
		$index = get_option( self::OPTION, array() );
		return is_array( $index ) ? $index : array();
	}

	/**
	 * Persist the index.
	 *
	 * @param array $index Records.
	 */
	private static function save_index( $index ) {
		update_option( self::OPTION, array_values( $index ), false );
	}

	/**
	 * The index record for an id, or null.
	 *
	 * @param string $id Design id.
	 * @return array|null
	 */
	private static function find( $id ) {
		foreach ( self::index() as $record ) {
			if ( ( $record['id'] ?? '' ) === $id ) {
				return $record;
			}
		}
		return null;
	}

	/**
	 * Whether the current user may access a design (owner or admin). Designs
	 * are personal working documents, so one editor user must never reach
	 * another's by guessing ids (v1.228: owner isolation). Records without a
	 * stored owner are treated as admin-only.
	 *
	 * @param array|null $record Index record.
	 * @return bool
	 */
	private static function can_access( $record ) {
		if ( current_user_can( 'manage_options' ) ) {
			return true;
		}
		return $record && isset( $record['owner'] )
			&& (int) $record['owner'] === get_current_user_id();
	}

	/**
	 * REST routes.
	 */
	public function register_routes() {
		register_rest_route(
			WPIE_REST_NS,
			'/designs',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( $this, 'list_designs' ),
					'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'create_design' ),
					'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
				),
			)
		);
		register_rest_route(
			WPIE_REST_NS,
			'/designs/(?P<id>[a-z0-9]+)',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( $this, 'get_design' ),
					'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'update_design' ),
					'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
				),
				array(
					'methods'             => 'DELETE',
					'callback'            => array( $this, 'delete_design' ),
					'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
				),
			)
		);
		register_rest_route(
			WPIE_REST_NS,
			'/designs/(?P<id>[a-z0-9]+)/duplicate',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'duplicate_design' ),
				'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
			)
		);
		register_rest_route(
			WPIE_REST_NS,
			'/designs/(?P<id>[a-z0-9]+)/share',
			array(
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'share_design' ),
					'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
				),
				array(
					'methods'             => 'DELETE',
					'callback'            => array( $this, 'unshare_design' ),
					'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
				),
			)
		);
		register_rest_route(
			WPIE_REST_NS,
			'/designs/(?P<id>[a-z0-9]+)/preview',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'preview' ),
				'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
			)
		);
	}

	/**
	 * Validate + persist project JSON and preview for an id.
	 *
	 * @param string           $id      Design id.
	 * @param \WP_REST_Request $request Request.
	 * @return true|\WP_Error
	 */
	private static function write_files( $id, \WP_REST_Request $request ) {
		$project = (string) $request->get_param( 'projectJson' );
		if ( '' !== $project ) {
			$decoded = json_decode( $project, true );
			if ( ! is_array( $decoded ) || empty( $decoded['doc'] ) || ! isset( $decoded['layers'] ) ) {
				return new \WP_Error( 'wpie_bad_design', __( 'Malformed project data.', 'wunderpaint' ), array( 'status' => 400 ) );
			}
			if ( ! \wpie_write_json_file( self::dir() . '/' . $id . '.json', $project ) ) {
				return new \WP_Error( 'wpie_write_failed', __( 'Could not store the design.', 'wunderpaint' ), array( 'status' => 500 ) );
			}
		}
		$preview = (string) $request->get_param( 'preview' );
		if ( preg_match( '#^data:image/(png|jpeg);base64,#', $preview ) && strlen( $preview ) < 300000 ) {
			$bytes = base64_decode( substr( $preview, strpos( $preview, ',' ) + 1 ), true ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode
			if ( false !== $bytes ) {
				file_put_contents( self::dir() . '/' . $id . '.png', $bytes ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
			}
		}
		return true;
	}

	/**
	 * GET /designs, newest edits first.
	 */
	public function list_designs() {
		$index = self::index();
		usort( $index, fn( $a, $b ) => ( $b['modified'] ?? 0 ) <=> ( $a['modified'] ?? 0 ) );
		$out = array();
		foreach ( $index as $record ) {
			if ( ! self::can_access( $record ) ) {
				continue;
			}
			$out[] = array(
				'id'       => $record['id'],
				'name'     => $record['name'],
				'folder'   => $record['folder'] ?? '',
				'created'  => $record['created'],
				'modified' => $record['modified'] ?? $record['created'],
				'preview'  => file_exists( self::dir() . '/' . $record['id'] . '.png' )
					? self::preview_url( $record['id'] )
					: null,
			);
		}
		return $out;
	}

	/**
	 * POST /designs, save the current document as a new design.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return array|\WP_Error
	 */
	public function create_design( \WP_REST_Request $request ) {
		$name = sanitize_text_field( (string) $request->get_param( 'name' ) );
		if ( '' === $name || '' === (string) $request->get_param( 'projectJson' ) ) {
			return new \WP_Error( 'wpie_bad_design', __( 'A design needs a name and project data.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		$id     = strtolower( wp_generate_password( 12, false, false ) );
		$result = self::write_files( $id, $request );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		$index   = self::index();
		$index[] = array(
			'id'       => $id,
			'name'     => $name,
			'owner'    => get_current_user_id(),
			'created'  => time(),
			'modified' => time(),
		);
		self::save_index( $index );
		return array(
			'id'   => $id,
			'name' => $name,
		);
	}

	/**
	 * POST /designs/{id}, update content, preview and/or name.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return array|\WP_Error
	 */
	public function update_design( \WP_REST_Request $request ) {
		$id = sanitize_key( $request['id'] );
		if ( ! self::can_access( self::find( $id ) ) ) {
			return new \WP_Error( 'wpie_not_found', __( 'Design not found.', 'wunderpaint' ), array( 'status' => 404 ) );
		}
		$index = self::index();
		$found = false;
		foreach ( $index as &$record ) {
			if ( $record['id'] === $id ) {
				$found = true;
				$name  = sanitize_text_field( (string) $request->get_param( 'name' ) );
				if ( '' !== $name ) {
					$record['name'] = $name;
				}
				// Folder assignment (v1.11), empty string clears it.
				if ( null !== $request->get_param( 'folder' ) ) {
					$record['folder'] = sanitize_text_field( (string) $request->get_param( 'folder' ) );
				}
				$record['modified'] = time();
				break;
			}
		}
		unset( $record );
		if ( ! $found ) {
			return new \WP_Error( 'wpie_not_found', __( 'Design not found.', 'wunderpaint' ), array( 'status' => 404 ) );
		}
		$result = self::write_files( $id, $request );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		self::save_index( $index );
		return array( 'id' => $id );
	}

	/**
	 * GET /designs/{id}, the stored project JSON.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return array|\WP_Error
	 */
	public function get_design( \WP_REST_Request $request ) {
		$id = sanitize_key( $request['id'] );
		if ( ! self::can_access( self::find( $id ) ) ) {
			return new \WP_Error( 'wpie_not_found', __( 'Design not found.', 'wunderpaint' ), array( 'status' => 404 ) );
		}
		$path = self::dir() . '/' . $id . '.json';
		if ( ! file_exists( $path ) ) {
			return new \WP_Error( 'wpie_not_found', __( 'Design not found.', 'wunderpaint' ), array( 'status' => 404 ) );
		}
		$data = json_decode( (string) \wpie_read_json_file( $path ), true );
		return is_array( $data ) ? $data : new \WP_Error( 'wpie_corrupt', __( 'Design file is corrupt.', 'wunderpaint' ), array( 'status' => 500 ) );
	}

	/**
	 * POST /designs/{id}/duplicate, server-side copy ("… Kopie").
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return array|\WP_Error
	 */
	public function duplicate_design( \WP_REST_Request $request ) {
		$id     = sanitize_key( $request['id'] );
		$source = null;
		foreach ( self::index() as $record ) {
			if ( $record['id'] === $id ) {
				$source = $record;
				break;
			}
		}
		$json = self::dir() . '/' . $id . '.json';
		if ( ! $source || ! self::can_access( $source ) || ! file_exists( $json ) ) {
			return new \WP_Error( 'wpie_not_found', __( 'Design not found.', 'wunderpaint' ), array( 'status' => 404 ) );
		}
		$copy_id = strtolower( wp_generate_password( 12, false, false ) );
		copy( $json, self::dir() . '/' . $copy_id . '.json' );
		if ( file_exists( self::dir() . '/' . $id . '.png' ) ) {
			copy( self::dir() . '/' . $id . '.png', self::dir() . '/' . $copy_id . '.png' );
		}
		$name    = $source['name'] . ' ' . __( '(copy)', 'wunderpaint' );
		$index   = self::index();
		$index[] = array(
			'id'       => $copy_id,
			'name'     => $name,
			'owner'    => get_current_user_id(),
			'created'  => time(),
			'modified' => time(),
		);
		self::save_index( $index );
		return array(
			'id'   => $copy_id,
			'name' => $name,
		);
	}

	/**
	 * DELETE /designs/{id}.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return array
	 */
	public function delete_design( \WP_REST_Request $request ) {
		$id = sanitize_key( $request['id'] );
		if ( ! self::can_access( self::find( $id ) ) ) {
			return new \WP_Error( 'wpie_not_found', __( 'Design not found.', 'wunderpaint' ), array( 'status' => 404 ) );
		}
		foreach ( array( '.json', '.png', '-share.jpg' ) as $ext ) {
			$path = self::dir() . '/' . $id . $ext;
			if ( file_exists( $path ) ) {
				unlink( $path ); // phpcs:ignore WordPress.WP.AlternativeFunctions.unlink_unlink
			}
		}
		self::save_index( array_filter( self::index(), fn( $record ) => $record['id'] !== $id ) );
		return array( 'deleted' => $id );
	}

	/**
	 * POST /designs/{id}/share, store a share image + mint the public
	 * token (v1.11). The link shows ONLY the rendered image, never the
	 * editable project.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return array|\WP_Error
	 */
	public function share_design( \WP_REST_Request $request ) {
		$id = sanitize_key( $request['id'] );
		if ( ! self::can_access( self::find( $id ) ) ) {
			return new \WP_Error( 'wpie_not_found', __( 'Design not found.', 'wunderpaint' ), array( 'status' => 404 ) );
		}
		$index = self::index();
		$token = '';
		$found = false;
		foreach ( $index as &$record ) {
			if ( $record['id'] === $id ) {
				$found = true;
				if ( empty( $record['share'] ) ) {
					$record['share'] = strtolower( wp_generate_password( 24, false, false ) );
				}
				$token = $record['share'];
				break;
			}
		}
		unset( $record );
		if ( ! $found ) {
			return new \WP_Error( 'wpie_not_found', __( 'Design not found.', 'wunderpaint' ), array( 'status' => 404 ) );
		}
		$image = (string) $request->get_param( 'image' );
		if ( preg_match( '#^data:image/jpeg;base64,#', $image ) && strlen( $image ) < 4000000 ) {
			$bytes = base64_decode( substr( $image, strpos( $image, ',' ) + 1 ), true ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode
			if ( false !== $bytes ) {
				file_put_contents( self::dir() . '/' . $id . '-share.jpg', $bytes ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
			}
		}
		self::save_index( $index );
		return array( 'url' => add_query_arg( 'wpie_design', $token, home_url( '/' ) ) );
	}

	/**
	 * DELETE /designs/{id}/share, revoke the public link. The token IS the
	 * capability, so handing it out has to be reversible: without this the
	 * only way back was deleting the design. Drops the token and the
	 * rendered JPEG, so a leaked link stops working immediately and a later
	 * share mints a fresh token. (F-L36, 2026-07-25 audit)
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return array|\WP_Error
	 */
	public function unshare_design( \WP_REST_Request $request ) {
		$id = sanitize_key( $request['id'] );
		if ( ! self::can_access( self::find( $id ) ) ) {
			return new \WP_Error( 'wpie_not_found', __( 'Design not found.', 'wunderpaint' ), array( 'status' => 404 ) );
		}
		$index = self::index();
		$found = false;
		foreach ( $index as &$record ) {
			if ( $record['id'] === $id ) {
				$found = true;
				unset( $record['share'] );
				break;
			}
		}
		unset( $record );
		if ( ! $found ) {
			return new \WP_Error( 'wpie_not_found', __( 'Design not found.', 'wunderpaint' ), array( 'status' => 404 ) );
		}
		$image = self::dir() . '/' . $id . '-share.jpg';
		if ( file_exists( $image ) ) {
			wp_delete_file( $image );
		}
		self::save_index( $index );
		return array( 'revoked' => true );
	}

	/**
	 * Public, read-only share page (?wpie_design=TOKEN), the unguessable
	 * token is the capability; only the rendered JPEG is exposed.
	 */
	public function render_share_page() {
		$token = isset( $_GET['wpie_design'] ) ? sanitize_key( wp_unslash( $_GET['wpie_design'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		if ( '' === $token || strlen( $token ) < 16 ) {
			return;
		}
		$design = null;
		foreach ( self::index() as $record ) {
			if ( ! empty( $record['share'] ) && hash_equals( $record['share'], $token ) ) {
				$design = $record;
				break;
			}
		}
		if ( ! $design ) {
			status_header( 404 );
			exit;
		}
		$img = self::dir() . '/' . $design['id'] . '-share.jpg';
		if ( ! file_exists( $img ) ) {
			$img = self::dir() . '/' . $design['id'] . '.png';
		}
		if ( isset( $_GET['img'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
			if ( ! file_exists( $img ) ) {
				status_header( 404 );
				exit;
			}
			nocache_headers();
			header( 'Content-Type: ' . ( str_ends_with( $img, '.jpg' ) ? 'image/jpeg' : 'image/png' ) );
			header( 'Content-Length: ' . filesize( $img ) );
			readfile( $img ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_readfile
			exit;
		}
		$src = esc_url( add_query_arg( array( 'wpie_design' => $token, 'img' => 1 ), home_url( '/' ) ) );
		header( 'Content-Type: text/html; charset=utf-8' );
		header( 'X-Robots-Tag: noindex' );
		echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
		echo '<title>' . esc_html( $design['name'] ) . '</title>';
		echo '<style>body{margin:0;background:#101418;color:#e6e8eb;font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;display:grid;place-items:center;min-height:100vh;padding:24px;box-sizing:border-box}img{max-width:min(1100px,100%);max-height:80vh;box-shadow:0 20px 60px rgb(0 0 0/50%);border-radius:8px}h1{font-size:16px;font-weight:600;margin:16px 0 0}</style></head><body>';
		echo '<div style="text-align:center"><img src="' . esc_url( $src ) . '" alt="' . esc_attr( $design['name'] ) . '"><h1>' . esc_html( $design['name'] ) . '</h1></div>';
		echo '</body></html>';
		exit;
	}

	/**
	 * Preview URL with a REST nonce (same cookie-auth caveat as templates).
	 *
	 * @param string $id Design id.
	 * @return string URL.
	 */
	public static function preview_url( $id ) {
		$url = rest_url( WPIE_REST_NS . '/designs/' . $id . '/preview' );
		return $url . ( false !== strpos( $url, '?' ) ? '&' : '?' ) . '_wpnonce=' . wp_create_nonce( 'wp_rest' );
	}

	/**
	 * GET /designs/{id}/preview, stream the PNG (capability-gated).
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_Error|void
	 */
	public function preview( \WP_REST_Request $request ) {
		$id = sanitize_key( $request['id'] );
		if ( ! self::can_access( self::find( $id ) ) ) {
			return new \WP_Error( 'wpie_not_found', __( 'No preview.', 'wunderpaint' ), array( 'status' => 404 ) );
		}
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
