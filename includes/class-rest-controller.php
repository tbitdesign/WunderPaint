<?php
/**
 * REST namespace wpie/v1 (spec 08).
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Route registration + permission callbacks.
 */
class REST_Controller {

	/**
	 * Register hooks.
	 */
	public function hooks() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
		add_filter( 'rest_request_before_callbacks', array( $this, 'demo_guard' ), 10, 3 );
	}

	/**
	 * Editor capability (settings-configurable, default upload_files).
	 *
	 * @return bool
	 */
	public static function can_use_editor() {
		return Media::user_can_use_editor();
	}

	/**
	 * Demo mode (v1.307): the public try-out install. Set WPIE_DEMO in
	 * wp-config; the whole wpie/v1 namespace turns read-only (see
	 * demo_guard) and the client flags the mode in window.WPIE.demo.
	 *
	 * @return bool
	 */
	public static function is_demo() {
		return (bool) apply_filters( 'wpie_demo_mode', defined( 'WPIE_DEMO' ) && WPIE_DEMO );
	}

	/**
	 * Demo mode is an ALLOWLIST, not a blocklist: in demo, every non-read
	 * request in the wpie/v1 namespace (Free, Pro and future routes alike)
	 * is refused before its callback runs. Compute-only POST routes that
	 * write nothing can opt in via the wpie_demo_allowed_routes filter
	 * (route prefixes relative to the namespace, e.g. '/search'). New
	 * write features are therefore demo-safe by default.
	 *
	 * @param mixed            $response Current response (null = proceed).
	 * @param array            $handler  Route handler.
	 * @param \WP_REST_Request $request  Request.
	 * @return mixed Response, WP_Error in demo for write requests.
	 */
	public function demo_guard( $response, $handler, $request ) {
		if ( null !== $response || ! self::is_demo() ) {
			return $response;
		}
		$route = $request->get_route();
		if ( 0 !== strpos( $route, '/' . WPIE_REST_NS . '/' ) ) {
			return $response;
		}
		if ( in_array( $request->get_method(), array( 'GET', 'HEAD', 'OPTIONS' ), true ) ) {
			return $response;
		}
		foreach ( (array) apply_filters( 'wpie_demo_allowed_routes', array() ) as $prefix ) {
			if ( 0 === strpos( $route, '/' . WPIE_REST_NS . $prefix ) ) {
				return $response;
			}
		}
		return new \WP_Error(
			'wpie_demo_readonly',
			__( 'This is the shared demo, so saving to the site is switched off. Download your work instead, or install the free plugin on your own WordPress.', 'wunderpaint' ),
			array( 'status' => 403 )
		);
	}

	/**
	 * Permission: editor user who may edit the given attachment.
	 *
	 * @param \WP_REST_Request $request Request (expects id or attachmentId).
	 * @return bool|\WP_Error
	 */
	public static function can_edit_attachment( \WP_REST_Request $request ) {
		if ( ! self::can_use_editor() ) {
			return new \WP_Error( 'wpie_forbidden', __( 'You are not allowed to use the image editor.', 'wunderpaint' ), array( 'status' => rest_authorization_required_code() ) );
		}
		$id = absint( $request->get_param( 'id' ) ? $request->get_param( 'id' ) : $request->get_param( 'attachmentId' ) );
		if ( ! $id || 'attachment' !== get_post_type( $id ) ) {
			return new \WP_Error( 'wpie_not_found', __( 'Attachment not found.', 'wunderpaint' ), array( 'status' => 404 ) );
		}
		if ( ! current_user_can( 'edit_post', $id ) ) {
			return new \WP_Error( 'wpie_forbidden', __( 'You are not allowed to edit this attachment.', 'wunderpaint' ), array( 'status' => rest_authorization_required_code() ) );
		}
		return true;
	}

	/**
	 * POST /editor-locale : store the editor language choice.
	 *
	 * @param \WP_REST_Request $req Request carrying the locale parameter.
	 * @return array|\WP_Error
	 */
	public static function rest_editor_locale( $req ) {
		$locale = (string) $req->get_param( 'locale' );
		if ( ! Editor_Locale::save( $locale ) ) {
			return new \WP_Error(
				'wpie_locale_unknown',
				__( 'That language is not available.', 'wunderpaint' ),
				array( 'status' => 400 )
			);
		}
		return array(
			'ok'     => true,
			'locale' => Editor_Locale::stored(),
		);
	}

	/**
	 * Register all wpie/v1 routes.
	 */
	public function register_routes() {
		register_rest_route(
			WPIE_REST_NS,
			'/save',
			array(
				'methods'             => 'POST',
				'callback'            => array( Image_Writer::class, 'save' ),
				'permission_callback' => array( self::class, 'can_edit_attachment' ),
			)
		);

		register_rest_route(
			WPIE_REST_NS,
			'/save-as',
			array(
				'methods'             => 'POST',
				'callback'            => array( Image_Writer::class, 'save_as' ),
				'permission_callback' => array( self::class, 'can_use_editor' ),
			)
		);

		register_rest_route(
			WPIE_REST_NS,
			'/media/usage',
			array(
				'methods'             => 'GET',
				'callback'            => array( Media::class, 'usage' ),
				'permission_callback' => array( self::class, 'can_edit_attachment' ),
			)
		);

		register_rest_route(
			WPIE_REST_NS,
			'/storage-stats',
			array(
				'methods'             => 'GET',
				'callback'            => array( self::class, 'storage_stats' ),
				'permission_callback' => function () {
					// Disk layout is server infrastructure, admins only.
					return current_user_can( 'manage_options' );
				},
			)
		);

		// The '/export' route stood here and answered every call with a
		// hardcoded 501. No client ever called it; exporting goes through
		// the download path in the browser. Removed 2026-07-25.

		register_rest_route(
			WPIE_REST_NS,
			'/versions/(?P<id>\d+)',
			array(
				'methods'             => 'GET',
				'callback'            => function ( \WP_REST_Request $request ) {
					return Versioning::list_versions( absint( $request['id'] ) );
				},
				'permission_callback' => array( self::class, 'can_edit_attachment' ),
			)
		);

		register_rest_route(
			WPIE_REST_NS,
			'/versions/(?P<id>\d+)/restore',
			array(
				'methods'             => 'POST',
				'callback'            => function ( \WP_REST_Request $request ) {
					$result = Versioning::restore( absint( $request['id'] ), absint( $request->get_param( 'v' ) ) );
					if ( ! is_wp_error( $result ) ) {
						$result['editUrl'] = Media::editor_url( absint( $request['id'] ) );
					}
					return $result;
				},
				'permission_callback' => array( self::class, 'can_edit_attachment' ),
			)
		);

		register_rest_route(
			WPIE_REST_NS,
			'/versions/(?P<id>\d+)/(?P<v>\d+)/file',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'stream_version' ),
				'permission_callback' => array( self::class, 'can_edit_attachment' ),
			)
		);

		register_rest_route(
			WPIE_REST_NS,
			'/project/(?P<id>\d+)/(?P<kind>json|psd)',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'stream_project' ),
				'permission_callback' => array( self::class, 'can_edit_attachment' ),
			)
		);

		register_rest_route(
			WPIE_REST_NS,
			'/editor-locale',
			array(
				'methods'             => 'POST',
				'permission_callback' => array( self::class, 'can_use_editor' ),
				'callback'            => array( self::class, 'rest_editor_locale' ),
				'args'                => array(
					'locale' => array(
						'type'     => 'string',
						'required' => true,
					),
				),
			)
		);

		register_rest_route(
			WPIE_REST_NS,
			'/proxy-image',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'proxy_image' ),
				'permission_callback' => array( self::class, 'can_use_editor' ),
				'args'                => array(
					'src' => array(
						'required'          => true,
						'sanitize_callback' => 'esc_url_raw',
					),
				),
			)
		);
	}

	/**
	 * Stream a stored version file (capability-gated; spec 08.3).
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_Error|void
	 */
	public function stream_version( \WP_REST_Request $request ) {
		$path = Versioning::version_path( absint( $request['id'] ), absint( $request['v'] ) );
		if ( is_wp_error( $path ) ) {
			return $path;
		}
		$this->stream_file( $path );
	}

	/**
	 * Stream a sidecar project file.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_Error|void
	 */
	public function stream_project( \WP_REST_Request $request ) {
		$path = Versioning::sidecar_path( absint( $request['id'] ), $request['kind'] );
		if ( is_wp_error( $path ) ) {
			return $path;
		}
		$this->stream_file( $path );
	}

	/**
	 * Echo a file with correct headers and terminate.
	 *
	 * @param string $path Absolute file path.
	 */
	private function stream_file( $path ) {
		$types = array(
			'png'  => 'image/png',
			'jpg'  => 'image/jpeg',
			'jpeg' => 'image/jpeg',
			'webp' => 'image/webp',
			'avif' => 'image/avif',
			'gif'  => 'image/gif',
			'psd'  => 'image/vnd.adobe.photoshop',
			'json' => 'application/json',
		);
		$ext   = strtolower( pathinfo( $path, PATHINFO_EXTENSION ) );
		$type  = isset( $types[ $ext ] ) ? $types[ $ext ] : 'application/octet-stream';

		nocache_headers();
		header( 'Content-Type: ' . $type );
		header( 'X-Content-Type-Options: nosniff' );
		if ( 'json' === $ext ) {
			// Sidecars are gzipped at rest since v1.282; the client keeps
			// receiving plain JSON regardless of how the file is stored.
			$json = \wpie_read_json_file( $path );
			header( 'Content-Length: ' . strlen( (string) $json ) );
			echo (string) $json; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
			exit;
		}
		header( 'Content-Length: ' . filesize( $path ) );
		readfile( $path ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_readfile
		exit;
	}

	/**
	 * Same-origin proxy for site-owned, cross-origin attachment URLs
	 * (CDN/offloaded uploads). Rejects arbitrary URLs, no SSRF (spec 08.1).
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_Error|void
	 */
	public function proxy_image( \WP_REST_Request $request ) {
		$src = (string) $request->get_param( 'src' );

		// Must resolve to an attachment of THIS site.
		$attachment_id = attachment_url_to_postid( $src );
		if ( ! $attachment_id ) {
			// Retry without an intermediate-size suffix (…-300x200.jpg).
			$stripped = preg_replace( '/-\d+x\d+(\.[a-z0-9]+)$/i', '$1', $src );
			if ( $stripped !== $src ) {
				$attachment_id = attachment_url_to_postid( $stripped );
			}
		}
		if ( ! $attachment_id || ! current_user_can( 'edit_post', $attachment_id ) ) {
			return new \WP_Error( 'wpie_bad_src', __( 'The requested URL is not an attachment of this site.', 'wunderpaint' ), array( 'status' => 403 ) );
		}

		// Serve from disk when local, else fetch the (offloaded) URL server-side.
		$file = get_attached_file( $attachment_id );
		if ( $file && file_exists( $file ) ) {
			$this->stream_file( $file );
			return;
		}

		$response = wp_remote_get( $src, array( 'timeout' => 30 ) );
		if ( is_wp_error( $response ) || 200 !== wp_remote_retrieve_response_code( $response ) ) {
			return new \WP_Error( 'wpie_fetch_failed', __( 'Could not fetch the image.', 'wunderpaint' ), array( 'status' => 502 ) );
		}
		// Serve under the attachment's OWN mime, not the reflected remote
		// Content-Type: this proxy only ever fronts image attachments, so a
		// remote text/html header must never reach the browser as-is.
		$mime = (string) get_post_mime_type( $attachment_id );
		if ( 0 !== strpos( $mime, 'image/' ) ) {
			$mime = 'application/octet-stream';
		}
		nocache_headers();
		header( 'Content-Type: ' . $mime );
		header( 'X-Content-Type-Options: nosniff' );
		echo wp_remote_retrieve_body( $response ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		exit;
	}

	/**
	 * GET /storage-stats : aggregated disk usage for System Status (v1.235).
	 * Directory scans are IO-heavy, so the result is cached for 10 minutes
	 * (recurse_dirsize additionally keeps WP's own dirsize_cache warm).
	 *
	 * @return \WP_REST_Response
	 */
	public static function storage_stats() {
		$cached = get_transient( 'wpie_storage_stats' );
		if ( is_array( $cached ) ) {
			return rest_ensure_response( $cached );
		}

		$uploads = wp_upload_dir();
		$base    = trailingslashit( $uploads['basedir'] );
		$size    = function ( $dirs ) {
			$sum = 0;
			foreach ( (array) $dirs as $dir ) {
				if ( is_dir( $dir ) ) {
					// 15s guard per bucket; false (timeout) counts as 0.
					$sum += (int) recurse_dirsize( untrailingslashit( $dir ), null, 15 );
				}
			}
			return $sum;
		};

		$buckets = array(
			'versions'   => $size( \wpie_versions_dir() ),
			'models'     => $size( $base . 'wpie-models' ),
			'extensions' => $size( $base . 'wpie-extensions' ),
			'editor'     => $size( array( $base . 'wpie-fonts', $base . 'wpie-live', $base . 'wpie-runtime' ) ),
		);
		$uploads_total = $size( untrailingslashit( $base ) );
		$media         = max( 0, $uploads_total - array_sum( $buckets ) );

		// Disk numbers may be unavailable (disabled functions on some hosts);
		// the client then charts the uploads composition only.
		$disk_total = function_exists( 'disk_total_space' ) ? @disk_total_space( $uploads['basedir'] ) : false; // phpcs:ignore
		$disk_free  = function_exists( 'disk_free_space' ) ? @disk_free_space( $uploads['basedir'] ) : false; // phpcs:ignore

		$payload = array(
			'buckets'     => $buckets,
			'media'       => $media,
			'uploads'     => $uploads_total,
			'diskTotal'   => false !== $disk_total ? (float) $disk_total : null,
			'diskFree'    => false !== $disk_free ? (float) $disk_free : null,
			'generatedAt' => time(),
		);
		set_transient( 'wpie_storage_stats', $payload, 10 * MINUTE_IN_SECONDS );
		return rest_ensure_response( $payload );
	}
}
