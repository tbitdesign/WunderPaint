<?php
/**
 * In-editor extension packages (v1.119): ZIP archives with a manifest.json
 * and a JS entry file, installed through the editor's Extensions manager.
 * They live in uploads/wpie-extensions/<slug>/ - no entry in the WordPress
 * plugin list, loaded only on the editor page, and strictly code-on-the-
 * client: the archive may not contain PHP, so an extension can never run
 * server-side code.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Storage, validation, REST routes and enqueueing.
 */
class Extensions {

	const OPTION_DISABLED = 'wpie_extensions_disabled';
	// Mirror of API_VERSION in src/lib/extensions.js (the enqueue gate
	// runs server-side); tests/php/extensions.php asserts they never
	// drift.
	const API_VERSION = '2.12.0';
	const MAX_ZIP_BYTES   = 41943040; // 40 MB (compressed upload).
	const MAX_FILES       = 400;
	// Decompression guards (a 40 MB ZIP of highly compressible data could
	// otherwise inflate to gigabytes and exhaust RAM/disk - "zip bomb").
	const MAX_FILE_BYTES         = 52428800;  // 50 MB per extracted file.
	const MAX_UNCOMPRESSED_BYTES = 209715200; // 200 MB per package.

	/**
	 * File extensions an extension package may contain. Never PHP or other
	 * server-executed types; the JS entry is admin-installed code by design
	 * (gated behind manage_options and DISALLOW_FILE_MODS).
	 *
	 * @var string[]
	 */
	const ALLOWED_EXT = array(
		'js', 'mjs', 'json', 'css', 'map',
		'svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif',
		'woff', 'woff2', 'ttf', 'otf',
		'md', 'txt', 'glb', 'gltf', 'bin', 'hdr', 'onnx',
	);

	/**
	 * Register hooks.
	 */
	public function hooks() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
		// After the core bundle (priority 20): scripts depend on wpie-editor.
		add_action( 'wpie_editor_assets', array( $this, 'enqueue_extensions' ), 20 );
		add_filter( 'wpie_bootstrap_data', array( $this, 'bootstrap_data' ) );
	}

	/**
	 * Base directory (created on demand, with an index.php guard).
	 *
	 * @return string Trailing-slashed absolute path.
	 */
	public static function dir() {
		$uploads = wp_upload_dir();
		$dir     = trailingslashit( $uploads['basedir'] ) . 'wpie-extensions/';
		if ( ! is_dir( $dir ) ) {
			wp_mkdir_p( $dir );
			@file_put_contents( $dir . 'index.php', "<?php // Silence is golden.\n" ); // phpcs:ignore
		}
		// Cheap (one file_exists) and must also cover directories that already
		// existed before this hardening shipped. (F-L61)
		Helpers::protect_dir( $dir );
		return $dir;
	}

	/**
	 * Base URL matching dir().
	 *
	 * @return string Trailing-slashed URL.
	 */
	public static function url() {
		$uploads = wp_upload_dir();
		return trailingslashit( $uploads['baseurl'] ) . 'wpie-extensions/';
	}

	/**
	 * Whether the current user may install/manage extension packages.
	 * DISALLOW_FILE_MODS is the WordPress-wide "no code installs" switch
	 * and blocks the manager entirely.
	 *
	 * @return bool
	 */
	public static function can_manage() {
		if ( defined( 'DISALLOW_FILE_MODS' ) && DISALLOW_FILE_MODS ) {
			return false;
		}
		return current_user_can( 'manage_options' );
	}

	/**
	 * Installed packages: scan the directory for valid manifests.
	 *
	 * @return array[] List of package descriptors (see describe()).
	 */
	public static function all() {
		$list = array();
		$dirs = glob( self::dir() . '*', GLOB_ONLYDIR );
		foreach ( is_array( $dirs ) ? $dirs : array() as $path ) {
			$item = self::describe( basename( $path ) );
			if ( $item ) {
				$list[] = $item;
			}
		}
		usort(
			$list,
			function ( $a, $b ) {
				return strcasecmp( $a['name'], $b['name'] );
			}
		);
		return $list;
	}

	/**
	 * Package descriptor from its manifest, or null when invalid.
	 *
	 * @param string $slug Directory name.
	 * @return array|null
	 */
	public static function describe( $slug ) {
		$slug = sanitize_key( $slug );
		$base = self::dir() . $slug . '/';
		$raw  = is_readable( $base . 'manifest.json' ) ? file_get_contents( $base . 'manifest.json' ) : false; // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
		if ( false === $raw ) {
			return null;
		}
		$manifest = json_decode( $raw, true );
		if ( ! is_array( $manifest ) || empty( $manifest['name'] ) || empty( $manifest['main'] ) ) {
			return null;
		}
		$main = self::safe_relative( (string) $manifest['main'] );
		if ( ! $main || ! file_exists( $base . $main ) ) {
			return null;
		}
		$style    = isset( $manifest['style'] ) ? self::safe_relative( (string) $manifest['style'] ) : '';
		$disabled = get_option( self::OPTION_DISABLED, array() );
		return array(
			'slug'        => $slug,
			'name'        => sanitize_text_field( (string) $manifest['name'] ),
			'version'     => sanitize_text_field( (string) ( isset( $manifest['version'] ) ? $manifest['version'] : '1.0.0' ) ),
			'author'      => sanitize_text_field( (string) ( isset( $manifest['author'] ) ? $manifest['author'] : '' ) ),
			'description' => sanitize_text_field( (string) ( isset( $manifest['description'] ) ? $manifest['description'] : '' ) ),
			'homepage'    => isset( $manifest['homepage'] ) ? esc_url_raw( (string) $manifest['homepage'] ) : '',
			'provides'    => array_values( array_filter( array_map( 'sanitize_key', (array) ( isset( $manifest['provides'] ) ? $manifest['provides'] : array() ) ) ) ),
			'requiresApi' => sanitize_text_field( (string) ( isset( $manifest['requiresApi'] ) ? $manifest['requiresApi'] : '' ) ),
			'apiBlocked'  => ! self::api_satisfied( (string) ( isset( $manifest['requiresApi'] ) ? $manifest['requiresApi'] : '' ) ),
			'main'        => self::url() . $slug . '/' . $main,
			'style'       => $style && file_exists( $base . $style ) ? self::url() . $slug . '/' . $style : '',
			'enabled'     => ! in_array( $slug, is_array( $disabled ) ? $disabled : array(), true ),
			// Curated menu category (v1.310): one slug from the host-owned
			// vocabulary; the client validates and falls back to 'other'.
			'category'    => isset( $manifest['category'] ) ? sanitize_key( (string) $manifest['category'] ) : '',
			// Historic generator namespaces that differ from the package
			// slug (they live in saved documents and must never change) -
			// lets the menu still attribute those generators (v1.310).
			'generatorPrefixes' => array_values( array_filter( array_map( 'sanitize_key', isset( $manifest['generatorPrefixes'] ) && is_array( $manifest['generatorPrefixes'] ) ? $manifest['generatorPrefixes'] : array() ) ) ),
		);
	}

	/**
	 * Neutralize active content in an SVG asset: script/foreignObject/handler
	 * elements, on* event handlers and non-inline URL references. Valid,
	 * inert vector art passes through unchanged (the fast path returns the
	 * original bytes untouched, so gradients, filters and paths are never
	 * reformatted). Only SVGs that actually carry a dangerous token are
	 * parsed and rewritten.
	 *
	 * @param string $svg Raw SVG markup.
	 * @return string Sanitized markup.
	 */
	private static function sanitize_svg( $svg ) {
		$svg = (string) $svg;
		// Fast path: nothing that could execute → leave the bytes as they are.
		// The danger check runs against an entity-DECODED copy so a token
		// smuggled through character references (e.g. `javascript&#58;`,
		// `<set attributeName="&#111;nload">`) can no longer slip past the fast
		// path and skip the DOM scrub. The decoded copy is only for detection;
		// the original bytes are what pass through when the art is inert.
		// SMIL animators are included so a `<set>`/`<animate>` retargeting an
		// event handler is always parsed and inspected below. (WPIE-022)
		$probe = html_entity_decode( $svg, ENT_QUOTES | ENT_HTML5 );
		if ( ! preg_match( '/<script|<foreignObject|<handler|<iframe|<embed\b|<object\b|<animate|<set\b|<mpath\b|<discard\b|\son\w+\s*=|javascript:|data:text\/html/i', $probe ) ) {
			return $svg;
		}
		if ( ! class_exists( '\DOMDocument' ) ) {
			// Best-effort textual neutralization when DOM is unavailable.
			$svg = preg_replace( '#<script\b[^>]*>.*?</script\s*>#is', '', (string) $svg );
			$svg = preg_replace( '#<(foreignObject|handler|iframe|object|embed)\b[^>]*>.*?</\1\s*>#is', '', (string) $svg );
			$svg = preg_replace( '#<(animate|animateTransform|animateMotion|set|mpath|discard)\b[^>]*/?>#is', '', (string) $svg );
			$svg = preg_replace( '/\son\w+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)/i', '', (string) $svg );
			$svg = preg_replace( '/javascript:/i', '#', (string) $svg );
			return (string) $svg;
		}

		$prev = libxml_use_internal_errors( true );
		$dom  = new \DOMDocument();
		// LIBXML_NONET blocks network fetches; PHP 8 does not resolve
		// external entities by default (no XXE).
		$ok = $dom->loadXML( $svg, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING );
		if ( ! $ok || ! $dom->documentElement ) {
			libxml_clear_errors();
			libxml_use_internal_errors( $prev );
			// Unparseable but flagged dangerous → drop the risky markup wholesale.
			return '';
		}

		$remove = array( 'script', 'foreignobject', 'handler', 'iframe', 'object', 'embed', 'mpath', 'discard' );
		$smil   = array( 'animate', 'set', 'animatetransform', 'animatemotion' );
		foreach ( iterator_to_array( $dom->getElementsByTagName( '*' ) ) as $el ) {
			$local = strtolower( $el->localName );
			if ( in_array( $local, $remove, true ) ) {
				if ( $el->parentNode ) {
					$el->parentNode->removeChild( $el );
				}
				continue;
			}
			// SMIL animators that retarget an event handler or a URL/style/class
			// attribute can inject active content the value scrub below would
			// not catch (the target lives in `attributeName`, not the value), so
			// drop those outright while leaving benign geometry/opacity/colour
			// animations intact. (WPIE-022)
			if ( in_array( $local, $smil, true ) ) {
				$target = strtolower( (string) $el->getAttribute( 'attributeName' ) );
				if ( '' !== $target
					&& ( 0 === strpos( $target, 'on' )
						|| in_array( $target, array( 'href', 'xlink:href', 'src', 'class', 'style' ), true ) ) ) {
					if ( $el->parentNode ) {
						$el->parentNode->removeChild( $el );
					}
					continue;
				}
			}
			if ( ! $el->hasAttributes() ) {
				continue;
			}
			foreach ( iterator_to_array( $el->attributes ) as $attr ) {
				$aname = strtolower( $attr->nodeName );
				$val   = (string) $attr->nodeValue;
				$clean = strtolower( preg_replace( '/\s+/', '', $val ) );
				// Event handlers, and any attribute smuggling an active URL
				// (covers SMIL `<animate to="javascript:…">` too, not just
				// href/src).
				if ( 0 === strpos( $aname, 'on' )
					|| false !== strpos( $clean, 'javascript:' )
					|| false !== strpos( $clean, 'data:text/html' ) ) {
					$el->removeAttributeNode( $attr );
					continue;
				}
				if ( in_array( $aname, array( 'href', 'xlink:href', 'src' ), true ) ) {
					$safe = '' === $val
						|| '#' === substr( $val, 0, 1 )
						|| 0 === strpos( $clean, 'data:image/' );
					if ( ! $safe ) {
						$el->removeAttributeNode( $attr );
					}
				}
			}
		}

		$out = $dom->saveXML( $dom->documentElement );
		libxml_clear_errors();
		libxml_use_internal_errors( $prev );
		return false === $out ? '' : $out;
	}

	/**
	 * Validate a manifest-relative file path (no traversal, no absolutes).
	 *
	 * @param string $rel Relative path from the manifest.
	 * @return string Sanitized path or '' when unsafe.
	 */
	private static function safe_relative( $rel ) {
		$rel = ltrim( str_replace( '\\', '/', $rel ), '/' );
		if ( '' === $rel || false !== strpos( $rel, '..' ) || preg_match( '/^[a-z]+:/i', $rel ) ) {
			return '';
		}
		return $rel;
	}

	/**
	 * Enqueue every enabled package on the editor page.
	 */
	/**
	 * Whether this editor satisfies a package's requiresApi (v1.273.1).
	 * Empty means any; malformed values block, which is the safe direction.
	 * A differing MAJOR blocks too (v1.335) - see below.
	 *
	 * @param string $requires Required API semver from the manifest.
	 * @return bool Satisfied.
	 */
	public static function api_satisfied( $requires ) {
		$requires = trim( (string) $requires );
		if ( '' === $requires ) {
			return true;
		}
		if ( ! preg_match( '/^\d+(\.\d+){0,2}$/', $requires ) ) {
			return false;
		}
		/*
		 * Major gate (v1.335), mirror of apiSatisfies() in
		 * src/lib/extensions.js. Plain ">=" let a 3.0.0 editor enqueue every
		 * 2.x package and break it at runtime, so a breaking change could
		 * never be shipped. Both gates must agree: if PHP enqueued a package
		 * the client then refused, the user would get a silent dead bundle
		 * instead of the "needs a newer editor" notice.
		 */
		$mine = explode( '.', self::API_VERSION );
		$want = explode( '.', $requires );
		if ( (int) $mine[0] !== (int) $want[0] ) {
			return false;
		}
		return version_compare( self::API_VERSION, $requires, '>=' );
	}

	public function enqueue_extensions() {
		// The pick-overlay iframe boots only the Media Library Manager;
		// extension bundles (three.js studios and friends, several MB)
		// would just slow that boot down (v1.245.1).
		if ( Editor_Page::pick_context() ) {
			return;
		}
		foreach ( self::all() as $ext ) {
			if ( ! $ext['enabled'] ) {
				continue;
			}
			// Packages built for a NEWER editor stay unloaded instead of
			// crashing at runtime; the manager explains why (v1.273.1).
			if ( ! empty( $ext['apiBlocked'] ) ) {
				continue;
			}
			wp_enqueue_script(
				'wpie-ext-' . $ext['slug'],
				$ext['main'],
				array( 'wpie-editor', 'wp-hooks' ),
				$ext['version'],
				true
			);
			if ( $ext['style'] ) {
				wp_enqueue_style( 'wpie-ext-' . $ext['slug'], $ext['style'], array( 'wpie-editor' ), $ext['version'] );
			}
		}
	}

	/**
	 * Expose the package list (and manage permission) to the editor.
	 *
	 * @param array $data Bootstrap payload.
	 * @return array
	 */
	public function bootstrap_data( $data ) {
		$data['extensions']    = self::all();
		$data['canExtensions'] = self::can_manage();
		return $data;
	}

	/**
	 * REST routes: list, install (ZIP upload), toggle, delete.
	 */
	public function register_routes() {
		$manage = function () {
			if ( ! self::can_manage() ) {
				return new \WP_Error(
					'wpie_forbidden',
					__( 'You are not allowed to manage editor extensions.', 'wunderpaint' ),
					array( 'status' => rest_authorization_required_code() )
				);
			}
			return true;
		};

		register_rest_route(
			WPIE_REST_NS,
			'/extensions',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => function () {
						return self::all();
					},
					'permission_callback' => array( REST_Controller::class, 'can_use_editor' ),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'install' ),
					'permission_callback' => $manage,
				),
			)
		);
		register_rest_route(
			WPIE_REST_NS,
			'/extensions/(?P<slug>[a-z0-9_-]+)',
			array(
				array(
					'methods'             => 'POST',
					'callback'            => array( $this, 'toggle' ),
					'permission_callback' => $manage,
				),
				array(
					'methods'             => 'DELETE',
					'callback'            => array( $this, 'delete' ),
					'permission_callback' => $manage,
				),
			)
		);
	}

	/**
	 * POST /extensions - install (or update) a package from a ZIP upload.
	 *
	 * @param \WP_REST_Request $request Multipart request with a `file`.
	 * @return array|\WP_Error Descriptor of the installed package.
	 */
	public function install( \WP_REST_Request $request ) {
		$files = $request->get_file_params();
		if ( empty( $files['file']['tmp_name'] ) ) {
			return new \WP_Error( 'wpie_no_file', __( 'No extension package was uploaded.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		return self::install_from_path( $files['file']['tmp_name'] );
	}

	/**
	 * Install (or update) an extension from a ZIP file on disk. Shared by the
	 * multipart upload above and the Pro plugin's server-side remote install,
	 * so every install path runs the same validation and extraction. The
	 * caller owns the temp file; this does not delete it.
	 *
	 * @param string $zip_path Absolute path to a ZIP file.
	 * @return array|\WP_Error Descriptor of the installed package.
	 */
	public static function install_from_path( $zip_path ) {
		if ( ! class_exists( '\ZipArchive' ) ) {
			return new \WP_Error( 'wpie_no_zip', __( 'The server is missing the PHP ZIP module.', 'wunderpaint' ), array( 'status' => 500 ) );
		}
		if ( ! is_file( $zip_path ) || filesize( $zip_path ) > self::MAX_ZIP_BYTES ) {
			return new \WP_Error( 'wpie_too_big', __( 'The package exceeds the 40 MB limit.', 'wunderpaint' ), array( 'status' => 400 ) );
		}

		$zip = new \ZipArchive();
		if ( true !== $zip->open( $zip_path ) ) {
			return new \WP_Error( 'wpie_bad_zip', __( 'The file is not a readable ZIP archive.', 'wunderpaint' ), array( 'status' => 400 ) );
		}

		// Pass 1: validate every entry, find the manifest, detect a single
		// wrapping root folder (GitHub-style archives).
		$entries      = array();
		$manifest     = null;
		$root         = null;
		$uncompressed = 0;
		if ( $zip->numFiles > self::MAX_FILES ) {
			$zip->close();
			return new \WP_Error( 'wpie_too_many', __( 'The package contains too many files.', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		for ( $i = 0; $i < $zip->numFiles; $i++ ) {
			$name = str_replace( '\\', '/', (string) $zip->getNameIndex( $i ) );
			if ( '' === $name || '/' === substr( $name, -1 ) ) {
				continue; // Directory entries.
			}
			if ( 0 === strpos( $name, '__MACOSX/' ) || '.DS_Store' === basename( $name ) ) {
				continue;
			}
			if ( false !== strpos( $name, '..' ) || 0 === strpos( $name, '/' ) ) {
				$zip->close();
				return new \WP_Error( 'wpie_traversal', __( 'The package contains unsafe file paths.', 'wunderpaint' ), array( 'status' => 400 ) );
			}
			$ext = strtolower( pathinfo( $name, PATHINFO_EXTENSION ) );
			if ( ! in_array( $ext, self::ALLOWED_EXT, true ) ) {
				$zip->close();
				return new \WP_Error(
					'wpie_bad_type',
					sprintf(
						/* translators: %s: file name. */
						__( 'The package contains a disallowed file type: %s', 'wunderpaint' ),
						basename( $name )
					),
					array( 'status' => 400 )
				);
			}
			// Decompression bomb guard: reject on the ZIP's own reported
			// uncompressed sizes before extracting a single byte.
			$stat  = $zip->statIndex( $i );
			$usize = is_array( $stat ) && isset( $stat['size'] ) ? (int) $stat['size'] : 0;
			if ( $usize > self::MAX_FILE_BYTES ) {
				$zip->close();
				return new \WP_Error(
					'wpie_file_too_big',
					sprintf(
						/* translators: %s: file name. */
						__( 'A file in the package is too large when unpacked: %s', 'wunderpaint' ),
						basename( $name )
					),
					array( 'status' => 400 )
				);
			}
			$uncompressed += $usize;
			if ( $uncompressed > self::MAX_UNCOMPRESSED_BYTES ) {
				$zip->close();
				return new \WP_Error( 'wpie_bomb', __( 'The package is too large when unpacked.', 'wunderpaint' ), array( 'status' => 400 ) );
			}
			$entries[] = $name;
		}
		// Wrapping folder: every entry under the same first segment AND the
		// manifest not at the top level.
		if ( ! in_array( 'manifest.json', $entries, true ) ) {
			$firsts = array_unique(
				array_map(
					function ( $n ) {
						return strtok( $n, '/' );
					},
					$entries
				)
			);
			if ( 1 === count( $firsts ) && in_array( $firsts[0] . '/manifest.json', $entries, true ) ) {
				$root = $firsts[0] . '/';
			} else {
				$zip->close();
				return new \WP_Error( 'wpie_no_manifest', __( 'The package has no manifest.json at its top level.', 'wunderpaint' ), array( 'status' => 400 ) );
			}
		}

		$manifest_raw = $zip->getFromName( ( $root ? $root : '' ) . 'manifest.json' );
		$manifest     = json_decode( (string) $manifest_raw, true );
		if ( ! is_array( $manifest ) || empty( $manifest['name'] ) || empty( $manifest['main'] ) ) {
			$zip->close();
			return new \WP_Error( 'wpie_bad_manifest', __( 'manifest.json must be valid JSON with at least "name" and "main".', 'wunderpaint' ), array( 'status' => 400 ) );
		}
		$main = self::safe_relative( (string) $manifest['main'] );
		if ( ! $main || ! in_array( ( $root ? $root : '' ) . $main, $entries, true ) ) {
			$zip->close();
			return new \WP_Error( 'wpie_bad_main', __( 'The manifest "main" script is missing from the package.', 'wunderpaint' ), array( 'status' => 400 ) );
		}

		$slug = sanitize_key( ! empty( $manifest['slug'] ) ? $manifest['slug'] : sanitize_title( $manifest['name'] ) );
		if ( '' === $slug ) {
			$zip->close();
			return new \WP_Error( 'wpie_bad_slug', __( 'The package name does not produce a usable slug.', 'wunderpaint' ), array( 'status' => 400 ) );
		}

		// Pass 2: extract into a fresh directory (updates replace whole).
		$target = self::dir() . $slug . '/';
		self::rrmdir( $target );
		wp_mkdir_p( $target );
		foreach ( $entries as $name ) {
			$rel = $root ? substr( $name, strlen( $root ) ) : $name;
			if ( '' === $rel ) {
				continue;
			}
			$dest = $target . $rel;
			wp_mkdir_p( dirname( $dest ) );
			$data = $zip->getFromName( $name );
			if ( false === $data ) {
				continue;
			}
			// SVG assets ship as-is, so neutralize any active content (a
			// booby-trapped SVG opened directly from uploads would otherwise
			// run script in the site origin). Legitimate vector art is left
			// byte-for-byte untouched.
			if ( 'svg' === strtolower( pathinfo( $rel, PATHINFO_EXTENSION ) ) ) {
				$data = self::sanitize_svg( $data );
			}
			file_put_contents( $dest, $data ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		}
		$zip->close();

		// New installs start enabled.
		$disabled = get_option( self::OPTION_DISABLED, array() );
		if ( is_array( $disabled ) && in_array( $slug, $disabled, true ) ) {
			update_option( self::OPTION_DISABLED, array_values( array_diff( $disabled, array( $slug ) ) ) );
		}

		$item = self::describe( $slug );
		if ( ! $item ) {
			self::rrmdir( $target );
			return new \WP_Error( 'wpie_install_failed', __( 'The package could not be installed.', 'wunderpaint' ), array( 'status' => 500 ) );
		}
		return $item;
	}

	/**
	 * POST /extensions/<slug> - { enabled: bool }.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return array|\WP_Error
	 */
	public function toggle( \WP_REST_Request $request ) {
		$slug = sanitize_key( $request['slug'] );
		$item = self::describe( $slug );
		if ( ! $item ) {
			return new \WP_Error( 'wpie_not_found', __( 'Extension not found.', 'wunderpaint' ), array( 'status' => 404 ) );
		}
		$enabled  = rest_sanitize_boolean( $request->get_param( 'enabled' ) );
		$disabled = get_option( self::OPTION_DISABLED, array() );
		$disabled = is_array( $disabled ) ? $disabled : array();
		$disabled = array_values( array_diff( $disabled, array( $slug ) ) );
		if ( ! $enabled ) {
			$disabled[] = $slug;
		}
		update_option( self::OPTION_DISABLED, $disabled );
		$item['enabled'] = $enabled;
		return $item;
	}

	/**
	 * DELETE /extensions/<slug>.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return array|\WP_Error
	 */
	public function delete( \WP_REST_Request $request ) {
		$slug = sanitize_key( $request['slug'] );
		$base = self::dir() . $slug . '/';
		if ( ! is_dir( $base ) ) {
			return new \WP_Error( 'wpie_not_found', __( 'Extension not found.', 'wunderpaint' ), array( 'status' => 404 ) );
		}
		self::rrmdir( $base );
		$disabled = get_option( self::OPTION_DISABLED, array() );
		if ( is_array( $disabled ) && in_array( $slug, $disabled, true ) ) {
			update_option( self::OPTION_DISABLED, array_values( array_diff( $disabled, array( $slug ) ) ) );
		}
		return array( 'deleted' => true );
	}

	/**
	 * Remove one installed package directory (used by delete and by the
	 * Backup module before re-extracting a package from an archive).
	 *
	 * @param string $slug Package slug.
	 */
	public static function remove_package( $slug ) {
		$slug = sanitize_key( $slug );
		if ( $slug ) {
			self::rrmdir( self::dir() . $slug . '/' );
		}
	}

	/**
	 * Recursively delete a directory inside the extensions dir.
	 *
	 * @param string $dir Absolute path.
	 */
	private static function rrmdir( $dir ) {
		$dir = untrailingslashit( $dir );
		// Only ever delete inside our own base directory.
		if ( ! $dir || 0 !== strpos( $dir . '/', self::dir() ) || ! is_dir( $dir ) ) {
			return;
		}
		$items = scandir( $dir );
		foreach ( is_array( $items ) ? $items : array() as $item ) {
			if ( '.' === $item || '..' === $item ) {
				continue;
			}
			$path = $dir . '/' . $item;
			if ( is_dir( $path ) ) {
				self::rrmdir( $path );
			} else {
				wp_delete_file( $path );
			}
		}
		@rmdir( $dir ); // phpcs:ignore
	}

	/**
	 * Write one file of an extension package to disk, enforcing every rule the
	 * installer enforces.
	 *
	 * There are two ways a package reaches uploads/wpie-extensions: the ZIP
	 * installer and the backup restore. The restore used to have its own,
	 * shorter copy of this logic which skipped sanitize_svg() and the size
	 * guards, so a plain `<svg onload=...>` from an archive landed web
	 * reachable. Both paths call this method now. (F-L15, 2026-07-25 audit)
	 *
	 * @param string $dir  Absolute target directory of the package.
	 * @param string $rel  Package-relative file path.
	 * @param string $data File contents.
	 * @return bool True when the file was written.
	 */
	public static function write_package_file( $dir, $rel, $data ) {
		$rel = str_replace( '\\', '/', (string) $rel );
		if ( '' === $rel || false !== strpos( $rel, '..' ) || false !== strpos( $rel, "\0" ) || '/' === $rel[0] ) {
			return false;
		}
		$ext = strtolower( (string) pathinfo( $rel, PATHINFO_EXTENSION ) );
		if ( ! in_array( $ext, self::ALLOWED_EXT, true ) ) {
			return false;
		}
		if ( strlen( $data ) > self::MAX_FILE_BYTES ) {
			return false;
		}
		if ( 'svg' === $ext ) {
			$clean = self::sanitize_svg( $data );
			if ( null === $clean ) {
				return false;
			}
			$data = $clean;
		}
		$target = trailingslashit( $dir ) . $rel;
		wp_mkdir_p( dirname( $target ) );
		return false !== file_put_contents( $target, $data ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
	}

}
