<?php
/**
 * Plugin singleton: wires all modules.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Boots and holds the module instances.
 */
class Plugin {

	/**
	 * Singleton instance.
	 *
	 * @var Plugin|null
	 */
	private static $instance = null;

	/**
	 * Module instances, keyed by short name.
	 *
	 * @var array<string,object>
	 */
	private $modules = array();

	/**
	 * Get (and lazily create) the singleton.
	 *
	 * @return Plugin
	 */
	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Instantiate modules and register their hooks.
	 */
	private function __construct() {
		$map = array(
			'settings'    => Settings::class,
			'media'       => Media::class,
			'editor_page' => Editor_Page::class,
			'assets'      => Assets::class,
			'rest'        => REST_Controller::class,
			'ai'          => AI_Provider::class,
			'templates'   => Templates::class,
			'projects'    => Projects::class,
			'stock'       => Stock::class,
			'models3d'    => Models_3D::class,
			'meshy'       => Meshy::class,
			'ml'          => ML_Models::class,
			'library'     => User_Library::class,
			'palettes'    => Palettes::class,
			'ext_store'   => Extension_Store::class,
			'backup'      => Backup::class,
			'post_data'   => Post_Data::class,
			'extensions'  => Extensions::class,
			'catalog'     => Catalog::class,
			'search'      => Search_Index::class,
			'media_lib'   => Media_Library::class,
			'media_usage' => Media_Usage::class,
			'quarantine'  => Media_Quarantine::class,
			'orphans'     => Media_Orphans::class,
			'replace'     => Media_Replace::class,
			'recrop'      => Media_Recrop::class,
			'oversize'    => Media_Oversize::class,
			'credits'     => Media_Credits::class,
			'fonts'       => Fonts::class,
			'geo'         => Geo::class,
			'assistant'   => Assistant::class,
			'elementor'   => Elementor::class,
		);

		foreach ( $map as $key => $class ) {
			$this->modules[ $key ] = new $class();
			$this->modules[ $key ]->hooks();
		}

		add_action( 'init', array( $this, 'load_textdomain' ) );
		// Retrofit the uploads deny rules once per version, so installations that
		// created their directories before this hardening get them too. (F-L61)
		add_action( 'admin_init', array( $this, 'ensure_upload_protection' ) );
		add_filter( 'plugin_row_meta', array( $this, 'plugin_row_meta' ), 10, 2 );
	}

	/**
	 * Access a wired module.
	 *
	 * @param string $key Module key.
	 * @return object|null
	 */
	public function module( $key ) {
		return isset( $this->modules[ $key ] ) ? $this->modules[ $key ] : null;
	}

	/**
	 * Load translations.
	 */
	public function load_textdomain() {
		// phpcs:ignore PluginCheck.CodeAnalysis.DiscouragedFunctions.load_plugin_textdomainFound -- loads the bundled .mo for installs that are not from wordpress.org, where just-in-time loading only covers language-pack translations.
		load_plugin_textdomain( 'wunderpaint', false, dirname( plugin_basename( WPIE_FILE ) ) . '/languages' );
	}

	/**
	 * Documentation link in the plugin row on the Plugins screen.
	 *
	 * @param string[] $links Meta links of the current row.
	 * @param string   $file  Plugin basename the row belongs to.
	 * @return string[]
	 */
	public function plugin_row_meta( $links, $file ) {
		if ( plugin_basename( WPIE_FILE ) === $file ) {
			$links[] = '<a href="https://help.wp-image-editor.com" target="_blank" rel="noopener">' . esc_html__( 'Docs & FAQs', 'wunderpaint' ) . '</a>';
		}
		return $links;
	}

	/**
	 * Write the uploads deny rules if this version has not done so yet.
	 *
	 * @return void
	 */
	public function ensure_upload_protection() {
		if ( get_option( 'wpie_upload_guard_version' ) === WPIE_VERSION ) {
			return;
		}
		Helpers::protect_upload_dirs();
		update_option( 'wpie_upload_guard_version', WPIE_VERSION, false );
	}

	/**
	 * Activation: seed defaults (only missing keys) and create the version store.
	 */
	public static function activate() {
		$stored = get_option( WPIE_OPTION, false );
		if ( false === $stored || ! is_array( $stored ) ) {
			$stored = array();
		}
		update_option( WPIE_OPTION, array_merge( Helpers::defaults(), $stored ) );

		$dir = \wpie_versions_dir();
		if ( ! is_dir( $dir ) ) {
			wp_mkdir_p( $dir );
		}
		$guard = trailingslashit( $dir ) . 'index.php';
		if ( ! file_exists( $guard ) ) {
			file_put_contents( $guard, "<?php // Silence is golden.\n" ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		}

		Helpers::protect_upload_dirs();

		// Pre-build the gzipped content-pack cache (packs ship as plain .json
		// because wordpress.org forbids bundling .gz).
		Content_Cache::ensure();
	}
}
