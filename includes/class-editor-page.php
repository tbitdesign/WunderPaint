<?php
/**
 * Hidden full-screen editor admin page + bootstrap payload.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * upload.php?page=wpie-editor (registered under the Media parent)
 */
class Editor_Page {

	/**
	 * Hook suffix captured from add_submenu_page().
	 *
	 * @var string
	 */
	private static $hook_suffix = '';

	/**
	 * Register hooks.
	 */
	public function hooks() {
		add_action( 'admin_menu', array( $this, 'register_page' ) );
		add_filter( 'admin_body_class', array( $this, 'body_class' ) );
		add_action( 'admin_head', array( $this, 'print_favicon' ) );
		// "+ New → Image" in the admin bar (v1.155.0): the blank-canvas
		// entry, reachable from every screen incl. the front end.
		add_action( 'admin_bar_menu', array( $this, 'admin_bar_new_design' ), 82 );
	}

	/**
	 * Add "Design" to the admin bar's "+ New" menu.
	 *
	 * @param \WP_Admin_Bar $bar Admin bar.
	 */
	public function admin_bar_new_design( $bar ) {
		if ( ! Media::user_can_use_editor() ) {
			return;
		}
		$bar->add_node(
			array(
				'parent' => 'new-content',
				'id'     => 'wpie-new-design',
				'title'  => __( 'Image', 'wunderpaint' ),
				'href'   => admin_url( 'upload.php?page=' . WPIE_SLUG ),
			)
		);
	}

	/**
	 * Editor-tab favicon (v1.88.0): the brand icon as SVG, printed only on
	 * the editor screen so the rest of wp-admin keeps its own favicon.
	 */
	public function print_favicon() {
		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
		if ( ! $screen || self::$hook_suffix !== $screen->id ) {
			return;
		}
		printf(
			'<link rel="icon" type="image/svg+xml" href="%s" />' . "\n",
			esc_url( WPIE_URL . 'assets/icon-wpie.svg' )
		);
	}

	/**
	 * The captured page hook.
	 *
	 * @return string
	 */
	public static function hook_suffix() {
		return self::$hook_suffix;
	}

	/**
	 * Register under Media. Visible since v1.155.0 as the blank-canvas
	 * entry (was hidden before; the row action only covers existing
	 * images, so the editor was invisible until you owned one).
	 */
	public function register_page() {
		$settings          = Helpers::get_settings();
		self::$hook_suffix = (string) add_submenu_page(
			'upload.php',
			__( 'WunderPaint', 'wunderpaint' ),
			__( 'New Image', 'wunderpaint' ),
			$settings['editor_cap'],
			WPIE_SLUG,
			array( $this, 'render' )
		);
	}

	/**
	 * Requested attachment id (0 = new document).
	 *
	 * @return int
	 */
	public static function requested_attachment() {
		return isset( $_GET['attachment'] ) ? absint( $_GET['attachment'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
	}

	/**
	 * Authorize opening the editor (spec 03.3 per-attachment authorization).
	 *
	 * @param int $attachment_id Attachment id, 0 for new.
	 * @return true|\WP_Error
	 */
	public static function authorize( $attachment_id ) {
		if ( ! Media::user_can_use_editor() ) {
			return new \WP_Error( 'wpie_forbidden', __( 'You are not allowed to use the image editor.', 'wunderpaint' ), array( 'status' => 403 ) );
		}
		if ( $attachment_id > 0 ) {
			$post = get_post( $attachment_id );
			if ( ! $post || 'attachment' !== $post->post_type || ! wp_attachment_is_image( $attachment_id ) ) {
				return new \WP_Error( 'wpie_not_found', __( 'Attachment not found or not an image.', 'wunderpaint' ), array( 'status' => 404 ) );
			}
			if ( ! current_user_can( 'edit_post', $attachment_id ) ) {
				return new \WP_Error( 'wpie_forbidden', __( 'You are not allowed to edit this attachment.', 'wunderpaint' ), array( 'status' => 403 ) );
			}
		}
		return true;
	}

	/**
	 * Render the mount point (everything else is React).
	 */
	public function render() {
		$attachment_id = self::requested_attachment();
		$authorized    = self::authorize( $attachment_id );
		if ( true !== $authorized ) {
			wp_die( esc_html( $authorized->get_error_message() ), '', array( 'response' => (int) $authorized->get_error_data()['status'] ) );
		}
		// The mount point only. The boot watchdog that fills it with an honest
		// message when the bundle never parses now rides on the 'wpie-editor'
		// handle (Assets::enqueue_editor, v1.384.5) instead of being echoed
		// here as a hand-written script tag.
		echo '<div id="wpie-root" class="wpie-app-root"></div>';
	}

	/**
	 * Full-screen body class on the editor page.
	 *
	 * @param string $classes Space-separated class list.
	 * @return string
	 */
	public function body_class( $classes ) {
		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
		if ( $screen && self::$hook_suffix && $screen->id === self::$hook_suffix ) {
			$classes .= ' wpie-fullscreen';
			if ( self::pick_context() ) {
				$classes .= ' wpie-pick-embed';
			}
		}
		return $classes;
	}

	/**
	 * Validated same-site URL to jump back to after editing (v1.0).
	 * Comes from &return= appended by the block-editor button.
	 *
	 * @return string Empty when absent or off-site.
	 */
	public static function return_url() {
		if ( ! isset( $_GET['return'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
			return '';
		}
		$url = esc_url_raw( wp_unslash( $_GET['return'] ) ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		return $url ? (string) wp_validate_redirect( $url, '' ) : '';
	}

	/**
	 * Embedded ("return a result to the opener") context (v1.180.0). When the
	 * editor is opened inside an iframe by a page builder (Elementor first, but
	 * builder-agnostic), the host appends &wpie_embed=1 plus an opaque token it
	 * echoes back with the postMessage result. The token is NOT a security
	 * boundary (same-origin postMessage is the boundary); it only lets the host
	 * match a reply to the request it made. Returns null when not embedded.
	 *
	 * @return array{host:string,token:string}|null
	 */
	public static function embed_context() {
		if ( empty( $_GET['wpie_embed'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
			return null;
		}
		$host  = isset( $_GET['wpie_host'] ) ? sanitize_key( wp_unslash( $_GET['wpie_host'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$token = isset( $_GET['wpie_token'] ) ? sanitize_text_field( wp_unslash( $_GET['wpie_token'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		return array(
			'host'  => $host,
			'token' => substr( $token, 0, 64 ),
		);
	}

	/**
	 * Pick-overlay context (v1.242): the wp.media "Media Library Manager"
	 * button loads the editor in an iframe with &wpie_pick=single|multiple;
	 * the editor then boots straight into the manager's pick mode and posts
	 * the chosen attachment ids back over the embed message protocol.
	 *
	 * @return array|null { mode, token } or null outside the pick flow.
	 */
	public static function pick_context() {
		$mode = isset( $_GET['wpie_pick'] ) ? sanitize_key( wp_unslash( $_GET['wpie_pick'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		if ( ! in_array( $mode, array( 'single', 'multiple' ), true ) ) {
			return null;
		}
		$token = isset( $_GET['wpie_token'] ) ? sanitize_text_field( wp_unslash( $_GET['wpie_token'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$types = isset( $_GET['wpie_pick_types'] ) ? sanitize_key( wp_unslash( $_GET['wpie_pick_types'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		return array(
			'mode'  => $mode,
			'token' => substr( $token, 0, 64 ),
			'types' => in_array( $types, array( 'all', 'video', 'audio' ), true ) ? $types : 'image',
		);
	}

	/**
	 * Build window.WPIE (spec 03.3). Never contains API keys.
	 *
	 * @param int  $attachment_id Attachment id (0 for new).
	 * @param bool $is_new        Whether this is a new document.
	 * @return array
	 */
	public static function bootstrap_data( $attachment_id, $is_new ) {
		$settings = Helpers::get_settings();
		// Build the gzipped packs before the payload reports where they are.
		// Version-gated, so this is a no-op on every load after the first
		// one per plugin version.
		Content_Cache::ensure();

		$doc = array(
			'name'           => 'untitled',
			'w'              => 1080,
			'h'              => 1080,
			'bg'             => '#ffffff',
			'img'            => null,
			'imgCrossOrigin' => false,
			'project'        => null,
		);

		if ( $is_new || ! $attachment_id ) {
			if ( preg_match( '/^(\d+)x(\d+)$/', (string) $settings['default_canvas'], $m ) ) {
				$doc['w'] = (int) $m[1];
				$doc['h'] = (int) $m[2];
			}
		} else {
			$file = get_attached_file( $attachment_id );
			$meta = wp_get_attachment_metadata( $attachment_id );
			$src  = wp_get_attachment_image_src( $attachment_id, 'full' );

			$doc['name'] = $file ? pathinfo( $file, PATHINFO_FILENAME ) : ( 'attachment-' . $attachment_id );
			$doc['bg']   = 'transparent';
			if ( is_array( $meta ) && ! empty( $meta['width'] ) && ! empty( $meta['height'] ) ) {
				$doc['w'] = (int) $meta['width'];
				$doc['h'] = (int) $meta['height'];
			} elseif ( $src ) {
				$doc['w'] = (int) $src[1];
				$doc['h'] = (int) $src[2];
			}
			$doc['img'] = $src ? $src[0] : wp_get_attachment_url( $attachment_id );

			$img_host             = wp_parse_url( (string) $doc['img'], PHP_URL_HOST );
			$home_host            = wp_parse_url( home_url(), PHP_URL_HOST );
			$doc['imgCrossOrigin'] = ( $img_host && $home_host && strtolower( $img_host ) !== strtolower( $home_host ) );

			$project_meta = get_post_meta( $attachment_id, '_wpie_project', true );
			$psd_meta     = get_post_meta( $attachment_id, '_wpie_psd', true );
			if ( $project_meta || $psd_meta ) {
				$doc['project'] = array(
					'json' => $project_meta ? rest_url( WPIE_REST_NS . '/project/' . $attachment_id . '/json' ) : null,
					'psd'  => $psd_meta ? rest_url( WPIE_REST_NS . '/project/' . $attachment_id . '/psd' ) : null,
				);
			}
		}

		// Mapping shared with GET /brand-kits (v1.89.0): the in-editor
		// brand-kit dialog reads and writes the same client shape.
		$brand_kits = Settings::client_kits( $settings );

		$data = array(
			'nonce'           => wp_create_nonce( 'wp_rest' ),
			'restUrl'         => untrailingslashit( rest_url( WPIE_REST_NS ) ),
			'ajaxUrl'         => admin_url( 'admin-ajax.php' ),
			'attachmentId'    => (int) $attachment_id,
			'isNew'           => (bool) $is_new,
			'doc'             => $doc,
			'proxyUrl'        => rest_url( WPIE_REST_NS . '/proxy-image' ),
			'libraryUrl'      => admin_url( 'upload.php' ),
			'settingsUrl'     => admin_url( 'options-general.php?page=' . WPIE_SETTINGS_SLUG ),
			'pluginUrl'       => WPIE_URL,
			'version'         => WPIE_VERSION,
			// Demo mode (v1.307): the client softens write actions (Save
			// becomes Download, destructive buttons explain themselves).
			'demo'            => REST_Controller::is_demo(),
			// For extensions (v1.145): packs ship their own strings and
			// pick the dictionary by this editor-user locale. Since the
			// language choice was added, the value comes from
			// Editor_Locale, so core and studios do not drift apart.
			'locale'          => Editor_Locale::resolve(),
			// The offered languages, and whether this visitor has an own
			// user account. In the demo everyone shares one login, so
			// there the choice belongs in local storage instead.
			'locales'         => Editor_Locale::available(),
			'hasUser'         => ! REST_Controller::is_demo() && get_current_user_id() > 0,
			// Pro purchase link for the teaser dialogs (v1.153.5): the
			// main landing page; overridable for launch/testing.
			'proUrl'          => apply_filters(
				'wpie_pro_purchase_url',
				defined( 'WPIE_PRO_PURCHASE_URL' )
					? WPIE_PRO_PURCHASE_URL
					: 'https://wp-image-editor.com/'
			),
			// Base URL of the extension delivery host, so the catalog
			// gallery can build download links (Phase 3).
			'mlModelsUrl'     => trailingslashit( ML_Models::url() ),
			'runtime'         => ML_Models::runtime_status(),
			// Dynamic over the manifest (v1.131.2): the hand-written list
			// silently missed every newly added model - image-search shipped
			// installed but the editor never saw the flag.
			'mlInstalled'     => array_combine(
				array_keys( ML_Models::models() ),
				array_map(
					array( ML_Models::class, 'is_installed' ),
					array_keys( ML_Models::models() )
				)
			),
			// Repo of the site-language caption translation model ('' on
			// English sites): the client loads it by this id (v1.138.0).
			'captionTranslateRepo' => ML_Models::translate_repo(),
			'theme'           => $settings['theme'],
			'accent'          => '#3b66ff',
			// The three own-key flags, plus 'core' for WordPress' own AI
			// client (7.0). Only hasTextProvider() looks at 'core': the
			// per-provider gates stay as they are, because that path cannot
			// do vision or web search - see class-ai-core.php.
			'providers'       => array_merge(
				Helpers::provider_status(),
				array( 'core' => AI_Core::available() )
			),
			'seoPlugins'      => apply_filters( 'wpie_seo_plugins', array() ), // Pro's Automation fills this (v1.79).
			'bindings'        => Post_Data::binding_catalog(),
			'defaultProvider' => $settings['default_provider'],
			'versioning'      => (bool) $settings['versioning'],
			'versionsToKeep'  => (int) $settings['versions_to_keep'],
			'maxUploadMb'     => (int) round( wp_max_upload_size() / MB_IN_BYTES ),
			// Where fetch-pack.js may look for the gzipped content packs.
			// These were only ever in the render-runtime payload, which is
			// the FRONT END handle - the editor never saw them, so it always
			// walked past the uploads cache and asked the plugin directory
			// for a .gz instead. In the dev tree that file exists and the
			// fallback silently worked; in the wordpress.org build it does
			// not, which is where the 404 in the console came from.
			'contentCacheUrl' => Content_Cache::ready_url(),
			'bundledPackGz'   => file_exists( WPIE_DIR . 'assets/content/bundled-templates.json.gz' ),
			'fonts'           => array( 'Inter', 'Helvetica', 'Arial', 'Georgia', 'Playfair Display', 'DM Serif Display' ),
			'stock'           => Stock::status(),
			'stockLabels'     => Stock::labels(),
			'watermark'       => self::watermark_config( $settings ),
			'fontsGoogle'     => ! empty( $settings['fonts_google'] ),
			'fontsDownloaded' => Fonts::downloaded_families( $settings ),
			// True until the admin has picked a font source once (first run).
			'fontsFirstRun'   => empty( $settings['fonts_choice'] ),
			'customFonts'     => Fonts::client_fonts( $settings ),
			'canManage'       => current_user_can( 'manage_options' ),
			// Whether this user may create, rename or delete the SHARED media
			// folders and tags. Same capability the routes check, so the
			// buttons appear exactly when the action would go through
			// (v1.404.0). Filing media into an existing folder is a different
			// thing and stays open to everyone who may use the editor.
			'canManageTerms'  => current_user_can( 'manage_categories' ),
			'returnUrl'       => self::return_url(),
			'siteName'        => get_bloginfo( 'name' ),
			'siteUrl'         => home_url(),
			'siteTagline'     => get_bloginfo( 'description' ),
			// Builder-agnostic "edit in place" handshake (v1.180.0); null unless
			// opened inside a host iframe (Elementor first). See embed_context().
			'embed'           => self::embed_context(),
			'pickEmbed'       => self::pick_context(),
			'brandKits'       => $brand_kits,
			// Same check the /brand-kits routes use, so the menu entry is
			// enabled exactly when saving would actually be allowed.
			'canManageKits'   => Settings::can_manage_kits(),
			// v1.241: shared image picker routes to the Media Library
			// Manager instead of wp.media when this is on.
			'mediaPickerManager' => ! empty( $settings['media_picker_manager'] ),
			// Grace period of the holding room, so a delete confirm can name
			// the real number of days instead of promising a restore that a
			// stock install (no MEDIA_TRASH) could never do (v1.353.0).
			'quarantineDays'  => Media_Quarantine::days(),
			// Kit ceiling, so a site that raises wpie_max_brand_kits is not
			// stopped by a hardcoded 8 in the dialog (v1.353.0).
			'maxBrandKits'    => Settings::max_kits(),
			'palettes'        => Palettes::all(),
			'brand'           => $brand_kits ? $brand_kits[0] : array(
				'colors'  => array(),
				'fonts'   => array(),
				'logoId'  => 0,
				'logoUrl' => '',
			),

			// The Pro add-on overrides this via `wpie_bootstrap_data`; the
			// default keeps window.WPIE.pro reliably present (v1.78.8).
			'pro'             => array(
				'active'   => false,
				'features' => array(),
			),
		);

		/**
		 * Filter the editor bootstrap payload (window.WPIE), v0.4.
		 *
		 * @param array $data          Payload.
		 * @param int   $attachment_id Attachment id (0 = new document).
		 * @param bool  $is_new        Whether this is a new document.
		 */
		return apply_filters( 'wpie_bootstrap_data', $data, $attachment_id, $is_new );
	}

	/**
	 * Watermark export config (v0.3), or null when no image is set.
	 *
	 * @param array $settings Plugin settings.
	 * @return array|null
	 */
	public static function watermark_config( $settings ) {
		$id = (int) $settings['watermark_id'];
		if ( ! $id ) {
			return null;
		}
		$url = wp_get_attachment_image_url( $id, 'full' );
		if ( ! $url ) {
			return null;
		}
		return array(
			'url'     => $url,
			'pos'     => (string) $settings['watermark_pos'],
			'scale'   => (int) $settings['watermark_scale'],
			'opacity' => (int) $settings['watermark_opacity'],
			'margin'  => (int) $settings['watermark_margin'],
		);
	}
}
