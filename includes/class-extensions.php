<?php
/**
 * In-editor extension packages (v1.119): a manifest.json plus a JS entry
 * file, loaded on the editor page and nowhere else. No entry in the
 * WordPress plugin list, and strictly code-on-the-client - a package
 * contains no PHP and can never run server-side code.
 *
 * THIS PLUGIN ONLY READS THEM. Its single root is bundled-extensions/
 * inside the plugin folder, filled at build time by
 * tools/bundle-free-extensions.sh, so every free studio is simply there
 * after installing and a new one arrives with the next update. There is no
 * method here that creates, changes or deletes an extension file.
 *
 * That is a deliberate narrowing (2026-08-08). Until then an administrator
 * could upload a ZIP full of JavaScript through the editor's Extensions
 * manager and the editor would run it, and the wordpress.org review flagged
 * precisely that under the rule against arbitrary code insertion. Hardening
 * the upload does not change what it is, so the whole writing half - the ZIP
 * reader, the extraction, the SVG sanitizer, the delete route and the backup
 * restore - moved to the Pro plugin, which wordpress.org does not
 * distribute. Pro hangs its writable directory in front of ours through the
 * `wpie_extension_roots` filter below.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Discovery, REST routes and enqueueing.
 */
class Extensions {

	const OPTION_DISABLED = 'wpie_extensions_disabled';
	// Mirror of API_VERSION in src/lib/extensions.js (the enqueue gate
	// runs server-side); tests/php/extensions.php asserts they never
	// drift.
	const API_VERSION = '2.15.0';

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
	 * Every directory extension packages are read from.
	 *
	 * This plugin contributes exactly one, and it is read-only: the folder
	 * inside the plugin that the build filled. Nothing here can write to it
	 * at run time, which is the whole point.
	 *
	 * @return array[] Each entry { dir, url, bundled }, trailing-slashed.
	 */
	public static function roots() {
		$own = array(
			array(
				'dir'     => WPIE_DIR . 'bundled-extensions/',
				'url'     => WPIE_URL . 'bundled-extensions/',
				'bundled' => true,
			),
		);

		/**
		 * Filters the directories extension packages are loaded from.
		 *
		 * Add a root to make packages in another directory available to the
		 * editor. When two roots hold the same slug, the HIGHER manifest
		 * version wins; on equal versions the earlier root does, so prepend
		 * (array_unshift) if yours should be the tie-breaker. That is how a
		 * copy installed between releases overrides a bundled studio, and how
		 * the bundled one takes over again once the plugin ships a newer one.
		 *
		 * The free plugin never writes to any of these. A root that can be
		 * written to is the adding plugin's responsibility, including the
		 * validation of whatever it puts there.
		 *
		 * @since 1.392.0
		 *
		 * @param array[] $roots Each { dir, url, bundled }.
		 */
		$roots = apply_filters( 'wpie_extension_roots', $own );

		$out = array();
		foreach ( is_array( $roots ) ? $roots : array() as $root ) {
			if ( ! is_array( $root ) || empty( $root['dir'] ) || empty( $root['url'] ) ) {
				continue;
			}
			$out[] = array(
				'dir'     => trailingslashit( (string) $root['dir'] ),
				'url'     => trailingslashit( (string) $root['url'] ),
				'bundled' => ! empty( $root['bundled'] ),
			);
		}
		// A filter that returns nonsense must not silently switch the editor's
		// own studios off, so fall back to what this plugin ships.
		return $out ? $out : $own;
	}

	/**
	 * Whether the current user may switch packages on and off.
	 *
	 * This is an option, not a file operation, so DISALLOW_FILE_MODS is not
	 * consulted any more - a site that forbids code installs may still decide
	 * which of the studios it already has are shown. Installing is Pro's
	 * business and Pro checks that constant itself.
	 *
	 * @return bool
	 */
	public static function can_manage() {
		return current_user_can( 'manage_options' );
	}

	/**
	 * Every readable package across all roots, sorted by name.
	 *
	 * A slug found in more than one root is described once, from whichever
	 * copy describe() picks - the newest one.
	 *
	 * @return array[] List of package descriptors (see describe()).
	 */
	public static function all() {
		$list = array();
		$seen = array();
		foreach ( self::roots() as $root ) {
			$dirs = glob( $root['dir'] . '*', GLOB_ONLYDIR );
			foreach ( is_array( $dirs ) ? $dirs : array() as $path ) {
				$slug = basename( $path );
				if ( isset( $seen[ $slug ] ) ) {
					continue;
				}
				$item = self::describe( $slug );
				if ( $item ) {
					$seen[ $slug ] = true;
					$list[]        = $item;
				}
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
		if ( '' === $slug ) {
			return null;
		}
		// THE NEWEST COPY WINS, not the first root.
		//
		// A slug can exist twice: once inside the plugin, once in a writable
		// root that Pro installed into. Taking the first root would mean a
		// package installed once shadows the bundled one for good - the plugin
		// updates, ships a newer studio, and the site keeps running the old
		// copy without a word. That is the kind of fault nobody reports,
		// because nothing looks broken.
		//
		// Equal versions keep the FIRST root, so an installed copy of the same
		// version stays in charge: someone who deliberately put a build there
		// (a fix ahead of a release) is not overruled by an identical number.
		$base     = '';
		$url      = '';
		$bundled  = false;
		$manifest = null;
		foreach ( self::roots() as $root ) {
			$try = $root['dir'] . $slug . '/';
			if ( ! is_readable( $try . 'manifest.json' ) ) {
				continue;
			}
			$raw = file_get_contents( $try . 'manifest.json' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
			if ( false === $raw ) {
				continue;
			}
			$found = json_decode( $raw, true );
			if ( ! is_array( $found ) || empty( $found['name'] ) || empty( $found['main'] ) ) {
				continue;
			}
			if ( null !== $manifest ) {
				$have = (string) ( $manifest['version'] ?? '0' );
				$mine = (string) ( $found['version'] ?? '0' );
				if ( version_compare( $mine, $have, '<=' ) ) {
					continue;
				}
			}
			$base     = $try;
			$url      = $root['url'] . $slug . '/';
			$bundled  = $root['bundled'];
			$manifest = $found;
		}
		if ( null === $manifest ) {
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
			'main'        => $url . $main,
			'style'       => $style && file_exists( $base . $style ) ? $url . $style : '',
			'enabled'     => ! in_array( $slug, is_array( $disabled ) ? $disabled : array(), true ),
			// Ships inside the plugin: it arrives and leaves with an update,
			// so the manager offers no remove button for it (v1.392.0).
			'bundled'     => $bundled,
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
	 * REST routes: list them, switch one on or off. That is the whole
	 * surface - there is no route here that receives a file, and none that
	 * deletes one. Pro registers those on top when it is active.
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
			)
		);
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

}
