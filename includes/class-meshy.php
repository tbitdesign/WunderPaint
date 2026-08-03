<?php
/**
 * Meshy.ai proxy (v1.295): AI 3D model generation for the 3D studios.
 * Image-to-3D and Text-to-3D tasks run against the Meshy API with the
 * server-stored key (never exposed to the browser, spec 09.1); finished
 * GLBs import straight into the 3D model library.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * REST routes under /meshy.
 */
class Meshy {

	const API = 'https://api.meshy.ai';

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
			'/meshy/test',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'test_connection' ),
				'permission_callback' => function () {
					return current_user_can( 'manage_options' );
				},
			)
		);
		register_rest_route(
			WPIE_REST_NS,
			'/meshy/generate',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'generate' ),
				'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
			)
		);
		register_rest_route(
			WPIE_REST_NS,
			'/meshy/task',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'task_status' ),
				'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
				'args'                => array(
					'mode' => array(
						'required' => true,
						'type'     => 'string',
					),
					'id'   => array(
						'required' => true,
						'type'     => 'string',
					),
				),
			)
		);
		register_rest_route(
			WPIE_REST_NS,
			'/meshy/import',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'import_model' ),
				'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
			)
		);
	}

	/**
	 * Generation defaults from settings, mapped onto raw API params. Two
	 * friendly knobs: the AI model and one quality level (quality steers
	 * polygon count and texture resolution; PBR is always on).
	 *
	 * @return array { model, polycount, hd }
	 */
	private static function gen_defaults() {
		$s       = Helpers::get_settings();
		$model   = in_array( ( $s['meshy_model'] ?? 'latest' ), array( 'latest', 'meshy-6', 'meshy-5' ), true )
			? (string) $s['meshy_model']
			: 'latest';
		$quality = (string) ( $s['meshy_quality'] ?? 'standard' );
		$poly    = 30000;
		if ( 'low' === $quality ) {
			$poly = 10000;
		} elseif ( 'high' === $quality ) {
			$poly = 100000;
		}
		return array(
			'model'     => $model,
			'polycount' => $poly,
			// 4K textures need Meshy 6+; 'high' turns them on automatically.
			'hd'        => 'high' === $quality && 'meshy-5' !== $model,
		);
	}

	/**
	 * Task endpoint path per mode.
	 *
	 * @param string $mode 'image' | 'text'.
	 * @return string
	 */
	private static function task_path( $mode ) {
		return 'image' === $mode
			? '/openapi/v1/image-to-3d'
			: '/openapi/v2/text-to-3d';
	}

	/**
	 * Authorized Meshy request; parses JSON, maps errors.
	 *
	 * @param string     $method HTTP method.
	 * @param string     $path   API path.
	 * @param array|null $body   JSON body for POSTs.
	 * @return array|\WP_Error Decoded response.
	 */
	private static function request( $method, $path, $body = null ) {
		$key = Helpers::get_api_key( 'meshy' );
		if ( '' === $key ) {
			return new \WP_Error( 'wpie_meshy_key', __( 'Add your Meshy API key under Settings → Integrations first.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		$args = array(
			'method'  => $method,
			'timeout' => 45,
			'headers' => array(
				'Authorization' => 'Bearer ' . $key,
				'Content-Type'  => 'application/json',
			),
		);
		if ( null !== $body ) {
			$args['body'] = wp_json_encode( $body );
		}
		$response = wp_remote_request( self::API . $path, $args );
		if ( is_wp_error( $response ) ) {
			return new \WP_Error( 'wpie_meshy_http', $response->get_error_message(), array( 'status' => 502 ) );
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		$data = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( 401 === $code || 403 === $code ) {
			return new \WP_Error( 'wpie_meshy_auth', __( 'Meshy rejected the API key.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		if ( $code < 200 || $code >= 300 ) {
			$msg = is_array( $data ) && isset( $data['message'] ) ? (string) $data['message'] : ( 'HTTP ' . $code );
			return new \WP_Error( 'wpie_meshy_api', $msg, array( 'status' => 502 ) );
		}
		return is_array( $data ) ? $data : array();
	}

	/**
	 * POST /meshy/test: read the credit balance with the saved key.
	 *
	 * @return array|\WP_Error
	 */
	public function test_connection() {
		$data = self::request( 'GET', '/openapi/v1/balance' );
		if ( is_wp_error( $data ) ) {
			return $data;
		}
		return array(
			'ok'      => true,
			'credits' => isset( $data['balance'] ) ? (int) $data['balance'] : null,
		);
	}

	/**
	 * POST /meshy/generate: start a task.
	 * { mode: 'image', attachment: <id> } or
	 * { mode: 'text', prompt: '…' } or
	 * { mode: 'text-refine', preview_id: '…' }.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return array|\WP_Error { id, mode } - `mode` is the POLLING mode.
	 */
	public function generate( $request ) {
		// Paid third-party generation: throttle it like every other AI call,
		// using the AI budget cap from the settings. (F-L19)
		$limited = AI_Provider::rate_limit( 'meshy' );
		if ( is_wp_error( $limited ) ) {
			return $limited;
		}
		$mode = (string) $request->get_param( 'mode' );
		if ( 'image' === $mode ) {
			$attachment = (int) $request->get_param( 'attachment' );
			// Every other route that reads an attachment from disk checks this
			// (rest-controller, media-library, image-writer); this one was the
			// only exception, and the bytes leave the site towards a third
			// party. (F-L18, 2026-07-25 audit)
			if ( $attachment && ( 'attachment' !== get_post_type( $attachment ) || ! current_user_can( 'edit_post', $attachment ) ) ) {
				return new \WP_Error(
					'wpie_forbidden',
					__( 'You are not allowed to use this attachment.', 'wunderpaint' ),
					array( 'status' => rest_authorization_required_code() )
				);
			}
			$path = $attachment ? get_attached_file( $attachment ) : '';
			if ( ! $path || ! is_file( $path ) ) {
				return new \WP_Error( 'wpie_meshy_image', __( 'Pick an image from the media library first.', 'wunderpaint' ), array( 'status' => 400 ) );
			}
			$mime = (string) get_post_mime_type( $attachment );
			if ( ! in_array( $mime, array( 'image/jpeg', 'image/png', 'image/webp' ), true ) ) {
				return new \WP_Error( 'wpie_meshy_image', __( 'Meshy needs a JPEG, PNG or WebP image.', 'wunderpaint' ), array( 'status' => 400 ) );
			}
			$bytes = file_get_contents( $path ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
			$gen   = self::gen_defaults();
			$data  = self::request(
				'POST',
				'/openapi/v1/image-to-3d',
				array(
					'image_url'        => 'data:' . $mime . ';base64,' . base64_encode( $bytes ), // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode
					'enable_pbr'       => true,
					'should_texture'   => true,
					'ai_model'         => $gen['model'],
					'should_remesh'    => true,
					'target_polycount' => $gen['polycount'],
					'hd_texture'       => $gen['hd'],
				)
			);
			if ( is_wp_error( $data ) ) {
				return $data;
			}
			return array(
				'id'   => isset( $data['result'] ) ? (string) $data['result'] : '',
				'mode' => 'image',
			);
		}
		if ( 'text' === $mode || 'text-refine' === $mode ) {
			$gen  = self::gen_defaults();
			$body = 'text' === $mode
				? array(
					'mode'             => 'preview',
					'prompt'           => mb_substr( sanitize_textarea_field( (string) $request->get_param( 'prompt' ) ), 0, 600 ),
					'art_style'        => 'realistic',
					'ai_model'         => $gen['model'],
					'should_remesh'    => true,
					'target_polycount' => $gen['polycount'],
				)
				: array(
					'mode'            => 'refine',
					'preview_task_id' => sanitize_text_field( (string) $request->get_param( 'preview_id' ) ),
					'enable_pbr'      => true,
					'ai_model'        => $gen['model'],
					'hd_texture'      => $gen['hd'],
				);
			if ( 'text' === $mode && '' === $body['prompt'] ) {
				return new \WP_Error( 'wpie_meshy_prompt', __( 'Describe the object first.', 'wunderpaint' ), array( 'status' => 400 ) );
			}
			$data = self::request( 'POST', '/openapi/v2/text-to-3d', $body );
			if ( is_wp_error( $data ) ) {
				return $data;
			}
			return array(
				'id'   => isset( $data['result'] ) ? (string) $data['result'] : '',
				'mode' => 'text',
			);
		}
		return new \WP_Error( 'wpie_meshy_mode', __( 'Unknown generation mode.', 'wunderpaint' ), array( 'status' => 400 ) );
	}

	/**
	 * GET /meshy/task: poll status/progress.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return array|\WP_Error
	 */
	public function task_status( $request ) {
		$mode = 'image' === (string) $request->get_param( 'mode' ) ? 'image' : 'text';
		$id   = sanitize_text_field( (string) $request->get_param( 'id' ) );
		$data = self::request( 'GET', self::task_path( $mode ) . '/' . rawurlencode( $id ) );
		if ( is_wp_error( $data ) ) {
			return $data;
		}
		$error = '';
		if ( isset( $data['task_error']['message'] ) ) {
			$error = (string) $data['task_error']['message'];
		}
		return array(
			'status'    => isset( $data['status'] ) ? (string) $data['status'] : 'PENDING',
			'progress'  => isset( $data['progress'] ) ? (int) $data['progress'] : 0,
			'thumbnail' => isset( $data['thumbnail_url'] ) ? (string) $data['thumbnail_url'] : '',
			'error'     => $error,
		);
	}

	/**
	 * POST /meshy/import: download a finished task's GLB into the model
	 * library. { mode, id, name }.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return array|\WP_Error Library item.
	 */
	public function import_model( $request ) {
		$mode = 'image' === (string) $request->get_param( 'mode' ) ? 'image' : 'text';
		$id   = sanitize_text_field( (string) $request->get_param( 'id' ) );
		$data = self::request( 'GET', self::task_path( $mode ) . '/' . rawurlencode( $id ) );
		if ( is_wp_error( $data ) ) {
			return $data;
		}
		if ( 'SUCCEEDED' !== ( $data['status'] ?? '' ) || empty( $data['model_urls']['glb'] ) ) {
			return new \WP_Error( 'wpie_meshy_pending', __( 'The model is not finished yet.', 'wunderpaint' ), array( 'status' => 409 ) );
		}
		$response = wp_remote_get(
			(string) $data['model_urls']['glb'],
			array(
				'timeout'             => 90,
				'limit_response_size' => Models_3D::max_bytes() + 1024,
			)
		);
		if ( is_wp_error( $response ) ) {
			return new \WP_Error( 'wpie_meshy_download', $response->get_error_message(), array( 'status' => 502 ) );
		}
		$bytes = wp_remote_retrieve_body( $response );
		$name  = sanitize_text_field( (string) $request->get_param( 'name' ) );
		$item  = Models_3D::store_buffer( '' !== $name ? $name : __( 'AI model', 'wunderpaint' ), $bytes, 'meshy' );
		// Meshy renders a preview image for every task - keep it as the
		// library thumbnail so AI models are recognizable at a glance.
		if ( ! is_wp_error( $item ) && ! empty( $data['thumbnail_url'] ) ) {
			$thumb = wp_remote_get(
				(string) $data['thumbnail_url'],
				array(
					'timeout'             => 20,
					'limit_response_size' => 300 * 1024,
				)
			);
			if ( ! is_wp_error( $thumb ) ) {
				Models_3D::store_thumb( $item['id'], wp_remote_retrieve_body( $thumb ) );
				$item['thumb'] = Models_3D::url( $item['id'] . '.png' );
			}
		}
		return $item;
	}
}
