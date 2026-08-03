<?php
/**
 * Shared helpers: settings access, provider status, key handling.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Static helper collection.
 */
class Helpers {

	/**
	 * Default option schema. See spec 09.1.
	 *
	 * @return array
	 */
	public static function defaults() {
		return array(
			'default_provider'    => 'gemini',
			'gemini_key'          => '',
			'openai_key'          => '',
			'anthropic_key'       => '',
			'pexels_key'          => '',
			'pixabay_key'         => '',
			'unsplash_key'        => '',
			'meshy_key'           => '',
			// Meshy generation defaults (v1.296): two friendly knobs, the
			// server maps them onto the raw API parameters.
			'meshy_model'         => 'latest',
			'meshy_quality'       => 'standard',
			's3_endpoint'         => '',
			's3_region'           => 'us-east-1',
			's3_bucket'           => '',
			's3_prefix'           => 'wpie-backups/',
			's3_access_key'       => '',
			's3_secret_key'       => '',
			's3_schedule'         => 'off',
			's3_retention'        => 5,
			's3_versions'         => 0,
			'watermark_id'        => 0,
			'watermark_pos'       => 'br',
			'watermark_scale'     => 20,
			'watermark_opacity'   => 70,
			'watermark_margin'    => 16,
			'monthly_limit'       => 25,
			// AI requests allowed per 5-minute window per user (abuse guard).
			// The site owner with a paid provider key can raise this for bulk
			// jobs like the Metadata Assistant; 0 = no throttle. (v1.290.4)
			'ai_rate_limit'       => 60,
			'lookup_rate_limit'   => 120,
			'default_canvas'      => '1080x1080',
			'theme'               => 'dark',
			// The Media Library Manager replaces wp.media as the image
			// picker in editor tools and extensions (v1.241).
			'media_picker_manager' => 0,
			'versioning'          => true,
			'versions_to_keep'    => 10,
			'editor_cap'          => 'upload_files',
			'remove_on_uninstall' => false,
			'brand_colors'        => '',
			'brand_fonts'         => '',
			'brand_logo'          => 0,
			'brand_kits'          => '',
			// AI model overrides (v1.4), empty = built-in default model.
			'model_gemini'            => '',
			'model_openai'            => '',
			'model_openai_variations' => '',
			'model_anthropic'         => '',
			'model_anthropic_design'  => '',
			'model_openai_caption'    => '',
			'model_openai_design'     => '',
			'model_gemini_caption'    => '',
			'model_gemini_design'     => '',
			'default_text_provider'   => 'anthropic',
			'ai_prices'               => '',
		);
	}

	/**
	 * Stored settings merged over defaults.
	 *
	 * @return array
	 */
	public static function get_settings() {
		$stored = get_option( WPIE_OPTION, array() );
		if ( ! is_array( $stored ) ) {
			$stored = array();
		}
		return array_merge( self::defaults(), $stored );
	}

	const KEY_PREFIX = 'wpie1:';

	/**
	 * Secret option fields (stored obfuscated).
	 *
	 * @return string[]
	 */
	public static function secret_fields() {
		return array( 'gemini_key', 'openai_key', 'anthropic_key', 'pexels_key', 'pixabay_key', 'unsplash_key', 'meshy_key', 's3_secret_key' );
	}

	/**
	 * Every directory this plugin creates inside wp-content/uploads, relative
	 * to the uploads base. Single source of truth: the deny rules below and
	 * the uninstall cleanup both work from this list, so a new store cannot
	 * be forgotten in one of the two places.
	 *
	 * @return string[]
	 */
	public static function upload_dirs() {
		return array( 'wpie-versions', 'wpie-fonts', 'wpie-fonts/library', 'wpie-extensions', 'wpie-3d-models', 'wpie-models', 'wpie-runtime', 'wpie-live', 'wpie-content' );
	}

	/**
	 * Apply protect_dir() to every uploads directory this plugin owns. Cheap
	 * enough to run on activation and on admin bootstrap, which is what also
	 * retrofits installations whose directories were created before the deny
	 * rules existed. (F-L61, 2026-07-25 audit)
	 *
	 * @return void
	 */
	public static function protect_upload_dirs() {
		$base = trailingslashit( wp_upload_dir( null, false )['basedir'] );
		foreach ( self::upload_dirs() as $name ) {
			self::protect_dir( $base . $name );
		}
	}

	/**
	 * Drop a deny rule into a directory the plugin created inside wp-content/
	 * uploads, so nothing there can ever be executed as code.
	 *
	 * The uploads tree is served by the web server and PHP is usually enabled
	 * for the whole document root, which means any future file write bug turns
	 * straight into remote code execution. This is the last line of defence and
	 * costs one file per directory. Written once; an existing file is left
	 * alone so a site owner can adjust it. nginx ignores .htaccess, so this
	 * complements but does not replace a server rule. (F-L61, 2026-07-25 audit)
	 *
	 * @param string $dir Absolute directory path.
	 * @return void
	 */
	public static function protect_dir( $dir ) {
		$file = trailingslashit( (string) $dir ) . '.htaccess';
		if ( ! is_dir( $dir ) || file_exists( $file ) ) {
			return;
		}
		$rules  = "# WunderPaint: these files are static assets, never code.\n";
		$rules .= '<FilesMatch "\.(?i:php|phtml|phtm|php[0-9]|phps|pht|phar|cgi|pl|py|sh|shtml)(\.|$)">' . "\n";
		$rules .= "\t<IfModule mod_authz_core.c>\n\t\tRequire all denied\n\t</IfModule>\n";
		$rules .= "\t<IfModule !mod_authz_core.c>\n\t\tOrder allow,deny\n\t\tDeny from all\n\t</IfModule>\n";
		$rules .= "</FilesMatch>\n";
		file_put_contents( $file, $rules ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
	}

	/**
	 * Whether the current user may run a destructive op (overwrite/delete) on a
	 * shared-store record they may not have created. Shared stores (user
	 * library, templates, palettes, automation jobs) stay readable team-wide,
	 * but overwriting or deleting another editor's entry is limited to its owner
	 * or an administrator. Records without a stored owner (legacy entries from
	 * before ownership stamping) are admin-only, matching Projects::can_access().
	 *
	 * @param array|mixed $record Stored record (expects an 'owner' user id).
	 * @return bool
	 */
	public static function can_manage_owned( $record ) {
		if ( current_user_can( 'manage_options' ) ) {
			return true;
		}
		$owner = is_array( $record ) && isset( $record['owner'] ) ? (int) $record['owner'] : 0;
		return $owner > 0 && get_current_user_id() === $owner;
	}

	/**
	 * Cipher key derived from the WP salts.
	 *
	 * @return string 32 raw bytes.
	 */
	private static function cipher_key() {
		return hash( 'sha256', wp_salt( 'secure_auth' ), true );
	}

	/**
	 * Reversible obfuscation (AES-256-CTR + HMAC), keyed off the WP salts.
	 * Not true secrecy, wp-config constants are the preferred store.
	 *
	 * @param string $value Plaintext.
	 * @return string Prefixed ciphertext, or '' when input is empty.
	 */
	public static function obfuscate( $value ) {
		$value = (string) $value;
		if ( '' === $value ) {
			return '';
		}
		$key = self::cipher_key();
		$iv  = random_bytes( 16 );
		$ct  = openssl_encrypt( $value, 'aes-256-ctr', $key, OPENSSL_RAW_DATA, $iv );
		if ( false === $ct ) {
			return '';
		}
		$mac = hash_hmac( 'sha256', $iv . $ct, $key, true );
		return self::KEY_PREFIX . base64_encode( $iv . $ct . $mac ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode
	}

	/**
	 * Reverse of obfuscate(). Returns '' on any failure (garbled data,
	 * rotated salts) so callers treat the key as not configured.
	 *
	 * @param string $value Prefixed ciphertext.
	 * @return string Plaintext or ''.
	 */
	public static function deobfuscate( $value ) {
		if ( ! is_string( $value ) || 0 !== strpos( $value, self::KEY_PREFIX ) ) {
			return '';
		}
		$raw = base64_decode( substr( $value, strlen( self::KEY_PREFIX ) ), true ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode
		if ( false === $raw || strlen( $raw ) <= 48 ) {
			return '';
		}
		$key = self::cipher_key();
		$iv  = substr( $raw, 0, 16 );
		$mac = substr( $raw, -32 );
		$ct  = substr( $raw, 16, -32 );
		if ( ! hash_equals( hash_hmac( 'sha256', $iv . $ct, $key, true ), $mac ) ) {
			return '';
		}
		$pt = openssl_decrypt( $ct, 'aes-256-ctr', $key, OPENSSL_RAW_DATA, $iv );
		return false === $pt ? '' : $pt;
	}

	/**
	 * Display mask for a stored secret: "AIza…L3k".
	 *
	 * @param string $value Plaintext secret.
	 * @return string
	 */
	public static function mask_key( $value ) {
		$value = (string) $value;
		if ( '' === $value ) {
			return '';
		}
		if ( strlen( $value ) <= 7 ) {
			return '…';
		}
		return substr( $value, 0, 4 ) . '…' . substr( $value, -3 );
	}

	/**
	 * The wp-config constant value for a provider key, filterable for tests.
	 *
	 * @param string $provider gemini|openai|anthropic.
	 * @return string
	 */
	public static function key_constant( $provider ) {
		$const = 'WPIE_' . strtoupper( $provider ) . '_KEY';
		$value = defined( $const ) ? (string) constant( $const ) : '';
		/**
		 * Filter the wp-config constant lookup (used by tests).
		 *
		 * @param string $value    Constant value or ''.
		 * @param string $provider Provider id.
		 */
		return (string) apply_filters( 'wpie_key_constant', $value, $provider );
	}

	/**
	 * Resolve the usable API key for a provider: constant wins over stored.
	 *
	 * @param string $provider gemini|openai|anthropic.
	 * @return string Plaintext key or ''.
	 */
	public static function get_api_key( $provider ) {
		$constant = self::key_constant( $provider );
		if ( '' !== $constant ) {
			return $constant;
		}
		$settings = self::get_settings();
		return self::deobfuscate( isset( $settings[ $provider . '_key' ] ) ? $settings[ $provider . '_key' ] : '' );
	}

	/**
	 * Whether a provider is usable.
	 *
	 * @param string|null $provider Provider id, or null for all three.
	 * @return bool|array<string,bool>
	 */
	public static function provider_status( $provider = null ) {
		if ( null === $provider ) {
			$all = array();
			foreach ( array( 'gemini', 'openai', 'anthropic' ) as $p ) {
				$all[ $p ] = self::provider_status( $p );
			}
			return $all;
		}

		return '' !== self::get_api_key( $provider );
	}

	/**
	 * Current-month AI usage record.
	 *
	 * @return array{cost:float,calls:int,byProvider:array}
	 */
	public static function usage_this_month() {
		$out   = array(
			'cost'       => 0.0,
			'calls'      => 0,
			'byProvider' => array(),
		);
		$month = gmdate( 'Y-m' );
		foreach ( self::usage_log() as $day => $slots ) {
			if ( 0 !== strpos( $day, $month ) ) {
				continue;
			}
			foreach ( $slots as $entry ) {
				$provider = (string) ( $entry['provider'] ?? '' );
				$out['cost']  += (float) ( $entry['cost'] ?? 0 );
				$out['calls'] += (int) ( $entry['calls'] ?? 0 );
				if ( ! isset( $out['byProvider'][ $provider ] ) ) {
					$out['byProvider'][ $provider ] = array(
						'cost'  => 0.0,
						'calls' => 0,
					);
				}
				$out['byProvider'][ $provider ]['cost']  += (float) ( $entry['cost'] ?? 0 );
				$out['byProvider'][ $provider ]['calls'] += (int) ( $entry['calls'] ?? 0 );
			}
		}
		$out['cost'] = round( $out['cost'], 4 );
		return $out;
	}

	/**
	 * The daily AI usage log (v1.73): day → slot-key → aggregated entry.
	 *
	 * @return array Log.
	 */
	public static function usage_log() {
		$log = get_option( 'wpie_ai_usage_log', array() );
		return is_array( $log ) ? $log : array();
	}

	/**
	 * Record one finished AI call with its REAL usage (v1.73): tokens for
	 * text models, image counts for image models, cost from the user's
	 * configured prices. Aggregated per day + provider/action/model;
	 * pruned after ~3 months.
	 *
	 * @param string $provider Provider id.
	 * @param string $action   Action or text tier.
	 * @param string $model    Model id used.
	 * @param array  $usage    { in, out, images } counts.
	 * @param float  $cost     Cost in USD.
	 */
	public static function log_ai_usage( $provider, $action, $model, $usage, $cost ) {
		$log = self::usage_log();
		$day = gmdate( 'Y-m-d' );
		$key = $provider . ':' . $action . ':' . $model;
		if ( ! isset( $log[ $day ] ) || ! is_array( $log[ $day ] ) ) {
			$log[ $day ] = array();
		}
		if ( ! isset( $log[ $day ][ $key ] ) ) {
			$log[ $day ][ $key ] = array(
				'provider' => $provider,
				'action'   => $action,
				'model'    => $model,
				'calls'    => 0,
				'images'   => 0,
				'in'       => 0,
				'out'      => 0,
				'cost'     => 0.0,
			);
		}
		$row            = &$log[ $day ][ $key ];
		$row['calls']  += 1;
		$row['images'] += (int) ( $usage['images'] ?? 0 );
		$row['in']     += (int) ( $usage['in'] ?? 0 );
		$row['out']    += (int) ( $usage['out'] ?? 0 );
		$row['cost']    = round( (float) $row['cost'] + (float) $cost, 6 );
		unset( $row );

		// Prune anything older than ~3 months.
		$cutoff = gmdate( 'Y-m-d', time() - 92 * DAY_IN_SECONDS );
		foreach ( array_keys( $log ) as $d ) {
			if ( $d < $cutoff ) {
				unset( $log[ $d ] );
			}
		}
		update_option( 'wpie_ai_usage_log', $log, false );
	}
}
