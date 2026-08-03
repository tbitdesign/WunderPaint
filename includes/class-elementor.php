<?php
/**
 * Elementor "edit in place" host integration (v1.180.0).
 *
 * Injects an "Edit Image" button into Elementor's image
 * controls and opens the editor in an iframe overlay. The editor side of the
 * handshake lives in Editor_Page::embed_context() + src/lib/embed-host.js;
 * the host side is src/elementor-host.js.
 *
 * The enqueue hook only fires inside the Elementor editor, so registering it
 * is a harmless no-op when Elementor is not installed.
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Wires the host script into the Elementor editor.
 */
class Elementor {

	/**
	 * Register hooks (module contract, called by Plugin).
	 */
	public function hooks() {
		add_action( 'elementor/editor/after_enqueue_scripts', array( $this, 'enqueue' ) );
	}

	/**
	 * Enqueue and configure the host bridge in the Elementor editor.
	 */
	public function enqueue() {
		if ( ! Media::user_can_use_editor() ) {
			return;
		}
		// The generic media-button script rides along (v1.242.1): it adds
		// the "Media Library Manager" button to Elementor's wp.media
		// modals when the picker setting is on (admin_enqueue_scripts
		// never fires for Elementor's editor document).
		Media::register_media_button();
		$asset_file = WPIE_DIR . 'build/elementor-host.asset.php';
		$asset      = file_exists( $asset_file ) ? require $asset_file : array(
			'dependencies' => array(),
			'version'      => WPIE_VERSION,
		);
		wp_enqueue_script(
			'wpie-elementor-host',
			WPIE_URL . 'build/elementor-host.js',
			$asset['dependencies'],
			$asset['version'],
			true
		);
		wp_localize_script(
			'wpie-elementor-host',
			'WPIEElementor',
			array(
				// Base editor URL WITHOUT the new-document flag; the host script
				// appends &attachment=<id> per control (Media::editor_url() would
				// add &new=1 and open a blank canvas instead).
				'editorBase'        => admin_url( 'upload.php?page=' . WPIE_SLUG ),
				'editLabel'         => __( 'Edit Image', 'wunderpaint' ),
				'loading'           => __( 'Loading editor…', 'wunderpaint' ),
				'close'             => __( 'Close', 'wunderpaint' ),
				'title'             => __( 'WunderPaint', 'wunderpaint' ),
				'needsLibraryImage' => __( 'Pick a media-library image first.', 'wunderpaint' ),
			)
		);
	}
}
