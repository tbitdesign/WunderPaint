<?php
/**
 * Enqueue the editor app only on the editor page.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Editor asset loading.
 */
class Assets {

	/**
	 * Register hooks.
	 */
	public function hooks() {
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue' ) );
		// Standalone render runtime (v1.157.0): REGISTERED (not enqueued)
		// wherever Pro's dynamic-image blocks might need the engine - the
		// block editor and the front end. Consumers list it as dependency.
		add_action( 'enqueue_block_editor_assets', array( $this, 'register_render_runtime' ) );
		add_action( 'wp_enqueue_scripts', array( $this, 'register_render_runtime' ) );
	}

	/**
	 * Register the standalone render runtime + its font stylesheet. The
	 * slim bootstrap rides as an inline script BEFORE the bundle; existing
	 * window.WPIE values (e.g. the block-editor button payload) win.
	 */
	public function register_render_runtime() {
		if ( wp_script_is( 'wpie-render-runtime', 'registered' ) ) {
			return;
		}
		$asset_file = WPIE_DIR . 'build/render-runtime.asset.php';
		$asset      = file_exists( $asset_file ) ? require $asset_file : array(
			'dependencies' => array(),
			'version'      => WPIE_VERSION,
		);
		wp_register_script(
			'wpie-render-runtime',
			WPIE_URL . 'build/render-runtime.js',
			$asset['dependencies'],
			$asset['version'],
			true
		);
		wp_add_inline_script(
			'wpie-render-runtime',
			'window.WPIE = Object.assign( ' . wp_json_encode( self::runtime_bootstrap() ) . ', window.WPIE || {} );',
			'before'
		);
		// Canvas text needs the self-hosted @font-face rules on this page
		// too; custom uploaded fonts ride on the same handle.
		wp_register_style( 'wpie-runtime-fonts', WPIE_URL . 'assets/fonts.css', array(), WPIE_VERSION );
		// Custom uploads + any downloaded catalog families (v1.316) ride on
		// the same handle so canvas text can load their faces.
		$custom_css = Fonts::font_face_css() . Fonts::library_face_css();
		if ( $custom_css ) {
			wp_add_inline_style( 'wpie-runtime-fonts', $custom_css );
		}
	}

	/**
	 * Slim window.WPIE payload for pages that render but do not host the
	 * full editor: everything the bridge modules read at call time.
	 *
	 * Split by audience (v1.324.0): the same handle rides along on public
	 * front-end pages through Pro's dynamic-image blocks, where a visitor
	 * received the complete binding catalogue - every ACF field name and
	 * label of the site - plus a full extension inventory with versions.
	 * Neither is needed to render; visitors get only what the renderer
	 * actually reads. (F-L02, 2026-07-25 audit)
	 *
	 * @return array Bootstrap payload.
	 */
	public static function runtime_bootstrap() {
		$settings = Helpers::get_settings();
		Content_Cache::ensure();
		$payload = array(
			'nonce'           => wp_create_nonce( 'wp_rest' ),
			'restUrl'         => untrailingslashit( rest_url( WPIE_REST_NS ) ),
			'ajaxUrl'         => admin_url( 'admin-ajax.php' ),
			'proxyUrl'        => rest_url( WPIE_REST_NS . '/proxy-image' ),
			'pluginUrl'       => WPIE_URL,
			'contentCacheUrl' => Content_Cache::ready_url(),
			// Whether the pre-built .gz ship inside the plugin. They do in
			// the dev tree and in the standalone build; the wordpress.org
			// release strips them (.distignore) because a plugin ZIP may not
			// contain compressed files. Without this flag the client asks for
			// a file it cannot have whenever the uploads cache is unavailable,
			// and the console shows a 404 before the plain .json fallback.
			'bundledPackGz'   => file_exists( WPIE_DIR . 'assets/content/bundled-templates.json.gz' ),
			'version'         => WPIE_VERSION,
			// The chosen editor language only applies here for editor
			// requests, unlike in class-editor-page.php. This method also
			// feeds the render runtime on every Gutenberg page
			// (enqueue_block_editor_assets) and in the frontend with Pro's
			// dynamic image block (wp_enqueue_scripts). There,
			// Editor_Locale::filter() intentionally does not apply, so
			// window.WPIE.locale and determine_locale() would drift apart
			// right there. On top of that, the block editor should
			// deliberately not adopt the editor language: a single
			// foreign-language insert in the middle of the WordPress
			// backend reads like a bug. class-editor-page.php does not
			// need the restriction, the editor page IS always an editor
			// request.
			'locale'          => Editor_Locale::is_editor_request()
				? Editor_Locale::resolve()
				: get_user_locale(),
			// The offered languages, and whether this visitor has an own
			// user account. In the demo everyone shares one login, so
			// there the choice belongs in local storage instead.
			'locales'         => Editor_Locale::available(),
			'hasUser'         => ! REST_Controller::is_demo() && get_current_user_id() > 0,
			'fontsGoogle'     => ! empty( $settings['fonts_google'] ),
			'fontsDownloaded' => Fonts::downloaded_families( $settings ),
			'customFonts'     => Fonts::client_fonts( $settings ),
		);
		if ( ! REST_Controller::can_use_editor() ) {
			// Rendering a template only needs to pull in the packs its
			// generator layers come from, so slug plus asset URLs is the
			// whole story (see Pro's ensureExtensionsFor).
			$payload['extensions'] = array_map(
				function ( $ext ) {
					return array(
						'slug'    => $ext['slug'] ?? '',
						'enabled' => ! empty( $ext['enabled'] ),
						'main'    => $ext['main'] ?? '',
						'style'   => $ext['style'] ?? '',
					);
				},
				array_values(
					array_filter(
						Extensions::all(),
						function ( $ext ) {
							return ! empty( $ext['enabled'] ) && ! empty( $ext['main'] );
						}
					)
				)
			);
			return $payload;
		}
		$payload['maxUploadMb'] = (int) round( wp_max_upload_size() / MB_IN_BYTES );
		$payload['bindings']    = Post_Data::binding_catalog();
		// Installed packs (v1.158.0): consumers inject the ones a
		// template's generator layers need (3D text etc.) on demand.
		$payload['extensions']  = Extensions::all();
		return $payload;
	}

	/**
	 * Enqueue app bundle + fonts + fullscreen CSS on the editor hook only.
	 *
	 * @param string $hook Current admin page hook.
	 */
	public function enqueue( $hook ) {
		if ( ! $hook || $hook !== Editor_Page::hook_suffix() ) {
			return;
		}

		$asset_file = WPIE_DIR . 'build/index.asset.php';
		$asset      = file_exists( $asset_file ) ? require $asset_file : array(
			'dependencies' => array(),
			'version'      => WPIE_VERSION,
		);

		wp_enqueue_script(
			'wpie-editor',
			WPIE_URL . 'build/index.js',
			$asset['dependencies'],
			$asset['version'],
			true
		);
		wp_set_script_translations( 'wpie-editor', 'wunderpaint', WPIE_DIR . 'languages' );

		/*
		 * Boot watchdog (v1.384.5, was a hand-written <script> echoed by
		 * Editor_Page::render()). Deliberately ES5: browsers below the
		 * editor's language floor - Safari before 16.4 chokes on regex
		 * lookbehind - fail to PARSE the bundle, nothing mounts and the page
		 * stays gray. Attached 'before', so it prints in its own script tag
		 * ahead of the bundle and still runs when the bundle never parses.
		 */
		wp_add_inline_script(
			'wpie-editor',
			'(function(){setTimeout(function(){var r=document.getElementById("wpie-root");'
				. 'if(r&&!r.firstChild){r.innerHTML=\'<div style="display:flex;align-items:center;'
				. 'justify-content:center;height:80vh;padding:24px;text-align:center;'
				. 'font:15px/1.6 -apple-system,BlinkMacSystemFont,sans-serif;color:#50575e">'
				. '<div style="max-width:460px">\'+'
				. wp_json_encode( __( 'The editor could not start. Your browser is probably too old for it - it needs a current browser (Chrome/Edge 110+, Firefox 115+, Safari 16.4+). Please update your browser and reload this page.', 'wunderpaint' ) )
				. '+\'</div></div>\';}},8000);})();',
			'before'
		);

		if ( file_exists( WPIE_DIR . 'build/index.css' ) ) {
			wp_enqueue_style( 'wpie-editor', WPIE_URL . 'build/index.css', array(), $asset['version'] );
		}
		wp_enqueue_style( 'wpie-fonts', WPIE_URL . 'assets/fonts.css', array(), WPIE_VERSION );
		// Custom uploaded fonts (v1.136.0) + downloaded catalog families
		// (v1.316): their @font-face rules ride on the same handle so canvas
		// text can load the faces.
		$custom_css = Fonts::font_face_css() . Fonts::library_face_css();
		if ( $custom_css ) {
			wp_add_inline_style( 'wpie-fonts', $custom_css );
		}

		// Media modal for the batch-processing picker (v0.4).
		wp_enqueue_media();

		// Full-screen: hide the WP admin chrome on this page (spec 03.2).
		wp_register_style( 'wpie-fullscreen', false, array(), WPIE_VERSION );
		wp_enqueue_style( 'wpie-fullscreen' );
		wp_add_inline_style(
			'wpie-fullscreen',
			'body.wpie-fullscreen #adminmenumain,body.wpie-fullscreen #wpadminbar,body.wpie-fullscreen #wpfooter{display:none!important}' .
			'body.wpie-fullscreen #wpcontent,body.wpie-fullscreen.auto-fold #wpcontent{margin:0!important;padding:0!important}' .
			'body.wpie-fullscreen #wpbody-content{padding-bottom:0!important;float:none}' .
			'body.wpie-fullscreen{background:#141619}' .
			'html.wp-toolbar{padding-top:0!important}' .
			'#wpie-root{position:fixed;inset:0;z-index:99999}' .
			// Pick-overlay iframe (v1.245.2): fully transparent page, so
			// the host shines through and the manager's own backdrop is
			// the only dim - it reads like a native modal.
			'body.wpie-pick-embed,body.wpie-pick-embed #wpie-root,body.wpie-pick-embed .editor-root{background:transparent!important}'
		);

		$attachment_id = Editor_Page::requested_attachment();
		$is_new        = isset( $_GET['new'] ) || ! $attachment_id; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		wp_add_inline_script(
			'wpie-editor',
			'window.WPIE = ' . wp_json_encode( Editor_Page::bootstrap_data( $attachment_id, $is_new ) ) . ';',
			'before'
		);

		/**
		 * Extensions enqueue their editor scripts here (v0.4). Depend on
		 * 'wpie-editor' and register via wp.hooks action `wpie.ready`.
		 *
		 * @param int $attachment_id Attachment being edited (0 = new).
		 */
		do_action( 'wpie_editor_assets', $attachment_id );
	}
}
