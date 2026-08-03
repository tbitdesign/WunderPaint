<?php
/**
 * Settings page (Settings API) + option sanitization.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Settings → WunderPaint.
 */
class Settings {

	/**
	 * Register hooks.
	 */
	public function hooks() {
		add_action( 'admin_menu', array( $this, 'add_page' ) );
		add_action( 'admin_init', array( $this, 'register' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_assets' ) );
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
		// Settings shadow (v1.134.0): keep the PREVIOUS value in a second
		// option so an accidental overwrite or deletion is one step away
		// from recovery. Cheap insurance for the most precious option
		// (API keys, brand kits) - born from a real data-loss incident.
		add_filter( 'pre_update_option_' . WPIE_OPTION, array( __CLASS__, 'shadow_before_update' ), 10, 2 );
		add_action( 'delete_option', array( __CLASS__, 'shadow_before_delete' ) );
		add_action( 'admin_post_wpie_settings_restore_prev', array( __CLASS__, 'restore_shadow' ) );
	}

	/**
	 * Put the shadow back.
	 *
	 * The shadow was written on every settings change from v1.134.0 onwards
	 * and nothing ever read it: there was no button, no route, no command.
	 * An accidental overwrite was therefore recoverable in theory and not in
	 * practice, which is the worst of both worlds - it looked like insurance
	 * and paid out nothing. Proven the hard way on 2026-07-25, when a stray
	 * write cost this install its API keys while a complete copy of them sat
	 * in the shadow row the whole time.
	 *
	 * Restoring goes through update_option, so the filter above catches the
	 * value being replaced and puts it in the shadow. One more click swaps
	 * back, which makes this safe to try.
	 */
	public static function restore_shadow() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You are not allowed to do that.', 'wunderpaint' ), '', array( 'response' => 403 ) );
		}
		check_admin_referer( 'wpie_settings_restore_prev' );

		$prev = get_option( WPIE_OPTION . '_prev' );
		$back = admin_url( 'options-general.php?page=' . WPIE_SLUG . '-settings' );
		if ( ! is_array( $prev ) || ! $prev ) {
			wp_safe_redirect(
				add_query_arg(
					array(
						'wpie-backup' => 'error',
						'wpie-msg'    => rawurlencode( __( 'There is no previous version of the settings to restore.', 'wunderpaint' ) ),
					),
					$back
				)
			);
			exit;
		}
		update_option( WPIE_OPTION, $prev );
		wp_safe_redirect(
			add_query_arg(
				array(
					'wpie-backup' => 'ok',
					'wpie-msg'    => rawurlencode( __( 'The previous settings are back. The version you just replaced is now the one held in reserve, so you can swap again if this was not what you wanted.', 'wunderpaint' ) ),
				),
				$back
			)
		);
		exit;
	}

	/**
	 * A short, key-free description of what the shadow holds, for the card.
	 *
	 * Never renders a key, not even masked: the point is to say whether it is
	 * worth restoring, not to expose a second copy of the secrets.
	 *
	 * @return array{differs:bool,providers:int,kits:int,fonts:int}|null
	 */
	public static function shadow_summary() {
		$prev = get_option( WPIE_OPTION . '_prev' );
		if ( ! is_array( $prev ) || ! $prev ) {
			return null;
		}
		$now       = get_option( WPIE_OPTION );
		$providers = 0;
		foreach ( array( 'gemini', 'openai', 'anthropic', 'pexels', 'pixabay', 'unsplash', 'meshy' ) as $p ) {
			if ( '' !== Helpers::deobfuscate( (string) ( $prev[ $p . '_key' ] ?? '' ) ) ) {
				$providers++;
			}
		}
		$kits = json_decode( (string) ( $prev['brand_kits'] ?? '' ), true );
		return array(
			'differs'   => $prev !== $now,
			'providers' => $providers,
			'kits'      => is_array( $kits ) ? count( $kits ) : 0,
			'fonts'     => count( (array) ( $prev['downloaded_fonts'] ?? array() ) ),
		);
	}

	/**
	 * Copy the old settings value into the shadow before an update.
	 *
	 * @param mixed $value     New value (passed through).
	 * @param mixed $old_value Current value.
	 * @return mixed The new value, unchanged.
	 */
	public static function shadow_before_update( $value, $old_value ) {
		if ( is_array( $old_value ) && $old_value && $old_value !== $value ) {
			update_option( WPIE_OPTION . '_prev', $old_value, false );
		}
		return $value;
	}

	/**
	 * Copy the settings into the shadow before the option is deleted.
	 *
	 * @param string $option Option name being deleted.
	 */
	public static function shadow_before_delete( $option ) {
		if ( WPIE_OPTION !== $option ) {
			return;
		}
		$current = get_option( WPIE_OPTION );
		if ( is_array( $current ) && $current ) {
			update_option( WPIE_OPTION . '_prev', $current, false );
		}
	}

	/**
	 * Brand kits mapped for the editor client (v1.89.0): resolved logo URL,
	 * profile fields + custom variables, sliced to one kit without Pro.
	 *
	 * @param array|null $settings Plugin settings (loaded when null).
	 * @return array[]
	 */
	public static function client_kits( $settings = null ) {
		$settings = null === $settings ? Helpers::get_settings() : $settings;
		$all      = self::brand_kits( $settings );
		// One kit is a free feature; the Pro add-on unlocks the rest.
		if ( ! apply_filters( 'wpie_pro_active', false ) ) {
			$all = array_slice( $all, 0, 1 );
		}
		$kits = array();
		foreach ( $all as $kit ) {
			$mapped = array(
				'id'      => (string) ( $kit['id'] ?? '' ),
				'name'    => (string) ( $kit['name'] ?? '' ),
				'colors'  => array_values( (array) ( $kit['colors'] ?? array() ) ),
				'fonts'   => array_values( (array) ( $kit['fonts'] ?? array() ) ),
				'logoId'  => (int) ( $kit['logo'] ?? 0 ),
				'logoUrl' => ! empty( $kit['logo'] ) ? (string) wp_get_attachment_image_url( (int) $kit['logo'], 'large' ) : '',
				// Watermark image (v1.135.0): a brand asset like the logo.
				'watermarkId'  => (int) ( $kit['watermark'] ?? 0 ),
				'watermarkUrl' => ! empty( $kit['watermark'] ) ? (string) wp_get_attachment_image_url( (int) $kit['watermark'], 'large' ) : '',
			);
			foreach ( array( 'company', 'contactName', 'email', 'street', 'zip', 'city', 'website', 'industry', 'description' ) as $field ) {
				$mapped[ $field ] = (string) ( $kit[ $field ] ?? '' );
			}
			$mapped['vars'] = array_values( array_filter( (array) ( $kit['vars'] ?? array() ), 'is_array' ) );
			$kits[]         = $mapped;
		}
		return $kits;
	}

	/**
	 * REST: read/write brand kits from the editor (v1.89.0). Both routes go
	 * through can_manage_kits(), which is filterable.
	 */
	public function register_routes() {
		register_rest_route(
			WPIE_REST_NS,
			'/brand-kits',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( $this, 'rest_get_kits' ),
					'permission_callback' => array( __CLASS__, 'can_manage_kits' ),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'rest_save_kits' ),
					'permission_callback' => array( __CLASS__, 'can_manage_kits' ),
				),
			)
		);
	}

	/**
	 * May the current user manage brand kits?
	 *
	 * The single source of truth for both the REST routes above and the
	 * editor's `canManageKits` flag, so a site that opens this up does not end
	 * up with a dialog that can be opened but never saved.
	 *
	 * @return bool
	 */
	public static function can_manage_kits() {
		/**
		 * Whether the current user may read and write brand kits.
		 *
		 * Kits are site-wide configuration, hence `manage_options` by default.
		 * Sites that want editors to maintain the kits without handing out full
		 * administrator rights can grant it here.
		 *
		 * @since 1.352.0
		 *
		 * @param bool $can Default: whether the user can manage_options.
		 */
		return (bool) apply_filters( 'wpie_can_manage_kits', current_user_can( 'manage_options' ) );
	}

	/**
	 * GET /brand-kits.
	 *
	 * @return \WP_REST_Response
	 */
	public function rest_get_kits() {
		return rest_ensure_response( array( 'kits' => self::client_kits() ) );
	}

	/**
	 * The kit set to store for a client that may only edit the first kit.
	 *
	 * One kit is a free feature, so the free editor only ever RECEIVES the
	 * first one (client_kits) and may therefore only ever WRITE the first
	 * one. Replacing the whole set used to destroy kits 2ff. without a word.
	 * The case that bites is not a fresh install - the dialog refuses to add
	 * a second kit there - but a lapsed Pro licence or a restored backup,
	 * where the option legitimately holds more kits than this client can see.
	 * Kept pure so the read-only test suite can hold it.
	 *
	 * @since 1.353.0
	 *
	 * @param array $incoming Kits sent by the client.
	 * @param array $stored   Kits currently in the option.
	 * @return array[] First incoming kit, then the invisible remainder.
	 */
	public static function merge_first_kit( array $incoming, array $stored ) {
		return array_merge(
			array_slice( array_values( $incoming ), 0, 1 ),
			array_slice( array_values( $stored ), 1 )
		);
	}

	/**
	 * POST /brand-kits: replaces the whole kit set (the dialog edits the
	 * full array and saves once). Reuses the settings sanitizer.
	 *
	 * @param \WP_REST_Request $request { kits: array }.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function rest_save_kits( \WP_REST_Request $request ) {
		$kits = $request->get_param( 'kits' );
		if ( ! is_array( $kits ) ) {
			return new \WP_Error( 'wpie_bad_kits', __( 'Invalid Brand Kits payload.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		$store = array();
		foreach ( array_values( $kits ) as $kit ) {
			$kit = (array) $kit;
			// The client speaks logoId (bootstrap shape); storage uses logo.
			if ( isset( $kit['logoId'] ) && ! isset( $kit['logo'] ) ) {
				$kit['logo'] = $kit['logoId'];
			}
			if ( isset( $kit['watermarkId'] ) && ! isset( $kit['watermark'] ) ) {
				$kit['watermark'] = $kit['watermarkId'];
			}
			$store[] = $kit;
		}
		$settings = get_option( WPIE_OPTION, array() );
		$settings = is_array( $settings ) ? $settings : array();

		if ( ! apply_filters( 'wpie_pro_active', false ) ) {
			$store = self::merge_first_kit( $store, self::brand_kits( $settings ) );
		}
		// Refuse rather than silently drop the surplus: the sanitizer cuts at
		// max_kits(), and a kit that vanishes on save with a success message
		// is worse than a save that says no.
		if ( count( $store ) > self::max_kits() ) {
			return new \WP_Error(
				'wpie_too_many_kits',
				sprintf(
					/* translators: %d: maximum number of brand kits. */
					_n(
						'This site holds at most %d brand kit. Remove one before adding another.',
						'This site holds at most %d brand kits. Remove one before adding another.',
						self::max_kits(),
						'wunderpaint'
					),
					self::max_kits()
				),
				array( 'status' => 400 )
			);
		}

		$settings['brand_kits'] = self::sanitize_brand_kits( (string) wp_json_encode( $store ) );
		update_option( WPIE_OPTION, $settings );
		return rest_ensure_response( array( 'kits' => self::client_kits( $settings ) ) );
	}

	/**
	 * Add the options page.
	 */
	public function add_page() {
		add_options_page(
			__( 'WunderPaint', 'wunderpaint' ),
			__( 'WunderPaint', 'wunderpaint' ),
			'manage_options',
			WPIE_SETTINGS_SLUG,
			array( $this, 'render_page' )
		);
	}

	/**
	 * Stylesheet for the settings screen (v1.337.0).
	 *
	 * Was an 80-line inline style block printed inside render_page(), which
	 * meant no linter ever saw it and it could not be cached by the browser.
	 * Loaded only on our own screen, so nothing else on wp-admin pays for it.
	 *
	 * @param string $hook Current admin page hook suffix.
	 * @return void
	 */
	public function enqueue_assets( $hook ) {
		if ( 'settings_page_' . WPIE_SETTINGS_SLUG !== $hook ) {
			return;
		}
		wp_enqueue_style(
			'wpie-admin-settings',
			plugins_url( 'assets/css/admin-settings.css', WPIE_FILE ),
			array(),
			WPIE_VERSION
		);
		wp_enqueue_script(
			'wpie-admin-settings',
			plugins_url( 'assets/js/admin-settings.js', WPIE_FILE ),
			array(),
			WPIE_VERSION,
			true
		);
		/*
		 * Everything the script needs from PHP, in one object (v1.346.0). It
		 * used to be interpolated into an inline <script> at about
		 * twenty-five points.
		 *
		 * The strings are translated HERE rather than through
		 * wp_set_script_translations: that would mean a new script handle and
		 * therefore a new md5-named JED file per locale, five of them, for
		 * nine strings PHP already has. The msgids do not change either way,
		 * so translators see nothing new.
		 */
		wp_localize_script(
			'wpie-admin-settings',
			'WPIE_SETTINGS',
			array(
				'nonce'           => wp_create_nonce( 'wp_rest' ),
				'maxUpload'       => (int) wp_max_upload_size(),
				'aiTestUrl'       => rest_url( WPIE_REST_NS . '/ai/test' ),
				'stockTestUrl'    => rest_url( WPIE_REST_NS . '/stock/test' ),
				'meshyTestUrl'    => rest_url( WPIE_REST_NS . '/meshy/test' ),
				'fontsUrl'        => rest_url( WPIE_REST_NS . '/fonts' ),
				'fontsLibraryUrl' => rest_url( WPIE_REST_NS . '/fonts/library' ),
				'i18n'            => array(
					'undo'        => __( 'Undo', 'wunderpaint' ),
					'uploading'   => __( 'Uploading', 'wunderpaint' ),
					'chooseFile'  => __( 'Choose a font file first.', 'wunderpaint' ),
					'downloading' => __( 'Downloading, this can take a minute. You can leave this page open.', 'wunderpaint' ),
					'done'        => __( 'Done. The full font library is now available locally.', 'wunderpaint' ),
					'partial'     => __( 'Some families could not be downloaded. Click download again to finish the rest.', 'wunderpaint' ),
					/* translators: 1: file size in MB, 2: maximum upload size in MB */
					'tooBig'      => __( 'This file is %1$s MB, but the maximum upload size is %2$s MB (server upload limit).', 'wunderpaint' ),
					/* translators: 1: number of downloaded families, 2: total number of families */
					'downloaded'  => __( '%1$d of %2$d additional families downloaded.', 'wunderpaint' ),
				),
			)
		);
	}

	/**
	 * Register the single array option.
	 */
	public function register() {
		register_setting(
			'wpie',
			WPIE_OPTION,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( $this, 'sanitize' ),
			)
		);
	}

	/**
	 * Sanitize the submitted settings array.
	 *
	 * Secrets: keep the stored value when the submitted value is empty or
	 * equals the masked placeholder; only overwrite (obfuscated) on genuinely
	 * new input (spec 09.1 "key preservation").
	 *
	 * @param array $input Raw submitted values.
	 * @return array Clean values to store.
	 */
	public function sanitize( $input ) {
		if ( ! is_array( $input ) ) {
			$input = array();
		}
		$stored = Helpers::get_settings();
		$out    = $stored;

		foreach ( Helpers::secret_fields() as $field ) {
			// Explicit removal (v1.288.1): the masked field can't distinguish
			// "cleared on purpose" from "left untouched", so the Remove
			// button sets this flag.
			if ( ! empty( $input[ $field . '_remove' ] ) ) {
				$out[ $field ] = '';
				continue;
			}
			$submitted    = isset( $input[ $field ] ) ? trim( (string) $input[ $field ] ) : '';
			$stored_plain = Helpers::deobfuscate( isset( $stored[ $field ] ) ? $stored[ $field ] : '' );
			if ( '' === $submitted || ( '' !== $stored_plain && Helpers::mask_key( $stored_plain ) === $submitted ) ) {
				$out[ $field ] = isset( $stored[ $field ] ) ? $stored[ $field ] : '';
			} elseif ( $submitted !== $stored_plain ) {
				$out[ $field ] = Helpers::obfuscate( $submitted );
			}
		}

	// Remote backup target (v1.101.0, S3-compatible).
		if ( isset( $input['s3_endpoint'] ) ) {
			$out['s3_endpoint'] = esc_url_raw( trim( (string) $input['s3_endpoint'] ) );
		}
		foreach ( array( 's3_region', 's3_bucket', 's3_access_key' ) as $field ) {
			if ( isset( $input[ $field ] ) ) {
				$out[ $field ] = sanitize_text_field( (string) $input[ $field ] );
			}
		}
		if ( isset( $input['s3_prefix'] ) ) {
			$out['s3_prefix'] = ltrim( sanitize_text_field( (string) $input['s3_prefix'] ), '/' );
		}
		if ( isset( $input['s3_schedule'] ) ) {
			$out['s3_schedule'] = in_array( $input['s3_schedule'], array( 'off', 'daily', 'weekly' ), true ) ? $input['s3_schedule'] : 'off';
		}
		if ( isset( $input['s3_retention'] ) ) {
			$out['s3_retention'] = min( 50, max( 1, (int) $input['s3_retention'] ) );
		}
		if ( array_key_exists( 's3_versions', $input ) ) {
			$out['s3_versions'] = empty( $input['s3_versions'] ) ? 0 : 1;
		}

		$enums = array(
			'default_provider'      => array( 'gemini', 'openai' ),
			'default_text_provider' => array( 'anthropic', 'openai', 'gemini' ),
			'theme'            => array( 'dark', 'light', 'system' ),
			'editor_cap'       => array( 'upload_files', 'edit_posts', 'edit_others_posts', 'manage_options' ),
		);
		$defaults = Helpers::defaults();
		foreach ( $enums as $field => $allowed ) {
			$value         = isset( $input[ $field ] ) ? sanitize_text_field( (string) $input[ $field ] ) : ( isset( $stored[ $field ] ) ? $stored[ $field ] : '' );
			$out[ $field ] = in_array( $value, $allowed, true ) ? $value : $defaults[ $field ];
		}

		// AI model overrides (v1.4): plain model ids, empty = default.
		foreach ( array_keys( AI_Provider::model_settings_map() ) as $field ) {
			if ( isset( $input[ $field ] ) ) {
				$out[ $field ] = substr( preg_replace( '/[^A-Za-z0-9._:@\/-]/', '', (string) $input[ $field ] ), 0, 120 );
			}
		}

		if ( isset( $input['monthly_limit'] ) ) {
			$out['monthly_limit'] = max( 0, (float) $input['monthly_limit'] );
		}
		if ( isset( $input['ai_rate_limit'] ) ) {
			$out['ai_rate_limit'] = max( 0, (int) $input['ai_rate_limit'] );
		}
		if ( isset( $input['lookup_rate_limit'] ) ) {
			$out['lookup_rate_limit'] = max( 0, (int) $input['lookup_rate_limit'] );
		}
		if ( isset( $input['versions_to_keep'] ) ) {
			$out['versions_to_keep'] = min( 100, max( 1, (int) $input['versions_to_keep'] ) );
		}
		if ( isset( $input['default_canvas'] ) ) {
			$canvas                = sanitize_text_field( (string) $input['default_canvas'] );
			$out['default_canvas'] = preg_match( '/^\d+x\d+$/', $canvas ) ? $canvas : $defaults['default_canvas'];
		}
		foreach ( array( 'versioning', 'remove_on_uninstall' ) as $flag ) {
			if ( isset( $input[ $flag ] ) ) {
				$out[ $flag ] = (bool) (int) $input[ $flag ];
			}
		}

		// Watermark (v0.3).
		if ( isset( $input['brand_logo'] ) ) {
			$out['brand_logo'] = max( 0, (int) $input['brand_logo'] );
		}
		if ( isset( $input['brand_kits'] ) ) {
			$out['brand_kits'] = self::sanitize_brand_kits( (string) wp_unslash( $input['brand_kits'] ) );
		}
		if ( isset( $input['ai_prices'] ) && is_array( $input['ai_prices'] ) ) {
			$clean = array();
			foreach ( array_keys( AI_Provider::price_defaults() ) as $key ) {
				if ( isset( $input['ai_prices'][ $key ] ) && '' !== trim( (string) $input['ai_prices'][ $key ] ) && is_numeric( $input['ai_prices'][ $key ] ) ) {
					$clean[ $key ] = round( max( 0, (float) $input['ai_prices'][ $key ] ), 6 );
				}
			}
			$out['ai_prices'] = $clean ? (string) wp_json_encode( $clean ) : '';
		}
		if ( isset( $input['brand_colors'] ) ) {
			$colors = array_filter(
				array_map( 'sanitize_hex_color', array_map( 'trim', explode( ',', (string) $input['brand_colors'] ) ) )
			);
			$out['brand_colors'] = implode( ',', array_slice( $colors, 0, 12 ) );
		}
		if ( isset( $input['brand_fonts'] ) ) {
			$fonts = array_filter( array_map( 'sanitize_text_field', array_map( 'trim', explode( ',', (string) $input['brand_fonts'] ) ) ) );
			$out['brand_fonts'] = implode( ',', array_slice( $fonts, 0, 3 ) );
		}
		if ( isset( $input['fonts_google'] ) ) {
			$out['fonts_google'] = ! empty( $input['fonts_google'] ) ? 1 : 0;
		}
		// Meshy generation defaults (v1.296): model + one quality level.
		if ( isset( $input['meshy_model'] ) ) {
			$model              = (string) $input['meshy_model'];
			$out['meshy_model'] = in_array( $model, array( 'latest', 'meshy-6', 'meshy-5' ), true ) ? $model : 'latest';
		}
		if ( isset( $input['meshy_quality'] ) ) {
			$quality              = (string) $input['meshy_quality'];
			$out['meshy_quality'] = in_array( $quality, array( 'low', 'standard', 'high' ), true ) ? $quality : 'standard';
		}
		if ( isset( $input['media_picker_manager'] ) ) {
			$out['media_picker_manager'] = ! empty( $input['media_picker_manager'] ) ? 1 : 0;
		}
		if ( isset( $input['watermark_id'] ) ) {
			$out['watermark_id'] = max( 0, (int) $input['watermark_id'] );
		}
		if ( isset( $input['watermark_pos'] ) ) {
			$pos                  = sanitize_text_field( (string) $input['watermark_pos'] );
			$out['watermark_pos'] = in_array( $pos, array( 'tl', 'tr', 'bl', 'br', 'center' ), true ) ? $pos : $defaults['watermark_pos'];
		}
		if ( isset( $input['watermark_scale'] ) ) {
			$out['watermark_scale'] = min( 50, max( 5, (int) $input['watermark_scale'] ) );
		}
		if ( isset( $input['watermark_opacity'] ) ) {
			$out['watermark_opacity'] = min( 100, max( 0, (int) $input['watermark_opacity'] ) );
		}
		if ( isset( $input['watermark_margin'] ) ) {
			$out['watermark_margin'] = min( 200, max( 0, (int) $input['watermark_margin'] ) );
		}

		return $out;
	}

	/**
	 * Provider card meta for rendering.
	 *
	 * @return array
	 */
	private function providers_meta() {
		return array(
			'gemini'    => array(
				'name'       => __( 'Google Gemini', 'wunderpaint' ),
				// Never name a concrete model id here. The ids move with every
				// provider generation and this copy is translated into five
				// languages, so a pinned id goes stale in all of them at once.
				// The live ids are already shown as placeholders under Models.
				'desc'       => __( 'Text-to-image and prompt-based image editing, plus fast text models for alt text, captions and the Design Generator. Creating a key is free and includes a generous free tier - a good first provider.', 'wunderpaint' ),
				'link'       => 'https://aistudio.google.com/apikey',
				'link_label' => __( 'Get your free API key in Google AI Studio', 'wunderpaint' ),
				'tile'       => '#3b66ff',
			),
			'openai'    => array(
				'name'       => __( 'OpenAI', 'wunderpaint' ),
				'desc'       => __( 'Image generation, true mask inpainting and variations. The GPT text models power alt text, SEO texts and the Design Generator. Pay as you go - top up a small credit and set a budget below.', 'wunderpaint' ),
				'link'       => 'https://platform.openai.com/api-keys',
				'link_label' => __( 'Create an API key on platform.openai.com', 'wunderpaint' ),
				'tile'       => '#10a37f',
			),
			'anthropic' => array(
				'name'       => __( 'Anthropic Claude', 'wunderpaint' ),
				'desc'       => __( 'No image generation - Claude is the writing specialist: alt text, captions, SEO texts, the AI Content Generator and the Design Generator produce their best copy with it.', 'wunderpaint' ),
				'link'       => 'https://console.anthropic.com/settings/keys',
				'link_label' => __( 'Create an API key in the Anthropic Console', 'wunderpaint' ),
				'tile'       => '#d97757',
			),
		);
	}

	/**
	 * Render the full settings page (client-side tabs; the whole schema is
	 * always present in the form so a save never drops fields).
	 */
	/**
	 * Brand kits from settings (v1.70), with the legacy single-kit fields
	 * migrated into a "Default" kit when no kits were saved yet.
	 *
	 * @param array $settings Settings array.
	 * @return array[] Kits: { id, name, colors[], fonts[], logo }.
	 */
	public static function brand_kits( $settings ) {
		$kits = json_decode( (string) ( $settings['brand_kits'] ?? '' ), true );
		$kits = is_array( $kits ) ? array_values( array_filter( $kits, 'is_array' ) ) : array();
		if ( ! $kits && ( ! empty( $settings['brand_colors'] ) || ! empty( $settings['brand_fonts'] ) || ! empty( $settings['brand_logo'] ) ) ) {
			$kits[] = array(
				'id'     => 'default',
				'name'   => __( 'Default', 'wunderpaint' ),
				'colors' => array_values( array_filter( array_map( 'trim', explode( ',', (string) $settings['brand_colors'] ) ) ) ),
				'fonts'  => array_values( array_filter( array_map( 'trim', explode( ',', (string) $settings['brand_fonts'] ) ) ) ),
				'logo'   => (int) $settings['brand_logo'],
			);
		}
		return $kits;
	}

	/**
	 * How many brand kits a site may hold.
	 *
	 * Was a bare 8 inside the sanitizer, which quietly threw away the ninth
	 * kit on every save while the pricing page promised "as many as you
	 * need" - an agency with nine brands is exactly who that sentence is
	 * written for. Now one number, raisable, and overshoot is reported
	 * rather than swallowed.
	 *
	 * @since 1.353.0
	 *
	 * @return int Maximum number of kits (at least one).
	 */
	public static function max_kits() {
		/**
		 * Maximum number of brand kits stored per site.
		 *
		 * @since 1.353.0
		 *
		 * @param int $max Default: 8.
		 */
		return max( 1, (int) apply_filters( 'wpie_max_brand_kits', 8 ) );
	}

	/**
	 * Validate the brand-kits JSON from the settings form (v1.70).
	 *
	 * @param string $raw JSON string.
	 * @return string Clean JSON ('' when empty/invalid).
	 */
	private static function sanitize_brand_kits( $raw ) {
		$kits = json_decode( $raw, true );
		if ( ! is_array( $kits ) ) {
			return '';
		}
		$out = array();
		foreach ( array_slice( array_values( $kits ), 0, self::max_kits() ) as $i => $kit ) {
			if ( ! is_array( $kit ) ) {
				continue;
			}
			$colors = array();
			foreach ( array_slice( (array) ( $kit['colors'] ?? array() ), 0, 12 ) as $c ) {
				$c = sanitize_hex_color( (string) $c );
				if ( $c ) {
					$colors[] = $c;
				}
			}
			$fonts = array();
			foreach ( array_slice( (array) ( $kit['fonts'] ?? array() ), 0, 3 ) as $f ) {
				$f = sanitize_text_field( (string) $f );
				if ( '' !== $f ) {
					$fonts[] = $f;
				}
			}
			$id    = sanitize_key( (string) ( $kit['id'] ?? '' ) );
			$name  = sanitize_text_field( (string) ( $kit['name'] ?? '' ) );
			$clean = array(
				'id'     => $id ? $id : 'kit' . ( $i + 1 ),
				/* translators: %d: brand kit number. */
				'name'   => '' !== $name ? $name : sprintf( __( 'Brand Kit %d', 'wunderpaint' ), $i + 1 ),
				'colors' => $colors,
				'fonts'  => $fonts,
				'logo'   => max( 0, (int) ( $kit['logo'] ?? 0 ) ),
				'watermark' => max( 0, (int) ( $kit['watermark'] ?? 0 ) ),
			);
			// Company profile (v1.80): optional free-text fields that feed
			// AI content generation as {placeholder} variables.
			foreach ( array( 'company', 'contactName', 'street', 'zip', 'city', 'industry' ) as $field ) {
				$clean[ $field ] = sanitize_text_field( (string) ( $kit[ $field ] ?? '' ) );
			}
			$clean['email']       = sanitize_email( (string) ( $kit['email'] ?? '' ) );
			$clean['website']     = esc_url_raw( (string) ( $kit['website'] ?? '' ) );
			$clean['description'] = sanitize_textarea_field( (string) ( $kit['description'] ?? '' ) );
			$vars                 = array();
			foreach ( array_slice( (array) ( $kit['vars'] ?? array() ), 0, 24 ) as $var ) {
				$var = (array) $var;
				$key = preg_replace( '/[^a-z0-9_]/', '', strtolower( (string) ( $var['key'] ?? '' ) ) );
				if ( '' !== $key ) {
					$vars[] = array(
						'key'   => $key,
						'value' => sanitize_text_field( (string) ( $var['value'] ?? '' ) ),
					);
				}
			}
			$clean['vars'] = $vars;
			$out[]         = $clean;
		}
		return $out ? (string) wp_json_encode( $out ) : '';
	}

	public function render_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'Sorry, you are not allowed to access this page.', 'wunderpaint' ) );
		}
		$s      = Helpers::get_settings();
		$status = Helpers::provider_status();
		$usage  = Helpers::usage_this_month();
		?>
		<div class="wrap wpie-settings">
			<div class="wpie-hero">
				<img class="wpie-hero-logo" src="<?php echo esc_url( plugins_url( 'assets/icon-wpie.svg', WPIE_FILE ) ); ?>" alt="">
				<div class="wpie-hero-text">
					<h1>
						<?php esc_html_e( 'WunderPaint', 'wunderpaint' ); ?>
						<span class="wpie-hero-ver">v<?php echo esc_html( WPIE_VERSION ); ?></span>
						<?php if ( apply_filters( 'wpie_pro_active', false ) ) : ?>
							<span class="wpie-hero-pro">Pro</span>
						<?php endif; ?>
					</h1>
					<p><?php esc_html_e( 'The complete image and design studio inside WordPress.', 'wunderpaint' ); ?></p>
				</div>
				<div class="wpie-hero-actions">
					<a class="button button-primary" href="<?php echo esc_url( admin_url( 'upload.php?page=' . WPIE_SLUG ) ); ?>"><?php esc_html_e( 'Open Editor', 'wunderpaint' ); ?></a>
					<a class="button wpie-hero-site" href="https://wp-image-editor.com" target="_blank" rel="noopener noreferrer"><?php esc_html_e( 'Website', 'wunderpaint' ); ?></a>
				</div>
			</div>
			<hr class="wp-header-end">

			<h2 class="nav-tab-wrapper wpie-tabs">
				<?php
				$tabs = array(
					'general'    => __( 'General', 'wunderpaint' ),
					'providers'  => __( 'AI Providers', 'wunderpaint' ),
					'costs'      => __( 'Costs & Budget', 'wunderpaint' ),
					'models'     => __( 'Local AI Models', 'wunderpaint' ),
					'fonts'      => __( 'Fonts', 'wunderpaint' ),
					'integrations' => __( 'Integrations', 'wunderpaint' ),
					'versioning' => __( 'Versioning', 'wunderpaint' ),
					'permissions' => __( 'Permissions', 'wunderpaint' ),
					'advanced'   => __( 'Advanced', 'wunderpaint' ),
				'backup'     => __( 'Backup', 'wunderpaint' ),
				);

				/**
				 * Add settings tabs (v1.79.1); render the matching panel via
				 * the `wpie_settings_extra_tabs` action.
				 *
				 * @param array $tabs slug => label.
				 */
				$tabs = apply_filters( 'wpie_settings_tabs', $tabs );
				// About always sits last, behind add-on tabs too.
				$tabs['about'] = __( 'About', 'wunderpaint' );
				foreach ( $tabs as $id => $label ) :
					?>
					<a href="#wpie-tab-<?php echo esc_attr( $id ); ?>"
						class="nav-tab <?php echo 'providers' === $id ? 'nav-tab-active' : ''; ?>"
						data-wpie-tab="<?php echo esc_attr( $id ); ?>"><?php echo esc_html( $label ); ?></a>
				<?php endforeach; ?>
			</h2>

			<form method="post" action="<?php echo esc_url( admin_url( 'options.php' ) ); ?>">
				<?php settings_fields( 'wpie' ); ?>

				<div id="wpie-tab-general" class="wpie-tab-panel" hidden>
					<div class="wpie-settings-card">
						<div class="wpie-provider-head">
							<strong><?php esc_html_e( 'Editor Defaults', 'wunderpaint' ); ?></strong>
						</div>
						<div class="wpie-card-row">
							<label for="wpie-default-canvas"><?php esc_html_e( 'Default canvas size', 'wunderpaint' ); ?></label>
							<div>
								<?php $canvases = array( '1080x1080', '1920x1080', '1200x630' ); ?>
								<select id="wpie-default-canvas" name="<?php echo esc_attr( WPIE_OPTION ); ?>[default_canvas]">
									<?php foreach ( $canvases as $c ) : ?>
										<option value="<?php echo esc_attr( $c ); ?>" <?php selected( $s['default_canvas'], $c ); ?>><?php echo esc_html( str_replace( 'x', ' × ', $c ) ); ?></option>
									<?php endforeach; ?>
									<?php if ( ! in_array( $s['default_canvas'], $canvases, true ) ) : ?>
										<option value="<?php echo esc_attr( $s['default_canvas'] ); ?>" selected><?php echo esc_html( str_replace( 'x', ' × ', $s['default_canvas'] ) . ' (' . __( 'custom', 'wunderpaint' ) . ')' ); ?></option>
									<?php endif; ?>
								</select>
							</div>
						</div>
						<div class="wpie-card-row">
							<label for="wpie-theme"><?php esc_html_e( 'Theme', 'wunderpaint' ); ?></label>
							<div>
								<select id="wpie-theme" name="<?php echo esc_attr( WPIE_OPTION ); ?>[theme]">
									<option value="dark" <?php selected( $s['theme'], 'dark' ); ?>><?php esc_html_e( 'Dark', 'wunderpaint' ); ?></option>
									<option value="light" <?php selected( $s['theme'], 'light' ); ?>><?php esc_html_e( 'Light', 'wunderpaint' ); ?></option>
									<option value="system" <?php selected( $s['theme'], 'system' ); ?>><?php esc_html_e( 'System', 'wunderpaint' ); ?></option>
								</select>
								<p class="description"><?php esc_html_e( 'Seeds the editor’s initial theme; users can toggle inside the editor.', 'wunderpaint' ); ?></p>
							</div>
						</div>
						<div class="wpie-card-row">
							<label for="wpie-picker-manager"><?php esc_html_e( 'Image picker', 'wunderpaint' ); ?></label>
							<div>
								<input type="hidden" name="<?php echo esc_attr( WPIE_OPTION ); ?>[media_picker_manager]" value="0">
								<label>
									<input type="checkbox" id="wpie-picker-manager" name="<?php echo esc_attr( WPIE_OPTION ); ?>[media_picker_manager]" value="1" <?php checked( ! empty( $s['media_picker_manager'] ) ); ?>>
									<?php esc_html_e( 'Use the Media Library Manager as the image picker in editor tools and extensions.', 'wunderpaint' ); ?>
								</label>
								<p class="description"><?php esc_html_e( 'The classic WordPress Media Library stays one click away inside the picker.', 'wunderpaint' ); ?></p>
							</div>
						</div>
					</div>
				</div>

				<div id="wpie-tab-costs" class="wpie-tab-panel" hidden>
					<?php
					// Aggregate the usage log (v1.73): this month per model,
					// today, and a 30-day daily series per provider.
					$cost_log     = Helpers::usage_log();
					$cost_month   = gmdate( 'Y-m' );
					$cost_today   = gmdate( 'Y-m-d' );
					$month_total  = 0.0;
					$month_calls  = 0;
					$today_total  = 0.0;
					$by_model     = array();
					$series       = array();
					for ( $i = 29; $i >= 0; $i-- ) {
						$series[ gmdate( 'Y-m-d', time() - $i * DAY_IN_SECONDS ) ] = array(
							'gemini'    => 0.0,
							'openai'    => 0.0,
							'anthropic' => 0.0,
						);
					}
					foreach ( $cost_log as $day => $slots ) {
						foreach ( $slots as $key => $entry ) {
							$cost = (float) ( $entry['cost'] ?? 0 );
							if ( isset( $series[ $day ] ) ) {
								$prov = (string) ( $entry['provider'] ?? '' );
								if ( isset( $series[ $day ][ $prov ] ) ) {
									$series[ $day ][ $prov ] += $cost;
								}
							}
							if ( 0 === strpos( $day, $cost_month ) ) {
								$month_total += $cost;
								$month_calls += (int) ( $entry['calls'] ?? 0 );
								if ( ! isset( $by_model[ $key ] ) ) {
									$by_model[ $key ] = array_merge( $entry, array( 'calls' => 0, 'images' => 0, 'in' => 0, 'out' => 0, 'cost' => 0.0 ) );
								}
								$by_model[ $key ]['calls']  += (int) ( $entry['calls'] ?? 0 );
								$by_model[ $key ]['images'] += (int) ( $entry['images'] ?? 0 );
								$by_model[ $key ]['in']     += (int) ( $entry['in'] ?? 0 );
								$by_model[ $key ]['out']    += (int) ( $entry['out'] ?? 0 );
								$by_model[ $key ]['cost']   += $cost;
							}
							if ( $day === $cost_today ) {
								$today_total += $cost;
							}
						}
					}
					uasort( $by_model, fn( $a, $b ) => $b['cost'] <=> $a['cost'] );
					$limit = (float) $s['monthly_limit'];
					?>

					<div class="wpie-settings-card">
						<div class="wpie-provider-head">
							<strong><?php esc_html_e( 'Budget', 'wunderpaint' ); ?></strong>
						</div>
						<div class="wpie-card-row">
							<label for="wpie-monthly-limit"><?php esc_html_e( 'Monthly spend limit ($)', 'wunderpaint' ); ?></label>
							<div>
								<input type="number" min="0" step="1" id="wpie-monthly-limit" name="<?php echo esc_attr( WPIE_OPTION ); ?>[monthly_limit]" value="<?php echo esc_attr( $s['monthly_limit'] ); ?>">
								<p class="description"><?php esc_html_e( '0 = unlimited. AI calls are blocked once the month reaches this amount.', 'wunderpaint' ); ?></p>
								<?php if ( $limit > 0 ) : ?>
									<div class="wpie-budget-bar"><span style="width:<?php echo esc_attr( min( 100, round( ( $month_total / $limit ) * 100 ) ) ); ?>%"></span></div>
								<?php endif; ?>
							</div>
						</div>
						<div class="wpie-card-row">
							<label for="wpie-lookup-rate-limit"><?php esc_html_e( 'Searches per 5 minutes', 'wunderpaint' ); ?></label>
							<div>
								<input type="number" min="0" step="1" id="wpie-lookup-rate-limit" name="<?php echo esc_attr( WPIE_OPTION ); ?>[lookup_rate_limit]" value="<?php echo esc_attr( isset( $s['lookup_rate_limit'] ) ? $s['lookup_rate_limit'] : 120 ); ?>">
								<p class="description"><?php esc_html_e( 'Throttle per user for stock photo searches and map lookups. These call third-party services on your behalf, so a runaway client can get your site blocked by them; 0 = no throttle.', 'wunderpaint' ); ?></p>
							</div>
						</div>
						<div class="wpie-card-row">
							<label for="wpie-ai-rate-limit"><?php esc_html_e( 'AI requests per 5 minutes', 'wunderpaint' ); ?></label>
							<div>
								<input type="number" min="0" step="1" id="wpie-ai-rate-limit" name="<?php echo esc_attr( WPIE_OPTION ); ?>[ai_rate_limit]" value="<?php echo esc_attr( isset( $s['ai_rate_limit'] ) ? $s['ai_rate_limit'] : 60 ); ?>">
								<p class="description"><?php esc_html_e( 'Throttle per user, protects against runaway usage. Raise it for bulk jobs like the Metadata Assistant (each image is one request); 0 = no throttle. This does not change your provider\'s own rate limits.', 'wunderpaint' ); ?></p>
							</div>
						</div>
					</div>

					<div class="wpie-stat-grid">
						<div class="wpie-stat-card">
							<span class="wpie-stat-value">$<?php echo esc_html( number_format_i18n( $month_total, 2 ) ); ?></span>
							<span class="wpie-stat-label"><?php esc_html_e( 'This month', 'wunderpaint' ); ?></span>
						</div>
						<div class="wpie-stat-card">
							<span class="wpie-stat-value">$<?php echo esc_html( number_format_i18n( $today_total, 2 ) ); ?></span>
							<span class="wpie-stat-label"><?php esc_html_e( 'Today', 'wunderpaint' ); ?></span>
						</div>
						<div class="wpie-stat-card">
							<span class="wpie-stat-value"><?php echo esc_html( number_format_i18n( $month_calls ) ); ?></span>
							<span class="wpie-stat-label"><?php esc_html_e( 'Requests this month', 'wunderpaint' ); ?></span>
						</div>
						<div class="wpie-stat-card">
							<span class="wpie-stat-value"><?php echo esc_html( $limit > 0 ? '$' . number_format_i18n( max( 0, $limit - $month_total ), 2 ) : '∞' ); ?></span>
							<span class="wpie-stat-label"><?php esc_html_e( 'Budget left', 'wunderpaint' ); ?></span>
						</div>
					</div>

					<div class="wpie-settings-card">
						<div class="wpie-provider-head">
							<strong><?php esc_html_e( 'Daily costs, last 30 days', 'wunderpaint' ); ?></strong>
						</div>
						<canvas id="wpie-cost-chart" width="720" height="220" style="max-width:100%"></canvas>
						<div class="wpie-chart-legend">
							<span><i style="background:#3b66ff"></i> Gemini</span>
							<span><i style="background:#10a37f"></i> OpenAI</span>
							<span><i style="background:#d97757"></i> Anthropic</span>
						</div>
						<script>
						( function () {
							var data = <?php echo wp_json_encode( array_map( fn( $d, $v ) => array( 'day' => substr( $d, 5 ), 'g' => round( $v['gemini'], 4 ), 'o' => round( $v['openai'], 4 ), 'a' => round( $v['anthropic'], 4 ) ), array_keys( $series ), array_values( $series ) ) ); ?>;
							var canvas = document.getElementById( 'wpie-cost-chart' );
							if ( ! canvas ) { return; }
							var ctx = canvas.getContext( '2d' );
							var W = canvas.width, H = canvas.height, padL = 44, padB = 22, padT = 10;
							var max = 0.01;
							data.forEach( function ( d ) { max = Math.max( max, d.g + d.o + d.a ); } );
							ctx.font = '11px sans-serif';
							ctx.fillStyle = '#646970';
							ctx.strokeStyle = '#e2e4e7';
							// y grid: 4 lines
							for ( var t = 0; t <= 4; t++ ) {
								var y = padT + ( H - padT - padB ) * ( 1 - t / 4 );
								ctx.beginPath(); ctx.moveTo( padL, y ); ctx.lineTo( W - 4, y ); ctx.stroke();
								ctx.fillText( '$' + ( max * t / 4 ).toFixed( 2 ), 2, y + 4 );
							}
							var bw = ( W - padL - 8 ) / data.length;
							data.forEach( function ( d, i ) {
								var x = padL + i * bw;
								var y = H - padB;
								[ [ d.g, '#3b66ff' ], [ d.o, '#10a37f' ], [ d.a, '#d97757' ] ].forEach( function ( seg ) {
									var h = ( seg[ 0 ] / max ) * ( H - padT - padB );
									if ( h > 0 ) {
										ctx.fillStyle = seg[ 1 ];
										ctx.fillRect( x + 1, y - h, Math.max( 2, bw - 2 ), h );
										y -= h;
									}
								} );
								if ( 0 === i % 5 ) {
									ctx.fillStyle = '#646970';
									ctx.fillText( d.day, x, H - 6 );
								}
							} );
						} )();
						</script>
					</div>

					<div class="wpie-settings-card">
						<div class="wpie-provider-head">
							<strong><?php esc_html_e( 'This month by model', 'wunderpaint' ); ?></strong>
						</div>
						<?php if ( ! $by_model ) : ?>
							<p class="description"><?php esc_html_e( 'No AI usage recorded yet this month.', 'wunderpaint' ); ?></p>
						<?php else : ?>
							<table class="widefat striped wpie-cost-table">
								<thead><tr>
									<th><?php esc_html_e( 'Model', 'wunderpaint' ); ?></th>
									<th><?php esc_html_e( 'Task', 'wunderpaint' ); ?></th>
									<th><?php esc_html_e( 'Requests', 'wunderpaint' ); ?></th>
									<th><?php esc_html_e( 'Images', 'wunderpaint' ); ?></th>
									<th><?php esc_html_e( 'Tokens in', 'wunderpaint' ); ?></th>
									<th><?php esc_html_e( 'Tokens out', 'wunderpaint' ); ?></th>
									<th><?php esc_html_e( 'Cost', 'wunderpaint' ); ?></th>
								</tr></thead>
								<tbody>
									<?php foreach ( $by_model as $row ) : ?>
										<tr>
											<td><code><?php echo esc_html( $row['model'] ); ?></code><br><small><?php echo esc_html( $row['provider'] ); ?></small></td>
											<td><?php echo esc_html( $row['action'] ); ?></td>
											<td><?php echo esc_html( number_format_i18n( $row['calls'] ) ); ?></td>
											<td><?php echo esc_html( $row['images'] ? number_format_i18n( $row['images'] ) : '–' ); ?></td>
											<td><?php echo esc_html( $row['in'] ? number_format_i18n( $row['in'] ) : '–' ); ?></td>
											<td><?php echo esc_html( $row['out'] ? number_format_i18n( $row['out'] ) : '–' ); ?></td>
											<td>$<?php echo esc_html( number_format_i18n( $row['cost'], 4 ) ); ?></td>
										</tr>
									<?php endforeach; ?>
								</tbody>
							</table>
						<?php endif; ?>
						<p class="description"><?php esc_html_e( 'Costs are estimates: real token and image counts multiplied by the prices you maintain under AI Providers → Models.', 'wunderpaint' ); ?></p>
					</div>
				</div>

				<div id="wpie-tab-models" class="wpie-tab-panel" hidden>
					<div class="wpie-settings-card">
					<div class="wpie-provider-head">
						<strong><?php esc_html_e( 'Local AI models', 'wunderpaint' ); ?></strong>
					</div>
					<p class="description"><?php esc_html_e( 'These optional models power local, in-browser features (Smart Select, background blur, local alt text). Downloading stores each model once on YOUR server (wp-content/uploads/wpie-models), after that it is served from your own domain, so nothing is fetched from a third-party CDN at run time and the features work offline.', 'wunderpaint' ); ?></p>
					<table class="widefat striped" style="max-width:640px">
						<thead><tr>
							<th><?php esc_html_e( 'Model', 'wunderpaint' ); ?></th>
							<th><?php esc_html_e( 'Size', 'wunderpaint' ); ?></th>
							<th><?php esc_html_e( 'Status', 'wunderpaint' ); ?></th>
							<th></th>
						</tr></thead>
						<tbody id="wpie-ml-list"><tr><td colspan="4"><?php esc_html_e( 'Loading…', 'wunderpaint' ); ?></td></tr></tbody>
					</table>
					<?php // The runtime has shipped inside the plugin since v1.316; only the models are fetched (audit 2026-07-28). ?>
					<p class="description"><?php esc_html_e( 'The runtime ships inside the plugin, so only the models are downloaded, server-to-server from Hugging Face. That can take a while; if one times out, click Download again and it resumes where it left off.', 'wunderpaint' ); ?></p>
					</div>
					<script>
					( function () {
						var listUrl = <?php echo wp_json_encode( rest_url( WPIE_REST_NS . '/ml-models' ) ); ?>;
						var dlUrl   = <?php echo wp_json_encode( rest_url( WPIE_REST_NS . '/ml-models/download' ) ); ?>;
						var nonce   = <?php echo wp_json_encode( wp_create_nonce( 'wp_rest' ) ); ?>;
						var tbody   = document.getElementById( 'wpie-ml-list' );
						var T = {
							installed: <?php echo wp_json_encode( __( 'Installed', 'wunderpaint' ) ); ?>,
							notInst:   <?php echo wp_json_encode( __( 'Not installed', 'wunderpaint' ) ); ?>,
							dl:        <?php echo wp_json_encode( __( 'Download', 'wunderpaint' ) ); ?>,
							redl:      <?php echo wp_json_encode( __( 'Re-download', 'wunderpaint' ) ); ?>,
							working:   <?php echo wp_json_encode( __( 'Downloading…', 'wunderpaint' ) ); ?>
						};
						function esc( s ) { var d = document.createElement( 'div' ); d.textContent = s; return d.innerHTML; }
						function row( m ) {
							return '<tr data-id="' + esc( m.id ) + '">' +
								'<td>' + esc( m.label ) + '<br><small style="color:#666">' + esc( m.repo ) + '</small></td>' +
								'<td>~' + esc( m.mb ) + ' MB</td>' +
								'<td class="st">' + ( m.installed ? '✅ ' + T.installed : T.notInst ) + '</td>' +
								'<td><button type="button" class="button" data-dl="' + esc( m.id ) + '">' + ( m.installed ? T.redl : T.dl ) + '</button></td>' +
								'</tr>';
						}
						function load() {
							fetch( listUrl, { headers: { 'X-WP-Nonce': nonce } } )
								.then( function ( r ) { return r.json(); } )
								.then( function ( d ) {
									tbody.innerHTML = ( d.models || [] ).map( row ).join( '' );
								} )
								.catch( function () { tbody.innerHTML = '<tr><td colspan="4">Error loading models.</td></tr>'; } );
						}
						tbody.addEventListener( 'click', function ( e ) {
							var id = e.target && e.target.getAttribute && e.target.getAttribute( 'data-dl' );
							if ( ! id ) { return; }
							var btn = e.target;
							var st = btn.closest( 'tr' ).querySelector( '.st' );
							btn.disabled = true; btn.textContent = T.working; st.textContent = '⏳';
							fetch( dlUrl, {
								method: 'POST',
								headers: { 'X-WP-Nonce': nonce, 'Content-Type': 'application/json' },
								body: JSON.stringify( { id: id } )
							} )
								.then( function ( r ) { return r.json(); } )
								.then( function ( res ) {
									btn.disabled = false;
									if ( res && res.installed ) {
										st.textContent = '✅ ' + T.installed + ' (' + res.downloaded + ' ' + ( res.skipped ? '/ ' + res.skipped + ' skipped' : '' ) + ')';
										btn.textContent = T.redl;
									} else {
										var msg = ( res && ( res.message || ( res.errors && res.errors.join( '; ' ) ) ) ) || 'failed';
										st.textContent = '⚠️ ' + msg;
										btn.textContent = T.dl;
									}
								} )
								.catch( function ( err ) {
									btn.disabled = false; btn.textContent = T.dl;
									st.textContent = '⚠️ ' + err;
								} );
						} );
						load();
					} )();
					</script>
				</div>

				<div id="wpie-tab-providers" class="wpie-tab-panel">
					<p><?php esc_html_e( 'API keys enable text-to-image, prompt editing and inpainting in the editor. Background removal and upscaling always work locally, no key required. Keys are stored obfuscated (reversible, not true encryption) in the database; for real secrecy define them as constants in wp-config.php.', 'wunderpaint' ); ?></p>

					<div class="wpie-provider-cards">
						<?php foreach ( $this->providers_meta() as $id => $meta ) : ?>
							<div class="wpie-provider-card">
								<div class="wpie-provider-head">
									<span class="wpie-provider-tile" style="background:<?php echo esc_attr( $meta['tile'] ); ?>"><?php echo esc_html( strtoupper( substr( $meta['name'], 0, 1 ) ) ); ?></span>
									<strong><?php echo esc_html( $meta['name'] ); ?></strong>
									<?php if ( ! empty( $status[ $id ] ) ) : ?>
										<span class="wpie-badge wpie-badge-ok"><?php esc_html_e( 'Connected', 'wunderpaint' ); ?></span>
									<?php else : ?>
										<span class="wpie-badge"><?php esc_html_e( 'Not configured', 'wunderpaint' ); ?></span>
									<?php endif; ?>
								</div>
								<p class="description"><?php echo esc_html( $meta['desc'] ); ?></p>
								<?php if ( ! empty( $meta['link'] ) ) : ?>
									<p class="wpie-keylink">
										<a href="<?php echo esc_url( $meta['link'] ); ?>" target="_blank" rel="noopener noreferrer">
											<?php echo esc_html( $meta['link_label'] ); ?>
											<span class="dashicons dashicons-external" aria-hidden="true"></span>
										</a>
									</p>
								<?php endif; ?>
								<?php $this->render_key_field( $id, $s ); ?>
								<p>
									<button type="button" class="button wpie-test-connection" data-provider="<?php echo esc_attr( $id ); ?>">
										<?php esc_html_e( 'Test connection', 'wunderpaint' ); ?>
									</button>
									<span class="wpie-test-result" aria-live="polite"></span>
								</p>
							</div>
						<?php endforeach; ?>
					</div>

					<div class="wpie-settings-card">
						<div class="wpie-provider-head">
							<strong><?php esc_html_e( 'Default AI Provider', 'wunderpaint' ); ?></strong>
						</div>
						<div class="wpie-card-row">
							<label for="wpie-default-provider"><?php esc_html_e( 'Default image provider', 'wunderpaint' ); ?></label>
							<div>
								<select id="wpie-default-provider" name="<?php echo esc_attr( WPIE_OPTION ); ?>[default_provider]">
									<option value="gemini" <?php selected( $s['default_provider'], 'gemini' ); ?>>Gemini</option>
									<option value="openai" <?php selected( $s['default_provider'], 'openai' ); ?>>OpenAI</option>
								</select>
								<p class="description"><?php esc_html_e( 'Used for image generation and editing unless a dialog picks another model.', 'wunderpaint' ); ?></p>
							</div>
						</div>
						<div class="wpie-card-row">
							<label for="wpie-default-text-provider"><?php esc_html_e( 'Default text provider', 'wunderpaint' ); ?></label>
							<div>
								<select id="wpie-default-text-provider" name="<?php echo esc_attr( WPIE_OPTION ); ?>[default_text_provider]">
									<option value="anthropic" <?php selected( $s['default_text_provider'], 'anthropic' ); ?>>Anthropic Claude</option>
									<option value="openai" <?php selected( $s['default_text_provider'], 'openai' ); ?>>OpenAI</option>
									<option value="gemini" <?php selected( $s['default_text_provider'], 'gemini' ); ?>>Gemini</option>
								</select>
								<p class="description"><?php esc_html_e( 'Powers the Design Generator, generated library items and illustrations, text layouts, alt text/captions and SEO texts. Falls back to the first configured text-capable provider.', 'wunderpaint' ); ?></p>
							</div>
						</div>
					</div>


					<h2 class="title"><?php esc_html_e( 'Models', 'wunderpaint' ); ?></h2>
					<p class="description"><?php esc_html_e( 'Override which model each provider uses and what it costs; empty fields use the built-in defaults (shown as placeholders). Fast text models handle alt text, captions and SEO; design models power the Design Generator, generated library items, illustrations and text layouts. Prices feed the Costs & Budget statistics, keep them in sync with your providers\' current pricing.', 'wunderpaint' ); ?></p>
					<?php
					$pm           = $this->providers_meta();
					$model_groups = array(
						'gemini'    => array(
							'model_gemini'         => __( 'Image model', 'wunderpaint' ),
							'model_gemini_caption' => __( 'Fast text model', 'wunderpaint' ),
							'model_gemini_design'  => __( 'Design model', 'wunderpaint' ),
						),
						'openai'    => array(
							'model_openai'            => __( 'Image model', 'wunderpaint' ),
							'model_openai_variations' => __( 'Variations model', 'wunderpaint' ),
							'model_openai_caption'    => __( 'Fast text model', 'wunderpaint' ),
							'model_openai_design'     => __( 'Design model', 'wunderpaint' ),
						),
						'anthropic' => array(
							'model_anthropic'        => __( 'Fast text model', 'wunderpaint' ),
							'model_anthropic_design' => __( 'Design model', 'wunderpaint' ),
						),
					);
					$model_map      = AI_Provider::model_settings_map();
					$model_defaults = AI_Provider::models();
					// Per-model price slots (v1.73): image models bill per
					// image, text models per 1M input/output tokens.
					$price_slots = array(
						'model_gemini'           => array( 'image', 'img_gemini' ),
						'model_openai'           => array( 'image', 'img_openai' ),
						'model_gemini_caption'   => array( 'text', 'txt_gemini_caption' ),
						'model_gemini_design'    => array( 'text', 'txt_gemini_design' ),
						'model_openai_caption'   => array( 'text', 'txt_openai_caption' ),
						'model_openai_design'    => array( 'text', 'txt_openai_design' ),
						'model_anthropic'        => array( 'text', 'txt_anthropic_caption' ),
						'model_anthropic_design' => array( 'text', 'txt_anthropic_design' ),
					);
					$price_seed  = AI_Provider::price_defaults();
					$price_user  = json_decode( (string) ( $s['ai_prices'] ?? '' ), true );
					$price_user  = is_array( $price_user ) ? $price_user : array();
					$price_input = function ( $key ) use ( $price_seed, $price_user ) {
						printf(
							'<input type="number" min="0" step="0.001" class="wpie-price" name="%s[ai_prices][%s]" value="%s" placeholder="%s">',
							esc_attr( WPIE_OPTION ),
							esc_attr( $key ),
							esc_attr( isset( $price_user[ $key ] ) ? $price_user[ $key ] : '' ),
							esc_attr( isset( $price_seed[ $key ] ) ? $price_seed[ $key ] : '' )
						);
					};
					?>
					<div class="wpie-provider-cards wpie-model-cards">
						<?php foreach ( $model_groups as $pid => $fields ) : ?>
							<div class="wpie-provider-card">
								<div class="wpie-provider-head">
									<span class="wpie-provider-tile" style="background:<?php echo esc_attr( $pm[ $pid ]['tile'] ); ?>"><?php echo esc_html( strtoupper( substr( $pm[ $pid ]['name'], 0, 1 ) ) ); ?></span>
									<strong><?php echo esc_html( $pm[ $pid ]['name'] ); ?></strong>
								</div>
								<?php
								foreach ( $fields as $field => $label ) :
									$slot        = $model_map[ $field ][0];
									$placeholder = isset( $model_defaults[ $slot[0] ][ $slot[1] ] ) ? $model_defaults[ $slot[0] ][ $slot[1] ] : '';
									?>
									<div class="wpie-model-row">
										<label for="wpie-<?php echo esc_attr( $field ); ?>"><?php echo esc_html( $label ); ?></label>
										<input type="text" class="code"
											id="wpie-<?php echo esc_attr( $field ); ?>"
											name="<?php echo esc_attr( WPIE_OPTION ); ?>[<?php echo esc_attr( $field ); ?>]"
											value="<?php echo esc_attr( $s[ $field ] ); ?>"
											placeholder="<?php echo esc_attr( $placeholder ); ?>">
									</div>
									<?php if ( isset( $price_slots[ $field ] ) ) : ?>
										<div class="wpie-price-row">
											<?php if ( 'image' === $price_slots[ $field ][0] ) : ?>
												<span class="wpie-price-field">
													<?php $price_input( $price_slots[ $field ][1] ); ?>
													<em><?php esc_html_e( '$ per image', 'wunderpaint' ); ?></em>
												</span>
											<?php else : ?>
												<span class="wpie-price-field">
													<?php $price_input( $price_slots[ $field ][1] . '_in' ); ?>
													<em><?php esc_html_e( '$ / 1M input tokens', 'wunderpaint' ); ?></em>
												</span>
												<span class="wpie-price-field">
													<?php $price_input( $price_slots[ $field ][1] . '_out' ); ?>
													<em><?php esc_html_e( '$ / 1M output tokens', 'wunderpaint' ); ?></em>
												</span>
											<?php endif; ?>
										</div>
									<?php endif; ?>
								<?php endforeach; ?>
							</div>
						<?php endforeach; ?>
					</div>
						</table>
				</div>

				<div id="wpie-tab-fonts" class="wpie-tab-panel" hidden>
					<div class="wpie-settings-card">
						<div class="wpie-provider-head">
							<strong><?php esc_html_e( 'Built-in fonts', 'wunderpaint' ); ?></strong>
						</div>
						<p class="description">
							<?php esc_html_e( 'The editor bundles 10 font families that are served from this site (self-hosted). No visitor data leaves your server, this source is always active.', 'wunderpaint' ); ?>
						</p>
					</div>

					<?php
					$lib_target = Fonts::library_target();
					$lib_total  = count( $lib_target );
					$lib_done   = count( array_intersect( Fonts::downloaded_families( $s ), $lib_target ) );
					?>
					<div class="wpie-settings-card">
						<div class="wpie-provider-head">
							<strong><?php esc_html_e( 'Font library (recommended)', 'wunderpaint' ); ?></strong>
						</div>
						<p class="description">
							<?php esc_html_e( 'Beyond the 10 built-in families the editor knows a large font catalog. Download it once to keep every family available locally, served from this site. Only your server contacts Google during the download, no visitor browser does, and nothing is loaded from a CDN afterwards.', 'wunderpaint' ); ?>
						</p>
						<div class="wpie-card-row">
							<label><?php esc_html_e( 'Local library', 'wunderpaint' ); ?></label>
							<div>
								<p id="wpie-fonts-lib-count" class="description" style="margin-top:0;">
									<?php
									printf(
										/* translators: 1: number of downloaded families, 2: total available to download. */
										esc_html__( '%1$d of %2$d additional families downloaded.', 'wunderpaint' ),
										(int) $lib_done,
										(int) $lib_total
									);
									?>
								</p>
								<p>
									<button type="button" class="button button-primary" id="wpie-fonts-lib-download"><?php esc_html_e( 'Download the full library', 'wunderpaint' ); ?></button>
									<button type="button" class="button" id="wpie-fonts-lib-cancel" style="display:none;"><?php esc_html_e( 'Cancel', 'wunderpaint' ); ?></button>
									<button type="button" class="button wpie-button-danger" id="wpie-fonts-lib-remove" style="margin-left:8px;<?php echo $lib_done ? '' : 'display:none;'; ?>"><?php esc_html_e( 'Remove downloaded fonts', 'wunderpaint' ); ?></button>
								</p>
								<p id="wpie-fonts-lib-status" class="description" aria-live="polite"></p>
							</div>
						</div>
					</div>

					<div class="wpie-settings-card">
						<div class="wpie-provider-head">
							<strong><?php esc_html_e( 'Google Fonts (CDN)', 'wunderpaint' ); ?></strong>
						</div>
						<div class="wpie-card-row">
							<label><?php esc_html_e( 'Enable', 'wunderpaint' ); ?></label>
							<div>
								<label>
									<input type="hidden" name="<?php echo esc_attr( WPIE_OPTION ); ?>[fonts_google]" value="0">
									<input type="checkbox" name="<?php echo esc_attr( WPIE_OPTION ); ?>[fonts_google]" value="1" <?php checked( ! empty( $s['fonts_google'] ) ); ?>>
									<?php esc_html_e( 'Offer additional Google Fonts in the font picker', 'wunderpaint' ); ?>
								</label>
								<p class="description">
									<?php esc_html_e( 'Privacy note: with this enabled the editor loads fonts from fonts.googleapis.com while people work, which transmits their IP address to Google. Exported images are not affected (text is rendered to pixels). Leave it off for a strictly self-hosted setup.', 'wunderpaint' ); ?>
								</p>
							</div>
						</div>
					</div>

					<div class="wpie-settings-card">
						<div class="wpie-provider-head">
							<strong><?php esc_html_e( 'Custom fonts', 'wunderpaint' ); ?></strong>
						</div>
						<p class="description">
							<?php esc_html_e( 'Upload your house fonts (woff2, woff, ttf or otf). They are served from this site and appear in the font picker like any other family.', 'wunderpaint' ); ?>
						</p>
						<table class="widefat striped" id="wpie-fonts-table" style="max-width:640px;margin-bottom:12px;<?php echo Fonts::custom_fonts( $s ) ? '' : 'display:none;'; ?>">
							<thead>
								<tr>
									<th><?php esc_html_e( 'Family', 'wunderpaint' ); ?></th>
									<th><?php esc_html_e( 'File', 'wunderpaint' ); ?></th>
									<th></th>
								</tr>
							</thead>
							<tbody>
								<?php foreach ( Fonts::custom_fonts( $s ) as $font ) : ?>
									<tr data-font-id="<?php echo esc_attr( (string) $font['id'] ); ?>">
										<td style="font-family:'<?php echo esc_attr( (string) $font['family'] ); ?>';"><?php echo esc_html( (string) $font['family'] ); ?></td>
										<td><code><?php echo esc_html( (string) $font['file'] ); ?></code></td>
										<td><button type="button" class="button-link-delete wpie-font-delete"><?php esc_html_e( 'Delete', 'wunderpaint' ); ?></button></td>
									</tr>
								<?php endforeach; ?>
							</tbody>
						</table>
						<div class="wpie-card-row">
							<label for="wpie-font-family"><?php esc_html_e( 'Add font', 'wunderpaint' ); ?></label>
							<div>
								<input type="text" id="wpie-font-family" placeholder="<?php esc_attr_e( 'Family name (optional, taken from the filename)', 'wunderpaint' ); ?>" style="min-width:280px;">
								<input type="file" id="wpie-font-file" accept=".woff2,.woff,.ttf,.otf">
								<button type="button" class="button" id="wpie-font-upload"><?php esc_html_e( 'Upload', 'wunderpaint' ); ?></button>
								<span id="wpie-font-status" class="description"></span>
							</div>
						</div>
					</div>
				</div>

				<div id="wpie-tab-integrations" class="wpie-tab-panel" hidden>
					<h2><?php esc_html_e( 'Stock Images', 'wunderpaint' ); ?></h2>
					<p><?php esc_html_e( 'Free API keys enable searching Pexels, Pixabay and Unsplash directly from the editor (File → Stock Images). Images are fetched through your server, never from the browser.', 'wunderpaint' ); ?></p>
					<div class="wpie-provider-cards">
						<?php
						$stock_meta = array(
							'pexels'  => array(
								'name'       => 'Pexels',
								'desc'       => __( 'Hundreds of thousands of free, high-resolution photos and videos, free for commercial use without attribution. The key is free - sign up, confirm your email, done.', 'wunderpaint' ),
								'link'       => 'https://www.pexels.com/api/',
								'link_label' => __( 'Get your free API key at pexels.com/api', 'wunderpaint' ),
								'tile'       => '#05a081',
							),
							'pixabay'  => array(
								'name'       => 'Pixabay',
								'desc'       => __( 'Millions of free photos, illustrations and vector graphics under the Pixabay content license. The key is free and shown right on the API docs page once you are logged in.', 'wunderpaint' ),
								'link'       => 'https://pixabay.com/api/docs/',
								'link_label' => __( 'Get your free API key at pixabay.com/api/docs', 'wunderpaint' ),
								'tile'       => '#00ab6b',
							),
							'unsplash' => array(
								'name'       => 'Unsplash',
								'desc'       => __( 'The best-known source for high-quality free photography. Register a demo app to receive an Access Key (50 requests per hour, plenty for editor search); production access can be requested later.', 'wunderpaint' ),
								'link'       => 'https://unsplash.com/developers',
								'link_label' => __( 'Get your Access Key at unsplash.com/developers', 'wunderpaint' ),
								'tile'       => '#111111',
							),
						);
						$stock_status = Stock::status();
						foreach ( $stock_meta as $id => $meta ) :
							?>
							<div class="wpie-provider-card">
								<div class="wpie-provider-head">
									<span class="wpie-provider-tile" style="background:<?php echo esc_attr( $meta['tile'] ); ?>"><?php echo esc_html( strtoupper( substr( $meta['name'], 0, 1 ) ) ); ?></span>
									<strong><?php echo esc_html( $meta['name'] ); ?></strong>
									<?php if ( ! empty( $stock_status[ $id ] ) ) : ?>
										<span class="wpie-badge wpie-badge-ok"><?php esc_html_e( 'Connected', 'wunderpaint' ); ?></span>
									<?php else : ?>
										<span class="wpie-badge"><?php esc_html_e( 'Not configured', 'wunderpaint' ); ?></span>
									<?php endif; ?>
								</div>
								<p class="description"><?php echo esc_html( $meta['desc'] ); ?></p>
								<?php if ( ! empty( $meta['link'] ) ) : ?>
									<p class="wpie-keylink">
										<a href="<?php echo esc_url( $meta['link'] ); ?>" target="_blank" rel="noopener noreferrer">
											<?php echo esc_html( $meta['link_label'] ); ?>
											<span class="dashicons dashicons-external" aria-hidden="true"></span>
										</a>
									</p>
								<?php endif; ?>
								<?php $this->render_key_field( $id, $s ); ?>
								<p>
									<button type="button" class="button wpie-test-stock" data-provider="<?php echo esc_attr( $id ); ?>">
										<?php esc_html_e( 'Test connection', 'wunderpaint' ); ?>
									</button>
									<span class="wpie-test-result" aria-live="polite"></span>
								</p>
							</div>
						<?php endforeach; ?>
					</div>

					<h2><?php esc_html_e( '3D Model Generation', 'wunderpaint' ); ?></h2>
					<p><?php esc_html_e( 'A Meshy API key lets the 3D studios generate textured 3D models from an image or a text prompt (Meshy charges credits per generation). Requests are proxied through your server; finished models are saved to your 3D model library.', 'wunderpaint' ); ?></p>
					<div class="wpie-provider-cards">
						<div class="wpie-provider-card">
							<div class="wpie-provider-head">
								<span class="wpie-provider-tile" style="background:#3d5afe">M</span>
								<strong>Meshy</strong>
								<?php if ( '' !== Helpers::get_api_key( 'meshy' ) ) : ?>
									<span class="wpie-badge wpie-badge-ok"><?php esc_html_e( 'Connected', 'wunderpaint' ); ?></span>
								<?php else : ?>
									<span class="wpie-badge"><?php esc_html_e( 'Not configured', 'wunderpaint' ); ?></span>
								<?php endif; ?>
							</div>
							<p class="description"><?php esc_html_e( 'AI 3D model generation: image-to-3D and text-to-3D with PBR textures, delivered as GLB. Free trial credits on signup, then pay-as-you-go.', 'wunderpaint' ); ?></p>
							<p class="wpie-keylink">
								<a href="https://www.meshy.ai/api" target="_blank" rel="noopener noreferrer">
									<?php esc_html_e( 'Get your API key at meshy.ai', 'wunderpaint' ); ?>
									<span class="dashicons dashicons-external" aria-hidden="true"></span>
								</a>
							</p>
							<?php $this->render_key_field( 'meshy', $s ); ?>
							<div class="wpie-meshy-opts">
								<p>
									<label for="wpie-meshy-model"><strong><?php esc_html_e( 'AI model', 'wunderpaint' ); ?></strong></label>
									<select id="wpie-meshy-model" name="<?php echo esc_attr( WPIE_OPTION ); ?>[meshy_model]">
										<option value="latest" <?php selected( ( $s['meshy_model'] ?? 'latest' ), 'latest' ); ?>><?php esc_html_e( 'Latest (recommended)', 'wunderpaint' ); ?></option>
										<option value="meshy-6" <?php selected( ( $s['meshy_model'] ?? 'latest' ), 'meshy-6' ); ?>>Meshy 6</option>
										<option value="meshy-5" <?php selected( ( $s['meshy_model'] ?? 'latest' ), 'meshy-5' ); ?>>Meshy 5</option>
									</select>
								</p>
								<p>
									<label for="wpie-meshy-quality"><strong><?php esc_html_e( 'Detail quality', 'wunderpaint' ); ?></strong></label>
									<select id="wpie-meshy-quality" name="<?php echo esc_attr( WPIE_OPTION ); ?>[meshy_quality]">
										<option value="standard" <?php selected( ( $s['meshy_quality'] ?? 'standard' ), 'standard' ); ?>><?php esc_html_e( 'Standard (recommended)', 'wunderpaint' ); ?></option>
										<option value="high" <?php selected( ( $s['meshy_quality'] ?? 'standard' ), 'high' ); ?>><?php esc_html_e( 'High - more detail, larger files', 'wunderpaint' ); ?></option>
										<option value="low" <?php selected( ( $s['meshy_quality'] ?? 'standard' ), 'low' ); ?>><?php esc_html_e( 'Low - compact and fast', 'wunderpaint' ); ?></option>
									</select>
								</p>
								<p class="description"><?php esc_html_e( 'Applied to every generation. Quality steers polygon count and texture resolution; PBR material maps are always included.', 'wunderpaint' ); ?></p>
							</div>
							<p>
								<button type="button" class="button wpie-test-meshy">
									<?php esc_html_e( 'Test connection', 'wunderpaint' ); ?>
								</button>
								<span class="wpie-test-result" aria-live="polite"></span>
							</p>
						</div>
					</div>

				</div>


				<div id="wpie-tab-versioning" class="wpie-tab-panel" hidden>
					<div class="wpie-settings-card">
						<div class="wpie-provider-head">
							<strong><?php esc_html_e( 'Versioning', 'wunderpaint' ); ?></strong>
						</div>
						<div class="wpie-card-row">
							<label><?php esc_html_e( 'Keep versions', 'wunderpaint' ); ?></label>
							<div>
								<label>
									<input type="hidden" name="<?php echo esc_attr( WPIE_OPTION ); ?>[versioning]" value="0">
									<input type="checkbox" name="<?php echo esc_attr( WPIE_OPTION ); ?>[versioning]" value="1" <?php checked( $s['versioning'] ); ?>>
									<?php esc_html_e( 'Keep the previous file as a restorable version when saving over an image', 'wunderpaint' ); ?>
								</label>
							</div>
						</div>
						<div class="wpie-card-row">
							<label for="wpie-versions-keep"><?php esc_html_e( 'Keep last N versions', 'wunderpaint' ); ?></label>
							<div><input type="number" min="1" max="100" id="wpie-versions-keep" name="<?php echo esc_attr( WPIE_OPTION ); ?>[versions_to_keep]" value="<?php echo esc_attr( $s['versions_to_keep'] ); ?>"></div>
						</div>
					</div>
				</div>

				<div id="wpie-tab-permissions" class="wpie-tab-panel" hidden>
					<div class="wpie-settings-card">
						<div class="wpie-provider-head">
							<strong><?php esc_html_e( 'Permissions', 'wunderpaint' ); ?></strong>
						</div>
						<div class="wpie-card-row">
							<label for="wpie-editor-cap"><?php esc_html_e( 'Minimum capability to use the editor', 'wunderpaint' ); ?></label>
							<div>
								<select id="wpie-editor-cap" name="<?php echo esc_attr( WPIE_OPTION ); ?>[editor_cap]">
									<option value="upload_files" <?php selected( $s['editor_cap'], 'upload_files' ); ?>>upload_files (<?php esc_html_e( 'Authors and above', 'wunderpaint' ); ?>)</option>
									<option value="edit_others_posts" <?php selected( $s['editor_cap'], 'edit_others_posts' ); ?>>edit_others_posts (<?php esc_html_e( 'Editors and above', 'wunderpaint' ); ?>)</option>
									<option value="manage_options" <?php selected( $s['editor_cap'], 'manage_options' ); ?>>manage_options (<?php esc_html_e( 'Administrators only', 'wunderpaint' ); ?>)</option>
								</select>
								<p class="description"><?php esc_html_e( 'Opening a specific attachment additionally requires permission to edit that attachment. Configuring AI keys always requires manage_options.', 'wunderpaint' ); ?></p>
							</div>
						</div>
					</div>
				</div>

				<div id="wpie-tab-advanced" class="wpie-tab-panel" hidden>
					<div class="wpie-settings-card">
						<div class="wpie-provider-head">
							<strong><?php esc_html_e( 'Advanced', 'wunderpaint' ); ?></strong>
						</div>
						<div class="wpie-card-row">
							<label><?php esc_html_e( 'Uninstall', 'wunderpaint' ); ?></label>
							<div>
								<label>
									<input type="hidden" name="<?php echo esc_attr( WPIE_OPTION ); ?>[remove_on_uninstall]" value="0">
									<input type="checkbox" name="<?php echo esc_attr( WPIE_OPTION ); ?>[remove_on_uninstall]" value="1" <?php checked( $s['remove_on_uninstall'] ); ?>>
									<?php esc_html_e( 'Remove all plugin data (settings, versions, project sidecars) when the plugin is deleted', 'wunderpaint' ); ?>
								</label>
							</div>
						</div>
					</div>
				</div>

				<?php submit_button(); ?>
			</form>

			<?php
			/**
			 * Extra settings tab panels: add-ons render their panels here as
			 * siblings of Backup and About, outside the core options.php form,
			 * so a panel may carry its own form and save handler (moved out of
			 * the core form in v1.318.0, where a nested add-on form was closing
			 * the core form early). Ids must match the slugs added via the
			 * `wpie_settings_tabs` filter.
			 *
			 * @param array $s Current settings.
			 */
			do_action( 'wpie_settings_extra_tabs', $s );
			?>

			<div id="wpie-tab-backup" class="wpie-tab-panel" hidden>
				<h2><?php esc_html_e( 'Backup', 'wunderpaint' ); ?></h2>
				<?php if ( isset( $_GET['wpie-backup'] ) ) : // phpcs:ignore WordPress.Security.NonceVerification.Recommended ?>
					<div class="notice notice-<?php echo 'error' === $_GET['wpie-backup'] ? 'error' : 'success'; // phpcs:ignore WordPress.Security.NonceVerification.Recommended, WordPress.Security.EscapeOutput.OutputNotEscaped ?> inline">
						<p><?php echo esc_html( rawurldecode( sanitize_text_field( wp_unslash( (string) ( $_GET['wpie-msg'] ?? '' ) ) ) ) ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended ?></p>
					</div>
				<?php endif; ?>

				<div class="wpie-settings-card">
					<h3><?php esc_html_e( 'Export', 'wunderpaint' ); ?></h3>
					<p class="description"><?php esc_html_e( 'One portable ZIP with your brand kits (incl. logo and watermark files), dynamic templates, designs, library assets, content templates, uploaded custom fonts, installed editor extensions and settings. Works for reinstalls and for moving to another site.', 'wunderpaint' ); ?></p>
					<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
						<input type="hidden" name="action" value="wpie_backup_export">
						<?php wp_nonce_field( 'wpie_backup_export' ); ?>
						<p>
							<label><input type="checkbox" name="extensions" value="1" checked> <?php esc_html_e( 'Include installed editor extensions', 'wunderpaint' ); ?></label><br>
							<label><input type="checkbox" name="keys" value="1"> <?php esc_html_e( 'Include API keys (plain text, keep the file safe!)', 'wunderpaint' ); ?></label><br>
							<label><input type="checkbox" name="versions" value="1"> <?php esc_html_e( 'Include image version history (can be large; useful for same-site restores)', 'wunderpaint' ); ?></label>
						</p>
						<p><button type="submit" class="button button-primary"><?php esc_html_e( 'Download backup', 'wunderpaint' ); ?></button></p>
					</form>
				</div>

				<?php
				// The one-step undo for the settings themselves. Kept above
				// the file-based restore because it is the cheaper answer to
				// "I just saved something I did not mean to".
				$wpie_shadow = self::shadow_summary();
				if ( $wpie_shadow && $wpie_shadow['differs'] ) :
					?>
					<div class="wpie-settings-card">
						<h3><?php esc_html_e( 'Undo the last settings change', 'wunderpaint' ); ?></h3>
						<p class="description">
							<?php esc_html_e( 'The version of these settings from before the most recent change is kept in reserve. If a save went wrong, or something overwrote your keys, this puts it back.', 'wunderpaint' ); ?>
						</p>
						<p class="description">
							<?php
							printf(
								/* translators: 1: number of providers with a stored key, 2: number of brand kits, 3: number of downloaded font families. */
								esc_html__( 'The reserved version holds keys for %1$d provider(s), %2$d brand kit(s) and %3$d downloaded font families.', 'wunderpaint' ),
								(int) $wpie_shadow['providers'],
								(int) $wpie_shadow['kits'],
								(int) $wpie_shadow['fonts']
							);
							?>
						</p>
						<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
							<input type="hidden" name="action" value="wpie_settings_restore_prev">
							<?php wp_nonce_field( 'wpie_settings_restore_prev' ); ?>
							<p><button type="submit" class="button"><?php esc_html_e( 'Restore the previous settings', 'wunderpaint' ); ?></button></p>
							<p class="description"><?php esc_html_e( 'Safe to try: what you have now takes its place in reserve, so one more click swaps back.', 'wunderpaint' ); ?></p>
						</form>
					</div>
				<?php endif; ?>

				<div class="wpie-settings-card">
					<h3><?php esc_html_e( 'Restore', 'wunderpaint' ); ?></h3>
					<p class="description"><?php esc_html_e( 'Restoring replaces your dynamic templates, designs, library assets, custom fonts and any extensions contained in the archive; settings are merged and kit logos and watermarks are re-imported into the media library. Your stored API keys stay untouched unless the backup contains keys.', 'wunderpaint' ); ?></p>
					<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" enctype="multipart/form-data" id="wpie-backup-restore">
						<input type="hidden" name="action" value="wpie_backup_import">
						<?php wp_nonce_field( 'wpie_backup_import' ); ?>
						<p><input type="file" name="backup" accept=".zip" required> <span id="wpie-backup-size-note" class="description" style="color:#d63638"></span></p>
						<p><label><input type="checkbox" required> <?php esc_html_e( 'I understand that restoring replaces the existing templates, designs and library assets.', 'wunderpaint' ); ?></label></p>
						<p><button type="submit" class="button button-primary"><?php esc_html_e( 'Restore backup', 'wunderpaint' ); ?></button></p>
					</form>
				</div>

				<div class="wpie-settings-card">
					<h3><?php esc_html_e( 'Remote backup (S3-compatible)', 'wunderpaint' ); ?><?php if ( ! has_action( 'wpie_backup_s3_card' ) ) : ?> <span class="wpie-pro-badge">Pro</span><?php endif; ?></h3>
					<p class="description"><?php esc_html_e( 'Scheduled off-site backups to any S3-compatible storage (AWS S3, Hetzner, DigitalOcean Spaces, Backblaze B2, Wasabi, MinIO). Remote archives never contain API keys.', 'wunderpaint' ); ?></p>
					<?php if ( has_action( 'wpie_backup_s3_card' ) ) : ?>
						<?php
						/**
						 * The Pro add-on renders its S3 backup card here
						 * (v1.113.1); the whole implementation lives in Pro.
						 *
						 * @param array $s Current settings.
						 */
						do_action( 'wpie_backup_s3_card', $s );
						?>
					<?php else : ?>
						<p class="description"><em><?php esc_html_e( 'Scheduled S3 backups are part of WunderPaint Pro. The local backup export above stays free.', 'wunderpaint' ); ?></em></p>
					<?php endif; ?>
				</div>
			</div>

			<div id="wpie-tab-about" class="wpie-tab-panel" hidden>
				<div class="wpie-settings-card wpie-about-hero">
					<img class="wpie-about-logo" src="<?php echo esc_url( plugins_url( 'assets/icon-wpie.svg', WPIE_FILE ) ); ?>" alt="">
					<div class="wpie-about-head">
						<h2>
							<?php esc_html_e( 'WunderPaint', 'wunderpaint' ); ?>
							<span class="wpie-hero-ver">v<?php echo esc_html( WPIE_VERSION ); ?></span>
							<?php if ( apply_filters( 'wpie_pro_active', false ) ) : ?>
								<span class="wpie-hero-pro">Pro</span>
							<?php endif; ?>
						</h2>
						<p><?php esc_html_e( 'Design graphics, edit photos and automate your images.', 'wunderpaint' ); ?></p>
						<p class="wpie-about-links">
							<a class="button button-primary" href="https://wp-image-editor.com" target="_blank" rel="noopener noreferrer"><?php esc_html_e( 'Website', 'wunderpaint' ); ?></a>
							<a class="button" href="<?php echo esc_url( admin_url( 'upload.php?page=' . WPIE_SLUG ) ); ?>"><?php esc_html_e( 'Open Editor', 'wunderpaint' ); ?></a>
						</p>
					</div>
				</div>

				<div class="wpie-about-grid">
					<div class="wpie-settings-card">
						<h3><?php esc_html_e( 'Highlights', 'wunderpaint' ); ?></h3>
						<ul class="wpie-about-list">
							<li><?php esc_html_e( 'Layer-based editing with masks, blend modes, smart objects and non-destructive filters', 'wunderpaint' ); ?></li>
							<li><?php esc_html_e( 'Rich text engine with text effects, warp, styles and one-click presets', 'wunderpaint' ); ?></li>
							<li><?php esc_html_e( 'AI image generation and editing with your own API keys, plus fully local in-browser AI tools', 'wunderpaint' ); ?></li>
							<li><?php esc_html_e( 'Dynamic templates with variables, brand kits and post previews', 'wunderpaint' ); ?></li>
							<li><?php esc_html_e( 'PSD import and export, actions, batch processing and automation', 'wunderpaint' ); ?></li>
							<li><?php esc_html_e( 'Media Library Manager with folders, tags, semantic search and metadata tools', 'wunderpaint' ); ?></li>
							<li><?php esc_html_e( 'Extension platform with 3D studios, pattern and generative tools', 'wunderpaint' ); ?></li>
						</ul>
					</div>

					<div class="wpie-settings-card">
						<h3><?php esc_html_e( 'Privacy & your data', 'wunderpaint' ); ?></h3>
						<p class="description"><?php esc_html_e( 'All cloud AI calls are proxied through your own server with your own keys - API keys never reach the browser. Local AI models are downloaded once to your server and run entirely in the browser; stock photos are fetched through your server. No data is sent to the plugin author.', 'wunderpaint' ); ?></p>
						<h3><?php esc_html_e( 'Open-source components', 'wunderpaint' ); ?></h3>
						<ul class="wpie-about-list wpie-about-credits">
							<li>three.js (MIT)</li>
							<li>Hugging Face Transformers.js (Apache-2.0)</li>
							<li>ONNX Runtime Web (MIT)</li>
							<li>Tabler Icons (MIT)</li>
							<li>opentype.js (MIT)</li>
							<li>VTracer (MIT)</li>
						</ul>
					</div>
				</div>

				<p class="wpie-about-footer">
					<?php
					printf(
						/* translators: 1: copyright years, 2: author. */
						esc_html__( '© %1$s %2$s. All rights reserved where applicable.', 'wunderpaint' ),
						'2026',
						'TBIT DESIGN, Thomas Breher, Germany'
					);
					?>
					·
					<a href="https://www.gnu.org/licenses/gpl-2.0.html" target="_blank" rel="noopener noreferrer"><?php esc_html_e( 'License: GPL-2.0-or-later', 'wunderpaint' ); ?></a>
					·
					<a href="https://wp-image-editor.com" target="_blank" rel="noopener noreferrer">wp-image-editor.com</a>
				</p>
			</div>
		</div>
		<?php
	}

	/**
	 * One provider key field (masked, show/hide, wp-config aware).
	 *
	 * @param string $provider Provider id.
	 * @param array  $s        Settings.
	 */
	private function render_key_field( $provider, $s ) {
		$constant = Helpers::key_constant( $provider );
		$field    = $provider . '_key';
		if ( '' !== $constant ) {
			?>
			<input type="text" class="regular-text" value="<?php echo esc_attr( Helpers::mask_key( $constant ) ); ?>" disabled>
			<p class="description"><?php esc_html_e( 'Defined in wp-config.php', 'wunderpaint' ); ?></p>
			<?php
			return;
		}
		$plain = Helpers::deobfuscate( isset( $s[ $field ] ) ? $s[ $field ] : '' );
		?>
		<label class="screen-reader-text" for="wpie-key-<?php echo esc_attr( $provider ); ?>">
			<?php
			/* translators: %s: provider name. */
			printf( esc_html__( '%s API key', 'wunderpaint' ), esc_html( $provider ) );
			?>
		</label>
		<div class="wpie-keyrow">
			<input type="password"
				id="wpie-key-<?php echo esc_attr( $provider ); ?>"
				class="regular-text wpie-key-input"
				name="<?php echo esc_attr( WPIE_OPTION ); ?>[<?php echo esc_attr( $field ); ?>]"
				value="<?php echo esc_attr( '' !== $plain ? Helpers::mask_key( $plain ) : '' ); ?>"
				autocomplete="off">
			<button type="button" class="button wpie-key-toggle" aria-label="<?php esc_attr_e( 'Show or hide key', 'wunderpaint' ); ?>">👁</button>
			<?php if ( '' !== $plain ) : ?>
				<button type="button" class="button wpie-key-remove"><?php esc_html_e( 'Remove', 'wunderpaint' ); ?></button>
			<?php endif; ?>
		</div>
		<input type="hidden"
			class="wpie-key-remove-flag"
			name="<?php echo esc_attr( WPIE_OPTION ); ?>[<?php echo esc_attr( $field ); ?>_remove]"
			value="">
		<?php
	}

}
