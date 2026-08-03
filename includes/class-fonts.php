<?php
/**
 * Font sources (v1.136.0). Three tiers:
 *  1. Built-in: the self-hosted families that ship with the plugin,
 *    always on, no external request.
 *  2. Google Fonts CDN: explicit admin OPT-IN (loads css from
 *     fonts.googleapis.com while editing, which transmits editor users'
 *     IP addresses to Google - the settings page says so plainly).
 *  3. Custom fonts: uploaded woff2/woff/ttf/otf files served from this
 *     site's uploads (wpie-fonts/), for house fonts that exist nowhere
 *     else. Their @font-face rules are attached to the editor page.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Custom font storage + REST + @font-face output.
 */
class Fonts {

	const ALLOWED = array(
		'woff2' => 'woff2',
		'woff'  => 'woff',
		'ttf'   => 'truetype',
		'otf'   => 'opentype',
	);

	/**
	 * Font library download (v1.316): the plugin bundles only 10 families
	 * (see assets/fonts-manifest.json). The remaining catalog families are
	 * fetched here server-side from Google Fonts into wpie-fonts/library/ so
	 * they end up fully local (only the SERVER touches Google, never the
	 * editor's browser). One-time, batched, resumable.
	 */
	const LIBRARY_BATCH = 12;

	/**
	 * Chrome UA so the css2 API returns woff2 (older UAs get ttf).
	 */
	const LIBRARY_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

	/**
	 * Register hooks.
	 */
	public function hooks() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	/**
	 * Fonts directory (created on demand).
	 *
	 * @return string
	 */
	public static function dir() {
		$up = wp_upload_dir();
		return trailingslashit( $up['basedir'] ) . 'wpie-fonts';
	}

	/**
	 * Public URL of the fonts directory.
	 *
	 * @return string
	 */
	public static function url() {
		$up = wp_upload_dir();
		return trailingslashit( $up['baseurl'] ) . 'wpie-fonts';
	}

	/**
	 * Stored custom fonts.
	 *
	 * @param array|null $settings Plugin settings.
	 * @return array[] [{id, family, file, format}]
	 */
	public static function custom_fonts( $settings = null ) {
		$settings = null === $settings ? Helpers::get_settings() : $settings;
		$fonts    = isset( $settings['custom_fonts'] ) ? $settings['custom_fonts'] : array();
		return is_array( $fonts ) ? array_values( $fonts ) : array();
	}

	/**
	 * Custom fonts mapped for the editor client.
	 *
	 * @param array|null $settings Plugin settings.
	 * @return array[] [{family}]
	 */
	public static function client_fonts( $settings = null ) {
		$out = array();
		foreach ( self::custom_fonts( $settings ) as $font ) {
			$out[] = array( 'family' => (string) $font['family'] );
		}
		return $out;
	}

	/**
	 * The @font-face rules for every custom font (attached to the editor
	 * page style, so canvas text can load the faces).
	 *
	 * @return string CSS.
	 */
	public static function font_face_css() {
		$css = '';
		foreach ( self::custom_fonts() as $font ) {
			$url    = self::url() . '/' . rawurlencode( (string) $font['file'] );
			$format = (string) ( $font['format'] ?? 'woff2' );
			$css   .= sprintf(
				"@font-face{font-family:\"%s\";src:url(\"%s\") format(\"%s\");font-weight:100 900;font-display:swap;}\n",
				esc_attr( (string) $font['family'] ),
				esc_url( $url ),
				esc_attr( $format )
			);
		}
		return $css;
	}

	/* ------------------------ font library (v1.316) ------------------------ */

	/**
	 * The bundled/catalog manifest emitted by tools/build-fonts.js.
	 *
	 * @return array{shipped:string[],catalog:array<string,int[]>}
	 */
	public static function manifest() {
		static $cache = null;
		if ( null !== $cache ) {
			return $cache;
		}
		$cache = array(
			'shipped' => array(),
			'catalog' => array(),
		);
		$path = WPIE_DIR . 'assets/fonts-manifest.json';
		if ( is_file( $path ) ) {
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
			$data = json_decode( (string) file_get_contents( $path ), true );
			if ( is_array( $data ) ) {
				$cache['shipped'] = isset( $data['shipped'] ) ? array_values( (array) $data['shipped'] ) : array();
				$cache['catalog'] = isset( $data['catalog'] ) && is_array( $data['catalog'] ) ? $data['catalog'] : array();
			}
		}
		return $cache;
	}

	/**
	 * Catalog families that are NOT bundled (the download target set).
	 *
	 * @return string[]
	 */
	public static function library_target() {
		$m       = self::manifest();
		$shipped = $m['shipped'];
		$out     = array();
		foreach ( array_keys( $m['catalog'] ) as $family ) {
			if ( ! in_array( $family, $shipped, true ) ) {
				$out[] = (string) $family;
			}
		}
		return $out;
	}

	/**
	 * Families the admin has downloaded to the local library.
	 *
	 * @param array|null $settings Plugin settings.
	 * @return string[]
	 */
	public static function downloaded_families( $settings = null ) {
		$settings = null === $settings ? Helpers::get_settings() : $settings;
		$done     = isset( $settings['downloaded_fonts'] ) ? $settings['downloaded_fonts'] : array();
		return is_array( $done ) ? array_values( array_map( 'strval', $done ) ) : array();
	}

	/**
	 * Family name to file slug (mirrors tools/build-fonts.js slugOf).
	 *
	 * @param string $family Family name.
	 * @return string
	 */
	public static function slug_of( $family ) {
		$slug = strtolower( (string) $family );
		$slug = preg_replace( '/[^a-z0-9]+/', '-', $slug );
		return trim( (string) $slug, '-' );
	}

	/** Local font library directory. */
	public static function library_dir() {
		return self::dir() . '/library';
	}

	/** Public URL of the local font library directory. */
	public static function library_url() {
		return self::url() . '/library';
	}

	/** Path of the generated library stylesheet. */
	public static function library_css_path() {
		return self::dir() . '/library.css';
	}

	/**
	 * Public URL of the library stylesheet, or '' when none exists.
	 *
	 * @return string
	 */
	public static function library_css_url() {
		return is_file( self::library_css_path() ) ? self::url() . '/library.css' : '';
	}

	/**
	 * The generated @font-face rules for downloaded families, inlined onto the
	 * editor/render font handle like the custom fonts are.
	 *
	 * The file stores its src RELATIVE so it survives being copied to another
	 * install; this resolves it against the CURRENT site on the way out. Both
	 * halves are needed and neither works alone (v1.349.1):
	 *
	 *   - stored absolute, it breaks the moment the file moves. That is how
	 *     410 faces ended up pointing at the development host after the
	 *     migration, refused by CORS with the files sitting right there.
	 *   - kept relative here, it breaks too, because wp_add_inline_style()
	 *     puts this into the PAGE. Relative urls in inline css resolve
	 *     against the document, so every face became /wp-admin/library/x.woff2.
	 *
	 * The rewrite matches any src ending in library/<file>, so a stylesheet
	 * written by an older version - absolute, possibly with a stale host -
	 * is healed on read as well.
	 *
	 * @return string CSS.
	 */
	public static function library_face_css() {
		$path = self::library_css_path();
		if ( ! is_file( $path ) ) {
			return '';
		}
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
		$css = (string) file_get_contents( $path );
		return (string) preg_replace(
			'#url\(\s*[\'"]?(?:[^)\'"]*/)?library/([^)\'"/]+)[\'"]?\s*\)#i',
			'url(' . self::library_url() . '/$1)',
			$css
		);
	}

	/**
	 * Download one family's latin faces from Google and return the local
	 * @font-face CSS (with src rewritten to the uploaded copies).
	 *
	 * @param string $family  Family name.
	 * @param int[]  $weights Weights to request.
	 * @return string|\WP_Error CSS on success.
	 */
	public static function download_family( $family, $weights ) {
		$weights = array_values( array_unique( array_map( 'intval', (array) $weights ) ) );
		sort( $weights );
		if ( empty( $weights ) ) {
			$weights = array( 400 );
		}
		$url = 'https://fonts.googleapis.com/css2?family='
			. str_replace( '%20', '+', rawurlencode( (string) $family ) )
			. ':wght@' . implode( ';', $weights ) . '&display=swap';

		$res = wp_remote_get(
			$url,
			array(
				'timeout' => 20,
				'headers' => array( 'user-agent' => self::LIBRARY_UA ),
			)
		);
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		if ( 200 !== (int) wp_remote_retrieve_response_code( $res ) ) {
			return new \WP_Error(
				'wpie_font_css',
				sprintf( 'Google Fonts returned %d for %s.', (int) wp_remote_retrieve_response_code( $res ), $family )
			);
		}
		$css = (string) wp_remote_retrieve_body( $res );

		Helpers::protect_dir( self::dir() ); // (F-L61)
		if ( ! wp_mkdir_p( self::library_dir() ) ) {
			return new \WP_Error( 'wpie_font_dir', __( 'Could not create the font library folder.', 'wunderpaint' ) );
		}

		$slug = self::slug_of( $family );
		$out  = '';
		// css2 groups @font-face blocks by subset, each preceded by a
		// /* subset */ comment. Keep only latin (matches the bundled faces
		// and keeps the download small).
		if ( preg_match_all( '#/\*\s*([a-z0-9-]+)\s*\*/\s*(@font-face\s*\{[^}]*\})#i', $css, $matches, PREG_SET_ORDER ) ) {
			foreach ( $matches as $pair ) {
				if ( 'latin' !== strtolower( $pair[1] ) ) {
					continue;
				}
				$block = $pair[2];
				if ( ! preg_match( '#src:\s*url\((https://fonts\.gstatic\.com/[^)]+\.woff2)\)#i', $block, $um ) ) {
					continue;
				}
				$bin = wp_remote_get(
					$um[1],
					array(
						'timeout' => 20,
						'headers' => array( 'user-agent' => self::LIBRARY_UA ),
					)
				);
				if ( is_wp_error( $bin ) || 200 !== (int) wp_remote_retrieve_response_code( $bin ) ) {
					continue;
				}
				$body = wp_remote_retrieve_body( $bin );
				if ( '' === $body ) {
					continue;
				}
				$weight = preg_match( '#font-weight:\s*(\d+)#i', $block, $wm ) ? (int) $wm[1] : 400;
				$file   = $slug . '-' . $weight . '.woff2';
				// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
				if ( false === file_put_contents( self::library_dir() . '/' . $file, $body ) ) {
					continue;
				}
				/*
				 * RELATIVE on disk (v1.349.0), absolute at read time - see
				 * library_face_css(). The file lives in uploads/ and uploads
				 * get copied between installs, so a stored host is a stored
				 * mistake: after the migration to production every face still
				 * pointed at the development host and CORS refused them all.
				 * Storing it relative and resolving on read fixes that
				 * without breaking the inline-style consumer.
				 */
				$block = preg_replace(
					'#src:\s*url\([^)]+\)#i',
					'src: url(library/' . $file . ')',
					$block,
					1
				);
				$out .= $block . "\n";
			}
		}
		if ( '' === $out ) {
			return new \WP_Error( 'wpie_font_empty', sprintf( 'No latin faces found for %s.', $family ) );
		}
		return $out;
	}

	/**
	 * Append generated @font-face CSS to the library stylesheet.
	 *
	 * @param string $css CSS to append.
	 */
	protected static function append_library_css( $css ) {
		$path = self::library_css_path();
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
		$prev = is_file( $path ) ? (string) file_get_contents( $path ) : '';
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		file_put_contents( $path, $prev . $css );
	}

	/**
	 * Remove the entire local font library (files, stylesheet, setting).
	 */
	public static function clear_library() {
		$dir = self::library_dir();
		if ( is_dir( $dir ) ) {
			foreach ( (array) glob( $dir . '/*.woff2' ) as $file ) {
				wp_delete_file( $file );
			}
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_rmdir
			@rmdir( $dir );
		}
		if ( is_file( self::library_css_path() ) ) {
			wp_delete_file( self::library_css_path() );
		}
		$settings = get_option( WPIE_OPTION, array() );
		$settings = is_array( $settings ) ? $settings : array();
		$settings['downloaded_fonts'] = array();
		update_option( WPIE_OPTION, $settings );
	}

	/**
	 * REST routes (site-wide config, manage_options).
	 */
	public function register_routes() {
		register_rest_route(
			WPIE_REST_NS,
			'/fonts',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( $this, 'rest_list' ),
					'permission_callback' => array( ML_Models::class, 'can_manage' ),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'rest_upload' ),
					'permission_callback' => array( ML_Models::class, 'can_manage' ),
				),
			)
		);
		register_rest_route(
			WPIE_REST_NS,
			'/fonts/library',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( $this, 'rest_library_status' ),
					'permission_callback' => array( ML_Models::class, 'can_manage' ),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'rest_library_download' ),
					'permission_callback' => array( ML_Models::class, 'can_manage' ),
				),
				array(
					'methods'             => 'DELETE',
					'callback'            => array( $this, 'rest_library_delete' ),
					'permission_callback' => array( ML_Models::class, 'can_manage' ),
				),
			)
		);
		register_rest_route(
			WPIE_REST_NS,
			'/fonts/choice',
			array(
				'methods'             => 'POST',
				'callback'            => array( $this, 'rest_choice' ),
				'permission_callback' => array( ML_Models::class, 'can_manage' ),
			)
		);
		register_rest_route(
			WPIE_REST_NS,
			'/fonts/(?P<id>[a-z0-9-]+)',
			array(
				'methods'             => 'DELETE',
				'callback'            => array( $this, 'rest_delete' ),
				'permission_callback' => array( ML_Models::class, 'can_manage' ),
			)
		);
	}

	/**
	 * Progress of the local font library.
	 *
	 * @param array $done Optional already-computed downloaded list.
	 * @return array
	 */
	protected function library_progress( $done = null ) {
		$target = self::library_target();
		$done   = null === $done ? self::downloaded_families() : $done;
		// Only count families that are actually part of the target set.
		$done   = array_values( array_intersect( $done, $target ) );
		return array(
			'downloaded' => $done,
			'total'      => count( $target ),
			'remaining'  => count( array_diff( $target, $done ) ),
			'cssUrl'     => self::library_css_url(),
			'done'       => count( array_diff( $target, $done ) ) === 0,
		);
	}

	/**
	 * GET /fonts/library: download progress.
	 *
	 * @return array
	 */
	public function rest_library_status() {
		return $this->library_progress();
	}

	/**
	 * POST /fonts/library: download the next batch of catalog families.
	 *
	 * @return array
	 */
	public function rest_library_download() {
		$settings = get_option( WPIE_OPTION, array() );
		$settings = is_array( $settings ) ? $settings : array();
		$catalog  = self::manifest()['catalog'];
		$target   = self::library_target();
		$done      = array_values( array_intersect( self::downloaded_families( $settings ), $target ) );
		$pending   = array_values( array_diff( $target, $done ) );
		$batch     = array_slice( $pending, 0, self::LIBRARY_BATCH );

		$css_add = '';
		$failed  = array();
		foreach ( $batch as $family ) {
			$weights = isset( $catalog[ $family ] ) ? $catalog[ $family ] : array( 400 );
			$face    = self::download_family( $family, $weights );
			if ( is_wp_error( $face ) ) {
				$failed[] = $family;
				continue;
			}
			$css_add .= $face;
			$done[]   = $family;
		}
		if ( '' !== $css_add ) {
			self::append_library_css( $css_add );
		}

		$settings['downloaded_fonts'] = array_values( array_unique( $done ) );
		// A completed download means the "keep it local" choice is made.
		$settings['fonts_choice'] = 'download';
		update_option( WPIE_OPTION, $settings );

		$progress             = $this->library_progress( $settings['downloaded_fonts'] );
		$progress['failed']   = $failed;
		$progress['batch']    = count( $batch );
		return $progress;
	}

	/**
	 * DELETE /fonts/library: remove the whole local library.
	 *
	 * @return array
	 */
	public function rest_library_delete() {
		self::clear_library();
		return $this->library_progress( array() );
	}

	/**
	 * POST /fonts/choice: record the one-time font source choice.
	 *
	 * @param \WP_REST_Request $req Request.
	 * @return array|\WP_Error
	 */
	public function rest_choice( \WP_REST_Request $req ) {
		$choice = sanitize_key( (string) $req->get_param( 'choice' ) );
		if ( ! in_array( $choice, array( 'download', 'google', 'skip' ), true ) ) {
			return new \WP_Error( 'wpie_font_choice', __( 'Unknown font choice.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		$settings = get_option( WPIE_OPTION, array() );
		$settings = is_array( $settings ) ? $settings : array();
		$settings['fonts_choice'] = $choice;
		$settings['fonts_google'] = ( 'google' === $choice );
		update_option( WPIE_OPTION, $settings );
		return array(
			'choice'      => $choice,
			'fontsGoogle' => ( 'google' === $choice ),
		);
	}

	/**
	 * GET /fonts.
	 *
	 * @return array
	 */
	public function rest_list() {
		return array( 'fonts' => self::custom_fonts() );
	}

	/**
	 * POST /fonts: multipart upload of one font file + family name.
	 *
	 * @param \WP_REST_Request $req Request.
	 * @return array|\WP_Error
	 */
	public function rest_upload( \WP_REST_Request $req ) {
		$files = $req->get_file_params();
		$file  = isset( $files['file'] ) ? $files['file'] : null;
		if ( ! $file || ! empty( $file['error'] ) || empty( $file['tmp_name'] ) ) {
			return new \WP_Error( 'wpie_font_upload', __( 'Upload failed.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		$ext = strtolower( (string) pathinfo( (string) $file['name'], PATHINFO_EXTENSION ) );
		if ( ! isset( self::ALLOWED[ $ext ] ) ) {
			return new \WP_Error( 'wpie_font_type', __( 'Only woff2, woff, ttf and otf files are supported.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		if ( (int) $file['size'] > 8 * MB_IN_BYTES ) {
			return new \WP_Error( 'wpie_font_size', __( 'Font file too large (8 MB max).', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		// Validate by content, not just the extension: the first four bytes
		// must be a real font signature for the declared type.
		$magic  = (string) file_get_contents( $file['tmp_name'], false, null, 0, 4 ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
		$sig_ok = array(
			'woff2' => array( 'wOF2' ),
			'woff'  => array( 'wOFF' ),
			'ttf'   => array( "\x00\x01\x00\x00", 'true', 'ttcf' ),
			'otf'   => array( 'OTTO', "\x00\x01\x00\x00" ),
		);
		if ( empty( $sig_ok[ $ext ] ) || ! in_array( $magic, $sig_ok[ $ext ], true ) ) {
			return new \WP_Error( 'wpie_font_type', __( 'That file does not look like a valid font file.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		$family = sanitize_text_field( (string) $req->get_param( 'family' ) );
		if ( '' === $family ) {
			// Derive a readable family from the filename.
			$family = ucwords( trim( preg_replace( '/[-_]+/', ' ', (string) pathinfo( (string) $file['name'], PATHINFO_FILENAME ) ) ) );
		}

		if ( ! wp_mkdir_p( self::dir() ) ) {
			return new \WP_Error( 'wpie_font_dir', __( 'Could not create the fonts folder.', 'wunderpaint' ), array( 'status' => 500 ) );
		}
		Helpers::protect_dir( self::dir() ); // (F-L61)
		$id       = 'font-' . substr( md5( $family . microtime() ), 0, 8 );
		$filename = $id . '-' . sanitize_file_name( (string) $file['name'] );
		$dest     = self::dir() . '/' . $filename;
		require_once ABSPATH . 'wp-admin/includes/file.php';
		global $wp_filesystem;
		if ( ! WP_Filesystem() ) {
			return new \WP_Error( 'wpie_font_fs', __( 'Could not access the filesystem to store the font.', 'wunderpaint' ), array( 'status' => 500 ) );
		}
		// The upload was validated above (extension, size, font magic bytes).
		// Store it via WP's filesystem API instead of move_uploaded_file(),
		// which wordpress.org does not allow.
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- reading the validated upload temp file.
		$bytes = file_get_contents( $file['tmp_name'] );
		if ( false === $bytes || ! $wp_filesystem->put_contents( $dest, $bytes, defined( 'FS_CHMOD_FILE' ) ? FS_CHMOD_FILE : false ) ) {
			return new \WP_Error( 'wpie_font_move', __( 'Could not store the font file.', 'wunderpaint' ), array( 'status' => 500 ) );
		}

		$settings = get_option( WPIE_OPTION, array() );
		$settings = is_array( $settings ) ? $settings : array();
		$fonts    = isset( $settings['custom_fonts'] ) && is_array( $settings['custom_fonts'] ) ? $settings['custom_fonts'] : array();
		$fonts[]  = array(
			'id'     => $id,
			'family' => $family,
			'file'   => $filename,
			'format' => self::ALLOWED[ $ext ],
		);
		$settings['custom_fonts'] = array_values( $fonts );
		update_option( WPIE_OPTION, $settings );

		return array( 'fonts' => $settings['custom_fonts'] );
	}

	/**
	 * DELETE /fonts/{id}.
	 *
	 * @param \WP_REST_Request $req Request.
	 * @return array
	 */
	public function rest_delete( \WP_REST_Request $req ) {
		$id       = sanitize_key( (string) $req['id'] );
		$settings = get_option( WPIE_OPTION, array() );
		$settings = is_array( $settings ) ? $settings : array();
		$fonts    = isset( $settings['custom_fonts'] ) && is_array( $settings['custom_fonts'] ) ? $settings['custom_fonts'] : array();
		$keep     = array();
		foreach ( $fonts as $font ) {
			if ( ( $font['id'] ?? '' ) === $id ) {
				$path = self::dir() . '/' . (string) ( $font['file'] ?? '' );
				if ( is_file( $path ) ) {
					wp_delete_file( $path );
				}
				continue;
			}
			$keep[] = $font;
		}
		$settings['custom_fonts'] = array_values( $keep );
		update_option( WPIE_OPTION, $settings );
		return array( 'fonts' => $settings['custom_fonts'] );
	}
}
