<?php
/**
 * 3D model library (v1.295): server-side storage for GLB models used by
 * the 3D studios (manual uploads and Meshy imports). Files live under
 * uploads/wpie-3d-models/ with random ids; a non-autoloaded option holds
 * the index. Shared-store semantics like the user library: every editor
 * user sees the models, destructive ops are owner/admin-only.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Storage + REST routes under /models3d.
 */
class Models_3D {

	const OPTION     = 'wpie_3d_models';
	const MAX_MODELS = 100;

	/**
	 * Register hooks.
	 */
	public function hooks() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	/**
	 * Upload cap in bytes (filter wpie_3d_model_max_bytes, default 50 MB -
	 * Meshy image-to-3D GLBs with PBR textures regularly pass 25 MB).
	 *
	 * @return int
	 */
	public static function max_bytes() {
		return (int) apply_filters( 'wpie_3d_model_max_bytes', 50 * 1024 * 1024 );
	}

	/**
	 * Storage directory (created on demand, listing-guarded).
	 *
	 * @return string
	 */
	public static function dir() {
		$uploads = wp_upload_dir( null, false );
		$dir     = trailingslashit( $uploads['basedir'] ) . 'wpie-3d-models';
		if ( ! is_dir( $dir ) ) {
			wp_mkdir_p( $dir );
			@file_put_contents( trailingslashit( $dir ) . 'index.html', '' ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		}
		Helpers::protect_dir( $dir ); // Also covers pre-existing directories. (F-L61)
		return $dir;
	}

	/**
	 * Public URL for a stored file.
	 *
	 * @param string $file Basename inside the models directory.
	 * @return string
	 */
	public static function url( $file ) {
		$uploads = wp_upload_dir( null, false );
		return trailingslashit( $uploads['baseurl'] ) . 'wpie-3d-models/' . rawurlencode( $file );
	}

	/**
	 * The index: id => record.
	 *
	 * @return array
	 */
	private static function index() {
		$ix = get_option( self::OPTION, array() );
		return is_array( $ix ) ? $ix : array();
	}

	/**
	 * Persist the index (non-autoloaded).
	 *
	 * @param array $ix Index.
	 */
	private static function save_index( $ix ) {
		update_option( self::OPTION, $ix, false );
	}

	/**
	 * Public shape of a record.
	 *
	 * @param array $rec Stored record.
	 * @return array
	 */
	private static function item_out( $rec ) {
		return array(
			'id'      => (string) $rec['id'],
			'name'    => (string) $rec['name'],
			'size'    => (int) $rec['size'],
			'created' => (int) $rec['created'],
			'source'  => isset( $rec['source'] ) ? (string) $rec['source'] : 'upload',
			'mine'    => Helpers::can_manage_owned( $rec ),
			'url'     => self::url( $rec['file'] ),
			'thumb'   => is_file( self::thumb_path( $rec['id'] ) )
				? self::url( $rec['id'] . '.png' )
				: '',
		);
	}

	/**
	 * Thumbnail sidecar path for a model id.
	 *
	 * @param string $id Model id.
	 * @return string
	 */
	public static function thumb_path( $id ) {
		return trailingslashit( self::dir() ) . preg_replace( '/[^a-z0-9]/', '', (string) $id ) . '.png';
	}

	/**
	 * Persist a PNG thumbnail for a model (capped, magic-checked).
	 *
	 * @param string $id    Model id.
	 * @param string $bytes PNG contents.
	 * @return bool
	 */
	public static function store_thumb( $id, $bytes ) {
		if (
			strlen( $bytes ) < 20 ||
			strlen( $bytes ) > 300 * 1024 ||
			"\x89PNG" !== substr( $bytes, 0, 4 )
		) {
			return false;
		}
		return false !== file_put_contents( self::thumb_path( $id ), $bytes ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
	}

	/**
	 * REST routes.
	 */
	public function register_routes() {
		register_rest_route(
			WPIE_REST_NS,
			'/models3d',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( $this, 'list_models' ),
					'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'upload_model' ),
					'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
				),
			)
		);
		register_rest_route(
			WPIE_REST_NS,
			'/models3d/(?P<id>[a-z0-9]+)',
			array(
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'update_model' ),
					'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
				),
				array(
					'methods'             => 'DELETE',
					'callback'            => array( $this, 'delete_model' ),
					'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
				),
			)
		);
	}

	/**
	 * GET /models3d: every stored model, newest first.
	 *
	 * @return array
	 */
	public function list_models() {
		$items = array_map( array( self::class, 'item_out' ), array_values( self::index() ) );
		usort(
			$items,
			static function ( $a, $b ) {
				return $b['created'] <=> $a['created'];
			}
		);
		return $items;
	}

	/**
	 * POST /models3d (multipart): field `file` = the .glb, optional `name`.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return array|\WP_Error
	 */
	public function upload_model( $request ) {
		$files = $request->get_file_params();
		$file  = isset( $files['file'] ) ? $files['file'] : null;
		if ( ! $file || ! isset( $file['tmp_name'] ) || ! is_uploaded_file( $file['tmp_name'] ) ) {
			return new \WP_Error( 'wpie_model_missing', __( 'No model file received.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		$bytes = file_get_contents( $file['tmp_name'] ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
		$name  = sanitize_text_field( (string) $request->get_param( 'name' ) );
		if ( '' === $name ) {
			$name = sanitize_file_name( (string) ( $file['name'] ?? 'model.glb' ) );
		}
		return self::store_buffer( $name, (string) $bytes, 'upload' );
	}

	/**
	 * Validate + persist a GLB buffer and register it in the index.
	 * Shared with the Meshy import.
	 *
	 * @param string $name   Display name.
	 * @param string $bytes  File contents.
	 * @param string $source 'upload' | 'meshy'.
	 * @return array|\WP_Error Public item.
	 */
	public static function store_buffer( $name, $bytes, $source ) {
		$len = strlen( $bytes );
		if ( $len < 20 || 'glTF' !== substr( $bytes, 0, 4 ) ) {
			return new \WP_Error( 'wpie_model_invalid', __( 'That is not a binary glTF (.glb) file.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		if ( $len > self::max_bytes() ) {
			return new \WP_Error(
				'wpie_model_size',
				sprintf(
					/* translators: %s: size limit like "25 MB". */
					__( 'The model exceeds the %s limit.', 'wunderpaint' ),
					size_format( self::max_bytes() )
				),
				array( 'status' => 413 )
			);
		}
		$ix = self::index();
		if ( count( $ix ) >= self::MAX_MODELS ) {
			return new \WP_Error( 'wpie_model_cap', __( 'The model library is full - delete unused models first.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		do {
			$id = strtolower( wp_generate_password( 12, false, false ) );
		} while ( isset( $ix[ $id ] ) );
		$file = $id . '.glb';
		$path = trailingslashit( self::dir() ) . $file;
		if ( false === file_put_contents( $path, $bytes ) ) { // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
			return new \WP_Error( 'wpie_model_write', __( 'Could not write the model file.', 'wunderpaint' ), array( 'status' => 500 ) );
		}
		$rec = array(
			'id'      => $id,
			'file'    => $file,
			'name'    => '' !== trim( (string) $name ) ? trim( (string) $name ) : 'Model',
			'size'    => $len,
			'created' => time(),
			'owner'   => get_current_user_id(),
			'source'  => $source,
		);

		$ix[ $id ] = $rec;
		self::save_index( $ix );
		return self::item_out( $rec );
	}

	/**
	 * POST /models3d/<id>: { name? } renames (owner/admin only); { thumb? }
	 * stores a data-URL PNG preview (any editor user - thumbs are shared
	 * cosmetics, and the client backfills them for legacy models on load).
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return array|\WP_Error
	 */
	public function update_model( $request ) {
		$id = (string) $request->get_param( 'id' );
		$ix = self::index();
		if ( ! isset( $ix[ $id ] ) ) {
			return new \WP_Error( 'wpie_model_unknown', __( 'Unknown model.', 'wunderpaint' ), array( 'status' => 404 ) );
		}
		$name = $request->get_param( 'name' );
		if ( null !== $name ) {
			if ( ! Helpers::can_manage_owned( $ix[ $id ] ) ) {
				return new \WP_Error( 'wpie_model_forbidden', __( 'Only the owner or an administrator can rename this model.', 'wunderpaint' ), array( 'status' => 403 ) );
			}
			$clean = trim( sanitize_text_field( (string) $name ) );
			if ( '' !== $clean ) {
				$ix[ $id ]['name'] = mb_substr( $clean, 0, 80 );
				self::save_index( $ix );
			}
		}
		$thumb = (string) $request->get_param( 'thumb' );
		if ( '' !== $thumb && ! Helpers::can_manage_owned( $ix[ $id ] ) ) {
			// The rename branch right above refuses this; the thumbnail branch
			// let any editor overwrite the preview of any model in the shared
			// library, and the original is gone. (F-L20, 2026-07-25 audit)
			return new \WP_Error( 'wpie_model_forbidden', __( 'Only the owner or an administrator can change this model.', 'wunderpaint' ), array( 'status' => 403 ) );
		}
		if ( '' !== $thumb && preg_match( '#^data:image/png;base64,#', $thumb ) ) {
			self::store_thumb( $id, (string) base64_decode( substr( $thumb, 22 ), true ) ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode
		}
		return self::item_out( $ix[ $id ] );
	}

	/**
	 * DELETE /models3d/<id>: owner or admin only.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return array|\WP_Error
	 */
	public function delete_model( $request ) {
		$id = (string) $request->get_param( 'id' );
		$ix = self::index();
		if ( ! isset( $ix[ $id ] ) ) {
			return new \WP_Error( 'wpie_model_unknown', __( 'Unknown model.', 'wunderpaint' ), array( 'status' => 404 ) );
		}
		if ( ! Helpers::can_manage_owned( $ix[ $id ] ) ) {
			return new \WP_Error( 'wpie_model_forbidden', __( 'Only the owner or an administrator can delete this model.', 'wunderpaint' ), array( 'status' => 403 ) );
		}
		$path = trailingslashit( self::dir() ) . basename( (string) $ix[ $id ]['file'] );
		if ( is_file( $path ) ) {
			wp_delete_file( $path );
		}
		if ( is_file( self::thumb_path( $id ) ) ) {
			wp_delete_file( self::thumb_path( $id ) );
		}
		unset( $ix[ $id ] );
		self::save_index( $ix );
		return array( 'ok' => true );
	}
}
