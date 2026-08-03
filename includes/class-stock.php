<?php
/**
 * Stock image search (v0.3): server-side proxy for Pexels and Pixabay so
 * API keys never reach the browser and inserted images never taint the
 * canvas. Both providers require a (free) API key configured in settings
 * or via the WPIE_PEXELS_KEY / WPIE_PIXABAY_KEY constants.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * REST proxy for stock-photo providers.
 */
class Stock {

	const PER_PAGE = 24;

	/**
	 * Download hosts we accept for /stock/fetch (result URLs only).
	 *
	 * @var string[]
	 */
	const ALLOWED_HOSTS = array( 'images.pexels.com', 'pixabay.com', 'cdn.pixabay.com' );

	/**
	 * Register hooks.
	 */
	public function hooks() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	/**
	 * Strip an API key out of a message before it leaves the server, in
	 * plain and in URL-encoded spelling. (F-L60, 2026-07-25 audit)
	 *
	 * @param string $text Message.
	 * @param string $key  Secret to remove.
	 * @return string
	 */
	public static function redact_key( $text, $key ) {
		$text = (string) $text;
		$key  = trim( (string) $key );
		if ( strlen( $key ) < 8 ) {
			return $text;
		}
		return str_replace( array( $key, rawurlencode( $key ) ), '***', $text );
	}

	/**
	 * Provider registry (v0.4): built-ins plus extensions.
	 *
	 * A provider is: array{
	 *   label: string,
	 *   configured: bool,
	 *   hosts: string[],                       // allowlisted download hosts
	 *   search?: callable( string $q, int $page ): array|\WP_Error
	 * }
	 * Built-ins omit `search` (handled natively below).
	 *
	 * @return array<string,array>
	 */
	public static function providers() {
		$builtin = array(
			'pexels'  => array(
				'label'      => 'Pexels',
				'configured' => '' !== Helpers::get_api_key( 'pexels' ),
				'hosts'      => array( 'images.pexels.com' ),
			),
			'pixabay'  => array(
				'label'      => 'Pixabay',
				'configured' => '' !== Helpers::get_api_key( 'pixabay' ),
				'hosts'      => array( 'pixabay.com', 'cdn.pixabay.com' ),
			),
			'unsplash' => array(
				'label'      => 'Unsplash',
				'configured' => '' !== Helpers::get_api_key( 'unsplash' ),
				'hosts'      => array( 'images.unsplash.com', 'plus.unsplash.com' ),
			),
		);

		/**
		 * Register additional stock providers (v0.4).
		 *
		 * @param array $providers Provider map (see docblock above).
		 */
		$providers = apply_filters( 'wpie_stock_providers', $builtin );
		return is_array( $providers ) ? $providers : $builtin;
	}

	/**
	 * Configured flags per provider.
	 *
	 * @return array<string,bool>
	 */
	public static function status() {
		$status = array();
		foreach ( self::providers() as $id => $provider ) {
			$status[ $id ] = ! empty( $provider['configured'] );
		}
		return $status;
	}

	/**
	 * UI labels per provider.
	 *
	 * @return array<string,string>
	 */
	public static function labels() {
		$labels = array();
		foreach ( self::providers() as $id => $provider ) {
			$labels[ $id ] = isset( $provider['label'] ) ? (string) $provider['label'] : ucfirst( $id );
		}
		return $labels;
	}

	/**
	 * REST routes.
	 */
	public function register_routes() {
		register_rest_route(
			WPIE_REST_NS,
			'/stock/search',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'search' ),
				'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
				'args'                => array(
					'provider' => array(
						'required' => true,
						'type'     => 'string',
					),
					'q'        => array(
						'required' => true,
						'type'     => 'string',
					),
					'page'     => array(
						'type'    => 'integer',
						'default' => 1,
						'minimum' => 1,
					),
					'type'     => array(
						'type'    => 'string',
						'enum'    => array( 'photo', 'illustration', 'vector' ),
						'default' => 'photo',
					),
				),
			)
		);
		register_rest_route(
			WPIE_REST_NS,
			'/stock/fetch',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'fetch' ),
				'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
				'args'                => array(
					'url' => array(
						'required' => true,
						'type'     => 'string',
					),
				),
			)
		);
		// Settings-page "Test connection" (mirrors /ai/test).
		register_rest_route(
			WPIE_REST_NS,
			'/stock/test',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'test_connection' ),
				'permission_callback' => function () {
					return current_user_can( 'manage_options' );
				},
				'args'                => array(
					'provider' => array(
						'required' => true,
						'type'     => 'string',
					),
				),
			)
		);
	}

	/**
	 * POST /stock/test: run a tiny search with the saved key so the
	 * settings page can verify a provider end-to-end.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function test_connection( $request ) {
		$probe = new \WP_REST_Request( 'GET', '' );
		$probe->set_param( 'provider', (string) $request->get_param( 'provider' ) );
		$probe->set_param( 'q', 'nature' );
		$probe->set_param( 'page', 1 );
		$probe->set_param( 'type', 'photo' );
		$result = $this->search( $probe );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		$data = $result->get_data();
		return rest_ensure_response(
			array(
				'ok'    => true,
				'total' => isset( $data['total'] ) ? (int) $data['total'] : 0,
			)
		);
	}

	/**
	 * GET /stock/search, normalized results from either provider.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function search( $request ) {
		// See /stock/fetch, which already throttles. (F-L27)
		$limited = AI_Provider::rate_limit( 'stocksearch', 0, 'lookup_rate_limit' );
		if ( is_wp_error( $limited ) ) {
			return $limited;
		}
		$provider  = $request->get_param( 'provider' );
		$providers = self::providers();
		if ( ! isset( $providers[ $provider ] ) ) {
			return new \WP_Error( 'wpie_stock_unknown', __( 'Unknown stock provider.', 'wunderpaint' ), array( 'status' => 400 ) );
		}

		// Extension provider with its own search callable (v0.4).
		if ( isset( $providers[ $provider ]['search'] ) && is_callable( $providers[ $provider ]['search'] ) ) {
			if ( empty( $providers[ $provider ]['configured'] ) ) {
				return new \WP_Error( 'wpie_stock_no_key', __( 'This stock provider is not configured.', 'wunderpaint' ), array( 'status' => 409 ) );
			}
			$result = call_user_func(
				$providers[ $provider ]['search'],
				trim( (string) $request->get_param( 'q' ) ),
				max( 1, (int) $request->get_param( 'page' ) )
			);
			return is_wp_error( $result ) ? $result : rest_ensure_response( $result );
		}

		$key = Helpers::get_api_key( $provider );
		if ( '' === $key ) {
			return new \WP_Error(
				'wpie_stock_no_key',
				sprintf(
					/* translators: %s: provider name. */
					__( 'No API key configured for %s, add one in the plugin settings.', 'wunderpaint' ),
					ucfirst( $provider )
				),
				array( 'status' => 409 )
			);
		}

		$q    = trim( (string) $request->get_param( 'q' ) );
		$page = max( 1, (int) $request->get_param( 'page' ) );
		// Illustrations/vector graphics (v1.109.0): only Pixabay's API can
		// filter by image_type; the photo-only providers ignore it.
		$type = (string) $request->get_param( 'type' );
		if ( ! in_array( $type, array( 'photo', 'illustration', 'vector' ), true ) ) {
			$type = 'photo';
		}

		if ( 'pexels' === $provider ) {
			$response = wp_remote_get(
				add_query_arg(
					array(
						'query'    => rawurlencode( $q ),
						'page'     => $page,
						'per_page' => self::PER_PAGE,
					),
					'https://api.pexels.com/v1/search'
				),
				array(
					'timeout' => 20,
					'headers' => array( 'Authorization' => $key ),
				)
			);
		} elseif ( 'unsplash' === $provider ) {
			$response = wp_remote_get(
				add_query_arg(
					array(
						'query'          => rawurlencode( $q ),
						'page'           => $page,
						'per_page'       => self::PER_PAGE,
						'content_filter' => 'high',
					),
					'https://api.unsplash.com/search/photos'
				),
				array(
					'timeout' => 20,
					'headers' => array(
						'Authorization'  => 'Client-ID ' . $key,
						'Accept-Version' => 'v1',
					),
				)
			);
		} else {
			$response = wp_remote_get(
				add_query_arg(
					array(
						'key'        => $key,
						'q'          => rawurlencode( $q ),
						'page'       => $page,
						'per_page'   => self::PER_PAGE,
						'image_type' => $type,
						'safesearch' => 'true',
					),
					'https://pixabay.com/api/'
				),
				array( 'timeout' => 20 )
			);
		}

		if ( is_wp_error( $response ) ) {
			// Pexels and Unsplash authenticate by header, Pixabay only
			// supports the key as a query parameter - so there the secret
			// is part of the request URL, and transport errors happily
			// quote that URL back. Redact before anything reaches the
			// client. (F-L60, 2026-07-25 audit)
			return new \WP_Error( 'wpie_stock_http', self::redact_key( $response->get_error_message(), $key ), array( 'status' => 502 ) );
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		$body = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( $code < 200 || $code >= 300 || ! is_array( $body ) ) {
			return new \WP_Error(
				'wpie_stock_provider',
				sprintf(
					/* translators: 1: provider name, 2: HTTP status. */
					__( '%1$s returned an error (HTTP %2$d), check the API key.', 'wunderpaint' ),
					ucfirst( $provider ),
					$code
				),
				array( 'status' => 502 )
			);
		}

		if ( 'pexels' === $provider ) {
			$normalized = self::normalize_pexels( $body );
		} elseif ( 'unsplash' === $provider ) {
			$normalized = self::normalize_unsplash( $body );
		} else {
			$normalized = self::normalize_pixabay( $body );
		}
		return rest_ensure_response( $normalized );
	}

	/**
	 * Unsplash /search/photos payload → normalized shape.
	 *
	 * @param array $body Decoded JSON.
	 * @return array{results:array,total:int}
	 */
	public static function normalize_unsplash( $body ) {
		$results = array();
		foreach ( (array) ( isset( $body['results'] ) ? $body['results'] : array() ) as $photo ) {
			$urls      = isset( $photo['urls'] ) ? (array) $photo['urls'] : array();
			$full      = isset( $urls['regular'] ) ? $urls['regular'] : ( isset( $urls['full'] ) ? $urls['full'] : '' );
			$user      = isset( $photo['user'] ) ? (array) $photo['user'] : array();
			$links     = isset( $photo['links'] ) ? (array) $photo['links'] : array();
			$results[] = array(
				'id'     => 'unsplash-' . ( isset( $photo['id'] ) ? $photo['id'] : '' ),
				'thumb'  => isset( $urls['small'] ) ? $urls['small'] : $full,
				'full'   => $full,
				'w'      => isset( $photo['width'] ) ? (int) $photo['width'] : 0,
				'h'      => isset( $photo['height'] ) ? (int) $photo['height'] : 0,
				'author' => isset( $user['name'] ) ? $user['name'] : '',
				'link'   => isset( $links['html'] ) ? $links['html'] : '',
			);
		}
		return array(
			'results' => $results,
			'total'   => isset( $body['total'] ) ? (int) $body['total'] : count( $results ),
		);
	}

	/**
	 * Pexels /v1/search payload → normalized shape.
	 *
	 * @param array $body Decoded JSON.
	 * @return array{results:array,total:int}
	 */
	public static function normalize_pexels( $body ) {
		$results = array();
		foreach ( (array) ( isset( $body['photos'] ) ? $body['photos'] : array() ) as $photo ) {
			$src       = isset( $photo['src'] ) ? (array) $photo['src'] : array();
			$full      = isset( $src['large2x'] ) ? $src['large2x'] : ( isset( $src['original'] ) ? $src['original'] : '' );
			$results[] = array(
				'id'     => 'pexels-' . ( isset( $photo['id'] ) ? $photo['id'] : '' ),
				'thumb'  => isset( $src['medium'] ) ? $src['medium'] : $full,
				'full'   => $full,
				'w'      => isset( $photo['width'] ) ? (int) $photo['width'] : 0,
				'h'      => isset( $photo['height'] ) ? (int) $photo['height'] : 0,
				'author' => isset( $photo['photographer'] ) ? $photo['photographer'] : '',
				'link'   => isset( $photo['url'] ) ? $photo['url'] : '',
			);
		}
		return array(
			'results' => $results,
			'total'   => isset( $body['total_results'] ) ? (int) $body['total_results'] : count( $results ),
		);
	}

	/**
	 * Pixabay /api payload → normalized shape.
	 *
	 * @param array $body Decoded JSON.
	 * @return array{results:array,total:int}
	 */
	public static function normalize_pixabay( $body ) {
		$results = array();
		foreach ( (array) ( isset( $body['hits'] ) ? $body['hits'] : array() ) as $hit ) {
			$full      = isset( $hit['largeImageURL'] ) ? $hit['largeImageURL'] : ( isset( $hit['webformatURL'] ) ? $hit['webformatURL'] : '' );
			$results[] = array(
				'id'     => 'pixabay-' . ( isset( $hit['id'] ) ? $hit['id'] : '' ),
				'thumb'  => isset( $hit['webformatURL'] ) ? $hit['webformatURL'] : $full,
				'full'   => $full,
				'w'      => isset( $hit['imageWidth'] ) ? (int) $hit['imageWidth'] : 0,
				'h'      => isset( $hit['imageHeight'] ) ? (int) $hit['imageHeight'] : 0,
				'author' => isset( $hit['user'] ) ? $hit['user'] : '',
				'link'   => isset( $hit['pageURL'] ) ? $hit['pageURL'] : '',
			);
		}
		return array(
			'results' => $results,
			'total'   => isset( $body['totalHits'] ) ? (int) $body['totalHits'] : count( $results ),
		);
	}

	/**
	 * Whether a result URL may be fetched server-side.
	 *
	 * @param string $url Candidate URL.
	 * @return bool
	 */
	public static function url_allowed( $url ) {
		$parts = wp_parse_url( $url );
		if ( empty( $parts['host'] ) || empty( $parts['scheme'] ) || 'https' !== strtolower( $parts['scheme'] ) ) {
			return false;
		}
		$host  = strtolower( $parts['host'] );
		$hosts = self::ALLOWED_HOSTS;
		foreach ( self::providers() as $provider ) {
			if ( ! empty( $provider['hosts'] ) && is_array( $provider['hosts'] ) ) {
				$hosts = array_merge( $hosts, $provider['hosts'] );
			}
		}
		foreach ( array_unique( $hosts ) as $allowed ) {
			$suffix = '.' . $allowed;
			if ( $host === $allowed || substr( $host, -strlen( $suffix ) ) === $suffix ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * POST /stock/fetch, allowlisted server-side download → data URL.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function fetch( $request ) {
		$url = (string) $request->get_param( 'url' );
		if ( ! self::url_allowed( $url ) ) {
			return new \WP_Error(
				'wpie_stock_bad_url',
				__( 'Only stock-provider image URLs can be fetched.', 'wunderpaint' ),
				array( 'status' => 400 )
			);
		}

		$limited = AI_Provider::rate_limit();
		if ( is_wp_error( $limited ) ) {
			return $limited;
		}

		// wp_safe_remote_get sets reject_unsafe_urls, so private/reserved
		// hosts are refused on the initial request AND on any redirect a
		// permissive allowlisted host might emit, closing the internal-SSRF
		// pivot that plain wp_remote_get would follow. (WPIE-019)
		$response = wp_safe_remote_get( $url, array( 'timeout' => 30 ) );
		if ( is_wp_error( $response ) ) {
			return new \WP_Error( 'wpie_stock_http', $response->get_error_message(), array( 'status' => 502 ) );
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		$body = wp_remote_retrieve_body( $response );
		$mime = (string) wp_remote_retrieve_header( $response, 'content-type' );
		$mime = strtolower( trim( strtok( $mime, ';' ) ) );
		if ( $code < 200 || $code >= 300 || '' === $body ) {
			return new \WP_Error( 'wpie_stock_http', __( 'Image download failed.', 'wunderpaint' ), array( 'status' => 502 ) );
		}
		if ( ! in_array( $mime, array( 'image/jpeg', 'image/png', 'image/webp' ), true ) ) {
			return new \WP_Error( 'wpie_stock_type', __( 'Unexpected content type from provider.', 'wunderpaint' ), array( 'status' => 502 ) );
		}
		if ( strlen( $body ) > 40 * MB_IN_BYTES ) {
			return new \WP_Error( 'wpie_stock_size', __( 'Image is too large.', 'wunderpaint' ), array( 'status' => 413 ) );
		}

		return rest_ensure_response(
			array(
				'dataUrl' => 'data:' . $mime . ';base64,' . base64_encode( $body ), // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode
				'mime'    => $mime,
			)
		);
	}
}
