<?php
/**
 * AI provider proxy (spec 11): Gemini / OpenAI / Anthropic.
 *
 * Keys live ONLY here (server-side). Results return as inline data URLs so
 * the editor canvas never taints. Includes usage metering, a monthly spend
 * cap and per-user rate limiting.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Provider abstraction + REST routes under /ai/*.
 */
class AI_Provider {

	/**
	 * Register hooks.
	 */
	public function hooks() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	/**
	 * Model ids per action+provider, settings overrides (v1.4) applied
	 * over the built-in defaults, then one filterable map (spec 11.1).
	 *
	 * @return array
	 */
	public static function models() {
		$models = array(
			'gemini'    => array(
				'generate' => 'gemini-3.1-flash-lite-image',
				'edit'     => 'gemini-3.1-flash-lite-image',
				'caption'  => 'gemini-3.1-flash-lite',
				'design'   => 'gemini-3-flash-preview',
			),
			'openai'    => array(
				'generate'   => 'gpt-image-2',
				'edit'       => 'gpt-image-2',
				'inpaint'    => 'gpt-image-2',
				'outpaint'   => 'gpt-image-2',
				'variations' => 'gpt-image-2',
				'caption'    => 'gpt-5.4-mini',
				'design'     => 'gpt-5.5',
			),
			'anthropic' => array(
				'caption' => 'claude-haiku-4-5',
				'design'  => 'claude-sonnet-5',
			),
		);

		$settings = Helpers::get_settings();
		foreach ( self::model_settings_map() as $field => $targets ) {
			$value = isset( $settings[ $field ] ) ? trim( (string) $settings[ $field ] ) : '';
			if ( '' === $value ) {
				continue;
			}
			foreach ( $targets as $target ) {
				$models[ $target[0] ][ $target[1] ] = $value;
			}
		}

		return apply_filters( 'wpie_ai_models', $models );
	}

	/**
	 * Settings field → the provider/action model slots it overrides (v1.4).
	 *
	 * @return array<string,array<int,array{0:string,1:string}>>
	 */
	public static function model_settings_map() {
		return array(
			'model_gemini'            => array( array( 'gemini', 'generate' ), array( 'gemini', 'edit' ) ),
			'model_openai'            => array( array( 'openai', 'generate' ), array( 'openai', 'edit' ), array( 'openai', 'inpaint' ), array( 'openai', 'outpaint' ) ),
			'model_openai_variations' => array( array( 'openai', 'variations' ) ),
			'model_anthropic'         => array( array( 'anthropic', 'caption' ) ),
			'model_anthropic_design'  => array( array( 'anthropic', 'design' ) ),
			'model_openai_caption'    => array( array( 'openai', 'caption' ) ),
			'model_openai_design'     => array( array( 'openai', 'design' ) ),
			'model_gemini_caption'    => array( array( 'gemini', 'caption' ) ),
			'model_gemini_design'     => array( array( 'gemini', 'design' ) ),
		);
	}

	// A docblock for a cost-estimate method that no longer exists sat
	// stranded above price_defaults() until 2026-07-25; price_defaults()
	// superseded it and carries its own. Removed rather than moved: it
	// described nothing that is still here.
	/**
	 * Editable price map (v1.73): image models bill per image, text models
	 * per million input/output tokens. These are only SEED values shown as
	 * defaults; the real numbers live in Settings → AI Providers → Models
	 * because providers reprice far more often than this plugin updates.
	 *
	 * @return array Flat key → USD map.
	 */
	public static function price_defaults() {
		return apply_filters(
			'wpie_ai_price_defaults',
			array(
				'img_gemini'               => 0.04,
				'img_openai'               => 0.04,
				'txt_gemini_caption_in'    => 0.10,
				'txt_gemini_caption_out'   => 0.40,
				'txt_gemini_design_in'     => 0.30,
				'txt_gemini_design_out'    => 2.50,
				'txt_openai_caption_in'    => 0.25,
				'txt_openai_caption_out'   => 2.00,
				'txt_openai_design_in'     => 1.25,
				'txt_openai_design_out'    => 10.00,
				'txt_anthropic_caption_in' => 1.00,
				'txt_anthropic_caption_out' => 5.00,
				'txt_anthropic_design_in'  => 3.00,
				'txt_anthropic_design_out' => 15.00,
			)
		);
	}

	/**
	 * Defaults merged with the user's prices from Settings.
	 *
	 * @return array Flat key → USD map.
	 */
	public static function configured_prices() {
		$prices   = self::price_defaults();
		$settings = Helpers::get_settings();
		$user     = json_decode( (string) ( $settings['ai_prices'] ?? '' ), true );
		if ( is_array( $user ) ) {
			foreach ( $prices as $key => $seed ) {
				if ( isset( $user[ $key ] ) && is_numeric( $user[ $key ] ) ) {
					$prices[ $key ] = max( 0, (float) $user[ $key ] );
				}
			}
		}
		return $prices;
	}

	/**
	 * Cost of one finished call from the configured prices.
	 *
	 * @param string $provider Provider id.
	 * @param string $action   Action / text tier.
	 * @param array  $usage    { images | in, out } counts.
	 * @return float USD.
	 */
	public static function configured_cost( $provider, $action, $usage ) {
		$prices = self::configured_prices();
		if ( isset( $usage['in'] ) || isset( $usage['out'] ) ) {
			$pin  = (float) ( $prices[ "txt_{$provider}_{$action}_in" ] ?? 0 );
			$pout = (float) ( $prices[ "txt_{$provider}_{$action}_out" ] ?? 0 );
			return round(
				( (float) ( $usage['in'] ?? 0 ) / 1000000 ) * $pin
					+ ( (float) ( $usage['out'] ?? 0 ) / 1000000 ) * $pout,
				6
			);
		}
		$per = (float) ( $prices[ "img_{$provider}" ] ?? 0 );
		return round( $per * (int) ( $usage['images'] ?? 0 ), 6 );
	}

	/**
	 * The model slot an action resolves AND bills at. Image actions use
	 * their own name, text actions map onto the small 'caption' or the big
	 * 'design' tier, /ai/complete picks its tier per request.
	 *
	 * @param string                $action  Action id.
	 * @param \WP_REST_Request|null $request Request, for the complete tier.
	 * @return string Slot name.
	 */
	public static function billing_tier( $action, $request = null ) {
		if ( 'complete' === $action ) {
			return $request && 'design' === $request->get_param( 'tier' ) ? 'design' : 'caption';
		}
		$map = array(
			'caption'  => 'caption',
			'seo'      => 'caption',
			'layout'   => 'caption',
			'design'   => 'design',
			'template' => 'design',
			'svg'      => 'design',
		);
		return $map[ $action ] ?? (string) $action;
	}

	/**
	 * The model ids this site has configured for one slot, across providers.
	 *
	 * @param string $tier Slot name.
	 * @return string[]
	 */
	public static function tier_models( $tier ) {
		$out = array();
		foreach ( self::models() as $actions ) {
			if ( ! empty( $actions[ $tier ] ) ) {
				$out[] = (string) $actions[ $tier ];
			}
		}
		return array_values( array_unique( $out ) );
	}

	/**
	 * Whether a caller may pin this model for that slot: it has to be one
	 * the site already runs there, so the configured price still describes
	 * what was used. Administrators are exempt. (F-L23)
	 *
	 * @param string $model Model id.
	 * @param string $tier  Slot name.
	 * @return bool
	 */
	public static function model_allowed( $model, $tier ) {
		$model = trim( (string) $model );
		if ( '' === $model || in_array( $model, self::tier_models( $tier ), true ) ) {
			return true;
		}
		return current_user_can( 'manage_options' );
	}

	/**
	 * Register /ai/* routes.
	 */
	public function register_routes() {
		$actions = array( 'generate', 'edit', 'remove-bg', 'inpaint', 'outpaint', 'enhance', 'variations', 'caption', 'design', 'template', 'layout', 'seo', 'svg', 'complete' );
		foreach ( $actions as $action ) {
			register_rest_route(
				WPIE_REST_NS,
				'/ai/' . $action,
				array(
					'methods'             => 'POST',
					'callback'            => function ( \WP_REST_Request $request ) use ( $action ) {
						return $this->handle( $action, $request );
					},
					'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
				)
			);
		}
		register_rest_route(
			WPIE_REST_NS,
			'/ai/test',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'test_connection' ),
				'permission_callback' => function () {
					return current_user_can( 'manage_options' );
				},
			)
		);
		// Background-job status (v1.4.4): slow generations run detached
		// from the HTTP request so gateway timeouts can't kill them.
		register_rest_route(
			WPIE_REST_NS,
			'/ai/job/(?P<id>wpie_job_[a-z0-9]{10,64})',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'job_status' ),
				'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
			)
		);
	}

	/**
	 * Poll a background AI job. Results are single-fetch: delivered once,
	 * then deleted.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return array|\WP_Error
	 */
	public function job_status( \WP_REST_Request $request ) {
		$id  = (string) $request['id'];
		$job = get_transient( $id );
		if ( ! is_array( $job ) || ! isset( $job['status'] ) ) {
			return new \WP_Error( 'wpie_job_unknown', __( 'The AI job expired or does not exist.', 'wunderpaint' ), array( 'status' => 404 ) );
		}
		if ( (int) $job['user'] !== get_current_user_id() ) {
			return new \WP_Error( 'wpie_job_forbidden', __( 'This AI job belongs to another user.', 'wunderpaint' ), array( 'status' => 403 ) );
		}
		if ( 'pending' === $job['status'] ) {
			return array( 'status' => 'pending' );
		}
		delete_transient( $id );
		if ( 'error' === $job['status'] ) {
			return new \WP_Error(
				! empty( $job['code'] ) ? $job['code'] : 'wpie_ai_failed',
				$job['message'],
				array( 'status' => isset( $job['http'] ) ? (int) $job['http'] : 502 )
			);
		}
		return array(
			'status' => 'done',
			'result' => $job['result'],
		);
	}

	/* ---------------------------------------------------------------------
	 * Dispatch
	 * ------------------------------------------------------------------- */

	/**
	 * Handle one AI action.
	 *
	 * @param string           $action  Action id.
	 * @param \WP_REST_Request $request Request.
	 * @return array|\WP_Error
	 */
	public function handle( $action, \WP_REST_Request $request ) {
		$limited = self::rate_limit();
		if ( is_wp_error( $limited ) ) {
			return $limited;
		}

		// Actions with a guaranteed LOCAL implementation in the editor:
		// tell the client to use it unless a capable provider is configured.
		if ( 'remove-bg' === $action || 'enhance' === $action || 'upscale' === $action ) {
			// Upscaling is always the local Lanczos path since the Imagen
			// Vertex upscaler retired with the Imagen shutdown (v1.72).
			return array( 'localFallback' => true );
		}

		// Slow provider calls detach from the HTTP request when the client
		// asks for it (v1.4.4): generations often exceed webserver gateway
		// timeouts (observed: nginx cut /ai/outpaint at ~60s while PHP was
		// still waiting on the provider). The response is flushed with a
		// job handle and the work continues in this FPM process.
		if ( $request->get_param( 'async' ) && self::can_detach() ) {
			$this->run_async( $action, $request );
			// run_async exits; reached only in (test) environments where
			// flushing is stubbed out.
			return array( 'localFallback' => false );
		}

		return $this->execute( $action, $request );
	}

	/**
	 * Flush a job handle to the client, keep working, store the result.
	 *
	 * @param string           $action  Action id.
	 * @param \WP_REST_Request $request Request.
	 */
	private function run_async( $action, \WP_REST_Request $request ) {
		self::detach(
			function () use ( $action, $request ) {
				return $this->execute( $action, $request );
			}
		);
	}

	/**
	 * Whether PHP can flush the HTTP response early and keep working
	 * (PHP-FPM or LiteSpeed). Without it, slow calls run synchronously and
	 * risk dying at the webserver gateway timeout.
	 *
	 * @return bool
	 */
	public static function can_detach() {
		return function_exists( 'fastcgi_finish_request' ) || function_exists( 'litespeed_finish_request' );
	}

	/**
	 * Generic detach (v1.85.0, extracted from run_async so the Pro content
	 * generator can reuse it): flush a { jobId } response to the client,
	 * keep working in this PHP process, store the callable's return value
	 * for GET /ai/job/{id}. Exits when flushing worked; only returns in
	 * environments where the flush functions are stubbed (tests).
	 *
	 * @param callable $work Long-running work, returns array|\WP_Error.
	 */
	public static function detach( $work ) {
		$job = 'wpie_job_' . strtolower( wp_generate_password( 24, false ) );
		set_transient(
			$job,
			array(
				'status' => 'pending',
				'user'   => get_current_user_id(),
			),
			HOUR_IN_SECONDS
		);

		ignore_user_abort( true );
		// Scoped to this function on purpose, never set globally: detach() is
		// only ever entered for work the caller has already decided to run in
		// the background after the response has been flushed, so the raise
		// applies to that one detached request and to nothing else on the site.
		if ( function_exists( 'set_time_limit' ) ) {
			set_time_limit( 900 ); // phpcs:ignore Squiz.PHP.DiscouragedFunctions.Discouraged -- detached background job only; guarded by function_exists() above.
		}
		if ( ! headers_sent() ) {
			status_header( 200 );
			header( 'Content-Type: application/json; charset=' . get_option( 'blog_charset' ) );
		}
		echo wp_json_encode( array( 'jobId' => $job ) );
		if ( function_exists( 'fastcgi_finish_request' ) ) {
			fastcgi_finish_request();
		} elseif ( function_exists( 'litespeed_finish_request' ) ) {
			litespeed_finish_request();
		}

		$result = $work();
		if ( is_wp_error( $result ) ) {
			$data = $result->get_error_data();
			set_transient(
				$job,
				array(
					'status'  => 'error',
					'user'    => get_current_user_id(),
					'code'    => $result->get_error_code(),
					'message' => $result->get_error_message(),
					'http'    => is_array( $data ) && isset( $data['status'] ) ? (int) $data['status'] : 502,
				),
				HOUR_IN_SECONDS
			);
		} else {
			set_transient(
				$job,
				array(
					'status' => 'done',
					'user'   => get_current_user_id(),
					'result' => $result instanceof \WP_REST_Response ? $result->get_data() : $result,
				),
				HOUR_IN_SECONDS
			);
		}
		exit;
	}

	/**
	 * Run one provider-backed action synchronously.
	 *
	 * @param string           $action  Action id.
	 * @param \WP_REST_Request $request Request.
	 * @return array|\WP_Error
	 */
	private function execute( $action, \WP_REST_Request $request ) {
		// Per-call model override (v1.81.1): the Pro content generator lets
		// a content template pin an exact model id.
		//
		// The override used to accept ANY string and rewrite EVERY slot of
		// every provider, while the usage log kept pricing by provider and
		// tier - so an expensive model billed at the cheapest tier's rate
		// and the monthly budget only bit at a multiple of its limit. Now
		// only a model the site has configured for this action's own
		// billing tier is accepted, which keeps price and model in step.
		// Administrators own the budget and the price table, so they may
		// still pin anything. (F-L23, 2026-07-25 audit)
		$model_override = sanitize_text_field( (string) $request->get_param( 'model' ) );
		$tier           = self::billing_tier( $action, $request );
		if ( '' !== $model_override ) {
			if ( ! self::model_allowed( $model_override, $tier ) ) {
				return new \WP_Error(
					'wpie_ai_model',
					__( 'That model is not configured for this action on this site.', 'wunderpaint' ),
					array( 'status' => 400 )
				);
			}
			add_filter(
				'wpie_ai_models',
				function ( $models ) use ( $model_override, $tier ) {
					foreach ( $models as $provider => $actions ) {
						if ( isset( $actions[ $tier ] ) ) {
							$models[ $provider ][ $tier ] = $model_override;
						}
					}
					return $models;
				}
			);
		}

		// Generic completion (v1.273.0 / API 2.10): the extension-facing
		// text endpoint - prompt in, text or schema-shaped JSON out. It
		// resolves its own provider and meters itself (the schema path
		// delegates to text_structured, which is self-metering).
		if ( 'complete' === $action ) {
			return $this->text_complete( $request );
		}

		// Text/vision actions run on any text-capable provider (v1.71):
		// explicit provider param > default_text_provider > first configured.
		$text_actions = array(
			'caption'  => array( 'text_caption', 'caption' ),
			'seo'      => array( 'text_seo', 'caption' ),
			'design'   => array( 'text_design', 'design' ),
			'template' => array( 'text_template', 'design' ),
			'layout'   => array( 'text_layout', 'caption' ),
			'svg'      => array( 'text_svg', 'design' ),
		);
		if ( isset( $text_actions[ $action ] ) ) {
			$provider = $this->resolve_text_provider( (string) $request->get_param( 'provider' ) );
			if ( is_wp_error( $provider ) ) {
				return $provider;
			}
			list( $fn, $tier ) = $text_actions[ $action ];
			return $this->metered( $provider, $tier, function () use ( $fn, $provider, $request ) {
				return $this->$fn( $provider, $request );
			} );
		}

		$provider = $this->resolve_provider( $action, (string) $request->get_param( 'provider' ) );
		if ( is_wp_error( $provider ) ) {
			return $provider;
		}

		return $this->metered( $provider, $action, function () use ( $provider, $action, $request ) {
			switch ( $provider ) {
				case 'gemini':
					return $this->gemini( $action, $request );
				case 'openai':
					return $this->openai( $action, $request );
				case self::CORE_PROVIDER:
					return AI_Core::images(
						(string) $request->get_param( 'prompt' ),
						(int) $request->get_param( 'n' )
					);
			}
			return self::err_unconfigured( $provider );
		} );
	}

	/**
	 * Pick a provider that can do the action (spec 11.1 capability matrix).
	 *
	 * @param string $action    Action id.
	 * @param string $requested Requested provider ('' = default).
	 * @return string|\WP_Error
	 */
	/**
	 * Provider id standing for "WordPress' own AI client" (see class-ai-core.php).
	 * Never a real key of ours; it means the site owner configured a provider
	 * in WordPress itself and we borrow it rather than asking for a second one.
	 */
	const CORE_PROVIDER = 'wp-core';

	private function resolve_provider( $action, $requested ) {
		$capabilities = array(
			'generate'   => array( 'gemini', 'openai' ),
			'edit'       => array( 'gemini', 'openai' ),
			'inpaint'    => array( 'openai', 'gemini' ),   // openai = true mask, gemini approximate.
			'outpaint'   => array( 'openai', 'gemini' ),
			'variations' => array( 'openai' ),             // gpt-image-1 via edits.
		);
		if ( ! isset( $capabilities[ $action ] ) ) {
			return new \WP_Error( 'wpie_bad_action', __( 'Unknown AI action.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		$capable = $capabilities[ $action ];

		$candidates = array();
		if ( $requested && in_array( $requested, $capable, true ) ) {
			$candidates[] = $requested;
		}
		// The default provider only outranks the matrix for generate/edit;
		// mask-based actions keep their primary (openai = true mask, 11.1).
		$settings = Helpers::get_settings();
		if ( in_array( $action, array( 'generate', 'edit' ), true ) && in_array( $settings['default_provider'], $capable, true ) ) {
			$candidates[] = $settings['default_provider'];
		}
		$candidates = array_unique( array_merge( $candidates, $capable ) );

		foreach ( $candidates as $provider ) {
			if ( Helpers::provider_status( $provider ) ) {
				return $provider;
			}
		}
		// Plain generation can run on WordPress' own AI client. Editing,
		// inpainting, outpainting and variations cannot: they need an input
		// image and a mask, which that interface has no way to carry, so
		// those still ask for a key and say so.
		if ( 'generate' === $action && AI_Core::available() ) {
			return self::CORE_PROVIDER;
		}
		return self::err_unconfigured( $requested ? $requested : $settings['default_provider'] );
	}

	/**
	 * Budget-check → run → record usage.
	 *
	 * @param string   $provider     Provider id.
	 * @param string   $action       Action id (used in the usage log).
	 * @param callable $call         Adapter call returning array|WP_Error.
	 * @param string   $price_action Optional price tier when the logged
	 *                               action has no own price keys (v1.81:
	 *                               'text_article' bills as 'design').
	 * @return array|\WP_Error
	 */
	private function metered( $provider, $action, $call, $price_action = '' ) {
		$budget = self::check_budget();
		if ( is_wp_error( $budget ) ) {
			return $budget;
		}

		$result = $call();
		if ( is_wp_error( $result ) ) {
			return $result;
		}

		// Real usage (v1.73): text adapters report tokens; image results
		// count their returned images. Cost = the user's configured prices.
		$usage = isset( $result['usage'] ) && is_array( $result['usage'] )
			? $result['usage']
			: array();
		if ( ! isset( $usage['in'] ) && ! isset( $usage['images'] ) && isset( $result['images'] ) && is_array( $result['images'] ) ) {
			$usage = array( 'images' => count( $result['images'] ) );
		}
		$cost   = self::configured_cost( $provider, '' !== $price_action ? $price_action : $action, $usage );
		$models = self::models();
		$model  = isset( $usage['model'] ) && '' !== $usage['model']
			? (string) $usage['model']
			: (string) ( $models[ $provider ][ $action ] ?? ( $models[ $provider ]['generate'] ?? '' ) );
		Helpers::log_ai_usage( $provider, $action, $model, $usage, $cost );
		unset( $result['usage'] );
		$result['cost']     = $cost;
		$result['provider'] = $provider;
		return $result;
	}

	/* ---------------------------------------------------------------------
	 * Metering, budget, rate limit
	 * ------------------------------------------------------------------- */

	/**
	 * Block when the monthly cap would be exceeded (0 = unlimited).
	 *
	 * @param float $estimate Estimated cost of the pending call.
	 * @return true|\WP_Error
	 */
	public static function check_budget( $estimate = 0 ) {
		$settings = Helpers::get_settings();
		$limit    = (float) $settings['monthly_limit'];
		if ( $limit <= 0 ) {
			return true;
		}
		$usage = Helpers::usage_this_month();
		if ( (float) $usage['cost'] + $estimate >= $limit ) {
			return new \WP_Error(
				'wpie_budget_exceeded',
				__( 'Monthly AI limit reached; raise it in Settings → WunderPaint.', 'wunderpaint' ),
				array( 'status' => 429 )
			);
		}
		return true;
	}

	// record_usage() stood here until 2026-07-25. It wrote a wpie_usage
	// option that nothing ever read: metered() logs through
	// Helpers::log_ai_usage() into wpie_ai_usage_log, and check_budget()
	// reads usage_this_month(), which iterates that log. The option is
	// still deleted in uninstall.php so old installs are cleaned up.

	/**
	 * Sliding-window per-user rate limit. The cap is the ai_rate_limit
	 * setting (60 per 5 minutes by default, lookup_rate_limit 120). Callers
	 * that are not the paid /ai/* surface can pass their own bucket and cap so
	 * a free side channel (e.g. geo lookups) does not share, or starve, the AI
	 * window. The default bucket keeps the historical 'wpie_rl_<uid>' key.
	 *
	 * @param string $bucket  Bucket id ('ai' keeps the legacy key).
	 * @param int    $max     Per-window cap (0 = the filtered default).
	 * @param string $setting Which setting supplies that default.
	 * @return true|\WP_Error
	 */
	public static function rate_limit( $bucket = 'ai', $max = 0, $setting = 'ai_rate_limit' ) {
		if ( $max <= 0 ) {
			$settings  = Helpers::get_settings();
			$fallbacks = array(
				'ai_rate_limit'     => 60,
				'lookup_rate_limit' => 120,
			);
			$configured = isset( $settings[ $setting ] )
				? (int) $settings[ $setting ]
				: ( isset( $fallbacks[ $setting ] ) ? $fallbacks[ $setting ] : 60 );
			// 0 in settings means "no throttle" - honour it as a very high cap.
			$max = $configured > 0 ? $configured : PHP_INT_MAX;
		}
		// The bucket is passed along so a site can throttle a single route
		// differently without touching the others.
		$max    = (int) apply_filters( 'wpie_ai_rate_limit', $max, $bucket );
		if ( $max <= 0 ) {
			return true;
		}
		$window = 5 * MINUTE_IN_SECONDS;
		$key    = 'wpie_rl_' . ( 'ai' === $bucket ? '' : $bucket . '_' ) . get_current_user_id();
		$hits   = get_transient( $key );
		$hits   = is_array( $hits ) ? $hits : array();
		$now    = time();
		$hits   = array_values(
			array_filter(
				$hits,
				function ( $t ) use ( $now, $window ) {
					return $t > $now - $window;
				}
			)
		);
		if ( count( $hits ) >= $max ) {
			return new \WP_Error(
				'wpie_rate_limited',
				__( 'Too many AI requests, please wait a few minutes and try again.', 'wunderpaint' ),
				array( 'status' => 429 )
			);
		}
		$hits[] = $now;
		set_transient( $key, $hits, $window );
		return true;
	}

	/* ---------------------------------------------------------------------
	 * HTTP plumbing
	 * ------------------------------------------------------------------- */

	/**
	 * POST JSON with one retry on transient failures (spec 11.1).
	 *
	 * @param string $url     Endpoint.
	 * @param array  $headers Headers.
	 * @param mixed  $body    Body (array → JSON).
	 * @return array|\WP_Error Decoded JSON.
	 */
	private static function post_json( $url, $headers, $body, $timeout = 180 ) {
		$args = array(
			// Generations run detached from the client request (v1.4.4
			// async jobs), so a generous provider timeout is safe. Long
			// article calls (text_structured, v1.81) pass an even higher
			// budget explicitly.
			'timeout' => $timeout,
			'headers' => array_merge( array( 'Content-Type' => 'application/json' ), $headers ),
			'body'    => is_string( $body ) ? $body : wp_json_encode( $body ),
		);
		for ( $attempt = 0; $attempt < 2; $attempt++ ) {
			$response = wp_remote_post( $url, $args );
			$code     = wp_remote_retrieve_response_code( $response );
			if ( is_wp_error( $response ) || $code >= 500 ) {
				continue; // Retry once on transport error / 5xx.
			}
			$json = json_decode( wp_remote_retrieve_body( $response ), true );
			if ( $code >= 400 ) {
				return self::provider_error( $code, $json );
			}
			return is_array( $json ) ? $json : array();
		}
		return new \WP_Error( 'wpie_ai_transport', __( 'The AI provider did not respond. Please try again.', 'wunderpaint' ), array( 'status' => 502 ) );
	}

	/**
	 * Map a provider HTTP error to a typed WP_Error.
	 *
	 * @param int        $code HTTP status.
	 * @param array|null $json Decoded body.
	 * @return \WP_Error
	 */
	private static function provider_error( $code, $json ) {
		$message = '';
		if ( is_array( $json ) ) {
			$message = $json['error']['message'] ?? ( $json['message'] ?? ( is_string( $json['error'] ?? null ) ? $json['error'] : '' ) );
		}
		if ( '' === $message ) {
			$message = sprintf( /* translators: %d: HTTP status code. */ __( 'AI provider error (HTTP %d).', 'wunderpaint' ), $code );
		}
		$is_auth = in_array( $code, array( 401, 403 ), true );
		return new \WP_Error(
			$is_auth ? 'wpie_ai_auth' : ( 429 === $code ? 'wpie_ai_quota' : 'wpie_ai_provider' ),
			$message,
			array( 'status' => $is_auth ? 401 : ( 429 === $code ? 429 : 502 ) )
		);
	}

	/**
	 * Error for an unconfigured provider with a Settings hint.
	 *
	 * @param string $provider Provider id.
	 * @return \WP_Error
	 */
	private static function err_unconfigured( $provider ) {
		return new \WP_Error(
			'wpie_ai_unconfigured',
			sprintf(
				/* translators: %s: provider name. */
				__( 'No API key configured for %s. Add one under Settings → WunderPaint.', 'wunderpaint' ),
				ucfirst( $provider )
			),
			array( 'status' => 409 )
		);
	}

	/**
	 * Split a data URL into [mime, base64-payload].
	 *
	 * @param string $data_url Data URL.
	 * @return array{0:string,1:string}|\WP_Error
	 */
	private static function split_data_url( $data_url ) {
		if ( ! preg_match( '#^data:(image/[a-z.+-]+);base64,(.+)$#is', (string) $data_url, $m ) ) {
			return new \WP_Error( 'wpie_bad_image', __( 'Malformed image data.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		return array( $m[1], $m[2] );
	}

	/* ---------------------------------------------------------------------
	 * Gemini (Generative Language API)
	 * ------------------------------------------------------------------- */

	/**
	 * Gemini generate/edit/inpaint/outpaint (inpaint/outpaint approximate).
	 *
	 * @param string           $action  Action.
	 * @param \WP_REST_Request $request Request.
	 * @return array|\WP_Error
	 */
	private function gemini( $action, \WP_REST_Request $request ) {
		$key    = Helpers::get_api_key( 'gemini' );
		$models = self::models();
		$model  = $models['gemini']['generate'];
		$prompt = (string) $request->get_param( 'prompt' );

		// Explicit aspect ratio (v1.5): the Gemini image models support
		// imageConfig.aspectRatio for generation AND editing. Sent
		// unconditionally, so a model override keeps working.
		$aspect            = (string) $request->get_param( 'aspect' );
		$allowed_aspects   = array( '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9' );
		$generation_config = array( 'responseModalities' => array( 'IMAGE' ) );
		if ( in_array( $aspect, $allowed_aspects, true ) ) {
			$generation_config['imageConfig'] = array( 'aspectRatio' => $aspect );
		}

		$parts = array();
		if ( 'generate' === $action ) {
			$size = (string) $request->get_param( 'size' );
			if ( $size ) {
				$prompt .= ' (Target image size: ' . $size . '.)';
			}
			$parts[] = array( 'text' => $prompt );
		} else {
			$image = self::split_data_url( $request->get_param( 'image' ) );
			if ( is_wp_error( $image ) ) {
				return $image;
			}
			$instruction = $prompt;
			if ( 'inpaint' === $action ) {
				$instruction = 'Edit the first image: apply the following change ONLY inside the white area of the second (mask) image, keep everything else pixel-identical. Change: ' . $prompt;
			} elseif ( 'outpaint' === $action ) {
				$instruction = 'Outpainting task: keep every existing (non-transparent) pixel of the first image EXACTLY as it is, and ONLY fill its transparent areas with a natural continuation of the image. The white area of the second (mask) image marks the areas to fill. Return the full image at the same size. ' . $prompt;
			} elseif ( 'edit' === $action ) {
				$instruction = 'Edit this image: ' . $prompt;
			}
			$parts[] = array( 'text' => $instruction );
			$parts[] = array(
				'inline_data' => array(
					'mime_type' => $image[0],
					'data'      => $image[1],
				),
			);
			$mask = $request->get_param( 'mask' );
			if ( in_array( $action, array( 'inpaint', 'outpaint' ), true ) && $mask ) {
				$mask_parts = self::split_data_url( $mask );
				if ( ! is_wp_error( $mask_parts ) ) {
					$parts[] = array(
						'inline_data' => array(
							'mime_type' => $mask_parts[0],
							'data'      => $mask_parts[1],
						),
					);
				}
			}
		}

		// Optional extra reference image (v1.77.1, e.g. the brand logo).
		// Gemini accepts any number of inline parts in one turn.
		$ref = $request->get_param( 'refImage' );
		if ( $ref ) {
			$ref_parts = self::split_data_url( $ref );
			if ( ! is_wp_error( $ref_parts ) ) {
				$parts[] = array( 'text' => 'Additional reference image (brand logo / style); incorporate it faithfully where it fits, do not distort it:' );
				$parts[] = array(
					'inline_data' => array(
						'mime_type' => $ref_parts[0],
						'data'      => $ref_parts[1],
					),
				);
			}
		}

		$json = self::post_json(
			'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode( $model ) . ':generateContent',
			array( 'x-goog-api-key' => $key ),
			array(
				'contents'         => array( array( 'parts' => $parts ) ),
				'generationConfig' => $generation_config,
			)
		);
		if ( is_wp_error( $json ) ) {
			return $json;
		}

		$images = array();
		foreach ( $json['candidates'][0]['content']['parts'] ?? array() as $part ) {
			$inline = $part['inlineData'] ?? ( $part['inline_data'] ?? null );
			if ( isset( $inline['data'] ) ) {
				$mime     = $inline['mimeType'] ?? ( $inline['mime_type'] ?? 'image/png' );
				$images[] = 'data:' . $mime . ';base64,' . $inline['data'];
			}
		}
		if ( ! $images ) {
			return new \WP_Error( 'wpie_ai_empty', __( 'Gemini returned no image. Try rephrasing the prompt.', 'wunderpaint' ), array( 'status' => 502 ) );
		}
		return array( 'images' => $images );
	}

	/* ---------------------------------------------------------------------
	 * OpenAI
	 * ------------------------------------------------------------------- */

	/**
	 * Nearest OpenAI-supported size for a requested "WxH".
	 *
	 * @param string $size Requested size.
	 * @return string
	 */
	private static function openai_size( $size ) {
		if ( preg_match( '/^(\d+)x(\d+)$/', (string) $size, $m ) ) {
			$ratio = (int) $m[1] / max( 1, (int) $m[2] );
			if ( $ratio > 1.2 ) {
				return '1536x1024';
			}
			if ( $ratio < 0.8 ) {
				return '1024x1536';
			}
		}
		return '1024x1024';
	}

	/**
	 * Effective OpenAI size from an explicit aspect ("3:2") or a "WxH"
	 * size hint (v1.5).
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return string
	 */
	private static function openai_request_size( \WP_REST_Request $request ) {
		$aspect = (string) $request->get_param( 'aspect' );
		if ( preg_match( '/^(\d+):(\d+)$/', $aspect, $m ) ) {
			return self::openai_size( ( (int) $m[1] * 100 ) . 'x' . ( (int) $m[2] * 100 ) );
		}
		return self::openai_size( $request->get_param( 'size' ) );
	}

	/**
	 * OpenAI generate (JSON) and edit/inpaint/outpaint/variations (multipart).
	 *
	 * @param string           $action  Action.
	 * @param \WP_REST_Request $request Request.
	 * @return array|\WP_Error
	 */
	private function openai( $action, \WP_REST_Request $request ) {
		$key    = Helpers::get_api_key( 'openai' );
		$models = self::models();
		$n      = min( 4, max( 1, (int) ( $request->get_param( 'n' ) ? $request->get_param( 'n' ) : 1 ) ) );

		$ref = (string) $request->get_param( 'refImage' );

		if ( 'generate' === $action && ! $ref ) {
			$json = self::post_json(
				'https://api.openai.com/v1/images/generations',
				array( 'Authorization' => 'Bearer ' . $key ),
				array(
					'model'  => $models['openai']['generate'],
					'prompt' => (string) $request->get_param( 'prompt' ),
					'size'   => self::openai_request_size( $request ),
					'n'      => $n,
				)
			);
			return self::openai_images( $json );
		}

		// Multipart endpoints: edits (edit/inpaint/outpaint/generate-with-
		// reference) + variations. Generate with a reference image (v1.77.1,
		// e.g. the brand logo) runs through edits with the reference as its
		// input image; gpt-image treats inputs as references for a NEW image.
		$image_param = $request->get_param( 'image' );
		$ref_is_main = false;
		if ( ! $image_param && $ref ) {
			$image_param = $ref;
			$ref_is_main = true;
			$ref         = '';
		}
		$image = self::split_data_url( $image_param );
		if ( is_wp_error( $image ) ) {
			return $image;
		}
		// A second reference image joins as an image[] array (the API wants
		// every entry named image[] once there is more than one).
		$use_array = '' !== $ref && 'variations' !== $action;
		$fields    = array();
		$files     = array(
			'image' => array(
				'field' => $use_array ? 'image[]' : 'image',
				'name'  => 'image.png',
				'mime'  => $image[0],
				'bytes' => base64_decode( $image[1] ), // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode
			),
		);
		if ( $use_array ) {
			$ref_split = self::split_data_url( $ref );
			if ( ! is_wp_error( $ref_split ) ) {
				$files['image_ref'] = array(
					'field' => 'image[]',
					'name'  => 'reference.png',
					'mime'  => $ref_split[0],
					'bytes' => base64_decode( $ref_split[1] ), // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode
				);
			} else {
				$files['image']['field'] = 'image';
				$use_array               = false;
			}
		}

		if ( 'variations' === $action ) {
			// DALL-E 2's dedicated variations endpoint retired in May 2026.
			// gpt-image-1 tends to copy the input when every image shares
			// one timid "make a variation" prompt, so each image gets its
			// own distinct angle through the edits endpoint. Billing is per
			// generated image either way, so N calls cost the same as n=N.
			$angles = array(
				'Change the lighting and the overall color mood noticeably (a different time of day or palette) while keeping the subject and composition.',
				'Change the background and the small supporting details noticeably while keeping the main subject and composition.',
				'Use a noticeably different artistic treatment (more painterly, flatter or more photographic) while keeping the subject and composition.',
				'Shift the framing or perspective slightly and vary materials and textures while keeping the subject recognisable.',
			);
			$count  = min( count( $angles ), max( 1, $n ) );
			$images = array();
			for ( $i = 0; $i < $count; $i++ ) {
				$json = self::post_multipart(
					'https://api.openai.com/v1/images/edits',
					array( 'Authorization' => 'Bearer ' . $key ),
					array(
						'model'  => $models['openai']['variations'],
						'prompt' => 'Create a clearly different variation of this image; do not reproduce it exactly. ' . $angles[ $i ],
						'n'      => '1',
					),
					$files
				);
				$out = self::openai_images( $json );
				if ( is_wp_error( $out ) ) {
					// Keep what already succeeded instead of losing paid images.
					return $images ? array( 'images' => $images ) : $out;
				}
				$images = array_merge( $images, isset( $out['images'] ) ? $out['images'] : array() );
			}
			return array( 'images' => $images );
		}

		$url              = 'https://api.openai.com/v1/images/edits';
		$fields['model']  = $models['openai']['edit'];
		$fields['prompt'] = (string) $request->get_param( 'prompt' );
		if ( 'generate' === $action ) {
			$fields['prompt'] = 'Create a new image; the attached image is only a brand/style reference, do not copy it literally. ' . $fields['prompt'];
		} elseif ( $use_array ) {
			$fields['prompt'] .= ' The last attached image is an additional reference (brand logo / style); incorporate it faithfully where it fits.';
		}
		if ( $ref_is_main && 'generate' === $action ) {
			$fields['model'] = $models['openai']['generate'];
		}
		$fields['n']      = (string) $n;
		// Match the request's aspect so the client-side reprojection
		// barely has to crop (v1.5).
		$fields['size'] = self::openai_request_size( $request );
		$mask           = $request->get_param( 'mask' );
		if ( $mask ) {
			$mask_parts = self::split_data_url( $mask );
			if ( ! is_wp_error( $mask_parts ) ) {
				// Editor masks mark the CHANGE region white; OpenAI wants
				// it transparent (alpha = 0), convert via GD.
				$converted     = self::mask_white_to_transparent( base64_decode( $mask_parts[1] ) ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode
				$files['mask'] = array(
					'name'  => 'mask.png',
					'mime'  => 'image/png',
					'bytes' => $converted,
				);
			}
		}

		$json = self::post_multipart( $url, array( 'Authorization' => 'Bearer ' . $key ), $fields, $files );
		return self::openai_images( $json );
	}

	/**
	 * Convert an editor mask (white = change region) into OpenAI's format
	 * (transparent = change region). Returns PNG bytes.
	 *
	 * @param string $png_bytes Source PNG bytes.
	 * @return string Converted PNG bytes (source on failure).
	 */
	private static function mask_white_to_transparent( $png_bytes ) {
		if ( ! function_exists( 'imagecreatefromstring' ) ) {
			return $png_bytes;
		}
		$src = @imagecreatefromstring( $png_bytes ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		if ( ! $src ) {
			return $png_bytes;
		}
		$w   = imagesx( $src );
		$h   = imagesy( $src );
		$out = imagecreatetruecolor( $w, $h );
		imagealphablending( $out, false );
		imagesavealpha( $out, true );
		$transparent = imagecolorallocatealpha( $out, 0, 0, 0, 127 );
		$opaque      = imagecolorallocatealpha( $out, 0, 0, 0, 0 );
		for ( $y = 0; $y < $h; $y++ ) {
			for ( $x = 0; $x < $w; $x++ ) {
				$rgb  = imagecolorat( $src, $x, $y );
				$r    = ( $rgb >> 16 ) & 0xFF;
				$g    = ( $rgb >> 8 ) & 0xFF;
				$b    = $rgb & 0xFF;
				$luma = 0.2126 * $r + 0.7152 * $g + 0.0722 * $b;
				imagesetpixel( $out, $x, $y, $luma > 127 ? $transparent : $opaque );
			}
		}
		imagedestroy( $src );
		ob_start();
		imagepng( $out );
		imagedestroy( $out );
		return ob_get_clean();
	}

	/**
	 * Extract images from an OpenAI response.
	 *
	 * @param array|\WP_Error $json Response.
	 * @return array|\WP_Error
	 */
	private static function openai_images( $json ) {
		if ( is_wp_error( $json ) ) {
			return $json;
		}
		$images = array();
		foreach ( $json['data'] ?? array() as $item ) {
			if ( ! empty( $item['b64_json'] ) ) {
				$images[] = 'data:image/png;base64,' . $item['b64_json'];
			}
		}
		if ( ! $images ) {
			return new \WP_Error( 'wpie_ai_empty', __( 'OpenAI returned no image.', 'wunderpaint' ), array( 'status' => 502 ) );
		}
		return array( 'images' => $images );
	}

	/**
	 * Multipart POST with one retry (OpenAI images/edits + variations).
	 *
	 * @param string $url     Endpoint.
	 * @param array  $headers Headers.
	 * @param array  $fields  Plain form fields.
	 * @param array  $files   name => {name,mime,bytes}.
	 * @return array|\WP_Error
	 */
	private static function post_multipart( $url, $headers, $fields, $files ) {
		$boundary = 'wpie' . wp_generate_password( 24, false );
		$body     = '';
		foreach ( $fields as $name => $value ) {
			$body .= "--$boundary\r\nContent-Disposition: form-data; name=\"$name\"\r\n\r\n$value\r\n";
		}
		foreach ( $files as $name => $file ) {
			$field = isset( $file['field'] ) ? $file['field'] : $name;
			$body .= "--$boundary\r\nContent-Disposition: form-data; name=\"$field\"; filename=\"{$file['name']}\"\r\n" .
				"Content-Type: {$file['mime']}\r\n\r\n{$file['bytes']}\r\n";
		}
		$body .= "--$boundary--\r\n";

		$args = array(
			'timeout' => 180,
			'headers' => array_merge( array( 'Content-Type' => 'multipart/form-data; boundary=' . $boundary ), $headers ),
			'body'    => $body,
		);
		for ( $attempt = 0; $attempt < 2; $attempt++ ) {
			$response = wp_remote_post( $url, $args );
			$code     = wp_remote_retrieve_response_code( $response );
			if ( is_wp_error( $response ) || $code >= 500 ) {
				continue;
			}
			$json = json_decode( wp_remote_retrieve_body( $response ), true );
			if ( $code >= 400 ) {
				return self::provider_error( $code, $json );
			}
			return is_array( $json ) ? $json : array();
		}
		return new \WP_Error( 'wpie_ai_transport', __( 'The AI provider did not respond. Please try again.', 'wunderpaint' ), array( 'status' => 502 ) );
	}

	/* ---------------------------------------------------------------------
	 * Shared response helpers
	 *
	 * This is where the Imagen section used to sit. Imagen and its Vertex
	 * auth mode were retired in v1.72 and everything moved to Gemini; the
	 * removal left a dead section banner, a mis-indented one for Anthropic
	 * (whose code lives further down, at text_caption()) and the orphaned
	 * docblock of a method that no longer exists. Cleared 2026-07-25.
	 * ------------------------------------------------------------------- */

	/**
	 * Pull the first JSON object out of a model response (tolerates prose
	 * and markdown fences). Public for tests.
	 *
	 * @param string $text Raw model text.
	 * @return array|null Decoded object or null.
	 */
	public static function extract_json( $text ) {
		$text  = trim( preg_replace( '/^```(?:json)?|```$/m', '', trim( (string) $text ) ) );
		$start = strpos( $text, '{' );
		$end   = strrpos( $text, '}' );
		if ( false === $start || false === $end || $end <= $start ) {
			return null;
		}
		$parsed = json_decode( substr( $text, $start, $end - $start + 1 ), true );
		return is_array( $parsed ) ? $parsed : null;
	}

	/**
	 * Pick the text-capable provider for caption/design/seo work (v1.71):
	 * requested > default_text_provider setting > first configured.
	 *
	 * @param string $requested Optional explicit provider.
	 * @return string|\WP_Error anthropic|openai|gemini.
	 */
	private function resolve_text_provider( $requested ) {
		$settings   = Helpers::get_settings();
		$capable    = array( 'anthropic', 'openai', 'gemini' );
		$candidates = array_unique(
			array_merge(
				$requested ? array( $requested ) : array(),
				array( (string) ( $settings['default_text_provider'] ?? 'anthropic' ) ),
				$capable
			)
		);
		foreach ( $candidates as $p ) {
			if ( in_array( $p, $capable, true ) && Helpers::provider_status( $p ) ) {
				return $p;
			}
		}
		// Nothing of our own. WordPress 7.0 ships an AI client that the site
		// owner sets up once, at site level, so borrow it instead of sending
		// them off to fetch a second key (wordpress.org review, 2026-08-08).
		// Own keys keep priority in the loop above: they carry the per-tier
		// model choice, the token accounting behind the monthly budget, and
		// the things the core client cannot express - vision, web search,
		// masks.
		if ( AI_Core::available() ) {
			return self::CORE_PROVIDER;
		}
		return self::err_unconfigured( (string) ( $settings['default_text_provider'] ?? 'anthropic' ) );
	}

	/**
	 * One text/vision completion on a text-capable provider (v1.71).
	 * `$content` uses the Anthropic block format ({type:'text'|'image'}) and
	 * is converted for OpenAI (chat.completions) and Gemini (generateContent).
	 * Returns { text, usage: { in, out, model } } for real cost metering.
	 *
	 * @param string $provider   anthropic|openai|gemini.
	 * @param string $tier       Model tier: 'caption' (fast) or 'design'.
	 * @param string $system     System prompt ('' for none).
	 * @param array  $content    Content blocks.
	 * @param int    $max_tokens Response budget.
	 * @return array|\WP_Error { text, usage }.
	 */
	private function text_completion( $provider, $tier, $system, $content, $max_tokens ) {
		if ( self::CORE_PROVIDER === $provider ) {
			return AI_Core::text_completion( $system, $content, $max_tokens );
		}
		$models = self::models();

		if ( 'openai' === $provider ) {
			$user = array();
			foreach ( $content as $block ) {
				if ( 'image' === ( $block['type'] ?? '' ) ) {
					$user[] = array(
						'type'      => 'image_url',
						'image_url' => array(
							'url' => 'data:' . $block['source']['media_type'] . ';base64,' . $block['source']['data'],
						),
					);
				} else {
					$user[] = array(
						'type' => 'text',
						'text' => (string) ( $block['text'] ?? '' ),
					);
				}
			}
			$messages = array();
			if ( '' !== $system ) {
				$messages[] = array(
					'role'    => 'system',
					'content' => $system,
				);
			}
			$messages[] = array(
				'role'    => 'user',
				'content' => $user,
			);
			$json = self::post_json(
				'https://api.openai.com/v1/chat/completions',
				array( 'Authorization' => 'Bearer ' . Helpers::get_api_key( 'openai' ) ),
				array(
					'model'                 => $models['openai'][ $tier ],
					'max_completion_tokens' => $max_tokens,
					'messages'              => $messages,
				)
			);
			if ( is_wp_error( $json ) ) {
				return $json;
			}
			return array(
				'text'  => (string) ( $json['choices'][0]['message']['content'] ?? '' ),
				'usage' => array(
					'in'    => (int) ( $json['usage']['prompt_tokens'] ?? 0 ),
					'out'   => (int) ( $json['usage']['completion_tokens'] ?? 0 ),
					'model' => $models['openai'][ $tier ],
				),
			);
		}

		if ( 'gemini' === $provider ) {
			$parts = array();
			foreach ( $content as $block ) {
				if ( 'image' === ( $block['type'] ?? '' ) ) {
					$parts[] = array(
						'inline_data' => array(
							'mime_type' => $block['source']['media_type'],
							'data'      => $block['source']['data'],
						),
					);
				} else {
					$parts[] = array( 'text' => (string) ( $block['text'] ?? '' ) );
				}
			}
			$body = array(
				'contents'         => array(
					array(
						'role'  => 'user',
						'parts' => $parts,
					),
				),
				'generationConfig' => array( 'maxOutputTokens' => $max_tokens ),
			);
			if ( '' !== $system ) {
				$body['system_instruction'] = array( 'parts' => array( array( 'text' => $system ) ) );
			}
			$json = self::post_json(
				'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode( $models['gemini'][ $tier ] ) . ':generateContent',
				array( 'x-goog-api-key' => Helpers::get_api_key( 'gemini' ) ),
				$body
			);
			if ( is_wp_error( $json ) ) {
				return $json;
			}
			$out = '';
			foreach ( $json['candidates'][0]['content']['parts'] ?? array() as $part ) {
				$out .= (string) ( $part['text'] ?? '' );
			}
			return array(
				'text'  => $out,
				'usage' => array(
					'in'    => (int) ( $json['usageMetadata']['promptTokenCount'] ?? 0 ),
					'out'   => (int) ( $json['usageMetadata']['candidatesTokenCount'] ?? 0 ),
					'model' => $models['gemini'][ $tier ],
				),
			);
		}

		$body = array(
			'model'      => $models['anthropic'][ $tier ],
			'max_tokens' => $max_tokens,
			'messages'   => array(
				array(
					'role'    => 'user',
					'content' => $content,
				),
			),
		);
		if ( '' !== $system ) {
			$body['system'] = $system;
		}
		$json = self::post_json(
			'https://api.anthropic.com/v1/messages',
			array(
				'x-api-key'         => Helpers::get_api_key( 'anthropic' ),
				'anthropic-version' => '2023-06-01',
			),
			$body
		);
		if ( is_wp_error( $json ) ) {
			return $json;
		}
		$out = '';
		foreach ( $json['content'] ?? array() as $block ) {
			if ( 'text' === ( $block['type'] ?? '' ) ) {
				$out .= $block['text'];
			}
		}
		return array(
			'text'  => $out,
			'usage' => array(
				'in'    => (int) ( $json['usage']['input_tokens'] ?? 0 ),
				'out'   => (int) ( $json['usage']['output_tokens'] ?? 0 ),
				'model' => $models['anthropic'][ $tier ],
			),
		);
	}

	/**
	 * Provider-neutral structured text generation (v1.81): one long call
	 * that returns schema-shaped JSON. Infrastructure is free; the Pro
	 * content generator is its first consumer.
	 *
	 * Provider mapping:
	 * - Anthropic: tool_use with input_schema; thinking budget tokens;
	 *   server-side web_search tool.
	 * - OpenAI: responses API with text.format json_schema (fallback:
	 *   chat.completions response_format); reasoning.effort; web_search.
	 * - Gemini: responseSchema + responseMimeType; thinkingBudget/-Level;
	 *   googleSearch — which excludes responseSchema, so with web search
	 *   the call runs in two stages (research → format into schema).
	 *
	 * @param string $provider anthropic|openai|gemini ('' = default text provider).
	 * @param string $model    Model id override ('' = provider design-tier model).
	 * @param string $system   System prompt.
	 * @param string $user     User prompt.
	 * @param array  $schema   JSON Schema for the result object. For OpenAI
	 *                         strict mode, every object should list all its
	 *                         properties as required; use anyOf, not oneOf.
	 * @param array  $opts     { thinking: none|normal|extended, web_search: bool,
	 *                           max_tokens: int, action: string (usage-log id),
	 *                           tier: caption|design (which text model + price
	 *                           tier when no explicit model; default design),
	 *                           long_running: bool (this one call may outlast
	 *                           the host's PHP execution limit; only then is
	 *                           that limit raised, and only for this request) }.
	 * @return array|\WP_Error { data: array, usage: { in, out, model } }.
	 */
	public function text_structured( $provider, $model, $system, $user, $schema, $opts = array() ) {
		$provider = $this->resolve_text_provider( (string) $provider );
		if ( is_wp_error( $provider ) ) {
			return $provider;
		}
		$models = self::models();
		$opts   = is_array( $opts ) ? $opts : array();
		// Tier picks the default model AND the billing prices. Simple copy work
		// (the Design Assistant) runs on the small 'caption' tier; complex work
		// (articles, templates, layouts, SVG) stays on 'design'.
		$tier = ( isset( $opts['tier'] ) && 'caption' === $opts['tier'] ) ? 'caption' : 'design';
		// A pinned model has to belong to the tier it is billed at, else
		// the tier default applies. (F-L23, 2026-07-25 audit)
		$model = self::model_allowed( $model, $tier ) ? trim( (string) $model ) : '';
		$model = '' !== $model
			? $model
			: (string) ( $models[ $provider ][ $tier ] ?? $models[ $provider ]['design'] ?? '' );
		$action = isset( $opts['action'] ) && '' !== $opts['action'] ? (string) $opts['action'] : 'text_structured';

		if ( self::CORE_PROVIDER === $provider ) {
			return $this->metered(
				$provider,
				$action,
				function () use ( $system, $user, $schema, $opts ) {
					return AI_Core::text_structured( $system, $user, $schema, $opts );
				},
				$tier
			);
		}

		// Only a caller that has declared its call long-running gets PHP kept
		// alive past the host's execution limit, and only for that one request.
		// Article generation (thinking plus web search) is the case this exists
		// for; a caption, an assistant answer or a short structured reply comes
		// back in seconds and has no business changing a host's limit.
		// (wordpress.org review 2026-08-08: the raise used to apply to EVERY
		// call through this method, which is what the reviewers flagged.)
		//
		// A limit that is already higher is left alone - detach() raises it to
		// 900 for background jobs, and lowering that here would shorten exactly
		// the run this is meant to protect. 0 means no limit at all (CLI).
		if ( ! empty( $opts['long_running'] ) && function_exists( 'set_time_limit' ) ) {
			$current = (int) ini_get( 'max_execution_time' );
			if ( 0 !== $current && $current < 480 ) {
				@set_time_limit( 480 ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged,Squiz.PHP.DiscouragedFunctions.Discouraged -- long article generation only; guarded by function_exists() above.
			}
		}

		return $this->metered(
			$provider,
			$action,
			function () use ( $provider, $model, $system, $user, $schema, $opts ) {
				switch ( $provider ) {
					case 'openai':
						return $this->structured_openai( $model, $system, $user, $schema, $opts );
					case 'gemini':
						return $this->structured_gemini( $model, $system, $user, $schema, $opts );
				}
				return $this->structured_anthropic( $model, $system, $user, $schema, $opts );
			},
			$tier // Bill with the selected tier's token prices.
		);
	}

	/**
	 * Shared option defaults for the structured adapters.
	 *
	 * @param array $opts Raw options.
	 * @return array { thinking, web_search, max_tokens }
	 */
	private static function structured_opts( $opts ) {
		$thinking = isset( $opts['thinking'] ) ? (string) $opts['thinking'] : 'none';
		return array(
			'thinking'   => in_array( $thinking, array( 'none', 'normal', 'extended' ), true ) ? $thinking : 'none',
			'web_search' => ! empty( $opts['web_search'] ),
			'max_tokens' => max( 1024, min( 64000, (int) ( $opts['max_tokens'] ?? 16000 ) ) ),
			// Loose schemas (e.g. the design IR) let the model omit unused
			// optional fields, which keeps a rich layer list compact.
			'strict'     => ! isset( $opts['strict'] ) || false !== $opts['strict'],
		);
	}

	/**
	 * Anthropic structured output via forced tool_use.
	 *
	 * @param string $model  Model id.
	 * @param string $system System prompt.
	 * @param string $user   User prompt.
	 * @param array  $schema JSON Schema.
	 * @param array  $opts   Options (see text_structured).
	 * @return array|\WP_Error
	 */
	private function structured_anthropic( $model, $system, $user, $schema, $opts ) {
		$o          = self::structured_opts( $opts );
		$max_tokens = $o['max_tokens'];
		$tools      = array(
			array(
				'name'         => 'submit_result',
				'description'  => 'Submit the finished result in the required structure.',
				'input_schema' => $schema,
			),
		);
		if ( $o['web_search'] ) {
			$tools[] = array(
				'type'     => 'web_search_20250305',
				'name'     => 'web_search',
				'max_uses' => 5,
			);
		}
		$body = array(
			'model'      => $model,
			'max_tokens' => $max_tokens,
			'system'     => $system,
			'messages'   => array(
				array(
					'role'    => 'user',
					'content' => $user,
				),
			),
			'tools'      => $tools,
		);
		if ( 'none' !== $o['thinking'] ) {
			// Thinking tokens count against max_tokens, so keep headroom
			// for the actual article on top of the thinking budget.
			$budget             = 'extended' === $o['thinking'] ? 16384 : 4096;
			$body['max_tokens'] = max( $max_tokens, $budget + 16000 );
			$body['thinking']   = array(
				'type'          => 'enabled',
				'budget_tokens' => $budget,
			);
			// Forced tool_choice is incompatible with thinking → auto; the
			// system prompt's structured-output contract keeps the model on
			// the submit tool.
		} elseif ( $o['web_search'] ) {
			$body['tool_choice'] = array( 'type' => 'any' );
		} else {
			$body['tool_choice'] = array(
				'type' => 'tool',
				'name' => 'submit_result',
			);
		}
		$json = self::post_json(
			'https://api.anthropic.com/v1/messages',
			array(
				'x-api-key'         => Helpers::get_api_key( 'anthropic' ),
				'anthropic-version' => '2023-06-01',
			),
			$body,
			420
		);
		if ( is_wp_error( $json ) ) {
			return $json;
		}
		$data = null;
		$text = '';
		foreach ( $json['content'] ?? array() as $block ) {
			$type = $block['type'] ?? '';
			if ( 'tool_use' === $type && 'submit_result' === ( $block['name'] ?? '' ) && is_array( $block['input'] ?? null ) ) {
				$data = $block['input'];
			} elseif ( 'text' === $type ) {
				$text .= (string) ( $block['text'] ?? '' );
			}
		}
		if ( null === $data ) {
			$data = Json_Repair::to_array( $text );
		}
		if ( ! is_array( $data ) ) {
			return self::err_no_structured_result( $json['stop_reason'] ?? '' );
		}
		return array(
			'data'  => $data,
			'usage' => array(
				'in'    => (int) ( $json['usage']['input_tokens'] ?? 0 ),
				'out'   => (int) ( $json['usage']['output_tokens'] ?? 0 ),
				'model' => $model,
			),
		);
	}

	/**
	 * OpenAI structured output via the responses API (json_schema text
	 * format); falls back to chat.completions when /v1/responses is not
	 * available for the account/model.
	 *
	 * @param string $model  Model id.
	 * @param string $system System prompt.
	 * @param string $user   User prompt.
	 * @param array  $schema JSON Schema.
	 * @param array  $opts   Options (see text_structured).
	 * @return array|\WP_Error
	 */
	private function structured_openai( $model, $system, $user, $schema, $opts ) {
		$o    = self::structured_opts( $opts );
		$body = array(
			'model'             => $model,
			'instructions'      => $system,
			'input'             => $user,
			'max_output_tokens' => $o['max_tokens'],
			'text'              => array(
				'format' => array(
					'type'   => 'json_schema',
					'name'   => 'result',
					'schema' => $schema,
					'strict' => $o['strict'],
				),
			),
		);
		if ( 'none' !== $o['thinking'] ) {
			$body['reasoning'] = array( 'effort' => 'extended' === $o['thinking'] ? 'high' : 'medium' );
		}
		if ( $o['web_search'] ) {
			$body['tools'] = array( array( 'type' => 'web_search' ) );
		}
		$json = self::post_json(
			'https://api.openai.com/v1/responses',
			array( 'Authorization' => 'Bearer ' . Helpers::get_api_key( 'openai' ) ),
			$body,
			420
		);
		if ( is_wp_error( $json ) ) {
			// Generic provider errors (400/404 …) can mean "no responses
			// API for this account/model" → try chat.completions once.
			// Auth, quota and transport errors pass through unchanged.
			if ( 'wpie_ai_provider' === $json->get_error_code() ) {
				return $this->structured_openai_chat( $model, $system, $user, $schema, $o );
			}
			return $json;
		}
		$text = '';
		if ( isset( $json['output'] ) && is_array( $json['output'] ) ) {
			foreach ( $json['output'] as $item ) {
				if ( 'message' !== ( $item['type'] ?? '' ) ) {
					continue;
				}
				foreach ( $item['content'] ?? array() as $part ) {
					if ( 'output_text' === ( $part['type'] ?? '' ) ) {
						$text .= (string) ( $part['text'] ?? '' );
					}
				}
			}
		}
		if ( '' === $text && isset( $json['output_text'] ) ) {
			$text = (string) $json['output_text'];
		}
		$data = Json_Repair::to_array( $text );
		if ( ! is_array( $data ) ) {
			return self::err_no_structured_result( $json['status'] ?? '' );
		}
		return array(
			'data'  => $data,
			'usage' => array(
				'in'    => (int) ( $json['usage']['input_tokens'] ?? 0 ),
				'out'   => (int) ( $json['usage']['output_tokens'] ?? 0 ),
				'model' => $model,
			),
		);
	}

	/**
	 * OpenAI fallback path: chat.completions with response_format.
	 *
	 * @param string $model  Model id.
	 * @param string $system System prompt.
	 * @param string $user   User prompt.
	 * @param array  $schema JSON Schema.
	 * @param array  $o      Normalised options.
	 * @return array|\WP_Error
	 */
	private function structured_openai_chat( $model, $system, $user, $schema, $o ) {
		$body = array(
			'model'                 => $model,
			'max_completion_tokens' => $o['max_tokens'],
			'messages'              => array(
				array(
					'role'    => 'system',
					'content' => $system,
				),
				array(
					'role'    => 'user',
					'content' => $user,
				),
			),
			'response_format'       => array(
				'type'        => 'json_schema',
				'json_schema' => array(
					'name'   => 'result',
					'schema' => $schema,
					'strict' => isset( $o['strict'] ) ? (bool) $o['strict'] : true,
				),
			),
		);
		if ( 'none' !== $o['thinking'] ) {
			$body['reasoning_effort'] = 'extended' === $o['thinking'] ? 'high' : 'medium';
		}
		$json = self::post_json(
			'https://api.openai.com/v1/chat/completions',
			array( 'Authorization' => 'Bearer ' . Helpers::get_api_key( 'openai' ) ),
			$body,
			420
		);
		if ( is_wp_error( $json ) ) {
			return $json;
		}
		$data = Json_Repair::to_array( (string) ( $json['choices'][0]['message']['content'] ?? '' ) );
		if ( ! is_array( $data ) ) {
			return self::err_no_structured_result( $json['choices'][0]['finish_reason'] ?? '' );
		}
		return array(
			'data'  => $data,
			'usage' => array(
				'in'    => (int) ( $json['usage']['prompt_tokens'] ?? 0 ),
				'out'   => (int) ( $json['usage']['completion_tokens'] ?? 0 ),
				'model' => $model,
			),
		);
	}

	/**
	 * Gemini structured output via responseSchema. Google Search grounding
	 * excludes responseSchema, so with web_search the call runs twice:
	 * stage 1 researches and writes freely, stage 2 formats into the schema.
	 *
	 * @param string $model  Model id.
	 * @param string $system System prompt.
	 * @param string $user   User prompt.
	 * @param array  $schema JSON Schema.
	 * @param array  $opts   Options (see text_structured).
	 * @return array|\WP_Error
	 */
	private function structured_gemini( $model, $system, $user, $schema, $opts ) {
		$o     = self::structured_opts( $opts );
		$usage = array(
			'in'    => 0,
			'out'   => 0,
			'model' => $model,
		);

		if ( $o['web_search'] ) {
			// Stage 1: grounded research + full draft as plain JSON text.
			$stage1 = $this->gemini_generate(
				$model,
				$system,
				$user . "\n\nRecherchiere mit der Websuche und gib das vollständige Ergebnis als JSON-Objekt aus (ohne Markdown-Zäune), so nah wie möglich an der geforderten Struktur.",
				$o,
				array( 'tools' => array( array( 'google_search' => new \stdClass() ) ) )
			);
			if ( is_wp_error( $stage1 ) ) {
				return $stage1;
			}
			$usage['in']  += $stage1['usage']['in'];
			$usage['out'] += $stage1['usage']['out'];

			// A grounded draft that already parses cleanly skips stage 2.
			$data = Json_Repair::to_array( $stage1['text'] );

			// Stage 2: force the exact schema over the draft.
			if ( ! is_array( $data ) || ! self::gemini_covers_schema( $data, $schema ) ) {
				$stage2 = $this->gemini_generate(
					$model,
					'Du formst Inhalte verlustfrei in ein vorgegebenes JSON-Schema um. Erfinde nichts hinzu, lass nichts weg.',
					"Forme das folgende Ergebnis exakt in das geforderte Schema um:\n\n" . $stage1['text'],
					array_merge( $o, array( 'thinking' => 'none' ) ),
					array( 'schema' => $schema )
				);
				if ( is_wp_error( $stage2 ) ) {
					return $stage2;
				}
				$usage['in']  += $stage2['usage']['in'];
				$usage['out'] += $stage2['usage']['out'];
				$data          = Json_Repair::to_array( $stage2['text'] );
			}
		} else {
			$res = $this->gemini_generate( $model, $system, $user, $o, array( 'schema' => $schema ) );
			if ( is_wp_error( $res ) ) {
				return $res;
			}
			$usage['in']  += $res['usage']['in'];
			$usage['out'] += $res['usage']['out'];
			$data          = Json_Repair::to_array( $res['text'] );
		}

		if ( ! is_array( $data ) ) {
			return self::err_no_structured_result( '' );
		}
		return array(
			'data'  => $data,
			'usage' => $usage,
		);
	}

	/**
	 * One Gemini generateContent call for the structured pipeline.
	 *
	 * @param string $model  Model id.
	 * @param string $system System prompt.
	 * @param string $user   User prompt.
	 * @param array  $o      Normalised options.
	 * @param array  $extra  { tools?: array, schema?: array }.
	 * @return array|\WP_Error { text, usage: { in, out } }.
	 */
	private function gemini_generate( $model, $system, $user, $o, $extra = array() ) {
		$generation = array( 'maxOutputTokens' => $o['max_tokens'] );
		if ( isset( $extra['schema'] ) ) {
			$generation['responseMimeType'] = 'application/json';
			$generation['responseSchema']   = self::gemini_schema( $extra['schema'] );
		}
		// Gemini 3 wants thinkingLevel, Gemini 2.5 thinkingBudget; other
		// models get no thinking config at all.
		if ( 'none' !== $o['thinking'] ) {
			if ( 0 === strpos( $model, 'gemini-3' ) ) {
				$generation['thinkingConfig'] = array( 'thinkingLevel' => 'extended' === $o['thinking'] ? 'high' : 'low' );
			} elseif ( 0 === strpos( $model, 'gemini-2.5' ) ) {
				$generation['thinkingConfig'] = array( 'thinkingBudget' => 'extended' === $o['thinking'] ? 16384 : 4096 );
			}
		}
		$body = array(
			'contents'         => array(
				array(
					'role'  => 'user',
					'parts' => array( array( 'text' => $user ) ),
				),
			),
			'generationConfig' => $generation,
		);
		if ( '' !== $system ) {
			$body['system_instruction'] = array( 'parts' => array( array( 'text' => $system ) ) );
		}
		if ( isset( $extra['tools'] ) ) {
			$body['tools'] = $extra['tools'];
		}
		$json = self::post_json(
			'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode( $model ) . ':generateContent',
			array( 'x-goog-api-key' => Helpers::get_api_key( 'gemini' ) ),
			$body,
			420
		);
		if ( is_wp_error( $json ) ) {
			return $json;
		}
		$text = '';
		foreach ( $json['candidates'][0]['content']['parts'] ?? array() as $part ) {
			if ( empty( $part['thought'] ) ) {
				$text .= (string) ( $part['text'] ?? '' );
			}
		}
		return array(
			'text'  => $text,
			'usage' => array(
				'in'  => (int) ( $json['usageMetadata']['promptTokenCount'] ?? 0 ),
				'out' => (int) ( $json['usageMetadata']['candidatesTokenCount'] ?? 0 ),
			),
		);
	}

	/**
	 * Convert a JSON Schema into Gemini's OpenAPI-subset responseSchema.
	 * Gemini rejects unknown fields hard ("Unknown name additionalProperties"),
	 * and its enum is a repeated STRING proto, so integer enums must become
	 * minimum/maximum bounds instead.
	 *
	 * @param mixed $schema JSON Schema fragment.
	 * @return mixed
	 */
	private static function gemini_schema( $schema ) {
		if ( ! is_array( $schema ) ) {
			return $schema;
		}
		unset( $schema['additionalProperties'] );
		if ( array_key_exists( 'const', $schema ) ) {
			$schema['enum'] = array( $schema['const'] );
			unset( $schema['const'] );
		}
		if ( isset( $schema['enum'] ) && is_array( $schema['enum'] )
			&& count( array_filter( $schema['enum'], 'is_string' ) ) !== count( $schema['enum'] ) ) {
			$numeric = array_filter( $schema['enum'], 'is_numeric' );
			if ( count( $numeric ) === count( $schema['enum'] ) && array() !== $numeric ) {
				$schema['minimum'] = min( $numeric );
				$schema['maximum'] = max( $numeric );
			}
			unset( $schema['enum'] );
		}
		if ( isset( $schema['items'] ) ) {
			$schema['items'] = self::gemini_schema( $schema['items'] );
		}
		if ( isset( $schema['properties'] ) && is_array( $schema['properties'] ) ) {
			foreach ( $schema['properties'] as $key => $sub ) {
				$schema['properties'][ $key ] = self::gemini_schema( $sub );
			}
		}
		if ( isset( $schema['anyOf'] ) && is_array( $schema['anyOf'] ) ) {
			foreach ( $schema['anyOf'] as $i => $sub ) {
				$schema['anyOf'][ $i ] = self::gemini_schema( $sub );
			}
		}
		return $schema;
	}

	/**
	 * Cheap top-level check whether a grounded Gemini draft already has all
	 * required root fields — then the schema-forcing second call is skipped.
	 *
	 * @param array $data   Parsed draft.
	 * @param array $schema JSON Schema.
	 * @return bool
	 */
	private static function gemini_covers_schema( $data, $schema ) {
		foreach ( (array) ( $schema['required'] ?? array() ) as $key ) {
			if ( ! array_key_exists( $key, $data ) ) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Consistent error when a structured call returned nothing parseable.
	 *
	 * @param string $detail Provider stop/finish reason for diagnostics.
	 * @return \WP_Error
	 */
	private static function err_no_structured_result( $detail ) {
		return new \WP_Error(
			'wpie_ai_structured',
			'' !== (string) $detail
				? sprintf( /* translators: %s: provider stop reason. */ __( 'The AI did not return a usable structured result (%s). Please try again.', 'wunderpaint' ), (string) $detail )
				: __( 'The AI did not return a usable structured result. Please try again.', 'wunderpaint' ),
			array( 'status' => 502 )
		);
	}

	/**
	 * AI Design Assistant (v1.12): Anthropic turns a brief into a design
	 * spec (JSON: background/image slot/overlays/texts). The client builds
	 * editable layers from it and generates the image separately.
	 *
	 * @param \WP_REST_Request $request brief, w, h, brand?, product?, image?
	 * @return array|\WP_Error { design }
	 */
	private function text_design( $provider, \WP_REST_Request $request ) {
		$brief = sanitize_textarea_field( (string) $request->get_param( 'brief' ) );
		if ( '' === trim( $brief ) ) {
			return new \WP_Error( 'wpie_ai_brief', __( 'Describe the design you want first.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		$w       = max( 16, min( 12000, (int) $request->get_param( 'w' ) ) );
		$h       = max( 16, min( 12000, (int) $request->get_param( 'h' ) ) );
		$product = sanitize_textarea_field( (string) $request->get_param( 'product' ) );
		$brand   = $request->get_param( 'brand' );
		if ( is_string( $brand ) ) {
			$brand = json_decode( $brand, true );
		}
		$colors = array();
		$fonts  = array();
		if ( is_array( $brand ) ) {
			foreach ( (array) ( $brand['colors'] ?? array() ) as $c ) {
				if ( preg_match( '/^#[0-9a-f]{3,8}$/i', (string) $c ) ) {
					$colors[] = (string) $c;
				}
			}
			foreach ( (array) ( $brand['fonts'] ?? array() ) as $f ) {
				$fonts[] = sanitize_text_field( (string) $f );
			}
		}

		// Company profile from the brand kit (v1.90.0): realistic copy
		// instead of generic filler.
		$blurb = self::brand_blurb( self::brand_context( $request ) );
		// Design recipes (v4, "recipes design, the model writes the words"):
		// the editor owns the layout entirely - it renders professional,
		// on-grid templates (recipes) with guaranteed contrast and typography.
		// The model's job shrinks to what a language model is good at: writing
		// real copy and choosing the right template + mood. It positions
		// NOTHING. This is why the output is now consistently professional
		// instead of a blind model arranging primitives on an empty grid.
		$recipes = 'brutalist (huge stacked type, one line inverted inside a colour block - drops, streetwear, bold statements), '
			. 'editorial (refined serif masthead with hairline rules and a calm column - long-reads, premium, considered), '
			. 'poster (a centred headline with a badge and a CTA inside a corner frame - events, promos, announcements), '
			. 'split (a bold two-tone colour block with a big word or number on the colour field - launches, versus, feature drops), '
			. 'spotlight (ONE giant number/stat/price is the hero, copy explains it - sales, countdowns, results), '
			. 'pattern (a generated pattern behind a clean card - markets, community, friendly promos), '
			. 'sticker (rounded type, a tilted badge, an energetic blob - youth, food, fun events), '
			. 'quote (an oversized quotation mark, a centred quote and an attribution - testimonials, quotes), '
			. 'minimal (luxury whitespace, small refined type, a thin frame - premium, understated, coming-soon), '
			. 'feature (a left copy column beside a colour side-panel carrying a big mark - product updates, case studies), '
			. 'photo (a full-bleed background PHOTOGRAPH with the copy over it - lifestyle, food, travel, people, atmosphere, anything better shown than described), '
			. 'promo (a LOUD sale/announcement with a starburst seal, an angled colour band and an arrow at the CTA - flash sales, discounts, big offers; give it a short "stat" like -50%), '
			. 'photoframe (a photo MASKED into a shape - circle, arch or blob - with the copy below it, calmer and more editorial than a full-bleed photo)';
		$system = 'You are a senior brand copywriter AND art director for a ' . $w . 'x' . $h . ' px social/marketing visual. '
			. 'The EDITOR owns the layout: it renders professional, on-grid templates ("recipes") with guaranteed contrast and typography. '
			. 'YOUR job is only to (1) write real, specific, punchy copy and (2) choose the recipe and mood that fit the message. You position NOTHING and pick no coordinates, sizes or colors. '
			. 'Return ONLY JSON (no markdown): {"designs":[D,D,D]}. '
			. 'Each D = {"label":"2-word name","recipe":ONE recipe name,"intent":"warm|cool|earthy|vibrant|pastel|dark","accent":"#rrggbb or empty","copy":{'
			. '"kicker":"3-5 word eyebrow or label","headline":"the ONE core message, max ~6 words","subhead":"one supporting sentence","cta":"2-3 word button text",'
			. '"badge":"tiny tag like -20% or NEW (optional)","meta":"a date, place or byline line (optional)","stat":"a short number, price or word to feature, e.g. 50% or 24H (optional)","emphasisWord":"ONE word taken from the headline to accent (optional)"}}. '
			. 'RECIPES (choose the one that fits): ' . $recipes . '. '
			. 'MAKE THE THREE DESIGNS DIFFERENT: choose THREE different recipes, three different moods (intent) and three different creative angles on the same brief. '
			. 'COPY RULES: real and specific, never lorem ipsum, never placeholders like "Your text here". Headlines are short and bold (max ~6 words). '
			. 'Omit any copy field that does not fit that recipe - a quote has no cta, a minimal poster may have no subhead. '
			. 'For "spotlight" and "split" always provide a strong "stat". For "quote" put the quotation in "headline" and the author/source in "meta". '
			. 'For "photo" and "photoframe" ALWAYS set copy.imageQuery to a concrete, literal 2-4 word real-photo search phrase for the image subject (e.g. "fresh coffee cup", "mountain sunrise", "busy city street"), never abstract; for "photo" keep the headline short so it reads over the image. '
			. 'You choose the "intent" (the editor maps it to a curated, readable palette); never invent hex except an optional brand accent. '
			. ( $colors ? 'Brand accent colors: ' . implode( ', ', $colors ) . ' - set accent to the closest brand color. ' : '' )
			. ( $blurb ? 'Brand context: ' . $blurb . ' Write on-brand copy in its tone (its name may appear). ' : '' );

		$content = array();
		$image   = $request->get_param( 'image' );
		if ( $image ) {
			$split = self::split_data_url( $image );
			if ( ! is_wp_error( $split ) ) {
				$content[] = array(
					'type'   => 'image',
					'source' => array(
						'type'       => 'base64',
						'media_type' => $split[0],
						'data'       => $split[1],
					),
				);
				$content[] = array(
					'type' => 'text',
					'text' => 'Use this reference image for style, mood and subject.',
				);
			}
		}
		$brief_text = 'Design brief: ' . $brief . ( $product ? "\nProduct/context details: " . $product : '' );

		// Variation impulse (v1.172.2): every "Regenerate" sends a fresh
		// integer, and we steer the model toward a DELIBERATELY different
		// creative angle so re-generating the same brief does not collapse
		// to the identical plan. Stateless, so we rotate concrete angles.
		$variation = (int) $request->get_param( 'variation' );
		if ( $variation ) {
			$angles = array(
				'Lead with a bold number, price or offer as the hook.',
				'Lead with an emotional, benefit-driven promise.',
				'Take a minimalist, understated, premium approach.',
				'Take a playful, conversational, human tone.',
				'Emphasize urgency and scarcity.',
				'Emphasize trust, craft and quality.',
				'Open with a question or a provocation as the headline.',
				'Use a confident one- or two-word statement as the headline.',
				'Frame it as a bold announcement or reveal.',
				'Frame it around a concrete outcome or result.',
			);
			$angle       = $angles[ abs( $variation ) % count( $angles ) ];
			$brief_text .= "\n\nRegeneration variant #" . abs( $variation )
				. ': produce a DISTINCTLY different take than the most obvious one. '
				. $angle
				. ' Deliberately vary the headline wording, tone, recipe, mood (intent) and creative angle from a safe default. '
				. 'The core message and facts must stay true to the brief, but the creative treatment should feel like a fresh option.';
		}

		$content[] = array(
			'type' => 'text',
			'text' => $brief_text,
		);

		// Design recipe schema (v4): loose (strict=false) so the model omits
		// copy fields that a recipe does not use. Every design is a SEMANTIC
		// plan - a recipe, a mood and copy - never coordinates. The editor's
		// recipe library owns the layout and guarantees fit + contrast.
		$str  = array( 'type' => 'string' );
		$copy = array(
			'type'       => 'object',
			'properties' => array(
				'kicker'       => $str,
				'headline'     => $str,
				'subhead'      => $str,
				'cta'          => $str,
				'badge'        => $str,
				'meta'         => $str,
				'stat'         => $str,
				'emphasisWord' => $str,
				'imageQuery'   => $str,
			),
		);
		$design = array(
			'type'       => 'object',
			'required'   => array( 'recipe', 'intent', 'copy' ),
			'properties' => array(
				'label'  => $str,
				'recipe' => array( 'type' => 'string', 'enum' => array( 'brutalist', 'editorial', 'poster', 'split', 'spotlight', 'pattern', 'sticker', 'quote', 'minimal', 'feature', 'photo', 'promo', 'photoframe' ) ),
				'intent' => array( 'type' => 'string', 'enum' => array( 'warm', 'cool', 'earthy', 'vibrant', 'pastel', 'dark' ) ),
				'accent' => $str,
				'copy'   => $copy,
			),
		);
		$schema = array(
			'type'       => 'object',
			'required'   => array( 'designs' ),
			'properties' => array(
				'designs' => array( 'type' => 'array', 'minItems' => 3, 'maxItems' => 3, 'items' => $design ),
			),
		);
		$user = ( $image && 'anthropic' === $provider && count( $content ) > 1 )
			? $content
			: $brief_text;
		$res  = $this->text_structured(
			$provider,
			'',
			$system,
			$user,
			$schema,
			array(
				'action'     => 'design',
				// v4: the model only writes short copy and picks a recipe, so
				// the small, fast 'caption' text model is plenty (and cheaper).
				'tier'       => 'caption',
				'thinking'   => 'none',
				'max_tokens' => 9000,
				'strict'     => false,
			)
		);
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		$data    = isset( $res['data'] ) && is_array( $res['data'] ) ? $res['data'] : null;
		$designs = null;
		if ( $data ) {
			if ( isset( $data['designs'] ) && is_array( $data['designs'] ) ) {
				$designs = $data['designs'];
			} elseif ( isset( $data[0] ) ) {
				$designs = $data; // model returned a bare array of designs
			}
		}
		$designs = is_array( $designs )
			? array_values(
				array_filter(
					$designs,
					static fn( $d ) => is_array( $d ) && ( ! empty( $d['copy'] ) || ! empty( $d['recipe'] ) || ! empty( $d['elements'] ) )
				)
			)
			: null;
		if ( ! $designs ) {
			return new \WP_Error( 'wpie_ai_parse', __( 'Could not parse the design response. Please try again.', 'wunderpaint' ), array( 'status' => 502 ) );
		}
		return array(
			'designs' => $designs,
			'usage'   => isset( $res['usage'] ) ? $res['usage'] : array(),
		);
	}

	/**
	 * Generate reusable library items (gradient presets, text lockups or
	 * vector elements) from a text description. Returns { kind, items[] }.
	 */
	/**
	 * Optional brand-kit context param (v1.90.0): validated colors/fonts
	 * plus company profile snippets so generations are on-brand.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return array{colors:string[],fonts:string[],company:string,industry:string,description:string,tone:string}
	 */
	private static function brand_context( \WP_REST_Request $request ) {
		$brand = $request->get_param( 'brand' );
		if ( is_string( $brand ) ) {
			$brand = json_decode( $brand, true );
		}
		$out = array(
			'colors'      => array(),
			'fonts'       => array(),
			'company'     => '',
			'industry'    => '',
			'description' => '',
			'tone'        => '',
		);
		if ( ! is_array( $brand ) ) {
			return $out;
		}
		foreach ( (array) ( $brand['colors'] ?? array() ) as $c ) {
			if ( preg_match( '/^#[0-9a-f]{3,8}$/i', (string) $c ) ) {
				$out['colors'][] = (string) $c;
			}
		}
		foreach ( array_slice( (array) ( $brand['fonts'] ?? array() ), 0, 3 ) as $f ) {
			$f = sanitize_text_field( (string) $f );
			if ( '' !== $f ) {
				$out['fonts'][] = $f;
			}
		}
		$out['company']     = sanitize_text_field( (string) ( $brand['company'] ?? '' ) );
		$out['industry']    = sanitize_text_field( (string) ( $brand['industry'] ?? '' ) );
		$out['description'] = mb_substr( sanitize_textarea_field( (string) ( $brand['description'] ?? '' ) ), 0, 600 );
		$out['tone']        = sanitize_text_field( (string) ( $brand['tone'] ?? '' ) );
		return $out;
	}

	/**
	 * Compact company blurb for prompts, '' when the kit has no profile.
	 *
	 * @param array $b Parsed brand context.
	 * @return string
	 */
	private static function brand_blurb( $b ) {
		$bits = array();
		if ( '' !== $b['company'] ) {
			$bits[] = 'Company/brand: ' . $b['company'];
		}
		if ( '' !== $b['industry'] ) {
			$bits[] = 'Industry: ' . $b['industry'];
		}
		if ( '' !== $b['tone'] ) {
			$bits[] = 'Tone of voice: ' . $b['tone'];
		}
		if ( '' !== $b['description'] ) {
			$bits[] = 'About: ' . $b['description'];
		}
		return $bits ? implode( '. ', $bits ) . '.' : '';
	}

	private function text_template( $provider, \WP_REST_Request $request ) {
		$kind = sanitize_key( (string) $request->get_param( 'kind' ) );
		if ( ! in_array( $kind, array( 'gradient', 'text', 'element' ), true ) ) {
			$kind = 'gradient';
		}
		$prompt = sanitize_textarea_field( (string) $request->get_param( 'prompt' ) );
		$text   = sanitize_textarea_field( (string) $request->get_param( 'text' ) );
		if ( '' === trim( $prompt ) && '' === trim( $text ) ) {
			return new \WP_Error( 'wpie_ai_prompt', __( 'Describe what you want first.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		$n = (int) $request->get_param( 'n' );
		$n = max( 1, min( 4, $n ? $n : 4 ) );

		// Optional brand kit (v1.90.0): palette, house fonts, company blurb.
		$b     = self::brand_context( $request );
		$blurb = self::brand_blurb( $b );
		$fonts = 'Inter, Playfair Display, DM Serif Display, Bebas Neue, Anton, Archivo, Barlow Condensed, Bitter, Montserrat, Lora, Oswald, Poppins';
		if ( $b['fonts'] ) {
			$fonts = implode( ', ', array_unique( array_merge( $b['fonts'], explode( ', ', $fonts ) ) ) );
		}

		if ( 'gradient' === $kind ) {
			$schema = '{"items":[{"name":"short label","kind":"linear"|"radial","stops":[{"color":"#rrggbb","at":0.0}]}]}';
			$rules  = 'Each gradient has 2 to 4 stops; "at" values ascend from 0 to 1 (first exactly 0, last exactly 1). Use tasteful, harmonious colours. Make the ' . $n . ' presets clearly different from each other (hues/direction/type).'
				. ( $b['colors'] ? ' Build every gradient primarily from this brand palette (tasteful tints, shades and close neighbours allowed): ' . implode( ', ', $b['colors'] ) . '.' : '' );
		} elseif ( 'element' === $kind ) {
			$schema = '{"items":[{"name":"short label","pathD":"an SVG path drawn inside a 100x100 viewBox"}]}';
			$rules  = 'Each pathD is a single clean vector shape/icon inside a 100x100 box (origin top-left), closed where sensible, containing ONLY the path "d" data (no fill/stroke attributes, no <svg>/<path> tags). Keep shapes simple and recognisable. Make the ' . $n . ' shapes distinct.';
		} else {
			$schema = '{"items":[{"name":"short label","lines":[{"text":"string","fontSize":int,"weight":400|700|800|900,"color":"#rrggbb","font":"one of the allowed fonts","align":"left"|"center"|"right","italic":true|false,"letterSpacing":number}]}]}';
			$rules  = 'Each item is a polished, fully designed text lockup of 2 to 7 stacked lines that read as a real composition, NOT just a headline with one plain subline. Give the lines DISTINCT roles, for example: a small UPPERCASE eyebrow/kicker with wide letterSpacing (e.g. 4-8); a large dominant headline; an optional elegant italic accent word or a second headline line; bullet/list lines; and a smaller sentence-case subline or a short call to action. '
				. 'If the description or the provided wording is a list or bullet points, render EACH list item as its own separate line, left-aligned (align:"left"), a modest size (about 30-44), each prefixed with a bullet marker such as "•  ". '
				. 'Build strong hierarchy through BIG size contrast between the headline and the rest, by MIXING font families within one lockup (pair a display serif such as Playfair Display or DM Serif Display, or a condensed sans such as Bebas Neue, Anton or Barlow Condensed, with a clean sans like Inter or Archivo for the small lines), and by varying weight (400/700/800/900), italics and letterSpacing. '
				. 'The lockup sits on a LIGHT/white background: use dark colours (near-black #1a1d21, deep navy, charcoal) for most lines, but colour ONE line (usually the eyebrow, or a single accent word split onto its own line) in a tasteful saturated hue for emphasis. Never make every line the same size or the same font. '
				. ( '' !== trim( $text ) ? "Use this exact wording; treat each non-empty line of it as its own line in the lockup (keep every headline, bullet and subline), and add a fitting eyebrow and/or closing line to complete the design. Wording:\n" . $text . "\n" : 'Invent short, punchy, on-theme wording. ' )
				. ( $blurb && '' === trim( $text ) ? 'Write the wording specifically for this brand (its name may appear in an eyebrow or closing line): ' . $blurb . ' ' : '' )
				. ( $b['fonts'] ? 'Prefer the brand fonts (' . implode( ', ', $b['fonts'] ) . ') for the dominant lines. ' : '' )
				. ( $b['colors'] ? 'Use one of the brand colors (' . implode( ', ', $b['colors'] ) . ') for the single accent line. ' : '' )
				. 'Sizes are for a ~1080px-tall reference canvas: eyebrow/subline/bullets about 28-46, headline about 90-170. Make the ' . $n . ' options genuinely DIFFERENT from each other in structure, typography and mood, e.g. one refined editorial serif, one bold condensed all-caps poster, one clean modern minimalist, and one with a bright accent colour. Allowed fonts: ' . $fonts . '.';
		}

		$system = 'You generate reusable design library items. Respond with ONLY one single, COMPLETE and valid JSON object (no markdown, no code fences, no commentary, no trailing text) exactly matching this schema: '
			. $schema . '. Return exactly ' . $n . ' items in "items". Keep the JSON compact so the whole object fits in the response. ' . $rules;

		$content = array(
			array(
				'type' => 'text',
				'text' => 'Kind: ' . $kind
					. ( '' !== trim( $prompt ) ? "\nDescription: " . $prompt : '' )
					. ( '' !== trim( $text ) ? "\nText to use:\n" . $text : '' ),
			),
		);

		// Long, multi-line text lockups produce a lot of JSON; give the model
		// enough room so the object is never truncated (which breaks parsing).
		$max_tokens = 'text' === $kind ? 8000 : 2500;

		$res = $this->text_completion( $provider, 'design', $system, $content, $max_tokens );
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		$data = self::extract_json( $res['text'] );
		if ( ! is_array( $data ) || empty( $data['items'] ) || ! is_array( $data['items'] ) ) {
			return new \WP_Error( 'wpie_ai_parse', __( 'Could not parse the response. Please try again.', 'wunderpaint' ), array( 'status' => 502 ) );
		}
		return array(
			'kind'  => $kind,
			'items' => array_values( $data['items'] ),
			'usage' => $res['usage'],
		);
	}

	/**
	 * AI art director for text lockups (dynamic-layouts E2): re-flows the
	 * layer's wording into LayoutSpec items the client validates through
	 * cleanLayoutSpec() and typesets with the shared span engine.
	 *
	 * @param \WP_REST_Request $request Request (text, style, w, h, n).
	 * @return array|\WP_Error Items payload.
	 */
	private function text_layout( $provider, \WP_REST_Request $request ) {
		$text = sanitize_textarea_field( (string) $request->get_param( 'text' ) );
		if ( '' === trim( $text ) ) {
			return new \WP_Error( 'wpie_ai_prompt', __( 'The text layer is empty.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		$style = sanitize_textarea_field( (string) $request->get_param( 'style' ) );
		$box_w = (int) $request->get_param( 'w' );
		$box_h = (int) $request->get_param( 'h' );
		$n     = (int) $request->get_param( 'n' );
		$n     = max( 1, min( 4, $n ? $n : 4 ) );
		$fonts = 'Inter, Playfair Display, DM Serif Display, Bebas Neue, Anton, Archivo, Barlow Condensed, Bitter, Montserrat, Lora, Oswald, Poppins, Space Grotesk, Caveat, Amatic SC, Cormorant Garamond, Abril Fatface, Permanent Marker';

		$schema = '{"items":[{"fit":"block"|"scale","lines":[{"text":"string","role":"eyebrow"|"hero"|"sub"|"detail","fontFamily":"one allowed font","weight":100-900,"italic":true|false,"upper":true|false,"rel":number,"ls":number,"gapAfter":number,"color":"accent"|"#rrggbb","emph":{"wordIndex":int,"style":{"relSize":number,"family":"one allowed font","weight":int,"italic":true|false,"underline":true|false,"color":"accent"|"#rrggbb"}}}]}]}';
		$rules  = 'You are an expert typographic art director designing text lockups. Re-flow the given wording into 2 to 6 display lines: you may put single important words on their own line and split sentences, but keep EVERY word of the wording in order and do not invent new wording. '
			. 'Roles: exactly the punchy short lines are "hero" (at least one), a short opening kicker may be "eyebrow", longer sentences are "sub", a short closing line "detail". '
			. '"rel" is the type size relative to the hero (hero 1, eyebrow 0.2-0.4, sub 0.35-0.8, detail 0.25-0.5; ignored when fit is "block"). "ls" is letter-spacing in em (0 to 0.45, higher only for small uppercase eyebrows). "gapAfter" is the gap below a line in em (0.1 to 0.8). '
			. 'Colour: the token "accent" marks THE single emphasis colour of the design; use it on ONE line, or better on one key word via "emph" ("wordIndex" counts that line\'s words from 0). Prices, percentages, dates and power words deserve the emph. Everything else inherits the base colour, so omit "color" for normal lines. '
			. 'Use fit "block" for stacked poster looks where every line should fill the same width (short lines only), otherwise "scale". Pair fonts tastefully within one design (a display face for the hero, a clean sans for support lines) and vary weight, casing ("upper") and italics. '
			. 'Make the ' . $n . ' options genuinely DIFFERENT in structure, typography and mood.'
			. ( '' !== trim( $style ) ? ' Desired style/mood: ' . $style . '.' : '' )
			. ( $box_w > 0 && $box_h > 0 ? ' The text box is about ' . $box_w . 'x' . $box_h . ' px.' : '' )
			. ' Allowed fonts: ' . $fonts . '.';

		$system = 'You design text layouts. Respond with ONLY one single, COMPLETE and valid JSON object (no markdown, no code fences, no commentary) exactly matching this schema: '
			. $schema . '. Return exactly ' . $n . ' items in "items". Keep the JSON compact. ' . $rules;

		// Small (caption-tier) model: layout suggestions are short structured
		// JSON, no deep reasoning, so the fast/cheap model is enough (v1.219.0).
		$res = $this->text_completion(
			$provider,
			'caption',
			$system,
			array(
				array(
					'type' => 'text',
					'text' => "Wording:\n" . $text,
				),
			),
			6000
		);
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		$data = self::extract_json( $res['text'] );
		if ( ! is_array( $data ) || empty( $data['items'] ) || ! is_array( $data['items'] ) ) {
			return new \WP_Error( 'wpie_ai_parse', __( 'Could not parse the response. Please try again.', 'wunderpaint' ), array( 'status' => 502 ) );
		}
		return array(
			'items' => array_values( $data['items'] ),
			'usage' => $res['usage'],
		);
	}

	/**
	 * SEO title + meta description for a post (automation E3). Fast text
	 * call on the caption model; answers in the post's own language.
	 *
	 * @param \WP_REST_Request $request {title, excerpt}.
	 * @return array|\WP_Error {title, description}.
	 */
	private function text_seo( $provider, \WP_REST_Request $request ) {
		$title   = sanitize_text_field( (string) $request->get_param( 'title' ) );
		$excerpt = sanitize_textarea_field( (string) $request->get_param( 'excerpt' ) );
		if ( '' === trim( $title . $excerpt ) ) {
			return new \WP_Error( 'wpie_ai_prompt', __( 'Nothing to summarize.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		$system = 'You write SEO metadata. Respond with ONLY one single COMPLETE valid compact JSON object (no markdown, no code fences, no commentary) exactly matching {"title":"string","description":"string"}. '
			. 'The title is compelling, specific and at most 60 characters; no site name, no quotes, no clickbait. '
			. 'The description is one or two sentences of 120 to 155 characters total, active voice, states the concrete benefit of reading the article. '
			. 'Write BOTH in the same language as the input.';

		$res = $this->text_completion(
			$provider,
			'caption',
			$system,
			array(
				array(
					'type' => 'text',
					'text' => "Post title:\n" . $title . "\n\nSummary:\n" . $excerpt,
				),
			),
			400
		);
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		$data = self::extract_json( $res['text'] );
		if ( ! is_array( $data ) || empty( $data['title'] ) || empty( $data['description'] ) ) {
			return new \WP_Error( 'wpie_ai_parse', __( 'Could not parse the response. Please try again.', 'wunderpaint' ), array( 'status' => 502 ) );
		}
		return array(
			'title'       => mb_substr( sanitize_text_field( (string) $data['title'] ), 0, 70 ),
			'description' => mb_substr( sanitize_text_field( (string) $data['description'] ), 0, 170 ),
			'usage'       => $res['usage'],
		);
	}

	/**
	 * Generic text/JSON completion for extensions (v1.273.0 / API 2.10):
	 * `prompt` (required), optional `system`, `tier` caption|design
	 * (default caption: fast + cheap), `maxTokens` 64..8000 (default
	 * 1500), optional JSON `schema` object which switches to the
	 * structured path, optional `provider`/`model` overrides (the model
	 * filter in execute() already ran).
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return array|\WP_Error { text } or { data }.
	 */
	private function text_complete( \WP_REST_Request $request ) {
		$prompt = trim( sanitize_textarea_field( (string) $request->get_param( 'prompt' ) ) );
		if ( '' === $prompt ) {
			return new \WP_Error( 'wpie_ai_prompt', __( 'A prompt is required.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		$system = sanitize_textarea_field( (string) $request->get_param( 'system' ) );
		$tier   = 'design' === $request->get_param( 'tier' ) ? 'design' : 'caption';
		$max    = max( 64, min( 8000, (int) ( $request->get_param( 'maxTokens' ) ? $request->get_param( 'maxTokens' ) : 1500 ) ) );
		$schema = $request->get_param( 'schema' );

		if ( is_array( $schema ) && ! empty( $schema ) ) {
			// text_structured resolves the provider and meters itself
			// (logged as action 'complete', priced at the chosen tier).
			return $this->text_structured(
				(string) $request->get_param( 'provider' ),
				(string) $request->get_param( 'model' ),
				$system,
				$prompt,
				$schema,
				array(
					'max_tokens' => max( 1024, $max ),
					'tier'       => $tier,
					'action'     => 'complete',
					'strict'     => false,
				)
			);
		}

		$provider = $this->resolve_text_provider( (string) $request->get_param( 'provider' ) );
		if ( is_wp_error( $provider ) ) {
			return $provider;
		}
		// Optional vision input (v1.378, Design Review): a data-URL image
		// rides along as a content block. Plain-text path only; the
		// schema path above stays text-only.
		$content = array();
		$vision  = (string) $request->get_param( 'image' );
		if ( '' !== $vision ) {
			$img = self::split_data_url( $vision );
			if ( is_wp_error( $img ) ) {
				return $img;
			}
			$content[] = array(
				'type'   => 'image',
				'source' => array(
					'media_type' => $img[0],
					'data'       => $img[1],
				),
			);
		}
		$content[] = array(
			'type' => 'text',
			'text' => $prompt,
		);
		return $this->metered(
			$provider,
			'complete',
			function () use ( $provider, $tier, $system, $content, $max ) {
				$res = $this->text_completion(
					$provider,
					$tier,
					$system,
					$content,
					$max
				);
				if ( is_wp_error( $res ) ) {
					return $res;
				}
				return array(
					'text'  => (string) $res['text'],
					'usage' => $res['usage'],
				);
			},
			$tier
		);
	}

	/**
	 * One colorful vector illustration as inline SVG (v1.71), imported
	 * client-side into editable shape layers via the SVG importer.
	 *
	 * @param string           $provider Resolved text provider.
	 * @param \WP_REST_Request $request  Request (prompt).
	 * @return array|\WP_Error { svg }.
	 */
	private function text_svg( $provider, \WP_REST_Request $request ) {
		$prompt = sanitize_textarea_field( (string) $request->get_param( 'prompt' ) );
		if ( '' === trim( $prompt ) ) {
			return new \WP_Error( 'wpie_ai_prompt', __( 'Describe the illustration you want first.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		$b_ctx  = self::brand_context( $request );
		$system = 'You are a professional vector illustrator. Respond with ONLY one complete inline SVG document, no markdown fences, no commentary. '
			. 'Hard rules: viewBox="0 0 512 512" with width="512" height="512"; ONE cohesive colorful flat vector illustration; only <g>, <path>, <rect>, <circle>, <ellipse>, <polygon> and <line> elements; colors ONLY via fill/stroke/opacity presentation attributes with hex values; no <style>, no classes, no <text>, no <image>, no <use>, no gradients, no filters, no scripts; roughly 10 to 60 shapes; a harmonious professional palette with a clear background shape first; no transform attributes other than translate or scale.'
			. ( $b_ctx['colors'] ? ' Build the palette primarily from these brand colors (tints, shades and harmonious neighbours allowed): ' . implode( ', ', $b_ctx['colors'] ) . '.' : '' );
		$res = $this->text_completion(
			$provider,
			'design',
			$system,
			array(
				array(
					'type' => 'text',
					'text' => 'Illustration: ' . $prompt,
				),
			),
			8000
		);
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		$out = $res['text'];
		if ( ! preg_match( '/<svg[\s\S]*<\/svg>/i', $out, $m ) ) {
			return new \WP_Error( 'wpie_ai_parse', __( 'Could not parse the illustration response. Please try again.', 'wunderpaint' ), array( 'status' => 502 ) );
		}
		$svg = $m[0];
		if ( preg_match( '/<\s*(script|foreignObject|iframe|image|use)\b|href\s*=|javascript:/i', $svg ) ) {
			return new \WP_Error( 'wpie_ai_parse', __( 'The illustration response contained unsupported content. Please try again.', 'wunderpaint' ), array( 'status' => 502 ) );
		}
		return array(
			'svg'   => $svg,
			'usage' => $res['usage'],
		);
	}

	private function text_caption( $provider, \WP_REST_Request $request ) {
		$image = self::split_data_url( $request->get_param( 'image' ) );
		if ( is_wp_error( $image ) ) {
			return $image;
		}
		$lang = sanitize_text_field( (string) $request->get_param( 'lang' ) );
		$res = $this->text_completion(
			$provider,
			'caption',
			'',
			array(
				array(
					'type'   => 'image',
					'source' => array(
						'type'       => 'base64',
						'media_type' => $image[0],
						'data'       => $image[1],
					),
				),
				array(
					'type' => 'text',
					'text' => ( $lang ? 'Write title, altText, caption and description in ' . $lang . '. Keep tags and mood in English. ' : '' ) . 'Describe this image for a website media library. Respond with ONLY a JSON object, no markdown fence: {"title": "a short human title, 2 to 5 words, no file extension", "altText": "concise alt text, max 125 chars, no leading \"Image of\"", "caption": "one engaging sentence", "description": "2-3 sentence detailed description", "tags": ["3 to 8 short lowercase keywords describing subjects, objects and scene, single or two words each, no # symbol"], "mood": "one or two lowercase words for the overall mood or feeling"}',
				),
			),
			600
		);
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		// Tolerate accidental markdown fences.
		$text   = trim( preg_replace( '/^```(?:json)?|```$/m', '', trim( $res['text'] ) ) );
		$parsed = json_decode( $text, true );
		if ( ! is_array( $parsed ) || empty( $parsed['altText'] ) ) {
			return new \WP_Error( 'wpie_ai_parse', __( 'Could not parse the caption response. Please try again.', 'wunderpaint' ), array( 'status' => 502 ) );
		}
		$tags = array();
		if ( isset( $parsed['tags'] ) && is_array( $parsed['tags'] ) ) {
			foreach ( array_slice( $parsed['tags'], 0, 12 ) as $t ) {
				$t = sanitize_text_field( (string) $t );
				$t = ltrim( $t, '#' );
				if ( '' !== $t ) {
					$tags[] = $t;
				}
			}
		}
		return array(
			'title'       => sanitize_text_field( (string) ( $parsed['title'] ?? '' ) ),
			'altText'     => sanitize_text_field( (string) $parsed['altText'] ),
			'caption'     => sanitize_text_field( (string) ( $parsed['caption'] ?? '' ) ),
			'description' => sanitize_textarea_field( (string) ( $parsed['description'] ?? '' ) ),
			'tags'        => $tags,
			'mood'        => sanitize_text_field( (string) ( $parsed['mood'] ?? '' ) ),
			'usage'       => $res['usage'],
		);
	}

	/* ---------------------------------------------------------------------
	 * Test connection (settings page)
	 * ------------------------------------------------------------------- */

	/**
	 * Lightweight per-provider ping (spec 09.2 Advanced).
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return array
	 */
	public function test_connection( \WP_REST_Request $request ) {
		$provider = sanitize_text_field( (string) $request->get_param( 'provider' ) );
		if ( ! in_array( $provider, array( 'gemini', 'openai', 'anthropic' ), true ) ) {
			return array(
				'ok'      => false,
				'message' => __( 'Unknown provider.', 'wunderpaint' ),
			);
		}
		if ( ! Helpers::provider_status( $provider ) ) {
			return array(
				'ok'      => false,
				'message' => __( 'Not configured.', 'wunderpaint' ),
			);
		}

		$urls = array(
			'gemini'    => array( 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', array( 'x-goog-api-key' => Helpers::get_api_key( 'gemini' ) ) ),
			'openai'    => array( 'https://api.openai.com/v1/models', array( 'Authorization' => 'Bearer ' . Helpers::get_api_key( 'openai' ) ) ),
			'anthropic' => array(
				'https://api.anthropic.com/v1/models',
				array(
					'x-api-key'         => Helpers::get_api_key( 'anthropic' ),
					'anthropic-version' => '2023-06-01',
				),
			),
		);
		list( $url, $headers ) = $urls[ $provider ];
		$response              = wp_remote_get( $url, array( 'timeout' => 20, 'headers' => $headers ) );
		if ( is_wp_error( $response ) ) {
			return array(
				'ok'      => false,
				'message' => $response->get_error_message(),
			);
		}
		$code = wp_remote_retrieve_response_code( $response );
		return array(
			'ok'      => $code >= 200 && $code < 300,
			'message' => $code >= 200 && $code < 300 ? 'OK' : sprintf( 'HTTP %d', $code ),
		);
	}
}
