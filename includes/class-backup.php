<?php
/**
 * Backup & restore (v1.100.0): one portable ZIP with everything a site
 * builds inside the editor - settings incl. brand kits, dynamic templates,
 * designs, user library assets, Pro content templates, kit logo and
 * watermark files, uploaded custom fonts, installed editor extensions and
 * (optional) the per-attachment version store. Restore replaces the
 * stores and remaps kit logos/watermarks to freshly imported attachments,
 * so the archive works for reinstalls AND migrations to another site.
 * Deliberately NOT included (reproducible): local AI models and the
 * transformers runtime (re-downloaded on demand), search index vectors
 * (rebuilt automatically) and the monthly AI spend counter (restoring an
 * old count would undermine the budget limit).
 *
 * @package WPImageEditor
 */

namespace WPImageEditor;

defined( 'ABSPATH' ) || exit;

/**
 * Backup module.
 */
class Backup {

	const FORMAT = 'wpie-backup@1';

	/**
	 * The per-user extension stores inside the archive (F17, Codex' audit of
	 * 10.09.2026). Studios keep what their users build - named Growth & Decay
	 * recipes, Particle Strokes brushes and stamps - in `wpie_ext_store_<ns>`
	 * user meta, and the archive never carried it: a move or a reinstall
	 * brought the extensions back and lost the user's own work in them.
	 */
	const EXT_STORE_FILE = 'ext-store.json';

	/**
	 * Option keys included verbatim (existing values only).
	 *
	 * @var string[]
	 */
	const OPTIONS = array(
		'wpie_templates',
		'wpie_designs',
		'wpie_user_library',
		'wpie_palettes',
		'wpie_3d_models',
		'wpie_ai_usage_log',
		'wpie_extensions_disabled',
		'wpie_content_templates', // Pro, when present.
		'wpie_automation_settings', // Pro, when present.
	);

	/**
	 * Register hooks.
	 */
	public function hooks() {
		add_action( 'admin_post_wpie_backup_export', array( $this, 'export' ) );
		add_action( 'admin_post_wpie_backup_import', array( $this, 'import' ) );
	}

	/**
	 * Permission + nonce gate for both endpoints.
	 *
	 * @param string $action Nonce action.
	 */
	private static function authorize( $action ) {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'Sorry, you are not allowed to do that.', 'wunderpaint' ) );
		}
		check_admin_referer( $action );
	}

	/**
	 * Files of one store directory (flat, json + png only).
	 *
	 * @param string $dir Absolute directory.
	 * @return string[] Absolute paths.
	 */
	private static function store_files( $dir ) {
		// Two globs: GLOB_BRACE is unavailable on some builds (Alpine).
		return array_merge(
			glob( $dir . '/*.json' ) ?: array(),
			glob( $dir . '/*.png' ) ?: array()
		);
	}

	/**
	 * POST admin-post.php?action=wpie_backup_export : stream the ZIP.
	 */
	public function export() {
		self::authorize( 'wpie_backup_export' );

		$tmp = self::build_archive(
			! empty( $_POST['keys'] ), // phpcs:ignore WordPress.Security.NonceVerification.Missing
			! empty( $_POST['versions'] ), // phpcs:ignore WordPress.Security.NonceVerification.Missing
			! empty( $_POST['extensions'] ) // phpcs:ignore WordPress.Security.NonceVerification.Missing
		);
		if ( is_wp_error( $tmp ) ) {
			wp_die( esc_html( $tmp->get_error_message() ) );
		}

		nocache_headers();
		header( 'Content-Type: application/zip' );
		header( 'Content-Disposition: attachment; filename="wpie-backup-' . gmdate( 'Ymd-His' ) . '.zip"' );
		header( 'Content-Length: ' . (string) filesize( $tmp ) );
		readfile( $tmp ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_readfile
		wp_delete_file( $tmp );
		exit;
	}

	/**
	 * Build the backup ZIP (also the base for scheduled S3 uploads later).
	 *
	 * @param bool $include_keys       Export API keys as plaintext.
	 * @param bool $include_versions   Include the per-attachment version store.
	 * @param bool $include_extensions Include installed editor extensions.
	 * @return string|\WP_Error Temp file path.
	 */
	public static function build_archive( $include_keys = false, $include_versions = false, $include_extensions = true ) {
		if ( ! class_exists( '\ZipArchive' ) ) {
			return new \WP_Error( 'wpie_no_zip', __( 'The PHP zip extension is required for backups.', 'wunderpaint' ) );
		}
		$tmp = wp_tempnam( 'wpie-backup' );
		$zip = new \ZipArchive();
		if ( true !== $zip->open( $tmp, \ZipArchive::OVERWRITE ) ) {
			return new \WP_Error( 'wpie_zip_open', __( 'Could not create the backup archive.', 'wunderpaint' ) );
		}

		// --- Options ---------------------------------------------------
		$settings = Helpers::get_settings();
		$secrets  = array();
		foreach ( Helpers::secret_fields() as $field ) {
			if ( $include_keys ) {
				// Obfuscation is keyed off the WP salts, so ciphertext is
				// useless on another site: export plaintext by choice.
				$plain = Helpers::deobfuscate( (string) ( $settings[ $field ] ?? '' ) );
				if ( '' !== $plain ) {
					$secrets[ $field ] = $plain;
				}
			}
			unset( $settings[ $field ] );
		}
		$options = array( 'wpie_settings' => $settings );
		if ( $secrets ) {
			$options['secrets_plain'] = $secrets;
		}
		foreach ( self::OPTIONS as $key ) {
			$value = get_option( $key, null );
			if ( null !== $value ) {
				$options[ $key ] = $value;
			}
		}
		$zip->addFromString( 'options.json', (string) wp_json_encode( $options ) );

		// --- Per-user extension stores (studio presets) ------------------
		$ext_store = self::collect_ext_store();
		if ( ! empty( $ext_store['error'] ) ) {
			$zip->close();
			return new \WP_Error( 'wpie_backup_presets', __( 'The studio presets could not be read, so no backup was written.', 'wunderpaint' ) . ' ' . $ext_store['error'] );
		}
		$zip->addFromString( self::EXT_STORE_FILE, (string) wp_json_encode( $ext_store ) );

		// --- Template + design stores -----------------------------------
		$counts = array(
			'templates'  => 0,
			'designs'    => 0,
			'logos'      => 0,
			'fonts'      => 0,
			'models'     => 0,
			'extensions' => 0,
			'versions'   => 0,
			'presets'    => count( $ext_store['entries'] ),
		);
		foreach ( self::store_files( Templates::dir() ) as $file ) {
			$zip->addFile( $file, 'templates/' . basename( $file ) );
			++$counts['templates'];
		}
		foreach ( self::store_files( Projects::dir() ) as $file ) {
			$zip->addFile( $file, 'designs/' . basename( $file ) );
			++$counts['designs'];
		}

		// --- Kit logo + watermark files (attachment ids differ across
		// sites, so the files travel with the archive and get re-imported).
		$logos = array();
		$seen  = array();
		foreach ( Settings::brand_kits( Helpers::get_settings() ) as $kit ) {
			foreach ( array( 'logo', 'watermark' ) as $field ) {
				$id   = (int) ( $kit[ $field ] ?? 0 );
				$path = $id ? get_attached_file( $id ) : '';
				if ( ! $path || ! file_exists( $path ) ) {
					continue;
				}
				$name = 'logos/' . $id . '-' . sanitize_file_name( basename( $path ) );
				if ( empty( $seen[ $name ] ) ) {
					$zip->addFile( $path, $name );
					$seen[ $name ] = true;
				}
				$logos[] = array(
					'kit'   => (string) ( $kit['id'] ?? '' ),
					'field' => $field,
					'id'    => $id,
					'file'  => $name,
				);
				++$counts['logos'];
			}
		}
		$zip->addFromString( 'logos.json', (string) wp_json_encode( $logos ) );

		// --- Uploaded custom fonts (files; the entries live in settings) --
		foreach ( Fonts::custom_fonts() as $font ) {
			$path = Fonts::dir() . '/' . (string) ( $font['file'] ?? '' );
			if ( ! empty( $font['file'] ) && file_exists( $path ) ) {
				$zip->addFile( $path, 'fonts/' . basename( $path ) );
				++$counts['fonts'];
			}
		}

		// --- 3D model library (GLBs; the index option travels above) ------
		$models_ix = get_option( Models_3D::OPTION, array() );
		foreach ( ( is_array( $models_ix ) ? $models_ix : array() ) as $rec ) {
			$file = basename( (string) ( $rec['file'] ?? '' ) );
			$path = trailingslashit( Models_3D::dir() ) . $file;
			if ( '' !== $file && is_file( $path ) ) {
				$zip->addFile( $path, 'models3d/' . $file );
				++$counts['models'];
				$thumb = preg_replace( '/\.glb$/', '.png', $path );
				if ( is_file( $thumb ) ) {
					$zip->addFile( $thumb, 'models3d/' . basename( $thumb ) );
				}
			}
		}

		// --- Installed editor extensions ---------------------------------
		// This plugin has nothing to collect here. The studios it ships live
		// inside the plugin folder and come back with the plugin itself, and
		// it cannot install any others - the whole writing half of the
		// extension manager moved to Pro for the wordpress.org review
		// (see class-extensions.php). A plugin that CAN install packages
		// adds them to the archive through the hook below.
		if ( $include_extensions ) {
			/**
			 * Filters the archive while it is being written.
			 *
			 * Add entries to $zip and count them in $counts. The archive is
			 * still open; do not close it.
			 *
			 * @since 1.392.0
			 *
			 * @param array       $counts Per-section counts shown to the user.
			 * @param \ZipArchive $zip    The open archive.
			 */
			$counts = apply_filters( 'wpie_backup_collect', $counts, $zip );
		}

		// --- Version store (optional, can be huge) -----------------------
		if ( $include_versions ) {
			$meta = array();
			$base = \wpie_versions_dir();
			foreach ( glob( $base . '/*', GLOB_ONLYDIR ) ?: array() as $dir ) {
				$name = basename( $dir );
				if ( ! preg_match( '/^(\d+)-[a-zA-Z0-9]+$/', $name, $m ) ) {
					continue; // templates/, designs/ and strays.
				}
				$att_id = (int) $m[1];
				foreach ( glob( $dir . '/*' ) ?: array() as $file ) {
					if ( is_file( $file ) && 'index.php' !== basename( $file ) ) {
						$zip->addFile( $file, 'versions/' . $name . '/' . basename( $file ) );
						++$counts['versions'];
					}
				}
				$meta[] = array(
					'id'       => $att_id,
					'subdir'   => $name,
					'versions' => get_post_meta( $att_id, Versioning::META_VERSIONS, true ),
					'counter'  => get_post_meta( $att_id, Versioning::META_COUNTER, true ),
					'project'  => get_post_meta( $att_id, Versioning::META_PROJECT, true ),
					'psd'      => get_post_meta( $att_id, Versioning::META_PSD, true ),
				);
			}
			$zip->addFromString( 'versions.json', (string) wp_json_encode( $meta ) );
		}

		$zip->addFromString(
			'manifest.json',
			(string) wp_json_encode(
				array(
					'format'   => self::FORMAT,
					'created'  => gmdate( 'c' ),
					'home'     => home_url(),
					'version'  => WPIE_VERSION,
					'includes' => array(
						'keys'       => $include_keys,
						'versions'   => $include_versions,
						'extensions' => $include_extensions,
					),
					'counts'   => $counts,
				)
			)
		);
		$zip->close();
		return $tmp;
	}

	/**
	 * POST admin-post.php?action=wpie_backup_import : restore an archive.
	 * Replaces the template/design/library stores; settings are merged
	 * (current API keys survive unless the backup carries plaintext keys).
	 */
	public function import() {
		self::authorize( 'wpie_backup_import' );

		$file = $_FILES['backup'] ?? null; // phpcs:ignore WordPress.Security.NonceVerification.Missing,WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- validated below via UPLOAD_ERR_OK + is_uploaded_file(); values are sanitized where used.
		if ( ! $file || UPLOAD_ERR_OK !== (int) ( $file['error'] ?? -1 ) || ! is_uploaded_file( $file['tmp_name'] ) ) {
			self::back( 'error', __( 'No backup file received (check the server upload limit).', 'wunderpaint' ) );
		}

		$zip = new \ZipArchive();
		if ( true !== $zip->open( $file['tmp_name'] ) ) {
			self::back( 'error', __( 'The file is not a readable ZIP archive.', 'wunderpaint' ) );
		}
		$manifest = json_decode( (string) $zip->getFromName( 'manifest.json' ), true );
		$options  = json_decode( (string) $zip->getFromName( 'options.json' ), true );
		if ( ! is_array( $manifest ) || self::FORMAT !== ( $manifest['format'] ?? '' ) || ! is_array( $options ) ) {
			self::back( 'error', __( 'This is not a WunderPaint backup.', 'wunderpaint' ) );
		}

		// --- Options -----------------------------------------------------
		$current  = get_option( WPIE_OPTION, array() );
		$current  = is_array( $current ) ? $current : array();
		$imported = is_array( $options['wpie_settings'] ?? null ) ? $options['wpie_settings'] : array();
		foreach ( Helpers::secret_fields() as $field ) {
			unset( $imported[ $field ] ); // Never trust ciphertext from elsewhere.
		}
		$merged = array_merge( $current, $imported );
		// update_option() runs the registered sanitize callback (admin-post
		// context), and its secret handling treats any non-masked input as a
		// NEW plaintext key. Feeding stored ciphertext through would
		// double-obfuscate and destroy every key: strip secrets entirely
		// (sanitize keeps the stored values) and pass imported keys as
		// plaintext so sanitize obfuscates them exactly once.
		foreach ( Helpers::secret_fields() as $field ) {
			unset( $merged[ $field ] );
		}
		foreach ( (array) ( $options['secrets_plain'] ?? array() ) as $field => $plain ) {
			if ( in_array( $field, Helpers::secret_fields(), true ) && is_string( $plain ) && '' !== $plain ) {
				$merged[ $field ] = $plain;
			}
		}
		// --- Per-user extension stores: to the same login here ---------------
		$presets = self::restore_ext_store( json_decode( (string) $zip->getFromName( self::EXT_STORE_FILE ), true ) );

		// --- Store files first, their index after ---------------------------
		//
		// This used to run the other way round: the option indexes
		// (wpie_templates, wpie_designs, ...) were written FIRST and the files
		// staged afterwards. A store that failed to write kept its old files,
		// as the message promised - under an index that already described
		// the archive's library. "The existing files were left untouched"
		// was true and beside the point: the list the editor shows was
		// already the other one (Codex C09).
		//
		// Now both stores are staged beside their old files; only when BOTH
		// are complete are they swapped in, and only after a clean swap are
		// the indexes written. A staging failure leaves files and index as
		// they were. C09: both swaps now share recovery copies, so a failed
		// design swap also rolls back the templates before keeping the old
		// indexes. Stale files are only removed after both swaps succeed.
		$fehler = array();
		$dirs   = array(
			'templates' => Templates::dir(),
			'designs'   => Projects::dir(),
		);
		$staged = array(
			'templates' => self::stage_store( $zip, 'templates/', $dirs['templates'] ),
			'designs'   => self::stage_store( $zip, 'designs/', $dirs['designs'] ),
		);
		foreach ( $staged as $files ) {
			if ( is_wp_error( $files ) ) {
				$fehler[] = $files->get_error_message();
			}
		}
		$restored = array(
			'templates' => 0,
			'designs'   => 0,
			'models'    => self::restore_models( $zip ),
			'presets'   => $presets['restored'],
		);
		if ( $fehler ) {
			// One store could not even be staged, so the other one's staging
			// goes too: a template store from the archive next to the old
			// design store is not a restore of anything.
			foreach ( $staged as $files ) {
				if ( is_array( $files ) ) {
					foreach ( $files as $tmp ) {
						wp_delete_file( $tmp );
					}
				}
			}
		} else {
			$done = self::commit_stores( $dirs, $staged );
			if ( is_wp_error( $done ) ) {
				$fehler[] = $done->get_error_message();
			} else {
				$restored = array_merge( $restored, $done );
			}
		}
		if ( ! $fehler ) {
			foreach ( self::OPTIONS as $key ) {
				if ( array_key_exists( $key, $options ) ) {
					update_option( $key, $options[ $key ], false );
				}
			}
		}

		// --- Kit logos + watermarks: import files, remap ids by kit -------
		$logos = json_decode( (string) $zip->getFromName( 'logos.json' ), true );
		$kits  = json_decode( (string) ( $merged['brand_kits'] ?? '' ), true );
		$kits  = is_array( $kits ) ? $kits : array();
		if ( is_array( $logos ) ) {
			require_once ABSPATH . 'wp-admin/includes/file.php';
			require_once ABSPATH . 'wp-admin/includes/media.php';
			require_once ABSPATH . 'wp-admin/includes/image.php';
			$imported_files = array();
			foreach ( $logos as $entry ) {
				// Entries without 'field' come from pre-1.137 archives.
				$field = in_array( $entry['field'] ?? 'logo', array( 'logo', 'watermark' ), true ) ? ( $entry['field'] ?? 'logo' ) : 'logo';
				$file  = (string) ( $entry['file'] ?? '' );
				if ( isset( $imported_files[ $file ] ) ) {
					// Same attachment used by several kits/fields.
					$att_id = $imported_files[ $file ];
				} else {
					$data = $zip->getFromName( $file );
					if ( false === $data ) {
						continue;
					}
					$upload = wp_upload_bits( sanitize_file_name( basename( $file ) ), null, $data );
					if ( ! empty( $upload['error'] ) ) {
						continue;
					}
					$att_id = wp_insert_attachment(
						array(
							'post_mime_type' => (string) ( wp_check_filetype( $upload['file'] )['type'] ?? 'image/png' ),
							'post_title'     => 'watermark' === $field ? __( 'Brand watermark', 'wunderpaint' ) : __( 'Brand logo', 'wunderpaint' ),
							'post_status'    => 'inherit',
						),
						$upload['file']
					);
					if ( ! $att_id || is_wp_error( $att_id ) ) {
						continue;
					}
					wp_update_attachment_metadata( $att_id, wp_generate_attachment_metadata( $att_id, $upload['file'] ) );
					$imported_files[ $file ] = (int) $att_id;
				}
				foreach ( $kits as $i => $kit ) {
					if ( (string) ( $kit['id'] ?? '' ) === (string) ( $entry['kit'] ?? '' ) ) {
						$kits[ $i ][ $field ] = (int) $att_id;
					}
				}
			}
			$merged['brand_kits'] = (string) wp_json_encode( $kits );
		}
		// sanitize() unslashes brand_kits because the form delivers it out of
		// $_POST. This value comes from the archive, so it has to be slashed
		// to survive that - otherwise a kit whose text holds a quote is
		// mangled, or json_decode fails and the kit is dropped entirely.
		if ( isset( $merged['brand_kits'] ) && is_string( $merged['brand_kits'] ) ) {
			$merged['brand_kits'] = wp_slash( $merged['brand_kits'] );
		}
		update_option( WPIE_OPTION, $merged );

		// --- Version store (SAME SITE ONLY) -------------------------------
		//
		// Version records key on ATTACHMENT IDS, and an id means nothing across
		// installations: post 512 on the source site is a different image here,
		// or a page. Writing the archive's _wpie_vdir, _wpie_versions,
		// _wpie_vcounter, _wpie_project and _wpie_psd onto whatever happens to
		// carry that id overwrote the target's own history and pointed it at
		// sidecars describing somebody else's picture - and the editor prefers
		// the project over the image, so the next save wrote that stranger's
		// design onto the file. The heading has said "same-site restores" since
		// the beginning; nothing ever checked it. The export writes home_url()
		// into the manifest for exactly this comparison.
		$same_site                    = home_url() === (string) ( $manifest['home'] ?? '' );
		$versions_meta                = $same_site ? json_decode( (string) $zip->getFromName( 'versions.json' ), true ) : null;
		$restored['versions']         = 0;
		$restored['versions_foreign'] = ! $same_site;
		if ( is_array( $versions_meta ) ) {
			$base = \wpie_versions_dir();
			for ( $i = 0; $i < $zip->numFiles; $i++ ) {
				$name = (string) $zip->getNameIndex( $i );
				if ( 0 !== strpos( $name, 'versions/' ) || false !== strpos( $name, '..' ) ) {
					continue;
				}
				$rel = substr( $name, 9 );
				if ( ! preg_match( '#^(\d+)-[a-zA-Z0-9]+/([^/]+)$#', $rel, $m ) ) {
					continue;
				}
				// Every other restore path has an extension allowlist; this one
				// did not, so an archive could drop a .php file straight into the
				// web reachable uploads tree. (F-M07, 2026-07-25 audit)
				if ( ! self::allowed_version_file( $m[2] ) ) {
					continue;
				}
				$target = $base . '/' . dirname( $rel ) . '/' . sanitize_file_name( $m[2] );
				wp_mkdir_p( dirname( $target ) );
				file_put_contents( $target, $zip->getFromIndex( $i ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
				++$restored['versions'];
			}
			foreach ( $versions_meta as $entry ) {
				$att_id = (int) ( $entry['id'] ?? 0 );
				if ( ! $att_id || ! get_post( $att_id ) ) {
					continue;
				}
				// The subdir lands in a path in Versioning::dir_for(). It comes from
				// the archive, so slashes and .. must not survive. The legitimate
				// format is wp_generate_password( 16, false, false ), i.e. plain
				// alphanumerics. (F-M08, 2026-07-25 audit)
				$subdir = preg_replace( '/[^a-zA-Z0-9]/', '', (string) preg_replace( '/^\d+-/', '', (string) ( $entry['subdir'] ?? '' ) ) );
				if ( '' !== $subdir ) {
					update_post_meta( $att_id, Versioning::META_SUBDIR, $subdir );
				}
				update_post_meta( $att_id, Versioning::META_VERSIONS, $entry['versions'] ?? array() );
				update_post_meta( $att_id, Versioning::META_COUNTER, (int) ( $entry['counter'] ?? 1 ) );
				if ( ! empty( $entry['project'] ) ) {
					update_post_meta( $att_id, Versioning::META_PROJECT, (string) $entry['project'] );
				}
				if ( ! empty( $entry['psd'] ) ) {
					update_post_meta( $att_id, Versioning::META_PSD, (string) $entry['psd'] );
				}
			}
		}

		// --- Custom fonts + editor extensions ------------------------------
		$restored['fonts'] = self::restore_fonts( $zip );
		/**
		 * Filters the restore counts while the archive is still open.
		 *
		 * The extension packages in an archive used to be unpacked right
		 * here, straight into uploads. That is a second way for JavaScript
		 * from a file somebody hands you to end up running in the editor,
		 * which is exactly what the wordpress.org review objected to about
		 * the ZIP installer, so it left this plugin with the installer
		 * (2026-08-08). Pro restores them through this hook.
		 *
		 * @since 1.392.0
		 *
		 * @param array       $restored Per-section counts.
		 * @param \ZipArchive $zip      The open archive.
		 */
		$restored = apply_filters( 'wpie_backup_restore', $restored, $zip );

		$zip->close();
		$meldung = sprintf(
			/* translators: 1: templates, 2: designs, 3: version files, 4: extensions, 5: font files, 6: 3D model files, 7: studio presets. */
			__( 'Backup restored: %1$d template files, %2$d design files, %3$d version files, %4$d extensions, %5$d font files, %6$d 3D models, %7$d studio presets.', 'wunderpaint' ),
			(int) $restored['templates'],
			(int) $restored['designs'],
			(int) $restored['versions'],
			(int) $restored['extensions'],
			(int) $restored['fonts'],
			(int) $restored['models'],
			(int) $restored['presets']
		);
		if ( ! empty( $presets['skipped'] ) ) {
			$meldung .= ' ' . sprintf(
				/* translators: %d: number of studio presets. */
				_n( '%d studio preset was left out: its user does not exist here.', '%d studio presets were left out: their users do not exist here.', (int) $presets['skipped'], 'wunderpaint' ),
				(int) $presets['skipped']
			);
		}
		if ( ! empty( $restored['versions_foreign'] ) ) {
			// Saying "0 version files" without saying why reads like a failure.
			$meldung .= ' ' . __( 'The version history was left out: this archive comes from a different site, and its versions belong to attachment IDs that mean something else here.', 'wunderpaint' );
		}
		if ( $fehler ) {
			$meldung .= ' ' . implode( ' ', $fehler );
		}
		self::back( $fehler ? 'error' : 'imported', $meldung );
	}

	/**
	 * The per-user extension stores, keyed by login.
	 *
	 * The login is what identifies a person across two installations; the
	 * numeric id means somebody else on the next site. The id travels along
	 * for the reader only.
	 *
	 * @return array{format:int,entries:array[]}
	 */
	public static function collect_ext_store() {
		global $wpdb;
		$prefix = Extension_Store::META_PREFIX;
		$wpdb->last_error = '';
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- one bounded read at export time, no API lists user meta by prefix.
		$rows = $wpdb->get_results( $wpdb->prepare( "SELECT user_id, meta_key, meta_value FROM {$wpdb->usermeta} WHERE meta_key LIKE %s ORDER BY user_id, meta_key", $wpdb->esc_like( $prefix ) . '%' ) );
		if ( '' !== (string) $wpdb->last_error ) {
			// A failed read must not become an archive that quietly lacks
			// every preset; the export refuses instead.
			return array(
				'format'  => 1,
				'entries' => array(),
				'error'   => (string) $wpdb->last_error,
			);
		}

		$entries = array();
		$logins  = array();
		foreach ( (array) $rows as $row ) {
			$uid = (int) $row->user_id;
			if ( ! isset( $logins[ $uid ] ) ) {
				$user           = get_userdata( $uid );
				$logins[ $uid ] = $user ? (string) $user->user_login : '';
			}
			$value = maybe_unserialize( $row->meta_value );
			if ( '' === $logins[ $uid ] || ! is_array( $value ) ) {
				continue;
			}
			$entries[] = array(
				'login' => $logins[ $uid ],
				'user'  => $uid,
				'ns'    => substr( (string) $row->meta_key, strlen( $prefix ) ),
				'value' => $value,
			);
		}
		return array(
			'format'  => 1,
			'entries' => $entries,
		);
	}

	/**
	 * Put the stores back, each to the user with the same login here.
	 *
	 * A login that does not exist on this site is skipped and counted, never
	 * mapped to somebody else. Every value goes through the store's own
	 * cleaning, byte cap and namespace rules, so an archive cannot plant what
	 * the REST route would refuse.
	 *
	 * @param mixed $data Decoded ext-store.json.
	 * @return array{restored:int,skipped:int}
	 */
	public static function restore_ext_store( $data ) {
		$out = array(
			'restored' => 0,
			'skipped'  => 0,
		);
		if ( ! is_array( $data ) || ! isset( $data['entries'] ) || ! is_array( $data['entries'] ) ) {
			return $out;
		}
		$users  = array();
		$spaces = array();
		foreach ( $data['entries'] as $entry ) {
			$login = is_array( $entry ) ? (string) ( $entry['login'] ?? '' ) : '';
			$ns    = is_array( $entry ) ? (string) ( $entry['ns'] ?? '' ) : '';
			if ( '' === $login || ! preg_match( '/^' . Extension_Store::NS_PATTERN . '$/', $ns ) || ! is_array( $entry['value'] ?? null ) ) {
				++$out['skipped'];
				continue;
			}
			if ( ! array_key_exists( $login, $users ) ) {
				$user            = get_user_by( 'login', $login );
				$users[ $login ] = $user ? (int) $user->ID : 0;
			}
			$uid = $users[ $login ];
			if ( ! $uid ) {
				++$out['skipped'];
				continue;
			}
			$key   = Extension_Store::META_PREFIX . $ns;
			$clean = Extension_Store::clean( $entry['value'] );
			if ( ! is_array( $clean ) || strlen( (string) wp_json_encode( $clean ) ) > Extension_Store::max_bytes( $ns ) ) {
				++$out['skipped'];
				continue;
			}
			// The same namespace ceiling the REST route keeps (WPIE-017).
			if ( ! isset( $spaces[ $uid ] ) ) {
				$spaces[ $uid ] = 0;
				foreach ( array_keys( (array) get_user_meta( $uid ) ) as $meta_key ) {
					if ( 0 === strpos( (string) $meta_key, Extension_Store::META_PREFIX ) ) {
						++$spaces[ $uid ];
					}
				}
			}
			if ( ! metadata_exists( 'user', $uid, $key ) ) {
				if ( $spaces[ $uid ] >= Extension_Store::MAX_NAMESPACES ) {
					++$out['skipped'];
					continue;
				}
				++$spaces[ $uid ];
			}
			update_user_meta( $uid, $key, $clean );
			++$out['restored'];
		}
		return $out;
	}

	/**
	 * Restore 3D model library files: models3d/<id>.glb entries, validated
	 * by name pattern and the GLB magic bytes. The index option is already
	 * restored via OPTIONS; orphaned index rows simply stay unlisted until
	 * their file arrives.
	 *
	 * @param \ZipArchive $zip Archive.
	 * @return int Restored file count.
	 */
	private static function restore_models( $zip ) {
		$count = 0;
		for ( $i = 0; $i < $zip->numFiles; $i++ ) {
			$name = (string) $zip->getNameIndex( $i );
			if ( 0 !== strpos( $name, 'models3d/' ) || false !== strpos( $name, '..' ) ) {
				continue;
			}
			$base = sanitize_file_name( basename( $name ) );
			if ( ! preg_match( '/^[a-z0-9]+\.(glb|png)$/', $base, $m ) ) {
				continue;
			}
			$bytes = (string) $zip->getFromIndex( $i );
			$magic = 'png' === $m[1] ? "\x89PNG" : 'glTF';
			if ( strlen( $bytes ) < 20 || substr( $bytes, 0, 4 ) !== $magic ) {
				continue;
			}
			if ( 'png' === $m[1] ) {
				// Thumbs restore silently alongside their models.
				if ( wp_mkdir_p( Models_3D::dir() ) ) {
					file_put_contents( trailingslashit( Models_3D::dir() ) . $base, $bytes ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
				}
				continue;
			}
			if ( ! wp_mkdir_p( Models_3D::dir() ) ) {
				break;
			}
			file_put_contents( trailingslashit( Models_3D::dir() ) . $base, $bytes ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
			++$count;
		}
		return $count;
	}

	/**
	 * Restore uploaded custom font files (their settings entries arrive
	 * through the merged options, referencing these exact file names).
	 *
	 * @param \ZipArchive $zip Archive.
	 * @return int Restored file count.
	 */
	private static function restore_fonts( $zip ) {
		$count = 0;
		for ( $i = 0; $i < $zip->numFiles; $i++ ) {
			$name = (string) $zip->getNameIndex( $i );
			if ( 0 !== strpos( $name, 'fonts/' ) || false !== strpos( $name, '..' ) ) {
				continue;
			}
			$base = sanitize_file_name( basename( $name ) );
			$ext  = strtolower( (string) pathinfo( $base, PATHINFO_EXTENSION ) );
			if ( '' === $base || ! isset( Fonts::ALLOWED[ $ext ] ) ) {
				continue;
			}
			if ( ! wp_mkdir_p( Fonts::dir() ) ) {
				break;
			}
			file_put_contents( Fonts::dir() . '/' . $base, $zip->getFromIndex( $i ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
			++$count;
		}
		return $count;
	}

	/**
	 * Stage one store's archive entries beside the existing files.
	 *
	 * Writes `<name>.incoming` next to every file that will replace or join
	 * the store, verifies each write by length, and touches nothing that is
	 * already there. The caller swaps them in with commit_store() once EVERY
	 * store is staged: a template store that landed while the design store
	 * failed is as much a broken library as a half-written one.
	 *
	 * @param \ZipArchive $zip    Archive.
	 * @param string      $prefix Entry prefix ('templates/').
	 * @param string      $dir    Target directory.
	 * @return array<string,string>|\WP_Error Staged temp path per file name;
	 *                                        empty when the archive holds
	 *                                        nothing for this store.
	 */
	private static function stage_store( $zip, $prefix, $dir ) {
		$entries = array();
		for ( $i = 0; $i < $zip->numFiles; $i++ ) {
			$name = (string) $zip->getNameIndex( $i );
			if ( 0 !== strpos( $name, $prefix ) || false !== strpos( $name, '..' ) ) {
				continue;
			}
			$base = sanitize_file_name( basename( $name ) );
			if ( ! preg_match( '/\.(json|png)$/', $base ) ) {
				continue;
			}
			$entries[ $base ] = $i;
		}
		if ( ! $entries ) {
			return array();
		}
		// Stage every entry first, then swap. The store used to be emptied
		// BEFORE the first write, and every write went unchecked: a full disk
		// half way through left the old templates deleted, the new ones half
		// there, and the notice said "restored". Now nothing existing goes
		// until every new file is complete beside it.
		if ( ! wp_mkdir_p( $dir ) ) {
			return new \WP_Error( 'wpie_restore_dir', sprintf( /* translators: %s: directory */ __( 'Could not create %s; the existing files were left untouched.', 'wunderpaint' ), basename( $dir ) ) );
		}
		$staged = array();
		foreach ( $entries as $base => $i ) {
			$bytes = $zip->getFromIndex( $i );
			$tmp   = $dir . '/' . $base . '.incoming';
			if ( false === $bytes || strlen( $bytes ) !== @file_put_contents( $tmp, $bytes ) ) { // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents, WordPress.PHP.NoSilencedErrors.Discouraged
				foreach ( $staged as $done ) {
					wp_delete_file( $done );
				}
				if ( file_exists( $tmp ) ) {
					wp_delete_file( $tmp );
				}
				return new \WP_Error( 'wpie_restore_write', sprintf( /* translators: 1: file name, 2: directory */ __( 'Could not write %1$s; the existing files in %2$s were left untouched.', 'wunderpaint' ), $base, basename( $dir ) ) );
			}
			$staged[ $base ] = $tmp;
		}
		return $staged;
	}

	/**
	 * Swap one store using the same rollback as a full library restore.
	 *
	 * @param string $dir Target directory.
	 * @param array  $staged From stage_store().
	 * @return int|\WP_Error Number of files, or the error.
	 */
	private static function commit_store( $dir, $staged ) {
		$result = self::commit_stores( array( 'store' => $dir ), array( 'store' => $staged ) );
		return is_wp_error( $result ) ? $result : $result['store'];
	}

	/**
	 * Commit both libraries together; retain recovery copies until all file
	 * operations succeed. C09: a later store must not strand an earlier store
	 * under its old index. Empty stores retain the existing merge behavior.
	 *
	 * @param array $dirs Target directories keyed by store.
	 * @param array $staged Staged file maps keyed by store.
	 * @return array|\WP_Error Counts by store, or the error.
	 */
	private static function commit_stores( $dirs, $staged ) {
		$previous = array();
		$changed  = array();
		$counts   = array_fill_keys( array_keys( $staged ), 0 );
		$error    = null;
		$token    = wp_generate_uuid4();

		// Copy before any mutation, including the stale files that will be
		// pruned. A failed copy must never replace an existing library file.
		foreach ( $staged as $store => $files ) {
			if ( ! $files ) {
				continue;
			}
			foreach ( self::store_files( $dirs[ $store ] ) as $file ) {
				if ( is_dir( $file ) ) {
					continue;
				}
				$copy = $file . '.previous-' . $token;
				if ( ! @copy( $file, $copy ) || filesize( $file ) !== filesize( $copy ) || ! @chmod( $copy, fileperms( $file ) & 0777 ) ) { // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_chmod -- the recovery copy keeps the mode of the file it stands in for, inside our own uploads tree; WP_Filesystem would require credentials on some hosts, and the copy has to exist before anything is swapped.
					wp_delete_file( $copy );
					$error = new \WP_Error( 'wpie_restore_copy', __( 'The previous version could not be stored, so the files were left untouched.', 'wunderpaint' ) );
					break 2;
				}
				$previous[ $file ] = $copy;
			}
		}

		if ( ! $error ) {
			foreach ( $staged as $store => $files ) {
				foreach ( $files as $base => $tmp ) {
					$file = $dirs[ $store ] . '/' . $base;
					if ( ! @rename( $tmp, $file ) ) { // phpcs:ignore WordPress.WP.AlternativeFunctions.rename_rename, WordPress.PHP.NoSilencedErrors.Discouraged
						$error = new \WP_Error( 'wpie_restore_swap', sprintf( /* translators: 1: file names, 2: directory */ __( 'Could not put %1$s in place in %2$s; the files already there were kept and the library index was not changed.', 'wunderpaint' ), $base, basename( $dirs[ $store ] ) ) );
						break 2;
					}
					$changed[] = $file;
					++$counts[ $store ];
				}
			}
		}

		if ( ! $error ) {
			foreach ( $staged as $store => $files ) {
				if ( ! $files ) {
					continue;
				}
				foreach ( self::store_files( $dirs[ $store ] ) as $file ) {
					if ( ! isset( $files[ basename( $file ) ] ) ) {
						wp_delete_file( $file );
						if ( file_exists( $file ) ) {
							$error = new \WP_Error( 'wpie_restore_prune', sprintf( /* translators: 1: file names, 2: directory */ __( 'Could not put %1$s in place in %2$s; the files already there were kept and the library index was not changed.', 'wunderpaint' ), basename( $file ), basename( $dirs[ $store ] ) ) );
							break 2;
						}
						$changed[] = $file;
					}
				}
			}
		}

		$recovery = array();
		if ( $error ) {
			foreach ( array_reverse( $changed ) as $file ) {
				if ( isset( $previous[ $file ] ) ) {
					if ( ! @rename( $previous[ $file ], $file ) ) { // phpcs:ignore WordPress.WP.AlternativeFunctions.rename_rename, WordPress.PHP.NoSilencedErrors.Discouraged
						$recovery[] = $previous[ $file ];
					}
				} else {
					wp_delete_file( $file );
					if ( file_exists( $file ) ) {
						$recovery[] = $file;
					}
				}
			}
		}
		foreach ( $previous as $copy ) {
			if ( ! in_array( $copy, $recovery, true ) && file_exists( $copy ) ) {
				wp_delete_file( $copy );
			}
		}
		foreach ( $staged as $files ) {
			foreach ( $files as $tmp ) {
				if ( file_exists( $tmp ) ) {
					wp_delete_file( $tmp );
				}
			}
		}
		if ( $recovery ) {
			return new \WP_Error( 'wpie_restore_rollback', sprintf( /* translators: %s: paths requiring manual recovery */ __( 'The restore could not be rolled back completely. Check these recovery paths: %s', 'wunderpaint' ), implode( ', ', $recovery ) ) );
		}
		return $error ?: $counts;
	}

	/**
	 * Redirect back to the Backup tab with a notice.
	 *
	 * @param string $status 'imported' | 'error'.
	 * @param string $msg    Human message.
	 */
	private static function back( $status, $msg ) {
		wp_safe_redirect(
			add_query_arg(
				array(
					'page'        => WPIE_SETTINGS_SLUG,
					'wpie-backup' => $status,
					'wpie-msg'    => rawurlencode( $msg ),
				),
				admin_url( 'options-general.php' )
			) . '#wpie-tab-backup'
		);
		exit;
	}

	/**
	 * May a file from the version store of a backup archive be written to disk?
	 *
	 * The version directory lives under uploads and is served by the web
	 * server, so only inert media and project data belong there. Server
	 * executable extensions and dotfiles such as .htaccess or .user.ini are
	 * rejected outright, and a double extension like `x.php.png` is rejected as
	 * well because some server configurations still hand it to the PHP handler.
	 * (F-M07, 2026-07-25 audit)
	 *
	 * @param string $filename File name from the archive entry, no directory part.
	 * @return bool
	 */
	public static function allowed_version_file( $filename ) {
		$name = trim( (string) $filename );
		if ( '' === $name || '.' === $name[0] || $name !== basename( $name ) ) {
			return false;
		}
		// Deliberately no svg: it would sit web reachable under uploads and is
		// active content in the browser.
		$allowed = array( 'json', 'png', 'jpg', 'jpeg', 'webp', 'avif', 'psd', 'gif', 'bmp' );
		$parts   = explode( '.', strtolower( $name ) );
		if ( count( $parts ) < 2 ) {
			return false;
		}
		array_shift( $parts );
		// Check EVERY extension segment, not just the last one.
		foreach ( $parts as $ext ) {
			if ( ! in_array( $ext, $allowed, true ) ) {
				return false;
			}
		}
		return true;
	}

}
